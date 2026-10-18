// Right-click menus and the View menu items (shared by the toolbar, the menus and the keyboard).
import { isStudioPicture } from "./imageStudio.js";
import { isStudioMedia } from "./mediaStudio.js";
import { isPlayableOrPlaylist } from "./mediacore.js";
import { openInMediaDeck } from "./playerDeck.js";
import { showMenu } from "./menus.js";
import { clearSearch, refresh, saveSettings } from "./nav.js";
import * as ops from "./ops.js";
import { canCompareData, showCompareData } from "./datacompare.js";
import { showProperties } from "./extras.js";
import { copyFileUrls, copyTerminalPaths, openInEditor } from "./fileurl.js";
import { showMoreInfo } from "./fileinfo.js";
import { invertSelection, selectAll } from "./selection.js";
import { activePane, currentPath, inTrash, isFolderView, left, right } from "./pane.js";
import { emit, state } from "./state.js";
import { openFolderInCode, openInCode } from "./code.js";
import { openPower } from "./power.js";
import { looksLikeText } from "./codeLang.js";
import { envFileMenuItems, sqliteMenuItems } from "./dbFiles.js";
import { cloneSqliteMenuItems } from "./dbClone.js";
import { macroSqliteMenuItems } from "./dbMacros.js";
import { importFileMenuItems } from "./dbStaging.js";
import { showOpenWith } from "./openwith.js";
import { folderServeItems, serveMenuItems } from "./serveActions.js";
import { showToolsDialog } from "./tools.js";
import { extensionOf, extractableEntries, parentOf } from "./util.js";
import { labelOf } from "./keymap.js";
import { openQuickLook } from "./quicklook.js";
import { canCopyImage, canCopyText, copyImageFile, copyTextFile } from "./clipfile.js";
import { canLock, canUnlock, lockEntries, unlockEntries } from "./vault.js";
import { permissionItems } from "./permsQuick.js";
import { quickMediaMenuItems } from "./mediaQuick.js";
import { databaseStudioItems, moreToolsItem } from "./toolLauncher.js";
import { openNewTab } from "./tabs.js";
import { TAG_DEFS, setTagForPaths, tagForPath } from "./tags.js";

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");
const del = () => (state.platform === "darwin" ? "⌘⌫" : "Del");
const buryKey = () => (state.platform === "darwin" ? "⌥⌫" : "Alt+Del");
const toGraveyard = () => state.settings.deleteTo === "graveyard";

function toggleColumn(colId) {
  const cur = Array.isArray(state.settings.columns) ? state.settings.columns : [];
  const next = cur.includes(colId) ? cur.filter((c) => c !== colId) : [...cur, colId];
  saveSettings({ columns: next });
}

function tagMenuItems(entries) {
  const paths = entries.map((x) => x.path).filter(Boolean);
  if (!paths.length) return [];
  const existing = paths.map((p) => tagForPath(p)?.id).filter(Boolean);
  const shared = existing.length === paths.length && existing.every((c) => c === existing[0]) ? existing[0] : "";
  const items = TAG_DEFS.map((t) => ({
    label: `Tag: ${t.label}`,
    icon: "🏷️",
    checked: shared === t.id,
    tip: `Assign the ${t.label} color tag to the selected item${paths.length === 1 ? "" : "s"} so you can spot or filter them quickly.`,
    action: () => setTagForPaths(paths, shared === t.id ? "" : t.id),
  }));
  if (existing.length > 0) {
    items.push({
      label: "Clear color tag",
      icon: "✕",
      tip: "Remove the color tag from the selected files and folders.",
      action: () => setTagForPaths(paths, ""),
    });
  }
  return items;
}

