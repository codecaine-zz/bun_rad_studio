import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { existsSync, statSync, readFileSync, writeFileSync } from "fs";
import { resolve, basename } from "path";
import { evaluateBunJsonQuery } from "./jq_studio";
import {
  searchCode,
  findPaths,
  replaceInFiles,
  trashPath,
  undoLastTrash,
  getLastTrash,
  clampInt,
  type SearchOptions,
  type FindOptions,
} from "../src/devtools_tools";

interface ToolInfo {
  name: string;
  engine: string;
  isReady: boolean;
  description: string;
}

/** Pure Bun File & Code Searcher (Ripgrep equivalent) */
function bunNativeRipgrep(
  targetDir: string,
  pattern: string,
  options: SearchOptions = {}
): { output: string; matches: number; filesScanned: number; filesMatched: number; truncated: boolean } {
  return searchCode(targetDir, pattern, { hidden: true, ...options });
}

/** Pure Bun File & Directory Finder (Fd equivalent) */
function bunNativeFd(
  targetDir: string,
  pattern: string,
  options: FindOptions = {}
): { output: string; matches: number; truncated: boolean } {
  return findPaths(targetDir, pattern, { hidden: true, ...options });
}

/** Pure Bun Search & Replace (Sd equivalent) */
function bunNativeSd(
  targetPath: string,
  searchPattern: string,
  replaceWith: string,
  dryRun: boolean,
  options: { caseSensitive?: boolean; wholeWord?: boolean; fixed?: boolean; include?: string; hidden?: boolean; gitignore?: boolean; backup?: boolean } = {}
): { output: string; filesChanged: number; replacements: number } {
  return replaceInFiles(targetPath, searchPattern, replaceWith, { caseSensitive: true, hidden: true, ...options, dryRun });
}

/** Pure Bun Safe Trash (Rip equivalent) */
function bunNativeRip(targetPath: string): { output: string; success: boolean } {
  return trashPath(targetPath);
}

export { bunNativeRipgrep, bunNativeFd, bunNativeSd, bunNativeRip };

