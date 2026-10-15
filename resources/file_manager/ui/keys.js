// Keyboard shortcuts. They work whenever you are not typing in a text box and no dialog or menu is open.
import { codeHasUnsaved, openFolderInCode, openInCode } from "./code.js";
import { looksLikeText } from "./codeLang.js";
import { showBackgroundMenu, showEntryMenu } from "./contextmenu.js";
import { confirmBox } from "./dialogs.js";
import { showFavoritesMenu } from "./favorites.js";
import { showHelp, showProperties, showSettings } from "./extras.js";
import { showMoreInfo } from "./fileinfo.js";
import { openPower } from "./power.js";
import { menuIsOpen, toast } from "./menus.js";
import { openQuickLook, quickLookIsOpen } from "./quicklook.js";
import { canGoUpIn, clearSearch, goBack, goForward, goUpIn, refresh, saveSettings } from "./nav.js";
import * as ops from "./ops.js";
import { clearSelection, focusIndex, focusedIndex, selectAll, selectedEntries, toggleKey } from "./selection.js";
import { editAddress, focusSearch } from "./toolbar.js";
import { iconsPerLine, isRenaming } from "./list.js";
import { activePane, currentPath } from "./pane.js";
import { emit, state } from "./state.js";
import { actionFor } from "./keymap.js";
import { isModifier, typeaheadFind } from "./util.js";
import { visibleEntries } from "./nav.js";

/** On Windows and Linux, Backspace goes up a folder. Someone on a Mac keyboard pressed their Delete key: say once how to change it. */
function hintBackspace(action, key) {
  if (action !== "nav.up" || key !== "Backspace" || state.platform === "darwin" || state.settings.backspaceDeletes) return;
  try {
    if (localStorage.getItem("fm_backspace_hint")) return;
    localStorage.setItem("fm_backspace_hint", "1");
  } catch { /* no storage: the hint just shows every time */ }
  toast("Backspace goes up one folder. On a Mac keyboard, the Delete key is Backspace: turn on “My keyboard's Delete key is Backspace” in Settings to delete with it.", { kind: "info", timeout: 9000 });
}

let typed = "";
let typedTimer = 0;

function pageSize() {
  const pane = activePane();
  const list = document.getElementById(pane.ids.list);
  const row = list.querySelector(".row");
  if (!row) return 10;
  const lines = Math.max(1, Math.floor(list.parentElement.clientHeight / Math.max(20, row.offsetHeight)));
  return lines * iconsPerLine(pane);
}

function openFocused() {
  const pane = activePane();
  const entries = visibleEntries(pane);
  const focused = entries.find((e) => e.path === pane.focusKey) ?? selectedEntries()[0];
  if (!focused) return;
  const selected = selectedEntries();
  if (selected.length > 1 && selected.every((e) => !e.isDir) && selected.length <= 5) selected.forEach((e) => ops.openEntry(e));
  else ops.openEntry(focused);
}

function showMenuForSelection() {
  const pane = activePane();
  const items = selectedEntries();
  const list = document.getElementById(pane.ids.list);
  const row = pane.focusKey ? list.querySelector(`[data-key="${CSS.escape(pane.focusKey)}"]`) : null;
  const rect = (row ?? list).getBoundingClientRect();
  const point = { x: rect.left + 40, y: rect.top + Math.min(rect.height, 30) };
  if (items.length) showEntryMenu(items, point);
  else showBackgroundMenu(point);
}

function navigate(e, key) {
  const pane = activePane();
  const perLine = iconsPerLine(pane);
  const i = focusedIndex(pane);
  const count = visibleEntries(pane).length;
  const opts = { extend: e.shiftKey, keepSelection: isModifier(e, state.platform) && !e.shiftKey, pane };
  let target = null;
  if (key === "ArrowDown") target = i < 0 ? 0 : i + perLine;
  else if (key === "ArrowUp") target = i < 0 ? 0 : i - perLine;
  else if (key === "ArrowRight" && perLine > 1) target = i + 1;
  else if (key === "ArrowLeft" && perLine > 1) target = i - 1;
  else if (key === "Home") target = 0;
  else if (key === "End") target = count - 1;
  else if (key === "PageDown") target = i < 0 ? 0 : i + pageSize();
  else if (key === "PageUp") target = i < 0 ? 0 : i - pageSize();
  if (target === null) return false;
  focusIndex(target, opts);
  return true;
}

/** Closes the window, but first asks when the Code editor has changes that aren't saved. */
async function closeWindow() {
  if (codeHasUnsaved() && !(await confirmBox({ title: "Close with unsaved changes?", message: "Some files in the Code editor have changes that aren't saved. Closing now loses them.", confirmLabel: "Close anyway", cancelLabel: "Go back", danger: true }))) return;
  window.closeApp();
}

/** Ctrl/Cmd+E: opens the chosen file (or folder, or the folder on screen) in the Code editor. */
function editInCode() {
  const picked = selectedEntries();
  const one = picked.length === 1 ? picked[0] : null;
  if (one && !one.isDir) return looksLikeText(one.name) ? openInCode(one.path) : ops.openEntry(one);
  if (one) return openFolderInCode(one.path);
  if (currentPath()) openFolderInCode(currentPath());
}

