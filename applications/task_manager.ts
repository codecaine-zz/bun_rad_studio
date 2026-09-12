import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";

export interface ProcessItem {
  pid: string;
  ppid: string;
  cpu: number;
  mem: number;
  rssMb: string;
  rssKb: number;
  state: string;
  user: string;
  name: string;
  command: string;
  ports: string[];
  isUserApp: boolean;
  isDevServer: boolean;
}

export interface TelemetrySummary {
  total: number;
  userCount: number;
  systemCount: number;
  topCpuProc?: ProcessItem;
  topMemProc?: ProcessItem;
  portListenersCount: number;
  totalRssMb: number;
}

let cachedProcesses: ProcessItem[] = [];
let lastProcessFetchTime = 0;
let cachedPortMap = new Map<string, string[]>();
let lastPortFetchTime = 0;

/**
 * Fetch all network listening ports mapped by PID using macOS/Linux lsof.
 * Cached for 3.5 seconds to avoid subprocess rate-limiting and high CPU churn.
 */
function fetchListeningPortMap(): Map<string, string[]> {
  const now = Date.now();
  if (now - lastPortFetchTime < 3500 && cachedPortMap.size > 0) {
    return cachedPortMap;
  }
  const portMap = new Map<string, string[]>();
  try {
    const [out, code] = Sys.exec("lsof -iTCP -sTCP:LISTEN -n -P");
    if (code === 0 && out) {
      const lines = out.trim().split("\n");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 9) {
          const pid = parts[1];
          const address = parts[8];
          const portMatch = address?.match(/:(\d+)$/);
          if (pid && portMatch && portMatch[1]) {
            const portStr = ":" + portMatch[1];
            const current = portMap.get(pid) || [];
            if (!current.includes(portStr)) {
              current.push(portStr);
            }
            portMap.set(pid, current);
          }
        }
      }
      cachedPortMap = portMap;
      lastPortFetchTime = now;
    }
  } catch {
    // Non-fatal if lsof is restricted or unavailable
  }
  return cachedPortMap.size > 0 ? cachedPortMap : portMap;
}

/**
 * Extract human-readable process name from command string.
 */
function extractProcessName(command: string): string {
  if (!command) return "unknown";
  const firstToken = command.trim().split(/\s+/)[0] || "";
  const baseName = firstToken.split("/").pop() || firstToken;
  return baseName.replace(/\.app\/Contents\/MacOS\/.*/i, "").replace(/:$/, "");
}

function normalizeTypo(s: string): string {
  return s.toLowerCase().replace(/(.)\1+/g, "$1");
}

const KNOWN_ALIASES: Record<string, string[]> = {
  ghostty: ["terminal", "term", "console", "tty", "ghosty", "ghost", "temrinal", "teminal", "termnial"],
  ghosty: ["ghostty", "terminal", "term", "console", "tty", "ghost", "temrinal", "teminal", "termnial"],
  iterm: ["terminal", "term", "console", "temrinal", "iterm2"],
  iterm2: ["terminal", "term", "console", "temrinal", "iterm"],
  alacritty: ["terminal", "term", "console", "temrinal"],
  kitty: ["terminal", "term", "console", "temrinal"],
  warp: ["terminal", "term", "console", "temrinal"],
  wezterm: ["terminal", "term", "console", "temrinal"],
  terminal: ["ghostty", "ghosty", "iterm", "iterm2", "alacritty", "kitty", "terminal", "warp", "wezterm", "console", "tty", "pty", "temrinal", "teminal"],
  chrome: ["browser", "google", "web"],
  safari: ["browser", "web", "apple"],
  firefox: ["browser", "mozilla", "web"],
  code: ["vscode", "editor", "ide"],
  cursor: ["editor", "ide", "code", "ai"],
  antigravity: ["ide", "editor", "gemini", "google"],
  bun: ["runtime", "server", "js", "ts"],
  node: ["runtime", "server", "js"],
};

