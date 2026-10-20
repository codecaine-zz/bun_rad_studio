// The lists of files and folders: three views (details, list, icons), selection, inline rename, drag and drop.
// Everything here works on a pane: the left list (the page's own) or the Dual view's right one.
import { ApiError } from "./api.js";
import { showBackgroundMenu, showEntryMenu } from "./contextmenu.js";
import { attachDropTarget, drag, endDrag, startDrag } from "./dnd.js";
import { classifyFolderTopic, classifyIconKind, clear, h, iconForEntry, resolveSystemIcon } from "./dom.js";
import { wireMarquee } from "./marquee.js";
import { toast } from "./menus.js";
import { saveSettings, visibleEntries } from "./nav.js";
import { commitRename, dropOnto, openEntry } from "./ops.js";
import { inTrash, isFolderView, left, setActivePane } from "./pane.js";
import { clearSelection, selectOnly, selectRangeTo, selectedEntries, toggleKey } from "./selection.js";
import { on, state } from "./state.js";
import { openNewTab } from "./tabs.js";
import { tagForPath, tagInfo } from "./tags.js";
import { describeSelection, formatDate, formatSize, isModifier, summarizeCount } from "./util.js";

const PAGE = 500;
/** pane -> { rows: key -> row element (for quick selection updates), renaming: { key, input } or null }. */
const views = new Map();

function viewOf(pane) {
  if (!views.has(pane)) views.set(pane, { rows: new Map(), renaming: null });

  return views.get(pane);
}

const part = (pane, name) => document.getElementById(pane.ids[name]);
const list = (pane = left) => part(pane, "list");

/** The text shown when there is nothing to list. */
function emptyMessage(pane) {
  if (pane.search) return ["No matches", `Nothing here has a name containing "${pane.search.query}". Try fewer letters, or use * as a wildcard (for example *.jpg).`];
  if (inTrash(pane)) return ["The Recycle Bin is empty", "Items you delete show up here, and you can restore them."];
  if (state.tagFilter) {
    const t = tagInfo(state.tagFilter);
    return [`No ${t ? t.label.toLowerCase() : "tagged"} items here`, "No files or folders in this location have that color tag. Click the tag again in the sidebar to show all items."];
  }
  if (pane.side !== "right" && ((state.quickFilter && state.quickFilter.trim()) || (state.kindFilter && state.kindFilter !== "all"))) {
    return ["No matching items in this folder", "Nothing in this folder matches your active quick filter or category chip. Clear the filter above to show all items."];
  }
  return ["This folder is empty", "Drag files here, or use New folder / New file in the toolbar."];
}

function whereText(pane, entry) {
  if (pane.search) return entry.folder ?? "";
  if (inTrash(pane)) return entry.where ?? "";
  return "";
}

/** Computes the group heading for an entry when Group By is active. */
export function groupBucketFor(entry, mode = state.settings.groupBy) {
  if (!mode || mode === "none") return "";
  if (mode === "kind") {
    if (entry.isDir) return "Folders";
    return entry.label || "Files";
  }
  if (mode === "date") {
    const ms = Number(entry.mtimeMs) || 0;
    if (!ms) return "Unknown date";
    const diffHours = Math.max(0, (Date.now() - ms) / 3_600_000);
    if (diffHours < 24) return "Today";
    if (diffHours < 48) return "Yesterday";
    if (diffHours < 24 * 7) return "Earlier this week";
    if (diffHours < 24 * 30) return "Earlier this month";
    return "Older";
  }
  if (mode === "size") {
    if (entry.isDir) return "Folders";
    const sz = Number(entry.size) || 0;
    if (sz === 0) return "Empty (0 B)";
    if (sz < 10 * 1024) return "Tiny (< 10 KB)";
    if (sz < 1024 * 1024) return "Small (10 KB – 1 MB)";
    if (sz < 100 * 1024 * 1024) return "Medium (1 – 100 MB)";
    return "Large (> 100 MB)";
  }
  return "";
}

