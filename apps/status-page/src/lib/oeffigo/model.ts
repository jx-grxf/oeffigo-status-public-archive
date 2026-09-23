import { z } from "zod";

export const stateSchema = z.enum([
  "operational",
  "degraded",
  "down",
  "unknown",
  "paused",
]);
export type ServiceState = z.infer<typeof stateSchema>;
/**
 * Die acht Funktionen dieser Seite.
 *
 * Der Server spiegelt diese Liste (ohne „Website", über die er nichts bezeugen
 * kann) in `server/src/status/public-services.ts` im Repo `Routiq` — die
 * Index-Seite auf api.oeffigo.app zeigt seit 2026-09-17 dieselben Funktionen
 * statt eigener Zeilen. Wer hier eine Funktion oder eine `required`-Liste
 * ändert, ändert sie dort mit, sonst behaupten zwei öffentliche Oberflächen
 * Verschiedenes über denselben Server.
 */
export const services = [
  {
    id: "departures",
    componentId: 1,
    de: "Abfahrten",
    en: "Departures",
    description: "Abfahrtszeiten und Echtzeit an deiner Haltestelle.",
    descriptionEn: "Departure times and real-time information at your stop.",
    required: ["api", "api_router"],
  },
  {
    id: "planning",
    componentId: 2,
    de: "Routenplanung",
    en: "Journey planning",
    description: "Verbindungen, Umstiege und Reisezeiten.",
    descriptionEn: "Connections, transfers and journey times.",
    required: ["api", "api_router"],
  },
  {
    id: "map",
    componentId: 3,
    de: "Karte",
    en: "Map",
    description: "Haltestellen und Verbindungen in deiner Umgebung.",
    descriptionEn: "Stops and connections around you.",
    required: ["api", "api_router"],
  },
  {
    id: "positions",
    componentId: 8,
    de: "Fahrzeugpositionen",
    en: "Vehicle positions",
    description: "Fahrzeuge, die live auf der Karte mitfahren.",
    descriptionEn: "Vehicles moving live on the map.",
    // Eigene Zeile statt eines Zustands an der Karte: ohne Fahrzeuge tun
    // Haltestellen, Suche und Umgebung unverändert, was sie sollen. Die
    // Komponente `vehicle_positions` meldet `paused`, wenn sie ruht.
    required: ["api", "vehicle_positions"],
  },
  {
    id: "alerts",
    componentId: 4,
    de: "Verkehrsmeldungen",
    en: "Travel alerts",
    description: "Informationen zu Störungen und Änderungen im Verkehr.",
    descriptionEn: "Information about disruptions and service changes.",
    // `disruption_search` gehört dazu, seit die landesweite Suche abschaltbar ist
    // (2026-09-17): ohne sie ist die Meldungsliste Wien-only, und eine Zeile, die
    // dann „Verfügbar" sagt, behauptet eine Abdeckung, die es nicht gibt. Der
    // Server führt dieselbe Liste in `server/src/status/public-services.ts`.
    required: ["api", "api_router", "disruption_search"],
  },
  {
    id: "estimates",
    componentId: 5,
    de: "Live-Prognosen",
    en: "Live predictions",
    description:
      "Unsere Prognosen – dort, wo genügend aktuelle Daten vorliegen.",
    descriptionEn: "Our predictions, where enough current data is available.",
    required: ["api", "predictions"],
  },
  {
    id: "reliability",
    componentId: 6,
    de: "Pünktlichkeitsdaten",
    en: "Reliability data",
    description: "Ausgewertete Ankünfte und Abfahrten im Rückblick.",
    descriptionEn: "Recorded arrivals and departures over time.",
    required: ["api", "database", "official_history"],
  },
  {
    id: "website",
    componentId: 7,
    de: "Website",
    en: "Website",
    description: "oeffigo.app und die Informationen rund um die App.",
    descriptionEn: "oeffigo.app and information about the app.",
    required: [],
  },
] as const;

