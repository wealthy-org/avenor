// Runtime entry point for Avenor Indexer daemon & read-only API service.

import { createPool } from "./db.ts";
import { ingest } from "./ingest.ts";
import { applyMigrations } from "./migrate.ts";
import { startApi } from "./api.ts";
import { httpRpc } from "./rpc.ts";

function fail(message: string): never {
  process.stderr.write(`[indexer:fatal] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
  const databaseUrl = process.env.DATABASE_URL;
  const vaultAddress = process.env.VAULT_ADDRESS ?? "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0";
  const strategyAddress = process.env.STRATEGY_ADDRESS ?? "0x8f151132f80277b7D42Ad9615172E6De1B26Cf93";
  const chainId = Number(process.env.CHAIN_ID ?? "46630");
  const port = Number(process.env.PORT ?? "3001");
  const intervalMs = Number(process.env.INGEST_INTERVAL_MS ?? "15000");

  if (!databaseUrl) {
    fail("DATABASE_URL is required for indexer daemon");
  }

  process.stdout.write(
    `[indexer:init] starting Avenor Indexer on chain ${chainId}, vault ${vaultAddress}, API port ${port}\n`
  );

  const pool = createPool(databaseUrl, "avenor-indexer-daemon");
  const rpc = httpRpc(rpcUrl);

  // 1. Run database migrations
  try {
    process.stdout.write("[indexer:migrate] applying database migrations...\n");
    await applyMigrations(pool);
    process.stdout.write("[indexer:migrate] migrations applied successfully\n");
  } catch (error) {
    fail(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 2. Start HTTP API
  const apiHandle = await startApi({
    pool,
    config: {
      chainId,
      vault: vaultAddress,
      strategy: strategyAddress,
    },
    rpc,
    port,
  });
  process.stdout.write(`[indexer:api] HTTP API listening on ${apiHandle.url}\n`);

  // 3. Ongoing Ingestion Loop
  let running = true;
  let inFlight = false;

  const ingestTick = async () => {
    if (!running || inFlight) return;
    inFlight = true;
    try {
      const result = await ingest(pool, rpc, {
        chainId,
        stream: `vault:${vaultAddress.toLowerCase()}`,
        address: vaultAddress,
        deployBlock: BigInt(process.env.DEPLOY_BLOCK ?? "157460000"),
        confirmations: Number(process.env.CONFIRMATIONS ?? "1"),
        chunkSize: Number(process.env.CHUNK_SIZE ?? "1000"),
        reorgWindow: Number(process.env.REORG_WINDOW ?? "64"),
      });

      if (result.logs > 0 || result.reorg) {
        process.stdout.write(
          `[indexer:ingest] block ${result.fromBlock}..${result.toBlock}: ${result.logs} logs ingested` +
            (result.reorg ? ` (reorg rollback to ${result.reorg.rolledBackTo})` : "") +
            "\n"
        );
      }
    } catch (error) {
      process.stderr.write(
        `[indexer:error] ingestion tick failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    } finally {
      inFlight = false;
    }
  };

  // Immediate first tick, then interval
  void ingestTick();
  const timer = setInterval(() => void ingestTick(), intervalMs);

  // Graceful shutdown
  const shutdown = async () => {
    process.stdout.write("\n[indexer:shutdown] shutting down indexer service...\n");
    running = false;
    clearInterval(timer);
    await apiHandle.close();
    await pool.end();
    process.stdout.write("[indexer:shutdown] clean exit completed\n");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
