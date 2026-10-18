/**
 * Cross-platform Process & Task Manager engine for Codecaine File Manager.
 *
 * Explicitly separates Windows (`win32`) and *nix (`darwin`, `linux`) process discovery,
 * port-to-PID mapping, process tree/group management, priority adjustment, and termination:
 *
 * - Windows (`win32`):
 *   - Discovery: PowerShell CIM (`Get-CimInstance Win32_Process` joined with `Get-Process`) with
 *     automatic fallback to `tasklist /V /FO CSV`.
 *   - Port mapping: `netstat -ano -p tcp` (`LISTENING` sockets).
 *   - Termination: `taskkill /PID <pid>` (graceful), `taskkill /F /PID <pid>` (force),
 *     `taskkill /T /F /PID <pid>` (native Windows process tree termination).
 *   - Priority: PowerShell `(Get-Process -Id <pid>).PriorityClass = 'BelowNormal'`.
 *
 * - *nix (`darwin`, `linux`):
 *   - Discovery: `ps -axo pid,ppid,pcpu,pmem,rss,state,user,etime,command` (with `-eo` fallback).
 *   - Port mapping: `lsof -iTCP -sTCP:LISTEN -n -P` (with Linux `ss -tlnp` fallback).
 *   - Signals: `SIGTERM` (15), `SIGKILL` (9), `SIGSTOP` (17 macOS / 19 Linux),
 *     `SIGCONT` (19 macOS / 18 Linux), `SIGHUP` (1) via `kill -<sig> <pid>`.
 *   - Priority: `renice 10 -p <pid>`.
 */
import * as os from "os";
import * as nodePath from "path";
import type { Platform } from "./fmPaths";

export type TaskActionKind =
  | "terminate"
  | "kill"
  | "suspend"
  | "resume"
  | "reload"
  | "tree"
  | "group"
  | "priority";

export interface TaskActionDescriptor {
  id: TaskActionKind;
  label: string;
  shortLabel: string;
  description: string;
  commandHint: string;
  danger: boolean;
}

export interface TaskPlatformProfile {
  platform: Platform;
  osLabel: string;
  family: "windows" | "unix";
  listMechanism: string;
  portMechanism: string;
  killMechanism: string;
  priorityMechanism: string;
  supportsPosixSignals: boolean;
  supportsSuspendResume: boolean;
  supportsReloadSignal: boolean;
  supportsNativeTreeKill: boolean;
  actions: TaskActionDescriptor[];
}

export interface TaskProcessItem {
  pid: string;
  ppid: string;
  name: string;
  command: string;
  exePath: string | null;
  user: string;
  state: string;
  stateText: string;
  cpu: number;
  mem: number;
  rssKb: number;
  rssMb: string;
  ports: string[];
  uptimeSec?: number;
  uptime: string;
  isUserApp: boolean;
  isDevServer: boolean;
  isCritical: boolean;
  windowTitle?: string;
}

export interface TaskProcessGroup {
  name: string;
  count: number;
  cpu: number;
  mem: number;
  rssKb: number;
  rssMb: string;
  user: string;
  ports: string[];
  pids: string[];
}

export interface TaskTreeRow {
  pid: string;
  ppid: string;
  depth: number;
  hasChildren: boolean;
  process: TaskProcessItem;
}

export interface TaskTelemetry {
  cpuPercent: number;
  cpuCores: number;
  cpuModel: string;
  memUsedBytes: number;
  memTotalBytes: number;
  memPercent: number;
  loadAvg1m: number;
  uptimeSec: number;
  totalProcesses: number;
  listeningPortCount: number;
  devServerCount: number;
}

export interface TaskInspectResult {
  pid: string;
  platform: Platform;
  process: TaskProcessItem | null;
  parent: { pid: string; name: string } | null;
  ancestors: { pid: string; name: string }[];
  children: { pid: string; name: string; cpu: number; rssMb: string }[];
  descendantCount: number;
  cwd: string | null;
  exePath: string | null;
  openFilesCount: number | null;
  openFilesSample: string[];
  ports: string[];
  command: string;
  windowTitle?: string;
  safety: {
    isSelf: boolean;
    isParent: boolean;
    isCritical: boolean;
    canTerminate: boolean;
    reason?: string;
  };
}

export interface TaskCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface TaskManagerHooks {
  /** Override OS command runner for deterministic cross-platform tests. */
  execCommand?: (cmd: string[], platform: Platform) => Promise<TaskCommandResult>;
  /** Override current username. */
  currentUser?: string;
  /** Override this server's PID. */
  selfPid?: string;
  /** Override parent PID. */
  parentPid?: string;
  /** Override total system memory in bytes. */
  totalMemBytes?: number;
  /** Override free system memory in bytes. */
  freeMemBytes?: number;
}

/** Critical processes on *nix that must never be signaled. */
export const NIX_CRITICAL_NAMES = [
  "launchd",
  "kernel_task",
  "windowserver",
  "loginwindow",
  "systemd",
  "init",
  "kthreadd",
  "systemd-journald",
  "systemd-udevd",
];

/** Critical processes on Windows that must never be terminated. */
export const WIN_CRITICAL_NAMES = [
  "system",
  "idle",
  "system idle process",
  "registry",
  "memory compression",
  "smss.exe",
  "smss",
  "csrss.exe",
  "csrss",
  "wininit.exe",
  "wininit",
  "services.exe",
  "services",
  "lsass.exe",
  "lsass",
  "winlogon.exe",
  "winlogon",
  "dwm.exe",
  "dwm",
  "fontdrvhost.exe",
  "fontdrvhost",
  "spoolsv.exe",
  "spoolsv",
  "svchost.exe",
  "svchost",
];

export function isCriticalProcess(name: string, pid: string, platform: Platform): boolean {
  if (pid === "0") return true;
  const lower = (name || "").trim().toLowerCase();
  if (platform === "win32") {
    if (pid === "4") return true;
    return WIN_CRITICAL_NAMES.includes(lower);
  }
  if (pid === "1") return true;
  return NIX_CRITICAL_NAMES.includes(lower);
}

