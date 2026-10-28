import type { CauseKey, ServiceState, Snapshot } from "./model";

// Atlassian-Statuspage-Formel: Vollausfall zählt ganz, Teilausfall zu 30 %,
// „Eingeschränkt“ gar nicht. Unbestätigte und pausierte Minuten gelten nicht als gemessen.
export const SLOT_MS = 30 * 60_000;
export const PARTIAL_WEIGHT = 0.3;
// Grün braucht fast jede Minute des Abschnitts belegt (26 von 30 wie bisher).
const COVERAGE = 26 / 30;
// The collector needs up to two minutes before a minute shows up.
const LAG_MINUTES = 2;
const MIN_MEASURED_SHARE = 0.05;

export const levels = [
  "operational",
  "degraded",
  "partial",
  "down",
  "paused",
  "unknown",
] as const;
export type Level = (typeof levels)[number];
export type MinuteCounts = Record<Level, number>;

const rank: Record<Level, number> = {
  operational: 0,
  paused: 1,
  unknown: 2,
  degraded: 3,
  partial: 4,
  down: 5,
};

export const emptyCounts = (): MinuteCounts => ({
  operational: 0,
  degraded: 0,
  partial: 0,
  down: 0,
  paused: 0,
  unknown: 0,
});

export type Impact =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage";
/** One component's manual impact from a report update until the next one. */
export type ManualInterval = {
  componentId: number;
  impact: Impact;
  from: number;
  to: number;
};

const impactLevel: Record<Impact, Level | null> = {
  operational: null,
  degraded_performance: "degraded",
  partial_outage: "partial",
  major_outage: "down",
};

const worse = (a: Level, b: Level) => (rank[b] > rank[a] ? b : a);

/**
 * Minute → level per service. The collector reports a failed probe as
 * "unknown" until the third failure in a row turns it into "down"; once
 * confirmed, those first failed minutes count as down too, as Better Stack and
 * Statuspage do. Unknown minutes from a stale report stay unknown.
 */
export function minuteLevels(
  samples: readonly Snapshot[],
  serviceIds: readonly string[],
): Map<string, Map<number, Level>> {
  const ordered = samples.toSorted(
    (a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt),
  );
  const result = new Map<string, Map<number, Level>>();
  for (const id of serviceIds) {
    const seq = ordered.map((sample) => {
      const reading = sample.services.find((s) => s.id === id);
      const state: ServiceState = reading?.state ?? "unknown";
      const probe = id === "website" ? sample.website : sample.api;
      return {
        minute: Math.floor(Date.parse(sample.checkedAt) / 60_000),
        level: state as Level,
        failed: state === "unknown" && probe === "unknown",
      };
    });
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].level !== "down") continue;
      for (
        let j = i - 1;
        j >= 0 && seq[j].failed && seq[i].minute - seq[j].minute <= 5;
        j--
      )
        seq[j].level = "down";
    }
    const minutes = new Map<number, Level>();
    for (const { minute, level } of seq)
      minutes.set(minute, worse(minutes.get(minute) ?? "operational", level));
    result.set(id, minutes);
  }
  return result;
}

/** Minuten je Ursache in einem Zeitfenster, dazu die betroffenen Bundesländer. */
export type CauseMinutes = Partial<Record<CauseKey, number>>;
export type Causes = { minutes: CauseMinutes; regions: string[] };
type MinuteCause = { causes: Set<CauseKey>; regions: Set<string> };

/**
 * Minute → Ursachen je Funktion, nur für eingeschränkte und unterbrochene
 * Minuten. Die Minuten vor einer bestätigten Unterbrechung gelten rückwirkend
 * als unerreichbar, wie bei `minuteLevels`.
 */
export function minuteCauses(
  samples: readonly Snapshot[],
  serviceIds: readonly string[],
): Map<string, Map<number, MinuteCause>> {
  const ordered = samples.toSorted(
    (a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt),
  );
  const result = new Map<string, Map<number, MinuteCause>>();
  for (const id of serviceIds) {
    const seq = ordered.map((sample) => {
      const reading = sample.services.find((s) => s.id === id);
      const state: ServiceState = reading?.state ?? "unknown";
      const probe = id === "website" ? sample.website : sample.api;
      return {
        minute: Math.floor(Date.parse(sample.checkedAt) / 60_000),
        state,
        failed: state === "unknown" && probe === "unknown",
        causes: new Set<CauseKey>(
          state === "degraded" || state === "down"
            ? (reading?.causes ?? [])
            : [],
        ),
        regions: reading?.realtimeGaps ?? [],
      };
    });
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].state !== "down") continue;
      for (
        let j = i - 1;
        j >= 0 && seq[j].failed && seq[i].minute - seq[j].minute <= 5;
        j--
      )
        seq[j].causes.add("unreachable");
    }
    const minutes = new Map<number, MinuteCause>();
    for (const { minute, causes, regions } of seq) {
      if (causes.size === 0) continue;
      const entry = minutes.get(minute) ?? {
        causes: new Set<CauseKey>(),
        regions: new Set<string>(),
      };
      for (const c of causes) entry.causes.add(c);
      if (causes.has("realtime")) for (const r of regions) entry.regions.add(r);
      minutes.set(minute, entry);
    }
    result.set(id, minutes);
  }
  return result;
}

