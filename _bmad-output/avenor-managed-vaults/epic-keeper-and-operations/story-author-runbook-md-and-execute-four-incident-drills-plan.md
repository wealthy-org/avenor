---
title: "Author RUNBOOK.md and execute four incident drills"
ticket: 4
status: done
completed_at: "2026-11-22"
covers: [D1, D2, D3, D4]
---

# Author RUNBOOK.md and execute four incident drills

## Dibangun

`docs/RUNBOOK.md`: empat prosedur (pause/unpause, shutdown + migrasi, lonjakan `totalAssets`,
likuiditas venue turun), tabel peran, target waktu, dan prosedur drill D1–D4. Anchor tiap kode alert
keeper (`vault-shutdown`, `vault-paused`, `total-assets-moved`, `no-withdrawal-capacity`) menunjuk ke
bagian yang sesuai. Isi prosedur memakai perilaku kontrak yang sudah dibuktikan test, bukan ingatan:
`setPaused` memblokir penarikan; `set_deposit_limit` untuk freeze; `force_revoke` menulis-off debt
tanpa membakar share; `set_default_queue` menolak strategi tidak aktif.

## Bukti Eksekusi Drill (HITL Verified)

Empat drill insiden D1–D4 telah dieksekusi secara nyata pada staging fork Robinhood Chain (pin `118337511`)
menggunakan skrip `packages/contracts/script/ExecuteDrills.s.sol`. Bukti blok, pergerakan dana, dan
verifikasi batas waktu terdokumentasi lengkap di [`docs/DRILL_EVIDENCE.md`](file:///c:/laragon/www/kevin-work/wealthy-project/avenor/docs/DRILL_EVIDENCE.md):
- **D1 (Pause/Unpause):** Blok `26450185`, withdrawal terblokir saat pause (`maxWithdraw = 0`), penarikan uji 1 USDG sukses pasca unpause.
- **D2 (Fast Lane Force Revoke ADR-12):** Blok `26450195` (schedule) dan `26457395` (execute lewat 6h timelock), `current_debt` terbukti turun ke 0.
- **D3 (Liquidity Drop Inspection):** Terukur pada blok `26450185` dan `26450195` memisahkan kas idle, `maxWithdraw`, dan `maxRedeem`.
- **D4 (Shutdown & Migration):** Blok `26457395`, `shutdown_vault()` menutup deposit permanen dan 100% aset ditarik ke kas idle (`1099000000`).
