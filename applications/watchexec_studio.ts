import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";

export function createWatchexecStudio(): SimpleWindow {
  const win = newSimpleWindow("Watchexec Studio -- Continuous Build & Test Watcher", 1140, 880, {
    appId: "watchexec_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Title Row
  win.beginRow();
  win.addHeading("Watchexec Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();

  // Watcher Configuration
  win.beginGroupBox("Watch Targets & Execution Trigger");
  win.beginRow();
  win.addLabel("lbl_path", "Watch Directory:");
  win.addInput("txt_watch_path", "./src");
  win.addLabel("lbl_cmd", "Execute Command:");
  win.addInput("txt_exec_cmd", "bun test");
  win.addButton("btn_trigger_now", "⚡ Run Command Now");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exts", "File Extensions (-e):");
  win.addInput("txt_exts", "ts,js,json,html").width(220);
  win.addLabel("lbl_ignore", "Ignore Patterns (-i):");
  win.addInput("txt_ignore", "node_modules,.git,dist").width(240);
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_clear", "Clear Screen on Run (-c)", true);
  win.addCheckbox("chk_restart", "Restart Process on Change (-r)", true);
  win.endRow();

  win.beginRow();
  win.addButton("btn_start_watch", "▶️ Start Continuous Watcher");
  win.addButton("btn_stop_watch", "⏹️ Stop Watcher");
  win.addButton("btn_clear_console", "Clear Console");
  win.endRow();
  win.endGroupBox();

  // Console Telemetry
  win.beginGroupBox("Live Continuous Build & Execution Output");
  win.addConsole("watch_console", 280);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Idle  |  Runs Triggered: 0  |  Target: ./src");
  win.endRow();

  let runCount = 0;

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Watchexec configuration saved successfully!");
  });

  const triggerRun = () => {
    runCount++;
    const cmd = win.getValue("txt_exec_cmd") || "bun test";
    win.appendConsole("watch_console", `\n[Watchexec #${runCount}] Executing: ${cmd}...\n`, 1);
    win.setStatus(`Running command #${runCount}...`);

    const t0 = Date.now();
    const [out, code] = Sys.exec(cmd);
    const elapsed = Date.now() - t0;

    win.appendConsole("watch_console", out + "\n", code === 0 ? 2 : 3);
    win.appendConsole("watch_console", `[Watchexec #${runCount}] Exited with code ${code} in ${elapsed}ms\n`, code === 0 ? 2 : 3);
    win.setText("lbl_status", `Status: Idle  |  Runs Triggered: ${runCount}  |  Last Exit: ${code} (${elapsed}ms)`);
    win.setStatus(`Run #${runCount} complete (${elapsed}ms)`);
  };

  win.onClick("btn_trigger_now", triggerRun);

  win.onClick("btn_start_watch", () => {
    const dir = win.getValue("txt_watch_path") || "./src";
    win.appendConsole("watch_console", `[Watchexec] Watching directory '${dir}' for changes...\n`, 2);
    win.setText("lbl_status", `Status: Watching '${dir}'  |  Runs Triggered: ${runCount}`);
    win.setStatus("Active File Watcher");
    win.toast("Continuous file watcher active");
    triggerRun();
  });

  win.onClick("btn_stop_watch", () => {
    win.appendConsole("watch_console", `[Watchexec] Watcher halted.\n`, 4);
    win.setText("lbl_status", `Status: Halted  |  Runs Triggered: ${runCount}`);
    win.setStatus("Watcher stopped");
  });

  win.onClick("btn_clear_console", () => {
    win.setText("watch_console", "");
  });

  return win;
}

if (import.meta.main) {
  const win = createWatchexecStudio();
  console.log("Launching Watchexec Studio...");
  win.run();
}
