/**
 * Live mode: the server watches the search folder and counts changes; the page asks for the count every few
 * seconds and searches again when it grew. At most MAX_WATCHERS run at once, an unused one stops by itself, and
 * all of them end when the server stops.
 */
import { randomBytes } from "crypto";
import * as fs from "fs";
import { absolutePath, assertFolder, type FmContext } from "./fmCore";
import { FmError, describeFsError } from "./fmPaths";
import { MAX_WATCHERS, WATCH_IDLE_MS } from "./fmFindShared";
import { findState, type LiveWatcher } from "./fmFindRun";

/** Changes in version-control and package folders (and, unless asked for, hidden files) aren't worth a new search. */
export function isNoise(filename: string, includeHidden: boolean): boolean {
  const parts = filename.split(/[\\/]+/).filter(Boolean);
  if (parts.some((s) => s === ".git" || s === "node_modules")) return true;
  const last = parts[parts.length - 1] ?? "";
  if (last.endsWith("~") || /^\.fm-(rename|bulk|find)-/.test(last)) return true;
  return !includeHidden && parts.some((s) => s.startsWith("."));
}

function stopWatcher(ctx: FmContext, id: string): boolean {
  const state = findState(ctx);
  const w = state.watchers.get(id);
  if (!w) return false;
  clearTimeout(w.idle);
  try { w.watcher.close(); } catch {}
  state.watchers.delete(id);
  return true;
}

function armIdle(ctx: FmContext, w: LiveWatcher, idleMs: number): void {
  clearTimeout(w.idle);
  w.idle = setTimeout(() => stopWatcher(ctx, w.id), idleMs);
  (w.idle as { unref?: () => void }).unref?.();
}

export async function startWatch(ctx: FmContext, b: Record<string, any>, idleMs = WATCH_IDLE_MS): Promise<{ watchId: string; root: string }> {
  const root = absolutePath(ctx, b.root);
  await assertFolder(root, "The folder to watch");
  const state = findState(ctx);
  if (state.watchers.size >= MAX_WATCHERS) {
    throw new FmError("TOO_MANY_WATCHERS", `Only ${MAX_WATCHERS} folders can be watched at once. Turn off live mode somewhere else first.`);
  }
  const id = randomBytes(6).toString("hex");
  const hidden = b.hidden === true;
  let fsWatcher: fs.FSWatcher;
  try {
    fsWatcher = fs.watch(root, { recursive: true });
  } catch (err) {
    throw new FmError("WATCH_FAILED", `Live mode couldn't start: ${describeFsError(err, "watch that folder").message}`);
  }
  const w: LiveWatcher = { id, root, hidden, changes: 0, lastName: "", failed: null, watcher: fsWatcher, idle: setTimeout(() => {}, 0) };
  fsWatcher.on("change", (_event, name) => {
    const filename = typeof name === "string" ? name : name ? name.toString() : "";
    if (filename && isNoise(filename, hidden)) return;
    w.changes++;
    w.lastName = filename;
  });
  fsWatcher.on("error", (err) => {
    w.failed = describeFsError(err, "watch that folder").message;
  });
  state.watchers.set(id, w);
  armIdle(ctx, w, idleMs);
  return { watchId: id, root };
}

export function pollWatch(ctx: FmContext, b: Record<string, any>, idleMs = WATCH_IDLE_MS): { active: boolean; changes: number; lastName: string; error: string | null } {
  const w = typeof b.watchId === "string" ? findState(ctx).watchers.get(b.watchId) : undefined;
  if (!w) return { active: false, changes: 0, lastName: "", error: "Live mode has stopped. Turn it on again." };
  armIdle(ctx, w, idleMs);
  return { active: w.failed === null, changes: w.changes, lastName: w.lastName, error: w.failed };
}

export function stopWatch(ctx: FmContext, b: Record<string, any>): { stopped: boolean } {
  return { stopped: typeof b.watchId === "string" && stopWatcher(ctx, b.watchId) };
}
