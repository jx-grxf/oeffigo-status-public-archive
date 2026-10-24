import { z } from "zod";

import type { RangeHistory } from "./availability";

export const stateSchema = z.enum([
  "operational",
  "degraded",
  "down",
  "unknown",
  "paused",
]);
export type ServiceState = z.infer<typeof stateSchema>;
/**
 * Die neun Funktionen dieser Seite.
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
    // `punctuality_index`: Linienseiten und „meist +X" kommen aus dem nächtlich
    // veröffentlichten Stand; stand er still, blieb die Zeile grün (21.–24.10.).
    required: ["api", "database", "official_history", "punctuality_index"],
  },
  {
    id: "assistants",
    componentId: 9,
    de: "Assistenten (MCP)",
    en: "Assistants (MCP)",
    description: "ÖffiGo in ChatGPT, Claude und anderen Assistenten.",
    descriptionEn: "ÖffiGo in ChatGPT, Claude and other assistants.",
    // Die Komponente `mcp` meldet `paused`, solange die Schnittstelle aus ist.
    required: ["api", "api_router", "mcp"],
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
// Der Router kennt zusätzlich „standby“; ein unbekannter Wert macht den Bericht nicht ungültig.
const routerSchema = z.object({ id: z.string(), status: z.string() });
export const reportSchema = z.object({
  generatedAt: z.iso.datetime(),
  components: z.array(componentSchema),
  router: z.array(routerSchema).optional(),
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
export type ServiceScope = "positions_paused" | "wien_only";
/**
 * Warum eine Funktion eingeschränkt oder unterbrochen ist, in Kategorien, die
 * ein Besucher versteht. Keine Routen, keine Anbieter. Wird je Minute gespeichert
 * und beschriftet die gelben und roten Balken.
 */
export const causeKeys = [
  "unreachable",
  "errors",
  "slow",
  "realtime",
  "report",
] as const;
export type CauseKey = (typeof causeKeys)[number];
export type ServiceReading = {
  id: string;
  state: ServiceState;
  note?: ServiceNote;
  scope?: ServiceScope;
  /** Bundesländer, in denen gerade deutlich weniger Echtzeit ankommt als sonst. */
  realtimeGaps?: string[];
  /** Nur bei eingeschränkt oder unterbrochen; fehlt in Messungen vor dem 23.10.2026. */
  causes?: CauseKey[];
};
export type SourceReading = { id: string; state: ServiceState };
export type Snapshot = {
  checkedAt: string;
  generatedAt: string | null;
  stale: boolean;
  api: ServiceState;
  website: ServiceState;
  latencyMs: number | null;
  services: ServiceReading[];
  viennaRealtime: ServiceState;
  /** Datenquellen mit öffentlichem Namen; fehlt in Messungen vor dem 23.10.2026. */
  sources?: SourceReading[];
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
    if (service.id === "website")
      return {
        id: service.id,
        state: website,
        ...(website === "down" ? { causes: ["unreachable" as const] } : {}),
      };
    if (api === "down")
      return {
        id: service.id,
        state: "down",
        causes: ["unreachable" as const],
      };
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
    const causes =
      state === "degraded" || state === "down"
        ? { causes: ["report" as const] }
        : {};
    if (
      service.id === "positions" &&
      components.get("vehicle_positions") === "paused"
    )
      return { id: service.id, state, scope: "positions_paused", ...causes };
    if (
      service.id === "alerts" &&
      components.get("disruption_search") === "degraded"
    )
      return { id: service.id, state, scope: "wien_only", ...causes };
    return { id: service.id, state, ...causes };
  });
  const known = !stale && api === "operational";
  const router = new Map(report?.router?.map((r) => [r.id, r.status]) ?? []);
  const fromRouter = (id: string): ServiceState => {
    const status = router.get(id);
    if (status === "standby") return "paused";
    const parsed = stateSchema.safeParse(status);
    return parsed.success ? parsed.data : "unknown";
  };
  const sources: SourceReading[] = [
    { id: "vao", state: fromRouter("vao") },
    {
      id: "wiener-linien",
      state: components.get("wiener_linien") ?? "unknown",
    },
    { id: "verbund-linie", state: fromRouter("trias") },
    { id: "mvo", state: components.get("disruption_search") ?? "unknown" },
    { id: "oebb", state: fromRouter("mgate") },
  ].map((s) => (known ? s : { ...s, state: "unknown" as const }));
  return {
    checkedAt: new Date(now).toISOString(),
    generatedAt: report?.generatedAt ?? null,
    stale,
    api,
    website,
    latencyMs,
    sources,
    services: readings,
    viennaRealtime: stale
      ? "unknown"
      : (components.get("wiener_linien") ?? "unknown"),
  };
}
/**
 * Echter Verkehr verschlechtert eine gemessene Funktion, er macht nie eine
 * ruhende oder unbestätigte grün. `verdicts` kommt aus `readTraffic`.
 */
