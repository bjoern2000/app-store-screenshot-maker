import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic-ish write: stage to a sibling temp file then rename.
 * Why: prevents partial files if the process is killed mid-write.
 */
export async function atomicWrite(filePath: string, contents: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomBytes(4).toString("hex")}.tmp`);
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, filePath);
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await atomicWrite(filePath, JSON.stringify(value, null, 2) + "\n");
}
