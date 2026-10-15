// Selection: which items are chosen, which one has the keyboard focus, and how clicks and keys change that.
// Every function takes the pane it is about (the left list or the Dual view's right one); without one it uses the active pane.
import { visibleEntries } from "./nav.js";
import { activePane } from "./pane.js";
import { emit } from "./state.js";
import { rangeIndexes } from "./util.js";

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
