// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { IAccountant } from "../../src/interfaces/IAccountant.sol";
import { MorphoVaultStrategy } from "../../src/strategies/MorphoVaultStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

interface IStrategyWiring {
    function setPerformanceFee(
        uint16
    ) external;
    function setProfitMaxUnlockTime(
        uint256
    ) external;
    function setPerformanceFeeRecipient(
        address
    ) external;
    function setKeeper(
        address
    ) external;
}

/// @title MultiStrategyAllocationTest
/// @notice Fulfills Brief §16 Tahap D & §7.3 (Multistrategy Delivery & Acceptance).
///         Proves:
///           1. Two independent valid strategies added to Vault V3 allocator
///           2. Independent credit lines (max_debt) and debt allocation (totalDebt = sum(debt_i))
///           3. Reallocation of capital between Strategy 1 and Strategy 2
///           4. Cascading withdrawal queue: pulls from idle -> Strategy 1 -> Strategy 2 in queue order
///           5. Multi-strategy profit reporting and accounting reconciliation
contract MultiStrategyAllocationTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    uint256 internal constant VAULT_CAP = 1_000_000e6;
    uint256 internal constant USER_DEPOSIT = 200_000e6;

    Deploy internal deployer;
    MockERC20 internal usdg;
    MockVenue internal venue1;
    MockVenue internal venue2;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal timelock = makeAddr("timelock");
    address internal user = makeAddr("user");

    IVaultV3 internal vault;
    IAccountant internal accountant;
    MorphoVaultStrategy internal strategy1;
    MorphoVaultStrategy internal strategy2;

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue1 = new MockVenue(address(usdg));
        venue2 = new MockVenue(address(usdg));

        MockYearnFactory yearnFactory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(yearnFactory));
        vm.etch(TS_IMPL, address(template).code);

        Deploy.Config memory cfg = Deploy.Config({
            mode: Deploy.Mode.DryRun,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue1),
            timelock: timelock,
            proposer: timelock,
            guardian: guardian,
            keeper: keeper,
            treasury: treasury,
            management: address(0),
            maxDebt: VAULT_CAP,
            minimumTotalIdle: 0,
            seedAssets: 0,
            vaultName: "Avenor Multi-Strategy Vault",
            vaultSymbol: "avUSDG",
            strategyName: "Avenor Morpho Primary",
            factoryName: "Avenor Vault Factory",
            placeholdersUsed: false,
            gitRev: "multistrategy-tahap-d",
            feeRecipient: treasury,
            performanceFee: 1_000,
            managementFee: 0,
            refundRatio: 0,
            maxFee: 0,
            maxGain: 500,
            maxLoss: 200
        });

        Deploy.Deployment memory d = deployer.deployAll(cfg);
        vault = IVaultV3(d.vault);
        accountant = IAccountant(d.accountant);
        strategy1 = MorphoVaultStrategy(d.strategy);

        // Deploy second strategy pointing to venue2
        strategy2 =
            new MorphoVaultStrategy(address(usdg), address(venue2), "Avenor Morpho Secondary");

        // Wire strategy2 to zero performance fee per Avenor FEE_CONFIG (fees handled by Accountant)
        IStrategyWiring(address(strategy2)).setPerformanceFee(0);
        IStrategyWiring(address(strategy2)).setProfitMaxUnlockTime(0);
        IStrategyWiring(address(strategy2)).setPerformanceFeeRecipient(treasury);
        IStrategyWiring(address(strategy2)).setKeeper(keeper);

        // Timelock adds strategy2 to vault, sets max_debt, and configures default queue
        vm.startPrank(timelock);
        vault.set_deposit_limit(VAULT_CAP);
        vault.add_strategy(address(strategy2));
        vault.update_max_debt_for_strategy(address(strategy1), 500_000e6);
        vault.update_max_debt_for_strategy(address(strategy2), 500_000e6);

        address[] memory queue = new address[](2);
        queue[0] = address(strategy1);
        queue[1] = address(strategy2);
        vault.set_default_queue(queue);
        vm.stopPrank();

        // Fund user
        usdg.mint(user, USER_DEPOSIT);
        vm.prank(user);
        usdg.approve(address(vault), USER_DEPOSIT);
        vm.prank(user);
        vault.deposit(USER_DEPOSIT, user);
    }

    /// @notice Proves concurrent allocation and debt reconciliation across multiple strategies (Tahap D)
    function test_multi_strategy_allocation_and_reconciliation() public {
        uint256 alloc1 = 80_000e6;
        uint256 alloc2 = 60_000e6;

        // Keeper allocates to Strategy 1
        vm.prank(keeper);
        vault.update_debt(address(strategy1), alloc1);

        // Keeper allocates to Strategy 2
        vm.prank(keeper);
        vault.update_debt(address(strategy2), alloc2);

        // Assert debt reconciliation: totalDebt == debt1 + debt2
        assertEq(
            vault.strategies(address(strategy1)).current_debt, alloc1, "Strategy 1 debt correct"
        );
        assertEq(
            vault.strategies(address(strategy2)).current_debt, alloc2, "Strategy 2 debt correct"
        );
        assertEq(vault.totalDebt(), alloc1 + alloc2, "Vault totalDebt equals sum of strategies");
        assertEq(vault.totalIdle(), USER_DEPOSIT - (alloc1 + alloc2), "Idle matches remainder");
        assertEq(venue1.totalAssets(), alloc1, "Venue 1 holds Strategy 1 assets");
        assertEq(venue2.totalAssets(), alloc2, "Venue 2 holds Strategy 2 assets");
    }

    /// @notice Proves capital reallocation from Strategy 1 to Strategy 2
    function test_multi_strategy_reallocation() public {
        // Initial allocation: 100k to Strategy 1, 0 to Strategy 2
        vm.startPrank(keeper);
        vault.update_debt(address(strategy1), 100_000e6);
        assertEq(vault.strategies(address(strategy1)).current_debt, 100_000e6);
        assertEq(vault.strategies(address(strategy2)).current_debt, 0);

        // Reallocate: Pull 40k back from Strategy 1 (current debt -> 60k)
        vault.update_debt(address(strategy1), 60_000e6);
        assertEq(vault.strategies(address(strategy1)).current_debt, 60_000e6);

        // Deploy the freed capital to Strategy 2: 40k
        vault.update_debt(address(strategy2), 40_000e6);
        assertEq(vault.strategies(address(strategy2)).current_debt, 40_000e6);
        vm.stopPrank();

        // Total debt is preserved at 100k
        assertEq(vault.totalDebt(), 100_000e6, "Total debt preserved during reallocation");
        assertEq(venue1.totalAssets(), 60_000e6, "Venue 1 balance adjusted");
        assertEq(venue2.totalAssets(), 40_000e6, "Venue 2 balance adjusted");
    }

    /// @notice Proves cascading queue withdrawal: exhausts idle, then exhausts Strategy 1, then pulls from Strategy 2
    function test_multi_strategy_cascading_queue_withdrawal() public {
        // Deposit = 200k
        // Allocate 70k to Strategy 1, 70k to Strategy 2, 60k stays idle
        vm.startPrank(keeper);
        vault.update_debt(address(strategy1), 70_000e6);
        vault.update_debt(address(strategy2), 70_000e6);
        vm.stopPrank();

        assertEq(vault.totalIdle(), 60_000e6, "Idle is 60k");

        // User requests withdrawal of 150k USDG
        // 1. Vault uses all 60k idle (0 idle left, 90k needed)
        // 2. Vault goes to queue[0] (Strategy 1): pulls all 70k from Strategy 1 (0 debt left, 20k needed)
        // 3. Vault goes to queue[1] (Strategy 2): pulls remaining 20k from Strategy 2 (50k debt left)
        uint256 withdrawAmount = 150_000e6;
        vm.prank(user);
        uint256 sharesBurned = vault.withdraw(withdrawAmount, user, user, 0);

        assertTrue(sharesBurned > 0, "Shares burned for withdrawal");
        assertEq(vault.totalIdle(), 0, "All idle exhausted");
        assertEq(
            vault.strategies(address(strategy1)).current_debt,
            0,
            "Strategy 1 fully liquidated in queue"
        );
        assertEq(
            vault.strategies(address(strategy2)).current_debt,
            50_000e6,
            "Strategy 2 partially drawn down to 50k"
        );
        assertEq(vault.totalDebt(), 50_000e6, "Remaining vault debt is 50k");
        assertEq(usdg.balanceOf(user), withdrawAmount, "User received exact 150k USDG payout");
    }

    /// @notice Proves multi-strategy yield reports with accounting reconciliation
    function test_multi_strategy_independent_yield_reports() public {
        vm.startPrank(keeper);
        vault.update_debt(address(strategy1), 50_000e6);
        vault.update_debt(address(strategy2), 50_000e6);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);

        // Venue 1 earns 1,000 USDG yield; Venue 2 earns 1,500 USDG yield
        uint256 gain1 = 1_000e6;
        uint256 gain2 = 1_500e6;
        venue1.setTotalAssets(50_000e6 + gain1);
        usdg.mint(address(venue1), gain1);

        venue2.setTotalAssets(50_000e6 + gain2);
        usdg.mint(address(venue2), gain2);

        // Keeper reports Strategy 1
        vm.prank(keeper);
        (uint256 g1, uint256 l1) = vault.process_report(address(strategy1));
        assertEq(g1, gain1, "Strategy 1 gain reported");
        assertEq(l1, 0);

        // Keeper reports Strategy 2
        vm.prank(keeper);
        (uint256 g2, uint256 l2) = vault.process_report(address(strategy2));
        assertEq(g2, gain2, "Strategy 2 gain reported");
        assertEq(l2, 0);

        // Total assets now reflects both gains (200k + 1k + 1.5k = 202.5k)
        assertEq(
            vault.totalAssets(),
            USER_DEPOSIT + gain1 + gain2,
            "Total assets reflects both strategy gains"
        );
    }
}
