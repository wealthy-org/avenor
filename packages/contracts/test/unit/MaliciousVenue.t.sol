// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { ITokenizedStrategy } from "tokenized-strategy/interfaces/ITokenizedStrategy.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { MorphoVaultStrategy } from "../../src/strategies/MorphoVaultStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

/// @notice Ticket 3.4 / `SECURITY_DIFF.md` T1: prove that a venue which pays *more* than asked,
///         or lies about what it paid, cannot make `VaultV3` wrap an `unsafe_sub`.
///
/// @dev The path under test is `VaultV3._withdraw` (`VaultV3.vy:875-900`):
///
///        withdrawn := real USDG balance delta of the vault
///        if withdrawn > assets_to_withdraw:
///            assets_to_withdraw = current_debt if that is smaller, else += (withdrawn - asked)
///        elif withdrawn < assets_to_withdraw:
///            loss = assets_to_withdraw - withdrawn
///        current_total_idle += assets_to_withdraw - loss
///
///      `loss` is therefore always ≤ `assets_to_withdraw` by construction, and the vault never
///      reads `strategy.withdraw`'s return value. The only way to get a wrapped number is to
///      break one of those two facts, so the tests break each in turn.
contract MaliciousVenueTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;
    uint256 internal constant DEPOSIT = 1_000_000e6;

    Deploy internal deployer;
    Deploy.Deployment internal d;
    MockERC20 internal usdg;
    MockVenue internal venue;
    IVaultV3 internal vault;
    MorphoVaultStrategy internal strategy;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal user = makeAddr("user");

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        MockYearnFactory yearnFactory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(yearnFactory));
        vm.etch(TS_IMPL, address(template).code);

        Deploy.Config memory cfg = Deploy.Config({
            mode: Deploy.Mode.DryRun,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue),
            timelock: address(0),
            proposer: address(deployer),
            guardian: guardian,
            keeper: keeper,
            treasury: treasury,
            management: address(0),
            maxDebt: DEPOSIT,
            minimumTotalIdle: 0,
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

        d = deployer.deployAll(cfg);
        vault = IVaultV3(d.vault);
        strategy = MorphoVaultStrategy(d.strategy);

        vm.prank(d.timelock);
        vault.set_deposit_limit(type(uint256).max);

        usdg.mint(user, DEPOSIT);
        vm.startPrank(user);
        usdg.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, user);
        vm.stopPrank();

        vm.prank(keeper);
        vault.update_debt(d.strategy, DEPOSIT);
        vm.warp(vm.getBlockTimestamp() + 1);
    }

    /// @notice The venue hands back 20.000 more than the strategy asked for. The extra is real
    ///         cash, so it must behave like a gain — never like a reason to credit the vault with
    ///         more idle than it received, and never like a negative debt.
    function test_venuePayingMoreThanRequestedBecomesAGainNotAWrappedBalance() public {
        uint256 pull = DEPOSIT / 2;
        uint256 overpay = 20_000e6;
        venue.setOverpayWithdraw(overpay);

        // `update_debt` takes the *new* debt, so the amount pulled is `DEPOSIT - pull`.
        vm.prank(keeper);
        vault.update_debt(d.strategy, DEPOSIT - pull, 200);

        // The vault credited itself exactly what its balance grew by: 500.000, not 520.000.
        assertEq(vault.totalIdle(), pull, "idle credited exactly the requested amount");
        assertEq(usdg.balanceOf(d.vault), pull, "no untracked cash in the vault");
        assertEq(vault.totalDebt(), pull, "debt reduced by exactly the request");
        assertEq(vault.totalAssets(), DEPOSIT, "identity holds; nothing was inflated");

        // The overpayment stayed inside the strategy as loose USDG, so the strategy is worth
        // more than its debt. That difference is a gain the next report can book.
        assertEq(usdg.balanceOf(d.strategy), overpay, "surplus sits in the strategy");
        assertEq(strategy.totalAssetsIncludingIdle(), pull + overpay, "strategy value > debt");

        // `TokenizedStrategy` latches its totals for the block an accrual happened in, so the
        // gain only becomes visible from the next block (documented in its `totalAssets` natspec).
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(keeper);
        (uint256 gain, uint256 loss) = vault.process_report(d.strategy);
        assertEq(loss, 0, "no phantom loss");
        assertEq(gain, overpay, "surplus reported as gain");

        // 4% of a 500.000 debt is inside `maxGain = 500` bps, and the identity still holds with
        // the gain booked: assets = idle 500.000 + debt 520.000.
        assertEq(vault.totalAssets(), DEPOSIT + overpay);
        assertEq(vault.totalAssets(), vault.totalIdle() + vault.totalDebt());
        assertEq(vault.totalIdle(), pull, "idle never wrapped upwards");
    }

    /// @notice The venue answers with a number in the wrong unit (18-decimal shares, 1e12× the
    ///         assets it paid). The adapter measures the balance delta, so the lie is inert.
    function test_absurdReturnValueCannotChangeTheAccounting() public {
        venue.setWithdrawReturnsShares(true);
        uint256 pull = DEPOSIT / 3;

        vm.prank(keeper);
        vault.update_debt(d.strategy, DEPOSIT - pull, 200);

        assertEq(vault.totalIdle(), pull, "credited from the balance delta");
        assertEq(usdg.balanceOf(d.vault), pull);
        assertEq(vault.totalAssets(), DEPOSIT);
    }

    /// @notice The dangerous direction: the venue can pay less than asked, and the vault must
    ///         not invent an asset it did not receive.
    ///
    /// @dev Measured behaviour, not the hoped-for one. `VaultV3._withdraw_from_strategy`
    ///      (`VaultV3.vy:744`) calls `IStrategy.redeem(shares, self, self)`, and
    ///      `TokenizedStrategy` clamps the payout to `availableWithdrawLimit`; the vault then
    ///      reduces debt by the amount it *actually* received
    ///      (`withdrawn = min(post - pre, current_debt)`, `VaultV3.vy:1064`). So an illiquid pull
    ///      is not a loss and not a revert: less debt moves, the remaining position still backs
    ///      the remaining debt, and the identity holds. Proving it needs the follow-up pull,
    ///      because "nothing was lost" is only credible if the rest comes back later.
    function test_illiquidPullMovesLessDebtAndTheRestFollowsWhenLiquidityReturns() public {
        uint256 pull = DEPOSIT / 2;
        uint256 shortfall = 10_000e6;

        venue.setTokensAvailable(pull - shortfall);
        vm.prank(keeper);
        vault.update_debt(d.strategy, DEPOSIT - pull, 200);

        // Exactly the cash that moved was credited as idle, and debt shrank by that same amount
        // — not by the 500.000 that was asked for. No phantom asset, no wrapped subtraction.
        assertEq(vault.totalIdle(), pull - shortfall, "idle = real balance delta");
        assertEq(usdg.balanceOf(d.vault), pull - shortfall);
        assertEq(vault.totalDebt(), DEPOSIT - (pull - shortfall), "debt tracks what moved");
        assertEq(vault.totalAssets(), DEPOSIT, "accounting total unchanged: nothing was lost");
        assertEq(vault.totalAssets(), vault.totalIdle() + vault.totalDebt());

        // Liquidity returns; the rest of the credit line is pullable at the same price.
        venue.setTokensAvailable(10_000_000e6);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(keeper);
        vault.update_debt(d.strategy, 0, 200);

        assertEq(vault.totalDebt(), 0, "credit line fully unwound");
        assertEq(vault.totalAssets(), DEPOSIT, "principal intact through the whole cycle");
        assertEq(vault.totalAssets(), vault.totalIdle() + vault.totalDebt());
        assertEq(usdg.balanceOf(d.vault), DEPOSIT);
    }

    /// @notice The one case where `_withdraw`'s `unsafe_sub` branch is reachable:
    ///         `withdrawn > assets_to_withdraw` *and* `withdrawn > current_debt`. The vault caps
    ///         `assets_to_withdraw` at `current_debt` (`VaultV3.vy:885-887`), so the excess is
    ///         not credited at all. Proving it needs a strategy whose whole debt is smaller than
    ///         the overpayment, so the test drains the credit line first.
    function test_overpaymentLargerThanTheRemainingDebtIsCappedNotWrapped() public {
        // Push almost everything back to the vault, leaving a 1.000 credit line at the venue.
        vm.prank(keeper);
        vault.update_debt(d.strategy, 1_000e6, 200);

        // Now the venue over-delivers 5.000 on a 1.000 debt: withdrawn > current_debt.
        venue.setOverpayWithdraw(5_000e6);
        vm.prank(keeper);
        vault.update_debt(d.strategy, 0, 200);

        // Debt floors at zero — it does not wrap to `type(uint256).max - x`.
        assertEq(vault.totalDebt(), 0, "debt floored at zero");
        // Idle grows only by the debt it cleared, so the 5.000 surplus is real but untracked
        // until a report books it. The identity must still hold.
        assertEq(vault.totalIdle(), DEPOSIT - 0, "everything the vault actually holds is idle");
        assertEq(vault.totalAssets(), vault.totalIdle() + vault.totalDebt());
        assertLe(vault.totalAssets(), usdg.balanceOf(d.vault) + usdg.balanceOf(d.strategy));
    }
}
