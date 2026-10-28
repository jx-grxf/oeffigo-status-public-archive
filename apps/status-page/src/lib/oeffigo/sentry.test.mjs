import assert from "node:assert/strict";
import { test } from "node:test";

import { judgeSentry } from "./sentry.ts";

test("a quiet day stays quiet", () => {
  assert.equal(judgeSentry([1, 0, 2, 1, 3], []).level, null);
});

test("a spike is many errors and far above the median", () => {
  assert.equal(judgeSentry([1, 2, 1, 2, 12], []).level, "degraded");
  assert.equal(judgeSentry([8, 9, 10, 9, 12], []).level, null);
});

test("a new error kind counts once it repeats", () => {
  const issue = (count) => [
    { title: "TypeError: x is undefined", count: String(count), firstSeen: "" },
  ];
  assert.equal(judgeSentry([0, 0, 0], issue(1)).level, null);
  const r = judgeSentry([0, 0, 0], issue(4));
  assert.equal(r.level, "degraded");
  assert.match(r.detail, /TypeError/);
});

test("a self-confirmed signal reaches Telegram on the next check, not after a quarter hour", async () => {
  const { evaluateAlerts } = await import("./alerts.ts");
  const reading = {
    id: "sentry",
    label: "Sentry",
    level: "degraded",
    detail: "x",
    confirm: 1,
  };
  const set = { signals: [reading], complete: true };
  const t0 = Date.parse("2026-10-23T09:00:00Z");
  const a = evaluateAlerts({}, set, t0);
  assert.equal(a.events.length, 0);
  const b = evaluateAlerts(a.memory, set, t0 + 60_000);
  assert.deepEqual(
    b.events.map((e) => e.kind),
    ["problem"],
  );
});
