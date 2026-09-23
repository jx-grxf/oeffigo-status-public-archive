import { createClient } from "@libsql/client";

import { processAlerts } from "./alert-delivery";
import {
  buildHistory,
  expireSnapshot,
  historyWindowStart,
  newerReport,
  projectReport,
  type ServiceState,
  type Snapshot,
  type StatusData,
} from "./model";
import { probe } from "./probe";

function database() {
  return createClient({
    url: process.env.DATABASE_URL ?? "",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
}
async function readReport() {
  try {
    const response = await fetch("https://api.oeffigo.app/v1/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "OeffiGo-Status/1.0" },
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.length <= 256_000 ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
let started = false;
let failures = { api: 0, website: 0 };
let staleChecks = 0;
let databaseFailures = 0;
// Cloudflare serves /v1/status with stale-while-revalidate, so a later read can be older.
let latestReport: unknown = null;
export async function collect() {
  const [api, website, report] = await Promise.all([
    probe("https://api.oeffigo.app/health", true),
    probe("https://oeffigo.app"),
    readReport(),
  ]);
  for (const [name, result] of [
    ["health", api],
    ["website", website],
  ] as const) {
    if (!result.ok)
      console.warn(
        JSON.stringify({
          event: "oeffigo_probe_failed",
          probe: name,
          status: result.status,
          failure: result.failure,
          elapsedMs: result.ms,
        }),
      );
  }
  const now = Date.now();
  latestReport = newerReport(latestReport, report, now);
  failures = {
    api: api.ok ? 0 : failures.api + 1,
    website: website.ok ? 0 : failures.website + 1,
  };
  const state = (ok: boolean, count: number): ServiceState =>
    ok ? "operational" : count >= 3 ? "down" : "unknown";
  const snapshot = projectReport(
    latestReport,
    state(api.ok, failures.api),
    state(website.ok, failures.website),
    now,
    api.ms,
  );
  staleChecks = snapshot.stale ? staleChecks + 1 : 0;
  const client = database();
  try {
    try {
      await client.execute({
        sql: "INSERT INTO oeffigo_check(checked_at,payload,api_state) VALUES (?,?,?)",
        args: [snapshot.checkedAt, JSON.stringify(snapshot), snapshot.api],
      });
      await client.execute({
        sql: "DELETE FROM oeffigo_check WHERE checked_at < ?",
        args: [new Date(now - 31 * 86400_000).toISOString()],
      });
      databaseFailures = 0;
    } catch {
      databaseFailures += 1;
      console.error("ÖffiGo status sample could not be persisted");
    }
    // Alerts still run when the sample could not be stored; that is one of the signals.
    try {
      await processAlerts(client, {
        healthFailures: failures.api,
        websiteFailures: failures.website,
        databaseFailures,
        reportFresh: !snapshot.stale,
        staleChecks,
        report: latestReport,
        now,
      });
    } catch {
      console.error("ÖffiGo operator alerts could not be evaluated");
    }
  } finally {
    client.close();
  }
}
export function startCollector() {
  if (started || process.env.OEFFIGO_COLLECTOR !== "true") return;
  started = true;
  const tick = async () => {
    try {
      await collect();
    } catch {
      console.error("ÖffiGo status check failed");
    }
    setTimeout(tick, 60_000).unref();
  };
  void tick();
}
let cached: { at: number; data: StatusData } | undefined;
let inFlight: Promise<StatusData> | undefined;
export async function readStatus(): Promise<StatusData> {
  if (cached && Date.now() - cached.at < 15_000)
    return { ...cached.data, snapshot: expireSnapshot(cached.data.snapshot) };
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const client = database();
    const now = Date.now();
    const windowStart = historyWindowStart(now);
    try {
      const latest = await client.execute(
        "SELECT payload FROM oeffigo_check ORDER BY checked_at DESC LIMIT 1",
      );
      const snapshot: Snapshot = latest.rows[0]
        ? JSON.parse(String(latest.rows[0].payload))
        : projectReport(null, "unknown", "unknown", now, null);
      const counts = await client.execute({
        // json_each has its own `id` column, so group by position, not alias.
        sql: `SELECT (CAST(strftime('%s', c.checked_at) AS INTEGER) - CAST(? AS INTEGER)) / 1800 AS bucket,
                json_extract(s.value, '$.id') AS service,
                json_extract(s.value, '$.state') AS state,
                COUNT(*) AS n
              FROM oeffigo_check AS c, json_each(c.payload, '$.services') AS s
              WHERE c.checked_at >= ?
              GROUP BY 1, 2, 3`,
        args: [windowStart / 1000, new Date(windowStart).toISOString()],
      });
      const data: StatusData = {
        snapshot: expireSnapshot(snapshot, now),
        history: buildHistory(
          counts.rows.map((row) => ({
            bucket: Number(row.bucket),
            id: String(row.service),
            state: String(row.state),
            n: Number(row.n),
          })),
          now,
        ),
      };
      cached = { at: now, data };
      return data;
    } finally {
      client.close();
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}
