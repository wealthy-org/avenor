// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { ForkBase } from "./ForkBase.sol";
import { IMorphoVaultV2 } from "../../src/interfaces/IMorphoVaultV2.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Read-only facts about the real `steakUSDG` venue at the pinned block.
/// @dev These are observations used to keep `docs/VENUE_INTEGRATIONS.md` and
///      `packages/config/4663.json` honest. They assert the *shape* of the venue
///      (decimals, gating, value-vs-liquidity gap), not product behaviour.
contract VenueProbeTest is ForkBase {
    IMorphoVaultV2 internal venue;

    function setUp() public {
        _requirePinnedFork();
        venue = IMorphoVaultV2(STEAK_USDG);
    }

    function test_pinIsTheStateWeRecorded() external view {
        assertEq(block.chainid, 4663, "chain");
        assertEq(_arbBlockNumber(), PIN_BLOCK, "pinned L2 block");
        assertEq(block.timestamp, PIN_TIMESTAMP, "pinned timestamp");
        assertEq(venue.totalAssets(), PIN_VENUE_TOTAL_ASSETS, "venue totalAssets");
        assertEq(venue.totalSupply(), PIN_VENUE_TOTAL_SUPPLY, "venue totalSupply");
        assertEq(IERC20Metadata(USDG).totalSupply(), USDG_TOTAL_SUPPLY, "USDG totalSupply at pin");
    }

    function test_venueShareDecimalsDifferFromAsset() external view {
        assertEq(IERC20Metadata(USDG).decimals(), 6, "asset decimals");
        assertEq(venue.decimals(), 18, "share decimals");
        assertEq(address(venue.asset()), USDG, "venue asset");
        assertEq(venue.convertToAssets(1e18), PIN_CONVERT_TO_ASSETS_1E18, "pps at pin");
    }

    function test_maxDepositReportsZeroForArbitraryAccounts() external view {
        // Named for what it measures, not for what it looks like: this getter says `0` to
        // everyone — a fresh address, the holder, this test contract. It is **not** a gate;
        // `test_depositSucceedsWhileMaxDepositReportsZero` shows the venue accepting the
        // same call it advertises as impossible.
        assertEq(venue.maxDeposit(address(0x1)), 0, "maxDeposit(fresh)");
        assertEq(venue.maxDeposit(address(this)), 0, "maxDeposit(this)");
        assertEq(venue.maxDeposit(HOLDER), 0, "maxDeposit(holder)");
    }

    /// @notice The venue's capacity getter is wrong, and measurably so.
    /// @dev Measured at block `118337511`: `maxDeposit` is `0` for every address, yet
    ///      `deposit(10_000e6)` takes the full `10_000.000000` USDG and mints
    ///      `9_861.9777693747` shares. Two consequences the adapter is built around:
    ///      `VaultV3.update_debt` must not be gated by the zero (or it never allocates), and
    ///      `withdraw`'s return value is **shares burned**, not assets paid. This test is the
    ///      evidence both of those are recorded against.
    function test_depositSucceedsWhileMaxDepositReportsZero() external {
        deal(USDG, address(this), 100_000e6);
        IERC20(USDG).approve(STEAK_USDG, type(uint256).max);

        assertEq(venue.maxDeposit(address(this)), 0, "getter says no");

        uint256 spentBefore = IERC20(USDG).balanceOf(address(this));
        uint256 shares = venue.deposit(10_000e6, address(this));
        uint256 spent = spentBefore - IERC20(USDG).balanceOf(address(this));

        assertEq(spent, 10_000e6, "the deposit really took 10.000 USDG");
        assertEq(shares, PIN_PROBE_DEPOSIT_SHARES, "shares minted at the pin price");
        assertEq(venue.balanceOf(address(this)), shares, "shares credited");
        assertApproxEqAbs(venue.convertToAssets(shares), 10_000e6, 1, "position value in USDG");

        // The lie continues after the deposit, and the venue still pays.
        assertEq(venue.maxWithdraw(address(this)), 0, "maxWithdraw still 0");
        uint256 cashBefore = IERC20(USDG).balanceOf(address(this));
        uint256 returned = venue.withdraw(2_000e6, address(this), address(this));
        uint256 received = IERC20(USDG).balanceOf(address(this)) - cashBefore;

        assertEq(received, 2_000e6, "paid exactly what was asked");
        assertEq(returned, PIN_PROBE_WITHDRAW_RETURN, "return value is shares, not assets");
        assertGt(returned, received, "18-decimal shares dwarf the 6-decimal asset amount");

        // `redeem` is the inconsistent sibling: it returns assets.
        uint256 rest = venue.balanceOf(address(this));
        uint256 paid = venue.redeem(rest, address(this), address(this));
        assertEq(
            paid,
            IERC20(USDG).balanceOf(address(this)) - cashBefore - received,
            "redeem returns assets"
        );
        assertEq(venue.balanceOf(address(this)), 0, "position closed");
    }

    /// @notice `maxWithdraw` is not a liquidity signal on this venue, and the docs used to
    ///         claim the opposite ("zero immediate liquidity"), which was wrong: idle cash
    ///         covered the whole position. What is true is that `maxWithdraw`/`maxRedeem`
    ///         answer `0` while the money is there — so the adapter must never plan a
    ///         withdrawal from `maxWithdraw`, it must use the measured idle cash and the
    ///         venue's own revert behaviour.
    function test_maxWithdrawIsZeroButIdleCashCoversThePosition() external {
        uint256 shares = venue.balanceOf(HOLDER);
        assertEq(shares, HOLDER_SHARES_AT_PIN, "holder shares at pin");
        assertGt(venue.convertToAssets(shares), 8_000_000e6, "position is worth millions");

        assertEq(IERC20Metadata(USDG).balanceOf(STEAK_USDG), PIN_VENUE_IDLE_USDG, "idle USDG");
        assertEq(venue.maxWithdraw(HOLDER), 0, "maxWithdraw lies: 0");
        assertEq(venue.maxRedeem(HOLDER), 0, "maxRedeem lies: 0");
        vm.prank(HOLDER);
        assertEq(venue.maxWithdraw(HOLDER), 0, "maxWithdraw as the holder is still 0");

        // ... and yet the position is liquid. A 1% slice is redeemed here on purpose: the
        // *whole* holder position unwinds through every Morpho market the venue touches and
        // was measured at `8_328_471_010_500` (see `PIN_HOLDER_REDEEM_ALL`), but that
        // all-market unwind is not a code path this strategy ever runs, and pinning it makes
        // the harness depend on markets the vault does not use.
        uint256 slice = shares / 100;
        uint256 cashBefore = IERC20Metadata(USDG).balanceOf(address(HOLDER));
        vm.prank(HOLDER);
        uint256 paid = venue.redeem(slice, HOLDER, HOLDER);
        assertEq(paid, IERC20Metadata(USDG).balanceOf(address(HOLDER)) - cashBefore, "paid in USDG");
        assertApproxEqAbs(paid, venue.convertToAssets(slice), 1, "redeemed at the pin price");
        assertEq(
            IERC20Metadata(USDG).balanceOf(STEAK_USDG), PIN_VENUE_IDLE_USDG - paid, "cash left"
        );
    }

    /// @dev Beyond idle cash the venue simply does not pay: the call reverts. The *payload*
    ///      is not stable enough to pin — measured as `Panic(0x11)` (arithmetic underflow
    ///      somewhere in its per-market unwind) in some runs and as empty revert data in
    ///      others, which is venue-internal market math and nothing this strategy depends on.
    ///      What the adapter relies on is the first-order fact: over-drawing is a revert, not a
    ///      partial payout. Hence `_freeFunds` clamps to measured cash and reverts itself.
    function test_withdrawAboveIdleCashReverts() external {
        vm.prank(HOLDER);
        vm.expectRevert();
        venue.withdraw(30_000_000e6, HOLDER, HOLDER);
    }

    function test_tokenizedStrategyImplementationIsPresent() external view {
        // The adapter delegatecalls this exact address; if it is missing on a fork,
        // every strategy call silently no-ops (see test/unit/MorphoVaultStrategy.t.sol).
        assertEq(TS_IMPL.code.length, 18_224, "TokenizedStrategy runtime size");
    }
}
