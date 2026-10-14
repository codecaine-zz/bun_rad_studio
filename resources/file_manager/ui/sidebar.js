// The sidebar: Favorites, Places, Drives (with free space), Recent items and the Recycle Bin.
import { showMenu } from "./menus.js";
import { attachDropTarget } from "./dnd.js";
import { favoriteMenuItems, favoriteName, favoritesSection } from "./favorites.js";
import { $, clear, h } from "./dom.js";
import { goTo, showTrash } from "./nav.js";
import * as ops from "./ops.js";
import { inTrash, on, state } from "./state.js";
import { baseName, driveFor, formatSize, plural } from "./util.js";

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
  const activeDrive = here ? driveFor(here, state.drives, state.sep) : null;
  const placeMatch = here !== null && [...state.places, ...state.settings.favorites.map((path) => ({ path }))].some((p) => same(p.path));
  const drives = state.drives.map((d) => sideItem({
    icon: d.icon, label: d.name, title: d.path, active: same(d.path) || (!placeMatch && activeDrive?.path === d.path && !inTrash()), dropPath: d.path, onClick: () => goTo(d.path), extra: driveSpace(d),
  }));
  const recent = state.settings.recents.slice(0, 6).map((r) => sideItem({ icon: "🕘", label: baseName(r.path, state.sep), title: r.path, onClick: () => ops.openEntry({ path: r.path, name: baseName(r.path, state.sep), isDir: false }) }));
  const bin = sideItem({
    icon: "🗑️", label: "Recycle Bin", title: state.trashCount ? `${plural(state.trashCount, "deleted item")}` : "Empty", active: inTrash(), trash: true, badge: state.trashCount || null,
    ariaLabel: state.trashCount ? `Recycle Bin, ${plural(state.trashCount, "item")}` : "Recycle Bin, empty", onClick: () => showTrash(),
    onMenu: (pt) => showMenu([{ label: "Open Recycle Bin", action: () => showTrash() }, { label: "Empty Recycle Bin…", danger: true, disabled: !state.trashCount, action: ops.emptyBin }], { ...pt, label: "Recycle Bin" }),
  });
  nav.append(...[favoritesSection(favorites), section("Places", places), section("Drives", drives), section("Recent", recent), section("", [bin])].filter(Boolean));
}

export function wireSidebar() {
  on("places", renderSidebar);
  on("view", renderSidebar);
  on("settings", renderSidebar);
}
