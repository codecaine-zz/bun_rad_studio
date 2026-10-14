// "Network" tool of the Power tools panel: look at another computer from this one (web check, ports, DNS, SSL
// certificate, TCP ping). The page never contacts other computers itself: every check is asked of the File Manager
// server, which applies the safety limits. Long scans run in the background and are followed by polling.
import { announce, clear, h } from "./dom.js";
import { ApiError, call } from "./api.js";
import { toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { currentPath } from "./state.js";
import { buildLayout } from "./netform.js";
import * as view from "./netview.js";

const POLL_MS = 300;

function mount(root) {
  root.classList.add("net-root");
  const S = { task: null, busy: false, report: "", showing: "", lastScan: null, scanId: null, activitySince: 0, hidden: false, folderTouched: false, wake: null, timer: 0, paintKey: "" };
  const ui = buildLayout(root, { httpCheck, checkPort, scanTop, scanList, dns: runDns, dnsAll, tls: runTls, ping, cancel, copy, save, clear: clearAll, useFolder });

  // ---- small helpers -------------------------------------------------------------------------------------------
  function setBusy(on) {
    S.busy = on;
    for (const b of root.querySelectorAll(".net-run")) b.disabled = on;
    ui.cancel.hidden = !S.task;
    root.setAttribute("aria-busy", String(on));
  }

  function log(level, text, at) {
    const el = ui.consoleEl;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.append(view.consoleLine(level, text, at));
    while (el.childElementCount > 500) el.firstElementChild.remove();
    if (atBottom) el.scrollTop = el.scrollHeight;
  }
  const logAll = (lines) => (lines ?? []).forEach((l) => log(l.level, l.text, l.at));

  function show(result, kind, message) {
    ui.results.replaceChildren(result.node);
    S.report = result.text;
    S.showing = kind;
    if (message) announce(message);
  }

  function fail(title, err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong.";
    show(view.renderError(title, message), "error", `${title} ${message}`);
    log("error", message);
  }

  function needHost() {
    const value = ui.host.value.trim();
    if (value) return value;
    toast("Type the name or address of a computer first.", { kind: "error" });
    ui.host.focus();
    return null;
  }

  function needPort() {
    const value = ui.port.value.trim();
    if (value) return value;
    toast("Type a port number first (for example 443 for secure websites).", { kind: "error" });
    ui.port.focus();
    return null;
  }

  const timeoutMs = () => Number(ui.timeout.value) || 500;

  async function refreshAudit() {
    try {
      const res = await call("net/activity", { since: S.activitySince });
      S.activitySince = res.total;
      for (const row of res.rows.slice(-200)) ui.auditBody.prepend(view.activityRow(row));
      while (ui.auditBody.childElementCount > 200) ui.auditBody.lastElementChild.remove();
      ui.auditEmpty.hidden = ui.auditBody.childElementCount > 0;
    } catch {
      // The audit list is a convenience; a missed refresh isn't worth an error.
    }
  }

  // ---- quick checks (the answer comes back in one go) -------------------------------------------------------------
  async function quick(label, work) {
    if (S.busy) return;
    setBusy(true);
    ui.status.textContent = `${label}...`;
    log("info", `${label}...`);
    try {
      await work();
    } catch (err) {
      fail("That check didn't work.", err);
    } finally {
      ui.status.textContent = "";
      setBusy(false);
      refreshAudit();
    }
  }

  function httpCheck() {
    const host = needHost();
    if (!host) return;
    quick(`Checking the website at ${host}`, async () => {
      const body = { host, scheme: ui.scheme.value, method: ui.readBody.checked ? "GET" : "HEAD" };
      if (ui.port.value.trim()) body.port = ui.port.value.trim();
      const res = await call("net/probe", body);
      logAll(res.log);
      show(view.renderProbe(res), "probe", res.error ? res.error.message : `Web check finished: ${res.status} ${res.statusText}`);
    });
  }

  function runTls() {
    const host = needHost();
    if (!host) return;
    quick(`Reading the SSL certificate of ${host}`, async () => {
      const body = { host };
      if (ui.port.value.trim()) body.port = ui.port.value.trim();
      const res = await call("net/tls", body);
      logAll(res.log);
      show(view.renderTls(res), "tls", res.explain);
    });
  }

  function runDns(type) {
    const host = needHost();
    if (!host) return;
    quick(`Looking up ${type} records for ${host}`, async () => {
      const res = await call("net/dns", { host, type });
      const r = res.result;
      log(r.error ? "error" : r.lines.length ? "ok" : "warn", `${type} for ${host}: ${r.error ? r.error.message : r.lines.length ? `${r.lines.length} line(s) from ${r.sourceLabel}` : "no records"} (${r.elapsedMs} ms)`);
      show(view.renderDns(res), "dns", `${type} lookup finished`);
    });
  }

  function dnsAll() {
    const host = needHost();
    if (!host) return;
    quick(`Running a full DNS audit of ${host}`, async () => {
      const res = await call("net/dns", { host, type: "ALL" });
      log("ok", `DNS audit of ${host}: ${res.active} of ${res.results.length} record types have data (${res.elapsedMs} ms)`);
      show(view.renderDnsAudit(res), "dns", "DNS audit finished");
    });
  }

  // ---- background tasks (scan, ping) -----------------------------------------------------------------------------
  const nap = (ms) => new Promise((resolve) => {
    S.wake = () => {
      clearTimeout(S.timer);
      S.wake = null;
      resolve();
    };
    S.timer = setTimeout(S.wake, ms);
  });

  function paint(task) {
    const key = `${task.state}/${task.done}/${ui.openOnly.checked}`;
    if (key !== S.paintKey) {
      S.paintKey = key;
      show(task.kind === "ping" ? view.renderPing(task) : view.renderScan(task, ui.openOnly.checked), task.kind === "ping" ? "ping" : "scan");
    }
    ui.progress.hidden = task.state !== "running";
    ui.progress.max = Math.max(1, task.total);
    ui.progress.value = task.done;
    ui.status.textContent = task.state === "running" ? `${task.done} of ${task.total} done` : "";
  }

  /** Polls a task until it ends (or the tab is left). Returns the final picture of the task, or null. */
  async function follow(first) {
    const all = [];
    let snap = first;
    for (;;) {
      all.push(...snap.results);
      logAll(snap.log);
      const picture = { ...snap, results: all };
      paint(picture);
      if (snap.state !== "running") return picture;
      await nap(POLL_MS);
      if (S.hidden) return null;
      snap = (await call("net/status", { id: first.id, logFrom: snap.logCount, resultFrom: snap.resultCount })).task;
      refreshAudit();
    }
  }

  async function startTask(op, body, label) {
    if (S.busy) return;
    setBusy(true);
    S.paintKey = "";
    log("info", label);
    try {
      const first = (await call(op, body)).task;
      S.task = first.id;
      ui.cancel.hidden = false;
      const done = await follow(first);
      if (done) {
        if (done.kind === "scan") {
          S.lastScan = done;
          S.scanId = done.id;
          ui.format.querySelector('option[value="csv"]').disabled = false;
        }
        announce(done.summary || "Finished");
        toast(done.summary || "Finished.", { kind: done.error ? "error" : "info" });
      }
    } catch (err) {
      fail("The check couldn't start.", err);
    } finally {
      S.task = null;
      ui.progress.hidden = true;
      ui.status.textContent = "";
      setBusy(false);
      refreshAudit();
    }
  }

  function checkPort() {
    const host = needHost();
    const port = host && needPort();
    if (host && port) startTask("net/scan", { host, mode: "single", port, timeoutMs: timeoutMs() }, `Checking port ${port} on ${host}...`);
  }

  function scanTop() {
    const host = needHost();
    if (host) startTask("net/scan", { host, mode: "top", timeoutMs: timeoutMs() }, `Scanning the common ports on ${host}...`);
  }

  function scanList() {
    const host = needHost();
    if (!host) return;
    const ports = ui.ports.value.trim();
    if (!ports) {
      toast("Type the ports to scan, like 22,80,443 or 8000-8010.", { kind: "error" });
      ui.ports.focus();
      return;
    }
    startTask("net/scan", { host, mode: "list", ports, timeoutMs: timeoutMs() }, `Scanning your list of ports on ${host}...`);
  }

  function ping() {
    const host = needHost();
    if (!host) return;
    const body = { host, count: 5, timeoutMs: Math.max(500, timeoutMs()) };
    if (ui.port.value.trim()) body.port = ui.port.value.trim();
    startTask("net/tcpping", body, `Timing 5 connections to ${host}...`);
  }

  async function cancel() {
    if (!S.task) return;
    ui.cancel.disabled = true;
    try {
      await call("net/cancel", { id: S.task });
      log("warn", "Cancel requested. Closing the connections...");
      S.wake?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel.", { kind: "error" });
    } finally {
      ui.cancel.disabled = false;
    }
  }

  // ---- report: copy, save, clear ---------------------------------------------------------------------------------
  async function copy() {
    if (!S.report.trim()) return toast("Nothing to copy yet. Run a check first.", { kind: "error" });
    const text = S.report.length > 99000 ? `${S.report.slice(0, 99000)}\n(report cut short)` : S.report;
    try {
      const res = await call("copytext", { text });
      toast(res.copied ? "Report copied. Paste it where you need it." : "Couldn't copy to the clipboard.", { kind: res.copied ? "success" : "error" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't copy that.", { kind: "error" });
    }
  }

  async function save() {
    const asCsv = ui.format.value === "csv";
    if (!asCsv && !S.report.trim()) return toast("There is nothing to save yet. Run a check first.", { kind: "error" });
    const folder = ui.folder.value.trim();
    if (!folder) {
      toast("Type the folder to save in, like ~/Documents (or press \"Use current folder\").", { kind: "error" });
      ui.folder.focus();
      return;
    }
    try {
      const res = await call("net/save", { folder, name: ui.name.value.trim() || undefined, text: S.report, format: asCsv ? "csv" : "text", taskId: asCsv ? S.scanId : undefined });
      toast(`Saved as "${res.name}".`, { kind: "success" });
      log("ok", `Report saved to ${res.path}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the report.", { kind: "error" });
    }
  }

  function useFolder() {
    const here = currentPath();
    if (!here) return toast("You aren't in a normal folder right now. Type a folder instead.", { kind: "error" });
    ui.folder.value = here;
    S.folderTouched = true;
  }

  async function clearAll() {
    if (S.busy) return toast("Wait for the running check to finish, or cancel it first.", { kind: "error" });
    try {
      await call("net/clear", {});
    } catch {
      // Clearing the page still makes sense if the server can't be reached.
    }
    clear(ui.consoleEl);
    clear(ui.auditBody);
    ui.auditEmpty.hidden = false;
    S.lastScan = null;
    S.scanId = null;
    ui.format.value = "text";
    ui.format.querySelector('option[value="csv"]').disabled = true;
    show(view.renderWelcome([], null), "welcome");
    log("info", "Cleared.");
  }

  // ---- start-up --------------------------------------------------------------------------------------------------
  function pick(preset) {
    ui.host.value = preset.host;
    ui.port.value = String(preset.port);
    log("info", `Target set to ${preset.host}:${preset.port} (${preset.label}).`);
    announce(`Target set to ${preset.host} port ${preset.port}`);
  }

  ui.openOnly.addEventListener("change", () => {
    if (S.lastScan && S.showing === "scan" && !S.busy) show(view.renderScan(S.lastScan, ui.openOnly.checked), "scan");
  });
  ui.folder.addEventListener("input", () => (S.folderTouched = true));
  const onEnter = (action) => (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
    }
  };
  ui.host.addEventListener("keydown", onEnter(httpCheck));
  ui.port.addEventListener("keydown", onEnter(httpCheck));
  ui.ports.addEventListener("keydown", onEnter(scanList));
  ui.timeout.addEventListener("keydown", onEnter(scanList));

  show(view.renderWelcome([], null), "welcome");
  call("net/presets").then((res) => {
    ui.presetRow.append(
      h("span", { class: "pw-hint" }, "Quick targets:"),
      ...res.presets.map((p) => h("button", { type: "button", class: "pw-btn net-run", title: `${p.note} Fills in ${p.host} and port ${p.port}.`, onclick: () => pick(p) }, p.label)),
    );
    if (S.showing === "welcome") show(view.renderWelcome(res.connections, res.limits), "welcome");
  }).catch((err) => log("warn", err instanceof ApiError ? err.message : "Couldn't load the quick targets."));

  return {
    show() {
      S.hidden = false;
      if (!S.folderTouched && !ui.folder.value) ui.folder.value = currentPath();
      ui.host.focus();
    },
    hide() {
      S.hidden = true;
      S.wake?.();
      if (S.task) {
        log("warn", "Cancelled because you left the Network tab.");
        call("net/cancel", { id: S.task }).catch(() => {});
      }
    },
  };
}

registerPowerTab({
  id: "net", label: "Network", icon: "📡", tip: "Ports, DNS, TLS certificates and connection checks",
  mount,
});
