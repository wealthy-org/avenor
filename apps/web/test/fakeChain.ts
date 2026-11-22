// A scripted JSON-RPC node. viem's real encoder/decoder runs against it, so a wrong ABI or a wrong
// argument order fails a test instead of failing in a browser. Shared by the deposit and withdraw
// suites: one node shape, two behaviours under test.

import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { vaultV3Abi } from "@avenor/sdk";

export const VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd" as Address;
export const ASSET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
export const USER = "0x1111111111111111111111111111111111111111" as Address;
export const BLOCK = 0x70dafe7n;

export type Handler = (args: readonly unknown[]) => unknown;

export interface FakeChain {
  calls: string[];
  handlers: Map<string, Handler>;
  revert: Set<string>;
  sent: unknown[];
  /** Logs returned by every receipt. Set per test. */
  logs: { address: Address; data: Hex; topics: Hex[] }[];
}

export type FakeClient = ReturnType<typeof createPublicClient>;

function eventLog(
  eventName: "Deposit" | "Withdraw",
  indexed: Record<string, unknown>,
  values: readonly bigint[],
): { address: Address; data: Hex; topics: Hex[] } {
  const topics = encodeEventTopics({ abi: vaultV3Abi, eventName, args: indexed }) as Hex[];
  const data = `0x${values.map((word) => word.toString(16).padStart(64, "0")).join("")}` as Hex;
  return { address: VAULT, data, topics };
}

export function depositLog(owner: Address, assets: bigint, shares: bigint) {
  return eventLog("Deposit", { sender: USER, owner }, [assets, shares]);
}

export function withdrawLog(receiver: Address, owner: Address, assets: bigint, shares: bigint) {
  return eventLog("Withdraw", { sender: USER, receiver, owner }, [assets, shares]);
}

export function createFakeChain(handlers: Record<string, Handler> = {}): {
  client: FakeClient;
  chain: FakeChain;
} {
  const chain: FakeChain = {
    calls: [],
    handlers: new Map(Object.entries(handlers)),
    revert: new Set(),
    sent: [],
    logs: [depositLog(USER, 100_000_000n, 99_700_000n)],
  };

  const transport = custom({
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId":
          return "0x1237";
        case "eth_blockNumber":
          return `0x${BLOCK.toString(16)}`;
        case "eth_getCode":
          return "0x6001600255";
        case "eth_getTransactionReceipt": {
          const hash = (params as [Hex])[0];
          return {
            transactionHash: hash,
            transactionIndex: "0x0",
            blockHash: "0xbaa980ab",
            blockNumber: `0x${BLOCK.toString(16)}`,
            from: USER,
            to: VAULT,
            cumulativeGasUsed: "0x5208",
            gasUsed: "0x5208",
            effectiveGasPrice: "0x1",
            contractAddress: null,
            logs: chain.logs,
            logsBloom: `0x${"00".repeat(256)}`,
            status: "0x1",
            type: "0x2",
          };
        }
        case "eth_call": {
          const call = (params as [{ to: Address; data: Hex }, string])[0];
          let decoded: { functionName: string; args: readonly unknown[] } | null = null;
          let abi: Abi = vaultV3Abi;
          for (const candidate of [vaultV3Abi, erc20Abi] as Abi[]) {
            try {
              const result = decodeFunctionData({ abi: candidate, data: call.data });
              decoded = { functionName: result.functionName, args: (result.args ?? []) as readonly unknown[] };
              abi = candidate;
              break;
            } catch {
              // try the next ABI
            }
          }
          if (!decoded) throw new Error(`fake chain cannot decode ${call.data.slice(0, 10)}`);
          chain.calls.push(`${call.to.toLowerCase()}:${decoded.functionName}`);
          if (chain.revert.has(decoded.functionName)) throw new Error("execution reverted");
          const handler = chain.handlers.get(decoded.functionName);
          if (!handler) throw new Error(`fake chain has no handler for ${decoded.functionName}`);
          return encodeFunctionResult({ abi, functionName: decoded.functionName, result: handler(decoded.args) });
        }
        default:
          throw new Error(`fake chain does not implement ${method}`);
      }
    },
  });

  return { client: createPublicClient({ transport }), chain };
}

export function scriptedSigner(chain: FakeChain, options: { reject?: boolean } = {}) {
  return {
    account: USER,
    async sendTransaction(request: unknown): Promise<Hex> {
      if (options.reject === true) {
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      chain.sent.push(request);
      return `0x${chain.sent.length.toString(16).padStart(64, "0")}` as Hex;
    },
  };
}