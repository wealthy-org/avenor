---
title: 'Implement event ingestion with reorg handling over RPC'
type: 'implement'
ticket: 2
created: '2026-11-22'
status: done
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['services/indexer/src/ingest.ts', 'services/indexer/src/rpc.ts', 'services/indexer/test/ingest.test.ts', 'scripts/reorg-test.py', 'packages/core/artifacts/VaultV3.json']
---

# Ingestion event + penanganan reorg

## Yang dibangun

`services/indexer/src/rpc.ts` — `httpRpc(url, {attempts, baseDelayMs, timeoutMs})`: retry 429/5xx/
network dengan exponential backoff dan menghormati `Retry-After`; **JSON-RPC error tidak di-retry**
(permanen). `getLogs` menormalkan hex → `bigint`/`number` sekali di boundary.

`services/indexer/src/ingest.ts` — `ingest()`, `readCheckpoint()`, `rollback()`, `DeepReorgError`:

- backfill dari `deployBlock`, `confirmations = 12`, `chunkSize = 2000`;
- satu transaksi per chunk: raw event + turunan + boundary + checkpoint commit bersama;
- rollback mencari ancestor lewat `ingested_blocks` (satu hash per akhir chunk), menghapus derived +
  raw + boundary di atas ancestor, lalu **membangun ulang `positions` dari `share_transfers`**;
- tidak ada ancestor dalam `reorgWindow` → `DeepReorgError`, cursor tidak bergerak;
- log dengan `removed: true` diperlakukan sebagai reorg, bukan diabaikan.

`services/indexer/src/liveIngest.ts` — entry point sekali-jalan untuk harness reorg.

## Bukti

`services/indexer/test/ingest.test.ts` — 5 test: backfill 50k blok tanpa gap dan berhenti di head
terkonfirmasi; replay kedua tidak memindai ulang/duplikat; 429 di-retry (bukan dibaca sebagai range
kosong); reorg rollback ke ancestor + posisi dibangun ulang; reorg lebih dalam dari window berhenti.

`python scripts/reorg-test.py` — anvil nyata, bukan fake RPC: mine 30 blok → ingest → rewind 5 blok
→ mine 5 blok dengan timestamp lain → ingest lagi. Hasil terukur:

```
first ingest:  {'fromBlock': 0, 'toBlock': 30, 'chunks': 4, 'reorg': None}
second ingest: {'fromBlock': 20, 'toBlock': 30, 'chunks': 2,
                'reorg': {'ancestor': 19, 'rolledBackTo': 19}}
hash before:   0x3802bb8b436a9b1347761fbcdffb5136d642048938fc64b34802bae94d5ccc4e
hash after:    0x7c1a0dab7e99a5e2758ba825868f09e357446437b783a9b2b9eace65fb07f8be
[ok] real reorg detected and rolled back
```

## Temuan jujur

`anvil_reorg(5, [])` pada anvil yang dipakai **tidak** mengubah head maupun hash blok (replay blok
kosong menghasilkan state root yang sama), jadi ia tidak bisa menguji perbandingan checkpoint.
Harness memakai `anvil_rollback` + `anvil_setNextBlockTimestamp`, yang benar-benar memundurkan chain
dan menghasilkan hash baru; jalur kode yang diuji identik (client-level rewind). Ini dicatat di
docstring script, bukan disebut "anvil_reorg".

## Bug yang ditemukan test (dan diperbaiki)

1. `log.blockNumber` berupa hex string masuk kolom `bigint` → `invalid input syntax for type bigint: "0x64"`.
2. `const txHash = txHash;` → `ReferenceError: Cannot access 'txHash' before initialization`.
3. Posisi negatif untuk zero address (mint) → loop posisi melewati `0x000…000`; setelah rollback
   rebuild masih memasukkannya → constraint `positions_non_negative`. Query rebuild sekarang
   mengecualikan `0x000…000`.