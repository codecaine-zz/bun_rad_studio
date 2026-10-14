// What the page knows about the servers it started: one shared list, kept fresh while it matters, and the small
// "● Live :5500" pill in the status bar. The list is asked for every few seconds only while the Serve tab is showing
// or some server is running, and the timer stops when the page is torn down.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { openPower } from "./power.js";
import { emit } from "./state.js";

export const POLL_MS = 3000;

/** @type {{ info: null | { php: any, max: number, lanAddress: string | null, firstPorts: { static: number, php: number } }, servers: any[], error: string }} */
export const store = { info: null, servers: [], error: "" };

let timer = 0;
let tabVisible = false;
let inflight = null;
let pill = null;

export const isRunning = (s) => s.status === "running" || s.status === "starting";
export const kindName = (s) => (s.kind === "php" ? "PHP" : "Live");

/** The words in the status-bar pill: "● Live :5500", "● PHP :8000" or "● 3 servers". Empty when nothing runs. */
export function pillText(servers) {
  const running = servers.filter(isRunning);
  if (!running.length) return "";
  if (running.length === 1) return `● ${kindName(running[0])} :${running[0].port}`;
  return `● ${running.length} servers`;
}

function renderPill() {
  if (typeof document === "undefined") return;
  const running = store.servers.filter(isRunning);
  const text = pillText(store.servers);
  if (!text) {
    pill?.remove();
    pill = null;
    return;
  }
  const where = document.getElementById("status-right");
  if (!where) return;
  const title = `${running.map((s) => `${kindName(s)} server on port ${s.port}`).join(", ")}. Click to open the Serve tool.`;
  if (!pill || !pill.isConnected) {
    pill = h("button", { type: "button", class: "serve-pill", onclick: () => openPower("serve") });
    where.prepend(pill);
  }
  pill.textContent = text;
  pill.title = title;
  pill.setAttribute("aria-label", `${text.replace("● ", "")} running. Open the Serve tool.`);
}

function stopPolling() {
  clearInterval(timer);
  timer = 0;
}

function updatePolling() {
  const want = typeof document !== "undefined" && (tabVisible || store.servers.some(isRunning));
  if (want && !timer) timer = setInterval(tick, POLL_MS);
  else if (!want && timer) stopPolling();
}

function tick() {
  if (typeof document === "undefined") return stopPolling();
  refreshServers();
}

/** Asks the server what is running, updates the pill and tells the Serve tab (the "serve" event). */
export function refreshServers() {
  if (typeof document === "undefined") return Promise.resolve(store);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await call("serve/status");
      store.info = { php: r.php, max: r.max, lanAddress: r.lanAddress, firstPorts: r.firstPorts };
      store.servers = r.servers;
      store.error = "";
    } catch (err) {
      store.error = err instanceof ApiError ? err.message : "The servers couldn't be checked.";
    } finally {
      inflight = null;
    }
    renderPill();
    updatePolling();
    emit("serve");
    return store;
  })();
  return inflight;
}

/** The Serve tab tells the store whether it is showing, so it can ask more often while someone is looking. */
export function setServeVisible(visible) {
  tabVisible = visible;
  updatePolling();
  if (visible) refreshServers();
}

/** The running (or starting) server of this kind for this folder, or undefined. */
export function serverFor(path, kind, servers = store.servers) {
  const same = (a, b) => a === b || a.toLowerCase() === b.toLowerCase();
  return servers.find((s) => s.kind === kind && isRunning(s) && same(s.root, path));
}

/** Test and shutdown helper: forget everything and stop the timer. */
export function resetServeStore() {
  stopPolling();
  tabVisible = false;
  inflight = null;
  pill?.remove();
  pill = null;
  store.info = null;
  store.servers = [];
  store.error = "";
}
