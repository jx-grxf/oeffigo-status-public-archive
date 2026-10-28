import assert from "node:assert/strict";
import { test } from "node:test";

import { reportResolvedAt } from "../../../../../packages/ui/src/components/blocks/status.utils.ts";

const at = (h) => new Date(Date.UTC(2026, 9, 21, 15) + h * 3_600_000);

test("the first resolution after the last open update ends a report", () => {
  assert.deepEqual(
    reportResolvedAt([
      { status: "identified", date: at(0) },
      { status: "monitoring", date: at(3) },
      { status: "resolved", date: at(16) },
      { status: "resolved", date: at(54) },
    ]),
    at(16),
  );
});

test("a reopened report counts from its last resolution", () => {
  assert.deepEqual(
    reportResolvedAt([
      { status: "investigating", date: at(0) },
      { status: "resolved", date: at(1) },
      { status: "identified", date: at(2) },
      { status: "resolved", date: at(4) },
    ]),
    at(4),
  );
});

test("an open report has no end", () => {
  assert.equal(
    reportResolvedAt([
      { status: "resolved", date: at(0) },
      { status: "monitoring", date: at(1) },
    ]),
    null,
  );
  assert.equal(reportResolvedAt([]), null);
});
