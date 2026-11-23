import assert from "node:assert/strict";
import test from "node:test";
import { createFakeChain, VAULT } from "./fakeChain.ts";
import { readEvidence } from "../src/lib/evidence.ts";

test("evidence comes from the chain: apiVersion plus code hash at the same block", async () => {
  const { client } = createFakeChain({ apiVersion: () => "3.1.1" });
  const evidence = await readEvidence(client, VAULT, 0x70dafe7n);
  assert.equal(evidence.apiVersion, "3.1.1");
  assert.equal(evidence.codeSize, 5);
  assert.match(evidence.codeHash ?? "", /^0x[0-9a-f]{64}$/);
  assert.equal(evidence.apiVersionError, null);
});

test("an unreadable apiVersion is reported, not filled with the version we hoped for", async () => {
  const { client, chain } = createFakeChain({});
  chain.revert.add("apiVersion");
  const evidence = await readEvidence(client, VAULT, 0x70dafe7n);
  assert.equal(evidence.apiVersion, null);
  assert.ok(evidence.apiVersionError !== null);
});

test("an address without code yields no hash", async () => {
  const { client } = createFakeChain({ apiVersion: () => "3.1.1" });
  const noCode = { ...client, getCode: async () => "0x" } as unknown as typeof client;
  const evidence = await readEvidence(noCode, VAULT, 0x70dafe7n);
  assert.equal(evidence.codeHash, null);
  assert.equal(evidence.codeSize, 0);
  assert.match(evidence.codeError ?? "", /has no code/);
});
