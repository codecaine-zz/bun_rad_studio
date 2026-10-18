/**
 * Task Manager helpers: process parsing, grouping, process-tree math, safety assessment for signals,
 * uptime formatting and export. Pure functions (no GUI, no subprocesses).
 */

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
  uptimeSec?: number;
  uptime?: string;
}

export const SIGNALS = {
  SIGKILL: 9,
  SIGTERM: 15,
  // Numbers differ by OS: macOS/BSD STOP=17 CONT=19, Linux STOP=19 CONT=18.
  SIGSTOP: process.platform === "linux" ? 19 : 17,
  SIGCONT: process.platform === "linux" ? 18 : 19,
  SIGHUP: 1,
} as const;
export type SignalName = keyof typeof SIGNALS;

/** Processes that must never be signaled: stopping or killing them logs you out or freezes the machine. */
export const CRITICAL_NAMES = ["launchd", "kernel_task", "WindowServer", "loginwindow", "systemd", "init"];

/** Human-readable name: the app name for .app bundles, otherwise the executable's base name. */
export function extractProcessName(command: string): string {
  if (!command) return "unknown";
  const app = /([^/]+)\.app\/Contents\/MacOS\//i.exec(command);
  if (app) return app[1]!;
  const firstToken = command.trim().split(/\s+/)[0] || "";
  const baseName = firstToken.split("/").pop() || firstToken;
  return baseName.replace(/:$/, "") || "unknown";
}

export function isDevServerProcess(command: string, name: string): boolean {
  const hay = (name + " " + command).toLowerCase();
  return /\b(bun|node|deno|vite|next|ts-node|tsx|esbuild|webpack|turbopack|python|python3|uvicorn|gunicorn|flask|fastapi|ruby|rails|cargo|rustc|go|redis-server|postgres|mysqld|mongod|docker|caddy|nginx)\b/i.test(hay);
}

/** Parse `ps` elapsed time ([[dd-]hh:]mm:ss) to seconds. Returns undefined when it cannot be parsed. */
export function parseEtime(s: string): number | undefined {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec((s || "").trim());
  if (!m) return undefined;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + Number(m[3]) * 60 + Number(m[4]);
}

export function formatUptime(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

export function formatMb(kb: number): string {
  return (kb / 1024).toFixed(1) + " MB";
}

/** Parse `ps -axo pid,ppid,pcpu,pmem,rss,state,user,etime,command` output. */
export function parsePsOutput(out: string, portMap: Map<string, string[]>, currentUser: string): ProcessItem[] {
  const lines = out.trim().split("\n");
  const items: ProcessItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 9 || !/^\d+$/.test(parts[0] || "")) continue;
    const pid = parts[0]!;
    const rssKb = parseInt(parts[4] || "0", 10) || 0;
    const user = parts[6] || "";
    const uptimeSec = parseEtime(parts[7] || "");
    const command = parts.slice(8).join(" ");
    const name = extractProcessName(command);
    items.push({
      pid,
      ppid: parts[1] || "",
      cpu: parseFloat(parts[2] || "0") || 0,
      mem: parseFloat(parts[3] || "0") || 0,
      rssMb: formatMb(rssKb),
      rssKb,
      state: parts[5] || "",
      user,
      name,
      command,
      ports: portMap.get(pid) || [],
      isUserApp: user === currentUser,
      isDevServer: isDevServerProcess(command, name),
      uptimeSec,
      uptime: formatUptime(uptimeSec),
    });
  }
  return items;
}

/** Parse `lsof -iTCP -sTCP:LISTEN -n -P` output into pid -> [":port"]. */
export function parseLsofListen(out: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const lines = out.trim().split("\n");
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]?.trim().split(/\s+/) || [];
    if (parts.length < 9) continue;
    const pid = parts[1];
    const m = parts[8]?.match(/:(\d+)$/);
    if (!pid || !m) continue;
    const cur = map.get(pid) || [];
    const port = ":" + m[1];
    if (!cur.includes(port)) cur.push(port);
    map.set(pid, cur);
  }
  return map;
}

export function stateLabel(state: string): string {
  const c = (state || "?")[0]!.toUpperCase();
  const base: Record<string, string> = { R: "Running", S: "Sleeping", I: "Idle", T: "Stopped (suspended)", U: "Uninterruptible wait", Z: "Zombie" };
  return base[c] || state;
}

// ---------------------------------------------------------------------------
// Grouping and tree
// ---------------------------------------------------------------------------

export interface ProcessGroup {
  name: string;
  count: number;
  cpu: number;
  mem: number;
  rssKb: number;
  user: string;
  ports: string[];
  pids: string[]; // highest CPU first
}

export function groupProcesses(procs: ProcessItem[]): ProcessGroup[] {
  const map = new Map<string, ProcessItem[]>();
  for (const p of procs) {
    const l = map.get(p.name) || [];
    l.push(p);
    map.set(p.name, l);
  }
  const out: ProcessGroup[] = [];
  for (const [name, list] of map) {
    const sorted = [...list].sort((a, b) => b.cpu - a.cpu);
    out.push({
      name,
      count: list.length,
      cpu: Math.round(list.reduce((a, p) => a + p.cpu, 0) * 10) / 10,
      mem: Math.round(list.reduce((a, p) => a + p.mem, 0) * 10) / 10,
      rssKb: list.reduce((a, p) => a + p.rssKb, 0),
      user: sorted[0]!.user,
      ports: [...new Set(list.flatMap((p) => p.ports))],
      pids: sorted.map((p) => p.pid),
    });
  }
  return out;
}

