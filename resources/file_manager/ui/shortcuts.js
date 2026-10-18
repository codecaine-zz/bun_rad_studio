// Every keyboard shortcut a person can change, in one table, and the rules that keep them from clashing.
// Pure functions (no page): the Settings dialog, the key handlers, the help list and the server's settings check all use this.
//
// A shortcut is written "Mod+Shift+S": Mod is Command on a Mac and Control elsewhere, Ctrl is Control everywhere, then Alt,
// Shift and a key. A person's changes are saved as `{ [action id]: ["Mod+Alt+T", ...] }`; an action that isn't listed keeps its
// default and an empty list switches it off. A saved change that would clash with another action is never applied.
import { KEYMAP, PUNCT_CODES, formatShortcut, matchShortcut, parseShortcut } from "./codeKeys.js";

export { formatShortcut, matchShortcut, parseShortcut };

/** Where a shortcut works. "global" works everywhere, even while typing, so it may not share keys with anything. */
export const SCOPES = { files: "Files and tools", code: "Code editor", global: "Everywhere" };

// Every action that has a function key (F1, F2, F5, F6) also has keys without one, because many keyboards need Fn held for F-keys.
// "mac:" in front of a default keeps it to Macs and "other:" to Windows and Linux.
const f = (id, group, label, keys) => ({ id, scope: "files", group, label, keys });
const c = (id, label, group = "Code editor") => ({ id: `code.${id}`, command: id, scope: "code", group, label, keys: KEYMAP[id] ? [...KEYMAP[id]] : [] });

/** The actions whose shortcuts can be changed. */
export const ACTIONS = [
  f("nav.back", "Moving around", "Back", ["Alt+ArrowLeft", "mac:Mod+["]),
  f("nav.forward", "Moving around", "Forward", ["Alt+ArrowRight", "mac:Mod+]"]),
  f("nav.up", "Moving around", "Up one folder", ["Alt+ArrowUp", "mac:Mod+ArrowUp", "other:Backspace"]),
  f("nav.address", "Moving around", "Type an address", ["Mod+L", "other:Alt+D"]),
  f("nav.search", "Moving around", "Search in this folder", ["Mod+F"]),
  f("nav.findTool", "Moving around", "Find tool (search inside files)", ["Mod+Shift+F"]),
  f("nav.filterTools", "Moving around", "Filter tools and apps", ["Mod+K"]),
  f("nav.favorites", "Moving around", "Favorites menu", ["Mod+Shift+B"]),
  f("nav.newTab", "Moving around", "New folder tab", ["Mod+T"]),
  f("nav.closeTab", "Moving around", "Close folder tab", ["Mod+Alt+W"]),
  f("nav.refresh", "Moving around", "Refresh", ["F5", "Mod+R"]),
  f("file.rename", "Working with files", "Rename", ["F2", "Mod+Shift+R"]),
  f("file.trash", "Working with files", "Move to the Recycle Bin", ["Delete", "mac:Backspace", "mac:Mod+Backspace"]),
  f("file.deleteForever", "Working with files", "Delete for good", ["Shift+Delete", "mac:Shift+Backspace"]),
  f("file.bury", "Working with files", "Bury in the Graveyard", ["Alt+Delete", "mac:Alt+Backspace"]),
  f("file.copy", "Working with files", "Copy", ["Mod+C"]),
  f("file.cut", "Working with files", "Cut", ["Mod+X"]),
  f("file.paste", "Working with files", "Paste", ["Mod+V"]),
  f("file.duplicate", "Working with files", "Duplicate", ["Mod+D"]),
  f("file.undo", "Working with files", "Undo", ["Mod+Z"]),
  f("file.newFolder", "Working with files", "New folder", ["Mod+Shift+N"]),
  f("file.newFile", "Working with files", "New file", ["Mod+Alt+N"]),
  f("file.newSqlite", "Working with files", "New SQLite database", ["Mod+Shift+D"]),
  f("file.selectAll", "Working with files", "Select all", ["Mod+A"]),
  f("file.editInCode", "Working with files", "Edit in the Code editor", ["Mod+E"]),
  f("file.properties", "Working with files", "Properties", ["Alt+Enter"]),
  f("file.moreInfo", "Working with files", "More info", ["Alt+Shift+Enter"]),
  f("view.hidden", "View", "Show or hide hidden files", ["Mod+Shift+H"]),
  f("view.info", "View", "Show or hide the info panel", ["Mod+I"]),
  f("view.details", "View", "Details view", ["Mod+1"]),
  f("view.list", "View", "List view", ["Mod+2"]),
  f("view.icons", "View", "Icons view", ["Mod+3"]),
  f("app.settings", "Window", "Settings", ["Mod+,"]),
  f("app.help", "Window", "Help", ["F1", "Mod+/"]),
  { id: "dual.copy", scope: "dual", group: "Dual view", label: "Copy to the other side", keys: ["F5", "Mod+Alt+C"] },
  { id: "dual.move", scope: "dual", group: "Dual view", label: "Move to the other side", keys: ["F6", "Mod+Alt+M"] },
  f("app.themes", "Window", "Choose a theme (all themes)", ["Mod+Shift+T"]),
  { id: "app.expandTool", scope: "global", group: "Window", label: "Expand or restore the tool (ultra focus)", keys: ["F11", "Mod+F11", "Ctrl+F11", "Mod+Shift+U"] },
  { id: "terminal.toggle", scope: "global", group: "Window", label: "Show or hide the terminal", keys: ["Ctrl+`"] },
  { id: "terminal.here", scope: "global", group: "Window", label: "Open the terminal in the selected folder (or this one)", keys: ["Mod+Alt+T"] },
  { id: "terminal.paste", scope: "global", group: "Window", label: "Paste into the terminal", keys: ["Mod+Alt+V"] },
  c("undo", "Undo"), c("redo", "Redo"), c("save", "Save"), c("saveAs", "Save as…"), c("saveAll", "Save all"), c("newFile", "New file"), c("closeTab", "Close the tab"),
  c("quickOpen", "Go to file…"), c("palette", "Command palette"), c("find", "Find"), c("replace", "Replace"), c("findNext", "Find next"), c("findPrev", "Find previous"),
  c("goToLine", "Go to line…"), c("goToSymbol", "Go to symbol…"), c("complete", "Show suggestions"), c("findInFiles", "Find in files"),
  c("toggleComment", "Comment or uncomment lines"), c("blockComment", "Block comment"), c("indent", "Indent"), c("outdent", "Outdent"),
  c("moveUp", "Move line up"), c("moveDown", "Move line down"), c("duplicate", "Duplicate line"), c("duplicateUp", "Duplicate line up"),
  c("deleteLine", "Delete line"), c("joinLines", "Join lines"), c("selectLine", "Select line"), c("wrap", "Wrap long lines"), c("zen", "Zen mode"),
  c("explorer", "Show or hide the file tree"), c("zoomIn", "Bigger text"), c("zoomOut", "Smaller text"), c("zoomReset", "Normal text size"),
  c("bookmarkToggle", "Add or remove a bookmark"), c("bookmarkNext", "Next bookmark"), c("bookmarkPrev", "Previous bookmark"),
  c("run", "Run this file"), c("build", "Build this file"), c("preview", "Show the preview"), c("shortcuts", "Show the keyboard shortcuts"),
];

