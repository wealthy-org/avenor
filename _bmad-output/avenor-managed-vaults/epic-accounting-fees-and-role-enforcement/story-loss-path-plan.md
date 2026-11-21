---
title: 'Loss path: healthcheck rejection and force revoke accounting'
type: 'implement'
ticket: 3
created: '2026-11-20'
status: done
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['referensi/yearn-vaults-v3/contracts/VaultV3.vy', 'packages/contracts/lib/yearn-periphery/src/accountants/Accountant.sol', 'docs/FEE_CONFIG.md', 'packages/contracts/test/unit/LossPath.t.sol']
---

# Loss path: healthcheck rejection and force revoke accounting

## What the code actually does (read before testing)

- `VaultV3._process_report` computes `shares_to_burn` from the **pre-report** pps and then burns
  `min(shares_to_burn, vault's own locked shares)` (`VaultV3.vy:1246-1274`). A loss therefore eats
  the profit buffer first and only reaches holders when the buffer is smaller than the loss.
- `Accountant.report` reverts `"too much loss"` when `loss > current_debt * maxLoss / 10_000`
  (`Accountant.sol:241-246`), unless the fee manager used the one-shot `turnOffHealthCheck`.
- `force_revoke_strategy` → `_revoke_strategy(strategy, True)` writes off the **entire**
  `current_debt` (`VaultV3.vy:970-977`), emits `StrategyReported(strategy, 0, loss, 0, 0, 0, 0)`,
  and deletes the strategy. It does not read the strategy's current value and does not burn shares.

## Tests (`test/unit/LossPath.t.sol`, 4 tests, all green)

| Test | What it pins |
|---|---|
| `test_lossWithinMaxLossBurnsTheProfitBufferAndLeavesPpsUntouched` | gain 30.000 → fee 3.000 shares, locked 27.000; then loss 20.000 → locked 7.000, supply 1.010.000, assets 1.010.000, **pps stays 1.000000**, no new fee shares |
| `test_lossWithoutProfitBufferLowersPpsByExactlyTheLoss` | loss 2% → `to_burn = min(20.000, 0) = 0`, supply unchanged, `pps == 980_000` exactly, no share outside the four accounted holders |
| `test_forceRevokeWritesTheWholeDebtOffWithoutBurningShares` | 3% loss refused by the health check; then force revoke through the ADR-12 fast lane (schedule → early execute reverts → +6h → execute). Debt written off in full, `totalAssets == 0`, `pps == 0`, **supply unchanged**, vault still owns 1.000.000 strategy shares worth 970.000e6 |
| `test_reAddingTheRevokedStrategyCreditsValueBackButChargesAFeeOnIt` | re-add + `turnOffHealthCheck` → recovered 485.000 booked as gain, fee 48.500 (97.000 shares at pps 0.5), final `pps == 897_903` per 1e6 |

## Findings recorded instead of smoothed over

1. **The ticket's wording "membakar shares" is wrong for `force_revoke`**: no share is burned, the
   supply is unchanged and pps collapses. The re-add path is what recovers the stranded value —
   and it charges a 10% fee on a gain that only reverses a write-off, so a 1.5% market loss becomes a
   10.21% user loss. Written into `docs/FEE_CONFIG.md` §7 with the measured numbers.
2. **`LossReported` does not exist** in `VaultV3` or `Accountant`. The event to index is
   `StrategyReported(strategy, gain, loss, current_debt, protocol_fees, total_fees, total_refunds)`.
   `docs/FEE_CONFIG.md` §7 now says so.
3. **Recovery always trips `maxGain`**: after a full write-off `current_debt == 0`, so any gain is
   infinite percent; the keeper cannot report without `turnOffHealthCheck`. That is an operator
   step in the runbook, not a bug in the vault.
4. **A loss report charges nothing** — the accountant's shares sitting in that test are the fee from
   the earlier gain report. Asserting "balance == 0" would have been a lie about the mechanism.

## Evidence

`forge test --match-path test/unit/LossPath.t.sol` → 4 passed, 0 failed. Whole gate:
`python scripts/verify-all.py` → `ALL CHECKS PASSED`.