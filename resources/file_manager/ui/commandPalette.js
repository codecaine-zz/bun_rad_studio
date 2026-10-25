// Universal Command Palette & Quick-Jump Omnibar (Mod+Shift+P / Mod+P / #viewbar-palette).
// Searches across File Manager actions, Places, Favorites, Drives, Open Tabs, Recent files, current folder entries,
// all Power Tools & Studios, RAD File Templates, Color Tag filters, and View/Theme settings.
import { openCalendarDialog } from "./chrome.js";
import { openFolderInCode } from "./code.js";
import { openDialog } from "./dialogs.js";
import { $, clear, h, iconForEntry } from "./dom.js";
import { swapDualPanes } from "./dual.js";
import { showHelp, showSettings } from "./extras.js";
import { labelOf } from "./keymap.js";
import { calculateFolderSizes, goTo, saveSettings, showTrash, visibleEntries } from "./nav.js";
import { showOperationHistory } from "./opHistory.js";
import * as ops from "./ops.js";
import { activePane, currentPath, left } from "./pane.js";
import { listPowerTabs, openPower } from "./power.js";
import { KIND_CHIP_DEFS, RAD_FILE_TEMPLATES, focusQuickFilter, newFromTemplate, setKindFilter, showNewTemplateDialog, showSelectByPatternDialog } from "./quickbar.js";
import { invertSelection, selectAll, selectOnly, selectSameKindOrExt } from "./selection.js";
import { showShortcutsDialog } from "./shortcutsDialog.js";
import { emit, on, state } from "./state.js";
import { closeTab, duplicateTab, openNewTab, reopenClosedTab, switchTab } from "./tabs.js";
import { TAG_DEFS } from "./tags.js";
import { showToolsDialog } from "./tools.js";
import { baseName } from "./util.js";
import { lockSelection } from "./vault.js";

export const PALETTE_CATEGORIES = [
  { id: "all", label: "All", icon: "⚡" },
  { id: "actions", label: "Actions", icon: "⌘" },
  { id: "places", label: "Places & Files", icon: "📂" },
  { id: "tools", label: "Tools & Studios", icon: "🧰" },
  { id: "templates", label: "Templates", icon: "✨" },
  { id: "view", label: "View & Themes", icon: "🎨" },
];

const MAX_RECENT_COMMANDS = 15;

function recordRecentCommand(id) {
  if (!id) return;
  const list = Array.isArray(state.recentCommands) ? state.recentCommands : [];
  state.recentCommands = [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT_COMMANDS);
}

