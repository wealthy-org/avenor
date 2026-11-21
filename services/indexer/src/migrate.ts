// Migration runner for the indexer schema.
//
// Deliberately hand-rolled instead of pulling a framework: the schema is SQL, the ordering is
// filename order, and the two properties that matter are (a) applying twice is a no-op and
// (b) an edited migration is refused rather than silently skipped. A checksum table gives both in
// ~60 lines, and there is no tool-specific state to trust.
//
// Usage:
//   DATABASE_URL=postgres://... node src/migrate.ts           apply pending migrations
//   DATABASE_URL=postgres://... node src/migrate.ts --check   exit 1 if anything is pending

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPool, withTransaction, type Pool } from "./db.ts";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface Migration {
  name: string;
  checksum: string;
  sql: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
}

function checksumOf(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export async function loadMigrations(dir: string = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const migrations: Migration[] = [];
  for (const name of files) {
    const sql = await readFile(path.join(dir, name), "utf8");
    migrations.push({ name, checksum: checksumOf(sql), sql });
  }
  return migrations;
}

/** Read applied migrations. Returns `[]` when `schema_migrations` does not exist yet. */
export async function appliedMigrations(pool: Pool): Promise<AppliedMigration[]> {
  const exists = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  );
  if (!exists.rows[0]?.exists) return [];
  const rows = await pool.query<AppliedMigration>(
    "SELECT name, checksum FROM schema_migrations ORDER BY name",
  );
  return rows.rows;
}

export async function migrate(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<Migration[]> {
  const migrations = await loadMigrations(dir);
  const applied = await appliedMigrations(pool);
  const appliedByName = new Map(applied.map((m) => [m.name, m.checksum]));

  for (const migration of migrations) {
    const previousChecksum = appliedByName.get(migration.name);
    if (previousChecksum !== undefined) {
      if (previousChecksum !== migration.checksum) {
        throw new Error(
          `migration ${migration.name} changed after being applied ` +
            `(recorded ${previousChecksum.slice(0, 12)}, file ${migration.checksum.slice(0, 12)}); ` +
            "write a new migration instead of editing history",
        );
      }
      continue;
    }

    // One transaction per migration: a failing statement leaves no half-applied table behind,
    // and the checksum row commits with the DDL it describes.
    await withTransaction(pool, async (client) => {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
    });
  }

  // `0001_init.sql` creates `schema_migrations` itself, so a fresh database has it only after the
  // first migration. Both read paths tolerate that.
  const pending = (await loadMigrations(dir)).filter((m) => !appliedByName.has(m.name));
  return pending;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required (the schema is never applied to a guessable default)");
  }
  const pool = createPool(connectionString, "avenor-indexer-migrate");
  try {
    if (process.argv.includes("--check")) {
      const applied = new Set((await appliedMigrations(pool)).map((m) => m.name));
      const pending = (await loadMigrations()).filter((m) => !applied.has(m.name));
      if (pending.length > 0) {
        console.error(`pending migrations: ${pending.map((m) => m.name).join(", ")}`);
        process.exitCode = 1;
      } else {
        console.log("schema up to date");
      }
      return;
    }
    const applied = await migrate(pool);
    console.log(applied.length === 0 ? "schema up to date" : `applied: ${applied.map((m) => m.name).join(", ")}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}