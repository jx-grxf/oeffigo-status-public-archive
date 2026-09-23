import assert from "node:assert/strict";
import { test } from "node:test";

import { toStatus, toSummary } from "../../content/status-json.ts";
import {
  expireSnapshot,
  MAX_AGE_MS,
  mergeManualStatus,
  projectReport,
  services,
} from "./model.ts";
import { withCombinedStatus } from "./public-state.ts";

const NOW = Date.parse("2026-09-09T12:00:00Z");
const report = () => ({
  generatedAt: new Date(NOW).toISOString(),
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
const snapshot = (api = "operational", raw = report()) =>
  projectReport(raw, api, "operational", NOW, 10);
const trackers = () =>
  services.map((s) => ({
    type: "component",
    component: { id: s.componentId, name: s.en, status: "success" },
  }));
const page = () => ({
  title: "ÖffiGo",
  status: "success",
  updatedAt: new Date(NOW),
  trackers: trackers(),
  statusReports: [],
  maintenances: [],
});
const BASE = "https://status.oeffigo.app";
/** Row order follows `services`; naming the function survives a new row. */
const row = (id) => services.findIndex((service) => service.id === id);
const ESTIMATES = row("estimates");
const WEBSITE = row("website");

test("a report too old at check time is unconfirmed separately from an independently checked website", () => {
  const raw = report();
  raw.generatedAt = new Date(NOW - MAX_AGE_MS - 1).toISOString();
  const current = snapshot("operational", raw);
  const shown = expireSnapshot(current, NOW + 1);
  assert.equal(shown.stale, true);
  assert.equal(shown.api, "operational");
  assert.equal(shown.website, "operational");
  assert.ok(
    shown.services
      .filter((s) => s.id !== "website")
      .every((s) => s.state === "unknown"),
  );
  assert.equal(
    shown.services.find((s) => s.id === "website").state,
    "operational",
  );
  const expired = expireSnapshot(current, NOW + MAX_AGE_MS + 1);
  assert.ok(expired.services.every((s) => s.state === "unknown"));
  assert.equal(expired.checkedAt, current.checkedAt);
});

test("an idle prediction note survives only while manual data confirms no incident", () => {
  const raw = report();
  raw.predictionDelivery = {
    state: "idle",
    evidenceSource: "official_stopevent",
    reason: "no_recent_demand",
  };
  const manual = trackers();
  const idle = mergeManualStatus(snapshot("operational", raw), manual, NOW);
  assert.equal(idle.services[ESTIMATES].note, "no_demand");
  assert.equal(
    toSummary(page(), BASE, NOW, idle).components[ESTIMATES].status,
    "unknown",
  );
  assert.equal(
    mergeManualStatus(snapshot("operational", raw), manual, NOW, false)
      .services[ESTIMATES].note,
    undefined,
  );
  manual[ESTIMATES].component.status = "error";
  const incident = mergeManualStatus(snapshot("operational", raw), manual, NOW);
  assert.equal(incident.services[ESTIMATES].state, "down");
  assert.equal(incident.services[ESTIMATES].note, undefined);
});

test("invalid/future check timestamps expire all checks and fresh confirmed outages stay down", () => {
  for (const checkedAt of [
    "bad",
    new Date(NOW + 30_001).toISOString(),
    new Date(NOW - MAX_AGE_MS - 1).toISOString(),
  ]) {
    assert.ok(
      expireSnapshot({ ...snapshot(), checkedAt }, NOW).services.every(
        (s) => s.state === "unknown",
      ),
    );
  }
  const raw = report();
  raw.generatedAt = new Date(NOW - MAX_AGE_MS - 1).toISOString();
  assert.ok(
    expireSnapshot(snapshot("down", raw), NOW)
      .services.filter((s) => s.id !== "website")
      .every((s) => s.state === "down"),
  );
});

test("machine current and summary cannot report green during an API outage without an incident", () => {
  const stored = page();
  const merged = mergeManualStatus(snapshot("down"), stored.trackers, NOW);
  assert.equal(toStatus(stored, BASE, merged).status.indicator, "major");
  const summary = toSummary(stored, BASE, NOW, merged);
  assert.equal(summary.status.indicator, "major");
  assert.equal(summary.components[0].status, "major_outage");
  assert.equal(summary.components[WEBSITE].status, "operational");
});

test("static manual incidents override green measurements and resolve from current DB states", () => {
  const stored = page();
  stored.trackers[0].component.status = "error";
  const merged = mergeManualStatus(snapshot(), stored.trackers, NOW);
  assert.equal(toStatus(stored, BASE, merged).status.indicator, "major");
  assert.equal(
    toSummary(stored, BASE, NOW, merged).components[0].status,
    "major_outage",
  );
  stored.trackers[0].component.status = "success";
  assert.equal(
    mergeManualStatus(snapshot(), stored.trackers, NOW).overall,
    "operational",
  );
});

test("missing manual data is unknown and maintenance cannot conceal a measured outage", () => {
  assert.equal(
    mergeManualStatus(snapshot(), undefined, NOW).overall,
    "unknown",
  );
  assert.equal(
    mergeManualStatus(snapshot(), trackers(), NOW, false).overall,
    "unknown",
  );
  const manual = trackers();
  manual[0].component.status = "info";
  assert.equal(mergeManualStatus(snapshot(), manual, NOW).overall, "paused");
  const failed = mergeManualStatus(snapshot("down"), manual, NOW);
  assert.equal(failed.overall, "down");
  assert.equal(failed.services[0].maintenance, false);
});

test("disabled predictions are paused, but never hide an API interruption or incident", () => {
  const raw = report();
  raw.predictionDelivery = { state: "disabled", evidenceSource: "none" };
  const manual = trackers();
  const paused = mergeManualStatus(snapshot("operational", raw), manual, NOW);
  assert.equal(paused.services[ESTIMATES].state, "paused");
  assert.equal(
    toSummary(page(), BASE, NOW, paused).components[ESTIMATES].status,
    "under_maintenance",
  );
  assert.equal(
    mergeManualStatus(snapshot("down", raw), manual, NOW).services[ESTIMATES]
      .state,
    "down",
  );
  manual[ESTIMATES].component.status = "error";
  assert.equal(
    mergeManualStatus(snapshot("operational", raw), manual, NOW).services[
      ESTIMATES
    ].state,
    "down",
  );
});

test("legacy feed/markdown page adaptation keeps static incidents and unknown checks non-green", () => {
  const stored = page();
  const unknown = withCombinedStatus(
    stored,
    mergeManualStatus(undefined, stored.trackers, NOW),
  );
  assert.equal(unknown.status, "degraded");
  assert.ok(
    unknown.trackers.every(
      (tracker) => tracker.component.status === "degraded",
    ),
  );
  stored.trackers[0].component.status = "error";
  const incident = withCombinedStatus(
    stored,
    mergeManualStatus(snapshot(), stored.trackers, NOW),
  );
  assert.equal(incident.status, "error");
  assert.equal(incident.trackers[0].component.status, "error");
  assert.equal(incident.trackers[WEBSITE].component.status, "success");
});
