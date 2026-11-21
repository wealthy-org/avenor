---
title: 'Pin on-chain reference capture for USDG and the venue'
type: 'research'
ticket: 5
created: '2026-11-19'
status: 'done'
completed: '2026-11-20'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/REFERENCE_CAPTURE.md', 'docs/BASELINE.md', 'packages/config/4663.json']
---

# Pin on-chain reference capture

## Intent

Setiap angka venue/TVL/likuiditas di dokumen harus punya `blockNumber` + timestamp. Tiket ini memastikan angka yang sudah tertulis memang berasal dari pin yang sama, bukan dari memori atau dari blok yang bergeser.

## Yang dikerjakan

Dibaca ulang langsung dari RPC pada pin `118337511` (`eth_call` dengan parameter blok heksadesimal `0x70dafe7`), bukan dari `cast call --block` — perintah itu gagal pada endpoint publik rantai ini ("failed to retrieve chain ID from fork endpoint").

## Hasil (semua pada blok yang sama)

- header: number `118337511`, hash `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af`, timestamp `1795103654` (2026-11-19T15:54:14Z) — identik dengan `packages/config/4663.json`
- `ArbSys(0x64).arbBlockNumber()` = `118337511` (tinggi L2; `eth_blockNumber` pada rantai ini melaporkan tinggi L1, jadi bukan pengganti)
- USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`: `symbol() = "USDG"`, `decimals() = 6`, `totalSupply() = 622410599910270`
- steakUSDG `0xBeEff033F34C046626B8D0A041844C5d1A5409dd`: `symbol() = "steakUSDG"`, `decimals() = 18`, `asset() = USDG`, `totalAssets() = 538856055994280`, `totalSupply() = 531418644510854399888342585`
- kas idle venue: `USDG.balanceOf(venue) = 27024457979514` → 5,02% dari `totalAssets` venue

## Verification

Re-run: `python scripts/fork-status.py` (memeriksa `steakUSDG.totalAssets` = `538856055994280` pada pin). Fingerprint yang sama juga dipakai `scripts/fork-test.py` sebagai gerbang sebelum forge dijalankan, sehingga fork test tidak bisa diam-diam berjalan di blok lain.

## Catatan jujur

- `maxWithdraw(venue)` membalas `0` walau kas idle ada dan posisi bisa ditebus. Itu bukan sinyal likuiditas, dan `docs/VENUE_INTEGRATIONS.md` §4 melarang memakainya sebagai sinyal. Angka 5,02% adalah kas idle sesaat pada satu blok, bukan janji likuiditas.
- `issuer_verified` tetap `false`: `docs.robinhood.com` tidak dapat dibaca dari lingkungan ini, jadi klaim soal penerbit USDG tidak dibuat.