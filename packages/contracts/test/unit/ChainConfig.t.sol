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
    string internal constant PATH_46630 = "../config/46630.json";
    string internal json;
    string internal json46630;

    function setUp() public {
        json = vm.readFile(PATH);
        json46630 = vm.readFile(PATH_46630);
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

    function test_testnetChainIdentityIsRecorded() external view {
        assertEq(vm.parseJsonUint(json46630, "._meta.network.chainId"), 46630);
        assertEq(vm.parseJsonUint(json46630, "._meta.observed_at.blockNumber"), 157_460_667);
        assertEq(vm.parseJsonUint(json46630, "._meta.observed_at.blockTimestamp"), 1_795_532_440);
        assertEq(
            vm.parseJsonBytes32(json46630, "._meta.observed_at.blockHash"),
            bytes32(0xcf591c0b9419b5e8a0cc50db6a78c2f9ab0c90c01b3a13cdee16b763837be900)
        );
    }

    function test_testnetUSDGIsExplicitlyMarkedMock() external view {
        assertEq(vm.parseJsonUint(json46630, ".tokens.usdg.decimals"), 6);
        assertEq(vm.parseJsonBool(json46630, ".tokens.usdg.isMock"), true);
    }

    function test_testnetTokenizedStrategyIsCanonical() external view {
        assertEq(
            vm.parseJsonAddress(
                json46630, ".infrastructure.tokenizedStrategyImplementation.address"
            ),
            0x3110D1Eec90f0651C18e75AD37711A8777342504
        );
        assertEq(
            vm.parseJsonUint(
                json46630, ".infrastructure.tokenizedStrategyImplementation.runtimeCodesize"
            ),
            18_224
        );
        assertEq(
            vm.parseJsonString(json46630, ".infrastructure.tokenizedStrategyImplementation.status"),
            "deployed"
        );
    }

    function test_testnetStageDeploymentIsRecorded() external view {
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.vault"),
            0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.strategy"),
            0x8f151132f80277b7D42Ad9615172E6De1B26Cf93
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.accountant"),
            0xA499C9F98cE3a66B79dD9CaA99AA894DDE298e32
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.timelock"),
            0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.emergencyTimelock"),
            0xde3f5071559d929d18092EEf7f3B106e39BCD4b6
        );
    }
}
