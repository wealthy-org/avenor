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
        assertEq(vm.parseJsonUint(json46630, "._meta.observed_at.blockNumber"), 158_777_022);
        assertEq(vm.parseJsonUint(json46630, "._meta.observed_at.blockTimestamp"), 1_795_860_250);
        assertEq(
            vm.parseJsonBytes32(json46630, "._meta.observed_at.blockHash"),
            bytes32(0x608793e491b55f1d7620be1326a62aedcf345dbf045702c42140b50d00d6afdb)
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
            0xFB6064C2A4CedaD01b2a873E43890D18e1Cb4Dd9
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.strategy"),
            0xc96479EF4274F7619E1e78FA40bfdb3a367d8291
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.accountant"),
            0xE72b69440D6ddb12F07A4f0A335062f7aeD3Ad7C
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.timelock"),
            0x2Bfa51B313AA76d2ED0d8D5971Dd8b3e4235609D
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.emergencyTimelock"),
            0x4B80C02fee19efc0BEb41D921fb3cD54412ad895
        );
        // The remaining stage actors were previously pinned nowhere: a config edit or a
        // redeploy could drift them silently. Pin them here — a legitimate redeploy must
        // update this test on purpose, not pass by accident.
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.factory"),
            0xcA83591e36949a6190957E22DDDB9dad249a57B2
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.vaultOriginal"),
            0x64Dc3C0913744a27E31Eb8322c36ee9494DAdef8
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.governanceSafe"),
            0x68b80E963a8D8029d5D3814A7230887c1Ce0251e
        );
        // v2: guardian and treasury are dedicated EOAs (no Safes on testnet).
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.guardian"),
            0x1a7202181f7bDdeFd031C5C45aADA3479A173796
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.treasury"),
            0x43bD76147a1c897Fd7e9FDdED517E392528e556b
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.keeper"),
            0x60DF56Aec6bb8ae6BDb96538151FCe91b87D2bFA
        );
        assertEq(
            vm.parseJsonAddress(json46630, ".deployments.stage.deployer"),
            0xf6BAE6C6516Ab237d659F97187C475652514c76A
        );
    }

    /// @dev `packages/config/46630.json` and `packages/contracts/deployments/46630.stage.json`
    ///      are two independent records of the same stage deployment: the config is curated
    ///      by hand, the record is written by `Deploy.writeOutput`. Neither is authoritative,
    ///      so they must agree — a silent drift means the SDK, indexer or rehearsal scripts
    ///      read addresses that no longer match the deployed stack.
    function test_testnetConfigAndStageDeploymentRecordAgree() external view {
        string memory record = vm.readFile("./deployments/46630.stage.json");
        _assertRecordMatches(record, ".deployment.vault", ".deployments.stage.vault");
        _assertRecordMatches(record, ".deployment.strategy", ".deployments.stage.strategy");
        _assertRecordMatches(record, ".deployment.accountant", ".deployments.stage.accountant");
        _assertRecordMatches(record, ".deployment.factory", ".deployments.stage.factory");
        _assertRecordMatches(
            record, ".deployment.vaultOriginal", ".deployments.stage.vaultOriginal"
        );
        _assertRecordMatches(record, ".deployment.timelock", ".deployments.stage.timelock");
        _assertRecordMatches(
            record, ".deployment.emergencyTimelock", ".deployments.stage.emergencyTimelock"
        );
        _assertRecordMatches(record, ".deployment.deployer", ".deployments.stage.deployer");
        _assertRecordMatches(record, ".deployment.keeper", ".deployments.stage.keeper");
        // Aliases: the config names the actor, the record names the role it fills.
        // v2: guardian and treasury are dedicated EOAs (config key = actor name, not Safe).
        _assertRecordMatches(record, ".deployment.guardian", ".deployments.stage.guardian");
        _assertRecordMatches(record, ".deployment.treasury", ".deployments.stage.treasury");
        _assertRecordMatches(
            record, ".deployment.strategyManagement", ".deployments.stage.governanceSafe"
        );
    }

    function _assertRecordMatches(
        string memory record,
        string memory recordPath,
        string memory configPath
    ) internal view {
        assertEq(
            vm.parseJsonAddress(record, recordPath),
            vm.parseJsonAddress(json46630, configPath),
            string.concat(recordPath, " != config ", configPath)
        );
    }
}