const componentSchema = z.object({ id: z.string(), status: stateSchema });
export const reportSchema = z.object({
  generatedAt: z.iso.datetime(),
  components: z.array(componentSchema),
  predictionDelivery: z
    .object({
      state: z.enum(["disabled", "idle", "healthy", "degraded"]),
      evidenceSource: z.string(),
      reason: z.string().optional(),
    })
    .optional(),
});
/** Why a neutral reading is neutral; never attached to a confirmed state. */
export type ServiceNote = "no_demand" | "sparse_data" | "in_development";
export type ServiceReading = {
  id: string;
  state: ServiceState;
  note?: ServiceNote;
};
export type Snapshot = {
  checkedAt: string;
  generatedAt: string | null;
  stale: boolean;
  api: ServiceState;
  website: ServiceState;
  latencyMs: number | null;
  services: ServiceReading[];
  viennaRealtime: ServiceState;
};
export const MAX_AGE_MS = 180_000;
const rank: Record<ServiceState, number> = {
  operational: 0,
  paused: 1,
  unknown: 2,
  degraded: 3,
  down: 4,
};
export function worst(states: ServiceState[]): ServiceState {
  return states.reduce<ServiceState>(
    (a, b) => (rank[b] > rank[a] ? b : a),
    "operational",
  );
}
export function projectReport(
  raw: unknown,
  api: ServiceState,
  website: ServiceState,
  now: number,
  latencyMs: number | null,
): Snapshot {
  const result = reportSchema.safeParse(raw);
  const report = result.success ? result.data : null;
  const generated = report ? Date.parse(report.generatedAt) : NaN;
  const stale =
    !Number.isFinite(generated) ||
    now - generated > MAX_AGE_MS ||
    generated > now + 30_000;
  const components = new Map(
    report?.components.map((c) => [c.id, c.status]) ?? [],
  );
  const readings: ServiceReading[] = services.map((service) => {
    if (service.id === "website") return { id: service.id, state: website };
    if (api === "down") return { id: service.id, state: "down" };
    if (stale || api !== "operational")
      return { id: service.id, state: "unknown" };
    let state = worst(
      service.required.map((id) => components.get(id) ?? "unknown"),
    );
    if (service.id === "estimates") {
      const delivery = report?.predictionDelivery;
      if (delivery?.state === "idle" && state === "operational")
        return {
          id: service.id,
          state: "unknown",
          note:
            delivery.reason === "no_recent_demand"
              ? "no_demand"
              : "sparse_data",
        };
      // Switched off on purpose while the feature is rebuilt: a planned state
      // with its own label, not an outage and not maintenance.
      if (delivery?.state === "disabled" && state === "operational")
        return { id: service.id, state: "paused", note: "in_development" };
      const deliveryState =
        delivery?.state === "healthy"
          ? "operational"
          : delivery?.state === "degraded"
            ? "degraded"
            : delivery?.state === "disabled"
              ? "paused"
              : "unknown";
      state = worst([state, deliveryState]);
    }
    return { id: service.id, state };
  });
  return {
    checkedAt: new Date(now).toISOString(),
    generatedAt: report?.generatedAt ?? null,
    stale,
    api,
    website,
    latencyMs,
    services: readings,
    viennaRealtime: stale
      ? "unknown"
      : (components.get("wiener_linien") ?? "unknown"),
  };
}
/**
 * Report age is judged once, at check time, by `projectReport`. Re-judging it
 * at display time stacked collector, cache and polling delays on top and
 * greyed out current checks; here only the check itself has to be current.
 */
export function expireSnapshot(snapshot: Snapshot, now = Date.now()): Snapshot {
  const at = Date.parse(snapshot.checkedAt);
  if (Number.isFinite(at) && now - at <= MAX_AGE_MS && at <= now + 30_000)
    return snapshot;
  return {
    ...snapshot,
    stale: true,
    api: "unknown",
    website: "unknown",
    services: snapshot.services.map((s) => ({ id: s.id, state: "unknown" })),
    viennaRealtime: "unknown",
  };
}

/** The edge cache can hand the collector an older copy than one it already read. */
export function newerReport(
  current: unknown,
  candidate: unknown,
  now: number,
): unknown {
  const generatedAt = (raw: unknown) => {
    const parsed = reportSchema.safeParse(raw);
    const at = parsed.success ? Date.parse(parsed.data.generatedAt) : NaN;
    return at <= now + 30_000 ? at : NaN;
  };
  const kept = generatedAt(current);
  const offered = generatedAt(candidate);
  if (!Number.isFinite(offered)) return Number.isFinite(kept) ? current : null;
  return Number.isFinite(kept) && kept > offered ? current : candidate;
}

type ManualComponent = { id: number; status: string };
export type ManualTracker =
  | { type: "component"; component: ManualComponent }
  | { type: "group"; components: readonly ManualComponent[] };

export function mergeManualStatus(
  snapshot: Snapshot | undefined,
  trackers: readonly ManualTracker[] | null | undefined,
  now = Date.now(),
  manualFresh = true,
) {
  const current = snapshot ? expireSnapshot(snapshot, now) : undefined;
  const manual = new Map<number, string>();
  for (const tracker of trackers ?? []) {
    const components =
      tracker.type === "component" ? [tracker.component] : tracker.components;
    for (const component of components)
      manual.set(component.id, component.status);
  }
  const readings = services.map((service) => {
    const reading = current?.services.find((s) => s.id === service.id);
    const measured = reading?.state ?? "unknown";
    const status = manual.get(service.componentId);
    const impact: ServiceState =
      status === "error"
        ? "down"
        : status === "degraded"
          ? "degraded"
          : status === "info"
            ? "paused"
            : manualFresh && status === "success"
              ? "operational"
              : "unknown";
    return {
      ...service,
      // A feature in development has no manual tracker to confirm it; the
      // missing tracker must not turn a planned pause grey.
      state:
        measured === "paused" &&
        reading?.note === "in_development" &&
        impact === "unknown"
          ? measured
          : worst([measured, impact]),
      maintenance:
        status === "info" && measured !== "down" && measured !== "degraded",
      note:
        impact === "operational" ||
        (impact === "unknown" && measured === "paused")
          ? reading?.note
          : undefined,
    };
  });
  return {
    snapshot: current,
    services: readings,
    overall: worst(readings.map((s) => s.state)),
  };
}

