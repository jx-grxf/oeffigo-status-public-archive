import { z } from "zod";

export const statusTranslationKinds = [
  "report",
  "update",
  "maintenance",
] as const;
export type StatusTranslationKind = (typeof statusTranslationKinds)[number];

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const UpsertStatusTranslationInput = z
  .object({
    kind: z.enum(statusTranslationKinds),
    refId: z.number().int().positive(),
    title: text(256).optional(),
    message: text(20_000).optional(),
  })
  .refine((input) => input.kind !== "report" || input.message === undefined, {
    message: "A report translation carries only a title.",
  })
  .refine((input) => input.kind !== "update" || input.title === undefined, {
    message: "An update translation carries only a message.",
  });
export type UpsertStatusTranslationInput = z.input<
  typeof UpsertStatusTranslationInput
>;

export const ListStatusTranslationsInput = z.object({
  pageId: z.number().int().positive(),
});
export type ListStatusTranslationsInput = z.input<
  typeof ListStatusTranslationsInput
>;
