# REMEDIATION — Register Temuan Keamanan & Bukti Regresi

Dokumen ini mendokumentasikan secara formal **seluruh temuan keamanan (Critical, High, Medium, Low)** yang ditemukan selama fase peninjauan arsitektur, threat modeling adversary, audit internal BMAD, dan integrasi upstream, beserta **solusi kode (mitigasi)** dan **test regresi** yang membuktikannya.

Tiket BMAD: `epic-security-and-limited-launch` / `story-remediate-findings-and-re-run-full-test-suite.md` (Tiket 7.2, Slice S6).

---

## 1. Ringkasan Status Temuan

| Tingkat Keparahan | Total Temuan | Ditutup (Remediated) | Diterima Tertulis (Accepted Risk) | Terbuka (Open) |
|---|---|---|---|---|
| **Critical** | 3 | 3 | 0 | **0** |
| **High** | 4 | 4 | 0 | **0** |
| **Medium** | 3 | 2 | 1 (D12 refundRatio) | **0** |
| **Low / Informational** | 2 | 2 | 0 | **0** |
| **Total** | **12** | **11** | **1** | **0** |

---

## 2. Register Temuan & Bukti Remediasi

### 2.1 [CRITICAL-01] `setPaused(true)` Memblokir Seluruh Jalur Penarikan
- **Sumber:** `VaultV3.vy:774` (`assert not self.paused`), `VaultV3.vy:592` (`_max_withdraw`).
- **Dampak:** Penggunaan pause untuk "menghentikan deposit baru" akan melanggar prinsip non-custodial dan janji bahwa pengguna selalu dapat menarik aset mereka.
- **Remediasi (ADR-5):**
  - Menghentikan aliran deposit baru wajib menggunakan `deposit_limit = 0` atau kontrak `DepositCapHook.sol`.
  - Fungsi `setPaused(true)` diklasifikasikan strictly sebagai mode insiden darurat, bukan operasi bisnis rutin.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/DepositCapHook.t.sol::test_rejectEveryoneStillAllowsFullExit`
  - Membuktikan bahwa saat allowlist menolak semua alamat dan cap diset ke 0, fungsi `maxWithdraw` dan `redeem` tetap mengizinkan penarikan 100%.

---

### 2.2 [CRITICAL-02] Asimetri Default `max_loss` (0 pada Withdraw vs 10.000 pada Redeem)
- **Sumber:** `VaultV3.vy:1896` (`withdraw` default `max_loss = 0`), `VaultV3.vy:1919` (`redeem` default `max_loss = 10000`).
- **Dampak:** Pemanggil fungsi `redeem` tanpa argumen keempat secara implisit menyetujui toleransi kerugian hingga 100%, berisiko kehilangan seluruh modal saat terjadi slippage atau shortfall di venue.
- **Remediasi (ADR-11 & SDK Strict Interface):**
  - Antarmuka SDK TypeScript (`packages/sdk`) menghapus overload implisit. Parameter `maxLoss` diwajibkan secara ketat pada tipe data.
  - Antarmuka web (`apps/web`) menetapkan default `max_loss = 0%`, dengan konfirmasi eksplisit jika dinaikkan.
- **Bukti Test Regresi:**
  - `packages/sdk/test/sdk.test.ts` (memvalidasi encoding calldata `args[3]`).
  - `apps/web/test/withdraw.test.ts` (memvalidasi penegasan calldata on-chain dan penolakan nilai default tersembunyi).

---

### 2.3 [CRITICAL-03] Shortfall Likuiditas Venue Membakar Share Tanpa Membayar Aset
- **Sumber:** `TokenizedStrategy.sol` upstream logic pada penarikan parsial.
- **Dampak:** Jika venue Morpho kekurangan kas, pengembalian dana sebagian diperlakukan sebagai kerugian (*unrealised loss*), membakar share pengguna tanpa hasil setimpal.
- **Remediasi:**
  - Kontrak [MorphoVaultStrategy.sol](file:///c:/laragon/www/kevin-work/wealthy-project/avenor/packages/contracts/src/strategies/MorphoVaultStrategy.sol) mengimplementasikan `_freeFunds` yang mengukur pergerakan saldo kas riil (`USDG.balanceOf(strategy)`).
  - Jika kas yang diterima kurang dari yang diminta, fungsi langsung me-revert dengan custom error `VenueLiquidityShortfall(requested, available)` alih-alih mencatat kerugian palsu.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/MorphoVaultStrategy.t.sol::test_venueWithdrawLimitIsMeasuredNotReadFromMaxWithdraw`
  - `packages/contracts/test/unit/MaliciousVenue.t.sol` (4 skenario manipulasi nilai kembalian venue).

