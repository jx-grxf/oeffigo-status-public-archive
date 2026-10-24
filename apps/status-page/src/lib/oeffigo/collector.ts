import { createClient } from "@libsql/client";

import { processAlerts } from "./alert-delivery";
import type { SignalReading } from "./alerts";
import { type Range, ranges } from "./availability";
import {
  applyRealtimeGaps,
  applyTraffic,
  expireSnapshot,
  newerReport,
  projectReport,
  type ServiceState,
  type Snapshot,
  type StatusData,
  services,
} from "./model";
import { probe } from "./probe";
import { readSentry } from "./sentry";
import { readRange, refreshSlots } from "./slots";
import {
  type FunctionVerdict,
  readRealtimeGaps,
  readTraffic,
  REGION_NAMES,
  SLOW_SECONDS,
} from "./traffic";

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
  const [api, website, report, traffic, sentry, gaps] = await Promise.all([
    probe("https://api.oeffigo.app/health", true),
    probe("https://oeffigo.app"),
    readReport(),
    readTraffic(Date.now()).catch(() => null),
    readSentry(Date.now()).catch(() => null),
    readRealtimeGaps().catch(() => null),
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
  const snapshot = applyRealtimeGaps(
    applyTraffic(
      projectReport(
        latestReport,
        state(api.ok, failures.api),
        state(website.ok, failures.website),
        now,
        api.ms,
      ),
      traffic,
    ),
    gaps,
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
    try {
      await refreshSlots(client, now);
    } catch {
      console.error("ÖffiGo availability slots could not be updated");
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
        extra: [
          ...trafficSignals(traffic),
          ...realtimeSignals(gaps),
          ...(sentry ? [sentry] : []),
        ],
        now,
      });
    } catch {
      console.error("ÖffiGo operator alerts could not be evaluated");
    }
  } finally {
    client.close();
  }
}
const functionLabel = new Map<string, string>(
  services.map((s) => [s.id, s.de]),
);

const secondsFormat = new Intl.NumberFormat("de-AT", {
  maximumFractionDigits: 1,
});

/** Zahlen für den Betreiber: wie viel Verkehr, wie viele Fehler oder langsame Antworten. */
function trafficDetail(v: FunctionVerdict) {
  if (v.slow) {
    const typical = v.slow.medianMs
      ? `, typisch ${Math.round(v.slow.medianMs)} ms`
      : "";
    return `${Math.round(v.slow.total)} Anfragen in 10 Min. auf ${v.slow.route}, davon ${Math.round(v.slow.slow)} langsamer als ${secondsFormat.format(SLOW_SECONDS)} s (${Math.round(v.slow.share * 100)} %)${typical}. Das gilt schon im zweiten Zeitraum hintereinander.`;
  }
  return `${Math.round(v.errors)} von ${Math.round(v.requests)} Anfragen in 10 Min. mit Fehler`;
}

/** Verkehrsurteile als Betreibersignale, mit einem Satz für eine mögliche Meldung. */
function trafficSignals(
  traffic: Awaited<ReturnType<typeof readTraffic>>,
): SignalReading[] {
  if (!traffic) return [];
  return Object.entries(traffic).map(([id, v]) => {
    const name = functionLabel.get(id) ?? id;
    const level =
      v.state === "down" ? "down" : v.state === "degraded" ? "degraded" : null;
    return {
      id: `traffic:${id}`,
      label: `Nutzerverkehr · ${name}`,
      level,
      detail: level ? trafficDetail(v) : undefined,
      draft: level ? draftFor(name, level) : undefined,
      // Schon von `hold` bestätigt; der Betreiber erfährt es gleichzeitig mit der Seite.
      confirm: 1,
    };
  });
}

/** Je Bundesland ein Signal; ohne Grafana keines, statt eines erfundenen „alles gut“. */
function realtimeSignals(gaps: string[] | null): SignalReading[] {
  if (!gaps) return [];
  return Object.entries(REGION_NAMES).map(([id, name]) => {
    const missing = gaps.includes(id);
    return {
      id: `realtime:${id}`,
      label: `Echtzeit ${name}`,
      level: missing ? "degraded" : null,
      detail: missing
        ? "Deutlich weniger Abfahrten mit Echtzeit als zur selben Zeit vor einer Woche"
        : undefined,
      draft: missing
        ? `${name}: Bei vielen Fahrten fehlen gerade Echtzeitdaten. Angezeigt wird der Fahrplan.`
        : undefined,
      confirm: 1,
    };
  });
}

