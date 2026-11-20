// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { IMorphoVaultV2 } from "../../src/interfaces/IMorphoVaultV2.sol";

/// @notice Base for fork tests against chain 4663 at a single pinned block.
/// @dev Determinism is the whole point: `maxWithdraw` of the venue changes every
///      block, so a test that forks `latest` proves nothing about the block whose
///      numbers are recorded in `packages/config/4663.json`.
///
///      The pin is verified by *state fingerprint*, not by trusting the block number
///      echo: `totalAssets` and `totalSupply` of `steakUSDG` at block `118337511` are
///      unique to that state. A node that silently serves a different state fails
///      the fingerprint instead of producing plausible-looking results.
///
///      Availability is not guaranteed, and the set of working endpoints moves: on
///      2026-11-19 `robinhood.drpc.org` served this block and then pruned it within the
///      hour (`Unknown state. First available state is 1`; its window is ~150-200 blocks).
///      `https://rpc.solidrpc.io/public/evm/4663` and
///      `https://robinhood.api.onfinality.io/public` do serve it, keyless. Without any
///      archive endpoint the tests **skip loudly**; set `FORK_STRICT=true` to turn a skip
///      into a failure. `scripts/fork-test.py` does that and removes three RPC quirks:
///      it runs `anvil` locally (Foundry 1.9 needs `eth_getAccountInfo`, which public
///      endpoints lack), passes `--fork-state-by-number` (the endpoints reject the
///      EIP-1898 object block parameter) and `--hardfork cancun`.
///
///      Chain 4663 is an Arbitrum Orbit (Nitro) chain, so the two block numbers differ:
///      `block.number` is the **L1 height** (Ethereum, ~26.45M at the pin) and the L2 height
///      is `ArbSys(0x64).arbBlockNumber()` (118337511 at the pin). The pin is therefore
///      verified against `arbBlockNumber()`. Comparing `block.number` to `PIN_BLOCK` — the
///      obvious thing to write — is wrong here and fails on any correct fork.
///
///      Fork runs must also pass `--hardfork cancun` (or newer). With Foundry's default
///      `london` the venue's own bytecode halts at its first `PUSH0`, which revm reports as
///      `EvmError: NotActivated` and which looks exactly like "state missing".
///
///      Two ways to select the fork, and the second one matters:
///      1. `FORK_RPC_URL` in `.env` (or a `[rpc_endpoints]` alias) and `createSelectFork`.
///      2. `forge test --fork-url … --fork-block-number 118337511`, i.e. the fork already
///         exists when `setUp` runs. That path is used when cheatcode fork creation fails
///         even though the endpoint is healthy — observed with drpc, whose free tier answers
///         `createSelectFork` with a refusal that Foundry reports as fork id `0`. The fork
///         the operator already paid a request for is therefore reused instead of opening a
///         second one, and the pin is still verified by fingerprint below. Without this
///         branch a reachable, correct fork would be reported as "unavailable".
abstract contract ForkBase is Test {
    // --- Chain 4663 fixtures (measured at the pin, see docs/REPRODUCIBILITY.md) ---
    uint256 internal constant CHAIN_ID = 4663;
    address internal constant ARB_SYS = 0x0000000000000000000000000000000000000064;
    uint256 internal constant PIN_BLOCK = 118_337_511;
    uint256 internal constant PIN_TIMESTAMP = 1_795_103_654;
    uint256 internal constant PIN_VENUE_TOTAL_ASSETS = 538_856_055_994_280;
    uint256 internal constant PIN_VENUE_TOTAL_SUPPLY = 531_418_644_510_854_399_888_342_585;
    uint256 internal constant PIN_CONVERT_TO_ASSETS_1E18 = 1_013_995;
    uint256 internal constant USDG_TOTAL_SUPPLY = 622_410_599_910_270;

    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant STEAK_USDG = 0xBeEff033F34C046626B8D0A041844C5d1A5409dd;
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;

    /// @dev A real `steakUSDG` holder at the pin: it withdrew 8.213M shares at block
    ///      `116745953` and still held 8.213M shares at `118337511` (`balanceOf`
    ///      measured while the block was still served). It exists so liquidity can be
    ///      measured against a position that is actually large enough to matter.
    address internal constant HOLDER = 0x32Ba0BD09218b1b93681ecF83304A1E5566421f1;
    uint256 internal constant HOLDER_SHARES_AT_PIN = 8_213_519_595_843_454_223_149_753;

    /// @dev Measured at the pin, and the reason `maxWithdraw` cannot be trusted here:
    ///      the venue held `PIN_VENUE_IDLE_USDG` idle USDG while `maxWithdraw` and
    ///      `maxRedeem` both answered `0`. Redeeming the holder's whole position paid out
    ///      `PIN_HOLDER_REDEEM_ALL`. A withdrawal of 30M USDG — larger than the idle
    ///      cash — reverts rather than paying partially. The revert *payload* is not
    ///      stable across runs (`Panic(0x11)` sometimes, empty data other times), so
    ///      nothing pins it: only "over-drawing reverts" is a fact here.
    uint256 internal constant PIN_VENUE_IDLE_USDG = 27_024_457_979_514;

    /// @dev Measured once, kept as evidence, deliberately **not** asserted: unwinding the
    ///      holder's whole position walks every Morpho market the venue touches, which is
    ///      not a path this strategy runs. `VenueProbe` redeems a 1% slice instead.
    uint256 internal constant PIN_HOLDER_REDEEM_ALL = 8_328_471_010_500;

    /// @dev The venue's capacity and return-value lies, measured at the pin with a throwaway
    ///      address: `deposit(10_000e6)` took the full amount while `maxDeposit` said `0`,
    ///      and `withdraw(2_000e6)` returned `PIN_PROBE_WITHDRAW_RETURN` — the 18-decimal
    ///      share count it burned — while paying exactly `2_000.000000` USDG. `redeem`
    ///      returns assets, so the two siblings disagree.
    uint256 internal constant PIN_PROBE_DEPOSIT_SHARES = 9_861_977_769_374_748_661_535;
    uint256 internal constant PIN_PROBE_WITHDRAW_RETURN = 1_972_395_553_874_949_732_308;

    bool internal forkReady;

    /// @return ready false when no endpoint could serve the pinned block.
    function _selectPinnedFork() internal returns (bool ready) {
        // Branch 2: forge was started on the pinned chain+block. Reuse it — do not spend
        // another request creating an identical fork, and do not silently ignore a fork the
        // operator explicitly asked for.
        if (block.chainid == CHAIN_ID && _arbBlockNumber() == PIN_BLOCK) {
            return _pinMatches();
        }

        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        uint256 id;
        if (bytes(rpc).length == 0) {
            // Foundry alias from `foundry.toml`; the URL itself lives in exactly one
            // place so a RPC swap does not need a source edit.
            try vm.createSelectFork("robinhood_drpc", PIN_BLOCK) returns (uint256 _id) {
                id = _id;
            } catch {
                return false;
            }
        } else {
            try vm.createSelectFork(rpc, PIN_BLOCK) returns (uint256 _id) {
                id = _id;
            } catch {
                return false;
            }
        }
        // `id` is not treated as success/failure: Foundry returns 0 both for a refused fork
        // and, on this chain, for a fork that was applied. The chain id plus the fingerprint
        // below are what actually prove the fork is the one we pinned.
        id;

        // The fork may come back on a different block if the node ignores the pin.
        if (block.chainid != CHAIN_ID || _arbBlockNumber() != PIN_BLOCK) return false;

        return _pinMatches();
    }

    /// @dev L2 height. On Arbitrum, `block.number` is the L1 height, which is why every pin
    ///      check in this repo goes through here instead.
    function _arbBlockNumber() internal view returns (uint256 number) {
        (bool ok, bytes memory data) =
            ARB_SYS.staticcall(abi.encodeWithSignature("arbBlockNumber()"));
        if (!ok || data.length < 32) return type(uint256).max;
        number = abi.decode(data, (uint256));
    }

    /// @dev The fingerprint, checked in both branches: `totalAssets` + `totalSupply` of
    ///      `steakUSDG` at the pin. A node serving a different state (or a different block
    ///      that happens to be at the same height) fails here instead of yielding
    ///      plausible-looking numbers.
    function _pinMatches() internal view returns (bool) {
        return IMorphoVaultV2(STEAK_USDG).totalAssets() == PIN_VENUE_TOTAL_ASSETS
            && IMorphoVaultV2(STEAK_USDG).totalSupply() == PIN_VENUE_TOTAL_SUPPLY;
    }

    /// @dev Call from `setUp`: skips (or fails under `FORK_STRICT`) when the pin is
    ///      unreachable, so a missing archive endpoint can never be mistaken for a
    ///      passing test.
    function _requirePinnedFork() internal {
        forkReady = _selectPinnedFork();
        if (forkReady) return;

        if (vm.envOr("FORK_STRICT", false)) {
            revert(
                "pinned fork unavailable: no configured RPC served block 118337511. Set FORK_RPC_URL to an archive endpoint."
            );
        }
        emit log_string("SKIP: pinned fork unavailable. No configured RPC served block 118337511; fork evidence is NOT collected.");
        vm.skip(true);
    }

    function _dealUsdg(
        address to,
        uint256 amount
    ) internal {
        deal(USDG, to, amount);
    }
}
