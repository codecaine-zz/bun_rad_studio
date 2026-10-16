// The workspace views: Files, Home, Tools, Split and Dual, plus the Focus toggle and the collapsible sidebar.
// This file owns which panes are showing and how they are laid out; the panes themselves live in their own modules
// (the file list in list.js, the start page in home.js, the tools in power.js, the second folder in dual.js).
import { $, clear, h } from "./dom.js";
import { enterDual } from "./dual.js";
import { renderHome } from "./home.js";
import { menuIsOpen } from "./menus.js";
import { saveSettings } from "./nav.js";
import { activePowerTab, concealPower, listPowerTabs, powerIsOpen, revealPower, setPowerHost } from "./power.js";
import { emit, on, state } from "./state.js";

const mac = () => state.platform === "darwin";
const altKey = () => (mac() ? "⌥" : "Alt+");

/** The five views. `key` is the digit that goes with Alt (Option on a Mac). */
export const VIEWS = [
  { id: "files", icon: "📁", label: "Files", key: "1", tip: "Browse your folders and files. This is the everyday view." },
  { id: "home", icon: "🏠", label: "Home", key: "2", tip: "A friendly start page: everything this app can do, your favorite folders, drives and recent files." },
  { id: "tools", icon: "🧰", label: "Tools", key: "3", tip: "Find, Replace, Watch, Crypto, Code, Calculator and more, with the whole window to work in." },
  { id: "split", icon: "⫼", label: "Split", key: "4", tip: "Your files on one side and a tool beside them, so you can use both at once." },
  { id: "dual", icon: "🗂", label: "Dual", key: "5", tip: "Two folders side by side. Copy or move between them with F5 and F6, or by dragging." },
];

const SPLIT_MIN = 20;
const SPLIT_MAX = 80;
const SPLIT_STEP = 2;
const DUAL_DEFAULT = 50;
let dualSize = DUAL_DEFAULT;

const app = () => $("#app");
export const currentWorkspace = () => state.workspace;

/** Where the size of the first pane is kept: the Split view remembers it, the Dual view only for this visit. */
function paneSize() {
  return state.workspace === "dual" ? dualSize : state.settings.splitSize;
}

function applySplit() {
  const stage = $("#stage");
  const sep = $("#splitter");
  if (!stage || !sep) return;
  const size = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, paneSize()));
  stage.style.setProperty("--split", String(size));
  const stacked = state.workspace === "split" && state.settings.splitSide === "bottom";
  app().dataset.splitSide = stacked ? "bottom" : "right";
  sep.setAttribute("aria-orientation", stacked ? "horizontal" : "vertical");
  sep.setAttribute("aria-valuemin", String(SPLIT_MIN));
  sep.setAttribute("aria-valuemax", String(SPLIT_MAX));
  sep.setAttribute("aria-valuenow", String(Math.round(size)));
  sep.setAttribute("aria-valuetext", `${Math.round(size)} percent for ${state.workspace === "dual" ? "the left folder" : "the files"}`);
  const name = state.workspace === "dual" ? "the two folders" : "the files and the tool";
  sep.setAttribute("aria-label", `The dividing line between ${name}. Press the ${stacked ? "up and down" : "left and right"} arrow keys to move it, Home to put it back in the middle.`);
  sep.title = "Drag to resize. Double-click to put it back in the middle.";
  updateOrientButton();
}

function updateOrientButton() {
  const btn = $("#split-orient");
  if (!btn) return;
  btn.hidden = state.workspace !== "split";
  const stacked = state.settings.splitSide === "bottom";
  clear(btn).append(h("span", { "aria-hidden": "true" }, stacked ? "⇆" : "⇅"), h("span", { class: "vb-label" }, stacked ? "Side by side" : "Stacked"));
  btn.title = stacked ? "Put the tool to the right of the files instead of underneath" : "Put the tool underneath the files instead of beside them";
  btn.setAttribute("aria-label", stacked ? "Put the tool beside the files" : "Put the tool under the files");
}

function updateSwitch() {
  for (const btn of document.querySelectorAll("#view-switch [role=radio]")) {
    const on = btn.dataset.view === state.workspace;
    btn.setAttribute("aria-checked", String(on));
    btn.tabIndex = on ? 0 : -1;
    btn.classList.toggle("active", on);
  }
}

function renderSwitch() {
  const box = clear($("#view-switch"));
  for (const v of VIEWS) {
    box.append(h("button", {
      type: "button", role: "radio", id: `view-${v.id}`, class: "vb-btn vb-view", dataset: { view: v.id }, "aria-checked": "false", tabindex: "-1",
      title: `${v.label}: ${v.tip} (${altKey()}${v.key})`, onclick: () => setWorkspace(v.id),
    }, h("span", { class: "vb-icon", "aria-hidden": "true" }, v.icon), h("span", { class: "vb-label" }, v.label)));
  }
  updateSwitch();
}

