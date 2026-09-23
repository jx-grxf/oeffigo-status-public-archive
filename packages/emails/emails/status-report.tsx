/** @jsxRuntime automatic @jsxImportSource react */

import {
  Body,
  Column,
  Head,
  Heading,
  Html,
  Link,
  Markdown,
  Preview,
  Row,
  Section,
  Text,
} from "react-email";
import { z } from "zod";

import { Layout } from "./_components/layout";
import { colors, styles } from "./_components/styles";

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
  unsubscribeUrl: z.url(),
  manageUrl: z.url(),
});

export type StatusReportProps = z.infer<typeof StatusReportSchema>;

function getStatusColor(status: string) {
  switch (status) {
    case "investigating":
      return colors.danger;
    case "identified":
      return colors.warning;
    case "resolved":
      return colors.success;
    case "monitoring":
      return colors.info;
    case "maintenance":
      return colors.info;
    default:
      return colors.success;
  }
}

const statusText: Record<StatusReportProps["status"], string> = {
  investigating: "Wird untersucht",
  identified: "Ursache gefunden",
  monitoring: "Wird beobachtet",
  resolved: "Behoben",
  maintenance: "Wartung",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-AT", {
    timeZone: "Europe/Vienna",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const muted = { fontSize: "12px", lineHeight: "18px", color: "#6b7280" };

function StatusReportEmail({
  status,
  date,
  message,
  reportTitle,
  pageTitle,
  pageComponents,
  unsubscribeUrl,
  manageUrl,
}: StatusReportProps) {
  const host = URL.canParse(manageUrl) ? new URL(manageUrl).host : undefined;
  return (
    <Html lang="de">
      <Head />
      <Preview>
        {statusText[status]}: {reportTitle}
      </Preview>
      <Body style={styles.main}>
        <Layout>
          <Row>
            <Column>
              <Heading as="h3">{pageTitle}</Heading>
            </Column>
            <Column style={{ textAlign: "right" }}>
              <Text style={{ color: getStatusColor(status) }}>
                {statusText[status]}
              </Text>
            </Column>
          </Row>
          <Row style={styles.row}>
            <Column>
              <Text style={styles.bold}>Meldung</Text>
            </Column>
            <Column style={{ textAlign: "right" }}>
              <Text>{reportTitle}</Text>
            </Column>
          </Row>
          <Row style={styles.row}>
            <Column>
              <Text style={styles.bold}>Zeit</Text>
            </Column>
            <Column style={{ textAlign: "right" }}>
              <Text>{formatDate(date)}</Text>
            </Column>
          </Row>
          <Row style={styles.row}>
            <Column>
              <Text style={styles.bold}>Betroffen</Text>
            </Column>
            <Column style={{ textAlign: "right" }}>
              <Text style={{ flexWrap: "wrap", wordWrap: "break-word" }}>
                {pageComponents.length > 0
                  ? pageComponents.join(", ")
                  : "Keine Angabe"}
              </Text>
            </Column>
          </Row>
          <Row style={styles.row}>
            <Column>
              <Markdown>{message}</Markdown>
            </Column>
          </Row>
          {unsubscribeUrl && (
            <Section style={{ marginTop: "24px", textAlign: "center" }}>
              <Text style={muted}>
                Du bekommst diese E-Mail, weil du Updates
                {host ? ` auf ${host}` : ""} abonniert hast.
              </Text>
              <Text style={muted}>
                <Link
                  href={unsubscribeUrl}
                  style={{ color: "#6b7280", textDecoration: "underline" }}
                >
                  Abmelden
                </Link>
                {" · "}
                <Link
                  href={manageUrl}
                  style={{ color: "#6b7280", textDecoration: "underline" }}
                >
                  Benachrichtigungen verwalten
                </Link>
              </Text>
            </Section>
          )}
        </Layout>
      </Body>
    </Html>
  );
}

StatusReportEmail.PreviewProps = {
  pageTitle: "OpenStatus Status",
  reportTitle: "API Unavaible",
  status: "investigating",
  date: new Date().toISOString(),
  message: `
**Status**: Partial Service Restored

**GitHub Runners**: Operational

**Cache Action**: Degraded

---

### What's Changed

- All queued workflows are now being picked up and completed successfully.
- Jobs are running normally on our GitHub App. ### Current Issue: Cache Action Unavailable Attempts to re-publish our action to GitHub Marketplace are returning 500 Internal Server Errors. This prevents the updated versions from going live.

### Mitigation In Progress

- Collaborating with GitHub Support to resolve any upstream issues.

### Next Update

We'll post another update by **19:00 UTC** today or sooner if critical developments occur. We apologize for the inconvenience and appreciate your patience as we restore full cache functionality.
  `,
  pageComponents: ["OpenStatus API", "OpenStatus Webhook"],
  unsubscribeUrl:
    "https://status.openstatus.dev/unsubscribe/550e8400-e29b-41d4-a716-446655440000",
  manageUrl:
    "https://status.openstatus.dev/manage/550e8400-e29b-41d4-a716-446655440000",
};

export default StatusReportEmail;