/** POSIX signal numbers by platform (`SIGSTOP` and `SIGCONT` differ between macOS/BSD and Linux). */
export function posixSignalNumber(signal: "SIGTERM" | "SIGKILL" | "SIGSTOP" | "SIGCONT" | "SIGHUP", platform: Platform): number {
  switch (signal) {
    case "SIGHUP":
      return 1;
    case "SIGKILL":
      return 9;
    case "SIGTERM":
      return 15;
    case "SIGSTOP":
      return platform === "linux" ? 19 : 17;
    case "SIGCONT":
      return platform === "linux" ? 18 : 19;
  }
}

export function getTaskPlatformProfile(platform: Platform): TaskPlatformProfile {
  if (platform === "win32") {
    return {
      platform: "win32",
      osLabel: "Windows",
      family: "windows",
      listMechanism: "PowerShell CIM (Win32_Process + Get-Process) / tasklist /V /FO CSV",
      portMechanism: "netstat -ano -p tcp",
      killMechanism: "taskkill (/PID, /F, /T)",
      priorityMechanism: "PowerShell PriorityClass = BelowNormal",
      supportsPosixSignals: false,
      supportsSuspendResume: false,
      supportsReloadSignal: false,
      supportsNativeTreeKill: true,
      actions: [
        {
          id: "terminate",
          label: "End Task",
          shortLabel: "End Task",
          description: "Ask the Windows process to close gracefully via taskkill /PID.",
          commandHint: "taskkill /PID <pid>",
          danger: false,
        },
        {
          id: "kill",
          label: "Force End Task (/F)",
          shortLabel: "Force Kill",
          description: "Immediately terminate the Windows process via taskkill /F /PID.",
          commandHint: "taskkill /F /PID <pid>",
          danger: true,
        },
        {
          id: "tree",
          label: "Kill Process Tree (/T /F)",
          shortLabel: "Kill Tree",
          description: "Terminate the process and all child processes started by it via taskkill /T /F /PID.",
          commandHint: "taskkill /T /F /PID <pid>",
          danger: true,
        },
        {
          id: "group",
          label: "End All Same-Name Tasks",
          shortLabel: "End Group",
          description: "Terminate all running instances sharing this executable name.",
          commandHint: "taskkill /F /PID <pids...>",
          danger: true,
        },
        {
          id: "priority",
          label: "Lower Priority (BelowNormal)",
          shortLabel: "BelowNormal",
          description: "Set Windows process PriorityClass to BelowNormal so background tasks yield CPU.",
          commandHint: "(Get-Process -Id <pid>).PriorityClass = 'BelowNormal'",
          danger: false,
        },
      ],
    };
  }

  const isLinux = platform === "linux";
  const stopNum = posixSignalNumber("SIGSTOP", platform);
  const contNum = posixSignalNumber("SIGCONT", platform);
  return {
    platform,
    osLabel: isLinux ? "Linux" : "macOS",
    family: "unix",
    listMechanism: "ps -axo pid,ppid,pcpu,pmem,rss,state,user,etime,command",
    portMechanism: isLinux ? "lsof -iTCP / ss -tlnp" : "lsof -iTCP -sTCP:LISTEN -n -P",
    killMechanism: "POSIX kill (-15 SIGTERM, -9 SIGKILL, -" + stopNum + " SIGSTOP, -" + contNum + " SIGCONT, -1 SIGHUP)",
    priorityMechanism: "renice 10 -p <pid>",
    supportsPosixSignals: true,
    supportsSuspendResume: true,
    supportsReloadSignal: true,
    supportsNativeTreeKill: false,
    actions: [
      {
        id: "terminate",
        label: "Terminate (SIGTERM)",
        shortLabel: "SIGTERM",
        description: "Send polite POSIX SIGTERM (15) so the process can flush state and exit cleanly.",
        commandHint: "kill -15 <pid>",
        danger: false,
      },
      {
        id: "kill",
        label: "Force Kill (SIGKILL)",
        shortLabel: "SIGKILL",
        description: "Send immediate POSIX SIGKILL (9). Cannot be caught or ignored.",
        commandHint: "kill -9 <pid>",
        danger: true,
      },
      {
        id: "suspend",
        label: `Suspend (SIGSTOP -${stopNum})`,
        shortLabel: "Suspend",
        description: "Pause execution of the process without terminating it.",
        commandHint: `kill -${stopNum} <pid>`,
        danger: true,
      },
      {
        id: "resume",
        label: `Resume (SIGCONT -${contNum})`,
        shortLabel: "Resume",
        description: "Resume a previously suspended (SIGSTOP) process.",
        commandHint: `kill -${contNum} <pid>`,
        danger: false,
      },
      {
        id: "reload",
        label: "Reload Config (SIGHUP)",
        shortLabel: "SIGHUP",
        description: "Send SIGHUP (1) to ask daemons/servers to reload their configuration.",
        commandHint: "kill -1 <pid>",
        danger: false,
      },
      {
        id: "tree",
        label: "Kill Process Tree",
        shortLabel: "Kill Tree",
        description: "Terminate all descendant child processes deepest-first, then the root process.",
        commandHint: "kill -15 <children...> <pid>",
        danger: true,
      },
      {
        id: "group",
        label: "Terminate Same-Name Group",
        shortLabel: "Kill Group",
        description: "Send SIGTERM to every running process with the same application name.",
        commandHint: "kill -15 <group...>",
        danger: true,
      },
      {
        id: "priority",
        label: "Lower Priority (renice +10)",
        shortLabel: "Renice +10",
        description: "Increase nice value to +10 so CPU-heavy jobs yield to interactive apps.",
        commandHint: "renice 10 -p <pid>",
        danger: false,
      },
    ],
  };
}

