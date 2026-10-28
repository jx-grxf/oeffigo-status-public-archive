import type { Client } from "@libsql/client";

// The privacy policy on oeffigo.app/datenschutz promises these periods.
export const UNSUBSCRIBED_RETENTION_DAYS = 30;
export const UNCONFIRMED_RETENTION_DAYS = 7;
const DAY_S = 86_400;

const expired = `
  (unsubscribed_at IS NOT NULL AND unsubscribed_at < ?)
  OR (accepted_at IS NULL AND source = 'self_signup' AND expires_at IS NOT NULL AND expires_at < ?)`;

/** Deletes subscriptions that were cancelled or never confirmed. Returns the number removed. */
export async function pruneSubscribers(client: Client, now = Date.now()) {
  const nowS = Math.floor(now / 1000);
  const args = [
    nowS - UNSUBSCRIBED_RETENTION_DAYS * DAY_S,
    nowS - UNCONFIRMED_RETENTION_DAYS * DAY_S,
  ];
  // Foreign-key cascades depend on a per-connection pragma, so the links go first.
  const [, removed] = await client.batch(
    [
      {
        sql: `DELETE FROM page_subscriber_to_page_component WHERE page_subscriber_id IN (SELECT id FROM page_subscriber WHERE ${expired})`,
        args,
      },
      { sql: `DELETE FROM page_subscriber WHERE ${expired}`, args },
    ],
    "write",
  );
  return removed.rowsAffected;
}
