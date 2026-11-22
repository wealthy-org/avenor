// Turns API JSON into a view model, with every number validated before it reaches a component.
//
// The API guarantees strings and `source` on every response; this file enforces that guarantee
// instead of trusting it. A response that arrives as a JSON number is rejected, because
// `JSON.parse` has already rounded it and no later code can tell how much was lost.

import { InvalidAmountError } from "@avenor/sdk";

export type Source = "indexed" | "onchain";

const DECIMAL = /^\d+$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function fail(field: string, detail: string): never {
  throw new InvalidAmountError(`${field} ${detail}`);
}

function decimal(value: unknown, field: string): bigint {
  if (typeof value === "number") {
    fail(field, "arrived as a JSON number; precision is already lost, refusing to display it");
  }
  if (typeof value !== "string" || !DECIMAL.test(value)) fail(field, "must be a decimal string");
  return BigInt(value);
}

/** Small counts (decimals, indexes) may legitimately arrive as JSON numbers. */
function count(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 36) return value;
  const parsed = decimal(value, field);
  if (parsed > 36n) fail(field, "must be at most 36");
  return Number(parsed);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") fail(field, "must be a non-empty string");
  return value;
}

function address(value: unknown, field: string): string {
  const raw = text(value, field);
  if (!ADDRESS.test(raw)) fail(field, "must be a 20-byte hex address");
  return raw.toLowerCase();
}

function optionalAddress(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return address(value, field);
}

/** Basis points from the API: a small integer, or null when the vault has no accountant. */
function optionalBps(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  // Basis points are a small count, so an integer JSON number is exact here in a way a balance is not.
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) fail(field, "must be basis points (0..10000)");
    return value;
  }
  const parsed = decimal(value, field);
  if (parsed > 10_000n) fail(field, "must be basis points (0..10000)");
  return Number(parsed);
}

function boolean(value: unknown, field: string): boolean {
  // A gate flag may not arrive as a string: "false" is truthy in the wrong hands.
  if (typeof value !== "boolean") fail(field, "must be a JSON boolean");
  return value;
}

function source(value: unknown, field = "source"): Source {
  if (value !== "indexed" && value !== "onchain") fail(field, "must be indexed or onchain");
  return value;
}

function iso(value: unknown, field: string): string {
  const raw = text(value, field);
  if (Number.isNaN(new Date(raw).getTime())) fail(field, "must be an ISO timestamp");
  return raw;
}

export interface VaultRow {
  address: string;
  name: string;
  symbol: string;
  assetAddress: string;
  assetDecimals: number;
  shareDecimals: number;
  /** `null` until the indexer has seen the vault's role manager; never guessed. */
  roleManager: string | null;
  accountant: string | null;
  depositLimit: bigint;
  deployedBlock: bigint;
  source: Source;
}

export function parseVaultRow(json: unknown): VaultRow {
  if (typeof json !== "object" || json === null) fail("vault", "must be an object");
  const row = json as Record<string, unknown>;
  return {
    address: address(row.address, "address"),
    name: text(row.name, "name"),
    symbol: text(row.symbol, "symbol"),
    assetAddress: address(row.asset_address ?? row.assetAddress, "asset_address"),
    assetDecimals: count(row.asset_decimals ?? row.assetDecimals, "asset_decimals"),
    shareDecimals: count(row.share_decimals ?? row.shareDecimals, "share_decimals"),
    roleManager: optionalAddress(row.role_manager ?? row.roleManager, "role_manager"),
    accountant: optionalAddress(row.accountant, "accountant"),
    depositLimit: decimal(row.depositLimit ?? row.deposit_limit, "depositLimit"),
    deployedBlock: decimal(row.deployedBlock ?? row.deployed_block, "deployedBlock"),
    source: source(row.source),
  };
}

