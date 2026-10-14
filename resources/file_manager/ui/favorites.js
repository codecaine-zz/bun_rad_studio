// Favorites: folders you want to jump to in one click. Add the folder you are in with the star in the address bar,
// or type a location; give a favorite your own name; reorder or remove them in "Manage favorites". They are saved
// with the other settings, so they are still there next time.
import { ApiError, call } from "./api.js";
import { openDialog, promptBox } from "./dialogs.js";
import { $, clear, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { goTo, saveSettings } from "./nav.js";
import { inTrash, on, state } from "./state.js";
import { baseName, plural } from "./util.js";

const MAX_NAME = 60;

export const isFavorite = (path) => state.settings.favorites.includes(path);

/** What to show for a favorite: the person's own name, or the folder's name. */
export function favoriteName(path) {
  return state.settings.favoriteNames?.[path] || baseName(path, state.sep) || path;
}

const here = () => (state.location.kind === "folder" && state.location.path ? state.location.path : null);

async function store(favorites, names) {
  const kept = {};
  for (const p of favorites) if (names[p]) kept[p] = names[p];
  try {
    await saveSettings({ favorites, favoriteNames: kept });
    return true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't save your favorites.", { kind: "error" });
    return false;
  }
}

/** Adds or removes the folder you are looking at. */
export async function toggleHere() {
  const path = here();
  if (!path) return toast("Open a folder first. The Recycle Bin can't be a favorite.", { kind: "info" });
  const name = favoriteName(path);
  if (isFavorite(path)) {
    if (await store(state.settings.favorites.filter((f) => f !== path), state.settings.favoriteNames ?? {})) toast(`Removed "${name}" from Favorites.`, { timeout: 3000 });
  } else if (await store([...state.settings.favorites, path], state.settings.favoriteNames ?? {})) {
    toast(`Added "${name}" to Favorites. It is in the list on the left, and under the ⭐ button.`, { kind: "success", timeout: 3500 });
  }
}

/** Turns what someone typed (like ~/Projects) into a folder that exists, or explains what is wrong. */
async function resolveFolder(text) {
  if (!text.trim()) throw new ApiError("Type a folder location, like ~/Documents.", "BAD_PATH", 400);
  const r = await call("typedpath", { text: text.trim(), cwd: here() ?? state.home });
  if (!r.exists) throw new ApiError(`There is no folder at ${r.path}.`, "NOT_FOUND", 404);
  if (!r.isDir) throw new ApiError("That is a file. Favorites are folders.", "NOT_A_FOLDER", 400);
  return r.path;
}

/** Asks for a folder location and adds it. */
export async function addFavoritePrompt() {
  const added = await promptBox({
    title: "Add a favorite folder",
    label: "Folder location",
    value: here() ?? "",
    confirmLabel: "Add to Favorites",
    hint: "Type or paste a location, like ~/Projects or C:\\Users\\me\\Music. To add the folder you are in, press the star next to the address.",
    submit: async (text) => {
      const path = await resolveFolder(text);
      if (isFavorite(path)) throw new ApiError("That folder is already in your favorites.", "EXISTS", 409);
      if (state.settings.favorites.length >= 100) throw new ApiError("You have 100 favorites, which is the most. Remove one first.", "TOO_MANY", 400);
      if (!(await store([...state.settings.favorites, path], state.settings.favoriteNames ?? {}))) throw new ApiError("Couldn't save that.", "SAVE", 500);
      return path;
    },
  });
  if (typeof added === "string") toast(`Added "${favoriteName(added)}" to Favorites.`, { kind: "success", timeout: 3000 });
  return added;
}

/** Asks for a new name for a favorite. Leaving it empty goes back to the folder's own name. */
export async function renameFavorite(path) {
  await promptBox({
    title: "Rename favorite",
    label: "Name",
    value: favoriteName(path),
    confirmLabel: "Rename",
    hint: `Only changes what this list shows. The folder is still called "${baseName(path, state.sep) || path}".`,
    submit: async (text) => {
      const names = { ...(state.settings.favoriteNames ?? {}) };
      const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
      if (clean && clean !== baseName(path, state.sep)) names[path] = clean;
      else delete names[path];
      if (!(await store(state.settings.favorites, names))) throw new ApiError("Couldn't save that.", "SAVE", 500);
      return true;
    },
  });
}

async function move(path, delta) {
  const list = [...state.settings.favorites];
  const i = list.indexOf(path);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await store(list, state.settings.favoriteNames ?? {});
}

/** The right-click menu of one favorite (in the list on the left and in the Favorites menu). */
export function favoriteMenuItems(path) {
  const i = state.settings.favorites.indexOf(path);
  return [
    { label: "Open", icon: "📂", action: () => goTo(path) },
    { label: "Rename…", icon: "✏️", action: () => renameFavorite(path) },
    { label: "Move up", icon: "↑", disabled: i <= 0, action: () => move(path, -1) },
    { label: "Move down", icon: "↓", disabled: i < 0 || i >= state.settings.favorites.length - 1, action: () => move(path, 1) },
    { separator: true },
    { label: "Remove from Favorites", icon: "⭐", action: () => store(state.settings.favorites.filter((f) => f !== path), state.settings.favoriteNames ?? {}) },
    { label: "Manage favorites…", action: () => showFavoritesManager() },
  ];
}

/** The Favorites menu: jump to a favorite, add where you are, or manage the list. */
export function showFavoritesMenu(anchor) {
  const favs = state.settings.favorites;
  const path = here();
  const items = favs.map((p) => ({ label: favoriteName(p), icon: "⭐", action: () => goTo(p) }));
  if (!items.length) items.push({ label: "No favorites yet", disabled: true });
  items.push({ separator: true });
  if (path) items.push({ label: isFavorite(path) ? "Remove this folder from Favorites" : "Add this folder to Favorites", icon: isFavorite(path) ? "☆" : "★", action: toggleHere });
  items.push({ label: "Add a folder by typing its location…", icon: "➕", action: addFavoritePrompt });
  items.push({ label: "Manage favorites…", icon: "⚙️", disabled: !favs.length, action: showFavoritesManager });
  showMenu(items, anchor instanceof HTMLElement ? { anchor, label: "Favorites" } : { ...anchor, label: "Favorites" });
}

/** A window to rename, reorder, check and remove favorites, all at once. */
export async function showFavoritesManager() {
  const rows = state.settings.favorites.map((path) => ({ path, name: state.settings.favoriteNames?.[path] ?? "", missing: false }));
  const list = h("div", { class: "fav-list" });
  const dlg = openDialog({
    title: "Manage favorites",
    wide: true,
    describe: "Rename, reorder and remove your favorite folders.",
    body: [h("p", { class: "hint" }, "Favorites are folders you can jump to from the list on the left, the ⭐ menu and the Home page. Changes are saved when you press Save."), list],
    buttons: [{ label: "Cancel", value: null }, { label: "Save", value: "save", primary: true }],
  });

  function render() {
    clear(list);
    if (!rows.length) list.append(h("p", { class: "hint" }, "No favorites yet. Open a folder and press the ☆ next to the address."));
    rows.forEach((row, i) => {
      const own = baseName(row.path, state.sep) || row.path;
      const name = h("input", {
        type: "text", class: "text-input fav-name", value: row.name, placeholder: own, maxlength: String(MAX_NAME), spellcheck: "false", autocomplete: "off",
        "aria-label": `Name for ${row.path}`, title: "Your own name for this folder. Leave it empty to use the folder's name.",
        oninput: () => { row.name = name.value; },
      });
      list.append(h("div", { class: `fav-row${row.missing ? " fav-missing" : ""}` },
        h("div", { class: "fav-main" }, name, h("span", { class: "fav-path", title: row.path }, row.missing ? `${row.path}  (this folder isn't there any more)` : row.path)),
        h("div", { class: "fav-actions" },
          h("button", { type: "button", class: "btn", disabled: i === 0, title: "Move up", "aria-label": `Move ${own} up`, onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } }, "↑"),
          h("button", { type: "button", class: "btn", disabled: i === rows.length - 1, title: "Move down", "aria-label": `Move ${own} down`, onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } }, "↓"),
          h("button", { type: "button", class: "btn", title: "Open this folder", "aria-label": `Open ${own}`, onclick: () => { dlg.close(null); goTo(row.path); } }, "Open"),
          h("button", { type: "button", class: "btn danger", title: "Take this folder out of your favorites (the folder itself is not touched)", "aria-label": `Remove ${own} from favorites`, onclick: () => { rows.splice(i, 1); render(); } }, "Remove"))));
    });
    list.append(h("button", { type: "button", class: "btn fav-add", title: "Add another folder by typing its location", onclick: async () => {
      const added = await promptBox({
        title: "Add a favorite folder", label: "Folder location", confirmLabel: "Add", hint: "Type or paste a location, like ~/Projects.",
        submit: async (text) => {
          const path = await resolveFolder(text);
          if (rows.some((r) => r.path === path)) throw new ApiError("That folder is already in the list.", "EXISTS", 409);
          if (rows.length >= 100) throw new ApiError("You have 100 favorites, which is the most.", "TOO_MANY", 400);
          return path;
        },
      });
      if (typeof added === "string") { rows.push({ path: added, name: "", missing: false }); render(); }
    } }, "➕ Add a folder…"));
  }
  render();

  // Mark folders that have gone, a few at a time.
  void (async () => {
    const queue = [...rows];
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const r = await call("typedpath", { text: row.path, cwd: state.home });
          row.missing = !r.exists || !r.isDir;
        } catch {
          // a check that fails just doesn't mark the row
        }
      }
    }));
    if (list.isConnected) render();
  })();

  if ((await dlg.result) !== "save") return false;
  const saved = await store(rows.map((r) => r.path), Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.path, r.name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME)])));
  if (saved) toast(`Saved ${plural(rows.length, "favorite")}.`, { kind: "success", timeout: 2500 });
  return saved;
}

