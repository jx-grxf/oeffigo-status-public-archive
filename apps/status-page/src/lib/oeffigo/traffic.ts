import { REGION_NAMES } from "./groups";
import type { ServiceState } from "./model";
import { prom } from "./outside";

export { REGION_NAMES };

/**
 * Echter Verkehr als zweite Meinung neben dem Selbstbericht des Servers: die
 * Antworten, die Fahrgäste in den letzten zehn Minuten bekommen haben, aus den
 * BFF-Kennzahlen in Grafana. Das Signal kann eine Funktion nur verschlechtern,
 * nie grün machen; bei wenig Verkehr schweigt es, dann tragen die Prüfungen
 * von außen und der Bericht des Servers.
 */
export const functionRoutes: Record<string, readonly string[]> = {
  departures: [
    "/v2/stops/:id/departures",
    "/v2/stops/:id/arrivals",
    "/v2/stops/:id/info",
    "/v1/hci/station-board",
  ],
  planning: [
    "/v2/trips",
    "/v2/journeys/:ref",
    "/v2/journeys/batch",
    "/v2/footpath",
    "/v2/stops",
    "/v1/hci/trip-search",
    "/v1/hci/journey-details",
    "/v1/hci/loc-match",
  ],
  map: ["/v2/stops/nearby", "/v1/hci/loc-geo-pos"],
  positions: ["/v2/vehicles", "/v1/hci/journey-geo-pos"],
  alerts: ["/v2/disruptions", "/v1/hci/him-search"],
  estimates: ["/v2/predictions/batch"],
  reliability: ["/v2/history"],
};

export const ERROR_CLASSES: ReadonlySet<string> = new Set(["5xx", "stalled"]);

/** Weniger Anfragen im Fenster: kein Urteil über Fehler. */
export const MIN_REQUESTS = 10;
export const DEGRADED = { errors: 3, ratio: 0.05 } as const;
/** Ein öffentlicher Ausfall braucht mehr Verkehr und hält länger an als eine Einschränkung. */
export const DOWN = { errors: 5, ratio: 0.25, requests: 20 } as const;
/**
 * Langsam heißt: länger als diese Grenze. Das Histogramm des Servers hat keinen
 * Bucket bei 1,5 s (Grenzen: 1 s, 2,5 s), also gilt die nächste Grenze darüber.
 */
export const SLOW_LE = "2.5";
export const SLOW_SECONDS = 2.5;
/** Echte Anfragen je Route und 10-Minuten-Fenster, bevor Langsamkeit zählt. */
export const MIN_ROUTE_REQUESTS = 30;
/** Langsame Anfragen im Fenster, absolut und als Anteil. */
export const MIN_SLOW = 5;
export const SLOW_SHARE = 0.15;
/** Die Wochen-Basis zählt erst, wenn mindestens so viele Stunden Messwerte vorliegen. */
export const BASELINE_MIN_HOURS = 72;
/** Anfragen einer Route in 7 Tagen, damit ihr Anteil langsamer Antworten etwas aussagt. */
const BASELINE_MIN_REQUESTS = 300;
/** Aufeinanderfolgende Minuten, bis ein Urteil gilt und bis es wieder weggeht. */
export const ENTER = { degraded: 2, down: 4 } as const;
export const LEAVE = 3;
/** Ohne ausreichend Verkehr fällt ein gehaltenes Urteil nach dieser Zeit auf „ohne Befund“. */
export const FROZEN_MS = 15 * 60_000;

export type WindowReading = { total: number; slow: number };
export type RouteReading = {
  requests: number;
  errors: number;
  /** Letzte zehn Minuten und die zehn davor. */
  current: WindowReading;
  previous: WindowReading;
  medianMs: number | null;
  /** Üblicher Anteil langsamer Anfragen der Woche; null ohne tragfähige Basis. */
  baselineSlowShare: number | null;
};
export type SlowReading = {
  route: string;
  slow: number;
  total: number;
  share: number;
  medianMs: number | null;
};
export type FunctionVerdict = {
  state: ServiceState | null;
  /** Zu wenig Verkehr für ein Urteil: weder Beleg für ein Problem noch für Ruhe. */
  insufficient?: boolean;
  requests: number;
  errors: number;
  slow?: SlowReading;
};

