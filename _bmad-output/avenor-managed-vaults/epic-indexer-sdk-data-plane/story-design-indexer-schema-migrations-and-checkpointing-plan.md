---
title: 'Design indexer schema, migrations and checkpointing'
type: 'implement'
ticket: 1
created: '2026-11-22'
status: done
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['services/indexer/migrations/0001_init.sql', 'services/indexer/src/migrate.ts', 'services/indexer/test/migrations.test.ts', 'scripts/db-test.py']
---

# Skema indexer, migrasi, dan checkpoint

## Yang dibangun

`services/indexer/migrations/0001_init.sql` — 13 tabel: `schema_migrations`, `vaults`, `strategies`,
`raw_events`, `ingested_blocks`, `role_state`, `share_price_snapshots`, `positions`,
`share_transfers`, `reports`, `fees`, `role_events`, `venue_snapshots`, `ingestion_checkpoints`.

Aturan desain yang ditulis di header migrasi, bukan cuma di commit message:

1. Idempoten lewat `(chain_id, tx_hash, log_index)`; `block_hash` disimpan di samping `block_number`.
2. **Tidak ada FK** dari tabel event ke `vaults`/`strategies`. Indexer bisa melihat `Transfer` dari
   vault yang belum masuk katalog; FK akan membuat urutan ingestion menentukan dan event hilang.
3. `numeric(78,0)` untuk setiap `uint256`. USDG 6 desimal, share 18 desimal; tidak ada angka lewat
   `Number`.
4. Kolom `source` in `('indexed','onchain')` ada di tabel yang menyimpan angka turunan.
5. CHECK: `positions_non_negative`, `fees_kind_check`, `role_events_bit_check`.

`services/indexer/src/migrate.ts` — runner sendiri (bukan framework): urutan = urutan filename,
satu transaksi per migrasi, checksum sha256, dan migrasi yang diedit setelah apply **ditolak**
dengan pesan yang menyuruh menulis migrasi baru.

## Bukti

`services/indexer/test/migrations.test.ts` — 7 test:

- apply dari database kosong → tepat 14 tabel;
- apply kedua = no-op;
- duplikat `raw_events` dan snapshot ditolak `23505` (primary key, bukan overwrite diam-diam);
- posisi negatif ditolak `23514`, `fee_kind` tak dikenal ditolak `23514`;
- checkpoint resume per `(chain_id, stream)`;
- migrasi yang diedit ditolak.

`python scripts/db-test.py` (cluster Postgres ephemeral, port loopback acak) → 19 test hijau
(7 migrasi + 5 ingestion + 7 API pada run terakhir).

## Catatan tooling yang terukur

- `pg_ctl -w start` hang di Windows bila stdio diwarisi; harness memakai `Popen` detached + polling
  TCP, dan `pg_ctl -m immediate stop` dengan fallback `taskkill` dari `postmaster.pid`.
- `node --test test/` gagal `MODULE_NOT_FOUND`; file test harus dienumerasi eksplisit.
- Dua file test berbagi satu database → `--test-concurrency=1`, kalau tidak `schema "public" already exists`.
- Node 24 type stripping menolak parameter property (`constructor(readonly x: T)`).