import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../../../messages/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, dir), "utf8"));
const source = read("en.json");

// The next-intl extractor blanks translations when message keys are rehashed.
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  test(`${file} translates every source message`, () => {
    const catalog = read(file);
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(source).sort());
    const empty = Object.keys(catalog).filter((key) => !catalog[key].trim());
    assert.deepEqual(empty, []);
  });
}
