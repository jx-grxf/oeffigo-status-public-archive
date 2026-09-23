"use client";

import type { RouterOutputs } from "@openstatus/api";
import { Menu, Chat, Inbox } from "@openstatus/icons";
import { StatusPageGetInTouchIcon } from "@openstatus/ui/components/blocks/status-page-get-in-touch";
import {
  StatusPageHeader,
  StatusPageHeaderActions,
  StatusPageHeaderBrand,
  StatusPageHeaderBrandFallback,
  StatusPageHeaderContent,
  StatusPageHeaderNav,
  StatusPageHeaderNavItem,
} from "@openstatus/ui/components/blocks/status-page-header";
import { Button } from "@openstatus/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@openstatus/ui/components/ui/sheet";
import { cn } from "@openstatus/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useExtracted } from "next-intl";
import NextLink from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";

import { usePathnamePrefix } from "../../hooks/use-pathname-prefix";
import { useTRPC } from "../../lib/trpc/client";
import { Link } from "../common/link";
import { LocaleSwitcher } from "../locale-switcher";
import {
  type StatusUpdateType,
  StatusUpdates,
} from "../status-page/status-updates";
import { ThemeSwitcher } from "../themes/theme-switcher";

type Page = RouterOutputs["statusPage"]["get"];

function useNav() {
  const t = useExtracted();
  const pathname = usePathname();
  const prefix = usePathnamePrefix();

  return [
    {
      key: "status",
      label: t("Status"),
      href: `/${prefix}`,
      isActive: pathname === `/${prefix}`,
    },
    {
      key: "events",
      label: t("Events"),
      href: `${prefix ? `/${prefix}` : ""}/events`,
      isActive: pathname.startsWith(`${prefix ? `/${prefix}` : ""}/events`),
    },
  ];
}

function getStatusUpdateTypes(page: Page): StatusUpdateType[] {
  if (!page) return [];

  // NOTE: rss or json are not supported because of authentication
  if (page?.accessType === "email-domain") {
    return ["email"] as const;
  }

  if (page?.workspacePlan === "free") {
    return ["slack", "rss", "json"] as const;
  }

  return ["email", "rss", "json"] as const;
}

export function Header({
  className,
  ...props
}: React.ComponentProps<"header">) {
  const t = useExtracted();
  const trpc = useTRPC();
  const { domain } = useParams<{ domain: string }>();
  const { data: page } = useQuery({
    ...trpc.statusPage.get.queryOptions({ slug: domain }),
  });
  const prefix = usePathnamePrefix();

  return (
    <StatusPageHeader
      className={cn("group-data-[embed=true]/embed:hidden", className)}
      {...props}
    >
      <StatusPageHeaderContent className="max-w-6xl px-4 py-3 sm:px-6">
        {/* NOTE: same width as the `StatusUpdates` button */}
        <StatusPageHeaderBrand className="w-auto sm:w-[150px]">
          <Link
            variant="unstyled"
            className="flex items-center gap-2"
            href={page?.homepageUrl || `/${prefix}`}
            target={page?.homepageUrl ? "_blank" : undefined}
            rel={page?.homepageUrl ? "noreferrer" : undefined}
          >
            {page?.icon ? (
              <img src={page.icon} alt="" className="size-7" />
            ) : (
              <StatusPageHeaderBrandFallback title={page?.title} />
            )}
            <span className="text-base font-semibold tracking-tight">
              ÖffiGo{" "}
              <span className="text-muted-foreground hidden font-normal sm:inline">
                Status
              </span>
            </span>
          </Link>
        </StatusPageHeaderBrand>
        <NavDesktop className="hidden md:flex" />
        <StatusPageHeaderActions className="min-w-0 gap-1 sm:gap-2">
          {page?.contactUrl ? (
            <StatusPageGetInTouchIcon className="hidden sm:inline-flex">
              <a href={page.contactUrl} target="_blank" rel="noreferrer">
                <Chat />
                <span className="sr-only">{t("Get in touch")}</span>
              </a>
            </StatusPageGetInTouchIcon>
          ) : null}
          <LocaleSwitcher
            pageLocales={page?.locales}
            pageDefaultLocale={page?.defaultLocale}
          />
          <ThemeSwitcher />
          <SubscribeUpdates className="size-8 rounded-full p-0 sm:w-auto sm:px-4">
            <Inbox className="size-4 sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("Get updates")}</span>
          </SubscribeUpdates>
          <NavMobile className="md:hidden" />
        </StatusPageHeaderActions>
      </StatusPageHeaderContent>
    </StatusPageHeader>
  );
}

export function SubscribeUpdates(
  props: Omit<
    React.ComponentProps<typeof StatusUpdates>,
    "types" | "page" | "onSubscribe"
  >,
) {
  const trpc = useTRPC();
  const { domain } = useParams<{ domain: string }>();
  const { data: page } = useQuery(
    trpc.statusPage.get.queryOptions({ slug: domain }),
  );
  const subscribeMutation = useMutation(
    trpc.statusPage.subscribe.mutationOptions({}),
  );
  return (
    <StatusUpdates
      variant="default"
      types={getStatusUpdateTypes(page)}
      onSubscribe={async (values) => {
        await subscribeMutation.mutateAsync({ slug: domain, ...values });
      }}
      page={page}
      {...props}
    />
  );
}

function NavDesktop({
  className,
  ...props
}: React.ComponentProps<typeof StatusPageHeaderNav>) {
  const nav = useNav();
  return (
    <StatusPageHeaderNav className={className} {...props}>
      {nav.map((item) => (
        <StatusPageHeaderNavItem key={item.key} isActive={item.isActive}>
          <NextLink href={item.href}>{item.label}</NextLink>
        </StatusPageHeaderNavItem>
      ))}
    </StatusPageHeaderNav>
  );
}

function NavMobile({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const t = useExtracted();
  const [open, setOpen] = useState(false);
  const nav = useNav();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn("size-8 border", className)}
          {...props}
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader className="border-b">
          <SheetTitle>{t("Menu")}</SheetTitle>
        </SheetHeader>
        <div className="px-1 pb-4">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => {
              return (
                <li key={item.key} className="w-full">
                  <Button
                    variant={item.isActive ? "secondary" : "ghost"}
                    onClick={() => setOpen(false)}
                    className="w-full justify-start"
                    size="sm"
                    asChild
                  >
                    <NextLink href={item.href}>{item.label}</NextLink>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