export function viewMenuItems() {
  const s = state.settings;
  const cols = Array.isArray(s.columns) ? s.columns : [];
  const groupBy = s.groupBy || "none";
  const view = (v, label) => ({ label, checked: s.view === v, shortcut: labelOf(`view.${v}`), action: () => saveSettings({ view: v }) });
  const sort = (by, label) => ({ label, checked: s.sortBy === by, action: () => saveSettings({ sortBy: by }) });
  const group = (g, label, tip) => ({ label: `Group by: ${label}`, checked: groupBy === g, tip, action: () => saveSettings({ groupBy: g }) });
  return [
    { header: "View as" },
    view("details", "Details"),
    view("list", "List"),
    view("icons", "Icons"),
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
    { header: "Group by" },
    group("none", "None", "Show all files and folders in one continuous list without section headers."),
    group("kind", "Kind", "Group items under section headers for Folders and each file type."),
    group("date", "Date", "Group items by when they were modified: Today, Yesterday, Earlier this week, Earlier this month, or Older."),
    group("size", "Size", "Group files by size bucket: Empty, Tiny (< 10 KB), Small (< 1 MB), Medium (< 100 MB), or Large (> 100 MB)."),
    { separator: true },
    { header: "Details columns" },
    { label: "Column: Extension", checked: cols.includes("ext"), tip: "Show or hide the file extension column in the Details view.", action: () => toggleColumn("ext") },
    { label: "Column: Permissions", checked: cols.includes("permissions"), tip: "Show or hide the rwx permissions column in the Details view.", action: () => toggleColumn("permissions") },
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
  const extractable = extractableEntries(entries);
  const clip = !!state.clipboard;
  const convertible = entries.length > 0;
  return [
    one ? { label: "Open", icon: e.isDir ? "📂" : "📄", shortcut: "Enter", action: () => ops.openEntry(e) } : null,
    one && e.isDir ? { label: "Open in new tab", icon: "🗂️", tip: "Open this folder in a new folder tab at the top of the file list.", action: () => openNewTab(e.path) } : null,
    one ? { label: "Quick Look", icon: "👁️", shortcut: "Space", tip: "Look at a picture, play a sound or video, read a text file or see a document here, without opening another program.", action: () => openQuickLook(e) } : null,
    one && searching ? { label: "Open containing folder", icon: "📁", action: () => ops.goToContaining(e) } : null,
    ...studioMenuItems(entries),
    one && !e.isDir && e.kind === "image" ? { label: "Read QR code", icon: "🔳", tip: "Look for a QR code in this picture and show what it says.", action: () => openPower("qr", { read: e.path, name: e.name }) } : null,
    one && !e.isDir && looksLikeText(e.name) && e.size <= 20000 ? { label: "Make a QR code from this text", icon: "🔳", tip: "Put the text of this file in a QR code (up to a few thousand characters).", action: () => openPower("qr", { makeFromFile: e.path }) } : null,
    one && !e.isDir && looksLikeText(e.name) ? { label: "Edit in Code editor", icon: "📝", shortcut: labelOf("file.editInCode"), action: () => openInCode(e.path) } : null,
    one && !e.isDir && looksLikeText(e.name) ? { label: "Open in your editor", icon: "🧑‍💻", tip: "Open this file in the code editor chosen in Settings (VS Code, Sublime Text, WebStorm or IntelliJ IDEA).", action: () => openInEditor(e) } : null,
    canCompareData(entries) ? { label: "Compare data files…", icon: "⚖️", tip: "Compare these two JSON, YAML or TOML files by what they say, ignoring key order and formatting, and list what differs.", action: () => showCompareData(entries) } : null,
    one ? { label: e.isDir ? "Open terminal here" : "Open terminal in this folder", icon: "⌨️", shortcut: labelOf("terminal.here"), tip: "Show the terminal and move it to this folder.", action: () => emit("terminal-here", e.isDir ? e.path : parentOf(e.path, state.sep)) } : null,
    one && !e.isDir && (e.program || (state.cliUtilsDir && parentOf(e.path, state.sep) === state.cliUtilsDir) || (state.cliAppsDir && parentOf(e.path, state.sep) === state.cliAppsDir)) && /^[A-Za-z0-9._-]+$/.test(e.name) ? { label: `Put ${state.platform === "win32" ? ".\\" : "./"}${e.name} in Terminal`, icon: "⌨️", tip: "Open the terminal in this file's folder and type ./filename so you can add arguments or press Enter.", action: () => emit("terminal-run-in", { folder: parentOf(e.path, state.sep), command: `${state.platform === "win32" ? ".\\" : "./"}${e.name} `, submit: false }) } : null,
    one && !e.isDir && (e.program || (state.cliUtilsDir && parentOf(e.path, state.sep) === state.cliUtilsDir) || (state.cliAppsDir && parentOf(e.path, state.sep) === state.cliAppsDir)) && /^[A-Za-z0-9._-]+$/.test(e.name) ? { label: `Run ${state.platform === "win32" ? ".\\" : "./"}${e.name} in Terminal`, icon: "▶️", tip: "Open the terminal in this file's folder and run ./filename right away.", action: () => emit("terminal-run-in", { folder: parentOf(e.path, state.sep), command: `${state.platform === "win32" ? ".\\" : "./"}${e.name}`, submit: true }) } : null,
    { label: "Insert paths in Terminal", icon: "⌨️", tip: "Insert the selected files and folders as shell-quoted arguments. Nothing runs until you press Enter.", action: () => emit("terminal-insert-paths", entries.map((entry) => entry.path)) },
    one && e.isDir ? { label: "Open folder in Code editor", icon: "📝", shortcut: labelOf("file.editInCode"), action: () => openFolderInCode(e.path) } : null,
    one && e.isDir && !searching ? { label: "New SQLite database in this folder", icon: "🗄️", tip: "Make a new, empty SQLite database file inside this folder, open that folder, and select it to rename or open in SQLite Studio.", action: () => ops.newSqliteIn(e.path) } : null,
    one && e.isDir ? { label: "Code statistics…", icon: "📊", action: () => openPower("dev", { root: e.path, section: "stats" }) } : null,
    ...serveMenuItems(entries),
    entries.some((x) => !x.isDir) ? { label: "Open with…", icon: "🧩", shortcut: labelOf("file.openWith"), action: () => showOpenWith(entries) } : null,
    ...sqliteMenuItems(entries),
    ...cloneSqliteMenuItems(entries),
    ...macroSqliteMenuItems(entries),
    ...envFileMenuItems(entries),
    ...importFileMenuItems(entries),
    extractable.length > 0 ? { label: extractable.length === 1 ? "Extract here" : `Extract here (${extractable.length} items)`, icon: "📦", shortcut: labelOf("file.extract"), disabled: searching, tip: "Unpack the selected compressed files or archives into new folders or files right here, without overwriting anything.", action: () => ops.extractSelection(entries) } : null,
    one ? { label: `Show in ${state.fmName === "your file manager" ? "file manager" : state.fmName}`, icon: "🔎", shortcut: labelOf("file.reveal"), action: () => ops.revealEntry(e) } : null,
    one && e.isDir ? { label: ops.isFavorite(e.path) ? "Remove from Favorites" : "Add to Favorites", icon: "⭐", shortcut: labelOf("file.toggleFavorite"), action: () => ops.toggleFavorite(e.path) } : null,
    convertible ? { label: "Convert or process…", icon: "🧰", shortcut: labelOf("file.convert"), action: showToolsDialog } : null,
    ...quickMediaMenuItems(entries),
    canLock(entries) ? { label: "Encrypt…", icon: "🔒", shortcut: labelOf("file.lock"), action: () => lockEntries(entries) } : null,
    canUnlock(entries) ? { label: "Decrypt…", icon: "🔓", shortcut: labelOf("file.lock"), action: () => unlockEntries(entries) } : null,
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
    { label: "Compress to zip", icon: "🗜️", shortcut: labelOf("file.zip"), disabled: searching, action: ops.zipSelection },
    { label: "Copy path", icon: "🔗", shortcut: labelOf("file.copyPath"), action: () => ops.copyPathOf(entries) },
    { label: "Copy path as a file:// address", icon: "🌐", shortcut: labelOf("file.copyFileUrl"), tip: "Copy the location as a file:// web address (spaces become %20), the form browsers and some programs understand.", action: () => copyFileUrls(entries) },
    { separator: true },
    { label: "Move to Recycle Bin", icon: "🗑️", danger: true, shortcut: toGraveyard() ? "" : labelOf("file.trash"), action: ops.moveSelectionToBin },
    { label: "Bury (Rip)", icon: "🪦", danger: true, tip: "Move to the Rip graveyard instead of deleting. You can undo it, and bring it back later from Find & more → Graveyard. Rip Studio shares this graveyard.", shortcut: toGraveyard() ? `${del()}  or  ${buryKey()}` : buryKey(), action: ops.burySelection },
    { label: "Open Graveyard", icon: "🪦", tip: "Go to the Graveyard tool: see what you buried, restore it to where it came from, or delete it for good.", action: () => openPower("grave") },
    moreToolsItem(),
    { label: "Delete permanently…", danger: true, shortcut: labelOf("file.deleteForever"), action: ops.deleteForever },
    { separator: true },
    ...tagMenuItems(entries),
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
      { label: "Invert selection", shortcut: labelOf("file.invertSelection"), action: () => invertSelection() },
      { label: "Refresh", shortcut: labelOf("nav.refresh"), action: () => refresh() },
    ];
  }
  if (activePane().search) {
    return [
      { label: "Clear search", icon: "✕", action: clearSearch },
      { label: "Select all", shortcut: labelOf("file.selectAll"), action: selectAll },
      { label: "Invert selection", shortcut: labelOf("file.invertSelection"), action: () => invertSelection() },
      { separator: true },
      ...viewMenuItems(),
    ];
  }
  const here = currentPath();
  return [
    { label: "New folder", icon: "📁", shortcut: labelOf("file.newFolder"), action: ops.newFolder },
    { label: "New file", icon: "📄", shortcut: labelOf("file.newFile"), action: ops.newFile },
    { label: "New SQLite database", icon: "🗄️", shortcut: labelOf("file.newSqlite"), tip: "Make a new, empty SQLite database file here. Open it in SQLite Studio, add it as a connection, or fill it with a sample database.", action: ops.newSqlite },
    { label: `New dated folder (${ops.localDateStamp()})`, icon: "📅", shortcut: labelOf("file.newDatedFolder"), tip: "Make a new folder here named with today's YYYY-MM-DD date, ready for organizing daily work or backups.", action: () => ops.newDatedFolder() },
    { label: `New dated note (${ops.localDateStamp()}.md)`, icon: "📝", shortcut: labelOf("file.newDatedNote"), tip: "Make a new Markdown note here named with today's YYYY-MM-DD.md date.", action: () => ops.newDatedNote() },
    { separator: true },
    { label: "Paste", icon: "📥", shortcut: labelOf("file.paste"), disabled: !state.clipboard, action: ops.paste },
    { label: "Select all", shortcut: labelOf("file.selectAll"), action: selectAll },
    { label: "Invert selection", shortcut: labelOf("file.invertSelection"), action: () => invertSelection() },
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
  const playable = entries.filter((x) => !x.isDir && isPlayableOrPlaylist(x.name));
  return [
    playable.length ? { label: playable.length > 1 ? `Play ${playable.length} tracks in Media Deck` : "Play in Media Deck", icon: "🎛️", tip: "Open the Media Deck with a 10-band equalizer, spectrum and radial visualizers, M3U playlist and karaoke lyrics.", action: () => openInMediaDeck({ entries: playable, enqueue: false }) } : null,
    playable.length ? { label: playable.length > 1 ? `Enqueue ${playable.length} tracks in Media Deck` : "Enqueue in Media Deck", icon: "➕", tip: "Add the selected tracks or M3U playlist to the end of the Media Deck queue.", action: () => openInMediaDeck({ entries: playable, enqueue: true }) } : null,
    pics.length ? { label: pics.length > 1 ? `Edit ${pics.length} pictures in Image Studio` : "Edit in Image Studio", icon: "🎨", tip: pics.length > 1 ? "Choose a look (or a saved preset) once and apply it to every selected picture; each gets its own new copy." : "Change the light, color and shape of this picture with sliders, then save a copy.", action: () => openPower("imagestudio", { paths: pics }) } : null,
    pics.length === 1 ? { label: "Paint in Paint Studio", icon: "🖌️", tip: "Open this picture on the canvas in Paint Studio (Chroma Studio Pro) to draw, paint, add layers, apply filters or trace over it.", action: () => openPower("paint", { path: pics[0] }) } : null,
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