const PROPERTIES = () => { const items = selectedEntries(); return void showProperties(items.length ? items.map((x) => x.path) : [currentPath()]); };
const MORE_INFO = () => { const items = selectedEntries(); return void showMoreInfo(items.length ? items.map((x) => x.path) : [currentPath()]); };

/** What each changeable shortcut does. The keys come from the table in shortcuts.js (and the person's changes), not from here. */
const FILE_ACTIONS = {
  "app.help": () => showHelp(),
  "nav.refresh": () => void refresh(),
  "file.rename": () => void ops.renameSelection(),
  "file.properties": PROPERTIES,
  "file.moreInfo": MORE_INFO,
  "app.settings": () => showSettings(),
  "app.themes": () => emit("theme-picker"),
  "nav.findTool": () => openPower("find"),
  "file.bury": () => void ops.burySelection(),
  "nav.back": () => void (activePane().side === "left" ? goBack() : null),
  "nav.forward": () => void (activePane().side === "left" ? goForward() : null),
  "nav.up": () => void (canGoUpIn(activePane()) ? goUpIn(activePane()) : null),
  "nav.address": () => editAddress(),
  "nav.favorites": () => showFavoritesMenu({ x: 40, y: 90 }),
  "file.editInCode": () => editInCode(),
  "nav.search": () => focusSearch(),
  "file.selectAll": () => selectAll(),
  "file.copy": () => ops.copySelection(),
  "file.cut": () => ops.cutSelection(),
  "file.paste": () => void ops.paste(),
  "file.duplicate": () => void ops.duplicateSelection(),
  "file.undo": () => void ops.undo(),
  "file.newFolder": () => void ops.newFolder(),
  "file.newFile": () => void ops.newFile(),
  "file.deleteForever": () => void ops.deleteForever(),
  "file.trash": () => void ops.trashSelection(),
  "view.hidden": () => void saveSettings({ showHidden: !state.settings.showHidden }),
  "view.info": () => emit("toggle-info"),
  "view.details": () => void saveSettings({ view: "details" }),
  "view.list": () => void saveSettings({ view: "list" }),
  "view.icons": () => void saveSettings({ view: "icons" }),
};
/** Work wherever you are, even with a button focused. */
const EVERYWHERE = ["app.help", "nav.refresh", "file.rename", "file.properties", "file.moreInfo"];
/** Also work inside the tools panel, the Home page and the other panes. */
const IN_PANES = ["nav.findTool", "app.settings", "app.themes"];
const IN_LISTS = Object.keys(FILE_ACTIONS).filter((id) => !EVERYWHERE.includes(id));

export function wireKeys() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || menuIsOpen() || document.querySelector(".modal-backdrop") || quickLookIsOpen() || isRenaming()) return;
    const target = e.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (typing) return;
    const mod = isModifier(e, state.platform);
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const stop = () => e.preventDefault();

    // Closing the window (only where the desktop app gave the page a way to do that)
    if (mod && (lower === "w" || lower === "q") && typeof window.closeApp === "function") { stop(); return void closeWindow(); }

    // Help, refresh, rename, properties (their keys can be changed in Settings)
    if (key === "?" && !mod) { stop(); return showHelp(); }
    const early = actionFor(e, EVERYWHERE);
    if (early) { stop(); return void FILE_ACTIONS[early](); }

    // A focused button, tab or radio is used with Enter and Space, so leave those keys to it.
    if ((key === "Enter" || key === " ") && target instanceof Element && target.closest("button, [role=tab], [role=radio], a[href]")) return;
    // The other panes (tools, Home, the Dual view's buttons, the view switcher) have their own keys; the list shortcuts below are for the file lists.
    if (target instanceof Element && target.closest("#power-panel, #home, #dual-pane, #viewbar, #splitter") && !target.closest("#dual-list")) {
      const inPane = actionFor(e, IN_PANES);
      if (inPane) { stop(); return void FILE_ACTIONS[inPane](); }
      return;
    }

    // Everything that can be given other keys in Settings (going places, changing things, the view). The order of the
    // table in shortcuts.js doesn't matter: no two actions may share a key, so at most one matches.
    const listAction = actionFor(e, IN_LISTS);
    if (listAction) {
      stop();
      hintBackspace(listAction, key);
      return void FILE_ACTIONS[listAction]();
    }

    // Choosing and opening
    if (key === "Enter") { stop(); return openFocused(); }
    if (key === "Escape") {
      if (activePane().search) clearSearch();
      else clearSelection();
      return;
    }
    if (key === "ContextMenu" || (e.shiftKey && key === "F10") || (mod && e.shiftKey && lower === "m")) { stop(); return showMenuForSelection(); }
    if (key === " " && mod && activePane().focusKey) { stop(); return toggleKey(activePane().focusKey); }
    if (key === " ") { stop(); return openQuickLook(); }

    // Moving through the list
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "PageDown", "PageUp"].includes(key)) {
      if (navigate(e, key)) stop();
      return;
    }

    // Typing a few letters jumps to the item with that name
    if (key.length === 1 && !mod && !e.altKey) {
      typed += key;
      clearTimeout(typedTimer);
      typedTimer = setTimeout(() => (typed = ""), 800);
      const pane = activePane();
      const hit = typeaheadFind(visibleEntries(pane), typed, focusedIndex(pane));
      if (hit >= 0) focusIndex(hit);
      stop();
    }
  });
}
