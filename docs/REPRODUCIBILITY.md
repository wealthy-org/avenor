# REPRODUCIBILITY — bukti kompilasi & keadaan chain

Status: **terverifikasi 19 November 2026.** Semua angka di dokumen ini keluar dari perintah yang tercantum di sini, bukan dari dokumentasi pihak ketiga.

Dokumen ini menutup tiga hal yang sebelumnya hanya klaim: (1) toolchain benar-benar terpasang, (2) bytecode yang kita bangun bisa direproduksi dan cocok dengan deployment nyata, (3) keadaan chain `4663` yang menjadi dasar desain.

## 1. Toolchain terpasang (terukur)

| Tool | Versi | Sumber |
|---|---|---|
| `forge`/`cast`/`anvil` | `1.9.0`, commit `6056c5845d34205a83cf7108042adb137325c9df`, build `2026-11-02` | rilis resmi `foundry_v1.9.0_win32_amd64.zip`, sha256 `2b02444d46c9218fe2e6be66015265ce131fe6b7c384e33e630b00f9a0bff072` (cocok dengan `.sha256` resmi) |
| Vyper | `0.3.10+commit.9136169` | `uv pip install vyper==0.3.10` di `.venv-ape` (Python 3.11.16) |
| Vyper (referensi 3.0.2) | `0.3.7+commit.6020b8b` | `.venv-037` (Python 3.11.16) |
| solc | `0.8.18` | diunduh otomatis oleh `forge` (svm) |
| Python | `3.11.16` | `.venv-ape`, `.venv-037` — **bukan** Python global 3.13 |

`eth-ape` tidak dipakai untuk membuktikan bytecode: `ape` menambah lapisan resolver dependensi yang tidak diperlukan untuk dua file Vyper. Yang dipakai adalah compiler langsung, sehingga input dan output bisa diperiksa satu per satu.

## 2. Bukti A — reproduksi deployment Yearn yang sudah ada (VaultV3 `3.0.2`)

Sasaran: `VaultV3` yang benar-benar berjalan di mainnet (`0x1ab62413e0cf2eBEb73da7D40C70E7202ae14467`, `apiVersion() = "3.0.2"`, juga identik di Arbitrum, Base, Optimism).

```
git -C referensi/yearn-vaults-v3 worktree add .tmp/wt-v302 v3.0.2   # cb9be33
cd .tmp/wt-v302/contracts
../../../.venv-037/Scripts/vyper.exe --evm-version paris -f bytecode_runtime VaultV3.vy
cast code 0x1ab62413e0cf2eBEb73da7D40C70E7202ae14467 --rpc-url <mainnet>
```

| Output | Ukuran | `keccak256` |
|---|---|---|
| Hasil compile lokal | 23.675 byte | `0x4075239962ac41f7f4876a094deea45dfb667d719de30f4abceaf35348db9858` |
| Bytecode on-chain | 23.675 byte | `0x4075239962ac41f7f4876a094deea45dfb667d719de30f4abceaf35348db9858` |

**Hasil: identik byte-per-byte.** Ini membuktikan kombinasi `vyper 0.3.7` + `--evm-version paris` + optimizer default (gas) + metadata default adalah setelan yang dipakai Yearn untuk merilis 3.0.2. Tanpa bukti ini, "kita compile dari source yang sama" hanya asumsi.

Catatan penting: `#pragma optimize codesize` **tidak** ada di 3.0.2 (`VaultV3.vy` versi 3.0.2 hanya punya `# @version 0.3.7`), dan CLI 0.3.7 tidak punya mode `codesize`. Mode `codesize` baru muncul di 0.3.8+.

## 3. Bukti B — build pin kita (VaultV3 `3.1.1`)

Pin: `yearn-vaults-v3@f449264ff4f8bebe9a6bf72e43095304fdf101b8` (`git describe` = `v3.1.1-2-gf449264`; dua commit setelah tag hanya menyentuh CI/`package.json`/satu test, tidak menyentuh `contracts/`).

```
cd referensi/yearn-vaults-v3/contracts
../../../.venv-ape/Scripts/vyper.exe --optimize codesize --evm-version paris -f bytecode_runtime VaultV3.vy
```

| Artefak | Ukuran | `keccak256` |
|---|---|---|
| `VaultV3` runtime | 23.462 byte | `0x6909c58e42814ae46cadd909f29f19163751b77ff4a2ccf62c5a87e933e02be6` |
| `VaultV3` creation | 23.536 byte | `0xc00d80e0f2117e5b3b97f4c198dddc82bd96ee64529f8a5cd848e19eae94121b` |
| `VaultFactory` runtime | 3.604 byte | `0xdfc2a10112cf82c15ada486a586ff1a5bebd312e9dbe86ef8c13d92683bddec2` |
| `VaultFactory` creation | 3.834 byte | `0xde30ee1a9a055cc0097e5671a9dcf97f07c98c7d5e6c8b1a7f8a678d9fd9564f` |
| `VaultV3.vy` (source, 84.812 byte) | — | `0x2280663050d9179b7262a0a34db1aafa180e3bb4c8bce5be5564129a3f78c50a` |
| `VaultFactory.vy` (source, 11.997 byte) | — | `0x503baf38b18abe2c0e734955c5ff8420e3b390a54c3c7fe55833cf4012ebf2c4` |

