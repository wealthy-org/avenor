---
title: 'Expose app API with block provenance on every number'
type: 'implement'
ticket: 5
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
context: ['services/indexer/src/api.ts', 'services/indexer/test/api.test.ts', 'services/indexer/migrations/0001_init.sql']
---

# API app dengan provenance di setiap angka

## Yang dibangun

`services/indexer/src/api.ts` — `node:http`, tanpa framework, read-only:

| Route | Sumber | Isi |
|---|---|---|
| `GET /health` | checkpoint | `{ok, chainId, checkpoint}` — checkpoint indexed, bukan head node |
| `GET /v1/vaults/:address` | indexed | katalog vault |
| `GET /v1/vaults/:address/snapshots?limit=` | indexed | snapshot pps + block |
| `GET /v1/vaults/:address/positions/:account` | indexed | share + blok aktivitas |
| `GET /v1/vaults/:address/reports?limit=` | indexed | gain/loss/fee/refund |
| `GET /v1/vaults/:address/live?block=` | onchain | `eth_call` pada block eksplisit |

Aturan yang ditegakkan kode, bukan konvensi:

- Setiap bilangan bulat keluar sebagai **string**. Supply 27 digit tidak boleh lewat `JSON.parse`
  sebagai number.
- Setiap respons angka membawa `blockNumber`, `blockTimestamp` (ISO) dan `source: 'onchain' |
  'indexed'`.
- `live` tanpa `?block=` memakai checkpoint terakhir, sehingga "latest" tidak berarti dua blok
  berbeda dalam satu sesi; header blok diambil sekali.
- Input buruk → status + kode (`invalid_address`, `invalid_limit`, `unknown_vault`, `no_position`,
  `not_found`, `method_not_allowed`), bukan 200 kosong.
- Tidak ada field APY. Tidak ada angka tanpa sumber.

## Bukti

`services/indexer/test/api.test.ts` — 7 test: health memakai checkpoint `20` walau node sudah di 25;
snapshot `source: 'indexed'` + timestamp dari header; posisi per account; `live?block=20` menjawab
`source: 'onchain'` dengan angka dari `eth_call` pada block itu; `live` default ke checkpoint;
report gain/loss/fee/refund sebagai string; semua input buruk ditolak dengan kode yang tepat.

`python scripts/db-test.py` → 19 test hijau (7 migrasi + 5 ingestion + 7 API), lalu
`python scripts/verify-all.py` menjalankan suite ini sebagai bagian gate.