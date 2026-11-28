// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { DepositCapHook } from "../../src/hooks/DepositCapHook.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

/// @notice Ticket 3.5: the deposit cap / allowlist hook, tested through the vault rather than
///         through the hook alone, because the behaviour that matters is `maxDeposit` and the
///         assert inside `deposit` agreeing with each other.
///
/// @dev Wiring uses `set_deposit_hook(hook, override := True)` on purpose: a fresh producer vault
///      ships with `deposit_limit == 0` (closed), and the non-override path asserts
///      `deposit_limit == max` first (`VaultV3.vy:1478-1487`). The override flag sets the limit to
///      `max` in the same transaction — which is exactly the state the hook needs, and exactly
///      the state in which `deposit_limit` stops being a ceiling anyone can read.
contract DepositCapHookTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    uint256 internal constant GLOBAL_CAP = 500_000e6;
    uint256 internal constant WALLET_CAP = 300_000e6;

    Deploy internal deployer;
    Deploy.Deployment internal d;
    MockERC20 internal usdg;
    MockVenue internal venue;
    IVaultV3 internal vault;
    DepositCapHook internal hook;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal mallory = makeAddr("mallory");

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        // `TokenizedStrategy` is a delegatecall target; on a bare EVM its canonical address is
        // empty and `add_strategy` reverts inside `asset()`.
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

        hook = new DepositCapHook(d.vault, d.timelock, GLOBAL_CAP, WALLET_CAP, false);
    }

    /*//////////////////////////////////////////////////////////////
                                 WIRING
    //////////////////////////////////////////////////////////////*/

    function test_hookBecomesTheOnlyDepositCeiling() public {
        // The product ships closed: no deposit is possible before the hook is wired.
        assertEq(vault.deposit_limit(), 0, "ships closed");
        assertEq(vault.maxDeposit(alice), 0, "closed means maxDeposit 0");

        vm.prank(d.timelock);
        vault.set_deposit_hook(address(hook), true);

        // The override flag rewrote `deposit_limit` to max, so the hook is now the only cap.
        assertEq(vault.deposit_limit(), type(uint256).max, "limit parked at max");
        assertEq(vault.deposit_hook(), address(hook), "hook wired");
        assertEq(vault.maxDeposit(alice), WALLET_CAP, "per-wallet cap is the binding limit");
        assertEq(hook.available_deposit_limit(alice), WALLET_CAP, "hook and vault agree");

        _deposit(alice, WALLET_CAP);
        assertEq(vault.maxDeposit(alice), 0, "cap filled exactly");
        assertEq(vault.totalAssets(), WALLET_CAP);
    }

    /*//////////////////////////////////////////////////////////////
                              PER-WALLET CAP
    //////////////////////////////////////////////////////////////*/

    function test_perWalletCapIsReleasedByWithdrawing() public {
        _wireHook();
        _deposit(alice, WALLET_CAP);

        vm.prank(alice);
        vm.expectRevert(bytes("exceed deposit limit"));
        vault.deposit(1, alice);

        // A withdrawal is the only thing that frees room, because the cap is measured from the
        // live position — there is no counter to reset and no `post_withdraw` to forget.
        vm.prank(alice);
        vault.withdraw(100_000e6, alice, alice, 0);
        assertEq(vault.maxDeposit(alice), 100_000e6, "room reappears");

        _deposit(alice, 100_000e6);
        assertEq(vault.balanceOf(alice), WALLET_CAP, "back at the cap");
    }

    function test_walletOverrideWinsOverTheDefault() public {
        _wireHook();
        vm.prank(d.timelock);
        hook.setWalletCap(bob, 50_000e6);

        assertEq(hook.effectiveWalletCap(bob), 50_000e6, "override");
        assertEq(hook.effectiveWalletCap(alice), WALLET_CAP, "default still applies");
        assertEq(vault.maxDeposit(bob), 50_000e6);

        _deposit(bob, 50_000e6);
        assertEq(vault.maxDeposit(bob), 0);

        // Clearing the override restores the default; zero override never means "blocked".
        vm.prank(d.timelock);
        hook.setWalletCap(bob, 0);
        assertEq(vault.maxDeposit(bob), WALLET_CAP - 50_000e6, "default minus position");
    }

    /*//////////////////////////////////////////////////////////////
                               GLOBAL CAP
    //////////////////////////////////////////////////////////////*/

    function test_globalCapBindsAfterTheWalletCaps() public {
        _wireHook();
        vm.prank(d.timelock);
        hook.setDefaultWalletCap(type(uint256).max);

        _deposit(alice, 300_000e6);
        assertEq(vault.maxDeposit(bob), GLOBAL_CAP - 300_000e6, "global room only");

        _deposit(bob, 200_000e6);
        assertEq(vault.totalAssets(), GLOBAL_CAP);
        assertEq(vault.maxDeposit(alice), 0, "global cap reached");
        assertEq(vault.maxDeposit(bob), 0, "global cap reached");
    }

    /*//////////////////////////////////////////////////////////////
                               ALLOWLIST
    //////////////////////////////////////////////////////////////*/

    function test_allowlistRejectsUnlistedAndAcceptsListed() public {
        _wireHook();
        vm.prank(d.timelock);
        hook.setAllowlistEnabled(true);

        assertEq(vault.maxDeposit(alice), 0, "nobody is on the list yet");
        vm.prank(alice);
        vm.expectRevert(bytes("exceed deposit limit"));
        vault.deposit(1, alice);

        address[] memory batch = new address[](2);
        batch[0] = alice;
        batch[1] = bob;
        vm.prank(d.timelock);
        hook.setAllowedBatch(batch, true);

        assertEq(vault.maxDeposit(alice), WALLET_CAP, "listed");
        assertEq(vault.maxDeposit(mallory), 0, "unlisted stays out");
        _deposit(alice, 1_000e6);

        vm.prank(d.timelock);
        hook.setAllowed(alice, false);
        assertEq(vault.maxDeposit(alice), 0, "revoked mid-flight blocks the next deposit");
    }

    /// @notice The exit guarantee from ADR-5, tested at the exact state the ticket asks for:
    ///         a hook that rejects everyone.
    function test_rejectEveryoneStillAllowsFullExit() public {
        _wireHook();
        _deposit(alice, 100_000e6);

        vm.prank(d.timelock);
        hook.setAllowlistEnabled(true);
        assertEq(vault.maxDeposit(alice), 0, "all deposits rejected");
        assertEq(vault.maxDeposit(bob), 0, "all deposits rejected");

        vm.prank(alice);
        vm.expectRevert(bytes("exceed deposit limit"));
        vault.deposit(1, alice);

        uint256 shares = vault.balanceOf(alice);
        uint256 maxWithdraw = vault.maxWithdraw(alice, 0);
        assertEq(maxWithdraw, 100_000e6, "withdraw ceiling untouched by the deposit hook");

        vm.prank(alice);
        vault.redeem(shares, alice, alice, 0);
        assertEq(vault.balanceOf(alice), 0, "full exit");
        assertEq(usdg.balanceOf(alice), 100_000e6, "money back");
    }

    function test_capOfZeroDoesNotBlockWithdrawals() public {
        _wireHook();
        _deposit(alice, 100_000e6);

        vm.prank(d.timelock);
        hook.setGlobalCap(0);
        assertEq(vault.maxDeposit(bob), 0, "no new deposits");

        // `maxRedeem`/`maxWithdraw` do not consult the deposit hook; proving it here keeps a
        // future refactor from wiring the cap into the exit path "for symmetry".
        vm.prank(alice);
        vault.withdraw(40_000e6, alice, alice, 0);
        // Cache the balance first: a `vm.prank` is consumed by the next *call*, and
        // `vault.balanceOf(alice)` is one — leaving `redeem` to run as the test contract.
        uint256 remaining = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(remaining, alice, alice, 0);
        assertEq(vault.totalAssets(), 0, "everyone out despite a zero cap");
    }

    /*//////////////////////////////////////////////////////////////
                          AUTHORITY AND GUARDS
    //////////////////////////////////////////////////////////////*/

    function test_everySetterIsGovernanceOnly() public {
        _wireHook();
        uint256 capBefore = hook.globalCap();

        vm.startPrank(mallory);
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotGovernance.selector, mallory));
        hook.setGlobalCap(1);
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotGovernance.selector, mallory));
        hook.setDefaultWalletCap(1);
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotGovernance.selector, mallory));
        hook.setWalletCap(mallory, 1);
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotGovernance.selector, mallory));
        hook.setAllowlistEnabled(true);
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotGovernance.selector, mallory));
        hook.setAllowed(mallory, true);
        address[] memory one = new address[](1);
        one[0] = mallory;
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotGovernance.selector, mallory));
        hook.setAllowedBatch(one, true);
        vm.stopPrank();

        assertEq(hook.globalCap(), capBefore, "nothing moved");
        // The vault's own `DEPOSIT_LIMIT_MANAGER` cannot swap the hook's governance either:
        // the hook has no backdoor for it, and the timelock is the only caller it accepts.
        assertEq(hook.governance(), d.timelock);
    }

    function test_postDepositRecordsAndRejectsStrayCallers() public {
        _wireHook();

        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.NotVault.selector, address(this)));
        hook.post_deposit(alice, alice, 1, 1);

        _deposit(alice, 1_234e6);
        assertEq(hook.totalRecordedDeposits(), 1_234e6, "recorded");
        // The counter is diagnostics only: the cap reads `positionOf`, so the two never disagree.
        assertEq(hook.positionOf(alice), 1_234e6, "live position");

        // The post-check is a real guard, not decoration: forced through with the vault's
        // identity and a position above the cap, it reverts.
        vm.prank(d.timelock);
        hook.setWalletCap(alice, 1e6);
        vm.prank(address(vault));
        vm.expectRevert(
            abi.encodeWithSelector(DepositCapHook.CapExceeded.selector, alice, 1_234e6, 1e6)
        );
        hook.post_deposit(alice, alice, 1, 0);
    }

    /// @dev A zero default wallet cap must be refused at construction and by the setter:
    ///     unlike `walletCap[account]` (zero = "use the default"), a zero *default* is not
    ///     a sentinel — `effectiveWalletCap` would hand every wallet a cap of zero and
    ///     silently reject all deposits. Blocking is the allowlist's job, or an explicit
    ///     `globalCap = 0`; it is never the default's.
    function test_zeroDefaultWalletCapIsRefusedNotSilentlyBricking() public {
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.ZeroCap.selector, "defaultWalletCap"));
        new DepositCapHook(d.vault, d.timelock, GLOBAL_CAP, 0, false);

        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.ZeroCap.selector, "defaultWalletCap"));
        vm.prank(hook.governance());
        hook.setDefaultWalletCap(0);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.ZeroAddress.selector, "vault"));
        new DepositCapHook(address(0), d.timelock, 1, 1, false);

        vm.expectRevert(abi.encodeWithSelector(DepositCapHook.ZeroAddress.selector, "governance"));
        new DepositCapHook(d.vault, address(0), 1, 1, false);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _wireHook() internal {
        vm.prank(d.timelock);
        vault.set_deposit_hook(address(hook), true);
    }

    function _deposit(
        address who,
        uint256 assets
    ) internal {
        usdg.mint(who, assets);
        vm.startPrank(who);
        usdg.approve(address(vault), assets);
        vault.deposit(assets, who);
        vm.stopPrank();
    }
}
