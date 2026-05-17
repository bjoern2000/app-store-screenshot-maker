import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { projectPaths, type ProjectPaths } from "../project/paths.js";
import { readManifest, defaultManifest } from "../project/manifest.js";
import { exists } from "../project/io.js";
import { readCanvasHtml } from "../project/canvases.js";
import { readLocale } from "../project/locales.js";
import { composeHtml } from "../render/compose.js";
import { renderAll } from "../render/renderer.js";
import { startWatcher, type WatchHandle, type ReloadEvent } from "./watcher.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");

export interface UiServerOptions {
  cwd: string;
  port?: number;
  /** Disable filesystem watching + WS hot-reload (used in tests that don't need it). */
  watch?: boolean;
}

export interface UiServerHandle {
  app: FastifyInstance;
  port: number;
  url: string;
  paths: ProjectPaths;
  /** Force-broadcast a reload event to all connected WS clients (for tests). */
  broadcast: (event: ReloadEvent) => void;
  close: () => Promise<void>;
}

export async function startUiServer(opts: UiServerOptions): Promise<UiServerHandle> {
  const paths = projectPaths(opts.cwd);
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: "/ui/",
    decorateReply: false,
  });

  // Serve the project root under /project/* so composed previews can resolve
  // relative URLs (assets/x.png, styles.css) via <base href="/project/">.
  await app.register(fastifyStatic, {
    root: paths.root,
    prefix: "/project/",
    decorateReply: false,
  });

  interface WsLike {
    readyState: number;
    send(data: string): void;
    close(): void;
    on(event: "close", cb: () => void): void;
  }
  const wsClients = new Set<WsLike>();
  const broadcast = (event: ReloadEvent): void => {
    const msg = JSON.stringify(event);
    for (const sock of wsClients) {
      if (sock.readyState === 1 /* OPEN */) sock.send(msg);
    }
  };

  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket: WsLike) => {
      wsClients.add(socket);
      socket.on("close", () => wsClients.delete(socket));
    });
  });

  app.get("/", async (_req, reply) => {
    const html = await fs.readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
    reply.header("content-type", "text/html; charset=utf-8");
    return html;
  });

  app.get("/api/manifest", async () => {
    // The UI may be opened before init_project runs; show an empty manifest
    // instead of 500'ing so the user sees the "no canvases yet" empty state.
    if (!(await exists(paths.manifest))) return defaultManifest();
    return readManifest(paths);
  });

  app.get<{ Params: { id: string; locale: string } }>(
    "/preview/:id/:locale",
    async (req, reply) => {
      const manifest = await readManifest(paths);
      const canvas = manifest.canvases.find((c) => c.id === req.params.id);
      if (!canvas) {
        reply.code(404);
        return { error: `Unknown canvas: ${req.params.id}` };
      }
      const locale = req.params.locale;
      if (!manifest.locales.includes(locale)) {
        reply.code(400);
        return { error: `Locale not in manifest: ${locale}` };
      }
      const [html, defStrings, locStrings] = await Promise.all([
        readCanvasHtml(paths, canvas.id),
        readLocale(paths, manifest.defaultLocale),
        locale === manifest.defaultLocale
          ? Promise.resolve({})
          : readLocale(paths, locale),
      ]);
      const strings = { ...defStrings, ...locStrings };
      const composed = composeHtml({
        canvasHtml: html,
        locale,
        strings,
        baseHref: "/project/",
      });
      reply.header("content-type", "text/html; charset=utf-8");
      return composed.html;
    },
  );

  app.post("/api/render-all", async () => {
    const manifest = await readManifest(paths);
    const summary = await renderAll(paths, manifest);
    return { ok: true, ...summary, wrote: summary.written.length };
  });

  const port = opts.port ?? 4747;
  await app.listen({ port, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${port}`;

  let watcher: WatchHandle | undefined;
  if (opts.watch !== false) {
    watcher = startWatcher({ paths, onChange: broadcast });
  }

  return {
    app,
    port,
    url,
    paths,
    broadcast,
    close: async () => {
      if (watcher) await watcher.close();
      for (const sock of wsClients) sock.close();
      wsClients.clear();
      await app.close();
    },
  };
}
