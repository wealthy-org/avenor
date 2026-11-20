---
title: 'Author Deploy.s.sol with role wiring and safety asserts'
type: 'feature'
ticket: 4
created: '2026-11-19'
status: 'done'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'required'
review_source: 'default'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/ROLE_PERMISSION_MATRIX.md', 'docs/ARCHITECTURE.md', 'docs/FEE_CONFIG.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Kesalahan paling mahal pada produk ini bukan bug matematika, tapi salah urutan deploy: vault dibuka sebelum timelock menjadi `role_manager`, atau guardian menjadi proposer timelock. State itu tidak bisa diperbaiki tanpa redeploy.

**Approach:** Satu script `Deploy.s.sol` yang idempoten-per-run, mengikuti urutan `ARCHITECTURE.md` §5, dengan assert yang membuat eksekusi gagal bila kondisi keamanan tidak terpenuhi (role_manager EOA, guardian == proposer, deposit_limit > 0 sebelum approval).

</frozen-after-approval>

## Implementation Notes

- **Blueprint dulu.** `VaultFactory.deploy_new_vault` memakai `create_minimal_proxy_to(VAULT_ORIGINAL, ...)` (`referensi/yearn-vaults-v3/contracts/VaultFactory.vy:130`), jadi factory butuh alamat `VaultV3` yang sudah ada. Di 4663 belum ada deployment Yearn (`codesize 0`), jadi script harus men-deploy runtime bytecode hasil `scripts/compile-vault.py` apa adanya sebagai blueprint **sebelum** factory, dan meng-assert `keccak256(blueprint.code) == 0x6909c58e42814ae46cadd909f29f19163751b77ff4a2ccf62c5a87e933e02be6` (23.462 B). Bila assert gagal, stop: itu berarti bytecode yang akan dipakai bukan bytecode yang direview.
- Urutan: blueprint `VaultV3` → `VaultFactory(name, blueprint, Timelock)` → `deploy_new_vault` (deposit_limit 0) → `MorphoVaultStrategy` → `add_strategy(..., true)` → `update_max_debt_for_strategy` → `Accountant` + `set_accountant` → seed → grant roles → `set_minimum_total_idle` → (opsional) `set_deposit_limit`.
- Semua address dari env + `packages/config`; tidak ada alamat hard-coded di script.
- Assert wajib (revert bila salah):
  - `vault.role_manager() == address(timelock)` dan `timelock.getMinDelay() >= 48 hours`.
  - `guardian != timelockProposer` dan `guardian != address(0)`.
  - `vault.deposit_limit() == 0` sebelum langkah pembukaan.
  - `vault.accountant() == address(accountant)` dan `accountant.assess_health(...)` tidak revert.
  - `strategy.asset() == USDG` dan `strategy.tokenizedStrategyAddress() == 0x3110D1Eec90f0651C18e75AD37711A8777342504` (ADR-1 amendemen). `TokenizedStrategy` **tidak punya** `vault()`: strategy tidak terikat ke vault mana pun. Ikatan yang harus di-assert adalah kepemilikan `management`: `strategy.management() == address(vault)` (atau timelock, lihat catatan berikut) dan `strategy.keeper()` sesuai matriks.
  - **Wajib setelah wiring:** `management` hasil `BaseStrategy` constructor adalah deployer (`msg.sender`), bukan vault. Pindahkan dengan `setPendingManagement(newManager)` lalu `acceptManagement()` dari alamat baru; assert `strategy.management()` dan `strategy.pendingManagement()` pasca-transfer (`address(0)`). Tanpa langkah ini deployer EOA memegang `management` selamanya — satu-satunya jalan keluarnya `shutdownWithdraw`/`emergencyWithdraw` yang bisa membekukan dana.
  - **Wajib:** tetapkan `keeper` eksplisit via `setKeeper(keeperAddr)` (`TokenizedStrategy.sol:1850`, hanya `management`). Tidak ada `setPendingKeeper` di pin ini — jangan mengarangnya.
- Seed: deposit USDG dari treasury ke vault lalu kirim share ke `address(0xdead)` untuk dead shares; dokumentasikan jumlah dan alasan (`ACCOUNTING.md` §7). Jangan memakai `transfer` ke `address(0)`.
- Verifikasi peran pasca-grant: loop tabel `ROLE_PERMISSION_MATRIX.md` §2 dan assert setiap alamat memegang bit yang benar, plus assert alamat keeper **tidak** memegang bit berbahaya.
- Output: `deployments/4663.<mode>.json` berisi alamat, parameter, operator, dan `git rev`, plus `roleMatrix` snapshot.
- Mode: `--dry-run` (anvil/fork), `--stage`, `--prod`; `--prod` menolak jalan bila `--dry-run` sukses terakhir tidak ada di log.

## Acceptance Evidence

1. Dry-run anvil dengan `deployments/4663.dry-run.json` lengkap.
2. Test negatif: ubah `role_manager` menjadi EOA di fixture → script revert dengan pesan spesifik.
3. Test negatif: guardian == proposer → revert.
4. Slot peran diverifikasi on-chain (`vault.roles(addr)`) sesuai matriks.
5. Review kode dua orang tercatat di PR.

## Out of Scope

- Broadcast mainnet (epic 7).
- Verifikasi explorer.
- Keeper.
## Completion Evidence (2026-11-19)

**Deliverable**

