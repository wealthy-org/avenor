// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Accountant } from "yearn-periphery/accountants/Accountant.sol";
import { IAccountant } from "../src/interfaces/IAccountant.sol";
import { IVaultV3 } from "../src/interfaces/IVaultV3.sol";
import { IVaultFactory } from "../src/interfaces/IVaultFactory.sol";
import { MorphoVaultStrategy } from "../src/strategies/MorphoVaultStrategy.sol";
import { Roles } from "../src/interfaces/Roles.sol";

/// @notice The subset of `TokenizedStrategy` + `BaseStrategy` the deploy script can
///         safely touch.
/// @dev Every function here except `tokenizedStrategyAddress()` and `venue()` is
///      served by a `delegatecall` to the canonical implementation, so it reverts
///      (or silently does nothing) on a local chain where that address has no code.
///      The script gates those calls on `TS_IMPL.code.length` instead of guessing.
interface IStrategyDeploy {
    function tokenizedStrategyAddress() external view returns (address);
    function venue() external view returns (address);
    function management() external view returns (address);
    function pendingManagement() external view returns (address);
    function keeper() external view returns (address);
    function setPendingManagement(
        address
    ) external;
    function setKeeper(
        address
    ) external;
    function setPerformanceFee(
        uint16
    ) external;
    function setProfitMaxUnlockTime(
        uint256
    ) external;
    function setPerformanceFeeRecipient(
        address
    ) external;
    function performanceFee() external view returns (uint16);
    function profitMaxUnlockTime() external view returns (uint256);
    function performanceFeeRecipient() external view returns (address);
    function acceptManagement() external;
}

