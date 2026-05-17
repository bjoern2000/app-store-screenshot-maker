import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { discoverProjectRoot } from "../src/project/discover.js";
import { initProject } from "../src/project/init.js";
import { makeTempDir, rmDir } from "./helpers.js";

describe("discoverProjectRoot", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("discover");
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("returns null when no manifest is anywhere above", async () => {
    expect(await discoverProjectRoot(root)).toBeNull();
  });

  it("finds a manifest in the starting dir itself", async () => {
    await initProject(root);
    const found = await discoverProjectRoot(root);
    expect(found).toBe(path.resolve(root));
  });

  it("walks up from a nested dir to find the manifest", async () => {
    await initProject(root);
    const nested = path.join(root, "canvases"); // any subdir
    const found = await discoverProjectRoot(nested);
    expect(found).toBe(path.resolve(root));
  });

  it("ignores foreign manifest.json files that don't look like ours", async () => {
    // A package.json-adjacent manifest.json that isn't our schema shouldn't match.
    await fs.writeFile(path.join(root, "manifest.json"), '{"foo": "bar"}');
    expect(await discoverProjectRoot(root)).toBeNull();
  });
});
