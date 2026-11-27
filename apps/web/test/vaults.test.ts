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

test("mandate is the operator's words and is kept only when non-empty", () => {
  const [withMandate] = parseVaultList(
    JSON.stringify([{ address: "0x1111111111111111111111111111111111111111", label: "A", mandate: " USDG, capped at 500k " }]),
  );
  assert.equal(withMandate!.mandate, "USDG, capped at 500k");
  const [without] = parseVaultList(JSON.stringify([{ address: "0x1111111111111111111111111111111111111111", label: "A" }]));
  assert.equal(without!.mandate, undefined);
  assert.throws(
    () => parseVaultList(JSON.stringify([{ address: "0x1111111111111111111111111111111111111111", label: "A", mandate: "  " }])),
    /mandate must be a non-empty string/,
  );
});

test("vault detail source does not contain hardcoded staging fallback address 0x5aebce", async () => {
  const { readFileSync } = await import("node:fs");
  const pageSource = readFileSync(new URL("../app/vaults/[address]/page.tsx", import.meta.url), "utf8");
  const depositSource = readFileSync(new URL("../app/vaults/[address]/deposit/page.tsx", import.meta.url), "utf8");
  const withdrawSource = readFileSync(new URL("../app/vaults/[address]/withdraw/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /0x5aebce3956fed4542edbe75d420497378e3b18ca/i);
  assert.doesNotMatch(depositSource, /0x5aebce3956fed4542edbe75d420497378e3b18ca/i);
  assert.doesNotMatch(withdrawSource, /0x5aebce3956fed4542edbe75d420497378e3b18ca/i);
});

test("vault detail hides deposit button when phase is research", async () => {
  const { readFileSync } = await import("node:fs");
  const pageSource = readFileSync(new URL("../app/vaults/[address]/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /config\.phase === "research"/);
  assert.match(pageSource, /Research Phase · Deposits Closed/);
});

test("deposit page forbids deposits for research phase and prevents vault address asset fallback", async () => {
  const { readFileSync } = await import("node:fs");
  const depositSource = readFileSync(new URL("../app/vaults/[address]/deposit/page.tsx", import.meta.url), "utf8");
  assert.match(depositSource, /config\.phase === "research"/);
  assert.match(depositSource, /Not Open for Public Deposits/);
  assert.doesNotMatch(depositSource, /detail\.vault === null \? config\.address : detail\.vault\.assetAddress/);
});

test("landing hero does not claim institutional-grade or mainnet sync or APY benchmarks", async () => {
  const { readFileSync } = await import("node:fs");
  const heroSource = readFileSync(new URL("../src/components/PrismHero.tsx", import.meta.url), "utf8");
  const homeSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(heroSource, /institutional-grade/i);
  assert.doesNotMatch(homeSource, /synced on-chain from Robinhood Chain mainnet/i);
  assert.doesNotMatch(homeSource, /APY benchmarks reflect live venue queries/i);
});

test("dedicated /app page renders configured vaults catalogue and open vault actions", async () => {
  const { readFileSync } = await import("node:fs");
  const appSource = readFileSync(new URL("../app/app/page.tsx", import.meta.url), "utf8");
  assert.match(appSource, /USDG Allocator Vaults/);
  assert.match(appSource, /Configured Vaults/);
  assert.match(appSource, /Open Vault/);
  assert.match(appSource, /Every figure on this page is read from the node/);
});
