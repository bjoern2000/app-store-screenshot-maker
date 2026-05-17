# App Store Screenshot Maker — PRD (v1)

## Summary

A local MCP server that provides a canvas-rendering toolkit for AI agents to design, preview, and export App Store and Play Store screenshots. The agent authors screenshots as freeform HTML/CSS; the tool handles rendering, preview, screenshotting for QA, and final PNG export at store-required dimensions.

## Goals

- Let an agent produce a complete, localized set of store screenshots through tool calls alone.
- Give the user a live local preview to review and approve before export.
- Output store-ready PNGs with correct dimensions and file naming.

## Non-goals (v1)

- Tablet / iPad form factors (phone only: iPhone + Android phone).
- Remote / hosted deployment.
- Auto-translation (agent provides all localized strings).
- Direct upload to App Store Connect or Play Console.
- Opinionated layout templates or device frames (agent decides via HTML/CSS).

## Users

- Primary: indie devs and small teams shipping mobile apps, working with an AI coding agent.
- Secondary: the agent itself, as the active author.

## Core concepts

- **Project** — a working directory containing source assets, the style sheet, screenshot definitions, and outputs.
- **Global stylesheet** — one CSS file shared across all screenshots; agent edits this to control overall look.
- **Canvas** — one screenshot definition: HTML content + metadata (platform, device, locale, order).
- **Locale bundle** — i18n-standard strings (e.g. `en`, `de`, `ja`) the agent references from HTML.
- **Source assets folder** — user drops raw app screenshots here; agent reads them.
- **Output folder** — final rendered PNGs land here, named per store conventions.

## Functional requirements

### MCP tools (agent-facing)

1. **`init_project`** — set up folder structure, default stylesheet, empty manifest.
2. **`set_stylesheet`** — write/replace the global CSS.
3. **`upsert_screenshot_canvas`** — create or update a canvas by ID. Inputs: platform (`app_store` | `play_store`), device (`iphone` | `android_phone`), order index, HTML body, per-locale string map.
4. **`delete_screenshot_canvas`** — remove a canvas by ID.
5. **`list_screenshot_canvases`** — return current manifest state.
6. **`set_locales`** — declare which locales the project supports.
7. **`capture_preview`** — render one canvas at one locale and return a PNG (for agent self-QA).
8. **`list_source_assets`** — list files in the source assets folder so the agent can reference them in HTML.
9. **`render_all`** — produce final PNGs for every (canvas × locale) combination to the output folder. Returns a summary.

### Rendering

- HTML/CSS rendered headlessly at exact store-spec pixel dimensions per platform/device.
- Stylesheet applied globally; canvas HTML is the body.
- Local file references (source assets) resolve relative to the project.
- i18n: agent uses a simple string-key syntax in HTML (e.g. `{{t.headline}}`); tool substitutes from the locale bundle at render time.

### Local web UI

- Served on `localhost:<port>` when the MCP server runs.
- Shows all canvases in a grid, grouped by platform/device, with a locale switcher.
- Live-reloads when the agent changes the stylesheet, HTML, or strings.
- A "Render all" button triggers `render_all` from the UI as an alternative to the agent doing it.
- Read-only authoring — the UI is for preview and approval, not editing. The agent edits.
- **Visual style:** minimal dev-tool aesthetic. Modern monospace font (e.g. JetBrains Mono, IBM Plex Mono, or Geist Mono) for all UI text. Neutral background, restrained palette. Each canvas tile has slightly rounded corners and a light drop shadow to lift it off the page.

### File output

- Naming: `{platform}/{device}/{locale}/{order}-{canvas_id}.png`
- Dimensions per current store specs:
  - App Store iPhone: 6.9" display (1320×2868) by default; configurable.
  - Play Store phone: 1080×1920 minimum; configurable.
- PNGs only in v1.

### Source assets

- User drops raw screenshots into `./assets/` (or configured path).
- Tool exposes them via `list_source_assets`; agent embeds via standard `<img src="assets/...">`.

## User flow

1. User runs the MCP server in a project directory; opens local UI in browser.
2. User tells agent what app, what to highlight, what locales.
3. Agent calls `init_project`, `set_locales`, sets stylesheet, creates canvases one by one, calls `capture_preview` to self-check, iterates.
4. User watches the web UI update live, gives feedback to the agent.
5. When happy, user clicks "Render all" (or asks the agent to) → PNGs appear in output folder.

## Open questions (for the technical plan)

- Rendering engine: headless Chromium (Playwright/Puppeteer) is the obvious default; confirm.
- How the manifest is persisted on disk (single JSON vs. per-canvas files).
- Hot-reload mechanism for the local UI (file watcher + WS).
- How exact device-spec pixel dimensions are kept up to date as Apple/Google change them.
