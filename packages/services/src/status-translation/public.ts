import { and, db as defaultDb, eq } from "@openstatus/db";
import {
  maintenance,
  statusReport,
  statusReportUpdate,
} from "@openstatus/db/src/schema";

import type { DB } from "../context";
import { readTranslations } from "./internal";

export type PublicStatusTranslations = {
  reports: Record<number, { title: string | null }>;
  updates: Record<number, { message: string | null }>;
  maintenances: Record<
    number,
    { title: string | null; message: string | null }
  >;
};

const empty = (): PublicStatusTranslations => ({
  reports: {},
  updates: {},
  maintenances: {},
});

/**
 * English copy for the reports and maintenances a status page already shows.
 * Callers must have passed the page's own visitor gate.
 */
export async function readPublicStatusTranslations(args: {
  pageId: number;
  db?: DB;
}): Promise<PublicStatusTranslations> {
  const db = args.db ?? defaultDb;
  const [reports, updates, maintenances] = await Promise.all([
    db
      .select({ id: statusReport.id })
      .from(statusReport)
      .where(eq(statusReport.pageId, args.pageId))
      .all(),
    db
      .select({ id: statusReportUpdate.id })
      .from(statusReportUpdate)
      .innerJoin(
        statusReport,
        eq(statusReport.id, statusReportUpdate.statusReportId),
      )
      .where(and(eq(statusReport.pageId, args.pageId)))
      .all(),
    db
      .select({ id: maintenance.id })
      .from(maintenance)
      .where(eq(maintenance.pageId, args.pageId))
      .all(),
  ]);

  let stored: Awaited<ReturnType<typeof readTranslations>>;
  try {
    stored = await readTranslations(db, [
      { kind: "report", ids: reports.map((r) => r.id) },
      { kind: "update", ids: updates.map((u) => u.id) },
      { kind: "maintenance", ids: maintenances.map((m) => m.id) },
    ]);
  } catch (error) {
    // Before the first bootstrap the table does not exist; German stays shown.
    if (String(error).includes("no such table")) return empty();
    throw error;
  }

  const result = empty();
  for (const t of stored.values()) {
    if (t.kind === "report") result.reports[t.refId] = { title: t.title };
    if (t.kind === "update") result.updates[t.refId] = { message: t.message };
    if (t.kind === "maintenance")
      result.maintenances[t.refId] = { title: t.title, message: t.message };
  }
  return result;
}
