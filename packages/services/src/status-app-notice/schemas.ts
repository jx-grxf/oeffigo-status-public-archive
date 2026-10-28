import { z } from "zod";

export const statusAppNoticeKinds = ["report", "maintenance"] as const;
export type StatusAppNoticeKind = (typeof statusAppNoticeKinds)[number];

/** The app matches these names against the Bundesland of a stop, so they must
 *  stay exactly as written here (see `AustrianState` in the iOS app). */
export const austrianRegions = [
  "Wien",
  "Niederösterreich",
  "Burgenland",
  "Oberösterreich",
  "Steiermark",
  "Kärnten",
  "Salzburg",
  "Tirol",
  "Vorarlberg",
] as const;
export type AustrianRegion = (typeof austrianRegions)[number];

export const UpsertStatusAppNoticeInput = z.object({
  kind: z.enum(statusAppNoticeKinds),
  refId: z.number().int().positive(),
  showInApp: z.boolean(),
  /** Empty means all of Austria. */
  regions: z
    .array(z.enum(austrianRegions))
    .max(austrianRegions.length)
    .transform((list) => austrianRegions.filter((r) => list.includes(r))),
});
export type UpsertStatusAppNoticeInput = z.input<
  typeof UpsertStatusAppNoticeInput
>;

export const ListStatusAppNoticesInput = z.object({
  pageId: z.number().int().positive(),
});
export type ListStatusAppNoticesInput = z.input<
  typeof ListStatusAppNoticesInput
>;
