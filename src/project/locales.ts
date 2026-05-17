import fs from "node:fs/promises";
import { atomicWrite, exists, readJson, writeJson } from "./io.js";
import { localeFile, type ProjectPaths } from "./paths.js";

export type LocaleStrings = Record<string, string>;

export async function readLocale(paths: ProjectPaths, locale: string): Promise<LocaleStrings> {
  const file = localeFile(paths, locale);
  if (!(await exists(file))) return {};
  return readJson<LocaleStrings>(file);
}

export async function writeLocale(
  paths: ProjectPaths,
  locale: string,
  strings: LocaleStrings,
): Promise<void> {
  await writeJson(localeFile(paths, locale), strings);
}

export async function ensureLocaleFile(paths: ProjectPaths, locale: string): Promise<boolean> {
  const file = localeFile(paths, locale);
  if (await exists(file)) return false;
  await atomicWrite(file, "{}\n");
  return true;
}

/**
 * Merge `incoming` into the on-disk locale file; incoming keys win.
 * Used by upsert_screenshot_canvas to absorb per-canvas string maps.
 */
export async function mergeLocale(
  paths: ProjectPaths,
  locale: string,
  incoming: LocaleStrings,
): Promise<LocaleStrings> {
  const current = await readLocale(paths, locale);
  const merged = { ...current, ...incoming };
  await writeLocale(paths, locale, merged);
  return merged;
}
