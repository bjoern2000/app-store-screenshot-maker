/**
 * Mutable, in-process state for "which project root is currently active".
 *
 * One instance is created at server startup and shared between the MCP layer
 * (handlers read from it) and the UI server (file watcher repoints, WS
 * broadcasts on change). Tools like `set_active_project` and `init_project`
 * update the root; subscribers react.
 */
export class ProjectState {
  private _root: string;
  private subscribers = new Set<(root: string) => void>();

  constructor(initialRoot: string) {
    this._root = initialRoot;
  }

  get root(): string {
    return this._root;
  }

  setRoot(root: string): void {
    if (root === this._root) return;
    this._root = root;
    for (const cb of this.subscribers) {
      try {
        cb(root);
      } catch {
        // A bad subscriber should not block other subscribers.
      }
    }
  }

  subscribe(cb: (root: string) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}
