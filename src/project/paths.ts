import path from "node:path";

export interface ProjectPaths {
  root: string;
  manifest: string;
  stylesheet: string;
  canvasesDir: string;
  localesDir: string;
  assetsDir: string;
  outputDir: string;
}

export function projectPaths(root: string): ProjectPaths {
  const absRoot = path.resolve(root);
  return {
    root: absRoot,
    manifest: path.join(absRoot, "manifest.json"),
    stylesheet: path.join(absRoot, "styles.css"),
    canvasesDir: path.join(absRoot, "canvases"),
    localesDir: path.join(absRoot, "locales"),
    assetsDir: path.join(absRoot, "assets"),
    outputDir: path.join(absRoot, "output"),
  };
}

export function canvasFile(paths: ProjectPaths, id: string): string {
  return path.join(paths.canvasesDir, `${id}.html`);
}

export function localeFile(paths: ProjectPaths, locale: string): string {
  return path.join(paths.localesDir, `${locale}.json`);
}
