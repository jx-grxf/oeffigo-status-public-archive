import { and, eq, sql } from "@openstatus/db";
import { maintenance, statusReport } from "@openstatus/db/src/schema";

import { emitAudit } from "../audit";
import { requireScope } from "../auth";
import { type DB, type ServiceContext, withTransaction } from "../context";
import { NotFoundError } from "../errors";
import { type StoredAppNotice, appNoticeKey, readAppNotices } from "./internal";
import {
  type StatusAppNoticeKind,
  UpsertStatusAppNoticeInput,
} from "./schemas";

async function assertInWorkspace(
  tx: DB,
  kind: StatusAppNoticeKind,
  refId: number,
  workspaceId: number,
) {
  const table = kind === "report" ? statusReport : maintenance;
  const row = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, refId), eq(table.workspaceId, workspaceId)))
    .get();
  if (!row)
    throw new NotFoundError(
      kind === "report" ? "status_report" : "maintenance",
      refId,
    );
}

/** Whether a report or maintenance reaches the app, and for which Bundesländer. Sends nothing. */
export async function upsertStatusAppNotice(args: {
  ctx: ServiceContext;
  input: UpsertStatusAppNoticeInput;
}): Promise<StoredAppNotice> {
  const { ctx } = args;
  requireScope(ctx, "write");
  const input = UpsertStatusAppNoticeInput.parse(args.input);

  return withTransaction(ctx, async (tx) => {
    await assertInWorkspace(tx, input.kind, input.refId, ctx.workspace.id);
    const existing =
      (
        await readAppNotices(tx, [{ kind: input.kind, ids: [input.refId] }])
      ).get(appNoticeKey(input.kind, input.refId)) ?? null;

    await tx.run(
      sql`INSERT INTO oeffigo_app_notice (kind, ref_id, show_in_app, regions, updated_at) VALUES (${input.kind}, ${input.refId}, ${input.showInApp ? 1 : 0}, ${JSON.stringify(input.regions)}, ${Date.now()}) ON CONFLICT (kind, ref_id) DO UPDATE SET show_in_app = excluded.show_in_app, regions = excluded.regions, updated_at = excluded.updated_at`,
    );

    const before = {
      showInApp: existing?.showInApp ?? false,
      regions: existing?.regions ?? [],
    };
    const after = { showInApp: input.showInApp, regions: input.regions };
    if (input.kind === "report") {
      await emitAudit(tx, ctx, {
        action: "status_report.update",
        entityType: "status_report",
        entityId: input.refId,
        before,
        after,
      });
    } else {
      await emitAudit(tx, ctx, {
        action: "maintenance.update",
        entityType: "maintenance",
        entityId: input.refId,
        before,
        after,
      });
    }

    return {
      kind: input.kind,
      refId: input.refId,
      showInApp: input.showInApp,
      regions: input.regions,
    };
  });
}
