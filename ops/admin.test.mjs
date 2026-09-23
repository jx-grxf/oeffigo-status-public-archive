import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRequest, parseArgs, readResult } from "./admin.mjs";

test("a call with input is a mutation, one without is a query", () => {
  assert.deepEqual(parseArgs(["page.list"]), {
    procedure: "page.list",
    input: undefined,
    kind: "query",
  });
  assert.deepEqual(parseArgs(["statusReport.new", '{"title":"x"}']), {
    procedure: "statusReport.new",
    input: { title: "x" },
    kind: "mutation",
  });
  assert.equal(parseArgs(["--query", "page.get", "{}"]).kind, "query");
  assert.equal(parseArgs(["--mutation", "page.get"]).kind, "mutation");
});

test("a malformed call is refused before anything is sent", () => {
  for (const argv of [
    [],
    ["--unknown", "page.list"],
    ["../secret"],
    ["page.list", "{"],
    ["page.list", "{}", "extra"],
  ]) {
    assert.ok(parseArgs(argv).error, `expected a refusal for ${argv}`);
  }
});

test("requests carry the superjson envelope on the right verb", () => {
  const query = buildRequest({
    baseUrl: "https://admin.example",
    procedure: "page.list",
    kind: "query",
  });
  assert.equal(query.url, "https://admin.example/api/trpc/lambda/page.list");
  assert.equal(query.init.method, "GET");

  const withInput = buildRequest({
    baseUrl: "https://admin.example",
    procedure: "page.get",
    input: { id: 1 },
    kind: "query",
  });
  assert.equal(
    new URL(withInput.url).searchParams.get("input"),
    '{"json":{"id":1}}',
  );

  const mutation = buildRequest({
    baseUrl: "https://admin.example",
    procedure: "statusReport.new",
    input: { title: "x" },
    kind: "mutation",
  });
  assert.equal(mutation.init.method, "POST");
  assert.equal(mutation.init.body, '{"json":{"title":"x"}}');
});

test("results unwrap, failures explain themselves", () => {
  assert.deepEqual(
    readResult(200, { result: { data: { json: [1, 2] } } }),
    [1, 2],
  );
  assert.equal(readResult(200, { result: { data: { json: null } } }), null);
  assert.throws(
    () =>
      readResult(401, {
        error: {
          json: { message: "UNAUTHORIZED", data: { code: "UNAUTHORIZED" } },
        },
      }),
    /UNAUTHORIZED/,
  );
  assert.throws(() => readResult(502, {}), /HTTP 502/);
});
