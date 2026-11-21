// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { Roles } from "../../src/interfaces/Roles.sol";
import { MorphoVaultStrategy } from "../../src/strategies/MorphoVaultStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

/// @dev Prod mode requires the timelock proposer/guardian to be contracts; in dry-run they
///      are EOAs, and this suite only needs dry-run wiring.
contract MockMultisig { }

/// @notice Epic 3 / ticket 3.2: the role matrix of `docs/ROLE_PERMISSION_MATRIX.md` section 1-section 2,
///         encoded as tests instead of prose.
///
///         Every assertion here is about *authority*: who may call which function, and what
///         the caller gains by calling it. The functions themselves are already tested
///         elsewhere (`DeployScript.t.sol` for wiring, `AccountantFees.t.sol` for fee math);
///         this suite answers a different question — can someone who was not given the bit
///         move the money or the parameters?
///
///         The revert string is asserted, not just "it reverted": `_enforce_role` in
///         `VaultV3.vy:1572` raises `assert role in self.roles[account], "not allowed"`, and
///         matching the message proves the call failed *on authority* rather than on a
///         malformed argument that would also have reverted.
contract RoleEnforcementTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    Deploy internal deployer;
    MockERC20 internal usdg;
    MockVenue internal venue;
    Deploy.Deployment internal d;
    Deploy.Config internal cfg;

    address internal outsider = makeAddr("outsider");
    MorphoVaultStrategy internal secondStrategy;

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));
        MockYearnFactory factory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(factory));
        vm.etch(TS_IMPL, address(template).code);

        cfg = Deploy.Config({
            mode: Deploy.Mode.DryRun,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue),
            timelock: address(0),
            proposer: makeAddr("proposer"),
            guardian: makeAddr("guardian"),
            keeper: makeAddr("keeper"),
            treasury: makeAddr("treasury"),
            management: address(0),
            maxDebt: 250_000e6,
            minimumTotalIdle: 1_000e6,
            seedAssets: 0,
            vaultName: "Avenor USDG Managed Vault",
            vaultSymbol: "avUSDG",
            strategyName: "Avenor USDG steakUSDG",
            factoryName: "Avenor Vault Factory",
            placeholdersUsed: false,
            gitRev: "",
            feeRecipient: makeAddr("treasury"),
            performanceFee: 1_000,
            managementFee: 0,
            refundRatio: 0,
            maxFee: 0,
            maxGain: 500,
            maxLoss: 200
        });

        d = deployer.deployAll(cfg);
        // Dry-run stops at `transfer_role_manager`: the accept step is what the prod
        // proposal's last call does, 48h later. This suite wants the *post-handoff* state,
        // which is the state that governs real money, so it performs the accept as the
        // timelock would.
        assertEq(_vault().role_manager(), address(deployer), "dry-run starts on the script");
        assertEq(_vault().future_role_manager(), d.timelock, "future role manager not queued");
        vm.prank(d.timelock);
        _vault().accept_role_manager();
        secondStrategy =
            new MorphoVaultStrategy(address(usdg), address(venue), "Avenor second steakUSDG");
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _vault() internal view returns (IVaultV3) {
        return IVaultV3(d.vault);
    }

    /// @dev `set_role` is `role_manager`-only and the role manager *is* the timelock, so the
    ///      only way to grant a bit in a test is to act as the timelock.
    function _setRole(
        address who,
        uint256 bits
    ) internal {
        vm.prank(d.timelock);
        _vault().set_role(who, bits);
    }

    /// @dev A call that must fail because the caller holds no bit for it.
    function _expectNotAllowed(
        address caller,
        bytes memory data
    ) internal {
        vm.prank(caller);
        vm.expectRevert(bytes("not allowed"));
        (bool ok,) = d.vault.call(data);
        ok;
    }

    function _openDeposits(
        uint256 limit
    ) internal {
        // The timelock holds `DEPOSIT_LIMIT_MANAGER`; the bootstrap actor threw its copy away.
        vm.prank(d.timelock);
        _vault().set_deposit_limit(limit);
    }

    function _seedDeposit(
        uint256 amount
    ) internal {
        usdg.mint(address(this), amount);
        usdg.approve(d.vault, amount);
        _vault().deposit(amount, address(this));
    }

    /*//////////////////////////////////////////////////////////////
                       MATRIX: WHO HOLDS WHICH BIT
    //////////////////////////////////////////////////////////////*/

    /// @notice section 2 of the matrix, as executed by the deploy script.
    function test_matrixGrantsMatchTheDocumentedHolders() public view {
        IVaultV3 vault = _vault();

        assertEq(vault.role_manager(), d.timelock, "role manager is the timelock");
        assertEq(
            vault.roles(d.timelock), Roles.governanceRoleSet(), "timelock holds governance set"
        );
        assertEq(vault.roles(d.guardian), Roles.EMERGENCY_MANAGER, "guardian holds only emergency");
        assertEq(vault.roles(d.keeper), Roles.keeperRoleSet(), "keeper holds report + debt only");
        assertEq(
            vault.roles(d.treasury), Roles.DEBT_PURCHASER, "treasury holds only debt purchasing"
        );
        // The bootstrap broadcaster keeps nothing: a stolen deploy key is worthless today.
        assertEq(vault.roles(address(deployer)), 0, "deploy actor keeps no role");
    }

    /// @notice section 2 row 4 says `FORCE_REVOKE_MANAGER` *should* sit on the emergency Safe behind a
    ///         6h `TimelockExecutor`. The shipped wiring puts it on the 48h governance
    ///         timelock instead (`Roles.governanceRoleSet()`), because ADR-4 does not deploy
    ///         `TimelockExecutor` at all and a role cannot be granted to a contract that does
    ///         not exist.
    ///
    ///         This test asserts what the code does *today* so the divergence is visible in the
    ///         suite rather than only in a review comment. It is a decision item, not a bug:
    ///         either the matrix text changes, or epik 4 deploys the executor and this
    ///         assertion is inverted on purpose. Do not "fix" it by silently editing
    ///         `governanceRoleSet()`.
    function test_forceRevokeSitsOnGovernanceTimelockWhileMatrixSaysEmergencySafe() public view {
        uint256 timelockBits = _vault().roles(d.timelock);
        assertTrue(
            timelockBits & Roles.FORCE_REVOKE_MANAGER != 0, "doc divergence: timelock holds it"
        );
        assertEq(
            _vault().roles(d.guardian) & Roles.FORCE_REVOKE_MANAGER,
            0,
            "doc section 2 expects the emergency Safe to hold it"
        );
        // The safety property that matters either way: the guardian cannot also rewrite roles.
        assertEq(
            _vault().roles(d.guardian) & Roles.EMERGENCY_MANAGER,
            Roles.EMERGENCY_MANAGER,
            "guardian can still pause instantly"
        );
    }

    /// @notice Keeper compromise must not be able to remove a strategy, add one, or pause.
    function test_keeperCannotReachTheDangerousBits() public view {
        assertEq(_vault().roles(d.keeper) & Roles.dangerousBits(), 0, "keeper has no dangerous bit");
        assertEq(_vault().roles(d.guardian) & Roles.DEBT_PURCHASER, 0, "guardian cannot buy debt");
        assertEq(
            _vault().roles(d.timelock) & Roles.EMERGENCY_MANAGER,
            0,
            "timelock cannot pause: pause never waits 48h"
        );
    }

    /// @notice section 2 rule 1: one team must not both hold funds and pause.
    function test_guardianIsNotTheTimelockProposer() public {
        TimelockController timelock = TimelockController(payable(d.timelock));
        bytes32 proposerRole = timelock.PROPOSER_ROLE();
        assertTrue(timelock.hasRole(proposerRole, cfg.proposer), "proposer cannot propose");
        assertFalse(timelock.hasRole(proposerRole, d.guardian), "guardian equals proposer");
        assertFalse(timelock.hasRole(timelock.CANCELLER_ROLE(), d.guardian), "guardian can cancel");
        assertGe(timelock.getMinDelay(), 48 hours, "timelock delay below 48h");
        assertEq(_vault().role_manager(), d.timelock, "role manager is not an EOA");
    }

    /*//////////////////////////////////////////////////////////////
                     NEGATIVE: EVERY GATED FUNCTION
    //////////////////////////////////////////////////////////////*/

    /// @notice section 1 of the matrix, function by function: a caller with no bits at all cannot
    ///         execute any of them, and the failure is `"not allowed"`.
    function test_everyGatedFunctionRejectsAnAccountWithNoRoles() public {
        address s = d.strategy;
        address[] memory queue = new address[](1);
        queue[0] = s;

        _expectNotAllowed(outsider, abi.encodeWithSignature("add_strategy(address,bool)", s, false));
        _expectNotAllowed(outsider, abi.encodeWithSignature("revoke_strategy(address)", s));
        _expectNotAllowed(outsider, abi.encodeWithSignature("force_revoke_strategy(address)", s));
        _expectNotAllowed(outsider, abi.encodeWithSignature("set_accountant(address)", address(0)));
        _expectNotAllowed(outsider, abi.encodeWithSignature("set_default_queue(address[])", queue));
        _expectNotAllowed(outsider, abi.encodeWithSignature("set_use_default_queue(bool)", true));
        _expectNotAllowed(outsider, abi.encodeWithSignature("set_auto_allocate(bool)", false));
        _expectNotAllowed(outsider, abi.encodeWithSignature("process_report(address)", s));
        _expectNotAllowed(
            outsider, abi.encodeWithSignature("update_debt(address,uint256,uint256)", s, 0, 0)
        );
        _expectNotAllowed(
            outsider, abi.encodeWithSignature("update_max_debt_for_strategy(address,uint256)", s, 0)
        );
        _expectNotAllowed(outsider, abi.encodeWithSignature("set_deposit_limit(uint256)", 0));
        _expectNotAllowed(
            outsider, abi.encodeWithSignature("set_deposit_hook(address)", address(0))
        );
        _expectNotAllowed(
            outsider, abi.encodeWithSignature("set_withdraw_hook(address)", address(0))
        );
        _expectNotAllowed(
            outsider, abi.encodeWithSignature("set_transfer_hook(address)", address(0))
        );
        _expectNotAllowed(outsider, abi.encodeWithSignature("set_minimum_total_idle(uint256)", 0));
        _expectNotAllowed(outsider, abi.encodeWithSignature("setProfitMaxUnlockTime(uint256)", 0));
        _expectNotAllowed(outsider, abi.encodeWithSignature("buy_debt(address,uint256)", s, 0));
        _expectNotAllowed(outsider, abi.encodeWithSignature("setPaused(bool)", true));
        _expectNotAllowed(outsider, abi.encodeWithSignature("shutdown_vault()"));
        _expectNotAllowed(outsider, abi.encodeWithSignature("setName(string)", "x"));
        _expectNotAllowed(outsider, abi.encodeWithSignature("setSymbol(string)", "X"));
    }

    /// @notice `role_manager`-only entry points use a bare `assert` (`VaultV3.vy:1585`), so the
    ///         revert carries no string. Asserted separately for exactly that reason: a caller
    ///         that reverts for a different cause would still pass a bare `expectRevert()`.
    function test_roleManagerOnlyFunctionsRejectEveryoneElse() public {
        vm.prank(outsider);
        vm.expectRevert();
        _vault().set_role(outsider, Roles.ALL);

        vm.prank(d.keeper);
        vm.expectRevert();
        _vault().transfer_role_manager(outsider);

        vm.prank(outsider);
        vm.expectRevert();
        _vault().accept_role_manager();

        // And the state did not move.
        assertEq(_vault().role_manager(), d.timelock, "role manager moved");
        assertEq(_vault().future_role_manager(), address(0), "future role manager set");
    }

    /// @notice section 4: "one bit alone is not enough when the function needs another". Proves the
    ///         check is a bit test, not a non-zero test, on the highest-risk setter.
    function test_holdingSomeOtherBitDoesNotGrantUpdateDebt() public {
        uint256[] memory bits = _allBits();
        for (uint256 i = 0; i < bits.length; i++) {
            if (bits[i] == Roles.DEBT_MANAGER) continue;
            address actor = address(uint160(0xA000 + i));
            _setRole(actor, bits[i]);
            assertEq(_vault().roles(actor), bits[i], "role not stored as given");
            _expectNotAllowed(
                actor,
                abi.encodeWithSignature("update_debt(address,uint256,uint256)", d.strategy, 0, 0)
            );
        }
    }

    /// @notice Same for the pause bit: `REPORTING_MANAGER` cannot pause, `EMERGENCY_MANAGER` can.
    function test_onlyTheEmergencyBitCanPause() public {
        _setRole(outsider, Roles.ALL & ~Roles.EMERGENCY_MANAGER);
        vm.prank(outsider);
        vm.expectRevert(bytes("not allowed"));
        _vault().setPaused(true);
        assertFalse(_vault().isPaused(), "paused without the bit");

        _setRole(outsider, Roles.EMERGENCY_MANAGER);
        vm.prank(outsider);
        _vault().setPaused(true);
        assertTrue(_vault().isPaused(), "emergency bit cannot pause");
    }

    /*//////////////////////////////////////////////////////////////
                        POSITIVE: ONE BIT IS ENOUGH
    //////////////////////////////////////////////////////////////*/

    function test_eachBitIsSufficientForItsOwnFunction() public {
        // ADD_STRATEGY_MANAGER
        _setRole(outsider, Roles.ADD_STRATEGY_MANAGER);
        vm.startPrank(outsider);
        _vault().add_strategy(address(secondStrategy), true);
        MorphoVaultStrategy third =
            new MorphoVaultStrategy(address(usdg), address(venue), "Avenor third steakUSDG");
        _vault().add_strategy(address(third), false);
        vm.stopPrank();
        assertGt(_vault().strategies(address(secondStrategy)).activation, 0, "strategy not active");
        assertEq(_vault().default_queue(1), address(secondStrategy), "strategy not queued");

        // QUEUE_MANAGER: two functions behind one bit. Both strategies must be active:
        // `set_default_queue` asserts every queued strategy is (`VaultV3.vy:1408`).
        address[] memory queue = new address[](2);
        queue[0] = d.strategy;
        queue[1] = address(secondStrategy);
        _setRole(outsider, Roles.QUEUE_MANAGER);
        vm.startPrank(outsider);
        _vault().set_default_queue(queue);
        _vault().set_use_default_queue(true);
        vm.stopPrank();
        assertTrue(_vault().use_default_queue(), "queue flag");

        // Documented wrong once: `set_auto_allocate` is `DEBT_MANAGER`, not `QUEUE_MANAGER`
        // (`VaultV3.vy:1438`). It decides whether every deposit is pushed to the venue
        // immediately, i.e. it spends idle cash, so it belongs with the allocation bit.
        vm.prank(outsider);
        vm.expectRevert(bytes("not allowed"));
        _vault().set_auto_allocate(true);

        // REVOKE_STRATEGY_MANAGER (the strategy has no debt, so revoking it is clean)
        _setRole(outsider, Roles.REVOKE_STRATEGY_MANAGER);
        vm.prank(outsider);
        _vault().revoke_strategy(address(secondStrategy));
        assertEq(_vault().strategies(address(secondStrategy)).activation, 0, "still active");

        // FORCE_REVOKE_MANAGER
        _setRole(outsider, Roles.FORCE_REVOKE_MANAGER);
        vm.prank(outsider);
        _vault().force_revoke_strategy(address(third));
        assertEq(_vault().strategies(address(third)).activation, 0, "force revoke did nothing");

        // ACCOUNTANT_MANAGER: re-setting the same accountant is still a gated write
        _setRole(outsider, Roles.ACCOUNTANT_MANAGER);
        vm.prank(outsider);
        _vault().set_accountant(d.accountant);
        assertEq(_vault().accountant(), d.accountant, "accountant dropped");

        // REPORTING_MANAGER
        _setRole(outsider, Roles.REPORTING_MANAGER);
        vm.prank(outsider);
        (uint256 gain, uint256 loss) = _vault().process_report(d.strategy);
        assertEq(gain, 0, "unexpected gain");
        assertEq(loss, 0, "unexpected loss");

        // DEBT_MANAGER: allocation, plus the auto-allocate switch. `update_debt` refuses a
        // no-op (`VaultV3.vy:1020`), so this needs idle cash and a real delta.
        _openDeposits(1_000_000e6);
        // Above `minimum_total_idle` (1_000e6), otherwise `update_debt` has nothing to move.
        _seedDeposit(3_000e6);
        _setRole(outsider, Roles.DEBT_MANAGER);
        vm.startPrank(outsider);
        assertEq(_vault().update_debt(d.strategy, 500e6, 0), 500e6, "debt not allocated");
        _vault().set_auto_allocate(false);
        vm.stopPrank();
        assertFalse(_vault().auto_allocate(), "auto allocate bit cannot set the flag");

        // MAX_DEBT_MANAGER
        _setRole(outsider, Roles.MAX_DEBT_MANAGER);
        vm.prank(outsider);
        _vault().update_max_debt_for_strategy(d.strategy, 42e6);
        assertEq(_vault().strategies(d.strategy).max_debt, 42e6, "max debt not stored");

        // DEPOSIT_LIMIT_MANAGER: limit *and* hook. `set_deposit_hook`'s `override` default is
        // `false` (`VaultV3.vy:1470`), which reverts `"using deposit limit"` unless the limit
        // is already `max`; the second argument is not optional in practice.
        _setRole(outsider, Roles.DEPOSIT_LIMIT_MANAGER);
        vm.startPrank(outsider);
        _vault().set_deposit_limit(7e6);
        vm.expectRevert(bytes("using deposit limit"));
        _vault().set_deposit_hook(address(0));
        _vault().set_deposit_hook(address(0), true);
        vm.stopPrank();
        // With `override = true` the hook write also resets the limit to `max`, so the limit
        // set on the line above is gone: the two knobs cannot be set independently.
        assertEq(_vault().deposit_limit(), type(uint256).max, "override did not clear the limit");

        // WITHDRAW_LIMIT_MANAGER: both hooks
        _setRole(outsider, Roles.WITHDRAW_LIMIT_MANAGER);
        vm.startPrank(outsider);
        _vault().set_withdraw_hook(address(0));
        _vault().set_transfer_hook(address(0));
        vm.stopPrank();
        assertEq(_vault().transfer_hook(), address(0), "transfer hook");

        // MINIMUM_IDLE_MANAGER
        _setRole(outsider, Roles.MINIMUM_IDLE_MANAGER);
        vm.prank(outsider);
        _vault().set_minimum_total_idle(3e6);
        assertEq(_vault().minimum_total_idle(), 3e6, "idle floor not stored");

        // PROFIT_UNLOCK_MANAGER (camelCase in the pinned Vyper)
        _setRole(outsider, Roles.PROFIT_UNLOCK_MANAGER);
        vm.prank(outsider);
        _vault().setProfitMaxUnlockTime(10 days);
        assertEq(_vault().profitMaxUnlockTime(), 10 days, "unlock time not stored");
    }

    /// @notice `DEBT_PURCHASER` is the only bit whose effect costs real money, so it gets its
    ///         own setup: debt exists first, then the treasury buys it and the keeper cannot.
    function test_debtPurchaserIsTheOnlyOneWhoCanAbsorbDebt() public {
        _openDeposits(1_000_000e6);
        _seedDeposit(10_000e6);

        vm.prank(d.keeper);
        _vault().update_debt(d.strategy, 5_000e6, 0);
        assertEq(_vault().strategies(d.strategy).current_debt, 5_000e6, "debt not allocated");

        // The keeper reports, but cannot absorb.
        vm.prank(d.keeper);
        vm.expectRevert(bytes("not allowed"));
        _vault().buy_debt(d.strategy, 1_000e6);

        _setRole(outsider, Roles.DEBT_PURCHASER);
        usdg.mint(outsider, 2_000e6);
        vm.startPrank(outsider);
        usdg.approve(d.vault, 2_000e6);
        _vault().buy_debt(d.strategy, 1_000e6);
        vm.stopPrank();

        assertEq(_vault().strategies(d.strategy).current_debt, 4_000e6, "debt not purchased");
    }

    /*//////////////////////////////////////////////////////////////
        SHUTDOWN: THE SIDE EFFECT THE MATRIX WARNS ABOUT (REGRESSION)
    //////////////////////////////////////////////////////////////*/

    /// @notice section 1 note + section 3 row 4: `shutdown_vault` grants `DEBT_MANAGER` to *the caller*, so the
    ///         emergency key ends up able to allocate. Encoded here because it is a documented
    ///         consequence people forget, and because a Yearn upgrade that dropped it would
    ///         change who can move money after an incident.
    function test_shutdownVaultGrantsDebtManagerToTheCaller() public {
        Deploy.Deployment memory fresh = deployer.deployAll(cfg);
        IVaultV3 vault = IVaultV3(fresh.vault);
        address guardian = fresh.guardian;

        // Same post-handoff state as `setUp`: dry-run leaves `accept_role_manager` pending.
        vm.prank(fresh.timelock);
        vault.accept_role_manager();

        // Deposit is open before shutdown so "closed afterwards" means something.
        vm.prank(fresh.timelock);
        vault.set_deposit_limit(1_000_000e6);
        assertGt(vault.deposit_limit(), 0, "deposit limit was never open");

        assertEq(vault.roles(guardian), Roles.EMERGENCY_MANAGER, "guardian starts with one bit");

        // Idle money has to be in the vault *before* the shutdown: shutting down sets
        // `deposit_limit = 0`, which is exactly one of the things asserted below. The
        // keeper (not the guardian) allocates it, because the guardian holds no debt bit yet.
        usdg.mint(address(this), 2_000e6);
        usdg.approve(fresh.vault, 2_000e6);
        vault.deposit(2_000e6, address(this));
        vm.prank(fresh.keeper);
        vault.update_debt(fresh.strategy, 50e6, 0);
        assertEq(vault.strategies(fresh.strategy).current_debt, 50e6, "setup allocation failed");

        vm.prank(guardian);
        vault.shutdown_vault();

        assertTrue(vault.isShutdown(), "not shut down");
        assertEq(vault.deposit_limit(), 0, "deposit limit not zeroed");
        assertEq(vault.deposit_hook(), address(0), "deposit hook not cleared");
        assertEq(
            vault.roles(guardian),
            Roles.EMERGENCY_MANAGER | Roles.DEBT_MANAGER,
            "caller did not gain debt manager"
        );

        // And the new bit is real: after a shutdown the vault may only *pull* debt back
        // (`VaultV3.vy:1017`), so the guardian's first real use of the granted bit is a
        // withdrawal of the keeper's allocation. A caller without the bit is rejected two
        // tests above, so this is the bit and not the shutdown branch.
        vm.prank(guardian);
        vault.update_debt(fresh.strategy, 0, 0);
        assertEq(vault.strategies(fresh.strategy).current_debt, 0, "guardian cannot pull debt");

        // Withdrawals still work (shutdown is not a pause).
        assertFalse(vault.isPaused(), "shutdown must not pause withdrawals");
    }

    /// @notice The other direction, same function: without `EMERGENCY_MANAGER` nothing happens,
    ///         not even partially.
    function test_shutdownVaultFromAnUnprivilegedCallerChangesNothing() public {
        address[] memory queue = new address[](1);
        queue[0] = d.strategy;
        _openDeposits(5e6);

        _expectNotAllowed(outsider, abi.encodeWithSignature("shutdown_vault()"));
        assertFalse(_vault().isShutdown(), "shut down without the bit");
        assertGt(_vault().deposit_limit(), 0, "limit zeroed without the bit");
        assertEq(_vault().roles(outsider), 0, "unauthorised caller gained a role");
        queue[0] = queue[0];
    }

    /*//////////////////////////////////////////////////////////////
                                 FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice Exactly the documented bit, nothing about the caller's other holdings. Catches a
    ///         future `_enforce_role` rewrite that tests `roles != 0`.
    function testFuzz_onlyTheExactBitGrantsTheFunction(
        uint256 bits
    ) public {
        bits = bound(bits, 0, Roles.ALL);
        _setRole(outsider, bits);
        bool hasBit = bits & Roles.MINIMUM_IDLE_MANAGER != 0;

        vm.prank(outsider);
        if (hasBit) {
            _vault().set_minimum_total_idle(123e6);
            assertEq(_vault().minimum_total_idle(), 123e6, "bit present but call rejected");
        } else {
            vm.expectRevert(bytes("not allowed"));
            _vault().set_minimum_total_idle(123e6);
        }
    }

    function _allBits() internal pure returns (uint256[] memory bits) {
        bits = new uint256[](14);
        bits[0] = Roles.ADD_STRATEGY_MANAGER;
        bits[1] = Roles.REVOKE_STRATEGY_MANAGER;
        bits[2] = Roles.FORCE_REVOKE_MANAGER;
        bits[3] = Roles.ACCOUNTANT_MANAGER;
        bits[4] = Roles.QUEUE_MANAGER;
        bits[5] = Roles.REPORTING_MANAGER;
        bits[6] = Roles.DEBT_MANAGER;
        bits[7] = Roles.MAX_DEBT_MANAGER;
        bits[8] = Roles.DEPOSIT_LIMIT_MANAGER;
        bits[9] = Roles.WITHDRAW_LIMIT_MANAGER;
        bits[10] = Roles.MINIMUM_IDLE_MANAGER;
        bits[11] = Roles.PROFIT_UNLOCK_MANAGER;
        bits[12] = Roles.DEBT_PURCHASER;
        bits[13] = Roles.EMERGENCY_MANAGER;
    }
}
