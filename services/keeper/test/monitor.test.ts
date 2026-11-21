import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { evaluateHealth, type MonitorSnapshot } from "../src/monitor.ts";
import { webhookNotifier, WebhookError } from "../src/notify.ts";
import { parseKeeperConfig } from "../src/config.ts";
import { createPublicClient, custom, encodeAbiParameters, encodeFunctionResult, toFunctionSelector } from "viem";
import { vaultV3Abi } from "@avenor/sdk";
import { createMonitorReader } from "../src/monitorReader.ts";
import { startFakeNode } from "./fakeNode.ts";
import { transport } from "./transport.ts";

const THRESHOLDS = { maxAssetsDeltaBps: 100, runbookBaseUrl: "https://runbook.example/incidents" };

function snapshot(overrides: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    blockNumber: 118_337_511n,
    blockTimestamp: new Date(1_795_103_654_000),
    isShutdown: false,
    isPaused: false,
    depositLimit: 1_000_000_000_000n,
    totalAssets: 538_856_055_994n,
    totalIdle: 27_024_457_979n,
    maxWithdraw: 27_024_457_979n,
    venueMaxWithdraw: 0n,
    performanceFeeBps: 1_000,
    ...overrides,
  };
}

test("venue maxWithdraw 0 alone is not an alarm, by design", () => {
  const alerts = evaluateHealth(snapshot(), null, THRESHOLDS);
  assert.deepEqual(alerts, [], "the venue answers 0 for a redeemable position at the pin");
});

test("shutdown and pause are critical and point at a runbook anchor", () => {
  const shutdown = evaluateHealth(snapshot({ isShutdown: true, depositLimit: 0n }), null, THRESHOLDS);
  const paused = evaluateHealth(snapshot({ isPaused: true }), null, THRESHOLDS);
  assert.equal(shutdown[0]!.code, "vault-shutdown");
  assert.equal(shutdown[0]!.severity, "critical");
  assert.equal(shutdown[0]!.runbook, "https://runbook.example/incidents#vault-shutdown");
  assert.equal(paused[0]!.code, "vault-paused");
  assert.equal(paused[0]!.blockNumber, "118337511");
});

test("deposits closed is a warning, and it is not double-reported for a shutdown vault", () => {
  const closed = evaluateHealth(snapshot({ depositLimit: 0n }), null, THRESHOLDS);
  assert.deepEqual(closed.map((alert) => alert.code), ["deposits-closed"]);
  const shutdown = evaluateHealth(snapshot({ depositLimit: 0n, isShutdown: true }), null, THRESHOLDS);
  assert.deepEqual(shutdown.map((alert) => alert.code), ["vault-shutdown"]);
});

test("no exit path at all is reported; a paid-out position is not", () => {
  const empty = evaluateHealth(snapshot({ maxWithdraw: 0n, totalIdle: 0n }), null, THRESHOLDS);
  assert.equal(empty[0]!.code, "no-withdrawal-capacity");
  const paid = evaluateHealth(snapshot({ maxWithdraw: 0n, totalIdle: 27_024_457_979n }), null, THRESHOLDS);
  assert.deepEqual(paid, []);
});

test("totalAssets drift is measured in bps against the previous block, both directions", () => {
  const previous = snapshot();
  const quiet = evaluateHealth(snapshot({ totalAssets: 539_000_000_000n }), previous, THRESHOLDS);
  assert.deepEqual(quiet, [], "26 bps is below the 100 bps threshold");

  const jumped = evaluateHealth(snapshot({ totalAssets: 545_000_000_000n }), previous, THRESHOLDS);
  assert.equal(jumped[0]!.code, "total-assets-moved");
  assert.match(jumped[0]!.message, /moved up/);

  const fell = evaluateHealth(snapshot({ totalAssets: 530_000_000_000n }), previous, THRESHOLDS);
  assert.match(fell[0]!.message, /moved down/);
  assert.equal(fell[0]!.detail.thresholdBps, "100");
});

test("parameter changes are reported as info/warning, never silently absorbed", () => {
  const previous = snapshot();
  const changed = evaluateHealth(snapshot({ depositLimit: 2n, performanceFeeBps: 2_000 }), previous, THRESHOLDS);
  assert.deepEqual(changed.map((alert) => alert.code).sort(), ["deposit-limit-changed", "fee-config-changed"]);
  assert.equal(changed.find((alert) => alert.code === "fee-config-changed")!.severity, "warning");
});