Dua temuan yang mengubah cara kita membangun:

1. **`#pragma optimize codesize` di file dihormati hanya bila CLI tidak memberi flag.** Tanpa flag hasilnya sama dengan `--optimize codesize` (23.462 byte); dengan `--optimize gas` hasilnya 23.463 byte. Selisih satu byte, tapi cukup untuk mematikan verifikasi explorer. Build resmi harus selalu menyebut flag secara eksplisit.
2. **Tidak ada `VaultV3 3.1.1` yang ter-deploy di chain publik mana pun yang bisa dijadikan pembanding.** `VAULT_ORIGINAL` pada `VaultFactory` di mainnet/Arbitrum/Base/Optimism semuanya `0x1ab6…4467` dengan `apiVersion() = "3.0.2"`, dan itu immutable — factory tidak pernah di-upgrade. Jadi reproduksi untuk 3.1.1 hanya bisa dibuktikan lewat (a) determinisme build, dan (b) Bukti A yang membuktikan pipeline-nya benar. Keduanya dilakukan; tidak ada klaim "identik dengan deployment 3.1.1" karena deployment itu tidak ada.

Determinisme: dua kali compile berturut-turut menghasilkan hash yang sama (`0x6909c58e…`), dan output tanpa flag identik dengan output `--optimize codesize`.

## 4. Bukti C — TokenizedStrategy `v3.1.1` (Solidity) vs yang berjalan di `4663`

Pin yang benar: **tag `v3.1.1` = `48c53aba0395885b3f579d0a4b426de276a7b69e`**, bukan HEAD master.

```
git -C referensi/tokenized-strategy worktree add .tmp/wt-ts311 48c53ab
# lib/openzeppelin-contracts diisi OZ @ bd325d56b4c62c9c5c1aff048c37c6bb18ac0290 (v4.9.5)
cd .tmp/wt-ts311 && forge build src/TokenizedStrategy.sol
forge inspect src/TokenizedStrategy.sol:TokenizedStrategy deployedBytecode
```

| Output | Ukuran | `keccak256` |
|---|---|---|
| Compile lokal (constructor arg `0x0`) | 18.224 byte | `0xc38ff7fba7559858528ccb625981703664ef66733ed27809436d79b1aa604034` |
| Deployment nyata, mainnet `0x3110D1Eec90f0651C18e75AD37711A8777342504` | 18.224 byte | `0x38c3b5bb5cd304e4759807d31f37c440ff9cb9811b35c3c61b8c81e3d61fd16f` |
| Deployment nyata, Robinhood Chain `4663`, alamat sama | 18.224 byte | `0x38c3b5bb5cd304e4759807d31f37c440ff9cb9811b35c3c61b8c81e3d61fd16f` |

Hash berbeda karena dua hal yang bukan logika:
- **immutable `factory`** (32 byte di offset `1309` dan `11193`): lokal `0x0`, on-chain `0x000000000000000000000000311de24e48c360b9a7765e7ab7ecdbabcd27b134`.
- **metadata CBOR** 53 byte di akhir (IPFS CID berbeda karena path/settings build).

Setelah kedua bagian itu di-mask: **kode identik, 18.171 byte sisa, nol perbedaan byte.** Perintah pembuktian ada di `scripts/verify-bytecode.py`.

Konsekuensi desain: alamat `0x3110D1Eec90f0651C18e75AD37711A8777342504` **sudah ada di chain 4663** dan bytecode-nya sama dengan mainnet. Ini menghapus blocker yang tadinya diasumsikan: strategi kita tidak perlu men-deploy `TokenizedStrategy` baru, cukup memakai implementasi kanonik lewat `BaseStrategy.tokenizedStrategyAddress`.

## 5. Temuan kritis: pin `tokenized-strategy` master (9b7a1811) salah

