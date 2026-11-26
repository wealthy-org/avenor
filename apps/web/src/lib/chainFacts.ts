// Which chain the numbers on this page came from.
//
// The deployment once printed "chain ID 4663" everywhere because one literal did the work of a read.
// Here the id comes from `eth_chainId` on the configured node during this render, the name from
// `src/config/networks.ts` (itself copied from `packages/config`), and a failed probe is reported as a
// failure. A render that could not reach the node says so; it does not fall back to a constant.

import { CAPTURE_CHAIN_ID } from "../config/staging.ts";
import { chainLabel } from "../config/networks.ts";
import { probeNode, type NodeProbe } from "./nodeProbe.ts";

export interface ChainFacts {
  /** `eth_chainId` as this render read it, or `null` when the probe failed. */
  chainId: number | null;
  /** Network name for that id, or `null` when there is no id. */
  label: string | null;
  /** True only when the node answered with the chain the committed capture was recorded on. */
  captureSupported: boolean;
  /** Why the id is absent. Non-empty exactly when `chainId` is `null`. */
  error: string | null;
}

/** Pure mapping from one probe result, so the rules above are testable without a node. */
export function factsFromProbe(probe: NodeProbe): ChainFacts {
  if (!probe.ok || probe.chainId === null) {
    return {
      chainId: null,
      label: null,
      captureSupported: false,
      error: probe.error ?? "the node did not answer eth_chainId",
    };
  }
  return {
    chainId: probe.chainId,
    label: chainLabel(probe.chainId),
    captureSupported: probe.chainId === CAPTURE_CHAIN_ID,
    error: null,
  };
}

export async function readChainFacts(rpcUrl: string | undefined, timeoutMs = 4_000): Promise<ChainFacts> {
  return factsFromProbe(await probeNode(rpcUrl, timeoutMs));
}

/** One line for page chrome, never a made-up id: `<name> · chain ID <id>`, or the failure. */
export function chainSummary(facts: ChainFacts): string {
  if (facts.chainId === null || facts.label === null) {
    return `chain id not read: ${facts.error ?? "the node did not answer"}`;
  }
  return `${facts.label} · chain ID ${facts.chainId}`;
}
