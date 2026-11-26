// Liveness of the configured node, on its own so a page can learn the chain id without pulling in the
// snapshot decode path (which reads the committed capture JSON at import time).
//
// Two calls only: `eth_chainId` and the latest block. No balance is invented when the node does not
// answer — every numeric field is `null` and `error` says why.

import { createPublicClient, http } from "viem";

export interface NodeProbe {
  ok: boolean;
  chainId: number | null;
  blockNumber: number | null;
  blockHash: string | null;
  blockTimestamp: number | null;
  error: string | null;
}

/** One line, never empty: a blank reason reads like "no problem". */
export function brief(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const short = (error as { shortMessage?: unknown } | null)?.shortMessage;
  const text = typeof short === "string" && short.trim() !== "" ? short : raw;
  const line = text.split("\n")[0]!.trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line === "" ? "the node returned no reason" : line;
}

export async function probeNode(rpcUrl: string | undefined, timeoutMs = 4_000): Promise<NodeProbe> {
  const empty: NodeProbe = { ok: false, chainId: null, blockNumber: null, blockHash: null, blockTimestamp: null, error: null };
  if (typeof rpcUrl !== "string" || rpcUrl.trim() === "") return { ...empty, error: "no RPC configured" };
  try {
    const client = createPublicClient({ transport: http(rpcUrl.trim(), { timeout: timeoutMs, retryCount: 0 }) });
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlock({ blockTag: "latest" })]);
    return {
      ok: true,
      chainId,
      blockNumber: Number(block.number),
      blockHash: block.hash,
      blockTimestamp: Number(block.timestamp),
      error: null,
    };
  } catch (error) {
    return { ...empty, error: brief(error) };
  }
}
