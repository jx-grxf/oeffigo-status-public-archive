import { and, db as defaultDb, desc, eq } from "@openstatus/db";
import {
  maintenance,
  statusReport,
  statusReportUpdate,
} from "@openstatus/db/src/schema";

import type { DB, ServiceContext } from "../context";
import { getPageInWorkspace } from "../page/internal";
import { readTranslations, translationKey } from "./internal";
import { ListStatusTranslationsInput } from "./schemas";

/** German source text next to its English copy, for the translation editor. */
export async function listStatusTranslations(args: {
  ctx: ServiceContext;
  input: ListStatusTranslationsInput;
}) {
  const { ctx } = args;
  const input = ListStatusTranslationsInput.parse(args.input);
  const db = ctx.db ?? defaultDb;
  await getPageInWorkspace({
    tx: db,
    id: input.pageId,
    workspaceId: ctx.workspace.id,
  });
  return readPageSources(db, input.pageId, ctx.workspace.id);
}

async function readPageSources(db: DB, pageId: number, workspaceId: number) {
  const reports = await db
    .select({ id: statusReport.id, title: statusReport.title })
    .from(statusReport)
    .where(
      and(
        eq(statusReport.pageId, pageId),
        eq(statusReport.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(statusReport.id))
    .all();
  const updates = reports.length
    ? await db
        .select({
          id: statusReportUpdate.id,
          statusReportId: statusReportUpdate.statusReportId,
          status: statusReportUpdate.status,
          date: statusReportUpdate.date,
          message: statusReportUpdate.message,
        })
        .from(statusReportUpdate)
        .innerJoin(
          statusReport,
          eq(statusReport.id, statusReportUpdate.statusReportId),
        )
        .where(
          and(
            eq(statusReport.pageId, pageId),
            eq(statusReport.workspaceId, workspaceId),
          ),
        )
        .orderBy(desc(statusReportUpdate.date))
        .all()
    : [];
  const maintenances = await db
    .select({
      id: maintenance.id,
      title: maintenance.title,
      message: maintenance.message,
      from: maintenance.from,
    })
    .from(maintenance)
    .where(
      and(
        eq(maintenance.pageId, pageId),
        eq(maintenance.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(maintenance.from))
    .all();

  const english = await readTranslations(db, [
    { kind: "report", ids: reports.map((r) => r.id) },
    { kind: "update", ids: updates.map((u) => u.id) },
    { kind: "maintenance", ids: maintenances.map((m) => m.id) },
  ]);

  return {
    reports: reports.map((report) => ({
      ...report,
      englishTitle:
        english.get(translationKey("report", report.id))?.title ?? null,
      updates: updates
        .filter((u) => u.statusReportId === report.id)
        .map((update) => ({
          ...update,
          englishMessage:
            english.get(translationKey("update", update.id))?.message ?? null,
        })),
    })),
    maintenances: maintenances.map((m) => {
      const translation = english.get(translationKey("maintenance", m.id));
      return {
        ...m,
        englishTitle: translation?.title ?? null,
        englishMessage: translation?.message ?? null,
      };
    }),
  };
}
