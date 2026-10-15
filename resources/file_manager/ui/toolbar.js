// The toolbar (buttons), the address bar (clickable path or typed location), the search box and the banner.
import { ApiError, call } from "./api.js";
import { viewMenuItems } from "./contextmenu.js";
import { attachDropTarget } from "./dnd.js";
import { showHelp, showSettings } from "./extras.js";
import { showFavoritesMenu } from "./favorites.js";
import { showToolsDialog } from "./tools.js";
import { togglePower } from "./power.js";
import { lockSelection } from "./vault.js";
import { $, clear, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { canGoUpIn, clearSearch, goBack, goForward, goTo, goUpIn, refresh, runSearch } from "./nav.js";
import * as ops from "./ops.js";
import { activePane, isFolderView } from "./pane.js";
import { emit, inTrash, on, state } from "./state.js";
import { baseName, collapseCrumbs, parentOf, plural, splitPath } from "./util.js";

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");

// ---------------------------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------------------------

/** Each button: id, icon, label, tooltip, what it does, and when it is enabled / shown. */
function buttonSpecs() {
  // In the Dual view these follow the active pane (the one last clicked), so the same buttons work on either folder.
  const sel = () => activePane().selection.size;
  const folderView = () => isFolderView(activePane());
  const onLeft = () => activePane().side === "left";
  return [
    [
      { id: "back", icon: "←", label: "Back", tip: "Go back (Alt+←)", run: goBack, enabled: () => onLeft() && state.history.length > 0 },
      { id: "forward", icon: "→", label: "Forward", tip: "Go forward (Alt+→)", run: goForward, enabled: () => onLeft() && state.future.length > 0 },
      { id: "up", icon: "↑", label: "Up", tip: "Go up one folder (Backspace)", run: () => goUpIn(activePane()), enabled: () => canGoUpIn(activePane()) },
      { id: "refresh", icon: "⟳", label: "Refresh", tip: "Reload this folder (F5)", run: () => refresh(), enabled: () => true },
    ],
    [
      { id: "newFolder", icon: "📁", label: "New folder", tip: `Make a new folder (${mod()}Shift+N)`, run: ops.newFolder, enabled: folderView, hide: inTrash },
      { id: "newFile", icon: "📄", label: "New file", tip: `Make a new empty file (${mod()}Alt+N)`, run: ops.newFile, enabled: folderView, hide: inTrash },
    ],
    [
      { id: "cut", icon: "✂️", label: "Cut", tip: `Cut (${mod()}X)`, run: ops.cutSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "copy", icon: "📋", label: "Copy", tip: `Copy (${mod()}C)`, run: ops.copySelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "paste", icon: "📥", label: "Paste", tip: `Paste (${mod()}V)`, run: ops.paste, enabled: () => !!state.clipboard && folderView(), hide: inTrash },
    ],
    [
      { id: "rename", icon: "✏️", label: "Rename", tip: "Rename (F2)", run: ops.renameSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "delete", icon: "🗑️", label: "Delete", tip: "Move to the Recycle Bin (Delete). You can undo this.", run: ops.trashSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "restore", icon: "↩️", label: "Restore", tip: "Put the selected items back where they were", run: ops.restoreFromBin, enabled: () => sel() > 0, show: inTrash, primary: true },
      { id: "deleteForever", icon: "❌", label: "Delete forever", tip: "Delete the selected items permanently", run: ops.trashSelection, enabled: () => sel() > 0, show: inTrash },
      { id: "empty", icon: "🧹", label: "Empty bin", tip: "Delete everything in the Recycle Bin", run: ops.emptyBin, enabled: () => state.trashCount > 0, show: inTrash },
    ],
    [
      { id: "undo", icon: "↶", label: "Undo", tip: `Undo the last action (${mod()}Z)`, run: ops.undo, enabled: () => state.undoStack.length > 0 },
    ],
    [
      { id: "view", icon: "▦", label: "View", tip: "Change how files are shown and sorted", run: (btn) => showMenu(viewMenuItems(), { anchor: btn, label: "View" }), enabled: () => true, menu: true },
      { id: "favorites", icon: "⭐", label: "Favorites", tip: `Jump to your favorite folders, or add this one (${mod()}Shift+B)`, run: (btn) => showFavoritesMenu(btn), enabled: () => true, menu: true },
      { id: "info", icon: "ℹ️", label: "Details", tip: `Show or hide the details panel (${mod()}I)`, run: () => emit("toggle-info"), enabled: () => true, toggle: () => state.settings.showInfoPanel },
      { id: "lock", icon: "🔒", label: "Lock", tip: "Protect the selected files or folders with a password (encrypt), or unlock a selected .radenc file. A lost password can't be recovered.", run: lockSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "tools", icon: "🧰", label: "Convert", tip: "Convert, shrink or combine pictures, video, sound and documents, and set up the helper programs", run: showToolsDialog, enabled: () => !inTrash() },
      { id: "power", icon: "🔎", label: "Find & more", tip: "Power tools: advanced find, watch folders and run commands, hashes and encryption, IP lookup and network checks (Ctrl+Shift+F)", run: () => togglePower(), enabled: () => true, toggle: () => state.powerOpen === true },
      { id: "terminal", icon: "⌨️", label: "Terminal", tip: "Show or hide a terminal in this folder (Ctrl+`)", run: () => emit("toggle-terminal"), enabled: () => true, toggle: () => state.terminalOpen },
      { id: "settings", icon: "⚙️", label: "Settings", tip: "Colours, text size and more", run: showSettings, enabled: () => true },
      { id: "help", icon: "❓", label: "Help", tip: "Help and keyboard shortcuts (F1)", run: showHelp, enabled: () => true },
    ],
  ];
}

const buttons = new Map();

export function buildToolbar() {
  const bar = $("#toolbar");
  clear(bar);
  for (const group of buttonSpecs()) {
    const g = h("div", { class: "tool-group", role: "group" });
    for (const spec of group) {
      const btn = h("button", { type: "button", class: `tool${spec.primary ? " primary" : ""}`, id: `tool-${spec.id}`, title: spec.tip, "aria-label": spec.label, onclick: () => spec.run(btn) },
        h("span", { class: "ti", "aria-hidden": "true" }, spec.icon),
        h("span", { class: "tl" }, spec.label),
        spec.menu ? h("span", { class: "caret", "aria-hidden": "true" }, "▾") : null);
      buttons.set(spec.id, { btn, spec });
      g.append(btn);
    }
    bar.append(g);
  }
  updateToolbar();
}

export function updateToolbar() {
  for (const { btn, spec } of buttons.values()) {
    const hidden = (spec.hide?.() ?? false) || (spec.show ? !spec.show() : false);
    btn.hidden = hidden;
    btn.disabled = !spec.enabled();
    if (spec.toggle) btn.setAttribute("aria-pressed", String(!!spec.toggle()));
    if (spec.id === "delete") btn.title = state.settings.deleteTo === "graveyard" ? "Bury in the Rip graveyard (Delete, or Alt+Delete). You can undo this, and bring it back from Find & more → Graveyard." : spec.tip;
    if (spec.id === "undo") {
      const top = state.undoStack.at(-1);
      btn.title = top ? `Undo: ${top.label} (${mod()}Z)` : `Nothing to undo (${mod()}Z)`;
    }
  }
  document.querySelectorAll(".tool-group").forEach((g) => (g.hidden = ![...g.children].some((c) => !c.hidden)));
}

// ---------------------------------------------------------------------------------------------------------------
// Address bar
// ---------------------------------------------------------------------------------------------------------------

const crumbsEl = () => $("#crumbs");
const addressInput = () => $("#address-input");

export function renderAddress() {
  const box = clear(crumbsEl());
  if (inTrash()) {
    box.append(h("span", { class: "crumb current static" }, "🗑️ Recycle Bin"));
    return;
  }
  if (state.search) {
    box.append(h("span", { class: "crumb current static" }, `🔍 Search results for “${state.search.query}”`), h("span", { class: "crumb-note" }, ` in ${baseName(state.search.root, state.sep) || state.search.root}`));
    return;
  }
  const parts = collapseCrumbs(splitPath(state.location.path, state.sep), 4);
  parts.forEach((c, i) => {
    const last = i === parts.length - 1;
    const label = c.root && state.sep === "/" ? "💻 Computer" : c.name;
    const el = h("button", { type: "button", class: `crumb${last ? " current" : ""}`, title: c.path, "aria-current": last ? "page" : null, onclick: () => goTo(c.path) }, label);
    attachDropTarget(el, { getPath: () => c.path });
    box.append(el);
    if (!last) box.append(h("span", { class: "crumb-sep", "aria-hidden": "true" }, "›"));
  });
}

function showAddressEditor() {
  if (inTrash() || state.search) return;
  const input = addressInput();
  crumbsEl().hidden = true;
  input.hidden = false;
  input.value = state.location.path;
  input.focus();
  input.select();
}

function hideAddressEditor() {
  addressInput().hidden = true;
  crumbsEl().hidden = false;
}

export const editAddress = showAddressEditor;

async function goToTyped(text) {
  try {
    const r = await call("typedpath", { text, cwd: state.location.path || state.home });
    if (!r.exists) return toast(`"${text}" doesn't exist.`, { kind: "error" });
    if (r.isDir) await goTo(r.path);
    else await goTo(parentOf(r.path, state.sep) ?? r.path, { select: r.path });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "That isn't a location.", { kind: "error" });
  }
}

