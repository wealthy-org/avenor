---
title: 'Make the acceptance and drill evidence documents say where they were produced'
type: 'chore'
ticket: 'story-publish-acceptance-evidence'
created: '2026-11-29'
status: 'done'
baseline_revision: 'b153c163851738301b10b91f2484d5013097a33b'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `docs/ACCEPTANCE_EVIDENCE.md` and `docs/DRILL_EVIDENCE.md` present themselves as evidence from Robinhood Chain `4663`, but their transactions cannot be found there: `eth_getTransactionByHash` returns `null` on chain `4663` for all three acceptance hashes, `eth_getCode` returns `0x` for the vault, factory, emergency timelock, guardian-run account and the venue address as written, and the drill block heights (`26450185/195/395`) belong to a different chain run than the fork pinned at `118337511`. §1 also prints the wrong timestamp for the pin (`2026-11-19T17:27:29Z`; the chain says `1795103654` = `2026-11-19T15:54:14Z`) and the venue address with a transposed hex pair. A reader who checks any claim finds a contradiction, which is worse than a shorter document.

**Approach:** Keep the documents and the rehearsal they record, but state at the top of each that they are a local anvil rehearsal of chain `4663` state, not chain records; correct the pin timestamp and the venue address; record the canonical headers and the check commands so the claim is falsifiable rather than asserted.

</frozen-after-approval>

## Code Map

- `docs/ACCEPTANCE_EVIDENCE.md` §1–§3 — pin timestamp, venue address, transaction hashes, "MetaMask E2E" claim.
- `docs/DRILL_EVIDENCE.md` §1–§2 — environment line, block heights used for drills.
- `docs/AUDIT_SCOPE.md:56` — venue written as `0xbeef...beef`.
- `docs/REFERENCE_CAPTURE.md` §6 — the capture section; needs 6.1 with canonical headers.
- `packages/contracts/deployments/4663.stage.json` — `chainId: 4663`, `gitRev: "staging-fork-118337511"`, `blockNumber: 26450152`.
- `packages/contracts/deployments/README.md` — what the directory claims.
- Verified facts to quote: canonical headers — `118337511` `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af` ts `1795103654`; `118337663` `0xebf54955940be06117f89f57f750d1d1dd263000ac5e2f797b544486277be7db` ts `1795103669`; `26450185` `0xd407d24921d5a58a28d280b42cc27524f8c2e8e09868acd8e1904ad4b3a816c2` ts `1785728805`.
- Do not change: the numbers under test in `verify-bytecode.py`, the deployed bytecode hashes, `docs/BASELINE.md` (already honest), any contract or test.

## Tasks & Acceptance

**Execution:**
- [ ] `docs/ACCEPTANCE_EVIDENCE.md` — banner + corrected pin timestamp + corrected venue address + a §0 "how to check this yourself" block — removes the contradiction before a reader hits it.
- [ ] `docs/DRILL_EVIDENCE.md` — same banner, naming the chain run its block heights belong to — so the drill results stay usable and stop reading as chain records.
- [ ] `docs/AUDIT_SCOPE.md` — venue address — one wrong hex pair in an audit scope is a scope defect.
- [ ] `docs/REFERENCE_CAPTURE.md` — §6.1 canonical headers + the two `eth_getBlockByNumber`/`eth_getCode` results that show the mismatch — the capture note has no way to be checked today.
- [ ] `packages/contracts/deployments/README.md` + `4663.stage.json` — say the file records a rehearsal run, and add `"recordedOn": "local-anvil-fork"` — the file's `chainId` is the only field a tool reads, so the misunderstanding survives otherwise.

**Acceptance Criteria:**
- Given either evidence document, when its first 15 lines are read, then the reader knows the transactions are not on chain `4663`.
- Given `docs/REFERENCE_CAPTURE.md`, when §6.1 is read, then both the canonical hash and the fork hash at `118337663` are printed with timestamps.
- Given `grep -rn "0xBeEff033b7F3B9B53c2f8c50Ed7E4E7fEf3c09dd" docs/`, then no hit remains.

## Verification

**Commands:**
- `python scripts/verify-all.py` — expected: `ALL CHECKS PASSED`

**Manual checks:**
- The banner names the fork, the anvil clock, and the check command, in the same wording in both files.