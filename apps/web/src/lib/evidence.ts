// Contract evidence read from the chain itself: which implementation is deployed, and the hash of
// the code that answered. No artifact file is trusted here, because a local artifact proves what we
// built, not what is running.

import { keccak256, type Address, type Hex } from "viem";
import { parseAbi } from "viem";
import type { ChainClient } from "./deposit.ts";

export const EVIDENCE_ABI = parseAbi(["function apiVersion() view returns (string)"]);

export type EvidenceErrorCode = "api_version_unreadable" | "code_unreadable";

export class EvidenceError extends Error {
  readonly code: EvidenceErrorCode;
  readonly detail: string | null;

  constructor(code: EvidenceErrorCode, message: string, detail: string | null = null) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
    this.detail = detail;
  }
}

export interface ContractEvidence {
  address: string;
  blockNumber: bigint;
  apiVersion: string | null;
  apiVersionError: string | null;
  codeHash: `0x${string}` | null;
  codeSize: number;
  codeError: string | null;
  /** EIP-1167 delegate target, when the address is a minimal proxy instead of the implementation. */
  implementation?: string | null;
  /** Size of the proxy body itself, which is not the code that answers. */
  proxyCodeSize?: number;
}

/**
 * A viem error message is a multi-paragraph dump. What belongs next to a label is one line, so the
 * short form is preferred and the first line of the long form is the fallback. Never empty: a blank
 * reason reads like "no problem".
 */
function brief(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const short = (error as { shortMessage?: unknown } | null)?.shortMessage;
  const text = typeof short === "string" && short.trim() !== "" ? short : raw;
  const line = text.split("\n")[0]!.trim();
  return line.length > 180 ? `${line.slice(0, 177)}...` : line === "" ? "the node returned no reason" : line;
}

export async function readEvidence(client: ChainClient, vault: Address, blockNumber?: bigint): Promise<ContractEvidence> {
  const block = blockNumber ?? (await client.getBlockNumber());
  let apiVersion: string | null = null;
  let apiVersionError: string | null = null;
  let code: Hex | undefined = undefined;
  let codeError: string | null = null;

  try {
    apiVersion = await client.readContract({ address: vault, abi: EVIDENCE_ABI, functionName: "apiVersion", blockNumber: block });
  } catch (error) {
    apiVersionError = brief(error);
  }

  try {
    code = await client.getCode({ address: vault, blockNumber: block });
  } catch (error) {
    codeError = brief(error);
  }

  const hasCode = typeof code === "string" && code !== "0x";

  // A VaultV3 deployment is a 45-byte EIP-1167 proxy. The proxy body is not the code that answers, so
  // the hash reported here is the hash of the delegate target's runtime code, read at the same block.
  let implementation: string | null = null;
  let fingerprint: Hex | null = hasCode ? (code as Hex) : null;
  let size = hasCode ? String(code).length / 2 - 1 : 0;
  const proxy = /363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i.exec(code ?? "");
  if (proxy) {
    implementation = `0x${proxy[1]}`.toLowerCase();
    try {
      const implCode = await client.getCode({ address: implementation as Address, blockNumber: block });
      if (implCode && implCode !== "0x") {
        fingerprint = implCode;
        size = implCode.length / 2 - 1;
      }
    } catch {
      // Keep the proxy body as the fingerprint rather than claiming a target that did not answer.
      implementation = null;
    }
  }

  return {
    address: vault.toLowerCase(),
    blockNumber: block,
    apiVersion,
    apiVersionError,
    // A hash of empty code would look like a fingerprint of a real deployment, so it is not shown.
    codeHash: fingerprint === null ? null : keccak256(fingerprint),
    codeSize: size,
    codeError: hasCode ? null : (codeError ?? "this address has no code at this block"),
    implementation,
    proxyCodeSize: hasCode ? String(code).length / 2 - 1 : 0,
  };
}