/** Extract a human-readable process name from a command line or executable path across Windows and *nix. */
export function extractProcessName(command: string, platform: Platform = "darwin"): string {
  const trimmed = (command || "").trim();
  if (!trimmed) return "unknown";

  if (platform === "win32" || /^[A-Za-z]:\\/.test(trimmed) || /^"[A-Za-z]:\\/.test(trimmed)) {
    let token = trimmed;
    if (token.startsWith('"')) {
      const endQuote = token.indexOf('"', 1);
      token = endQuote > 1 ? token.slice(1, endQuote) : token.slice(1);
    } else {
      const exeMatch = /^([A-Za-z]:\\[^\r\n]*?\.exe)\b/i.exec(token);
      token = exeMatch ? exeMatch[1]! : (token.split(/\s+/)[0] ?? token);
    }
    const base = token.split(/[\\/]/).pop() || token;
    return base.replace(/:$/, "") || "unknown";
  }

  const app = /([^/]+)\.app\/Contents\/MacOS\//i.exec(trimmed);
  if (app) return app[1]!;
  let firstToken = trimmed;
  if (firstToken.startsWith('"')) {
    const endQuote = firstToken.indexOf('"', 1);
    firstToken = endQuote > 1 ? firstToken.slice(1, endQuote) : firstToken.slice(1);
  } else {
    firstToken = firstToken.split(/\s+/)[0] || "";
  }
  const baseName = firstToken.split("/").pop() || firstToken;
  return baseName.replace(/:$/, "") || "unknown";
}

/** Best-effort absolute path to the executable or .app bundle for revelar/navigation in File Manager. */
export function executablePath(command: string, platform: Platform = "darwin", explicitExe?: string | null): string | null {
  if (explicitExe && typeof explicitExe === "string" && explicitExe.trim()) {
    const clean = explicitExe.trim();
    if (platform === "win32" ? /^[A-Za-z]:[\\/]/.test(clean) : clean.startsWith("/")) return clean;
  }
  const trimmed = (command || "").trim();
  if (!trimmed) return null;

  if (platform === "win32" || /^[A-Za-z]:\\/.test(trimmed) || /^"[A-Za-z]:\\/.test(trimmed)) {
    if (trimmed.startsWith('"')) {
      const end = trimmed.indexOf('"', 1);
      if (end > 1) {
        const candidate = trimmed.slice(1, end);
        return /^[A-Za-z]:[\\/]/.test(candidate) ? candidate : null;
      }
    }
    const exeMatch = /^([A-Za-z]:[\\/][^\r\n"]*?\.(?:exe|cmd|bat|com|ps1))\b/i.exec(trimmed);
    if (exeMatch) return exeMatch[1]!;
    const first = trimmed.split(/\s+/)[0] || "";
    return /^[A-Za-z]:[\\/]/.test(first) ? first : null;
  }

  const app = /^(\/.*?\.app)\//i.exec(trimmed);
  if (app) return app[1]!;
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 1 && trimmed.slice(1, end).startsWith("/")) return trimmed.slice(1, end);
  }
  const first = trimmed.split(/\s+/)[0] || "";
  return first.startsWith("/") ? first : null;
}

export function isDevServerProcess(command: string, name: string): boolean {
  const hay = `${name} ${command}`.toLowerCase();
  return /\b(bun|node|deno|vite|next|ts-node|tsx|esbuild|webpack|turbopack|python|python3|uvicorn|gunicorn|flask|fastapi|ruby|rails|cargo|rustc|go|redis-server|postgres|mysqld|mongod|docker|caddy|nginx|php|dotnet|java)\b/i.test(hay);
}

/** Parse `ps` elapsed time (`[[dd-]hh:]mm:ss`) to seconds. */
export function parseEtime(s: string): number | undefined {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec((s || "").trim());
  if (!m) return undefined;
  return Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

export function formatUptime(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

export function formatMb(kb: number): string {
  return `${(Math.max(0, kb) / 1024).toFixed(1)} MB`;
}

export function stateLabel(state: string, platform: Platform = "darwin"): string {
  const raw = (state || "?").trim();
  if (platform === "win32") {
    const upper = raw.toUpperCase();
    if (upper === "R" || upper === "RUNNING") return "Running";
    if (upper === "NR" || upper === "NOT RESPONDING") return "Not Responding";
    if (upper === "S" || upper === "SUSPENDED") return "Suspended";
    return raw || "Running";
  }
  const c = (raw[0] || "?").toUpperCase();
  const base: Record<string, string> = {
    R: "Running",
    S: "Sleeping",
    I: "Idle",
    T: "Stopped (suspended)",
    U: "Uninterruptible wait",
    D: "Disk sleep",
    Z: "Zombie",
  };
  return base[c] || raw;
}

function normalizeUserMatch(procUser: string, currentUser: string): boolean {
  if (!procUser || !currentUser) return false;
  const a = procUser.trim().toLowerCase();
  const b = currentUser.trim().toLowerCase();
  if (a === b) return true;
  // Windows DOMAIN\username or MACHINE\username
  const shortA = a.includes("\\") ? a.split("\\").pop()! : a;
  const shortB = b.includes("\\") ? b.split("\\").pop()! : b;
  return Boolean(shortA && shortA === shortB);
}

/** Parse *nix `ps -axo pid,ppid,pcpu,pmem,rss,state,user,etime,command` output. */
export function parsePsOutput(
  out: string,
  portMap: Map<string, string[]>,
  currentUser: string,
  platform: Platform = "darwin",
): TaskProcessItem[] {
  const lines = out.trim().split(/\r?\n/);
  const items: TaskProcessItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 9 || !/^\d+$/.test(parts[0] || "")) continue;
    const pid = parts[0]!;
    const ppid = parts[1] || "0";
    const cpu = parseFloat(parts[2] || "0") || 0;
    const mem = parseFloat(parts[3] || "0") || 0;
    const rssKb = parseInt(parts[4] || "0", 10) || 0;
    const state = parts[5] || "?";
    const user = parts[6] || "";
    const uptimeSec = parseEtime(parts[7] || "");
    const command = parts.slice(8).join(" ");
    const name = extractProcessName(command, platform);
    items.push({
      pid,
      ppid,
      name,
      command,
      exePath: executablePath(command, platform),
      user,
      state,
      stateText: stateLabel(state, platform),
      cpu,
      mem,
      rssKb,
      rssMb: formatMb(rssKb),
      ports: portMap.get(pid) || [],
      uptimeSec,
      uptime: formatUptime(uptimeSec),
      isUserApp: normalizeUserMatch(user, currentUser),
      isDevServer: isDevServerProcess(command, name),
      isCritical: isCriticalProcess(name, pid, platform),
    });
  }
  return items;
}

