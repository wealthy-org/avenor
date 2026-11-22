// Read-only HTTP API in front of the indexer (epic 4, ticket 5).
//
// Every response carries `blockNumber`, `blockTimestamp` and `source`, and every integer is a
// string. Two reasons, both from the epic's boundaries:
//   * a JSON number above 2^53 silently changes value (`JSON.parse` of 538856055994280 is fine,
//     of a 78-digit supply is not), and
//   * an "indexed" number is not a final number — reorgs and the confirmation window are real, so
//     the source travels with the value instead of living in a doc comment.
//
// `live` is the only endpoint that talks to the node; it pins a block and returns `onchain`.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Pool } from "pg";
import {
  readAllocation,
  readRoles,
  readVaultOnchain,
  type Allocation,
  type Snapshot,
  type VaultConfig,
  type VaultRoles,
} from "./reconcile.ts";
import type { RpcClient } from "./rpc.ts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_LIMIT = 1_000;

export interface ApiConfig extends VaultConfig {}

export interface ApiHandle {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

class HttpError extends Error {
  // Explicit fields, not parameter properties: Node 24 strips types without transforming
  // TypeScript-only syntax, and `constructor(readonly x: T)` is precisely that.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function snapshotBody(row: {
  block_number: string | number;
  block_hash: string;
  block_time: Date | string;
  total_assets: string;
  total_supply: string;
  price_per_share: string;
  source: string;
}) {
  return {
    blockNumber: text(row.block_number),
    blockHash: row.block_hash,
    blockTimestamp: new Date(row.block_time).toISOString(),
    totalAssets: text(row.total_assets),
    totalSupply: text(row.total_supply),
    pricePerShare: text(row.price_per_share),
    source: row.source,
  };
}

function onchainBody(snapshot: Snapshot) {
  return {
    blockNumber: snapshot.blockNumber.toString(),
    blockHash: snapshot.blockHash,
    blockTimestamp: snapshot.blockTime.toISOString(),
    totalAssets: snapshot.totalAssets.toString(),
    totalSupply: snapshot.totalSupply.toString(),
    pricePerShare: snapshot.pricePerShare.toString(),
    totalIdle: snapshot.totalIdle.toString(),
    totalDebt: snapshot.totalDebt.toString(),
    performanceFeeBps: snapshot.performanceFeeBps,
    managementFeeBps: snapshot.managementFeeBps,
    depositLimit: snapshot.depositLimit.toString(),
    isPaused: snapshot.isPaused,
    isShutdown: snapshot.isShutdown,
    source: "onchain" as const,
  };
}

function rolesBody(roles: VaultRoles) {
  return {
    blockNumber: roles.blockNumber.toString(),
    blockHash: roles.blockHash,
    blockTimestamp: roles.blockTime.toISOString(),
    source: "onchain" as const,
    roleManager: roles.roleManager,
    futureRoleManager: roles.futureRoleManager,
    timelockMinDelaySeconds: roles.timelockMinDelaySeconds,
    timelockError: roles.timelockError,
  };
}

function allocationBody(allocation: Allocation) {
  return {
    blockNumber: allocation.blockNumber.toString(),
    blockHash: allocation.blockHash,
    blockTimestamp: allocation.blockTime.toISOString(),
    source: "onchain" as const,
    strategies: allocation.strategies.map((entry) => ({
      address: entry.address,
      activation: entry.activation.toString(),
      lastReport: entry.lastReport.toString(),
      currentDebt: entry.currentDebt.toString(),
      maxDebt: entry.maxDebt.toString(),
      venue: entry.venue,
      venueError: entry.venueError,
    })),
  };
}

function addressParam(raw: string): string {
  if (!ADDRESS.test(raw)) throw new HttpError(400, "invalid_address", `${raw} is not a 20-byte address`);
  return raw.toLowerCase();
}

function limitParam(raw: string | null): number {
  if (raw === null) return 100;
  if (!/^\d+$/.test(raw)) throw new HttpError(400, "invalid_limit", "limit must be a positive integer");
  const limit = Number(raw);
  if (limit < 1 || limit > MAX_LIMIT) throw new HttpError(400, "invalid_limit", `limit must be 1..${MAX_LIMIT}`);
  return limit;
}

function blockParam(raw: string | null, fallback: bigint): bigint {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new HttpError(400, "invalid_block", "block must be a decimal block number");
  return BigInt(raw);
}

async function latestCheckpoint(pool: Pool, chainId: number): Promise<bigint | null> {
  const result = await pool.query<{ block_number: string }>(
    "SELECT max(block_number)::text AS block_number FROM ingested_blocks WHERE chain_id = $1",
    [chainId],
  );
  const value = result.rows[0]?.block_number;
  return value === null || value === undefined ? null : BigInt(value);
}

