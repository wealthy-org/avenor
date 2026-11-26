import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ActivityPage from "../app/activity/page.tsx";

test("ActivityPage renders on-chain ledger events and provenance verification (Brief §11)", () => {
  const html = renderToStaticMarkup(createElement(ActivityPage));

  // Title and header
  assert.match(html, /Vault Activity/);
  assert.match(html, /On-Chain Ledger &amp; Event Stream/);

  // Key activity types
  assert.match(html, /Strategy Harvest &amp; Report/);
  assert.match(html, /Vault Capital Inflow/);
  assert.match(html, /Timelock Role Assignment/);
  assert.match(html, /Liquidity Redemption/);
  assert.match(html, /Accountant Fee Accrual/);

  // Provenance & links
  assert.match(html, /Provenance Verification/);
  assert.match(html, /tx:/);
});