/** Parse *nix `lsof -iTCP -sTCP:LISTEN -n -P` output into `pid -> [":port"]`. */
export function parseLsofListen(out: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const lines = out.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]?.trim().split(/\s+/) || [];
    if (parts.length < 9) continue;
    const pid = parts[1];
    // Name column may be at index 8 or before "(LISTEN)"
    const addrToken = parts[8]?.replace(/\(LISTEN\)$/i, "") || "";
    const m = /:(\d+)$/.exec(addrToken);
    if (!pid || !/^\d+$/.test(pid) || !m) continue;
    const cur = map.get(pid) || [];
    const port = `:${m[1]}`;
    if (!cur.includes(port)) cur.push(port);
    map.set(pid, cur);
  }
  return map;
}

/** Parse Linux `ss -tlnp` output into `pid -> [":port"]`. */
export function parseSsListen(out: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const lines = out.trim().split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^State\b/i.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    // Local Address:Port is typically column 3 (when State is LISTEN)
    const localAddr = parts[3] || "";
    const portMatch = /:(\d+)$/.exec(localAddr);
    if (!portMatch) continue;
    const port = `:${portMatch[1]}`;
    const pidMatches = line.matchAll(/pid=(\d+)/g);
    for (const pm of pidMatches) {
      const pid = pm[1]!;
      const cur = map.get(pid) || [];
      if (!cur.includes(port)) cur.push(port);
      map.set(pid, cur);
    }
  }
  return map;
}

/**
 * Parse Windows `netstat -ano -p tcp` output into `pid -> [":port"]`.
 * Matches lines in `LISTENING` state, e.g.:
 *   `TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4120`
 *   `TCP    [::1]:8080             [::]:0                 LISTENING       5100`
 */
export function parseWindowsNetstat(out: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const lines = out.trim().split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("TCP")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const proto = parts[0]!.toUpperCase();
    const localAddr = parts[1] || "";
    const state = parts[3]!.toUpperCase();
    const pid = parts[4] || "";
    if (proto !== "TCP" || state !== "LISTENING" || !/^\d+$/.test(pid) || pid === "0") continue;
    const portMatch = /:(\d+)$/.exec(localAddr);
    if (!portMatch) continue;
    const port = `:${portMatch[1]}`;
    const cur = map.get(pid) || [];
    if (!cur.includes(port)) cur.push(port);
    map.set(pid, cur);
  }
  return map;
}

/**
 * Parse Windows PowerShell CIM / Get-Process JSON snapshot into `TaskProcessItem[]`.
 */
export function parseWindowsProcessJson(
  jsonText: string,
  portMap: Map<string, string[]>,
  currentUser: string,
  totalMemBytes: number,
): TaskProcessItem[] {
  const trimmed = (jsonText || "").trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  const items: TaskProcessItem[] = [];
  const safeTotalMem = totalMemBytes > 0 ? totalMemBytes : 8 * 1024 * 1024 * 1024;

  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, any>;
    const rawPid = r.ProcessId ?? r.Id ?? r.pid;
    if (rawPid === undefined || rawPid === null) continue;
    const pid = String(rawPid).trim();
    if (!/^\d+$/.test(pid)) continue;
    const ppid = String(r.ParentProcessId ?? r.ppid ?? 0).trim();
    const rawName = String(r.Name ?? r.ProcessName ?? "").trim();
    const exe = typeof r.ExecutablePath === "string" && r.ExecutablePath.trim() ? r.ExecutablePath.trim() : typeof r.Path === "string" && r.Path.trim() ? r.Path.trim() : null;
    const cmdLine = typeof r.CommandLine === "string" && r.CommandLine.trim() ? r.CommandLine.trim() : exe || rawName || "unknown";
    const name = rawName ? rawName : extractProcessName(cmdLine, "win32");
    const wsBytes = Number(r.WorkingSetSize ?? r.WorkingSet64 ?? r.WS ?? 0) || 0;
    const rssKb = Math.max(0, Math.round(wsBytes / 1024));
    const mem = Math.round(((wsBytes / safeTotalMem) * 100) * 10) / 10;
    const cpu = Math.round((Number(r.CpuPercent ?? r.CPU ?? 0) || 0) * 10) / 10;
    const responding = r.Responding !== false;
    const state = responding ? "R" : "NR";
    const user = String(r.UserName ?? r.Owner ?? currentUser ?? "SYSTEM").trim() || "SYSTEM";
    const uptimeSec = Number.isFinite(Number(r.ElapsedSeconds)) && Number(r.ElapsedSeconds) >= 0 ? Math.floor(Number(r.ElapsedSeconds)) : undefined;
    const winTitle = typeof r.MainWindowTitle === "string" && r.MainWindowTitle.trim() ? r.MainWindowTitle.trim() : undefined;

    items.push({
      pid,
      ppid,
      name,
      command: cmdLine,
      exePath: executablePath(cmdLine, "win32", exe),
      user,
      state,
      stateText: stateLabel(state, "win32"),
      cpu,
      mem,
      rssKb,
      rssMb: formatMb(rssKb),
      ports: portMap.get(pid) || [],
      uptimeSec,
      uptime: formatUptime(uptimeSec),
      isUserApp: normalizeUserMatch(user, currentUser),
      isDevServer: isDevServerProcess(cmdLine, name),
      isCritical: isCriticalProcess(name, pid, "win32"),
      ...(winTitle ? { windowTitle: winTitle } : {}),
    });
  }
  return items;
}

/** Parse a single CSV line respecting quotes (`"a","b ""c""","d"`). */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Fallback parser for Windows `tasklist /V /FO CSV`.
 * Columns: `"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"`
 */
