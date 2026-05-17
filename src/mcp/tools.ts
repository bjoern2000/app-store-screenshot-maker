import { z } from "zod";
import {
  CanvasEntrySchema,
  CanvasIdSchema,
  LocaleSchema,
  PlatformSchema,
  DeviceSchema,
} from "../project/schema.js";

/**
 * Input schemas for every MCP tool. Kept in one place so the MCP layer
 * and the implementation handlers share a single source of truth.
 */

export const InitProjectInput = z.object({
  root: z.string().optional().describe("Project directory. Defaults to the server's cwd."),
});

export const SetStylesheetInput = z.object({
  css: z.string().describe("Full contents of styles.css"),
});

export const SetProjectNameInput = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "name must be lowercase letters, digits, dashes, or underscores")
    .describe("Short slug used as the prefix for exported PNG filenames"),
});

export const UpsertCanvasInput = CanvasEntrySchema.extend({
  html: z.string().describe("HTML body for this canvas (no <html>/<head> wrapper)"),
  strings: z
    .record(LocaleSchema, z.record(z.string(), z.string()))
    .optional()
    .describe("Per-locale string maps to merge into locales/<lang>.json"),
});

export const DeleteCanvasInput = z.object({
  id: CanvasIdSchema,
});

export const ListCanvasesInput = z.object({});

export const SetLocalesInput = z.object({
  locales: z.array(LocaleSchema).min(1),
  defaultLocale: LocaleSchema.optional(),
});

export const CapturePreviewInput = z.object({
  id: CanvasIdSchema,
  locale: LocaleSchema.optional().describe("Defaults to manifest.defaultLocale"),
});

export const ListSourceAssetsInput = z.object({});

export const RenderAllInput = z.object({
  locales: z.array(LocaleSchema).optional().describe("Restrict to a subset of locales"),
});

export const TOOL_NAMES = [
  "init_project",
  "set_project_name",
  "set_stylesheet",
  "upsert_screenshot_canvas",
  "delete_screenshot_canvas",
  "list_screenshot_canvases",
  "set_locales",
  "capture_preview",
  "list_source_assets",
  "render_all",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "init_project",
    description:
      "Set up the project folder structure (manifest, styles.css, canvases/, locales/, assets/, output/). Idempotent.",
    inputSchema: InitProjectInput,
  },
  {
    name: "set_stylesheet",
    description: "Overwrite the global styles.css applied to every canvas.",
    inputSchema: SetStylesheetInput,
  },
  {
    name: "upsert_screenshot_canvas",
    description:
      "Create or update one screenshot canvas. Writes canvases/<id>.html, registers it in the manifest, and merges per-locale string maps into locales/<lang>.json.",
    inputSchema: UpsertCanvasInput,
  },
  {
    name: "delete_screenshot_canvas",
    description: "Remove a canvas by id (HTML file + manifest entry).",
    inputSchema: DeleteCanvasInput,
  },
  {
    name: "list_screenshot_canvases",
    description: "Return the current manifest (locales, defaultLocale, canvases, dimensions).",
    inputSchema: ListCanvasesInput,
  },
  {
    name: "set_locales",
    description:
      "Declare which locales this project supports. Creates an empty locales/<lang>.json for each new locale.",
    inputSchema: SetLocalesInput,
  },
  {
    name: "capture_preview",
    description:
      "Render one canvas at one locale and return a PNG (base64) for the agent to self-check the result.",
    inputSchema: CapturePreviewInput,
  },
  {
    name: "list_source_assets",
    description:
      "List files in the assets/ folder (recursive) so the agent knows what it can <img src='assets/...'> reference.",
    inputSchema: ListSourceAssetsInput,
  },
  {
    name: "render_all",
    description:
      "Render every (canvas × locale) combination to output/ as final store-spec PNGs. Returns a summary.",
    inputSchema: RenderAllInput,
  },
];