function draftFor(name: string, level: "down" | "degraded") {
  return level === "down"
    ? `${name}: gerade nicht verfügbar. Wir sehen, dass Anfragen fehlschlagen, und arbeiten daran.`
    : `${name}: eingeschränkt. Ein Teil der Anfragen schlägt fehl oder dauert länger als sonst.`;
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
    warmHistories();
    setTimeout(tick, 60_000).unref();
  };
  void tick();
}
// The history of a range changes by one bucket at most per tick, but computing 90 days took
// 4 s on this host, and with a 15 s cache every switch of the range picker paid it again.
// A history is served at once while it is younger than HISTORY_STALE_MS and recomputed behind
// the response once it is older than its fresh window. The snapshot (one row) is always read.
const HISTORY_FRESH_MS: Record<Range, number> = {
  "24h": 30_000,
  "7d": 120_000,
  "30d": 300_000,
  "90d": 300_000,
};
const HISTORY_STALE_MS = 30 * 60_000;
const histories = new Map<
  Range,
  { at: number; history: StatusData["history"] }
>();
const historyLoads = new Map<Range, Promise<StatusData["history"]>>();

function loadHistory(range: Range): Promise<StatusData["history"]> {
  const pending = historyLoads.get(range);
  if (pending) return pending;
  const load = (async () => {
    const client = database();
    const now = Date.now();
    try {
      const history = await readRange(client, range, now);
      histories.set(range, { at: now, history });
      return history;
    } finally {
      client.close();
    }
  })().finally(() => historyLoads.delete(range));
  historyLoads.set(range, load);
  return load;
}

async function historyFor(range: Range): Promise<StatusData["history"]> {
  const hit = histories.get(range);
  const age = hit ? Date.now() - hit.at : Number.POSITIVE_INFINITY;
  if (hit && age < HISTORY_STALE_MS) {
    if (age >= HISTORY_FRESH_MS[range]) void loadHistory(range).catch(() => {});
    return hit.history;
  }
  return loadHistory(range);
}

/** Keeps every range warm so the picker never waits; called by the collector. */
export function warmHistories() {
  for (const range of ranges) void historyFor(range).catch(() => {});
}

let snapshotLoad: Promise<Snapshot> | null = null;
let snapshotCache: { at: number; snapshot: Snapshot } | null = null;

async function latestSnapshot(): Promise<Snapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < 5_000)
    return snapshotCache.snapshot;
  snapshotLoad ??= (async () => {
    const client = database();
    const now = Date.now();
    try {
      const latest = await client.execute(
        "SELECT payload FROM oeffigo_check ORDER BY checked_at DESC LIMIT 1",
      );
      const snapshot: Snapshot = latest.rows[0]
        ? JSON.parse(String(latest.rows[0].payload))
        : projectReport(null, "unknown", "unknown", now, null);
      snapshotCache = { at: now, snapshot };
      return snapshot;
    } finally {
      client.close();
    }
  })().finally(() => {
    snapshotLoad = null;
  });
  return snapshotLoad;
}

export async function readStatus(range: Range = "24h"): Promise<StatusData> {
  const [snapshot, history] = await Promise.all([
    latestSnapshot(),
    historyFor(range),
  ]);
  return { snapshot: expireSnapshot(snapshot), history };
}

/**
 * Für den Wächter von außen: Alter der jüngsten gespeicherten Messung. Steht
 * der Collector, merkt das sonst niemand, weil er selbst die Alarme schickt.
 */
export async function lastCheckAge(now = Date.now()): Promise<number> {
  const at = Date.parse((await latestSnapshot()).checkedAt);
  return Number.isFinite(at) ? Math.max(0, now - at) : Number.POSITIVE_INFINITY;
}
