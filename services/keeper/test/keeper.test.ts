import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, custom, decodeFunctionData, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { vaultV3Abi } from "@avenor/sdk";
import { Keeper, KeeperStoppedError, type Job } from "../src/keeper.ts";
import { allocationJob, reportJob, type StrategySnapshot, type VaultReader, type VaultSnapshot } from "../src/jobs.ts";
import { createViemSender } from "../src/viemSender.ts";
import { createVaultReader } from "../src/reader.ts";
import { memoryLogger } from "../src/log.ts";
import type { KeeperSender, KeeperTx, Simulation } from "../src/sender.ts";
import { startFakeNode } from "./fakeNode.ts";

const VAULT = "0xbeef00000000000000000000000000000000beef" as const;
const STRATEGY = "0x5eed000000000000000000000000000000005eed" as const;
const SELECTOR = {
  totalAssets: toFunctionSelector("totalAssets()"),
  totalIdle: toFunctionSelector("totalIdle()"),
  totalDebt: toFunctionSelector("totalDebt()"),
  isShutdown: toFunctionSelector("isShutdown()"),
  minimumTotalIdle: toFunctionSelector("minimum_total_idle()"),
  depositLimit: toFunctionSelector("deposit_limit()"),
  strategies: toFunctionSelector("strategies(address)"),
  processReport: toFunctionSelector("process_report(address)"),
  updateDebt: toFunctionSelector("update_debt(address,uint256,uint256)"),
  strategyAssets: toFunctionSelector("totalAssetsIncludingIdle()"),
};

function reader(options: {
  vault?: Partial<VaultSnapshot>;
  strategy?: Partial<StrategySnapshot>;
  strategyAssets?: bigint;
}): VaultReader {
  const vault: VaultSnapshot = {
    blockNumber: 100n,
    totalAssets: 10_000n,
    totalIdle: 0n,
    totalDebt: 10_000n,
    isShutdown: false,
    minimumTotalIdle: 1_000n,
    depositLimit: 1_000_000n,
    ...options.vault,
  };
  const strategy: StrategySnapshot = { currentDebt: 10_000n, maxDebt: 100_000n, ...options.strategy };
  return {
    vault: async () => vault,
    strategy: async () => strategy,
    strategyAssets: async () => options.strategyAssets ?? 10_000n,
  };
}

class FakeSender implements KeeperSender {
  address = "0xaaaa00000000000000000000000000000000aaaa" as const;
  sent: { tx: KeeperTx; nonce: number }[] = [];
  simulations = 0;
  simulation: Simulation = { ok: true };
  private nextNonce = 10;
  failWith: string[] = [];

  async nonce(): Promise<number> {
    return this.nextNonce;
  }

  async simulate(): Promise<Simulation> {
    this.simulations += 1;
    return this.simulation;
  }

  async send(tx: KeeperTx, nonce: number): Promise<`0x${string}`> {
    const failure = this.failWith.shift();
    if (failure) throw new Error(failure);
    this.sent.push({ tx, nonce });
    this.nextNonce = nonce + 1;
    return `0x${"ab".repeat(32)}`;
  }
}

function snapshotJob(tx: KeeperTx | null, reason = "nothing to do"): Job {
  return { name: "snapshot", plan: async () => ({ blockNumber: 100n, action: tx, reason }) };
}

function keeperFor(job: Job, sender: FakeSender) {
  const logger = memoryLogger();
  const keeper = new Keeper({ jobs: [job], sender, logger, now: () => new Date("2026-11-22T00:00:00Z") });
  return { keeper, logger };
}

test("a report is only planned when the gain clears the threshold", async () => {
  const below = await reportJob(reader({ strategyAssets: 10_050n }), { vault: VAULT, strategy: STRATEGY, minGainBps: 100 }).plan(
    new FakeSender(),
  );
  assert.equal(below.action, null);
  assert.match(below.reason ?? "", /50 bps below threshold 100 bps/);

  const above = await reportJob(reader({ strategyAssets: 10_200n }), { vault: VAULT, strategy: STRATEGY, minGainBps: 100 }).plan(
    new FakeSender(),
  );
  assert.notEqual(above.action, null);
  const decoded = decodeFunctionData({ abi: vaultV3Abi, data: above.action!.data });
  assert.equal(decoded.functionName, "process_report");
  assert.deepEqual((decoded.args ?? []).map((arg) => (typeof arg === "string" ? arg.toLowerCase() : arg)), [STRATEGY.toLowerCase()]);
});

test("a loss is an alert, never a transaction", async () => {
  const result = await reportJob(reader({ strategyAssets: 9_000n }), { vault: VAULT, strategy: STRATEGY, minGainBps: 1 }).plan(
    new FakeSender(),
  );
  assert.equal(result.action, null);
  assert.equal(result.level, "alert");
  assert.match(result.reason ?? "", /loss of 1000 observed/);
});

