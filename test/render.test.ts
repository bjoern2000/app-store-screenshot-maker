import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { initProject } from "../src/project/init.js";
import { projectPaths } from "../src/project/paths.js";
import { readManifest } from "../src/project/manifest.js";
import {
  handleSetLocales,
  handleSetStylesheet,
  handleUpsertCanvas,
  handleCapturePreview,
  handleRenderAll,
  type HandlerContext,
} from "../src/mcp/handlers.js";
import { closeBrowser } from "../src/render/browser.js";
import { makeTempDir, rmDir } from "./helpers.js";

/** Read width+height from a PNG buffer (IHDR is at byte 16..). */
function readPngDimensions(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function payload(result: { content: any[]; isError?: boolean }): any {
  expect(result.isError).toBeFalsy();
  const textPart = result.content.find((c: any) => c.type === "text");
  return JSON.parse(textPart.text);
}

afterAll(async () => {
  await closeBrowser();
});

describe("rendering pipeline", () => {
  let root: string;
  let ctx: HandlerContext;

  beforeEach(async () => {
    root = await makeTempDir("render");
    await initProject(root);
    ctx = { cwd: root };
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("capture_preview renders a canvas at App Store iPhone 1320×2868", async () => {
    await handleSetLocales(ctx, { locales: ["en"], defaultLocale: "en" });
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<h1 style='color:white'>{{t.title}}</h1>",
      strings: { en: { title: "Hello" } },
    });
    const res = await handleCapturePreview(ctx, { id: "hero", locale: "en" });
    expect(res.isError).toBeFalsy();
    const imagePart = res.content.find((c: any) => c.type === "image");
    expect(imagePart).toBeDefined();
    const png = Buffer.from(imagePart.data, "base64");
    expect(readPngDimensions(png)).toEqual({ width: 1320, height: 2868 });
  });

  it("capture_preview surfaces missing locale keys", async () => {
    await handleSetLocales(ctx, { locales: ["en"], defaultLocale: "en" });
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<p>{{t.missing_key}}</p>",
    });
    const res = await handleCapturePreview(ctx, { id: "hero", locale: "en" });
    const text = res.content.find((c: any) => c.type === "text").text;
    expect(text).toMatch(/missing_key/);
  });

  it("render_all writes PNGs with correct names and per-platform dimensions", async () => {
    await handleSetLocales(ctx, { locales: ["en", "de"], defaultLocale: "en" });
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<p style='color:white'>{{t.title}}</p>",
      strings: { en: { title: "EN" }, de: { title: "DE" } },
    });
    await handleUpsertCanvas(ctx, {
      id: "play1",
      platform: "play_store",
      device: "android_phone",
      order: 1,
      html: "<p style='color:white'>{{t.title}}</p>",
      strings: { en: { title: "EN" } },
    });

    const res = await handleRenderAll(ctx, {});
    const summary = payload(res);
    expect(summary.errors).toEqual([]);
    expect(summary.wrote).toBe(4); // 1 ASN × 2 locales + 1 Play × 2 locales

    // Filename pattern: {name}_{platform}_{device}_{locale}_{order}_{id}.png
    const enHeroDir = path.join(root, "output/app_store/iphone/en");
    const dePlayDir = path.join(root, "output/play_store/android_phone/de");
    const enHero = (await fs.readdir(enHeroDir)).find((f) => f.endsWith("_00_hero.png"));
    const dePlay = (await fs.readdir(dePlayDir)).find((f) => f.endsWith("_01_play1.png"));
    expect(enHero).toBeDefined();
    expect(dePlay).toBeDefined();

    const heroPng = await fs.readFile(path.join(enHeroDir, enHero!));
    expect(readPngDimensions(heroPng)).toEqual({ width: 1320, height: 2868 });
    const playPng = await fs.readFile(path.join(dePlayDir, dePlay!));
    expect(readPngDimensions(playPng)).toEqual({ width: 1080, height: 1920 });
  });

  it("render_all honors the locales filter", async () => {
    await handleSetLocales(ctx, { locales: ["en", "de"], defaultLocale: "en" });
    await handleSetStylesheet(ctx, { css: "body { background: #000; }" });
    await handleUpsertCanvas(ctx, {
      id: "x",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<p style='color:white'>{{t.title}}</p>",
      strings: { en: { title: "EN" }, de: { title: "DE" } },
    });
    const res = await handleRenderAll(ctx, { locales: ["de"] });
    const summary = payload(res);
    expect(summary.wrote).toBe(1);
    expect(summary.written[0]).toMatch(/\/de\/[^/]+_de_00_x\.png$/);
  });

  it("renders <img src='assets/...'> from the project assets folder", async () => {
    await handleSetLocales(ctx, { locales: ["en"], defaultLocale: "en" });
    // 1x1 red pixel PNG
    const redPixel = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cf000000030001012e3a710f0000000049454e44ae426082",
      "hex",
    );
    await fs.mkdir(path.join(root, "assets"), { recursive: true });
    await fs.writeFile(path.join(root, "assets/red.png"), redPixel);

    await handleUpsertCanvas(ctx, {
      id: "with-asset",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<img src='assets/red.png' style='width:100%;height:100%'>",
    });
    const res = await handleCapturePreview(ctx, { id: "with-asset", locale: "en" });
    expect(res.isError).toBeFalsy();
    const png = Buffer.from(res.content.find((c: any) => c.type === "image").data, "base64");
    // Sanity: it's a PNG of the expected dimensions
    expect(readPngDimensions(png)).toEqual({ width: 1320, height: 2868 });
  });

  it("capture_preview rejects unknown canvas id", async () => {
    const res = await handleCapturePreview(ctx, { id: "ghost", locale: "en" });
    expect(res.isError).toBe(true);
  });

  it("capture_preview rejects locale not in manifest", async () => {
    await handleUpsertCanvas(ctx, {
      id: "hero",
      platform: "app_store",
      device: "iphone",
      order: 0,
      html: "<p>x</p>",
    });
    const res = await handleCapturePreview(ctx, { id: "hero", locale: "ja" });
    expect(res.isError).toBe(true);
  });
});
