import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createMcpServer } from "../src/mcp/server.js";
import { closeBrowser } from "../src/render/browser.js";
import { makeTempDir, rmDir, makeState } from "./helpers.js";

async function pair(cwd: string): Promise<{ client: Client; server: McpServer }> {
  const server = createMcpServer({ state: makeState(cwd) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

function unwrapText(res: { content: any[]; isError?: boolean }): any {
  expect(res.isError).toBeFalsy();
  const text = res.content.find((c: any) => c.type === "text");
  return JSON.parse(text.text);
}

afterAll(async () => {
  await closeBrowser();
});

describe("end-to-end agent workflow", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("e2e");
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("init → locales → stylesheet → canvases → preview → render_all", async () => {
    const { client } = await pair(root);

    // 1. init
    await client.callTool({ name: "init_project", arguments: { root } });

    // The MCP server's cwd is the test runner's cwd, so a re-init at the
    // explicit `root` is what wires us up.
    const serverRooted = await (async () => {
      const s = createMcpServer({ state: makeState(root) });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      const c = new Client({ name: "test", version: "0" });
      await Promise.all([s.connect(st), c.connect(ct)]);
      return c;
    })();

    // 2. locales
    await serverRooted.callTool({
      name: "set_locales",
      arguments: { locales: ["en", "de"], defaultLocale: "en" },
    });

    // 3. stylesheet
    await serverRooted.callTool({
      name: "set_stylesheet",
      arguments: {
        css: "body { background: #111; color: #fff; font-family: sans-serif; padding: 80px; }",
      },
    });

    // 4. canvases — one App Store, one Play Store
    await serverRooted.callTool({
      name: "upsert_screenshot_canvas",
      arguments: {
        id: "hero",
        platform: "app_store",
        device: "iphone",
        order: 0,
        html: "<h1 style='font-size:120px'>{{t.headline}}</h1><p style='font-size:60px'>{{t.sub}}</p>",
        strings: {
          en: { headline: "Faster notes", sub: "Capture anything in 2 taps." },
          de: { headline: "Schneller Notizen", sub: "Alles in 2 Tippen." },
        },
      },
    });
    await serverRooted.callTool({
      name: "upsert_screenshot_canvas",
      arguments: {
        id: "feature",
        platform: "play_store",
        device: "android_phone",
        order: 1,
        html: "<h1 style='font-size:100px'>{{t.headline}}</h1>",
        strings: { en: { headline: "Sync everywhere" } },
      },
    });

    // 5. list — manifest should reflect both canvases
    const list = unwrapText(
      (await serverRooted.callTool({
        name: "list_screenshot_canvases",
        arguments: {},
      })) as any,
    );
    expect(list.canvases).toHaveLength(2);

    // 6. preview — App Store hero in German
    const prev = (await serverRooted.callTool({
      name: "capture_preview",
      arguments: { id: "hero", locale: "de" },
    })) as any;
    expect(prev.isError).toBeFalsy();
    const img = prev.content.find((c: any) => c.type === "image");
    expect(img).toBeDefined();
    const pngBuf = Buffer.from(img.data, "base64");
    expect(pngBuf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(pngBuf.readUInt32BE(16)).toBe(1320);
    expect(pngBuf.readUInt32BE(20)).toBe(2868);

    // 7. render_all — should produce 2 canvases × 2 locales = 4 PNGs
    const summary = unwrapText(
      (await serverRooted.callTool({ name: "render_all", arguments: {} })) as any,
    );
    expect(summary.errors).toEqual([]);
    expect(summary.wrote).toBe(4);

    // 8. Files on disk are named per store conventions
    const dePlayDir = path.join(root, "output/play_store/android_phone/de");
    const dePlayFiles = await fs.readdir(dePlayDir);
    const dePlay = dePlayFiles.find((f) => f.endsWith("_01_feature.png"));
    expect(dePlay).toBeDefined();
    // Filename includes the project name (basename of temp dir)
    expect(dePlay!.startsWith(path.basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, "-"))).toBe(
      true,
    );
    // German fallback to English default — file exists even if German has no key
    const playBuf = await fs.readFile(path.join(dePlayDir, dePlay!));
    expect(playBuf.readUInt32BE(16)).toBe(1080);
    expect(playBuf.readUInt32BE(20)).toBe(1920);
  });
});
