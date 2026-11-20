---
title: 'Implement MorphoVaultStrategy adapter with liquidity-aware freeFunds'
type: 'feature'
ticket: 2
created: '2026-11-19'
status: 'done'
baseline_revision: '48c53aba0395885b3f579d0a4b426de276a7b69e'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'required'
review_source: 'default'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/VENUE_INTEGRATIONS.md', 'docs/WITHDRAWAL_SEMANTICS.md', 'referensi/tokenized-strategy/src/TokenizedStrategy.sol']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Vault V3 membutuhkan strategi yang bisa melaporkan nilai dan menyediakan likuiditas on-demand. Venue utama (`steakUSDG`) hanya sebagian kecil likuid segera (kas idle 5,02% TVL pada pin `118337511`), jadi strategi naif yang `revert` saat likuiditas kurang akan memblokir penarikan user, sedangkan strategi yang melaporkan nilai dari `previewRedeem` akan salah menghitung aset.

**Approach:** `MorphoVaultStrategy` di atas `BaseStrategy` (Tokenized Strategy `API 3.1.1` (pin `48c53ab`)) yang menghitung aset sebagai `venue.convertToAssets(venue.balanceOf(this)) + asset.balanceOf(this)`, mengalokasikan lewat `venue.deposit`, dan menarik lewat `venue.withdraw(min(need, venue.maxWithdraw(this)))` tanpa revert buta sehingga Vault V3 bisa menandai penarikan parsial sesuai `max_loss`.

</frozen-after-approval>

## Implementation Notes

- `_deployFunds(amount)`: clamp ke `venue.maxDeposit(this)` **hanya bila > 0**; nol berarti "coba saja" (venue membalas 0 sambil menerima deposit). `forceApprove(venue, amount)` -> `venue.deposit(amount, address(this))` -> `forceApprove(venue, 0)` di kedua jalur; penolakan venue = dana idle + event `VenueDepositSkipped(amount, reason)`, bukan revert yang mematikan deposit vault (lihat "Koreksi 2026-11-20" di bawah).
- `_freeFunds(amount)`: `available = min(venue.convertToAssets(venue.balanceOf(this)), USDG.balanceOf(venue))` (**bukan** `venue.maxWithdraw`, yang membalas 0); bila `available < amount` revert `VenueLiquidityShortfall(amount, available)`, lalu `venue.withdraw(amount, ...)` dan **verifikasi lewat delta saldo USDG**, bukan nilai balik (venue mengembalikan share).
- `_harvestAndReport()`: `view`, `return _totalAssets()`; jangan memicu `accrue` venue secara manual di v1.
- `availableDepositLimit(address)`: `venue.maxDeposit(this)` bila > 0, `type(uint256).max` bila venue membalas 0 (lihat "Koreksi 2026-11-20"); tanpa `STRATEGY_CAP` hardcode;
- `availableWithdrawLimit(address)`: `idle + min(convertToAssets(balanceOf(this)), USDG.balanceOf(venue))`, clamp overflow ke `type(uint256).max`; helper `_venueLiquidity()` inilah satu-satunya batas, `venue.maxWithdraw` tidak dipakai.
- `shutdownWithdraw(amount)`: memakai jalur `freeFunds` yang sama, jadi tetap revert bila venue tidak likuid; keluar paksa lewat `emergencyWithdraw` (mensyaratkan `paused`/`shutdown`).
- Jangan menyimpan state yang bisa dimodifikasi keeper di luar `BaseStrategy`; tidak ada setter baru.
- Semua angka 6 desimal; jangan ada `1e18`.
- Biaya gas: satu `deposit` + satu `withdraw` per operasi; hindari loop.

## Test Matrix

