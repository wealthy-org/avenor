# ACCOUNTING — Avenor (Yearn V3 `v3.1.1`)

Semua angka di sini berasal dari `VaultV3.vy@f449264f` (API `3.1.1`). Setiap definisi menyebut lokasi kode supaya engineering, UI, dan indexer memakai satu bahasa.

## 1. Besaran dasar

```
total_assets  = total_idle + total_debt                     # _total_assets(), :451-457
total_supply' = total_supply - unlocked_shares()            # _total_supply(), :445-449
pps           = total_assets / total_supply'                # pricePerShare(), untuk 10**decimals
```

- `total_idle`: asset yang benar-benar dipegang vault.
- `total_debt`: akumulasi `current_debt` per strategi (bukan nilai pasar strategi).
- `total_supply`: mencakup share yang dimiliki vault sendiri (`balance_of[self]`) untuk profit yang belum terbuka.
- `unlocked_shares()`: bagian share terkunci yang sudah terbuka secara linear (`:422-449`).

Konsekuensi penting: **`total_assets` tidak berubah karena transfer masuk ke vault.** Donasi USDG langsung ke alamat vault hanya menambah `ERC20.balanceOf`, dan baru diakui bila `process_report(address(vault))` dipanggil (`:1163-1175`). Karena itu nilai yang dipakai UI tidak boleh dihitung dari `balanceOf(vault)`.

## 2. Konversi dan pembulatan

| Arah | Fungsi | Pembulatan |
|---|---|---|
| shares → assets (quote withdraw) | `convertToAssets` | `ROUND_DOWN` |
| shares → assets (mint requirement) | `_convert_to_assets(..., ROUND_UP)` | `ROUND_UP` |
| assets → shares (deposit) | `convertToShares` | `ROUND_DOWN` |
| assets → shares (withdraw requirement) | `_convert_to_shares(..., ROUND_UP)` | `ROUND_UP` |

Aturan ini konsisten dan menguntungkan vault pada sisa pembulatan (dust). Frontend **wajib** memanggil `previewDeposit/previewMint/previewWithdraw/previewRedeem` on-chain, tidak menghitung sendiri. `assets` dan `shares` memakai decimals yang sama dengan asset (vault mewarisi `decimals` asset, `:329-330`); USDG = 6, jadi **tidak ada konversi 18↔6** di jalur vault.

## 3. Report: gain, loss, fees

`_process_report(strategy)` (`:1149-1362`) melakukan, berurutan:

1. `total_assets_strategy = IStrategy(strategy).convertToAssets(IStrategy(strategy).balanceOf(vault))`.
2. `current_debt = strategies[strategy].current_debt`; `gain = total_assets - current_debt` atau `loss = current_debt - total_assets`.
3. Bila `accountant != 0`: `(total_fees, total_refunds) = IAccountant(accountant).report(strategy, gain, loss)`.
4. `shares_to_burn = convert_to_shares_round_up(loss + total_fees)` — loss **langsung** dibakar dari supply; tidak diangsur.
5. Bila ada fees: `total_fees_shares` dicetak ke accountant; bila `factory.protocol_fee_config()` memberikan `protocol_fee_bps > 0`, sebagian share diteruskan ke `protocol_fee_recipient`.
6. Bila ada `gain + refunds`: `shares_to_lock` dicetak **ke vault sendiri**, lalu dibuka linear selama `profit_max_unlock_time`.
7. `current_debt` disesuaikan (`+= gain`, `-= loss`), `total_idle += refunds`; `strategies[strategy].last_report = block.timestamp`.
8. Event `StrategyReported(strategy, gain, loss, currentDebt, protocolFees, totalFees, totalRefunds)`.

Implikasi untuk produk:

- **Loss tidak bisa disembunyikan dengan menunda report**, tetapi juga **tidak muncul sampai report dijalankan**. `total_assets` hanya melihat `current_debt`, jadi drawdown strategi yang belum dilaporkan tidak terlihat di `pps`. Karena itu `last_report` dan `report freshness` adalah data wajib di UI, bukan hiasan.
- Gain tidak menaikkan `pps` sekaligus; ia naik linear selama `profit_max_unlock_time` (dalam detik, di-set saat deploy/`setProfitMaxUnlockTime`). Chart "net return" harus menghitung dari `pps` aktual, bukan dari `gain` mentah.
- Report pada `strategy == vault` (`process_report(address(vault))`) hanya menyerap airdrop asset ke `total_idle`. Berguna untuk memindahkan donasi ke accounting, bukan untuk mengklaim yield.