test("a real HTTP round trip delivers the alert payload", async () => {
  const received: string[] = [];
  let timestampHeader = "";
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push(body);
      timestampHeader = request.headers["content-type"] ?? "";
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");

  try {
    const notifier = webhookNotifier({ url: `http://127.0.0.1:${address.port}` });
    const alerts = evaluateHealth(snapshot({ isPaused: true }), null, THRESHOLDS);
    await notifier.send(alerts, { blockNumber: "118337511", blockTimestamp: "2026-11-19T12:00:00.000Z" });

    assert.equal(received.length, 1);
    assert.match(timestampHeader, /application\/json/);
    const payload = JSON.parse(received[0]!) as { text: string; alerts: { code: string }[]; blockNumber: string };
    assert.match(payload.text, /vault-paused/);
    assert.equal(payload.blockNumber, "118337511");
    assert.equal(payload.alerts[0]!.code, "vault-paused");

    await notifier.send([], { blockNumber: "1", blockTimestamp: "2026-01-01T00:00:00.000Z" });
    assert.equal(received.length, 1, "no alerts means no request, not an empty page");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a non-2xx webhook is a delivery failure, not a silent success", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(503);
    response.end("down");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  try {
    const notifier = webhookNotifier({ url: `http://127.0.0.1:${address.port}` });
    await assert.rejects(
      () => notifier.send(evaluateHealth(snapshot({ isShutdown: true }), null, THRESHOLDS), { blockNumber: "1", blockTimestamp: "t" }),
      WebhookError,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("config parsing names the missing variable", () => {
  const base = {
    RPC_URL: "http://127.0.0.1:8545",
    VAULT_ADDRESS: "0xbeef00000000000000000000000000000000beef",
    STRATEGY_ADDRESS: "0x5eed000000000000000000000000000000005eed",
    KEEPER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    MIN_GAIN_BPS: "100",
    HARD_IDLE_FLOOR: "1000000000",
    INTERVAL_MS: "60000",
  };
  const parsed = parseKeeperConfig(base);
  assert.equal(parsed.minGainBps, 100);
  assert.equal(parsed.maxGainBps, undefined);
  assert.equal(parsed.hardIdleFloor, 1_000_000_000n);
  assert.equal(parsed.alertWebhookUrl, undefined);

  assert.throws(() => parseKeeperConfig({ ...base, RPC_URL: "" }), /RPC_URL is required/);
  assert.throws(() => parseKeeperConfig({ ...base, VAULT_ADDRESS: "0x123" }), /20-byte hex address/);
  assert.throws(() => parseKeeperConfig({ ...base, KEEPER_PRIVATE_KEY: "0x1234" }), /32-byte hex string/);
  assert.throws(() => parseKeeperConfig({ ...base, MIN_GAIN_BPS: "10001" }), /MIN_GAIN_BPS must be an integer in 0..10000/);
  assert.throws(() => parseKeeperConfig({ ...base, MAX_GAIN_BPS: "abc" }), /MAX_GAIN_BPS must be an integer/);
  assert.equal(parseKeeperConfig({ ...base, MAX_GAIN_BPS: "500", ALERT_WEBHOOK_URL: "https://hooks.example/x" }).maxGainBps, 500);
});
test("the monitor reader pins one block and reports the venue number without trusting it", async () => {
  const node = await startFakeNode();
  try {
    const vault = "0xbeef00000000000000000000000000000000beef";
    const strategy = "0x5eed000000000000000000000000000000005eed";
    const accountant = "0xac0000000000000000000000000000000000ac00";
    const venue = "0x7e57e00000000000000000000000000000000001";
    const sel = (signature: string) => toFunctionSelector(signature);
    const vaultRaw = (name: string, result: unknown) =>
      encodeFunctionResult({ abi: vaultV3Abi, functionName: name, result: result as never });

    node.raw.set(`${vault}:${sel("isShutdown()")}`, vaultRaw("isShutdown", false));
    node.raw.set(`${vault}:${sel("isPaused()")}`, vaultRaw("isPaused", false));
    node.raw.set(`${vault}:${sel("deposit_limit()")}`, vaultRaw("deposit_limit", 1_000_000_000_000n));
    node.raw.set(`${vault}:${sel("totalAssets()")}`, vaultRaw("totalAssets", 538_856_055_994n));
    node.raw.set(`${vault}:${sel("totalIdle()")}`, vaultRaw("totalIdle", 27_024_457_979n));
    node.raw.set(`${vault}:${sel("maxWithdraw(address)")}`, vaultRaw("maxWithdraw", 27_024_457_979n));
    node.raw.set(`${vault}:${sel("accountant()")}`, vaultRaw("accountant", accountant));
    node.raw.set(
      `${strategy}:${sel("venue()")}`,
      encodeAbiParameters([{ type: "address" }], [venue]),
    );
    node.raw.set(
      `${venue}:${sel("maxWithdraw(address)")}`,
      encodeAbiParameters([{ type: "uint256" }], [0n]),
    );
    node.raw.set(
      `${accountant}:${sel("performanceFee()")}`,
      encodeAbiParameters([{ type: "uint16" }], [1000]),
    );

    const client = createPublicClient({ transport: custom(transport(node.url)) }) as never;
    const reader = createMonitorReader(client, { vault: vault as never, strategy: strategy as never, owner: vault as never });
    const snapshot = await reader.snapshot();

    assert.equal(snapshot.blockNumber, 100n);
    assert.equal(snapshot.totalAssets, 538_856_055_994n);
    assert.equal(snapshot.maxWithdraw, 27_024_457_979n);
    assert.equal(snapshot.venueMaxWithdraw, 0n);
    assert.equal(snapshot.performanceFeeBps, 1000);
    assert.equal(snapshot.totalAssets, 538_856_055_994n);
    assert.ok(node.calls.every((call) => call.block === "0x64"));
  } finally {
    await node.stop();
  }
});
