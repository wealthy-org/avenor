import { test } from "node:test";
import assert from "node:assert/strict";
import { blockTime, liquiditySplit, money, percentBps, percentOf, shares, shortAddress } from "../src/lib/format.ts";

test("money groups thousands and keeps the decimal comma", () => {
  assert.equal(money(538_856_055_994n), "538.856,06");
  assert.equal(money(27_024_457_979n), "27.024,46");
  assert.equal(money(1n), "0,00");
  assert.equal(money(1_000_000n, { full: true }), "1,000000");
});

test("shares are 18 decimals and never printed as money", () => {
  assert.equal(shares(1_000_000_000_000_000_000n), "1,0000");
  assert.equal(shares(1n), "0,0000");
});

test("a percentage never appears without its denominator", () => {
  assert.equal(percentBps(15), "0,15%");
  assert.equal(percentBps(10_000), "100,00%");
  assert.equal(percentBps(-250), "-2,50%");
  assert.equal(percentOf(15, "total-assets"), "0,15% dari total aset");
  assert.throws(() => percentBps(1.5), /basis points must be an integer/);
});

test("block timestamps are shown in UTC, not the laptop's timezone", () => {
  assert.equal(blockTime("2026-11-19T12:00:00.000Z"), "19 Nov 2026, 12.00");
  assert.throws(() => blockTime("kemarin"), /not an ISO timestamp/);
});

test("liquiditySplit refuses idle greater than totalAssets", () => {
  assert.throws(
    () => liquiditySplit({ idle: 10n, totalAssets: 5n }),
    /idle cash cannot exceed total assets/,
  );
});

test("liquiditySplit names both numbers and never promises an instant withdrawal", () => {
  const split = liquiditySplit({ idle: 27_024_457_979n, totalAssets: 538_856_055_994n });
  assert.equal(split.idle, "27.024,46");
  assert.equal(split.positionValue, "538.856,06");
  assert.match(split.note, /Kas idle 27\.024,46 USDG/);
  assert.match(split.note, /Nilai posisi 538\.856,06 USDG/);
  assert.match(split.note, /bukan pada kas idle|dihitung saat wallet terhubung/);
  assert.doesNotMatch(split.note, /instan|sekarang pasti/);
});

test("shortAddress validates before slicing", () => {
  assert.equal(shortAddress("0xBeEff033F34C046626B8D0A041844C5d1A5409dd"), "0xBeEf…09dd");
  assert.throws(() => shortAddress("0x123"), /is not an address/);
});
