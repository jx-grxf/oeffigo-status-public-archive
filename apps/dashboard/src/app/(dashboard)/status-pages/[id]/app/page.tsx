"use client";

import { Button } from "@openstatus/ui/components/ui/button";
import { Checkbox } from "@openstatus/ui/components/ui/checkbox";
import { Label } from "@openstatus/ui/components/ui/label";
import { Switch } from "@openstatus/ui/components/ui/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  Section,
  SectionDescription,
  SectionGroup,
  SectionHeader,
  SectionTitle,
} from "@/components/content/section";
import { useTRPC } from "@/lib/trpc/client";

const REGIONS = [
  "Wien",
  "Niederösterreich",
  "Burgenland",
  "Oberösterreich",
  "Steiermark",
  "Kärnten",
  "Salzburg",
  "Tirol",
  "Vorarlberg",
] as const;
type Region = (typeof REGIONS)[number];
type Kind = "report" | "maintenance";

const dateTime = (value: Date | null | undefined) =>
  value
    ? value.toLocaleString("de-AT", {
        timeZone: "Europe/Vienna",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const pageId = Number.parseInt(id);
  const trpc = useTRPC();
  const { data, refetch } = useQuery(
    trpc.statusAppNotice.list.queryOptions({ pageId }),
  );

  if (!data) return null;

  const openReports = data.reports.filter((r) => r.status !== "resolved");
  const closedReports = data.reports.filter((r) => r.status === "resolved");
  const now = Date.now();
  const openMaintenances = data.maintenances.filter(
    (m) => !m.to || m.to.getTime() > now,
  );

  return (
    <SectionGroup>
      <Section>
        <SectionHeader>
          <SectionTitle>In der App</SectionTitle>
          <SectionDescription>
            Nur Meldungen mit „In der App anzeigen“ erscheinen in ÖffiGo auf
            Heute, Abfahrten und in der Zielführung, und dort nur, wenn Bereich
            und Region passen. Ohne Region gilt die Meldung für ganz Österreich.
            Im Status-Tab der App stehen immer alle Meldungen. Speichern hier
            schickt keine Benachrichtigung.
          </SectionDescription>
        </SectionHeader>
      </Section>
      <Section>
        <SectionHeader>
          <SectionTitle>Offene Meldungen</SectionTitle>
        </SectionHeader>
        {openReports.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Keine offenen Meldungen.
          </p>
        ) : null}
        {openReports.map((report) => (
          <NoticeSetting
            key={`report-${report.id}`}
            kind="report"
            refId={report.id}
            title={report.title}
            subtitle={`${report.status} · ${dateTime(report.updatedAt)}`}
            showInApp={report.showInApp}
            regions={report.regions as Region[]}
            onSaved={refetch}
          />
        ))}
      </Section>
      <Section>
        <SectionHeader>
          <SectionTitle>Wartungen</SectionTitle>
        </SectionHeader>
        {openMaintenances.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Keine anstehenden Wartungen.
          </p>
        ) : null}
        {openMaintenances.map((m) => (
          <NoticeSetting
            key={`maintenance-${m.id}`}
            kind="maintenance"
            refId={m.id}
            title={m.title}
            subtitle={`${dateTime(m.from)} – ${dateTime(m.to)}`}
            showInApp={m.showInApp}
            regions={m.regions as Region[]}
            onSaved={refetch}
          />
        ))}
      </Section>
      {closedReports.length > 0 ? (
        <Section>
          <SectionHeader>
            <SectionTitle>Gelöst</SectionTitle>
            <SectionDescription>
              Gelöste Meldungen zeigt die App nicht mehr an; die Einstellung
              bleibt nur für das Archiv gespeichert.
            </SectionDescription>
          </SectionHeader>
          {closedReports.slice(0, 10).map((report) => (
            <NoticeSetting
              key={`report-${report.id}`}
              kind="report"
              refId={report.id}
              title={report.title}
              subtitle={`gelöst · ${dateTime(report.updatedAt)}`}
              showInApp={report.showInApp}
              regions={report.regions as Region[]}
              onSaved={refetch}
            />
          ))}
        </Section>
      ) : null}
    </SectionGroup>
  );
}

function NoticeSetting({
  kind,
  refId,
  title,
  subtitle,
  showInApp,
  regions,
  onSaved,
}: {
  kind: Kind;
  refId: number;
  title: string;
  subtitle: string;
  showInApp: boolean;
  regions: Region[];
  onSaved: () => void;
}) {
  const trpc = useTRPC();
  const switchId = useId();
  const [inApp, setInApp] = useState(showInApp);
  const [picked, setPicked] = useState<Region[]>(regions);
  const mutation = useMutation(
    trpc.statusAppNotice.upsert.mutationOptions({ onSuccess: onSaved }),
  );
  const dirty =
    inApp !== showInApp ||
    picked.length !== regions.length ||
    picked.some((r) => !regions.includes(r));

  const toggle = (region: Region, on: boolean) =>
    setPicked((list) =>
      REGIONS.filter((r) => (r === region ? on : list.includes(r))),
    );

  const save = () =>
    toast.promise(
      mutation.mutateAsync({ kind, refId, showInApp: inApp, regions: picked }),
      {
        loading: "Speichert…",
        success: inApp ? "In der App sichtbar" : "Nicht in der App",
        error: "Konnte nicht gespeichert werden",
      },
    );

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor={switchId} className="text-sm">
            In der App anzeigen
          </Label>
          <Switch id={switchId} checked={inApp} onCheckedChange={setInApp} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-muted-foreground mb-1 text-xs">
          Region {picked.length === 0 ? "· ganz Österreich" : ""}
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {REGIONS.map((region) => (
            <RegionBox
              key={region}
              region={region}
              checked={picked.includes(region)}
              onChange={(on) => toggle(region, on)}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || mutation.isPending}
          onClick={save}
        >
          Speichern
        </Button>
      </div>
    </div>
  );
}

function RegionBox({
  region,
  checked,
  onChange,
}: {
  region: Region;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const boxId = useId();
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        id={boxId}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={boxId} className="text-sm font-normal">
        {region}
      </Label>
    </div>
  );
}
