import {
  buildRange,
  type Causes,
  type MinuteCounts,
  ranges,
  SLOT_MS,
} from "./availability";
import {
  type SourceRow,
  sourceCatalog,
  sourceRows,
  sourceSlotId,
} from "./groups";
import {
  type ManualTracker,
  type ServiceState,
  type Snapshot,
  type StatusData,
  services,
} from "./model";

/**
 * Testdaten für die lokale Vorschau unter /proto/seite. Nie in einer
 * ausgelieferten Seite: der Proxy lässt /proto nur in der Entwicklung durch.
 */
export const previewScenarios = ["gruen", "stoerung", "ausfall"] as const;
export type PreviewScenario = (typeof previewScenarios)[number];

export type Preview = {
  page: unknown;
  data: Record<string, StatusData>;
  sources: SourceRow[];
};

type Scene = {
  states: Partial<Record<string, ServiceState>>;
  api: ServiceState;
  sources: Partial<Record<string, ServiceState>>;
};

const scenes: Record<PreviewScenario, Scene> = {
  gruen: { states: {}, api: "operational", sources: {} },
  stoerung: {
    states: { estimates: "degraded", departures: "degraded" },
    api: "operational",
    sources: { "offene-daten-steiermark": "degraded" },
  },
  ausfall: {
    states: { departures: "down", planning: "down", map: "degraded" },
    api: "degraded",
    sources: { vao: "down" },
  },
};

const manualStatus: Record<ServiceState, string> = {
  operational: "success",
  degraded: "degraded",
  down: "error",
  // Ruhende Funktionen tragen in der Verwaltung „verfügbar“; ruhend meldet die Messung.
  paused: "success",
  unknown: "success",
};

function counts(state: ServiceState): MinuteCounts {
  const empty = {
    operational: 0,
    degraded: 0,
    partial: 0,
    down: 0,
    paused: 0,
    unknown: 0,
  };
  return { ...empty, [state]: 30 };
}

// Gleiche Seite bei jedem Neuladen: ein fester Zufall je Funktion und Abschnitt.
function noise(service: string, slot: number) {
  let h = 2166136261;
  for (const c of `${service}:${slot}`)
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

export function buildPreview(
  scenario: PreviewScenario,
  now = Date.now(),
): Preview {
  const scene = scenes[scenario];
  const stateOf = (id: string): ServiceState =>
    id === "positions"
      ? "paused"
      : id.startsWith("source:")
        ? (scene.sources[id.slice("source:".length)] ?? "operational")
        : (scene.states[id] ?? "operational");

  const ids = services.map((s) => s.id);
  const historyIds = [
    ...ids,
    ...sourceCatalog.map((row) => sourceSlotId(row.id)),
  ];
  const first = Math.floor((now - 90 * 86_400_000) / SLOT_MS) * SLOT_MS;
  const slots: {
    start: number;
    service: string;
    counts: MinuteCounts;
    causes?: Causes;
  }[] = [];
  for (const id of historyIds) {
    for (let start = first, i = 0; start < now; start += SLOT_MS, i++) {
      const recent = now - start < 2 * SLOT_MS;
      const r = noise(id, i);
      const state: ServiceState =
        recent && stateOf(id) !== "operational"
          ? stateOf(id)
          : id === "positions"
            ? "paused"
            : r < 0.004
              ? "down"
              : r < 0.02
                ? "degraded"
                : "operational";
      slots.push({
        start,
        service: id,
        counts: counts(state),
        ...(state === "degraded"
          ? {
              causes: {
                minutes: { slow: 20, errors: 4 },
                regions: id === "departures" ? ["steiermark"] : [],
              },
            }
          : {}),
      });
    }
  }

  const iso = new Date(now).toISOString();
  const snapshot: Snapshot = {
    checkedAt: iso,
    generatedAt: iso,
    stale: false,
    api: scene.api,
    website: stateOf("website"),
    latencyMs: 180,
    services: ids.map((id) => ({ id, state: stateOf(id) })),
    viennaRealtime: "operational",
    sources: sourceCatalog.map((row) => ({
      id: row.id,
      state: scene.sources[row.id] ?? "operational",
    })),
  };
  const data = Object.fromEntries(
    ranges.map((range) => [
      range,
      { snapshot, history: buildRange(range, slots, now, historyIds) },
    ]),
  );

  const trackers: ManualTracker[] = [
    {
      type: "group",
      components: services.map((s) => ({
        id: s.componentId,
        status: manualStatus[stateOf(s.id)],
      })),
    },
  ];
  const page = {
    id: 0,
    slug: "oeffigo",
    defaultLocale: "de",
    createdAt: new Date(now),
    statusReports: sampleReports(now),
    maintenances: [],
    openEvents: [],
    lastEvents: [
      { type: "report", id: 1 },
      { type: "report", id: 2 },
    ],
    trackers,
  };

  return {
    page,
    data,
    sources: sourceRows(snapshot.sources),
  };
}

function sampleReports(now: number) {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
  const component = (id: number, name: string) => ({
    pageComponent: { id, name },
  });
  const update = (
    id: number,
    hoursAgo: number,
    status: string,
    message: string,
  ) => ({
    id,
    date: at(hoursAgo),
    status,
    message,
    statusReportUpdateToPageComponents: [],
  });
  return [
    {
      id: 1,
      title: "Schwere Störung: Fahrplanauskunft nicht verfügbar",
      status: "resolved",
      statusReportsToPageComponents: [
        component(1, "Abfahrten"),
        component(2, "Routenplanung"),
      ],
      statusReportUpdates: [
        update(
          13,
          20,
          "resolved",
          "Das Postmortem zum Vorfall ist jetzt online.",
        ),
        update(12, 70, "resolved", "Alle Dienste laufen wieder."),
        update(
          11,
          73,
          "identified",
          "Die Fahrplanschnittstelle antwortet nicht.",
        ),
      ],
    },
    {
      id: 2,
      title: "Wien: Echtzeit für U-Bahn, Bim und Bus fehlt",
      status: "resolved",
      statusReportsToPageComponents: [component(1, "Abfahrten")],
      statusReportUpdates: [
        update(22, 100, "resolved", "Die Echtzeitdaten kommen wieder."),
        update(
          21,
          117,
          "identified",
          "Die Echtzeit-Schnittstelle liefert keine Daten.",
        ),
      ],
    },
  ];
}

export function parsePreviewScenario(raw: string | undefined): PreviewScenario {
  return previewScenarios.find((s) => s === raw) ?? "stoerung";
}
