// The single place the web app is allowed to learn a money number.
//
// Two sources, never mixed:
//   * `onchain`  — read from the configured RPC during this render, at one explicit block; the block
//                  number, hash and timestamp travel with the values so the UI can print them;
//   * `captured` — the same query, recorded in `forkSnapshot.json` by
//                  `scripts/capture-fork-snapshot.mjs` when the RPC was reachable. It is used only when
//                  the live read fails, and the UI labels it as a capture instead of claiming a live read.
//
// Nothing here derives a number. Every field is a decoded return value of one `eth_call` at `block`.
// A failed call stays a failure (null + message) rather than becoming a zero, because `0` is a
// legitimate answer for debt and would read as fact.

import { createPublicClient, http, keccak256, toFunctionSelector, type Hex } from "viem";
import { STAGING_VAULT } from "../config/staging.ts";
import captured from "./forkSnapshot.json";
import { captureFallbackAllowed } from "./vaultSource.ts";

export type ReadSource = "onchain" | "captured";

export interface BlockRef {
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
}

export interface Field<T> {
  value: T | null;
  error: string | null;
}

export interface VaultSnapshot {
  source: ReadSource;
  at: BlockRef;
  /** Populated only when the live read failed and the capture was used instead. */
  liveError: string | null;
  vault: {
    apiVersion: Field<string>;
    name: Field<string>;
    symbol: Field<string>;
    asset: Field<string>;
    decimals: Field<number>;
    totalAssets: Field<string>;
    totalSupply: Field<string>;
    pricePerShare: Field<string>;
    totalIdle: Field<string>;
    totalDebt: Field<string>;
    depositLimit: Field<string>;
    isShutdown: Field<boolean>;
    profitMaxUnlockTime: Field<string>;
  };
  roles: {
    roleManager: Field<string>;
    futureRoleManager: Field<string>;
    accountant: Field<string>;
    feeManager: Field<string>;
    /** `accountant.getVaultConfig(vault)`, the six uint16 members of `Accountant.Fee`. */
    vaultConfig: Field<{
      managementFeeBps: number;
      performanceFeeBps: number;
      refundRatioBps: number;
      maxFeeBps: number;
      maxGainBps: number;
      maxLossBps: number;
      custom: boolean;
    }>;
    timelockMinDelaySeconds: Field<number>;
  };
  allocation: {
    queue: Field<string[]>;
    strategies: {
      address: string;
      name: Field<string>;
      symbol: Field<string>;
      apiVersion: Field<string>;
      keeper: Field<string>;
      management: Field<string>;
      codeSize: number;
      activation: Field<string>;
      lastReport: Field<string>;
      currentDebt: Field<string>;
      maxDebt: Field<string>;
    }[];
  };
  evidence: {
    codeSize: number;
    /** EIP-1167 minimal proxy target, when the address is a proxy. */
    implementation: string | null;
    implementationCodeSize: number | null;
    implementationCodeHash: `0x${string}` | null;
  };
}

/** Default target for every read: the one vault the committed capture describes. */
const CAPTURED_VAULT = STAGING_VAULT;

