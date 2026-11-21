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
  assert.match(html, />538\.856,06 USDG</);
  assert.match(html, /title="538\.856,055994 USDG"/);
  assert.equal((html.match(/USDG/g) ?? []).length, 2);
});

test("Amount for shares never claims to be USDG", () => {
  const html = renderToStaticMarkup(createElement(Amount, { value: 1_000_000_000_000_000_000n, kind: "shares" }));
  assert.match(html, />1,0000</);
  assert.doesNotMatch(html, /USDG/);
});

test("BlockProvenance always names the block, the time in UTC and the source", () => {
  const html = renderToStaticMarkup(
    createElement(BlockProvenance, {
      blockNumber: "118337511",
      blockTimestamp: "2026-11-19T12:00:00.000Z",
      source: "onchain",
    }),
  );
  assert.match(html, /Blok 118337511/);
  assert.match(html, /19 Nov 2026, 12\.00 UTC/);
  assert.match(html, /dibaca langsung dari node pada blok ini/);
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
  const warn = renderToStaticMarkup(createElement(StatusPill, { tone: "warn", text: "deposit ditutup" }));
  assert.match(warn, /aria-hidden="true">! /);
  assert.match(warn, /deposit ditutup/);
  assert.throws(() => renderToStaticMarkup(createElement(StatusPill, { tone: "urgent" as never, text: "x" })), /unknown status tone/);
});

test("ErrorState shows the server message verbatim and never invents a cause", () => {
  const html = renderToStaticMarkup(
    createElement(ErrorState, { code: "no_rpc", message: "rpc not configured" }),
  );
  assert.match(html, /API tidak punya akses node/);
  assert.match(html, /rpc not configured/);
  const unknown = renderToStaticMarkup(createElement(ErrorState, { code: "brand_new_code", message: "boom" }));
  assert.match(unknown, /Kode tidak dikenal: brand_new_code/);
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

test("Percent is rendered through the shared formatter", () => {
  assert.equal(renderToStaticMarkup(createElement(Percent, { bps: 15 })), '<span class="money">0,15%</span>');
});