/// @title Deploy
/// @notice Deploys the Avenor vault stack on chain 4663 in the order fixed by
///         `docs/ARCHITECTURE.md` §5, and refuses to finish if a safety invariant is
///         violated.
///
/// @dev Why this is a script and not "a few forge commands": the two most expensive
///      mistakes here are ordering mistakes — a vault that accepts deposits before its
///      `role_manager` is a 48h timelock, or a guardian that *is* the timelock
///      proposer. Both are cheap to assert and impossible to fix without redeploying.
///
///      Modes:
///        dry-run : local anvil. Placeholder guardian/keeper/treasury are derived from
///                  `makeAddr` and flagged in the output JSON. Role wiring happens here
///                  because the broadcaster is the temporary `role_manager`.
///        stage   : testnet-shaped rehearsal against real addresses; same wiring.
///        prod    : `role_manager` is the timelock from block one. The script deploys
///                  and asserts, but grants nothing: it emits the exact timelock
///                  proposal (targets/values/calldatas) instead of holding a hot key
///                  that could grant itself roles. Anything else would contradict
///                  `docs/ROLE_PERMISSION_MATRIX.md` §2 rule 5.
contract Deploy is Script {
    enum Mode {
        DryRun,
        Stage,
        Prod
    }

    // --- Pinned expectations (docs/BASELINE.md §6) ---------------------------
    /// @dev `BaseStrategy.tokenizedStrategyAddress`, `BaseStrategy.sol:111`.
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;
    bytes32 public constant VAULT_RUNTIME_HASH =
        0x6909c58e42814ae46cadd909f29f19163751b77ff4a2ccf62c5a87e933e02be6;
    uint256 internal constant VAULT_RUNTIME_SIZE = 23_462;
    /// @dev Keccak of the *immutable-free* runtime stored in the artifact, i.e. what
    ///      `scripts/verify-bytecode.py` hashes. The deployed runtime is 32 bytes longer
    ///      because Vyper 0.3.10 appends the immutable `VAULT_ORIGINAL` as a data
    ///      section; hashing the deployed bytes against this constant would only ever
    ///      match for one vault address, which is why the check below is a prefix check
    ///      with an explicit immutables tail.
    bytes32 public constant FACTORY_RUNTIME_HASH =
        0xdfc2a10112cf82c15ada486a586ff1a5bebd312e9dbe86ef8c13d92683bddec2;
    uint256 internal constant FACTORY_RUNTIME_SIZE = 3_604;
    /// @dev `VaultFactory.vy:82` declares exactly one immutable: `VAULT_ORIGINAL`.
    uint256 internal constant FACTORY_IMMUTABLES_SIZE = 32;

    /// @dev ADR-10: 7 days, must be `<= 31_556_952` or `initialize` reverts.
    uint256 internal constant PROFIT_MAX_UNLOCK_TIME = 7 days;
    /// @dev ADR-4: 48 hours is the floor, not the target.
    uint256 internal constant MIN_TIMELOCK_DELAY = 48 hours;

    uint256 internal constant ONE_USDG = 1e6;

    // --- Defaults for chain 4663 (packages/config/4663.json) -----------------
    address internal constant USDG_4663 = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant STEAK_USDG_4663 = 0xBeEff033F34C046626B8D0A041844C5d1A5409dd;

    // --- Errors: specific, so a test can assert the exact failure ------------
    error BytecodeMismatch(string what, bytes32 actual, bytes32 expected, uint256 size);
    error CreationFailed(string what);
    error RoleManagerIsEoa(string what);
    error TimelockDelayTooShort(uint256 actual, uint256 minimum);
    error GuardianEqualsProposer(address who);
    error ZeroAddress(string what);
    error DepositLimitNotZero(uint256 actual);
    error AccountantUnexpected(address accountant);
    error RoleMatrixViolation(string what, address account, uint256 actual, uint256 expected);
    error SeedRequiresBootstrapRoles(string what);
    error StrategyWiringFailed(string what);
    error FeeConfigOutOfBounds(string what, uint256 actual, uint256 max);
    error RefundRatioRequiresFundedAccountant(uint16 refundRatio);
    error ManagementFeeWithMaxFee(uint16 managementFee, uint16 maxFee);
    error AccountantNotWired(string what, address expected);

    struct Config {
        Mode mode;
        /// @notice The address that signs every privileged call (usually the hardware
        ///         wallet or deployer EOA being broadcast).
        /// @dev Explicit on purpose. Under `--broadcast` Foundry re-signs calls made by
        ///      the script as the broadcaster, and it *forbids* reading `msg.sender`
        ///      inside a broadcast, so the script cannot discover this address itself. It
        ///      also does not need to trust it: the vault is created with
        ///      `role_manager = actor`, so a wrong value makes `set_role` revert with
        ///      `NotRoleManager` on the very first wiring call.
        address actor;
        address usdg;
        address venue;
        address timelock; // address(0) => deploy one (dry-run only)
        address proposer;
        address guardian;
        address keeper;
        address treasury;
        address management; // strategy management after handoff
        uint256 maxDebt; // 0 until the limited-launch decision
        /// @dev Idle USDG the vault refuses to lend out. Set explicitly even when it is
        ///      zero: an unset value is indistinguishable from "forgot", and this is the
        ///      parameter that decides how much of a withdrawal can be served without
        ///      touching the venue.
        uint256 minimumTotalIdle;
        uint256 seedAssets; // 0 => no seed
        string vaultName;
        string vaultSymbol;
        string strategyName;
        string factoryName;
        bool placeholdersUsed;
        /// @dev Operator-supplied provenance (`GIT_REV`), copied verbatim into the record.
        string gitRev;
        // --- Accountant (epic 3) -------------------------------------------------
        /// @notice Who receives the fee shares. Defaults to `treasury`; never the deployer.
        address feeRecipient;
        /// @dev v1 values and hard bounds come from `docs/FEE_CONFIG.md` §5. They are
        ///      explicit fields, not constants, so a rehearsal can prove one change at a
        ///      time — but `_validateConfig` refuses anything outside the documented bound.
        uint16 performanceFee;
        uint16 managementFee;
        uint16 refundRatio;
        uint16 maxFee;
        uint16 maxGain;
        uint16 maxLoss;
    }

    struct Deployment {
        address vaultOriginal;
        address factory;
        address vault;
        address accountant;
        address strategy;
        address timelock;
        address guardian;
        address keeper;
        address treasury;
        address management;
        address[] proposalTargets;
        bytes[] proposalCalldatas;
    }

    /*//////////////////////////////////////////////////////////////
                                 ENTRY POINT
    //////////////////////////////////////////////////////////////*/

    /// @dev `virtual` so `DeployLocal` can swap the real venue for mocks. Everything runs
    ///      in this contract's own execution context: Foundry's broadcaster override only
    ///      applies to calls made by the script contract itself, so delegating the deploy
    ///      to a helper contract would simulate a different `msg.sender` than it broadcasts.
    function run() external virtual returns (Deployment memory d) {
        Config memory cfg = configFromEnv();

        // A script cannot read `msg.sender` while broadcasting, so the signing account is
        // explicit: either `PRIVATE_KEY` (checked against `DEPLOYER_ADDRESS`) or a node
        // that already has the configured sender unlocked.
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0 && vm.addr(pk) != cfg.actor) {
            revert ZeroAddress("DEPLOYER_ADDRESS != PRIVATE_KEY");
        }
        startBroadcast(pk);
        d = deployAll(cfg);
        vm.stopBroadcast();

        writeOutput(cfg, d);
    }

    /// @notice Deploy + wire + assert. The caller owns the broadcast; this function only
    ///         emits calls. Tests call it directly, `run()` wraps it in
    ///         `startBroadcast`/`stopBroadcast`.
    function deployAll(
        Config memory cfg
    ) public returns (Deployment memory d) {
        _validateConfig(cfg);
        address actor = cfg.actor;

        // 1. Blueprint. `VaultFactory.deploy_new_vault` clones from this address
        //    (`VaultFactory.vy:130`), so it must exist before the factory.
        d.vaultOriginal = _deployVaultOriginal();

        // 2. Factory, with the timelock (or dry-run placeholder) as governance.
        d.timelock = cfg.timelock;
        if (d.timelock == address(0)) d.timelock = _deployTimelock(cfg);
        d.factory = _deployFactory(cfg, d.vaultOriginal, d.timelock);

        // 3. Vault. `initialize` never touches `deposit_limit`, so a fresh vault is
        //    closed by construction; we assert it rather than trusting the docs.
        address bootstrap = cfg.mode == Mode.Prod ? d.timelock : actor;
        d.vault = IVaultFactory(d.factory)
            .deploy_new_vault(
                cfg.usdg, cfg.vaultName, cfg.vaultSymbol, bootstrap, PROFIT_MAX_UNLOCK_TIME
            );
        _assertVault(d, cfg, bootstrap);

        // 4. Accountant. Deployed before wiring because `addVault` and
        //    `set_accountant` are two calls with two different `msg.sender`s: the
        //    accountant checks its own fee manager, the vault checks
        //    `ACCOUNTANT_MANAGER`. Without `addVault`, every `process_report` reverts
        //    (`"vault not added"`), so the two are always wired together.
        d.accountant = _deployAccountant(cfg, cfg.mode == Mode.Prod ? d.timelock : actor);
        _assertAccountantConfig(cfg, d);

        // 5. Strategy. The venue is immutable, so this is also the venue decision.
        d.strategy = address(new MorphoVaultStrategy(cfg.usdg, cfg.venue, cfg.strategyName));
        _assertStrategy(d, cfg);

        // 6. Wiring. Prod hands the plan to the timelock instead of executing it.
        d.guardian = cfg.guardian;
        d.keeper = cfg.keeper;
        d.treasury = cfg.treasury;
        d.management = cfg.management;
        if (cfg.mode == Mode.Prod) {
            (d.proposalTargets, d.proposalCalldatas) = _buildProposal(d, cfg);
        } else {
            _wireAsBootstrap(d, cfg, actor);
        }

        // 7. Strategy policy, then ownership. Both are the deployer's own keys, so they
        //    happen while the deployer is still `management` of the strategy.
        _configureStrategy(d, cfg);
        _handoffStrategy(d, cfg);

        // 8. Seed dead shares (ADR-7). Only in bootstrap mode: it needs
        //    DEPOSIT_LIMIT_MANAGER, which prod intentionally does not hand out here.
        if (cfg.seedAssets > 0) _seed(d, cfg, actor);

        assertSafety(cfg, d, actor);
    }

    /// @dev `startBroadcast(0)` reverts, so the fallback is the explicit no-key variant
    ///      (a node with the sender unlocked, e.g. `anvil`).
    function startBroadcast(
        uint256 pk
    ) public {
        if (pk == 0) vm.startBroadcast();
        else vm.startBroadcast(pk);
    }

    /*//////////////////////////////////////////////////////////////
                            DEPLOY PRIMITIVES
    //////////////////////////////////////////////////////////////*/

    /// @dev Raw `CREATE` of the bytecode that `scripts/compile-vault.py` produced from
    ///      the pinned checkout. The hash assert is the whole point: a Vyper upgrade or
    ///      an accidental `--optimize gas` flag changes these 23.462 bytes, and the
    ///      reviewed diff would no longer describe what is running.
    function _deployVaultOriginal() internal returns (address addr) {
        bytes memory creation = _artifactCreationCode("VaultV3.json");
        addr = _create(creation, "");
        bytes32 actual = keccak256(addr.code);
        if (actual != VAULT_RUNTIME_HASH || addr.code.length != VAULT_RUNTIME_SIZE) {
            revert BytecodeMismatch("VaultV3", actual, VAULT_RUNTIME_HASH, addr.code.length);
        }
    }

    function _deployFactory(
        Config memory cfg,
        address vaultOriginal,
        address governance
    ) internal returns (address addr) {
        bytes memory creation = _artifactCreationCode("VaultFactory.json");
        addr = _create(creation, abi.encode(cfg.factoryName, vaultOriginal, governance));

        // Runtime = artifact runtime ++ abi.encode(VAULT_ORIGINAL). Assert the artifact
        // really is the reviewed one, then assert the deployed bytes are that artifact
        // with exactly the immutable we intended appended.
        bytes memory prefix = _artifactDeployedCode("VaultFactory.json");
        if (keccak256(prefix) != FACTORY_RUNTIME_HASH || prefix.length != FACTORY_RUNTIME_SIZE) {
            revert BytecodeMismatch(
                "VaultFactory artifact", keccak256(prefix), FACTORY_RUNTIME_HASH, prefix.length
            );
        }
        bytes memory expected = bytes.concat(prefix, abi.encode(vaultOriginal));
        if (keccak256(addr.code) != keccak256(expected)) {
            revert BytecodeMismatch(
                "VaultFactory", keccak256(addr.code), keccak256(expected), addr.code.length
            );
        }
        if (addr.code.length != FACTORY_RUNTIME_SIZE + FACTORY_IMMUTABLES_SIZE) {
            revert BytecodeMismatch(
                "VaultFactory size", keccak256(addr.code), keccak256(expected), addr.code.length
            );
        }
        if (IVaultFactory(addr).vault_original() != vaultOriginal) {
            revert CreationFailed("factory.vault_original");
        }
        if (IVaultFactory(addr).governance() != governance) {
            revert CreationFailed("factory.governance");
        }
    }

    function _deployTimelock(
        Config memory cfg
    ) internal returns (address) {
        address[] memory proposers = new address[](1);
        proposers[0] = cfg.proposer;
        address[] memory executors = new address[](1);
        executors[0] = cfg.proposer;
        // OZ 4.9.5 `TimelockController` has no `canceller` argument (that arrived in
        // OZ 5.x): proposers can also cancel, so the guardian cannot cancel a queued
        // operation. Accepted and documented, because the guardian's power is
        // `EMERGENCY_MANAGER` (instant pause), not proposal bookkeeping.
        // admin = address(0): the timelock administers itself, so no EOA can grant
        // itself the proposer role afterwards.
        return address(new TimelockController(MIN_TIMELOCK_DELAY, proposers, executors, address(0)));
    }

    /// @dev `Accountant` has no upstream deployment artifact, so its bytecode is our own
    ///      build of the pinned source — there is no on-chain hash to compare against. What
    ///      the script *can* prove is that the deployed instance reports the config we
    ///      asked for (`_assertAccountantConfig`) and that the file under test is the
    ///      pinned source (`scripts/check-vendor.py`). Claiming more than that would be
    ///      claiming an audit we did not do.
    function _deployAccountant(
        Config memory cfg,
        address feeManager
    ) internal returns (address) {
        return address(
            new Accountant(
                feeManager,
                cfg.feeRecipient,
                cfg.managementFee,
                cfg.performanceFee,
                cfg.refundRatio,
                cfg.maxFee,
                cfg.maxGain,
                cfg.maxLoss
            )
        );
    }

    function _create(
        bytes memory creationCode,
        bytes memory args
    ) internal returns (address addr) {
        bytes memory code = bytes.concat(creationCode, args);
        assembly {
            addr := create(0, add(code, 0x20), mload(code))
        }
        if (addr == address(0)) revert CreationFailed("create");
        if (addr.code.length == 0) revert CreationFailed("empty runtime");
    }

    function _artifactDeployedCode(
        string memory file
    ) internal view returns (bytes memory) {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../core/artifacts/", file));
        return vm.parseBytes(vm.parseJsonString(json, ".deployedBytecode"));
    }

    function _artifactCreationCode(
        string memory file
    ) internal view returns (bytes memory) {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/../core/artifacts/", file));
        return vm.parseBytes(vm.parseJsonString(json, ".bytecodeObject"));
    }

    /*//////////////////////////////////////////////////////////////
                                  WIRING
    //////////////////////////////////////////////////////////////*/

    /// @dev Bootstrap path: the broadcaster is the temporary `role_manager`, grants the
    ///      final holders their bits, uses its own bits once for `add_strategy` and
    ///      `update_max_debt_for_strategy`, then gives the role manager away. The window
    ///      where an EOA is `role_manager` is therefore a *deploy-time* window with
    ///      `deposit_limit == 0`, not a running-state window.
    function _wireAsBootstrap(
        Deployment memory d,
        Config memory cfg,
        address actor
    ) internal {
        IVaultV3 vault = IVaultV3(d.vault);

        vault.set_role(d.timelock, Roles.governanceRoleSet());
        vault.set_role(d.guardian, Roles.EMERGENCY_MANAGER);
        vault.set_role(d.keeper, Roles.keeperRoleSet());
        vault.set_role(d.treasury, Roles.DEBT_PURCHASER);

        uint256 bootstrapBits = Roles.ADD_STRATEGY_MANAGER | Roles.QUEUE_MANAGER
            | Roles.MAX_DEBT_MANAGER | Roles.DEPOSIT_LIMIT_MANAGER | Roles.MINIMUM_IDLE_MANAGER
            | Roles.ACCOUNTANT_MANAGER;
        vault.set_role(actor, bootstrapBits);

        // The accountant must accept the vault *and* the vault must accept the accountant.
        // Either half alone bricks reporting: the vault calls `report()` whenever
        // `accountant != 0`, and the accountant reverts `"vault not added"` for an unknown
        // vault.
        IAccountant(d.accountant).addVault(d.vault);
        vault.set_accountant(d.accountant);

        vault.add_strategy(d.strategy, true);
        vault.update_max_debt_for_strategy(d.strategy, cfg.maxDebt);
        vault.set_minimum_total_idle(cfg.minimumTotalIdle);
        // ADR-6: withdrawals walk the default queue; explicit so a later default change
        // cannot silently alter withdrawal routing.
        vault.set_use_default_queue(true);
        // Explicit, not assumed: this is the switch that opens the product.
        vault.set_deposit_limit(0);

        // Drop the bootstrap bits before handing over the role manager, so a stolen
        // broadcaster key after deploy cannot add a strategy.
        vault.set_role(actor, 0);
        vault.transfer_role_manager(d.timelock);
    }

    /// @dev Strategy ownership handoff (ADR-4). `BaseStrategy`'s constructor sets
    ///      `management`/`keeper`/`recipient` to the deployer, and `VaultV3` roles do
    ///      not govern the strategy at all: an EOA left as `management` can
    ///      `emergencyWithdraw` to itself forever, whatever the vault says.
    ///
    ///      Run in **both** modes, and deliberately outside the prod/timelock proposal.
    ///      Giving control away needs no delay — only taking it back would — so this
    ///      narrows deployer power immediately instead of waiting 48h for a proposal
    ///      that could not be executed anyway (the timelock is not the strategy's
    ///      management, so it cannot call `setPendingManagement`).
    /// @dev `TokenizedStrategy.initialize` starts every strategy on a 10% performance fee
    ///      paid to the deployer and a 10-day profit unlock
    ///      (`TokenizedStrategy.sol:481-489`). Both are wrong for this product and both must
    ///      be cleared here, because the strategy constructor cannot: those setters call
    ///      `_accrue`, which calls back into `IBaseStrategy(address(this)).strategyTotalAssets()`
    ///      and reverts while the contract still has no code.
    ///
    ///      - The 10% fee would be a *second* performance fee on top of the `Accountant`'s,
    ///        charged silently through `convertToShares` instead of appearing as a line item.
    ///      - The 10-day unlock would smooth profit inside the strategy and then the vault
    ///        would smooth it again over `profit_max_unlock_time`, so the reported gain
    ///        would be neither the venue's number nor the documented one.
    ///
    ///      Values are read back rather than trusted, so a deploy that fails to clear them
    ///      fails loudly instead of shipping a double fee.
    function _configureStrategy(
        Deployment memory d,
        Config memory cfg
    ) internal {
        if (TS_IMPL.code.length == 0) return;
        IStrategyDeploy strategy = IStrategyDeploy(d.strategy);
        strategy.setPerformanceFee(0);
        strategy.setProfitMaxUnlockTime(0);
        // Set even though the fee is zero: if governance ever re-enables one, it must not
        // default to whatever address deployed the contract.
        strategy.setPerformanceFeeRecipient(cfg.treasury);
        strategy.setKeeper(d.keeper);

        if (strategy.performanceFee() != 0) {
            revert StrategyWiringFailed("strategy performance fee not zero");
        }
        if (strategy.profitMaxUnlockTime() != 0) {
            revert StrategyWiringFailed("strategy profit unlock not zero");
        }
        if (strategy.performanceFeeRecipient() != cfg.treasury) {
            revert StrategyWiringFailed("performance fee recipient");
        }
        if (strategy.keeper() != cfg.keeper) {
            revert StrategyWiringFailed("strategy keeper");
        }
    }

    /// @dev `management` — which can `emergencyWithdraw` and re-enable the fee — belongs to
    ///      governance, not to a deploy key. Two-step because `TokenizedStrategy` has no
    ///      `setManagement`; the prod proposal carries the matching `acceptManagement()`.
    function _handoffStrategy(
        Deployment memory d,
        Config memory cfg
    ) internal {
        if (TS_IMPL.code.length == 0 || d.management == address(0)) return;
        IStrategyDeploy strategy = IStrategyDeploy(d.strategy);
        strategy.setPendingManagement(d.management);

        if (strategy.pendingManagement() != d.management) {
            revert StrategyWiringFailed("pending management");
        }
    }

    /// @dev Prod path: produce the exact calls the timelock must execute. The script
    ///      deliberately cannot execute them — that is the control being bought.
    function _buildProposal(
        Deployment memory d,
        Config memory cfg
    ) internal pure returns (address[] memory targets, bytes[] memory calldatas) {
        // 7 vault calls + 2 accountant calls + 1 strategy call. The accountant calls are
        // the ones that make `process_report` work at all; queueing only `set_accountant`
        // would revert every report with `"vault not added"` once the timelock executes.
        // The last call is the second half of the strategy management handoff: the script
        // set `pendingManagement`, and only the timelock itself can accept it.
        targets = new address[](10);
        calldatas = new bytes[](10);
        for (uint256 i; i < 7; ++i) {
            targets[i] = d.vault;
        }
        calldatas[0] = abi.encodeCall(IVaultV3.set_role, (d.guardian, Roles.EMERGENCY_MANAGER));
        calldatas[1] = abi.encodeCall(IVaultV3.set_role, (d.keeper, Roles.keeperRoleSet()));
        calldatas[2] = abi.encodeCall(IVaultV3.set_role, (d.treasury, Roles.DEBT_PURCHASER));
        // `add_strategy` is overloaded (with and without `add_to_queue`), so it cannot
        // be referenced through `abi.encodeCall`: pin the 2-arg selector explicitly.
        calldatas[3] = abi.encodeWithSelector(bytes4(0xc2e73cca), d.strategy, true);
        calldatas[4] =
            abi.encodeCall(IVaultV3.update_max_debt_for_strategy, (d.strategy, cfg.maxDebt));
        calldatas[5] = abi.encodeCall(IVaultV3.set_use_default_queue, (true));
        calldatas[6] = abi.encodeCall(IVaultV3.set_minimum_total_idle, (cfg.minimumTotalIdle));
        targets[7] = d.accountant;
        calldatas[7] = abi.encodeCall(IAccountant.addVault, (d.vault));
        targets[8] = d.vault;
        calldatas[8] = abi.encodeCall(IVaultV3.set_accountant, (d.accountant));
        targets[9] = d.strategy;
        calldatas[9] = abi.encodeWithSelector(IStrategyDeploy.acceptManagement.selector);
    }

    /// @dev ADR-7: deposit a small amount, send the shares to `0xdEaD`, then close the
    ///      door again. The dead shares make a first-depositor share-price attack
    ///      unprofitable instead of merely discouraged.
    function _seed(
        Deployment memory d,
        Config memory cfg,
        address actor
    ) internal {
        IVaultV3 vault = IVaultV3(d.vault);
        if (vault.role_manager() != actor) {
            revert SeedRequiresBootstrapRoles("seed needs the bootstrap role_manager");
        }
        vault.set_role(actor, Roles.DEPOSIT_LIMIT_MANAGER);
        vault.set_deposit_limit(cfg.seedAssets);

        if (!IERC20(cfg.usdg).approve(d.vault, cfg.seedAssets)) {
            revert StrategyWiringFailed("approve seed");
        }
        vault.deposit(cfg.seedAssets, actor);
        uint256 shares = vault.balanceOf(actor);
        if (shares == 0) revert StrategyWiringFailed("seed minted no shares");
        vault.transfer(address(0xdEaD), shares);

        vault.set_deposit_limit(0);
        vault.set_role(actor, 0);
    }

    /*//////////////////////////////////////////////////////////////
                                ASSERTIONS
    //////////////////////////////////////////////////////////////*/

    function _assertVault(
        Deployment memory d,
        Config memory cfg,
        address expectedRoleManager
    ) internal view {
        IVaultV3 vault = IVaultV3(d.vault);

        if (vault.asset() != cfg.usdg) revert CreationFailed("vault.asset");
        if (vault.decimals() != _decimals(cfg.usdg)) revert CreationFailed("vault.decimals");
        if (vault.FACTORY() != d.factory) revert CreationFailed("vault.FACTORY");
        if (keccak256(bytes(vault.apiVersion())) != keccak256("3.1.1")) {
            revert CreationFailed("vault.apiVersion");
        }
        if (vault.role_manager() != expectedRoleManager) {
            revert RoleMatrixViolation(
                "role_manager", expectedRoleManager, uint256(uint160(vault.role_manager())), 0
            );
        }
        // The product is closed until the limited-launch decision says otherwise.
        if (vault.deposit_limit() != 0) revert DepositLimitNotZero(vault.deposit_limit());
        // ADR-6 defaults; asserted so a changed default shows up here, not in prod.
        if (vault.auto_allocate()) revert CreationFailed("auto_allocate");
        if (vault.use_default_queue()) revert CreationFailed("use_default_queue");
        // Accountant is deferred to epic 3 on purpose (no periphery artifact pinned
        // yet). Asserting the gap keeps it visible instead of silently absent.
        if (vault.accountant() != address(0)) revert AccountantUnexpected(vault.accountant());
        // EIP-1167 clone must point at the blueprint we hash-checked above.
        if (_cloneImplementation(d.vault) != d.vaultOriginal) {
            revert CreationFailed("clone implementation");
        }
    }

    function _assertStrategy(
        Deployment memory d,
        Config memory cfg
    ) internal view {
        IStrategyDeploy strategy = IStrategyDeploy(d.strategy);
        if (strategy.tokenizedStrategyAddress() != TS_IMPL) {
            revert CreationFailed("strategy implementation");
        }
        if (strategy.venue() != cfg.venue) revert CreationFailed("strategy.venue");
        // `asset()` and `management()` come from the delegatecalled implementation, so
        // they are only readable when that code exists (fork/prod). Their absence is
        // covered by `test/unit/DeployScript.t.sol`, which etches the vendored code.
        if (TS_IMPL.code.length > 0) {
            address manager = IStrategyDeploy(d.strategy).management();
            // The strategy is created by the script's execution context. Under
            // `--broadcast` that is the broadcaster EOA; in a plain test call it is this
            // contract. Anything else means an unrelated key can emergencyWithdraw.
            if (manager != cfg.actor && manager != address(this)) {
                revert StrategyWiringFailed("strategy management");
            }
        }
    }

    function assertSafety(
        Config memory cfg,
        Deployment memory d,
        address actor
    ) public view {
        IVaultV3 vault = IVaultV3(d.vault);

        if (cfg.mode == Mode.Prod) {
            // Rule 5 of ROLE_PERMISSION_MATRIX §2: the timelock owns the vault from
            // block one, and it is actually a timelock.
            if (vault.role_manager() != d.timelock) {
                revert RoleManagerIsEoa("prod role_manager");
            }
            uint256 delay = TimelockController(payable(d.timelock)).getMinDelay();
            if (delay < MIN_TIMELOCK_DELAY) {
                revert TimelockDelayTooShort(delay, MIN_TIMELOCK_DELAY);
            }
        } else {
            // Handoff is queued but not accepted: `accept_role_manager()` must be
            // executed by the timelock itself. Recording it as a pending action is the
            // honest state, not pretending the transfer is complete.
            if (vault.future_role_manager() != d.timelock) {
                revert RoleMatrixViolation("future_role_manager", d.timelock, 0, 0);
            }
        }

        // Accountant is wired here, not in `_assertVault`: a freshly created vault must
        // have none, and `assertSafety` is the only place that knows both halves ran.
        _assertAccountantWired(cfg, d, actor);

        if (d.guardian == address(0)) revert ZeroAddress("guardian");
        if (d.guardian == cfg.proposer) revert GuardianEqualsProposer(d.guardian);
        if (d.keeper == address(0)) revert ZeroAddress("keeper");
        if (d.treasury == address(0)) revert ZeroAddress("treasury");
        if (d.guardian == d.keeper) revert RoleMatrixViolation("guardian==keeper", d.keeper, 0, 0);

        if (vault.deposit_limit() != 0) revert DepositLimitNotZero(vault.deposit_limit());
        // Written in both modes (bootstrap calls it, prod queues it in the proposal), so a
        // mismatch means someone else changed it between deploy and assert.
        if (cfg.mode != Mode.Prod && vault.minimum_total_idle() != cfg.minimumTotalIdle) {
            revert CreationFailed("minimum_total_idle");
        }

        if (cfg.mode == Mode.Prod) {
            // Nothing was granted: prod must not leave a hot-key trail behind.
            _expectRole(vault, d.guardian, 0, "guardian (pending proposal)");
            _expectRole(vault, d.keeper, 0, "keeper (pending proposal)");
            _expectRole(vault, d.treasury, 0, "treasury (pending proposal)");
            if (vault.strategies(d.strategy).activation != 0) {
                revert StrategyWiringFailed("prod added strategy outside timelock");
            }
        } else {
            _assertRoleMatrix(vault, d, actor);
        }
    }

    /// @dev Reads the deployed accountant back instead of trusting the constructor args,
    ///      and enforces the two documented traps of `docs/FEE_CONFIG.md`:
    ///        - `refundRatio > 0` without a funded accountant is a promise, not protection
    ///          (§2.4), so it is refused at deploy time;
    ///        - `managementFee > 0` together with `maxFee > 0` silently zeroes the
    ///          management fee on every loss report (§2), so the combination is refused.
    function _assertAccountantConfig(
        Config memory cfg,
        Deployment memory d
    ) internal view {
        IAccountant a = IAccountant(d.accountant);

        if (a.feeRecipient() != cfg.feeRecipient) {
            revert AccountantNotWired("feeRecipient", cfg.feeRecipient);
        }
        if (a.feeManager() != (cfg.mode == Mode.Prod ? d.timelock : cfg.actor)) {
            revert AccountantNotWired("feeManager", a.feeManager());
        }
        // `vaultManager` is a second key that may `addVault`. Leaving it unset means the
        // only way to point a vault at this accountant is the fee manager (the timelock).
        if (a.vaultManager() != address(0)) {
            revert AccountantNotWired("vaultManager must be unset", a.vaultManager());
        }
        // Redeem tolerance used when the fee manager realises fees. 0 = refuse any loss.
        // Raising it is a deliberate timelock action, never a deploy default.
        if (a.maxLoss() != 0) revert FeeConfigOutOfBounds("maxLoss", a.maxLoss(), 0);

        (
            uint16 mgmt,
            uint16 perf,
            uint16 refund,
            uint16 maxFee,
            uint16 maxGain,
            uint16 maxLoss,
            bool custom
        ) = a.defaultConfig();
        if (custom) revert AccountantNotWired("defaultConfig is not default", address(0));
        if (
            mgmt != cfg.managementFee || perf != cfg.performanceFee || refund != cfg.refundRatio
                || maxFee != cfg.maxFee || maxGain != cfg.maxGain || maxLoss != cfg.maxLoss
        ) {
            revert AccountantNotWired("defaultConfig differs from config", d.accountant);
        }
    }

    function _assertAccountantWired(
        Config memory cfg,
        Deployment memory d,
        address actor
    ) internal view {
        if (d.accountant == address(0)) revert ZeroAddress("accountant");
        IAccountant a = IAccountant(d.accountant);
        IVaultV3 vault = IVaultV3(d.vault);

        if (cfg.mode == Mode.Prod) {
            // Nothing executed yet: the proposal is exactly what grants these. Asserting
            // the pre-state is what makes the queueing claim checkable.
            if (a.vaults(d.vault)) {
                revert AccountantNotWired("prod added vault outside timelock", d.vault);
            }
            if (vault.accountant() != address(0)) {
                revert AccountantUnexpected(vault.accountant());
            }
        } else {
            if (!a.vaults(d.vault)) revert AccountantNotWired("vault not added", d.vault);
            if (vault.accountant() != d.accountant) {
                revert AccountantNotWired("set_accountant not executed", d.accountant);
            }
            // The deployer gave the accountant bit away with every other bootstrap bit.
            if (vault.roles(actor) != 0) {
                revert RoleMatrixViolation(
                    "deployer keeps accountant powers", actor, vault.roles(actor), 0
                );
            }
        }
    }

    function _assertRoleMatrix(
        IVaultV3 vault,
        Deployment memory d,
        address actor
    ) internal view {
        _expectRole(vault, d.timelock, Roles.governanceRoleSet(), "timelock");
        _expectRole(vault, d.guardian, Roles.EMERGENCY_MANAGER, "guardian");
        _expectRole(vault, d.keeper, Roles.keeperRoleSet(), "keeper");
        _expectRole(vault, d.treasury, Roles.DEBT_PURCHASER, "treasury");
        // The deployer keeps nothing. `roles()` is the on-chain truth the indexer reads.
        _expectRole(vault, actor, 0, "deployer");
        // Keeper must not be able to move the vault's configuration or freeze users.
        if (vault.roles(d.keeper) & Roles.dangerousBits() != 0) {
            revert RoleMatrixViolation(
                "keeper has dangerous bits", d.keeper, vault.roles(d.keeper), 0
            );
        }
        if (vault.strategies(d.strategy).activation == 0) {
            revert StrategyWiringFailed("strategy not added");
        }
    }

    function _expectRole(
        IVaultV3 vault,
        address account,
        uint256 expected,
        string memory what
    ) internal view {
        uint256 actual = vault.roles(account);
        if (actual != expected) revert RoleMatrixViolation(what, account, actual, expected);
    }

    /*//////////////////////////////////////////////////////////////
                                  OUTPUT
    //////////////////////////////////////////////////////////////*/

    /// @dev Foundry's `serialize*` helpers cannot hold more than one array per object (the
    ///      array write replaces the object), so the record is written as several objects
    ///      merged into one file with `writeJson(json, path, key)`.
    function writeOutput(
        Config memory cfg,
        Deployment memory d
    ) public {
        string memory path = string.concat(
            vm.projectRoot(),
            "/deployments/",
            vm.toString(block.chainid),
            ".",
            _modeName(cfg.mode),
            ".json"
        );

        // The object key must stay constant across calls: `serialize*` returns the whole
        // accumulated JSON, and feeding that back as the key silently keeps only the last
        // field. Only the final call's return value is used.
        vm.serializeUint("deployment", "chainId", block.chainid);
        vm.serializeUint("deployment", "blockNumber", block.number);
        vm.serializeUint("deployment", "timestamp", block.timestamp);
        vm.serializeString("deployment", "mode", _modeName(cfg.mode));
        vm.serializeAddress("deployment", "deployer", cfg.actor);
        vm.serializeAddress("deployment", "vaultOriginal", d.vaultOriginal);
        vm.serializeAddress("deployment", "factory", d.factory);
        vm.serializeAddress("deployment", "vault", d.vault);
        vm.serializeAddress("deployment", "strategy", d.strategy);
        vm.serializeAddress("deployment", "accountant", d.accountant);
        vm.serializeAddress("deployment", "timelock", d.timelock);
        vm.serializeAddress("deployment", "guardian", d.guardian);
        vm.serializeAddress("deployment", "keeper", d.keeper);
        vm.serializeAddress("deployment", "treasury", d.treasury);
        vm.serializeAddress("deployment", "strategyManagement", d.management);
        vm.serializeUint("deployment", "profitMaxUnlockTime", PROFIT_MAX_UNLOCK_TIME);
        vm.serializeUint("deployment", "maxDebt", cfg.maxDebt);
        vm.serializeUint("deployment", "minimumTotalIdle", cfg.minimumTotalIdle);
        vm.serializeUint("deployment", "seedAssets", cfg.seedAssets);
        vm.serializeUint("deployment", "depositLimit", IVaultV3(d.vault).deposit_limit());
        vm.serializeBool("deployment", "placeholdersUsed", cfg.placeholdersUsed);
        vm.serializeString("deployment", "vaultRuntimeHash", vm.toString(VAULT_RUNTIME_HASH));
        vm.serializeString("deployment", "factoryRuntimeHash", vm.toString(FACTORY_RUNTIME_HASH));
        // Provenance: the commit the operator says produced these bytes is recorded next
        // to the addresses, so a later reader can check the two agree. Not verified
        // on-chain — a script cannot read git history.
        string memory json = vm.serializeString(
            "deployment", "tokenizedStrategyAddress", vm.toString(address(TS_IMPL))
        );
        json = vm.serializeString("deployment", "gitRev", cfg.gitRev);
        vm.writeJson(json, path, "deployment");

        // Role snapshot read back from the vault, not from what the script thinks it did.
        IVaultV3 v = IVaultV3(d.vault);
        vm.serializeUint("roleMatrix", "timelock", v.roles(d.timelock));
        vm.serializeUint("roleMatrix", "guardian", v.roles(d.guardian));
        vm.serializeUint("roleMatrix", "keeper", v.roles(d.keeper));
        vm.serializeUint("roleMatrix", "treasury", v.roles(d.treasury));
        vm.serializeUint("roleMatrix", "deployer", v.roles(cfg.actor));
        vm.serializeUint("roleMatrix", "strategyMaxDebt", v.strategies(d.strategy).max_debt);
        vm.serializeUint("roleMatrix", "strategyCurrentDebt", v.strategies(d.strategy).current_debt);
        json = vm.serializeUint(
            "roleMatrix", "strategyActivation", v.strategies(d.strategy).activation
        );
        vm.writeJson(json, path, "roleMatrix");

        // Fee state read back from the accountant, not copied from `cfg`. If the two ever
        // disagree, the file is wrong and a reader should see the chain, not the intent.
        _writeFeeConfig(path, d);

        vm.writeJson(
            vm.serializeString("pending", "items", _pendingActions(cfg)), path, "pendingActions"
        );
        vm.writeJson(
            vm.serializeAddress("targets", "items", d.proposalTargets), path, "proposalTargets"
        );

        string[] memory calldatas = new string[](d.proposalCalldatas.length);
        for (uint256 i; i < d.proposalCalldatas.length; ++i) {
            calldatas[i] = vm.toString(d.proposalCalldatas[i]);
        }
        vm.writeJson(vm.serializeString("calldatas", "items", calldatas), path, "proposalCalldatas");
    }

    /// @dev Separate function purely to keep `writeOutput` under the stack limit: the
    ///      tuple plus the cheatcode strings exceed what solc 0.8.18 can keep in scope.
    function _writeFeeConfig(
        string memory path,
        Deployment memory d
    ) internal {
        IAccountant a = IAccountant(d.accountant);
        IAccountant.Fee memory f = a.getVaultConfig(d.vault);
        vm.serializeUint("feeConfig", "managementFee", f.managementFee);
        vm.serializeUint("feeConfig", "performanceFee", f.performanceFee);
        vm.serializeUint("feeConfig", "refundRatio", f.refundRatio);
        vm.serializeUint("feeConfig", "maxFee", f.maxFee);
        vm.serializeUint("feeConfig", "maxGain", f.maxGain);
        vm.serializeUint("feeConfig", "maxLoss", f.maxLoss);
        vm.serializeBool("feeConfig", "custom", f.custom);
        vm.serializeAddress("feeConfig", "feeManager", a.feeManager());
        vm.serializeAddress("feeConfig", "feeRecipient", a.feeRecipient());
        vm.serializeUint("feeConfig", "accountantRedeemMaxLoss", a.maxLoss());
        vm.serializeBool("feeConfig", "vaultAddedToAccountant", a.vaults(d.vault));

        // Epic 3: the strategy must not carry `TokenizedStrategy`'s 10% default fee, and the
        // record has to show that, not just the deploy log. A reader of this file can check
        // that the only fee authority is the accountant above.
        IStrategyDeploy strategy = IStrategyDeploy(d.strategy);
        vm.serializeUint("feeConfig", "strategyPerformanceFee", strategy.performanceFee());
        vm.serializeUint("feeConfig", "strategyProfitMaxUnlockTime", strategy.profitMaxUnlockTime());
        vm.serializeAddress(
            "feeConfig", "strategyPerformanceFeeRecipient", strategy.performanceFeeRecipient()
        );
        vm.serializeAddress("feeConfig", "strategyKeeper", strategy.keeper());

        vm.writeJson(
            vm.serializeAddress("feeConfig", "vaultAccountant", IVaultV3(d.vault).accountant()),
            path,
            "feeConfig"
        );
    }

    function _pendingActions(
        Config memory cfg
    ) internal pure returns (string[] memory actions) {
        bool prod = cfg.mode == Mode.Prod;
        uint256 n = 2 + 2 + (cfg.seedAssets == 0 ? 1 : 0);
        actions = new string[](n);
        uint256 i;
        if (prod) {
            actions[i++] =
            "schedule + execute timelock proposal (roles, strategy, addVault, set_accountant)";
            actions[i++] = "set_deposit_limit(0) confirmed; open only after limited-launch review";
        } else {
            actions[i++] = "timelock must call accept_role_manager() (48h delayed op)";
            actions[i++] = "strategy.acceptManagement() by the new management";
        }
        // Fees accrue as vault shares owned by the accountant. Nothing reaches the
        // treasury until the fee manager redeems them, and `redeemUnderlying` uses the
        // accountant's `maxLoss` (0 at deploy), so this is a real recurring step with a
        // real prerequisite — not a footnote.
        actions[i++] = "fee manager: Accountant.redeemUnderlying + distribute(USDG) to feeRecipient";
        actions[i++] = "set KEEPER_ROLES/ALLOWLIST in keeper app (epic 6)";
        if (cfg.seedAssets == 0) actions[i++] = "seed dead shares once treasury is funded";
    }

    /*//////////////////////////////////////////////////////////////
                                  CONFIG
    //////////////////////////////////////////////////////////////*/

    /// @dev Not `view`: the dry-run branch derives placeholder operator addresses with
    ///      `makeAddr`, which writes to the cheatcode state.
    function configFromEnv() public returns (Config memory cfg) {
        string memory modeRaw = vm.envOr("DEPLOY_MODE", string("dry-run"));
        cfg.mode = _modeFromString(modeRaw);
        cfg.actor = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
        cfg.usdg = vm.envOr("USDG_ADDRESS", USDG_4663);
        cfg.venue = vm.envOr("VENUE_ADDRESS", STEAK_USDG_4663);
        cfg.timelock = vm.envOr("TIMELOCK_ADDRESS", address(0));
        cfg.proposer = vm.envOr("PROPOSER_ADDRESS", address(0));
        if (cfg.proposer == address(0)) cfg.proposer = cfg.actor;
        cfg.guardian = vm.envOr("GUARDIAN_ADDRESS", address(0));
        cfg.keeper = vm.envOr("KEEPER_ADDRESS", address(0));
        cfg.treasury = vm.envOr("TREASURY_ADDRESS", address(0));
        cfg.management = vm.envOr("MANAGEMENT_ADDRESS", address(0));
        cfg.feeRecipient = vm.envOr("FEE_RECIPIENT", address(0));
        cfg.maxDebt = vm.envOr("STRATEGY_MAX_DEBT", uint256(0));
        cfg.minimumTotalIdle = vm.envOr("MINIMUM_TOTAL_IDLE", uint256(0));
        cfg.seedAssets = vm.envOr("SEED_ASSETS", uint256(0));
        cfg.vaultName = vm.envOr("VAULT_NAME", string("Avenor USDG Managed Vault"));
        cfg.vaultSymbol = vm.envOr("VAULT_SYMBOL", string("avUSDG"));
        cfg.strategyName = vm.envOr("STRATEGY_NAME", string("Avenor USDG steakUSDG"));
        cfg.factoryName = vm.envOr("FACTORY_NAME", string("Avenor Vault Factory"));
        cfg.gitRev = vm.envOr("GIT_REV", string(""));

        // Fee config: v1 values from `docs/FEE_CONFIG.md` §5. Read as `uint256` and range
        // checked before narrowing — `uint16(70_000)` would silently become 4_464 and the
        // only symptom would be a wrong fee six months later.
        cfg.performanceFee = _envBps("PERFORMANCE_FEE", 1_000);
        cfg.managementFee = _envBps("MANAGEMENT_FEE", 0);
        cfg.refundRatio = _envBps("REFUND_RATIO", 0);
        cfg.maxFee = _envBps("MAX_FEE", 0);
        cfg.maxGain = _envBps("MAX_GAIN", 500);
        cfg.maxLoss = _envBps("MAX_LOSS", 200);

        // Dry-run placeholders are real key-less addresses generated by `makeAddr`, and
        // the JSON says so. In stage/prod, missing addresses are a hard error: guessing
        // an operator address in a deploy script is how funds get lost.
        if (cfg.mode == Mode.DryRun) {
            if (cfg.guardian == address(0)) {
                cfg.guardian = makeAddr("avenor.dry-run.guardian");
                cfg.placeholdersUsed = true;
            }
            if (cfg.keeper == address(0)) {
                cfg.keeper = makeAddr("avenor.dry-run.keeper");
                cfg.placeholdersUsed = true;
            }
            if (cfg.treasury == address(0)) {
                cfg.treasury = makeAddr("avenor.dry-run.treasury");
                cfg.placeholdersUsed = true;
            }
            if (cfg.management == address(0)) {
                cfg.management = makeAddr("avenor.dry-run.management");
                cfg.placeholdersUsed = true;
            }
        }
        if (cfg.management == address(0)) cfg.management = cfg.timelock;
        // Fees go to the treasury, never to the deployer: a fee recipient that is also the
        // signing key makes every fee number in the UI a self-dealing number.
        if (cfg.feeRecipient == address(0)) cfg.feeRecipient = cfg.treasury;
    }

    /// @dev Reads a bps-style env var and refuses anything that cannot be a bps value.
    function _envBps(
        string memory name,
        uint16 fallbackValue
    ) internal view returns (uint16) {
        uint256 raw = vm.envOr(name, uint256(fallbackValue));
        if (raw > type(uint16).max) {
            revert FeeConfigOutOfBounds(name, raw, type(uint16).max);
        }
        return uint16(raw);
    }

    function _validateConfig(
        Config memory cfg
    ) internal view {
        if (cfg.actor == address(0)) revert ZeroAddress("actor (set DEPLOYER_ADDRESS)");
        if (cfg.usdg == address(0)) revert ZeroAddress("usdg");
        if (cfg.venue == address(0)) revert ZeroAddress("venue");
        if (cfg.venue.code.length == 0) revert ZeroAddress("venue has no code");
        if (cfg.usdg.code.length == 0) revert ZeroAddress("usdg has no code");
        if (cfg.mode == Mode.DryRun || cfg.mode == Mode.Stage) {
            if (cfg.guardian == address(0)) revert ZeroAddress("guardian");
            if (cfg.keeper == address(0)) revert ZeroAddress("keeper");
            if (cfg.treasury == address(0)) revert ZeroAddress("treasury");
        } else {
            // Prod hardening: the timelock proposer and the guardian are human decision
            // points, so they must be multisigs and must not be the deployer EOA. A hot
            // key able to queue its own approvals turns a 48h delay into theatre.
            if (cfg.proposer.code.length == 0) {
                revert ZeroAddress("proposer must be a multisig contract");
            }
            if (cfg.proposer == cfg.actor) {
                revert RoleMatrixViolation("proposer is the deployer", cfg.proposer, 0, 0);
            }
            if (cfg.guardian.code.length == 0) {
                revert ZeroAddress("guardian must be a multisig contract");
            }
            if (cfg.timelock == address(0)) revert ZeroAddress("timelock");
            if (cfg.timelock.code.length == 0) revert RoleManagerIsEoa("timelock");
            uint256 delay = TimelockController(payable(cfg.timelock)).getMinDelay();
            if (delay < MIN_TIMELOCK_DELAY) {
                revert TimelockDelayTooShort(delay, MIN_TIMELOCK_DELAY);
            }
        }
        if (cfg.guardian == cfg.proposer) revert GuardianEqualsProposer(cfg.guardian);
        // Rejected before anything is deployed: a guardian that is also the keeper
        // means one key can both freeze the vault and file the report that explains it.
        if (cfg.guardian == cfg.keeper) {
            revert RoleMatrixViolation("guardian==keeper", cfg.keeper, 0, 0);
        }

        // --- Fee bounds (`docs/FEE_CONFIG.md` §5). The Accountant itself allows up to
        // 5.000 bps performance fee; that is a ceiling for the contract, not for this
        // product. Deploy-time bounds are the ones that describe what a user was told.
        _boundBps("performanceFee", cfg.performanceFee, 2_000);
        _boundBps("managementFee", cfg.managementFee, 200);
        _boundBps("refundRatio", cfg.refundRatio, 5_000);
        _boundBps("maxFee", cfg.maxFee, 2_000);
        _boundBps("maxGain", cfg.maxGain, 1_000);
        _boundBps("maxLoss", cfg.maxLoss, 1_000);

        // §2: `maxFee > 0` scales by `gain`, so a loss report silently drops the
        // management fee. Refusing the combination is cheaper than documenting a fee
        // that does not get charged.
        if (cfg.managementFee > 0 && cfg.maxFee > 0) {
            revert ManagementFeeWithMaxFee(cfg.managementFee, cfg.maxFee);
        }
        // §2.4: refunds come out of the accountant's own asset balance. Enabling the
        // ratio at deploy time, when that balance is necessarily zero, would advertise a
        // loss refund that can never pay out. Fund it first, then set the ratio through
        // the timelock.
        if (cfg.refundRatio > 0) revert RefundRatioRequiresFundedAccountant(cfg.refundRatio);
        if (cfg.feeRecipient == address(0)) revert ZeroAddress("feeRecipient");
        if (cfg.feeRecipient == cfg.actor) {
            revert RoleMatrixViolation("feeRecipient is the deployer", cfg.feeRecipient, 0, 0);
        }
    }

    function _boundBps(
        string memory what,
        uint16 value,
        uint256 max
    ) internal pure {
        if (value > max) revert FeeConfigOutOfBounds(what, value, max);
    }

    /*//////////////////////////////////////////////////////////////
                                  HELPERS
    //////////////////////////////////////////////////////////////*/

    function _modeFromString(
        string memory raw
    ) internal pure returns (Mode) {
        bytes32 h = keccak256(bytes(raw));
        if (h == keccak256("dry-run")) return Mode.DryRun;
        if (h == keccak256("stage")) return Mode.Stage;
        if (h == keccak256("prod")) return Mode.Prod;
        revert CreationFailed("unknown DEPLOY_MODE");
    }

    function _modeName(
        Mode mode
    ) internal pure returns (string memory) {
        if (mode == Mode.DryRun) return "dry-run";
        if (mode == Mode.Stage) return "stage";
        return "prod";
    }

    function _decimals(
        address token
    ) internal view returns (uint8) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || data.length < 32) revert CreationFailed("decimals()");
        return abi.decode(data, (uint8));
    }

    /// @dev Reads the EIP-1167 implementation slot from the clone's runtime code.
    function _cloneImplementation(
        address clone
    ) internal view returns (address impl) {
        bytes memory code = clone.code;
        if (code.length != 45) revert CreationFailed("not an EIP-1167 clone");
        assembly {
            impl := shr(96, mload(add(code, 0x2a)))
        }
    }
}
