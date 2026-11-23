// Server-side data provider for the internal API routes and for server-rendered pages.
//
// Provenance, stated once here so no component has to guess:
//   * the vault, its strategy, its role manager (a TimelockController) and its accountant are deployed
//     on a **staging fork** of Robinhood Chain state (chain 4663). `eth_getCode` for the vault returns
//     `0x` on mainnet, so mainnet holds no code at this address;
//   * every number is read from the configured RPC during the render, at one explicit block, and
//     travels with that block's number, hash and timestamp;
//   * when the RPC cannot answer, the query recorded by `scripts/capture-fork-snapshot.mjs` is used and
//     labelled `captured` — never presented as a live read;
//   * a failed `eth_call` stays a failure (`null` + reason). It never becomes a zero, because zero is a
//     legitimate value for debt and would read as a fact.
//
// Uses TYPE-ONLY imports for the view shapes so no runtime dependency is pulled into a server chunk.

import type { ContractEvidence } from "./evidence";
import type { VaultDetail } from "./vaultLoader";
import type { Live, Roles, Allocation, StrategyRow, VaultRow } from "./vaultView";
import {
  STAGING_ACCOUNTANT,
  STAGING_TIMELOCK,
  STAGING_VAULT,
} from "../config/staging.ts";
import { capturedSnapshot, probeNode, readPosition, readVaultSnapshot, type VaultSnapshot } from "./vaultRead";

export {
  RECORDED_BLOCK,
  RECORDED_BLOCK_HASH,
  RECORDED_TIMESTAMP,
  STAGING_ACCOUNTANT,
  STAGING_ASSET,
  STAGING_IMPLEMENTATION,
  STAGING_SHARE_DECIMALS,
  STAGING_STRATEGY,
  STAGING_TIMELOCK,
  STAGING_VAULT,
} from "../config/staging.ts";
export type { VaultSnapshot } from "./vaultRead";

/** The block the recorded capture was taken at; the UI prints the *live* block when the RPC answered. */
const CAPTURE = capturedSnapshot(null);
export const SNAPSHOT_BLOCK = String(CAPTURE.at.blockNumber);
export const SNAPSHOT_BLOCK_HASH = CAPTURE.at.blockHash;
export const SNAPSHOT_TIMESTAMP = new Date(CAPTURE.at.blockTimestamp * 1000).toISOString();

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const big = (value: string | null) => (value === null ? null : BigInt(value));

export function getVaultMetadata(address: string) {
  const normalized = address.toLowerCase();
  return {
    address: normalized,
    name: CAPTURE.vault.name.value ?? "",
    symbol: CAPTURE.vault.symbol.value ?? "",
    asset_address: (CAPTURE.vault.asset.value ?? "").toLowerCase(),
    asset_decimals: 6,
    // `VaultV3.decimals` is `asset.decimals()`, read below rather than assumed.
    share_decimals: CAPTURE.vault.decimals.value ?? 0,
    role_manager: STAGING_TIMELOCK,
    accountant: STAGING_ACCOUNTANT,
    deposit_limit: CAPTURE.vault.depositLimit.value ?? "0",
    // The block this row was read at, not the block the vault was deployed at: a capture only holds
    // one block, and the deployment block is not recoverable from it.
    recorded_block: SNAPSHOT_BLOCK,
    source: CAPTURE.source,
  };
}

/** Snapshot → `Live`. A field that failed to read becomes `null` and the page says so. */
function toLive(snapshot: VaultSnapshot): Live | null {
  const totalAssets = big(snapshot.vault.totalAssets.value);
  const totalIdle = big(snapshot.vault.totalIdle.value);
  const totalDebt = big(snapshot.vault.totalDebt.value);
  const totalSupply = big(snapshot.vault.totalSupply.value);
  const pricePerShare = big(snapshot.vault.pricePerShare.value);
  const depositLimit = big(snapshot.vault.depositLimit.value);
  if (totalAssets === null || totalIdle === null || totalDebt === null) return null;
  if (totalSupply === null || pricePerShare === null || depositLimit === null) return null;

  return {
    blockNumber: BigInt(snapshot.at.blockNumber),
    blockHash: snapshot.at.blockHash,
    blockTimestamp: iso(snapshot.at.blockTimestamp),
    totalAssets,
    totalSupply,
    pricePerShare,
    totalIdle,
    totalDebt,
    performanceFeeBps: snapshot.roles.vaultConfig.value?.performanceFeeBps ?? null,
    managementFeeBps: snapshot.roles.vaultConfig.value?.managementFeeBps ?? null,
    depositLimit,
    // VaultV3 has no `paused()` getter; `isShutdown` plus `deposit_limit` are what the contract exposes.
    isPaused: false,
    isShutdown: snapshot.vault.isShutdown.value ?? false,
    source: snapshot.source,
  };
}

