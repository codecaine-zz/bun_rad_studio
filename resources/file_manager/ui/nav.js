// Moving around and loading data: folders, back/forward, the Recycle Bin, search, and the sorted list that is shown.
import { ApiError, call } from "./api.js";
import { debounce } from "./dom.js";
import { toast } from "./menus.js";
import { activePane, hooks, isFolderView, left, right } from "./pane.js";
import { emit, inTrash, state } from "./state.js";
import { parentOf, sortEntries } from "./util.js";

function setBusy(on) {
  state.busy = Math.max(0, state.busy + (on ? 1 : -1));
  document.body.classList.toggle("busy", state.busy > 0);
  emit("busy", state.busy > 0);
}

/** Runs `fn` with the "Working…" indicator on. */
export async function busy(fn) {
  setBusy(true);
  try {
    return await fn();
  } finally {
    setBusy(false);
  }
}

const saveLastPath = debounce((path) => {
  if (typeof document !== "undefined") saveSettings({ lastPath: path }).catch(() => {});
}, 600);
let settingsSave = Promise.resolve();
let settingsRevision = 0;

/** Saves a change to the remembered settings (and updates the page right away). */
export async function saveSettings(change) {
  const revision = ++settingsRevision;
  const set = { ...change };
  const persist = async () => {
    const res = await call("settings", { set });
    if (revision === settingsRevision) state.settings = res.settings;
    return res.settings;
  };
  // Order writes, and never let an older reply replace a newer optimistic change.
  const saved = settingsSave.then(persist, persist);
  settingsSave = saved;
  Object.assign(state.settings, change);
  emit("settings", change);
  return saved;
}

/** Loads the sidebar data: places, drives, Recycle Bin count and settings. */
export async function loadPlaces() {
  const res = await call("places");
  state.places = res.places;
  state.drives = res.drives;
  state.trashCount = res.trash.count;
  state.home = res.home;
  state.cliUtilsDir = res.cliUtilsDir || "";
  state.cliAppsDir = res.cliAppsDir || "";
  state.fmName = res.fileManagerName;
  state.sep = res.separator;
  state.settings = res.settings;
  emit("places");
  emit("settings", {});
  return res;
}

export async function refreshTrashCount() {
  try {
    state.trashCount = (await call("trash/list")).count;
    emit("places");
  } catch {
    // the count is only a hint
  }
}

/** Classifies whether an entry matches a Quick-Chip kind filter ("all" | "folder" | "folders" | "image" | "images" | "media" | "document" | "docs" | "code" | "archive" | "archives" | "data"). */
export function entryMatchesKindFilter(entry, kind) {
  if (!kind || kind === "all") return true;
  if (kind === "folder" || kind === "folders") return !!entry.isDir;
  if (entry.isDir) return false;
  const k = String(entry.kind || entry.category || "").toLowerCase();
  const n = String(entry.name || "").toLowerCase();
  const dot = n.lastIndexOf(".");
  const ext = dot > 0 ? n.slice(dot + 1) : String(entry.ext || "").replace(/^\./, "").toLowerCase();
  if (kind === "image" || kind === "images") return k === "image" || /^(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?|heic)$/.test(ext);
  if (kind === "media") return k === "audio" || k === "video" || /^(mp3|wav|ogg|flac|m4a|aac|opus|mp4|mkv|webm|mov|avi|m3u8?)$/.test(ext);
  if (kind === "document" || kind === "docs") return k === "pdf" || k === "document" || /^(pdf|md|txt|rtf|doc|docx|odt|pages|epub|tex)$/.test(ext);
  if (kind === "code") return k === "code" || /^(ts|tsx|js|jsx|mjs|cjs|py|rs|go|c|cpp|h|hpp|java|kt|swift|rb|php|sh|zsh|bash|html?|css|scss|less|vue|svelte|astro|sql|lua|zig|toml|ya?ml)$/.test(ext) || /^(dockerfile|makefile|justfile|\.gitignore|\.env.*)$/.test(n);
  if (kind === "archive" || kind === "archives") return k === "archive" || /^(zip|tar|gz|tgz|bz2|xz|7z|rar|zst|radenc)$/.test(ext);
  if (kind === "data") return /^(json|jsonl|csv|tsv|parquet|sqlite|sqlite3|db|ddb|duckdb|xml|ini|conf|env|lock)$/.test(ext);
  return true;
}

