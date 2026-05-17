import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { ProjectState } from "../src/project/state.js";

export async function makeTempDir(label = "appstore-test"): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `${label}-${Date.now()}-${randomBytes(4).toString("hex")}`,
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function rmDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export function makeState(root: string): ProjectState {
  return new ProjectState(root);
}