export function wireAddress() {
  const input = addressInput();
  $("#crumbs").addEventListener("click", (e) => {
    if (e.target === $("#crumbs")) showAddressEditor();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = input.value;
      hideAddressEditor();
      goToTyped(value);
      $("#list").focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hideAddressEditor();
      $("#list").focus();
    }
  });
  input.addEventListener("blur", () => setTimeout(hideAddressEditor, 120));
  $("#edit-address").addEventListener("click", showAddressEditor);
}

// ---------------------------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------------------------

export function focusSearch() {
  const input = $("#search");
  if (input.disabled) return;
  input.focus();
  input.select();
}

export function updateSearchBox() {
  const input = $("#search");
  input.disabled = inTrash();
  const name = inTrash() ? "" : baseName(state.search?.root ?? state.location.path ?? "", state.sep) || "this computer";
  input.placeholder = inTrash() ? "Search isn't available here" : `Search in ${name}`;
  input.setAttribute("aria-label", input.placeholder);
  if (!state.search && document.activeElement !== input) input.value = "";
}

export function wireSearch() {
  const input = $("#search");
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!input.value.trim()) return clearSearch();
      await runSearch(input.value);
      $("#list").focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      clearSearch();
      $("#list").focus();
    }
  });
  $("#search-go").addEventListener("click", () => (input.value.trim() ? runSearch(input.value) : input.focus()));
}

