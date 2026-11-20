// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Deploy } from "./Deploy.s.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { MockERC20 } from "../test/mocks/MockERC20.sol";
import { MockVenue } from "../test/mocks/MockVenue.sol";
import { MockYearnFactory } from "../test/mocks/MockYearnFactory.sol";

/// @notice Local-only rehearsal: deploys stand-ins for USDG and `steakUSDG`, then runs
///         the real deploy path against them.
/// @dev Proves the script's *mechanics* on a bare anvil chain — broadcast recording, raw
///      `CREATE` of the pinned bytecode, EIP-1167 clone deployment, role wiring, safety
///      asserts — without a fork or a real venue. It proves nothing about the real
///      `steakUSDG`; that is `test/fork/*`'s job.
///
///      Usage:
///        anvil &
///        DEPLOYER_ADDRESS=0xf39F...92266 ///        forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 ///          --broadcast --sender 0xf39F...92266 -vv
contract DeployLocal is Deploy {
    function run() external override returns (Deployment memory d) {
        // Captured before `startBroadcast`, which forbids reading `msg.sender`: this is
        // the account that signs the deploy (anvil key #0 unless PRIVATE_KEY is set).
        address actor = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        startBroadcast(pk);
        MockERC20 usdg = new MockERC20("Mock USDG", "USDG", 6);
        MockVenue venue = new MockVenue(address(usdg));

        // The adapter stores `tokenizedStrategyAddress` as an immutable constant pointing
        // at the canonical implementation on chain 4663. Bare anvil has no code there, so
        // every ERC-4626 call on the strategy (including `asset()` during `add_strategy`)
        // delegatecalls into nothing and reverts. Place a locally compiled
        // `TokenizedStrategy` at that exact address, exactly as the unit tests do with
        // `vm.etch`. `vm.etch` alone is not enough here: it only changes the simulated
        // state, while the replayed transactions need the code on the node.
        MockYearnFactory yearnFactory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(yearnFactory));
        vm.rpc(
            "anvil_setCode",
            string.concat(
                "[\"",
                vm.toString(address(TS_IMPL)),
                "\",\"",
                vm.toString(address(template).code),
                "\"]"
            )
        );
        vm.stopBroadcast();

        Config memory cfg = configFromEnv();
        cfg.actor = actor;
        cfg.usdg = address(usdg);
        cfg.venue = address(venue);
        cfg.vaultName = "Avenor USDG Managed Vault (local)";
        cfg.vaultSymbol = "avUSDG";
        cfg.strategyName = "Avenor USDG steakUSDG (local)";
        // Rehearsal: real chain id first so the record carries it, and the local run is
        // still recognisable as a rehearsal rather than a 4663 deployment.
        if (bytes(cfg.gitRev).length == 0) cfg.gitRev = "local-rehearsal";

        startBroadcast(pk);
        d = deployAll(cfg);
        vm.stopBroadcast();

        writeOutput(cfg, d);
    }
}
