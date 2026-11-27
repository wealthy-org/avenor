import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("ActivityPage renders verified on-chain ledger events and rejects synthetic data (Brief §11, AGENTS.md Rule 2)", () => {
  const source = readFileSync(new URL("../app/activity/page.tsx", import.meta.url), "utf8");

  // Title and header
  assert.match(source, /Vault Activity/);
  assert.match(source, /On-Chain Ledger (&amp;|&) Event Stream/);

  // Verified on-chain events
  assert.match(source, /Timelock Role Assignment Scheduled/);
  assert.match(source, /Strategy Management Transferred/);
  assert.match(source, /Strategy Adapter Deployment/);
  assert.match(source, /Accountant Deployment & Fee Wiring/);
  assert.match(source, /Allocator Vault Deployment/);

  // Honest empty state for user transactions in Research Staging
  assert.match(source, /Capital Inflows, Redemptions (&amp;|&) Harvests/);
  assert.match(source, /No user capital deposits, liquidity redemptions, or yield harvest reports/);
  assert.match(source, /totalAssets: 0 USDG/);

  // Provenance & links
  assert.match(source, /Provenance Verification/);
  assert.match(source, /tx:/);

  // Strict Honesty Check: MUST NOT contain synthetic amounts or unverified placeholder actors
  assert.doesNotMatch(source, /50,000\.00 USDG/);
  assert.doesNotMatch(source, /15,000\.00 USDG/);
  assert.doesNotMatch(source, /\+2,450\.00 USDG/);
  assert.doesNotMatch(source, /0x3841/);
});
