---
title: 'Scaffold contracts package with pinned build settings and vendored core'
type: 'chore'
ticket: 1
created: '2026-11-19'
status: 'done'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'default'
review_source: 'default'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/BASELINE.md', 'docs/ARCHITECTURE.md', 'packages/core/artifacts/VaultV3.json', 'packages/core/artifacts/VaultFactory.json', 'referensi/tokenized-strategy/src/BaseStrategy.sol']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tidak ada paket Solidity yang bisa dibangun. Tanpa pin build yang eksplisit, ABI bisa diam-diam menyimpang dari bytecode yang sudah diverifikasi (camelCase `setPaused`/`setProfitMaxUnlockTime`, signature `_assess_share_of_unrealised_losses` yang baru), dan strategi bisa dikompilasi terhadap `TokenizedStrategy` versi lain.

**Approach:** Buat `packages/contracts` dengan settings terkunci (`solc 0.8.18`, `evm_version = paris`, optimizer 200, `via_ir = false`), vendor `tokenized-strategy@48c53ab` sebagai submodule/vendor read-only, dan konsumsi ABI `VaultV3` hanya dari `packages/core/artifacts/*.json` — bukan dari docs atau npm.

</frozen-after-approval>

## Implementation Notes

- `foundry.toml`: `solc = "0.8.18"`, `evm_version = "paris"`, `optimizer = true`, `optimizer_runs = 200`, `via_ir = false`, `fs_permissions` minimal, `remappings` eksplisit. Jangan memakai `solc_version` yang di-resolve otomatis.
- Alasan `paris` dan bukan `shanghai`/`cancun`: menyamakan EVM target dengan pin Vyper core dan menghindari opcode baru yang belum tentu ada di rantai 4663. Catat alasan ini di header `foundry.toml` sebagai komentar.
- Vendoring: `referensi/tokenized-strategy` sudah checkout `48c53aba0395885b3f579d0a4b426de276a7b69e`. Jangan menambah `lib/` submodule yang bergantung ke branch `master` (contoh nyata: `vault-periphery` memakai `tokenized-strategy-periphery` dari master tanpa tag). Yang dipakai v1 hanya `BaseStrategy.sol` + `interfaces/IBaseStrategy.sol` + `interfaces/IStrategy.sol`.
- Import path strategi: `import {BaseStrategy, ERC20} from "tokenized-strategy/BaseStrategy.sol";` dengan remapping menunjuk ke vendor pin. Verifikasi `git -C <vendor> rev-parse HEAD` di CI lokal sebelum build.
- Interface yang ditulis sendiri: `IMorphoVaultV2` (subset yang dipakai: `asset`, `decimals`, `convertToAssets`, `convertToShares`, `balanceOf`, `maxDeposit`, `maxWithdraw`, `maxRedeem`, `deposit`, `withdraw`, `redeem`, `totalAssets`). Jangan menambah fungsi yang belum diverifikasi ada di venue.
- **Desimal:** USDG 6 desimal, share `steakUSDG` 18 desimal. Semua konstanta desimal eksplisit; tidak ada `1e18` untuk jumlah aset. `convertToAssets(1e18) = 1013995` pada block `118337511` dipakai sebagai fixture sanity.
- ABI `VaultV3`/`VaultFactory` dibaca dari artefak hasil `scripts/compile-vault.py`; jangan menulis ulang interface Vyper secara manual untuk fungsi yang sudah ada di ABI.
- `packages/config` memuat alamat `4663`: USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, `steakUSDG` `0xBeEff033F34C046626B8D0A041844C5d1A5409dd`, `TokenizedStrategy` impl `0x3110D1Eec90f0651C18e75AD37711A8777342504`, `CreateX` `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`. Satu sumber, dipakai juga oleh fork harness.
- `forge fmt` disetel di `foundry.toml`; `forge fmt --check` wajib hijau, bukan opsional.
- Tidak menambahkan file Vyper ke paket ini. `packages/core` tetap berisi artefak + script Python.

## Acceptance Evidence

1. `forge build` hijau dari `packages/contracts`, tanpa warning baru.
2. `forge fmt --check` hijau.
3. `git -C referensi/tokenized-strategy rev-parse HEAD` = `48c53aba0395885b3f579d0a4b426de276a7b69e`, dan ada script/CI check yang gagal bila berbeda.
4. `cast interface` tidak dipakai untuk `VaultV3`; sumber ABI tertulis di komentar file = `packages/core/artifacts/VaultV3.json`.
5. Daftar remapping + settings ditempel di `docs/ARCHITECTURE.md` §5 bila menyimpang dari rencana.

## Out of Scope

- Implementasi `MorphoVaultStrategy` (ticket 2).
- Fork harness (ticket 3).
- `Deploy.s.sol` (ticket 4).
- Upgrade solc ke 0.8.2x: sengaja ditolak, karena akan mengubah bytecode strategi tanpa alasan.
## Completion Evidence (2026-11-19)

Status: **done**. Ticket 2 (`MorphoVaultStrategy`) is unblocked.

### Build gate

```
$ cd packages/contracts && forge build --offline --force
Compiler run successful!

$ forge fmt --check
(no output, exit 0)

$ forge test --offline
Ran 2 test suites: 12 tests passed, 0 failed, 0 skipped
```

`auto_detect_solc = false` is set alongside `solc = "0.8.18"`, so a pragma range
cannot silently select a different compiler.

