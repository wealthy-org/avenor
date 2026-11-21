// Read path for the vault. Every number here comes from `eth_call` and is returned together with
// the block it was read at, so a caller cannot accidentally mix two blocks in one screen.

import type { Address, PublicClient } from "viem";
import { vaultV3Abi } from "./abi/vault.ts";

export interface VaultState {
  vault: Address;
  /** Block the numbers below describe. */
  blockNumber: bigint;
  blockTimestamp: Date;
  source: "onchain";
  asset: Address;
  totalAssets: bigint;
  totalIdle: bigint;
  totalDebt: bigint;
  totalSupply: bigint;
  unlockedShares: bigint;
  /** Vault's own price per share in asset units per 1e18 shares. */
  pricePerShare: bigint;
  depositLimit: bigint;
  minimumTotalIdle: bigint;
  autoAllocate: boolean;
  /** `deposit_limit` may be replaced by a deposit hook; this is the hook's current ceiling. */
  maxDepositFor: (receiver: Address) => Promise<bigint>;
  isPaused: boolean;
  isShutdown: boolean;
}

/** The vault's total idle asset balance — real cash, not a promise. */
export async function readIdleAssets(client: PublicClient, vault: Address, blockNumber?: bigint): Promise<bigint> {
  return client.readContract({
    address: vault,
    abi: vaultV3Abi,
    functionName: "totalIdle",
    blockNumber,
  });
}

/**
 * Liquidity is reported as two separate numbers on purpose.
 *
 * `maxWithdraw` is the vault's answer, and with a single illiquid venue it can be `0` while idle
 * cash is positive (docs/WITHDRAWAL_SEMANTICS.md). A UI that renders `maxWithdraw` as "available
 * now" will tell a user with 27k idle USDG that nothing is withdrawable; a UI that renders idle as
 * "available now" will overpromise by the venue's share. Label both, never merge them.
 */
export interface Liquidity {
  blockNumber: bigint;
  totalIdle: bigint;
  maxWithdraw: bigint;
  maxRedeem: bigint;
}

export async function readLiquidity(
  client: PublicClient,
  vault: Address,
  owner: Address,
  blockNumber?: bigint,
): Promise<Liquidity> {
  const [totalIdle, maxWithdraw, maxRedeem] = await Promise.all([
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "totalIdle", blockNumber }),
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "maxWithdraw", args: [owner], blockNumber }),
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "maxRedeem", args: [owner], blockNumber }),
  ]);
  return { blockNumber: blockNumber ?? (await client.getBlockNumber()), totalIdle, maxWithdraw, maxRedeem };
}

export async function readVaultState(client: PublicClient, vault: Address, blockNumber?: bigint): Promise<VaultState> {
  const block = blockNumber ?? (await client.getBlockNumber());
  const [header, asset, totals] = await Promise.all([
    client.getBlock({ blockNumber: block }),
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "asset", blockNumber: block }),
    Promise.all([
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "totalAssets", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "totalIdle", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "totalDebt", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "totalSupply", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "unlockedShares", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "pricePerShare", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "deposit_limit", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "minimum_total_idle", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "isPaused", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "isShutdown", blockNumber: block }),
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "auto_allocate", blockNumber: block }),
    ]),
  ]);
  const [totalAssets, totalIdle, totalDebt, totalSupply, unlockedShares, pricePerShare, depositLimit, minimumTotalIdle, isPaused, isShutdown, autoAllocate] = totals;

  return {
    vault,
    blockNumber: block,
    blockTimestamp: new Date(Number(header.timestamp) * 1000),
    source: "onchain",
    asset,
    totalAssets,
    totalIdle,
    totalDebt,
    totalSupply,
    unlockedShares,
    pricePerShare,
    depositLimit,
    minimumTotalIdle,
    autoAllocate,
    maxDepositFor: async (receiver) =>
      client.readContract({ address: vault, abi: vaultV3Abi, functionName: "maxDeposit", args: [receiver], blockNumber: block }),
    isPaused,
    isShutdown,
  };
}

/** A user's share balance and the asset value of it, at one block. */
export interface Position {
  blockNumber: bigint;
  shares: bigint;
  /** `convertToAssets(shares)` — value, not liquidity. */
  assets: bigint;
}

export async function readPosition(
  client: PublicClient,
  vault: Address,
  owner: Address,
  blockNumber?: bigint,
): Promise<Position> {
  const block = blockNumber ?? (await client.getBlockNumber());
  const shares = await client.readContract({
    address: vault,
    abi: vaultV3Abi,
    functionName: "balanceOf",
    args: [owner],
    blockNumber: block,
  });
  const assets = await client.readContract({
    address: vault,
    abi: vaultV3Abi,
    functionName: "convertToAssets",
    args: [shares],
    blockNumber: block,
  });
  return { blockNumber: block, shares, assets };
}