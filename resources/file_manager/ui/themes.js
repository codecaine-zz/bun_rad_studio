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

function clearEffects() {
  const root = document.documentElement;
  for (const attr of [...root.attributes]) if (attr.name.startsWith("data-fx")) root.removeAttribute(attr.name);
  document.getElementById("fm-theme-effects")?.remove();
}

function clearPalette() {
  clearEffects();
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = [];
  root.style.removeProperty("color-scheme");
  delete root.dataset.palette;
  wanted = "";
}

/** Puts a theme's colour variables on the page. `key` marks which saved theme it is ("preview" while editing). */
export function paint(theme, key) {
  clearEffects();
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = Object.keys(theme.vars);
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(`--${name}`, value);
  root.style.setProperty("color-scheme", theme.scheme);
  root.dataset.theme = theme.scheme;
  root.dataset.palette = key;
  wanted = key;
  if (theme.effects) {
    const style = document.createElement("style");
    style.id = "fm-theme-effects";
    const nonce = document.querySelector('meta[name="fm-nonce"]')?.content;
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = `:root { ${theme.effects.css} }`;
    document.head.append(style);
    for (const [name, value] of Object.entries(theme.effects.attrs)) root.setAttribute(name, value);
  }
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

const GROUP_ORDER = ["My themes", "Futuristic", "Editors and classics", "Linux", "Windows", "macOS", "Rare and beloved systems"];

function swatch(theme) {
  const bar = h("span", { class: "theme-swatch", "aria-hidden": "true" }, theme.swatch.map(() => h("span", {})));
  [...bar.children].forEach((part, i) => part.style.setProperty("background", theme.swatch[i]));
  return bar;
}

const RECENT_KEY = "fm_recent_themes";
const MAX_RECENT = 6;

/** The keys of the themes used lately, newest first (kept in this window's own storage, never sent anywhere). */
function recentKeys() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((k) => typeof k === "string" && /^[a-z0-9_]{1,60}$/.test(k)).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function rememberTheme(key) {
  if (!key) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recentKeys().filter((k) => k !== key)].slice(0, MAX_RECENT)));
  } catch { /* storage is off: the menu just has no recent themes */ }
}

