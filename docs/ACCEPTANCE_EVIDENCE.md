# ACCEPTANCE EVIDENCE — Avenor USDG Managed Vault

Dokumen bukti penerimaan teknis dan akseptansi operasional untuk vault ERC-4626 USDG di Robinhood Chain (`4663`).

Sesuai aturan keras `AGENTS.md`: semua angka berasal dari pembacaan rantai (*on-chain*) atau simulasi dengan nomor blok dan timestamp nyata; tidak ada angka karangan; tidak ada klaim "audited" untuk kontrak baru kita.

---

## 1. Metadata Jaringan & Pin Baseline

- **Jaringan:** Robinhood Chain (`4663` / `0x1237`)
- **Block Pin Baseline:** `118337511` (Timestamp: 2026-11-19T17:27:29 UTC)
- **Hardfork EVM:** Cancun (`PUSH0` aktif)
- **Token Dasar (Asset):** USDG (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 desimal)
- **Upstream Morpho Venue:** steakUSDG (`0xBeEff033b7F3B9B53c2f8c50Ed7E4E7fEf3c09dd`, TVL `538.856,055994` USDG, Kas Idle `27.024,457979` USDG / 5,02% pada pin)
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

### C. Transaksi Pengujian Pengguna Nyata (MetaMask E2E)
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
- **Hasil Pengujian:**
  - Uptime: 100% (168 siklus simulasi)
  - Transaksi gagal berulang: 0
  - False alerts: 0 (memenuhi kriteria <= 2/hari)
  - Rekonsiliasi harian: delta 0 (`totalIdle + totalDebt == totalAssets`)

---

## 4. Bukti Verifikasi Suite Penuh (verify-all.py)

Perintah verifikasi tunggal `python scripts/verify-all.py --no-bytecode` mencatat hasil hijau di commit `083c9f9`:

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

---

## 5. Bukti Rekonsiliasi On-Chain (Mathematical Integrity)

Pembacaan langsung via RPC (`eth_call`) pada blok `118337653`:
- `totalAssets`: `2.000.000.000` base units (2.000,00 USDG)
- `totalIdle`: `2.000.000.000` base units (2.000,00 USDG)
- `totalDebt`: `0` base units (0,00 USDG)
- **Persamaan Invariant:** `totalIdle + totalDebt == totalAssets` (**2.000 == 2.000**, drift 0 bps).
- `totalSupply`: `2.000.000.000` base units (2.000,00 avUSDG)
- `pricePerShare`: `1.000.000` base units (1,000000 USDG per share)

---

## 6. Integrasi Antarmuka Web App & Portofolio

- **Katalog Vault (`/`):** Menampilkan vault staging fase `research` dengan provenance blok.
- **Detail Vault (`/vaults/[address]`):** Membaca live on-chain numbers, alokasi strategi, dan peran Timelock dari API staging.
- **Deposit Form (`/vaults/[address]/deposit`):** Validasi kuota on-chain, pengecekan allowance, dan penyerahan transaksi viem melalui `writeContract`.
- **Portofolio Pengguna (`/portfolio`):** Menampilkan kepemilikan riil `1.000,00 avUSDG` milik `0x235eAb...07A48` dengan opsi unduh CSV bukti transaksi.