export function parseWindowsTasklistCsv(
  csvText: string,
  portMap: Map<string, string[]>,
  currentUser: string,
  totalMemBytes: number,
): TaskProcessItem[] {
  const lines = (csvText || "").trim().split(/\r?\n/);
  const items: TaskProcessItem[] = [];
  const safeTotalMem = totalMemBytes > 0 ? totalMemBytes : 8 * 1024 * 1024 * 1024;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const cols = parseCsvRow(line);
    if (cols.length < 5) continue;
    const imageName = (cols[0] || "").trim();
    const pid = (cols[1] || "").trim();
    if (i === 0 && (imageName.toLowerCase() === "image name" || !/^\d+$/.test(pid))) continue;
    if (!/^\d+$/.test(pid)) continue;

    // Mem Usage looks like "45,120 K"
    const memRaw = (cols[4] || "").replace(/[^0-9]/g, "");
    const rssKb = parseInt(memRaw || "0", 10) || 0;
    const mem = Math.round((((rssKb * 1024) / safeTotalMem) * 100) * 10) / 10;
    const statusRaw = (cols[5] || "Running").trim();
    const state = /not responding/i.test(statusRaw) ? "NR" : "R";
    const userRaw = (cols[6] || "").trim();
    const user = userRaw && !/^n\/a$/i.test(userRaw) ? userRaw : "SYSTEM";
    const cpuTimeRaw = (cols[7] || "").trim();
    const uptimeSec = parseEtime(cpuTimeRaw);
    const windowTitleRaw = (cols[8] || "").trim();
    const windowTitle = windowTitleRaw && !/^n\/a$/i.test(windowTitleRaw) ? windowTitleRaw : undefined;

    items.push({
      pid,
      ppid: "0",
      name: imageName || "unknown",
      command: imageName || "unknown",
      exePath: null,
      user,
      state,
      stateText: stateLabel(state, "win32"),
      cpu: 0,
      mem,
      rssKb,
      rssMb: formatMb(rssKb),
      ports: portMap.get(pid) || [],
      uptimeSec,
      uptime: formatUptime(uptimeSec),
      isUserApp: normalizeUserMatch(user, currentUser),
      isDevServer: isDevServerProcess(imageName, imageName),
      isCritical: isCriticalProcess(imageName, pid, "win32"),
      ...(windowTitle ? { windowTitle } : {}),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Grouping, Tree, Filtering, and Safety
// ---------------------------------------------------------------------------

export function groupProcesses(procs: TaskProcessItem[]): TaskProcessGroup[] {
  const map = new Map<string, TaskProcessItem[]>();
  for (const p of procs) {
    const l = map.get(p.name) || [];
    l.push(p);
    map.set(p.name, l);
  }
  const out: TaskProcessGroup[] = [];
  for (const [name, list] of map) {
    const sorted = [...list].sort((a, b) => b.cpu - a.cpu || b.rssKb - a.rssKb);
    const rssKb = list.reduce((a, p) => a + p.rssKb, 0);
    out.push({
      name,
      count: list.length,
      cpu: Math.round(list.reduce((a, p) => a + p.cpu, 0) * 10) / 10,
      mem: Math.round(list.reduce((a, p) => a + p.mem, 0) * 10) / 10,
      rssKb,
      rssMb: formatMb(rssKb),
      user: sorted[0]!.user,
      ports: [...new Set(list.flatMap((p) => p.ports))],
      pids: sorted.map((p) => p.pid),
    });
  }
  return out;
}

export function childrenOf(procs: TaskProcessItem[], pid: string): TaskProcessItem[] {
  return procs.filter((p) => p.ppid === pid && p.pid !== pid);
}

/** All descendants of `pid`, deepest first (safe to kill in order on *nix). Cycle-safe. */
export function descendantsOf(procs: TaskProcessItem[], pid: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const p of procs) {
    if (p.pid === p.ppid) continue;
    const l = byParent.get(p.ppid) || [];
    l.push(p.pid);
    byParent.set(p.ppid, l);
  }
  const order: string[] = [];
  const seen = new Set<string>([pid]);
  const queue = [pid];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of byParent.get(cur) || []) {
      if (seen.has(child)) continue;
      seen.add(child);
      order.push(child);
      queue.push(child);
    }
  }
  return order.reverse();
}

/** Ancestor PIDs of `pid` (parent, grandparent, ...), stopping at 0 or cycle. */
export function ancestorsOf(procs: TaskProcessItem[], pid: string): string[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const out: string[] = [];
  const seen = new Set<string>([pid]);
  let cur = byPid.get(pid)?.ppid;
  while (cur && cur !== "0" && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = byPid.get(cur)?.ppid;
  }
  return out;
}

/** Build a depth-indented process tree from a list of processes. */
export function buildProcessTree(procs: TaskProcessItem[]): TaskTreeRow[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const childrenMap = new Map<string, TaskProcessItem[]>();
  const roots: TaskProcessItem[] = [];

  for (const p of procs) {
    if (p.pid !== p.ppid && byPid.has(p.ppid)) {
      const list = childrenMap.get(p.ppid) || [];
      list.push(p);
      childrenMap.set(p.ppid, list);
    } else {
      roots.push(p);
    }
  }

  const sortFn = (a: TaskProcessItem, b: TaskProcessItem) => b.cpu - a.cpu || b.rssKb - a.rssKb || Number(a.pid) - Number(b.pid);
  roots.sort(sortFn);
  for (const list of childrenMap.values()) list.sort(sortFn);

  const out: TaskTreeRow[] = [];
  const visited = new Set<string>();
  const walk = (node: TaskProcessItem, depth: number) => {
    if (visited.has(node.pid)) return;
    visited.add(node.pid);
    const kids = childrenMap.get(node.pid) || [];
    out.push({
      pid: node.pid,
      ppid: node.ppid,
      depth,
      hasChildren: kids.length > 0,
      process: node,
    });
    for (const k of kids) walk(k, Math.min(depth + 1, 12));
  };

  for (const r of roots) walk(r, 0);
  for (const p of procs) if (!visited.has(p.pid)) walk(p, 0);
  return out;
}

export interface TaskSafetyContext {
  platform: Platform;
  selfPid: string;
  parentPid: string;
  currentUser: string;
}

export interface TaskActionAssessment {
  allowed: boolean;
  reason?: string;
  confirm?: string;
}