| Path | Isi |
|---|---|
| `packages/contracts/script/Deploy.s.sol` | `Mode{DryRun,Stage,Prod}`, `configFromEnv()`, `deployAll()`, raw-`CREATE` blueprint + hash/size assert, factory prefix+immutable-tail assert, EIP-1167 clone check, bootstrap wiring, prod proposal builder, `assertSafety()` |
| `packages/contracts/script/DeployLocal.s.sol` | Rehearsal anvil: `MockERC20` + `MockVenue` + `anvil_setCode` `TokenizedStrategy` di alamat kanonik |
| `packages/contracts/src/interfaces/Roles.sol` | 14 bit verbatim + `ALL`, `governanceRoleSet()`, `keeperRoleSet()`, `dangerousBits()` |
| `packages/contracts/test/unit/DeployScript.t.sol` | 12 test (termasuk 5 negatif) |
| `packages/contracts/test/unit/Roles.t.sol` | 5 test — menepati janji natspec `Roles.sol` |
| `docs/DEPLOYMENT.md` | mode, urutan, env var, assert, output JSON, pending actions, batasan |
| `packages/contracts/deployments/31337.dry-run.json` | output dry-run anvil nyata (block 15) |
| `.env.example` | 13 env var deploy + catatan `DEPLOYER_ADDRESS` |

**Gate**

```
python scripts/verify-all.py
  [ok] vendored dependencies: 601 files verified, impl 0x3110D1Ee…, API 3.1.1
  [ok] generated interfaces: 2 up to date
  [ok] forge build
  [ok] forge fmt --check
  [ok] forge test: 51 tests passed, 0 failed, 1 skipped (52 total)
  [ok] bytecode evidence: 14/14 checks passed
  ALL CHECKS PASSED
```

**Acceptance Evidence (dari plan, 1–4)**

1. **Dry-run anvil menghasilkan `deployments/<chainId>.dry-run.json`** — ✅ `deployments/31337.dry-run.json`, exit 0, `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`. Semua field terisi; `placeholdersUsed: true` karena guardian/keeper/treasury adalah `makeAddr`.
2. **Test negatif `role_manager` EOA → revert** — ✅ `test_prodRejectsEoaTimelock` (`RoleManagerIsEoa`) dan `test_prodRejectsTimelockBelowDelayFloor` (`TimelockDelayTooShort(3600, 172800)`).
3. **Test negatif `guardian == proposer` → revert** — ✅ `test_guardianMayNotBeTheProposer` (`GuardianEqualsProposer`), dievaluasi di `_validateConfig` sebelum ada yang dideploy.
4. **Slot peran dibaca on-chain** — ✅ `vault.roles(addr)` pada anvil blok 15: timelock `3999`, guardian `8192`, keeper `96`, treasury `4096`, deployer `0`; `strategies(strategy).max_debt == 0`, `current_debt == 0`, `deposit_limit == 0`, `minimum_total_idle == 1e9`, `default_queue(0) == strategy`, `future_role_manager == timelock`.
5. **Review dua orang** — ⛔ belum; `review: 'required'`, `lenses_ran: []`.

**Temuan yang mengubah implementasi**

- **Script tidak boleh membaca `msg.sender` di dalam broadcast.** Foundry me-revert dengan `Usage of msg.sender inside a broadcast in script contract detected`; `address(this)` juga ditolak (`ephemeral`). Konsekuensi: aktor penanda tangan harus eksplisit (`DEPLOYER_ADDRESS`), dan seluruh deploy harus berjalan di konteks eksekusi kontrak script — mendelegasikan ke helper contract membuat `msg.sender` simulasi berbeda dari yang di-broadcast.
- **`vm.startBroadcast(0)` revert** (`private key cannot be 0`), jadi fallback tanpa kunci butuh jalur terpisah, bukan nilai 0.
- **Foundry `serialize*` hanya menyimpan satu array per objek.** Menyimpan `proposalTargets` dan `proposalCalldatas` dalam objek yang sama membuat yang kedua menghapus yang pertama — file sempat berisi `{"proposalCalldatas": []}` saja. Perbaikan: satu objek per array, digabung lewat `writeJson(json, path, key)`.
- **`anvil_setCode` diperlukan di rehearsal lokal.** Tanpa kode di `0x3110D1Ee…`, `add_strategy` gagal karena `asset()` pada strategi `delegatecall` ke akun kosong.
- **Handoff strategi tidak boleh menunggu timelock.** Sempat ditempatkan di dalam jalur wiring, yang berarti di mode `prod` ia tidak pernah jalan (prod tidak mengeksekusi wiring) dan strategi tetap dipegang deployer. `VaultV3` mereservasi ruang peran untuk strategi tapi tidak mengatur strategi; satu-satunya yang bisa mencabut `emergencyWithdraw` dari deployer adalah `setPendingManagement` oleh `management` strategi itu sendiri — yang bukan timelock. Jadi langkah ini dipindah ke `_handoffStrategy`, dijalankan di kedua mode, dan berada di luar proposal.
- **Durasi timelock 48 jam membuat dry-run tidak bisa "selesai"**: `transfer_role_manager` hanya menghasilkan `future_role_manager`, sehingga `accept_role_manager()` masih berupa pending action. Assert dibuat menghormati itu (`future_role_manager == timelock`) alih-alih berpura-pura handoff selesai.
- **Koreksi dokumen**: `ARCHITECTURE.md` §5 langkah 4 menulis `MorphoVaultStrategy(venue, vault)`; signature sebenarnya `(asset, venue, name)` dan tidak ada argumen vault karena `TokenizedStrategy` tidak menyimpan referensi ke vault. Diperbaiki di dokumen, bukan dicatat sebagai catatan kaki.

**Belum dikerjakan (di luar scope tiket ini)**

- `Accountant` (epik 3) — script meng-assert `vault.accountant() == address(0)` agar gap terlihat.
- Broadcast mainnet (epik 7), verifikasi explorer.
- `accept_role_manager()` / `acceptManagement()` — dua langkah, tercatat di `pendingActions`.
