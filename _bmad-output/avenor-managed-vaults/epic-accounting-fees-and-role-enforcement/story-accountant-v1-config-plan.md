---
title: 'Accountant v1 fee parameters wired at deploy'
type: 'implement'
ticket: 1
created: '2026-11-20'
status: done
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/FEE_CONFIG.md', 'docs/ARCHITECTURE.md', 'packages/contracts/script/Deploy.s.sol', 'packages/contracts/test/unit/AccountantFees.t.sol']
---

# Accountant v1 fee parameters wired at deploy

## What the ticket asked

Deploy the `Accountant`, set `defaultConfig` to the v1 numbers (`performanceFee 1000`,
`managementFee 0`, `refundRatio 0`, `maxFee 0`, `maxGain 500`, `maxLoss 200`), `add_vault`,
`set_accountant` on the vault. Proof: reproduce `FEE_CONFIG.md` §6 (`gain 3000 → fee 300`,
locked shares worth 2700, refund 0 because the accountant is unfunded).

## What exists (verified on this tree)

- `script/Deploy.s.sol` — `_deployAccountant`, `addVault`, `set_accountant`, and in prod the
  same three calls inside the 10-call timelock proposal.
- `src/interfaces/IAccountant.sol` — the surface the script and tests use.
- `test/unit/AccountantFees.t.sol` — 8 tests including
  `test_documentedExampleFeesLockAndUnlock` and `test_strategyTotalAssetsIsLiveSoTheVaultCanSeeTheVenue`.
- `test/unit/DeployScript.t.sol` — 16 tests, including the fee-config assertions read back
  from the deployed accountant.

## Evidence

`python scripts/verify-all.py` → `ALL CHECKS PASSED`, 67 unit tests (this ticket's suite is part
of the 67). The §6 example produces `total_fees = 300e6`, `locked = 2_700e6`,
`totalAssets = 1_003_000e6`, `totalSupply = 1_000_300e6` after unlock, `convertToAssets(1e6) =
1_002_699` (±2), which is the documented 0,2699 % rise rather than a round 0,27 %.

## Open item recorded by the previous note

The ticket's note said the fork acceptance was blocked on an archive RPC. That is no longer
true: `python scripts/fork-test.py` runs the pinned block `118337511` and
`test_e2e_venueAccrualIsReportedAsGainAndFee` exercises accrual → report → fee on the real
venue. The unit-level §6 reproduction above is unaffected either way.