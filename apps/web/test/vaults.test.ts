import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, parseVaultList } from "../src/config/vaults.ts";

const ADDRESS = "0xbeef00000000000000000000000000000000beef";

test("no configuration means no vault, not a demo vault", () => {
  assert.deepEqual(parseVaultList(undefined), []);
  assert.deepEqual(parseVaultList(""), []);
});

test("unreadable configuration is an error, not an empty catalog", () => {
  assert.throws(() => parseVaultList("{"), /must be JSON/);
  assert.throws(() => parseVaultList("{}"), /must be a JSON array/);
});

test("a vault needs a valid address and a label", () => {
  assert.throws(() => parseVaultList(`[{"label":"x"}]`), /address must be a 20-byte hex address/);
  assert.throws(() => parseVaultList(`[{"address":"${ADDRESS}"}]`), /label is required/);
  assert.throws(() => parseVaultList(`[{"address":"${ADDRESS}","label":"x","phase":"live"}]`), /phase must be/);
});

test("duplicate addresses are rejected case-insensitively", () => {
  const raw = JSON.stringify([
    { address: ADDRESS, label: "a" },
    { address: ADDRESS.toUpperCase().replace("0X", "0x"), label: "b" },
  ]);
  assert.throws(() => parseVaultList(raw), /duplicates/);
});

test("default phase is research, never a launch claim", () => {
  const [vault] = parseVaultList(`[{"address":"${ADDRESS}","label":"Vault USDG"}]`);
  assert.equal(vault!.phase, "research");
});

test("an unset API URL is an error where it is used, not an empty string in a fetch", () => {
  assert.throws(() => apiUrl("/health"), /AVENOR_API_URL is not set/);
});
