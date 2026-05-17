---
name: appstore-screenshots
description: Design, render, and export App Store / Play Store screenshots through the app-store-screenshot-maker MCP server. Use when the user wants to create or update store screenshots, build a screenshot set for a new app or update, localize existing screenshots, redesign the layout/style of their store listing creative, or render final PNGs for upload to App Store Connect or Google Play Console. Triggers on "App Store screenshots", "Play Store screenshots", "store screenshots", "screenshot set", "iPhone screenshots", "Android screenshots", "screenshot canvas", "localize screenshots", "screenshot maker", and references to the canvases/, output/, or manifest.json layout this MCP creates.
---

# App Store Screenshot Maker — agent guide

You are driving the `app-store-screenshot-maker` MCP server. It runs locally,
exposes 10 tools, and gives the human a live preview at `http://127.0.0.1:4747`.
You author screenshots as freeform HTML/CSS — the tool handles rendering,
i18n substitution, and exporting store-spec PNGs.

## When this skill applies

- "Make App Store / Play Store screenshots for my app"
- "Design a screenshot set highlighting features X, Y, Z"
- "Localize my screenshots into German / Japanese / …"
- "Re-render with a new headline / new font / new background"
- "Export final PNGs at 1320×2868 / 1080×1920"

## Mental model

```
project/
├── manifest.json    project name, locales, registered canvases
├── styles.css       ONE global stylesheet shared by every canvas
├── canvases/<id>.html       per-canvas HTML body (no <html>/<head>)
├── locales/<lang>.json      i18n key→value bundles
├── assets/                  user-dropped source screenshots
└── output/                  rendered PNGs (filename includes project name)
```

You **edit** the project; the **user reviews** in the live web UI.

## Standard workflow

For a fresh project, in this order:

1. **`list_screenshot_canvases`** — see what (if anything) already exists.
2. **`init_project`** — only if not initialized. Creates the folder layout.
3. **`set_project_name`** — short slug (e.g. `keep`); becomes the filename prefix.
4. **`set_locales`** — declare locales + default (e.g. `['en','de']`, default `en`).
5. **`list_source_assets`** — see what raw screenshots the user has dropped in.
6. **`set_stylesheet`** — write the global CSS once. Treat this as your design system.
7. **`upsert_screenshot_canvas`** × N — one canvas per screenshot slot, each with:
   - `id` (kebab-case, e.g. `01-hero`, `02-search`)
   - `platform` (`app_store` | `play_store`)
   - `device` (`iphone` | `android_phone`)
   - `order` (sort index, 0-based)
   - `html` body — references `{{t.key}}` tokens and `<img src='assets/…'>`
   - `strings` — per-locale key→value maps
8. **`capture_preview`** after each upsert — look at the returned PNG, fix issues.
9. **`render_all`** — produces every (canvas × locale) PNG in `output/`.

## Conventions you MUST follow

- **Token syntax**: `{{t.key}}` only (no spaces required, but allowed: `{{ t.key }}`). Keys match `[a-zA-Z0-9_]`. Unresolved tokens render in-place so missing strings stay visible during review.
- **HTML body only**: never include `<html>`, `<head>`, `<body>`, `<style>`, `<link>`, or `<meta>`. The renderer wraps your body in a doc that already attaches `styles.css` and sets `<base href>` for asset resolution.
- **Asset paths**: relative, starting with `assets/`. They resolve from the project root via `<base href>`. Example: `<img src="assets/people.png">`.
- **Canvas id charset**: `^[a-z0-9][a-z0-9_-]*$`. Prefix with the order (`01-hero`, `02-detail`) so directory listings sort naturally.
- **Locale codes**: BCP-47 style — `en`, `de`, `pt-BR`. Not `EN`, not `en_US`.

## Device dimensions

Hardcoded defaults; override per-project via `manifest.dimensions`.

| Platform     | Device          | Width | Height |
| ------------ | --------------- | ----: | -----: |
| `app_store`  | `iphone`        | 1320  | 2868   |
| `play_store` | `android_phone` | 1080  | 1920   |