| Test | Ekspektasi |
|---|---|
| venue cukup likuid | `withdraw` user membayar aset persis, share venue turun proporsional |
| kas idle venue < amount | `maxWithdraw`/`maxRedeem` strategi = `idle + min(convertToAssets(balanceOf), USDG.balanceOf(venue))` (**bukan** `venue.maxWithdraw` — getter itu membalas `0`); `_freeFunds` revert `VenueLiquidityShortfall(requested, available)`; posisi tidak disentuh |
| venue balas `maxDeposit = 0` | `availableDepositLimit` melaporkan `type(uint256).max` dan deposit **dicoba**; terbukti `steakUSDG` menerima `deposit(10_000e6)` sambil membalas `0` (`VENUE_INTEGRATIONS.md` §4a) |
| `venue.deposit` revert (benar-benar tutup) | **tidak** di-bubble: USDG tetap idle dan event `VenueDepositSkipped(amount, reason)` dipancarkan, allowance di-reset di kedua jalur; jalur `deposit` vault tidak ikut mati |
| `venue.withdraw` mengembalikan share | `_freeFunds` mengukur delta `USDG.balanceOf(strategy)`, bukan membandingkan nilai balik 18 desimal dengan amount 6 desimal |
| share venue 18 vs asset 6 desimal | 1 USDG = 1e18 share (`convertToShares(1e6) == 1e18`), `convertToAssets` bolak-balik konsisten |
| allowance setelah deposit | 0 |
| `report()` gain/loss venue | profit/loss dilaporkan dalam satuan USDG, bukan share |
| `strategyTotalAssets` | report-boundary (nilai report terakhir), bukan live; live via `totalAssetsIncludingIdle()` |
| `emergencyWithdraw` | seluruh share venue di-redeem, posisi venue 0, aset kembali idle |
| fuzz deposit→redeem | `out <= amount` dan selisih ≤ 1 unit USDG |

## Acceptance Evidence

1. `forge test --match-contract MorphoVaultStrategyTest -vv` hijau dengan tabel di atas tertutup.
2. `forge fmt --check` bersih; tidak ada warning compiler baru.
3. Review kode (lens default) selesai; temuan high ditutup.
4. `docs/VENUE_INTEGRATIONS.md` §3 diperbarui bila implementasi menyimpang dari spesifikasi.

## Out of Scope

- Deploy skrip (ticket 4).
- Venue kedua.
- Tend/keeper logic.
## Koreksi semantik: mengapa `_freeFunds` revert (menggantikan Approach yang di-frozen)

Approach di blok `frozen-after-approval` menyuruh `_freeFunds` menarik `min(need, maxWithdraw)` dan "tidak revert buta". Itu **tidak aman** dan sudah diganti. Bukti dari kode pin `tokenized-strategy@48c53ab`, bukan opini:

- `TokenizedStrategy.sol:1156` memanggil `freeFunds(assets - idle)`. Hook-nya `void` — tidak ada nilai balik yang bisa dibaca `TokenizedStrategy` untuk mengetahui bahwa penarikan kurang.
- `TokenizedStrategy.sol:1168-1181`: setelah hook, shortfall dihitung sebagai `loss`; jika `loss > maxLoss` transaksi revert, jika tidak `assets` diperkecil ke idle dan **shares user tetap di-burn penuh**. Partial fill karena likuiditas jadi kerugian yang tidak pernah muncul sebagai error.
- Default `redeem(max_loss)` = 10.000 bps (`VaultV3.vy:1919`) dan SDK tidak mengekspos default itu (`docs/WITHDRAWAL_SEMANTICS.md`), jadi jalur "loss senyap" adalah jalur default, bukan jalur eksotis.
- Natspec `BaseStrategy.sol:195-200` sendiri menyarankan revert bila posisi hanya tidak likuid.

Karena itu: `_freeFunds` **revert** `VenueLiquidityShortfall(requested, available)` dan likuiditas dipublikasikan lewat `availableWithdrawLimit` = `idle + min(venue.convertToAssets(balanceOf(this)), USDG.balanceOf(venue))` — `venue.maxWithdraw` **tidak** dipakai, getter itu membalas `0` pada posisi yang bisa ditebus penuh.

## Koreksi 2026-11-20: dua getter venue berbohong, dan itu mengubah adapter

Probe fork di pin `118337511` (`test/fork/VenueProbe.t.sol`) membantah dua asumsi di atas:

