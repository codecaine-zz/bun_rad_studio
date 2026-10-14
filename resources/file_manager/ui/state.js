// The one shared state of the page, and a tiny event bus. Modules change `state` and call emit(); other modules
// listen with on(). Events: "view" (what is listed changed), "selection", "places", "settings", "clipboard",
// "busy", "undo".
import { platform } from "./api.js";

export const state = {
  platform,
  sep: platform === "win32" ? "\\" : "/",
  home: "",
  fmName: "your file manager",
  /** Sidebar data from the server. */
  places: [],
  drives: [],
  trashCount: 0,
  settings: {
    favorites: [], recents: [], view: "details", sortBy: "name", sortDir: "asc", foldersFirst: true,
    showHidden: false, showInfoPanel: false, theme: "auto", textSize: 100, lastPath: "", seenWelcome: false,
  },

  /** Where we are: { kind: "folder", path } or { kind: "trash" }. */
  location: { kind: "folder", path: "" },
  entries: [],
  total: 0,
  truncated: false,
  /** Recycle Bin contents when location is the bin. */
  trashItems: [],
  /** Search results, or null. { query, root, entries, truncated, skipped } */
  search: null,
  loading: false,

  /** Selected keys: paths for folders and search results, ids in the Recycle Bin. */
  selection: new Set(),
  focusKey: null,
  anchorKey: null,
  /** Number of rows shown so far (large folders are shown in pages). */
  shown: 0,

  clipboard: null, // { mode: "copy" | "cut", paths: [] }
  history: [],
  future: [],
  undoStack: [],
  busy: 0,
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, detail) {
  for (const fn of listeners.get(event) ?? []) {
    try {
      fn(detail);
    } catch (err) {
      console.error(`Listener for "${event}" failed`, err);
    }
  }
}

export const inTrash = () => state.location.kind === "trash";
export const currentPath = () => (state.location.kind === "folder" ? state.location.path : "");
