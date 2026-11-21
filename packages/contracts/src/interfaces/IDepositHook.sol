// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/// @notice The two calls `VaultV3` makes on `deposit_hook` (`VaultV3.vy:545`, `:701`).
/// @dev Declared in Solidity because the upstream declaration lives in a `.vy` interface file
///      that Foundry would compile as a second language for one function. Signatures are the
///      ABI that matters: a mismatch here means the vault calls a function that does not exist
///      and every deposit reverts with no data.
interface IDepositHook {
    /// @notice Called from `_max_deposit(receiver)`: the vault's `maxDeposit` and the
    ///         `assets <= _max_deposit(receiver)` assert inside `deposit`.
    function available_deposit_limit(
        address receiver
    ) external view returns (uint256);

    /// @notice Called after shares are issued, with the depositor *and* the receiver, so the
    ///         hook cannot assume they are the same account.
    function post_deposit(
        address depositor,
        address recipient,
        uint256 assets,
        uint256 shares
    ) external;
}
