import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import type { ProjectPaths } from "../project/paths.js";
import type { CanvasEntry, Manifest } from "../project/schema.js";
import { readCanvasHtml } from "../project/canvases.js";
import { readLocale } from "../project/locales.js";
import { atomicWrite, ensureDir } from "../project/io.js";
import { composeHtml } from "./compose.js";
import { dimensionsFor } from "./presets.js";
import { getBrowser } from "./browser.js";

export interface RenderResult {
  png: Buffer;
  missingKeys: string[];
}

export async function renderCanvas(
  paths: ProjectPaths,
  manifest: Manifest,
  canvas: CanvasEntry,
  locale: string,
): Promise<RenderResult> {
  const [defStrings, locStrings, html] = await Promise.all([
    readLocale(paths, manifest.defaultLocale),
    locale === manifest.defaultLocale
      ? Promise.resolve({})
      : readLocale(paths, locale),
    readCanvasHtml(paths, canvas.id),
  ]);
  const strings = { ...defStrings, ...locStrings };
  const baseHref = pathToFileURL(paths.root + path.sep).toString();
  const composed = composeHtml({ canvasHtml: html, locale, strings, baseHref });

  // Write the composed HTML inside the project root so file:// references
  // to assets/* resolve naturally via <base>.
  const tmp = path.join(paths.root, `.preview-${randomBytes(4).toString("hex")}.html`);
  await atomicWrite(tmp, composed.html);

  const dim = dimensionsFor(manifest, canvas.platform, canvas.device);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: dim.width, height: dim.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(tmp).toString(), { waitUntil: "networkidle" });
    const png = await page.screenshot({ type: "png", fullPage: false });
    return { png, missingKeys: composed.missingKeys };
  } finally {
    await context.close();
    await fs.unlink(tmp).catch(() => undefined);
  }
}

export function outputPathFor(
  paths: ProjectPaths,
  manifest: Manifest,
  canvas: CanvasEntry,
  locale: string,
): string {
  const name = manifest.name ?? path.basename(paths.root);
  const order = String(canvas.order).padStart(2, "0");
  // Self-describing filename so individual files stay identifiable when moved
  // out of the nested directory structure.
  const filename = `${name}_${canvas.platform}_${canvas.device}_${locale}_${order}_${canvas.id}.png`;
  return path.join(paths.outputDir, canvas.platform, canvas.device, locale, filename);
}

export interface RenderAllOptions {
  /** Restrict to a subset of locales (default: all). */
  locales?: string[];
}

export interface RenderAllSummary {
  written: string[];
  errors: Array<{ canvasId: string; locale: string; message: string }>;
  missing: Array<{ canvasId: string; locale: string; keys: string[] }>;
}

export async function renderAll(
  paths: ProjectPaths,
  manifest: Manifest,
  opts: RenderAllOptions = {},
): Promise<RenderAllSummary> {
  const targetLocales = opts.locales ?? manifest.locales;
  const summary: RenderAllSummary = { written: [], errors: [], missing: [] };

  for (const canvas of manifest.canvases) {
    for (const locale of targetLocales) {
      try {
        const { png, missingKeys } = await renderCanvas(paths, manifest, canvas, locale);
        const outPath = outputPathFor(paths, manifest, canvas, locale);
        await ensureDir(path.dirname(outPath));
        await atomicWrite(outPath, png);
        summary.written.push(outPath);
        if (missingKeys.length > 0) {
          summary.missing.push({ canvasId: canvas.id, locale, keys: missingKeys });
        }
      } catch (e) {
        summary.errors.push({
          canvasId: canvas.id,
          locale,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  return summary;
}
