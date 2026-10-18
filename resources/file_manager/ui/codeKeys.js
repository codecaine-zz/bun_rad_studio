// Keyboard shortcuts of the Code tab: the table of keys, matching a key press against it, and showing a shortcut
// the way the person's computer writes it (⌘⇧S on a Mac, Ctrl+Shift+S elsewhere). No page code in here.

/** command id -> shortcuts ("Mod" is Command on a Mac and Control elsewhere). */
export const KEYMAP = {
  undo: ["Mod+Z"],
  redo: ["Mod+Shift+Z", "Mod+Y"],
  save: ["Mod+S"],
  saveAs: ["Mod+Shift+S"],
  saveAll: ["Mod+Alt+S"],
  newFile: ["Alt+N"],
  closeTab: ["Alt+W"],
  quickOpen: ["Mod+P"],
  palette: ["Mod+Shift+P"],
  find: ["Mod+F"],
  replace: ["Mod+H", "Mod+Alt+F"],
  findNext: ["F3", "Mod+Alt+G"],
  findPrev: ["Shift+F3", "Mod+Alt+Shift+G"],
  goToLine: ["Mod+G"],
  goToSymbol: ["Mod+Shift+O"],
  complete: ["Alt+/"],
  findInFiles: ["Mod+Shift+F"],
  toggleComment: ["Mod+/"],
  blockComment: ["Alt+Shift+A"],
  indent: ["Mod+]"],
  outdent: ["Mod+["],
  moveUp: ["Alt+ArrowUp"],
  moveDown: ["Alt+ArrowDown"],
  duplicate: ["Mod+D", "Shift+Alt+ArrowDown"],
  duplicateUp: ["Shift+Alt+ArrowUp"],
  format: ["Alt+Shift+F"],
  deleteLine: ["Mod+Shift+K"],
  joinLines: ["Mod+J"],
  selectLine: ["Mod+L"],
  wrap: ["Alt+Z"],
  zen: ["Mod+Alt+Z"],
  explorer: ["Mod+\\"],
  zoomIn: ["Mod+=", "Mod++"],
  zoomOut: ["Mod+-"],
  zoomReset: ["Mod+0"],
  bookmarkToggle: ["Mod+F2", "Mod+Alt+B"],
  bookmarkNext: ["F2", "Mod+Alt+]"],
  bookmarkPrev: ["Shift+F2", "Mod+Alt+["],
  run: ["Mod+Enter"],
  build: ["Mod+B"],
  preview: ["Mod+Shift+V"],
  shortcuts: ["F1", "Mod+Alt+H"],
  expandSelection: ["Alt+Shift+ArrowRight"],
  goToBracket: ["Mod+Shift+\\"],
  nextOccurrence: ["Mod+Alt+N"],
  prevOccurrence: ["Mod+Alt+P"],
  renameSymbol: ["Mod+Shift+R"],
  toggleValue: ["Alt+T"],
  toggleQuotes: ["Alt+'"],
  wrapTag: ["Alt+Shift+W"],
  evalMath: ["Mod+Shift+E"],
  inspectToken: ["Alt+I"],
  insertSnippet: ["Alt+S"],
  insertGenerated: ["Alt+G"],
  minimap: ["Alt+M"],
  diffSaved: ["Mod+Alt+D"],
};

/** Keys that are named by where they are, not by what they type (a shifted ` or = types something else, and layouts differ). */
export const PUNCT_CODES = { "`": "Backquote", "-": "Minus", "=": "Equal", "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash", ";": "Semicolon", "'": "Quote", ",": "Comma", ".": "Period", "/": "Slash" };

const NAMED = new Set(["Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space"]);

/** "Mod+Shift+S" -> { mod, ctrl, shift, alt, key } (key in lower case; named keys keep their name). `Ctrl` is the Control key on every system. */
export function parseShortcut(spec) {
  const out = { mod: false, ctrl: false, shift: false, alt: false, key: "" };
  const parts = spec.endsWith("++") ? [...spec.slice(0, -2).split("+"), "+"] : spec.split("+");
  for (const p of parts) {
    if (p === "Mod") out.mod = true;
    else if (p === "Ctrl") out.ctrl = true;
    else if (p === "Shift") out.shift = true;
    else if (p === "Alt") out.alt = true;
    else out.key = NAMED.has(p) || /^F\d{1,2}$/.test(p) ? p : p.toLowerCase();
  }
  return out;
}

const parsed = new Map();
const parse = (spec) => parsed.get(spec) ?? (parsed.set(spec, parseShortcut(spec)), parsed.get(spec));

/** The physical key name for a letter or digit (used when Alt is held, because Alt changes what the key types on a Mac). */
const codeOf = (key) => (/^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : "");

/** Does this key press (a KeyboardEvent-like object) match `spec` on `platform` ("darwin" or other)? */
export function matchShortcut(e, spec, platform) {
  const s = parse(spec);
  const mac = platform === "darwin";
  // Mod is Command on a Mac and Control elsewhere; Ctrl is Control everywhere. The Windows/Super key is never used.
  const wantCtrl = mac ? s.ctrl : s.ctrl || s.mod;
  const wantMeta = mac ? s.mod : false;
  if (!!e.ctrlKey !== wantCtrl || !!e.metaKey !== wantMeta) return false;
  if (e.altKey !== s.alt) return false;
  const shiftedSymbol = s.key === "+" || s.key === "?";
  if (!shiftedSymbol && e.shiftKey !== s.shift) return false;
  if (s.alt && codeOf(s.key)) return e.code === codeOf(s.key);
  if (PUNCT_CODES[s.key] && e.code === PUNCT_CODES[s.key]) return true;
  const cp = typeof e.key === "string" && e.key.length === 1 ? e.key.charCodeAt(0) : 0;
  const macFn = cp >= 0xf704 && cp <= 0xf71b ? `F${cp - 0xf703}` : "";
  const pressed = macFn || (e.key === " " ? "Space" : typeof e.key === "string" && e.key.length === 1 ? e.key.toLowerCase() : e.key);
  return pressed === s.key || (/^F\d{1,2}$/.test(s.key) && (e.code === s.key || (s.key === "F11" && e.keyCode === 122)));
}

/** The command id a key press stands for, or null. */
export function commandForEvent(e, platform, keymap = KEYMAP) {
  for (const [id, specs] of Object.entries(keymap)) if (specs.some((spec) => matchShortcut(e, spec, platform))) return id;
  return null;
}

const MAC_NAMES = { Mod: "⌘", Ctrl: "⌃", Shift: "⇧", Alt: "⌥", Enter: "↩", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "⎋", Backspace: "⌫", Delete: "⌦", Tab: "⇥" };
const WIN_NAMES = { Mod: "Ctrl", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Escape: "Esc" };

/** A shortcut for display: "⌘⇧S" on a Mac, "Ctrl+Shift+S" elsewhere. */
export function formatShortcut(spec, platform) {
  const s = parse(spec);
  const mods = [s.ctrl && "Ctrl", s.mod && "Mod", s.alt && "Alt", s.shift && "Shift"].filter(Boolean);
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key;
  if (platform === "darwin") return [...mods.map((m) => MAC_NAMES[m]), MAC_NAMES[key] ?? key].join("");
  return [...mods.map((m) => WIN_NAMES[m] ?? m), WIN_NAMES[key] ?? key].join("+");
}

/** The first shortcut of a command, formatted, or "". */
export const shortcutText = (id, platform, keymap = KEYMAP) => (keymap[id]?.[0] ? formatShortcut(keymap[id][0], platform) : "");