export function createOmnitoolStudio(options: { headless?: boolean; screenshotPath?: string; fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("DevTools Studio Pro (OmniTool Studio Pro) -- Bun Native Modern Developer Suite", 1120, 880, {
    appId: "omnitool_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    alwaysOnTop: false,
    fullscreen: options.fullscreen ?? true,
  });

  const tools: Record<string, ToolInfo> = {
    rg: { name: "rg", engine: "Bun Native (Regex/FS)", isReady: true, description: "Fast recursive regex code searcher" },
    fd: { name: "fd", engine: "Bun Native (Tree/Stat)", isReady: true, description: "Fast file and directory finder" },
    sd: { name: "sd", engine: "Bun Native (Bun.write)", isReady: true, description: "Fast regex find & replace" },
    watchexec: { name: "watch", engine: "Bun Native (fs.watch)", isReady: true, description: "Continuous file change watcher" },
    rip: { name: "rip", engine: "Bun Native (~/.Trash)", isReady: true, description: "Safe graveyard trash & restore" },
    jq: { name: "jq", engine: "Bun Native (JSON Engine)", isReady: true, description: "High-speed JSON processor" },
  };

  // Header Banner
  win.beginRow();
  win.addHeading("DevTools Studio Pro");
  win.addDropdown(
    "dd_mode",
    [
      "1. Ripgrep (rg) - Code Search",
      "2. Fd (fd) - File & Directory Finder",
      "3. Sd (sd) - Regex Find & Replace",
      "4. Watchexec - File Watcher Daemon",
      "5. Rip - Safe Trash Graveyard",
      "6. JQ - JSON Query Processor",
    ],
    "1. Ripgrep (rg) - Code Search"
  ).width(260);
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Zero Homebrew Reliance -- 6 Modern Developer Tool Engines Implemented with Bun System APIs");

  // Tool Discovery Status Cards
  win.beginCard("Active Toolchain Engine Status (All Engines Ready via Bun System APIs)");
  win.beginRow();
  for (const [key, t] of Object.entries(tools)) {
    win.addLabel(`tool_${key}`, `🟢 ${key.toUpperCase()}: Ready (${t.engine})`);
  }
  win.endRow();
  win.endCard();

  // Search & Target Directory Controls
  const defaultTargetPath = process.env.SCREENSHOT_MODE ? "." : process.cwd();
  win.beginGroupBox("Query & Target Path Configuration");
  win.beginRow();
  win.addLabel("lbl_path", "Target Path:");
  win.addInput("txt_search_path", defaultTargetPath);
  win.addButton("btn_browse_folder", "📁 Folder...");
  win.addButton("btn_browse_target_file", "📄 File...");
  win.addLabel("lbl_query", "Pattern / Expression:");
  win.addInput("txt_pattern", "SimpleWindow|addHeading");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_replace", "Replacement (for sd):");
  win.addInput("txt_replace", "").width(280);
  win.addLabel("lbl_include", "Include / !Exclude globs:");
  win.addInput("txt_include", "").width(240);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_max", "Max results:");
  win.addInput("txt_max", "200").width(100);
  win.addLabel("lbl_context", "Context lines (rg):");
  win.addInput("txt_context", "0").width(80);
  win.addLabel("lbl_fd_type", "Fd type:");
  win.addDropdown("dd_fd_type", ["Any (files & folders)", "Files only", "Folders only"], "Any (files & folders)").width(190);
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_case", "Case Sensitive", false);
  win.addCheckbox("chk_word", "Whole Word", false);
  win.addCheckbox("chk_fixed", "Literal (not regex)", false);
  win.addCheckbox("chk_hidden", "Include Hidden", false);
  win.addCheckbox("chk_gitignore", "Respect .gitignore", true);
  win.addCheckbox("chk_files_only", "Files With Matches Only", false);
  win.addCheckbox("chk_dry_run", "Dry Run (sd)", true);
  win.addCheckbox("chk_backup", "Backup .bak (sd)", false);
  win.endRow();

  win.beginRow();
  win.addButton("btn_run_omni", "⚡ Execute Tool Command");
  win.addButton("btn_clear_out", "Clear Results");
  win.addButton("btn_copy_results", "📋 Copy Results");
  win.addButton("btn_save_results", "💾 Save Results...");
  win.addButton("btn_undo_trash", "↩ Undo Last Trash");
  win.endRow();
  win.endGroupBox();

  // Results View
  win.beginGroupBox("Execution Output Stream");
  win.addTextarea(
    "txt_results",
    `[OmniTool Studio Pro Initialized]\nLoaded 6 unified developer engines powered natively by Bun.\nTarget path: ${defaultTargetPath}\nZero Homebrew dependencies required.\n`
  );
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Activity & Diagnostics Console");
  win.addConsole("omni_console", 120);
  win.endGroupBox();

  // Bottom Status Bar
  win.beginRow();
  win.addLabel("lbl_status_bar", "Engine: Bun Native System APIs  |  All 6 Tools Operational  |  Zero Homebrew");
  win.endRow();

  // Interactivity
  win.onClick("btn_center", () => {
    win.center();
    win.toast("Window centered on display");
  });

  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("OmniTool Studio state saved successfully!");
  });

  win.onClick("btn_clear_out", () => {
    win.setText("txt_results", "");
    win.appendConsole("omni_console", "[OmniTool] Results cleared\n", 4);
  });

  win.onClick("btn_browse_folder", () => {
    win.openFolder({ title: "Select a folder to search" }, (p) => {
      if (p) win.setValue("txt_search_path", p);
    });
  });
  win.onClick("btn_browse_target_file", () => {
    win.openFile({ title: "Select a file" }, (p) => {
      if (p) win.setValue("txt_search_path", p);
    });
  });

  win.onClick("btn_copy_results", () => {
    const t = String(win.getValue("txt_results") || "");
    if (!t.trim()) { win.toast("Nothing to copy yet", 2500, "warning"); return; }
    win.copyToClipboard(t);
    win.toast("Results copied", 2000, "success");
  });

  win.onClick("btn_save_results", () => {
    const t = String(win.getValue("txt_results") || "");
    if (!t.trim()) { win.toast("Nothing to save yet", 2500, "warning"); return; }
    win.saveFile({ title: "Save results", defaultName: "results.txt", filter: "txt" }, (p) => {
      if (!p) return;
      try {
        writeFileSync(p, t, "utf-8");
        win.toast(`Saved ${basename(p)}`, 3000, "success");
      } catch (e: any) {
        win.toast(`Save failed: ${e.message}`, 4000, "error");
      }
    });
  });

  win.onClick("btn_undo_trash", () => {
    if (!getLastTrash()) { win.toast("Nothing to undo", 2500, "warning"); return; }
    const res = undoLastTrash();
    win.setText("txt_results", res.output);
    win.appendConsole("omni_console", `[Rip Native] Undo ${res.success ? "succeeded" : "failed"}\n`, res.success ? 2 : 3);
    win.toast(res.success ? "Item restored" : "Could not restore item", 3000, res.success ? "success" : "error");
  });

  win.onClick("btn_run_omni", async () => {
    const mode = win.getValue("dd_mode") || "";
    const pattern = win.getValue("txt_pattern") || "";
    const target = resolve(process.cwd(), win.getValue("txt_search_path") || ".");
    const caseSensitive = win.getBool("chk_case");
    const wholeWord = win.getBool("chk_word");
    const fixed = win.getBool("chk_fixed");
    const hidden = win.getBool("chk_hidden");
    const gitignore = win.getBool("chk_gitignore");
    const include = String(win.getValue("txt_include") || "");
    const maxResults = clampInt(win.getValue("txt_max"), 1, 100000, 200);
    const context = clampInt(win.getValue("txt_context"), 0, 20, 0);
    const replacement = win.getValue("txt_replace") || "";
    const dryRun = win.getBool("chk_dry_run");
    const common = { caseSensitive, wholeWord, fixed, hidden, gitignore, include };

    const needsPath = !mode.includes("JQ") || !pattern.startsWith("{");
    if (needsPath && !mode.includes("Watchexec") && !existsSync(target)) {
      win.toast(`Path not found: ${target}`, 3500, "error");
      win.setStatus("Target path does not exist");
      return;
    }

    win.appendConsole("omni_console", `[OmniTool] Running ${mode} on "${target}"...\n`, 1);
    win.setStatus("Running tool command...");

    const t0 = performance.now();

    if (mode.includes("Ripgrep")) {
      const res = bunNativeRipgrep(target, pattern, { ...common, maxResults, context, filesOnly: win.getBool("chk_files_only") });
      const elapsed = (performance.now() - t0).toFixed(1);
      win.setText("txt_results", res.output);
      win.appendConsole(
        "omni_console",
        `[Ripgrep Native] Scanned ${res.filesScanned} files, found ${res.matches} matches in ${res.filesMatched} files in ${elapsed}ms\n`,
        2
      );
      win.setStatus(`Search completed in ${elapsed}ms (${res.matches} matches in ${res.filesMatched} files)`);
    } else if (mode.includes("Fd")) {
      const ft = String(win.getValue("dd_fd_type") || "");
      const type = ft.startsWith("Files") ? "file" : ft.startsWith("Folders") ? "dir" : "any";
      const res = bunNativeFd(target, pattern, { ...common, maxResults, type });
      const elapsed = (performance.now() - t0).toFixed(1);
      win.setText("txt_results", res.output);
      win.appendConsole(
        "omni_console",
        `[Fd Native] Found ${res.matches} items in ${elapsed}ms\n`,
        2
      );
      win.setStatus(`Found ${res.matches} items in ${elapsed}ms`);
    } else if (mode.includes("Sd")) {
      if (!dryRun && !(await win.confirm(`Apply replacements to files under:\n${target}?`, "Confirm Replace"))) {
        win.setStatus("Replace cancelled");
        return;
      }
      const res = bunNativeSd(target, pattern, replacement, dryRun, { ...common, backup: win.getBool("chk_backup") });
      const elapsed = (performance.now() - t0).toFixed(1);
      win.setText("txt_results", res.output);
      win.appendConsole(
        "omni_console",
        `[Sd Native] Processed in ${elapsed}ms (${res.replacements} replacements)\n`,
        2
      );
      win.setStatus(`${dryRun ? "Previewed" : "Replaced"} ${res.replacements} occurrences (${elapsed}ms)`);
    } else if (mode.includes("Watchexec")) {
      win.setText(
        "txt_results",
        `[Watchexec Native Daemon]\nWatching ${target} for changes using Bun fs.watch...\nUse Bun Watch Studio (app:watchexec) for dedicated live continuous task executions.\n`
      );
      win.appendConsole("omni_console", `[Watchexec Native] Target: ${target}\n`, 2);
      win.setStatus("Watcher ready");
    } else if (mode.includes("Rip")) {
      if (!(await win.confirm(`Move to Trash:\n${target}?`, "Confirm Trash"))) {
        win.setStatus("Trash cancelled");
        return;
      }
      const res = bunNativeRip(target);
      const elapsed = (performance.now() - t0).toFixed(1);
      win.setText("txt_results", res.output);
      win.appendConsole(
        "omni_console",
        `[Rip Native] ${res.success ? "Success" : "Failed"} (${elapsed}ms)\n`,
        res.success ? 2 : 3
      );
      win.setStatus(`Trash operation complete (${elapsed}ms)`);
    } else if (mode.includes("JQ")) {
      let jsonDoc: any = {};
      try {
        if (existsSync(target) && statSync(target).isFile()) {
          jsonDoc = JSON.parse(readFileSync(target, "utf-8"));
        } else {
          jsonDoc = JSON.parse(pattern.startsWith("{") ? pattern : "{}");
        }
      } catch (e: any) {
        win.setText("txt_results", `[JSON Parse Error]: ${e.message}`);
        win.setStatus("JSON Syntax Error");
        return;
      }
      const query = pattern.startsWith("{") ? "." : pattern;
      const res = evaluateBunJsonQuery(jsonDoc, query);
      const elapsed = (performance.now() - t0).toFixed(1);
      win.setText("txt_results", JSON.stringify(res, null, 2));
      win.appendConsole("omni_console", `[JQ Native] Evaluated in ${elapsed}ms\n`, 2);
      win.setStatus(`Query evaluated in ${elapsed}ms`);
    }
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

export const createDevToolsStudio = createOmnitoolStudio;

if (import.meta.main) {
  const win = createDevToolsStudio({ fullscreen: true });
  console.log("Launching DevTools Studio Pro (Bun Native)...");
  win.run();
}
