# LIFECYCLE_EVIDENCE — Avenor USDG Vault

Dokumen bukti operasional siklus dana (lifecycle) dan drill darurat untuk Avenor USDG Managed Vault di Robinhood Chain (`4663` / Testnet `46630`), memenuhi persyaratan **Brief §15**, **Brief §16 Tahap D & E**, serta temuan **AV-3** pada `GAP_ANALYSIS_Avenor.md`.

---

## 1. Ringkasan Eksekusi Drill Operasional

Seluruh skenario siklus dana, penegakan invarian kerugian (*loss enforcement*), pembekuan deposit (*deposit freeze*), jeda darurat (*emergency pause*), dan pengalokasian multi-strategi (*multistrategy allocation*) telah diimplementasikan dalam test suite formal dan skrip otomasi yang dapat dieksekusi secara berulang:

| ID | Skenario Drill | Status | Bukti Kode & Test |
|---|---|:---:|---|
| **DRILL-1** | Normal Lifecycle Round-Trip | ✅ PASS | `LifecycleDrillTest::test_lifecycle_normal_round_trip` |
| **DRILL-2** | Loss Enforcement & Max Loss Protection | ✅ PASS | `LifecycleDrillTest::test_lifecycle_loss_enforcement_drill` |
| **DRILL-3** | Operational Deposit Freeze | ✅ PASS | `LifecycleDrillTest::test_operational_deposit_freeze_drill` |
| **DRILL-4** | Emergency Pause vs Unpause | ✅ PASS | `LifecycleDrillTest::test_emergency_pause_and_unpause_drill` |
| **DRILL-5** | Role Authorization Enforcements | ✅ PASS | `LifecycleDrillTest::test_unauthorized_role_rejections` |
| **STAGE-D** | Multistrategy Reallocation & Cascading Queue | ✅ PASS | `MultiStrategyAllocationTest` (4/4 tests passed) |

Eksekusi cepat melalui skrip runner:
```bash
python scripts/testnet-lifecycle-drill.py
```

---

## 2. Rincian Skenario & Invarian On-Chain

### DRILL-1: Normal Lifecycle Round-Trip (Brief §15)
Membuktikan aliran modal dari awal hingga akhir tanpa kebocoran aset atau ketidaksesuaian desimal:
1. **Deposit:** Pengguna mendepositkan `100.000` USDG (6 desimal). Karena harga per share awal 1:1, pengguna menerima tepat `100.000` shares (`avUSDG`). Seluruh dana masuk ke kas `totalIdle`.
2. **Alokasi (`update_debt`):** Keeper dengan wewenang `DEBT_MANAGER` mengalokasikan `80.000` USDG ke `MorphoVaultStrategy`. Kas idle berkurang menjadi `20.000` USDG, dan `totalDebt` menjadi `80.000` USDG.
3. **Yield & Report:** Venue menghasilkan yield `3.000` USDG. Keeper memicu `vault.process_report(strategy)`.
   - Accountant menghitung performance fee 10% = `300` USDG.
   - Shares fee diterbitkan ke kontrak Accountant (untuk didistribusikan ke Treasury Safe).
   - Keuntungan sisa `2.700` USDG dikunci di vault untuk di-unlock secara linear selama 7 hari (`profitMaxUnlockTime`).
4. **Penarikan Parsial (`withdraw`):** Setelah periode unlock, pengguna menarik `20.000` USDG dengan `max_loss = 0`. Kas idle `20.000` USDG digunakan sepenuhnya tanpa perlu menarik dari strategi.
5. **Redeem Penuh (`redeem`):** Pengguna menukar seluruh sisa shares dengan `max_loss = 0`. Vault secara otomatis melikuidasi posisi di strategi dan membayarkan pokok awal ditambah net yield yang diperoleh.

### DRILL-2: Loss Enforcement & Perlindungan `max_loss` (Brief §9 & K-8)
Membuktikan perlindungan terhadap kerugian tidak terealisasi (*unrealised loss*):
1. Ketika venue mengalami penurunan nilai aset (misal rugi `1.000` USDG), rasio aset strategi terhadap utang tercatat (`current_debt`) menjadi defisit.
2. Saat penarikan melebihi kas idle dan menyentuh strategi yang merugi:
   - Pemanggilan `withdraw` dengan `max_loss = 0` (kebijakan zero tolerance default) **WAJIB REVERT** dengan pesan `"too much loss"`.
   - Pemanggilan dengan toleransi kerugian eksplisit (misal `max_loss = 500` bps = 5%) **BERHASIL**.
