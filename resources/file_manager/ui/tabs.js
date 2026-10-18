// Folder tabs for the main file pane: open multiple folders at once, switch between them, duplicate, or close tabs.
import { $, h, clear, announce } from "./dom.js";
import { state, on, currentPath, inTrash } from "./state.js";
import { goTo, showTrash } from "./nav.js";
import { setActivePane } from "./pane.js";
import { selectKeys } from "./selection.js";
import { hintOf } from "./keymap.js";
import { baseName } from "./util.js";

let nextTabSeq = 1;

function cloneLoc(loc) {
  return loc?.kind === "trash" ? { kind: "trash" } : { kind: "folder", path: loc?.path || state.home || "" };
}

function tabLabel(loc) {
  if (loc?.kind === "trash") return "Recycle Bin";
  const p = loc?.path || state.home || "";
  return baseName(p, state.sep) || p || "Folder";
}

function tabTitle(loc) {
  if (loc?.kind === "trash") return "Recycle Bin — switch to this tab";
  return `${loc?.path || state.home || "Folder"} — click to switch to this folder tab (middle-click to close)`;
}

function ensureInitialTab() {
  if (state.tabs.length > 0) return;
  const id = nextTabSeq++;
  state.tabs.push({
    id,
    location: cloneLoc(state.location),
    history: [...state.history],
    future: [...state.future],
    selection: [...state.selection],
    scrollTop: 0,
  });
  state.activeTabId = id;
}

function saveCurrentTabSnapshot() {
  ensureInitialTab();
  const cur = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
  if (!cur) return;
  cur.location = cloneLoc(state.location);
  cur.history = [...state.history];
  cur.future = [...state.future];
  cur.selection = [...state.selection];
  const wrap = $("#list-wrap");
  if (wrap) cur.scrollTop = wrap.scrollTop || 0;
}

async function activateTabObject(tab) {
  state.activeTabId = tab.id;
  state.history = [...(tab.history ?? [])];
  state.future = [...(tab.future ?? [])];
  setActivePane("left");
  if (tab.location?.kind === "trash") {
    await showTrash({ push: false });
  } else {
    const target = tab.location?.path || currentPath() || state.home;
    if (target) await goTo(target, { push: false });
  }
  if (Array.isArray(tab.selection) && tab.selection.length) {
    selectKeys(tab.selection);
  }
  const wrap = $("#list-wrap");
  if (wrap && typeof tab.scrollTop === "number") wrap.scrollTop = tab.scrollTop;
  renderTabs();
}

export async function switchTab(tabId) {
  ensureInitialTab();
  if (tabId === state.activeTabId) return;
  const target = state.tabs.find((t) => t.id === tabId);
  if (!target) return;
  saveCurrentTabSnapshot();
  await activateTabObject(target);
  announce(`Switched to ${tabLabel(target.location)} tab.`);
}

export async function openNewTab(folderPath) {
  ensureInitialTab();
  saveCurrentTabSnapshot();
  const loc = typeof folderPath === "string" && folderPath.trim()
    ? { kind: "folder", path: folderPath.trim() }
    : inTrash()
      ? { kind: "trash" }
      : { kind: "folder", path: currentPath() || state.home };
  const id = nextTabSeq++;
  const tab = { id, location: loc, history: [], future: [], selection: [], scrollTop: 0 };
  state.tabs.push(tab);
  await activateTabObject(tab);
  announce(`Opened new tab for ${tabLabel(loc)}.`);
}

export async function duplicateTab(tabId = state.activeTabId) {
  ensureInitialTab();
  saveCurrentTabSnapshot();
  const src = state.tabs.find((t) => t.id === tabId) ?? state.tabs[0];
  if (!src) return;
  const id = nextTabSeq++;
  const copy = {
    id,
    location: cloneLoc(src.location),
    history: [...(src.history ?? [])],
    future: [...(src.future ?? [])],
    selection: [...(src.selection ?? [])],
    scrollTop: src.scrollTop ?? 0,
  };
  const idx = state.tabs.indexOf(src);
  state.tabs.splice(idx + 1, 0, copy);
  await activateTabObject(copy);
  announce(`Duplicated ${tabLabel(copy.location)} tab.`);
}

export async function closeTab(tabId = state.activeTabId) {
  ensureInitialTab();
  if (state.tabs.length <= 1) {
    announce("At least one folder tab stays open.");
    return;
  }
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  const closingActive = state.tabs[idx].id === state.activeTabId;
  const closedLabel = tabLabel(state.tabs[idx].location);
  state.tabs.splice(idx, 1);
  if (closingActive) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    if (next) await activateTabObject(next);
  } else {
    renderTabs();
  }
  announce(`Closed ${closedLabel} tab.`);
}

export async function cycleTab(delta = 1) {
  ensureInitialTab();
  if (state.tabs.length <= 1) return;
  const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
  const nextIdx = ((idx < 0 ? 0 : idx) + delta + state.tabs.length) % state.tabs.length;
  await switchTab(state.tabs[nextIdx].id);
}

export function renderTabs() {
  const bar = $("#tabbar");
  if (!bar) return;
  ensureInitialTab();
  const active = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
  if (active && (state.location.kind === "trash" || state.location.path)) {
    active.location = cloneLoc(state.location);
    active.history = [...state.history];
    active.future = [...state.future];
  }
  clear(bar);
  for (const tab of state.tabs) {
    const isCurrent = tab.id === state.activeTabId;
    const label = tabLabel(tab.location);
    const icon = tab.location?.kind === "trash" ? "🗑️" : "📁";
    const item = h("div", {
      class: `fm-tab${isCurrent ? " active" : ""}`,
      role: "tab",
      "aria-selected": isCurrent ? "true" : "false",
      dataset: { tabId: String(tab.id), path: tab.location?.path || "" },
    },
      h("button", {
        type: "button",
        class: "fm-tab-select",
        title: tabTitle(tab.location),
        "aria-label": `${label} tab`,
        onclick: () => switchTab(tab.id),
        onauxclick: (e) => {
          if (e.button === 1 && state.tabs.length > 1) {
            e.preventDefault();
            closeTab(tab.id);
          }
        },
      },
        h("span", { class: "fm-tab-icon", "aria-hidden": "true" }, icon),
        h("span", { class: "fm-tab-label" }, label),
      ),
      state.tabs.length > 1
        ? h("button", {
            type: "button",
            class: "fm-tab-close",
            title: `Close the ${label} tab${hintOf("nav.closeTab")}`,
            "aria-label": `Close ${label} tab`,
            onclick: (e) => {
              e.stopPropagation();
              closeTab(tab.id);
            },
          }, "×")
        : null,
    );
    bar.append(item);
  }
  bar.append(
    h("button", {
      type: "button",
      class: "fm-tab-btn fm-tab-dup",
      title: `Duplicate the current folder tab so you can browse from here in a second tab${hintOf("nav.duplicateTab")}`,
      "aria-label": "Duplicate current folder tab",
      onclick: () => duplicateTab(),
    }, "⧉"),
    h("button", {
      type: "button",
      class: "fm-tab-btn fm-tab-add",
      title: `Open a new folder tab in the current folder${hintOf("nav.newTab")}`,
      "aria-label": "Open a new folder tab",
      onclick: () => openNewTab(),
    }, "+"),
  );
}

export function wireTabs() {
  on("view", renderTabs);
  renderTabs();
}
