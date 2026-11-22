# RUNBOOK

Prosedur insiden vault Avenor. Setiap kode alert dari keeper (`docs/KEEPER.md` §7) menaut ke
`<RUNBOOK_BASE_URL>#<kode>` di halaman ini, jadi judul anchor harus tetap sama.

Aturan yang berlaku untuk semua prosedur:

- Uang dalam `uint256` 6 desimal. Jangan pernah mengetik nominal dari ingatan; ambil dari
  `eth_call` dan catat bloknya.
- `setPaused(true)` **memblokir penarikan**. Itu bukan tombol "aman"; hanya untuk insiden aktif
  (venue dieksploitasi, akuntansi tidak bisa dipercaya).
- Freeze deposit memakai `set_deposit_limit` atau `DepositCapHook`, bukan pause.
- Setiap tindakan darurat dicatat: blok, tx hash, timestamp, siapa, dan alasan. Tanpa catatan itu,
  tindakan tidak dianggap terjadi.
- Tidak ada penyelesaian yang diumumkan tanpa `python scripts/verify-all.py` hijau.

Peran yang dipakai di bawah (lihat `docs/ROLE_PERMISSION_MATRIX.md`):

| Peran | Pemegang | Bisa apa |
| --- | --- | --- |
| `GOVERNANCE` | Timelock 48 jam | semua setter, role, `shutdown_vault` |
| guardian Safe → timelock 6 jam | Guardian | **hanya** `FORCE_REVOKE_MANAGER` (ADR-12) |
| `EMERGENCY_MANAGER` | Safe guardian | `setPaused(true/false)` |
| `REPORTING_MANAGER` | keeper | `process_report` |
| `DEBT_MANAGER` | keeper | `update_debt`, `set_auto_allocate` |

---

## A. `vault-paused` — penarikan berhenti

**Gejala.** Dengan `isPaused = true`, `maxWithdraw` vault menjadi 0 dan `redeem` revert. Nilai posisi
tetap ada; yang hilang adalah kemampuan keluar. UI wajib menampilkan ini sebagai "penarikan
dihentikan", bukan "saldo 0".

**Langkah.**

1. Konfirmasi: `cast call <vault> "isPaused()(bool)" --block <n>`; catat blok.
2. Tentukan siapa yang mem-pause dan mengapa: `UpdatePaused` event (topic
   `0x7fa27d7f…`, lihat `services/indexer/src/decode.ts`).
3. Perbaiki penyebabnya **sebelum** unpause. Unpause pada venue yang masih rusak hanya memindahkan
   kerugian ke penarik pertama.
4. Fix: `setPaused(false)` dari `EMERGENCY_MANAGER`.
5. Verifikasi: `maxWithdraw` > 0 atau `totalIdle` > 0, lalu lakukan `withdraw` kecil (mis. 1 USDG)
   dari akun uji dan catat tx hash-nya.

**Target.** Diagnosis ≤ 15 menit; unpause ≤ 60 menit dari perbaikan penyebab.

## B. `vault-shutdown` / migrasi

**Gejala.** `isShutdown = true`. `deposit_limit` menjadi 0, `deposit_hook` dibersihkan,
`msg.sender` mendapat `DEBT_MANAGER`, dan `update_debt` hanya menerima 0 (menarik semua dari
strategi). Deposit berhenti permanen; penarikan tetap jalan dari kas idle.

**Langkah.**

1. Tarik semua dana dari strategi: `update_debt(strategy, 0, 0)`. Saat shutdown, `new_debt` dipaksa 0
   oleh vault, jadi nilai selain 0 tidak berarti apa-apa — tetap tulis 0 supaya jelas.
2. Tunggu `totalIdle ≈ totalAssets`. Bila strategi tidak bisa melepas dana (venue illiquid),
   itu bukan bug keeper: catat dan eskalasi.
3. Umumkan: deposit ditutup, penarikan dibuka, tidak ada operasi baru. Jangan pernah menyebut
   shutdown sebagai "pause sementara".
4. Migrasi queue bila perlu; `set_default_queue` menolak strategi tidak aktif (`"!inactive"`), jadi
   revoke dulu.

**Target.** Semua dana idle ≤ 2 jam setelah shutdown diputuskan, atau eskalasi tertulis bila venue
menolak.

## C. `total-assets-moved` — lonjakan gain/loss

**Gejala.** `totalAssets` bergerak lebih dari `MAX_ASSETS_DELTA_BPS` dalam satu tick monitor.

1. Ambil `totalAssets`, `totalSupply`, `totalIdle`, `totalDebt`, dan `strategies(strategy)` pada dua
   blok (sebelum dan sesudah) — bukan dari API indexer saja.
