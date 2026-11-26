import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { httpRpc } from "../src/rpc.ts";

describe("httpRpc with multi-endpoint failover", () => {
  it("executes methods against primary endpoint", async () => {
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.method === "eth_blockNumber") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x100" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    };

    const client = httpRpc("https://primary.rpc", {
      fetchImpl: fakeFetch,
      attempts: 1,
    });

    const block = await client.blockNumber();
    assert.equal(block, 256n);
  });

  it("fails over to secondary endpoint when primary returns 500", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      const body = JSON.parse(init?.body as string);

      if (url.includes("primary")) {
        return new Response("Internal Server Error", { status: 500 });
      }

      if (body.method === "eth_blockNumber") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x200" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    };

    const client = httpRpc(["https://primary.rpc", "https://secondary.rpc"], {
      fetchImpl: fakeFetch,
      attempts: 1,
      baseDelayMs: 1,
    });

    const block = await client.blockNumber();
    assert.equal(block, 512n);
    assert.ok(calls.some((u) => u.includes("primary")));
    assert.ok(calls.some((u) => u.includes("secondary")));
  });

  it("validates chainId when expectedChainId is specified", async () => {
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.method === "eth_chainId") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0xb64e" }), { // 46670 != 46630
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    };

    const client = httpRpc("https://primary.rpc", {
      fetchImpl: fakeFetch,
      attempts: 1,
      expectedChainId: 46630,
    });

    await assert.rejects(
      async () => {
        await client.blockNumber();
      },
      /RPC Chain ID mismatch/
    );
  });
});
