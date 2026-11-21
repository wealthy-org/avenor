# Keeper

Runtime untuk vault Avenor: `report` dan `alokasi` pada interval tetap, dengan simulasi wajib,
satu transaksi in-flight, log terstruktur, kill switch, dan monitor parameter.

Kode: `services/keeper/`. Test: `services/keeper/test/keeper.test.ts` dan
`services/keeper/test/monitor.test.ts` (22 test), dijalankan `python scripts/verify-all.py`.

## 1. Kenapa keeper, bukan `auto_allocate`

ADR-6 mematikan `auto_allocate`. `VaultV3.update_debt` hanya bisa dipanggil `DEBT_MANAGER`, dan
`process_report` hanya `REPORTING_MANAGER`. Keeper adalah aktor yang memegang dua bit itu, dengan
kunci terbatas, bukan governance. Keeper tidak dapat mengubah role, fee, cap, atau queue.

## 2. Dua job

| Job | Yang dibaca | Kapan mengirim | Kapan berhenti dan berteriak |
| --- | --- | --- | --- |
| `reportJob` | `strategies(strategy).current_debt`, `totalAssetsIncludingIdle()` | gain ≥ `minGainBps` dan (bila diisi) ≤ `maxGainBps` | `currentDebt == 0`, `isShutdown`, **loss** (level `alert`, tanpa tx), gain di atas `maxGainBps` |
| `allocationJob` | `totalIdle`, `minimum_total_idle`, `strategies().current_debt/max_debt` | `target > currentDebt` | `target == currentDebt` (termasuk sudah di `max_debt`) |

`strategyAssets` memakai `totalAssetsIncludingIdle()` pada adapter kita, **bukan**
`ITokenizedStrategy.totalAssets()`. Yang kedua mengembalikan nilai tersimpan saat
`S.entered == ENTERED || block.timestamp == S.lastAccrual`, sehingga gain venue yang baru terjadi
tidak terlihat dan `process_report` tidak pernah dipanggil.

Loss sengaja tidak dikirim. `Accountant.report` revert `"too much loss"` di atas `maxLoss`, jadi
keeper yang mengirim akan gagal terus dan mengotori log; satu-satunya cara "lolos" adalah
`turnOffHealthCheck`, yang menyembunyikan insiden. Karena itu loss = alert ke on-call.

### Target alokasi

```
floor    = max(minimum_total_idle, hardIdleFloor)
available= max(totalIdle - floor, 0)
headroom = max(max_debt - current_debt, 0)
target   = current_debt + min(available, headroom)
```

`hardIdleFloor` ada karena `minimum_total_idle` bisa salah konfigurasi ke 0; keeper tidak boleh
menjadi alasan vault kehabisan kas idle. `max_loss = 0` ditulis **eksplisit** di calldata
`update_debt(strategy, target, 0)` supaya terlihat di review, walaupun nilai default sama.

## 3. Satu transaksi in-flight

`Keeper.runOnce()` menolak re-entry (`"runOnce is not reentrant"`). Alasannya bukan kerapian:
simulasi kedua dihitung pada state yang sudah tidak ada bila transaksi pertama belum masuk blok.
Konsekuensi kedua: nonce bisa dilacak tanpa library — `nonce()` dibaca sekali, lalu dinaikkan
setelah kirim sukses.

Nonce basi (mis. dua instance keeper, atau transaksi sebelumnya baru masuk) dikenali lewat
`isNonceError` (`nonce too low`, `nonce has already been used`, `already known`), lalu nonce dibaca
ulang **sekali** dan dikirim ulang. Error lain (mis. `insufficient funds`) tidak di-retry: tidak ada
yang berubah dalam satu detik, dan retry buta menyembunyikan wallet yang salah isi.

## 4. Simulasi wajib

Urutan selalu plan → `eth_call` → kirim. Hasil simulasi:

- `ok: true` → kirim.
- `ok: false` → entri log `status: "skipped"`, `level: "alert"`, `reason`
  `simulation reverted: <reason>`, **tidak ada** transaksi.

Artinya revert `"too much loss"`, `"too much gain"`, `"new debt equals current debt"`, atau
`"venue illiquid"` tidak pernah menjadi transaksi gagal on-chain yang membakar gas dan
mengaburkan penyebab.

## 5. Log

Satu JSON per baris (`jsonLogger`), field: `ts, level, job, blockNumber, status, reason?, txHash?,
calldata?, nonce?, detail?`. Syarat dari tiket: satu transaksi gagal harus bisa dijelaskan dari log
saja — karena itu `blockNumber` dan `calldata` selalu ada, termasuk saat `skipped`.

## 6. Kill switch

Tiga lapis, semuanya menghentikan **job**, bukan monitor:

1. `Keeper.stop()` — semua `runOnce` berikutnya melempar `KeeperStoppedError`; job yang belum
   dijalankan tidak pernah di-plan.
