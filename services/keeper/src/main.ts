// Runtime entry point. Everything here is wiring; the decisions it wires are tested in
// `keeper.ts`, `jobs.ts`, `monitor.ts`, and `monitorReader.ts`.
//
// Two independent loops share one process:
//   * jobs (report / allocate) at INTERVAL_MS, serial, simulate-before-send;
//   * monitor at MONITOR_INTERVAL_MS, which never throws away an alert because the webhook is down —
//     delivery failure is logged as an error entry and retried on the next tick.

import { existsSync } from "node:fs";
import { createPublicClient, createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseKeeperConfig } from "./config.ts";
import { allocationJob, reportJob } from "./jobs.ts";
import { Keeper } from "./keeper.ts";
import { jsonLogger } from "./log.ts";
import { evaluateHealth, type MonitorSnapshot } from "./monitor.ts";
import { createMonitorReader } from "./monitorReader.ts";
import { webhookNotifier } from "./notify.ts";
import { createVaultReader } from "./reader.ts";
import { createViemSender } from "./viemSender.ts";

const STOP_FILE = process.env.KEEPER_STOP_FILE ?? ".keeper-stop";
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS ?? "60000");
const MAX_ASSETS_DELTA_BPS = Number(process.env.MAX_ASSETS_DELTA_BPS ?? "");
const RUNBOOK_BASE_URL = process.env.RUNBOOK_BASE_URL ?? "";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const cfg = (() => {
  try {
    return parseKeeperConfig(process.env);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
})();

if (!Number.isInteger(MAX_ASSETS_DELTA_BPS) || MAX_ASSETS_DELTA_BPS < 0) {
  fail("MAX_ASSETS_DELTA_BPS must be an integer >= 0: an unnamed threshold is not a threshold");
}
if (RUNBOOK_BASE_URL === "") fail("RUNBOOK_BASE_URL is required so every alert links to a procedure");

const account = privateKeyToAccount(cfg.privateKey);
const transport = cfg.fallbackRpcUrls && cfg.fallbackRpcUrls.length > 0
  ? fallback([http(cfg.rpcUrl), ...cfg.fallbackRpcUrls.map((url) => http(url))])
  : http(cfg.rpcUrl);

const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
const logger = jsonLogger();

const vaultReader = createVaultReader(publicClient as never, { vault: cfg.vault, strategy: cfg.strategy });
const sender = createViemSender({ publicClient: publicClient as never, walletClient: walletClient as never, account });
const keeper = new Keeper({
  sender,
  logger,
  jobs: [
    reportJob(vaultReader, { vault: cfg.vault, strategy: cfg.strategy, minGainBps: cfg.minGainBps, maxGainBps: cfg.maxGainBps }),
    allocationJob(vaultReader, { vault: cfg.vault, strategy: cfg.strategy, hardIdleFloor: cfg.hardIdleFloor }),
  ],
});

const monitorReader = createMonitorReader(publicClient as never, {
  vault: cfg.vault,
  strategy: cfg.strategy,
  owner: account.address,
});
const notifier = cfg.alertWebhookUrl === undefined ? null : webhookNotifier({ url: cfg.alertWebhookUrl });
let previous: MonitorSnapshot | null = null;

function log(level: "info" | "alert" | "error", job: string, status: "sent" | "skipped" | "failed", reason: string) {
  logger.write({
    ts: new Date().toISOString(),
    level,
    job,
    blockNumber: null,
    status,
    reason,
  });
}

async function tick(): Promise<void> {
  if (existsSync(STOP_FILE)) {
    keeper.stop();
    log("alert", "kill-switch", "skipped", `stop file ${STOP_FILE} exists; jobs halted, monitor keeps reading`);
    return;
  }
  try {
    await keeper.runOnce();
  } catch (error) {
    log("error", "keeper", "failed", error instanceof Error ? error.message : String(error));
  }
}

async function monitorTick(): Promise<void> {
  try {
    const snapshot = await monitorReader.snapshot();
    const alerts = evaluateHealth(snapshot, previous, {
      maxAssetsDeltaBps: MAX_ASSETS_DELTA_BPS,
      runbookBaseUrl: RUNBOOK_BASE_URL,
    });
    previous = snapshot;
    if (alerts.length === 0) return;
    if (notifier === null) {
      log("error", "monitor", "failed", `${alerts.length} alert(s) with no ALERT_WEBHOOK_URL configured`);
      return;
    }
    try {
      await notifier.send(alerts, {
        blockNumber: snapshot.blockNumber.toString(),
        blockTimestamp: snapshot.blockTimestamp.toISOString(),
      });
    } catch (error) {
      log("error", "monitor", "failed", `alert delivery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    log("error", "monitor", "failed", error instanceof Error ? error.message : String(error));
  }
}

log("info", "keeper", "sent", `starting as ${account.address} on vault ${cfg.vault}`);

const jobTimer = setInterval(() => void tick(), cfg.intervalMs);
const monitorTimer = setInterval(() => void monitorTick(), MONITOR_INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    keeper.stop();
    clearInterval(jobTimer);
    clearInterval(monitorTimer);
    log("alert", "keeper", "skipped", `${signal}: jobs halted; no transaction is in flight after this line`);
    process.exit(0);
  });
}

void tick();
void monitorTick();