import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("OperatorPage renders institutional operator dashboard and role matrix (Brief §11)", () => {
  const source = readFileSync(new URL("../app/operator/page.tsx", import.meta.url), "utf8");

  // Title and header
  assert.match(source, /Operator Dashboard/);
  assert.match(source, /Institutional Operations (&amp;|&) Timelock/);

  // Key metrics
  assert.match(source, /48 Hours/);
  assert.match(source, /2-of-3 Safe/);
  assert.match(source, /Role Authority Matrix/);

  // Privileged roles
  assert.match(source, /role_manager/);
  assert.match(source, /EMERGENCY_MANAGER/);
  assert.match(source, /REVOKE_STRATEGY_MANAGER/);
  assert.match(source, /REPORTING_MANAGER/);
  assert.match(source, /DEBT_MANAGER/);

  // Guidance
  assert.match(source, /Emergency Action Guidance/);
  assert.match(source, /Orderly Deposit Freezing/);

  // Verified addresses from packages/config/46630.json
  assert.match(source, /0x56d845a35EDe1436B8053f705b4b189c412A8648/);
  assert.match(source, /pending timelock handover/);

  // Rejects fake actors and ancient block from old fork
  assert.doesNotMatch(source, /118337663/);
  assert.doesNotMatch(source, /0x9183\.\.\.2FEA/);
});
