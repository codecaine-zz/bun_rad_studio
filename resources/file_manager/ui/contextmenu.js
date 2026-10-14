// Right-click menus and the View menu items (shared by the toolbar, the menus and the keyboard).
import { showMenu } from "./menus.js";
import { clearSearch, refresh, saveSettings } from "./nav.js";
import * as ops from "./ops.js";
import { showProperties } from "./extras.js";
import { selectAll } from "./selection.js";
import { inTrash, state } from "./state.js";
import { extensionOf } from "./util.js";

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");
const del = () => (state.platform === "darwin" ? "⌘⌫" : "Del");

export function viewMenuItems() {
  const s = state.settings;
  const view = (v, label, key) => ({ label, checked: s.view === v, shortcut: `${mod()}${key}`, action: () => saveSettings({ view: v }) });
  const sort = (by, label) => ({ label, checked: s.sortBy === by, action: () => saveSettings({ sortBy: by }) });
  return [
    { header: "View as" },
    view("details", "Details", "1"),
    view("list", "List", "2"),
    view("icons", "Icons", "3"),
    { separator: true },
    { header: "Sort by" },
    sort("name", "Name"),
    sort("modified", "Date modified"),
    sort("size", "Size"),
    sort("type", "Type"),
    { separator: true },
    { label: "Ascending order", checked: s.sortDir === "asc", action: () => saveSettings({ sortDir: "asc" }) },
    { label: "Descending order", checked: s.sortDir === "desc", action: () => saveSettings({ sortDir: "desc" }) },
    { label: "Folders first", checked: s.foldersFirst, action: () => saveSettings({ foldersFirst: !s.foldersFirst }) },
    { separator: true },
    { label: "Show hidden files", checked: s.showHidden, shortcut: `${mod()}Shift+H`, action: () => saveSettings({ showHidden: !s.showHidden }) },
    { label: "Show details panel", checked: s.showInfoPanel, shortcut: `${mod()}I`, action: () => saveSettings({ showInfoPanel: !s.showInfoPanel }) },
  ];
}

function entryItems(entries) {
  const one = entries.length === 1;
  const e = entries[0];
  const searching = !!state.search;
  if (inTrash()) {
    return [
      { label: "Restore", icon: "↩️", action: ops.restoreFromBin },
      { label: "Delete forever…", icon: "🗑️", danger: true, shortcut: "Del", action: ops.trashSelection },
      { separator: true },
      { label: "Empty Recycle Bin…", danger: true, action: ops.emptyBin },
    ];
  }
  const isZip = one && !e.isDir && extensionOf(e.name) === "zip";
  const clip = !!state.clipboard;
  return [
    one ? { label: "Open", icon: e.isDir ? "📂" : "📄", shortcut: "Enter", action: () => ops.openEntry(e) } : null,
    one && searching ? { label: "Open containing folder", icon: "📁", action: () => ops.goToContaining(e) } : null,
    isZip ? { label: "Extract here", icon: "📦", disabled: searching, action: () => ops.unzipEntry(e) } : null,
    one ? { label: `Show in ${state.fmName === "your file manager" ? "file manager" : state.fmName}`, icon: "🔎", action: () => ops.revealEntry(e) } : null,
    one && e.isDir ? { label: ops.isFavorite(e.path) ? "Remove from Favorites" : "Add to Favorites", icon: "⭐", action: () => ops.toggleFavorite(e.path) } : null,
    { separator: true },
    { label: "Cut", icon: "✂️", shortcut: `${mod()}X`, action: ops.cutSelection },
    { label: "Copy", icon: "📋", shortcut: `${mod()}C`, action: ops.copySelection },
    one && e.isDir ? { label: "Paste into this folder", icon: "📥", disabled: !clip, shortcut: "", action: () => ops.pasteInto(e.path) } : null,
    { label: "Duplicate", icon: "➕", shortcut: `${mod()}D`, disabled: searching, action: ops.duplicateSelection },
    { separator: true },
    { label: one ? "Rename" : `Rename ${entries.length} items…`, icon: "✏️", shortcut: one ? "F2" : "", action: ops.renameSelection },
    { label: "Compress to zip", icon: "🗜️", disabled: searching, action: ops.zipSelection },
    { label: "Copy path", icon: "🔗", action: () => ops.copyPathOf(entries) },
    { separator: true },
    { label: "Move to Recycle Bin", icon: "🗑️", danger: true, shortcut: del(), action: ops.trashSelection },
    { label: "Delete permanently…", danger: true, shortcut: "Shift+Del", action: ops.deleteForever },
    { separator: true },
    { label: "Properties", icon: "ℹ️", shortcut: "Alt+Enter", action: () => showProperties(entries.map((x) => x.path)) },
  ];
}

export function showEntryMenu(entries, point) {
  if (!entries.length) return;
  showMenu(entryItems(entries), { ...point, label: "Actions for the selected items" });
}

export function backgroundItems() {
  if (inTrash()) {
    return [
      { label: "Empty Recycle Bin…", danger: true, disabled: state.trashCount === 0, action: ops.emptyBin },
      { separator: true },
      { label: "Select all", shortcut: `${mod()}A`, action: selectAll },
      { label: "Refresh", shortcut: "F5", action: () => refresh() },
    ];
  }
  if (state.search) {
    return [
      { label: "Clear search", icon: "✕", action: clearSearch },
      { label: "Select all", shortcut: `${mod()}A`, action: selectAll },
      { separator: true },
      ...viewMenuItems(),
    ];
  }
  const here = state.location.path;
  return [
    { label: "New folder", icon: "📁", shortcut: `${mod()}Shift+N`, action: ops.newFolder },
    { label: "New file", icon: "📄", shortcut: `${mod()}Alt+N`, action: ops.newFile },
    { separator: true },
    { label: "Paste", icon: "📥", shortcut: `${mod()}V`, disabled: !state.clipboard, action: ops.paste },
    { label: "Select all", shortcut: `${mod()}A`, action: selectAll },
    { label: "Refresh", shortcut: "F5", action: () => refresh() },
    { separator: true },
    ...viewMenuItems(),
    { separator: true },
    { label: "Properties of this folder", icon: "ℹ️", action: () => showProperties([here]) },
  ];
}

export function showBackgroundMenu(point) {
  showMenu(backgroundItems(), { ...point, label: "Folder actions" });
}
