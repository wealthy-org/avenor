// Connection helper for the indexer. Kept tiny on purpose: the schema is the contract, and a
// pool configured in one place is easier to reason about than options threaded through call sites.

import pg from "pg";

export type Pool = pg.Pool;

/**
 * Create a pool for `DATABASE_URL`.
 *
 * `max` is small because the indexer is a single-writer process; a large pool only hides a
 * connection leak. `application_name` makes the indexer visible in `pg_stat_activity` when
 * something holds a lock.
 */
export function createPool(connectionString: string, applicationName = "avenor-indexer"): Pool {
  return new pg.Pool({
    connectionString,
    max: 4,
    application_name: applicationName,
  });
}

export async function withTransaction<T>(pool: Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}