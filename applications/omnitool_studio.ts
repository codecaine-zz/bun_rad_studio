import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { existsSync } from "fs";
import { join } from "path";

interface ToolInfo {
  name: string;
  binPath: string;
  versionStr: string;
  isReady: boolean;
  description: string;
}

function discoverTool(name: string, fallbackPaths: string[], desc: string): ToolInfo {
  const common = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    `/bin/${name}`,
    ...fallbackPaths,
  ];

  let path = "";
  for (const p of common) {
    if (existsSync(p)) {
      path = p;
      break;
    }
  }

  if (!path) {
    const [whichOut, code] = Sys.exec(`which ${name}`);
    if (code === 0 && whichOut.trim()) {
      path = whichOut.trim();
    }
  }

  if (!path) {
    return {
      name,
      binPath: "",
      versionStr: "Not Installed (Optional)",
      isReady: false,
      description: desc,
    };
  }

  const [verOut, code] = Sys.exec(`${path} --version`);
  const firstLine = verOut.trim().split("\n")[0] || `${name} (Ready)`;

  return {
    name,
    binPath: path,
    versionStr: firstLine.length > 40 ? firstLine.slice(0, 40) : firstLine,
    isReady: true,
    description: desc,
  };
}

export function createOmnitoolStudio(options: { headless?: boolean; screenshotPath?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("OmniTool Studio Pro -- Modern Developer CLI Suite", 1120, 880, {
    appId: "omnitool_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
    alwaysOnTop: false,
  });

  const tools: Record<string, ToolInfo> = {
    rg: discoverTool("rg", [], "ripgrep - ultra-fast recursive regex search"),
    fd: discoverTool("fd", [], "fd - modern user-friendly fast file finder"),
    sd: discoverTool("sd", [], "sd - fast regex find & replace (modern sed)"),
    watchexec: discoverTool("watchexec", [], "watchexec - continuous file watcher daemon"),
    rip: discoverTool("rip", [], "rip - safe graveyard trash with undo"),
    jq: discoverTool("jq", [], "jq - command-line JSON processor"),
  };

  // Header Banner
  win.beginRow();
  win.addHeading("OmniTool Studio Pro");
  win.addDropdown("dd_mode", [
    "1. Ripgrep (rg) - Fast Code Search",
    "2. Fd (fd) - File & Directory Finder",
    "3. Sd (sd) - Fast Regex Find & Replace",
    "4. Watchexec - Continuous Test & Run",
    "5. Rip - Safe Graveyard & Restore",
    "6. JQ - JSON Query Processor",
  ], "1. Ripgrep (rg) - Fast Code Search").width(260);
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("v2.5 Modern Rust/Unix Developer CLI Suite");

  // Tool Discovery Status Cards
  win.beginCard("Active Toolchain Engine Status");
  win.beginRow();
  for (const [key, t] of Object.entries(tools)) {
    const statusIcon = t.isReady ? "🟢" : "⚪";
    win.addLabel(`tool_${key}`, `${statusIcon} ${key.toUpperCase()}: ${t.isReady ? "Ready" : "Missing"}`);
  }
  win.endRow();
  win.endCard();

  // Search & Target Directory Controls
  win.beginGroupBox("Query & Target Path Configuration");
  win.beginRow();
  win.addLabel("lbl_path", "Search Path:");
  win.addInput("txt_search_path", process.cwd());
  win.addLabel("lbl_query", "Pattern / Expression:");
  win.addInput("txt_pattern", "SimpleWindow|addHeading");
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_case", "Case Sensitive", false);
  win.addCheckbox("chk_hidden", "Include Hidden", false);
  win.addCheckbox("chk_fixed", "Fixed Strings", false);
  win.addCheckbox("chk_context", "Show Context", true);
  win.endRow();

  win.beginRow();
  win.addButton("btn_run_omni", "⚡ Execute Tool Command");
  win.addButton("btn_clear_out", "Clear Results");
  win.endRow();
  win.endGroupBox();

  // Results View
  win.beginGroupBox("Execution Output Stream");
  win.addTextarea("txt_results", `[OmniTool Studio Pro Initialized]\nLoaded 6 unified developer engines.\nSearch target: ${process.cwd()}\nReady to query files, replace patterns, or watch directories.\n`);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Activity & Diagnostics Console");
  win.addConsole("omni_console", 120);
  win.endGroupBox();

  // Bottom Status Bar
  win.beginRow();
  win.addLabel("lbl_status_bar", `Ready  |  Engines: 6 Probed  |  Platform: macOS Cocoa Webview`);
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

  win.onClick("btn_run_omni", () => {
    const mode = win.getValue("dd_mode") || "";
    const pattern = win.getValue("txt_pattern") || "";
    const target = win.getValue("txt_search_path") || ".";

    win.appendConsole("omni_console", `[OmniTool] Starting query for "${pattern}" in "${target}"...\n`, 1);
    win.setStatus("Running command...");

    let cmd = "";
    if (mode.includes("Ripgrep")) {
      cmd = `rg -n --color=never "${pattern}" "${target}" | head -n 100`;
    } else if (mode.includes("Fd")) {
      cmd = `fd "${pattern}" "${target}" | head -n 100`;
    } else {
      cmd = `echo "Executing ${mode} for ${pattern}..."`;
    }

    const t0 = Date.now();
    const [out, code] = Sys.exec(cmd);
    const elapsed = Date.now() - t0;

    win.setText("txt_results", out || "(No matches found or command produced no stdout)");
    win.appendConsole("omni_console", `[OmniTool] Completed with exit code ${code} in ${elapsed}ms\n`, code === 0 ? 2 : 3);
    win.setStatus(`Query finished in ${elapsed}ms`);
  });

  return win;
}

if (import.meta.main) {
  const win = createOmnitoolStudio();
  console.log("Launching OmniTool Studio Pro...");
  win.run();
}
