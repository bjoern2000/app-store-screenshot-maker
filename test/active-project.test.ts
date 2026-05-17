import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import path from "node:path";
import { initProject } from "../src/project/init.js";
import {
  handleInitProject,
  handleSetActiveProject,
  handleSetLocales,
  handleListCanvases,
  type HandlerContext,
} from "../src/mcp/handlers.js";
import { startUiServer, type UiServerHandle } from "../src/ui/server.js";
import { closeBrowser } from "../src/render/browser.js";
import { makeTempDir, rmDir, makeState } from "./helpers.js";

afterAll(async () => {
  await closeBrowser();
});

function payload(r: { content: any[]; isError?: boolean }): any {
  expect(r.isError).toBeFalsy();
  return JSON.parse(r.content[0]!.text);
}

describe("ProjectState + multi-project handlers", () => {
  let parent: string;

  beforeEach(async () => {
    parent = await makeTempDir("multi");
  });

  afterEach(async () => {
    await rmDir(parent);
  });

  it("init_project resolves relative paths against the active root and marks the new project active", async () => {
    const state = makeState(parent);
    const ctx: HandlerContext = { state };
    const res = await handleInitProject(ctx, { root: "./screenshots" });
    const data = payload(res);
    expect(data.root).toBe(path.resolve(parent, "screenshots"));
    expect(state.root).toBe(path.resolve(parent, "screenshots"));
    expect(data.active).toBe(true);
  });

  it("set_active_project switches the active root across handler calls", async () => {
    const a = path.join(parent, "app-a");
    const b = path.join(parent, "app-b");
    await initProject(a);
    await initProject(b);
    const state = makeState(a);
    const ctx: HandlerContext = { state };

    // Set up distinct locales in each project to prove we're really reading the right one.
    await handleSetLocales(ctx, { locales: ["en", "fr"], defaultLocale: "en" });

    const switchRes = await handleSetActiveProject(ctx, { root: b });
    payload(switchRes);
    expect(state.root).toBe(path.resolve(b));

    // Now operations should hit b, which only has 'en' (the init default).
    await handleSetLocales(ctx, { locales: ["en", "de"], defaultLocale: "en" });
    const list = payload(await handleListCanvases(ctx, {}));
    expect(list.locales).toEqual(["en", "de"]);

    // Switch back; a should still have its own locales.
    await handleSetActiveProject(ctx, { root: a });
    const listA = payload(await handleListCanvases(ctx, {}));
    expect(listA.locales).toEqual(["en", "fr"]);
  });

  it("set_active_project rejects an uninitialized target", async () => {
    const state = makeState(parent);
    const ctx: HandlerContext = { state };
    const res = await handleSetActiveProject(ctx, {
      root: path.join(parent, "does-not-exist"),
    });
    expect(res.isError).toBe(true);
    // The state shouldn't have moved.
    expect(state.root).toBe(parent);
  });
});

describe("UI server reacts to ProjectState changes", () => {
  let portCounter = 6101;
  const pickPort = () => portCounter++;

  let dir: string;
  let ui: UiServerHandle;

  beforeEach(async () => {
    dir = await makeTempDir("ui-multi");
  });

  afterEach(async () => {
    await ui?.close();
    await rmDir(dir);
  });

  it("/api/project-root returns the current state.root and follows updates", async () => {
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    await initProject(a);
    await initProject(b);
    const state = makeState(a);
    ui = await startUiServer({ state, port: pickPort(), watch: false });

    const r1 = await (await fetch(`${ui.url}/api/project-root`)).json();
    expect(r1.root).toBe(path.resolve(a));

    state.setRoot(b);
    const r2 = await (await fetch(`${ui.url}/api/project-root`)).json();
    expect(r2.root).toBe(path.resolve(b));
  });

  it("serves project files from the current root after a switch", async () => {
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    await initProject(a);
    await initProject(b);
    // Drop distinct styles in each so we can tell which one is being served.
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(a, "styles.css"), "/* A */");
    await fs.writeFile(path.join(b, "styles.css"), "/* B */");

    const state = makeState(a);
    ui = await startUiServer({ state, port: pickPort(), watch: false });

    const cssA = await (await fetch(`${ui.url}/project/styles.css`)).text();
    expect(cssA).toContain("/* A */");

    state.setRoot(b);
    const cssB = await (await fetch(`${ui.url}/project/styles.css`)).text();
    expect(cssB).toContain("/* B */");
  });
});
