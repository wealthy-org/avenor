// Chain-event ingestion with reorg detection (epic 4, ticket 2).
//
// The contract with the rest of the system:
//   * every write is keyed by `(chain_id, tx_hash, log_index)` or `(chain_id, stream, block_number)`,
//     so replaying a range is a no-op rather than a duplicate;
//   * the checkpoint is advanced only inside the same transaction as the rows for that chunk, so a
//     crash leaves the cursor at the last fully-written chunk;
//   * before continuing, the hash the checkpoint recorded is compared with the node's hash for the
//     same block. A mismatch triggers a rollback to the newest stored block whose hash still
//     matches. If no stored block within `reorgWindow` matches, ingestion stops loudly instead of
//     writing on top of a chain that no longer exists.

import type { Pool, PoolClient } from "pg";
import { withTransaction } from "./db.ts";
import {
  roleBitDiff,
  topic0,
  tryDecodeDeposit,
  tryDecodeReport,
  tryDecodeRoleSet,
  tryDecodeStrategyChange,
  tryDecodeTransfer,
  tryDecodeWithdraw,
  word,
  TOPIC,
} from "./decode.ts";
import type { RpcClient, RpcLog } from "./rpc.ts";

export interface StreamConfig {
  chainId: number;
  /** Checkpoint namespace, e.g. `vault:0xbeef…`. One cursor per stream. */
  stream: string;
  /** Contract whose logs are ingested. */
  address: string;
  deployBlock: bigint;
  /** Blocks behind head that are treated as final. Chain 4663 is an Orbit chain; 12 is the default. */
  confirmations?: number;
  chunkSize?: number;
  /** How far back a rollback is willing to look for a common ancestor. */
  reorgWindow?: number;
}

export interface IngestResult {
  fromBlock: bigint;
  toBlock: bigint;
  chunks: number;
  logs: number;
  reorg: null | { ancestor: bigint; rolledBackTo: bigint };
}

export class DeepReorgError extends Error {
  constructor(stream: string, window: number) {
    super(
      `reorg deeper than ${window} blocks on stream ${stream}: no stored block hash matched the node; ` +
        "refusing to append. Re-backfill from the deploy block after inspecting the chain.",
    );
    this.name = "DeepReorgError";
  }
}

interface Checkpoint {
  lastBlock: bigint;
  lastBlockHash: string;
}

export async function readCheckpoint(pool: Pool, chainId: number, stream: string): Promise<Checkpoint | null> {
  const result = await pool.query<{ last_block: string; last_block_hash: string }>(
    "SELECT last_block, last_block_hash FROM ingestion_checkpoints WHERE chain_id = $1 AND stream = $2",
    [chainId, stream],
  );
  const row = result.rows[0];
  return row ? { lastBlock: BigInt(row.last_block), lastBlockHash: row.last_block_hash } : null;
}

async function writeCheckpoint(
  client: PoolClient,
  cfg: StreamConfig,
  block: bigint,
  hash: string,
  confirmations: number,
): Promise<void> {
  await client.query(
    `INSERT INTO ingestion_checkpoints (chain_id, stream, last_block, last_block_hash, confirmations, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (chain_id, stream) DO UPDATE
       SET last_block = EXCLUDED.last_block,
           last_block_hash = EXCLUDED.last_block_hash,
           confirmations = EXCLUDED.confirmations,
           updated_at = now()`,
    [cfg.chainId, cfg.stream, block.toString(), hash, confirmations],
  );
}

