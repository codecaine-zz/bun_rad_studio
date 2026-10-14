// Keyboard shortcuts. They work whenever you are not typing in a text box and no dialog or menu is open.
import { showBackgroundMenu, showEntryMenu } from "./contextmenu.js";
import { showHelp, showProperties, showSettings } from "./extras.js";
import { $ } from "./dom.js";
import { menuIsOpen } from "./menus.js";
import { canGoUp, clearSearch, goBack, goForward, goUp, refresh, saveSettings } from "./nav.js";
import * as ops from "./ops.js";
import { clearSelection, focusIndex, focusedIndex, selectAll, selectedEntries, toggleKey } from "./selection.js";
import { editAddress, focusSearch } from "./toolbar.js";
import { iconsPerLine, isRenaming } from "./list.js";
import { emit, inTrash, state } from "./state.js";
import { isModifier, typeaheadFind } from "./util.js";
import { visibleEntries } from "./nav.js";

let typed = "";
let typedTimer = 0;

function pageSize() {
  const list = $("#list");
  const row = list.querySelector(".row");
  if (!row) return 10;
  const lines = Math.max(1, Math.floor(list.parentElement.clientHeight / Math.max(20, row.offsetHeight)));
  return lines * iconsPerLine();
}

function openFocused() {
  const entries = visibleEntries();
  const focused = entries.find((e) => e.path === state.focusKey) ?? selectedEntries()[0];
  if (!focused) return;
  const selected = selectedEntries();
  if (selected.length > 1 && selected.every((e) => !e.isDir) && selected.length <= 5) selected.forEach((e) => ops.openEntry(e));
  else ops.openEntry(focused);
}

function showMenuForSelection() {
  const items = selectedEntries();
  const row = state.focusKey ? $("#list").querySelector(`[data-key="${CSS.escape(state.focusKey)}"]`) : null;
  const rect = (row ?? $("#list")).getBoundingClientRect();
  const point = { x: rect.left + 40, y: rect.top + Math.min(rect.height, 30) };
  if (items.length) showEntryMenu(items, point);
  else showBackgroundMenu(point);
}

function navigate(e, key) {
  const perLine = iconsPerLine();
  const i = focusedIndex();
  const count = visibleEntries().length;
  const opts = { extend: e.shiftKey, keepSelection: isModifier(e, state.platform) && !e.shiftKey };
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

export function wireKeys() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || menuIsOpen() || document.querySelector(".modal-backdrop") || isRenaming()) return;
    const target = e.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (typing) return;
    const mod = isModifier(e, state.platform);
    const mac = state.platform === "darwin";
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const stop = () => e.preventDefault();

    // Closing the window (only where the desktop app gave the page a way to do that)
    if (mod && (lower === "w" || lower === "q") && typeof window.closeApp === "function") { stop(); return void window.closeApp(); }

    // Help, refresh, rename, properties
    if (key === "F1" || (key === "?" && !mod)) { stop(); return showHelp(); }
    if (key === "F5" || (mod && lower === "r")) { stop(); return void refresh(); }
    if (key === "F2") { stop(); return void ops.renameSelection(); }
    if (e.altKey && key === "Enter") { stop(); const items = selectedEntries(); return void showProperties(items.length ? items.map((x) => x.path) : [state.location.path]); }

    // Going places
    if ((e.altKey && key === "ArrowLeft") || (mac && mod && key === "[")) { stop(); return void goBack(); }
    if ((e.altKey && key === "ArrowRight") || (mac && mod && key === "]")) { stop(); return void goForward(); }
    if ((e.altKey && key === "ArrowUp") || (mac && mod && key === "ArrowUp") || (key === "Backspace" && !mod)) { stop(); return void (canGoUp() || inTrash() ? goUp() : null); }
    if (mod && lower === "l") { stop(); return editAddress(); }
    if (e.altKey && lower === "d" && !mac) { stop(); return editAddress(); }
    if (mod && lower === "f") { stop(); return focusSearch(); }

    // Choosing and opening
    if (mod && lower === "a") { stop(); return selectAll(); }
    if (key === "Enter") { stop(); return openFocused(); }
    if (key === "Escape") {
      if (state.search) clearSearch();
      else clearSelection();
      return;
    }
    if (key === "ContextMenu" || (e.shiftKey && key === "F10")) { stop(); return showMenuForSelection(); }
    if (key === " " && mod && state.focusKey) { stop(); return toggleKey(state.focusKey); }
    if (key === " ") return stop();

    // Changing things
    if (mod && !e.shiftKey && !e.altKey && lower === "c") { stop(); return ops.copySelection(); }
    if (mod && !e.shiftKey && !e.altKey && lower === "x") { stop(); return ops.cutSelection(); }
    if (mod && !e.shiftKey && !e.altKey && lower === "v") { stop(); return void ops.paste(); }
    if (mod && !e.shiftKey && lower === "d") { stop(); return void ops.duplicateSelection(); }
    if (mod && !e.shiftKey && lower === "z") { stop(); return void ops.undo(); }
    if (mod && e.shiftKey && lower === "n") { stop(); return void ops.newFolder(); }
    if (mod && e.altKey && lower === "n") { stop(); return void ops.newFile(); }
    if (key === "Delete" && e.shiftKey) { stop(); return void ops.deleteForever(); }
    if (key === "Delete" || (mac && mod && key === "Backspace")) { stop(); return void ops.trashSelection(); }

    // View
    if (mod && e.shiftKey && lower === "h") { stop(); return void saveSettings({ showHidden: !state.settings.showHidden }); }
    if (mod && !e.shiftKey && lower === "i") { stop(); return emit("toggle-info"); }
    if (mod && lower === "1") { stop(); return void saveSettings({ view: "details" }); }
    if (mod && lower === "2") { stop(); return void saveSettings({ view: "list" }); }
    if (mod && lower === "3") { stop(); return void saveSettings({ view: "icons" }); }
    if (mod && key === ",") { stop(); return showSettings(); }

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
      const entries = visibleEntries();
      const hit = typeaheadFind(entries, typed, focusedIndex());
      if (hit >= 0) focusIndex(hit);
      stop();
    }
  });
}