/** Genug echte Anfragen, genug langsame darunter und mehr als sonst. */
export function isSlowWindow(
  w: WindowReading,
  baselineShare: number | null,
): boolean {
  if (w.total < MIN_ROUTE_REQUESTS || w.slow < MIN_SLOW) return false;
  const share = w.slow / w.total;
  const needed = Math.max(
    SLOW_SHARE,
    baselineShare === null ? 0 : 2 * baselineShare,
  );
  return share >= needed;
}

export function judgeFunction(
  routes: Record<string, RouteReading>,
  ids: readonly string[],
): FunctionVerdict {
  let requests = 0;
  let errors = 0;
  let slow: SlowReading | undefined;
  for (const id of ids) {
    const r = routes[id];
    if (!r) continue;
    requests += r.requests;
    errors += r.errors;
    if (
      isSlowWindow(r.current, r.baselineSlowShare) &&
      isSlowWindow(r.previous, r.baselineSlowShare)
    ) {
      const share = r.current.slow / r.current.total;
      if (!slow || share > slow.share)
        slow = {
          route: id,
          slow: r.current.slow,
          total: r.current.total,
          share,
          medianMs: r.medianMs,
        };
    }
  }
  if (requests < MIN_REQUESTS && !slow)
    return { state: null, insufficient: true, requests, errors };
  const ratio = errors / requests;
  const state: ServiceState | null =
    requests >= DOWN.requests && errors >= DOWN.errors && ratio >= DOWN.ratio
      ? "down"
      : (requests >= MIN_REQUESTS &&
            errors >= DEGRADED.errors &&
            ratio >= DEGRADED.ratio) ||
          slow
        ? "degraded"
        : null;
  return { state, requests, errors, slow };
}

type Memory = {
  held: ServiceState | null;
  streak: number;
  candidate: ServiceState | null;
  /** Seit wann es keinen ausreichenden Verkehr gibt (ms); nur während der Stille gesetzt. */
  quietSince?: number;
};

/**
 * Ein Urteil gilt erst nach ENTER gleichen Minuten und geht nach LEAVE ruhigen.
 * `insufficient` friert den Zustand ein: Eine stille Nacht beendet keinen
 * Ausfall und zählt nicht für einen neuen. Nach FROZEN_MS Stille gibt es aber
 * keinen Beleg mehr, dann fällt das Urteil auf „ohne Befund“ zurück; ein
 * Zustand, der nicht mehr gemessen wird, bleibt nicht stundenlang stehen.
 */
export function hold(
  memory: Memory | undefined,
  verdict: ServiceState | null,
  insufficient = false,
  now = Date.now(),
): Memory {
  const m = memory ?? { held: null, streak: 0, candidate: null };
  if (insufficient) {
    const quietSince = m.quietSince ?? now;
    if (m.held !== null && now - quietSince >= FROZEN_MS)
      return { held: null, streak: 0, candidate: null, quietSince };
    return { ...m, quietSince };
  }
  const settled = {
    held: m.held,
    streak: m.streak,
    candidate: m.candidate,
  };
  if (verdict === settled.held)
    return { ...settled, streak: 0, candidate: null };
  const streak = verdict === settled.candidate ? settled.streak + 1 : 1;
  const needed =
    verdict === null ? LEAVE : verdict === "down" ? ENTER.down : ENTER.degraded;
  if (streak >= needed) return { held: verdict, streak: 0, candidate: null };
  return { held: settled.held, streak, candidate: verdict };
}

const memory = new Map<string, Memory>();
let baseline: { at: number; byRoute: Map<string, number> } | null = null;
const BASELINE_MS = 3_600_000;

const job = 'job="oeffigo-bff"';
const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type Prom = Awaited<ReturnType<typeof prom>>;

