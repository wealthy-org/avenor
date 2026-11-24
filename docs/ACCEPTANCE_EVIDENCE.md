# ACCEPTANCE EVIDENCE — Avenor USDG Managed Vault

Dokumen bukti penerimaan teknis dan akseptansi operasional untuk vault ERC-4626 USDG di Robinhood Chain (`4663`).

Sesuai aturan keras `AGENTS.md`: semua angka berasal dari pembacaan rantai (*on-chain*) atau simulasi dengan nomor blok dan timestamp nyata; tidak ada angka karangan; tidak ada klaim "audited" untuk kontrak baru kita.

> **Status provenance (koreksi 2026-11-29).** Dokumen ini mencatat *rehearsal* di **fork lokal anvil** dari state chain `4663`, bukan transaksi di chain `4663` itu sendiri. Per `2026-11-29`: `eth_getTransactionByHash` mengembalikan `null` di chain `4663` untuk ketiga hash di §3, dan `eth_getCode` mengembalikan `0x` untuk vault, factory, emergency timelock, maupun akun pengguna uji. Angka dan hasil di bawah tetap sah sebagai hasil eksekusi nyata terhadap bytecode kanonik Yearn V3, tetapi **bukan** bukti deploy mainnet. Cara memeriksa ulang ada di §0.

---

## 0. Cara Memeriksa Dokumen Ini

Semua pemeriksaan di bawah dijalankan ke `https://rpc.solidrpc.io/public/evm/4663` pada `2026-11-29`.

| Klaim di dokumen | Perintah | Hasil nyata |
|---|---|---|
| Vault terdeploy di `4663` | `eth_getCode(0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA, "latest")` | `0x` (0 byte) |
| Factory terdeploy di `4663` | `eth_getCode(0x45d4fe781f3298982616778272e53ECC800Fc48F, "latest")` | `0x` |
| Emergency timelock terdeploy di `4663` | `eth_getCode(0xf2Bf7C00B4696726B3c1f6E7b87d1a4acB050a8F, "latest")` | `0x` |
| Tx pembukaan limit deposit (§3C) | `eth_getTransactionByHash(0x3ac2e0711829cea185f3ca96fb0ac00c266d8cf37c3bc74e6047fd30d788e738)` | `null` |
| Tx deposit pengguna (§3C) | `eth_getTransactionByHash(0xfa576557a5063be639a5b7be6b1bc247f671a79cd4d21eca0f0e8543d4ead1f5)` | `null` |
| Tx penarikan pengguna (§3C) | `eth_getTransactionByHash(0xe9c8cd8d03aa752644e7b866c44ae57359602af0ef6c8f90c5bb47a5b5dc49db)` | `null` |
| Venue `steakUSDG` ada di `4663` | `eth_getCode(0xBeEff033F34C046626B8D0A041844C5d1A5409dd, "latest")` | 21.808 byte (satu-satunya alamat non-USDG yang berisi kode) |

Header blok kanonik chain `4663` (dibaca dengan `eth_getBlockByNumber`, bukan dari fork):

| Tinggi | Hash kanonik | Timestamp |
|---|---|---|
| `118337511` (pin) | `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af` | `1795103654` = `2026-11-19T15:54:14Z` |
| `118337663` (blok capture web) | `0xebf54955940be06117f89f57f750d1d1dd263000ac5e2f797b544486277be7db` | `1795103669` = `2026-11-19T15:54:29Z` |
| `26450185` (blok drill) | `0xd407d24921d5a58a28d280b42cc27524f8c2e8e09868acd8e1904ad4b3a816c2` | `1785728805` = `2026-08-03T03:46:45Z` |

Baris terakhir menjelaskan kenapa tinggi blok drill (`26450185/195/395`) tidak mungkin berasal dari fork yang dipin di `118337511`: itu adalah run chain lokal yang lain. Bukti tersimpan, provenance-nya yang diperbaiki.

---

---

## 1. Metadata Jaringan & Pin Baseline

