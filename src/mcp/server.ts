import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  InitProjectInput,
  SetProjectNameInput,
  SetStylesheetInput,
  UpsertCanvasInput,
  DeleteCanvasInput,
  ListCanvasesInput,
  SetLocalesInput,
  CapturePreviewInput,
  ListSourceAssetsInput,
  RenderAllInput,
} from "./tools.js";
import { HANDLERS, type HandlerContext, type TextResult, formatZodError } from "./handlers.js";

interface ToolConfig {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
}

const TOOL_CONFIGS: ToolConfig[] = [
  {
    name: "init_project",
    description:
      "Set up the project folder structure (manifest, styles.css, canvases/, locales/, assets/, output/). Idempotent.",
    schema: InitProjectInput,
  },
  {
    name: "set_project_name",
    description:
      "Set the short project slug used as the prefix for exported PNG filenames (e.g. 'keep' → keep_app_store_iphone_en_01_hero.png).",
    schema: SetProjectNameInput,
  },
  {
    name: "set_stylesheet",
    description: "Overwrite the global styles.css applied to every canvas.",
    schema: SetStylesheetInput,
  },
  {
    name: "upsert_screenshot_canvas",
    description:
      "Create or update one screenshot canvas. Writes canvases/<id>.html, registers it in the manifest, and merges per-locale string maps into locales/<lang>.json.",
    schema: UpsertCanvasInput,
  },
  {
    name: "delete_screenshot_canvas",
    description: "Remove a canvas by id (HTML file + manifest entry).",
    schema: DeleteCanvasInput,
  },
  {
    name: "list_screenshot_canvases",
    description: "Return the current manifest (locales, defaultLocale, canvases, dimensions).",
    schema: ListCanvasesInput,
  },
  {
    name: "set_locales",
    description:
      "Declare which locales this project supports. Creates an empty locales/<lang>.json for each new locale.",
    schema: SetLocalesInput,
  },
  {
    name: "capture_preview",
    description:
      "Render one canvas at one locale and return a PNG (base64) so the agent can self-check the output.",
    schema: CapturePreviewInput,
  },
  {
    name: "list_source_assets",
    description: "List files in the assets/ folder (recursive) so the agent knows what it can reference.",
    schema: ListSourceAssetsInput,
  },
  {
    name: "render_all",
    description:
      "Render every (canvas × locale) combination to output/ as final store-spec PNGs. Returns a summary.",
    schema: RenderAllInput,
  },
];

export interface CreateMcpOptions {
  cwd: string;
}

export function createMcpServer(opts: CreateMcpOptions): McpServer {
  const server = new McpServer(
    { name: "app-store-screenshot-maker", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const ctx: HandlerContext = { cwd: opts.cwd };

  for (const cfg of TOOL_CONFIGS) {
    const handler = HANDLERS[cfg.name];
    if (!handler) throw new Error(`Missing handler for tool ${cfg.name}`);
    server.registerTool(
      cfg.name,
      {
        description: cfg.description,
        inputSchema: cfg.schema.shape,
      },
      async (args: unknown): Promise<TextResult> => {
        try {
          return await handler(ctx, args);
        } catch (e) {
          if (e instanceof z.ZodError) {
            return {
              content: [{ type: "text", text: `Invalid input: ${formatZodError(e)}` }],
              isError: true,
            };
          }
          const msg = e instanceof Error ? e.message : String(e);
          return { content: [{ type: "text", text: msg }], isError: true };
        }
      },
    );
  }

  return server;
}

export async function runStdioServer(opts: CreateMcpOptions): Promise<void> {
  const server = createMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
