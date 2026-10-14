// The list of files and folders: three views (details, list, icons), selection, inline rename, drag and drop.
import { ApiError } from "./api.js";
import { showBackgroundMenu, showEntryMenu } from "./contextmenu.js";
import { attachDropTarget, drag, endDrag, startDrag } from "./dnd.js";
import { $, clear, h, iconFor } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings, visibleEntries } from "./nav.js";
import { commitRename, dropOnto, openEntry } from "./ops.js";
import { clearSelection, selectOnly, selectRangeTo, selectedEntries, toggleKey } from "./selection.js";
import { inTrash, on, state } from "./state.js";
import { describeSelection, formatDate, formatSize, isModifier, summarizeCount } from "./util.js";

const PAGE = 500;
/** key -> row element, for quick selection updates. */
const rows = new Map();
let renaming = null;

const list = () => $("#list");

/** The text shown when there is nothing to list. */
function emptyMessage() {
  if (state.search) return ["No matches", `Nothing here has a name containing "${state.search.query}". Try fewer letters, or use * as a wildcard (for example *.jpg).`];
  if (inTrash()) return ["The Recycle Bin is empty", "Items you delete show up here, and you can restore them."];
  return ["This folder is empty", "Drag files here, or use New folder / New file in the toolbar."];
}

function whereText(entry) {
  if (state.search) return entry.folder ?? "";
  if (inTrash()) return entry.where ?? "";
  return "";
}

function makeRow(entry, index) {
  const cut = state.clipboard?.mode === "cut" && state.clipboard.paths.includes(entry.path);
  const row = h("div", {
    class: `row${entry.isDir ? " is-folder" : ""}${entry.hidden ? " hidden-item" : ""}${cut ? " cut" : ""}${entry.broken ? " broken" : ""}`,
    role: "option", id: `row-${index}`, "aria-selected": String(state.selection.has(entry.path)),
    draggable: inTrash() ? null : "true", dataset: { key: entry.path, index: String(index) }, title: entry.path && !inTrash() ? entry.path : entry.name,
  },
    h("span", { class: "c-icon", "aria-hidden": "true" }, entry.icon || iconFor(entry.name, entry.isDir)),
    h("span", { class: "c-name" }, h("span", { class: "name-text" }, entry.name)),
    h("span", { class: "c-where" }, whereText(entry)),
    h("span", { class: "c-date" }, formatDate(entry.mtimeMs)),
    h("span", { class: "c-type" }, entry.label),
    h("span", { class: "c-size" }, entry.isDir ? "" : formatSize(entry.size)),
  );
  rows.set(entry.path, row);
  return row;
}

export function renderList() {
  const container = list();
  const entries = visibleEntries();
  rows.clear();
  renaming = null;
  container.className = `view-${state.settings.view}${state.search ? " searching" : ""}${inTrash() ? " in-trash" : ""}`;
  container.setAttribute("aria-label", inTrash() ? "Recycle Bin" : state.search ? "Search results" : "Files and folders");
  const limit = state.shown || PAGE;
  state.shown = Math.min(Math.max(limit, PAGE), entries.length);
  const frag = document.createDocumentFragment();
  entries.slice(0, state.shown).forEach((e, i) => frag.append(makeRow(e, i)));
  if (entries.length > state.shown) {
    frag.append(h("div", { class: "more" },
      h("span", {}, summarizeCount(entries.length, state.shown)),
      h("button", { type: "button", class: "btn", onclick: () => { state.shown += PAGE; renderList(); } }, `Show ${Math.min(PAGE, entries.length - state.shown)} more`),
      h("button", { type: "button", class: "btn", onclick: () => { state.shown = entries.length; renderList(); } }, "Show all"),
    ));
  }
  clear(container).append(frag);

  const empty = $("#empty");
  const [title, text] = emptyMessage();
  empty.hidden = entries.length > 0 || state.loading;
  empty.replaceChildren(h("div", { class: "empty-icon", "aria-hidden": "true" }, state.search ? "🔍" : inTrash() ? "🗑️" : "📂"), h("h2", {}, title), h("p", {}, text));
  $("#list-head").hidden = state.settings.view !== "details" || entries.length === 0;
  updateHeaderSort();
  syncSelection();
}

function updateHeaderSort() {
  document.querySelectorAll("#list-head [data-sort]").forEach((b) => {
    const active = b.dataset.sort === state.settings.sortBy;
    b.setAttribute("aria-sort", active ? (state.settings.sortDir === "asc" ? "ascending" : "descending") : "none");
    b.dataset.arrow = active ? (state.settings.sortDir === "asc" ? "▲" : "▼") : "";
  });
  const where = $("#list-head .h-where");
  where.hidden = !(state.search || inTrash());
  where.textContent = inTrash() ? "Was in" : "Folder";
}

/** Updates selected/focused marks without redrawing everything. */
export function syncSelection() {
  const container = list();
  for (const [key, row] of rows) {
    const selected = state.selection.has(key);
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", String(selected));
    row.classList.toggle("focused", key === state.focusKey);
  }
  const focused = state.focusKey ? rows.get(state.focusKey) : null;
  if (focused) {
    container.setAttribute("aria-activedescendant", focused.id);
    focused.scrollIntoView({ block: "nearest" });
  } else container.removeAttribute("aria-activedescendant");
  const count = state.selection.size;
  document.body.dataset.selected = String(count);
  const status = $("#status-left");
  const total = visibleEntries().length;
  const base = inTrash() ? `${total} in the Recycle Bin` : state.search ? `${total} search result${total === 1 ? "" : "s"}${state.search.truncated ? " (stopped early)" : ""}` : summarizeCount(state.total, total);
  status.textContent = count ? `${describeSelection(selectedEntries())} · ${base}` : base;
}