/** Anfragen gesamt und davon langsame je Route aus einer Histogramm-Abfrage mit `le`. */
function slowByRoute(rows: Prom) {
  const by = new Map<string, { total: number; fast: number }>();
  for (const r of rows ?? []) {
    const route = r.metric.route;
    const n = num(r.value?.[1]);
    if (!route || n === null) continue;
    const e = by.get(route) ?? { total: 0, fast: 0 };
    if (r.metric.le === "+Inf") e.total = n;
    else if (r.metric.le === SLOW_LE) e.fast = n;
    by.set(route, e);
  }
  return new Map(
    [...by].map(([route, e]) => [
      route,
      { total: e.total, slow: Math.max(0, e.total - e.fast) },
    ]),
  );
}

// `[+]` statt `\+`: Backslashes sind in PromQL-Zeichenketten eigene Escapes.
const slowQuery = (range: string, offset = "") =>
  `sum by (route, le) (increase(oeffigo_http_duration_seconds_bucket{${job}, le=~"${SLOW_LE}|[+]Inf"}[${range}]${offset}))`;

/** Üblicher Anteil langsamer Anfragen je Route; leer, solange weniger als drei Tage Daten da sind. */
async function readBaseline(now: number) {
  if (baseline && now - baseline.at < BASELINE_MS) return baseline.byRoute;
  const [rows, coverage] = await Promise.all([
    prom("query", { query: slowQuery("7d") }),
    prom("query", {
      query: `count_over_time(sum(oeffigo_http_requests_total{${job}})[7d:1h])`,
    }),
  ]);
  if (!rows || !coverage) {
    // Ein Fehlschlag wird nicht jede Minute wiederholt, sondern wie ein Treffer zwischengespeichert.
    baseline = {
      at: now,
      byRoute: baseline?.byRoute ?? new Map<string, number>(),
    };
    return baseline.byRoute;
  }
  const byRoute = new Map<string, number>();
  const hours = num(coverage[0]?.value?.[1]) ?? 0;
  if (hours >= BASELINE_MIN_HOURS)
    for (const [route, w] of slowByRoute(rows))
      if (w.total >= BASELINE_MIN_REQUESTS)
        byRoute.set(route, w.slow / w.total);
  baseline = { at: now, byRoute };
  return byRoute;
}

/** `null`, wenn Grafana nicht antwortet: dann bleibt alles beim Bericht des Servers. */
export async function readTraffic(
  now: number,
): Promise<Record<string, FunctionVerdict> | null> {
  const [counts, histNow, histBefore, median, base] = await Promise.all([
    prom("query", {
      query: `sum by (route, status_class) (increase(oeffigo_http_requests_total{${job}, status_class!="aborted"}[10m]))`,
    }),
    prom("query", { query: slowQuery("10m") }),
    prom("query", { query: slowQuery("10m", " offset 10m") }),
    prom("query", {
      query: `histogram_quantile(0.5, sum by (le, route) (rate(oeffigo_http_duration_seconds_bucket{${job}}[10m])))`,
    }),
    readBaseline(now),
  ]);
  if (!counts) return null;
  const current = slowByRoute(histNow);
  const previous = slowByRoute(histBefore);
  const none = { total: 0, slow: 0 };
  const routes: Record<string, RouteReading> = {};
  for (const r of counts) {
    const route = r.metric.route;
    if (!route) continue;
    const n = num(r.value?.[1]) ?? 0;
    const entry = (routes[route] ??= {
      requests: 0,
      errors: 0,
      current: current.get(route) ?? none,
      previous: previous.get(route) ?? none,
      medianMs: null,
      baselineSlowShare: base.get(route) ?? null,
    });
    entry.requests += n;
    // „stalled“: Der BFF hat 10 s lang nicht geantwortet, der Aufrufer gab auf (27.10.).
    if (ERROR_CLASSES.has(r.metric.status_class ?? "")) entry.errors += n;
  }
  for (const r of median ?? []) {
    const v = num(r.value?.[1]);
    const entry = r.metric.route ? routes[r.metric.route] : undefined;
    if (entry && v !== null) entry.medianMs = v * 1000;
  }
  const verdicts: Record<string, FunctionVerdict> = {};
  for (const [id, ids] of Object.entries(functionRoutes)) {
    const verdict = judgeFunction(routes, ids);
    const held = hold(memory.get(id), verdict.state, verdict.insufficient, now);
    memory.set(id, held);
    verdicts[id] = { ...verdict, state: held.held };
  }
  return verdicts;
}