| Fakta | Bukti |
|---|---|
| `9b7a1811` (HEAD master) **bukan** tag `v3.1.1`; `git describe` = `v3.0.0-beta-29-g9b7a1811` | `git describe --tags` |
| Tag `v3.1.1` = `48c53ab`, dan `9b7a181` **tidak** memuat `48c53ab` (`git merge-base` = `90514f1 build: v3.1.0`) | `git merge-base --is-ancestor v3.1.1 HEAD` → gagal |
| `48c53ab` menaikkan `API_VERSION` `"3.1.0"` → `"3.1.1"` dan mengubah `tokenizedStrategyAddress` `0x2e234DAe…` → `0x3110D1Ee…` | `git show 48c53ab` |
| `0x2e234DAe…` **tidak punya kode** di mainnet, Arbitrum, Base, Optimism, **maupun `4663`** (codesize 0). Komentar di source: "holder address based on expected deterministic location for testing" | `cast codesize` di 5 jaringan |
| `0x3110D1Eec90f0651C18e75AD37711A8777342504` punya kode di mainnet, Arbitrum, Base, dan `4663` (18.224 byte, hash sama) | `cast codesize`, `cast code` |
| `vault-periphery@672de1c` sudah mem-pin `tokenized-strategy` di tag `v3.1.1` (`48c53ab`), bukan master | `git submodule status` |

**Pin master akan menghasilkan strategi yang delegate-call ke alamat tanpa kode** — kontrak "berhasil" di-deploy tapi setiap panggilan gagal. Ini kesalahan yang tidak akan tertangkap unit test dengan mock.

**Keputusan: pin `tokenized-strategy` dikoreksi menjadi tag `v3.1.1` = `48c53aba0395885b3f579d0a4b426de276a7b69e`.** Ini juga menghapus konflik dengan `vault-periphery`. Perubahan tercatat sebagai amendemen ADR-1 di `docs/ARCHITECTURE.md`.

## 6. Keadaan chain `4663` (terukur)

RPC resmi `https://rpc.mainnet.chain.robinhood.com` **tidak bisa dipakai dari host ini**: sertifikat TLS kedaluwarsa menurut jam host, dan koneksi dialihkan ISP ke `internetsehat.iconpln.net.id`. Endpoint yang berfungsi:

| Endpoint | Chain ID | Arsip | Catatan |
|---|---|---|---|
| `https://robinhood-rpc.publicnode.com` | `4663` | tidak (403 `Archive requests require a personal token` untuk blok historis) | `latest` saja |
| `https://robinhood.drpc.org` | `4663` | **tidak lagi** — pin sudah dipangkas (`Unknown state. First available state is 1`); jendelanya ~150-200 blok | dipakai saat capture awal; sekarang hanya untuk blok dekat head, `eth_getLogs` dibatasi ~100 blok |
| `https://rpc.solidrpc.io/public/evm/4663` | `4663` | **ya** (keyless, melayani `118337511`) | dipakai `scripts/fork-test.py` |
| `https://robinhood.api.onfinality.io/public` | `4663` | **ya** (keyless, melayani `118337511`) | cadangan (`FORK_EXTRA_RPCS`) |
| `https://4663.rpc.thirdweb.com` | `4663` | tidak (`historical state ... not available`) | `latest` saja |

Snapshot: block `118337511`, timestamp `1795103654` (2026-11-19T14:34:14Z), hash `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af`.

Koreksi (2026-11-19): tabel ini sebelumnya mencampur nilai dari beberapa blok `latest` dengan hash/timestamp blok lain. Semua baris di bawah diukur ulang dengan `--block 118337511` pada `https://robinhood.drpc.org` saat blok itu masih dilayani, jadi satu state yang sama. Endpoint archive sekarang: `rpc.solidrpc.io/public/evm/4663` (utama) dan `robinhood.api.onfinality.io/public` (cadangan); `robinhood.dwellir.com` dan `robinhood-mainnet.public.blastapi.io` menolak chain ini, demo Alchemy `401`.

