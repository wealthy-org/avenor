import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OperatorPage from "../app/operator/page.tsx";

test("OperatorPage renders institutional operator dashboard and role matrix (Brief §11)", () => {
  const html = renderToStaticMarkup(createElement(OperatorPage));

  // Title and header
  assert.match(html, /Operator Dashboard/);
  assert.match(html, /Institutional Operations &amp; Timelock/);

  // Key metrics
  assert.match(html, /48 Hours/);
  assert.match(html, /2-of-3 Safe/);
  assert.match(html, /Role Authority Matrix/);

  // Privileged roles
  assert.match(html, /role_manager/);
  assert.match(html, /EMERGENCY_MANAGER/);
  assert.match(html, /REVOKE_STRATEGY_MANAGER/);
  assert.match(html, /REPORTING_MANAGER/);

  // Guidance
  assert.match(html, /Emergency Action Guidance/);
  assert.match(html, /Orderly Deposit Freezing/);
});
