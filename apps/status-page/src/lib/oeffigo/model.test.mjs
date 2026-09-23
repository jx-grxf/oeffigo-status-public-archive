import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUCKET_COUNT,
  buildHistory,
  expireSnapshot,
  headline,
  MAX_AGE_MS,
  mergeManualStatus,
  newerReport,
  projectReport,
} from "./model.ts";

const now = Date.parse("2026-09-09T12:00:00Z");
const report = () => ({
  generatedAt: new Date(now).toISOString(),
  components: [
    "api",
    "api_router",
    "database",
    "official_history",
    "predictions",
    "disruption_search",
    "vehicle_positions",
  ].map((id) => ({ id, status: "operational" })),
  predictionDelivery: {
    state: "healthy",
    evidenceSource: "official_stopevent",
  },
});
test("only a fresh valid report and confirmed API produce green functions", () => {
  assert.ok(
    projectReport(
      report(),
      "operational",
      "operational",
      now,
      100,
    ).services.every((s) => s.state === "operational"),
  );
  for (const raw of [
    null,
    {},
    { ...report(), generatedAt: new Date(now - MAX_AGE_MS - 1).toISOString() },
    { ...report(), generatedAt: new Date(now + 60000).toISOString() },
  ]) {
    assert.ok(
      projectReport(raw, "operational", "operational", now, 100)
        .services.filter((s) => s.id !== "website")
        .every((s) => s.state === "unknown"),
    );
  }
});
test("missing components and predictions without delivery do not become green", () => {
  const raw = report();
  raw.components = raw.components.filter((c) => c.id !== "database");
  raw.predictionDelivery.state = "idle";
  const snapshot = projectReport(raw, "operational", "operational", now, 100);
  assert.equal(
    snapshot.services.find((s) => s.id === "estimates")?.state,
    "unknown",
  );
  assert.equal(
    snapshot.services.find((s) => s.id === "reliability")?.state,
    "unknown",
  );
});
test("API interruption overrides a healthy cached report but not an independent website", () => {
  const snapshot = projectReport(report(), "down", "operational", now, null);
  assert.ok(
    snapshot.services
      .filter((s) => s.id !== "website")
      .every((s) => s.state === "down"),
  );
  assert.equal(
    snapshot.services.find((s) => s.id === "website")?.state,
    "operational",
  );
});
test("a stopped collector expires while keeping the original observation time", () => {
  const snapshot = projectReport(
    report(),
    "operational",
    "operational",
    now,
    100,
  );
  const expired = expireSnapshot(snapshot, now + MAX_AGE_MS + 1);
  assert.equal(expired.checkedAt, snapshot.checkedAt);
  assert.ok(expired.stale);
  assert.ok(expired.services.every((s) => s.state === "unknown"));
});
test("idle predictions stay neutral and carry the reason instead of an outage", () => {
  const raw = report();
  raw.predictionDelivery = {
    state: "idle",
    evidenceSource: "official_stopevent",
    reason: "no_recent_demand",
  };
  const estimates = projectReport(
    raw,
    "operational",
    "operational",
    now,
    100,
  ).services.find((s) => s.id === "estimates");
  assert.deepEqual(estimates, {
    id: "estimates",
    state: "unknown",
    note: "no_demand",
  });
  raw.predictionDelivery.reason = "insufficient_sample";
  assert.equal(
    projectReport(raw, "operational", "operational", now, 100).services.find(
      (s) => s.id === "estimates",
    ).note,
    "sparse_data",
  );
  raw.components.find((c) => c.id === "predictions").status = "degraded";
  assert.deepEqual(
    projectReport(raw, "operational", "operational", now, 100).services.find(
      (s) => s.id === "estimates",
    ),
    { id: "estimates", state: "degraded" },
  );
});
test("switched-off predictions read as in development, never as an outage", () => {
  const raw = report();
  raw.predictionDelivery = {
    state: "disabled",
    evidenceSource: "none",
    reason: "not_enabled",
  };
  const snapshot = projectReport(raw, "operational", "operational", now, 100);
  assert.deepEqual(
    snapshot.services.find((s) => s.id === "estimates"),
    {
      id: "estimates",
      state: "paused",
      note: "in_development",
    },
  );
  const merged = mergeManualStatus(snapshot, [], now, false);
  const estimates = merged.services.find((s) => s.id === "estimates");
  assert.equal(estimates.state, "paused");
  assert.equal(estimates.note, "in_development");
  assert.equal(estimates.maintenance, false);
  const broken = mergeManualStatus(
    snapshot,
    [{ type: "component", component: { id: 5, status: "error" } }],
    now,
  ).services.find((s) => s.id === "estimates");
  assert.equal(broken.state, "down");
  assert.equal(broken.note, undefined);
});
test("an older edge copy never replaces a newer report, invalid ones are ignored", () => {
  const fresh = report();
  const older = {
    ...report(),
    generatedAt: new Date(now - 300_000).toISOString(),
  };
  assert.equal(newerReport(fresh, older, now), fresh);
  assert.equal(newerReport(older, fresh, now), fresh);
  assert.equal(newerReport(fresh, null, now), fresh);
  assert.equal(newerReport(null, {}, now), null);
  const future = {
    ...report(),
    generatedAt: new Date(now + 60_000).toISOString(),
  };
  assert.equal(newerReport(fresh, future, now), fresh);
  assert.equal(newerReport(future, older, now), older);
});
test("a report fresh at check time stays valid while the check is current", () => {
  const raw = report();
  raw.generatedAt = new Date(now - MAX_AGE_MS + 1000).toISOString();
  const snapshot = projectReport(raw, "operational", "operational", now, 100);
  const shown = expireSnapshot(snapshot, now + MAX_AGE_MS - 1000);
  assert.equal(shown.stale, false);
  assert.ok(shown.services.every((s) => s.state === "operational"));
});
test("a resting component pauses its own function and leaves the map green", () => {
  const raw = report();
  raw.components = raw.components.map((c) =>
    c.id === "vehicle_positions" ? { ...c, status: "paused" } : c,
  );
  const snapshot = projectReport(raw, "operational", "operational", now, 100);
  const state = (id) => snapshot.services.find((s) => s.id === id)?.state;
  assert.equal(state("positions"), "paused");
  // Stops, search and surroundings are unaffected: green there is the truth.
  assert.equal(state("map"), "operational");
  assert.equal(headline(snapshot.services), "no_known_issues");
});
test("history buckets need confirmed minutes for green and show any confirmed failure", () => {
  const at = Date.parse("2026-09-09T12:10:00Z");
  const rows = [
    { bucket: 46, id: "departures", state: "operational", n: 26 },
    { bucket: 46, id: "departures", state: "unknown", n: 4 },
    { bucket: 45, id: "departures", state: "operational", n: 25 },
    { bucket: 44, id: "departures", state: "operational", n: 29 },
    { bucket: 44, id: "departures", state: "down", n: 1 },
    { bucket: 47, id: "departures", state: "operational", n: 8 },
    { bucket: 47, id: "website", state: "bogus", n: 8 },
  ];
  const history = buildHistory(rows, at);
  const departures = history.departures;
  assert.equal(departures.length, BUCKET_COUNT);
  assert.equal(departures[47].start, "2026-09-09T12:00:00.000Z");
  assert.equal(departures[46].state, "operational");
  assert.equal(departures[46].checks, 30);
  assert.equal(departures[45].state, "unknown");
  assert.equal(departures[44].state, "down");
  assert.equal(departures[47].state, "operational");
  assert.equal(departures[0].state, "unknown");
  assert.equal(history.website[47].checks, 0);
});
test("the headline names confirmed problems first and tolerates explained neutrals only", () => {
  const ok = { state: "operational", maintenance: false };
  const idle = { state: "unknown", maintenance: false, note: "no_demand" };
  assert.equal(headline([ok, ok]), "operational");
  assert.equal(headline([ok, idle]), "no_known_issues");
  assert.equal(
    headline([ok, idle, { state: "unknown", maintenance: false }]),
    "unconfirmed",
  );
  assert.equal(
    headline([ok, { state: "unknown", maintenance: true }]),
    "maintenance",
  );
  assert.equal(
    headline([{ state: "degraded", maintenance: false }, idle]),
    "degraded",
  );
  assert.equal(
    headline([
      { state: "degraded", maintenance: false },
      { state: "down", maintenance: false },
    ]),
    "down",
  );
});
