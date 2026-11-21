// Two jobs, both deliberately incapable of reporting a loss.
//
// `process_report` on a losing strategy hits `Accountant.report` and reverts with "too much loss"
// unless a fee manager has run `turnOffHealthCheck` (`Accountant.sol:241-246`). A keeper that
// retried that revert forever would be a noise machine, and one that suppressed the health check to
// make the transaction pass would be hiding an incident. Policy: a loss is an alert for a human, a
// gain is routine. The simulation step then makes the policy enforceable, not aspirational.

import { encodeFunctionData } from "viem";
import { vaultV3Abi } from "@avenor/sdk";
import type { Job, JobResult } from "./keeper.ts";

export interface VaultSnapshot {
  blockNumber: bigint;
  totalAssets: bigint;
  totalIdle: bigint;
  totalDebt: bigint;
  isShutdown: boolean;
  minimumTotalIdle: bigint;
  depositLimit: bigint;
}

export interface StrategySnapshot {
  currentDebt: bigint;
  maxDebt: bigint;
}

export interface VaultReader {
  vault(): Promise<VaultSnapshot>;
  /** Same block as the vault snapshot: available idle and debt must describe one state. */
  strategy(address: `0x${string}`, blockNumber?: bigint): Promise<StrategySnapshot>;
  /**
   * `MorphoVaultStrategy.totalAssetsIncludingIdle()`, not `ITokenizedStrategy.totalAssets()`:
   * the latter returns stored totals while a transaction is being simulated in the same block
   * (`TokenizedStrategy._simulatedTotals`), so a keeper that read it would under-report and skip a
   * real gain.
   */
  strategyAssets(address: `0x${string}`, blockNumber?: bigint): Promise<bigint>;
}

const BPS = 10_000n;

function bpsOf(part: bigint, whole: bigint): bigint {
  if (whole === 0n) throw new Error("bpsOf: zero denominator");
  return (part * BPS) / whole;
}

export interface ReportJobConfig {
  vault: `0x${string}`;
  strategy: `0x${string}`;
  /** Report only when unrealised gain is at least this share of current debt. Required. */
  minGainBps: number;
  /** `Accountant.maxGain`, mirrored so the keeper can explain a skip instead of tripping it. Optional. */
  maxGainBps?: number;
}

export function reportJob(reader: VaultReader, cfg: ReportJobConfig): Job {
  if (!Number.isInteger(cfg.minGainBps) || cfg.minGainBps < 0 || cfg.minGainBps > 10_000) {
    throw new Error(`minGainBps must be an integer in 0..10000, got ${cfg.minGainBps}`);
  }
  if (cfg.maxGainBps !== undefined && (!Number.isInteger(cfg.maxGainBps) || cfg.maxGainBps < 0)) {
    throw new Error(`maxGainBps must be an integer >= 0, got ${cfg.maxGainBps}`);
  }

  return {
    name: "report",
    async plan(): Promise<JobResult> {
      const vault = await reader.vault();
      if (vault.isShutdown) {
        return { blockNumber: vault.blockNumber, action: null, reason: "vault is shutdown; reporting nothing" };
      }
      const strategy = await reader.strategy(cfg.strategy, vault.blockNumber);
      if (strategy.currentDebt === 0n) {
        return { blockNumber: vault.blockNumber, action: null, reason: "strategy has no debt; a gain has no percentage basis" };
      }

      const assets = await reader.strategyAssets(cfg.strategy, vault.blockNumber);
      const delta = assets - strategy.currentDebt;

      if (delta < 0n) {
        return {
          blockNumber: vault.blockNumber,
          action: null,
          level: "alert",
          reason: `loss of ${-delta} observed; loss reports need a human (maxLoss + health check)`,
          detail: { strategyAssets: assets.toString(), currentDebt: strategy.currentDebt.toString() },
        };
      }

      const gainBps = bpsOf(delta, strategy.currentDebt);
      if (gainBps < BigInt(cfg.minGainBps)) {
        return {
          blockNumber: vault.blockNumber,
          action: null,
          reason: `gain ${gainBps} bps below threshold ${cfg.minGainBps} bps`,
          detail: { gain: delta.toString(), currentDebt: strategy.currentDebt.toString() },
        };
      }
      if (cfg.maxGainBps !== undefined && gainBps > BigInt(cfg.maxGainBps)) {
        return {
          blockNumber: vault.blockNumber,
          action: null,
          level: "alert",
          reason: `gain ${gainBps} bps above Accountant.maxGain ${cfg.maxGainBps} bps; report would revert`,
          detail: { gain: delta.toString(), currentDebt: strategy.currentDebt.toString() },
        };
      }

      return {
        blockNumber: vault.blockNumber,
        action: {
          to: cfg.vault,
          data: encodeFunctionData({ abi: vaultV3Abi, functionName: "process_report", args: [cfg.strategy] }),
        },
        detail: { gain: delta.toString(), gainBps: gainBps.toString() },
      };
    },
  };
}

export interface AllocationJobConfig {
  vault: `0x${string}`;
  strategy: `0x${string}`;
  /** Never push the vault below this, even if `minimum_total_idle` is misconfigured to 0. Required. */
  hardIdleFloor: bigint;
}

export function allocationJob(reader: VaultReader, cfg: AllocationJobConfig): Job {
  if (cfg.hardIdleFloor < 0n) throw new Error("hardIdleFloor must be >= 0");

  return {
    name: "allocate",
    async plan(): Promise<JobResult> {
      const vault = await reader.vault();
      if (vault.isShutdown) {
        return { blockNumber: vault.blockNumber, action: null, reason: "vault is shutdown; no new allocation" };
      }
      const strategy = await reader.strategy(cfg.strategy, vault.blockNumber);

      const idleFloor = vault.minimumTotalIdle > cfg.hardIdleFloor ? vault.minimumTotalIdle : cfg.hardIdleFloor;
      const available = vault.totalIdle > idleFloor ? vault.totalIdle - idleFloor : 0n;
      if (available === 0n) {
        return {
          blockNumber: vault.blockNumber,
          action: null,
          reason: "no idle above the floor",
          detail: { totalIdle: vault.totalIdle.toString(), idleFloor: idleFloor.toString() },
        };
      }

      const headroom = strategy.maxDebt > strategy.currentDebt ? strategy.maxDebt - strategy.currentDebt : 0n;
      const target = strategy.currentDebt + (available < headroom ? available : headroom);
      if (target <= strategy.currentDebt) {
        return {
          blockNumber: vault.blockNumber,
          action: null,
          reason: "strategy is at max_debt",
          detail: { currentDebt: strategy.currentDebt.toString(), maxDebt: strategy.maxDebt.toString() },
        };
      }

      // `max_loss = 0` is explicit: this call raises debt, so no withdrawal from the venue happens
      // and any loss would mean the vault is misbehaving. Not passing it would default to 0 anyway;
      // writing it down keeps the rule visible in the calldata and in review.
      return {
        blockNumber: vault.blockNumber,
        action: {
          to: cfg.vault,
          data: encodeFunctionData({
            abi: vaultV3Abi,
            functionName: "update_debt",
            args: [cfg.strategy, target, 0n],
          }),
        },
        detail: { target: target.toString(), available: available.toString(), headroom: headroom.toString() },
      };
    },
  };
}