- **Jaringan:** Robinhood Chain (`4663` / `0x1237`)
- **Block Pin Baseline:** `118337511`, hash kanonik `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af`, timestamp `1795103654` = `2026-11-19T15:54:14 UTC` (dibaca dengan `eth_getBlockByNumber` di chain `4663`)
- **Hardfork EVM:** Cancun (`PUSH0` aktif)
- **Token Dasar (Asset):** USDG (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 desimal)
- **Upstream Morpho Venue:** steakUSDG (`0xBeEff033F34C046626B8D0A041844C5d1A5409dd`, Morpho Vault V2, 21.808 byte kode, `shareDecimals` 18, `totalAssets` `538856055994280` = `538.856,055994` USDG, kas idle `27.024,457979` USDG = 5,02% pada pin). Penulisan lama `0xBeEff033b7F3B9B53c2f8c50Ed7E4E7fEf3c09dd` salah dua digit dan alamat itu tidak punya kode.
- **Yearn TokenizedStrategy Canonical:** `0x3110D1Eec90f0651C18e75AD37711A8777342504` (API 3.1.1)

---

## 2. Alamat Kontrak Terdeploy (Staging Rehearsal)

| Peran Kontrak | Alamat Terverifikasi | Deskripsi |
|---------------|----------------------|-----------|
| **Vault (avUSDG)** | `0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA` | ERC-4626 Allocator Vault API 3.1.1 |
| **Strategy** | `0xf070f5a2Ddf4d106502235597bd42fd9eDaF7bFE` | MorphoVaultStrategy (mengalokasikan ke steakUSDG) |
| **Governance Timelock** | `0x2C328D592819524F741A88A18572372CCE196782` | TimelockController 48 jam (role_manager vault) |
| **Emergency Timelock** | `0xf2Bf7C00B4696726B3c1f6E7b87d1a4acB050a8F` | Fast Lane Timelock 6 jam (ADR-12 force revoke) |
| **Accountant** | `0x47834D4241A7A5188A253CC0203AB49D4621a069` | Fee Accountant (10% performance fee, 0% management fee) |
| **Factory Vault** | `0x45d4fe781f3298982616778272e53ECC800Fc48F` | VaultV3 Factory |
| **Deployer** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Akun deployer (peran dilepas ke Timelock) |
| **Guardian** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Emergency pause & shutdown manager |
| **Keeper** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Report & allocate hot wallet |
| **Treasury** | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Fee recipient |

---

## 3. Log Bukti Transaksi On-Chain

### A. Deploy & Seeding Awal
- **Mode:** `stage` (melalui `packages/contracts/script/Deploy.s.sol`)
- **Seed Dead Shares:** `1.000,000000 USDG` dicetak ke vault untuk memitigasi ERC-4626 inflation attack.
- **File Rekaman Deploy:** `packages/contracts/deployments/4663.stage.json`

### B. Empat Incident Drills (Epic 6 Tiket 4)
- **Script Pelaksana:** `packages/contracts/script/ExecuteDrills.s.sol`
- **Dokumentasi Rinci:** `docs/DRILL_EVIDENCE.md` dan `docs/RUNBOOK.md`
  - **Drill D1 (Pause & Unpause):** Blok `26450185`. Saat pause: `maxWithdraw = 0`. Pasca unpause: penarikan 1 USDG sukses. Target MTTR < 15 mnt, aktual < 1 dtk simulasi.
  - **Drill D2 (Fast Lane Timelock 6 Jam):** Blok `26450195` (schedule) → `26457395` (execute). Strategi dicabut paksa, debt dikembalikan ke idle vault.
  - **Drill D3 (Liquidity Monitoring Snapshot):** Blok `26450185` & `26450195`. 3 metrik likuiditas terbaca dan terekonsiliasi.
  - **Drill D4 (Shutdown Vault):** Blok `26457395`. Vault shutdown permanen, `totalIdle == totalAssets = 1.099.000.000`.

