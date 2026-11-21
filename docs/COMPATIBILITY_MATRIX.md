# COMPATIBILITY_MATRIX — modul upstream vs pin vault kita

Sumber kebenaran untuk pertanyaan: "modul Yearn mana yang benar-benar dipakai, dan apa buktinya modul itu cocok dengan `VaultV3@f449264f`?"

Aturan yang mengikat dokumen ini: **modul yang tidak dijalankan suatu test tidak boleh disebut kompatibel.** "Biasanya jalan" bukan bukti. Modul yang ditolak tetap dicatat beserta alasannya, supaya tidak diusulkan ulang tanpa argumen baru.

Pin acuan: `yearn-vaults-v3@f449264f` (API `3.1.1`) + `tokenized-strategy@48c53ab` (`v3.1.1`) + `vault-periphery@672de1c9`. Rantai `4663`, block pin `118337511` (hash `0xbaa980ab…`, timestamp `1795103654`).

## 1. Matriks

| Modul | Pin | Dipakai jalur produk? | Permukaan ABI yang menyentuh vault | Bukti | Vonis |
|---|---|---|---|---|---|
| `VaultV3` + `VaultFactory` | `yearn-vaults-v3@f449264f` | ya — vault itu sendiri | seluruhnya | bytecode tereproduksi (`scripts/verify-bytecode.py`, 14/14); `test/fork/VaultE2E.t.sol` 4 test lulus di pin | **kompatibel, teruji** |
| `TokenizedStrategy` impl `0x3110D1Ee…` | `tokenized-strategy@48c53ab` | ya — `BaseStrategy` menunjuk alamat kanonik | `report`, `totalAssets`, `maxDeposit`, `maxWithdraw`, `freeFunds` | runtime 18.224 B, keccak = mainnet setelah mask immutable + CBOR; `test/fork/VenueProbe.t.sol::test_tokenizedStrategyImplementationIsPresent` | **kompatibel, teruji** |
| `Accountant` | `vault-periphery@672de1c9` | ya — `set_accountant` di deploy script | `report(IVault.Report, IVault.Fee, bytes)` dipanggil vault; `baseConfig()`/`vaultConfig()` dibaca keeper | `test/unit/AccountantFees.t.sol` 8 test + `test/unit/DeployScript.t.sol` (`_deployAccountant` + `addVault` + `set_accountant`); contoh angka `FEE_CONFIG.md` §6 direproduksi | **kompatibel, teruji** |
| `IVault.sol` (salinan) | `yearn-vaults-v3@f449264f` | ya — tipe parameter `Accountant.report` | struct `IVault.Fee`/`IVault.Report` | byte-identik upstream; `test/unit/GeneratedInterfaces.t.sol`; kesalahan urutan field akan salah-decode fee, jadi salinan dipilih daripada tulis tangan | **kompatibel, teruji** |
| `RoleManager` | `vault-periphery@672de1c9` | **tidak** | akan memegang `role_manager` | nol test; tidak di-vendor (`lib/` hanya `Accountant.sol` + `IVault.sol`) | **tidak dipakai — tidak diklaim** |
| `TimelockExecutor` | `vault-periphery@672de1c9` | **tidak** | pembungkus `TimelockController` | nol test | **tidak dipakai — tidak diklaim** |
| `DebtAllocator` | `vault-periphery@672de1c9` | **tidak** | `update_debt` dengan batas `targetRatio`/`maxRatio` | nol test | **tidak dipakai — tidak diklaim** |
| `Yearn-ERC4626-Router` | `Yearn-ERC4626-Router@fc96fe36` | **tidak** | jalur deposit/withdraw app | nol test; tidak di-vendor | **ditolak — ADR-11** |
| `openzeppelin-contracts` | `v4.9.5` (`bd325d56`) | tidak (build-time) | — | `forge build` hijau; versi = submodule pin `yearn-vaults-v3@f449264f` | **pin benar, build-only** |
| `forge-std` | `v1.9.6` (`3b20d60d`) | tidak (test-only) | — | `forge build`/`forge test` hijau | **test-only** |

## 2. Kenapa `RoleManager` dan `DebtAllocator` tidak dipakai

Bukan karena malas, tapi karena keduanya **menggantikan** mekanisme yang sudah kita pilih, dan pilihannya lebih ketat:

- `role_manager` dipegang **OZ `TimelockController` 48 jam secara langsung** (ADR-4). Menyisipkan `RoleManager` di antaranya menambah satu kontrak yang bisa menjadi titik kesalahan kewenangan, tanpa menambah jaminan delay — delay sudah milik timelock.
- `auto_allocate = false` dan alokasi eksplisit oleh keeper (ADR-6), sehingga `DebtAllocator` tidak punya pekerjaan. Kalau keeper perlu batas, batas itu di-encode di keeper + `update_debt` per tx, yang bisa diaudit per transaksi.

Konsekuensi jujur: **`BASELINE.md` §2 poin 2 tetap terbuka untuk kedua modul ini** — kita tidak memverifikasinya, jadi kita juga tidak boleh menyebutnya kompatibel. Yang berubah: itu bukan lagi risiko yang menggantung, karena tidak ada jalur produk yang melewatinya.

## 3. Bukti empiris yang dipakai (dapat dijalankan ulang)

```bash
python scripts/check-vendor.py            # hash vendor + dua fakta source
python scripts/verify-bytecode.py         # 14/14 checks
cd packages/contracts && forge test       # unit: Accountant, Roles, DeployScript, adapter
python scripts/fork-test.py               # fork: VaultE2E (4) + VenueProbe (7)
```

Hasil fork pada `118337511` (2026-11-20, endpoint `rpc.solidrpc.io/public/evm/4663`):

| Test | Gas run A | Gas run B |
|---|---|---|
| `test_e2e_depositAllocateReportWithdrawAll` | 2.394.348 | 2.394.348 |
| `test_e2e_partialWithdrawalFreesFundsFromTheVenue` | 2.461.292 | 2.461.292 |
| `test_e2e_venueAccrualIsReportedAsGainAndFee` | 2.697.109 | 2.697.109 |
| `test_e2e_shortfallIsUnreachableAtThePin` | 20.214 | 20.214 |

Gas identik antar dua run = eksekusi identik pada state yang sama, bukan kebetulan "sama-sama hijau".

Catatan kegagalan yang **tidak** disembunyikan: satu percobaan di antaranya berakhir `BLOCKED: no endpoint could serve the pinned state to a local fork` + `anvil: failed to create genesis`, sementara `eth_call` di pin yang sama masih menjawab benar. Itu kegagalan endpoint (rate limit / state fetch), bukan kegagalan test; run berikutnya pada pin yang sama hijau penuh. `python scripts/fork-status.py` adalah cara membedakan keduanya.

## 4. Yang tidak diklaim

- Tidak ada klaim "audited" untuk kombinasi pin ini.
- Tidak ada klaim bahwa `RoleManager`/`TimelockExecutor`/`DebtAllocator`/Router kompatibel.
- Tidak ada klaim bahwa venue `steakUSDG` kompatibel dengan Morpho Vault V2 rilis resmi: hash bytecode venue belum dibandingkan (tercatat di `packages/config/4663.json` → `unverified`).