/** Builds the live searchable catalog of commands, places, files, tools, templates, and view options. */
export function buildPaletteCatalog() {
  const items = [];
  const add = (item) => items.push(item);
  const inFiles = (fn) => {
    if (state.workspace === "home" || state.workspace === "tools") emit("workspace-go", "files");
    return fn();
  };

  // 1. Core File & Folder Actions
  add({ id: "act.newTemplateDialog", category: "actions", icon: "✨", title: "New file from template…", subtitle: "Create a starter Markdown, TypeScript, Python, HTML, JSON, SQL, or config file", shortcut: labelOf("file.newTemplate"), keywords: "template starter boilerplate new file create code", run: () => inFiles(() => showNewTemplateDialog()) });
  add({ id: "act.newFolder", category: "actions", icon: "📁", title: "New folder", subtitle: "Create a new folder in the current location", shortcut: labelOf("file.newFolder"), keywords: "mkdir directory create folder", run: () => inFiles(() => ops.newFolder()) });
  add({ id: "act.newFolderWithSelection", category: "actions", icon: "📁", title: "New folder with selection", subtitle: "Group the selected files and folders into a newly created folder", shortcut: labelOf("file.newFolderWithSelection"), keywords: "group folderize new folder selection move", run: () => inFiles(() => ops.newFolderWithSelection()) });
  add({ id: "act.newFile", category: "actions", icon: "📄", title: "New empty file", subtitle: "Create a blank text file in the current location", shortcut: labelOf("file.newFile"), keywords: "touch create file empty", run: () => inFiles(() => ops.newFile()) });
  add({ id: "act.pasteTextAsFile", category: "actions", icon: "📋", title: "Paste clipboard text as new file", subtitle: "Create a new file from clipboard text (auto-detects JSON, Markdown, SQL, HTML, TypeScript, CSV, or text)", shortcut: labelOf("file.pasteTextAsFile"), keywords: "paste clipboard text snippet file create", run: () => inFiles(() => ops.pasteTextAsFile()) });
  add({ id: "act.newSqlite", category: "actions", icon: "🪶", title: "New SQLite database", subtitle: "Create a new SQLite database file and open in SQLite Studio", shortcut: labelOf("file.newSqlite"), keywords: "sqlite db database create", run: () => inFiles(() => ops.newSqlite()) });
  add({ id: "act.newDatedFolder", category: "actions", icon: "📅", title: `New dated folder (${ops.localDateStamp()})`, subtitle: "Create a folder named with today's YYYY-MM-DD date", shortcut: labelOf("file.newDatedFolder"), keywords: "date today folder daily", run: () => inFiles(() => ops.newDatedFolder()) });
  add({ id: "act.newDatedNote", category: "actions", icon: "📝", title: `New dated note (${ops.localDateStamp()}.md)`, subtitle: "Create a Markdown note named with today's YYYY-MM-DD date", shortcut: labelOf("file.newDatedNote"), keywords: "note markdown journal daily today", run: () => inFiles(() => ops.newDatedNote()) });
  add({ id: "act.quickFilter", category: "actions", icon: "⚡", title: "Filter items in current folder", subtitle: "Focus the live instant folder filter bar", keywords: "filter narrow search folder quickbar", run: () => inFiles(() => focusQuickFilter()) });
  add({ id: "act.calculateFolderSizes", category: "actions", icon: "📐", title: "Calculate folder sizes", subtitle: "Measure total byte sizes and file counts for folders in this view", shortcut: labelOf("view.folderSizes"), keywords: "folder size bytes calculate measure disk usage", run: () => inFiles(() => calculateFolderSizes(activePane())) });
  add({ id: "act.openInCode", category: "actions", icon: "📝", title: "Open current folder in Code editor", subtitle: "Open the built-in multi-tab Code editor on this folder", shortcut: labelOf("file.editInCode"), keywords: "code editor ide edit folder", run: () => { const p = currentPath() || state.home; if (p) openFolderInCode(p); } });
  add({ id: "act.toggleTerminal", category: "actions", icon: "⌨️", title: "Toggle built-in Terminal", subtitle: "Show or hide the integrated terminal panel", shortcut: labelOf("terminal.toggle"), keywords: "terminal shell console bash zsh", run: () => emit("toggle-terminal") });
  add({ id: "act.terminalHere", category: "actions", icon: "⌨️", title: "Open Terminal in current folder", subtitle: "Show the terminal and cd to the active folder", shortcut: labelOf("terminal.here"), keywords: "terminal here cd shell folder", run: () => emit("terminal-here", currentPath() || state.home) });
  add({ id: "act.newTab", category: "actions", icon: "🗂️", title: "New folder tab", subtitle: "Open a new folder tab in the tab bar", shortcut: labelOf("nav.newTab"), keywords: "tab new open folder", run: () => inFiles(() => openNewTab()) });
  add({ id: "act.duplicateTab", category: "actions", icon: "🗂️", title: "Duplicate current folder tab", subtitle: "Clone the active folder tab", shortcut: labelOf("nav.duplicateTab"), keywords: "tab duplicate clone", run: () => inFiles(() => duplicateTab()) });
  add({ id: "act.closeTab", category: "actions", icon: "✕", title: "Close current folder tab", subtitle: "Close the active folder tab", shortcut: labelOf("nav.closeTab"), keywords: "tab close", run: () => inFiles(() => closeTab()) });
  add({ id: "act.reopenTab", category: "actions", icon: "↺", title: "Reopen closed folder tab", subtitle: "Restore the most recently closed folder tab", shortcut: labelOf("nav.reopenTab"), keywords: "tab reopen restore closed undo", run: () => inFiles(() => reopenClosedTab()) });
  add({ id: "act.swapDualPanes", category: "actions", icon: "⇌", title: "Dual view: Swap left and right pane folders", subtitle: "Exchange the folders open in the left and right panes", keywords: "dual pane swap exchange left right", run: () => { if (state.workspace !== "dual") emit("workspace-go", "dual"); void swapDualPanes(); } });
  add({ id: "act.toggleFavorite", category: "actions", icon: "⭐", title: "Pin or unpin current folder in Favorites", subtitle: currentPath() || "Current folder", shortcut: labelOf("file.toggleFavorite"), keywords: "favorite pin star bookmark folder", run: () => { const p = currentPath(); if (p) void ops.toggleFavorite(p); } });
  add({ id: "act.copyFolderPath", category: "actions", icon: "🔗", title: "Copy current folder path", subtitle: currentPath() || "", shortcut: labelOf("file.copyPath"), keywords: "copy path clipboard address pwd", run: () => { const p = currentPath(); if (p) void ops.copyPathOf([{ path: p }]); } });
  add({ id: "act.copyNames", category: "actions", icon: "🏷️", title: "Copy selected filenames only", subtitle: "Copy only the base file/folder names without directory paths", shortcut: labelOf("file.copyNames"), keywords: "copy filename name base clipboard", run: () => inFiles(() => ops.copyNamesOf()) });
  add({ id: "act.convert", category: "actions", icon: "🧰", title: "Convert or batch process files…", subtitle: "Convert pictures, audio, video, and documents", shortcut: labelOf("file.convert"), keywords: "convert batch ffmpeg imagemagick shrink resize", run: () => showToolsDialog() });
  add({ id: "act.lock", category: "actions", icon: "🔒", title: "Encrypt or decrypt selected items (Lock)", subtitle: "Password-protect files or unlock .radenc files", shortcut: labelOf("file.lock"), keywords: "encrypt decrypt lock password vault security", run: () => void lockSelection() });
  add({ id: "act.rename", category: "actions", icon: "✏️", title: "Rename / Bulk Rename selection", subtitle: "Rename one item inline or batch rename multiple items with preview", shortcut: labelOf("file.rename"), keywords: "rename batch bulk", run: () => void ops.renameSelection() });
  add({ id: "act.zip", category: "actions", icon: "🗜️", title: "Compress selection to .zip", subtitle: "Create a zip archive from the selected items", shortcut: labelOf("file.zip"), keywords: "zip archive compress pack", run: () => void ops.zipSelection() });
  add({ id: "act.extract", category: "actions", icon: "📦", title: "Extract selected archive here", subtitle: "Unpack .zip, .tar.gz, .7z, or compressed files", shortcut: labelOf("file.extract"), keywords: "unzip extract unpack archive", run: () => void ops.extractSelection() });
  add({ id: "act.selectAll", category: "actions", icon: "☑️", title: "Select all items in folder", subtitle: "Select every visible item in the active pane", shortcut: labelOf("file.selectAll"), keywords: "select all", run: () => inFiles(() => selectAll()) });
  add({ id: "act.selectByPattern", category: "actions", icon: "🎯", title: "Select items by pattern or criteria…", subtitle: "Select or deselect items matching a glob (*.ts), size (size:>1mb), date (date:today), or regex", shortcut: labelOf("file.selectByPattern"), keywords: "select pattern glob wildcard criteria filter regex", run: () => inFiles(() => showSelectByPatternDialog()) });
  add({ id: "act.selectSameType", category: "actions", icon: "☑️", title: "Select all items of same type / extension", subtitle: "Select every item in this folder sharing the selected extension or folder kind", keywords: "select same extension type kind similar", run: () => inFiles(() => selectSameKindOrExt(activePane())) });
  add({ id: "act.invertSelection", category: "actions", icon: "🔄", title: "Invert selection", subtitle: "Flip which items are selected in the active pane", shortcut: labelOf("file.invertSelection"), keywords: "invert selection flip", run: () => inFiles(() => invertSelection()) });
  add({ id: "act.undo", category: "actions", icon: "↶", title: "Undo last file operation", subtitle: state.undoStack.at(-1)?.label ? `Undo: ${state.undoStack.at(-1).label}` : "Undo the most recent copy, move, rename, or delete", shortcut: labelOf("file.undo"), keywords: "undo revert restore", run: () => void ops.undo() });
  add({ id: "act.activity", category: "actions", icon: "🕘", title: "Activity & Operation History", subtitle: "Inspect past file transfers, renames, and jobs", shortcut: labelOf("app.activity"), keywords: "activity history log jobs operations", run: () => void showOperationHistory() });
  add({ id: "act.calendar", category: "actions", icon: "🗓️", title: "Calendar, World Clocks & Timestamp Converter", subtitle: "Interactive calendar, world time zones, and Unix epoch converter", keywords: "calendar clock time date epoch timestamp", run: () => openCalendarDialog() });
  add({ id: "act.settings", category: "actions", icon: "⚙️", title: "Settings", subtitle: "Configure appearance, behavior, editors, and defaults", shortcut: labelOf("app.settings"), keywords: "settings preferences options config", run: () => showSettings() });
  add({ id: "act.shortcuts", category: "actions", icon: "⌨️", title: "Keyboard Shortcuts…", subtitle: "View and customize every keyboard shortcut", shortcut: labelOf("app.shortcuts"), keywords: "keyboard shortcuts hotkeys keybindings", run: () => void showShortcutsDialog() });
  add({ id: "act.help", category: "actions", icon: "❓", title: "Help & User Guide", subtitle: "Overview of features and keyboard shortcuts", shortcut: labelOf("app.help"), keywords: "help documentation guide manual", run: () => showHelp() });

  // 2. RAD File Templates
  for (const tpl of RAD_FILE_TEMPLATES) {
    add({
      id: `tpl.create.${tpl.id}`,
      category: "templates",
      icon: tpl.icon,
      title: `Template: ${tpl.label} (${tpl.defaultName})`,
      subtitle: tpl.desc,
      keywords: `template new create ${tpl.label} ${tpl.defaultName} ${tpl.category}`,
      run: () => inFiles(() => newFromTemplate(tpl.id, "", { openInEditor: false })),
    });
  }

  // 3. Places, Favorites, Drives, Open Tabs, Recent Files & Current Folder Entries
  for (const favPath of state.settings.favorites ?? []) {
    const customName = state.settings.favoriteNames?.[favPath] || baseName(favPath, state.sep) || favPath;
    add({
      id: `place.fav.${favPath}`,
      category: "places",
      icon: "⭐",
      title: `Favorite: ${customName}`,
      subtitle: favPath,
      keywords: `favorite pinned star folder ${customName} ${favPath}`,
      run: () => inFiles(() => goTo(favPath)),
    });
  }
  for (const pl of state.places ?? []) {
    add({
      id: `place.std.${pl.path}`,
      category: "places",
      icon: pl.icon || "📁",
      title: `Go to ${pl.name}`,
      subtitle: pl.path,
      keywords: `place folder go ${pl.name} ${pl.path}`,
      run: () => inFiles(() => goTo(pl.path)),
    });
  }
  for (const d of state.drives ?? []) {
    add({
      id: `place.drive.${d.path}`,
      category: "places",
      icon: d.icon || "💽",
      title: `Drive: ${d.name}`,
      subtitle: d.path,
      keywords: `drive disk volume ${d.name} ${d.path}`,
      run: () => inFiles(() => goTo(d.path)),
    });
  }
  add({
    id: "place.trash",
    category: "places",
    icon: "🗑️",
    title: "Go to Recycle Bin",
    subtitle: `${state.trashCount || 0} item${state.trashCount === 1 ? "" : "s"} in the Recycle Bin`,
    keywords: "trash recycle bin deleted",
    run: () => inFiles(() => showTrash()),
  });
  for (const tab of state.tabs ?? []) {
    if (tab.location?.kind === "folder" && tab.location.path) {
      const name = baseName(tab.location.path, state.sep) || tab.location.path;
      add({
        id: `place.tab.${tab.id}`,
        category: "places",
        icon: "🗂️",
        title: `Switch to Tab: ${name}`,
        subtitle: tab.location.path,
        keywords: `tab switch ${name} ${tab.location.path}`,
        run: () => inFiles(() => switchTab(tab.id)),
      });
    }
  }
  for (const rec of (state.settings.recents ?? []).slice(0, 12)) {
    const name = baseName(rec.path, state.sep) || rec.path;
    add({
      id: `place.recent.${rec.path}`,
      category: "places",
      icon: "🕘",
      title: `Recent: ${name}`,
      subtitle: rec.path,
      keywords: `recent file open ${name} ${rec.path}`,
      run: () => inFiles(() => ops.openPath(rec.path)),
    });
  }
  for (const entry of visibleEntries(left).slice(0, 60)) {
    add({
      id: `entry.${entry.path}`,
      category: "places",
      icon: iconForEntry(entry),
      title: entry.isDir ? `Open folder: ${entry.name}` : `Open file: ${entry.name}`,
      subtitle: entry.path,
      keywords: `${entry.name} ${entry.label || ""} ${entry.isDir ? "folder directory" : "file"}`,
      run: () => inFiles(() => {
        if (entry.isDir) return goTo(entry.path);
        selectOnly(entry.path, left);
        return ops.openEntry(entry);
      }),
    });
  }

  // 4. Power Tools & Studios
  for (const tool of listPowerTabs()) {
    add({
      id: `tool.${tool.id}`,
      category: "tools",
      icon: tool.icon || "🧰",
      title: `Tool: ${tool.label}`,
      subtitle: `${tool.groupLabel} — ${tool.tip}`,
      keywords: `tool studio app power ${tool.id} ${tool.label} ${tool.groupLabel} ${tool.tip}`,
      run: () => openPower(tool.id),
    });
  }

  // 5. View, Workspace, Density, Grouping, Kind Filters, Color Tags & Themes
  add({ id: "view.ws.files", category: "view", icon: "🗂️", title: "Workspace: Files view", subtitle: "Browse files and folders", shortcut: "Alt+1", keywords: "workspace files view", run: () => emit("workspace-go", "files") });
  add({ id: "view.ws.home", category: "view", icon: "🏠", title: "Workspace: Home dashboard", subtitle: "Quick actions, pinned folders, recent files, and all tools", shortcut: "Alt+2", keywords: "workspace home start dashboard", run: () => emit("workspace-go", "home") });
  add({ id: "view.ws.tools", category: "view", icon: "🧰", title: "Workspace: Tools view", subtitle: "Full-window Power tools and studios", shortcut: "Alt+3", keywords: "workspace tools power", run: () => emit("workspace-go", "tools") });
  add({ id: "view.ws.split", category: "view", icon: "◫", title: "Workspace: Split view (Files + Tool)", subtitle: "Browse files alongside any Power tool or studio", shortcut: "Alt+4", keywords: "workspace split side by side", run: () => emit("workspace-go", "split") });
  add({ id: "view.ws.dual", category: "view", icon: "♊", title: "Workspace: Dual-pane commander view", subtitle: "Two independent folder panes side by side (F5 copy, F6 move)", shortcut: "Alt+5", keywords: "workspace dual two panes commander", run: () => emit("workspace-go", "dual") });
  add({ id: "view.layout.details", category: "view", icon: "☰", title: "Layout: Details view", subtitle: "Columns for Name, Date modified, Type, and Size", shortcut: labelOf("view.details"), keywords: "view details table columns", run: () => saveSettings({ view: "details" }) });
  add({ id: "view.layout.list", category: "view", icon: "☷", title: "Layout: Compact List view", subtitle: "Multi-column compact list of names", shortcut: labelOf("view.list"), keywords: "view list compact", run: () => saveSettings({ view: "list" }) });
  add({ id: "view.layout.icons", category: "view", icon: "▦", title: "Layout: Icons grid view", subtitle: "Grid of large file and folder thumbnails", shortcut: labelOf("view.icons"), keywords: "view icons grid thumbnails", run: () => saveSettings({ view: "icons" }) });

  add({ id: "view.density.compact", category: "view", icon: "↕️", title: "Row Density: Compact", subtitle: "Fit more rows on screen with tighter vertical spacing", keywords: "density compact tight rows", run: () => saveSettings({ rowDensity: "compact" }) });
  add({ id: "view.density.comfortable", category: "view", icon: "↕️", title: "Row Density: Comfortable (Default)", subtitle: "Balanced standard spacing for file rows", keywords: "density comfortable normal default rows", run: () => saveSettings({ rowDensity: "comfortable" }) });
  add({ id: "view.density.spacious", category: "view", icon: "↕️", title: "Row Density: Spacious", subtitle: "Generous row height for high readability", keywords: "density spacious large tall rows", run: () => saveSettings({ rowDensity: "spacious" }) });

  add({ id: "view.group.none", category: "view", icon: "📑", title: "Group by: None", subtitle: "Show all items in a single continuous list", keywords: "group none ungrouped", run: () => saveSettings({ groupBy: "none" }) });
  add({ id: "view.group.kind", category: "view", icon: "📑", title: "Group by: Kind", subtitle: "Group items under section headers by file type", keywords: "group kind type category", run: () => saveSettings({ groupBy: "kind" }) });
  add({ id: "view.group.date", category: "view", icon: "📑", title: "Group by: Date modified", subtitle: "Group items into Today, Yesterday, Earlier this week, and Older", keywords: "group date time modified", run: () => saveSettings({ groupBy: "date" }) });
  add({ id: "view.group.size", category: "view", icon: "📑", title: "Group by: Size", subtitle: "Group files into Tiny, Small, Medium, and Large buckets", keywords: "group size bytes", run: () => saveSettings({ groupBy: "size" }) });

  for (const chip of KIND_CHIP_DEFS) {
    add({
      id: `view.kind.${chip.id}`,
      category: "view",
      icon: chip.icon,
      title: `Filter folder by kind: ${chip.label}`,
      subtitle: chip.tip,
      keywords: `filter kind chip ${chip.label}`,
      run: () => inFiles(() => setKindFilter(chip.id)),
    });
  }
  for (const tag of TAG_DEFS) {
    add({
      id: `view.tag.${tag.id}`,
      category: "view",
      icon: "🏷️",
      title: `Filter by Color Tag: ${tag.label}`,
      subtitle: `Show only items tagged ${tag.label} (or clear if already active)`,
      keywords: `tag color filter #${tag.id} ${tag.label}`,
      run: () => inFiles(() => {
        state.tagFilter = state.tagFilter === tag.id ? "" : tag.id;
        emit("view");
      }),
    });
  }
  add({ id: "view.hidden", category: "view", icon: "👁️", title: "Toggle hidden files (dotfiles)", subtitle: state.settings.showHidden ? "Currently showing hidden files" : "Currently hiding hidden files", shortcut: labelOf("view.hidden"), keywords: "hidden dotfiles show hide", run: () => saveSettings({ showHidden: !state.settings.showHidden }) });
  add({ id: "view.info", category: "view", icon: "ℹ️", title: "Toggle Details side panel", subtitle: "Show or hide the inspector panel on the right", shortcut: labelOf("view.info"), keywords: "details info inspector panel sidebar", run: () => emit("toggle-info") });
  add({ id: "view.themes", category: "view", icon: "🎨", title: "Theme Gallery & Studio…", subtitle: "Browse all themes, atmospheric shaders, and visual presets", shortcut: labelOf("app.themes"), keywords: "theme gallery colors dark light shaders fx", run: () => emit("theme-picker") });
  add({ id: "view.randomTheme", category: "view", icon: "🎲", title: "Quick Random Theme", subtitle: "Apply a random theme immediately", shortcut: labelOf("app.randomTheme"), keywords: "random theme shuffle color", run: () => emit("theme-random", { mode: "any" }) });
  add({ id: "view.randomUltraTheme", category: "view", icon: "⚡", title: "Quick Random Ultra / God-Mode Theme", subtitle: "Apply a random flagship Ultra / God-Mode theme with atmospheric FX", shortcut: labelOf("app.randomUltraTheme"), keywords: "random ultra godmode theme fx", run: () => emit("theme-random", { mode: "ultra" }) });
  add({ id: "view.toggleFx", category: "view", icon: "✨", title: "Toggle Theme Animations & FX", subtitle: "Turn atmospheric and UI element shaders on or off", shortcut: labelOf("app.toggleThemeFx"), keywords: "toggle fx animations shaders performance", run: () => emit("theme-toggle-fx", {}) });

  return items;
}

