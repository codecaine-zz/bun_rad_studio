// The terminal panel at the bottom of the window: a real shell, started in the folder you are looking at.
// It shows and hides without ending the shell, so a running command keeps going while the panel is closed.
import { FitAddon } from "/vendor/addon-fit.mjs";
import { Terminal } from "/vendor/xterm.mjs";
import { terminalUrl } from "./api.js";
import { quoteArg, quotePathsForTerminal, shellFor, windowsToGitBash, windowsToWsl } from "./codeRun.js";
import { $ } from "./dom.js";
import { hintOf, labelOf, matchesAction } from "./keymap.js";
import { toast } from "./menus.js";
import { goTo, saveSettings } from "./nav.js";
import { selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";
import { wireTerminalClipboard } from "./terminalClipboard.js";
import { terminalTheme } from "./themes.js";

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1200;
const DEFAULT_HEIGHT = 300;
const STEP = 24;
export { terminalTheme };

/** @type {any} */
let term = null;
/** @type {any} */
let fit = null;
/** @type {WebSocket | null} */
let socket = null;
let height = DEFAULT_HEIGHT;
let ended = false;
let startedIn = "";
let fitQueued = false;
let activeShell = "";
/** The WSL distro's name and drive root, as its prompt reported them (empty until then). */
let wslInfo = {};

function clampHeight(val) {
  return typeof val === "number" && Number.isFinite(val)
    ? Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, val)))
    : DEFAULT_HEIGHT;
}

function persistTerminalState(patch) {
  if (state.settings && typeof state.settings === "object") Object.assign(state.settings, patch);
  if (typeof saveSettings === "function") saveSettings(patch);
}

/** The folder the buttons act on: the one folder selected in the list, otherwise the folder on screen. */
function targetFolder() {
  const picked = selectedEntries();
  if (picked.length === 1 && picked[0].isDir) return picked[0].path;
  return currentFolder();
}

export const terminalAvailable = () => ["darwin", "linux", "win32"].includes(state.platform);

/** The folder to start in: the one on screen, or the home folder when looking at the Recycle Bin. */
function currentFolder() {
  return state.location.kind === "folder" && state.location.path ? state.location.path : state.home;
}

const fontSize = () => Math.round(14 * (state.settings.textSize / 100));

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function setTitle(reported = false) {
  const title = $("#terminal-title");
  title.textContent = startedIn ? `Terminal · ${startedIn}` : "Terminal";
  title.title = reported
    ? `Physical folder reported by the terminal: ${startedIn}. Follow terminal uses this path, which can differ from pwd when symlinks or junctions are involved.`
    : startedIn ? `Requested terminal folder: ${startedIn}. Waiting for the shell to report its physical folder.` : "Terminal";
}

function queueFit() {
  if (fitQueued || !term || $("#terminal-panel").hidden) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    try {
      fit.fit();
    } catch {
      // the panel has no size yet
    }
  });
}

function applyHeight() {
  const max = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.floor((window?.innerHeight || 1000) * 0.7)));
  height = Math.min(max, Math.max(MIN_HEIGHT, height));
  $("#terminal-panel").style.setProperty("--term-height", `${height}px`);
  $("#terminal-resizer").setAttribute("aria-valuenow", String(height));
  queueFit();
}

/** The shell moved to another folder (the person typed `cd`): show that folder in the file list too, if "Follow terminal" is on. */
function followShell(path) {
  startedIn = path;
  setTitle(true);
  if (state.settings.terminalFollow === false) {
    persistTerminalState({ terminalPath: path });
    return;
  }
  persistTerminalState({ terminalPath: path, lastPath: path });
  if (state.location.kind === "folder" && state.location.path === path) return;
  goTo(path);
}

