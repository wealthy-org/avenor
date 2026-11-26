import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";
import {
  DepositError,
  depositBlockers,
  needsApproval,
  parseAssetInput,
  quoteDeposit,
  readDepositEvent,
  submitDeposit,
} from "../src/lib/deposit.ts";
import { connectWallet, findInjectedProvider, mapWalletError, switchToAvenorChain, WalletError } from "../src/lib/wallet.ts";
import { ASSET, BLOCK, USER, VAULT, createFakeChain, depositLog, scriptedSigner, type Handler } from "./fakeChain.ts";

function defaultHandlers(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    previewDeposit: () => 997_000_00n,
    maxDeposit: () => 1_000_000_000_000n,
    allowance: () => 0n,
    balanceOf: () => 500_000_000n,
    deposit_limit: () => 1_000_000_000_000n,
    isPaused: () => false,
    isShutdown: () => false,
    approve: () => true,
    deposit: () => 997_000_00n,
    ...overrides,
  };
}

test("asset input is parsed as exact integer units", () => {
  assert.equal(parseAssetInput("1"), 1_000_000n);
  assert.equal(parseAssetInput("1.5"), 1_500_000n);
  assert.equal(parseAssetInput("0.000001"), 1n);
  assert.equal(parseAssetInput(" 12.345678 "), 12_345_678n);
  for (const bad of ["", "1,5", "1 000", "-1", "1e6", ".", "1.0000001", "01", "abc"]) {
    assert.throws(() => parseAssetInput(bad), DepositError, `should reject ${JSON.stringify(bad)}`);
  }
  assert.throws(() => parseAssetInput("0"), /greater than zero/);
});

test("blockers name the exact gate, not a generic failure", () => {
  const base = {
    assets: 1_000_000n,
    maxAssets: 10_000_000n,
    balance: 5_000_000n,
    gate: { depositLimit: 10_000_000n, isPaused: false, isShutdown: false },
  };
  assert.deepEqual(depositBlockers(base), []);
  assert.deepEqual(
    depositBlockers({ ...base, gate: { ...base.gate, isShutdown: true } }).map((entry) => entry.code),
    ["shutdown"],
  );
  assert.deepEqual(
    depositBlockers({ ...base, gate: { ...base.gate, isPaused: true } }).map((entry) => entry.code),
    ["paused"],
  );
  assert.deepEqual(
    depositBlockers({ ...base, gate: { ...base.gate, depositLimit: 0n } }).map((entry) => entry.code),
    ["deposit_closed"],
  );
  assert.deepEqual(depositBlockers({ ...base, maxAssets: 0n }).map((entry) => entry.code), ["cap_full"]);
  assert.deepEqual(
    depositBlockers({ ...base, assets: 11_000_000n, balance: 20_000_000n }).map((entry) => entry.code),
    ["exceeds_cap"],
  );
  assert.deepEqual(depositBlockers({ ...base, assets: 6_000_000n }).map((entry) => entry.code), ["insufficient_balance"]);
});

test("quote reads one block and never invents a capacity", async () => {
  const { client, chain } = createFakeChain(defaultHandlers());
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 1_000_000n });
  assert.equal(quote.blockNumber, BLOCK);
  assert.equal(quote.shares, 997_000_00n);
  assert.equal(quote.maxAssets, 1_000_000_000_000n);
  assert.equal(quote.allowance, 0n);
  assert.deepEqual(quote.gate, { depositLimit: 1_000_000_000_000n, isPaused: false, isShutdown: false });
  assert.equal(chain.calls.includes(`${ASSET.toLowerCase()}:allowance`), true);
});

test("a failed read is an RPC error, not a zero quote", async () => {
  const { client, chain } = createFakeChain(defaultHandlers());
  chain.revert.add("deposit_limit");
  await assert.rejects(
    quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 1_000_000n }),
    (error: unknown) => error instanceof DepositError && error.code === "rpc",
  );
});

test("deposit approves exactly the amount, then reports shares from the event", async () => {
  const { client, chain } = createFakeChain(defaultHandlers());
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  assert.equal(needsApproval(quote.allowance, quote.assets), true);
  const receipt = await submitDeposit({
    client,
    signer: scriptedSigner(chain),
    vault: VAULT,
    asset: ASSET,
    assets: 100_000_000n,
    receiver: USER,
    quote,
  });
  assert.equal(chain.sent.length, 2, "approve then deposit");
  assert.equal(receipt.shares, 99_700_000n, "shares come from the Deposit event");
  assert.equal(receipt.assets, 100_000_000n);
  assert.equal(receipt.depositTx.endsWith("02"), true);
});

test("an existing allowance skips the approve transaction", async () => {
  const { client, chain } = createFakeChain(defaultHandlers({ allowance: () => 100_000_000n }));
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  const receipt = await submitDeposit({
    client,
    signer: scriptedSigner(chain),
    vault: VAULT,
    asset: ASSET,
    assets: 100_000_000n,
    receiver: USER,
    quote,
  });
  assert.equal(chain.sent.length, 1);
  assert.equal(receipt.approveTx, null);
});

