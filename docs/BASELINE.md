# BASELINE — Avenor Managed Strategy Vaults

Status: **baseline tervalidasi dari source lokal + bytecode terbukti; belum ada deployment.**
Tanggal: 19 November 2026 (Asia/Makassar). Network target: Robinhood Chain (mainnet `4663`, testnet `46630`).
Dokumen ini adalah satu-satunya sumber pin versi. Setiap perubahan pin harus lewat PR yang memperbarui file ini.
Bukti reproduksi bytecode: `docs/REPRODUCIBILITY.md`. Ulangi dengan `scripts/verify-bytecode.py all`.

## 1. Pins upstream (source tersimpan di `referensi/`)

| Repo | HEAD commit | Tag/API version | Compiler | EVM | Lisensi |
|---|---|---|---|---|---|
| `yearn/yearn-vaults-v3` | `f449264ff4f8bebe9a6bf72e43095304fdf101b8` (2026-10-22, `git describe` = `v3.1.1-2-gf449264`) | `API_VERSION = "3.1.1"` (`contracts/VaultV3.vy:192`, `contracts/VaultFactory.vy:71`) | Vyper `0.3.10+commit.9136169`, `--optimize codesize`, `--evm-version paris` | paris | AGPL-3.0 |
| `yearn/tokenized-strategy` | `48c53aba0395885b3f579d0a4b426de276a7b69e` (2026-10-12, tag `v3.1.1`) | `API_VERSION = "3.1.1"` (`src/TokenizedStrategy.sol:370`) | solc `0.8.18`, optimizer 200 runs, evm `paris` | paris | AGPL-3.0 |
| `yearn/vault-periphery` | `672de1c98450ab4485fd0da1f5d3d47dc97500b8` (2026-11-11, `git describe` = `v3.0.4-7-g672de1c`) | tidak ada `API_VERSION`; modul dipilih per file | solc `0.8.18` | default | AGPL-3.0 (header SPDX per file, tidak ada file `LICENSE` di root) |
| `yearn/Yearn-ERC4626-Router` | `fc96fe36be61459fdd6102914d3ddc7a11396cc1` (2026-11-11) | `0.0.0` di `package.json` (tidak informatif) | solc `0.8.18` | default | AGPL-3.0 |
| `kassora/kassora-overview` | `a061e778fe1430baf5498de5956e029a9557857b` (2026-11-17) | README-only | — | — | MIT |

Submodule yang dipakai upstream (rekam, jangan di-upgrade diam-diam):

| Parent | Submodule | Pin commit |
|---|---|---|
| yearn-vaults-v3 | `lib/tokenized-strategy` | `6e12ce08584b49c7560227e94810d2f0e3dec8b2` (branch `v3.0.4`) |
| yearn-vaults-v3 | `lib/openzeppelin-contracts` | `bd325d56b4c62c9c5c1aff048c37c6bb18ac0290` (v4.9.5) |
| yearn-vaults-v3 | `lib/erc4626-tests` | `8b1d7c2ac248c33c3506b1bff8321758943c5e11` |
| yearn-vaults-v3 | `lib/forge-std` | `2b58ecbcf3dfde7a75959dc7b4eb3d0670278de6` |
| vault-periphery | `lib/tokenized-strategy` | `48c53aba0395885b3f579d0a4b426de276a7b69e` (tag `v3.1.1`) |
| vault-periphery | `lib/tokenized-strategy-periphery` | `1e334fbdd5955a50c085ec3662c6051efb7fc615` (branch `master`, tidak ada release) |
| vault-periphery | `lib/yearn-vaults-v3` | `5b698f9411e880a8f7d4370ad7a4478b24dc2535` (branch `v3.1.0`) |
| vault-periphery | `lib/openzeppelin-contracts` | `bd325d56b4c62c9c5c1aff048c37c6bb18ac0290` (v4.9.5) |
| vault-periphery | `lib/forge-std` | `4f57c59f066a03d13de8c65bb34fca8247f5fcb2` |

**Koreksi pin (dicatat, bukan disembunyikan).** Versi dokumen sebelumnya menukar identitas dua commit: `672de1c9` ditulis sebagai HEAD `yearn-vaults-v3`, dan `f449264f` sebagai HEAD `vault-periphery`. Kenyataannya kebalikannya (`git -C referensi/yearn-vaults-v3 cat-file -t 672de1c9` → *unknown revision*; commit itu hanya ada di `vault-periphery`). Pin `tokenized-strategy@9b7a1811` juga salah: commit itu `git describe` = `v3.0.0-beta-29` dengan `API_VERSION = "3.1.0"` dan `tokenizedStrategyAddress` menunjuk `0x2e234DAe75C793f67A35089C9d99245E1C58470b` yang **codesize = 0** di semua chain (komentar source: alamat deterministik "for testing"). Memakai commit itu berarti strategi men-`delegatecall` ke alamat tanpa kode. Pin yang benar ada di tabel di atas.

