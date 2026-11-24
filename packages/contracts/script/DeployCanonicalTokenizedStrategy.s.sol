// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";

interface ICreateX {
    function deployCreate2(
        bytes32 salt,
        bytes memory initCode
    ) external payable returns (address newContract);
}

contract DeployCanonicalTokenizedStrategy is Script {
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
                uint256 hashOffset = i + markerLen;
                for (uint256 k = 0; k < 32; k++) {
                    canonicalCreation[hashOffset + k] = CANONICAL_IPFS_HASH[k];
                }
                break;
            }
        }

        return abi.encodePacked(canonicalCreation, abi.encode(FACTORY_311));
    }

    function run() external returns (address deployed) {
        uint256 codesize = CANONICAL_TS.code.length;
        if (codesize > 0) {
            console.log(
                "TokenizedStrategy v3.1.1 already deployed at canonical address:", CANONICAL_TS
            );
            console.log("Codesize:", codesize);
            return CANONICAL_TS;
        }

        bytes memory creationCode = getCanonicalCreationCode();
        bytes32 rawSalt = bytes32(uint256(0x0a47));

        bytes32 guardedSalt = keccak256(abi.encode(rawSalt));
        address predicted = vm.computeCreate2Address(guardedSalt, keccak256(creationCode), CREATEX);
        require(
            predicted == CANONICAL_TS, "Predicted address mismatch with canonical 0x3110D1...2504"
        );

        vm.startBroadcast();
        deployed = ICreateX(CREATEX).deployCreate2(rawSalt, creationCode);
        vm.stopBroadcast();

        require(deployed == CANONICAL_TS, "Deployed address mismatch with canonical address");
        require(deployed.code.length == 18224, "Deployed bytecode size mismatch with 18224 bytes");
        console.log(
            "Successfully deployed TokenizedStrategy v3.1.1 to canonical address:", deployed
        );
    }
}
