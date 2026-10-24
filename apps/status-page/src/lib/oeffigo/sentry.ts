import type { SignalReading } from "./alerts";

/**
 * Sentry als Signal für den Betreiber, nie für die öffentliche Seite: neue
 * Fehlerarten und ein Sprung in der Zahl der Fehler. Liest mit dem Token der
 * Internal Integration „Statusseite (nur lesen)“ (`SENTRY_READ_TOKEN`).
 */
const HOST = "https://de.sentry.io";
const ORG = "offigo-rm";
const PROJECT = "oeffigo-bff";
const EVERY_MS = 5 * 60_000;
/** Ein Sprung: so viele Fehler in zehn Minuten und das Fünffache des Tagesmedians. */
export const SPIKE = { min: 10, factor: 5 } as const;
/** Eine neue Fehlerart zählt ab so vielen Ereignissen. */
export const NEW_ISSUE_EVENTS = 3;

type Issue = { title: string; count: string; firstSeen: string };

let last: { at: number; reading: SignalReading } | null = null;
let projectId: string | null = null;

async function get<T>(path: string): Promise<T | null> {
  const token = process.env.SENTRY_READ_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch(`${HOST}/api/0/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "OeffiGo-Status/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function judgeSentry(
  buckets: readonly number[],
  fresh: readonly Issue[],
): Pick<SignalReading, "level" | "detail"> {
  const newest = buckets.at(-1) ?? 0;
  const earlier = buckets.slice(0, -1).sort((a, b) => a - b);
  const median = earlier.length ? earlier[Math.floor(earlier.length / 2)] : 0;
  const spike =
    newest >= SPIKE.min && newest >= SPIKE.factor * Math.max(median, 1);
  const issues = fresh.filter((i) => Number(i.count) >= NEW_ISSUE_EVENTS);
  if (!spike && issues.length === 0) return { level: null };
  const parts = [
    spike ? `${newest} Fehler in 10 Min. (sonst etwa ${median})` : null,
    issues.length
      ? `neu: ${issues
          .slice(0, 3)
          .map((i) => `„${i.title.slice(0, 80)}“ (${i.count}×)`)
          .join(", ")}`
      : null,
  ].filter(Boolean);
  return { level: "degraded", detail: parts.join("; ") };
}

/** `null` ohne Token oder wenn Sentry nicht antwortet: dann fehlt das Signal, es ist nicht grün. */
export async function readSentry(now: number): Promise<SignalReading | null> {
  if (last && now - last.at < EVERY_MS) return last.reading;
  if (!projectId) {
    const project = await get<{ id: string }>(`projects/${ORG}/${PROJECT}/`);
    projectId = project?.id ?? null;
    if (!projectId) return null;
  }
  const [stats, fresh] = await Promise.all([
    get<{ data: [number, { count: number }[]][] }>(
      `organizations/${ORG}/events-stats/?project=${projectId}&statsPeriod=24h&interval=10m&yAxis=count()&dataset=errors`,
    ),
    get<Issue[]>(
      `projects/${ORG}/${PROJECT}/issues/?query=${encodeURIComponent("is:unresolved firstSeen:-15m")}&statsPeriod=24h`,
    ),
  ]);
  if (!stats || !fresh) return null;
  // Der laufende Abschnitt ist noch nicht voll; verglichen wird der letzte fertige.
  const buckets = stats.data.slice(0, -1).map(([, v]) => v[0]?.count ?? 0);
  const reading: SignalReading = {
    id: "sentry",
    label: "Sentry: Fehler im BFF",
    // Ein Sprung steht nur zehn Minuten an; die übliche Viertelstunde Bestätigung erreichte er nie.
    confirm: 1,
    ...judgeSentry(buckets, fresh),
  };
  last = { at: now, reading };
  return reading;
}
