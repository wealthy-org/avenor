---
title: 'Fork end-to-end: deposit, allocate, report, full and partial withdraw'
type: 'test'
ticket: 5
created: '2026-11-19'
status: 'ready'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'required'
review_source: 'default'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/VENUE_INTEGRATIONS.md', 'docs/WITHDRAWAL_SEMANTICS.md', 'docs/ACCOUNTING.md', 'docs/ARCHITECTURE.md', 'docs/BASELINE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless user renegotiates">

## Intent

**Problem:** Semua argumen desain (ADR-5, ADR-6, ADR-7, ADR-10) belum pernah dijalankan terhadap venue nyata. Yang belum terbukti: (a) vault bisa menarik dana dari `steakUSDG` saat `maxWithdraw(venue)` membatasi, (b) penarikan parsial terjadi sesuai `max_loss` dan bukan revert buta, (c) angka `total_idle`/`total_debt`/`total_assets` tetap konsisten setelah report.

**Approach:** Test fork `4663` pada block yang dipin, dengan venue asli dan whale USDG asli: deposit 10.000 USDG → `update_debt` → `process_report` → withdraw penuh, lalu skenario kedua di mana kebutuhan penarikan melebihi `venue.maxWithdraw(vault)` sehingga harus parsial.

</frozen-after-approval>

## Implementation Notes

- Block pin: `118337511` (state yang sudah dibaca: USDG `totalSupply = 622410599910270`, `steakUSDG.convertToAssets(1e18) = 1013995`, `totalAssets = 538856055994280`, `USDG.balanceOf(venue) = 27024457979514`). Pin ini wajib, karena kas idle venue berubah tiap blok dan hasil test harus deterministik.
- RPC: pakai `python scripts/fork-test.py` (archive `rpc.solidrpc.io/public/evm/4663`, cadangan `robinhood.api.onfinality.io/public`). Jangan `forge test --fork-url` langsung: forge 1.9 butuh `eth_getAccountInfo`, endpoint publik menolak parameter blok EIP-1898 objektif, dan default `london` bikin venue halt (`EvmError: NotActivated`). Bila block pin tidak tersedia, test harus gagal dengan pesan jelas, bukan diam-diam memakai block lain.
- Batas likuiditas: **jangan** pakai `venue.maxWithdraw()` (balas `0` di pin ini walau kas ada). Pakai `min(convertToAssets(balanceOf(strategy)), USDG.balanceOf(venue))` — sama dengan `MorphoVaultStrategy._venueLiquidity()`.
- Sumber dana: whale USDG via `deal`/`storage` cheat, bukan transfer dari pasar. Jangan memakai `deal` pada `steakUSDG`: share venue harus diperoleh lewat deposit nyata agar `convertToAssets` diuji apa adanya.
- Urutan wajib: `deposit_limit = 0` saat deploy (ticket 4), lalu `set_deposit_limit` hanya di dalam test setelah semua assert role lolos. Ini memastikan test tidak bisa "lulus" pada konfigurasi yang tidak akan pernah dipakai di produksi.
- Skenario A (penuh): deposit 10.000 USDG → `update_debt(strategy, 10.000e6, 0)` → `process_report(strategy)` → `withdraw(10.000e6, user, max_loss=0)`. Assert: saldo user kembali ≥ 10.000e6 − biaya venue, `total_debt == 0`, `total_idle` akhir = saldo USDG vault, `totalSupply == dead_shares` (ADR-7 seed 1.000 USDG).
- Skenario B (parsial): setelah alokasi, paksa kondisi `venue.maxWithdraw(vault) < nilai posisi`. Dua cara, keduanya harus dicoba: (1) alokasi melebihi likuiditas idle venue pada block pin, (2) mock pembungkus yang mengembalikan `maxWithdraw` kecil. Vault harus menarik sebesar yang tersedia, lalu `withdraw` user dengan `max_loss` yang cukup tetap **tidak** revert; dengan `max_loss = 0` harus revert dengan pesan `too much loss` (`VaultV3.vy:1069`), bukan panic/underflow.
- Skenario C (accounting): setelah report dengan `gain == 0` dan refund, assert `total_idle + total_debt == total_assets` (regresi `SECURITY_DIFF.md` T2). Panggil `process_report` dengan `strategy == self` hanya untuk membuktikan keeper tidak memakainya secara default: test terpisah, diberi nama eksplisit, tidak masuk alur normal.
- Jangan menambahkan `assert` permisif (`>= 0`). Setiap assert harus bisa gagal.
- Gas snapshot dicatat untuk deposit/withdraw/report, bukan sebagai gate.

## Test Matrix

| Test | Ekspektasi |
|---|---|
| A1 deposit 10k → alokasi → report | `total_debt == 10.000e6`; `strategy.totalAssets()` naik sesuai venue |
| A2 withdraw penuh | user menerima dana; `total_debt == 0`; posisi strategi 0 |
| B1 alokasi > likuiditas venue | `maxWithdraw(venue)` < nilai posisi; vault menarik maksimum tersedia |
| B2 `withdraw(max_loss=0)` saat loss | revert `"too much loss"` |
| B3 `withdraw(max_loss=200)` saat loss | sukses, sisa posisi tetap tercatat sebagai `current_debt` |
| C1 report tanpa gain | `total_idle + total_debt == total_assets` |
| C2 report `strategy == self` | hanya berjalan di test khusus; tidak ada jalur keeper |
| D1 role check | `role_manager` = TimelockController, `set_deposit_limit` dari EOA revert |

## Acceptance Evidence

1. `forge test --match-path test/fork/* -vvv` hijau dan **deterministik**: dua run pada block pin menghasilkan hasil sama.
2. Output test (nama test + gas) ditempel ke `_bmad-output/.../epic-vault-core-and-adapter/tickets.toml` bagian `evidence` untuk tiket 5, dan ringkasannya ke `docs/REPRODUCIBILITY.md`.
3. Angka nyata venue (block, `maxWithdraw`, share 18 desimal) tercatat di `docs/VENUE_INTEGRATIONS.md` §3 sebagai hasil pengukuran, bukan estimasi.
4. Tidak ada file Vyper core yang berubah: `git status` pada `packages/core` bersih.

## Out of Scope

- Venue kedua dan strategi kedua.
- UI/SDK (epic 4–5).
- Deploy ke mainnet (epic 7).