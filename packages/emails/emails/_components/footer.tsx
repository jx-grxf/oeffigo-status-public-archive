/** @jsxRuntime automatic @jsxImportSource react */
import { Link, Section, Text } from "react-email";

import { styles } from "./styles";
export function Footer() {
  return (
    <Section style={{ textAlign: "center" }}>
      <Text>
        <Link style={styles.link} href="https://status.oeffigo.app">
          ÖffiGo Status
        </Link>
        {" · "}
        <Link style={styles.link} href="mailto:contact@oeffigo.app">
          Kontakt
        </Link>
      </Text>
      <Text>
        <Link style={styles.link} href="https://oeffigo.app/impressum">
          Impressum
        </Link>
        {" · "}
        <Link style={styles.link} href="https://oeffigo.app/datenschutz">
          Datenschutz
        </Link>
      </Text>
    </Section>
  );
}
