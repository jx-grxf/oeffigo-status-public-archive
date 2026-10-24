import type { DB } from "../context";
import { type StoredAppNotice, appNoticeKey, readAppNotices } from "./internal";

export type PublicAppNotices = {
  reports: Record<number, Pick<StoredAppNotice, "showInApp" | "regions">>;
  maintenances: Record<number, Pick<StoredAppNotice, "showInApp" | "regions">>;
};

/**
 * App settings for reports and maintenances a status page already shows.
 * `null` means the table is missing or unreadable: the feed then omits the
 * fields and the ÖffiGo server falls back to its old rule (show everything).
 */
export async function readPublicAppNotices(args: {
  db: DB;
  reportIds: number[];
  maintenanceIds: number[];
}): Promise<PublicAppNotices | null> {
  let stored: Map<string, StoredAppNotice>;
  try {
    stored = await readAppNotices(args.db, [
      { kind: "report", ids: args.reportIds },
      { kind: "maintenance", ids: args.maintenanceIds },
    ]);
  } catch (error) {
    if (String(error).includes("no such table")) return null;
    throw error;
  }
  const pick = (kind: "report" | "maintenance", id: number) => {
    const s = stored.get(appNoticeKey(kind, id));
    return { showInApp: s?.showInApp ?? false, regions: s?.regions ?? [] };
  };
  return {
    reports: Object.fromEntries(
      args.reportIds.map((id) => [id, pick("report", id)]),
    ),
    maintenances: Object.fromEntries(
      args.maintenanceIds.map((id) => [id, pick("maintenance", id)]),
    ),
  };
}
