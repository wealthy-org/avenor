---
title: 'Portfolio and transparency surfaces'
type: 'implement'
ticket: 5
created: '2026-11-22'
status: built
baseline_revision: '470fc88'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
---

# Portofolio dan bukti: nilai posisi vs dapat-ditarik, riwayat, hash dari chain

## Hasil

- `apps/web`: **86 test** hijau (sepuluh berkas), `tsc --noEmit` 0 error, `next build` hijau:
  `/portfolio` rute dinamis 2,34 kB (209 kB First Load JS).
- `services/indexer`: **32 test** hijau; route baru `/fees?limit=` dan `/role-events?limit=` membaca
  tabel `fees`/`role_events` dan mengembalikan string + `blockNumber`, `blockTimestamp`,
  `blockHash`, `source: "indexed"`.
- `apps/web/src/lib/vaultView.ts`: `parseFees`, `parseRoleEvents`, `parsePosition` (uang sebagai
  string, `roleBit`/`granted` boleh `null` untuk perubahan bitmap).
- `apps/web/src/lib/evidence.ts`: `readEvidence` membaca `apiVersion()` **dan** `eth_getCode` pada
  blok yang sama, lalu menghitung keccak256 kode. Alamat tanpa kode → `codeHash: null`,
  bukan hash dari string kosong.

## Interaksi yang dijaga

1. `/portfolio` (server) hanya menyiapkan daftar vault + base API. Akun datang dari wallet di browser;
   API tidak pernah menebak akun.
2. Untuk tiap vault: share dibaca dari `/positions/<akun>` (indekser), lalu nilai posisi,
   `maxAssets`, `totalIdle`, dan blok pembacaan dihitung dari chain. Kedua angka ditampilkan terpisah;
   bila pembacaan chain gagal, keduanya berisi pesan error, bukan 0.
3. Halaman detail menampilkan riwayat laporan, riwayat biaya, riwayat peran, dan "Bukti kontrak":
   `apiVersion()`, hash runtime code, ukuran byte, blok pembacaan.
4. Hash berasal dari `eth_getCode`, bukan dari artefak build. Kalimat di halaman menyebut bahwa
   kecocokan dengan artefak hanya sah setelah `scripts/verify-bytecode.py` dijalankan pada commit
   yang sama.
5. Section riwayat yang gagal menampilkan `ErrorState`; tabel kosong dinyatakan sebagai "belum ada
   baris", bukan "biaya 0".

5. Ekspor CSV memakai `portfolioCsv` (3 test): satuan dasar, nomor blok, baris gagal tetap membawa
   errornya, dan escaping untuk tanda kutip/koma.

## Batas yang diakui (kenapa `built`, bukan `done`)

1. Belum ada vault terdeploy di chain 4663, jadi `/portfolio` belum pernah menampilkan posisi nyata.
   Test menutup parsing, perhitungan, dan perilaku error.
2. `AVENOR_VAULTS` dan `NEXT_PUBLIC_RPC_URL` belum diset di deployment mana pun.
3. `roleBit`/`granted` boleh `null` karena event `RoleSet` membawa bitmap penuh; UI menampilkan
   "bitmap"/"perubahan" alih-alih mengarang bit tunggal.
4. Riwayat dibatasi `limit=5` per halaman dan tidak ada paginasi UI; itu pekerjaan berikutnya, bukan
   klaim yang tersembunyi.

## Verifikasi

```
cd apps/web
node node_modules/typescript/bin/tsc --noEmit
node --test --test-concurrency=1 test/*.test.ts
node node_modules/next/dist/bin/next build
cd ../..
python scripts/db-test.py
python scripts/verify-all.py
```