2. Rekonsiliasi: `python scripts/db-test.py` membuktikan mesinnya; untuk data nyata jalankan
   `reconcile()` pada blok tersebut dengan `toleranceBps` yang wajar. Supply harus **eksak**.
3. Bila penurunan berasal dari venue: cek apakah `report` tertunda. Jangan panggil
   `turnOffHealthCheck` untuk "melewati" loss — `Accountant.report` revert `"too much loss"` adalah
   alarm, bukan penghalang.
4. Bila kenaikan tidak bisa dijelaskan: curigai share price manipulation / donation. Hentikan keeper
   (`touch .keeper-stop`), lalu eskalasi ke governance.

**Target.** Penjelasan tertulis (blok + angka) ≤ 30 menit.

## D. Likuiditas venue turun

**Gejala.** `maxWithdraw` vault turun; `withdraw` menarik dana dari venue dan bisa mengurangi debt.
Ingat: `maxWithdraw` **venue** tidak dipakai sebagai sinyal (bisa 0 walau likuid).

1. Ukur tiga angka terpisah, jangan digabung: `totalIdle`, `maxWithdraw(vault, owner)`, dan
   `maxRedeem`. UI wajib membedakan "nilai posisi" dan "dapat ditarik sekarang".
2. Bila `totalIdle` cukup untuk penarikan kecil, tidak ada tindakan darurat. Jangan pause.
3. Bila venue benar-benar tidak bisa melepas dana: catat, umumkan waktu tunggu yang jujur
   (bukan "instan"), dan pertimbangkan `FORCE_REVOKE_MANAGER` lewat timelock 6 jam (ADR-12).
   Ingat konsekuensinya: `force_revoke` menulis-off seluruh `current_debt` sebagai loss, **tidak**
   membakar share, dan share price bisa menjadi 0 bila seluruh aset ada di strategi itu
   (`docs/FEE_CONFIG.md` §7).
4. Setelah venue pulih: `report` untuk mengakui gain, lalu alokasi ulang.

**Target.** Komunikasi ke pengguna ≤ 30 menit; keputusan revoke ≤ 6 jam (batas timelock).

---

## Drill (HITL) — status: DIEKSEKUSI & TERVERIFIKASI

Empat drill di bawah adalah bagian dari tiket epik 6 T4 dan **telah dieksekusi** pada staging fork pin `118337511` menggunakan `packages/contracts/script/ExecuteDrills.s.sol`. Bukti on-chain lengkap tercatat di [`docs/DRILL_EVIDENCE.md`](file:///c:/laragon/www/kevin-work/wealthy-project/avenor/docs/DRILL_EVIDENCE.md).

| Drill | Prosedur | Target waktu | Bukti tercatat | Status |
| --- | --- | --- | --- | --- |
| D1 pause/unpause | A | diagnosis ≤ 15 mnt, unpause ≤ 60 mnt | Blok 26450185, `maxWithdraw` 0 saat pause, withdraw uji 1 USDG sukses pasca unpause | LULUS |
| D2 force revoke lewat fast lane | D langkah 3 | ≤ 6 jam | Blok 26450195 (schedule) & 26457395 (execute 6h emergency timelock), `current_debt` = 0 | LULUS |
| D3 penurunan likuiditas venue | D | komunikasi ≤ 30 mnt | Pengukuran 3 angka terpisah (idle, maxWithdraw, maxRedeem) pada blok 26450185 & 26450195 | LULUS |
| D4 shutdown + migrasi | B | dana idle ≤ 2 jam | Blok 26457395 (`shutdown_vault` oleh guardian), 100% aset ditarik ke kas idle (`1099000000`) | LULUS |

Prasyarat drill: vault hasil `Deploy.s.sol` pada fork pin `118337511` (bukan mainnet), akun uji,
keeper dalam mode sekali-jalan, dan satu manusia yang menandatangani hasilnya. Drill D2 juga
menutup gap T2 (dry-run keeper terhadap vault yang dideploy).

Kriteria lulus per drill: waktu aktual ≤ target, tidak ada langkah yang harus ditemukan di tengah
insiden, dan setiap angka di catatan punya blok.

## Setelah insiden

1. Tambahkan tes regresi yang gagal sebelum perbaikan (TDD) bila penyebabnya bug kontrak/adapter.
2. Perbarui ambang monitor bila alarm terlambat/terlalu sering — perubahan ambang adalah perubahan
   parameter dan harus masuk commit yang sama dengan `docs/KEEPER.md`.
3. Tulis postmortem dengan garis waktu berblok, bukan narasi.