test("a gain above Accountant.maxGain is explained instead of tripping the health check", async () => {
  const result = await reportJob(reader({ strategyAssets: 11_500n }), {
    vault: VAULT,
    strategy: STRATEGY,
    minGainBps: 100,
    maxGainBps: 500,
  }).plan(new FakeSender());
  assert.equal(result.action, null);
  assert.equal(result.level, "alert");
  assert.match(result.reason ?? "", /above Accountant\.maxGain 500 bps/);
});

test("no debt means no percentage basis, so the keeper does not report", async () => {
  const result = await reportJob(reader({ strategy: { currentDebt: 0n }, strategyAssets: 50n }), {
    vault: VAULT,
    strategy: STRATEGY,
    minGainBps: 1,
  }).plan(new FakeSender());
  assert.equal(result.action, null);
  assert.match(result.reason ?? "", /no debt/);
});

test("allocation keeps the higher of minimum_total_idle and the hard floor, then stops at max_debt", async () => {
  const readerWith = reader({
    vault: { totalIdle: 5_000n, minimumTotalIdle: 1_000n, totalDebt: 100n },
    strategy: { currentDebt: 100n, maxDebt: 2_000n },
  });
  const job = allocationJob(readerWith, { vault: VAULT, strategy: STRATEGY, hardIdleFloor: 2_000n });
  const result = await job.plan(new FakeSender());
  const decoded = decodeFunctionData({ abi: vaultV3Abi, data: result.action!.data });
  assert.equal(decoded.functionName, "update_debt");
  // floor 2.000 -> available 3.000; headroom 1.900 -> target 2.000, never above max_debt.
  assert.deepEqual((decoded.args ?? []).map((arg) => (typeof arg === "string" ? arg.toLowerCase() : arg)), [STRATEGY.toLowerCase(), 2_000n, 0n]);

  const atCap = allocationJob(
    reader({ vault: { totalIdle: 5_000n }, strategy: { currentDebt: 100n, maxDebt: 100n } }),
    { vault: VAULT, strategy: STRATEGY, hardIdleFloor: 0n },
  );
  const capped = await atCap.plan(new FakeSender());
  assert.equal(capped.action, null);
  assert.match(capped.reason ?? "", /at max_debt/);
});

test("a transaction that fails simulation is logged and never broadcast", async () => {
  const sender = new FakeSender();
  sender.simulation = { ok: false, reason: "execution reverted: too much loss" };
  const { keeper, logger } = keeperFor(
    snapshotJob({ to: VAULT, data: `${SELECTOR.processReport}${"00".repeat(32)}` as `0x${string}` }),
    sender,
  );

  const [entry] = await keeper.runOnce();
  assert.equal(entry.status, "skipped");
  assert.equal(entry.level, "alert");
  assert.match(entry.reason ?? "", /simulation reverted: execution reverted: too much loss/);
  assert.equal(sender.sent.length, 0);
  assert.equal(sender.simulations, 1);
  assert.equal(logger.entries.length, 1);
  assert.equal(entry.blockNumber, "100");
});

test("the kill switch stops the run before the next job is even planned", async () => {
  const sender = new FakeSender();
  const logger = memoryLogger();
  let planned = 0;
  const job: Job = {
    name: "counting",
    plan: async () => {
      planned += 1;
      return { blockNumber: 1n, action: null, reason: "noop" };
    },
  };
  const keeper = new Keeper({ jobs: [job, job], sender, logger });
  await keeper.runOnce();
  assert.equal(planned, 2);

  keeper.stop();
  await assert.rejects(() => keeper.runOnce(), KeeperStoppedError);
  assert.equal(planned, 2, "a stopped keeper must not plan work");
});

test("a stale nonce is re-read once, then the retry succeeds", async () => {
  const sender = new FakeSender();
  sender.failWith = ["nonce too low: next nonce 10, tx nonce 9"];
  const { keeper } = keeperFor(snapshotJob({ to: VAULT, data: SELECTOR.totalAssets as `0x${string}` }), sender);

  const [entry] = await keeper.runOnce();
  assert.equal(entry.status, "sent");
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]!.nonce, 10);
  assert.equal(entry.nonce, 10);
  assert.equal(entry.txHash, `0x${"ab".repeat(32)}`);
  assert.match(entry.calldata ?? "", /^0x/);
});

test("a non-nonce failure is reported with its nonce, not retried blindly", async () => {
  const sender = new FakeSender();
  sender.failWith = ["insufficient funds for gas * price + value"];
  const { keeper } = keeperFor(snapshotJob({ to: VAULT, data: SELECTOR.totalAssets as `0x${string}` }), sender);
  const [entry] = await keeper.runOnce();
  assert.equal(entry.status, "failed");
  assert.match(entry.reason ?? "", /insufficient funds/);
  assert.equal(sender.sent.length, 0);
});

