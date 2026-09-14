import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { computeCodeStats, computeCodeStatsSync } from "../src/features/tokei/tokeiCoordinator.ts";
import {
  sortReports,
  formatMarkdownTable,
  formatJsonReports,
  formatFilesBreakdown,
} from "../src/features/tokei/tokeiDoers.ts";
import type { LanguageReport, TokeiSortField } from "../src/features/tokei/tokeiTypes.ts";

export function createTokeiStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Tokei Studio Pro -- Fast Code & Lines-of-Code (LOC) Counter",
    1240,
    1060,
    {
      appId: "tokei_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentReports: LanguageReport[] = [];

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Tokei Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Code Statistics & Metrics -- Rapid Multi-Language LOC & Comment Analyzer");

  // 2. Telemetry Cards
  // -----------------------------------------------------------------------------------------------
  const isShot = process.env.SCREENSHOT_MODE === "1";
  win.beginGroupBox("Codebase Metrics Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_langs", isShot ? "Languages: 5" : "Languages: 0");
  win.addLabel("lbl_metric_files", isShot ? "Total Files: 52" : "Total Files: 0");
  win.addLabel("lbl_metric_lines", isShot ? "Total Lines: 18,450" : "Total Lines: 0");
  win.addLabel("lbl_metric_code", isShot ? "Code Lines: 14,200" : "Code Lines: 0");
  win.addLabel("lbl_metric_comments", isShot ? "Comments: 2,150 (11.7%)" : "Comments: 0 (0%)");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Configuration & Target
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Scan Target & Analyzer Settings");
  win.beginRow();
  win.addLabel("lbl_path", "Scan Directory:");
  win.addInput("txt_path", ".", "Target path to scan...", { width: 340 });
  win.addLabel("lbl_sort", "Sort Column:");
  win.addDropdown("dd_sort", ["Code (Default)", "Files", "Lines", "Comments", "Blanks"], "Code (Default)", { width: 140 });
  win.addLabel("lbl_exclude", "Exclude:");
  win.addInput("txt_exclude", "node_modules,dist,.git,.graveyard", "Patterns to exclude...", { width: 240 });
  win.addButton("btn_analyze", "📊 Analyze Codebase", { width: 150 });
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_hidden", "Include Hidden Files (-H)", false);
  win.addCheckbox("chk_files", "Include Per-File Breakdown", false);
  win.addButton("btn_copy_markdown", "📋 Copy Markdown Table", { width: 180 });
  win.addButton("btn_export_json", "💾 Export JSON", { width: 130 });
  win.addButton("btn_clear", "✕ Clear", { width: 80 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Language Statistics Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Language Breakdown & Lines of Code");
  const tableHeaders = ["Language", "Files", "Total Lines", "Code", "Comments", "Blanks", "Code %"];
  const demoTokei = isShot ? [
    ["TypeScript", "32", "12,450", "9,800", "1,450", "1,200", "78.7%"],
    ["HTML", "4", "2,800", "2,400", "150", "250", "85.7%"],
    ["CSS", "3", "1,200", "950", "100", "150", "79.2%"],
    ["JSON", "8", "1,100", "1,050", "0", "50", "95.5%"],
    ["Markdown", "5", "900", "0", "450", "450", "0.0%"],
  ] : [];
  win.addTable("tbl_tokei", tableHeaders, demoTokei, { height: 280 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Output Preview / Export Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Export & File Breakdown Preview");
  win.addConsole("console_tokei", 200);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Click Analyze Codebase to calculate lines of code.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Logic
  // -----------------------------------------------------------------------------------------------
  const analyzeCodebase = () => {
    const scanPath = win.getValue("txt_path")?.trim() || ".";
    const excludeStr = win.getValue("txt_exclude")?.trim();
    const excludes = excludeStr ? excludeStr.split(",").map((s: string) => s.trim()) : undefined;
    const hidden = win.getBool("chk_hidden");
    const showFiles = win.getBool("chk_files");

    const sortSel = win.getValue("dd_sort");
    let sortField: TokeiSortField = "code";
    if (sortSel?.includes("Files")) sortField = "files";
    else if (sortSel?.includes("Lines")) sortField = "lines";
    else if (sortSel?.includes("Comments")) sortField = "comment";
    else if (sortSel?.includes("Blanks")) sortField = "blank";

    win.setValue("lbl_status_bar", `Scanning directory "${scanPath}"...`);

    try {
      const rawReports = computeCodeStatsSync({
        paths: [scanPath],
        sort: sortField,
        showFiles,
        hidden,
        excludes,
      });

      const reports = sortReports(rawReports, sortField);
      currentReports = reports;

      let totalFiles = 0;
      let totalLines = 0;
      let totalCode = 0;
      let totalComment = 0;
      let totalBlank = 0;

      const rows: string[][] = reports.map((r) => {
        totalFiles += r.files;
        totalLines += r.stats.lines;
        totalCode += r.stats.code;
        totalComment += r.stats.comment;
        totalBlank += r.stats.blank;

        const codePercent = r.stats.lines > 0 ? ((r.stats.code / r.stats.lines) * 100).toFixed(1) + "%" : "0%";
        return [
          r.language,
          String(r.files),
          r.stats.lines.toLocaleString(),
          r.stats.code.toLocaleString(),
          r.stats.comment.toLocaleString(),
          r.stats.blank.toLocaleString(),
          codePercent,
        ];
      });

      // Append Total Row
      const overallCodePct = totalLines > 0 ? ((totalCode / totalLines) * 100).toFixed(1) + "%" : "0%";
      rows.push([
        "TOTAL",
        String(totalFiles),
        totalLines.toLocaleString(),
        totalCode.toLocaleString(),
        totalComment.toLocaleString(),
        totalBlank.toLocaleString(),
        overallCodePct,
      ]);

      win.setTableData("tbl_tokei", rows);

      const commentPct = totalLines > 0 ? ((totalComment / totalLines) * 100).toFixed(1) : "0";
      win.setValue("lbl_metric_langs", `Languages: ${reports.length}`);
      win.setValue("lbl_metric_files", `Total Files: ${totalFiles}`);
      win.setValue("lbl_metric_lines", `Total Lines: ${totalLines.toLocaleString()}`);
      win.setValue("lbl_metric_code", `Code Lines: ${totalCode.toLocaleString()}`);
      win.setValue("lbl_metric_comments", `Comments: ${totalComment.toLocaleString()} (${commentPct}%)`);

      win.clearConsole("console_tokei");
      if (showFiles) {
        const breakdownLines = formatFilesBreakdown(reports);
        for (const line of breakdownLines) {
          win.appendConsole("console_tokei", line + "\n");
        }
      } else {
        const md = formatMarkdownTable(reports);
        win.appendConsole("console_tokei", md + "\n");
      }

      win.setValue("lbl_status_bar", `✓ Completed scan of ${totalFiles} file(s) across ${reports.length} language(s).`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Error during analysis: ${err.message}`);
    }
  };

  win.on("btn_analyze", "click", () => analyzeCodebase());

  win.on("btn_copy_markdown", "click", () => {
    if (currentReports.length === 0) {
      win.setValue("lbl_status_bar", "⚠️ Run analysis first before exporting.");
      return;
    }
    const md = formatMarkdownTable(currentReports);
    win.clearConsole("console_tokei");
    win.appendConsole("console_tokei", md);
    win.setValue("lbl_status_bar", "✓ Markdown table generated in preview console.");
  });

  win.on("btn_export_json", "click", () => {
    if (currentReports.length === 0) {
      win.setValue("lbl_status_bar", "⚠️ Run analysis first before exporting.");
      return;
    }
    const jsonStr = formatJsonReports(currentReports);
    win.clearConsole("console_tokei");
    win.appendConsole("console_tokei", jsonStr);
    win.setValue("lbl_status_bar", "✓ JSON report generated in preview console.");
  });

  win.on("btn_clear", "click", () => {
    win.setTableData("tbl_tokei", []);
    win.clearConsole("console_tokei");
    win.setValue("lbl_status_bar", "Cleared.");
  });
  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Code analysis configuration saved.");
  });

  // Initial scan
  setTimeout(() => analyzeCodebase(), 100);

  return win;
}

if (import.meta.main) {
  const win = createTokeiStudio({ fullscreen: true });
  console.log("⚡ Launching Tokei Studio Pro...");
  win.run();
}
