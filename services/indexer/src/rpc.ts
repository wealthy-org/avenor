// Minimal JSON-RPC client for ingestion with resilient multi-endpoint fallback.
//
// Wraps the core methods the indexer needs. Supports automatic fallback across multiple
// RPC endpoints, chain ID validation, transport retries with exponential backoff, and
// WAF-compatible headers to prevent Cloudflare 403 rate-limiting.

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
  /** Verify chainId matches expectation */
  chainId?(): Promise<bigint>;
}

export interface HttpRpcOptions {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  expectedChainId?: number | bigint;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function httpRpc(urls: string | string[], options: HttpRpcOptions = {}): RpcClient {
  const urlList = Array.isArray(urls) ? urls.filter(Boolean) : [urls];
  if (urlList.length === 0) {
    throw new Error("httpRpc requires at least one RPC URL");
  }

  const attemptsPerEndpoint = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const expectedChainId = options.expectedChainId != null ? BigInt(options.expectedChainId) : null;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  let id = 0;
  let activeUrlIndex = 0;
  let chainIdValidated = false;

  async function rawCall<T>(targetUrl: string, method: string, params: unknown[]): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attemptsPerEndpoint; attempt += 1) {
      if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(targetUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: controller.signal,
        });

        if (response.status === 403 || response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"));
          lastError = new Error(`${method}: HTTP ${response.status} from ${targetUrl}`);
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
        if (error instanceof Error && "code" in error && typeof (error as JsonRpcError).code === "number") {
          throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`${method} failed against ${targetUrl} after ${attemptsPerEndpoint} attempts: ${String(lastError)}`);
  }

  async function callWithFailover<T>(method: string, params: unknown[]): Promise<T> {
    const totalEndpoints = urlList.length;
    let endpointErrors: string[] = [];

    for (let offset = 0; offset < totalEndpoints; offset += 1) {
      const currentIndex = (activeUrlIndex + offset) % totalEndpoints;
      const targetUrl = urlList[currentIndex]!;
      try {
        const result = await rawCall<T>(targetUrl, method, params);
        if (offset > 0) {
          activeUrlIndex = currentIndex; // stick to working fallback
        }
        return result;
      } catch (err) {
        endpointErrors.push(`[${targetUrl}]: ${String(err)}`);
        // if this was an explicit JSON-RPC protocol error, rethrow immediately
        if (err instanceof Error && "code" in err && typeof (err as JsonRpcError).code === "number") {
          throw err;
        }
      }
    }

    throw new Error(`All ${totalEndpoints} RPC endpoints failed for ${method}: ${endpointErrors.join(" | ")}`);
  }

  async function checkChainId(): Promise<void> {
    if (!expectedChainId || chainIdValidated) return;
    const hex = await callWithFailover<string>("eth_chainId", []);
    const actual = BigInt(hex);
    if (actual !== expectedChainId) {
      throw new Error(`RPC Chain ID mismatch: expected ${expectedChainId}, got ${actual}`);
    }
    chainIdValidated = true;
  }

  return {
    async blockNumber() {
      await checkChainId();
      return BigInt(await callWithFailover<string>("eth_blockNumber", []));
    },
    async blockByNumber(block) {
      await checkChainId();
      return await callWithFailover<RpcBlock | null>("eth_getBlockByNumber", [`0x${block.toString(16)}`, false]);
    },
    async getLogs({ address, fromBlock, toBlock }) {
      await checkChainId();
      const raw = await callWithFailover<Array<Omit<RpcLog, "blockNumber" | "logIndex" | "transactionIndex"> & {
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
      await checkChainId();
      return callWithFailover<string>("eth_call", [{ to, data }, block === "latest" ? "latest" : `0x${block.toString(16)}`]);
    },
    async chainId() {
      const hex = await callWithFailover<string>("eth_chainId", []);
      return BigInt(hex);
    },
  };
}
