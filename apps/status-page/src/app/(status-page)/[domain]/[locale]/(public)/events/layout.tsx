"use client";

import {
  Status,
  StatusContent,
  StatusDescription,
  StatusHeader,
  StatusTitle,
} from "@openstatus/ui/components/blocks/status-layout";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";

import { useTRPC } from "../../../../../../lib/trpc/client";

export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { domain } = useParams<{ domain: string }>();
  const de = useLocale() === "de";
  const trpc = useTRPC();
  const { data: page } = useQuery(
    trpc.statusPage.get.queryOptions({ slug: domain }),
  );

  if (!page) return null;

  return (
    <Status className="mx-auto w-full max-w-3xl pt-12 sm:pt-16">
      <StatusHeader>
        <StatusTitle className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          {de ? "Meldungen und Wartungen" : "Reports and maintenance"}
        </StatusTitle>
        <StatusDescription className="text-base">
          {de
            ? "Von uns veröffentlichte Störungsmeldungen und geplante Wartungen."
            : "Incident reports and scheduled maintenance published by our team."}
        </StatusDescription>
      </StatusHeader>
      <StatusContent>{children}</StatusContent>
    </Status>
  );
}
