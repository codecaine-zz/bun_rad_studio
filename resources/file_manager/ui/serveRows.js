// The list of running servers in the Serve tool: one row per server, with an on/off switch, what it is serving and
// where, its buttons, and a log you can open. Rows are kept between updates (so the open log and the keyboard focus
// stay where they are) and only their text is refreshed.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { formatDate, plural } from "./util.js";

const MAX_LOG_LINES = 500;

const STATUS_TEXT = { starting: "starting", running: "running", stopping: "stopping", stopped: "stopped", failed: "stopped with a problem" };

/** A short name for the folder shown in labels: the last part of its path. */
const folderName = (path) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** The text of the on/off switch: its state in words, so it never depends on color alone. */
export const switchLabel = (on) => (on ? "On" : "Off");

/** A switch button: role="switch", keyboard-operable, with the state in its text. */
export function createSwitch({ label, title, onToggle }) {
  const text = h("span", { class: "serve-switch-text" }, "Off");
  const btn = h("button", { type: "button", role: "switch", "aria-checked": "false", class: "serve-switch", "aria-label": label, title, onclick: () => { if (!btn.disabled) onToggle(btn.getAttribute("aria-checked") !== "true"); } },
    h("span", { class: "serve-track", "aria-hidden": "true" }, h("span", { class: "serve-knob" })), text);
  return {
    el: btn,
    set(on, { disabled = false, tip } = {}) {
      btn.setAttribute("aria-checked", String(on));
      btn.disabled = disabled;
      text.textContent = switchLabel(on);
      if (tip) btn.title = tip;
    },
  };
}