2. File `KEEPER_STOP_FILE` (default `.keeper-stop`) — dicek di awal setiap tick; isi file tidak
   dibaca, keberadaannya sudah cukup.
3. `SIGINT`/`SIGTERM` — `stop()` lalu keluar.

Saat berhenti, keeper **tidak** mengirim transaksi apa pun, dan monitor tetap membaca supaya
on-call masih tahu keadaan vault.

## 7. Monitor

`evaluateHealth(snapshot, previous, thresholds)` adalah fungsi murni; ambang wajib eksplisit
(`maxAssetsDeltaBps`, `runbookBaseUrl`), tanpa default.

| Kode | Severity | Pemicu | Kenapa |
| --- | --- | --- | --- |
| `vault-shutdown` | critical | `isShutdown` | deposit ditutup dan queue harus dimigrasi |
| `vault-paused` | critical | `isPaused` | `setPaused` **memblokir penarikan**; ini insiden, bukan operasi normal |
| `deposits-closed` | warning | `deposit_limit == 0` dan bukan shutdown | deposit berhenti tanpa pengumuman shutdown |
| `no-withdrawal-capacity` | warning | `maxWithdraw == 0` **dan** `totalIdle == 0` | tidak ada jalan keluar sama sekali |
| `total-assets-moved` | critical | delta `totalAssets` > `maxAssetsDeltaBps` vs tick sebelumnya | gain/loss besar atau kesalahan akuntansi |
| `deposit-limit-changed` | info | `deposit_limit` berubah | perubahan parameter harus terlihat, walau sah |
| `fee-config-changed` | warning | `performanceFee` berubah | fee adalah uang user |

**`maxWithdraw` venue tidak pernah memicu alarm sendiri.** Pada pin `118337511`, `steakUSDG`
menjawab `maxWithdraw = 0` untuk posisi yang likuid; menjadikannya alarm akan menghasilkan alarm
palsu permanen. Angka itu tetap dicatat (`venueMaxWithdraw`) untuk transparansi, dan tiket T3
mensyaratkan "tidak ada alarm tanpa aksi" — angka yang selalu 0 tidak menuntut aksi apa pun.

## 8. Pengiriman alert

`webhookNotifier` mengirim `POST` JSON `{text, blockNumber, blockTimestamp, alerts}` ke
`ALERT_WEBHOOK_URL` (kompatibel Slack incoming webhook karena `text`), timeout 10 detik, non-2xx =
`WebhookError`. Test-nya melakukan HTTP round trip nyata ke receiver lokal dan memeriksa payload,
bukan memock `fetch`.

Kanal produksi (Slack/PagerDuty) belum dipilih — itu keputusan manusia, dan tiket T4/T5 tetap HITL.

## 9. Konfigurasi

| Variabel | Wajib | Arti |
| --- | --- | --- |
| `RPC_URL` | ya | endpoint chain 4663 |
| `VAULT_ADDRESS` | ya | vault Avenor |
| `STRATEGY_ADDRESS` | ya | adapter Morpho |
| `KEEPER_PRIVATE_KEY` | ya | kunci keeper; hanya `REPORTING_MANAGER` + `DEBT_MANAGER` |
| `MIN_GAIN_BPS` | ya | ambang gain untuk report, 0..10000 |
| `MAX_GAIN_BPS` | tidak | di atas ini: alert, bukan tx |
| `HARD_IDLE_FLOOR` | ya | kas idle minimum (unit asset) |
| `INTERVAL_MS` | ya | interval job, 5.000..86.400.000 |
| `MONITOR_INTERVAL_MS` | tidak | default 60.000 |
| `MAX_ASSETS_DELTA_BPS` | ya | ambang delta `totalAssets` |
| `RUNBOOK_BASE_URL` | ya | alert menaut ke `…/#<kode>` di `docs/RUNBOOK.md` |
| `ALERT_WEBHOOK_URL` | tidak | tanpa ini, alert dicatat sebagai error log |
| `KEEPER_STOP_FILE` | tidak | default `.keeper-stop` |

Jalankan: `npm start --prefix services/keeper` (Node ≥ 22.6, type stripping, tanpa build step).

## 10. Batas yang jujur

- Keeper belum pernah dijalankan terhadap vault yang sudah dideploy. Test membuktikan perilaku
  terhadap node palsu dan pembacaan terhadap pin nyata, bukan pengiriman transaksi nyata.
- Dry-run report terhadap vault lokal di fork (T2) belum dieksekusi; jalur fee sudah dibuktikan
  test fork `test_e2e_venueAccrualIsReportedAsGainAndFee` dan `AccountantFees.t.sol`, tetapi itu
  memanggil kontrak langsung, bukan keeper.
- Tidak ada metrik (uptime, jumlah tx) yang diekspor; T5 (7 hari soak) membutuhkannya dan tetap
  tertutup sampai ada staging.