# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`app-store-screenshot-maker` is a local MCP server that lets an AI agent design, preview, and export App Store / Play Store screenshots as freeform HTML/CSS. The server speaks MCP over stdio (one client process per session) and also runs a companion Fastify UI on `http://127.0.0.1:4747` for live preview during authoring. Final output is store-spec PNGs.

The README and `app-store-screenshot-maker-prd.md` cover the product surface; this file covers how the code is wired.

## Commands

```bash
npm install
npx playwright install chromium   # one-time; required for tests + rendering
npm run dev                       # tsx, no build step (src/index.ts)
npm run build                     # tsc → dist/ + copies src/ui/public into dist/ui/public
npm test                          # vitest run (spawns real Chromium)
npm run typecheck                 # tsc --noEmit
```

Single-test runs:

```bash
npx vitest run test/render.test.ts                              # one file
npx vitest run test/render.test.ts -t "missing locale keys"     # one case
```

Full end-to-end smoke (drives the handlers directly, regenerates `playground/output/` with 6 PNGs):

```bash
npx tsx playground/build.ts
```

## Architecture

### Two servers, one shared state

`src/index.ts` starts **two** servers off a single `ProjectState`:

1. **MCP stdio server** (`src/mcp/server.ts`) — exposes 11 tools to the agent.
2. **Fastify UI server** (`src/ui/server.ts`) — `http://127.0.0.1:4747`, with WebSocket hot-reload.

Both read and mutate the same `ProjectState` (`src/project/state.ts`) — a tiny pub/sub holding the currently-active project root. When the MCP layer changes the root via `init_project` / `set_active_project`, subscribers fire: the UI server restarts its chokidar watcher against the new tree and broadcasts a reload to connected browser clients. The UI's `/project/*` route is intentionally dynamic (not `fastifyStatic`) for this reason — the project root can change at runtime.

Disable the UI with `SCREENSHOT_MAKER_NO_UI=1`. Override the port with `SCREENSHOT_MAKER_PORT`.

### Active-project discovery

On startup (`src/project/discover.ts`), the server walks up from `process.cwd()` looking for a `manifest.json` that parses as `{ version: 1, canvases: [...] }`. If found, that directory becomes the active project — no `cwd` configuration is needed in the MCP client. Users can install ONE global MCP entry and `cd` between project folders. If nothing is found, the spawn dir is active and the agent is expected to call `init_project`.

### Three-layer agent guidance

To work across clients with different capabilities, the workflow guide is exposed three ways (all in `src/mcp/instructions.ts`):

1. `instructions` field on `InitializeResult` — short workflow, all MCP clients see this.
2. MCP resource `screenshot-maker://workflow-guide` — full guide for clients that surface resources.
3. `get_workflow_guide` tool — universal fallback for clients that only support tools.

The full guide is sourced from `.claude/skills/appstore-screenshots/SKILL.md` with the Claude-skill YAML frontmatter stripped, then cached in memory. **When updating workflow guidance for agents, edit SKILL.md** — `instructions.ts` reads from it. The fallback string in `instructions.ts` is only used if the SKILL.md file can't be read at runtime.

### MCP tool flow

`src/mcp/server.ts` is config-driven: `TOOL_CONFIGS` lists the 11 tools with their Zod input schemas (`src/mcp/tools.ts`), and `HANDLERS` in `src/mcp/handlers.ts` maps each name to its handler. Each handler receives `{ state: ProjectState }` and the raw args, validates via Zod, mutates files under `state.root`, returns `{ content: [...], isError? }`. To add a tool: add a schema in `tools.ts`, a handler in `handlers.ts`, and a config entry in `server.ts` — the registration loop wires the rest.

Errors from handlers are caught centrally in the `registerTool` wrapper and converted to `{ isError: true, content: [text] }`; Zod errors are formatted via `formatZodError`.

### Rendering pipeline

`src/render/renderer.ts` is the only thing that touches Playwright.

