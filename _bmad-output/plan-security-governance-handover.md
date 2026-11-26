---
title: 'Testnet security and governance handover gate'
type: 'feature'
ticket: ''
created: '2026-11-26'
status: 'in-progress'
baseline_revision: '3040d5c'
route: 'oneshot'
route_source: 'pinned'
risk: 'high'
review: 'thorough'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context:
  - 'AGENTS.md'
  - 'GAP_ANALYSIS_Avenor.md'
  - 'docs/ROLE_PERMISSION_MATRIX.md'
  - 'docs/DEPLOYMENT.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Testnet governance handover and signer separation remain unproven. The vault may still have deployer control, Safe owners may use predictable test keys, and evidence may claim completion without onchain proof.

**Approach:** Execute only the safe, verifiable governance gate first: inspect current chain state, refuse unsafe irreversible actions without explicit signer authorization, add automated handover checks and evidence updates, then verify all results before any deposit or lifecycle work.

</frozen-after-approval>

## Implementation Notes

Execution starts with read-only inspection. Onchain transactions, signer rotation, timelock scheduling, and irreversible governance actions require explicit authorized credentials and exact target confirmation. No secrets will be read, printed, committed, or guessed.

## Verification

**Commands:**
- `npm test --prefix apps/web` -- expected: all tests pass.
- `git diff --check` -- expected: no whitespace errors.
- `python scripts/verify-all.py` -- expected: pass when contract changes are made.
- Authorized RPC checks for `role_manager()`, `future_role_manager()`, `management()`, Safe owners, threshold, and timelock state -- expected: values match documented governance addresses.
