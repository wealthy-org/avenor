// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test, Vm } from "forge-std/Test.sol";
import { MorphoVaultStrategy } from "../../src/strategies/MorphoVaultStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

/// @dev Exposes the internal hooks so the venue interaction can be tested directly,
///      outside a `TokenizedStrategy` deposit/withdraw frame.
contract StrategyHarness is MorphoVaultStrategy {
    constructor(
        address asset_,
        address venue_,
        string memory name_
    ) MorphoVaultStrategy(asset_, venue_, name_) { }

    function exposeDeployFunds(
        uint256 amount
    ) external {
        _deployFunds(amount);
    }

    function exposeFreeFunds(
        uint256 amount
    ) external {
        _freeFunds(amount);
    }

    function exposeEmergencyWithdraw(
        uint256 amount
    ) external {
        _emergencyWithdraw(amount);
    }
}

/// @dev The subset of the `TokenizedStrategy` surface the strategy inherits through
///      its fallback. Kept local so the test asserts the ABI users actually call.
interface IStrategyERC4626 {
    function asset() external view returns (address);

    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256);

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256);

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256);

    function totalAssets() external view returns (uint256);

    function balanceOf(
        address
    ) external view returns (uint256);

    function decimals() external view returns (uint8);

    function convertToAssets(
        uint256 shares
    ) external view returns (uint256);

    function maxWithdraw(
        address owner
    ) external view returns (uint256);

    function maxRedeem(
        address owner
    ) external view returns (uint256);

    function maxDeposit(
        address receiver
    ) external view returns (uint256);

    function pricePerShare() external view returns (uint256);

    function report() external returns (uint256, uint256);

    function setPaused(
        bool paused
    ) external;

    function emergencyWithdraw(
        uint256 amount
    ) external;

    function strategyTotalAssets() external view returns (uint256);
}

