"use client";

import {
  StatusBlocksI18nProvider,
  useStatusBlocksLabels,
} from "@openstatus/ui/components/blocks/status-i18n";
import type {
  StatusBarData,
  StatusType,
} from "@openstatus/ui/components/blocks/status.types";
import {
  reportResolvedAt,
  statusColors,
} from "@openstatus/ui/components/blocks/status.utils";
import { Skeleton } from "@openstatus/ui/components/ui/skeleton";
import { cn } from "@openstatus/ui/lib/utils";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Link } from "../../../../../components/common/link";
import { ProcessMessage } from "../../../../../components/content/process-message";
import { SubscribeUpdates } from "../../../../../components/nav/header";
import { StatusBar } from "../../../../../components/status-page/status-bar";
import {
  StatusEventTimelineMaintenance,
  StatusEventTimelineReport,
} from "../../../../../components/status-page/status-events";
import { usePathnamePrefix } from "../../../../../hooks/use-pathname-prefix";
import {
  type Bucket,
  type Level,
  type Range,
  ranges,
} from "../../../../../lib/oeffigo/availability";
import { durationLabel } from "../../../../../lib/oeffigo/event-duration";
import {
  type GroupId,
  type SourceRow,
  REGION_NAMES,
  serviceGroups,
  sourceRows,
  sourceSlotId,
} from "../../../../../lib/oeffigo/groups";
import {
  localizeMaintenance,
  localizeReport,
} from "../../../../../lib/oeffigo/incident-copy";
import {
  expireSnapshot,
  headline,
  isPaused,
  MAX_AGE_MS,
  mergeManualStatus,
  serviceLabel,
  type Headline,
  type MergedService,
  type ServiceState,
  type StatusData,
  worst,
} from "../../../../../lib/oeffigo/model";
import type { Preview } from "../../../../../lib/oeffigo/preview";
import { railHtml } from "../../../../../lib/oeffigo/rail";
import { useEnglishCopy } from "../../../../../lib/oeffigo/use-english-copy";
import { formatDateRange } from "../../../../../lib/oeffigo/vienna-time";
import { updatesWithImpactChanges } from "../../../../../lib/report-impacts";
import { useTRPC } from "../../../../../lib/trpc/client";
import { OutsideSection } from "./outside-section";

import "../../../../../lib/oeffigo/rail.css";

type Locale = "de" | "en";