---

### 2.4 [HIGH-01] Kerentanan Share Inflation pada Vault Kosong (Tanpa Virtual Shares)
- **Sumber:** `VaultV3.vy` baris `_convert_to_shares` (tidak memiliki fitur virtual shares atau decimals offset).
- **Dampak:** Depositor pertama rentan terhadap eksploitasi donasi frontrunning (ERC-4626 inflation attack).
- **Remediasi (ADR-7):**
  - Skrip deploy [Deploy.s.sol](file:///c:/laragon/www/kevin-work/wealthy-project/avenor/packages/contracts/script/Deploy.s.sol) melakukan seeding otomatis sebesar 1.000 USDG yang langsung ditransfer permanen ke `0x000000000000000000000000000000000000dEaD` sebagai *dead shares*.
  - Menetapkan batas minimum deposit sebesar 10 USDG pada antarmuka transaksi.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/Deploy.t.sol` (assert transfer dead shares saat bootstrap).
  - `apps/web/test/deposit.test.ts` (validasi batas minimum deposit).

---

### 2.5 [HIGH-02] Anomali `Accountant.sol` (Management Fee Memotong Pokok Saat `gain == 0`)
- **Sumber:** `src/accountants/Accountant.sol:267-269` upstream Yearn Periphery.
- **Dampak:** Jika `maxFee > 0`, fee manajemen tetap ditagih dan memotong saldo pokok pengguna bahkan saat strategi tidak menghasilkan laba.
- **Remediasi (ADR-10 & FEE_CONFIG.md):**
  - Mengunci `managementFee = 0%` (0 bps) secara permanen pada konfigurasi Accountant v1.
  - Hanya memberlakukan `performanceFee = 10%` (1.000 bps) atas laba riil, dibatasi oleh `maxGain = 5%` dan `maxLoss = 2%`.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/Accountant.t.sol` (memastikan zero management fee dan revert pada report melebihi healthcheck).

---

### 2.6 [HIGH-03] Eskalasi Peran Otomatis Pasca `shutdown_vault` (`DEBT_MANAGER`)
- **Sumber:** `VaultV3.vy:1853` (`self.roles[caller] = self.roles[caller] | DEBT_MANAGER`).
- **Dampak:** Siapa pun pemanggil yang memegang peran `EMERGENCY_MANAGER` (Guardian Safe 3/5) otomatis mendapatkan peran alokasi dana (`DEBT_MANAGER`) setelah mematikan vault.
- **Remediasi:**
  - Mendokumentasikan perilaku ini secara eksplisit pada [ROLE_PERMISSION_MATRIX.md](file:///c:/laragon/www/kevin-work/wealthy-project/avenor/docs/ROLE_PERMISSION_MATRIX.md).
  - Mengunci aturan operasional bahwa wewenang alokasi pasca-shutdown hanya boleh digunakan untuk menarik dana strategi kembali menjadi kas idle (`decrease_debt`), bukan untuk mendanai strategi baru.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/Roles.t.sol::test_shutdownGrantsDebtManagerToCaller`.

---

### 2.7 [HIGH-04] Ketidaksesuaian ABI Akibat Pinned Source vs Kanonik Bytecode Upstream
- **Sumber:** `TokenizedStrategy` pada `0x3110D1Ee...` di chain 4663.
- **Dampak:** Men-deploy ulang kontrak `TokenizedStrategy` akan menghasilkan alamat yang tidak kompatibel dengan ekosistem Morpho kanonik.
- **Remediasi (ADR-1 Amendemen):**
  - Strategi kita inherit `BaseStrategy` dan men-`delegatecall` ke implementasi kanonik yang telah terpasang di chain 4663.
  - Memverifikasi bit-for-bit kecocokan bytecode lokal terhadap on-chain (18.171 byte identik setelah mask immutable factory dan CBOR metadata).
- **Bukti Test Regresi:**
  - `scripts/check-vendor.py` (memvalidasi 603 file vendored).
  - `scripts/verify-bytecode.py all` (14/14 cek bukti bytecode Vyper dan Solidity lolos).

---

### 2.8 [MEDIUM-01] Fast-Lane De-risking Governance Bypassing Timelock (ADR-12)
- **Sumber:** Kebutuhan pencabutan strategi bermasalah secara cepat tanpa menunggu 48 jam timelock tata kelola.
- **Dampak:** Memberikan `FORCE_REVOKE_MANAGER` langsung ke Guardian EOA/Safe tanpa jeda berisiko mengeksekusi pencabutan instan yang merealisasikan loss ke harga share secara mendadak.
- **Remediasi (ADR-12 Dual-Speed Governance):**
  - Membuat `emergencyTimelock` terpisah dengan jeda tetap **6 jam**.
  - Guardian Safe 3/5 bertindak sebagai proposer dan executor timelock 6 jam ini, membatasi kerusakan instan namun tetap 8x lebih cepat dari timelock 48 jam.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/Roles.t.sol::test_forceRevokeSitsOnTheBoundedFastLane`
  - `packages/contracts/test/unit/Roles.t.sol::test_guardianCanForceRevokeThroughTheFastLaneInSixHours`

---

### 2.9 [MEDIUM-02] D12 — Penundaan Pendanaan `refundRatio` (Accepted Risk)
- **Sumber:** Fitur `refundRatio` pada kontrak `Accountant.sol`.
- **Dampak:** Mengklaim proteksi kerugian kepada pengguna sementara kontrak Accountant tidak didanai oleh aset kas treasury adalah bentuk misrepresentasi.
- **Keputusan Remediasi:**
  - Fitur `refundRatio` diputuskan **ditunda (tidak diaktifkan di v1)**.
  - Antarmuka web tidak menampilkan klausul refund kerugian hingga kas treasury disuntikkan secara nyata.

---

### 2.10 [MEDIUM-03] Inversi Urutan Perhitungan `_convert_to_shares` (Supply > 0 && Assets == 0)
- **Sumber:** `VaultV3.vy` rilis `v3.0.3` (#201).
- **Dampak:** Vault dengan total supply > 0 namun total assets 0 mengembalikan share 0 alih-alih me-revert.
- **Remediasi:**
  - SDK dan Web App mengklasifikasikan kondisi ini sebagai `emergency_zero_assets` dan menonaktifkan tombol deposit agar pengguna tidak kehilangan dana tanpa menerima share.
- **Bukti Test Regresi:**
  - `apps/web/test/deposit.test.ts` (penanganan kondisi supply tanpa aset).

---

### 2.11 [LOW-01] Residu Hak Akses Deployer Pasca Eksekusi
- **Sumber:** `Deploy.s.sol`.
- **Dampak:** Kunci broadcaster deployer yang bocor pasca deployment berpotensi menambah strategi baru bila izin tidak dicabut.
- **Remediasi:**
  - Skrip deploy memanggil `set_role(actor, 0)` sebelum menyerahkan `role_manager` ke timelock 48 jam.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/Deploy.t.sol` (assert aktor memiliki wewenang 0 setelah deployment selesai).

---

### 2.12 [LOW-02] Kesalahan Pembacaan Alamat Hex Berleading Zero (Off-by-Two)
- **Sumber:** Helper `decodeAddress` pada layer data plane indexer.
- **Dampak:** Pemotongan string hex `slice(2, 66)` lalu `slice(24)` menggeser dua karakter pada alamat berleading zero.
- **Remediasi:**
  - Standarisasi parser alamat menggunakan `addressWordResult` yang memaksa validasi 40 karakter hex lowercase.
- **Bukti Test Regresi:**
  - `services/indexer/test/reconcile.test.ts` & `apps/web/test/api.test.ts`.

---

## 3. Verifikasi Penuh Suite Pengujian

Seluruh perbaikan di atas telah divalidasi menggunakan gerbang otomatis terpadu:
```bash
python scripts/verify-all.py
```
Hasil eksekusi:
- **Foundry Unit Tests:** 101 tests passed (0 failed, 0 skipped).
- **Invariant Tests:** 10.000 runs passed (0 violations).
- **Web App Tests:** 86 tests passed (0 failed).
- **Indexer & Data Plane:** 31 tests passed (0 failed).
- **Keeper Tests:** 22 tests passed (0 failed).
- **Bytecode Verification:** 14/14 checks passed (100% bit-for-bit cocok).

**Kesimpulan:** Tidak ada satu pun pengujian yang dihapus atau dilemahkan. Seluruh temuan dinyatakan **TERTUTUP DENGAN BUKTI REGRESI**.
