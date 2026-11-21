// Ticket 4.2 acceptance, tested against a scripted node:
//   * a 50k-block backfill completes with no gap and the cursor ends where the data ends;
//   * replaying an already-ingested range does not duplicate a row;
//   * a rate-limited request is retried, not treated as empty;
//   * a reorg rolls back derived rows, rebuilds positions, and resumes from the common ancestor;
//   * a reorg deeper than the stored window stops instead of appending to a dead chain.

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, type Pool } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";
import { DeepReorgError, ingest, readCheckpoint } from "../src/ingest.ts";
import { httpRpc } from "../src/rpc.ts";
import {
  FakeRpcServer,
  fakeChain,
  hashOf,
  mine,
  reorg,
  transferLog,
  type FakeChain,
} from "./fakeRpc.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "migrations");
const VAULT = "0xbeef00000000000000000000000000000000beef";
const ALICE = "0xaaaa00000000000000000000000000000000aaaa";
const BOB = "0xbbbb00000000000000000000000000000000bbbb";

let pool: Pool;
let server: FakeRpcServer | null = null;

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required; run `python scripts/db-test.py`");
  pool = createPool(url, "avenor-ingest-test");
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

async function startServer(chain: FakeChain): Promise<FakeRpcServer> {
  const instance = new FakeRpcServer(chain);
  await instance.start();
  server = instance;
  return instance;
}

function config(overrides: Partial<Parameters<typeof ingest>[2]> = {}) {
  return {
    chainId: 4663,
    stream: `vault:${VAULT}`,
    address: VAULT,
    deployBlock: 0n,
    confirmations: 12,
    chunkSize: 2000,
    ...overrides,
  };
}

async function count(table: string): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
  return Number(result.rows[0]?.count ?? "0");
}

test("a 50k-block backfill leaves no gap and ends at the confirmed head", async () => {
  const chain = fakeChain();
  mine(chain, 50_000);
  const block100 = chain.blocks.get(100)!;
  chain.logs.push(
    transferLog({ vault: VAULT, block: block100, blockNumber: 100, from: "0x0000000000000000000000000000000000000000", to: ALICE, shares: 1_000_000n, logIndex: 0 }),
  );
  const block45000 = chain.blocks.get(45_000)!;
  chain.logs.push(
    transferLog({ vault: VAULT, block: block45000, blockNumber: 45_000, from: ALICE, to: BOB, shares: 250_000n, logIndex: 0 }),
  );

  const node = await startServer(chain);
  const rpc = httpRpc(node.url);
  const result = await ingest(pool, rpc, config());

  // Highest block is 49_999; 12 confirmations leave 49_987 as the last safe block.
  assert.equal(result.toBlock, 49_987n);
  assert.equal(result.fromBlock, 0n);
  assert.equal(result.chunks, 25, "50_000 blocks in chunks of 2_000, last chunk partial");
  assert.equal(result.logs, 2);

  const checkpoint = await readCheckpoint(pool, 4663, `vault:${VAULT}`);
  assert.equal(checkpoint?.lastBlock, 49_987n);
  assert.equal(checkpoint?.lastBlockHash, hashOf(49_987));

  const boundaries = await pool.query<{ block_number: string }>(
    "SELECT block_number FROM ingested_blocks WHERE chain_id = 4663 ORDER BY block_number",
  );
  const numbers = boundaries.rows.map((row) => Number(row.block_number));
  assert.equal(numbers.length, 25);
  assert.equal(numbers[0], 1_999);
  assert.equal(numbers.at(-1), 49_987);
  for (let i = 1; i < numbers.length; i += 1) {
    const delta = numbers[i]! - numbers[i - 1]!;
    // Every chunk is full except the one that stops at the confirmed head.
    if (i < numbers.length - 1) assert.equal(delta, 2_000, `gap between ${numbers[i - 1]} and ${numbers[i]}`);
    else assert.ok(delta > 0 && delta <= 2_000, `last chunk delta ${delta}`);
  }

  const positions = await pool.query<{ account: string; shares: string }>(
    "SELECT account, shares FROM positions ORDER BY account",
  );
  assert.deepEqual(
    positions.rows,
    [
      { account: ALICE, shares: "750000" },
      { account: BOB, shares: "250000" },
    ],
    "positions are the running sum of share transfers; the mint from the zero address counts",
  );

  // Replaying the same range (cursor cleared, boundary rows cleared, raw logs kept) must not
  // duplicate a transfer, a position movement, or a raw event.
  await pool.query("DELETE FROM ingestion_checkpoints");
  await pool.query("DELETE FROM ingested_blocks");
  const replay = await ingest(pool, rpc, config());
  assert.equal(replay.chunks, 25);
  assert.equal(await count("raw_events"), 2);
  assert.equal(await count("share_transfers"), 2);
  const aliceAfter = await pool.query<{ shares: string }>(
    "SELECT shares FROM positions WHERE account = $1 AND vault_address = $2",
    [ALICE, VAULT],
  );
  assert.equal(aliceAfter.rows[0]?.shares, "750000");
});

