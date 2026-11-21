// Daily reconciliation: indexed numbers versus `eth_call` at a pinned block (epic 4, ticket 3).
//
// The two sides are independent by construction:
//   * `totalAssets` expected = last on-chain snapshot + Σ(reported gain − loss + refunds). Gains
//     lift `total_debt`, losses and refunds move assets, and no other event changes
//     `totalAssets` — transfers, deposits, withdrawals only shuffle idle versus supply. Fee shares
//     are burned by the vault, so they do not change `totalAssets` either (VaultV3.vy:_process_report).
//   * `totalSupply` expected = mints − burns, i.e. transfers from/to the zero address.
//
// `toleranceBps` is required, not defaulted: the caller has to state how much drift it accepts.
// Supply is compared exactly because every share is an integer and a one-wei drift is a real bug.
//
// An empty transfer history with a non-zero supply is reported as `insufficient-history` instead
// of a fake pass: the indexer cannot prove a supply it never saw minted.

import type { Pool } from "pg";
import type { RpcClient } from "./rpc.ts";

export const SELECTOR = {
  totalAssets: "0x01e1d114",
  totalSupply: "0x18160ddd",
  convertToAssets: "0x07a2d13a",
  decimals: "0x313ce567",
  asset: "0x38d52e0f",
  balanceOf: "0x70a08231",
} as const;

const ZERO = "0x0000000000000000000000000000000000000000";

export interface VaultConfig {
  chainId: number;
  vault: string;
  /** Asset symbol/address are recorded for humans; reconciliation only needs share decimals. */
  asset: string;
  shareDecimals: number;
}

export interface ReconcileConfig extends VaultConfig {
  /** Explicit drift budget in basis points. 0 means "must match exactly". */
  toleranceBps: number;
}

export interface Snapshot {
  blockNumber: bigint;
  blockHash: string;
  blockTime: Date;
  totalAssets: bigint;
  totalSupply: bigint;
  pricePerShare: bigint;
}

export interface ReconcileReport {
  status: "ok" | "drift" | "insufficient-history";
  blockNumber: bigint;
  onchain: { totalAssets: bigint; totalSupply: bigint };
  indexed: { totalAssets: bigint; totalSupply: bigint };
  deltas: { totalAssets: bigint; totalSupply: bigint; totalAssetsBps: number };
  toleranceBps: number;
  alerts: string[];
}

function decodeWord(hex: string): bigint {
  if (!hex.startsWith("0x") || hex.length < 66) throw new Error(`not an ABI word: ${hex}`);
  return BigInt(hex.slice(0, 66));
}

/** Basis points of drift, rounded up, so any non-zero drift is at least 1 bps. */
export function driftBps(indexed: bigint, onchain: bigint): number {
  if (indexed === onchain) return 0;
  const base = onchain === 0n ? 1n : onchain;
  const diff = indexed > onchain ? indexed - onchain : onchain - indexed;
  return Number((diff * 10_000n + base - 1n) / base);
}

export async function readVaultOnchain(rpc: RpcClient, cfg: VaultConfig, block: bigint): Promise<Snapshot> {
  const [totalAssetsRaw, totalSupplyRaw, priceRaw, header] = await Promise.all([
    rpc.call(cfg.vault, SELECTOR.totalAssets, block),
    rpc.call(cfg.vault, SELECTOR.totalSupply, block),
    rpc.call(cfg.vault, `${SELECTOR.convertToAssets}${(10n ** BigInt(cfg.shareDecimals)).toString(16).padStart(64, "0")}`, block),
    rpc.blockByNumber(block),
  ]);
  if (!header) throw new Error(`no header for block ${block}`);

  return {
    blockNumber: block,
    blockHash: header.hash.toLowerCase(),
    blockTime: new Date(Number(BigInt(header.timestamp)) * 1000),
    totalAssets: decodeWord(totalAssetsRaw),
    totalSupply: decodeWord(totalSupplyRaw),
    pricePerShare: decodeWord(priceRaw),
  };
}

/** Write the on-chain snapshot. Re-running at the same block refreshes it instead of failing. */
export async function recordSnapshot(pool: Pool, cfg: VaultConfig, snapshot: Snapshot): Promise<void> {
  await pool.query(
    `INSERT INTO share_price_snapshots
       (chain_id, vault_address, block_number, block_hash, block_time, total_assets, total_supply, price_per_share, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'onchain')
     ON CONFLICT (chain_id, vault_address, block_number) DO UPDATE
       SET block_hash = EXCLUDED.block_hash,
           block_time = EXCLUDED.block_time,
           total_assets = EXCLUDED.total_assets,
           total_supply = EXCLUDED.total_supply,
           price_per_share = EXCLUDED.price_per_share,
           source = EXCLUDED.source`,
    [
      cfg.chainId,
      cfg.vault.toLowerCase(),
      snapshot.blockNumber.toString(),
      snapshot.blockHash,
      snapshot.blockTime,
      snapshot.totalAssets.toString(),
      snapshot.totalSupply.toString(),
      snapshot.pricePerShare.toString(),
    ],
  );
}