export type MergedStatus = ReturnType<typeof mergeManualStatus>;
export type MergedService = MergedStatus["services"][number];

export type Headline =
  | "operational"
  | "no_known_issues"
  | "unconfirmed"
  | "maintenance"
  | "degraded"
  | "down";

/** Neutral readings with a known reason do not turn the page headline grey. */
export function headline(
  readings: readonly Pick<MergedService, "state" | "maintenance" | "note">[],
): Headline {
  if (readings.some((s) => s.state === "down")) return "down";
  if (readings.some((s) => s.state === "degraded")) return "degraded";
  if (readings.some((s) => s.maintenance)) return "maintenance";
  if (readings.some((s) => s.state === "unknown" && !s.note))
    return "unconfirmed";
  return readings.every((s) => s.state === "operational")
    ? "operational"
    : "no_known_issues";
}

export const BUCKET_MS = 30 * 60_000;
export const BUCKET_COUNT = 48;
const FULL_BUCKET_CHECKS = 26;

export type StateCounts = Partial<Record<ServiceState, number>>;
export type HistoryBucket = {
  start: string;
  checks: number;
  counts: StateCounts;
  state: ServiceState;
};

/** Green needs nearly every minute confirmed; any confirmed failure shows. */
export function bucketState(
  counts: StateCounts,
  required: number,
): ServiceState {
  if (counts.down) return "down";
  if (counts.degraded) return "degraded";
  if ((counts.operational ?? 0) >= required) return "operational";
  if (counts.paused) return "paused";
  return "unknown";
}

export function historyWindowStart(now: number): number {
  return (Math.floor(now / BUCKET_MS) - (BUCKET_COUNT - 1)) * BUCKET_MS;
}

export function buildHistory(
  rows: readonly { bucket: number; id: string; state: string; n: number }[],
  now: number,
): Record<string, HistoryBucket[]> {
  const start = historyWindowStart(now);
  const grouped = new Map<string, StateCounts>();
  for (const row of rows) {
    const state = stateSchema.safeParse(row.state);
    if (!state.success) continue;
    const key = `${row.id}:${row.bucket}`;
    const counts = grouped.get(key) ?? {};
    counts[state.data] = (counts[state.data] ?? 0) + row.n;
    grouped.set(key, counts);
  }
  const history: Record<string, HistoryBucket[]> = {};
  for (const service of services) {
    history[service.id] = Array.from({ length: BUCKET_COUNT }, (_, i) => {
      const from = start + i * BUCKET_MS;
      const counts = grouped.get(`${service.id}:${i}`) ?? {};
      const elapsedMinutes = Math.floor((now - from) / 60_000);
      const required =
        i === BUCKET_COUNT - 1
          ? Math.max(1, elapsedMinutes - 2)
          : FULL_BUCKET_CHECKS;
      return {
        start: new Date(from).toISOString(),
        checks: Object.values(counts).reduce((sum, n) => sum + n, 0),
        counts,
        state: bucketState(counts, required),
      };
    });
  }
  return history;
}

/** Legacy OpenStatus surfaces have no unknown state; never promote it to success. */
export function nativeStatus(
  state: ServiceState,
): "success" | "degraded" | "error" | "info" {
  return state === "operational"
    ? "success"
    : state === "down"
      ? "error"
      : state === "paused"
        ? "info"
        : "degraded";
}

export function serviceIndicator(state: ServiceState) {
  switch (state) {
    case "operational":
      return { indicator: "none", description: "All Systems Operational" };
    case "down":
      return { indicator: "major", description: "Major Outage" };
    case "degraded":
      return { indicator: "minor", description: "Degraded Performance" };
    case "paused":
      return { indicator: "maintenance", description: "Under Maintenance" };
    case "unknown":
      return { indicator: "unknown", description: "Status Not Confirmed" };
  }
}

export function serviceComponentStatus(state: ServiceState): string {
  switch (state) {
    case "operational":
      return "operational";
    case "down":
      return "major_outage";
    case "degraded":
      return "degraded_performance";
    case "paused":
      return "under_maintenance";
    case "unknown":
      return "unknown";
  }
}
export type StatusData = {
  snapshot: Snapshot;
  history: Record<string, HistoryBucket[]>;
};

export function serviceLabel(
  id: number,
  locale: string,
  fallback: string,
): string {
  const service = services.find((item) => item.componentId === id);
  return service ? (locale === "en" ? service.en : service.de) : fallback;
}