/** The tool a view should open on: the one last used there, otherwise the one on screen, otherwise the first. */
function toolFor(view) {
  const ids = listPowerTabs().map((t) => t.id);
  const wanted = view === "split" ? state.settings.splitTool : state.settings.activeTool;
  return [wanted, activePowerTab(), ids[0]].find((id) => id && ids.includes(id));
}

/**
 * Switches the view. `tool`/`opts` (for Tools and Split) say which tool tab to show and what to tell it;
 * `focus: true` moves the keyboard to the new view; `save: false` is for restoring at start-up.
 * @param {string} view
 * @param {{ tool?: string, opts?: Record<string, unknown>, focus?: boolean, save?: boolean }} [options]
 */
export function setWorkspace(view, { tool, opts, focus = false, save = true } = {}) {
  if (!VIEWS.some((v) => v.id === view)) return;
  const before = state.workspace;
  state.workspace = view;
  const root = app();
  root.dataset.workspace = view;
  const wantsPower = view === "tools" || view === "split";
  $("#body").hidden = view === "tools" || view === "home";
  $("#home").hidden = view !== "home";
  $("#dual-pane").hidden = view !== "dual";
  $("#splitter").hidden = !(view === "split" || view === "dual");
  applySplit();
  updateSwitch();
  if (wantsPower) revealPower(tool ?? toolFor(view), opts, { focus: save });
  else concealPower();
  if (view === "home") renderHome();
  if (view === "dual") enterDual();
  if (save && before !== view) saveSettings({ workspace: view }).catch(() => {});
  emit("workspace", view);
  if (focus) focusContent(view);
}

function focusContent(view) {
  const target = { files: "#list", home: "#home-search", dual: "#list", tools: null, split: null }[view];
  if (target) $(target)?.focus();
  else $(`#power-tab-${activePowerTab()}`)?.focus();
}

/** Sets the view from the saved settings at start-up. Nothing is saved and no focus is taken. */
export function restoreWorkspace() {
  const s = state.settings;
  const view = s.startWith === "files" ? "files" : s.startWith === "home" ? "home" : s.workspace;
  applyFocusMode(s.focusMode, { save: false });
  applySidebar(s.sidebarCollapsed, { save: false });
  setWorkspace(view, { save: false });
}

// ---------------------------------------------------------------------------------------------------------------
// Focus and the sidebar
// ---------------------------------------------------------------------------------------------------------------

function applyFocusMode(on, { save = true } = {}) {
  app().classList.toggle("focus-mode", on);
  const btn = $("#focus-toggle");
  btn?.setAttribute("aria-pressed", String(on));
  if (btn) btn.title = on ? "Bring back the toolbar and side panels (Esc or Alt+6)" : `Hide the toolbar and side panels so the list or tool has the whole window (${altKey()}6). Press Esc to bring them back.`;
  state.settings.focusMode = on;
  syncSidebarButton();
  if (save) saveSettings({ focusMode: on }).catch(() => {});
}

export const focusModeOn = () => app().classList.contains("focus-mode");
export const toggleFocusMode = () => applyFocusMode(!focusModeOn());

/** The Places button says what is really on screen: the list is hidden while it is collapsed and also while Focus is on. */
function syncSidebarButton() {
  const shown = !app().classList.contains("sidebar-collapsed") && !app().classList.contains("focus-mode");
  const btn = $("#sidebar-toggle");
  btn?.setAttribute("aria-expanded", String(shown));
  if (btn) btn.title = `${shown ? "Hide" : "Show"} the list of places on the left (${altKey()}7)`;
}

function applySidebar(collapsed, { save = true } = {}) {
  app().classList.toggle("sidebar-collapsed", collapsed);
  state.settings.sidebarCollapsed = collapsed;
  syncSidebarButton();
  if (save) saveSettings({ sidebarCollapsed: collapsed }).catch(() => {});
}

/**
 * Show or hide the list of places. Focus hides the sidebar too, and Focus is remembered between runs, so a window that starts
 * in Focus has no Places: asking for Places there leaves Focus and shows the list (both choices are saved).
 */
export function toggleSidebar() {
  if (focusModeOn()) {
    applyFocusMode(false);
    applySidebar(false);
    return;
  }
  applySidebar(!app().classList.contains("sidebar-collapsed"));
}

// ---------------------------------------------------------------------------------------------------------------
// The divider between the two panes
// ---------------------------------------------------------------------------------------------------------------

