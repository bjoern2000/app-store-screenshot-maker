import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "./io.js";

/**
 * Walk up from `start` looking for a directory that contains an
 * app-store-screenshot-maker `manifest.json`. Stops at the filesystem root.
 *
 * Returns the project root if found, else null. This is what lets the user
 * `cd ~/code/keep/screenshots && claude` without ever configuring `cwd` in
 * their MCP client — the server figures it out.
 */
export async function discoverProjectRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  // Hard cap on walk depth so we never go further than the filesystem root.
  // path.dirname('/') === '/' on POSIX, which is the natural stop condition.
  // On Windows, path.dirname('C:\\') === 'C:\\' likewise.
  while (true) {
    const candidate = path.join(dir, "manifest.json");
    if (await exists(candidate) && (await looksLikeOurManifest(candidate))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function looksLikeOurManifest(file: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const json = JSON.parse(raw) as unknown;
    if (typeof json !== "object" || json === null) return false;
    const obj = json as Record<string, unknown>;
    return obj.version === 1 && Array.isArray(obj.canvases);
  } catch {
    return false;
  }
}
