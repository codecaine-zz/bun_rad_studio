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
import * as path from "node:path";
import * as fs from "node:fs";

export function createFdStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Fd Studio Pro -- Native High-Performance File & Directory Finder",
    1240,
    940,
    {
      appId: "fd_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentResults: FdItem[] = [];
  let selectedItem: FdItem | null = null;
  let activeTypeFilter: FdFileType | "all" = "all";

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Fd Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Zero Homebrew Reliance -- 100% Native Bun System APIs for Ultra-Fast Traversal");

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
  // 5. File Inspector, Action Dispatcher & Execution
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Selected File Inspector & Command Dispatcher (-x / -X)");
  win.beginRow();
  win.addLabel("lbl_selected_name", "Selected: (None)");
  win.addLabel("lbl_selected_stats", "Size: — | Perms: — | Modified: —");
  win.addLabel("lbl_selected_hash", "SHA-256: —");
  win.endRow();

  win.beginRow();
  win.addButton("btn_copy_rel", "📋 Copy Relative Path");
  win.addButton("btn_copy_abs", "📋 Copy Full Path");
  win.addButton("btn_reveal", "📂 Reveal in Finder");
  win.addButton("btn_preview_content", "👁️ Preview Content");
  win.addLabel("lbl_exec_tmpl", "Command (-x):");
  win.addInput("txt_exec_cmd", "wc -l {}", "e.g. wc -l {}, head -n 5 {}", { width: 220 });
  win.addButton("btn_exec_one", "⚡ Run on Item");
  win.addButton("btn_exec_all", "🚀 Batch Run All");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Content Preview & Activity Console
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

    const rows = result.items.map((it) => [
      it.name,
      it.type,
      it.humanSize,
      it.relativePath,
      it.mtimeStr,
      it.permStr,
    ]);

    win.setTableData("tbl_results", tableHeaders, rows);

    const truncMsg = result.truncated ? " (Results capped at 1500)" : "";
    const status = `Status: Done  |  Scanned: ${result.totalScanned}  |  Matches: ${result.matchedCount}${truncMsg}  |  Duration: ${result.durationMs}ms  |  Total Size: ${result.totalHumanSize}`;
    win.setText("lbl_status", status);

    logConsole(`[Search] Found ${result.matchedCount} matching items in ${result.durationMs}ms (${result.totalHumanSize})${truncMsg}`, 2);

    if (result.items.length > 0) {
      updateSelectedInspector(result.items[0]);
    } else {
      win.setText("lbl_selected_name", "Selected: (No matches)");
      win.setText("lbl_selected_stats", "Size: — | Perms: — | Modified: —");
      win.setText("lbl_selected_hash", "SHA-256: —");
    }
  };

  // -----------------------------------------------------------------------------------------------
  // Event Bindings
  // -----------------------------------------------------------------------------------------------

  win.onClick("btn_fullscreen", (w) => w.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Fd Studio configuration saved!");
  });

  win.onClick("btn_search", () => performSearch());
  win.onEnter("txt_pattern", () => performSearch());
  win.onEnter("txt_root", () => performSearch());

  win.onClick("btn_clear", () => {
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
  win.onClick("tbl_results", (_, rowName) => {
    const item = currentResults.find((r) => r.name === rowName || r.relativePath === rowName);
    if (item) updateSelectedInspector(item);
  });

  // Copy Relative Path
  win.onClick("btn_copy_rel", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    Sys.exec(`printf "%s" "${selectedItem.relativePath}" | pbcopy`);
    win.toast(`Copied relative path: ${selectedItem.relativePath}`);
    logConsole(`[Clipboard] Copied relative path: ${selectedItem.relativePath}`, 1);
  });

  // Copy Full Absolute Path
  win.onClick("btn_copy_abs", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    Sys.exec(`printf "%s" "${selectedItem.path}" | pbcopy`);
    win.toast(`Copied full path: ${selectedItem.path}`);
    logConsole(`[Clipboard] Copied absolute path: ${selectedItem.path}`, 1);
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

  // Execute on Single Item (-x)
  win.onClick("btn_exec_one", () => {
    if (!selectedItem) {
      win.toast("Please select an item first.");
      return;
    }
    const tmpl = win.getValue("txt_exec_cmd") || "ls -la {}";
    logConsole(`[Exec] Running '${tmpl}' on ${selectedItem.name}...`, 1);
    const res = runFdCommand(tmpl, [selectedItem.path]);
    if (res.stdout) logConsole(`[Output]:\n${res.stdout}`, 2);
    if (res.stderr) logConsole(`[Error]:\n${res.stderr}`, 3);
    win.toast(`Execution finished with code ${res.exitCode}`);
  });

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
    win.toast(`Batch execution finished with exit code ${res.exitCode}`);
  });

  win.onClick("btn_clear_console", () => {
    win.clearConsole("fd_console");
    logConsole("[Fd Studio Pro] Activity console cleared.", 1);
  });

  // Client-side script for row selection and instant table ergonomics
  win.addScript(`
    (function() {
      function initFdStudioEngine() {
        const container = document.getElementById("tbl_results");
        if (!container) return;

        window.onTableRowClick = function(tr) {
          if (!tr) return;
          const cells = tr.querySelectorAll("td");
          const name = cells[0]?.textContent?.trim() || "";
          const relPath = cells[3]?.textContent?.trim() || "";

          if (window.on_sel_file_ipc_change) {
            window.on_sel_file_ipc_change(relPath || name);
          }
        };
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFdStudioEngine);
      } else {
        setTimeout(initFdStudioEngine, 50);
      }
    })();
  `);

  // Pre-populate search immediately on creation so initial table is populated on first frame
  performSearch();

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