## 2. Ketidakcocokan kombinasi yang harus diselesaikan sebelum slice

Empat konflik nyata ditemukan dari pin di atas. Nomor versi yang sama **tidak** membuktikan kombinasi kompatibel.

1. **Vault v3.1.1 mem-pin Tokenized Strategy v3.0.4 sebagai submodule.** `yearn-vaults-v3@f449264` mengunci `lib/tokenized-strategy` ke `6e12ce08` (branch `v3.0.4`), sementara `vault-periphery@672de1c` mengunci `48c53ab` (`v3.1.1`). Vault memanggil `IStrategy.convertToAssets/balanceOf/maxRedeem/deposit`, jadi perbedaan semantik strategi langsung mempengaruhi `_process_report` dan `_max_withdraw`. Kita memilih **`48c53ab` (v3.1.1)**, bukan `6e12ce08`, karena itu yang dipakai `vault-periphery` dan satu-satunya yang punya implementasi kanonik ber-kode di chain 4663.
2. **Vault pin berbeda antara repo.** `vault-periphery@672de1c` membangun terhadap `yearn-vaults-v3@5b698f94` (branch `v3.1.0`), bukan `f449264` yang kita pin. Hasil verifikasi ulang: `Accountant` teruji terhadap ABI kita (8 unit test + wiring deploy), sedangkan `RoleManager`/`TimelockExecutor`/`DebtAllocator` **tidak dipakai** jalur produk mana pun (ADR-4 memakai OZ `TimelockController` langsung, ADR-6 menonaktifkan auto-allocate) sehingga tidak diverifikasi dan tidak diklaim. Matriks lengkap + bukti: `docs/COMPATIBILITY_MATRIX.md`.
3. **`tokenized-strategy-periphery` tidak ber-release.** `vault-periphery` menunjuk branch `master` commit `1e334fbd`. Tidak ada tag; tidak ada jaminan kompatibilitas jangka panjang. Bila modul ini dipakai, vendor pada commit tersebut dan dokumentasikan sebagai fork beku.
4. **Tidak ada deployment publik Vault v3.1.1.** `VAULT_ORIGINAL` di semua network tahun utama masih `0x1ab62413e0cf2eBEb73da7D40C70E7202ae14467` dengan `apiVersion() = "3.0.2"`, dan alamat itu `immutable` di dalam creation code — tidak mungkin menunjuk implementasi lain. Artinya bytecode `v311` **belum pernah terbukti on-chain**; yang terbukti adalah reproduksinya lokal dan determinisme dua-run (lihat `docs/REPRODUCIBILITY.md` §4).

Keputusan baseline: **pin tunggal = `yearn-vaults-v3@f449264` + `tokenized-strategy@48c53ab` + `vault-periphery@672de1c`**, lalu bangun matriks kompatibilitas empiris lewat fork test (lihat §6). `vault-periphery` di-vendor pada commit di atas, bukan di-`master`, dan hanya `src/accountants/Accountant.sol` + `interfaces/IVault.sol` yang benar-benar masuk `lib/`. **`Yearn-ERC4626-Router@fc96fe36` ditolak** (ADR-11): app memanggil vault langsung agar `max_loss` tetap eksplisit di tiap panggilan. Rincian: `docs/COMPATIBILITY_MATRIX.md`.

## 3. Cakupan audit upstream (bukan audit produk kita)

PDF tersimpan di `referensi/*/audits/`:

- `chainsecurity` Vault V3, `statemind` Vault V3, `yacademy` Vault V3 (2023).
- `chainsecurity` Tokenized Strategy (2023).
- `chainsecurity` Yearn ERC4626 Router.

Implikasi yang harus ditulis di UI dan docs: audit tersebut mencakup **core upstream pada versi 2023**. Tidak ada audit untuk: kombinasi pin 2026 (`v3.1.1`), modul periphery yang kita pilih, adapter Morpho Vault V2, konfigurasi peran produk, dan deployment kita. Kalimat "audited by ChainSecurity" untuk produk Avenor adalah klaim salah dan dilarang (brief §11).

Catatan: `vault-periphery@672de1c` adalah merge `security/node-nov2026-security-fixes`. Diff terhadap commit yang diaudit **wajib** dibaca baris per baris sebelum slice B, dan hasilnya masuk `docs/SECURITY_DIFF.md` (belum dibuat).

