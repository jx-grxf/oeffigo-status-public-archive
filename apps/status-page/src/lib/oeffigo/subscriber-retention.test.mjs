import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";

import { pruneSubscribers } from "./subscriber-retention.ts";

const DAY_S = 86_400;
const now = Date.UTC(2026, 9, 28, 12);
const nowS = now / 1000;

async function fixture() {
  const client = createClient({ url: ":memory:" });
  await client.batch([
    "CREATE TABLE page_subscriber (id INTEGER PRIMARY KEY, email TEXT, source TEXT NOT NULL DEFAULT 'self_signup', accepted_at INTEGER, expires_at INTEGER, unsubscribed_at INTEGER)",
    "CREATE TABLE page_subscriber_to_page_component (page_subscriber_id INTEGER, page_component_id INTEGER)",
  ]);
  const rows = [
    // id, email, source, accepted, expires, unsubscribed
    [1, "active@x", "self_signup", nowS - 90 * DAY_S, null, null],
    [2, "left-long-ago@x", "self_signup", nowS - 90 * DAY_S, null, nowS - 31 * DAY_S],
    [3, "left-recently@x", "self_signup", nowS - 90 * DAY_S, null, nowS - 5 * DAY_S],
    [4, "never-confirmed@x", "self_signup", null, nowS - 8 * DAY_S, null],
    [5, "pending@x", "self_signup", null, nowS + DAY_S, null],
    [6, "added-by-operator@x", "vendor", null, nowS - 30 * DAY_S, null],
  ];
  for (const args of rows) {
    await client.execute({
      sql: "INSERT INTO page_subscriber (id, email, source, accepted_at, expires_at, unsubscribed_at) VALUES (?, ?, ?, ?, ?, ?)",
      args,
    });
    await client.execute({
      sql: "INSERT INTO page_subscriber_to_page_component VALUES (?, 1)",
      args: [args[0]],
    });
  }
  return client;
}

test("cancelled and never confirmed subscriptions are deleted with their component links", async () => {
  const client = await fixture();
  assert.equal(await pruneSubscribers(client, now), 2);
  const left = await client.execute("SELECT id FROM page_subscriber ORDER BY id");
  assert.deepEqual(left.rows.map((r) => Number(r.id)), [1, 3, 5, 6]);
  const links = await client.execute(
    "SELECT page_subscriber_id AS id FROM page_subscriber_to_page_component ORDER BY 1",
  );
  assert.deepEqual(links.rows.map((r) => Number(r.id)), [1, 3, 5, 6]);
  assert.equal(await pruneSubscribers(client, now), 0);
});
