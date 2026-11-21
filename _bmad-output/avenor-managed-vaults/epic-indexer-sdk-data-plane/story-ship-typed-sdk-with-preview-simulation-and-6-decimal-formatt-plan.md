---
title: 'Ship typed SDK with preview, simulation and 6-decimal formatting'
type: 'implement'
ticket: 4
created: '2026-11-22'
status: done
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['packages/sdk/src/index.ts', 'packages/sdk/src/writes.ts', 'scripts/gen-sdk-abi.py', 'packages/core/artifacts/VaultV3.json', 'docs/WITHDRAWAL_SEMANTICS.md']
---

# SDK bertipe: preview, simulasi, formatter 6 desimal

## Yang dibangun

`packages/sdk` (viem 2.58.4, Node ≥ 22.6, tanpa build step):

- `src/abi/vault.ts` — **dibangkitkan** oleh `scripts/gen-sdk-abi.py` dari
  `packages/core/artifacts/VaultV3.json`, yaitu artefak yang diperiksa `scripts/verify-bytecode.py`.
  Gate `--check` menolak ABI yang basi. Bukan ABI salinan dari docs/explorer.
- `src/amounts.ts` — `parseUsdg`/`formatUsdg` (6 desimal), `formatShares` (18), `bpsOf`. Tidak ada
  `Number` di jalur uang; parser menolak `1.0000001`, `-1`, `1,5`, `1e6`, string kosong.
- `src/vault.ts` — `readVaultState` (semua angka dipin ke satu `blockNumber` + `blockTimestamp`,
  `source: 'onchain'`), `readPosition` (nilai, bukan likuiditas), `readLiquidity`.
- `src/previews.ts` — `previewDeposit`/`previewWithdraw`/`previewRedeem`, masing-masing mengembalikan
  sisi share dan aset plus cap milik pemanggil.
- `src/writes.ts` — `prepareDeposit`/`prepareWithdraw`/`prepareRedeem`/`prepareApprove`. Setiap
  `prepare*` menjalankan `simulateContract` lebih dulu; `maxLoss` **wajib** untuk withdraw/redeem,
  `10_000` ditolak (menerima rugi total bukan bound yang masuk akal), `0` diterima sebagai bound nyata.

## Bukti

`packages/sdk/test/sdk.test.ts` — 12 test, node scripted tapi melewati encoder/decoder viem yang
sama dengan produksi: round-trip 6 desimal (`"538856.055994"` ↔ `538856055994n`), penolakan input
ambigu, share 18 desimal, state terpin ke block `118337511` + timestamp `1795103654`, posisi 1 share
= `1_002_699` unit aset, `maxWithdraw = 0` sementara `totalIdle = 27_024_457_979` (dua angka
terpisah), `withdraw(1000000, alice, alice, 0)` benar-benar membawa `max_loss = 0`, revert simulasi
muncul sebagai error, jumlah nol ditolak sebelum menyentuh node.

`node --test packages/sdk/test/sdk.test.ts` → 12 lulus.

## Catatan

- `maxLoss = 10_000` ditolak di SDK, walaupun kontrak mengizinkannya. Kontrak menerima "serahkan
  semua"; produk tidak boleh punya jalan satu argumen ke sana.
- SDK tidak menghitung APY/TVL sendiri. `readVaultState` mengembalikan angka mentah + provenance;
  turunan bisnis ada di app dengan label sumber.