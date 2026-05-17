#!/usr/bin/env node
import { runStdioServer } from "./mcp/server.js";
import { startUiServer } from "./ui/server.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const port = Number(process.env.SCREENSHOT_MAKER_PORT ?? 4747);

  if (!process.env.SCREENSHOT_MAKER_NO_UI) {
    const ui = await startUiServer({ cwd, port });
    // stdout is reserved for the MCP stdio protocol; log to stderr.
    console.error(`[ui] ${ui.url}`);
  }

  await runStdioServer({ cwd });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