export function childrenOf(procs: ProcessItem[], pid: string): ProcessItem[] {
  return procs.filter((p) => p.ppid === pid && p.pid !== pid);
}

/** All descendants of pid, deepest first (safe to kill in order). Cycle-safe. */
export function descendantsOf(procs: ProcessItem[], pid: string): string[] {
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

/** pid, its parent, grandparent, ... (stops at pid 0/1 or a loop). */
export function ancestorsOf(procs: ProcessItem[], pid: string): string[] {
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

// ---------------------------------------------------------------------------
// Signal safety
// ---------------------------------------------------------------------------

export interface SignalContext {
  selfPid: string;
  parentPid: string;
  currentUser: string;
}

export interface SignalAssessment {
  allowed: boolean;
  reason?: string;
  /** When set, ask the user to confirm with this message before sending. */
  confirm?: string;
}

export function assessSignal(proc: ProcessItem | undefined, pid: string, signal: SignalName, ctx: SignalContext): SignalAssessment {
  if (!/^\d+$/.test(pid) || pid === "0") return { allowed: false, reason: "Please specify a valid numeric PID." };
  if (pid === "1") return { allowed: false, reason: "Refusing to signal PID 1 (launchd/init)." };
  if (pid === ctx.selfPid) return { allowed: false, reason: "Refusing to signal this Task Manager's own process." };
  if (proc && CRITICAL_NAMES.some((n) => n.toLowerCase() === proc.name.toLowerCase())) {
    return { allowed: false, reason: `Refusing to signal ${proc.name}: it is critical to the system.` };
  }
  const label = proc ? `${proc.name} (PID ${pid})` : `PID ${pid}`;
  const notes: string[] = [];
  if (pid === ctx.parentPid) notes.push("This is the process that launched Task Manager, so it will probably close this window.");
  if (proc && proc.user !== ctx.currentUser) notes.push(`It belongs to "${proc.user}", not you. This will probably be refused, and signaling system processes can destabilise your Mac.`);
  if (proc && proc.ports.length) notes.push(`It is listening on ${proc.ports.join(", ")}.`);
  const destructive = signal === "SIGKILL" || signal === "SIGSTOP";
  if (destructive || notes.length) {
    const what = signal === "SIGKILL" ? "force-kill (SIGKILL, no cleanup, unsaved work is lost)"
      : signal === "SIGSTOP" ? "suspend (SIGSTOP)"
      : signal === "SIGTERM" ? "terminate (SIGTERM)"
      : signal === "SIGHUP" ? "send SIGHUP to"
      : "resume (SIGCONT)";
    return { allowed: true, confirm: `${signal === "SIGCONT" ? "Resume" : "Really"} ${what} ${label}?${notes.length ? "\n\n" + notes.join("\n") : ""}` };
  }
  return { allowed: true };
}

/** Dev servers worth cleaning up: yours, listening on a port or orphaned (parent is launchd), and not part of this app's own process chain. */
export function findRogueDevServers(procs: ProcessItem[], ctx: SignalContext): ProcessItem[] {
  const protectedPids = new Set<string>([ctx.selfPid, ctx.parentPid, ...ancestorsOf(procs, ctx.selfPid), ...descendantsOf(procs, ctx.selfPid)]);
  return procs.filter((p) => p.isDevServer && p.isUserApp && !protectedPids.has(p.pid) && (p.ports.length > 0 || p.ppid === "1") && !CRITICAL_NAMES.includes(p.name));
}

export function validPort(raw: string): number | null {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : null;
}

/** Best-effort path to reveal in Finder: the .app bundle, or the executable if the command starts with an absolute path. */
export function executablePath(command: string): string | null {
  const app = /^(\/.*?\.app)\//i.exec(command);
  if (app) return app[1]!;
  const first = command.trim().split(/\s+/)[0] || "";
  return first.startsWith("/") ? first : null;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function cell(v: string): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function processesToCsv(procs: ProcessItem[]): string {
  const head = ["pid", "ppid", "name", "user", "state", "cpu_percent", "mem_percent", "rss_mb", "uptime", "ports", "command"];
  const rows = procs.map((p) => [p.pid, p.ppid, p.name, p.user, p.state, p.cpu.toFixed(1), p.mem.toFixed(1), (p.rssKb / 1024).toFixed(1), p.uptime || "", p.ports.join(" "), p.command]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export function processesToJson(procs: ProcessItem[]): string {
  return JSON.stringify(procs.map((p) => ({ pid: p.pid, ppid: p.ppid, name: p.name, user: p.user, state: p.state, cpu: p.cpu, mem: p.mem, rssMb: Math.round((p.rssKb / 1024) * 10) / 10, uptime: p.uptime ?? null, ports: p.ports, command: p.command })), null, 2);
}

export function processesToTsv(procs: ProcessItem[]): string {
  const head = ["PID", "Name", "Ports", "CPU %", "MEM %", "RSS", "User", "State", "Uptime", "Command"].join("\t");
  return head + "\n" + procs.map((p) => [p.pid, p.name, p.ports.join(" "), p.cpu.toFixed(1), p.mem.toFixed(1), p.rssMb, p.user, p.state, p.uptime || "", p.command.replace(/[\t\n]/g, " ")].join("\t")).join("\n");
}

export function parseRefreshSeconds(label: string): number {
  if (/off/i.test(label)) return 0;
  const m = /(\d+)\s*s/i.exec(label);
  return m ? parseInt(m[1]!, 10) : 2;
}
