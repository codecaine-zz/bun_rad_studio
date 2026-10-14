// Small self-contained apps (the calculator, the interval timer) shown in a frame inside the Power tools panel.
// The server serves them on the other spelling of this address (127.0.0.1 or localhost), which the browser treats as
// a separate site: the app runs fully, but can't read this window or its secret token.
import { h } from "./dom.js";

/** The address of an embedded app, on the other loopback spelling. */
export function embeddedUrl(id) {
  const other = location.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return `${location.protocol}//${other}${location.port ? `:${location.port}` : ""}/app/${id}/`;
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
  root.append(h("p", { class: "pw-hint embed-note" }, note), frame);
  return { show: () => frame.focus() };
}
