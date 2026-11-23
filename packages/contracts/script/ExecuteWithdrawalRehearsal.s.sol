// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";

/// @title ExecuteWithdrawalRehearsal
/// @notice Rehearses bidirectional ERC-4626 flow by executing a 200 USDG withdrawal
///         from user wallet with explicit max_loss = 0 (ADR-10).
contract ExecuteWithdrawalRehearsal is Script {
    address internal constant DEFAULT_USER = 0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48;
    address internal constant DEFAULT_VAULT = 0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA;
    address internal constant DEFAULT_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    uint256 internal constant WITHDRAW_ASSETS = 200_000_000; // 200 USDG

    function run() external {
        address user = vm.envOr("USER_ADDRESS", DEFAULT_USER);
        address vaultAddr = vm.envOr("VAULT_ADDRESS", DEFAULT_VAULT);
        address usdgAddr = vm.envOr("USDG_ADDRESS", DEFAULT_USDG);

        IVaultV3 vault = IVaultV3(vaultAddr);
        IERC20 usdg = IERC20(usdgAddr);

        uint256 userSharesBefore = vault.balanceOf(user);
        uint256 userUsdgBefore = usdg.balanceOf(user);
        uint256 vaultAssetsBefore = vault.totalAssets();
        uint256 vaultIdleBefore = vault.totalIdle();

        console2.log("=== WITHDRAWAL REHEARSAL START ===");
        console2.log("User:", user);
        console2.log("User shares before:", userSharesBefore);
        console2.log("User USDG before:", userUsdgBefore);
        console2.log("Vault assets before:", vaultAssetsBefore);
        console2.log("Vault idle before:", vaultIdleBefore);

        require(userSharesBefore >= WITHDRAW_ASSETS, "insufficient user shares");
        require(vaultIdleBefore >= WITHDRAW_ASSETS, "insufficient vault idle");

        vm.startBroadcast(user);
        uint256 sharesBurned = vault.withdraw(WITHDRAW_ASSETS, user, user, 0);
        vm.stopBroadcast();

        uint256 userSharesAfter = vault.balanceOf(user);
        uint256 userUsdgAfter = usdg.balanceOf(user);
        uint256 vaultAssetsAfter = vault.totalAssets();
        uint256 vaultIdleAfter = vault.totalIdle();

        console2.log("=== WITHDRAWAL REHEARSAL CONFIRMED ===");
        console2.log("Shares burned:", sharesBurned);
        console2.log("User shares after:", userSharesAfter);
        console2.log("User USDG after:", userUsdgAfter);
        console2.log("Vault assets after:", vaultAssetsAfter);
        console2.log("Vault idle after:", vaultIdleAfter);

        require(userUsdgAfter == userUsdgBefore + WITHDRAW_ASSETS, "USDG balance mismatch");
        require(userSharesAfter == userSharesBefore - sharesBurned, "Shares balance mismatch");
        require(vaultAssetsAfter == vaultAssetsBefore - WITHDRAW_ASSETS, "Vault assets mismatch");
        require(vaultIdleAfter == vaultIdleBefore - WITHDRAW_ASSETS, "Vault idle mismatch");

        console2.log("=== BIDIRECTIONAL ERC-4626 FLOW VERIFIED ===");
    }
}
