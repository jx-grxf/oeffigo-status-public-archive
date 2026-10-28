import type { SignalReading } from "./alerts";
import type { ServiceState } from "./model";

const API = "https://api.oeffigo.app/v2/disruptions";
const TIMEOUT_MS = 5000;
/** Wie bei Lebenszeichen und Website: erst die dritte Fehlprüfung in Folge zählt. */
export const PROBE_FAILURES = 3;

type Check = (body: string) => boolean;

const isList: Check = (body) => {
  try {
    const parsed = JSON.parse(body) as { disruptions?: unknown };
    return Array.isArray(parsed.disruptions);
  } catch {
    return false;
  }
};

/**
 * Jede Störungsabfrage, die App und Website wirklich schicken, mit genau ihren
 * Parametern. Am 27.10. hing nur die Liste mit ÖBB, elf Stunden lang, und
 * nichts davon war hier zu sehen.
 */
export const disruptionProbes = [
  {
    id: "app",
    label: "App: Hinweise auf Karte, im Planer und an Wegen",
    url: API,
    accept: isList,
    core: true,
  },
  {
    id: "app_overview",
    label: "App: Störungsübersicht",
    url: `${API}?limit=300&offset=0&includeUpcoming=1&sources=ims,wl,oebb`,
    accept: isList,
    core: false,
  },
  {
    id: "website_api",
    label: "Website: Störungsliste",
    url: `${API}?includeUpcoming=1&sources=ims,wl,oebb&limit=300&offset=0`,
    accept: isList,
    core: false,
  },
  {
    id: "website_page",
    label: "Website: oeffigo.app/stoerungen",
    url: "https://oeffigo.app/stoerungen",
    // Der Text, den die Seite zeigt, wenn ihr Abruf scheitert (Website, strings.ts).
    accept: (body: string) => !body.includes("lassen sich gerade nicht laden"),
    core: false,
  },
] as const;

export type ProbeId = (typeof disruptionProbes)[number]["id"];
export type ProbeResult = {
  ok: boolean;
  ms: number;
  status: number | null;
  failure: "http" | "invalid_body" | "timeout" | "network" | null;
};

export async function probeBody(
  url: string,
  accept: Check,
  fetcher: typeof fetch = fetch,
): Promise<ProbeResult> {
  const start = Date.now();
  let status: number | null = null;
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      headers: { "User-Agent": "OeffiGo-Status/1.0" },
    });
    status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, ms: Date.now() - start, status, failure: "http" };
    }
    const body = await response.text();
    const ok = accept(body);
    return {
      ok,
      ms: Date.now() - start,
      status,
      failure: ok ? null : "invalid_body",
    };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      ms: Date.now() - start,
      status,
      failure: timeout ? "timeout" : "network",
    };
  }
}

export type ProbeStreaks = Record<ProbeId, number>;

export function nextStreaks(
  streaks: ProbeStreaks,
  results: Record<ProbeId, ProbeResult>,
): ProbeStreaks {
  const next = { ...streaks };
  for (const { id } of disruptionProbes)
    next[id] = results[id].ok ? 0 : (streaks[id] ?? 0) + 1;
  return next;
}

/**
 * Fällt die Standardliste der App aus, sind Verkehrsmeldungen ausgefallen;
 * scheitert nur eine der anderen Abfragen, sind sie eingeschränkt.
 */
export function disruptionState(streaks: ProbeStreaks): ServiceState | null {
  const failing = disruptionProbes.filter(
    (p) => (streaks[p.id] ?? 0) >= PROBE_FAILURES,
  );
  if (failing.length === 0) return null;
  return failing.some((p) => p.core) ? "down" : "degraded";
}

const failureText: Record<NonNullable<ProbeResult["failure"]>, string> = {
  http: "HTTP-Fehler",
  invalid_body: "Antwort ohne Liste bzw. mit Fehlertext",
  timeout: `keine Antwort in ${TIMEOUT_MS / 1000} s`,
  network: "keine Verbindung",
};

export function disruptionSignals(
  streaks: ProbeStreaks,
  results: Record<ProbeId, ProbeResult>,
): SignalReading[] {
  return disruptionProbes.map((p) => {
    const failing = (streaks[p.id] ?? 0) >= PROBE_FAILURES;
    const result = results[p.id];
    return {
      id: `disruptions:${p.id}`,
      label: `Störungen · ${p.label}`,
      level: failing ? (p.core ? "down" : "degraded") : null,
      detail: failing
        ? `${streaks[p.id]} Prüfungen in Folge gescheitert: ${failureText[result.failure ?? "network"]}${result.status ? ` (${result.status})` : ""}, ${result.ms} ms`
        : undefined,
      draft: failing
        ? p.core
          ? "Verkehrsmeldungen laden gerade nicht, weder in der App noch auf der Website."
          : "Die Störungsübersicht lädt gerade nicht. Abfahrten, Routenplanung und Karte laufen normal."
        : undefined,
      // Die drei Prüfungen in Folge sind schon gezählt.
      confirm: 1,
    };
  });
}