## 4. Perbedaan terhadap upstream (kebijakan)

- Tidak menulis ulang `VaultV3.vy`. Core tetap Vyper apa adanya.
- Tidak membuat proxy upgradeable di depan vault (brief §6). Vault V3 tidak upgradeable; migrasi = deploy vault baru + komunikasi, bukan pindah state diam-diam.
- Penambahan kita dibatasi pada: `contracts/` (adapter strategi Solidity + script deploy), `packages/*`, `services/*`, `apps/web`. Nol perubahan pada file Vyper core.
- Strategi kita **tidak** men-deploy `TokenizedStrategy` baru. `BaseStrategy.tokenizedStrategyAddress` hardcoded ke implementasi kanonik `0x3110D1Eec90f0651C18e75AD37711A8777342504` yang sudah ada di chain 4663 (lihat ADR-1 amendemen di `docs/ARCHITECTURE.md`).
- Semua file AGPL-3.0 yang kami modifikasi/distribusikan mempertahankan header SPDX dan `NOTICE`/source offer. Karena produk di-host sebagai web app + kontrak on-chain, kewajiban AGPL (source untuk pengguna jaringan) harus dipenuhi: repo publik atau source offer tertulis. Ini keputusan legal, bukan opsional.

## 5. Toolchain host (terukur)

Semua di bawah sudah terpasang dan dipakai untuk menghasilkan bukti di `docs/REPRODUCIBILITY.md`.

| Tool | Versi terukur | Lokasi / catatan |
|---|---|---|
| Node | `v24.19.0` | cocok untuk Next.js + viem |
| npm | `11.17.0` | lockfile wajib |
| git | `2.50.0.windows.1` | Windows host, path `c:/laragon/www/...` |
| Foundry (`forge`, `cast`) | `1.9.0`, commit `6056c5845d34205a83cf7108042adb137325c9df`, build `2026-11-02` | `avenor/.tools/foundry/`; zip sha256 `2b02444d46c9218fe2e6be66015265ce131fe6b7c384e33e630b00f9a0bff072` cocok dengan `.sha256` rilis resmi |
| Python (env kompilasi vault) | `3.11.16` | `.venv-ape` |
| Vyper (pin v3.1.1) | `0.3.10+commit.9136169` | `.venv-ape`; `--optimize codesize --evm-version paris` |
| Vyper (pin v3.0.2) | `0.3.7+commit.6020b8b` | `.venv-037`; `--evm-version paris` |
| solc | `0.8.18` | via `svm`; optimizer 200 runs, `evm_version = paris` |
| Python host | `3.13.0` | **jangan** dipakai untuk `eth-ape`; env 3.11 di atas yang dipakai |
| uv | `0.12.9` | pembuat `.venv-ape` |

Jam host terbaca **2026-11-19**, konsisten dengan tanggal brief. State chain 4663 yang terverifikasi: block `118337511`, timestamp `1795103654`, hash `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af` (RPC `https://robinhood-rpc.publicnode.com`).

Catatan akses jaringan: `docs.robinhood.com` + `rpc.mainnet.chain.robinhood.com` tidak dapat dipakai dari host ini — sertifikat TLS kedaluwarsa dan ISP mengalihkan ke `internetsehat.iconpln.net.id`. `robinhoodchain.blockscout.com` memblokir Cloudflare, jadi verifikasi source on-chain belum bisa dilakukan. RPC yang berfungsi: `https://robinhood-rpc.publicnode.com` (tanpa arsip — permintaan blok historis ditolak `403 "Archive requests require a personal token"`), `https://4663.rpc.thirdweb.com`, dan (per 2026-11-19) `https://rpc.solidrpc.io/public/evm/4663` + `https://robinhood.api.onfinality.io/public` yang **melayani state historis**. Angka on-chain yang dipakai sebagai fixture diambil dengan `--block 118337511` lewat `https://robinhood.drpc.org` saat blok itu masih dilayani endpoint tersebut; drpc sekarang sudah memangkasnya (`Unknown state. First available state is 1`, jendela ~150-200 blok), jadi reproduksi memakai dua endpoint archive di atas lewat `python scripts/fork-test.py`. Catatan koreksi: nilai yang semula tercatat di tabel §7 diambil dengan `latest` pada beberapa blok berbeda sementara hash/timestamp-nya dari satu blok; semuanya sudah diukur ulang pada satu blok yang sama.

## 6. Definition of Done baseline

