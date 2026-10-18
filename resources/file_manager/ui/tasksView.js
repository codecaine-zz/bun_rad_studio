// View helpers for the Process & Task Manager power tool: KPI telemetry cards, client-side multi-token
// filter matching, sortable table column definitions, and the Process Inspector / Platform Action panel.
import { barCell } from "./devChart.js";
import { btn, factList, linkButton, num } from "./devCore.js";
import { h } from "./dom.js";

export const TASK_COLUMNS = [
  { key: "pid", label: "PID", num: true, sort: true },
  { key: "name", label: "Process", sort: true, rowHeader: true },
  { key: "ports", label: "Ports", sort: true },
  { key: "cpu", label: "CPU %", num: true, sort: true },
  { key: "mem", label: "MEM %", num: true, sort: true },
  { key: "rssKb", label: "RSS", num: true, sort: true },
  { key: "user", label: "User", sort: true },
  { key: "state", label: "State", sort: true },
  { key: "uptimeSec", label: "Uptime", num: true, sort: true },
  { key: "command", label: "Command / Window" },
];

export function formatBytesCompact(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Matches a process against multi-token search queries (:port, pid:N, user:X, cpu>N, mem>N, rss>N, or text). */
export function matchesProcessFilter(proc, query, scope) {
  if (scope === "mine" && !proc.isUserApp) return false;
  if (scope === "ports" && (!proc.ports || proc.ports.length === 0)) return false;
  if (scope === "dev" && !proc.isDevServer) return false;

  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok.startsWith(":")) {
      if (!(proc.ports || []).some((pt) => pt.toLowerCase().includes(tok))) return false;
      continue;
    }
    if (tok.startsWith("pid:")) {
      if (!String(proc.pid).includes(tok.slice(4))) return false;
      continue;
    }
    if (tok.startsWith("user:")) {
      if (!String(proc.user || "").toLowerCase().includes(tok.slice(5))) return false;
      continue;
    }
    const cmp = /^(cpu|mem|rss)([<>]=?|=)(\d+(?:\.\d+)?)$/.exec(tok);
    if (cmp) {
      const metric = cmp[1];
      const op = cmp[2];
      const want = parseFloat(cmp[3]);
      const actual = metric === "cpu" ? proc.cpu : metric === "mem" ? proc.mem : (proc.rssKb || 0) / 1024;
      if (op === ">" && !(actual > want)) return false;
      if (op === ">=" && !(actual >= want)) return false;
      if (op === "<" && !(actual < want)) return false;
      if (op === "<=" && !(actual <= want)) return false;
      if (op === "=" && Math.abs(actual - want) > 0.05) return false;
      continue;
    }
    const hay = `${proc.name} ${proc.pid} ${proc.user} ${(proc.ports || []).join(" ")} ${proc.command} ${proc.windowTitle || ""}`.toLowerCase();
    if (!hay.includes(tok)) return false;
  }
  return true;
}

export function renderPlatformBanner(bannerEl, profile) {
  if (!profile) return;
  const familyBadge = profile.family === "windows" ? "🪟 Windows Engine" : profile.platform === "linux" ? "🐧 Linux Engine" : "🍎 macOS Engine";
  bannerEl.replaceChildren(
    h("span", { class: "tasks-os-badge" }, `${familyBadge} (${profile.platform})`),
    h("span", { class: "tasks-os-detail" }, `Discovery: ${profile.listMechanism}`),
    h("span", { class: "tasks-os-detail" }, `Ports: ${profile.portMechanism}`),
    h("span", { class: "tasks-os-detail" }, `Control: ${profile.killMechanism}`),
  );
}

export function renderTelemetryCards(kpiEl, telemetry, filteredCount) {
  if (!telemetry) return;
  const cpuPct = Math.max(0, Math.min(100, telemetry.cpuPercent || 0));
  const memPct = Math.max(0, Math.min(100, telemetry.memPercent || 0));
  const memText = `${formatBytesCompact(telemetry.memUsedBytes)} / ${formatBytesCompact(telemetry.memTotalBytes)}`;

  kpiEl.replaceChildren(
    h("div", { class: "tasks-kpi-card" },
      h("div", { class: "tasks-kpi-top" },
        h("span", { class: "tasks-kpi-label" }, "CPU Load"),
        h("span", { class: "tasks-kpi-val" }, `${cpuPct.toFixed(1)}%`),
      ),
      barCell(cpuPct, 100, `CPU load ${cpuPct.toFixed(1)}%`),
      h("span", { class: "tasks-kpi-sub" }, `${telemetry.cpuCores} cores · ${telemetry.cpuModel}`),
    ),
    h("div", { class: "tasks-kpi-card" },
      h("div", { class: "tasks-kpi-top" },
        h("span", { class: "tasks-kpi-label" }, "System Memory"),
        h("span", { class: "tasks-kpi-val" }, `${memPct.toFixed(1)}%`),
      ),
      barCell(memPct, 100, `Memory used ${memPct.toFixed(1)}%`),
      h("span", { class: "tasks-kpi-sub" }, memText),
    ),
    h("div", { class: "tasks-kpi-card" },
      h("div", { class: "tasks-kpi-top" },
        h("span", { class: "tasks-kpi-label" }, "Processes"),
        h("span", { class: "tasks-kpi-val" }, `${num(filteredCount)} / ${num(telemetry.totalProcesses)}`),
      ),
      h("span", { class: "tasks-kpi-sub" }, `${num(telemetry.devServerCount)} dev runtimes active`),
    ),
    h("div", { class: "tasks-kpi-card" },
      h("div", { class: "tasks-kpi-top" },
        h("span", { class: "tasks-kpi-label" }, "Listening Ports"),
        h("span", { class: "tasks-kpi-val" }, num(telemetry.listeningPortCount)),
      ),
      h("span", { class: "tasks-kpi-sub" }, `Load avg 1m: ${telemetry.loadAvg1m ?? 0}`),
    ),
  );
}