/** The column headings of a list: the left one is in index.html, the right one is built with this. */
export function makeListHead(id) {
  const sort = (cls, by, text, tip) => h("button", { type: "button", class: cls, dataset: { sort: by }, title: tip }, text);
  return h("div", { id, class: "list-head", hidden: true },
    h("span", { class: "h-icon" }),
    sort("h-name", "name", "Name", "Sort by name. Click again to reverse the order."),
    h("span", { class: "h-where", hidden: true }, "Folder"),
    sort("h-date", "modified", "Date modified", "Sort by when each item was last changed. Click again to reverse the order."),
    sort("h-type", "type", "Type", "Sort by kind of item. Click again to reverse the order."),
    sort("h-size", "size", "Size", "Sort by size. Click again to reverse the order."),
    h("span", { class: "h-ext", hidden: true }, "Extension"),
    h("span", { class: "h-perms", hidden: true }, "Permissions"));
}

function makeRow(pane, entry, index) {
  const cut = state.clipboard?.mode === "cut" && state.clipboard.paths.includes(entry.path);
  const trash = inTrash(pane);
  const tag = !trash ? tagForPath(entry.path) : null;
  const cols = Array.isArray(state.settings.columns) ? state.settings.columns : [];
  const extText = entry.isDir ? "—" : (entry.ext ? String(entry.ext).replace(/^\./, "").toUpperCase() : "—");
  const permsText = entry.mode || (entry.writable === false ? "r--r--r--" : entry.isDir ? "rwxr-xr-x" : "rw-r--r--");
  const iconKind = classifyIconKind(entry.name, entry.isDir);
  const folderTopic = entry.isDir ? classifyFolderTopic(entry.name) : "";
  const sysIcon = resolveSystemIcon(entry.name, entry.isDir);
  const row = h("div", {
    class: `row${entry.isDir ? " is-folder" : ""}${entry.hidden ? " hidden-item" : ""}${cut ? " cut" : ""}${entry.broken ? " broken" : ""}`,
    role: "option", id: `${pane.ids.row}-${index}`, "aria-selected": String(pane.selection.has(entry.path)),
    draggable: trash ? null : "true",
    dataset: {
      key: entry.path,
      index: String(index),
      entryName: entry.name || "",
      isDir: entry.isDir ? "1" : "0",
      iconKind,
      defaultIcon: entry.icon || "",
      ...(folderTopic ? { folderTopic, topic: folderTopic } : {}),
      ...(tag ? { tag: tag.id } : {}),
    },
    title: entry.path && !trash ? entry.path : entry.name,
  },
    h("span", {
      class: "c-icon",
      "aria-hidden": "true",
      dataset: {
        iconKind,
        isFolder: entry.isDir ? "1" : "0",
        ...(folderTopic ? { folderTopic, topic: folderTopic } : {}),
        ...(sysIcon?.id ? { systemIcon: sysIcon.id } : {}),
      },
    }, iconForEntry(entry)),
    h("span", { class: "c-name" },
      tag ? h("span", { class: `tag-dot tag-${tag.id}`, title: `Tagged ${tag.label}`, "aria-label": `Tagged ${tag.label}` }) : null,
      h("span", { class: "name-text" }, entry.name)),
    h("span", { class: "c-where" }, whereText(pane, entry)),
    h("span", { class: "c-date" }, formatDate(entry.mtimeMs)),
    h("span", { class: "c-type" }, entry.label),
    h("span", { class: "c-size" }, entry.isDir ? "" : formatSize(entry.size)),
    h("span", { class: "c-ext", hidden: !cols.includes("ext") }, extText),
    h("span", { class: "c-perms", hidden: !cols.includes("permissions") }, permsText),
  );
  viewOf(pane).rows.set(entry.path, row);
  return row;
}

