"use client";

import {
  StatusBlocksI18nProvider,
  useStatusBlocksLabels,
} from "@openstatus/ui/components/blocks/status-i18n";
import type {
  StatusBarData,
  StatusType,
} from "@openstatus/ui/components/blocks/status.types";
import { statusColors } from "@openstatus/ui/components/blocks/status.utils";
import { Skeleton } from "@openstatus/ui/components/ui/skeleton";
import { cn } from "@openstatus/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Link } from "../../../../../components/common/link";
import { ProcessMessage } from "../../../../../components/content/process-message";
import { SubscribeUpdates } from "../../../../../components/nav/header";
import { StatusBar } from "../../../../../components/status-page/status-bar";
import { StatusFeed } from "../../../../../components/status-page/status-feed";
import { usePathnamePrefix } from "../../../../../hooks/use-pathname-prefix";
import {
  BUCKET_MS,
  expireSnapshot,
  headline,
  historyBucketLabel,
  MAX_AGE_MS,
  mergeManualStatus,
  serviceLabel,
  type Headline,
  type HistoryBucket,
  type MergedService,
  type ServiceState,
  type StatusData,
} from "../../../../../lib/oeffigo/model";
import { updatesWithImpactChanges } from "../../../../../lib/report-impacts";
import { useTRPC } from "../../../../../lib/trpc/client";

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
      operational: () => "Alle Funktionen verfügbar",
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
      noKnownIssues: (confirmed: number, n: number) =>
        confirmed === 1
          ? `1 von ${n} Funktionen ist bestätigt verfügbar.`
          : `${confirmed} von ${n} Funktionen sind bestätigt verfügbar.`,
      unconfirmed: (open: number, n: number) =>
        open === 1
          ? `1 von ${n} Funktionen konnte zuletzt nicht bestätigt werden.`
          : `${open} von ${n} Funktionen konnten zuletzt nicht bestätigt werden.`,
      maintenance: (names: string) => `Geplante Arbeiten betreffen ${names}.`,
      affected: (count: number, n: number) =>
        count === 1
          ? `1 von ${n} Funktionen ist betroffen.`
          : `${count} von ${n} Funktionen sind betroffen.`,
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
    boardHint: "Zustand jetzt und Verlauf der letzten 24 Stunden",
    ago24h: "vor 24 Std.",
    ago12h: "vor 12 Std.",
    now: "jetzt",
    tracker: "Verlauf der letzten 24 Stunden",
    period: (n: number) => `Halbstunde ${n} von 48`,
    checks: (n: number) => (n === 1 ? "1 Prüfung" : `${n} Prüfungen`),
    noChecks: "keine Prüfung",
    barHint:
      "Ein Balken ist eine halbe Stunde. Grün braucht fast jede Minute eine bestätigte Prüfung.",
    reports: "Meldungen",
    reportLanguage: "",
    noReports: "In den letzten 7 Tagen gab es keine Meldungen oder Wartungen.",
    allEvents: "Alle Ereignisse",
    updatedAgo: (ago: string) => `aktualisiert ${ago}`,
    readReport: "Meldung öffnen",
    maintenanceNow: "Wartung läuft",
    subscribeTitle: "Bei Störungen Bescheid bekommen",
    subscribeText:
      "Du bekommst eine E-Mail, wenn wir über Störungen oder Wartungen informieren. Abmelden kannst du jederzeit über den Link in der E-Mail.",
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
      operational: () => "All services available",
      no_known_issues: () => "No known issues",
      unconfirmed: () => "Status not confirmed right now",
      maintenance: () => "Maintenance in progress",
      degraded: (names: string) => `Reduced service for ${names}`,
      down: (names: string) => `Outage affecting ${names}`,
    },
    functionsCount: (n: number) => `${n} services`,
    lead: {
      operational: (n: number) => `All ${n} services are confirmed available.`,
      noKnownIssues: (confirmed: number, n: number) =>
        confirmed === 1
          ? `1 of ${n} services is confirmed available.`
          : `${confirmed} of ${n} services are confirmed available.`,
      unconfirmed: (open: number, n: number) =>
        `${open} of ${n} services could not be confirmed in the latest check.`,
      maintenance: (names: string) => `Planned work affects ${names}.`,
      affected: (count: number, n: number) =>
        count === 1
          ? `1 of ${n} services is affected.`
          : `${count} of ${n} services are affected.`,
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
    boardHint: "Current state and the last 24 hours",
    ago24h: "24 h ago",
    ago12h: "12 h ago",
    now: "now",
    tracker: "Last 24 hours",
    period: (n: number) => `Half hour ${n} of 48`,
    checks: (n: number) => (n === 1 ? "1 check" : `${n} checks`),
    noChecks: "no checks",
    barHint:
      "Each bar is half an hour. Green needs a confirmed check almost every minute.",
    reports: "Reports",
    reportLanguage: "Incident reports are currently published in German.",
    noReports: "No reports or maintenance in the last 7 days.",
    allEvents: "All events",
    updatedAgo: (ago: string) => `updated ${ago}`,
    readReport: "Open report",
    maintenanceNow: "Maintenance in progress",
    subscribeTitle: "Get notified about incidents",
    subscribeText:
      "We email you when we publish an incident or maintenance update. Every email has a link to unsubscribe.",
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

const bucketStates = [
  "down",
  "degraded",
  "paused",
  "operational",
  "unknown",
] as const satisfies readonly ServiceState[];

const legend = [
  "operational",
  "degraded",
  "down",
  "paused",
  "unknown",
] as const;

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

const stateOfBar: Record<StatusType, ServiceState> = {
  success: "operational",
  degraded: "degraded",
  error: "down",
  info: "paused",
  empty: "unknown",
};

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

function joinNames(locale: Locale, names: string[]) {
  if (names.length > 2) return copy[locale].functionsCount(names.length);
  return names.join(` ${copy[locale].and} `);
}

function stateLabel(locale: Locale, service: MergedService) {
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

export function Client() {
  const locale: Locale = useLocale() === "de" ? "de" : "en";
  const text = copy[locale];
  const labels = useStatusBlocksLabels();
  const trpc = useTRPC();
  const { domain } = useParams<{ domain: string }>();
  const prefix = usePathnamePrefix();
  const now = useClock();

  const { data: page, isError: pageError } = useQuery({
    ...trpc.statusPage.get.queryOptions({ slug: domain }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const { data, isError: statusError } = useQuery<StatusData>({
    queryKey: ["oeffigo-status"],
    queryFn: async () => {
      const response = await fetch("/api/oeffigo", { cache: "no-store" });
      if (!response.ok) throw new Error("status_unavailable");
      return response.json();
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

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
  const confirmed = services.filter(
    (s) => s.state === "operational" && !s.maintenance,
  ).length;
  const checkedAt = snapshot ? Date.parse(snapshot.checkedAt) : Number.NaN;
  const checkCurrent =
    !statusError && now !== null && now - checkedAt <= MAX_AGE_MS;
  const eventsHref = `${prefix ? `/${prefix}` : ""}/events`;

  const openEvents = page?.openEvents.filter((e) => e.type !== "incident");
  const openReport = openEvents?.some((e) => e.type === "report") ?? false;
  const recentReports =
    page?.statusReports.filter(
      (report) =>
        report.statusReportUpdates.length > 0 &&
        page.lastEvents.some((e) => e.type === "report" && e.id === report.id),
    ) ?? [];
  const recentMaintenances =
    page?.maintenances.filter((maintenance) =>
      page.lastEvents.some(
        (e) => e.type === "maintenance" && e.id === maintenance.id,
      ),
    ) ?? [];

  const lead = (() => {
    if (statusError) return text.lead.unavailable;
    switch (state) {
      case "operational":
        return text.lead.operational(services.length);
      case "no_known_issues":
        return [
          text.lead.noKnownIssues(confirmed, services.length),
          ...services
            .filter((s) => s.note)
            .map((s) => {
              const label = stateLabel(locale, s);
              return `${name(s)}: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
            }),
        ].join(" ");
      case "unconfirmed":
        return text.lead.unconfirmed(
          services.length - confirmed,
          services.length,
        );
      case "maintenance":
        return text.lead.maintenance(
          joinNames(locale, services.filter((s) => s.maintenance).map(name)),
        );
      case "degraded":
      case "down":
        return `${text.lead.affected(affected.length, services.length)}${
          openReport ? ` ${text.lead.seeReport}` : ""
        }`;
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
        className="pt-12 sm:pt-20"
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
              className="max-w-4xl text-[clamp(2.5rem,6.5vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance"
            >
              {state === "degraded" || state === "down"
                ? text.headline[state](joinNames(locale, affected.map(name)))
                : text.headline[state]()}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed text-pretty">
              {lead}
            </p>
          </div>
        )}
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
              const report = page.statusReports.find((r) => r.id === event.id);
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
            const maintenance = page.maintenances.find(
              (m) => m.id === event.id,
            );
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
                    <span className="text-muted-foreground font-mono text-xs">
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

      <section
        aria-labelledby="functions-title"
        className="bg-card rounded-xl border"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="functions-title" className="text-lg font-semibold">
              {text.functions}
            </h2>
            <p className="text-muted-foreground text-sm">{text.boardHint}</p>
          </div>
          <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
        <HistoryLabels locale={locale}>
          <ul className="divide-y">
            {services.map((service) => (
              <li
                key={service.id}
                className="grid gap-x-10 gap-y-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(14rem,26rem)_11rem] md:items-center"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-medium">{name(service)}</h3>
                    <p className="text-muted-foreground text-sm">
                      {locale === "de"
                        ? service.description
                        : service.descriptionEn}
                    </p>
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
                  </div>
                  <StateLabel
                    className="md:hidden"
                    loading={loading}
                    locale={locale}
                    service={service}
                  />
                </div>
                <div>
                  <ServiceHistory
                    locale={locale}
                    buckets={data?.history[service.id]}
                  />
                </div>
                <StateLabel
                  className="hidden md:block"
                  loading={loading}
                  locale={locale}
                  service={service}
                />
              </li>
            ))}
          </ul>
        </HistoryLabels>
        <div className="text-muted-foreground grid gap-x-10 gap-y-2 border-t px-5 py-3 text-xs sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(14rem,26rem)_11rem]">
          <p className="order-2 md:order-1">{text.barHint}</p>
          <div className="order-1 flex justify-between font-mono md:order-2">
            <span>{text.ago24h}</span>
            <span className="hidden sm:inline">{text.ago12h}</span>
            <span>{text.now}</span>
          </div>
        </div>
      </section>

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
          recentReports.length > 0 ? (
            <p className="text-muted-foreground mb-4 text-sm">
              {text.reportLanguage}
            </p>
          ) : null}
          {!page ? (
            <Skeleton className="h-24 w-full" />
          ) : recentReports.length === 0 && recentMaintenances.length === 0 ? (
            <p className="text-muted-foreground">{text.noReports}</p>
          ) : (
            // The feed parks its date column in a left gutter from lg upwards.
            <div className="lg:pl-32">
              <StatusFeed
                statusReports={recentReports.map((report) => ({
                  ...report,
                  affected: report.statusReportsToPageComponents.map((c) =>
                    serviceLabel(
                      c.pageComponent.id,
                      locale,
                      c.pageComponent.name,
                    ),
                  ),
                  updates: updatesWithImpactChanges(report),
                }))}
                maintenances={recentMaintenances.map((maintenance) => ({
                  ...maintenance,
                  affected: maintenance.maintenancesToPageComponents.map((c) =>
                    serviceLabel(
                      c.pageComponent.id,
                      locale,
                      c.pageComponent.name,
                    ),
                  ),
                }))}
              />
            </div>
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

function StateLabel({
  className,
  loading,
  locale,
  service,
}: {
  className?: string;
  loading: boolean;
  locale: Locale;
  service: MergedService;
}) {
  if (loading)
    return <Skeleton className={cn("h-4 w-20 shrink-0", className)} />;
  return (
    <span
      className={cn(
        "shrink-0 text-right text-sm font-medium",
        stateClass[service.maintenance ? "paused" : service.state],
        className,
      )}
    >
      {stateLabel(locale, service)}
    </span>
  );
}

function HistoryLabels({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const parent = useStatusBlocksLabels();
  const value = useMemo(
    () => ({
      ...parent,
      ariaStatusTracker: copy[locale].tracker,
      ariaDayStatus: copy[locale].period,
      formatDateShort: (start: Date) =>
        `${formatTime(locale, start)}–${formatTime(
          locale,
          new Date(start.getTime() + BUCKET_MS),
        )}`,
    }),
    [parent, locale],
  );
  return (
    <StatusBlocksI18nProvider value={value}>
      {children}
    </StatusBlocksI18nProvider>
  );
}

function ServiceHistory({
  locale,
  buckets,
}: {
  locale: Locale;
  buckets: HistoryBucket[] | undefined;
}) {
  const text = copy[locale];
  const bars = useMemo<StatusBarData[] | undefined>(
    () =>
      buckets?.map((bucket, index) => ({
        day: bucket.start,
        ariaLabel: historyBucketLabel(locale, index, bucket),
        bar: [{ status: barStatus(bucket.state), height: 100 }],
        card:
          bucket.checks === 0
            ? [{ status: "empty", value: text.noChecks }]
            : bucketStates
                .filter((s) => bucket.counts[s])
                .map((s) => ({
                  status: barStatus(s),
                  value: text.checks(bucket.counts[s] ?? 0),
                })),
        events: [],
      })),
    [buckets, locale, text],
  );
  if (!bars) return <Skeleton className="h-8 w-full" />;
  return (
    // A local radius keeps 48 slim bars from turning into pills.
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
        renderCard={(item, index) => (
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
              {text.state[stateOfBar[item.status]]}
            </span>
            <span className="text-muted-foreground ml-auto font-mono text-xs">
              {item.value}
            </span>
          </div>
        )}
      />
    </div>
  );
}
