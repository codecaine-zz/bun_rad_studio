// Color themes for the page: applying one, and the gallery to choose from. The server turns each theme of the
// SimpleGUI table into this page's color variables (and checks that every text and background pair is readable).
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { currentPath, emit, on, state } from "./state.js";

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

/** Resolves the active 4-Stage Solar Cycle palette (Dawn 5-8, Day 9-16, Dusk 17-20, Midnight 21-4). */
export function resolveSolarPalette(hour = new Date().getHours(), s = state.settings) {
  if (!s?.solarScheduleEnabled) return "";
  const hNum = ((Number(hour) % 24) + 24) % 24;
  if (hNum >= 5 && hNum < 9) return s.solarDawnPalette || s.preferredLightPalette || "";
  if (hNum >= 9 && hNum < 17) return s.solarDayPalette || s.preferredLightPalette || "";
  if (hNum >= 17 && hNum < 21) return s.solarDuskPalette || s.preferredDarkPalette || "";
  return s.solarNightPalette || s.preferredDarkPalette || "";
}

function normalizeFolderKey(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.length > 1 ? trimmed.replace(/[\\/]+$/, "") : trimmed;
}

/** Resolves a per-folder or workspace ancestor theme profile for `folderPath`. */
export function resolveFolderPalette(folderPath = currentPath() || state.cwd || "", s = state.settings) {
  const map = s?.folderThemes;
  if (!map || typeof map !== "object") return "";
  const target = normalizeFolderKey(folderPath);
  if (!target) return "";
  if (typeof map[target] === "string" && map[target]) return map[target];
  let bestPrefix = "";
  let bestKey = "";
  for (const [rawDir, key] of Object.entries(map)) {
    const dir = normalizeFolderKey(rawDir);
    if (!dir || typeof key !== "string" || !key) continue;
    if (target === dir || target.startsWith(`${dir}/`) || target.startsWith(`${dir}\\`)) {
      if (dir.length > bestPrefix.length) {
        bestPrefix = dir;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

/** Assigns or clears (`paletteKey === ""`) a pinned theme for a specific folder path. */
export async function setFolderTheme(folderPath, paletteKey) {
  const dir = normalizeFolderKey(folderPath);
  if (!dir) return;
  const current = { ...(state.settings?.folderThemes ?? {}) };
  if (paletteKey) current[dir] = paletteKey;
  else delete current[dir];
  await saveSettings({ folderThemes: current });
  const activeDir = normalizeFolderKey(currentPath() || state.cwd || "");
  if (activeDir && (activeDir === dir || activeDir.startsWith(`${dir}/`) || activeDir.startsWith(`${dir}\\`))) {
    await applyPalette(paletteKey || state.settings?.palette || "");
  }
}

/** Resolves the paired or solar-scheduled theme key when `theme === "auto"` and no fixed `palette` is forced. */
export function effectiveAutoPalette(dark = isSystemDark(), hour = new Date().getHours()) {
  const s = state.settings;
  if (!s || s.palette) return "";
  if (s.solarScheduleEnabled) {
    const solar = resolveSolarPalette(hour, s);
    if (solar) return solar;
  }
  if (s.theme !== "auto") return "";
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
  const resolvedKey = key || resolveFolderPalette() || effectiveAutoPalette();
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

/** Resolves a template's performance & shader tier ("low", "medium", or "ultra"). */
export function resolveTemplateTier(t) {
  if (t?.tier === "ultra" || t?.tier === "medium" || t?.tier === "low") return t.tier;
  if (!t?.hasEffects) return "low";
  if (t?.atmosphere && t.atmosphere !== "none") return "ultra";
  if (t?.preview?.glow === "plasma" || t?.preview?.glow === "laser") return "ultra";
  return "medium";
}

/** Filters a template by its hardware/visual tier ("all", "ultra", "medium", "low"). */
export function themeMatchesTier(t, tier) {
  if (!tier || tier === "all") return true;
  return resolveTemplateTier(t) === tier;
}

const PHYSICS_ATMO_RE = /tesla|plasma|tokamak|cherenkov|collider|hadron|lorenz|lorentz|ferrofluid|hawking|black_hole|dyson|casimir|alcubierre|superconductor|antimatter|magnetar|soliton|sonolum|fusion|wormhole|quantum|relativ|synchrotron|pulsar|quasar|event_horizon|bose_einstein|tachyon|dirac|schwarzschild|zero_point|higgs|strange_matter|jacobs_ladder|ball_lightning|van_de_graaff/i;

/** Filters a template by its animation / motion profile ("all", "atmosphere", "physics", "spring", "snappy", "calm", "static"). */
export function themeMatchesAnimation(t, anim) {
  if (!anim || anim === "all") return true;
  const motion = t?.motion || (t?.hasEffects ? "calm" : "none");
  const atmo = t?.atmosphere && t.atmosphere !== "none" ? String(t.atmosphere) : "";
  if (anim === "atmosphere") return Boolean(atmo);
  if (anim === "physics") {
    return Boolean(
      (atmo && PHYSICS_ATMO_RE.test(atmo))
      || PHYSICS_ATMO_RE.test(`${t?.key || ""} ${t?.name || ""} ${t?.description || ""}`)
      || t?.preview?.glow === "plasma"
      || t?.preview?.glow === "laser",
    );
  }
  if (anim === "spring") return motion === "spring" || motion === "elastic";
  if (anim === "snappy") return motion === "snappy";
  if (anim === "calm") return motion === "calm" || motion === "cinematic";
  if (anim === "static") return !t?.hasEffects || motion === "none" || motion === "zero";
  return true;
}

/** Filters a template by its surface material / backdrop shader ("all", "liquid", "mica", "frosted", "solid"). */
export function themeMatchesMaterial(t, mat) {
  if (!mat || mat === "all") return true;
  const b = t?.backdropStyle || (t?.hasEffects ? "glass" : "solid");
  if (mat === "liquid") return b === "liquid";
  if (mat === "mica") return b === "mica" || b === "acrylic";
  if (mat === "frosted") return b === "frosted" || b === "glass";
  if (mat === "solid") return !t?.hasEffects || b === "oled" || b === "matte" || b === "solid";
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

/** The theme gallery: search, filter by light or dark, category, template tier, animations, surface material, color vibe or effects, pin favorites, and click a theme to try it. */
export async function showThemePicker() {
  let themes;
  try {
    themes = await themeList();
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const search = h("input", { type: "search", class: "prop-input", placeholder: "Search themes", "aria-label": "Search themes", title: "Type part of a theme's name, like dark, nord, m4, tahoe, tesla, tokamak or windows." });
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
  const tierFilter = h("select", { class: "prop-input", "aria-label": "Filter templates by tier", title: "Filter templates by performance & shader tier: Ultra (M4/RTX & Live FX), Medium (Balanced Glass & Glow), or Low (Zero-GPU Eco Colors)." },
    [
      ["all", "All template tiers"],
      ["ultra", "🚀 Ultra tier (M4 / Live FX)"],
      ["medium", "✨ Medium tier (Balanced Glass)"],
      ["low", "⚡ Low / Eco tier (Colors only)"],
    ].map(([v, l]) => h("option", { value: v }, l)));
  const animFilter = h("select", { class: "prop-input", "aria-label": "Filter templates by animations", title: "Filter templates by live canvas animations, Tesla/Physics simulations, or UI motion curves." },
    [
      ["all", "All animations & motion"],
      ["atmosphere", "🌌 Live Canvas FX"],
      ["physics", "⚡ Tesla & Sci-Fi Physics"],
      ["spring", "🌊 Spring Physics Motion"],
      ["snappy", "⚡ Snappy HUD Motion"],
      ["calm", "🍃 Calm Ambient Drift"],
      ["static", "⏹️ Static (No Motion)"],
    ].map(([v, l]) => h("option", { value: v }, l)));
  const sortFilter = h("select", { class: "prop-input", "aria-label": "Sort templates", title: "Sort templates by default category groups, Ultra tier first, Lightweight Eco tier first, or alphabetically." },
    [
      ["group", "Sort: Default groups"],
      ["ultra-first", "Sort: 🚀 Ultra tier first"],
      ["eco-first", "Sort: ⚡ Low / Eco first"],
      ["name-asc", "Sort: Name (A–Z)"],
    ].map(([v, l]) => h("option", { value: v }, l)));
  let activeVibe = "all";
  let activeMaterial = "all";
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

  const tierPillsDef = [
    ["all", "All Tiers"],
    ["ultra", "🚀 Ultra Tier"],
    ["medium", "✨ Medium / Glass"],
    ["low", "⚡ Low / Eco"],
  ];
  const tierPillButtons = tierPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-tier-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        tierFilter.value = val;
        draw();
      },
    }, label),
  );

  const animPillsDef = [
    ["all", "All Animations"],
    ["atmosphere", "🌌 Live Canvas FX"],
    ["physics", "⚡ Tesla & Physics"],
    ["spring", "🌊 Spring Motion"],
    ["snappy", "⚡ Snappy HUD"],
    ["calm", "🍃 Calm Drift"],
    ["static", "⏹️ Static"],
  ];
  const animPillButtons = animPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-anim-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        animFilter.value = val;
        draw();
      },
    }, label),
  );

  const materialPillsDef = [
    ["all", "All Surfaces"],
    ["liquid", "💧 Liquid Glass"],
    ["mica", "🪟 Mica & Acrylic"],
    ["frosted", "❄️ Frosted Glass"],
    ["solid", "🧱 Solid & OLED"],
  ];
  const materialPillButtons = materialPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-material-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        activeMaterial = val;
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

  const hw = probeClientHardware();
  const recommendedTier = hw.tier === "ultra" ? "ultra" : hw.tier === "low" ? "low" : "medium";
  const hwMatchBtn = h("button", {
    type: "button",
    class: "theme-filter-pill",
    "data-hw-recommend": recommendedTier,
    title: `Filter templates tailored for your detected hardware tier (${recommendedTier.toUpperCase()})`,
    onclick: () => {
      tierFilter.value = recommendedTier;
      draw();
    },
  }, `🎯 For My System (${recommendedTier.toUpperCase()})`);

  const resetFiltersBtn = h("button", {
    type: "button",
    class: "theme-filter-pill theme-reset-pill",
    "data-reset-filters": "true",
    title: "Reset all category, tier, animation, material, and color vibe filters",
    onclick: () => {
      search.value = "";
      mode.value = "all";
      groupFilter.value = "all";
      fxFilter.value = "any";
      tierFilter.value = "all";
      animFilter.value = "all";
      sortFilter.value = "group";
      activeVibe = "all";
      activeMaterial = "all";
      draw();
    },
  }, "↺ Reset Filters");

  const navBar = h("div", { class: "theme-nav-bar", role: "region", "aria-label": "Quick theme filters" },
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Category"), ...catPillButtons),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Template Tier"), ...tierPillButtons, hwMatchBtn),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Animations"), ...animPillButtons),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Surface Shader"), ...materialPillButtons),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Color Vibe"), ...vibePillButtons, resetFiltersBtn),
  );

  const card = (t) => {
    const on = state.settings.palette === t.key;
    const pinned = isFavoriteTheme(t.key);
    const tier = resolveTemplateTier(t);
    const tierLabel = tier === "ultra" ? "🚀 Ultra" : tier === "medium" ? "✨ Medium" : "⚡ Low";
    const animBadge = t.atmosphere && t.atmosphere !== "none"
      ? h("span", { class: "theme-anim-badge", "data-anim-badge": t.atmosphere, title: `Built-in live canvas animation: ${t.atmosphere}` }, "🌌 Live FX")
      : t.hasEffects && t.motion && t.motion !== "none" && t.motion !== "zero"
        ? h("span", { class: "theme-anim-badge", "data-anim-badge": t.motion, title: `UI motion profile: ${t.motion}` }, t.motion === "spring" ? "🌊 Spring" : t.motion === "snappy" ? "⚡ Snappy" : "🍃 Calm")
        : null;
    const b = h("button", { type: "button", class: "theme-card", "data-key": t.key, "data-tier": tier, "aria-pressed": String(on), title: `${t.name}: ${t.description}`, onclick: () => pick(t.key) },
      swatch(t), h("span", { class: "theme-name" }, t.name), h("span", { class: "theme-kind" }, t.dark ? "Dark" : "Light"),
      h("span", { class: "theme-card-badges" },
        t.hasEffects ? h("span", { class: "theme-fx-badge", title: "This theme has special effects: glass, glow, motion and texture." }, "✨ Effects") : h("span", { class: "theme-plain-badge" }, "Colors only"),
        h("span", { class: `theme-tier-badge theme-tier-${tier}`, "data-tier-badge": tier, title: `Template Tier: ${tierLabel}` }, tierLabel),
        animBadge,
      ));
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

  const TIER_RANK = { ultra: 3, medium: 2, low: 1 };

  function draw() {
    const q = search.value.trim().toLowerCase();
    const m = mode.value;
    const grp = groupFilter.value;
    const fx = fxFilter.value;
    const tier = tierFilter.value;
    const anim = animFilter.value;
    const sortBy = sortFilter.value;
    for (const btn of catPillButtons) {
      const active = btn.dataset.catPill === grp;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of tierPillButtons) {
      const active = btn.dataset.tierPill === tier;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of animPillButtons) {
      const active = btn.dataset.animPill === anim;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of materialPillButtons) {
      const active = btn.dataset.materialPill === activeMaterial;
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
      && themeMatchesTier(t, tier)
      && themeMatchesAnimation(t, anim)
      && themeMatchesMaterial(t, activeMaterial)
      && themeMatchesVibe(t, activeVibe)
      && (!q || `${t.name} ${t.group} ${t.key} ${t.description} ${resolveTemplateTier(t)} ${t.motion || ""} ${t.atmosphere || ""} ${t.backdropStyle || ""} ${favSet.has(t.key) ? "favorite favorite pinned star" : ""} ${t.hasEffects ? "effects special effects fx glow glass motion" : "plain"}`.toLowerCase().includes(q)));
    if (sortBy === "ultra-first") {
      shown.sort((a, b) => (TIER_RANK[resolveTemplateTier(b)] - TIER_RANK[resolveTemplateTier(a)]) || a.name.localeCompare(b.name));
    } else if (sortBy === "eco-first") {
      shown.sort((a, b) => (TIER_RANK[resolveTemplateTier(a)] - TIER_RANK[resolveTemplateTier(b)]) || a.name.localeCompare(b.name));
    } else if (sortBy === "name-asc") {
      shown.sort((a, b) => a.name.localeCompare(b.name));
    }
    lastShown = shown;
    const sections = [];
    const favShown = favoriteKeys().map((k) => shown.find((t) => t.key === k)).filter(Boolean);
    if ((grp === "all" || grp === "favorites") && favShown.length && sortBy === "group") {
      sections.push(h("section", { class: "theme-section-favorites" }, h("h3", {}, `Favorites (${favShown.length})`), h("div", { class: "theme-grid" }, favShown.map(card))));
    }
    if (grp === "recent") {
      const recShown = recKeys.map((k) => shown.find((t) => t.key === k)).filter(Boolean);
      if (recShown.length) {
        sections.push(h("section", { class: "theme-section-recent" }, h("h3", {}, `Recently used (${recShown.length})`), h("div", { class: "theme-grid" }, recShown.map(card))));
      }
    }
    if (!q && m === "all" && fx !== "fx" && grp === "all" && activeVibe === "all" && activeMaterial === "all" && tier === "all" && anim === "all" && sortBy === "group") {
      sections.push(h("section", {}, h("h3", {}, "Default"), h("div", { class: "theme-grid" }, defaultCard())));
    }
    if (grp !== "favorites" && grp !== "recent") {
      if (sortBy !== "group") {
        if (shown.length) {
          const sortHeading = sortBy === "ultra-first" ? "Sorted by Tier (🚀 Ultra First)" : sortBy === "eco-first" ? "Sorted by Tier (⚡ Low / Eco First)" : "All Matching Themes (A–Z)";
          sections.push(h("section", {}, h("h3", {}, `${sortHeading} (${shown.length})`), h("div", { class: "theme-grid" }, shown.map(card))));
        }
      } else {
        for (const group of GROUP_ORDER) {
          const inGroup = shown.filter((t) => t.group === group);
          if (inGroup.length) sections.push(h("section", {}, h("h3", {}, `${group} (${inGroup.length})`), h("div", { class: "theme-grid" }, inGroup.map(card))));
        }
      }
    } else if (grp === "favorites" && sortBy !== "group" && favShown.length) {
      sections.push(h("section", { class: "theme-section-favorites" }, h("h3", {}, `Favorites (${favShown.length})`), h("div", { class: "theme-grid" }, favShown.map(card))));
    }
    const emptyMsg = grp === "favorites" && !favSet.size
      ? "No favorite themes yet. Click ☆ on any theme card to pin it here."
      : grp === "recent" && !recSet.size
        ? "No recently used themes yet. Click any theme card to try it."
        : "No theme matches. Click ↺ Reset Filters or try another Template Tier, Animation, Surface Shader, or Color Vibe.";
    list.replaceChildren(...(sections.length ? sections : [h("p", { class: "hint" }, emptyMsg)]));
    const withFx = shown.filter((t) => t.hasEffects).length;
    count.textContent = `${shown.length} of ${themes.length} themes · ${withFx} with special effects ✨, ${shown.length - withFx} plain colors`;
  }
  // Keyboard: the arrow keys, PageUp/PageDown, Home, End, and [ / ] move between cards and show each theme straight away (not saved yet).
  // Enter or Space keeps the focused theme, Done keeps the one on show, and Escape goes back to the saved theme.
  let previewKey = null;
  const cards = () => [...list.querySelectorAll(".theme-card")];
  const preview = debounce((key) => { if (previewKey === key) applyPalette(key); }, 20);
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
    if (!all.length) return from;
    const i = Math.max(0, all.indexOf(from));
    if (key === "Home") return all[0];
    if (key === "End") return all.at(-1);
    if (key === "ArrowLeft") return all[(i - 1 + all.length) % all.length];
    if (key === "ArrowRight") return all[(i + 1) % all.length];
    if (key === "PageUp") return all[Math.max(0, i - 8)];
    if (key === "PageDown") return all[Math.min(all.length - 1, i + 8)];
    // Up and Down: the nearest card in the row above or below, across group headings too.
    const r = from.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
    const down = key === "ArrowDown";
    if (r.width > 0 && r.height > 0) {
      const x = r.left + r.width / 2;
      const rows = all.map((c) => [c, c.getBoundingClientRect()]).filter(([, b]) => (down ? b.top > r.top + 4 : b.top < r.top - 4));
      if (rows.length) {
        const rowTop = down ? Math.min(...rows.map(([, b]) => b.top)) : Math.max(...rows.map(([, b]) => b.top));
        const row = rows.filter(([, b]) => Math.abs(b.top - rowTop) < 4);
        return row.reduce((best, cur) => (Math.abs(cur[1].left + cur[1].width / 2 - x) < Math.abs(best[1].left + best[1].width / 2 - x) ? cur : best))[0];
      }
    }
    return all[Math.max(0, Math.min(all.length - 1, i + (down ? 4 : -4)))];
  };
  const focusAndPreviewCard = (targetCard) => {
    if (!targetCard) return;
    const key = targetCard.dataset.key ?? "";
    previewKey = key;
    void applyPalette(key);
    targetCard.focus({ preventScroll: true });
    targetCard.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  const stepThemeByDelta = (delta) => {
    const all = cards();
    if (!all.length) return;
    const currentKey = previewKey ?? state.settings.palette ?? "";
    const curIdx = all.findIndex((c) => (c.dataset.key ?? "") === currentKey);
    const nextIdx = curIdx < 0 ? (delta > 0 ? 0 : all.length - 1) : (curIdx + delta + all.length) % all.length;
    focusAndPreviewCard(all[nextIdx]);
  };
  list.addEventListener("keydown", (e) => {
    const from = e.target.closest?.(".theme-card");
    if (!from || e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) return;
    e.preventDefault();
    focusAndPreviewCard(step(from, e.key));
  });
  const enterCards = (e) => {
    if (e.key !== "ArrowDown" || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    focusAndPreviewCard(list.querySelector('.theme-card[aria-pressed="true"]') ?? cards()[0]);
  };
  search.addEventListener("keydown", enterCards);

  search.addEventListener("input", debounce(draw, 120));
  mode.addEventListener("change", draw);
  groupFilter.addEventListener("change", draw);
  fxFilter.addEventListener("change", draw);
  tierFilter.addEventListener("change", draw);
  animFilter.addEventListener("change", draw);
  sortFilter.addEventListener("change", draw);
  draw();
  const activeFolderPath = normalizeFolderKey(currentPath() || state.cwd || "");
  const updatePinFolderLabel = (btn) => {
    if (!btn) return;
    const curFolder = normalizeFolderKey(currentPath() || state.cwd || "");
    const pinnedKey = curFolder ? state.settings?.folderThemes?.[curFolder] : "";
    btn.textContent = pinnedKey ? `📁 Folder Pinned (${pinnedKey})` : "📁 Pin to Folder";
    btn.classList.toggle("is-active", Boolean(pinnedKey));
  };
  const pinFolderBtn = h("button", {
    type: "button",
    class: "btn theme-pin-folder-btn",
    "data-pin-folder": activeFolderPath || "/",
    title: "Pin the active theme to the current workspace folder (and its subfolders), or click again to unpin.",
    onclick: async () => {
      const targetDir = normalizeFolderKey(currentPath() || state.cwd || "/");
      const currentKey = previewKey ?? state.settings?.palette ?? "";
      const existing = state.settings?.folderThemes?.[targetDir] || "";
      if (existing && (!currentKey || existing === currentKey)) {
        await setFolderTheme(targetDir, "");
        toast(`Unpinned folder theme from ${targetDir}.`, { kind: "info" });
      } else if (currentKey) {
        await setFolderTheme(targetDir, currentKey);
        toast(`Pinned theme "${currentKey}" to folder ${targetDir}.`, { kind: "success" });
      } else {
        toast("Pick a theme first to pin it to this folder.", { kind: "info" });
      }
      updatePinFolderLabel(pinFolderBtn);
    },
  }, "📁 Pin to Folder");
  updatePinFolderLabel(pinFolderBtn);

  const dialog = openDialog({
    title: "Themes",
    wide: true,
    body: [
      h("div", { class: "theme-tools" },
        search, mode, groupFilter, fxFilter, tierFilter, animFilter, sortFilter,
        h("button", {
          type: "button",
          class: "btn theme-step-btn",
          "data-theme-step": "-1",
          title: "Preview previous theme ( [ or Left Arrow )",
          onclick: () => stepThemeByDelta(-1),
        }, "◀ Prev"),
        h("button", {
          type: "button",
          class: "btn theme-step-btn",
          "data-theme-step": "1",
          title: "Preview next theme ( ] or Right Arrow )",
          onclick: () => stepThemeByDelta(1),
        }, "Next ▶"),
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
            updatePinFolderLabel(pinFolderBtn);
          },
        }, "🎲 Surprise me"),
        h("button", {
          type: "button",
          class: "btn theme-compare-btn",
          "data-compare-themes": "true",
          title: "Compare any two themes side-by-side with a live interactive split-screen slider and shader/tier specification table.",
          onclick: () => {
            const firstKey = previewKey || state.settings.palette || lastShown[0]?.key || themes[0]?.key || "";
            const secondCandidate = (lastShown.length > 1 ? lastShown : themes).find((t) => t.key !== firstKey);
            void showThemeCompareDialog(themes, firstKey, secondCandidate?.key || firstKey);
          },
        }, "⚖️ Compare 2 Themes…"),
        pinFolderBtn,
        h("button", { type: "button", class: "btn", title: "Add weather or particle effects like rain, smoke screen, digital rain, cyber storm or aurora — with Low, Medium and Modern ARM Ultra graphics profiles.", onclick: () => { emit("atmosphere-picker"); } }, "Atmosphere FX…"),
        h("button", { type: "button", class: "btn", title: "Choose a Light theme for daytime, a Dark theme for nighttime, or a 4-stage Solar Cycle schedule.", onclick: () => { void showDayNightPairDialog(themes); } }, "Day / Night pair…"),
        h("button", { type: "button", class: "btn", title: "Make your own theme, or start from one of these and change its colors.", onclick: () => { dialog.close(); emit("theme-editor", { from: state.settings.palette || "" }); } }, "Create or edit a theme…")),
      navBar, count, list,
      h("p", { class: "hint" }, "A theme applies as soon as you click it, and is remembered. Use ← ↑ ↓ →, PgUp/PgDn, or [ / ] to rapid-preview themes live; press Enter to keep the focused theme, ☆ to pin to Favorites, ✎ to customize, ⚖️ Compare 2 Themes to inspect side-by-side, or 📁 Pin to Folder."),
    ],
    buttons: [{ label: "Done", primary: true, value: true }],
    initialFocus: search,
  });
  dialogRef = dialog;
  const dialogWrap = list.closest(".modal-backdrop") || list.parentElement;
  dialogWrap?.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target === search) return;
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      stepThemeByDelta(e.key === "]" ? 1 : -1);
    }
  });
  dialog.result.then(async (value) => {
    const key = previewKey;
    previewKey = null;
    if (key === null) return;
    if (value === true) await choose(key);
    else await applyPalette(state.settings.palette || "");
  });
}

