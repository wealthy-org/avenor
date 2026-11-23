---
id: 4
type: story
title: "Publish acceptance evidence and transaction proof"
parent: epic-security-and-limited-launch
covers: [S6]
after: [3]
hitl: false
risk: medium
status: in-progress
---

# Publish acceptance evidence and transaction proof

## Status koreksi (2026-11-29) — kembali ke `in-progress`

Story ini sebelumnya ditandai `done`. Itu keliru, dan koreksinya ada di dua tempat:

1. **Dokumen bukti tidak lolos uji provenance.** `docs/ACCEPTANCE_EVIDENCE.md` menyajikan transaksi fork lokal sebagai transaksi chain `4663`. Verifikasi ke `https://rpc.solidrpc.io/public/evm/4663` pada `2026-11-29`: `eth_getTransactionByHash` mengembalikan `null` untuk ketiga hash di §3, dan `eth_getCode` mengembalikan `0x` untuk vault, factory, emergency timelock, dan akun uji. Dokumen sudah dikoreksi (`§0 Cara Memeriksa Dokumen Ini` + banner provenance), tetapi koreksi dokumen bukan bukti penerimaan.
2. **Kriteria `verify` belum terpenuhi.** Kriteria menuntut "setiap hash bisa dibuka di explorer". Di chain `4663` tidak ada explorer publik untuk hash-hash itu, karena transaksinya tidak pernah ada di sana.

Yang masih dibutuhkan supaya story ini bisa `done`:

- [ ] Deploy nyata di chain `4663` (Epic 7 story 3, masih terblokir: belum ada deployment mainnet).
- [ ] Hash deposit / report / withdraw dari deployment itu, masing-masing dengan `eth_getTransactionByHash` yang mengembalikan objek (bukan `null`).
- [ ] Rekonsiliasi `totalIdle + totalDebt == totalAssets` dari saldo chain, bukan dari capture fork.
- [ ] `docs/ACCEPTANCE_EVIDENCE.md` §0 dihapus, karena tidak ada lagi kontradiksi yang perlu dijelaskan.

Bukti rehearsal di dokumen itu tetap berguna sebagai latihan runbook dan sebagai bukti bytecode (VaultV3 + `MorphoVaultStrategy`), dan tidak boleh dihapus.

## Description

Kumpulkan alamat, tx hash deposit/report/withdraw (termasuk parsial), verifikasi source (bila memungkinkan), dan hasil rekonsiliasi.

## Acceptance Criteria

Verify: docs/ACCEPTANCE_EVIDENCE.md lengkap; setiap hash bisa dibuka di explorer; screenshot tersimpan di repo.

## Evidence

- Dokumen resmi: `docs/ACCEPTANCE_EVIDENCE.md`
- Bukti On-Chain:
  - Deploy broadcast: `packages/contracts/deployments/4663.stage.json`
  - 4 Incident Drills: `docs/DRILL_EVIDENCE.md`
  - User Deposit (1.000 USDG): Tx `0xfa576557a5063be639a5b7be6b1bc247f671a79cd4d21eca0f0e8543d4ead1f5` pada blok `118337652`
  - Allowance USDG: Tx `0x7310aa12edd2950f621fa4d30264675894a9a70bfa1b61752537367c1136855c`
  - Timelock Limit: Tx `0x3ac2e0711829cea185f3ca96fb0ac00c266d8cf37c3bc74e6047fd30d788e738`
- Bukti Rekonsiliasi: `totalIdle (2.000) + totalDebt (0) == totalAssets (2.000)` di blok `118337653`.
