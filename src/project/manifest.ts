import { ManifestSchema, type Manifest, DEFAULT_MANIFEST } from "./schema.js";
import { readJson, writeJson, exists } from "./io.js";
import type { ProjectPaths } from "./paths.js";

export async function readManifest(paths: ProjectPaths): Promise<Manifest> {
  if (!(await exists(paths.manifest))) {
    throw new Error(
      `No manifest at ${paths.manifest}. Run init_project first.`,
    );
  }
  const raw = await readJson(paths.manifest);
  return ManifestSchema.parse(raw);
}

export async function writeManifest(paths: ProjectPaths, manifest: Manifest): Promise<void> {
  const validated = ManifestSchema.parse(manifest);
  await writeJson(paths.manifest, validated);
}

export function defaultManifest(): Manifest {
  return structuredClone(DEFAULT_MANIFEST);
}