export async function reconcile(pool: Pool, rpc: RpcClient, cfg: ReconcileConfig, block: bigint): Promise<ReconcileReport> {
  const vault = cfg.vault.toLowerCase();
  const onchain = await readVaultOnchain(rpc, cfg, block);

  const base = await pool.query<{ block_number: string; total_assets: string }>(
    `SELECT block_number, total_assets FROM share_price_snapshots
      WHERE chain_id = $1 AND vault_address = $2 AND source = 'onchain' AND block_number < $3
      ORDER BY block_number DESC LIMIT 1`,
    [cfg.chainId, vault, block.toString()],
  );

  const reported = await pool.query<{ gain: string; loss: string; refunds: string }>(
    `SELECT
        COALESCE((SELECT SUM(r.gain) FROM reports r
                   WHERE r.chain_id = $1 AND r.vault_address = $2 AND r.block_number > $3 AND r.block_number <= $4), 0)::text AS gain,
        COALESCE((SELECT SUM(r.loss) FROM reports r
                   WHERE r.chain_id = $1 AND r.vault_address = $2 AND r.block_number > $3 AND r.block_number <= $4), 0)::text AS loss,
        COALESCE((SELECT SUM(f.assets) FROM fees f
                   WHERE f.chain_id = $1 AND f.vault_address = $2 AND f.fee_kind = 'refund'
                     AND f.block_number > $3 AND f.block_number <= $4), 0)::text AS refunds`,
    [cfg.chainId, vault, base.rows[0]?.block_number ?? "0", block.toString()],
  );

  const baseAssets = BigInt(base.rows[0]?.total_assets ?? "0");
  const gain = BigInt(reported.rows[0]?.gain ?? "0");
  const loss = BigInt(reported.rows[0]?.loss ?? "0");
  const refunds = BigInt(reported.rows[0]?.refunds ?? "0");
  const indexedAssets = baseAssets + gain - loss + refunds;

  const movements = await pool.query<{ supply: string; rows: string }>(
    `SELECT
        -- A mint leaves the zero address (supply up), a burn enters it (supply down).
        COALESCE(SUM(CASE WHEN from_address = $3 THEN shares ELSE -shares END), 0)::text AS supply,
        count(*)::text AS rows
       FROM share_transfers
      WHERE chain_id = $1 AND vault_address = $2 AND (from_address = $3 OR to_address = $3)`,
    [cfg.chainId, vault, ZERO],
  );
  const indexedSupply = BigInt(movements.rows[0]?.supply ?? "0");
  const historyRows = Number(movements.rows[0]?.rows ?? "0");

  const assetsDrift = driftBps(indexedAssets, onchain.totalAssets);
  const supplyDrift = driftBps(indexedSupply, onchain.totalSupply);
  const alerts: string[] = [];

  if (historyRows === 0 && onchain.totalSupply > 0n) {
    alerts.push(
      "no mint/burn history indexed: supply cannot be reconciled (backfill from the deploy block)",
    );
    return {
      status: "insufficient-history",
      blockNumber: block,
      onchain: { totalAssets: onchain.totalAssets, totalSupply: onchain.totalSupply },
      indexed: { totalAssets: indexedAssets, totalSupply: indexedSupply },
      deltas: {
        totalAssets: indexedAssets - onchain.totalAssets,
        totalSupply: indexedSupply - onchain.totalSupply,
        totalAssetsBps: assetsDrift,
      },
      toleranceBps: cfg.toleranceBps,
      alerts,
    };
  }

  if (assetsDrift > cfg.toleranceBps) {
    alerts.push(
      `totalAssets drift ${assetsDrift} bps exceeds tolerance ${cfg.toleranceBps} bps ` +
        `(indexed ${indexedAssets}, onchain ${onchain.totalAssets})`,
    );
  }
  if (onchain.totalSupply !== indexedSupply) {
    alerts.push(`totalSupply mismatch: indexed ${indexedSupply}, onchain ${onchain.totalSupply}`);
  }

  return {
    status: alerts.length === 0 ? "ok" : "drift",
    blockNumber: block,
    onchain: { totalAssets: onchain.totalAssets, totalSupply: onchain.totalSupply },
    indexed: { totalAssets: indexedAssets, totalSupply: indexedSupply },
    deltas: {
      totalAssets: indexedAssets - onchain.totalAssets,
      totalSupply: indexedSupply - onchain.totalSupply,
      totalAssetsBps: assetsDrift,
    },
    toleranceBps: cfg.toleranceBps,
    alerts,
  };
}

/** Snapshot then reconcile. This is the daily job's body. */
export async function reconcileNow(pool: Pool, rpc: RpcClient, cfg: ReconcileConfig, block: bigint): Promise<ReconcileReport> {
  const report = await reconcile(pool, rpc, cfg, block);
  if (report.status !== "insufficient-history") {
    await recordSnapshot(pool, cfg, await readVaultOnchain(rpc, cfg, block));
  }
  return report;
}