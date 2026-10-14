// Colour themes for the page: applying one, and the gallery to choose from. The server turns each theme of the
// SimpleGUI table into this page's colour variables (and checks that every text and background pair is readable).
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { emit, on, state } from "./state.js";

/** The variables a theme sets, so they can be taken off again. */
let applied = [];
let wanted = "";
let listCache = null;

function clearPalette() {
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = [];
  root.style.removeProperty("color-scheme");
  delete root.dataset.palette;
  wanted = "";
}

/** Puts a theme's colour variables on the page. `key` marks which saved theme it is ("preview" while editing). */
export function paint(theme, key) {
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = Object.keys(theme.vars);
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(`--${name}`, value);
  root.style.setProperty("color-scheme", theme.scheme);
  root.dataset.theme = theme.scheme;
  root.dataset.palette = key;
  wanted = key;
}

/** Forgets the list of themes, so the next gallery shows themes that were just made or deleted. */
export function forgetThemeList() {
  listCache = null;
}

/** Applies the theme `key`, or goes back to the plain Light/Dark/automatic choice when `key` is empty or unknown. Resolves the theme's name or "". */
export async function applyPalette(key) {
  const root = document.documentElement;
  if (!key) {
    clearPalette();
    const t = state.settings.theme;
    if (t === "auto") delete root.dataset.theme;
    else root.dataset.theme = t;
    return "";
  }
  wanted = key;
  try {
    const { theme } = await call("themes/get", { key });
    if (wanted !== key) return theme.name; // another theme was chosen while this one loaded
    paint(theme, key);
    return theme.name;
  } catch (err) {
    if (wanted === key) {
      clearPalette();
      if (!(err instanceof ApiError) || err.code !== "NOT_FOUND") toast("The theme couldn't be loaded, so the usual colours are shown.", { kind: "error" });
    }
    return "";
  }
}

async function themeList() {
  if (!listCache) listCache = (await call("themes/list")).themes;
  return listCache;
}

/** The name of the chosen theme, for the Settings window. */
export async function currentThemeName() {
  const key = state.settings.palette;
  if (!key) return "";
  try {
    return (await themeList()).find((t) => t.key === key)?.name ?? "";
  } catch {
    return "";
  }
}

const GROUP_ORDER = ["My themes", "Futuristic", "Editors and classics", "Linux", "Windows", "macOS"];

function swatch(theme) {
  const bar = h("span", { class: "theme-swatch", "aria-hidden": "true" }, theme.swatch.map(() => h("span", {})));
  [...bar.children].forEach((part, i) => part.style.setProperty("background", theme.swatch[i]));
  return bar;
}

async function choose(key) {
  await saveSettings({ palette: key });
}

/** The theme gallery: search, filter by light or dark, and click a theme to try it. */
export async function showThemePicker() {
  let themes;
  try {
    themes = await themeList();
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const search = h("input", { type: "search", class: "prop-input", placeholder: "Search themes", "aria-label": "Search themes", title: "Type part of a theme's name, like dark, nord or windows." });
  const mode = h("select", { class: "prop-input", "aria-label": "Show light or dark themes", title: "Show only light themes, only dark ones, or both." },
    [["all", "Light and dark"], ["light", "Light only"], ["dark", "Dark only"]].map(([v, l]) => h("option", { value: v }, l)));
  const list = h("div", { class: "theme-list" });
  const count = h("p", { class: "hint", role: "status" });

  const card = (t) => {
    const on = state.settings.palette === t.key;
    const b = h("button", { type: "button", class: "theme-card", "aria-pressed": String(on), title: `${t.name}: ${t.description}`, onclick: async () => { await choose(t.key); draw(); } },
      swatch(t), h("span", { class: "theme-name" }, t.name), h("span", { class: "theme-kind" }, t.dark ? "Dark" : "Light"));
    return b;
  };
  const defaultCard = () => {
    const on = !state.settings.palette;
    return h("button", { type: "button", class: "theme-card", "aria-pressed": String(on), title: "The standard colours: they follow your computer's light or dark setting, or the Colours choice in Settings.", onclick: async () => { await choose(""); draw(); } },
      h("span", { class: "theme-swatch theme-swatch-default", "aria-hidden": "true" }, "Aa"), h("span", { class: "theme-name" }, "Standard"), h("span", { class: "theme-kind" }, "Light or dark"));
  };

  function draw() {
    const q = search.value.trim().toLowerCase();
    const m = mode.value;
    const shown = themes.filter((t) => (m === "all" || (m === "dark") === t.dark) && (!q || `${t.name} ${t.group} ${t.key} ${t.description}`.toLowerCase().includes(q)));
    const sections = [];
    if (!q && m === "all") sections.push(h("section", {}, h("h3", {}, "Default"), h("div", { class: "theme-grid" }, defaultCard())));
    for (const group of GROUP_ORDER) {
      const inGroup = shown.filter((t) => t.group === group);
      if (inGroup.length) sections.push(h("section", {}, h("h3", {}, `${group} (${inGroup.length})`), h("div", { class: "theme-grid" }, inGroup.map(card))));
    }
    list.replaceChildren(...(sections.length ? sections : [h("p", { class: "hint" }, "No theme matches. Try a shorter word.")]));
    count.textContent = `${shown.length} of ${themes.length} themes`;
  }
  search.addEventListener("input", debounce(draw, 120));
  mode.addEventListener("change", draw);
  draw();
  const dialog = openDialog({
    title: "Themes",
    wide: true,
    body: [h("div", { class: "theme-tools" }, search, mode, h("button", { type: "button", class: "btn", title: "Make your own theme, or start from one of these and change its colours.", onclick: () => { dialog.close(); emit("theme-editor", { from: state.settings.palette || "" }); } }, "Create or edit a theme…")), count, list, h("p", { class: "hint" }, "A theme applies as soon as you click it, and is remembered. The colours of every theme are checked so text stays readable.")],
    buttons: [{ label: "Done", primary: true, value: true }],
    initialFocus: search,
  });
}

on("theme-picker", () => showThemePicker());