## 4. Fees: tiga lapis yang harus dijumlahkan

| Lapis | Mekanisme | Yang terlihat user |
|---|---|---|
| Venue (Morpho) | Kurva `totalAssets` vault venue; performance/management fee diambil oleh curator venue | APY venue bersih yang kita kutip harus dari `netApy` venue, bukan `apy` |
| Strategi Avenor | Bila memakai Tokenized Strategy: fee di sisi strategi (bila diset) | Fee strategi |
| Vault Avenor | `Accountant.report()`: `performanceFee` (bps), `refundRatio`, `maxGain`, `maxLoss`, `maxFee` | Fee produk + penerima |
| Protokol | `VaultFactory.protocol_fee_config()` → `protocol_fee_bps` (maks `5000` = 50% dari fee accountant) + `protocol_fee_recipient` | Baris "protocol fee" terpisah |

`Accountant` (periphery `src/accountants/Accountant.sol`) membatasi `totalFees = min(gain * maxFee / MAX_BPS, totalFees)`; `MAX_BPS = 10_000`. Fee dibayar dalam **shares**, bukan asset — artinya fee ikut menikmati (atau menanggung) pergerakan berikutnya setelah dicetak.

High-water mark: **tidak ada** di `VaultV3` maupun `Accountant` upstream. Bila kita memasarkan HWM, itu fitur baru yang harus dispesifikasikan dan diuji (brief §10); baseline = fee per report atas gain positif.

## 4b. Strategy-level valuation is live, vault-level valuation is report-boundary

`MorphoVaultStrategy` overrides `_strategyTotalAssets()` to return `_totalAssets()` (idle +
`venue.convertToAssets(venueShares)`), not `TokenizedStrategy.lastTotalAssets()`.

Itu bukan pilihan gaya, itu syarat agar posisi bisa dilaporkan sama sekali.
`VaultV3._process_report` (`VaultV3.vy:1069`) menghitung gain/loss dari
`IStrategy(strategy).convertToAssets(IStrategy(strategy).balanceOf(self))` dan **tidak
pernah** memanggil `strategy.report()`. Default `BaseStrategy._strategyTotalAssets()`
(`BaseStrategy.sol:237-244`) mengembalikan `lastTotalAssets`, yang hanya bergerak saat
*strategi* report — dan tidak ada yang memanggilnya. Dengan default itu, gain maupun loss
venue tidak akan pernah terlihat oleh vault: `current_debt` tidak bisa naik, loss tidak bisa
dibukukan, dan `update_debt` hanya bisa menunggu angka yang tidak pernah datang.

Konsekuensi yang harus dipertahankan:

- Batas report tetap di **vault**, bukan di strategi. `VaultV3.totalAssets()` hanya bergerak
  saat `process_report`; pps user-facing tetap report-boundary, jadi tidak ada nilai yang
  bisa disandwich di dalam satu blok.
- `_harvestAndReport()` dan `_strategyTotalAssets()` **wajib** mengembalikan angka yang sama.
  Kalau berbeda, keeper menilai posisi dengan satu angka dan vault melaporkan angka lain.
- Live read hanya boleh membaca venue (`totalAssets()`/`convertToAssets`), tidak boleh
  menulis state. Override ini tidak menambah vektor manipulasi baru: venue tetap satu-satunya
  oracle, dan `_freeFunds` tetap revert bila venue tidak bisa memenuhi withdrawal.
- Dampak ke test: `test_strategyTotalAssetsIsLiveSoTheVaultCanSeeTheVenue` mengunci perilaku
  ini, dan `test/unit/AccountantFees.t.sol` membuktikan gain venue benar-benar sampai ke
  `totalAssets` vault lewat `process_report`.

## 5. Profit unlocking

- `profit_max_unlock_time` disimpan per vault; perubahan lewat `setProfitMaxUnlockTime` (role `PROFIT_UNLOCK_MANAGER`).
- Bila `profit_max_unlock_time == 0`, profit langsung terakui (tidak ada share terkunci) dan `total_fees` dihitung ulang dalam assets (`:1345-1348`).
- Share terkunci dimiliki vault; `balanceOf(vault) > 0` adalah sinyal "ada profit belum terbuka" yang harus tampil di UI sebagai **pending/unrealised profit**, bukan sebagai TVL tambahan.
- `last_profit_update` + `full_profit_unlock_date` memberi dasar estimasi kapan `pps` berhenti naik karena report terakhir.