const copy = {
  de: {
    state: {
      operational: "Verfügbar",
      degraded: "Eingeschränkt",
      down: "Unterbrochen",
      unknown: "Nicht bestätigt",
      paused: "Pausiert",
    },
    maintenance: "Wartung",
    note: {
      no_demand: "Keine aktuelle Nachfrage",
      sparse_data: "Zu wenig aktuelle Daten",
      in_development: "In Entwicklung",
    },
    scope: {
      positions_paused: "Fahrzeugpositionen werden derzeit nicht angezeigt.",
      wien_only: "Die Meldungsliste deckt derzeit nur Wien ab.",
    },
    scopeMore: "Mehr in den Meldungen",
    and: "und",
    headline: {
      operational: (paused: boolean) =>
        paused ? "Alles läuft" : "Alle Funktionen verfügbar",
      no_known_issues: () => "Keine bekannten Störungen",
      unconfirmed: () => "Status gerade nicht bestätigt",
      maintenance: () => "Wartung läuft",
      degraded: (names: string) => `Einschränkungen bei ${names}`,
      down: (names: string) => `Störung bei ${names}`,
    },
    functionsCount: (n: number) => `${n} Funktionen`,
    lead: {
      operational: (n: number) =>
        `Alle ${n} Funktionen sind bestätigt verfügbar.`,
      paused: (active: number, paused: number, names: string) =>
        `${active} Funktionen verfügbar, ${paused} pausiert: ${names}.`,
      pausedTail: (names: string) => `Pausiert: ${names}.`,
      noKnownIssues: (confirmed: number, n: number) =>
        confirmed === 1
          ? `1 von ${n} Funktionen ist bestätigt verfügbar.`
          : `${confirmed} von ${n} Funktionen sind bestätigt verfügbar.`,
      unconfirmed: (open: number, n: number) =>
        open === 1
          ? `1 von ${n} Funktionen konnte zuletzt nicht bestätigt werden.`
          : `${open} von ${n} Funktionen konnten zuletzt nicht bestätigt werden.`,
      maintenance: (names: string) => `Geplante Arbeiten betreffen ${names}.`,
      affected: (names: string | null) =>
        names
          ? `Betroffen sind ${names}. Die anderen Funktionen laufen normal.`
          : "Die anderen Funktionen laufen normal.",
      seeReport: "Was wir wissen, steht in der Meldung darunter.",
      unavailable:
        "Die Messdaten sind gerade nicht erreichbar. Veröffentlichte Meldungen siehst du trotzdem.",
    },
    checkedJustNow: "Gerade eben geprüft",
    checkedAgo: (ago: string) => `Zuletzt geprüft ${ago}`,
    noCurrentCheck: "Keine aktuelle Prüfung",
    vienna:
      "Echtzeitdaten in Wien sind eingeschränkt. Fahrplanzeiten und andere Regionen können weiterhin verfügbar sein.",
    functions: "Funktionen",
    sources: "Datenquellen",
    realtimeGaps: (regions: string) =>
      `Weniger Echtzeit als sonst: ${regions}. Dort steht oft nur der Fahrplan.`,
    apiRow: {
      title: "ÖffiGo-API",
      description: "Die Schnittstelle hinter App, Website und Assistenten.",
    },
    level: {
      operational: "Verfügbar",
      degraded: "Eingeschränkt",
      partial: "Teilausfall",
      down: "Unterbrochen",
      paused: "Pausiert",
      unknown: "Nicht bestätigt",
    },
    range: {
      "24h": "24 Std.",
      "7d": "7 Tage",
      "30d": "30 Tage",
      "90d": "90 Tage",
    },
    rangeLong: {
      "24h": "der letzten 24 Stunden",
      "7d": "der letzten 7 Tage",
      "30d": "der letzten 30 Tage",
      "90d": "der letzten 90 Tage",
    },
    rangeIn: {
      "24h": "in den letzten 24 Stunden",
      "7d": "in den letzten 7 Tagen",
      "30d": "in den letzten 30 Tagen",
      "90d": "in den letzten 90 Tagen",
    },
    rangeStart: {
      "24h": "vor 24 Std.",
      "7d": "vor 7 Tagen",
      "30d": "vor 30 Tagen",
      "90d": "vor 90 Tagen",
    },
    rangePicker: "Zeitraum",
    boardHint: (range: string) => `Zustand jetzt und Verlauf ${range}`,
    now: "jetzt",
    tracker: (range: string) => `Verlauf ${range}`,
    period: (n: number, of: number) => `Abschnitt ${n} von ${of}`,
    minutes: (n: number) =>
      n < 60
        ? `${n} Min.`
        : n % 60
          ? `${Math.floor(n / 60)} Std. ${n % 60} Min.`
          : `${n / 60} Std.`,
    noChecks: "keine Messung",
    beforeHistory: "vor Messbeginn",
    cause: "Grund",
    causes: {
      unreachable: "nicht erreichbar",
      errors: "Fehler",
      slow: "langsam",
      realtime: "weniger Echtzeit",
      report: "laut Betriebsbericht",
    },
    uptime: "Verfügbarkeit",
    noUptime: "keine Messung",
    pausedUptime: "pausiert",
    available: "verfügbar",
    summary: {
      uptime: "Verfügbarkeit",
      uptimeHint: "Schnitt der gemessenen Funktionen",
      downtime: "Ausfallzeit",
      downtimeHint: "bei der am stärksten betroffenen Funktion",
      degradedHint: (minutes: string) => `dazu ${minutes} eingeschränkt`,
      reports: "Meldungen",
      reportsHint: (range: string) => `veröffentlicht ${range}`,
      none: "–",
    },
    barHint: {
      "24h": "Ein Balken ist eine halbe Stunde.",
      "7d": "Ein Balken sind vier Stunden.",
      "30d": "Ein Balken ist ein Tag.",
      "90d": "Ein Balken ist ein Tag.",
    },
    barHintCoverage: "Grün braucht fast jede Minute eine bestätigte Prüfung.",
    historySince: (date: string) => `Messungen gibt es seit ${date}.`,
    reports: "Meldungen",
    reportLanguage: "",
    noReports: "In den letzten 7 Tagen gab es keine Meldungen oder Wartungen.",
    allEvents: "Alle Ereignisse",
    updatedAgo: (ago: string) => `aktualisiert ${ago}`,
    readReport: "Meldung öffnen",
    maintenanceNow: "Wartung läuft",
    maintenanceUpcoming: "Geplante Wartung",
    subscribeTitle: "Bei Störungen Bescheid bekommen",
    subscribeText:
      "Du bekommst eine E-Mail, wenn wir über Störungen oder Wartungen informieren. Abmelden kannst du jederzeit über den Link in der E-Mail.",
    feeds: "Lieber im Feedreader:",
    method: "So prüfen wir",
    methodItems: [
      [
        "Jede Minute",
        "Schnittstelle, Betriebsbericht und Website werden automatisch abgerufen.",
      ],
      [
        "Grün nur mit Nachweis",
        "Fehlt eine frische Bestätigung, bleibt die Funktion grau.",
      ],
      [
        "Von außen",
        "Alle fünf Minuten prüfen Messpunkte in Frankfurt und Zürich Schnittstelle, Suche, Website und Statusseite.",
      ],
      [
        "Verfügbarkeit in Prozent",
        "Von den gemessenen Minuten zählt ein Ausfall ganz, ein Teilausfall zu 30 %. Eingeschränkt senkt die Zahl nicht, Messlücken zählen nicht mit.",
      ],
    ],
  },
  en: {
    state: {
      operational: "Available",
      degraded: "Degraded",
      down: "Unavailable",
      unknown: "Unconfirmed",
      paused: "Paused",
    },
    maintenance: "Maintenance",
    note: {
      no_demand: "No recent demand",
      sparse_data: "Not enough recent data",
      in_development: "In development",
    },
    scope: {
      positions_paused: "Vehicle positions are not shown at the moment.",
      wien_only: "The alerts list currently covers Vienna only.",
    },
    scopeMore: "Read the reports",
    and: "and",
    headline: {
      operational: (paused: boolean) =>
        paused ? "Everything is running" : "All services available",
      no_known_issues: () => "No known issues",
      unconfirmed: () => "Status not confirmed right now",
      maintenance: () => "Maintenance in progress",
      degraded: (names: string) => `Reduced service for ${names}`,
      down: (names: string) => `Outage affecting ${names}`,
    },
    functionsCount: (n: number) => `${n} services`,
    lead: {
      operational: (n: number) => `All ${n} services are confirmed available.`,
      paused: (active: number, paused: number, names: string) =>
        `${active} services available, ${paused} paused: ${names}.`,
      pausedTail: (names: string) => `Paused: ${names}.`,
      noKnownIssues: (confirmed: number, n: number) =>
        confirmed === 1
          ? `1 of ${n} services is confirmed available.`
          : `${confirmed} of ${n} services are confirmed available.`,
      unconfirmed: (open: number, n: number) =>
        `${open} of ${n} services could not be confirmed in the latest check.`,
      maintenance: (names: string) => `Planned work affects ${names}.`,
      affected: (names: string | null) =>
        names
          ? `Affected: ${names}. All other services work normally.`
          : "All other services work normally.",
      seeReport: "What we know is in the report below.",
      unavailable:
        "Check results are unavailable right now. Published reports are still shown.",
    },
    checkedJustNow: "Checked just now",
    checkedAgo: (ago: string) => `Last checked ${ago}`,
    noCurrentCheck: "No current check",
    vienna:
      "Real-time information in Vienna is affected. Scheduled times and other regions may remain available.",
    functions: "Services",
    sources: "Data sources",
    realtimeGaps: (regions: string) =>
      `Less real-time data than usual: ${regions}. Many trips show the timetable only.`,
    apiRow: {
      title: "ÖffiGo API",
      description: "The interface behind the app, website and assistants.",
    },
    level: {
      operational: "Available",
      degraded: "Degraded",
      partial: "Partial outage",
      down: "Unavailable",
      paused: "Paused",
      unknown: "Unconfirmed",
    },
    range: {
      "24h": "24 h",
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
    },
    rangeLong: {
      "24h": "the last 24 hours",
      "7d": "the last 7 days",
      "30d": "the last 30 days",
      "90d": "the last 90 days",
    },
    rangeIn: {
      "24h": "the last 24 hours",
      "7d": "the last 7 days",
      "30d": "the last 30 days",
      "90d": "the last 90 days",
    },
    rangeStart: {
      "24h": "24 h ago",
      "7d": "7 days ago",
      "30d": "30 days ago",
      "90d": "90 days ago",
    },
    rangePicker: "Time range",
    boardHint: (range: string) => `Current state and ${range}`,
    now: "now",
    tracker: (range: string) => `History of ${range}`,
    period: (n: number, of: number) => `Period ${n} of ${of}`,
    minutes: (n: number) =>
      n < 60
        ? `${n} min`
        : n % 60
          ? `${Math.floor(n / 60)} h ${n % 60} min`
          : `${n / 60} h`,
    noChecks: "no measurement",
    beforeHistory: "before measurements began",
    cause: "Why",
    causes: {
      unreachable: "unreachable",
      errors: "errors",
      slow: "slow",
      realtime: "less real-time",
      report: "service report",
    },
    uptime: "Availability",
    noUptime: "no measurement",
    pausedUptime: "paused",
    available: "available",
    summary: {
      uptime: "Availability",
      uptimeHint: "average of measured services",
      downtime: "Downtime",
      downtimeHint: "for the most affected service",
      degradedHint: (minutes: string) => `plus ${minutes} degraded`,
      reports: "Reports",
      reportsHint: (range: string) => `published in ${range}`,
      none: "–",
    },
    barHint: {
      "24h": "Each bar is half an hour.",
      "7d": "Each bar is four hours.",
      "30d": "Each bar is one day.",
      "90d": "Each bar is one day.",
    },
    barHintCoverage: "Green needs a confirmed check almost every minute.",
    historySince: (date: string) => `Measurements started on ${date}.`,
    reports: "Reports",
    reportLanguage: "Some incident details are still published in German.",
    noReports: "No reports or maintenance in the last 7 days.",
    allEvents: "All events",
    updatedAgo: (ago: string) => `updated ${ago}`,
    readReport: "Open report",
    maintenanceNow: "Maintenance in progress",
    maintenanceUpcoming: "Scheduled maintenance",
    subscribeTitle: "Get notified about incidents",
    subscribeText:
      "We email you when we publish an incident or maintenance update. Every email has a link to unsubscribe.",
    feeds: "Prefer a feed reader?",
    method: "How we check",
    methodItems: [
      [
        "Every minute",
        "The app’s API, its service report and the website are checked automatically.",
      ],
      [
        "Green needs evidence",
        "Without a fresh confirmation, a service stays grey.",
      ],
      [
        "From outside",
        "Every five minutes, probes in Frankfurt and Zurich check the API, search, website and this page.",
      ],
      [
        "Availability in percent",
        "Of the measured minutes, an outage counts fully and a partial outage at 30 %. Degraded service does not lower it, and gaps are not counted.",
      ],
    ],
  },
} as const;

