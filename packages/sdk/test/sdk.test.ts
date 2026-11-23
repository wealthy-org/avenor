// Ticket 4.4 acceptance: previews, positions, 6-decimal formatting and simulation.
//
// The node is scripted, but every value crosses viem's real ABI encoder and decoder, so a wrong
// type in the generated ABI or in a preview call fails here instead of in the app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";
import {
  bpsOf,
  formatShares,
  formatUsdg,
  InvalidAmountError,
  InvalidMaxLossError,
  MissingMaxLossError,
  parseUsdg,
  parseUnits,
  prepareDeposit,
  prepareRedeem,
  prepareWithdraw,
  previewDeposit,
  previewRedeem,
  previewWithdraw,
  readLiquidity,
  readPosition,
  readVaultState,
  requireMaxLoss,
} from "../src/index.ts";
import { createFakeNode, type Handler } from "./fakeNode.ts";

const VAULT = getAddress("0xbeef00000000000000000000000000000000beef");
const ALICE = getAddress("0xaaaa00000000000000000000000000000000aaaa");
const BOB = getAddress("0xbbbb00000000000000000000000000000000bbbb");
const ASSET = getAddress("0x5fc5360d0400a0fd4f2af552add042d716f1d168");

const TOTAL_ASSETS = 538_856_055_994n;
const TOTAL_IDLE = 27_024_457_979n;
const TOTAL_SUPPLY = 531_418_644_510_854_399_888_342_585n;
const PRICE_PER_SHARE = 1_002_699n;

function stateHandlers(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    asset: () => ASSET,
    totalAssets: () => TOTAL_ASSETS,
    totalIdle: () => TOTAL_IDLE,
    totalDebt: () => TOTAL_ASSETS - TOTAL_IDLE,
    totalSupply: () => TOTAL_SUPPLY,
    unlockedShares: () => 0n,
    pricePerShare: () => PRICE_PER_SHARE,
    deposit_limit: () => 2n ** 256n - 1n,
    minimum_total_idle: () => 1_000_000_000n,
    isPaused: () => false,
    isShutdown: () => false,
    auto_allocate: () => false,
    balanceOf: () => 1_000_000_000_000_000_000n,
    convertToAssets: ([shares]) => (BigInt(shares as bigint) * PRICE_PER_SHARE) / 10n ** 18n,
    maxDeposit: () => 2n ** 256n - 1n,
    maxWithdraw: () => 0n,
    maxRedeem: () => 0n,
    previewDeposit: ([assets]) => (BigInt(assets as bigint) * 10n ** 18n) / PRICE_PER_SHARE,
    previewWithdraw: ([assets]) => (BigInt(assets as bigint) * 10n ** 18n) / PRICE_PER_SHARE,
    previewRedeem: ([shares]) => (BigInt(shares as bigint) * PRICE_PER_SHARE) / 10n ** 18n,
    deposit: ([assets]) => (BigInt(assets as bigint) * 10n ** 18n) / PRICE_PER_SHARE,
    withdraw: ([assets]) => (BigInt(assets as bigint) * 10n ** 18n) / PRICE_PER_SHARE,
    redeem: ([shares]) => (BigInt(shares as bigint) * PRICE_PER_SHARE) / 10n ** 18n,
    approve: () => true,
    ...overrides,
  };
}

test("amounts round-trip exactly at 6 decimals", () => {
  assert.equal(parseUsdg("538856.055994"), 538_856_055_994n);
  assert.equal(formatUsdg(538_856_055_994n), "538856.055994");
  assert.equal(parseUsdg("0.000001"), 1n);
  assert.equal(formatUsdg(1n), "0.000001");
  assert.equal(parseUsdg("27"), 27_000_000n);
  assert.equal(formatUsdg(27_000_000n), "27");
  assert.equal(formatUsdg(27_000_000n, { minFractionDigits: 2 }), "27.00");
  assert.equal(formatUsdg(1_234_500_000n, { full: true }), "1234.500000");
});

test("parsing rejects values that would silently round", () => {
  for (const bad of ["1.0000001", "-1", "1,5", "1e6", "", ".", " ", "0x10", "1.2.3"]) {
    assert.throws(() => parseUsdg(bad), InvalidAmountError, `"${bad}" must be refused`);
  }
  assert.throws(() => parseUnits("1", -1), InvalidAmountError);
});

test("shares print at the decimals they are given, and never at an assumed 18", () => {
  // `formatShares` takes decimals explicitly: a 6-decimal vault read as 18 scales by 10^12.
  assert.equal(formatShares(1_000_000_000_000_000_000n, 18), "1");
  assert.equal(formatShares(1n, 18), "0.000000000000000001");
  assert.equal(formatShares(1_500_000_000_000_000_000n, 18), "1.5");
  assert.equal(formatShares(1_800_000_000n, 6), "1800");
  assert.throws(() => formatShares(1n, undefined as unknown as number), InvalidAmountError);
  assert.equal(bpsOf(1_000_000n, 1), 100n);
  assert.throws(() => bpsOf(1n, 10_001), InvalidAmountError);
});

test("readVaultState pins every number to one block and one timestamp", async () => {
  const node = createFakeNode(stateHandlers());
  const state = await readVaultState(node.client, VAULT);

  assert.equal(state.blockNumber, 118_337_511n);
  assert.equal(state.blockTimestamp.toISOString(), new Date(1_795_103_654_000).toISOString());
  assert.equal(state.source, "onchain");
  assert.equal(state.asset, ASSET);
  assert.equal(state.totalAssets, TOTAL_ASSETS);
  assert.equal(state.totalIdle, TOTAL_IDLE);
  assert.equal(state.totalDebt, TOTAL_ASSETS - TOTAL_IDLE);
  assert.equal(state.totalSupply, TOTAL_SUPPLY);
  assert.equal(state.pricePerShare, PRICE_PER_SHARE);
  assert.equal(state.isPaused, false);
  assert.equal(state.isShutdown, false);
  assert.equal(await state.maxDepositFor(ALICE), 2n ** 256n - 1n);
  assert.ok(node.calls.includes(`maxDeposit(${ALICE})`), "maxDepositFor reads at the same block");
});

