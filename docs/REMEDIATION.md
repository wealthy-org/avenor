# REMEDIATION — Register Temuan Keamanan Internal & Bukti Regresi (Internal Registry, Audit-Ready)

Dokumen ini mendokumentasikan secara formal **register temuan keamanan internal (Critical, High, Medium, Low)** yang ditemukan selama fase peninjauan arsitektur, threat modeling adversary, audit internal tim BMAD, dan integrasi upstream, beserta **solusi kode (mitigasi)** dan **test regresi** yang membuktikannya.

> [!NOTE]
> **Status Dokumen: Register Internal Tim BMAD (Audit-Ready)**
> Seluruh temuan di bawah ini diidentifikasi, dimitigasi, dan diverifikasi dengan 320 automated tests oleh tim internal BMAD. Repositori ini telah dipersiapkan secara menyeluruh (*audit-ready*) untuk peninjauan keamanan independen pihak ketiga formal (*independent external security review*) sebelum pembukaan deposit publik pada mainnet (lihat `docs/BASELINE.md` dan `docs/AUDIT_SCOPE.md`).

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
  - Kontrak [MorphoVaultStrategy.sol](../packages/contracts/src/strategies/MorphoVaultStrategy.sol) mengimplementasikan `_freeFunds` yang mengukur pergerakan saldo kas riil (`USDG.balanceOf(strategy)`).
  - Jika kas yang diterima kurang dari yang diminta, fungsi langsung me-revert dengan custom error `VenueLiquidityShortfall(requested, available)` alih-alih mencatat kerugian palsu.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/MorphoVaultStrategy.t.sol::test_venueWithdrawLimitIsMeasuredNotReadFromMaxWithdraw`
  - `packages/contracts/test/unit/MaliciousVenue.t.sol` (4 skenario manipulasi nilai kembalian venue).

---

### 2.4 [HIGH-01] Kerentanan Share Inflation pada Vault Kosong (Tanpa Virtual Shares)
- **Sumber:** `VaultV3.vy` baris `_convert_to_shares` (tidak memiliki fitur virtual shares atau decimals offset).
- **Dampak:** Depositor pertama rentan terhadap eksploitasi donasi frontrunning (ERC-4626 inflation attack).
- **Remediasi (ADR-7):**
  - Skrip deploy `Deploy.s.sol` melakukan seeding otomatis sebesar 1.000 USDG yang langsung ditransfer permanen ke `0x000000000000000000000000000000000000dEaD` sebagai *dead shares*.
  - Batas deposit dikendalikan secara on-chain via `DepositCapHook.sol` serta penegakan batas minimum deposit 10 USDG (`10_000_000n` micro-USDG) pada layer antarmuka web dan SDK untuk menolak donasi bernominal mikro.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/DeployScript.t.sol::test_seedMintsDeadSharesThenClosesTheDoor` (assert transfer dead shares saat bootstrap).
  - `packages/contracts/test/unit/DepositCapHookDeploy.t.sol` (validasi pembatasan deposit hook).
  - `apps/web/test/deposit.test.ts` (assert penolakan deposit di bawah batas minimum 10 USDG).

---

