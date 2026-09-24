import assert from "node:assert/strict";
import { test } from "node:test";

import { localizeMaintenance, localizeReport } from "./incident-copy.ts";

const report = {
  id: 3,
  title: "Fahrzeugpositionen pausiert",
  statusReportUpdates: [
    { id: 7, message: "Wir haben die Quelle abgeschaltet." },
    { id: 8, message: "Weiterhin pausiert." },
  ],
};

test("a fully translated report is no longer marked German", () => {
  const english = localizeReport(report, {
    reports: { 3: { title: "Vehicle positions paused" } },
    updates: {
      7: { message: "We switched the source off." },
      8: { message: "Still paused." },
    },
    maintenances: {},
  });
  assert.equal(english.title, "Vehicle positions paused");
  assert.deepEqual(
    english.statusReportUpdates.map((u) => u.message),
    ["We switched the source off.", "Still paused."],
  );
  assert.equal(english.german, false);
  assert.equal(english.germanTitle, false);
});

test("a missing update translation keeps the German text and the marker", () => {
  const partial = localizeReport(report, {
    reports: { 3: { title: "Vehicle positions paused" } },
    updates: { 7: { message: "We switched the source off." } },
    maintenances: {},
  });
  assert.equal(partial.statusReportUpdates[1].message, "Weiterhin pausiert.");
  assert.equal(partial.german, true);
  assert.equal(partial.germanTitle, false);
});

test("without English copy nothing changes and the text stays German", () => {
  const german = localizeReport(report, null);
  assert.equal(german.title, report.title);
  assert.equal(german.german, true);
  const maintenance = localizeMaintenance(
    { id: 1, title: "Wartung", message: "Kurz offline." },
    {
      reports: {},
      updates: {},
      maintenances: { 1: { title: "Maintenance", message: null } },
    },
  );
  assert.equal(maintenance.title, "Maintenance");
  assert.equal(maintenance.message, "Kurz offline.");
  assert.equal(maintenance.german, true);
  assert.equal(maintenance.germanTitle, false);
});