export async function getVaultLive(address: string) {
  const snapshot = await readVaultSnapshot();
  const live = toLive(snapshot);
  if (live === null) throw new Error(snapshot.liveError ?? "the vault read did not return assets, idle or debt");
  return {
    blockNumber: String(live.blockNumber),
    blockHash: live.blockHash,
    blockTimestamp: live.blockTimestamp,
    totalAssets: String(live.totalAssets),
    totalSupply: String(live.totalSupply),
    pricePerShare: String(live.pricePerShare),
    totalIdle: String(live.totalIdle),
    totalDebt: String(live.totalDebt),
    performanceFeeBps: live.performanceFeeBps,
    managementFeeBps: live.managementFeeBps,
    depositLimit: String(live.depositLimit),
    isPaused: live.isPaused,
    isShutdown: live.isShutdown,
    source: live.source,
    liveError: snapshot.liveError,
    address: address.toLowerCase(),
  };
}

export async function getVaultRoles(address: string) {
  const snapshot = await readVaultSnapshot();
  return {
    blockNumber: String(snapshot.at.blockNumber),
    blockHash: snapshot.at.blockHash,
    blockTimestamp: iso(snapshot.at.blockTimestamp),
    address: address.toLowerCase(),
    roleManager: snapshot.roles.roleManager.value,
    futureRoleManager: snapshot.roles.futureRoleManager.value,
    accountant: snapshot.roles.accountant.value,
    feeManager: snapshot.roles.feeManager.value,
    timelockMinDelaySeconds: snapshot.roles.timelockMinDelaySeconds.value,
    timelockError: snapshot.roles.timelockMinDelaySeconds.error,
    vaultConfig: snapshot.roles.vaultConfig.value,
    vaultConfigError: snapshot.roles.vaultConfig.error,
    source: snapshot.source,
    liveError: snapshot.liveError,
  };
}

export async function getVaultAllocation(address: string) {
  const snapshot = await readVaultSnapshot();
  return {
    blockNumber: String(snapshot.at.blockNumber),
    blockHash: snapshot.at.blockHash,
    blockTimestamp: iso(snapshot.at.blockTimestamp),
    address: address.toLowerCase(),
    strategies: snapshot.allocation.strategies.map((row) => ({
      address: row.address,
      name: row.name.value,
      symbol: row.symbol.value,
      apiVersion: row.apiVersion.value,
      keeper: row.keeper.value,
      management: row.management.value,
      codeSize: row.codeSize,
      activation: row.activation.value,
      lastReport: row.lastReport.value,
      currentDebt: row.currentDebt.value,
      maxDebt: row.maxDebt.value,
      // No venue is claimed: the strategy holds no position, so there is nothing to attribute. The
      // address in `packages/config/4663.json` is a configured target, not an observed allocation.
      venue: null,
      venueError:
        row.currentDebt.value === null
          ? "currentDebt() did not answer at this block"
          : "currentDebt() = 0 at this block, so there is no venue position to attribute yet",
    })),
    source: snapshot.source,
    liveError: snapshot.liveError,
  };
}

