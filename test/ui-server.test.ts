import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { startUiServer, type UiServerHandle } from "../src/ui/server.js";
import { initProject } from "../src/project/init.js";
import {
  handleSetLocales,
  handleUpsertCanvas,
  type HandlerContext,
} from "../src/mcp/handlers.js";
import { closeBrowser } from "../src/render/browser.js";
import { makeTempDir, rmDir, makeState } from "./helpers.js";

let nextPort = 5101;
function pickPort(): number {
  return nextPort++;
}

afterAll(async () => {
  await closeBrowser();
});

describe("UI server", () => {
  let root: string;
  let ctx: HandlerContext;
  let ui: UiServerHandle;

  beforeEach(async () => {
    root = await makeTempDir("ui");
    await initProject(root);
    const state = makeState(root);
    ctx = { state };
    ui = await startUiServer({ state, port: pickPort() });
  });

  afterEach(async () => {
    await ui.close();
    await rmDir(root);
  });

  it("serves the index page", async () => {
    const res = await fetch(`${ui.url}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("app-store-screenshot-maker");
    expect(body).toContain("/ui/app.js");
  });

  it("serves static UI assets", async () => {
    const res = await fetch(`${ui.url}/ui/styles.css`);
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css).toContain("--mono");
  });

  it("returns the manifest as JSON", async () => {
    await handleSetLocales(ctx, { locales: ["en", "de"], defaultLocale: "en" });
    const res = await fetch(`${ui.url}/api/manifest`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.locales).toEqual(["en", "de"]);
  });

  it("returns an empty manifest before init_project has run", async () => {
    // Tear down the manifest to simulate a fresh dir
    await fs.unlink(path.join(root, "manifest.json"));
    const res = await fetch(`${ui.url}/api/manifest`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.canvases).toEqual([]);
  });

  it("renders composed preview HTML with substituted strings", async () => {
    await handleSetLocales(ctx, { locales: ["en"], defaultLocale: "en" });
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<h1>{{t.title}}</h1>",
      strings: { en: { title: "Hello UI" } },
    });
    const res = await fetch(`${ui.url}/preview/hero/en`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Hello UI");
    expect(html).toContain('<base href="/project/">');
    expect(html).toContain('<link rel="stylesheet" href="styles.css">');
  });

  it("404s an unknown canvas in preview", async () => {
    const res = await fetch(`${ui.url}/preview/ghost/en`);
    expect(res.status).toBe(404);
  });

  it("400s an unknown locale in preview", async () => {
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<p>x</p>",
    });
    const res = await fetch(`${ui.url}/preview/hero/ja`);
    expect(res.status).toBe(400);
  });

  it("serves project assets under /project/assets/", async () => {
    await fs.mkdir(path.join(root, "assets"), { recursive: true });
    await fs.writeFile(path.join(root, "assets/foo.txt"), "hello");
    const res = await fetch(`${ui.url}/project/assets/foo.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  it("serves the project stylesheet", async () => {
    const res = await fetch(`${ui.url}/project/styles.css`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Global stylesheet");
  });

  it("POST /api/render-all writes PNGs", async () => {
    await handleSetLocales(ctx, { locales: ["en"], defaultLocale: "en" });
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<p style='color:white'>{{t.title}}</p>",
      strings: { en: { title: "OK" } },
    });
    const res = await fetch(`${ui.url}/api/render-all`, { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wrote).toBe(1);
    const outDir = path.join(root, "output/app_store/iphone/en");
    const files = await fs.readdir(outDir);
    expect(files.some((f) => f.endsWith("_00_hero.png"))).toBe(true);
  });
});