/** What a list shows (the left one unless a pane is given), sorted by the person's choice. Search results replace the folder while searching. */
export function visibleEntries(pane = left) {
  const { sortBy, sortDir, foldersFirst } = state.settings;
  if (pane.location.kind === "trash") return sortEntries(pane.trashItems, { by: sortBy === "type" ? "name" : sortBy, dir: sortDir, foldersFirst });
  let raw = pane.search ? pane.search.entries : pane.entries;
  if (state.tagFilter && state.settings?.tags) {
    raw = raw.filter((e) => state.settings.tags[e.path] === state.tagFilter);
  }
  if (pane.side !== "right") {
    if (state.kindFilter && state.kindFilter !== "all") {
      raw = raw.filter((e) => entryMatchesKindFilter(e, state.kindFilter));
    }
    if (state.quickFilter) {
      const q = state.quickFilter.trim().toLowerCase();
      if (q) raw = raw.filter((e) => (e.name || "").toLowerCase().includes(q) || (e.label || "").toLowerCase().includes(q));
    }
  }
  return sortEntries(raw, { by: sortBy, dir: sortDir, foldersFirst });
}

function keyOf(entry) {
  return entry.path;
}

/**
 * Each navigation gets a number. If another one starts while this one is waiting for the server, the older answer
 * is dropped, so a quick double-click or Back-then-Up can never leave the list showing a different folder than
 * the address bar says.
 */
let navigation = 0;

function pushHistory(from) {
  const last = state.history.at(-1);
  if (JSON.stringify(last) !== JSON.stringify(from)) state.history.push(from);
  if (state.history.length > 100) state.history.shift();
  state.future = [];
}

function resetSelection(keys = []) {
  state.selection = new Set(keys);
  state.focusKey = keys[0] ?? null;
  state.anchorKey = keys[0] ?? null;
}

/**
 * Opens a folder. `select` names an item to select afterwards. Resolves true when it worked.
 * An error (no permission, gone) is explained and leaves you where you were.
 */
export async function goTo(path, { push = true, select = null } = {}) {
  const mine = ++navigation;
  return busy(async () => {
    try {
      const res = await call("list", { path, showHidden: state.settings.showHidden });
      if (mine !== navigation) return false; // a newer navigation took over
      const here = state.location;
      const moved = !(here.kind === "folder" && here.path === res.path);
      if (push && moved && (here.kind === "trash" || here.path)) pushHistory(here);
      if (moved) {
        state.quickFilter = "";
        state.kindFilter = "all";
      }
      state.location = { kind: "folder", path: res.path };
      state.entries = res.entries;
      state.total = res.total;
      state.truncated = res.truncated;
      state.trashItems = [];
      state.search = null;
      state.shown = 0;
      resetSelection(select ? [select] : []);
      emit("view");
      emit("selection");
      saveLastPath(res.path);
      return true;
    } catch (err) {
      if (mine === navigation) reportLoadError(err);
      return false;
    }
  });
}

export function reportLoadError(err) {
  toast(err instanceof ApiError ? err.message : "That couldn't be opened.", { kind: "error" });
}

/** Opens the Recycle Bin. */
export async function showTrash({ push = true } = {}) {
  const mine = ++navigation;
  return busy(async () => {
    try {
      const res = await call("trash/list");
      if (mine !== navigation) return false;
      if (push && !(state.location.kind === "trash")) pushHistory(state.location);
      state.quickFilter = "";
      state.kindFilter = "all";
      state.location = { kind: "trash" };
      state.trashItems = res.items.map((r) => ({
        path: r.id, id: r.id, name: r.name, isDir: r.isDir, size: r.size ?? 0, mtimeMs: Date.parse(r.deletedAt) || 0,
        originalPath: r.originalPath, where: parentOf(r.originalPath, state.sep) ?? r.originalPath, label: r.isDir ? "Folder" : "File", icon: "", hidden: false,
      }));
      state.entries = [];
      state.total = res.count;
      state.truncated = false;
      state.search = null;
      state.shown = 0;
      state.trashCount = res.count;
      resetSelection();
      emit("view");
      emit("selection");
      emit("places");
      return true;
    } catch (err) {
      reportLoadError(err);
      return false;
    }
  });
}

