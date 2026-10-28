import { and, db as defaultDb, desc, eq } from "@openstatus/db";
import { maintenance, statusReport } from "@openstatus/db/src/schema";

import type { ServiceContext } from "../context";
import { getPageInWorkspace } from "../page/internal";
import { appNoticeKey, readAppNotices } from "./internal";
import { ListStatusAppNoticesInput } from "./schemas";

/** Every report and maintenance of a page with its app setting, newest first. */
export async function listStatusAppNotices(args: {
  ctx: ServiceContext;
  input: ListStatusAppNoticesInput;
}) {
  const { ctx } = args;
  const input = ListStatusAppNoticesInput.parse(args.input);
  const db = ctx.db ?? defaultDb;
  await getPageInWorkspace({
    tx: db,
    id: input.pageId,
    workspaceId: ctx.workspace.id,
  });
  const workspaceId = ctx.workspace.id;

  const reports = await db
    .select({
      id: statusReport.id,
      title: statusReport.title,
      status: statusReport.status,
      updatedAt: statusReport.updatedAt,
    })
    .from(statusReport)
    .where(
      and(
        eq(statusReport.pageId, input.pageId),
        eq(statusReport.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(statusReport.id))
    .all();
  const maintenances = await db
    .select({
      id: maintenance.id,
      title: maintenance.title,
      from: maintenance.from,
      to: maintenance.to,
    })
    .from(maintenance)
    .where(
      and(
        eq(maintenance.pageId, input.pageId),
        eq(maintenance.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(maintenance.from))
    .all();

  const stored = await readAppNotices(db, [
    { kind: "report", ids: reports.map((r) => r.id) },
    { kind: "maintenance", ids: maintenances.map((m) => m.id) },
  ]);
  const setting = (kind: "report" | "maintenance", id: number) => {
    const s = stored.get(appNoticeKey(kind, id));
    return { showInApp: s?.showInApp ?? false, regions: s?.regions ?? [] };
  };

  return {
    reports: reports.map((r) => ({ ...r, ...setting("report", r.id) })),
    maintenances: maintenances.map((m) => ({
      ...m,
      ...setting("maintenance", m.id),
    })),
  };
}
