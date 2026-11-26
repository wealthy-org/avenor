// Minimal JSON-RPC node for the keeper tests: enough `eth_call` decoding to prove that the keeper
// reads the functions it says it reads, at the block it says it pinned.

import http from "node:http";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, toFunctionSelector, type Hex } from "viem";
import { vaultV3Abi } from "@avenor/sdk";

const STRATEGY_ASSETS = toFunctionSelector("totalAssetsIncludingIdle()");

export interface FakeNode {
  url: string;
  calls: { to: string; block: string; data: Hex }[];
  sent: Hex[];
  reverts: Set<string>;
  handlers: Map<string, unknown>;
  /** `to:selector` -> already-encoded return data, for calls outside the vault ABI. */
  raw: Map<string, Hex>;
  /** `to:selector` whose eth_call should revert. */
  setNonce(value: number): void;
  stop(): Promise<void>;
}

export async function startFakeNode(): Promise<FakeNode> {
  const handlers = new Map<string, unknown>();
  const raw = new Map<string, Hex>();
  const reverts = new Set<string>();
  const calls: { to: string; block: string; data: Hex }[] = [];
  const sent: Hex[] = [];
  const state = { nonce: 7 };

  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { id: number; method: string; params?: unknown[] };
      const reply = (result: unknown) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
      };
      const fail = (code: number, message: string) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code, message } }));
      };

      if (payload.method === "eth_chainId") return reply("0x1237");
      if (payload.method === "eth_gasPrice") return reply("0x3b9aca00");
      if (payload.method === "eth_maxPriorityFeePerGas") return reply("0x1");
      if (payload.method === "eth_getBlockByNumber") {
        return reply({
          number: "0x64",
          hash: `0x${"22".repeat(32)}`,
          parentHash: `0x${"33".repeat(32)}`,
          nonce: "0x0000000000000000",
          sha3Uncles: `0x${"44".repeat(32)}`,
          logsBloom: `0x${"00".repeat(256)}`,
          transactionsRoot: `0x${"55".repeat(32)}`,
          stateRoot: `0x${"66".repeat(32)}`,
          receiptsRoot: `0x${"77".repeat(32)}`,
          miner: "0x0000000000000000000000000000000000000000",
          difficulty: "0x0",
          totalDifficulty: "0x0",
          extraData: "0x",
          size: "0x0",
          gasLimit: "0x1c9c380",
          gasUsed: "0x0",
          timestamp: "0x6b0f2d26",
          baseFeePerGas: "0x3b9aca00",
          uncles: [],
          transactions: [],
        });
      }
      if (payload.method === "eth_blockNumber") return reply("0x64");
      if (payload.method === "eth_getTransactionCount") return reply(`0x${state.nonce.toString(16)}`);
      if (payload.method === "eth_sendRawTransaction") {
        sent.push(payload.params?.[0] as Hex);
        return reply(`0x${"11".repeat(32)}`);
      }
      if (payload.method === "eth_getTransactionReceipt") {
        return reply({
          transactionHash: payload.params?.[0],
          blockNumber: "0x64",
          blockHash: `0x${"22".repeat(32)}`,
          status: "0x1",
          gasUsed: "0x5208",
          cumulativeGasUsed: "0x5208",
          logs: [],
        });
      }
      if (payload.method === "eth_call") {
        const tx = payload.params?.[0] as { to: string; data: Hex };
        const block = String(payload.params?.[1]);
        calls.push({ to: tx.to, block, data: tx.data });
        const selector = tx.data.slice(0, 10);
        const key = `${tx.to.toLowerCase()}:${selector}`;
        if (reverts.has(key)) return fail(3, "execution reverted: too much loss");
        if (raw.has(key)) return reply(raw.get(key));
        if (!handlers.has(key)) return fail(3, "execution reverted: no handler");
        const value = handlers.get(key) as unknown;
        if (selector === STRATEGY_ASSETS) {
          return reply(encodeAbiParameters([{ type: "uint256" }], [value as bigint]));
        }
        const functionName = decodeFunctionData({ abi: vaultV3Abi, data: tx.data }).functionName;
        return reply(encodeFunctionResult({ abi: vaultV3Abi, functionName, result: value as never }));
      }
      return fail(-32601, `unsupported method ${payload.method}`);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake node did not bind");

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    sent,
    reverts,
    handlers,
    raw,
    get nonce() {
      return state.nonce;
    },
    setNonce(value: number) {
      state.nonce = value;
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}