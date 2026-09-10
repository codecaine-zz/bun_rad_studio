import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { watch, type FSWatcher, existsSync } from "fs";
import { resolve } from "path";
import { spawn, type ChildProcess } from "child_process";

export function createWatchexecStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Task Watcher Studio (Bun Watch Studio) -- Continuous Task & Test Watcher (Native)", 1140, 880, {
    appId: "watchexec_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  // Title Row
  win.beginRow();
  win.addHeading("Task Watcher Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Zero Homebrew Reliance -- Powered by Native Bun & fs.watch System APIs");

  // Watcher Configuration
  win.beginGroupBox("Watch Targets & Trigger Configuration");
  win.beginRow();
  win.addLabel("lbl_path", "Watch Directory:");
  win.addInput("txt_watch_path", "./src");
  win.addLabel("lbl_cmd", "Execute Command:");
  win.addInput("txt_exec_cmd", "bun test");
  win.addButton("btn_trigger_now", "⚡ Run Command Now");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exts", "File Extensions:");
  win.addInput("txt_exts", "ts,js,json,html,css").width(220);
  win.addLabel("lbl_ignore", "Ignore Patterns:");
  win.addInput("txt_ignore", "node_modules,.git,dist,.temp,.system_generated,coverage,.cache").width(240);
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_clear", "Clear Screen on Run", true);
  win.addCheckbox("chk_timestamp", "Show High-Resolution Timestamps", true);
  win.endRow();

  win.beginRow();
  win.addButton("btn_start_watch", "▶️ Start Native Watcher");
  win.addButton("btn_stop_watch", "⏹️ Stop Watcher");
  win.addButton("btn_kill_run", "🛑 Stop Task");
  win.addButton("btn_clear_console", "Clear Console");
  win.endRow();
  win.endGroupBox();

  // Console Telemetry
  win.beginGroupBox("Continuous Execution & Build Console");
  win.addConsole("watch_console", 280);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Engine: Bun Native fs.watch (Zero Homebrew)  |  Status: Idle  |  Runs: 0");
  win.endRow();

  let runCount = 0;
  let activeWatcher: FSWatcher | null = null;
  let activeProcess: ChildProcess | null = null;
  let debounceTimer: any = null;

  const killActiveProcess = () => {
    if (activeProcess && !activeProcess.killed) {
      const pid = activeProcess.pid;
      try {
        if (process.platform !== "win32" && pid) {
          process.kill(-pid, "SIGTERM");
        } else {
          activeProcess.kill("SIGTERM");
        }
      } catch {
        try { activeProcess.kill("SIGTERM"); } catch {}
      }
      activeProcess = null;
    }
  };

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Watch configuration saved successfully!");
  });

  const triggerRun = (reason = "Manual Trigger") => {
    runCount++;
    const cmd = (win.getValue("txt_exec_cmd") || "bun test").trim();
    const clearOnRun = win.getValue("chk_clear");
    if (clearOnRun) {
      win.setText("watch_console", "");
    }

    if (activeProcess && !activeProcess.killed) {
      win.appendConsole("watch_console", `[Terminated prior running process for new execution]\n`, 3);
      killActiveProcess();
    }

    const timeStr = new Date().toLocaleTimeString();
    win.appendConsole("watch_console", `\n[${timeStr}] [Run #${runCount} - ${reason}] Executing: ${cmd}...\n`, 1);
    win.setStatus(`Running: ${cmd.slice(0, 30)}...`);

    const t0 = performance.now();
    try {
      const proc = spawn(cmd, {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: "1" },
        detached: process.platform !== "win32",
      });
      activeProcess = proc;

      proc.stdout?.on("data", (chunk: Buffer) => {
        win.appendConsole("watch_console", chunk.toString(), 2);
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        win.appendConsole("watch_console", chunk.toString(), 3);
      });

      proc.on("error", (err: Error) => {
        win.appendConsole("watch_console", `[Execution Error]: ${err.message}\n`, 3);
      });

      proc.on("close", (code: number | null) => {
        const exitCode = code ?? 0;
        const elapsed = (performance.now() - t0).toFixed(1);
        win.appendConsole(
          "watch_console",
          `[Exit: ${exitCode}] Command finished in ${elapsed}ms\n`,
          exitCode === 0 ? 2 : 3
        );
        win.setText(
          "lbl_status",
          `Engine: Bun Native fs.watch  |  Status: ${activeWatcher ? "Active" : "Idle"}  |  Runs: ${runCount}  |  Last Exit: ${exitCode} (${elapsed}ms)`
        );
        win.setStatus(`Run #${runCount} complete (${elapsed}ms)`);
        if (activeProcess === proc) {
          activeProcess = null;
        }
      });
    } catch (err: any) {
      win.appendConsole("watch_console", `[Spawn Error]: ${err?.message || err}\n`, 3);
      win.setStatus(`Run #${runCount} failed`);
      activeProcess = null;
    }
  };

  win.onClick("btn_trigger_now", () => triggerRun("Manual Trigger"));

  win.onClick("btn_kill_run", () => {
    if (activeProcess && !activeProcess.killed) {
      killActiveProcess();
      win.appendConsole("watch_console", "[Task Watcher] Process cancelled by user.\n", 3);
      win.setStatus("Process cancelled");
      win.toast("Active task terminated");
    } else {
      win.toast("No active task running");
    }
  });

  win.onClick("btn_start_watch", () => {
    if (activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
    }

    const rawPath = win.getValue("txt_watch_path") || "./src";
    const targetDir = resolve(process.cwd(), rawPath);

    if (!existsSync(targetDir)) {
      win.appendConsole("watch_console", `[Error] Target watch directory does not exist: ${targetDir}\n`, 3);
      win.toast("Directory does not exist: " + rawPath);
      return;
    }

    const extsStr = win.getValue("txt_exts") || "ts,js,json";
    const exts = new Set(
      extsStr
        .split(",")
        .map((e: string) => e.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean)
    );

    const ignoreStr = win.getValue("txt_ignore") || "node_modules,.git,dist,.temp,.system_generated,coverage,.cache";
    const ignoreList = ignoreStr
      .split(",")
      .map((i: string) => i.trim())
      .filter(Boolean);

    try {
      activeWatcher = watch(targetDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        const normalized = filename.replace(/\\/g, "/");
        // Check ignores
        for (const ig of ignoreList) {
          if (normalized.includes(ig)) return;
        }

        // Check extensions
        if (exts.size > 0) {
          const ext = normalized.split(".").pop()?.toLowerCase() || "";
          if (!exts.has(ext)) return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          win.appendConsole("watch_console", `[fs.watch] Detected change in: ${filename}\n`, 4);
          triggerRun(`File Changed: ${filename}`);
        }, 300);
      });

      win.appendConsole(
        "watch_console",
        `[Bun Native Watcher] Watching '${targetDir}' recursively with fs.watch...\n`,
        2
      );
      win.appendConsole(
        "watch_console",
        `[Filters] Extensions: [${Array.from(exts).join(", ")}] | Ignores: [${ignoreList.join(", ")}]\n`,
        1
      );
      win.setText(
        "lbl_status",
        `Engine: Bun Native fs.watch  |  Status: Watching '${rawPath}'  |  Runs: ${runCount}`
      );
      win.setStatus("Active Native File Watcher");
      win.toast("Bun native file watcher active");

      // Initial run on startup
      triggerRun("Initial Watcher Run");
    } catch (e: any) {
      win.appendConsole("watch_console", `[Watcher Error]: ${e.message}\n`, 3);
      win.setStatus("Watcher Failed to Start");
    }
  });

  win.onClick("btn_stop_watch", () => {
    killActiveProcess();
    if (activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
      clearTimeout(debounceTimer);
      win.appendConsole("watch_console", `[Bun Native Watcher] Watcher halted.\n`, 4);
      win.setText("lbl_status", `Engine: Bun Native fs.watch  |  Status: Halted  |  Runs: ${runCount}`);
      win.setStatus("Watcher stopped");
      win.toast("Watcher stopped");
    } else {
      win.toast("Watcher is not currently running");
    }
  });

  win.onClick("btn_clear_console", () => {
    win.setText("watch_console", "");
  });

  win.onClose(() => {
    killActiveProcess();
    if (activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
    }
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

export const createWatcherStudio = createWatchexecStudio;
export const createBunWatchStudio = createWatchexecStudio;

if (import.meta.main) {
  const win = createWatcherStudio({ fullscreen: true });
  console.log("Launching Task Watcher Studio...");
  win.run();
}