function buildComparePane(theme, sideLabel) {
  if (!theme) return h("div", { class: "theme-compare-card" }, "No theme selected");
  const [bg, panel, accent, text] = theme.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
  const tier = resolveTemplateTier(theme);
  const tierBadge = tier === "ultra" ? "🚀 Ultra Tier" : tier === "medium" ? "✨ Medium Tier" : "⚡ Low / Eco Tier";
  const animDesc = theme.atmosphere && theme.atmosphere !== "none"
    ? `🌌 Live FX (${theme.atmosphere})`
    : theme.hasEffects && theme.motion && theme.motion !== "none"
      ? `🌊 Motion (${theme.motion})`
      : "⏹️ Static";
  return h("div", {
    class: "theme-compare-mockup",
    style: `background:${bg};color:${text};border-color:${accent}`,
  },
    h("div", { class: "theme-compare-mockup-bar", style: `background:${panel};border-bottom:1px solid ${accent}44` },
      h("span", { class: "theme-compare-side-tag", style: `background:${accent};color:${bg}` }, sideLabel),
      h("strong", {}, theme.name),
      h("span", { class: "theme-compare-tier-tag" }, tierBadge),
    ),
    h("div", { class: "theme-compare-mockup-body" },
      h("div", { class: "theme-compare-mockup-sidebar", style: `background:${panel}` },
        h("div", { class: "theme-compare-chip", style: `background:${accent}28;color:${accent};border:1px solid ${accent}66` }, "📁 Workspace"),
        h("div", { class: "theme-compare-chip" }, "⚡ Shaders & FX"),
        h("div", { class: "theme-compare-chip" }, animDesc),
      ),
      h("div", { class: "theme-compare-mockup-content" },
        h("div", { class: "theme-compare-card-sample", style: `background:${panel};border:1px solid ${accent}55` },
          h("div", { style: `font-weight:600;color:${accent}` }, `${theme.group} · ${theme.dark ? "Dark" : "Light"}`),
          h("div", { style: "font-size:11px;opacity:0.86;margin-top:4px" }, theme.description || "Custom color and surface shader profile."),
        ),
        h("div", { class: "theme-compare-swatches" },
          ...[bg, panel, accent, text].map((hex) =>
            h("span", { class: "theme-compare-hex-pill", style: `background:${hex};color:${hex === bg || hex === panel ? text : bg};border:1px solid ${text}33` }, hex)),
        ),
      ),
    ),
  );
}

