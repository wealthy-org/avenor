---
type: retrospective
epic: "epic-web-app-and-transactions"
tickets: 5
done: [1, 2, 3, 4]
built: [5]
blocked: []
baseline_revision: '4445875'
head_revision: '2cd35fc'
created: '2026-11-22'
---

# Retrospective — Epic 5: Web App

Sumber yang dipakai: `epic-web-app-and-transactions.md`, `tickets.toml`, lima plan file, commit
`88c6450` / `1078d2b` / `61c99d3` / `efb13d1` / `2cd35fc`, dan output gate
`python scripts/verify-all.py` (ALL CHECKS PASSED, 14/14 bytecode).

## Apa yang benar-benar selesai

| Tiket | Status | Bukti |
|---|---|---|
| 5.1 shell, token, primitif | `done` | `88c6450`; 21 test awal, `tsc` 0, `next build` 3 rute statis |
| 5.2 katalog + detail | `done` | `1078d2b`; endpoint `live`/`allocation`/`roles`, fee dari `accountant.getVaultConfig`, timelock dibuktikan lewat `getMinDelay()` |
| 5.3 deposit | `done` | `61c99d3`; gate `deposit_limit`/`isPaused`/`isShutdown`, approve terbatas, hasil dari event |
| 5.4 penarikan | `done` | `efb13d1`; `max_loss` di `sent.args[3]`, `withdrawWarnings` untuk W3/W4/W6, "Maks" = plafon |
| 5.5 portofolio + bukti | `built` | `efb13d1` + `2cd35fc`; `/portfolio`, riwayat biaya/peran, `apiVersion` + hash `eth_getCode`, ekspor CSV |

Angka akhir: **86 test web** (sepuluh berkas), indexer **32 test**, kontrak **101 test**, SDK 12,
keeper 22. Total diff epic 5: 36 berkas, +5.154 baris.

## Temuan yang bisa ditindaklanjuti (semua bersumber)

1. **`max_loss` nyaris menjadi default tersembunyi — dua kali.** Di `withdraw.ts` versi pertama,
   `quoteWithdraw` membaca plafon mode lain secara manual sekaligus memakai `previewWithdraw` yang
   sudah membaca `maxWithdraw`; akibatnya enam pembacaan untuk lima nilai. Diperbaiki dengan
   memakai plafon dari SDK dan hanya membaca mode satunya (`efb13d1`). Pelajaran: preview SDK adalah
   sumber plafon, bukan pelengkap.
2. **Bug off-by-two pada decode alamat array** (`decodeAddress` memakai `hex.slice(2,66)` lalu
   `body.slice(24)`) tertangkap test allocation, bukan review. Artinya decode manual perlu test
   dengan alamat berleading zero — fixture sekarang memakai `addressWordResult` yang memaksa 40 hex.
3. **Dua getter yang tidak ada sempat masuk desain API**: `performanceFee()` (tidak ada di
   `Accountant.sol`) dan `guardian()` (tidak ada di `VaultV3.vy`). Keduanya dibuang sebelum commit,
   bukan diisi dengan nilai konfigurasi. Aturan "getter yang tidak ada tidak difabrikasi" kini punya
   dua contoh konkret.
4. **Kesalahan tipe di gate, bukan di runtime**: `Live`/`Roles` menolak `bps` sebagai JSON number
   padahal bps kecil eksak. `optionalBps`/`parseRoles` sekarang menerima integer number, sementara
   `decimal()` tetap menolak number untuk uang. Pemisahan "uang ≠ bps" ini perlu ditulis di setiap
   parser baru.
5. **`next build` tidak ada di gate.** Gate menjalankan `tsc --noEmit` + 86 test; build divertifikasi
   manual. Dua kali build yang gagal hanya terlihat karena dijalankan manual. Ini risiko regresi
   yang tidak tertangkap `python scripts/verify-all.py`.
6. **`tickets.py` menulis status ke frontmatter plan**, bukan ke `tickets.toml` (field `status` di
   TOML inert). Konsisten dipakai, tetapi mudah disalahpahami orang baru.

## Tindakan

| # | Tindakan | Alasan | Status |
|---|---|---|---|
| A1 | Tambahkan `next build` ke `scripts/verify-all.py` di belakang flag `--with-web-build` | build gagal tidak tertangkap gate saat ini | usulan, butuh keputusan manusia (waktu gate +40 s) |
| A2 | Setiap parser baru wajib memilih `decimal()` atau `optionalBps()` secara eksplisit | dua bug tipe berasal dari campuran uang/bps | diterapkan di 5.2–5.5, dicatat di `docs/WEB_APP.md` §3 |
| A3 | Fixture alamat wajib lewat helper yang memaksa 40 hex | bug off-by-two lolos fixture manual | diterapkan (`test/fakeRpc.ts`, `test/fakeChain.ts`) |
| A4 | Bukti on-chain memakai `eth_getCode`, bukan artefak build | artefak lokal membuktikan yang kita bangun, bukan yang berjalan | diterapkan (`src/lib/evidence.ts`) |
| A5 | Larang getter fabrikasi secara tertulis di `docs/WEB_APP.md` | dua getter tidak ada hampir masuk API | diterapkan §4 butir 4 |

## Keputusan penerimaan

**Diterima sebagian.** Empat dari lima tiket `done`; 5.5 `built`. Empat kriteria "Done When" epic
belum dapat dibuktikan dan tidak diklaim:

1. Butir 5 (portfolio): "data cocok dengan rekonsiliasi indexer" belum diuji pada data nyata, karena
   belum ada vault terdeploy di chain 4663.
2. Butir 3 dan 4 (deposit/withdraw): tidak ada transaksi nyata; test berjalan pada node JSON-RPC
   skrip + penanda tangan skrip.
3. Butir 6 (transparency): hash artefak ditampilkan dari chain, tetapi kecocokannya dengan
   `packages/core/artifacts/VaultV3.json` hanya sah setelah `scripts/verify-bytecode.py` pada commit
   yang sama (jalankan: 14/14 lulus untuk pin ini).
4. Butir 7 (accessibility): keyboard/focus/kontras belum diuji dengan alat apa pun. `skip link` dan
   `prefers-color-scheme` ada, tetapi itu bukan bukti audit aksesibilitas.

Blocker tunggal untuk menutup epic: **deployment nyata**. Tanpa `Deploy.s.sol` dijalankan dengan
`DEPLOYER_ADDRESS` dan RPC, tidak ada vault, tidak ada posisi, tidak ada `NEXT_PUBLIC_RPC_URL`,
sehingga 5.5 dan E6-T2/T4/T5 tetap tidak dapat diverifikasi.