- [x] Repo upstream tersimpan lokal dengan commit SHA tercatat.
- [x] Pin submodule dan konflik kombinasi terdokumentasi.
- [x] Daftar audit dan lisensi tercatat.
- [x] `forge` terpasang dan dipin (`1.9.0`), build script tersedia; `forge build` pada `packages/contracts` menunggu source adapter (epic 4).
- [x] Kompilasi vault Vyper mereproduksi bytecode rilis: `v3.0.2` runtime 23.675 B `0x4075239962ac41f7f4876a094deea45dfb667d719de30f4abceaf35348db9858` identik dengan `0x1ab6…4467` di mainnet/arbitrum/base/optimism.
- [x] Bytecode pin kita direkam dan deterministik: `v3.1.1` `VaultV3` runtime 23.462 B `0x6909c58e…02be6`, creation 23.536 B `0xc00d80e0…4121b`; `VaultFactory` runtime 3.604 B `0xdfc2a101…ddec2`, creation 3.834 B `0xde30ee1a…9564f`.
- [x] `TokenizedStrategy v3.1.1` cocok dengan deployed: 18.224 B, setelah mask immutable `factory` + metadata CBOR → 18.171 B, **0 byte berbeda**, di mainnet dan di chain 4663.
- [x] `scripts/compile-vault.py` + `scripts/verify-bytecode.py` ada dan hijau (`14/14 checks passed`).
- [x] Fork test Robinhood Chain `4663` berjalan: `VaultFactory.deploy_new_vault(USDG, ...)` + `role_manager` berupa `TimelockController` + satu adapter Morpho berhasil — 4 test `test/fork/VaultE2E.t.sol` lulus di pin `118337511` dengan gas identik pada dua run (lihat `docs/COMPATIBILITY_MATRIX.md` §3). Catatan: `RoleManager` tidak dipakai (ADR-4).
- [x] `SECURITY_DIFF.md` untuk commit 2026 vs commit audit 2023 selesai untuk perubahan keamanan; sisa pekerjaan yang masih terbuka (baca baris-per-baris seluruh `VaultV3.vy`) dicatat di `SECURITY_DIFF.md` §7 dan **tidak** diklaim tuntas.
- [x] Matriks kompatibilitas (§2) diuji, hasilnya menggantikan asumsi di dokumen ini: `docs/COMPATIBILITY_MATRIX.md`.
## 7. Keadaan chain 4663 yang terverifikasi (bukan asumsi)

Dibaca langsung via `eth_getCode` / `eth_call` pada block `118337511`. Semua nilai di bawah masuk ke `docs/REPRODUCIBILITY.md` §5.

| Objek | Alamat | Keadaan |
|---|---|---|
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` | ada, 11.838 B — jalur deploy deterministik tersedia |
| TokenizedStrategy impl | `0x3110D1Eec90f0651C18e75AD37711A8777342504` | ada, 18.224 B, hash runtime = mainnet; API `3.1.1` |
| TokenizedStrategy factory | `0x311de24e48C360B9A7765E7aB7eCDBABCd27B134` | ada, 3.826 B |
| Yearn `VaultFactory` | `0x444045c5…` | **kosong** (codesize 0) — konfirmasi ADR-2: kita deploy factory sendiri |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `symbol="USDG"`, `decimals=6`, `totalSupply=622410599910270` |
| `steakUSDG` (venue) | `0xBeEff033F34C046626B8D0A041844C5d1A5409dd` | `name="Steakhouse USDG"`, **`decimals=18` dengan asset 6 desimal**, `totalAssets=538856055994280`, `totalSupply=531418644510854399888342585`, `convertToAssets(1e18)=1013995` (pps `1.013995`), `convertToShares(1e6)=986197776937474866`, **`maxDeposit(0x0)=0`** (deposit digate), `curator()=0x9023FBD6A08C666491A2d1648737E400cF42D2Fb`, `liquidity()` revert (bukan Vault V2) |

Konsekuensi yang mengikat implementasi (detail di `docs/VENUE_INTEGRATIONS.md`):

1. Share `steakUSDG` 18 desimal ≠ asset 6 desimal. Adapter **wajib** memakai `convertToAssets`/`convertToShares`, dilarang menyamakan share 1:1 dengan asset.
2. `maxDeposit(0x0)=0` berarti venue bisa menutup pintu masuk kapan saja tanpa memicu `paused`. Adapter harus memperlakukan `maxDeposit` sebagai otoritas dan melaporkan `maxDeposit` strategi = 0 saat venue tertutup.
3. Tidak ada `liquidity()`. Kapasitas keluar = **kas idle venue** (`USDG.balanceOf(venue)`), bukan `maxRedeem`/`maxWithdraw` — di blok pin keduanya `0` padahal venue membayar penuh 8,33 juta USDG (lihat `VENUE_INTEGRATIONS.md` §4).
