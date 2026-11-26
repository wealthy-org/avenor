// Ticket 4.3 acceptance: "rekonsiliasi harian membandingkan indexed vs on-chain dengan toleransi
// eksplisit dan memicu alert bila selisih".
//
// The expected side is computed from events (reports + refunds + mint/burn), the actual side from
// `eth_call` at a pinned block on the scripted node. Drift is asserted in basis points, and the
// tolerance is a required argument so a test cannot accidentally accept an unlimited drift.

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, type Pool } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";
import { driftBps, reconcile, reconcileNow, recordSnapshot, SELECTOR, type ReconcileConfig } from "../src/reconcile.ts";
import { httpRpc } from "../src/rpc.ts";
import { FakeRpcServer, fakeChain, mine, uintWord, wordResult, type FakeChain } from "./fakeRpc.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "migrations");
const VAULT = "0xbeef00000000000000000000000000000000beef";

let pool: Pool;
let server: FakeRpcServer | null = null;

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required; run `python scripts/db-test.py`");
  pool = createPool(url, "avenor-reconcile-test");
  const name = await pool.query<{ name: string }>("SELECT current_database() AS name");
  if (!name.rows[0]?.name.endsWith("_test")) throw new Error("refusing to touch a non-test database");
});

beforeEach(async () => {
  await server?.stop();
  server = null;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(pool, MIGRATIONS);
});

after(async () => {
  await server?.stop();
  await pool?.end();
});

function convertKey(shareDecimals: number): string {
  const amount = 10n ** BigInt(shareDecimals);
  return `${VAULT}:${SELECTOR.convertToAssets}${uintWord(amount)}`;
}

function setViews(
  node: FakeRpcServer,
  numbers: {
    totalAssets: bigint;
    totalSupply: bigint;
    pricePerShare: bigint;
    /** Defaults to "everything is idle", the only case where the split is unambiguous. */
    totalIdle?: bigint;
    totalDebt?: bigint;
  },
  shareDecimals = 18,
): void {
  node.views.set(`${VAULT}:${SELECTOR.totalAssets}`, wordResult(numbers.totalAssets));
  node.views.set(`${VAULT}:${SELECTOR.totalSupply}`, wordResult(numbers.totalSupply));
  // No accountant is the simple case; the fee read is covered by the API tests.
  node.views.set(`${VAULT}:${SELECTOR.depositLimit}`, `0x${(1_000_000_000_000n).toString(16).padStart(64, "0")}`);
  node.views.set(`${VAULT}:${SELECTOR.isPaused}`, `0x${"0".repeat(64)}`);
  node.views.set(`${VAULT}:${SELECTOR.isShutdown}`, `0x${"0".repeat(64)}`);
  node.views.set(`${VAULT}:${SELECTOR.accountant}`, `0x${"0".repeat(64)}`);
  node.views.set(`${VAULT}:${SELECTOR.totalIdle}`, wordResult(numbers.totalIdle ?? numbers.totalAssets));
  node.views.set(`${VAULT}:${SELECTOR.totalDebt}`, wordResult(numbers.totalDebt ?? 0n));
  node.views.set(convertKey(shareDecimals), wordResult(numbers.pricePerShare));
}

async function startServer(chain: FakeChain): Promise<FakeRpcServer> {
  const instance = new FakeRpcServer(chain);
  await instance.start();
  server = instance;
  return instance;
}

