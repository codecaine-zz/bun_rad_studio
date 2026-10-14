// The Explorer: a tree of the workspace folder. Folders load when opened. Files open in the editor; the right-click
// menu creates, renames and deletes (to the Recycle Bin) using the File Manager's own operations.
import { call, ApiError } from "./api.js";
import { h } from "./dom.js";
import { confirmBox, promptBox } from "./dialogs.js";
import { showMenu, toast } from "./menus.js";
import { baseName, joinPath, parentOf, sortEntries } from "./util.js";
import { state } from "./state.js";

const MAX_DEPTH_CLASS = 24;

export function createExplorer({ onOpen, onRenamed, onDeleted, onRootChanged }) {
  let root = "";
  let showHidden = false;
  let activePath = "";
  const expanded = new Set();
  const cache = new Map();
  const failed = new Map();
  const sep = () => state.sep;

  const tree = h("div", { class: "code-tree", role: "tree", "aria-label": "Files in the workspace folder" });
  const rootLabel = h("div", { class: "code-ex-root", title: "The folder shown here" });
  const hiddenBox = h("input", { type: "checkbox", id: "code-ex-hidden", onchange: () => { showHidden = hiddenBox.checked; cache.clear(); expanded.clear(); loadRoot(); } });
  const iconButton = (label, tip, run) => h("button", { type: "button", class: "code-btn code-icon-btn", title: tip, "aria-label": tip, onclick: run }, label);
  const el = h("div", { class: "code-explorer" },
    h("div", { class: "code-ex-head" },
      iconButton("⟳", "Look at the folder again", () => refresh()),
      iconButton("📂", "Use the folder the File Manager is showing", () => setRoot(state.location.kind === "folder" && state.location.path ? state.location.path : state.home)),
      iconButton("⬆", "Go up one folder", () => { const up = parentOf(root, sep()); if (up && up !== root) setRoot(up); }),
      iconButton("📄", "New file in this folder", () => newItem(root, false)),
      iconButton("📁", "New folder in this folder", () => newItem(root, true)),
    ),
    rootLabel,
    h("label", { class: "code-ex-opt", for: "code-ex-hidden", title: "Also list files whose names start with a dot" }, hiddenBox, " Show hidden files"),
    tree,
  );

  async function load(path) {
    try {
      const r = await call("list", { path, showHidden });
      cache.set(path, sortEntries(r.entries, { by: "name", dir: "asc", foldersFirst: true }));
      failed.delete(path);
    } catch (err) {
      failed.set(path, err instanceof ApiError ? err.message : "This folder couldn't be opened.");
      cache.set(path, []);
    }
  }

  async function loadRoot() {
    if (!root) return;
    await load(root);
    draw();
  }

  function row(entry, depth) {
    const open = entry.isDir && expanded.has(entry.path);
    const b = h("button", {
      type: "button", role: "treeitem", class: `code-tn code-d${Math.min(depth, MAX_DEPTH_CLASS)}${entry.path === activePath ? " code-tn-active" : ""}`, tabindex: "-1",
      "aria-level": String(depth + 1), "aria-expanded": entry.isDir ? String(open) : null, "aria-current": entry.path === activePath ? "true" : null,
      title: entry.isDir ? `${entry.name} — folder` : `${entry.name} — click to open`,
      dataset: { path: entry.path },
      onclick: () => activate(entry),
      oncontextmenu: (e) => { e.preventDefault(); menuFor(entry, { x: e.clientX, y: e.clientY }); },
    }, h("span", { class: "code-tn-chev", "aria-hidden": "true" }, entry.isDir ? (open ? "▾" : "▸") : ""), h("span", { class: "code-tn-icon", "aria-hidden": "true" }, entry.isDir ? (open ? "📂" : "📁") : entry.icon ?? "📄"), h("span", { class: "code-tn-name" }, entry.name));
    b.entry = entry;
    return b;
  }

  function draw() {
    rootLabel.textContent = root || "No folder";
    rootLabel.title = root;
    const rows = [];
    const walk = (path, depth) => {
      if (failed.has(path)) rows.push(h("div", { class: `code-tn-msg code-d${Math.min(depth, MAX_DEPTH_CLASS)}`, role: "treeitem" }, failed.get(path)));
      else if (cache.has(path) && !cache.get(path).length && depth > 0) rows.push(h("div", { class: `code-tn-msg code-d${Math.min(depth, MAX_DEPTH_CLASS)}`, role: "treeitem" }, "Empty folder"));
      for (const entry of cache.get(path) ?? []) {
        rows.push(row(entry, depth));
        if (entry.isDir && expanded.has(entry.path)) walk(entry.path, depth + 1);
      }
    };
    walk(root, 0);
    if (!rows.length && cache.has(root)) rows.push(h("p", { class: "code-hint" }, "This folder is empty."));
    const keep = document.activeElement?.dataset?.path;
    tree.replaceChildren(...rows);
    const first = tree.querySelector("[role=treeitem]");
    const target = (keep && tree.querySelector(`[data-path="${CSS.escape(keep)}"]`)) || tree.querySelector(".code-tn-active") || first;
    target?.setAttribute("tabindex", "0");
    if (keep && target?.dataset?.path === keep) target.focus();
  }

  async function activate(entry) {
    if (!entry.isDir) return onOpen(entry.path);
    if (expanded.has(entry.path)) expanded.delete(entry.path);
    else {
      expanded.add(entry.path);
      if (!cache.has(entry.path)) {
        draw();
        await load(entry.path);
      }
    }
    draw();
  }

  async function refresh(path) {
    const dirs = path ? [path] : [root, ...expanded];
    await Promise.all(dirs.map((d) => load(d)));
    draw();
  }

  async function newItem(parent, folder) {
    const made = await promptBox({
      title: folder ? "New folder" : "New file",
      label: folder ? "Folder name" : "File name (with its ending, like notes.md)",
      confirmLabel: "Create",
      submit: (name) => call(folder ? "mkdir" : "newfile", { parent, name }),
    });
    if (!made) return;
    expanded.add(parent);
    await refresh(parent);
    if (!folder) onOpen(made.path);
  }

  async function renameEntry(entry) {
    const r = await promptBox({ title: "Rename", label: "New name", value: entry.name, confirmLabel: "Rename", selectBase: !entry.isDir, submit: (name) => call("rename", { path: entry.path, name }) });
    if (!r) return;
    await refresh(parentOf(entry.path, sep()));
    onRenamed(r.from, r.to, entry.isDir);
  }

  async function deleteEntry(entry) {
    const ok = await confirmBox({ title: "Move to the Recycle Bin?", message: `"${entry.name}" will go to the Recycle Bin. You can get it back from there.`, confirmLabel: "Move to Recycle Bin", danger: true });
    if (!ok) return;
    try {
      const r = (await call("trash", { paths: [entry.path] })).results[0];
      if (!r?.ok) throw new ApiError(r?.message ?? "That couldn't be deleted.", r?.code ?? "UNKNOWN", 400);
      onDeleted(entry.path, entry.isDir);
      await refresh(parentOf(entry.path, sep()));
    } catch (err) {
      toast(err.message ?? "That couldn't be deleted.", { kind: "error" });
    }
  }

  function menuFor(entry, where) {
    const parent = entry.isDir ? entry.path : parentOf(entry.path, sep());
    showMenu([
      entry.isDir ? { label: expanded.has(entry.path) ? "Close folder" : "Open folder", action: () => activate(entry) } : { label: "Open", action: () => onOpen(entry.path) },
      { separator: true },
      { label: "New file here…", action: () => newItem(parent, false) },
      { label: "New folder here…", action: () => newItem(parent, true) },
      { separator: true },
      { label: "Rename…", shortcut: "F2", action: () => renameEntry(entry) },
      { label: "Move to Recycle Bin…", shortcut: "Delete", danger: true, action: () => deleteEntry(entry) },
      { separator: true },
      { label: "Copy path", action: async () => { try { await call("copytext", { text: entry.path }); toast("Path copied.", { kind: "success" }); } catch (err) { toast(err.message, { kind: "error" }); } } },
      { label: "Show in your system's file manager", action: () => call("reveal", { path: entry.path }).catch((err) => toast(err.message, { kind: "error" })) },
      { label: "Refresh", action: () => refresh(entry.isDir ? entry.path : parent) },
    ], { ...where, label: `Actions for ${entry.name}` });
  }

  tree.addEventListener("keydown", (e) => {
    const items = [...tree.querySelectorAll("[role=treeitem][data-path]")];
    const at = items.indexOf(document.activeElement);
    const entry = items[at]?.entry;
    const go = (i) => { const t = items[Math.max(0, Math.min(items.length - 1, i))]; if (t) { items.forEach((x) => x.setAttribute("tabindex", "-1")); t.setAttribute("tabindex", "0"); t.focus(); } };
    if (e.key === "ArrowDown") { e.preventDefault(); go(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
    else if (e.key === "ArrowRight" && entry?.isDir) { e.preventDefault(); if (!expanded.has(entry.path)) activate(entry); else go(at + 1); }
    else if (e.key === "ArrowLeft" && entry) {
      e.preventDefault();
      if (entry.isDir && expanded.has(entry.path)) activate(entry);
      else go(items.findIndex((x) => x.entry.path === parentOf(entry.path, sep())));
    } else if (e.key === "F2" && entry) { e.preventDefault(); renameEntry(entry); }
    else if (e.key === "Delete" && entry) { e.preventDefault(); deleteEntry(entry); }
    else if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && entry) { e.preventDefault(); const r = items[at].getBoundingClientRect(); menuFor(entry, { x: r.left + 20, y: r.bottom }); }
  });
  tree.addEventListener("contextmenu", (e) => {
    if (e.target === tree && root) {
      e.preventDefault();
      showMenu([{ label: "New file…", action: () => newItem(root, false) }, { label: "New folder…", action: () => newItem(root, true) }, { label: "Refresh", action: () => refresh() }], { x: e.clientX, y: e.clientY, label: "Folder actions" });
    }
  });

  async function setRoot(path, quiet = false) {
    if (!path) return;
    root = path;
    expanded.clear();
    cache.clear();
    failed.clear();
    if (!quiet) onRootChanged?.(path);
    await loadRoot();
  }

  return {
    el,
    get root() { return root; },
    setRoot,
    refresh,
    setShowHidden(on) { showHidden = on; hiddenBox.checked = on; },
    setActive(path) { activePath = path; if (cache.size) draw(); },
    /** Opens the folders above `path` so the file is visible in the tree. */
    async reveal(path) {
      if (!root || !path.startsWith(root + sep())) return;
      const parts = path.slice(root.length + 1).split(sep()).slice(0, -1);
      let at = root;
      for (const part of parts) {
        at = joinPath(at, part, sep());
        expanded.add(at);
        if (!cache.has(at)) await load(at);
      }
      activePath = path;
      draw();
      [...tree.querySelectorAll("[data-path]")].find((n) => n.dataset.path === path)?.scrollIntoView?.({ block: "nearest" });
    },
    nameOf: (path) => baseName(path, sep()),
  };
}