### 2.5 [HIGH-02] Anomali `Accountant.sol` (Management Fee Memotong Pokok Saat `gain == 0`)
- **Sumber:** `src/accountants/Accountant.sol:267-269` upstream Yearn Periphery.
- **Dampak:** Jika `maxFee > 0`, fee manajemen tetap ditagih dan memotong saldo pokok pengguna bahkan saat strategi tidak menghasilkan laba.
- **Remediasi (ADR-10 & FEE_CONFIG.md):**
  - Mengunci `managementFee = 0%` (0 bps) secara permanen pada konfigurasi Accountant v1.
  - Hanya memberlakukan `performanceFee = 10%` (1.000 bps) atas laba riil, dibatasi oleh `maxGain = 5%` dan `maxLoss = 2%`.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/AccountantFees.t.sol` (memastikan zero management fee dan revert pada report melebihi healthcheck).

---

### 2.6 [HIGH-03] Eskalasi Peran Otomatis Pasca `shutdown_vault` (`DEBT_MANAGER`)
- **Sumber:** `VaultV3.vy:1853` (`self.roles[caller] = self.roles[caller] | DEBT_MANAGER`).
- **Dampak:** Siapa pun pemanggil yang memegang peran `EMERGENCY_MANAGER` (Guardian Safe 2/3) otomatis mendapatkan peran alokasi dana (`DEBT_MANAGER`) setelah mematikan vault.
- **Remediasi:**
  - Mendokumentasikan perilaku ini secara eksplisit pada `docs/ROLE_PERMISSION_MATRIX.md`.
  - Mengunci aturan operasional bahwa wewenang alokasi pasca-shutdown hanya boleh digunakan untuk menarik dana strategi kembali menjadi kas idle (`decrease_debt`), bukan untuk mendanai strategi baru.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/RoleEnforcement.t.sol::test_shutdownVaultGrantsDebtManagerToTheCaller`.

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
  - Guardian Safe bertindak sebagai proposer dan executor timelock 6 jam ini, membatasi kerusakan instan namun tetap 8x lebih cepat dari timelock 48 jam.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/RoleEnforcement.t.sol::test_forceRevokeSitsOnTheBoundedFastLane`
  - `packages/contracts/test/unit/RoleEnforcement.t.sol::test_guardianCanForceRevokeThroughTheFastLaneInSixHours`

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
  - SDK dan Web App mengklasifikasikan kondisi ini sebagai kondisi blocker transaksi (`idleCoverageBps` dan `blockers`) agar pengguna tidak kehilangan dana tanpa menerima share.
- **Bukti Test Regresi:**
  - `apps/web/test/deposit.test.ts` (penanganan kondisi supply tanpa aset dan penolakan transaksi).

---

### 2.11 [LOW-01] Residu Hak Akses Deployer Pasca Eksekusi
- **Sumber:** `Deploy.s.sol`.
- **Dampak:** Kunci broadcaster deployer yang bocor pasca deployment berpotensi menambah strategi baru bila izin tidak dicabut.
- **Remediasi:**
  - Skrip deploy memanggil `set_role(actor, 0)` sebelum menyerahkan `role_manager` ke timelock 48 jam.
  - Diuji secara menyeluruh dalam simulasi eksekusi timelock di mode produksi.
- **Bukti Test Regresi:**
  - `packages/contracts/test/unit/DeployScript.t.sol::test_prodUsesTimelockAsRoleManagerAndGrantsNothing` (memvalidasi 12-call proposal batch schedule & execute).

---

### 2.12 [LOW-02] Kesalahan Pembacaan Alamat Hex Berleading Zero (Off-by-Two)
- **Sumber:** Helper `decodeAddress` pada layer data plane indexer.
- **Dampak:** Pemotongan string hex `slice(2, 66)` lalu `slice(24)` menggeser dua karakter pada alamat berleading zero.
- **Remediasi:**
  - Standarisasi parser alamat menggunakan `addressWordResult` yang memaksa validasi 40 karakter hex lowercase.
- **Bukti Test Regresi:**
  - `services/indexer/test/reconcile.test.ts` & `apps/web/test/api.test.ts`.

---

---

## 4. Remediasi Sprint 2 (Hardening Layanan, Proteksi Alur, & Kelengkapan Deliverables)

Berdasarkan audit komprehensif GAP Analysis (`GAP_ANALYSIS_Avenor.md`), seluruh temuan Sprint 2 telah dimitigasi dan diuji:

### 4.1 [P0 / K-2 & D-1] Sanitasi Kunci DeployTestnet & Pola Fail-Closed
- **Masalah:** Penggunaan `makeAddr("avenor.testnet.keeper")` dan teks publik serupa menghasilkan private key deterministik yang dapat dihitung pihak mana pun.
- **Remediasi:** `DeployTestnet.s.sol` mewajibkan alamat pemilik Safe dan Keeper nyata melalui environment variables (`SAFE_GOVERNANCE_OWNERS`, `SAFE_GUARDIAN_OWNERS`, `SAFE_TREASURY_OWNERS`, `KEEPER_ADDRESS`, `GUARDIAN_ADDRESS`, `TREASURY_ADDRESS`) ketika dijalankan pada rantai selain Anvil lokal (`chainId != 31337`). Skrip langsung revert jika dijalankan pada rantai publik tanpa variabel lingkungan ini.
- **Bukti Regresi:** `packages/contracts/test/unit/DeployTestnet.t.sol::test_testnetRejectsMissingKeysOnChain46630` (PASS).

### 4.2 [P0 / S-1, S-3, S-10] Hardening Konfirmasi Receipt & In-Flight Guard Keeper
- **Masalah:** Keeper menganggap pekerjaan selesai setelah menerima hash transaksi tanpa konfirmasi receipt blok, berisiko tabrakan nonce atau duplikasi pengiriman.
- **Remediasi:** Antarmuka `KeeperSender` dan implementasi `ViemSender` dilengkapi `waitForReceipt(txHash)`. `keeper.ts` memverifikasi receipt status (`reverted` memicu alert failure) dan memperbarui `blockNumber` aktual sebelum memanggil callback `job.onSent()`. In-flight guard mencegah perencanaan alokasi baru saat transaksi sebelumnya masih pending.
- **Bukti Regresi:** `services/keeper/test/keeper.test.ts` (test kegagalan revert on-chain dan integrasi `waitForReceipt`, 24/24 PASS).

### 4.3 [P1 / K-8] Deposit Slippage Protection (minShares) & Quote Expiry (TTL 60s)
- **Masalah:** `prepareDeposit` pada SDK dan antarmuka web belum memiliki batas minimum shares (slippage tolerance) dan kuotasi tidak memiliki TTL.
- **Remediasi:** SDK menambahkan `minShares` pada `DepositParams` dan melempar `SlippageExceededError` jika kuotasi dilanggar. `apps/web/src/lib/deposit.ts` menghitung `minShares` (default 50 bps slippage), menetapkan `quoteTimestamp`, dan melempar `DepositError("quote_expired")` jika kuotasi berumur > 60 detik. `DepositForm.tsx` menampilkan baris visual batas minimum shares.
- **Bukti Regresi:** `apps/web/test/deposit.test.ts` (2 test regresi quote expired dan slippage breach, 119/119 PASS).

### 4.4 [P1 / S-11 & S-14] Skema Database role_events & Catatan Rekonsiliasi Indexer
- **Masalah:** Tabel `role_events` memiliki PK hanya pada `(chain_id, tx_hash, log_index)`, sehingga jika satu log `RoleSet` mengubah multi-bit, bit berikutnya terabaikan karena `ON CONFLICT DO NOTHING`. Rumus rekonsiliasi juga perlu penegasan perlakuan arus kas deposit.
- **Remediasi:** Migrasi `0002_role_events_role_bit_pk.sql` memperketat `role_bit NOT NULL` dan memperluas PK menjadi `(chain_id, tx_hash, log_index, role_bit)`. `ingest.ts` memperbarui klausa `ON CONFLICT`. `reconcile.ts` menambahkan dokumentasi arsitektural bahwa deposit/withdraw telah tercakup dalam pergerakan `totalAssets` snapshot on-chain dan tidak boleh diduplikasi.
- **Bukti Regresi:** `services/indexer/test/migrations.test.ts` (test multi-bit pada satu log logis, PASS) dan `services/indexer/test/reconcile.test.ts` (S-11 anchor snapshot test, PASS).

### 4.5 [P1 / W-7 & D-22] Route Web /docs & Kelengkapan Dokumen Operasional
- **Masalah:** Rute `/docs` belum ada (404), dan 3 dokumen operasional mandatory brief §17 belum lengkap.
- **Remediasi:** Membangun rute `/docs` pada `apps/web/app/docs/page.tsx` (server-rendered statis) yang merangkum Arsitektur, Konfigurasi Fee, Matriks Wewenang Role, Limitasi, dan Referensi Operasional. Menyusun 3 dokumen formal: `docs/SIGNER_POLICY.md`, `docs/BACKUP_RECOVERY.md`, dan `docs/KNOWN_LIMITATIONS.md`.
- **Bukti Regresi:** `apps/web/test/docs.test.ts` (memverifikasi seluruh section dokumen ter-render dengan sempurna, PASS).

