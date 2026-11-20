# FEE_CONFIG — Avenor

Tujuan: satu definisi fee yang bisa dihitung ulang oleh siapa pun dari state on-chain, tanpa marketing di antaranya.

## 1. Di mana fee benar-benar diambil

Fee Avenor **tidak** dipotong saat deposit/withdraw. Fee diambil di dalam `process_report` lewat `Accountant.report(strategy, gain, loss)` (`VaultV3.vy:1189-1216`), dibayar dalam **shares vault**, lalu sebagian diteruskan sebagai protocol fee ke `protocol_fee_recipient` milik factory.

Tidak ada fungsi "withdraw fee" terpisah; fee hidup sebagai shares milik `accountant` dan `fee_recipient` dan nilainya mengikuti `pps`.

## 2. Parameter `Accountant` (periphery `src/accountants/Accountant.sol`)

```solidity
struct Fee {
    uint16 managementFee;   // annual, bps, dihitung dari current_debt × duration
    uint16 performanceFee;  // bps dari gain
    uint16 refundRatio;     // bps dari loss yang diganti dari saldo asset milik Accountant
    uint16 maxFee;          // batas total fee sebagai % dari gain (0 = tidak dibatasi)
    uint16 maxGain;         // healthcheck: revert bila gain > current_debt × maxGain
    uint16 maxLoss;         // healthcheck: revert bila loss > current_debt × maxLoss (10000 = nonaktif)
    bool   custom;          // pakai customConfig[vault] alih-alih defaultConfig
}
```

Perilaku yang terverifikasi (`report()`):

1. `managementFee` dihitung **selalu**, termasuk saat loss: `current_debt × duration × managementFee / MAX_BPS / SECS_PER_YEAR` (`:206-215`).
2. `performanceFee` hanya bila `gain > 0` (`:233`).
3. `maxGain`/`maxLoss` adalah **healthcheck**: bila dilanggar, `report` **revert** (bukan memotong nilai). Keeper yang melaporkan gain tak wajar akan gagal, bukan diam-diam mencuri. `skipHealthCheck` adalah escape hatch satu kali yang harus tercatat.
4. `refundRatio` membayar kembali sebagian loss memakai **saldo asset milik kontrak Accountant**, dibatasi `balanceOf(accountant)` (`:250-263`). Bila saldo kosong, refund = 0 — janji "loss protection" tanpa pendanaan adalah bohong.
5. `maxFee` memotong `totalFees`: `min(gain × maxFee / MAX_BPS, totalFees)` (`src/accountants/Accountant.sol:267-269`).

**Jebakan yang wajib diketahui:** karena `maxFee > 0` memakai `gain` sebagai basis, saat `gain == 0` hasilnya `totalFees = 0` — artinya **management fee hilang pada report yang loss**. Pilihan yang konsisten:

- Pakai `maxFee = 0` (tidak dibatasi) bila managementFee memang mau ditagih setiap report; atau
- Set `managementFee = 0` dan hanya pakai performance fee; jangan campur managementFee dengan maxFee > 0.

Untuk v1: **performance fee saja** (lihat §5), jadi jebakan ini tidak aktif.

## 3. Tiga lapis biaya yang dialami user

| Lapis | Siapa ambil | Bentuk | Terlihat di |
|---|---|---|---|
| Fee venue (Morpho Vault V2) | Kurator venue | memotong `totalAssets` venue / share venue | APY venue (pakai `netApy`, bukan `apy`) |
| Fee strategi (`TokenizedStrategy` sebagai pembungkus) | **nobody** — dipaksa 0 | shares strategi | `performanceFee()` wajib `== 0` |
| Fee vault (Accountant) | Avenor + protokol Yearn | shares vault | `total_fees_shares`, `protocol_fees` di event `StrategyReported` |
| Gas | jaringan | ETH | wallet user; tidak boleh diklaim "gratis" |

Lapis kedua **wajib nol** dan itu bukan preferensi. `TokenizedStrategy.initialize` memberi
setiap strategi baru `performanceFee = 1_000` (10%, ke `msg.sender`) plus
`profitMaxUnlockTime = 10 days` (`TokenizedStrategy.sol:481-489`). Kalau dibiarkan, user
membayar performance fee dua kali: sekali lewat `convertToShares` strategi (tidak pernah
muncul sebagai baris di UI, tidak pernah masuk `total_fees`) dan sekali lewat `Accountant`.
`Deploy.s.sol` (`_configureStrategy`) mematikan keduanya lalu **membaca ulang**; deploy
revert dengan `StrategyWiringFailed("strategy performance fee not zero")` bila gagal.
Constructor strategi tidak bisa melakukannya sendiri: setter itu memanggil `_accrue`, yang
memanggil balik `IBaseStrategy(address(this)).strategyTotalAssets()` dan revert selama
kontrak belum punya code.

Aturan UI: **jangan** menampilkan "APY" gabungan tanpa menyebut sumber. Format: `venue net APY` + `vault fee` + `net to depositor` (dihitung, ber-timestamp). Bila salah satu komponen tidak diketahui, tampilkan `unknown`, bukan tebakan.

## 4. Protocol fee (Yearn)

