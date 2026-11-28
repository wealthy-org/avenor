// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";

interface ICreateX {
    function deployCreate2(
        bytes32 salt,
        bytes memory initCode
    ) external payable returns (address newContract);
}

contract TokenizedStrategyDeployTest is Test {
    address constant CREATEX = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;
    address constant FACTORY_311 = 0x311de24e48C360B9A7765E7aB7eCDBABCd27B134;
    address constant CANONICAL_TS = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    // Upstream canonical IPFS metadata hash from Yearn's release of v3.1.1 (commit 48c53ab)
    // Deployed at 0x3110D1Eec90f0651C18e75AD37711A8777342504 on Ethereum, Arbitrum, Base, and Robinhood Chain 4663
    bytes32 constant CANONICAL_IPFS_HASH =
        0x49ffc6d2a2b2b1a9383a4dbcbfe90cd3510b08442f760c46ad0a99d22509ab41;

    function getCanonicalCreationCode() public pure returns (bytes memory) {
        bytes memory rawCreation = type(TokenizedStrategy).creationCode;
        bytes memory canonicalCreation = new bytes(rawCreation.length);
        for (uint256 i = 0; i < rawCreation.length; i++) {
            canonicalCreation[i] = rawCreation[i];
        }

        bytes memory marker = hex"a2646970667358221220";
        uint256 markerLen = marker.length;
        bool patched;
        for (
            uint256 i = canonicalCreation.length - 100;
            i < canonicalCreation.length - markerLen;
            i++
        ) {
            bool matchFound = true;
            for (uint256 j = 0; j < markerLen; j++) {
                if (canonicalCreation[i + j] != marker[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) {
                patched = true;
                uint256 hashOffset = i + markerLen;
                for (uint256 k = 0; k < 32; k++) {
                    canonicalCreation[hashOffset + k] = CANONICAL_IPFS_HASH[k];
                }
                break;
            }
        }
        // A marker that is not found used to fall through silently and return the
        // *unpatched* creation code, whose create2 address then mismatched for a reason
        // unrelated to the actual question. Fail with the real cause instead.
        require(
            patched,
            "canonical IPFS marker not found in vendored creation code; address would mismatch"
        );

        return abi.encodePacked(canonicalCreation, abi.encode(FACTORY_311));
    }

    function test_canonicalAddressCalculation() public {
        bytes memory creationCode = getCanonicalCreationCode();
        bytes32 rawSalt = bytes32(uint256(0x0a47));

        bytes32 guardedSalt = keccak256(abi.encode(rawSalt));
        assertEq(
            guardedSalt,
            0x6b38d02c6d833fcd9319e92fdee40c8b2ca0e465fb7bd0bdf5d856bfb88fc6c2,
            "Guarded salt must match Yearn upstream"
        );

        address predicted = vm.computeCreate2Address(guardedSalt, keccak256(creationCode), CREATEX);

        emit log_named_address("Predicted Canonical Address", predicted);
        assertEq(predicted, CANONICAL_TS, "Predicted address MUST match canonical 0x3110D1...2504");
    }

    function test_deployViaMockCreateXAtCanonicalAddress() public {
        // Etch MockCreateX logic at CreateX address
        MockCreateX mockCreateX = new MockCreateX();
        vm.etch(CREATEX, address(mockCreateX).code);

        bytes memory creationCode = getCanonicalCreationCode();
        bytes32 rawSalt = bytes32(uint256(0x0a47));

        address deployed = ICreateX(CREATEX).deployCreate2(rawSalt, creationCode);
        assertEq(
            deployed,
            CANONICAL_TS,
            "Deployed address via CreateX logic must equal canonical address"
        );
        assertGt(deployed.code.length, 0, "Deployed contract must have code");
        assertEq(deployed.code.length, 18224, "Deployed contract codesize must match 18224 bytes");
    }
}

contract MockCreateX is ICreateX {
    function deployCreate2(
        bytes32 salt,
        bytes memory initCode
    ) external payable override returns (address newContract) {
        // Replicate CreateX._guard for permissionless salt with bytes20(0) and salt[20] == 0:
        bytes32 guardedSalt = keccak256(abi.encode(salt));
        assembly {
            newContract := create2(0, add(initCode, 0x20), mload(initCode), guardedSalt)
        }
        require(newContract != address(0), "CREATE2 failed");
    }
}
