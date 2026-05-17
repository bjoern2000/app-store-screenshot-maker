import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { initProject } from "../src/project/init.js";
import { projectPaths } from "../src/project/paths.js";
import { startWatcher, type ReloadEvent } from "../src/ui/watcher.js";
import { makeTempDir, rmDir } from "./helpers.js";

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("startWatcher", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("watcher");
    await initProject(root);
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("classifies and emits a change to styles.css", async () => {
    const events: ReloadEvent[] = [];
    const paths = projectPaths(root);
    const handle = startWatcher({
      paths,
      onChange: (e) => events.push(e),
      debounceMs: 30,
    });
    // Watchers take a moment to attach to the FS.
    await wait(200);
    await fs.writeFile(paths.stylesheet, "body { color: red; }");
    await wait(400);
    await handle.close();
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]!.kind).toBe("stylesheet");
  });

  it("classifies canvas changes", async () => {
    const events: ReloadEvent[] = [];
    const paths = projectPaths(root);
    const handle = startWatcher({
      paths,
      onChange: (e) => events.push(e),
      debounceMs: 30,
    });
    await wait(200);
    await fs.writeFile(path.join(paths.canvasesDir, "hero.html"), "<p>x</p>");
    await wait(400);
    await handle.close();
    expect(events.some((e) => e.kind === "canvas")).toBe(true);
  });

  it("debounces rapid edits to the same file", async () => {
    const events: ReloadEvent[] = [];
    const paths = projectPaths(root);
    const handle = startWatcher({
      paths,
      onChange: (e) => events.push(e),
      debounceMs: 80,
    });
    await wait(200);
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(paths.stylesheet, `/* v${i} */`);
      await wait(5);
    }
    await wait(400);
    await handle.close();
    // Multiple writes hitting within the debounce window should coalesce.
    // Allow some slack — fs events can fan out a bit — but expect fewer than the 5 writes.
    expect(events.length).toBeLessThan(5);
    expect(events.length).toBeGreaterThan(0);
  });
});
