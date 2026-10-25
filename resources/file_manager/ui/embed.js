// Small self-contained apps (the calculator, the interval timer) shown in a frame inside the Power tools panel.
// The server serves them on the other spelling of this address (127.0.0.1 or localhost), which the browser treats as
// a separate site: the app runs fully, but can't read this window or its secret token.
import { call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { isPowerExpanded, openToolInBrowser, openToolInWindow, togglePowerExpanded } from "./power.js";
import { on } from "./state.js";
import { currentThemePayload } from "./themes.js";

/** The address of an embedded app, on the other loopback spelling. */
export function embeddedUrl(id) {
  const other = location.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return `${location.protocol}//${other}${location.port ? `:${location.port}` : ""}/app/${id}/`;
}

const frames = new Set();
let listening = false;

/** Broadcasts the active File Manager theme tokens to an embedded iframe. */
export function syncFrameTheme(frame, payload = currentThemePayload()) {
  try {
    frame?.contentWindow?.postMessage({ fmTheme: payload }, "*");
  } catch { /* frame not ready */ }
}

/** A link clicked inside an embedded app arrives here as a message from that app's frame; it opens in the system browser. */
function onFrameMessage(e) {
  const url = e.data && typeof e.data === "object" ? e.data.fmOpenLink : null;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) return;
  for (const f of frames) {
    if (!f.isConnected) frames.delete(f);
  }
  const from = [...frames].find((f) => f.contentWindow === e.source);
  if (!from || e.origin !== new URL(from.src).origin) return;
  call("link/open", { url: url.trim() }).catch((err) => toast(err?.message || "Couldn't open that link.", { kind: "error" }));
}

/**
 * Fills a tab with a note, action buttons (Expand, Window, Browser) and the app's frame.
 * @param {HTMLElement} root
 * @param {{ id: string, title: string, note: string }} app
 */
export function mountEmbedded(root, { id, title, note }) {
  root.classList.add("embed-pane");
  const url = embeddedUrl(id);
  const frame = h("iframe", {
    class: "embed-frame", title, src: url, referrerpolicy: "no-referrer", loading: "eager",
    allow: "autoplay; fullscreen; clipboard-write",
    sandbox: "allow-scripts allow-same-origin allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox",
  });
  frame.addEventListener("load", () => syncFrameTheme(frame));
  frames.add(frame);
  if (!listening) {
    listening = true;
    window.addEventListener("message", onFrameMessage);
    on("theme-changed", (payload) => {
      for (const f of frames) syncFrameTheme(f, payload);
    });
  }
  const expanded = isPowerExpanded();
  const expandBtn = h("button", {
    type: "button",
    class: "pw-btn embed-expand",
    "aria-pressed": String(expanded),
    title: expanded ? "Restore the File Manager bars and tabs (Esc)" : "Fill the whole window with this app (press Esc to restore)",
    onclick: () => togglePowerExpanded(),
  }, expanded ? "⛶ Restore" : "⛶ Expand");
  const windowBtn = h("button", {
    type: "button",
    class: "pw-btn embed-window",
    title: `Open ${title} in its own desktop window`,
    onclick: () => void openToolInWindow(id),
  }, "Open in a separate window");
  const browserBtn = h("button", {
    type: "button",
    class: "pw-btn embed-browser",
    title: `Open ${title} in your web browser`,
    onclick: () => void openToolInBrowser(id, url),
  }, "Open in my browser");
  const bar = h("div", { class: "pw-row embed-bar" }, h("p", { class: "pw-hint embed-note" }, note), expandBtn, windowBtn, browserBtn);
  root.append(bar, frame);
  return {
    show: () => frame.focus(),
    hide: () => {
      try {
        frame.contentWindow?.postMessage?.({ fmStopGame: true }, "*");
      } catch { /* frame not ready */ }
    },
    frame,
  };
}
