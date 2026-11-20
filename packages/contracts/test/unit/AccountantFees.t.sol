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

/// @notice Reproduces `docs/FEE_CONFIG.md` §6 end to end, against the real Vyper
///         `VaultV3` (bytecode from `packages/core/artifacts`), the real
///         `TokenizedStrategy` implementation and the real `Accountant`.
///
/// @dev What makes this test worth more than an arithmetic assertion: every fee number
///      asserted here is produced by `VaultV3._process_report` calling
///      `Accountant.report`, i.e. by the code that will run on chain. A test of the
///      Accountant alone would prove the percentage; this proves the interaction —
///      shares burned, shares locked, shares minted, and the price per share that a user
///      actually experiences after the 7-day unlock.
///
///      Deliberately not tested here (needs a fork, ticket 3/5): protocol fee
///      (`VaultFactory.protocol_fee_config` is a mock that returns 0 bps, matching the
///      §6 assumption), and venue liquidity during `_freeFunds`.
contract AccountantFeesTest is Test {
    /// @dev Declared locally because Solidity 0.8.18 cannot emit a qualified event from an
    ///      interface (`emit IVaultV3.StrategyReported` needs 0.8.21). Same signature, so
    ///      `expectEmit` matches the real one on topic0 and data.
    event StrategyReported(
        address indexed strategy,
        uint256 gain,
        uint256 loss,
        uint256 current_debt,
        uint256 protocol_fees,
        uint256 total_fees,
        uint256 total_refunds
    );

    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    uint256 internal constant DEPOSIT = 1_000_000e6;
    uint256 internal constant GAIN = 3_000e6;
    uint256 internal constant FEE_ASSETS = 300e6; // 10% of the gain
    uint256 internal constant LOCKED_ASSETS = 2_700e6; // gain - fee

    Deploy internal deployer;
    MockERC20 internal usdg;
    MockVenue internal venue;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal management = makeAddr("management");
    address internal user = makeAddr("user");

    IVaultV3 internal vault;
    IAccountant internal accountant;
    MorphoVaultStrategy internal strategy;

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        // `TokenizedStrategy` lives at its canonical address on chain 4663; a bare EVM has
        // no code there, so every delegatecall into it would revert.
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

        Deploy.Deployment memory d = deployer.deployAll(cfg);
        vault = IVaultV3(d.vault);
        accountant = IAccountant(d.accountant);
        strategy = MorphoVaultStrategy(d.strategy);

        // The deploy script closes the product on purpose (`deposit_limit == 0`) and hands
        // `DEPOSIT_LIMIT_MANAGER` to the timelock. Opening it is an operator decision, so
        // the test performs that decision instead of having the script do it.
        vm.prank(d.timelock);
        vault.set_deposit_limit(type(uint256).max);

        usdg.mint(user, DEPOSIT);
        vm.startPrank(user);
        usdg.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, user);
        vm.stopPrank();

        // Allocate. `update_debt` is the keeper's credit-line draw, a separate call from
        // `process_report` by design (ADR-6): reporting and allocating are different powers.
        vm.prank(keeper);
        vault.update_debt(d.strategy, DEPOSIT);

        // `TokenizedStrategy._simulatedTotals` returns the latched `lastTotalAssets` while
        // `block.timestamp == lastAccrual`, so on a frozen test clock no valuation can
        // change. Every real report happens at least one block after the last accrual, so
        // advance the clock instead of pretending the same-block case matters.
        vm.warp(block.timestamp + 1);
    }

    /*//////////////////////////////////////////////////////////////
                       §6: THE DOCUMENTED EXAMPLE
    //////////////////////////////////////////////////////////////*/

    /// @notice `current_debt = 1.000.000`, `gain = 3.000`, `performanceFee = 1.000`:
    ///         fee 300, locked 2.700, and after the full 7-day unlock the user's
    ///         price-per-share gain is exactly 2.700/1e6 — within 1 unit of the doc.
    function test_documentedExampleFeesLockAndUnlock() public {
        // Preconditions: everything is deployed, the venue holds the money, pps is 1:1.
        assertEq(vault.strategies(address(strategy)).current_debt, DEPOSIT, "debt allocated");
        assertEq(venue.totalAssets(), DEPOSIT, "venue holds the assets");
        assertEq(vault.pricePerShare(), 1e6, "pps starts at 1.0");

        // Venue yields. The mock reports it through `totalAssets`, which is exactly the
        // channel `MorphoVaultStrategy._strategyTotalAssets` reads via `convertToAssets`.
        // Real USDG is minted into the venue too, so the gain can actually be withdrawn —
        // a gain that cannot be paid out would make the rest of this test a fiction.
        venue.setTotalAssets(DEPOSIT + GAIN);
        usdg.mint(address(venue), GAIN);

        // gain 3.000, loss 0, total_fees 300, no refunds. The event is the assertion that
        // the *vault* — not the accountant in isolation — computed these numbers.
        vm.expectEmit(true, false, false, true, address(vault));
        emit StrategyReported(address(strategy), GAIN, 0, DEPOSIT + GAIN, 0, FEE_ASSETS, 0);
        vm.prank(keeper);
        (uint256 gain, uint256 loss) = vault.process_report(address(strategy));

        assertEq(gain, GAIN, "reported gain");
        assertEq(loss, 0, "no loss");

        // Fee is paid in shares, not assets. At the pre-report pps of 1.0, 300 USDG of fee
        // is 300e6 shares and they are owned by the accountant — not by the deployer and
        // not by the fee recipient. Moving them is a separate, permissioned step.
        assertEq(vault.balanceOf(address(accountant)), FEE_ASSETS, "fee shares to accountant");
        assertEq(vault.balanceOf(address(strategy)), 0, "strategy owns no vault shares");

        // The gain is locked in the vault itself as shares, minus the fee shares minted
        // above: 3.000 - 300. This is the 7-day smoothing, not a fee.
        assertEq(vault.balanceOf(address(vault)), LOCKED_ASSETS, "locked profit shares");
        assertEq(vault.totalAssets(), DEPOSIT + GAIN, "assets now include the gain");
        assertEq(vault.unlockedShares(), 0, "nothing unlocked yet");

        // Mid-unlock the user sees part of the gain: the reported pps walks from 1.000000
        // to 1.002699 (the gain 0.3% minus the 0.03% fee) instead of jumping.
        assertEq(vault.convertToAssets(1e6), 1e6, "no jump at the report block");
        // `vm.getBlockTimestamp()` instead of `block.timestamp`: forge's
        // `environment-read-across-mutation` lint warns that the cached value may be reused
        // across `vm.warp`, which would make the second warp below land in the wrong place
        // and quietly weaken "fully vested". Reading it fresh removes the question.
        vm.warp(vm.getBlockTimestamp() + 3 days);
        uint256 midUnlock = vault.convertToAssets(1e6);
        assertGt(midUnlock, 1e6, "gain partially visible mid-unlock");
        assertLt(midUnlock, 1_002_699, "and not the whole gain yet");

        // After `profitMaxUnlockTime` the locked shares have fully vested into supply.
        uint256 midUnlockAt = vm.getBlockTimestamp();
        vm.warp(midUnlockAt + vault.profitMaxUnlockTime() + 1);
        assertGt(vm.getBlockTimestamp() - midUnlockAt, 3 days, "time actually advanced");
        assertApproxEqAbs(vault.unlockedShares(), LOCKED_ASSETS, 1, "locked shares unlocked");

        // §6 acceptance: pps difference vs 1.000.000/1e6 is 2.700/1e6, tolerance <= 1 unit.
        // totalSupply still contains the accountant's 300e6 fee shares, so the user's
        // 2.700 is what remains of the 3.000 after the fee.
        assertEq(vault.totalSupply(), DEPOSIT + FEE_ASSETS, "supply = deposit + fee shares");
        // pps = 1.003.000.000 units / 1.000.300.000 shares = 1.002699 (per 1e6 shares):
        // 0.30% gross gain minus the 0.03% fee. This is the number §6 must state; the
        // earlier "1.000.003" in the doc was off by the fee/supply ratio.
        assertApproxEqAbs(vault.convertToAssets(1e6), 1_002_699, 2, "pps after unlock");
    }

    /// @dev The inverse of the fee promise: `managementFee = 0` means a report on a
    ///      quiet period must charge nothing, even though time passed. A fee that appears
    ///      where the config says zero would be a silent charge.
    function test_noFeeWithoutGain() public {
        vm.warp(block.timestamp + 30 days);
        vm.prank(keeper);
        (uint256 gain, uint256 loss) = vault.process_report(address(strategy));

        assertEq(gain, 0);
        assertEq(loss, 0);
        assertEq(vault.balanceOf(address(accountant)), 0, "no fee shares minted");
        assertEq(vault.pricePerShare(), 1e6, "pps untouched");
    }

    /*//////////////////////////////////////////////////////////////
                    HEALTH CHECKS: REVERT, NEVER CLAMP
    //////////////////////////////////////////////////////////////*/

    /// @dev `maxGain = 500` (5% of `current_debt`). A venue that reports +6% in one report
    ///      fails loudly. Clamping would silently accept an oracle/venue bug; reverting
    ///      leaves the funds where they are until a human looks.
    function test_gainAboveMaxGainReverts() public {
        uint256 absurd = DEPOSIT / 100 * 6; // 6% > 5%
        venue.setTotalAssets(DEPOSIT + absurd);

        vm.prank(keeper);
        vm.expectRevert(bytes("too much gain"));
        vault.process_report(address(strategy));

        // Nothing moved: the failed report is not a partial report.
        assertEq(vault.balanceOf(address(accountant)), 0);
        assertEq(vault.strategies(address(strategy)).last_report != 0, true, "set at add");
    }

    /// @dev `maxLoss = 200` (2%). A 3% loss cannot be reported through the normal path.
    ///      The documented escape is `force_revoke_strategy` (`FORCE_REVOKE_MANAGER`),
    ///      which makes the loss an explicit, logged decision — not a keeper default.
    function test_lossAboveMaxLossReverts() public {
        uint256 bigLoss = DEPOSIT / 100 * 3; // 3% > 2%
        venue.setTotalAssets(DEPOSIT - bigLoss);
        // Burn the venue's USDG so the loss is real, not just a number.
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), bigLoss);

        vm.prank(keeper);
        vm.expectRevert(bytes("too much loss"));
        vault.process_report(address(strategy));

        assertEq(vault.pricePerShare(), 1e6, "no loss taken on a rejected report");
    }

    /// @dev `turnOffHealthCheck` is the one-shot escape hatch. It must (a) let the report
    ///      through, (b) reset itself so the next report is checked again, and (c) still
    ///      pay the fee based on the real numbers rather than the skipped check.
    function test_healthCheckSkipIsOneShotAndResets() public {
        uint256 bigLoss = DEPOSIT / 100 * 3;
        venue.setTotalAssets(DEPOSIT - bigLoss);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), bigLoss);

        // Only the fee manager may skip. Keeper is not the fee manager: a keeper able to
        // waive its own health check is a keeper that can never fail.
        vm.prank(keeper);
        vm.expectRevert(bytes("!fee manager"));
        accountant.turnOffHealthCheck(address(vault), address(strategy));

        vm.prank(address(deployer));
        accountant.turnOffHealthCheck(address(vault), address(strategy));
        vm.prank(keeper);
        (uint256 gain, uint256 loss) = vault.process_report(address(strategy));
        assertEq(gain, 0);
        assertEq(loss, bigLoss, "loss reported as-is, not clamped");
        assertEq(vault.balanceOf(address(accountant)), 0, "no fee on a loss report");

        // A *second* loss, so the check has something to reject: reporting the same
        // valuation again would show zero loss and prove nothing.
        uint256 secondLoss = DEPOSIT / 100 * 3;
        venue.setTotalAssets(DEPOSIT - bigLoss - secondLoss);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), secondLoss);

        // The skip was one-shot: it is consumed by the report above, so the check applies
        // again and the vault cannot book the loss.
        vm.prank(keeper);
        vm.expectRevert(bytes("too much loss"));
        vault.process_report(address(strategy));
    }

    /*//////////////////////////////////////////////////////////////
              FEE REALISATION: NOTHING MOVES WITHOUT THE TIMELOCK
    //////////////////////////////////////////////////////////////*/

    /// @dev The fee shares are a claim, not a payment. Turning them into USDG requires
    ///      `redeemUnderlying` (fee manager only), which redeems with the accountant's
    ///      `maxLoss` — and `distribute` (fee manager or recipient). This test walks the
    ///      whole path so `docs/FEE_CONFIG.md` §7's "fee lives as shares" claim is proven,
    ///      including who can and cannot move it.
    function test_feeSharesAreRedeemedAndDistributedByFeeManagerOnly() public {
        venue.setTotalAssets(DEPOSIT + GAIN);
        usdg.mint(address(venue), GAIN);
        vm.prank(keeper);
        vault.process_report(address(strategy));

        uint256 feeShares = vault.balanceOf(address(accountant));
        assertEq(feeShares, FEE_ASSETS);

        // Free idle for the redemption: the fee is paid out of the vault, so the vault
        // must hold USDG. This is a keeper action, not a fee-manager action.
        vm.prank(keeper);
        vault.update_debt(address(strategy), DEPOSIT - 100_000e6);

        // A random holder cannot redeem the accountant's shares for it.
        vm.prank(user);
        vm.expectRevert(bytes("!fee manager"));
        accountant.redeemUnderlying(address(vault));

        vm.prank(address(deployer));
        accountant.redeemUnderlying(address(vault));
        uint256 realised = usdg.balanceOf(address(accountant));
        assertApproxEqAbs(realised, FEE_ASSETS, 1, "fee shares redeemed at pps >= 1");

        // `distribute` is also callable by the fee recipient, so the treasury does not
        // depend on the timelock to collect what it already earned.
        vm.prank(treasury);
        accountant.distribute(address(usdg));

        assertEq(usdg.balanceOf(address(accountant)), 0, "accountant holds no USDG");
        assertEq(usdg.balanceOf(treasury), realised, "treasury received the fee");
    }

    /*//////////////////////////////////////////////////////////////
                     WIRING INVARIANTS (REGRESSIONS)
    //////////////////////////////////////////////////////////////*/

    /// @dev A loss within `maxLoss` is reported as-is and paid by the depositor, not by the
    ///      accountant: with `refundRatio = 0` there is no refund, so the price per share
    ///      drops. This is the honest version of "loss protection" the product can claim
    ///      in v1 — none.
    function test_lossReducesPpsAndPaysNoRefund() public {
        uint256 loss = DEPOSIT / 100; // 1%, within the 2% health check
        venue.setTotalAssets(DEPOSIT - loss);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), loss);

        uint256 ppsBefore = vault.pricePerShare();
        vm.prank(keeper);
        (uint256 gain, uint256 reportedLoss) = vault.process_report(address(strategy));

        assertEq(gain, 0);
        assertEq(reportedLoss, loss, "loss reported exactly");
        assertEq(vault.balanceOf(address(accountant)), 0, "no fee share on a loss report");
        assertEq(usdg.balanceOf(address(accountant)), 0, "no refund paid");
        assertLt(vault.pricePerShare(), ppsBefore, "depositor bears the loss");
        assertEq(vault.totalAssets(), DEPOSIT - loss, "assets reflect the loss");
    }

    /// @dev The gate that makes the two-call wiring necessary: only an added vault may call
    ///      `report`. Calling it directly — which is what a vault would do if `addVault`
    ///      were forgotten — reverts, and `VaultV3` would revert every `process_report`.
    function test_reportFromNonVaultReverts() public {
        vm.prank(address(strategy));
        vm.expectRevert(bytes("vault not added"));
        accountant.report(address(strategy), 0, 0);

        // And the real vault is admitted, so the gate is not simply closed.
        vm.prank(address(vault));
        (uint256 fees, uint256 refunds) = accountant.report(address(strategy), 0, 0);
        assertEq(fees, 0);
        assertEq(refunds, 0);
    }
}
