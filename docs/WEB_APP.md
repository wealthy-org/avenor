# WEB_APP — app shell, primitif angka, dan halaman detail vault

Status: tiket 5.1 dan 5.2 (`epic-web-app-and-transactions`). Tiket 5.3–5.5 (deposit, withdraw,
portfolio) belum dikerjakan; dokumen ini hanya mengikat apa yang sudah ada di `apps/web`.

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
| `app/vaults/[address]/page.tsx` | halaman detail: nilai vault, split idle/debt, alokasi per strategi, parameter, peran on-chain, biaya, dokumen | setiap section punya provenance sendiri dan bisa gagal sendiri |
| `src/lib/api.ts` | `fetchJson`, `ApiError` | satu pintu HTTP; body non-JSON dan error tanpa kode tetap jadi error berkode |
| `src/lib/vaultView.ts` | `parseVaultRow`, `parseLive`, `parseAllocation`, `parseRoles`, `parseReports`, `shareBps`, `latestReportBlock` | validasi bentuk API sebelum angka menyentuh komponen |
| `src/lib/vaultLoader.ts` | `loadVaultDetail` | empat request paralel; kegagalan satu section tidak menjatuhkan yang lain |

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
3. **Komponen primitif ditulis `.ts` dengan `createElement`; halaman `.tsx`.** Repo ini tidak punya
   build step untuk test (Node 24 type stripping) dan type stripping tidak mem-parse JSX. Dengan
   primitif di `.ts`, file yang sama bisa dirender `react-dom/server` di test tanpa `tsx`/Babel.
   Halaman tetap `.tsx` karena Next meng-compile-nya; logika yang perlu diuji dipindahkan ke
   `src/lib/*.ts`, bukan diuji lewat halaman.

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

## 4. Halaman detail (tiket 5.2)

Endpoint yang dibaca, semuanya dari API ber-provenance:

| Bagian | Endpoint | Sumber |
|---|---|---|
| baris vault (nama, simbol, decimals, `role_manager` indeks, `accountant`, `deposit_limit`, blok deploy) | `/v1/vaults/<alamat>` | `indexed` |
| total aset, share, harga per share, `totalIdle`, `totalDebt`, `performanceFeeBps`, `managementFeeBps` | `/v1/vaults/<alamat>/live` | `onchain` |
| antrean strategi, `currentDebt`, `maxDebt`, `venue`, `lastReport` | `/v1/vaults/<alamat>/allocation?block=<blok live>` | `onchain` |
| `role_manager`, `future_role_manager`, uji `getMinDelay()` | `/v1/vaults/<alamat>/roles` | `onchain` |
| laporan `process_report` terakhir (gain, loss, biaya, refund) | `/v1/vaults/<alamat>/reports?limit=5` | `indexed` |

Aturan yang dipegang halaman ini:

1. **Alokasi dibaca pada blok yang sama dengan angka live.** `loadVaultDetail` memakai
   `?block=<blok live>`, bukan `latest`; dua blok berbeda akan menghasilkan persentase yang tidak
   pernah ada.
2. **`totalIdle + totalDebt == totalAssets` diperiksa sebelum render.** Bila tidak sama,
   `parseLive` melempar error dan halaman menampilkan kegagalan, bukan angka.
3. **Biaya berasal dari kontrak.** `accountant.getVaultConfig(vault)` memberi
   `(managementFee, performanceFee, refundRatio, maxFee, maxGain, maxLoss, custom)`; hanya dua yang
   pertama ditampilkan, dan tanpa accountant keduanya `null` (bukan 0). Fee dari konfigurasi kita
   tidak pernah dipakai sebagai "fee yang berlaku".
4. **Status timelock dibuktikan, bukan diasumsikan.** Halaman menyebut `role_manager` sebagai
   TimelockController hanya bila alamat itu menjawab `getMinDelay()`; bila tidak, ia menampilkan
   alasan kegagalan dan kalimat "jangan anggap ini timelock". `guardian` tidak ditampilkan karena
   `VaultV3.vy` tidak punya getter itu — guardian adalah alamat terpisah di konfigurasi deploy.
5. **Section yang gagal tidak menjadi nol.** `ErrorState` muncul di tempat angka; "Alokasi tidak
   terbaca" tidak pernah dirender sebagai "antrean kosong".
6. **Tidak ada CTA deposit.** Vault dengan `deposit_limit = 0` menampilkan "ditutup", dan tidak ada
   tombol deposit di halaman ini sampai tiket 5.3 mendarat.

Parameter on-chain yang dibaca (`accountant`, `role_manager`, `future_role_manager`) ada di
`referensi/yearn-vaults-v3/contracts/VaultV3.vy` (`accountant: public`, `role_manager: public`,
`future_role_manager: public`), `getVaultConfig` di
`packages/contracts/lib/yearn-periphery/src/accountants/Accountant.sol:472`, dan `getMinDelay()` di
`TimelockController` OpenZeppelin. Selector dihitung dengan `cast sig`, bukan diketik dari ingatan.

## 5. Yang belum, dan tidak diklaim

1. Deposit, withdraw, portfolio (5.3–5.5) belum ada. Belum ada transaksi dari UI.
2. Wallet belum terhubung ke app (`window.ethereum` atau connector).
3. `AVENOR_VAULTS` belum diset di deployment mana pun: app berjalan pada keadaan "belum ada vault".
4. `next build` belum masuk `scripts/verify-all.py` (waktu). Gate menjalankan `tsc --noEmit` + 45
   test. Build dicatat manual di `docs/REPRODUCIBILITY.md` §7.
5. Halaman detail belum dijalankan terhadap API + vault nyata: belum ada vault hasil
   `Deploy.s.sol` di chain 4663. Yang terbukti adalah parsing, perhitungan `bigint`, dan perilaku
   error terhadap body API yang dibentuk test.
6. "Dapat ditarik sekarang" tidak ditampilkan. `maxWithdraw` venue balas `0` pada pin `118337511`
   dan tidak dipakai sebagai sinyal likuiditas.