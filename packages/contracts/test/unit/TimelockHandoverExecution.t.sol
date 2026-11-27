// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { Roles } from "../../src/interfaces/Roles.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

contract MockSafeProposer { }

contract MockSafeGuardian { }

/**
 * @title TimelockHandoverExecutionTest
 * @notice Validates the exact mathematical and on-chain lifecycle of the Timelock Handover:
 *         1. Vault role_manager begins at deployer, future_role_manager is Timelock (48h delay).
 *         2. Proposal schedule of `accept_role_manager()` on TimelockController.
 *         3. Strict enforcement: execute reverts prior to the 48h delay.
 *         4. Timestamp warp (+48 hours): operation becomes READY.
 *         5. Execution succeeds: role_manager transitions 100% to TimelockController.
 *         6. Post-handover invariant checks (deployer has 0 roles, future_role_manager is 0).
 */
contract TimelockHandoverExecutionTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    Deploy internal deployer;
    MockERC20 internal usdg;
    MockVenue internal venue;

    MockSafeProposer internal govSafe;
    MockSafeGuardian internal guardianSafe;

    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal management = makeAddr("management");

    uint256 internal constant TIMELOCK_DELAY = 48 hours;

    function setUp() public {
        deployer = new Deploy();
        govSafe = new MockSafeProposer();
        guardianSafe = new MockSafeGuardian();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        MockYearnFactory factory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(factory));
        vm.etch(TS_IMPL, address(template).code);
    }

    function _config() internal view returns (Deploy.Config memory cfg) {
        cfg = Deploy.Config({
            mode: Deploy.Mode.DryRun,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue),
            timelock: address(0),
            proposer: address(govSafe),
            guardian: address(guardianSafe),
            keeper: keeper,
            treasury: treasury,
            management: address(0),
            maxDebt: 250_000e6,
            minimumTotalIdle: 1_000e6,
            seedAssets: 0,
            vaultName: "Avenor USDG Managed Vault",
            vaultSymbol: "avUSDG",
            strategyName: "Avenor USDG steakUSDG",
            factoryName: "Avenor Vault Factory",
            placeholdersUsed: false,
            gitRev: "",
            feeRecipient: treasury,
            performanceFee: 1_000,
            managementFee: 0,
            refundRatio: 0,
            maxFee: 0,
            maxGain: 500,
            maxLoss: 200
        });
    }

    function test_timelockHandoverFullExecutionLifecycle() public {
        // 1. Deploy all contracts
        Deploy.Deployment memory d = deployer.deployAll(_config());
        IVaultV3 vault = IVaultV3(d.vault);
        TimelockController timelock = TimelockController(payable(d.timelock));

        // Initial state assertions
        assertEq(vault.role_manager(), address(deployer), "initial role_manager is deployer");
        assertEq(vault.future_role_manager(), d.timelock, "future_role_manager is timelock");
        assertEq(vault.roles(address(deployer)), 0, "deployer has 0 roles");

        // 2. Prepare accept_role_manager() call
        bytes memory data = abi.encodeWithSelector(vault.accept_role_manager.selector);
        bytes32 predecessor = bytes32(0);
        bytes32 salt = bytes32(0);

        bytes32 opId = timelock.hashOperation(d.vault, 0, data, predecessor, salt);

        // 3. Schedule via Governance Safe (proposer)
        vm.prank(address(govSafe));
        timelock.schedule(d.vault, 0, data, predecessor, salt, TIMELOCK_DELAY);

        assertTrue(timelock.isOperation(opId), "operation is registered");
        assertTrue(timelock.isOperationPending(opId), "operation is pending");
        assertFalse(timelock.isOperationReady(opId), "operation is not ready yet");
        assertFalse(timelock.isOperationDone(opId), "operation is not done");

        // 4. Verify early execution reverts
        vm.warp(block.timestamp + 24 hours); // Only halfway
        assertFalse(timelock.isOperationReady(opId), "operation is not ready at 24h");

        vm.expectRevert();
        vm.prank(address(govSafe));
        timelock.execute(d.vault, 0, data, predecessor, salt);

        // 5. Warp to exact maturity (+48 hours from schedule)
        vm.warp(block.timestamp + 24 hours + 1 seconds);
        assertTrue(timelock.isOperationReady(opId), "operation is ready at 48h");

        // 6. Execute operation via Governance Safe (executor)
        vm.prank(address(govSafe));
        timelock.execute(d.vault, 0, data, predecessor, salt);

        // 7. Verify post-execution invariants
        assertTrue(timelock.isOperationDone(opId), "operation is done");
        assertFalse(timelock.isOperationPending(opId), "operation is no longer pending");

        assertEq(vault.role_manager(), d.timelock, "role_manager is now TimelockController!");
        assertEq(vault.future_role_manager(), address(0), "future_role_manager is cleared");

        // Safety invariant: Timelock holds governance roles, deployer has 0
        assertEq(
            vault.roles(d.timelock), Roles.governanceRoleSet(), "timelock has governanceRoleSet"
        );
        assertEq(vault.roles(address(deployer)), 0, "deployer remains at 0 roles");
    }
}
