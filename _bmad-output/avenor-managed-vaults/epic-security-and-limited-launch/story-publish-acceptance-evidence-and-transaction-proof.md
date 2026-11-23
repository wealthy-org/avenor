---
id: 4
type: story
title: "Publish acceptance evidence and transaction proof"
parent: epic-security-and-limited-launch
covers: [S6]
after: [3]
hitl: false
risk: medium
status: done
---

# Publish acceptance evidence and transaction proof

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
