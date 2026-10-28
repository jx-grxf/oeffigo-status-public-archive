import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatDate,
  formatDateRange,
  formatDateRangeParts,
  formatDateTime,
} from "./vienna-time.ts";

test("a maintenance window reads in local summer time", () => {
  const from = new Date("2026-10-20T08:00:00Z");
  const to = new Date("2026-10-20T10:00:00Z");
  assert.equal(
    formatDateRange(from, to, "de"),
    "20. Oktober um 10:00 – 12:00 (MESZ)",
  );
  assert.equal(
    formatDateRange(from, to, "en"),
    "20 October at 10:00 – 12:00 (CEST)",
  );
});

test("winter time switches the label", () => {
  assert.equal(
    formatDateRange(
      new Date("2026-12-01T09:00:00Z"),
      new Date("2026-12-01T09:00:00Z"),
      "de",
    ),
    "1. Dezember um 10:00 (MEZ)",
  );
});

test("a late UTC timestamp lands on the next Vienna day", () => {
  const at = new Date("2026-10-17T22:39:00Z");
  assert.equal(formatDate(at, { locale: "de" }), "18. Oktober 2026");
  assert.equal(formatDateTime(at, "de"), "18. Oktober um 00:39");
});

test("whole local days collapse to dates without a zone", () => {
  const { from, to } = formatDateRangeParts(
    new Date("2026-10-19T22:00:00.000Z"),
    new Date("2026-10-20T21:59:59.999Z"),
    "de",
  );
  assert.equal(from, "20. Oktober 2026");
  assert.equal(to, "20. Oktober 2026");
});

test("open ranges are translated", () => {
  const at = new Date("2026-10-18T12:00:00Z");
  assert.equal(
    formatDateRange(at, undefined, "de"),
    "Seit 18. Oktober um 14:00 (MESZ)",
  );
  assert.equal(
    formatDateRange(undefined, at, "en"),
    "Until 18 October at 14:00 (CEST)",
  );
  assert.equal(
    formatDateRange(undefined, undefined, "de"),
    "Gesamter Zeitraum",
  );
});
