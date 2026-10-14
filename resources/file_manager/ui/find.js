// The "Find" tool of the Power tools panel: a full file search with filters, results you can select and act on,
// and the extras of the Fd Studio app (live mode, duplicates, content search, batch rename, running commands).
// This file puts the parts together and runs the searches; each part lives in its own find*.js module.
import { ApiError, call } from "./api.js";
import { debounce, announce, h } from "./dom.js";
import { createActions } from "./findActions.js";
import { createAnalyze } from "./findAnalyze.js";
import { pushHistory } from "./findCore.js";
import { createExec } from "./findExec.js";
import { createForm } from "./findForm.js";
import { createInspector, openItem } from "./findInspector.js";
import { createRename } from "./findRename.js";
import { createResults } from "./findResults.js";
import { fs, setResults } from "./findStore.js";
import { toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { currentPath, state } from "./state.js";
import { formatSize, plural } from "./util.js";

const LIVE_POLL_MS = 2000;

registerPowerTab({
  id: "find", label: "Find", icon: "🔎", tip: "Advanced file search: patterns, filters, contents, duplicates, bulk actions",
  mount(root) {
    root.classList.add("find-pane");
    let history = [];
    let seq = 0;
    let metaLoaded = false;
    let autoRoot = "";
    /** Live mode: the server watches the folder and counts changes; we ask for the count every few seconds. */
    let watch = null;
    let pollTimer = 0;
    let polling = false;

    const status = h("p", { class: "pw-status find-status", role: "status", "aria-live": "polite" }, "Choose a folder and press Find.");
    const setStatus = (text, bad = false) => {
      status.textContent = text;
      status.classList.toggle("pw-bad", bad);
    };

    const form = createForm({ onSearch: () => search(), onClear, onLive, onPreset, onRecent });
    const results = createResults({ onActivate: openItem });
    const inspector = createInspector();
    const hooks = { rerun: () => search({ quiet: true }), getRoot: () => form.getRoot() };
    const actions = createActions(hooks);
    const analyze = createAnalyze({ reveal: results.reveal });
    const rename = createRename(hooks);
    const exec = createExec();

    root.append(
      form.el,
      status,
      h("div", { class: "find-main" }, results.el, inspector.el),
      actions.el,
      analyze.el,
      ...rename.els,
      exec.el,
    );

    async function loadMeta() {
      if (metaLoaded) return;
      metaLoaded = true;
      try {
        Object.assign(fs.meta, await call("find/meta"));
        form.setPresets(fs.meta.presets);
        results.setSortKeys(fs.meta.sortKeys);
        rename.applyMeta();
        exec.applyMeta();
        root.classList.toggle("find-windows", !fs.meta.posix);
      } catch (err) {
        metaLoaded = false;
        setStatus(err instanceof ApiError ? err.message : "The search tool couldn't start.", true);
      }
    }

    async function search({ quiet = false } = {}) {
      await loadMeta();
      const body = form.read();
      if (!body.root) {
        setStatus("Choose a folder to search in first: type its location or press Browse.", true);
        return;
      }
      const mine = ++seq;
      form.setBusy(true);
      if (!quiet) setStatus("Searching… a big folder can take a little while.");
      try {
        const res = await call("find/search", body);
        if (mine !== seq) return;
        setResults(res);
        if (!quiet && body.pattern.trim()) {
          history = pushHistory(history, body.pattern);
          form.setHistory(history);
        }
        const bits = [
          `${plural(res.matchedCount, "match", "matches")} in ${Math.round(res.durationMs)} ms`,
          `looked at ${res.totalScanned.toLocaleString()} items`,
          `files add up to ${formatSize(res.totalSizeBytes)}`,
        ];
        if (res.truncated) bits.push(`stopped at the limit of ${body.maxResults.toLocaleString()} results: raise "Most results" or narrow the search`);
        if (res.patternFallback) bits.push("that isn't a valid pattern, so it was searched as plain text");
        setStatus(`${bits.join(" · ")}.`, false);
        if (!quiet) announce(res.matchedCount === 0 ? "No matches found." : `${plural(res.matchedCount, "match", "matches")} found.`);
        if (form.isLive() && (!watch || watch.root !== res.root)) startLive();
      } catch (err) {
        if (mine !== seq) return;
        const message = err instanceof ApiError ? err.message : "The search didn't work.";
        setStatus(message, true);
        if (!quiet) toast(message, { kind: "error" });
      } finally {
        if (mine === seq) form.setBusy(false);
      }
    }

    function onClear() {
      form.reset();
      search();
    }

    function onPreset(label) {
      const preset = fs.meta.presets.find((p) => p.label === label);
      if (!preset) return;
      form.setValues({ pattern: preset.pattern, exts: preset.exts, size: preset.size, modified: preset.modified, type: preset.type });
      search();
    }

    function onRecent(text) {
      form.setPattern(text);
      search();
    }

    // --- live mode ---------------------------------------------------------------------------------------------
    const rerunSoon = debounce(() => search({ quiet: true }), 400);

    async function stopLive(tellServer = true) {
      clearInterval(pollTimer);
      pollTimer = 0;
      const old = watch;
      watch = null;
      if (old && tellServer) await call("find/watch/stop", { watchId: old.id }).catch(() => {});
    }

    async function startLive() {
      await stopLive();
      const folder = form.getRoot();
      if (!folder) {
        form.setLive(false);
        return;
      }
      try {
        const res = await call("find/watch/start", { root: folder, hidden: form.read().hidden });
        watch = { id: res.watchId, root: res.root, changes: 0 };
        pollTimer = setInterval(poll, LIVE_POLL_MS);
        toast("Live mode is on: the results update by themselves when files change.", { kind: "info" });
      } catch (err) {
        form.setLive(false);
        toast(err instanceof ApiError ? err.message : "Live mode couldn't start.", { kind: "error" });
      }
    }

    async function poll() {
      if (!watch || polling) return;
      polling = true;
      try {
        const res = await call("find/watch/poll", { watchId: watch.id });
        if (!res.active) {
          stopLive(false);
          form.setLive(false);
          toast(res.error ?? "Live mode stopped.", { kind: "error" });
        } else if (res.changes !== watch.changes) {
          watch.changes = res.changes;
          rerunSoon();
        }
      } catch {
        stopLive(false);
        form.setLive(false);
      } finally {
        polling = false;
      }
    }

    function onLive(on) {
      if (on) {
        if (!form.hasRoot()) {
          form.setLive(false);
          toast("Choose the folder to watch first.", { kind: "info" });
          return;
        }
        startLive();
      } else {
        stopLive();
        toast("Live mode is off.", { kind: "info" });
      }
    }

    return {
      show(opts) {
        loadMeta();
        const fromMenu = opts && (opts.root || typeof opts.pattern === "string");
        if (opts?.root) {
          form.setValues({ root: opts.root });
        } else if (!form.hasRoot() || form.getRoot() === autoRoot) {
          autoRoot = currentPath() || state.home || "";
          form.setValues({ root: autoRoot });
        }
        if (typeof opts?.pattern === "string") form.setPattern(opts.pattern);
        if (fromMenu && opts.pattern) search();
        else form.focusPattern();
        if (form.isLive()) startLive();
      },
      hide() {
        stopLive();
      },
    };
  },
});
