import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  analyzeDirectory,
  analyzeDirectorySync,
  formatDisksTable,
} from "../src/features/gdu/gduCoordinator.ts";
import {
  fetchMountedDisks,
  fetchMountedDisksSync,
  formatBytes,
  formatRelativeBar,
  sortDiskItems,
  parseByteSize,
} from "../src/features/gdu/gduDoers.ts";
import type { DiskUsageItem, MountedDisk } from "../src/features/gdu/gduTypes.ts";
import * as path from "node:path";
import * as fs from "node:fs";

export function createGduStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Gdu Studio Pro -- Fast Disk Usage Analyzer & Storage Explorer",
    1260,
    940,
    {
      appId: "gdu_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentRoot: DiskUsageItem | null = null;
  let currentItems: DiskUsageItem[] = [];
  let selectedItem: DiskUsageItem | null = null;
  let activePath = path.resolve(".");
  let pathHistory: string[] = [];

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Gdu Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Fast Disk Usage Analyzer -- Interactive Directory Traversal, Visual Size Bars & Storage Telemetry");

  // -----------------------------------------------------------------------------------------------
  // 2. Storage Telemetry
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Disk Usage & Volume Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_folder", "Directory: .");
  win.addLabel("lbl_metric_size", "Total Size: 0 B");
  win.addLabel("lbl_metric_items", "Total Items: 0");
  win.addLabel("lbl_metric_largest", "Largest: None");
  win.addLabel("lbl_metric_status", "Engine: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Navigation & Filter Controls
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Navigation & Scanner Controls");
  win.beginRow();
  win.addLabel("lbl_path", "Target Path:");
  win.addInput("txt_path", ".", "Path to scan...", { width: 340 });
  win.addLabel("lbl_sort", "Sort Order:");
  win.addDropdown("dd_sort", ["Size (Desc)", "Name (Asc)", "Item Count (Desc)", "Modified (Desc)"], "Size (Desc)", { width: 140 });
  win.addLabel("lbl_min_size", "Min Size:");
  win.addInput("txt_min_size", "", "e.g. 1M, 500k...", { width: 80 });
  win.addCheckbox("chk_si", "Decimal SI (MB/GB)", false);
  win.addCheckbox("chk_no_hidden", "Hide Dotfiles", false);
  win.endRow();

  win.beginRow();
  win.addButton("btn_scan", "🔍 Scan Target", { width: 120 });
  win.addButton("btn_parent", "⬆️ Up to Parent", { width: 130 });
  win.addButton("btn_drill_in", "📂 Drill Down", { width: 120 });
  win.addButton("btn_disks", "💾 Mounted Disks", { width: 140 });
  win.addButton("btn_delete", "🗑️ Delete Item", { width: 120 });
  win.addButton("btn_rescan", "🔄 Rescan", { width: 90 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Directory Items Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Directory Structure & Storage Consumption");
  const tableHeaders = ["Name", "Type", "Size", "Proportion Bar", "Sub-Items", "Modified Date", "Full Path"];
  win.addTable("tbl_items", tableHeaders, [], { height: 320 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Item Telemetry Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Inspection & System Volume Telemetry");
  win.addConsole("console_gdu", 180);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Click Scan Target to compute disk usage.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Scanning & Navigation Logic
  // -----------------------------------------------------------------------------------------------
  const scanCurrentPath = (targetDir: string) => {
    win.setValue("lbl_status_bar", `Scanning directory "${targetDir}"...`);
    activePath = path.resolve(targetDir);
    win.setValue("txt_path", activePath);

    const sortSel = win.getValue("dd_sort");
    let sortBy: "size" | "name" | "itemCount" | "mtime" = "size";
    if (sortSel?.includes("Name")) sortBy = "name";
    else if (sortSel?.includes("Item Count")) sortBy = "itemCount";
    else if (sortSel?.includes("Modified")) sortBy = "mtime";

    const si = win.getBool("chk_si");
    const noHidden = win.getBool("chk_no_hidden");
    const minSizeStr = win.getValue("txt_min_size")?.trim();

    try {
      const root = analyzeDirectorySync({
        targetDir: activePath,
        sortBy,
        si,
        noHidden,
      });

      currentRoot = root;
      let rawItems = root.children ?? [];

      if (minSizeStr) {
        const minBytes = parseByteSize(minSizeStr);
        rawItems = rawItems.filter((i) => i.size >= minBytes);
      }

      const sorted = sortDiskItems(rawItems, sortBy);
      currentItems = sorted;

      const maxSize = sorted[0]?.size ?? root.size;

      const rows: string[][] = sorted.map((item) => [
        item.name,
        item.isDirectory ? "📁 DIR" : "📄 FILE",
        formatBytes(item.size, si),
        formatRelativeBar(maxSize > 0 ? item.size / maxSize : 0, 12),
        item.itemCount !== undefined ? item.itemCount.toLocaleString() : "1",
        item.mtime ? new Date(item.mtime).toLocaleDateString() : "-",
        item.path,
      ]);

      win.setTableData("tbl_items", rows);

      win.setValue("lbl_metric_folder", `Directory: ${path.basename(activePath) || activePath}`);
      win.setValue("lbl_metric_size", `Total Size: ${formatBytes(root.size, si)}`);
      win.setValue("lbl_metric_items", `Total Items: ${root.itemCount?.toLocaleString() ?? sorted.length}`);
      win.setValue("lbl_metric_largest", sorted[0] ? `Largest: ${sorted[0].name} (${formatBytes(sorted[0].size, si)})` : "None");
      win.setValue("lbl_metric_status", "Engine: Completed");
      win.setValue("lbl_status_bar", `✓ Scanned ${sorted.length} item(s) in "${activePath}". Total: ${formatBytes(root.size, si)}.`);

      win.clearConsole("console_gdu");
      win.appendConsole("console_gdu", `CURRENT DIRECTORY: ${activePath}\n`);
      win.appendConsole("console_gdu", `Total Disk Space Consumed: ${formatBytes(root.size, si)} across ${root.itemCount ?? sorted.length} files/folders.\n`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Scan error: ${err.message}`);
    }
  };

  win.on("btn_scan", "click", () => {
    const p = win.getValue("txt_path")?.trim() || ".";
    return scanCurrentPath(p);
  });

  win.on("btn_rescan", "click", () => {
    return scanCurrentPath(activePath);
  });

  win.on("btn_parent", "click", () => {
    const parent = path.dirname(activePath);
    if (parent && parent !== activePath) {
      pathHistory.push(activePath);
      return scanCurrentPath(parent);
    }
  });

  win.on("btn_drill_in", "click", () => {
    if (selectedItem && selectedItem.isDirectory) {
      pathHistory.push(activePath);
      return scanCurrentPath(selectedItem.path);
    } else {
      win.setValue("lbl_status_bar", "⚠️ Please select a directory row from the table to drill down.");
    }
  });

  win.on("tbl_items", "click", (w, val) => {
    if (typeof val === "number" && currentItems[val]) {
      selectedItem = currentItems[val];
      if (selectedItem) {
        win.clearConsole("console_gdu");
        win.appendConsole("console_gdu", `=================================================================\n`);
        win.appendConsole("console_gdu", `SELECTED ITEM: ${selectedItem.name}\n`);
        win.appendConsole("console_gdu", `=================================================================\n`);
        win.appendConsole("console_gdu", `Type:          ${selectedItem.isDirectory ? "Directory" : "File"}\n`);
        win.appendConsole("console_gdu", `Size:          ${formatBytes(selectedItem.size)} (${selectedItem.size.toLocaleString()} bytes)\n`);
        win.appendConsole("console_gdu", `Sub-items:     ${selectedItem.itemCount ?? 1}\n`);
        win.appendConsole("console_gdu", `Full Path:     ${selectedItem.path}\n`);
        win.appendConsole("console_gdu", `Modified:      ${selectedItem.mtime ? new Date(selectedItem.mtime).toISOString() : "Unknown"}\n`);
        win.setValue("lbl_status_bar", `Selected: ${selectedItem.name} (${formatBytes(selectedItem.size)})`);
      }
    }
  });

  win.on("btn_disks", "click", () => {
    win.setValue("lbl_status_bar", "Querying mounted storage disks...");
    try {
      const disks = fetchMountedDisksSync();
      const tableText = formatDisksTable(disks);
      win.clearConsole("console_gdu");
      win.appendConsole("console_gdu", `=================================================================\n`);
      win.appendConsole("console_gdu", `MOUNTED FILESYSTEMS & DISK VOLUMES\n`);
      win.appendConsole("console_gdu", `=================================================================\n`);
      win.appendConsole("console_gdu", tableText + "\n");
      win.setValue("lbl_status_bar", `✓ Found ${disks.length} mounted filesystem volume(s).`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Error fetching disks: ${err.message}`);
    }
  });

  win.on("btn_delete", "click", async () => {
    if (!selectedItem) {
      win.setValue("lbl_status_bar", "⚠️ Please select an item to delete.");
      return;
    }
    const itemPath = selectedItem.path;
    const itemName = selectedItem.name;
    try {
      win.setValue("lbl_status_bar", `Deleting ${itemName}...`);
      if (selectedItem.isDirectory) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }
      win.setValue("lbl_status_bar", `✓ Deleted "${itemName}". Rescanning...`);
      selectedItem = null;
      setTimeout(() => scanCurrentPath(activePath), 300);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Failed to delete: ${err.message}`);
    }
  });

  // Initial scan
  setTimeout(() => scanCurrentPath("."), 100);

  return win;
}

if (import.meta.main) {
  const win = createGduStudio({ fullscreen: true });
  console.log("⚡ Launching Gdu Studio Pro...");
  win.run();
}
