---
title: 'Define review scope and engage independent reviewer'
type: 'implement'
ticket: 1
created: '2026-11-22'
status: done
baseline_revision: 'f811c20'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'docs audit review'
review_source: 'pinned'
---

# Scope Review Keamanan Independen & Kriteria Keterlibatan

Tiket BMAD: `epic-security-and-limited-launch` / Tiket 1 (Slice S6).

## Hasil

Dokumen cakupan review keamanan formal telah disusun dan disahkan pada `docs/AUDIT_SCOPE.md`. Cakupan membatasi secara tegas apa yang menjadi tanggung jawab kode baru kita vs asumsi upstream, invariant solvabilitas akuntansi, serta vektor eksploitasi kunci yang wajib diuji reviewer eksternal.

## Yang Disahkan

1. **Komponen In-Scope:**
   - `packages/contracts/src/strategies/MorphoVaultStrategy.sol`: logic `_freeFunds` yang revert saat venue kekurangan kas (`VenueLiquidityShortfall`), manajemen kas idle, serta pengukuran saldo delta token USDG langsung.
   - `packages/contracts/src/hooks/DepositCapHook.sol`: batas global `totalAssets`, batas posisi per-wallet, allowlist peluncuran terbatas, sifat non-blocking terhadap penarikan, tata kelola timelock 48 jam.
   - `packages/contracts/script/Deploy.s.sol`: urutan deployment deterministik, wiring peran, dual-speed governance (timelock 48 jam vs emergency timelock 6 jam), dan assert runtime bytecode.
   - `packages/contracts/src/interfaces/Roles.sol`: definisi 14 bit peran Yearn V3 dan pemetaan bitmask.

2. **Batasan Upstream & Asumsi Integrasi:**
   - Core `VaultV3.vy@f449264f` (API 3.1.1) dan kanonik `TokenizedStrategy` (`0x3110D1Ee...`) dinyatakan *out-of-scope* untuk audit ulang dari nol; reviewer meninjau dokumen `docs/SECURITY_DIFF.md` untuk memvalidasi keamanan delta kode 2023 vs 2026.
   - Dilarang mengklaim "audited" untuk deployment produk kita sebelum audit pihak ketiga selesai dan laporan diterbitkan.

3. **Lima Invariant Wajib:**
   - Solvabilitas akuntansi: `total_assets == total_idle + total_debt`.
   - Kemandirian penarikan: hook deposit tidak pernah membatasi fungsi `withdraw` / `redeem`.
   - Batasan wewenang keeper: `REPORTING_MANAGER` & `DEBT_MANAGER` dibatasi batas revert `Accountant.maxGain` (5%) dan `Accountant.maxLoss` (2%).
   - Pemisahan tata kelola darurat: Guardian memegang `EMERGENCY_MANAGER` (pause instan) dan hanya bisa memicu `FORCE_REVOKE_MANAGER` lewat timelock darurat 6 jam. Guardian bukan proposer timelock 48 jam.
   - Anti share-inflation: Seed treasury 1.000 USDG permanen (`0xdEaD`) + minimum deposit 10 USDG.

4. **Kriteria Keterlibatan Reviewer Eksternal:**
   - Reviewer independen dari pengembang inti (rekomendasi: auditor terakreditasi / alumni ekosistem Yearn & Morpho).
   - Gate peluncuran: 0 temuan *Critical/High* terbuka. Semua temuan wajib memiliki bukti regresi test.

## Status

Tiket 7.1 dinyatakan **done**. Langkah berikutnya adalah Tiket 7.2 (Remediasi temuan & regresi pengujian) saat proses review eksternal berlangsung.