export function renderList(pane = left) {
  const container = list(pane);
  if (!container) return;
  const view = viewOf(pane);
  const entries = visibleEntries(pane);
  const trash = inTrash(pane);
  const cols = Array.isArray(state.settings.columns) ? state.settings.columns : [];
  const groupBy = !trash ? (state.settings.groupBy || "none") : "none";
  view.rows.clear();
  view.renaming = null;
  container.className = `view-${state.settings.view}${pane.search ? " searching" : ""}${trash ? " in-trash" : ""}${groupBy !== "none" ? " grouped" : ""}`;
  container.dataset.cols = cols.join(",");
  container.setAttribute("aria-label", pane.side === "right" ? "Files and folders in the right pane" : trash ? "Recycle Bin" : pane.search ? "Search results" : "Files and folders");
  const limit = pane.shown || PAGE;
  pane.shown = Math.min(Math.max(limit, PAGE), entries.length);
  const frag = document.createDocumentFragment();
  const slice = entries.slice(0, pane.shown);
  let lastBucket = null;
  slice.forEach((e, i) => {
    if (groupBy !== "none") {
      const bucket = groupBucketFor(e, groupBy);
      if (bucket && bucket !== lastBucket) {
        lastBucket = bucket;
        frag.append(h("div", { class: "group-header", role: "presentation", dataset: { group: bucket } },
          h("span", { class: "group-title" }, bucket),
        ));
      }
    }
    frag.append(makeRow(pane, e, i));
  });
  if (entries.length > pane.shown) {
    frag.append(h("div", { class: "more" },
      h("span", {}, summarizeCount(entries.length, pane.shown)),
      h("button", { type: "button", class: "btn", onclick: () => { pane.shown += PAGE; renderList(pane); } }, `Show ${Math.min(PAGE, entries.length - pane.shown)} more`),
      h("button", { type: "button", class: "btn", onclick: () => { pane.shown = entries.length; renderList(pane); } }, "Show all"),
    ));
  }
  clear(container).append(frag);

  const empty = part(pane, "empty");
  const [title, text] = emptyMessage(pane);
  empty.hidden = entries.length > 0 || (pane.side === "left" && state.loading);
  empty.replaceChildren(h("div", { class: "empty-icon", "aria-hidden": "true" }, pane.search ? "🔍" : trash ? "🗑️" : "📂"), h("h2", {}, title), h("p", {}, text));
  part(pane, "head").hidden = state.settings.view !== "details" || entries.length === 0;
  updateHeaderSort(pane);
  syncSelection(pane);
}

function updateHeaderSort(pane) {
  const head = part(pane, "head");
  const cols = Array.isArray(state.settings.columns) ? state.settings.columns : [];
  head.dataset.cols = cols.join(",");
  head.querySelectorAll("[data-sort]").forEach((b) => {
    const active = b.dataset.sort === state.settings.sortBy;
    b.setAttribute("aria-sort", active ? (state.settings.sortDir === "asc" ? "ascending" : "descending") : "none");
    b.dataset.arrow = active ? (state.settings.sortDir === "asc" ? "▲" : "▼") : "";
  });
  const where = head.querySelector(".h-where");
  where.hidden = !(pane.search || inTrash(pane));
  where.textContent = inTrash(pane) ? "Was in" : "Folder";
  const extHead = head.querySelector(".h-ext");
  if (extHead) extHead.hidden = !cols.includes("ext");
  const permsHead = head.querySelector(".h-perms");
  if (permsHead) permsHead.hidden = !cols.includes("permissions");
}

let pointerSelecting = false;