/** Starts a shell in `folder`, ending any earlier one first. */
function connect(folder) {
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  ended = false;
  let opened = false;
  activeShell = shellFor(state.platform);
  wslInfo = {};
  startedIn = folder;
  if (folder && state.terminalOpen) persistTerminalState({ terminalPath: folder });
  setTitle();
  term.reset();
  const dims = fit.proposeDimensions();
  const ws = new WebSocket(terminalUrl(folder, dims?.cols ?? 80, dims?.rows ?? 24));
  socket = ws;
  const markOpen = () => { opened = true; };
  if (typeof ws.addEventListener === "function") ws.addEventListener("open", markOpen, { once: true });
  else ws.onopen = markOpen;
  ws.onmessage = (e) => {
    if (socket !== ws) return;
    let m;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.type === "output" && typeof m.data === "string") term.write(m.data);
    else if (m.type === "cwd" && typeof m.path === "string") {
      activeShell = ["powershell", "cmd", "wsl", "gitbash"].includes(m.shell) ? m.shell : shellFor(state.platform);
      wslInfo = m.shell === "wsl" && m.wsl && typeof m.wsl === "object" ? m.wsl : {};
      followShell(m.path);
    } else if (m.type === "exit") {
      ended = true;
      term.write("\r\n\x1b[2m[The shell ended. Press Enter to start a new one.]\x1b[0m\r\n");
    } else if (m.type === "error") {
      ended = true;
      term.write(`\r\n\x1b[31m${String(m.message ?? "The terminal couldn't start.")}\x1b[0m\r\n\x1b[2m[Press Enter to try again.]\x1b[0m\r\n`);
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    const fallback = currentFolder();
    if (!opened && !ended && folder && fallback && folder !== fallback) {
      connect(fallback);
      return;
    }
    if (!ended) {
      ended = true;
      term.write("\r\n\x1b[2m[The connection to the terminal was lost. Press Enter to start a new one.]\x1b[0m\r\n");
    }
  };
}

function restart(folder = targetFolder()) {
  if (!term) return;
  connect(folder);
  term.focus();
}

/** The shell the terminal is typing into now: on Windows PowerShell, the Command Prompt, WSL (Bash) or Git Bash; elsewhere POSIX. */
export function terminalShell() {
  return state.platform === "win32" ? activeShell || "powershell" : "posix";
}

/** What the WSL prompt reported about its distro ({ distro, driveRoot }), or {} outside WSL. */
export function terminalWsl() {
  return terminalShell() === "wsl" ? wslInfo : {};
}

/**
 * The keystrokes that move `shell` to `folder`, or null when the name can't be typed safely there.
 * Escape clears the line in PowerShell and the Command Prompt; Ctrl+U clears it in Bash (WSL, Git Bash) and other POSIX shells.
 */
export function folderCommand(folder, shell, wsl = {}) {
  if (shell === "wsl") {
    const linux = windowsToWsl(folder, wsl);
    const quoted = quoteArg(linux ?? folder, "posix");
    if (quoted.error) return null;
    return linux ? `\x15cd -- ${quoted.text}\r` : `\x15cd -- "$(wslpath -u ${quoted.text})"\r`;
  }
  if (shell === "gitbash") {
    const quoted = quoteArg(windowsToGitBash(folder), "posix");
    return quoted.error ? null : `\x15cd -- ${quoted.text}\r`;
  }
  const quoted = quoteArg(folder, shell);
  if (quoted.error) return null;
  if (shell === "cmd") return `\x1bcd /d ${quoted.text}\r`;
  if (shell === "powershell") return `\x1bSet-Location -LiteralPath ${quoted.text}\r`;
  return `\x15cd -- ${quoted.text}\r`;
}

/** Moves the running shell to the selected folder (or the one on screen). Always sends the move: the shell may have been used since. */
function goToFolder(folder = targetFolder()) {
  if (!term || ended) return restart(folder);
  // A name with line breaks or other control characters can't be typed safely, so a new shell is started there instead.
  if (/[\x00-\x1f\x7f]/.test(folder)) return restart(folder);
  const command = folderCommand(folder, terminalShell(), wslInfo);
  if (!command) return restart(folder);
  startedIn = folder;
  if (folder) persistTerminalState({ terminalPath: folder });
  setTitle();
  send({ type: "input", data: command });
  term.focus();
}

let clipboard = null;

