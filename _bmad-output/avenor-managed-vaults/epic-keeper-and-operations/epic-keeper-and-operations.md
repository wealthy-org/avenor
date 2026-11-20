---
type: epic
title: "Slice S5 — Keeper, Monitoring, Runbook & Incident Drills"
parent: "initiative-avenor-managed-vaults"
covers: ["S5"]
status: draft
---

# Epic 6: Keeper & Operations

## Intent
Menjaga vault tetap akurat dan likuid tanpa memberi keeper kekuasaan yang bisa merugikan user. Operasi harus bisa dijalankan orang lain dari runbook, bukan dari kepala satu orang.

## Outcome
Keeper berjalan dengan simulasi wajib, alerting aktif, dan empat drill insiden (pause, force revoke, venue liquidity drop, shutdown) terbukti bisa dieksekusi sesuai waktu target.

## Done When
1. Keeper job: report 24 jam (atau ambang gain/loss), alokasi 6 jam, health check 5 menit, likuiditas 15 menit — semua dengan dry-run `eth_call` sebelum kirim.
2. Kegagalan simulasi = alert, bukan retry buta; setiap tx punya log alasan, calldata, dan hasil.
3. Alert masuk ke kanal on-call (minimal satu kanal nyata) dengan runbook link; uji alert benar-benar terkirim.
4. Empat drill lulus di staging/fork: `setPaused(true)` + unpause, `force_revoke_strategy`, recall saat kas idle venue turun (bukan `maxWithdraw` — getter itu terbukti balas `0` walau kas ada), `shutdown_vault`.
5. Runbook `docs/RUNBOOK.md` berisi langkah, peran yang dibutuhkan, waktu target, dan copy komunikasi user.
6. Keeper stabil 7 hari berturut-turut tanpa tx gagal berulang atau alarm palsu > 2/hari.

## Boundaries
- Keeper tidak memegang `REVOKE`/`FORCE_REVOKE`/`EMERGENCY`.
- Tidak ada auto-rebalance yang mengubah venue tanpa persetujuan governance.
- Tidak ada kunci privat di repo/CI log.

## Risiko
- Keeper hot key bocor → kerugian dibatasi ke gas + fee report; pastikan tidak ada izin lain.
- Report terlalu sering memicu fee berlebih → interval + ambang, dan monitoring `total_fees_shares`.
- Alarm fatigue → setiap alarm harus punya aksi; alarm tanpa aksi dihapus.