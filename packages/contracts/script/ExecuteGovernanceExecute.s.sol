// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";

interface IStrategyView {
    function management() external view returns (address);
}

contract ExecuteGovernanceExecute is Script {
    address internal constant TIMELOCK = 0x2C328D592819524F741A88A18572372CCE196782;
    address internal constant VAULT = 0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA;
    address internal constant STRATEGY = 0xf070f5a2Ddf4d106502235597bd42fd9eDaF7bFE;
    address internal constant USER_PROPOSER = 0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48;

    function run() external {
        TimelockController timelock = TimelockController(payable(TIMELOCK));
        IVaultV3 vault = IVaultV3(VAULT);
        IStrategyView strategy = IStrategyView(STRATEGY);

        bytes memory acceptRoleCalldata = abi.encodeWithSignature("accept_role_manager()");
        bytes memory acceptMgmtCalldata = abi.encodeWithSignature("acceptManagement()");

        bytes32 saltRole = bytes32(uint256(1));
        bytes32 saltMgmt = bytes32(uint256(2));

        vm.startBroadcast(USER_PROPOSER);
        timelock.execute(VAULT, 0, acceptRoleCalldata, bytes32(0), saltRole);
        timelock.execute(STRATEGY, 0, acceptMgmtCalldata, bytes32(0), saltMgmt);
        vm.stopBroadcast();

        address finalRoleManager = vault.role_manager();
        address finalStrategyMgmt = strategy.management();

        console2.log("=== GOVERNANCE EXECUTED ===");
        console2.log("Vault role_manager:", finalRoleManager);
        console2.log("Strategy management:", finalStrategyMgmt);

        require(finalRoleManager == TIMELOCK, "role_manager mismatch");
        require(finalStrategyMgmt == TIMELOCK, "strategy management mismatch");
        console2.log("=== 48H TIMELOCK HANDOFF VERIFIED ON-CHAIN ===");
    }
}
