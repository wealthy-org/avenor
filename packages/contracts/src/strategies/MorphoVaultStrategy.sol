// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.18;

import { BaseStrategy, ERC20 } from "tokenized-strategy/BaseStrategy.sol";
import { IMorphoVaultV2 } from "../interfaces/IMorphoVaultV2.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MorphoVaultStrategy
 * @notice Yearn V3 `TokenizedStrategy` adapter that holds USDG and supplies it to a
 *         single ERC-4626 Morpho Vault V2 venue (v1: `steakUSDG` on chain 4663).
 *
 * Design constraints, all of them load-bearing:
 *
 * 1. The strategy holds the vault asset (USDG, 6 decimals), never another vault's
 *    share token as an accounting unit. Venue shares (`steakUSDG`, 18 decimals) are
 *    an implementation detail and are only ever converted through
 *    `convertToAssets`, never treated as 1:1 with USDG. Getting this wrong is a
 *    1e12 error that does not revert.
 *
 * 2. `_freeFunds` reverts rather than silently under-delivering. `TokenizedStrategy`
 *    `_withdraw` (`lib/tokenized-strategy/src/TokenizedStrategy.sol:1156-1181`) treats
 *    any shortfall as a *loss* and burns the caller's full share balance; with the
 *    vault's `redeem` default `max_loss = 10000` that would let a liquidity problem
 *    quietly become a user loss. Refusing to free the full amount keeps `max_loss`
 *    meaningful and makes the failure visible. `BaseStrategy`'s own guidance agrees:
 *    "It may be better to revert if withdraws are simply illiquid so not to realize
 *    incorrect losses" (`BaseStrategy.sol:195-200`).
 *
 * 3. `availableWithdrawLimit` reports idle + venue liquidity, so `maxWithdraw` and
 *    `maxRedeem` tell the truth about what can be serviced right now. A UI that
 *    wants a guaranteed-success withdrawal reads these, not a hardcoded amount.
 *
 * 4. `_strategyTotalAssets` is overridden for live accounting, and it has to be.
 *    `BaseStrategy`'s default returns `TokenizedStrategy.lastTotalAssets()`, which only
 *    moves when the *strategy* reports. `VaultV3._process_report` (`VaultV3.vy:1069`)
 *    never calls `strategy.report()` — it reads `convertToAssets` first and derives
 *    gain/loss from it. With the default, a venue gain or loss is therefore invisible
 *    to the vault forever and can never be reported: a single untracked venue position
 *    would pin the vault's debt reporting to a value that can never change. Reading the
 *    venue's own `convertToAssets` is read-only (no state to poke, no donation vector
 *    the venue does not already control), so live is safe here and is the only option
 *    that keeps the report path reachable. User-facing numbers still come from the
 *    vault, whose `totalAssets`/`totalSupply` remain report-boundary
 *    (`docs/ACCOUNTING.md`): strategy-level live pricing feeds the report, it does not
 *    replace it.
 *
 * 5. No `transfer_hook`, no `_tend`, no leverage, no swaps, no `delegatecall` to the
 *    venue (`docs/SECURITY_DIFF.md` §2.3, `docs/VENUE_INTEGRATIONS.md` §3).
 *
 * 6. The strategy charges no fee of its own. `TokenizedStrategy.initialize` hardcodes a
 *    10% performance fee to `msg.sender` and a 10-day profit unlock
 *    (`TokenizedStrategy.sol:481-489`); both are cleared by `Deploy.s.sol`
 *    (`_configureStrategy`) and read back there, because the constructor cannot do it:
 *    every one of those setters calls `_accrue`, which calls back into
 *    `IBaseStrategy(address(this)).strategyTotalAssets()` and reverts while the contract
 *    has no code yet. Leaving the 10% in place would charge a second performance fee on
 *    top of the `Accountant`'s, silently, through `convertToShares`.
 *
 * 7. Neither the venue's capacity gate nor its `withdraw` return value is trusted, and
 *    both were measured at block `118337511` rather than assumed. `maxDeposit` answers
 *    `0` to every address while `deposit(10_000e6)` succeeds, so a zero is treated as
 *    "ask the venue" (`availableDepositLimit` reports no adapter-level limit and
 *    `_deployFunds` attempts the call, keeping funds idle and emitting
 *    `VenueDepositSkipped` if it is refused); believing the zero would make
 *    `VaultV3.update_debt` a permanent no-op. `withdraw` returns the venue **shares** it
 *    burned (18 decimals), not the assets it paid, so `_freeFunds` measures the USDG
 *    balance delta and never compares the return value to a 6-decimal amount. See
 *    `docs/VENUE_INTEGRATIONS.md` §4a.
 */