function ensureTerminal() {
  if (term) return;
  term = new Terminal({
    fontFamily: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace',
    fontSize: fontSize(),
    cursorBlink: true,
    scrollback: 5000,
    theme: terminalTheme(),
    screenReaderMode: false,
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open($("#terminal-host"));
  clipboard = wireTerminalClipboard(term, $("#terminal-host"));
  term.onData((data) => {
    if (ended && data === "\r") return restart();
    send({ type: "input", data });
  });
  term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
  new ResizeObserver(queueFit).observe($("#terminal-host"));
}

/** Shows the terminal and types `text` into it without pressing Enter, so a person can read it first. */
export function typeInTerminal(text) {
  if (!terminalAvailable()) return false;
  showTerminal();
  const send = () => sendInput(text);
  if (socket && socket.readyState === WebSocket.CONNECTING) socket.addEventListener("open", send, { once: true });
  else send();
  return true;
}

function sendInput(text) {
  send({ type: "input", data: text });
  term?.focus();
}

export function isTerminalOpen() {
  return state.terminalOpen;
}

export function isTerminalExpanded() {
  return typeof document !== "undefined" && !!document.getElementById?.("app")?.classList?.contains?.("term-max");
}

function syncTerminalExpandButton(on = isTerminalExpanded()) {
  const btn = typeof document === "undefined" ? null : document.getElementById?.("terminal-expand");
  if (!btn) return;
  const hint = typeof hintOf === "function" ? hintOf("app.expandTool") : "";
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "⛶ Restore" : "⛶ Expand";
  btn.title = on
    ? `Restore the File Manager bars and tabs${hint}`
    : `Fill the whole window with the terminal${hint}`;
}

export function setTerminalExpanded(expanded) {
  const app = typeof document === "undefined" ? null : document.getElementById?.("app");
  if (!app) return;
  const on = Boolean(expanded) && state.terminalOpen;
  if (on && app.classList.contains("power-max")) {
    app.classList.remove("power-max");
    emit("power-max", false);
  }
  app.classList.toggle("term-max", on);
  syncTerminalExpandButton(on);
  emit("term-max", on);
  if (state.terminalOpen) {
    applyHeight();
    try {
      fit?.fit?.();
    } catch {
      // the panel has no size yet
    }
    queueFit();
    term?.focus?.();
  }
}

export function toggleTerminalExpanded() {
  if (isTerminalExpanded()) {
    setTerminalExpanded(false);
    return;
  }
  if (!state.terminalOpen) showTerminal();
  if (state.terminalOpen) setTerminalExpanded(true);
}

export function showTerminal(folder, { focus = true, save = true } = {}) {
  if (!terminalAvailable()) return toast("The terminal isn't supported on this system.", { kind: "error" });
  if (typeof state.settings?.terminalHeight === "number" && Number.isFinite(state.settings.terminalHeight)) {
    height = clampHeight(state.settings.terminalHeight);
  }
  state.terminalOpen = true;
  $("#terminal-panel").hidden = false;
  ensureTerminal();
  applyHeight();
  fit.fit();
  if (!socket) connect(folder ?? currentFolder());
  if (save) {
    persistTerminalState({
      terminalOpen: true,
      terminalHeight: height,
      ...(startedIn ? { terminalPath: startedIn } : {}),
    });
  }
  if (focus) {
    term.focus();
    // Some web views ignore focus that is set while the key press that opened the panel is still being handled.
    requestAnimationFrame(() => state.terminalOpen && term.focus());
  }
  emit("terminal");
}

export function hideTerminal({ save = true } = {}) {
  if (!state.terminalOpen) return;
  if (isTerminalExpanded()) setTerminalExpanded(false);
  const hadFocus = $("#terminal-panel").contains(document.activeElement);
  state.terminalOpen = false;
  $("#terminal-panel").hidden = true;
  if (save) persistTerminalState({ terminalOpen: false });
  if (hadFocus) $("#list").focus();
  emit("terminal");
}

export function toggleTerminal() {
  if (state.terminalOpen) hideTerminal();
  else showTerminal();
}

/** Restores the terminal panel's saved height, working folder, and open/closed state from settings. */
export function restoreTerminal() {
  height = clampHeight(state.settings?.terminalHeight);
  if (!state.settings?.terminalOpen || !terminalAvailable()) return;
  const requested = typeof document !== "undefined" ? (document.querySelector?.('meta[name="fm-start"]')?.getAttribute("content") ?? "") : "";
  const folder = !requested && state.settings.terminalPath ? state.settings.terminalPath : currentFolder();
  showTerminal(folder, { focus: false, save: false });
}

function wireResizer() {
  const bar = $("#terminal-resizer");
  bar.setAttribute("aria-valuemin", String(MIN_HEIGHT));
  let startY = 0;
  let startHeight = 0;
  bar.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    startHeight = height;
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");
    e.preventDefault();
  });
  bar.addEventListener("pointermove", (e) => {
    if (!bar.hasPointerCapture(e.pointerId)) return;
    height = startHeight + (startY - e.clientY);
    applyHeight();
  });
  const stop = (e) => {
    const wasDragging = bar.classList.contains("dragging");
    bar.classList.remove("dragging");
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    if (wasDragging) persistTerminalState({ terminalHeight: height });
  };
  bar.addEventListener("pointerup", stop);
  bar.addEventListener("pointercancel", stop);
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    height += e.key === "ArrowUp" ? STEP : -STEP;
    applyHeight();
    persistTerminalState({ terminalHeight: height });
  });
}

