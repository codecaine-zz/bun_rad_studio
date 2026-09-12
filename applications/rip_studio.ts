import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  getGraveyardDir,
  loadManifest,
  inspectTargets,
  buryTargets,
  unburyTargets,
  seanceGraveyard,
  decomposeGraveyard,
  getGraveyardStats,
  formatHumanSize,
  type GraveyardItem,
} from "./rip_engine";
import * as path from "node:path";
import * as fs from "node:fs";

export function createRipStudio(options: { fullscreen?: boolean; theme?: string; graveyardDir?: string } = {}): SimpleWindow {
  const graveyardDir = getGraveyardDir(options.graveyardDir);

  const win = newSimpleWindow(
    "Rip Studio Pro -- Safe & Ergonomic Alternative to rm",
    1260,
    940,
    {
      appId: "rip_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentItems: GraveyardItem[] = [];
  let selectedItem: GraveyardItem | null = null;
  let activeFilter: "all" | "cwd" | "file" | "directory" = "all";

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Rip Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_refresh", "🔄 Refresh Graveyard");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Safe & Ergonomic Alternative to rm -- Native Bun Filesystem Quarantine & Undo Engine");

  // -----------------------------------------------------------------------------------------------
  // 2. Graveyard Telemetry Cards
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Graveyard Quarantine Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_total", "Buried Items: 0");
  win.addLabel("lbl_metric_size", "Total Size: 0 B");
  win.addLabel("lbl_metric_today", "Buried Today: 0");
  win.addLabel("lbl_metric_path", `Graveyard: ${graveyardDir}`);
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Safe Bury & Pre-Deletion Inspection
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Safe Burial & Pre-Deletion Inspection");
  win.beginRow();
  win.addLabel("lbl_target_input", "Target Path:");
  win.addInput("txt_bury_target", "", "Path to file or folder to safely bury...", { width: 380 });
  win.addButton("btn_inspect_target", "🔍 Inspect Target", { width: 140 });
  win.addButton("btn_bury_target", "🪦 Safe Bury Target", { width: 160 });
  win.addButton("btn_clear_input", "✕ Clear", { width: 80 });
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_inspect_status", "Inspection Status: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Graveyard Explorer & Séance Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Graveyard Quarantine Explorer (Séance)");
  win.beginRow();
  win.addButton("btn_filter_all", "🌐 All Graveyard Items");
  win.addButton("btn_filter_cwd", "📍 Current Directory Only");
  win.addButton("btn_filter_files", "📄 Files Only");
  win.addButton("btn_filter_dirs", "📁 Directories Only");
  win.addLabel("lbl_search_filter", "Search:");
  win.addInput("txt_search_filter", "", "Filter by name or original path...", { width: 220 });
  win.addButton("btn_search_go", "Filter", { width: 75 });
  win.endRow();

  const tableHeaders = ["ID", "Name", "Type", "Size", "Buried Date", "Original Path", "Status"];
  win.addTable("tbl_graveyard", tableHeaders, [], { height: 260 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Selected Item Operations & Restoration
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Graveyard Operations & Restoration");
  win.beginRow();
  win.addLabel("lbl_selected_name", "Selected Item: (None Selected)");
  win.addLabel("lbl_selected_stats", "Size: — | Perms: — | SHA-256: —");
  win.endRow();

  win.beginRow();
  win.addButton("btn_unbury_selected", "↺ Unbury / Restore Selected");
  win.addButton("btn_unbury_last", "↺ Unbury Last Buried");
  win.addButton("btn_decompose_selected", "⚰️ Decompose (Permanent Delete)");
  win.addButton("btn_decompose_all", "🧹 Empty Graveyard");
  win.addButton("btn_preview_item", "👁️ Preview Content / Tree");
  win.addButton("btn_copy_path", "📋 Copy Original Path");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Preview & Activity Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("File Preview & Audit Console");
  win.addConsole("rip_console", 110);
  win.beginRow();
  win.addButton("btn_clear_console", "🗑️ Clear Console");
  win.addLabel("lbl_status_msg", "Status: Ready | Safe Quarantine Active");
  win.endRow();
  win.endGroupBox();

  // Hidden IPC input for row selection
  win.bindControlEvent("sel_item_ipc", "change", (_, itemId) => {
    if (!itemId) return;
    const found = currentItems.find((it) => it.id === String(itemId) || it.name === String(itemId));
    if (found) {
      selectedItem = found;
      win.setText("lbl_selected_name", `Selected: [${found.type.toUpperCase()}] ${found.name}`);
      win.setText(
        "lbl_selected_stats",
        `Size: ${found.humanSize} | Perms: ${found.permStr} | SHA-256: ${found.sha256 ? found.sha256.slice(0, 16) + "..." : "—"}`
      );
      logConsole(`[Selected] ${found.name} (Original: ${found.originalPath})`, 1);
    }
  });

  // Helper: Console logging
  function logConsole(msg: string, level: 1 | 2 | 3 = 1) {
    const time = new Date().toLocaleTimeString();
    win.logConsole("rip_console", `[${time}] ${msg}`, level);
  }

  // Refresh Table and Metrics
  function refreshGraveyard() {
    const stats = getGraveyardStats(graveyardDir);
    win.setText("lbl_metric_total", `Buried Items: ${stats.totalItems}`);
    win.setText("lbl_metric_size", `Total Size: ${stats.totalHumanSize}`);
    win.setText("lbl_metric_today", `Buried Today: ${stats.buriedTodayCount}`);

    let items = seanceGraveyard({ graveyardDir, all: activeFilter !== "cwd" });

    if (activeFilter === "file") {
      items = items.filter((it) => it.type === "file");
    } else if (activeFilter === "directory") {
      items = items.filter((it) => it.type === "directory");
    }

    const search = (win.getValue("txt_search_filter") || "").toLowerCase().trim();
    if (search) {
      items = items.filter(
        (it) =>
          it.name.toLowerCase().includes(search) ||
          it.originalPath.toLowerCase().includes(search) ||
          it.id.toLowerCase().includes(search)
      );
    }

    currentItems = items;

    const rows = items.map((it) => {
      const icon = it.type === "directory" ? "📁" : it.type === "symlink" ? "🔗" : "📄";
      const dateStr = it.buriedAt.replace("T", " ").slice(0, 19);
      return [
        it.id,
        `${icon} ${it.name}`,
        it.type,
        it.humanSize,
        dateStr,
        it.relativePath || it.originalPath,
        it.status.toUpperCase(),
      ];
    });

    win.setTableData("tbl_graveyard", rows);
    win.setText("lbl_status_msg", `Status: Displaying ${items.length} buried item(s)`);
  }

  // -----------------------------------------------------------------------------------------------
  // Event Bindings
  // -----------------------------------------------------------------------------------------------
  win.onClick("btn_refresh", () => {
    refreshGraveyard();
    win.toast("Graveyard refreshed.");
    logConsole("Graveyard refreshed.", 1);
  });

  win.onClick("btn_filter_all", () => {
    activeFilter = "all";
    refreshGraveyard();
    logConsole("Showing all graveyard items.", 1);
  });

  win.onClick("btn_filter_cwd", () => {
    activeFilter = "cwd";
    refreshGraveyard();
    logConsole("Filtering to items buried from current directory.", 1);
  });

  win.onClick("btn_filter_files", () => {
    activeFilter = "file";
    refreshGraveyard();
    logConsole("Filtering to files only.", 1);
  });

  win.onClick("btn_filter_dirs", () => {
    activeFilter = "directory";
    refreshGraveyard();
    logConsole("Filtering to directories only.", 1);
  });

  win.onClick("btn_search_go", () => {
    refreshGraveyard();
  });

  win.onClick("btn_clear_input", () => {
    win.setValue("txt_bury_target", "");
    win.setText("lbl_inspect_status", "Inspection Status: Ready");
  });

  // Inspect Target
  win.onClick("btn_inspect_target", async () => {
    const target = (win.getValue("txt_bury_target") || "").trim();
    if (!target) {
      win.toast("Please enter a target path to inspect.");
      return;
    }

    logConsole(`[Inspect] Analyzing target: ${target}...`, 1);
    const result = await inspectTargets([target], { graveyardDir });
    const item = result.items[0];

    if (!item) {
      win.setText("lbl_inspect_status", `Error: Target not found`);
      return;
    }

    if (item.isProtected) {
      win.setText("lbl_inspect_status", `⛔ PROTECTED: ${item.protectedReason}`);
      logConsole(`[Inspect ⛔ PROTECTED] ${target}: ${item.protectedReason}`, 3);
      win.toast("Target is a protected system directory!");
      return;
    }

    if (!item.exists) {
      win.setText("lbl_inspect_status", `⚠️ Missing: Target does not exist on disk`);
      logConsole(`[Inspect ⚠️ Missing] ${target} does not exist.`, 2);
      return;
    }

    const note = item.warning ? ` (${item.warning})` : " (Safe to bury)";
    win.setText(
      "lbl_inspect_status",
      `✓ [${item.type.toUpperCase()}] Size: ${item.humanSize} | Files: ${item.fileCount}${note}`
    );
    logConsole(
      `[Inspect ✓] Target: ${item.name} | Type: ${item.type} | Size: ${item.humanSize} | Files: ${item.fileCount}${note}`,
      item.warning ? 2 : 1
    );
    win.toast(`Inspected: ${item.name} (${item.humanSize})`);
  });

  // Safe Bury Target
  win.onClick("btn_bury_target", async () => {
    const target = (win.getValue("txt_bury_target") || "").trim();
    if (!target) {
      win.toast("Please enter a target path to bury.");
      return;
    }

    logConsole(`[Bury] Quarantining target into graveyard: ${target}...`, 1);
    const result = await buryTargets([target], { graveyardDir });

    if (result.buriedItems.length > 0) {
      const b = result.buriedItems[0];
      logConsole(`[Bury ✓] Successfully buried '${b.name}' (${b.humanSize}) into graveyard.`, 1);
      win.toast(`Buried '${b.name}' safely. Undo with Unbury anytime.`);
      win.setValue("txt_bury_target", "");
      win.setText("lbl_inspect_status", `✓ Buried '${b.name}' into graveyard.`);
      refreshGraveyard();
    }

    if (result.failed.length > 0) {
      const f = result.failed[0];
      logConsole(`[Bury ⛔ Failed] Cannot bury: ${f.error}`, 3);
      win.toast(`Failed to bury: ${f.error}`);
    }
  });

  // Unbury Selected
  win.onClick("btn_unbury_selected", async () => {
    if (!selectedItem) {
      win.toast("Please select a buried item from the table first.");
      return;
    }

    logConsole(`[Unbury] Restoring '${selectedItem.name}' to ${selectedItem.originalPath}...`, 1);
    const result = await unburyTargets([selectedItem.id], { graveyardDir });

    if (result.restoredItems.length > 0) {
      const u = result.restoredItems[0];
      logConsole(`[Unbury ✓] Restored '${u.name}' to ${u.originalPath}`, 1);
      win.toast(`Restored '${u.name}' successfully!`);
      selectedItem = null;
      win.setText("lbl_selected_name", "Selected Item: (None Selected)");
      win.setText("lbl_selected_stats", "Size: — | Perms: — | SHA-256: —");
      refreshGraveyard();
    }

    if (result.failed.length > 0) {
      logConsole(`[Unbury ⛔ Failed] ${result.failed[0].error}`, 3);
      win.toast(`Failed to restore: ${result.failed[0].error}`);
    }
  });

  // Unbury Last
  win.onClick("btn_unbury_last", async () => {
    logConsole("[Unbury] Restoring most recently buried item...", 1);
    const result = await unburyTargets(undefined, { graveyardDir });

    if (result.restoredItems.length > 0) {
      const u = result.restoredItems[0];
      logConsole(`[Unbury ✓] Restored '${u.name}' to ${u.originalPath}`, 1);
      win.toast(`Restored '${u.name}' successfully!`);
      refreshGraveyard();
    } else if (result.failed.length > 0) {
      logConsole(`[Unbury] ${result.failed[0].error}`, 2);
      win.toast(result.failed[0].error);
    }
  });

  // Decompose Selected
  win.onClick("btn_decompose_selected", async () => {
    if (!selectedItem) {
      win.toast("Please select an item to decompose.");
      return;
    }

    logConsole(`[Decompose] Permanently deleting '${selectedItem.name}' from graveyard...`, 2);
    const result = await decomposeGraveyard({ graveyardDir, targets: [selectedItem.id] });

    if (result.deletedCount > 0) {
      logConsole(`[Decompose ✓] Permanently purged '${selectedItem.name}' (${result.freedHumanSize} freed).`, 1);
      win.toast(`Permanently deleted '${selectedItem.name}'.`);
      selectedItem = null;
      win.setText("lbl_selected_name", "Selected Item: (None Selected)");
      win.setText("lbl_selected_stats", "Size: — | Perms: — | SHA-256: —");
      refreshGraveyard();
    }
  });

  // Decompose All (Empty Graveyard)
  win.onClick("btn_decompose_all", async () => {
    logConsole("[Decompose All] Emptying entire graveyard...", 2);
    const result = await decomposeGraveyard({ graveyardDir, all: true });
    logConsole(`[Decompose All ✓] Purged ${result.deletedCount} items, freed ${result.freedHumanSize}.`, 1);
    win.toast(`Graveyard emptied. Freed ${result.freedHumanSize}.`);
    selectedItem = null;
    refreshGraveyard();
  });

  // Copy Original Path
  win.onClick("btn_copy_path", () => {
    if (!selectedItem) {
      win.toast("No item selected.");
      return;
    }
    logConsole(`[Original Path]: ${selectedItem.originalPath}`, 1);
    win.toast(`Path: ${selectedItem.originalPath}`);
  });

  // Preview Content or Directory Tree
  win.onClick("btn_preview_item", () => {
    if (!selectedItem) {
      win.toast("Please select an item to preview.");
      return;
    }

    if (!fs.existsSync(selectedItem.graveyardPath)) {
      logConsole(`[Preview Error] Payload missing at ${selectedItem.graveyardPath}`, 3);
      return;
    }

    try {
      if (selectedItem.type === "directory") {
        const files = fs.readdirSync(selectedItem.graveyardPath);
        const preview = files.slice(0, 30).map((f) => `  ├── ${f}`).join("\n");
        logConsole(
          `--- [Directory Contents: ${selectedItem.name}] ---\n${preview}${files.length > 30 ? "\n  └── ... (truncated)" : ""}`,
          1
        );
      } else {
        const content = fs.readFileSync(selectedItem.graveyardPath, "utf-8");
        const snippet = content.length > 2500 ? content.slice(0, 2500) + "\n... (truncated)" : content;
        logConsole(`--- [File Preview: ${selectedItem.name}] ---\n${snippet}`, 1);
      }
      win.toast(`Loaded preview for ${selectedItem.name}`);
    } catch (e: any) {
      logConsole(`[Cannot preview]: ${e.message}`, 3);
    }
  });

  win.onClick("btn_clear_console", () => {
    win.clearConsole("rip_console");
    logConsole("Activity console cleared.", 1);
  });

  // Client-side script for row clicks
  win.addScript(`
    (function() {
      function initRipStudioTable() {
        const tbl = document.getElementById("tbl_graveyard");
        if (!tbl) return;

        window.onTableRowClick = function(tr) {
          if (!tr) return;
          const cells = tr.querySelectorAll("td");
          const id = cells[0]?.textContent?.trim() || "";
          if (window.on_sel_item_ipc_change) {
            window.on_sel_item_ipc_change(id);
          }
        };
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initRipStudioTable);
      } else {
        setTimeout(initRipStudioTable, 50);
      }
    })();
  `);

  // Initial population
  refreshGraveyard();

  return win;
}

export function generateRipStudioHtml(): string {
  const win = createRipStudio({ fullscreen: false });
  return win.generateHtml();
}

/**
 * HTTP Web Server for Rip Studio Pro Workstation
 * Enables interactive browser testing via browser_subagent and remote web usage.
 */
export function startRipStudioServer(options: { port?: number; host?: string; graveyardDir?: string } = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const graveyardDir = getGraveyardDir(options.graveyardDir);
  const win = createRipStudio({ fullscreen: false, graveyardDir });

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

      if (url.pathname === "/api/stats") {
        const stats = getGraveyardStats(graveyardDir);
        return Response.json(stats, { headers: corsHeaders });
      }

      if (url.pathname === "/api/graveyard") {
        const items = seanceGraveyard({ graveyardDir, all: true });
        return Response.json(items, { headers: corsHeaders });
      }

      if (url.pathname === "/api/inspect") {
        const target = url.searchParams.get("target") || "";
        const insp = await inspectTargets([target], { graveyardDir });
        return Response.json(insp, { headers: corsHeaders });
      }

      if (url.pathname === "/api/bury" && req.method === "POST") {
        try {
          const body = (await req.json()) as { targets: string[] };
          const res = await buryTargets(body.targets || [], { graveyardDir });
          return Response.json(res, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/unbury" && req.method === "POST") {
        try {
          const body = (await req.json()) as { targets?: string[] };
          const res = await unburyTargets(body.targets, { graveyardDir });
          return Response.json(res, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/decompose" && req.method === "POST") {
        try {
          const body = (await req.json()) as { targets?: string[]; all?: boolean };
          const res = await decomposeGraveyard({
            graveyardDir,
            targets: body.targets,
            all: body.all,
          });
          return Response.json(res, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
        }
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  const resolvedPort = server.port;
  console.log(`⚡ Rip Studio Pro server online: http://${hostname}:${resolvedPort}`);
  return {
    server,
    port: resolvedPort,
    url: `http://${hostname}:${resolvedPort}`,
    stop: () => server.stop(true),
  };
}

if (import.meta.main) {
  const win = createRipStudio({ fullscreen: true });
  console.log("⚡ Launching Rip Studio Pro (Safe & Ergonomic Alternative to rm)...");
  win.run();
}