test("a planning error does not abort the remaining jobs", async () => {
  const sender = new FakeSender();
  const boom: Job = {
    name: "boom",
    plan: async () => {
      throw new Error("rpc down");
    },
  };
  const logger = memoryLogger();
  const keeper = new Keeper({ jobs: [boom, snapshotJob(null, "nothing")], sender, logger });
  const entries = await keeper.runOnce();
  assert.equal(entries.length, 2);
  assert.equal(entries[0]!.status, "failed");
  assert.match(entries[0]!.reason ?? "", /plan failed: rpc down/);
  assert.equal(entries[1]!.status, "skipped");
});

test("the production reader pins every read to one block and uses the strategy's live assets", async () => {
  const node = await startFakeNode();
  try {
    node.handlers.set(`${VAULT}:${SELECTOR.totalAssets}`, 538_856_055_994n);
    node.handlers.set(`${VAULT}:${SELECTOR.totalIdle}`, 27_024_457_979n);
    node.handlers.set(`${VAULT}:${SELECTOR.totalDebt}`, 511_831_598_015n);
    node.handlers.set(`${VAULT}:${SELECTOR.isShutdown}`, false);
    node.handlers.set(`${VAULT}:${SELECTOR.minimumTotalIdle}`, 1_000_000_000n);
    node.handlers.set(`${VAULT}:${SELECTOR.depositLimit}`, 1_000_000_000n);
    node.handlers.set(`${VAULT}:${SELECTOR.strategies}`, [0n, 0n, 511_831_598_015n, 600_000_000_000n]);
    node.handlers.set(`${STRATEGY}:${SELECTOR.strategyAssets}`, 513_000_000_000n);

    const client = createPublicClient({ transport: custom(transport(node.url)) });
    const vaultReader = createVaultReader(client, { vault: VAULT, strategy: STRATEGY });
    const snapshot = await vaultReader.vault();
    const strategy = await vaultReader.strategy(STRATEGY, snapshot.blockNumber);
    const assets = await vaultReader.strategyAssets(STRATEGY, snapshot.blockNumber);

    assert.equal(snapshot.blockNumber, 100n);
    assert.equal(snapshot.totalIdle, 27_024_457_979n);
    assert.equal(strategy.currentDebt, 511_831_598_015n);
    assert.equal(strategy.maxDebt, 600_000_000_000n);
    assert.equal(assets, 513_000_000_000n);
    assert.ok(node.calls.length >= 8);
    assert.ok(node.calls.every((call) => call.block === "0x64"), "every read must share the pinned block");
  } finally {
    await node.stop();
  }
});

test("the production sender simulates before signing and surfaces a revert reason", async () => {
  const node = await startFakeNode();
  try {
    node.handlers.set(`${VAULT}:${SELECTOR.updateDebt}`, 0n);
    const publicClient = createPublicClient({ transport: custom(transport(node.url)) });
    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const walletClient = createWalletClient({ account, transport: custom(transport(node.url)) });
    const sender = createViemSender({ publicClient, walletClient, account });

    const tx = { to: VAULT, data: `${SELECTOR.updateDebt}${"00".repeat(96)}` as `0x${string}` };
    assert.deepEqual(await sender.simulate(tx), { ok: true });
    assert.equal(await sender.nonce(), 7);

    node.reverts.add(`${VAULT}:${SELECTOR.updateDebt}`);
    const failed = await sender.simulate(tx);
    assert.equal(failed.ok, false);
    assert.match(failed.reason ?? "", /too much loss/);

    const hash = await sender.send(tx, 7);
    assert.equal(hash, `0x${"11".repeat(32)}`);
    assert.equal(node.sent.length, 1);
    assert.ok(node.sent[0]!.toLowerCase().includes(SELECTOR.updateDebt.slice(2).toLowerCase()));

    const receipt = await sender.waitForReceipt!(hash);
    assert.equal(receipt.status, "success");
    assert.equal(receipt.blockNumber, 100n);
  } finally {
    await node.stop();
  }
});

test("keeper waits for receipt and reports failed when transaction reverts on-chain (S-1)", async () => {
  const sender: KeeperSender = {
    address: "0xaaaa00000000000000000000000000000000aaaa",
    nonce: async () => 10,
    simulate: async () => ({ ok: true }),
    send: async () => "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    waitForReceipt: async (txHash) => ({
      status: "reverted",
      blockNumber: 105n,
      transactionHash: txHash,
    }),
  };

  const job = snapshotJob({ to: VAULT, data: "0x1234" });
  const { keeper, logger } = keeperFor(job, sender as any);

  const entries = await keeper.runOnce();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.status, "failed");
  assert.match(entries[0]!.reason ?? "", /transaction reverted on-chain in block 105/);
});

function transport(url: string) {
  return {
    async request({ method, params }: { method: string; params?: unknown }) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = (await response.json()) as { result?: unknown; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      return body.result;
    },
  };
}