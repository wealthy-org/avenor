// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";

interface IStrategyHandoff {
    function setPendingManagement(
        address newManagement
    ) external;
}

contract ExecuteGovernanceSchedule is Script {
    address internal constant TIMELOCK = 0x2C328D592819524F741A88A18572372CCE196782;
    address internal constant VAULT = 0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA;
    address internal constant STRATEGY = 0xf070f5a2Ddf4d106502235597bd42fd9eDaF7bFE;
    address internal constant USER_PROPOSER = 0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48;
    address internal constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    uint256 internal constant DELAY = 172800; // 48 hours

    function run() external {
        TimelockController timelock = TimelockController(payable(TIMELOCK));
        IStrategyHandoff strategy = IStrategyHandoff(STRATEGY);

        bytes memory acceptRoleCalldata = abi.encodeWithSignature("accept_role_manager()");
        bytes memory acceptMgmtCalldata = abi.encodeWithSignature("acceptManagement()");

        bytes32 saltRole = bytes32(uint256(1));
        bytes32 saltMgmt = bytes32(uint256(2));

        // 1. Deployer sets pending management on strategy
        vm.startBroadcast(DEPLOYER);
        strategy.setPendingManagement(TIMELOCK);
        vm.stopBroadcast();
        console2.log("Strategy pendingManagement set to Timelock.");

        // 2. User proposes both operations to Timelock
        vm.startBroadcast(USER_PROPOSER);
        timelock.schedule(VAULT, 0, acceptRoleCalldata, bytes32(0), saltRole, DELAY);
        timelock.schedule(STRATEGY, 0, acceptMgmtCalldata, bytes32(0), saltMgmt, DELAY);
        vm.stopBroadcast();
        console2.log("Scheduled accept_role_manager and acceptManagement with 48h delay.");
    }
}
