// The toolbar (buttons), the address bar (clickable path or typed location), the search box and the banner.
import { ApiError, call } from "./api.js";
import { viewMenuItems } from "./contextmenu.js";
import { attachDropTarget } from "./dnd.js";
import { showHelp, showSettings } from "./extras.js";
import { showFavoritesMenu } from "./favorites.js";
import { showRecentsMenu } from "./recents.js";
import { showToolsDialog } from "./tools.js";
import { openPower, togglePower } from "./power.js";
import { lockSelection } from "./vault.js";
import { showOperationHistory } from "./opHistory.js";
import { $, buttonIconFor, clear, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { canGoUpIn, clearSearch, goBack, goForward, goTo, goUpIn, refresh, runSearch } from "./nav.js";
import * as ops from "./ops.js";
import { activePane, isFolderView } from "./pane.js";
import { emit, inTrash, on, state } from "./state.js";
import { hintOf } from "./keymap.js";
import { themeMenuItems } from "./themeMenu.js";
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
      { id: "back", icon: "←", label: "Back", get tip() { return `Go back${hintOf("nav.back")}`; }, run: goBack, enabled: () => onLeft() && state.history.length > 0 },
      { id: "forward", icon: "→", label: "Forward", get tip() { return `Go forward${hintOf("nav.forward")}`; }, run: goForward, enabled: () => onLeft() && state.future.length > 0 },
      { id: "up", icon: "↑", label: "Up", get tip() { return `Go up one folder${hintOf("nav.up")}`; }, run: () => goUpIn(activePane()), enabled: () => canGoUpIn(activePane()) },
      { id: "refresh", icon: "⟳", label: "Refresh", get tip() { return `Reload this folder${hintOf("nav.refresh")}`; }, run: () => refresh(), enabled: () => true },
    ],
    [
      { id: "newFolder", icon: "📁", label: "New folder", get tip() { return `Make a new folder${hintOf("file.newFolder")}`; }, run: ops.newFolder, enabled: folderView, hide: inTrash },
      { id: "newFile", icon: "📄", label: "New file", get tip() { return `Make a new empty file${hintOf("file.newFile")}`; }, run: ops.newFile, enabled: folderView, hide: inTrash },
      { id: "newSqlite", icon: "🪶", label: "New SQLite", get tip() { return `Make a new SQLite database file${hintOf("file.newSqlite")}`; }, run: ops.newSqlite, enabled: folderView, hide: inTrash },
      { id: "newTemplate", icon: "✨", label: "Template", get tip() { return `Make a new file from a starter template${hintOf("file.newTemplate")}`; }, run: () => emit("new-template-dialog"), enabled: folderView, hide: inTrash },
    ],
    [
      { id: "cut", icon: "✂️", label: "Cut", get tip() { return `Cut${hintOf("file.cut")}`; }, run: ops.cutSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "copy", icon: "📋", label: "Copy", get tip() { return `Copy${hintOf("file.copy")}`; }, run: ops.copySelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "paste", icon: "📥", label: "Paste", get tip() { return `Paste${hintOf("file.paste")}`; }, run: ops.paste, enabled: () => !!state.clipboard && folderView(), hide: inTrash },
    ],
    [
      { id: "rename", icon: "✏️", label: "Rename", get tip() { return `Rename${hintOf("file.rename")}`; }, run: ops.renameSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "delete", icon: "🗑️", label: "Delete", get tip() { return `Move to the Recycle Bin (${state.platform === "darwin" ? "⌫, ⌘⌫ or Fn+Delete" : state.settings?.backspaceDeletes !== false ? "Delete or Backspace" : "Delete"}). You can undo this.`; }, run: ops.trashSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "restore", icon: "↩️", label: "Restore", tip: "Put the selected items back where they were", run: ops.restoreFromBin, enabled: () => sel() > 0, show: inTrash, primary: true },
      { id: "deleteForever", icon: "❌", label: "Delete forever", tip: "Delete the selected items permanently", run: ops.trashSelection, enabled: () => sel() > 0, show: inTrash },
      { id: "empty", icon: "🧹", label: "Empty bin", tip: "Delete everything in the Recycle Bin", run: ops.emptyBin, enabled: () => state.trashCount > 0, show: inTrash },
    ],
    [
      { id: "undo", icon: "↶", label: "Undo", tip: `Undo the last action (${mod()}Z)`, run: ops.undo, enabled: () => state.undoStack.length > 0 },
      { id: "activity", icon: "🕘", label: "Activity", get tip() { return `See what was copied, moved or renamed, and what did not finish${hintOf("app.activity")}`; }, run: showOperationHistory, enabled: () => true },
    ],
    [
      { id: "view", icon: "▦", label: "View", tip: "Change how files are shown and sorted", run: (btn) => showMenu(viewMenuItems(), { anchor: btn, label: "View" }), enabled: () => true, menu: true },
      { id: "favorites", icon: "⭐", label: "Favorites", get tip() { return `Jump to your favorite folders, or add this one${hintOf("nav.favorites")}`; }, run: (btn) => showFavoritesMenu(btn), enabled: () => true, menu: true },
      { id: "recent", icon: "🕘", label: "Recent", get tip() { return `Open a file you used lately, or turn recent files on, off or clear them${hintOf("nav.recents")}`; }, run: (btn) => showRecentsMenu(btn), enabled: () => true, menu: true },
      { id: "info", icon: "ℹ️", label: "Details", get tip() { return `Show or hide the details panel${hintOf("view.info")}`; }, run: () => emit("toggle-info"), enabled: () => true, toggle: () => state.settings.showInfoPanel },
      { id: "lock", icon: "🔒", label: "Lock", get tip() { return `Protect the selected files or folders with a password (encrypt), or unlock a selected .radenc file. A lost password can't be recovered.${hintOf("file.lock")}`; }, run: lockSelection, enabled: () => sel() > 0, hide: inTrash },
      { id: "tools", icon: "🧰", label: "Convert", get tip() { return `Convert, shrink or combine pictures, video, sound and documents, and set up the helper programs${hintOf("file.convert")}`; }, run: showToolsDialog, enabled: () => !inTrash() },
      { id: "power", icon: "🔎", label: "Find & more", get tip() { return `Power tools: advanced find, watch folders and run commands, hashes and encryption, IP lookup and network checks${hintOf("nav.findTool")}`; }, run: () => togglePower(), enabled: () => true, toggle: () => state.powerOpen === true },
      { id: "databases", icon: "🗄️", label: "Databases", tip: "Open the Databases tool: saved connections and the SQLite, MySQL, PostgreSQL and Redis studios", run: () => openPower("databases"), enabled: () => true },
      { id: "games", icon: "🕹️", label: "Games", tip: "Open Codecaine Games: play all 24 built-in Codecaine arcade, puzzle, card and casino games", run: () => openPower("games"), enabled: () => true },
      { id: "terminal", icon: "⌨️", label: "Terminal", get tip() { return `Show or hide a terminal in this folder${hintOf("terminal.toggle")}`; }, run: () => emit("toggle-terminal"), enabled: () => true, toggle: () => state.terminalOpen },
      { id: "themes", icon: "🎨", label: "Themes", get tip() { return `Change the colors: standard light or dark, themes you used lately, or all of them${hintOf("app.themes")}`; }, run: async (btn) => showMenu(await themeMenuItems(), { anchor: btn, label: "Themes" }), enabled: () => true, menu: true },
      { id: "settings", icon: "⚙️", label: "Settings", get tip() { return `Colors, text size and more${hintOf("app.settings")}`; }, run: showSettings, enabled: () => true },
      { id: "help", icon: "❓", label: "Help", get tip() { return `Help and keyboard shortcuts${hintOf("app.help")}`; }, run: showHelp, enabled: () => true },
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
        h("span", { class: "ti", "aria-hidden": "true", dataset: { btnIcon: spec.id, defaultIcon: spec.icon } }, buttonIconFor(spec.id, undefined, spec.icon)),
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
    const hidden = Boolean((spec.hide?.() ?? false) || (spec.show ? !spec.show() : false));
    if (btn.hidden !== hidden) btn.hidden = hidden;
    const disabled = !spec.enabled();
    if (btn.disabled !== disabled) btn.disabled = disabled;
    if (spec.toggle) {
      const pressed = String(!!spec.toggle());
      if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed);
    }
    let nextTitle = spec.tip;
    if (spec.id === "delete" && state.settings.deleteTo === "graveyard") {
      nextTitle = "Bury in the Rip graveyard (Delete, or Alt+Delete). You can undo this, and bring it back from Find & more → Graveyard.";
    } else if (spec.id === "undo") {
      const top = state.undoStack.at(-1);
      nextTitle = top ? `Undo: ${top.label} (${mod()}Z)` : `Nothing to undo (${mod()}Z)`;
    }
    if (btn.title !== nextTitle) btn.title = nextTitle;
  }
  document.querySelectorAll(".tool-group").forEach((g) => {
    const groupHidden = ![...g.children].some((c) => !c.hidden);
    if (g.hidden !== groupHidden) g.hidden = groupHidden;
  });
  updateAddressButtons();
}