/** Scores and filters catalog items for a query and active category tab. */
export function filterPaletteItems(catalog, rawQuery = "", activeCategory = "all") {
  let q = String(rawQuery || "").trim();
  let forcedCat = activeCategory;
  if (q.startsWith(">")) {
    forcedCat = "actions";
    q = q.slice(1).trim();
  } else if (q.startsWith("@") || q.startsWith("/")) {
    forcedCat = "places";
    q = q.slice(1).trim();
  } else if (q.startsWith("?") || q.startsWith("!")) {
    forcedCat = "tools";
    q = q.slice(1).trim();
  } else if (q.startsWith("+")) {
    forcedCat = "templates";
    q = q.slice(1).trim();
  } else if (q.startsWith("#")) {
    forcedCat = "view";
    q = q.slice(1).trim();
  }

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const recentOrder = Array.isArray(state.recentCommands) ? state.recentCommands : [];
  const scored = [];

  for (const item of catalog) {
    if (forcedCat !== "all" && item.category !== forcedCat) continue;
    const titleLower = (item.title || "").toLowerCase();
    const subLower = (item.subtitle || "").toLowerCase();
    const kwLower = (item.keywords || "").toLowerCase();
    const hay = `${titleLower} ${subLower} ${kwLower}`;

    if (words.length > 0 && !words.every((w) => hay.includes(w))) continue;

    let score = 0;
    const recIdx = recentOrder.indexOf(item.id);
    if (recIdx >= 0) score += (MAX_RECENT_COMMANDS - recIdx) * 8;
    if (words.length === 0) {
      if (item.category === "actions") score += 20;
      else if (item.category === "tools") score += 15;
      else if (item.category === "templates") score += 12;
      else if (item.category === "places") score += 10;
    } else {
      const fullQ = words.join(" ");
      if (titleLower === fullQ) score += 200;
      else if (titleLower.startsWith(fullQ)) score += 120;
      else if (titleLower.includes(fullQ)) score += 70;
      for (const w of words) {
        if (titleLower.startsWith(w)) score += 35;
        else if (titleLower.includes(w)) score += 20;
        else if (kwLower.includes(w)) score += 10;
      }
    }
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/**
 * Opens the interactive Command Palette & Quick-Jump Omnibar dialog.
 */
export function openCommandPalette(initialQuery = "") {
  const existing = document.getElementById("command-palette-input");
  if (existing && existing instanceof HTMLInputElement) {
    if (initialQuery) {
      existing.value = initialQuery;
      existing.dispatchEvent(new Event("input", { bubbles: true }));
    }
    existing.focus();
    existing.select();
    return null;
  }

  const catalog = buildPaletteCatalog();
  let activeCat = "all";
  let activeIndex = 0;
  let visible = [];

  const input = h("input", {
    id: "command-palette-input",
    type: "search",
    class: "cp-input",
    value: typeof initialQuery === "string" ? initialQuery : "",
    placeholder: "Type a command, file, place, tool, or template… (> actions, @ places, ? tools, + templates)",
    autocomplete: "off",
    spellcheck: "false",
    role: "combobox",
    "aria-expanded": "true",
    "aria-autocomplete": "list",
    "aria-controls": "cp-list",
    "aria-label": "Command Palette search",
    "data-own-enter": "true",
  });

  const catStrip = h("div", { class: "cp-cats", role: "tablist", "aria-label": "Command categories" });
  const listEl = h("div", { id: "cp-list", class: "cp-list", role: "listbox", "aria-label": "Matching commands and items" });
  const countBadge = h("span", { id: "cp-count", class: "cp-count", role: "status", "aria-live": "polite" });

  function renderCategories() {
    clear(catStrip);
    for (const c of PALETTE_CATEGORIES) {
      const selected = c.id === activeCat;
      catStrip.append(
        h("button", {
          type: "button",
          role: "tab",
          class: `cp-cat-btn${selected ? " active" : ""}`,
          dataset: { cpCat: c.id },
          "aria-selected": String(selected),
          onclick: () => {
            activeCat = c.id;
            activeIndex = 0;
            renderCategories();
            renderResults();
            input.focus();
          },
        },
          h("span", { "aria-hidden": "true" }, c.icon),
          h("span", {}, c.label),
        ),
      );
    }
  }

  function syncActiveRow() {
    const rows = [...listEl.querySelectorAll(".cp-item")];
    rows.forEach((r, idx) => {
      const sel = idx === activeIndex;
      r.classList.toggle("active", sel);
      r.setAttribute("aria-selected", String(sel));
      if (sel) {
        input.setAttribute("aria-activedescendant", r.id);
        r.scrollIntoView?.({ block: "nearest" });
      }
    });
    if (!rows.length) input.removeAttribute("aria-activedescendant");
  }

  let dlg;

  function executeItem(item) {
    if (!item) return;
    recordRecentCommand(item.id);
    dlg?.close(item.id);
    queueMicrotask(() => {
      try {
        item.run();
      } catch (err) {
        console.error("Command Palette action failed", err);
      }
    });
  }

  function renderResults() {
    visible = filterPaletteItems(catalog, input.value, activeCat).slice(0, 60);
    if (activeIndex >= visible.length) activeIndex = Math.max(0, visible.length - 1);
    countBadge.textContent = `${visible.length} match${visible.length === 1 ? "" : "es"}`;
    clear(listEl);
    if (!visible.length) {
      listEl.append(
        h("div", { class: "cp-empty" },
          h("p", {}, "No matching commands, places, or tools."),
          h("p", { class: "hint" }, "Try fewer letters or switch category tabs above."),
        ),
      );
      input.removeAttribute("aria-activedescendant");
      return;
    }
    const recentSet = new Set(state.recentCommands ?? []);
    visible.forEach((item, idx) => {
      const isRecent = !input.value.trim() && recentSet.has(item.id);
      const row = h("div", {
        id: `cp-opt-${idx}`,
        role: "option",
        class: `cp-item${idx === activeIndex ? " active" : ""}`,
        dataset: { cpId: item.id },
        "aria-selected": String(idx === activeIndex),
        onmouseenter: () => {
          activeIndex = idx;
          syncActiveRow();
        },
        onclick: () => executeItem(item),
      },
        h("span", { class: "cp-item-icon", "aria-hidden": "true" }, item.icon || "⚡"),
        h("span", { class: "cp-item-body" },
          h("span", { class: "cp-item-title-row" },
            h("span", { class: "cp-item-title" }, item.title),
            isRecent ? h("span", { class: "cp-badge-recent" }, "Recent") : null,
          ),
          item.subtitle ? h("span", { class: "cp-item-sub" }, item.subtitle) : null,
        ),
        item.shortcut ? h("kbd", { class: "cp-item-kbd" }, item.shortcut) : null,
      );
      listEl.append(row);
    });
    syncActiveRow();
  }

  input.addEventListener("input", () => {
    activeIndex = 0;
    renderResults();
  });

  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (visible.length) {
        activeIndex = (activeIndex + 1) % visible.length;
        syncActiveRow();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visible.length) {
        activeIndex = (activeIndex + visible.length - 1) % visible.length;
        syncActiveRow();
      }
    } else if (e.key === "Home" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      activeIndex = 0;
      syncActiveRow();
    } else if (e.key === "End" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      activeIndex = Math.max(0, visible.length - 1);
      syncActiveRow();
    } else if (e.key === "PageDown") {
      e.preventDefault();
      activeIndex = Math.min(Math.max(0, visible.length - 1), activeIndex + 8);
      syncActiveRow();
    } else if (e.key === "PageUp") {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 8);
      syncActiveRow();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (visible[activeIndex]) executeItem(visible[activeIndex]);
    }
  });

  renderCategories();
  renderResults();

  const body = h("div", { class: "cp-root" },
    h("div", { class: "cp-search-bar" },
      h("span", { class: "cp-search-icon", "aria-hidden": "true" }, "⚡"),
      input,
      countBadge,
    ),
    catStrip,
    listEl,
    h("div", { class: "cp-footer" },
      h("span", {}, "↑↓ to move · Enter to run · Esc to close"),
      h("span", {}, "Prefixes: > actions · @ places · ? tools · + templates"),
    ),
  );

  dlg = openDialog({
    title: "⚡ Command Palette & Quick Jump",
    wide: true,
    body,
    initialFocus: input,
    buttons: [{ label: "Close", value: null }],
  });
  dlg.el.classList.add("cp-dialog");
  return dlg;
}

export function wireCommandPalette() {
  const btn = $("#viewbar-palette");
  btn?.addEventListener("click", () => openCommandPalette());
  on("command-palette", (q) => openCommandPalette(typeof q === "string" ? q : ""));
}