export interface Live {
  blockNumber: bigint;
  blockHash: string;
  blockTimestamp: string;
  totalAssets: bigint;
  totalSupply: bigint;
  pricePerShare: bigint;
  totalIdle: bigint;
  totalDebt: bigint;
  /** `accountant.getVaultConfig(vault).performanceFee` at the same block; `null` without an accountant. */
  performanceFeeBps: number | null;
  /** `accountant.getVaultConfig(vault).managementFee` at the same block. */
  managementFeeBps: number | null;
  /** `deposit_limit()` at the same block; a deposit hook may lower the per-account ceiling further. */
  depositLimit: bigint;
  isPaused: boolean;
  isShutdown: boolean;
  source: Source;
}

export function parseLive(json: unknown): Live {
  if (typeof json !== "object" || json === null) fail("live", "must be an object");
  const row = json as Record<string, unknown>;
  const live: Live = {
    blockNumber: decimal(row.blockNumber, "blockNumber"),
    blockHash: text(row.blockHash, "blockHash"),
    blockTimestamp: iso(row.blockTimestamp, "blockTimestamp"),
    totalAssets: decimal(row.totalAssets, "totalAssets"),
    totalSupply: decimal(row.totalSupply, "totalSupply"),
    pricePerShare: decimal(row.pricePerShare, "pricePerShare"),
    totalIdle: decimal(row.totalIdle, "totalIdle"),
    totalDebt: decimal(row.totalDebt, "totalDebt"),
    performanceFeeBps: optionalBps(row.performanceFeeBps, "performanceFeeBps"),
    managementFeeBps: optionalBps(row.managementFeeBps, "managementFeeBps"),
    depositLimit: decimal(row.depositLimit, "depositLimit"),
    isPaused: boolean(row.isPaused, "isPaused"),
    isShutdown: boolean(row.isShutdown, "isShutdown"),
    source: source(row.source),
  };
  if (live.source !== "onchain") fail("live.source", "must be onchain: this number came from a block");
  if (live.totalIdle + live.totalDebt !== live.totalAssets) {
    fail("live", "idle + debt does not equal totalAssets; the reads are from different blocks");
  }
  return live;
}

export interface StrategyRow {
  address: string;
  venue: string | null;
  venueError: string | null;
  activation: bigint;
  lastReport: bigint;
  currentDebt: bigint;
  maxDebt: bigint;
  /** Share of `totalAssets` in basis points, rounded to nearest. */
  debtBps: number;
}

export interface Allocation {
  blockNumber: bigint;
  blockHash: string;
  blockTimestamp: string;
  strategies: StrategyRow[];
}

/** Parts-per-10.000 of `whole`, rounded to nearest; 0 when `whole` is 0. */
export function shareBps(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  if (part < 0n) throw new InvalidAmountError("share of a negative amount is not a fraction");
  return Number((part * 10_000n + whole / 2n) / whole);
}

export function parseAllocation(json: unknown, totalAssets: bigint): Allocation {
  if (typeof json !== "object" || json === null) fail("allocation", "must be an object");
  const row = json as Record<string, unknown>;
  if (!Array.isArray(row.strategies)) fail("strategies", "must be an array");
  const strategies = row.strategies.map((entry, index): StrategyRow => {
    if (typeof entry !== "object" || entry === null) fail(`strategies[${index}]`, "must be an object");
    const item = entry as Record<string, unknown>;
    const venue = item.venue === null || item.venue === undefined ? null : address(item.venue, `strategies[${index}].venue`);
    const venueError =
      item.venueError === null || item.venueError === undefined
        ? null
        : text(item.venueError, `strategies[${index}].venueError`);
    if (venue === null && venueError === null) {
      fail(`strategies[${index}]`, "has neither a venue nor a reason; a blank cell is not an answer");
    }
    const currentDebt = decimal(item.currentDebt, `strategies[${index}].currentDebt`);
    return {
      address: address(item.address, `strategies[${index}].address`),
      venue,
      venueError,
      activation: decimal(item.activation, `strategies[${index}].activation`),
      lastReport: decimal(item.lastReport, `strategies[${index}].lastReport`),
      currentDebt,
      maxDebt: decimal(item.maxDebt, `strategies[${index}].maxDebt`),
      debtBps: shareBps(currentDebt, totalAssets),
    };
  });
  return {
    blockNumber: decimal(row.blockNumber, "blockNumber"),
    blockHash: text(row.blockHash, "blockHash"),
    blockTimestamp: iso(row.blockTimestamp, "blockTimestamp"),
    strategies,
  };
}