/** Side-by-Side Split-Screen Theme Comparator dialog with interactive wipe slider and spec matrix. */
export async function showThemeCompareDialog(existingThemes, initialA = "", initialB = "") {
  let themes = existingThemes;
  if (!themes) {
    try {
      themes = await themeList();
    } catch (err) {
      toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
      return;
    }
  }
  if (!themes?.length) return;
  const findOrFirst = (k, fallbackIdx = 0) => themes.find((t) => t.key === k) || themes[Math.min(fallbackIdx, themes.length - 1)];
  let themeA = findOrFirst(initialA || state.settings?.palette, 0);
  let themeB = findOrFirst(initialB, themes.length > 1 ? 1 : 0);
  if (themeB.key === themeA.key && themes.length > 1) {
    themeB = themes.find((t) => t.key !== themeA.key) || themeA;
  }

  const selectA = h("select", { class: "prop-input", "aria-label": "Left theme (Theme A)", "data-compare-select": "a" },
    themes.map((t) => h("option", { value: t.key }, `${t.name} (${resolveTemplateTier(t).toUpperCase()})`)));
  const selectB = h("select", { class: "prop-input", "aria-label": "Right theme (Theme B)", "data-compare-select": "b" },
    themes.map((t) => h("option", { value: t.key }, `${t.name} (${resolveTemplateTier(t).toUpperCase()})`)));
  selectA.value = themeA.key;
  selectB.value = themeB.key;

  const paneA = h("div", { class: "theme-compare-pane theme-compare-pane-a", "data-compare-pane": "a" });
  const paneB = h("div", { class: "theme-compare-pane theme-compare-pane-b", "data-compare-pane": "b" });
  const stage = h("div", { class: "theme-compare-stage", style: "--compare-split: 50%" }, paneA, paneB);
  const splitSlider = h("input", {
    type: "range",
    class: "theme-compare-slider",
    "aria-label": "Split comparison wipe position",
    min: "10",
    max: "90",
    value: "50",
    oninput: () => {
      stage.style.setProperty("--compare-split", `${splitSlider.value}%`);
    },
  });
  const specTable = h("table", { class: "theme-compare-table", "aria-label": "Side-by-side theme specification table" });

  const renderComparison = () => {
    themeA = findOrFirst(selectA.value, 0);
    themeB = findOrFirst(selectB.value, 1);
    paneA.replaceChildren(buildComparePane(themeA, "A · Left"));
    paneB.replaceChildren(buildComparePane(themeB, "B · Right"));
    const rows = [
      ["Template Tier", resolveTemplateTier(themeA).toUpperCase(), resolveTemplateTier(themeB).toUpperCase()],
      ["Category", themeA.group, themeB.group],
      ["Polarity", themeA.dark ? "🌙 Dark" : "☀️ Light", themeB.dark ? "🌙 Dark" : "☀️ Light"],
      ["Surface Shader", themeA.backdropStyle || themeA.preview?.backdrop || (themeA.hasEffects ? "glass" : "solid"), themeB.backdropStyle || themeB.preview?.backdrop || (themeB.hasEffects ? "glass" : "solid")],
      ["Glow & Border", `${themeA.preview?.glow || "none"} / ${themeA.preview?.border || "solid"}`, `${themeB.preview?.glow || "none"} / ${themeB.preview?.border || "solid"}`],
      ["Live Canvas FX", themeA.atmosphere && themeA.atmosphere !== "none" ? `🌌 ${themeA.atmosphere}` : "None", themeB.atmosphere && themeB.atmosphere !== "none" ? `🌌 ${themeB.atmosphere}` : "None"],
      ["Motion Profile", themeA.motion || (themeA.hasEffects ? "smooth" : "static"), themeB.motion || (themeB.hasEffects ? "smooth" : "static")],
    ];
    specTable.replaceChildren(
      h("thead", {}, h("tr", {}, h("th", {}, "Specification"), h("th", {}, `A: ${themeA.name}`), h("th", {}, `B: ${themeB.name}`))),
      h("tbody", {}, ...rows.map(([label, valA, valB]) =>
        h("tr", { class: valA !== valB ? "is-diff" : "" },
          h("td", { class: "spec-name" }, label),
          h("td", {}, valA),
          h("td", {}, valB),
        ))),
    );
  };

  selectA.addEventListener("change", renderComparison);
  selectB.addEventListener("change", renderComparison);
  renderComparison();

  const applySelected = async (key) => {
    await saveSettings({ palette: key, recentPalettes: [key, ...(state.settings.recentPalettes ?? []).filter((k) => k !== key)].slice(0, 12) });
    const name = await applyPalette(key);
    if (name) toast(`Theme: ${name}`);
  };

  const dlg = openDialog({
    title: "Compare themes side-by-side",
    wide: true,
    body: [
      h("div", { class: "theme-compare-controls" },
        h("label", { class: "field" }, h("span", { class: "field-label" }, "◀ Left Theme (A)"), selectA),
        h("button", {
          type: "button",
          class: "btn",
          "data-swap-compare": "true",
          title: "Swap Left (A) and Right (B) themes",
          onclick: () => {
            const tmp = selectA.value;
            selectA.value = selectB.value;
            selectB.value = tmp;
            renderComparison();
          },
        }, "⇄ Swap A / B"),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "Right Theme (B) ▶"), selectB),
      ),
      h("div", { class: "theme-compare-stage-wrap" },
        stage,
        h("label", { class: "theme-compare-slider-row" },
          h("span", { class: "hint" }, "Drag split-screen wipe slider:"),
          splitSlider,
        ),
      ),
      specTable,
      h("div", { class: "theme-compare-actions" },
        h("button", {
          type: "button",
          class: "btn",
          "data-apply-compare": "a",
          onclick: async () => {
            await applySelected(selectA.value);
            dlg.close("a");
          },
        }, "Apply Left Theme (A)"),
        h("button", {
          type: "button",
          class: "btn",
          "data-apply-compare": "b",
          onclick: async () => {
            await applySelected(selectB.value);
            dlg.close("b");
          },
        }, "Apply Right Theme (B)"),
      ),
    ],
    buttons: [{ label: "Close", primary: true, value: "close" }],
    initialFocus: selectA,
  });
  return dlg.result;
}