/**
 * Reloads what is shown, keeping the selection where the items still exist. It reloads the active pane; in the Dual
 * view the other pane is reloaded too, because what was done in one folder often shows in the other.
 */
export async function refresh({ keepSelection = true, pane = activePane() } = {}) {
  if (pane.side === "right") {
    await hooks.loadRight?.(right.location.path, { keep: keepSelection });
    if (isFolderView(left)) await refreshLeft(true);
    return;
  }
  await refreshLeft(keepSelection);
}

async function refreshLeft(keepSelection) {
  const keep = keepSelection ? [...state.selection] : [];
  if (inTrash()) {
    await showTrash({ push: false });
    resetSelection(keep.filter((k) => state.trashItems.some((i) => i.path === k)));
    emit("selection");
    return;
  }
  if (state.search) {
    await runSearch(state.search.query, { keepSelection: true });
    return;
  }
  const path = state.location.path;
  if (await goTo(path, { push: false })) {
    const present = new Set(state.entries.map(keyOf));
    resetSelection(keep.filter((k) => present.has(k)));
    emit("selection");
  }
}

/** Opens a folder in a pane: the left list goes through the normal navigation (with Back and Forward), the right one loads it. */
export function goToIn(pane, path, options = {}) {
  return pane.side === "right" ? (hooks.loadRight ? hooks.loadRight(path, options) : false) : goTo(path, options);
}

/** Up one level in the given pane. */
export async function goUpIn(pane) {
  if (pane.side === "left") return goUp();
  const parent = parentOf(right.location.path, state.sep);
  if (parent) await goToIn(right, parent, { select: right.location.path });
}

export const canGoUpIn = (pane) => (pane.side === "left" ? canGoUp() || inTrash() : !!parentOf(pane.location.path ?? "", state.sep));

export async function goBack() {
  const target = state.history.pop();
  if (!target) return;
  state.future.push(state.location);
  await openLocation(target);
}

export async function goForward() {
  const target = state.future.pop();
  if (!target) return;
  state.history.push(state.location);
  await openLocation(target);
}

async function openLocation(loc) {
  const ok = loc.kind === "trash" ? await showTrash({ push: false }) : await goTo(loc.path, { push: false });
  if (!ok) emit("view");
}

/** Up one level, selecting the folder we came out of. */
export async function goUp() {
  if (inTrash()) return goTo(state.home || state.sep);
  const here = state.location.path;
  const parent = parentOf(here, state.sep);
  if (parent) await goTo(parent, { select: here });
}

export const canGoUp = () => !inTrash() && !!parentOf(state.location.path ?? "", state.sep);

// ---------------------------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------------------------

export async function runSearch(query, { keepSelection = false } = {}) {
  const text = query.trim();
  if (!text) return clearSearch();
  if (inTrash()) return false;
  const mine = ++navigation;
  return busy(async () => {
    try {
      const root = state.search?.root ?? state.location.path;
      const res = await call("search", { path: root, query: text, showHidden: state.settings.showHidden });
      if (mine !== navigation) return false;
      state.search = { query: text, root, entries: res.entries, truncated: res.truncated, skipped: res.skipped };
      state.shown = 0;
      if (!keepSelection) resetSelection();
      emit("view");
      emit("selection");
      return true;
    } catch (err) {
      reportLoadError(err);
      return false;
    }
  });
}

export function clearSearch() {
  navigation++; // a search still running is no longer wanted
  if (!state.search) return false;
  state.search = null;
  state.shown = 0;
  resetSelection();
  emit("view");
  emit("selection");
  return true;
}