### Vendored dependencies (`scripts/check-vendor.py`)

| Dependency | Tag | Commit | Files |
|---|---|---|---|
| `openzeppelin-contracts` | `v4.9.5` | `bd325d56b4c62c9c5c1aff048c37c6bb18ac0290` | `contracts/` |
| `tokenized-strategy` | `v3.1.1` | `48c53aba0395885b3f579d0a4b426de276a7b69e` | `src/` (no `src/test`) |
| `forge-std` | `v1.9.6` | `3b20d60d14b343ee4f908cb8079495c07f5e8981` | `src/` |

```
$ python scripts/check-vendor.py
OK: 601 vendored files verified, impl 0x3110D1Eec90f0651C18e75AD37711A8777342504, API 3.1.1
```

The checker does more than hashing: it asserts
`BaseStrategy.tokenizedStrategyAddress == 0x3110D1Ee…` and
`TokenizedStrategy.API_VERSION == "3.1.1"`, and — when `referensi/` is present —
compares every vendored `.sol` byte-for-byte against the bytes at
`48c53ab` (`git show 48c53ab:src/...`). That last check initially failed for all
8 files: the vendored copies carried CRLF line endings from a Windows checkout.
They were normalised to LF, so the tree now equals the upstream blob exactly.
This is recorded because "hash matches my own manifest" is not evidence of
anything — the manifest would happily record the wrong bytes.

Vendored files are committed (not `.gitignore`d) so a clean checkout builds with
no network access. `lib/VENDOR.md` records why each version was chosen and what
was deliberately left out (`src/test/**`, `vault-periphery`, the router).

### Interfaces

`src/interfaces/IVaultV3.sol` and `IVaultFactory.sol` are generated by
`scripts/gen-interfaces.py` from `packages/core/artifacts/*.json` — the same
artifacts `scripts/verify-bytecode.py` verifies. `cast interface` was not used.
`python scripts/gen-interfaces.py --check` is clean.

Fixes made while generating, each of which would otherwise have produced a wrong
or non-compiling interface:

1. `override` and `name` are ABI parameter names but Solidity keywords →
   `safe_name()` maps them (`override`, `name_`).
2. `string`/`bytes`/dynamic-array return values need `memory`, parameters need
   `calldata`; event parameters take neither.
3. Tuple returns need `memory`: `strategies(address) returns (StrategyParams memory)`.
4. `forge fmt` must run project-wide, not path-scoped: a path-scoped run left a
   130-character declaration intact while the project-wide run reflowed it, so
   `--check` and `fmt --check` disagreed. The generator now formats with one
   project-wide `forge fmt` call.

### `IMorphoVaultV2`

Hand-written, with evidence graded per function:

- **Verified by on-chain read** at block `118337511`: `asset`, `decimals`,
  `totalAssets`, `totalSupply`, `convertToAssets`, `convertToShares`,
  `maxDeposit`, `curator`, `balanceOf`.
- **Assume-and-prove in ticket 2/3**: `maxWithdraw`, `maxRedeem`, `deposit`,
  `withdraw`, `redeem`. Their selectors are now proven to be present in the
  venue's runtime dispatcher (each appears immediately after a `PUSH4`), so they
  exist; their revert/zero behaviour under gates is still untested.
- **Deliberately absent**: `liquidity()` (reverts on `steakUSDG`) and `fee()`
  (not verified; not needed — the vault's fee engine is `Accountant`).

### `packages/config/4663.json`

Single source for addresses, decimals and the pinned block, with provenance
(`blockNumber`, `blockTimestamp`, `blockHash`) attached to the numbers. Two
mistakes were caught and corrected while writing it:

- An address for the Yearn `VaultFactory` was pasted from a truncated note
  (`0x444045c5…`). The fabricated tail was removed; the file now records only the
  finding that matters (codesize 0, so ADR-2 stands) and states explicitly that
  the full address must be re-read from source rather than copied from a truncated
  capture.
- A duplicate `chain` key at two levels made `vm.parseJsonUint` fail with
  "must return exactly one JSON value" — forge's JSON path lookup is
  document-wide, not scoped. The root key is now `_meta.network`.

### Tests (`test/unit`, no network)

`GeneratedInterfaces.t.sol` (5 tests) pins every selector the SDK and keeper will
hard-code, and documents that overloaded members cannot be referenced by bare
name in Solidity (ambiguous lookup → compile error), which is exactly why the
bindings must always pin full signatures.

`ChainConfig.t.sol` (7 tests) guards the JSON shape, the 6-vs-18 decimals trap
(`USDG 6`, `steakUSDG 18`), the `maxDeposit(0x0) == 0` finding, the
`liquidity()` absence, and the verified TokenizedStrategy implementation address
plus its 18 224-byte runtime size.

### Deviations from the plan

- The plan said "vendored yearn core". The core is Vyper and is not recompiled
  here; only its ABI is consumed, from the verified artifacts. `README.md` states
  this so nobody looks for `VaultV3.vy` in this package.
- `remappings` live only in `remappings.txt`, not duplicated in `foundry.toml`.
  Two copies drift; one does not.
- `forge fmt` gate is wired into `scripts/gen-interfaces.py` rather than a CI
  file, because this repo has no CI yet (open item, epic 7).

### Not covered here (unchanged)

Fork harness (ticket 3), deploy script (ticket 4), e2e withdraw (ticket 5), and
`MorphoVaultStrategy` itself (ticket 2).
