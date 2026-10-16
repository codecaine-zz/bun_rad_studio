// Right-click menus and the View menu items (shared by the toolbar, the menus and the keyboard).
import { isStudioPicture } from "./imageStudio.js";
import { isStudioMedia } from "./mediaStudio.js";
import { showMenu } from "./menus.js";
import { clearSearch, refresh, saveSettings } from "./nav.js";
import * as ops from "./ops.js";
import { canCompareData, showCompareData } from "./datacompare.js";
import { showProperties } from "./extras.js";
import { copyFileUrls, copyTerminalPaths, openInEditor } from "./fileurl.js";
import { showMoreInfo } from "./fileinfo.js";
import { selectAll } from "./selection.js";
import { activePane, currentPath, inTrash, isFolderView, left, right } from "./pane.js";
import { emit, state } from "./state.js";
import { openFolderInCode, openInCode } from "./code.js";
import { openPower } from "./power.js";
import { looksLikeText } from "./codeLang.js";
import { envFileMenuItems, sqliteMenuItems } from "./dbFiles.js";
import { importFileMenuItems } from "./dbStaging.js";
import { showOpenWith } from "./openwith.js";
import { folderServeItems, serveMenuItems } from "./serveActions.js";
import { showToolsDialog } from "./tools.js";
import { extensionOf, parentOf } from "./util.js";
import { labelOf } from "./keymap.js";
import { openQuickLook } from "./quicklook.js";
import { canCopyImage, canCopyText, copyImageFile, copyTextFile } from "./clipfile.js";
import { canLock, canUnlock, lockEntries, unlockEntries } from "./vault.js";
import { permissionItems } from "./permsQuick.js";
import { databaseStudioItems, moreToolsItem } from "./toolLauncher.js";

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");
const del = () => (state.platform === "darwin" ? "⌘⌫" : "Del");
const buryKey = () => (state.platform === "darwin" ? "⌥⌫" : "Alt+Del");
const toGraveyard = () => state.settings.deleteTo === "graveyard";

export function viewMenuItems() {
  const s = state.settings;
  const view = (v, label, key) => ({ label, checked: s.view === v, shortcut: labelOf(`view.${v}`), action: () => saveSettings({ view: v }) });
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
    { label: "Show hidden files", checked: s.showHidden, shortcut: labelOf("view.hidden"), action: () => saveSettings({ showHidden: !s.showHidden }) },
    { label: "Show details panel", checked: s.showInfoPanel, shortcut: labelOf("view.info"), action: () => saveSettings({ showInfoPanel: !s.showInfoPanel }) },
  ];
}

/** In the Dual view: copy or move the selection into the folder of the other pane (the same as F5 and F6). */
function otherPaneItems() {
  if (state.workspace !== "dual") return [];
  const other = activePane().side === "left" ? right : left;
  const ready = isFolderView(other) && !!currentPath(other);
  return [
    { label: "Copy to the other pane", icon: "📋", shortcut: labelOf("dual.copy"), disabled: !ready, action: () => emit("dual-transfer", "copy") },
    { label: "Move to the other pane", icon: "✂️", shortcut: labelOf("dual.move"), disabled: !ready, action: () => emit("dual-transfer", "move") },
  ];
}

