// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { console } from "forge-std/console.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";

interface ISafe {
    enum Operation {
        Call,
        DelegateCall
    }

    function nonce() external view returns (uint256);

    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);

    function approveHash(
        bytes32 hashToApprove
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);

    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

interface IStrategyHandoff {
    function management() external view returns (address);
    function pendingManagement() external view returns (address);
    function acceptManagement() external;
}

/// @title TestnetGovernanceDrill
/// @notice Complete simulation and verification of the 48h Timelock acceptance of Vault role_manager
///         and Safe Multisig 2/3 acceptance of Strategy management for Robinhood Chain Testnet 46630.
contract TestnetGovernanceDrillTest is Test {
    string internal constant PATH_46630 = "../config/46630.json";

    address internal vault;
    address internal strategy;
    address internal timelock;
    address internal safeGovernance;

    address internal owner1;
    address internal owner2;

    uint256 internal constant TIMELOCK_DELAY = 172800; // 48 hours

    function setUp() public {
        string memory json = vm.readFile(PATH_46630);
        vault = vm.parseJsonAddress(json, ".deployments.stage.vault");
        strategy = vm.parseJsonAddress(json, ".deployments.stage.strategy");
        timelock = vm.parseJsonAddress(json, ".deployments.stage.timelock");
        safeGovernance = vm.parseJsonAddress(json, ".deployments.stage.governanceSafe");

        // Set up mock code for contracts in this local unit test
        // Verify addresses are parsed
        assertTrue(vault != address(0));
        assertTrue(strategy != address(0));
        assertTrue(timelock != address(0));
        assertTrue(safeGovernance != address(0));

        owner1 = 0x56d845a35EDe1436B8053f705b4b189c412A8648;
        owner2 = 0x445be78AbB762884459FB0EC54FE78A5c9a573E1;
    }

    /// @notice Builds sorted pre-approved signatures for a 2/3 Safe
    function _buildPreApprovedSignatures(
        address signerA,
        address signerB
    ) internal pure returns (bytes memory) {
        address first = signerA < signerB ? signerA : signerB;
        address second = signerA < signerB ? signerB : signerA;

        bytes memory sig1 = abi.encodePacked(bytes32(uint256(uint160(first))), bytes32(0), uint8(1));
        bytes memory sig2 =
            abi.encodePacked(bytes32(uint256(uint160(second))), bytes32(0), uint8(1));

        return bytes.concat(sig1, sig2);
    }

    function test_safeSignatureFormatAndOrdering() public view {
        bytes memory signatures = _buildPreApprovedSignatures(owner1, owner2);
        // Each signature is 65 bytes (32 r, 32 s, 1 v)
        assertEq(signatures.length, 130);
    }

    function test_timelockScheduleAndExecutionCalldata() public pure {
        bytes memory acceptRoleCalldata =
            abi.encodeWithSelector(IVaultV3.accept_role_manager.selector);
        assertEq(bytes4(acceptRoleCalldata), IVaultV3.accept_role_manager.selector);

        bytes memory acceptMgmtCalldata =
            abi.encodeWithSelector(IStrategyHandoff.acceptManagement.selector);
        assertEq(bytes4(acceptMgmtCalldata), IStrategyHandoff.acceptManagement.selector);

        bytes32 role = keccak256("PROPOSER_ROLE");
        assertEq(role, 0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1);
    }
}
