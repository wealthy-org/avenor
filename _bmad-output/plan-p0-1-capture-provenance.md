---
title: 'Label the captured snapshot as a rehearsal-fork block, not a chain block'
type: 'bugfix'
ticket: ''
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

**Problem:** `apps/web` prints the committed capture as if it were a canonical chain block. `RECORDED_BLOCK = "118337663"` carries the block hash anvil mined on the local fork (`0x1793d732…`) and anvil's wall clock (`1795496277` = `2026-11-24T04:57:57Z`). The canonical block at that height on chain 4663 is `0xebf54955940be06117f89f57f750d1d1dd263000ac5e2f797b544486277be7db`, timestamp `1795103669` (`2026-11-19T15:54:29Z`). Anyone who calls `eth_getBlockByNumber(118337663)` gets a different hash than the page prints, and `ContractsSection` reads "Robinhood Chain · chain ID 4663 · recorded at block 118337663", which claims a chain record the app does not have. AGENTS.md rule 2 forbids printing a number that cannot be reproduced with its block.

**Approach:** Rename the capture constants to say what they are (`CAPTURE_FORK_BLOCK`, `CAPTURE_FORK_BLOCK_HASH`, `CAPTURE_FORK_TIMESTAMP`), record the canonical header at that height beside them so the mismatch is stated instead of hidden, and change the only two surfaces that print the capture to call it a rehearsal-fork capture.

</frozen-after-approval>

## Code Map

- `apps/web/src/config/staging.ts` — the constants; comment currently claims "Recorded block: `eth_getBlockByNumber` returned this hash and timestamp", true for anvil and false for the chain.
- `apps/web/src/lib/serverData.ts:26-47` — re-exports the constants and derives `SNAPSHOT_BLOCK/…HASH/…TIMESTAMP` and `PIN_*`.
- `apps/web/src/components/ContractsSection.tsx:88` — the chip that says "recorded at block".
- `apps/web/app/transparency/page.tsx:16-17` — prints `PIN_BLOCK` and a note naming a fork hash.
- Reuse: `apps/web/test/components.test.ts` render harness (`renderToStaticMarkup`), `apps/web/test/vaults.test.ts` for config-level assertions.
- Do not change: `vaultRead.ts` decode logic, `forkSnapshot.json` values, the live-read path, `capture-fork-snapshot.mjs`.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/test/components.test.ts` — add assertions that no rendered surface pairs a capture block with "chain ID 4663 · recorded at block", that `CAPTURE_FORK_BLOCK` is exported, and that the canonical header at that height is exported — red first.
- [ ] `apps/web/src/config/staging.ts` — rename the three constants and add `CANONICAL_HEADER_AT_CAPTURE_HEIGHT` — the mismatch becomes a stated fact.
- [ ] `apps/web/src/lib/serverData.ts` — follow the rename in the re-export block and the `SNAPSHOT_*`/`PIN_*` derivations.
- [ ] `apps/web/src/components/ContractsSection.tsx` — chip says "chain ID 4663 · rehearsal fork · captured at fork block 118337663"; add one sentence naming the canonical header at that height.
- [ ] `apps/web/app/transparency/page.tsx` — note names the canonical header too, so the row cannot be read as a chain record.

**Acceptance Criteria:**
- Given the rendered `ContractsSection`, when searched, then the string "recorded at block" no longer appears and "rehearsal fork" does.
- Given `apps/web/src/config/staging.ts`, when imported, then `CAPTURE_FORK_BLOCK_HASH` starts `0x1793d732` and `CANONICAL_HEADER_AT_CAPTURE_HEIGHT.hash` starts `0xebf5495`.
- Given `npx tsc --noEmit -p tsconfig.json` and `npm test`, then both pass with the new assertions.

## Verification

**Commands:**
- `cd apps/web && npx tsc --noEmit -p tsconfig.json` — expected: no output
- `cd apps/web && npm test` — expected: all pass, including the two new tests
- `python scripts/verify-all.py` — expected: `ALL CHECKS PASSED`

## Implementation Notes

Route is oneshot: about 40 changed lines across five files, all mechanical renames plus two strings.