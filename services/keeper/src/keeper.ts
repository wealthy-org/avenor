// Keeper core: plan -> simulate -> send, one transaction at a time.
//
// Why one at a time: `VaultV3.update_debt` and `process_report` both move accounting state, and the
// second call's simulation would be computed against a state that no longer exists if the first one
// is still in flight. Serial execution is also what makes nonce management tractable without a
// nonce manager library.

import { isNonceError, type KeeperSender, type KeeperTx } from "./sender.ts";
import type { LogEntry, LogLevel, Logger } from "./log.ts";

export interface JobResult {
  blockNumber: bigint | null;
  /** null means "decided not to send"; `reason` must say why. */
  action: KeeperTx | null;
  level?: LogLevel;
  reason?: string;
  detail?: Record<string, string>;
}

export interface Job {
  name: string;
  plan(sender: KeeperSender): Promise<JobResult>;
  /** Called only after a successful send, so a baseline never advances on a failed transaction. */
  onSent?(result: JobResult, txHash: string): Promise<void> | void;
}

export class KeeperStoppedError extends Error {
  constructor() {
    super("keeper is stopped");
  }
}

export interface KeeperOptions {
  jobs: Job[];
  sender: KeeperSender;
  logger: Logger;
  now?: () => Date;
}

export class Keeper {
  private readonly jobs: Job[];
  private readonly sender: KeeperSender;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private nonce: number | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(options: KeeperOptions) {
    this.jobs = options.jobs;
    this.sender = options.sender;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Kill switch. Nothing queued behind this call is sent. */
  stop(): void {
    this.stopped = true;
  }

  async runOnce(): Promise<LogEntry[]> {
    if (this.stopped) throw new KeeperStoppedError();
    if (this.inFlight) throw new Error("runOnce is not reentrant; the previous run is still in flight");
    this.inFlight = true;
    const entries: LogEntry[] = [];
    try {
      for (const job of this.jobs) {
        if (this.stopped) throw new KeeperStoppedError();
        entries.push(await this.runJob(job));
      }
    } finally {
      this.inFlight = false;
    }
    return entries;
  }

  private async runJob(job: Job): Promise<LogEntry> {
    let planned: JobResult;
    try {
      planned = await job.plan(this.sender);
    } catch (error) {
      return this.emit({
        level: "error",
        job: job.name,
        blockNumber: null,
        status: "failed",
        reason: `plan failed: ${message(error)}`,
      });
    }

    const base = { job: job.name, blockNumber: planned.blockNumber === null ? null : planned.blockNumber.toString() };

    if (planned.action === null) {
      return this.emit({ ...base, level: planned.level ?? "info", status: "skipped", reason: planned.reason, detail: planned.detail });
    }

    const simulation = await this.sender.simulate(planned.action);
    if (!simulation.ok) {
      return this.emit({
        ...base,
        level: "alert",
        status: "skipped",
        reason: `simulation reverted: ${simulation.reason ?? "no reason given"}`,
        calldata: planned.action.data,
        detail: planned.detail,
      });
    }

    let nonce = await this.takeNonce();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const txHash = await this.sender.send(planned.action, nonce);
        this.nonce = nonce + 1;
        await job.onSent?.(planned, txHash);
        return this.emit({
          ...base,
          level: "info",
          status: "sent",
          txHash,
          nonce,
          calldata: planned.action.data,
          detail: planned.detail,
        });
      } catch (error) {
        if (isNonceError(error) && attempt === 0) {
          this.nonce = null;
          nonce = await this.takeNonce();
          continue;
        }
        return this.emit({
          ...base,
          level: "error",
          status: "failed",
          reason: `send failed: ${message(error)}`,
          nonce,
          calldata: planned.action.data,
        });
      }
    }
  }

  private async takeNonce(): Promise<number> {
    if (this.nonce === null) this.nonce = await this.sender.nonce();
    return this.nonce;
  }

  private emit(entry: Omit<LogEntry, "ts">): LogEntry {
    const full: LogEntry = { ts: this.now().toISOString(), ...entry };
    this.logger.write(full);
    return full;
  }
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}