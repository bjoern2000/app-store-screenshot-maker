import { z } from "zod";

export const PlatformSchema = z.enum(["app_store", "play_store"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const DeviceSchema = z.enum(["iphone", "android_phone"]);
export type Device = z.infer<typeof DeviceSchema>;

export const CanvasIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "id must be lowercase letters, digits, dashes, or underscores");

export const LocaleSchema = z
  .string()
  .min(2)
  .max(10)
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "locale must look like 'en' or 'en-US'");

export const DimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Dimensions = z.infer<typeof DimensionsSchema>;

export const CanvasEntrySchema = z.object({
  id: CanvasIdSchema,
  platform: PlatformSchema,
  device: DeviceSchema,
  order: z.number().int().min(0),
});
export type CanvasEntry = z.infer<typeof CanvasEntrySchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  /** Short slug used as a prefix in output filenames. Defaults to the project dir basename. */
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "name must be lowercase letters, digits, dashes, or underscores")
    .optional(),
  locales: z.array(LocaleSchema).default(["en"]),
  defaultLocale: LocaleSchema.default("en"),
  dimensions: z
    .object({
      app_store: z.object({ iphone: DimensionsSchema.optional() }).partial().optional(),
      play_store: z.object({ android_phone: DimensionsSchema.optional() }).partial().optional(),
    })
    .partial()
    .optional(),
  canvases: z.array(CanvasEntrySchema).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const DEFAULT_MANIFEST: Manifest = {
  version: 1,
  locales: ["en"],
  defaultLocale: "en",
  canvases: [],
};
