// Withdraw tests. The point is not "a transaction is sent": it is that the loss budget is always
// explicit, that a paused vault refuses before signing, and that the numbers shown after signing
// come from the receipt's Withdraw event rather than from the quote.

import assert from "node:assert/strict";
import test from "node:test";
import {
  WithdrawError,
  idleCoverageBps,
  maxLossAssets,
  parseLossBps,
  parseShareInput,
  quoteWithdraw,
  readWithdrawEvent,
  submitWithdraw,
  withdrawBlockers,
  withdrawWarnings,
} from "../src/lib/withdraw.ts";
import { ASSET, USER, VAULT, createFakeChain, scriptedSigner, withdrawLog, type Handler } from "./fakeChain.ts";

const SHARES = 100_000_000_000_000_000_000n; // 100 shares at 18 decimals
const ASSETS = 100_000_000n; // 100 USDG at 6 decimals

function handlers(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    previewWithdraw: () => SHARES,
    previewRedeem: () => ASSETS,
    maxWithdraw: () => ASSETS,
    maxRedeem: () => SHARES,
    balanceOf: () => SHARES * 2n,
    totalIdle: () => 27_024_457_979n,
    convertToAssets: () => 200_539_800n,
    withdraw: () => SHARES,
    redeem: () => ASSETS,
    ...overrides,
  };
}

test("share input is exact at 18 decimals and refuses noise", () => {
  assert.equal(parseShareInput("1"), 1_000_000_000_000_000_000n);
  assert.equal(parseShareInput("0.000000000000000001"), 1n);
  assert.equal(parseShareInput("12.5"), 12_500_000_000_000_000_000n);
  for (const bad of ["", "1,5", "1 000", "-1", "1e18", ".", "1.0000000000000000001", "01", "x"]) {
    assert.throws(() => parseShareInput(bad), WithdrawError, `should reject ${JSON.stringify(bad)}`);
  }
  assert.throws(() => parseShareInput("0"), /lebih besar dari nol/);
});

test("loss budget is refused when it is not a real bound", () => {
  assert.equal(parseLossBps("0"), 0);
  assert.equal(parseLossBps("50"), 50);
  assert.equal(parseLossBps(9_999), 9_999);
  assert.throws(() => parseLossBps("10000"), /seluruh nilai/);
  assert.throws(() => parseLossBps(10_000), /seluruh nilai/);
  assert.throws(() => parseLossBps("-1"), WithdrawError);
  assert.throws(() => parseLossBps("1.5"), WithdrawError);
  assert.throws(() => parseLossBps(""), /belum diisi/);
});

test("pause blocks withdrawal, and says so in the protocol's own terms", () => {
  const base = {
    mode: "assets" as const,
    requested: ASSETS,
    assets: ASSETS,
    shares: SHARES,
    maxAssets: ASSETS,
    maxShares: SHARES,
    shareBalance: SHARES,
    isPaused: false,
    maxLossBps: 0,
  };
  assert.deepEqual(withdrawBlockers(base), []);
  const paused = withdrawBlockers({ ...base, isPaused: true });
  assert.deepEqual(paused.map((entry) => entry.code), ["paused"]);
  assert.match(paused[0].message, /assert not self\.paused/);
});

test("too much loss tolerance is a blocker, not a coerced value", () => {
  const blockers = withdrawBlockers({
    mode: "shares",
    requested: SHARES,
    assets: ASSETS,
    shares: SHARES,
    maxAssets: ASSETS,
    maxShares: SHARES,
    shareBalance: SHARES,
    isPaused: false,
    maxLossBps: 10_000,
  });
  assert.deepEqual(blockers.map((entry) => entry.code), ["invalid_loss_limit"]);
});

