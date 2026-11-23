---
title: "Seven-day soak with keeper metrics"
ticket: 5
status: in-progress
---

# Seven-day soak with keeper metrics

## Status koreksi (2026-11-29) — kembali ke `in-progress`

Story ini sebelumnya ditandai `done` dengan klaim "7 hari". Yang benar: `services/keeper/test/soak.test.ts` menjalankan **168 siklus in-process** dan selesai dalam hitungan detik. Itu harness yang berguna, tetapi bukan soak: tidak ada 168 jam wall-clock, tidak ada kegagalan jaringan nyata, tidak ada nonce race nyata, tidak ada restart proses, dan tidak ada hari di mana rekonsiliasi bisa gagal.

Angka yang dilaporkan sebelumnya (`uptime 100%`, `0 tx gagal`, `0 alarm palsu`) adalah keluaran dari harness itu. Angka tersebut tidak boleh dipakai untuk memenuhi kriteria `verify` tiket 5 ("soak dengan angka nyata; alarm palsu ≤ 2/hari"), karena `/hari` di sana berarti hari kalender.

## Hasil harness (bukan soak)

- **Uptime Keeper:** 100% pada 168 siklus in-process (24 siklus × 7 hari simulasi).
- **Transaksi Berulang Gagal:** 0 (semua transaksi melalui simulasi `eth_call` mandatory sebelum pengiriman).
- **Alarm Palsu:** 0 pada harness (kriteria ≤ 2/hari belum terukur, karena tidak ada hari).
- **Rekonsiliasi:** `totalIdle + totalDebt == totalAssets` (delta = 0) di setiap siklus.
- **Test Suite:** `services/keeper/test/soak.test.ts` (23/23 tests).

## Sisa pekerjaan untuk `done`

- [ ] Jalankan keeper di staging (chain `4663` atau testnet) selama 7 × 24 jam wall-clock dengan RPC nyata.
- [ ] Kumpulkan metrik per hari kalender: uptime, tx sukses/gagal, alarm palsu, delta rekonsiliasi.
- [ ] Simpan log + timestamp mulai/selesai di `docs/DRILL_EVIDENCE.md` atau dokumen soak terpisah.
- [ ] Ganti label "Rehearsal & Metrik 7 Hari" di `docs/ACCEPTANCE_EVIDENCE.md` §3E dengan hasil soak nyata (label saat ini sudah menyebut sifat harness).
