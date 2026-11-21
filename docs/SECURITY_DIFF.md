# SECURITY_DIFF — audit 2023 vs pin 2026

Dokumen ini menjawab satu pertanyaan: **apa yang berubah antara kode yang diaudit (2023) dan kode yang kita pin (2026), dan apa konsekuensinya untuk kita.**

Tiket: `epic-baseline-and-toolchain` / `story-security-diff-plan.md`.
Status: **selesai untuk `VaultV3`/`VaultFactory` dan `TokenizedStrategy`; sisa terbuka di §6.**

## 0. Batas klaim (baca dulu)

- Audit yang tersedia (ChainSecurity, Statemind, yAcademy) menargetkan kode **2023**. Pin kita 2026.
- Tidak ada audit untuk: kombinasi pin 2026, `vault-periphery@672de1c`, adapter Morpho Vault V2 kita, konfigurasi peran produk, dan deployment kita.
- Karena itu kalimat **"audited"** untuk produk Avenor dilarang. Yang boleh dikatakan: "core upstream pernah diaudit pada versi 2023; diff ke pin kita didokumentasikan di `docs/SECURITY_DIFF.md`."
- Tanpa diff ini, kita tidak punya dasar untuk menyebut pin 2026 "setara" dengan versi yang diaudit. Dengan diff ini, kita punya daftar periksa — bukan jaminan.

Metode: diff commit-per-commit antara `v3.0.2` (rilis yang bytecode-nya terbukti on-chain, lihat `docs/REPRODUCIBILITY.md` §3) dan `f449264` (pin kita), lalu setiap perubahan keamanan dipetakan ke baris di pin akhir.

## 1. Rentang perubahan `yearn-vaults-v3`

`v3.0.2` (`cb9be33`) → `f449264` (`v3.1.1-2-gf449264`), hanya `contracts/`:

| Commit | Judul | File kontrak |
|---|---|---|
| `9fbc614` | `fix: greater or equal (#200)` | interfaces + test saja (batas `>=` di test, bukan logika vault) |
| `92716ed` | `feat: v3.0.3 (#201)` | `VaultV3.vy`, `VaultFactory.vy`, interfaces |
| `e5cf2af` | `chore: fix interface and version (#214)` | interfaces |
| `25bb919` | `fix: chainsec audit fixes (#215)` | `VaultV3.vy` (+19/−26 baris) |
| `104a2b2` | `chore: deploy 304 (#216)` | deploy script/version saja |
| `5b698f9` | `build: v3.1.0 (#235)` | version |
| `89ab996` | `feat: add vault transfer hooks (#238)` | `VaultV3.vy`, `VaultFactory.vy`, `HookModule.vy` |

Diff total `contracts/`: **21 file, +794 / −413**. `VaultV3.vy` sendiri 504 baris berubah; `VaultFactory.vy` 163 baris.

## 2. Perubahan keamanan di `VaultV3.vy` (yang berdampak ke kita)

### 2.1 Perbaikan dari audit ChainSecurity (`25bb919`, #215)

| Perubahan | Lokasi di pin kita | Kenapa penting |
|---|---|---|
| `assets_to_withdraw - loss` → `unsafe_sub(assets_to_withdraw, loss)` di `_redeem` | `contracts/VaultV3.vy:898` | Menghilangkan underflow check yang mahal di jalur panas; aman hanya karena invariant `loss <= assets_to_withdraw` dijamin di atasnya. Kalau invariant itu rusak oleh strategi jahat, `unsafe_sub` membungkus jadi angka besar, bukan revert. **Kita bergantung pada `convertToAssets`/`maxRedeem` strategi yang tidak bisa dimanipulasi.** |
| `assets_to_withdraw - withdrawn` → `unsafe_sub(...)` di `_update_debt` | `contracts/VaultV3.vy:1069` | Sama: `max_loss` check bergantung pada `withdrawn <= assets_to_withdraw`; kalau strategi melaporkan `withdrawn > assets_to_withdraw`, jalur lain (`elif withdrawn > ...`) yang menangani. Wajib diuji: strategi yang melaporkan `withdraw` lebih besar dari permintaan. |
| Refund dihitung ke `current_debt` saat `total_refunds > 0` | `contracts/VaultV3.vy:1296`, `:1307` | Sebelumnya refund (asset yang dikembalikan strategi saat report) hilang dari accounting ketika `gain == 0`; sekarang ditambahkan ke `current_debt` sebelum `total_idle` di-set. Ini bug accounting nyata, bukan kosmetik: tanpa fix, `total_debt` dan `total_idle` tidak lagi menjumlah ke `total_assets`. |
| `set_role`/`remove_role` membaca storage sekali ke variabel lokal | `contracts/VaultV3.vy:1577`, `:1606` | Pengurangan pembacaan storage ganda; juga memastikan event memakai nilai yang sama dengan yang ditulis. |
| Event `UpdateFutureRoleManager` | `VaultV3.vy:122` (deklarasi), `:1632` (emit) | `transfer_role_manager` sekarang meninggalkan jejak yang bisa diindeks saat `future_role_manager` diset — penting untuk audit trail serah-terima timelock. |

