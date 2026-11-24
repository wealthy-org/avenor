# Avenor — Laporan Review & Rencana Kerja Menuju Testnet (Tahap E)

**Untuk:** developer Avenor
**Dasar:** Developer Master Brief (18 Nov 2026), repo https://github.com/wealthy-org/avenor commit `6ae57da` (41 commit, clone lokal `./avenor`), situs https://avenor-kappa.vercel.app/
**Metode:** source dibaca dan test dijalankan lokal; testnet dan mainnet dicek dengan `cast`; situs dicek via fetch read-only tanpa wallet.

Dokumen ini punya dua bagian:

- **Bagian I** berisi temuan, yaitu posisi repo terhadap brief.
- **Bagian II** berisi rencana kerja sampai Avenor punya deployment testnet Robinhood Chain (chain ID `46630`) yang reproducible, sudah diuji drill-nya, dan siap direview. Mainnet (tahap F) di luar scope.

---

# Bagian I — Temuan

## 1. Ringkasan dan posisi tahap

Repo sudah jauh melewati tahap "landing page + kontrak kosong". Kontrak, SDK, keeper, indexer, web app, dan sekitar 20 dokumen teknis sudah ada. Dokumennya juga disiplin soal provenance: hasil rehearsal fork dibedakan dari chain nyata.

| Tahap brief §16 | Status | Bukti |
|---|---|---|
| A — Baseline | Selesai | `docs/BASELINE.md`, `REFERENCE_CAPTURE.md`, `VENUE_INTEGRATIONS.md`, ADR di `ARCHITECTURE.md` |
| B — Vertical slice | Selesai, **hanya di anvil fork** | 1 vault, 1 strategi steakUSDG, gain/loss lifecycle, drill. `ACCEPTANCE_EVIDENCE.md`, `DRILL_EVIDENCE.md`, fork test 4663 |
| C — Product | Sebagian | Ada: landing, detail, deposit, withdraw, portfolio, transparency. Belum: activity, docs, operator, katalog lengkap |
| D — Multistrategy | Belum | Hanya 1 venue valid |
| E — Testnet + review | **Belum mulai** | Tidak ada config, deploy record, atau referensi `46630` di kode. Review masih internal |
| F / G | Belum | |

Belum ada satu pun kontrak Avenor di chain 4663 (`eth_getCode` = `0x`), dan repo sendiri mencatat ini di `docs/ACCEPTANCE_EVIDENCE.md §0`.

## 2. Hasil test lokal

| Komponen | Hasil | Catatan |
|---|---|---|
| `packages/contracts` (unit + invariant, tanpa fork) | **101/101 lulus** | Mesin reviewer memakai forge 1.8.5; repo mem-pin 1.9.0 |
| `apps/web` | 90/90 lulus | |
| `services/keeper` | 23/23 lulus | |
| `packages/sdk` | 12/12 lulus | |
| `services/indexer` | **Tidak dijalankan** | Butuh Postgres (`scripts/db-test.py`), dan `initdb` tidak terpasang di mesin reviewer |
| Fork test 4663 | Tidak dijalankan | Butuh RPC yang masih melayani blok pin |
| Reproduksi bytecode Vyper | Tidak dijalankan | `vyper` tidak terpasang |

- **Belum ada CI** (`.github/workflows` tidak ada). Klaim "test hijau" saat ini hanya berlaku di mesin yang menjalankannya.
- **Handler invariant terlalu sering revert.** Di `VaultHandler`, sekitar 13.200 dari 16.000 panggilan `withdraw`/`redeem` revert. Akibatnya jalur penarikan jarang benar-benar dieksekusi saat fuzz (brief §15).

## 3. Yang sudah sesuai brief