async function route(pool: Pool, rpc: RpcClient | null, cfg: ApiConfig, request: IncomingMessage): Promise<unknown> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed", "only GET is served");
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/health") {
    const block = await latestCheckpoint(pool, cfg.chainId);
    return { ok: true, chainId: cfg.chainId, checkpoint: block === null ? null : block.toString() };
  }

  if (parts[0] !== "v1" || parts[1] !== "vaults" || parts.length < 3) {
    throw new HttpError(404, "not_found", `no route for ${url.pathname}`);
  }

  const vault = addressParam(parts[2]!);
  const resource = parts[3];

  if (resource === undefined) {
    const result = await pool.query(
      `SELECT address, name, symbol, asset_address, asset_decimals, share_decimals,
              role_manager, accountant, deposit_limit::text, deployed_block::text, source
         FROM vaults WHERE chain_id = $1 AND address = $2`,
      [cfg.chainId, vault],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "unknown_vault", `${vault} is not indexed`);
    return { ...row, depositLimit: row.deposit_limit, deployedBlock: row.deployed_block };
  }

  if (resource === "snapshots") {
    const limit = limitParam(url.searchParams.get("limit"));
    const result = await pool.query(
      `SELECT block_number::text, block_hash, block_time, total_assets::text, total_supply::text,
              price_per_share::text, source
         FROM share_price_snapshots
        WHERE chain_id = $1 AND vault_address = $2
        ORDER BY block_number DESC LIMIT $3`,
      [cfg.chainId, vault, limit],
    );
    if (result.rowCount === 0) throw new HttpError(404, "no_snapshots", `no snapshot for ${vault}`);
    return result.rows.map(snapshotBody);
  }

  if (resource === "positions") {
    const account = parts[4];
    if (!account) throw new HttpError(400, "missing_account", "positions require an account");
    const owner = addressParam(account);
    const result = await pool.query(
      `SELECT account, shares::text, first_seen_block::text, last_activity_block::text
         FROM positions WHERE chain_id = $1 AND vault_address = $2 AND account = $3`,
      [cfg.chainId, vault, owner],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "no_position", `${owner} has no indexed position in ${vault}`);
    return {
      account: row.account,
      shares: row.shares,
      firstSeenBlock: row.first_seen_block,
      lastActivityBlock: row.last_activity_block,
      source: "indexed" as const,
    };
  }

  if (resource === "reports") {
    const limit = limitParam(url.searchParams.get("limit"));
    const result = await pool.query(
      `SELECT block_number::text, block_hash, block_time, tx_hash, gain::text, loss::text,
              total_fees::text, total_refunds::text
         FROM reports WHERE chain_id = $1 AND vault_address = $2
        ORDER BY block_number DESC, log_index DESC LIMIT $3`,
      [cfg.chainId, vault, limit],
    );
    return result.rows.map((row) => ({
      blockNumber: row.block_number,
      blockHash: row.block_hash,
      blockTimestamp: new Date(row.block_time).toISOString(),
      txHash: row.tx_hash,
      gain: row.gain,
      loss: row.loss,
      totalFees: row.total_fees,
      totalRefunds: row.total_refunds,
      source: "indexed" as const,
    }));
  }

  if (resource === "fees") {
    const limit = limitParam(url.searchParams.get("limit"));
    const result = await pool.query(
      `SELECT block_number::text, block_hash, block_time, tx_hash, fee_kind, recipient,
              shares::text, assets::text
         FROM fees WHERE chain_id = $1 AND vault_address = $2
        ORDER BY block_number DESC, log_index DESC LIMIT $3`,
      [cfg.chainId, vault, limit],
    );
    return result.rows.map((row) => ({
      blockNumber: row.block_number,
      blockHash: row.block_hash,
      blockTimestamp: new Date(row.block_time).toISOString(),
      txHash: row.tx_hash,
      kind: row.fee_kind,
      recipient: row.recipient,
      shares: row.shares,
      assets: row.assets,
      source: "indexed" as const,
    }));
  }

  if (resource === "role-events") {
    const limit = limitParam(url.searchParams.get("limit"));
    const result = await pool.query(
      `SELECT block_number::text, block_hash, block_time, tx_hash, account, role_bit, granted
         FROM role_events WHERE chain_id = $1 AND vault_address = $2
        ORDER BY block_number DESC, log_index DESC LIMIT $3`,
      [cfg.chainId, vault, limit],
    );
    return result.rows.map((row) => ({
      blockNumber: row.block_number,
      blockHash: row.block_hash,
      blockTimestamp: new Date(row.block_time).toISOString(),
      txHash: row.tx_hash,
      account: row.account,
      roleBit: row.role_bit,
      granted: row.granted,
      source: "indexed" as const,
    }));
  }

  if (resource === "live") {
    if (!rpc) throw new HttpError(503, "no_rpc", "this API was started without an RPC client");
    const checkpoint = await latestCheckpoint(pool, cfg.chainId);
    const block = blockParam(url.searchParams.get("block"), checkpoint ?? (await rpc.blockNumber()));
    return onchainBody(await readVaultOnchain(rpc, cfg, block));
  }

  if (resource === "roles") {
    if (!rpc) throw new HttpError(503, "no_rpc", "this API was started without an RPC client");
    const checkpoint = await latestCheckpoint(pool, cfg.chainId);
    const block = blockParam(url.searchParams.get("block"), checkpoint ?? (await rpc.blockNumber()));
    return rolesBody(await readRoles(rpc, cfg, block));
  }

  if (resource === "allocation") {
    if (!rpc) throw new HttpError(503, "no_rpc", "this API was started without an RPC client");
    const checkpoint = await latestCheckpoint(pool, cfg.chainId);
    const block = blockParam(url.searchParams.get("block"), checkpoint ?? (await rpc.blockNumber()));
    return allocationBody(await readAllocation(rpc, cfg, block));
  }

  throw new HttpError(404, "not_found", `no route for ${url.pathname}`);
}

export async function startApi(options: {
  pool: Pool;
  config: ApiConfig;
  rpc?: RpcClient | null;
  port?: number;
}): Promise<ApiHandle> {
  const { pool, config, rpc = null, port = 0 } = options;

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      try {
        const data = await route(pool, rpc, config, request);
        const body = JSON.stringify(data);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(body);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const payload =
          error instanceof HttpError
            ? { error: { code: error.code, message: error.message } }
            : { error: { code: "internal", message: error instanceof Error ? error.message : "unknown" } };
        response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(payload));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind to a port");

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}