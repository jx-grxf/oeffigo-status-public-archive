import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { statusPageAlternatesMetadata } from "../../../../../../lib/alternates-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  return statusPageAlternatesMetadata({ domain, markdownPath: "/monitors.md" });
}

// ÖffiGo misst ohne OpenStatus-Monitore; die Upstream-Seite wäre nur leer.
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  if (process.env.OEFFIGO_SINGLE_TENANT === "true") {
    const { locale } = await params;
    redirect(locale === "en" ? "/en" : "/");
  }
  return children;
}