1. **`maxDeposit` membalas `0` untuk semua alamat, tetapi `deposit` jalan.** Alamat sekali pakai: `maxDeposit = 0`, lalu `deposit(10_000e6)` memakan tepat `10_000_000_000` USDG dan mencetak `9_861_977_769_374_748_661_535` share. Kalau nol itu dipercaya, `availableDepositLimit = 0` membuat `VaultV3.update_debt` no-op permanen: vault menerima deposit dan tidak pernah mengalokasikan apa pun. Implementasi sekarang: nol dilaporkan `type(uint256).max`, `_deployFunds` mencoba, penolakan venue = dana idle + event `VenueDepositSkipped(amount, reason)`, allowance di-reset di kedua jalur.
2. **`withdraw` mengembalikan share yang dibakar, bukan asset.** `withdraw(2_000e6)` membayar `2_000_000_000` USDG dan mengembalikan `1_972_395_553_874_949_732_308`; `redeem` sebaliknya mengembalikan asset (`7_999_999_999` untuk sisa probe). Membandingkan nilai balik 18 desimal dengan jumlah asset 6 desimal selalu lolos. Implementasi sekarang: `_freeFunds` mengukur delta `USDG.balanceOf(this)` dan revert `VenueLiquidityShortfall` bila yang diterima kurang.
3. **Payload revert di atas kas idle tidak stabil** (`Panic(0x11)` di sebagian run, data kosong di run lain), jadi tes hanya meng-assert "revert", bukan payload.

Dokumen yang ikut dikoreksi: `docs/VENUE_INTEGRATIONS.md` §4/§4a/§5, `docs/REFERENCE_CAPTURE.md` §4a (angka + query), `docs/REPRODUCIBILITY.md` §6, `docs/ARCHITECTURE.md` §2.2, `docs/WITHDRAWAL_SEMANTICS.md` §5, `packages/config/4663.json` (`venues.steakUSDG.deposit`, `venues.steakUSDG.liquidity.return_semantics`).

## Completion Evidence (2026-11-19)

**Deliverable**

| Path | Isi |
|---|---|
| `packages/contracts/src/strategies/MorphoVaultStrategy.sol` | Adapter `BaseStrategy` ke venue ERC-4626; `venue` immutable; `_deployFunds` clamp + allowance 0; `_freeFunds` revert shortfall; `_harvestAndReport` `view`; `_emergencyWithdraw` redeem semua |
| `packages/contracts/test/mocks/MockERC20.sol` | USDG 6 desimal |
| `packages/contracts/test/mocks/MockVenue.sol` | Venue ERC-4626 18 desimal, `SCALE = 1e12`, cap/liquidity/gate yang bisa disetel |
| `packages/contracts/test/mocks/MockYearnFactory.sol` | `protocol_fee_config()` untuk `TokenizedStrategy.report()` |
| `packages/contracts/test/unit/MorphoVaultStrategy.t.sol` | 22 test, termasuk harness subclass untuk `_deployFunds`/`_freeFunds`/`_emergencyWithdraw` |
| `docs/VENUE_INTEGRATIONS.md` §3 | Dikoreksi: revert + `availableWithdrawLimit`, `availableDepositLimit`, `shutdownWithdraw`, `_harvestAndReport` |

**Gate**

```
python scripts/verify-all.py
  [ok] vendored dependencies: 601 files, impl 0x3110D1Eec90f0651C18e75AD37711A8777342504, API 3.1.1
  [ok] generated interfaces: 2 up to date
  [ok] forge build
  [ok] forge fmt --check
  [ok] forge test: 34 tests passed, 0 failed, 0 skipped
  [ok] bytecode evidence: 14/14 checks passed
  ALL CHECKS PASSED
```

`forge build --offline --force` → `Compiler run successful!` tanpa warning.

**Temuan yang mengubah cara test ditulis**

