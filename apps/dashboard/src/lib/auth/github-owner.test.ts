import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  fetchGitHubOwnerProfile,
  isAllowedGitHubOwner,
  isGitHubLoginConfigured,
  mapGitHubOwnerProfile,
} from "./github-owner";

describe("GitHub owner identity", () => {
  const variables = [
    "OWNER_GITHUB_ID",
    "OWNER_EMAIL",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
  ] as const;
  let previous: Record<string, string | undefined>;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    previous = Object.fromEntries(
      variables.map((key) => [key, process.env[key]]),
    );
    process.env.OWNER_GITHUB_ID = "12345678";
    process.env.OWNER_EMAIL = " Owner@Example.com ";
    process.env.AUTH_GITHUB_ID = "test-client-id";
    process.env.AUTH_GITHUB_SECRET = "test-client-secret";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("accepts only the exact numeric owner ID", () => {
    assert.equal(isAllowedGitHubOwner(12345678), true);
    for (const id of [
      12345679,
      "12345678",
      null,
      undefined,
      -1,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.equal(isAllowedGitHubOwner(id), false);
    }
  });
  it("maps the approved identity to the canonical owner email instead of provider email", () => {
    const mapped = mapGitHubOwnerProfile({
      id: 12345678,
      name: "Example Owner",
      login: "example-login",
      email: "unrelated@example.com",
      avatar_url: "https://avatars.githubusercontent.com/example",
    });
    assert.equal(mapped.id, "12345678");
    assert.equal(mapped.email, "owner@example.com");
    assert.equal(mapped.name, "Example Owner");
    assert.equal(
      mapGitHubOwnerProfile({
        id: 12345678,
        name: null,
        login: "example-login",
      }).name,
      "example-login",
    );
    assert.throws(
      () => mapGitHubOwnerProfile({ id: 999, email: "owner@example.com" }),
      /denied/,
    );
  });
  it("fails closed when any required configuration is missing or invalid", () => {
    assert.equal(isGitHubLoginConfigured(), true);
    for (const key of variables) {
      const value = process.env[key];
      delete process.env[key];
      assert.equal(isGitHubLoginConfigured(), false);
      assert.throws(() => mapGitHubOwnerProfile({ id: 12345678 }), /denied/);
      process.env[key] = value;
    }
    for (const id of ["", "012345678", "12345678x", "1.2345678e7", "NaN"]) {
      process.env.OWNER_GITHUB_ID = id;
      assert.equal(isGitHubLoginConfigured(), false);
    }
    process.env.OWNER_GITHUB_ID = "12345678";
    process.env.OWNER_EMAIL = "invalid";
    assert.equal(isGitHubLoginConfigured(), false);
  });
  it("uses the authenticated user endpoint and does not depend on email discovery", async () => {
    let requests = 0;
    globalThis.fetch = (url, options) => {
      requests++;
      assert.equal(url, "https://api.github.com/user");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer fixture-token",
      );
      assert.equal(options?.cache, "no-store");
      return Promise.resolve(
        Response.json({ id: 12345678, email: null, name: "Example" }),
      );
    };
    const profile = await fetchGitHubOwnerProfile("fixture-token");
    assert.equal(mapGitHubOwnerProfile(profile).email, "owner@example.com");
    assert.equal(requests, 1);
  });
  it("rejects an unauthorized or failed provider response before returning a profile", async () => {
    globalThis.fetch = () =>
      Promise.resolve(Response.json({ id: 999, email: "owner@example.com" }));
    await assert.rejects(fetchGitHubOwnerProfile("fixture-token"), /denied/);
    globalThis.fetch = () =>
      Promise.resolve(new Response("unauthorized", { status: 401 }));
    await assert.rejects(fetchGitHubOwnerProfile("fixture-token"), /denied/);
  });
});
