import chokidar, { type FSWatcher } from "chokidar";
import type { ProjectPaths } from "../project/paths.js";

export type ReloadEvent = {
  type: "reload";
  /** What changed; for now the client just refetches manifest + iframes either way. */
  kind: "manifest" | "stylesheet" | "canvas" | "locale";
  path: string;
};

export interface WatchHandle {
  close: () => Promise<void>;
}

export interface StartWatcherOptions {
  paths: ProjectPaths;
  onChange: (event: ReloadEvent) => void;
  /** Debounce window in ms. Defaults to 150. */
  debounceMs?: number;
}

export function startWatcher(opts: StartWatcherOptions): WatchHandle {
  const debounceMs = opts.debounceMs ?? 150;
  const watcher: FSWatcher = chokidar.watch(
    [
      opts.paths.manifest,
      opts.paths.stylesheet,
      opts.paths.canvasesDir,
      opts.paths.localesDir,
    ],
    {
      ignoreInitial: true,
      ignored: /(^|[/\\])\../, // skip dotfiles (incl. atomic-write tempfiles)
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
    },
  );

  const pending = new Map<string, NodeJS.Timeout>();

  const fire = (path: string) => {
    const existing = pending.get(path);
    if (existing) clearTimeout(existing);
    pending.set(
      path,
      setTimeout(() => {
        pending.delete(path);
        opts.onChange({ type: "reload", kind: classify(path, opts.paths), path });
      }, debounceMs),
    );
  };

  watcher.on("add", fire);
  watcher.on("change", fire);
  watcher.on("unlink", fire);

  return {
    close: async () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      await watcher.close();
    },
  };
}

function classify(p: string, paths: ProjectPaths): ReloadEvent["kind"] {
  if (p === paths.manifest) return "manifest";
  if (p === paths.stylesheet) return "stylesheet";
  if (p.startsWith(paths.canvasesDir)) return "canvas";
  if (p.startsWith(paths.localesDir)) return "locale";
  return "manifest";
}
