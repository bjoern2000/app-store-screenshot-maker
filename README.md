# app-store-screenshot-maker

A local MCP server that lets an AI agent design, preview, and export App Store
and Play Store screenshots as freeform HTML/CSS. The agent authors; the tool
renders, previews, and exports store-ready PNGs.

## Install

```bash
npm install
npx playwright install chromium
npm run build
```

## Run

Inside the project directory where you want screenshots to live:

```bash
node dist/index.js
```

This starts:

- **MCP server** on stdio — connect your agent to it via your MCP client config.
- **Local web UI** at `http://127.0.0.1:4747` — open in a browser to preview.

To change the port: `SCREENSHOT_MAKER_PORT=8080 node dist/index.js`.
To disable the UI: `SCREENSHOT_MAKER_NO_UI=1 node dist/index.js`.

## Wiring it into Claude Code

`claude mcp add` (or edit your MCP client config) with a stdio entry pointing at
`node /path/to/dist/index.js`, run from the project working directory.

## Project layout

```
my-app-screenshots/
├── manifest.json          locales + canvas registry
├── styles.css             global stylesheet for every canvas
├── canvases/<id>.html     per-canvas HTML body
├── locales/<lang>.json    i18n string bundles
├── assets/                user-dropped raw screenshots
└── output/                final PNGs, named per store conventions
```

## MCP tools

| Tool | Purpose |
| --- | --- |
| `init_project` | Create the folder layout (idempotent). |
| `set_project_name` | Set the slug used as the filename prefix on exports. |
| `set_stylesheet` | Overwrite `styles.css`. |
| `upsert_screenshot_canvas` | Create/update a canvas: HTML + per-locale strings. |
| `delete_screenshot_canvas` | Remove a canvas. |
| `list_screenshot_canvases` | Return the manifest. |
| `set_locales` | Declare supported locales. |
| `capture_preview` | Render one canvas at one locale → PNG (for agent self-QA). |
| `list_source_assets` | List `assets/` for the agent to reference. |
| `render_all` | Render every (canvas × locale) to `output/`. |

## Output filenames

```
output/<platform>/<device>/<locale>/<name>_<platform>_<device>_<locale>_<order>_<id>.png
```

Example: `output/app_store/iphone/en/keep_app_store_iphone_en_01_hero.png`

`name` defaults to the slugified basename of the project dir; override with
`set_project_name`. The filename is intentionally redundant with the directory
path so individual files stay identifiable when moved out of the tree.

## Templating

Canvas HTML can include `{{t.key}}` tokens. They are substituted from
`locales/<lang>.json` at render time, falling back to the default locale. Unresolved
tokens stay visible in the rendered output so the gap is obvious in preview.

## Device dimensions

Defaults match current store specs:

- App Store iPhone 6.9": **1320 × 2868**
- Play Store phone:    **1080 × 1920**

Override per-project in `manifest.json#dimensions`.

## Hot reload

The UI keeps a WebSocket open to `/ws`. Any change to `styles.css`, a canvas
HTML file, a locale JSON, or the manifest triggers a debounced reload of all
visible iframes.

## Development

```bash
npm run dev       # tsx
npm test          # vitest (Chromium needed)
npm run typecheck
```
