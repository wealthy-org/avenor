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
    apiVersionError = error instanceof Error ? error.message : String(error);
  }

  try {
    code = await client.getCode({ address: vault, blockNumber: block });
  } catch (error) {
    codeError = error instanceof Error ? error.message : String(error);
  }

  const hasCode = typeof code === "string" && code !== "0x";
  return {
    address: vault.toLowerCase(),
    blockNumber: block,
    apiVersion,
    apiVersionError,
    // A hash of empty code would look like a fingerprint of a real deployment, so it is not shown.
    codeHash: hasCode ? keccak256(code as Hex) : null,
    codeSize: hasCode ? String(code).length / 2 - 1 : 0,
    codeError: hasCode ? null : (codeError ?? "alamat tidak punya kode pada blok ini"),
  };
}
