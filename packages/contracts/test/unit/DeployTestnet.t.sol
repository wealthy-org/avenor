// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { DeployTestnet } from "../../script/DeployTestnet.s.sol";
import { Deploy } from "../../script/Deploy.s.sol";

/// @title DeployTestnetTest
/// @notice Verifies key hygiene (K-2 / D-1) in DeployTestnet: no makeAddr on non-local chains.
contract DeployTestnetTest is Test {
    DeployTestnet internal script;

    function setUp() public {
        script = new DeployTestnet();
    }

    function test_testnetRejectsMissingKeysOnChain46630() public {
        vm.chainId(46630);
        // On chain 46630, missing GUARDIAN_ADDRESS or KEEPER_ADDRESS must fail closed
        vm.expectRevert();
        script.run();
    }
}
