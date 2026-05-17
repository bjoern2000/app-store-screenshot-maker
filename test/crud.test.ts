import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { initProject } from "../src/project/init.js";
import { projectPaths } from "../src/project/paths.js";
import { readManifest } from "../src/project/manifest.js";
import {
  handleSetStylesheet,
  handleSetProjectName,
  handleUpsertCanvas,
  handleDeleteCanvas,
  handleListCanvases,
  handleSetLocales,
  handleListSourceAssets,
  type HandlerContext,
} from "../src/mcp/handlers.js";
import { makeTempDir, rmDir, makeState } from "./helpers.js";

function payload(result: { content: Array<{ text: string }>; isError?: boolean }): any {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0]!.text);
}

describe("Phase 2 handlers", () => {
  let root: string;
  let ctx: HandlerContext;

  beforeEach(async () => {
    root = await makeTempDir("crud");
    await initProject(root);
    ctx = { state: makeState(root) };
  });

  afterEach(async () => {
    await rmDir(root);
  });

  describe("set_project_name", () => {
    it("writes the name into the manifest", async () => {
      const res = await handleSetProjectName(ctx, { name: "keep" });
      const data = payload(res);
      expect(data.name).toBe("keep");
      const m = await readManifest(projectPaths(root));
      expect(m.name).toBe("keep");
    });

    it("rejects invalid slugs", async () => {
      // Zod throws at the handler level; the MCP server layer is what catches
      // and converts to an isError response.
      await expect(handleSetProjectName(ctx, { name: "Keep!" })).rejects.toThrow();
    });
  });

  describe("set_stylesheet", () => {
    it("overwrites styles.css", async () => {
      const css = "body { background: papayawhip; }";
      const res = await handleSetStylesheet(ctx, { css });
      const data = payload(res);
      expect(data.ok).toBe(true);
      const onDisk = await fs.readFile(path.join(root, "styles.css"), "utf8");
      expect(onDisk).toBe(css);
    });
  });

  describe("set_locales", () => {
    it("declares locales and creates files", async () => {
      const res = await handleSetLocales(ctx, {
        locales: ["en", "de", "ja"],
        defaultLocale: "en",
      });
      const data = payload(res);
      expect(data.locales).toEqual(["en", "de", "ja"]);
      const files = await fs.readdir(path.join(root, "locales"));
      expect(files.sort()).toEqual(["de.json", "en.json", "ja.json"]);
    });

    it("rejects when defaultLocale not in locales", async () => {
      const res = await handleSetLocales(ctx, {
        locales: ["en", "de"],
        defaultLocale: "fr",
      });
      expect(res.isError).toBe(true);
    });

    it("persists to manifest", async () => {
      await handleSetLocales(ctx, { locales: ["en", "de"] });
      const m = await readManifest(projectPaths(root));
      expect(m.locales).toEqual(["en", "de"]);
      expect(m.defaultLocale).toBe("en");
    });
  });

  describe("upsert_screenshot_canvas", () => {
    it("creates a new canvas with HTML + strings", async () => {
      await handleSetLocales(ctx, { locales: ["en", "de"] });
      const res = await handleUpsertCanvas(ctx, {
        id: "hero",
        platform: "app_store",
        device: "iphone",
        order: 0,
        html: "<h1>{{t.headline}}</h1>",
        strings: {
          en: { headline: "Take notes faster" },
          de: { headline: "Schneller Notizen machen" },
        },
      });
      const data = payload(res);
      expect(data.canvas.id).toBe("hero");
      expect(data.unknownLocales).toEqual([]);

      const html = await fs.readFile(path.join(root, "canvases/hero.html"), "utf8");
      expect(html).toContain("{{t.headline}}");

      const en = JSON.parse(await fs.readFile(path.join(root, "locales/en.json"), "utf8"));
      expect(en.headline).toBe("Take notes faster");
    });

    it("updates an existing canvas in place", async () => {
      await handleUpsertCanvas(ctx, {
        id: "hero",
        platform: "app_store",
        device: "iphone",
        order: 0,
        html: "<p>v1</p>",
      });
      await handleUpsertCanvas(ctx, {
        id: "hero",
        platform: "app_store",
        device: "iphone",
        order: 2,
        html: "<p>v2</p>",
      });
      const m = await readManifest(projectPaths(root));
      expect(m.canvases).toHaveLength(1);
      expect(m.canvases[0]!.order).toBe(2);
      const html = await fs.readFile(path.join(root, "canvases/hero.html"), "utf8");
      expect(html).toBe("<p>v2</p>");
    });

    it("flags strings for undeclared locales without rejecting", async () => {
      const res = await handleUpsertCanvas(ctx, {
        id: "hero",
        platform: "app_store",
        device: "iphone",
        order: 0,
        html: "<p>x</p>",
        strings: { fr: { headline: "Salut" } },
      });
      const data = payload(res);
      expect(data.unknownLocales).toEqual(["fr"]);
    });

    it("merges new keys into existing locale file without overwriting siblings", async () => {
      await handleUpsertCanvas(ctx, {
        id: "a",
        platform: "app_store",
        device: "iphone",
        order: 0,
        html: "<p>a</p>",
        strings: { en: { keyA: "A" } },
      });
      await handleUpsertCanvas(ctx, {
        id: "b",
        platform: "app_store",
        device: "iphone",
        order: 1,
        html: "<p>b</p>",
        strings: { en: { keyB: "B" } },
      });
      const en = JSON.parse(await fs.readFile(path.join(root, "locales/en.json"), "utf8"));
      expect(en).toEqual({ keyA: "A", keyB: "B" });
    });
  });

  describe("delete_screenshot_canvas", () => {
    it("removes both the file and the manifest entry", async () => {
      await handleUpsertCanvas(ctx, {
        id: "hero",
        platform: "app_store",
        device: "iphone",
        order: 0,
        html: "<p>x</p>",
      });
      const res = await handleDeleteCanvas(ctx, { id: "hero" });
      const data = payload(res);
      expect(data.removedFile).toBe(true);
      expect(data.removedManifestEntry).toBe(true);
      const m = await readManifest(projectPaths(root));
      expect(m.canvases).toHaveLength(0);
    });

    it("is harmless for an unknown id", async () => {
      const res = await handleDeleteCanvas(ctx, { id: "ghost" });
      const data = payload(res);
      expect(data.removedFile).toBe(false);
      expect(data.removedManifestEntry).toBe(false);
    });
  });

  describe("list_screenshot_canvases", () => {
    it("returns the manifest", async () => {
      await handleUpsertCanvas(ctx, {
        id: "hero",
        platform: "play_store",
        device: "android_phone",
        order: 0,
        html: "<p>x</p>",
      });
      const res = await handleListCanvases(ctx, {});
      const data = payload(res);
      expect(data.canvases).toHaveLength(1);
      expect(data.canvases[0].platform).toBe("play_store");
    });
  });

  describe("list_source_assets", () => {
    it("returns empty list when assets/ is empty", async () => {
      const res = await handleListSourceAssets(ctx, {});
      const data = payload(res);
      expect(data.assets).toEqual([]);
      expect(data.count).toBe(0);
    });

    it("walks recursively and uses POSIX paths", async () => {
      await fs.mkdir(path.join(root, "assets/subdir"), { recursive: true });
      await fs.writeFile(path.join(root, "assets/a.png"), "x");
      await fs.writeFile(path.join(root, "assets/subdir/b.png"), "yy");
      await fs.writeFile(path.join(root, "assets/.DS_Store"), "ignored");
      const res = await handleListSourceAssets(ctx, {});
      const data = payload(res);
      expect(data.assets.map((a: any) => a.path).sort()).toEqual(["a.png", "subdir/b.png"]);
      const b = data.assets.find((a: any) => a.path === "subdir/b.png");
      expect(b.size).toBe(2);
    });
  });
});
