// `fetchJson` is the only place the app talks HTTP. These tests pin the failure modes that would
// otherwise reach a component as `undefined`: a non-JSON body, an error body without a code, and a
// 200 whose body is not what the caller expects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchJson } from "../src/lib/api.ts";

function response(status: number, body: string, ok = status >= 200 && status < 300) {
  return { ok, status, text: async () => body };
}

test("a successful body is parsed and returned", async () => {
  const body = await fetchJson("http://api/v1/x", async () => response(200, '{"a":"1"}'));
  assert.deepEqual(body, { a: "1" });
});

test("an API error keeps its code and message", async () => {
  await assert.rejects(
    fetchJson("http://api/v1/x", async () =>
      response(404, '{"error":{"code":"unknown_vault","message":"0xdead is not indexed"}}'),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "unknown_vault");
      assert.equal(error.message, "0xdead is not indexed");
      return true;
    },
  );
});

test("a non-JSON body is an ApiError, not a parse crash", async () => {
  await assert.rejects(fetchJson("http://api/v1/x", async () => response(502, "<html>bad gateway</html>")), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "not_json");
    return true;
  });
});

test("an error body without a code still carries the status", async () => {
  await assert.rejects(fetchJson("http://api/v1/x", async () => response(500, '{"error":{"message":"boom"}}')), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "http_error");
    assert.equal(error.status, 500);
    assert.equal(error.message, "boom");
    return true;
  });
});

test("the fetch is never cached: a stale number is an unlabelled number", async () => {
  let seen: unknown = null;
  await fetchJson("http://api/v1/x", async (_url, init) => {
    seen = init;
    return response(200, "{}");
  });
  assert.deepEqual(seen, { cache: "no-store" });
});