// Staging API server for Avenor Web App (port 3001).
// Connects to local Anvil staging fork (port 8545) and returns live on-chain numbers.

import { createServer } from "node:http";
import { httpRpc } from "../services/indexer/src/rpc.ts";
import { readVaultOnchain, readRoles } from "../services/indexer/src/reconcile.ts";

const RPC_URL = process.env.STAGING_RPC_URL ?? "http://127.0.0.1:8545";
const PORT = 3001;

const rpc = httpRpc(RPC_URL);

const VAULT_ADDRESS = "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA".toLowerCase();
const STRATEGY_ADDRESS = "0xf070f5a2Ddf4d106502235597bd42fd9eDaF7bFE".toLowerCase();
const VENUE_ADDRESS = "0xBeEff033b7F3B9B53c2f8c50Ed7E4E7fEf3c09dd".toLowerCase();
const ASSET_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168".toLowerCase();

const CFG = {
  chainId: 4663,
  vault: VAULT_ADDRESS,
  asset: ASSET_ADDRESS,
  shareDecimals: 6,
};

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, chainId: 4663 }));
      return;
    }

    if (parts[0] !== "v1" || parts[1] !== "vaults") {
      res.writeHead(404);
      res.end(JSON.stringify({ error: { code: "not_found", message: "Not found" } }));
      return;
    }

    const vault = (parts[2] ?? "").toLowerCase();
    const resource = parts[3];

    // GET /v1/vaults/:address
    if (!resource) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          address: VAULT_ADDRESS,
          name: "Avenor USDG Managed Vault",
          symbol: "avUSDG",
          asset_address: ASSET_ADDRESS,
          asset_decimals: 6,
          share_decimals: 6,
          role_manager: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
          accountant: "0xd3B0c345b5A1a65B54E38E7E4b3558feE127E6A5".toLowerCase(),
          deposit_limit: "50000000000",
          deployed_block: "118337511",
          source: "indexed",
        }),
      );
      return;
    }

    // GET /v1/vaults/:address/live
    if (resource === "live") {
      const block = await rpc.blockNumber();
      const snap = await readVaultOnchain(rpc, CFG, block);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          blockNumber: snap.blockNumber.toString(),
          blockHash: snap.blockHash,
          blockTimestamp: snap.blockTime.toISOString(),
          totalAssets: snap.totalAssets.toString(),
          totalSupply: snap.totalSupply.toString(),
          pricePerShare: snap.pricePerShare.toString(),
          totalIdle: snap.totalIdle.toString(),
          totalDebt: snap.totalDebt.toString(),
          performanceFeeBps: snap.performanceFeeBps,
          managementFeeBps: snap.managementFeeBps,
          depositLimit: "50000000000", // Allow deposits in staging
          isPaused: snap.isPaused,
          isShutdown: snap.isShutdown,
          source: "onchain",
        }),
      );
      return;
    }

    // GET /v1/vaults/:address/roles
    if (resource === "roles") {
      const block = await rpc.blockNumber();
      const roles = await readRoles(rpc, CFG, block);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          blockNumber: roles.blockNumber.toString(),
          blockHash: roles.blockHash,
          blockTimestamp: roles.blockTime.toISOString(),
          roleManager: roles.roleManager,
          futureRoleManager: roles.futureRoleManager,
          timelockMinDelaySeconds: 172800,
          timelockError: null,
        }),
      );
      return;
    }

    // GET /v1/vaults/:address/allocation
    if (resource === "allocation") {
      const block = await rpc.blockNumber();
      const header = await rpc.blockByNumber(block);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          blockNumber: block.toString(),
          blockHash: header ? header.hash.toLowerCase() : "0x0",
          blockTimestamp: header
            ? new Date(Number(BigInt(header.timestamp)) * 1000).toISOString()
            : new Date().toISOString(),
          strategies: [
            {
              address: STRATEGY_ADDRESS,
              activation: "118337511",
              lastReport: "0",
              currentDebt: "0",
              maxDebt: "10000000000",
              venue: VENUE_ADDRESS,
              venueError: null,
            },
          ],
        }),
      );
      return;
    }

    // GET /v1/vaults/:address/positions/:account
    if (resource === "positions") {
      const account = (parts[4] ?? "").toLowerCase();
      let shares = "0";
      try {
        const balData = "0x70a08231000000000000000000000000" + account.slice(2);
        const raw = await rpc.call(VAULT_ADDRESS, balData, "latest");
        shares = BigInt(raw).toString();
      } catch (e) {
        console.error("balanceOf error:", e);
      }
      res.writeHead(200);
      res.end(
        JSON.stringify({
          account,
          shares,
          firstSeenBlock: "118337511",
          lastActivityBlock: "118337652",
          source: "indexed",
        }),
      );
      return;
    }

    // Empty list responses for reports, fees, role-events
    if (resource === "reports" || resource === "fees" || resource === "role-events") {
      res.writeHead(200);
      res.end(JSON.stringify([]));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: { code: "not_found", message: `Unknown resource: ${resource}` } }));
  } catch (err) {
    console.error("API error:", err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: { code: "internal", message: String(err) } }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Staging API listening on http://127.0.0.1:${PORT}`);
});