async function seedBaseSnapshot(block: number, totalAssets: bigint, totalSupply: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO share_price_snapshots
       (chain_id, vault_address, block_number, block_hash, block_time, total_assets, total_supply, price_per_share, source)
     VALUES (4663, $1, $2, '0xbase', to_timestamp(1), $3, $4, $5, 'onchain')`,
    [VAULT, block, totalAssets.toString(), totalSupply.toString(), (totalAssets * 10n ** 18n) / (totalSupply || 1n)],
  );
}

async function seedReport(block: number, gain: bigint, loss: bigint, refunds: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO reports (chain_id, vault_address, strategy_address, block_number, block_hash, block_time,
                          tx_hash, log_index, gain, loss, total_fees, total_refunds)
     VALUES (4663, $1, '0xstrategy', $2, '0xr', to_timestamp(1), $3, 0, $4, $5, 0, $6)`,
    [VAULT, block, `0xreport${block}`, gain.toString(), loss.toString(), refunds.toString()],
  );
  if (refunds > 0n) {
    await pool.query(
      `INSERT INTO fees (chain_id, vault_address, strategy_address, block_number, block_hash, block_time,
                         tx_hash, log_index, fee_kind, assets)
       VALUES (4663, $1, '0xstrategy', $2, '0xr', to_timestamp(1), $3, 0, 'refund', $4)`,
      [VAULT, block, `0xreport${block}`, refunds.toString()],
    );
  }
}

