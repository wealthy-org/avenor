import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("DocsPage renders static documentation with all required operational sections (W-7, D-22)", () => {
  const source = readFileSync(new URL("../app/docs/page.tsx", import.meta.url), "utf8");

  // Page title and header
  assert.match(source, /Avenor Vault Docs/);
  assert.match(source, /Operational reference/);

  // Key sections
  assert.match(source, /id: "architecture"/);
  assert.match(source, /Architecture/);
  assert.match(source, /id: "fees"/);
  assert.match(source, /Fee Configuration/);
  assert.match(source, /id: "roles"/);
  assert.match(source, /Role Permission Matrix/);
  assert.match(source, /id: "limitations"/);
  assert.match(source, /Known Limitations/);
  assert.match(source, /id: "operations"/);
  assert.match(source, /Operational References/);

  // Key architectural & operational mentions
  assert.match(source, /TimelockController/);
  assert.match(source, /SteakUSDG/);
  assert.match(source, /SIGNER_POLICY\.md/);
  assert.match(source, /BACKUP_RECOVERY\.md/);
  assert.match(source, /KNOWN_LIMITATIONS\.md/);
  assert.match(source, /verify-all\.py/);
});