/** The recorded capture, already typed. Used verbatim when the node is down. */
export function capturedSnapshot(error: string | null): VaultSnapshot {
  const raw = captured as unknown as Record<string, any>;
  const field = <T>(entry: unknown): Field<T> =>
    entry && typeof entry === "object" && "error" in (entry as object)
      ? { value: null, error: String((entry as { error: unknown }).error) }
      : { value: (entry as { value: T }).value, error: null };

  const strategies = (raw.allocation.strategies ?? []).map((row: Record<string, any>) => ({
    address: row.address,
    name: field<string>(row.name),
    symbol: field<string>(row.symbol),
    apiVersion: field<string>(row.apiVersion),
    keeper: field<string>(row.keeper),
    management: field<string>(row.management),
    codeSize: Number(row.codeSize ?? 0),
    activation: { value: row.activation !== undefined ? String(row.activation) : null, error: null },
    lastReport: { value: row.lastReport !== undefined ? String(row.lastReport) : null, error: null },
    currentDebt: { value: row.currentDebt !== undefined ? String(row.currentDebt) : null, error: null },
    maxDebt: { value: row.maxDebt !== undefined ? String(row.maxDebt) : null, error: null },
  }));

  const config = field<Record<string, unknown>>(raw.roles.vaultConfig);
  return {
    source: "captured",
    at: {
      blockNumber: Number(raw.captured.at.blockNumber),
      blockHash: String(raw.captured.at.blockHash),
      blockTimestamp: Number(raw.captured.at.blockTimestamp),
    },
    liveError: error,
    vault: {
      apiVersion: field<string>(raw.vault.apiVersion),
      name: field<string>(raw.vault.name),
      symbol: field<string>(raw.vault.symbol),
      asset: field<string>(raw.vault.asset),
      decimals: field<number>(raw.vault.decimals),
      totalAssets: field<string>(raw.vault.totalAssets),
      totalSupply: field<string>(raw.vault.totalSupply),
      pricePerShare: field<string>(raw.vault.pricePerShare),
      totalIdle: field<string>(raw.vault.totalIdle),
      totalDebt: field<string>(raw.vault.totalDebt),
      depositLimit: field<string>(raw.vault.depositLimit),
      isShutdown: field<boolean>(raw.vault.isShutdown),
      profitMaxUnlockTime: field<string>(raw.vault.profitMaxUnlockTime),
    },
    roles: {
      roleManager: field<string>(raw.roles.roleManager),
      futureRoleManager: field<string>(raw.roles.futureRoleManager),
      accountant: field<string>(raw.roles.accountant),
      feeManager: field<string>(raw.roles.feeManager),
      vaultConfig: {
        value: config.value as unknown as VaultSnapshot["roles"]["vaultConfig"]["value"],
        error: config.error,
      },
      timelockMinDelaySeconds: field<number>(raw.roles.timelockMinDelaySeconds),
    },
    allocation: {
      queue: field<string[]>(raw.allocation.queue),
      strategies,
    },
    evidence: {
      codeSize: Number(raw.evidence.vaultCodeSize ?? 0),
      implementation: raw.evidence.implementation ? String(raw.evidence.implementation).toLowerCase() : null,
      implementationCodeSize: raw.evidence.implementationCodeSize === undefined ? null : Number(raw.evidence.implementationCodeSize),
      implementationCodeHash: raw.evidence.implementationCodeHash ?? null,
    },
  };
}

const ok = <T>(value: T): Field<T> => ({ value, error: null });
/** A value that may legitimately be missing, still without an error attached. */
const fieldOf = <T>(value: T | null): Field<T> => ({ value, error: null });
const fail = <T>(error: unknown): Field<T> => ({ value: null, error: brief(error) });

function brief(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const short = (error as { shortMessage?: unknown } | null)?.shortMessage;
  const text = typeof short === "string" && short.trim() !== "" ? short : raw;
  const line = text.split("\n")[0]!.trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line === "" ? "the node returned no reason" : line;
}

const integer = (raw: string) => BigInt(raw).toString();
const addressOf = (raw: string) => `0x${raw.slice(-40)}`.toLowerCase();

function stringOf(raw: string): string {
  const body = raw.slice(2);
  if (body.length < 128) throw new Error("return data is not a string");
  const length = Number(BigInt(`0x${body.slice(64, 128)}`));
  const bytes = body.slice(128, 128 + length * 2);
  return Buffer.from(bytes, "hex").toString("utf8");
}

