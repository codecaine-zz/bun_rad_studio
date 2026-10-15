// The shortcuts in force on this page: the defaults with the person's changes (Settings → Keyboard shortcuts) on top.
// The key handlers ask here; the Code tab's own table (codeKeys.js) is kept in step.
import { KEYMAP } from "./codeKeys.js";
import { ACTIONS, effectiveKeys, formatShortcut, matchShortcut } from "./shortcuts.js";
import { state } from "./state.js";

let signature = "";
let current = { keys: new Map(), rejected: [] };
const byId = new Map(ACTIONS.map((a) => [a.id, a]));

function refresh() {
  const overrides = state.settings?.shortcuts ?? {};
  const next = `${state.platform}|${JSON.stringify(overrides)}`;
  if (next === signature) return;
  signature = next;
  current = effectiveKeys(overrides, state.platform);
  // The Code tab reads its keys from this table (its menus, palette, help list and key handler).
  for (const a of ACTIONS) if (a.command) KEYMAP[a.command] = [...(current.keys.get(a.id) ?? [])];
}

/** The shortcuts of an action now (["Mod+S"], or [] when it has none). */
export function keysOf(id) {
  refresh();
  return current.keys.get(id) ?? [];
}

/** Changes that were saved but could not be applied (they clash or are invalid): [{ id, spec, reason }]. */
export function rejectedChanges() {
  refresh();
  return current.rejected;
}

/** The first shortcut of an action as the person's computer writes it ("⌘⇧N", "Ctrl+Shift+N"), or "". */
export function labelOf(id) {
  const first = keysOf(id)[0];
  return first ? formatShortcut(first, state.platform) : "";
}

/** " (Ctrl+`)" for the end of a tooltip, or "" when the action has no shortcut. */
export function hintOf(id) {
  const l = labelOf(id);
  return l ? ` (${l})` : "";
}

export const matchesAction = (e, id) => keysOf(id).some((spec) => matchShortcut(e, spec, state.platform));

/** The first of `ids` (default: every action) whose shortcut this key press is, or null. */
export function actionFor(e, ids = ACTIONS.map((a) => a.id)) {
  for (const id of ids) if (matchesAction(e, id)) return id;
  return null;
}

export const actionInfo = (id) => byId.get(id);
