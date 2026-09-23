"use client";

import { Clock } from "@openstatus/icons";
import {
  StatusPageFooter,
  StatusPageFooterActions,
  StatusPageFooterContent,
} from "@openstatus/ui/components/blocks/status-page-footer";
import { Skeleton } from "@openstatus/ui/components/ui/skeleton";
import { cn } from "@openstatus/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useEmbed } from "../../hooks/use-embed";
import { useTRPC } from "../../lib/trpc/client";
import { TimestampHoverCard } from "../content/timestamp-hover-card";

export function Footer({
  className,
  ...props
}: React.ComponentProps<"footer">) {
  const { domain } = useParams<{ domain: string }>();
  const [isMounted, setIsMounted] = useState(false);
  const trpc = useTRPC();
  const { data: page, dataUpdatedAt } = useQuery({
    ...trpc.statusPage.get.queryOptions({ slug: domain }),
  });
  const embed = useEmbed();
  const de = useLocale() === "de";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!page) return null;

  // Whitelabel pages: hide the footer entirely in embed mode.
  // Non-whitelabel pages: keep the "powered by" attribution visible; right-side controls hidden via CSS.
  if (embed.mode && page.whiteLabel) return null;

  return (
    <StatusPageFooter
      className={cn("group-data-[embed=true]/embed:border-t-0", className)}
      {...props}
    >
      <StatusPageFooterContent className="max-w-6xl flex-wrap px-4 py-6 group-data-[embed=true]/embed:justify-center sm:px-6">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a className="text-foreground font-medium" href="https://oeffigo.app">
            ÖffiGo
          </a>
          {page.contactUrl ? (
            <a className="hover:text-foreground" href={page.contactUrl}>
              {de ? "Kontakt" : "Contact"}
            </a>
          ) : null}
          <a
            className="hover:text-foreground"
            href="https://oeffigo.app/impressum"
          >
            {de ? "Impressum" : "Legal notice"}
          </a>
          <a
            className="hover:text-foreground"
            href="https://oeffigo.app/datenschutz"
          >
            {de ? "Datenschutz" : "Privacy"}
          </a>
          <a className="hover:text-foreground" href="/api/license">
            {de ? "Lizenz" : "License"}
          </a>
        </div>
        <StatusPageFooterActions className="ml-auto group-data-[embed=true]/embed:hidden">
          <TimestampHoverCard
            date={new Date(dataUpdatedAt)}
            side="top"
            align="end"
            className="text-muted-foreground/70 mr-2 flex items-center gap-1.5"
          >
            {isMounted ? (
              <>
                <Clock className="size-3" />
                <span className="font-mono text-xs">{timezone}</span>
              </>
            ) : (
              <Skeleton className="h-4 w-28" />
            )}
          </TimestampHoverCard>
        </StatusPageFooterActions>
      </StatusPageFooterContent>
    </StatusPageFooter>
  );
}
