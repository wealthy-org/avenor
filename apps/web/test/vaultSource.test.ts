// A request may only be answered from the committed capture when the capture actually describes the
// chain and the address that was asked about. These tests pin that guard and the metadata row built
// from the answering snapshot, because the deployed site once answered a chain-46630 vault address with
// chain-4663 capture numbers, and its vault page crashed with `"" is not an address`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTURE_CHAIN_ID, STAGING_VAULT } from "../src/config/staging.ts";
import { captureFallbackAllowed, metadataFromSnapshot } from "../src/lib/vaultSource.ts";
import type { VaultSnapshot, Field } from "../src/lib/vaultRead.ts";

/** The testnet vault the web env points at: chain 46630, which the capture says nothing about. */
const TESTNET_VAULT = "0xFB6064C2A4CedaD01b2a873E43890D18e1Cb4Dd9";

const ok = <T>(value: T): Field<T> => ({ value, error: null });
const failed = <T>(message: string): Field<T> => ({ value: null, error: message });

function snapshot(overrides: Partial<VaultSnapshot["vault"]> = {}, source: "onchain" | "captured" = "onchain"): VaultSnapshot {
  return {
    source,
    at: { blockNumber: 158005484, blockHash: "0x96ec723604a84bb1acd30da7fd7c94d83e64ca1106ff8ba3080671df5a78c539", blockTimestamp: 1795661443 },
    liveError: null,
    vault: {
      apiVersion: ok("3.1.1"),
      name: ok("Avenor USDG Managed Vault (Testnet)"),
      symbol: ok("avUSDG"),
      asset: ok("0x5fc5360d0400a0fd4f2af552add042d716f1d168"),
      decimals: ok(6),
      totalAssets: ok("0"),
      totalSupply: ok("0"),
      pricePerShare: ok("1000000"),
      totalIdle: ok("0"),
      totalDebt: ok("0"),
      depositLimit: ok("0"),
      isPaused: ok(false),
      isShutdown: ok(false),
      profitMaxUnlockTime: ok("0"),
      ...overrides,
    },
    roles: {
      roleManager: ok("0x2Bfa51B313AA76d2ED0d8D5971Dd8b3e4235609D"),
      futureRoleManager: ok("0x0000000000000000000000000000000000000000"),
      accountant: ok("0x47834d4241a7a5188a253cc0203ab49d4621a069"),
      feeManager: ok("0x0000000000000000000000000000000000000000"),
      vaultConfig: failed("not read"),
      timelockMinDelaySeconds: ok(172800),
    },
    allocation: { queue: failed("not read"), strategies: [] },
    evidence: { codeSize: 90, implementation: null, implementationCodeSize: null, implementationCodeHash: null },
  };
}

test("the capture may answer only for the captured vault on the captured chain", () => {
  assert.equal(captureFallbackAllowed(STAGING_VAULT, CAPTURE_CHAIN_ID), true);
});

test("the capture may not answer for the captured vault on another chain", () => {
  assert.equal(captureFallbackAllowed(STAGING_VAULT, 46630), false);
});

test("the capture may not answer for a different vault, even on the captured chain", () => {
  assert.equal(captureFallbackAllowed(TESTNET_VAULT, CAPTURE_CHAIN_ID), false);
});

test("the capture may not answer for a different vault on a different chain", () => {
  assert.equal(captureFallbackAllowed(TESTNET_VAULT, 46630), false);
});

test("an unknown chain id never unlocks the capture", () => {
  assert.equal(captureFallbackAllowed(STAGING_VAULT, null), false);
});

test("a metadata row comes from the snapshot that answered, not from a constant", () => {
  const row = metadataFromSnapshot(TESTNET_VAULT, snapshot());
  assert.equal(row.address, "0xda4d625b2e14a3c07d21d6effe66f91aed517da0");
  assert.equal(row.name, "Avenor USDG Managed Vault (Testnet)");
  assert.equal(row.asset_address, "0x5fc5360d0400a0fd4f2af552add042d716f1d168");
  assert.equal(row.role_manager, "0x7d2511309aa40ed9bd0f10b3f6c3e36e5b62eaac");
  // A closed vault: 0 USDG is the real answer, printed as 0 rather than dropped.
  assert.equal(row.deposit_limit, "0");
  assert.equal(row.recorded_block, "158005484");
  assert.equal(row.source, "onchain");
});

test("a departed asset getter fails the row with the block and the reason, never with an empty address", () => {
  assert.throws(
    () => metadataFromSnapshot(TESTNET_VAULT, snapshot({ asset: failed("execution reverted: no data") })),
    (error: Error) => {
      assert.match(error.message, /asset\(\) did not answer at block 158005484/);
      assert.match(error.message, /no data/);
      assert.doesNotMatch(error.message, /is not an address,?$/);
      return true;
    }
  );
});

test("a name getter that did not answer fails the row instead of shipping an unnamed vault", () => {
  assert.throws(() => metadataFromSnapshot(TESTNET_VAULT, snapshot({ name: failed("timeout") })), /name\(\) did not answer/);
});

test("a captured row keeps saying captured", () => {
  const row = metadataFromSnapshot(STAGING_VAULT, snapshot({}, "captured"));
  assert.equal(row.source, "captured");
});
