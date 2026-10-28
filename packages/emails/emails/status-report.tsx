/** @jsxRuntime automatic @jsxImportSource react */

import { z } from "zod";

import { Actions } from "./_components/actions";
import { Eyebrow } from "./_components/eyebrow";
import { Footer } from "./_components/footer";
import { formatElapsed } from "./_components/format";
import { Heading } from "./_components/heading";
import { KeyValue } from "./_components/key-value";
import { Layout, statusPageBrand } from "./_components/layout";
import { Markdown } from "./_components/markdown";
import type { Tone } from "./_components/styles";

export const StatusReportSchema = z.object({
  pageTitle: z.string(),
  // statusReportStatus from db
  status: z.enum([
    "investigating",
    "identified",
    "monitoring",
    "resolved",
    "maintenance",
  ]),
  date: z.string(),
  message: z.string(),
  reportTitle: z.string(),
  pageComponents: z.array(z.string()),
  // pageComponentImpact from db; absent for maintenance and legacy reports
  componentImpacts: z
    .array(
      z.object({
        name: z.string(),
        impact: z.enum([
          "operational",
          "degraded_performance",
          "partial_outage",
          "major_outage",
        ]),
      }),
    )
    .optional(),
  unsubscribeUrl: z.url(),
  manageUrl: z.url(),
  statusPageUrl: z.url().optional(),
  /** 1-based position of this update within the report. */
  updateIndex: z.number().optional(),
  reportStartedAt: z.string().optional(),
});

export type StatusReportProps = z.infer<typeof StatusReportSchema>;

const statusTone = {
  investigating: "danger",
  identified: "warning",
  monitoring: "info",
  resolved: "success",
  maintenance: "info",
} satisfies Record<StatusReportProps["status"], Tone>;

type Impact = NonNullable<
  StatusReportProps["componentImpacts"]
>[number]["impact"];

const impactRow = {
  operational: { label: "Funktioniert", tone: "success" },
  degraded_performance: { label: "Eingeschränkt", tone: "warning" },
  partial_outage: { label: "Teilweise gestört", tone: "warning" },
  major_outage: { label: "Gestört", tone: "danger" },
} satisfies Record<Impact, { label: string; tone: Tone }>;

const statusText = {
  investigating: "Wird untersucht",
  identified: "Ursache gefunden",
  monitoring: "Wird beobachtet",
  resolved: "Behoben",
  maintenance: "Wartung",
} satisfies Record<StatusReportProps["status"], string>;

function isDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("de-AT", {
    timeZone: "Europe/Vienna",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function statusReportPreheader(
  props: Pick<StatusReportProps, "status" | "pageTitle" | "pageComponents">,
): string {
  const components =
    props.pageComponents.length > 0
      ? props.pageComponents.slice(0, 3).join(", ")
      : props.pageTitle;
  if (props.status === "resolved") return `Behoben: ${components}.`;
  if (props.status === "maintenance") return `Geplante Wartung: ${components}.`;
  return `${statusText[props.status]}: ${components}.`;
}

function StatusReportEmail({
  status,
  date,
  message,
  reportTitle,
  pageTitle,
  pageComponents,
  componentImpacts,
  unsubscribeUrl,
  manageUrl,
  statusPageUrl,
  updateIndex,
  reportStartedAt,
}: StatusReportProps) {
  const tone = statusTone[status];
  const dated = isDate(date);
  const elapsed =
    dated && reportStartedAt && isDate(reportStartedAt)
      ? formatElapsed(reportStartedAt, date)
      : undefined;

  const host = URL.canParse(manageUrl) ? new URL(manageUrl).host : undefined;
  const links = [];
  if (unsubscribeUrl) links.push({ label: "Abmelden", href: unsubscribeUrl });
  if (manageUrl)
    links.push({ label: "Benachrichtigungen verwalten", href: manageUrl });

  return (
    <Layout
      lang="de"
      preview={statusReportPreheader({ status, pageTitle, pageComponents })}
      brand={statusPageBrand(pageTitle, statusPageUrl ?? manageUrl)}
      pill={{ tone, label: statusText[status] }}
      footer={
        <Footer
          reason={`Du bekommst diese E-Mail, weil du Updates${host ? ` auf ${host}` : ""} abonniert hast.`}
          links={links}
        />
      }
    >
      <Eyebrow
        items={[
          updateIndex ? `Update ${updateIndex}` : undefined,
          dated ? formatDate(date) : undefined,
          elapsed && elapsed !== "0m" ? `seit ${elapsed}` : undefined,
        ]}
      />
      <Heading title={reportTitle} />
      {!dated ? <KeyValue rows={[{ label: "Zeitraum", value: date }]} /> : null}
      {pageComponents.length > 0 ? (
        <KeyValue
          rows={pageComponents.map((name) => {
            const impact = componentImpacts?.find((c) => c.name === name);
            return {
              label: name,
              value: impact ? impactRow[impact.impact].label : null,
              tone: impact ? impactRow[impact.impact].tone : undefined,
            };
          })}
        />
      ) : null}
      <Markdown>{message}</Markdown>
      {statusPageUrl ? (
        <Actions
          primary={{
            label: "Auf der Statusseite verfolgen",
            href: statusPageUrl,
          }}
        />
      ) : null}
    </Layout>
  );
}

StatusReportEmail.PreviewProps = {
  pageTitle: "ÖffiGo",
  reportTitle: "Abfahrtszeiten verzögert",
  status: "monitoring",
  date: "2026-09-18T12:37:00Z",
  reportStartedAt: "2026-09-18T10:23:00Z",
  updateIndex: 3,
  message: `Queued workflows have drained and jobs are running normally again. One piece is still broken: publishing our GitHub Action returns 500s upstream, so new versions can't go live.

### What we're doing

- Working with GitHub Support on the Marketplace 500s.
- Retrying the publish job every 15 minutes.

### What you need to do

Nothing. Pin the previous action version if your pipeline is blocked — next update by **14:00 UTC**.
  `,
  pageComponents: ["openstatus API", "GitHub Runners", "Cache Action"],
  componentImpacts: [
    { name: "openstatus API", impact: "operational" },
    { name: "GitHub Runners", impact: "degraded_performance" },
    { name: "Cache Action", impact: "partial_outage" },
  ],
  statusPageUrl: "https://status.openstatus.dev",
  unsubscribeUrl:
    "https://status.openstatus.dev/unsubscribe/550e8400-e29b-41d4-a716-446655440000",
  manageUrl:
    "https://status.openstatus.dev/manage/550e8400-e29b-41d4-a716-446655440000",
} satisfies StatusReportProps;

export default StatusReportEmail;
