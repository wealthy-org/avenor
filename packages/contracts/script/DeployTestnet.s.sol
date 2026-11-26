// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Deploy } from "./Deploy.s.sol";
import { MockERC20 } from "../test/mocks/MockERC20.sol";
import { MockVenue } from "../test/mocks/MockVenue.sol";
import { console } from "forge-std/console.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);
}

interface ISafe {
    function setup(
        address[] memory _owners,
        uint256 _threshold,
        address to,
        bytes memory data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

/// @notice Deploys the complete Avenor vault stack on Robinhood Chain Testnet (46630) in Mode.Stage
contract DeployTestnet is Deploy {
    address constant SAFE_FACTORY = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
    address constant SAFE_SINGLETON = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;

    function run() external override returns (Deployment memory d) {
        // forge-lint: disable-next-line(environment-read-across-mutation)
        uint256 chainId = block.chainid;
        if (chainId != 46630 && chainId != 31337) {
            revert UnsupportedChain(chainId);
        }

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address actor;
        if (pk != 0) {
            actor = vm.addr(pk);
        } else {
            actor = vm.envOr("DEPLOYER_ADDRESS", address(0));
            if (actor == address(0)) {
                actor = 0x56d845a35EDe1436B8053f705b4b189c412A8648;
            }
        }

        startBroadcast(pk);

        // 1. Deploy or resolve Mock USDG
        address usdgAddr = vm.envOr("USDG_ADDRESS", address(0));
        if (usdgAddr == address(0) || usdgAddr.code.length == 0) {
            MockERC20 usdg = new MockERC20("Mock USDG", "mockUSDG", 6);
            usdgAddr = address(usdg);
            console.log("Deployed MockUSDG at:", usdgAddr);
        }

        // 2. Deploy or resolve Mock Venue (steakUSDG stand-in)
        address venueAddr = vm.envOr("VENUE_ADDRESS", address(0));
        if (venueAddr == address(0) || venueAddr.code.length == 0) {
            MockVenue venue = new MockVenue(usdgAddr);
            venueAddr = address(venue);
            console.log("Deployed MockVenue at:", venueAddr);
        }

        // 3. Setup testnet roles
        // Per manager report section 11 & P1-5: Safe multisig 2/3 for testnet governance, guardian, and treasury
        address guardian = vm.envOr("GUARDIAN_ADDRESS", address(0));
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0));
        address treasury = vm.envOr("TREASURY_ADDRESS", address(0));
        address proposer = vm.envOr("PROPOSER_ADDRESS", address(0));

        // Create 2/3 Safe for Governance / Proposer if not provided
        if (proposer == address(0)) {
            proposer = _deploySafe(_governanceOwners(), 1001);
            console.log("Deployed Governance Safe (Proposer) at:", proposer);
        }

        // Guardian and treasury remain explicit configured role addresses. Do not silently
        // manufacture signer identities for them; governance Safe owner identities are the
        // only addresses this script derives from dedicated environment variables.

        // Keeper EOA for automated reporting
        if (keeper == address(0)) {
            keeper = makeAddr("avenor.testnet.keeper");
            console.log("Assigned Keeper address:", keeper);
        }

        vm.stopBroadcast();

        // 4. Configure deployment
        Config memory cfg = configFromEnv();
        cfg.actor = actor;
        cfg.usdg = usdgAddr;
        cfg.venue = venueAddr;
        cfg.mode = Mode.Stage;
        cfg.proposer = proposer;
        cfg.guardian = guardian;
        cfg.keeper = keeper;
        cfg.treasury = treasury;
        cfg.feeRecipient = treasury;
        cfg.management = proposer;
        cfg.vaultName = "Avenor USDG Managed Vault (Testnet)";
        cfg.vaultSymbol = "avUSDG";
        cfg.strategyName = "Avenor USDG steakUSDG (Testnet)";
        cfg.factoryName = "Avenor Vault Factory (Testnet)";
        cfg.gitRev = vm.envOr("GIT_REV", string("testnet-stage-46630"));

        startBroadcast(pk);
        d = deployAll(cfg);
        vm.stopBroadcast();

        writeOutput(cfg, d);
        console.log("Avenor Stack deployed successfully on Chain 46630!");
        console.log("Vault:", d.vault);
        console.log("Strategy:", d.strategy);
        console.log("Accountant:", d.accountant);
        console.log("Timelock (48h):", d.timelock);
        console.log("Emergency Timelock (6h):", d.emergencyTimelock);
    }

    function _governanceOwners() internal returns (address[] memory owners) {
        owners = new address[](3);
        owners[0] = vm.envOr("GOVERNANCE_OWNER_1", address(0));
        owners[1] = vm.envOr("GOVERNANCE_OWNER_2", address(0));
        owners[2] = vm.envOr("GOVERNANCE_OWNER_3", address(0));
        if (owners[0] == address(0) || owners[1] == address(0) || owners[2] == address(0)) {
            revert ZeroAddress("GOVERNANCE_OWNER_1/2/3");
        }
        if (owners[0] == owners[1] || owners[0] == owners[2] || owners[1] == owners[2]) {
            revert InvalidConfig("governance owners must be unique");
        }
        address deployer = vm.envOr("DEPLOYER_ADDRESS", address(0));
        if (
            deployer != address(0)
                && (owners[0] == deployer || owners[1] == deployer || owners[2] == deployer)
        ) {
            revert InvalidConfig("governance owner cannot be deployer");
        }
    }

    function _deploySafe(
        address[] memory owners,
        uint256 nonce
    ) internal returns (address safeProxy) {
        uint256 threshold = 2;

        bytes memory initializer = abi.encodeWithSelector(
            ISafe.setup.selector,
            owners,
            threshold,
            address(0),
            "",
            address(0),
            address(0),
            0,
            payable(address(0))
        );

        safeProxy = ISafeProxyFactory(SAFE_FACTORY)
            .createProxyWithNonce(SAFE_SINGLETON, initializer, nonce);
    }
}
