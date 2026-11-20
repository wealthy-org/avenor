// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";

/// @notice Proves `packages/config/4663.json` is machine-readable and internally consistent.
/// @dev The same file is consumed by the fork harness (ticket 3), the deploy script
///      (ticket 4) and the indexer. A silent shape change would break them at runtime,
///      so the shape is asserted here. Values are *not* re-derived from the chain — this
///      test only guards that the recorded provenance stays attached to the numbers.
contract ChainConfigTest is Test {
    string internal constant PATH = "../config/4663.json";
    string internal json;

    function setUp() public {
        json = vm.readFile(PATH);
    }

    /// @dev forge's JSON path lookup matches keys anywhere in the document, so a key
    ///      name used twice (e.g. `chain` under both root and `_meta`) makes
    ///      `parseJsonUint` fail with "must return exactly one JSON value". Keep key
    ///      names unique across the whole file, which is why this reads
    ///      `_meta.network.chainId` rather than `.chain.chainId`.
    function test_chainIdentityIsPinned() external view {
        assertEq(vm.parseJsonUint(json, "._meta.network.chainId"), 4663);
        assertEq(vm.parseJsonUint(json, "._meta.observed_at.blockNumber"), 118_337_511);
        assertEq(vm.parseJsonUint(json, "._meta.observed_at.blockTimestamp"), 1_795_103_654);
        assertEq(
            vm.parseJsonBytes32(json, "._meta.observed_at.blockHash"),
            bytes32(0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af)
        );
    }

    function test_archiveIsDeclaredForThePinAndDeadEndpointsAreRetired() external view {
        // Fork tests must fail loudly instead of forking `latest` when the pinned block
        // cannot be served. The config records which endpoints actually serve it (archive
        // = true) and which were pruned, so a reader cannot silently reuse a dead host.
        assertEq(vm.parseJsonBool(json, "._meta.rpc.archive"), true);
        vm.parseJsonString(json, "._meta.rpc.primary");
        vm.parseJsonString(json, "._meta.rpc.fallbacks[0]");
        vm.parseJsonString(json, "._meta.rpc.retired[0]");
    }

    function test_usdgIsSixDecimals() external view {
        assertEq(
            vm.parseJsonAddress(json, ".tokens.usdg.address"),
            0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
        );
        assertEq(vm.parseJsonUint(json, ".tokens.usdg.decimals"), 6);
        assertEq(vm.parseJsonString(json, ".tokens.usdg.symbol"), "USDG");
    }

    function test_venueDecimalsDifferFromAssetDecimals() external view {
        // The single most expensive place to get this wrong: 18 vs 6 is a 1e12 error
        // that does not revert. Assert both numbers explicitly.
        assertEq(
            vm.parseJsonAddress(json, ".venues.steakUSDG.address"),
            0xBeEff033F34C046626B8D0A041844C5d1A5409dd
        );
        assertEq(vm.parseJsonUint(json, ".venues.steakUSDG.shareDecimals"), 18);
        assertEq(vm.parseJsonUint(json, ".tokens.usdg.decimals"), 6);
        assertEq(
            vm.parseJsonAddress(json, ".venues.steakUSDG.asset"),
            vm.parseJsonAddress(json, ".tokens.usdg.address")
        );
    }

    function test_venueGapIsRecordedNotHidden() external view {
        // `maxDeposit(0x0) == 0` was observed. The config keeps that fact next to the
        // snapshot so nobody "fixes" the strategy by ignoring the limit.
        assertEq(vm.parseJsonString(json, ".venues.steakUSDG.snapshot.maxDeposit_zero"), "0");
        assertEq(vm.parseJsonString(json, ".venues.steakUSDG.known_absent[0]"), "liquidity()");
        assertEq(vm.parseJsonString(json, ".venues.steakUSDG.status"), "research");
    }

    function test_tokenizedStrategyImplementationIsTheVerifiedOne() external view {
        assertEq(
            vm.parseJsonAddress(json, ".infrastructure.tokenizedStrategyImplementation.address"),
            0x3110D1Eec90f0651C18e75AD37711A8777342504
        );
        assertEq(
            vm.parseJsonUint(
                json, ".infrastructure.tokenizedStrategyImplementation.runtimeCodesize"
            ),
            18_224
        );
    }

    function test_noUsableYearnFactoryIsRecorded() external view {
        // Guards against a future edit pasting an address whose codesize was never read.
        assertEq(vm.parseJsonUint(json, ".infrastructure.yearnVaultFactory.codesize"), 0);
        vm.parseJsonString(json, ".infrastructure.yearnVaultFactory.conclusion");
    }
}