/** Opens the terminal in a folder (the selected one, or the one on screen): starts a shell there, or moves the running one. */
function openHere(path) {
  if (!terminalAvailable()) return toast("The terminal isn't supported on this system.", { kind: "error" });
  const folder = path || targetFolder();
  if (!state.terminalOpen) {
    showTerminal(folder);
    // A shell that is already running keeps its place unless it is somewhere else.
    if (startedIn !== folder) goToFolder(folder);
    return;
  }
  goToFolder(folder);
}

/** Moves (or opens) the terminal in `folder` and types `command`, optionally pressing Enter (`submit: true`). */
export function runInTerminalFolder(folder, command, submit = false) {
  if (!terminalAvailable()) return false;
  const target = folder || currentFolder();
  const hadSocket = !!socket && !ended;
  if (!state.terminalOpen) showTerminal(target);
  else if (ended) restart(target);
  const text = `${command}${submit ? "\r" : ""}`;
  const writeCommand = () => {
    if (hadSocket && startedIn !== target) goToFolder(target);
    sendInput(text);
  };
  if (socket && socket.readyState === WebSocket.CONNECTING) socket.addEventListener("open", writeCommand, { once: true });
  else writeCommand();
  return true;
}

export async function insertPaths(paths) {
  if (!terminalAvailable()) return toast("The terminal isn't supported on this system.", { kind: "error" });
  const checked = quotePathsForTerminal(paths, terminalShell(), wslInfo);
  if (checked.error) return toast(checked.error, { kind: "error" });
  showTerminal();
  if (ended) restart(currentFolder());
  const ws = socket;
  try {
    if (!ws) throw new Error("The Terminal couldn't be opened.");
    if (ws.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          ws.removeEventListener("open", ready);
          ws.removeEventListener("close", failed);
          ws.removeEventListener("error", failed);
        };
        const failed = () => { cleanup(); reject(new Error("The terminal connection was lost.")); };
        const ready = () => { cleanup(); resolve(); };
        const timer = setTimeout(() => { cleanup(); reject(new Error("The terminal did not become ready. Try inserting the paths again.")); }, 5000);
        ws.addEventListener("open", ready);
        ws.addEventListener("close", failed);
        ws.addEventListener("error", failed);
      });
    }
    if (socket !== ws || ws.readyState !== WebSocket.OPEN || ended) throw new Error("The terminal connection was lost.");
    const quoted = quotePathsForTerminal(paths, terminalShell(), wslInfo);
    if (quoted.error) throw new Error(quoted.error);
    sendInput(quoted.text);
    toast("Paths inserted. Add a command or press Enter when you're ready.", { kind: "info" });
  } catch (err) {
    toast(err?.message || "The paths couldn't be inserted.", { kind: "error" });
  }
}

/** The button in the status bar: visible whenever the window is, pressed while the terminal is open. */
function wireStatusButton() {
  const button = $("#status-terminal");
  if (!button) return;
  const paint = () => {
    const open = state.terminalOpen;
    button.setAttribute("aria-pressed", String(open));
    button.title = `${open ? "Hide" : "Show"} the terminal${hintOf("terminal.toggle")}`;
    button.querySelector(".status-terminal-key").textContent = labelOf("terminal.toggle");
  };
  button.addEventListener("click", toggleTerminal);
  on("terminal", paint);
  on("settings", paint);
  paint();
}