### 2.2 Perubahan di v3.0.3 (`92716ed`, #201)

| Perubahan | Lokasi | Konsekuensi |
|---|---|---|
| `_process_report` menerima `strategy == self` untuk mengakrualkan asset yang di-`airdrop` | `:1150` | Menambah entri baru di permukaan: report ke vault sendiri kini legal. Keeper kita **tidak** boleh memanggil ini tanpa alasan; kalau dipanggil, fee protocol bisa terpicu dari "gain" yang sebenarnya donasi. Perlu test + larangan di runbook. |
| `setName`/`setSymbol` baru | `:1365`, `:1375` | Tidak ada risiko langsung; menambah permukaan role (`role_manager`). |
| `set_auto_allocate` + `auto_allocate` | `:1429` | Menentukan apakah `_deposit` langsung menarik dana ke `default_queue[0]` (`_update_debt(default_queue[0], max_value(uint256), 0)` di `:695-696`). ADR-6 kita: `auto_allocate = false`. |
| `_issue_shares_for_amount` dihapus | — | Dead code; tidak ada pemanggil di pin kita. |
| `_assess_share_of_unrealised_losses(strategy, strategy_current_debt, assets_needed)` | `:705` | Signature berubah; dipakai di `_max_withdraw`. Periphery yang memanggil versi lama akan gagal ABI — bagian dari konflik §2 `docs/BASELINE.md`. |
| `_deposit`/`_mint` dipecah (shares dihitung di pemanggil) | `:676` | Mengubah alur rounding; kelas bug share-inflation pindah ke `_convert_to_shares` (lihat bawah). |

Rounding yang berubah dan wajib diuji di fork kita:

- `_convert_to_shares`: `total_supply == 0` → return `assets` (PPS 1). `total_supply > 0 && total_assets == 0` → return `0`, bukan revert. Artinya **vault dengan supply > 0 dan assets 0 mengembalikan share 0**, bukan error. UI harus memperlakukan ini sebagai kondisi darurat, bukan "deposit gagal".
- Urutan pengecekan dibalik (supply dulu, baru assets). Perilaku berbeda dari v3.0.2 pada kasus supply 0 + assets 0.

### 2.3 Transfer hook (`89ab996`, #238) — permukaan serangan baru, dan alasan ADR-5

| Perubahan | Lokasi | Konsekuensi |
|---|---|---|
| `ITransferHook.post_transfer(caller, sender, receiver, shares)` dipanggil **setelah** `_transfer` | `:65`, `:361-363` | Kontrak eksternal dieksekusi di dalam `transfer`. Hook yang revert = share tidak bisa dipindah sama sekali. Hook yang mahal = transfer menjadi mahal. |
| `transfer` dan `transferFrom` sekarang `@nonreentrant("lock")` | `:1952`, `:1965` (dekorator), definisi `:1953`, `:1966` | Sebelumnya transfer tidak memakai lock; sekarang hook berjalan di bawah lock vault yang sama. Ini menutup reentrancy lewat hook, tapi juga berarti **hook tidak boleh memanggil fungsi bervault-lock** (deposit/withdraw/redeem/report) atau transaksi revert. |
| `set_transfer_hook` memakai role `WITHDRAW_LIMIT_MANAGER` | `:1512` | Satu role menguasai dua hook (withdraw + transfer). Di matriks peran kita, role ini **tidak** diberikan ke guardian. |
| `API_VERSION` 3.1.0 → 3.1.1 | `:192` | Verifikasi on-chain `apiVersion()` harus `"3.1.1"` setelah deploy kita. |

