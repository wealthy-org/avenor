# Implementation Plan — Tiket 7.3: Execute limited launch with caps, allowlist and on-call

**Parent Epic:** Epic 7: Security Review, Limited Launch & Transaction Proof  
**Tiket:** 3 / 5 (`hitl: true`, `risk: high`)  
**Status:** done  
**Completed At:** 2026-11-23  

---

## 1. Konteks & Tujuan

Melakukan validasi peluncuran terbatas (*limited launch*) dengan kontrol ketat:
1. `deposit_limit` awal bertahap (dimulai dari cap konservatif 50.000 USDG).
2. Mekanisme penutupan deposit melalui `deposit_limit = 0` / `deposit_hook` (bukan `setPaused`).
3. Seed dead shares (1.000 USDG) untuk mencegah ERC-4626 inflation attack.
4. Peran TimelockController 48 jam dan Emergency Timelock 6 jam aktif.
5. Rehearsal transfer dan penerimaan `role_manager` oleh TimelockController 48 jam.
6. Rehearsal penarikan dwiarah (*bidirectional withdrawal*) dengan explicit `max_loss = 0`.
7. Keeper dan monitoring siaga tanpa alarm palsu.

---

## 2. Rehearsal & Verifikasi Staging

| Komponen | Target | Hasil Staging (Fork Pin 118337511) | Status |
|----------|--------|-----------------------------------|--------|
| Dead Shares Seeding | 1.000 USDG | `1.000.000.000` base units dicetak ke vault | ✅ Lolos |
| Deposit Limit Kontrol | Buka bertahap | Timelock `set_deposit_limit(50.000 USDG)` di blok 118337648 | ✅ Lolos |
| User Deposit Rehearsal | Deposit sukses | User `0x235eAb...` deposit 1.000 USDG di blok 118337652 | ✅ Lolos |
| User Withdrawal Rehearsal | Withdraw 200 USDG | User withdraw 200 USDG di blok 118337656 dengan `max_loss = 0` | ✅ Lolos |
| Timelock 48h Handoff | Role Manager diterima | Timelock execute `accept_role_manager()` & `acceptManagement()` | ✅ Lolos |
| Incident Drills (D1-D4) | 4 skenario lolos | Pause, 6h force-revoke, liquidity monitor, shutdown | ✅ Lolos |
| Web App Integration | Status & Portofolio | Portofolio user `800 avUSDG`, TVL `1.800 USDG` live update | ✅ Lolos |

---

## 3. Checklist Kesiapan Mainnet (Limited Launch Gate)

- [x] Verifikasi toolchain dan bytecode matching (`verify-all.py`).
- [x] Dokumen cakupan audit independen (`docs/AUDIT_SCOPE.md`).
- [x] Register remediasi 12 temuan audit tertutup test regresi (`docs/REMEDIATION.md`).
- [x] 4 Incident Drills tereksekusi dengan bukti on-chain (`docs/DRILL_EVIDENCE.md`).
- [x] Rehearsal deposit & withdrawal pengguna terverifikasi on-chain dan via Web App.
- [x] Timelock delay 48 jam untuk `accept_role_manager()` dan `acceptManagement()` tereksekusi.
- [x] Soak test keeper 7 hari terverifikasi bersih (`services/keeper/test/soak.test.ts`).
- [x] Dokumen bukti penerimaan transaksi (`docs/ACCEPTANCE_EVIDENCE.md`) dan pengungkapan risiko (`docs/RISK_DISCLOSURE.md`).
