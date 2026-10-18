// Color themes for the page: applying one, and the gallery to choose from. The server turns each theme of the
// SimpleGUI table into this page's color variables (and checks that every text and background pair is readable).
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
let currentVars = {};

export function isSystemDark() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Resolves the paired theme key when `theme === "auto"` and no fixed `palette` is forced. */
export function effectiveAutoPalette(dark = isSystemDark()) {
  const s = state.settings;
  if (!s || s.palette || s.theme !== "auto") return "";
  return (dark ? s.preferredDarkPalette : s.preferredLightPalette) || "";
}

const DEFAULT_TERM_THEME = { background: "#1e1e1e", foreground: "#e6e6e6", cursor: "#e6e6e6", cursorAccent: "#1e1e1e", selectionBackground: "#3d5a80" };

/** Snapshot of the currently active theme for embedded tools and the terminal. */
export function currentThemePayload() {
  const root = document.documentElement;
  const scheme = root.dataset.theme || (isSystemDark() ? "dark" : "light");
  return {
    scheme,
    palette: root.dataset.palette || "",
    vars: { ...currentVars },
  };
}

/** Computes harmonized xterm.js terminal colors from the active theme payload. */
export function terminalTheme(payload = currentThemePayload()) {
  const v = payload?.vars ?? {};
  if (!payload?.palette || !v.bg || !v.text) return { ...DEFAULT_TERM_THEME };
  const bg = v["surface-sunken"] || v.bg;
  return {
    background: bg,
    foreground: v.text,
    cursor: v.accent || v.text,
    cursorAccent: bg,
    selectionBackground: v.selected || "#3d5a80",
  };
}

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
  currentVars = {};
  root.style.removeProperty("color-scheme");
  delete root.dataset.palette;
  wanted = "";
  emit("theme-changed", currentThemePayload());
}

let cachedHw = null;

/** Probes client GPU, display gamut/HDR, and accessibility/power constraints once per session. */
export function probeClientHardware() {
  if (cachedHw) return cachedHw;
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const mm = (q) => {
    try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches; }
    catch { return false; }
  };
  let gpu = "";
  try {
    if (typeof document !== "undefined" && !/jsdom/i.test(nav.userAgent || "")) {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : String(gl.getParameter(gl.RENDERER) || "");
      }
    }
  } catch {}
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8;
  const mem = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
  const dpr = typeof window !== "undefined" && typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1;
  const p3 = mm("(color-gamut: p3)");
  const hdr = mm("(dynamic-range: high)");
  const reducedMotion = mm("(prefers-reduced-motion: reduce)");
  const reducedTransparency = mm("(prefers-reduced-transparency: reduce)");
  const forcedColors = mm("(forced-colors: active)");
  const saveData = Boolean(nav.connection?.saveData);
  const swGpu = /swiftshader|llvmpipe|softpipe|basic render driver|microsoft basic|\bwarp\b|d3d11 warp|gdi generic|hyper-v|rdpudd|citrix|virtualbox|vmware/i.test(gpu);
  const shouldFallback = forcedColors || reducedTransparency || saveData || swGpu || (cores > 0 && cores <= 2) || (mem > 0 && mem <= 2);
  const ultra = !shouldFallback && (/apple\s+m[1-9]|rtx\s*[345]\d{2,3}|radeon\s+rx\s+[6789]\d{2,3}|intel.*arc\s+[ab]\d{3}|adreno\s+x1|snapdragon\s+x/i.test(gpu) || (p3 && hdr && cores >= 8));
  cachedHw = {
    tier: shouldFallback ? "low" : ultra ? "ultra" : (cores >= 8 || p3 || dpr >= 1.5) ? "high" : "balanced",
    fxMode: (forcedColors || swGpu) ? "off" : (shouldFallback || reducedMotion) ? "reduced" : "on",
    shouldFallback,
    gpu,
    p3,
    hdr,
  };
  return cachedHw;
}

/** Puts a theme's color variables on the page. `key` marks which saved theme it is ("preview" while editing). */
export function paint(theme, key) {
  clearEffects();
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = Object.keys(theme.vars);
  currentVars = { ...theme.vars };
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(`--${name}`, value);
  root.style.setProperty("color-scheme", theme.scheme);
  root.dataset.theme = theme.scheme;
  root.dataset.palette = key;
  wanted = key;
  if (theme.effects) {
    const hw = probeClientHardware();
    const style = document.createElement("style");
    style.id = "fm-theme-effects";
    const nonce = document.querySelector('meta[name="fm-nonce"]')?.content;
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = `:root { ${theme.effects.css} }`;
    document.head.append(style);
    for (const [name, value] of Object.entries(theme.effects.attrs)) root.setAttribute(name, value);
    root.setAttribute("data-fx-tier", hw.tier);
    if (hw.fxMode !== "on") root.setAttribute("data-fx", hw.fxMode);
  }
  emit("theme-changed", currentThemePayload());
}

