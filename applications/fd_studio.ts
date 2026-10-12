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
import { packTarGz, type TarEntry } from "../src/features/rad/modules/tarutils";
import {
  createFileAt,
  createFolderAt,
  renamePath,
  duplicatePath,
  undoEntry,
  openWithDefaultApp,
  chmodPath,
  planBatchRename,
  applyRenamePlan,
  searchContents,
  findDuplicates,
  largestFiles,
  sizeByExtension,
  hexPreview,
  toTsv,
  toMarkdownTable,
  type UndoEntry,
  type RenameRules,
  type RenamePlanRow,
} from "./fd_ops";
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
  win.addLabel("lbl_min_depth", "Min Depth:");
  win.addInput("txt_min_depth", "", "e.g. 1", { width: 70 });
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
  // 6b. File Operations & Analysis Toolkit
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("File Operations & Analysis Toolkit");
  win.beginRow();
  win.addLabel("lbl_ops_name", "Name:");
  win.addInput("txt_ops_name", "", "New name for file / folder / rename...", { width: 240 });
  win.addButton("btn_new_file", "📄 New File");
  win.addButton("btn_new_folder", "📁 New Folder");
  win.addButton("btn_rename_one", "✏️ Rename Selected");
  win.addButton("btn_duplicate_one", "⧉ Duplicate");
  win.addButton("btn_open_one", "↗ Open");
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_chmod", "Permissions:");
  win.addInput("txt_chmod", "644", "644, 755 or rwxr-xr-x", { width: 110 });
  win.addButton("btn_chmod", "🔐 Set Permissions");
  win.addButton("btn_preview_hex", "🔢 Hex View");
  win.addButton("btn_undo_op", "↶ Undo Last Change (0)");
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_br", "Batch Rename (all matches):");
  win.addInput("txt_br_find", "", "Find...", { width: 120 });
  win.addInput("txt_br_replace", "", "Replace with...", { width: 120 });
  win.addCheckbox("chk_br_regex", "Regex", false);
  win.addDropdown("dd_br_case", ["Keep Case", "lowercase", "UPPERCASE", "Title Case"], "Keep Case", { width: 120 });
  win.addInput("txt_br_prefix", "", "Prefix", { width: 80 });
  win.addInput("txt_br_suffix", "", "Suffix", { width: 80 });
  win.addCheckbox("chk_br_number", "Add 001, 002…", false);
  win.addCheckbox("chk_br_spaces", "Spaces → _", false);
  win.addButton("btn_br_preview", "👁 Preview Rename");
  win.addButton("btn_br_apply", "✅ Apply Rename");
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_grep", "Search Inside Files:");
  win.addInput("txt_grep", "", "Text to find in matched files...", { width: 230 });
  win.addCheckbox("chk_grep_regex", "Regex", false);
  win.addCheckbox("chk_grep_case", "Match case", false);
  win.addButton("btn_grep", "🔎 Search Contents");
  win.addButton("btn_dupes", "👯 Find Duplicates");
  win.addButton("btn_largest", "🐘 Largest Files");
  win.addButton("btn_ext_stats", "📊 Usage by Type");
  win.endRow();
  win.beginRow();
  win.addButton("btn_export_tsv", "📑 Export TSV");
  win.addButton("btn_export_md", "📝 Export Markdown");
  win.addButton("btn_export_paths", "🗒 Export Path List");
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

  const renderConsoleHtml = () => {
    win.evalJS(`
      (function() {
        const consoleEl = document.getElementById("fd_console");
        if (!consoleEl) return;
        const raw = String(consoleEl.textContent || "");
        const lines = raw.split(/\n/).filter((line) => line.trim().length > 0);

        function escapeHtml(value) {
          return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        const html = lines.length
          ? lines.map((line) => {
              let badgeClass = "info";
              let badgeLabel = "INFO";
              const normalized = line.toUpperCase();
              if (normalized.includes("SUCCESS") || normalized.includes("✅")) {
                badgeClass = "success";
                badgeLabel = "SUCCESS";
              } else if (normalized.includes("ERROR") || normalized.includes("❌")) {
                badgeClass = "error";
                badgeLabel = "ERROR";
              } else if (normalized.includes("WARN") || normalized.includes("⚠️")) {
                badgeClass = "warn";
                badgeLabel = "WARN";
              }

              const stripped = line.replace(/^\[[^\]]*\]\s*/, "");
              const message = stripped.replace(/\[[A-Z]+\]\s*/g, "");
              return '<div class="fd-console-line"><span class="fd-console-badge ' + badgeClass + '">' + badgeLabel + '</span><span class="fd-console-text">' + escapeHtml(message) + '</span></div>';
            }).join("")
          : '<div class="fd-console-line fd-console-empty">Console ready.</div>';

        consoleEl.innerHTML = html;
        consoleEl.scrollTop = consoleEl.scrollHeight;
      })();
    `);
  };

  const logConsole = (msg: string, style = 1) => {
    const time = new Date().toLocaleTimeString();
    const badge = style === 2 ? "✅ SUCCESS" : style === 3 ? "❌ ERROR" : style === 1 ? "⚠️ WARN" : "ℹ️ INFO";
    win.appendConsole("fd_console", `[${time}] [${badge}] ${msg}\n`, style);
    renderConsoleHtml();
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
      graveyardItems = seanceGraveyard({ graveyardDir, all: true });

      win.setText("lbl_rip_metric_total", `Buried Items: ${stats.totalItems}`);
      win.setText("lbl_rip_metric_size", `Total Size: ${stats.totalHumanSize}`);
      win.setText("lbl_rip_metric_today", `Buried Today: ${stats.buriedTodayCount}`);
      win.setText("btn_toggle_graveyard", `🪦 Graveyard (${stats.totalItems})`);

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
        updateSelectedGraveyardInspector(graveyardItems[0] ?? null);
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
    const minDepthRaw = String(win.getValue("txt_min_depth") || "");
    const minDepth = minDepthRaw ? parseInt(minDepthRaw, 10) : undefined;

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
      minDepth: Number.isFinite(minDepth as number) ? minDepth : undefined,
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
      const targetItem = stillSelected || result.items[0];
      if (targetItem) updateSelectedInspector(targetItem);
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
    if (updateUi && win.isRunning()) {
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
  win.onClick("btn_toggle_graveyard", () => {
    win.evalJS(`
      (function() {
        const graveyardCard = document.getElementById("card_graveyard");
        if (graveyardCard) {
          const isHidden = graveyardCard.style.display === "none";
          graveyardCard.style.display = isHidden ? "flex" : "none";
          if (isHidden) {
            graveyardCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      })();
    `);
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

  // Reveal in OS File Manager
  win.onClick("btn_reveal", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    const fullPath = path.resolve(selectedItem.path);
    if (process.platform === "darwin") {
      Bun.spawnSync(["open", "-R", fullPath]);
    } else if (process.platform === "win32") {
      Bun.spawnSync(["explorer.exe", `/select,${fullPath}`]);
    } else {
      Bun.spawnSync(["xdg-open", path.dirname(fullPath)]);
    }
    win.toast(`Revealed in file manager: ${selectedItem.name}`);
    logConsole(`[Finder] Revealed item: ${fullPath}`, 1);
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
      if (path.resolve(selectedItem.path) === targetPath) {
        win.toast("Item is already in the target destination.");
        return;
      }
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
      if (res.buriedItems.length > 0) {
        logConsole(`[Rip Engine] Safely buried '${targetName}' into Rip graveyard (${formatHumanSize(res.totalBytesBuried)} freed)`, 2);
        win.toast(`Safely buried '${targetName}' (Rip)`);
        refreshGraveyard();
        performSearch();
      } else if (res.failed.length > 0) {
        const errorMsg = res.failed[0]?.error ?? "Unknown error";
        logConsole(`[Rip Engine Error]: ${errorMsg}`, 3);
        win.toast(`Failed to bury: ${errorMsg}`);
      }
    } catch (err: any) {
      logConsole(`[Rip Error]: ${err.message}`, 3);
      win.toast(`Failed to bury item: ${err.message}`);
    }
  });

  // Delete Single Selected Item
  win.onClick("btn_delete_one", async () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    const targetPath = selectedItem.path;
    const targetName = selectedItem.name;
    const resolvedTarget = path.resolve(targetPath);
    if (resolvedTarget === process.cwd() || resolvedTarget === path.parse(resolvedTarget).root) {
      win.toast("Cannot delete workspace root directory!");
      logConsole("[Delete] Protected workspace root directory deletion blocked.", 3);
      return;
    }
    const okDelete = await win.confirm(
      `Permanently delete "${targetName}"?\n\n${resolvedTarget}\n\nThis cannot be undone (use Bury to keep it recoverable).`,
      "Confirm Permanent Delete"
    );
    if (!okDelete) {
      win.toast("Delete cancelled.");
      return;
    }
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
      if (currentResults.length > 0 && currentResults[0]) {
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
    const rawTmpl = win.getValue("txt_exec_cmd");
    const tmpl = (rawTmpl && rawTmpl.trim()) ? rawTmpl.trim() : "ls -ld {}";
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
    const rawTmpl = win.getValue("txt_exec_cmd");
    const tmpl = (rawTmpl && rawTmpl.trim()) ? rawTmpl.trim() : "ls -ld {}";
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
        const itemResolved = path.resolve(item.path);
        if (itemResolved === destDir || itemResolved.startsWith(destDir + path.sep)) {
          continue;
        }
        const targetPath = path.join(destDir, item.name);
        if (itemResolved === path.resolve(targetPath)) {
          continue;
        }
        try {
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
        const itemResolved = path.resolve(item.path);
        if (itemResolved === destDir || itemResolved.startsWith(destDir + path.sep)) {
          continue;
        }
        const targetPath = path.join(destDir, item.name);
        if (itemResolved === path.resolve(targetPath)) {
          continue;
        }
        try {
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

      const tarEntries: TarEntry[] = [];
      for (const item of currentResults) {
        if (item.type === "file") {
          try {
            const data = fs.readFileSync(item.path);
            tarEntries.push({
              name: item.relativePath,
              data,
              mode: item.mode,
              mtime: new Date(item.mtimeMs),
              type: "file",
            });
          } catch {
            // skip if unreadable
          }
        }
      }

      if (tarEntries.length === 0) {
        win.toast("No files to archive (only directories matched).");
        return;
      }

      const gzBytes = packTarGz(tarEntries);
      fs.writeFileSync(archivePath, gzBytes);
      const sizeMb = (gzBytes.byteLength / (1024 * 1024)).toFixed(2);
      logConsole(`[Archive] Created archive: ${archivePath} (${sizeMb} MB, ${tarEntries.length} files)`, 2);
      win.toast(`Archived ${tarEntries.length} files to .tar.gz!`);
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
        `[Rip Engine] Batch buried ${res.buriedItems.length} of ${paths.length} items into graveyard (${formatHumanSize(res.totalBytesBuried)} freed, ${res.failed.length} errors)`,
        res.failed.length > 0 ? 3 : 2
      );
      win.toast(`Batch buried ${res.buriedItems.length} items into Rip graveyard!`);
      refreshGraveyard();
      performSearch();
    } catch (err: any) {
      logConsole(`[Rip Batch Error]: ${err.message}`, 3);
      win.toast(`Batch bury failed: ${err.message}`);
    }
  });

  // Batch Delete All Matched Items
  win.onClick("btn_delete_all", async () => {
    if (currentResults.length === 0) {
      win.toast("No matching items to delete.");
      return;
    }
    const cwd = process.cwd();
    const countToDelete = currentResults.length;
    const okBulk = await win.confirm(
      `Permanently delete ALL ${countToDelete} matched item(s)?\n\nThis cannot be undone (use Bury All to keep them recoverable).`,
      "Confirm Bulk Permanent Delete"
    );
    if (!okBulk) {
      win.toast("Bulk delete cancelled.");
      return;
    }
    let deletedCount = 0;
    let errorCount = 0;
    for (const item of currentResults) {
      const resolved = path.resolve(item.path);
      if (resolved === cwd || resolved === path.parse(resolved).root) {
        continue;
      }
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
      const allBuried = seanceGraveyard({ graveyardDir, all: true }).filter((i) => i.status === "buried");
      const lastBuried = allBuried[0];
      if (!lastBuried) {
        win.toast("Graveyard is empty. Nothing to restore.");
        return;
      }
      const res = unburyTargetsSync([lastBuried.id], { graveyardDir });
      if (res.restoredItems.length > 0) {
        logConsole(`[Rip Engine] Restored '${lastBuried.name}' back to '${lastBuried.originalPath}'`, 2);
        win.toast(`Restored '${lastBuried.name}'!`);
        refreshGraveyard();
        performSearch();
      } else if (res.failed.length > 0) {
        const errorMsg = res.failed[0]?.error ?? "Unknown error";
        logConsole(`[Rip Undo Error]: ${errorMsg}`, 3);
        win.toast(`Restore failed: ${errorMsg}`);
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
      if (res.restoredItems.length > 0) {
        logConsole(`[Rip Engine] Restored '${selectedGraveyardItem.name}' -> '${selectedGraveyardItem.originalPath}'`, 2);
        win.toast(`Restored '${selectedGraveyardItem.name}' to original path!`);
        refreshGraveyard();
        performSearch();
      } else if (res.failed.length > 0) {
        const errorMsg = res.failed[0]?.error ?? "Unknown error";
        logConsole(`[Rip Restore Error]: ${errorMsg}`, 3);
        win.toast(`Restore failed: ${errorMsg}`);
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
      const res = decomposeGraveyardSync({ graveyardDir, targets: [selectedGraveyardItem.id] });
      logConsole(`[Rip Engine] Decomposed (permanently deleted) '${name}' from graveyard (${res.freedHumanSize} freed)`, 2);
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
      logConsole(`[Rip Engine] Emptied graveyard. Decomposed ${res.deletedCount} items (${res.freedHumanSize} freed).`, 2);
      win.toast(`Emptied graveyard (${res.deletedCount} items).`);
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
    win.evalJS(`
      (function() {
        const consoleEl = document.getElementById("fd_console");
        if (!consoleEl) return;
        consoleEl.innerHTML = '<div class="fd-console-line fd-console-empty">Console cleared.</div>';
        consoleEl.scrollTop = consoleEl.scrollHeight;
      })();
    `);
  });

  // -----------------------------------------------------------------------------------------------
  // 6b. File Operations & Analysis Toolkit (rename / create / duplicate / open / chmod / undo / grep / dupes)
  // -----------------------------------------------------------------------------------------------
  const undoStack: UndoEntry[] = [];
  const pushUndo = (entries: UndoEntry[]) => {
    undoStack.push(...entries);
    win.setText("btn_undo_op", `↶ Undo Last Change (${undoStack.length})`);
  };
  const fail = (label: string, err: any) => {
    logConsole(`[${label} Error]: ${err.message || err}`, 3);
    win.toast(`${label} failed: ${err.message || err}`);
  };
  const needSelection = (): FdItem | null => {
    if (!selectedItem) {
      win.toast("Please select an item in the results table first.");
      return null;
    }
    return selectedItem;
  };
  /** New File / New Folder are always created in the Search Root (predictable; the full path is logged). */
  const creationDir = (): string => path.resolve(win.getValue("txt_root") || ".");

  win.onClick("btn_new_file", () => {
    try {
      const entry = createFileAt(creationDir(), win.getValue("txt_ops_name") || "");
      pushUndo([entry]);
      logConsole(`[Create] New file: ${(entry as any).path}`, 2);
      win.toast("File created");
      performSearch();
    } catch (e: any) { fail("Create file", e); }
  });
  win.onClick("btn_new_folder", () => {
    try {
      const entry = createFolderAt(creationDir(), win.getValue("txt_ops_name") || "");
      pushUndo([entry]);
      logConsole(`[Create] New folder: ${(entry as any).path}`, 2);
      win.toast("Folder created");
      performSearch();
    } catch (e: any) { fail("Create folder", e); }
  });
  win.onClick("btn_rename_one", () => {
    const it = needSelection();
    if (!it) return;
    try {
      const entry = renamePath(it.path, win.getValue("txt_ops_name") || "");
      pushUndo([entry]);
      logConsole(`[Rename] '${it.name}' -> '${path.basename((entry as any).to)}'`, 2);
      win.toast("Renamed");
      selectedItem = null;
      performSearch();
    } catch (e: any) { fail("Rename", e); }
  });
  win.onClick("btn_duplicate_one", () => {
    const it = needSelection();
    if (!it) return;
    try {
      const entry = duplicatePath(it.path);
      pushUndo([entry]);
      logConsole(`[Duplicate] Created copy: ${(entry as any).path}`, 2);
      win.toast("Duplicated");
      performSearch();
    } catch (e: any) { fail("Duplicate", e); }
  });
  win.onClick("btn_open_one", () => {
    const it = needSelection();
    if (!it) return;
    try {
      openWithDefaultApp(it.path);
      logConsole(`[Open] Opened with default app: ${it.path}`, 1);
      win.toast(`Opening ${it.name}`);
    } catch (e: any) { fail("Open", e); }
  });
  win.onClick("btn_chmod", () => {
    const it = needSelection();
    if (!it) return;
    try {
      const res = chmodPath(it.path, win.getValue("txt_chmod") || "");
      logConsole(`[Permissions] ${it.name}: ${res.before} -> ${res.after}`, 2);
      win.toast(`Permissions set to ${res.after}`);
      performSearch();
    } catch (e: any) { fail("Permissions", e); }
  });
  win.onClick("btn_preview_hex", () => {
    const it = needSelection();
    if (!it) return;
    if (it.type === "directory") { win.toast("Hex view works on files only."); return; }
    try {
      logConsole(`--- [Hex view: ${it.name} (first 256 bytes)] ---\n${hexPreview(it.path, 256)}`, 1);
    } catch (e: any) { fail("Hex view", e); }
  });
  win.onClick("btn_undo_op", () => {
    const entry = undoStack.pop();
    if (!entry) { win.toast("Nothing to undo."); return; }
    try {
      const msg = undoEntry(entry);
      logConsole(`[Undo] ${msg}`, 2);
      win.toast("Undone");
    } catch (e: any) {
      undoStack.push(entry);
      fail("Undo", e);
    }
    win.setText("btn_undo_op", `↶ Undo Last Change (${undoStack.length})`);
    selectedItem = null;
    performSearch();
  });

  // Batch rename (preview first, then apply)
  const readRenameRules = (): RenameRules => {
    const c = String(win.getValue("dd_br_case") || "Keep Case");
    return {
      find: win.getValue("txt_br_find") || "",
      replace: win.getValue("txt_br_replace") || "",
      useRegex: Boolean(win.getValue("chk_br_regex")),
      prefix: win.getValue("txt_br_prefix") || "",
      suffix: win.getValue("txt_br_suffix") || "",
      numbering: Boolean(win.getValue("chk_br_number")),
      spacesToUnderscore: Boolean(win.getValue("chk_br_spaces")),
      caseMode: c.includes("lower") ? "lower" : c.includes("UPPER") ? "upper" : c.includes("Title") ? "title" : "none",
    };
  };
  const buildRenamePlan = (): RenamePlanRow[] | null => {
    if (currentResults.length === 0) { win.toast("Search for files first — rename applies to all matches."); return null; }
    try {
      return planBatchRename(currentResults.map((r) => r.path), readRenameRules());
    } catch (e: any) { fail("Batch rename", e); return null; }
  };
  win.onClick("btn_br_preview", () => {
    const plan = buildRenamePlan();
    if (!plan) return;
    const changes = plan.filter((p) => p.from !== p.to);
    const bad = changes.filter((p) => p.error).length;
    const lines = changes.slice(0, 40).map((p) => `${p.error ? "✗" : "→"} ${p.oldName}  ->  ${p.newName}${p.error ? `   [${p.error}]` : ""}`);
    logConsole(`--- [Rename preview: ${changes.length} change(s), ${bad} conflict(s)] ---\n${lines.join("\n") || "(no names would change)"}${changes.length > 40 ? "\n... (first 40 shown)" : ""}`, bad ? 4 : 1);
  });
  win.onClick("btn_br_apply", async () => {
    const plan = buildRenamePlan();
    if (!plan) return;
    const changes = plan.filter((p) => p.from !== p.to && !p.error);
    if (changes.length === 0) { win.toast("No valid renames to apply — click Preview to see why."); return; }
    const ok = await win.confirm(`Rename ${changes.length} item(s)? You can undo with 'Undo Last Change'.`, "Confirm Batch Rename");
    if (!ok) return;
    const res = applyRenamePlan(plan);
    pushUndo(res.done);
    logConsole(`[Batch Rename] Renamed ${res.done.length}, skipped ${res.skipped}, failed ${res.failed.length}${res.failed.length ? "\n" + res.failed.join("\n") : ""}`, res.failed.length ? 4 : 2);
    win.toast(`Renamed ${res.done.length} item(s)`);
    selectedItem = null;
    performSearch();
  });

  // Content search inside matched files
  win.onClick("btn_grep", () => {
    const q = win.getValue("txt_grep") || "";
    if (!q) { win.toast("Type the text to look for inside the matched files."); return; }
    if (currentResults.length === 0) { win.toast("Search for files first."); return; }
    try {
      const r = searchContents(currentResults.map((x) => x.path), q, { regex: Boolean(win.getValue("chk_grep_regex")), caseSensitive: Boolean(win.getValue("chk_grep_case")) });
      const root = path.resolve(win.getValue("txt_root") || ".");
      const lines = r.matches.slice(0, 80).map((m) => `${path.relative(root, m.path)}:${m.line}: ${m.text}`);
      logConsole(`--- [Content search '${q}': ${r.matches.length} hit(s) in ${r.filesWithHits}/${r.filesScanned} text files${r.truncated ? " (capped)" : ""}] ---\n${lines.join("\n") || "(no matches)"}${r.matches.length > 80 ? "\n... (first 80 shown)" : ""}`, r.matches.length ? 2 : 4);
    } catch (e: any) { fail("Content search", e); }
  });
  win.onClick("btn_dupes", () => {
    if (currentResults.length === 0) { win.toast("Search for files first."); return; }
    const r = findDuplicates(currentResults.map((x) => x.path));
    const lines = r.groups.slice(0, 15).map((g) => `${formatHumanSize(g.sizeBytes)} x${g.paths.length}  ${g.paths.map((p) => path.basename(p)).join("  =  ")}`);
    logConsole(`--- [Duplicate finder: ${r.groups.length} group(s), ${formatHumanSize(r.wastedBytes)} reclaimable] ---\n${lines.join("\n") || "No identical files found among the matches."}`, r.groups.length ? 4 : 2);
  });
  win.onClick("btn_largest", () => {
    const top = largestFiles(currentResults.map((x) => x.path), 15);
    logConsole(`--- [Largest files among matches] ---\n${top.map((t) => `${t.humanSize.padStart(9)}  ${path.basename(t.path)}`).join("\n") || "(no files)"}`, 1);
  });
  win.onClick("btn_ext_stats", () => {
    const rows = sizeByExtension(currentResults.map((x) => x.path)).slice(0, 15);
    logConsole(`--- [Disk usage by file type] ---\n${rows.map((r) => `${r.humanSize.padStart(9)}  ${String(r.count).padStart(5)} files  ${r.ext}`).join("\n") || "(no files)"}`, 1);
  });

  // Extra export formats
  const exportAs = (ext: string, body: () => string, label: string) => {
    if (currentResults.length === 0) { win.toast("No matching items to export."); return; }
    try {
      const destDir = path.resolve(win.getValue("txt_dest_dir") || ".");
      fs.mkdirSync(destDir, { recursive: true });
      const filePath = path.join(destDir, `fd_search_results.${ext}`);
      const text = body();
      fs.writeFileSync(filePath, text, "utf-8");
      copyToClipboard(text, `${label} export (${currentResults.length} records)`);
      logConsole(`[Export] Saved ${label} export to: ${filePath}`, 2);
      win.toast(`Exported ${label} to ${filePath}`);
    } catch (e: any) { fail("Export", e); }
  };
  win.onClick("btn_export_tsv", () => exportAs("tsv", () => toTsv(currentResults), "TSV"));
  win.onClick("btn_export_md", () => exportAs("md", () => toMarkdownTable(currentResults), "Markdown"));
  win.onClick("btn_export_paths", () => exportAs("txt", () => currentResults.map((r) => r.path).join("\n") + "\n", "Path list"));

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
          "  --fd-table-h: 360px;",
          "  --fd-console-h: 170px;",
          "  --fd-accent: #38bdf8;",
          "  --fd-accent-soft: rgba(56, 189, 248, 0.14);",
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
          "#groupbox_1, #groupbox_2, #groupbox_3, #groupbox_4, #groupbox_5, #groupbox_6, #groupbox_7, #groupbox_8, fieldset {",
          "  display: none !important;",
          "}",
          ".fd-card {",
          "  background: var(--card-bg, #161922) !important;",
          "  border: 1px solid var(--card-border, #232936) !important;",
          "  border-radius: 12px !important;",
          "  padding: 12px 14px !important;",
          "  box-sizing: border-box !important;",
          "  width: 100% !important;",
          "  display: flex !important;",
          "  flex-direction: column !important;",
          "  gap: 10px !important;",
          "  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;",
          "}",
          ".fd-card-header {",
          "  font-size: 11px !important;",
          "  font-weight: 700 !important;",
          "  color: var(--fd-accent, #38bdf8) !important;",
          "  text-transform: uppercase !important;",
          "  letter-spacing: 0.65px !important;",
          "  user-select: none !important;",
          "  border-bottom: 1px solid rgba(255,255,255,0.08) !important;",
          "  padding-bottom: 6px !important;",
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
          "  position: sticky !important;",
          "  top: 12px !important;",
          "  left: auto !important;",
          "  width: 100% !important;",
          "  max-width: 100% !important;",
          "  height: var(--fd-console-h, 170px) !important;",
          "  min-height: 120px !important;",
          "  overflow: auto !important;",
          "  box-sizing: border-box !important;",
          "  background: rgba(12, 17, 26, 0.95) !important;",
          "  border: 1px solid rgba(56, 189, 248, 0.38) !important;",
          "  border-radius: 10px !important;",
          "  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02), inset 0 0 18px rgba(56, 189, 248, 0.08) !important;",
          "  z-index: 20 !important;",
          "}",
          ".fd-console-line {",
          "  display: block !important;",
          "  margin: 2px 0 !important;",
          "  line-height: 1.45 !important;",
          "  white-space: pre-wrap !important;",
          "  word-break: break-word !important;",
          "}",
          ".fd-console-badge {",
          "  display: inline-block !important;",
          "  padding: 2px 7px !important;",
          "  border-radius: 999px !important;",
          "  font-size: 10px !important;",
          "  font-weight: 700 !important;",
          "  letter-spacing: 0.04em !important;",
          "  text-transform: uppercase !important;",
          "  margin-right: 8px !important;",
          "  vertical-align: middle !important;",
          "}",
          ".fd-console-badge.success {",
          "  background: rgba(16, 185, 129, 0.18) !important;",
          "  color: #b8f7d3 !important;",
          "  border: 1px solid rgba(16, 185, 129, 0.45) !important;",
          "}",
          ".fd-console-badge.warn {",
          "  background: rgba(250, 204, 21, 0.16) !important;",
          "  color: #fef3c7 !important;",
          "  border: 1px solid rgba(250, 204, 21, 0.4) !important;",
          "}",
          ".fd-console-badge.error {",
          "  background: rgba(239, 68, 68, 0.15) !important;",
          "  color: #fecaca !important;",
          "  border: 1px solid rgba(239, 68, 68, 0.45) !important;",
          "}",
          ".fd-console-badge.info {",
          "  background: rgba(59, 130, 246, 0.15) !important;",
          "  color: #bfdbfe !important;",
          "  border: 1px solid rgba(59, 130, 246, 0.4) !important;",
          "}",
          ".fd-console-text {",
          "  color: #e5ecf7 !important;",
          "}",
          ".fd-console-empty {",
          "  color: rgba(229, 236, 247, 0.6) !important;",
          "  font-style: italic !important;",
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
          createRow(["lbl_exts", "txt_exts", "lbl_exclude", "txt_exclude", "lbl_min_depth", "txt_min_depth", "lbl_max_depth", "txt_max_depth", "lbl_size", "txt_size", "lbl_age", "dd_age"]),
          createRow(["chk_hidden", "chk_no_ignore", "chk_follow", "chk_full_path", "chk_watch"])
        ]);
        root.appendChild(filtersCard);

        // 4. Preview & Command Output Card (kept higher so action feedback is visible without scrolling)
        const consoleNode = getNode("fd_console");
        const statusNode = getNode("lbl_status");
        if (statusNode) statusNode.style.width = "auto";

        const consoleCard = createCard("Preview & Command Output", [
          consoleNode,
          createRow(["btn_clear_console", statusNode])
        ]);
        root.appendChild(consoleCard);

        // 5. Matching Files & Directories Card
        const tableNode = getNode("tbl_results");
        const resultsCard = createCard("Matching Files & Directories (Click any item to inspect & preview)", [
          tableNode
        ]);
        root.appendChild(resultsCard);

        // 6. Selected File Inspector & Single-Item Actions Card
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

        // 7. Batch Operations, Bulk File Management & Export Toolkit Card
        const batchCard = createCard("Batch Operations, Bulk File Management & Export Toolkit", [
          createRow(["lbl_dest", "txt_dest_dir", "btn_copy_all_files", "btn_move_all", "btn_archive_all"]),
          createRow(["btn_copy_all_rel", "btn_copy_all_abs", "btn_export_json", "btn_export_csv", "btn_bury_all", "btn_delete_all"])
        ]);
        root.appendChild(batchCard);

        // 7b. File Operations & Analysis Toolkit Card
        const opsCard = createCard("File Operations & Analysis Toolkit (no terminal needed)", [
          createRow(["lbl_ops_name", "txt_ops_name", "btn_new_file", "btn_new_folder", "btn_rename_one", "btn_duplicate_one", "btn_open_one"]),
          createRow(["lbl_chmod", "txt_chmod", "btn_chmod", "btn_preview_hex", "btn_undo_op"]),
          createRow(["lbl_br", "txt_br_find", "txt_br_replace", "chk_br_regex", "dd_br_case", "txt_br_prefix", "txt_br_suffix", "chk_br_number", "chk_br_spaces", "btn_br_preview", "btn_br_apply"]),
          createRow(["lbl_grep", "txt_grep", "chk_grep_regex", "chk_grep_case", "btn_grep", "btn_dupes", "btn_largest", "btn_ext_stats"]),
          createRow(["btn_export_tsv", "btn_export_md", "btn_export_paths"])
        ]);
        root.appendChild(opsCard);

        // 8. Graveyard Quarantine & Recovery Card (Rip Engine)
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