| Objek | Alamat | Hasil |
|---|---|---|
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` | **ada**, 11.838 byte |
| TokenizedStrategy v3.1.1 impl | `0x3110D1Eec90f0651C18e75AD37711A8777342504` | **ada**, 18.224 byte, hash = mainnet |
| TokenizedStrategy factory | `0x311de24e48C360B9A7765E7aB7eCDBABCd27B134` | **ada**, 3.826 byte |
| Placeholder master TS | `0x2e234DAe75C793f67A35089C9d99245E1C58470b` | **kosong** (0 byte) — konfirmasi §5 |
| Yearn `VaultFactory` | `0x444045c5C13C246e117eD36437303cac8E250aB0` | **kosong** (0 byte) — konfirmasi ADR-2 |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `symbol="USDG"`, `decimals=6`, `totalSupply=622.410.599,910270` |
| `steakUSDG` | `0xBeEff033F34C046626B8D0A041844C5d1A5409dd` | lihat di bawah |

`steakUSDG` pada block di atas:

| Field | Nilai | Metode |
|---|---|---|
| `name` / `symbol` | `Steakhouse USDG` / `steakUSDG` | `cast call` |
| `decimals` | **18** (share), asset 6 | `decimals()` |
| `asset` | USDG `0x5fc5…d168` | `asset()` |
| `totalAssets` | `538.856.055994280` USDG | `totalAssets()` |
| `totalSupply` | `531.418.644,510854399888342585` shares | `totalSupply()` |
| Harga per share | `1,013995` USDG (`convertToAssets(1e18) = 1013995`) | `convertToAssets` |
| `convertToShares(1e6)` | `986197776937474866` | pembulatan 18 desimal |
| `maxDeposit(0x0)` | `0` | **bukan** sinyal kapasitas: `deposit(10_000e6)` dari alamat baru tetap berhasil (`VENUE_INTEGRATIONS.md` §4a) |
| `curator()` | `0x9023FBD6A08C666491A2d1648737E400cF42D2Fb` | cocok dengan Morpho API |
| `liquidity()` | revert (tidak ada fungsi ini di Vault V2) | jangan andalkan; batas penarikan = kas idle venue (`USDG.balanceOf(venue)`), bukan `maxWithdraw` |

Implikasi untuk adapter (`docs/VENUE_INTEGRATIONS.md`):

1. **Share venue 18 desimal, asset 6 desimal.** Semua konversi wajib lewat `convertToAssets`/`convertToShares` venue; jangan pernah menyamakan jumlah share dengan jumlah asset. Ini juga alasan `convertToAssets(1e6)` mengembalikan `0` — 1 USDG = 0,000000000000986 share.
2. **`maxDeposit = 0` tidak membuktikan apa pun.** Getter itu membalas `0` untuk semua alamat (baru, holder, venue sendiri) sementara `deposit(10_000e6)` diterima dan share dicetak. `availableDepositLimit()` karena itu melaporkan `type(uint256).max` untuk nol dan `_deployFunds` mencoba deposit; percobaan yang ditolak membuat USDG tetap idle + event `VenueDepositSkipped`. Batas produk dijaga `deposit_limit`/debt cap vault, bukan getter venue. Lihat `VENUE_INTEGRATIONS.md` §4a.
3. **Tidak ada `liquidity()`.** Batas penarikan nyata = kas idle venue: `min(convertToAssets(balanceOf(strategy)), USDG.balanceOf(venue))`. **Jangan** pakai `maxWithdraw(alamatStrategi)`: pada blok pin getter itu membalas `0` untuk posisi yang berhasil ditebus penuh, jadi angka "dapat ditarik" di UI harus datang dari batas terukur itu (dengan `blockNumber` + `blockHash`).
4. Vault Yearn V3 belum ada di `4663` → kita tetap harus deploy `VaultFactory` sendiri (ADR-2), dan `TokenizedStrategy` tidak (sudah ada di alamat kanonik).

## 7. Cara mengulang semua bukti

```
# 1. toolchain
.tools/foundry/forge.exe --version
.venv-ape/Scripts/vyper.exe --version

# 2. bukti A + B + C (hash, mask immutable/metadata, bandingkan dengan chain)
./.venv-ape/Scripts/python.exe scripts/verify-bytecode.py all

# 3. verifikasi ulang artefak di packages/core/artifacts
./.venv-ape/Scripts/python.exe scripts/compile-vault.py --check
```

`scripts/verify-bytecode.py` membaca `packages/core/artifacts/*.json`, meng-compile ulang dari pin yang tercatat, dan membandingkan hash. Bila pin berubah, script gagal — bukan diam-diam menghasilkan hash baru.

## 8. Yang masih belum terbukti

1. Tidak ada deployment `VaultV3 3.1.1` di chain publik → tidak ada pembanding byte-per-byte untuk versi yang kita pakai (§3).
2. `vault-periphery@672de1c` membangun terhadap `yearn-vaults-v3@5b698f94` (branch `v3.1.0`); `Accountant`/`RoleManager`/`DebtAllocator` belum diuji terhadap ABI kita. Ini ticket 3 di epic 1.
3. Fork test Robinhood Chain **sudah ada** (`packages/contracts/test/fork/`, dijalankan `python scripts/fork-test.py`; `verify-all.py` sengaja tidak menjalankannya tanpa flag — `--with-fork` mendelegasikan ke script itu), tetapi hanya probe venue pada pin `118337511` — belum e2e vault (deploy → deposit → report → withdraw). `maxWithdraw` venue untuk alamat strategi **sudah** diukur dan terbukti tidak bisa dipakai; yang belum: pola perubahan kas idle venue antar blok.
4. Verifikasi source on-chain belum mungkin: explorer diblokir Cloudflare dan RPC publik tidak menyediakan endpoint verifikasi.
5. `docs/SECURITY_DIFF.md` belum ditulis; audit 2023 vs pin 2026 masih hutang.