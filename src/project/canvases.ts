import fs from "node:fs/promises";
import { atomicWrite, exists } from "./io.js";
import { canvasFile, type ProjectPaths } from "./paths.js";
import type { CanvasEntry } from "./schema.js";

export async function readCanvasHtml(paths: ProjectPaths, id: string): Promise<string> {
  return fs.readFile(canvasFile(paths, id), "utf8");
}

export async function writeCanvasHtml(
  paths: ProjectPaths,
  id: string,
  html: string,
): Promise<void> {
  await atomicWrite(canvasFile(paths, id), html);
}

export async function deleteCanvasHtml(paths: ProjectPaths, id: string): Promise<boolean> {
  const file = canvasFile(paths, id);
  if (!(await exists(file))) return false;
  await fs.unlink(file);
  return true;
}

export function upsertEntry(entries: CanvasEntry[], next: CanvasEntry): CanvasEntry[] {
  const idx = entries.findIndex((e) => e.id === next.id);
  if (idx === -1) return [...entries, next];
  const copy = entries.slice();
  copy[idx] = next;
  return copy;
}

export function removeEntry(entries: CanvasEntry[], id: string): CanvasEntry[] {
  return entries.filter((e) => e.id !== id);
}
