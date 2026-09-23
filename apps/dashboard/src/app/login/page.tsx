import { Separator } from "@openstatus/ui/components/ui/separator";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";

import { isGitHubLoginConfigured } from "@/lib/auth/github-owner";

import { signInWithGitHubAction } from "./_components/actions";
import { GitHubLoginButton } from "./_components/github-login-button";
import MagicLinkForm from "./_components/magic-link-form";
import { searchParamsCache } from "./search-params";

export const metadata: Metadata = {
  title: { absolute: "ÖffiGo Statusverwaltung" },
  description: "Geschützter Zugang zur Verwaltung der ÖffiGo-Statusseite.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://status-admin.oeffigo.app/login" },
  openGraph: {
    title: "ÖffiGo Statusverwaltung",
    description: "Geschützter Zugang zur ÖffiGo-Statusseite.",
    url: "https://status-admin.oeffigo.app/login",
    siteName: "ÖffiGo",
  },
  twitter: {
    title: "ÖffiGo Statusverwaltung",
    description: "Geschützter Zugang zur ÖffiGo-Statusseite.",
  },
};

export default async function Page(props: {
  searchParams: Promise<SearchParams>;
}) {
  const { error } = searchParamsCache.parse(await props.searchParams);
  const hasGitHub = isGitHubLoginConfigured();

  return (
    <div className="grid w-full max-w-md gap-8">
      <div className="grid gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Verwaltung
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          ÖffiGo Statusverwaltung
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Melde dich an, um Störungen, Wartungen und Benachrichtigungen zu
          verwalten.
        </p>
      </div>
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm leading-relaxed"
        >
          {error === "AccessDenied"
            ? "Dieser Zugang ist für dein Konto nicht freigeschaltet. Bitte verwende das hinterlegte Betreiberkonto."
            : "Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut oder nutze den Anmeldelink per E-Mail."}
        </div>
      ) : null}
      <div className="grid gap-6">
        {hasGitHub ? (
          <>
            <form action={signInWithGitHubAction}>
              <GitHubLoginButton />
            </form>
            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">
                oder per E-Mail
              </span>
              <Separator className="flex-1" />
            </div>
          </>
        ) : null}
        <MagicLinkForm />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Nur für die Verwaltung. Die öffentliche Statusseite ist ohne Anmeldung
        erreichbar.
      </p>
    </div>
  );
}
