---
title: "Report and allocation jobs with caps and healthchecks"
ticket: 2
status: done
baseline_revision: '8ceb03880b022eba5fb5087c29cddde9c9aaf0de'
route: 'full'
risk: 'high'
review: 'jobs tests + fork e2e fee path'
context: 'epic 6, S5'
---

# Report and allocation jobs with caps and healthchecks

## Tujuan

Dua job yang memutuskan kapan `process_report` dan `update_debt` dikirim, dengan ambang eksplisit dan
tanpa pernah melewati cap.

## Yang dibangun

`services/keeper/src/jobs.ts`:

- `reportJob(reader, {vault, strategy, minGainBps, maxGainBps?})`
  - berhenti bila `isShutdown` atau `currentDebt == 0` (tidak ada basis persentase);
  - **loss → `level: "alert"`, tanpa transaksi**;
  - gain < `minGainBps` → skip dengan alasan `<n> bps below threshold <m> bps`;
  - gain > `maxGainBps` → alert, karena `Accountant` akan revert `"too much gain"`;
  - selain itu → `process_report(strategy)`.
- `allocationJob(reader, {vault, strategy, hardIdleFloor})`
  - `floor = max(minimumTotalIdle, hardIdleFloor)`;
  - `target = currentDebt + min(max(totalIdle - floor, 0), max(max_debt - currentDebt, 0))`;
  - berhenti bila `target == currentDebt` (termasuk sudah di `max_debt`);
  - calldata `update_debt(strategy, target, 0)` — `max_loss = 0` ditulis eksplisit.
- `createVaultReader(client, {vault, strategy})` — semua pembacaan dipin ke satu `blockNumber`;
  `strategyAssets` memakai `totalAssetsIncludingIdle()` (live), bukan `totalAssets()` yang mengunci
  nilai tersimpan saat `S.entered == ENTERED || block.timestamp == S.lastAccrual`.

## Bukti

Bagian dari 22 test keeper (`python scripts/verify-all.py`):

- gain 50 bps < ambang 100 bps → skip dengan alasan; gain 200 bps → `process_report(strategy)`
  (didekode dari calldata, argumen dibandingkan lowercase karena viem meng-checksum);
- loss 1.000 dari debt 10.000 → alert `loss of 1000 observed`, `action === null`;
- gain 1.500 bps dengan `maxGainBps = 500` → alert `above Accountant.maxGain 500 bps`;
- `currentDebt == 0` → `"no debt"`, tanpa tx;
- alokasi: idle 5.000, `minimum_total_idle` 1.000, `hardIdleFloor` 2.000 → floor 2.000, target 2.000
  (dibatasi `max_debt` 2.000), bukan 4.000; di `max_debt` → skip `"at max_debt"`;
- `createVaultReader` terhadap node HTTP lokal: semua `eth_call` memakai blok `0x64`, `strategies()`
  terbaca sebagai objek (komponen tuple bernama), `strategyAssets` = 513.000.000.000 dari
  `totalAssetsIncludingIdle()`.

Jalur fee pada pin nyata dibuktikan test fork yang sudah ada (bukan oleh keeper):
`test_e2e_venueAccrualIsReportedAsGainAndFee` di `packages/contracts/test/fork/VaultE2E.t.sol`
(report menghasilkan fee share ke accountant) dan `test/unit/AccountantFees.t.sol`
(`total_fees = 300e6`, locked `2_700e6`, `totalAssets = 1_003_000e6`, `pps = 1_002_699` per 1e6).

## Keputusan

- `hardIdleFloor` terpisah dari `minimum_total_idle`; konfigurasi 0 tidak boleh membuat vault
  kehabisan kas idle.
- `strategyAssets` live; memakai `totalAssets()` membuat report tidak pernah terpicu.
- Loss bukan transaksi: retry selamanya = noise, `turnOffHealthCheck` = menyembunyikan insiden.

## Batas (terbuka)

Tiket menuntut **dry-run di fork** yang menjalankan keeper terhadap vault, bukan memanggil kontrak
langsung. Itu belum dieksekusi: vault Avenor belum dideploy di fork mana pun, dan menjalankannya
butuh deployment lokal + venue nyata + wallet keeper pada fork.

Karena itu status tiket ini **`built`, bukan `done`**. Yang tersisa persis satu langkah: jalankan
`main.ts` dalam mode sekali-jalan terhadap vault hasil `Deploy.s.sol` di fork pin `118337511`, dengan
`MIN_GAIN_BPS` yang membuat report terpicu, lalu catat tx hash dan fee yang muncul. Itu bagian dari
drill T4 (HITL) dan akan tercatat di sana.