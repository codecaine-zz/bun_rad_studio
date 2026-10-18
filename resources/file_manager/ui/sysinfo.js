// System Information power tool: cross-platform hardware, CPU, memory, disk, GPU, network, peripheral,
// and OS telemetry dashboard with deep systeminformation probes, snapshot diffing, and report exports.
import { call } from "./api.js";
import { copyToClipboard } from "./copyclip.js";
import { btn, createStatus, errorText, field } from "./devCore.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { registerPowerTab } from "./power.js";
import { state } from "./state.js";
import {
  renderDiffResult,
  renderProbeResult,
  renderSectionContent,
  renderSysinfoBanner,
  renderSysinfoKpis,
} from "./sysinfoView.js";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "hardware", label: "Hardware & BIOS", icon: "🔧" },
  { id: "cpu", label: "CPU & Thermal", icon: "🧠" },
  { id: "memory", label: "Memory (RAM)", icon: "💾" },
  { id: "disks", label: "Disks & Volumes", icon: "💽" },
  { id: "network", label: "Network & NICs", icon: "🌐" },
  { id: "graphics", label: "GPUs & Displays", icon: "🖥️" },
  { id: "peripherals", label: "USB, BT & Power", icon: "🔌" },
  { id: "software", label: "OS & Versions", icon: "📦" },
];

