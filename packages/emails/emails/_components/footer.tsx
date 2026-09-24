/** @jsxRuntime automatic @jsxImportSource react */

import type * as React from "react";
import { Link, Section, Text } from "react-email";

import { colors, styles } from "./styles";

export const IMPRINT_URL = "https://oeffigo.app/impressum";

interface FooterLink {
  label: string;
  href: string;
}

const line = {
  margin: "0 0 6px",
  fontSize: "13px",
  lineHeight: "20px",
  color: colors.muted,
} satisfies React.CSSProperties;

const link = { color: colors.muted, textDecoration: "underline" };

const operatorLinks = [
  { label: "ÖffiGo Status", href: "https://status.oeffigo.app" },
  { label: "Kontakt", href: "mailto:contact@oeffigo.app" },
  { label: "Impressum", href: IMPRINT_URL },
  { label: "Datenschutz", href: "https://oeffigo.app/datenschutz" },
] satisfies FooterLink[];

export function Footer({
  reason,
  rule,
  links = [],
}: {
  /** Why the reader got this email. */
  reason?: string;
  /** Alert-rule variant, e.g. "latency > 250ms × 3". */
  rule?: string;
  /** Only pass a link where the page behind it exists. */
  links?: FooterLink[];
}) {
  return (
    <Section style={{ padding: "24px 16px 0", textAlign: "center" }}>
      {rule ? (
        <Text style={line}>
          Alert rule: <span style={styles.mono}>{rule}</span>
        </Text>
      ) : null}
      {reason ? <Text style={line}>{reason}</Text> : null}
      {links.length > 0 ? (
        <Text style={line}>
          {links.map((l, i) => (
            <span key={l.href}>
              {i > 0 ? " · " : null}
              <Link href={l.href} style={link}>
                {l.label}
              </Link>
            </span>
          ))}
        </Text>
      ) : null}
      <Text style={{ ...line, margin: 0, color: colors.faint }}>
        {operatorLinks.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? " · " : null}
            <Link href={l.href} style={{ ...link, color: colors.faint }}>
              {l.label}
            </Link>
          </span>
        ))}
      </Text>
    </Section>
  );
}
