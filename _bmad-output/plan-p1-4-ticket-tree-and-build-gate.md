---
title: 'Make the ticket tree and the build gate say what actually happened'
type: 'chore'
ticket: 'story-execute-limited-launch-with-caps-allowlist-and-on-call'
created: '2026-12-01'
status: 'in-progress'
baseline_revision: '6ae57dadd5e8c5f91784233f7bac7b901ed096de'
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

**Problem:** Three recommendations from the party-mode audit, all instances of the same defect — a document or a gate states more than the repository can prove. `story-execute-limited-launch-with-caps-allowlist-and-on-call-plan.md` still says `Status: done` and ticks `[x] ... terverifikasi on-chain` and `[x] Soak test keeper 7 hari terverifikasi bersih`, while `eth_getCode` returns `0x` on chain `4663` for every address it names and the soak plan next door says the opposite. `tickets.toml` entries carry `status = "done"` that no tool reads, so the file looks like a status source and is not one. And `next build` — the one command that would catch a broken app bundle — is outside `scripts/verify-all.py`, so a green gate says nothing about it.

**Approach:** Demote the 7.3 plan to `in-progress` with a falsification table read from the chain, state in every `tickets.toml` that status lives in frontmatter (and fill the gaps), and put `next build` behind `--with-web-build` in the gate as a gate that is *named when skipped*. Then correct every stale test count and the one evidence block that still prints `ALL CHECKS PASSED` for a partial run.

## Boundaries & Constraints

**Always:** Every number quoted must come from an RPC call with block height + timestamp, or be a local command's output. A gate that did not run must be named, never silently counted as a pass. Corrections go in a dated section, not by deleting the earlier claim — a reviewer must see what was believed and why it changed.

**Never:** No "audited" claim, no mainnet-deploy claim, no touching contracts, tests-under-test, `test/fork/*`, `verify-bytecode.py` numbers, or `packages/core`. No deleting a test to make a gate pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gate, web build skipped | `verify-all.py --no-bytecode` | summary names `web build (next build)` among gates not run | exit 0, partial wording |
| Gate, web build requested | `--with-web-build`, build ok | `[ok] web build` and it drops out of the not-run list | exit 0 |
| Gate, web build requested | `--with-web-build`, build fails | `[FAIL] web build`, forge/tsc output tail printed | exit 1 |
| Gate, web deps missing | `--with-web-build`, no `apps/web/node_modules` | fails loudly with the `npm ci` hint, never skips | exit 1 |
| Ticket row, plan present | 7.3 plan `status: in-progress` | `tickets.py status` reports 7.3 `in-progress` | n/a |

</frozen-after-approval>

## Code Map

- `scripts/verify-all.py` — `main()`: `not_run` list, `--no-bytecode`/`--with-fork`/`--require-fork`, `run()` helper; the web steps sit between `web typecheck` and the fork branch. `run()` already fails with the child's output tail, so the build needs no new error path.
- `apps/web/package.json` — `build: "next build"`; `node node_modules/next/dist/bin/next build` is the Windows-safe invocation (`.cmd` shims cannot be exec'd by `subprocess` without a shell — same reason `tsc` is called by path).
- `_bmad-output/avenor-managed-vaults/epic-security-and-limited-launch/story-execute-limited-launch-with-caps-allowlist-and-on-call-plan.md` — no frontmatter today, so `tickets.py` cannot see its status at all; this is why 7.3 reads `backlog` while the file reads `done`.
- `_bmad-output/avenor-managed-vaults/epic-*/tickets.toml` — five files; `status`/`completed` appear in two of them and `tickets.py` ignores both (`load_breakdown` keeps `id/type/title/after/...`, never `status`).
- Stale counts: `README.md:64` (`65 unit test`), `README.md:66` (`6 test` fork), `docs/REPRODUCIBILITY.md:192` (web build outside gate), `docs/WEB_APP.md:179` (§8.4), `docs/ACCEPTANCE_EVIDENCE.md:146-152` (86 web tests + a `--no-bytecode` log that ends `ALL CHECKS PASSED`), `docs/REMEDIATION.md:165`.
- Verified facts to quote (read `2026-12-01`, `rpc.solidrpc.io/public/evm/4663`): blocks `118337648/652/656` exist with hashes `0xb34cf605…c112b7` / `0xae696e06…b135f4` / `0x84526784…cafc8`, timestamps `1795103668/1795103668/1795103669`; `eth_getTransactionByHash` for the three §3 hashes returns `null`; `eth_getCode` returns `0x` for vault, factory, both timelocks, governance timelock.
- Do not change: `packages/contracts/**`, `apps/web/test/*`, `services/**/test/*`, `scripts/verify-bytecode.py`, `scripts/fork-test.py`.

## Tasks & Acceptance

**Execution:**
- [ ] `scripts/verify-all.py` — add `--with-web-build`, run `next build` in `apps/web`, name it in `not_run` when skipped and fail loudly when `node_modules` is absent — a gate that cannot see the bundle must say so.
- [ ] `docs/REPRODUCIBILITY.md` §7 — describe the third gate and the new flag; keep the measured `next build` wall time — the section currently promises the build is outside the gate.
- [ ] `docs/WEB_APP.md` §8.4 — replace "belum masuk gate" with the flag and the remaining limitation — a stale limitation reads like a missing one.
- [ ] `_bmad-output/.../story-execute-limited-launch-...-plan.md` — add frontmatter (`ticket: 3`, `status: in-progress`), demote the two false `[x]`, add the falsification table — a `done` plan is what a reviewer reads instead of the chain.
- [ ] five `tickets.toml` — a header line saying status lives in leaf/plan frontmatter, and drop the inert `status`/`completed` keys — two status sources, one of them a lie by omission.
- [ ] `README.md`, `docs/ACCEPTANCE_EVIDENCE.md` §4, `docs/REMEDIATION.md` — real counts (101 unit, 11 fork, 90 web, 22 keeper) and the actual partial-summary log — the counts were copied forward, not re-measured.

**Acceptance Criteria:**
- Given `python scripts/verify-all.py --no-bytecode -q`, when it finishes, then the summary lists `web build (next build)` among the gates not run.
- Given `python scripts/verify-all.py --no-bytecode --with-web-build -q`, then `[ok] web build` appears and the summary lists one fewer gate.
- Given `grep -c "Status: done"` in the 7.3 plan, then 0; given `tickets.py status`, then 7.3 reports `in-progress`.
- Given `grep -rn "status = \"done\"" _bmad-output/avenor-managed-vaults/*/tickets.toml`, then no hit remains.
- Given `grep -rn "65 unit test\|6 test melawan\|86 tests pass" README.md docs/`, then no hit remains.

## Implementation Notes

Route `oneshot` despite touching more than five files: the change is bookkeeping over verification surfaces (one flag, one frontmatter block, four count corrections) with no new logic path, and the harness has no subagent capability to hand a `full` route to.

## Verification

**Commands:**
- `python scripts/verify-all.py --no-bytecode -q` — expected: partial summary naming web build + fork + bytecode
- `python scripts/verify-all.py --no-bytecode --with-web-build -q` — expected: `[ok] web build`, one fewer gate named
- `uv run _bmad/method/scripts/tickets.py status _bmad-output/avenor-managed-vaults` — expected: 7.3 `in-progress`, no malformed-tree error
- `forge fmt --check` inside `packages/contracts` — expected: unchanged, no contract touched
