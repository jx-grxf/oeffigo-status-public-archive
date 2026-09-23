import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";

import { backupConfig, backupKey, CompleteSqlDump } from "./backup.mjs";

function sink() {
  return new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
}

test("accepts a complete SQL transaction and rejects a truncated dump", async () => {
  const prefix = `PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n${"SELECT 1;\n".repeat(15)}`;
  await pipeline(
    Readable.from([prefix, "COMMIT;\n"]),
    new CompleteSqlDump(),
    sink(),
  );
  await assert.rejects(
    pipeline(Readable.from([prefix]), new CompleteSqlDump(), sink()),
    /did not end with COMMIT/,
  );
});

test("rejects a public dump target", () => {
  assert.throws(
    () => backupConfig({ LIBSQL_HOST: "example.com" }),
    /Railway private host/,
  );
});

test("uses UTC and a unique suffix in the encrypted object key", () => {
  assert.equal(
    backupKey(new Date("2026-09-23T02:17:00.000Z"), "fixed"),
    "libsql/2026/09/23/2026-09-23T02-17-00.000Z-fixed.sql.gz.age",
  );
});
