"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@openstatus/ui/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useExtracted, useLocale } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import { Fragment } from "react";

import { StatusBlankEvents } from "../../../../../../../components/status-page/status-blank";
import {
  StatusEvent,
  StatusEventAffected,
  StatusEventAffectedBadge,
  StatusEventAside,
  StatusEventContent,
  StatusEventDate,
  StatusEventGroup,
  StatusEventTimelineMaintenance,
  StatusEventTimelineReport,
  StatusEventTitle,
  StatusEventTitleCheck,
} from "../../../../../../../components/status-page/status-events";
import {
  localizeMaintenance,
  localizeReport,
} from "../../../../../../../lib/oeffigo/incident-copy";
import { serviceLabel } from "../../../../../../../lib/oeffigo/model";
import { useEnglishCopy } from "../../../../../../../lib/oeffigo/use-english-copy";
import { updatesWithImpactChanges } from "../../../../../../../lib/report-impacts";
import { useTRPC } from "../../../../../../../lib/trpc/client";
import { searchParamsParsers } from "./search-params";

function monthLabel(locale: string, date: Date) {
  return date.toLocaleDateString(locale === "de" ? "de-AT" : "en-GB", {
    timeZone: "Europe/Vienna",
    month: "long",
    year: "numeric",
  });
}

function durationLabel(locale: string, from: Date, to: Date | null) {
  if (!to) return locale === "de" ? "läuft noch" : "ongoing";
  const minutes = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 60_000),
  );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts =
    locale === "de"
      ? [
          days && `${days} Tg.`,
          hours && `${hours} Std.`,
          !days && rest && `${rest} Min.`,
        ]
      : [
          days && `${days} d`,
          hours && `${hours} h`,
          !days && rest && `${rest} min`,
        ];
  return `${locale === "de" ? "Dauer" : "Duration"} ${parts.filter(Boolean).join(" ")}`;
}

export default function Page() {
  const t = useExtracted();
  const locale = useLocale();
  const [{ tab }, setSearchParams] = useQueryStates(searchParamsParsers);
  const { domain } = useParams<{ domain: string }>();
  const trpc = useTRPC();
  const { data: page } = useQuery(
    trpc.statusPage.get.queryOptions({ slug: domain }),
  );
  const englishCopy = useEnglishCopy(page?.slug);

  if (!page) return null;

  const statusReports = page.statusReports.map((report) =>
    localizeReport(report, englishCopy),
  );
  const maintenances = page.maintenances.map((maintenance) =>
    localizeMaintenance(maintenance, englishCopy),
  );
  const germanCopy = [...statusReports, ...maintenances].some(
    (event) => event.german,
  );

  return (
    <Tabs
      defaultValue={tab}
      onValueChange={(value) =>
        setSearchParams({ tab: value as "reports" | "maintenances" })
      }
      className="gap-4"
    >
      <TabsList>
        <TabsTrigger value="reports">{t("Reports")}</TabsTrigger>
        <TabsTrigger value="maintenances">{t("Maintenances")}</TabsTrigger>
      </TabsList>
      {locale === "en" && page.slug === "oeffigo" && germanCopy ? (
        <p className="text-muted-foreground text-sm">
          Incident and maintenance details are currently published in German.
        </p>
      ) : null}
      <TabsContent value="reports">
        <StatusEventGroup>
          {statusReports.length > 0 ? (
            statusReports.map((report, index) => {
              const updates = report.statusReportUpdates.sort(
                (a, b) => b.date.getTime() - a.date.getTime(),
              );
              const firstUpdate = updates[updates.length - 1];
              const lastUpdate = updates[0];
              // NOTE: updates are sorted descending by date
              const startedAt =
                firstUpdate?.date ?? report.createdAt ?? new Date();
              const resolvedAt =
                updates.find((u) => u.status === "resolved")?.date ??
                (report.status === "resolved"
                  ? (lastUpdate?.date ?? null)
                  : null);
              const previous =
                statusReports[index - 1]?.statusReportUpdates.at(-1)?.date;
              const month = monthLabel(locale, startedAt);
              const newMonth =
                !previous || monthLabel(locale, previous) !== month;
              // HACKY: LEGACY: only resolved via report and not via report update
              const isReportResolvedOnly =
                report.status === "resolved" &&
                lastUpdate?.status !== "resolved";
              return (
                <Fragment key={report.id}>
                  {newMonth ? (
                    <h2 className="text-muted-foreground border-b pt-4 pb-2 font-mono text-xs tracking-[0.12em] uppercase first:pt-0">
                      {month}
                    </h2>
                  ) : null}
                  <StatusEvent>
                    <StatusEventAside>
                      <StatusEventDate date={startedAt} />
                    </StatusEventAside>
                    <Link
                      href={`./events/report/${report.id}`}
                      className="rounded-lg"
                    >
                      <StatusEventContent>
                        <StatusEventTitle className="inline-flex gap-1">
                          {report.title}
                          {isReportResolvedOnly ? (
                            <StatusEventTitleCheck />
                          ) : null}
                        </StatusEventTitle>
                        <p className="text-muted-foreground font-mono text-xs tabular-nums">
                          {durationLabel(locale, startedAt, resolvedAt)}
                        </p>
                        {report.statusReportsToPageComponents.length > 0 ? (
                          <StatusEventAffected>
                            {report.statusReportsToPageComponents.map(
                              (affected) => (
                                <StatusEventAffectedBadge
                                  key={affected.pageComponent.id}
                                >
                                  {serviceLabel(
                                    affected.pageComponent.id,
                                    locale,
                                    affected.pageComponent.name,
                                  )}
                                </StatusEventAffectedBadge>
                              ),
                            )}
                          </StatusEventAffected>
                        ) : null}
                        <StatusEventTimelineReport
                          updates={updatesWithImpactChanges(report)}
                        />
                      </StatusEventContent>
                    </Link>
                  </StatusEvent>
                </Fragment>
              );
            })
          ) : (
            <StatusBlankEvents />
          )}
        </StatusEventGroup>
      </TabsContent>
      <TabsContent value="maintenances">
        <StatusEventGroup>
          {maintenances.length > 0 ? (
            maintenances.map((maintenance) => {
              return (
                <StatusEvent key={maintenance.id}>
                  <StatusEventAside>
                    <StatusEventDate date={maintenance.from} />
                  </StatusEventAside>
                  <Link
                    href={`./events/maintenance/${maintenance.id}`}
                    className="rounded-lg"
                  >
                    <StatusEventContent>
                      <StatusEventTitle>{maintenance.title}</StatusEventTitle>
                      {maintenance.maintenancesToPageComponents.length > 0 ? (
                        <StatusEventAffected>
                          {maintenance.maintenancesToPageComponents.map(
                            (affected) => (
                              <StatusEventAffectedBadge
                                key={affected.pageComponent.id}
                              >
                                {serviceLabel(
                                  affected.pageComponent.id,
                                  locale,
                                  affected.pageComponent.name,
                                )}
                              </StatusEventAffectedBadge>
                            ),
                          )}
                        </StatusEventAffected>
                      ) : null}
                      <StatusEventTimelineMaintenance
                        maintenance={maintenance}
                      />
                    </StatusEventContent>
                  </Link>
                </StatusEvent>
              );
            })
          ) : (
            <StatusBlankEvents
              title={t("No maintenances found")}
              description={t("No maintenances found for this status page.")}
            />
          )}
        </StatusEventGroup>
      </TabsContent>
    </Tabs>
  );
}