// ---------------------------------------------------------------------------------------------------------------
// Inline rename
// ---------------------------------------------------------------------------------------------------------------

export function beginRename(key) {
  const entries = visibleEntries();
  const index = entries.findIndex((e) => e.path === key);
  if (index < 0 || inTrash()) return;
  if (index >= state.shown) {
    state.shown = index + 1;
    renderList();
  }
  const row = rows.get(key);
  if (!row) return;
  const entry = entries[index];
  const label = row.querySelector(".name-text");
  const input = h("input", { type: "text", class: "rename-input", value: entry.name, spellcheck: "false", autocomplete: "off", "aria-label": `New name for ${entry.name}` });
  label.replaceWith(input);
  row.draggable = false;
  row.classList.add("renaming");
  renaming = { key, input };
  input.focus();
  const dot = entry.isDir ? -1 : entry.name.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
  row.scrollIntoView({ block: "nearest" });
  let finished = false;
  const finish = async (commit) => {
    if (finished) return;
    const next = input.value.trim();
    if (!commit || next === entry.name || next === "") {
      finished = true;
      renaming = null;
      renderList();
      list().focus();
      return;
    }
    try {
      finished = true;
      await commitRename(key, next);
      list().focus();
    } catch (err) {
      finished = false;
      toast(err instanceof ApiError ? err.message : "That name can't be used.", { kind: "error" });
      input.focus();
    }
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => setTimeout(() => !finished && renaming && finish(true), 80));
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("dblclick", (e) => e.stopPropagation());
}

export const isRenaming = () => renaming !== null;

// ---------------------------------------------------------------------------------------------------------------
// Mouse
// ---------------------------------------------------------------------------------------------------------------

const rowOf = (target) => (target instanceof Element ? target.closest(".row") : null);
const entryOf = (row) => visibleEntries().find((e) => e.path === row.dataset.key);

export function wireList() {
  const container = list();
  const wrap = $("#list-wrap");

  container.addEventListener("click", (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    const key = row.dataset.key;
    if (isModifier(e, state.platform)) toggleKey(key);
    else if (e.shiftKey) selectRangeTo(key);
    else selectOnly(key);
  });

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target === container || e.target.closest("#empty")) clearSelection();
  });

  container.addEventListener("dblclick", (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    const entry = entryOf(row);
    if (entry) openEntry(entry);
  });

  wrap.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const row = rowOf(e.target);
    if (row) {
      if (!state.selection.has(row.dataset.key)) selectOnly(row.dataset.key);
      showEntryMenu(selectedEntries(), { x: e.clientX, y: e.clientY });
    } else {
      showBackgroundMenu({ x: e.clientX, y: e.clientY });
    }
  });

  // Drag and drop
  container.addEventListener("dragstart", (e) => {
    const row = rowOf(e.target);
    if (!row || renaming) return e.preventDefault();
    if (!state.selection.has(row.dataset.key)) selectOnly(row.dataset.key);
    const items = selectedEntries();
    startDrag(e, items.map((x) => x.path), items.map((x) => x.name).join("\n"));
    row.classList.add("drag-source");
  });
  container.addEventListener("dragend", () => {
    endDrag();
    container.querySelectorAll(".drag-source").forEach((r) => r.classList.remove("drag-source"));
  });
  container.addEventListener("dragover", (e) => {
    const row = rowOf(e.target);
    container.querySelectorAll(".drop-target").forEach((r) => r !== row && r.classList.remove("drop-target"));
    if (!row || !row.classList.contains("is-folder") || !drag.paths.length) return;
    if (drag.paths.includes(row.dataset.key)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = (state.platform === "darwin" ? e.altKey : e.ctrlKey) ? "copy" : "move";
    row.classList.add("drop-target");
  });
  container.addEventListener("dragleave", (e) => {
    if (!container.contains(e.relatedTarget)) container.querySelectorAll(".drop-target").forEach((r) => r.classList.remove("drop-target"));
  });
  container.addEventListener("drop", async (e) => {
    const row = rowOf(e.target);
    container.querySelectorAll(".drop-target").forEach((r) => r.classList.remove("drop-target"));
    if (!row || !row.classList.contains("is-folder") || !drag.paths.length) return;
    e.preventDefault();
    const paths = drag.paths.filter((p) => p !== row.dataset.key);
    const copy = state.platform === "darwin" ? e.altKey : e.ctrlKey;
    endDrag();
    await dropOnto(row.dataset.key, paths, copy);
  });
  attachDropTarget(wrap, { getPath: () => (state.location.kind === "folder" && !state.search ? state.location.path : null) });

  // Sorting by clicking the column headings
  document.querySelectorAll("#list-head [data-sort]").forEach((b) => b.addEventListener("click", () => {
    const by = b.dataset.sort;
    const dir = state.settings.sortBy === by && state.settings.sortDir === "asc" ? "desc" : "asc";
    saveSettings({ sortBy: by, sortDir: dir });
  }));

  on("view", () => {
    state.shown = 0;
    renderList();
  });
  on("selection", syncSelection);
  on("clipboard", renderList);
  on("rename-request", (key) => setTimeout(() => beginRename(key), 0));
}

/** Entries per visual line in the icons view, so Up/Down can move by a whole line. */
export function iconsPerLine() {
  if (state.settings.view !== "icons") return 1;
  const first = [...rows.values()][0];
  if (!first) return 1;
  let n = 0;
  for (const row of rows.values()) {
    if (row.offsetTop !== first.offsetTop) break;
    n++;
  }
  return Math.max(1, n);
}