export function matchesQuery(proc: ProcessItem, query: string): boolean {
  if (!query) return true;
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return true;

  const pid = proc.pid;
  const name = proc.name.toLowerCase();
  const user = proc.user.toLowerCase();
  const cmd = proc.command.toLowerCase();
  const ports = proc.ports.join(" ");

  // 1. Direct substring match
  if (pid === cleanQuery || name.includes(cleanQuery) || cmd.includes(cleanQuery) || user.includes(cleanQuery) || ports.includes(cleanQuery)) {
    return true;
  }

  // 2. Typo tolerance: collapsed repeating characters (e.g. "ghosty" vs "ghostty")
  const normQuery = normalizeTypo(cleanQuery);
  const normName = normalizeTypo(name);
  const normCmd = normalizeTypo(cmd);
  if (normName.includes(normQuery) || normCmd.includes(normQuery)) {
    return true;
  }

  // 3. Multi-word search (e.g. "ghosty terminal" or "bun server")
  const words = cleanQuery.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const allWordsMatch = words.every((word) => {
      const normWord = normalizeTypo(word);
      if (pid.includes(word) || name.includes(word) || cmd.includes(word) || user.includes(word) || ports.includes(word)) {
        return true;
      }
      if (normName.includes(normWord) || normCmd.includes(normWord)) {
        return true;
      }
      const aliases = KNOWN_ALIASES[name] || [];
      if (aliases.some((a) => a.includes(word) || normalizeTypo(a).includes(normWord))) {
        return true;
      }
      return false;
    });
    if (allWordsMatch) return true;
  }

  // 4. Semantic alias matching (e.g. searching "terminal" matches Ghostty / iTerm / Alacritty)
  for (const [key, aliasList] of Object.entries(KNOWN_ALIASES)) {
    if (name.includes(key) || normName.includes(normalizeTypo(key))) {
      if (aliasList.some((a) => cleanQuery.includes(a) || normQuery.includes(normalizeTypo(a)))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Identify whether a process is a known development server or database engine.
 */
function isDevServerProcess(command: string, name: string): boolean {
  const hay = (name + " " + command).toLowerCase();
  return /\b(bun|node|deno|vite|next|ts-node|tsx|esbuild|webpack|turbopack|python|python3|uvicorn|gunicorn|flask|fastapi|ruby|rails|cargo|rustc|go|redis-server|postgres|mysqld|mongod|docker|caddy|nginx)\b/i.test(hay);
}

/**
 * Fetch complete live process list with hardware resource metrics and listening network ports.
 * Includes caching and resilience so rapid searches/clears never yield an empty list.
 */
export function fetchProcesses(): ProcessItem[] {
  const now = Date.now();
  // Throttle ps execution to at most once per 250ms under rapid typing or clearing
  if (now - lastProcessFetchTime < 250 && cachedProcesses.length > 0) {
    return cachedProcesses;
  }

  const [out, code] = Sys.exec("ps -axo pid,ppid,pcpu,pmem,rss,state,user,command");
  if (code !== 0 || !out || out.trim().length < 50) {
    if (cachedProcesses.length > 0) {
      return cachedProcesses;
    }
    return [];
  }

  const portMap = fetchListeningPortMap();
  const currentUser = process.env.USER || "";
  const lines = out.trim().split("\n");
  const items: ProcessItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 8) {
      const pid = parts[0] || "";
      const ppid = parts[1] || "";
      const cpu = parseFloat(parts[2] || "0");
      const mem = parseFloat(parts[3] || "0");
      const rssKb = parseInt(parts[4] || "0", 10);
      const state = parts[5] || "";
      const user = parts[6] || "";
      const command = parts.slice(7).join(" ");
      const rssMb = (rssKb / 1024).toFixed(1) + " MB";
      const name = extractProcessName(command);
      const ports = portMap.get(pid) || [];
      const isUserApp = user === currentUser;
      const isDevServer = isDevServerProcess(command, name);

      items.push({
        pid,
        ppid,
        cpu,
        mem,
        rssMb,
        rssKb,
        state,
        user,
        name,
        command,
        ports,
        isUserApp,
        isDevServer,
      });
    }
  }

  if (items.length > 0) {
    items.sort((a, b) => b.cpu - a.cpu);
    cachedProcesses = items;
    lastProcessFetchTime = now;
    return items;
  }

  return cachedProcesses;
}

/**
 * Calculate system telemetry overview from process items.
 */
export function computeTelemetry(procs: ProcessItem[]): TelemetrySummary {
  let userCount = 0;
  let systemCount = 0;
  let totalRssKb = 0;
  let portCount = 0;

  for (const p of procs) {
    if (p.isUserApp) userCount++;
    else systemCount++;
    totalRssKb += p.rssKb;
    if (p.ports.length > 0) portCount++;
  }

  const topCpu = procs.length > 0 ? [...procs].sort((a, b) => b.cpu - a.cpu)[0] : undefined;
  const topMem = procs.length > 0 ? [...procs].sort((a, b) => b.mem - a.mem)[0] : undefined;

  return {
    total: procs.length,
    userCount,
    systemCount,
    topCpuProc: topCpu,
    topMemProc: topMem,
    portListenersCount: portCount,
    totalRssMb: Math.round(totalRssKb / 1024),
  };
}

export function createTaskTracker(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Task Manager Pro -- macOS Real-Time Process & Resource Monitor", 1200, 920, {
    appId: "task_manager",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  let currentCategory = "all";
  let activeProcesses = fetchProcesses();
  let selectedPid = activeProcesses[0]?.pid || "1";
  let autoRefreshRate = "2s"; // "2s", "5s", "off"

  const telemetry = computeTelemetry(activeProcesses);

  // -----------------------------------------------------------------------------------------------
  // 1. Navigation & App Header
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Task Manager Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_refresh", "🔄 Refresh");
  win.addDropdown("dd_autorefresh", ["⚡ Auto: 2s", "⏱️ Auto: 5s", "⏸️ Auto: Off"], "⚡ Auto: 2s");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save View");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("macOS Real-Time Process Forensics, Instant Search & Hardware Resource Monitor");

  // -----------------------------------------------------------------------------------------------
  // 2. System Telemetry Overview Cards
  // -----------------------------------------------------------------------------------------------
  win.beginCard("System Telemetry Overview");
  win.beginRow();
  win.addLabel("lbl_total_procs", `Total Processes: ${telemetry.total} (${telemetry.userCount} User, ${telemetry.systemCount} Sys)`);
  win.addLabel("lbl_top_cpu", `Top CPU: ${telemetry.topCpuProc?.name || "N/A"} (${telemetry.topCpuProc?.cpu || 0}%)`);
  win.addLabel("lbl_ports_active", `Active Port Listeners: ${telemetry.portListenersCount} services`);
  win.addLabel("lbl_platform", `Platform: macOS (Darwin ${process.arch}) | Bun v${Bun.version}`);
  win.endRow();
  win.endCard();

  // -----------------------------------------------------------------------------------------------
  // 3. Quick Category Filter Tabs
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addButton("btn_cat_all", `🌐 All (${telemetry.total})`);
  win.addButton("btn_cat_user", `👤 User Apps (${telemetry.userCount})`);
  win.addButton("btn_cat_cpu", `🔥 High CPU (>1%)`);
  win.addButton("btn_cat_mem", `💾 High RAM (>100MB)`);
  win.addButton("btn_cat_dev", `⚡ Dev Servers`);
  win.addButton("btn_cat_ports", `🔌 Port Listeners (${telemetry.portListenersCount})`);
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // 4. Search Filter, Sorting & Rapid Port Killer Controls
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Search, Filter & Rapid Port Controller");
  win.beginRow();
  win.addLabel("lbl_filter", "Search Filter:");
  win.addInput("txt_filter", "", "Filter name, PID, port, user, cmd...", { width: 220 });
  win.addButton("btn_apply_filter", "🔍 Search", { width: 85 });
  win.addButton("btn_clear_filter", "✕ Clear", { width: 75 });
  win.addLabel("lbl_sort", "Sort:");
  win.addDropdown("dd_sort", ["CPU % (High to Low)", "Memory % (High to Low)", "RAM (MB)", "PID", "Process Name", "Port"], "CPU % (High to Low)", { width: 170 });
  win.addLabel("lbl_limit", "Limit:");
  win.addDropdown("dd_limit", ["Show All", "Top 200", "Top 100", "Top 50"], "Show All", { width: 110 });
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_port_help", "Kill by Port:");
  win.addInput("txt_port", "3000", "e.g. 3000", { width: 90 });
  win.addButton("btn_kill_port", "⚡ Kill Port Process", { width: 155 });
  win.addButton("btn_clean_dev", "🧹 Clean Rogue Dev Servers", { width: 200 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Selected Process Inspector & Signal Controller
  // -----------------------------------------------------------------------------------------------
  const initialSelected = activeProcesses.find((p) => p.pid === selectedPid) || activeProcesses[0];
  const initialDetails = initialSelected
    ? `Selected: [${initialSelected.pid}] ${initialSelected.name} | User: ${initialSelected.user} | CPU: ${initialSelected.cpu}% | RAM: ${initialSelected.rssMb}${initialSelected.ports.length ? " | Ports: " + initialSelected.ports.join(", ") : ""}`
    : "No process selected";
  const initialCmd = initialSelected?.command || "N/A";

  win.beginGroupBox("Selected Process Inspector & Signal Dispatcher");
  win.beginRow();
  win.addLabel("lbl_target_pid", "Target PID:");
  win.addInput("txt_target_pid", selectedPid);
  win.addLabel("lbl_proc_details", initialDetails);
  win.endRow();

  win.beginRow();
  win.addButton("btn_kill_force", "🛑 Force Kill (SIGKILL)");
  win.addButton("btn_kill_term", "⚠️ Terminate (SIGTERM)");
  win.addButton("btn_kill_stop", "⏸️ Suspend (SIGSTOP)");
  win.addButton("btn_kill_cont", "▶️ Resume (SIGCONT)");
  win.addButton("btn_kill_hup", "🔄 Reload (SIGHUP)");
  win.addButton("btn_copy_pid", "📋 Copy PID");
  win.addButton("btn_copy_cmd", "📋 Copy Command");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_proc_cmd", `Command: ${initialCmd.length > 120 ? initialCmd.slice(0, 120) + "..." : initialCmd}`);
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Live Process Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Live Running Process Table (Click any row to select & inspect)");
  const tableHeaders = ["PID", "Name", "Port", "CPU %", "MEM %", "RSS", "User", "State", "Command"];
  const initialTableRows = activeProcesses.map((p) => [
    p.pid,
    p.name,
    p.ports.length > 0 ? p.ports.join(", ") : "—",
    p.cpu.toFixed(1) + "%",
    p.mem.toFixed(1) + "%",
    p.rssMb,
    p.user,
    p.state,
    p.command.length > 70 ? p.command.slice(0, 70) + "..." : p.command,
  ]);
  win.addTable("tbl_procs", tableHeaders, initialTableRows).size(1140, 380);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 7. Process Signals & Activity Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Process Signals & Telemetry Log");
  win.addConsole("task_console", 110);
  win.beginRow();
  win.addButton("btn_clear_console", "🗑️ Clear Log");
  win.addLabel("lbl_status", `Status: Monitoring ${activeProcesses.length} active processes`);
  win.endRow();
  win.endGroupBox();

  // Hidden IPC receiver for row selection
  win.bindControlEvent("sel_proc_ipc", "change", (w, pidVal) => {
    if (!pidVal) return;
    updateSelectedProcess(String(pidVal));
  });

  // -----------------------------------------------------------------------------------------------
  // Application Logic & Event Callbacks
  // -----------------------------------------------------------------------------------------------

  const logConsole = (message: string, style = 1) => {
    const time = new Date().toLocaleTimeString();
    win.appendConsole("task_console", `[${time}] ${message}\n`, style);
  };

  const updateSelectedProcess = (pid: string, updateInput = true) => {
    selectedPid = pid.trim();
    if (updateInput) {
      win.setValue("txt_target_pid", selectedPid);
    }

    const proc = activeProcesses.find((p) => p.pid === selectedPid);
    if (proc) {
      const portInfo = proc.ports.length ? ` | Ports: ${proc.ports.join(", ")}` : "";
      const devBadge = proc.isDevServer ? " [⚡ Dev Server]" : "";
      const details = `Selected: [${proc.pid}] ${proc.name}${devBadge} | User: ${proc.user} | CPU: ${proc.cpu}% | RAM: ${proc.rssMb}${portInfo}`;
      win.setText("lbl_proc_details", details);
      const cmdPreview = proc.command.length > 120 ? proc.command.slice(0, 120) + "..." : proc.command;
      win.setText("lbl_proc_cmd", `Command: ${cmdPreview}`);
    } else {
      win.setText("lbl_proc_details", `Selected PID: ${selectedPid} (Process may have exited)`);
    }
  };

  const getFilteredProcesses = (procs: ProcessItem[]): ProcessItem[] => {
    const filterText = (win.getValue("txt_filter") || "").toLowerCase().trim();
    let list = [...procs];

    // If an explicit search text is typed, search across all processes with typo tolerance & aliases
    if (filterText) {
      list = list.filter((p) => matchesQuery(p, filterText));
    } else {
      // Category filter applies when no explicit search text is typed
      if (currentCategory === "user") {
        list = list.filter((p) => p.isUserApp);
      } else if (currentCategory === "cpu") {
        list = list.filter((p) => p.cpu >= 1.0);
      } else if (currentCategory === "mem") {
        list = list.filter((p) => p.rssKb >= 102400); // 100MB+
      } else if (currentCategory === "dev") {
        list = list.filter((p) => p.isDevServer);
      } else if (currentCategory === "ports") {
        list = list.filter((p) => p.ports.length > 0);
      }
    }

    // Sorting
    const sortVal = win.getValue("dd_sort") || "CPU % (High to Low)";
    if (sortVal.includes("Memory")) {
      list.sort((a, b) => b.mem - a.mem);
    } else if (sortVal.includes("RAM")) {
      list.sort((a, b) => b.rssKb - a.rssKb);
    } else if (sortVal.includes("PID")) {
      list.sort((a, b) => parseInt(a.pid, 10) - parseInt(b.pid, 10));
    } else if (sortVal.includes("Name")) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortVal.includes("Port")) {
      list.sort((a, b) => (b.ports[0] || "").localeCompare(a.ports[0] || ""));
    } else {
      // Default: CPU %
      list.sort((a, b) => b.cpu - a.cpu);
    }

    // Limit
    const limitVal = win.getValue("dd_limit") || "Top 50";
    if (!filterText) {
      if (limitVal.includes("50")) return list.slice(0, 50);
      if (limitVal.includes("100")) return list.slice(0, 100);
      if (limitVal.includes("200")) return list.slice(0, 200);
    } else {
      // When searching, show all matches up to 200 without truncating to top 50
      if (limitVal.includes("50") && list.length > 50) return list.slice(0, 100);
    }
    return list;
  };

  const refreshList = (isSilentTimer = false) => {
    activeProcesses = fetchProcesses();
    const tel = computeTelemetry(activeProcesses);

    // Update telemetry labels
    win.setText("lbl_total_procs", `Total Processes: ${tel.total} (${tel.userCount} User, ${tel.systemCount} Sys)`);
    win.setText("lbl_top_cpu", `Top CPU: ${tel.topCpuProc?.name || "N/A"} (${tel.topCpuProc?.cpu || 0}%)`);
    win.setText("lbl_ports_active", `Active Port Listeners: ${tel.portListenersCount} services`);
    win.setStatus(`Monitoring ${tel.total} active processes | Category: ${currentCategory.toUpperCase()}`);

    const filtered = getFilteredProcesses(activeProcesses);
    const rows = filtered.map((p) => [
      p.pid,
      p.name,
      p.ports.length > 0 ? p.ports.join(", ") : "—",
      p.cpu.toFixed(1) + "%",
      p.mem.toFixed(1) + "%",
      p.rssMb,
      p.user,
      p.state,
      p.command.length > 70 ? p.command.slice(0, 70) + "..." : p.command,
    ]);

    win.setTableData("tbl_procs", tableHeaders, rows);

    // Keep inspector updated without stomping user input during timer
    if (selectedPid) {
      updateSelectedProcess(selectedPid, false);
    }

    if (!isSilentTimer) {
      logConsole(`[Telemetry] Refreshed: ${filtered.length} matching processes displayed (Total: ${activeProcesses.length})`, 1);
    }
  };

  // Signal execution helper
  const sendSignalToPid = (pid: string, signal: string, sigNum: number) => {
    if (!pid || pid === "0") {
      win.toast("Please specify a valid PID to send signal.");
      return;
    }
    if (pid === "1") {
      win.toast("⚠️ Protection: Refusing to kill PID 1 (launchd/system init).");
      logConsole(`[Security Warning] Attempted to send ${signal} to PID 1 blocked for system stability.`, 3);
      return;
    }
    if (pid === String(process.pid)) {
      win.toast("⚠️ Protection: Refusing to kill self process.");
      logConsole(`[Security Warning] Blocked killing self Task Manager process.`, 3);
      return;
    }

    const proc = activeProcesses.find((p) => p.pid === pid);
    const procName = proc ? ` (${proc.name})` : "";
    const [out, code] = Sys.exec(`kill -${sigNum} ${pid}`);

    if (code === 0) {
      logConsole(`[Signal] Successfully sent ${signal} (-${sigNum}) to PID ${pid}${procName}`, 2);
      win.toast(`Signal ${signal} sent to PID ${pid}`);
    } else {
      logConsole(`[Signal Failed] Could not send ${signal} to PID ${pid}${procName}: exit code ${code} ${out.trim()}`, 3);
      win.toast(`Failed to send ${signal} to PID ${pid} (exit ${code})`);
    }

    setTimeout(() => refreshList(false), 350);
  };

  // -----------------------------------------------------------------------------------------------
  // Event Bindings
  // -----------------------------------------------------------------------------------------------

  // Top header actions
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_fullscreen", (w) => w.toggleFullscreen());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Task Manager settings saved successfully!");
  });
  win.onClick("btn_refresh", () => refreshList(false));

  // Auto-refresh timer (2 seconds tick)
  win.addTimer(2000, () => {
    const rate = win.getValue("dd_autorefresh") || autoRefreshRate;
    if (rate.includes("Off")) return;
    refreshList(true);
  });

  // Category filter buttons
  const setCategory = (cat: string, label: string) => {
    currentCategory = cat;
    win.toast(`Filtered: ${label}`);
    logConsole(`[Filter] Switched category to ${label}`, 1);
    refreshList(false);
  };

  win.onClick("btn_cat_all", () => setCategory("all", "All Processes"));
  win.onClick("btn_cat_user", () => setCategory("user", "User Applications"));
  win.onClick("btn_cat_cpu", () => setCategory("cpu", "High CPU Processes (>1%)"));
  win.onClick("btn_cat_mem", () => setCategory("mem", "High RAM Processes (>100MB)"));
  win.onClick("btn_cat_dev", () => setCategory("dev", "Development & Runtime Servers"));
  win.onClick("btn_cat_ports", () => setCategory("ports", "Active Port Listeners"));

  // Real-time search filter input & buttons
  let filterDebounceTimer: any = null;
  win.onChange("txt_filter", (_, val) => {
    if (filterDebounceTimer) {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = null;
    }
    const q = String(val ?? "").trim();
    if (!q) {
      win.formValuesStore["txt_filter"] = "";
      refreshList(true);
      return;
    }
    filterDebounceTimer = setTimeout(() => {
      refreshList(true);
    }, 240);
  });

  win.onEnter("txt_filter", () => {
    if (filterDebounceTimer) {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = null;
    }
    refreshList(false);
  });

  win.onClick("btn_apply_filter", () => {
    if (filterDebounceTimer) {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = null;
    }
    refreshList(false);
    const q = win.getValue("txt_filter");
    if (q) logConsole(`[Search] Searching for '${q}'...`, 1);
  });

  win.onClick("btn_clear_filter", () => {
    if (filterDebounceTimer) {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = null;
    }
    currentCategory = "all";
    win.setValue("txt_filter", "");
    refreshList(false);
    win.toast("Filter cleared — showing all processes");
    logConsole("[Search] Filter cleared, showing all processes", 1);
  });

  win.onChange("dd_sort", () => {
    refreshList(true);
  });

  win.onChange("dd_limit", () => {
    refreshList(true);
  });

  // Target PID manual change
  win.onChange("txt_target_pid", (_, val) => {
    if (val) updateSelectedProcess(String(val), false);
  });

  // Table row click selection
  win.onClick("tbl_procs", (_, pidVal) => {
    if (pidVal) updateSelectedProcess(String(pidVal), true);
  });

  // Process Signals
  win.onClick("btn_kill_force", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    sendSignalToPid(pid, "SIGKILL", 9);
  });

  win.onClick("btn_kill_term", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    sendSignalToPid(pid, "SIGTERM", 15);
  });

  win.onClick("btn_kill_stop", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    sendSignalToPid(pid, "SIGSTOP", 19);
  });

  win.onClick("btn_kill_cont", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    sendSignalToPid(pid, "SIGCONT", 18);
  });

  win.onClick("btn_kill_hup", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    sendSignalToPid(pid, "SIGHUP", 1);
  });

  // Copy PID & Command
  win.onClick("btn_copy_pid", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    if (pid) {
      Sys.exec(`printf "%s" "${pid}" | pbcopy`);
      win.toast(`Copied PID ${pid} to clipboard`);
      logConsole(`[Clipboard] Copied PID ${pid}`, 1);
    }
  });

  win.onClick("btn_copy_cmd", () => {
    const pid = win.getValue("txt_target_pid") || selectedPid;
    const proc = activeProcesses.find((p) => p.pid === pid);
    if (proc?.command) {
      Sys.exec(`printf "%s" "${proc.command.replace(/"/g, '\\"')}" | pbcopy`);
      win.toast(`Copied command for PID ${pid} to clipboard`);
      logConsole(`[Clipboard] Copied command for PID ${pid}`, 1);
    }
  });

  // Kill Port Process
  win.onClick("btn_kill_port", () => {
    const rawPort = (win.getValue("txt_port") || "3000").replace(/[^0-9]/g, "");
    if (!rawPort) {
      win.toast("Please specify a valid port number (e.g. 3000, 8080)");
      return;
    }

    const [out, code] = Sys.exec(`lsof -ti :${rawPort}`);
    if (code !== 0 || !out.trim()) {
      win.toast(`No process listening on port :${rawPort}`);
      logConsole(`[Port Finder] No active process listening on port :${rawPort}`, 3);
      return;
    }

    const pids = out.trim().split("\n").map((s) => s.trim()).filter(Boolean);
    let killedCount = 0;

    for (const p of pids) {
      if (p === "1" || p === String(process.pid)) continue;
      const [, kCode] = Sys.exec(`kill -9 ${p}`);
      if (kCode === 0) {
        killedCount++;
        logConsole(`[Kill Port :${rawPort}] Terminated PID ${p} listening on port :${rawPort}`, 2);
      }
    }

    win.toast(`Killed ${killedCount} process(es) on port :${rawPort}`);
    setTimeout(() => refreshList(false), 300);
  });

  // Clean Rogue Dev Servers
  win.onClick("btn_clean_dev", () => {
    const selfPid = String(process.pid);
    const parentPid = String(process.ppid);
    const rogue = activeProcesses.filter(
      (p) => p.isDevServer && p.isUserApp && p.pid !== selfPid && p.pid !== parentPid
    );

    if (rogue.length === 0) {
      win.toast("No rogue dev servers detected.");
      logConsole("[Dev Server Cleaner] No orphan dev servers found.", 1);
      return;
    }

    let cleaned = 0;
    for (const r of rogue) {
      const [, kCode] = Sys.exec(`kill -15 ${r.pid}`);
      if (kCode === 0) {
        cleaned++;
        logConsole(`[Dev Cleaner] Sent SIGTERM to dev server ${r.name} (PID ${r.pid})`, 2);
      }
    }

    win.toast(`Terminated ${cleaned} rogue dev server(s).`);
    setTimeout(() => refreshList(false), 400);
  });

  // Clear Console
  win.onClick("btn_clear_console", () => {
    win.clearConsole("task_console");
    logConsole("[Task Manager Pro] Activity console cleared.", 1);
  });

  // -----------------------------------------------------------------------------------------------
  // 8. Client-Side Instant Filter & UI Ergonomics Script
  // -----------------------------------------------------------------------------------------------
  win.addScript(`
    (function() {
      function initTaskManagerLiveEngine() {
        const filterInput = document.getElementById("txt_filter");
        const container = document.getElementById("tbl_procs");
        if (!filterInput || !container) return;

        window.onTableRowClick = function(tr) {
          if (!tr) return;
          const firstCell = tr.querySelector("td");
          if (!firstCell) return;
          const pid = firstCell.textContent.trim();
          window.selectedRowPid = pid;

          const cells = tr.querySelectorAll("td");
          const name = cells[1]?.textContent?.trim() || "";
          const ports = cells[2]?.textContent?.trim() || "";
          const cpu = cells[3]?.textContent?.trim() || "0%";
          const mem = cells[4]?.textContent?.trim() || "0%";
          const rss = cells[5]?.textContent?.trim() || "";
          const user = cells[6]?.textContent?.trim() || "";
          const cmd = cells[8]?.textContent?.trim() || "";

          const pidInput = document.getElementById("txt_target_pid");
          if (pidInput) pidInput.value = pid;

          const detailsEl = document.getElementById("lbl_proc_details");
          if (detailsEl) {
            const portInfo = (ports && ports !== "—") ? " | Ports: " + ports : "";
            detailsEl.textContent = "Selected: [" + pid + "] " + name + " | User: " + user + " | CPU: " + cpu + " | RAM: " + rss + portInfo;
          }

          const cmdEl = document.getElementById("lbl_proc_cmd");
          if (cmdEl) {
            cmdEl.textContent = "Command: " + (cmd.length > 120 ? cmd.slice(0, 120) + "..." : cmd);
          }

          if (window.on_sel_proc_ipc_change) {
            window.on_sel_proc_ipc_change(pid);
          }
        };

        window.applyClientSideTableFilter = function() {
          const q = (filterInput.value || "").trim().toLowerCase();
          const table = container.querySelector("table");
          if (!table) return;
          const tbody = table.querySelector("tbody");
          if (!tbody) return;

          // Snapshot full master rows whenever unfiltered rows are present
          if (!q && tbody.children.length > 5) {
            window.__masterTableTbodyHtml = tbody.innerHTML;
          }

          // If query was cleared and table was truncated, restore snapshot immediately!
          if (!q && tbody.children.length < 5 && window.__masterTableTbodyHtml) {
            tbody.innerHTML = window.__masterTableTbodyHtml;
          }

          const rows = tbody.querySelectorAll("tr");
          let visibleCount = 0;

          if (!q) {
            rows.forEach(tr => {
              tr.style.display = "";
              visibleCount++;
            });
            const statusEl = document.getElementById("lbl_status");
            if (statusEl) {
              statusEl.textContent = "Status: Monitoring " + visibleCount + " active processes";
            }
            return;
          }

          const normQ = q.replace(/(.)\\1+/g, "$1");
          const terms = q.split(/\\s+/).filter(Boolean);

          rows.forEach(tr => {
            const text = (tr.textContent || "").toLowerCase();
            const normText = text.replace(/(.)\\1+/g, "$1");
            const pid = tr.getAttribute("data-pid") || "";

            let match = text.includes(q) || normText.includes(normQ) || pid === q;

            if (!match && terms.length > 1) {
              match = terms.every(t => {
                const nt = t.replace(/(.)\\1+/g, "$1");
                return text.includes(t) || normText.includes(nt) || pid.includes(t);
              });
            }

            // Semantic terminal & ghostty alias matching
            if (!match) {
              const isGhostTerm = normQ.includes("ghosty") || normQ.includes("ghostty") || 
                                  normQ.includes("term") || normQ.includes("temrinal") || 
                                  normQ.includes("teminal") || normQ.includes("console") || 
                                  normQ.includes("tty") || normQ.includes("pty");
              if (isGhostTerm && (text.includes("ghostty") || text.includes("ghost") || text.includes("iterm") || text.includes("terminal") || text.includes("warp") || text.includes("alacritty") || text.includes("kitty"))) {
                match = true;
              }
            }

            if (match) {
              tr.style.display = "";
              visibleCount++;
            } else {
              tr.style.display = "none";
            }
          });

          const statusEl = document.getElementById("lbl_status");
          if (statusEl) {
            statusEl.textContent = "Filtered: " + visibleCount + " process(es) matching '" + q + "'";
          }
        };

        filterInput.addEventListener("input", function() {
          window.applyClientSideTableFilter();
        });

        const clearBtn = document.getElementById("btn_clear_filter");
        if (clearBtn) {
          clearBtn.addEventListener("click", function() {
            filterInput.value = "";
            const table = container.querySelector("table");
            const tbody = table ? table.querySelector("tbody") : null;
            if (tbody && window.__masterTableTbodyHtml) {
              tbody.innerHTML = window.__masterTableTbodyHtml;
            }
            window.applyClientSideTableFilter();
          });
        }

        window.applyClientSideTableFilter();
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTaskManagerLiveEngine);
      } else {
        setTimeout(initTaskManagerLiveEngine, 50);
      }
    })();
  `);

  return win;
}