function setSize(value, { save = false } = {}) {
  const size = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value)));
  if (state.workspace === "dual") dualSize = size;
  else {
    state.settings.splitSize = size;
    if (save) saveSettings({ splitSize: size }).catch(() => {});
  }
  applySplit();
  return size;
}

export function setSplitSide(side) {
  state.settings.splitSide = side;
  applySplit();
  saveSettings({ splitSide: side }).catch(() => {});
}

function wireSplitter() {
  const sep = $("#splitter");
  const stage = $("#stage");
  const vertical = () => state.workspace === "split" && state.settings.splitSide === "bottom";
  sep.addEventListener("pointerdown", (e) => {
    sep.setPointerCapture?.(e.pointerId);
    stage.classList.add("resizing");
    e.preventDefault();
  });
  sep.addEventListener("pointermove", (e) => {
    if (!stage.classList.contains("resizing")) return;
    const box = stage.getBoundingClientRect();
    const share = vertical() ? (e.clientY - box.top) / Math.max(1, box.height) : (e.clientX - box.left) / Math.max(1, box.width);
    setSize(share * 100);
  });
  const stop = (e) => {
    if (!stage.classList.contains("resizing")) return;
    stage.classList.remove("resizing");
    if (sep.hasPointerCapture?.(e.pointerId)) sep.releasePointerCapture(e.pointerId);
    setSize(paneSize(), { save: true });
  };
  sep.addEventListener("pointerup", stop);
  sep.addEventListener("pointercancel", stop);
  sep.addEventListener("dblclick", () => setSize(state.workspace === "dual" ? DUAL_DEFAULT : 50, { save: true }));
  sep.addEventListener("keydown", (e) => {
    const stacked = vertical();
    const less = stacked ? "ArrowUp" : "ArrowLeft";
    const more = stacked ? "ArrowDown" : "ArrowRight";
    const step = e.shiftKey ? SPLIT_STEP * 5 : SPLIT_STEP;
    let size = null;
    if (e.key === less) size = paneSize() - step;
    else if (e.key === more) size = paneSize() + step;
    else if (e.key === "Home") size = 50;
    if (size === null) return;
    e.preventDefault();
    e.stopPropagation();
    setSize(size, { save: true });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------------------------

function wireSwitchKeys() {
  $("#view-switch").addEventListener("keydown", (e) => {
    const i = VIEWS.findIndex((v) => v.id === state.workspace);
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = VIEWS[(i + 1) % VIEWS.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = VIEWS[(i + VIEWS.length - 1) % VIEWS.length];
    else if (e.key === "Home") next = VIEWS[0];
    else if (e.key === "End") next = VIEWS.at(-1);
    if (!next) return;
    e.preventDefault();
    setWorkspace(next.id);
    $(`#view-${next.id}`)?.focus();
  });
}

function wireShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || document.querySelector(".modal-backdrop") || menuIsOpen()) return;
    const inTerminal = e.target instanceof Element && !!e.target.closest("#terminal-panel");
    if (e.key === "Escape" && focusModeOn() && !inTerminal) {
      e.preventDefault();
      applyFocusMode(false);
      return;
    }
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || inTerminal) return;
    // Option+digit types a symbol on a Mac, so look at the physical key rather than the character.
    const digit = /^Digit([1-7])$/.exec(e.code ?? "")?.[1] ?? (/^[1-7]$/.test(e.key) ? e.key : null);
    if (!digit) return;
    e.preventDefault();
    if (digit === "6") toggleFocusMode();
    else if (digit === "7") toggleSidebar();
    else setWorkspace(VIEWS[Number(digit) - 1].id, { focus: true });
  });
}

export function wireWorkspace() {
  renderSwitch();
  wireSwitchKeys();
  wireSplitter();
  wireShortcuts();
  $("#focus-toggle").addEventListener("click", toggleFocusMode);
  $("#sidebar-toggle").addEventListener("click", toggleSidebar);
  $("#split-orient").addEventListener("click", () => setSplitSide(state.settings.splitSide === "bottom" ? "right" : "bottom"));
  // The tools panel asks us to put it somewhere when something (a button, Ctrl+Shift+F, the code editor) opens it.
  setPowerHost({
    open: (tool, opts) => setWorkspace("tools", { tool, opts, save: true }),
    leave: () => setWorkspace("files", { focus: true }),
  });
  on("workspace-go", (view) => setWorkspace(view, { focus: true }));
  on("power-tab", (id) => {
    if (!powerIsOpen()) return;
    if (state.workspace === "tools" && state.settings.activeTool !== id) saveSettings({ activeTool: id }).catch(() => {});
    else if (state.workspace === "split" && state.settings.splitTool !== id) saveSettings({ splitTool: id }).catch(() => {});
  });
}