export function assessTaskAction(
  proc: TaskProcessItem | undefined,
  pid: string,
  action: TaskActionKind,
  ctx: TaskSafetyContext,
): TaskActionAssessment {
  if (!/^\d+$/.test(pid) || pid === "0") {
    return { allowed: false, reason: "Please choose a valid numeric process ID (PID)." };
  }
  if (pid === ctx.selfPid) {
    return { allowed: false, reason: "Refusing to stop the File Manager's own server process." };
  }
  if (ctx.platform === "win32" && pid === "4") {
    return { allowed: false, reason: "Refusing to terminate PID 4 (Windows System kernel process)." };
  }
  if (ctx.platform !== "win32" && pid === "1") {
    return { allowed: false, reason: "Refusing to signal PID 1 (launchd/systemd/init)." };
  }
  if (proc && isCriticalProcess(proc.name, pid, ctx.platform)) {
    return {
      allowed: false,
      reason: `Refusing to modify ${proc.name} (PID ${pid}): it is a protected ${ctx.platform === "win32" ? "Windows" : "system"} operating system process.`,
    };
  }
  if (ctx.platform === "win32" && (action === "suspend" || action === "resume" || action === "reload")) {
    return {
      allowed: false,
      reason: `POSIX signal action "${action}" is not supported on Windows. Use End Task, Force End Task (/F), Kill Process Tree (/T /F), or Lower Priority instead.`,
    };
  }

  if (action === "priority") {
    return { allowed: true };
  }

  const label = proc ? `${proc.name} (PID ${pid})` : `PID ${pid}`;
  const notes: string[] = [];
  if (!proc) {
    notes.push("Process details could not be verified in the current snapshot.");
  }
  if (pid === ctx.parentPid) {
    notes.push("This is the parent process that launched the File Manager window.");
  }
  if (proc && !proc.isUserApp) {
    notes.push(`It belongs to "${proc.user}", not "${ctx.currentUser}". Stopping system processes may require administrator privileges or affect stability.`);
  }
  if (proc && proc.ports.length > 0) {
    notes.push(`It is listening on ${proc.ports.join(", ")}.`);
  }

  const alwaysConfirm = action === "kill" || action === "suspend" || action === "tree" || action === "group";
  if (alwaysConfirm || notes.length > 0) {
    const verb =
      action === "kill"
        ? ctx.platform === "win32"
          ? "force-terminate (taskkill /F)"
          : "force-kill (SIGKILL)"
        : action === "tree"
          ? ctx.platform === "win32"
            ? "kill the entire process tree (taskkill /T /F) of"
            : "terminate the entire process tree of"
          : action === "group"
            ? `terminate all processes named "${proc?.name ?? label}" including`
            : action === "suspend"
              ? "suspend (SIGSTOP)"
              : action === "terminate"
                ? ctx.platform === "win32"
                  ? "end task (taskkill) for"
                  : "terminate (SIGTERM)"
                : `run ${action} on`;
    return {
      allowed: true,
      confirm: `Are you sure you want to ${verb} ${label}?${notes.length ? "\n\n" + notes.join("\n") : ""}`,
    };
  }
  return { allowed: true };
}

/** Rogue dev servers: user-owned dev server processes that are listening on a port or orphaned, excluding our own process tree. */
export function findRogueDevServers(procs: TaskProcessItem[], ctx: TaskSafetyContext): TaskProcessItem[] {
  const protectedPids = new Set<string>([
    ctx.selfPid,
    ctx.parentPid,
    ...ancestorsOf(procs, ctx.selfPid),
    ...descendantsOf(procs, ctx.selfPid),
  ]);
  return procs.filter(
    (p) =>
      p.isDevServer &&
      p.isUserApp &&
      !protectedPids.has(p.pid) &&
      !p.isCritical &&
      (p.ports.length > 0 || (ctx.platform !== "win32" && p.ppid === "1")),
  );
}

/**
 * Multi-token search query matcher supporting:
 * - `:3000` (port match)
 * - `pid:1234`
 * - `user:root`
 * - `cpu>10`, `mem>5`, `rss>100`
 * - free text across name, command, pid, user, ports, windowTitle
 */
export function matchesTaskQuery(p: TaskProcessItem, rawQuery: string): boolean {
  const q = (rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok.startsWith(":")) {
      if (!p.ports.some((port) => port.toLowerCase().includes(tok))) return false;
      continue;
    }
    if (tok.startsWith("pid:")) {
      const want = tok.slice(4);
      if (!p.pid.includes(want)) return false;
      continue;
    }
    if (tok.startsWith("user:")) {
      const want = tok.slice(5);
      if (!p.user.toLowerCase().includes(want)) return false;
      continue;
    }
    const cmp = /^(cpu|mem|rss)([<>]=?|=)(\d+(?:\.\d+)?)$/.exec(tok);
    if (cmp) {
      const metric = cmp[1]!;
      const op = cmp[2]!;
      const threshold = parseFloat(cmp[3]!);
      const actual = metric === "cpu" ? p.cpu : metric === "mem" ? p.mem : p.rssKb / 1024;
      if (op === ">" && !(actual > threshold)) return false;
      if (op === ">=" && !(actual >= threshold)) return false;
      if (op === "<" && !(actual < threshold)) return false;
      if (op === "<=" && !(actual <= threshold)) return false;
      if (op === "=" && Math.abs(actual - threshold) > 0.05) return false;
      continue;
    }
    const hay = `${p.name} ${p.pid} ${p.user} ${p.ports.join(" ")} ${p.command} ${p.windowTitle ?? ""}`.toLowerCase();
    if (!hay.includes(tok)) return false;
  }
  return true;
}

export function validPort(raw: unknown): number | null {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : null;
}

// ---------------------------------------------------------------------------
// Export Helpers (CSV, JSON, TSV, Markdown)
// ---------------------------------------------------------------------------

