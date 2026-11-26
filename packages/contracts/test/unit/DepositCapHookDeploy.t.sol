// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { DeployDepositCapHook } from "../../script/DeployDepositCapHook.s.sol";
import { DepositCapHook } from "../../src/hooks/DepositCapHook.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title DepositCapHookDeployTest
/// @notice Tests DeployDepositCapHook script, Timelock wiring, and K-5 safety invariants.
contract DepositCapHookDeployTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    uint256 internal constant GLOBAL_CAP = 500_000e6;
    uint256 internal constant WALLET_CAP = 100_000e6;

    Deploy internal deployer;
    DeployDepositCapHook internal hookDeployer;
    Deploy.Deployment internal d;
    MockERC20 internal usdg;
    MockVenue internal venue;
    IVaultV3 internal vault;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");

    function setUp() public {
        deployer = new Deploy();
        hookDeployer = new DeployDepositCapHook();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        MockYearnFactory yearnFactory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(yearnFactory));
        vm.etch(TS_IMPL, address(template).code);

        Deploy.Config memory cfg = Deploy.Config({
            mode: Deploy.Mode.DryRun,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue),
            timelock: address(0),
            proposer: address(deployer),
            guardian: guardian,
            keeper: keeper,
            treasury: treasury,
            management: address(0),
            maxDebt: GLOBAL_CAP,
            minimumTotalIdle: 0,
            seedAssets: 0,
            vaultName: "Avenor USDG Managed Vault",
            vaultSymbol: "avUSDG",
            strategyName: "Avenor USDG steakUSDG",
            factoryName: "Avenor Vault Factory",
            placeholdersUsed: false,
            gitRev: "",
            feeRecipient: treasury,
            performanceFee: 1_000,
            managementFee: 0,
            refundRatio: 0,
            maxFee: 0,
            maxGain: 500,
            maxLoss: 200
        });

        d = deployer.deployAll(cfg);
        vault = IVaultV3(d.vault);
    }

    function test_deployHookAndWireViaTimelock() public {
        DeployDepositCapHook.HookConfig memory cfg = DeployDepositCapHook.HookConfig({
            vault: d.vault,
            timelock: d.timelock,
            globalCap: GLOBAL_CAP,
            defaultWalletCap: WALLET_CAP,
            allowlistEnabled: false
        });

        DeployDepositCapHook.HookDeployment memory hd = hookDeployer.deployHook(cfg);
        assertTrue(hd.hook != address(0), "hook deployed");
        assertEq(hd.proposalTarget, d.vault, "proposal targets vault");

        DepositCapHook hook = DepositCapHook(hd.hook);
        assertEq(address(hook.vault()), d.vault);
        assertEq(hook.governance(), d.timelock);
        assertEq(hook.globalCap(), GLOBAL_CAP);
        assertEq(hook.defaultWalletCap(), WALLET_CAP);
        assertFalse(hook.allowlistEnabled());

        // Wire via Timelock
        vm.prank(d.timelock);
        (bool ok,) = hd.proposalTarget.call(hd.proposalCalldata);
        assertTrue(ok, "timelock execution succeeded");

        assertEq(vault.deposit_hook(), hd.hook, "hook set on vault");
        assertEq(vault.deposit_limit(), type(uint256).max, "deposit_limit set to max by override");
        assertEq(vault.maxDeposit(alice), WALLET_CAP, "maxDeposit governed by hook");

        // Alice can deposit up to WALLET_CAP
        usdg.mint(alice, WALLET_CAP + 1);
        vm.startPrank(alice);
        usdg.approve(address(vault), WALLET_CAP + 1);
        vault.deposit(WALLET_CAP, alice);
        assertEq(vault.balanceOf(alice), WALLET_CAP);

        // Attempting to deposit 1 more wei reverts with "exceed deposit limit"
        vm.expectRevert(bytes("exceed deposit limit"));
        vault.deposit(1, alice);
        vm.stopPrank();
    }

    /// @dev Demonstrates K-5 pitfall: detaching the hook with set_deposit_hook(0x0) leaves
    ///      deposit_limit at max. Safe closure requires calling set_deposit_limit(0, true).
    function test_unhookingPitfallAndSafeClosure() public {
        DeployDepositCapHook.HookConfig memory cfg = DeployDepositCapHook.HookConfig({
            vault: d.vault,
            timelock: d.timelock,
            globalCap: GLOBAL_CAP,
            defaultWalletCap: WALLET_CAP,
            allowlistEnabled: false
        });
        DeployDepositCapHook.HookDeployment memory hd = hookDeployer.deployHook(cfg);

        vm.prank(d.timelock);
        (bool ok,) = hd.proposalTarget.call(hd.proposalCalldata);
        assertTrue(ok);

        // Unsafe detaching: set_deposit_hook(0x0)
        vm.prank(d.timelock);
        vault.set_deposit_hook(address(0));
        assertEq(vault.deposit_hook(), address(0));
        // Notice: deposit_limit is STILL type(uint256).max!
        assertEq(vault.deposit_limit(), type(uint256).max, "unhooking leaves limit at max");

        // Safe closure: set_deposit_limit(0, true) closes the vault completely
        vm.prank(d.timelock);
        vault.set_deposit_limit(0, true);
        assertEq(vault.deposit_limit(), 0, "vault closed safely");
        assertEq(vault.maxDeposit(alice), 0, "maxDeposit is zero");
    }
}
