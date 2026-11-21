# WEB_APP — app shell dan primitif angka

Status: tiket 5.1 (`epic-web-app-and-transactions`). Tiket 5.2–5.5 belum dikerjakan; dokumen ini
hanya mengikat apa yang sudah ada di `apps/web`.

## 1. Yang sudah ada

| Berkas | Isi | Kenapa begitu |
|---|---|---|
| `app/layout.tsx` | shell, skip link, nav | halaman tanpa jalan lewat keyboard bukan halaman |
| `app/globals.css` | token warna/spacing/type + `prefers-color-scheme` | satu sumber token; tidak ada nilai warna di komponen |
| `app/page.tsx` | katalog dari `AVENOR_VAULTS` | katalog kosong lebih jujur daripada vault demo |
| `app/transparency/page.tsx` | daftar yang bisa diperiksa | tanpa angka uang, tanpa label "audited" |
| `src/lib/format.ts` | `money`, `shares`, `percentBps`, `percentOf`, `blockTime`, `liquiditySplit`, `shortAddress` | semua pembulatan `bigint`, tidak ada `Number` |
| `src/config/vaults.ts` | `parseVaultList`, `apiUrl` | konfigurasi rusak = error, bukan katalog kosong |
| `src/components/primitives.ts` | `Amount`, `BlockProvenance`, `StatusPill`, `ErrorState`, `AddressText`, `Percent` | komponen tidak menghitung, hanya memformat |

## 2. Keputusan yang menyimpang dari tiket 5.1 (tertulis, bukan diam-diam)

1. **Tailwind tidak dipakai; token CSS biasa.** Tiket menyebut "Next.js App Router + Tailwind".
   Yang dibutuhkan tiket sesungguhnya adalah token warna/spacing/type yang konsisten; `globals.css`
   memberi itu dalam 200 baris tanpa menambah rantai build kedua. Konsekuensi: tidak ada utility
   class, jadi setiap komponen baru harus memakai kelas yang sudah ada atau menambah token —
   itulah yang diinginkan, bukan class ad-hoc.
2. **Storybook tidak dipakai; snapshot lewat `react-dom/server`.** Tiket meminta "Storybook/snapshot
   untuk Amount dan provenance". `apps/web/test/components.test.ts` merender markup nyata dengan
   `renderToStaticMarkup` dan meng-assert string yang dilihat pengguna (termasuk `title` presisi
   penuh dan teks provenance). Ini snapshot yang gagal di CI, bukan screenshot yang harus dilihat
   manusia.
3. **Komponen ditulis `.ts` dengan `createElement`, bukan `.tsx`.** Repo ini tidak punya build step
   TypeScript (Node 24 type stripping) dan type stripping tidak mem-parse JSX. Dengan `.ts`, file
   komponen yang sama bisa dirender di test tanpa `tsx`/Babel. Konsekuensi: tidak ada JSX di app;
   kalau nanti JSX dibutuhkan, itu keputusan baru dengan build step baru.

## 3. Aturan angka di UI

- `money()` membulatkan **half-up** ke 2 desimal dengan `bigint`, lalu `formatUnits`; nilai penuh
  tetap tersedia di `title`. Tidak ada `parseFloat`, tidak ada `Number` pada nilai uang.
- `shares()` 4 desimal dan **tidak** pernah diberi akhiran `USDG`.
- `percentBps()` tidak pernah tampil sendiri; `percentOf()` mewajibkan penyebut disebut
  (`dari total aset` / `dari total share` / `dari batas deposit`). Ini yang mencegah "APY" muncul
  dari angka tanpa basis.
- `liquiditySplit()` menolak `idle > totalAssets` (tanda dua angka dari blok berbeda) dan menulis
  kalimat yang memisahkan nilai posisi dari yang dapat ditarik. `maxWithdraw` sengaja **bukan**
  input wajib: venue membalas `0` untuk posisi likuid di pin `118337511`, jadi angka itu tidak boleh
  menjadi dasar janji.
- `BlockProvenance` menolak `blockNumber` non-desimal dan `source` tak dikenal. Tidak ada angka
  tanpa blok.

## 4. Yang belum, dan tidak diklaim

1. Vault detail, deposit, withdraw, portfolio (5.2–5.5) belum ada. Katalog hanya menautkan
   `/vaults/<alamat>` yang akan 404 sampai 5.2 mendarat.
2. Wallet belum terhubung ke app (`window.ethereum` atau connector). Belum ada transaksi dari UI.
3. `AVENOR_VAULTS` belum diset di deployment mana pun: app berjalan pada keadaan "belum ada vault".
4. `next build` belum masuk `scripts/verify-all.py` (waktu). Gate menjalankan `tsc --noEmit` + 21
   test. Build dicatat manual di `docs/REPRODUCIBILITY.md` §7.