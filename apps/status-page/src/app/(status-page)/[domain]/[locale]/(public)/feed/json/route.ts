import { notFound, unauthorized } from "next/navigation";

import { auth } from "../../../../../../../lib/auth";
import {
  nativeStatus,
  serviceComponentStatus,
} from "../../../../../../../lib/oeffigo/model";
import { readCombinedStatus } from "../../../../../../../lib/oeffigo/public-state";
import { getQueryClient, trpc } from "../../../../../../../lib/trpc/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  props: { params: Promise<{ domain: string }> },
) {
  try {
    const queryClient = getQueryClient();
    const { domain } = await props.params;

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

    const live =
      process.env.OEFFIGO_SINGLE_TENANT === "true" && page.slug === "oeffigo"
        ? await readCombinedStatus(page.trackers)
        : undefined;

    const res = {
      title: page.title,
      description: page.description,
      status: live ? nativeStatus(live.overall) : page.status,
      observedStatus: live?.overall,
      checkedAt: live?.snapshot?.checkedAt ?? null,
      updatedAt: new Date(),
      // @deprecated Use pageComponents instead
      monitors: page.monitors.map((monitor) => ({
        id: monitor.id,
        name: monitor.name,
        description: monitor.description,
        status: monitor.status,
      })),
      // New field - exposes the page component structure
      pageComponents: page.pageComponents.map((component) => ({
        id: component.id,
        name: component.name,
        description: component.description,
        monitorId: component.monitorId,
        order: component.order,
        groupId: component.groupId,
        groupOrder: component.groupOrder,
        ...(live
          ? {
              status: serviceComponentStatus(
                live.services.find((s) => s.componentId === component.id)
                  ?.state ?? "unknown",
              ),
            }
          : {}),
      })),
      pageComponentGroups: page.pageComponentGroups.map((group) => ({
        id: group.id,
        name: group.name,
      })),
      maintenances: page.maintenances.map((maintenance) => ({
        id: maintenance.id,
        name: maintenance.title,
        message: maintenance.message,
        from: maintenance.from,
        to: maintenance.to,
        updatedAt: maintenance.updatedAt,
        // @deprecated Use components instead - returning monitor IDs for backwards compatibility
        monitors: maintenance.maintenancesToPageComponents
          .map((item) => item.pageComponent.monitorId)
          .filter((id): id is number => id !== null),
        // New field - references page component IDs
        pageComponents: maintenance.maintenancesToPageComponents.map(
          (item) => item.pageComponentId,
        ),
      })),
      statusReports: page.statusReports.map((report) => ({
        id: report.id,
        title: report.title,
        updatedAt: report.updatedAt,
        status: report.status,
        // @deprecated Use components instead - returning monitor IDs for backwards compatibility
        monitors: report.statusReportsToPageComponents
          .map((item) => item.pageComponent.monitorId)
          .filter((id): id is number => id !== null),
        // New field - references page component IDs
        pageComponents: report.statusReportsToPageComponents.map(
          (item) => item.pageComponentId,
        ),
        statusReportUpdates: report.statusReportUpdates.map((update) => ({
          id: update.id,
          status: update.status,
          message: update.message,
          date: update.date,
          updatedAt: update.updatedAt,
        })),
      })),
    };

    return new Response(JSON.stringify(res), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": live ? "no-store" : "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error generating feed:", error);
    throw error;
  }
}