/** Dialog to configure automatic Day (Light) and Night (Dark) themes + 4-Stage Solar Cycle Schedule. */
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

  const makeSolarSelect = (stage, label, defaultLabel) => {
    const sel = h("select", { class: "prop-input", "aria-label": label, "data-solar-stage": stage },
      h("option", { value: "" }, defaultLabel),
      ...themes.map((t) => h("option", { value: t.key }, `${t.name} (${t.dark ? "Dark" : "Light"})`)),
    );
    return sel;
  };
  const solarEnabled = h("input", {
    type: "checkbox",
    "data-solar-enabled": "true",
    "aria-label": "Enable 4-stage Solar Cycle clock schedule",
  });
  solarEnabled.checked = Boolean(state.settings?.solarScheduleEnabled);
  const dawnSelect = makeSolarSelect("dawn", "Dawn (05:00 – 08:59) theme", "Follow Daytime (Light) theme");
  const daySelect = makeSolarSelect("day", "Solar Day (09:00 – 16:59) theme", "Follow Daytime (Light) theme");
  const duskSelect = makeSolarSelect("dusk", "Golden Dusk (17:00 – 20:59) theme", "Follow Nighttime (Dark) theme");
  const nightSelect = makeSolarSelect("night", "Deep Midnight (21:00 – 04:59) theme", "Follow Nighttime (Dark) theme");
  dawnSelect.value = state.settings?.solarDawnPalette || "";
  daySelect.value = state.settings?.solarDayPalette || "";
  duskSelect.value = state.settings?.solarDuskPalette || "";
  nightSelect.value = state.settings?.solarNightPalette || "";

  const pickValidKey = (candidates, fallbackPool) => {
    for (const c of candidates) {
      if (themes.some((t) => t.key === c)) return c;
    }
    return fallbackPool[0]?.key || "";
  };

  const presetBtn = h("button", {
    type: "button",
    class: "btn",
    "data-solar-preset": "scifi",
    title: "Automatically populate Dawn, Solar Day, Golden Dusk, and Deep Midnight with curated themes.",
    onclick: () => {
      solarEnabled.checked = true;
      dawnSelect.value = pickValidKey(["van_de_graaff_day", "sakura_glass", "liquid_metal_light", "catppuccin_latte"], lightThemes);
      daySelect.value = pickValidKey(["cern_control_day", "liquid_metal_light", "daylight_hud", "github_light"], lightThemes);
      duskSelect.value = pickValidKey(["tokamak_fusion", "dyson_megastructure", "dracula", "nord"], darkThemes);
      nightSelect.value = pickValidKey(["tesla_coil_plasma", "hawking_horizon", "m4_space_black", "nord"], darkThemes);
    },
  }, "✨ Auto-Fill Sci-Fi Solar Cycle");

  const body = [
    h("p", { class: "hint" }, "Pick a Light theme for daytime and a Dark theme for nighttime. When \"Follow my computer\" is active, the File Manager switches between your pair automatically."),
    h("div", { class: "theme-daynight-grid" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "☀️ Daytime (Light) theme"), lightSelect),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "🌙 Nighttime (Dark) theme"), darkSelect),
    ),
    h("div", { class: "theme-solar-section" },
      h("div", { class: "theme-solar-header" },
        h("label", { class: "theme-solar-toggle" },
          solarEnabled,
          h("span", {}, "🕰️ Enable 4-Stage Solar Cycle Schedule (Dawn / Day / Dusk / Midnight)"),
        ),
        presetBtn,
      ),
      h("div", { class: "theme-solar-grid" },
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🌅 Dawn (05:00 – 08:59)"), dawnSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "☀️ Solar Day (09:00 – 16:59)"), daySelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🌆 Golden Dusk (17:00 – 20:59)"), duskSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🌌 Deep Midnight (21:00 – 04:59)"), nightSelect),
      ),
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
    await saveSettings({
      preferredLightPalette: "",
      preferredDarkPalette: "",
      solarScheduleEnabled: false,
      solarDawnPalette: "",
      solarDayPalette: "",
      solarDuskPalette: "",
      solarNightPalette: "",
    });
    await applyPalette(state.settings?.palette || "");
    toast("Day / Night theme pair and Solar Cycle cleared.", { kind: "info" });
  } else if (answer === "save") {
    const light = lightSelect.value;
    const dark = darkSelect.value;
    await saveSettings({
      theme: "auto",
      palette: "",
      preferredLightPalette: light,
      preferredDarkPalette: dark,
      solarScheduleEnabled: Boolean(solarEnabled.checked),
      solarDawnPalette: dawnSelect.value,
      solarDayPalette: daySelect.value,
      solarDuskPalette: duskSelect.value,
      solarNightPalette: nightSelect.value,
    });
    await applyPalette("");
    toast(solarEnabled.checked ? "4-Stage Solar Cycle schedule active." : "Day / Night theme pair active — following your computer's light and dark schedule.", { kind: "success" });
  }
}

try {
  const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener?.("change", () => {
    if (state.settings?.theme === "auto" && !state.settings?.palette) void applyPalette("");
  });
} catch { /* matchMedia unavailable */ }

on("view", () => {
  const map = state.settings?.folderThemes;
  if (!map || typeof map !== "object" || !Object.keys(map).length) return;
  const folderKey = resolveFolderPalette();
  const target = folderKey || state.settings?.palette || "";
  if ((document.documentElement.dataset.palette || "") !== (target || effectiveAutoPalette())) {
    void applyPalette(target);
  }
});
on("theme-picker", () => showThemePicker());
on("theme-day-night", () => showDayNightPairDialog());
on("theme-compare", (detail) => showThemeCompareDialog(undefined, detail?.a || "", detail?.b || ""));
