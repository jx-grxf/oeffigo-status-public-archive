import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bucketBounds,
  bucketLevel,
  buildRange,
  countCauses,
  countMinutes,
  emptyCounts,
  manualIntervals,
  minuteCauses,
  minuteLevels,
  uptime,
  viennaDayStart,
} from "./availability.ts";
import { services } from "./model.ts";

const ids = services.map((s) => s.id);

const t0 = Date.parse("2026-10-21T10:00:00Z");
const sample = (
  minute,
  { api = "operational", website = "operational", state = "operational" } = {},
) => ({
  checkedAt: new Date(t0 + minute * 60_000 + 5_000).toISOString(),
  generatedAt: null,
  stale: false,
  api,
  website,
  latencyMs: 80,
  services: services.map((s) => ({
    id: s.id,
    state:
      s.id === "website"
        ? website === "down"
          ? "down"
          : website === "unknown"
            ? "unknown"
            : "operational"
        : state,
  })),
  viennaRealtime: "operational",
});

test("a confirmed outage counts from its first failed minute", () => {
  const samples = [
    sample(0),
    sample(1, { api: "unknown", state: "unknown" }),
    sample(2, { api: "unknown", state: "unknown" }),
    sample(3, { api: "down", state: "down" }),
    sample(4),
  ];
  const levels = minuteLevels(samples, ids).get("departures");
  const counts = countMinutes(levels, [], t0, t0 + 5 * 60_000);
  assert.equal(counts.down, 3);
  assert.equal(counts.operational, 2);
  assert.equal(uptime(counts), 2 / 5);
});

test("unconfirmed failures and stale reports stay unknown and are not measured", () => {
  const samples = [
    sample(0),
    sample(1, { api: "unknown", state: "unknown" }),
    sample(2),
    sample(3, { state: "unknown" }),
  ];
  const counts = countMinutes(
    minuteLevels(samples, ids).get("departures"),
    [],
    t0,
    t0 + 5 * 60_000,
  );
  assert.deepEqual(
    { op: counts.operational, unknown: counts.unknown, down: counts.down },
    { op: 2, unknown: 3, down: 0 },
  );
  assert.equal(uptime(counts), 1);
});

test("manual impact overrides: partial counts 30 %, degraded counts nothing", () => {
  const samples = Array.from({ length: 10 }, (_, m) => sample(m));
  const levels = minuteLevels(samples, ids).get("departures");
  const manual = [
    { componentId: 1, impact: "partial_outage", from: t0, to: t0 + 5 * 60_000 },
    {
      componentId: 1,
      impact: "degraded_performance",
      from: t0 + 5 * 60_000,
      to: t0 + 10 * 60_000,
    },
  ];
  const counts = countMinutes(levels, manual, t0, t0 + 10 * 60_000);
  assert.equal(counts.partial, 5);
  assert.equal(counts.degraded, 5);
  assert.equal(uptime(counts), (10 - 0.3 * 5) / 10);
});

test("a manual outage counts even where the collector saw nothing", () => {
  const manual = [
    { componentId: 1, impact: "major_outage", from: t0, to: t0 + 3 * 60_000 },
  ];
  const counts = countMinutes(undefined, manual, t0, t0 + 5 * 60_000);
  assert.equal(counts.down, 3);
  assert.equal(counts.unknown, 2);
  assert.equal(uptime(counts), 0);
});

test("no measurement means no percentage, never 100 %", () => {
  assert.equal(uptime(emptyCounts()), null);
});

test("green needs coverage; any confirmed problem colours the bucket", () => {
  assert.equal(
    bucketLevel({ ...emptyCounts(), operational: 26 }, 30),
    "operational",
  );
  assert.equal(
    bucketLevel({ ...emptyCounts(), operational: 25 }, 30),
    "unknown",
  );
  assert.equal(
    bucketLevel({ ...emptyCounts(), operational: 29, down: 1 }, 30),
    "down",
  );
  assert.equal(
    bucketLevel({ ...emptyCounts(), operational: 29, partial: 1 }, 30),
    "partial",
  );
  assert.equal(bucketLevel({ ...emptyCounts(), paused: 30 }, 30), "paused");
  assert.equal(bucketLevel(emptyCounts(), 0), "unknown");
});

test("report updates become intervals; resolving ends them", () => {
  const at = (m) => t0 + m * 60_000;
  const intervals = manualIntervals(
    [
      {
        resolvedAt: at(30),
        updates: [
          {
            id: 1,
            date: at(0),
            impacts: [
              { componentId: 1, impact: "major_outage" },
              { componentId: 2, impact: "degraded_performance" },
            ],
          },
          {
            id: 2,
            date: at(10),
            impacts: [{ componentId: 1, impact: "partial_outage" }],
          },
          {
            id: 3,
            date: at(20),
            impacts: [{ componentId: 1, impact: "operational" }],
          },
        ],
      },
    ],
    at(60),
  );
  assert.deepEqual(
    intervals.map((i) => [
      i.componentId,
      i.impact,
      (i.from - t0) / 60_000,
      (i.to - t0) / 60_000,
    ]),
    [
      [1, "major_outage", 0, 10],
      [1, "partial_outage", 10, 20],
      [2, "degraded_performance", 0, 30],
    ],
  );
});

