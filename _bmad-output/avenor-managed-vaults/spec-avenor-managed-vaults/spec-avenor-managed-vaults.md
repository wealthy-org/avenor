---
type: spec
title: "Spec — Avenor USDG Managed Yield"
status: draft
version: 0.1
created: 2026-11-19
parent: "initiative-avenor-managed-vaults"
---

# Spec (kernel)

## Masalah

USDG di Robinhood Chain terkonsentrasi di satu venue besar dengan likuiditas segera 13,6%; alternatif lain menawarkan APY tinggi tanpa likuiditas dan tanpa disclosure. Tidak ada produk yang menyatukan akses, kontrol peran, dan pengungkapan risiko yang bisa diverifikasi on-chain.

## Solusi

Satu vault ERC-4626 berbasis Yearn V3 Allocator Vault (`API 3.1.1`) yang:
- menerima USDG (6 desimal),
- mengalokasikan ke `steakUSDG` (Morpho Vault V2) via adapter `MorphoVaultStrategy`,
- mengambil fee performa 10% saat report (dibayar dalam shares, unlock 7 hari),
- dikendalikan timelock 48 jam + guardian 3/5 terpisah + keeper terbatas,
- menyajikan angka ber-provenance (block + sumber) di app,
- menyatakan batas penarikan (`maxWithdraw`) sebagai fakta, bukan menyembunyikannya.

## Batasan keras

1. Core Vyper tidak dipatch. Tidak ada fitur yang menuntut patch.
2. `max_loss` eksplisit di setiap tx; default `withdraw=0`, `redeem=10000` tidak boleh dipakai implisit.
3. Freeze deposit = `deposit_limit`/hook. `setPaused` = insiden, dengan konsekuensi penarikan berhenti.
4. `role_manager` = `TimelockController` ≥ 48 jam sebelum deposit publik.
5. Tidak ada klaim audit untuk pin 2026; tidak ada janji likuiditas instan.
6. Semua angka UI dari on-chain/indexer ber-provenance.

## Definisi istilah

| Istilah | Arti tepat di produk ini |
|---|---|
| Vault | `VaultV3` yang kita deploy; satu per produk |
| Strategi | `MorphoVaultStrategy`; satu-satunya kontrak baru yang memegang dana |
| Venue | kontrak pihak ketiga ERC-4626 (`steakUSDG`) |
| TVL | `totalAssets()` = `total_idle + total_debt` |
| Dapat ditarik | `maxWithdraw(owner)` pada block terakhir |
| Net APY | `netApy` venue, bukan turunan fee vault |
| Fee | shares yang dicetak ke `accountant` saat report gain |

## Alur kritis

1. deposit → approve persis → `deposit(assets, receiver)` → shares dari event.
2. alokasi → keeper `update_debt` dalam batas `maxRatio`, cap venue, `minimum_total_idle`.
3. report → `MorphoVaultStrategy._harvestAndReport` → `_process_report` → `Accountant.report` → fee shares + profit lock.
4. withdraw → idle dulu → recall strategi → batas `maxWithdraw` venue → loss dibebankan ke penarik → `max_loss` dijaga.

## Kriteria penerimaan tingkat atas

1. `forge test` unit + fork + invariant hijau; 12 kasus `WITHDRAWAL_SEMANTICS.md` §6 tertutup.
2. `deployments/4663.json` dengan peran terverifikasi on-chain dan timelock aktif.
3. App lulus FR-1..FR-7 dengan 12 state UX.
4. Keeper soak 7 hari; runbook drill 4 skenario.
5. Review eksternal selesai; critical/high tertutup.
6. Delapan dokumen brief §17 final + `SECURITY_DIFF` + `RUNBOOK` + `ACCEPTANCE_EVIDENCE`.

## Dokumen turunan

`docs/BASELINE.md`, `docs/REFERENCE_CAPTURE.md`, `docs/ARCHITECTURE.md`, `docs/ACCOUNTING.md`, `docs/WITHDRAWAL_SEMANTICS.md`, `docs/VENUE_INTEGRATIONS.md`, `docs/FEE_CONFIG.md`, `docs/ROLE_PERMISSION_MATRIX.md`, `prd-avenor-managed-vaults/`, `ux-avenor-managed-vaults/{DESIGN,EXPERIENCE}.md`.