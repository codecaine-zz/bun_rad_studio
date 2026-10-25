// The Home view: a friendly start page that shows everything the app can do. Other modules add their own tiles
// with registerHomeTile(); the tools in the Power panel get a tile each automatically (see homeTiles.js).
import { call } from "./api.js";
import { openCalendarDialog, updateClock } from "./chrome.js";
import { $, buttonIconFor, clear, h, placeIconFor } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { goTo, runSearch } from "./nav.js";
import * as ops from "./ops.js";
import { clearRecents, formatRecentTime, isRecentsEnabled, recentMenuItems, removeRecentItem, showRecentsManager, toggleRecentsEnabled } from "./recents.js";
import { emit, on, state } from "./state.js";
import { showToolsDialog } from "./tools.js";
import { baseName, formatSize, parentOf, plural } from "./util.js";

/**
 * @typedef {{ id: string, icon: string, title: string, text: string, run: () => any, order?: number, cta?: string,
 *   enabled?: () => boolean, why?: string }} HomeTile
 */

/** @type {Map<string, HomeTile>} */
const tiles = new Map();
/** @type {Array<() => HomeTile[]>} */
const providers = [];

/** Adds a tile to the Home view (or replaces the one with the same id). `order`: smaller comes first. */
export function registerHomeTile(tile) {
  tiles.set(tile.id, tile);
  if (built) fillTiles();
}

/** Adds a function that returns more tiles each time Home is drawn (used for the tools in the Power panel). */
export function registerHomeTileProvider(fn) {
  providers.push(fn);
  if (built) fillTiles();
}

/** Every tile, in the order shown. A provider's tile never replaces one registered by id. */
export function listHomeTiles() {
  const all = new Map(tiles);
  for (const provide of providers) for (const t of provide()) if (!all.has(t.id)) all.set(t.id, t);
  return [...all.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title));
}

const TIPS = [
  "Press F1 at any time for help and the list of keyboard shortcuts.",
  "Right-click any file or folder to see everything you can do with it.",
  "Deleted something by mistake? Press Undo, or open the Recycle Bin and choose Restore.",
  "Drag a folder onto Favorites in the list of places to pin it, or right-click it and choose Add to Favorites.",
  "Alt+1 to Alt+5 (Option on a Mac) switch between Files, Home, Tools, Split and Dual.",
  "Split puts a tool beside your files, so you can search or convert while you browse.",
  "Dual shows two folders side by side. Press F5 to copy and F6 to move to the other side.",
  "Focus (Alt+6) hides the toolbar and side panels when you want the whole window for your work.",
  "Select several files and press F2 to rename them all at once, with a preview.",
  "Type the first letters of a name in the file list to jump straight to it.",
];

let built = false;
let tipStart = Math.floor(Math.random() * TIPS.length);
let helpers = { at: 0, tools: null, failed: false };

const byId = (id) => document.getElementById(id);
const folderNow = () => (state.location.kind === "folder" && state.location.path ? state.location.path : state.home);

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** Runs something from Home: switches to the Files view first when it works on the folder you were in. */
function inFiles(fn) {
  emit("workspace-go", "files");
  return fn();
}

async function openFolder(path) {
  emit("workspace-go", "files");
  await goTo(path);
}

