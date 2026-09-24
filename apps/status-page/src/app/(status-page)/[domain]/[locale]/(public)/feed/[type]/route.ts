import { statusLabel } from "@openstatus/utils";
import { Feed } from "feed";
import { notFound, unauthorized } from "next/navigation";

import { auth } from "../../../../../../../lib/auth";
import { getBaseUrl } from "../../../../../../../lib/base-url";
import { newestFeedItemsFirst } from "../../../../../../../lib/feed-order";
import { getQueryClient, trpc } from "../../../../../../../lib/trpc/server";

export const revalidate = 60;

export async function GET(
  _request: Request,
  props: { params: Promise<{ domain: string; locale: string; type: string }> },
) {
  try {
    const queryClient = getQueryClient();
    const { domain, locale, type } = await props.params;

    if (!["rss", "atom"].includes(type)) return notFound();

    const _page = await queryClient.fetchQuery(
      trpc.statusPage.getLight.queryOptions({ slug: domain }),
    );
    if (!_page) return notFound();

    if (_page.accessType === "password") {
      const url = new URL(_request.url);
      const authorized = await queryClient.fetchQuery(
        trpc.statusPage.isPasswordAuthorized.queryOptions({
          slug: _page.slug,
          queryPassword: url.searchParams.get("pw"),
        }),
      );
      if (!authorized) return unauthorized();
    }

    if (_page.accessType === "email-domain") {
      const session = await auth();
      const user = session?.user;
      const allowedDomains = _page.authEmailDomains ?? [];
      if (!user || !user.email) return unauthorized();
      if (!allowedDomains.includes(user.email.split("@")[1]))
        return unauthorized();
    }

    const page = await queryClient.fetchQuery(
      trpc.statusPage.get.queryOptions({
        slug: domain,
        pw: new URL(_request.url).searchParams.get("pw"),
      }),
    );
    if (!page) return notFound();

    const baseUrl = getBaseUrl({
      slug: page.slug,
      customDomain: page.customDomain,
    });
    const localizedBaseUrl = locale === "en" ? `${baseUrl}/en` : baseUrl;
    const germanIncidentCopy = page.slug === "oeffigo";

    const feed = new Feed({
      id: `${localizedBaseUrl}/feed/${type}`,
      title: page.title,
      description:
        germanIncidentCopy && locale === "en"
          ? "ÖffiGo status updates. Incident details are currently published in German."
          : page.description,
      generator: `${page.title} Status`,
      feedLinks: {
        rss: `${localizedBaseUrl}/feed/rss`,
        atom: `${localizedBaseUrl}/feed/atom`,
      },
      link: localizedBaseUrl,
      author: {
        name: page.title,
        email:
          page.contactUrl?.startsWith("mailto:") && page.contactUrl !== null
            ? page.contactUrl.slice(7)
            : undefined,
        link: page.homepageUrl || baseUrl,
      },
      copyright: `© ${new Date().getFullYear()} ${page.title}`,
      language: germanIncidentCopy ? "de-AT" : locale === "en" ? "en" : "de-AT",
      updated: new Date(),
      ttl: 60,
    });

    for (const maintenance of page.maintenances ?? []) {
      const maintenanceUrl = `${localizedBaseUrl}/events/maintenance/${maintenance.id}`;
      feed.addItem({
        id: maintenanceUrl,
        title: `${statusLabel("maintenance")} - ${maintenance.title}`,
        link: maintenanceUrl,
        description: maintenance.message,
        date: maintenance.updatedAt ?? maintenance.createdAt ?? new Date(),
      });
    }

    for (const statusReport of page.statusReports ?? []) {
      const statusReportUrl = `${localizedBaseUrl}/events/report/${statusReport.id}`;
      const status = statusLabel(statusReport.status);
      const statusReportUpdates = (statusReport.statusReportUpdates ?? [])
        .map((update) => {
          const updateStatus = statusLabel(update.status);
          return `${updateStatus}: ${update.message}.`;
        })
        .join("\n\n");

      feed.addItem({
        id: statusReportUrl,
        title: `${status} - ${statusReport.title}`,
        link: statusReportUrl,
        description: statusReportUpdates,
        date: statusReport.updatedAt ?? statusReport.createdAt ?? new Date(),
      });
    }

    newestFeedItemsFirst(feed);

    const res = type === "atom" ? feed.atom1() : feed.rss2();

    return new Response(res, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Error generating feed:", error);
    throw error;
  }
}
