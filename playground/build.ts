/**
 * Driver script for the smoke test. Calls the handlers directly as if it
 * were the agent driving the MCP tools. Run with:
 *   npx tsx playground/build.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  handleSetLocales,
  handleSetProjectName,
  handleSetStylesheet,
  handleUpsertCanvas,
  handleCapturePreview,
  handleRenderAll,
  handleListSourceAssets,
  type HandlerContext,
} from "../src/mcp/handlers.js";
import { closeBrowser } from "../src/render/browser.js";
import { ProjectState } from "../src/project/state.js";

const ROOT = path.resolve("playground");
const ctx: HandlerContext = { state: new ProjectState(ROOT) };

const STYLESHEET = String.raw`
:root {
  --bg: #fff8ec;
  --bg-2: #fef0d8;
  --ink: #1c1917;
  --ink-soft: #57534e;
  --accent: #f59e0b;
  --accent-2: #d97706;
  --shadow: 0 30px 80px -20px rgba(31, 22, 6, 0.25);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%);
  color: var(--ink);
  font-family: -apple-system, "SF Pro Display", "Inter", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

.frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 160px 100px 0;
}

.kicker {
  font-size: 44px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-2);
  margin-bottom: 36px;
}

.headline {
  font-size: 156px;
  font-weight: 800;
  line-height: 1.02;
  letter-spacing: -0.035em;
  text-align: center;
  max-width: 1120px;
  margin-bottom: 36px;
}

.headline em {
  font-style: normal;
  color: var(--accent-2);
}

.subhead {
  font-size: 52px;
  font-weight: 500;
  color: var(--ink-soft);
  text-align: center;
  max-width: 1100px;
  margin-bottom: 80px;
  line-height: 1.25;
}

.phone {
  width: 920px;
  height: auto;
  border-radius: 90px;
  box-shadow: var(--shadow);
  display: block;
  margin-top: auto;
  position: relative;
}

.phone img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 90px;
}

.tag-row {
  display: flex;
  gap: 22px;
  margin-bottom: 60px;
  flex-wrap: wrap;
  justify-content: center;
}

.tag {
  background: #fff;
  border: 2px solid #fde6ba;
  border-radius: 999px;
  padding: 18px 32px;
  font-size: 36px;
  font-weight: 600;
  color: var(--ink-soft);
}

.tag.accent {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
`;

async function ok(label: string, p: Promise<{ isError?: boolean; content: any[] }>) {
  const r = await p;
  if (r.isError) {
    const txt = r.content.find((c: any) => c.type === "text")?.text ?? "(no text)";
    throw new Error(`${label} failed: ${txt}`);
  }
  return r;
}

async function main() {
  console.log("→ list_source_assets");
  const assets = await ok("list_source_assets", handleListSourceAssets(ctx, {}));
  console.log(assets.content[0]!.text);

  console.log("→ set_project_name");
  await ok("set_project_name", handleSetProjectName(ctx, { name: "keep" }));

  console.log("→ set_locales");
  await ok("set_locales", handleSetLocales(ctx, {
    locales: ["en", "de"],
    defaultLocale: "en",
  }));

  console.log("→ set_stylesheet");
  await ok("set_stylesheet", handleSetStylesheet(ctx, { css: STYLESHEET }));

  // Canvas 1 — people list, lead with the brand promise.
  console.log("→ upsert canvas 01-people");
  await ok("upsert 01", handleUpsertCanvas(ctx, {
    id: "01-people",
    platform: "app_store",
    device: "iphone",
    order: 1,
    html: `
<div class="frame">
  <div class="kicker">{{t.c1_kicker}}</div>
  <h1 class="headline">{{t.c1_headline}}</h1>
  <p class="subhead">{{t.c1_sub}}</p>
  <div class="phone"><img src="assets/people.png" alt=""></div>
</div>`,
    strings: {
      en: {
        c1_kicker: "Personal CRM",
        c1_headline: "Keep <em>everyone</em> close.",
        c1_sub: "A pocket-sized memory for the people who matter.",
      },
      de: {
        c1_kicker: "Persönliches CRM",
        c1_headline: "Halte <em>alle</em> nah.",
        c1_sub: "Ein Gedächtnis für die Menschen, die zählen.",
      },
    },
  }));

  // Canvas 2 — detail view, lead with voice notes.
  console.log("→ upsert canvas 02-voice");
  await ok("upsert 02", handleUpsertCanvas(ctx, {
    id: "02-voice",
    platform: "app_store",
    device: "iphone",
    order: 2,
    html: `
<div class="frame">
  <div class="kicker">{{t.c2_kicker}}</div>
  <h1 class="headline">{{t.c2_headline}}</h1>
  <p class="subhead">{{t.c2_sub}}</p>
  <div class="phone"><img src="assets/detail.png" alt=""></div>
</div>`,
    strings: {
      en: {
        c2_kicker: "Voice notes",
        c2_headline: "Tap once. <em>Never forget.</em>",
        c2_sub: "Drop a voice note after every chat. We'll handle the rest.",
      },
      de: {
        c2_kicker: "Sprachnotizen",
        c2_headline: "Ein Tipp. <em>Alles bleibt.</em>",
        c2_sub: "Eine Sprachnotiz nach jedem Gespräch. Wir kümmern uns um den Rest.",
      },
    },
  }));

  // Canvas 3 — detail view, lead with "At a Glance" summary.
  console.log("→ upsert canvas 03-glance");
  await ok("upsert 03", handleUpsertCanvas(ctx, {
    id: "03-glance",
    platform: "app_store",
    device: "iphone",
    order: 3,
    html: `
<div class="frame">
  <div class="kicker">{{t.c3_kicker}}</div>
  <h1 class="headline">{{t.c3_headline}}</h1>
  <p class="subhead">{{t.c3_sub}}</p>
  <div class="tag-row">
    <div class="tag accent">{{t.c3_tag1}}</div>
    <div class="tag">{{t.c3_tag2}}</div>
    <div class="tag">{{t.c3_tag3}}</div>
  </div>
  <div class="phone"><img src="assets/detail.png" alt=""></div>
</div>`,
    strings: {
      en: {
        c3_kicker: "At a glance",
        c3_headline: "Walk in <em>knowing</em>.",
        c3_sub: "Birthday. Last chat. Who they're close to. All in one tap.",
        c3_tag1: "Last conversation",
        c3_tag2: "Family ties",
        c3_tag3: "Upcoming dates",
      },
      de: {
        c3_kicker: "Auf einen Blick",
        c3_headline: "Geh <em>vorbereitet</em> rein.",
        c3_sub: "Geburtstag. Letztes Gespräch. Wer wichtig ist. Ein Tipp.",
        c3_tag1: "Letzter Kontakt",
        c3_tag2: "Familie",
        c3_tag3: "Anstehende Termine",
      },
    },
  }));

  // Capture previews and save them so we can read them.
  for (const id of ["01-people", "02-voice", "03-glance"]) {
    console.log(`→ capture_preview ${id} en`);
    const r = await ok(`preview ${id}`, handleCapturePreview(ctx, { id, locale: "en" }));
    const img = r.content.find((c: any) => c.type === "image");
    if (!img) throw new Error("no image content");
    const data = (img as any).data as string;
    const out = path.join(ROOT, `_preview-${id}-en.png`);
    await fs.writeFile(out, Buffer.from(data, "base64"));
    console.log(`   saved ${out}`);
  }

  console.log("→ render_all");
  const summary = await ok("render_all", handleRenderAll(ctx, {}));
  console.log(summary.content[0]!.text);

  await closeBrowser();
}

main().catch((e) => {
  console.error("FAIL:", e);
  closeBrowser().finally(() => process.exit(1));
});