/** The "Favorites" part of the sidebar: a title with + and manage buttons, the items, and a hint when there are none. */
export function favoritesSection(items) {
  const head = h("div", { class: "side-head" },
    h("h2", { class: "side-title" }, "Favorites"),
    h("button", { type: "button", class: "side-mini", title: "Add the folder you are in to Favorites", "aria-label": "Add this folder to Favorites", onclick: toggleHere }, "＋"),
    h("button", { type: "button", class: "side-mini", title: "Rename, reorder or remove favorites", "aria-label": "Manage favorites", onclick: showFavoritesManager }, "⚙"));
  const body = items.length ? items : [h("p", { class: "side-hint" }, "Press the ☆ next to the address to keep a folder here.")];
  return h("section", { class: "side-section" }, head, ...body);
}

function refreshStar(star) {
  const path = here();
  const fav = path !== null && isFavorite(path);
  star.textContent = fav ? "★" : "☆";
  star.setAttribute("aria-pressed", String(fav));
  star.disabled = path === null || inTrash();
  const tip = path === null ? "Open a folder to add it to your favorites" : fav ? "This folder is a favorite. Press to remove it." : "Add this folder to your favorites";
  star.title = `${tip} (right-click for your favorites)`;
  star.setAttribute("aria-label", fav ? "Remove this folder from Favorites" : "Add this folder to Favorites");
}

/** Adds the star to the address bar and keeps it up to date. */
export function wireFavorites() {
  const bar = $("#addressbar .address-main");
  if (!bar) return;
  const star = h("button", { type: "button", id: "fav-star", class: "icon-btn fav-star", onclick: toggleHere });
  star.addEventListener("contextmenu", (e) => { e.preventDefault(); showFavoritesMenu({ x: e.clientX, y: e.clientY }); });
  bar.append(star);
  const update = () => refreshStar(star);
  update();
  on("view", update);
  on("settings", update);
}