test("liquidity keeps idle cash and the vault's maxWithdraw as two separate numbers", async () => {
  const node = createFakeNode(stateHandlers());
  const liquidity = await readLiquidity(node.client, VAULT, ALICE);

  assert.equal(liquidity.totalIdle, TOTAL_IDLE);
  assert.equal(liquidity.maxWithdraw, 0n, "the venue answers 0 at the pin; that is not 'no cash'");
  assert.equal(liquidity.maxRedeem, 0n);
  assert.ok(liquidity.totalIdle > 0n);
});

test("readPosition reports value, not withdrawability", async () => {
  const node = createFakeNode(stateHandlers());
  const position = await readPosition(node.client, VAULT, ALICE);

  assert.equal(position.shares, 1_000_000_000_000_000_000n);
  assert.equal(position.assets, 1_002_699n, "1 share is worth 1.002699 USDG");
  assert.equal(position.blockNumber, 118_337_511n);
});

test("previews return the share and asset sides together with the caller's cap", async () => {
  const node = createFakeNode(stateHandlers());

  const deposit = await previewDeposit(node.client, VAULT, 1_000_000n, ALICE);
  assert.equal(deposit.assets, 1_000_000n);
  assert.equal(deposit.shares, (1_000_000n * 10n ** 18n) / PRICE_PER_SHARE);
  assert.equal(deposit.maxAssets, 2n ** 256n - 1n);

  const withdraw = await previewWithdraw(node.client, VAULT, 1_000_000n, ALICE);
  assert.equal(withdraw.shares, (1_000_000n * 10n ** 18n) / PRICE_PER_SHARE);
  assert.equal(withdraw.maxAssets, 0n);

  const redeem = await previewRedeem(node.client, VAULT, 10n ** 18n, ALICE);
  assert.equal(redeem.assets, PRICE_PER_SHARE);
  assert.equal(redeem.maxShares, 0n);
});

test("maxLoss is required and 10_000 is refused as a bound", () => {
  assert.throws(() => requireMaxLoss(undefined, "withdraw"), MissingMaxLossError);
  assert.throws(() => requireMaxLoss(null, "redeem"), MissingMaxLossError);
  assert.throws(() => requireMaxLoss(10_000, "withdraw"), InvalidMaxLossError);
  assert.throws(() => requireMaxLoss(-1, "withdraw"), InvalidMaxLossError);
  assert.equal(requireMaxLoss(0, "withdraw"), 0n, "0 is a real bound: no loss accepted");
  assert.equal(requireMaxLoss(50n, "redeem"), 50n);
});

test("prepareWithdraw simulates with the caller's maxLoss, not a default", async () => {
  const node = createFakeNode(stateHandlers());
  const prepared = await prepareWithdraw(node.client, {
    vault: VAULT,
    account: ALICE,
    receiver: ALICE,
    assets: 1_000_000n,
    maxLoss: 0,
  });

  assert.equal(prepared.maxLoss, 0n);
  assert.equal(prepared.shares, (1_000_000n * 10n ** 18n) / PRICE_PER_SHARE);
  assert.ok(
    node.calls.includes(`withdraw(1000000,${ALICE},${ALICE},0)`),
    `expected an explicit max_loss of 0, got ${node.calls.join(" | ")}`,
  );
});

test("prepareRedeem and prepareDeposit simulate before returning a request", async () => {
  const node = createFakeNode(stateHandlers());

  const redeem = await prepareRedeem(node.client, {
    vault: VAULT,
    account: ALICE,
    receiver: BOB,
    shares: 10n ** 18n,
    maxLoss: 25,
  });
  assert.equal(redeem.maxLoss, 25n);
  assert.equal(redeem.assets, PRICE_PER_SHARE);
  assert.ok(node.calls.includes(`redeem(1000000000000000000,${BOB},${ALICE},25)`));

  const deposit = await prepareDeposit(node.client, {
    vault: VAULT,
    account: ALICE,
    receiver: ALICE,
    assets: 500_000n,
  });
  assert.equal(deposit.shares, (500_000n * 10n ** 18n) / PRICE_PER_SHARE);
  assert.ok(deposit.request, "a simulated request is returned");
});

test("a simulated revert surfaces as an error instead of a request", async () => {
  const node = createFakeNode(stateHandlers());
  node.revert.add("redeem");

  await assert.rejects(
    () =>
      prepareRedeem(node.client, {
        vault: VAULT,
        account: ALICE,
        receiver: ALICE,
        shares: 10n ** 18n,
        maxLoss: 0,
      }),
    /execution reverted/,
  );
});

test("a non-positive amount is refused before touching the node", async () => {
  const node = createFakeNode(stateHandlers());
  const before = node.calls.length;

  await assert.rejects(
    () => prepareWithdraw(node.client, { vault: VAULT, account: ALICE, receiver: ALICE, assets: 0n, maxLoss: 0 }),
    /must be positive/,
  );
  await assert.rejects(
    () => prepareDeposit(node.client, { vault: VAULT, account: ALICE, receiver: ALICE, assets: 0n }),
    /must be positive/,
  );
  assert.equal(node.calls.length, before);
});