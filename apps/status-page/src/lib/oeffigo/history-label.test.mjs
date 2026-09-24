import assert from "node:assert/strict";
import { test } from "node:test";

import { historyBucketLabel } from "./model.ts";

test("history labels include a real Vienna time range and the measured state", () => {
  const bucket = {
    start: "2026-09-23T12:00:00.000Z",
    checks: 28,
    state: "degraded",
    counts: { degraded: 28 },
  };
  const german = historyBucketLabel("de", 12, bucket);
  const english = historyBucketLabel("en", 12, bucket);
  assert.match(german, /Halbstunde 13 von 48/);
  assert.match(german, /14:00.*14:30.*Eingeschränkt/);
  assert.match(english, /Half hour 13 of 48/);
  assert.match(english, /14:00.*14:30.*Degraded/);
});