test("asking above maxWithdraw and maxRedeem is refused before signing", () => {
  const base = {
    mode: "assets" as const,
    requested: ASSETS + 1n,
    assets: ASSETS,
    shares: SHARES,
    maxAssets: ASSETS,
    maxShares: SHARES,
    shareBalance: SHARES * 10n,
    isPaused: false,
    maxLossBps: 0,
  };
  assert.deepEqual(withdrawBlockers(base).map((entry) => entry.code), ["exceeds_max"]);
  assert.deepEqual(
    withdrawBlockers({ ...base, mode: "shares", requested: SHARES + 1n }).map((entry) => entry.code),
    ["exceeds_max"],
  );
});

test("a zero maxWithdraw and maxRedeem is its own reason", () => {
  const blockers = withdrawBlockers({
    mode: "assets",
    requested: ASSETS,
    assets: ASSETS,
    shares: SHARES,
    maxAssets: 0n,
    maxShares: 0n,
    shareBalance: SHARES,
    isPaused: false,
    maxLossBps: 0,
  });
  assert.deepEqual(blockers.map((entry) => entry.code).sort(), ["exceeds_max", "nothing_to_withdraw"]);
});

test("the quote reads one block in assets mode and keeps the loss budget", async () => {
  const { client, chain } = createFakeChain(handlers());
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 50 });
  assert.equal(quote.blockNumber, 0x70dafe7n);
  assert.equal(quote.assets, ASSETS);
  assert.equal(quote.shares, SHARES);
  assert.equal(quote.maxLossBps, 50);
  assert.equal(quote.totalIdle, 27_024_457_979n);
  // 200 shares at pps 1.002699 is a position value, which is not the same number as maxWithdraw.
  assert.equal(quote.positionAssets, 200_539_800n);
  assert.equal(chain.calls.length, 6, "preview + the other mode's ceiling + balance + idle + position value");
  assert.equal(chain.calls.every((entry) => entry.startsWith(VAULT.toLowerCase())), true);
});

test("shares mode quotes assets from previewRedeem", async () => {
  const { client } = createFakeChain(handlers());
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "shares", amount: SHARES, maxLossBps: 0 });
  assert.equal(quote.mode, "shares");
  assert.equal(quote.requested, SHARES);
  assert.equal(quote.assets, ASSETS);
});

test("a failed read is an rpc error, never a zero quote", async () => {
  const { client, chain } = createFakeChain(handlers());
  chain.revert.add("maxRedeem");
  await assert.rejects(
    quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 0 }),
    (error: unknown) => error instanceof WithdrawError && error.code === "rpc",
  );
});

test("idle coverage and the loss budget are shown as numbers, not adjectives", async () => {
  const { client } = createFakeChain(handlers());
  const small = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: 10_000_000n, maxLossBps: 0 });
  assert.equal(idleCoverageBps(small), 10_000, "idle covers the whole request");
  const large = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: 54_048_915_958n, maxLossBps: 100 });
  assert.equal(idleCoverageBps(large), 5_000, "idle covers half; the rest needs a strategy");
  assert.equal(maxLossAssets(large), 540_489_159n, "1% of the requested assets");
});

test("withdraw sends the loss budget explicitly and reads the event", async () => {
  const { client, chain } = createFakeChain(handlers());
  chain.logs = [withdrawLog(USER, USER, ASSETS - 1n, SHARES)];
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 12 });
  const receipt = await submitWithdraw({
    client,
    signer: scriptedSigner(chain),
    vault: VAULT,
    mode: "assets",
    amount: ASSETS,
    receiver: USER,
    quote,
    isPaused: false,
  });
  assert.equal(chain.sent.length, 1);
  assert.equal(receipt.assets, ASSETS - 1n, "the event is the source, not the quote");
  assert.equal(receipt.shares, SHARES);
  assert.equal(receipt.maxLossBps, 12);

  const sent = chain.sent[0] as { args: readonly unknown[] };
  assert.equal(sent.args[3], 12n, "max_loss is passed as the fourth argument, not defaulted");
});

