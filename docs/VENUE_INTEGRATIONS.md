# VENUE_INTEGRATIONS — Avenor

Aturan brief §5: tidak ada venue masuk produksi hanya karena TVL-nya besar. Setiap venue harus lolos gate di §1, dengan bukti yang bisa diperiksa ulang.

## 1. Gate venue (hard requirements)

| # | Syarat | Cara membuktikan | Gagal = |
|---|---|---|---|
| G1 | Alamat kontrak terverifikasi di explorer chain `4663`, source cocok dengan commit upstream | baca source + bandingkan bytecode/hash. **Explorer memblokir host ini (Cloudflare)**, jadi jalur yang dipakai: baca bytecode via `eth_getCode` + bandingkan keccak runtime dengan build lokal dari source commit yang diklaim (`scripts/verify-bytecode.py`). Untuk `steakUSDG` (Morpho Vault V2) jalur ini belum selesai — status `research` | tidak masuk katalog |
| G2 | Asset yang dipakai benar-benar USDG `0x5fc536...d168` (decimals 6) | `asset()` / `want()` on-chain | tidak masuk |
| G3 | Semantik withdraw terukur: `maxWithdraw(strategy)` dan biaya keluar (queue/cooldown) | panggil on-chain, ulangi di 3 block berbeda | status `research` |
| G4 | Fee terbaca on-chain (`fee`, `curatorFee`, `performanceFee`) — bukan dari marketing | baca kontrak + event | status `research` |
| G5 | Risiko loss dapat dijelaskan (bad debt, oracle, counterparty) dalam satu paragraf | dokumen venue + review | tidak masuk |
| G6 | Batas konsentrasi: satu venue ≤ `maxRatio` (v1: 80%), dan venue kecil ≤ TVL-nya × 5% | dihitung keeper sebelum alokasi | alokasi ditolak |
| G7 | Kode integrasi punya test fork: deposit → report → withdraw penuh | `packages/contracts/test/fork/` | tidak deploy |
| G8 | Bisa di-revoke tanpa menahan dana user selamanya (`force_revoke` path diuji) | test + runbook | tidak deploy |

## 2. Temuan lapangan (chain 4663, diambil 2026-11-19 via Morpho Blue API)

| Vault | Simbol | TVL USD | Likuiditas segera USDG | APY / net | Catatan |
|---|---|---|---|---|---|
| Steakhouse USDG | `steakUSDG` `0xBeEff033F34C046626B8D0A041844C5d1A5409dd` | 538.4M | 73.5M (**13,6%**) | 3,71% / 3,71% | venue utama; likuiditas besar secara absolut, tapi bukan 100% |
| Galaxy USDG RH Stock Tokens | `gUSDGst` `0xd0dACE70434fF7567b108B5a8c2a36C150C830FE` | 503.0K | 255.3K (50,7%) | 0,74% / 0,69% | risk profile beda (equity-linked) |
| Yearn Stonk USDG | `ymvST-USDG` `0x8c258F25fc6fBe3f01ccC828E2C3840A46a4a9A2` | 208.2K | 205.3K (98,6%) | 3,79% / 3,40% | **Morpho vault yang dikurasi Yearn**, bukan vault Yearn V3 |
| Grove x Steakhouse | `groveUSDG` `0xBEEff039907422219Fb367e525954DDC092854d9` | 100.0K | 100.0K | 0,00% | yield nol, hanya parkir |
| Purinta USDG | `PurintaUSDG` `0x37788ff0c1d4e45A7FE06BC7e71e0cc00121d0A8` | 67.3K | 53.6K | 5,70% / 5,41% | kecil, kurator tunggal |
| NetNet Credit | `nnUSDG` `0x99347d5F70D3838763f6Bddcf80304C8aa953B57` | 641.5K | **0** | 19,04% / 16,99% | likuiditas nol → tidak bisa jadi venue penarikan |

Angka baris `steakUSDG` yang sudah dikonfirmasi langsung on-chain (block `118337511`, bukan estimasi API): `name="Steakhouse USDG"`, `asset` USDG 6 desimal, **`decimals=18`**, `totalAssets=538856055994280` (538.856.055,99 USDG), `totalSupply=531418644510854399888342585`, `convertToAssets(1e18)=1013995` (pps `1.013995`), `convertToShares(1e6)=986197776937474866`, `maxDeposit(0x0)=0`, `curator()=0x9023FBD6A08C666491A2d1648737E400cF42D2Fb`, `liquidity()` **revert** (fungsi Vault V2 tidak ada di venue ini), dan **`USDG.balanceOf(venue)=27024457979514`** (27.024.457,979514 USDG idle — ini batas pembayaran nyata, lihat §4).

