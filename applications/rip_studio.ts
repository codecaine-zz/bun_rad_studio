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
  win.addInput("txt_bury_target", "", "Path to file or folder to safely bury...", { width: 320 });
  win.addButton("btn_browse_file", "📄 Browse File...", { width: 130 });
  win.addButton("btn_browse_folder", "📁 Browse Folder...", { width: 140 });
  win.addButton("btn_inspect_target", "🔍 Inspect Target", { width: 130 });
  win.addButton("btn_bury_target", "🪦 Safe Bury Target", { width: 150 });
  win.addButton("btn_clear_input", "✕ Clear", { width: 75 });
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

  // Table click & hidden IPC input for row selection
  const handleItemSelect = (itemId: string | number) => {
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
  };

  win.bindControlEvent("sel_item_ipc", "change", (_, itemId) => handleItemSelect(itemId));
  win.onClick("tbl_graveyard", (_, itemId) => handleItemSelect(itemId));

  // Helper: Console logging
  function logConsole(msg: string, level: 1 | 2 | 3 = 1) {
    const time = new Date().toLocaleTimeString();
    win.appendConsole("rip_console", `[${time}] ${msg}\n`, level);
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

    win.setTableData("tbl_graveyard", tableHeaders, rows);
    win.setText("lbl_status_msg", `Status: Displaying ${items.length} buried item(s)`);
  }

  // -----------------------------------------------------------------------------------------------
  // Event Bindings
  // -----------------------------------------------------------------------------------------------
  win.onClick("btn_fullscreen", () => {
    win.toggleFullscreen();
  });

  win.onClick("btn_save_state", () => {
    win.saveAppFormState();
    win.toast("Configuration saved.");
    logConsole("Configuration saved.", 1);
  });

  win.onClick("btn_center", () => {
    win.centerWindow();
    win.toast("Window centered.");
    logConsole("Window centered.", 1);
  });

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

  // Browse File via Native Dialog
  win.onClick("btn_browse_file", async () => {
    logConsole("[Browse File] Opening native file dialog...", 1);
    try {
      const selected = await win.openFileDialog("Select File to Safely Bury or Inspect");
      if (selected) {
        win.setValue("txt_bury_target", selected);
        win.toast(`Selected file: ${path.basename(selected)}`);
        logConsole(`[Browse File ✓] Selected: ${selected}`, 1);
        const result = await inspectTargets([selected], { graveyardDir });
        const item = result.items[0];
        if (item) {
          if (item.isProtected) {
            win.setText("lbl_inspect_status", `⛔ PROTECTED: ${item.protectedReason}`);
          } else if (!item.exists) {
            win.setText("lbl_inspect_status", `⚠️ Missing: Target does not exist on disk`);
          } else {
            const note = item.warning ? ` (${item.warning})` : " (Safe to bury)";
            win.setText("lbl_inspect_status", `✓ [${item.type.toUpperCase()}] Size: ${item.humanSize} | Files: ${item.fileCount}${note}`);
          }
        }
      } else {
        logConsole("[Browse File] File selection was cancelled.", 1);
      }
    } catch (err: any) {
      logConsole(`[Browse File Error]: ${err.message || err}`, 3);
    }
  });

  // Browse Folder via Native Dialog
  win.onClick("btn_browse_folder", async () => {
    logConsole("[Browse Folder] Opening native folder dialog...", 1);
    try {
      const selected = await win.openFolderDialog("Select Folder / Directory to Safely Bury or Inspect");
      if (selected) {
        win.setValue("txt_bury_target", selected);
        win.toast(`Selected directory: ${path.basename(selected)}`);
        logConsole(`[Browse Folder ✓] Selected: ${selected}`, 1);
        const result = await inspectTargets([selected], { graveyardDir });
        const item = result.items[0];
        if (item) {
          if (item.isProtected) {
            win.setText("lbl_inspect_status", `⛔ PROTECTED: ${item.protectedReason}`);
          } else if (!item.exists) {
            win.setText("lbl_inspect_status", `⚠️ Missing: Target does not exist on disk`);
          } else {
            const note = item.warning ? ` (${item.warning})` : " (Safe to bury)";
            win.setText("lbl_inspect_status", `✓ [${item.type.toUpperCase()}] Size: ${item.humanSize} | Files: ${item.fileCount}${note}`);
          }
        }
      } else {
        logConsole("[Browse Folder] Folder selection was cancelled.", 1);
      }
    } catch (err: any) {
      logConsole(`[Browse Folder Error]: ${err.message || err}`, 3);
    }
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

  // Client-side script for row clicks, real-time ergonomics, and browser server mode
  win.addScript(`
    (function() {
      const isBrowserMode = typeof window.handleHeartbeatIPC !== "function";
      let clientItems = [];
      let clientSelectedItem = null;
      let clientFilter = "all";

      function getEl(id) { return document.getElementById(id); }

      function showToast(msg, duration) {
        duration = duration || 2500;
        let t = document.getElementById("__rip_toast");
        if (!t) {
          t = document.createElement("div");
          t.id = "__rip_toast";
          t.style.position = "fixed";
          t.style.bottom = "20px";
          t.style.right = "20px";
          t.style.backgroundColor = "rgba(15, 23, 42, 0.94)";
          t.style.color = "#f8fafc";
          t.style.padding = "10px 18px";
          t.style.borderRadius = "8px";
          t.style.border = "1px solid rgba(56,189,248,0.35)";
          t.style.boxShadow = "0 10px 30px rgba(0,0,0,0.65)";
          t.style.zIndex = "99999";
          t.style.transition = "opacity 0.25s ease, transform 0.25s ease";
          t.style.fontFamily = "system-ui, -apple-system, sans-serif";
          t.style.fontSize = "13px";
          t.style.pointerEvents = "none";
          document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = "1";
        t.style.transform = "translateY(0)";
        clearTimeout(t._timer);
        t._timer = setTimeout(function() {
          t.style.opacity = "0";
          t.style.transform = "translateY(8px)";
        }, duration);
      }

      function logToConsole(msg, level) {
        level = level || 1;
        const time = new Date().toLocaleTimeString();
        const consoleEl = getEl("rip_console");
        if (!consoleEl) return;
        const prefix = level === 3 ? "[ERROR] " : level === 2 ? "[WARN] " : "[INFO] ";
        const line = "[" + time + "] " + prefix + msg + "\\n";
        if (consoleEl.tagName === "TEXTAREA" || consoleEl.value !== undefined) {
          consoleEl.value += line;
          consoleEl.scrollTop = consoleEl.scrollHeight;
        } else {
          const pre = consoleEl.querySelector("pre") || consoleEl;
          pre.textContent += line;
          consoleEl.scrollTop = consoleEl.scrollHeight;
        }
      }

      function renderTable(items) {
        const container = getEl("tbl_graveyard");
        if (!container) return;
        const search = (getEl("txt_search_filter") ? getEl("txt_search_filter").value : "").toLowerCase().trim();

        let filtered = (items || []).slice();
        if (clientFilter === "file") {
          filtered = filtered.filter(function(it) { return it.type === "file"; });
        } else if (clientFilter === "directory") {
          filtered = filtered.filter(function(it) { return it.type === "directory"; });
        } else if (clientFilter === "cwd") {
          filtered = filtered.filter(function(it) { return it.relativePath && !it.relativePath.startsWith(".."); });
        }

        if (search) {
          filtered = filtered.filter(function(it) {
            return (it.name || "").toLowerCase().includes(search) ||
              (it.originalPath || "").toLowerCase().includes(search) ||
              (it.id || "").toLowerCase().includes(search);
          });
        }

        let table = container.querySelector("table");
        if (!table) {
          table = document.createElement("table");
          table.style.width = "100%";
          table.style.borderCollapse = "collapse";
          table.style.fontSize = "12px";
          container.innerHTML = "";
          container.appendChild(table);
        }

        const headers = ["ID", "Name", "Type", "Size", "Buried Date", "Original Path", "Status"];
        const isLight = document.body.classList.contains("light-theme");
        const selBg = isLight ? "rgba(2,132,199,0.18)" : "rgba(56,189,248,0.22)";
        const hoverBg = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
        const border = "rgba(128,128,128,0.2)";

        let html = "<thead><tr style='border-bottom:2px solid " + border + ";text-align:left;'>";
        headers.forEach(function(h) {
          html += "<th style='padding:8px;font-weight:600;color:var(--accent,#38bdf8);'>" + h + "</th>";
        });
        html += "</tr></thead><tbody>";

        if (filtered.length === 0) {
          html += "<tr><td colspan='7' style='padding:22px;text-align:center;opacity:0.65;font-style:italic;'>No graveyard items match current filter.</td></tr>";
        } else {
          filtered.forEach(function(it) {
            const icon = it.type === "directory" ? "📁" : it.type === "symlink" ? "🔗" : "📄";
            const dateStr = (it.buriedAt || "").replace("T", " ").slice(0, 19);
            const isSelected = clientSelectedItem && clientSelectedItem.id === it.id;
            const bg = isSelected ? selBg : "";
            const cls = isSelected ? "class='selected-tr'" : "";
            html += "<tr " + cls + " data-id='" + it.id + "' style='border-bottom:1px solid " + border + ";cursor:pointer;" + (bg ? "background:" + bg + ";" : "") + "'>";
            html += "<td style='padding:7px 8px;font-family:monospace;'>" + it.id + "</td>";
            html += "<td style='padding:7px 8px;font-weight:600;'>" + icon + " " + it.name + "</td>";
            html += "<td style='padding:7px 8px;'>" + it.type + "</td>";
            html += "<td style='padding:7px 8px;font-family:monospace;'>" + it.humanSize + "</td>";
            html += "<td style='padding:7px 8px;opacity:0.85;'>" + dateStr + "</td>";
            html += "<td style='padding:7px 8px;opacity:0.85;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' title='" + (it.originalPath || "") + "'>" + (it.relativePath || it.originalPath) + "</td>";
            html += "<td style='padding:7px 8px;'><span style='padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(239,68,68,0.2);color:#f87171;'>" + (it.status || "BURIED").toUpperCase() + "</span></td>";
            html += "</tr>";
          });
        }
        html += "</tbody>";
        table.innerHTML = html;

        table.querySelectorAll("tbody tr[data-id]").forEach(function(tr) {
          tr.onclick = function() {
            table.querySelectorAll("tbody tr").forEach(function(r) {
              r.classList.remove("selected-tr");
              r.style.background = "";
            });
            tr.classList.add("selected-tr");
            tr.style.background = selBg;
            const id = tr.getAttribute("data-id");
            selectItemById(id);
          };
          tr.onmouseover = function() {
            if (!tr.classList.contains("selected-tr")) tr.style.background = hoverBg;
          };
          tr.onmouseout = function() {
            if (!tr.classList.contains("selected-tr")) tr.style.background = "";
          };
        });

        const statusEl = getEl("lbl_status_msg");
        if (statusEl) statusEl.textContent = "Status: Displaying " + filtered.length + " buried item(s)";
      }

      function selectItemById(id) {
        const found = clientItems.find(function(it) { return it.id === id || it.name === id; });
        if (!found) return;
        clientSelectedItem = found;
        const nameEl = getEl("lbl_selected_name");
        if (nameEl) nameEl.textContent = "Selected: [" + found.type.toUpperCase() + "] " + found.name;
        const statsEl = getEl("lbl_selected_stats");
        if (statsEl) {
          statsEl.textContent = "Size: " + found.humanSize + " | Perms: " + (found.permStr || "—") + " | SHA-256: " + (found.sha256 ? found.sha256.slice(0, 16) + "..." : "—");
        }
        logToConsole("[Selected] " + found.name + " (Original: " + found.originalPath + ")", 1);
        if (window.on_sel_item_ipc_change) {
          window.on_sel_item_ipc_change(found.id);
        }
      }

      window.onTableRowClick = function(tr) {
        if (!tr) return;
        const id = tr.getAttribute("data-id") || (tr.querySelector("td") ? tr.querySelector("td").textContent.trim() : "");
        if (id) selectItemById(id);
      };

      async function refreshClient() {
        try {
          const statsRes = await fetch("/api/stats").then(function(r) { return r.json(); }).catch(function() { return null; });
          const gyRes = await fetch("/api/graveyard").then(function(r) { return r.json(); }).catch(function() { return []; });

          if (statsRes) {
            const totEl = getEl("lbl_metric_total");
            if (totEl) totEl.textContent = "Buried Items: " + statsRes.totalItems;
            const szEl = getEl("lbl_metric_size");
            if (szEl) szEl.textContent = "Total Size: " + statsRes.totalHumanSize;
            const tdEl = getEl("lbl_metric_today");
            if (tdEl) tdEl.textContent = "Buried Today: " + statsRes.buriedTodayCount;
          }

          if (Array.isArray(gyRes)) {
            clientItems = gyRes;
            renderTable(clientItems);
          }
        } catch (e) {
          console.error("Refresh error:", e);
        }
      }

      // Browser Mode REST Handlers:
      // Only register browser HTTP fetch handlers when running in a standalone web browser!
      // In native desktop Webview mode, window.handleHeartbeatIPC is present and window.on_btn_*_click
      // are already bound to native C-IPC, which invoke the Bun win.onClick(...) handlers directly.
      if (isBrowserMode) {
        window.on_btn_refresh_click = async function() {
          logToConsole("Graveyard refreshed.", 1);
          showToast("Graveyard refreshed.");
          await refreshClient();
        };

        window.on_btn_filter_all_click = function() {
          clientFilter = "all";
          renderTable(clientItems);
          logToConsole("Showing all graveyard items.", 1);
        };

        window.on_btn_filter_cwd_click = function() {
          clientFilter = "cwd";
          renderTable(clientItems);
          logToConsole("Filtering to items buried from current directory.", 1);
        };

        window.on_btn_filter_files_click = function() {
          clientFilter = "file";
          renderTable(clientItems);
          logToConsole("Filtering to files only.", 1);
        };

        window.on_btn_filter_dirs_click = function() {
          clientFilter = "directory";
          renderTable(clientItems);
          logToConsole("Filtering to directories only.", 1);
        };

        window.on_btn_search_go_click = function() {
          renderTable(clientItems);
        };

        window.on_btn_clear_input_click = function() {
          const inp = getEl("txt_bury_target");
          if (inp) inp.value = "";
          const st = getEl("lbl_inspect_status");
          if (st) st.textContent = "Inspection Status: Ready";
        };

        window.on_btn_browse_file_click = async function() {
          logToConsole("[Browse File] Opening file chooser dialog...", 1);
          try {
            const res = await fetch("/api/browse?type=file").then(function(r) { return r.json(); }).catch(function(err) { return { error: err.message }; });
            if (res && res.success && res.path) {
              const inp = getEl("txt_bury_target");
              if (inp) inp.value = res.path;
              showToast("Selected file: " + (res.name || res.path));
              logToConsole("[Browse File ✓] Selected: " + res.path, 1);
              if (window.on_btn_inspect_target_click) window.on_btn_inspect_target_click();
            } else if (res && res.cancelled) {
              logToConsole("[Browse File] Selection cancelled.", 1);
            } else if (res && res.error) {
              logToConsole("[Browse File Error]: " + res.error, 3);
            } else {
              logToConsole("[Browse File] Selection cancelled.", 1);
            }
          } catch (e) {
            logToConsole("[Browse File Error]: " + e.message, 3);
          }
        };

        window.on_btn_browse_folder_click = async function() {
          logToConsole("[Browse Folder] Opening folder chooser dialog...", 1);
          try {
            const res = await fetch("/api/browse?type=folder").then(function(r) { return r.json(); }).catch(function(err) { return { error: err.message }; });
            if (res && res.success && res.path) {
              const inp = getEl("txt_bury_target");
              if (inp) inp.value = res.path;
              showToast("Selected folder: " + (res.name || res.path));
              logToConsole("[Browse Folder ✓] Selected: " + res.path, 1);
              if (window.on_btn_inspect_target_click) window.on_btn_inspect_target_click();
            } else if (res && res.cancelled) {
              logToConsole("[Browse Folder] Selection cancelled.", 1);
            } else if (res && res.error) {
              logToConsole("[Browse Folder Error]: " + res.error, 3);
            } else {
              logToConsole("[Browse Folder] Selection cancelled.", 1);
            }
          } catch (e) {
            logToConsole("[Browse Folder Error]: " + e.message, 3);
          }
        };

        window.on_btn_inspect_target_click = async function() {
          const inp = getEl("txt_bury_target");
          const target = (inp ? inp.value : "").trim();
          if (!target) {
            showToast("Please enter a target path to inspect.");
            return;
          }
          logToConsole("[Inspect] Analyzing target: " + target + "...", 1);
          try {
            const res = await fetch("/api/inspect?target=" + encodeURIComponent(target)).then(function(r) { return r.json(); });
            const item = res.items && res.items[0];
            const st = getEl("lbl_inspect_status");
            if (!item) {
              if (st) st.textContent = "Error: Target not found";
              return;
            }
            if (item.isProtected) {
              if (st) st.textContent = "⛔ PROTECTED: " + item.protectedReason;
              logToConsole("[Inspect ⛔ PROTECTED] " + target + ": " + item.protectedReason, 3);
              showToast("Target is a protected system directory!");
              return;
            }
            if (!item.exists) {
              if (st) st.textContent = "⚠️ Missing: Target does not exist on disk";
              logToConsole("[Inspect ⚠️ Missing] " + target + " does not exist.", 2);
              return;
            }
            const note = item.warning ? " (" + item.warning + ")" : " (Safe to bury)";
            if (st) st.textContent = "✓ [" + item.type.toUpperCase() + "] Size: " + item.humanSize + " | Files: " + item.fileCount + note;
            logToConsole("[Inspect ✓] Target: " + item.name + " | Type: " + item.type + " | Size: " + item.humanSize + " | Files: " + item.fileCount + note, item.warning ? 2 : 1);
            showToast("Inspected: " + item.name + " (" + item.humanSize + ")");
          } catch (e) {
            logToConsole("[Inspect Error]: " + e.message, 3);
          }
        };

        window.on_btn_bury_target_click = async function() {
          const inp = getEl("txt_bury_target");
          const target = (inp ? inp.value : "").trim();
          if (!target) {
            showToast("Please enter a target path to bury.");
            return;
          }
          logToConsole("[Bury] Quarantining target into graveyard: " + target + "...", 1);
          try {
            const res = await fetch("/api/bury", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targets: [target] }),
            }).then(function(r) { return r.json(); });

            if (res.buriedItems && res.buriedItems.length > 0) {
              const b = res.buriedItems[0];
              logToConsole("[Bury ✓] Successfully buried '" + b.name + "' (" + b.humanSize + ") into graveyard.", 1);
              showToast("Buried '" + b.name + "' safely. Undo with Unbury anytime.");
              if (inp) inp.value = "";
              const st = getEl("lbl_inspect_status");
              if (st) st.textContent = "✓ Buried '" + b.name + "' into graveyard.";
              await refreshClient();
            }
            if (res.failed && res.failed.length > 0) {
              const f = res.failed[0];
              logToConsole("[Bury ⛔ Failed] Cannot bury: " + f.error, 3);
              showToast("Failed to bury: " + f.error);
            }
          } catch (e) {
            logToConsole("[Bury Error]: " + e.message, 3);
          }
        };

        window.on_btn_unbury_selected_click = async function() {
          if (!clientSelectedItem) {
            showToast("Please select a buried item from the table first.");
            return;
          }
          logToConsole("[Unbury] Restoring '" + clientSelectedItem.name + "' to " + clientSelectedItem.originalPath + "...", 1);
          try {
            const res = await fetch("/api/unbury", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targets: [clientSelectedItem.id] }),
            }).then(function(r) { return r.json(); });

            if (res.restoredItems && res.restoredItems.length > 0) {
              const u = res.restoredItems[0];
              logToConsole("[Unbury ✓] Restored '" + u.name + "' to " + u.originalPath, 1);
              showToast("Restored '" + u.name + "' successfully!");
              clientSelectedItem = null;
              const nameEl = getEl("lbl_selected_name");
              if (nameEl) nameEl.textContent = "Selected Item: (None Selected)";
              const statsEl = getEl("lbl_selected_stats");
              if (statsEl) statsEl.textContent = "Size: — | Perms: — | SHA-256: —";
              await refreshClient();
            } else if (res.failed && res.failed.length > 0) {
              logToConsole("[Unbury ⛔ Failed] " + res.failed[0].error, 3);
              showToast("Failed to restore: " + res.failed[0].error);
            }
          } catch (e) {
            logToConsole("[Unbury Error]: " + e.message, 3);
          }
        };

        window.on_btn_unbury_last_click = async function() {
          logToConsole("[Unbury] Restoring most recently buried item...", 1);
          try {
            const res = await fetch("/api/unbury", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }).then(function(r) { return r.json(); });

            if (res.restoredItems && res.restoredItems.length > 0) {
              const u = res.restoredItems[0];
              logToConsole("[Unbury ✓] Restored '" + u.name + "' to " + u.originalPath, 1);
              showToast("Restored '" + u.name + "' successfully!");
              await refreshClient();
            } else if (res.failed && res.failed.length > 0) {
              logToConsole("[Unbury] " + res.failed[0].error, 2);
              showToast(res.failed[0].error);
            }
          } catch (e) {
            logToConsole("[Unbury Error]: " + e.message, 3);
          }
        };

        window.on_btn_decompose_selected_click = async function() {
          if (!clientSelectedItem) {
            showToast("Please select an item to decompose.");
            return;
          }
          logToConsole("[Decompose] Permanently deleting '" + clientSelectedItem.name + "' from graveyard...", 2);
          try {
            const res = await fetch("/api/decompose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targets: [clientSelectedItem.id] }),
            }).then(function(r) { return r.json(); });

            if (res.deletedCount > 0) {
              logToConsole("[Decompose ✓] Permanently purged '" + clientSelectedItem.name + "' (" + res.freedHumanSize + " freed).", 1);
              showToast("Permanently deleted '" + clientSelectedItem.name + "'.");
              clientSelectedItem = null;
              const nameEl = getEl("lbl_selected_name");
              if (nameEl) nameEl.textContent = "Selected Item: (None Selected)";
              const statsEl = getEl("lbl_selected_stats");
              if (statsEl) statsEl.textContent = "Size: — | Perms: — | SHA-256: —";
              await refreshClient();
            }
          } catch (e) {
            logToConsole("[Decompose Error]: " + e.message, 3);
          }
        };

        window.on_btn_decompose_all_click = async function() {
          logToConsole("[Decompose All] Emptying entire graveyard...", 2);
          try {
            const res = await fetch("/api/decompose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ all: true }),
            }).then(function(r) { return r.json(); });

            logToConsole("[Decompose All ✓] Purged " + res.deletedCount + " items, freed " + res.freedHumanSize + ".", 1);
            showToast("Graveyard emptied. Freed " + res.freedHumanSize + ".");
            clientSelectedItem = null;
            await refreshClient();
          } catch (e) {
            logToConsole("[Decompose Error]: " + e.message, 3);
          }
        };

        window.on_btn_preview_item_click = async function() {
          if (!clientSelectedItem) {
            showToast("Please select an item to preview.");
            return;
          }
          try {
            const res = await fetch("/api/preview?id=" + encodeURIComponent(clientSelectedItem.id)).then(function(r) { return r.json(); });
            if (res.error) {
              logToConsole("[Preview Error]: " + res.error, 3);
              return;
            }
            if (res.type === "directory") {
              const list = res.files.map(function(f) { return "  ├── " + f; }).join("\\n");
              logToConsole("--- [Directory Contents: " + res.name + "] ---\\n" + list + (res.totalFiles > res.files.length ? "\\n  └── ... (" + (res.totalFiles - res.files.length) + " more entries)" : ""), 1);
            } else {
              logToConsole("--- [File Preview: " + res.name + "] ---\\n" + res.content + (res.truncated ? "\\n... (truncated)" : ""), 1);
            }
            showToast("Loaded preview for " + clientSelectedItem.name);
          } catch (e) {
            logToConsole("[Cannot preview]: " + e.message, 3);
          }
        };

        window.on_btn_copy_path_click = function() {
          if (!clientSelectedItem) {
            showToast("No item selected.");
            return;
          }
          const p = clientSelectedItem.originalPath;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(p).catch(function() {});
          }
          fetch("/api/clipboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: p }),
          }).catch(function() {});
          logToConsole("[Original Path]: " + p, 1);
          showToast("Path: " + p);
        };

        window.on_btn_clear_console_click = function() {
          const consoleEl = getEl("rip_console");
          if (consoleEl) {
            if (consoleEl.tagName === "TEXTAREA" || consoleEl.value !== undefined) consoleEl.value = "";
            else {
              const pre = consoleEl.querySelector("pre") || consoleEl;
              pre.textContent = "";
            }
          }
          logToConsole("Activity console cleared.", 1);
        };

        window.on_btn_fullscreen_click = function() {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(function() {});
          } else {
            document.exitFullscreen().catch(function() {});
          }
        };

        window.on_btn_save_state_click = function() {
          showToast("Configuration saved.");
          logToConsole("Configuration saved.", 1);
        };

        window.on_btn_center_click = function() {
          showToast("Window centered.");
          logToConsole("Window centered.", 1);
        };
      }

      // Realtime search filtering on input
      const searchInp = getEl("txt_search_filter");
      if (searchInp) {
        searchInp.addEventListener("input", function() {
          if (isBrowserMode) renderTable(clientItems);
        });
      }

      // Realtime input syncing
      document.querySelectorAll("input, select, textarea").forEach(function(el) {
        el.addEventListener("input", function() {
          const fn = window["on_" + el.id + "_change"];
          if (typeof fn === "function") fn(el.value);
        });
      });

      // Automatically load live data on initial render in browser mode
      if (isBrowserMode) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", refreshClient);
        } else {
          setTimeout(refreshClient, 50);
        }
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

      if (url.pathname === "/api/browse") {
        const type = url.searchParams.get("type") || "file";
        const title = type === "folder" ? "Select Folder to Safely Bury or Inspect" : "Select File to Safely Bury or Inspect";
        let selectedPath: string | null = null;
        try {
          if (type === "folder") {
            selectedPath = await win.openFolderDialog(title);
          } else {
            selectedPath = await win.openFileDialog(title);
          }
        } catch {
          selectedPath = null;
        }
        if (!selectedPath) {
          return Response.json({ success: false, cancelled: true }, { headers: corsHeaders });
        }
        return Response.json({
          success: true,
          path: selectedPath,
          name: path.basename(selectedPath),
          type,
        }, { headers: corsHeaders });
      }

      if (url.pathname === "/api/preview") {
        const id = url.searchParams.get("id") || "";
        const items = seanceGraveyard({ graveyardDir, all: true });
        const item = items.find((it) => it.id === id || it.name === id);
        if (!item) {
          return Response.json({ error: "Item not found in graveyard" }, { status: 404, headers: corsHeaders });
        }
        if (!fs.existsSync(item.graveyardPath)) {
          return Response.json({ error: `Payload missing on disk: ${item.graveyardPath}` }, { status: 404, headers: corsHeaders });
        }
        try {
          if (item.type === "directory") {
            const files = fs.readdirSync(item.graveyardPath);
            return Response.json({
              type: "directory",
              name: item.name,
              files: files.slice(0, 50),
              totalFiles: files.length,
            }, { headers: corsHeaders });
          } else {
            const content = fs.readFileSync(item.graveyardPath, "utf-8");
            return Response.json({
              type: "file",
              name: item.name,
              content: content.slice(0, 4000),
              truncated: content.length > 4000,
            }, { headers: corsHeaders });
          }
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/clipboard" && req.method === "POST") {
        try {
          const body = (await req.json()) as { text?: string };
          const text = body.text || "";
          if (process.platform === "darwin") {
            const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
            proc.stdin.write(text);
            proc.stdin.end();
          }
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
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
  try {
    startRipStudioServer({ port: 3899 });
  } catch {}
  const win = createRipStudio({ fullscreen: true });
  console.log("⚡ Launching Rip Studio Pro (Safe & Ergonomic Alternative to rm)...");
  win.run();
}
