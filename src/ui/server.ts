import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
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
import type { ProjectState } from "../project/state.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export interface UiServerOptions {
  state: ProjectState;
  port?: number;
  /** Disable filesystem watching + WS hot-reload (used in tests that don't need it). */
  watch?: boolean;
}

export interface UiServerHandle {
  app: FastifyInstance;
  port: number;
  url: string;
  state: ProjectState;
  /** Force-broadcast a reload event to all connected WS clients (for tests). */
  broadcast: (event: ReloadEvent) => void;
  close: () => Promise<void>;
}

export async function startUiServer(opts: UiServerOptions): Promise<UiServerHandle> {
  const state = opts.state;
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: "/ui/",
    decorateReply: false,
  });

  // --- WS client registry & broadcast --------------------------------------

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

  // --- Routes --------------------------------------------------------------

  app.get("/", async (_req, reply) => {
    const html = await fs.readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
    reply.header("content-type", "text/html; charset=utf-8");
    return html;
  });

  app.get("/api/manifest", async () => {
    const paths = projectPaths(state.root);
    if (!(await exists(paths.manifest))) return defaultManifest();
    return readManifest(paths);
  });

  app.get("/api/project-root", async () => {
    return { root: state.root };
  });

  app.get<{ Params: { id: string; locale: string } }>(
    "/preview/:id/:locale",
    async (req, reply) => {
      const paths = projectPaths(state.root);
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

  // Dynamic /project/* — serves files from the currently active project root.
  // Replaces a static fastify-static registration so the root can change at
  // runtime via set_active_project.
  app.get<{ Params: { "*": string } }>("/project/*", async (req, reply) => {
    const rel = decodeURIComponent(req.params["*"] ?? "");
    const root = path.resolve(state.root);
    const target = path.resolve(root, rel);
    // Prevent directory traversal out of the project root.
    if (target !== root && !target.startsWith(root + path.sep)) {
      reply.code(403);
      return "forbidden";
    }
    if (!(await exists(target))) {
      reply.code(404);
      return "not found";
    }
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      reply.code(404);
      return "not a file";
    }
    const ext = path.extname(target).toLowerCase();
    reply.header("content-type", MIME_TYPES[ext] ?? "application/octet-stream");
    return createReadStream(target);
  });

  app.post("/api/render-all", async () => {
    const paths = projectPaths(state.root);
    const manifest = await readManifest(paths);
    const summary = await renderAll(paths, manifest);
    return { ok: true, ...summary, wrote: summary.written.length };
  });

  // --- Watcher with hot-restart on project switch --------------------------

  let watcher: WatchHandle | undefined;
  const restartWatcher = (paths: ProjectPaths): void => {
    if (watcher) {
      // close() is async but we don't need to await — chokidar handles inflight events
      // and a fresh watcher will pick up the new tree on its own.
      watcher.close().catch(() => undefined);
    }
    if (opts.watch === false) {
      watcher = undefined;
      return;
    }
    watcher = startWatcher({ paths, onChange: broadcast });
  };
  restartWatcher(projectPaths(state.root));

  const unsubscribe = state.subscribe((root) => {
    restartWatcher(projectPaths(root));
    // Tell every connected UI client to refetch — the entire grid changes.
    broadcast({ type: "reload", kind: "manifest", path: root });
  });

  // --- Listen --------------------------------------------------------------

  const port = opts.port ?? 4747;
  await app.listen({ port, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${port}`;

  return {
    app,
    port,
    url,
    state,
    broadcast,
    close: async () => {
      unsubscribe();
      if (watcher) await watcher.close();
      for (const sock of wsClients) sock.close();
      wsClients.clear();
      await app.close();
    },
  };
}