async function seedTransfers(supply: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO share_transfers (chain_id, vault_address, block_number, block_hash, tx_hash, log_index,
                                  from_address, to_address, shares)
     VALUES (4663, $1, 5, '0xv', '0xmint', 0, '0x0000000000000000000000000000000000000000', '0xalice', $2)`,
    [VAULT, supply.toString()],
  );
}

function config(overrides: Partial<ReconcileConfig> = {}): ReconcileConfig {
  return {
    chainId: 4663,
    vault: VAULT,
    asset: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    shareDecimals: 18,
    toleranceBps: 0,
    ...overrides,
  };
}

test("driftBps is zero for equality and rounds any real drift up to at least one bps", () => {
  assert.equal(driftBps(1_000n, 1_000n), 0);
  assert.equal(driftBps(1_001n, 1_000n), 10, "1/1000 is 0.1% = 10 bps; truncation would lose it");
  assert.equal(driftBps(1_000n, 1_001n), 10);
  assert.equal(driftBps(0n, 1n), 10_000);
});

test("an exact match reconciles and records an on-chain snapshot", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  const node = await startServer(chain);
  setViews(node, { totalAssets: 1_100n, totalSupply: 1_000n, pricePerShare: 1_100_000_000_000_000_000n });
  await seedBaseSnapshot(10, 1_000n, 1_000n);
  await seedReport(15, 100n, 0n, 0n);
  await seedTransfers(1_000n);

  const report = await reconcileNow(pool, httpRpc(node.url), config(), 20n);

  assert.equal(report.status, "ok");
  assert.equal(report.indexed.totalAssets, 1_100n);
  assert.equal(report.deltas.totalAssets, 0n);
  assert.deepEqual(report.alerts, []);

  const snapshots = await pool.query<{ source: string; total_assets: string }>(
    "SELECT source, total_assets FROM share_price_snapshots ORDER BY block_number",
  );
  assert.deepEqual(snapshots.rows, [
    { source: "onchain", total_assets: "1000" },
    { source: "onchain", total_assets: "1100" },
  ]);

  // Re-running at the same block refreshes the row instead of growing the table.
  await reconcileNow(pool, httpRpc(node.url), config(), 20n);
  const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM share_price_snapshots");
  assert.equal(count.rows[0]?.count, "2");
});

test("one wei of drift fails at zero tolerance and passes at one bps", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  const node = await startServer(chain);
  setViews(node, { totalAssets: 1_001n, totalSupply: 1_000n, pricePerShare: 1n });
  await seedBaseSnapshot(10, 1_000n, 1_000n);
  await seedTransfers(1_000n);

  const strict = await reconcile(pool, httpRpc(node.url), config(), 20n);
  assert.equal(strict.status, "drift");
  assert.equal(strict.deltas.totalAssets, -1n, "indexed minus on-chain: the chain is one wei ahead");
  assert.equal(strict.deltas.totalAssetsBps, 10, "1 wei on 1000 units is 0.1% = 10 bps");
  assert.match(strict.alerts[0] ?? "", /totalAssets drift 10 bps exceeds tolerance 0 bps/);

  const lenient = await reconcile(pool, httpRpc(node.url), config({ toleranceBps: 10 }), 20n);
  assert.equal(lenient.status, "ok", "a stated 10 bps budget covers a 10 bps drift");
});

test("a loss and a refund both move the expected side in the right direction", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  const node = await startServer(chain);
  // 1_000 + 100 gain - 40 loss + 25 refund = 1_085
  setViews(node, { totalAssets: 1_085n, totalSupply: 1_000n, pricePerShare: 1n });
  await seedBaseSnapshot(10, 1_000n, 1_000n);
  await seedReport(12, 100n, 0n, 0n);
  await seedReport(14, 0n, 40n, 0n);
  await seedReport(16, 0n, 0n, 25n);
  await seedTransfers(1_000n);

  const report = await reconcile(pool, httpRpc(node.url), config(), 20n);
  assert.equal(report.indexed.totalAssets, 1_085n);
  assert.equal(report.status, "ok");
});

test("a supply mismatch is an alert even when assets agree", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  const node = await startServer(chain);
  setViews(node, { totalAssets: 1_000n, totalSupply: 1_001n, pricePerShare: 1n });
  await seedBaseSnapshot(10, 1_000n, 1_001n);
  await seedTransfers(1_000n);

  const report = await reconcile(pool, httpRpc(node.url), config({ toleranceBps: 10_000 }), 20n);
  assert.equal(report.status, "drift", "supply is exact; tolerance never applies to it");
  assert.match(report.alerts.at(-1) ?? "", /totalSupply mismatch/);
});

test("no indexed mint history is reported as insufficient, not as a pass", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  const node = await startServer(chain);
  setViews(node, { totalAssets: 1_000n, totalSupply: 1_000n, pricePerShare: 1n });

  const report = await reconcileNow(pool, httpRpc(node.url), config(), 20n);
  assert.equal(report.status, "insufficient-history");
  assert.match(report.alerts[0] ?? "", /backfill from the deploy block/);

  const snapshots = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM share_price_snapshots");
  assert.equal(snapshots.rows[0]?.count, "0", "a number we cannot vouch for is not stored as on-chain truth");
});

test("recordSnapshot is a refresh at the same block, not a constraint error", async () => {
  const snapshot = {
    blockNumber: 20n,
    blockHash: "0xabc",
    blockTime: new Date(1_700_000_000_000),
    totalAssets: 1_000n,
    totalSupply: 1_000n,
    pricePerShare: 1n,
  };
  await recordSnapshot(pool, config(), snapshot);
  await recordSnapshot(pool, config(), { ...snapshot, totalAssets: 1_001n });

  const row = await pool.query<{ total_assets: string }>(
    "SELECT total_assets FROM share_price_snapshots WHERE block_number = 20",
  );
  assert.equal(row.rows[0]?.total_assets, "1001");
});

test("reconcile correctly anchors to base snapshot and reflects net gains/losses/refunds (S-11)", async () => {
  const chain = fakeChain();
  mine(chain, 30);
  const node = await startServer(chain);
  // Base snapshot at block 10 has 10,000 assets.
  // At block 15, strategy reports 500 gain.
  // At block 20, strategy reports 100 loss.
  // At block 25, 50 refund.
  // Net expected assets = 10,000 + 500 - 100 + 50 = 10,450.
  setViews(node, { totalAssets: 10_450n, totalSupply: 10_000n, pricePerShare: 1_045_000_000_000_000_000n });
  await seedBaseSnapshot(10, 10_000n, 10_000n);
  await seedReport(15, 500n, 0n, 0n);
  await seedReport(20, 0n, 100n, 0n);
  await seedReport(25, 0n, 0n, 50n);
  await seedTransfers(10_000n);

  const report = await reconcile(pool, httpRpc(node.url), config(), 28n);
  assert.equal(report.status, "ok");
  assert.equal(report.indexed.totalAssets, 10_450n);
  assert.equal(report.onchain.totalAssets, 10_450n);
  assert.equal(report.deltas.totalAssets, 0n);
  assert.deepEqual(report.alerts, []);
});