export function applyTraffic(
  snapshot: Snapshot,
  verdicts: Record<
    string,
    { state: ServiceState | null; slow?: unknown }
  > | null,
): Snapshot {
  if (!verdicts || snapshot.stale) return snapshot;
  return {
    ...snapshot,
    services: snapshot.services.map((s) => {
      const verdict = verdicts[s.id];
      const seen = verdict?.state;
      if (!seen || s.state === "paused" || s.state === "unknown") return s;
      const state = worst([s.state, seen]);
      const cause: CauseKey = verdict.slow ? "slow" : "errors";
      if (state === s.state) return withCause(s, state, cause);
      return { id: s.id, state, causes: [cause] };
    }),
  };
}

/** Eine Ursache gehört dazu, solange sie so schlimm ist wie der gezeigte Zustand. */
function withCause(
  reading: ServiceReading,
  state: ServiceState,
  cause: CauseKey,
): ServiceReading {
  if (state !== "degraded" && state !== "down") return reading;
  const causes = reading.causes ?? [];
  return causes.includes(cause)
    ? reading
    : { ...reading, causes: [...causes, cause] };
}

/**
 * Fehlt in einem Bundesland Echtzeit, werden Abfahrten eingeschränkt und
 * nennen es; ganz Österreich wird deshalb nicht rot. Eine Datenquelle wird
 * dabei nicht eingefärbt: Die Wirkung sagt nicht, wer sie verursacht.
 * `regions` aus `readRealtimeGaps`.
 */
export function applyRealtimeGaps(
  snapshot: Snapshot,
  regions: readonly string[] | null,
): Snapshot {
  if (!regions?.length || snapshot.stale) return snapshot;
  return {
    ...snapshot,
    services: snapshot.services.map((s) => {
      if (
        s.id !== "departures" ||
        s.state === "unknown" ||
        s.state === "paused"
      )
        return s;
      const state = worst([s.state, "degraded"]);
      const next: ServiceReading = {
        ...s,
        state,
        realtimeGaps: [...regions],
      };
      if (state === s.state) return withCause(next, state, "realtime");
      return { ...next, causes: ["realtime"] };
    }),
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
    sources: snapshot.sources?.map((s) => ({ id: s.id, state: "unknown" })),
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
      scope: impact === "down" ? undefined : reading?.scope,
      realtimeGaps: impact === "down" ? undefined : reading?.realtimeGaps,
    };
  });
  // Eine bewusst pausierte Funktion färbt die Gesamtlage nicht; echte Wartung schon.
  const active = readings.filter(
    (s) => !(s.state === "paused" && !s.maintenance),
  );
  return {
    snapshot: current,
    services: readings,
    overall: active.length ? worst(active.map((s) => s.state)) : "paused",
  };
}

/** Bewusst pausiert, nicht in Wartung: Die Funktion ist ausgeschaltet, nichts ist kaputt. */
export function isPaused(s: Pick<MergedService, "state" | "maintenance">) {
  return s.state === "paused" && !s.maintenance;
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

/**
 * Neutral readings with a known reason do not turn the page headline grey.
 * Paused functions are left out: "Alles in Betrieb" means everything that is
 * switched on works.
 */
export function headline(
  readings: readonly Pick<MergedService, "state" | "maintenance" | "note">[],
): Headline {
  if (readings.some((s) => s.state === "down")) return "down";
  if (readings.some((s) => s.state === "degraded")) return "degraded";
  if (readings.some((s) => s.maintenance)) return "maintenance";
  if (readings.some((s) => s.state === "unknown" && !s.note))
    return "unconfirmed";
  return readings
    .filter((s) => !isPaused(s))
    .every((s) => s.state === "operational")
    ? "operational"
    : "no_known_issues";
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

/**
 * Statuswert einer Funktion im JSON-Feed für den ÖffiGo-Server. Anders als
 * `serviceComponentStatus` trennt er „pausiert“ von „Wartung“.
 */
export function feedComponentStatus(
  service: Pick<MergedService, "state" | "maintenance">,
): string {
  if (isPaused(service)) return "paused";
  return serviceComponentStatus(service.state);
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
  history: RangeHistory;
};

export function serviceLabel(
  id: number,
  locale: string,
  fallback: string,
): string {
  const service = services.find((item) => item.componentId === id);
  return service ? (locale === "en" ? service.en : service.de) : fallback;
}
