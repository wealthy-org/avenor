---
title: 'Daily reconciliation job against on-chain state'
type: 'implement'
ticket: 3
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
context: ['services/indexer/src/reconcile.ts', 'services/indexer/test/reconcile.test.ts', 'docs/ACCOUNTING.md']
---

# Rekonsiliasi harian terhadap state on-chain

## Rumus yang dipakai (bukan "bandingkan saja")

Sisi indexed dihitung dari event, sisi on-chain dari `eth_call` pada block eksplisit:

- `totalAssets` yang diharapkan = snapshot on-chain terakhir + Σ(`gain` − `loss` + `refund`) di
  antara kedua block. Tidak ada event lain yang mengubah `totalAssets`: transfer/deposit/withdraw
  hanya memindahkan idle versus supply, dan fee dibakar sebagai share sehingga tidak mengubah aset
  (`VaultV3.vy:_process_report`).
- `totalSupply` yang diharapkan = mint − burn, yaitu transfer dari/ke alamat nol. Dibandingkan
  **eksak**; toleransi tidak pernah berlaku untuk supply.
- Tanpa riwayat mint sama sekali sementara on-chain `totalSupply > 0` → status
  `insufficient-history`, bukan "lolos". Angka yang tidak bisa dibuktikan tidak disimpan sebagai
  kebenaran.

`toleranceBps` **wajib** di tipe `ReconcileConfig` (tidak ada default). `driftBps` membulatkan ke
atas supaya drift 1 wei pada 1000 unit tidak hilang menjadi 0.

## Bukti

`services/indexer/src/reconcile.ts` + `services/indexer/test/reconcile.test.ts` (7 test):

- exact match → `ok`, snapshot `source='onchain'` tersimpan; run ulang di block sama = refresh, bukan baris baru;
- drift 1 wei: 0 bps → alert (`drift 10 bps exceeds tolerance 0 bps`); 10 bps → `ok`;
- gain + loss + refund bergerak ke arah yang benar (1.000 + 100 − 40 + 25 = 1.085);
- supply mismatch tetap alert walau toleransi aset 10.000 bps;
- tanpa riwayat mint → `insufficient-history` dan tidak menulis snapshot;
- `recordSnapshot` idempoten.

## Yang belum

Job harian belum dijadwalkan oleh proses apa pun (cron/keeper); fungsinya `reconcileNow(pool, rpc,
cfg, block)` sudah ada dan diuji, penjadwalan masuk epik keeper (6). Alert saat ini berupa array
`alerts` di return value, bukan integrasi Slack/PagerDuty — tidak diklaim ada.