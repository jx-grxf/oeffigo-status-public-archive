"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Client } from "../../(status-page)/[domain]/[locale]/(public)/client";
import {
  buildPreview,
  type PreviewScenario,
  previewScenarios,
} from "../../../lib/oeffigo/preview";
import { useTRPC } from "../../../lib/trpc/client";

const scenarioLabels: Record<PreviewScenario, string> = {
  gruen: "Alles grün",
  stoerung: "Störung",
  ausfall: "Ausfall",
};

export function PreviewClient({ scenario }: { scenario: PreviewScenario }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Vor dem ersten Rendern füllen, damit die Seite nie eine leere Abfrage zeigt.
  const [preview] = useState(() => {
    const built = buildPreview(scenario);
    queryClient.setQueryDefaults(["oeffigo-status"], { staleTime: Infinity });
    const pageKey = trpc.statusPage.get.queryKey({ slug: undefined as never });
    queryClient.setQueryDefaults(pageKey, {
      staleTime: Infinity,
      retry: false,
    });
    queryClient.setQueryData(pageKey, built.page as never);
    for (const [range, data] of Object.entries(built.data))
      queryClient.setQueryData(["oeffigo-status", range], data);
    return built;
  });

  return (
    <>
      <nav className="text-muted-foreground flex flex-wrap gap-3 py-4 text-sm">
        <span>Vorschau mit Testdaten:</span>
        {previewScenarios.map((s) => (
          <a
            key={s}
            href={`/proto/seite?szenario=${s}`}
            className={
              s === scenario
                ? "text-foreground font-medium underline underline-offset-4"
                : "hover:text-foreground"
            }
          >
            {scenarioLabels[s]}
          </a>
        ))}
      </nav>
      <Client preview={preview} />
    </>
  );
}