function createRow(server, actions) {
  let current = server;
  let cursor = 0;
  let lines = [];
  let logOpen = false;
  const sw = createSwitch({
    label: `Server for ${folderName(server.root)}`, title: "Turn this server off, or on again.",
    onToggle: (on) => (on ? actions.onRestart(current) : actions.onStop(current)),
  });
  const title = h("strong", { class: "serve-title" });
  const status = h("span", { class: "serve-status" });
  const lanBadge = h("span", { class: "serve-badge serve-badge-lan", title: "Other devices on your network can open this server." }, "Network");
  const url = h("button", { type: "button", class: "serve-link pw-mono", onclick: () => actions.onOpen(current) });
  const path = h("div", { class: "serve-path pw-mono" });
  const meta = h("div", { class: "serve-meta" });
  const note = h("p", { class: "serve-note", role: "status" });
  const lanNote = h("p", { class: "serve-lan-note" });
  const openBtn = h("button", { type: "button", class: "pw-btn", title: "Open this server in your web browser", onclick: () => actions.onOpen(current) }, "Open in browser");
  const copyBtn = h("button", { type: "button", class: "pw-btn", title: "Copy the address of this server so you can paste it somewhere", onclick: () => actions.onCopy(current) }, "Copy URL");
  const restartBtn = h("button", { type: "button", class: "pw-btn", title: "Stop this server and start it again with the same choices", onclick: () => actions.onRestart(current, true) }, "Restart");
  const stopBtn = h("button", { type: "button", class: "pw-btn serve-stop", onclick: () => actions.onStop(current) }, "Stop");
  const logBtn = h("button", { type: "button", class: "pw-btn", "aria-expanded": "false", title: "Show what this server has been doing: requests it answered, and messages from PHP", onclick: () => toggleLog() }, "Show log");
  const clearBtn = h("button", { type: "button", class: "pw-btn", title: "Empty the log shown here (the server keeps working)", onclick: () => { lines = []; pre.textContent = ""; } }, "Clear view");
  const pre = h("pre", { class: "serve-log-text pw-mono", role: "log", tabindex: "0", "aria-label": `Log of the server for ${folderName(server.root)}` });
  const logBox = h("div", { class: "serve-log", hidden: true }, h("div", { class: "pw-row" }, clearBtn), pre);

  const el = h("li", { class: "serve-row", dataset: { id: server.id } },
    h("div", { class: "serve-row-main" },
      sw.el,
      h("div", { class: "serve-info" },
        h("div", { class: "serve-head" }, title, status, lanBadge),
        url, path, meta, note, lanNote,
      ),
      h("div", { class: "serve-actions pw-row" }, openBtn, copyBtn, restartBtn, stopBtn, logBtn),
    ),
    logBox,
  );

  async function refreshLog() {
    if (!logOpen) return;
    try {
      const r = await call("serve/log", { id: current.id, since: cursor });
      if (r.dropped) lines = [];
      cursor = r.cursor;
      if (r.lines.length) {
        const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
        lines.push(...r.lines.map((l) => `${new Date(l.t).toLocaleTimeString()}  ${l.text}`));
        if (lines.length > MAX_LOG_LINES) lines = lines.slice(-MAX_LOG_LINES);
        pre.textContent = lines.join("\n");
        if (atEnd) pre.scrollTop = pre.scrollHeight;
      } else if (!lines.length) pre.textContent = "Nothing has been logged yet.";
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "NOT_FOUND")) pre.textContent = err instanceof ApiError ? err.message : "The log couldn't be read.";
    }
  }

  function toggleLog() {
    logOpen = !logOpen;
    logBox.hidden = !logOpen;
    logBtn.textContent = logOpen ? "Hide log" : "Show log";
    logBtn.setAttribute("aria-expanded", String(logOpen));
    if (logOpen) {
      cursor = 0;
      lines = [];
      pre.textContent = "";
      refreshLog();
    }
  }

  function update(s) {
    current = s;
    const on = s.status === "running" || s.status === "starting";
    const ended = s.status === "stopped" || s.status === "failed";
    title.textContent = s.kind === "php" ? `PHP server${s.phpVersion ? ` (${s.phpVersion})` : ""}` : `Live server${s.liveReload ? " with live reload" : ""}`;
    status.textContent = STATUS_TEXT[s.status] ?? s.status;
    status.className = `serve-status serve-status-${s.status}`;
    lanBadge.hidden = !s.lan;
    url.textContent = s.url;
    url.title = `Open ${s.url} in your web browser`;
    path.textContent = s.docroot === s.root ? s.root : `${s.root}  →  serving ${s.docroot}`;
    path.title = s.root;
    const parts = [`Port ${s.port}`, s.startedAt ? `Started ${formatDate(Date.parse(s.startedAt))}` : "", plural(s.requests, "request")];
    if (s.kind === "static" && s.liveReload) parts.push(`${plural(s.clients, "page")} listening for changes`);
    meta.textContent = parts.filter(Boolean).join("  ·  ");
    note.textContent = [s.warning, s.message].filter(Boolean).join(" ");
    note.hidden = !note.textContent;
    lanNote.textContent = s.lan ? `Anyone on your network can read these files${s.lanUrl ? ` at ${s.lanUrl}` : ""}.${s.kind === "php" ? " PHP's built-in server is for development only and isn't safe on a network." : ""}` : "";
    lanNote.hidden = !s.lan;
    sw.set(on, { disabled: s.status === "starting" || s.status === "stopping", tip: on ? "Turn this server off" : "Turn this server on again" });
    openBtn.disabled = !on;
    copyBtn.disabled = !on;
    restartBtn.disabled = s.status === "stopping" || s.status === "starting";
    stopBtn.textContent = ended ? "Remove" : "Stop";
    stopBtn.title = ended ? "Take this finished server off the list" : "Stop this server and free its port";
    stopBtn.disabled = s.status === "stopping";
    const label = `Server for ${folderName(s.root)}`;
    sw.el.setAttribute("aria-label", label);
    if (logOpen) refreshLog();
  }
  update(server);
  return { el, update, refreshLog };
}

/** The list. `actions`: onOpen(server), onCopy(server), onStop(server), onRestart(server, force). */
export function createServerList(actions) {
  const list = h("ul", { class: "serve-list", "aria-label": "Running servers" });
  const rows = new Map();
  return {
    el: list,
    update(servers) {
      const ids = new Set(servers.map((s) => s.id));
      for (const [id, row] of rows) if (!ids.has(id)) { row.el.remove(); rows.delete(id); }
      servers.forEach((s, i) => {
        let row = rows.get(s.id);
        if (row) row.update(s);
        else {
          row = createRow(s, actions);
          rows.set(s.id, row);
        }
        if (list.children[i] !== row.el) list.insertBefore(row.el, list.children[i] ?? null);
      });
    },
    count: () => rows.size,
  };
}