/** Forgets the list of themes, so the next gallery shows themes that were just made or deleted. */
export function forgetThemeList() {
  listCache = null;
}

/** Applies the theme `key`, or goes back to the plain Light/Dark/automatic choice (or Day/Night pair) when `key` is empty or unknown. Resolves the theme's name or "". */
export async function applyPalette(key) {
  const root = document.documentElement;
  const resolvedKey = key || effectiveAutoPalette();
  if (!resolvedKey) {
    clearPalette();
    const t = state.settings?.theme ?? "auto";
    if (t === "auto") delete root.dataset.theme;
    else root.dataset.theme = t;
    emit("theme-changed", currentThemePayload());
    return "";
  }
  wanted = resolvedKey;
  try {
    const { theme } = await call("themes/get", { key: resolvedKey });
    if (wanted !== resolvedKey) return theme.name; // another theme was chosen while this one loaded
    const hw = probeClientHardware();
    if (theme.hasEffects && hw.shouldFallback && theme.fallbackKey && !state.settings?.disableThemeFallback) {
      try {
        const fb = await call("themes/get", { key: theme.fallbackKey });
        if (wanted !== resolvedKey) return fb.theme.name;
        paint(fb.theme, theme.fallbackKey);
        toast(`Switched from ${theme.name} to ${fb.theme.name} for smooth performance on this system.`);
        return fb.theme.name;
      } catch {}
    }
    paint(theme, resolvedKey);
    return theme.name;
  } catch (err) {
    if (wanted === resolvedKey) {
      clearPalette();
      if (!(err instanceof ApiError) || err.code !== "NOT_FOUND") toast("The theme couldn't be loaded, so the usual colors are shown.", { kind: "error" });
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
const RADIUS_PX = { sharp: ["2px", "1px"], soft: ["6px", "4px"], round: ["10px", "6px"], pill: ["14px", "999px"], squircle: ["11px", "7px"] };

function parseHexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbHueSatLum([r, g, b]) {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
  else if (max === gf) h = ((bf - rf) / d + 2) * 60;
  else h = ((rf - gf) / d + 4) * 60;
  return { h, s, l };
}

/** Classifies a theme into a visual color vibe/mood for 1-click gallery filtering. */
export function themeMatchesVibe(t, vibe) {
  if (!vibe || vibe === "all") return true;
  if (vibe === "light") return !t.dark;
  const [bgHex, , accentHex] = t.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
  const bg = parseHexRgb(bgHex);
  if (vibe === "oled") return t.dark && bg[0] <= 14 && bg[1] <= 16 && bg[2] <= 24;
  const { h, s } = rgbHueSatLum(parseHexRgb(accentHex));
  if (s < 0.12) return false;
  if (vibe === "cyan") return h >= 165 && h <= 235;
  if (vibe === "violet") return (h > 235 && h <= 335);
  if (vibe === "emerald") return h >= 85 && h < 165;
  if (vibe === "warm") return h < 85 || h > 335;
  return true;
}

function swatch(theme) {
  const [sBg, sPanel, sAccent, sText] = theme.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
  const p = theme.preview ?? {
    bg: sBg, panel: sPanel, accent: sAccent, text: sText, muted: sText,
    border: sPanel, selected: sAccent, selectedText: sBg,
    radius: "soft", glow: "none", glowColor: sAccent, borderStyle: "flat",
  };
  const [outerR, pillR] = RADIUS_PX[p.radius] ?? RADIUS_PX.soft;
  const box = h("span", {
    class: "theme-swatch",
    "aria-hidden": "true",
    "data-sw-glow": p.glow ?? "none",
    "data-sw-border": p.borderStyle ?? "flat",
  },
    h("span", { class: "theme-swatch-side" },
      h("span", { class: "theme-swatch-dot" }),
      h("span", { class: "theme-swatch-bar" }),
      h("span", { class: "theme-swatch-bar short" }),
    ),
    h("span", { class: "theme-swatch-main" },
      h("span", { class: "theme-swatch-pill" },
        h("span", { class: "theme-swatch-pill-dot" }),
        h("span", { class: "theme-swatch-pill-label" }, "Aa"),
      ),
      h("span", { class: "theme-swatch-row" },
        h("span", { class: "theme-swatch-text" }, "File"),
        h("span", { class: "theme-swatch-meta" }),
      ),
    ),
  );
  const vars = [
    ["--sw-bg", p.bg],
    ["--sw-panel", p.panel],
    ["--sw-accent", p.accent],
    ["--sw-text", p.text],
    ["--sw-muted", p.muted],
    ["--sw-border", p.border],
    ["--sw-selected", p.selected],
    ["--sw-selected-text", p.selectedText],
    ["--sw-glow", p.glowColor],
    ["--sw-radius", outerR],
    ["--sw-pill-radius", pillR],
  ];
  for (const [k, v] of vars) box.style.setProperty(k, v);
  return box;
}

function defaultSwatch() {
  return h("span", { class: "theme-swatch theme-swatch-default", "aria-hidden": "true" },
    h("span", { class: "theme-swatch-side" },
      h("span", { class: "theme-swatch-dot" }),
      h("span", { class: "theme-swatch-bar" }),
      h("span", { class: "theme-swatch-bar short" }),
    ),
    h("span", { class: "theme-swatch-main" },
      h("span", { class: "theme-swatch-pill" },
        h("span", { class: "theme-swatch-pill-dot" }),
        h("span", { class: "theme-swatch-pill-label" }, "Aa"),
      ),
      h("span", { class: "theme-swatch-row" },
        h("span", { class: "theme-swatch-text" }, "File"),
        h("span", { class: "theme-swatch-meta" }),
      ),
    ),
  );
}

const RECENT_KEY = "fm_recent_themes";
const FAVORITE_KEY = "fm_favorite_themes";
const MAX_RECENT = 6;
const MAX_FAVORITE = 50;
const VALID_KEY = /^[a-z0-9_]{1,60}$/;

function cleanKeys(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const k of list) {
    if (typeof k === "string" && VALID_KEY.test(k) && !out.includes(k) && out.length < max) out.push(k);
  }
  return out;
}

/** The keys of the themes pinned as favorites, newest first. */
export function favoriteKeys() {
  const fromSettings = cleanKeys(state.settings?.favoriteThemes, MAX_FAVORITE);
  if (fromSettings.length || Array.isArray(state.settings?.favoriteThemes)) return fromSettings;
  try {
    return cleanKeys(JSON.parse(localStorage.getItem(FAVORITE_KEY) ?? "[]"), MAX_FAVORITE);
  } catch {
    return [];
  }
}

export function isFavoriteTheme(key) {
  return typeof key === "string" && favoriteKeys().includes(key);
}

/** Pins or unpins a theme `key` as a favorite. Resolves true when pinned, false when unpinned. */
export async function toggleFavoriteTheme(key) {
  if (typeof key !== "string" || !VALID_KEY.test(key)) return false;
  const current = favoriteKeys();
  const pinned = !current.includes(key);
  const next = pinned ? [key, ...current].slice(0, MAX_FAVORITE) : current.filter((k) => k !== key);
  if (state.settings) state.settings.favoriteThemes = next;
  try {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
  } catch { /* storage is off */ }
  await saveSettings({ favoriteThemes: next });
  return pinned;
}

/** The favorite themes that still exist: [{ key, name, dark, ... }], in pinned order. */
export async function favoriteThemes() {
  const keys = favoriteKeys();
  if (!keys.length) return [];
  try {
    const all = await themeList();
    return keys.map((k) => all.find((t) => t.key === k)).filter(Boolean);
  } catch {
    return [];
  }
}

/** The keys of the themes used lately, newest first (kept in this window's own storage, never sent anywhere). */
function recentKeys() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return cleanKeys(list, MAX_RECENT);
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

/** Chooses a theme by its key (an empty key goes back to the standard colors) and remembers it as a recent one. */
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

/** The theme gallery: search, filter by light or dark, category, color vibe or effects, pin favorites, and click a theme to try it. */
export async function showThemePicker() {
  let themes;
  try {
    themes = await themeList();
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const search = h("input", { type: "search", class: "prop-input", placeholder: "Search themes", "aria-label": "Search themes", title: "Type part of a theme's name, like dark, nord, m4, tahoe or windows." });
  const mode = h("select", { class: "prop-input", "aria-label": "Show light or dark themes", title: "Show only light themes, only dark ones, or both." },
    [["all", "Light and dark"], ["light", "Light only"], ["dark", "Dark only"]].map(([v, l]) => h("option", { value: v }, l)));
  const categoryOptions = [
    ["all", "All categories"],
    ["favorites", "★ Favorites"],
    ["recent", "⏱ Recently used"],
    ...(themes.some((t) => t.group === "My themes") ? [["My themes", "My themes"]] : []),
    ["Futuristic", "Futuristic"],
    ["Editors and classics", "Editors and classics"],
    ["Linux", "Linux"],
    ["Windows", "Windows"],
    ["macOS", "macOS"],
    ["Rare and beloved systems", "Rare and beloved systems"],
  ];
  const groupFilter = h("select", { class: "prop-input", "aria-label": "Show themes from a category", title: "Show themes from all categories, only your pinned favorites, recently used, or one category like Futuristic, Linux or Windows." },
    categoryOptions.map(([v, l]) => h("option", { value: v }, l)));
  const fxFilter = h("select", { class: "prop-input", "aria-label": "Show themes with or without special effects", title: "Special effects are glass panels, glow, moving light, scanlines and grain. Plain themes change only the colors." },
    [["any", "With or without effects"], ["fx", "✨ Special effects only"], ["plain", "Plain colors only"]].map(([v, l]) => h("option", { value: v }, l)));
  let activeVibe = "all";
  let lastShown = themes;
  let dialogRef = null;
  const list = h("div", { class: "theme-list" });
  const count = h("p", { class: "hint", role: "status" });
  const supportsHas = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("selector(:has(*))");

  const catPillsDef = [
    ["all", "All"],
    ["favorites", "★ Favorites"],
    ["recent", "⏱ Recent"],
    ...(themes.some((t) => t.group === "My themes") ? [["My themes", "🎨 My themes"]] : []),
    ["Futuristic", "✨ Futuristic"],
    ["macOS", "🍎 macOS"],
    ["Windows", "🪟 Windows"],
    ["Linux", "🐧 Linux"],
    ["Editors and classics", "⌨️ Editors"],
    ["Rare and beloved systems", "💎 Rare"],
  ];
  const catPillButtons = catPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-cat-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        groupFilter.value = val;
        draw();
      },
    }, label),
  );

  const vibePillsDef = [
    ["all", "All Vibes"],
    ["oled", "⚫ OLED Black"],
    ["cyan", "🔵 Cyan & Ocean"],
    ["violet", "🟣 Violet & Neon"],
    ["emerald", "🟢 Emerald"],
    ["warm", "🟠 Amber & Warm"],
    ["light", "☀️ Crisp Light"],
  ];
  const vibePillButtons = vibePillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-vibe-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        activeVibe = val;
        draw();
      },
    }, label),
  );

  const navBar = h("div", { class: "theme-nav-bar", role: "region", "aria-label": "Quick theme filters" },
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Category"), ...catPillButtons),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Color Vibe"), ...vibePillButtons),
  );

  const card = (t) => {
    const on = state.settings.palette === t.key;
    const pinned = isFavoriteTheme(t.key);
    const b = h("button", { type: "button", class: "theme-card", "data-key": t.key, "aria-pressed": String(on), title: `${t.name}: ${t.description}`, onclick: () => pick(t.key) },
      swatch(t), h("span", { class: "theme-name" }, t.name), h("span", { class: "theme-kind" }, t.dark ? "Dark" : "Light"),
      t.hasEffects ? h("span", { class: "theme-fx-badge", title: "This theme has special effects: glass, glow, motion and texture." }, "✨ Effects") : h("span", { class: "theme-plain-badge" }, "Colors only"));
    const editBtn = h("button", {
      type: "button",
      class: "theme-edit-quick",
      "data-edit-key": t.key,
      "aria-label": `Customize ${t.name}`,
      title: `Customize ${t.name} in the Theme Editor…`,
      onclick: (e) => {
        e.stopPropagation();
        dialogRef?.close();
        emit("theme-editor", { from: t.key });
      },
    }, "✎");
    const pin = h("button", {
      type: "button",
      class: "theme-pin",
      "data-pin-key": t.key,
      "aria-pressed": String(pinned),
      "aria-label": pinned ? `Unpin ${t.name} from Favorites` : `Pin ${t.name} to Favorites`,
      title: pinned ? `Pinned to Favorites. Click to unpin ${t.name}.` : `Pin ${t.name} to Favorites so it appears at the top of the gallery and in the Themes menu.`,
      onclick: async (e) => {
        e.stopPropagation();
        const keepPreview = previewKey;
        const nowPinned = await toggleFavoriteTheme(t.key);
        if (!supportsHas) wrap.classList.toggle("is-pinned", nowPinned);
        if (keepPreview !== null) {
          previewKey = keepPreview;
          await applyPalette(keepPreview);
        }
        draw();
        list.querySelector(`.theme-pin[data-pin-key="${t.key}"]`)?.focus({ preventScroll: true });
      },
    }, pinned ? "★" : "☆");
    const wrap = h("div", { class: `theme-card-item${!supportsHas && pinned ? " is-pinned" : ""}` }, b, editBtn, pin);
    return wrap;
  };
  const defaultCard = () => {
    const on = !state.settings.palette;
    return h("div", { class: "theme-card-item" },
      h("button", { type: "button", class: "theme-card", "data-key": "", "aria-pressed": String(on), title: "The standard colors: they follow your computer's light or dark setting, or the Colors choice in Settings.", onclick: () => pick("") },
        defaultSwatch(), h("span", { class: "theme-name" }, "Standard"), h("span", { class: "theme-kind" }, "Light or dark")));
  };

  function draw() {
    const q = search.value.trim().toLowerCase();
    const m = mode.value;
    const grp = groupFilter.value;
    const fx = fxFilter.value;
    for (const btn of catPillButtons) {
      const active = btn.dataset.catPill === grp;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of vibePillButtons) {
      const active = btn.dataset.vibePill === activeVibe;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    const favSet = new Set(favoriteKeys());
    const recKeys = recentKeys();
    const recSet = new Set(recKeys);
    const shown = themes.filter((t) => (m === "all" || (m === "dark") === t.dark)
      && (fx === "any" || (fx === "fx") === !!t.hasEffects)
      && (grp === "all" || (grp === "favorites" ? favSet.has(t.key) : grp === "recent" ? recSet.has(t.key) : t.group === grp))
      && themeMatchesVibe(t, activeVibe)
      && (!q || `${t.name} ${t.group} ${t.key} ${t.description} ${favSet.has(t.key) ? "favorite favorite pinned star" : ""} ${t.hasEffects ? "effects special effects fx glow glass motion" : "plain"}`.toLowerCase().includes(q)));
    lastShown = shown;
    const sections = [];
    const favShown = favoriteKeys().map((k) => shown.find((t) => t.key === k)).filter(Boolean);
    if ((grp === "all" || grp === "favorites") && favShown.length) {
      sections.push(h("section", { class: "theme-section-favorites" }, h("h3", {}, `Favorites (${favShown.length})`), h("div", { class: "theme-grid" }, favShown.map(card))));
    }
    if (grp === "recent") {
      const recShown = recKeys.map((k) => shown.find((t) => t.key === k)).filter(Boolean);
      if (recShown.length) {
        sections.push(h("section", { class: "theme-section-recent" }, h("h3", {}, `Recently used (${recShown.length})`), h("div", { class: "theme-grid" }, recShown.map(card))));
      }
    }
    if (!q && m === "all" && fx !== "fx" && grp === "all" && activeVibe === "all") sections.push(h("section", {}, h("h3", {}, "Default"), h("div", { class: "theme-grid" }, defaultCard())));
    if (grp !== "favorites" && grp !== "recent") {
      for (const group of GROUP_ORDER) {
        const inGroup = shown.filter((t) => t.group === group);
        if (inGroup.length) sections.push(h("section", {}, h("h3", {}, `${group} (${inGroup.length})`), h("div", { class: "theme-grid" }, inGroup.map(card))));
      }
    }
    const emptyMsg = grp === "favorites" && !favSet.size
      ? "No favorite themes yet. Click ☆ on any theme card to pin it here."
      : grp === "recent" && !recSet.size
        ? "No recently used themes yet. Click any theme card to try it."
        : "No theme matches. Try a shorter word or another Color Vibe.";
    list.replaceChildren(...(sections.length ? sections : [h("p", { class: "hint" }, emptyMsg)]));
    const withFx = shown.filter((t) => t.hasEffects).length;
    count.textContent = `${shown.length} of ${themes.length} themes · ${withFx} with special effects ✨, ${shown.length - withFx} plain colors`;
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
  groupFilter.addEventListener("change", draw);
  fxFilter.addEventListener("change", draw);
  draw();
  const dialog = openDialog({
    title: "Themes",
    wide: true,
    body: [
      h("div", { class: "theme-tools" },
        search, mode, groupFilter, fxFilter,
        h("button", {
          type: "button",
          class: "btn theme-random-btn",
          title: "Pick a random theme from the currently shown themes.",
          onclick: async () => {
            const pool = lastShown.length ? lastShown : themes;
            if (!pool.length) return;
            const candidates = pool.filter((t) => t.key !== state.settings.palette);
            const chosen = (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length || pool.length))];
            if (chosen) await pick(chosen.key);
          },
        }, "🎲 Surprise me"),
        h("button", { type: "button", class: "btn", title: "Add weather or particle effects like rain, smoke screen, digital rain, cyber storm or aurora — with Low, Medium and Modern ARM Ultra graphics profiles.", onclick: () => { emit("atmosphere-picker"); } }, "Atmosphere FX…"),
        h("button", { type: "button", class: "btn", title: "Choose a Light theme for daytime and a Dark theme for nighttime so the File Manager switches between them automatically with your computer.", onclick: () => { void showDayNightPairDialog(themes); } }, "Day / Night pair…"),
        h("button", { type: "button", class: "btn", title: "Make your own theme, or start from one of these and change its colors.", onclick: () => { dialog.close(); emit("theme-editor", { from: state.settings.palette || "" }); } }, "Create or edit a theme…")),
      navBar, count, list,
      h("p", { class: "hint" }, "A theme applies as soon as you click it, and is remembered. Click ☆ on any theme to pin it to Favorites, or ✎ to customize its colors and effects. Use Category and Color Vibe pills to filter in one click, or use the arrow keys to preview themes live."),
    ],
    buttons: [{ label: "Done", primary: true, value: true }],
    initialFocus: search,
  });
  dialogRef = dialog;
  dialog.result.then(async (value) => {
    const key = previewKey;
    previewKey = null;
    if (key === null) return;
    if (value === true) await choose(key);
    else await applyPalette(state.settings.palette || "");
  });
}

