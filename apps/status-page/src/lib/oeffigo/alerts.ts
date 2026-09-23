import { z } from "zod";

/**
 * Private operator alerts. They reuse the checks the collector already makes,
 * may name internal components and details, and never reach the public page.
 */

export type AlertLevel = "degraded" | "down";

export type SignalReading = {
  id: string;
  label: string;
  level: AlertLevel | null;
  detail?: string;
};

/** `complete` means the report was fresh and valid, so a missing entry is really gone. */
export type SignalSet = { signals: SignalReading[]; complete: boolean };

type SignalMemory = {
  level: AlertLevel | null;
  since: string;
  label: string;
  pending?: { level: AlertLevel | null; count: number };
  /** Level the operator was told about; a recovery only follows a told problem. */
  told?: AlertLevel;
  /** When problems were announced, newest last. Drives the quiet time and muting. */
  alerts?: string[];
  mutedUntil?: string;
};

export type AlertMemory = Record<string, SignalMemory>;

export type AlertEvent =
  | {
      kind: "problem";
      id: string;
      label: string;
      level: AlertLevel;
      detail?: string;
      /** Set when this was the last message before the signal goes quiet. */
      muted?: boolean;
    }
  | { kind: "recovered"; id: string; label: string; since: string };

/**
 * An outage is confirmed as fast as the public page confirms it. A wobbly
 * "degraded" must hold a quarter hour, because data pipelines dip constantly.
 */
export const CONFIRM = { down: 2, degraded: 15, recovered: 5 } as const;
/** Quiet time per signal after it was announced. */
export const QUIET_MS = 6 * 3_600_000;
/** Announced problems within a day before the signal is muted. */
const MUTE_AFTER = 2;
const MUTE_WINDOW_MS = 24 * 3_600_000;
const MUTE_MS = 24 * 3_600_000;
/** Failed probes before a probe signal counts as down; confirmation adds one more. */
const FAILED_PROBES = 2;

const QUIET = new Set(["operational", "standby", "paused"]);
const REPORT_PREFIXES = ["component:", "router:", "source:"];
const REPORT_IDS = new Set(["prediction-delivery", "providers"]);
/**
 * Components that carry the product: if one of these is merely degraded the
 * operator wants to know. Every other component is a data pipeline that dips
 * whenever a feed pauses or a backlog drains — those only speak up when down.
 */
const CORE_COMPONENTS = new Set(["api", "api_router", "database"]);

function levelOf(status: string): AlertLevel | null {
  if (QUIET.has(status)) return null;
  return status === "down" ? "down" : "degraded";
}

function fromReport(id: string) {
  return REPORT_IDS.has(id) || REPORT_PREFIXES.some((p) => id.startsWith(p));
}

const entrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string(),
  detail: z.string().optional(),
});
const reportSchema = z.object({
  components: z.array(entrySchema).default([]),
  router: z.array(entrySchema).default([]),
  sources: z.array(entrySchema).default([]),
  predictionDelivery: z
    .object({ state: z.string(), reason: z.string().optional() })
    .optional(),
});

function probe(id: string, label: string, failures: number): SignalReading {
  const failing = failures >= FAILED_PROBES;
  return {
    id,
    label,
    level: failing ? "down" : null,
    detail: failing
      ? `${failures} Prüfungen hintereinander fehlgeschlagen`
      : undefined,
  };
}

export function readSignals(input: {
  healthFailures: number;
  websiteFailures: number;
  databaseFailures: number;
  reportFresh: boolean;
  staleChecks: number;
  report: unknown;
}): SignalSet {
  const apiFailing = input.healthFailures >= FAILED_PROBES;
  const signals: SignalReading[] = [
    probe("health", "API /health", input.healthFailures),
    probe("website", "Website oeffigo.app", input.websiteFailures),
    {
      ...probe("database", "Status-Datenbank", input.databaseFailures),
      detail:
        input.databaseFailures >= FAILED_PROBES
          ? "Messungen können nicht gespeichert werden"
          : undefined,
    },
    {
      id: "report",
      label: "Betriebsbericht /v1/status",
      // A down API already explains a missing report.
      level:
        !apiFailing && input.staleChecks >= FAILED_PROBES ? "degraded" : null,
      detail:
        !apiFailing && input.staleChecks >= FAILED_PROBES
          ? "Kein gültiger, frischer Bericht seit mehreren Prüfungen"
          : undefined,
    },
  ];
  // Without a fresh report every entry would be a guess; the report signal covers that.
  if (!input.reportFresh) return { signals, complete: false };
  const parsed = reportSchema.safeParse(input.report);
  if (!parsed.success) return { signals, complete: false };
  const { components, router, predictionDelivery } = parsed.data;
  for (const entry of components) {
    const level = levelOf(entry.status);
    signals.push({
      id: `component:${entry.id}`,
      label: entry.name ?? entry.id,
      level: CORE_COMPONENTS.has(entry.id) || level === "down" ? level : null,
      detail: entry.detail,
    });
  }
  // Providers are other people's systems and cover for each other. A single one
  // failing is their bad day, not ours; the federation being gone is an outage.
  const levels = router.map((entry) => levelOf(entry.status));
  const allGone = levels.length > 0 && levels.every((level) => level !== null);
  signals.push({
    id: "providers",
    label: "Provider-Verbund",
    level: allGone ? "down" : null,
    detail: allGone
      ? `Kein Provider erreichbar: ${router.map((entry) => entry.name ?? entry.id).join(", ")}`
      : undefined,
  });
  // Sources repeat what components and providers already say, so they stay off
  // the alert path entirely; the public page keeps showing them.
  if (predictionDelivery)
    signals.push({
      id: "prediction-delivery",
      label: "Auslieferung Live-Prognosen",
      level: predictionDelivery.state === "degraded" ? "degraded" : null,
      detail: predictionDelivery.reason,
    });
  return { signals, complete: true };
}

