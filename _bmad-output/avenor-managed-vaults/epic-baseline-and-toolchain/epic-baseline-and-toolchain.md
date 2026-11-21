---
type: epic
title: "Slice S0 — Baseline Reproduction, Toolchain & Compatibility Matrix"
parent: "initiative-avenor-managed-vaults"
covers: ["S0"]
status: done
---

# Epic 1: Baseline Reproduction, Toolchain & Compatibility Matrix

## Intent
Menutup semua blocker lingkungan dan membuktikan bahwa kombinasi versi yang kita pin benar-benar bisa dibangun dan dijalankan. Tanpa ini, setiap klaim berikutnya (accounting, fee, peran) berdiri di atas versi yang tidak terverifikasi.

## Outcome
`forge build` hijau, bytecode Vyper `VaultV3` tereproduksi identik dengan artefak rilis, matriks kompatibilitas `vault v3.1.1 × strategi v3.1.0 × periphery` terisi data uji, dan `docs/SECURITY_DIFF.md` selesai.

## Done When
1. Foundry terpasang dan versinya tercatat di `docs/BASELINE.md`; `packages/contracts` build dengan solc `0.8.18`, evm `paris`.
2. `ape compile` (Vyper `0.3.10`, Python 3.11) mereproduksi runtime bytecode `VaultV3`/`VaultFactory` — `keccak256` sama dengan artefak rilis; hasil dicatat.
3. `packages/core/artifacts/*.json` (ABI + bytecode) di-commit dan dipakai SDK/app, bukan ABI copy-paste.
4. Matriks kompatibilitas diuji: `Accountant`, `RoleManager`, `DebtAllocator` periphery berjalan terhadap vault pin kita (bukan asumsi).
5. `docs/SECURITY_DIFF.md` mencatat setiap perubahan keamanan commit 2026 dibanding commit audit 2023, dengan dampak per temuan.
6. Verifikasi on-chain `USDG` (`symbol`, `decimals = 6`, `totalSupply`) melalui RPC `4663` tercatat beserta block number.

## Boundaries
- Tidak ada deploy ke mainnet pada slice ini. Fork test boleh memakai RPC publik, tidak boleh transaksi.
- Tidak menulis kode produk (adapter) — hanya scaffold build dan harness.

## Risiko
- `eth-ape==0.8.10` di Python 3.13 gagal → pakai env 3.11, jangan menambal.
- RPC publik membatasi `eth_call` berat → siapkan endpoint alternatif atau `anvil --fork` lokal dengan cache.
- Explorer diblokir Cloudflare → verifikasi lewat RPC saja, jangan mengandalkan explorer API.