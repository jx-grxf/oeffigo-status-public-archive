import { cn } from "@openstatus/ui/lib/utils";
import type { Metadata } from "next";

import "./globals.css";
import LocalFont from "next/font/local";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { TailwindIndicator } from "../components/tailwind-indicator";
import { TRPCReactProvider } from "../lib/trpc/client";
import { defaultMetadata } from "./metadata";

const cal = LocalFont({
  src: "../../public/fonts/CalSans-SemiBold.ttf",
  variable: "--font-cal-sans",
});

const geistSans = LocalFont({
  src: "../../public/fonts/inter-var-latin.woff2",
  variable: "--font-geist-sans",
});
const geistMono = LocalFont({
  src: "../../public/fonts/ibm-plex-mono-400-latin.woff2",
  variable: "--font-geist-mono",
});

const commitMono = LocalFont({
  src: [
    {
      path: "../../public/fonts/CommitMono-400-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/CommitMono-400-Italic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/CommitMono-700-Regular.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/CommitMono-700-Italic.otf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-commit-mono",
});

export const metadata: Metadata = defaultMetadata;

// export const dynamic = "error";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          cal.variable,
          commitMono.variable,
          "antialiased",
        )}
      >
        <NuqsAdapter>
          <TRPCReactProvider>
            {children}
            <TailwindIndicator />
          </TRPCReactProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