export const createProcessStudio = createTaskTracker;

export interface ServerOptions {
  port?: number;
  host?: string;
}

export function generateTaskManagerHtml(): string {
  const win = createTaskTracker({ fullscreen: false });
  return win.generateHtml();
}

/**
 * Starts an HTTP Web Server for Task Manager Pro Workstation
 * Enables interactive browser testing with browser_subagent and browser access.
 */
export function startTaskManagerServer(options: ServerOptions = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const win = createTaskTracker({ fullscreen: false });

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
      if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(win.generateHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      if (url.pathname === "/api/processes") {
        const procs = fetchProcesses();
        const tel = computeTelemetry(procs);
        return Response.json({ processes: procs, telemetry: tel }, { headers: corsHeaders });
      }

      if (url.pathname === "/api/kill-port" && req.method === "POST") {
        const body = await req.json();
        const rawPort = String(body.port || "").replace(/[^0-9]/g, "");
        if (rawPort) {
          const [out, code] = Sys.exec(`lsof -ti :${rawPort}`);
          if (code === 0 && out.trim()) {
            const pids = out.trim().split("\n").map(s => s.trim()).filter(Boolean);
            let killed = 0;
            for (const p of pids) {
              if (p === "1" || p === String(process.pid)) continue;
              const [, kCode] = Sys.exec(`kill -9 ${p}`);
              if (kCode === 0) killed++;
            }
            return Response.json({ success: true, killed }, { headers: corsHeaders });
          }
        }
        return Response.json({ success: false, killed: 0 }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

if (import.meta.main) {
  if (process.argv.includes("--server") || process.env.SERVER_MODE) {
    const port = Number(process.env.PORT) || 4848;
    const server = startTaskManagerServer({ port, host: "0.0.0.0" });
    console.log(`\n⚡ Task Manager Pro Web Workstation Server running at http://127.0.0.1:${server.port}\n`);
  } else {
    const win = createProcessStudio({ fullscreen: true });
    console.log("⚡ Launching Task Manager & Process Monitor Studio Pro...");
    win.run();
  }
}
