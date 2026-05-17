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
import {
  SERVER_INSTRUCTIONS,
  getWorkflowGuide,
  WORKFLOW_GUIDE_URI,
} from "./instructions.js";

interface ToolConfig {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
}

const TOOL_CONFIGS: ToolConfig[] = [
  {
    name: "init_project",
    description:
      "Initialize the screenshot project in the working directory: create manifest.json, styles.css, and the canvases/, locales/, assets/, output/ folders. Idempotent — safe to call again; nothing is overwritten. Call this FIRST before any other tool. The project dir's basename becomes the default name prefix on exports; override later with set_project_name.",
    schema: InitProjectInput,
  },
  {
    name: "set_project_name",
    description:
      "Set the project slug that becomes the prefix on every exported filename. Lowercase letters/digits/dashes/underscores only. Example: name='keep' produces 'keep_app_store_iphone_en_01_hero.png'. Call this once early in the workflow.",
    schema: SetProjectNameInput,
  },
  {
    name: "set_stylesheet",
    description:
      "Replace the global styles.css applied to every canvas. Called with the FULL file contents — there is no partial update. Use CSS custom properties and class selectors so individual canvas HTML can stay short and semantic.",
    schema: SetStylesheetInput,
  },
  {
    name: "upsert_screenshot_canvas",
    description:
      "Create or update one screenshot canvas. Supply: id, platform (app_store|play_store), device (iphone|android_phone), order (sort index, 0-based), HTML body (no <html>/<head>/<body> wrapper), and an optional per-locale strings map. Reference localized strings in the HTML as {{t.key}}. Reference dropped images as <img src='assets/...'>. Calling with an existing id overwrites the HTML and merges in the new strings.",
    schema: UpsertCanvasInput,
  },
  {
    name: "delete_screenshot_canvas",
    description:
      "Delete a canvas: removes canvases/<id>.html and its manifest entry. Per-locale string keys are intentionally left in locales/<lang>.json — other canvases may share them.",
    schema: DeleteCanvasInput,
  },
  {
    name: "list_screenshot_canvases",
    description:
      "Return the full manifest: project name, locales, defaultLocale, registered canvases (with platform/device/order), and any dimension overrides. Call this at the start of a session to see what already exists before editing.",
    schema: ListCanvasesInput,
  },
  {
    name: "set_locales",
    description:
      "Declare which locales this project supports (e.g. ['en', 'de', 'ja']) and which is the default. Creates an empty locales/<lang>.json for each new locale. At render time, the default locale's strings act as the fallback when a key is missing in another locale.",
    schema: SetLocalesInput,
  },
  {
    name: "capture_preview",
    description:
      "Render one canvas at one locale and return the PNG inline so you can visually verify it. Use this iteratively while authoring a canvas: upsert, capture_preview, look at the image, adjust, repeat. The text content reports any {{t.key}} tokens that couldn't be resolved. For the final export, use render_all instead.",
    schema: CapturePreviewInput,
  },
  {
    name: "list_source_assets",
    description:
      "List every file under assets/ recursively with POSIX-style relative paths and byte sizes. Use the returned paths directly in canvas HTML: <img src='assets/screens/home.png'>. Hidden files (e.g. .DS_Store) are skipped.",
    schema: ListSourceAssetsInput,
  },
  {
    name: "render_all",
    description:
      "Render every (canvas × locale) combination and write the final PNGs to output/<platform>/<device>/<locale>/<name>_<platform>_<device>_<locale>_<order>_<id>.png. Returns {written, errors, missing}: lists files produced, per-canvas render failures, and any locale/canvas pairs that had unresolved {{t.key}} tokens. Pass `locales` to restrict the export to a subset.",
    schema: RenderAllInput,
  },
];

export interface CreateMcpOptions {
  cwd: string;
}

export function createMcpServer(opts: CreateMcpOptions): McpServer {
  const server = new McpServer(
    { name: "app-store-screenshot-maker", version: "0.1.0" },
    {
      // `instructions` is the MCP-standard way to deliver server-level guidance
      // to ANY client (Claude Code, Cursor, Cline, Continue, Goose, etc.).
      // Claude Code users additionally get the richer SKILL via .claude/skills/.
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { tools: {}, resources: {} },
    },
  );

  // Resource: full workflow guide, for clients that surface MCP resources.
  server.registerResource(
    "workflow-guide",
    WORKFLOW_GUIDE_URI,
    {
      title: "App Store Screenshot Maker — workflow guide",
      description:
        "Read this before calling any tool. Standard workflow, conventions, output filename format, and design-direction questions to ask the user.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: getWorkflowGuide(),
        },
      ],
    }),
  );

  // Tool: universal fallback. Even clients that ignore `instructions` and
  // resources will surface tools. A tool description that tells the agent to
  // "read first" is the most reliable cross-client hand-off we have.
  server.registerTool(
    "get_workflow_guide",
    {
      description:
        "READ FIRST. Returns the full workflow guide: standard tool-call order, naming conventions ({{t.key}} tokens, asset paths, locale codes), the output filename template, design-direction questions to ASK THE USER before picking colors/fonts/layout, and common failure modes. Call this once at the start of any new session.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: getWorkflowGuide() }],
    }),
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
