import { eq, sql } from "@openstatus/db";
import { maintenance, page, statusReport } from "@openstatus/db/src/schema";
import {
  ListStatusAppNoticesInput,
  UpsertStatusAppNoticeInput,
  listStatusAppNotices,
  readPublicAppNotices,
  upsertStatusAppNotice,
} from "@openstatus/services/status-app-notice";
import { z } from "zod";

import { resolvePageAccess } from "../lib/page-access";
import { toServiceCtx, toTRPCError } from "../service-adapter";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const statusAppNoticeRouter = createTRPCRouter({
  published: publicProcedure
    .input(
      z.object({
        slug: z.string().toLowerCase(),
        pw: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const target = await ctx.db.query.page.findFirst({
        where: sql`lower(${page.slug}) = ${input.slug} OR lower(${page.customDomain}) = ${input.slug}`,
      });
      if (!target?.published) return null;
      if (!resolvePageAccess(ctx, target, input.pw).ok) return null;
      const reports = await ctx.db
        .select({ id: statusReport.id })
        .from(statusReport)
        .where(eq(statusReport.pageId, target.id))
        .all();
      const maintenances = await ctx.db
        .select({ id: maintenance.id })
        .from(maintenance)
        .where(eq(maintenance.pageId, target.id))
        .all();
      return readPublicAppNotices({
        db: ctx.db,
        reportIds: reports.map((r) => r.id),
        maintenanceIds: maintenances.map((m) => m.id),
      });
    }),

  list: protectedProcedure
    .input(ListStatusAppNoticesInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listStatusAppNotices({ ctx: toServiceCtx(ctx), input });
      } catch (err) {
        toTRPCError(err);
      }
    }),

  upsert: protectedProcedure
    .input(UpsertStatusAppNoticeInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await upsertStatusAppNotice({ ctx: toServiceCtx(ctx), input });
      } catch (err) {
        toTRPCError(err);
      }
    }),
});