Kesimpulan yang harus dipakai di PRD dan UX:

1. **Hanya satu venue yang layak jadi venue utama** (`steakUSDG`). Kapasitas keluarnya = kas idle venue: `27.024.457,979514 USDG` pada blok pin (≈5,0% TVL), bukan 100% dan bukan "13,6%" yang dikutip API. Kombinasi "yield 3,7% + exit penuh 100%" tidak ada.
2. Kolam kedua harus **venue berbeda kurator + batas konsentrasi**, bukan dua vault dari kurator yang sama.
3. `nnUSDG` dan vault kecil lain dipakai sebagai bukti gate berjalan: APY tinggi tanpa likuiditas = tidak masuk produk.
4. Nama "Yearn Stonk" tidak berarti infrastruktur Yearn V3 tersedia di chain ini. Belum ada bukti factory Yearn V3 resmi di `4663` (lihat `BASELINE.md` §6), jadi kita deploy sendiri.

## 3. Bentuk integrasi: adapter Yearn `TokenizedStrategy` di atas ERC-4626 venue

```
User ──deposit──► VaultV3 (USDG) ──update_debt──► Strategy (TokenizedStrategy, USDG)
                                                     │ deposit/redeem
                                                     ▼
                                          Morpho Vault V2 (steakUSDG, ERC-4626)
                                                     │
                                                     ▼
                                          venue internals (Morpho Blue markets)
```

Prinsip implementasi:

- Strategi memegang USDG, bukan share vault lain. Semua nilai dilaporkan dalam USDG.
- **Share venue 18 desimal, asset 6 desimal.** Jangan pernah memperlakukan share `steakUSDG` sebagai 1:1 dengan USDG; semua konversi lewat `convertToAssets`/`convertToShares`/`previewRedeem`. Salah desimal di sini = kesalahan 10^12 pada debt vault dan pada batas likuiditas.
- `totalAssets()` strategi = `venue.convertToAssets(venue.balanceOf(strategy)) + asset.balanceOf(strategy)`. Jangan memakai `previewRedeem` untuk accounting (rounding berlawanan arah dengan deposit).
- `_deployFunds(amount)`: clamp ke `venue.maxDeposit(address(this))` **hanya bila hasilnya > 0**; `maxDeposit = 0` diperlakukan sebagai "tanya venue dengan mencoba", bukan "mustahil" (§4a: venue ini membalas `0` untuk semua alamat lalu menerima `deposit(10_000e6)`). `forceApprove(venue, amount)`, `venue.deposit(amount, address(this))`, lalu `forceApprove(venue, 0)` di **kedua** jalur. Bila venue menolak, USDG tetap idle dan skip itu **tercatat** lewat event `VenueDepositSkipped(amount, reason)` — bukan diam-diam, dan bukan revert yang mematikan jalur `deposit` vault. Shares 0 setelah deposit sukses = revert (`DepositMintedNoShares`), karena approve tanpa share adalah kerugian senyap.
- `_freeFunds(amount)`: bila batas terukur (§4) `< amount`, **revert** (`VenueLiquidityShortfall`), jangan mengembalikan penarikan parsial. `_freeFunds` bertipe `void` — ia tidak bisa "mengembalikan kurangnya" ke `TokenizedStrategy`.
  Alasan dari sumber pin (`TokenizedStrategy.sol:1156-1181`): `freeFunds(assets - idle)` dipanggil, lalu shortfall dihitung sebagai `loss`; dengan `max_loss` default `redeem = 10000` penarikan parsial **lolos** gate dan shares user tetap di-burn penuh → kerugian senyap. Natspec `BaseStrategy.sol:195-200` juga menyarankan revert bila posisi sekadar tidak likuid.