3. Ini membuktikan bahwa Vault V3 melindungi depositor yang tidak mengizinkan realisasi kerugian saat likuidasi darurat.

### DRILL-3: Pembekuan Deposit Operasional (`deposit_limit = 0`)
1. Berdasarkan temuan **AV-1**, freeze deposit dilakukan dengan mengubah `deposit_limit` menjadi `0`, **bukan** dengan mem-pause vault.
2. Ketika `deposit_limit = 0`:
   - Permintaan deposit baru **langsung revert**.
   - Penarikan dana oleh pengguna yang sudah ada **tetap berjalan normal 100% tanpa hambatan**.

### DRILL-4: Emergency Pause vs Unpause (`setPaused`)
1. Sesuai semantik Yearn V3 core (`VaultV3.vy:774`), `setPaused(true)` adalah tombol darurat ekstrem yang **memblokir deposit DAN penarikan**.
2. Pengujian membuktikan:
   - Saat `paused = true`: pemanggilan deposit revert, pemanggilan withdraw revert.
   - Saat `paused = false` (unpaused oleh Guardian): penarikan kembali normal.

### DRILL-5: Batasan Hak Akses (Role Separation)
Akun tanpa otorisasi peran ditolak keras saat memanggil fungsi administratif:
- `update_debt` oleh akun non-manager -> **Revert**.
- `process_report` oleh akun non-keeper -> **Revert**.
- `set_deposit_limit` oleh akun non-timelock -> **Revert**.
- `setPaused` oleh akun non-emergency -> **Revert**.

---

## 3. Pembuktian Multistrategi (Brief §16 Tahap D & §7.3)

Untuk memenuhi persyaratan Tahap D (minimal dua strategi valid dengan alokasi dan antrean teruji), suite `MultiStrategyAllocationTest` menguji integrasi Vault V3 dengan dua strategi independen (`strategy1` dan `strategy2`):

1. **Konfigurasi Fee Bersih:**
   Sesuai arsitektur Avenor (`FEE_CONFIG.md`), fee performance pada layer strategi disetel ke `0` (`setPerformanceFee(0)`), sehingga tidak terjadi pemotongan fee ganda dan seluruh akuntansi performa dihitung terpusat di `Accountant`.
2. **Rekonsiliasi Utang Simultan:**
   - Strategi 1 dialokasikan `80.000` USDG.
   - Strategi 2 dialokasikan `60.000` USDG.
   - Terbukti: `vault.totalDebt() == alloc1 + alloc2 == 140.000 USDG`.
3. **Reallokasi Modal Antar-Strategi:**
   - Modal ditarik kembali dari Strategi 1 (utang turun dari 100k ke 60k).
   - Modal dialokasikan ke Strategi 2 (utang naik dari 0 ke 40k).
   - Total utang tetap terjaga di 100k USDG secara deterministik.
4. **Cascading Default Queue Withdrawal:**
   - Antrean penarikan disetel: `default_queue = [strategy1, strategy2]`.
   - Kas idle: `60.000` USDG. Strategi 1: `70.000` USDG. Strategi 2: `70.000` USDG.
   - Pengguna menarik `150.000` USDG:
     1. Menghabiskan seluruh `60.000` USDG kas idle (tersisa kebutuhan 90k).
     2. Menghabiskan seluruh `70.000` USDG dari Strategi 1 (tersisa kebutuhan 20k).
     3. Menarik `20.000` USDG sisanya dari Strategi 2 (sisa utang Strategi 2 menjadi 50k).
     4. Pengguna menerima tepat `150.000` USDG tanpa selisih.
5. **Pelaporan Yield Independen:**
   Kedua strategi melaporkan yield secara terpisah tanpa interferensi, dan total aset vault mencerminkan akumulasi keuntungan gabungan.

---

## 4. Cara Menjalankan Verifikasi

```bash
# 1. Jalankan runner drill operasional lengkap (Python)
python scripts/testnet-lifecycle-drill.py

# 2. Jalankan test suite lifecycle Foundry
.tools/foundry/forge.exe test --root packages/contracts --match-contract LifecycleDrillTest -vv

# 3. Jalankan test suite multistrategi Foundry
.tools/foundry/forge.exe test --root packages/contracts --match-contract MultiStrategyAllocationTest -vv
```
