// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/// @title Roles
/// @notice Bit values accepted by `VaultV3.set_role` / `remove_role`, taken from the
///         pinned source (`yearn-vaults-v3` commit `f449264f`, file `Roles.sol`).
/// @dev These are *bit flags*, not enum ordinals. `set_role(account, 3)` grants
///      `ADD_STRATEGY_MANAGER | REVOKE_STRATEGY_MANAGER`, which is rarely what a
///      reviewer expects to read: always compose with `|` through these constants and
///      never write a bare number in a script or a test.
///      Verified against `_enforce_role` call sites in `VaultV3.vy`, see
///      `docs/ROLE_PERMISSION_MATRIX.md` §1 for the function → bit table.
library Roles {
    uint256 internal constant ADD_STRATEGY_MANAGER = 1;
    uint256 internal constant REVOKE_STRATEGY_MANAGER = 2;
    uint256 internal constant FORCE_REVOKE_MANAGER = 4;
    uint256 internal constant ACCOUNTANT_MANAGER = 8;
    uint256 internal constant QUEUE_MANAGER = 16;
    uint256 internal constant REPORTING_MANAGER = 32;
    uint256 internal constant DEBT_MANAGER = 64;
    uint256 internal constant MAX_DEBT_MANAGER = 128;
    uint256 internal constant DEPOSIT_LIMIT_MANAGER = 256;
    uint256 internal constant WITHDRAW_LIMIT_MANAGER = 512;
    uint256 internal constant MINIMUM_IDLE_MANAGER = 1024;
    uint256 internal constant PROFIT_UNLOCK_MANAGER = 2048;
    uint256 internal constant DEBT_PURCHASER = 4096;
    uint256 internal constant EMERGENCY_MANAGER = 8192;

    /// @notice Every bit set. `16383` on the pinned source; asserted by
    ///         `test/unit/Roles.t.sol` so a future bit addition cannot be missed.
    uint256 internal constant ALL = 16383;

    /// @notice Roles the governance timelock holds: everything that changes product
    ///         parameters, including the ability to add/revoke strategies.
    /// @dev Excludes `EMERGENCY_MANAGER` (guardian Safe holds it, so pausing never
    ///      waits 48h) and excludes `DEBT_MANAGER`/`REPORTING_MANAGER` (keeper holds
    ///      them so routine reports and allocation are not governance-gated).
    function governanceRoleSet() internal pure returns (uint256) {
        return ADD_STRATEGY_MANAGER | REVOKE_STRATEGY_MANAGER | FORCE_REVOKE_MANAGER
            | ACCOUNTANT_MANAGER | QUEUE_MANAGER | MAX_DEBT_MANAGER | DEPOSIT_LIMIT_MANAGER
            | WITHDRAW_LIMIT_MANAGER | MINIMUM_IDLE_MANAGER | PROFIT_UNLOCK_MANAGER;
    }

    /// @notice Roles the keeper hot wallet holds: report and allocate, nothing else.
    function keeperRoleSet() internal pure returns (uint256) {
        return REPORTING_MANAGER | DEBT_MANAGER;
    }

    /// @notice Bits that must never be held by a hot wallet. Asserted after every
    ///         grant in `script/Deploy.s.sol`.
    function dangerousBits() internal pure returns (uint256) {
        return EMERGENCY_MANAGER | FORCE_REVOKE_MANAGER | REVOKE_STRATEGY_MANAGER | DEBT_PURCHASER
            | ACCOUNTANT_MANAGER | DEPOSIT_LIMIT_MANAGER | WITHDRAW_LIMIT_MANAGER;
    }
}
