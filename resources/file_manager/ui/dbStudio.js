// Studios inside the Databases tab. Each running studio (SQLite, MySQL, PostgreSQL or Redis Studio) is the real studio's
// own web page, shown in a frame. The frame points at a small page the server builds for that one studio on the other
// loopback address, so the studio can never read this window or its secret token (see embed.js and fmDbFrame.ts).
import { ApiError, call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { db, errorText, loadOverview } from "./dbState.js";
import { embeddedUrl } from "./embed.js";
import { toast } from "./menus.js";
import { emit } from "./state.js";

/**
 * What the frame may do, and why each is needed:
 *  - allow-scripts: the studio is a web application;
 *  - allow-same-origin: it talks to its own server; without this the browser sends "Origin: null", which the studio refuses;
 *  - allow-forms, allow-modals: its forms and its confirm/prompt questions;
 *  - allow-downloads: its exports.
 * Not allowed: top navigation (it can't move this window elsewhere), popups, pointer lock.
 */
export const STUDIO_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads";

const STATE_WORDS = { starting: "Starting…", running: "Running", stopping: "Stopping…", stopped: "Stopped", crashed: "Stopped unexpectedly" };
const STATE_ICON = { starting: "⏳", running: "🟢", stopping: "⏳", stopped: "⚪", crashed: "🔴" };

let area = null;
let timer = 0;
let activeId = null;
let expanded = false;
let wiredDoc = null;
/** id -> { root, info, target, frame, frameBox, parts } */
const panes = new Map();

function syncExpandButton(btn) {
  if (!btn) return;
  btn.textContent = expanded ? "⛶ Restore" : "⛶ Expand";
  btn.setAttribute("aria-pressed", String(expanded));
  btn.title = expanded
    ? "Bring back the File Manager bars and side panes (Esc)"
    : "Hide the File Manager bars and side panes so this studio gets the whole window (Esc restores them)";
}

export const isStudioExpanded = () => expanded;

export function setStudioExpanded(next) {
  expanded = Boolean(next);
  const root = area?.closest?.(".db-root");
  if (root) root.dataset.maximized = expanded ? "true" : "false";
  if (typeof document !== "undefined") document.getElementById("app")?.classList.toggle("db-studio-max", expanded);
  for (const p of panes.values()) syncExpandButton(p.parts.expand);
}

export function toggleStudioExpanded() {
  setStudioExpanded(!expanded);
}

function ensureEscapeListener() {
  if (typeof document === "undefined" || wiredDoc === document) return;
  wiredDoc = document;
  document.addEventListener("keydown", (e) => {
    if (!expanded || !activeId || e.key !== "Escape" || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".modal-backdrop, .menu")) return;
    e.preventDefault();
    e.stopPropagation();
    setStudioExpanded(false);
  }, true);
}

/** Where the panes live (the Databases tab gives one container). */
export function mountStudioArea(el) {
  area = el;
  ensureEscapeListener();
}

export function resetStudios() {
  clearInterval(timer);
  timer = 0;
  setStudioExpanded(false);
  panes.clear();
  activeId = null;
  area = null;
}

export const studioPaneIds = () => [...panes.keys()];
export const activeStudioId = () => activeId;

/** Starts a studio for `{ engine, profileId? , path? }` and shows it. Asks first when the connection is marked production or read-only. */
export async function openStudio(target, { confirmed = false } = {}) {
  let r;
  try {
    r = await call("db/studio/start", { ...target, ...(confirmed ? { confirmWrites: true } : {}) });
  } catch (err) {
    if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
      if (!(await confirmBox({ title: err.details?.reason === "production" ? "This is a production connection" : "This connection is marked read-only", message: err.message, confirmLabel: "Open anyway", danger: true }))) return null;
      return openStudio(target, { confirmed: true });
    }
    toast(errorText(err, "The studio couldn't be started."), { kind: "error" });
    return null;
  }
  await loadOverview();
  const info = db.studios.find((s) => s.id === r.studio.id) ?? r.studio;
  showStudio(info, target);
  return info;
}

