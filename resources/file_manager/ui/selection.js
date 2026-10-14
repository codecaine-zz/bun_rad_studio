// Selection: which items are chosen, which one has the keyboard focus, and how clicks and keys change that.
import { visibleEntries } from "./nav.js";
import { emit, state } from "./state.js";
import { rangeIndexes } from "./util.js";

export function selectedEntries() {
  return visibleEntries().filter((e) => state.selection.has(e.path));
}

export const selectedPaths = () => selectedEntries().map((e) => e.path);

function changed() {
  emit("selection");
}

export function selectOnly(key) {
  state.selection = new Set(key === null ? [] : [key]);
  state.focusKey = key;
  state.anchorKey = key;
  changed();
}

export function toggleKey(key) {
  const next = new Set(state.selection);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  state.selection = next;
  state.focusKey = key;
  state.anchorKey = key;
  changed();
}

/** Shift-click or Shift+arrow: everything from the anchor to `key`. */
export function selectRangeTo(key) {
  const list = visibleEntries();
  const to = list.findIndex((e) => e.path === key);
  let from = list.findIndex((e) => e.path === state.anchorKey);
  if (from < 0) from = to;
  if (to < 0) return;
  state.selection = new Set(rangeIndexes(from, to).map((i) => list[i].path));
  state.focusKey = key;
  changed();
}

export function selectAll() {
  const list = visibleEntries();
  state.selection = new Set(list.map((e) => e.path));
  state.focusKey = list[0]?.path ?? null;
  state.anchorKey = state.focusKey;
  changed();
}

export function clearSelection() {
  if (state.selection.size === 0) return;
  state.selection = new Set();
  changed();
}

export function selectKeys(keys) {
  state.selection = new Set(keys);
  state.focusKey = keys[0] ?? state.focusKey;
  state.anchorKey = state.focusKey;
  changed();
}

/** Moves the keyboard focus to the entry at `index` (and selects it, or extends the selection with `extend`). */
export function focusIndex(index, { extend = false, keepSelection = false } = {}) {
  const list = visibleEntries();
  if (!list.length) return;
  const i = Math.max(0, Math.min(list.length - 1, index));
  const key = list[i].path;
  if (extend) selectRangeTo(key);
  else if (keepSelection) {
    state.focusKey = key;
    changed();
  } else selectOnly(key);
}

export function focusedIndex() {
  return visibleEntries().findIndex((e) => e.path === state.focusKey);
}
