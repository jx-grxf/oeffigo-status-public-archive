import type { ServiceState } from "./model";

/**
 * Die Oberkomponenten der Seite. Jede Funktion aus `services` steht in genau
 * einer Gruppe; die Linienschiene zeichnet die Gruppen in dieser Reihenfolge.
 */
export const serviceGroups = [
  {
    id: "app",
    de: "App",
    en: "App",
    services: [
      "departures",
      "planning",
      "map",
      "positions",
      "alerts",
      "estimates",
    ],
  },
  {
    id: "api",
    de: "Schnittstelle",
    en: "API",
    services: ["assistants", "reliability"],
  },
  { id: "web", de: "Website", en: "Website", services: ["website"] },
] as const;

export type GroupId = (typeof serviceGroups)[number]["id"] | "sources";

/**
 * Eine Datenquelle mit öffentlichem Namen. Keine Quoten, Schlüssel oder
 * Endpunkte: die Zeile sagt nur, ob von dort gerade Daten kommen.
 */
export type SourceRow = {
  id: string;
  label: string;
  description: string;
  descriptionEn: string;
  state: ServiceState;
};

/** Öffentliche Namen der Datenquellen in der Reihenfolge der Seite. */
export const sourceCatalog: Omit<SourceRow, "state">[] = [
  {
    id: "vao",
    label: "VAO",
    description: "Fahrpläne, Abfahrten und Verbindungen für ganz Österreich.",
    descriptionEn: "Timetables, departures and journeys for all of Austria.",
  },
  {
    id: "wiener-linien",
    label: "Wiener Linien",
    description: "Echtzeit für U-Bahn, Bim und Bus in Wien.",
    descriptionEn: "Real-time data for metro, tram and bus in Vienna.",
  },
  {
    id: "offene-daten-steiermark",
    label: "Offene Daten Steiermark",
    description:
      "Offizielle Echtzeitdaten der Steiermark für Verlauf und Pünktlichkeit.",
    descriptionEn:
      "Official real-time data for Styria, used for trip history and punctuality.",
  },
  {
    id: "mvo",
    label: "MVO",
    description: "Störungsmeldungen der Verkehrsverbünde.",
    descriptionEn: "Service alerts from the regional transport associations.",
  },
  {
    id: "oebb",
    label: "ÖBB",
    description: "Fahrpläne.",
    descriptionEn: "Timetables.",
  },
];

/** Verlaufsschlüssel einer Datenquelle, getrennt von den Funktions-IDs. */
export function sourceSlotId(id: string) {
  return `source:${id}`;
}

export const sourceSlotIds = sourceCatalog.map((s) => sourceSlotId(s.id));

export function sourceRows(
  readings: readonly { id: string; state: ServiceState }[] | undefined,
): SourceRow[] {
  if (!readings?.length) return [];
  const state = new Map(readings.map((r) => [r.id, r.state]));
  return sourceCatalog.map((row) => ({
    ...row,
    state: state.get(row.id) ?? "unknown",
  }));
}

/** Bundesländer mit Schreibweise für Menschen; Schlüssel wie im Server-Label `region`. */
export const REGION_NAMES: Record<string, string> = {
  burgenland: "Burgenland",
  kaernten: "Kärnten",
  niederoesterreich: "Niederösterreich",
  oberoesterreich: "Oberösterreich",
  salzburg: "Salzburg",
  steiermark: "Steiermark",
  tirol: "Tirol",
  vorarlberg: "Vorarlberg",
  wien: "Wien",
};
