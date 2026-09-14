import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import {
  executeFdSearch,
  runFdCommand,
  parseSizeFilter,
  parseDurationMs,
  type FdItem,
  type FdSearchOptions,
  type FdFileType,
} from "./fd_engine";
import {
  getGraveyardDir,
  buryTargetsSync,
  unburyTargetsSync,
  seanceGraveyard,
  decomposeGraveyardSync,
  getGraveyardStats,
  formatHumanSize,
  type GraveyardItem,
} from "./rip_engine";
import * as path from "node:path";
import * as fs from "node:fs";

export function createFdStudio(options: { fullscreen?: boolean; theme?: string; graveyardDir?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Fd Studio Pro -- Native High-Performance File & Directory Finder",
    1240,
    1200,
    {
      appId: "fd_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
      responsive: false,
    }
  );

  const graveyardDir = getGraveyardDir(options.graveyardDir);
  let currentResults: FdItem[] = [];
  let selectedItem: FdItem | null = null;
  let activeTypeFilter: FdFileType | "all" = "all";
  let activeWatcher: { close: () => void } | null = null;
  let watcherDebounceTimer: Timer | null = null;
  let graveyardItems: GraveyardItem[] = [];
  let selectedGraveyardItem: GraveyardItem | null = null;

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Fd Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_unbury_last", "↺ Undo Rip (Restore)");
  win.addButton("btn_toggle_graveyard", "🪦 Graveyard (0)");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Zero Homebrew Reliance -- 100% Native Bun System APIs for Ultra-Fast Traversal & Safe Quarantine");

  // -----------------------------------------------------------------------------------------------
  // 2. Search & Target Configuration
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Search Target & Pattern");
  win.beginRow();
  win.addLabel("lbl_pattern", "Pattern:");
  win.addInput("txt_pattern", "", "Regex, Glob (*.ts) or Text...", { width: 260 });
  win.addLabel("lbl_root", "Search Root:");
  win.addInput("txt_root", ".", "Root directory (e.g. ., ./src)", { width: 180 });
  win.addLabel("lbl_mode", "Mode:");
  win.addDropdown("dd_mode", ["Regex (Default)", "Glob Pattern", "Fixed String"], "Regex (Default)", { width: 140 });
  win.addLabel("lbl_case", "Case:");
  win.addDropdown("dd_case", ["Smart Case", "Case Sensitive", "Ignore Case"], "Smart Case", { width: 130 });
  win.addButton("btn_search", "🔍 Find Files", { width: 100 });
  win.addButton("btn_toggle_watch", "👀 Start Watcher", { width: 130 });
  win.addButton("btn_clear", "✕ Clear", { width: 75 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Quick Type Filters & Advanced Constraints
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Filters & Advanced Options");
  win.beginRow();
  win.addButton("btn_type_all", "🌐 All Types");
  win.addButton("btn_type_files", "📄 Files Only (-t f)");
  win.addButton("btn_type_dirs", "📁 Directories (-t d)");
  win.addButton("btn_type_exec", "⚡ Executables (-t x)");
  win.addButton("btn_type_symlinks", "🔗 Symlinks (-t l)");
  win.addButton("btn_type_empty", "📭 Empty (-t e)");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exts", "Extensions:");
  win.addInput("txt_exts", "", "e.g. ts,tsx,json", { width: 150 });
  win.addLabel("lbl_exclude", "Exclude:");
  win.addInput("txt_exclude", "node_modules,dist,.git", "Exclude patterns...", { width: 210 });
  win.addLabel("lbl_max_depth", "Max Depth:");
  win.addInput("txt_max_depth", "", "e.g. 2, 4", { width: 70 });
  win.addLabel("lbl_size", "Size:");
  win.addInput("txt_size", "", "+1M, -10k...", { width: 90 });
  win.addLabel("lbl_age", "Modified:");
  win.addDropdown("dd_age", ["Any Time", "Last 10 min", "Last 1 hour", "Last 24 hours", "Last 7 days", "Last 30 days"], "Any Time", { width: 120 });
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_hidden", "Include Hidden (-H)", false);
  win.addCheckbox("chk_no_ignore", "Ignore .gitignore (-I)", false);
  win.addCheckbox("chk_follow", "Follow Symlinks (-L)", false);
  win.addCheckbox("chk_full_path", "Match Full Path (-p)", false);
  win.addCheckbox("chk_watch", "👀 Live Watcher Mode (-w)", false);
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Results Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Matching Files & Directories (Click any item to inspect & preview)");
  const tableHeaders = ["Name", "Type", "Size", "Relative Path", "Modified", "Perms"];
  win.addTable("tbl_results", tableHeaders, [], { height: 260 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // -----------------------------------------------------------------------------------------------
  // 5. Selected File Inspector & Single-Item Actions
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Selected File Inspector & Single-Item Actions");
  win.beginRow();
  win.addLabel("lbl_selected_name", "Selected: (None)");
  win.addLabel("lbl_selected_stats", "Size: — | Perms: — | Modified: —");
  win.addLabel("lbl_selected_hash", "SHA-256: —");
  win.endRow();

  win.beginRow();
  win.addButton("btn_copy_rel", "📋 Copy Rel Path");
  win.addButton("btn_copy_abs", "📋 Copy Full Path");
  win.addButton("btn_reveal", "📂 Reveal in Finder");
  win.addButton("btn_preview_content", "👁️ Preview Content");
  win.addButton("btn_move_one", "📦 Move Item");
  win.addButton("btn_bury_one", "🪦 Safe Bury (Rip)");
  win.addButton("btn_delete_one", "🗑️ Delete Item");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exec_tmpl", "Command (-x):");
  win.addInput("txt_exec_cmd", "wc -l {}", "e.g. wc -l {}, head -n 5 {}", { width: 220 });
  win.addButton("btn_exec_one", "⚡ Run on Item");
  win.addButton("btn_exec_all", "🚀 Batch Run All (-X)");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Batch Operations, Bulk File Management & Export Toolkit
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Batch Operations, Bulk File Management & Export Toolkit");
  win.beginRow();
  win.addLabel("lbl_dest", "Target Destination Folder:");
  win.addInput("txt_dest_dir", "./output", "e.g. ./backup, /tmp/export", { width: 220 });
  win.addButton("btn_copy_all_files", "📁 Copy All to Folder");
  win.addButton("btn_move_all", "📦 Move All to Folder");
  win.addButton("btn_archive_all", "🗜️ Archive All (.tar.gz)");
  win.endRow();

  win.beginRow();
  win.addButton("btn_copy_all_rel", "📋 Copy All Rel Paths");
  win.addButton("btn_copy_all_abs", "📋 Copy All Full Paths");
  win.addButton("btn_export_json", "💾 Export JSON");
  win.addButton("btn_export_csv", "📊 Export CSV");
  win.addButton("btn_bury_all", "🪦 Safe Bury All (Rip)");
  win.addButton("btn_delete_all", "💥 Delete All Matches");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 7. Graveyard Quarantine & Recovery (Rip Engine)
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Graveyard Quarantine & Recovery (Rip Engine)");
  win.beginRow();
  win.addLabel("lbl_rip_metric_total", "Buried Items: 0");
  win.addLabel("lbl_rip_metric_size", "Total Size: 0 B");
  win.addLabel("lbl_rip_metric_today", "Buried Today: 0");
  const homeDir = process.env.HOME || "";
  const displayGraveyard = homeDir && graveyardDir.startsWith(homeDir) ? "~" + graveyardDir.slice(homeDir.length) : graveyardDir;
  win.addLabel("lbl_rip_metric_path", `Graveyard: ${displayGraveyard}`);
  win.endRow();

  const graveyardHeaders = ["ID", "Name", "Type", "Size", "Buried Date", "Original Path", "Status"];
  win.addTable("tbl_graveyard", graveyardHeaders, [], { height: 220 });

  win.beginRow();
  win.addLabel("lbl_rip_selected", "Selected Buried Item: (None Selected)");
  win.endRow();

  win.beginRow();
  win.addButton("btn_unbury_selected", "↺ Restore Selected (Unbury)");
  win.addButton("btn_decompose_selected", "⚰️ Decompose (Permanent Delete)");
  win.addButton("btn_decompose_all", "🧹 Empty Graveyard");
  win.addButton("btn_refresh_graveyard", "🔄 Refresh Graveyard");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 8. Content Preview & Activity Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Preview & Command Output");
  win.addConsole("fd_console", 110);
  win.beginRow();
  win.addButton("btn_clear_console", "🗑️ Clear Console");
  win.addLabel("lbl_status", "Status: Ready | Scanned: 0 | Matches: 0 | Duration: 0ms");
  win.endRow();
  win.endGroupBox();

  // Hidden IPC for table row click
  win.bindControlEvent("sel_file_ipc", "change", (_, filePath) => {
    if (!filePath) return;
    const item = currentResults.find((r) => r.path === String(filePath) || r.relativePath === String(filePath));
    if (item) {
      updateSelectedInspector(item);
    }
  });

  win.bindControlEvent("sel_graveyard_ipc", "change", (_, graveyardId) => {
    if (!graveyardId) return;
    const item = graveyardItems.find((g) => g.id === String(graveyardId) || g.name === String(graveyardId));
    if (item) {
      updateSelectedGraveyardInspector(item);
    }
  });

  // -----------------------------------------------------------------------------------------------
  // Application Logic & Helpers
  // -----------------------------------------------------------------------------------------------

  const logConsole = (msg: string, style = 1) => {
    const time = new Date().toLocaleTimeString();
    win.appendConsole("fd_console", `[${time}] ${msg}\n`, style);
  };

  const updateSelectedInspector = (item: FdItem) => {
    selectedItem = item;
    win.setText("lbl_selected_name", `Selected: [${item.type.toUpperCase()}] ${item.name}`);
    win.setText("lbl_selected_stats", `Size: ${item.humanSize} | Perms: ${item.permStr} | Modified: ${item.mtimeStr}`);

    // Compute SHA-256 hash synchronously for files under 20MB using Bun's native CryptoHasher
    if (item.type === "file" && item.sizeBytes < 20 * 1024 * 1024) {
      try {
        const buf = fs.readFileSync(item.path);
        const hasher = new Bun.CryptoHasher("sha256");
        hasher.update(buf);
        const hashHex = hasher.digest("hex").slice(0, 16) + "...";
        win.setText("lbl_selected_hash", `SHA-256: ${hashHex}`);
      } catch {
        win.setText("lbl_selected_hash", "SHA-256: N/A");
      }
    } else {
      win.setText("lbl_selected_hash", "SHA-256: N/A");
    }
  };

  const updateSelectedGraveyardInspector = (item: GraveyardItem | null) => {
    selectedGraveyardItem = item;
    if (!item) {
      win.setText("lbl_rip_selected", "Selected Buried Item: (None Selected)");
      return;
    }
    const typeLabel = item.type === "directory" ? "Directory" : "File";
    const dateLabel = item.buriedAt ? item.buriedAt.slice(0, 19).replace("T", " ") : "—";
    win.setText(
      "lbl_rip_selected",
      `Selected: ${item.name} (${item.humanSize}, ${typeLabel}) | Buried: ${dateLabel} | From: ${item.originalPath}`
    );
  };

  const refreshGraveyard = () => {
    try {
      const stats = getGraveyardStats(graveyardDir);
      graveyardItems = seanceGraveyard({ graveyardDir });

      win.setText("lbl_rip_metric_total", `Buried Items: ${stats.totalFiles}`);
      win.setText("lbl_rip_metric_size", `Total Size: ${formatHumanSize(stats.totalSizeBytes)}`);
      win.setText("lbl_rip_metric_today", `Buried Today: ${stats.buriedToday}`);
      win.setText("btn_toggle_graveyard", `🪦 Graveyard (${stats.totalFiles})`);

      const rows = graveyardItems.map((g) => ({
        rowId: g.id,
        cells: [
          g.id,
          g.name,
          g.type === "directory" ? "dir" : "file",
          g.humanSize,
          g.buriedAt ? g.buriedAt.slice(0, 19).replace("T", " ") : "—",
          g.originalPath,
          g.status,
        ],
      }));

      win.setTableData("tbl_graveyard", graveyardHeaders, rows);

      if (selectedGraveyardItem) {
        const stillPresent = graveyardItems.find((g) => g.id === selectedGraveyardItem!.id);
        updateSelectedGraveyardInspector(stillPresent || null);
      } else if (graveyardItems.length > 0) {
        updateSelectedGraveyardInspector(graveyardItems[0]);
      } else {
        updateSelectedGraveyardInspector(null);
      }
    } catch (err: any) {
      logConsole(`[Graveyard Error]: ${err.message}`, 3);
    }
  };

  const performSearch = () => {
    const pattern = win.getValue("txt_pattern") || "";
    const searchRoot = win.getValue("txt_root") || ".";
    const modeRaw = win.getValue("dd_mode") || "Regex (Default)";
    const caseRaw = win.getValue("dd_case") || "Smart Case";
    const extsRaw = win.getValue("txt_exts") || "";
    const excludeRaw = win.getValue("txt_exclude") || "";
    const maxDepthRaw = win.getValue("txt_max_depth") || "";
    const sizeRaw = win.getValue("txt_size") || "";
    const ageRaw = win.getValue("dd_age") || "Any Time";

    const hidden = Boolean(win.getValue("chk_hidden"));
    const noIgnore = Boolean(win.getValue("chk_no_ignore"));
    const followSymlinks = Boolean(win.getValue("chk_follow"));
    const fullPath = Boolean(win.getValue("chk_full_path"));

    let searchMode: "regex" | "glob" | "fixed" = "regex";
    if (modeRaw.includes("Glob")) searchMode = "glob";
    else if (modeRaw.includes("Fixed")) searchMode = "fixed";

    let caseMode: "smart" | "sensitive" | "ignore" = "smart";
    if (caseRaw.includes("Sensitive")) caseMode = "sensitive";
    else if (caseRaw.includes("Ignore")) caseMode = "ignore";

    const extensions = extsRaw ? extsRaw.split(/[,;\s]+/).filter(Boolean) : undefined;
    const excludePatterns = excludeRaw ? excludeRaw.split(/[,;\s]+/).filter(Boolean) : undefined;
    const maxDepth = maxDepthRaw ? parseInt(maxDepthRaw, 10) : undefined;

    let minSizeBytes: number | undefined;
    let maxSizeBytes: number | undefined;
    if (sizeRaw) {
      const parsedSize = parseSizeFilter(sizeRaw);
      if (parsedSize) {
        if (parsedSize.mode === "greater") minSizeBytes = parsedSize.bytes;
        else if (parsedSize.mode === "less") maxSizeBytes = parsedSize.bytes;
        else {
          minSizeBytes = parsedSize.bytes * 0.9;
          maxSizeBytes = parsedSize.bytes * 1.1;
        }
      }
    }

    let changedWithinMs: number | undefined;
    if (ageRaw.includes("10 min")) changedWithinMs = parseDurationMs("10m") || undefined;
    else if (ageRaw.includes("1 hour")) changedWithinMs = parseDurationMs("1h") || undefined;
    else if (ageRaw.includes("24 hours")) changedWithinMs = parseDurationMs("24h") || undefined;
    else if (ageRaw.includes("7 days")) changedWithinMs = parseDurationMs("7d") || undefined;
    else if (ageRaw.includes("30 days")) changedWithinMs = parseDurationMs("30d") || undefined;

    const types: FdFileType[] = activeTypeFilter !== "all" ? [activeTypeFilter] : [];

    const searchOpts: FdSearchOptions = {
      searchRoot,
      pattern,
      searchMode,
      caseMode,
      fullPath,
      types: types.length > 0 ? types : undefined,
      extensions,
      hidden,
      noIgnore,
      excludePatterns,
      maxDepth,
      followSymlinks,
      minSizeBytes,
      maxSizeBytes,
      changedWithinMs,
      maxResults: 1500,
    };

    win.setText("lbl_status", "Status: Scanning filesystem...");
    const result = executeFdSearch(searchOpts);
    currentResults = result.items;

    const rows = result.items.map((it) => ({
      rowId: it.relativePath,
      cells: [
        it.name,
        it.type,
        it.humanSize,
        it.relativePath,
        it.mtimeStr,
        it.permStr,
      ],
    }));

    win.setTableData("tbl_results", tableHeaders, rows);

    const truncMsg = result.truncated ? " (Results capped at 1500)" : "";
    const status = `Status: Done  |  Scanned: ${result.totalScanned}  |  Matches: ${result.matchedCount}${truncMsg}  |  Duration: ${result.durationMs}ms  |  Total Size: ${result.totalHumanSize}`;
    win.setText("lbl_status", status);

    logConsole(`[Search] Found ${result.matchedCount} matching items in ${result.durationMs}ms (${result.totalHumanSize})${truncMsg}`, 2);

    if (result.items.length > 0) {
      const stillSelected = selectedItem ? result.items.find((r) => r.relativePath === selectedItem!.relativePath) : null;
      updateSelectedInspector(stillSelected || result.items[0]);
    } else {
      selectedItem = null;
      win.setText("lbl_selected_name", "Selected: (No matches)");
      win.setText("lbl_selected_stats", "Size: — | Perms: — | Modified: —");
      win.setText("lbl_selected_hash", "SHA-256: —");
    }
  };

  // -----------------------------------------------------------------------------------------------
  // Event Bindings
  // -----------------------------------------------------------------------------------------------

  const stopAll = () => {
    if (watcherDebounceTimer) {
      clearTimeout(watcherDebounceTimer);
      watcherDebounceTimer = null;
    }
    if (activeWatcher) {
      try {
        activeWatcher.close();
      } catch {}
      activeWatcher = null;
    }
  };

  const stopWatcher = (updateUi = true) => {
    const wasActive = activeWatcher !== null;
    stopAll();
    if (updateUi && win.isWindowRunning) {
      try {
        win.setText("btn_toggle_watch", "👀 Start Watcher");
        win.setValue("chk_watch", false);
        if (wasActive) {
          logConsole("[Watcher] Live filesystem watcher stopped.", 1);
          win.toast("Filesystem watcher stopped");
        }
      } catch {}
    }
  };

  const startWatcher = () => {
    if (activeWatcher) {
      stopWatcher(false);
    }
    const searchRoot = win.getValue("txt_root") || ".";
    const resolvedRoot = path.resolve(searchRoot);
    if (!fs.existsSync(resolvedRoot)) {
      win.toast(`Cannot watch: directory does not exist '${searchRoot}'`);
      return;
    }

    try {
      const fsWatcher = fs.watch(resolvedRoot, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.includes(".git") || filename.includes("node_modules") || filename.endsWith("~") || filename.startsWith("."))) {
          return;
        }
        if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = setTimeout(() => {
          logConsole(`[Watcher] Change detected (${eventType}: ${filename || "files"}), auto-refreshing...`, 1);
          performSearch();
        }, 250);
      });

      if (typeof (fsWatcher as any).unref === "function") {
        (fsWatcher as any).unref();
      }

      activeWatcher = {
        close: () => {
          if (watcherDebounceTimer) {
            clearTimeout(watcherDebounceTimer);
            watcherDebounceTimer = null;
          }
          try {
            fsWatcher.close();
          } catch {}
        },
      };

      win.setText("btn_toggle_watch", "⏹️ Stop Watcher");
      win.setValue("chk_watch", true);
      logConsole(`[Watcher] Live watching '${resolvedRoot}' for filesystem changes...`, 2);
      win.toast(`Live watcher active on ${searchRoot}`);
    } catch (err: any) {
      logConsole(`[Watcher Error]: ${err.message}`, 3);
      win.toast(`Could not start watcher: ${err.message}`);
    }
  };

  const toggleWatcher = () => {
    if (activeWatcher) {
      stopWatcher();
    } else {
      startWatcher();
    }
  };

  win.onClick("btn_fullscreen", (w) => w.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Fd Studio configuration saved!");
  });

  win.onClick("btn_search", () => performSearch());
  win.onClick("btn_toggle_watch", () => toggleWatcher());
  win.onChange("chk_watch", (val) => {
    if (val && !activeWatcher) startWatcher();
    else if (!val && activeWatcher) stopWatcher();
  });
  win.onEnter("txt_pattern", () => performSearch());
  win.onEnter("txt_root", () => {
    performSearch();
    if (activeWatcher) startWatcher();
  });

  win.onClick("btn_clear", () => {
    stopWatcher();
    win.setValue("txt_pattern", "");
    win.setValue("txt_root", ".");
    win.setValue("txt_exts", "");
    win.setValue("txt_max_depth", "");
    win.setValue("txt_size", "");
    activeTypeFilter = "all";
    performSearch();
    win.toast("Filters reset to default");
  });

  // Type buttons
  const setTypeFilter = (type: FdFileType | "all", label: string) => {
    activeTypeFilter = type;
    win.toast(`Filtered by type: ${label}`);
    logConsole(`[Filter] Type filter switched to: ${label}`, 1);
    performSearch();
  };

  win.onClick("btn_type_all", () => setTypeFilter("all", "All Types"));
  win.onClick("btn_type_files", () => setTypeFilter("file", "Files Only"));
  win.onClick("btn_type_dirs", () => setTypeFilter("directory", "Directories"));
  win.onClick("btn_type_exec", () => setTypeFilter("executable", "Executables"));
  win.onClick("btn_type_symlinks", () => setTypeFilter("symlink", "Symlinks"));
  win.onClick("btn_type_empty", () => setTypeFilter("empty", "Empty Items"));

  // Dropdown changes
  win.onChange("dd_mode", () => performSearch());
  win.onChange("dd_case", () => performSearch());
  win.onChange("dd_age", () => performSearch());

  // Table row click
  win.onClick("tbl_results", (_, rowIdentifier) => {
    const item = currentResults.find(
      (r) => r.relativePath === rowIdentifier || r.path === rowIdentifier || r.name === rowIdentifier
    );
    if (item) updateSelectedInspector(item);
  });

  // Clipboard helper
  const copyToClipboard = (text: string, description: string) => {
    try {
      if (process.platform === "darwin") {
        const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
        proc.stdin.write(text);
        proc.stdin.end();
      } else if (process.platform === "win32") {
        const proc = Bun.spawn(["clip"], { stdin: "pipe" });
        proc.stdin.write(text);
        proc.stdin.end();
      } else {
        const proc = Bun.spawn(["xclip", "-selection", "clipboard"], { stdin: "pipe" });
        proc.stdin.write(text);
        proc.stdin.end();
      }
      win.toast(`Copied ${description} to clipboard`);
      logConsole(`[Clipboard] Copied ${description}`, 1);
    } catch (err: any) {
      logConsole(`[Clipboard Error]: ${err.message}`, 3);
      win.toast(`Clipboard error: ${err.message}`);
    }
  };

  // Copy Relative Path
  win.onClick("btn_copy_rel", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    copyToClipboard(selectedItem.relativePath, `relative path: ${selectedItem.relativePath}`);
  });

  // Copy Full Absolute Path
  win.onClick("btn_copy_abs", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    copyToClipboard(selectedItem.path, `absolute path: ${selectedItem.path}`);
  });

  // Reveal in macOS Finder
  win.onClick("btn_reveal", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    Sys.exec(`open -R "${selectedItem.path}"`);
    win.toast(`Revealed in Finder: ${selectedItem.name}`);
    logConsole(`[Finder] Revealed item: ${selectedItem.path}`, 1);
  });

  // Preview Content
  win.onClick("btn_preview_content", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    if (selectedItem.type === "directory") {
      try {
        const sub = fs.readdirSync(selectedItem.path);
        logConsole(`[Directory Contents: ${selectedItem.name}] (${sub.length} entries):\n${sub.slice(0, 30).join("\n")}`, 1);
      } catch (err: any) {
        logConsole(`[Error reading directory]: ${err.message}`, 3);
      }
      return;
    }

    if (selectedItem.sizeBytes > 5 * 1024 * 1024) {
      win.toast("File is larger than 5MB; preview skipped.");
      return;
    }

    try {
      const content = fs.readFileSync(selectedItem.path, "utf-8");
      const preview = content.length > 2000 ? content.slice(0, 2000) + "\n... (truncated)" : content;
      logConsole(`--- [Preview: ${selectedItem.name}] ---\n${preview}`, 1);
      win.toast(`Loaded preview for ${selectedItem.name}`);
    } catch (e: any) {
      logConsole(`[Cannot preview file]: ${e.message}`, 3);
    }
  });

  // Move Single Selected Item
  win.onClick("btn_move_one", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    const rawDest = win.getValue("txt_dest_dir") || "./output";
    const destDir = path.resolve(rawDest);
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const targetPath = path.join(destDir, selectedItem.name);
      try {
        fs.renameSync(selectedItem.path, targetPath);
      } catch {
        fs.cpSync(selectedItem.path, targetPath, { recursive: true });
        fs.rmSync(selectedItem.path, { recursive: true, force: true });
      }
      logConsole(`[Move] Moved '${selectedItem.name}' -> '${targetPath}'`, 2);
      win.toast(`Moved '${selectedItem.name}' to ${rawDest}`);
      performSearch();
    } catch (err: any) {
      logConsole(`[Move Error]: ${err.message}`, 3);
      win.toast(`Failed to move item: ${err.message}`);
    }
  });

  // Safe Bury Single Selected Item (Rip Engine)
  win.onClick("btn_bury_one", () => {
    if (!selectedItem) {
      win.toast("Please select an item first to bury.");
      return;
    }
    const targetPath = selectedItem.path;
    const targetName = selectedItem.name;
    try {
      const res = buryTargetsSync([targetPath], { graveyardDir });
      if (res.buried.length > 0) {
        logConsole(`[Rip Engine] Safely buried '${targetName}' into Rip graveyard (${formatHumanSize(res.totalBytesFreed)} freed)`, 2);
        win.toast(`Safely buried '${targetName}' (Rip)`);
        refreshGraveyard();
        performSearch();
      } else if (res.errors.length > 0) {
        logConsole(`[Rip Engine Error]: ${res.errors[0].error}`, 3);
        win.toast(`Failed to bury: ${res.errors[0].error}`);
      }
    } catch (err: any) {
      logConsole(`[Rip Error]: ${err.message}`, 3);
      win.toast(`Failed to bury item: ${err.message}`);
    }
  });

  // Delete Single Selected Item
  win.onClick("btn_delete_one", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    const targetPath = selectedItem.path;
    const targetName = selectedItem.name;
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      logConsole(`[Delete] Successfully deleted: ${targetPath}`, 2);
      win.toast(`Deleted: ${targetName}`);
      currentResults = currentResults.filter((r) => r.path !== targetPath);
      const rows = currentResults.map((it) => ({
        rowId: it.relativePath,
        cells: [it.name, it.type, it.humanSize, it.relativePath, it.mtimeStr, it.permStr],
      }));
      win.setTableData("tbl_results", tableHeaders, rows);
      if (currentResults.length > 0) {
        updateSelectedInspector(currentResults[0]);
      } else {
        selectedItem = null;
        win.setText("lbl_selected_name", "Selected: (No matches)");
        win.setText("lbl_selected_stats", "Size: — | Perms: — | Modified: —");
        win.setText("lbl_selected_hash", "SHA-256: —");
      }
      win.setText("lbl_status", `Status: Done | Remaining Matches: ${currentResults.length}`);
    } catch (err: any) {
      logConsole(`[Delete Error]: ${err.message}`, 3);
      win.toast(`Failed to delete: ${err.message}`);
    }
  });

  // Execute on Single Item (-x)
  const runOnSelectedItem = () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    const tmpl = win.getValue("txt_exec_cmd") || "ls -la {}";
    logConsole(`[Exec] Running '${tmpl}' on ${selectedItem.name}...`, 1);
    const res = runFdCommand(tmpl, [selectedItem.path]);
    if (res.stdout) logConsole(`[Output]:\n${res.stdout}`, 2);
    if (res.stderr) logConsole(`[Error]:\n${res.stderr}`, 3);
    if (!res.stdout && !res.stderr && res.exitCode === 0) {
      logConsole(`[Exec] Command completed successfully with exit code 0`, 2);
    }
    win.toast(`Execution finished with code ${res.exitCode}`);
  };

  win.onClick("btn_exec_one", runOnSelectedItem);
  win.onEnter("txt_exec_cmd", runOnSelectedItem);

  // Batch Execute on All Matches (-X)
  win.onClick("btn_exec_all", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to execute on.");
      return;
    }
    const tmpl = win.getValue("txt_exec_cmd") || "ls -la {}";
    const paths = currentResults.map((r) => r.path);
    logConsole(`[Batch Exec] Running '${tmpl}' on ${paths.length} items...`, 1);
    const res = runFdCommand(tmpl, paths);
    if (res.stdout) logConsole(`[Output]:\n${res.stdout}`, 2);
    if (res.stderr) logConsole(`[Error]:\n${res.stderr}`, 3);
    if (!res.stdout && !res.stderr && res.exitCode === 0) {
      logConsole(`[Batch Exec] Command completed successfully with exit code 0`, 2);
    }
    win.toast(`Batch execution finished with exit code ${res.exitCode}`);
  });

  // Copy All Matched Files into Target Folder
  win.onClick("btn_copy_all_files", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to copy.");
      return;
    }
    const rawDest = win.getValue("txt_dest_dir") || "./output";
    const destDir = path.resolve(rawDest);
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      let copiedCount = 0;
      let errorCount = 0;
      for (const item of currentResults) {
        try {
          const targetPath = path.join(destDir, item.name);
          fs.cpSync(item.path, targetPath, { recursive: true });
          copiedCount++;
        } catch (err: any) {
          errorCount++;
          logConsole(`[Copy Error on ${item.name}]: ${err.message}`, 3);
        }
      }
      logConsole(`[Batch Copy Files] Copied ${copiedCount} of ${currentResults.length} items to '${destDir}' (${errorCount} errors)`, errorCount > 0 ? 3 : 2);
      win.toast(`Copied ${copiedCount} files to ${rawDest}`);
    } catch (err: any) {
      logConsole(`[Batch Copy Error]: ${err.message}`, 3);
      win.toast(`Failed to copy files: ${err.message}`);
    }
  });

  // Move All Matched Files into Target Folder
  win.onClick("btn_move_all", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to move.");
      return;
    }
    const rawDest = win.getValue("txt_dest_dir") || "./output";
    const destDir = path.resolve(rawDest);
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      let movedCount = 0;
      let errorCount = 0;
      for (const item of currentResults) {
        try {
          const targetPath = path.join(destDir, item.name);
          try {
            fs.renameSync(item.path, targetPath);
          } catch {
            fs.cpSync(item.path, targetPath, { recursive: true });
            fs.rmSync(item.path, { recursive: true, force: true });
          }
          movedCount++;
        } catch (err: any) {
          errorCount++;
          logConsole(`[Move Error on ${item.name}]: ${err.message}`, 3);
        }
      }
      logConsole(`[Batch Move] Moved ${movedCount} items to '${destDir}' (${errorCount} errors)`, errorCount > 0 ? 3 : 2);
      win.toast(`Moved ${movedCount} items to ${rawDest}`);
      performSearch();
    } catch (err: any) {
      logConsole(`[Batch Move Error]: ${err.message}`, 3);
      win.toast(`Failed batch move: ${err.message}`);
    }
  });

  // Archive All Matched Files (.tar.gz)
  win.onClick("btn_archive_all", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to archive.");
      return;
    }
    const rawDest = win.getValue("txt_dest_dir") || "./output";
    const destDir = path.resolve(rawDest);
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const archivePath = path.join(destDir, `fd_archive_${timestamp}.tar.gz`);

      const tmpList = path.join(destDir, `.tar_list_${Date.now()}.txt`);
      fs.writeFileSync(tmpList, currentResults.map((r) => r.path).join("\n"), "utf-8");

      const cmd = `tar -czf "${archivePath}" -T "${tmpList}"`;
      const res = Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: "ignore" });
      try { fs.unlinkSync(tmpList); } catch {}

      if (res.exitCode === 0 && fs.existsSync(archivePath)) {
        const stat = fs.statSync(archivePath);
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        logConsole(`[Archive] Created archive: ${archivePath} (${sizeMb} MB, ${currentResults.length} files)`, 2);
        win.toast(`Archived ${currentResults.length} items to .tar.gz!`);
      } else {
        const err = res.stderr ? Buffer.from(res.stderr).toString("utf-8") : "tar execution failed";
        logConsole(`[Archive Error]: ${err}`, 3);
        win.toast(`Archive creation failed`);
      }
    } catch (err: any) {
      logConsole(`[Archive Exception]: ${err.message}`, 3);
      win.toast(`Failed to create archive: ${err.message}`);
    }
  });

  // Copy All Relative Paths
  win.onClick("btn_copy_all_rel", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to copy.");
      return;
    }
    const text = currentResults.map((r) => r.relativePath).join("\n");
    copyToClipboard(text, `${currentResults.length} relative paths`);
  });

  // Copy All Full Paths
  win.onClick("btn_copy_all_abs", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to copy.");
      return;
    }
    const text = currentResults.map((r) => r.path).join("\n");
    copyToClipboard(text, `${currentResults.length} full paths`);
  });

  // Export Results as JSON
  win.onClick("btn_export_json", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to export.");
      return;
    }
    try {
      const rawDest = win.getValue("txt_dest_dir") || ".";
      const destDir = path.resolve(rawDest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const jsonStr = JSON.stringify(currentResults, null, 2);
      const filePath = path.join(destDir, "fd_search_results.json");
      fs.writeFileSync(filePath, jsonStr, "utf-8");
      copyToClipboard(jsonStr, `JSON export (${currentResults.length} records)`);
      logConsole(`[Export] Saved JSON export to: ${filePath} (${(jsonStr.length / 1024).toFixed(1)} KB)`, 2);
      win.toast(`Exported JSON to ${filePath}`);
    } catch (err: any) {
      logConsole(`[Export Error]: ${err.message}`, 3);
      win.toast(`Export failed: ${err.message}`);
    }
  });

  // Export Results as CSV
  win.onClick("btn_export_csv", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to export.");
      return;
    }
    try {
      const rawDest = win.getValue("txt_dest_dir") || ".";
      const destDir = path.resolve(rawDest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const escapeCsv = (str: any) => {
        const s = str === null || str === undefined ? "" : String(str);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const headerLine = "Name,Type,SizeBytes,HumanSize,RelativePath,FullPath,Modified,Permissions";
      const lines = currentResults.map((r) => [
        escapeCsv(r.name),
        escapeCsv(r.type),
        r.sizeBytes,
        escapeCsv(r.humanSize),
        escapeCsv(r.relativePath),
        escapeCsv(r.path),
        escapeCsv(r.mtimeStr),
        escapeCsv(r.permStr),
      ].join(","));
      const csvStr = [headerLine, ...lines].join("\n");
      const filePath = path.join(destDir, "fd_search_results.csv");
      fs.writeFileSync(filePath, csvStr, "utf-8");
      copyToClipboard(csvStr, `CSV export (${currentResults.length} records)`);
      logConsole(`[Export] Saved CSV export to: ${filePath} (${lines.length} rows)`, 2);
      win.toast(`Exported CSV to ${filePath}`);
    } catch (err: any) {
      logConsole(`[Export Error]: ${err.message}`, 3);
      win.toast(`Export failed: ${err.message}`);
    }
  });

  // Batch Safe Bury All Matched Items (Rip Engine)
  win.onClick("btn_bury_all", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to bury.");
      return;
    }
    const paths = currentResults.map((r) => r.path);
    try {
      const res = buryTargetsSync(paths, { graveyardDir });
      logConsole(
        `[Rip Engine] Batch buried ${res.buried.length} of ${paths.length} items into graveyard (${formatHumanSize(res.totalBytesFreed)} freed, ${res.errors.length} errors)`,
        res.errors.length > 0 ? 3 : 2
      );
      win.toast(`Batch buried ${res.buried.length} items into Rip graveyard!`);
      refreshGraveyard();
      performSearch();
    } catch (err: any) {
      logConsole(`[Rip Batch Error]: ${err.message}`, 3);
      win.toast(`Batch bury failed: ${err.message}`);
    }
  });

  // Batch Delete All Matched Items
  win.onClick("btn_delete_all", () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to delete.");
      return;
    }
    const countToDelete = currentResults.length;
    let deletedCount = 0;
    let errorCount = 0;
    for (const item of currentResults) {
      try {
        fs.rmSync(item.path, { recursive: true, force: true });
        deletedCount++;
      } catch (err: any) {
        errorCount++;
        logConsole(`[Delete Error on ${item.name}]: ${err.message}`, 3);
      }
    }
    logConsole(`[Batch Delete] Deleted ${deletedCount} of ${countToDelete} items (${errorCount} errors)`, errorCount > 0 ? 3 : 2);
    win.toast(`Batch deleted ${deletedCount} items.`);
    performSearch();
  });

  // Graveyard: Undo / Restore Most Recent Rip
  win.onClick("btn_unbury_last", () => {
    try {
      const allBuried = seanceGraveyard({ graveyardDir }).filter((i) => i.status === "buried");
      if (allBuried.length === 0) {
        win.toast("Graveyard is empty. Nothing to restore.");
        return;
      }
      const lastBuried = allBuried[0];
      const res = unburyTargetsSync([lastBuried.id], { graveyardDir });
      if (res.restored.length > 0) {
        logConsole(`[Rip Engine] Restored '${lastBuried.name}' back to '${lastBuried.originalPath}'`, 2);
        win.toast(`Restored '${lastBuried.name}'!`);
        refreshGraveyard();
        performSearch();
      } else if (res.errors.length > 0) {
        logConsole(`[Rip Undo Error]: ${res.errors[0].error}`, 3);
        win.toast(`Restore failed: ${res.errors[0].error}`);
      }
    } catch (err: any) {
      logConsole(`[Rip Undo Error]: ${err.message}`, 3);
      win.toast(`Restore failed: ${err.message}`);
    }
  });

  // Graveyard Table row click
  win.onClick("tbl_graveyard", (_, rowIdentifier) => {
    const item = graveyardItems.find(
      (g) => g.id === rowIdentifier || g.name === rowIdentifier || g.originalPath === rowIdentifier
    );
    if (item) updateSelectedGraveyardInspector(item);
  });

  // Restore Selected Buried Item
  win.onClick("btn_unbury_selected", () => {
    if (!selectedGraveyardItem) {
      win.toast("Please select a buried item from the graveyard table first.");
      return;
    }
    try {
      const res = unburyTargetsSync([selectedGraveyardItem.id], { graveyardDir });
      if (res.restored.length > 0) {
        logConsole(`[Rip Engine] Restored '${selectedGraveyardItem.name}' -> '${selectedGraveyardItem.originalPath}'`, 2);
        win.toast(`Restored '${selectedGraveyardItem.name}' to original path!`);
        refreshGraveyard();
        performSearch();
      } else if (res.errors.length > 0) {
        logConsole(`[Rip Restore Error]: ${res.errors[0].error}`, 3);
        win.toast(`Restore failed: ${res.errors[0].error}`);
      }
    } catch (err: any) {
      logConsole(`[Rip Restore Error]: ${err.message}`, 3);
      win.toast(`Restore failed: ${err.message}`);
    }
  });

  // Decompose Selected Buried Item (Permanent Deletion)
  win.onClick("btn_decompose_selected", () => {
    if (!selectedGraveyardItem) {
      win.toast("Please select a buried item to decompose.");
      return;
    }
    const name = selectedGraveyardItem.name;
    try {
      const res = decomposeGraveyardSync({ graveyardDir, itemIds: [selectedGraveyardItem.id] });
      logConsole(`[Rip Engine] Decomposed (permanently deleted) '${name}' from graveyard (${formatHumanSize(res.totalBytesFreed)} freed)`, 2);
      win.toast(`Permanently deleted '${name}' from graveyard.`);
      selectedGraveyardItem = null;
      refreshGraveyard();
    } catch (err: any) {
      logConsole(`[Rip Decompose Error]: ${err.message}`, 3);
      win.toast(`Decompose failed: ${err.message}`);
    }
  });

  // Empty Entire Graveyard
  win.onClick("btn_decompose_all", () => {
    try {
      const res = decomposeGraveyardSync({ graveyardDir, all: true });
      logConsole(`[Rip Engine] Emptied graveyard. Decomposed ${res.decomposed.length} items (${formatHumanSize(res.totalBytesFreed)} freed).`, 2);
      win.toast(`Emptied graveyard (${res.decomposed.length} items).`);
      selectedGraveyardItem = null;
      refreshGraveyard();
    } catch (err: any) {
      logConsole(`[Rip Empty Error]: ${err.message}`, 3);
      win.toast(`Empty graveyard failed: ${err.message}`);
    }
  });

  // Refresh Graveyard Telemetry
  win.onClick("btn_refresh_graveyard", () => {
    refreshGraveyard();
    win.toast("Graveyard telemetry refreshed.");
    logConsole("[Rip Engine] Graveyard quarantine telemetry refreshed.", 1);
  });

  win.onClick("btn_clear_console", () => {
    win.clearConsole("fd_console");
    logConsole("[Fd Studio Pro] Activity console cleared.", 1);
  });

  // -----------------------------------------------------------------------------------------------
  // 7. Client-Side Full-Screen Responsive Layout & Ergonomics Engine
  // -----------------------------------------------------------------------------------------------
  win.addScript(`
    (function() {
      function initFdStudioResponsiveEngine() {
        if (document.getElementById("fd_root")) return;

        // Inject responsive styles
        const styleEl = document.createElement("style");
        styleEl.id = "fd_responsive_styles";
        styleEl.textContent = [
          ":root {",
          "  --fd-table-h: 380px;",
          "  --fd-console-h: 130px;",
          "}",
          "html, body {",
          "  width: 100% !important;",
          "  min-height: 100% !important;",
          "  margin: 0 !important;",
          "  padding: 0 !important;",
          "  overflow-x: hidden !important;",
          "  overflow-y: auto !important;",
          "  box-sizing: border-box !important;",
          "}",
          "#fd_root {",
          "  display: flex !important;",
          "  flex-direction: column !important;",
          "  gap: 12px !important;",
          "  width: 100% !important;",
          "  max-width: 100% !important;",
          "  padding: 14px 18px !important;",
          "  box-sizing: border-box !important;",
          "}",
          "#groupbox_1, #groupbox_2, #groupbox_3, #groupbox_4, #groupbox_5, #groupbox_6, #groupbox_7, fieldset {",
          "  display: none !important;",
          "}",
          ".fd-card {",
          "  background: var(--card-bg, #161922) !important;",
          "  border: 1px solid var(--card-border, #232936) !important;",
          "  border-radius: 10px !important;",
          "  padding: 12px 14px !important;",
          "  box-sizing: border-box !important;",
          "  width: 100% !important;",
          "  display: flex !important;",
          "  flex-direction: column !important;",
          "  gap: 10px !important;",
          "  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;",
          "}",
          ".fd-row input[type='text'], .fd-row input[type='search'] {",
          "  flex: 1 1 160px !important;",
          "  min-width: 100px !important;",
          "}",
          ".fd-row select {",
          "  flex: 0 1 auto !important;",
          "  min-width: 110px !important;",
          "}",
          ".fd-card-header {",
          "  font-size: 11px !important;",
          "  font-weight: 700 !important;",
          "  color: var(--accent, #38bdf8) !important;",
          "  text-transform: uppercase !important;",
          "  letter-spacing: 0.6px !important;",
          "  user-select: none !important;",
          "}",
          ".fd-row {",
          "  display: flex !important;",
          "  flex-wrap: wrap !important;",
          "  gap: 8px !important;",
          "  align-items: center !important;",
          "  width: 100% !important;",
          "  box-sizing: border-box !important;",
          "}",
          ".fd-row button, .fd-header-right button {",
          "  width: auto !important;",
          "  min-width: max-content !important;",
          "  white-space: nowrap !important;",
          "  padding: 7px 14px !important;",
          "}",
          ".fd-header-bar {",
          "  display: flex !important;",
          "  flex-wrap: wrap !important;",
          "  justify-content: space-between !important;",
          "  align-items: center !important;",
          "  gap: 12px !important;",
          "  width: 100% !important;",
          "  padding: 4px 2px 8px 2px !important;",
          "  border-bottom: 1px solid var(--card-border, #232936) !important;",
          "}",
          ".fd-header-left {",
          "  display: flex !important;",
          "  flex-direction: column !important;",
          "  gap: 2px !important;",
          "}",
          ".fd-header-right {",
          "  display: flex !important;",
          "  flex-wrap: wrap !important;",
          "  align-items: center !important;",
          "  gap: 8px !important;",
          "}",
          ".fd-rel-item {",
          "  position: relative !important;",
          "  left: auto !important;",
          "  top: auto !important;",
          "  right: auto !important;",
          "  bottom: auto !important;",
          "  margin: 0 !important;",
          "}",
          "#tbl_results, #tbl_graveyard {",
          "  position: relative !important;",
          "  left: auto !important;",
          "  top: auto !important;",
          "  width: 100% !important;",
          "  max-width: 100% !important;",
          "  height: var(--fd-table-h, 380px) !important;",
          "  min-height: 220px !important;",
          "  overflow: auto !important;",
          "  border: 1px solid var(--card-border, #232936) !important;",
          "  border-radius: 8px !important;",
          "  background: var(--card-bg, #161922) !important;",
          "  box-sizing: border-box !important;",
          "}",
          "#tbl_results table, #tbl_graveyard table {",
          "  width: 100% !important;",
          "  min-width: 650px !important;",
          "  border-collapse: collapse !important;",
          "}",
          "#fd_console {",
          "  position: relative !important;",
          "  left: auto !important;",
          "  top: auto !important;",
          "  width: 100% !important;",
          "  max-width: 100% !important;",
          "  height: var(--fd-console-h, 130px) !important;",
          "  min-height: 80px !important;",
          "  overflow: auto !important;",
          "  box-sizing: border-box !important;",
          "}",
          "#txt_pattern {",
          "  flex: 3 1 240px !important;",
          "  min-width: 180px !important;",
          "}",
          "#txt_root {",
          "  flex: 2 1 160px !important;",
          "  min-width: 120px !important;",
          "}",
          "#txt_exec_cmd, #txt_dest_dir {",
          "  flex: 2 1 200px !important;",
          "  min-width: 160px !important;",
          "}",
          ".rad-checkbox-label {",
          "  margin-right: 12px !important;",
          "}"
        ].join("\\n");
        document.head.appendChild(styleEl);

        function getNode(id) {
          const el = document.getElementById(id);
          if (!el) return null;
          const target = (el.parentElement && el.parentElement !== document.body && el.parentElement.id !== "fd_root" && el.parentElement.style.position === "absolute")
            ? el.parentElement
            : el;
          target.classList.add("fd-rel-item");
          target.style.position = "relative";
          target.style.left = "auto";
          target.style.top = "auto";
          target.style.right = "auto";
          target.style.bottom = "auto";
          target.style.margin = "0";
          return target;
        }

        function createRow(children) {
          const row = document.createElement("div");
          row.className = "fd-row";
          for (const ch of children) {
            if (!ch) continue;
            const node = typeof ch === "string" ? getNode(ch) : ch;
            if (node) row.appendChild(node);
          }
          return row;
        }

        function createCard(title, rows) {
          const card = document.createElement("div");
          card.className = "fd-card";
          if (title) {
            const h = document.createElement("div");
            h.className = "fd-card-header";
            h.textContent = title;
            card.appendChild(h);
          }
          for (const r of rows) {
            if (r) card.appendChild(r);
          }
          return card;
        }

        const root = document.createElement("div");
        root.id = "fd_root";

        // 1. Header Bar
        const headerBar = document.createElement("div");
        headerBar.className = "fd-header-bar";
        const headerLeft = document.createElement("div");
        headerLeft.className = "fd-header-left";
        const titleNode = getNode("label_1");
        const subNode = getNode("label_2");
        if (titleNode) {
          titleNode.style.fontWeight = "800";
          titleNode.style.fontSize = "20px";
          titleNode.style.height = "auto";
          titleNode.style.width = "auto";
          headerLeft.appendChild(titleNode);
        }
        if (subNode) {
          subNode.style.fontSize = "11px";
          subNode.style.opacity = "0.75";
          subNode.style.height = "auto";
          subNode.style.width = "auto";
          headerLeft.appendChild(subNode);
        }
        const headerRight = document.createElement("div");
        headerRight.className = "fd-header-right";
        const themeLbl = getNode("lbl_dd_theme");
        const themeDd = getNode("dd_theme");
        const btnUnburyLast = getNode("btn_unbury_last");
        const btnToggleGraveyard = getNode("btn_toggle_graveyard");
        const btnFull = getNode("btn_fullscreen");
        const btnSave = getNode("btn_save_state");
        const btnCenter = getNode("btn_center");
        if (themeLbl) { themeLbl.style.width = "auto"; headerRight.appendChild(themeLbl); }
        if (themeDd) headerRight.appendChild(themeDd);
        if (btnUnburyLast) headerRight.appendChild(btnUnburyLast);
        if (btnToggleGraveyard) headerRight.appendChild(btnToggleGraveyard);
        if (btnFull) headerRight.appendChild(btnFull);
        if (btnSave) headerRight.appendChild(btnSave);
        if (btnCenter) headerRight.appendChild(btnCenter);
        headerBar.appendChild(headerLeft);
        headerBar.appendChild(headerRight);
        root.appendChild(headerBar);

        // 2. Search Target & Pattern Card
        const searchCard = createCard("Search Target & Pattern", [
          createRow(["lbl_pattern", "txt_pattern", "lbl_root", "txt_root", "lbl_mode", "dd_mode", "lbl_case", "dd_case", "btn_search", "btn_toggle_watch", "btn_clear"])
        ]);
        root.appendChild(searchCard);

        // 3. Filters & Advanced Options Card
        const filtersCard = createCard("Filters & Advanced Options", [
          createRow(["btn_type_all", "btn_type_files", "btn_type_dirs", "btn_type_exec", "btn_type_symlinks", "btn_type_empty"]),
          createRow(["lbl_exts", "txt_exts", "lbl_exclude", "txt_exclude", "lbl_max_depth", "txt_max_depth", "lbl_size", "txt_size", "lbl_age", "dd_age"]),
          createRow(["chk_hidden", "chk_no_ignore", "chk_follow", "chk_full_path", "chk_watch"])
        ]);
        root.appendChild(filtersCard);

        // 4. Matching Files & Directories Card
        const tableNode = getNode("tbl_results");
        const resultsCard = createCard("Matching Files & Directories (Click any item to inspect & preview)", [
          tableNode
        ]);
        root.appendChild(resultsCard);

        // 5. Selected File Inspector & Single-Item Actions Card
        const selName = getNode("lbl_selected_name");
        const selStats = getNode("lbl_selected_stats");
        const selHash = getNode("lbl_selected_hash");
        if (selName) selName.style.width = "auto";
        if (selStats) selStats.style.width = "auto";
        if (selHash) selHash.style.width = "auto";

        const inspectorCard = createCard("Selected File Inspector & Single-Item Actions", [
          createRow([selName, selStats, selHash]),
          createRow(["btn_copy_rel", "btn_copy_abs", "btn_reveal", "btn_preview_content", "btn_move_one", "btn_bury_one", "btn_delete_one"]),
          createRow(["lbl_exec_tmpl", "txt_exec_cmd", "btn_exec_one", "btn_exec_all"])
        ]);
        root.appendChild(inspectorCard);

        // 6. Batch Operations, Bulk File Management & Export Toolkit Card
        const batchCard = createCard("Batch Operations, Bulk File Management & Export Toolkit", [
          createRow(["lbl_dest", "txt_dest_dir", "btn_copy_all_files", "btn_move_all", "btn_archive_all"]),
          createRow(["btn_copy_all_rel", "btn_copy_all_abs", "btn_export_json", "btn_export_csv", "btn_bury_all", "btn_delete_all"])
        ]);
        root.appendChild(batchCard);

        // 7. Graveyard Quarantine & Recovery Card (Rip Engine)
        const ripTotalNode = getNode("lbl_rip_metric_total");
        const ripSizeNode = getNode("lbl_rip_metric_size");
        const ripTodayNode = getNode("lbl_rip_metric_today");
        const ripPathNode = getNode("lbl_rip_metric_path");
        const ripSelNode = getNode("lbl_rip_selected");
        if (ripTotalNode) ripTotalNode.style.width = "auto";
        if (ripSizeNode) ripSizeNode.style.width = "auto";
        if (ripTodayNode) ripTodayNode.style.width = "auto";
        if (ripPathNode) ripPathNode.style.width = "auto";
        if (ripSelNode) ripSelNode.style.width = "auto";

        const graveyardTableNode = getNode("tbl_graveyard");
        const graveyardCard = createCard("Graveyard Quarantine & Recovery (Rip Engine)", [
          createRow([ripTotalNode, ripSizeNode, ripTodayNode, ripPathNode]),
          graveyardTableNode,
          createRow([ripSelNode]),
          createRow(["btn_unbury_selected", "btn_decompose_selected", "btn_decompose_all", "btn_refresh_graveyard"])
        ]);
        graveyardCard.id = "card_graveyard";
        root.appendChild(graveyardCard);

        if (btnToggleGraveyard) {
          btnToggleGraveyard.addEventListener("click", function() {
            if (graveyardCard) {
              const isHidden = graveyardCard.style.display === "none";
              graveyardCard.style.display = isHidden ? "flex" : "none";
              if (isHidden) {
                graveyardCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }
          });
        }

        // 8. Preview & Command Output Card
        const consoleNode = getNode("fd_console");
        const statusNode = getNode("lbl_status");
        if (statusNode) statusNode.style.width = "auto";

        const consoleCard = createCard("Preview & Command Output", [
          consoleNode,
          createRow(["btn_clear_console", statusNode])
        ]);
        root.appendChild(consoleCard);

        // Mount responsive root
        document.body.insertBefore(root, document.body.firstChild);

        // Dynamic Viewport Sizing on Window Resize
        function updateDynamicViewportHeights() {
          const vh = window.innerHeight || document.documentElement.clientHeight || 900;
          const tableH = Math.max(260, Math.floor(vh * 0.38));
          const consoleH = Math.max(100, Math.min(240, Math.floor(vh * 0.14)));
          document.documentElement.style.setProperty('--fd-table-h', tableH + 'px');
          document.documentElement.style.setProperty('--fd-console-h', consoleH + 'px');
        }
        window.addEventListener('resize', updateDynamicViewportHeights);
        updateDynamicViewportHeights();

        // Table Row Selection
        window.onTableRowClick = function(tr) {
          if (!tr) return;
          const table = tr.closest("table");
          const isGraveyard = table && table.closest("#tbl_graveyard");
          const cells = tr.querySelectorAll("td");
          if (isGraveyard) {
            const id = cells[0]?.textContent?.trim() || "";
            if (window.on_sel_graveyard_ipc_change) {
              window.on_sel_graveyard_ipc_change(id);
            }
          } else {
            const name = cells[0]?.textContent?.trim() || "";
            const relPath = cells[3]?.textContent?.trim() || "";
            if (window.on_sel_file_ipc_change) {
              window.on_sel_file_ipc_change(relPath || name);
            }
          }
        };
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFdStudioResponsiveEngine);
      } else {
        setTimeout(initFdStudioResponsiveEngine, 20);
      }
    })();
  `);

  // Clean up active watcher when window closes or process exits
  win.onClose(() => {
    stopAll();
  });

  const onProcessShutdown = () => {
    stopAll();
    process.exit(0);
  };

  process.on("exit", () => stopAll());
  process.on("SIGINT", onProcessShutdown);
  process.on("SIGTERM", onProcessShutdown);
  process.on("beforeExit", () => stopAll());

  // Pre-populate search and graveyard immediately on creation so initial tables are populated on first frame
  performSearch();
  refreshGraveyard();

  return win;
}

export function generateFdStudioHtml(): string {
  const win = createFdStudio({ fullscreen: false });
  return win.generateHtml();
}

/**
 * HTTP Web Server for Fd Studio Pro Workstation
 * Enables interactive browser testing via browser_subagent and remote web usage.
 */
export function startFdStudioServer(options: { port?: number; host?: string } = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const win = createFdStudio({ fullscreen: false });

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
      if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(win.generateHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      if (url.pathname === "/api/search") {
        const pattern = url.searchParams.get("pattern") || "";
        const searchRoot = url.searchParams.get("root") || ".";
        const result = executeFdSearch({ pattern, searchRoot });
        return Response.json(result, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  const resolvedPort = server.port;
  console.log(`⚡ Fd Studio Pro server online: http://${hostname}:${resolvedPort}`);
  return {
    server,
    port: resolvedPort,
    url: `http://${hostname}:${resolvedPort}`,
    stop: () => server.stop(true),
  };
}

if (import.meta.main) {
  const win = createFdStudio({ fullscreen: true });
  console.log("⚡ Launching Fd Studio Pro (Native Bun Filesystem Traversal)...");
  win.run();
}
