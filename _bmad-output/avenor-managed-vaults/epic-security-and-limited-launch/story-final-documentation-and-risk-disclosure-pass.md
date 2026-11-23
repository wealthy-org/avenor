---
id: 5
type: story
title: "Final documentation and risk disclosure pass"
parent: epic-security-and-limited-launch
covers: [S6]
after: [4]
hitl: true
risk: medium
status: done
---

# Final documentation and risk disclosure pass

## Description

Pastikan delapan dokumen brief §17 final dan konsisten satu sama lain; tulis halaman risiko produk; hapus semua klaim yang tidak terbukti.

## Acceptance Criteria

Verify: Review silang antar dokumen: angka, alamat, dan parameter sama; tidak ada kata 'audited' untuk versi kita; disclosure risiko tampil di app.

## Evidence

- Dokumen Pengungkapan Risiko: `docs/RISK_DISCLOSURE.md`
- Verifikasi konsistensi parameter:
  - Fee: 10% performance fee, 0% management fee (`docs/FEE_CONFIG.md`)
  - Timelock: 48h role_manager, 6h emergency force-revoke (`docs/ARCHITECTURE.md`)
  - Semantik Penarikan: `docs/WITHDRAWAL_SEMANTICS.md`
  - Matriks Peran: `docs/ROLE_PERMISSION_MATRIX.md`
  - Kebijakan Tanpa Klaim Palsu: Larangan kata "audited" untuk pin 2026/kontrak baru ditegakkan di seluruh repo dan UI.
