// The Dual view's second pane. It is a second copy of the normal file list, not a lighter one: it has its own folder,
// breadcrumbs, selection and column headings, and it is drawn, selected, renamed, dragged, sorted, jumped through by
// typing and right-clicked by the same code as the left list (list.js, selection.js, contextmenu.js, ops.js, keys.js).
// Both lists follow the same View, sort and hidden-files settings, and the keys, the toolbar and the menus act on the
// active pane (pane.js). What this file adds is the folder loading for the right pane, its address bar, F5 / F6
// (copy or move to the other pane) and the buttons under it.
// Not shared: the search box, Back and Forward, the Recycle Bin view and the Details panel belong to the left list.
import { ApiError, call } from "./api.js";
import { attachDropTarget } from "./dnd.js";
import { actionFor } from "./keymap.js";
import { $, clear, h } from "./dom.js";
import { isRenaming, makeListHead, renderList, syncSelection, wirePane } from "./list.js";
import { menuIsOpen, toast } from "./menus.js";
import { goUpIn, saveSettings } from "./nav.js";
import { transferInto, trashSelection } from "./ops.js";
import { hooks, isFolderView, left, paneOf, right, setActivePane, sideNow } from "./pane.js";
import { selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";
import { collapseCrumbs, parentOf, splitPath } from "./util.js";

let built = false;
let loadNumber = 0;
let loading = 0;
let refreshTimer = 0;

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");
const byId = (id) => document.getElementById(id);
const leftFolder = () => (isFolderView(left) ? left.location.path : "");
/** "left" (the normal file list) or "right" (this pane): which one F5, F6 and the keys act on. */
export const dualActivePane = () => sideNow();

function applyActive() {
  const app = $("#app");
  if (app) app.dataset.dualActive = sideNow();
}

// ---------------------------------------------------------------------------------------------------------------
// Loading and drawing
// ---------------------------------------------------------------------------------------------------------------

/**
 * Opens `path` in the right pane. Resolves true when it worked; a problem is explained and leaves the old folder.
 * `keep` keeps the selection (for a refresh of the same folder); `select` selects one item after opening.
 */
export async function loadRight(path, { keep = false, select = null } = {}) {
  const mine = ++loadNumber;
  loading++;
  try {
    const res = await call("list", { path, showHidden: state.settings.showHidden });
    if (mine !== loadNumber) return false;
    const moved = res.path !== right.location.path;
    right.location = { kind: "folder", path: res.path };
    right.entries = res.entries;
    right.total = res.total;
    right.search = null;
    if (select) right.selection = new Set([select]);
    else if (keep && !moved) right.selection = new Set([...right.selection].filter((k) => res.entries.some((e) => e.path === k)));
    else right.selection = new Set();
    if (select) right.focusKey = select;
    else if (!right.selection.has(right.focusKey)) right.focusKey = null;
    right.anchorKey = select ?? null;
    if (moved || !keep) right.shown = 0;
    if (moved && state.settings.dualPath !== res.path) saveSettings({ dualPath: res.path }).catch(() => {});
    drawRight();
    return true;
  } catch (err) {
    if (mine === loadNumber) toast(err instanceof ApiError ? err.message : "That folder couldn't be opened.", { kind: "error" });
    return false;
  } finally {
    loading--;
  }
}

hooks.loadRight = loadRight;

function drawRight() {
  renderList(right);
  renderCrumbs();
  syncButtons();
  emit("right-view");
}

function renderCrumbs() {
  const box = byId("dual-crumbs");
  if (!box) return;
  clear(box);
  const parts = collapseCrumbs(splitPath(right.location.path, state.sep), 3);
  parts.forEach((c, i) => {
    const last = i === parts.length - 1;
    const el = h("button", { type: "button", class: `crumb${last ? " current" : ""}`, title: c.path, "aria-current": last ? "page" : null, onclick: () => loadRight(c.path) }, c.root && state.sep === "/" ? "💻 Computer" : c.name);
    attachDropTarget(el, { getPath: () => c.path });
    box.append(el);
    if (!last) box.append(h("span", { class: "crumb-sep", "aria-hidden": "true" }, "›"));
  });
  const up = byId("dual-up");
  if (up) up.disabled = !parentOf(right.location.path, state.sep);
}

/** The buttons under the right pane: which ones make sense for what is selected on each side. */
function syncButtons() {
  if (!built) return;
  const chosen = right.selection.size;
  for (const id of ["dual-copy-left", "dual-move-left"]) byId(id).disabled = !chosen || !leftFolder();
  for (const id of ["dual-copy-right", "dual-move-right"]) byId(id).disabled = !left.selection.size || !right.location.path;
  const trash = byId("dual-trash");
  trash.disabled = !chosen;
  trash.title = state.settings.deleteTo === "graveyard"
    ? "Bury what is selected here in the Rip graveyard (Delete). You can undo this."
    : "Move what is selected here to the Recycle Bin (Delete). You can undo this.";
}

// ---------------------------------------------------------------------------------------------------------------
// Copy and move between the panes
// ---------------------------------------------------------------------------------------------------------------

/** Takes the selection of one pane to the folder of the other. `from` is "left" or "right". */
export async function transferBetween(from, mode) {
  const dest = from === "left" ? right.location.path : leftFolder();
  const pane = paneOf(from);
  const sources = selectedEntries(pane).map((e) => e.path);
  if (!dest) return toast(from === "left" ? "The right pane has no folder open yet." : "Open a folder in the left pane first. Search results and the Recycle Bin can't receive files.");
  if (!sources.length) return toast(`Select something in the ${from} pane first.`);
  await transferInto(dest, sources, mode, pane);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (typeof document === "undefined" || state.workspace !== "dual" || !right.location.path || loading) return;
    // Never rebuild the list under someone who is typing a new name.
    if (isRenaming(right)) return scheduleRefresh();
    loadRight(right.location.path, { keep: true });
  }, 150);
}

