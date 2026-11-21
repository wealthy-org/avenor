// Ticket 4.5 acceptance: every number leaves the API with `blockNumber`, `blockTimestamp` and
// `source`, and no uint256 is ever serialised as a JSON number.

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, type Pool } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";
import { httpRpc } from "../src/rpc.ts";
import { startApi, type ApiHandle } from "../src/api.ts";
import { SELECTOR } from "../src/reconcile.ts";
import { FakeRpcServer, fakeChain, mine, uintWord, wordResult, type FakeChain } from "./fakeRpc.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "migrations");
const VAULT = "0xbeef00000000000000000000000000000000beef";
const ALICE = "0xaaaa00000000000000000000000000000000aaaa";
const SUPPLY = 531_418_644_510_854_399_888_342_585n;

let pool: Pool;
let server: FakeRpcServer | null = null;
let api: ApiHandle | null = null;

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required; run `python scripts/db-test.py`");
  pool = createPool(url, "avenor-api-test");
  const name = await pool.query<{ name: string }>("SELECT current_database() AS name");
  if (!name.rows[0]?.name.endsWith("_test")) throw new Error("refusing to touch a non-test database");
});

beforeEach(async () => {
  await api?.close();
  api = null;
  await server?.stop();
  server = null;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(pool, MIGRATIONS);
});

after(async () => {
  await api?.close();
  await server?.stop();
  await pool?.end();
});

async function seed(chain: FakeChain): Promise<FakeRpcServer> {
  const node = new FakeRpcServer(chain);
  await node.start();
  server = node;
  node.views.set(`${VAULT}:${SELECTOR.totalAssets}`, wordResult(538_856_055_994n));
  node.views.set(`${VAULT}:${SELECTOR.totalSupply}`, wordResult(SUPPLY));
  node.views.set(
    `${VAULT}:${SELECTOR.convertToAssets}${uintWord(10n ** 18n)}`,
    wordResult(1_002_699n),
  );

  await pool.query(
    `INSERT INTO vaults (chain_id, address, name, symbol, asset_address, asset_decimals, share_decimals,
                         deployed_block, source)
     VALUES (4663, $1, 'Avenor USDG', 'avUSDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 6, 18, 100, 'onchain')`,
    [VAULT],
  );
  await pool.query(
    `INSERT INTO share_price_snapshots
       (chain_id, vault_address, block_number, block_hash, block_time, total_assets, total_supply, price_per_share, source)
     VALUES (4663, $1, 20, '0xsnap', to_timestamp(1795103654), 538856055994, $2, 1002699, 'indexed')`,
    [VAULT, SUPPLY.toString()],
  );
  await pool.query(
    `INSERT INTO positions (chain_id, vault_address, account, shares, first_seen_block, last_activity_block)
     VALUES (4663, $1, $2, $3, 150, 150)`,
    [VAULT, ALICE, SUPPLY.toString()],
  );
  await pool.query(
    `INSERT INTO reports (chain_id, vault_address, strategy_address, block_number, block_hash, block_time,
                          tx_hash, log_index, gain, loss, total_fees, total_refunds)
     VALUES (4663, $1, '0xstrategy', 20, '0xr', to_timestamp(1795103654), '0xreport', 0, 1234, 56, 78, 9)`,
    [VAULT],
  );
  await pool.query(
    `INSERT INTO ingested_blocks (chain_id, stream, block_number, block_hash)
     VALUES (4663, $1, 20, '0xhead')`,
    [`vault:${VAULT}`],
  );

  api = await startApi({
    pool,
    config: { chainId: 4663, vault: VAULT, asset: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", shareDecimals: 18 },
    rpc: httpRpc(node.url),
  });
  return node;
}

async function get(pathname: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${api!.url}${pathname}`);
  return { status: response.status, body: await response.json() };
}

test("health reports the indexed checkpoint, not the node head", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  await seed(chain);
  const { status, body } = await get("/health");
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, chainId: 4663, checkpoint: "20" });
});

test("a snapshot keeps its source and its block timestamp", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  await seed(chain);
  const { status, body } = await get(`/v1/vaults/${VAULT}/snapshots`);
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.deepEqual(body[0], {
    blockNumber: "20",
    blockHash: "0xsnap",
    blockTimestamp: new Date(1_795_103_654_000).toISOString(),
    totalAssets: "538856055994",
    totalSupply: SUPPLY.toString(),
    pricePerShare: "1002699",
    source: "indexed",
  });
  assert.equal(typeof body[0].totalSupply, "string", "a 27-digit supply must not become a JS number");
});

test("positions are indexed numbers with their own blocks", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  await seed(chain);
  const { status, body } = await get(`/v1/vaults/${VAULT}/positions/${ALICE}`);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    account: ALICE,
    shares: SUPPLY.toString(),
    firstSeenBlock: "150",
    lastActivityBlock: "150",
    source: "indexed",
  });
});

test("live reads the node at a pinned block and says so", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  await seed(chain);
  const { status, body } = await get(`/v1/vaults/${VAULT}/live?block=20`);
  assert.equal(status, 200);
  assert.equal(body.source, "onchain");
  assert.equal(body.blockNumber, "20");
  assert.equal(body.totalAssets, "538856055994");
  assert.equal(body.totalSupply, SUPPLY.toString());
  assert.equal(body.pricePerShare, "1002699");
  assert.equal(body.blockTimestamp, new Date(Number(chain.blocks.get(20)!.timestamp) * 1000).toISOString());
});

test("live defaults to the checkpoint so 'latest' cannot mean two different blocks", async () => {
  const chain = fakeChain();
  mine(chain, 25);
  await seed(chain);
  const { body } = await get(`/v1/vaults/${VAULT}/live`);
  assert.equal(body.blockNumber, "20");
});

test("reports expose gains, losses and refunds as strings", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  await seed(chain);
  const { body } = await get(`/v1/vaults/${VAULT}/reports`);
  assert.equal(body.length, 1);
  assert.equal(body[0].gain, "1234");
  assert.equal(body[0].loss, "56");
  assert.equal(body[0].totalFees, "78");
  assert.equal(body[0].totalRefunds, "9");
  assert.equal(body[0].source, "indexed");
});

test("bad input is rejected with a code, not an empty 200", async () => {
  const chain = fakeChain();
  mine(chain, 21);
  await seed(chain);

  const badAddress = await get("/v1/vaults/0x123/snapshots");
  assert.equal(badAddress.status, 400);
  assert.equal(badAddress.body.error.code, "invalid_address");

  const badLimit = await get(`/v1/vaults/${VAULT}/snapshots?limit=0`);
  assert.equal(badLimit.status, 400);
  assert.equal(badLimit.body.error.code, "invalid_limit");

  const unknown = await get("/v1/vaults/0xdead00000000000000000000000000000000dead");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, "unknown_vault");

  const noPosition = await get(`/v1/vaults/${VAULT}/positions/0xbbbb00000000000000000000000000000000bbbb`);
  assert.equal(noPosition.status, 404);
  assert.equal(noPosition.body.error.code, "no_position");

  const missingRoute = await get("/v1/nope");
  assert.equal(missingRoute.status, 404);
});