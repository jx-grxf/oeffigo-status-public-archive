import { createHash, timingSafeEqual } from "node:crypto";

import { and, db, eq, isNull, schema } from "@openstatus/db";

import { isAllowedOwner } from "./owner";

/**
 * Second way into the tRPC surface: a service token for operations tooling,
 * so status reports, maintenances and settings can be managed without the
 * browser. The token only ever resolves to the configured owner, and callers
 * authenticated this way are logged as a system actor, never as the person.
 */

const HEADER = "x-oeffigo-ops";
/** Anything shorter is a password, not a token, and is ignored outright. */
const MIN_LENGTH = 32;
/** Guessing budget per process: a real client never spends it. */
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 60_000;

let failures = { since: 0, count: 0 };

function guessingTooMuch(now: number) {
  if (now - failures.since > FAILURE_WINDOW_MS)
    failures = { since: now, count: 0 };
  return failures.count >= FAILURE_LIMIT;
}

function countFailure(now: number) {
  if (now - failures.since > FAILURE_WINDOW_MS)
    failures = { since: now, count: 0 };
  failures.count += 1;
}

export type OpsSession = { user: { id: string; email: string } };

function presentedToken(request: Request) {
  const value = request.headers.get(HEADER)?.trim();
  return value ? value : null;
}

/** Hashing both sides keeps the comparison constant time and constant length. */
function tokenMatches(presented: string) {
  const expected = process.env.OPS_TOKEN?.trim();
  if (!expected || expected.length < MIN_LENGTH) return false;
  return timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

async function findOwner(): Promise<OpsSession["user"] | null> {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !isAllowedOwner(email)) return null;
  const row = await db.query.user.findFirst({
    where: and(eq(schema.user.email, email), isNull(schema.user.deletedAt)),
  });
  if (!row?.email) return null;
  return { id: String(row.id), email: row.email };
}

/**
 * Returns the owner session a valid service token stands for, or null for
 * every other request — including a wrong token, so the caller falls through
 * to the normal session check and ends up with a plain 401.
 */
export async function opsSession(
  request: Request,
  lookup: () => Promise<OpsSession["user"] | null> = findOwner,
): Promise<OpsSession | null> {
  const presented = presentedToken(request);
  if (!presented) return null;
  const now = Date.now();
  if (guessingTooMuch(now)) return null;
  if (!tokenMatches(presented)) {
    countFailure(now);
    return null;
  }
  const user = await lookup();
  if (!user) {
    console.warn("ÖffiGo ops token accepted but no owner account resolved");
    return null;
  }
  return { user };
}