### C. Transaksi Pengujian Pengguna Nyata (MetaMask E2E, fork lokal)

Semua hash di bagian ini dieksekusi di fork lokal anvil dan **tidak ada** di chain `4663` (lihat §0). Gas, status, dan perubahan saldo di bawah adalah hasil nyata dari eksekusi itu.
- **Alamat Pengguna:** `0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48`
- **Pembukaan Limit Deposit (Timelock):**
  - Tx: `0x3ac2e0711829cea185f3ca96fb0ac00c266d8cf37c3bc74e6047fd30d788e738`
  - Limit disetel menjadi `50.000 USDG`.
- **Transfer Gas ETH ke Pengguna:**
  - Tx: `0xe9d3f0905efb6f3f4792c91dcc2dbcdc1a12f0e946b6c8aff565269b449d572f` (10 ETH)
- **Persetujuan Allowance USDG (Approve):**
  - Tx: `0x7310aa12edd2950f621fa4d30264675894a9a70bfa1b61752537367c1136855c`
  - Nominal: `50.000,00 USDG`
- **Eksekusi Deposit Pengguna (1.000 USDG):**
  - Tx: `0xfa576557a5063be639a5b7be6b1bc247f671a79cd4d21eca0f0e8543d4ead1f5`
  - Blok: `118337652`
  - Gas Terpakai: `115.188`
  - Status: `0x1 (Sukses)`
  - Hasil: `1.000,000000 avUSDG` dicetak ke wallet pengguna.
  - TVL Vault Naik: `2.000,000000 USDG`.
- **Eksekusi Penarikan Pengguna (200 USDG — Rehearsal Dwiarah ERC-4626):**
  - Tx: `0xe9c8cd8d03aa752644e7b866c44ae57359602af0ef6c8f90c5bb47a5b5dc49db`
  - Blok: `118337656`
  - Parameter: `assets = 200.000.000`, `receiver = user`, `owner = user`, `max_loss = 0` (eksplisit)
  - Gas Terpakai: `93.779`
  - Status: `0x1 (Sukses)`
  - Hasil: `200,000000 avUSDG` di-burn, `200,000000 USDG` kembali ke saldo wallet pengguna.
  - Saldo Pengguna Terkini: `800,000000 avUSDG` dan `49.200,000000 USDG`.
  - TVL Vault Terkini: `1.800,000000 USDG` (`totalIdle == totalAssets == 1.800.000.000`).

### D. Handoff Tata Kelola Timelock 48 Jam (Tiket 7.3)
- **Penjadwalan Operasi (Delay 48 Jam / 172.800 dtk):**
  - Tx: `ExecuteGovernanceSchedule.s.sol` via Proposer Safe `0x235eAb...`
  - Calldata 1: `vault.accept_role_manager()`
  - Calldata 2: `strategy.acceptManagement()`
- **Eksekusi Pasca 48 Jam:**
  - Tx Eksekusi Vault Role Manager: `0x098f2f579b30833f099609e6c3a5aee339bc007e5620ab8510885a6ef1fe0779`
  - Tx Eksekusi Strategy Management: `0x08b1c7d0c00dbbc807f93bca87f2daade4ca33f3945d22179d730b57e6b66ad1`
  - Verifikasi On-Chain:
    - `vault.role_manager()` -> `0x2C328D592819524F741A88A18572372CCE196782` (Timelock 48h)
    - `strategy.management()` -> `0x2C328D592819524F741A88A18572372CCE196782` (Timelock 48h)
    - Otoritas EOA deployer sepenuhnya dicabut.

### E. Soak Test Keeper 7 Hari (Epic 6 Tiket 5)
- **Suite Pengujian:** `services/keeper/test/soak.test.ts`
- **Sifat bukti:** harness in-process, 168 siklus yang dijalankan dalam hitungan detik. Ini **bukan** soak 7 hari wall-clock; soak nyata di staging masih terbuka (tiket `story-soak-keeper`)
- **Hasil Pengujian:**
  - Uptime: 100% (168 siklus simulasi)
  - Transaksi gagal berulang: 0
  - False alerts: 0 (memenuhi kriteria <= 2/hari)
  - Rekonsiliasi harian: delta 0 (`totalIdle + totalDebt == totalAssets`)

