import assert from "node:assert/strict";
import { test } from "node:test";

import { isIpAllowed } from "./is-ip-allowed.ts";

test("CIDR access accepts only matching IPv4 and IPv6 hosts", () => {
  assert.equal(isIpAllowed("192.0.2.7", ["192.0.2.0/24"]), true);
  assert.equal(isIpAllowed("192.0.3.7", ["192.0.2.0/24"]), false);
  assert.equal(isIpAllowed("2001:db8::7", ["2001:db8::/32"]), true);
  assert.equal(isIpAllowed("2001:db9::7", ["2001:db8::/32"]), false);
  assert.equal(isIpAllowed("::ffff:192.0.2.7", ["192.0.2.0/24"]), false);
});

test("CIDR access fails closed on ambiguous or malformed input", () => {
  assert.equal(isIpAllowed("012.0.0.1", ["10.0.0.0/8"]), false);
  assert.equal(isIpAllowed("192.0.2.7/24", ["192.0.2.0/24"]), false);
  assert.equal(isIpAllowed("192.0.2.7", ["invalid"]), false);
  assert.equal(isIpAllowed("192.0.2.7", []), false);
});
