// View helpers for the System Information power tool: live KPI cards, per-core SVG load bars,
// section fact lists and tables, deep probe results, and snapshot diff rendering.
import { barCell } from "./devChart.js";
import { factList } from "./devCore.js";
import { h } from "./dom.js";
import { formatBytesCompact } from "./tasksView.js";

export function renderSysinfoBanner(bannerEl, overview) {
  if (!overview) return;
  const icon = overview.platform === "win32" ? "🪟" : overview.platform === "linux" ? "🐧" : "🍎";
  bannerEl.replaceChildren(
    h("span", { class: "sys-os-badge" }, `${icon} ${overview.os.distro} ${overview.os.release} (${overview.os.arch})`),
    h("span", { class: "sys-os-pill" }, `Host: ${overview.os.hostname}`),
    h("span", { class: "sys-os-pill" }, `Kernel: ${overview.os.kernel}`),
    h("span", { class: "sys-os-pill" }, `Uptime: ${overview.os.uptimeFormatted}`),
    h("span", { class: "sys-os-pill" }, `Bun ${overview.os.bunVersion}`),
  );
}

export function renderSysinfoKpis(kpiEl, overview) {
  if (!overview) return;
  const cpuPct = Math.max(0, Math.min(100, overview.cpu.loadPercent || 0));
  const memPct = Math.max(0, Math.min(100, overview.memory.usedPercent || 0));
  const mainDisk = overview.disks?.[0] || null;
  const diskPct = mainDisk ? Math.max(0, Math.min(100, mainDisk.usePercent || 0)) : 0;
  const mainNet = overview.network?.find((n) => n.default && !n.internal) || overview.network?.find((n) => !n.internal && n.ip4) || overview.network?.[0];

  const tempStr = overview.cpu.tempMainC !== null ? ` · ${overview.cpu.tempMainC}°C` : "";
  const bat = overview.battery;
  const batTitle = bat?.hasBattery
    ? `${bat.percent}% (${bat.isCharging ? "Charging" : bat.acConnected ? "AC Power" : "On Battery"})`
    : "AC Power (Desktop)";

  kpiEl.replaceChildren(
    h("div", { class: "sys-kpi-card" },
      h("div", { class: "sys-kpi-top" },
        h("span", { class: "sys-kpi-label" }, "Processor Load"),
        h("span", { class: "sys-kpi-val" }, `${cpuPct.toFixed(1)}%`),
      ),
      barCell(cpuPct, 100, `CPU load ${cpuPct.toFixed(1)}%`),
      h("span", { class: "sys-kpi-sub" }, `${overview.cpu.brand} (${overview.cpu.physicalCores}P/${overview.cpu.logicalCores}L)${tempStr}`),
    ),
    h("div", { class: "sys-kpi-card" },
      h("div", { class: "sys-kpi-top" },
        h("span", { class: "sys-kpi-label" }, "Memory (RAM)"),
        h("span", { class: "sys-kpi-val" }, `${memPct.toFixed(1)}%`),
      ),
      barCell(memPct, 100, `Memory used ${memPct.toFixed(1)}%`),
      h("span", { class: "sys-kpi-sub" }, `${formatBytesCompact(overview.memory.usedBytes)} / ${formatBytesCompact(overview.memory.totalBytes)}`),
    ),
    h("div", { class: "sys-kpi-card" },
      h("div", { class: "sys-kpi-top" },
        h("span", { class: "sys-kpi-label" }, mainDisk ? `Disk (${mainDisk.mount})` : "Primary Disk"),
        h("span", { class: "sys-kpi-val" }, mainDisk ? `${diskPct.toFixed(1)}%` : "—"),
      ),
      barCell(diskPct, 100, `Disk used ${diskPct.toFixed(1)}%`),
      h("span", { class: "sys-kpi-sub" }, mainDisk ? `${formatBytesCompact(mainDisk.usedBytes)} / ${formatBytesCompact(mainDisk.sizeBytes)} (${mainDisk.type || mainDisk.fs})` : "No volume stats"),
    ),
    h("div", { class: "sys-kpi-card" },
      h("div", { class: "sys-kpi-top" },
        h("span", { class: "sys-kpi-label" }, "Power & Network"),
        h("span", { class: "sys-kpi-val" }, mainNet?.ip4 || "Local"),
      ),
      h("span", { class: "sys-kpi-sub" }, `${batTitle} · ${mainNet ? `${mainNet.iface} (${mainNet.operstate})` : "Offline"}`),
    ),
  );
}