// ---------------------------------------------------------------------------------------------------------------
// Address bar
// ---------------------------------------------------------------------------------------------------------------

const crumbsEl = () => $("#crumbs");
const addressInput = () => $("#address-input");

export function updateAddressButtons() {
  const pinBtn = $("#pin-folder");
  const copyBtn = $("#copy-address");
  const folderOk = !inTrash() && !state.search && Boolean(state.location.path);
  if (pinBtn) {
    pinBtn.hidden = !folderOk;
    const pinned = folderOk && ops.isFavorite(state.location.path);
    pinBtn.setAttribute("aria-pressed", String(pinned));
    pinBtn.classList.toggle("pinned", pinned);
    pinBtn.textContent = pinned ? "★" : "☆";
    pinBtn.title = `${pinned ? "Remove this folder from Favorites" : "Pin this folder to Favorites"}${hintOf("file.toggleFavorite")}`;
  }
  if (copyBtn) {
    copyBtn.hidden = !folderOk;
    copyBtn.title = `Copy current folder path${hintOf("file.copyPath")}`;
  }
}

async function showChildFoldersMenu(folderPath, anchorOrPoint) {
  try {
    const res = await call("list", { path: folderPath, showHidden: state.settings.showHidden });
    const dirs = (res.entries ?? []).filter((e) => e.isDir).slice(0, 40);
    if (!dirs.length) {
      toast(`No subfolders inside "${baseName(folderPath, state.sep) || folderPath}".`, { kind: "info" });
      return;
    }
    const items = dirs.map((d) => ({
      label: d.name,
      icon: "📂",
      checked: state.location.path === d.path || state.location.path.startsWith(d.path + state.sep),
      action: () => goTo(d.path),
    }));
    showMenu(items, { ...(anchorOrPoint instanceof Element ? { anchor: anchorOrPoint } : anchorOrPoint), label: `Subfolders of ${baseName(folderPath, state.sep) || folderPath}` });
  } catch {
    toast("Couldn't list subfolders.", { kind: "error" });
  }
}

export function renderAddress() {
  const box = clear(crumbsEl());
  updateAddressButtons();
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
    const el = h("button", {
      type: "button",
      class: `crumb${last ? " current" : ""}`,
      title: c.path,
      "aria-current": last ? "page" : null,
      onclick: () => goTo(c.path),
      oncontextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const parent = parentOf(c.path, state.sep);
        void showChildFoldersMenu(parent || c.path, { x: e.clientX, y: e.clientY });
      },
    }, label);
    attachDropTarget(el, { getPath: () => c.path });
    box.append(el);
    if (!last) {
      const sepEl = h("span", {
        class: "crumb-sep",
        "aria-hidden": "true",
        title: `Browse folders inside ${c.name || c.path}`,
        onclick: (e) => {
          e.stopPropagation();
          void showChildFoldersMenu(c.path, sepEl);
        },
      }, "›");
      box.append(sepEl);
    }
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
  $("#pin-folder")?.addEventListener("click", () => {
    if (!inTrash() && state.location.path) void ops.toggleFavorite(state.location.path);
  });
  $("#copy-address")?.addEventListener("click", () => {
    if (!inTrash() && state.location.path) void ops.copyPathOf([{ path: state.location.path }]);
  });
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
