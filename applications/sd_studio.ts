import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  buildReplacerRegex,
  computeDiffHunks,
  countMatches,
  createBackup,
  createBackupSync,
  expandTargets,
  expandTargetsSync,
  formatDiffPreview,
  readContent,
  readContentSync,
  replaceText,
  writeContent,
  writeContentSync,
  processFileSync,
} from "../src/features/sd/sdDoers.ts";
import { processFile, runSdCoordinator } from "../src/features/sd/sdCoordinator.ts";
import type { FileTransformResult } from "../src/features/sd/sdTypes.ts";
import * as path from "node:path";
import * as fs from "node:fs";

export function createSdStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Sd Studio Pro -- Intuitive Search & Displace (Find & Replace Engine)",
    1240,
    920,
    {
      appId: "sd_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentResults: FileTransformResult[] = [];
  let selectedFile: FileTransformResult | null = null;

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Sd Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Intuitive Search & Displace -- Modern sed Alternative with Live Diffs & Regex Captures");

  // -----------------------------------------------------------------------------------------------
  // 2. Telemetry Cards
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Search & Replace Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_files", "Files Analyzed: 0");
  win.addLabel("lbl_metric_matches", "Matches Found: 0");
  win.addLabel("lbl_metric_modified", "Files Modified: 0");
  win.addLabel("lbl_metric_status", "Engine: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Search & Replace Target Configuration
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Pattern & Replacement Configuration");
  win.beginRow();
  win.addLabel("lbl_find", "Find Pattern:");
  win.addInput("txt_find", "", "Regex (e.g. \\b\\w+Service) or literal text...", { width: 340 });
  win.addLabel("lbl_replace", "Replace With:");
  win.addInput("txt_replace", "", "Replacement text (supports $1, $2 captures)...", { width: 340 });
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_targets", "Target Files / Dirs:");
  win.addInput("txt_targets", "./src", "Files or directories to modify (e.g. src, index.ts)...", { width: 440 });
  win.addButton("btn_browse_target", "📁 Browse...", { width: 100 });
  win.addButton("btn_count_matches", "🔍 Count Matches", { width: 140 });
  win.addButton("btn_preview_diffs", "👁️ Preview Diffs", { width: 140 });
  win.addButton("btn_apply_replace", "⚡ Replace In Files", { width: 150 });
  win.addButton("btn_clear", "✕ Clear", { width: 75 });
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_string_mode", "Literal String Mode (-s)", false);
  win.addCheckbox("chk_whole_word", "Whole Word Only (-w)", false);
  win.addCheckbox("chk_ignore_case", "Ignore Case (-i)", false);
  win.addCheckbox("chk_backup", "Create Backup (.bak)", false);
  win.addLabel("lbl_backup_ext", "Ext:");
  win.addInput("txt_backup_ext", ".bak", ".bak", { width: 60 });
  win.addLabel("lbl_flags", "Flags:");
  win.addInput("txt_flags", "g", "g, i, m...", { width: 60 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. File Results Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Modified & Matching Files");
  const tableHeaders = ["File Path", "Matches", "Diff Hunks", "Status"];
  win.addTable("tbl_files", tableHeaders, [], { height: 200 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Diff Inspector Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Unified Diff Inspector");
  win.addConsole("console_diffs", 260);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Specify a search pattern and target files to begin.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Event Handlers
  // -----------------------------------------------------------------------------------------------
  const executeOperation = (mode: "count" | "preview" | "replace") => {
    const findPattern = win.getValue("txt_find")?.trim();
    const replacePattern = win.getValue("txt_replace") || "";
    const targetsStr = win.getValue("txt_targets")?.trim() || ".";
    const stringMode = win.getBool("chk_string_mode");
    const wholeWord = win.getBool("chk_whole_word");
    const ignoreCase = win.getBool("chk_ignore_case");
    const createBak = win.getBool("chk_backup");
    const backupExt = win.getValue("txt_backup_ext")?.trim() || ".bak";
    const flags = win.getValue("txt_flags")?.trim() || "g";

    if (!findPattern) {
      win.setValue("lbl_status_bar", "⚠️ Error: Please specify a Find pattern.");
      return;
    }

    win.setValue("lbl_status_bar", `Running ${mode.toUpperCase()} on targets...`);
    win.clearConsole("console_diffs");

    try {
      const regex = buildReplacerRegex(findPattern, stringMode, flags, ignoreCase, wholeWord);
      const targetPaths = targetsStr.split(/[\s,]+/).filter(Boolean);
      const resolvedFiles = expandTargetsSync(targetPaths);

      let totalMatches = 0;
      let modifiedCount = 0;
      const results: FileTransformResult[] = [];
      const tableRows: string[][] = [];

      for (const file of resolvedFiles) {
        try {
          const original = readContentSync(file);
          const count = countMatches(original, regex);
          if (count > 0) {
            totalMatches += count;
            if (mode === "count") {
              tableRows.push([file, String(count), "N/A", "Matches Found"]);
              win.appendConsole("console_diffs", `[MATCH] ${file}: ${count} match(es)\n`);
            } else {
              const res = processFileSync(file, regex, replacePattern);
              results.push(res);
              if (res.hasChanged) {
                modifiedCount++;
                if (mode === "replace") {
                  if (createBak) {
                    createBackupSync(file, backupExt);
                  }
                  writeContentSync(file, res.newContent);
                  tableRows.push([file, String(count), String(res.diffHunks.length), createBak ? `Replaced (${backupExt})` : "Replaced"]);
                } else {
                  tableRows.push([file, String(count), String(res.diffHunks.length), "Diff Ready"]);
                }

                // Append diff to console
                const diffText = formatDiffPreview(res);
                win.appendConsole("console_diffs", diffText + "\n\n");
              }
            }
          }
        } catch (e: any) {
          win.appendConsole("console_diffs", `[ERROR] ${file}: ${e.message}\n`);
        }
      }

      currentResults = results;
      win.setTableData("tbl_files", tableRows);
      win.setValue("lbl_metric_files", `Files Analyzed: ${resolvedFiles.length}`);
      win.setValue("lbl_metric_matches", `Matches Found: ${totalMatches}`);
      win.setValue("lbl_metric_modified", `Files Modified: ${mode === "replace" ? modifiedCount : 0}`);
      win.setValue("lbl_metric_status", `Engine: Completed (${mode})`);
      win.setValue("lbl_status_bar", `✓ Completed ${mode} across ${resolvedFiles.length} file(s). Found ${totalMatches} match(es).`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Error: ${err.message}`);
      win.appendConsole("console_diffs", `[EXCEPTION] ${err.message}\n`);
    }
  };

  win.on("btn_count_matches", "click", () => executeOperation("count"));
  win.on("btn_preview_diffs", "click", () => executeOperation("preview"));
  win.on("btn_apply_replace", "click", () => executeOperation("replace"));

  win.on("btn_clear", "click", () => {
    win.setValue("txt_find", "");
    win.setValue("txt_replace", "");
    win.clearConsole("console_diffs");
    win.setTableData("tbl_files", []);
    win.setValue("lbl_status_bar", "Inputs cleared.");
  });

  win.on("tbl_files", "click", (w, val) => {
    if (typeof val === "number" && currentResults[val]) {
      selectedFile = currentResults[val];
      if (selectedFile) {
        win.clearConsole("console_diffs");
        const diffText = formatDiffPreview(selectedFile);
        win.appendConsole("console_diffs", diffText + "\n\n");
      }
    }
  });

  return win;
}

if (import.meta.main) {
  const win = createSdStudio({ fullscreen: true });
  console.log("⚡ Launching Sd Studio Pro...");
  win.run();
}
