// Selection: which items are chosen, which one has the keyboard focus, and how clicks and keys change that.
// Every function takes the pane it is about (the left list or the Dual view's right one); without one it uses the active pane.
import { entryMatchesQuickFilter, visibleEntries } from "./nav.js";
import { activePane } from "./pane.js";
import { emit, state } from "./state.js";
import { extensionOf, rangeIndexes } from "./util.js";

export function selectedEntries(pane = activePane()) {
  return visibleEntries(pane).filter((e) => pane.selection.has(e.path));
}

export const selectedPaths = (pane = activePane()) => selectedEntries(pane).map((e) => e.path);

function changed() {
  emit("selection");
}

export function selectOnly(key, pane = activePane()) {
  pane.selection = new Set(key === null ? [] : [key]);
  pane.focusKey = key;
  pane.anchorKey = key;
  changed();
}

export function toggleKey(key, pane = activePane()) {
  const next = new Set(pane.selection);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  pane.selection = next;
  pane.focusKey = key;
  pane.anchorKey = key;
  changed();
}

/** Shift-click or Shift+arrow: everything from the anchor to `key`. */
export function selectRangeTo(key, pane = activePane()) {
  const list = visibleEntries(pane);
  const to = list.findIndex((e) => e.path === key);
  let from = list.findIndex((e) => e.path === pane.anchorKey);
  if (from < 0) from = to;
  if (to < 0) return;
  pane.selection = new Set(rangeIndexes(from, to).map((i) => list[i].path));
  pane.focusKey = key;
  changed();
}

export function selectAll(pane = activePane()) {
  const list = visibleEntries(pane);
  pane.selection = new Set(list.map((e) => e.path));
  pane.focusKey = list[0]?.path ?? null;
  pane.anchorKey = pane.focusKey;
  changed();
}

export function clearSelection(pane = activePane()) {
  if (pane.selection.size === 0) return;
  pane.selection = new Set();
  changed();
}

export function invertSelection(pane = activePane()) {
  const list = visibleEntries(pane);
  const next = new Set(list.filter((e) => !pane.selection.has(e.path)).map((e) => e.path));
  pane.selection = next;
  if (next.size && !next.has(pane.focusKey)) pane.focusKey = [...next][0];
  pane.anchorKey = pane.focusKey;
  changed();
}

export function selectKeys(keys, pane = activePane()) {
  pane.selection = new Set(keys);
  pane.focusKey = keys[0] ?? pane.focusKey;
  pane.anchorKey = pane.focusKey;
  changed();
}

/** Moves the keyboard focus to the entry at `index` (and selects it, or extends the selection with `extend`). */
export function focusIndex(index, { extend = false, keepSelection = false, pane = activePane() } = {}) {
  const list = visibleEntries(pane);
  if (!list.length) return;
  const i = Math.max(0, Math.min(list.length - 1, index));
  const key = list[i].path;
  if (extend) selectRangeTo(key, pane);
  else if (keepSelection) {
    pane.focusKey = key;
    changed();
  } else selectOnly(key, pane);
}

export function focusedIndex(pane = activePane()) {
  return visibleEntries(pane).findIndex((e) => e.path === pane.focusKey);
}

/**
 * Matches entries in `pane` against a pattern (glob `*.ts`, quick-filter query `size:>1mb ext:json`, or `/regex/i`).
 */
export function matchEntriesByPattern(entries, pattern) {
  const q = String(pattern || "").trim();
  if (!q) return [];
  const rxMatch = /^\/(.+)\/([gimsuy]*)$/.exec(q);
  if (rxMatch) {
    try {
      const rx = new RegExp(rxMatch[1], rxMatch[2] || "i");
      return entries.filter((e) => rx.test(e.name || ""));
    } catch {
      return [];
    }
  }
  return entries.filter((e) => entryMatchesQuickFilter(e, q, state.settings?.tags));
}

/**
 * Selects or deselects items in `pane` matching `pattern`.
 * `mode`: "replace" (default) | "add" | "deselect"
 */
export function selectByPattern(pattern, { mode = "replace", pane = activePane() } = {}) {
  const list = visibleEntries(pane);
  const matched = matchEntriesByPattern(list, pattern);
  const matchedKeys = matched.map((e) => e.path);
  let next;
  if (mode === "add") {
    next = new Set([...pane.selection, ...matchedKeys]);
  } else if (mode === "deselect") {
    next = new Set([...pane.selection].filter((k) => !matchedKeys.includes(k)));
  } else {
    next = new Set(matchedKeys);
  }
  pane.selection = next;
  if (next.size && !next.has(pane.focusKey)) pane.focusKey = [...next][0];
  pane.anchorKey = pane.focusKey;
  changed();
  return { matched: matched.length, selected: next.size, total: list.length };
}

/**
 * Selects all items in `pane` that share the same file extension (or folder kind) as the current selection / focused item.
 */
export function selectSameKindOrExt(pane = activePane()) {
  const list = visibleEntries(pane);
  let seeds = selectedEntries(pane);
  if (seeds.length === 0 && pane.focusKey) {
    const focused = list.find((e) => e.path === pane.focusKey);
    if (focused) seeds = [focused];
  }
  if (seeds.length === 0) return { matched: 0, label: "" };
  const wantDirs = seeds.some((e) => e.isDir);
  const wantExts = new Set(seeds.filter((e) => !e.isDir).map((e) => extensionOf(e.name || "")));
  const matched = list.filter((e) => {
    if (e.isDir) return wantDirs;
    return wantExts.has(extensionOf(e.name || ""));
  });
  pane.selection = new Set(matched.map((e) => e.path));
  if (matched.length && !pane.selection.has(pane.focusKey)) pane.focusKey = matched[0].path;
  pane.anchorKey = pane.focusKey;
  changed();
  const labelParts = [];
  if (wantDirs) labelParts.push("folders");
  for (const ext of wantExts) labelParts.push(ext ? `.${ext} files` : "files without extension");
  return { matched: matched.length, label: labelParts.join(" & ") };
}
