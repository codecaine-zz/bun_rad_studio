// Moving around and loading data: folders, back/forward, the Recycle Bin, search, and the sorted list that is shown.
import { ApiError, call } from "./api.js";
import { debounce } from "./dom.js";
import { toast } from "./menus.js";
import { activePane, hooks, isFolderView, left, right } from "./pane.js";
import { emit, inTrash, state } from "./state.js";
import { archiveExtensionOf, extensionOf, formatSize, parentOf, parseByteSizeToken, plural, sortEntries } from "./util.js";

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

/**
 * Splits a quick-filter query into tokens while preserving quoted phrases (`"my report"`).
 */
function tokenizeQuickFilter(query) {
  const out = [];
  const re = /(-?"[^"]+"|!?"[^"]+"|\S+)/g;
  for (const m of String(query || "").trim().matchAll(re)) {
    const raw = m[1].replace(/"/g, "");
    if (raw) out.push(raw);
  }
  return out;
}

function compareNumericOp(actual, op, target) {
  if (op === ">") return actual > target;
  if (op === ">=") return actual >= target;
  if (op === "<") return actual < target;
  if (op === "<=") return actual <= target;
  return actual === target;
}

function matchSingleQuickToken(entry, rawTok, tags, now) {
  const tok = rawTok.toLowerCase();
  const name = String(entry.name || "").toLowerCase();
  const label = String(entry.label || "").toLowerCase();

  // Type & state predicates: is:dir, is:file, is:hidden, is:link, is:empty, is:archive
  if (tok.startsWith("is:")) {
    const val = tok.slice(3);
    if (val === "dir" || val === "folder" || val === "folders") return !!entry.isDir;
    if (val === "file" || val === "files") return !entry.isDir;
    if (val === "hidden") return !!entry.hidden || name.startsWith(".");
    if (val === "link" || val === "symlink") return !!entry.isSymlink;
    if (val === "broken") return !!entry.broken;
    if (val === "empty") {
      if (!entry.isDir) return entry.size === 0;
      return Boolean(entry.folderSizeCalculated && entry.size === 0 && (entry.folderFiles ?? 0) === 0);
    }
    if (val === "archive" || val === "code" || val === "image" || val === "media" || val === "data" || val === "document" || val === "docs") {
      return entryMatchesKindFilter(entry, val);
    }
  }

  // Kind / category predicate: kind:code, type:image
  if (tok.startsWith("kind:") || tok.startsWith("type:")) {
    const val = tok.slice(5);
    if (!val) return true;
    if (["folder", "folders", "image", "images", "media", "document", "docs", "code", "archive", "archives", "data"].includes(val)) {
      return entryMatchesKindFilter(entry, val);
    }
    return label.includes(val) || String(entry.kind || "").toLowerCase().includes(val);
  }

  // Extension predicate: ext:ts or ext:ts,js,json
  if (tok.startsWith("ext:")) {
    if (entry.isDir) return false;
    const allowed = tok.slice(4).split(",").map((x) => x.replace(/^\./, "").trim()).filter(Boolean);
    if (allowed.length === 0) return true;
    const ext = extensionOf(entry.name || "");
    const archExt = archiveExtensionOf(entry.name || "");
    return allowed.includes(ext) || allowed.includes(archExt);
  }

  // Color tag predicate: tag:red, tag:any, tag:none
  if (tok.startsWith("tag:")) {
    const val = tok.slice(4).trim();
    const entryTag = (tags && entry.path ? tags[entry.path] : "") || "";
    if (val === "any" || val === "*") return Boolean(entryTag);
    if (val === "none" || val === "untagged") return !entryTag;
    return entryTag.toLowerCase() === val;
  }

  // Size predicate: size:>1mb, size:<=10kb, size:empty, or bare >10mb / <500kb
  const sizeMatch = /^(?:size:)?(>=|<=|>|<|=)?(\d+(?:\.\d+)?\s*(?:b|bytes?|k|kb|m|mb|g|gb|t|tb)|empty|0)$/.exec(tok);
  if (sizeMatch && (tok.startsWith("size:") || sizeMatch[1])) {
    if (entry.isDir && !entry.folderSizeCalculated) return false;
    const op = sizeMatch[1] || "=";
    const target = parseByteSizeToken(sizeMatch[2]);
    if (target !== null) return compareNumericOp(Number(entry.size || 0), op, target);
  }

  // Date / age predicate: date:today, modified:yesterday, date:week, age:<2d, modified:7d
  if (tok.startsWith("date:") || tok.startsWith("modified:") || tok.startsWith("age:")) {
    const val = tok.slice(tok.indexOf(":") + 1).trim();
    const mtime = Number(entry.mtimeMs || 0);
    if (!mtime) return false;
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    if (val === "today") return mtime >= todayMs;
    if (val === "yesterday") return mtime >= todayMs - 86_400_000 && mtime < todayMs;
    if (val === "week" || val === "7d") return now - mtime <= 7 * 86_400_000;
    if (val === "month" || val === "30d") return now - mtime <= 30 * 86_400_000;
    if (val === "year" || val === "365d") return now - mtime <= 365 * 86_400_000;
    const ageMatch = /^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)(m|min|h|hr|d|day|w|wk|y|yr)s?$/.exec(val);
    if (ageMatch) {
      const op = ageMatch[1] || "<=";
      const n = Number(ageMatch[2]);
      const u = ageMatch[3];
      const ms = u.startsWith("m") ? n * 60_000
        : u.startsWith("h") ? n * 3_600_000
        : u.startsWith("w") ? n * 7 * 86_400_000
        : u.startsWith("y") ? n * 365 * 86_400_000
        : n * 86_400_000;
      return compareNumericOp(now - mtime, op, ms);
    }
  }

  // Glob / wildcard token: *.ts, report?.pdf, *test*
  if (tok.includes("*") || tok.includes("?")) {
    const pattern = "^" + tok.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    try {
      return new RegExp(pattern, "i").test(entry.name || "");
    } catch {
      return name.includes(tok);
    }
  }

  // Plain substring match on filename or kind label
  return name.includes(tok) || label.includes(tok);
}

