// The API promises strings for every money value; these tests are the enforcement. A number that
// slips through `JSON.parse` has already been rounded, and no formatter can recover the wei.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  latestReportTimestamp,
  parseAllocation,
  parseLive,
  parseReports,
  parseRoles,
  parseVaultRow,
  shareBps,
  parseFees,
  parseRoleEvents,
  parsePosition,
} from "../src/lib/vaultView.ts";

const VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd";
const ASSET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const STRATEGY = "0xCcCc00000000000000000000000000000000cCcc";

function row(overrides: Record<string, unknown> = {}) {
  return {
    address: VAULT,
    name: "Avenor USDG",
    symbol: "avUSDG",
    asset_address: ASSET,
    asset_decimals: 6,
    share_decimals: 18,
    role_manager: "0x1111111111111111111111111111111111111111",
    accountant: "0x2222222222222222222222222222222222222222",
    deposit_limit: "500000000000",
    deployed_block: "118337511",
    source: "indexed",
    ...overrides,
  };
}

test("vault row accepts small integers as JSON numbers and lowercases addresses", () => {
  const parsed = parseVaultRow(row());
  assert.equal(parsed.address, VAULT.toLowerCase());
  assert.equal(parsed.assetDecimals, 6);
  assert.equal(parsed.shareDecimals, 18);
  assert.equal(parsed.depositLimit, 500_000_000_000n);
  assert.equal(parsed.recordedBlock, 118_337_511n);
});

test("vault row keeps an unindexed role manager as null instead of inventing one", () => {
  const parsed = parseVaultRow(row({ role_manager: null, accountant: null }));
  assert.equal(parsed.roleManager, null);
  assert.equal(parsed.accountant, null);
});

test("vault row refuses a money value that arrived as a JSON number", () => {
  assert.throws(() => parseVaultRow(row({ deposit_limit: 500_000_000_000 })), /JSON number/);
});

test("vault row refuses a bad address and an unknown source", () => {
  assert.throws(() => parseVaultRow(row({ asset_address: "0x123" })), /20-byte hex address/);
  assert.throws(() => parseVaultRow(row({ source: "estimated" })), /indexed, onchain or captured/);
});

function live(overrides: Record<string, unknown> = {}) {
  return {
    blockNumber: "118337511",
    blockHash: "0xbaa980ab",
    blockTimestamp: "2026-11-19T07:54:14.000Z",
    totalAssets: "538856055994280",
    totalSupply: "531418644510854399888342585",
    pricePerShare: "1002699",
    totalIdle: "27024457979514",
    totalDebt: "511831598014766",
    performanceFeeBps: 1000,
    managementFeeBps: 0,
    depositLimit: "1000000000000",
    isPaused: false,
    isShutdown: false,
    source: "onchain",
    ...overrides,
  };
}

test("live splits idle and debt and requires them to add up to totalAssets", () => {
  const parsed = parseLive(live());
  assert.equal(parsed.totalIdle, 27_024_457_979_514n);
  assert.equal(parsed.totalDebt, 511_831_598_014_766n);
  assert.throws(() => parseLive(live({ totalDebt: "1" })), /different blocks/);
});

test("live carries the accountant's fee, and distinguishes 'no accountant' from 'zero fee'", () => {
  assert.equal(parseLive(live()).performanceFeeBps, 1000);
  assert.equal(parseLive(live({ performanceFeeBps: null })).performanceFeeBps, null);
  assert.equal(parseLive(live({ performanceFeeBps: 0 })).performanceFeeBps, 0);
  assert.throws(() => parseLive(live({ performanceFeeBps: 10_001 })), /basis points/);
});

test("live refuses an indexed body: the word 'live' has to mean a block", () => {
  assert.throws(() => parseLive(live({ source: "indexed" })), /must be onchain/);
});

function allocation(entries: unknown[]) {
  return {
    blockNumber: "118337511",
    blockHash: "0xbaa980ab",
    blockTimestamp: "2026-11-19T07:54:14.000Z",
    source: "onchain",
    strategies: entries,
  };
}

const entry = {
  address: STRATEGY,
  activation: "118000000",
  lastReport: "118337000",
  currentDebt: "511831598014766",
  maxDebt: "600000000000000",
  venue: "0xBeEff033F34C046626B8D0A041844C5d1A5409dd",
  venueError: null,
};

test("allocation computes each strategy's share of totalAssets", () => {
  const parsed = parseAllocation(allocation([entry]), 538_856_055_994_280n);
  assert.equal(parsed.strategies.length, 1);
  assert.equal(parsed.strategies[0]!.debtBps, 9498);
  assert.equal(parsed.strategies[0]!.address, STRATEGY.toLowerCase());
});

test("allocation accepts a missing venue only when the reason is present", () => {
  const parsed = parseAllocation(allocation([{ ...entry, venue: null, venueError: "execution reverted" }]), 1n);
  assert.equal(parsed.strategies[0]!.venue, null);
  assert.equal(parsed.strategies[0]!.venueError, "execution reverted");
  assert.throws(
    () => parseAllocation(allocation([{ ...entry, venue: null, venueError: null }]), 1n),
    /neither a venue nor a reason/,
  );
});