export function wireTerminal() {
  height = clampHeight(state.settings?.terminalHeight);
  let restored = false;
  const offWorkspace = on("workspace", () => {
    if (restored) return;
    restored = true;
    offWorkspace();
    restoreTerminal();
  });
  on("toggle-terminal", toggleTerminal);
  on("terminal-here", openHere);
  on("terminal-run-in", ({ folder, command, submit }) => runInTerminalFolder(folder, command, submit));
  on("terminal-insert-paths", (paths) => void insertPaths(paths));
  wireStatusButton();
  on("settings", (change) => {
    if (change && typeof change.terminalHeight === "number") {
      height = clampHeight(change.terminalHeight);
      if (state.terminalOpen) applyHeight();
    }
    if (!term) return;
    const size = fontSize();
    if (term.options.fontSize !== size) {
      term.options.fontSize = size;
      queueFit();
    }
  });
  on("theme-changed", (payload) => {
    if (!term) return;
    term.options.theme = terminalTheme(payload);
  });
  const follow = $("#terminal-follow");
  follow.checked = state.settings.terminalFollow !== false;
  follow.addEventListener("change", () => {
    saveSettings({ terminalFollow: follow.checked });
    toast(follow.checked ? "The file list will follow the terminal's physical folder (symlinks resolved)." : "The file list stays where it is when you change folder in the terminal.", { kind: "info" });
  });
  on("settings", () => { follow.checked = state.settings.terminalFollow !== false; });
  $("#terminal-cliutils")?.addEventListener("click", () => {
    if (!state.cliUtilsDir) return toast("The built-in CLI utilities folder isn't ready yet.", { kind: "info" });
    goTo(state.cliUtilsDir);
    openHere(state.cliUtilsDir);
    toast("CLI Utilities ready in Terminal. Type ./<tool-name> (or press Tab) to run any utility.", { kind: "info" });
  });
  $("#terminal-cd").addEventListener("click", () => goToFolder());
  $("#terminal-restart").addEventListener("click", () => restart());
  $("#terminal-expand")?.addEventListener("click", () => toggleTerminalExpanded());
  $("#terminal-panel")?.querySelector?.(".term-bar")?.addEventListener("dblclick", (e) => {
    if (e.target?.closest?.("button, input, label, a")) return;
    toggleTerminalExpanded();
  });
  $("#terminal-close").addEventListener("click", () => hideTerminal());
  on("power-max", (on) => {
    if (on && isTerminalExpanded()) setTerminalExpanded(false);
  });
  on("terminal", () => syncTerminalExpandButton());
  on("settings", () => syncTerminalExpandButton());
  syncTerminalExpandButton();
  wireResizer();
  window.addEventListener("resize", () => state.terminalOpen && applyHeight());
  // The terminal keys (Ctrl+`, Cmd/Ctrl+Alt+T, and Cmd/Ctrl+Alt+V unless changed in Settings) work everywhere, also while typing in the terminal.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && isTerminalExpanded() && !e.target?.closest?.(".term-host") && !document.querySelector(".modal-backdrop")) {
      e.preventDefault();
      e.stopPropagation();
      setTerminalExpanded(false);
      return;
    }
    const toggle = matchesAction(e, "terminal.toggle");
    const here = !toggle && matchesAction(e, "terminal.here");
    const paste = !toggle && !here && matchesAction(e, "terminal.paste");
    if (!toggle && !here && !paste) return;
    if (document.querySelector(".modal-backdrop")) return;
    e.preventDefault();
    e.stopPropagation();
    if (toggle) toggleTerminal();
    else if (here) openHere();
    else {
      if (!terminalAvailable()) return toast("The terminal isn't supported on this system.", { kind: "error" });
      if (!state.terminalOpen) showTerminal();
      const run = () => {
        if (clipboard && typeof clipboard.paste === "function") void clipboard.paste();
        else $("#terminal-paste")?.click();
      };
      if (socket && socket.readyState === WebSocket.CONNECTING) socket.addEventListener("open", run, { once: true });
      else run();
    }
  }, true);
}

