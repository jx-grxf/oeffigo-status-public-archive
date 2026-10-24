import { buildRange, type MinuteCounts, ranges, SLOT_MS } from "./availability";
import { type SourceRow, sourceCatalog, sourceRows } from "./groups";
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
    sources: { "verbund-linie": "degraded" },
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
    id === "positions" ? "paused" : (scene.states[id] ?? "operational");

  const ids = services.map((s) => s.id);
  const first = Math.floor((now - 90 * 86_400_000) / SLOT_MS) * SLOT_MS;
  const slots: { start: number; service: string; counts: MinuteCounts }[] = [];
  for (const id of ids) {
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
      slots.push({ start, service: id, counts: counts(state) });
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
      { snapshot, history: buildRange(range, slots, now, ids) },
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
    statusReports: [],
    maintenances: [],
    openEvents: [],
    lastEvents: [],
    trackers,
  };

  return {
    page,
    data,
    sources: sourceRows(snapshot.sources),
  };
}

export function parsePreviewScenario(raw: string | undefined): PreviewScenario {
  return previewScenarios.find((s) => s === raw) ?? "stoerung";
}
