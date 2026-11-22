# WEB_APP — app shell, primitif angka, dan halaman detail vault

Status: tiket 5.1–5.5 (`epic-web-app-and-transactions`). Tiket 5.4 dan 5.5 berstatus `built`: kode dan
test ada, tetapi belum pernah dijalankan terhadap vault terdeploy di chain 4663. Dokumen ini hanya
mengikat apa yang sudah ada di `apps/web`.

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
| `app/vaults/[address]/deposit/page.tsx` | halaman deposit (server) | membaca gerbang dari API; tanpa angka chain, form tidak dirender |
| `src/components/DepositForm.tsx` | form deposit (`"use client"`) | satu-satunya komponen yang memegang wallet |
| `src/lib/deposit.ts` | `parseAssetInput`, `depositBlockers`, `quoteDeposit`, `submitDeposit`, `readDepositEvent` | logika deposit diuji tanpa React dan tanpa wallet nyata |
| `src/lib/wallet.ts` | `connectWallet`, `readChainId`, `switchToAvenorChain`, `findInjectedProvider`, `mapWalletError` | tidak ada asumsi `window.ethereum` ada dan tidak ada asumsi chain benar |
| `app/vaults/[address]/withdraw/page.tsx` | halaman penarikan (server) | tanpa angka live, form tidak dirender |
| `src/components/WithdrawForm.tsx` | form penarikan (`"use client"`) | mode aset/share, `max_loss` eksplisit, hasil dari event |
| `src/lib/withdraw.ts` | `parseShareInput`, `parseLossBps`, `withdrawBlockers`, `withdrawWarnings`, `quoteWithdraw`, `submitWithdraw`, `readWithdrawEvent`, `idleCoverageBps`, `maxLossAssets` | semua keputusan penarikan diuji tanpa React |
| `src/lib/evidence.ts` | `readEvidence` | `apiVersion()` + keccak256 `eth_getCode` pada satu blok |
| `app/portfolio/page.tsx` | halaman portofolio (server) | daftar vault + base API; akun hanya dari wallet |
| `src/components/PortfolioPanel.tsx` | posisi per akun (`"use client"`) | nilai posisi dan dapat-ditarik tidak pernah digabung |

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
| riwayat biaya per event | `/v1/vaults/<alamat>/fees?limit=5` | `indexed` |
| riwayat perubahan peran | `/v1/vaults/<alamat>/role-events?limit=5` | `indexed` |
| `apiVersion()` + hash runtime code | `eth_call`/`eth_getCode` langsung dari server | `onchain` |

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
6. **Tidak ada CTA transaksi.** Vault dengan `deposit_limit = 0` menampilkan "ditutup"; tombol
   deposit dan penarikan ada di rute terpisah yang membaca kapasitasnya sendiri dari chain.

Parameter on-chain yang dibaca (`accountant`, `role_manager`, `future_role_manager`) ada di
`referensi/yearn-vaults-v3/contracts/VaultV3.vy` (`accountant: public`, `role_manager: public`,
`future_role_manager: public`), `getVaultConfig` di
`packages/contracts/lib/yearn-periphery/src/accountants/Accountant.sol:472`, dan `getMinDelay()` di
`TimelockController` OpenZeppelin. Selector dihitung dengan `cast sig`, bukan diketik dari ingatan.

## 5. Deposit (tiket 5.3)

Urutan yang dipegang form:

1. **Gerbang dibaca sebelum wallet disentuh.** `/v1/vaults/<a>/live` sekarang juga membawa
   `depositLimit`, `isPaused`, `isShutdown` dari chain pada blok yang sama. `deposit_limit = 0`,
   `isPaused`, atau `isShutdown` membuat form menampilkan status dan **tidak** merender tombol deposit.
2. **Kutipan satu blok.** `quoteDeposit` membaca `previewDeposit`, `maxDeposit`, `allowance`,
   `balanceOf`, `deposit_limit`, `isPaused`, `isShutdown` pada satu `blockNumber`. Angka share adalah
   perkiraan dan diberi label begitu.
3. **Blocker bernama.** `depositBlockers` mengembalikan kode + kalimat: `shutdown`, `paused`,
   `deposit_closed`, `cap_full`, `exceeds_cap`, `insufficient_balance`. Tombol submit mati bila daftar
   tidak kosong, dan `submitDeposit` memeriksa ulang daftar itu (bukan hanya UI).
4. **Approve tepat sebesar deposit.** Tidak ada `approve(max)`. `approve` hanya dikirim bila
   `allowance < assets`, lalu receipt approve diperiksa; approve gagal = berhenti.
5. **Tidak ada tanda tangan tanpa simulasi.** `prepareApprove`/`prepareDeposit` dari SDK melakukan
   `simulateContract` lebih dulu, sehingga revert muncul sebagai pesan form.
6. **Share final dari event.** `readDepositEvent` mendekode `Deposit(sender, owner, assets, shares)`
   dari receipt, hanya dari log kontrak vault. Receipt sukses tanpa event = `no_event`, bukan 0.

Kode error yang punya pesan sendiri: `no_provider`, `no_account`, `wrong_network`, `rejected`,
`pending_request`, `invalid_amount`, `insufficient_balance`, `paused`, `shutdown`, `deposit_closed`,
`cap_full`, `exceeds_cap`, `reverted`, `no_event`, `rpc`.