function mountSysinfo(root) {
  let overview = null;
  let catalog = [];
  let activeSection = "overview";
  let sectionData = null;
  let probeResult = null;
  let baseline = null; // { label, data }
  let timer = null;
  let busy = false;

  const status = createStatus();
  const banner = h("div", { class: "sys-banner", role: "region", "aria-label": "System summary" });
  const kpiGrid = h("div", { class: "sys-kpi-grid", role: "region", "aria-label": "System health metrics" });

  const filterInput = h("input", {
    type: "search",
    class: "sys-filter-input",
    placeholder: "Filter telemetry fields, devices, mounts, or versions...",
    "aria-label": "Filter system telemetry",
    title: "Filter the currently displayed hardware, storage, network, or software rows.",
  });
  const intervalSelect = h("select", { title: "How often to refresh live CPU, memory, disk, and network KPIs." },
    h("option", { value: "0" }, "Manual refresh"),
    h("option", { value: "3000" }, "Auto-refresh: 3s"),
    h("option", { value: "5000" }, "Auto-refresh: 5s"),
    h("option", { value: "10000" }, "Auto-refresh: 10s"),
  );
  const refreshBtn = btn("Refresh Telemetry", "Reload live system telemetry and the current hardware section.", () => reloadAll(), { primary: true });

  const probeSelect = h("select", { title: "Choose a low-level systeminformation probe to inspect." },
    h("option", { value: "" }, "Select a deep probe…"),
  );
  const probeParamInput = h("input", {
    type: "text",
    class: "sys-probe-param",
    placeholder: "Optional param (e.g. 1.1.1.1)",
    title: "Optional argument for probes that accept a parameter (such as inetLatency host or versions filter).",
  });
  const runProbeBtn = btn("Run Probe", "Execute the selected low-level system probe and display its fields.", () => runSelectedProbe());

  const pinBaselineBtn = btn("Pin Baseline", "Save the current section or probe data as a baseline snapshot for comparison.", () => pinBaseline());
  const diffBaselineBtn = btn("Compare to Baseline", "Compare the current telemetry against the pinned baseline snapshot.", () => compareBaseline());
  diffBaselineBtn.disabled = true;

  const formatSelect = h("select", { title: "Choose the export format for the system report." },
    h("option", { value: "json" }, "JSON (.json)"),
    h("option", { value: "md" }, "Markdown (.md)"),
    h("option", { value: "csv" }, "CSV (.csv)"),
    h("option", { value: "html" }, "HTML Report (.html)"),
  );
  const copyReportBtn = btn("Copy Report", "Copy the formatted system report to the clipboard.", () => copyReport());
  const saveReportBtn = btn("Save Report", "Save the formatted system report as a new file in the current folder.", () => saveReport());

  const navStrip = h("div", { class: "dev-tabs sys-tabs", role: "tablist", "aria-label": "System information sections" });
  const sectionButtons = new Map();
  for (const sec of SECTIONS) {
    const b = h("button", {
      type: "button",
      role: "tab",
      class: "dev-tab sys-tab",
      "aria-selected": String(sec.id === activeSection),
      title: `Show ${sec.label} telemetry`,
      onclick: () => selectSection(sec.id),
    }, `${sec.icon} ${sec.label}`);
    sectionButtons.set(sec.id, b);
    navStrip.append(b);
  }

  const contentHost = h("div", { class: "pw-card sys-content-card", role: "region", "aria-label": "Section details" });
  const probeHost = h("div", { class: "pw-card sys-probe-card", hidden: true, role: "region", "aria-label": "Deep probe output" });
  const diffHost = h("div", { class: "pw-card sys-diff-card", hidden: true, role: "region", "aria-label": "Snapshot comparison" });

  root.append(
    h("div", { class: "sys-root" },
      h("div", { class: "pw-card sys-top-card" },
        h("div", { class: "sys-header-row" },
          h("h3", {}, "System Information & Hardware Telemetry"),
          banner,
        ),
        kpiGrid,
        h("div", { class: "pw-row sys-controls-row" },
          filterInput,
          field("Refresh", intervalSelect),
          refreshBtn,
          field("Report format", formatSelect),
          copyReportBtn,
          saveReportBtn,
        ),
        h("div", { class: "pw-row sys-probe-row" },
          field("Deep Probe", probeSelect),
          field("Parameter", probeParamInput),
          runProbeBtn,
          pinBaselineBtn,
          diffBaselineBtn,
        ),
        status.el,
      ),
      navStrip,
      contentHost,
      probeHost,
      diffHost,
    ),
  );

  filterInput.addEventListener("input", () => redrawCurrent());
  intervalSelect.addEventListener("change", () => syncTimer());

  function populateProbeCatalog(items) {
    if (!Array.isArray(items) || items.length === 0 || catalog.length > 0) return;
    catalog = items;
    probeSelect.replaceChildren(h("option", { value: "" }, `Select a deep probe (${items.length} available)…`));
    const groups = new Map();
    for (const item of items) {
      const list = groups.get(item.category) || [];
      list.push(item);
      groups.set(item.category, list);
    }
    for (const [cat, list] of groups) {
      const grp = h("optgroup", { label: cat });
      for (const item of list) {
        grp.append(h("option", { value: item.method }, `${item.label} (${item.method})`));
      }
      probeSelect.append(grp);
    }
  }

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
        if (!document.hidden && !busy) loadOverviewOnly();
      }, ms);
    }
  }

  async function loadOverviewOnly() {
    if (busy) return;
    busy = true;
    try {
      const res = await call("sysinfo/overview", {});
      overview = res.overview;
      populateProbeCatalog(res.catalog);
      renderSysinfoBanner(banner, overview);
      renderSysinfoKpis(kpiGrid, overview);
      if (activeSection === "overview" && sectionData) {
        renderSectionContent(contentHost, sectionData, overview, filterInput.value);
      }
    } catch {
      // ignore background poll error
    } finally {
      busy = false;
    }
  }

  async function reloadAll() {
    if (busy) return;
    busy = true;
    status.set("Collecting hardware and system telemetry…");
    try {
      const [ovRes, secRes] = await Promise.all([
        call("sysinfo/overview", {}),
        call("sysinfo/section", { section: activeSection }),
      ]);
      overview = ovRes.overview;
      populateProbeCatalog(ovRes.catalog);
      sectionData = secRes;
      renderSysinfoBanner(banner, overview);
      renderSysinfoKpis(kpiGrid, overview);
      redrawCurrent();
      status.set(`Loaded ${SECTIONS.find((s) => s.id === activeSection)?.label || activeSection} telemetry on ${overview.osLabel}.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't load system telemetry."), true);
    } finally {
      busy = false;
    }
  }

  async function selectSection(secId) {
    activeSection = secId;
    for (const [id, b] of sectionButtons) {
      b.setAttribute("aria-selected", String(id === activeSection));
    }
    status.set(`Loading ${SECTIONS.find((s) => s.id === secId)?.label || secId}…`);
    try {
      sectionData = await call("sysinfo/section", { section: secId });
      redrawCurrent();
      status.set(`Showing ${SECTIONS.find((s) => s.id === secId)?.label || secId}.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't load that section."), true);
    }
  }

  function redrawCurrent() {
    const needle = filterInput.value;
    renderSectionContent(contentHost, sectionData, overview, needle);
    if (probeResult) {
      probeHost.hidden = false;
      renderProbeResult(probeHost, probeResult, needle);
    }
  }

  async function runSelectedProbe() {
    const method = probeSelect.value;
    if (!method) return status.set("Choose a deep probe from the dropdown first.", true);
    status.set(`Running probe "${method}"…`);
    try {
      probeResult = await call("sysinfo/probe", { method, param: probeParamInput.value.trim() });
      probeHost.hidden = false;
      renderProbeResult(probeHost, probeResult, filterInput.value);
      status.set(`Probe "${probeResult.label}" finished in ${probeResult.elapsedMs} ms.`);
    } catch (err) {
      status.set(errorText(err, "Probe failed."), true);
    }
  }

  function currentPayload() {
    if (probeResult) return { label: `Probe ${probeResult.method}`, data: probeResult.data };
    if (sectionData) return { label: `Section ${sectionData.section}`, data: sectionData.raw };
    return { label: "Overview", data: overview };
  }

  function pinBaseline() {
    const cur = currentPayload();
    if (!cur.data) return status.set("Wait for telemetry to load before pinning a baseline.", true);
    baseline = { label: `${cur.label} @ ${new Date().toLocaleTimeString()}`, data: cur.data };
    diffBaselineBtn.disabled = false;
    status.set(`Pinned baseline snapshot: ${baseline.label}.`);
    toast(`Pinned baseline (${cur.label})`);
  }

  async function compareBaseline() {
    if (!baseline) return status.set("Pin a baseline snapshot first.", true);
    const cur = currentPayload();
    try {
      const res = await call("sysinfo/diff", { before: baseline.data, after: cur.data });
      diffHost.hidden = false;
      renderDiffResult(diffHost, res.diff, baseline.label);
      status.set(`Compared current ${cur.label} with baseline (${res.diff.changed.length} changed).`);
    } catch (err) {
      status.set(errorText(err, "Comparison failed."), true);
    }
  }

  async function copyReport() {
    try {
      const res = await call("sysinfo/export", {
        format: formatSelect.value,
        section: activeSection,
        method: probeSelect.value || undefined,
        param: probeParamInput.value.trim() || undefined,
      });
      await copyToClipboard(res.text);
      status.set(`Copied ${res.title} (${res.format.toUpperCase()}) to the clipboard.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't copy report."), true);
    }
  }

  async function saveReport() {
    const folder = state.location?.kind === "folder" && state.location.path ? state.location.path : state.home;
    try {
      const res = await call("sysinfo/save", {
        folder,
        format: formatSelect.value,
        section: activeSection,
        method: probeSelect.value || undefined,
        param: probeParamInput.value.trim() || undefined,
      });
      status.set(`Saved ${res.name} in ${folder}.`);
      toast(`Saved ${res.name}`);
      if (state.location?.path === folder) refresh();
    } catch (err) {
      status.set(errorText(err, "Couldn't save report."), true);
    }
  }

  return {
    show(opts) {
      if (opts?.section && SECTIONS.some((s) => s.id === opts.section)) {
        activeSection = opts.section;
        for (const [id, b] of sectionButtons) b.setAttribute("aria-selected", String(id === activeSection));
      }
      reloadAll();
      syncTimer();
    },
    hide() {
      stopTimer();
    },
  };
}

registerPowerTab({
  id: "sysinfo",
  label: "System",
  icon: "🖥️",
  group: "more",
  tip: "Hardware, CPU, RAM, storage, GPU, network, USB, battery and OS telemetry with deep system probes and report export.",
  mount: mountSysinfo,
});
