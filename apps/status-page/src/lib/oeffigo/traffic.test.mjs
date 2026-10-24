import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FROZEN_MS,
  hold,
  isSlowWindow,
  judgeFunction,
  MIN_REQUESTS,
  MIN_ROUTE_REQUESTS,
} from "./traffic.ts";

const quiet = { total: 0, slow: 0 };
const route = (
  requests,
  errors,
  current = quiet,
  previous = current,
  base = null,
) => ({
  requests,
  errors,
  current,
  previous,
  medianMs: 300,
  baselineSlowShare: base,
});
const slow = (total, slowCount) => ({ total, slow: slowCount });

test("little traffic gives no verdict, however many fail", () => {
  const v = judgeFunction({ "/v2/trips": route(MIN_REQUESTS - 1, 9) }, [
    "/v2/trips",
  ]);
  assert.equal(v.state, null);
  assert.equal(v.insufficient, true);
});

test("a single nightly timeout does not colour a function", () => {
  assert.equal(
    judgeFunction({ "/v2/trips": route(12, 1) }, ["/v2/trips"]).state,
    null,
  );
});

test("errors need both a count and a share", () => {
  assert.equal(judgeFunction({ a: route(40, 3) }, ["a"]).state, "degraded");
  assert.equal(judgeFunction({ a: route(200, 4) }, ["a"]).state, null);
  assert.equal(judgeFunction({ a: route(20, 6) }, ["a"]).state, "down");
});

test("routes of one function add up", () => {
  const v = judgeFunction({ a: route(6, 2), b: route(6, 2) }, ["a", "b"]);
  assert.deepEqual([v.state, v.requests, v.errors], ["degraded", 12, 4]);
});

test("slowness needs 30 requests, 5 slow ones and 15 percent in one window", () => {
  assert.equal(isSlowWindow(slow(MIN_ROUTE_REQUESTS - 1, 29), null), false);
  assert.equal(isSlowWindow(slow(30, 4), null), false, "four slow requests");
  assert.equal(isSlowWindow(slow(60, 8), null), false, "13 percent");
  assert.equal(isSlowWindow(slow(30, 5), null), true);
  assert.equal(isSlowWindow(slow(40, 6), null), true, "exactly 15 percent");
});

test("13 requests with one 2.9 s outlier, as on 23 October, stay quiet", () => {
  const v = judgeFunction({ a: route(13, 0, slow(13, 1)) }, ["a"]);
  assert.equal(v.state, null);
  assert.equal(v.slow, undefined);
});

test("a route that is always slow needs twice its usual share", () => {
  assert.equal(isSlowWindow(slow(100, 30), 0.25), false);
  assert.equal(isSlowWindow(slow(100, 50), 0.25), true);
  assert.equal(isSlowWindow(slow(100, 16), null), true, "no baseline yet");
});

test("slowness counts only when two windows in a row are slow", () => {
  const now = slow(50, 12);
  assert.equal(
    judgeFunction({ a: route(50, 0, now, slow(50, 1)) }, ["a"]).state,
    null,
    "one slow window is a blip",
  );
  const both = judgeFunction({ a: route(50, 0, now, slow(50, 10)) }, ["a"]);
  assert.equal(both.state, "degraded");
  assert.deepEqual(
    [both.slow.route, both.slow.slow, both.slow.total],
    ["a", 12, 50],
  );
});

test("slowness is judged per route, not summed over a function", () => {
  const thin = slow(20, 10);
  assert.equal(
    judgeFunction({ a: route(20, 0, thin), b: route(20, 0, thin) }, ["a", "b"])
      .state,
    null,
  );
});

test("a verdict holds after two minutes and leaves after three quiet ones", () => {
  let m = hold(undefined, "degraded");
  assert.equal(m.held, null);
  m = hold(m, "degraded");
  assert.equal(m.held, "degraded");
  m = hold(m, null);
  m = hold(m, null);
  assert.equal(m.held, "degraded");
  m = hold(m, null);
  assert.equal(m.held, null);
});

test("a flapping reading never settles", () => {
  let m;
  for (const v of ["down", null, "down", null, "down"]) m = hold(m, v);
  assert.equal(m.held, null);
});

test("realtime is missing when the share falls below half of last week", async () => {
  const { judgeRealtime } = await import("./traffic.ts");
  assert.equal(judgeRealtime({ now: 0.05, total: 120, baseline: 0.7 }), true);
  assert.equal(judgeRealtime({ now: 0.5, total: 120, baseline: 0.7 }), false);
  assert.equal(
    judgeRealtime({ now: 0.05, total: 12, baseline: 0.7 }),
    false,
    "too few departures",
  );
  assert.equal(
    judgeRealtime({ now: 0.0, total: 120, baseline: 0.1 }),
    false,
    "a region that rarely has realtime",
  );
  assert.equal(
    judgeRealtime({ now: 0.0, total: 120, baseline: null }),
    false,
    "no history yet",
  );
});