## 6. Definisi angka untuk UI (wajib, anti double-count)

| Label UI | Sumber on-chain | Larangan |
|---|---|---|
| Vault TVL | `totalAssets()` (idle + debt, sudah bersih dari share terkunci di sisi supply) | Jangan `idle + Σ(shares strategi × pps strategi)` — itu double count dengan `total_debt` |
| Nilai posisi user | `convertToAssets(balanceOf(user))` | Jangan `saldo deposit + yield` versi frontend |
| Dapat ditarik sekarang | `maxWithdraw(user)` vault pada block terakhir — di dalamnya `availableWithdrawLimit` strategi = idle + `min(nilai posisi venue, kas idle venue)` (lihat `WITHDRAWAL_SEMANTICS.md` §6) | Jangan samakan dengan nilai posisi; jangan turunkan angka ini dari `venue.maxWithdraw()` (venue utama membalas `0` walau kas ada) |
| Pending profit | `balanceOf(vault)` → `convertToAssets` | Jangan masukkan ke TVL/TVL chart |
| Net return vault | Δ`pricePerShare()` per window, fee sudah tertanam | Jangan kurangi fee lagi; jangan pakai `apy` venue |
| Underlying venue APY | `netApy` venue, ber-timestamp | Jangan label "vault APY" |

`maxWithdraw(owner, max_loss=0, strategies=[])` mengembalikan `0` saat `paused` (`:592`), dan **tidak** memperhitungkan loss yang belum terealisasi dalam jumlah yang dikembalikan (hanya dipakai untuk mengecek `max_loss`). Artinya `maxWithdraw` = batas atas, bukan janji hasil. Perhatikan default argumennya juga: `maxWithdraw` memakai `max_loss = 0`, `maxRedeem` memakai `max_loss = MAX_BPS` — dua default berlawanan, sama seperti `withdraw` vs `redeem`.

Catatan terpisah, mudah tertukar: `maxWithdraw` **vault** (di atas, jujur karena dihitung dari `current_debt` + limit strategi) berbeda dari `maxWithdraw` **venue** (ERC-4626 di bawah strategi). Getter venue tidak boleh dipakai sebagai sinyal: pada block `118337511` `steakUSDG` membalas `0` untuk posisi 8,21 juta share yang justru bisa ditebus penuh 8.328.471,0105 USDG. Adapter mengukur `min(convertToAssets(balanceOf(strategy)), USDG.balanceOf(venue))`.

## 7. Seed, dust, dan serangan awal

- `_convert_to_shares` mengembalikan `assets` saat `total_supply == 0` → share pertama 1:1. Tidak ada virtual shares/decimals offset di core.
- `_deposit` menolak `assets == 0` dan `shares == 0` (`:676-681`) sehingga deposit yang membulatkan ke nol revert, bukan diam-diam hilang.
- Donasi ke vault tidak menaikkan `total_assets` (§1), jadi varian "inflation attack via direct transfer" tidak menaikkan `pps`; namun **deposit pertama + rounding** tetap harus diuji, dan kebijakan kita: seed awal dari treasury (mis. 1.000 USDG) atau minimum deposit, diputuskan di `ARCHITECTURE.md` ADR-7. Jangan mengklaim "virtual shares" karena core ini tidak memilikinya.
- Dust pembulatan menguntungkan vault; test invariant harus membuktikan tidak ada jalur `mint`/`burn` yang menguntungkan attacker melebihi 1 unit asset per transaksi.

## 8. Rekonsiliasi indexer

Indexer wajib menyimpan per-event: `chainId`, `blockNumber`, `blockHash`, `txHash`, `logIndex`, `contractAddress`, `contractVersion` (`apiVersion()`), dan `ingestionStatus`. Snapshot `SharePriceSnapshot` dihitung dari `pricePerShare()` pada block tsb, bukan dari agregasi event semata. Rekonsiliasi harian: `totalAssets()`, `totalSupply()`, `totalIdle()`, `totalDebt()`, `strategies(s).currentDebt`, `balanceOf(vault)` dibandingkan dengan hasil event replay; selisih > toleransi = alert, bukan koreksi diam-diam.