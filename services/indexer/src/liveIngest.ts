// One-shot ingestion run against a live RPC, used by `scripts/reorg-test.py`.
//
// Kept as a separate entry point instead of a test file because the assertion that matters there
// is "the same process re-reads this database" — the Python harness starts a real anvil, ingests,
// reorgs the chain, and ingests again. This script only reports what the ingestion code saw.

import { createPool } from "./db.ts";
import { ingest } from "./ingest.ts";
import { httpRpc } from "./rpc.ts";

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL;
  const databaseUrl = process.env.DATABASE_URL;
  const address = process.env.VAULT_ADDRESS;
  if (!rpcUrl || !databaseUrl || !address) {
    throw new Error("RPC_URL, DATABASE_URL and VAULT_ADDRESS are required");
  }

  const pool = createPool(databaseUrl, "avenor-live-ingest");
  try {
    const result = await ingest(pool, httpRpc(rpcUrl), {
      chainId: Number(process.env.CHAIN_ID ?? "31337"),
      stream: `vault:${address.toLowerCase()}`,
      address,
      deployBlock: BigInt(process.env.DEPLOY_BLOCK ?? "0"),
      confirmations: Number(process.env.CONFIRMATIONS ?? "0"),
      chunkSize: Number(process.env.CHUNK_SIZE ?? "100"),
      reorgWindow: Number(process.env.REORG_WINDOW ?? "64"),
    });
    console.log(
      JSON.stringify({
        fromBlock: result.fromBlock.toString(),
        toBlock: result.toBlock.toString(),
        chunks: result.chunks,
        logs: result.logs,
        reorg: result.reorg
          ? { ancestor: result.reorg.ancestor.toString(), rolledBackTo: result.reorg.rolledBackTo.toString() }
          : null,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});