- **Jangan pakai `venue.maxWithdraw()` sebagai batas.** Di venue ini getter itu mengembalikan `0` untuk posisi yang justru bisa ditebus penuh (§4). Batas yang dipakai `_venueLiquidity()`: `min(convertToAssets(balanceOf(strategy)), asset.balanceOf(venue))` — nilai posisi dibatasi kas idle venue, karena itulah satu-satunya yang ditegakkan venue (penarikan melebihi kas = revert).
- **Jangan percaya nilai balik `venue.withdraw()`.** Di venue ini `withdraw(assets, …)` mengembalikan **share yang dibakar** (18 desimal), bukan asset yang dibayar; `redeem()` justru mengembalikan asset. `_freeFunds` karena itu mengukur `asset.balanceOf(strategy)` sebelum/sesudah dan membandingkan **delta** dengan `amount` (§4a). Membandingkan nilai balik 18 desimal dengan nilai asset 6 desimal akan lolos untuk pembayaran berapa pun.
- `availableWithdrawLimit()`: `idle strategi + _venueLiquidity()`, dengan overflow di-clamp ke `type(uint256).max`. Ini satu-satunya sinyal likuiditas ke vault; tidak ada partial fill di adapter.
- `availableDepositLimit()`: `venue.maxDeposit(strategy)` (bukan cap hardcode) bila hasilnya > 0; bila `0`, dilaporkan `type(uint256).max` supaya `VaultV3.update_debt` tidak menjadi no-op permanen (§4a). Batas produk tetap dijaga `deposit_limit`/debt cap vault, dan venue yang benar-benar tutup tetap membuat dana idle (dengan event skip), bukan alokasi paksa.
- `_harvestAndReport()`: `view`, melaporkan `idle + venue.convertToAssets(venue.balanceOf(this))`. Jangan melaporkan gain yang belum terealisasi dari oracle.
- `_tend`/`tendTrigger`: tidak wajib untuk venue ERC-4626 pasif; jangan menambah kompleksitas tanpa kebutuhan.
- `shutdownWithdraw(_amount)`: memakai `freeFunds` yang sama, jadi tetap revert bila venue tidak likuid. Untuk memaksa keluar seluruh posisi gunakan `emergencyWithdraw` (mensyaratkan `paused`/`shutdown`) yang me-redeem seluruh share dan mengabaikan `_amount`.

Batasan yang tidak boleh dilanggar:

- Tidak ada leverage, pinjaman, atau loop antar venue di v1.
- Tidak ada DEX swap di jalur user (v1 hanya USDG → USDG).
- Tidak ada `delegatecall` ke venue.
- Strategi tidak boleh memegang token selain USDG di akhir transaksi (allowance ke venue di-reset ke 0 setelah deposit, sesuai pola `VaultV3`).

## 4. Verifikasi on-chain: apa yang sudah, apa yang belum

Sudah dikonfirmasi via RPC pada block `118337511` (lihat §2 dan `docs/BASELINE.md` §7): `asset()`, `symbol()`, `name()`, `decimals()`, `totalAssets()`, `totalSupply()`, `convertToAssets`, `convertToShares`, `maxDeposit(0x0)`, `curator()`.

**Likuiditas nyata, diukur ulang lewat fork pada block `118337511` (bukan kesimpulan dari getter):**

| Fakta terukur | Nilai |
|---|---|
| `USDG.balanceOf(venue)` — kas idle | `27024457979514` (27.024.457,979514 USDG) |
| `maxWithdraw(holder)`, `maxRedeem(holder)` | **`0`**, juga saat `msg.sender = holder` |
| `maxDeposit(alamat baru)` | `0` — **bukan** gate: `deposit` tetap jalan (§4a) |
| Posisi `0x32Ba0BD09218b1b93681ecF83304A1E5566421f1` | `8213519595843454223149753` share |
| `withdraw(1e6)` oleh holder | **berhasil**, menerima tepat `1000000`, membakar `986197776937474867` share |
| `withdraw(8_328_000e6)` oleh holder | **berhasil**, membakar `8213055086335290685327046` share |
| `redeem` seluruh posisi holder | **berhasil**, membayar `8328471010500` (8.328.471,0105 USDG) |
| `withdraw(30_000_000e6)` (melebihi kas idle) | **revert** (payload tidak stabil: `Panic(0x11)` di sebagian run, data kosong di run lain) |
| `maxDeposit(alamat baru)` lalu `deposit(10_000e6)` | `maxDeposit` = `0`, tetapi deposit **berhasil**: memakan tepat `10000000000`, mencetak `9861977769374748661535` share |
| Nilai balik `withdraw(2_000e6)` | `1972395553874949732308` = **share yang dibakar**, bukan asset. USDG yang benar-benar diterima `2000000000` |
| Nilai balik `redeem` | asset (`7999999999` untuk sisa posisi probe), konsisten dengan ERC-4626 |