/**
 * Evaluates whether `entry` matches a Quick-Filter query string.
 * Supports plain substrings, multi-word AND tokens, negation (`-node_modules`, `!*.log`),
 * wildcards (`*.ts`), `ext:ts,js`, `size:>1mb`, `date:today`, `is:dir`, `is:file`, `tag:red`, and `kind:code`.
 */
export function entryMatchesQuickFilter(entry, query, tags = state.settings?.tags, now = Date.now()) {
  if (!query || !String(query).trim()) return true;
  const tokens = tokenizeQuickFilter(query);
  if (tokens.length === 0) return true;
  for (const raw of tokens) {
    if ((raw.startsWith("-") || raw.startsWith("!")) && raw.length > 1) {
      if (matchSingleQuickToken(entry, raw.slice(1), tags, now)) return false;
    } else if (!matchSingleQuickToken(entry, raw, tags, now)) {
      return false;
    }
  }
  return true;
}

const folderSizeCache = new Map();

/** Applies any previously calculated folder sizes from this session's cache when listing a folder. */
export function applyCachedFolderSizes(entries) {
  if (!Array.isArray(entries)) return;
  for (const e of entries) {
    if (!e || !e.isDir) continue;
    const cached = folderSizeCache.get(`${e.path}:${e.mtimeMs}`);
    if (cached) {
      e.size = cached.bytes;
      e.folderSizeCalculated = true;
      e.folderFiles = cached.files;
      e.folderFolders = cached.folders;
      e.folderSizePartial = cached.partial;
    }
  }
}

/**
 * Calculates total sizes on demand for folders in `pane` (or a specific list of folder paths)
 * and updates the file list and sorting immediately.
 */
