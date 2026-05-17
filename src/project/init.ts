import path from "node:path";
import { ensureDir, exists, atomicWrite } from "./io.js";
import { writeManifest, defaultManifest } from "./manifest.js";
import { projectPaths, type ProjectPaths } from "./paths.js";

/** Slugify a directory basename into a manifest-safe project name. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "project"
  );
}

const DEFAULT_STYLESHEET = `/* Global stylesheet for all screenshots. Edit via set_stylesheet. */
:root {
  --bg: #0b0d12;
  --fg: #f5f5f7;
  --accent: #5b8cff;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, "SF Pro Display", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
`;

const DEFAULT_LOCALE_FILE = `{}\n`;

export interface InitResult {
  paths: ProjectPaths;
  created: string[];
  alreadyExisted: string[];
}

export async function initProject(root: string): Promise<InitResult> {
  const paths = projectPaths(root);
  const created: string[] = [];
  const alreadyExisted: string[] = [];

  for (const dir of [
    paths.root,
    paths.canvasesDir,
    paths.localesDir,
    paths.assetsDir,
    paths.outputDir,
  ]) {
    if (await exists(dir)) {
      alreadyExisted.push(dir);
    } else {
      await ensureDir(dir);
      created.push(dir);
    }
  }

  if (!(await exists(paths.manifest))) {
    const manifest = defaultManifest();
    manifest.name = slugify(path.basename(paths.root));
    await writeManifest(paths, manifest);
    created.push(paths.manifest);
  } else {
    alreadyExisted.push(paths.manifest);
  }

  if (!(await exists(paths.stylesheet))) {
    await atomicWrite(paths.stylesheet, DEFAULT_STYLESHEET);
    created.push(paths.stylesheet);
  } else {
    alreadyExisted.push(paths.stylesheet);
  }

  const defaultLocale = paths.localesDir + "/en.json";
  if (!(await exists(defaultLocale))) {
    await atomicWrite(defaultLocale, DEFAULT_LOCALE_FILE);
    created.push(defaultLocale);
  } else {
    alreadyExisted.push(defaultLocale);
  }

  return { paths, created, alreadyExisted };
}
