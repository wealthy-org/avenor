// A scripted JSON-RPC server, used to test ingestion without a live chain.
//
// It models exactly what the indexer reads: block headers, log queries, and HTTP failures. That is
// enough to exercise chunking, checkpoint resume, duplicate replay, retry, and reorg rollback
// deterministically. Real-node behaviour is covered separately (`scripts/reorg-test.py` runs
// `anvil_reorg` against this same ingestion code).

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeBlock {
  hash: string;
  timestamp: number;
}

export interface FakeLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
}

export interface FakeChain {
  blocks: Map<number, FakeBlock>;
  logs: FakeLog[];
}

export function fakeChain(): FakeChain {
  return { blocks: new Map(), logs: [] };
}

/** Mine `count` empty blocks starting after the current highest block. */
export function mine(chain: FakeChain, count: number, seed = ""): void {
  let next = chain.blocks.size === 0 ? 0 : Math.max(...chain.blocks.keys()) + 1;
  for (let i = 0; i < count; i += 1) {
    const number = next++;
    chain.blocks.set(number, { hash: hashOf(number, seed), timestamp: 1_700_000_000 + number });
  }
}

export function hashOf(block: number, seed = ""): string {
  // Deterministic, distinguishable per (block, seed). Not a real hash: the indexer only compares
  // equality and never derives anything from the value.
  const body = `${seed}:${block}`;
  let hex = "";
  for (let i = 0; i < 64; i += 1) hex += "0123456789abcdef"[(body.charCodeAt(i % body.length) + i) % 16];
  return `0x${hex}`;
}

/** Rewrite every block from `forkBlock` upwards, as a reorg would. */
export function reorg(chain: FakeChain, forkBlock: number, seed: string): void {
  for (const [number, block] of chain.blocks) {
    if (number >= forkBlock) {
      chain.blocks.set(number, { hash: hashOf(number, seed), timestamp: block.timestamp + 1000 });
    }
  }
  for (const log of chain.logs) {
    if (log.blockNumber >= forkBlock) {
      const block = chain.blocks.get(log.blockNumber)!;
      log.blockHash = block.hash;
    }
  }
}

export function padAddress(address: string): string {
  return `0x${address.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
}

export function uintWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/** Encode a single `address` as an ABI word (left-padded, unlike a `uint256` cast of the address). */
export function addressWordResult(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`${address} is not a 20-byte address`);
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

/** Encode `address[]`, including the offset word, the way solc returns it. */
export function addressArrayResult(addresses: string[]): string {
  const offset = uintWord(32n);
  const length = uintWord(BigInt(addresses.length));
  const items = addresses.map((address) => address.replace(/^0x/, "").toLowerCase().padStart(64, "0")).join("");
  return `0x${offset}${length}${items}`;
}

/** Encode the `strategies(address)` tuple `(activation, last_report, current_debt, max_debt)`. */
export function strategiesResult(values: {
  activation: bigint;
  lastReport: bigint;
  currentDebt: bigint;
  maxDebt: bigint;
}): string {
  return `0x${uintWord(values.activation)}${uintWord(values.lastReport)}${uintWord(values.currentDebt)}${uintWord(values.maxDebt)}`;
}

/** Encode a `uint256` return value the way an ABI-encoded `eth_call` result looks. */
export function wordResult(value: bigint): string {
  return `0x${uintWord(value)}`;
}

export function transferLog(params: {
  vault: string;
  block: FakeBlock;
  blockNumber: number;
  from: string;
  to: string;
  shares: bigint;
  logIndex: number;
  txHash?: string;
}): FakeLog {
  return {
    address: params.vault,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      padAddress(params.from),
      padAddress(params.to),
    ],
    data: `0x${uintWord(params.shares)}`,
    blockNumber: params.blockNumber,
    blockHash: params.block.hash,
    transactionHash: params.txHash ?? `0xtx${params.blockNumber}x${params.logIndex}`,
    logIndex: params.logIndex,
  };
}

export class FakeRpcServer {
  /** `${to}:${calldata}` -> 32-byte hex result, for `eth_call`. */
  views = new Map<string, string>();
  private server: Server | null = null;
  private urlValue = "";
  private failuresLeft = 0;
  private failureStatus = 429;
  calls: string[] = [];

  chain: FakeChain;

  constructor(chain: FakeChain) {
    this.chain = chain;
  }

  /** Fail the next `count` HTTP requests with `status` (used to prove retry/backoff). */
  failNext(count: number, status = 429): void {
    this.failuresLeft = count;
    this.failureStatus = status;
  }

  get url(): string {
    return this.urlValue;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        if (this.failuresLeft > 0) {
          this.failuresLeft -= 1;
          res.writeHead(this.failureStatus, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "injected" }));
          return;
        }
        let payload: { id: number; method: string; params: unknown[] };
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400).end("bad json");
          return;
        }
        this.calls.push(payload.method);
        try {
          const result = this.handle(payload.method, payload.params);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
        } catch (error) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: String(error) } }));
        }
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server!.address() as AddressInfo;
    this.urlValue = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => this.server!.close((err) => (err ? reject(err) : resolve())));
    this.server = null;
  }

  private hex(value: number | bigint): string {
    return `0x${value.toString(16)}`;
  }

  private handle(method: string, params: unknown[]): unknown {
    switch (method) {
      case "eth_blockNumber": {
        const highest = Math.max(0, ...this.chain.blocks.keys());
        return this.hex(highest);
      }
      case "eth_getBlockByNumber": {
        const number = Number(BigInt(params[0] as string));
        const block = this.chain.blocks.get(number);
        if (!block) return null;
        return { number: this.hex(number), hash: block.hash, timestamp: this.hex(block.timestamp) };
      }
      case "eth_call": {
        const request = params[0] as { to: string; data: string };
        // The full calldata is the key: `convertToAssets(1e18)` and `convertToAssets(1e6)` are
        // different questions and must not share an answer.
        const key = `${request.to.toLowerCase()}:${request.data.toLowerCase()}`;
        const result = this.views.get(key);
        if (result === undefined) throw new Error(`no fake eth_call result for ${key}`);
        return result;
      }
      case "eth_getLogs": {
        const filter = params[0] as { address: string; fromBlock: string; toBlock: string };
        const from = Number(BigInt(filter.fromBlock));
        const to = Number(BigInt(filter.toBlock));
        if (to - from > 10_000) throw new Error("block range too large");
        return this.chain.logs
          .filter((log) => log.blockNumber >= from && log.blockNumber <= to)
          .filter((log) => log.address.toLowerCase() === filter.address.toLowerCase())
          .map((log) => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: this.hex(log.blockNumber),
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            logIndex: this.hex(log.logIndex),
            transactionIndex: "0x0",
            removed: false,
          }));
      }
      default:
        throw new Error(`unsupported method ${method}`);
    }
  }
}