// Quick-open shortcuts for databases: one click opens a saved connection (or an SQLite file) as its own desktop window or
// in the web browser, whichever the person chose in Settings. Nothing here reads a password: the server does that when the
// studio starts. The shortcuts are listed on the Home page and in the Databases tool.
import { ApiError, call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { db, errorText, loadOverview, summaryOf } from "./dbState.js";
import { registerHomeTileProvider } from "./home.js";
import { toast } from "./menus.js";
import { emit, state } from "./state.js";

const MAX_SHORTCUTS = 8;
const REFRESH_MS = 10_000;
/** What the server last said (plain connections, no secrets). */
let shortcuts = [];
let loadedAt = 0;
let loading = false;

export const shortcutMode = () => (state.settings.dbShortcut === "browser" ? "browser" : "window");

/** Forgets everything (for tests that start the page more than once in one process). */
export function resetShortcuts() {
  shortcuts = [];
  loadedAt = 0;
  loading = false;
}

export async function loadShortcuts() {
  if (loading) return;
  loading = true;
  try {
    const r = await call("db/shortcuts");
    shortcuts = r.shortcuts;
    loadedAt = Date.now();
    emit("db-shortcuts");
  } catch {
    // the tiles simply stay as they were
  } finally {
    loading = false;
  }
}

/** Favorites first, then the most recently used, then by name. */
export function listShortcuts() {
  const time = (p) => Date.parse(p.lastUsedAt ?? "") || 0;
  return [...shortcuts].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || time(b) - time(a) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).slice(0, MAX_SHORTCUTS);
}

const askBefore = (name, err) => confirmBox({
  title: err.details?.reason === "production" ? "This is a production connection" : "This connection is marked read-only",
  message: err.message || `"${name}" needs your OK before it opens.`,
  confirmLabel: "Open anyway",
  danger: true,
});

/**
 * Opens `target` (`{ profileId }` or `{ engine: "sqlite", path }`) in its own window, or in the web browser.
 * `mode` defaults to the person's setting. Returns true when it was opened.
 */
export async function openTarget(target, { name = "The database", mode = shortcutMode(), confirmed = false } = {}) {
  const sure = confirmed ? { confirmWrites: true } : {};
  try {
    if (mode === "browser") {
      const r = await call("db/studio/start", { ...target, ...sure });
      await call("db/studio/browser", { id: r.studio.id });
      toast(`${name} is opening in your web browser.`, { kind: "info" });
      if (db.loaded) loadOverview().catch(() => {});
    } else {
      await call("db/studio/window", { ...target, ...sure });
      toast(`${name} is opening in its own window.`, { kind: "info" });
    }
    loadedAt = 0;
    loadShortcuts();
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === "NEEDS_CONFIRM" && !confirmed) {
      if (!(await askBefore(name, err))) return false;
      return openTarget(target, { name, mode, confirmed: true });
    }
    toast(errorText(err, mode === "browser" ? "The studio couldn't be opened in your browser." : "The window couldn't be opened."), { kind: "error" });
    return false;
  }
}

export const openShortcut = (profile, mode) => openTarget({ profileId: profile.id }, { name: profile.name, mode });

const modeWords = (mode) => (mode === "browser" ? "your web browser" : "its own window");

/** Home page tiles: one per saved connection. They read the list the server gave, and ask for a fresh one now and then. */
function tiles() {
  if (typeof document !== "undefined" && !loading && Date.now() - loadedAt > REFRESH_MS) loadShortcuts();
  const mode = shortcutMode();
  return listShortcuts().map((p, i) => ({
    id: `db-shortcut-${p.id}`,
    order: 50 + i / 10,
    icon: p.icon ?? "🗄️",
    title: p.name,
    text: `${p.label}, ${summaryOf(p)}. Opens in ${modeWords(mode)}${p.environment === "production" ? ". Production: it asks first" : ""}.`,
    cta: mode === "browser" ? "Open in browser →" : "Open window →",
    enabled: () => p.studioAvailable !== false,
    why: `${p.studioName} isn't part of this copy of the program.`,
    run: () => openShortcut(p),
  }));
}

registerHomeTileProvider(tiles);
