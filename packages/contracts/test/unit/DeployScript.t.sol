// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { IVaultFactory } from "../../src/interfaces/IVaultFactory.sol";
import { Roles } from "../../src/interfaces/Roles.sol";
import { IAccountant } from "../../src/interfaces/IAccountant.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";

/// @dev Stand-in for a Safe multisig: prod mode requires the proposer and the guardian to
///      be contracts, so the tests need something with code but no behaviour.
contract MockMultisig { }

/// @dev Only the getters this suite needs from the delegatecalled implementation.
interface IDStrategyStrategy {
    function management() external view returns (address);
    function pendingManagement() external view returns (address);
    function keeper() external view returns (address);
    function performanceFee() external view returns (uint16);
    function profitMaxUnlockTime() external view returns (uint256);
    function performanceFeeRecipient() external view returns (address);
}

/// @notice Exercises `Deploy.deployAll` on the EVM. Every assertion here is one the
///         script itself makes, plus the ones it *cannot* make without a live chain
///         (revert paths for a bad config).
contract DeployScriptTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    Deploy internal deployer;
    MockERC20 internal usdg;
    MockVenue internal venue;

    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal proposer = makeAddr("proposer");
    address internal management = makeAddr("management");
    uint256 internal constant STRATEGY_MAX_DEBT_TEST = 250_000e6;
    uint256 internal constant MINIMUM_TOTAL_IDLE = 1_000e6;
    MockMultisig internal proposerSafe;
    MockMultisig internal guardianSafe;

    function setUp() public {
        deployer = new Deploy();
        proposerSafe = new MockMultisig();
        guardianSafe = new MockMultisig();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));
        // The strategy's `asset()`, `management()` and `keeper()` live in the
        // delegatecalled implementation; without code at that address they revert.
        MockYearnFactory factory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(factory));
        vm.etch(TS_IMPL, address(template).code);
    }

    /// @dev Runs the deploy path without broadcast, acting as the script contract itself
    ///      (`address(deployer)` from here) — the same identity relationship a real
    ///      broadcast has between the signer and the contracts it creates.
    function _deploy(
        Deploy.Config memory cfg
    ) internal returns (Deploy.Deployment memory) {
        return deployer.deployAll(cfg);
    }

    /*//////////////////////////////////////////////////////////////
                                  CONFIG
    //////////////////////////////////////////////////////////////*/

    function _config(
        Deploy.Mode mode,
        address timelock
    ) internal view returns (Deploy.Config memory cfg) {
        cfg = Deploy.Config({
            mode: mode,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue),
            timelock: timelock,
            proposer: proposer,
            guardian: guardian,
            keeper: keeper,
            treasury: treasury,
            management: address(0),
            maxDebt: STRATEGY_MAX_DEBT_TEST,
            minimumTotalIdle: MINIMUM_TOTAL_IDLE,
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
    }

    /*//////////////////////////////////////////////////////////////
                             DRY-RUN / STAGE
    //////////////////////////////////////////////////////////////*/

    function test_dryRunDeploysAndWiresTheWholeStack() public {
        Deploy.Deployment memory d = _deploy(_config(Deploy.Mode.DryRun, address(0)));

        IVaultV3 vault = IVaultV3(d.vault);

        // Blueprint + factory identities are the reviewed bytes, not "some Vyper".
        assertEq(keccak256(d.vaultOriginal.code), deployer.VAULT_RUNTIME_HASH(), "vault hash");
        // A deployed factory is the artifact runtime (immutable-free) plus the 32-byte
        // `VAULT_ORIGINAL` data section Vyper appends, so hashing the deployed bytes
        // against the artifact hash would only pass for one specific blueprint address.
        bytes memory factoryPrefix = vm.parseBytes(
            vm.parseJsonString(
                vm.readFile("../core/artifacts/VaultFactory.json"), ".deployedBytecode"
            )
        );
        assertEq(keccak256(factoryPrefix), deployer.FACTORY_RUNTIME_HASH(), "artifact runtime");
        assertEq(
            keccak256(d.factory.code),
            keccak256(bytes.concat(factoryPrefix, abi.encode(d.vaultOriginal))),
            "factory runtime == artifact ++ immutable"
        );
        assertEq(IVaultFactory(d.factory).vault_original(), d.vaultOriginal, "blueprint");
        assertEq(IVaultFactory(d.factory).governance(), d.timelock, "factory governance");

        // Vault shape.
        assertEq(vault.asset(), address(usdg));
        assertEq(vault.decimals(), 6);
        assertEq(vault.apiVersion(), "3.1.1");
        assertEq(vault.FACTORY(), d.factory);
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.deposit_limit(), 0, "product stays closed");
        assertFalse(vault.auto_allocate());
        assertTrue(vault.use_default_queue());
        assertEq(vault.profitMaxUnlockTime(), 7 days);

        // Two-step handoff: the timelock is *future* role manager, it must accept.
        assertEq(vault.role_manager(), address(deployer));
        assertEq(vault.future_role_manager(), d.timelock);

        // Role matrix: governance gets product bits, nobody else does.
        assertEq(vault.roles(d.timelock), Roles.governanceRoleSet(), "timelock roles");
        assertEq(vault.roles(guardian), Roles.EMERGENCY_MANAGER, "guardian roles");
        assertEq(vault.roles(keeper), Roles.REPORTING_MANAGER | Roles.DEBT_MANAGER, "keeper");
        assertEq(vault.roles(treasury), Roles.DEBT_PURCHASER, "treasury");
        assertEq(vault.roles(address(deployer)), 0, "deployer keeps nothing");
        assertEq(
            vault.roles(keeper) & Roles.dangerousBits(), 0, "keeper cannot reconfigure or freeze"
        );

        // The strategy must not carry `TokenizedStrategy`'s 10% default performance fee:
        // with the `Accountant` also charging, that would be a silent second fee.
        IDStrategyStrategy strategyAdmin = IDStrategyStrategy(d.strategy);
        assertEq(strategyAdmin.performanceFee(), 0, "strategy charges no fee of its own");
        assertEq(strategyAdmin.profitMaxUnlockTime(), 0, "vault owns profit smoothing");

        // Strategy registered but unfunded.
        assertEq(vault.strategies(d.strategy).activation != 0, true, "strategy activated");
        // Non-zero max_debt with zero `current_debt`: the credit line exists, nothing
        // is drawn yet. Allocation is the keeper's separate `update_debt` call.
        assertEq(vault.strategies(d.strategy).max_debt, STRATEGY_MAX_DEBT_TEST, "credit line only");
        assertEq(vault.minimum_total_idle(), MINIMUM_TOTAL_IDLE, "idle buffer written");
        assertEq(vault.strategies(d.strategy).current_debt, 0);
        assertEq(vault.default_queue(0), d.strategy, "queue seeded with the strategy");

        // Accountant (epic 3): wired on both sides. `set_accountant` alone would make
        // every `process_report` revert `"vault not added"`, so the vault-side assertion is
        // paired with the accountant-side one on purpose.
        IAccountant accountant = IAccountant(d.accountant);
        assertEq(vault.accountant(), d.accountant, "vault points at the accountant");
        assertTrue(accountant.vaults(d.vault), "accountant accepted the vault");
        assertEq(accountant.feeManager(), address(deployer), "bootstrap actor manages fees");
        assertEq(accountant.feeRecipient(), treasury, "fees go to the treasury");
        assertEq(accountant.vaultManager(), address(0), "no second key may add vaults");
        assertEq(accountant.maxLoss(), 0, "no redeem tolerance by default");
        (
            uint16 mgmt,
            uint16 perf,
            uint16 refund,
            uint16 feeCap,
            uint16 gainCap,
            uint16 lossCap,
            bool custom
        ) = accountant.defaultConfig();
        assertEq(mgmt, 0, "managementFee");
        assertEq(perf, 1_000, "performanceFee 10%");
        assertEq(refund, 0, "refundRatio");
        assertEq(feeCap, 0, "maxFee");
        assertEq(gainCap, 500, "maxGain 5%/report");
        assertEq(lossCap, 200, "maxLoss 2%/report");
        assertFalse(custom, "default config, not a per-vault override");
        // The fee shares minted during `process_report` are owned by the accountant, so the
        // vault must be able to burn/issue against it; `report` is the only call it makes.
        assertEq(vault.roles(address(accountant)), 0, "accountant gets no vault role");
    }

    /// @dev `VaultV3` roles do not govern the strategy at all. The strategy's
    ///      `management` can `emergencyWithdraw` to its `performanceFeeRecipient`
    ///      forever, so this handoff — not the vault — is what removes the deployer's
    ///      power. It is two-step: `pendingManagement` until the new owner accepts.
    function test_strategyHandoffIsProposedAndTwoStep() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.management = management;
        Deploy.Deployment memory d = _deploy(cfg);

        IDStrategyStrategy s = IDStrategyStrategy(d.strategy);
        assertEq(s.management(), address(deployer), "still the deployer until accepted");
        assertEq(s.pendingManagement(), management, "intent is on chain");
        assertEq(s.keeper(), keeper, "keeper is set directly; there is no pendingKeeper");
        assertEq(s.performanceFee(), 0, "no strategy-level fee survives the handoff");
        assertEq(s.profitMaxUnlockTime(), 0, "no second smoothing curve");
        assertEq(s.performanceFeeRecipient(), treasury, "future fee, if any, goes to treasury");
        assertEq(d.management, management);

        // Without a handoff target the deployer keeps both, and the suite says so rather
        // than letting it pass silently.
        Deploy.Deployment memory e = _deploy(_config(Deploy.Mode.DryRun, address(0)));
        IDStrategyStrategy t = IDStrategyStrategy(e.strategy);
        assertEq(t.pendingManagement(), address(0), "no handoff target, no intent");
        assertEq(t.management(), address(deployer), "ownership stays with the deployer");
        // Policy is *not* deferred until a handoff: the 10% default fee and the 10-day
        // unlock are cleared in every mode, so "no management target" cannot mean
        // "10% fee survives".
        assertEq(t.keeper(), keeper, "keeper set regardless of the handoff");
        assertEq(t.performanceFee(), 0);
        assertEq(t.profitMaxUnlockTime(), 0);
    }

    function test_depositIsClosedRightAfterDeploy() public {
        Deploy.Deployment memory d = _deploy(_config(Deploy.Mode.DryRun, address(0)));
        usdg.mint(address(this), 1_000e6);

        vm.startPrank(address(0xBEEF));
        usdg.mint(address(0xBEEF), 10e6);
        IERC20(address(usdg)).approve(d.vault, 10e6);
        vm.expectRevert();
        IVaultV3(d.vault).deposit(10e6, address(0xBEEF));
        vm.stopPrank();
    }

    function test_seedMintsDeadSharesThenClosesTheDoor() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.seedAssets = 10e6;
        usdg.mint(address(deployer), 10e6);

        Deploy.Deployment memory d = _deploy(cfg);
        IVaultV3 vault = IVaultV3(d.vault);

        assertGt(vault.totalSupply(), 0, "seed minted shares");
        assertEq(vault.balanceOf(address(0xdEaD)), vault.totalSupply(), "all seed shares burned");
        assertEq(vault.balanceOf(address(deployer)), 0, "deployer keeps no shares");
        assertEq(vault.deposit_limit(), 0, "deposit limit closed again");
        assertEq(vault.totalIdle(), 10e6, "seed assets stay idle, no allocation");
    }

    /*//////////////////////////////////////////////////////////////
                                  PROD
    //////////////////////////////////////////////////////////////*/

    function _timelock(
        uint256 delay
    ) internal returns (address) {
        address[] memory proposers = new address[](1);
        proposers[0] = address(proposerSafe);
        address[] memory executors = new address[](1);
        executors[0] = address(proposerSafe);
        return address(new TimelockController(delay, proposers, executors, address(0)));
    }

    function test_prodUsesTimelockAsRoleManagerAndGrantsNothing() public {
        address timelock = _timelock(48 hours);
        Deploy.Config memory cfg = _config(Deploy.Mode.Prod, timelock);
        cfg.proposer = address(proposerSafe);
        cfg.guardian = address(guardianSafe);
        Deploy.Deployment memory d = _deploy(cfg);

        IVaultV3 vault = IVaultV3(d.vault);
        assertEq(vault.role_manager(), timelock, "timelock owns from block one");
        assertEq(vault.future_role_manager(), address(0), "no pending handoff needed");
        assertEq(IVaultFactory(d.factory).governance(), timelock);

        // No hot key granted anything: the proposal carries the plan instead.
        assertEq(vault.roles(address(guardianSafe)), 0);
        assertEq(vault.roles(keeper), 0);
        assertEq(vault.roles(treasury), 0);
        assertEq(vault.roles(d.emergencyTimelock), 0, "fast lane granted before the proposal");
        assertEq(vault.strategies(d.strategy).activation, 0, "strategy not added by script");
        // 7 bootstrap vault calls + addVault(accountant) + set_accountant(vault) + the
        // second half of the strategy handoff (acceptManagement) + the 6h fast lane's single
        // bit (ADR-12). The accountant pair is not optional: without it the vault reports
        // into a reverting accountant the moment the proposal executes.
        assertEq(d.proposalTargets.length, 11);
        assertEq(d.proposalCalldatas.length, 11);
        for (uint256 i; i < 7; ++i) {
            assertEq(d.proposalTargets[i], d.vault, "vault call");
        }
        assertEq(d.proposalTargets[7], d.accountant, "addVault target is the accountant");
        assertEq(d.proposalTargets[8], d.vault, "set_accountant target is the vault");
        assertEq(
            bytes4(d.proposalCalldatas[7]), IAccountant.addVault.selector, "calldata 7 is addVault"
        );
        assertEq(
            bytes4(d.proposalCalldatas[8]),
            IVaultV3.set_accountant.selector,
            "calldata 8 is set_accountant"
        );
        assertEq(d.proposalTargets[9], d.strategy, "acceptManagement target is the strategy");
        assertEq(
            bytes4(d.proposalCalldatas[9]),
            bytes4(keccak256("acceptManagement()")),
            "calldata 9 is acceptManagement"
        );
        assertEq(d.proposalTargets[10], d.vault, "fast lane role target is the vault");
        assertEq(
            bytes4(d.proposalCalldatas[10]), IVaultV3.set_role.selector, "calldata 10 is set_role"
        );
        // Prod leaves the accountant unowned by the vault until the timelock executes.
        assertEq(vault.accountant(), address(0), "no accountant before the proposal runs");
        assertFalse(IAccountant(d.accountant).vaults(d.vault), "no addVault before the proposal");
        assertEq(IAccountant(d.accountant).feeManager(), timelock, "timelock manages fees");
        assertEq(vault.deposit_limit(), 0);
    }

    /// @dev The Accountant allows a 50% performance fee and a 2% management fee; those are
    ///      contract ceilings, not product promises. `docs/FEE_CONFIG.md` §5 documents a
    ///      tighter bound per parameter and the script refuses anything above it before a
    ///      single contract is created.
    function test_feeConfigAboveDocumentedBoundIsRejected() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.performanceFee = 2_001; // bound is 2.000 (20%)
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.FeeConfigOutOfBounds.selector,
                "performanceFee",
                uint256(2_001),
                uint256(2_000)
            )
        );
        deployer.deployAll(cfg);

        cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.maxGain = 1_001; // bound is 1.000 (10%/report)
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.FeeConfigOutOfBounds.selector, "maxGain", uint256(1_001), uint256(1_000)
            )
        );
        deployer.deployAll(cfg);

        cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.maxLoss = 1_001; // bound is 1.000 (10%/report)
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.FeeConfigOutOfBounds.selector, "maxLoss", uint256(1_001), uint256(1_000)
            )
        );
        deployer.deployAll(cfg);
    }

    /// @dev `docs/FEE_CONFIG.md` §2: `maxFee > 0` scales the total fee by `gain`, so on a
    ///      loss report it zeroes the management fee. The combination is refused instead of
    ///      documented, because a fee that is advertised and never charged is a defect.
    function test_managementFeeWithMaxFeeIsRejected() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.managementFee = 100;
        cfg.maxFee = 1_000;
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.ManagementFeeWithMaxFee.selector, uint16(100), uint16(1_000)
            )
        );
        deployer.deployAll(cfg);
    }

    /// @dev §2.4: refunds are paid out of the accountant's own asset balance. Enabling a
    ///      refund ratio at deploy time — when that balance is necessarily zero — would
    ///      advertise a loss refund that can never pay. Fund it first, then raise the ratio
    ///      through the timelock.
    function test_refundRatioWithoutFundingIsRejected() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.refundRatio = 1_000;
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.RefundRatioRequiresFundedAccountant.selector, uint16(1_000)
            )
        );
        deployer.deployAll(cfg);
    }

    function test_feeRecipientMayNotBeTheDeployer() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.feeRecipient = cfg.actor;
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.RoleMatrixViolation.selector,
                "feeRecipient is the deployer",
                cfg.actor,
                uint256(0),
                uint256(0)
            )
        );
        deployer.deployAll(cfg);
    }

    function test_prodRejectsEoaProposer() public {
        address timelock = _timelock(48 hours);
        Deploy.Config memory cfg = _config(Deploy.Mode.Prod, timelock);
        cfg.proposer = proposer; // EOA
        cfg.guardian = address(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.ZeroAddress.selector, "proposer must be a multisig contract"
            )
        );
        deployer.deployAll(cfg);
    }

    function test_prodRejectsEoaGuardian() public {
        address timelock = _timelock(48 hours);
        Deploy.Config memory cfg = _config(Deploy.Mode.Prod, timelock);
        cfg.proposer = address(proposerSafe);
        cfg.guardian = guardian; // EOA
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.ZeroAddress.selector, "guardian must be a multisig contract"
            )
        );
        deployer.deployAll(cfg);
    }

    function test_prodRejectsDeployerAsProposer() public {
        address timelock = _timelock(48 hours);
        Deploy.Config memory cfg = _config(Deploy.Mode.Prod, timelock);
        cfg.proposer = cfg.actor;
        cfg.guardian = address(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.RoleMatrixViolation.selector,
                "proposer is the deployer",
                cfg.actor,
                uint256(0),
                uint256(0)
            )
        );
        deployer.deployAll(cfg);
    }

    function test_prodRejectsEoaTimelock() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.Prod, proposer);
        cfg.proposer = address(proposerSafe);
        cfg.guardian = address(guardianSafe);
        vm.expectRevert(abi.encodeWithSelector(Deploy.RoleManagerIsEoa.selector, "timelock"));
        deployer.deployAll(cfg);
    }

    function test_prodRejectsTimelockBelowDelayFloor() public {
        address timelock = _timelock(1 hours);
        Deploy.Config memory cfg = _config(Deploy.Mode.Prod, timelock);
        cfg.proposer = address(proposerSafe);
        cfg.guardian = address(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.TimelockDelayTooShort.selector, uint256(1 hours), uint256(48 hours)
            )
        );
        deployer.deployAll(cfg);
    }

    function test_guardianMayNotBeTheProposer() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.guardian = proposer;
        vm.expectRevert(abi.encodeWithSelector(Deploy.GuardianEqualsProposer.selector, proposer));
        deployer.deployAll(cfg);
    }

    function test_guardianAndKeeperMustBeDifferent() public {
        Deploy.Config memory cfg = _config(Deploy.Mode.DryRun, address(0));
        cfg.keeper = guardian;
        vm.expectRevert(
            abi.encodeWithSelector(
                Deploy.RoleMatrixViolation.selector,
                "guardian==keeper",
                guardian,
                uint256(0),
                uint256(0)
            )
        );
        deployer.deployAll(cfg);
    }

    function test_unsupportedChainReverts() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(Deploy.UnsupportedChain.selector, uint256(1)));
        deployer.configFromEnv();
    }

    function test_testnetChain46630NeverUsesMainnetDefaults() public {
        vm.chainId(46630);
        Deploy.Config memory cfg = deployer.configFromEnv();
        assertEq(cfg.usdg, address(0));
        assertEq(cfg.venue, address(0));
    }
}
