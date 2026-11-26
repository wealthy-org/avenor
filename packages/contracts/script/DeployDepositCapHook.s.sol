// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";
import { DepositCapHook } from "../src/hooks/DepositCapHook.sol";

/// @title DeployDepositCapHook
/// @notice Deploys DepositCapHook and builds the 48h Timelock proposal to wire it to VaultV3.
contract DeployDepositCapHook is Script {
    struct HookConfig {
        address vault;
        address timelock;
        uint256 globalCap;
        uint256 defaultWalletCap;
        bool allowlistEnabled;
    }

    struct HookDeployment {
        address hook;
        address proposalTarget;
        bytes proposalCalldata;
    }

    error ZeroAddress(string what);

    function configFromEnv() public view returns (HookConfig memory cfg) {
        cfg.vault = vm.envOr("VAULT_ADDRESS", address(0));
        cfg.timelock = vm.envOr("TIMELOCK_ADDRESS", address(0));
        cfg.globalCap = vm.envOr("GLOBAL_CAP", uint256(500_000e6));
        cfg.defaultWalletCap = vm.envOr("DEFAULT_WALLET_CAP", uint256(100_000e6));
        cfg.allowlistEnabled = vm.envOr("ALLOWLIST_ENABLED", false);
    }

    function deployHook(
        HookConfig memory cfg
    ) public returns (HookDeployment memory d) {
        if (cfg.vault == address(0)) revert ZeroAddress("vault");
        if (cfg.timelock == address(0)) revert ZeroAddress("timelock");

        DepositCapHook hook = new DepositCapHook(
            cfg.vault, cfg.timelock, cfg.globalCap, cfg.defaultWalletCap, cfg.allowlistEnabled
        );

        d.hook = address(hook);
        d.proposalTarget = cfg.vault;
        // Use 2-arg overload: set_deposit_hook(address,bool) with override_ = true
        d.proposalCalldata = abi.encodeWithSelector(
            bytes4(keccak256("set_deposit_hook(address,bool)")), address(hook), true
        );
    }

    function run() external returns (HookDeployment memory d) {
        HookConfig memory cfg = configFromEnv();
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        d = deployHook(cfg);

        vm.stopBroadcast();
        console2.log("DepositCapHook deployed at:", d.hook);
        console2.log("Proposal target (Vault):", d.proposalTarget);
    }
}
