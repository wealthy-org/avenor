// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";

interface IStrategyHandoff {
    function management() external view returns (address);
    function pendingManagement() external view returns (address);
    function acceptManagement() external;
}

/// @title ExecuteTestnet46630Governance
/// @notice Prints the governance drill for testnet 46630: the exact calldata, signature
///         shape and Timelock operation ID that the Governance Safe / Timelock must
///         submit. `run()` is read-only (`view`, no broadcast) — nothing is executed
///         here. Execution happens off-chain through the Safe UI and the timelock CLI;
///         what actually ran is recorded in `docs/TESTNET_EVIDENCE.md` and
///         `packages/config/46630.json` `deployments.stage.governanceHandoff`.
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
