// "Serve" tool of the Power tools panel: turn a live server (your web pages, with automatic reload) or PHP's built-in
// server on and off for a folder. The servers run inside the File Manager's own server (see fmServeOps.ts); this page
// starts and stops them, shows what is running, and lets you read each one's log. The shared list lives in
// serveStore.js, the buttons for it in serveActions.js, and serveRows.js and serveForm.js draw the two halves.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { registerPowerTab } from "./power.js";
import { openServer, primeHint, startHere, startServer, stopServer } from "./serveActions.js";
import { buildServeForm } from "./serveForm.js";
import { createServerList, createSwitch } from "./serveRows.js";
import { isRunning, refreshServers, serverFor, setServeVisible, store } from "./serveStore.js";
import { currentPath, on, state } from "./state.js";

/** The path of `full` inside `root` ("" when it is the root itself or isn't inside it), for starting a server again. */
export function relativeTo(root, full) {
  if (!full || full === root) return "";
  const sep = root.includes("\\") ? "\\" : "/";
  return full.startsWith(root + sep) ? full.slice(root.length + 1) : "";
}

function createTool(root) {
  let visible = false;
  let applied = false;
  let starting = false;
  let quickBusy = false;
  let quickDetect = null;
  let quickFor = "";

  const failText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

  /** Turns what was typed into a full path of an existing folder (understands ~ and folders relative to the one you are in). */
  async function resolveFolder(text) {
    const r = await call("typedpath", { text, cwd: currentPath() || undefined });
    if (!r.exists) throw new ApiError(`That folder doesn't exist: ${r.path}`, "NOT_FOUND", 400);
    if (!r.isDir) throw new ApiError(`That isn't a folder: ${r.path}`, "NOT_A_FOLDER", 400);
    return r.path;
  }

  // --- the running servers ---------------------------------------------------------------------------------------
  const list = createServerList({
    onOpen: (s) => openServer(s.id),
    onCopy: async (s) => {
      try {
        const r = await call("copytext", { text: s.url });
        toast(r.copied ? "Address copied. You can paste it now." : "The address couldn't be copied.", { kind: r.copied ? "success" : "error" });
      } catch (err) {
        toast(failText(err, "The address couldn't be copied."), { kind: "error" });
      }
    },
    onStop: (s) => stopServer(s.id),
    onRestart: restart,
  });
  const heading = h("h3", {}, "Running servers");
  const empty = h("p", { class: "pw-hint", role: "status" }, "No server is running. Turn one on above, or start a new one below.");
  const stopAll = h("button", { type: "button", class: "pw-btn", hidden: true, title: "Stop every server started here", onclick: stopEverything }, "Stop all");
  const running = h("section", { class: "pw-card serve-running", "aria-label": "Running servers" }, h("div", { class: "pw-row serve-running-head" }, heading, stopAll), empty, list.el);

  async function restart(s, force = false) {
    const body = {
      root: s.root, kind: s.kind, port: s.port, lan: s.lan, liveReload: s.liveReload, dotfiles: s.dotfiles, cors: s.cors,
      docroot: relativeTo(s.root, s.docroot), router: relativeTo(s.root, s.router), openBrowser: false,
    };
    try {
      await call("serve/stop", { id: s.id });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "NOT_FOUND")) return toast(failText(err, "The server couldn't be restarted."), { kind: "error" });
    }
    await refreshServers();
    const again = await startServer(body);
    if (again && force) toast("Restarted.", { kind: "success" });
  }

  async function stopEverything() {
    try {
      const r = await call("serve/stopAll");
      toast(r.stopped === 1 ? "1 server stopped." : `${r.stopped} servers stopped.`, { kind: "success" });
    } catch (err) {
      toast(failText(err, "The servers couldn't be stopped."), { kind: "error" });
    }
    await refreshServers();
  }

  // --- quick switches for the folder you are looking at ------------------------------------------------------------
  const quickName = h("span", { class: "pw-mono serve-quick-folder" });
  const quickNote = h("p", { class: "pw-hint", role: "status" });
  const toggler = (kind) => async (on) => {
    const path = quickFor;
    if (!path || quickBusy) return;
    quickBusy = true;
    renderQuick();
    try {
      if (on) await startHere(path, kind);
      else {
        const s = serverFor(path, kind);
        if (s) await stopServer(s.id);
      }
    } finally {
      quickBusy = false;
      await refreshServers();
      renderQuick();
    }
  };
  const liveSwitch = createSwitch({ label: "Live server for this folder", title: "Serve this folder's files in your browser, and reload the page when you save", onToggle: toggler("static") });
  const phpSwitch = createSwitch({ label: "PHP server for this folder", title: "Run PHP's built-in server in this folder", onToggle: toggler("php") });
  const quick = h("section", { class: "pw-card serve-quick", "aria-label": "Quick switches for the folder you are looking at" },
    h("h3", {}, "The folder you are looking at"),
    quickName,
    h("div", { class: "serve-quick-row" }, liveSwitch.el, h("span", {}, "Live server (web pages, reloads when you save)")),
    h("div", { class: "serve-quick-row" }, phpSwitch.el, h("span", {}, "PHP server (runs .php files)")),
    quickNote,
  );

  async function detectQuick(path) {
    if (!path || path === quickFor) return;
    quickFor = path;
    quickDetect = null;
    try {
      quickDetect = await call("serve/detect", { path });
    } catch (err) {
      quickDetect = { blocked: failText(err, "This folder can't be served.") };
    }
    renderQuick();
  }

  function renderQuick() {
    if (typeof document === "undefined") return;
    const path = quickFor;
    quickName.textContent = path || "No folder is open.";
    const blocked = quickDetect?.blocked;
    const php = store.info?.php;
    const liveOn = !!serverFor(path, "static");
    const phpOn = !!serverFor(path, "php");
    liveSwitch.set(liveOn, { disabled: !path || quickBusy || (!liveOn && !!blocked), tip: liveOn ? "Turn the live server off" : "Turn the live server on" });
    const phpWhy = !php?.available ? "PHP isn't installed on this computer. The form below says how to get it." : "";
    phpSwitch.set(phpOn, { disabled: !path || quickBusy || (!phpOn && (!!blocked || !php?.available)), tip: phpOn ? "Turn the PHP server off" : phpWhy || "Turn the PHP server on" });
    quickNote.textContent = blocked || [quickDetect?.hints?.join(" "), !php?.available && php ? phpWhy : ""].filter(Boolean).join(" ");
    quickNote.hidden = !quickNote.textContent;
  }

  // --- the form ------------------------------------------------------------------------------------------------------
  const form = buildServeForm({
    onStart: startFromForm,
    onUseCurrent: () => {
      if (!currentPath()) return;
      form.setFolder(currentPath());
      detectForm(currentPath());
    },
    onFolderChange: (text) => detectForm(text),
  });

  async function detectForm(text) {
    if (!text) return form.setDetect(null);
    try {
      const path = await resolveFolder(text);
      form.setDetect(await call("serve/detect", { path }));
      form.setMessage("");
    } catch (err) {
      form.setDetect(null);
      form.setMessage(failText(err, "That folder couldn't be checked."), true);
    }
  }

  async function startFromForm() {
    if (starting) return;
    const v = form.read();
    if (!v.folder) {
      form.setMessage("Choose the folder to serve first.", true);
      return form.focusFolder();
    }
    starting = true;
    form.setMessage("Starting…");
    try {
      const path = await resolveFolder(v.folder);
      const server = await startServer({
        root: path, kind: v.kind, port: v.port || "auto", lan: v.lan, liveReload: v.liveReload, openBrowser: v.openBrowser, dotfiles: v.dotfiles, cors: v.cors,
        docroot: v.docroot, router: v.router, phpPath: v.phpPath,
      }, { onError: (message) => form.setMessage(message, true) });
      form.resetLan();
      if (server) {
        form.setMessage(`Running at ${server.url}`);
        saveSettings({ serveOptions: { kind: v.kind, liveReload: v.liveReload, openBrowser: v.openBrowser } }).catch(() => {});
      } else if (!form.read().folder) form.setMessage("");
    } catch (err) {
      form.setMessage(failText(err, "The server couldn't be started."), true);
    } finally {
      starting = false;
    }
  }

  // --- putting it together -------------------------------------------------------------------------------------------
  root.append(quick, running, form.el);

  function render() {
    if (typeof document === "undefined") return;
    const servers = store.servers;
    const max = store.info?.max ?? 8;
    const count = servers.filter(isRunning).length;
    list.update(servers);
    heading.textContent = `Running servers (${count} of ${max})`;
    empty.hidden = servers.length > 0;
    stopAll.hidden = count < 2;
    if (store.info) form.setPhp(store.info.php);
    form.setCanStart(count < max && !starting, `${max} servers are already running. Stop one first.`);
    renderQuick();
  }

  on("serve", render);
  on("view", () => { if (visible && currentPath()) detectQuick(currentPath()); });

  return {
    show(opts) {
      visible = true;
      if (opts?.path) {
        form.setFolder(opts.path);
        detectForm(opts.path);
      } else if (!form.hasFolder() && currentPath()) form.setFolder(currentPath());
      if (!applied) {
        applied = true;
        if (state.settings.serveOptions) form.write(state.settings.serveOptions);
      }
      quickFor = "";
      detectQuick(currentPath());
      setServeVisible(true);
      render();
    },
    hide() {
      visible = false;
      setServeVisible(false);
    },
    render,
  };
}

registerPowerTab({
  id: "serve", label: "Serve", icon: "🌐", tip: "Turn a live server or PHP's built-in server on and off for a folder", group: "automate",
  mount(root) {
    const tool = createTool(root);
    return { show: (opts) => tool.show(opts), hide: () => tool.hide() };
  },
});

// So the right-click menu can say "Start PHP server here" without waiting, folders are looked at while the pointer
// rests on them and when they are selected.
if (typeof document !== "undefined") {
  let hoverTimer = null;
  const primeFromHover = (e) => {
    const row = e.target?.closest?.(".row.is-folder[data-key]");
    if (!row) return;
    const key = row.dataset.key;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      primeHint(key);
    }, 150);
  };
  const primeFromDown = (e) => {
    const row = e.target?.closest?.(".row.is-folder[data-key]");
    if (row) {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      primeHint(row.dataset.key);
    }
  };
  document.addEventListener("pointerover", primeFromHover);
  document.addEventListener("pointerdown", primeFromDown, true);
  on("selection", () => {
    if (state.selection.size !== 1) return;
    const [key] = state.selection;
    if (state.entries.some((e) => e.path === key && e.isDir)) primeHint(key);
  });
}
