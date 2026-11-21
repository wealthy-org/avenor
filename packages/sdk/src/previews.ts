// Preview calls. Kept separate from `vault.ts` because these are the numbers a form shows before a
// signature, and mixing them with cached state is how "1.002.699" turns into "1.000.000".

import type { Address, PublicClient } from "viem";
import { vaultV3Abi } from "./abi/vault.ts";

export interface DepositPreview {
  assets: bigint;
  shares: bigint;
  maxAssets: bigint;
}

export interface WithdrawPreview {
  /** Assets requested for `withdraw`; ignored for `redeem`. */
  assets: bigint;
  shares: bigint;
  maxAssets: bigint;
}

export interface RedeemPreview {
  shares: bigint;
  assets: bigint;
  maxShares: bigint;
}

export async function previewDeposit(
  client: PublicClient,
  vault: Address,
  assets: bigint,
  receiver: Address,
  blockNumber?: bigint,
): Promise<DepositPreview> {
  const [shares, maxAssets] = await Promise.all([
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "previewDeposit", args: [assets], blockNumber }),
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "maxDeposit", args: [receiver], blockNumber }),
  ]);
  return { assets, shares, maxAssets };
}

export async function previewWithdraw(
  client: PublicClient,
  vault: Address,
  assets: bigint,
  owner: Address,
  blockNumber?: bigint,
): Promise<WithdrawPreview> {
  const [shares, maxAssets] = await Promise.all([
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "previewWithdraw", args: [assets], blockNumber }),
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "maxWithdraw", args: [owner], blockNumber }),
  ]);
  return { assets, shares, maxAssets };
}

export async function previewRedeem(
  client: PublicClient,
  vault: Address,
  shares: bigint,
  owner: Address,
  blockNumber?: bigint,
): Promise<RedeemPreview> {
  const [assets, maxShares] = await Promise.all([
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "previewRedeem", args: [shares], blockNumber }),
    client.readContract({ address: vault, abi: vaultV3Abi, functionName: "maxRedeem", args: [owner], blockNumber }),
  ]);
  return { shares, assets, maxShares };
}