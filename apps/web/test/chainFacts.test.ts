// Chain identity is a read, not a constant.
//
// Production once printed "chain ID 4663" on a deployment whose node answers `eth_chainId = 46630`,
// because `AVENOR_CHAIN_ID` was a literal. These tests pin the two ways that can go wrong again:
// a network name authored from memory instead of copied from `packages/config`, and a chain id that
// is reported when the node did not answer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chainLabel, networkIdentity } from "../src/config/networks.ts";
import { CAPTURE_CHAIN_ID } from "../src/config/staging.ts";
import { factsFromProbe, readChainFacts } from "../src/lib/chainFacts.ts";
import type { NodeProbe } from "../src/lib/nodeProbe.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const probe = (over: Partial<NodeProbe> = {}): NodeProbe => ({
  ok: over.chainId === null ? false : true,
  chainId: 46630,
  blockNumber: 158010963,
  blockHash: "0x4906a8488d1b0aa1f9e5d4f0d6ee1b1e0f0b6f2f3f2c0b4a9c8d7e6f5a4b3c2d",
  blockTimestamp: 1795663000,
  error: null,
  ...over,
});

test("network names match packages/config, so no name is authored from memory", () => {
  for (const id of [4663, 46630]) {
    const configPath = resolve(__dirname, "../../../packages/config", `${id}.json`);
    const file = JSON.parse(readFileSync(configPath, "utf-8")) as {
      _meta: { network: { name: string; explorer?: string } };
    };
    const identity = networkIdentity(id);
    assert.ok(identity !== null, `chain ${id} must have an identity`);
    assert.equal(identity.name, file._meta.network.name);
    assert.equal(identity.explorer, file._meta.network.explorer ?? null);
  }
});

test("an unconfigured chain is named by its id, never by a guess", () => {
  assert.equal(networkIdentity(999999), null);
  assert.equal(chainLabel(999999), "chain 999999");
});

test("testnet facts carry the id the node answered and no capture support", () => {
  const facts = factsFromProbe(probe({ chainId: 46630 }));
  assert.equal(facts.chainId, 46630);
  assert.equal(facts.label, "Robinhood Chain testnet");
  assert.equal(facts.captureSupported, false);
  assert.equal(facts.error, null);
});

test("capture support is claimed only on the chain the capture was recorded on", () => {
  const facts = factsFromProbe(probe({ chainId: CAPTURE_CHAIN_ID }));
  assert.equal(facts.captureSupported, true);
});

test("a probe that did not answer yields no chain id and no label", () => {
  const facts = factsFromProbe(
    probe({ chainId: null, blockNumber: null, blockHash: null, blockTimestamp: null, error: "no RPC configured" }),
  );
  assert.equal(facts.chainId, null);
  assert.equal(facts.label, null);
  assert.equal(facts.captureSupported, false);
  assert.equal(facts.error, "no RPC configured");
});

test("readChainFacts reports the transport failure instead of defaulting to 4663", async () => {
  const facts = await readChainFacts("http://127.0.0.1:1", 1_500);
  assert.equal(facts.chainId, null);
  assert.equal(facts.label, null);
  assert.equal(facts.captureSupported, false);
  assert.ok(typeof facts.error === "string" && facts.error.length > 0);
  assert.ok(!/4663/.test(facts.error), "the failure must not name a chain id it did not read");
});

test("readChainFacts without an RPC configured says so", async () => {
  const facts = await readChainFacts(undefined, 1_500);
  assert.equal(facts.chainId, null);
  assert.equal(facts.error, "no RPC configured");
});
