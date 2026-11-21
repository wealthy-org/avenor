// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { IAccountant } from "../../src/interfaces/IAccountant.sol";
import { MorphoVaultStrategy } from "../../src/strategies/MorphoVaultStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

/// @notice Ticket 3.3: what actually happens to the share price when the vault loses money,
///         through all three doors — a report within `maxLoss`, a report above it (refused),
///         and the forced write-off that bypasses the health check on purpose.
///
/// @dev The interesting part is not "pps goes down". It is *who* absorbs the loss and in what
///      order, because `VaultV3._process_report` computes `shares_to_burn` from the pre-report
///      pps and then burns at most the vault's own locked profit shares (`:1270-1274`):
///
///        - with a profit buffer, the loss burns locked shares and the user's pps is unchanged;
///        - without one, nothing can be burned, so the same loss falls on every holder in
///          proportion to their shares.
///
///      `force_revoke_strategy` (`VaultV3.vy:1777`) does none of that: it writes the entire
///      `current_debt` off as a loss (`:970-977`), emits `StrategyReported` with `gain = 0`,
///      and deletes the strategy. No share is burned, which is why the assertions below say
///      "no burn" rather than repeating the ticket's shorthand.
contract LossPathTest is Test {
    /// @dev Declared locally because Solidity 0.8.18 cannot emit a qualified event from an
    ///      interface. Same signature as the real one, so `expectEmit` matches topic0 + data.
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
    /// @dev `maxLoss = 200` bps in `Deploy.Config`, so 2% is the boundary and 3% is over it.
    uint256 internal constant TWO_PERCENT = DEPOSIT * 200 / 10_000;
    uint256 internal constant THREE_PERCENT = DEPOSIT * 300 / 10_000;

    Deploy internal deployer;
    Deploy.Deployment internal d;
    MockERC20 internal usdg;
    MockVenue internal venue;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal user = makeAddr("user");

    IVaultV3 internal vault;
    IAccountant internal accountant;
    MorphoVaultStrategy internal strategy;

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        // `TokenizedStrategy` lives at its canonical address on chain 4663; a bare EVM has no
        // code there, so every delegatecall into it would revert.
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
        accountant = IAccountant(d.accountant);
        strategy = MorphoVaultStrategy(d.strategy);

        // The product ships closed; opening it is an operator decision, so the test makes it.
        vm.prank(d.timelock);
        vault.set_deposit_limit(type(uint256).max);

        usdg.mint(user, DEPOSIT);
        vm.startPrank(user);
        usdg.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, user);
        vm.stopPrank();

        vm.prank(keeper);
        vault.update_debt(d.strategy, DEPOSIT);

        // TokenizedStrategy latches `lastTotalAssets` for the current timestamp; every real
        // report lands at least one second later, so the test moves the clock too.
        vm.warp(vm.getBlockTimestamp() + 1);
    }

    /*//////////////////////////////////////////////////////////////
                      LOSS WITHIN `maxLoss`
    //////////////////////////////////////////////////////////////*/

    /// @notice `VaultV3` comment: "Losses will be taken immediately, first from the profit
    ///         buffer (avoiding an impact in pps), then will reduce pps."
    ///         This proves the first half with numbers instead of prose.
    function test_lossWithinMaxLossBurnsTheProfitBufferAndLeavesPpsUntouched() public {
        // Build a 3% profit buffer: report a 30.000 gain, which locks 30.000 shares for 7 days.
        uint256 gain = DEPOSIT * 300 / 10_000;
        venue.setTotalAssets(DEPOSIT + gain);
        usdg.mint(address(venue), gain);
        vm.prank(keeper);
        vault.process_report(address(strategy));

        assertEq(vault.pricePerShare(), 1e6, "a locked gain does not move pps yet");
        // The 10% fee is minted as shares (3.000) and only the rest is locked (27.000), so the
        // supply and the assets both read 1.030.000 and pps is still exactly 1.0.
        assertEq(vault.balanceOf(address(accountant)), gain / 10, "fee shares minted");
        assertEq(vault.balanceOf(address(vault)), gain - gain / 10, "profit locked net of fee");

        // Then a 2% venue loss — exactly at `maxLoss`, so the health check accepts it.
        venue.setTotalAssets(DEPOSIT + gain - TWO_PERCENT);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), TWO_PERCENT);

        vm.expectEmit(true, false, false, true, address(vault));
        emit StrategyReported(
            address(strategy), 0, TWO_PERCENT, DEPOSIT + gain - TWO_PERCENT, 0, 0, 0
        );
        vm.prank(keeper);
        (uint256 reportedGain, uint256 reportedLoss) = vault.process_report(address(strategy));

        assertEq(reportedGain, 0, "no gain");
        assertEq(reportedLoss, TWO_PERCENT, "loss is the full shortfall");

        // The loss burned locked shares, not user shares: 20.000 of the 27.000 locked.
        assertEq(vault.balanceOf(address(vault)), gain - gain / 10 - TWO_PERCENT, "buffer reduced");
        assertApproxEqAbs(
            vault.totalSupply(), DEPOSIT + gain - TWO_PERCENT, 1, "only locked burned"
        );
        assertEq(vault.balanceOf(user), DEPOSIT, "user shares untouched");
        assertEq(vault.pricePerShare(), 1e6, "pps unchanged: the buffer absorbed it");
        // A loss report charges nothing. The accountant's 3.000 shares are the fee from the
        // earlier gain, still sitting there untouched — not a new charge on the loss.
        assertEq(vault.balanceOf(address(accountant)), gain / 10, "no new fee shares on a loss");
    }

    /// @notice Without a buffer there is nothing to burn, so the same loss lands on every
    ///         holder at once. The pps is asserted to the unit, not "roughly".
    function test_lossWithoutProfitBufferLowersPpsByExactlyTheLoss() public {
        venue.setTotalAssets(DEPOSIT - TWO_PERCENT);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), TWO_PERCENT);

        vm.prank(keeper);
        (uint256 gain, uint256 loss) = vault.process_report(address(strategy));
        assertEq(gain, 0);
        assertEq(loss, TWO_PERCENT);

        // `shares_to_burn` was 20.000 but the vault owned zero locked shares, so
        // `to_burn = min(20.000, 0) = 0` (`:1271`). Supply is unchanged, assets are not.
        assertEq(vault.balanceOf(address(vault)), 0, "nothing locked");
        assertEq(vault.totalSupply(), DEPOSIT, "no share burned");
        assertEq(vault.totalAssets(), DEPOSIT - TWO_PERCENT, "assets carry the loss");
        assertEq(vault.pricePerShare(), 980_000, "0.98 exactly, not 0.98-ish");
        assertEq(vault.convertToAssets(vault.balanceOf(user)), DEPOSIT - TWO_PERCENT, "user claim");

        // No dust is created or captured: the whole supply is the user's, and the accountant
        // (the only other possible recipient) got nothing for a loss report.
        assertEq(vault.balanceOf(address(accountant)), 0);
        assertEq(vault.balanceOf(address(strategy)), 0);
        assertEq(
            vault.balanceOf(user) + vault.balanceOf(address(accountant))
                + vault.balanceOf(address(vault)) + vault.balanceOf(address(strategy)),
            vault.totalSupply(),
            "no share exists outside the accounted holders"
        );
    }

    /*//////////////////////////////////////////////////////////////
                    LOSS ABOVE `maxLoss`: REFUSED
    //////////////////////////////////////////////////////////////*/

    /// @notice A 3% loss cannot go through `process_report`: the accountant reverts and the
    ///         vault state does not move. The escape is `force_revoke_strategy`, which writes
    ///         the entire debt off and is therefore a *decision*, not a keeper default.
    function test_forceRevokeWritesTheWholeDebtOffWithoutBurningShares() public {
        venue.setTotalAssets(DEPOSIT - THREE_PERCENT);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), THREE_PERCENT);

        vm.prank(keeper);
        vm.expectRevert(bytes("too much loss"));
        vault.process_report(address(strategy));
        assertEq(vault.pricePerShare(), 1e6, "refused report changes nothing");
        assertEq(vault.totalDebt(), DEPOSIT, "debt still on the books");

        // ADR-12: the 6h emergency timelock holds `FORCE_REVOKE_MANAGER`. The guardian can
        // schedule it, nobody can execute it early, and after the delay it goes through.
        (bytes32 salt, bytes memory call) = _scheduleForceRevoke();
        uint256 debtWrittenOff = DEPOSIT;
        vm.expectEmit(true, false, false, true, address(vault));
        emit StrategyReported(address(strategy), 0, debtWrittenOff, 0, 0, 0, 0);
        _executeForceRevoke(salt, call);

        // The whole debt is gone, not the 3% the venue actually lost: `_revoke_strategy`
        // writes off `current_debt` and never re-reads the strategy's value. That is the
        // documented behaviour (`:970-977`) and the reason this function is dangerous.
        assertEq(vault.totalDebt(), 0, "total_debt written off");
        assertEq(vault.totalIdle(), 0, "no idle was credited");
        assertEq(vault.totalAssets(), 0, "assets are zero after a full write-off");
        assertEq(vault.pricePerShare(), 0, "pps is zero; the shares are not");
        assertEq(vault.totalSupply(), DEPOSIT, "no share was burned by the write-off");
        // The vault's *position in the strategy* is not touched either: the vault still owns
        // 1.000.000 strategy shares worth 970.000 USDG. That stranded value is what the
        // re-add in the next test recovers; the UI cannot call it lost while it is there.
        uint256 strandedShares = IERC20(address(strategy)).balanceOf(d.vault);
        assertEq(strandedShares, DEPOSIT, "vault still owns its strategy shares");
        assertEq(vault.balanceOf(address(strategy)), 0, "the strategy never held vault shares");
        assertEq(vault.strategies(address(strategy)).activation, 0, "strategy removed");
        assertEq(vault.roles(d.emergencyTimelock), 4, "the call came from the fast lane");

        // The venue still holds 97% of the money. It is stranded behind a revoked strategy,
        // recoverable only by re-adding it — a fact the UI must not hide behind "pps 0".
        assertEq(venue.totalAssets(), DEPOSIT - THREE_PERCENT, "money still at the venue");
    }

    /// @notice The docstring of `force_revoke_strategy` promises: "If a strategy is removed
    ///         erroneously it can be re-added and the loss will be credited as profit. Fees
    ///         will apply." This proves both halves, including the fee, which turns a 1.5%
    ///         real loss into a 10.21% hit for the user.
    function test_reAddingTheRevokedStrategyCreditsValueBackButChargesAFeeOnIt() public {
        uint256 half = DEPOSIT / 2;
        // Pull half the credit line back so the vault keeps an idle buffer and pps cannot hit
        // zero; `max_loss` is explicit (2%), never the implicit default.
        vm.prank(keeper);
        vault.update_debt(d.strategy, half, 200);
        assertEq(vault.totalIdle(), half, "idle buffer restored");

        // The venue loses 3% of what it still holds: a loss above `maxLoss`, so the only
        // legal way out is the forced write-off.
        uint256 venueValue = half - THREE_PERCENT / 2;
        venue.setTotalAssets(venueValue);
        vm.prank(address(venue));
        usdg.transfer(address(0xdEaD), THREE_PERCENT / 2);

        _forceRevoke();
        assertEq(vault.totalAssets(), half, "only the idle buffer survives the write-off");
        assertEq(vault.pricePerShare(), 500_000, "0.5: half the book was written off");

        // Re-add the same strategy: the recovered value is credited as a *gain* against a
        // debt of zero, so it flows through the fee engine like any profit.
        vm.startPrank(d.timelock);
        vault.add_strategy(d.strategy, true);
        vault.update_max_debt_for_strategy(d.strategy, DEPOSIT);
        vm.stopPrank();

        vm.warp(vm.getBlockTimestamp() + 1);
        // `maxGain = 500` bps of `current_debt`, and `current_debt` is zero here, so the gain
        // health check can only be bypassed — the documented one-shot escape hatch.
        vm.prank(address(deployer));
        accountant.turnOffHealthCheck(d.vault, d.strategy);

        vm.prank(keeper);
        (uint256 gain, uint256 loss) = vault.process_report(address(strategy));
        assertEq(loss, 0, "recovery is booked as a gain, not a loss");
        assertEq(gain, venueValue, "the whole stranded value is credited back");

        // 10% of 485.000 = 48.500 in assets, minted as 97.000 shares because pps was 0.5.
        assertEq(vault.balanceOf(address(accountant)), 97_000e6, "fee charged on the recovery");
        assertEq(vault.totalAssets(), half + venueValue, "assets = idle + recovered venue value");

        // After the 7-day unlock the fee shares are the only supply added:
        // 1.000.000 + 97.000 shares against 985.000 assets → 897.903 per 1e6 shares.
        vm.warp(vm.getBlockTimestamp() + vault.profitMaxUnlockTime() + 1);
        assertApproxEqAbs(vault.totalSupply(), DEPOSIT + 97_000e6, 2, "only fee shares remain");
        assertApproxEqAbs(
            vault.convertToAssets(1e6),
            897_903,
            2,
            "a 1.5% market loss becomes a 10.21% user loss once the recovery fee is charged"
        );
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev The ADR-12 path in two halves so a test can put `expectEmit` on the execute call
    ///      without the timelock's own `CallScheduled`/`CallSalt` events stealing the match.
    function _scheduleForceRevoke() internal returns (bytes32 salt, bytes memory call) {
        call = abi.encodeCall(IVaultV3.force_revoke_strategy, (d.strategy));
        salt = keccak256(abi.encode("loss-path", block.number));

        TimelockController emergency = TimelockController(payable(d.emergencyTimelock));
        vm.prank(d.guardian);
        emergency.schedule(d.vault, 0, call, bytes32(0), salt, 6 hours);
    }

    function _executeForceRevoke(
        bytes32 salt,
        bytes memory call
    ) internal {
        TimelockController emergency = TimelockController(payable(d.emergencyTimelock));

        // Too early: the delay is the whole protection, so prove it actually holds.
        vm.prank(d.guardian);
        vm.expectRevert();
        emergency.execute(d.vault, 0, call, bytes32(0), salt);

        vm.warp(vm.getBlockTimestamp() + 6 hours + 1);
        vm.prank(d.guardian);
        emergency.execute(d.vault, 0, call, bytes32(0), salt);
    }

    /// @dev Full path for tests that do not need `expectEmit` around the execute call.
    function _forceRevoke() internal {
        (bytes32 salt, bytes memory call) = _scheduleForceRevoke();
        _executeForceRevoke(salt, call);
    }
}