---

## 4. Bukti Verifikasi Suite Penuh (verify-all.py)

**Run penuh, `2026-12-01`:** `python scripts/verify-all.py --with-fork --with-web-build` (tanpa `--no-bytecode`) selesai dalam `9m32s` dengan exit code 0 dan baris terakhir `ALL CHECKS PASSED`. Yang ikut dalam run itu: 101 unit test (11 suite), fork test pin `118337511` **11 test** (`VenueProbe` 7 + `VaultE2E` 4, dua suite `ok`), bukti bytecode `14/14`, dan `next build`.

```text
[ok] forge test (unit): Ran 11 test suites in 129.18s (130.82s CPU time): 101 tests passed, 0 failed, 0 skipped (101 total tests)
[ok] web build (next build): ƒ  (Dynamic)  server-rendered on demand
[ok] fork test (pin 118337511): local fork   : state at pin reproduced via https://rpc.solidrpc.io/...(redacted)
[ok] bytecode evidence (14 checks): 14/14 checks passed

ALL CHECKS PASSED
```

Batas run ini, dinyatakan supaya tidak dibaca lebih jauh dari yang dibuktikan: fork adalah anvil lokal di atas state chain `4663` pada pin `118337511` — ia membuktikan bytecode, wiring, dan perilaku terhadap state venue asli, **bukan** deploy di `4663` (lihat §0). Endpoint arsip publik memang berfluktuasi: satu percobaan `scripts/fork-test.py` pada hari yang sama berakhir `BLOCKED: no endpoint could serve the pinned state`, dan percobaan berikutnya hijau 11/11. Karena itu `--require-fork` adalah bentuk yang dipakai sebelum deploy, dan kegagalan jaringan tidak boleh dibaca sebagai kegagalan kode.

**Run parsial, `2026-12-01`:** `python scripts/verify-all.py --no-bytecode --with-web-build` (commit `6ae57da` + perbaikan gate yang menyertai commit ini). Log ini bukan gate penuh: `test/fork/*` dan bukti bytecode tidak jalan, dan ringkasan mencetak itu apa adanya.

```text
[ok] no secrets tracked: tidak ada rahasia ter-commit
[ok] vendored dependencies: OK: 603 vendored files verified, impl 0x3110D1Eec90f0651C18e75AD37711A8777342504, API 3.1.1
[ok] generated interfaces: OK: 2 generated interfaces up to date
[ok] sdk abi matches artifact: sdk abi matches the artifact
[ok] forge build: No files changed, compilation skipped
[ok] forge fmt --check
[ok] forge test (unit): Ran 11 test suites in 87.01s (87.77s CPU time): 101 tests passed, 0 failed, 0 skipped (101 total tests)
[ok] sdk tests: ℹ duration_ms 2009.5
[ok] indexer + data plane tests: [ok] indexer schema tests   (32 test)
[ok] keeper tests: ℹ duration_ms 6804.3                     (22 test)
[ok] web typecheck
[ok] web tests: ℹ duration_ms 13106.1                       (90 test)
[ok] web build (next build): ƒ  (Dynamic)  server-rendered on demand
[!!] fork test NOT RUN: this run says nothing about test/fork/*
[!!] bytecode evidence NOT RUN: --no-bytecode was passed

ALL CHECKED CHECKS PASSED — 2 GATE(S) NOT RUN:
  - fork test (test/fork/*, pin 118337511)
  - bytecode evidence (14 checks)
This is a partial result, not a green gate.
```

