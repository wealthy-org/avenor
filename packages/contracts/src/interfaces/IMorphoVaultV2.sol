// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/// @title IMorphoVaultV2 — the subset of the venue interface Avenor is allowed to touch
/// @notice Venue used in v1: `steakUSDG` (Morpho Vault V2) on chain 4663.
/// @dev Evidence levels are marked per function. Do not add a function here without
///      either an on-chain read (recorded in `docs/VENUE_INTEGRATIONS.md`) or a test
///      that proves it works on the fork. Guessing an ABI is how a strategy silently
///      stops being able to withdraw.
///
///      Two facts that break naive integrations:
///      1. `asset` (USDG) has 6 decimals, venue **shares have 18**. Mixing them
///         produces a 1e12 error, not a revert.
///      2. `maxDeposit` is the real deposit authority. It can be 0 while the vault
///         looks healthy (`maxDeposit(0x0) == 0` observed on 2026-11-19). Never
///         treat "deposit reverted" as "temporary glitch".
interface IMorphoVaultV2 {
    // --- verified by direct on-chain read (block 118337511) ------------------

    /// @notice Underlying asset (USDG, 6 decimals).
    function asset() external view returns (address);

    /// @notice Venue share decimals — 18 for `steakUSDG`, not 6.
    function decimals() external view returns (uint8);

    /// @notice Total assets controlled by the venue (includes strategy positions).
    function totalAssets() external view returns (uint256);

    /// @notice Total venue shares outstanding.
    function totalSupply() external view returns (uint256);

    /// @notice Share -> asset conversion used by the vault's accounting.
    /// @dev Vault V3 assesses value through `convertToAssets`; do not substitute
    ///      `previewRedeem` (it includes fees/slippage and would understate debt).
    function convertToAssets(
        uint256 shares
    ) external view returns (uint256);

    /// @notice Asset -> share conversion.
    function convertToShares(
        uint256 assets
    ) external view returns (uint256);

    /// @notice Maximum assets the venue will accept from `receiver` right now.
    /// @dev A zero here is NOT a gate on Robinhood Chain 4663: at the pinned block
    ///      118337511 `maxDeposit(address(0))` answered `0` for every address while a
    ///      `deposit(10_000e6)` succeeded (`packages/config/4663.json`
    ///      `venues.steakUSDG.snapshot.maxDeposit_zero`, fork probe
    ///      `test/fork/VenueProbe.t.sol`). Treat a zero as a lying getter, not as a closed
    ///      gate — see `MorphoVaultStrategy.availableDepositLimit`.
    function maxDeposit(
        address receiver
    ) external view returns (uint256);

    /// @notice Curator of the venue (external risk counterparty; ADR-3).
    function curator() external view returns (address);

    /// @notice Venue share balance, 18 decimals.
    function balanceOf(
        address account
    ) external view returns (uint256);

    // --- assumed from ERC-4626 / Morpho Vault V2 spec, proven in ticket 2 tests -

    /// @notice Assets redeemable by `owner` right now (venue-side liquidity limit).
    /// @dev Measured at block `118337511`: answers `0` for a position worth 8.21M USDG
    ///      while the venue holds 27M USDG idle, and `withdraw` still pays. Read by
    ///      nothing in this repo on purpose — `docs/VENUE_INTEGRATIONS.md` §4a.
    function maxWithdraw(
        address owner
    ) external view returns (uint256);

    /// @notice Shares redeemable by `owner` right now.
    function maxRedeem(
        address owner
    ) external view returns (uint256);

    /// @notice Deposit assets, mint shares to `receiver`. Returns shares minted.
    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256 shares);

    /// @notice Withdraw assets to `receiver` from `owner`. Returns shares burned.
    /// @dev This venue returns **shares**, not assets — measured at block `118337511`:
    ///      `withdraw(2_000e6)` returned `1_972_395_553_874_949_732_308` and paid
    ///      `2_000.000000` USDG. Never compare the return value against an asset amount:
    ///      measure the USDG balance delta. `redeem` is the inconsistent sibling and does
    ///      return assets.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares);

    /// @notice Redeem shares for assets to `receiver` from `owner`.
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets);

    // --- deliberately absent --------------------------------------------------
    // `liquidity()` — reverts on `steakUSDG` (verified). Any code that calls it is
    // wrong; do not add it "for completeness".
    // `fee()` — not verified on this chain, and not needed by the v1 strategy. The
    // vault's own fee engine is `Accountant` (docs/FEE_CONFIG.md), a separate thing.
}
