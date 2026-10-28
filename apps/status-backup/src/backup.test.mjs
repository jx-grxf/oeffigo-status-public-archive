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
    /private host/,
  );
});

test("accepts a Docker service name as private host", () => {
  assert.match(backupConfig({
    LIBSQL_HOST: "libsql",
    R2_ACCOUNT_ID: "1349b9bcf830550abff69b2fd71e3b32",
    AGE_RECIPIENT: "age1hwtkxyeaa9us4r2m8n4v3xcgzdh6vrph4cw2dqaqukvjk3tzmp3qnkaqsx",
    R2_BUCKET: "b",
    R2_ACCESS_KEY_ID: "k",
    R2_SECRET_ACCESS_KEY: "s",
  }).url, /^http:\/\/libsql:8080\//);
});

test("uses UTC and a unique suffix in the encrypted object key", () => {
  assert.equal(
    backupKey(new Date("2026-09-23T02:17:00.000Z"), "fixed"),
    "libsql/2026/09/23/2026-09-23T02-17-00.000Z-fixed.sql.gz.age",
  );
});