/** Record a boundary hash so a later run can find a common ancestor without re-reading every block. */
async function recordBoundary(
  client: PoolClient,
  cfg: StreamConfig,
  block: bigint,
  hash: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ingested_blocks (chain_id, stream, block_number, block_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (chain_id, stream, block_number) DO UPDATE SET block_hash = EXCLUDED.block_hash`,
    [cfg.chainId, cfg.stream, block.toString(), hash],
  );
}

async function storeRawEvent(client: PoolClient, cfg: StreamConfig, log: RpcLog, blockTime: Date): Promise<boolean> {
  const txHash = log.transactionHash.toLowerCase();
  const result = await client.query(
    `INSERT INTO raw_events
       (chain_id, block_number, block_hash, block_time, tx_hash, log_index, address, topic0, topics, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
    [
      cfg.chainId,
      log.blockNumber.toString(),
      log.blockHash.toLowerCase(),
      blockTime,
      txHash,
      log.logIndex,
      log.address.toLowerCase(),
      topic0(log),
      log.topics.map((t) => t.toLowerCase()),
      log.data.toLowerCase(),
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

async function applyLog(client: PoolClient, cfg: StreamConfig, log: RpcLog, blockTime: Date): Promise<void> {
  const chainId = cfg.chainId;
  const vault = cfg.address.toLowerCase();
  const blockNumber = log.blockNumber.toString();
  const txHash = log.transactionHash.toLowerCase();

  const transfer = tryDecodeTransfer(log);
  if (transfer) {
    await client.query(
      `INSERT INTO share_transfers
         (chain_id, vault_address, block_number, block_hash, tx_hash, log_index, from_address, to_address, shares)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
      [chainId, vault, blockNumber, log.blockHash.toLowerCase(), txHash, log.logIndex, transfer.from, transfer.to, transfer.shares.toString()],
    );

    // Positions are a running balance, not a second source of truth: recompute both sides from
    // `share_transfers` so a replayed or rolled-back log can never leave a stale number behind.
    // The zero address is supply, not a holder: a mint has no sender balance and a burn has no
    // receiver balance, so including it would store a negative position (and it is not withdrawable).
    const zero = "0x0000000000000000000000000000000000000000";
    for (const account of new Set([transfer.from, transfer.to])) {
      if (account === zero) continue;
      const balance = await client.query<{ shares: string }>(
        `SELECT COALESCE(SUM(CASE WHEN to_address = $3 THEN shares ELSE -shares END), 0)::text AS shares
           FROM share_transfers WHERE chain_id = $1 AND vault_address = $2 AND (from_address = $3 OR to_address = $3)`,
        [chainId, vault, account],
      );
      await client.query(
        `INSERT INTO positions (chain_id, vault_address, account, shares, first_seen_block, last_activity_block)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (chain_id, vault_address, account) DO UPDATE
           SET shares = EXCLUDED.shares,
               last_activity_block = GREATEST(positions.last_activity_block, EXCLUDED.last_activity_block),
               updated_at = now()`,
        [chainId, vault, account, balance.rows[0]?.shares ?? "0", blockNumber],
      );
    }
    return;
  }

  const deposit = tryDecodeDeposit(log);
  if (deposit) {
    await client.query(
      `INSERT INTO deposits
         (chain_id, vault_address, block_number, block_hash, block_time, tx_hash, log_index, sender, owner, assets, shares)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
      [chainId, vault, blockNumber, log.blockHash.toLowerCase(), blockTime, txHash, log.logIndex, deposit.sender, deposit.owner, deposit.assets.toString(), deposit.shares.toString()],
    );
    return;
  }

  const withdraw = tryDecodeWithdraw(log);
  if (withdraw) {
    await client.query(
      `INSERT INTO withdrawals
         (chain_id, vault_address, block_number, block_hash, block_time, tx_hash, log_index, sender, receiver, owner, assets, shares)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
      [chainId, vault, blockNumber, log.blockHash.toLowerCase(), blockTime, txHash, log.logIndex, withdraw.sender, withdraw.receiver, withdraw.owner, withdraw.assets.toString(), withdraw.shares.toString()],
    );
    return;
  }

  const report = tryDecodeReport(log);
  if (report) {
    await client.query(
      `INSERT INTO reports
         (chain_id, vault_address, strategy_address, block_number, block_hash, block_time, tx_hash, log_index,
          gain, loss, total_fees, total_refunds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
      [
        chainId,
        vault,
        report.strategy,
        blockNumber,
        log.blockHash.toLowerCase(),
        blockTime,
        txHash,
        log.logIndex,
        report.gain.toString(),
        report.loss.toString(),
        report.totalFees.toString(),
        report.totalRefunds.toString(),
      ],
    );

    // The event reports fees in assets (`total_fees`), and the protocol slice of it in assets as
    // well (VaultV3.vy:1355 divides `total_fees` by MAX_BPS). Recording them as assets is not an
    // assumption; it is what the contract emits.
    if (report.totalFees > 0n) {
      await client.query(
        `INSERT INTO fees
           (chain_id, vault_address, strategy_address, block_number, block_hash, block_time, tx_hash, log_index,
            fee_kind, recipient, assets)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'performance', NULL, $9)
         ON CONFLICT (chain_id, tx_hash, log_index, fee_kind) DO NOTHING`,
        [chainId, vault, report.strategy, blockNumber, log.blockHash.toLowerCase(), blockTime, txHash, log.logIndex, report.totalFees.toString()],
      );
    }
    if (report.protocolFees > 0n) {
      await client.query(
        `INSERT INTO fees
           (chain_id, vault_address, strategy_address, block_number, block_hash, block_time, tx_hash, log_index,
            fee_kind, recipient, assets)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'protocol', NULL, $9)
         ON CONFLICT (chain_id, tx_hash, log_index, fee_kind) DO NOTHING`,
        [chainId, vault, report.strategy, blockNumber, log.blockHash.toLowerCase(), blockTime, txHash, log.logIndex, report.protocolFees.toString()],
      );
    }
    if (report.totalRefunds > 0n) {
      await client.query(
        `INSERT INTO fees
           (chain_id, vault_address, strategy_address, block_number, block_hash, block_time, tx_hash, log_index,
            fee_kind, recipient, assets)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'refund', NULL, $9)
         ON CONFLICT (chain_id, tx_hash, log_index, fee_kind) DO NOTHING`,
        [chainId, vault, report.strategy, blockNumber, log.blockHash.toLowerCase(), blockTime, txHash, log.logIndex, report.totalRefunds.toString()],
      );
    }
    return;
  }

  const change = tryDecodeStrategyChange(log);
  if (change) {
    if (change.changeType === 0) {
      await client.query(
        `INSERT INTO strategies (chain_id, vault_address, address, added_block, added_tx_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (chain_id, vault_address, address) DO UPDATE
           SET is_active = true, removed_block = NULL, removed_tx_hash = NULL`,
        [chainId, vault, change.strategy, blockNumber, txHash],
      );
    } else {
      await client.query(
        `INSERT INTO strategies (chain_id, vault_address, address, added_block, is_active, removed_block, removed_tx_hash)
         VALUES ($1, $2, $3, $4, false, $4, $5)
         ON CONFLICT (chain_id, vault_address, address) DO UPDATE
           SET is_active = false, removed_block = EXCLUDED.removed_block, removed_tx_hash = EXCLUDED.removed_tx_hash`,
        [chainId, vault, change.strategy, blockNumber, txHash],
      );
    }
    return;
  }

  const roleSet = tryDecodeRoleSet(log);
  if (roleSet) {
    const previous = await client.query<{ bitmap: string }>(
      "SELECT bitmap FROM role_state WHERE chain_id = $1 AND vault_address = $2 AND account = $3",
      [chainId, vault, roleSet.account],
    );
    const before = previous.rows[0] ? BigInt(previous.rows[0].bitmap) : 0n;

    for (const { bit, granted } of roleBitDiff(before, roleSet.bitmap)) {
      await client.query(
        `INSERT INTO role_events
           (chain_id, vault_address, account, role_bit, granted, block_number, block_hash, block_time, tx_hash, log_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (chain_id, tx_hash, log_index, role_bit) DO NOTHING`,
        [chainId, vault, roleSet.account, bit, granted, blockNumber, log.blockHash.toLowerCase(), blockTime, txHash, log.logIndex],
      );
    }
    // Store the bitmap itself so the diff is reproducible; the per-bit rows above are for querying.
    await client.query(
      `INSERT INTO role_state (chain_id, vault_address, account, bitmap, updated_block)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (chain_id, vault_address, account) DO UPDATE
         SET bitmap = EXCLUDED.bitmap, updated_block = EXCLUDED.updated_block`,
      [chainId, vault, roleSet.account, roleSet.bitmap.toString(), blockNumber],
    );
    return;
  }

  // Catalogue events: the value is the first data word for a single-argument setter.
  const t0 = topic0(log);
  if (t0 === TOPIC.UpdateDepositLimit || t0 === TOPIC.UpdatePaused || t0 === TOPIC.UpdateAccountant) {
    const value = word(log.data, 0);
    // The catalogue row is written by the vault snapshot job (ticket 3), not invented from an
    // event: an UPDATE that affects zero rows is the honest outcome when the vault is not yet
    // catalogued, and it cannot create a row with empty asset metadata.
    if (t0 === TOPIC.UpdateDepositLimit) {
      await client.query(
        "UPDATE vaults SET deposit_limit = $3, updated_at = now() WHERE chain_id = $1 AND address = $2",
        [chainId, vault, value.toString()],
      );
    } else if (t0 === TOPIC.UpdateAccountant) {
      await client.query(
        "UPDATE vaults SET accountant = $3, updated_at = now() WHERE chain_id = $1 AND address = $2",
        [chainId, vault, `0x${log.data.slice(26, 66).toLowerCase()}`],
      );
    }
    // `UpdatePaused` needs no column yet: the pause state is a reconciliation input, not a time series.
  }
}

async function rollback(
  pool: Pool,
  rpc: RpcClient,
  cfg: StreamConfig,
  window: number,
): Promise<{ ancestor: bigint; rolledBackTo: bigint }> {
  const boundaries = await pool.query<{ block_number: string; block_hash: string }>(
    `SELECT block_number, block_hash FROM ingested_blocks
      WHERE chain_id = $1 AND stream = $2 ORDER BY block_number DESC LIMIT $3`,
    [cfg.chainId, cfg.stream, window],
  );

  let ancestor: { block: bigint; hash: string } | null = null;
  for (const row of boundaries.rows) {
    const block = BigInt(row.block_number);
    const nodeBlock = await rpc.blockByNumber(block);
    if (nodeBlock && nodeBlock.hash.toLowerCase() === row.block_hash.toLowerCase()) {
      ancestor = { block, hash: nodeBlock.hash.toLowerCase() };
      break;
    }
  }
  if (!ancestor) throw new DeepReorgError(cfg.stream, window);

  const rolledBackTo = await withTransaction(pool, async (client) => {
    const block = ancestor!.block.toString();
    const chain = [cfg.chainId];
    const del = (sql: string) => client.query(sql, [chain[0], cfg.address.toLowerCase(), block]);
    await del("DELETE FROM share_transfers WHERE chain_id = $1 AND vault_address = $2 AND block_number > $3");
    await del("DELETE FROM deposits WHERE chain_id = $1 AND vault_address = $2 AND block_number > $3");
    await del("DELETE FROM withdrawals WHERE chain_id = $1 AND vault_address = $2 AND block_number > $3");
    await del("DELETE FROM reports WHERE chain_id = $1 AND vault_address = $2 AND block_number > $3");
    await del("DELETE FROM fees WHERE chain_id = $1 AND vault_address = $2 AND block_number > $3");
    await del("DELETE FROM role_events WHERE chain_id = $1 AND vault_address = $2 AND block_number > $3");
    await client.query("DELETE FROM raw_events WHERE chain_id = $1 AND address = $2 AND block_number > $3", [
      cfg.chainId,
      cfg.address.toLowerCase(),
      block,
    ]);
    await client.query("DELETE FROM ingested_blocks WHERE chain_id = $1 AND stream = $2 AND block_number > $3", [
      cfg.chainId,
      cfg.stream,
      block,
    ]);

    // Positions are derived; rebuild the ones that touch this vault rather than trying to invert
    // deleted rows.
    await client.query(
      `INSERT INTO positions (chain_id, vault_address, account, shares, first_seen_block, last_activity_block)
       SELECT $1, $2, account, SUM(delta), MIN(block_number), MAX(block_number)
         FROM (
           SELECT from_address AS account, -shares AS delta, block_number FROM share_transfers
            WHERE chain_id = $1 AND vault_address = $2
           UNION ALL
           SELECT to_address AS account, shares AS delta, block_number FROM share_transfers
            WHERE chain_id = $1 AND vault_address = $2
         ) movements
        WHERE account <> '0x0000000000000000000000000000000000000000'
        GROUP BY account
       ON CONFLICT (chain_id, vault_address, account) DO UPDATE
         SET shares = EXCLUDED.shares,
             first_seen_block = EXCLUDED.first_seen_block,
             last_activity_block = EXCLUDED.last_activity_block,
             updated_at = now()`,
      [cfg.chainId, cfg.address.toLowerCase()],
    );

    await writeCheckpoint(client, cfg, ancestor!.block, ancestor!.hash, cfg.confirmations ?? 12);
    return ancestor!.block;
  });

  return { ancestor: ancestor.block, rolledBackTo };
}

export async function ingest(pool: Pool, rpc: RpcClient, cfg: StreamConfig): Promise<IngestResult> {
  const confirmations = cfg.confirmations ?? 12;
  const chunkSize = BigInt(cfg.chunkSize ?? 2_000);
  const reorgWindow = cfg.reorgWindow ?? 64;

  const checkpoint = await readCheckpoint(pool, cfg.chainId, cfg.stream);
  let reorg: IngestResult["reorg"] = null;

  if (checkpoint) {
    const nodeBlock = await rpc.blockByNumber(checkpoint.lastBlock);
    if (!nodeBlock || nodeBlock.hash.toLowerCase() !== checkpoint.lastBlockHash.toLowerCase()) {
      const result = await rollback(pool, rpc, cfg, reorgWindow);
      reorg = { ancestor: result.ancestor, rolledBackTo: result.rolledBackTo };
    }
  }

  const head = await rpc.blockNumber();
  const safeHead = head - BigInt(confirmations);
  const current = await readCheckpoint(pool, cfg.chainId, cfg.stream);
  const start = current ? current.lastBlock + 1n : cfg.deployBlock;

  if (safeHead < start) {
    return { fromBlock: start, toBlock: start - 1n, chunks: 0, logs: 0, reorg };
  }

  let logs = 0;
  let chunks = 0;
  let cursor = start;

  while (cursor <= safeHead) {
    const to = cursor + chunkSize - 1n > safeHead ? safeHead : cursor + chunkSize - 1n;
    const batch = await rpc.getLogs({ address: cfg.address, fromBlock: cursor, toBlock: to });

    // One header per chunk: its timestamp is the block time for every log in the chunk, and its
    // hash is both the boundary for reorg rollback and the checkpoint value.
    const boundary = await rpc.blockByNumber(to);
    if (!boundary) throw new Error(`block ${to} disappeared while ingesting ${cfg.stream}`);
    const blockTime = new Date(Number(BigInt(boundary.timestamp)) * 1000);

    await withTransaction(pool, async (client) => {
      for (const log of batch) {
        if (log.removed) {
          throw new Error(`node returned a removed log at block ${log.blockNumber}; treat as reorg and retry later`);
        }
        const inserted = await storeRawEvent(client, cfg, log, blockTime);
        // A duplicate raw event means this chunk was already applied; skip its derived writes so a
        // replay cannot double-count a fee or a position movement.
        if (inserted) await applyLog(client, cfg, log, blockTime);
      }

      await recordBoundary(client, cfg, to, boundary.hash.toLowerCase());
      await writeCheckpoint(client, cfg, to, boundary.hash.toLowerCase(), confirmations);
    });

    logs += batch.length;
    chunks += 1;
    cursor = to + 1n;
  }

  return { fromBlock: start, toBlock: cursor - 1n, chunks, logs, reorg };
}

async function blockTimestamp(rpc: RpcClient, block: bigint): Promise<Date> {
  const header = await rpc.blockByNumber(block);
  if (!header) throw new Error(`no header for block ${block}`);
  return new Date(Number(BigInt(header.timestamp)) * 1000);
}