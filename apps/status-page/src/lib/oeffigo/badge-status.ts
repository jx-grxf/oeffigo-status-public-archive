import type { Status } from "@openstatus/react";
import { getStatus } from "@openstatus/react";

import { getQueryClient, trpc } from "../trpc/server";
import type { ServiceState } from "./model";
import { readCombinedStatus } from "./public-state";

const fromState: Record<ServiceState, Status> = {
  operational: "operational",
  degraded: "degraded_performance",
  down: "major_outage",
  paused: "under_maintenance",
  unknown: "unknown",
};

/**
 * Das Badge zeigt dieselbe Gesamtlage wie die Seite. Upstream fragt dafür
 * api.openstatus.dev, die unsere Messung nicht kennt (stand dauerhaft auf
 * „Unknown“ und brauchte bis zu 8 s).
 */
export async function badgeStatus(domain: string): Promise<Status> {
  if (process.env.OEFFIGO_SINGLE_TENANT !== "true")
    return (await getStatus(domain)).status;
  const page = await getQueryClient()
    .fetchQuery(trpc.statusPage.get.queryOptions({ slug: domain }))
    .catch(() => null);
  if (!page || page.slug !== "oeffigo" || page.accessType !== "public")
    return "unknown";
  const merged = await readCombinedStatus(page.trackers);
  if (
    merged.overall === "operational" &&
    merged.services.some((s) => s.maintenance)
  )
    return "under_maintenance";
  return fromState[merged.overall];
}