export interface Roles {
  blockNumber: bigint;
  blockHash: string;
  blockTimestamp: string;
  roleManager: string;
  /** Non-zero while a role-manager transfer is pending. */
  futureRoleManager: string;
  /** Seconds from `getMinDelay()`, or null when the address does not answer it. */
  timelockMinDelaySeconds: number | null;
  timelockError: string | null;
}

export function parseRoles(json: unknown): Roles {
  if (typeof json !== "object" || json === null) fail("roles", "must be an object");
  const row = json as Record<string, unknown>;
  const delay = row.timelockMinDelaySeconds;
  let timelockMinDelaySeconds: number | null = null;
  if (delay !== null && delay !== undefined) {
    // A delay is a small count of seconds, so an integer JSON number is exact.
    const seconds =
      typeof delay === "number"
        ? Number.isSafeInteger(delay) && delay >= 0
          ? delay
          : fail("timelockMinDelaySeconds", "must be a non-negative integer number of seconds")
        : Number(decimal(delay, "timelockMinDelaySeconds"));
    if (seconds > 2_592_000) fail("timelockMinDelaySeconds", "is longer than 30 days; refusing to display it");
    timelockMinDelaySeconds = seconds;
  }
  const error = row.timelockError;
  const timelockError = error === null || error === undefined ? null : text(error, "timelockError");
  if (timelockMinDelaySeconds === null && timelockError === null) {
    fail("roles", "has neither a timelock delay nor a reason; unknown must be stated");
  }
  return {
    blockNumber: decimal(row.blockNumber, "blockNumber"),
    blockHash: text(row.blockHash, "blockHash"),
    blockTimestamp: iso(row.blockTimestamp, "blockTimestamp"),
    roleManager: address(row.roleManager, "roleManager"),
    futureRoleManager: address(row.futureRoleManager, "futureRoleManager"),
    timelockMinDelaySeconds,
    timelockError,
  };
}

export interface ReportRow {
  blockNumber: bigint;
  blockTimestamp: string;
  txHash: string;
  gain: bigint;
  loss: bigint;
  totalFees: bigint;
  totalRefunds: bigint;
  source: Source;
}

export function parseReports(json: unknown): ReportRow[] {
  if (!Array.isArray(json)) fail("reports", "must be an array");
  return json.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) fail(`reports[${index}]`, "must be an object");
    const row = entry as Record<string, unknown>;
    return {
      blockNumber: decimal(row.blockNumber, `reports[${index}].blockNumber`),
      blockTimestamp: iso(row.blockTimestamp, `reports[${index}].blockTimestamp`),
      txHash: text(row.txHash, `reports[${index}].txHash`),
      gain: decimal(row.gain, `reports[${index}].gain`),
      loss: decimal(row.loss, `reports[${index}].loss`),
      totalFees: decimal(row.totalFees, `reports[${index}].totalFees`),
      totalRefunds: decimal(row.totalRefunds, `reports[${index}].totalRefunds`),
      source: source(row.source, `reports[${index}].source`),
    };
  });
}

/**
 * Highest `lastReport` block across the queue; `null` when no strategy ever reported. This is a
 * block number, not a duration: "how stale" needs the current head, and the page must not compute
 * an age from a number it did not pin.
 */
export function latestReportBlock(allocation: Allocation): bigint | null {
  return allocation.strategies.reduce<bigint | null>(
    (best, entry) => (entry.lastReport > 0n && (best === null || entry.lastReport > best) ? entry.lastReport : best),
    null,
  );
}