Keputusan kita (konsisten dengan ADR-5): `transfer_hook` **kosong** di v1. Freeze risiko masuk memakai `deposit_limit`/`deposit_hook`. Alasannya sekarang punya dasar kode: hook transfer bisa mengunci exit user dari sisi share, dan itu bertabrakan dengan janji "user selalu bisa keluar".

### 2.4 `VaultFactory.vy`

163 baris berubah. Yang perlu diperiksa saat implementasi (belum selesai, lihat §6):

- `deploy_new_vault` sekarang menerima `name`/`symbol` (konsekuensi `setName`/`setSymbol`), plus `transfer_hook`? — verifikasi urutan parameter sebelum menulis `Deploy.s.sol`.
- `protocol_fee_config` / `use_custom_protocol_fee` — pastikan factory kita tidak mewarisi protocol fee pihak lain; kita deploy sendiri (ADR-2).
- Event `NewVault` + `UpdateProtocolFeeConfig` — dipakai indexer.

`VaultFactory` runtime kita: 3.604 B, keccak `0xdfc2a10112cf82c15ada486a586ff1a5bebd312e9dbe86ef8c13d92683bddec2` (`packages/core/artifacts/VaultFactory.json`).

## 3. `TokenizedStrategy`: 2023 → 2026

Rentang `v3.0.0` → `48c53ab` (`v3.1.1`) pada `src/`, hanya file sumber (test diabaikan):

| File | Perubahan |
|---|---|
| `src/TokenizedStrategy.sol` | **ditulis ulang**: 1.822 baris berubah |
| `BaseTokenizedStrategy.sol` → `BaseStrategy.sol` | rename + 317 baris berubah |
| `src/libraries/TokenizedStrategyLib.sol` | **baru**, 260 baris |
| `interfaces/*` | `IStrategy`, `ITokenizedStrategy`, `IEvents`, `IFactory` berubah |
| Commit kunci | `4b11997` instant profit unlocking, `b2ad48b` v3.0.2, `e90ecb8` v3.0.3, `90514f1` v3.1.0, `cbd56a3` deploy 311, `48c53ab` fix api version |

Ini bukan patch kecil. Konsekuensi untuk kita:

1. **Kita tidak men-deploy `TokenizedStrategy` baru** (ADR-1 amendemen). Strategi kita inherit `BaseStrategy@48c53ab` dan men-`delegatecall` ke implementasi kanonik yang sudah ada di chain 4663. Jadi bytecode `TokenizedStrategy` yang benar-benar dieksekusi **bukan** hasil build kita — dan itu sudah diverifikasi identik:
   - lokal 18.224 B, keccak `0xc38ff7fb…4034`;
   - deployed di mainnet dan di `4663` `0x3110D1Eec90f0651C18e75AD37711A8777342504` (constant di `src/BaseStrategy.sol:111`, jadi alamat impl sama di semua rantai) keccak `0x38c3b5bb…d16f`;
   - setelah mask immutable `factory` (offset `1309`, `11193`) + metadata CBOR 53 B → 18.171 B, **0 byte berbeda**.
2. Risiko berpindah tempat: bukan lagi "apakah bytecode sesuai source", tapi **"apakah source 2026 yang kita inherit kompatibel dengan implementasi yang sudah terpasang"**. Yang harus diuji:
   - `profit_max_unlock_time` / instant profit unlocking (perilaku baru vs 2023, mempengaruhi `totalAssets` yang dibaca vault saat report);
   - accrual konstan (`ConstantAccrualInvariant.t.sol`) — perubahan cara `totalAssets` dihitung antar-report;
   - `LegacyAccounting.t.sol` — jalur kompatibilitas untuk posisi lama;
   - `Pause.t.sol` — semantik `pause` strategi vs `setPaused` vault (dua hal berbeda, jangan dicampur di UI).
3. `BaseStrategy.tokenizedStrategyAddress` **constant, bukan storage** → tidak bisa dioverride. Ini fakta yang mengikat desain, sudah dicatat di `docs/ARCHITECTURE.md` ADR-1 amendemen.

## 4. Yang **tidak** berubah (dan tetap jadi risiko)