/** Dialog to configure automatic Day (Light) and Night (Dark) themes that follow OS prefers-color-scheme. */
export async function showDayNightPairDialog(existingThemes) {
  let themes = existingThemes;
  if (!themes) {
    try {
      themes = await themeList();
    } catch (err) {
      toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
      return;
    }
  }
  const lightThemes = themes.filter((t) => !t.dark);
  const darkThemes = themes.filter((t) => t.dark);
  const lightSelect = h("select", { class: "prop-input", "aria-label": "Daytime (Light) theme" },
    h("option", { value: "" }, "Standard light"),
    ...lightThemes.map((t) => h("option", { value: t.key }, t.name)),
  );
  const darkSelect = h("select", { class: "prop-input", "aria-label": "Nighttime (Dark) theme" },
    h("option", { value: "" }, "Standard dark"),
    ...darkThemes.map((t) => h("option", { value: t.key }, t.name)),
  );
  lightSelect.value = state.settings?.preferredLightPalette || "";
  darkSelect.value = state.settings?.preferredDarkPalette || "";
  const body = [
    h("p", { class: "hint" }, "Pick a Light theme for daytime and a Dark theme for nighttime. When \"Follow my computer\" is active, the File Manager switches between your pair automatically."),
    h("div", { class: "theme-daynight-grid" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "☀️ Daytime (Light) theme"), lightSelect),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "🌙 Nighttime (Dark) theme"), darkSelect),
    ),
  ];
  const answer = await openDialog({
    title: "Day / Night theme pair",
    body,
    buttons: [
      { label: "Cancel", value: "cancel" },
      { label: "Clear pair", value: "clear" },
      { label: "Use Day / Night pair", value: "save", primary: true },
    ],
    initialFocus: lightSelect,
  }).result;
  if (answer === "clear") {
    await saveSettings({ preferredLightPalette: "", preferredDarkPalette: "" });
    await applyPalette(state.settings?.palette || "");
    toast("Day / Night theme pair cleared.", { kind: "info" });
  } else if (answer === "save") {
    const light = lightSelect.value;
    const dark = darkSelect.value;
    await saveSettings({ theme: "auto", palette: "", preferredLightPalette: light, preferredDarkPalette: dark });
    await applyPalette("");
    toast("Day / Night theme pair active — following your computer's light and dark schedule.", { kind: "success" });
  }
}

try {
  const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener?.("change", () => {
    if (state.settings?.theme === "auto" && !state.settings?.palette) void applyPalette("");
  });
} catch { /* matchMedia unavailable */ }

on("theme-picker", () => showThemePicker());
on("theme-day-night", () => showDayNightPairDialog());
