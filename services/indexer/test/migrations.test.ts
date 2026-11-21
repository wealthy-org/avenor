// Ticket 4.1 acceptance: "migrasi jalan dari kosong; constraint mencegah duplikat event;
// checkpoint memungkinkan resume."
//
// These tests run against a real Postgres, not a mock: the properties under test are SQL
// constraints and DDL semantics, and a fake would only test the fake. `scripts/db-test.py` starts
// a throwaway cluster and exports TEST_DATABASE_URL; the suite refuses to run against a database
// whose name does not end in `_test` because it drops the public schema.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, type Pool } from "../src/db.ts";
import { migrate, appliedMigrations } from "../src/migrate.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "migrations");

let pool: Pool;

const EXPECTED_TABLES = [
  "fees",
  "ingested_blocks",
  "ingestion_checkpoints",
  "positions",
  "raw_events",
  "reports",
  "role_events",
  "role_state",
  "schema_migrations",
  "share_price_snapshots",
  "share_transfers",
  "strategies",
  "vaults",
  "venue_snapshots",
];

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required; run `python scripts/db-test.py`");
  pool = createPool(url, "avenor-indexer-test");

  const name = await pool.query<{ name: string }>("SELECT current_database() AS name");
  if (!name.rows[0]?.name.endsWith("_test")) {
    throw new Error(`refusing to drop schema of database ${name.rows[0]?.name}; expected a *_test database`);
  }

  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
});

after(async () => {
  await pool?.end();
});

test("migrations apply from an empty database and applying again is a no-op", async () => {
  const first = await migrate(pool, MIGRATIONS);
  assert.equal(first.length, 1, "one migration applied");
  assert.match(first[0]!.name, /^0001_/);

  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  assert.deepEqual(
    tables.rows.map((r) => r.table_name),
    EXPECTED_TABLES,
    "every table from the ticket exists, and nothing else",
  );

  const second = await migrate(pool, MIGRATIONS);
  assert.equal(second.length, 0, "second run applies nothing");
  assert.equal((await appliedMigrations(pool)).length, 1);
});

test("a duplicate event is refused by the primary key, not silently overwritten", async () => {
  const insert = `INSERT INTO raw_events
      (chain_id, block_number, block_hash, block_time, tx_hash, log_index, address, topic0, topics, data)
    VALUES (4663, 118337511, '0xabc', to_timestamp(1795103654), '0xtx', 7, '0xvault', '0xtopic', ARRAY['0xtopic'], '0x')`;

  await pool.query(insert);
  await assert.rejects(
    () => pool.query(insert),
    (error: { code?: string }) => error.code === "23505",
    "second insert of the same (chain_id, tx_hash, log_index) must violate the primary key",
  );
});

test("a duplicate share price snapshot at the same block is refused", async () => {
  const insert = `INSERT INTO share_price_snapshots
      (chain_id, vault_address, block_number, block_hash, block_time,
       total_assets, total_supply, price_per_share, source)
    VALUES (4663, '0xvault', 118337511, '0xabc', to_timestamp(1795103654), 1, 1, 1, 'onchain')`;

  await pool.query(insert);
  await assert.rejects(
    () => pool.query(insert),
    (error: { code?: string }) => error.code === "23505",
  );
});

test("a negative position is refused (numeric, not float, and a check constraint)", async () => {
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO positions (chain_id, vault_address, account, shares, first_seen_block, last_activity_block)
         VALUES (4663, '0xvault', '0xuser', -1, 1, 1)`,
      ),
    (error: { code?: string }) => error.code === "23514",
  );
});

test("an unknown fee kind is refused", async () => {
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO fees (chain_id, vault_address, block_number, block_hash, block_time,
                           tx_hash, log_index, fee_kind, shares)
         VALUES (4663, '0xvault', 1, '0xabc', to_timestamp(1), '0xfeetx', 0, 'made_up', 1)`,
      ),
    (error: { code?: string }) => error.code === "23514",
  );
});

test("a checkpoint resumes from the last committed block and hash", async () => {
  await pool.query(
    `INSERT INTO ingestion_checkpoints (chain_id, stream, last_block, last_block_hash)
     VALUES (4663, 'vault:0xvault', 118337500, '0xhash-a')`,
  );
  await pool.query(
    `UPDATE ingestion_checkpoints SET last_block = 118337511, last_block_hash = '0xhash-b',
            updated_at = now()
      WHERE chain_id = 4663 AND stream = 'vault:0xvault'`,
  );

  const resumed = await pool.query<{ last_block: string; last_block_hash: string }>(
    `SELECT last_block, last_block_hash FROM ingestion_checkpoints
      WHERE chain_id = 4663 AND stream = 'vault:0xvault'`,
  );
  assert.equal(resumed.rows[0]?.last_block, "118337511");
  assert.equal(resumed.rows[0]?.last_block_hash, "0xhash-b");

  // The primary key is (chain_id, stream), so a second stream cannot share the cursor.
  await pool.query(
    `INSERT INTO ingestion_checkpoints (chain_id, stream, last_block, last_block_hash)
     VALUES (4663, 'venue:0xvenue', 0, '0x0')`,
  );
  const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM ingestion_checkpoints");
  assert.equal(count.rows[0]?.count, "2");
});

test("editing an applied migration is refused instead of skipped", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "avenor-migrations-"));
  for (const file of await readdir(MIGRATIONS)) {
    await copyFile(path.join(MIGRATIONS, file), path.join(dir, file));
  }

  // Fresh database so the checksum history starts empty.
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(pool, dir);

  const target = path.join(dir, "0001_init.sql");
  const original = await readFile(target, "utf8");
  await writeFile(target, `${original}\n-- edited after apply\n`, "utf8");

  await assert.rejects(
    () => migrate(pool, dir),
    /changed after being applied/,
    "a checksum mismatch must fail loudly, not silently skip or re-run",
  );
});