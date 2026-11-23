// Capture a real vault snapshot from the configured RPC and write `src/lib/forkSnapshot.json`.
//
// Why a capture at all: the staging deployment lives on a local anvil fork of Robinhood Chain
// (chain 4663) and has no code on mainnet. When the fork is not running the app must still render,
// and it must not invent a number. So every field is read here, with the block number, hash and
// timestamp that produced it, and the app shows the capture only with that block attached and the
// word "captured" next to it.
//
// Usage: node scripts/capture-fork-snapshot.mjs [rpcUrl]
// Every read below is a plain `eth_call` at one block; no figure is derived, defaulted or estimated.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, keccak256, toFunctionSelector } from "viem";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "lib", "forkSnapshot.json");

const rpc = process.argv[2] ?? process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const VAULT = "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA";
const ASSET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const client = createPublicClient({ transport: http(rpc, { timeout: 20_000 }) });
const block = await client.getBlock({ blockTag: "latest" });
const at = { blockNumber: Number(block.number), blockHash: block.hash, blockTimestamp: Number(block.timestamp) };
const height = `0x${block.number.toString(16)}`;

/** Raw `eth_call`; a revert or an empty return is recorded as an error, never as a zero. */
async function call(to, signature, args = []) {
  const data =
    toFunctionSelector(signature) + args.map((a) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0")).join("");
  try {
    const raw = await client.request({ method: "eth_call", params: [{ to, data }, height] });
    return { raw };
  } catch (error) {
    return { error: (error.shortMessage ?? error.message ?? String(error)).slice(0, 180) };
  }
}

const word = (raw) => BigInt(raw);
const address = (raw) => `0x${raw.slice(-40)}`;

/** Decode a solidity `string` return value. */
function decodeString(raw) {
  const body = raw.slice(2);
  const length = Number(BigInt(`0x${body.slice(64, 128)}`));
  return Buffer.from(body.slice(128, 128 + length * 2), "hex").toString("utf8");
}

async function read(to, signature, decode, args) {
  const result = await call(to, signature, args);
  if (result.error) return { error: result.error };
  if (result.raw === "0x") return { error: "empty return data" };
  return { value: decode(result.raw), raw: result.raw };
}

const snapshot = { captured: { rpc, at }, vault: {}, roles: {}, allocation: {}, evidence: {} };

snapshot.vault.apiVersion = await read(VAULT, "apiVersion()", decodeString);
snapshot.vault.name = await read(VAULT, "name()", decodeString);
snapshot.vault.symbol = await read(VAULT, "symbol()", decodeString);
snapshot.vault.asset = await read(VAULT, "asset()", address);
snapshot.vault.decimals = await read(VAULT, "decimals()", (r) => Number(word(r)));
snapshot.vault.totalAssets = await read(VAULT, "totalAssets()", (r) => word(r).toString());
snapshot.vault.totalSupply = await read(VAULT, "totalSupply()", (r) => word(r).toString());
snapshot.vault.pricePerShare = await read(VAULT, "pricePerShare()", (r) => word(r).toString());
snapshot.vault.totalIdle = await read(VAULT, "totalIdle()", (r) => word(r).toString());
snapshot.vault.totalDebt = await read(VAULT, "totalDebt()", (r) => word(r).toString());
snapshot.vault.depositLimit = await read(VAULT, "deposit_limit()", (r) => word(r).toString());
snapshot.vault.isShutdown = await read(VAULT, "isShutdown()", (r) => word(r) !== 0n);
snapshot.vault.profitMaxUnlockTime = await read(VAULT, "profitMaxUnlockTime()", (r) => word(r).toString());
snapshot.vault.useDefaultQueue = await read(VAULT, "use_default_queue()", (r) => word(r) !== 0n);
snapshot.vault.autoAllocate = await read(VAULT, "auto_allocate()", (r) => word(r) !== 0n);
snapshot.vault.minimumTotalIdle = await read(VAULT, "minimum_total_idle()", (r) => word(r).toString());

snapshot.roles.roleManager = await read(VAULT, "role_manager()", address);
snapshot.roles.futureRoleManager = await read(VAULT, "future_role_manager()", address);
snapshot.roles.accountant = await read(VAULT, "accountant()", address);

const accountant = snapshot.roles.accountant.value;
if (accountant) {
  snapshot.roles.feeManager = await read(accountant, "feeManager()", address);
  const config = await call(accountant, "getVaultConfig(address)", [VAULT]);
  if (config.error) {
    snapshot.roles.vaultConfig = { error: config.error };
  } else {
    // Accountant.Fee is six uint16 plus a bool; Solidity returns one word per member.
    const words = config.raw.slice(2).match(/.{64}/g) ?? [];
    const n = (i) => Number(BigInt(`0x${words[i]}`));
    snapshot.roles.vaultConfig = {
      value: {
        managementFeeBps: n(0),
        performanceFeeBps: n(1),
        refundRatioBps: n(2),
        maxFeeBps: n(3),
        maxGainBps: n(4),
        maxLossBps: n(5),
        custom: n(6) !== 0,
      },
      raw: config.raw,
    };
  }
}

const roleManager = snapshot.roles.roleManager.value;
if (roleManager) {
  snapshot.roles.timelockMinDelaySeconds = await read(roleManager, "getMinDelay()", (r) => Number(word(r)));
}

// Default queue: `get_default_queue() -> address[]`.
const queue = await read(VAULT, "get_default_queue()", (r) => {
  const body = r.slice(2);
  const length = Number(BigInt(`0x${body.slice(64, 128)}`));
  const out = [];
  for (let i = 0; i < length; i++) out.push(`0x${body.slice(128 + i * 64 + 24, 128 + i * 64 + 64)}`);
  return out;
});
snapshot.allocation.queue = queue;

const strategies = [];
for (const strategy of queue.value ?? []) {
  const row = { address: strategy };
  const info = await call(VAULT, "strategies(address)", [strategy]);
  if (info.error) {
    row.error = info.error;
  } else {
    const words = info.raw.slice(2).match(/.{64}/g) ?? [];
    row.activation = BigInt(`0x${words[0]}`).toString();
    row.lastReport = BigInt(`0x${words[1]}`).toString();
    row.currentDebt = BigInt(`0x${words[2]}`).toString();
    row.maxDebt = BigInt(`0x${words[3]}`).toString();
  }
  row.name = await read(strategy, "name()", decodeString);
  row.symbol = await read(strategy, "symbol()", decodeString);
  row.apiVersion = await read(strategy, "apiVersion()", decodeString);
  row.keeper = await read(strategy, "keeper()", address);
  row.management = await read(strategy, "management()", address);
  const code = await client.getCode({ address: strategy, blockNumber: block.number });
  row.codeSize = code ? (code.length - 2) / 2 : 0;
  strategies.push(row);
}
snapshot.allocation.strategies = strategies;

const vaultCode = await client.getCode({ address: VAULT, blockNumber: block.number });
snapshot.evidence.vaultCodeSize = vaultCode ? (vaultCode.length - 2) / 2 : 0;
const impl = /363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i.exec(vaultCode ?? "");
snapshot.evidence.implementation = impl ? `0x${impl[1]}` : null;
if (snapshot.evidence.implementation) {
  const implCode = await client.getCode({ address: snapshot.evidence.implementation, blockNumber: block.number });
  snapshot.evidence.implementationCodeSize = implCode ? (implCode.length - 2) / 2 : 0;
  snapshot.evidence.implementationCodeHash = implCode ? keccak256(implCode) : null;
}
const assetCode = await client.getCode({ address: ASSET, blockNumber: block.number });
snapshot.evidence.assetCodeSize = assetCode ? (assetCode.length - 2) / 2 : 0;

await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(
  `captured block ${at.blockNumber} ${at.blockHash} -> ${OUT}\n` +
    `totalAssets ${snapshot.vault.totalAssets.value} · totalSupply ${snapshot.vault.totalSupply.value} · ` +
    `strategies ${strategies.length} · impl ${snapshot.evidence.implementation}`
);