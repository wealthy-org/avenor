// The wallet boundary must be told which chain this deployment reads, never carry one of its own.
//
// The bug this pins: `AVENOR_CHAIN_ID = 4663` lived in `src/lib/wallet.ts` while the deployed node
// answered `46630`, so every form refused to sign on the chain it was reading from.

import { test } from "node:test";
import assert from "node:assert/strict";
import { connectWallet, readChainId, switchToChain, type Eip1193Provider } from "../src/lib/wallet.ts";

/** A provider that answers the four methods these functions use, and records what it was asked. */
function fakeProvider(chainId: number, accounts: string[] = ["0x1111111111111111111111111111111111111111"]) {
  const asked: { method: string; params?: unknown[] }[] = [];
  const provider: Eip1193Provider = {
    async request(args) {
      asked.push(args);
      if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return accounts;
      if (args.method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (args.method === "wallet_switchEthereumChain") {
        const target = (args.params as { chainId: string }[])[0].chainId;
        chainId = Number(BigInt(target));
        return null;
      }
      throw new Error(`unexpected method ${args.method}`);
    },
  };
  return { provider, asked, chain: () => chainId };
}

test("the wallet module exports no chain id of its own", async () => {
  const wallet = await import("../src/lib/wallet.ts");
  assert.equal("AVENOR_CHAIN_ID" in wallet, false, "a chain id here would be a constant doing a read's job");
});

test("no wallet names no chain id it was not told", async () => {
  await assert.rejects(
    () => connectWallet(null),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /no wallet/i);
      assert.equal(/4663|46630/.test(message), false, `message must not name a chain: ${message}`);
      return true;
    },
  );
});

test("switching uses the chain id the caller passes", async () => {
  const fake = fakeProvider(4663);
  const result = await switchToChain(fake.provider, 46630);
  assert.equal(result.switched, true, result.reason ?? "expected a successful switch");
  assert.equal(fake.chain(), 46630);
  const call = fake.asked.find((entry) => entry.method === "wallet_switchEthereumChain");
  assert.deepEqual(call?.params, [{ chainId: "0xb626" }]);
});

test("a switch that stayed elsewhere reports the two ids it actually saw", async () => {
  const stuck = fakeProvider(4663);
  const answer = stuck.provider.request;
  // The wallet answers reads normally and ignores the switch request entirely.
  stuck.provider.request = async (args) => (args.method === "wallet_switchEthereumChain" ? null : answer(args));
  const result = await switchToChain(stuck.provider, 46630);
  assert.equal(result.switched, false);
  assert.match(result.reason ?? "", /4663.*46630/);
});

test("chain id is re-read per call, never cached", async () => {
  const fake = fakeProvider(4663);
  assert.equal(await readChainId(fake.provider), 4663);
  fake.provider.request = async () => "0xb626";
  assert.equal(await readChainId(fake.provider), 46630);
});
