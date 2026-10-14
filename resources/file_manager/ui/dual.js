// The Dual view's second pane. The left side is the normal file list (full features); this is a lighter pane on the
// right with its own folder, breadcrumbs and selection. It can browse, open, drag and drop, move to the Recycle Bin,
// and copy or move to and from the left folder (F5 / F6), but it has no rename, sorting headings, search or Details.
import { ApiError, call } from "./api.js";
import { $, clear, h, iconFor } from "./dom.js";
import { attachDropTarget, endDrag, startDrag } from "./dnd.js";
import { menuIsOpen, showMenu, toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { dropOnTrash, openEntry, transferInto } from "./ops.js";
import { selectedEntries } from "./selection.js";
import { on, state } from "./state.js";
import { collapseCrumbs, formatDate, formatSize, isModifier, parentOf, plural, rangeIndexes, sortEntries, splitPath } from "./util.js";

const LIMIT = 1000;
const right = { path: "", entries: [], total: 0, selection: new Set(), focusKey: null, anchorKey: null, loading: 0 };
let built = false;
let loadNumber = 0;
let refreshTimer = 0;
/** "left" (the normal file list) or "right" (this pane): which one F5, F6 and Delete act on. */
let active = "left";

const mod = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");
const byId = (id) => document.getElementById(id);
const sorted = () => sortEntries(right.entries, { by: state.settings.sortBy, dir: state.settings.sortDir, foldersFirst: state.settings.foldersFirst });
const leftFolder = () => (state.location.kind === "folder" && !state.search ? state.location.path : "");
export const dualActivePane = () => active;

function setActive(side) {
  active = side;
  const app = $("#app");
  if (app) app.dataset.dualActive = side;
}

function rightEntries(keys) {
  const byPath = new Map(right.entries.map((e) => [e.path, e]));
  return keys.map((k) => byPath.get(k)).filter(Boolean);
}

const rightSelected = () => rightEntries([...right.selection]);

// ---------------------------------------------------------------------------------------------------------------
// Loading and drawing
// ---------------------------------------------------------------------------------------------------------------

/** Opens `path` in the right pane. Resolves true when it worked; a problem is explained and leaves the old folder. */
export async function loadRight(path, { keep = false } = {}) {
  const mine = ++loadNumber;
  right.loading++;
  try {
    const res = await call("list", { path, showHidden: state.settings.showHidden });
    if (mine !== loadNumber) return false;
    const moved = res.path !== right.path;
    right.path = res.path;
    right.entries = res.entries;
    right.total = res.total;
    if (keep && !moved) right.selection = new Set([...right.selection].filter((k) => res.entries.some((e) => e.path === k)));
    else right.selection = new Set();
    if (!right.selection.has(right.focusKey)) right.focusKey = null;
    right.anchorKey = null;
    if (moved && state.settings.dualPath !== res.path) saveSettings({ dualPath: res.path }).catch(() => {});
    renderRight();
    return true;
  } catch (err) {
    if (mine === loadNumber) toast(err instanceof ApiError ? err.message : "That folder couldn't be opened.", { kind: "error" });
    return false;
  } finally {
    right.loading--;
  }
}

function renderCrumbs() {
  const box = clear(byId("dual-crumbs"));
  const parts = collapseCrumbs(splitPath(right.path, state.sep), 3);
  parts.forEach((c, i) => {
    const last = i === parts.length - 1;
    const el = h("button", { type: "button", class: `crumb${last ? " current" : ""}`, title: c.path, "aria-current": last ? "page" : null, onclick: () => loadRight(c.path) }, c.root && state.sep === "/" ? "💻 Computer" : c.name);
    attachDropTarget(el, { getPath: () => c.path });
    box.append(el);
    if (!last) box.append(h("span", { class: "crumb-sep", "aria-hidden": "true" }, "›"));
  });
  const up = byId("dual-up");
  if (up) up.disabled = !parentOf(right.path, state.sep);
}

function makeRow(entry, index) {
  const row = h("div", {
    class: `row${entry.isDir ? " is-folder" : ""}${entry.hidden ? " hidden-item" : ""}`, role: "option", id: `dual-row-${index}`,
    "aria-selected": String(right.selection.has(entry.path)), draggable: "true", dataset: { key: entry.path }, title: entry.path,
  },
    h("span", { class: "c-icon", "aria-hidden": "true" }, entry.icon || iconFor(entry.name, entry.isDir)),
    h("span", { class: "c-name" }, h("span", { class: "name-text" }, entry.name)),
    h("span", { class: "c-date" }, formatDate(entry.mtimeMs)),
    h("span", { class: "c-size" }, entry.isDir ? "" : formatSize(entry.size)));
  if (entry.isDir) attachDropTarget(row, { getPath: () => entry.path });
  return row;
}

function renderRight() {
  const list = byId("dual-list");
  if (!list) return;
  const entries = sorted();
  const frag = document.createDocumentFragment();
  entries.slice(0, LIMIT).forEach((e, i) => frag.append(makeRow(e, i)));
  clear(list).append(frag);
  const empty = byId("dual-empty");
  empty.hidden = entries.length > 0;
  renderCrumbs();
  syncRight();
}

function syncRight() {
  const list = byId("dual-list");
  for (const row of list.children) {
    const selected = right.selection.has(row.dataset.key);
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", String(selected));
    row.classList.toggle("focused", row.dataset.key === right.focusKey);
  }
  const focused = right.focusKey ? [...list.children].find((r) => r.dataset.key === right.focusKey) : null;
  if (focused) {
    list.setAttribute("aria-activedescendant", focused.id);
    focused.scrollIntoView?.({ block: "nearest" });
  } else list.removeAttribute("aria-activedescendant");
  const chosen = right.selection.size;
  const shown = Math.min(LIMIT, right.entries.length);
  byId("dual-status").textContent = `${plural(right.total, "item")}${right.total > shown ? ` (first ${shown.toLocaleString()} shown)` : ""}${chosen ? ` · ${chosen} selected` : ""}`;
  for (const id of ["dual-copy-left", "dual-move-left"]) $(`#${id}`).disabled = !chosen || !leftFolder();
  for (const id of ["dual-copy-right", "dual-move-right"]) $(`#${id}`).disabled = !state.selection.size || !right.path;
  byId("dual-trash").disabled = !chosen;
}

// ---------------------------------------------------------------------------------------------------------------
// Selecting
// ---------------------------------------------------------------------------------------------------------------

function selectKey(key, e) {
  const keys = sorted().slice(0, LIMIT).map((x) => x.path);
  if (e && isModifier(e, state.platform)) {
    if (right.selection.has(key)) right.selection.delete(key);
    else right.selection.add(key);
    right.anchorKey = key;
  } else if (e?.shiftKey && right.anchorKey && keys.includes(right.anchorKey)) {
    right.selection = new Set(rangeIndexes(keys.indexOf(right.anchorKey), keys.indexOf(key)).map((i) => keys[i]));
  } else {
    right.selection = new Set([key]);
    right.anchorKey = key;
  }
  right.focusKey = key;
  syncRight();
}

function moveFocus(delta, e) {
  const keys = sorted().slice(0, LIMIT).map((x) => x.path);
  if (!keys.length) return;
  const i = keys.indexOf(right.focusKey);
  const next = Math.min(keys.length - 1, Math.max(0, delta === "home" ? 0 : delta === "end" ? keys.length - 1 : (i < 0 ? 0 : i + delta)));
  if (e.shiftKey) {
    right.anchorKey ??= keys[Math.max(0, i)];
    right.selection = new Set(rangeIndexes(keys.indexOf(right.anchorKey), next).map((k) => keys[k]));
    right.focusKey = keys[next];
    syncRight();
  } else selectKey(keys[next]);
}

async function openRight(entry) {
  if (entry.isDir) await loadRight(entry.path);
  else await openEntry(entry);
}

// ---------------------------------------------------------------------------------------------------------------
// Copy, move and delete between the panes
// ---------------------------------------------------------------------------------------------------------------

/** Takes the selection of one pane to the folder of the other. `from` is "left" or "right". */
export async function transferBetween(from, mode) {
  const dest = from === "left" ? right.path : leftFolder();
  const sources = from === "left" ? selectedEntries().map((e) => e.path) : [...right.selection];
  if (!dest) return toast(from === "left" ? "The right pane has no folder open yet." : "Open a folder in the left pane first. Search results and the Recycle Bin can't receive files.");
  if (!sources.length) return toast(`Select something in the ${from} pane first.`);
  await transferInto(dest, sources, mode);
  scheduleRefresh();
}

async function trashRight() {
  const paths = [...right.selection];
  if (!paths.length) return;
  await dropOnTrash(paths);
  scheduleRefresh();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (state.workspace === "dual" && right.path && !right.loading) loadRight(right.path, { keep: true });
  }, 150);
}

