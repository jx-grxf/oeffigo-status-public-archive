"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { useTRPC } from "../trpc/client";
import type { EnglishCopy } from "./incident-copy";

/** English incident copy on `/en` of the ÖffiGo page; `null` everywhere else. */
export function useEnglishCopy(slug: string | undefined): EnglishCopy | null {
  const locale = useLocale();
  const trpc = useTRPC();
  const enabled = locale === "en" && slug === "oeffigo";
  const { data } = useQuery({
    ...trpc.statusTranslation.published.queryOptions({ slug: slug ?? "" }),
    enabled,
  });
  return enabled ? (data ?? null) : null;
}
