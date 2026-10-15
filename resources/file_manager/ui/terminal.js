// The terminal panel at the bottom of the window: a real shell, started in the folder you are looking at.
// It shows and hides without ending the shell, so a running command keeps going while the panel is closed.
import { FitAddon } from "/vendor/addon-fit.mjs";
import { Terminal } from "/vendor/xterm.mjs";
import { terminalUrl } from "./api.js";
import { quoteArg, shellFor } from "./codeRun.js";
import { $ } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, saveSettings } from "./nav.js";
import { selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";

const MIN_HEIGHT = 120;
const STEP = 24;
// The terminal is dark in both colour schemes, as terminals usually are.
const THEME = { background: "#1e1e1e", foreground: "#e6e6e6", cursor: "#e6e6e6", cursorAccent: "#1e1e1e", selectionBackground: "#3d5a80" };

/** @type {any} */
let term = null;
/** @type {any} */
let fit = null;
/** @type {WebSocket | null} */
let socket = null;
let height = 300;
let ended = false;
let startedIn = "";
let fitQueued = false;

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

function setTitle() {
  $("#terminal-title").textContent = startedIn ? `Terminal · ${startedIn}` : "Terminal";
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
  const max = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * 0.7));
  height = Math.min(max, Math.max(MIN_HEIGHT, height));
  $("#terminal-panel").style.setProperty("--term-height", `${height}px`);
  $("#terminal-resizer").setAttribute("aria-valuenow", String(height));
  queueFit();
}

/** The shell moved to another folder (the person typed `cd`): show that folder in the file list too, if "Follow terminal" is on. */
function followShell(path) {
  startedIn = path;
  setTitle();
  if (state.settings.terminalFollow === false) return;
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
  startedIn = folder;
  setTitle();
  term.reset();
  const dims = fit.proposeDimensions();
  const ws = new WebSocket(terminalUrl(folder, dims?.cols ?? 80, dims?.rows ?? 24));
  socket = ws;
  ws.onmessage = (e) => {
    if (socket !== ws) return;
    let m;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.type === "output" && typeof m.data === "string") term.write(m.data);
    else if (m.type === "cwd" && typeof m.path === "string") followShell(m.path);
    else if (m.type === "exit") {
      ended = true;
      term.write("\r\n\x1b[2m[The shell ended. Press Enter to start a new one.]\x1b[0m\r\n");
    } else if (m.type === "error") {
      ended = true;
      term.write(`\r\n\x1b[31m${String(m.message ?? "The terminal couldn't start.")}\x1b[0m\r\n\x1b[2m[Press Enter to try again.]\x1b[0m\r\n`);
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    if (!ended) {
      ended = true;
      term.write("\r\n\x1b[2m[The connection to the terminal was lost. Press Enter to start a new one.]\x1b[0m\r\n");
    }
  };
}

function restart() {
  if (!term) return;
  connect(targetFolder());
  term.focus();
}

/** Moves the running shell to the selected folder (or the one on screen). Always sends the move: the shell may have been used since. */
function goToFolder() {
  const folder = targetFolder();
  if (!term || ended) return restart();
  // A name with line breaks or other control characters can't be typed safely, so a new shell is started there instead.
  if (/[\x00-\x1f\x7f]/.test(folder)) return restart();
  const quoted = quoteArg(folder, shellFor(state.platform));
  if (quoted.error) return restart();
  startedIn = folder;
  setTitle();
  // Escape clears PowerShell's line; Ctrl+U clears a POSIX shell's line.
  send({ type: "input", data: state.platform === "win32"
    ? `\x1bSet-Location -LiteralPath ${quoted.text}\r`
    : `\x15cd -- ${quoted.text}\r` });
  term.focus();
}

function ensureTerminal() {
  if (term) return;
  term = new Terminal({
    fontFamily: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace',
    fontSize: fontSize(),
    cursorBlink: true,
    scrollback: 5000,
    theme: THEME,
    screenReaderMode: false,
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open($("#terminal-host"));
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

export function showTerminal() {
  if (!terminalAvailable()) return toast("The terminal isn't supported on this system.", { kind: "error" });
  state.terminalOpen = true;
  $("#terminal-panel").hidden = false;
  ensureTerminal();
  applyHeight();
  fit.fit();
  if (!socket) connect(currentFolder());
  term.focus();
  // Some web views ignore focus that is set while the key press that opened the panel is still being handled.
  requestAnimationFrame(() => state.terminalOpen && term.focus());
  emit("terminal");
}

export function hideTerminal() {
  if (!state.terminalOpen) return;
  const hadFocus = $("#terminal-panel").contains(document.activeElement);
  state.terminalOpen = false;
  $("#terminal-panel").hidden = true;
  if (hadFocus) $("#list").focus();
  emit("terminal");
}

export function toggleTerminal() {
  if (state.terminalOpen) hideTerminal();
  else showTerminal();
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
    bar.classList.remove("dragging");
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
  };
  bar.addEventListener("pointerup", stop);
  bar.addEventListener("pointercancel", stop);
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    height += e.key === "ArrowUp" ? STEP : -STEP;
    applyHeight();
  });
}

export function wireTerminal() {
  on("toggle-terminal", toggleTerminal);
  on("settings", () => {
    if (!term) return;
    const size = fontSize();
    if (term.options.fontSize !== size) {
      term.options.fontSize = size;
      queueFit();
    }
  });
  const follow = $("#terminal-follow");
  if (state.platform === "win32") {
    follow.disabled = true;
    follow.parentElement.title = "Following shell folder changes is currently supported on macOS and Linux only.";
  }
  follow.checked = state.settings.terminalFollow !== false;
  follow.addEventListener("change", () => {
    saveSettings({ terminalFollow: follow.checked });
    toast(follow.checked ? "The file list will follow the terminal." : "The file list stays where it is when you change folder in the terminal.", { kind: "info" });
  });
  on("settings", () => { follow.checked = state.settings.terminalFollow !== false; });
  $("#terminal-cd").addEventListener("click", goToFolder);
  $("#terminal-restart").addEventListener("click", restart);
  $("#terminal-close").addEventListener("click", hideTerminal);
  wireResizer();
  window.addEventListener("resize", () => state.terminalOpen && applyHeight());
  // Ctrl+` (Control on every system) shows or hides the terminal, also while typing in it.
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "`" || e.code === "Backquote")) {
      if (document.querySelector(".modal-backdrop")) return;
      e.preventDefault();
      e.stopPropagation();
      toggleTerminal();
    }
  }, true);
}
