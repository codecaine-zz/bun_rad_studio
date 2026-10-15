// Right-click menus and the View menu items (shared by the toolbar, the menus and the keyboard).
import { showMenu } from "./menus.js";
import { clearSearch, refresh, saveSettings } from "./nav.js";
import * as ops from "./ops.js";
import { canCompareData, showCompareData } from "./datacompare.js";
import { showProperties } from "./extras.js";
import { copyFileUrls, openInEditor } from "./fileurl.js";
import { showMoreInfo } from "./fileinfo.js";
import { selectAll } from "./selection.js";
import { inTrash, state } from "./state.js";
import { openFolderInCode, openInCode } from "./code.js";
import { openPower } from "./power.js";
import { looksLikeText } from "./codeLang.js";
import { envFileMenuItems, sqliteMenuItems } from "./dbFiles.js";
import { showOpenWith } from "./openwith.js";
import { folderServeItems, serveMenuItems } from "./serveActions.js";
import { showToolsDialog } from "./tools.js";
import { extensionOf } from "./util.js";
import { canLock, canUnlock, lockEntries, unlockEntries } from "./vault.js";
import { permissionItems } from "./permsQuick.js";

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");
const del = () => (state.platform === "darwin" ? "⌘⌫" : "Del");
const buryKey = () => (state.platform === "darwin" ? "⌥⌫" : "Alt+Del");
const toGraveyard = () => state.settings.deleteTo === "graveyard";

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
  const convertible = entries.length > 0;
  return [
    one ? { label: "Open", icon: e.isDir ? "📂" : "📄", shortcut: "Enter", action: () => ops.openEntry(e) } : null,
    one && searching ? { label: "Open containing folder", icon: "📁", action: () => ops.goToContaining(e) } : null,
    one && !e.isDir && looksLikeText(e.name) ? { label: "Edit in Code editor", icon: "📝", shortcut: `${mod()}E`, action: () => openInCode(e.path) } : null,
    one && !e.isDir && looksLikeText(e.name) ? { label: "Open in your editor", icon: "🧑‍💻", tip: "Open this file in the code editor chosen in Settings (VS Code, Sublime Text, WebStorm or IntelliJ IDEA).", action: () => openInEditor(e) } : null,
    canCompareData(entries) ? { label: "Compare data files…", icon: "⚖️", tip: "Compare these two JSON, YAML or TOML files by what they say, ignoring key order and formatting, and list what differs.", action: () => showCompareData(entries) } : null,
    one && e.isDir ? { label: "Open folder in Code editor", icon: "📝", shortcut: `${mod()}E`, action: () => openFolderInCode(e.path) } : null,
    one && e.isDir ? { label: "Code statistics…", icon: "📊", action: () => openPower("dev", { root: e.path, section: "stats" }) } : null,
    ...serveMenuItems(entries),
    entries.some((x) => !x.isDir) ? { label: "Open with…", icon: "🧩", action: () => showOpenWith(entries) } : null,
    ...sqliteMenuItems(entries),
    ...envFileMenuItems(entries),
    isZip ? { label: "Extract here", icon: "📦", disabled: searching, action: () => ops.unzipEntry(e) } : null,
    one ? { label: `Show in ${state.fmName === "your file manager" ? "file manager" : state.fmName}`, icon: "🔎", action: () => ops.revealEntry(e) } : null,
    one && e.isDir ? { label: ops.isFavorite(e.path) ? "Remove from Favorites" : "Add to Favorites", icon: "⭐", action: () => ops.toggleFavorite(e.path) } : null,
    convertible ? { label: "Convert or process…", icon: "🧰", action: showToolsDialog } : null,
    canLock(entries) ? { label: "Encrypt…", icon: "🔒", action: () => lockEntries(entries) } : null,
    canUnlock(entries) ? { label: "Decrypt…", icon: "🔓", action: () => unlockEntries(entries) } : null,
    one && !e.isDir && extensionOf(e.name) === "radsec" ? { label: "Open in Secrets", icon: "🗝️", tip: "Open the Secrets tool, where this encrypted vault backup can be restored (you will be asked for its master password).", action: () => openPower("secrets", { restorePath: e.path }) } : null,
    { separator: true },
    { label: "Cut", icon: "✂️", shortcut: `${mod()}X`, action: ops.cutSelection },
    { label: "Copy", icon: "📋", shortcut: `${mod()}C`, action: ops.copySelection },
    one && e.isDir ? { label: "Paste into this folder", icon: "📥", disabled: !clip, shortcut: "", action: () => ops.pasteInto(e.path) } : null,
    { label: "Duplicate", icon: "➕", shortcut: `${mod()}D`, disabled: searching, action: ops.duplicateSelection },
    { separator: true },
    { label: one ? "Rename" : `Rename ${entries.length} items…`, icon: "✏️", shortcut: one ? "F2" : "", action: ops.renameSelection },
    { label: "Compress to zip", icon: "🗜️", disabled: searching, action: ops.zipSelection },
    { label: "Copy path", icon: "🔗", action: () => ops.copyPathOf(entries) },
    { label: "Copy path as a file:// address", icon: "🌐", tip: "Copy the location as a file:// web address (spaces become %20), the form browsers and some programs understand.", action: () => copyFileUrls(entries) },
    { separator: true },
    { label: "Move to Recycle Bin", icon: "🗑️", danger: true, shortcut: toGraveyard() ? "" : del(), action: ops.moveSelectionToBin },
    { label: "Bury (Rip)", icon: "🪦", danger: true, tip: "Move to the Rip graveyard instead of deleting. You can undo it, and bring it back later from Find & more → Graveyard. Rip Studio shares this graveyard.", shortcut: toGraveyard() ? `${del()}  or  ${buryKey()}` : buryKey(), action: ops.burySelection },
    { label: "Delete permanently…", danger: true, shortcut: "Shift+Del", action: ops.deleteForever },
    { separator: true },
    ...permissionItems(entries),
    { label: "More info…", icon: "🔍", shortcut: "Alt+Shift+Enter", action: () => showMoreInfo(entries.map((x) => x.path)) },
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
    { label: "New SQLite database", icon: "🗄️", tip: "Make a new, empty SQLite database file here. Open it in SQLite Studio, add it as a connection, or fill it with a sample database.", action: ops.newSqlite },
    { separator: true },
    { label: "Paste", icon: "📥", shortcut: `${mod()}V`, disabled: !state.clipboard, action: ops.paste },
    { label: "Select all", shortcut: `${mod()}A`, action: selectAll },
    { label: "Refresh", shortcut: "F5", action: () => refresh() },
    { separator: true },
    { label: "Open this folder in Code editor", icon: "📝", action: () => openFolderInCode(here) },
    ...folderServeItems(here),
    { separator: true },
    ...viewMenuItems(),
    { separator: true },
    { label: "More info about this folder…", icon: "🔍", action: () => showMoreInfo([here]) },
    { label: "Properties of this folder", icon: "ℹ️", action: () => showProperties([here]) },
  ];
}

export function showBackgroundMenu(point) {
  showMenu(backgroundItems(), { ...point, label: "Folder actions" });
}
