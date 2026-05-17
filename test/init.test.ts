import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { initProject } from "../src/project/init.js";
import { readManifest } from "../src/project/manifest.js";
import { projectPaths } from "../src/project/paths.js";
import { makeTempDir, rmDir } from "./helpers.js";

describe("initProject", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("init");
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("creates the expected folders and files in an empty directory", async () => {
    const result = await initProject(root);

    expect(result.paths.root).toBe(path.resolve(root));

    const entries = await fs.readdir(root);
    expect(entries.sort()).toEqual(
      ["assets", "canvases", "locales", "manifest.json", "output", "styles.css"].sort(),
    );

    const localeFiles = await fs.readdir(path.join(root, "locales"));
    expect(localeFiles).toContain("en.json");
  });

  it("writes a valid default manifest", async () => {
    await initProject(root);
    const paths = projectPaths(root);
    const manifest = await readManifest(paths);
    expect(manifest.version).toBe(1);
    expect(manifest.locales).toEqual(["en"]);
    expect(manifest.defaultLocale).toBe("en");
    expect(manifest.canvases).toEqual([]);
  });

  it("is idempotent — second run does not clobber", async () => {
    await initProject(root);
    const stylesPath = path.join(root, "styles.css");
    await fs.writeFile(stylesPath, "/* user-edited */");

    const result = await initProject(root);
    expect(result.alreadyExisted).toContain(stylesPath);

    const after = await fs.readFile(stylesPath, "utf8");
    expect(after).toBe("/* user-edited */");
  });

  it("creates the root if it doesn't yet exist", async () => {
    const nested = path.join(root, "sub", "project");
    await initProject(nested);
    const entries = await fs.readdir(nested);
    expect(entries).toContain("manifest.json");
  });
});
