import { generateThemeStyles } from "@openstatus/theme-store";
import {
  StatusPageMain,
  StatusPageShell,
} from "@openstatus/ui/components/blocks/status-page-shell";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";

import messages from "../../../../messages/de.json";
import { DateFnsProvider } from "../../../components/date-fns-provider";
import { StatusBlocksProvider } from "../../../components/i18n/status-blocks-provider";

export const metadata: Metadata = {
  title: "Statusseite mit Gruppen (Vorschau)",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style
        id="theme-styles"
        // eigene Theme-Tokens, keine Nutzereingabe
        // oxlint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: generateThemeStyles("oeffigo") }}
      />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <NextIntlClientProvider locale="de" messages={messages}>
          <DateFnsProvider locale="de">
            <StatusBlocksProvider>
              <StatusPageShell className="gap-0 overflow-x-clip">
                <StatusPageMain className="relative max-w-6xl px-4 py-0 sm:px-6">
                  {children}
                </StatusPageMain>
              </StatusPageShell>
            </StatusBlocksProvider>
          </DateFnsProvider>
        </NextIntlClientProvider>
      </ThemeProvider>
    </>
  );
}
