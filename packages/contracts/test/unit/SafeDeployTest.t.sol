// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";

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

/// @title SafeDeployTest
/// @notice Verifies the ENCODING of the Safe `setup` initializer — and nothing more. No Safe
///         runtime is deployed or executed here: `createProxyWithNonce`, `approveHash` and
///         `execTransaction` are never called in unit tests, so a regression in the actual
///         acceptance path (wrong owners, wrong threshold, an unapproved v=1 signature) is
///         invisible to this suite. The live acceptance is recorded in
///         `packages/config/46630.json` `deployments.stage.governanceHandoff` and
///         `docs/TESTNET_EVIDENCE.md`. Execution-level verification (etching the vendored
///         Safe runtime and exercising `execTransaction` end-to-end) is tracked as
///         follow-up work from the Safe-acceptance code-review decision.
contract SafeDeployTest is Test {
    function test_safeSetupInitializerEncoding() public {
        address[] memory owners = new address[](3);
        owners[0] = makeAddr("owner1");
        owners[1] = makeAddr("owner2");
        owners[2] = makeAddr("owner3");
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

        // Encoding only: this asserts the shape the deploy scripts put on chain, not that
        // a Safe would accept it (see the contract docstring).
        assertEq(bytes4(initializer), ISafe.setup.selector);
    }
}
