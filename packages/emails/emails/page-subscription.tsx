/** @jsxRuntime automatic @jsxImportSource react */

import { Body, Button, Head, Heading, Html, Preview, Text } from "react-email";
import { z } from "zod";

import { Layout } from "./_components/layout";
import { styles } from "./_components/styles";

export const PageSubscriptionSchema = z.object({
  page: z.string(),
  link: z.string(),
  img: z
    .object({
      src: z.string(),
      alt: z.string(),
      href: z.string(),
    })
    .optional(),
});

export type PageSubscriptionProps = z.infer<typeof PageSubscriptionSchema>;

const muted = { color: "#6b7280", fontSize: "13px", lineHeight: "20px" };

const PageSubscriptionEmail = ({ page, link, img }: PageSubscriptionProps) => {
  const host = URL.canParse(link) ? new URL(link).host : undefined;
  return (
    <Html lang="de">
      <Head />
      <Preview>
        Ein Klick noch, dann informieren wir dich über Störungen.
      </Preview>
      <Body style={styles.main}>
        <Layout img={img}>
          <Heading as="h2">Bitte bestätige dein Abo</Heading>
          <Text>
            Du hast {host ? `auf ${host} ` : ""}Benachrichtigungen zu Störungen
            und Wartungen bei {page} angefordert. Bestätige deine
            E-Mail-Adresse, damit wir dir diese Updates schicken.
          </Text>
          <Button style={styles.button} href={link}>
            Abo bestätigen
          </Button>
          <Text style={muted}>
            Der Link gilt 7 Tage. Wenn du das nicht angefordert hast, ignoriere
            diese E-Mail. Ohne Bestätigung bekommst du keine weiteren
            Nachrichten.
          </Text>
          <Text style={muted}>
            English: please confirm your subscription to {page} status updates
            with the button above.
          </Text>
        </Layout>
      </Body>
    </Html>
  );
};

PageSubscriptionEmail.PreviewProps = {
  link: "https://status.oeffigo.app/verify/token",
  page: "ÖffiGo",
} satisfies PageSubscriptionProps;

export default PageSubscriptionEmail;