// ---------------------------------------------------------------------------------------------------------------
// Building the pane
// ---------------------------------------------------------------------------------------------------------------

function actionButton(id, icon, label, tip, run) {
  return h("button", { type: "button", class: "dual-btn", id, title: tip, onclick: run }, h("span", { "aria-hidden": "true" }, icon), h("span", { class: "dual-btn-label" }, label));
}

function build() {
  const pane = $("#dual-pane");
  clear(pane).append(
    h("div", { class: "dual-head" },
      h("button", { type: "button", class: "icon-btn", id: "dual-up", title: "Go up one folder in this pane", "aria-label": "Up one folder in the right pane", onclick: () => goUpIn(right) }, "↑"),
      h("nav", { id: "dual-crumbs", class: "dual-crumbs", "aria-label": "Where the right pane is" }),
      h("button", { type: "button", class: "icon-btn", id: "dual-same", title: "Show the folder from the left pane here too", "aria-label": "Show the left folder in this pane", onclick: () => leftFolder() && loadRight(leftFolder()) }, "⇄")),
    makeListHead(right.ids.head),
    h("div", { class: "dual-listwrap", id: right.ids.wrap },
      h("div", { id: right.ids.list, class: "view-details", role: "listbox", tabindex: "0", "aria-multiselectable": "true", "aria-label": "Files and folders in the right pane" }),
      h("div", { id: right.ids.empty, class: "empty", hidden: true })),
    h("div", { class: "dual-foot" },
      h("span", { id: right.ids.status, class: "dual-status" }),
      h("span", { class: "dual-actions", role: "group", "aria-label": "Copy and move between the two panes" },
        actionButton("dual-copy-right", "📋", "Copy →", `Copy what is selected on the left into this folder (${mod()}drag also copies). Same as F5 when the left side is active.`, () => transferBetween("left", "copy")),
        actionButton("dual-move-right", "✂️", "Move →", "Move what is selected on the left into this folder. Same as F6 when the left side is active.", () => transferBetween("left", "move")),
        actionButton("dual-copy-left", "📋", "← Copy", "Copy what is selected here into the folder on the left. Same as F5 when this side is active.", () => transferBetween("right", "copy")),
        actionButton("dual-move-left", "✂️", "← Move", "Move what is selected here into the folder on the left. Same as F6 when this side is active.", () => transferBetween("right", "move")),
        actionButton("dual-trash", "🗑️", "Delete", "Move what is selected here to the Recycle Bin (Delete). You can undo this.", () => { setActivePane("right"); trashSelection(); }))),
  );
  wirePane(right);

  const list = byId(right.ids.list);
  list.addEventListener("focusin", () => setActivePane("right"));
  $("#list").addEventListener("focusin", () => setActivePane("left"));
  $("#main").addEventListener("pointerdown", () => setActivePane("left"));
  pane.addEventListener("pointerdown", () => setActivePane("right"));
  built = true;
}

/** Called each time the Dual view is shown: builds the pane the first time, then freshens its folder. */
export function enterDual() {
  if (!built) build();
  applyActive();
  syncButtons();
  if (right.location.path) loadRight(right.location.path, { keep: true });
  else loadRight(state.settings.dualPath || state.home).then((ok) => ok || loadRight(state.home));
}

/** F5 and F6 copy and move to the other pane, Tab switches panes, and the right pane follows changes made elsewhere. */
export function wireDual() {
  const live = () => state.workspace === "dual" && built;
  on("view", () => state.workspace === "dual" && right.location.path && scheduleRefresh());
  on("selection", () => {
    if (!live()) return;
    syncSelection(right);
    syncButtons();
  });
  on("pane", () => {
    applyActive();
    syncButtons();
  });
  on("clipboard", () => live() && renderList(right));
  on("dual-transfer", (mode) => live() && transferBetween(sideNow(), mode));
  on("settings", (change) => {
    const keys = Object.keys(change ?? {});
    if (!live()) return;
    if (keys.some((k) => ["view", "sortBy", "sortDir", "foldersFirst"].includes(k))) renderList(right);
    if (keys.includes("deleteTo")) syncButtons();
  });
  document.addEventListener("keydown", (e) => {
    if (!live() || e.defaultPrevented || menuIsOpen() || document.querySelector(".modal-backdrop")) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest("#terminal-panel") || t.matches("input, textarea, select")) return;
    const onList = t.id === "list" || t.id === "dual-list";
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && onList) {
      e.preventDefault();
      $(t.id === "list" ? "#dual-list" : "#list").focus();
    } else {
      const act = actionFor(e, ["dual.copy", "dual.move"]);
      if (!act) return;
      e.preventDefault();
      transferBetween(sideNow(), act === "dual.copy" ? "copy" : "move");
    }
  });
}
