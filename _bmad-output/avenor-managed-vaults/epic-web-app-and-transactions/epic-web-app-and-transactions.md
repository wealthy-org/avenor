---
type: epic
title: "Slice S4 — Web App: Katalog, Detail, Transaksi, Portfolio, Transparency"
parent: "initiative-avenor-managed-vaults"
covers: ["S4"]
status: draft
---

# Epic 5: Web App

## Intent
Membuat produk yang bisa dipakai orang sungguhan tanpa menipu: setiap angka punya asal, setiap transaksi punya konsekuensi yang dinyatakan sebelum ditandatangani.

## Outcome
App Next.js dengan lima permukaan (katalog, detail vault, transaksi, portfolio, transparency) yang seluruh angkanya berasal dari SDK/indexer ber-provenance, dan 12 kasus `WITHDRAWAL_SEMANTICS.md` §6 punya padanan UI.

## Done When
1. Katalog menampilkan hanya vault yang lolos gate (v1: satu vault USDG) + status venue yang jelas; tidak ada APY tanpa `netApy` venue + timestamp.
2. Detail vault: mandat, alokasi per venue, likuiditas segera (`maxWithdraw` strategi), fee on-chain, peran + alamat + timelock, `last_report` dan freshness.
3. Deposit flow: approve terbatas, `previewDeposit`, simulasi, status pending/confirmed, error state (cap penuh, paused, shutdown, wrong network, reject, revert).
4. Withdraw flow: `maxWithdraw` sebagai batas, `max_loss` eksplisit (default 0% untuk `withdraw`), peringatan penarikan parsial, hasil aktual dari event.
5. Portfolio: posisi (`convertToAssets`), nilai vs dapat ditarik, riwayat report/fee, ekspor data.
6. Transparency: alamat kontrak, `apiVersion`, hash artefak, dokumen `docs/*`, riwayat peran, bukti transaksi.
7. Accessibility: keyboard, focus, kontras; angka desimal 6 konsisten; tidak ada countdown palsu.

## Boundaries
- Tidak menampilkan vault `research` dengan CTA deposit.
- Tidak mengarang APY, TVL, atau "audited".
- Tidak memakai data indexer tanpa menandai block.

## Risiko
- Godaan menyalin visual Kassora tanpa capture → larangan: parity hanya untuk struktur informasi (lihat `docs/REFERENCE_CAPTURE.md` §1).
- `max_loss` default `redeem = 10000` bocor ke UI → test snapshot pada copy + parameter tx.
- Desimal 6 mudah salah format (1e6 vs 1e18) → semua lewat SDK.