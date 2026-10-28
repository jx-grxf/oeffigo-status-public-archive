import { sql } from "@openstatus/db";
import { page } from "@openstatus/db/src/schema";
import {
  ListStatusTranslationsInput,
  UpsertStatusTranslationInput,
  listStatusTranslations,
  readPublicStatusTranslations,
  upsertStatusTranslation,
} from "@openstatus/services/status-translation";
import { z } from "zod";

import { resolvePageAccess } from "../lib/page-access";
import { toServiceCtx, toTRPCError } from "../service-adapter";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const statusTranslationRouter = createTRPCRouter({
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
      return readPublicStatusTranslations({ pageId: target.id, db: ctx.db });
    }),

  list: protectedProcedure
    .input(ListStatusTranslationsInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listStatusTranslations({ ctx: toServiceCtx(ctx), input });
      } catch (err) {
        toTRPCError(err);
      }
    }),

  upsert: protectedProcedure
    .input(UpsertStatusTranslationInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await upsertStatusTranslation({ ctx: toServiceCtx(ctx), input });
      } catch (err) {
        toTRPCError(err);
      }
    }),
});
