# app-store-screenshot-maker

A local MCP server that lets an AI agent design, preview, and export App Store
and Play Store screenshots as freeform HTML/CSS. The agent authors; the tool
renders headlessly at exact store-spec dimensions, previews in a live web UI,
and exports store-ready PNGs.

## Install

```bash
npm install
npx playwright install chromium
npm run build
```

## How it runs

This is an **on-demand** MCP server. You do not start it yourself in a
terminal — your MCP client (Claude Code, Cursor, Cline, Continue, Goose, …)
spawns it as a subprocess when an agent session starts and shuts it down when
the session ends.

Two things matter for where screenshots end up:

1. The **MCP server's working directory** (`cwd`) IS the screenshot project.
   That's where `manifest.json`, `canvases/`, `assets/`, and `output/` live.
2. The **agent's session directory** can be anywhere else. They're independent.

The UI auto-opens at `http://127.0.0.1:4747` for the lifetime of the server.

Environment overrides (set them in your MCP client's server config):

- `SCREENSHOT_MAKER_PORT=8080` — change the UI port (default 4747)
- `SCREENSHOT_MAKER_NO_UI=1` — disable the UI server (MCP only)

## Wiring it into your MCP client

The pattern is the same in every client: configure a stdio server, point it
at this package's compiled entry, and set `cwd` to your screenshots project.

### Claude Code

```bash
claude mcp add screenshots \
  --cwd /path/to/my-app-screenshots \
  node /path/to/app-store-screenshot-maker/dist/index.js
```

…or edit `~/.claude/settings.json` (user scope) / `<repo>/.claude/settings.json`
(project scope) directly:

```json
{
  "mcpServers": {
    "screenshots": {
      "command": "node",
      "args": ["/path/to/app-store-screenshot-maker/dist/index.js"],
      "cwd": "/path/to/my-app-screenshots"
    }
  }
}
```

### Working in folder A, screenshots in folder B

This is the common case — you're coding your app in `~/code/myapp/` but want
the screenshots project to live in `~/screenshots/myapp/`. Set the MCP
server's `cwd` to the screenshots folder; your Claude Code session stays in
the app folder. The two are decoupled.

```
~/code/myapp/                ← Claude Code session opens here
~/screenshots/myapp/         ← MCP server cwd; canvases, assets, output live here
  manifest.json
  canvases/
  assets/
  output/
```

### Cursor / Cline / Continue / Goose / generic MCP clients

Same config shape, different file. Look for an `mcpServers` block in your
client's settings; provide `command`, `args`, and `cwd`. The server speaks
standard MCP over stdio, no Claude-specific glue.

## Agent guidance — three layers

So any agent on any MCP client knows the workflow:

1. **`instructions`** on the server (MCP `InitializeResult`). A condensed
   workflow guide that compliant clients inject into the agent's system
   prompt automatically. No effort on the user's part.
2. **MCP resource** at `screenshots://workflow-guide` — clients that support
   `resources/list` and `resources/read` expose this to the agent.
3. **`get_workflow_guide` tool** — universal fallback. Any client that can
   list tools can let the agent fetch the full guide.

Claude Code users additionally get the richer
[skill](.claude/skills/appstore-screenshots/SKILL.md) — auto-loaded from
`.claude/skills/` in this repo, or copy that folder to `~/.claude/skills/` to
use it globally.

## Project layout

```
my-app-screenshots/
├── manifest.json          name, locales, canvas registry
├── styles.css             global stylesheet shared by every canvas
├── canvases/<id>.html     per-canvas HTML body (no <html>/<head>)
├── locales/<lang>.json    i18n key→value bundles
├── assets/                user-dropped raw screenshots
└── output/                final PNGs, named per store conventions
```

## MCP tools

| Tool | What it does |
| --- | --- |
| `init_project` | Create the folder layout. Idempotent. Call first. |
| `set_project_name` | Set the slug prefixed onto every export filename. |
| `set_stylesheet` | Replace `styles.css` (full file; no partial updates). |
| `upsert_screenshot_canvas` | Create/update one canvas: id, platform, device, order, HTML, per-locale strings. |
| `delete_screenshot_canvas` | Remove a canvas (HTML + manifest entry). |
| `list_screenshot_canvases` | Return the full manifest. |
| `set_locales` | Declare supported locales + default. Auto-creates empty locale files. |
| `capture_preview` | Render one canvas at one locale; return PNG inline for agent self-QA. |
| `list_source_assets` | Recursively list `assets/` so the agent knows what to reference. |
| `render_all` | Render every (canvas × locale) to `output/`. Final export step. |

## Templating

Canvas HTML uses `{{t.key}}` tokens, substituted from `locales/<lang>.json` at
render time. Missing keys fall back to the default locale; if still missing,
the token stays visible in the rendered PNG so the gap is obvious in preview.

```html
<h1>{{t.headline}}</h1>
<p>{{t.subhead}}</p>
<img src="assets/people.png">
```

## Device dimensions

Defaults match current store specs (2026):

| Platform     | Device          | Default        |
| ------------ | --------------- | -------------- |
| `app_store`  | `iphone`        | **1320 × 2868** (iPhone 6.9") |
| `play_store` | `android_phone` | **1080 × 1920** |

Override per-project in `manifest.json#dimensions`.

## Output filenames

```
output/<platform>/<device>/<locale>/<name>_<platform>_<device>_<locale>_<order>_<id>.png
```

Example: `output/app_store/iphone/en/keep_app_store_iphone_en_01_hero.png`

`name` defaults to the slugified basename of the project dir; override with
`set_project_name`. Filenames are intentionally redundant with the directory
path so individual files stay identifiable when drag-dropped into App Store
Connect.

## Hot reload

The UI keeps a WebSocket open to `/ws`. Any change to `styles.css`, a canvas
HTML file, a locale JSON, or the manifest triggers a debounced reload of all
visible iframes.

## Playground

`playground/` is a worked example built around two iPhone screenshots of a
personal CRM called **Keep**. The driver script there mirrors exactly what an
agent should do via the MCP tools — useful as a reference, and as a smoke test:

```bash
npx tsx playground/build.ts
```

This regenerates `playground/output/` with 6 PNGs (3 canvases × en/de).

## Development

```bash
npm run dev          # tsx, no build step
npm test             # vitest (Chromium needed)
npm run typecheck    # tsc --noEmit
npm run build        # tsc + copy UI public dir into dist/
```

The test suite covers schema validation, project CRUD, the rendering pipeline
(with actual PNG dim assertions), the UI HTTP API, the file watcher,
WebSocket hot-reload, and one full end-to-end agent workflow.
