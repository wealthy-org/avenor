---
title: "Seven-day soak with keeper metrics"
ticket: 5
status: blocked
blocked_at: "2026-11-22"
blocked_reason: "7 hari wall-clock di staging; belum ada deployment"
---

# Seven-day soak with keeper metrics

## Kenapa `blocked`

Verifikasi menuntut laporan soak 7 hari dengan angka nyata (uptime, tx sukses/gagal, fee terbentuk,
alarm palsu per hari) dan kriteria lulus 0 tx gagal berulang, alarm palsu ≤ 2/hari, rekonsiliasi
bersih tiap hari. Itu waktu wall-clock di staging, dan staging belum ada.

Yang sudah tersedia untuk soak ini: keeper dengan log JSON per baris (`docs/KEEPER.md` §5) dan loop
monitor yang tidak berhenti saat webhook gagal. Yang belum: ekspor metrik. Menjalankan 7 hari pada
node palsu bukan soak — itu test yang diulang.