- **Yearn V3 tanpa patch core** (§6, §7.1). `packages/core` berisi artefak beku. Kode baru hanya `MorphoVaultStrategy` dan `DepositCapHook`.
- **BASELINE dan pin** (§7.1). Commit dan compiler tercatat. Dependensi vendored dicek byte-for-byte oleh `scripts/check-vendor.py`.
- **Pause spesifik** (§8.2). Sudah terbukti bahwa `setPaused` ikut memblokir withdraw. Karena itu freeze risiko memakai deposit limit atau hook, bukan pause.
- **`max_loss` eksplisit** (§9). Default yang tidak simetris (withdraw = 0, redeem = 10000) sudah tercatat, dan SDK memaksa nilai `max_loss` diisi eksplisit.
- **Perlindungan inflation attack** (§7.2). Seed dead shares 1.000 USDG ditambah minimum deposit. Ini sesuai dengan fakta bahwa core tidak punya virtual shares.
- **Angka likuiditas jujur** (§4, §7.3). Adapter memakai `min(nilai posisi, kas idle venue)`, karena `steakUSDG.maxWithdraw()` membalas 0 walaupun kasnya ada.
- **Role dan timelock** (§8.2). Matriks 14 bit, timelock 48 jam, emergency timelock 6 jam. Safe 3/5 sudah direncanakan.
- **Fee** (§10). Memakai Accountant. `strategyPerformanceFee` dipaksa 0 supaya tidak ada fee ganda; kalau tidak 0, deploy gagal.
- **Venue gate** (§7.3). Enam venue sudah dinilai. nnUSDG ditolak karena likuiditasnya 0 walaupun APY-nya 19%.
- **Tidak ada klaim "audited"**, dan mandat research diberi label roadmap.
- **Dokumen §17 sudah ada:** BASELINE, REFERENCE_CAPTURE, ARCHITECTURE, ACCOUNTING, WITHDRAWAL_SEMANTICS, ROLE_PERMISSION_MATRIX, VENUE_INTEGRATIONS, FEE_CONFIG, DEPLOYMENT, RUNBOOK, KEEPER, AUDIT_SCOPE, SECURITY_DIFF, REMEDIATION, ACCEPTANCE_EVIDENCE, DRILL_EVIDENCE.

## 4. Gap terhadap brief

### 4.1 Produk dan web app

