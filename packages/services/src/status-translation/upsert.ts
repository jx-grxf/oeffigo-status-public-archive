import { sql } from "@openstatus/db";

import { emitAudit } from "../audit";
import { requireScope } from "../auth";
import { type ServiceContext, withTransaction } from "../context";
import {
  type StoredTranslation,
  getSourceInWorkspace,
  readTranslations,
  translationKey,
} from "./internal";
import { UpsertStatusTranslationInput } from "./schemas";

/** Sets the English copy of a report title, update message or maintenance. Empty clears it. */
export async function upsertStatusTranslation(args: {
  ctx: ServiceContext;
  input: UpsertStatusTranslationInput;
}): Promise<StoredTranslation | null> {
  const { ctx } = args;
  requireScope(ctx, "write");
  const input = UpsertStatusTranslationInput.parse(args.input);

  return withTransaction(ctx, async (tx) => {
    const source = await getSourceInWorkspace({
      tx,
      kind: input.kind,
      refId: input.refId,
      workspaceId: ctx.workspace.id,
    });
    const existing =
      (
        await readTranslations(tx, [{ kind: input.kind, ids: [input.refId] }])
      ).get(translationKey(input.kind, input.refId)) ?? null;

    const title =
      input.title === undefined ? (existing?.title ?? null) : input.title;
    const message =
      input.message === undefined ? (existing?.message ?? null) : input.message;

    if (title === null && message === null) {
      await tx.run(
        sql`DELETE FROM oeffigo_translation WHERE kind = ${input.kind} AND ref_id = ${input.refId} AND locale = 'en'`,
      );
    } else {
      await tx.run(
        sql`INSERT INTO oeffigo_translation (kind, ref_id, locale, title, message, updated_at) VALUES (${input.kind}, ${input.refId}, 'en', ${title}, ${message}, ${Date.now()}) ON CONFLICT (kind, ref_id, locale) DO UPDATE SET title = excluded.title, message = excluded.message, updated_at = excluded.updated_at`,
      );
    }

    const before = {
      englishTitle: existing?.title ?? null,
      englishMessage: existing?.message ?? null,
    };
    const after = { englishTitle: title, englishMessage: message };
    if (source.auditEntity === "status_report_update") {
      await emitAudit(tx, ctx, {
        action: "status_report_update.update",
        entityType: "status_report_update",
        entityId: input.refId,
        before,
        after,
        metadata: { statusReportId: source.statusReportId },
      });
    } else if (source.auditEntity === "status_report") {
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

    if (title === null && message === null) return null;
    return { kind: input.kind, refId: input.refId, title, message };
  });
}