/** Read the whole snapshot from one block. Throws only when the block itself is unreadable. */
export async function liveSnapshot(rpcUrl: string, vaultAddress = CAPTURED_VAULT, timeoutMs = 6_000): Promise<VaultSnapshot> {
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 0 }) });
  const block = await client.getBlock({ blockTag: "latest" });
  const at: BlockRef = {
    blockNumber: Number(block.number),
    blockHash: block.hash,
    blockTimestamp: Number(block.timestamp),
  };
  const height: Hex = `0x${block.number.toString(16)}`;

  const call = async (to: string, signature: string, args: string[] = []): Promise<string> => {
    const data =
      toFunctionSelector(signature) +
      args.map((a) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0")).join("");
    const raw = await client.request({ method: "eth_call", params: [{ to, data }, height] as never });
    if (raw === "0x") throw new Error(`${signature} returned no data at block ${at.blockNumber}`);
    return raw as string;
  };

  const read = async <T>(to: string, signature: string, decode: (raw: string) => T, args?: string[]): Promise<Field<T>> => {
    try {
      return ok(decode(await call(to, signature, args)));
    } catch (error) {
      return fail<T>(error);
    }
  };

  const vault = {
    apiVersion: await read(vaultAddress, "apiVersion()", stringOf),
    name: await read(vaultAddress, "name()", stringOf),
    symbol: await read(vaultAddress, "symbol()", stringOf),
    asset: await read(vaultAddress, "asset()", addressOf),
    decimals: await read(vaultAddress, "decimals()", (raw) => Number(BigInt(raw))),
    totalAssets: await read(vaultAddress, "totalAssets()", integer),
    totalSupply: await read(vaultAddress, "totalSupply()", integer),
    pricePerShare: await read(vaultAddress, "pricePerShare()", integer),
    totalIdle: await read(vaultAddress, "totalIdle()", integer),
    totalDebt: await read(vaultAddress, "totalDebt()", integer),
    depositLimit: await read(vaultAddress, "deposit_limit()", integer),
    isShutdown: await read(vaultAddress, "isShutdown()", (raw) => BigInt(raw) !== 0n),
    profitMaxUnlockTime: await read(vaultAddress, "profitMaxUnlockTime()", integer),
  };

  const roleManager = await read(vaultAddress, "role_manager()", addressOf);
  const accountant = await read(vaultAddress, "accountant()", addressOf);

  const roles: VaultSnapshot["roles"] = {
    roleManager,
    futureRoleManager: await read(vaultAddress, "future_role_manager()", addressOf),
    accountant,
    feeManager: accountant.value === null ? fail<string>("no accountant") : await read(accountant.value, "feeManager()", addressOf),
    vaultConfig: fail("not read"),
    timelockMinDelaySeconds:
      roleManager.value === null
        ? fail<number>("no role_manager")
        : await read(roleManager.value, "getMinDelay()", (raw) => Number(BigInt(raw))),
  };

  if (accountant.value !== null) {
    try {
      const raw = await call(accountant.value, "getVaultConfig(address)", [vaultAddress]);
      const words = raw.slice(2).match(/.{64}/g) ?? [];
      const n = (index: number) => Number(BigInt(`0x${words[index]}`));
      roles.vaultConfig = ok({
        managementFeeBps: n(0),
        performanceFeeBps: n(1),
        refundRatioBps: n(2),
        maxFeeBps: n(3),
        maxGainBps: n(4),
        maxLossBps: n(5),
        custom: n(6) !== 0,
      });
    } catch (error) {
      roles.vaultConfig = fail(error);
    }
  }

  const queue = await read(vaultAddress, "get_default_queue()", (raw) => {
    const body = raw.slice(2);
    const length = Number(BigInt(`0x${body.slice(64, 128)}`));
    const addresses: string[] = [];
    for (let index = 0; index < length; index++) {
      addresses.push(`0x${body.slice(128 + index * 64 + 24, 128 + index * 64 + 64)}`.toLowerCase());
    }
    return addresses;
  });

  const strategies: VaultSnapshot["allocation"]["strategies"] = [];
  for (const strategy of queue.value ?? []) {
    const info = await read(vaultAddress, "strategies(address)", (raw) => {
      const words = raw.slice(2).match(/.{64}/g) ?? [];
      return {
        activation: BigInt(`0x${words[0]}`).toString(),
        lastReport: BigInt(`0x${words[1]}`).toString(),
        currentDebt: BigInt(`0x${words[2]}`).toString(),
        maxDebt: BigInt(`0x${words[3]}`).toString(),
      };
    }, [strategy]);
    const code = await client.getCode({ address: strategy as Hex, blockNumber: block.number });
    strategies.push({
      address: strategy,
      name: await read(strategy, "name()", stringOf),
      symbol: await read(strategy, "symbol()", stringOf),
      apiVersion: await read(strategy, "apiVersion()", stringOf),
      keeper: await read(strategy, "keeper()", addressOf),
      management: await read(strategy, "management()", addressOf),
      codeSize: code ? (code.length - 2) / 2 : 0,
      activation: fieldOf<string>(info.value?.activation ?? null),
      lastReport: fieldOf<string>(info.value?.lastReport ?? null),
      currentDebt: fieldOf<string>(info.value?.currentDebt ?? null),
      maxDebt: fieldOf<string>(info.value?.maxDebt ?? null),
    });
  }

  const vaultCode = await client.getCode({ address: vaultAddress as Hex, blockNumber: block.number });
  const proxy = /363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i.exec(vaultCode ?? "");
  let implementation: string | null = proxy ? `0x${proxy[1]}`.toLowerCase() : null;
  let implementationCodeSize: number | null = null;
  let implementationCodeHash: `0x${string}` | null = null;
  if (implementation) {
    const code = await client.getCode({ address: implementation as Hex, blockNumber: block.number });
    implementationCodeSize = code ? (code.length - 2) / 2 : 0;
    implementationCodeHash = code && code !== "0x" ? keccak256(code) : null;
  }

  return {
    source: "onchain",
    at,
    liveError: null,
    vault,
    roles,
    allocation: { queue, strategies },
    evidence: {
      codeSize: vaultCode ? (vaultCode.length - 2) / 2 : 0,
      implementation,
      implementationCodeSize,
      implementationCodeHash,
    },
  };
}

export interface NodeProbe {
  ok: boolean;
  chainId: number | null;
  blockNumber: number | null;
  blockHash: string | null;
  blockTimestamp: number | null;
  error: string | null;
}

