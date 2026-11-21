// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { Roles } from "../../src/interfaces/Roles.sol";

/// @notice Guards the hand-copied bit table. A wrong bit here is silent: the deploy script
///         would grant a role that the vault never checks, or one it checks somewhere else.
contract RolesTest is Test {
    function test_allBitsAreCovered() public pure {
        uint256 sum = Roles.ADD_STRATEGY_MANAGER | Roles.REVOKE_STRATEGY_MANAGER
            | Roles.FORCE_REVOKE_MANAGER | Roles.ACCOUNTANT_MANAGER | Roles.QUEUE_MANAGER
            | Roles.REPORTING_MANAGER | Roles.DEBT_MANAGER | Roles.MAX_DEBT_MANAGER
            | Roles.DEPOSIT_LIMIT_MANAGER | Roles.WITHDRAW_LIMIT_MANAGER
            | Roles.MINIMUM_IDLE_MANAGER | Roles.PROFIT_UNLOCK_MANAGER | Roles.DEBT_PURCHASER
            | Roles.EMERGENCY_MANAGER;
        assertEq(sum, Roles.ALL, "ALL must equal every declared bit");
        assertEq(Roles.ALL, 16383, "14 bits");
    }

    function test_governanceSetHasNoOperationalBits() public pure {
        uint256 gov = Roles.governanceRoleSet();
        assertEq(gov, 3995);
        assertEq(gov & Roles.FORCE_REVOKE_MANAGER, 0, "fast lane holds force revoke (ADR-12)");
        assertEq(gov & Roles.EMERGENCY_MANAGER, 0, "guardian pauses, not governance");
        assertEq(gov & Roles.DEBT_MANAGER, 0, "keeper allocates");
        assertEq(gov & Roles.REPORTING_MANAGER, 0, "keeper reports");
        assertEq(gov & Roles.DEBT_PURCHASER, 0, "treasury buys debt");
    }

    function test_emergencySetIsForceRevokeOnly() public pure {
        assertEq(Roles.emergencyRoleSet(), Roles.FORCE_REVOKE_MANAGER);
        assertEq(Roles.emergencyRoleSet() & Roles.governanceRoleSet(), 0, "sets must be disjoint");
        assertEq(Roles.emergencyRoleSet() & Roles.dangerousBits(), Roles.FORCE_REVOKE_MANAGER);
    }

    function test_keeperSetIsReportAndAllocateOnly() public {
        assertEq(Roles.keeperRoleSet(), 96);
        assertEq(Roles.keeperRoleSet() & Roles.dangerousBits(), 0);
    }

    function test_guardianBitIsNotInGovernanceSet() public pure {
        assertEq(Roles.EMERGENCY_MANAGER & Roles.governanceRoleSet(), 0);
        assertEq(Roles.EMERGENCY_MANAGER & Roles.dangerousBits(), Roles.EMERGENCY_MANAGER);
    }

    function test_dangerousBitsCoverTheDestructiveSet() public pure {
        uint256 dangerous = Roles.dangerousBits();
        assertEq(dangerous, 13070);
        assertTrue(dangerous & Roles.FORCE_REVOKE_MANAGER != 0, "can yank a strategy");
        assertTrue(dangerous & Roles.DEPOSIT_LIMIT_MANAGER != 0, "can open/close deposits");
        assertTrue(dangerous & Roles.DEBT_PURCHASER != 0, "can sell debt for a token");
    }
}
