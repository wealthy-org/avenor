---
type: epic
title: "Slice S3 — Indexer, SDK & Data Plane"
parent: "initiative-avenor-managed-vaults"
covers: ["S3"]
---

# Epic 4: Indexer, SDK & Data Plane

## Intent
Menyediakan satu sumber angka untuk app, keeper, dan dokumentasi: event on-chain yang idempoten, snapshot `pps` ber-block, dan rekonsiliasi terhadap state kontrak. Tanpa ini, UI akan mengarang angka.

## Outcome
Indexer menelan event `4663` dari RPC, menyimpan posisi & snapshot, lulus rekonsiliasi harian terhadap `totalAssets/totalSupply/totalIdle/totalDebt`, dan SDK `viem` menjadi satu-satunya jalur baca/tulis untuk app.

## Done When
1. Skema Postgres + migrasi ada; unique `(chainId, txHash, logIndex)`; `blockHash` disimpan untuk reorg handling.
2. Ingestion menangani reorg (rollback terdokumentasi), backfill dari block deploy, dan `ingestion_checkpoints`.
3. Rekonsiliasi otomatis: selisih state event vs `eth_call` = alert, bukan auto-koreksi.
4. SDK menyediakan: kontrak typings (dari artefak), `previewDeposit/previewWithdraw/maxWithdraw/maxRedeem`, formatter decimals-6, dan simulasi transaksi.
5. API app (REST/GraphQL) mengembalikan angka dengan `blockNumber`, `blockTimestamp`, dan `source: "onchain" | "indexed"`.
6. Test: fixture event historis → snapshot cocok dengan `pricePerShare()` pada block tersebut.

## Boundaries
- Tidak ada penulisan on-chain dari indexer.
- Tidak memakai Blockscout API (diblokir) sebagai sumber utama.
- Tidak menyimpan data pribadi user di luar alamat publik.

## Risiko
- RPC publik rate-limit saat backfill → butuh batching + retry dengan backoff, dan checkpoint agar bisa dilanjutkan.
- Reorg pada chain baru → jangan tampilkan angka "final" sebelum kedalaman konfirmasi tercapai; tandai `pending`.
- Perbedaan ABI (camelCase setter) → ABI diambil dari artefak, bukan dari docs.