test("a receipt without the Deposit event is an error, not zero shares", async () => {
  const { client, chain } = createFakeChain(defaultHandlers());
  chain.logs = [];
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  await assert.rejects(
    submitDeposit({
      client,
      signer: scriptedSigner(chain),
      vault: VAULT,
      asset: ASSET,
      assets: 100_000_000n,
      receiver: USER,
      quote,
    }),
    (error: unknown) => error instanceof DepositError && error.code === "no_event",
  );
});

test("a blocked quote never reaches the signer", async () => {
  const { client, chain } = createFakeChain(defaultHandlers({ deposit_limit: () => 0n }));
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  await assert.rejects(
    submitDeposit({
      client,
      signer: scriptedSigner(chain),
      vault: VAULT,
      asset: ASSET,
      assets: 100_000_000n,
      receiver: USER,
      quote,
    }),
    (error: unknown) => error instanceof DepositError && error.code === "deposit_closed",
  );
  assert.equal(chain.sent.length, 0);
});

test("a rejected signature is reported as a rejection with no transaction", async () => {
  const { client, chain } = createFakeChain(defaultHandlers({ allowance: () => 100_000_000n }));
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  await assert.rejects(
    submitDeposit({
      client,
      signer: scriptedSigner(chain, { reject: true }),
      vault: VAULT,
      asset: ASSET,
      assets: 100_000_000n,
      receiver: USER,
      quote,
    }),
    (error: unknown) => mapWalletError(error)?.code === "rejected",
  );
});

test("event decoding ignores other contracts' logs", () => {
  const foreign = depositLog(USER, 1n, 2n);
  const ours = depositLog(USER, 100n, 200n);
  const decoded = readDepositEvent([{ ...foreign, address: ASSET }, ours], VAULT);
  assert.equal(decoded?.shares, 200n);
  assert.equal(readDepositEvent([{ ...foreign, address: ASSET }], VAULT), null);
});

test("wallet connection distinguishes no provider, no account, and wrong chain", async () => {
  await assert.rejects(connectWallet(null), (error: unknown) => error instanceof WalletError && error.code === "no_provider");

  const noAccount = { request: async () => [] };
  await assert.rejects(connectWallet(noAccount), (error: unknown) => error instanceof WalletError && error.code === "no_account");

  const ok = {
    request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [USER];
      if (method === "eth_chainId") return "0x1237";
      throw new Error(`unexpected ${method}`);
    },
  };
  const connected = await connectWallet(ok);
  assert.equal(connected.account, USER);
  assert.equal(connected.chainId, 4663);
});

test("switching chain reports a refusal instead of claiming success", async () => {
  const refuses = {
    request: async ({ method }: { method: string }) => {
      if (method === "wallet_switchEthereumChain") throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
      if (method === "eth_chainId") return "0x1";
      throw new Error(method);
    },
  };
  const result = await switchToAvenorChain(refuses);
  assert.equal(result.switched, false);
  assert.match(result.reason ?? "", /Unrecognized chain/);

  const switches = {
    request: async ({ method }: { method: string }) => {
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_chainId") return "0x1237";
      throw new Error(method);
    },
  };
  assert.deepEqual(await switchToAvenorChain(switches), { switched: true, reason: null });
});

test("injected provider detection does not accept a partial object", () => {
  assert.equal(findInjectedProvider(undefined), null);
  assert.equal(findInjectedProvider({}), null);
  assert.equal(findInjectedProvider({ ethereum: { request: "yes" } }), null);
  const provider = { request: async () => null };
  assert.equal(findInjectedProvider({ ethereum: provider }), provider);
});

test("wallet error mapping keeps 4001 and -32002 apart", () => {
  assert.equal(mapWalletError(Object.assign(new Error("x"), { code: 4001 }))?.code, "rejected");
  assert.equal(mapWalletError(Object.assign(new Error("x"), { code: -32002 }))?.code, "pending_request");
  assert.equal(mapWalletError(new Error("x")), null);
});

test("deposit rejects expired quote older than 60s (K-8)", async () => {
  const { client, chain } = createFakeChain(defaultHandlers());
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  // Simulate stale quote (older than 60s)
  quote.quoteTimestamp = Date.now() - 65_000;
  await assert.rejects(
    submitDeposit({
      client,
      signer: scriptedSigner(chain),
      vault: VAULT,
      asset: ASSET,
      assets: 100_000_000n,
      receiver: USER,
      quote,
    }),
    (error: unknown) => error instanceof DepositError && error.code === "quote_expired",
  );
});

test("deposit rejects when received shares breach minimum shares threshold (K-8)", async () => {
  const { client, chain } = createFakeChain(defaultHandlers({ deposit: () => 50_000_000n })); // returns only 50m shares
  const quote = await quoteDeposit(client, { vault: VAULT, asset: ASSET, account: USER, assets: 100_000_000n });
  // quote.shares is ~99.7m, minShares is ~99.2m, but event yields 50m
  await assert.rejects(
    submitDeposit({
      client,
      signer: scriptedSigner(chain),
      vault: VAULT,
      asset: ASSET,
      assets: 100_000_000n,
      receiver: USER,
      quote,
    }),
    (error: unknown) => error instanceof DepositError && error.code === "slippage_exceeded",
  );
});