// ---------------------------------------------------------------------------------------------------------------
// Banner (search, Recycle Bin and big-folder notes)
// ---------------------------------------------------------------------------------------------------------------

export function renderBanner() {
  const banner = $("#banner");
  clear(banner);
  let content = null;
  if (state.search) {
    const s = state.search;
    const notes = [];
    if (s.truncated) notes.push("The search stopped early. Try a more specific name.");
    if (s.skipped) notes.push(`${plural(s.skipped, "folder")} couldn't be read.`);
    content = [h("span", {}, `${plural(s.entries.length, "match", "matches")} for “${s.query}”. ${notes.join(" ")}`), h("button", { type: "button", class: "btn", onclick: clearSearch }, "Clear search")];
  } else if (inTrash()) {
    content = [h("span", {}, "Deleted items stay here until you empty the Recycle Bin. Select an item and press Restore to get it back."), state.trashCount ? h("button", { type: "button", class: "btn", onclick: ops.emptyBin }, "Empty Recycle Bin") : null];
  } else if (state.truncated) {
    content = [h("span", {}, `This folder has ${state.total.toLocaleString()} items. Only the first 50,000 are listed.`)];
  }
  banner.hidden = !content;
  if (content) banner.append(...content.filter(Boolean));
}

export function wireToolbar() {
  buildToolbar();
  wireAddress();
  wireSearch();
  const refreshAll = () => {
    updateToolbar();
  };
  on("selection", refreshAll);
  on("pane", refreshAll);
  on("right-view", refreshAll);
  on("clipboard", refreshAll);
  on("undo", refreshAll);
  on("settings", refreshAll);
  on("terminal", refreshAll);
  on("power", refreshAll);
  on("busy", refreshAll);
  on("view", () => {
    renderAddress();
    renderBanner();
    updateSearchBox();
    updateToolbar();
  });
  on("places", () => {
    renderBanner();
    updateToolbar();
  });
  window.addEventListener("contextmenu", (e) => {
    if (e.target instanceof Element && e.target.closest("#toolbar, #addressbar")) e.preventDefault();
  });
}
