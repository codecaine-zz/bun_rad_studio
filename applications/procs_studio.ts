import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  fetchRawProcessList,
  parsePsOutput,
  filterProcesses,
  filterProcessesByUser,
  sortProcesses,
  buildProcessTree,
  fetchListeningPorts,
  attachListeningPorts,
  killProcess,
  formatTreeLines,
} from "../src/features/procs/procsDoers.ts";
import type { ProcessInfo, SortField } from "../src/features/procs/procsTypes.ts";

export function createProcsStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Procs Studio Pro -- Modern Process Viewer & Task Manager",
    1260,
    940,
    {
      appId: "procs_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentProcs: ProcessInfo[] = [];
  let selectedProc: ProcessInfo | null = null;
  let isTreeMode = false;
  let refreshTimer: Timer | null = null;

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Procs Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Modern ps Replacement -- Native Process Telemetry, TCP Port Inspection & Signal Control");

  // -----------------------------------------------------------------------------------------------
  // 2. Telemetry Cards
  // -----------------------------------------------------------------------------------------------
  const isShot = process.env.SCREENSHOT_MODE === "1";
  win.beginGroupBox("Process & Resource Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_total", isShot ? "Total Procs: 9" : "Total Procs: 0");
  win.addLabel("lbl_metric_top_cpu", isShot ? "Top CPU: WindowServer (3.2%)" : "Top CPU: -");
  win.addLabel("lbl_metric_top_mem", isShot ? "Top MEM: Chrome (4.5%)" : "Top MEM: -");
  win.addLabel("lbl_metric_ports", isShot ? "Active Listeners: 4" : "Active Listeners: 0");
  win.addLabel("lbl_metric_status", isShot ? "Status: Monitoring" : "Status: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Search & Filter Controls
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Filter & Process Management Controls");
  win.beginRow();
  win.addLabel("lbl_search", "Filter:");
  win.addInput("txt_search", "", "Search by PID, username, or command...", { width: 280 });
  win.addLabel("lbl_sort", "Sort By:");
  win.addDropdown("dd_sort", ["CPU (Desc)", "Memory (Desc)", "PID (Asc)", "User (Asc)"], "CPU (Desc)", { width: 140 });
  win.addLabel("lbl_limit", "Limit:");
  win.addInput("txt_limit", "100", "Max rows (e.g. 50, 100)...", { width: 70 });
  win.addCheckbox("chk_ports", "Inspect Ports (-P)", true);
  win.addCheckbox("chk_auto", "Live 3s Refresh", false);
  win.addButton("btn_refresh", "🔄 Refresh", { width: 100 });
  win.addButton("btn_tree", "🌲 Tree View", { width: 110 });
  win.endRow();

  win.beginRow();
  win.addButton("btn_sigterm", "⏹️ Terminate (SIGTERM)", { width: 180 });
  win.addButton("btn_sigkill", "🛑 Force Kill (SIGKILL)", { width: 180 });
  win.addButton("btn_inspect", "🔍 Inspect Process Details", { width: 190 });
  win.addButton("btn_clear_filter", "✕ Clear Filter", { width: 110 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Process Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Active Operating System Processes");
  const tableHeaders = ["PID", "PPID", "User", "CPU %", "MEM %", "State", "Time", "Ports", "Command"];
  const demoProcs = isShot ? [
    ["1", "0", "root", "0.1", "0.2", "Ss", "1:24.12", "-", "/sbin/launchd"],
    ["210", "1", "_windowserver", "3.2", "2.8", "Ss", "4:18.90", "-", "/System/Library/CoreServices/WindowServer"],
    ["1042", "1", "developer", "1.5", "1.4", "S", "0:14.22", ":3000", "bun run dev"],
    ["1088", "1042", "developer", "0.8", "1.1", "S", "0:08.15", ":5173", "vite --host 0.0.0.0 --port 5173"],
    ["2045", "1", "system", "0.1", "0.5", "S", "0:02.30", ":6379", "redis-server *:6379"],
    ["3012", "1", "system", "0.2", "0.8", "S", "0:03.45", ":80, :443", "caddy run --config Caddyfile"],
    ["4099", "1", "system", "0.4", "1.2", "S", "0:05.18", ":5432", "postgres -D /data/postgres"],
    ["5120", "1", "developer", "0.6", "1.0", "S", "0:12.40", "-", "/Applications/Ghostty.app/Contents/MacOS/Ghostty"],
    ["6780", "1", "developer", "2.4", "4.5", "S", "1:02.15", "-", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  ] : [];
  win.addTable("tbl_procs", tableHeaders, demoProcs, { height: 320 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Inspector / Tree Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Process Hierarchy & Detailed Telemetry");
  win.addConsole("console_detail", 190);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Click Refresh to scan active processes.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Logic & Actions
  // -----------------------------------------------------------------------------------------------
  const refreshProcessList = () => {
    try {
      win.setValue("lbl_status_bar", "Scanning active system processes...");
      const rawPs = fetchRawProcessList();
      let procs = parsePsOutput(rawPs);

      const inspectPorts = win.getBool("chk_ports");
      let activePortsCount = 0;
      if (inspectPorts) {
        const portMap = fetchListeningPorts();
        procs = attachListeningPorts(procs, portMap);
        activePortsCount = portMap.size;
      }

      // Telemetry highlights
      const topCpu = [...procs].sort((a, b) => b.cpu - a.cpu)[0];
      const topMem = [...procs].sort((a, b) => b.mem - a.mem)[0];

      win.setValue("lbl_metric_total", `Total Procs: ${procs.length}`);
      win.setValue("lbl_metric_top_cpu", topCpu ? `Top CPU: ${topCpu.cpu}% (${topCpu.command.slice(0, 16)})` : "-");
      win.setValue("lbl_metric_top_mem", topMem ? `Top MEM: ${topMem.mem}% (${topMem.command.slice(0, 16)})` : "-");
      win.setValue("lbl_metric_ports", `Active Listeners: ${activePortsCount}`);

      // Filter
      const keyword = win.getValue("txt_search")?.trim();
      if (keyword) {
        procs = filterProcesses(procs, keyword);
      }

      // Sort
      const sortSel = win.getValue("dd_sort");
      let sortField: SortField = "cpu";
      if (sortSel?.includes("Memory")) sortField = "mem";
      else if (sortSel?.includes("PID")) sortField = "pid";
      else if (sortSel?.includes("User")) sortField = "user";

      procs = sortProcesses(procs, sortField);

      // Limit
      const limitStr = win.getValue("txt_limit")?.trim();
      const limit = limitStr ? parseInt(limitStr, 10) : undefined;
      const displayProcs = limit && !isNaN(limit) ? procs.slice(0, limit) : procs;
      currentProcs = displayProcs;

      const rows: string[][] = displayProcs.map((p) => [
        String(p.pid),
        String(p.ppid),
        p.user,
        `${p.cpu.toFixed(1)}%`,
        `${p.mem.toFixed(1)}%`,
        p.stat,
        p.time,
        p.ports && p.ports.length > 0 ? p.ports.join(", ") : "-",
        p.command.length > 80 ? p.command.slice(0, 80) + "..." : p.command,
      ]);

      win.setTableData("tbl_procs", rows);
      win.setValue("lbl_metric_status", "Status: Active");
      win.setValue("lbl_status_bar", `✓ Displaying ${displayProcs.length} process(es).`);

      if (isTreeMode) {
        renderTreeConsole(procs);
      }
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Error scanning processes: ${err.message}`);
    }
  };

  const renderTreeConsole = (procs: ProcessInfo[]) => {
    win.clearConsole("console_detail");
    win.appendConsole("console_detail", `=================================================================\n`);
    win.appendConsole("console_detail", `PROCESS HIERARCHY TREE (${procs.length} processes)\n`);
    win.appendConsole("console_detail", `=================================================================\n`);
    const roots = buildProcessTree(procs);
    const treeLines = formatTreeLines(roots);
    for (const line of treeLines.slice(0, 150)) {
      win.appendConsole("console_detail", line + "\n");
    }
  };

  const renderDetailConsole = (p: ProcessInfo) => {
    win.clearConsole("console_detail");
    win.appendConsole("console_detail", `=================================================================\n`);
    win.appendConsole("console_detail", `PROCESS DETAIL INSPECTOR: PID ${p.pid}\n`);
    win.appendConsole("console_detail", `=================================================================\n`);
    win.appendConsole("console_detail", `PID:             ${p.pid}\n`);
    win.appendConsole("console_detail", `Parent PID:      ${p.ppid}\n`);
    win.appendConsole("console_detail", `User Owner:      ${p.user}\n`);
    win.appendConsole("console_detail", `CPU Usage:       ${p.cpu.toFixed(2)}%\n`);
    win.appendConsole("console_detail", `Memory Usage:    ${p.mem.toFixed(2)}%\n`);
    win.appendConsole("console_detail", `Process State:   ${p.stat}\n`);
    win.appendConsole("console_detail", `CPU Time:        ${p.time}\n`);
    win.appendConsole("console_detail", `Listening Ports: ${p.ports && p.ports.length > 0 ? p.ports.join(", ") : "None"}\n`);
    win.appendConsole("console_detail", `Full Command:\n${p.command}\n`);
  };

  win.on("btn_refresh", "click", () => refreshProcessList());

  win.on("btn_clear_filter", "click", () => {
    win.setValue("txt_search", "");
    refreshProcessList();
  });

  win.on("btn_tree", "click", () => {
    isTreeMode = !isTreeMode;
    win.setValue("lbl_status_bar", isTreeMode ? "Tree View enabled in console." : "Tree View disabled.");
    if (isTreeMode) {
      renderTreeConsole(currentProcs);
    } else if (selectedProc) {
      renderDetailConsole(selectedProc);
    }
  });

  win.on("tbl_procs", "click", (w, val) => {
    if (typeof val === "number" && currentProcs[val]) {
      selectedProc = currentProcs[val];
      if (selectedProc) {
        renderDetailConsole(selectedProc);
        win.setValue("lbl_status_bar", `Selected PID ${selectedProc.pid} (${selectedProc.command.slice(0, 30)})`);
      }
    }
  });

  win.on("btn_inspect", "click", () => {
    if (selectedProc) {
      renderDetailConsole(selectedProc);
    } else {
      win.setValue("lbl_status_bar", "⚠️ Please select a process row from the table first.");
    }
  });

  const sendSignal = async (sig: "SIGTERM" | "SIGKILL") => {
    if (!selectedProc) {
      win.setValue("lbl_status_bar", `⚠️ Please select a process row to send ${sig}.`);
      return;
    }
    const pid = selectedProc.pid;
    win.setValue("lbl_status_bar", `Sending ${sig} to PID ${pid}...`);
    try {
      killProcess(pid, sig as NodeJS.Signals);
      win.setValue("lbl_status_bar", `✓ Signal ${sig} dispatched to PID ${pid}. Refreshing...`);
      setTimeout(() => refreshProcessList(), 500);
    } catch {
      win.setValue("lbl_status_bar", `❌ Failed to terminate PID ${pid}. You may need elevated permissions.`);
    }
  };

  win.on("btn_sigterm", "click", () => sendSignal("SIGTERM"));
  win.on("btn_sigkill", "click", () => sendSignal("SIGKILL"));

  // Initial load
  setTimeout(() => refreshProcessList(), 100);

  return win;
}

export { createProcsStudio as createProcessStudio };

if (import.meta.main) {
  const win = createProcsStudio({ fullscreen: true });
  console.log("⚡ Launching Procs Studio Pro...");
  win.run();
}