function buildPane(info, target) {
  const state = h("span", { class: "db-state", role: "status" });
  const expand = h("button", { type: "button", class: "pw-btn db-expand", "aria-pressed": "false", title: "" });
  syncExpandButton(expand);
  const stop = h("button", { type: "button", class: "pw-btn", title: "Stop this studio (its process ends)" }, "Stop");
  const restart = h("button", { type: "button", class: "pw-btn", title: "Stop it and start it again with the current connection settings" }, "Restart");
  const windowBtn = h("button", { type: "button", class: "pw-btn", "data-role": "db-window", title: "Open this studio as its own desktop window, with the same connection" }, "Open in a separate window");
  const browserBtn = h("button", { type: "button", class: "pw-btn", "data-role": "db-browser", title: "Open this studio in your web browser" }, "Open in my browser");
  const close = h("button", { type: "button", class: "pw-btn", title: "Remove this finished studio from the list" }, "Close");
  const back = h("button", { type: "button", class: "pw-btn", "data-role": "db-back", title: "Back to the list of connections (the studio keeps running)" }, "← Connections");
  const banner = h("p", { class: "db-banner-writes", role: "note", hidden: true });
  const message = h("p", { class: "db-studio-message", role: "alert", hidden: true });
  const logBox = h("pre", { class: "pw-out db-log", tabindex: "0", "aria-label": "Studio log" });
  const log = h("details", { class: "db-logs" }, h("summary", {}, "Log (secrets are hidden)"), logBox);
  const frameBox = h("div", { class: "db-frame-box" });
  const root = h("section", { class: "db-studio", "aria-label": info.title, "data-copy-self": "off", dataset: { id: info.id, state: info.state }, hidden: true },
    h("div", { class: "db-studio-head" }, back, h("h3", { class: "db-studio-title" }, info.title), state, h("span", { class: "db-studio-actions" }, expand, stop, restart, windowBtn, browserBtn, close)),
    banner, message, log, frameBox,
  );
  const pane = { root, info, target, frame: null, frameBox, parts: { state, expand, stop, restart, windowBtn, browserBtn, close, banner, message, logBox, log } };

  expand.addEventListener("click", () => toggleStudioExpanded());
  back.addEventListener("click", () => emit("db-view", { view: "list" }));
  stop.addEventListener("click", async () => {
    stop.disabled = true;
    try {
      const r = await call("db/studio/stop", { id: pane.info.id });
      pane.info = r.studio;
      await loadOverview();
    } catch (err) {
      toast(errorText(err, "The studio couldn't be stopped."), { kind: "error" });
    }
    paint(pane);
  });
  restart.addEventListener("click", async () => {
    restart.disabled = true;
    try {
      const r = await call("db/studio/restart", { id: pane.info.id });
      await loadOverview();
      dispose(pane.info.id);
      showStudio(db.studios.find((s) => s.id === r.studio.id) ?? r.studio, pane.target);
    } catch (err) {
      toast(errorText(err, "The studio couldn't be restarted."), { kind: "error" });
      restart.disabled = false;
    }
  });
  windowBtn.addEventListener("click", async () => {
    try {
      await call("db/studio/window", { ...pane.target, confirmWrites: pane.info.writesConfirmed });
      toast("The studio is opening in its own window.", { kind: "info" });
    } catch (err) {
      toast(errorText(err, "The window couldn't be opened."), { kind: "error" });
    }
  });
  browserBtn.addEventListener("click", async () => {
    try {
      await call("db/studio/browser", { id: pane.info.id });
    } catch (err) {
      toast(errorText(err, "Your web browser couldn't be opened."), { kind: "error" });
    }
  });
  close.addEventListener("click", () => {
    dispose(pane.info.id);
    emit("db-view", { view: "list" });
  });
  log.addEventListener("toggle", () => log.open && loadLog(pane));
  return pane;
}

async function loadLog(pane) {
  try {
    const r = await call("db/studio/logs", { id: pane.info.id });
    pane.parts.logBox.textContent = r.lines.length ? r.lines.join("\n") : "(nothing printed yet)";
  } catch {
    pane.parts.logBox.textContent = "(the log isn't available any more)";
  }
}

