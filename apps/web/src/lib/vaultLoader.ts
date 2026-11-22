// Loads everything the vault page shows, one request per section, and keeps each failure separate.
// The page cannot fall back to zero for a section that failed, so the loader reports the error
// instead of substituting a value.

import { ApiError, fetchJson } from "./api.ts";
import {
  parseAllocation,
  parseFees,
  parseLive,
  parseReports,
  parseRoleEvents,
  parseRoles,
  parseVaultRow,
  type Allocation,
  type FeeRow,
  type Live,
  type ReportRow,
  type RoleEventRow,
  type Roles,
  type VaultRow,
} from "./vaultView.ts";

export interface VaultDetail {
  vault: VaultRow;
  live: Live | null;
  liveError: unknown;
  allocation: Allocation | null;
  allocationError: unknown;
  reports: ReportRow[];
  reportsError: unknown;
  fees: FeeRow[];
  feesError: unknown;
  roleEvents: RoleEventRow[];
  roleEventsError: unknown;
  roles: Roles | null;
  rolesError: unknown;
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetch the vault, its live numbers and its reports in parallel, then read allocation at the same
 * block the live numbers came from. Reading allocation at "latest" would compare two different
 * blocks and quietly produce a percentage that never existed.
 */
export async function loadVaultDetail(base: string, address: string): Promise<VaultDetail> {
  const path = `/v1/vaults/${address}`;
  const [vaultResult, liveResult, reportsResult, rolesResult, feesResult, roleEventsResult] = await Promise.allSettled([
    fetchJson(`${base}${path}`),
    fetchJson(`${base}${path}/live`),
    fetchJson(`${base}${path}/reports?limit=5`),
    fetchJson(`${base}${path}/roles`),
    fetchJson(`${base}${path}/fees?limit=5`),
    fetchJson(`${base}${path}/role-events?limit=5`),
  ]);

  if (vaultResult.status === "rejected") throw vaultResult.reason;
  const vault = parseVaultRow(vaultResult.value);

  let live: Live | null = null;
  let liveError: unknown = null;
  try {
    if (liveResult.status === "rejected") throw liveResult.reason;
    live = parseLive(liveResult.value);
  } catch (error) {
    liveError = error;
  }

  let allocation: Allocation | null = null;
  let allocationError: unknown = null;
  if (live === null) {
    allocationError = new Error("alokasi tidak dibaca karena angka live tidak tersedia");
  } else {
    try {
      allocation = parseAllocation(
        await fetchJson(`${base}${path}/allocation?block=${live.blockNumber}`),
        live.totalAssets,
      );
    } catch (error) {
      allocationError = error;
    }
  }

  let reports: ReportRow[] = [];
  let reportsError: unknown = null;
  try {
    if (reportsResult.status === "rejected") throw reportsResult.reason;
    reports = parseReports(reportsResult.value);
  } catch (error) {
    reportsError = new Error(describe(error));
  }

  let roles: Roles | null = null;
  let rolesError: unknown = null;
  try {
    if (rolesResult.status === "rejected") throw rolesResult.reason;
    roles = parseRoles(rolesResult.value);
  } catch (error) {
    rolesError = error;
  }

  let fees: FeeRow[] = [];
  let feesError: unknown = null;
  try {
    if (feesResult.status === "rejected") throw feesResult.reason;
    fees = parseFees(feesResult.value);
  } catch (error) {
    feesError = error;
  }

  let roleEvents: RoleEventRow[] = [];
  let roleEventsError: unknown = null;
  try {
    if (roleEventsResult.status === "rejected") throw roleEventsResult.reason;
    roleEvents = parseRoleEvents(roleEventsResult.value);
  } catch (error) {
    roleEventsError = error;
  }

  return {
    vault,
    live,
    liveError,
    allocation,
    allocationError,
    reports,
    reportsError,
    fees,
    feesError,
    roleEvents,
    roleEventsError,
    roles,
    rolesError,
  };
}