/** Mindestens so viele Abfahrten in 30 Min., sonst sagt der Anteil nichts. */
export const MIN_DEPARTURES = 30;
/** Unter diesem Anteil des Üblichen fehlt Echtzeit. */
export const REALTIME_DROP = 0.5;
/** Ein Bundesland, das sonst kaum Echtzeit hat, kann nicht einbrechen. */
export const MIN_BASELINE_SHARE = 0.3;

export type ShareReading = {
  now: number;
  total: number;
  baseline: number | null;
};

export function judgeRealtime(r: ShareReading): boolean {
  return (
    r.total >= MIN_DEPARTURES &&
    r.baseline !== null &&
    r.baseline >= MIN_BASELINE_SHARE &&
    r.now < REALTIME_DROP * r.baseline
  );
}

const regionMemory = new Map<string, Memory>();

function shares(rows: Awaited<ReturnType<typeof prom>>) {
  const by = new Map<string, { yes: number; total: number }>();
  for (const r of rows ?? []) {
    const region = r.metric.region;
    if (!region || !(region in REGION_NAMES)) continue;
    const n = num(r.value?.[1]) ?? 0;
    const e = by.get(region) ?? { yes: 0, total: 0 };
    e.total += n;
    if (r.metric.realtime === "yes") e.yes += n;
    by.set(region, e);
  }
  return by;
}

/**
 * Bundesländer, in denen gerade deutlich weniger Abfahrten Echtzeit haben als
 * zur selben Uhrzeit vor einer Woche (ersatzweise gestern). `null` ohne Grafana.
 */
let lastGaps: { at: number; gaps: string[] } | null = null;
const GAPS_EVERY_MS = 5 * 60_000;

export async function readRealtimeGaps(
  now = Date.now(),
): Promise<string[] | null> {
  if (lastGaps && now - lastGaps.at < GAPS_EVERY_MS) return lastGaps.gaps;
  const q = (offset: string) =>
    prom("query", {
      query: `sum by (region, realtime) (increase(oeffigo_board_departures_total{${job}}[30m]${offset}))`,
    });
  const [current, week] = await Promise.all([q(""), q(" offset 7d")]);
  if (!current) return null;
  const present = shares(current);
  const lastWeek = shares(week);
  const thin = (r: string) => (lastWeek.get(r)?.total ?? 0) < MIN_DEPARTURES;
  // Gestern nur, wo die Vorwoche zu dünn ist. Nach einer Zeitumstellung liegt
  // `offset 7d` eine Woche lang eine Stunde daneben; das bleibt in Kauf genommen.
  const yesterday = Object.keys(REGION_NAMES).some(thin)
    ? shares(await q(" offset 1d"))
    : new Map<string, { yes: number; total: number }>();
  const gaps: string[] = [];
  for (const region of Object.keys(REGION_NAMES)) {
    const c = present.get(region);
    const base = thin(region) ? yesterday.get(region) : lastWeek.get(region);
    const reading: ShareReading = {
      now: c && c.total > 0 ? c.yes / c.total : 0,
      total: c?.total ?? 0,
      baseline:
        base && base.total >= MIN_DEPARTURES ? base.yes / base.total : null,
    };
    // Ohne genug Abfahrten oder Vergleich gibt es kein Urteil, auch kein „wieder gut“.
    const insufficient =
      reading.total < MIN_DEPARTURES || reading.baseline === null;
    const held = hold(
      regionMemory.get(region),
      judgeRealtime(reading) ? "degraded" : null,
      insufficient,
      now,
    );
    regionMemory.set(region, held);
    if (held.held) gaps.push(region);
  }
  lastGaps = { at: now, gaps };
  return gaps;
}
