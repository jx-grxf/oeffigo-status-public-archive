import assert from "node:assert/strict";
import { test } from "node:test";

import { originLockAllows } from "./origin-lock.ts";

const SECRET = "s".repeat(48);
const allows = (pathname, header, expected = SECRET) =>
  originLockAllows({ pathname, header, expected });

test("the lock is off until a secret is configured", () => {
  for (const expected of [undefined, "", "   "]) {
    // Called directly: an omitted argument must not fall back to a secret.
    assert.equal(
      originLockAllows({ pathname: "/", header: null, expected }),
      true,
    );
    assert.equal(
      originLockAllows({ pathname: "/", header: "anything", expected }),
      true,
    );
  }
});

test("requests carrying the edge secret reach the origin", () => {
  assert.equal(allows("/", SECRET), true);
  assert.equal(allows("/events/report/1", SECRET), true);
});

test("requests that went around the proxy are refused", () => {
  for (const header of [null, "", "wrong", SECRET.slice(0, -1), `${SECRET}x`]) {
    assert.equal(allows("/", header), false);
  }
});

test("the platform health check stays reachable", () => {
  assert.equal(allows("/api/health", null), true);
  assert.equal(allows("/api/health/deep", null), false);
});
