import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "node:fs/promises";
import path from "node:path";
import { createMcpServer } from "../src/mcp/server.js";
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

describe("MCP server", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("mcp");
  });

  afterEach(async () => {
    await rmDir(root);
  });

  it("lists all 12 tools", async () => {
    const { client } = await pair(root);
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "capture_preview",
        "delete_screenshot_canvas",
        "get_workflow_guide",
        "init_project",
        "list_screenshot_canvases",
        "list_source_assets",
        "render_all",
        "set_active_project",
        "set_locales",
        "set_project_name",
        "set_stylesheet",
        "upsert_screenshot_canvas",
      ],
    );
  });

  it("exposes the workflow guide as a resource any client can fetch", async () => {
    const { client } = await pair(root);
    const list = await client.listResources();
    const guide = list.resources.find((r) => r.uri === "screenshot-maker://workflow-guide");
    expect(guide).toBeDefined();
    const res = await client.readResource({ uri: "screenshot-maker://workflow-guide" });
    const text = (res.contents[0] as { text: string }).text;
    expect(text.length).toBeGreaterThan(500);
    expect(text).toMatch(/Standard workflow|Conventions/i);
  });

  it("get_workflow_guide returns the same content as the resource", async () => {
    const { client } = await pair(root);
    const res = await client.callTool({ name: "get_workflow_guide", arguments: {} });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/upsert_screenshot_canvas/);
    expect(content[0]?.text).toMatch(/{{t\.key}}/);
  });

  it("advertises server.instructions for clients that surface it", async () => {
    const { client } = await pair(root);
    const result = client.getServerVersion();
    // We can't easily read InitializeResult.instructions back through the SDK
    // client API, but we can confirm the server initialized with our name.
    expect(result?.name).toBe("app-store-screenshot-maker");
    // The instructions string itself is exported and stable; test it directly.
    const { SERVER_INSTRUCTIONS } = await import("../src/mcp/instructions.js");
    expect(SERVER_INSTRUCTIONS).toMatch(/Standard workflow/);
    expect(SERVER_INSTRUCTIONS).toMatch(/get_workflow_guide/);
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
