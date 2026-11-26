// Write path. Two things this file refuses to do:
//
//   1. Guess `max_loss`. VaultV3._withdraw defaults it to 0 and redeem defaults it to 10_000 in
//      other Yearn forks; both defaults are wrong for a managed vault whose venue can report a
//      loss between quote and execution. `maxLoss` is a required field on every loss-bearing call.
//   2. Send a transaction without simulating it first. Every `prepare*` returns a `request` that
//      already went through `simulateContract`, so a revert surfaces as an error in the form
//      instead of a failed signature.

import type { Address, PublicClient } from "viem";
import { erc20Abi } from "viem";
import { vaultV3Abi } from "./abi/vault.ts";

export const MAX_BPS = 10_000;

export class MissingMaxLossError extends Error {
  constructor(call: string) {
    super(`${call} requires an explicit maxLoss in basis points (0..9999)`);
    this.name = "MissingMaxLossError";
  }
}

export class InvalidMaxLossError extends Error {
  constructor(maxLoss: number | bigint) {
    super(
      `maxLoss ${maxLoss} is out of range: pass 0..9999. ` +
        `${MAX_BPS} means "accept a total loss", which is never a sensible bound for a user call`,
    );
    this.name = "InvalidMaxLossError";
  }
}

/** Validate a caller-supplied loss budget. Refuses `undefined` instead of defaulting it. */
export function requireMaxLoss(value: number | bigint | undefined | null, call: string): bigint {
  if (value === undefined || value === null) throw new MissingMaxLossError(call);
  const bps = BigInt(value);
  if (bps < 0n || bps >= BigInt(MAX_BPS)) throw new InvalidMaxLossError(value);
  return bps;
}

export interface BaseWriteParams {
  vault: Address;
  /** The account that signs. Simulation runs from this address. */
  account: Address;
}

export interface DepositParams extends BaseWriteParams {
  assets: bigint;
  receiver: Address;
  /** Minimum shares expected (slippage protection). Throws if simulation returns fewer shares. */
  minShares?: bigint;
}

export class SlippageExceededError extends Error {
  constructor(actual: bigint, minShares: bigint) {
    super(`simulated shares ${actual} is below minimum shares threshold ${minShares}`);
    this.name = "SlippageExceededError";
  }
}

export interface WithdrawParams extends BaseWriteParams {
  assets: bigint;
  receiver: Address;
  /** Owner of the shares; defaults to `account` when omitted. */
  owner?: Address;
  maxLoss: number | bigint;
}

export interface RedeemParams extends BaseWriteParams {
  shares: bigint;
  receiver: Address;
  owner?: Address;
  maxLoss: number | bigint;
}

export interface PreparedDeposit {
  request: unknown;
  assets: bigint;
  shares: bigint;
}

export interface PreparedWithdraw {
  request: unknown;
  assets: bigint;
  shares: bigint;
  maxLoss: bigint;
}

export interface PreparedRedeem {
  request: unknown;
  shares: bigint;
  assets: bigint;
  maxLoss: bigint;
}

export async function prepareDeposit(client: PublicClient, params: DepositParams): Promise<PreparedDeposit> {
  if (params.assets <= 0n) throw new Error("deposit amount must be positive");
  const { request, result } = await client.simulateContract({
    address: params.vault,
    abi: vaultV3Abi,
    functionName: "deposit",
    args: [params.assets, params.receiver],
    account: params.account,
  });
  if (params.minShares !== undefined && result < params.minShares) {
    throw new SlippageExceededError(result, params.minShares);
  }
  return { request, assets: params.assets, shares: result };
}

export async function prepareWithdraw(client: PublicClient, params: WithdrawParams): Promise<PreparedWithdraw> {
  const maxLoss = requireMaxLoss(params.maxLoss, "withdraw");
  if (params.assets <= 0n) throw new Error("withdraw amount must be positive");
  const { request, result } = await client.simulateContract({
    address: params.vault,
    abi: vaultV3Abi,
    functionName: "withdraw",
    args: [params.assets, params.receiver, params.owner ?? params.account, maxLoss],
    account: params.account,
  });
  return { request, assets: params.assets, shares: result, maxLoss };
}

export async function prepareRedeem(client: PublicClient, params: RedeemParams): Promise<PreparedRedeem> {
  const maxLoss = requireMaxLoss(params.maxLoss, "redeem");
  if (params.shares <= 0n) throw new Error("redeem amount must be positive");
  const { request, result } = await client.simulateContract({
    address: params.vault,
    abi: vaultV3Abi,
    functionName: "redeem",
    args: [params.shares, params.receiver, params.owner ?? params.account, maxLoss],
    account: params.account,
  });
  return { request, shares: params.shares, assets: result, maxLoss };
}

export interface ApproveParams extends BaseWriteParams {
  token: Address;
  spender: Address;
  amount: bigint;
}

export async function prepareApprove(client: PublicClient, params: ApproveParams) {
  const { request, result } = await client.simulateContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [params.spender, params.amount],
    account: params.account,
  });
  return { request, approved: result };
}