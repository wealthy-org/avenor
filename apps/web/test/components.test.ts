import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AddressText,
  Amount,
  BlockProvenance,
  ErrorState,
  Percent,
  StatusPill,
} from "../src/components/primitives.ts";

test("Amount prints money with its unit and keeps exact value on hover", () => {
  const html = renderToStaticMarkup(
    createElement(Amount, { value: 538_856_055_994n, kind: "usdg" }),
  );
  assert.match(html, />538,856\.06 USDG</);
  assert.match(html, /title="538,856\.055994 USDG"/);
  assert.equal((html.match(/USDG/g) ?? []).length, 2);
});

test("Amount for shares never claims to be USDG", () => {
  const html = renderToStaticMarkup(
    createElement(Amount, { value: 1_000_000_000_000_000_000n, kind: "shares", decimals: 18 }),
  );
  assert.match(html, />1\.00</);
  assert.doesNotMatch(html, /USDG/);
});

test("Amount for shares uses the decimals it is given, and refuses to guess", () => {
  // The staging vault reports decimals() = 6; rendering its supply as 18-decimal would print 0.0000.
  const html = renderToStaticMarkup(createElement(Amount, { value: 1_800_000_000n, kind: "shares", decimals: 6 }));
  assert.match(html, />1,800\.00</);
  assert.throws(() => renderToStaticMarkup(createElement(Amount, { value: 1n, kind: "shares" })), /share decimals/);
});

test("BlockProvenance always names the block, the time in UTC and the source", () => {
  const html = renderToStaticMarkup(
    createElement(BlockProvenance, {
      blockNumber: "118337511",
      blockTimestamp: "2026-11-19T12:00:00.000Z",
      source: "onchain",
    }),
  );
  assert.match(html, /Block 118337511/);
  assert.match(html, /Nov 19, 2026, 12:00 PM UTC/);
  assert.match(html, /read directly from the node at this block/);
});

test("BlockProvenance rejects a non-decimal block number and an unknown source", () => {
  assert.throws(
    () =>
      renderToStaticMarkup(
        createElement(BlockProvenance, { blockNumber: "latest", blockTimestamp: "2026-11-19T12:00:00.000Z", source: "onchain" }),
      ),
    /is not a decimal string/,
  );
  assert.throws(
    () =>
      renderToStaticMarkup(
        createElement(BlockProvenance, {
          blockNumber: "1",
          blockTimestamp: "2026-11-19T12:00:00.000Z",
          source: "cache" as never,
        }),
      ),
    /unknown source/,
  );
});

test("StatusPill carries meaning without colour", () => {
  const warn = renderToStaticMarkup(createElement(StatusPill, { tone: "warn", text: "deposits closed" }));
  assert.match(warn, /aria-hidden="true">! /);
  assert.match(warn, /deposits closed/);
  assert.throws(() => renderToStaticMarkup(createElement(StatusPill, { tone: "urgent" as never, text: "x" })), /unknown status tone/);
});

test("ErrorState shows the server message verbatim and never invents a cause", () => {
  const html = renderToStaticMarkup(
    createElement(ErrorState, { code: "no_rpc", message: "rpc not configured" }),
  );
  assert.match(html, /The API has no node access/);
  assert.match(html, /rpc not configured/);
  const unknown = renderToStaticMarkup(createElement(ErrorState, { code: "brand_new_code", message: "boom" }));
  assert.match(unknown, /Unrecognised code: brand_new_code/);
  assert.doesNotMatch(unknown, /audited/i);
});

test("AddressText does not invent an explorer URL", () => {
  const plain = renderToStaticMarkup(createElement(AddressText, { address: "0xBeEff033F34C046626B8D0A041844C5d1A5409dd" }));
  assert.match(plain, /0xBeEf…09dd/);
  assert.doesNotMatch(plain, /href/);
  const linked = renderToStaticMarkup(
    createElement(AddressText, { address: "0xBeEff033F34C046626B8D0A041844C5d1A5409dd", href: "https://example.org/a" }),
  );
  assert.match(linked, /href="https:\/\/example\.org\/a"/);
});
// .tsx cannot be imported by the node test runner (no JSX transform), so this one reads the source. It
// checks the copy, which is the thing that was wrong: the table printed a fork block as a chain record.
test("the capture is described as a rehearsal-fork block, never as a chain record", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/components/ContractsSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /recorded at block/i);
  assert.doesNotMatch(source, /Robinhood Chain · chain ID 4663/);
  assert.match(source, /rehearsal fork/i);
  assert.match(source, /CAPTURE_FORK_BLOCK/);
  // The canonical block at the capture's height has a different hash; the table prints it so a reader
  // who calls eth_getBlockByNumber can reconcile the two instead of finding a contradiction.
  assert.match(source, /CANONICAL_HEADER_AT_CAPTURE_HEIGHT\.hash/);
});

test("the capture constants name their own origin, and the canonical header beside them", async () => {
  const staging = await import("../src/config/staging.ts");
  assert.equal(staging.CAPTURE_FORK_BLOCK, "118337663");
  assert.match(staging.CAPTURE_FORK_BLOCK_HASH, /^0x1793d732/);
  assert.equal(staging.CAPTURE_FORK_TIMESTAMP, "2026-11-24T04:57:57.000Z");
  assert.match(staging.CANONICAL_HEADER_AT_CAPTURE_HEIGHT.hash, /^0xebf54955940be061/);
  assert.equal(staging.CANONICAL_HEADER_AT_CAPTURE_HEIGHT.timestamp, "2026-11-19T15:54:29.000Z");
  assert.match(staging.CANONICAL_HEADER_AT_CAPTURE_HEIGHT.note, /anvil|fork/i);
});

test("VaultMandates contains all 6 mandates required by Brief §5 with roadmap status for un-deployed", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/components/VaultMandates.tsx", import.meta.url), "utf8");
  assert.match(source, /USDG Managed Yield/);
  assert.match(source, /Treasury Reserve/);
  assert.match(source, /ETH Basis Yield/);
  assert.match(source, /Cross-Venue Relative Value/);
  assert.match(source, /Macro \/ Rate Divergence/);
  assert.match(source, /Custom Mandates/);
});