**Batas yang diakui.** `NEXT_PUBLIC_RPC_URL` wajib diset; tanpa itu form menolak membaca chain dan
tidak menebak. Simbol aset ditampilkan sebagai "aset" karena database belum menyimpan simbol aset;
yang ditampilkan adalah alamatnya. Test deposit berjalan pada node JSON-RPC skrip + penanda tangan
skrip (14 test), bukan browser + wallet nyata, karena belum ada vault terdeploy di chain 4663.

## 6. Penarikan (tiket 5.4)

1. **`max_loss` eksplisit, tanpa default.** Pilihan 0/10/50/100 bps atau angka lain 0–9999. Nilai
   `>= 10000` ditolak sebelum dikirim (`parseLossBps`) dan form menyebut alasannya. `submitWithdraw`
   memanggil `prepareWithdraw`/`prepareRedeem` dari SDK, yang mensimulasikan lebih dulu dan menolak
   `maxLoss` yang hilang — jadi tidak mungkin jatuh ke default kontrak (`withdraw`=0, `redeem`=10000).
2. **Kutipan satu blok.** `quoteWithdraw` membaca preview, plafon mode yang satunya, `balanceOf`,
   `totalIdle`, dan `convertToAssets(shareBalance)` pada satu `blockNumber`. Mode `assets` memakai
   `maxWithdraw` dari SDK, mode `shares` memakai `maxRedeem`.
3. **Nilai posisi dan dapat-ditarik dipisah.** Form menampilkan nilai posisi, `maxWithdraw`, kas idle,
   dan cakupan idle dalam persen. Peringatan W3 muncul ketika nilai posisi melebihi plafon; W6 saat
   `paused` (dengan kutipan `assert not self.paused`); W7 saat shutdown. Kalimat peringatan hidup di
   `withdrawWarnings()` sehingga diuji, bukan hanya ditulis di JSX.
4. **Tombol maks memakai plafon, bukan saldo.** "Maks" mengisi `maxWithdraw`/`maxRedeem`, karena
   mengisi saldo penuh akan menghasilkan transaksi yang revert.
5. **Hasil dari event.** `readWithdrawEvent` mendekode `Withdraw(sender, receiver, owner, assets,
   shares)` hanya dari log vault; receipt sukses tanpa event = `no_event`.

Kode error: `invalid_amount`, `invalid_loss_limit`, `insufficient_shares`, `exceeds_max`,
`nothing_to_withdraw`, `paused`, `reverted`, `no_event`, `rpc`, ditambah kode wallet yang sama
dengan deposit.

## 7. Portofolio dan bukti (tiket 5.5)

1. `/portfolio` menghubungkan wallet, membaca posisi dari `/v1/vaults/<a>/positions/<akun>`
   (indekser), lalu menghitung nilai dan batas tarik dari chain pada satu blok.
2. Nilai posisi dan dapat-ditarik **tidak pernah digabung**. Bila pembacaan chain gagal, kedua field
   itu berisi pesan, bukan angka.
3. Halaman detail menampilkan riwayat laporan, riwayat biaya (`/fees`), riwayat peran
   (`/role-events`), dan **bukti kontrak**: `apiVersion()` plus keccak256 dari `eth_getCode` pada blok
   yang sama. Hash itu dari chain, bukan dari artefak build; kecocokan dengan artefak hanya boleh
   diklaim setelah `scripts/verify-bytecode.py` pada commit yang sama.
4. Kedua endpoint riwayat membaca tabel indekser dan mengembalikan string + `blockNumber`,
   `blockTimestamp`, `blockHash`, `source: "indexed"`.
5. "Unduh CSV" mengekspor saldo share, nilai posisi, plafon tarik, kas idle, dan nomor blok dalam
   satuan dasar. Baris yang gagal ikut diekspor dengan pesan error, bukan dengan nol.

## 8. Yang belum, dan tidak diklaim

1. Withdraw dan portfolio sudah ada tetapi belum pernah dijalankan terhadap vault terdeploy; test
   memakai node JSON-RPC skrip.
2. Wallet hanya lewat EIP-1193 injected (`window.ethereum`); belum ada connector WalletConnect/Coinbase.
3. `AVENOR_VAULTS` belum diset di deployment mana pun: app berjalan pada keadaan "belum ada vault".
4. `next build` belum masuk `scripts/verify-all.py` (waktu). Gate menjalankan `tsc --noEmit` + 83
   test. Build dicatat manual di `docs/REPRODUCIBILITY.md` §7.
5. Halaman detail belum dijalankan terhadap API + vault nyata: belum ada vault hasil
   `Deploy.s.sol` di chain 4663. Yang terbukti adalah parsing, perhitungan `bigint`, dan perilaku
   error terhadap body API yang dibentuk test.
6. "Dapat ditarik sekarang" hanya ditampilkan dari `maxWithdraw`/`maxRedeem` vault pada blok yang
   dibaca. `maxWithdraw` venue balas `0` pada pin `118337511`; angka venue tidak pernah dipakai
   sebagai sinyal likuiditas, dan estimasi waktu tunggu tidak dikarang.