async function runTile(tile) {
  if (tile.enabled && !tile.enabled()) return toast(tile.why || "That isn't available right now.", { kind: "info" });
  try {
    await tile.run();
  } catch (err) {
    console.error(`The "${tile.title}" tile failed`, err);
    toast("That couldn't be opened.", { kind: "error" });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------------------------

function tileButton(tile) {
  const disabled = tile.enabled ? !tile.enabled() : false;
  return h("button", {
    type: "button", class: "home-tile", dataset: { tile: tile.id }, title: `${tile.title}: ${tile.text}${disabled && tile.why ? ` (${tile.why})` : ""}`, "aria-disabled": disabled ? "true" : null,
    onclick: () => runTile(tile),
  },
    h("span", { class: "ht-icon", "aria-hidden": "true" }, tile.icon),
    h("span", { class: "ht-body" }, h("span", { class: "ht-title" }, tile.title), h("span", { class: "ht-text" }, tile.text)),
    h("span", { class: "ht-go", "aria-hidden": "true" }, tile.cta ?? "Open →"));
}

function placeButton({ icon, label, title, onClick, extra = null, placeId = null }) {
  const resolvedIcon = placeId ? placeIconFor(placeId, label, undefined, icon) : icon;
  return h("li", {}, h("button", { type: "button", class: "home-place", title, onclick: onClick },
    h("span", { class: "hp-icon", "aria-hidden": "true", ...(placeId ? { dataset: { placeIcon: placeId, placeName: label, defaultIcon: icon } } : {}) }, resolvedIcon), h("span", { class: "hp-body" }, h("span", { class: "hp-label" }, label), extra)));
}

function spaceBar(d) {
  if (!d.totalBytes) return null;
  const used = Math.max(0, Math.min(1, 1 - d.freeBytes / d.totalBytes));
  const fill = h("span", { class: `bar-fill${used > 0.9 ? " low" : ""}` });
  fill.style.width = `${Math.round(used * 100)}%`;
  return h("span", { class: "hp-space" },
    h("span", { class: "bar", role: "img", "aria-label": `${formatSize(d.freeBytes)} free of ${formatSize(d.totalBytes)}` }, fill),
    h("span", { class: "hp-note" }, `${formatSize(d.freeBytes)} free of ${formatSize(d.totalBytes)}`));
}

function card(id, title, hint, content) {
  return h("section", { class: "home-card", "aria-labelledby": `home-h-${id}` },
    h("h2", { id: `home-h-${id}`, class: "home-h" }, title),
    hint ? h("p", { class: "hint" }, hint) : null,
    content);
}

function pinned() {
  const favs = state.settings.favorites;
  if (!favs.length) return card("pinned", "⭐ Pinned folders", null, h("p", { class: "hint" }, "Nothing pinned yet. Right-click a folder and choose “Add to Favorites”, and it will be here."));
  return card("pinned", "⭐ Pinned folders", null, h("ul", { class: "home-list" }, favs.map((p) => placeButton({ icon: "⭐", label: baseName(p, state.sep) || p, placeId: "favorites", title: p, onClick: () => openFolder(p), extra: h("span", { class: "hp-note" }, p) }))));
}

function placesCard() {
  const items = [
    ...state.places.map((p) => placeButton({ icon: p.icon, label: p.name, placeId: p.name.toLowerCase(), title: p.path, onClick: () => openFolder(p.path) })),
    ...state.drives.map((d) => placeButton({ icon: d.icon, label: d.name, title: d.path, onClick: () => openFolder(d.path), extra: spaceBar(d) })),
  ];
  return card("places", "💽 Places and drives", null, h("ul", { class: "home-list" }, items));
}

function recent() {
  const enabled = isRecentsEnabled();
  const all = state.settings.recents;
  const items = enabled ? all.slice(0, 8) : [];
  const actions = h("div", { class: "home-actions home-recent-actions" },
    h("button", {
      type: "button",
      class: "btn",
      dataset: { homeRecentToggle: "" },
      title: enabled ? "Stop recording newly opened files" : "Resume recording newly opened files",
      onclick: () => toggleRecentsEnabled(),
    }, enabled ? "⏸ Turn off" : "▶ Turn on"),
    h("button", {
      type: "button",
      class: "btn",
      dataset: { homeRecentClear: "" },
      disabled: !all.length,
      title: "Clear the list of recent files",
      onclick: () => clearRecents(),
    }, "🧹 Clear"),
    h("button", {
      type: "button",
      class: "btn",
      dataset: { homeRecentManage: "" },
      title: "Manage recent files: filter, remove missing files, or clear",
      onclick: () => showRecentsManager(),
    }, "⚙️ Manage…"));

  let listContent;
  if (!enabled) {
    listContent = h("p", { class: "hint" }, "Recent files are turned off. Turn them on to list the files you open here.");
  } else if (!items.length) {
    listContent = h("p", { class: "hint" }, "Files you open will be listed here, so you can get back to them quickly.");
  } else {
    listContent = h("ul", { class: "home-list" }, items.map((r) => {
      const name = baseName(r.path, state.sep) || r.path;
      const folder = parentOf(r.path, state.sep) ?? "";
      const when = formatRecentTime(r.at);
      const subtitle = [folder, when ? `opened ${when}` : ""].filter(Boolean).join(" · ");
      const mainBtn = h("button", {
        type: "button",
        class: "home-place",
        title: `${r.path}${when ? ` — opened ${when}` : ""}`,
        onclick: () => ops.openPath(r.path),
        oncontextmenu: (e) => {
          e.preventDefault();
          showMenu(recentMenuItems(r.path), { x: e.clientX, y: e.clientY, label: "Recent file" });
        },
      },
        h("span", { class: "hp-icon", "aria-hidden": "true" }, "🕘"),
        h("span", { class: "hp-body" }, h("span", { class: "hp-label" }, name), h("span", { class: "hp-note" }, subtitle)));
      const rmBtn = h("button", {
        type: "button",
        class: "icon-btn home-recent-rm",
        title: `Remove "${name}" from Recent`,
        "aria-label": `Remove ${name} from Recent`,
        onclick: () => removeRecentItem(r.path),
      }, "✕");
      return h("li", { class: "home-recent-item" }, mainBtn, rmBtn);
    }));
  }
  return card("recent", "🕘 Recent files", null, h("div", { class: "home-recent-body" }, listContent, actions));
}

function quick() {
  const act = (label, icon, btnId, tip, run, disabled = false) => h(
    "button",
    { type: "button", class: "btn home-quick", title: tip, disabled, onclick: () => inFiles(run) },
    h("span", { class: "hq-icon", "aria-hidden": "true", ...(btnId ? { dataset: { btnIcon: btnId, defaultIcon: icon } } : {}) }, btnId ? buttonIconFor(btnId, undefined, icon) : icon),
    ` ${label}`,
  );
  return card("quick", "⚡ Quick actions", "These work in the folder you were last looking at.", h("div", { class: "home-actions" },
    act("New folder", "📁", "newFolder", "Make a new folder in the folder you were looking at", ops.newFolder),
    act("New file", "📄", "newFile", "Make a new empty file in the folder you were looking at", ops.newFile),
    act("From template…", "✨", null, "Create a Markdown, TypeScript, Python, HTML, JSON, SQL, or config file from a starter template", () => emit("new-template-dialog")),
    act("Dated folder", "📅", null, "Make a new folder named with today's YYYY-MM-DD date in the folder you were looking at", () => ops.newDatedFolder()),
    h("button", { type: "button", class: "btn home-quick", title: "Open the Universal Command Palette & Quick Jump (Mod+Shift+P)", onclick: () => emit("command-palette", "") }, h("span", { class: "hq-icon", "aria-hidden": "true", dataset: { btnIcon: "power", defaultIcon: "⚡" } }, buttonIconFor("power", undefined, "⚡")), " Command Palette"),
    act("Paste", "📥", "paste", state.clipboard ? "Paste what you copied or cut into the folder you were looking at" : "Nothing has been copied or cut yet", ops.paste, !state.clipboard),
    act("Undo", "↶", "undo", state.undoStack.length ? "Undo the last thing you did" : "Nothing to undo yet", ops.undo, !state.undoStack.length),
    act("Empty Recycle Bin…", "🧹", "empty", state.trashCount ? "Permanently delete everything in the Recycle Bin (it asks first)" : "The Recycle Bin is already empty", ops.emptyBin, !state.trashCount)));
}

function tips() {
  const shown = [0, 1, 2].map((i) => TIPS[(tipStart + i) % TIPS.length]);
  return h("section", { class: "home-card home-tips", "aria-labelledby": "home-h-tips" },
    h("h2", { id: "home-h-tips", class: "home-h" }, "💡 Tips"),
    h("ul", { class: "tips" }, shown.map((t) => h("li", {}, t))),
    h("button", { type: "button", class: "btn", title: "Show three different tips", onclick: () => { tipStart = (tipStart + 3) % TIPS.length; fillSections(); } }, "Show other tips"));
}

function helperStrip() {
  const box = h("section", { class: "home-card home-helpers", "aria-labelledby": "home-h-helpers" }, h("h2", { id: "home-h-helpers", class: "home-h" }, "🧩 Helper programs"));
  if (helpers.tools) {
    const missing = helpers.tools.filter((t) => !t.installed).length;
    box.append(
      h("ul", { class: "home-chips" }, helpers.tools.map((t) => h("li", { class: `home-chip ${t.installed ? "ok" : "missing"}`, title: t.installed ? `${t.name} is installed` : `${t.name} isn't installed yet` }, h("span", { "aria-hidden": "true" }, t.installed ? "✓ " : "✕ "), t.name, h("span", { class: "sr-only" }, t.installed ? " (installed)" : " (not installed)")))),
      h("p", { class: "hint" }, missing ? `${plural(missing, "program")} still to install. Converting pictures, video, sound and documents needs them.` : "Everything needed for converting files is installed."),
    );
  } else box.append(h("p", { class: "hint" }, helpers.failed ? "Couldn't check the helper programs." : "Checking which helper programs are installed…"));
  box.append(h("button", { type: "button", class: "btn", title: "See which helper programs are installed, and install the missing ones", onclick: () => inFiles(showToolsDialog) }, "Check or install helper programs"));
  return box;
}

let helpersLoading = false;

async function loadHelpers() {
  if (helpersLoading || (helpers.tools && Date.now() - helpers.at < 30000)) return;
  helpersLoading = true;
  try {
    const data = await call("tools/overview", { paths: [] });
    helpers = { at: Date.now(), tools: data.tools ?? [], failed: false };
  } catch {
    helpers = { at: 0, tools: null, failed: true };
  } finally {
    helpersLoading = false;
  }
  if (built && state.workspace === "home") fillSections();
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------

function fillTiles() {
  const grid = byId("home-grid");
  if (!grid) return;
  clear(grid).append(...listHomeTiles().map(tileButton));
  applyFilter();
}

function fillSections() {
  const box = byId("home-sections");
  if (!box) return;
  clear(box).append(h("div", { class: "home-cols" }, pinned(), placesCard(), recent()), h("div", { class: "home-cols" }, quick(), tips(), helperStrip()));
}

/** Hides tiles that don't match what is typed in the search box, and says what Enter will do. */
function applyFilter() {
  const input = byId("home-search");
  const q = (input?.value ?? "").trim().toLowerCase();
  let shown = 0;
  const tileById = new Map(listHomeTiles().map((t) => [t.id, t]));
  for (const el of document.querySelectorAll("#home-grid .home-tile")) {
    const tile = tileById.get(el.dataset.tile);
    const hit = !q || `${tile?.title} ${tile?.text}`.toLowerCase().includes(q);
    el.hidden = !hit;
    if (hit) shown++;
  }
  const hint = byId("home-hint");
  if (!hint) return;
  const folder = baseName(folderNow(), state.sep) || "this computer";
  if (!q) hint.textContent = `Type a name to search files in “${folder}”, or the name of something this app can do.`;
  else hint.textContent = `Press Enter to search for “${input.value.trim()}” in “${folder}”. ${shown ? `${plural(shown, "matching tool")} shown below; press Alt+Enter to open the first.` : "No tool matches."}`;
  byId("home-tiles-empty").hidden = shown > 0;
}

async function searchFiles(text) {
  const q = text.trim();
  if (!q) return;
  emit("workspace-go", "files");
  if (state.location.kind !== "folder" && !(await goTo(state.home))) return;
  await runSearch(q);
}

function build() {
  const root = $("#home");
  const input = h("input", { id: "home-search", type: "search", class: "home-search", placeholder: "Search for a file, or for something to do…", autocomplete: "off", spellcheck: "false", title: "Type part of a file name to search for it, or the name of something this app can do to find its tile. Alt+Enter opens the first matching tile.", "aria-label": "Search for files, or for something this app can do", "aria-describedby": "home-hint" });
  input.addEventListener("input", applyFilter);
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") {
      const first = [...document.querySelectorAll("#home-grid .home-tile")].find((t) => !t.hidden);
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === "Enter" && e.altKey) {
      const first = [...document.querySelectorAll("#home-grid .home-tile")].find((t) => !t.hidden);
      if (first) {
        e.preventDefault();
        first.click();
      }
    } else if (e.key === "Escape" && input.value) {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      applyFilter();
    }
  });
  const form = h("form", { class: "home-searchbox", role: "search", onsubmit: (e) => { e.preventDefault(); const text = input.value; input.value = ""; applyFilter(); searchFiles(text); } },
    input, h("button", { type: "submit", class: "btn primary", title: "Look for files and folders whose name contains what you typed" }, "Search files"));
  clear(root).append(h("div", { class: "home-scroll" },
    h("header", { class: "home-hero" },
      h("div", { class: "home-hero-top" },
        h("h1", { id: "home-title" }, greeting() + "!"),
        h("p", { id: "home-datetime", class: "home-datetime", "aria-live": "off", onclick: () => openCalendarDialog() })),
      h("p", { class: "lead" }, "What would you like to do?"),
      form,
      h("p", { id: "home-hint", class: "hint" })),
    h("section", { class: "home-tiles", "aria-labelledby": "home-h-tiles" },
      h("h2", { id: "home-h-tiles", class: "home-h" }, "Everything you can do"),
      h("div", { id: "home-grid", class: "home-grid", role: "group", "aria-labelledby": "home-h-tiles" }),
      h("p", { id: "home-tiles-empty", class: "hint", hidden: true }, "Nothing matches. Press Enter to search your files instead.")),
    h("div", { id: "home-sections" })));
  built = true;
  updateClock();
  fillTiles();
  fillSections();
}

/** Draws the Home view (or freshens it when it is shown again). */
export function renderHome() {
  if (!built || !byId("home-title")) build();
  else {
    byId("home-title").textContent = `${greeting()}!`;
    updateClock();
    fillTiles();
    fillSections();
  }
  loadHelpers();
}

/** Keeps the lists on the page up to date while it is showing. */
export function wireHome() {
  const refresh = () => built && state.workspace === "home" && fillSections();
  for (const ev of ["places", "settings", "clipboard", "undo"]) on(ev, refresh);
  // The database shortcuts arrive a moment after Home is drawn, and follow the "open in" choice in Settings.
  for (const ev of ["db-shortcuts", "settings"]) on(ev, () => built && state.workspace === "home" && fillTiles());
}