test("too little traffic freezes a held outage for a while, then lets it go", () => {
  const t0 = Date.parse("2026-10-23T02:00:00Z");
  let m;
  for (let i = 0; i < 4; i++) m = hold(m, "down", false, t0 + i * 60_000);
  assert.equal(m.held, "down");
  const quietFrom = t0 + 4 * 60_000;
  for (let i = 0; i < 10; i++) m = hold(m, null, true, quietFrom + i * 60_000);
  assert.equal(m.held, "down", "ten quiet minutes are no recovery");
  m = hold(m, null, true, quietFrom + FROZEN_MS - 1);
  assert.equal(m.held, "down");
  m = hold(m, null, true, quietFrom + FROZEN_MS);
  assert.equal(m.held, null, "after 15 minutes there is no evidence left");
});

test("traffic in between restarts the quiet clock", () => {
  const t0 = Date.parse("2026-10-23T02:00:00Z");
  let m;
  for (let i = 0; i < 4; i++) m = hold(m, "down", false, t0 + i * 60_000);
  m = hold(m, null, true, t0 + 10 * 60_000);
  m = hold(m, "down", false, t0 + 11 * 60_000);
  assert.equal(m.quietSince, undefined);
  m = hold(m, null, true, t0 + 12 * 60_000);
  m = hold(m, null, true, t0 + 12 * 60_000 + FROZEN_MS - 1);
  assert.equal(m.held, "down");
});

test("three calm minutes with real traffic end an outage", () => {
  let m;
  for (let i = 0; i < 4; i++) m = hold(m, "down");
  for (let i = 0; i < 3; i++) m = hold(m, null);
  assert.equal(m.held, null);
});

test("an outage needs four minutes and twenty requests, a degradation two", () => {
  let m;
  for (let i = 0; i < 3; i++) m = hold(m, "down");
  assert.equal(m.held, null);
  m = hold(m, "down");
  assert.equal(m.held, "down");
  assert.equal(
    judgeFunction({ a: route(12, 6) }, ["a"]).state,
    "degraded",
    "12 requests are too few for down",
  );
});

test("readTraffic turns Prometheus answers into verdicts and says nothing without Grafana", async () => {
  Deno.env.set("GRAFANA_PROM_URL", "https://prom.test/api/prom");
  Deno.env.set("GRAFANA_PROM_USER", "1");
  Deno.env.set("GRAFANA_READ_TOKEN", "t");
  const original = globalThis.fetch;
  let up = true;
  globalThis.fetch = async (url) => {
    if (!up) return new Response("", { status: 503 });
    const q = new URL(String(url)).searchParams.get("query") ?? "";
    const result = q.includes("increase(oeffigo_http_requests_total")
      ? [
          {
            metric: { route: "/v2/trips", status_class: "2xx" },
            value: [0, "30"],
          },
          {
            metric: { route: "/v2/trips", status_class: "5xx" },
            value: [0, "3"],
          },
        ]
      : [];
    return Response.json({ status: "success", data: { result } });
  };
  try {
    const { readTraffic } = await import("./traffic.ts");
    const first = await readTraffic(Date.now());
    assert.equal(first.planning.requests, 33);
    assert.equal(
      first.planning.state,
      null,
      "one bad minute is not yet a verdict",
    );
    const second = await readTraffic(Date.now());
    assert.equal(second.planning.state, "degraded");
    up = false;
    assert.equal(await readTraffic(Date.now()), null);
  } finally {
    globalThis.fetch = original;
  }
});

test("readTraffic reads slow shares from two windows and ignores a young baseline", async () => {
  Deno.env.set("GRAFANA_PROM_URL", "https://prom.test/api/prom");
  Deno.env.set("GRAFANA_PROM_USER", "1");
  Deno.env.set("GRAFANA_READ_TOKEN", "t");
  const original = globalThis.fetch;
  const seen = [];
  const hist = (total, fast) => [
    { metric: { route: "/v2/trips", le: "+Inf" }, value: [0, String(total)] },
    { metric: { route: "/v2/trips", le: "2.5" }, value: [0, String(fast)] },
  ];
  globalThis.fetch = async (url) => {
    const q = new URL(String(url)).searchParams.get("query") ?? "";
    seen.push(q);
    let result = [];
    if (q.includes("increase(oeffigo_http_requests_total"))
      result = [
        {
          metric: { route: "/v2/trips", status_class: "2xx" },
          value: [0, "48"],
        },
      ];
    else if (q.includes("count_over_time"))
      result = [{ metric: {}, value: [0, "30"] }];
    else if (q.includes("[7d]")) result = hist(10_000, 5_000);
    else if (q.includes("offset 10m")) result = hist(50, 40);
    else if (q.includes("_bucket") && q.includes("increase"))
      result = hist(48, 38);
    return Response.json({ status: "success", data: { result } });
  };
  try {
    const { readTraffic } = await import("./traffic.ts");
    const now = Date.now();
    await readTraffic(now);
    const second = await readTraffic(now + 60_000);
    assert.equal(second.planning.state, "degraded");
    assert.equal(second.planning.slow.slow, 10);
    assert.equal(second.planning.slow.total, 48);
    assert.ok(
      seen.every((q) => !q.includes("\\")),
      "no backslash escapes in the queries",
    );
    assert.ok(seen.some((q) => q.includes('le=~"2.5|[+]Inf"')));
  } finally {
    globalThis.fetch = original;
  }
});
