import { z } from "zod";
import { initProject } from "../project/init.js";
import { projectPaths, type ProjectPaths } from "../project/paths.js";
import { readManifest, writeManifest } from "../project/manifest.js";
import { atomicWrite } from "../project/io.js";
import {
  deleteCanvasHtml,
  removeEntry,
  upsertEntry,
  writeCanvasHtml,
} from "../project/canvases.js";
import { ensureLocaleFile, mergeLocale } from "../project/locales.js";
import { listAssets } from "../project/assets.js";
import { renderCanvas, renderAll } from "../render/renderer.js";
import {
  InitProjectInput,
  SetProjectNameInput,
  SetStylesheetInput,
  UpsertCanvasInput,
  DeleteCanvasInput,
  ListCanvasesInput,
  SetLocalesInput,
  CapturePreviewInput,
  ListSourceAssetsInput,
  RenderAllInput,
} from "./tools.js";

export interface HandlerContext {
  cwd: string;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface TextResult {
  content: ContentPart[];
  isError?: boolean;
  [key: string]: unknown;
}

function ok(payload: unknown): TextResult {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }] };
}

function err(text: string): TextResult {
  return { content: [{ type: "text", text }], isError: true };
}

const NOT_IMPLEMENTED = (name: string) => err(`${name}: not implemented yet (phase 3).`);

function pathsFor(ctx: HandlerContext): ProjectPaths {
  return projectPaths(ctx.cwd);
}

export async function handleInitProject(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = InitProjectInput.parse(raw);
  const root = args.root ?? ctx.cwd;
  const result = await initProject(root);
  return ok({
    ok: true,
    root: result.paths.root,
    created: result.created,
    alreadyExisted: result.alreadyExisted,
  });
}

export async function handleSetStylesheet(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = SetStylesheetInput.parse(raw);
  const paths = pathsFor(ctx);
  await atomicWrite(paths.stylesheet, args.css);
  return ok({ ok: true, stylesheet: paths.stylesheet, bytes: Buffer.byteLength(args.css) });
}

export async function handleSetProjectName(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = SetProjectNameInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);
  await writeManifest(paths, { ...manifest, name: args.name });
  return ok({ ok: true, name: args.name });
}

export async function handleUpsertCanvas(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = UpsertCanvasInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);

  const entry = {
    id: args.id,
    platform: args.platform,
    device: args.device,
    order: args.order,
  };

  // Warn (but don't reject) if a locale string-map references a locale not yet
  // declared in the manifest — the agent likely forgot to set_locales first.
  const unknownLocales = args.strings
    ? Object.keys(args.strings).filter((l) => !manifest.locales.includes(l))
    : [];

  await writeCanvasHtml(paths, args.id, args.html);

  if (args.strings) {
    for (const [locale, strings] of Object.entries(args.strings)) {
      await ensureLocaleFile(paths, locale);
      await mergeLocale(paths, locale, strings);
    }
  }

  const next = { ...manifest, canvases: upsertEntry(manifest.canvases, entry) };
  await writeManifest(paths, next);

  return ok({ ok: true, canvas: entry, unknownLocales });
}

export async function handleDeleteCanvas(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = DeleteCanvasInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);
  const existed = manifest.canvases.some((c) => c.id === args.id);
  const fileExisted = await deleteCanvasHtml(paths, args.id);
  const next = { ...manifest, canvases: removeEntry(manifest.canvases, args.id) };
  await writeManifest(paths, next);
  return ok({ ok: true, removedManifestEntry: existed, removedFile: fileExisted });
}

export async function handleListCanvases(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  ListCanvasesInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);
  return ok(manifest);
}

export async function handleSetLocales(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = SetLocalesInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);
  const defaultLocale = args.defaultLocale ?? args.locales[0]!;
  if (!args.locales.includes(defaultLocale)) {
    return err(`defaultLocale ${defaultLocale} is not in locales [${args.locales.join(", ")}]`);
  }
  const created: string[] = [];
  for (const locale of args.locales) {
    if (await ensureLocaleFile(paths, locale)) created.push(locale);
  }
  await writeManifest(paths, { ...manifest, locales: args.locales, defaultLocale });
  return ok({ ok: true, locales: args.locales, defaultLocale, createdLocaleFiles: created });
}

export async function handleCapturePreview(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = CapturePreviewInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);
  const canvas = manifest.canvases.find((c) => c.id === args.id);
  if (!canvas) return err(`Unknown canvas id: ${args.id}`);
  const locale = args.locale ?? manifest.defaultLocale;
  if (!manifest.locales.includes(locale)) {
    return err(`Locale ${locale} is not in manifest.locales [${manifest.locales.join(", ")}]`);
  }
  const { png, missingKeys } = await renderCanvas(paths, manifest, canvas, locale);
  const note =
    missingKeys.length > 0
      ? `Missing locale keys for ${locale}: ${missingKeys.join(", ")}`
      : `Rendered ${args.id} @ ${locale}`;
  return {
    content: [
      { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      { type: "text", text: note },
    ],
  };
}

export async function handleListSourceAssets(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  ListSourceAssetsInput.parse(raw);
  const paths = pathsFor(ctx);
  const assets = await listAssets(paths);
  return ok({ assets, count: assets.length });
}

export async function handleRenderAll(
  ctx: HandlerContext,
  raw: unknown,
): Promise<TextResult> {
  const args = RenderAllInput.parse(raw);
  const paths = pathsFor(ctx);
  const manifest = await readManifest(paths);
  const summary = await renderAll(paths, manifest, { locales: args.locales });
  return ok({ ok: true, ...summary, wrote: summary.written.length });
}

export type ToolHandler = (ctx: HandlerContext, raw: unknown) => Promise<TextResult>;

export const HANDLERS: Record<string, ToolHandler> = {
  init_project: handleInitProject,
  set_project_name: handleSetProjectName,
  set_stylesheet: handleSetStylesheet,
  upsert_screenshot_canvas: handleUpsertCanvas,
  delete_screenshot_canvas: handleDeleteCanvas,
  list_screenshot_canvases: handleListCanvases,
  set_locales: handleSetLocales,
  capture_preview: handleCapturePreview,
  list_source_assets: handleListSourceAssets,
  render_all: handleRenderAll,
};

export function formatZodError(e: z.ZodError): string {
  return e.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
