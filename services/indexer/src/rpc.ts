// Minimal JSON-RPC client for ingestion.
//
// Only the four methods the indexer needs are wrapped. Retries are deliberate and narrow:
// a rate limit or a transport failure is retried with backoff, a JSON-RPC *error* is not — the
// node answering "block range too large" or "unknown block" will answer the same way again, and
// retrying it only delays the report of a real problem.

export interface JsonRpcError extends Error {
  code?: number;
  data?: unknown;
}

/** A log after normalisation: hex quantities become bigint/number exactly once, at the boundary. */
export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  transactionIndex: number;
  removed?: boolean;
}

export interface RpcBlock {
  number: string;
  hash: string;
  timestamp: string;
}

export interface RpcClient {
  blockNumber(): Promise<bigint>;
  blockByNumber(block: bigint): Promise<RpcBlock | null>;
  getLogs(params: { address: string; fromBlock: bigint; toBlock: bigint }): Promise<RpcLog[]>;
  /** `eth_call` at an explicit block. Reconciliation must not read "latest". */
  call(to: string, data: string, block: bigint | "latest"): Promise<string>;
}

export interface HttpRpcOptions {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function httpRpc(url: string, options: HttpRpcOptions = {}): RpcClient {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  let id = 0;

  async function call<T>(method: string, params: unknown[]): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: controller.signal,
        });

        // 429 and 5xx are transport-level: the request may succeed later.
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"));
          lastError = new Error(`${method}: HTTP ${response.status}`);
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            await sleep(Math.min(retryAfter * 1000, 30_000));
          }
          continue;
        }
        if (!response.ok) {
          throw new Error(`${method}: HTTP ${response.status} ${await response.text()}`);
        }

        const body = (await response.json()) as { result?: T; error?: { code: number; message: string; data?: unknown } };
        if (body.error) {
          const error = new Error(`${method}: ${body.error.message}`) as JsonRpcError;
          error.code = body.error.code;
          error.data = body.error.data;
          throw error;
        }
        return body.result as T;
      } catch (error) {
        // A JSON-RPC error was already normalised; rethrow it instead of retrying.
        if (error instanceof Error && "code" in error && typeof (error as JsonRpcError).code === "number") {
          throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`${method}: gave up after ${attempts} attempts (${String(lastError)})`);
  }

  return {
    async blockNumber() {
      return BigInt(await call<string>("eth_blockNumber", []));
    },
    async blockByNumber(block) {
      const result = await call<RpcBlock | null>("eth_getBlockByNumber", [`0x${block.toString(16)}`, false]);
      return result;
    },
    async getLogs({ address, fromBlock, toBlock }) {
      const raw = await call<Array<Omit<RpcLog, "blockNumber" | "logIndex" | "transactionIndex"> & {
        blockNumber: string;
        logIndex: string;
        transactionIndex: string;
      }>>("eth_getLogs", [
        {
          address,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
        },
      ]);
      return raw.map((log) => ({
        ...log,
        blockNumber: BigInt(log.blockNumber),
        logIndex: Number(BigInt(log.logIndex)),
        transactionIndex: Number(BigInt(log.transactionIndex)),
      }));
    },
    async call(to, data, block) {
      return call<string>("eth_call", [{ to, data }, block === "latest" ? "latest" : `0x${block.toString(16)}`]);
    },
  };
}