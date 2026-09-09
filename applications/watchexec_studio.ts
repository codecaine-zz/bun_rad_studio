import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { watch, type FSWatcher, existsSync } from "fs";
import { resolve } from "path";

export function createWatchexecStudio(): SimpleWindow {
  const win = newSimpleWindow("Task Watcher Studio (Bun Watch Studio) -- Continuous Task & Test Watcher (Native)", 1140, 880, {
    appId: "watchexec_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Title Row
  win.beginRow();
  win.addHeading("Task Watcher Studio");
  win.addThemeSelector("dd_theme", "Theme:");
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
  win.addInput("txt_ignore", "node_modules,.git,dist,.temp").width(240);
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_clear", "Clear Screen on Run", true);
  win.addCheckbox("chk_timestamp", "Show High-Resolution Timestamps", true);
  win.endRow();

  win.beginRow();
  win.addButton("btn_start_watch", "▶️ Start Native Watcher");
  win.addButton("btn_stop_watch", "⏹️ Stop Watcher");
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
  let debounceTimer: any = null;

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Watch configuration saved successfully!");
  });

  const triggerRun = (reason = "Manual Trigger") => {
    runCount++;
    const cmd = win.getValue("txt_exec_cmd") || "bun test";
    const clearOnRun = win.getValue("chk_clear");
    if (clearOnRun) {
      win.setText("watch_console", "");
    }

    const timeStr = new Date().toLocaleTimeString();
    win.appendConsole("watch_console", `\n[${timeStr}] [Run #${runCount} - ${reason}] Executing: ${cmd}...\n`, 1);
    win.setStatus(`Running command #${runCount}...`);

    const t0 = performance.now();
    const [out, code] = Sys.exec(cmd);
    const elapsed = (performance.now() - t0).toFixed(1);

    win.appendConsole("watch_console", out + (out.endsWith("\n") ? "" : "\n"), code === 0 ? 2 : 3);
    win.appendConsole(
      "watch_console",
      `[Exit: ${code}] Command finished in ${elapsed}ms\n`,
      code === 0 ? 2 : 3
    );
    win.setText(
      "lbl_status",
      `Engine: Bun Native fs.watch  |  Status: ${activeWatcher ? "Active" : "Idle"}  |  Runs: ${runCount}  |  Last Exit: ${code} (${elapsed}ms)`
    );
    win.setStatus(`Run #${runCount} complete (${elapsed}ms)`);
  };

  win.onClick("btn_trigger_now", () => triggerRun("Manual Trigger"));

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

    const ignoreStr = win.getValue("txt_ignore") || "node_modules,.git,dist";
    const ignoreList = ignoreStr
      .split(",")
      .map((i: string) => i.trim())
      .filter(Boolean);

    try {
      activeWatcher = watch(targetDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        // Check ignores
        for (const ig of ignoreList) {
          if (filename.includes(ig)) return;
        }

        // Check extensions
        if (exts.size > 0) {
          const ext = filename.split(".").pop()?.toLowerCase() || "";
          if (!exts.has(ext)) return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          win.appendConsole("watch_console", `[fs.watch] Detected change in: ${filename}\n`, 4);
          triggerRun(`File Changed: ${filename}`);
        }, 150);
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

  return win;
}

export const createWatcherStudio = createWatchexecStudio;
export const createBunWatchStudio = createWatchexecStudio;

if (import.meta.main) {
  const win = createWatcherStudio();
  console.log("Launching Task Watcher Studio...");
  win.run();
}
