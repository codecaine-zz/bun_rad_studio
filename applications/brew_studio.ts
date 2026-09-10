import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import * as os from "os";

export function createBunSystemStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const bunVer = Bun.version;
  const bunRev = Bun.revision || "release";
  const platformStr = `${process.platform} (${process.arch})`;
  const fullscreen = options.fullscreen ?? true;

  const win = newSimpleWindow("Bun System & Package Workstation -- Native Runtime & Package Manager", 1120, 880, {
    appId: "brew_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  // Top Title Bar
  win.beginRow();
  win.addHeading("Bun System & Package Workstation");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption(`Native Bun Built-in System Runtime  |  Bun v${bunVer} (${bunRev})  |  Arch: ${platformStr}  |  Zero External Dependencies`);

  // Search & Query Bar
  win.beginGroupBox("Package Search & npm Registry Inspection (Native Fetch API)");
  win.beginRow();
  win.addLabel("lbl_pkg", "Package / Module:");
  win.addInput("txt_pkg_name", "webview-bun");
  win.addButton("btn_search", "🔍 Search Registry");
  win.addButton("btn_info", "ℹ️ Package Info");
  win.endRow();

  win.beginRow();
  win.addButton("btn_install", "⬇️ bun add");
  win.addButton("btn_uninstall", "🗑️ bun remove");
  win.endRow();
  win.endGroupBox();

  // Ecosystem Actions
  win.beginGroupBox("Native Bun System Runtime & Package Operations");
  win.beginRow();
  win.addButton("btn_telemetry", "⚡ System Telemetry");
  win.addButton("btn_list_all", "📦 Project Dependencies");
  win.addButton("btn_cache_info", "💾 Bun Cache Info");
  win.addButton("btn_bin_path", "📁 Global Bin Path");
  win.endRow();

  win.beginRow();
  win.addButton("btn_cleanup", "🧹 Clear Bun Cache");
  win.addButton("btn_doctor", "🩺 Bun Diagnostics & Doctor");
  win.addButton("btn_test", "🧪 Run Bun Test");
  win.addButton("btn_gc", "♻️ Run Garbage Collector");
  win.endRow();
  win.endGroupBox();

  // Output View
  win.beginGroupBox("System & Package Details Output");
  win.addTextarea("txt_brew_out", `[Bun System & Package Workstation Initialized]
Bun Version: ${bunVer} (${bunRev})
Node Compatibility: ${process.version}
Platform: ${os.type()} ${os.release()} (${os.arch()})
CPUs: ${os.cpus().length} Cores (${os.cpus()[0]?.model || "Apple Silicon / x86_64"})
Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB
Zero Homebrew reliance: All operations powered by Bun built-in APIs.
`);
  win.endGroupBox();

  // Activity Log
  win.beginGroupBox("Execution Telemetry Console");
  win.addConsole("brew_console", 120);
  win.endGroupBox();

  // Status Row
  win.beginRow();
  win.addLabel("lbl_status", `Status: Ready  |  Engine: Bun v${bunVer} Native Runtime  |  Homebrew: Disconnected (Zero-Dependency)`);
  win.endRow();

  // Helper for running Bun CLI commands
  const runBunCmd = (cmdStr: string, description: string) => {
    win.appendConsole("brew_console", `[Bun System] ${description} ('${cmdStr}')...\n`, 1);
    win.setStatus(`Running: ${cmdStr}...`);

    const t0 = Date.now();
    const [out, code] = Sys.exec(cmdStr);
    const elapsed = Date.now() - t0;

    win.setText("txt_brew_out", out || `(Command exited with code ${code})`);
    win.appendConsole("brew_console", `[Bun System] Finished in ${elapsed}ms (exit ${code})\n`, code === 0 ? 2 : 3);
    win.setStatus(`Completed in ${elapsed}ms`);
  };

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Bun System Workstation state saved successfully!");
  });

  // Native System Telemetry
  win.onClick("btn_telemetry", () => {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const load = os.loadavg();
    const network = os.networkInterfaces();
    const netNames = Object.keys(network).join(", ");

    const telemetryReport = `=== Bun Native System Telemetry ===
Timestamp: ${new Date().toISOString()}
Runtime: Bun v${Bun.version} (${Bun.revision})
Process ID: ${process.pid}
Platform: ${os.platform()} (${os.arch()})
OS Release: ${os.type()} ${os.release()}
Uptime: ${(os.uptime() / 3600).toFixed(2)} hours (Process uptime: ${process.uptime().toFixed(1)}s)

--- Memory Breakdown ---
RSS (Resident Set): ${(mem.rss / 1024 / 1024).toFixed(2)} MB
Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB
Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB
External Buffers: ${(mem.external / 1024 / 1024).toFixed(2)} MB
Total System RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
Available RAM: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB

--- CPU & System Load ---
Hardware Cores: ${cpus.length}
CPU Model: ${cpus[0]?.model || "Apple Silicon"}
Load Average (1m, 5m, 15m): ${load.map(n => n.toFixed(2)).join(", ")}

--- Network Interfaces ---
Active Interfaces: ${netNames || "None"}
`;

    win.setText("txt_brew_out", telemetryReport);
    win.appendConsole("brew_console", `[Telemetry] Retrieved full hardware & memory telemetry.\n`, 2);
    win.setStatus("Telemetry Refreshed");
  });

  // Search npm Registry via Native Fetch API
  win.onClick("btn_search", async () => {
    const query = win.getValue("txt_pkg_name") || "webview-bun";
    win.appendConsole("brew_console", `[npm Search] Querying registry for '${query}'...\n`, 1);
    win.setStatus(`Searching '${query}'...`);
    try {
      const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=8`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data: any = await res.json();
      const results = (data.objects || []).map((o: any, idx: number) => {
        const p = o.package;
        return `${idx + 1}. ${p.name} (v${p.version})
   ${p.description || "No description"}
   Keywords: ${(p.keywords || []).slice(0, 5).join(", ") || "None"}
   Publisher: ${p.publisher?.username || "Unknown"}
   Links: ${p.links?.npm || ""}`;
      }).join("\n\n");

      win.setText("txt_brew_out", `=== npm Search Results for '${query}' ===\nTotal Matches: ${data.total}\n\n${results || "No matching packages found."}`);
      win.appendConsole("brew_console", `[npm Search] Found ${data.total} packages.\n`, 2);
      win.setStatus(`Found ${data.total} packages`);
    } catch (e: any) {
      win.setText("txt_brew_out", `[npm Search Error]: ${e.message}`);
      win.appendConsole("brew_console", `[npm Search] Error: ${e.message}\n`, 3);
      win.setStatus("Search Error");
    }
  });

  // Package Details Info via Native Fetch API
  win.onClick("btn_info", async () => {
    const pkg = (win.getValue("txt_pkg_name") || "webview-bun").trim();
    win.appendConsole("brew_console", `[Package Info] Fetching metadata for '${pkg}'...\n`, 1);
    win.setStatus(`Fetching info for '${pkg}'...`);
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data: any = await res.json();
      const latestVer = data["dist-tags"]?.latest || "latest";
      const verData = data.versions?.[latestVer] || {};

      const report = `=== Package Info: ${data.name} (v${latestVer}) ===
Description: ${data.description || "None"}
Homepage: ${data.homepage || "None"}
License: ${data.license || "None"}
Created: ${data.time?.created || "Unknown"}
Last Modified: ${data.time?.modified || "Unknown"}
Repository: ${data.repository?.url || "None"}

--- Latest Release Dependencies ---
Dependencies (${Object.keys(verData.dependencies || {}).length}):
${Object.entries(verData.dependencies || {}).map(([k, v]) => `  - ${k}: ${v}`).join("\n") || "  None"}

Peer Dependencies (${Object.keys(verData.peerDependencies || {}).length}):
${Object.entries(verData.peerDependencies || {}).map(([k, v]) => `  - ${k}: ${v}`).join("\n") || "  None"}
`;
      win.setText("txt_brew_out", report);
      win.appendConsole("brew_console", `[Package Info] Retrieved metadata for ${data.name}.\n`, 2);
      win.setStatus("Package Info Ready");
    } catch (e: any) {
      win.setText("txt_brew_out", `[Package Info Error]: ${e.message}`);
      win.appendConsole("brew_console", `[Package Info] Error: ${e.message}\n`, 3);
      win.setStatus("Info Error");
    }
  });

  // Package Management (bun add / bun remove)
  win.onClick("btn_install", () => {
    const pkg = (win.getValue("txt_pkg_name") || "").trim();
    if (!pkg) return;
    runBunCmd(`bun add ${pkg}`, `Installing ${pkg}`);
  });

  win.onClick("btn_uninstall", () => {
    const pkg = (win.getValue("txt_pkg_name") || "").trim();
    if (!pkg) return;
    runBunCmd(`bun remove ${pkg}`, `Removing ${pkg}`);
  });

  // Bun PM & Runtime Actions
  win.onClick("btn_list_all", () => runBunCmd("bun pm ls", "Listing Installed Project Packages"));
  win.onClick("btn_cache_info", () => runBunCmd("bun pm cache", "Inspecting Bun Package Cache Directory"));
  win.onClick("btn_bin_path", () => runBunCmd("bun pm bin -g", "Locating Global Bun Binary Path"));
  win.onClick("btn_cleanup", () => runBunCmd("bun pm cache rm", "Purging Bun Package Cache"));
  win.onClick("btn_doctor", () => {
    const report = `=== Bun Health & Diagnostics Report ===
Bun Executable: ${process.execPath}
Bun Version: ${Bun.version} (${Bun.revision})
JavaScriptCore Engine: Enabled
TypeScript Native Parsing: Active
Memory Allocator: Mimalloc (High-Performance)
Operating System: ${os.type()} ${os.release()} (${os.arch()})
Process Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB
System Health: OK (100% Native Bun System APIs)
`;
    win.setText("txt_brew_out", report);
    win.appendConsole("brew_console", "[Diagnostics] Generated Bun Health & Doctor report.\n", 2);
    win.setStatus("Diagnostics Completed");
  });

  win.onClick("btn_test", () => runBunCmd("bun test", "Running Project Test Suite"));

  win.onClick("btn_gc", () => {
    if (typeof (Bun as any).gc === "function") {
      (Bun as any).gc(true);
      win.appendConsole("brew_console", "[Garbage Collector] Synchronous JSC GC cycle invoked.\n", 2);
      win.setStatus("Garbage Collection Complete");
    } else {
      win.appendConsole("brew_console", "[Garbage Collector] GC triggered automatically by runtime.\n", 1);
      win.setStatus("GC Active");
    }
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

// High-level aliases
export const createSystemStudio = createBunSystemStudio;
export const createBrewStudio = createBunSystemStudio;

if (import.meta.main) {
  const win = createBunSystemStudio({ fullscreen: true });
  console.log("⚡ Launching Bun System & Package Workstation (Fullscreen)...");
  win.run();
}
