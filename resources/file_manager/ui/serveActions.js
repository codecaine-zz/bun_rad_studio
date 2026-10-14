// What you can do with servers from anywhere in the page: start or stop one for a folder, open one in the browser,
// and the entries the right-click menu adds for folders and HTML files. The Serve tool, the context menu and the Home
// tile all use these, so a server started from one is seen by the others.
import { ApiError, call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { openPower } from "./power.js";
import { refreshServers, serverFor } from "./serveStore.js";
import { state } from "./state.js";
import { baseName, parentOf } from "./util.js";

const HINT_MS = 10_000;
/** What was found out about folders (do they hold PHP?), so the right-click menu can say so without waiting. */
const hints = new Map();

const errorText = (err, fallback) => (err instanceof ApiError ? err.message : fallback);
const pageUrl = (name) => `/${encodeURIComponent(name)}`;

/** Finds out, in the background, what is in a folder. Called when the pointer rests on a folder or one is selected. */
export function primeHint(path) {
  if (typeof document === "undefined" || !path) return;
  const known = hints.get(path);
  if (known && Date.now() - known.at < HINT_MS) return;
  hints.set(path, { at: Date.now(), php: known?.php ?? false, blocked: known?.blocked ?? false, done: known?.done ?? false });
  call("serve/detect", { path }).then(
    (r) => hints.set(path, { at: Date.now(), php: !!(r.hasPhp || r.framework), blocked: false, done: true }),
    (err) => hints.set(path, { at: Date.now(), php: false, blocked: err instanceof ApiError && ["PROTECTED", "NOT_FOUND", "NOT_A_FOLDER", "BAD_PATH"].includes(err.code), done: true }),
  );
}

export const hintFor = (path) => hints.get(path);
export const forgetHints = () => hints.clear();

/** Starts a server. Returns it, or null when it couldn't start (the reason goes to `onError`, by default a message at the bottom). A server already running for the folder is used as is. */
export async function startServer(body, { onError } = {}) {
  const report = onError ?? ((message) => toast(message, { kind: "error" }));
  if (body.lan) {
    const ok = await confirmBox({
      title: "Let other devices on your network see this?", confirmLabel: "Start for my network", danger: true,
      message: "Anyone on the same Wi-Fi or network can open this server and read every file in the folder while it runs. Only do this on a network you trust. It is meant for trying your work on a phone or another computer.",
      details: [`Folder: ${body.root}`, body.kind === "php" ? "PHP's built-in server is for development only and isn't safe on a network." : "The files are shown read-only."],
    });
    if (!ok) return null;
  }
  try {
    const r = await call("serve/start", body);
    await refreshServers();
    toast(`${r.server.kind === "php" ? "PHP" : "Live"} server started at ${r.server.url}`, { kind: "success", action: { label: "Open", run: () => openServer(r.server.id) } });
    if (r.openError) toast(r.openError, { kind: "error" });
    return r.server;
  } catch (err) {
    if (err instanceof ApiError && err.code === "ALREADY_RUNNING" && err.details?.server) {
      await refreshServers();
      toast(err.message, { action: { label: "Open", run: () => openServer(err.details.server.id) } });
      return err.details.server;
    }
    report(errorText(err, "The server couldn't be started."));
    return null;
  }
}

export async function stopServer(id) {
  try {
    await call("serve/stop", { id });
    toast("Server stopped.", { kind: "success" });
  } catch (err) {
    if (!(err instanceof ApiError && err.code === "NOT_FOUND")) toast(errorText(err, "The server couldn't be stopped."), { kind: "error" });
  }
  await refreshServers();
}

export async function openServer(id, path = "/") {
  try {
    await call("serve/open", { id, path });
    return true;
  } catch (err) {
    toast(errorText(err, "The browser couldn't be opened."), { kind: "error" });
    return false;
  }
}

/** The options a quick start uses: what the Serve tool remembered, never the network option. */
function quickOptions() {
  const o = state.settings.serveOptions ?? { liveReload: true };
  return { liveReload: o.liveReload !== false, openBrowser: true, lan: false };
}

/** "Start live server here" / "Start PHP server here" from a menu or tile. */
export async function startHere(path, kind) {
  let docroot = "";
  if (kind === "php") {
    try {
      docroot = (await call("serve/detect", { path })).suggestedDocroot ?? "";
    } catch (err) {
      toast(errorText(err, "That folder couldn't be checked."), { kind: "error" });
      return null;
    }
  }
  return startServer({ root: path, kind, docroot, ...quickOptions() });
}

/** "Open with live server": serves the file's folder (or reuses the running server) and opens that page. */
export async function openWithLiveServer(entry) {
  const folder = parentOf(entry.path, state.sep);
  if (!folder) return null;
  let server = serverFor(folder, "static");
  if (!server) {
    server = await startServer({ root: folder, kind: "static", ...quickOptions(), openBrowser: false });
    if (!server) return null;
  }
  await openServer(server.id, pageUrl(baseName(entry.path, state.sep)));
  return server;
}

/** The entries the right-click menu adds for one folder or HTML file. Empty for anything else. */
export function serveMenuItems(entries) {
  if (entries.length !== 1) return [];
  const e = entries[0];
  if (e.isDir) {
    primeHint(e.path);
    const hint = hintFor(e.path);
    if (hint?.blocked) return [];
    const live = serverFor(e.path, "static");
    const php = serverFor(e.path, "php");
    return [
      live
        ? { label: "Stop live server", icon: "⏹️", action: () => stopServer(live.id) }
        : { label: "Start live server here", icon: "🌐", action: () => startHere(e.path, "static") },
      php || hint?.php
        ? (php ? { label: "Stop PHP server", icon: "⏹️", action: () => stopServer(php.id) } : { label: "Start PHP server here", icon: "🐘", action: () => startHere(e.path, "php") })
        : null,
    ];
  }
  if (/\.html?$/i.test(e.name)) return [{ label: "Open with live server", icon: "🌐", action: () => openWithLiveServer(e) }];
  return [];
}

/** Opens the Serve tool, ready to start a server for `path`. */
export function openServeTool(path) {
  openPower("serve", path ? { path } : undefined);
}
