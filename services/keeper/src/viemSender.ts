// The only file that touches a key. Kept small on purpose: everything that can be decided without
// signing lives in `keeper.ts`, which is what the tests exercise.

import type { Account, Hex, PublicClient, WalletClient } from "viem";
import type { KeeperSender, KeeperTx, Simulation } from "./sender.ts";

export interface ViemSenderOptions {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account | `0x${string}`;
  /** Simulate against a pinned block instead of "latest" when the caller already knows the head. */
  blockNumber?: bigint;
}

export function createViemSender(options: ViemSenderOptions): KeeperSender {
  const { publicClient, walletClient, account } = options;
  const address = typeof account === "string" ? account : account.address;

  return {
    address,

    async nonce(): Promise<number> {
      return publicClient.getTransactionCount({ address, blockTag: "pending" });
    },

    async simulate(tx: KeeperTx): Promise<Simulation> {
      try {
        await publicClient.call({
          account: address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
          blockNumber: options.blockNumber,
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: revertReason(error) };
      }
    },

    async send(tx: KeeperTx, nonce: number): Promise<Hex> {
      return walletClient.sendTransaction({
        account,
        chain: walletClient.chain ?? null,
        to: tx.to,
        data: tx.data,
        value: tx.value,
        nonce,
        gas: 1_500_000n,
      });
    },
  };
}

function revertReason(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const record = error as { shortMessage?: unknown; details?: unknown; message?: unknown };
    if (typeof record.shortMessage === "string" && record.shortMessage.length > 0) return record.shortMessage;
    if (typeof record.details === "string" && record.details.length > 0) return record.details;
    if (typeof record.message === "string") return record.message;
  }
  return String(error);
}