/** Zählt die Ursachen eines Zeitfensters; `null`, wenn es keine gibt. */
export function countCauses(
  minutes: ReadonlyMap<number, MinuteCause> | undefined,
  from: number,
  to: number,
): Causes | null {
  const counts: CauseMinutes = {};
  const regions = new Set<string>();
  for (let m = Math.ceil(from / 60_000); m * 60_000 < to; m++) {
    const entry = minutes?.get(m);
    if (!entry) continue;
    for (const cause of entry.causes) counts[cause] = (counts[cause] ?? 0) + 1;
    for (const r of entry.regions) regions.add(r);
  }
  return Object.keys(counts).length
    ? { minutes: counts, regions: [...regions].toSorted() }
    : null;
}

export function addCauses(a: Causes | undefined, b: Causes | undefined) {
  if (!a || !b) return a ?? b;
  const minutes: CauseMinutes = { ...a.minutes };
  for (const [k, v] of Object.entries(b.minutes))
    minutes[k as CauseKey] = (minutes[k as CauseKey] ?? 0) + (v ?? 0);
  return {
    minutes,
    regions: [...new Set([...a.regions, ...b.regions])].toSorted(),
  };
}

/** Minutes per level for one service in [from, to). */
export function countMinutes(
  minutes: ReadonlyMap<number, Level> | undefined,
  manual: readonly ManualInterval[],
  from: number,
  to: number,
): MinuteCounts {
  const counts = emptyCounts();
  for (let m = Math.ceil(from / 60_000); m * 60_000 < to; m++) {
    let level = minutes?.get(m) ?? "unknown";
    const at = m * 60_000;
    for (const interval of manual) {
      const manualLevel = impactLevel[interval.impact];
      if (manualLevel && interval.from <= at && at < interval.to)
        level = worse(level, manualLevel);
    }
    counts[level] += 1;
  }
  return counts;
}

export function addCounts(a: MinuteCounts, b: MinuteCounts): MinuteCounts {
  const sum = emptyCounts();
  for (const level of levels) sum[level] = a[level] + b[level];
  return sum;
}

export function measuredMinutes(c: MinuteCounts) {
  return c.operational + c.degraded + c.partial + c.down;
}

/** Share of measured time that was available, or null without any measurement. */
export function uptime(c: MinuteCounts): number | null {
  const measured = measuredMinutes(c);
  if (measured === 0) return null;
  return (measured - c.down - PARTIAL_WEIGHT * c.partial) / measured;
}

/** Any confirmed problem colours the bar; green needs nearly full coverage. */
export function bucketLevel(c: MinuteCounts, expectedMinutes: number): Level {
  if (c.down) return "down";
  if (c.partial) return "partial";
  if (c.degraded) return "degraded";
  const covered = c.operational + c.paused;
  if (expectedMinutes > 0 && covered >= Math.ceil(expectedMinutes * COVERAGE))
    return c.operational > 0 ? "operational" : "paused";
  return "unknown";
}

/**
 * Manual intervals from report updates. An update's impact on a component
 * lasts until the next update naming it; a resolved report ends all of them.
 */
export function manualIntervals(
  reports: readonly {
    resolvedAt: number | null;
    updates: readonly {
      id: number;
      date: number;
      impacts: readonly { componentId: number; impact: Impact }[];
    }[];
  }[],
  now: number,
): ManualInterval[] {
  const out: ManualInterval[] = [];
  for (const report of reports) {
    const updates = report.updates.toSorted(
      (a, b) => a.date - b.date || a.id - b.id,
    );
    const open = new Map<number, { impact: Impact; from: number }>();
    // A note after the resolution (post-mortem) must not extend an impact.
    const close = (componentId: number, at: number) => {
      const current = open.get(componentId);
      const to =
        report.resolvedAt === null ? at : Math.min(at, report.resolvedAt);
      if (current && to > current.from)
        out.push({
          componentId,
          impact: current.impact,
          from: current.from,
          to,
        });
      open.delete(componentId);
    };
    for (const update of updates) {
      for (const { componentId, impact } of update.impacts) {
        close(componentId, update.date);
        open.set(componentId, { impact, from: update.date });
      }
    }
    const end = report.resolvedAt ?? now;
    for (const componentId of open.keys()) close(componentId, end);
  }
  return out.filter((i) => i.impact !== "operational");
}

const viennaParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function viennaOffset(ms: number) {
  const p = Object.fromEntries(
    viennaParts.formatToParts(ms).map((x) => [x.type, Number(x.value)]),
  );
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return local - Math.floor(ms / 60_000) * 60_000;
}

/** Start of the Vienna calendar day containing `ms`, DST-safe. */
export function viennaDayStart(ms: number): number {
  const p = Object.fromEntries(
    viennaParts.formatToParts(ms).map((x) => [x.type, Number(x.value)]),
  );
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  const guess = midnightAsUtc - viennaOffset(ms);
  return midnightAsUtc - viennaOffset(guess);
}

export const ranges = ["24h", "7d", "30d", "90d"] as const;
export type Range = (typeof ranges)[number];

/** Bucket boundaries, oldest first; the last bucket ends in the future. */
export function bucketBounds(range: Range, now: number): [number, number][] {
  if (range === "24h" || range === "7d") {
    const size = range === "24h" ? SLOT_MS : 4 * 3_600_000;
    const count = range === "24h" ? 48 : 42;
    const last = Math.floor(now / size) * size;
    return Array.from({ length: count }, (_, i) => {
      const start = last - (count - 1 - i) * size;
      return [start, start + size] as [number, number];
    });
  }
  const days = range === "30d" ? 30 : 90;
  const bounds: [number, number][] = [];
  let end = viennaDayStart(viennaDayStart(now) + 30 * 3_600_000);
  for (let i = 0; i < days; i++) {
    const start = viennaDayStart(end - 3_600_000);
    bounds.unshift([start, end]);
    end = start;
  }
  return bounds;
}

export type Bucket = {
  start: string;
  end: string;
  counts: MinuteCounts;
  level: Level;
  /** Warum der Abschnitt nicht grün war; fehlt ohne Aufzeichnung (ältere Messungen). */
  causes?: Causes;
};
export type RangeHistory = {
  range: Range;
  buckets: Record<string, Bucket[]>;
  uptime: Record<string, number | null>;
  /** First minute with any stored measurement; older bars are not data gaps but "before". */
  since: string | null;
};

/** Sum 30-minute slots into the range's buckets for every service. */
export function buildRange(
  range: Range,
  slots: readonly {
    start: number;
    service: string;
    counts: MinuteCounts;
    causes?: Causes;
  }[],
  now: number,
  serviceIds: readonly string[],
): RangeHistory {
  const bounds = bucketBounds(range, now);
  const buckets: Record<string, Bucket[]> = {};
  const uptimeBy: Record<string, number | null> = {};
  let since: number | null = null;
  for (const slot of slots)
    if (measuredMinutes(slot.counts) + slot.counts.paused > 0)
      since = since === null ? slot.start : Math.min(since, slot.start);
  for (const id of serviceIds) {
    const own = slots.filter((s) => s.service === id);
    let total = emptyCounts();
    buckets[id] = bounds.map(([start, end]) => {
      let counts = emptyCounts();
      let causes: Causes | undefined;
      for (const slot of own)
        if (slot.start >= start && slot.start < end) {
          counts = addCounts(counts, slot.counts);
          causes = addCauses(causes, slot.causes);
        }
      total = addCounts(total, counts);
      const expected = Math.max(
        0,
        Math.floor((Math.min(end, now) - start) / 60_000) - LAG_MINUTES,
      );
      return {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        counts,
        level: bucketLevel(counts, expected),
        ...(causes ? { causes } : {}),
      };
    });
    // A mostly paused function would otherwise get a percentage from a handful of minutes.
    const all = measuredMinutes(total) + total.paused + total.unknown;
    uptimeBy[id] =
      measuredMinutes(total) >= Math.max(60, all * MIN_MEASURED_SHARE)
        ? uptime(total)
        : null;
  }
  return {
    range,
    buckets,
    uptime: uptimeBy,
    since: since === null ? null : new Date(since).toISOString(),
  };
}
