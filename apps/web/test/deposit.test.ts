// Deposit tests run against a scripted JSON-RPC node and a scripted signer: the real viem encoder
// and decoder are exercised, so a wrong ABI, a wrong argument order, or a missing event is a test
// failure instead of a bug found in a browser.

import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { vaultV3Abi } from "@avenor/sdk";
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

const VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd" as Address;
const ASSET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const USER = "0x1111111111111111111111111111111111111111" as Address;
const BLOCK = 0x70dafe7n;

type Handler = (args: readonly unknown[]) => unknown;

interface FakeChain {
  calls: string[];
  handlers: Map<string, Handler>;
  revert: Set<string>;
  receipts: Hex[];
  sent: unknown[];
}

interface Client {
  client: ReturnType<typeof createPublicClient>;
  chain: FakeChain;
}

function depositLog(owner: Address, assets: bigint, shares: bigint): { address: Address; data: Hex; topics: Hex[] } {
  const topics = encodeEventTopics({
    abi: vaultV3Abi,
    eventName: "Deposit",
    args: { sender: USER, owner },
  }) as Hex[];
  const data = `0x${[assets, shares].map((word) => word.toString(16).padStart(64, "0")).join("")}` as Hex;
  return { address: VAULT, data, topics };
}

function createFakeChain(handlers: Record<string, Handler>, options: { withEvent?: boolean } = {}): Client {
  const chain: FakeChain = {
    calls: [],
    handlers: new Map(Object.entries(handlers)),
    revert: new Set(),
    receipts: [],
    sent: [],
  };

  const transport = custom({
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId":
          return "0x1237";
        case "eth_blockNumber":
          return `0x${BLOCK.toString(16)}`;
        case "eth_getBlockByNumber":
          return {
            number: `0x${BLOCK.toString(16)}`,
            hash: "0xbaa980ab",
            parentHash: `0x${"11".repeat(32)}`,
            nonce: "0x0000000000000000",
            sha3Uncles: `0x${"22".repeat(32)}`,
            logsBloom: `0x${"00".repeat(256)}`,
            transactionsRoot: `0x${"33".repeat(32)}`,
            stateRoot: `0x${"44".repeat(32)}`,
            receiptsRoot: `0x${"55".repeat(32)}`,
            miner: "0x0000000000000000000000000000000000000000",
            difficulty: "0x0",
            totalDifficulty: "0x0",
            extraData: "0x",
            size: "0x1",
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            timestamp: "0x6b0a05a6",
            transactions: [],
            uncles: [],
            baseFeePerGas: "0x1",
          };
        case "eth_getTransactionReceipt": {
          const hash = (params as [Hex])[0];
          const logs = options.withEvent === false ? [] : [depositLog(USER, 100_000_000n, 99_700_000n)];
          return {
            transactionHash: hash,
            transactionIndex: "0x0",
            blockHash: "0xbaa980ab",
            blockNumber: `0x${BLOCK.toString(16)}`,
            from: USER,
            to: VAULT,
            cumulativeGasUsed: "0x5208",
            gasUsed: "0x5208",
            effectiveGasPrice: "0x1",
            contractAddress: null,
            logs,
            logsBloom: `0x${"00".repeat(256)}`,
            status: "0x1",
            type: "0x2",
          };
        }
        case "eth_call": {
          const call = (params as [{ to: Address; data: Hex }, string])[0];
          let decoded: { functionName: string; args: readonly unknown[] } | null = null;
          let abi: Abi = vaultV3Abi;
          for (const candidate of [vaultV3Abi, erc20Abi] as Abi[]) {
            try {
              const result = decodeFunctionData({ abi: candidate, data: call.data });
              decoded = { functionName: result.functionName, args: (result.args ?? []) as readonly unknown[] };
              abi = candidate;
              break;
            } catch {
              // next ABI
            }
          }
          if (!decoded) throw new Error(`fake chain cannot decode ${call.data.slice(0, 10)}`);
          const signature = `${call.to.toLowerCase()}:${decoded.functionName}`;
          chain.calls.push(signature);
          if (chain.revert.has(decoded.functionName)) throw new Error("execution reverted");
          const handler = chain.handlers.get(decoded.functionName);
          if (!handler) throw new Error(`fake chain has no handler for ${decoded.functionName}`);
          return encodeFunctionResult({ abi, functionName: decoded.functionName, result: handler(decoded.args) });
        }
        default:
          throw new Error(`fake chain does not implement ${method}`);
      }
    },
  });

  return { client: createPublicClient({ transport }), chain };
}

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

function scriptedSigner(chain: FakeChain, options: { reject?: boolean } = {}) {
  return {
    account: USER,
    async sendTransaction(request: unknown): Promise<Hex> {
      if (options.reject === true) {
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      chain.sent.push(request);
      const hash = `0x${chain.sent.length.toString(16).padStart(64, "0")}` as Hex;
      return hash;
    },
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
  assert.throws(() => parseAssetInput("0"), /lebih besar dari nol/);
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
  const { client, chain } = createFakeChain(defaultHandlers(), { withEvent: false });
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