/** Keys that always do what they do and can't be given to something else (shown in the list, locked). */
export const FIXED = [
  { scope: "files", group: "Fixed keys", label: "Open the item", keys: ["Enter"] },
  { scope: "files", group: "Fixed keys", label: "Quick Look", keys: ["Space"] },
  { scope: "files", group: "Fixed keys", label: "Pick or unpick the item", keys: ["Mod+Space"] },
  { scope: "files", group: "Fixed keys", label: "Move through the list", keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"] },
  { scope: "files", group: "Fixed keys", label: "Close a search, a menu or a window; clear the choice", keys: ["Escape"] },
  { scope: "files", group: "Fixed keys", label: "Right-click menu", keys: ["ContextMenu", "Shift+F10", "Mod+Shift+M"] },
  { scope: "files", group: "Fixed keys", label: "Close the window", keys: ["Mod+W", "Mod+Q"] },
  { scope: "files", group: "Fixed keys", label: "Help", keys: ["?"] },
  { scope: "global", group: "Fixed keys", label: "Switch the window view (Files, Home, Tools, Split, Dual), Focus, the list of places, and Ultra Focus", keys: ["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8"] },
  { scope: "global", group: "Fixed keys", label: "Cycle through all themes (Right Option/Alt)", keys: ["Alt+[", "Alt+]"] },
  { scope: "global", group: "Fixed keys", label: "Copy the section you are in", keys: ["Alt+Shift+C"] },
  { scope: "code", group: "Fixed keys", label: "Leave zen mode, close the suggestion list or the find bar", keys: ["Escape"] },
  { scope: "code", group: "Fixed keys", label: "Cut, copy, paste and select all in the text", keys: ["Mod+C", "Mod+X", "Mod+V", "Mod+A"] },
  { scope: "code", group: "Fixed keys", label: "Indent and move between controls", keys: ["Tab", "Shift+Tab"] },
];

/** Combinations the computer itself keeps for something else. */
const SYSTEM = {
  darwin: ["Mod+Tab", "Mod+Space", "Mod+Alt+Escape", "Mod+M"],
  other: ["Alt+F4", "Alt+Tab", "Mod+Alt+Delete", "Mod+Shift+Escape"],
};

const specIsMac = (spec) => spec.startsWith("mac:");
const specIsOther = (spec) => spec.startsWith("other:");
export const specWithoutPlatform = (spec) => spec.replace(/^(mac|other):/, "");

let backspaceDeletes = true;

/**
 * For a Mac keyboard on Windows or Linux (a virtual machine, say): its Delete key sends Backspace. With this on (the default),
 * Backspace moves to the Recycle Bin (Shift+Backspace deletes for good, Alt+Backspace buries in the Graveyard) instead of going
 * up a folder. Turning it off makes Backspace go up one folder on Windows and Linux. Macs are not affected.
 */
export function setBackspaceDeletes(on) {
  backspaceDeletes = on !== false;
}

/** The default shortcuts of an action on a platform. */
export function defaultsFor(action, platform) {
  const mac = platform === "darwin";
  let keys = action.keys.filter((k) => (specIsMac(k) ? mac : specIsOther(k) ? !mac : true)).map(specWithoutPlatform);
  if (backspaceDeletes && !mac) {
    if (action.id === "nav.up") keys = keys.filter((k) => k !== "Backspace");
    else if (action.id === "file.trash") keys = [...keys, "Backspace"];
    else if (action.id === "file.deleteForever") keys = [...keys, "Shift+Backspace"];
    else if (action.id === "file.bury") keys = [...keys, "Alt+Backspace"];
  }
  return keys;
}

/** A shortcut as plain text for comparing: Mod and Ctrl are the same key on Windows and Linux; ? and + count as shifted keys. */
export function canonical(spec, platform) {
  const s = parseShortcut(spec);
  const mac = platform === "darwin";
  let key = s.key;
  let shift = s.shift;
  if (key === "+") { key = "="; shift = true; }
  if (key === "?") { key = "/"; shift = true; }
  const ctrl = mac ? s.ctrl : s.ctrl || s.mod;
  const meta = mac ? s.mod : false;
  return `${ctrl ? "ctrl+" : ""}${meta ? "meta+" : ""}${s.alt ? "alt+" : ""}${shift ? "shift+" : ""}${key}`;
}

const NAMED_KEYS = new Set(["Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space", "ContextMenu"]);
const KEY_OK = (key) => key.length === 1 || NAMED_KEYS.has(key) || /^F([1-9]|1\d|2[0-4])$/.test(key);

/** Is this text a shortcut this program understands? */
export function isValidSpec(spec) {
  if (typeof spec !== "string" || spec.length > 30 || /\s/.test(spec)) return false;
  const parts = spec.endsWith("++") ? [...spec.slice(0, -2).split("+"), "+"] : spec.split("+");
  const key = parts.pop();
  if (!key || !KEY_OK(key)) return false;
  const seen = new Set();
  for (const p of parts) {
    if (!["Mod", "Ctrl", "Alt", "Shift"].includes(p) || seen.has(p)) return false;
    seen.add(p);
  }
  return /^[ -~]*$/.test(spec);
}

/** Why a shortcut can't be used by an action at all (typing, system keys), or null. */
function forbidden(spec, action, platform) {
  const s = parseShortcut(spec);
  const mac = platform === "darwin";
  const modifier = (mac ? s.mod || s.ctrl : s.mod || s.ctrl) || s.alt;
  const printable = s.key.length === 1 || s.key === "Space";
  if (printable && !modifier) return "A plain letter, digit or symbol is for typing. Hold Ctrl, Cmd or Alt as well.";
  if (["Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(s.key) && !modifier) return "That key is needed for moving and typing. Add Ctrl, Cmd or Alt.";
  if (action.scope === "code" && ["Backspace", "Delete"].includes(s.key) && !modifier) return "That key edits the text. Add Ctrl, Cmd or Alt.";
  if (s.key === "Tab" && s.shift && !modifier) return "Shift+Tab moves between controls.";
  const canon = canonical(spec, platform);
  for (const reserved of SYSTEM[mac ? "darwin" : "other"]) if (canonical(reserved, platform) === canon) return "Your computer keeps this one for itself.";
  return null;
}

const scopesOverlap = (a, b) => a === b || a === "global" || b === "global";

const allFixed = (platform) => FIXED.flatMap((x) => x.keys.map((k) => ({ ...x, spec: k, canon: canonical(k, platform) })));

/**
 * Can `action` use `spec`, given everyone else's shortcuts (`keys`: Map of action id -> specs)? Returns null when it can,
 * or `{ reason, other? }` where `other` is the action it would clash with.
 */
export function checkAssign(action, spec, keys, platform) {
  if (!isValidSpec(spec)) return { reason: "That isn't a key combination this program can use." };
  const why = forbidden(spec, action, platform);
  if (why) return { reason: why };
  const canon = canonical(spec, platform);
  for (const other of allFixed(platform)) {
    if (other.canon === canon && scopesOverlap(action.scope, other.scope)) return { reason: `${formatShortcut(spec, platform)} is a fixed key for “${other.label}”.`, other };
  }
  for (const other of ACTIONS) {
    if (other.id === action.id || !scopesOverlap(action.scope, other.scope)) continue;
    if ((keys.get(other.id) ?? []).some((k) => canonical(k, platform) === canon)) return { reason: `${formatShortcut(spec, platform)} is already used for “${other.label}”. Change that one first, or choose other keys.`, other };
  }
  return null;
}

/**
 * The shortcuts in force: the defaults with a person's changes on top. A change that is not valid or would clash is left out
 * and listed in `rejected`. Returns { keys: Map(id -> specs), rejected: [{ id, spec, reason }] }.
 */
export function effectiveKeys(overrides, platform) {
  const keys = new Map(ACTIONS.map((a) => [a.id, defaultsFor(a, platform)]));
  const rejected = [];
  const changed = ACTIONS.filter((a) => overrides && Object.prototype.hasOwnProperty.call(overrides, a.id) && Array.isArray(overrides[a.id]));
  // Clear the changed actions first so they can swap keys with each other, then add the new keys one by one.
  for (const a of changed) keys.set(a.id, []);
  for (const a of changed) {
    const mine = [];
    for (const spec of overrides[a.id].slice(0, 3)) {
      const problem = checkAssign(a, spec, new Map([...keys, [a.id, mine]]), platform);
      if (problem) rejected.push({ id: a.id, spec, reason: problem.reason });
      else mine.push(spec);
    }
    keys.set(a.id, mine);
  }
  // An action whose change was refused entirely goes back to its defaults, when they are free.
  for (const a of changed) {
    if (overrides[a.id].length && !keys.get(a.id).length) {
      const back = [];
      for (const spec of defaultsFor(a, platform)) if (!checkAssign(a, spec, new Map([...keys, [a.id, back]]), platform)) back.push(spec);
      keys.set(a.id, back);
    }
  }
  return { keys, rejected };
}

/** Cleans saved changes: unknown actions, invalid text and clashes are dropped; changes equal to the defaults are not kept. */
export function sanitizeOverrides(raw, platform) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const known = new Map(ACTIONS.map((a) => [a.id, a]));
  const clean = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!known.has(id) || !Array.isArray(value)) continue;
    const list = [];
    for (const spec of value.slice(0, 3)) {
      if (!isValidSpec(spec)) continue;
      const key = canonical(spec, platform);
      if (!list.some((x) => canonical(x, platform) === key)) list.push(spec);
    }
    // Only a list that is empty on purpose means "switched off"; a list of nothing but junk is ignored.
    if (list.length === 0 && value.length > 0) continue;
    clean[id] = list;
  }
  const { keys } = effectiveKeys(clean, platform);
  for (const [id, list] of Object.entries(clean)) {
    const applied = keys.get(id) ?? [];
    const defaults = defaultsFor(known.get(id), platform);
    const same = applied.length === defaults.length && applied.every((k, i) => canonical(k, platform) === canonical(defaults[i], platform));
    // An empty list means "switched off"; keep it only when that is what is applied.
    if (same && !(list.length === 0 && defaults.length === 0)) continue;
    if (list.length === 0 || applied.length) out[id] = applied;
  }
  return out;
}

