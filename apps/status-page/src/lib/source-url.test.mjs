import assert from "node:assert/strict";

import { sourceUrl } from "./source-url.ts";

Deno.test("source link identifies the exact deployed commit", () => {
  const sha = "a".repeat(40);
  assert.equal(
    sourceUrl("https://github.com/example/status-source", sha),
    `https://github.com/example/status-source/tree/source-${sha}`,
  );
  assert.equal(
    sourceUrl("https://github.com/example/status-source", "main"),
    null,
  );
  assert.equal(sourceUrl("https://evil.example/source", sha), null);
});