- One process-wide shared browser (`src/render/browser.ts::getBrowser`) — launched lazily, closed via `closeBrowser` in tests' `afterAll`. New `BrowserContext` per render for isolation.
- Composition (`src/render/compose.ts`): wraps the canvas HTML body in a doctype with `<base href="file://.../project-root/">` and `<link rel="stylesheet" href="styles.css">`. Token substitution `{{t.key}}` happens here; unresolved tokens stay visible in the rendered PNG so the gap is obvious during review, and missing keys are returned alongside the PNG.
- The composed HTML is written as `.preview-<hex>.html` **inside the project root** (not `/tmp`) so that `file://` URLs to `assets/*` resolve through the `<base>`. The temp file is `fs.unlink`'d after the screenshot. The filename is dot-prefixed so the chokidar watcher's dotfile ignore filter skips it.
- Device dimensions live in `src/render/presets.ts` (1320×2868 iPhone, 1080×1920 Android phone). Per-project overrides go in `manifest.dimensions`.

### Filesystem invariants

- **Atomic writes everywhere.** `src/project/io.ts::atomicWrite` stages to a sibling `.tmp` file then `fs.rename`s. Use it for every file write to the project tree; never `fs.writeFile` directly. Chokidar's dotfile ignore filter skips the `.tmp` so watchers don't fire on the stage step.
- **`set_stylesheet` is a full-file replace** — no diff/partial-update tool by design. Same for `upsert_screenshot_canvas` on the HTML body. Locale string maps DO merge (`mergeLocale`).
- **Locale strings persist across canvas deletes.** Deleting a canvas removes `canvases/<id>.html` and its manifest entry but leaves the locale JSON alone — other canvases may share keys.
- **Locale fallback at render time:** missing keys in a non-default locale fall back to the default-locale value; if still missing, the `{{t.key}}` literal renders unchanged.

### Output filenames

Format: `output/<platform>/<device>/<locale>/<order>_<id>_<name>_<platform>_<device>_<locale>.png` (see `outputPathFor` in `renderer.ts`). The redundancy with the directory path is intentional — individual files stay identifiable when drag-dropped into App Store Connect / Play Console. The `<order>` is zero-padded to 2 digits for natural sorting.

### Tests

Vitest, single-process. `test/render.test.ts` and `test/e2e.test.ts` spin up real Chromium — they will fail without `npx playwright install chromium`. PNG dimensions are verified by reading the IHDR width/height bytes directly (`readPngDimensions` in `render.test.ts`). The 30-second test timeout in `vitest.config.ts` is sized for the browser launch.

Test helpers (`test/helpers.ts`) make temp dirs in `os.tmpdir()` and a fresh `ProjectState`. Tests call handlers directly with a `HandlerContext` — they don't go through the MCP transport.

## Conventions

- **ES modules with `.js` import extensions from `.ts` source.** `tsconfig.json` uses `module: ESNext` + `moduleResolution: Bundler`; imports look like `from "./paths.js"` even though the source is `paths.ts`. Don't omit the extension.
- **`noUncheckedIndexedAccess` is on.** Array indexing returns `T | undefined`; use `!` only when you've already checked length, or guard explicitly.
- **No external network at render time.** Don't reference external CDN fonts/images in canvas HTML — Playwright runs offline-ish (`waitUntil: "networkidle"` will hang waiting for resources that won't load). Bundle anything you need into `assets/` or inline it in `styles.css`.
- **Manifest is the source of truth.** Always read via `readManifest` (Zod-validated) and write via `writeManifest` (re-validates). Direct JSON reads/writes bypass schema enforcement.

## When working with the agent-facing workflow

The agent-facing guide lives in `.claude/skills/appstore-screenshots/SKILL.md`. It's both the Claude Code skill AND the source for the MCP workflow guide served to other clients. When changing what the agent should do (tool call order, conventions, naming rules), edit SKILL.md — it propagates automatically to the resource and the `get_workflow_guide` tool. The short `SERVER_INSTRUCTIONS` constant in `src/mcp/instructions.ts` is duplicated by hand and should be kept roughly in sync.
