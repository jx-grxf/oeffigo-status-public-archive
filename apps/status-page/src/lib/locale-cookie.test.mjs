import assert from "node:assert/strict";
import { test } from "node:test";

import { prefersEnglish } from "./locale-cookie.ts";

test("an English browser on a first visit gets English", () => {
  assert.equal(prefersEnglish("en-US,en;q=0.9", false), true);
  assert.equal(prefersEnglish("fr-FR,fr;q=0.9,en;q=0.8", false), true);
});

test("German browsers, crawlers and a chosen language stay put", () => {
  assert.equal(prefersEnglish("de-AT,de;q=0.9,en;q=0.8", false), false);
  assert.equal(prefersEnglish(null, false), false);
  assert.equal(prefersEnglish("*", false), false);
  assert.equal(prefersEnglish("en-US", true), false);
});
