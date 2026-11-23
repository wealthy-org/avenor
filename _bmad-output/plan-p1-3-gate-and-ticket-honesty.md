---
title: 'Stop the gate and the ticket tree from reporting more than was proven'
type: 'chore'
ticket: 'story-publish-acceptance-evidence'
created: '2026-11-29'
status: 'done'
baseline_revision: 'b153c163851738301b10b91f2484d5013097a33b'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** three separate places state a completeness the repository does not have. `scripts/verify-all.py` prints `ALL CHECKS PASSED` while `test/fork/*` was never run. `story-publish-acceptance-evidence-and-transaction-proof` is marked `done` although its own acceptance criterion ("setiap hash bisa dibuka di explorer") cannot be satisfied by a fork transaction. `story-seven-day-soak-with-keeper-metrics` is marked `done` on 168 in-process cycles, not 168 wall-clock hours. A green summary over a partial run is the exact claim the gate exists to prevent.

**Approach:** Make the gate name every gate it did not run and refuse to print the green line for a partial run (`--require-fork` turns that into a failure, and `docs/DEPLOYMENT.md` now uses it). Demote the two stories to `in-progress` with a correction section that says what would close them.

</frozen-after-approval>

## Code Map

- `scripts/verify-all.py` — `main()` dispatch; the fork branch at the bottom, the bytecode branch above it.
- `docs/DEPLOYMENT.md:10-16` — the deploy gate command.
- `docs/REPRODUCIBILITY.md` §8.3 — the sentence that describes fork-test skipping.
- `docs/WEB_APP.md:179` — stale test count.
- `_bmad-output/avenor-managed-vaults/epic-security-and-limited-launch/story-publish-acceptance-evidence-and-transaction-proof.md` — frontmatter `status: done`.
- `_bmad-output/avenor-managed-vaults/epic-keeper-and-operations/story-seven-day-soak-with-keeper-metrics-plan.md` — frontmatter `status: done`.
- `scripts/fork-test.py` — returns 1 when no configured endpoint serves the pin; `verify-all.py` must not turn that into a pass.
- Do not change: the gates themselves, `test/fork/*`, `services/keeper/test/soak.test.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `scripts/verify-all.py` — collect `not_run`, print `ALL CHECKED CHECKS PASSED — N GATE(S) NOT RUN`, add `--require-fork`, honour `AVENOR_WITH_FORK=1` — a partial run stops looking green.
- [ ] `docs/DEPLOYMENT.md` — deploy gate uses `--require-fork` — the one place where a partial gate must be fatal.
- [ ] `docs/REPRODUCIBILITY.md` + `docs/WEB_APP.md` — describe the two summary forms and fix the stale test count — the docs previously described the old behaviour.
- [ ] both story files — `status: in-progress` plus a correction section listing what closes them — a `done` story is what a reviewer reads instead of the evidence.

**Acceptance Criteria:**
- Given `python scripts/verify-all.py --no-bytecode -q`, when it finishes, then the last lines are `ALL CHECKED CHECKS PASSED — 2 GATE(S) NOT RUN` and a list, not `ALL CHECKS PASSED`.
- Given `python scripts/verify-all.py --no-bytecode --require-fork`, then exit code is 1.
- Given `python scripts/verify-all.py` with a reachable archive endpoint, then the last line is `ALL CHECKS PASSED`.
- Given `grep -c "status: done"` in either story file, then 0.

## Verification

**Commands:**
- `python scripts/verify-all.py --no-bytecode -q` — expected: partial summary, exit 0
- `python scripts/verify-all.py --no-bytecode --require-fork -q` — expected: `[FAIL]`, exit 1
- `python scripts/verify-all.py -q` — expected: `ALL CHECKS PASSED`

**Manual checks:**
- The two summary forms differ in wording, not only in exit code, so a log reader sees which one happened.