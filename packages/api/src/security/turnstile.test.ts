import { expect } from "@std/expect";
import { afterEach, beforeEach, describe, test } from "@std/testing/bdd";
import { assertSpyCalls, stub, type Stub } from "@std/testing/mock";

import { verifyTurnstile } from "./turnstile";

describe("Turnstile server validation", () => {
  let request: Stub<typeof globalThis>;
  let previousSecret: string | undefined;
  let previousEnvironment: string | undefined;
  let result: Record<string, unknown>;

  beforeEach(() => {
    previousSecret = process.env.TURNSTILE_SECRET_KEY;
    previousEnvironment = process.env.NODE_ENV;
    process.env.TURNSTILE_SECRET_KEY = "test-private-key";
    process.env.NODE_ENV = "production";
    result = {
      success: true,
      action: "status-subscribe",
      hostname: "status.oeffigo.app",
      challenge_ts: new Date().toISOString(),
    };
    request = stub(globalThis, "fetch", () =>
      Promise.resolve(Response.json(result)),
    );
  });
  afterEach(() => {
    request.restore();
    if (previousSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });

  test("consumes one token exactly once at the canonical endpoint", async () => {
    await verifyTurnstile({
      token: "single-use-proof",
      action: "status-subscribe",
    });
    assertSpyCalls(request, 1);
    expect(request.calls[0].args[0]).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    const body = request.calls[0].args[1]?.body;
    expect(body instanceof URLSearchParams && body.get("response")).toBe(
      "single-use-proof",
    );
  });
  test("rejects missing proof and missing secret before fetch", async () => {
    await expect(
      verifyTurnstile({ token: "", action: "status-subscribe" }),
    ).rejects.toThrow("Sicherheitsprüfung");
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(
      verifyTurnstile({ token: "proof", action: "status-subscribe" }),
    ).rejects.toThrow("Sicherheitsprüfung");
    assertSpyCalls(request, 0);
  });
  test("rejects false success, wrong hostname and swapped action", async () => {
    for (const invalid of [
      { success: false },
      { success: "true" },
      { hostname: "status.oeffigo.app.attacker.test" },
      { action: "status-login" },
    ]) {
      const previous = result;
      result = { ...result, ...invalid };
      await expect(
        verifyTurnstile({ token: "proof", action: "status-subscribe" }),
      ).rejects.toThrow("Sicherheitsprüfung");
      result = previous;
    }
  });
  test("rejects expired, future and malformed challenge timestamps", async () => {
    for (const challenge_ts of [
      new Date(Date.now() - 301_000).toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
      "invalid",
    ]) {
      result.challenge_ts = challenge_ts;
      await expect(
        verifyTurnstile({ token: "proof", action: "status-subscribe" }),
      ).rejects.toThrow("Sicherheitsprüfung");
    }
  });
  test("login proof must originate on the admin hostname", async () => {
    result.action = "status-login";
    await expect(
      verifyTurnstile({ token: "proof", action: "status-login" }),
    ).rejects.toThrow();
    result.hostname = "status-admin.oeffigo.app";
    await verifyTurnstile({ token: "proof", action: "status-login" });
  });
  test("blocks public dummy secrets in production even with a localhost hostname", async () => {
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    await expect(
      verifyTurnstile({
        token: "XXXX.DUMMY.TOKEN.XXXX",
        action: "status-subscribe",
        requestHostname: "localhost",
      }),
    ).rejects.toThrow();
    assertSpyCalls(request, 0);
  });
  test("supports documented dummy responses only during local development", async () => {
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    process.env.NODE_ENV = "development";
    result.hostname = "localhost";
    result.action = "test";
    await verifyTurnstile({
      token: "XXXX.DUMMY.TOKEN.XXXX",
      action: "status-subscribe",
      requestHostname: "localhost",
    });
    await expect(
      verifyTurnstile({
        token: "XXXX.DUMMY.TOKEN.XXXX",
        action: "status-subscribe",
        requestHostname: "status.oeffigo.app",
      }),
    ).rejects.toThrow();
  });
  test("fails closed on JSON failure and cancels a stalled verification after five seconds", async () => {
    request.restore();
    request = stub(globalThis, "fetch", () =>
      Promise.resolve(new Response("not json")),
    );
    await expect(
      verifyTurnstile({ token: "proof", action: "status-subscribe" }),
    ).rejects.toThrow();
    request.restore();
    request = stub(
      globalThis,
      "fetch",
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private-provider-details")),
            { once: true },
          );
        }),
    );
    const start = Date.now();
    await expect(
      verifyTurnstile({ token: "proof", action: "status-subscribe" }),
    ).rejects.toThrow("Sicherheitsprüfung");
    expect(Date.now() - start).toBeLessThan(6000);
  });
});
