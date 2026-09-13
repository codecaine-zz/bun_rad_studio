import type { ProcessInfo, ProcessTreeNode, SortField } from "./procsTypes.ts";
import { colors } from "../../shared/colors.ts";
import { renderTable, type ColumnDef } from "../../shared/table.ts";

export function parsePsLine(line: string): ProcessInfo | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("PID")) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 8) return null;

  const pid = parseInt(parts[0]!, 10);
  const ppid = parseInt(parts[1]!, 10);
  const user = parts[2]!;
  const cpu = parseFloat(parts[3]!);
  const mem = parseFloat(parts[4]!);
  const stat = parts[5]!;
  const time = parts[6]!;
  const command = parts.slice(7).join(" ");

  if (isNaN(pid) || isNaN(ppid)) return null;

  return { pid, ppid, user, cpu, mem, stat, time, command };
}

export function parsePsOutput(raw: string): ProcessInfo[] {
  return raw
    .split("\n")
    .map(parsePsLine)
    .filter((p): p is ProcessInfo => p !== null);
}

export function fetchRawProcessList(): string {
  if (process.env.SCREENSHOT_MODE === "1") {
    return `PID PPID USER %CPU %MEM STAT TIME COMMAND
1 0 root 0.1 0.2 Ss 1:24.12 /sbin/launchd
210 1 _windowserver 3.2 2.8 Ss 4:18.90 /System/Library/CoreServices/WindowServer
1042 1 developer 1.5 1.4 S 0:14.22 bun run dev
1088 1042 developer 0.8 1.1 S 0:08.15 vite --host 0.0.0.0 --port 5173
2045 1 system 0.1 0.5 S 0:02.30 redis-server *:6379
3012 1 system 0.2 0.8 S 0:03.45 caddy run --config Caddyfile
4099 1 system 0.4 1.2 S 0:05.18 postgres -D /data/postgres
5120 1 developer 0.6 1.0 S 0:12.40 /Applications/Ghostty.app/Contents/MacOS/Ghostty
6780 1 developer 2.4 4.5 S 1:02.15 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome`;
  }
  try {
    const proc = Bun.spawnSync(["ps", "-axo", "pid,ppid,user,%cpu,%mem,stat,time,command"]);
    return proc.stdout ? proc.stdout.toString() : "";
  } catch {
    return "";
  }
}

export function filterProcesses(
  procs: ProcessInfo[],
  keyword?: string
): ProcessInfo[] {
  if (!keyword) return procs;
  const lower = keyword.toLowerCase();
  return procs.filter((p) => {
    return (
      p.pid.toString() === keyword ||
      p.user.toLowerCase().includes(lower) ||
      p.command.toLowerCase().includes(lower)
    );
  });
}

export function filterProcessesByUser(procs: ProcessInfo[], user?: string): ProcessInfo[] {
  if (!user) return procs;
  const target = user.toLowerCase();
  return procs.filter((p) => p.user.toLowerCase() === target);
}

export function parseLsofOutput(raw: string): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const lines = raw.split("\n").slice(1);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const pid = parseInt(parts[1]!, 10);
    const nameCol = parts[8] ?? "";
    const portMatch = nameCol.match(/:(\d+)$/);
    if (!isNaN(pid) && portMatch) {
      const port = portMatch[1]!;
      const list = map.get(pid) ?? [];
      if (!list.includes(port)) list.push(port);
      map.set(pid, list);
    }
  }
  return map;
}

export function fetchListeningPorts(): Map<number, string[]> {
  try {
    const proc = Bun.spawnSync(["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"]);
    const text = proc.stdout ? proc.stdout.toString() : "";
    return parseLsofOutput(text);
  } catch {
    return new Map();
  }
}

export function attachListeningPorts(
  processes: ProcessInfo[],
  portMap: Map<number, string[]>
): ProcessInfo[] {
  return processes.map((p) => {
    const ports = portMap.get(p.pid);
    return ports && ports.length > 0 ? { ...p, ports } : p;
  });
}

export function sortProcesses(
  procs: ProcessInfo[],
  sortBy?: SortField
): ProcessInfo[] {
  const copy = [...procs];
  if (sortBy === "cpu") return copy.sort((a, b) => b.cpu - a.cpu);
  if (sortBy === "mem") return copy.sort((a, b) => b.mem - a.mem);
  if (sortBy === "pid") return copy.sort((a, b) => a.pid - b.pid);
  if (sortBy === "user") return copy.sort((a, b) => a.user.localeCompare(b.user));
  return copy;
}

export function buildProcessTree(procs: ProcessInfo[]): ProcessTreeNode[] {
  const nodeMap = new Map<number, ProcessTreeNode>();
  for (const p of procs) {
    nodeMap.set(p.pid, { process: p, children: [] });
  }

  const roots: ProcessTreeNode[] = [];
  for (const node of nodeMap.values()) {
    const parent = nodeMap.get(node.process.ppid);
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function formatTreeLines(
  nodes: ProcessTreeNode[],
  prefix: string = ""
): string[] {
  const lines: string[] = [];
  nodes.forEach((node, idx) => {
    const isLast = idx === nodes.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const pidStr = colors.bold(colors.cyan(node.process.pid.toString()));
    const cmdStr = colors.yellow(node.process.command.slice(0, 70));
    lines.push(`${prefix}${branch}${pidStr} [${node.process.user}] ${cmdStr}`);

    const childPrefix = prefix + (isLast ? "    " : "│   ");
    lines.push(...formatTreeLines(node.children, childPrefix));
  });
  return lines;
}

export function formatProcessTable(procs: ProcessInfo[]): string {
  const hasPorts = procs.some((p) => p.ports && p.ports.length > 0);
  const columns: ColumnDef<ProcessInfo>[] = [
    { header: "PID", align: "right", getValue: (p) => colors.bold(p.pid.toString()) },
    { header: "USER", align: "left", getValue: (p) => colors.cyan(p.user) },
    ...(hasPorts
      ? [
          {
            header: "PORTS",
            align: "left" as const,
            getValue: (p: ProcessInfo) => colors.green((p.ports ?? []).join(",")),
          },
        ]
      : []),
    {
      header: "%CPU",
      align: "right",
      getValue: (p) => (p.cpu > 50 ? colors.red(p.cpu.toFixed(1)) : p.cpu.toFixed(1)),
    },
    { header: "%MEM", align: "right", getValue: (p) => p.mem.toFixed(1) },
    { header: "STAT", align: "left", getValue: (p) => colors.dim(p.stat) },
    { header: "TIME", align: "right", getValue: (p) => colors.dim(p.time) },
    {
      header: "COMMAND",
      align: "left",
      getValue: (p) => colors.yellow(p.command.length > 80 ? `${p.command.slice(0, 77)}...` : p.command),
    },
  ];

  return renderTable(columns, procs);
}

export function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (err: any) {
    throw new Error(`[ProcsKill] Failed to kill PID ${pid} with ${signal}: ${err.message}`);
  }
}

export function formatJsonProcesses(procs: ProcessInfo[]): string {
  return JSON.stringify(procs, null, 2);
}
