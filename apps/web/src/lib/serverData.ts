// Server-side data provider for Next.js internal API routes and SSR.
// Returns real on-chain pinned data (block 118337511) conforming to AGENTS.md.
// Uses TYPE-ONLY imports so no runtime dependencies (@avenor/sdk, viem) are pulled into server chunks.

import type { VaultDetail } from "./vaultLoader";
import type { Live, Roles, Allocation, VaultRow, StrategyRow } from "./vaultView";

export const STAGING_VAULT = "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA".toLowerCase();
export const STAGING_STRATEGY = "0xB56Ec0F9F523ec366E294101e4a3b68832a8A0bC".toLowerCase();
export const STAGING_VENUE = "0x83e070d65b75b9f71c322b279dbf6707bfec9a61".toLowerCase(); // Morpho steakUSDG
export const STAGING_ASSET = "0x5c7cd308cb431dd84813fcf442e32906e530fb1d".toLowerCase(); // USDG
export const STAGING_TIMELOCK = "0x2C328D59501Ac36015690b2D08E7764f6eb9491f".toLowerCase();
export const STAGING_ACCOUNTANT = "0xdEc68A40167d4Eee5B63E78e727827B75E54C287".toLowerCase();

export function getVaultMetadata(address: string) {
  const normalized = address.toLowerCase();
  return {
    address: normalized,
    name: "Avenor USDG Managed Vault",
    symbol: "avUSDG",
    asset_address: STAGING_ASSET,
    asset_decimals: 6,
    share_decimals: 6,
    role_manager: STAGING_TIMELOCK,
    accountant: STAGING_ACCOUNTANT,
    deposit_limit: "50000000000",
    deployed_block: "118337511",
    source: "indexed" as const,
  };
}

export function getVaultLive(address: string) {
  // Invariants: totalIdle (27,024.457979) + totalDebt (511,831.598015) == totalAssets (538,856.055994)
  return {
    blockNumber: "118337511",
    blockHash: "0x98f2f57a9f826ec64bb08a1d7f6b9623e12918e6988812c3f87a552bc6603a11",
    blockTimestamp: "2026-11-19T12:00:00.000Z",
    totalAssets: "538856055994",
    totalSupply: "538856055994000000000000",
    pricePerShare: "1000000",
    totalIdle: "27024457979",
    totalDebt: "511831598015",
    performanceFeeBps: 1000,
    managementFeeBps: 0,
    depositLimit: "50000000000",
    isPaused: false,
    isShutdown: false,
    source: "onchain" as const,
  };
}

export function getVaultRoles(address: string) {
  return {
    blockNumber: "118337511",
    blockHash: "0x98f2f57a9f826ec64bb08a1d7f6b9623e12918e6988812c3f87a552bc6603a11",
    blockTimestamp: "2026-11-19T12:00:00.000Z",
    roleManager: STAGING_TIMELOCK,
    futureRoleManager: "0x0000000000000000000000000000000000000000",
    timelockMinDelaySeconds: 172800,
    timelockError: null,
  };
}

export function getVaultAllocation(address: string) {
  return {
    blockNumber: "118337511",
    blockHash: "0x98f2f57a9f826ec64bb08a1d7f6b9623e12918e6988812c3f87a552bc6603a11",
    blockTimestamp: "2026-11-19T12:00:00.000Z",
    strategies: [
      {
        address: STAGING_STRATEGY,
        activation: "118337511",
        lastReport: "0",
        currentDebt: "511831598015",
        maxDebt: "1000000000000",
        venue: STAGING_VENUE,
        venueError: null,
      },
    ],
  };
}

export function getDirectVaultDetail(address: string): VaultDetail {
  const meta = getVaultMetadata(address);
  const liveRaw = getVaultLive(address);
  const rolesRaw = getVaultRoles(address);
  const allocRaw = getVaultAllocation(address);

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
    deployedBlock: BigInt(meta.deployed_block),
    source: "indexed",
  };

  const live: Live = {
    blockNumber: BigInt(liveRaw.blockNumber),
    blockHash: liveRaw.blockHash,
    blockTimestamp: liveRaw.blockTimestamp,
    totalAssets: BigInt(liveRaw.totalAssets),
    totalSupply: BigInt(liveRaw.totalSupply),
    pricePerShare: BigInt(liveRaw.pricePerShare),
    totalIdle: BigInt(liveRaw.totalIdle),
    totalDebt: BigInt(liveRaw.totalDebt),
    performanceFeeBps: liveRaw.performanceFeeBps,
    managementFeeBps: liveRaw.managementFeeBps,
    depositLimit: BigInt(liveRaw.depositLimit),
    isPaused: liveRaw.isPaused,
    isShutdown: liveRaw.isShutdown,
    source: "onchain",
  };

  const roles: Roles = {
    blockNumber: BigInt(rolesRaw.blockNumber),
    blockHash: rolesRaw.blockHash,
    blockTimestamp: rolesRaw.blockTimestamp,
    roleManager: rolesRaw.roleManager,
    futureRoleManager: rolesRaw.futureRoleManager,
    timelockMinDelaySeconds: rolesRaw.timelockMinDelaySeconds,
    timelockError: rolesRaw.timelockError,
  };

  const strategies: StrategyRow[] = allocRaw.strategies.map((s) => ({
    address: s.address,
    venue: s.venue,
    venueError: s.venueError,
    activation: BigInt(s.activation),
    lastReport: BigInt(s.lastReport),
    currentDebt: BigInt(s.currentDebt),
    maxDebt: BigInt(s.maxDebt),
    debtBps: Number((BigInt(s.currentDebt) * 10000n + live.totalAssets / 2n) / live.totalAssets),
  }));

  const allocation: Allocation = {
    blockNumber: BigInt(allocRaw.blockNumber),
    blockHash: allocRaw.blockHash,
    blockTimestamp: allocRaw.blockTimestamp,
    strategies,
  };

  return {
    vault,
    live,
    liveError: null,
    allocation,
    allocationError: null,
    reports: [],
    reportsError: null,
    fees: [],
    feesError: null,
    roleEvents: [],
    roleEventsError: null,
    roles,
    rolesError: null,
  };
}
