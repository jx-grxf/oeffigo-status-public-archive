import assert from "node:assert/strict";
import { test } from "node:test";

import { isAllowedOwner } from "./owner";

test("owner authentication fails closed and accepts only the normalized owner", () => {
  const previous = process.env.OWNER_EMAIL;
  try {
    delete process.env.OWNER_EMAIL;
    assert.equal(isAllowedOwner("owner@example.com"), false);
    process.env.OWNER_EMAIL = " Owner@Example.com ";
    assert.equal(isAllowedOwner("OWNER@example.com"), true);
    assert.equal(isAllowedOwner("someone@example.com"), false);
    assert.equal(isAllowedOwner(null), false);
    process.env.OWNER_EMAIL = "owner@example.com,other@example.com";
    assert.equal(isAllowedOwner("owner@example.com"), false);
  } finally {
    if (previous === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = previous;
  }
});