function checksNeeded(current: AlertLevel | null, next: AlertLevel | null) {
  if (next === null)
    return current === "down" ? CONFIRM.down : CONFIRM.recovered;
  return next === "down" ? CONFIRM.down : CONFIRM.degraded;
}

function isMuted(entry: SignalMemory, now: number) {
  return entry.mutedUntil !== undefined && Date.parse(entry.mutedUntil) > now;
}

/** Confirms level changes and returns what is worth telling the operator. */
export function evaluateAlerts(
  memory: AlertMemory,
  set: SignalSet,
  now: number,
): { memory: AlertMemory; events: AlertEvent[] } {
  const next: AlertMemory = { ...memory };
  const events: AlertEvent[] = [];
  const at = new Date(now).toISOString();
  const readings = [...set.signals];
  if (set.complete) {
    const seen = new Set(readings.map((signal) => signal.id));
    for (const [id, known] of Object.entries(memory))
      if (fromReport(id) && !seen.has(id))
        readings.push({ id, label: known.label, level: null });
  }
  for (const signal of readings) {
    const known = memory[signal.id];
    if (!known) {
      // A brand-new signal starts from "fine" so an existing problem is still reported once.
      next[signal.id] = {
        level: null,
        since: at,
        label: signal.label,
        pending:
          signal.level === null ? undefined : { level: signal.level, count: 1 },
      };
      continue;
    }
    if (known.level === signal.level) {
      next[signal.id] = { ...known, label: signal.label, pending: undefined };
      continue;
    }
    const count =
      known.pending?.level === signal.level ? known.pending.count + 1 : 1;
    if (count < checksNeeded(known.level, signal.level)) {
      next[signal.id] = { ...known, pending: { level: signal.level, count } };
      continue;
    }
    const entry: SignalMemory = {
      ...known,
      level: signal.level,
      since: at,
      label: signal.label,
      pending: undefined,
    };
    if (signal.level === null) {
      if (entry.told && !isMuted(entry, now))
        events.push({
          kind: "recovered",
          id: signal.id,
          label: signal.label,
          since: known.since,
        });
      entry.told = undefined;
      // A signal that stayed quiet through its mute starts over.
      if (!isMuted(entry, now)) entry.mutedUntil = undefined;
    } else {
      const escalated = entry.told !== "down" && signal.level === "down";
      const recent = (entry.alerts ?? []).filter(
        (stamp) => now - Date.parse(stamp) < MUTE_WINDOW_MS,
      );
      const quiet = recent.some((stamp) => now - Date.parse(stamp) < QUIET_MS);
      if (escalated || (!isMuted(entry, now) && !quiet)) {
        const alerts = [...recent, at];
        const muted = alerts.length >= MUTE_AFTER;
        if (muted) entry.mutedUntil = new Date(now + MUTE_MS).toISOString();
        entry.alerts = alerts;
        entry.told = signal.level;
        events.push({ kind: "problem", ...signal, level: signal.level, muted });
      } else {
        entry.alerts = recent;
      }
    }
    next[signal.id] = entry;
  }
  if (set.complete)
    for (const [id, entry] of Object.entries(next))
      if (
        fromReport(id) &&
        entry.level === null &&
        !entry.pending &&
        !entry.told &&
        !isMuted(entry, now) &&
        !set.signals.some((signal) => signal.id === id)
      )
        delete next[id];
  return { memory: next, events };
}

const clock = new Intl.DateTimeFormat("de-AT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Vienna",
});