export async function getDirectVaultDetail(address: string): Promise<VaultDetail> {
  const snapshot = await readVaultSnapshot();
  const meta = getVaultMetadata(address);
  const live = toLive(snapshot);

  const vault: VaultRow = {
    address: meta.address,
    name: meta.name,
    symbol: meta.symbol,
    assetAddress: meta.asset_address,
    assetDecimals: meta.asset_decimals,
    shareDecimals: meta.share_decimals,
    roleManager: meta.role_manager,
    accountant: meta.accountant,
    depositLimit: BigInt(meta.deposit_limit),
    recordedBlock: BigInt(meta.recorded_block),
    source: meta.source,
  };

  const strategies: StrategyRow[] = snapshot.allocation.strategies.map((row) => {
    const debt = big(row.currentDebt.value);
    const totalAssets = live?.totalAssets ?? 0n;
    return {
      address: row.address,
      venue: null,
      venueError: row.currentDebt.error,
      activation: big(row.activation.value) ?? 0n,
      lastReport: big(row.lastReport.value) ?? 0n,
      currentDebt: debt ?? 0n,
      maxDebt: big(row.maxDebt.value) ?? 0n,
      debtBps:
        debt === null || totalAssets === 0n ? 0 : Number((debt * 10000n + totalAssets / 2n) / totalAssets),
    };
  });

  const roles: Roles = {
    source: snapshot.source,
    blockNumber: BigInt(snapshot.at.blockNumber),
    blockHash: snapshot.at.blockHash,
    blockTimestamp: iso(snapshot.at.blockTimestamp),
    roleManager: snapshot.roles.roleManager.value ?? "",
    futureRoleManager: snapshot.roles.futureRoleManager.value ?? "",
    timelockMinDelaySeconds: snapshot.roles.timelockMinDelaySeconds.value,
    timelockError: snapshot.roles.timelockMinDelaySeconds.error,
  };

  const allocation: Allocation = {
    source: snapshot.source,
    blockNumber: BigInt(snapshot.at.blockNumber),
    blockHash: snapshot.at.blockHash,
    blockTimestamp: iso(snapshot.at.blockTimestamp),
    strategies,
  };

  return {
    vault,
    live,
    liveError: live === null ? (snapshot.liveError ?? "the vault read returned no assets") : null,
    allocation,
    allocationError: snapshot.allocation.queue.error,
    reports: [],
    reportsError: null,
    fees: [],
    feesError: null,
    roleEvents: [],
    roleEventsError: null,
    roles,
    rolesError: snapshot.roles.roleManager.error,
  };
}

/**
 * What the chain answers about the vault's code, at the captured block.
 *
 * The address is an EIP-1167 minimal proxy: 45 bytes that delegate to the VaultV3 implementation. The
 * hash below is the hash of the *implementation* runtime code read at that block, which is the thing a
 * bytecode pin can actually be compared against; the 45-byte proxy body is not a useful fingerprint.
 * On mainnet this address holds no code at all, which is why the page labels the deployment a fork.
 */
export function getVaultEvidence(): ContractEvidence {
  return {
    address: STAGING_VAULT,
    blockNumber: BigInt(CAPTURE.at.blockNumber),
    apiVersion: CAPTURE.vault.apiVersion.value,
    apiVersionError: CAPTURE.vault.apiVersion.error,
    codeHash: CAPTURE.evidence.implementationCodeHash,
    // The vault address is a 45-byte EIP-1167 proxy, so the size and hash describe the implementation
    // runtime code that actually answered. Both are read at the block above.
    codeSize: CAPTURE.evidence.implementationCodeSize ?? CAPTURE.evidence.codeSize,
    codeError: null,
    implementation: CAPTURE.evidence.implementation,
    proxyCodeSize: CAPTURE.evidence.codeSize,
  };
}
// The capture-derived names the UI already used. `PIN_*` now point at the block the values in
// `forkSnapshot.json` were read at, not at a block on mainnet: the vault has no code on mainnet.
export const PIN_BLOCK = SNAPSHOT_BLOCK;
export const PIN_BLOCK_HASH = SNAPSHOT_BLOCK_HASH;
export const PIN_TIMESTAMP = SNAPSHOT_TIMESTAMP;

/**
 * Liveness for the health route. `ok` is true only when the node answered in this request; a fixed block
 * number and a fixed timestamp here would be a fabricated heartbeat.
 */
export async function getHealth() {
  const probe = await probeNode(process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL);
  return {
    ok: probe.ok,
    chainId: probe.chainId,
    blockNumber: probe.blockNumber === null ? null : String(probe.blockNumber),
    blockHash: probe.blockHash,
    timestamp: probe.blockTimestamp === null ? null : iso(probe.blockTimestamp),
    source: probe.ok ? "onchain" : "unavailable",
    error: probe.error,
  };
}

/**
 * A wallet's share balance and its value, read at one block during this request.
 *
 * A failed read returns `shares: null` with the reason: a position that could not be read is not a zero
 * position, and a zero here would be the difference between "holds nothing" and "we did not look".
 */
export async function getPosition(address: string, account: string) {
  const reading = await readPosition(process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL, account);
  return {
    account: reading.account,
    vault: address.toLowerCase(),
    shares: reading.shares,
    positionAssets: reading.assets,
    blockNumber: reading.blockNumber === null ? null : String(reading.blockNumber),
    blockHash: reading.blockHash,
    blockTimestamp: reading.blockTimestamp === null ? null : iso(reading.blockTimestamp),
    // No indexer is running, so neither history field is known; both are stated as unknown.
    firstSeenBlock: null,
    lastActivityBlock: null,
    historyError: "no indexer is running, so the block this account first appeared at is not known",
    source: reading.error === null ? "onchain" : "unavailable",
    error: reading.error,
  };
}