const toneVar: Record<Headline, string> = {
  operational: "var(--success)",
  no_known_issues: "var(--success)",
  unconfirmed: "var(--muted-foreground)",
  maintenance: "var(--info)",
  degraded: "var(--warning)",
  down: "var(--destructive)",
};

const stateClass: Record<ServiceState, string> = {
  operational: "text-success",
  degraded: "text-warning",
  down: "text-destructive",
  paused: "text-info",
  unknown: "text-muted-foreground",
};

const cardLevels = [
  "down",
  "partial",
  "degraded",
  "paused",
  "operational",
  "unknown",
] as const satisfies readonly Level[];

const legend = [
  "operational",
  "degraded",
  "down",
  "paused",
  "unknown",
] as const;

// Announced work shows up top a week ahead instead of below the past reports.
const UPCOMING_MAINTENANCE_MS = 7 * 24 * 60 * 60_000;

function barStatus(state: ServiceState): StatusType {
  switch (state) {
    case "operational":
      return "success";
    case "degraded":
      return "degraded";
    case "down":
      return "error";
    case "paused":
      return "info";
    case "unknown":
      return "empty";
  }
}

function levelBar(level: Level): StatusType {
  return level === "partial" ? "degraded" : barStatus(level);
}

// Rounded down, so 99.996 % never shows as a clean 100 %.
function formatUptime(locale: Locale, value: number) {
  const floored = Math.floor(value * 10_000) / 10_000;
  return new Intl.NumberFormat(locale === "de" ? "de-AT" : "en-GB", {
    style: "percent",
    minimumFractionDigits: floored === 1 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(floored);
}

function mostlyPaused(buckets: Bucket[] | undefined) {
  let paused = 0;
  let measured = 0;
  for (const b of buckets ?? []) {
    paused += b.counts.paused;
    measured +=
      b.counts.operational +
      b.counts.degraded +
      b.counts.partial +
      b.counts.down;
  }
  return paused > measured;
}

function formatShortDay(locale: Locale, date: Date) {
  return date.toLocaleDateString(locale === "de" ? "de-AT" : "en-GB", {
    timeZone: "Europe/Vienna",
    day: "numeric",
    month: "short",
  });
}

function formatDay(locale: Locale, date: Date) {
  return date.toLocaleDateString(locale === "de" ? "de-AT" : "en-GB", {
    timeZone: "Europe/Vienna",
    day: "numeric",
    month: "long",
  });
}

function useClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Rendered only after mount, so the viewer's own time zone is safe here.
function formatTime(locale: Locale, date: Date) {
  return date.toLocaleTimeString(locale === "de" ? "de-AT" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(locale: Locale, from: number, now: number) {
  const minutes = Math.max(1, Math.floor((now - from) / 60_000));
  const format = new Intl.RelativeTimeFormat(
    locale === "de" ? "de-AT" : "en-GB",
  );
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 48 * 60)
    return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / 1440), "day");
}

function listNames(locale: Locale, names: string[]) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${copy[locale].and} ${names.at(-1)}`;
}

function joinNames(locale: Locale, names: string[]) {
  if (names.length > 2) return copy[locale].functionsCount(names.length);
  return names.join(` ${copy[locale].and} `);
}

type Reading = Pick<MergedService, "state" | "maintenance" | "note">;

function stateLabel(locale: Locale, service: Reading) {
  if (service.maintenance) return copy[locale].maintenance;
  if (
    (service.state === "unknown" || service.state === "paused") &&
    service.note
  )
    return copy[locale].note[service.note];
  return copy[locale].state[service.state];
}

function eventTone(status: StatusType) {
  if (status === "error") return "var(--destructive)";
  if (status === "info") return "var(--info)";
  return "var(--warning)";
}

export function Client({
  preview,
}: {
  /** Nur /proto/seite: Testdaten statt Abfragen. */
  preview?: Preview;
} = {}) {
  const locale: Locale = useLocale() === "de" ? "de" : "en";
  const text = copy[locale];
  const labels = useStatusBlocksLabels();
  const trpc = useTRPC();
  const { domain } = useParams<{ domain: string }>();
  const prefix = usePathnamePrefix();
  const now = useClock();
  const [range, setRange] = useState<Range>("24h");
  const [opened, setOpened] = useState<Partial<Record<GroupId, boolean>>>({});

  const { data: page, isError: pageError } = useQuery({
    ...trpc.statusPage.get.queryOptions({ slug: domain }),
    enabled: !preview,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const englishCopy = useEnglishCopy(page?.slug);
  const statusReports =
    page?.statusReports.map((report) => localizeReport(report, englishCopy)) ??
    [];
  const maintenances =
    page?.maintenances.map((maintenance) =>
      localizeMaintenance(maintenance, englishCopy),
    ) ?? [];
  const { data, isError: statusError } = useQuery<StatusData>({
    queryKey: ["oeffigo-status", range],
    placeholderData: keepPreviousData,
    queryFn: () => fetchStatus(range),
    enabled: !preview,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  // The other ranges load behind the first one, so the picker switches without waiting.
  const queryClient = useQueryClient();
  const firstLoaded = data != null;
  useEffect(() => {
    if (!firstLoaded || preview) return;
    for (const other of ranges) {
      void queryClient.prefetchQuery({
        queryKey: ["oeffigo-status", other],
        queryFn: () => fetchStatus(other),
        staleTime: 60_000,
      });
    }
  }, [firstLoaded, preview, queryClient]);

  const loading =
    now === null || (!page && !pageError) || (!data && !statusError);
  const snapshot = data && now ? expireSnapshot(data.snapshot, now) : undefined;
  const merged = mergeManualStatus(
    snapshot,
    page?.trackers,
    now ?? 0,
    !pageError,
  );
  const services = merged.services;
  const state = headline(services);
  const name = (s: MergedService) => (locale === "de" ? s.de : s.en);
  const affected = services.filter((s) => s.state === state);
  // Bewusst ausgeschaltete Funktionen zählen weder als verfügbar noch als offen.
  const pausedServices = services.filter(isPaused);
  const active = services.length - pausedServices.length;
  const pausedNames = listNames(locale, pausedServices.map(name));
  const confirmed = services.filter(
    (s) => s.state === "operational" && !s.maintenance,
  ).length;
  const checkedAt = snapshot ? Date.parse(snapshot.checkedAt) : Number.NaN;
  const checkCurrent =
    !statusError && now !== null && now - checkedAt <= MAX_AGE_MS;
  const feedBase = prefix ? `/${prefix}` : "";
  const eventsHref = `${feedBase}/events`;

  const apiReading: Reading = {
    state: loading ? "unknown" : (snapshot?.api ?? "unknown"),
    maintenance: false,
    note: undefined,
  };
  const sources = loading ? [] : sourceRows(snapshot?.sources);
  const groups = [
    ...serviceGroups.map((group) => {
      const members = group.services.flatMap((id) =>
        services.filter((s) => s.id === id),
      );
      return makeGroup(
        group.id,
        locale === "de" ? group.de : group.en,
        [
          ...(group.id === "api" ? [text.apiRow.title] : []),
          ...members.map(name),
        ],
        [
          ...(group.id === "api" ? [apiReading.state] : []),
          ...members.map((s) => s.state),
        ],
        members,
        [],
        data?.history,
      );
    }),
    ...(sources.length
      ? [
          makeGroup(
            "sources",
            text.sources,
            sources.map((s) => s.label),
            sources.map((s) => s.state),
            [],
            sources,
            data?.history,
          ),
        ]
      : []),
  ];
  // Die Schiene hat vier Halte, einen je Gruppe; ohne Datenquellen bleibt sie weg.
  const rail =
    !loading && groups.length === 4
      ? railHtml(groups, { stateLabels: text.state })
      : null;

  const openEvents = page?.openEvents.filter((e) => e.type !== "incident");
  // Laufendes steht oben als Karte und nicht noch einmal in der Liste darunter.
  const openIds = new Set(openEvents?.map((e) => `${e.type}-${e.id}`) ?? []);
  const openReport = openEvents?.some((e) => e.type === "report") ?? false;
  const upcomingMaintenances = now
    ? maintenances
        .filter(
          (m) =>
            m.from.getTime() > now &&
            m.from.getTime() - now <= UPCOMING_MAINTENANCE_MS,
        )
        .toSorted((a, b) => a.from.getTime() - b.from.getTime())
    : [];
  const recentReports = statusReports.filter(
    (report) =>
      report.statusReportUpdates.length > 0 &&
      page?.lastEvents.some((e) => e.type === "report" && e.id === report.id),
  );
  const recentMaintenances = maintenances.filter((maintenance) =>
    page?.lastEvents.some(
      (e) => e.type === "maintenance" && e.id === maintenance.id,
    ),
  );

  const firstBucket = data?.history.buckets.departures?.[0];
  const rangeStartAt = firstBucket ? Date.parse(firstBucket.start) : 0;
  const historyStart = data?.history.since
    ? Date.parse(data.history.since)
    : null;
  // Reports and maintenance per function, so a bar's card names what was going on then.
  const barEvents = (componentId: number): BarEvent[] => [
    ...statusReports
      .filter((r) =>
        r.statusReportsToPageComponents.some(
          (c) => c.pageComponent.id === componentId,
        ),
      )
      .flatMap((r) => {
        const dates = r.statusReportUpdates.map((u) => u.date.getTime());
        if (dates.length === 0) return [];
        return [
          {
            id: r.id,
            name: r.title,
            type: "report" as const,
            from: new Date(Math.min(...dates)),
            to: reportResolvedAt(r.statusReportUpdates),
          },
        ];
      }),
    ...maintenances
      .filter((m) =>
        m.maintenancesToPageComponents.some(
          (c) => c.pageComponent.id === componentId,
        ),
      )
      .map((m) => ({
        id: m.id,
        name: m.title,
        type: "maintenance" as const,
        from: m.from,
        to: m.to,
      })),
  ];

  const lead = (() => {
    if (statusError) return text.lead.unavailable;
    switch (state) {
      case "operational":
        return pausedServices.length
          ? text.lead.paused(active, pausedServices.length, pausedNames)
          : text.lead.operational(active);
      case "no_known_issues":
        return [
          text.lead.noKnownIssues(confirmed, active),
          ...services
            .filter((s) => s.note && !isPaused(s))
            .map((s) => {
              const label = stateLabel(locale, s);
              return `${name(s)}: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
            }),
          ...(pausedServices.length ? [text.lead.pausedTail(pausedNames)] : []),
        ].join(" ");
      case "unconfirmed":
        return text.lead.unconfirmed(active - confirmed, active);
      case "maintenance":
        return text.lead.maintenance(
          joinNames(locale, services.filter((s) => s.maintenance).map(name)),
        );
      case "degraded":
      case "down":
        // Die Überschrift fasst ab drei Funktionen zu einer Zahl zusammen; dann
        // nennt der Satz darunter sie beim Namen.
        return `${text.lead.affected(
          affected.length > 2 ? listNames(locale, affected.map(name)) : null,
        )}${openReport ? ` ${text.lead.seeReport}` : ""}`;
    }
  })();

  return (
    <div
      className="flex flex-col gap-8 sm:gap-10"
      style={
        {
          "--og-tone": loading ? "transparent" : toneVar[state],
        } as React.CSSProperties
      }
    >
      <section
        aria-labelledby="status-headline"
        aria-live="polite"
        className="pt-10 sm:pt-14"
      >
        {loading ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-8 w-56 rounded-full" />
            <Skeleton className="h-14 w-full max-w-2xl" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-5">
            <span className="bg-background/60 text-muted-foreground inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm backdrop-blur">
              <span
                className={cn(
                  "size-2 rounded-full",
                  checkCurrent && "og-pulse",
                )}
                style={{
                  backgroundColor: checkCurrent
                    ? "var(--og-tone)"
                    : "var(--muted-foreground)",
                }}
              />
              {!checkCurrent
                ? text.noCurrentCheck
                : now - checkedAt < 60_000
                  ? text.checkedJustNow
                  : text.checkedAgo(relativeTime(locale, checkedAt, now))}
            </span>
            <h1
              id="status-headline"
              className="max-w-3xl text-[clamp(2rem,4.2vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-balance"
            >
              {state === "degraded" || state === "down"
                ? text.headline[state](joinNames(locale, affected.map(name)))
                : state === "operational"
                  ? text.headline.operational(pausedServices.length > 0)
                  : text.headline[state]()}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-base leading-relaxed text-pretty sm:text-lg">
              {lead}
            </p>
          </div>
        )}
        {rail ? (
          <div
            className="mt-8 sm:mt-10"
            // eigenes Markup aus railHtml, keine Nutzereingabe
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: rail }}
          />
        ) : null}
      </section>

      {snapshot &&
      (snapshot.viennaRealtime === "degraded" ||
        snapshot.viennaRealtime === "down") ? (
        <p className="bg-card border-warning/40 rounded-xl border px-5 py-4 text-sm">
          {text.vienna}
        </p>
      ) : null}

      {page && openEvents && openEvents.length > 0 ? (
        <section className="grid gap-4">
          {openEvents.map((event) => {
            const tone = eventTone(event.status);
            const card =
              "bg-card hover:bg-accent/40 group block rounded-xl border p-5 transition-colors sm:p-6";
            const border = {
              borderColor: `color-mix(in oklab, ${tone} 45%, var(--border))`,
            };
            if (event.type === "report") {
              const report = statusReports.find((r) => r.id === event.id);
              const latest = report?.statusReportUpdates.toSorted(
                (a, b) => b.date.getTime() - a.date.getTime(),
              )[0];
              if (!report || !latest) return null;
              return (
                <Link
                  key={`report-${report.id}`}
                  variant="unstyled"
                  href={`${eventsHref}/report/${report.id}`}
                  className={card}
                  style={border}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: tone }}
                    />
                    <span className="font-medium" style={{ color: tone }}>
                      {labels.incidentStatus[latest.status]}
                    </span>
                    {now ? (
                      <span className="text-muted-foreground">
                        {text.updatedAgo(
                          relativeTime(locale, latest.date.getTime(), now),
                        )}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                    {report.title}
                  </h2>
                  <div className="text-muted-foreground mt-2 line-clamp-3">
                    <ProcessMessage value={latest.message} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {report.statusReportsToPageComponents.map((c) => (
                      <span
                        key={c.pageComponent.id}
                        className="bg-muted rounded-full px-2.5 py-1 text-xs"
                      >
                        {serviceLabel(
                          c.pageComponent.id,
                          locale,
                          c.pageComponent.name,
                        )}
                      </span>
                    ))}
                    <span className="ml-auto text-sm font-medium underline-offset-4 group-hover:underline">
                      {text.readReport}
                    </span>
                  </div>
                </Link>
              );
            }
            const maintenance = maintenances.find((m) => m.id === event.id);
            if (!maintenance) return null;
            return (
              <Link
                key={`maintenance-${maintenance.id}`}
                variant="unstyled"
                href={`${eventsHref}/maintenance/${maintenance.id}`}
                className={card}
                style={border}
              >
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tone }}
                  />
                  <span className="font-medium" style={{ color: tone }}>
                    {text.maintenanceNow}
                  </span>
                  {now ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatTime(locale, maintenance.from)}–
                      {formatTime(locale, maintenance.to)}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  {maintenance.title}
                </h2>
                <div className="text-muted-foreground mt-2 line-clamp-3">
                  <ProcessMessage value={maintenance.message} />
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}

      {upcomingMaintenances.length > 0 ? (
        <section className="grid gap-3">
          {upcomingMaintenances.map((maintenance) => (
            <Link
              key={`upcoming-${maintenance.id}`}
              variant="unstyled"
              href={`${eventsHref}/maintenance/${maintenance.id}`}
              className="bg-card hover:bg-accent/40 group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-5 py-4 transition-colors sm:px-6"
            >
              <span className="text-info flex items-center gap-2 text-sm font-medium">
                <span className="bg-info size-2 rounded-full" />
                {text.maintenanceUpcoming}
              </span>
              <span className="font-medium">{maintenance.title}</span>
              <span className="text-muted-foreground text-sm sm:ml-auto">
                {formatDateRange(maintenance.from, maintenance.to, locale)}
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      <section
        aria-labelledby="functions-title"
        className="bg-card rounded-xl border"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="functions-title" className="text-lg font-semibold">
              {text.functions}
            </h2>
            <p className="text-muted-foreground text-sm">
              {text.boardHint(text.rangeLong[range])}
            </p>
          </div>
          <RangePicker locale={locale} value={range} onChange={setRange} />
          <ul className="text-muted-foreground flex w-full flex-wrap gap-x-4 gap-y-1 text-xs">
            {legend.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-2.5 rounded-sm",
                    item === "unknown" && "bg-muted-foreground/40",
                  )}
                  style={{
                    backgroundColor:
                      item === "unknown"
                        ? undefined
                        : statusColors[barStatus(item)],
                  }}
                />
                {text.state[item]}
              </li>
            ))}
          </ul>
        </div>
        <RangeSummary
          locale={locale}
          range={range}
          history={data?.history}
          reports={
            statusReports.filter((r) => {
              if (!r.statusReportUpdates.length || !rangeStartAt) return false;
              const end =
                reportResolvedAt(r.statusReportUpdates)?.getTime() ??
                Number.POSITIVE_INFINITY;
              return end > rangeStartAt;
            }).length
          }
        />
        <HistoryLabels locale={locale} range={range}>
          <ul className="divide-y">
            {groups.map((group) => {
              const open = opened[group.id] ?? group.attention;
              const listId = `group-${group.id}`;
              const only =
                group.members.length === 1 && group.id !== "api"
                  ? group.members[0]
                  : null;
              if (only)
                return (
                  <FunctionRow
                    key={group.id}
                    inset
                    title={group.title}
                    description={
                      locale === "de" ? only.description : only.descriptionEn
                    }
                    state={(className) => (
                      <StateLabel
                        className={className}
                        loading={loading}
                        locale={locale}
                        service={only}
                        uptime={data?.history.uptime[only.id]}
                        mostlyPaused={mostlyPaused(
                          data?.history.buckets[only.id],
                        )}
                        range={range}
                      />
                    )}
                    history={
                      <ServiceHistory
                        locale={locale}
                        range={range}
                        buckets={data?.history.buckets[only.id]}
                        since={data?.history.since ?? null}
                        events={barEvents(only.componentId)}
                      />
                    }
                  />
                );
              return (
                <li key={group.id}>
                  <GroupRow
                    title={group.title}
                    summary={group.summary}
                    open={open}
                    controls={listId}
                    onToggle={() =>
                      setOpened((prev) => ({ ...prev, [group.id]: !open }))
                    }
                    state={(className) => (
                      <StateLabel
                        className={className}
                        loading={loading}
                        locale={locale}
                        service={{
                          state: group.state,
                          maintenance: false,
                          note: undefined,
                        }}
                        uptime={group.uptime}
                        mostlyPaused={false}
                        range={range}
                      />
                    )}
                    history={
                      group.buckets ? (
                        <ServiceHistory
                          locale={locale}
                          range={range}
                          buckets={group.buckets}
                          since={data?.history.since ?? null}
                          events={[]}
                        />
                      ) : undefined
                    }
                  />
                  {open ? (
                    <ul
                      id={listId}
                      className="bg-muted/30 divide-y border-t [&>li]:pl-11 sm:[&>li]:pl-12"
                    >
                      {group.id === "api" ? (
                        <FunctionRow
                          title={text.apiRow.title}
                          description={text.apiRow.description}
                          state={(className) => (
                            <StateLabel
                              className={className}
                              loading={loading}
                              locale={locale}
                              service={apiReading}
                              uptime={undefined}
                              mostlyPaused={false}
                              range={range}
                            />
                          )}
                        />
                      ) : null}
                      {group.members.map((service) => (
                        <FunctionRow
                          key={service.id}
                          title={name(service)}
                          description={
                            locale === "de"
                              ? service.description
                              : service.descriptionEn
                          }
                          note={
                            <>
                              {service.scope ? (
                                <p className="text-muted-foreground mt-1 text-sm">
                                  {text.scope[service.scope]}{" "}
                                  <Link
                                    href={eventsHref}
                                    className="underline underline-offset-2"
                                  >
                                    {text.scopeMore}
                                  </Link>
                                </p>
                              ) : null}
                              {service.realtimeGaps?.length ? (
                                <p className="text-warning mt-1 text-sm">
                                  {text.realtimeGaps(
                                    joinNames(
                                      locale,
                                      service.realtimeGaps.map(
                                        (r) => REGION_NAMES[r] ?? r,
                                      ),
                                    ),
                                  )}
                                </p>
                              ) : null}
                            </>
                          }
                          state={(className) => (
                            <StateLabel
                              className={className}
                              loading={loading}
                              locale={locale}
                              service={service}
                              uptime={data?.history.uptime[service.id]}
                              mostlyPaused={mostlyPaused(
                                data?.history.buckets[service.id],
                              )}
                              range={range}
                            />
                          )}
                          history={
                            <ServiceHistory
                              locale={locale}
                              range={range}
                              buckets={data?.history.buckets[service.id]}
                              since={data?.history.since ?? null}
                              events={barEvents(service.componentId)}
                            />
                          }
                        />
                      ))}
                      {group.sources.map((row) => (
                        <FunctionRow
                          key={row.id}
                          title={row.label}
                          description={
                            locale === "de"
                              ? row.description
                              : row.descriptionEn
                          }
                          state={(className) => (
                            <StateLabel
                              className={className}
                              loading={loading}
                              locale={locale}
                              service={{
                                state: row.state,
                                maintenance: false,
                                note: undefined,
                              }}
                              uptime={
                                data?.history.uptime[sourceSlotId(row.id)]
                              }
                              mostlyPaused={mostlyPaused(
                                data?.history.buckets[sourceSlotId(row.id)],
                              )}
                              range={range}
                            />
                          )}
                          history={
                            <ServiceHistory
                              locale={locale}
                              range={range}
                              buckets={
                                data?.history.buckets[sourceSlotId(row.id)]
                              }
                              since={data?.history.since ?? null}
                              events={[]}
                            />
                          }
                        />
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </HistoryLabels>
        <div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-2 border-t px-5 py-3 text-xs sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,30rem)_9rem]">
          <p className="order-2 md:order-1">
            {text.barHint[range]} {text.barHintCoverage}{" "}
            {historyStart && historyStart > rangeStartAt
              ? text.historySince(formatDay(locale, new Date(historyStart)))
              : null}
          </p>
          <div className="order-1 flex justify-between tabular-nums md:order-2">
            <span>{text.rangeStart[range]}</span>
            <span>{text.now}</span>
          </div>
        </div>
      </section>

      <OutsideSection locale={locale} range={range} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section
          aria-labelledby="reports-title"
          className="bg-card rounded-xl border p-5 sm:p-6"
        >
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 id="reports-title" className="text-lg font-semibold">
              {text.reports}
            </h2>
            <Link
              href={eventsHref}
              className="text-muted-foreground hover:text-foreground text-sm font-normal"
            >
              {text.allEvents}
            </Link>
          </div>
          {locale === "en" &&
          page?.slug === "oeffigo" &&
          [...recentReports, ...recentMaintenances].some((e) => e.german) ? (
            <p className="text-muted-foreground mb-4 text-sm">
              {text.reportLanguage}
            </p>
          ) : null}
          {!page ? (
            <Skeleton className="h-24 w-full" />
          ) : recentReports.length === 0 && recentMaintenances.length === 0 ? (
            <p className="text-muted-foreground">{text.noReports}</p>
          ) : (
            <ul className="-mx-5 -mb-5 divide-y border-t sm:-mx-6 sm:-mb-6">
              {[
                ...recentReports
                  .filter((r) => !openIds.has(`report-${r.id}`))
                  .map((report) => {
                    const startedAt = new Date(
                      Math.min(
                        ...report.statusReportUpdates.map((u) =>
                          u.date.getTime(),
                        ),
                      ),
                    );
                    return {
                      key: `report-${report.id}`,
                      at: startedAt,
                      title: report.title,
                      meta: durationLabel(
                        locale,
                        startedAt,
                        reportResolvedAt(report.statusReportUpdates),
                      ),
                      href: `${eventsHref}/report/${report.id}`,
                      affected: report.statusReportsToPageComponents.map((c) =>
                        serviceLabel(
                          c.pageComponent.id,
                          locale,
                          c.pageComponent.name,
                        ),
                      ),
                      body: (
                        <StatusEventTimelineReport
                          updates={updatesWithImpactChanges(report)}
                        />
                      ),
                    };
                  }),
                ...recentMaintenances
                  .filter((m) => !openIds.has(`maintenance-${m.id}`))
                  .map((maintenance) => ({
                    key: `maintenance-${maintenance.id}`,
                    at: maintenance.from,
                    title: maintenance.title,
                    meta: text.maintenance,
                    href: `${eventsHref}/maintenance/${maintenance.id}`,
                    affected: maintenance.maintenancesToPageComponents.map(
                      (c) =>
                        serviceLabel(
                          c.pageComponent.id,
                          locale,
                          c.pageComponent.name,
                        ),
                    ),
                    body: (
                      <StatusEventTimelineMaintenance
                        maintenance={maintenance}
                      />
                    ),
                  })),
              ]
                .toSorted((a, b) => b.at.getTime() - a.at.getTime())
                .map((event) => (
                  <li key={event.key}>
                    <details className="group/event">
                      <summary className="hover:bg-accent/40 focus-visible:ring-ring grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-5 py-3 focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:px-6 [&::-webkit-details-marker]:hidden">
                        <span className="text-muted-foreground col-span-2 text-xs tabular-nums sm:col-span-1 sm:pt-0.5 sm:text-sm">
                          {formatShortDay(locale, event.at)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-start gap-1.5 font-medium">
                            <ChevronRight
                              aria-hidden
                              className="text-muted-foreground mt-1 size-3.5 shrink-0 transition-transform duration-200 group-open/event:rotate-90 motion-reduce:transition-none"
                            />
                            {event.title}
                          </span>
                          {event.affected.length ? (
                            <span className="text-muted-foreground block truncate pl-5 text-sm">
                              {event.affected.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground pt-0.5 text-right text-xs tabular-nums">
                          {event.meta}
                        </span>
                      </summary>
                      <div className="px-5 pb-5 sm:pr-6 sm:pl-[calc(5.5rem+2.5rem)]">
                        {event.body}
                        <Link
                          href={event.href}
                          className="text-muted-foreground hover:text-foreground mt-3 inline-block text-sm underline underline-offset-4"
                        >
                          {text.readReport}
                        </Link>
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section
            aria-labelledby="subscribe-title"
            className="bg-card rounded-xl border p-5 sm:p-6"
          >
            <h2 id="subscribe-title" className="font-semibold">
              {text.subscribeTitle}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {text.subscribeText}
            </p>
            <SubscribeUpdates
              className="mt-4 w-full rounded-full"
              size="default"
            />
            <p className="text-muted-foreground mt-4 text-sm">
              {text.feeds}{" "}
              <a
                href={`${feedBase}/feed/rss`}
                className="hover:text-foreground underline underline-offset-4"
              >
                RSS
              </a>
              {" · "}
              <a
                href={`${feedBase}/feed/atom`}
                className="hover:text-foreground underline underline-offset-4"
              >
                Atom
              </a>
            </p>
          </section>
          <section
            aria-labelledby="method-title"
            className="rounded-xl border p-5 sm:p-6"
          >
            <h2 id="method-title" className="font-semibold">
              {text.method}
            </h2>
            <dl className="mt-3 flex flex-col gap-3 text-sm">
              {text.methodItems.map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-muted-foreground leading-relaxed">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

const levelRank: Record<Level, number> = {
  operational: 0,
  paused: 1,
  unknown: 2,
  degraded: 3,
  partial: 4,
  down: 5,
};

/** Eine ruhende Funktion färbt ihre Gruppe nicht, solange andere gemessen werden. */
function groupState(states: readonly ServiceState[]): ServiceState {
  const active = states.filter((s) => s !== "paused");
  return active.length ? worst(active) : "paused";
}

/** Je Abschnitt der schlechteste Balken der Gruppe, mit dessen Minuten. */
function groupBuckets(lists: readonly (Bucket[] | undefined)[]) {
  const present = lists.filter((l): l is Bucket[] => !!l?.length);
  const active = present.filter((l) => !mostlyPaused(l));
  const use = active.length ? active : present;
  if (!use.length) return undefined;
  return use[0].map((_, i) =>
    use
      .map((l) => l[i])
      .reduce((a, b) => (levelRank[b.level] > levelRank[a.level] ? b : a)),
  );
}

function makeGroup(
  id: GroupId,
  title: string,
  memberNames: string[],
  states: ServiceState[],
  members: MergedService[],
  sources: SourceRow[],
  history: StatusData["history"] | undefined,
) {
  const state = groupState(states);
  const historyIds = [
    ...members.map((m) => m.id),
    ...sources.map((s) => sourceSlotId(s.id)),
  ];
  const uptimes = historyIds
    .map((id) => history?.uptime[id])
    .filter((v): v is number => typeof v === "number");
  return {
    id,
    title,
    summary: memberNames.join(" · "),
    state,
    attention: state === "degraded" || state === "down",
    uptime: historyIds.length
      ? uptimes.length
        ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length
        : history
          ? null
          : undefined
      : undefined,
    buckets: historyIds.length
      ? groupBuckets(historyIds.map((id) => history?.buckets[id]))
      : undefined,
    members,
    sources,
  };
}

function GroupRow({
  title,
  summary,
  open,
  controls,
  onToggle,
  state,
  history,
}: {
  title: string;
  summary: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
  state: (className: string) => React.ReactNode;
  history?: React.ReactNode;
}) {
  return (
    // Ohne feste Spalte wächst die Zeile am Handy auf die volle Länge der
    // einzeiligen Zusammenfassung und schiebt Balken und Status über den Rand.
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-3 px-5 py-4 sm:px-6 md:items-center",
        history
          ? "md:grid-cols-[minmax(0,1fr)_minmax(16rem,30rem)_9rem]"
          : "md:grid-cols-[minmax(0,1fr)_9rem]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={controls}
          className="group/toggle focus-visible:ring-ring -m-1 flex min-w-0 flex-1 items-start gap-2 rounded-md p-1 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold group-hover/toggle:underline group-hover/toggle:underline-offset-4">
              {title}
            </span>
            {/* Eine Zeile: die Namen stehen beim Aufklappen ohnehin darunter. */}
            <span
              className="text-muted-foreground block truncate text-sm"
              title={summary}
            >
              {summary}
            </span>
          </span>
        </button>
        {state("md:hidden")}
      </div>
      {history ? <div>{history}</div> : null}
      {state("hidden md:flex")}
    </div>
  );
}

function FunctionRow({
  inset = false,
  title,
  description,
  note,
  state,
  history,
}: {
  /** Steht eine Gruppe mit nur einer Funktion als Zeile, fluchtet ihr Titel mit den Gruppentiteln. */
  inset?: boolean;
  title: string;
  description: string;
  note?: React.ReactNode;
  state: (className: string) => React.ReactNode;
  history?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-3 px-5 py-4 sm:px-6 md:items-center",
        inset && "pl-11 sm:pl-12",
        history
          ? "md:grid-cols-[minmax(0,1fr)_minmax(16rem,30rem)_9rem]"
          : "md:grid-cols-[minmax(0,1fr)_9rem]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
          {note}
        </div>
        {state("md:hidden")}
      </div>
      {history ? <div>{history}</div> : null}
      {state("hidden md:flex")}
    </li>
  );
}

function StateLabel({
  className,
  loading,
  locale,
  service,
  uptime,
  mostlyPaused,
  range,
}: {
  className?: string;
  loading: boolean;
  locale: Locale;
  service: Reading;
  uptime: number | null | undefined;
  mostlyPaused: boolean;
  range: Range;
}) {
  const text = copy[locale];
  if (loading)
    return <Skeleton className={cn("h-4 w-20 shrink-0", className)} />;
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-end gap-0.5 text-right",
        className,
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          stateClass[service.maintenance ? "paused" : service.state],
        )}
      >
        {stateLabel(locale, service)}
      </span>
      {uptime === undefined ||
      (uptime === null && mostlyPaused && service.state === "paused") ? null : (
        <span
          className="text-muted-foreground text-xs tabular-nums"
          title={`${text.uptime} ${text.rangeLong[range]}`}
        >
          {uptime !== null
            ? `${formatUptime(locale, uptime)} ${text.available}`
            : mostlyPaused
              ? text.pausedUptime
              : text.noUptime}
          <span className="sr-only">
            {` ${text.uptime} ${text.rangeLong[range]}`}
          </span>
        </span>
      )}
    </span>
  );
}

function RangeSummary({
  locale,
  range,
  history,
  reports,
}: {
  locale: Locale;
  range: Range;
  history: StatusData["history"] | undefined;
  reports: number;
}) {
  const text = copy[locale];
  // Datenquellen haben eigene Zeilen; die Kennzahlen sprechen nur über Funktionen.
  const own = <T,>(record: Record<string, T> | undefined) =>
    Object.entries(record ?? {})
      .filter(([id]) => !id.startsWith("source:"))
      .map(([, value]) => value);
  const values = own(history?.uptime).filter((v): v is number => v !== null);
  const average = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
  const downtime = Math.max(
    0,
    ...own(history?.buckets).map((buckets) =>
      buckets.reduce((sum, b) => sum + b.counts.down, 0),
    ),
  );
  // Ausfall allein ließ „0 Min." neben einer gelben Seite stehen; die
  // eingeschränkte Zeit derselben Funktion gehört daneben.
  const limited = Math.max(
    0,
    ...own(history?.buckets).map((buckets) =>
      buckets.reduce((sum, b) => sum + b.counts.degraded + b.counts.partial, 0),
    ),
  );
  const items = [
    {
      label: text.summary.uptime,
      value:
        average === null ? text.summary.none : formatUptime(locale, average),
      hint: text.summary.uptimeHint,
    },
    {
      label: text.summary.downtime,
      value: history ? text.minutes(downtime) : text.summary.none,
      hint:
        limited > 0
          ? text.summary.degradedHint(text.minutes(limited))
          : text.summary.downtimeHint,
      strong: limited > 0,
    },
    {
      label: text.summary.reports,
      value: String(reports),
      hint: text.summary.reportsHint(text.rangeIn[range]),
    },
  ];
  return (
    <dl
      aria-label={text.rangeLong[range]}
      className="grid grid-cols-3 divide-x border-b"
    >
      {items.map((item) => (
        <div key={item.label} className="px-5 py-4 sm:px-6">
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-[1.75rem]">
            {history ? item.value : <Skeleton className="h-7 w-20" />}
          </dd>
          <dd
            className={cn(
              "text-muted-foreground mt-0.5 text-xs",
              "strong" in item && item.strong
                ? "text-warning block"
                : "hidden sm:block",
            )}
          >
            {item.hint}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RangePicker({
  locale,
  value,
  onChange,
}: {
  locale: Locale;
  value: Range;
  onChange: (range: Range) => void;
}) {
  const text = copy[locale];
  return (
    <div
      role="group"
      aria-label={text.rangePicker}
      className="bg-muted inline-flex rounded-lg p-0.5 text-sm"
    >
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium tabular-nums transition-colors",
            value === range
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {text.range[range]}
        </button>
      ))}
    </div>
  );
}

type BarEvent = StatusBarData["events"][number];

const bucketSize: Record<Range, number> = {
  "24h": 30 * 60_000,
  "7d": 4 * 3_600_000,
  "30d": 0,
  "90d": 0,
};

// Bars are cut along Vienna days and hours, so they are labelled in Vienna time.
function bucketTitle(locale: Locale, range: Range, start: Date) {
  if (!bucketSize[range]) return formatDay(locale, start);
  const time = (d: Date) =>
    d.toLocaleTimeString(locale === "de" ? "de-AT" : "en-GB", {
      timeZone: "Europe/Vienna",
      hour: "2-digit",
      minute: "2-digit",
    });
  const end = new Date(start.getTime() + bucketSize[range]);
  return `${formatDay(locale, start)}, ${time(start)}–${time(end)}`;
}

function HistoryLabels({
  locale,
  range,
  children,
}: {
  locale: Locale;
  range: Range;
  children: React.ReactNode;
}) {
  const parent = useStatusBlocksLabels();
  const value = useMemo(
    () => ({
      ...parent,
      ariaStatusTracker: copy[locale].tracker(copy[locale].rangeLong[range]),
      ariaDayStatus: (n: number) => copy[locale].period(n, 0),
      formatDateShort: (start: Date) => bucketTitle(locale, range, start),
    }),
    [parent, locale, range],
  );
  return (
    <StatusBlocksI18nProvider value={value}>
      {children}
    </StatusBlocksI18nProvider>
  );
}

function ServiceHistory({
  locale,
  range,
  buckets,
  since,
  events,
}: {
  locale: Locale;
  range: Range;
  buckets: Bucket[] | undefined;
  since: string | null;
  events: BarEvent[];
}) {
  const text = copy[locale];
  const bars = useMemo<StatusBarData[] | undefined>(() => {
    const sinceAt = since ? Date.parse(since) : Number.POSITIVE_INFINITY;
    return buckets?.map((bucket, index) => {
      const start = Date.parse(bucket.start);
      const end = Date.parse(bucket.end);
      const before = end <= sinceAt;
      const measured = cardLevels.some(
        (l) => l !== "unknown" && bucket.counts[l],
      );
      const title = bucketTitle(locale, range, new Date(start));
      return {
        day: bucket.start,
        ariaLabel: `${text.period(index + 1, buckets.length)}, ${title}: ${
          before ? text.beforeHistory : text.level[bucket.level]
        }`,
        bar: [
          { status: before ? "empty" : levelBar(bucket.level), height: 100 },
        ],
        card:
          before || !measured
            ? [
                {
                  status: "empty",
                  value: before ? text.beforeHistory : text.noChecks,
                },
              ]
            : [
                ...cardLevels
                  .filter((l) => bucket.counts[l])
                  .map((l) => ({
                    status: levelBar(l),
                    value: `${text.level[l]}|${text.minutes(bucket.counts[l])}`,
                  })),
                ...causeLine(locale, bucket),
              ],
        events: events.filter(
          (e) =>
            (e.from?.getTime() ?? 0) < end &&
            (e.to?.getTime() ?? Number.POSITIVE_INFINITY) > start,
        ),
      };
    });
  }, [buckets, events, locale, range, since, text]);
  if (!bars) return <Skeleton className="h-8 w-full" />;
  return (
    // A local radius keeps up to 90 slim bars from turning into pills.
    <div className="[--radius:0.125rem] [&_[data-slot=status-bar]]:h-8 [&_[data-slot=status-bar]]:gap-[2px]">
      <StatusBar
        data={bars}
        renderBar={(segment, index) => (
          <div
            key={index}
            className={cn(
              "w-full",
              segment.status === "empty" && "bg-muted-foreground/25",
            )}
            style={{
              height: `${segment.height}%`,
              backgroundColor:
                segment.status === "empty"
                  ? undefined
                  : statusColors[segment.status],
            }}
          />
        )}
        renderCard={(item, index) => {
          if (item.value.startsWith(CAUSE_PREFIX)) {
            const [label, value] = item.value
              .slice(CAUSE_PREFIX.length)
              .split("|");
            return (
              <div
                key={index}
                className="text-muted-foreground flex items-baseline gap-4 border-t pt-1.5 text-xs"
              >
                <span>{label}</span>
                <span className="text-foreground ml-auto text-right">
                  {value}
                </span>
              </div>
            );
          }
          const [label, value] = item.value.includes("|")
            ? item.value.split("|")
            : [item.value, ""];
          return (
            <div key={index} className="flex items-baseline gap-4">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2.5 rounded-sm",
                    item.status === "empty" && "bg-muted-foreground/40",
                  )}
                  style={{
                    backgroundColor:
                      item.status === "empty"
                        ? undefined
                        : statusColors[item.status],
                  }}
                />
                {label}
              </span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {value}
              </span>
            </div>
          );
        }}
      />
    </div>
  );
}

// Die Ursachen stehen als eigene Zeile im Balken-Tooltip, ohne Farbfeld.
const CAUSE_PREFIX = "cause:";

function causeLine(locale: Locale, bucket: Bucket): StatusBarData["card"] {
  const keys = Object.entries(bucket.causes?.minutes ?? {})
    .filter(([, minutes]) => minutes && minutes > 0)
    .toSorted(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([key]) => key as keyof (typeof copy)["de"]["causes"]);
  if (!keys.length) return [];
  const text = copy[locale];
  const regions = (bucket.causes?.regions ?? []).map(
    (r) => REGION_NAMES[r] ?? r,
  );
  const why = [
    keys.map((k) => text.causes[k]).join(", "),
    regions.length ? regions.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [{ status: "empty", value: `${CAUSE_PREFIX}${text.cause}|${why}` }];
}

async function fetchStatus(range: Range): Promise<StatusData> {
  const response = await fetch(`/api/oeffigo?range=${range}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("status_unavailable");
  return response.json();
}