| Brief | Repo | Gap |
|---|---|---|
| §5 Katalog 6 mandat | `VaultMandates.tsx` baru berisi 4: Managed Yield, Treasury Reserve, ETH Basis, Custom | **Cross-Venue Relative Value** dan **Macro / Rate Divergence** belum ada |
| §11 `/app/vaults`: katalog + filter/sort | Katalog hanya berupa section di landing `/` | Belum ada halaman katalog dengan filter aset/mandat/status |
| §11 `/app/activity` | Tidak ada (404 di situs live) | Belum ada halaman histori deposit, withdraw, report, realokasi, dan perubahan parameter |
| §11 `/docs` | Tidak ada di app | Dokumen hanya ada di repo, belum ada versi untuk user |
| §11 `/operator` console | Tidak ada | Belum ada UI untuk proposal alokasi, simulasi, dan transaksi multisig |
| §11 route `/app/...` dengan slug | `/vaults/[address]`, `/portfolio`, `/transparency` | Prefix berbeda dan memakai address, bukan slug. Minor, tapi perlu diputuskan |
| §11 status research/planned tanpa CTA deposit | `phase` hanya dipakai untuk pill status; `DepositForm` tidak membaca `phase` | Vault berstatus `research` tetap mendapat form deposit. Yang memblokir hanya `maxDeposit` onchain |
| §11 identitas sendiri, hormati lisensi aset | Commit "align UI/UX kit 1:1 with Kassora", file `kassora.css` | Berisiko terlalu menyalin Kassora. Brief hanya meminta Kassora sebagai referensi struktur |
| §11 usulan palet terang (#F7F8FA dst.) | Tema gelap | Boleh, karena palet belum final. Tapi keputusan owner soal ini belum tercatat |
| §9 wallet | Hanya injected EIP-1193 | Belum ada WalletConnect/Coinbase (diakui di `WEB_APP.md §8`) |

### 4.2 Indexer dan API (§12)

- **Entity brief yang belum punya tabel:**
  - `Deployment`
  - `MandateVersion`
  - `AllocationSnapshot`: sudah ada `venue_snapshots`, tapi belum memuat target vs aktual.
  - `CashFlow`: deposit/withdraw yang dipisahkan dari perubahan nilai.
  - `TimelockOperation`
  - `KeeperRun`
- **Endpoint brief yang belum ada:**
  - `/vaults/:id/performance`
  - `/vaults/:id/activity`
  - `/wallets/:address/positions`: yang ada baru per vault.
  - `/governance/operations`: pending timelock dengan old/new value dan executable time (§8.2).

### 4.3 Kontrak dan operasi

- **Multistrategi (§7.3, tahap D).** Baru steakUSDG. Kandidat kedua (Morpho Blue market langsung, Aave V3) masih research. Klaim "multistrategi" belum boleh dipakai.
- **Periphery belum diuji.** Kombinasi `vault-periphery@672de1c` (Accountant, RoleManager, DebtAllocator) dengan `yearn-vaults-v3` belum diuji terhadap ABI vault. Ini tercatat sebagai blocker di README.
- **Testnet 46630.** Belum ada jejak deploy atau rehearsal di testnet. Brief §1 meminta testnet sebelum mainnet.
- **Konsentrasi venue, ambang, dan cooldown realokasi (§8.1).** Belum terlihat ditegakkan onchain. Dengan 1 venue memang belum relevan, tapi harus ada sebelum tahap D.
- **Async withdrawal queue (§9).** Tidak dibangun. Ini sesuai brief, karena hanya diperlukan bila mandatnya butuh.
- **Lisensi (§3.2).** Belum ada `LICENSE`/`NOTICE` di root, padahal core dan tokenized-strategy berlisensi AGPL-3.0. Inventaris lisensi juga belum ada.
- **Review (§15, tahap E).** `REMEDIATION.md` mencatat 12 temuan yang semuanya ditutup atau diterima, tapi itu hasil review internal.

## 5. Inkonsistensi angka di dokumen

Brief menuntut setiap angka bisa ditelusuri. Ada salah satuan ribu/juta:

- **`totalAssets` steakUSDG** = `538856055994280` (6 desimal) = **538.856.055,99 USDG (≈538 juta)**.
  - `ACCEPTANCE_EVIDENCE.md §1`, `REFERENCE_CAPTURE.md:69`, `RISK_DISCLOSURE.md:13`, dan `VENUE_INTEGRATIONS.md:29` menulis `538.856,055994` USDG (≈538 ribu). Salah 1000×.
- **Kas idle** = `27024457979514` = **27.024.457,98 USDG (≈27 juta)**.
  - `ACCEPTANCE_EVIDENCE.md §1` dan `RISK_DISCLOSURE.md:13` menulis `27.024,457979` (≈27 ribu). Salah 1000×.
  - `VENUE_INTEGRATIONS.md:33,81` sudah benar.
  - Persentase 5,02% tetap benar karena kedua angka salah dengan faktor yang sama.
- **README.md:26** masih menulis "~73,5 juta USDG likuid (13,6%)". Dokumen lain sudah mengoreksinya menjadi 5,02% dan menyatakan angka 13,6% tidak boleh dipakai.
- **README "Struktur target"** masih menulis `packages/indexer`, `packages/keeper`, `packages/app`. Struktur repo yang sebenarnya adalah `services/indexer`, `services/keeper`, `apps/web`, dan justru itu yang sesuai brief §14.

## 6. Risiko di kode

1. **Alamat staging tertanam di kode web.** `app/vaults/[address]/page.tsx`, `deposit/page.tsx`, dan `withdraw/page.tsx` otomatis menampilkan `0x5aeB…18CA` sebagai "Avenor USDG Managed Vault (Staging)" bila `AVENOR_VAULTS` kosong.
   - Alamat itu tidak punya kode di 4663. Alamat itu berasal dari rehearsal dengan deployer anvil default `0xf39F…2266`, yang private key-nya publik.
   - Secara teori, siapa pun yang memegang key itu bisa menghasilkan kontrak di alamat turunan yang sama di chain nyata. App lalu akan menampilkannya dengan label Avenor dan form deposit.
   - Ini juga bertentangan dengan komentar di `config/vaults.ts` ("never invents an address").
2. **Fallback `assetAddress = config.address`** di `deposit/page.tsx:87`. Saat data vault gagal dibaca, alamat vault dipakai sebagai alamat asset. Nilai ini tidak boleh dipakai untuk approve.
3. **Peran stage memakai akun anvil:** guardian `0x7099…`, keeper `0x3C44…`, treasury `0x90F7…`. Wajar untuk rehearsal, tapi tidak boleh terbawa ke testnet maupun `4663.prod.json`.

## 7. Situs live https://avenor-kappa.vercel.app/

- **RPC tidak tersambung.** `/v1/health` membalas `{"ok":false,"source":"unavailable","error":"RPC Request failed."}`. Semua angka di situs berasal dari `forkSnapshot.json` (capture fork lokal), bukan dari chain.
- **`AVENOR_VAULTS` tidak diset.** "1 vault configured" berasal dari alamat hard-coded `0x5aeB…18CA` (§6 poin 1). Halaman detail vault sendiri menulis "this address has no code at this block".
- **Hero landing menampilkan angka fork seolah angka live:** total assets 1.800 USDG, deposit limit 50.000 USDG, performance fee 10%. Label "rehearsal fork" baru muncul jauh di bawah, di section Contracts. Brief §11 melarang TVL yang terlihat live.
- **Landing berisi klaim yang tidak benar:** "All data, TVL, and allocations are synced on-chain from Robinhood Chain mainnet pin block 118337511. APY benchmarks reflect live venue queries". Datanya capture fork, bukan mainnet, dan tidak ada APY di halaman. Klaim ini juga bertentangan dengan halaman `/transparency` situs itu sendiri.
- **Halaman deposit menulis "Deposit gate: Open — below the cap"** untuk vault yang tidak ada di chain.
  - Menurut `src/lib/deposit.ts`, quote dibaca live lewat wallet. Pada alamat tanpa kode, pembacaan `deposit_limit` gagal, jadi tombol deposit tetap mati.
  - Dana user aman hari ini, tapi teks "Open" menyesatkan, dan risiko alamat diduduki pihak lain (§6 poin 1) tetap ada.
- **Bahasa campur.** Halaman detail berbahasa Inggris memuat kalimat bahasa Indonesia ("Staging fork — semua angka langsung dari fork…"). Isinya juga keliru, karena render itu memakai capture ("the node was not reachable for this render").
- **Puffery.** Hero memakai klaim "institutional-grade", padahal brief §4 meminta kualitas tidak dijual lewat klaim.
- **Yang sudah baik:** `/portfolio` dan `/transparency` berfungsi dan jujur soal sumber data.

## 8. Fakta testnet 46630 (dicek dengan `cast`)

| Cek | Hasil |
|---|---|
| `rpc.testnet.chain.robinhood.com` | Hidup, chain ID `46630`, blok ±157.434.734 |
| USDG mainnet `0x5fc5…d168` di testnet | **Tidak ada kode** |
| steakUSDG `0xBeEf…09dd` di testnet | **Tidak ada kode** |
| TokenizedStrategy kanonik `0x3110D1Eec90f0651C18e75AD37711A8777342504` di testnet | **Tidak ada kode** |
| Deployer CREATE2 `0x4e59b448…956C`, `0x914d7Fec…43d7`, dan CreateX `0xce0042B8…cf9f` | Ada di testnet dan mainnet |

Konsekuensinya:

1. **Blocker utama.** `BaseStrategy` mengunci `tokenizedStrategyAddress = 0x3110D1…2504` (`lib/tokenized-strategy/src/BaseStrategy.sol:111`). Di testnet alamat itu kosong, sehingga `MorphoVaultStrategy` tidak akan berfungsi.
   - Implementasi TokenizedStrategy v3.1.1 harus ada di alamat yang **sama persis** di 46630.
   - Telusuri cara alamat itu dideploy di 4663 (deployer, salt, factory CREATE2). Ulangi di testnet dengan initcode yang sama, lalu buktikan runtime hash-nya sama dengan mainnet.
   - Jangan patch konstanta di `lib/`. Itu melanggar aturan dependensi vendored dan akan gagal di `check-vendor`.
2. **USDG testnet.** Cari alamat resmi di https://docs.robinhood.com/chain/ (Token Contracts, bagian testnet). Kalau tidak ada, pakai `MockUSDG` 6 desimal dan beri label "mock" di semua record dan UI.
3. **Venue.** steakUSDG tidak ada di testnet. Pilihannya: Morpho vault testnet resmi bila ada, atau `MockVenue`. Menurut brief §15, testnet dengan mock venue **bukan** bukti bahwa venue mainnet tersedia. Catat ini di setiap evidence.
4. **Jangan menyalin alamat factory atau vault Yearn dari 4663.** Deploy sendiri, lalu verifikasi runtime hash-nya terhadap `docs/BASELINE.md`.

---

# Bagian II — Rencana kerja menuju testnet

## 9. Pekerjaan wajib

### P0 — Perbaikan yang menyesatkan atau berisiko (kerjakan dulu)

| # | Tugas | File | Selesai bila | Temuan |
|---|---|---|---|---|
| P0-1 | Hapus alamat staging `0x5aeB…18CA` yang hard-coded | `apps/web/app/vaults/[address]/page.tsx`, `deposit/page.tsx`, `withdraw/page.tsx` | Tanpa `AVENOR_VAULTS`, app menampilkan "belum ada vault", dan ada test baru yang membuktikannya | §6.1 |
| P0-2 | Form deposit wajib mengikuti `phase`: vault `research` tidak boleh punya form atau CTA deposit | `deposit/page.tsx`, `DepositForm.tsx` | Ada test: vault `research` tidak punya tombol deposit | §4.1 |
| P0-3 | Hapus fallback `assetAddress = config.address` | `deposit/page.tsx:87` | Bila asset tidak terbaca, form menampilkan error, bukan approve ke alamat vault | §6.2 |
| P0-4 | Teks "Deposit gate: Open" hanya boleh muncul dari pembacaan live, bukan dari capture | `DepositForm.tsx` | Saat sumber data `captured`, gate tampil "unknown / not live" | §7 |
| P0-5 | Beri label fork/testnet langsung di angka hero. Hapus "synced on-chain from Robinhood Chain mainnet", "APY benchmarks reflect live venue queries", dan "institutional-grade" | `app/page.tsx`, komponen hero | Tidak ada klaim mainnet, live, atau APY yang tidak didukung data | §7 |
| P0-6 | Ganti kalimat Indonesia yang keliru di UI detail vault | `app/vaults/[address]/page.tsx` | UI satu bahasa, dan teksnya sesuai sumber data | §7 |
| P0-7 | Koreksi angka yang salah 1000× | `ACCEPTANCE_EVIDENCE.md §1`, `REFERENCE_CAPTURE.md:69`, `RISK_DISCLOSURE.md:13`, `VENUE_INTEGRATIONS.md:29` | Angka konsisten dengan raw `538856055994280` dan `27024457979514` (6 desimal) | §5 |
| P0-8 | Perbarui README: hapus angka 13,6% dan 73,5 juta, sesuaikan struktur folder | `README.md` | Isi README sesuai repo | §5 |
| P0-9 | Situs Vercel: set `AVENOR_VAULTS` dengan benar (atau kosongkan dengan sengaja) dan sambungkan RPC | Env Vercel | `/v1/health` `ok:true`, atau situs jujur menyatakan "belum ada vault" | §7 |

### P1 — Infrastruktur testnet

| # | Tugas | Selesai bila |
|---|---|---|
| P1-1 | Buat `packages/config/46630.json` berisi alamat USDG/venue testnet dan provenance blok, terpisah dari 4663 | `ChainConfig.t.sol` ikut menguji file 46630 |
| P1-2 | `Deploy.s.sol` saat ini memakai konstanta default 4663 (`USDG_4663`, `STEAK_USDG_4663`). Ubah agar default dipilih dari config berdasarkan `block.chainid`, dan revert bila chain bukan 4663/46630/31337 | Deploy di chain lain gagal, dan deploy 46630 tidak pernah memakai alamat 4663 |
| P1-3 | Buat script untuk mendeploy TokenizedStrategy v3.1.1 ke `0x3110D1…2504` di 46630 (§8 poin 1) | Runtime hash di 46630 sama dengan di 4663, dan tercatat di `REPRODUCIBILITY.md` |
| P1-4 | Mode `stage` untuk 46630 memakai **wallet baru**, bukan akun anvil default (`0xf39F…`, `0x7099…`, `0x3C44…`, `0x90F7…`) | Record deploy tidak memuat alamat anvil |
| P1-5 | Buat Safe testnet untuk governance, guardian, dan treasury. Threshold 2/3 boleh di testnet, asalkan bedanya dari rencana 3/5 dicatat | `role_manager` = TimelockController 48 jam dengan proposer Safe; emergency timelock 6 jam |
| P1-6 | Verifikasi source di explorer testnet. Bila explorer diblokir, pakai jalur yang sudah ada (keccak runtime lokal vs `eth_getCode`) dan catat | Setiap alamat punya bukti verifikasi di deploy record |
| P1-7 | Pakai provider RPC dengan archive access dan fallback. Fallback wajib mengecek chain ID | `/v1/health` `ok:true` di staging testnet |
| P1-8 | Buat CI GitHub Actions: forge build/fmt/test, test sdk/web/keeper, test indexer dengan Postgres service, `tsc --noEmit`, `next build` | Setiap PR menjalankan semua suite, dan statusnya terlihat |

### P2 — Kelengkapan produk sesuai brief (bisa paralel dengan P1)

| # | Tugas | Brief | Temuan |
|---|---|---|---|
| P2-1 | Lengkapi katalog 6 mandat: tambah Cross-Venue Relative Value dan Macro / Rate Divergence dengan status planned, tanpa CTA dan tanpa angka | §5 | §4.1 |
| P2-2 | Halaman katalog vault dengan filter aset/mandat/status dan sort | §11 | §4.1 |
| P2-3 | Halaman `/activity` untuk deposit, withdraw, report, realokasi, dan perubahan parameter | §11 | §4.1 |
| P2-4 | Halaman `/docs` untuk user: cara kerja, fee, accounting, risiko, exit | §11 | §4.1 |
| P2-5 | Halaman `/operator` untuk menyiapkan proposal alokasi, simulasi, dan payload Safe. Izin tetap ditegakkan kontrak | §11, §13 | §4.1 |
| P2-6 | Tabel indexer: `cash_flows`, `timelock_operations`, `keeper_runs`, `deployments`, `mandate_versions`, `allocation_snapshots` (target vs aktual) | §12 | §4.2 |
| P2-7 | Endpoint API: `/vaults/:id/performance`, `/vaults/:id/activity`, `/wallets/:address/positions`, `/governance/operations` (old/new value, eta, proposer, tx) | §8.2, §12 | §4.2 |
| P2-8 | Wallet connector selain injected (WalletConnect) | §9 | §4.1 |
| P2-9 | `LICENSE`, `NOTICE`, dan inventaris lisensi (core dan tokenized-strategy AGPL-3.0) | §3.2 | §4.3 |
| P2-10 | Kurangi gaya "1:1 Kassora" (`kassora.css`). Ambil strukturnya, bukan identitas visualnya | §11 | §4.1 |

### P3 — Kualitas test

| # | Tugas | Selesai bila |
|---|---|---|
| P3-1 | Bound handler invariant (saat ini sekitar 13.200 dari 16.000 panggilan `withdraw`/`redeem` revert) | Rasio revert jalur penarikan turun jelas, dan invariant penarikan benar-benar dieksekusi |
| P3-2 | Uji kombinasi `vault-periphery@672de1c` (Accountant, RoleManager, DebtAllocator) terhadap ABI vault | Test integrasi lulus, atau ada keputusan tertulis untuk tidak memakai modul tertentu |
| P3-3 | Pin forge di CI sesuai BASELINE (1.9.0) | Versi toolchain CI tercatat |

## 10. Bukti yang harus ada di testnet (syarat lulus tahap E)

Semua bukti dicatat di `docs/TESTNET_EVIDENCE.md`: tx hash, blok, input/output dalam base unit, link explorer, serta label `testnet` / `mock venue` bila berlaku.

1. **Deploy reproducible.** `deployments/46630.stage.json` dengan `recordedOn: "chain"`, dan runtime hash cocok dengan BASELINE.
2. **Role matrix terbukti on-chain.** Deployer tidak punya role tersisa. Panggilan tanpa izin revert, minimal satu tx revert untuk tiap role sensitif.
3. **Timelock 48 jam.** Satu perubahan (misalnya `max_debt` atau penambahan strategi) dijadwalkan, terlihat sebagai pending di UI/API, lalu dieksekusi setelah delay habis.
4. **Lifecycle user:**
   1. Approve sebesar jumlah deposit.
   2. Deposit.
   3. `update_debt` ke strategi.
   4. Report gain. Venue mock boleh menyuntik yield, asalkan diberi label.
   5. Withdraw sebagian dengan `max_loss` eksplisit.
   6. Redeem semua.
5. **Lifecycle rugi.** Report kerugian membuat harga share turun. Withdraw dengan `max_loss` = 0 harus revert, sedangkan dengan budget yang cukup harus berhasil.
6. **Fee.** Performance fee nonzero tercatat di event dan masuk ke Safe treasury.
7. **Drill:**
   - Deposit freeze lewat `deposit_limit` atau hook.
   - Pause, dengan bukti bahwa withdraw ikut terblokir.
   - Force-revoke darurat lewat timelock 6 jam.
   - Illiquidity: venue tidak punya cukup kas, withdraw terbatas, dan UI menampilkan batasnya.
   - Shutdown.
8. **Keeper berjalan terus minimal 72 jam di testnet.** Report terjadwal berjalan, restart tidak menghasilkan tx ganda, dan alert terkirim saat RPC dimatikan.
9. **Indexer.** Backfill dari blok deploy, lalu rekonsiliasi shares, debt, dan idle dengan state on-chain menghasilkan selisih 0.
10. **Web staging terhubung ke testnet.** Semua angka bertanda blok, `/v1/health` ok, dan tidak ada angka dari capture.
11. **Review.** Cakupan: diff core (harus kosong), adapter, hook, permissions, accounting, dan deploy config. Temuan masuk `REMEDIATION.md` beserta statusnya.
12. **Release candidate dipin.** Tag git, commit SHA, dan daftar known limitations.

## 11. Keputusan yang dibutuhkan dari owner

Developer bisa mengerjakan P0–P3 tanpa menunggu keputusan ini, tapi bukti di §10 membutuhkannya.

**Untuk testnet:**
- Siapa penandatangan Safe testnet dan berapa threshold-nya.
- Boleh tidaknya testnet memakai mock venue dan mock USDG, atau harus menunggu venue testnet resmi.
- Fee untuk uji testnet. Usulan: tetap 10% performance / 0% management, supaya jalur fee nonzero teruji. Ini bukan angka komersial.
- Cap testnet dan buffer idle minimum.
- Jadwal report keeper.
- Nama brand: tetap "Avenor" sebagai placeholder, atau memakai `PROJECT_NAME`.

**Masih terbuka untuk mainnet (brief §18):**
- Nama final dan palet warna.
- Fee schedule dan penerimanya.
- Signer Safe 3/5.
- Cap awal.
- Venue kedua.
- Kebijakan upgrade dan migrasi.
- Provider RPC archive produksi (RPC publik 4663 menolak archive request).

## 12. Urutan yang disarankan

1. Semua P0. Ini paling mendesak, karena situs live saat ini menampilkan angka fork sebagai angka live.
2. P1-8 (CI), P1-1, P1-2, dan P1-3, lalu deploy pertama di 46630.
3. Sisa P1, lalu bukti §10 poin 1–6.
4. P2 dikerjakan paralel. P3 selesai sebelum review.
5. Drill, keeper soak, dan rekonsiliasi indexer (§10 poin 7–10).
6. Review dan release candidate (§10 poin 11–12).

Estimasi durasi sengaja tidak ditulis, karena bergantung pada keputusan §11 dan pada apakah TokenizedStrategy bisa ditempatkan di alamat kanonik di 46630.
