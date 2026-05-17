import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// HERE resolves to either `src/mcp/` (tsx) or `dist/mcp/` (built). Both are
// two levels deep inside the package root, so the SKILL path is the same.
const PACKAGE_ROOT = path.resolve(HERE, "..", "..");
const SKILL_PATH = path.join(
  PACKAGE_ROOT,
  ".claude/skills/appstore-screenshots/SKILL.md",
);

/**
 * Short text shown to MCP clients that surface server-level instructions
 * (Cursor, Cline, Continue, Goose, etc.). The full guide is also available as
 * a resource and via the `get_workflow_guide` tool.
 */
export const SERVER_INSTRUCTIONS = `\
This server creates App Store / Play Store screenshots. The agent authors each \
screenshot as freeform HTML/CSS; the server renders, previews, and exports PNGs.

Standard workflow:
  1. list_screenshot_canvases   (see what already exists)
  2. init_project               (only if not initialized)
  3. set_project_name           (slug used as the export filename prefix)
  4. set_locales                (e.g. ['en','de'], default 'en')
  5. set_stylesheet             (one global CSS for all canvases)
  6. list_source_assets         (see user-dropped screenshots)
  7. upsert_screenshot_canvas   (one per screenshot; HTML body, no <html>/<head>)
  8. capture_preview            (look at the PNG; iterate)
  9. render_all                 (write final PNGs to output/)

Conventions:
- Reference localized strings in HTML as {{t.key}}; provide them via the \
\`strings\` map on upsert_screenshot_canvas.
- Reference user images as <img src='assets/...'>.
- Devices render at exact store-spec dimensions (1320x2868 for app_store/iphone, \
1080x1920 for play_store/android_phone). Author at those sizes.
- Output: output/<platform>/<device>/<locale>/<name>_<platform>_<device>_<locale>_<order>_<id>.png

Before picking visual direction (colors, fonts, mockup treatment, layout), \
ASK THE USER what they want — don't assume defaults.

Read the full guide via the resource at screenshots://workflow-guide or the \
\`get_workflow_guide\` tool.`;

/**
 * Strip the Claude-skill YAML frontmatter from the SKILL.md content so the
 * same file serves both Claude Code (as a skill) and other MCP clients (as a
 * plain workflow guide).
 */
function stripFrontmatter(s: string): string {
  if (!s.startsWith("---")) return s;
  const close = s.indexOf("\n---", 3);
  if (close === -1) return s;
  return s.slice(close + 4).replace(/^\n+/, "");
}

const FALLBACK_GUIDE = SERVER_INSTRUCTIONS;

let cached: string | undefined;

export function getWorkflowGuide(): string {
  if (cached !== undefined) return cached;
  try {
    const raw = fs.readFileSync(SKILL_PATH, "utf8");
    cached = stripFrontmatter(raw).trim() + "\n";
  } catch {
    cached = FALLBACK_GUIDE;
  }
  return cached;
}

export const WORKFLOW_GUIDE_URI = "screenshots://workflow-guide";
