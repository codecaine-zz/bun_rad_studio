// The part of the Watch tool that shows one watcher: its status, buttons, live console and history of runs.
import { h } from "./dom.js";

const PAGE_LOG_LIMIT = 1_200_000;
const PAGE_LOG_KEEP = 1_000_000;

const STATE_TEXT = { ACTIVE: "Watching", STOPPED: "Stopped", ERROR: "Problem" };

/** Friendly words for a run's result. */
export function resultText(row) {
  if (row.kind === "running") return "Running…";
  if (row.kind === "success") return "Succeeded";
  if (row.kind === "cancelled") return "Cancelled";
  return row.code === null || row.code < 0 ? "Failed" : `Failed (exit ${row.code})`;
}

function stat(label, tip) {
  const value = h("span", { class: "watch-stat-value" }, "–");
  return { value, el: h("div", { class: "watch-stat", title: tip }, h("span", { class: "watch-stat-label" }, label), value) };
}

function button(text, tip, onclick, extra = "") {
  return h("button", { type: "button", class: `pw-btn ${extra}`.trim(), title: tip, onclick }, text);
}

/**
 * @param {{ onRun: () => void, onStop: () => void, onKill: () => void, onRemove: () => void, onReuse: () => void, onClearLog: () => void, onCopy: () => void, onExport: () => void, onClearHistory: () => void }} actions
 */
export function buildWatchView(actions) {
  const state = stat("State", "Whether the watcher is watching, stopped, or has run into a problem.");
  const runs = stat("Runs so far", "How many times the command has been started by this watcher.");
  const last = stat("Last change", "The file that most recently made the command run.");
  const pid = stat("Process ID", "The number your computer gave the command while it runs. Empty when nothing is running.");
  const info = h("p", { class: "pw-hint watch-info" });
  const status = h("p", { class: "pw-status watch-status", role: "status" });

  const run = button("⚡ Run now", "Runs the command right now, without waiting for a file to change.", actions.onRun);
  const stop = button("⏹ Stop watching", "Stops watching the folder and ends the command if it is running. The console and history stay here to read.", actions.onStop);
  const kill = button("🛑 Stop the command", "Ends the command that is running right now (and anything it started). The watcher keeps watching.", actions.onKill, "danger");
  const remove = button("🗑 Remove", "Stops this watcher and removes it from the list, together with its console and history.", actions.onRemove);
  const reuse = button("↩ Use these settings", "Copies this watcher's settings into the set-up form, so you can start a similar one.", actions.onReuse);

  const logNode = document.createTextNode("");
  const follow = h("input", { type: "checkbox", checked: true, title: "Keeps the newest output in view. It switches off by itself if you scroll up to read." });
  const pre = h("pre", { class: "pw-out watch-console", tabindex: "0", "aria-live": "off", "aria-label": "Command output", title: "What the command prints while it runs. Colors are removed so it is easy to read." }, logNode);
  const emptyLog = h("p", { class: "pw-hint" }, "The command's output will appear here when it runs.");
  pre.addEventListener("scroll", () => {
    if (pre.scrollHeight - pre.scrollTop - pre.clientHeight > 40) follow.checked = false;
  });

  const body = h("tbody", {});
  const table = h("table", { class: "pw-table watch-history", "aria-label": "Runs, newest first" },
    h("thead", {}, h("tr", {}, ["Time", "Run", "Changed file", "Result", "Took"].map((t) => h("th", { scope: "col", class: t === "Run" ? "num" : "" }, t)))),
    body);
  const emptyHistory = h("p", { class: "pw-hint" }, "No runs yet. Change a file in the watched folder, or press Run now.");
  let historyKey = "";

  const el = h("section", { class: "pw-card watch-view", "aria-label": "Selected watcher" },
    h("h3", {}, "Selected watcher"),
    info,
    h("div", { class: "watch-stats" }, state.el, runs.el, last.el, pid.el),
    status,
    h("div", { class: "pw-row" }, run, stop, kill, remove, reuse),
    h("div", { class: "pw-row watch-console-bar" },
      h("strong", {}, "Console"),
      h("label", { class: "watch-check", title: "Keeps the newest output in view." }, follow, " Follow output"),
      button("✕ Clear console", "Empties the console. It does not change the history.", actions.onClearLog),
      button("📋 Copy log", "Copies the console text (up to the last 100,000 characters) so you can paste it somewhere.", actions.onCopy),
      button("💾 Export log…", "Saves the whole log in a new text file in a folder you choose. Existing files are never replaced.", actions.onExport)),
    emptyLog,
    pre,
    h("div", { class: "pw-row watch-console-bar" },
      h("strong", {}, "History of runs"),
      button("🗑 Clear history", "Empties the list of runs below. The console is not changed.", actions.onClearHistory)),
    emptyHistory,
    h("div", { class: "pw-table-wrap watch-history-wrap" }, table));

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  return {
    el,
    /** Empties the console on the page (the next update then brings in whatever the server has). */
    resetDisplay() {
      logNode.data = "";
      emptyLog.hidden = false;
      historyKey = "";
      body.replaceChildren();
    },
    logText: () => logNode.data,
    /** Shows the answer of `watch/state`. */
    update(s) {
      setText(state.value, s.state === "ACTIVE" && s.running ? "Watching · running" : STATE_TEXT[s.state] ?? s.state);
      setText(runs.value, String(s.triggerCount));
      setText(last.value, s.lastEvent ?? "–");
      setText(pid.value, s.pid ? String(s.pid) : "–");
      setText(info, `Watching ${s.path} · runs in ${s.cwd} · command: ${s.command}`);
      setText(status, s.state === "ERROR" ? s.message : s.status);
      status.classList.toggle("pw-bad", s.state === "ERROR");
      run.disabled = s.state !== "ACTIVE";
      stop.disabled = s.state !== "ACTIVE";
      kill.disabled = !s.running;

      if (s.reset) logNode.data = s.log;
      else if (s.log) logNode.appendData(s.log);
      if (logNode.length > PAGE_LOG_LIMIT) logNode.deleteData(0, logNode.length - PAGE_LOG_KEEP);
      emptyLog.hidden = logNode.length > 0;
      if ((s.reset || s.log) && follow.checked) pre.scrollTop = pre.scrollHeight;

      const key = JSON.stringify(s.history);
      if (key !== historyKey) {
        historyKey = key;
        body.replaceChildren(...s.history.map((row) => h("tr", {},
          h("td", {}, row.time),
          h("td", { class: "num" }, String(row.n)),
          h("td", { class: "pw-mono" }, row.file),
          h("td", {}, h("span", { class: `watch-result watch-result-${row.kind}` }, resultText(row))),
          h("td", { class: "num" }, row.duration))));
        emptyHistory.hidden = s.history.length > 0;
      }
    },
  };
}
