// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { ForkBase } from "./ForkBase.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { Roles } from "../../src/interfaces/Roles.sol";
import { IMorphoVaultV2 } from "../../src/interfaces/IMorphoVaultV2.sol";
import { IAccountant } from "../../src/interfaces/IAccountant.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev The strategy is a `BaseStrategy`: `balanceOf`, `convertToAssets`,
///      `availableWithdrawLimit` and `withdraw` all come from the delegatecalled
///      `TokenizedStrategy` at the canonical address, so they are only readable on a fork
///      (or with `vm.etch`). Declared here instead of imported so this file cannot drift
///      into using an internal helper that does not exist on-chain.
interface IStrategyLike {
    function balanceOf(
        address owner
    ) external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function convertToAssets(
        uint256 shares
    ) external view returns (uint256);
    function availableWithdrawLimit(
        address owner
    ) external view returns (uint256);
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256);
}

/// @notice End-to-end run of the real stack against real chain-4663 state at the pin.
///
/// @dev Nothing here is mocked. `VaultV3` (deployed from the reviewed artifact, hash-checked
///      by `Deploy.s.sol`), `VaultFactory`, `Accountant`, `MorphoVaultStrategy`, the
///      `TokenizedStrategy` implementation already on chain, the USDG token and `steakUSDG`
///      itself all run their real bytecode against real state. The only funding cheat is
///      `deal` on real USDG to give the deployer and the test user a balance — that is a
///      wallet top-up, not a state claim about the venue.
///
///      Two measured venue quirks shape what these tests can prove, and both are asserted
///      here rather than assumed:
///
///      1. `maxDeposit` answers `0` for every address while `deposit` succeeds. The adapter
///         must not believe the zero (it would make `VaultV3.update_debt` a permanent no-op),
///         so it deploys anyway and finds the real edge by attempting — see
///         `MorphoVaultStrategy.availableDepositLimit`.
///      2. `withdraw` returns **shares burned**, not assets paid, so `_freeFunds` measures
///         the USDG balance delta instead of trusting the return value.
///
///      What cannot be proven at this pin is a shortfall: the venue holds
///      `27_024_457.979514` USDG idle while the vault's whole debt cap is `100_000` USDG, so
///      "venue cannot pay" is unreachable from the outside. That path is covered where it is
///      reachable — `test/unit/MorphoVaultStrategy.t.sol` (venue that reports liquidity it
///      does not have) and `test/fork/VenueProbe.t.sol` (over-drawing the venue's idle cash
///      reverts, payload not pinned) — and `test_e2e_shortfallIsUnreachableAtThePin` pins the
///      reason.
contract VaultE2ETest is ForkBase {
    Deploy internal deployer;
    IVaultV3 internal vault;
    IStrategyLike internal strategy;
    IMorphoVaultV2 internal venue;
    IERC20 internal usdg;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal proposer = makeAddr("proposer");
    address internal user = makeAddr("user");
    address internal sink = address(0xdEaD);

    uint256 internal constant CAP = 1_000_000e6;
    uint256 internal constant SEED = 1_000e6;
    uint256 internal constant DEPOSIT = 10_000e6;
    uint256 internal constant MAX_DEBT = 100_000e6;

    /// @dev Rounding allowance for the real venue: a deposit mints shares rounded down and
    ///      `convertToAssets` rounds down again, so a round trip can lose single wei.
    uint256 internal constant VENUE_ROUNDING = 2;

    Deploy.Deployment internal d;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        _requirePinnedFork();
        usdg = IERC20(USDG);
        venue = IMorphoVaultV2(STEAK_USDG);
        _deployStack();
    }

    /// @dev Deploys the whole stack through the same `deployAll` a rehearsal uses. The
    ///      script deploys its own 48h timelock (DryRun mode) and performs the seed, the
    ///      role matrix and every safety assert on the way — so a fork run here also proves
    ///      the deploy path works against real contracts, not just mocks.
    function _deployStack() internal {
        deployer = new Deploy();
        address actor = address(deployer);

        deal(USDG, actor, 10 * SEED);
        deal(USDG, user, DEPOSIT);

        d = deployer.deployAll(
            Deploy.Config({
                mode: Deploy.Mode.DryRun,
                actor: actor,
                usdg: USDG,
                venue: STEAK_USDG,
                timelock: address(0),
                proposer: proposer,
                guardian: guardian,
                keeper: keeper,
                treasury: treasury,
                management: address(0),
                maxDebt: MAX_DEBT,
                minimumTotalIdle: 0,
                seedAssets: SEED,
                vaultName: "Avenor USDG Managed Vault",
                vaultSymbol: "avUSDG",
                strategyName: "Avenor USDG steakUSDG",
                factoryName: "Avenor Vault Factory",
                placeholdersUsed: false,
                gitRev: "fork-e2e",
                feeRecipient: treasury,
                performanceFee: 1_000,
                managementFee: 0,
                refundRatio: 0,
                maxFee: 0,
                maxGain: 500,
                maxLoss: 200
            })
        );

        vault = IVaultV3(d.vault);
        strategy = IStrategyLike(d.strategy);
    }

    /// @dev Opening the product is a governance action (`DEPOSIT_LIMIT_MANAGER`). In
    ///      DryRun mode the script contract is still `role_manager` and its bootstrap bits
    ///      were dropped, so this impersonates the script contract exactly as the 48h
    ///      timelock proposal would act after `accept_role_manager()`.
    function _openDepositLimit() internal {
        vm.startPrank(address(deployer));
        vault.set_role(address(deployer), Roles.DEPOSIT_LIMIT_MANAGER);
        vault.set_deposit_limit(CAP);
        vault.set_role(address(deployer), 0);
        vm.stopPrank();
    }

    function _deposit(
        uint256 assets
    ) internal returns (uint256 shares) {
        vm.startPrank(user);
        usdg.approve(address(vault), assets);
        shares = vault.deposit(assets, user);
        vm.stopPrank();
        assertGt(shares, 0, "deposit minted no shares");
    }

    /// @dev Allocates real USDG to the strategy and asserts the venue *actually* took it.
    ///      This is the assertion that used to fail: at the pin `maxDeposit` reports `0`, so
    ///      a `VaultV3.update_debt` bounded by that getter silently returned `current_debt`
    ///      and the money never moved.
    function _allocateToVenue(
        uint256 assets
    ) internal returns (uint256 venueShares) {
        vm.prank(keeper);
        vault.update_debt(d.strategy, assets);

        assertEq(vault.totalDebt(), assets, "vault booked the debt");
        assertEq(usdg.balanceOf(d.strategy), 0, "strategy deployed everything it received");
        venueShares = venue.balanceOf(d.strategy);
        assertGt(venueShares, 0, "venue took the deposit despite reporting maxDeposit == 0");
        assertApproxEqAbs(
            venue.convertToAssets(venueShares), assets, VENUE_ROUNDING, "position value"
        );
    }

    /*//////////////////////////////////////////////////////////////
        A. REAL PATH: DEPOSIT -> ALLOCATE -> REPORT -> WITHDRAW ALL
    //////////////////////////////////////////////////////////////*/

    /// @notice The full lifecycle, all of it real: the venue takes the money, the vault
    ///         reports a venue-price move, and the user exits back into USDG.
    function test_e2e_depositAllocateReportWithdrawAll() external {
        _openDepositLimit();
        uint256 shares = _deposit(DEPOSIT);

        assertEq(vault.totalIdle(), SEED + DEPOSIT, "idle after deposit");
        assertEq(vault.totalDebt(), 0, "no debt before allocation");
        assertEq(vault.totalAssets(), SEED + DEPOSIT, "assets after deposit");

        uint256 venueShares = _allocateToVenue(DEPOSIT);
        assertEq(vault.totalIdle(), SEED, "idle after allocation");
        assertEq(vault.totalAssets(), SEED + DEPOSIT, "assets unchanged by a move");

        // A fresh deposit mints at the venue's current price, so there is no gain to book
        // and — because the venue rounds shares down — at most a rounding loss of a few wei.
        (uint256 gain, uint256 loss) = _report();
        assertEq(gain, 0, "no gain on a fresh venue position");
        assertLe(loss, VENUE_ROUNDING, "only venue rounding");

        // The user exits the way the app does: redeem everything they hold, tolerating the
        // vault's own rounding but not a hidden loss.
        uint256 userShares = vault.balanceOf(user);
        uint256 before = usdg.balanceOf(user);
        vm.prank(user);
        uint256 got = vault.redeem(userShares, user, user, 1);

        assertApproxEqAbs(got, DEPOSIT, VENUE_ROUNDING, "user made whole up to rounding");
        assertEq(usdg.balanceOf(user), before + got, "user paid in USDG");
        assertEq(vault.balanceOf(user), 0, "user shares burned");
        assertLt(venue.balanceOf(d.strategy), venueShares, "venue position unwound");

        // `VaultV3` pays a withdrawal from idle first and only then pulls debt, so what is
        // left is the dead shares' slice of the seed — still denominated in USDG, no longer
        // all in debt. Asserting `totalDebt == 0` here was wrong for that reason.
        assertEq(vault.totalIdle(), 0, "idle was spent first");
        assertApproxEqAbs(
            vault.totalDebt() + vault.totalIdle(),
            SEED,
            VENUE_ROUNDING,
            "only the seed's slice remains"
        );
        assertEq(vault.balanceOf(sink), vault.totalSupply(), "dead shares are the whole supply");
        assertApproxEqAbs(
            vault.convertToAssets(vault.balanceOf(sink)), SEED, VENUE_ROUNDING, "seed value"
        );
        assertGt(shares, 0, "share price sanity");
    }

    /*//////////////////////////////////////////////////////////////
        B. PARTIAL WITHDRAWAL FROM A REAL VENUE POSITION
    //////////////////////////////////////////////////////////////*/

    /// @notice Half the money out while the position sits in `steakUSDG`: the adapter has to
    ///         free USDG from the venue, and the venue's `maxWithdraw` lies the whole time.
    function test_e2e_partialWithdrawalFreesFundsFromTheVenue() external {
        _openDepositLimit();
        _deposit(DEPOSIT);
        uint256 venueShares = _allocateToVenue(DEPOSIT);

        // Both getters the naive implementation would use are still lying.
        assertEq(venue.maxWithdraw(d.strategy), 0, "venue maxWithdraw lies");
        assertEq(venue.maxRedeem(d.strategy), 0, "venue maxRedeem lies");
        assertGe(
            strategy.availableWithdrawLimit(address(vault)),
            DEPOSIT - VENUE_ROUNDING,
            "adapter measured the liquidity itself"
        );

        uint256 half = DEPOSIT / 2;
        uint256 before = usdg.balanceOf(user);
        vm.prank(user);
        uint256 got = vault.withdraw(half, user, user, 1);

        assertApproxEqAbs(got, half, VENUE_ROUNDING, "half out");
        assertEq(usdg.balanceOf(user), before + got, "user paid in USDG");
        assertLt(venue.balanceOf(d.strategy), venueShares, "venue redeemed shares to pay");
        assertGt(venue.balanceOf(d.strategy), 0, "position still open");
        // Idle (the seed) is spent before debt is pulled, so the debt falls by less than
        // the amount paid out; what must hold is that the vault still owns exactly the rest.
        assertApproxEqAbs(
            vault.totalDebt() + vault.totalIdle(),
            SEED + DEPOSIT - got,
            VENUE_ROUNDING,
            "vault assets conserved"
        );
        assertLt(usdg.balanceOf(STEAK_USDG), PIN_VENUE_IDLE_USDG, "venue cash really dropped");
    }

    /*//////////////////////////////////////////////////////////////
        C. GAIN PATH: VENUE ACCRUAL IS REPORTED AND FEE'D
    //////////////////////////////////////////////////////////////*/

    /// @notice `warp` forward so the venue's Morpho markets accrue, then report: the gain has
    ///         to reach the vault as debt (not vanish in the strategy) and the `Accountant`
    ///         has to mint its fee to the treasury. No synthetic APY — the number comes from
    ///         the venue's own `totalAssets` after real interest accrual.
    function test_e2e_venueAccrualIsReportedAsGainAndFee() external {
        _openDepositLimit();
        _deposit(DEPOSIT);
        uint256 venueShares = _allocateToVenue(DEPOSIT);

        uint256 valueBefore = venue.convertToAssets(venueShares);
        vm.warp(block.timestamp + 30 days);
        uint256 valueAfter = venue.convertToAssets(venueShares);

        // 30 days of real accrual on a 10k position is small but non-zero; if the venue's
        // markets did not accrue at this pin the test says so instead of asserting a lie.
        assertGt(valueAfter, valueBefore, "venue accrued nothing over 30 days; drop this test");

        uint256 debtBefore = vault.totalDebt();
        (uint256 gain, uint256 loss) = _report();

        emit log_named_uint("venue value before", valueBefore);
        emit log_named_uint("venue value after ", valueAfter);
        emit log_named_uint("report gain        ", gain);
        emit log_named_uint("accountant shares  ", vault.balanceOf(d.accountant));

        assertEq(loss, 0, "no loss");
        assertGt(gain, 0, "gain booked");
        assertEq(vault.totalDebt(), debtBefore + gain, "gain added to the strategy's debt");
        assertEq(vault.totalAssets(), SEED + DEPOSIT + gain, "assets include the realised gain");
        // `VaultV3.vy:1313` mints fee shares to the **accountant**, not to the recipient;
        // the fee manager then redeems them and distributes the USDG. Both halves are real
        // here: the mint is a consequence of the report, the distribution is the keeper step.
        assertGt(vault.balanceOf(d.accountant), 0, "fee shares minted to the accountant");
        assertEq(IAccountant(d.accountant).feeRecipient(), treasury, "fee recipient wired");

        vm.startPrank(address(deployer));
        IAccountant(d.accountant).redeemUnderlying(d.vault);
        IAccountant(d.accountant).distribute(USDG);
        vm.stopPrank();

        assertGt(usdg.balanceOf(treasury), 0, "fees reached the treasury");
        assertEq(vault.balanceOf(d.accountant), 0, "accountant shares redeemed");
        assertEq(usdg.balanceOf(d.accountant), 0, "no USDG stranded in the accountant");
    }

    /*//////////////////////////////////////////////////////////////
        D. WHY A SHORTFALL CANNOT BE DRIVEN FROM OUTSIDE AT THIS PIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Records the measured reason the "venue cannot pay" path is unreachable here,
    ///         so nobody later mistakes its absence for missing coverage.
    /// @dev Venue idle cash is `27_024_457.979514` USDG; the vault's entire debt cap is
    ///      `100_000` USDG. A position big enough to outrun the cash cannot be built through
    ///      the vault. The guard itself is exercised in `MorphoVaultStrategy.t.sol`
    ///      (`VenueLiquidityShortfall` against a venue that lies about capacity) and the
    ///      venue's real over-draw behaviour (revert, payload not pinned) in
    ///      `VenueProbe.t.sol`.
    function test_e2e_shortfallIsUnreachableAtThePin() external {
        assertEq(PIN_VENUE_IDLE_USDG, 27_024_457_979_514, "pinned venue idle cash");
        assertEq(usdg.balanceOf(STEAK_USDG), PIN_VENUE_IDLE_USDG, "still true on this fork");
        assertGt(PIN_VENUE_IDLE_USDG, MAX_DEBT, "cash dwarfs the debt cap");
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _report() internal returns (uint256 gain, uint256 loss) {
        vm.prank(keeper);
        (gain, loss) = vault.process_report(d.strategy);
    }
}