export function renderSelectedProcessBar({ hostEl, proc, profile, inspectData, onAction, onInspect, onOpenFolder, onCopyCmd }) {
  hostEl.replaceChildren();
  if (!proc) {
    hostEl.append(h("p", { class: "pw-hint" }, "Select any process row in the table above to inspect its parent/child tree, open files, working folder, or run platform actions."));
    return;
  }

  const actionBtns = (profile?.actions || []).map((act) =>
    btn(
      act.label,
      `${act.description} (${act.commandHint})`,
      () => onAction(proc.pid, act.id),
      { danger: act.danger, primary: act.id === "terminate" },
    ),
  );

  const inspectBtn = btn("Inspect Forensics", "Inspect parent/child process hierarchy, working folder, executable path, and open file descriptors.", () => onInspect(proc.pid));
  const copyBtn = btn("Copy Command", "Copy the full command line of this process to the clipboard.", () => onCopyCmd(proc.command));

  const header = h("div", { class: "tasks-sel-head" },
    h("div", { class: "tasks-sel-title" },
      h("strong", {}, `${proc.name} (PID ${proc.pid})`),
      proc.isCritical ? h("span", { class: "tasks-badge danger" }, "System Critical") : null,
      proc.isDevServer ? h("span", { class: "tasks-badge dev" }, "Dev Runtime") : null,
      proc.ports?.length ? h("span", { class: "tasks-badge port" }, proc.ports.join(" ")) : null,
    ),
    h("div", { class: "pw-row tasks-act-row" }, ...actionBtns, inspectBtn, copyBtn),
  );
  hostEl.append(header);

  const facts = [
    ["PID / PPID", `${proc.pid} / ${proc.ppid}`],
    ["User", proc.user || "—"],
    ["State", proc.stateText || proc.state],
    ["CPU / Memory", `${proc.cpu.toFixed(1)}% CPU · ${proc.mem.toFixed(1)}% RAM (${proc.rssMb})`],
    ["Uptime", proc.uptime || "—"],
    ["Listening Ports", proc.ports?.length ? proc.ports.join(", ") : "None"],
  ];
  if (proc.windowTitle) facts.push(["Window Title", proc.windowTitle]);
  if (proc.exePath) {
    facts.push([
      "Executable Path",
      linkButton(proc.exePath, "Open the folder containing this executable in the File Manager.", () => onOpenFolder(proc.exePath, true)),
    ]);
  }
  facts.push(["Command Line", h("code", { class: "tasks-cmd-code" }, proc.command)]);

  if (inspectData && inspectData.pid === proc.pid) {
    if (inspectData.parent) {
      facts.push(["Parent Process", `${inspectData.parent.name} (PID ${inspectData.parent.pid})`]);
    }
    if (inspectData.ancestors?.length) {
      facts.push(["Ancestor Chain", inspectData.ancestors.map((a) => `${a.name} (${a.pid})`).join(" ← ")]);
    }
    if (inspectData.children?.length) {
      facts.push([
        `Direct Children (${inspectData.children.length}, Total Tree: ${inspectData.descendantCount})`,
        inspectData.children.map((c) => `${c.name} (${c.pid}, ${c.rssMb})`).join(", "),
      ]);
    }
    if (inspectData.cwd) {
      facts.push([
        "Working Folder (cwd)",
        linkButton(inspectData.cwd, "Open this working folder in the File Manager.", () => onOpenFolder(inspectData.cwd, false)),
      ]);
    }
    if (inspectData.openFilesCount !== null && inspectData.openFilesCount !== undefined) {
      facts.push(["Open File Descriptors", `${num(inspectData.openFilesCount)} open files`]);
    }
    if (inspectData.safety?.reason) {
      facts.push(["Safety Guard", inspectData.safety.reason]);
    }
  }

  hostEl.append(factList(facts));
}