/** Turns a key press into a shortcut, or null for a modifier key on its own. `platform` decides what Control and Command mean. */
export function specFromEvent(e, platform) {
  const mac = platform === "darwin";
  if (["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "OS"].includes(e.key)) return null;
  const mods = [];
  if (mac) {
    if (e.metaKey) mods.push("Mod");
    if (e.ctrlKey) mods.push("Ctrl");
  } else {
    if (e.metaKey) return { error: "The Windows or Super key can't be used here." };
    if (e.ctrlKey) mods.push("Mod");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  let key = e.key;
  if (key === "Dead" || key === "Unidentified") return { error: "That key can't be used." };
  const letter = /^Key([A-Z])$/.exec(e.code ?? "");
  const digit = /^Digit(\d)$/.exec(e.code ?? "");
  const punct = Object.entries(PUNCT_CODES).find(([, code]) => code === e.code);
  if (letter) key = letter[1];
  else if (digit) key = digit[1];
  else if (punct) key = punct[0];
  else if (key === " ") key = "Space";
  else if (key.length === 1) key = /[a-z]/i.test(key) ? key.toUpperCase() : key;
  if (key === "Dead" || key === "Unidentified") return { error: "That key can't be used." };
  if (!KEY_OK(key)) return { error: "That key can't be used." };
  const spec = [...mods, key].join("+");
  return isValidSpec(spec) ? { spec } : { error: "That key can't be used." };
}
