import { createClient } from "@libsql/client";
import { expect } from "@std/expect";
import { test } from "@std/testing/bdd";
import { drizzle } from "drizzle-orm/libsql";

import { claimMailCooldown } from "./mail-cooldown";

test("mail cooldown claims atomically, normalizes email and expires", async () => {
  const client = createClient({ url: "file::memory:" });
  const store = drizzle(client);
  try {
    await client.execute(
      "CREATE TABLE verification_token (identifier TEXT NOT NULL, token TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(identifier, token))",
    );
    const now = new Date();
    const attempts = await Promise.allSettled([
      claimMailCooldown("subscribe", " Person@Example.com ", {
        db: store,
        now,
      }),
      claimMailCooldown("subscribe", "person@example.com", { db: store, now }),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      claimMailCooldown("subscribe", "person@example.com", {
        db: store,
        now: new Date(now.getTime() + 59_999),
      }),
    ).rejects.toThrow("eine Minute");
    await claimMailCooldown("subscribe", "person@example.com", {
      db: store,
      now: new Date(now.getTime() + 60_000),
    });
    await claimMailCooldown("login", "person@example.com", { db: store, now });
    const rows = await client.execute(
      "SELECT identifier FROM verification_token",
    );
    expect(rows.rows).toHaveLength(2);
    expect(JSON.stringify(rows.rows)).not.toContain("person@example.com");
  } finally {
    client.close();
  }
});
