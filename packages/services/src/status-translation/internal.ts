import { and, eq, sql } from "@openstatus/db";
import {
  maintenance,
  statusReport,
  statusReportUpdate,
} from "@openstatus/db/src/schema";

import type { DB } from "../context";
import { NotFoundError } from "../errors";
import type { StatusTranslationKind } from "./schemas";

export type StoredTranslation = {
  kind: StatusTranslationKind;
  refId: number;
  title: string | null;
  message: string | null;
};

type Row = {
  kind: StatusTranslationKind;
  ref_id: number;
  title: string | null;
  message: string | null;
};

export async function readTranslations(
  db: DB,
  refs: { kind: StatusTranslationKind; ids: number[] }[],
): Promise<Map<string, StoredTranslation>> {
  const result = new Map<string, StoredTranslation>();
  for (const { kind, ids } of refs) {
    if (ids.length === 0) continue;
    const rows = await db.all<Row>(
      sql`SELECT kind, ref_id, title, message FROM oeffigo_translation WHERE locale = 'en' AND kind = ${kind} AND ref_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    for (const row of rows) {
      result.set(translationKey(row.kind, row.ref_id), {
        kind: row.kind,
        refId: row.ref_id,
        title: row.title,
        message: row.message,
      });
    }
  }
  return result;
}

export function translationKey(kind: StatusTranslationKind, refId: number) {
  return `${kind}:${refId}`;
}

/** The German source row, scoped to the workspace; throws when it is foreign. */
export async function getSourceInWorkspace(args: {
  tx: DB;
  kind: StatusTranslationKind;
  refId: number;
  workspaceId: number;
}) {
  const { tx, kind, refId, workspaceId } = args;
  if (kind === "report") {
    const row = await tx
      .select({ id: statusReport.id, title: statusReport.title })
      .from(statusReport)
      .where(
        and(
          eq(statusReport.id, refId),
          eq(statusReport.workspaceId, workspaceId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("status_report", refId);
    return { auditEntity: "status_report" as const, statusReportId: row.id };
  }
  if (kind === "update") {
    const row = await tx
      .select({
        id: statusReportUpdate.id,
        statusReportId: statusReportUpdate.statusReportId,
      })
      .from(statusReportUpdate)
      .innerJoin(
        statusReport,
        eq(statusReport.id, statusReportUpdate.statusReportId),
      )
      .where(
        and(
          eq(statusReportUpdate.id, refId),
          eq(statusReport.workspaceId, workspaceId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("status_report_update", refId);
    return {
      auditEntity: "status_report_update" as const,
      statusReportId: row.statusReportId,
    };
  }
  const row = await tx
    .select({ id: maintenance.id })
    .from(maintenance)
    .where(
      and(eq(maintenance.id, refId), eq(maintenance.workspaceId, workspaceId)),
    )
    .get();
  if (!row) throw new NotFoundError("maintenance", refId);
  return { auditEntity: "maintenance" as const, statusReportId: undefined };
}
