// Monitoring is a pure function over two snapshots: no I/O, so every threshold can be tested at the
// exact boundary and an alarm cannot be "explained away" by a network error.

export interface MonitorSnapshot {
  blockNumber: bigint;
  blockTimestamp: Date;
  isShutdown: boolean;
  isPaused: boolean;
  depositLimit: bigint;
  totalAssets: bigint;
  totalIdle: bigint;
  /** Vault-level `maxWithdraw` for the treasury/owner account, i.e. what the queue can actually pay. */
  maxWithdraw: bigint;
  /**
   * Venue-level ERC-4626 `maxWithdraw`. Recorded, never alarmed on its own: at the pin it returns 0
   * for a fully redeemable position, so treating it as "no liquidity" would be a false alarm.
   */
  venueMaxWithdraw: bigint;
  /** `Accountant.performanceFee` in bps, when an accountant is wired. */
  performanceFeeBps?: number;
}

export interface MonitorThresholds {
  maxAssetsDeltaBps: number;
  runbookBaseUrl: string;
}

export type Severity = "critical" | "warning" | "info";

export interface Alert {
  severity: Severity;
  code: string;
  message: string;
  runbook: string;
  blockNumber: string;
  blockTimestamp: string;
  detail: Record<string, string>;
}

const BPS = 10_000n;

function deltaBps(current: bigint, previous: bigint): bigint {
  if (previous === 0n) return current === 0n ? 0n : BPS;
  const diff = current > previous ? current - previous : previous - current;
  return (diff * BPS) / previous;
}

export function evaluateHealth(
  snapshot: MonitorSnapshot,
  previous: MonitorSnapshot | null,
  thresholds: MonitorThresholds,
): Alert[] {
  if (!Number.isInteger(thresholds.maxAssetsDeltaBps) || thresholds.maxAssetsDeltaBps < 0) {
    throw new Error("maxAssetsDeltaBps must be an integer >= 0");
  }
  const alerts: Alert[] = [];
  const base = {
    blockNumber: snapshot.blockNumber.toString(),
    blockTimestamp: snapshot.blockTimestamp.toISOString(),
  };
  const alert = (severity: Severity, code: string, message: string, detail: Record<string, string> = {}) => {
    alerts.push({ ...base, severity, code, message, runbook: `${thresholds.runbookBaseUrl}#${code}`, detail });
  };

  if (snapshot.isShutdown) {
    alert("critical", "vault-shutdown", "vault is shutdown: deposits are closed and the queue must be migrated");
  }
  if (snapshot.isPaused) {
    alert("critical", "vault-paused", "vault is paused: withdrawals are blocked until an emergency manager unpauses");
  }
  if (!snapshot.isShutdown && snapshot.depositLimit === 0n) {
    alert("warning", "deposits-closed", "deposit_limit is 0 while the vault is not shutdown");
  }
  if (snapshot.maxWithdraw === 0n && snapshot.totalIdle === 0n) {
    alert("warning", "no-withdrawal-capacity", "maxWithdraw and totalIdle are both 0: nothing can be paid out now", {
      totalAssets: snapshot.totalAssets.toString(),
    });
  }

  if (previous !== null) {
    const drift = deltaBps(snapshot.totalAssets, previous.totalAssets);
    if (drift > BigInt(thresholds.maxAssetsDeltaBps)) {
      const direction = snapshot.totalAssets >= previous.totalAssets ? "up" : "down";
      alert("critical", "total-assets-moved", `totalAssets moved ${direction} ${drift} bps since block ${previous.blockNumber}`, {
        previous: previous.totalAssets.toString(),
        current: snapshot.totalAssets.toString(),
        thresholdBps: String(thresholds.maxAssetsDeltaBps),
      });
    }
    if (previous.depositLimit !== snapshot.depositLimit) {
      alert("info", "deposit-limit-changed", `deposit_limit changed ${previous.depositLimit} -> ${snapshot.depositLimit}`);
    }
    if (
      previous.performanceFeeBps !== undefined &&
      snapshot.performanceFeeBps !== undefined &&
      previous.performanceFeeBps !== snapshot.performanceFeeBps
    ) {
      alert("warning", "fee-config-changed", `performanceFee changed ${previous.performanceFeeBps} -> ${snapshot.performanceFeeBps} bps`);
    }
  }

  return alerts;
}