export async function calculateFolderSizes(pane = activePane(), specificPaths = null) {
  const source = pane.search ? pane.search.entries : pane.entries;
  const folders = Array.isArray(specificPaths) && specificPaths.length
    ? source.filter((e) => e.isDir && specificPaths.includes(e.path))
    : source.filter((e) => e.isDir);
  if (folders.length === 0) {
    toast("No folders in this view to measure.", { kind: "info" });
    return { count: 0, totalBytes: 0 };
  }
  return busy(async () => {
    try {
      const paths = folders.map((f) => f.path);
      const res = await call("foldersizes", { paths });
      const sizes = res.sizes || {};
      let count = 0;
      let totalBytes = 0;
      const updateList = (list) => {
        if (!Array.isArray(list)) return;
        for (const e of list) {
          if (!e.isDir) continue;
          const st = sizes[e.path];
          if (st) {
            e.size = st.bytes;
            e.folderSizeCalculated = true;
            e.folderFiles = st.files;
            e.folderFolders = st.folders;
            e.folderSizePartial = st.partial;
            folderSizeCache.set(`${e.path}:${e.mtimeMs}`, st);
          }
        }
      };
      updateList(pane.entries);
      if (pane.search?.entries) updateList(pane.search.entries);
      if (pane !== left) updateList(left.entries);
      if (pane !== right) updateList(right.entries);
      for (const f of folders) {
        const st = sizes[f.path];
        if (st) {
          count++;
          totalBytes += st.bytes;
        }
      }
      visibleCache.delete(pane);
      visibleCache.delete(left);
      visibleCache.delete(right);
      emit("view");
      emit("selection");
      toast(`Calculated sizes for ${plural(count, "folder")} (${formatSize(totalBytes)} total)`, { kind: "ok" });
      return { count, totalBytes, sizes };
    } catch (err) {
      reportLoadError(err);
      return { count: 0, totalBytes: 0, sizes: {} };
    }
  });
}

const visibleCache = new WeakMap();

/** What a list shows (the left one unless a pane is given), sorted by the person's choice. Search results replace the folder while searching. */
export function visibleEntries(pane = left) {
  const { sortBy, sortDir, foldersFirst } = state.settings;
  const isTrash = pane.location.kind === "trash";
  const sourceList = isTrash ? pane.trashItems : (pane.search ? pane.search.entries : pane.entries);
  const tagFilter = !isTrash && state.tagFilter && state.settings?.tags ? state.tagFilter : "";
  const tagVal = tagFilter && sourceList?.length ? sourceList.map((e) => state.settings.tags[e.path] || "").join("|") : "";
  const kindFilter = !isTrash && pane.side !== "right" ? (state.kindFilter || "all") : "all";
  const quickFilter = !isTrash && pane.side !== "right" ? (state.quickFilter || "").trim().toLowerCase() : "";

  const prev = visibleCache.get(pane);
  if (
    prev &&
    prev.sourceList === sourceList &&
    prev.sourceLen === (sourceList ? sourceList.length : 0) &&
    prev.isTrash === isTrash &&
    prev.sortBy === sortBy &&
    prev.sortDir === sortDir &&
    prev.foldersFirst === foldersFirst &&
    prev.tagFilter === tagFilter &&
    prev.tagVal === tagVal &&
    prev.kindFilter === kindFilter &&
    prev.quickFilter === quickFilter
  ) {
    return prev.result;
  }

  let result;
  if (isTrash) {
    result = sortEntries(pane.trashItems, { by: sortBy === "type" ? "name" : sortBy, dir: sortDir, foldersFirst });
  } else {
    let raw = sourceList;
    if (tagFilter) {
      raw = raw.filter((e) => state.settings.tags[e.path] === tagFilter);
    }
    if (pane.side !== "right") {
      if (kindFilter && kindFilter !== "all") {
        raw = raw.filter((e) => entryMatchesKindFilter(e, kindFilter));
      }
      if (quickFilter) {
        raw = raw.filter((e) => entryMatchesQuickFilter(e, quickFilter, state.settings?.tags));
      }
    }
    result = sortEntries(raw, { by: sortBy, dir: sortDir, foldersFirst });
  }

  visibleCache.set(pane, {
    sourceList,
    sourceLen: sourceList ? sourceList.length : 0,
    isTrash,
    sortBy,
    sortDir,
    foldersFirst,
    tagFilter,
    tagVal,
    kindFilter,
    quickFilter,
    result,
  });
  return result;
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
      applyCachedFolderSizes(res.entries);
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