test("redeem passes max_loss too", async () => {
  const { client, chain } = createFakeChain(handlers());
  chain.logs = [withdrawLog(USER, USER, ASSETS, SHARES)];
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "shares", amount: SHARES, maxLossBps: 0 });
  await submitWithdraw({
    client,
    signer: scriptedSigner(chain),
    vault: VAULT,
    mode: "shares",
    amount: SHARES,
    receiver: USER,
    quote,
    isPaused: false,
  });
  const sent = chain.sent[0] as { args: readonly unknown[] };
  assert.equal(sent.args[3], 0n, "max_loss 0 is sent explicitly");
});

test("a paused vault never reaches the signer", async () => {
  const { client, chain } = createFakeChain(handlers());
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 0 });
  await assert.rejects(
    submitWithdraw({
      client,
      signer: scriptedSigner(chain),
      vault: VAULT,
      mode: "assets",
      amount: ASSETS,
      receiver: USER,
      quote,
      isPaused: true,
    }),
    (error: unknown) => error instanceof WithdrawError && error.code === "paused",
  );
  assert.equal(chain.sent.length, 0);
});

test("a receipt without the Withdraw event is an error, not zero assets", async () => {
  const { client, chain } = createFakeChain(handlers());
  chain.logs = [];
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 0 });
  await assert.rejects(
    submitWithdraw({
      client,
      signer: scriptedSigner(chain),
      vault: VAULT,
      mode: "assets",
      amount: ASSETS,
      receiver: USER,
      quote,
      isPaused: false,
    }),
    (error: unknown) => error instanceof WithdrawError && error.code === "no_event",
  );
});

test("event decoding ignores a Withdraw-shaped log from another contract", () => {
  const foreign = { ...withdrawLog(USER, USER, 1n, 2n), address: ASSET };
  const ours = withdrawLog(USER, USER, ASSETS, SHARES);
  assert.equal(readWithdrawEvent([foreign, ours], VAULT)?.assets, ASSETS);
  assert.equal(readWithdrawEvent([foreign], VAULT), null);
});

test("a rejected signature is a rejection, not a reverted transaction", async () => {
  const { client, chain } = createFakeChain(handlers());
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 0 });
  await assert.rejects(
    submitWithdraw({
      client,
      signer: scriptedSigner(chain, { reject: true }),
      vault: VAULT,
      mode: "assets",
      amount: ASSETS,
      receiver: USER,
      quote,
      isPaused: false,
    }),
    (error: unknown) => (error as { code?: number }).code === 4001,
  );
});
test("warnings name the case they come from (W3, W6, W7, idle)", async () => {
  const { client } = createFakeChain(handlers({ maxWithdraw: () => ASSETS / 2n }));
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 0 });
  const cases = withdrawWarnings(quote, { isPaused: false, isShutdown: false }).map((entry) => entry.case);
  assert.deepEqual(cases, ["W3"], "position value above maxWithdraw");
  const illiquid = { ...quote, assets: quote.totalIdle + 1n, positionAssets: quote.maxAssets };
  assert.deepEqual(
    withdrawWarnings(illiquid, { isPaused: false, isShutdown: false }).map((entry) => entry.case),
    ["idle"],
  );

  const paused = withdrawWarnings(quote, { isPaused: true, isShutdown: true }).map((entry) => entry.case);
  assert.deepEqual(paused, ["W6", "W7", "W3"]);
  assert.match(withdrawWarnings(quote, { isPaused: true, isShutdown: false })[0].message, /assert not self\.paused/);
});

test("a full-loss budget is warned about, never silently sent", async () => {
  const { client } = createFakeChain(handlers());
  const quote = await quoteWithdraw(client, { vault: VAULT, account: USER, mode: "assets", amount: ASSETS, maxLossBps: 0 });
  const warnings = withdrawWarnings({ ...quote, maxLossBps: 10_000 }, { isPaused: false, isShutdown: false });
  assert.deepEqual(warnings.map((entry) => entry.case), ["W3", "W4"]);
});
