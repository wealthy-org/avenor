// A scripted JSON-RPC node for SDK tests.
//
// It answers `eth_call` by decoding the calldata with the same generated ABI the SDK uses and
// encoding the handler's return value, so the test exercises viem's real encoder/decoder instead of
// asserting on a stub. Anything unhandled is a JSON-RPC error, which is also how a revert reaches
// `simulateContract`.

import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { vaultV3Abi } from "../src/abi/vault.ts";
import { erc20Abi } from "viem";

export type Handler = (args: readonly unknown[]) => unknown;

export interface FakeNode {
  client: PublicClient;
  /** Every call, in order, as `functionName(args...)`. */
  calls: string[];
  /** Handler results can be changed mid-test to model a second block. */
  handlers: Map<string, Handler>;
  revert: Set<string>;
}

const BLOCK = {
  number: 0x70dafe7n,
  hash: "0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af" as Hex,
  parentHash: `0x${"11".repeat(32)}` as Hex,
  nonce: `0x${"00".repeat(8)}` as Hex,
  sha3Uncles: `0x${"22".repeat(32)}` as Hex,
  logsBloom: `0x${"00".repeat(256)}` as Hex,
  transactionsRoot: `0x${"33".repeat(32)}` as Hex,
  stateRoot: `0x${"44".repeat(32)}` as Hex,
  receiptsRoot: `0x${"55".repeat(32)}` as Hex,
  miner: "0x0000000000000000000000000000000000000000" as Address,
  difficulty: 0n,
  totalDifficulty: 0n,
  extraData: "0x" as Hex,
  size: 1n,
  gasLimit: 30_000_000n,
  gasUsed: 0n,
  timestamp: 1_795_103_654n,
  transactions: [] as Hex[],
  uncles: [] as Hex[],
  baseFeePerGas: 1n,
};

export function createFakeNode(handlers: Record<string, Handler> = {}): FakeNode {
  const node: FakeNode = {
    client: undefined as unknown as PublicClient,
    calls: [],
    handlers: new Map(Object.entries(handlers)),
    revert: new Set(),
  };

  const transport = custom({
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId":
          return "0x1237";
        case "eth_blockNumber":
          return `0x${BLOCK.number.toString(16)}`;
        case "eth_getBlockByNumber":
          return { ...BLOCK, transactions: [] };
        case "eth_call": {
          const call = (params as [{ to: Address; data: Hex }, string])[0];
          let decoded: { functionName: string; args: readonly unknown[] } | null = null;
          for (const abi of [vaultV3Abi, erc20Abi] as Abi[]) {
            try {
              const result = decodeFunctionData({ abi, data: call.data });
              decoded = { functionName: result.functionName, args: (result.args ?? []) as readonly unknown[] };
              break;
            } catch {
              // try the next ABI
            }
          }
          if (!decoded) throw new Error(`fake node cannot decode ${call.data.slice(0, 10)}`);

          const signature = `${decoded.functionName}(${decoded.args.map(String).join(",")})`;
          node.calls.push(signature);
          if (node.revert.has(decoded.functionName)) {
            throw new Error(`execution reverted: ${decoded.functionName}`);
          }
          const handler = node.handlers.get(decoded.functionName);
          if (!handler) throw new Error(`fake node has no handler for ${decoded.functionName}`);
          return encodeFunctionResult({ abi: vaultV3Abi, functionName: decoded.functionName, result: handler(decoded.args) });
        }
        default:
          throw new Error(`fake node does not implement ${method}`);
      }
    },
  });

  node.client = createPublicClient({ transport });
  return node;
}