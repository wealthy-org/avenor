// The loader is where partial failure is decided: a broken allocation must not take the live numbers
// down with it, and a broken live body must not be papered over with zeros.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/lib/api.ts";
import { loadVaultDetail } from "../src/lib/vaultLoader.ts";

const VAULT = "0xbeef00000000000000000000000000000000beef";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stub(routes: Record<string, unknown>): void {
  globalThis.fetch = (async (input: string) => {
    const key = Object.keys(routes).find((path) => String(input).endsWith(path));
    if (key === undefined) {
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":{"code":"unknown_vault","message":"nope"}}',
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(routes[key]) };
  }) as typeof fetch;
}

const vaultRow = {
  address: VAULT,
  name: "Avenor USDG",
  symbol: "avUSDG",
  asset_address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
  asset_decimals: 6,
  share_decimals: 18,
  role_manager: "0x1111111111111111111111111111111111111111",
  accountant: "0x2222222222222222222222222222222222222222",
  deposit_limit: "0",
  deployed_block: "118337511",
  source: "indexed",
};

const liveBody = {
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
  source: "onchain",
};

const rolesBody = {
  blockNumber: "118337511",
  blockHash: "0xbaa980ab",
  blockTimestamp: "2026-11-19T07:54:14.000Z",
  source: "onchain",
  roleManager: "0x1111111111111111111111111111111111111111",
  futureRoleManager: "0x0000000000000000000000000000000000000000",
  timelockMinDelaySeconds: 172800,
  timelockError: null,
};

const allocationBody = {
  blockNumber: "118337511",
  blockHash: "0xbaa980ab",
  blockTimestamp: "2026-11-19T07:54:14.000Z",
  source: "onchain",
  strategies: [],
};

test("all four sections load, with no errors recorded", async () => {
  stub({
    [`/v1/vaults/${VAULT}`]: vaultRow,
    [`/v1/vaults/${VAULT}/live`]: liveBody,
    [`/v1/vaults/${VAULT}/reports?limit=5`]: [],
    [`/v1/vaults/${VAULT}/allocation?block=118337511`]: allocationBody,
    [`/v1/vaults/${VAULT}/roles`]: rolesBody,
  });
  const detail = await loadVaultDetail("http://api.test", VAULT);
  assert.equal(detail.roles?.timelockMinDelaySeconds, 172_800);
  assert.equal(detail.rolesError, null);
  assert.equal(detail.live?.totalIdle, 27_024_457_979_514n);
  assert.equal(detail.allocation?.blockNumber, 118_337_511n);
  assert.equal(detail.liveError, null);
  assert.equal(detail.allocationError, null);
  assert.equal(detail.reportsError, null);
});

test("allocation is requested at the live block, never at latest", async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (input: string) => {
    seen.push(String(input));
    const body = String(input).endsWith("/live")
      ? liveBody
      : String(input).endsWith("/reports?limit=5")
        ? []
        : String(input).includes("/allocation?block=118337511")
          ? allocationBody
          : vaultRow;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as typeof fetch;
  await loadVaultDetail("http://api.test", VAULT);
  assert.ok(seen.some((url) => url.endsWith("/allocation?block=118337511")));
  assert.ok(!seen.some((url) => url.endsWith("/allocation")));
});

test("a failed allocation keeps the live numbers and reports the reason", async () => {
  stub({
    [`/v1/vaults/${VAULT}`]: vaultRow,
    [`/v1/vaults/${VAULT}/live`]: liveBody,
    [`/v1/vaults/${VAULT}/reports?limit=5`]: [],
  });
  const detail = await loadVaultDetail("http://api.test", VAULT);
  assert.equal(detail.live?.totalAssets, 538_856_055_994_280n);
  assert.equal(detail.allocation, null);
  assert.ok(detail.allocationError instanceof ApiError);
  assert.equal(detail.allocationError.code, "unknown_vault");
});

test("an inconsistent live body is an error, not a zeroed split", async () => {
  stub({
    [`/v1/vaults/${VAULT}`]: vaultRow,
    [`/v1/vaults/${VAULT}/live`]: { ...liveBody, totalDebt: "1" },
    [`/v1/vaults/${VAULT}/reports?limit=5`]: [],
    [`/v1/vaults/${VAULT}/allocation?block=118337511`]: allocationBody,
  });
  const detail = await loadVaultDetail("http://api.test", VAULT);
  assert.equal(detail.live, null);
  assert.equal(detail.allocation, null);
  assert.match(String(detail.liveError), /different blocks/);
});

test("an unknown vault is thrown to the page, which shows it as one error", async () => {
  stub({});
  await assert.rejects(loadVaultDetail("http://api.test", VAULT), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "unknown_vault");
    assert.equal(error.status, 404);
    return true;
  });
});
