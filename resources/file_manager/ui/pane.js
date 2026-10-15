// Panes. The page always has one file list (the left one, whose data lives in `state`); the Dual view adds a second
// list on the right. A pane is the small bundle one list needs: where it is, what it holds, what is selected.
// The list drawing, the selection, the keys, the context menu and the file operations all take a pane, and when
// none is named they use the "active" one: the pane the person last clicked or focused. Outside the Dual view that
// is always the left one, so the page behaves exactly as it did before there were panes.
import { emit, state } from "./state.js";

const FIELDS = ["location", "entries", "total", "selection", "focusKey", "anchorKey", "shown", "search", "trashItems"];

/** The left pane is the page's own state, seen through the same shape as the right one. */
export const left = { side: "left", ids: { list: "list", wrap: "list-wrap", head: "list-head", empty: "empty", status: "status-left", row: "row" } };
for (const key of FIELDS) Object.defineProperty(left, key, { get: () => state[key], set: (value) => { state[key] = value; }, enumerable: true });

/** The right pane. It only ever shows a folder (no Recycle Bin, no search results). */
export const right = {
  side: "right", ids: { list: "dual-list", wrap: "dual-wrap", head: "dual-list-head", empty: "dual-empty", status: "dual-status", row: "dual-row" },
  location: { kind: "folder", path: "" }, entries: [], total: 0, selection: new Set(), focusKey: null, anchorKey: null, shown: 0, search: null, trashItems: [],
};

/** The right pane's own loader, set by dual.js: `load(path, { keep, select })` resolves true when the folder opened. */
export const hooks = { loadRight: null };

let activeSide = "left";

export const paneOf = (side) => (side === "right" ? right : left);

/**
 * The pane that keys, the toolbar and the file operations act on. It is the right one only while the Dual view is
 * showing and its list is really on the page.
 */
export const activePane = () => (activeSide === "right" && state.workspace === "dual" && typeof document !== "undefined" && document.getElementById(right.ids.list) ? right : left);

export function setActivePane(side) {
  const next = side === "right" ? "right" : "left";
  if (next === activeSide) return;
  activeSide = next;
  emit("pane", next);
}

export const sideNow = () => activeSide;

export const inTrash = (pane = activePane()) => pane.location.kind === "trash";
/** The folder a pane shows, or "" in the Recycle Bin. */
export const currentPath = (pane = activePane()) => (pane.location.kind === "folder" ? pane.location.path : "");
/** True when the pane shows a real folder (not the Recycle Bin and not search results): new items can go there. */
export const isFolderView = (pane = activePane()) => pane.location.kind === "folder" && !pane.search;
