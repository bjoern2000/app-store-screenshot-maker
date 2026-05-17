import { z } from "zod";
import { CanvasEntrySchema, CanvasIdSchema, LocaleSchema } from "../project/schema.js";

/**
 * Input schemas for every MCP tool. Imported by both the MCP server
 * (which feeds .shape into registerTool) and the handlers (which call .parse).
 */

export const InitProjectInput = z.object({
  root: z
    .string()
    .optional()
    .describe(
      "Absolute path to the project directory. Defaults to the server's working directory.",
    ),
});

export const SetProjectNameInput = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      "name must be lowercase letters, digits, dashes, or underscores",
    )
    .describe(
      "Short slug prefixed onto every exported PNG filename. Lowercase letters, digits, dashes, underscores. Example: 'keep'.",
    ),
});

export const SetStylesheetInput = z.object({
  css: z
    .string()
    .describe(
      "Full contents of styles.css. This replaces the file entirely — there is no partial update.",
    ),
});

export const UpsertCanvasInput = CanvasEntrySchema.extend({
  html: z
    .string()
    .describe(
      "HTML body for this canvas. Do NOT include <html>/<head>/<body>; the renderer wraps it. Reference localized strings as {{t.key}} and user assets as <img src='assets/...'>.",
    ),
  strings: z
    .record(LocaleSchema, z.record(z.string(), z.string()))
    .optional()
    .describe(
      "Per-locale key→value maps merged into locales/<lang>.json. Keys are referenced in HTML as {{t.key}}. Existing keys for the same locale are preserved unless overwritten here.",
    ),
});

export const DeleteCanvasInput = z.object({
  id: CanvasIdSchema,
});

export const ListCanvasesInput = z.object({});

export const SetLocalesInput = z.object({
  locales: z
    .array(LocaleSchema)
    .min(1)
    .describe("BCP-47-style locale codes, e.g. ['en', 'de', 'pt-BR']."),
  defaultLocale: LocaleSchema.optional().describe(
    "Which locale's strings are used as the fallback when a key is missing in another locale. Defaults to the first entry in `locales`.",
  ),
});

export const CapturePreviewInput = z.object({
  id: CanvasIdSchema,
  locale: LocaleSchema.optional().describe(
    "Locale to render. Defaults to manifest.defaultLocale. Must be one of the declared locales.",
  ),
});

export const ListSourceAssetsInput = z.object({});

export const RenderAllInput = z.object({
  locales: z
    .array(LocaleSchema)
    .optional()
    .describe(
      "Restrict the export to this subset of declared locales. Omit to render every locale.",
    ),
});
