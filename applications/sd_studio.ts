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
import {
  SD_PRESETS,
  SD_PRESET_NONE,
  SD_MAX_FILE_BYTES,
  findSdPreset,
  parseExtList,
  passesFileFilter,
  isLikelyBinary,
  unescapeReplacement,
  mergeUndo,
  formatReport,
  joinDiffs,
  type UndoRecord,
  type ReportRow,
} from "../src/sd_helpers";
import * as path from "node:path";
import * as fs from "node:fs";

export function createSdStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Sd Studio Pro -- Intuitive Search & Displace (Find & Replace Engine)",
    1240,
    1200,
    {
      appId: "sd_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentResults: FileTransformResult[] = [];
  let selectedFile: FileTransformResult | null = null;
  let rowFiles: string[] = [];
  let lastUndo: UndoRecord[] = [];
  let lastReport: { mode: string; find: string; replace: string; rows: ReportRow[]; skipped: number } | null = null;

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

  // -------------------------------------------------------------------------------------------  // 2. Telemetry Cards
  // -----------------------------------------------------------------------------------------------
  const isShot = process.env.SCREENSHOT_MODE === "1";
  win.beginGroupBox("Search & Replace Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_files", isShot ? "Files Analyzed: 14" : "Files Analyzed: 0");
  win.addLabel("lbl_metric_matches", isShot ? "Matches Found: 8" : "Matches Found: 0");
  win.addLabel("lbl_metric_modified", isShot ? "Files Modified: 3 (Preview)" : "Files Modified: 0");
  win.addLabel("lbl_metric_status", isShot ? "Engine: Preview Ready" : "Engine: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Search & Replace Target Configuration
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Pattern & Replacement Configuration");
  win.beginRow();
  win.addLabel("lbl_find", "Find Pattern:");
  win.addInput("txt_find", isShot ? "function ([a-zA-Z0-9_]+)Async" : "", "Regex (e.g. \\b\\w+Service) or literal text...", { width: 340 });
  win.addLabel("lbl_replace", "Replace With:");
  win.addInput("txt_replace", isShot ? "function $1Sync" : "", "Replacement text (supports $1, $2 captures)...", { width: 340 });
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_targets", "Target Files / Dirs:");
  win.addInput("txt_targets", "./src", "Files or directories to modify (e.g. src, index.ts)...", { width: 440 });
  win.addButton("btn_browse_target", "📄 Browse File...", { width: 120 });
  win.addButton("btn_browse_folder", "📁 Browse Folder...", { width: 130 });
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
  win.addCheckbox("chk_escapes", "Replacement escapes (\\n \\t)", false);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_preset", "Preset:");
  win.addDropdown("dd_preset", [SD_PRESET_NONE, ...SD_PRESETS.map((p) => p.label)], SD_PRESET_NONE, { width: 240 });
  win.addButton("btn_swap", "⇄ Swap Find/Replace", { width: 150 });
  win.addLabel("lbl_exts", "Only extensions:");
  win.addInput("txt_exts", "", "e.g. ts,tsx,md (blank = all)", { width: 170 });
  win.addLabel("lbl_exclude", "Exclude:");
  win.addInput("txt_exclude", "", "e.g. *.min.js, vendor, test/**", { width: 220 });
  win.endRow();

  win.beginRow();
  win.addButton("btn_undo_replace", "↶ Undo Last Replace", { width: 160 });
  win.addButton("btn_copy_diff", "📋 Copy Diff", { width: 120 });
  win.addButton("btn_save_patch", "💾 Save Diff As...", { width: 150 });
  win.addButton("btn_save_report", "📊 Save Report As...", { width: 160 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. File Results Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Modified & Matching Files");
  const tableHeaders = ["File Path", "Matches", "Diff Hunks", "Status"];
  const demoFiles = isShot ? [
    ["src/features/ipinfo/ipinfoDoers.ts", "3 matches", "2 hunks", "Preview OK"],
    ["src/features/procs/procsDoers.ts", "3 matches", "2 hunks", "Preview OK"],
    ["src/features/gdu/gduDoers.ts", "2 matches", "1 hunk", "Preview OK"],
  ] : [];
  win.addTable("tbl_files", tableHeaders, demoFiles, { height: 260 });
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
    const replaceRaw = win.getValue("txt_replace") || "";
    const replacePattern = win.getBool("chk_escapes") ? unescapeReplacement(replaceRaw) : replaceRaw;
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
      const fileFilter = {
        exts: parseExtList(String(win.getValue("txt_exts") || "")),
        exclude: String(win.getValue("txt_exclude") || "").split(/[\s,;]+/).filter(Boolean),
      };
      let skipped = 0;
      const resolvedFiles = expandTargetsSync(targetPaths).filter((f) => {
        if (!passesFileFilter(f, fileFilter)) return false;
        try {
          const st = fs.statSync(f);
          if (st.size > SD_MAX_FILE_BYTES) { skipped++; return false; }
          const fd = fs.openSync(f, "r");
          const buf = Buffer.alloc(Math.min(8192, st.size));
          try { fs.readSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); }
          if (isLikelyBinary(buf)) { skipped++; return false; }
        } catch {
          return false;
        }
        return true;
      });
      const undoBatch: UndoRecord[] = [];
      rowFiles = [];

      let totalMatches = 0;
      let modifiedCount = 0;
      const results: FileTransformResult[] = [];
      const rowResults: (FileTransformResult | null)[] = [];
      const tableRows: string[][] = [];

      for (const file of resolvedFiles) {
        try {
          const original = readContentSync(file);
          const count = countMatches(original, regex);
          if (count > 0) {
            totalMatches += count;
            if (mode === "count") {
              tableRows.push([file, String(count), "N/A", "Matches Found"]);
              rowResults.push(null);
              rowFiles.push(file);
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
                  undoBatch.push({ filePath: file, original: res.originalContent });
                  writeContentSync(file, res.newContent);
                  tableRows.push([file, String(count), String(res.diffHunks.length), createBak ? `Replaced (${backupExt})` : "Replaced"]);
                  rowResults.push(res);
                  rowFiles.push(file);
                } else {
                  tableRows.push([file, String(count), String(res.diffHunks.length), "Diff Ready"]);
                  rowResults.push(res);
                  rowFiles.push(file);
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

      currentResults = rowResults as FileTransformResult[];
      win.setTableData("tbl_files", tableRows);
      win.setValue("lbl_metric_files", `Files Analyzed: ${resolvedFiles.length}`);
      win.setValue("lbl_metric_matches", `Matches Found: ${totalMatches}`);
      win.setValue("lbl_metric_modified", `Files Modified: ${mode === "replace" ? modifiedCount : 0}`);
      win.setValue("lbl_metric_status", `Engine: Completed (${mode})`);
      const skipNote = skipped ? ` Skipped ${skipped} binary/oversized file(s).` : "";
      win.setValue("lbl_status_bar", `✓ Completed ${mode} across ${resolvedFiles.length} file(s). Found ${totalMatches} match(es).${skipNote}`);
      if (mode === "replace" && undoBatch.length) lastUndo = undoBatch;
      lastReport = {
        mode,
        find: findPattern,
        replace: replaceRaw,
        skipped,
        rows: tableRows.map((r) => ({ filePath: r[0]!, matches: Number(r[1]) || 0, hunks: Number(r[2]) || 0, status: r[3]! })),
      };
      if (totalMatches === 0) win.toast("No matches found", 2500, "warning");
      else if (mode === "replace") win.toast(`Replaced in ${modifiedCount} file(s) \u2014 use Undo Last Replace to revert`, 4000, "success");
      else win.toast(`${totalMatches} match(es) in ${tableRows.length} file(s)`, 2500, "success");
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Error: ${err.message}`);
      win.toast(`Error: ${err.message}`, 4000, "error");
      win.appendConsole("console_diffs", `[EXCEPTION] ${err.message}\n`);
    }
  };

  win.on("btn_count_matches", "click", () => executeOperation("count"));
  win.on("btn_preview_diffs", "click", () => executeOperation("preview"));
  win.on("btn_apply_replace", "click", async () => {
    const find = win.getValue("txt_find")?.trim();
    if (!find) {
      win.setValue("lbl_status_bar", "⚠️ Error: Please specify a Find pattern.");
      return;
    }
    const targets = win.getValue("txt_targets")?.trim() || ".";
    const backup = win.getBool("chk_backup");
    const ok = await win.confirm(
      `Replace "${find}" in files under: ${targets}\n\n${backup ? "Backups will be created." : "No backups will be created — this cannot be undone."}\n\nTip: run Preview Diffs first. Continue?`,
      "Confirm Replace In Files"
    );
    if (!ok) {
      win.setValue("lbl_status_bar", "Replace cancelled.");
      return;
    }
    executeOperation("replace");
  });
  win.on("btn_browse_target", "click", () => {
    win.openFile({ title: "Select a target file" }, (p) => {
      if (p) {
        win.setValue("txt_targets", p);
        win.setValue("lbl_status_bar", `Selected target: ${p}`);
      }
    });
  });
  win.on("btn_browse_folder", "click", () => {
    win.openFolder({ title: "Select a target folder" }, (p) => {
      if (p) {
        win.setValue("txt_targets", p);
        win.setValue("lbl_status_bar", `Selected target: ${p}`);
      }
    });
  });

  win.onChange("dd_preset", () => {
    const preset = findSdPreset(String(win.getValue("dd_preset") || ""));
    if (!preset) return;
    win.setValue("txt_find", preset.find);
    win.setValue("txt_replace", preset.replace);
    win.setValue("txt_flags", preset.flags);
    win.setValue("chk_string_mode", preset.literal);
    win.setValue("chk_whole_word", preset.wholeWord);
    win.setValue("chk_ignore_case", preset.ignoreCase);
    win.setValue("chk_escapes", Boolean(preset.escapes));
    win.setValue("lbl_status_bar", `Preset loaded: ${preset.label}. Click Preview Diffs to review.`);
  });

  win.on("btn_swap", "click", () => {
    const f = String(win.getValue("txt_find") || "");
    const r = String(win.getValue("txt_replace") || "");
    win.setValue("txt_find", r);
    win.setValue("txt_replace", f);
    win.setValue("lbl_status_bar", "Swapped Find and Replace.");
  });

  win.on("btn_undo_replace", "click", async () => {
    if (lastUndo.length === 0) {
      win.toast("Nothing to undo", 2500, "warning");
      return;
    }
    const ok = await win.confirm(`Restore ${lastUndo.length} file(s) to their content before the last replace?`, "Undo Last Replace");
    if (!ok) return;
    let restored = 0;
    for (const rec of lastUndo) {
      try {
        writeContentSync(rec.filePath, rec.original);
        restored++;
      } catch (e: any) {
        win.appendConsole("console_diffs", `[UNDO ERROR] ${rec.filePath}: ${e.message}\n`);
      }
    }
    lastUndo = [];
    win.setValue("lbl_status_bar", `Undo complete: restored ${restored} file(s).`);
    win.toast(`Restored ${restored} file(s)`, 3000, "success");
  });

  const diffTexts = (): string[] =>
    currentResults.filter((r): r is FileTransformResult => !!r && r.hasChanged).map((r) => formatDiffPreview(r));

  win.on("btn_copy_diff", "click", () => {
    const text = joinDiffs(diffTexts());
    if (!text) {
      win.toast("No diff to copy \u2014 run Preview Diffs first", 3000, "warning");
      return;
    }
    win.copyToClipboard(text);
    win.toast("Diff copied to clipboard", 2000, "success");
  });

  const saveText = (title: string, defaultName: string, filter: string, make: () => string | null) => {
    const text = make();
    if (!text) {
      win.toast("Nothing to save yet \u2014 run Count or Preview first", 3000, "warning");
      return;
    }
    win.saveFile({ title, defaultName, filter }, (p) => {
      if (!p) return;
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, text, "utf-8");
        win.toast(`Saved ${path.basename(p)}`, 3000, "success");
      } catch (e: any) {
        win.toast(`Save failed: ${e.message}`, 4000, "error");
      }
    });
  };
  win.on("btn_save_patch", "click", () => saveText("Save diff", "sd_changes.diff", "diff,patch,txt", () => joinDiffs(diffTexts()) || null));
  win.on("btn_save_report", "click", () =>
    saveText("Save report", "sd_report.md", "md,txt", () => (lastReport && lastReport.rows.length ? formatReport(lastReport) : null))
  );

  win.on("btn_clear", "click", () => {
    win.setValue("txt_find", "");
    win.setValue("txt_replace", "");
    win.clearConsole("console_diffs");
    win.setTableData("tbl_files", []);
    win.setValue("lbl_status_bar", "Inputs cleared.");
  });

  win.on("tbl_files", "click", (w, val) => {
    const idx = typeof val === "number" ? val : /^\d+$/.test(String(val)) ? Number(val) : rowFiles.indexOf(String(val));
    if (idx >= 0 && currentResults[idx]) {
      selectedFile = currentResults[idx] ?? null;
      if (selectedFile) {
        win.clearConsole("console_diffs");
        const diffText = formatDiffPreview(selectedFile);
        win.appendConsole("console_diffs", diffText + "\n\n");
      }
    }
  });
  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Search and replace configuration saved.");
  });

  return win;
}

if (import.meta.main) {
  const win = createSdStudio({ fullscreen: true });
  console.log("⚡ Launching Sd Studio Pro...");
  win.run();
}