Angka yang **tidak** berubah dan tidak boleh dipakai sebagai pengganti angka lama di atas: 101 unit test, 11 fork test, 32 indexer/data-plane, 22 keeper, 90 web, 10.000 run invariant. Blok log lama di bawah disimpan sebagai riwayat (angka di dalamnya sudah basi: 86 web test, dan ringkasan `ALL CHECKS PASSED` untuk run `--no-bytecode`):

```text
[ok] no secrets tracked: tidak ada rahasia ter-commit
[ok] vendored dependencies: OK: 603 vendored files verified, impl 0x3110D1Eec90f0651C18e75AD37711A8777342504, API 3.1.1
[ok] generated interfaces: OK: 2 generated interfaces up to date
[ok] sdk abi matches artifact: sdk abi matches the artifact
[ok] forge build: No files changed, compilation skipped
[ok] forge fmt --check
[ok] forge test (unit): Ran 11 test suites: 101 tests passed, 0 failed, 0 skipped
[ok] sdk tests: pass (amounts, previews, writes, abi)
[ok] indexer + data plane tests: 32 tests pass
[ok] keeper tests: 22 tests pass
[ok] web typecheck: OK
[ok] web tests: 86 tests pass
ALL CHECKS PASSED
```

> **Koreksi `2026-12-01`:** baris `ALL CHECKS PASSED` di blok di atas adalah bug gate, bukan hasil: `--no-bytecode` melewati bukti bytecode dan tidak menjalankan `test/fork/*`, tetapi ringkasannya tidak membedakan "lulus" dari "tidak jalan". `scripts/verify-all.py` sekarang mencetak `ALL CHECKED CHECKS PASSED — N GATE(S) NOT RUN` untuk run parsial dan mengembalikan exit code 1 bila `--require-fork` diminta. Angka `86` juga basi; suite web sekarang 90 test di sepuluh berkas.

---

## 5. Bukti Rekonsiliasi (Mathematical Integrity)

Pembacaan `eth_call` di **fork anvil** pada tinggi `118337653` (kanonik chain `4663`: hash `0xf64c2e4bf0e472eb65dddd3170dd4bb77a92fc55fc92bacf5b59cc929ef560b9`, timestamp `1795103668` = `2026-11-19T15:54:28Z`, dibaca `2026-12-01`). Tinggi blok itu nyata; vaultnya tidak — `eth_getCode` di chain `4663` untuk alamat vault mengembalikan `0x`, jadi angka di bawah hanya sah sebagai pembacaan state fork.
- `totalAssets`: `2.000.000.000` base units (2.000,00 USDG)
- `totalIdle`: `2.000.000.000` base units (2.000,00 USDG)
- `totalDebt`: `0` base units (0,00 USDG)
- **Persamaan Invariant:** `totalIdle + totalDebt == totalAssets` (**2.000 == 2.000**, drift 0 bps).
- `totalSupply`: `2.000.000.000` base units (2.000,00 avUSDG)
- `pricePerShare`: `1.000.000` base units (1,000000 USDG per share)

---

## 6. Integrasi Antarmuka Web App & Portofolio

Sama seperti §3: semua angka di bagian ini berasal dari fork anvil, bukan dari vault terdeploy di `4663`. `docs/WEB_APP.md` §8 mencatat batasnya — deposit/withdraw belum pernah dijalankan terhadap wallet nyata karena vault terdeploy belum ada, dan `apps/web/src/config/vaults.ts` masih fase `research`.

- **Katalog Vault (`/`):** Menampilkan vault staging fase `research` dengan provenance blok.
- **Detail Vault (`/vaults/[address]`):** Membaca live on-chain numbers, alokasi strategi, dan peran Timelock dari API staging.
- **Deposit Form (`/vaults/[address]/deposit`):** Validasi kuota on-chain, pengecekan allowance, dan penyerahan transaksi viem melalui `writeContract`.
- **Portofolio Pengguna (`/portfolio`):** Menampilkan kepemilikan riil `1.000,00 avUSDG` milik `0x235eAb...07A48` dengan opsi unduh CSV bukti transaksi.