test("shareBps rounds to nearest and never divides by zero", () => {
  assert.equal(shareBps(1n, 3n), 3333);
  assert.equal(shareBps(2n, 3n), 6667);
  assert.equal(shareBps(0n, 0n), 0);
  assert.throws(() => shareBps(-1n, 1n), /not a fraction/);
});

function roles(overrides: Record<string, unknown> = {}) {
  return {
    blockNumber: "118337511",
    blockHash: "0xbaa980ab",
    blockTimestamp: "2026-11-19T07:54:14.000Z",
    source: "onchain",
    roleManager: "0x1111111111111111111111111111111111111111",
    futureRoleManager: "0x0000000000000000000000000000000000000000",
    timelockMinDelaySeconds: 172800,
    timelockError: null,
    ...overrides,
  };
}

test("roles require a delay or a stated reason for not having one", () => {
  assert.equal(parseRoles(roles()).timelockMinDelaySeconds, 172800);
  const unknown = parseRoles(roles({ timelockMinDelaySeconds: null, timelockError: "execution reverted" }));
  assert.equal(unknown.timelockMinDelaySeconds, null);
  assert.equal(unknown.timelockError, "execution reverted");
  assert.throws(
    () => parseRoles(roles({ timelockMinDelaySeconds: null, timelockError: null })),
    /neither a timelock delay nor a reason/,
  );
  assert.throws(() => parseRoles(roles({ timelockMinDelaySeconds: 10_000_000 })), /30 days/);
});

test("latestReportTimestamp ignores strategies that never reported", () => {
  const none = parseAllocation(allocation([{ ...entry, lastReport: "0" }]), 1n);
  assert.equal(latestReportTimestamp(none), null);
  const both = parseAllocation(
    allocation([entry, { ...entry, address: "0x3333333333333333333333333333333333333333", lastReport: "1793380000" }]),
    1n,
  );
  assert.equal(latestReportTimestamp(both), 1_793_380_000n);
});

test("reports are parsed as strings and keep their own provenance", () => {
  const raw = {
    blockNumber: "118337400",
    blockHash: "0xabc",
    blockTimestamp: "2026-11-19T07:00:00.000Z",
    txHash: "0xdef",
    gain: "1234",
    loss: "56",
    totalFees: "78",
    totalRefunds: "9",
    source: "indexed",
  };
  const [report] = parseReports([raw]);
  assert.equal(report!.gain, 1234n);
  assert.equal(report!.totalFees, 78n);
  assert.equal(report!.source, "indexed");
  assert.throws(() => parseReports([{ ...raw, gain: 1234 }]), /JSON number/);
});
test("fee and role history keep strings as strings and reject money as JSON numbers", () => {
  const fees = parseFees([
    {
      blockNumber: "118337511",
      blockHash: "0xfee",
      blockTimestamp: "2026-11-19T07:54:14.000Z",
      txHash: "0xfeeTx",
      kind: "performance",
      recipient: "0x1111111111111111111111111111111111111111",
      shares: "100",
      assets: "250",
      source: "indexed",
    },
  ]);
  assert.equal(fees[0].assets, 250n);
  assert.equal(fees[0].shares, 100n);

  assert.throws(
    () =>
      parseFees([
        {
          blockNumber: "1",
          blockTimestamp: "2026-11-19T07:54:14.000Z",
          txHash: "0x",
          kind: "performance",
          recipient: null,
          shares: null,
          assets: 250,
          source: "indexed",
        },
      ]),
    /fees\[0\]\.assets/,
  );
});

test("role events expose a bitmap change when the event carries no single bit", () => {
  const events = parseRoleEvents([
    {
      blockNumber: "20",
      blockTimestamp: "2026-11-19T07:54:14.000Z",
      txHash: "0xrole",
      account: "0xaaaa00000000000000000000000000000000aaaa",
      roleBit: null,
      granted: null,
      source: "indexed",
    },
    {
      blockNumber: "21",
      blockTimestamp: "2026-11-19T07:54:14.000Z",
      txHash: "0xrole2",
      account: "0xaaaa00000000000000000000000000000000aaaa",
      roleBit: 7,
      granted: false,
      source: "indexed",
    },
  ]);
  assert.equal(events[0].roleBit, null);
  assert.equal(events[1].granted, false);
  assert.throws(
    () =>
      parseRoleEvents([
        {
          blockNumber: "21",
          blockTimestamp: "2026-11-19T07:54:14.000Z",
          txHash: "0xrole2",
          account: "0xaaaa00000000000000000000000000000000aaaa",
          roleBit: 7,
          granted: "false",
          source: "indexed",
        },
      ]),
    /granted/,
  );
});

test("a position is shares plus the blocks it was seen in", () => {
  const position = parsePosition({
    account: "0xaaaa00000000000000000000000000000000aaaa",
    shares: "531418644510854399888342585",
    firstSeenBlock: "150",
    lastActivityBlock: "220",
    source: "indexed",
  });
  assert.equal(position.shares, 531418644510854399888342585n);
  assert.equal(position.lastActivityBlock, 220n);
  assert.throws(
    () =>
      parsePosition({
        account: "0xaaaa00000000000000000000000000000000aaaa",
        shares: 5,
        firstSeenBlock: "150",
        lastActivityBlock: "220",
        source: "indexed",
      }),
    /position\.shares/,
  );
});
