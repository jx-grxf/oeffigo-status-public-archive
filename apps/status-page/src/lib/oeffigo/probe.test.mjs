import assert from "node:assert/strict";
import { test } from "node:test";

import { probe } from "./probe.ts";
for (const [status, body, failure] of [
  [503, "secret upstream details", "http"],
  [200, "oops", "invalid_body"],
  [200, '{"ok":false}', "unhealthy"],
  [200, '{"ok":true}', null],
]) {
  test(`probe preserves safe failure ${failure}`, async () => {
    const result = await probe(
      "https://example.invalid",
      true,
      async () => new Response(body, { status }),
    );
    assert.equal(result.status, status);
    assert.equal(result.failure, failure);
    assert.equal(result.ok, failure === null);
    assert.ok(!JSON.stringify(result).includes("secret"));
  });
}
test("network failures and timeouts remain distinguishable", async () => {
  for (const name of ["TimeoutError", "TypeError"]) {
    const result = await probe("https://example.invalid", true, async () => {
      const e = new Error("private");
      e.name = name;
      throw e;
    });
    assert.equal(
      result.failure,
      name === "TimeoutError" ? "timeout" : "network",
    );
    assert.equal(result.status, null);
  }
});
