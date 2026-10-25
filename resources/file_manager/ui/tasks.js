// Process & Task Manager power tool: cross-platform live process monitor, port-to-PID mapper,
// process tree/group inspector, and task termination / POSIX signal controller for Windows, macOS, and Linux.
import { ApiError, call } from "./api.js";
import { copyToClipboard } from "./copyclip.js";
import { barCell } from "./devChart.js";
import { btn, createStatus, createTable, errorText, field } from "./devCore.js";
import { confirmBox } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh } from "./nav.js";
import { closePower, registerPowerTab } from "./power.js";
import { state } from "./state.js";
import { parentOf } from "./util.js";
import {
  TASK_COLUMNS,
  matchesProcessFilter,
  renderPlatformBanner,
  renderSelectedProcessBar,
  renderTelemetryCards,
} from "./tasksView.js";

function mountTasks(root) {
  let snapshot = null;
  let selectedPid = "";
  let inspectData = null;
  let sort = { key: "cpu", dir: "desc" };
  let timer = null;
  let busy = false;

  const status = createStatus();
  const banner = h("div", { class: "tasks-banner", role: "region", "aria-label": "Platform engine" });
  const kpiGrid = h("div", { class: "tasks-kpi-grid", role: "region", "aria-label": "System telemetry" });

  const searchInput = h("input", {
    type: "search",
    class: "tasks-search",
    placeholder: "Filter by name, PID, :port, user:name, cpu>10, mem>5...",
    "aria-label": "Filter processes",
    title: "Filter processes by name, PID, port (:3000), user (user:root), or threshold (cpu>10, mem>5, rss>100).",
  });
  const scopeSelect = h("select", { title: "Filter which category of processes is shown." },
    h("option", { value: "all" }, "All processes"),
    h("option", { value: "mine" }, "My processes only"),
    h("option", { value: "ports" }, "Listening on a TCP port"),
    h("option", { value: "dev" }, "Dev servers & runtimes"),
  );
  const viewSelect = h("select", { title: "Choose how processes are organized in the table." },
    h("option", { value: "flat" }, "Flat process list"),
    h("option", { value: "tree" }, "Process tree (by parent PID)"),
    h("option", { value: "grouped" }, "Grouped by application"),
  );
  const intervalSelect = h("select", { title: "How often to refresh the process list automatically while this tab is open." },
    h("option", { value: "0" }, "Manual refresh"),
    h("option", { value: "3000" }, "Auto-refresh: 3s"),
    h("option", { value: "5000" }, "Auto-refresh: 5s"),
    h("option", { value: "10000" }, "Auto-refresh: 10s"),
  );
  const refreshBtn = btn("Refresh Now", "Fetch the latest process list, CPU/memory metrics, and listening ports.", () => loadSnapshot(), { primary: true });

  const portInput = h("input", {
    type: "text",
    class: "tasks-port-input",
    placeholder: "3000",
    title: "Enter a TCP port number (1-65535) to find and stop any process listening on it.",
  });
  const killPortBtn = btn("Free Port", "Find and terminate the process listening on the entered TCP port.", () => killByPort(), { danger: true });
  const cleanDevBtn = btn("Clean Rogue Dev Servers", "Find and terminate orphaned or port-listening dev servers owned by you.", () => cleanRogueDev());

  const formatSelect = h("select", { title: "Choose the file format for exporting the process list." },
    h("option", { value: "csv" }, "CSV (.csv)"),
    h("option", { value: "json" }, "JSON (.json)"),
    h("option", { value: "tsv" }, "TSV (.tsv)"),
    h("option", { value: "md" }, "Markdown (.md)"),
  );
  const copyExportBtn = btn("Copy Snapshot", "Copy the formatted process table to the system clipboard.", () => copySnapshot());
  const saveExportBtn = btn("Save to Folder", "Save the process snapshot as a new file in the current folder.", () => saveSnapshot());

  const table = createTable({
    caption: "Running processes. Click a row to inspect or run platform actions.",
    columns: TASK_COLUMNS,
    className: "tasks-table",
    onSort: (key, dir) => {
      sort = { key, dir };
      renderTable();
    },
  });

  const inspectorHost = h("div", { class: "pw-card tasks-inspector", role: "region", "aria-label": "Selected process inspector" });

  root.append(
    h("div", { class: "tasks-root" },
      h("div", { class: "pw-card tasks-top-card" },
        h("div", { class: "tasks-header-row" },
          h("h3", {}, "Process & Task Manager"),
          banner,
        ),
        kpiGrid,
        h("div", { class: "pw-row tasks-filter-row" },
          searchInput,
          field("Scope", scopeSelect),
          field("View", viewSelect),
          field("Refresh", intervalSelect),
          refreshBtn,
        ),
        h("div", { class: "pw-row tasks-tools-row" },
          field("TCP Port", portInput),
          killPortBtn,
          cleanDevBtn,
          field("Export format", formatSelect),
          copyExportBtn,
          saveExportBtn,
        ),
        status.el,
      ),
      inspectorHost,
      h("div", { class: "pw-card tasks-table-card" }, table.el),
    ),
  );

  searchInput.addEventListener("input", () => renderTable());
  scopeSelect.addEventListener("change", () => renderTable());
  viewSelect.addEventListener("change", () => renderTable());
  intervalSelect.addEventListener("change", () => syncTimer());
  portInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      killByPort();
    }
  });

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function syncTimer() {
    stopTimer();
    const ms = parseInt(intervalSelect.value, 10) || 0;
    if (ms >= 1000) {
      timer = setInterval(() => {
        if (!document.hidden && !busy) loadSnapshot({ quiet: true });
      }, ms);
    }
  }

  async function loadSnapshot({ quiet = false } = {}) {
    if (busy) return;
    busy = true;
    if (!quiet) status.set("Loading processes and port bindings…");
    try {
      snapshot = await call("tasks/list", {});
      renderPlatformBanner(banner, snapshot.profile);
      renderTable();
      if (!quiet) {
        status.set(
          `Loaded ${snapshot.processes.length} processes on ${snapshot.profile.osLabel} (${snapshot.telemetry.listeningPortCount} listening ports).`,
        );
      }
    } catch (err) {
      status.set(errorText(err, "Couldn't load the process list."), true);
    } finally {
      busy = false;
    }
  }

  function sortItems(list) {
    const key = sort.key;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (key === "pid") cmp = Number(a.pid) - Number(b.pid);
      else if (key === "cpu" || key === "mem" || key === "rssKb") cmp = (a[key] || 0) - (b[key] || 0);
      else if (key === "uptimeSec") cmp = (a.uptimeSec ?? -1) - (b.uptimeSec ?? -1);
      else if (key === "ports") cmp = (a.ports?.length || 0) - (b.ports?.length || 0);
      else cmp = String(a[key] || "").localeCompare(String(b[key] || ""));
      return cmp * sign || Number(a.pid) - Number(b.pid);
    });
  }

  function renderTable() {
    if (!snapshot) return;
    const query = searchInput.value;
    const scope = scopeSelect.value;
    const mode = viewSelect.value;

    const filtered = snapshot.processes.filter((p) => matchesProcessFilter(p, query, scope));
    renderTelemetryCards(kpiGrid, snapshot.telemetry, filtered.length);
    table.setSort(sort.key, sort.dir);

    let displayRows = [];
    if (mode === "grouped") {
      const byName = new Map();
      for (const p of filtered) {
        const list = byName.get(p.name) || [];
        list.push(p);
        byName.set(p.name, list);
      }
      const groups = [];
      for (const [name, list] of byName) {
        const top = list.reduce((best, cur) => (cur.cpu > best.cpu || (cur.cpu === best.cpu && cur.rssKb > best.rssKb) ? cur : best), list[0]);
        const rssKb = list.reduce((s, x) => s + x.rssKb, 0);
        groups.push({
          ...top,
          name: list.length > 1 ? `${name} (×${list.length})` : name,
          cpu: Math.round(list.reduce((s, x) => s + x.cpu, 0) * 10) / 10,
          mem: Math.round(list.reduce((s, x) => s + x.mem, 0) * 10) / 10,
          rssKb,
          rssMb: `${(rssKb / 1024).toFixed(1)} MB`,
          ports: [...new Set(list.flatMap((x) => x.ports))],
        });
      }
      displayRows = sortItems(groups);
    } else if (mode === "tree") {
      const allowedPids = new Set(filtered.map((p) => p.pid));
      displayRows = (snapshot.tree || [])
        .filter((node) => allowedPids.has(node.pid))
        .map((node) => ({
          ...node.process,
          _treePrefix: node.depth > 0 ? `${"  ".repeat(Math.min(node.depth - 1, 6))}└─ ` : "",
        }));
    } else {
      displayRows = sortItems(filtered);
    }

    table.render(
      displayRows.slice(0, 400).map((p) => ({
        key: p.pid,
        selected: p.pid === selectedPid,
        onclick: () => {
          selectedPid = p.pid;
          renderTable();
          renderInspector();
        },
        cells: [
          p.pid,
          h("span", { class: "tasks-name-cell" },
            p._treePrefix ? h("span", { class: "tasks-tree-indent", "aria-hidden": "true" }, p._treePrefix) : null,
            h("span", { class: "tasks-proc-name" }, p.name),
          ),
          p.ports?.length ? h("span", { class: "tasks-port-pill" }, p.ports.join(" ")) : "—",
          h("span", { class: "dev-share-cell" },
            barCell(Math.min(100, p.cpu), 100, `${p.name}: ${p.cpu.toFixed(1)}% CPU`),
            h("span", { class: "dev-share-text" }, `${p.cpu.toFixed(1)}%`),
          ),
          `${p.mem.toFixed(1)}%`,
          p.rssMb,
          p.user || "—",
          p.stateText || p.state,
          p.uptime || "—",
          h("span", { class: "tasks-cmd-preview", title: p.command }, p.windowTitle ? `[${p.windowTitle}] ${p.command}` : p.command),
        ],
      })),
    );
    renderInspector();
  }

  function renderInspector() {
    const proc = snapshot?.processes?.find((p) => p.pid === selectedPid) ?? null;
    renderSelectedProcessBar({
      hostEl: inspectorHost,
      proc,
      profile: snapshot?.profile,
      inspectData,
      onAction: (pid, action) => executeAction(pid, action),
      onInspect: (pid) => inspectPid(pid),
      onOpenFolder: (targetPath, isFile) => {
        const folder = isFile ? parentOf(targetPath) : targetPath;
        if (!folder) return;
        closePower();
        goTo(folder);
      },
      onCopyCmd: (cmd) => copyToClipboard(cmd),
    });
  }

  async function inspectPid(pid) {
    status.set(`Inspecting PID ${pid}…`);
    try {
      inspectData = await call("tasks/inspect", { pid });
      renderInspector();
      status.set(`Inspected ${inspectData.process?.name ?? `PID ${pid}`}.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't inspect that process."), true);
    }
  }

  async function executeAction(pid, action, confirmed = false) {
    try {
      const res = await call("tasks/action", { pid, action, confirm: confirmed });
      toast(res.message || "Action completed.");
      announce(res.message || "Action completed.");
      status.set(res.message || "Action completed.");
      await loadSnapshot({ quiet: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
        const ok = await confirmBox({
          title: "Confirm Process Action",
          message: err.message,
          confirmLabel: "Proceed",
          danger: true,
        });
        if (ok) await executeAction(pid, action, true);
        return;
      }
      status.set(errorText(err, "Action failed."), true);
      toast(errorText(err, "Action failed."), { kind: "error" });
    }
  }

  async function killByPort(confirmed = false) {
    const port = portInput.value.trim();
    if (!port) return status.set("Enter a TCP port number (like 3000 or 8080) first.", true);
    try {
      const res = await call("tasks/kill-port", { port, confirm: confirmed });
      status.set(res.message);
      toast(res.message);
      await loadSnapshot({ quiet: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
        const ok = await confirmBox({
          title: `Free TCP Port :${port.replace(/[^0-9]/g, "")}`,
          message: err.message,
          confirmLabel: "Stop Port Listeners",
          danger: true,
        });
        if (ok) await killByPort(true);
        return;
      }
      status.set(errorText(err, "Couldn't free that port."), true);
    }
  }

  async function cleanRogueDev(confirmed = false) {
    try {
      const res = await call("tasks/clean-dev", { confirm: confirmed });
      status.set(res.message);
      toast(res.message);
      await loadSnapshot({ quiet: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
        const ok = await confirmBox({
          title: "Clean Rogue Dev Servers",
          message: err.message,
          confirmLabel: "Stop Dev Servers",
          danger: true,
        });
        if (ok) await cleanRogueDev(true);
        return;
      }
      status.set(errorText(err, "Couldn't clean dev servers."), true);
    }
  }

  async function copySnapshot() {
    try {
      const res = await call("tasks/export", { format: formatSelect.value });
      await copyToClipboard(res.text);
      status.set(`Copied ${res.count} processes as ${res.format.toUpperCase()} to the clipboard.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't copy snapshot."), true);
    }
  }

  async function saveSnapshot() {
    const folder = state.location?.kind === "folder" && state.location.path ? state.location.path : state.home;
    try {
      const res = await call("tasks/save", { folder, format: formatSelect.value });
      status.set(`Saved ${res.name} (${res.count} processes) in ${folder}.`);
      toast(`Saved ${res.name}`);
      if (state.location?.path === folder) refresh();
    } catch (err) {
      status.set(errorText(err, "Couldn't save snapshot."), true);
    }
  }

  return {
    show(opts) {
      if (opts?.query) searchInput.value = String(opts.query);
      loadSnapshot();
      syncTimer();
    },
    hide() {
      stopTimer();
    },
  };
}

registerPowerTab({
  id: "tasks",
  label: "Tasks",
  icon: "📊",
  group: "more",
  tip: "Inspect running processes, CPU and memory usage, listening TCP ports, and end or signal tasks on Windows, macOS and Linux.",
  mount: mountTasks,
});
