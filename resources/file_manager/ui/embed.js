// Small self-contained apps (the calculator, the interval timer) shown in a frame inside the Power tools panel.
// The server serves them on the other spelling of this address (127.0.0.1 or localhost), which the browser treats as
// a separate site: the app runs fully, but can't read this window or its secret token.
import { call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";

/** The address of an embedded app, on the other loopback spelling. */
export function embeddedUrl(id) {
  const other = location.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return `${location.protocol}//${other}${location.port ? `:${location.port}` : ""}/app/${id}/`;
}

const frames = new Set();
let listening = false;

/** A link clicked inside an embedded app arrives here as a message from that app's frame; it opens in the system browser. */
function onFrameMessage(e) {
  const url = e.data && typeof e.data === "object" ? e.data.fmOpenLink : null;
  if (typeof url !== "string") return;
  const from = [...frames].find((f) => f.contentWindow === e.source);
  if (!from || e.origin !== new URL(from.src).origin) return;
  call("link/open", { url }).catch((err) => toast(err?.message || "Couldn't open that link.", { kind: "error" }));
}

/**
 * Fills a tab with a note and the app's frame.
 * @param {HTMLElement} root
 * @param {{ id: string, title: string, note: string }} app
 */
export function mountEmbedded(root, { id, title, note }) {
  root.classList.add("embed-pane");
  const frame = h("iframe", {
    class: "embed-frame", title, src: embeddedUrl(id), referrerpolicy: "no-referrer", loading: "eager",
    allow: "autoplay; fullscreen; clipboard-write",
    sandbox: "allow-scripts allow-same-origin allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox",
  });
  frames.add(frame);
  if (!listening) {
    listening = true;
    window.addEventListener("message", onFrameMessage);
  }
  root.append(h("p", { class: "pw-hint embed-note" }, note), frame);
  return { show: () => frame.focus() };
}
