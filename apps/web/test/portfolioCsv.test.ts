import assert from "node:assert/strict";
import test from "node:test";
import { portfolioCsv } from "../src/lib/portfolioCsv.ts";

const ROW = {
  vault: "0xbeef00000000000000000000000000000000beef",
  account: "0xaaaa00000000000000000000000000000000aaaa",
  shares: "531418644510854399888342585",
  positionAssets: "538856055994280",
  maxAssets: "27024457979514",
  totalIdle: "27024457979514",
  blockNumber: "118337511",
  error: null,
};

test("csv keeps base units and the block that produced them", () => {
  const csv = portfolioCsv([ROW]);
  const [header, line] = csv.trimEnd().split("\n");
  assert.match(header!, /vault,account,shares/);
  assert.match(line!, /531418644510854399888342585,538856055994280,27024457979514/);
  assert.match(line!, /118337511,$/);
});

test("a failed row keeps its error instead of a zero balance", () => {
  const csv = portfolioCsv([
    { ...ROW, positionAssets: null, maxAssets: null, totalIdle: null, error: "no_position: akun belum punya share" },
  ]);
  const line = csv.trimEnd().split("\n")[1]!;
  assert.match(line!, /,,,118337511,no_position/);
  assert.doesNotMatch(line!, /,0,/);
});

test("commas and quotes in an error are escaped, not left to break the file", () => {
  const csv = portfolioCsv([{ ...ROW, error: 'rpc: "timeout", retry' }]);
  assert.match(csv, /"rpc: ""timeout"", retry"/);
});