// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";
import { Roles } from "../src/interfaces/Roles.sol";

/// @title ExecuteDrills
/// @notice Executes the four incident drills (D1, D2, D3, D4) required by `docs/RUNBOOK.md`
///         and Epic 6 Ticket 4 on a live chain 4663 fork at block 118337511.
contract ExecuteDrills is Script {
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    struct Context {
        address deployer;
        address user;
        address guardian;
        address keeper;
        address timelock;
        address emergencyTimelock;
        address vault;
        address strategy;
    }

    struct DrillRecord {
        uint256 d1_pauseBlock;
        uint256 d1_unpauseBlock;
        uint256 d1_withdrawBlock;
        uint256 d2_scheduleBlock;
        uint256 d2_executeBlock;
        uint256 d2_debtBefore;
        uint256 d2_debtAfter;
        uint256 d3_blockA;
        uint256 d3_blockB;
        uint256 d4_shutdownBlock;
        uint256 d4_totalIdleFinal;
        uint256 d4_totalAssetsFinal;
    }

    function run() external returns (DrillRecord memory rec) {
        Context memory ctx = Context({
            deployer: vm.envOr(
                "DEPLOYER_ADDRESS", address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
            ),
            user: vm.envOr("USER_ADDRESS", address(0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48)),
            guardian: vm.envOr(
                "GUARDIAN_ADDRESS", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
            ),
            keeper: vm.envOr("KEEPER_ADDRESS", address(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)),
            timelock: vm.envOr(
                "TIMELOCK_ADDRESS", address(0x2C328D592819524F741A88A18572372CCE196782)
            ),
            emergencyTimelock: vm.envOr(
                "EMERGENCY_TIMELOCK", address(0xf2Bf7C00B4696726B3c1f6E7b87d1a4acB050a8F)
            ),
            vault: vm.envOr("VAULT_ADDRESS", address(0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA)),
            strategy: vm.envOr(
                "STRATEGY_ADDRESS", address(0xf070f5a2Ddf4d106502235597bd42fd9eDaF7bFE)
            )
        });

        console2.log("=== STARTING INCIDENT DRILLS (RUNBOOK.md D1-D4) ===");
        _setupDeposit(ctx);
        _executeD1(ctx, rec);
        _executeD3(ctx, rec);
        _executeD2(ctx, rec);
        _executeD4(ctx, rec);
        console2.log("=== ALL FOUR INCIDENT DRILLS COMPLETED AND VERIFIED SUCCESSFULLY ===");
    }

    function _setupDeposit(
        Context memory ctx
    ) internal {
        IVaultV3 v = IVaultV3(ctx.vault);
        vm.startPrank(v.role_manager());
        v.set_role(ctx.deployer, Roles.DEPOSIT_LIMIT_MANAGER);
        vm.stopPrank();

        vm.startPrank(ctx.deployer);
        v.set_deposit_limit(2_000_000_000); // 2,000 USDG (seed is 1,000 USDG)
        vm.stopPrank();

        vm.startPrank(ctx.user);
        IERC20(USDG).approve(ctx.vault, 100_000_000);
        v.deposit(100_000_000, ctx.user);
        console2.log("User deposited 100 USDG. Shares:", v.balanceOf(ctx.user));
        vm.stopPrank();
    }

    function _executeD1(
        Context memory ctx,
        DrillRecord memory rec
    ) internal {
        console2.log("--- Executing Drill D1: Pause & Unpause ---");
        IVaultV3 v = IVaultV3(ctx.vault);
        require(v.maxWithdraw(ctx.user) > 0, "D1: maxWithdraw before must be > 0");

        vm.prank(ctx.guardian);
        v.setPaused(true);
        rec.d1_pauseBlock = block.number;
        console2.log("D1: setPaused(true) at block:", rec.d1_pauseBlock);

        require(v.isPaused(), "D1: vault must be paused");
        require(v.maxWithdraw(ctx.user) == 0, "D1: maxWithdraw during pause must be 0");

        vm.startPrank(ctx.user);
        try v.withdraw(1_000_000, ctx.user, ctx.user) {
            revert("D1: withdraw should have reverted while paused");
        } catch {
            console2.log("D1: Confirmed withdraw reverted while paused");
        }
        vm.stopPrank();

        vm.prank(ctx.guardian);
        v.setPaused(false);
        rec.d1_unpauseBlock = block.number;
        console2.log("D1: setPaused(false) at block:", rec.d1_unpauseBlock);

        require(!v.isPaused(), "D1: vault must not be paused");
        require(v.maxWithdraw(ctx.user) > 0, "D1: maxWithdraw must be restored");

        vm.prank(ctx.user);
        v.withdraw(1_000_000, ctx.user, ctx.user);
        rec.d1_withdrawBlock = block.number;
        console2.log("D1: Test withdrawal 1 USDG at block:", rec.d1_withdrawBlock);
    }

    function _executeD3(
        Context memory ctx,
        DrillRecord memory rec
    ) internal {
        console2.log("--- Executing Drill D3: Liquidity Monitoring ---");
        IVaultV3 v = IVaultV3(ctx.vault);
        rec.d3_blockA = block.number;
        console2.log("D3 Block A:", rec.d3_blockA);
        console2.log("idle A:", v.totalIdle());
        console2.log("maxWithdraw A:", v.maxWithdraw(ctx.user));

        vm.roll(block.number + 10);
        rec.d3_blockB = block.number;
        console2.log("D3 Block B:", rec.d3_blockB);
        console2.log("idle B:", v.totalIdle());
        console2.log("maxWithdraw B:", v.maxWithdraw(ctx.user));
    }

    function _executeD2(
        Context memory ctx,
        DrillRecord memory rec
    ) internal {
        console2.log("--- Executing Drill D2: Force Revoke via Fast Lane (6h Timelock) ---");
        IVaultV3 v = IVaultV3(ctx.vault);
        TimelockController emergency = TimelockController(payable(ctx.emergencyTimelock));

        bytes memory callData = abi.encodeCall(IVaultV3.force_revoke_strategy, (ctx.strategy));
        bytes32 salt = keccak256("drill-d2-fast-lane");

        vm.prank(ctx.guardian);
        emergency.schedule(ctx.vault, 0, callData, bytes32(0), salt, 6 hours);
        rec.d2_scheduleBlock = block.number;
        console2.log("D2: Scheduled force_revoke at block:", rec.d2_scheduleBlock);

        vm.warp(block.timestamp + 6 hours + 1);
        vm.roll(block.number + 7200);

        rec.d2_debtBefore = v.strategies(ctx.strategy).current_debt;

        vm.prank(ctx.guardian);
        emergency.execute(ctx.vault, 0, callData, bytes32(0), salt);
        rec.d2_executeBlock = block.number;
        rec.d2_debtAfter = v.strategies(ctx.strategy).current_debt;

        console2.log("D2: Executed force_revoke at block:", rec.d2_executeBlock);
        console2.log("D2: Debt before:", rec.d2_debtBefore);
        console2.log("D2: Debt after:", rec.d2_debtAfter);
        require(rec.d2_debtAfter == 0, "D2: Debt after force_revoke must be 0");
    }

    function _executeD4(
        Context memory ctx,
        DrillRecord memory rec
    ) internal {
        console2.log("--- Executing Drill D4: Vault Shutdown & Debt Reclamation ---");
        IVaultV3 v = IVaultV3(ctx.vault);

        // Guardian (EMERGENCY_MANAGER) triggers shutdown
        vm.prank(ctx.guardian);
        v.shutdown_vault();
        rec.d4_shutdownBlock = block.number;
        console2.log("D4: shutdown_vault called at block:", rec.d4_shutdownBlock);
        require(v.isShutdown(), "D4: vault must be shutdown");
        require(v.deposit_limit() == 0, "D4: deposit_limit must be 0 after shutdown");

        // Guardian gained DEBT_MANAGER from shutdown_vault. Pull debt to idle if any remains
        uint256 remainingDebt = v.strategies(ctx.strategy).current_debt;
        if (remainingDebt > 0) {
            vm.prank(ctx.guardian);
            v.update_debt(ctx.strategy, 0, 0);
        }

        rec.d4_totalIdleFinal = v.totalIdle();
        rec.d4_totalAssetsFinal = v.totalAssets();
        console2.log("D4: totalIdle final:", rec.d4_totalIdleFinal);
        console2.log("D4: totalAssets final:", rec.d4_totalAssetsFinal);
        require(rec.d4_totalIdleFinal == rec.d4_totalAssetsFinal, "D4: All assets must be in idle");
    }
}
