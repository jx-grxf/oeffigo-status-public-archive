import assert from "node:assert/strict";
import { test } from "node:test";

import {
  expireSnapshot,
  feedComponentStatus,
  headline,
  isPaused,
  MAX_AGE_MS,
  mergeManualStatus,
  nativeStatus,
  newerReport,
  projectReport,
  services,
} from "./model.ts";

const now = Date.parse("2026-09-09T12:00:00Z");
const report = () => ({
  generatedAt: new Date(now).toISOString(),
  components: [
    "api",
    "api_router",
    "database",
    "official_history",
    "punctuality_index",
    "predictions",
    "disruption_search",
    "vehicle_positions",
    "mcp",
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
    { id: "estimates", state: "degraded", causes: ["report"] },
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
  assert.equal(
    snapshot.services.find((s) => s.id === "positions")?.scope,
    "positions_paused",
  );
  // Stops, search and surroundings are unaffected: green there is the truth.
  assert.equal(state("map"), "operational");
  assert.equal(
    headline(snapshot.services.map((x) => ({ ...x, maintenance: false }))),
    "operational",
    "a deliberate pause is not an open question",
  );
});
test("a stalled punctuality publication colours reliability and nothing else", () => {
  for (const status of ["degraded", "down"]) {
    const raw = report();
    raw.components = raw.components.map((c) =>
      c.id === "punctuality_index" ? { ...c, status } : c,
    );
    const snapshot = projectReport(raw, "operational", "operational", now, 100);
    const state = (id) => snapshot.services.find((s) => s.id === id)?.state;
    assert.equal(state("reliability"), status);
    assert.equal(state("departures"), "operational");
  }
});

test("paused functions do not colour the overall state, real maintenance does", () => {
  const raw = report();
  raw.components = raw.components.map((c) =>
    c.id === "vehicle_positions" ? { ...c, status: "paused" } : c,
  );
  raw.predictionDelivery = { state: "disabled", evidenceSource: "none" };
  const snapshot = projectReport(raw, "operational", "operational", now, 100);
  const others = mergeManualStatus(
    snapshot,
    services.map((s) => ({
      type: "component",
      component: { id: s.componentId, status: "success" },
    })),
    now,
  );
  const paused = others.services.filter((s) => isPaused(s)).map((s) => s.id);
  assert.deepEqual(paused, ["positions", "estimates"]);
  assert.equal(others.overall, "operational");
  assert.equal(nativeStatus(others.overall), "success");
  assert.equal(
    feedComponentStatus(others.services.find((s) => s.id === "positions")),
    "paused",
  );
  assert.equal(
    feedComponentStatus(others.services.find((s) => s.id === "map")),
    "operational",
  );
  assert.equal(headline(others.services), "operational");

  const maintenance = mergeManualStatus(
    snapshot,
    services.map((s) => ({
      type: "component",
      component: {
        id: s.componentId,
        status: s.id === "map" ? "info" : "success",
      },
    })),
    now,
  );
  const map = maintenance.services.find((s) => s.id === "map");
  assert.equal(map.maintenance, true);
  assert.equal(feedComponentStatus(map), "under_maintenance");
  assert.equal(
    maintenance.overall,
    "paused",
    "maintenance still shows as such",
  );
  assert.equal(headline(maintenance.services), "maintenance");
});
test("an unconfirmed function still stops the headline from reading all clear", () => {
  const paused = { state: "paused", maintenance: false };
  const ok = { state: "operational", maintenance: false };
  assert.equal(headline([ok, paused]), "operational");
  assert.equal(
    headline([ok, paused, { state: "unknown", maintenance: false }]),
    "unconfirmed",
  );
  assert.equal(
    headline([
      paused,
      { state: "unknown", maintenance: false, note: "no_demand" },
    ]),
    "no_known_issues",
  );
});
test("a confirmed Vienna-only alerts list keeps its scope note through a manual incident", () => {
  const raw = report();
  raw.components = raw.components.map((component) =>
    component.id === "disruption_search"
      ? { ...component, status: "degraded" }
      : component,
  );
  const snapshot = projectReport(raw, "operational", "operational", now, 100);
  const trackers = [
    { type: "component", component: { id: 4, status: "degraded" } },
  ];
  const merged = mergeManualStatus(snapshot, trackers, now);
  assert.equal(
    merged.services.find((service) => service.id === "alerts")?.scope,
    "wien_only",
  );
  const expired = mergeManualStatus(snapshot, trackers, now + MAX_AGE_MS + 1);
  assert.equal(
    expired.services.find((service) => service.id === "alerts")?.scope,
    undefined,
  );
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

test("sources take public names from router and components, and go grey without a fresh report", async () => {
  const { projectReport } = await import("./model.ts");
  const now = Date.parse("2026-10-23T09:00:00Z");
  const report = {
    generatedAt: new Date(now - 10_000).toISOString(),
    components: [
      { id: "wiener_linien", status: "operational" },
      { id: "disruption_search", status: "degraded" },
    ],
    router: [
      { id: "vao", status: "operational" },
      { id: "mgate", status: "standby" },
      { id: "trias", status: "down" },
    ],
  };
  const live = projectReport(report, "operational", "operational", now, 100);
  assert.deepEqual(
    Object.fromEntries(live.sources.map((s) => [s.id, s.state])),
    {
      vao: "operational",
      "wiener-linien": "operational",
      "verbund-linie": "down",
      mvo: "degraded",
      oebb: "paused",
    },
  );
  const old = projectReport(
    report,
    "operational",
    "operational",
    now + 600_000,
    100,
  );
  assert.ok(old.sources.every((s) => s.state === "unknown"));
});

test("traffic only makes a measured function worse", async () => {
  const { applyTraffic } = await import("./model.ts");
  const snapshot = {
    stale: false,
    services: [
      { id: "planning", state: "operational" },
      { id: "positions", state: "paused" },
      { id: "map", state: "down" },
    ],
  };
  const out = applyTraffic(snapshot, {
    planning: { state: "degraded" },
    positions: { state: "down" },
    map: { state: "degraded" },
  });
  assert.deepEqual(
    out.services.map((s) => s.state),
    ["degraded", "paused", "down"],
  );
  assert.equal(applyTraffic(snapshot, null), snapshot);
});

test("missing realtime in one Bundesland narrows departures, not all of Austria", async () => {
  const { applyRealtimeGaps } = await import("./model.ts");
  const snapshot = {
    stale: false,
    services: [
      { id: "departures", state: "operational" },
      { id: "planning", state: "operational" },
    ],
    sources: [
      { id: "verbund-linie", state: "operational" },
      { id: "vao", state: "operational" },
    ],
  };
  const out = applyRealtimeGaps(snapshot, ["steiermark"]);
  assert.deepEqual(
    out.services.map((s) => s.state),
    ["degraded", "operational"],
  );
  assert.deepEqual(out.services[0].realtimeGaps, ["steiermark"]);
  assert.deepEqual(
    out.sources,
    snapshot.sources,
    "a source is not blamed for an effect",
  );
  assert.equal(applyRealtimeGaps(snapshot, []), snapshot);
});

test("causes name why a function is not green, and only then", async () => {
  const { applyTraffic, applyRealtimeGaps } = await import("./model.ts");
  const raw = report();
  raw.components = raw.components.map((c) =>
    c.id === "database" ? { ...c, status: "degraded" } : c,
  );
  const base = projectReport(raw, "operational", "operational", now, 100);
  const by = (snap, id) => snap.services.find((s) => s.id === id);
  assert.deepEqual(by(base, "reliability").causes, ["report"]);
  assert.equal(by(base, "map").causes, undefined);

  const slow = applyTraffic(base, {
    planning: { state: "degraded", slow: {} },
    map: { state: "degraded" },
    reliability: { state: "degraded", slow: {} },
  });
  assert.deepEqual(by(slow, "planning").causes, ["slow"]);
  assert.deepEqual(by(slow, "map").causes, ["errors"]);
  assert.deepEqual(by(slow, "reliability").causes, ["report", "slow"]);

  const gaps = applyRealtimeGaps(slow, ["steiermark"]);
  assert.deepEqual(by(gaps, "departures").causes, ["realtime"]);

  const down = projectReport(report(), "down", "down", now, null);
  assert.deepEqual(by(down, "map").causes, ["unreachable"]);
  assert.deepEqual(by(down, "website").causes, ["unreachable"]);
});
