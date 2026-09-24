"use client";

import { useQuery } from "@tanstack/react-query";
import { useExtracted, useLocale } from "next-intl";
import { useParams } from "next/navigation";

import { ButtonBack } from "../../../../../../../../../components/button/button-back";
import { ButtonCopyLink } from "../../../../../../../../../components/button/button-copy-link";
import { StatusBlankEvents } from "../../../../../../../../../components/status-page/status-blank";
import {
  StatusEvent,
  StatusEventAffected,
  StatusEventAffectedBadge,
  StatusEventAside,
  StatusEventContent,
  StatusEventDate,
  StatusEventTimelineMaintenance,
  StatusEventTitle,
} from "../../../../../../../../../components/status-page/status-events";
import { serviceLabel } from "../../../../../../../../../lib/oeffigo/model";
import { useTRPC } from "../../../../../../../../../lib/trpc/client";

export default function MaintenancePage() {
  const t = useExtracted();
  const locale = useLocale();
  const trpc = useTRPC();
  const { id, domain } = useParams<{ id: string; domain: string }>();
  const { data: maintenance } = useQuery(
    trpc.statusPage.getMaintenance.queryOptions({
      id: Number(id),
      slug: domain,
    }),
  );

  if (!maintenance) {
    return (
      <StatusBlankEvents
        title={t("Maintenance not found")}
        description={t("The maintenance you are looking for does not exist.")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full flex-row items-center justify-between gap-2 py-0.5">
        <ButtonBack href="../" />
        <ButtonCopyLink />
      </div>
      {locale === "en" && domain === "oeffigo" ? (
        <p className="text-muted-foreground text-sm">
          This maintenance notice is currently published in German.
        </p>
      ) : null}
      <StatusEvent>
        <StatusEventAside>
          <StatusEventDate date={maintenance.from} />
        </StatusEventAside>
        <StatusEventContent hoverable={false}>
          <StatusEventTitle lang={domain === "oeffigo" ? "de" : undefined}>
            {maintenance.title}
          </StatusEventTitle>
          <StatusEventAffected>
            {maintenance.maintenancesToPageComponents.map((affected) => (
              <StatusEventAffectedBadge key={affected.pageComponent.id}>
                {serviceLabel(
                  affected.pageComponent.id,
                  locale,
                  affected.pageComponent.name,
                )}
              </StatusEventAffectedBadge>
            ))}
          </StatusEventAffected>
          <StatusEventTimelineMaintenance maintenance={maintenance} />
        </StatusEventContent>
      </StatusEvent>
    </div>
  );
}
