import * as os from "os";
import { writeFileSync } from "fs";
import { basename, extname } from "path";
import { guardLocalRequest } from "../src/localGuard";
import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import {
  type ProcessItem, type SignalName, SIGNALS, parsePsOutput, parseLsofListen, formatMb, formatUptime, stateLabel, groupProcesses, childrenOf,
  descendantsOf, assessSignal, findRogueDevServers, validPort, executablePath, processesToCsv, processesToJson, processesToTsv,
  parseRefreshSeconds,
} from "../src/process_tools";

export type { ProcessItem } from "../src/process_tools";

export interface TelemetrySummary {
  total: number;
  userCount: number;
  systemCount: number;
  topCpuProc?: ProcessItem;
  topMemProc?: ProcessItem;
  portListenersCount: number;
  totalRssMb: number;
  totalCpu: number;
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
  let portMap = new Map<string, string[]>();
  try {
    const [out, code] = Sys.exec("lsof -iTCP -sTCP:LISTEN -n -P");
    if (code === 0 && out) {
      portMap = parseLsofListen(out);
      cachedPortMap = portMap;
      lastPortFetchTime = now;
    }
  } catch {
    // Non-fatal if lsof is restricted or unavailable
  }
  return cachedPortMap.size > 0 ? cachedPortMap : portMap;
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
 * Fetch complete live process list with hardware resource metrics and listening network ports.
 * Includes caching and resilience so rapid searches/clears never yield an empty list.
 */
export function currentUserName(): string {
  try {
    return process.env.USER || os.userInfo().username || "";
  } catch {
    return process.env.USER || "";
  }
}

export function fetchProcesses(): ProcessItem[] {
  if (process.env.SCREENSHOT_MODE === "1") {
    return [
      { pid: "1", ppid: "0", cpu: 0.1, mem: 0.2, rssMb: "12.4 MB", rssKb: 12697, state: "Ss", user: "root", name: "launchd", command: "/sbin/launchd", ports: [], isUserApp: false, isDevServer: false },
      { pid: "210", ppid: "1", cpu: 3.2, mem: 2.8, rssMb: "245.8 MB", rssKb: 251699, state: "Ss", user: "_windowserver", name: "WindowServer", command: "/System/Library/CoreServices/WindowServer", ports: [], isUserApp: false, isDevServer: false },
      { pid: "1042", ppid: "1", cpu: 1.5, mem: 1.4, rssMb: "85.2 MB", rssKb: 87244, state: "S", user: "developer", name: "bun", command: "bun run dev", ports: [":3000"], isUserApp: true, isDevServer: true },
      { pid: "1088", ppid: "1042", cpu: 0.8, mem: 1.1, rssMb: "64.0 MB", rssKb: 65536, state: "S", user: "developer", name: "vite", command: "vite --host 0.0.0.0 --port 5173", ports: [":5173"], isUserApp: true, isDevServer: true },
      { pid: "2045", ppid: "1", cpu: 0.1, mem: 0.5, rssMb: "32.0 MB", rssKb: 32768, state: "S", user: "system", name: "redis-server", command: "redis-server *:6379", ports: [":6379"], isUserApp: false, isDevServer: true },
      { pid: "3012", ppid: "1", cpu: 0.2, mem: 0.8, rssMb: "48.5 MB", rssKb: 49664, state: "S", user: "system", name: "caddy", command: "caddy run --config Caddyfile", ports: [":80", ":443"], isUserApp: false, isDevServer: true },
      { pid: "4099", ppid: "1", cpu: 0.4, mem: 1.2, rssMb: "96.0 MB", rssKb: 98304, state: "S", user: "system", name: "postgres", command: "postgres -D /data/postgres", ports: [":5432"], isUserApp: false, isDevServer: true },
      { pid: "5120", ppid: "1", cpu: 0.6, mem: 1.0, rssMb: "110.0 MB", rssKb: 112640, state: "S", user: "developer", name: "Ghostty", command: "/Applications/Ghostty.app/Contents/MacOS/Ghostty", ports: [], isUserApp: true, isDevServer: false },
      { pid: "6780", ppid: "1", cpu: 2.4, mem: 4.5, rssMb: "520.0 MB", rssKb: 532480, state: "S", user: "developer", name: "Google Chrome", command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ports: [], isUserApp: true, isDevServer: false },
    ].map((p, i) => ({ ...p, uptimeSec: 86400 * (9 - i) + 3600 * i, uptime: formatUptime(86400 * (9 - i) + 3600 * i) }));
  }
  const now = Date.now();
  // Throttle ps execution to at most once per 250ms under rapid typing or clearing
  if (now - lastProcessFetchTime < 250 && cachedProcesses.length > 0) {
    return cachedProcesses;
  }

  const [out, code] = Sys.exec("ps -axo pid,ppid,pcpu,pmem,rss,state,user,etime,command");
  if (code !== 0 || !out || out.trim().length < 50) {
    if (cachedProcesses.length > 0) {
      return cachedProcesses;
    }
    return [];
  }

  const portMap = fetchListeningPortMap();
  const items = parsePsOutput(out, portMap, currentUserName());

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
  let totalCpu = 0;

  for (const p of procs) {
    if (p.isUserApp) userCount++;
    else systemCount++;
    totalRssKb += p.rssKb;
    totalCpu += p.cpu;
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
    totalCpu: Math.round(totalCpu * 10) / 10,
  };
}

/** PIDs actually LISTENing on a TCP port (not clients connected to it, such as a browser). */
export function findListenerPids(port: number): string[] {
  try {
    const r = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`, "-sTCP:LISTEN"], { stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) return [];
    return r.stdout.toString().split("\n").map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
  } catch {
    return [];
  }
}

/** Send a signal number to a numeric pid without going through a shell. */
export function sendRawSignal(pid: string, sigNum: number): { ok: boolean; code: number; err: string } {
  if (!/^\d+$/.test(pid)) return { ok: false, code: -1, err: "invalid pid" };
  try {
    const r = Bun.spawnSync(["kill", `-${sigNum}`, pid], { stdout: "pipe", stderr: "pipe" });
    return { ok: r.exitCode === 0, code: r.exitCode ?? -1, err: r.stderr.toString().trim() };
  } catch (e: any) {
    return { ok: false, code: -1, err: String(e?.message || e) };
  }
}

const TABLE_HEADERS = ["PID", "Name", "Port", "CPU %", "MEM %", "RSS", "User", "State", "Uptime", "Command"];
const GROUP_HEADERS = ["Name", "Processes", "Port", "CPU %", "MEM %", "RSS", "User"];

const procRow = (p: ProcessItem): string[] => [
  p.pid,
  p.name,
  p.ports.length > 0 ? p.ports.join(", ") : "—",
  p.cpu.toFixed(1) + "%",
  p.mem.toFixed(1) + "%",
  p.rssMb,
  p.user,
  p.state,
  p.uptime || "—",
  p.command.length > 70 ? p.command.slice(0, 70) + "..." : p.command,
];

function systemLine(tel: TelemetrySummary): string {
  if (process.env.SCREENSHOT_MODE) {
    return `Load avg: 1.42 / 1.18 / 1.05  |  Cores: 12  |  Process CPU sum: ${tel.totalCpu}%  |  RSS sum: ${(tel.totalRssMb / 1024).toFixed(1)} of 32 GB  |  Mac up 3d 4h`;
  }
  const load = os.loadavg().map((n) => n.toFixed(2)).join(" / ");
  const totalGb = os.totalmem() / 1024 ** 3;
  const rssGb = tel.totalRssMb / 1024;
  const days = Math.floor(os.uptime() / 86400);
  const hrs = Math.floor((os.uptime() % 86400) / 3600);
  return `Load avg: ${load}  |  Cores: ${os.cpus().length}  |  Process CPU sum: ${tel.totalCpu}%  |  RSS sum: ${rssGb.toFixed(1)} of ${totalGb.toFixed(0)} GB  |  Mac up ${days}d ${hrs}h`;
}

export function createTaskTracker(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Task Manager Pro -- macOS Real-Time Process & Resource Monitor", 1200, 1320, {
    appId: "task_manager",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  let currentCategory = "all";
  let activeProcesses = fetchProcesses();
  let selectedPid = activeProcesses[0]?.pid || "1";
  let displayed: ProcessItem[] = activeProcesses;
  let tick = 0;

  const telemetry = computeTelemetry(activeProcesses);
  const ctx = () => ({ selfPid: String(process.pid), parentPid: String(process.ppid), currentUser: currentUserName() });

  // -----------------------------------------------------------------------------------------------
  // 1. Navigation & App Header
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Task Manager Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_refresh", "🔄 Refresh");
  win.addDropdown("dd_autorefresh", ["🚀 Auto: 1s", "⚡ Auto: 2s", "⏱️ Auto: 5s", "⏸️ Auto: Off"], "⚡ Auto: 2s");
  win.addButton("btn_export", "💾 Export List…");
  win.addButton("btn_copy_table", "📋 Copy Table");
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
  win.beginRow();
  win.addLabel("lbl_sysload", systemLine(telemetry));
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
  win.addCheckbox("chk_group", "Group by app", false);
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
  win.addButton("btn_kill_tree", "🌳 Terminate Process Tree");
  win.addButton("btn_kill_group", "🧺 Quit All With Same Name");
  win.addButton("btn_inspect", "🔬 Inspect Details");
  win.addButton("btn_reveal", "📂 Reveal in Finder");
  win.addButton("btn_renice", "🐢 Lower Priority");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_proc_cmd", `Command: ${initialCmd.length > 120 ? initialCmd.slice(0, 120) + "..." : initialCmd}`);
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Live Process Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Live Running Process Table (Click any row to select & inspect)");
  win.addTable("tbl_procs", TABLE_HEADERS, activeProcesses.map(procRow)).size(1140, 380);
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
    updateSelectedProcess(resolveSelection(String(pidVal)));
  });

  // -----------------------------------------------------------------------------------------------
  // Application Logic & Event Callbacks
  // -----------------------------------------------------------------------------------------------

  const logConsole = (message: string, style = 1) => {
    const time = new Date().toLocaleTimeString();
    win.appendConsole("task_console", `[${time}] ${message}\n`, style);
  };

  /** In grouped mode a row is an app name: select its busiest process. */
  function resolveSelection(val: string): string {
    const v = val.trim();
    if (/^\d+$/.test(v)) return v;
    const hit = activeProcesses.filter((p) => p.name === v).sort((a, b) => b.cpu - a.cpu)[0];
    return hit ? hit.pid : v;
  }

  function updateSelectedProcess(pid: string, updateInput = true) {
    selectedPid = pid.trim();
    if (updateInput) {
      win.setValue("txt_target_pid", selectedPid);
    }

    const proc = activeProcesses.find((p) => p.pid === selectedPid);
    if (proc) {
      const portInfo = proc.ports.length ? ` | Ports: ${proc.ports.join(", ")}` : "";
      const devBadge = proc.isDevServer ? " [⚡ Dev Server]" : "";
      const details = `Selected: [${proc.pid}] ${proc.name}${devBadge} | User: ${proc.user} | CPU: ${proc.cpu}% | RAM: ${proc.rssMb} | ${stateLabel(proc.state)}${proc.uptime ? " | Up: " + proc.uptime : ""}${portInfo}`;
      win.setText("lbl_proc_details", details);
      const cmdPreview = proc.command.length > 120 ? proc.command.slice(0, 120) + "..." : proc.command;
      win.setText("lbl_proc_cmd", `Command: ${cmdPreview}`);
    } else {
      win.setText("lbl_proc_details", `Selected PID: ${selectedPid} (Process may have exited)`);
    }
  }

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

  const renderTable = (filtered: ProcessItem[]) => {
    if (win.getBool("chk_group")) {
      const sortVal = win.getValue("dd_sort") || "";
      const groups = groupProcesses(filtered);
      if (sortVal.includes("Name")) groups.sort((a, b) => a.name.localeCompare(b.name));
      else if (sortVal.includes("RAM")) groups.sort((a, b) => b.rssKb - a.rssKb);
      else if (sortVal.includes("Memory")) groups.sort((a, b) => b.mem - a.mem);
      else groups.sort((a, b) => b.cpu - a.cpu);
      win.setTableData("tbl_procs", GROUP_HEADERS, groups.map((g) => [g.name, String(g.count), g.ports.length ? g.ports.join(", ") : "—", g.cpu.toFixed(1) + "%", g.mem.toFixed(1) + "%", formatMb(g.rssKb), g.user]));
    } else {
      win.setTableData("tbl_procs", TABLE_HEADERS, filtered.map(procRow));
    }
  };

  const refreshList = (isSilentTimer = false) => {
    activeProcesses = fetchProcesses();
    const tel = computeTelemetry(activeProcesses);

    // Update telemetry labels
    win.setText("lbl_total_procs", `Total Processes: ${tel.total} (${tel.userCount} User, ${tel.systemCount} Sys)`);
    win.setText("lbl_top_cpu", `Top CPU: ${tel.topCpuProc?.name || "N/A"} (${tel.topCpuProc?.cpu || 0}%)`);
    win.setText("lbl_ports_active", `Active Port Listeners: ${tel.portListenersCount} services`);
    win.setText("lbl_sysload", systemLine(tel));
    win.setStatus(`Monitoring ${tel.total} active processes | Category: ${currentCategory.toUpperCase()}`);

    const filtered = getFilteredProcesses(activeProcesses);
    displayed = filtered;
    renderTable(filtered);

    // Keep inspector updated without stomping user input during timer
    if (selectedPid) {
      updateSelectedProcess(selectedPid, false);
    }

    if (!isSilentTimer) {
      logConsole(`[Telemetry] Refreshed: ${filtered.length} matching processes displayed (Total: ${activeProcesses.length})`, 1);
    }
  };

  const scheduleRefresh = (ms: number) => {
    const t: any = setTimeout(() => refreshList(false), ms);
    t?.unref?.();
  };

  /** Send one signal after safety checks and (when risky) a confirmation. */
  const sendSignalToPid = async (pid: string, signal: SignalName, sigNum: number = SIGNALS[signal]): Promise<boolean> => {
    pid = String(pid || "").trim();
    const proc = activeProcesses.find((p) => p.pid === pid);
    const a = assessSignal(proc, pid, signal, ctx());
    if (!a.allowed) {
      win.toast(`⚠️ ${a.reason}`);
      logConsole(`[Security Warning] ${a.reason}`, 3);
      return false;
    }
    if (a.confirm && !(await win.confirm(a.confirm, "Confirm signal"))) {
      logConsole(`[Signal] Cancelled ${signal} for PID ${pid}`, 1);
      return false;
    }
    const procName = proc ? ` (${proc.name})` : "";
    const r = sendRawSignal(pid, sigNum);
    if (r.ok) {
      logConsole(`[Signal] Successfully sent ${signal} (-${sigNum}) to PID ${pid}${procName}`, 2);
      win.toast(`Signal ${signal} sent to PID ${pid}`);
    } else {
      logConsole(`[Signal Failed] Could not send ${signal} to PID ${pid}${procName}: exit code ${r.code} ${r.err}`, 3);
      win.toast(`Failed to send ${signal} to PID ${pid} (exit ${r.code})`);
    }
    scheduleRefresh(350);
    return r.ok;
  };

  /** SIGTERM several processes after a single confirmation. Returns how many accepted the signal. */
  const terminateMany = async (pids: string[], title: string, signal: SignalName = "SIGTERM"): Promise<number> => {
    const targets: ProcessItem[] = [];
    for (const pid of pids) {
      const proc = activeProcesses.find((p) => p.pid === pid);
      if (!proc) continue;
      if (assessSignal(proc, pid, signal, ctx()).allowed) targets.push(proc);
    }
    if (targets.length === 0) {
      win.toast("Nothing to terminate (protected, or already gone).");
      logConsole(`[${title}] No eligible processes.`, 3);
      return 0;
    }
    const preview = targets.slice(0, 8).map((p) => `${p.name} (${p.pid})`).join(", ") + (targets.length > 8 ? `, and ${targets.length - 8} more` : "");
    if (!(await win.confirm(`${title}: terminate ${targets.length} process(es)?\n\n${preview}`, "Confirm"))) {
      logConsole(`[${title}] Cancelled.`, 1);
      return 0;
    }
    let ok = 0;
    for (const p of targets) {
      const r = sendRawSignal(p.pid, SIGNALS[signal]);
      if (r.ok) {
        ok++;
        logConsole(`[${title}] Sent ${signal} to ${p.name} (PID ${p.pid})`, 2);
      } else {
        logConsole(`[${title}] Failed for ${p.name} (PID ${p.pid}): ${r.err || "exit " + r.code}`, 3);
      }
    }
    win.toast(`Terminated ${ok} of ${targets.length} process(es)`);
    scheduleRefresh(400);
    return ok;
  };

  const targetPid = () => String(win.getValue("txt_target_pid") || selectedPid || "").trim();

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

  // Auto-refresh: a 1s heartbeat honouring the chosen interval (1s / 2s / 5s / off)
  win.addTimer(1000, () => {
    tick++;
    const sec = parseRefreshSeconds(win.getValue("dd_autorefresh") || "Auto: 2s");
    if (sec <= 0 || tick % sec !== 0) return;
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

  win.onChange("chk_group", () => {
    refreshList(true);
  });

  // Target PID manual change
  win.onChange("txt_target_pid", (_, val) => {
    if (val) updateSelectedProcess(String(val), false);
  });

  // Table row click selection
  win.onClick("tbl_procs", (_, pidVal) => {
    if (pidVal) updateSelectedProcess(resolveSelection(String(pidVal)), true);
  });

  // Process Signals
  win.onClick("btn_kill_force", () => sendSignalToPid(targetPid(), "SIGKILL", 9));
  win.onClick("btn_kill_term", () => sendSignalToPid(targetPid(), "SIGTERM", 15));
  win.onClick("btn_kill_stop", () => sendSignalToPid(targetPid(), "SIGSTOP", SIGNALS.SIGSTOP));
  win.onClick("btn_kill_cont", () => sendSignalToPid(targetPid(), "SIGCONT", SIGNALS.SIGCONT));
  win.onClick("btn_kill_hup", () => sendSignalToPid(targetPid(), "SIGHUP", 1));

  win.onClick("btn_kill_tree", async () => {
    const pid = targetPid();
    const proc = activeProcesses.find((p) => p.pid === pid);
    if (!proc) { win.toast("Select a running process first."); return; }
    await terminateMany([...descendantsOf(activeProcesses, pid), pid], `Process tree of ${proc.name}`);
  });

  win.onClick("btn_kill_group", async () => {
    const pid = targetPid();
    const proc = activeProcesses.find((p) => p.pid === pid);
    if (!proc) { win.toast("Select a running process first."); return; }
    const same = activeProcesses.filter((p) => p.name === proc.name && p.user === proc.user).map((p) => p.pid);
    await terminateMany(same, `All "${proc.name}" processes`);
  });

  win.onClick("btn_renice", () => {
    const pid = targetPid();
    const proc = activeProcesses.find((p) => p.pid === pid);
    const a = assessSignal(proc, pid, "SIGHUP", ctx());
    if (!a.allowed) { win.toast(`⚠️ ${a.reason}`); return; }
    if (!proc || proc.user !== ctx().currentUser) { win.toast("You can only lower the priority of your own processes."); return; }
    const r = Bun.spawnSync(["renice", "10", "-p", pid], { stdout: "pipe", stderr: "pipe" });
    if (r.exitCode === 0) {
      logConsole(`[Priority] Lowered priority of ${proc.name} (PID ${pid}) to nice +10`, 2);
      win.toast("Priority lowered");
    } else {
      logConsole(`[Priority] renice failed for PID ${pid}: ${r.stderr.toString().trim()}`, 3);
      win.toast("Could not change priority");
    }
  });

  win.onClick("btn_inspect", () => {
    const pid = targetPid();
    const proc = activeProcesses.find((p) => p.pid === pid);
    if (!proc) { win.toast("Select a running process first."); return; }
    const parent = activeProcesses.find((p) => p.pid === proc.ppid);
    const kids = childrenOf(activeProcesses, pid);
    const lines = [
      `[Inspect] ${proc.name} (PID ${proc.pid})`,
      `  State:    ${stateLabel(proc.state)} (${proc.state})`,
      `  User:     ${proc.user}${proc.isUserApp ? "" : "  (not yours)"}`,
      `  Parent:   ${proc.ppid}${parent ? " " + parent.name : ""}`,
      `  Children: ${kids.length}${kids.length ? " — " + kids.slice(0, 6).map((k) => `${k.name} (${k.pid})`).join(", ") + (kids.length > 6 ? ", …" : "") : ""}`,
      `  Uptime:   ${proc.uptime || "unknown"}`,
      `  CPU/MEM:  ${proc.cpu.toFixed(1)}% / ${proc.mem.toFixed(1)}%  RSS ${proc.rssMb}`,
      `  Ports:    ${proc.ports.length ? proc.ports.join(", ") : "none listening"}`,
    ];
    try {
      const cwd = Bun.spawnSync(["lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().split("\n").find((l) => l.startsWith("n"));
      lines.push(`  Cwd:      ${cwd ? cwd.slice(1) : "unavailable (permission?)"}`);
      const open = Bun.spawnSync(["lsof", "-p", pid], { stdout: "pipe", stderr: "pipe" }).stdout.toString().split("\n").filter(Boolean).length - 1;
      lines.push(`  Open files/sockets: ${open > 0 ? open : "unavailable"}`);
    } catch {
      lines.push("  (lsof unavailable)");
    }
    lines.push(`  Command:  ${proc.command}`);
    logConsole(lines.join("\n"), 1);
  });

  win.onClick("btn_reveal", () => {
    const pid = targetPid();
    const proc = activeProcesses.find((p) => p.pid === pid);
    const path = proc ? executablePath(proc.command) : null;
    if (!path) { win.toast("No file path is known for this process."); return; }
    if (process.platform !== "darwin") { win.toast("Reveal in Finder is only available on macOS."); return; }
    Bun.spawn(["open", "-R", path]);
    logConsole(`[Finder] Revealing ${path}`, 1);
  });

  // Copy PID & Command
  win.onClick("btn_copy_pid", () => {
    const pid = targetPid();
    if (pid) {
      win.copyToClipboard(String(pid));
      win.toast(`Copied PID ${pid} to clipboard`);
      logConsole(`[Clipboard] Copied PID ${pid}`, 1);
    }
  });

  win.onClick("btn_copy_cmd", () => {
    const pid = targetPid();
    const proc = activeProcesses.find((p) => p.pid === pid);
    if (proc?.command) {
      win.copyToClipboard(proc.command);
      win.toast(`Copied command for PID ${pid} to clipboard`);
      logConsole(`[Clipboard] Copied command for PID ${pid}`, 1);
    }
  });

  win.onClick("btn_copy_table", () => {
    if (displayed.length === 0) { win.toast("Nothing to copy."); return; }
    win.copyToClipboard(processesToTsv(displayed));
    win.toast(`Copied ${displayed.length} process row(s) (tab-separated)`);
  });

  win.onClick("btn_export", () => {
    if (displayed.length === 0) { win.toast("Nothing to export."); return; }
    win.saveFile({ title: "Export process list (.csv or .json)", defaultName: "processes.csv" }, (p) => {
      if (!p) return;
      try {
        const json = extname(p).toLowerCase() === ".json";
        writeFileSync(p, json ? processesToJson(displayed) : processesToCsv(displayed), "utf8");
        logConsole(`[Export] Saved ${displayed.length} processes to ${p}`, 2);
        win.toast(`Exported ${basename(p)}`);
      } catch (e: any) {
        logConsole(`[Export Error] ${e.message}`, 3);
      }
    });
  });

  // Kill Port Process (only processes LISTENing on the port, never clients connected to it)
  win.onClick("btn_kill_port", async () => {
    const port = validPort(win.getValue("txt_port") || "3000");
    if (!port) {
      win.toast("Please specify a valid port number (1-65535, e.g. 3000, 8080)");
      return;
    }

    const pids = findListenerPids(port);
    if (pids.length === 0) {
      win.toast(`No process listening on port :${port}`);
      logConsole(`[Port Finder] No active process listening on port :${port}`, 3);
      return;
    }

    const names = pids.map((p) => `${activeProcesses.find((x) => x.pid === p)?.name || "unknown"} (${p})`).join(", ");
    if (!(await win.confirm(`Force-kill ${pids.length} process(es) listening on :${port}?\n\n${names}`, "Kill port process"))) {
      logConsole(`[Kill Port :${port}] Cancelled.`, 1);
      return;
    }

    let killedCount = 0;
    for (const p of pids) {
      if (p === "1" || p === String(process.pid)) continue;
      const r = sendRawSignal(p, 9);
      if (r.ok) {
        killedCount++;
        logConsole(`[Kill Port :${port}] Terminated PID ${p} listening on port :${port}`, 2);
      } else {
        logConsole(`[Kill Port :${port}] Could not kill PID ${p}: ${r.err || "exit " + r.code}`, 3);
      }
    }

    win.toast(`Killed ${killedCount} process(es) on port :${port}`);
    scheduleRefresh(300);
  });

  // Clean Rogue Dev Servers: yours, listening or orphaned, never this app's own process chain
  win.onClick("btn_clean_dev", async () => {
    const rogue = findRogueDevServers(activeProcesses, ctx());

    if (rogue.length === 0) {
      win.toast("No rogue dev servers detected.");
      logConsole("[Dev Server Cleaner] No orphan dev servers found.", 1);
      return;
    }

    const n = await terminateMany(rogue.map((r) => r.pid), "Dev Server Cleaner");
    if (n > 0) logConsole(`[Dev Cleaner] Terminated ${n} dev server(s)`, 2);
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
          const cmd = cells[9]?.textContent?.trim() || "";

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
      const __blocked = guardLocalRequest(req);
      if (__blocked) return __blocked;
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
        const body: any = await req.json();
        const port = validPort(String(body.port || ""));
        if (port) {
          const pids = findListenerPids(port).filter((p) => p !== "1" && p !== String(process.pid));
          let killed = 0;
          for (const p of pids) {
            if (sendRawSignal(p, 9).ok) killed++;
          }
          if (pids.length) return Response.json({ success: true, killed }, { headers: corsHeaders });
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
    const specifiedPort = Number(process.env.PORT);
    let server: any;
    if (specifiedPort) {
      server = startTaskManagerServer({ port: specifiedPort, host: "127.0.0.1" });
    } else {
      try {
        server = startTaskManagerServer({ port: 4848, host: "127.0.0.1" });
      } catch {
        server = startTaskManagerServer({ port: 0, host: "127.0.0.1" });
      }
    }
    console.log(`READY:${server.port}`);
    console.log(`\n⚡ Task Manager Pro Web Workstation Server running at http://127.0.0.1:${server.port}\n`);
  } else {
    const win = createProcessStudio({ fullscreen: true });
    console.log("⚡ Launching Task Manager & Process Monitor Studio Pro...");
    win.run();
  }
}
