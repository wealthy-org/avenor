import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DocsPage from "../app/docs/page.tsx";

test("DocsPage renders static documentation with all required operational sections (W-7, D-22)", () => {
  const html = renderToStaticMarkup(createElement(DocsPage));

  // Page title and header
  assert.match(html, /Avenor Vault Docs/);
  assert.match(html, /Operational reference/);

  // Key sections
  assert.match(html, /id="architecture"/);
  assert.match(html, /Architecture/);
  assert.match(html, /id="fees"/);
  assert.match(html, /Fee Configuration/);
  assert.match(html, /id="roles"/);
  assert.match(html, /Role Permission Matrix/);
  assert.match(html, /id="limitations"/);
  assert.match(html, /Known Limitations/);
  assert.match(html, /id="operations"/);
  assert.match(html, /Operational References/);

  // Key architectural & operational mentions
  assert.match(html, /TimelockController/);
  assert.match(html, /SteakUSDG/);
  assert.match(html, /SIGNER_POLICY\.md/);
  assert.match(html, /BACKUP_RECOVERY\.md/);
  assert.match(html, /KNOWN_LIMITATIONS\.md/);
  assert.match(html, /verify-all\.py/);
});
