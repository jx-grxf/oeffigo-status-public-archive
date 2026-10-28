import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

// The module pulls the database client at import time, so give it a URL first.
process.env.DATABASE_URL ??= "http://127.0.0.1:8080";
const { opsSession } = await import("./ops-token");

const TOKEN = "o".repeat(40);
const owner = { id: "1", email: "owner@example.com" };
const request = (token?: string) =>
  new Request("https://status-admin.example/api/trpc/lambda/page.list", {
    headers: token ? { "x-oeffigo-ops": token } : {},
  });

describe("operations service token", () => {
  const variables = ["OPS_TOKEN", "OWNER_EMAIL"] as const;
  let previous: Record<string, string | undefined>;
  let lookups: number;
  const lookup = async () => {
    lookups++;
    return owner;
  };
  beforeEach(() => {
    previous = Object.fromEntries(
      variables.map((key) => [key, process.env[key]]),
    );
    process.env.OPS_TOKEN = TOKEN;
    process.env.OWNER_EMAIL = owner.email;
    lookups = 0;
  });
  afterEach(() => {
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("accepts the configured token and resolves the owner", async () => {
    assert.deepEqual(await opsSession(request(TOKEN), lookup), { user: owner });
    assert.equal(lookups, 1);
  });

  it("ignores a missing, wrong or differently sized token", async () => {
    for (const token of [
      undefined,
      "",
      "   ",
      `${TOKEN}x`,
      TOKEN.slice(0, -1),
      "O".repeat(40),
    ]) {
      assert.equal(await opsSession(request(token), lookup), null);
    }
    assert.equal(lookups, 0, "a rejected token never reaches the database");
  });

  it("stays off unless a long enough token is configured", async () => {
    for (const configured of [undefined, "", "short-token"]) {
      if (configured === undefined) delete process.env.OPS_TOKEN;
      else process.env.OPS_TOKEN = configured;
      assert.equal(
        await opsSession(request(configured ?? TOKEN), lookup),
        null,
      );
      assert.equal(await opsSession(request(TOKEN), lookup), null);
    }
    assert.equal(lookups, 0);
  });

  it("stops answering after a burst of wrong tokens", async () => {
    // Runs last: the guessing budget is per process and only clears with time.
    for (let attempt = 0; attempt < 10; attempt++) {
      assert.equal(await opsSession(request("W".repeat(40)), lookup), null);
    }
    assert.equal(
      await opsSession(request(TOKEN), lookup),
      null,
      "even the right token waits out the burst",
    );
    assert.equal(lookups, 0);
  });

  it("refuses a valid token when no owner account exists", async () => {
    const quiet = console.warn;
    console.warn = () => {};
    try {
      assert.equal(await opsSession(request(TOKEN), async () => null), null);
    } finally {
      console.warn = quiet;
    }
  });
});