/** Updates selected/focused marks without redrawing everything. */
export function syncSelection(pane = left) {
  const container = list(pane);
  if (!container) return;
  const { rows } = viewOf(pane);
  for (const [key, row] of rows) {
    const selected = pane.selection.has(key);
    const selStr = String(selected);
    if (row.classList.contains("selected") !== selected) row.classList.toggle("selected", selected);
    if (row.getAttribute("aria-selected") !== selStr) row.setAttribute("aria-selected", selStr);
    const isFocused = key === pane.focusKey;
    if (row.classList.contains("focused") !== isFocused) row.classList.toggle("focused", isFocused);
  }
  const focused = pane.focusKey ? rows.get(pane.focusKey) : null;
  if (focused) {
    if (container.getAttribute("aria-activedescendant") !== focused.id) {
      container.setAttribute("aria-activedescendant", focused.id);
    }
    if (!pointerSelecting) {
      focused.scrollIntoView?.({ block: "nearest" });
    }
  } else if (container.hasAttribute("aria-activedescendant")) {
    container.removeAttribute("aria-activedescendant");
  }
  const count = pane.selection.size;
  const countStr = String(count);
  if (pane.side === "left" && document.body.dataset.selected !== countStr) {
    document.body.dataset.selected = countStr;
  }
  const total = visibleEntries(pane).length;
  const base = inTrash(pane) ? `${total} in the Recycle Bin` : pane.search ? `${total} search result${total === 1 ? "" : "s"}${pane.search.truncated ? " (stopped early)" : ""}` : summarizeCount(pane.total, total);
  const statusText = count ? `${describeSelection(selectedEntries(pane))} · ${base}` : base;
  const statusEl = part(pane, "status");
  if (statusEl && statusEl.textContent !== statusText) statusEl.textContent = statusText;
}

// ---------------------------------------------------------------------------------------------------------------
// Inline rename
// ---------------------------------------------------------------------------------------------------------------

export function beginRename(key, pane = left) {
  const view = viewOf(pane);
  if (view.renaming?.key === key) return;
  const entries = visibleEntries(pane);
  const index = entries.findIndex((e) => e.path === key);
  if (index < 0 || inTrash(pane)) return;
  if (index >= pane.shown) {
    pane.shown = index + 1;
    renderList(pane);
  }
  const row = view.rows.get(key);
  if (!row) return;
  const entry = entries[index];
  const label = row.querySelector(".name-text");
  const input = h("input", { type: "text", class: "rename-input", value: entry.name, spellcheck: "false", autocomplete: "off", "aria-label": `New name for ${entry.name}` });
  label.replaceWith(input);
  row.draggable = false;
  row.classList.add("renaming");
  view.renaming = { key, input };
  input.focus();
  const dot = entry.isDir ? -1 : entry.name.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
  row.scrollIntoView?.({ block: "nearest" });
  let finished = false;
  const finish = async (commit) => {
    if (finished) return;
    const next = input.value.trim();
    if (!commit || next === entry.name || next === "") {
      finished = true;
      view.renaming = null;
      renderList(pane);
      list(pane).focus();
      return;
    }
    try {
      finished = true;
      await commitRename(key, next, pane);
      list(pane).focus();
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
  input.addEventListener("blur", (e) => {
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest(".menu")) return;
    setTimeout(() => !finished && view.renaming && finish(true), 80);
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("dblclick", (e) => e.stopPropagation());
}

/** True while a name is being typed in either list (or in the given one). */
export const isRenaming = (pane = null) => (pane ? viewOf(pane).renaming !== null : [...views.values()].some((v) => v.renaming !== null));

// ---------------------------------------------------------------------------------------------------------------
// Mouse
// ---------------------------------------------------------------------------------------------------------------

const rowOf = (target) => (target instanceof Element ? target.closest(".row") : null);

/** Hooks one list up to the mouse: select, open, right-click, drag and drop, and the column headings. */
export function wirePane(pane) {
  const container = list(pane);
  const wrap = part(pane, "wrap");
  const entryOf = (row) => visibleEntries(pane).find((e) => e.path === row.dataset.key);
  const mine = () => setActivePane(pane.side);
  let primarySelection = false;
  let handledByClick = false;
  let toggledOnCtrlContext = false;
  wrap.addEventListener("mousedown", (e) => {
    primarySelection = state.platform !== "darwin" && e.button === 0 && e.ctrlKey;
    handledByClick = false;
    toggledOnCtrlContext = false;
  }, true);

  container.addEventListener("click", (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    const key = row.dataset.key;
    mine();
    container.focus?.({ preventScroll: true });
    handledByClick = true;
    if (toggledOnCtrlContext) {
      toggledOnCtrlContext = false;
      return;
    }
    pointerSelecting = true;
    try {
      if (isModifier(e, state.platform)) toggleKey(key, pane);
      else if (e.shiftKey) selectRangeTo(key, pane);
      else selectOnly(key, pane);
    } finally {
      pointerSelecting = false;
    }
  });

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target === container || e.target.closest(`#${pane.ids.empty}`)) {
      mine();
      clearSelection(pane);
    }
  });

  container.addEventListener("dblclick", (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    const entry = entryOf(row);
    mine();
    if (entry) openEntry(entry);
  });

  wrap.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    // On Windows and Linux, Ctrl+left-click is the standard multi-select gesture.
    // Native GTK/WebKitGTK, WebView2, and macOS hypervisors (Parallels/UTM/VMware) often translate
    // Ctrl+left-click into a contextmenu event (with e.button === 0 or e.button === 2).
    // Therefore on non-macOS platforms, whenever Ctrl is held (or a Ctrl+left mousedown initiated the gesture),
    // treat it as multi-selection and never open the right-click context menu.
    if (state.platform !== "darwin" && (e.ctrlKey || primarySelection)) {
      primarySelection = false;
      const row = rowOf(e.target);
      if (row && !handledByClick && !toggledOnCtrlContext) {
        mine();
        container.focus?.({ preventScroll: true });
        toggleKey(row.dataset.key, pane);
        toggledOnCtrlContext = true;
      }
      return;
    }
    primarySelection = false;
    const row = rowOf(e.target);
    mine();
    if (row) {
      if (!pane.selection.has(row.dataset.key)) selectOnly(row.dataset.key, pane);
      showEntryMenu(selectedEntries(pane), { x: e.clientX, y: e.clientY });
    } else {
      showBackgroundMenu({ x: e.clientX, y: e.clientY });
    }
  });

  // Drag and drop
  container.addEventListener("dragstart", (e) => {
    const row = rowOf(e.target);
    if (!row || isRenaming(pane)) return e.preventDefault();
    if (!pane.selection.has(row.dataset.key)) selectOnly(row.dataset.key, pane);
    const items = selectedEntries(pane);
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
  attachDropTarget(wrap, { getPath: () => (isFolderView(pane) ? pane.location.path : null) });

  // Sorting by clicking the column headings (one setting, so both lists follow it)
  part(pane, "head").querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    const by = b.dataset.sort;
    const dir = state.settings.sortBy === by && state.settings.sortDir === "asc" ? "desc" : "asc";
    saveSettings({ sortBy: by, sortDir: dir });
  }));
}

