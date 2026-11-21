---
title: "Author RUNBOOK.md and execute four incident drills"
ticket: 4
status: blocked
blocked_at: "2026-11-22"
blocked_reason: "empat drill butuh staging/fork + sign-off manusia; docs/RUNBOOK.md sudah ditulis, tidak ada drill yang dieksekusi"
---

# Author RUNBOOK.md and execute four incident drills

## Dibangun

`docs/RUNBOOK.md`: empat prosedur (pause/unpause, shutdown + migrasi, lonjakan `totalAssets`,
likuiditas venue turun), tabel peran, target waktu, dan prosedur drill D1–D4. Anchor tiap kode alert
keeper (`vault-shutdown`, `vault-paused`, `total-assets-moved`, `no-withdrawal-capacity`) menunjuk ke
bagian yang sesuai. Isi prosedur memakai perilaku kontrak yang sudah dibuktikan test, bukan ingatan:
`setPaused` memblokir penarikan; `set_deposit_limit` untuk freeze; `force_revoke` menulis-off debt
tanpa membakar share; `set_default_queue` menolak strategi tidak aktif.

## Kenapa `blocked`

Tiket ini `hitl: true`. Verifikasinya menuntut **catatan eksekusi** empat drill: blok, tx hash, dan
waktu aktual vs target, di staging/fork. Tidak ada satu pun drill yang dijalankan, karena vault
Avenor belum dideploy dan tidak ada staging. Runbook yang ditulis tanpa drill bukan bukti bahwa
prosedurnya bisa dijalankan di bawah tekanan.

Menandai tiket ini `done` akan menjadi klaim palsu. Yang dibutuhkan manusia: fork pin `118337511`,
vault hasil `Deploy.s.sol`, akun uji, keeper mode sekali-jalan, dan penandatanganan hasil.
