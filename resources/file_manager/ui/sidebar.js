// The sidebar: Favorites, Places, Folder tree, Drives (with free space), Tags, Recent items and the Recycle Bin.
import { showMenu } from "./menus.js";
import { attachDropTarget } from "./dnd.js";
import { favoriteMenuItems, favoriteName, favoritesSection } from "./favorites.js";
import { folderTreeSection } from "./folderTree.js";
import { recentSection } from "./recents.js";
import { tagsSection } from "./tags.js";
import { $, clear, h } from "./dom.js";
import { goTo, showTrash } from "./nav.js";
import * as ops from "./ops.js";
import { emit, inTrash, on, state } from "./state.js";
import { driveFor, formatSize, plural } from "./util.js";

function sideItem({ icon, label, title, active, onClick, onMenu, dropPath, trash = false, extra = null, badge = null, ariaLabel = null }) {
  const btn = h("button", { type: "button", class: `side-item${active ? " active" : ""}`, title, "aria-label": ariaLabel, "aria-current": active ? "page" : null, onclick: onClick },
    h("span", { class: "si", "aria-hidden": "true" }, icon),
    h("span", { class: "sl" }, label, badge !== null ? h("span", { class: "badge" }, String(badge)) : null),
    extra);
  if (onMenu) btn.addEventListener("contextmenu", (e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); });
  if (dropPath || trash) attachDropTarget(btn, { getPath: () => dropPath ?? null, trash });
  return btn;
}

function section(title, items) {
  if (!items.length) return null;
  return h("section", { class: "side-section" }, title ? h("h2", { class: "side-title" }, title) : null, ...items);
}

function driveSpace(d) {
  if (!d.totalBytes) return null;
  const used = Math.max(0, Math.min(1, 1 - d.freeBytes / d.totalBytes));
  const fill = h("div", { class: `bar-fill${used > 0.9 ? " low" : ""}` });
  fill.style.width = `${Math.round(used * 100)}%`;
  return h("span", { class: "space" }, h("span", { class: "bar", role: "img", "aria-label": `${formatSize(d.freeBytes)} free of ${formatSize(d.totalBytes)}` }, fill), h("span", { class: "space-text" }, `${formatSize(d.freeBytes)} free`));
}

export function renderSidebar() {
  const nav = clear($("#sidebar"));
  const here = state.location.kind === "folder" ? state.location.path : null;
  const same = (p) => here !== null && (state.sep === "\\" ? p.toLowerCase() === here.toLowerCase() : p === here);
  const favorites = state.settings.favorites.map((path) => sideItem({
    icon: "⭐", label: favoriteName(path), title: path, active: same(path), dropPath: path, onClick: () => goTo(path),
    onMenu: (pt) => showMenu(favoriteMenuItems(path), { ...pt, label: "Favorite" }),
  }));
  const places = state.places.map((p) => sideItem({ icon: p.icon, label: p.name, title: p.path, active: same(p.path), dropPath: p.path, onClick: () => goTo(p.path) }));
  if (state.cliUtilsDir) {
    places.push(sideItem({
      icon: "🛠️",
      label: "CLI Utilities",
      title: `${state.cliUtilsDir} — Built-in RAD Studio CLI utilities (open terminal here and run ./<tool-name>)`,
      active: same(state.cliUtilsDir),
      onClick: () => {
        goTo(state.cliUtilsDir);
        if (state.terminalOpen) emit("terminal-here", state.cliUtilsDir);
      },
      onMenu: (pt) => showMenu([
        { label: "Open CLI Utilities folder", icon: "📁", action: () => goTo(state.cliUtilsDir) },
        { label: "Open terminal in CLI Utilities (./)", icon: "⌨️", action: () => { goTo(state.cliUtilsDir); emit("terminal-here", state.cliUtilsDir); } },
        { label: "Browse CLI Utilities catalog…", icon: "🛠️", action: () => emit("open-cliutils-tool") },
      ], { ...pt, label: "CLI Utilities" }),
    }));
  }
  const activeDrive = here ? driveFor(here, state.drives, state.sep) : null;
  const placeMatch = here !== null && [...state.places, ...(state.cliUtilsDir ? [{ path: state.cliUtilsDir }] : []), ...state.settings.favorites.map((path) => ({ path }))].some((p) => same(p.path));
  const drives = state.drives.map((d) => sideItem({
    icon: d.icon, label: d.name, title: d.path, active: same(d.path) || (!placeMatch && activeDrive?.path === d.path && !inTrash()), dropPath: d.path, onClick: () => goTo(d.path), extra: driveSpace(d),
  }));
  const bin = sideItem({
    icon: "🗑️", label: "Recycle Bin", title: state.trashCount ? `${plural(state.trashCount, "deleted item")}` : "Empty", active: inTrash(), trash: true, badge: state.trashCount || null,
    ariaLabel: state.trashCount ? `Recycle Bin, ${plural(state.trashCount, "item")}` : "Recycle Bin, empty", onClick: () => showTrash(),
    onMenu: (pt) => showMenu([{ label: "Open Recycle Bin", action: () => showTrash() }, { label: "Empty Recycle Bin…", danger: true, disabled: !state.trashCount, action: ops.emptyBin }], { ...pt, label: "Recycle Bin" }),
  });
  nav.append(...[favoritesSection(favorites), section("Places", places), folderTreeSection(), section("Drives", drives), tagsSection(), recentSection(sideItem), section("", [bin])].filter(Boolean));
}

export function wireSidebar() {
  on("places", renderSidebar);
  on("view", renderSidebar);
  on("settings", renderSidebar);
}