test("a second run with nothing new does not re-scan or duplicate", async () => {
  const chain = fakeChain();
  mine(chain, 30);
  chain.logs.push(
    transferLog({ vault: VAULT, block: chain.blocks.get(9)!, blockNumber: 9, from: "0x0000000000000000000000000000000000000000", to: ALICE, shares: 10n, logIndex: 0 }),
    transferLog({ vault: VAULT, block: chain.blocks.get(10)!, blockNumber: 10, from: ALICE, to: BOB, shares: 5n, logIndex: 0 }),
  );
  const node = await startServer(chain);
  const rpc = httpRpc(node.url);

  await ingest(pool, rpc, config({ confirmations: 1, chunkSize: 10 }));
  const again = await ingest(pool, rpc, config({ confirmations: 1, chunkSize: 10 }));

  assert.equal(again.chunks, 0, "nothing to do below the confirmed head");
  assert.equal(again.logs, 0);
  assert.equal(await count("share_transfers"), 2, "the mint and the transfer");
});

test("a rate-limited request is retried with backoff, not read as an empty range", async () => {
  const chain = fakeChain();
  mine(chain, 5);
  chain.logs.push(
    transferLog({ vault: VAULT, block: chain.blocks.get(2)!, blockNumber: 2, from: "0x0000000000000000000000000000000000000000", to: ALICE, shares: 9n, logIndex: 0 }),
    transferLog({ vault: VAULT, block: chain.blocks.get(3)!, blockNumber: 3, from: ALICE, to: BOB, shares: 9n, logIndex: 0 }),
  );
  const node = await startServer(chain);
  node.failNext(2, 429);

  const rpc = httpRpc(node.url, { baseDelayMs: 5, attempts: 5 });
  const result = await ingest(pool, rpc, config({ confirmations: 0, chunkSize: 5 }));

  assert.equal(result.logs, 2, "both logs behind two 429 responses are still ingested");
  assert.equal(await count("share_transfers"), 2);
  assert.ok(node.calls.filter((m) => m === "eth_blockNumber").length >= 1);
});

test("a reorg rolls back to the common ancestor, rebuilds positions, and resumes", async () => {
  const chain = fakeChain();
  mine(chain, 30);
  chain.logs.push(
    transferLog({ vault: VAULT, block: chain.blocks.get(10)!, blockNumber: 10, from: "0x0000000000000000000000000000000000000000", to: ALICE, shares: 100n, logIndex: 0 }),
    transferLog({ vault: VAULT, block: chain.blocks.get(20)!, blockNumber: 20, from: ALICE, to: BOB, shares: 100n, logIndex: 0 }),
  );
  const node = await startServer(chain);
  const rpc = httpRpc(node.url);
  const cfg = config({ confirmations: 1, chunkSize: 5, reorgWindow: 8 });

  await ingest(pool, rpc, cfg);
  assert.equal(await count("share_transfers"), 2);

  // Fork at block 20: everything from there is replaced, the transfer lands at block 22.
  reorg(chain, 20, "fork-b");
  chain.logs = chain.logs.filter((log) => log.blockNumber < 20);
  chain.logs.push(
    transferLog({ vault: VAULT, block: chain.blocks.get(22)!, blockNumber: 22, from: ALICE, to: BOB, shares: 100n, logIndex: 0, txHash: "0xtx-reorged" }),
  );

  const result = await ingest(pool, rpc, cfg);

  assert.ok(result.reorg, "a reorg is reported, not hidden");
  assert.equal(result.reorg!.ancestor, 19n, "last boundary whose hash matched the node");

  const transfers = await pool.query<{ block_number: string; tx_hash: string }>(
    "SELECT block_number, tx_hash FROM share_transfers ORDER BY block_number",
  );
  assert.deepEqual(transfers.rows, [
    { block_number: "10", tx_hash: "0xtx10x0" },
    { block_number: "22", tx_hash: "0xtx-reorged" },
  ]);

  const checkpoint = await readCheckpoint(pool, 4663, `vault:${VAULT}`);
  assert.equal(checkpoint!.lastBlockHash, hashOf(28, "fork-b"));

  const alice = await pool.query<{ shares: string }>("SELECT shares FROM positions WHERE account = $1", [ALICE]);
  const bob = await pool.query<{ shares: string }>("SELECT shares FROM positions WHERE account = $1", [BOB]);
  assert.equal(alice.rows[0]?.shares, "0", "the mint remains, the old outgoing transfer is gone");
  assert.equal(bob.rows[0]?.shares, "100");
});

test("a reorg deeper than the stored window stops instead of appending", async () => {
  const chain = fakeChain();
  mine(chain, 12);
  const node = await startServer(chain);
  const rpc = httpRpc(node.url);
  const cfg = config({ confirmations: 1, chunkSize: 4, reorgWindow: 3 });

  await ingest(pool, rpc, cfg);
  const checkpointBefore = await readCheckpoint(pool, 4663, `vault:${VAULT}`);

  reorg(chain, 0, "catastrophe");

  await assert.rejects(
    () => ingest(pool, rpc, cfg),
    (error: unknown) => error instanceof DeepReorgError,
    "no stored boundary matches, so the indexer must refuse to continue",
  );

  const checkpointAfter = await readCheckpoint(pool, 4663, `vault:${VAULT}`);
  assert.equal(checkpointAfter?.lastBlock, checkpointBefore?.lastBlock, "a refused rollback does not move the cursor");
});