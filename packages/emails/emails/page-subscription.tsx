/** @jsxRuntime automatic @jsxImportSource react */

import { Text } from "react-email";
import { z } from "zod";

import { Actions } from "./_components/actions";
import { Footer } from "./_components/footer";
import { Heading } from "./_components/heading";
import { Layout, statusPageBrand } from "./_components/layout";
import { colors, styles } from "./_components/styles";

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

const muted = {
  ...styles.text,
  color: colors.muted,
  fontSize: "13px",
  lineHeight: "20px",
};

const PageSubscriptionEmail = ({ page, link, img }: PageSubscriptionProps) => {
  const host = URL.canParse(link) ? new URL(link).host : undefined;
  return (
    <Layout
      lang="de"
      preview="Ein Klick noch, dann informieren wir dich über Störungen."
      brand={statusPageBrand(page, img?.href ?? link, img?.src)}
      pill={{ tone: "neutral", label: "Bestätigen" }}
      footer={
        <Footer reason="Wenn du das nicht angefordert hast, ignoriere diese E-Mail. Ohne Bestätigung bekommst du keine weiteren Nachrichten." />
      }
    >
      <Heading title="Bitte bestätige dein Abo">
        Du hast {host ? `auf ${host} ` : ""}Benachrichtigungen zu Störungen und
        Wartungen bei {page} angefordert. Bestätige deine E-Mail-Adresse, damit
        wir dir diese Updates schicken.
      </Heading>
      <Actions primary={{ label: "Abo bestätigen", href: link }} />
      <Text style={muted}>Der Link gilt 7 Tage.</Text>
      <Text style={muted}>
        English: please confirm your subscription to {page} status updates with
        the button above.
      </Text>
    </Layout>
  );
};

PageSubscriptionEmail.PreviewProps = {
  link: "https://status.oeffigo.app/verify/token",
  page: "ÖffiGo",
} satisfies PageSubscriptionProps;

export default PageSubscriptionEmail;