contract MorphoVaultStrategy is BaseStrategy {
    using SafeERC20 for ERC20;

    /// @notice The ERC-4626 venue this strategy supplies to. Immutable: a venue
    ///         change requires a new strategy, so the code that was reviewed is the
    ///         code that runs.
    IMorphoVaultV2 public immutable venue;

    /// @notice Thrown when the venue cannot free the requested amount right now.
    /// @dev Deliberately a distinct error, not a generic revert string: the app keys
    ///      "venue illiquid" UI off this, and the keeper must not treat it as a bug.
    error VenueLiquidityShortfall(uint256 requested, uint256 available);

    /// @notice Thrown at construction when the venue is not usable with `asset`.
    error VenueAssetMismatch(address venueAsset, address strategyAsset);

    /// @notice Thrown when a non-zero deposit minted no venue shares.
    /// @dev Not expected from a correct ERC-4626 venue, but a venue that silently
    ///      keeps assets and mints nothing would strand strategy funds; the whole
    ///      transaction reverts, so the assets are never actually taken.
    error DepositMintedNoShares(uint256 assets);

    /// @notice Emitted when the venue's own capacity getter said "no" and the deposit
    ///         attempt failed, so `_amount` stayed idle instead of being deployed.
    /// @dev Visible on purpose. Swallowing the failure keeps a closed venue from
    ///      bricking user deposits, but "funds sat idle" is an operational fact the
    ///      keeper should be able to see in logs rather than infer from a flat yield.
    event VenueDepositSkipped(uint256 amount, bytes reason);

    constructor(
        address _asset,
        address _venue,
        string memory _name
    ) BaseStrategy(_asset, _name) {
        if (_venue.code.length == 0) revert VenueAssetMismatch(address(0), _asset);
        address venueAsset = IMorphoVaultV2(_venue).asset();
        // Fail at deploy time, not on the first deposit: a mismatched venue would
        // otherwise only surface once a keeper allocates real money to it.
        if (venueAsset != _asset) revert VenueAssetMismatch(venueAsset, _asset);
        venue = IMorphoVaultV2(_venue);
    }

    /*//////////////////////////////////////////////////////////////
                        STRATEGIST HOOKS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Deploy up to `_amount` of loose USDG into the venue.
     *
     * Clamped to `venue.maxDeposit(address(this))` **when that limit is honest**. A
     * venue that would refuse must leave funds idle, not revert. `TokenizedStrategy._deposit`
     * calls this with the strategy's entire loose balance after every deposit, so
     * "deploy what is possible, leave the rest" is the only behaviour that cannot
     * brick deposits — and a venue that reports `0` while accepting deposits (this one
     * does) must still be tried, see `availableDepositLimit`.
     *
     * Allowance is granted for the exact amount and reset to zero afterwards, the
     * same hygiene `VaultV3.vy` uses for strategy debt.
     */
    function _deployFunds(
        uint256 _amount
    ) internal override {
        if (_amount == 0) return;

        // `maxDeposit` is clamped to when it is honest, ignored when it is not:
        // `availableDepositLimit` explains why a zero from this venue cannot be
        // believed. A zero therefore means "ask the venue", not "impossible".
        uint256 limit = venue.maxDeposit(address(this));
        uint256 toDeposit = limit == 0 ? _amount : (_amount < limit ? _amount : limit);
        if (toDeposit == 0) return;

        ERC20 _asset = asset;
        _asset.forceApprove(address(venue), toDeposit);
        try venue.deposit(toDeposit, address(this)) returns (uint256 shares) {
            if (shares == 0) revert DepositMintedNoShares(toDeposit);
        } catch (bytes memory reason) {
            // The venue refused. Keeping the USDG loose is the only outcome that can
            // never lose funds, and reverting here would turn a closed venue into a
            // broken vault deposit path. The skip is logged, not hidden.
            //
            // `reentrancy-events` lint (event after an external call) is accepted here and
            // not silenced by accident: the external call is the one that just *reverted*,
            // so its state changes are rolled back; and this event is telemetry for the
            // keeper, never an input to accounting, share price, or debt. A reentrant caller
            // could at most reorder or duplicate a log entry, and `VenueDepositSkipped`
            // carries the amount that stayed idle, which the next `report()` re-derives from
            // balances anyway. Emitting before the call is impossible — the reason only
            // exists after it fails.
            // forge-lint: disable-next-line(reentrancy-events)
            emit VenueDepositSkipped(toDeposit, reason);
        }
        // Reset on both paths: a lingering allowance is a standing approval for the
        // venue to move strategy funds, and it survives to the next call.
        _asset.forceApprove(address(venue), 0);
    }

    /**
     * @dev Free exactly `_amount` of USDG from the venue, or revert.
     *
     * See constraint (2) in the contract header for why this does not partially
     * fill. `assets - idle` is what `TokenizedStrategy` asks for; idle is handled by
     * the caller, so this function only ever pulls the difference.
     */
    function _freeFunds(
        uint256 _amount
    ) internal override {
        if (_amount == 0) return;

        uint256 available = _venueLiquidity();
        if (available < _amount) revert VenueLiquidityShortfall(_amount, available);

        // Measured, not trusted: `steakUSDG.withdraw` returns the *shares* it burned
        // (18 decimals), not the assets it paid. Measured at block `118337511`:
        // `withdraw(2_000e6)` returned `1_972_395_553_874_949_732_308` while paying
        // exactly `2_000.000000` USDG. Comparing that return value against a 6-decimal
        // asset amount compares two different units and would pass for any payout.
        ERC20 _asset = asset;
        uint256 before = _asset.balanceOf(address(this));
        // forge-lint: disable-next-line(unused-return)
        venue.withdraw(_amount, address(this), address(this));
        uint256 received = _asset.balanceOf(address(this)) - before;
        // The clamp above is a measurement, not a promise; if the venue pays out less
        // anyway, treat it as the same illiquidity condition rather than booking a
        // phantom asset.
        if (received < _amount) revert VenueLiquidityShortfall(_amount, received);
    }

    /**
     * @dev Live valuation, read by `TokenizedStrategy.totalAssets`/`convertToAssets`.
     *
     * See constraint (4) in the contract header: without this override the venue position
     * is invisible to `VaultV3.process_report`, which derives gain/loss from
     * `convertToAssets` and never calls `report()` on the strategy. Both this and
     * `_harvestAndReport` return the same number so a report cannot disagree with the
     * view a keeper priced it on.
     */
    function _strategyTotalAssets() internal view override returns (uint256) {
        return _totalAssets();
    }

    /**
     * @dev Report = idle USDG + the venue position valued in USDG.
     *
     * `convertToAssets` (rounded down) is used on purpose: it is the conservative
     * direction for a report, and it is the same function the venue documents for
     * share-to-asset conversion. `previewRedeem` is not used for accounting because
     * its rounding direction is chosen for withdrawals, not for valuation.
     *
     * Declared `view`: this adapter has no rewards to claim or venue state to poke,
     * so the hook must not pretend it can mutate. If a future venue needs an accrual
     * poke, that changes this signature and is a deliberate, reviewable decision.
     */
    function _harvestAndReport() internal view override returns (uint256) {
        return _totalAssets();
    }

    /**
     * @dev Pull the whole venue position back to the strategy on shutdown.
     *
     * `_amount` is ignored on purpose: in an emergency the goal is to hold assets,
     * not to free a specific number, and `redeem` of the full share balance is the
     * only call guaranteed to leave no position behind.
     */
    function _emergencyWithdraw(
        uint256
    ) internal override {
        uint256 shares = venue.balanceOf(address(this));
        if (shares == 0) return;
        // The return value is the assets paid out; it has no invariant to check here
        // because the share balance is what we are unwinding.
        // forge-lint: disable-next-line(unused-return)
        venue.redeem(shares, address(this), address(this));
    }

    /*//////////////////////////////////////////////////////////////
                    CAPACITY REPORTED TO THE VAULT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Remaining USDG the venue will accept for this strategy.
     * @dev Used by `TokenizedStrategy.maxDeposit`, which is what `VaultV3.update_debt`
     *      is bounded by. The product-level cap lives in vault `deposit_limit`/debt
     *      caps; this only mirrors the venue.
     *
     *      A **zero** from the venue is not believed. Measured at block `118337511`:
     *      `steakUSDG.maxDeposit(...)` answered `0` for every address — a fresh one, the
     *      curator, the venue itself — while `deposit(10_000e6)` succeeded and minted
     *      `9_861.9777693747` shares for exactly `10_000.000000` USDG
     *      (`test/fork/VenueProbe.t.sol`, see `docs/VENUE_INTEGRATIONS.md` §4a). Returning
     *      that zero would make `VaultV3.update_debt` a permanent no-op and leave every
     *      deposit idle forever: a maximally safe way to run a vault that earns nothing.
     *      So a zero is reported as "no adapter-level limit" and `_deployFunds` finds the
     *      real edge by attempting the deposit; a venue that is genuinely closed keeps
     *      the funds idle and emits `VenueDepositSkipped`.
     */
    function availableDepositLimit(
        address
    ) public view override returns (uint256) {
        uint256 limit = venue.maxDeposit(address(this));
        return limit == 0 ? type(uint256).max : limit;
    }

    /**
     * @notice USDG that could be paid out right now: idle plus venue liquidity.
     * @dev Overflow is handled explicitly; `type(uint256).max` is the sentinel
     *      `TokenizedStrategy` uses for "no limit" and must not be produced by
     *      accident.
     */
    function availableWithdrawLimit(
        address
    ) public view override returns (uint256) {
        uint256 idle = asset.balanceOf(address(this));
        uint256 venueLiquidity = _venueLiquidity();
        unchecked {
            uint256 total = idle + venueLiquidity;
            // If the sum wrapped, report "no limit" instead of a bogus small number.
            if (total < idle) return type(uint256).max;
            return total;
        }
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW HELPERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev USDG the venue can pay *now*: measured, never asked.
     *
     * `venue.maxWithdraw(address(this))` is deliberately not used as the bound. On the
     * real venue at block `118337511` it answered `0` for a 8.21M-share position — and
     * `0` for the holder itself — while the venue held `27_024_457.979514` USDG idle and
     * redeemed that whole position for `8_328_471.0105` USDG. A limit built on
     * `maxWithdraw` would have told users "nothing is withdrawable" with the money
     * sitting there. See `test/fork/VenueProbe.t.sol`.
     *
     * What the venue actually enforces is its own cash balance: withdrawing more than
     * the idle cash reverts instead of paying partially. The revert payload is **not**
     * stable run to run (`Panic(0x11)` in some runs, empty revert data in others — it is
     * venue-internal per-market math), so nothing here depends on it: the bound is
     * `min(position value, venue idle USDG)`, which is what the two reads below compute.
     * The venue is an ERC-4626 with no queue: idle cash is the queue.
     */
    function _venueLiquidity() internal view returns (uint256) {
        uint256 shares = venue.balanceOf(address(this));
        if (shares == 0) return 0;
        uint256 value = venue.convertToAssets(shares);
        uint256 cash = asset.balanceOf(address(venue));
        return value < cash ? value : cash;
    }

    /// @notice USDG value of the strategy's whole position (idle + venue).
    function totalAssetsIncludingIdle() external view returns (uint256) {
        return _totalAssets();
    }

    /// @notice Venue shares held, exposed for the indexer and for reconciliation.
    function venueShares() external view returns (uint256) {
        return venue.balanceOf(address(this));
    }

    function _totalAssets() internal view returns (uint256) {
        uint256 shares = venue.balanceOf(address(this));
        uint256 deployed = shares == 0 ? 0 : venue.convertToAssets(shares);
        return asset.balanceOf(address(this)) + deployed;
    }
}