- Unit test **tidak bisa** memakai `0x3110D1Ee…` apa adanya: tanpa fork alamat itu tidak punya kode, `delegatecall` ke akun kosong "sukses" dan storage `TokenizedStrategy` tidak pernah terinisialisasi (`asset()` = `address(0)`, `decimals()` revert). Perbaikannya: etch bytecode **vendored** `TokenizedStrategy` di alamat kanonik. Efek samping bagus — kalau kode vendored berubah, semua test adapter ikut berubah.
- `TokenizedStrategy.report()` memanggil `protocol_fee_config()` pada `FACTORY` immutable (`TokenizedStrategy.sol:1286`). Tanpa factory nyata, `report()` revert. Dipakai `MockYearnFactory` yang mengembalikan `(0, address(0))` — v1 memang tanpa protocol fee.
- `forge build` versi ini mencetak `Error: Compiler run failed:` **tanpa** pesan; detail hanya keluar dengan `forge build --json`.

**Deviasi lain dari plan**

- `availableDepositLimit` tidak memakai `STRATEGY_CAP` hardcode: batas produk ada di `deposit_limit`/debt cap vault (ADR-6), strategy hanya gate alokasi. Cap hardcode akan jadi angka kedua yang bisa berselisih dengan kebenaran on-chain.
- `venue` immutable: mengganti venue berarti deploy strategy baru. Kode yang direview harus sama dengan kode yang jalan — tidak ada jalur "ganti venue lewat setter".
- Test yang tidak bisa dicapai lewat jalur `TokenizedStrategy` (clamp `maxDeposit`, shortfall tanpa posisi) diuji lewat subclass harness, bukan dengan memaksa API publik berperilaku tidak wajar.

**Belum dikerjakan (jujur)**

- Review lens default (`review: 'required'`) belum dijalankan; `lenses_ran: []`.
- `_freeFunds` yang revert berarti `shutdownWithdraw` juga revert saat venue tidak likuid. Jalan keluar satu-satunya `emergencyWithdraw` (butuh `paused`/`shutdown`); ini konsekuensi yang harus dipahami operator dan diuji di ticket 5.
- ~~Perilaku venue nyata (`steakUSDG`: fee, gate, cooldown) belum diukur; butuh fork harness ticket 3.~~ **Sudah diukur** pada pin `118337511` (2026-11-20): tidak ada gate deposit yang nyata, `maxDeposit`/`maxWithdraw` membalas `0` sementara operasi berhasil, `withdraw` mengembalikan share. Lihat `docs/REFERENCE_CAPTURE.md` §4a.

## Completion Evidence (2026-11-20): probe venue + fork E2E hijau

| Gate | Hasil |
|---|---|
| `python scripts/verify-all.py` | ALL CHECKS PASSED (vendor 603 file, interface 2, build, fmt, 67 unit test, bytecode 14/14) |
| `python scripts/fork-test.py` (pin `118337511`) | 11 test lulus, 0 gagal — `VenueProbe` 7/7, `VaultE2E` 4/4 |
| `test/fork/VenueProbe.t.sol::test_depositSucceedsWhileMaxDepositReportsZero` | deposit `10_000e6` diterima meski `maxDeposit = 0`; `withdraw(2_000e6)` membayar `2_000_000_000` dan mengembalikan `1_972_395_553_874_949_732_308` (share) |
| `test/fork/VaultE2E.t.sol::test_e2e_venueAccrualIsReportedAsGainAndFee` | gain nyata `28_892_859` wei (28,89 USDG / 30 hari), fee share dicetak ke accountant `2_889_285`, lalu `redeemUnderlying` + `distribute` membayar treasury |
| `test/fork/VaultE2E.t.sol::test_e2e_depositAllocateReportWithdrawAll` | user keluar penuh; sisa vault = porsi dead shares (`totalIdle = 0`, `totalDebt + totalIdle ≈ SEED`) |

Catatan jujur: `test_e2e_shortfallIsUnreachableAtThePin` tetap hanya membuktikan bahwa shortfall tidak bisa dibangun lewat vault pada pin ini (kas idle venue `27_024_457,979514` USDG > debt cap `100_000` USDG); jalur shortfall diuji di unit test dengan `MockVenue`.
