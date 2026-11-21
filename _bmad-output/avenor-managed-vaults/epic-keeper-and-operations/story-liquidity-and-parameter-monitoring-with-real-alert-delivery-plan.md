---
title: "Liquidity and parameter monitoring with real alert delivery"
ticket: 3
status: done
baseline_revision: '8ceb03880b022eba5fb5087c29cddde9c9aaf0de'
route: 'full'
risk: 'medium'
review: 'monitor tests incl. real HTTP delivery'
context: 'epic 6, S5'
---

# Liquidity and parameter monitoring with real alert delivery

## Tujuan

Monitoring parameter vault dan likuiditas, dengan ambang tertulis dan alert yang benar-benar
terkirim — atau tercatat sebagai kegagalan pengiriman, tidak pernah "dianggap terkirim".

## Yang dibangun

| File | Isi |
| --- | --- |
| `services/keeper/src/monitor.ts` | `MonitorSnapshot`, `MonitorThresholds`, `evaluateHealth()` (fungsi murni) |
| `services/keeper/src/monitorReader.ts` | snapshot live: shutdown, paused, `deposit_limit`, `totalAssets`, `totalIdle`, `maxWithdraw`, `venueMaxWithdraw`, `performanceFee` — semua dipin satu blok |
| `services/keeper/src/notify.ts` | `webhookNotifier` (POST JSON, timeout 10 dtk, non-2xx = `WebhookError`) |
| `services/keeper/src/main.ts` | loop monitor terpisah dari loop job; kegagalan kirim dicatat `error`, monitor tetap jalan |

Kode alert: `vault-shutdown` (critical), `vault-paused` (critical), `deposits-closed` (warning),
`no-withdrawal-capacity` (warning), `total-assets-moved` (critical, delta bps dua arah),
`deposit-limit-changed` (info), `fee-config-changed` (warning). Setiap alert membawa
`runbook = <RUNBOOK_BASE_URL>#<code>`, `blockNumber`, `blockTimestamp`, dan `detail` berupa string.

## Bukti

- `maxWithdraw` venue `0` **tidak** menghasilkan alert (guard terhadap alarm palsu permanen pada pin;
  angka tetap dicatat sebagai `venueMaxWithdraw`).
- shutdown/paused critical + tautan runbook `…/incidents#vault-shutdown`.
- `deposit_limit == 0` → warning, dan **tidak** dobel saat shutdown.
- `maxWithdraw == 0 && totalIdle == 0` → warning; `maxWithdraw == 0` dengan idle 27.024 USDG → nol alert.
- delta `totalAssets` 26 bps < 100 bps → nol alert; lompatan +1,1% dan −1,3% → critical dengan arah
  (`moved up`/`moved down`) dan `detail.thresholdBps = "100"`.
- perubahan `deposit_limit` dan `performanceFee` dilaporkan (info/warning), bukan diserap diam-diam.
- **Pengiriman nyata**: HTTP server lokal menerima satu `POST` `application/json` berisi `text`,
  `alerts[0].code = "vault-paused"`, `blockNumber`; alert kosong → tidak ada request; respons `503` →
  `WebhookError` (bukan sukses).
- `createMonitorReader` terhadap node lokal: 8+ pembacaan semuanya di blok `0x64`,
  `totalAssets = 538856055994`, `maxWithdraw = 27024457979`, `venueMaxWithdraw = 0`,
  `performanceFeeBps = 1000`, `blockTimestamp` diturunkan dari header blok.

## Keputusan

- **Ambang wajib**, tanpa default: `maxAssetsDeltaBps`, `runbookBaseUrl`. "Alarm" tanpa angka bukan
  alarm.
- **Tidak ada alarm tanpa aksi**: `maxWithdraw` venue tidak pernah memicu sendiri karena pada pin ia
  `0` untuk posisi yang likuid (aturan produk 4 di `AGENTS.md`).
- **Kegagalan pengiriman adalah kegagalan**, dicatat `error` dan diulang pada tick berikutnya;
  monitor tidak berhenti.
- **Kanal produksi = HITL.** Webhook dipilih karena bisa dibuktikan round trip; pemilihan
  Slack/PagerDuty dan penerima on-call adalah keputusan manusia.

## Batas

- Belum ada alert yang dikirim ke kanal produksi; yang ada: receiver HTTP lokal pada test, dengan
  payload dan timestamp yang diperiksa. Screenshot kanal on-call belum ada — tidak diklaim.
- Tidak ada metrik historis (hanya perbandingan dua tick), sehingga lonjakan bertahap di bawah
  ambang tidak terlihat.