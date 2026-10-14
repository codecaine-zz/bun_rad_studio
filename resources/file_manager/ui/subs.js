// "Subdomains" tool of the Power tools panel (Find & more → Subdomains): finds the subdomains of a domain from public
// sources, and, only when asked, checks them with DNS, web and port probes. The page never contacts anything itself:
// every step is asked of the File Manager server, which applies the limits. A run happens in the background and
// is followed by polling, so the tab can be left and come back to.
import { announce, clear, debounce, h } from "./dom.js";
import { ApiError, call } from "./api.js";
import { copyToClipboard } from "./copyclip.js";
import { rowsToTsv } from "./copyformat.js";
import { registerCopySource } from "./copysection.js";
import { toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { currentPath, emit } from "./state.js";
import { buildLayout, sourceRow } from "./subsform.js";
import { COLUMNS, cells, checkNumbers, countsLine, filterRows, hostsText, sortRows, tableCsv, tableJson, tableMarkdown, tableRows, tableTsv, urlFor } from "./subscore.js";
import { consoleLine, historyItem, paintRows, paintSortHeads, paintSource, resetSource } from "./subsview.js";

const POLL_MS = 400;
const PAGE = 300;
const DEFAULT_LIMITS = { minTimeoutSec: 3, maxTimeoutSec: 60, maxResults: 10000, maxDnsConcurrency: 10, maxHttpConcurrency: 5 };
const PHASE_WORDS = { sources: "Sources answered", dns: "DNS lookups done", http: "Websites checked", ports: "Hosts port-checked" };

function mount(root) {
  root.classList.add("subs-root");
  const S = {
    client: `t${Math.random().toString(36).slice(2, 10)}`, info: null, entries: new Map(), runId: null, running: false, rows: new Map(), rev: 0, logFrom: 0,
    sort: { key: "host", dir: "asc" }, limit: PAGE, selected: null, view: [], used: {}, permitted: new Set(), permissionFor: "", hidden: false, folderTouched: false,
    wake: null, timer: 0, following: false, banner: "", limits: DEFAULT_LIMITS,
  };
  const ui = buildLayout(root, {
    run, cancel, sort, more: () => { S.limit += PAGE; paint(); }, openNetwork, copyUrl, openBrowser, copyRow, copyHosts, copyAs, copyColumn,
    useFolder, exportFile, saveReport, clearHistory,
  });

  // ---- small helpers -------------------------------------------------------------------------------------------
  function log(level, text, at) {
    const el = ui.consoleEl;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.append(consoleLine(level, text, at));
    while (el.childElementCount > 300) el.firstElementChild.remove();
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  function showMessage(text, field) {
    ui.message.textContent = text;
    ui.message.hidden = false;
    for (const el of root.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus?.();
    }
    announce(text);
  }
  function clearMessage() {
    ui.message.textContent = "";
    ui.message.hidden = true;
    for (const el of root.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  }

  const apiMessage = (err, fallback) => (err instanceof ApiError ? err.message : fallback);
  const domainKey = () => ui.domain.value.trim().toLowerCase().replace(/\.$/, "");
  const activeOn = () => ui.resolve.input.checked || ui.probeHttp.input.checked || ui.probePorts.input.checked || ui.wildcard.input.checked;
  const chosenSources = () => [...S.entries].filter(([, e]) => e.input.checked && !e.input.disabled).map(([id]) => id);

  // ---- permission for the active steps ---------------------------------------------------------------------------
  function syncPermission() {
    const key = domainKey();
    ui.permission.hidden = !activeOn();
    if (key !== S.permissionFor) {
      S.permissionFor = key;
      ui.permissionBox.input.checked = S.permitted.has(key);
    }
    ui.permissionNote.textContent = S.permitted.has(key) ? `Remembered for ${key} until you close the File Manager.` : "Tick this once per domain. It is remembered only until you close the File Manager.";
  }

  function syncSteps(changed) {
    // probing and the wildcard check use the addresses DNS finds
    if (changed !== ui.resolve.input && (ui.probeHttp.input.checked || ui.probePorts.input.checked || ui.wildcard.input.checked)) ui.resolve.input.checked = true;
    if (changed === ui.resolve.input && !ui.resolve.input.checked) ui.probeHttp.input.checked = ui.probePorts.input.checked = ui.wildcard.input.checked = false;
    ui.allowPrivate.input.disabled = !activeOn();
    if (!activeOn()) ui.allowPrivate.input.checked = false;
    ui.untrusted.input.disabled = !ui.probeHttp.input.checked;
    if (!ui.probeHttp.input.checked) ui.untrusted.input.checked = false;
    ui.ports.disabled = !ui.probePorts.input.checked;
    syncPermission();
  }

  // ---- starting a run --------------------------------------------------------------------------------------------
  function gather() {
    return {
      sources: chosenSources(), resolve: ui.resolve.input.checked, probeHttp: ui.probeHttp.input.checked, probePorts: ui.probePorts.input.checked, ports: ui.ports.value.trim(),
      wildcard: ui.wildcard.input.checked, timeoutSec: Number(ui.timeout.value), maxResults: Number(ui.max.value), dnsConcurrency: Number(ui.dns.value), httpConcurrency: Number(ui.http.value),
      allowPrivate: ui.allowPrivate.input.checked, acceptUntrustedTls: ui.untrusted.input.checked, keepResults: ui.keep.input.checked,
    };
  }

  /** Checks what can be checked on the page; returns true when the run may be asked for. */
  function validate() {
    clearMessage();
    if (!ui.domain.value.trim()) return showMessage("Type a domain first, like example.com.", ui.domain), false;
    if (chosenSources().length === 0) return showMessage("Tick at least one source to ask.", ui.sourceList.querySelector("input:not(:disabled)")), false;
    const numbers = { timeoutSec: ui.timeout.value, maxResults: ui.max.value, dnsConcurrency: ui.dns.value, httpConcurrency: ui.http.value };
    const bad = checkNumbers(numbers, S.limits);
    if (bad) return showMessage(bad.message, { timeout: ui.timeout, max: ui.max, dns: ui.dns, http: ui.http }[bad.field]), false;
    if (ui.probePorts.input.checked && !ui.ports.value.trim()) return showMessage("Type the ports to probe, like 80,443.", ui.ports), false;
    if (activeOn() && !ui.permissionBox.input.checked) {
      ui.permission.hidden = false;
      return showMessage("Before DNS lookups or probing, tick \"I own this domain or have permission to test it\".", ui.permissionBox.input), false;
    }
    return true;
  }

  function setRunning(on) {
    S.running = on;
    ui.run.disabled = on;
    ui.cancel.hidden = !on;
    root.setAttribute("aria-busy", String(on));
    if (!on) {
      ui.progress.hidden = true;
      ui.status.textContent = "";
    }
  }

  function resetResults() {
    S.rows.clear();
    S.rev = 0;
    S.logFrom = 0;
    S.limit = PAGE;
    S.selected = null;
    S.banner = "";
    for (const [id, e] of S.entries) resetSource(e, id !== "subfinder" || S.info?.tools.subfinder.installed);
  }

  async function run() {
    if (S.running || !validate()) return;
    const options = gather();
    const active = activeOn();
    const key = domainKey();
    try {
      const res = await call("subdomains/start", { domain: ui.domain.value.trim(), options, permission: active && ui.permissionBox.input.checked, client: S.client });
      const info = res.run;
      resetResults();
      S.runId = info.id;
      S.used = { resolve: info.options.resolve, probeHttp: info.options.probeHttp, ports: info.options.ports.length > 0, wildcard: info.options.wildcard };
      if (active) {
        S.permitted.add(key);
        S.permitted.add(info.domain);
        syncPermission();
      }
      ui.shown.textContent = info.unicode !== info.domain ? `Looking up ${info.unicode} (${info.domain})` : `Looking up ${info.domain}`;
      log("info", `Started a run for ${info.domain}${active ? " with active steps" : " (passive only)"}.`);
      setRunning(true);
      paint();
      follow();
    } catch (err) {
      const message = apiMessage(err, "The run couldn't start.");
      if (err instanceof ApiError && err.code === "PERMISSION_NEEDED") ui.permission.hidden = false;
      showMessage(message, err instanceof ApiError && err.code === "BAD_DOMAIN" ? ui.domain : err instanceof ApiError && err.code === "BAD_PORTS" ? ui.ports : null);
      log("error", message);
    }
  }

  // ---- following a run -------------------------------------------------------------------------------------------
  const nap = (ms) => new Promise((resolve) => {
    S.wake = () => { clearTimeout(S.timer); S.wake = null; resolve(); };
    S.timer = setTimeout(S.wake, ms);
  });

  function apply(info) {
    for (const s of info.sources) {
      const entry = S.entries.get(s.id);
      if (entry) paintSource(entry, s);
    }
    for (const row of info.rows ?? []) S.rows.set(row.host, row);
    if (info.rev !== undefined) S.rev = info.rev;
    for (const l of info.log ?? []) log(l.level, l.text, l.at);
    S.logFrom = info.logCount;
    const p = info.phase;
    ui.progress.hidden = info.state !== "running";
    ui.progress.max = Math.max(1, p.total);
    ui.progress.value = p.done;
    ui.status.textContent = info.state === "running" ? `${PHASE_WORDS[p.phase] ?? p.phase}: ${p.done} of ${p.total}` : "";
  }

  /** Polls the run until it ends or the tab is left; leaving does not stop the run. */
  async function follow() {
    if (S.following || !S.runId) return;
    S.following = true;
    try {
      for (;;) {
        if (typeof document === "undefined" || S.hidden) return;
        const info = (await call("subdomains/status", { id: S.runId, since: S.rev, logFrom: S.logFrom })).run;
        apply(info);
        // The table is only redrawn when rows changed, so a focused row isn't lost on every poll.
        if (info.rows?.length || info.state !== "running") paint();
        if (info.state !== "running") {
          finished(info);
          return;
        }
        if (!info.more) await nap(POLL_MS);
      }
    } catch (err) {
      if (typeof document === "undefined") return;
      setRunning(false);
      showMessage(apiMessage(err, "Lost track of the run."));
    } finally {
      S.following = false;
    }
  }

  function finished(info) {
    setRunning(false);
    const hosts = info.counts.hosts;
    const failed = info.sources.filter((s) => s.state === "failed" || s.state === "timeout").length;
    const words = info.state === "cancelled" ? `Cancelled with ${hosts} host${hosts === 1 ? "" : "s"} found.` : `Done: ${hosts} host${hosts === 1 ? "" : "s"} found${failed ? ` (${failed} source${failed === 1 ? "" : "s"} didn't answer)` : ""}.`;
    announce(words);
    toast(words, { kind: info.state === "cancelled" || failed ? "info" : "success" });
    loadHistory();
  }

  async function cancel() {
    if (!S.runId || !S.running) return;
    ui.cancel.disabled = true;
    try {
      await call("subdomains/cancel", { id: S.runId });
      log("warn", "Cancel requested. Stopping...");
      S.wake?.();
    } catch (err) {
      toast(apiMessage(err, "Couldn't cancel."), { kind: "error" });
    } finally {
      ui.cancel.disabled = false;
    }
  }

  // ---- the table -------------------------------------------------------------------------------------------------
  const filter = () => ({ text: ui.filterText.value, ip: ui.filterIp.value, status: ui.filterStatus.value, source: ui.filterSource.value, onlyLive: ui.onlyLive.checked });
  const selectedRow = () => (S.selected ? S.rows.get(S.selected) ?? null : null);

  function selectionButtons() {
    const row = selectedRow();
    for (const b of [ui.selNetwork, ui.selCopyUrl, ui.selCopyRow]) b.disabled = !row;
    ui.selBrowser.disabled = !row || !S.runId;
    ui.selBrowser.title = !S.runId && row ? "Only hosts of a run from this session can be opened. Kept results from the history can't." : "Open the selected host in your web browser. Only http and https addresses are opened, and only when you press this.";
    ui.selected.textContent = row ? `Selected: ${row.host}` : "Click a row to work with that host.";
  }

  function select(host) {
    S.selected = host;
    for (const tr of ui.tbody.children) tr.setAttribute("aria-selected", tr.dataset.host === host ? "true" : "false");
    selectionButtons();
  }

  function paint() {
    const all = [...S.rows.values()];
    S.view = sortRows(filterRows(all, filter()), S.sort.key, S.sort.dir);
    const empty = all.length ? "Nothing matches the filters above. Clear them to see every host." : S.running ? "Waiting for the sources…" : "No hosts yet. Type a domain and press Find subdomains.";
    paintRows(ui, S.view, S.limit, S.selected, { select, copyCell }, empty);
    paintSortHeads(ui.thead, S.sort.key, S.sort.dir);
    ui.counts.textContent = all.length || S.runId ? `${countsLine(all, S.view, S.used)}${S.banner ? ` · ${S.banner}` : ""}` : "No run yet.";
    selectionButtons();
  }
  const repaint = debounce(paint, 120);

  function sort(key) {
    S.sort = S.sort.key === key ? { key, dir: S.sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
    paint();
    announce(`Sorted by ${COLUMNS.find((c) => c.key === key).label}, ${S.sort.dir === "asc" ? "ascending" : "descending"}`);
  }

  ui.table.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== " ") return;
    const rows = [...ui.tbody.querySelectorAll("tr[data-host]")];
    if (!rows.length) return;
    const at = rows.findIndex((tr) => tr.dataset.host === S.selected);
    const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : e.key === "ArrowUp" ? Math.max(0, at < 0 ? 0 : at - 1) : Math.max(0, at);
    e.preventDefault();
    select(rows[next].dataset.host);
    rows[next].focus?.();
  });
  ui.table.tabIndex = 0;

  // ---- copying ---------------------------------------------------------------------------------------------------
  // The Copy button of the table copies every row that passes the filter, not only the rows drawn so far.
  registerCopySource(ui.table, () => {
    if (!S.view.length) return null;
    return { text: tableTsv(S.view), tsv: tableTsv(S.view), markdown: tableMarkdown(S.view), json: tableJson(S.view) };
  }, "Subdomains");

  function needRows() {
    if (S.view.length) return true;
    toast("There are no results to copy yet.", { kind: "error" });
    return false;
  }
  function copyHosts() {
    if (needRows()) copyToClipboard(hostsText(S.view), { what: `${S.view.length} hosts` });
  }
  function copyAs(kind) {
    if (!needRows()) return;
    const text = kind === "csv" ? tableCsv(S.view) : kind === "json" ? tableJson(S.view) : tableMarkdown(S.view);
    copyToClipboard(text, { what: `results as ${kind.toUpperCase()}` });
  }
  function copyColumn() {
    if (!needRows()) return;
    const column = COLUMNS.find((c) => c.key === ui.copyColumn.value);
    copyToClipboard(S.view.map((r) => cells(r)[column.key]).join("\n"), { what: `the ${column.label} column` });
  }
  function copyRow() {
    const row = selectedRow();
    if (row) copyToClipboard(rowsToTsv([tableRows([row])[1]]), { what: row.host });
  }
  function copyCell(text, label) {
    if (text) copyToClipboard(text, { what: label });
  }
  function copyUrl() {
    const row = selectedRow();
    if (row) copyToClipboard(urlFor(row), { what: "the address" });
  }
  function openNetwork() {
    const row = selectedRow();
    if (!row) return;
    emit("open-in-network", { host: row.host });
    log("info", `Opened ${row.host} in the Network tab.`);
  }
  async function openBrowser() {
    const row = selectedRow();
    if (!row || !S.runId) return;
    try {
      const res = await call("subdomains/open", { id: S.runId, host: row.host, scheme: row.httpScheme ?? "https" });
      toast(`Opened ${res.opened} in your web browser.`, { kind: "success" });
    } catch (err) {
      toast(apiMessage(err, "Couldn't open the web browser."), { kind: "error" });
    }
  }

  // ---- saving ----------------------------------------------------------------------------------------------------
  function useFolder() {
    const here = currentPath();
    if (!here) return toast("You aren't in a normal folder right now. Type a folder instead.", { kind: "error" });
    ui.folder.value = here;
    S.folderTouched = true;
  }

  function saveTarget() {
    if (!S.runId) {
      toast("Export and reports work on a run from this session. Run it again to export.", { kind: "error" });
      return null;
    }
    const folder = ui.folder.value.trim();
    if (!folder) {
      toast("Type the folder to save in, like ~/Documents (or press \"Use current folder\").", { kind: "error" });
      ui.folder.focus();
      return null;
    }
    return folder;
  }

  async function exportFile() {
    const folder = saveTarget();
    if (!folder) return;
    if (!S.view.length) return toast("There is nothing to export yet.", { kind: "error" });
    const narrowed = S.view.length < S.rows.size;
    try {
      const res = await call("subdomains/export", { id: S.runId, format: ui.format.value, folder, name: ui.name.value.trim() || undefined, hosts: narrowed ? S.view.map((r) => r.host) : undefined });
      toast(`Saved ${res.count} host${res.count === 1 ? "" : "s"} as "${res.name}".`, { kind: "success" });
      log("ok", `Exported to ${res.path}`);
    } catch (err) {
      toast(apiMessage(err, "Couldn't save the file."), { kind: "error" });
    }
  }

  async function saveReport() {
    const folder = saveTarget();
    if (!folder) return;
    try {
      const res = await call("subdomains/report", { id: S.runId, folder, name: ui.name.value.trim() || undefined });
      toast(`Report saved as "${res.name}".`, { kind: "success" });
      log("ok", `Report saved to ${res.path}`);
    } catch (err) {
      toast(apiMessage(err, "Couldn't save the report."), { kind: "error" });
    }
  }

  // ---- history ---------------------------------------------------------------------------------------------------
  async function loadHistory() {
    try {
      const res = await call("subdomains/history");
      clear(ui.historyList);
      ui.historyList.append(...res.history.map((entry) => historyItem(entry, { use: (e) => { ui.domain.value = e.unicode || e.domain; syncPermission(); ui.domain.focus(); }, load: showKept })));
      ui.historyEmpty.hidden = res.history.length > 0;
      ui.clearHistory.disabled = res.history.length === 0;
    } catch (err) {
      log("warn", apiMessage(err, "Couldn't load the history."));
    }
  }

  async function showKept(entry) {
    if (S.running) return toast("Wait for the running run to finish, or cancel it first.", { kind: "error" });
    try {
      const full = (await call("subdomains/history", { id: entry.id })).entry;
      resetResults();
      S.runId = null;
      S.used = { resolve: full.steps.resolve, probeHttp: full.steps.probeHttp, ports: full.steps.ports.length > 0, wildcard: full.steps.wildcard };
      for (const row of full.results ?? []) S.rows.set(row.host, row);
      S.banner = `kept results from ${new Date(full.at).toLocaleString()}${full.resultsCut ? " (cut to the first 2000)" : ""}`;
      ui.shown.textContent = `Showing ${full.unicode !== full.domain ? `${full.unicode} (${full.domain})` : full.domain}`;
      paint();
      announce(`Showing ${S.rows.size} kept hosts`);
    } catch (err) {
      toast(apiMessage(err, "Couldn't show those results."), { kind: "error" });
    }
  }

  async function clearHistory() {
    try {
      const res = await call("subdomains/history/clear", {});
      toast(res.cleared ? `Forgot ${res.cleared} run${res.cleared === 1 ? "" : "s"}.` : "The history was already empty.", { kind: "success" });
      await loadHistory();
    } catch (err) {
      toast(apiMessage(err, "Couldn't clear the history."), { kind: "error" });
    }
  }

  // ---- start-up --------------------------------------------------------------------------------------------------
  for (const el of [ui.filterText, ui.filterIp, ui.filterStatus, ui.filterSource]) el.addEventListener("input", repaint);
  ui.onlyLive.addEventListener("change", paint);
  ui.domain.addEventListener("input", () => { clearMessage(); syncPermission(); });
  ui.domain.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });
  for (const box of [ui.resolve, ui.probeHttp, ui.probePorts, ui.wildcard]) box.input.addEventListener("change", () => syncSteps(box.input));
  ui.permissionBox.input.addEventListener("change", clearMessage);
  ui.folder.addEventListener("input", () => (S.folderTouched = true));
  syncSteps(null);
  paint();

  call("subdomains/info").then((info) => {
    S.info = info;
    S.limits = { ...DEFAULT_LIMITS, ...info.limits };
    const programOk = info.tools.subfinder.installed;
    for (const source of info.sources) {
      const installed = source.id !== "subfinder" || programOk;
      const entry = sourceRow(source, installed, info.tools.subfinder.hint);
      S.entries.set(source.id, entry);
      ui.sourceList.append(entry.li);
      ui.filterSource.append(h("option", { value: source.id }, source.label));
    }
    ui.timeout.value = String(info.defaults.timeoutSec);
    ui.max.value = String(info.defaults.maxResults);
    ui.ports.value = info.defaults.ports;
  }).catch((err) => log("warn", apiMessage(err, "Couldn't load the list of sources.")));
  loadHistory();

  return {
    show() {
      S.hidden = false;
      if (!S.folderTouched && !ui.folder.value) ui.folder.value = currentPath();
      if (S.running) follow();
      loadHistory();
      ui.domain.focus();
    },
    hide() {
      S.hidden = true;
      S.wake?.();
    },
  };
}

registerPowerTab({
  id: "subs", label: "Subdomains", icon: "🔭", group: "network", tip: "Find the subdomains of a domain from public sources, with optional DNS, web and port checks",
  mount,
});