- `VaultFactory.protocol_fee_config(vault)` mengembalikan `(recipient, bps)`; `MAX_FEE_BPS = 5000` di factory (`VaultFactory.vy:74`).
- Fee protokol dihitung dari `total_fees_shares` (bukan dari gain langsung) saat report.
- Nilai ini bisa berubah oleh governance Yearn per vault. Karena itu `FEE_CONFIG` harus dibaca ulang on-chain pada setiap render halaman fee, dan angka hard-coded di frontend dilarang.

## 5. Konfigurasi v1 (usulan, harus disetujui di PRD)

| Parameter | Nilai awal | Batas keras | Rasional |
|---|---|---|---|
| `performanceFee` | 10% (1.000 bps) | 20% (2.000 bps) | produk managed yield retail; fee di atas 20% sulit dipertahankan |
| `managementFee` | 0 | 2%/tahun | hindari double charge saat TVL kecil dan interaksi dengan `maxFee` |
| `refundRatio` | 0 pada v1 | 50% | refund hanya boleh aktif bila Accountant didanai eksplisit (lihat §2.4) |
| `maxFee` | 0 | 2.000 | 0 = tidak dibatasi; hanya aman karena managementFee = 0 |
| `maxGain` | 500 bps (5%) per report | 1.000 | mencegah report gain absurd / oracle rusak |
| `maxLoss` | 200 bps (2%) per report | 1.000 | loss lebih besar harus lewat `force_revoke` yang terlihat |
| `profit_max_unlock_time` | 7 hari | 30 hari | smoothing pps; cukup pendek agar user melihat hasil |
| Protocol fee (Yearn) | mengikuti factory | 50% dari fee | di luar kendali kita; tampilkan apa adanya |

Alasan `maxLoss` ketat: `Accountant` revert adalah pertahanan terhadap keeper jahat/bug. Konsekuensi: strategi yang loss besar tidak bisa di-report normal; jalurnya `force_revoke_strategy` (`FORCE_REVOKE_MANAGER`) yang menanggung loss eksplisit. Ini perilaku yang benar dan harus ada di runbook, bukan kegagalan.

## 6. Contoh perhitungan (dipakai juga di test)

Asumsi: `current_debt = 1.000.000 USDG`, `duration = 30 hari`, `gain = 3.000 USDG`, `performanceFee = 1.000`, `managementFee = 0`, `maxFee = 0`, protocol `bps = 0`.

Deposit 1.000.000 USDG (6 desimal) = `1e12` unit asset, dicetak `1e12` shares.

```
totalFees_assets = 3.000e6 × 1.000 / 10.000 = 300e6
shares_to_burn   = convertToShares(totalFees)  = 300e6
shares_to_lock   = convertToShares(gain - fee) = 2.700e6
total_assets     = 1.000.000e6 + 3.000e6       = 1.003.000e6
total_supply     = 1e12 + 2.700e6 + 300e6      = 1.003.000e6
```

Saat report, `pps` **tidak bergerak**: supply naik persis sebesar gain pada `pps = 1.0`. Yang naik ke user adalah 2.700 USDG yang di-unlock 7 hari, bukan 3.000. Fee 300 hidup sebagai shares milik `accountant`; bila protocol `bps > 0`, sebagian shares itu pindah ke `fee_recipient` propor-sional.

Setelah unlock penuh, `shares_to_lock` dibakar dan tersisa supply `1.000.300e6`:

```
pps = 1.003.000e6 / 1.000.300e6 = 1.00269939 → 1.002.699 per 1e6 shares
```

Jadi kenaikan pps = **+0,2699%** (bukan +0,27% eksak: fee 300 juga menambah supply, sehingga basis pembaginya bukan 1e12). Angka test wajib (`test/unit/AccountantFees.t.sol::test_documentedExampleFeesLockAndUnlock`):

- `convertToAssets(1e6) == 1.002.699`, toleransi ≤ 2 unit;
- `totalSupply() == 1.000.300e6` setelah unlock;
- di tengah unlock nilainya **di antara** 1.000.000 dan 1.002.699, bukan lompat.

Angka "1.000.003" yang sempat tertulis di dokumen ini salah basis (memakai gain tanpa membagi `total_supply` setelah fee); diganti dengan perhitungan di atas, dan test-nya menegakkan angka baru.

## 7. Kewajiban transparansi

Halaman fee wajib menampilkan, dibaca on-chain saat render:

- `accountant` address + `getVaultConfig(vault)` → `Fee{managementFee, performanceFee, refundRatio, maxFee, maxGain, maxLoss, custom}`, plus `defaultConfig()` untuk pembanding. **Tidak ada `getFeeConfig()`** — nama itu tidak ada di `Accountant.sol`; memakainya berarti UI membaca fungsi yang tidak eksis dan menampilkan `unknown` selamanya.
- `strategy.performanceFee()` + `strategy.profitMaxUnlockTime()` → harus `0` dan `0`. Kalau tidak, ada fee kedua yang tidak berasal dari `Accountant` dan halaman ini wajib menolak menampilkan total fee, bukan menebak.
- `factory.protocol_fee_config(vault)` → recipient + bps.
- `profitMaxUnlockTime()` + `fullProfitUnlockDate()` + `unlockedShares()`.
- Realisasi fee historis: Σ `total_fees_shares` dari event, per periode, dalam shares **dan** assets pada `pps` saat itu.
- Kalimat: "Fee diambil dari gain saat report, dibayar dalam shares vault. Fee tidak dipotong saat deposit atau withdraw."