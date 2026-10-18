// The API Studio, App Bundler and Env Studio as tools of the Find & more panel. Each one runs inside the File Manager
// (see src/features/filemanager/fmHostedStudios.ts) and is shown in a frame on the other loopback spelling of this
// address, which the browser treats as a separate site: the tool runs fully, but can't read this window or its token.
import { call } from "./api.js";
import { h } from "./dom.js";
import { errorText } from "./dbState.js";
import { syncFrameTheme } from "./embed.js";
import { isPowerExpanded, openToolInBrowser, openToolInWindow, registerPowerTab, togglePowerExpanded } from "./power.js";
import { on } from "./state.js";

const TOOLS = [
  { id: "api", label: "API", icon: "🛰️", group: "network", tip: "API Studio: send HTTP and REST requests, import cURL commands, inspect and export responses",
    note: "API Studio. Requests are sent from this computer; nothing goes through anyone else." },
  { id: "bundler", label: "Bundler", icon: "📦", group: "files", tip: "App Bundler: turn a Bun project into one file, a standalone program or a macOS .app",
    note: "App Bundler. Pick a project folder and an entry file, then build." },
  { id: "env", label: "Env", icon: "🔑", group: "security", tip: "Env Studio: edit .env files, find duplicates and mistakes, compare with an example file, keep secrets masked",
    note: "Env Studio. Values stay on this computer; secret-looking values are masked until you reveal them." },
];

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox";

/** The frame's address: the other spelling of this address (127.0.0.1 <-> localhost), with the tool's own secret. */
export function hostedUrl(id, secret) {
  const other = location.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return `${location.protocol}//${other}${location.port ? `:${location.port}` : ""}/app/hosted/${id}/?s=${encodeURIComponent(secret)}`;
}

function mountTool(tool, root) {
  root.classList.add("embed-pane");
  const note = h("p", { class: "pw-hint embed-note" }, tool.note);
  const status = h("span", { class: "pw-status", role: "status" });
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
    title: `Open ${tool.label} Studio in its own desktop window`,
    onclick: () => void openToolInWindow(tool.id),
  }, "Open in a separate window");
  const browserBtn = h("button", {
    type: "button",
    class: "pw-btn embed-browser",
    title: `Open ${tool.label} Studio in your web browser`,
    onclick: () => void openToolInBrowser(tool.id, frame?.src || ""),
  }, "Open in my browser");
  const restart = h("button", { type: "button", class: "pw-btn", title: "Close this tool and start it fresh", onclick: () => start() }, "↻ Restart");
  const bar = h("div", { class: "pw-row embed-bar" }, note, status, expandBtn, windowBtn, browserBtn, restart);
  let frame = null;
  let started = false;

  on("theme-changed", (payload) => {
    if (frame) syncFrameTheme(frame, payload);
  });

  async function start() {
    status.textContent = "Starting…";
    try {
      const r = await call("studios/open", { id: tool.id });
      const next = h("iframe", { class: "embed-frame", title: r.title, src: hostedUrl(tool.id, r.secret), referrerpolicy: "no-referrer", loading: "eager", allow: "clipboard-write; fullscreen", sandbox: SANDBOX });
      next.addEventListener("load", () => syncFrameTheme(next));
      if (frame) frame.replaceWith(next);
      else root.append(next);
      frame = next;
      status.textContent = "";
      started = true;
    } catch (err) {
      status.textContent = errorText ? errorText(err) : String(err?.message ?? err);
    }
  }

  root.append(bar);
  return {
    show() {
      if (!started) void start();
      else frame?.focus();
    },
  };
}

for (const tool of TOOLS) {
  registerPowerTab({ id: tool.id, label: tool.label, icon: tool.icon, tip: tool.tip, group: tool.group, mount: (root) => mountTool(tool, root) });
}