Author HTML/CSS at these exact pixel sizes. **Do not** scale or use viewport units like `vw/vh` expecting a smaller canvas — the renderer always uses the spec dims.

## Output filename convention

```
output/<platform>/<device>/<locale>/<name>_<platform>_<device>_<locale>_<order>_<id>.png
```

Example: `output/app_store/iphone/en/keep_app_store_iphone_en_01_01-hero.png`.

The filename is intentionally redundant with the directory path so individual files stay identifiable when the user drag-drops them into App Store Connect.

## Design — ask first

Don't guess the visual direction. Defaults vary wildly between apps and brands; an assumed style wastes the user's first render review. Before writing CSS, ask the user (a few of these, not all):

- Brand colors — accent, background, ink.
- Typography — system fonts, a specific Google Font, or something they already use in the app?
- A reference they want to match — Apple-keynote-clean, editorial / NYT-Magazine, brutalist, playful, dense screenshot-of-the-product-only, etc.
- How the phone mockup should sit — bare, rounded corners, shadow, decorative chrome, hand-holding-phone composite, no mockup at all?
- Headline tone — functional ("Edit photos in seconds") or aspirational ("See your story differently").
- Layout — copy-on-top + phone-below, side-by-side, full-bleed phone with overlaid copy?

Lock the chosen direction in `styles.css` so individual canvases stay terse.

## Structural pattern (when the user has no strong preference)

A workable default anatomy you can propose:

- Optional kicker (small uppercase label) → headline (the promise) → optional sub-head (one line of context) → phone mockup anchored to the bottom.
- One idea per screenshot. The headline leads; the screenshot supports it.

Tall canvas (1320×2868 is 2.17:1) so plan a generous copy zone at the top and let the mockup occupy the bottom half.

## Locale length

German / French headlines run ~30–40% longer than English. Test your tightest typography against the longest locale before locking it in, or use `text-wrap: balance` and a `max-width` so wrapping stays sensible.

## Self-QA loop

After every `upsert_screenshot_canvas`:

1. `capture_preview` for the canvas, default locale.
2. Read the returned PNG (the result is image content; look at it).
3. Check: copy is readable? Phone isn't clipped? Token wasn't left unresolved? Accent color is visible against the background?
4. Iterate on the HTML/CSS until it looks right.
5. Repeat for each non-default locale (length / line break issues).

The `capture_preview` text content also lists `Missing locale keys for X: …` — treat any non-empty list as a bug to fix before render_all.

## Failure modes & fixes

| Symptom                                       | Likely cause                                                            | Fix                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `{{t.headline}}` visible in the PNG           | Key missing from locale file                                            | Re-upsert with the right `strings` map                    |
| `<img>` shows broken icon                     | Wrong path or asset not actually in `assets/`                           | Call `list_source_assets` first; use exact returned path  |
| Phone is squished or cropped                  | Authored at the wrong canvas size                                       | Design at the literal dims (1320×2868 / 1080×1920)        |
| All cards look the same in the UI             | Forgot to give canvases distinct `order` values                         | Update `order` so they sort                               |
| `render_all` reports `errors`                 | An individual canvas crashed                                            | Read the error message, inspect that canvas's HTML        |
| `No manifest at … Run init_project first`     | The server is running in a dir where the project was never initialized | Call `init_project` (no args) and retry                   |

## Don'ts

- Don't recreate a canvas you can update — `upsert_screenshot_canvas` is in-place.
- Don't `set_stylesheet` with a tiny diff — you must pass the full file.
- Don't put one-off styles inline if the same rule applies across canvases; put them in `styles.css` so future canvases inherit.
- Don't call `render_all` after every edit — it's the final export step. Use `capture_preview` for iteration; `render_all` once you're done.
- Don't reference external CDNs (fonts, images). The renderer runs offline and they'll silently fail.
- Don't pad order indices with zeros in the `order` field (it's an int); do pad them in the id (`01-hero`) so listings sort.
