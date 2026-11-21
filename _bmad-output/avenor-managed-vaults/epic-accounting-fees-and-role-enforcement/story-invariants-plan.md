---
title: 'Stateful invariant suite across deposit/withdraw/report/role changes'
type: 'implement'
ticket: 4
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
context: ['packages/contracts/test/invariant/VaultHandler.sol', 'packages/contracts/test/invariant/VaultInvariants.t.sol', 'packages/contracts/test/unit/MaliciousVenue.t.sol', 'packages/contracts/foundry.toml', 'docs/SECURITY_DIFF.md']
---

# Stateful invariant suite across deposit/withdraw/report/role changes

## Why these invariants and not others

The suite is **accounting-only**. A property that needs a scenario (who absorbs a loss, what a
fee on a recovery costs) is already pinned by `test/unit/LossPath.t.sol`, and repeating it here
would only add a second way to fail for the same reason. What follows must hold after *every*
call, in any order, which is exactly what a one-shot test cannot prove.

Seven invariants, each with the bug it would catch:

| Invariant | Bug it catches |
|---|---|
| `totalAssets == totalIdle + totalDebt` | a report/withdraw crediting one side without the other |
| every share is held by a named holder | a mint that credits nobody, a burn that burns too much, fee shares to an unknown address |
| `isPaused ⇒ maxDeposit == maxMint == 0` | a pause that still takes new money (ADR-5 says pause is deposits only) |
| `pricePerShare == convertToAssets(10**decimals)` | the documented definition drifting from the enforced one |
| no holder claims more than `totalAssets` | a gain double-counted or a loss credited to the wrong side |
| `previewRedeem(previewDeposit(x)) <= x` at 1, 1e6, 100.000e6 | a round trip that mints value, including the 1-wei corner |
| `unlockedShares <= balanceOf(vault)` and accountant claim `<= totalAssets` | locked profit escaping the buffer, or a fee claim the last exit cannot fund |

`VaultHandler` randomises deposit, mint, withdraw, redeem, transferShares, report (gain/loss),
updateDebt, setDepositLimit, setPaused, setProfitMaxUnlockTime. Bounds: deposit ≤ 500.000e6,
gain ≤ 4 %, loss ≤ 1.5 % — inside the deployed `maxGain = 500` / `maxLoss = 200` bps so a
health-check revert is not what the fuzzer spends its runs on. Ghost counters are diagnostics
only; no invariant reads them.

`fail_on_revert = false` is load-bearing, not laziness: the handler deliberately produces calls
the vault **must** refuse (deposit past the limit, redeem with too tight a `max_loss`,
`update_debt` that does not change the debt). Those are discarded calls. Catching them inside the
handler would erase the difference between "the vault refused this" and "the sequence was never
tried".

## Configuration and measured cost

`foundry.toml [invariant]`: `runs = 10000` (the ticket's number), `depth = 16` (down from 32),
`fail_on_revert = false`.

- Why `depth` 16 and not 32: every action is multi-step, so 10.000 × 16 already walks the
  deposit → report → update_debt → withdraw space. Raising depth multiplies wall time without
  reaching new states. `runs` was **not** lowered — that is the coverage knob the ticket names.
- Measured: **130 s** for the single invariant test (10.000 runs, 10 selectors, 0 failures).
  `python scripts/verify-all.py` therefore grew by ~2 minutes. If that ever becomes the
  bottleneck, lower `depth` and say so in `docs/REPRODUCIBILITY.md`; do not lower `runs`.

## `SECURITY_DIFF.md` T1 — a gap the suite did not cover

T1 claimed the invariant suite would prove that a strategy reporting `withdrawn >
assets_to_withdraw` cannot make `unsafe_sub` wrap. A random handler over the honest adapter never
produces that input, so the claim would have been hollow. `test/unit/MaliciousVenue.t.sol` closes
it with four targeted tests against `MockVenue` knobs:

| Test | What it pins |
|---|---|
| `test_venuePayingMoreThanRequestedBecomesAGainNotAWrappedBalance` | venue pays 20.000 extra on a 500.000 pull; vault credits exactly its balance delta (500.000), the surplus stays in the strategy and is reported as a **gain**; identity holds, no negative debt |
| `test_absurdReturnValueCannotChangeTheAccounting` | venue returns 18-decimal shares (1e12× the assets paid); the adapter measures the delta, so the lie is inert |
| `test_illiquidPullMovesLessDebtAndTheRestFollowsWhenLiquidityReturns` | venue can only pay 490.000 of a 500.000 pull: debt shrinks by the amount that *actually* moved, `totalAssets` is unchanged (nothing was lost), and the rest is pulled once liquidity returns |
| `test_overpaymentLargerThanTheRemainingDebtIsCappedNotWrapped` | `withdrawn > current_debt`: `assets_to_withdraw` is capped at `current_debt`, debt floors at zero instead of wrapping |

## Measured behaviour worth knowing (recorded, not smoothed)

1. `TokenizedStrategy` latches its totals for the block an accrual happened in
   (`_simulatedTotals`, "otherwise from the next block"). A gain created and reported in the same
   block is **not** visible; the adversary test warps one second, which is what a keeper does
   anyway. Vault-side: this is another reason `process_report` is a keeper action, not something
   to fold into a user transaction.
2. `VaultV3._withdraw_from_strategy` (`VaultV3.vy:744`) calls `IStrategy.redeem(shares, self,
   self)` with no `max_loss`. `TokenizedStrategy` clamps the payout to
   `availableWithdrawLimit`, and the vault reduces debt by `min(post - pre, current_debt)`
   (`:1064`) — so an illiquid pull moves **less debt**, it does not book a loss and does not
   revert. The adapter's `_freeFunds` guard protects the *user* path; the vault path is bounded by
   the measured amount instead.

## Verification

- `forge test --match-path test/invariant/VaultInvariants.t.sol` → 1 passed, 130 s.
- `forge test --match-path test/unit/MaliciousVenue.t.sol` → 4 passed.
- `python scripts/verify-all.py` → see commit message; unit total is now 100 tests in 10 suites.