### 4a. Getter venue berbohong dua kali — dan itu mengubah adapter

Diukur di blok `118337511` dengan alamat sekali pakai (`test/fork/VenueProbe.t.sol::test_depositSucceedsWhileMaxDepositReportsZero`):

1. **`maxDeposit` menjawab `0` untuk semua alamat, tetapi `deposit` jalan.** Bukan "vault penuh", bukan "gate kurator": deposit nyata diterima dan share dicetak pada harga pin. Konsekuensi lama: `VaultV3._update_debt` membaca `IStrategy(strategy).maxDeposit(vault)`, adapter meneruskannya, dan hasilnya `0` → `return current_debt` tanpa transfer. Artinya **seluruh alokasi ke venue mustahil** dan semua deposit vault akan menganggur selamanya — produk yang "aman" tapi tidak menghasilkan apa pun. Adapter sekarang tidak memercayai nol: `availableDepositLimit()` melaporkan "tanpa batas adapter" dan `_deployFunds` menemukan batas nyata dengan mencoba; venue yang benar-benar tutup membuat dana idle + event `VenueDepositSkipped`.
2. **`withdraw` mengembalikan share, bukan asset.** `withdraw(2_000e6)` membayar tepat `2_000,000000` USDG dan mengembalikan `1_972_395_553_874_949_732_308` (share 18 desimal yang dibakar). `redeem` di venue yang sama mengembalikan asset. Kode lama membandingkan nilai balik itu dengan `amount` 6 desimal — perbandingan dua satuan berbeda yang selalu lolos. `_freeFunds` sekarang mengukur delta saldo USDG.

Keduanya diuji dua kali: unit test dengan `MockVenue` yang meniru kebohongan (`setMaxDepositLies`, `setWithdrawReturnsShares`), dan fork test terhadap `steakUSDG` asli.

Koreksi penting terhadap versi dokumen sebelumnya: klaim "venue menawarkan **nol** likuiditas segera" **salah**, dan kesimpulan turunannya ("hanya `min(maxWithdraw, nilai posisi)` yang boleh ditampilkan") juga salah. Yang benar:

- `maxWithdraw`/`maxRedeem` di venue ini **bukan sinyal likuiditas**. Keduanya `0` sementara venue memegang 27,02 juta USDG idle dan membayar seluruh posisi 8,33 juta.
- Yang mengekang pembayaran adalah **kas idle venue**: `redeem` 8,328 juta berhasil, `withdraw` 30 juta (lebih besar dari kas) revert. Tidak ada queue/cooldown yang teramati pada rentang ini; venue ERC-4626 biasa.
- Karena itu adapter **mengukur**, tidak bertanya: `_venueLiquidity() = min(convertToAssets(balanceOf(strategy)), USDG.balanceOf(venue))`. Kalau adapter memakai `maxWithdraw`, ia akan melaporkan "tidak ada yang bisa ditarik" saat uangnya ada — bug diam-diam yang sudah ditutup di kode dan diuji di unit + fork.
- Untuk UI, angka "dapat ditarik" = batas terukur itu, disertai `blockNumber` + `blockHash`. Klaim "13,6% bisa ditarik instan" tetap **tidak boleh** dipakai: kas idle ≈5,0% TVL, dan itu angka yang bergerak tiap blok.
- Desain revert (`VenueLiquidityShortfall`) tetap benar, tetapi alasannya bukan "partial fill = loss": venue memang tidak bisa membayar lebih dari kasnya, dan permintaan di atas kas gagal dengan panic aritmetika yang tidak bisa dijelaskan ke user. Adapter memotong lebih dulu supaya kegagalan itu tidak pernah sampai ke user sebagai revert mentah.

Reproduksi: `python scripts/fork-status.py` memeriksa apakah blok pin masih dilayani; `python scripts/fork-test.py` mem-fork blok itu lewat `anvil` lokal dan menjalankan `packages/contracts/test/fork/VenueProbe.t.sol`, yang meng-assert angka di tabel ini (payload revert di atas kas **tidak** di-pin — lihat catatan tes). Pada 2026-11-19 endpoint publik gratis (`drpc`, `publicnode`, `thirdweb`) memangkas blok ini dalam hitungan menit; yang masih melayani adalah `https://rpc.solidrpc.io/public/evm/4663` dan `https://robinhood.api.onfinality.io/public`. Fork test tetap **skip loud** (atau gagal bila `FORK_STRICT=true`) ketika pin tidak tersedia — lihat §7.