contract MorphoVaultStrategyTest is Test {
    MockERC20 internal usdg;
    MockVenue internal venue;
    StrategyHarness internal harness;

    address internal user = address(0xA11CE);
    address internal vault = address(0xBA5E);

    uint256 internal constant ONE_USDG = 1e6;

    /// @dev The canonical `TokenizedStrategy` v3.1.1 implementation on chain 4663.
    ///      `BaseStrategy` delegatecalls this exact address, so unit tests must run
    ///      against it too — not against a locally invented implementation.
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        venue = new MockVenue(address(usdg));

        // No fork here, so the canonical address has no code and every delegatecall
        // into `TokenizedStrategy` would silently succeed against an empty account,
        // leaving storage uninitialised. Etch the *vendored* v3.1.1 bytecode at the
        // canonical address instead: the tests then exercise the same code path as
        // production, and a vendored-code change shows up here.
        MockYearnFactory factory = new MockYearnFactory();
        (uint16 feeBps, address feeRecipient) = factory.protocol_fee_config();
        assertEq(feeBps, 0, "no protocol fee in v1");
        assertEq(feeRecipient, address(0));
        TokenizedStrategy tsTemplate = new TokenizedStrategy(address(factory));
        vm.etch(TS_IMPL, address(tsTemplate).code);
        assertGt(TS_IMPL.code.length, 0, "TokenizedStrategy code not etched");

        harness = new StrategyHarness(address(usdg), address(venue), "Avenor USDG Morpho");

        usdg.mint(user, 1_000_000 * ONE_USDG);
        vm.prank(user);
        usdg.approve(address(harness), type(uint256).max);

        // The vault is the operator in production; mint it nothing, it only moves
        // assets it already holds.
        vm.label(user, "user");
        vm.label(vault, "vault");
    }

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTION
    //////////////////////////////////////////////////////////////*/

    function test_constructorRejectsZeroVenue() external {
        vm.expectRevert(
            abi.encodeWithSelector(
                MorphoVaultStrategy.VenueAssetMismatch.selector, address(0), address(usdg)
            )
        );
        new MorphoVaultStrategy(address(usdg), address(0), "x");
    }

    function test_constructorRejectsVenueWithDifferentAsset() external {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        MockVenue wrongVenue = new MockVenue(address(other));

        vm.expectRevert(
            abi.encodeWithSelector(
                MorphoVaultStrategy.VenueAssetMismatch.selector, address(other), address(usdg)
            )
        );
        new MorphoVaultStrategy(address(usdg), address(wrongVenue), "x");
    }

    function test_constructorExposesImmutableVenueAndAsset() external view {
        assertEq(address(harness.venue()), address(venue));
        assertEq(harness.tokenizedStrategyAddress(), TS_IMPL, "pinned canonical implementation");
        assertEq(IStrategyERC4626(address(harness)).asset(), address(usdg));
        assertEq(
            IStrategyERC4626(address(harness)).decimals(),
            6,
            "strategy decimals follow the asset, not the venue share"
        );
    }

    /*//////////////////////////////////////////////////////////////
                                DEPLOY
    //////////////////////////////////////////////////////////////*/

    function test_depositDeploysEverythingAndResetsAllowance() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        // 6-decimal asset into an 18-decimal share venue: 1 USDG = 1e12 shares at the
        // seeded 1:1 price. Treating the two as interchangeable would show 1e6 here.
        assertEq(venue.balanceOf(address(harness)), 10_000 * ONE_USDG * 1e12, "venue shares");
        assertEq(usdg.balanceOf(address(harness)), 0, "no idle left");
        assertEq(usdg.allowance(address(harness), address(venue)), 0, "allowance reset to zero");
        assertEq(IStrategyERC4626(address(harness)).totalAssets(), 10_000 * ONE_USDG, "assets");
    }

    function test_deployFundsClampsToVenueDepositLimit() external {
        venue.setDepositCap(4_000 * ONE_USDG);
        usdg.mint(address(harness), 10_000 * ONE_USDG);

        harness.exposeDeployFunds(10_000 * ONE_USDG);

        // Only what the venue accepts is deployed; the rest stays loose instead of
        // reverting, which is what keeps a full venue from bricking deposits.
        assertEq(venue.totalAssets(), 4_000 * ONE_USDG, "deployed");
        assertEq(venue.balanceOf(address(harness)), 4_000 * ONE_USDG * 1e12, "shares");
        assertEq(usdg.allowance(address(harness), address(venue)), 0, "allowance reset");
    }

    function test_deployFundsIsNoOpWhenVenueIsFull() external {
        venue.setDepositCap(0);
        usdg.mint(address(harness), 1_000 * ONE_USDG);

        vm.recordLogs();
        harness.exposeDeployFunds(1_000 * ONE_USDG);
        _assertOnlyVenueSkipLogged(1_000 * ONE_USDG);

        assertEq(venue.totalAssets(), 0, "nothing deployed");
        assertEq(usdg.balanceOf(address(harness)), 1_000 * ONE_USDG, "stays idle");
    }

    /// @dev The real venue reported `maxDeposit == 0` for everyone at block `118337511`
    ///      and then accepted `10_000e6`. Believing the getter would leave every vault
    ///      deposit idle forever, so the adapter attempts the deposit anyway.
    function test_deployFundsIgnoresLyingMaxDeposit() external {
        venue.setMaxDepositLies(true);
        usdg.mint(address(harness), 10_000 * ONE_USDG);

        assertEq(
            harness.availableDepositLimit(user), type(uint256).max, "zero report is not believed"
        );
        harness.exposeDeployFunds(10_000 * ONE_USDG);

        assertEq(venue.totalAssets(), 10_000 * ONE_USDG, "deployed anyway");
        assertEq(usdg.balanceOf(address(harness)), 0, "no idle left");
        assertEq(usdg.allowance(address(harness), address(venue)), 0, "allowance reset");
    }

    /// @dev The skip must be observable, not silent: exactly one `VenueDepositSkipped`
    ///      for the amount that stayed idle.
    function _assertOnlyVenueSkipLogged(
        uint256 amount
    ) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("VenueDepositSkipped(uint256,bytes)");
        uint256 seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != sig) continue; // the two `Approval` logs are expected
            assertEq(logs[i].emitter, address(harness), "from strategy");
            assertEq(abi.decode(logs[i].data, (uint256)), amount, "amount");
            ++seen;
        }
        assertEq(seen, 1, "one skip logged");
    }

    function test_deployFundsIsNoOpForZeroAmount() external {
        usdg.mint(address(harness), 1_000 * ONE_USDG);
        harness.exposeDeployFunds(0);
        assertEq(venue.totalAssets(), 0);
        assertEq(usdg.allowance(address(harness), address(venue)), 0);
    }

    /// @dev A venue that refuses the deposit must not brick vault deposits: the USDG
    ///      stays loose and the skip is logged. Loss is impossible on this path, and the
    ///      alternative — reverting — would make a closed venue the vault's outage.
    function test_deployFundsKeepsFundsIdleWhenVenueRefuses() external {
        usdg.mint(address(harness), 1_000 * ONE_USDG);
        venue.setDepositReverts(true);

        vm.recordLogs();
        harness.exposeDeployFunds(1_000 * ONE_USDG);
        _assertOnlyVenueSkipLogged(1_000 * ONE_USDG);

        assertEq(venue.totalAssets(), 0, "nothing deployed");
        assertEq(usdg.balanceOf(address(harness)), 1_000 * ONE_USDG, "stays idle");
        assertEq(usdg.allowance(address(harness), address(venue)), 0, "allowance reset");
    }

    /// @dev `steakUSDG.withdraw` returns shares burned, not assets paid (measured at
    ///      block `118337511`). Trusting it would compare 18-decimal shares against a
    ///      6-decimal asset amount and accept any payout, so `_freeFunds` measures the
    ///      balance delta instead.
    function test_freeFundsMeasuresPayoutInsteadOfTrustingWithdrawReturn() external {
        venue.setWithdrawReturnsShares(true);
        usdg.mint(address(harness), 10_000 * ONE_USDG);
        harness.exposeDeployFunds(10_000 * ONE_USDG);

        uint256 before = usdg.balanceOf(address(harness));
        harness.exposeFreeFunds(4_000 * ONE_USDG);

        assertEq(usdg.balanceOf(address(harness)) - before, 4_000 * ONE_USDG, "assets measured");
    }

    function test_availableDepositLimitTracksVenue() external {
        assertEq(harness.availableDepositLimit(user), type(uint256).max, "uncapped");

        venue.setDepositCap(4_000 * ONE_USDG);
        assertEq(harness.availableDepositLimit(user), 4_000 * ONE_USDG, "cap");

        // A positive venue number is authoritative and passed through untouched.
        venue.setDepositCap(1_000 * ONE_USDG);
        usdg.mint(address(harness), 1_000 * ONE_USDG);
        harness.exposeDeployFunds(1_000 * ONE_USDG);
        assertEq(venue.maxDeposit(address(harness)), 0, "venue reports full");

        // A **zero** is not authoritative: the real venue reported 0 at block
        // `118337511` and still accepted deposits, so passing that zero through would
        // turn `VaultV3.update_debt` into a permanent no-op. The adapter reports "no
        // adapter-level limit" and lets `_deployFunds` attempt the deposit, which keeps
        // the funds idle when the zero was true.
        assertEq(harness.availableDepositLimit(user), type(uint256).max, "zero not believed");
        assertEq(
            IStrategyERC4626(address(harness)).maxDeposit(user),
            type(uint256).max,
            "strategy deposit gate open"
        );
    }

    /*//////////////////////////////////////////////////////////////
                              FREE FUNDS
    //////////////////////////////////////////////////////////////*/

    function test_freeFundsRevertsWithShortfallRatherThanRealisingLoss() external {
        usdg.mint(address(harness), 10_000 * ONE_USDG);
        harness.exposeDeployFunds(10_000 * ONE_USDG);
        venue.setTokensAvailable(1_000 * ONE_USDG);

        vm.expectRevert(
            abi.encodeWithSelector(
                MorphoVaultStrategy.VenueLiquidityShortfall.selector,
                4_000 * ONE_USDG,
                1_000 * ONE_USDG
            )
        );
        harness.exposeFreeFunds(4_000 * ONE_USDG);

        // Position untouched: no partial unwind, no phantom loss.
        assertEq(venue.balanceOf(address(harness)), 10_000 * ONE_USDG * 1e12);
    }

    function test_freeFundsIsNoOpForZeroAmount() external {
        harness.exposeFreeFunds(0);
        assertEq(usdg.balanceOf(address(harness)), 0);
    }

    function test_availableWithdrawLimitIsIdlePlusVenueLiquidity() external {
        usdg.mint(address(harness), 10_000 * ONE_USDG);
        harness.exposeDeployFunds(10_000 * ONE_USDG);
        assertEq(harness.availableWithdrawLimit(user), 10_000 * ONE_USDG, "position is liquid");

        venue.setTokensAvailable(2_500 * ONE_USDG);
        assertEq(harness.availableWithdrawLimit(user), 2_500 * ONE_USDG, "venue liquidity cap");

        usdg.mint(address(harness), 500 * ONE_USDG);
        assertEq(harness.availableWithdrawLimit(user), 3_000 * ONE_USDG, "idle counted");
    }

    function test_depositThenUserWithdrawalPullsExactlyWhatIsNeeded() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        uint256 before = usdg.balanceOf(user);
        vm.prank(user);
        IStrategyERC4626(address(harness)).withdraw(4_000 * ONE_USDG, user, user);

        assertEq(usdg.balanceOf(user) - before, 4_000 * ONE_USDG, "exact assets out");
        assertEq(
            venue.balanceOf(address(harness)),
            6_000 * ONE_USDG * 1e12,
            "venue shares reduced proportionally"
        );
        assertEq(IStrategyERC4626(address(harness)).totalAssets(), 6_000 * ONE_USDG);
    }

    function test_illiquidVenueCapsMaxWithdrawInsteadOfFailingSilently() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);
        venue.setTokensAvailable(1_000 * ONE_USDG);

        uint256 maxOut = IStrategyERC4626(address(harness)).maxWithdraw(user);
        assertEq(maxOut, 1_000 * ONE_USDG, "maxWithdraw tells the truth");

        // Asking for more than maxWithdraw is rejected before any venue interaction,
        // so the user never receives a partial fill that is accounted as a loss.
        vm.prank(user);
        vm.expectRevert();
        IStrategyERC4626(address(harness)).withdraw(4_000 * ONE_USDG, user, user);

        // What maxWithdraw advertised is actually serviceable.
        vm.prank(user);
        IStrategyERC4626(address(harness)).withdraw(maxOut, user, user);
    }

    /// @dev The real venue answered `0` from `maxWithdraw` while holding 27M USDG idle and
    ///      redeeming a 8.21M-share position in full (block `118337511`, see
    ///      `test/fork/VenueProbe.t.sol`). The adapter must still report — and serve — the
    ///      liquidity that is actually there.
    function test_venueWithdrawLimitIsMeasuredNotReadFromMaxWithdraw() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        venue.setTokensAvailable(2_500 * ONE_USDG);
        venue.setMaxWithdrawLies(true);

        assertEq(venue.maxWithdraw(address(harness)), 0, "venue getter lies");
        assertEq(harness.availableWithdrawLimit(user), 2_500 * ONE_USDG, "cash is what counts");

        uint256 before = usdg.balanceOf(user);
        vm.prank(user);
        IStrategyERC4626(address(harness)).withdraw(2_000 * ONE_USDG, user, user);
        assertEq(usdg.balanceOf(user) - before, 2_000 * ONE_USDG, "money actually moved");
    }

    /// @dev Same lie, but on the revert path: the shortfall number reported to the user is
    ///      the measured cash, not the getter's zero.
    function test_freeFundsShortfallReportsMeasuredCashWhenMaxWithdrawLies() external {
        usdg.mint(address(harness), 10_000 * ONE_USDG);
        harness.exposeDeployFunds(10_000 * ONE_USDG);

        venue.setTokensAvailable(1_000 * ONE_USDG);
        venue.setMaxWithdrawLies(true);

        vm.expectRevert(
            abi.encodeWithSelector(
                MorphoVaultStrategy.VenueLiquidityShortfall.selector,
                4_000 * ONE_USDG,
                1_000 * ONE_USDG
            )
        );
        harness.exposeFreeFunds(4_000 * ONE_USDG);
    }

    /*//////////////////////////////////////////////////////////////
                              ACCOUNTING
    //////////////////////////////////////////////////////////////*/

    function test_reportRealisesVenueGainInUsdg() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        venue.setTotalAssets(10_000 * ONE_USDG + 250 * ONE_USDG);
        (uint256 profit, uint256 loss) = IStrategyERC4626(address(harness)).report();

        assertEq(profit, 250 * ONE_USDG, "profit in asset units");
        assertEq(loss, 0);
        assertEq(IStrategyERC4626(address(harness)).totalAssets(), 10_250 * ONE_USDG);
    }

    function test_reportRealisesVenueLossInUsdg() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        venue.setTotalAssets(9_000 * ONE_USDG);
        (uint256 profit, uint256 loss) = IStrategyERC4626(address(harness)).report();

        assertEq(profit, 0);
        assertEq(loss, 1_000 * ONE_USDG, "loss in asset units, not share units");
    }

    /// @dev This override is load-bearing, not cosmetic. `BaseStrategy`'s default returns
    ///      `TokenizedStrategy.lastTotalAssets()`, which only moves when the *strategy*
    ///      reports — and `VaultV3._process_report` (`VaultV3.vy:1069`) never calls
    ///      `strategy.report()`: it derives gain/loss from `convertToAssets` first. With the
    ///      default, a venue gain or loss would be invisible to the vault forever, so the
    ///      position could never be reported and never be valued. The assertion is
    ///      therefore the opposite of "report boundary": between reports the strategy must
    ///      read the venue, and the vault's own `totalAssets` stays the report-boundary
    ///      number.
    function test_strategyTotalAssetsIsLiveSoTheVaultCanSeeTheVenue() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        venue.setTotalAssets(11_000 * ONE_USDG);

        assertEq(
            IStrategyERC4626(address(harness)).strategyTotalAssets(),
            11_000 * ONE_USDG,
            "live valuation, else the vault can never report this position"
        );
        assertEq(harness.totalAssetsIncludingIdle(), 11_000 * ONE_USDG);
    }

    function test_venueSharesAndIdleBothCountInTotalAssets() external {
        usdg.mint(address(harness), 10_000 * ONE_USDG);
        harness.exposeDeployFunds(10_000 * ONE_USDG);
        usdg.mint(address(harness), 1_234 * ONE_USDG);

        assertEq(harness.totalAssetsIncludingIdle(), 11_234 * ONE_USDG);
        assertEq(harness.venueShares(), 10_000 * ONE_USDG * 1e12);
    }

    function test_usdgIsSixDecimalsAndVenueShareIsEighteen() external view {
        // Guards the trap that costs 1e12 when used interchangeably.
        assertEq(usdg.decimals(), 6);
        assertEq(venue.decimals(), 18);
        // 1 USDG (1e6 asset units) is 1e18 venue shares: pps 1.0 across the 6/18 gap.
        assertEq(venue.convertToShares(ONE_USDG), 1e18);
        assertEq(venue.convertToAssets(1e18), ONE_USDG);
        assertEq(venue.convertToAssets(1e12), ONE_USDG / 1e6);
    }

    /*//////////////////////////////////////////////////////////////
                              EMERGENCY
    //////////////////////////////////////////////////////////////*/

    function test_emergencyWithdrawUnwindsWholePosition() external {
        vm.prank(user);
        IStrategyERC4626(address(harness)).deposit(10_000 * ONE_USDG, user);

        IStrategyERC4626(address(harness)).setPaused(true);
        IStrategyERC4626(address(harness)).emergencyWithdraw(1);

        // `_amount` is ignored on purpose; the point is to hold assets again.
        assertEq(venue.balanceOf(address(harness)), 0, "venue position closed");
        assertEq(usdg.balanceOf(address(harness)), 10_000 * ONE_USDG, "idle after unwind");
    }

    function test_emergencyWithdrawIsNoOpWithoutShares() external {
        IStrategyERC4626(address(harness)).setPaused(true);
        IStrategyERC4626(address(harness)).emergencyWithdraw(1);
        assertEq(usdg.balanceOf(address(harness)), 0);
    }

    /*//////////////////////////////////////////////////////////////
                           FUZZ: ROUND TRIP
    //////////////////////////////////////////////////////////////*/

    /// @dev A deposit followed by a full redemption must never return more than went
    ///      in. Rounding that favours the user is an extraction path, not a nitpick.
    function testFuzz_noFreeValueFromDepositRedeem(
        uint256 amount
    ) external {
        amount = bound(amount, 10 * ONE_USDG, 100_000 * ONE_USDG);

        vm.startPrank(user);
        uint256 shares = IStrategyERC4626(address(harness)).deposit(amount, user);
        uint256 out = IStrategyERC4626(address(harness)).redeem(shares, user, user);
        vm.stopPrank();

        assertLe(out, amount, "redeem paid more than the deposit");
        assertGe(out + 1e6, amount, "redeem lost more than rounding dust");
    }
}