/**
 * Two calls, for liveness only: `eth_chainId` and the latest block. No balance is invented when the node
 * does not answer — every numeric field is `null` and `error` says why.
 */
export async function probeNode(rpcUrl: string | undefined, timeoutMs = 4_000): Promise<NodeProbe> {
  const empty: NodeProbe = { ok: false, chainId: null, blockNumber: null, blockHash: null, blockTimestamp: null, error: null };
  if (typeof rpcUrl !== "string" || rpcUrl.trim() === "") return { ...empty, error: "no RPC configured" };
  try {
    const client = createPublicClient({ transport: http(rpcUrl.trim(), { timeout: timeoutMs, retryCount: 0 }) });
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlock({ blockTag: "latest" })]);
    return {
      ok: true,
      chainId,
      blockNumber: Number(block.number),
      blockHash: block.hash,
      blockTimestamp: Number(block.timestamp),
      error: null,
    };
  } catch (error) {
    return { ...empty, error: brief(error) };
  }
}

export interface PositionReading {
  account: string;
  blockNumber: number | null;
  blockHash: string | null;
  blockTimestamp: number | null;
  shares: string | null;
  /** `convertToAssets(shares)` at the same block, or `null` with a reason. */
  assets: string | null;
  error: string | null;
}

/**
 * One wallet's position, read from the vault: `balanceOf(account)` and `convertToAssets(shares)`.
 *
 * There is no first-seen or last-activity block here: a balance getter does not know either, and no
 * indexer is running, so those fields are reported as absent rather than guessed.
 */
export async function readPosition(
  rpcUrl: string | undefined,
  account: string,
  vaultAddress = CAPTURED_VAULT,
  timeoutMs = 6_000
): Promise<PositionReading> {
  const empty: PositionReading = {
    account: account.toLowerCase(),
    blockNumber: null,
    blockHash: null,
    blockTimestamp: null,
    shares: null,
    assets: null,
    error: null,
  };
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) return { ...empty, error: "not a 20-byte hex address" };
  if (typeof rpcUrl !== "string" || rpcUrl.trim() === "") return { ...empty, error: "no RPC configured" };

  try {
    const client = createPublicClient({ transport: http(rpcUrl.trim(), { timeout: timeoutMs, retryCount: 0 }) });
    const block = await client.getBlock({ blockTag: "latest" });
    const height: Hex = `0x${block.number.toString(16)}`;
    const call = async (signature: string, args: string[]): Promise<string> => {
      const data =
        toFunctionSelector(signature) +
        args.map((a) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0")).join("");
      const raw = await client.request({ method: "eth_call", params: [{ to: vaultAddress as Hex, data }, height] as never });
      if (raw === "0x") throw new Error(`${signature} returned no data at block ${Number(block.number)}`);
      return raw as string;
    };

    const shares = BigInt(await call("balanceOf(address)", [account])).toString();
    const assets = BigInt(await call("convertToAssets(uint256)", [shares])).toString();
    return {
      account: account.toLowerCase(),
      blockNumber: Number(block.number),
      blockHash: block.hash,
      blockTimestamp: Number(block.timestamp),
      shares,
      assets,
      error: null,
    };
  } catch (error) {
    return { ...empty, error: brief(error) };
  }
}

/**
 * Read the vault that was asked about: live from the configured node first, the recorded capture only
 * when the capture actually describes this address on this chain (see `captureFallbackAllowed`).
 *
 * A vault the node cannot read is a failure with the node's reason, not another vault's numbers. There
 * is no `VaultSnapshot` for that case because a snapshot would have to carry a block, and inventing one
 * is the failure this guard exists to prevent.
 */
export async function readVaultSnapshot(address = CAPTURED_VAULT): Promise<VaultSnapshot> {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL ?? "";
  const normalized = address.toLowerCase();
  if (typeof rpc !== "string" || rpc.trim() === "") {
    if (captureFallbackAllowed(normalized, null)) return capturedSnapshot("no RPC configured");
    throw new Error("no RPC configured: only the captured vault can be served without a node");
  }
  try {
    return await liveSnapshot(rpc.trim(), normalized);
  } catch (error) {
    // The guard needs the chain the node reports, not the chain the capture was read on.
    const probe = await probeNode(rpc.trim());
    if (captureFallbackAllowed(normalized, probe.chainId)) return capturedSnapshot(brief(error));
    throw new Error(
      `${brief(error)}\nno captured snapshot exists for ${normalized}` +
        (probe.chainId === null ? " (the node did not report a chain id)" : ` on chain ${probe.chainId}`)
    );
  }
}