Belum:

- **Source `steakUSDG` di explorer tidak terbaca dari host ini (Cloudflare).** Harus dibuktikan lewat jalur bytecode-hash: bangun Morpho Vault V2 dari commit yang diklaim lalu bandingkan keccak runtime. Selama ini belum, status venue tetap `research`, bukan `approved`.
- `maxWithdraw`/`maxRedeem` **sudah** diukur dan terbukti tidak bisa dipakai (tabel di atas); perilaku penarikan kecil (1e6) dan besar (8,328 juta) juga sudah diukur dan berhasil. Yang belum: seberapa cepat kas idle venue berubah karena alokasi kurator ke pasar Morpho Blue — butuh sampling beberapa blok, bukan satu pin.
- Perilaku fee venue: apakah fee dipotong di `totalAssets` (accrual) atau lewat shares; mempengaruhi `netApy` yang kita kutip. `fee()` belum dibaca.
- Apakah ada batas `deposit` per blok / per alamat (gate contract). Bila ada, `availableDepositLimit` strategi harus mencerminkannya.
- Apakah penarikan punya cooldown (queue) — belum terlihat dari API. Harus diuji dengan simulasi `redeem` pada fork.
- `isAllocator()` / whitelist alokasi untuk strategi kita — belum diuji, dan ini gate sebelum `_deployFunds` pertama di fork.

## 5. Venue kandidat berikutnya (status: research, bukan komitmen)

| Kandidat | Status | Syarat sebelum masuk |
|---|---|---|
| Morpho Blue market supply USDG langsung | research | pilih market dengan LLTV konservatif + oracle terverifikasi; hitung bad debt historis |
| Aave V3 di `4663` | **belum terbukti ada** | verifikasi `PoolAddressesProvider` resmi; jangan asumsikan |
| Yearn V3 vault pihak lain / `ymvST-USDG` | research | ini venue pihak ketiga, bukan infrastruktur kita; risiko kurator + double fee |
| RWA/stock-token venue (`gUSDGst`) | research | profil risiko ekuitas, jam pasar, oracle — tidak untuk produk "managed yield" default |

## 6. Kegagalan yang harus ditangani adapter

| Mode | Deteksi | Aksi |
|---|---|---|
| Kas idle venue turun mendadak | monitoring `USDG.balanceOf(venue)` vs `totalAssets` venue (bukan `maxWithdraw`; lihat §4) | keeper recall + alarm; UI turunkan "dapat ditarik" |
| Venue pause/deprecate | `deposit`/`withdraw` revert (event `VenueDepositSkipped` muncul). **`maxDeposit = 0` bukan sinyal** — `steakUSDG` membalas 0 sambil menerima deposit (§4a) | `_deployFunds` berhenti mengalokasikan (dana idle, event tercatat), penarikan lewat batas terukur; `maxDeposit = 0` + `deposit` sukses **tidak** dianggap pause |
| Loss venue (bad debt) | report selisih `totalAssets` < `current_debt` | `process_report` → loss dibakar, atau `maxLoss` Accountant menolak → `force_revoke` |
| Share venue tidak bisa ditebus | `redeem` revert konsisten | eskalasi insiden; jangan mengklaim "funds safe" |
| Oracle venue salah | gain/loss ekstrem | `maxGain`/`maxLoss` healthcheck Accountant menahan report |

## 7. Monitoring minimal per venue (dipakai keeper + indexer)

`totalAssets`, `USDG.balanceOf(venue)` (kas idle — batas penarikan nyata), `maxDeposit(strategy)`, `balanceOf(strategy)`, `fee()`, `curator()`, `lastReport/accrual timestamp`, plus delta harian. `maxWithdraw(strategy)` boleh disimpan sebagai pembanding, tetapi **bukan** sumber alarm: nilainya `0` di venue ini walau uang ada. Semua disimpan dengan `blockNumber` + `blockHash`; alarm bila kas idle turun > 25% dalam 24 jam atau bila `totalAssets` turun tanpa event penarikan.