function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function processesToCsv(procs: TaskProcessItem[]): string {
  const head = ["pid", "ppid", "name", "user", "state", "cpu_percent", "mem_percent", "rss_mb", "uptime", "ports", "command"];
  const rows = procs.map((p) => [
    p.pid,
    p.ppid,
    p.name,
    p.user,
    p.stateText,
    p.cpu.toFixed(1),
    p.mem.toFixed(1),
    (p.rssKb / 1024).toFixed(1),
    p.uptime || "",
    p.ports.join(" "),
    p.command,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function processesToJson(procs: TaskProcessItem[], meta: Record<string, unknown> = {}): string {
  return (
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...meta,
        count: procs.length,
        processes: procs.map((p) => ({
          pid: p.pid,
          ppid: p.ppid,
          name: p.name,
          user: p.user,
          state: p.state,
          stateText: p.stateText,
          cpu: p.cpu,
          mem: p.mem,
          rssMb: Math.round((p.rssKb / 1024) * 10) / 10,
          uptime: p.uptime,
          ports: p.ports,
          exePath: p.exePath,
          command: p.command,
          ...(p.windowTitle ? { windowTitle: p.windowTitle } : {}),
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

export function processesToTsv(procs: TaskProcessItem[]): string {
  const head = ["PID", "PPID", "Name", "Ports", "CPU %", "MEM %", "RSS", "User", "State", "Uptime", "Command"].join("\t");
  return (
    head +
    "\n" +
    procs
      .map((p) =>
        [
          p.pid,
          p.ppid,
          p.name,
          p.ports.join(" "),
          p.cpu.toFixed(1),
          p.mem.toFixed(1),
          p.rssMb,
          p.user,
          p.stateText,
          p.uptime || "",
          p.command.replace(/[\t\r\n]/g, " "),
        ].join("\t"),
      )
      .join("\n") +
    "\n"
  );
}

export function processesToMarkdown(procs: TaskProcessItem[], platform: Platform): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const lines = [
    `# Process & Task Snapshot (${platform})`,
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Total Processes: ${procs.length}`,
    "",
    "| PID | PPID | Name | User | State | CPU % | MEM % | RSS | Ports | Command |",
    "| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
  ];
  for (const p of procs) {
    lines.push(
      `| ${p.pid} | ${p.ppid} | ${esc(p.name)} | ${esc(p.user)} | ${esc(p.stateText)} | ${p.cpu.toFixed(1)} | ${p.mem.toFixed(1)} | ${p.rssMb} | ${esc(p.ports.join(" "))} | ${esc(p.command.slice(0, 140))} |`,
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// OS Command Execution & Platform Dispatchers
// ---------------------------------------------------------------------------

export async function defaultExecCommand(cmd: string[], _platform: Platform): Promise<TaskCommandResult> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      windowsHide: true,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  } catch (err: any) {
    return { exitCode: 1, stdout: "", stderr: String(err?.message ?? err) };
  }
}

/** PowerShell script for Windows process listing with CIM parent PIDs, command lines, CPU/memory, and window titles. */
export const WINDOWS_PS_SNAPSHOT_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$procs = Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64, Responding, MainWindowTitle, Path, StartTime",
  "$cimMap = @{}",
  "Get-CimInstance Win32_Process | ForEach-Object { $cimMap[[int]$_.ProcessId] = $_ }",
  "$now = Get-Date",
  "$out = foreach ($p in $procs) {",
  "  $c = $cimMap[[int]$p.Id]",
  "  $elapsed = if ($p.StartTime) { [int]($now - $p.StartTime).TotalSeconds } else { $null }",
  "  [PSCustomObject]@{",
  "    ProcessId = $p.Id",
  "    ParentProcessId = if ($c) { $c.ParentProcessId } else { 0 }",
  "    Name = if ($c -and $c.Name) { $c.Name } else { $p.ProcessName }",
  "    ExecutablePath = if ($p.Path) { $p.Path } elseif ($c) { $c.ExecutablePath } else { $null }",
  "    CommandLine = if ($c -and $c.CommandLine) { $c.CommandLine } elseif ($p.Path) { $p.Path } else { $p.ProcessName }",
  "    WorkingSetSize = $p.WorkingSet64",
  "    CPU = if ($null -ne $p.CPU) { [math]::Round($p.CPU, 1) } else { 0 }",
  "    Responding = $p.Responding",
  "    MainWindowTitle = $p.MainWindowTitle",
  "    ElapsedSeconds = $elapsed",
  "  }",
  "}",
  "$out | ConvertTo-Json -Compress",
].join("; ");

/** Build the OS command to execute a single process action on Windows vs *nix. */
export function buildProcessActionCommand(
  platform: Platform,
  action: "terminate" | "kill" | "suspend" | "resume" | "reload" | "tree" | "priority",
  pid: string,
): string[] {
  if (!/^\d+$/.test(pid) || pid === "0") {
    throw new Error(`Invalid PID: ${pid}`);
  }
  if (platform === "win32") {
    switch (action) {
      case "terminate":
        return ["taskkill", "/PID", pid];
      case "kill":
        return ["taskkill", "/F", "/PID", pid];
      case "tree":
        return ["taskkill", "/T", "/F", "/PID", pid];
      case "priority":
        return [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$p = Get-Process -Id ${pid} -ErrorAction Stop; $p.PriorityClass = 'BelowNormal'`,
        ];
      default:
        throw new Error(`Unsupported Windows action: ${action}`);
    }
  }

  switch (action) {
    case "terminate":
      return ["kill", `-${posixSignalNumber("SIGTERM", platform)}`, pid];
    case "kill":
      return ["kill", `-${posixSignalNumber("SIGKILL", platform)}`, pid];
    case "suspend":
      return ["kill", `-${posixSignalNumber("SIGSTOP", platform)}`, pid];
    case "resume":
      return ["kill", `-${posixSignalNumber("SIGCONT", platform)}`, pid];
    case "reload":
      return ["kill", `-${posixSignalNumber("SIGHUP", platform)}`, pid];
    case "priority":
      return ["renice", "10", "-p", pid];
    case "tree":
      return ["kill", `-${posixSignalNumber("SIGTERM", platform)}`, pid];
  }
}

/** Collect listening TCP ports mapped by PID (`pid -> [":port"]`) on Windows or *nix. */
export async function collectPortMap(
  platform: Platform,
  exec: (cmd: string[], platform: Platform) => Promise<TaskCommandResult>,
): Promise<Map<string, string[]>> {
  if (platform === "win32") {
    const res = await exec(["netstat", "-ano", "-p", "tcp"], platform);
    return parseWindowsNetstat(res.stdout);
  }
  const lsofRes = await exec(["lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P"], platform);
  const map = parseLsofListen(lsofRes.stdout);
  if (map.size === 0 && platform === "linux") {
    const ssRes = await exec(["ss", "-tlnp"], platform);
    return parseSsListen(ssRes.stdout);
  }
  return map;
}

/** Collect all running processes and system telemetry across Windows (`win32`), macOS (`darwin`), and Linux (`linux`). */
export async function collectTaskSnapshot(
  platform: Platform,
  hooks: TaskManagerHooks = {},
): Promise<{
  platform: Platform;
  profile: TaskPlatformProfile;
  processes: TaskProcessItem[];
  telemetry: TaskTelemetry;
  selfPid: string;
  parentPid: string;
  currentUser: string;
}> {
  const exec = hooks.execCommand ?? defaultExecCommand;
  const currentUser =
    hooks.currentUser ??
    (() => {
      try {
        return os.userInfo().username;
      } catch {
        return process.env.USER || process.env.USERNAME || "user";
      }
    })();
  const selfPid = hooks.selfPid ?? String(process.pid);
  const parentPid = hooks.parentPid ?? String(process.env.STUDIO_PARENT_PID || process.ppid || "");
  const totalMemBytes = hooks.totalMemBytes ?? os.totalmem();
  const freeMemBytes = hooks.freeMemBytes ?? os.freemem();

  const portMap = await collectPortMap(platform, exec);
  let processes: TaskProcessItem[] = [];

  if (platform === "win32") {
    const psRes = await exec(
      ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_PS_SNAPSHOT_SCRIPT],
      platform,
    );
    processes = parseWindowsProcessJson(psRes.stdout, portMap, currentUser, totalMemBytes);
    if (processes.length === 0) {
      const tlRes = await exec(["tasklist", "/V", "/FO", "CSV"], platform);
      processes = parseWindowsTasklistCsv(tlRes.stdout, portMap, currentUser, totalMemBytes);
    }
  } else {
    let psRes = await exec(["ps", "-axo", "pid,ppid,pcpu,pmem,rss,state,user,etime,command"], platform);
    if (psRes.exitCode !== 0 || !psRes.stdout.trim()) {
      psRes = await exec(["ps", "-eo", "pid,ppid,pcpu,pmem,rss,stat,user,etime,args"], platform);
    }
    processes = parsePsOutput(psRes.stdout, portMap, currentUser, platform);
  }

  const cpus = os.cpus();
  const cpuCores = Math.max(1, cpus.length);
  const cpuModel = (cpus[0]?.model || "CPU").trim();
  const totalProcCpu = processes.reduce((acc, p) => acc + p.cpu, 0);
  const cpuPercent = Math.min(100, Math.round((totalProcCpu / cpuCores) * 10) / 10);
  const memUsedBytes = Math.max(0, totalMemBytes - freeMemBytes);
  const memPercent = totalMemBytes > 0 ? Math.round((memUsedBytes / totalMemBytes) * 1000) / 10 : 0;
  const loadAvg1m = Math.round((os.loadavg()[0] ?? 0) * 100) / 100;

  let listeningPortCount = 0;
  for (const ports of portMap.values()) listeningPortCount += ports.length;
  const devServerCount = processes.filter((p) => p.isDevServer).length;

  return {
    platform,
    profile: getTaskPlatformProfile(platform),
    processes,
    telemetry: {
      cpuPercent,
      cpuCores,
      cpuModel,
      memUsedBytes,
      memTotalBytes: totalMemBytes,
      memPercent,
      loadAvg1m,
      uptimeSec: Math.floor(os.uptime()),
      totalProcesses: processes.length,
      listeningPortCount,
      devServerCount,
    },
    selfPid,
    parentPid,
    currentUser,
  };
}

/** Deep-inspect a single PID on Windows or *nix. */
export async function inspectTaskProcess(
  pid: string,
  platform: Platform,
  hooks: TaskManagerHooks = {},
): Promise<TaskInspectResult> {
  if (!/^\d+$/.test(pid) || pid === "0") {
    throw new Error(`Invalid PID: ${pid}`);
  }
  const exec = hooks.execCommand ?? defaultExecCommand;
  const snap = await collectTaskSnapshot(platform, hooks);
  const proc = snap.processes.find((p) => p.pid === pid) ?? null;
  const byPid = new Map(snap.processes.map((p) => [p.pid, p]));

  const parentProc = proc && proc.ppid && proc.ppid !== "0" ? byPid.get(proc.ppid) : undefined;
  const parent = proc && proc.ppid && proc.ppid !== "0" ? { pid: proc.ppid, name: parentProc?.name ?? "unknown" } : null;
  const ancestors = ancestorsOf(snap.processes, pid).map((aPid) => ({
    pid: aPid,
    name: byPid.get(aPid)?.name ?? "unknown",
  }));
  const children = childrenOf(snap.processes, pid)
    .sort((a, b) => b.cpu - a.cpu)
    .map((c) => ({ pid: c.pid, name: c.name, cpu: c.cpu, rssMb: c.rssMb }));
  const descendantCount = descendantsOf(snap.processes, pid).length;

  let cwd: string | null = null;
  let openFilesCount: number | null = null;
  let openFilesSample: string[] = [];
  let exePath = proc?.exePath ?? null;

  if (platform === "win32") {
    if (exePath) {
      cwd = nodePath.win32.dirname(exePath);
    }
  } else {
    const cwdRes = await exec(["lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"], platform);
    const cwdLine = cwdRes.stdout
      .split(/\r?\n/)
      .find((l) => l.startsWith("n/"));
    if (cwdLine) cwd = cwdLine.slice(1).trim();

    const filesRes = await exec(["lsof", "-p", pid, "-Fn"], platform);
    if (filesRes.exitCode === 0 && filesRes.stdout.trim()) {
      const files = filesRes.stdout
        .split(/\r?\n/)
        .filter((l) => l.startsWith("n/"))
        .map((l) => l.slice(1).trim());
      openFilesCount = files.length;
      openFilesSample = [...new Set(files)].slice(0, 12);
    }
  }

  const safetyCtx: TaskSafetyContext = {
    platform,
    selfPid: snap.selfPid,
    parentPid: snap.parentPid,
    currentUser: snap.currentUser,
  };
  const check = assessTaskAction(proc ?? undefined, pid, "terminate", safetyCtx);

  return {
    pid,
    platform,
    process: proc,
    parent,
    ancestors,
    children,
    descendantCount,
    cwd,
    exePath,
    openFilesCount,
    openFilesSample,
    ports: proc?.ports ?? [],
    command: proc?.command ?? "",
    ...(proc?.windowTitle ? { windowTitle: proc.windowTitle } : {}),
    safety: {
      isSelf: pid === snap.selfPid,
      isParent: pid === snap.parentPid,
      isCritical: proc ? proc.isCritical : isCriticalProcess("", pid, platform),
      canTerminate: check.allowed,
      ...(check.reason ? { reason: check.reason } : {}),
    },
  };
}