/** The themes used lately that still exist: [{ key, name, dark }], newest first. */
export async function recentThemes() {
  const keys = recentKeys();
  if (!keys.length) return [];
  try {
    const all = await themeList();
    return keys.map((k) => all.find((t) => t.key === k)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Chooses a theme by its key (an empty key goes back to the standard colours) and remembers it as a recent one. */
export async function chooseTheme(key) {
  rememberTheme(key);
  await saveSettings({ palette: key });
}

let cycling = false;
export async function cycleTheme(direction) {
  if (cycling) return;
  cycling = true;
  try {
    const themes = await themeList();
    const keys = ["", ...themes.map((theme) => theme.key)];
    const current = keys.indexOf(state.settings.palette || "");
    const next = current < 0 ? (direction > 0 ? 0 : keys.length - 1)
      : (current + direction + keys.length) % keys.length;
    await chooseTheme(keys[next]);
  } catch (err) {
    toast(err?.message || "The theme couldn't be changed.", { kind: "error" });
  } finally {
    cycling = false;
  }
}

if (typeof window !== "undefined") {
  window.cycleAppTheme = cycleTheme;
  window.openAppThemes = () => showThemePicker();
}

const choose = chooseTheme;

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
  const fxFilter = h("select", { class: "prop-input", "aria-label": "Show themes with or without special effects", title: "Special effects are glass panels, glow, moving light, scanlines and grain. Plain themes change only the colours." },
    [["any", "With or without effects"], ["fx", "✨ Special effects only"], ["plain", "Plain colours only"]].map(([v, l]) => h("option", { value: v }, l)));
  const list = h("div", { class: "theme-list" });
  const count = h("p", { class: "hint", role: "status" });

  const card = (t) => {
    const on = state.settings.palette === t.key;
    const b = h("button", { type: "button", class: "theme-card", "data-key": t.key, "aria-pressed": String(on), title: `${t.name}: ${t.description}`, onclick: () => pick(t.key) },
      swatch(t), h("span", { class: "theme-name" }, t.name), h("span", { class: "theme-kind" }, t.dark ? "Dark" : "Light"),
      t.hasEffects ? h("span", { class: "theme-fx-badge", title: "This theme has special effects: glass, glow, motion and texture." }, "✨ Effects") : h("span", { class: "theme-plain-badge" }, "Colours only"));
    return b;
  };
  const defaultCard = () => {
    const on = !state.settings.palette;
    return h("button", { type: "button", class: "theme-card", "data-key": "", "aria-pressed": String(on), title: "The standard colours: they follow your computer's light or dark setting, or the Colours choice in Settings.", onclick: () => pick("") },
      h("span", { class: "theme-swatch theme-swatch-default", "aria-hidden": "true" }, "Aa"), h("span", { class: "theme-name" }, "Standard"), h("span", { class: "theme-kind" }, "Light or dark"));
  };

  function draw() {
    const q = search.value.trim().toLowerCase();
    const m = mode.value;
    const fx = fxFilter.value;
    const shown = themes.filter((t) => (m === "all" || (m === "dark") === t.dark) && (fx === "any" || (fx === "fx") === !!t.hasEffects)
      && (!q || `${t.name} ${t.group} ${t.key} ${t.description} ${t.hasEffects ? "effects special effects fx glow glass motion" : "plain"}`.toLowerCase().includes(q)));
    const sections = [];
    if (!q && m === "all" && fx !== "fx") sections.push(h("section", {}, h("h3", {}, "Default"), h("div", { class: "theme-grid" }, defaultCard())));
    for (const group of GROUP_ORDER) {
      const inGroup = shown.filter((t) => t.group === group);
      if (inGroup.length) sections.push(h("section", {}, h("h3", {}, `${group} (${inGroup.length})`), h("div", { class: "theme-grid" }, inGroup.map(card))));
    }
    list.replaceChildren(...(sections.length ? sections : [h("p", { class: "hint" }, "No theme matches. Try a shorter word.")]));
    const withFx = shown.filter((t) => t.hasEffects).length;
    count.textContent = `${shown.length} of ${themes.length} themes · ${withFx} with special effects ✨, ${shown.length - withFx} plain colours`;
  }
  // Keyboard: the arrow keys, Home and End move between cards and show each theme straight away (not saved yet).
  // Enter or Space keeps the focused theme, Done keeps the one on show, and Escape goes back to the saved theme.
  let previewKey = null;
  const cards = () => [...list.querySelectorAll(".theme-card")];
  const preview = debounce((key) => { if (previewKey === key) applyPalette(key); }, 60);
  async function pick(key) {
    previewKey = null;
    await choose(key);
    draw();
    cards().find((c) => (c.dataset.key ?? "") === key)?.focus({ preventScroll: true });
  }
  list.addEventListener("focusin", (e) => {
    const c = e.target.closest?.(".theme-card");
    if (!c) return;
    const key = c.dataset.key ?? "";
    if (key === (state.settings.palette || "") && previewKey === null) return;
    previewKey = key;
    preview(key);
  });
  const step = (from, key) => {
    const all = cards();
    const i = all.indexOf(from);
    if (key === "Home") return all[0];
    if (key === "End") return all.at(-1);
    if (key === "ArrowLeft") return all[Math.max(0, i - 1)];
    if (key === "ArrowRight") return all[Math.min(all.length - 1, i + 1)];
    // Up and Down: the nearest card in the row above or below, across group headings too.
    const r = from.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const down = key === "ArrowDown";
    const rows = all.map((c) => [c, c.getBoundingClientRect()]).filter(([, b]) => (down ? b.top > r.top + 4 : b.top < r.top - 4));
    if (!rows.length) return from;
    const rowTop = down ? Math.min(...rows.map(([, b]) => b.top)) : Math.max(...rows.map(([, b]) => b.top));
    const row = rows.filter(([, b]) => Math.abs(b.top - rowTop) < 4);
    return row.reduce((best, cur) => (Math.abs(cur[1].left + cur[1].width / 2 - x) < Math.abs(best[1].left + best[1].width / 2 - x) ? cur : best))[0];
  };
  list.addEventListener("keydown", (e) => {
    const from = e.target.closest?.(".theme-card");
    if (!from || e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    step(from, e.key)?.focus();
  });
  const enterCards = (e) => {
    if (e.key !== "ArrowDown" || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    (list.querySelector('.theme-card[aria-pressed="true"]') ?? cards()[0])?.focus();
  };
  search.addEventListener("keydown", enterCards);

  search.addEventListener("input", debounce(draw, 120));
  mode.addEventListener("change", draw);
  fxFilter.addEventListener("change", draw);
  draw();
  const dialog = openDialog({
    title: "Themes",
    wide: true,
    body: [h("div", { class: "theme-tools" }, search, mode, fxFilter, h("button", { type: "button", class: "btn", title: "Make your own theme, or start from one of these and change its colours.", onclick: () => { dialog.close(); emit("theme-editor", { from: state.settings.palette || "" }); } }, "Create or edit a theme…")), count, list, h("p", { class: "hint" }, "A theme applies as soon as you click it, and is remembered. Or use the arrow keys to try themes as you move: Enter or Done keeps one, Escape goes back. Themes marked ✨ Effects add glass, glow and motion; the effects menu lets you show only them, or only plain colour themes. The colours of every theme are checked so text stays readable.")],
    buttons: [{ label: "Done", primary: true, value: true }],
    initialFocus: search,
  });
  dialog.result.then(async (value) => {
    const key = previewKey;
    previewKey = null;
    if (key === null) return;
    if (value === true) await choose(key);
    else await applyPalette(state.settings.palette || "");
  });
}

on("theme-picker", () => showThemePicker());
