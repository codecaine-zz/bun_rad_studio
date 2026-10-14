// "Watch" tool of the Power tools panel: runs a command whenever files in a folder change, and shows its output.
// The work happens on the server (it has to keep running while you do other things); this page sets watchers up,
// polls for their news while the tab is open, and shows it. watchform.js and watchview.js draw the two halves.
import { h } from "./dom.js";
import { ApiError, call } from "./api.js";
import { confirmBox, promptBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { currentPath } from "./state.js";
import { registerPowerTab } from "./power.js";
import { buildWatchForm } from "./watchform.js";
import { buildWatchView, resultText } from "./watchview.js";

const POLL_MS = 600;
const COPY_LIMIT = 100_000;
const STATE_WORD = { ACTIVE: "watching", STOPPED: "stopped", ERROR: "problem" };

const short = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function createTool(root, info) {
  /** What this page remembers about each watcher: where it is in the log, and which runs it has already announced. */
  const mem = new Map();
  let watchers = [];
  let selectedId = null;
  let lastState = null;
  let timer = 0;
  let visible = false;
  let polling = false;
  let starting = false;
  let failing = false;
  let chipKey = "";

  const memo = (id) => {
    if (!mem.has(id)) mem.set(id, { cursor: undefined, epoch: undefined, seen: new Map(), seeded: false });
    return mem.get(id);
  };
  const act = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That didn't work. Try again.", { kind: "error" });
    }
  };

  const form = buildWatchForm(info, { onStart: act(startWatching), currentFolder: () => currentPath() });
  const view = buildWatchView({
    onRun: act(runNow), onStop: act(stopWatching), onKill: act(killCommand), onRemove: act(removeWatcher), onReuse: reuseSettings,
    onClearLog: act(clearLog), onCopy: act(copyLog), onExport: act(exportLog), onClearHistory: act(clearHistory),
  });
  view.el.hidden = true;

  const chips = h("div", { class: "pw-row watch-chips", role: "group", "aria-label": "Your watchers" });
  const noChips = h("p", { class: "pw-hint" }, "Nothing is being watched yet. Fill in the form above and press Start watching.");
  root.append(
    form.el,
    h("section", { class: "pw-card", "aria-label": "Your watchers" }, h("h3", {}, `Your watchers (up to ${info.maxWatchers} at once)`), noChips, chips),
    view.el,
  );

  function select(id) {
    if (id === selectedId) return;
    selectedId = id;
    lastState = null;
    view.resetDisplay();
    if (id) {
      const m = memo(id);
      m.cursor = undefined;
      m.epoch = undefined;
    }
    view.el.hidden = !id;
    chipKey = "";
  }

  function renderChips() {
    const key = JSON.stringify([selectedId, watchers.map((w) => [w.id, w.state, w.running, w.command])]);
    if (key === chipKey) return;
    chipKey = key;
    const focused = chips.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    chips.replaceChildren(...watchers.map((w) => {
      const on = w.id === selectedId;
      return h("button", {
        type: "button", class: `pw-btn watch-chip${on ? " selected" : ""}`, "aria-pressed": String(on), dataset: { id: w.id },
        title: `Show this watcher.\nCommand: ${w.command}\nFolder: ${w.path}`,
        onclick: () => { select(w.id); tick(); },
      }, `${w.running ? "● " : ""}${short(w.command, 32)} · ${STATE_WORD[w.state] ?? w.state}`);
    }));
    if (focused) chips.querySelector(`[data-id="${focused}"]`)?.focus();
    noChips.hidden = watchers.length > 0;
    const active = watchers.filter((w) => w.state === "ACTIVE").length;
    form.setCanStart(active < info.maxWatchers, `${info.maxWatchers} watchers are already watching. Stop or remove one first.`);
  }

  /** Shows a message for each run that finished since the last look. */
  function announceRuns(m, s) {
    if (m.seeded && form.notifyOn()) {
      for (const row of [...s.history].reverse()) {
        const before = m.seen.get(row.n);
        if ((before === undefined || before === "running") && (row.kind === "success" || row.kind === "failed")) {
          toast(row.kind === "success" ? `Run ${row.n} succeeded (${row.duration}).` : `Run ${row.n}: ${resultText(row)}. See the console for details.`, { kind: row.kind === "success" ? "success" : "error" });
        }
      }
    }
    m.seen = new Map(s.history.map((row) => [row.n, row.kind]));
    m.seeded = true;
  }

  async function tick() {
    if (polling) return;
    polling = true;
    try {
      watchers = (await call("watch/list")).watchers;
      if (!watchers.some((w) => w.id === selectedId)) select(watchers[0]?.id ?? null);
      renderChips();
      if (selectedId) {
        const id = selectedId;
        const m = memo(id);
        const s = await call("watch/state", { id, since: m.cursor, epoch: m.epoch });
        if (id === selectedId) {
          m.cursor = s.cursor;
          m.epoch = s.epoch;
          lastState = s;
          announceRuns(m, s);
          view.update(s);
          watchers = watchers.map((w) => (w.id === id ? { ...w, state: s.state, running: s.running } : w));
          renderChips();
        }
      }
      failing = false;
      if (!watchers.some((w) => w.state === "ACTIVE")) stopPolling();
    } catch (err) {
      const gone = err instanceof ApiError && err.code === "NOT_FOUND";
      if (!failing && !gone) toast(err instanceof ApiError ? err.message : "Lost touch with the watchers.", { kind: "error" });
      failing = !gone;
    } finally {
      polling = false;
    }
  }

  function startPolling() {
    if (!timer && visible) timer = setInterval(tick, POLL_MS);
  }
  function stopPolling() {
    clearInterval(timer);
    timer = 0;
  }

  /** Turns what was typed into a full path of an existing folder (understands ~ and folders relative to the one you are in). */
  async function resolveFolder(text, what) {
    const r = await call("typedpath", { text, cwd: currentPath() || undefined });
    if (!r.exists) throw new ApiError(`${what} doesn't exist: ${r.path}`, "NOT_FOUND", 400);
    if (!r.isDir) throw new ApiError(`${what} isn't a folder: ${r.path}`, "NOT_A_FOLDER", 400);
    return r.path;
  }

  async function startWatching() {
    if (starting) return;
    const v = form.read();
    if (!v.command) {
      form.setMessage("Type the command to run first, or pick a ready-made one.", true);
      return form.focusCommand();
    }
    if (!v.path) return form.setMessage("Choose the folder to watch first.", true);
    starting = true;
    try {
      let path;
      let cwd = "";
      try {
        path = await resolveFolder(v.path, "The folder to watch");
        if (v.cwd) cwd = await resolveFolder(v.cwd, "The folder to run the command in");
      } catch (err) {
        form.setMessage(err instanceof ApiError ? err.message : "That folder couldn't be checked.", true);
        return;
      }
      const ok = await confirmBox({
        title: "Start watching?", confirmLabel: "Start watching", danger: true,
        message: "Every time a matching file changes, this command will run on your computer with your permissions. Only continue if you trust it.",
        details: [`Command: ${v.command}`, `Watching: ${path}`, `Runs in: ${cwd || path}`, `File types: ${v.exts.trim() || "every file"}`, `Skips paths containing: ${v.ignore.trim() || "nothing"}`],
      });
      if (!ok) return;
      try {
        const { id } = await call("watch/start", { ...v, path, cwd, confirm: true });
        memo(id).seeded = true;
        form.setMessage("");
        select(id);
        toast("Watching started.", { kind: "success" });
        startPolling();
        tick();
      } catch (err) {
        form.setMessage(err instanceof ApiError ? err.message : "The watcher couldn't be started.", true);
      }
    } finally {
      starting = false;
    }
  }

  async function runNow() {
    const { result } = await call("watch/run", { id: selectedId });
    if (result === "busy") toast("The command is still running, and \"Restart on change\" is off, so it was left alone.");
    else if (result === "failed") toast("The command couldn't be started. The console says why.", { kind: "error" });
    startPolling();
    await tick();
  }

  async function stopWatching() {
    await call("watch/stop", { id: selectedId });
    await tick();
  }

  async function killCommand() {
    const { killed } = await call("watch/kill", { id: selectedId });
    if (!killed) toast("No command is running right now.");
    await tick();
  }

  async function removeWatcher() {
    const id = selectedId;
    if (!await confirmBox({ title: "Remove this watcher?", message: "It stops watching, and its console and history are lost.", confirmLabel: "Remove", danger: true })) return;
    await call("watch/remove", { id });
    mem.delete(id);
    await tick();
  }

  function reuseSettings() {
    const w = watchers.find((x) => x.id === selectedId);
    if (!w || !lastState) return;
    form.write({ ...lastState.config, command: w.command, path: w.path, cwd: w.cwd });
    form.focusCommand();
    toast("The settings were copied into the form above.");
  }

  async function clearLog() {
    await call("watch/clear", { id: selectedId });
    view.resetDisplay();
    await tick();
  }

  async function clearHistory() {
    await call("watch/clear", { id: selectedId, log: false, history: true });
    await tick();
  }

  async function copyLog() {
    const text = view.logText();
    if (!text) return toast("There is nothing to copy yet.");
    const r = await call("copytext", { text: text.length > COPY_LIMIT ? text.slice(-COPY_LIMIT) : text });
    toast(r.copied ? (text.length > COPY_LIMIT ? "Copied the last 100,000 characters of the log." : "Log copied. You can paste it now.") : "The log couldn't be copied.", { kind: r.copied ? "success" : "error" });
  }

  async function exportLog() {
    const id = selectedId;
    const w = watchers.find((x) => x.id === id);
    const saved = await promptBox({
      title: "Export log", label: "Folder to save the log in", value: w?.path ?? currentPath(), confirmLabel: "Save log",
      hint: "The log is saved as a new file named watcher-log-… in that folder. Existing files are never replaced.",
      submit: async (text) => call("watch/export", { id, folder: await resolveFolder(text, "That folder") }),
    });
    if (saved && saved.path) toast(`Log saved to ${saved.path}`, { kind: "success" });
  }

  return {
    show(opts) {
      visible = true;
      if (opts?.path) form.setPath(opts.path);
      else if (!form.hasPath() && currentPath()) form.setPath(currentPath());
      tick();
      startPolling();
    },
    hide() {
      visible = false;
      stopPolling();
    },
  };
}

registerPowerTab({
  id: "watch", label: "Watch", icon: "👀", tip: "Run a command whenever files change",
  mount(root) {
    const loading = h("p", { class: "pw-hint", role: "status" }, "Getting ready…");
    root.append(loading);
    let tool = null;
    let shown = false;
    let pendingOpts;
    call("watch/presets").then((info) => {
      loading.remove();
      tool = createTool(root, info);
      if (shown) tool.show(pendingOpts);
    }).catch((err) => {
      loading.textContent = err instanceof ApiError ? err.message : "The Watch tool couldn't start.";
      loading.classList.add("pw-bad");
    });
    return {
      show(opts) {
        shown = true;
        pendingOpts = opts;
        tool?.show(opts);
      },
      hide() {
        shown = false;
        tool?.hide();
      },
    };
  },
});
