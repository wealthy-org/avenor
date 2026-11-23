# Implementation Plan — Tiket 7.3: Execute limited launch with caps, allowlist and on-call

**Parent Epic:** Epic 7: Security Review, Limited Launch & Transaction Proof  
**Tiket:** 3 / 5 (`hitl: true`, `risk: high`)  
**Status:** In Progress / Rehearsed on Staging Fork  

---

## 1. Konteks & Tujuan

Melakukan validasi peluncuran terbatas (*limited launch*) dengan kontrol ketat:
1. `deposit_limit` awal bertahap (dimulai dari cap konservatif).
2. Mekanisme penutupan deposit melalui `deposit_limit = 0` / `deposit_hook` (bukan `setPaused`).
3. Seed dead shares (1.000 USDG) untuk mencegah ERC-4626 inflation attack.
4. Peran TimelockController 48 jam dan Emergency Timelock 6 jam aktif.
5. Keeper dan monitoring siaga tanpa alarm palsu.

---

## 2. Rehearsal & Verifikasi Staging

| Komponen | Target | Hasil Staging (Fork Pin 118337511) | Status |
|----------|--------|-----------------------------------|--------|
| Dead Shares Seeding | 1.000 USDG | `1.000.000.000` base units dicetak ke vault | ✅ Lolos |
| Deposit Limit Kontrol | Buka bertahap | Timelock `set_deposit_limit(50.000 USDG)` di blok 118337648 | ✅ Lolos |
| User Deposit Rehearsal | Deposit sukses | User `0x235eAb...` deposit 1.000 USDG di blok 118337652 | ✅ Lolos |
| Incident Drills (D1-D4) | 4 skenario lolos | Pause, 6h force-revoke, liquidity monitor, shutdown | ✅ Lolos |
| Web App Integration | Status & Portofolio | Portofolio user `1.000 avUSDG`, TVL `2.000 USDG` | ✅ Lolos |

---

## 3. Checklist Kesiapan Mainnet (Limited Launch Gate)

- [x] Verifikasi toolchain dan bytecode matching (`verify-all.py`).
- [x] Dokumen cakupan audit independen (`docs/AUDIT_SCOPE.md`).
- [x] Register remediasi 12 temuan audit tertutup test regresi (`docs/REMEDIATION.md`).
- [x] 4 Incident Drills tereksekusi dengan bukti on-chain (`docs/DRILL_EVIDENCE.md`).
- [x] Rehearsal deposit pengguna dan verifikasi portofolio Web App.
- [ ] Multi-sig Safe signers dikonfirmasi (Guardian, Treasury, Timelock Proposer/Executor).
- [ ] Mainnet deployment broadcast via `DEPLOY_MODE=prod script/Deploy.s.sol`.
- [ ] Timelock delay 48 jam untuk `accept_role_manager()` selesai.
- [ ] On-call monitoring siaga 72 jam pertama pasca-deploy.
