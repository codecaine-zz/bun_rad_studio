// "Downloads" tool of the Power tools panel: fast downloads split over several connections, with pause and resume.
// The work is done by the server (src/features/filemanager/fmDownloads.ts) so downloads keep going while you do other
// things; this page adds addresses, polls for progress while the tab is open, and draws one row per download.
import { h } from "./dom.js";
import { ApiError, call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { currentPath, emit } from "./state.js";
import { goTo } from "./nav.js";
import { registerPowerTab } from "./power.js";
import { formatSize } from "./util.js";

const POLL_MS = 600;
const BACKGROUND_POLL_MS = 2500;
const CONNECTION_CHOICES = [1, 2, 4, 8, 16, 32];
const SPEED_UNITS = [["KB/s", 1024], ["MB/s", 1024 * 1024]];

const STATE_WORD = { queued: "Waiting", probing: "Connecting", downloading: "Downloading", paused: "Paused", verifying: "Checking", done: "Done", error: "Problem" };

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ${Math.round(seconds % 60)} s`;
  const hrs = Math.floor(m / 60);
  return hrs < 48 ? `${hrs} h ${m % 60} min` : `${Math.floor(hrs / 24)} days`;
}

const speedText = (n) => `${formatSize(Math.max(0, Math.round(n)))}/s`;

function mount(root) {
  root.dataset.view = "downloads";
  let data = { items: [], settings: { connections: 8, maxConcurrent: 3, speedLimit: 0, folder: "", retries: 6 }, maxConnections: 32 };
  const rows = new Map();
  const lastState = new Map();
  let timer = 0;
  let visible = false;
  let polling = false;
  let failing = false;
  let settingsReady = false;

  const act = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work. Try again.", { kind: "error" });
    }
  };

  /* ---------------------------------------------------------------- add form */
  const urls = h("textarea", { class: "pw-mono dl-urls", rows: "3", spellcheck: "false", autocomplete: "off", placeholder: "Paste one or more web addresses, one per line:\nhttps://example.com/big-file.zip", "aria-label": "Web addresses to download" });
  const folder = h("input", { type: "text", class: "dl-folder", spellcheck: "false", autocomplete: "off", placeholder: "Folder to save into (empty = the download folder below)", "aria-label": "Folder to save into" });
  const useFolder = h("button", { type: "button", class: "pw-btn", title: "Save into the folder shown in the file list", onclick: () => { folder.value = currentPath(); } }, "Use the open folder");
  const connections = h("select", { class: "dl-select", title: "How many connections share the work for each file. More is faster on most servers, up to a point.", "aria-label": "Connections per file" });
  const checksum = h("input", { type: "text", class: "pw-mono dl-checksum", spellcheck: "false", autocomplete: "off", placeholder: "Optional checksum: sha256:…", title: "Checked when the file is finished. Only for a single address.", "aria-label": "Checksum" });
  const saveAs = h("input", { type: "text", class: "dl-name", spellcheck: "false", autocomplete: "off", placeholder: "Optional: save as…", title: "Use this file name instead of the server's. Only for a single address.", "aria-label": "File name" });
  const headers = h("textarea", { class: "pw-mono dl-headers", rows: "2", spellcheck: "false", autocomplete: "off", placeholder: "Header: value (one per line), for a login cookie or a referer", "aria-label": "Extra request headers" });
  const startNow = h("input", { type: "checkbox", checked: true });
  const info = h("p", { class: "pw-hint dl-info", role: "status" }, "Paste an address and press Download. “Check the file” shows its size and whether it can be split and resumed.");
  const probeBtn = h("button", { type: "button", class: "pw-btn", title: "Ask the server about the file without downloading it", onclick: act(probe) }, "Check the file");
  const go = h("button", { type: "button", class: "pw-btn primary", onclick: act(addDownloads) }, "⬇ Download");

  const addCard = h("section", { class: "pw-card dl-add", "aria-label": "Add downloads" },
    h("h3", {}, "Add downloads"),
    urls,
    h("div", { class: "pw-row" }, folder, useFolder),
    h("div", { class: "pw-row dl-options" },
      h("label", { class: "dl-field" }, "Connections", connections),
      saveAs, checksum,
      h("label", { class: "dl-check" }, startNow, " Start right away")),
    h("details", { class: "dl-more" }, h("summary", {}, "Headers (cookies, referer, authorization)"), headers),
    h("div", { class: "pw-row" }, go, probeBtn),
    info);

  /* ---------------------------------------------------------------- settings and toolbar */
  const maxConcurrent = h("select", { class: "dl-select", title: "How many files download at the same time. The rest wait in line.", "aria-label": "Files at the same time" });
  for (let i = 1; i <= 10; i++) maxConcurrent.append(h("option", { value: String(i) }, String(i)));
  const defaultConnections = h("select", { class: "dl-select", title: "Connections per file when you don't choose.", "aria-label": "Default connections" });
  const limit = h("input", { type: "number", min: "0", step: "1", class: "dl-number", title: "0 = no limit. The limit is shared by everything that is downloading.", "aria-label": "Speed limit" });
  const limitUnit = h("select", { class: "dl-select", "aria-label": "Speed limit unit" }, SPEED_UNITS.map(([name, v]) => h("option", { value: String(v) }, name)));
  limitUnit.value = String(1024 * 1024);
  const defaultFolder = h("input", { type: "text", class: "dl-folder", spellcheck: "false", autocomplete: "off", title: "Where files go when you don't choose a folder.", "aria-label": "Download folder" });
  const saveSettings = h("button", { type: "button", class: "pw-btn", onclick: act(applySettings) }, "Save settings");
  const settingsCard = h("details", { class: "pw-card dl-settings" },
    h("summary", {}, "Settings"),
    h("div", { class: "pw-row" },
      h("label", { class: "dl-field" }, "Files at once", maxConcurrent),
      h("label", { class: "dl-field" }, "Connections per file", defaultConnections),
      h("label", { class: "dl-field" }, "Speed limit", h("span", { class: "dl-inline" }, limit, limitUnit))),
    h("div", { class: "pw-row" }, h("label", { class: "dl-field dl-grow" }, "Download folder", defaultFolder), saveSettings));

  const pauseAll = h("button", { type: "button", class: "pw-btn", onclick: act(() => post("dl/pauseAll")) }, "Pause all");
  const resumeAll = h("button", { type: "button", class: "pw-btn", onclick: act(() => post("dl/resumeAll")) }, "Resume all");
  const clearDone = h("button", { type: "button", class: "pw-btn", title: "Remove the finished ones from the list (the files stay)", onclick: act(() => post("dl/clear")) }, "Clear finished");
  const summary = h("span", { class: "pw-status dl-summary", role: "status" });
  const empty = h("p", { class: "pw-hint dl-empty" }, "No downloads yet.");
  const list = h("div", { class: "dl-list", role: "list", "aria-label": "Downloads" });
  const listCard = h("section", { class: "pw-card", "aria-label": "Downloads" },
    h("div", { class: "pw-row dl-bar" }, h("h3", {}, "Downloads"), pauseAll, resumeAll, clearDone, summary),
    empty, list);

  root.append(addCard, listCard, settingsCard);
  for (const n of CONNECTION_CHOICES) {
    connections.append(h("option", { value: String(n) }, `${n} connection${n === 1 ? "" : "s"}`));
    defaultConnections.append(h("option", { value: String(n) }, String(n)));
  }
  connections.value = "8";

  /* ---------------------------------------------------------------- talking to the server */
  async function post(op, body = {}) {
    const r = await call(op, body);
    data = r;
    render();
    // A resumed or newly added download needs progress updates again (the timer stops when nothing is busy).
    if (busy()) startPolling();
    return r;
  }

  function parseHeaders() {
    const out = {};
    for (const line of headers.value.split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  }

  async function probe() {
    const first = urls.value.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    if (!first) return void (info.textContent = "Paste an address first.");
    info.textContent = "Asking the server…";
    try {
      const r = await call("dl/probe", { url: first, headers: parseHeaders() });
      const parts = [r.name, r.size === null ? "size unknown" : formatSize(r.size)];
      parts.push(r.ranges && r.size ? "can be split over several connections and resumed ✓" : "this server sends the whole file in one piece (no splitting or resuming)");
      info.textContent = parts.join(" · ");
      if (!saveAs.value && urls.value.trim().split("\n").length === 1) saveAs.placeholder = `Optional: save as… (${r.name})`;
    } catch (err) {
      info.textContent = err instanceof ApiError ? err.message : "Couldn't ask the server.";
    }
  }

  async function addDownloads() {
    const body = { urls: urls.value, connections: Number(connections.value), start: startNow.checked };
    if (folder.value.trim()) body.folder = folder.value.trim();
    const h2 = parseHeaders();
    if (Object.keys(h2).length) body.headers = h2;
    if (saveAs.value.trim()) body.name = saveAs.value.trim();
    if (checksum.value.trim()) body.checksum = checksum.value.trim();
    const r = await post("dl/add", body);
    urls.value = "";
    saveAs.value = "";
    checksum.value = "";
    info.textContent = `${r.added.length === 1 ? "Added." : `Added ${r.added.length} downloads.`}`;
    startPolling();
  }

  async function applySettings() {
    const unit = Number(limitUnit.value);
    await post("dl/settings", { settings: {
      maxConcurrent: Number(maxConcurrent.value), connections: Number(defaultConnections.value),
      speedLimit: Math.round(Math.max(0, Number(limit.value) || 0) * unit), folder: defaultFolder.value.trim() || undefined,
    } });
    toast("Settings saved.", { kind: "success" });
  }

  function fillSettings() {
    const s = data.settings;
    maxConcurrent.value = String(s.maxConcurrent);
    defaultConnections.value = String(s.connections);
    connections.value = String(s.connections);
    if (s.speedLimit > 0) {
      const mb = s.speedLimit >= 1024 * 1024;
      limitUnit.value = String(mb ? 1024 * 1024 : 1024);
      limit.value = String(Math.round((s.speedLimit / (mb ? 1024 * 1024 : 1024)) * 10) / 10);
    } else limit.value = "0";
    defaultFolder.value = s.folder;
    folder.placeholder = `Empty = ${s.folder}`;
  }

  /* ---------------------------------------------------------------- rows */
  function button(label, title, onclick, cls = "") {
    return h("button", { type: "button", class: `pw-btn dl-btn ${cls}`.trim(), title, onclick: act(onclick) }, label);
  }

  function buildRow(item) {
    const name = h("span", { class: "dl-name-text" });
    const chip = h("span", { class: "dl-chip" });
    const bar = h("div", { class: "dl-bar-fill" });
    const track = h("div", { class: "dl-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" }, bar);
    const stats = h("span", { class: "dl-stats" });
    const note = h("span", { class: "dl-note" });
    const buttons = h("span", { class: "dl-buttons" });
    const el = h("div", { class: "dl-row", role: "listitem", dataset: { id: item.id } },
      h("div", { class: "dl-top" }, name, chip), track, h("div", { class: "dl-bottom" }, stats, buttons), note);
    return { el, name, chip, bar, track, stats, note, buttons, key: "" };
  }

  function updateRow(r, item) {
    r.el.dataset.state = item.state;
    r.name.textContent = item.name;
    r.name.title = `${item.url}\n${item.path}`;
    r.chip.textContent = STATE_WORD[item.state] ?? item.state;
    const pct = item.size ? Math.min(100, (item.received / item.size) * 100) : item.state === "done" ? 100 : 0;
    r.bar.style.width = `${item.size ? pct : item.state === "downloading" ? 35 : 0}%`;
    r.track.classList.toggle("dl-unknown", !item.size && item.state === "downloading");
    r.track.setAttribute("aria-valuenow", String(Math.round(pct)));
    const parts = [item.size ? `${formatSize(item.received)} of ${formatSize(item.size)} (${Math.floor(pct)}%)` : formatSize(item.received) || "0 bytes"];
    if (item.state === "downloading") {
      parts.push(speedText(item.speed));
      if (item.eta !== null) parts.push(`${formatDuration(item.eta)} left`);
      parts.push(`${item.active} connection${item.active === 1 ? "" : "s"}`);
    } else if (item.state === "done" && item.startedAt && item.finishedAt) {
      parts.push(`in ${formatDuration((item.finishedAt - item.startedAt) / 1000)}`);
      if (item.verified) parts.push("checksum ✓");
    } else if (item.state === "paused" && item.resumable === false) parts.push("can't be resumed");
    r.stats.textContent = parts.join(" · ");
    r.note.textContent = item.message ?? "";
    r.note.hidden = !item.message;
    r.note.classList.toggle("dl-problem", item.state === "error");

    const key = item.state;
    if (key === r.key) return;
    r.key = key;
    const b = [];
    if (item.state === "downloading" || item.state === "probing" || item.state === "queued") b.push(button("⏸ Pause", "Stop for now and keep what is downloaded", () => post("dl/pause", { id: item.id })));
    if (item.state === "paused") b.push(button("▶ Resume", "Continue where it stopped", () => post("dl/resume", { id: item.id }), "primary"));
    if (item.state === "error") b.push(button("↻ Try again", "Start this download again", () => post("dl/resume", { id: item.id }), "primary"));
    b.push(button("📂 Open folder", "Open the download folder in this File Manager", () => openFolder(item.id)));
    b.push(button("System file manager", "Show the file or folder in your system's file manager in a separate window", () => call("dl/reveal", { id: item.id })));
    if (item.state === "done") b.push(button("🗑 Delete file…", "Delete the downloaded file and remove it from the list", () => removeWithFile(item), "danger"));
    b.push(button("✕ Remove", item.state === "done" ? "Remove it from this list (the file stays)" : "Stop it and delete what was downloaded so far", () => removeEntry(item)));
    r.buttons.replaceChildren(...b);
  }

  /** The download as it is right now (the buttons outlive the snapshot they were drawn from). */
  const current = (id) => data.items.find((i) => i.id === id);

  async function openFolder(id) {
    const item = current(id);
    if (!item) {
      toast("That download isn't in the list any more.", { kind: "error" });
      return;
    }
    if (await goTo(item.folder, { select: item.state === "done" ? item.path : null })) {
      emit("workspace-go", "files");
      document.getElementById("list")?.focus();
    }
  }

  async function removeEntry(was) {
    const item = current(was.id) ?? was;
    if (item.state !== "done" && item.received > 0) {
      const ok = await confirmBox({ title: "Remove this download?", message: `${item.name} is ${Math.floor(item.size ? (item.received / item.size) * 100 : 0)}% done. Removing it deletes what was downloaded so far.`, confirmLabel: "Remove", danger: true });
      if (!ok) return;
    }
    await post("dl/remove", { id: item.id });
  }

  async function removeWithFile(was) {
    const item = current(was.id) ?? was;
    const ok = await confirmBox({ title: "Delete this file?", message: `${item.name} will be deleted from your computer.`, details: [item.path], confirmLabel: "Delete file", danger: true });
    if (ok) await post("dl/remove", { id: item.id, deleteFile: true });
  }

  function render() {
    const seen = new Set();
    for (const item of data.items) {
      seen.add(item.id);
      let r = rows.get(item.id);
      if (!r) {
        r = buildRow(item);
        rows.set(item.id, r);
      }
      updateRow(r, item);
      const before = lastState.get(item.id);
      if (before && before !== item.state) {
        if (item.state === "done") toast(`Downloaded ${item.name}`, { kind: "success" });
        else if (item.state === "error") toast(`${item.name}: ${item.message}`, { kind: "error" });
      }
      lastState.set(item.id, item.state);
    }
    for (const [id, r] of rows) {
      if (!seen.has(id)) {
        r.el.remove();
        rows.delete(id);
        lastState.delete(id);
      }
    }
    // Newest first; Node keeps the DOM order stable when the order didn't change.
    const ordered = [...data.items].sort((a, b) => b.addedAt - a.addedAt).map((i) => rows.get(i.id).el);
    if (ordered.some((el, i) => list.children[i] !== el)) list.replaceChildren(...ordered);
    empty.hidden = data.items.length > 0;
    const active = data.items.filter((i) => i.state === "downloading");
    const speed = active.reduce((n, i) => n + i.speed, 0);
    const waiting = data.items.filter((i) => i.state === "queued").length;
    summary.textContent = data.items.length ? `${active.length} downloading${speed ? ` · ${speedText(speed)}` : ""}${waiting ? ` · ${waiting} waiting` : ""} · ${data.items.filter((i) => i.state === "done").length} done` : "";
    pauseAll.disabled = !data.items.some((i) => ["downloading", "probing", "queued"].includes(i.state));
    resumeAll.disabled = !data.items.some((i) => i.state === "paused" || i.state === "error");
    clearDone.disabled = !data.items.some((i) => i.state === "done");
    if (!settingsReady) {
      fillSettings();
      settingsReady = true;
    }
  }

  async function tick() {
    if (polling) return;
    polling = true;
    try {
      data = await call("dl/list");
      render();
      failing = false;
      if (!busy()) stopPolling();
    } catch (err) {
      if (!failing) toast(err instanceof ApiError ? err.message : "Lost touch with the downloads.", { kind: "error" });
      failing = true;
    } finally {
      polling = false;
    }
  }

  const busy = () => data.items.some((i) => ["downloading", "probing", "queued", "verifying"].includes(i.state));
  // Open: look often. Another tool open: look now and then, so a finished download is still announced.
  function startPolling() {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, visible ? POLL_MS : BACKGROUND_POLL_MS);
  }
  function stopPolling() {
    clearInterval(timer);
    timer = 0;
  }

  return {
    async show() {
      visible = true;
      await tick();
      if (busy()) startPolling();
      urls.focus({ preventScroll: true });
    },
    hide() {
      visible = false;
      if (busy()) startPolling();
      else stopPolling();
    },
  };
}

registerPowerTab({
  id: "downloads", label: "Downloads", icon: "⬇️", group: "network",
  tip: "Fast downloads split over several connections, with pause, resume, a queue and a speed limit",
  mount,
});