/** Updates a pane to its latest state: the status words, the buttons, and the frame (only while it runs). */
function paint(pane) {
  const { info, parts } = pane;
  const live = info.state === "running";
  pane.root.dataset.state = info.state;
  syncExpandButton(parts.expand);
  parts.state.textContent = `${STATE_ICON[info.state] ?? ""} ${STATE_WORDS[info.state] ?? info.state}`;
  parts.stop.disabled = !(info.state === "running" || info.state === "starting");
  parts.restart.disabled = info.state === "stopping" || info.state === "starting";
  parts.windowBtn.disabled = info.state === "starting" || info.state === "stopping";
  parts.browserBtn.disabled = !live;
  parts.close.hidden = info.state === "running" || info.state === "starting" || info.state === "stopping";
  parts.banner.hidden = !info.writesConfirmed;
  if (info.writesConfirmed) parts.banner.textContent = "⚠ This connection is marked production or read-only, but the studio has full access: anything you run here can change or delete data.";
  const note = info.state === "crashed" || (info.state === "stopped" && info.message) ? info.message : "";
  parts.message.hidden = !note;
  parts.message.textContent = note ?? "";
  if (live && !pane.frame) {
    const frame = h("iframe", { class: "db-studio-frame", title: info.title, src: embeddedUrl(`dbstudio/${info.id}`), referrerpolicy: "no-referrer", loading: "eager", allow: "clipboard-write", sandbox: STUDIO_SANDBOX });
    pane.frame = frame;
    clear(pane.frameBox);
    pane.frameBox.append(frame);
  } else if (!live && pane.frame) {
    pane.frame.remove();
    pane.frame = null;
    pane.frameBox.append(h("p", { class: "pw-hint" }, info.state === "stopping" ? "Stopping…" : "The studio isn't running."));
  }
  if (!live && (info.state === "crashed" || info.state === "stopped")) {
    parts.log.open = parts.log.open || info.state === "crashed";
    loadLog(pane);
  }
}

function dispose(id) {
  const pane = panes.get(id);
  if (!pane) return;
  pane.root.remove();
  panes.delete(id);
  if (activeId === id) activeId = null;
  if (!panes.size) stopPolling();
}

function stopPolling() {
  clearInterval(timer);
  timer = 0;
}

async function poll() {
  if (typeof document === "undefined" || !panes.size) return stopPolling();
  try {
    const r = await call("db/studio/list");
    db.studios = r.studios;
    for (const pane of panes.values()) {
      const fresh = r.studios.find((s) => s.id === pane.info.id);
      if (fresh && (fresh.state !== pane.info.state || fresh.message !== pane.info.message)) {
        pane.info = fresh;
        paint(pane);
        emit("db-studios");
      }
    }
  } catch {
    // a missed poll is fine
  }
}

/** Shows the pane of a studio (making it if needed) and hides the others. */
export function showStudio(info, target = null) {
  if (!area) return;
  let pane = panes.get(info.id);
  if (!pane) {
    pane = buildPane(info, target ?? { engine: info.engine, ...(info.profileId ? { profileId: info.profileId } : {}) });
    panes.set(info.id, pane);
    area.append(pane.root);
  }
  pane.info = info;
  paint(pane);
  for (const p of panes.values()) p.root.hidden = p !== pane;
  activeId = info.id;
  if (!timer && typeof document !== "undefined") timer = setInterval(poll, 2500);
  emit("db-view", { view: "studio", id: info.id });
}

/** Shows an existing studio again by id (from the strip of running studios). */
export function showStudioById(id) {
  const info = db.studios.find((s) => s.id === id);
  if (info) showStudio(info);
}

export function hideStudios() {
  setStudioExpanded(false);
  for (const p of panes.values()) p.root.hidden = true;
  activeId = null;
}

/** Studios that are still open, for the strip above the list. */
export const openStudios = () => db.studios.filter((s) => s.state === "running" || s.state === "starting" || s.state === "crashed");
