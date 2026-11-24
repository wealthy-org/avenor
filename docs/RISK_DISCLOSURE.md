# PENGUNGKAPAN RISIKO (RISK DISCLOSURE) — Avenor

Dokumen resmi pengungkapan risiko untuk pengguna, peninjau, dan operator protokol Avenor Managed Strategy Vaults.

Sesuai aturan ketat `AGENTS.md`: dokumen ini tidak memperhalus risiko (*no sugarcoating*), tidak mengarang angka, dan melarang klaim "audited" palsu.

---

## 1. Risiko Likuiditas: Tidak Ada Likuiditas Instan

1. **Kas Idle Terbatas di Venue Upstream:**
   - Vault Avenor menempatkan sebagian besar asetnya ke venue upstream (Morpho Vault V2 `steakUSDG`).
   - Pada pin baseline `118337511`, kas idle `steakUSDG` hanya tercatat **`27.024.457,98` USDG** dari total TVL **`538.856.055,99` USDG** (**5,02%**).
   - Sebanyak 94,98% aset dipinjamkan ke pasar *Morpho Blue* aktif.
2. **Ketergantungan Penarikan:**
   - Penarikan dari vault Avenor dapat dilayani secara instan **hanya sebesar kas idle** yang ada di vault atau kas idle yang berhasil ditarik dari strategi venue.
   - Jika pasar kredit Morpho mengalami utilisasi 100%, penarikan akan tertunda hingga peminjam mengembalikan pinjaman (*repay*) atau likuiditas baru masuk.
3. **Pemisahan Definisi di Antarmuka:**
   - Antarmuka (UI) Avenor memisahkan secara tegas antara **"Nilai Posisi"** (klaim akuntansi) dan **"Dapat Ditarik Sekarang"** (kas riil yang siap cair).

---

## 2. Parameter Kerugian Maksimal (max_loss Eksplisit)

1. **Larangan Default Implisit:**
   - Standar Yearn V3 bawaan menerapkan default `max_loss = 0` pada `withdraw()` dan `max_loss = 10000` (100% rugi) pada `redeem()`.
   - Di Avenor, kedua default ini **dilarang keras**. SDK dan Web App mewajibkan parameter `max_loss` dikirim secara eksplisit oleh penanda tangan.
2. **Slippage Kerugian Venue:**
   - Jika terjadi kerugian terealisasi di venue saat proses penarikan, transaksi akan gagal (*revert*) jika kerugian melebihi toleransi `max_loss` (dalam basis points / bps) yang ditentukan pengguna.

---

## 3. Status Audit & Kode Kontrak

1. **Status Audit Upstream vs Kode Baru:**
   - Upstream Yearn V3 Allocator Vault telah diaudit pada tahun 2023 oleh auditor independen pihak ketiga.
   - **KONTRAK KITA SENDIRI (MorphoVaultStrategy, DepositCapHook, Deploy.s.sol, dan konfigurasi Robinhood Chain 2026) BELUM DIAUDIT SECARA RESMI OLEH FIRMA AUDIT EKSTERNAL.**
   - Tim telah menyusun dokumen cakupan audit (`docs/AUDIT_SCOPE.md`) dan register perbaikan regresi (`docs/REMEDIATION.md`), namun pengguna dilarang memperlakukan vault ini sebagai produk yang telah bersertifikat audit penuh.
2. **Fase Riset (Research Phase):**
   - Sebelum peluncuran terbatas publik resmi, vault berstatus `phase: research` dan tidak boleh menerima deposit publik umum.

---

## 4. Struktur Tata Kelola & Jeda Waktu (Timelock)

1. **Dual-Speed Timelock (ADR-12):**
   - Peran `role_manager` vault dipegang oleh `TimelockController` dengan keterlambatan eksekusi minimal **48 jam**.
   - Setiap perubahan parameter kritis (penambahan strategi baru, alokasi debt, penggantian accountant) memerlukan proposal publik dengan masa tunggu 48 jam.
2. **Fast Lane Emergency Timelock (6 Jam):**
   - Peran pencabutan paksa (`FORCE_REVOKE_MANAGER`) dipegang oleh Timelock Darurat 6 jam untuk merespons kerentanan venue tanpa menunggu 48 jam, namun tetap mencegah eksekusi sepihak instan.
3. **Guardian Safe:**
   - Guardian memegang peran darurat `EMERGENCY_MANAGER` untuk menjeda (*pause*) atau mematikan (*shutdown*) vault seketika saat terjadi insiden.
   - Guardian terpisah dari pengusul timelock dan tidak dapat mengubah parameter ekonomi.

---

## 5. Mekanisme Penghentian & Pembekuan Dana

1. **Pembekuan Deposit:**
   - Penghentian penerimaan deposit dilakukan melalui `deposit_limit = 0` atau pembatasan `deposit_hook`.
2. **Dampak setPaused:**
   - Fungsi `setPaused` di Yearn V3 memblokir **deposit sekaligus penarikan**. Fungsi ini hanya diizinkan untuk mitigasi insiden kritis aktif dan tidak boleh digunakan sebagai alat pembatas deposit harian.

---

## 6. Risiko Kredit & Pasar Morpho Blue

1. **Risiko Likuidasi & Gagal Bayar:**
   - Aset yang dialokasikan ke `steakUSDG` disalurkan ke pasar peminjaman Morpho Blue. Kegagalan mekanisme likuidasi jaminan atau penurunan drastis harga jaminan pada pasar terkait dapat menyebabkan kerugian pokok (*bad debt*).
2. **Risiko Depeg USDG:**
   - Nilai share `avUSDG` bertumpu pada integritas nilai tukar USDG (Global Dollar). Jika token USDG kehilangan patokan 1:1 terhadap USD, nilai ekuivalen fiat posisi pengguna akan terpengaruh.
