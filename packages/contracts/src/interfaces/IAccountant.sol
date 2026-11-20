// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/// @title IAccountant — the subset of Yearn's `Accountant` the vault and our tooling touch
/// @notice Source of truth: `lib/yearn-periphery/src/accountants/Accountant.sol`, a
///         byte-identical copy of vault-periphery commit 672de1c98450ab4485fd0da1f5d3d47dc97500b8
///         (`scripts/check-vendor.py` re-verifies the hash against that commit).
/// @dev Why hand-written instead of generated: upstream publishes no deployment artifact
///      for this contract, so `scripts/gen-interfaces.py` has nothing to read. This file is
///      therefore a *reviewed transcription*, not a proven ABI — every selector here is
///      additionally exercised by `test/unit/AccountantFees.t.sol` against the real
///      compiled bytecode, which is the only evidence that matters.
///
///      Two traps this interface is shaped around:
///      1. `report()` is gated on `msg.sender` being an added vault. A vault that calls
///         `process_report` before `addVault` reverts with `"vault not added"` — and
///         `VaultV3` calls `accountant.report` only when `accountant != address(0)`, so
///         `set_accountant` without `addVault` bricks every report.
///      2. `redeemUnderlying` passes `maxLoss` to `IVault.redeem`. With the default 0 the
///         fee manager cannot realise fees into assets while the vault has any unrealised
///         loss; that is deliberate and asserted at deploy time.
interface IAccountant {
    /// @dev Field order and widths copied from `Accountant.sol:56-64`. Changing the order
    ///      silently reinterprets an existing `defaultConfig()` return.
    struct Fee {
        uint16 managementFee;
        uint16 performanceFee;
        uint16 refundRatio;
        uint16 maxFee;
        uint16 maxGain;
        uint16 maxLoss;
        bool custom;
    }

    enum ChangeType {
        NULL,
        ADDED,
        REMOVED
    }

    // --- constants ----------------------------------------------------------
    /// @dev `MAX_BPS` and `SECS_PER_YEAR` are `internal` in the source (`:109-112`) and
    ///      therefore have no getter; do not add them here. These two are `public`.
    function MANAGEMENT_FEE_THRESHOLD() external view returns (uint16);
    function PERFORMANCE_FEE_THRESHOLD() external view returns (uint16);

    // --- ownership ----------------------------------------------------------
    /// @dev Prod: must be the timelock. A hot key here can rewrite `performanceFee` up to
    ///      `PERFORMANCE_FEE_THRESHOLD` (5.000 bps) without any delay.
    function feeManager() external view returns (address);
    function futureFeeManager() external view returns (address);
    function feeRecipient() external view returns (address);
    function vaultManager() external view returns (address);
    /// @dev Redeem tolerance in bps used by `redeemUnderlying`. 0 = no loss accepted.
    function maxLoss() external view returns (uint256);

    // --- fee configuration --------------------------------------------------
    /// @dev Auto-generated getter for the public struct: returns the fields in order.
    function defaultConfig()
        external
        view
        returns (
            uint16 managementFee,
            uint16 performanceFee,
            uint16 refundRatio,
            uint16 maxFee,
            uint16 maxGain,
            uint16 maxLoss,
            bool custom
        );
    function customConfig(
        address vault
    )
        external
        view
        returns (
            uint16 managementFee,
            uint16 performanceFee,
            uint16 refundRatio,
            uint16 maxFee,
            uint16 maxGain,
            uint16 maxLoss,
            bool custom
        );
    function getVaultConfig(
        address vault
    ) external view returns (Fee memory fee);
    function useCustomConfig(
        address vault
    ) external view returns (bool);
    function vaults(
        address vault
    ) external view returns (bool);

    // --- state changes ------------------------------------------------------
    function addVault(
        address vault
    ) external;
    function removeVault(
        address vault
    ) external;
    function updateDefaultConfig(
        uint16 defaultManagement,
        uint16 defaultPerformance,
        uint16 defaultRefund,
        uint16 defaultMaxFee,
        uint16 defaultMaxGain,
        uint16 defaultMaxLoss
    ) external;
    function setCustomConfig(
        address vault,
        uint16 customManagement,
        uint16 customPerformance,
        uint16 customRefund,
        uint16 customMaxFee,
        uint16 customMaxGain,
        uint16 customMaxLoss
    ) external;
    function removeCustomConfig(
        address vault
    ) external;
    function turnOffHealthCheck(
        address vault,
        address strategy
    ) external;
    function setMaxLoss(
        uint256 _maxLoss
    ) external;
    function setFutureFeeManager(
        address _futureFeeManager
    ) external;
    function acceptFeeManager() external;
    function setVaultManager(
        address _vaultManager
    ) external;
    function setFeeRecipient(
        address _feeRecipient
    ) external;
    function redeemUnderlying(
        address vault
    ) external;
    function redeemUnderlying(
        address vault,
        uint256 amount
    ) external;
    function distribute(
        address token
    ) external;
    function distribute(
        address token,
        uint256 amount
    ) external;

    // --- the one function the vault calls ----------------------------------
    /// @notice Vault -> accountant, inside `process_report`.
    /// @dev Health checks (`maxGain`, `maxLoss`) revert rather than clamp: a keeper that
    ///      reports an absurd number fails loudly instead of moving value quietly.
    function report(
        address strategy,
        uint256 gain,
        uint256 loss
    ) external returns (uint256 totalFees, uint256 totalRefunds);
}