- `Accountant` dan `RoleManager`/`DebtAllocator` di `vault-periphery@672de1c` dibangun terhadap `yearn-vaults-v3@5b698f94` (v3.1.0), bukan pin kita. `Accountant` sudah diuji terhadap ABI kita (8 unit test + wiring di `Deploy.s.sol`); `RoleManager`/`DebtAllocator` tidak dipakai sehingga tidak diuji dan tidak diklaim. Lihat `docs/COMPATIBILITY_MATRIX.md`. `Accountant` menagih `managementFee` bahkan saat loss (`docs/ACCOUNTING.md`, `FEE_CONFIG.md`) — itu desain, bukan bug, dan alasan ADR-10 memilih `managementFee = 0`.
- Fee protocol dari factory: kalau factory kita mewarisi config pihak lain, potongan tak terduga muncul. Mitigasi: kita deploy factory sendiri dan memverifikasi `protocol_fee_config()` setelah deploy.
- Tidak ada perubahan yang memperbaiki kelas risiko venue (Morpho, kurator). Diff ini hanya soal core.

## 5. Cara mengulang pemeriksaan ini

```bash
# pin & rentang
git -C referensi/yearn-vaults-v3 describe --tags f449264
git -C referensi/tokenized-strategy describe --tags 48c53ab

# daftar commit yang mengubah kontrak antara rilis teraudit dan pin kita
git -C referensi/yearn-vaults-v3 log --oneline v3.0.2..f449264 -- contracts/

# diff per commit audit-fix
git -C referensi/yearn-vaults-v3 diff 25bb919^ 25bb919 -- contracts/VaultV3.vy
git -C referensi/yearn-vaults-v3 diff 89ab996^ 89ab996 -- contracts/VaultV3.vy

# bukti bytecode (harus 14/14)
./.venv-ape/Scripts/python.exe scripts/verify-bytecode.py all
```

## 6. Test regresi yang wajib dibuat (ditautkan ke tiket)

| # | Test | Tiket |
|---|---|---|
| T1 | Venue yang membayar lebih / kurang / mengembalikan angka salah satuan tidak membuat `unsafe_sub` membungkus; surplus jadi gain, kekurangan hanya mengurangi debt yang benar-benar bergerak, dan return value diabaikan (diukur dari selisih balance) | `test/unit/MaliciousVenue.t.sol` (4 test, epic 3 / tiket 4) |
| T2 | Refund accounting `:1296`/`:1307`: setelah report dengan `gain == 0` dan `total_refunds > 0`, `total_idle + total_debt == total_assets` tetap berlaku | epic 3 / tiket 4 |
| T3 | `transfer_hook == 0` di v1 → `transfer`/`transferFrom` tidak pernah revert karena hook, dan tidak ada jalur lock baru | epic 3 / tiket 2 (role matrix) |
| T4 | `_convert_to_shares` pada `total_supply > 0 && total_assets == 0` mengembalikan 0 → UI/SDK memperlakukannya sebagai kondisi darurat, bukan "deposit berhasil dengan share 0" | epic 3 / tiket 4 |
| T5 | Healthcheck Accountant menolak `maxGain`/`maxLoss` di luar batas, termasuk kasus `managementFee > 0` saat loss | epic 3 / tiket 3 (loss path) |
| T6 | `deposit_limit`/`DepositCapHook` menutup deposit tanpa memblokir `redeem` (ADR-5) | epic 3 / tiket 5 |
| T7 | Report ke `strategy == self` dilarang di runbook keeper dan dites agar tidak dipanggil otomatis | epic 6 (keeper) |

## 7. Sisa pekerjaan (jujur, belum selesai)

- [ ] Baca baris-per-baris seluruh 504 baris `VaultV3.vy` (di sini baru perubahan keamanan utama; sisanya rename/komentar/refactor). Belum diklaim tuntas.
- [ ] Verifikasi urutan parameter `VaultFactory.deploy_new_vault` di pin kita vs `Deploy.s.sol` yang akan ditulis.
- [ ] Diff `vault-periphery@672de1c` terhadap `5b698f94` (v3.1.0) untuk `Accountant`, `RoleManager`, `DebtAllocator` (tiket 3 epic 1).
- [ ] Test fork yang membuktikan tiga hal: (a) strategi yang melaporkan `withdrawn > assets_to_withdraw` tidak membuat `unsafe_sub` membungkus, (b) refund accounting `:1296`/`:1307` menghasilkan `total_idle + total_debt == total_assets`, (c) `transfer_hook` kosong sehingga tidak ada jalur penguncian transfer.
- [ ] Putuskan apakah report ke `strategy == self` dilarang di runbook keeper (rekomendasi: ya, larang, kecuali untuk insiden yang didokumentasikan).