test("Vienna days are DST-safe", () => {
  assert.equal(
    new Date(viennaDayStart(Date.parse("2026-10-21T10:00:00Z"))).toISOString(),
    "2026-10-20T22:00:00.000Z",
  );
  // 25. Oktober 2026: Umstellung auf Winterzeit, der Tag hat 25 Stunden.
  assert.equal(
    new Date(viennaDayStart(Date.parse("2026-10-25T20:00:00Z"))).toISOString(),
    "2026-10-24T22:00:00.000Z",
  );
  const days = bucketBounds("30d", Date.parse("2026-10-26T12:00:00Z"));
  const dstDay = days.find(([s]) => s === Date.parse("2026-10-24T22:00:00Z"));
  assert.equal((dstDay[1] - dstDay[0]) / 3_600_000, 25);
  assert.equal(days.length, 30);
  assert.equal(days.at(-1)[0], Date.parse("2026-10-25T23:00:00Z"));
});

test("ranges sum slots into buckets and one percentage per function", () => {
  const now = Date.parse("2026-10-21T12:10:00Z");
  const full = { ...emptyCounts(), operational: 30 };
  const slots = [];
  for (let i = 0; i < 48; i++) {
    const start = Date.parse("2026-10-20T12:30:00Z") + i * 1_800_000;
    if (start > now) break;
    slots.push({
      start,
      service: "departures",
      counts: i === 10 ? { ...emptyCounts(), operational: 20, down: 10 } : full,
    });
  }
  const day = buildRange("24h", slots, now, ids);
  const buckets = day.buckets.departures;
  assert.equal(buckets.length, 48);
  assert.equal(buckets[10].level, "down");
  assert.equal(buckets.at(-1).start, "2026-10-21T12:00:00.000Z");
  const measured = slots.reduce(
    (n, s) => n + s.counts.operational + s.counts.down,
    0,
  );
  assert.equal(day.uptime.departures, (measured - 10) / measured);
  assert.equal(day.uptime.website, null);
  assert.equal(day.since, "2026-10-20T12:30:00.000Z");
});

test("a mostly paused function gets no percentage from a few measured minutes", () => {
  const now = Date.parse("2026-10-21T12:10:00Z");
  const slots = [];
  for (let i = 0; i < 40; i++) {
    const start = Date.parse("2026-10-20T12:30:00Z") + i * 1_800_000;
    slots.push({
      start,
      service: "estimates",
      counts:
        i === 3
          ? { ...emptyCounts(), degraded: 20, down: 2, paused: 8 }
          : { ...emptyCounts(), paused: 30 },
    });
  }
  assert.equal(buildRange("24h", slots, now, ids).uptime.estimates, null);
});

const withCauses = (minute, state, causes, realtimeGaps) => {
  const base = sample(minute, { state });
  return {
    ...base,
    services: base.services.map((s) =>
      s.id === "planning" ? { ...s, causes, realtimeGaps } : s,
    ),
  };
};

test("causes are counted per minute for degraded and down minutes only", () => {
  const samples = [
    withCauses(0, "operational", ["slow"]),
    withCauses(1, "degraded", ["slow"]),
    withCauses(2, "degraded", ["slow", "errors"]),
    withCauses(3, "degraded", ["realtime"], ["wien", "tirol"]),
  ];
  const minutes = minuteCauses(samples, ids).get("planning");
  const slot = countCauses(minutes, t0, t0 + 30 * 60_000);
  assert.deepEqual(slot, {
    minutes: { slow: 2, errors: 1, realtime: 1 },
    regions: ["tirol", "wien"],
  });
  assert.equal(
    countCauses(minuteCauses([sample(0)], ids).get("planning"), t0, t0 + 3e5),
    null,
  );
});

test("minutes before a confirmed outage are unreachable", () => {
  const samples = [
    sample(0),
    sample(1, { api: "unknown", state: "unknown" }),
    sample(2, { api: "unknown", state: "unknown" }),
    withCauses(3, "down", undefined),
  ];
  samples[3].api = "down";
  const minutes = minuteCauses(samples, ids).get("planning");
  const slot = countCauses(minutes, t0, t0 + 30 * 60_000);
  assert.deepEqual(slot.minutes, { unreachable: 2 });
});

test("a bucket carries the summed causes of its slots", () => {
  const slot = (start, causes) => ({
    start,
    service: "planning",
    counts: { ...emptyCounts(), degraded: 12, operational: 18 },
    causes,
  });
  const half = Math.floor(t0 / 1_800_000) * 1_800_000;
  const range = buildRange(
    "24h",
    [
      slot(half, { minutes: { slow: 10 }, regions: [] }),
      slot(half - 1_800_000, { minutes: { slow: 2, errors: 1 }, regions: [] }),
    ],
    half + 1_700_000,
    ids,
  );
  const withCause = range.buckets.planning.filter((b) => b.causes);
  assert.equal(withCause.length, 2);
  assert.deepEqual(withCause[1].causes.minutes, { slow: 10 });
  assert.equal(
    range.buckets.map?.every((b) => !b.causes),
    true,
  );
});

test("a note after the resolution does not stretch an impact", () => {
  const at = (m) => t0 + m * 60_000;
  const intervals = manualIntervals(
    [
      {
        resolvedAt: at(30),
        updates: [
          {
            id: 1,
            date: at(0),
            impacts: [{ componentId: 1, impact: "major_outage" }],
          },
          { id: 2, date: at(30), impacts: [] },
          {
            id: 3,
            date: at(3000),
            impacts: [{ componentId: 1, impact: "operational" }],
          },
        ],
      },
    ],
    at(4000),
  );
  assert.deepEqual(
    intervals.map((i) => [i.impact, i.from, i.to]),
    [["major_outage", at(0), at(30)]],
  );
});
