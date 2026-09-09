import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { existsSync } from "fs";

function getBrewBin(): string {
  const candidates = [
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "/usr/bin/brew",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const [out, code] = Sys.exec("which brew");
  if (code === 0 && out.trim()) return out.trim();
  return "brew";
}

export function createBrewStudio(): SimpleWindow {
  const brewBin = getBrewBin();
  const win = newSimpleWindow("Homebrew Studio Pro -- macOS Package & Service Workstation", 1120, 880, {
    appId: "brew_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Top Title Bar
  win.beginRow();
  win.addHeading("Homebrew Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption(`macOS Package & Daemon Manager  |  Binary: ${brewBin}`);

  // Search & Query Bar
  win.beginGroupBox("Package Search & Information Inspection");
  win.beginRow();
  win.addLabel("lbl_pkg", "Formula / Cask:");
  win.addInput("txt_pkg_name", "ffmpeg");
  win.addButton("btn_search", "🔍 Search");
  win.addButton("btn_info", "ℹ️ Package Info");
  win.endRow();

  win.beginRow();
  win.addButton("btn_install", "⬇️ Install");
  win.addButton("btn_uninstall", "🗑️ Uninstall");
  win.endRow();
  win.endGroupBox();

  // Ecosystem Actions
  win.beginGroupBox("Ecosystem Inspection & Maintenance Actions");
  win.beginRow();
  win.addButton("btn_list_all", "📦 All Installed");
  win.addButton("btn_formulae", "⚙️ Formulae Only");
  win.addButton("btn_casks", "🖥️ Casks (Apps)");
  win.addButton("btn_outdated", "⚠️ Outdated");
  win.endRow();

  win.beginRow();
  win.addButton("btn_services", "⚡ Background Services");
  win.addButton("btn_update", "🔄 brew update");
  win.addButton("btn_upgrade", "🚀 brew upgrade");
  win.addButton("btn_cleanup", "🧹 brew cleanup");
  win.addButton("btn_doctor", "🩺 brew doctor");
  win.endRow();
  win.endGroupBox();

  // Output View
  win.beginGroupBox("Homebrew Output & Package Details");
  win.addTextarea("txt_brew_out", `[Homebrew Studio Pro Initialized]\nDetected Homebrew Binary: ${brewBin}\nReady to inspect packages, services, and formula trees.\n`);
  win.endGroupBox();

  // Activity Log
  win.beginGroupBox("Execution Telemetry Console");
  win.addConsole("brew_console", 120);
  win.endGroupBox();

  // Status Row
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Engine: Homebrew ARM64/x86_64  |  Mode: Async");
  win.endRow();

  // Helpers
  const runBrew = (args: string) => {
    const cmd = `${brewBin} ${args}`;
    win.appendConsole("brew_console", `[Homebrew] Executing: ${cmd}...\n`, 1);
    win.setStatus(`Running: ${cmd}...`);

    const t0 = Date.now();
    const [out, code] = Sys.exec(cmd);
    const elapsed = Date.now() - t0;

    win.setText("txt_brew_out", out || `(Command exited with code ${code})`);
    win.appendConsole("brew_console", `[Homebrew] Finished in ${elapsed}ms (exit ${code})\n`, code === 0 ? 2 : 3);
    win.setStatus(`Completed in ${elapsed}ms`);
  };

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Homebrew Studio state saved successfully!");
  });
  win.onClick("btn_search", () => {
    const pkg = win.getValue("txt_pkg_name") || "ffmpeg";
    runBrew(`search ${pkg}`);
  });
  win.onClick("btn_info", () => {
    const pkg = win.getValue("txt_pkg_name") || "ffmpeg";
    runBrew(`info ${pkg}`);
  });
  win.onClick("btn_install", () => {
    const pkg = win.getValue("txt_pkg_name") || "";
    if (!pkg) return;
    runBrew(`install ${pkg}`);
  });
  win.onClick("btn_uninstall", () => {
    const pkg = win.getValue("txt_pkg_name") || "";
    if (!pkg) return;
    runBrew(`uninstall ${pkg}`);
  });
  win.onClick("btn_list_all", () => runBrew("list"));
  win.onClick("btn_formulae", () => runBrew("list --formula"));
  win.onClick("btn_casks", () => runBrew("list --cask"));
  win.onClick("btn_outdated", () => runBrew("outdated"));
  win.onClick("btn_services", () => runBrew("services list"));
  win.onClick("btn_update", () => runBrew("update"));
  win.onClick("btn_upgrade", () => runBrew("upgrade"));
  win.onClick("btn_cleanup", () => runBrew("cleanup -s"));
  win.onClick("btn_doctor", () => runBrew("doctor"));

  return win;
}

if (import.meta.main) {
  const win = createBrewStudio();
  console.log("Launching Homebrew Studio Pro...");
  win.run();
}
