// What the Find tool is showing right now (the search results, the sort and filter, the selection) and a tiny
// event bus so its parts (form, table, inspector, actions) can react without knowing about each other.
// Events: "results" (a new search arrived), "view" (sort or filter changed), "selection", "scope".
import { filterItems, sortItems } from "./findCore.js";

export const fs = {
  /** Answer of find/meta: presets, sort keys, limits, whether permissions exist (not on Windows). */
  meta: { presets: [], presetNone: "Presets…", sortKeys: ["Default order"], limits: { defaultMaxResults: 1500, maxResultsCap: 20000, maxPaths: 5000 }, posix: true, exportFormats: [] },
  resultId: null,
  root: "",
  /** Everything the last search found, and what is shown (sorted and filtered). */
  items: [],
  view: [],
  filter: "",
  sort: "Default order",
  selected: new Set(),
  /** "all" = every shown result, "selected" = only the ones picked. */
  scope: "all",
  /** The last search's numbers, for the status line. */
  stats: null,
  /** Set by the Find tab once it is open: lets a saved project read and restore the search settings. */
  readForm: null,
  applyForm: null,
};

const listeners = new Map();

export function onFind(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

export function emitFind(event, detail) {
  for (const fn of listeners.get(event) ?? []) {
    try {
      fn(detail);
    } catch (err) {
      console.error(`Find listener for "${event}" failed`, err);
    }
  }
}

export function setResults(res) {
  fs.resultId = res.resultId;
  fs.root = res.root;
  fs.items = res.items;
  fs.stats = { scanned: res.totalScanned, matches: res.matchedCount, ms: res.durationMs, bytes: res.totalSizeBytes, truncated: res.truncated, fallback: res.patternFallback };
  const still = new Set(res.items.map((i) => i.path));
  fs.selected = new Set([...fs.selected].filter((p) => still.has(p)));
  recompute();
  emitFind("results");
  emitFind("selection");
}

export function clearResults() {
  fs.resultId = null;
  fs.items = [];
  fs.view = [];
  fs.stats = null;
  fs.selected = new Set();
  emitFind("results");
  emitFind("selection");
}

function recompute() {
  fs.view = sortItems(filterItems(fs.items, fs.filter), fs.sort);
}

export function setViewOptions({ filter, sort }) {
  if (filter !== undefined) fs.filter = filter;
  if (sort !== undefined) fs.sort = sort;
  recompute();
  const shown = new Set(fs.view.map((i) => i.path));
  fs.selected = new Set([...fs.selected].filter((p) => shown.has(p)));
  emitFind("view");
  emitFind("selection");
}

export function setSelection(paths) {
  fs.selected = new Set(paths);
  emitFind("selection");
}

export const selectedItems = () => fs.view.filter((i) => fs.selected.has(i.path));

export function setScope(scope) {
  fs.scope = scope === "selected" ? "selected" : "all";
  emitFind("scope");
}

/** The items the actions work on, as the scope says. */
export const scopeItems = () => (fs.scope === "selected" ? selectedItems() : fs.view);

/**
 * The part of a request that says which items: the picked paths, or the whole search result with the same filter
 * and sort the page shows (plus how many that is, so the server can refuse if the lists ever differ).
 */
export function targetBody() {
  if (fs.scope === "selected") {
    const picked = selectedItems();
    return { paths: picked.map((i) => i.path), resultId: fs.resultId };
  }
  return { resultId: fs.resultId, filter: fs.filter, sort: fs.sort, expectedCount: fs.view.length };
}
