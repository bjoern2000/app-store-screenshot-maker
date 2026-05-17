#!/usr/bin/env node
import { runStdioServer } from "./mcp/server.js";
import { startUiServer } from "./ui/server.js";
import { ProjectState } from "./project/state.js";
import { discoverProjectRoot } from "./project/discover.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const port = Number(process.env.SCREENSHOT_MAKER_PORT ?? 4747);

  // On startup, walk up from cwd looking for an existing screenshot project.
  // If found, that becomes the active project. Otherwise, the active root
  // defaults to cwd and the agent is expected to init_project there (or
  // somewhere else via init_project({root: ...})).
  const discovered = await discoverProjectRoot(cwd);
  const state = new ProjectState(discovered ?? cwd);
  if (discovered) {
    console.error(`[active project] ${discovered}`);
  } else {
    console.error(`[no project found; active root = ${cwd}]`);
  }

  if (!process.env.SCREENSHOT_MAKER_NO_UI) {
    const ui = await startUiServer({ state, port });
    console.error(`[ui] ${ui.url}`);
  }

  await runStdioServer({ state });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