export function wireList() {
  wirePane(left);
  wirePaneExtras(left);
  on("view", () => {
    state.shown = 0;
    renderList();
  });
  on("settings", (c) => {
    if (c && ("columns" in c || "groupBy" in c || "tags" in c)) renderList(left);
  });
  on("selection", () => syncSelection(left));
  on("clipboard", () => renderList(left));
  on("rename-request", ({ key, pane }) => setTimeout(() => beginRename(key, pane), 0));
}

export function wirePaneExtras(pane) {
  wireMarquee(pane);
  const container = list(pane);
  if (!container) return;
  container.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const row = rowOf(e.target);
    if (!row) return;
    const entry = visibleEntries(pane).find((x) => x.path === row.dataset.key);
    if (entry?.isDir && entry.path && !inTrash(pane)) {
      e.preventDefault();
      openNewTab(entry.path);
    }
  });
}

/** Entries per visual line in the icons view, so Up/Down can move by a whole line. */
export function iconsPerLine(pane = left) {
  if (state.settings.view !== "icons") return 1;
  const rows = [...viewOf(pane).rows.values()];
  const first = rows[0];
  if (!first) return 1;
  let n = 0;
  for (const row of rows) {
    if (row.offsetTop !== first.offsetTop) break;
    n++;
  }
  return Math.max(1, n);
}
