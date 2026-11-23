import { test } from "node:test";
import assert from "node:assert/strict";
import { blockTime, epochTime, liquiditySplit, money, percentBps, percentOf, shares, shortAddress } from "../src/lib/format.ts";

test("money groups thousands and keeps the decimal point", () => {
  assert.equal(money(538_856_055_994n), "538,856.06");
  assert.equal(money(27_024_457_979n), "27,024.46");
  assert.equal(money(1n), "0.00");
  assert.equal(money(1_000_000n, { full: true }), "1.000000");
});

test("shares are 18 decimals and never printed as money", () => {
  // 18-decimal venue shares keep their own scale.
  assert.equal(shares(1_000_000_000_000_000_000n, 18), "1.00");
  assert.equal(shares(1n, 18), "0.00");
  // The staging vault reports decimals() = 6, so 1,800.000000 shares prints as 1,800, not 0.0000.
  assert.equal(shares(1_800_000_000n, 6), "1,800.00");
  assert.equal(shares(1_800_000_000n, 6, { full: true }), "1,800.000000");
  assert.throws(() => shares(1n, 40), /decimals/);
});

test("a percentage never appears without its denominator", () => {
  assert.equal(percentBps(15), "0.15%");
  assert.equal(percentBps(10_000), "100.00%");
  assert.equal(percentBps(-250), "-2.50%");
  assert.equal(percentOf(15, "total-assets"), "0.15% of total assets");
  assert.throws(() => percentBps(1.5), /basis points must be an integer/);
});

test("block timestamps are shown in UTC, not the laptop's timezone", () => {
  assert.equal(blockTime("2026-11-19T12:00:00.000Z"), "Nov 19, 2026, 12:00 PM");
  assert.throws(() => blockTime("yesterday"), /not an ISO timestamp/);
});

test("a strategy's activation and lastReport are timestamps, not block heights", () => {
  // `strategies(address)` writes both from `block.timestamp`; 118338000 is a plausible block height and a
  // meaningless date, so the value must not be rendered as "block ...".
  assert.equal(epochTime(1_793_380_000n), "Oct 30, 2026, 5:06 PM");
  assert.throws(() => epochTime(0n), /not a unix timestamp/);
  assert.throws(() => epochTime(118_338_000), /not a unix timestamp/);
});

test("liquiditySplit refuses idle greater than totalAssets", () => {
  assert.throws(
    () => liquiditySplit({ idle: 10n, totalAssets: 5n }),
    /idle cash cannot exceed total assets/,
  );
});

test("liquiditySplit names both numbers and never promises an instant withdrawal", () => {
  const split = liquiditySplit({ idle: 27_024_457_979n, totalAssets: 538_856_055_994n });
  assert.equal(split.idle, "27,024.46");
  assert.equal(split.positionValue, "538,856.06");
  assert.match(split.note, /Idle cash 27,024\.46 USDG/);
  assert.match(split.note, /Position value 538,856\.06 USDG/);
  assert.match(split.note, /not on idle cash|once a wallet is connected/);
  assert.doesNotMatch(split.note, /instant|always available now/i);
});

test("shortAddress validates before slicing", () => {
  assert.equal(shortAddress("0xBeEff033F34C046626B8D0A041844C5d1A5409dd"), "0xBeEf…09dd");
  assert.throws(() => shortAddress("0x123"), /is not an address/);
});