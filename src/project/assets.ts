import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectPaths } from "./paths.js";

export interface AssetEntry {
  /** Path relative to the assets directory (POSIX-style). */
  path: string;
  /** Size in bytes. */
  size: number;
}

/**
 * Recursively walk the assets directory. Returns POSIX-style relative paths
 * (so the agent can drop them straight into <img src="assets/..."> URLs).
 */
export async function listAssets(paths: ProjectPaths): Promise<AssetEntry[]> {
  const out: AssetEntry[] = [];
  await walk(paths.assetsDir, paths.assetsDir, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

async function walk(root: string, dir: string, out: AssetEntry[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, out);
    } else if (entry.isFile()) {
      const stat = await fs.stat(full);
      const rel = path.relative(root, full).split(path.sep).join("/");
      out.push({ path: rel, size: stat.size });
    }
  }
}
