import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import WebSocket from "ws";
import { startUiServer, type UiServerHandle } from "../src/ui/server.js";
import { initProject } from "../src/project/init.js";
import { closeBrowser } from "../src/render/browser.js";
import { makeTempDir, rmDir } from "./helpers.js";

let nextPort = 5301;
function pickPort(): number {
  return nextPort++;
}

async function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      ws.off("error", onErr);
      resolve(data.toString());
    };
    const onErr = (e: Error) => {
      ws.off("message", onMsg);
      reject(e);
    };
    ws.once("message", onMsg);
    ws.once("error", onErr);
  });
}

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url.replace(/^http/, "ws") + "/ws");
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}

afterAll(async () => {
  await closeBrowser();
});

describe("WebSocket hot-reload", () => {
  let root: string;
  let ui: UiServerHandle;

  beforeEach(async () => {
    root = await makeTempDir("ws");
    await initProject(root);
    // Disable the FS watcher so we can drive broadcasts deterministically.
    ui = await startUiServer({ cwd: root, port: pickPort(), watch: false });
  });

  afterEach(async () => {
    await ui.close();
    await rmDir(root);
  });

  it("delivers broadcast reload events to connected clients", async () => {
    const ws = await openWs(ui.url);
    const messagePromise = nextMessage(ws);
    ui.broadcast({ type: "reload", kind: "stylesheet", path: "/x/styles.css" });
    const msg = JSON.parse(await messagePromise);
    expect(msg).toMatchObject({ type: "reload", kind: "stylesheet" });
    ws.close();
  });

  it("removes clients on disconnect", async () => {
    const ws = await openWs(ui.url);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    // After close, broadcast should be a no-op (no throws).
    expect(() =>
      ui.broadcast({ type: "reload", kind: "manifest", path: "x" }),
    ).not.toThrow();
  });
});
