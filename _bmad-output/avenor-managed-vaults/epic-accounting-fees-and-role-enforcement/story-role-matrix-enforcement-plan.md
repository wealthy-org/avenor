---
title: 'Role matrix encoded and enforced per function'
type: 'implement'
ticket: 2
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
context: ['docs/ROLE_PERMISSION_MATRIX.md', 'packages/contracts/src/interfaces/Roles.sol', 'packages/contracts/script/Deploy.s.sol', 'referensi/yearn-vaults-v3/contracts/VaultV3.vy']
---

# Role matrix encoded and enforced per function

## Plan as executed

1. Read the authority map from the pinned source, not from `ROLE_PERMISSION_MATRIX.md`:
   `grep -n "_enforce_role" referensi/yearn-vaults-v3/contracts/VaultV3.vy`. That produced 19
   call sites plus `role_manager`-only entry points guarded by a bare `assert`.
2. Deploy the real stack in a unit test (dry-run path of `Deploy.s.sol`, `TokenizedStrategy`
   bytecode etched at the canonical implementation address) and then perform the
   `accept_role_manager()` call that the prod proposal performs 48h later, so the suite runs
   against the post-handoff authority state rather than the bootstrap one.
3. Negative: every gated function reverts `"not allowed"` for an account with no bits.
   `role_manager`-only functions are asserted separately because their revert carries no string.
4. Positive: each of the 14 bits is set alone and must be sufficient for its own function.
5. Regression: `shutdown_vault` side effects (limit 0, hook cleared, `DEBT_MANAGER` granted to
   the caller, withdrawals not paused) and the same call from an unprivileged account changing
   nothing.
6. Fuzz: `set_minimum_total_idle` with an arbitrary role bitmask — proves the check is an exact
   bit test, not `roles != 0`.

## Findings the tests forced (documentation was wrong)

1. **`set_auto_allocate` is `DEBT_MANAGER`, not `QUEUE_MANAGER`** (`VaultV3.vy:1438`). The matrix
   said `QUEUE_MANAGER`; the test failed `"not allowed"` and the source settled it.
   `docs/ROLE_PERMISSION_MATRIX.md` §1 and §3 corrected. Consequence now written down: the
   keeper hot wallet can switch on auto-allocation, which spends idle down to
   `minimum_total_idle` without a further transaction.
2. **`set_deposit_hook` defaults to `override = false`** (`:1470`), so it reverts
   `"using deposit limit"` unless `deposit_limit` is already `max`; with `override = true` it
   resets the limit to `max` (`:1484-1489`). Limit and hook cannot be set independently.
3. **`FORCE_REVOKE_MANAGER` divergence, resolved as ADR-12** (owner decision, brief line 218:
   de-risking may have a *bounded* fast lane). Shipped wiring before the fix put the bit on the
   48h governance timelock because ADR-4 does not deploy Yearn's `TimelockExecutor`.
   Resolution: a **second** `TimelockController` with a 6h delay, proposer/executor = guardian
   Safe, holding `Roles.emergencyRoleSet()` = `FORCE_REVOKE_MANAGER` only.
   - `Roles.governanceRoleSet()` drops bit 4 → `3995`; guardian Safe still holds
     `EMERGENCY_MANAGER` only, so neither a stolen guardian key nor the governance timelock can
     yank a strategy instantly.
   - Deploy script deploys it, grants it in both modes (11th prod proposal call), asserts
     `getMinDelay() < 48h`, asserts the guardian is its proposer and that the governance proposer
     is not, and records `emergencyTimelock` in `deployment`/`roleMatrix` output.
   - Tests: `test_forceRevokeSitsOnTheBoundedFastLane` (placement, 6h, proposer split) and
     `test_guardianCanForceRevokeThroughTheFastLaneInSixHours` (schedule → execute early reverts →
     warp 6h → execute → `strategies(strategy).activation == 0`).
   - Damage bound is structural: `force_revoke_strategy` can only realise an existing loss into the
     share price; it cannot change parameters, open deposits or move `role_manager`.

## Evidence

`forge test --match-path test/unit/RoleEnforcement.t.sol` → **13 passed, 0 failed**
(`test_eachBitIsSufficientForItsOwnFunction` gas 3.488.993; fuzz 1024 runs). Whole gate:
`python scripts/verify-all.py` → `ALL CHECKS PASSED`.

## Not done here

`buy_debt` is proven by the positive path in this suite (treasury absorbs 1.000e6 of a 5.000e6
allocation) but **not** at a loss/at a discount; that belongs to ticket 3.3 and epik 4.