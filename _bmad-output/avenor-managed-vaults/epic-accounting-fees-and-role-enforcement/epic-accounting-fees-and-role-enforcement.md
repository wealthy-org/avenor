---
type: epic
title: "Slice S2 — Accounting, Fee Engine, Role Enforcement & Invariants"
parent: "initiative-avenor-managed-vaults"
covers: ["S2"]
status: done
---

# Epic 3: Accounting, Fee Engine, Role Enforcement & Invariants

## Intent
Mengubah "vault yang jalan" menjadi "vault yang angka-nya bisa dipertanggungjawabkan": fee yang bisa dihitung ulang, peran yang benar-benar dijaga bitnya, dan invariant yang tidak bisa dilanggar oleh kombinasi operasi apa pun.

## Outcome
Suite invariant + test peran + test fee hijau, dengan angka yang cocok dengan contoh di `docs/FEE_CONFIG.md` §6 dan matriks di `docs/ROLE_PERMISSION_MATRIX.md` §1.

## Done When
1. `Accountant` terdeploy di harness dengan `performanceFee = 1000`, `managementFee = 0`, `maxFee = 0`, `maxGain = 500`, `maxLoss = 200`; test membuktikan fee 300 USDG dari gain 3.000 (contoh dokumen).
2. Test membuktikan `maxLoss` Accountant menolak loss > 2% (revert), dan jalur `force_revoke_strategy` menanggung loss eksplisit.
3. Setiap fungsi role-gated punya test negatif (tanpa bit → revert) dan positif (dengan bit → lulus); daftar fungsi = `ROLE_PERMISSION_MATRIX.md` §1.
4. Invariant berjalan minimal 10.000 run: `total_assets == total_idle + total_debt`, `Σ current_debt == total_debt`, `total_supply` konsisten, tidak ada user yang bisa mendapat shares tanpa asset.
5. Test `deposit_limit = 0` membuktikan deposit berhenti **tanpa** memblokir withdraw, dan `setPaused` membuktikan keduanya berhenti (regresi kebijakan ADR-5).
6. `DepositCapHook` (cap per wallet + allowlist) teruji, termasuk `post_deposit` dan penolakan di `available_deposit_limit`.

## Boundaries
- Tidak mengubah core Vyper.
- Tidak menambah fitur fee di luar `Accountant` (tidak ada HWM pada v1).
- Tidak menyentuh indexer/app.

## Risiko
- `maxFee > 0` menghapus management fee saat report loss (`FEE_CONFIG.md` §2) → test regresi wajib agar tidak ada yang "memperbaiki" dengan menyalakan managementFee.
- Invariant bisa lolos secara palsu bila handler tidak memanggil `process_report` → handler harus mencakup report dengan gain/loss acak.
- `shutdown_vault` memberi `DEBT_MANAGER` ke pemanggil → test regresi khusus.