export function renderCoreGrid(coresEl, perCoreLoads) {
  coresEl.replaceChildren();
  if (!Array.isArray(perCoreLoads) || perCoreLoads.length === 0) return;
  const items = perCoreLoads.slice(0, 32).map((load, idx) => {
    const pct = Math.max(0, Math.min(100, Number(load) || 0));
    return h("div", { class: "sys-core-cell" },
      h("span", { class: "sys-core-lbl" }, `C${idx + 1}`),
      barCell(pct, 100, `Core ${idx + 1}: ${pct.toFixed(1)}%`),
      h("span", { class: "sys-core-pct" }, `${pct.toFixed(0)}%`),
    );
  });
  coresEl.append(
    h("h4", { class: "sys-subhead" }, `Per-Core CPU Activity (${perCoreLoads.length} Logical Cores)`),
    h("div", { class: "sys-core-grid" }, ...items),
  );
}

export function renderSysinfoTable(tbl, filterNeedle = "") {
  const needle = (filterNeedle || "").trim().toLowerCase();
  const rows = needle
    ? (tbl.rows || []).filter((r) => r.some((cell) => String(cell).toLowerCase().includes(needle)))
    : tbl.rows || [];

  const thead = h("thead", {},
    h("tr", {},
      ...(tbl.columns || []).map((col) => h("th", { scope: "col" }, col)),
    ),
  );
  const tbody = h("tbody", {});
  if (rows.length === 0) {
    tbody.append(h("tr", {}, h("td", { colspan: String(Math.max(1, tbl.columns?.length || 1)), class: "dev-empty" }, "Nothing to show.")));
  } else {
    for (const r of rows) {
      tbody.append(
        h("tr", {},
          ...r.map((cell, idx) =>
            h(idx === 0 ? "th" : "td", { scope: idx === 0 ? "row" : null }, String(cell ?? "")),
          ),
        ),
      );
    }
  }
  return h("div", { class: "sys-table-block" },
    h("h4", { class: "sys-subhead" }, `${tbl.title} (${rows.length})`),
    h("div", { class: "pw-table-wrap sys-table-wrap" },
      h("table", { class: "pw-table dev-table sys-table" }, thead, tbody),
    ),
  );
}

export function renderSectionContent(hostEl, sectionData, overview, filterNeedle) {
  hostEl.replaceChildren();
  if (!sectionData) return;

  const needle = (filterNeedle || "").trim().toLowerCase();
  const facts = needle
    ? (sectionData.facts || []).filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(needle))
    : sectionData.facts || [];

  if (facts.length > 0) {
    hostEl.append(
      h("div", { class: "sys-facts-box" },
        h("h4", { class: "sys-subhead" }, "System Summary & Platform Telemetry"),
        factList(facts),
      ),
    );
  }

  if ((sectionData.section === "overview" || sectionData.section === "cpu") && overview?.cpu?.perCoreLoads?.length) {
    const coreWrap = h("div", { class: "sys-cores-box" });
    renderCoreGrid(coreWrap, overview.cpu.perCoreLoads);
    hostEl.append(coreWrap);
  }

  for (const tbl of sectionData.tables || []) {
    hostEl.append(renderSysinfoTable(tbl, needle));
  }
}

export function renderProbeResult(hostEl, probeResult, filterNeedle) {
  hostEl.replaceChildren();
  if (!probeResult) return;

  const head = h("div", { class: "sys-probe-head" },
    h("strong", {}, `${probeResult.label} (${probeResult.method})`),
    h("span", { class: "sys-os-pill" }, `${probeResult.category} · ${probeResult.elapsedMs} ms`),
    h("p", { class: "pw-hint" }, probeResult.description),
  );
  hostEl.append(head);

  if (probeResult.table) {
    hostEl.append(renderSysinfoTable(probeResult.table, filterNeedle));
  }

  const needle = (filterNeedle || "").trim().toLowerCase();
  const rows = (probeResult.flatRows || []).filter(([k, v]) => !needle || `${k} ${v}`.toLowerCase().includes(needle));
  const kvTable = renderSysinfoTable(
    {
      title: `Flattened Telemetry Fields (${probeResult.method})`,
      columns: ["Field Path", "Value"],
      rows: rows.slice(0, 250),
    },
    "",
  );
  hostEl.append(kvTable);
}

export function renderDiffResult(hostEl, diff, baselineLabel) {
  hostEl.replaceChildren();
  if (!diff) return;

  const summary = h("p", { class: "sys-diff-summary" },
    `Compared against baseline (${baselineLabel}): ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed, ${diff.unchanged} unchanged.`,
  );
  hostEl.append(summary);

  const rows = [
    ...diff.changed.map((c) => ["Changed", c.path, String(c.from ?? ""), String(c.to ?? "")]),
    ...diff.added.map((a) => ["Added", a.path, "—", String(a.value ?? "")]),
    ...diff.removed.map((r) => ["Removed", r.path, String(r.value ?? ""), "—"]),
  ];

  hostEl.append(
    renderSysinfoTable({
      title: "Telemetry Snapshot Changes",
      columns: ["Change", "Field Path", "Baseline Value", "Current Value"],
      rows: rows.slice(0, 200),
    }),
  );
}
