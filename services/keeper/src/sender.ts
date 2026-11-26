// The keeper never signs anything itself. It receives a `KeeperSender`, which is the only object
// that knows a key. Tests inject a fake sender, so the decision logic (simulate, nonce, retry, kill
// switch) is exercised without a wallet, and `viemSender.ts` is the production implementation.

import type { Hex } from "viem";

export interface KeeperTx {
  to: `0x${string}`;
  data: Hex;
  value?: bigint;
}

export interface Simulation {
  ok: boolean;
  reason?: string;
}

export interface KeeperReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface KeeperSender {
  address: `0x${string}`;
  nonce(): Promise<number>;
  /** eth_call with the sender as `from`: a transaction that would revert must never be broadcast. */
  simulate(tx: KeeperTx): Promise<Simulation>;
  send(tx: KeeperTx, nonce: number): Promise<Hex>;
  /** Awaits transaction receipt from RPC to verify inclusion and success status. */
  waitForReceipt?(txHash: Hex): Promise<KeeperReceipt>;
}

/** Errors that only mean "the nonce moved", not "the job is wrong". */
export function isNonceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("nonce too low") || message.includes("nonce has already been used") || message.includes("already known");
}