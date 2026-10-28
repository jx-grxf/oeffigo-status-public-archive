import assert from "node:assert/strict";

import { HeaderAssertion } from "./v1";

Deno.test("header assertion matches HTTP field names without case sensitivity", () => {
  const assertion = new HeaderAssertion({
    version: "v1",
    type: "header",
    compare: "eq",
    key: "content-type",
    target: "application/json",
  });

  assert.deepEqual(
    assertion.assert({
      body: "",
      header: { "Content-Type": "application/json" },
      status: 200,
    }),
    { success: true },
  );
  assert.equal(
    assertion.assert({
      body: "",
      header: { "Content-Type": "text/plain" },
      status: 200,
    }).success,
    false,
  );
});
