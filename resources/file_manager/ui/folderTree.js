// Expandable folder tree in the sidebar: lazy-loads subfolders on demand and lets you navigate or drop files into any branch.
import { call } from "./api.js";
import { attachDropTarget } from "./dnd.js";
import { h } from "./dom.js";
import { showMenu } from "./menus.js";
import { goTo, saveSettings } from "./nav.js";
import { emit, state, currentPath } from "./state.js";
import { openNewTab } from "./tabs.js";
import { baseName } from "./util.js";

/** path -> Array<{ name, path }> */
const childrenCache = new Map();
/** Set of expanded folder paths in the tree */
const expandedPaths = new Set();
const loadingPaths = new Set();

function norm(p) {
  if (!p) return "";
  return state.sep === "\\" ? p.toLowerCase() : p;
}

function samePath(a, b) {
  return Boolean(a && b && norm(a) === norm(b));
}

export async function loadTreeChildren(folderPath) {
  if (!folderPath) return [];
  if (loadingPaths.has(folderPath)) return childrenCache.get(folderPath) ?? [];
  loadingPaths.add(folderPath);
  try {
    const r = await call("list", {
      path: folderPath,
      sortBy: "name",
      sortDir: "asc",
      foldersFirst: true,
      showHidden: Boolean(state.settings.showHidden),
    });
    const dirs = (r.entries ?? [])
      .filter((e) => e.isDir || e.kind === "dir")
      .map((e) => ({ name: e.name, path: e.path }));
    childrenCache.set(folderPath, dirs);
    return dirs;
  } catch {
    childrenCache.set(folderPath, []);
    return [];
  } finally {
    loadingPaths.delete(folderPath);
  }
}

export async function toggleTreeNode(folderPath) {
  if (!folderPath) return;
  if (expandedPaths.has(folderPath)) {
    expandedPaths.delete(folderPath);
    emit("places");
    return;
  }
  expandedPaths.add(folderPath);
  await loadTreeChildren(folderPath);
  emit("places");
}

export async function toggleFolderTreeSection() {
  const next = !state.settings.treeExpanded;
  if (next) {
    const root = state.home || currentPath();
    if (root) {
      expandedPaths.add(root);
      await loadTreeChildren(root);
    }
  }
  await saveSettings({ treeExpanded: next });
  emit("places");
}

function renderBranch(folderPath, label, depth, activePath) {
  const isOpen = expandedPaths.has(folderPath);
  const isActive = samePath(folderPath, activePath);
  const row = h("div", {
    class: `tree-row${isActive ? " active" : ""}`,
    dataset: { treePath: folderPath, depth: String(depth) },
  });
  row.style.paddingLeft = `${Math.min(depth, 8) * 12 + 4}px`;

  const twist = h("button", {
    type: "button",
    class: "tree-twist",
    "aria-expanded": String(isOpen),
    title: isOpen ? `Collapse subfolders of ${label}` : `Expand subfolders of ${label}`,
    "aria-label": isOpen ? `Collapse ${label}` : `Expand ${label}`,
    onclick: (e) => {
      e.stopPropagation();
      toggleTreeNode(folderPath);
    },
  }, isOpen ? "▾" : "▸");

  const btn = h("button", {
    type: "button",
    class: `tree-item${isActive ? " active" : ""}`,
    title: folderPath,
    "aria-label": `Open folder ${label}`,
    "aria-current": isActive ? "page" : null,
    onclick: () => goTo(folderPath),
  },
    h("span", { class: "si", "aria-hidden": "true" }, isOpen ? "📂" : "📁"),
    h("span", { class: "sl" }, label),
  );

  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMenu([
      { label: "Open", icon: "📂", tip: "Show this folder in the current tab", action: () => goTo(folderPath) },
      { label: "Open in new tab", icon: "🗂️", tip: "Open this folder in a new folder tab at the top of the file list", action: () => openNewTab(folderPath) },
    ], { x: e.clientX, y: e.clientY, label: label });
  });
  attachDropTarget(btn, { getPath: () => folderPath, trash: false });

  row.append(twist, btn);
  const nodes = [row];

  if (isOpen) {
    const kids = childrenCache.get(folderPath);
    if (!kids) {
      if (!loadingPaths.has(folderPath)) {
        loadTreeChildren(folderPath).then(() => emit("places"));
      }
    } else if (kids.length === 0) {
      const emptyRow = h("div", { class: "tree-empty" }, "No subfolders");
      emptyRow.style.paddingLeft = `${Math.min(depth + 1, 8) * 12 + 24}px`;
      nodes.push(emptyRow);
    } else {
      for (const child of kids) {
        nodes.push(...renderBranch(child.path, child.name || baseName(child.path, state.sep) || child.path, depth + 1, activePath));
      }
    }
  }
  return nodes;
}

export function folderTreeSection() {
  const expanded = Boolean(state.settings.treeExpanded);
  const head = h("div", { class: "side-head" },
    h("h2", { class: "side-title" }, "Folder tree"),
    h("button", {
      type: "button",
      class: "side-mini",
      dataset: { treeToggle: "" },
      "aria-expanded": String(expanded),
      title: expanded ? "Hide the expandable folder tree" : "Show the expandable folder tree to browse subfolders directly",
      "aria-label": expanded ? "Hide folder tree" : "Show folder tree",
      onclick: toggleFolderTreeSection,
    }, expanded ? "▾" : "▸"),
  );

  if (!expanded) {
    return h("section", { class: "side-section", dataset: { folderTreeSection: "" } },
      head,
      h("p", { class: "side-hint" }, "Press ▸ to browse subfolders in a tree."),
    );
  }

  const activePath = currentPath();
  const roots = [];
  if (state.home) roots.push({ path: state.home, name: baseName(state.home, state.sep) || "Home" });
  if (activePath && !roots.some((r) => activePath.startsWith(r.path))) {
    roots.push({ path: activePath, name: baseName(activePath, state.sep) || activePath });
  }
  for (const r of roots) {
    if (!expandedPaths.has(r.path) && !childrenCache.has(r.path) && !loadingPaths.has(r.path)) {
      expandedPaths.add(r.path);
      loadTreeChildren(r.path).then(() => emit("places"));
    }
  }

  const treeNodes = [];
  for (const r of roots) {
    treeNodes.push(...renderBranch(r.path, r.name, 0, activePath));
  }

  return h("section", { class: "side-section", dataset: { folderTreeSection: "" } },
    head,
    h("div", { class: "folder-tree", role: "tree", "aria-label": "Folder tree" }, ...treeNodes),
  );
}
