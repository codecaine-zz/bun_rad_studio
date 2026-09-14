import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  shouldTrigger,
  buildWatchexecEnv,
  killRunningProcess,
} from "../src/features/watchexec/watchexecDoers.ts";
import type { WatchexecOptions } from "../src/features/watchexec/watchexecTypes.ts";
import type { Subprocess } from "bun";
import { watch } from "node:fs";
import * as path from "node:path";

export function createWatchexecStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Task Watcher Studio (Watchexec Studio Pro) -- Bun Watch Studio",
    1240,
    1100,
    {
      appId: "watchexec_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let activeWatcher: { close: () => void } | null = null;
  let activeProcess: Subprocess | null = null;
  let triggerCount = 0;
  const historyRows: string[][] = [];

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Task Watcher Studio (Watchexec Pro)");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Bun Watch Studio -- Continuous Task & Test Watcher (fs.watch System API)");

  // -----------------------------------------------------------------------------------------------
  // 2. Watcher Telemetry
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Watcher & Execution Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_status", "Watcher State: IDLE");
  win.addLabel("lbl_metric_triggers", "Trigger Count: 0");
  win.addLabel("lbl_metric_last_file", "Last Event: None");
  win.addLabel("lbl_metric_pid", "Active PID: None");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Configuration
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Watch Targets & Trigger Options");
  win.beginRow();
  win.addLabel("lbl_path", "Watch Directory:");
  win.addInput("txt_watch_path", "./src", "Path to watch...", { width: 300 });
  win.addLabel("lbl_cmd", "Execute Command:");
  win.addInput("txt_exec_cmd", "echo 'Watcher triggered'", "Command to run on file change...", { width: 340 });
  win.addButton("btn_trigger_now", "⚡ Run Now", { width: 110 });
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exts", "Extensions:");
  win.addInput("txt_exts", "ts,js,json,html,css", "e.g. ts,js", { width: 180 });
  win.addLabel("lbl_ignore", "Ignore Patterns:");
  win.addInput("txt_ignore", "node_modules,.git,dist,.graveyard,.cache", "Ignore patterns...", { width: 260 });
  win.addLabel("lbl_debounce", "Debounce (ms):");
  win.addInput("txt_debounce", "150", "e.g. 100, 200", { width: 80 });
  win.addCheckbox("chk_clear", "Clear Console on Run", true);
  win.addCheckbox("chk_postpone", "Postpone Initial Run", true);
  win.endRow();

  win.beginRow();
  win.addButton("btn_start_watch", "▶️ Start Native Watcher", { width: 180 });
  win.addButton("btn_stop_watch", "⏹️ Stop Watcher", { width: 140 });
  win.addButton("btn_kill_run", "🛑 Kill Process", { width: 130 });
  win.addButton("btn_clear_console", "✕ Clear Console", { width: 130 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Execution Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Continuous Execution & Build Console");
  win.addConsole("watch_console", 280);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Trigger History Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("File Modification History");
  const tableHeaders = ["Timestamp", "Trigger #", "Modified File", "Status"];
  win.addTable("tbl_history", tableHeaders, [], { height: 160 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Configure targets and click Start Native Watcher.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Watcher Engine Logic
  // -----------------------------------------------------------------------------------------------
  const executeCommand = async (triggeredFile?: string) => {
    const cmdStr = win.getValue("txt_exec_cmd")?.trim();
    if (!cmdStr) {
      win.setValue("lbl_status_bar", "⚠️ No execution command specified.");
      return;
    }

    if (win.getBool("chk_clear")) {
      win.clearConsole("watch_console");
    }

    // Terminate existing process if active
    if (activeProcess) {
      killRunningProcess(activeProcess);
      activeProcess = null;
    }

    triggerCount++;
    const timeStr = new Date().toLocaleTimeString();
    win.setValue("lbl_metric_triggers", `Trigger Count: ${triggerCount}`);
    win.setValue("lbl_metric_last_file", triggeredFile ? `Last Event: ${path.basename(triggeredFile)}` : "Last Event: Manual Run");

    win.appendConsole("watch_console", `\n[${timeStr}] ⚡ [watchexec] Running: ${cmdStr}\n`);
    if (triggeredFile) {
      win.appendConsole("watch_console", `[watchexec] Triggered by: ${triggeredFile}\n`);
    }

    const historyRow = [
      timeStr,
      String(triggerCount),
      triggeredFile ? path.basename(triggeredFile) : "Manual",
      "RUNNING",
    ];
    historyRows.unshift(historyRow);
    win.setTableData("tbl_history", historyRows.slice(0, 50));

    try {
      const watchPath = win.getValue("txt_watch_path")?.trim() || ".";
      const env = buildWatchexecEnv(triggeredFile, watchPath);

      const proc = Bun.spawn(["/bin/sh", "-c", cmdStr], {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        stdout: "pipe",
        stderr: "pipe",
      });
      activeProcess = proc;
      win.setValue("lbl_metric_pid", `Active PID: ${proc.pid}`);

      const [stdoutStr, stderrStr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (!win.isRunning()) {
        return;
      }
      if (stdoutStr) win.appendConsole("watch_console", stdoutStr);
      if (stderrStr) win.appendConsole("watch_console", stderrStr);

      win.appendConsole("watch_console", `\n[watchexec] Process exited with status ${exitCode}\n`);
      if (activeProcess === proc) {
        activeProcess = null;
        win.setValue("lbl_metric_pid", "Active PID: None");
        win.setValue("lbl_status_bar", `✓ Process exited with code ${exitCode}.`);
        historyRow[3] = exitCode === 0 ? "SUCCESS" : `FAILED (${exitCode})`;
      } else {
        historyRow[3] = "CANCELLED";
      }
      win.setTableData("tbl_history", historyRows.slice(0, 50));
    } catch (err: any) {
      win.appendConsole("watch_console", `\n[watchexec ERROR] ${err.message}\n`);
      win.setValue("lbl_status_bar", `❌ Execution failed: ${err.message}`);
    }
  };

  const startWatcher = () => {
    if (activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
    }

    const watchPath = win.getValue("txt_watch_path")?.trim() || "./src";
    const extsStr = win.getValue("txt_exts")?.trim();
    const extensions = extsStr ? extsStr.split(",").map((s: string) => s.trim().replace(/^\./, "")) : undefined;
    const ignoreStr = win.getValue("txt_ignore")?.trim();
    const ignorePatterns = ignoreStr ? ignoreStr.split(",").map((s: string) => s.trim()) : [];
    const debounceMs = parseInt(win.getValue("txt_debounce") || "150", 10) || 150;

    let debounceTimer: Timer | null = null;

    try {
      const fsWatcher = watch(watchPath, { recursive: true }, (_eventType, filename) => {
        if (!filename || !shouldTrigger(filename, extensions, ignorePatterns)) {
          return;
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void executeCommand(filename);
        }, debounceMs);
      });

      activeWatcher = {
        close: () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          fsWatcher.close();
          if (activeProcess) {
            killRunningProcess(activeProcess);
            activeProcess = null;
          }
        },
      };

      win.setValue("lbl_metric_status", "Watcher State: ACTIVE");
      win.setValue("lbl_status_bar", `✓ Native watcher listening on "${watchPath}"...`);

      if (!win.getBool("chk_postpone")) {
        void executeCommand();
      }
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Could not start watcher: ${err.message}`);
    }
  };

  const stopAll = () => {
    if (activeWatcher) {
      try {
        activeWatcher.close();
      } catch {}
      activeWatcher = null;
    }
    if (activeProcess) {
      try {
        killRunningProcess(activeProcess);
      } catch {}
      activeProcess = null;
    }
  };

  const stopWatcher = () => {
    stopAll();
    win.setValue("lbl_metric_status", "Watcher State: STOPPED");
    win.setValue("lbl_metric_pid", "Active PID: None");
    win.setValue("lbl_status_bar", "Watcher stopped.");
  };

  win.on("btn_start_watch", "click", () => startWatcher());
  win.on("btn_stop_watch", "click", () => stopWatcher());
  win.on("btn_trigger_now", "click", () => executeCommand());

  win.on("btn_kill_run", "click", () => {
    if (activeProcess) {
      killRunningProcess(activeProcess);
      activeProcess = null;
      win.setValue("lbl_metric_pid", "Active PID: None");
      win.appendConsole("watch_console", `\n[watchexec] Process terminated by user.\n`);
      win.setValue("lbl_status_bar", "Process killed.");
    } else {
      win.setValue("lbl_status_bar", "No process currently running.");
    }
  });

  win.on("btn_clear_console", "click", () => {
    win.clearConsole("watch_console");
  });
  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Watcher configuration saved.");
  });

  // Ensure watcher and any running subprocess tree are cleanly stopped on window close or process termination
  win.onClose(() => {
    stopAll();
  });

  const onProcessSignal = () => {
    stopAll();
    process.exit(0);
  };

  process.on("exit", () => {
    stopAll();
  });
  process.on("SIGINT", onProcessSignal);
  process.on("SIGTERM", onProcessSignal);
  process.on("beforeExit", () => {
    stopAll();
  });

  return win;
}

export { createWatchexecStudio as createWatcherStudio, createWatchexecStudio as createBunWatchStudio };

if (import.meta.main) {
  const win = createWatchexecStudio({ fullscreen: true });
  console.log("⚡ Launching Watchexec Studio Pro...");
  win.run();
}