function duration(since: string, now: number) {
  const minutes = Math.max(1, Math.round((now - Date.parse(since)) / 60_000));
  return minutes < 90 ? `${minutes} Min.` : `${Math.round(minutes / 60)} Std.`;
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain text for mail, the same message with light markup for Telegram. */
export type AlertMessage = { subject: string; text: string; html: string };

const STATUS_URL = "https://status.oeffigo.app";

function headline(down: number, degraded: number, recovered: number) {
  const parts: string[] = [];
  if (down > 0) parts.push(down === 1 ? "Ausfall" : `${down} Ausfälle`);
  if (degraded > 0)
    parts.push(
      degraded === 1 ? "Einschränkung" : `${degraded} Einschränkungen`,
    );
  if (parts.length === 0)
    return recovered === 1
      ? "Wieder in Ordnung"
      : `${recovered}× wieder in Ordnung`;
  return parts.join(" und ");
}

export function formatAlert(
  events: readonly AlertEvent[],
  now: number,
): AlertMessage {
  const problems = events.filter((event) => event.kind === "problem");
  const recovered = events.filter((event) => event.kind === "recovered");
  const down = problems.filter((event) => event.level === "down").length;
  const title = headline(down, problems.length - down, recovered.length);
  const single =
    problems.length + recovered.length === 1
      ? (problems[0]?.label ?? recovered[0]?.label)
      : undefined;
  const subject = single ? `ÖffiGo · ${title}: ${single}` : `ÖffiGo · ${title}`;

  const lines: string[] = [];
  const rich: string[] = [];
  if (problems.length > 0) {
    const icon = down > 0 ? "🔴" : "🟠";
    lines.push(`${icon} ${title}`, "");
    rich.push(`${icon} <b>${escape(title)}</b>`, "");
    for (const event of problems) {
      const mark = event.level === "down" ? "Ausfall" : "Eingeschränkt";
      lines.push(`${mark}: ${event.label} · seit ${clock.format(now)}`);
      rich.push(
        `${mark}: <b>${escape(event.label)}</b> · seit ${clock.format(now)}`,
      );
      if (event.detail) {
        lines.push(`   ${event.detail}`);
        rich.push(`   ${escape(event.detail)}`);
      }
      if (event.muted) {
        const note = "Meldet sich wiederholt — 24 Std. stumm.";
        lines.push(`   ${note}`);
        rich.push(`   ${escape(note)}`);
      }
    }
  }
  if (recovered.length > 0) {
    if (problems.length > 0) {
      lines.push("");
      rich.push("");
    } else {
      lines.push("✅ Wieder in Ordnung", "");
      rich.push("✅ <b>Wieder in Ordnung</b>", "");
    }
    for (const event of recovered) {
      const line = `${problems.length > 0 ? "✅ Wieder in Ordnung: " : ""}${event.label} · nach ${duration(event.since, now)}`;
      lines.push(line);
      rich.push(escape(line));
    }
  }
  lines.push("", STATUS_URL);
  rich.push("", STATUS_URL);
  return { subject, text: lines.join("\n"), html: rich.join("\n") };
}

/** First message on a newly configured channel, so delivery is proven before an outage. */
export function formatWelcome(memory: AlertMemory, now: number): AlertMessage {
  const open = Object.values(memory).filter((entry) => entry.level !== null);
  const lines = [
    "ÖffiGo-Alarme sind aktiv.",
    "",
    "Sofort: Ausfälle von API, Website, Status-Datenbank oder Betriebsbericht.",
    "Nach 15 Minuten: Einschränkungen dieser Kernsignale.",
    "Still: einzelne Datenquellen und fremde Provider — sie stehen auf der Statusseite.",
    "Wiederholt sich ein Signal, wird es für 24 Std. stummgeschaltet.",
  ];
  const rich = [
    "<b>ÖffiGo-Alarme sind aktiv.</b>",
    "",
    "Sofort: Ausfälle von API, Website, Status-Datenbank oder Betriebsbericht.",
    "Nach 15 Minuten: Einschränkungen dieser Kernsignale.",
    "Still: einzelne Datenquellen und fremde Provider — sie stehen auf der Statusseite.",
    "Wiederholt sich ein Signal, wird es für 24 Std. stummgeschaltet.",
  ];
  if (open.length > 0) {
    lines.push("", "Aktuell offen:");
    rich.push("", "<b>Aktuell offen:</b>");
    for (const entry of open) {
      const line = `${entry.level === "down" ? "🔴 Ausfall" : "🟠 Eingeschränkt"}: ${entry.label} · seit ${duration(entry.since, now)}`;
      lines.push(line);
      rich.push(escape(line));
    }
  }
  lines.push("", STATUS_URL);
  rich.push("", STATUS_URL);
  return {
    subject: "ÖffiGo · Alarme aktiv",
    text: lines.join("\n"),
    html: rich.join("\n"),
  };
}
