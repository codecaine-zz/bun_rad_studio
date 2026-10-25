// Folder tabs for the main file pane: open multiple folders at once, switch between them, duplicate, or close tabs.
import { $, activeIconPackStyle, h, clear, announce, iconFor, placeIconFor } from "./dom.js";
import { attachDropTarget } from "./dnd.js";
import { showMenu } from "./menus.js";
import { state, on, currentPath, inTrash } from "./state.js";
import { goTo, showTrash } from "./nav.js";
import { copyPathOf, isFavorite, toggleFavorite } from "./ops.js";
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
  const closedTab = state.tabs[idx];
  const closedLabel = tabLabel(closedTab.location);
  if (!Array.isArray(state.closedTabs)) state.closedTabs = [];
  state.closedTabs.push({
    location: cloneLoc(closedTab.location),
    history: [...(closedTab.history ?? [])],
    future: [...(closedTab.future ?? [])],
    selection: [...(closedTab.selection ?? [])],
    scrollTop: closedTab.scrollTop ?? 0,
  });
  if (state.closedTabs.length > 20) state.closedTabs.shift();
  state.tabs.splice(idx, 1);
  if (closingActive) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    if (next) await activateTabObject(next);
  } else {
    renderTabs();
  }
  announce(`Closed ${closedLabel} tab.`);
}

export async function closeOtherTabs(keepTabId = state.activeTabId) {
  ensureInitialTab();
  if (state.tabs.length <= 1) return;
  const keep = state.tabs.find((t) => t.id === keepTabId) ?? state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
  if (!keep) return;
  saveCurrentTabSnapshot();
  if (!Array.isArray(state.closedTabs)) state.closedTabs = [];
  for (const t of state.tabs) {
    if (t.id !== keep.id) {
      state.closedTabs.push({
        location: cloneLoc(t.location),
        history: [...(t.history ?? [])],
        future: [...(t.future ?? [])],
        selection: [...(t.selection ?? [])],
        scrollTop: t.scrollTop ?? 0,
      });
    }
  }
  if (state.closedTabs.length > 20) state.closedTabs.splice(0, state.closedTabs.length - 20);
  state.tabs = [keep];
  if (state.activeTabId !== keep.id) {
    await activateTabObject(keep);
  } else {
    renderTabs();
  }
  announce(`Closed other tabs; kept ${tabLabel(keep.location)}.`);
}

export async function cycleTab(delta = 1) {
  ensureInitialTab();
  if (state.tabs.length <= 1) return;
  const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
  const nextIdx = ((idx < 0 ? 0 : idx) + delta + state.tabs.length) % state.tabs.length;
  await switchTab(state.tabs[nextIdx].id);
}

/** Reopens the most recently closed folder tab from `state.closedTabs`. */
export async function reopenClosedTab() {
  ensureInitialTab();
  if (!Array.isArray(state.closedTabs) || state.closedTabs.length === 0) {
    announce("No recently closed tabs to reopen.");
    return null;
  }
  saveCurrentTabSnapshot();
  const popped = state.closedTabs.pop();
  const id = nextTabSeq++;
  const restored = {
    id,
    location: cloneLoc(popped.location),
    history: [...(popped.history ?? [])],
    future: [...(popped.future ?? [])],
    selection: [...(popped.selection ?? [])],
    scrollTop: popped.scrollTop ?? 0,
  };
  state.tabs.push(restored);
  await activateTabObject(restored);
  announce(`Reopened ${tabLabel(restored.location)} tab.`);
  return restored;
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
    const isTrash = tab.location?.kind === "trash";
    const defaultIcon = isTrash ? "🗑️" : "📁";
    const icon = isTrash
      ? placeIconFor("recycle", "Recycle Bin", undefined, defaultIcon)
      : (activeIconPackStyle() === "default" ? defaultIcon : iconFor(label, true));
    const item = h("div", {
      class: `fm-tab${isCurrent ? " active" : ""}`,
      role: "tab",
      "aria-selected": isCurrent ? "true" : "false",
      dataset: { tabId: String(tab.id), path: tab.location?.path || "" },
      oncontextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const folderPath = !isTrash ? (tab.location?.path || "") : "";
        showMenu([
          { label: "Switch to tab", icon: "📂", disabled: isCurrent, action: () => switchTab(tab.id) },
          { label: "Duplicate tab", icon: "⧉", action: () => duplicateTab(tab.id) },
          ...(folderPath ? [
            { label: isFavorite(folderPath) ? "Remove from Favorites" : "Add to Favorites", icon: "⭐", action: () => toggleFavorite(folderPath) },
            { label: "Copy folder path", icon: "🔗", action: () => copyPathOf([{ path: folderPath }]) },
          ] : []),
          { separator: true },
          { label: "Reopen closed tab", icon: "↺", disabled: !(state.closedTabs && state.closedTabs.length > 0), action: () => reopenClosedTab() },
          { label: "Close tab", icon: "✕", disabled: state.tabs.length <= 1, action: () => closeTab(tab.id) },
          { label: "Close other tabs", icon: "🧹", disabled: state.tabs.length <= 1, action: () => closeOtherTabs(tab.id) },
        ], { x: e.clientX, y: e.clientY, label: `${label} tab` });
      },
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
        h("span", { class: "fm-tab-icon", "aria-hidden": "true", dataset: { tabIcon: isTrash ? "recycle" : "folder", tabName: label, defaultIcon } }, icon),
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
    if (!isTrash && tab.location?.path) {
      attachDropTarget(item, { getPath: () => tab.location.path });
    }
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
  const bar = $("#tabbar");
  bar?.addEventListener("keydown", async (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const tabEl = e.target instanceof Element ? e.target.closest(".fm-tab") : null;
    if (!tabEl || state.tabs.length <= 1) return;
    const curId = Number(tabEl.dataset.tabId);
    const idx = state.tabs.findIndex((t) => t.id === curId);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % state.tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + state.tabs.length) % state.tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = state.tabs.length - 1;
    if (nextIdx >= 0) {
      e.preventDefault();
      const nextTab = state.tabs[nextIdx];
      await switchTab(nextTab.id);
      bar.querySelector(`.fm-tab[data-tab-id="${nextTab.id}"] .fm-tab-select`)?.focus();
    }
  });
  on("view", renderTabs);
  renderTabs();
}
