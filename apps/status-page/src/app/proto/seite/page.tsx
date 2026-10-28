import { notFound } from "next/navigation";

import { parsePreviewScenario } from "../../../lib/oeffigo/preview";
import { PreviewClient } from "./preview-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ szenario?: string }>;
}) {
  // Testdaten gehören nie auf die echte Seite, auch wenn der Proxy einmal durchließe.
  if (process.env.NODE_ENV === "production") notFound();
  const { szenario } = await searchParams;
  return <PreviewClient scenario={parsePreviewScenario(szenario)} />;
}