function showRowMenu(entry, point) {
  if (!right.selection.has(entry.path)) selectKey(entry.path);
  const chosen = rightSelected();
  showMenu([
    { label: "Open", icon: entry.isDir ? "📂" : "📄", action: () => openRight(entry) },
    { separator: true },
    { label: "Copy to the left folder", icon: "📋", shortcut: "F5", disabled: !leftFolder(), action: () => transferBetween("right", "copy") },
    { label: "Move to the left folder", icon: "✂️", shortcut: "F6", disabled: !leftFolder(), action: () => transferBetween("right", "move") },
    { separator: true },
    { label: chosen.length > 1 ? `Move ${chosen.length} items to the Recycle Bin` : "Move to the Recycle Bin", icon: "🗑️", shortcut: "Delete", danger: true, action: trashRight },
  ], { ...point, label: "Right pane item" });
}

// ---------------------------------------------------------------------------------------------------------------
// Building the pane
// ---------------------------------------------------------------------------------------------------------------

function actionButton(id, icon, label, tip, run) {
  return h("button", { type: "button", class: "dual-btn", id, title: tip, onclick: run }, h("span", { "aria-hidden": "true" }, icon), h("span", { class: "dual-btn-label" }, label));
}

function build() {
  const pane = $("#dual-pane");
  clear(pane).append(
    h("div", { class: "dual-head" },
      h("button", { type: "button", class: "icon-btn", id: "dual-up", title: "Go up one folder in this pane", "aria-label": "Up one folder in the right pane", onclick: () => { const p = parentOf(right.path, state.sep); if (p) loadRight(p); } }, "↑"),
      h("nav", { id: "dual-crumbs", class: "dual-crumbs", "aria-label": "Where the right pane is" }),
      h("button", { type: "button", class: "icon-btn", id: "dual-same", title: "Show the folder from the left pane here too", "aria-label": "Show the left folder in this pane", onclick: () => leftFolder() && loadRight(leftFolder()) }, "⇄")),
    h("div", { class: "dual-listwrap" },
      h("div", { id: "dual-list", class: "view-details", role: "listbox", tabindex: "0", "aria-multiselectable": "true", "aria-label": "Files and folders in the right pane" }),
      h("div", { id: "dual-empty", class: "empty", hidden: true }, h("div", { class: "empty-icon", "aria-hidden": "true" }, "📂"), h("p", {}, "This folder is empty. Drag files here to put them in it."))),
    h("div", { class: "dual-foot" },
      h("span", { id: "dual-status", class: "dual-status" }),
      h("span", { class: "dual-actions", role: "group", "aria-label": "Copy and move between the two panes" },
        actionButton("dual-copy-right", "📋", "Copy →", `Copy what is selected on the left into this folder (${mod()}drag also copies). Same as F5 when the left side is active.`, () => transferBetween("left", "copy")),
        actionButton("dual-move-right", "✂️", "Move →", "Move what is selected on the left into this folder. Same as F6 when the left side is active.", () => transferBetween("left", "move")),
        actionButton("dual-copy-left", "📋", "← Copy", "Copy what is selected here into the folder on the left. Same as F5 when this side is active.", () => transferBetween("right", "copy")),
        actionButton("dual-move-left", "✂️", "← Move", "Move what is selected here into the folder on the left. Same as F6 when this side is active.", () => transferBetween("right", "move")),
        actionButton("dual-trash", "🗑️", "Delete", "Move what is selected here to the Recycle Bin (Delete). You can undo this.", trashRight))),
  );

  const list = byId("dual-list");
  const rowOf = (target) => (target instanceof Element ? target.closest(".row") : null);
  const entryOf = (row) => right.entries.find((x) => x.path === row?.dataset.key);
  list.addEventListener("click", (e) => {
    const row = rowOf(e.target);
    if (row) selectKey(row.dataset.key, e);
  });
  $(".dual-listwrap").addEventListener("click", (e) => {
    if (e.target === e.currentTarget || e.target === list || e.target.closest("#dual-empty")) {
      right.selection = new Set();
      syncRight();
    }
  });
  list.addEventListener("dblclick", (e) => {
    const entry = entryOf(rowOf(e.target));
    if (entry) openRight(entry);
  });
  list.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const entry = entryOf(rowOf(e.target));
    if (entry) showRowMenu(entry, { x: e.clientX, y: e.clientY });
  });
  list.addEventListener("dragstart", (e) => {
    const row = rowOf(e.target);
    if (!row) return e.preventDefault();
    if (!right.selection.has(row.dataset.key)) selectKey(row.dataset.key);
    const items = rightSelected();
    startDrag(e, items.map((x) => x.path), items.map((x) => x.name).join("\n"));
    row.classList.add("drag-source");
  });
  list.addEventListener("dragend", () => {
    endDrag();
    list.querySelectorAll(".drag-source").forEach((r) => r.classList.remove("drag-source"));
  });
  list.addEventListener("keydown", (e) => {
    const focused = entryOf([...list.children].find((r) => r.dataset.key === right.focusKey));
    if (e.key === "ArrowDown") moveFocus(1, e);
    else if (e.key === "ArrowUp") moveFocus(-1, e);
    else if (e.key === "Home") moveFocus("home", e);
    else if (e.key === "End") moveFocus("end", e);
    else if (e.key === "Enter" && focused) openRight(focused);
    else if (e.key === "Backspace" && !isModifier(e, state.platform)) { const p = parentOf(right.path, state.sep); if (p) loadRight(p); }
    else if (e.key === "Delete" || (state.platform === "darwin" && e.metaKey && e.key === "Backspace")) trashRight();
    else if (e.key === "Escape") { right.selection = new Set(); syncRight(); }
    else if ((e.key === "a" || e.key === "A") && isModifier(e, state.platform)) { right.selection = new Set(sorted().slice(0, LIMIT).map((x) => x.path)); syncRight(); }
    else if (e.key === "ContextMenu" && focused) { const r = list.getBoundingClientRect(); showRowMenu(focused, { x: r.left + 40, y: r.top + 30 }); }
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  attachDropTarget($(".dual-listwrap"), { getPath: () => right.path || null });
  list.addEventListener("focusin", () => setActive("right"));
  $("#list").addEventListener("focusin", () => setActive("left"));
  $("#main").addEventListener("pointerdown", () => setActive("left"));
  pane.addEventListener("pointerdown", () => setActive("right"));
  built = true;
}

/** Called each time the Dual view is shown: builds the pane the first time, then freshens its folder. */
export function enterDual() {
  if (!built) build();
  setActive(active);
  if (right.path) loadRight(right.path, { keep: true });
  else loadRight(state.settings.dualPath || state.home).then((ok) => ok || loadRight(state.home));
}

/** F5 and F6 copy and move to the other pane, Tab switches panes, and the right pane follows changes made elsewhere. */
export function wireDual() {
  on("view", () => state.workspace === "dual" && right.path && scheduleRefresh());
  on("selection", () => state.workspace === "dual" && built && syncRight());
  on("settings", (change) => {
    const keys = Object.keys(change ?? {});
    if (state.workspace === "dual" && built && right.path && keys.some((k) => ["showHidden", "sortBy", "sortDir", "foldersFirst"].includes(k))) loadRight(right.path, { keep: true });
  });
  document.addEventListener("keydown", (e) => {
    if (state.workspace !== "dual" || !built || e.defaultPrevented || menuIsOpen() || document.querySelector(".modal-backdrop")) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest("#terminal-panel") || t.matches("input, textarea, select")) return;
    const onList = t.id === "list" || t.id === "dual-list";
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && onList) {
      e.preventDefault();
      $(t.id === "list" ? "#dual-list" : "#list").focus();
    } else if ((e.key === "F5" || e.key === "F6") && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      transferBetween(active, e.key === "F5" ? "copy" : "move");
    }
  });
}
