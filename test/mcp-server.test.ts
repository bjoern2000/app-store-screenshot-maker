import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createMcpServer } from "../src/mcp/server.js";
import { makeTempDir, rmDir } from "./helpers.js";

async function pair(cwd: string): Promise<{ client: Client; server: McpServer }> {
  const server = createMcpServer({ cwd });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

describe("MCP server", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("mcp");
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("lists all 10 tools", async () => {
    const { client } = await pair(root);
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "capture_preview",
        "delete_screenshot_canvas",
        "init_project",
        "list_screenshot_canvases",
        "list_source_assets",
        "render_all",
        "set_locales",
        "set_project_name",
        "set_stylesheet",
        "upsert_screenshot_canvas",
      ],
    );
  });

  it("init_project creates project files when called via MCP", async () => {
    const target = path.join(root, "proj");
    const { client } = await pair(root);
    const res = await client.callTool({ name: "init_project", arguments: { root: target } });
    expect(res.isError).toBeFalsy();
    const entries = await fs.readdir(target);
    expect(entries).toContain("manifest.json");
  });

  it("returns isError for invalid input", async () => {
    const { client } = await pair(root);
    const res = await client.callTool({
      name: "upsert_screenshot_canvas",
      arguments: { id: "BAD ID", platform: "app_store", device: "iphone", order: 0, html: "" },
    });
    expect(res.isError).toBeTruthy();
  });

  it("propagates handler errors as isError text content", async () => {
    // render_all on an uninitialized project should surface a readable error,
    // not crash the transport.
    const { client } = await pair(root);
    const res = await client.callTool({ name: "render_all", arguments: {} });
    expect(res.isError).toBeTruthy();
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/No manifest|init_project/);
  });
});