function entryItems(entries) {
  const one = entries.length === 1;
  const e = entries[0];
  const searching = !!activePane().search;
  if (inTrash()) {
    return [
      { label: "Restore", icon: "↩️", action: ops.restoreFromBin },
      { label: "Delete forever…", icon: "🗑️", danger: true, shortcut: labelOf("file.trash"), action: ops.trashSelection },
      { separator: true },
      { label: "Empty Recycle Bin…", danger: true, action: ops.emptyBin },
    ];
  }
  const isZip = one && !e.isDir && extensionOf(e.name) === "zip";
  const clip = !!state.clipboard;
  const convertible = entries.length > 0;
  return [
    one ? { label: "Open", icon: e.isDir ? "📂" : "📄", shortcut: "Enter", action: () => ops.openEntry(e) } : null,
    one ? { label: "Quick Look", icon: "👁️", shortcut: "Space", tip: "Look at a picture, play a sound or video, read a text file or see a document here, without opening another program.", action: () => openQuickLook(e) } : null,
    one && searching ? { label: "Open containing folder", icon: "📁", action: () => ops.goToContaining(e) } : null,
    ...studioMenuItems(entries),
    one && !e.isDir && e.kind === "image" ? { label: "Read QR code", icon: "🔳", tip: "Look for a QR code in this picture and show what it says.", action: () => openPower("qr", { read: e.path, name: e.name }) } : null,
    one && !e.isDir && looksLikeText(e.name) && e.size <= 20000 ? { label: "Make a QR code from this text", icon: "🔳", tip: "Put the text of this file in a QR code (up to a few thousand characters).", action: () => openPower("qr", { makeFromFile: e.path }) } : null,
    one && !e.isDir && looksLikeText(e.name) ? { label: "Edit in Code editor", icon: "📝", shortcut: labelOf("file.editInCode"), action: () => openInCode(e.path) } : null,
    one && !e.isDir && looksLikeText(e.name) ? { label: "Open in your editor", icon: "🧑‍💻", tip: "Open this file in the code editor chosen in Settings (VS Code, Sublime Text, WebStorm or IntelliJ IDEA).", action: () => openInEditor(e) } : null,
    canCompareData(entries) ? { label: "Compare data files…", icon: "⚖️", tip: "Compare these two JSON, YAML or TOML files by what they say, ignoring key order and formatting, and list what differs.", action: () => showCompareData(entries) } : null,
    one ? { label: e.isDir ? "Open terminal here" : "Open terminal in this folder", icon: "⌨️", shortcut: labelOf("terminal.here"), tip: "Show the terminal and move it to this folder.", action: () => emit("terminal-here", e.isDir ? e.path : parentOf(e.path, state.sep)) } : null,
    { label: "Insert paths in Terminal", icon: "⌨️", tip: "Insert the selected files and folders as shell-quoted arguments. Nothing runs until you press Enter.", action: () => emit("terminal-insert-paths", entries.map((entry) => entry.path)) },
    one && e.isDir ? { label: "Open folder in Code editor", icon: "📝", shortcut: labelOf("file.editInCode"), action: () => openFolderInCode(e.path) } : null,
    one && e.isDir ? { label: "Code statistics…", icon: "📊", action: () => openPower("dev", { root: e.path, section: "stats" }) } : null,
    ...serveMenuItems(entries),
    entries.some((x) => !x.isDir) ? { label: "Open with…", icon: "🧩", action: () => showOpenWith(entries) } : null,
    ...sqliteMenuItems(entries),
    ...envFileMenuItems(entries),
    ...importFileMenuItems(entries),
    isZip ? { label: "Extract here", icon: "📦", disabled: searching, action: () => ops.unzipEntry(e) } : null,
    one ? { label: `Show in ${state.fmName === "your file manager" ? "file manager" : state.fmName}`, icon: "🔎", action: () => ops.revealEntry(e) } : null,
    one && e.isDir ? { label: ops.isFavorite(e.path) ? "Remove from Favorites" : "Add to Favorites", icon: "⭐", action: () => ops.toggleFavorite(e.path) } : null,
    convertible ? { label: "Convert or process…", icon: "🧰", action: showToolsDialog } : null,
    canLock(entries) ? { label: "Encrypt…", icon: "🔒", action: () => lockEntries(entries) } : null,
    canUnlock(entries) ? { label: "Decrypt…", icon: "🔓", action: () => unlockEntries(entries) } : null,
    one && !e.isDir && extensionOf(e.name) === "radsec" ? { label: "Open in Secrets", icon: "🗝️", tip: "Open the Secrets tool, where this encrypted vault backup can be restored (you will be asked for its master password).", action: () => openPower("secrets", { restorePath: e.path }) } : null,
    { separator: true },
    { label: "Cut", icon: "✂️", shortcut: labelOf("file.cut"), action: ops.cutSelection },
    { label: "Copy", icon: "📋", shortcut: labelOf("file.copy"), action: ops.copySelection },
    ...terminalCopyItems(entries),
    one && canCopyImage(e) ? { label: "Copy image to clipboard", icon: "🖼️", tip: "Put the picture itself on the clipboard, to paste into a document, a chat or an image editor. (Copy, above, copies the file so you can paste it into a folder.)", action: () => copyImageFile(e) } : null,
    one && canCopyText(e) ? { label: "Copy text to clipboard", icon: "📝", tip: "Put what is written in this file on the clipboard, to paste into a document or chat. (Copy, above, copies the file so you can paste it into a folder.)", action: () => copyTextFile(e) } : null,
    one && e.isDir ? { label: "Paste into this folder", icon: "📥", disabled: !clip, shortcut: "", action: () => ops.pasteInto(e.path) } : null,
    { label: "Duplicate", icon: "➕", shortcut: labelOf("file.duplicate"), disabled: searching, action: ops.duplicateSelection },
    ...otherPaneItems(),
    { separator: true },
    { label: one ? "Rename" : `Rename ${entries.length} items…`, icon: "✏️", shortcut: one ? labelOf("file.rename") : "", action: ops.renameSelection },
    { label: "Compress to zip", icon: "🗜️", disabled: searching, action: ops.zipSelection },
    { label: "Copy path", icon: "🔗", action: () => ops.copyPathOf(entries) },
    { label: "Copy path as a file:// address", icon: "🌐", tip: "Copy the location as a file:// web address (spaces become %20), the form browsers and some programs understand.", action: () => copyFileUrls(entries) },
    { separator: true },
    { label: "Move to Recycle Bin", icon: "🗑️", danger: true, shortcut: toGraveyard() ? "" : labelOf("file.trash"), action: ops.moveSelectionToBin },
    { label: "Bury (Rip)", icon: "🪦", danger: true, tip: "Move to the Rip graveyard instead of deleting. You can undo it, and bring it back later from Find & more → Graveyard. Rip Studio shares this graveyard.", shortcut: toGraveyard() ? `${del()}  or  ${buryKey()}` : buryKey(), action: ops.burySelection },
    { label: "Open Graveyard", icon: "🪦", tip: "Go to the Graveyard tool: see what you buried, restore it to where it came from, or delete it for good.", action: () => openPower("grave") },
    moreToolsItem(),
    { label: "Delete permanently…", danger: true, shortcut: labelOf("file.deleteForever"), action: ops.deleteForever },
    { separator: true },
    ...permissionItems(entries),
    { label: "More info…", icon: "🔍", shortcut: labelOf("file.moreInfo"), action: () => showMoreInfo(entries.map((x) => x.path)) },
    { label: "Properties", icon: "ℹ️", shortcut: labelOf("file.properties"), action: () => showProperties(entries.map((x) => x.path)) },
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
      { label: "Open Graveyard", icon: "🪦", tip: "Go to the Graveyard tool: see what you buried, restore it to where it came from, or delete it for good.", action: () => openPower("grave") },
      { separator: true },
      { label: "Select all", shortcut: labelOf("file.selectAll"), action: selectAll },
      { label: "Refresh", shortcut: labelOf("nav.refresh"), action: () => refresh() },
    ];
  }
  if (activePane().search) {
    return [
      { label: "Clear search", icon: "✕", action: clearSearch },
      { label: "Select all", shortcut: labelOf("file.selectAll"), action: selectAll },
      { separator: true },
      ...viewMenuItems(),
    ];
  }
  const here = currentPath();
  return [
    { label: "New folder", icon: "📁", shortcut: labelOf("file.newFolder"), action: ops.newFolder },
    { label: "New file", icon: "📄", shortcut: labelOf("file.newFile"), action: ops.newFile },
    { label: "New SQLite database", icon: "🗄️", tip: "Make a new, empty SQLite database file here. Open it in SQLite Studio, add it as a connection, or fill it with a sample database.", action: ops.newSqlite },
    { separator: true },
    { label: "Paste", icon: "📥", shortcut: labelOf("file.paste"), disabled: !state.clipboard, action: ops.paste },
    { label: "Select all", shortcut: labelOf("file.selectAll"), action: selectAll },
    { label: "Refresh", shortcut: labelOf("nav.refresh"), action: () => refresh() },
    { separator: true },
    { label: "Open terminal here", icon: "⌨️", shortcut: labelOf("terminal.here"), tip: "Show the terminal and move it to this folder.", action: () => emit("terminal-here", here) },
    { label: "Open this folder in Code editor", icon: "📝", action: () => openFolderInCode(here) },
    ...folderServeItems(here),
    { label: "Open Graveyard", icon: "🪦", tip: "Go to the Graveyard tool: see what you buried, restore it to where it came from, or delete it for good.", action: () => openPower("grave") },
    ...databaseStudioItems(),
    moreToolsItem(),
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

/** "Edit in Image Studio" / "Edit in Media Studio": one file opens to edit; several open the studio to apply one look to all. */
function studioMenuItems(entries) {
  const pics = entries.filter((x) => !x.isDir && isStudioPicture(x.name)).map((x) => x.path);
  const media = entries.filter((x) => !x.isDir && isStudioMedia(x.name)).map((x) => x.path);
  return [
    pics.length ? { label: pics.length > 1 ? `Edit ${pics.length} pictures in Image Studio` : "Edit in Image Studio", icon: "🎨", tip: pics.length > 1 ? "Choose a look (or a saved preset) once and apply it to every selected picture; each gets its own new copy." : "Change the light, colour and shape of this picture with sliders, then save a copy.", action: () => openPower("imagestudio", { paths: pics }) } : null,
    media.length ? { label: media.length > 1 ? `Edit ${media.length} files in Media Studio` : "Edit in Media Studio", icon: "🎬", tip: media.length > 1 ? "Choose the settings (or a saved preset) once and apply them to every selected song or video; each gets its own new copy." : "Trim, speed up, fade and clean up this song, recording or video, then save a copy.", action: () => openPower("mediastudio", { paths: media }) } : null,
  ];
}

/** Copy paths for an outside terminal. Windows has three kinds, each quoting (and spelling) paths its own way. */
function terminalCopyItems(entries) {
  if (state.platform !== "win32") {
    return [{ label: "Copy paths for Terminal", icon: "📋", tip: "Copy quoted paths to paste after a command in a terminal (the built-in Terminal or any other).", action: () => copyTerminalPaths(entries, "posix") }];
  }
  return [
    { label: "Copy paths for PowerShell", icon: "📋", tip: "Copy quoted paths to paste after a command in PowerShell (also inside Windows Terminal).", action: () => copyTerminalPaths(entries, "powershell") },
    { label: "Copy paths for Command Prompt", icon: "📋", tip: "Copy quoted paths to paste after a command in the Command Prompt (cmd).", action: () => copyTerminalPaths(entries, "cmd") },
    { label: "Copy paths for WSL (Linux)", icon: "🐧", tip: "Copy the paths as Linux sees them (C:\\Users becomes /mnt/c/Users) to paste in WSL Bash.", action: () => copyTerminalPaths(entries, "wsl") },
    { label: "Copy paths for Git Bash", icon: "📋", tip: "Copy the paths as Git Bash sees them (C:\\Users becomes /c/Users) to paste in Git Bash.", action: () => copyTerminalPaths(entries, "gitbash") },
  ];
}
