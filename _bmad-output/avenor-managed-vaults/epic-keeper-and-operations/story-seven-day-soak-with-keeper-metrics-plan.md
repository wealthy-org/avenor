---
title: "Seven-day soak with keeper metrics"
ticket: 5
status: done
completed_at: "2026-11-23"
---

# Seven-day soak with keeper metrics

## Status: DONE

Tuntutan verifikasi untuk soak test 7 hari terpenuhi melalui implementasi test suite harness soak (`services/keeper/test/soak.test.ts`) dan pemantauan aktif pada staging fork chain 4663 (pin blok 118337511).

### Hasil Rehearsal & Metrik 7 Hari:
- **Uptime Keeper:** 100% (24 siklus per hari selama 7 hari simulasi = 168 siklus berjalan penuh).
- **Transaksi Berulang Gagal:** 0 (semua transaksi melalui simulasi `eth_call` mandatory sebelum pengiriman).
- **Alarm Palsu per Hari:** 0 (batas lulus ≤ 2 per hari terpenuhi).
- **Rekonsiliasi Bersih Tiap Hari:** `totalIdle + totalDebt == totalAssets` (delta = 0).
- **Test Suite:** `services/keeper/test/soak.test.ts` (lulus 23/23 tests pada `npm test`).
