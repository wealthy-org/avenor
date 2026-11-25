// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";

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
}

interface IStrategyHandoff {
    function management() external view returns (address);
    function pendingManagement() external view returns (address);
    function acceptManagement() external;
}

/// @title ExecuteTestnet46630Governance
/// @notice Rehearses and executes Governance Safe & Timelock operations on Robinhood Chain Testnet 46630.
contract ExecuteTestnet46630Governance is Script {
    string internal constant CONFIG_PATH = "../config/46630.json";

    function run() external view {
        string memory json = vm.readFile(CONFIG_PATH);
        address vault = vm.parseJsonAddress(json, ".deployments.stage.vault");
        address strategy = vm.parseJsonAddress(json, ".deployments.stage.strategy");
        address timelock = vm.parseJsonAddress(json, ".deployments.stage.timelock");
        address safeGovernance = vm.parseJsonAddress(json, ".deployments.stage.governanceSafe");

        console2.log("=== TESTNET 46630 GOVERNANCE DRILL ===");
        console2.log("Vault:", vault);
        console2.log("Strategy:", strategy);
        console2.log("Timelock (48h):", timelock);
        console2.log("Governance Safe (2/3):", safeGovernance);

        bytes memory acceptRoleCalldata =
            abi.encodeWithSelector(IVaultV3.accept_role_manager.selector);
        bytes memory acceptMgmtCalldata =
            abi.encodeWithSelector(IStrategyHandoff.acceptManagement.selector);

        bytes32 saltRole = bytes32(uint256(1));
        uint256 delay = TimelockController(payable(timelock)).getMinDelay();

        console2.log("Timelock Min Delay (seconds):", delay);
        console2.log("Calldata accept_role_manager():");
        console2.logBytes(acceptRoleCalldata);
        console2.log("Calldata acceptManagement():");
        console2.logBytes(acceptMgmtCalldata);

        // Compute Timelock Operation ID
        bytes32 opId = TimelockController(payable(timelock))
            .hashOperation(vault, 0, acceptRoleCalldata, bytes32(0), saltRole);
        console2.log("Timelock Operation ID:");
        console2.logBytes32(opId);

        console2.log("=== REHEARSAL VERIFICATION FINISHED ===");
    }
}
