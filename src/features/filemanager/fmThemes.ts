/**
 * Color themes for the File Manager page. They come from the same table the SimpleGUI apps use, so every theme
 * there can be picked here. Each one is turned into the page's own color variables, and every text and background
 * pair is nudged until it passes the contrast checks that tests/file_manager_themes.test.ts runs on all of them.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import type { SimpleGUITheme } from "../../simplegui";
import { SIMPLEGUI_THEMES } from "../../shared/simpleguiThemes";
import {
  FX_THEME_KEYS,
  FX_FALLBACK_THEMES,
  detectThemeHardware,
  fxCssVars,
  fxRootAttrs,
  getFallbackThemeKey,
  glassReport,
  srgbToDisplayP3,
  type FxBorder,
  type FxGlow,
  type FxHardwareInput,
  type FxHardwareProfile,
  type FxMode,
  type FxRadius,
  type ThemeFx,
} from "../../shared/fxThemes";
import { OS_THEME_KEYS, RARE_OS_THEME_KEYS } from "../../shared/osThemes";
import {
  buildSemanticPalette,
  contrastRatio,
  overridesForTheme,
  parseColor,
  toHex,
} from "../../shared/themeSemantic";
import { FmError } from "./fmPaths";
import {
  absolutePath,
  assertCreatable,
  type FmContext,
  type FmHandler,
} from "./fmCore";
import {
  deleteCustom,
  encodeThemePackShareCode,
  encodeThemeShareCode,
  exportTheme,
  exportThemeCss,
  exportThemePack,
  importThemePack,
  importThemePackWithReport,
  inspectBulkThemeImport,
  isCustomKey,
  loadCustom,
  parseShared,
  sanitizeCustomCss,
  saveCustom,
  toSimpleTheme,
  validateCustomVars,
  validateDraft,
  type BulkImportOptions,
  type CustomTheme,
  type ThemeDraft,
} from "./fmThemeStore";
import {
  FM_BUILTIN_MASTER_FALLBACKS,
  FM_BUILTIN_MASTER_GROUPS,
  FM_BUILTIN_MASTER_HARDWARE_TIERS,
  FM_BUILTIN_MASTER_THEME_SPECS,
  FM_BUILTIN_MASTER_THEMES,
  type HardwareTier,
} from "./fmMasterCustomThemes";
import {
  DEFAULT_FAVORITE_THEMES,
  DEFAULT_FAVORITE_THEME_IDS,
} from "./fmSettings";

export {
  DEFAULT_FAVORITE_THEMES,
  DEFAULT_FAVORITE_THEME_IDS,
  FM_BUILTIN_MASTER_THEME_SPECS,
  FM_BUILTIN_MASTER_THEMES,
  type HardwareTier,
};

type RGB = [number, number, number];

const allBuiltinThemes = (): Record<string, SimpleGUITheme> => ({
  ...SIMPLEGUI_THEMES,
  ...FM_BUILTIN_MASTER_THEMES,
});

/** Category group label used to organize themes in the File Manager theme picker. */
export type ThemeGroup =
  | "My themes"
  | "Futuristic"
  | "Linux"
  | "Windows"
  | "macOS"
  | "Rare and beloved systems"
  | "Editors and classics";

/** Miniature card preview tokens (surface colors, border style, corner radius, folder tint, and glow) for a theme. */
export interface ThemePreview {
  bg: string;
  bg2?: string;
  bg3?: string;
  panel: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  selected: string;
  selectedText: string;
  folderColor?: string;
  folderTab?: string;
  folderGlow?: string;
  radius: FxRadius;
  glow: FxGlow;
  glowColor: string;
  borderStyle: FxBorder;
}

/** WCAG contrast ratio and grade for a specific foreground/background color pair in a theme. */
export interface ThemeContrastItem {
  pair: string;
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  grade: "AAA" | "AA" | "AA Large";
}

/** Hardware/visual complexity tier of a theme (`"low"`, `"medium"`, or `"ultra"`). */
export type ThemeTier = "low" | "medium" | "ultra";

/** Catalog metadata and preview tokens describing a built-in or custom File Manager theme. */
export interface ThemeSummary {
  key: string;
  name: string;
  description: string;
  dark: boolean;
  group: ThemeGroup;
  /** Background, panel, accent and text, for the little preview. */
  swatch: [string, string, string, string];
  /** Richer tokens for the miniature window preview card. */
  preview: ThemePreview;
  /** True when the theme has special effects (glass, glow, motion, texture), not just colors. */
  hasEffects: boolean;
  /** Template hardware/visual tier: low (eco colors), medium (balanced glass/glow), or ultra (M4/RTX shaders & live atmosphere). */
  tier: ThemeTier;
  /** Fine-grained 4-level hardware budget classification ("low", "medium", "high", "ultra"). */
  hardwareTier?: HardwareTier;
  /** UI motion profile of the template ("none", "calm", "spring", "snappy", "elastic", "cinematic", "zero"). */
  motion: string;
  /** Built-in live atmospheric/physics canvas animation ID, if any. */
  atmosphere?: string;
  /** Interactive cursor lighting effect, if any. */
  cursorEffect?: string;
  /** Surface backdrop shader style, if any. */
  backdropStyle?: string;
  /** Built-in File Manager UI element shader (e.g., "fire_folders", "slime_drip", "storm_wind"), if any. */
  uiElementFx?: string;
  /** Built-in File Manager custom icon pack style (e.g., "inferno", "slime", "storm_tempest"), if any. */
  iconPackStyle?: string;
  /** Lightweight non-FX fallback theme key when the system cannot sustain GPU glass/glow shaders. */
  fallbackKey?: string;
  /** Display name of the lightweight non-FX fallback theme. */
  fallbackName?: string;
}

/** Computed CSS custom properties, contrast telemetry, readability notes, and optional FX attributes for a theme. */
export interface ThemeVars {
  scheme: "light" | "dark";
  vars: Record<string, string>;
  /** Plain-words notes about colors that were changed to keep the text readable. */
  notes: string[];
  /** WCAG contrast telemetry for key foreground/surface pairs. */
  contrast: ThemeContrastItem[];
  effects?: { css: string; attrs: Record<string, string>; customCss?: string };
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const srgbToLinear = (u: number) =>
  u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (u: number) =>
  u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055;

function rgbToOklab([r8, g8, b8]: RGB): [number, number, number] {
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: [number, number, number]): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [
    clampByte(linearToSrgb(clamp01(r)) * 255),
    clampByte(linearToSrgb(clamp01(g)) * 255),
    clampByte(linearToSrgb(clamp01(bl)) * 255),
  ];
}

/** Perceptual OKLab interpolation eliminating muddy desaturated mid-tones when blending chromatic pairs. */
function mixOklab(a: RGB, b: RGB, t: number): RGB {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) return a;
  const [L1, a1, b1] = rgbToOklab(a);
  const [L2, a2, b2] = rgbToOklab(b);
  return oklabToRgb([
    L1 + (L2 - L1) * t,
    a1 + (a2 - a1) * t,
    b1 + (b2 - b1) * t,
  ]);
}

const hex = (c: RGB) => toHex(c);
const luminanceOf = (c: string) => contrastRatio(c, "#000000");

const isAchromatic = (hexStr: string): boolean => {
  const [r, g, b] = parseColor(hexStr);
  return r === g && g === b;
};

const nudgeRgb = (hexStr: string, delta: number): string => {
  const [r, g, b] = parseColor(hexStr);
  return hex([clampByte(r + delta), clampByte(g + delta), clampByte(b + delta)]);
};

/** Moves `color` in perceptual OKLab toward white or black until it satisfies `min` contrast on every surface. */
function readable(color: string, surfaces: string[], min: number): string {
  const rgb = parseColor(color);
  const startHex = hex(rgb);
  if (surfaces.every((s) => contrastRatio(startHex, s) >= min)) return startHex;
  const minWithWhite = Math.min(
    ...surfaces.map((s) => contrastRatio("#ffffff", s)),
  );
  const minWithBlack = Math.min(
    ...surfaces.map((s) => contrastRatio("#000000", s)),
  );
  const toward = minWithWhite >= minWithBlack ? WHITE : BLACK;
  for (let i = 1; i <= 40; i++) {
    const out = hex(mixOklab(rgb, toward, i * 0.025));
    if (surfaces.every((s) => contrastRatio(out, s) >= min)) return out;
  }
  return hex(toward);
}

/** Prefers `preferredMin` (e.g. WCAG AAA 7.0:1) when mathematically achievable on `surfaces`, otherwise guarantees `floorMin` (4.5:1). */
function readablePreferred(
  color: string,
  surfaces: string[],
  preferredMin: number,
  floorMin: number,
): string {
  const maxPossible = Math.max(
    Math.min(...surfaces.map((s) => contrastRatio("#ffffff", s))),
    Math.min(...surfaces.map((s) => contrastRatio("#000000", s))),
  );
  const target = maxPossible >= preferredMin ? preferredMin : floorMin;
  return readable(color, surfaces, target);
}

/** Black or white text, whichever reads better on `solid`. */
const textOn = (solid: string) =>
  contrastRatio(solid, "#ffffff") >= contrastRatio(solid, "#111111")
    ? "#ffffff"
    : "#111111";

/** A translucent color laid over a solid one in perceptual OKLab space. */
function over(base: string, tint: string, alpha: number): string {
  return hex(mixOklab(parseColor(base), parseColor(tint), alpha));
}

/** Tunes hairline border contrast into a crisp `[1.20, 1.68]` window against `panel` to prevent harsh neon glare or invisible borders. */
function tuneHairlineBorder(
  panel: string,
  rawBorder: string,
  text: string,
  dark: boolean,
): string {
  const cr = contrastRatio(rawBorder, panel);
  if (cr > 1.68) {
    let lo = 0.06;
    let hi = 0.92;
    let best = over(panel, rawBorder, dark ? 0.36 : 0.42);
    const target = dark ? 1.42 : 1.46;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      const cand = over(panel, rawBorder, mid);
      const c = contrastRatio(cand, panel);
      best = cand;
      if (c > target) hi = mid;
      else lo = mid;
    }
    return best;
  }
  if (cr < 1.18) {
    let lo = 0.06;
    let hi = 0.65;
    let best = over(rawBorder, text, dark ? 0.16 : 0.18);
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) * 0.5;
      const cand = over(rawBorder, text, mid);
      const c = contrastRatio(cand, panel);
      best = cand;
      if (c < 1.26) lo = mid;
      else hi = mid;
    }
    return best;
  }
  return rawBorder;
}

function buildContrastReport(
  vars: Record<string, string>,
): ThemeContrastItem[] {
  const specs: Array<[string, string, string, string]> = [
    ["text/bg", "Text / Window", vars.text!, vars.bg!],
    ["text/panel", "Text / Panel", vars.text!, vars.panel!],
    ["muted/panel", "Muted / Panel", vars.muted!, vars.panel!],
    ["accent/panel", "Accent / Panel", vars.accent!, vars.panel!],
    ["selected", "Selection", vars["selected-text"]!, vars.selected!],
    ["danger", "Danger", vars.danger!, vars["danger-bg"]!],
    ["ok/panel", "Success / Panel", vars.ok!, vars.panel!],
    ["warn/panel", "Warning / Panel", vars.warn!, vars.panel!],
    ["info/panel", "Info / Panel", vars.info!, vars.panel!],
  ];
  return specs.map(([pair, label, fg, bg]) => {
    const r = Math.round(contrastRatio(fg, bg) * 10) / 10;
    return {
      pair,
      label,
      fg,
      bg,
      ratio: r,
      grade: r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "AA Large",
    };
  });
}

/** Computes the full set of contrast-checked CSS variables, notes, and FX attributes for a `SimpleGUITheme`. */
export function themeVars(theme: SimpleGUITheme): ThemeVars {
  const dark = theme.is_dark;
  const rawAccent = hex(parseColor(theme.accent_color, [11, 92, 213]));
  const rawBg = hex(
    parseColor(theme.background_color, dark ? [20, 24, 32] : WHITE),
  );
  // Subtle harmonic OKLab micro-tint on pure dead-gray dark themes (preserving #000000 true OLED pitch-black).
  let bg =
    dark &&
    rawBg !== "#000000" &&
    isAchromatic(rawBg) &&
    !isAchromatic(rawAccent)
      ? over(rawBg, rawAccent, 0.028)
      : rawBg;
  const fg = hex(
    parseColor(theme.font_color, dark ? [236, 240, 246] : [18, 24, 34]),
  );
  const rawCard = theme.card_background
    ? hex(parseColor(theme.card_background))
    : "";
  const tintedCard =
    dark &&
    rawCard &&
    rawCard !== "#000000" &&
    isAchromatic(rawCard) &&
    !isAchromatic(rawAccent)
      ? over(rawCard, rawAccent, 0.032)
      : rawCard;
  let panel =
    tintedCard && contrastRatio(tintedCard, bg) >= 1.035
      ? tintedCard
      : over(bg, fg, dark ? 0.072 : 0.062);

  // A mid-tone background beside a light panel (a teal desktop behind silver windows) can't hold any text color
  // on both, so the page background takes the panel's color.
  const reads = (c: string) =>
    Math.min(contrastRatio(c, bg), contrastRatio(c, panel));
  let matchedBgToPanel = false;
  if (Math.max(reads("#000000"), reads("#ffffff")) < 5) {
    matchedBgToPanel = panel !== bg;
    bg = panel;
  }

  // Ensure crisp, distinct elevation between bg, panel, and surface-elevated on both dark and light schemes.
  if (!dark && panel === "#ffffff" && bg !== "#ffffff") {
    const steppedPanel = over(bg, "#ffffff", 0.64);
    panel =
      steppedPanel === "#ffffff" || steppedPanel === bg
        ? nudgeRgb("#ffffff", -3)
        : steppedPanel;
  } else if (panel === bg) {
    if (dark) {
      panel = over(bg, "#ffffff", 0.075);
      if (panel === bg) panel = nudgeRgb(bg, 6);
    } else if (bg === "#ffffff") {
      panel = isAchromatic(rawAccent)
        ? "#f5f7fa"
        : over("#ffffff", rawAccent, 0.035);
      if (panel === "#ffffff") panel = "#f5f7fa";
    } else {
      panel = over(bg, "#ffffff", 0.16);
      if (panel === bg) panel = nudgeRgb(bg, 6);
    }
  }

  let bg2: string;
  let bg3: string;
  let surfaceElevated: string;
  let surfaceSunken: string;
  if (dark) {
    bg2 = over(bg, panel, 0.52);
    if (bg2 === bg || luminanceOf(bg2) <= luminanceOf(bg)) {
      bg2 = nudgeRgb(bg, 4);
    }
    bg3 = over(panel, "#ffffff", 0.048);
    if (bg3 === bg2 || luminanceOf(bg3) <= luminanceOf(bg2)) {
      const baseForBg3 =
        luminanceOf(panel) > luminanceOf(bg2) ? panel : bg2;
      bg3 = nudgeRgb(baseForBg3, 5);
    }
    surfaceElevated = over(panel, "#ffffff", 0.068);
    if (surfaceElevated === panel) surfaceElevated = nudgeRgb(panel, 6);
    surfaceSunken = bg === "#000000" ? "#000000" : over(bg, "#000000", 0.22);
  } else if (luminanceOf(bg) < 7 && luminanceOf(panel) > luminanceOf(bg)) {
    // Retro mid-tone desktop backgrounds (e.g. Win 3.1 #808080 or Win 98 #008080 behind silver #c0c0c0 panels):
    // step monotonically upward toward panel/#ffffff so black ink stays comfortably >= 4.5:1 on every surface.
    bg2 = over(bg, panel, 0.34);
    if (bg2 === bg || luminanceOf(bg2) <= luminanceOf(bg)) {
      bg2 = nudgeRgb(bg, 6);
    }
    bg3 = over(bg, panel, 0.68);
    if (bg3 === bg2 || luminanceOf(bg3) <= luminanceOf(bg2)) {
      bg3 = nudgeRgb(bg2, 6);
    }
    surfaceElevated = over(panel, "#ffffff", 0.55);
    if (surfaceElevated === panel) surfaceElevated = "#ffffff";
    const sunkenCand = over(bg, "#000000", 0.02);
    surfaceSunken =
      contrastRatio("#000000", sunkenCand) >= 4.65
        ? sunkenCand
        : over(bg, panel, 0.16);
  } else {
    bg2 = over(bg, "#000000", 0.032);
    if (bg2 === bg || luminanceOf(bg2) >= luminanceOf(bg)) {
      bg2 = nudgeRgb(bg, -5);
    }
    bg3 = over(bg2, "#000000", 0.036);
    if (bg3 === bg2 || luminanceOf(bg3) >= luminanceOf(bg2)) {
      bg3 = nudgeRgb(bg2, -6);
    }
    surfaceElevated =
      rawCard === "#ffffff" || bg === "#ffffff"
        ? "#ffffff"
        : over(panel, "#ffffff", 0.58);
    if (surfaceElevated === panel && panel !== "#ffffff") {
      surfaceElevated = "#ffffff";
    }
    surfaceSunken = over(bg2, "#000000", 0.025);
    if (surfaceSunken === bg) surfaceSunken = nudgeRgb(bg, -6);
  }

  const rawFgReadableAA =
    contrastRatio(fg, bg) >= 4.5 && contrastRatio(fg, panel) >= 4.5;
  const baseSurfaces = [bg, bg2, bg3, panel, surfaceElevated, surfaceSunken];
  let text = readablePreferred(fg, baseSurfaces, 7, 4.5);
  let hover = over(panel, text, dark ? 0.1 : 0.085);
  if (hover === panel) hover = nudgeRgb(panel, dark ? 8 : -8);
  for (let i = 0; i < 3; i++) {
    text = readablePreferred(text, [...baseSurfaces, hover], 7, 4.5);
    hover = over(panel, text, dark ? 0.1 : 0.085);
    if (hover === panel) hover = nudgeRgb(panel, dark ? 8 : -8);
  }

  const rawBorder =
    theme.card_border && contrastRatio(theme.card_border, panel) >= 1.12
      ? hex(parseColor(theme.card_border))
      : over(panel, text, dark ? 0.15 : 0.16);
  const border = tuneHairlineBorder(panel, rawBorder, text, dark);
  let borderSubtle = over(panel, border, 0.55);
  if (borderSubtle === border) {
    borderSubtle = over(panel, border, 0.35);
  }
  let borderStrong = over(border, text, dark ? 0.26 : 0.28);
  if (borderStrong === border) {
    borderStrong = nudgeRgb(border, dark ? 12 : -12);
  }

  const rawAccentReadableAA =
    contrastRatio(rawAccent, bg) >= 4.5 &&
    contrastRatio(rawAccent, panel) >= 4.5;
  const accent = readable(rawAccent, [bg, bg2, panel], 4.5);
  const accentText = textOn(accent);
  const accentSoft = over(panel, accent, dark ? 0.2 : 0.13);
  const focusRing = readable(accent, [bg, panel], 3);
  let selected = over(bg, accent, dark ? 0.28 : 0.24);
  if (selected === hover || selected === panel) {
    selected = over(bg, accent, dark ? 0.34 : 0.29);
  }
  const selectedText = readablePreferred(text, [selected], 7, 4.5);
  let muted = readablePreferred(
    over(text, panel, dark ? 0.34 : 0.36),
    [bg, bg2, bg3, panel, hover, surfaceElevated, surfaceSunken],
    5,
    4.5,
  );
  if (contrastRatio(muted, selected) < 3.1) {
    muted = readable(
      muted,
      [bg, bg2, bg3, panel, hover, selected, surfaceElevated, surfaceSunken],
      4.5,
    );
  }
  // Re-check standard 4.5 floor on [bg, panel, hover] + 3.0 on selected simultaneously.
  if (
    contrastRatio(muted, bg) < 4.5 ||
    contrastRatio(muted, panel) < 4.5 ||
    contrastRatio(muted, hover) < 4.5 ||
    contrastRatio(muted, selected) < 3
  ) {
    muted = text;
  }
  const scrollbarThumb = over(panel, muted, 0.48);

  const sem = buildSemanticPalette({
    background: bg,
    card: panel,
    isDark: dark,
    overrides: overridesForTheme(theme),
  });
  const distinctSemantic = (solid: string, fallbackHex: string): string =>
    solid.toLowerCase() === accent.toLowerCase() ||
    contrastRatio(solid, accent) < 1.06
      ? over(solid, fallbackHex, 0.65)
      : solid;

  const dangerSolid = distinctSemantic(
    sem.danger.solid,
    dark ? "#fb7185" : "#dc2626",
  );
  const warnSolid = distinctSemantic(
    sem.warning.solid,
    dark ? "#fbbf24" : "#d97706",
  );
  const okSolid = distinctSemantic(
    sem.success.solid,
    dark ? "#34d399" : "#15803d",
  );
  const infoSolid = distinctSemantic(
    sem.info.solid,
    dark ? "#60a5fa" : "#0284c7",
  );

  const alpha = dark ? 0.17 : 0.13;
  const dangerBg = over(bg, dangerSolid, alpha + 0.05);
  const danger = readable(dangerSolid, [bg, panel, hover, dangerBg], 4.5);
  const dangerText = readable(sem.danger.text, [dangerBg], 4.5);

  const warnBg = over(bg, warnSolid, alpha + 0.05);
  const warn = readable(warnSolid, [bg, panel, hover, warnBg], 4.5);
  const warnText = readable(sem.warning.text, [warnBg], 4.5);

  const okBg = over(bg, okSolid, alpha + 0.04);
  const ok = readable(okSolid, [bg, panel, hover, okBg], 4.5);
  const okText = readable(sem.success.text, [okBg], 4.5);
  const good = ok;

  const infoBg = over(bg, infoSolid, alpha + 0.04);
  const info = readable(infoSolid, [bg, panel, hover, infoBg], 4.5);
  const infoText = readable(sem.info.text, [infoBg], 4.5);

  const toastBg = text;
  const toastText = readable(bg, [toastBg], 4.5);
  const toastAction = readable(accent, [toastBg], 4.5);
  const toastGood = readable(sem.success.text, [toastBg], 3);
  const toastBad = readable(sem.danger.text, [toastBg], 3);

  // Harmonized OKLab folder body, tab bevel, and ambient folder glow.
  const secondaryHex = hex(
    parseColor(theme.secondary_accent ?? accent, parseColor(accent)),
  );
  const folderBase = over(accent, secondaryHex, 0.22);
  const folderColor = dark
    ? over(folderBase, "#ffffff", 0.08)
    : over(folderBase, "#ffffff", 0.12);
  const folderTab = dark
    ? over(folderBase, "#000000", 0.22)
    : over(folderBase, "#000000", 0.16);
  const [fR, fG, fB] = parseColor(folderColor);
  const folderGlow = `rgba(${fR}, ${fG}, ${fB}, ${dark ? 0.28 : 0.2})`;

  const notes: string[] = [];
  if (matchedBgToPanel && theme.background_color)
    notes.push(
      "The window color was matched to the cards, because no text color reads well on both.",
    );
  if (!rawFgReadableAA && theme.font_color)
    notes.push(
      "The text color was adjusted a little so it stays easy to read.",
    );
  if (!rawAccentReadableAA && theme.accent_color)
    notes.push(
      "The accent color was adjusted a little so it stands out from the background.",
    );
  let effects: ThemeVars["effects"];
  if (theme.fx) {
    const safe = {
      ...theme,
      background_color: bg,
      card_background: panel,
      font_color: text,
    };
    const report = glassReport({ ...safe, fx: theme.fx });
    const mutedReport = glassReport({
      ...safe,
      font_color: muted,
      fx: theme.fx,
    });
    const opacity = Math.max(report.alpha, mutedReport.alpha);
    const [r, g, b] = parseColor(panel);
    const cleanedCustomCss = theme.fx.customCss
      ? sanitizeCustomCss(theme.fx.customCss)
      : "";
    effects = {
      css:
        fxCssVars(safe) +
        ` --fx-glass-bg: rgba(${r}, ${g}, ${b}, ${opacity}); --fx-glass-alpha: ${opacity};`,
      attrs: fxRootAttrs(safe),
      ...(cleanedCustomCss ? { customCss: cleanedCustomCss } : {}),
    };
    if (opacity > report.requestedAlpha)
      notes.push(
        `Panel opacity was raised to ${Math.round(opacity * 100)}% to keep text readable.`,
      );
  }

  const vars: Record<string, string> = {
    bg,
    bg2,
    bg3,
    card: panel,
    panel,
    "surface-elevated": surfaceElevated,
    "surface-sunken": surfaceSunken,
    text,
    muted,
    border,
    "border-subtle": borderSubtle,
    "border-strong": borderStrong,
    accent,
    "accent-p3": srgbToDisplayP3(accent, 0.14),
    "accent-text": accentText,
    "accent-soft": accentSoft,
    "focus-ring": focusRing,
    "scrollbar-thumb": scrollbarThumb,
    selected,
    "selected-text": selectedText,
    hover,
    danger,
    "danger-bg": dangerBg,
    "danger-text": dangerText,
    ok,
    "ok-bg": okBg,
    "ok-text": okText,
    warn,
    warning: warn,
    "warn-bg": warnBg,
    "warn-text": warnText,
    info,
    "info-bg": infoBg,
    "info-text": infoText,
    "folder-color": folderColor,
    "folder-tab": folderTab,
    "folder-glow": folderGlow,
    "toast-bg": toastBg,
    "toast-text": toastText,
    "toast-action": toastAction,
    "toast-good": toastGood,
    "toast-bad": toastBad,
    good,
    shadow: dark
      ? "0 10px 30px rgba(0, 0, 0, 0.62)"
      : "0 10px 28px rgba(15, 23, 42, 0.16)",
  };

  if (theme.fx?.customVars && typeof theme.fx.customVars === "object") {
    try {
      const overrides = validateCustomVars(theme.fx.customVars);
      for (const [k, v] of Object.entries(overrides)) {
        vars[k] = v;
      }
    } catch {}
  }

  return {
    scheme: dark ? "dark" : "light",
    notes,
    contrast: buildContrastReport(vars),
    ...(effects ? { effects } : {}),
    vars,
  };
}

const WINDOWS =
  /windows|\bwin ?(3|9|me|xp|vista|7|8|10|11)\b|\bxp\b|vista|fluent|metro|aero|luna|terminal campbell/i;
const MAC =
  /mac ?os|macos|sonoma|ventura|sequoia|tahoe|monterey|big sur|yosemite|snow leopard|liquid glass|\bsystem 7\b|aqua|apple|cupertino/i;

function groupOf(key: string, theme: SimpleGUITheme): ThemeGroup {
  const masterGroup = FM_BUILTIN_MASTER_GROUPS[key];
  if (masterGroup) return masterGroup;
  if (FX_THEME_KEYS.includes(key)) return "Futuristic";
  if (RARE_OS_THEME_KEYS.includes(key)) return "Rare and beloved systems";
  if (
    OS_THEME_KEYS.includes(key) ||
    /linux|gnome|kde|distro|desktop/i.test(theme.description)
  ) {
    if (MAC.test(theme.name)) return "macOS";
    if (WINDOWS.test(theme.name)) return "Windows";
    return "Linux";
  }
  if (MAC.test(theme.name)) return "macOS";
  if (WINDOWS.test(theme.name)) return "Windows";
  return "Editors and classics";
}

interface Entry {
  summary: ThemeSummary;
  theme: SimpleGUITheme;
  computed?: ThemeVars;
}

/** The colors a theme was made from, for the editor to start from. */
export interface ThemeSource {
  dark: boolean;
  colors: Record<string, string>;
  fx?: ThemeFx;
}

/** Extracts the editable base color palette and FX configuration from a `SimpleGUITheme` for the theme editor. */
export function sourceOf(theme: SimpleGUITheme): ThemeSource {
  const bg = hex(parseColor(theme.background_color));
  const card = theme.card_background
    ? hex(parseColor(theme.card_background))
    : over(bg, hex(parseColor(theme.font_color)), 0.07);
  const sem = buildSemanticPalette({
    background: bg,
    card,
    isDark: theme.is_dark,
    overrides: overridesForTheme(theme),
  });
  return {
    dark: theme.is_dark,
    ...(theme.fx ? { fx: { ...theme.fx } } : {}),
    colors: {
      background: bg,
      text: hex(parseColor(theme.font_color)),
      accent: hex(parseColor(theme.accent_color)),
      secondary: hex(parseColor(theme.secondary_accent ?? theme.accent_color)),
      card,
      border: theme.card_border
        ? hex(parseColor(theme.card_border))
        : over(bg, hex(parseColor(theme.font_color)), 0.22),
      danger: sem.danger.solid,
      warning: sem.warning.solid,
      success: sem.success.solid,
      info: sem.info.solid,
    },
  };
}

let table: Map<string, Entry> | null = null;

function previewOf(
  theme: SimpleGUITheme,
  v: Record<string, string>,
): ThemePreview {
  const fx = theme.fx;
  return {
    bg: v.bg!,
    bg2: v.bg2!,
    bg3: v.bg3!,
    panel: v.panel!,
    accent: v.accent!,
    text: v.text!,
    muted: v.muted!,
    border: v.border!,
    selected: v.selected!,
    selectedText: v["selected-text"]!,
    folderColor: v["folder-color"]!,
    folderTab: v["folder-tab"]!,
    folderGlow: v["folder-glow"]!,
    radius: fx?.radius ?? "soft",
    glow: fx?.glow ?? "none",
    glowColor: fx?.glowColor ?? v.accent!,
    borderStyle: fx?.border ?? "flat",
  };
}

function fallbackMetaFor(
  key: string,
  theme: SimpleGUITheme,
): { fallbackKey?: string; fallbackName?: string } {
  if (!theme.fx) return {};
  const catalog = allBuiltinThemes();
  const fbKey =
    FM_BUILTIN_MASTER_FALLBACKS[key] ??
    FX_FALLBACK_THEMES[key] ??
    getFallbackThemeKey(key);
  const candidate = fbKey && fbKey !== key ? catalog[fbKey] : undefined;
  let resolvedKey =
    candidate && !candidate.fx && candidate.is_dark === theme.is_dark
      ? fbKey!
      : theme.is_dark
        ? "midnight"
        : "apple_light";
  const fbTheme = catalog[resolvedKey];
  if (fbTheme?.name) {
    const firstKey = Object.keys(catalog)
      .sort()
      .find((k) => catalog[k]?.name === fbTheme.name && !catalog[k]?.fx);
    if (firstKey) resolvedKey = firstKey;
  }
  return {
    fallbackKey: resolvedKey,
    fallbackName: catalog[resolvedKey]?.name ?? resolvedKey,
  };
}

function templateTierMeta(
  key: string,
  theme: SimpleGUITheme,
): Pick<
  ThemeSummary,
  | "tier"
  | "hardwareTier"
  | "motion"
  | "atmosphere"
  | "cursorEffect"
  | "backdropStyle"
  | "uiElementFx"
  | "iconPackStyle"
> {
  const fx = theme.fx;
  const explicitHwTier = FM_BUILTIN_MASTER_HARDWARE_TIERS[key];
  if (!fx) {
    return {
      tier: "low",
      hardwareTier: explicitHwTier ?? "low",
      motion: "none",
      backdropStyle: "solid",
    };
  }
  const hay = `${key} ${theme.name} ${theme.description ?? ""}`;
  let backdropStyle: string = fx.backdropStyle ?? "";
  if (!backdropStyle) {
    if (
      /liquid|tahoe|vision|spatial|caustic|fluid|ferrofluid|soliton/i.test(
        hay,
      ) ||
      ((fx.glass ?? 0) >= 0.65 && (fx.blur ?? 0) >= 24 && fx.sheen)
    ) {
      backdropStyle = "liquid";
    } else if (
      /mica|acrylic|win11|fluent|copilot|aero/i.test(hay) ||
      (fx.noise && (fx.blur ?? 0) >= 16)
    ) {
      backdropStyle = "mica";
    } else if ((fx.blur ?? 0) >= 18) {
      backdropStyle = "frosted";
    } else {
      backdropStyle = "glass";
    }
  }
  const hasAtmo = Boolean(fx.atmosphere && fx.atmosphere !== "none");
  const isUltra =
    explicitHwTier === "ultra" ||
    explicitHwTier === "high" ||
    hasAtmo ||
    (fx.blur ?? 0) >= 18 ||
    backdropStyle === "liquid" ||
    fx.glow === "plasma" ||
    fx.glow === "laser" ||
    fx.glow === "bloom" ||
    Boolean(fx.prismEdge) ||
    Boolean(fx.chromatic);
  const derivedHwTier: HardwareTier =
    explicitHwTier ??
    (!isUltra
      ? "medium"
      : (fx.blur ?? 0) >= 26 ||
          Boolean(fx.parallax) ||
          (hasAtmo && fx.atmosphere!.split("+").length >= 3)
        ? "ultra"
        : "high");
  return {
    tier: explicitHwTier === "medium" ? "medium" : isUltra ? "ultra" : "medium",
    hardwareTier: derivedHwTier,
    motion: fx.motion ?? "calm",
    ...(hasAtmo ? { atmosphere: fx.atmosphere } : {}),
    ...(fx.cursorEffect && fx.cursorEffect !== "none"
      ? { cursorEffect: fx.cursorEffect }
      : {}),
    ...(fx.uiElementFx && fx.uiElementFx !== "off"
      ? { uiElementFx: fx.uiElementFx }
      : {}),
    ...(fx.iconPackStyle && fx.iconPackStyle !== "default"
      ? { iconPackStyle: fx.iconPackStyle }
      : {}),
    backdropStyle,
  };
}

function build(): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const seenNames = new Set<string>();
  const catalog = allBuiltinThemes();
  for (const key of Object.keys(catalog).sort()) {
    const theme = catalog[key]!;
    if (
      !theme?.name ||
      seenNames.has(theme.name) ||
      !/^[a-z0-9_]{1,60}$/.test(key)
    )
      continue;
    seenNames.add(theme.name);
    const v = themeVars(theme).vars;
    const fb = fallbackMetaFor(key, theme);
    const meta = templateTierMeta(key, theme);
    out.set(key, {
      theme,
      summary: {
        key,
        name: theme.name,
        description: theme.description ?? "",
        dark: theme.is_dark,
        group: groupOf(key, theme),
        swatch: [v.bg!, v.panel!, v.accent!, v.text!],
        preview: previewOf(theme, v),
        hasEffects: !!theme.fx,
        ...meta,
        ...fb,
      },
    });
  }
  return out;
}

const entries = () => (table ??= build());

/** Returns the catalog summaries of all built-in File Manager themes. */
export const listThemes = (): ThemeSummary[] =>
  [...entries().values()].map((e) => e.summary);

function summaryOf(
  key: string,
  theme: SimpleGUITheme,
  group: ThemeGroup,
): ThemeSummary & ThemeVars {
  const computed = themeVars(theme);
  const v = computed.vars;
  const fb = fallbackMetaFor(key, theme);
  const meta = templateTierMeta(key, theme);
  return {
    key,
    name: theme.name,
    description: theme.description ?? "",
    dark: theme.is_dark,
    group,
    swatch: [v.bg!, v.panel!, v.accent!, v.text!],
    preview: previewOf(theme, v),
    hasEffects: !!theme.fx,
    ...meta,
    ...fb,
    ...computed,
  };
}

/** Looks up a built-in theme by key and returns its summary together with its computed CSS variables, or `null` if unknown. */
export function getThemeColours(
  key: unknown,
): (ThemeSummary & ThemeVars) | null {
  if (typeof key !== "string") return null;
  const e = entries().get(key);
  if (!e) return null;
  e.computed ??= themeVars(e.theme);
  return { ...e.summary, ...e.computed };
}

/** Result of resolving a theme against the client's detected GPU/CPU/display hardware profile. */
export interface FmHardwareThemeResult {
  theme: ThemeSummary & ThemeVars;
  requestedKey: string;
  appliedKey: string;
  fallbackKey?: string;
  downgraded: boolean;
  revertedToFallback: boolean;
  fxMode: FxMode;
  hardware: FxHardwareProfile;
}

/**
 * Resolves a File Manager theme and automatically reverts to its lightweight non-FX fallback theme
 * (or downgrades `fxMode`) when the system is software-rendered, over RDP, in Windows High Contrast,
 * or below the minimum GPU/CPU/RAM threshold.
 */
export function getThemeColoursForHardware(
  key: unknown,
  hw?: FxHardwareInput,
  opts?: { revertToFallbackTheme?: boolean },
): FmHardwareThemeResult | null {
  const requested = getThemeColours(key);
  if (!requested) return null;
  const hardware = detectThemeHardware(hw);
  const revert = opts?.revertToFallbackTheme !== false;
  if (requested.hasEffects && hardware.shouldUseFallbackTheme) {
    const fbKey =
      requested.fallbackKey ?? (requested.dark ? "midnight" : "apple_light");
    const fbTheme = revert ? getThemeColours(fbKey) : null;
    if (fbTheme) {
      return {
        theme: {
          ...fbTheme,
          notes: [
            ...fbTheme.notes,
            `Automatically switched from ${requested.name} to ${fbTheme.name} for smooth performance on this system (${hardware.reason}).`,
          ],
        },
        requestedKey: requested.key,
        appliedKey: fbTheme.key,
        fallbackKey: fbKey,
        downgraded: true,
        revertedToFallback: true,
        fxMode: hardware.recommendedFxMode,
        hardware,
      };
    }
    return {
      theme: requested,
      requestedKey: requested.key,
      appliedKey: requested.key,
      fallbackKey: fbKey,
      downgraded: true,
      revertedToFallback: false,
      fxMode: hardware.recommendedFxMode,
      hardware,
    };
  }
  return {
    theme: requested,
    requestedKey: requested.key,
    appliedKey: requested.key,
    fallbackKey: requested.fallbackKey,
    downgraded: hardware.recommendedFxMode !== "on" && requested.hasEffects,
    revertedToFallback: false,
    fxMode: hardware.recommendedFxMode,
    hardware,
  };
}

const customSummary = (t: CustomTheme): ThemeSummary => {
  const {
    notes: _notes,
    scheme: _scheme,
    vars: _vars,
    effects: _effects,
    contrast: _contrast,
    ...summary
  } = summaryOf(t.id, toSimpleTheme(t), "My themes");
  return summary;
};

async function resolve(
  ctx: FmContext,
  key: unknown,
): Promise<{
  colours: ThemeSummary & ThemeVars;
  source: ThemeSource;
  draft?: CustomTheme;
} | null> {
  if (isCustomKey(key)) {
    const customList = await loadCustom(ctx);
    const found = customList.find((x) => x.id === key);
    return found
      ? {
          colours: summaryOf(found.id, toSimpleTheme(found), "My themes"),
          source: sourceOf(toSimpleTheme(found)),
          draft: found,
        }
      : null;
  }
  const colours = getThemeColours(key);
  return colours
    ? { colours, source: sourceOf(entries().get(key as string)!.theme) }
    : null;
}

/** Converts any resolved theme (premade built-in or custom) into a portable ThemeDraft for sharing/exporting. */
async function resolveShareableDraft(
  ctx: FmContext,
  keyOrId: unknown,
): Promise<ThemeDraft | null> {
  const effectiveKey =
    keyOrId === "" ||
    keyOrId === "standard" ||
    keyOrId === "default" ||
    keyOrId === undefined ||
    keyOrId === null
      ? "tahoe_studio_3d"
      : keyOrId;
  const r =
    (await resolve(ctx, effectiveKey)) ??
    (effectiveKey === "tahoe_studio_3d" ? await resolve(ctx, "dracula") : null);
  if (!r) return null;
  if (r.draft) {
    const { id: _id, ...draft } = r.draft;
    return draft;
  }
  return validateDraft({
    name: r.colours.name.slice(0, 40),
    dark: r.source.dark,
    base: r.colours.name.slice(0, 40),
    colors: r.source.colors,
    ...(r.source.fx ? { fx: r.source.fx } : {}),
  });
}

function safeFileSlug(name: string): string {
  return (
    (name || "theme")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "theme"
  );
}

/** File Manager API handlers (`themes/*`) for listing, previewing, saving, importing, and exporting themes. */
export const themeOperations: Record<string, FmHandler> = {
  async "themes/list"(ctx) {
    return {
      themes: [...(await loadCustom(ctx)).map(customSummary), ...listThemes()],
    };
  },
  async "themes/get"(ctx, b) {
    const r = await resolve(ctx, b.key);
    if (!r) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return {
      theme: r.colours,
      source: r.source,
      custom: r.draft
        ? { id: r.draft.id, name: r.draft.name, base: r.draft.base }
        : null,
    };
  },
  async "themes/resolve-hardware"(_ctx, b) {
    const res = getThemeColoursForHardware(
      b.key,
      b.hardware as FxHardwareInput | undefined,
      {
        revertToFallbackTheme: b.revertToFallbackTheme !== false,
      },
    );
    if (!res) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return res;
  },
  /** Works out the colors of a theme that isn't saved yet, so the editor can show it live. */
  async "themes/preview"(_ctx, b) {
    const raw = b.theme !== undefined ? b.theme : b;
    const draft = validateDraft(raw);
    const c = themeVars(toSimpleTheme(draft));
    return {
      theme: { key: "preview", name: draft.name, dark: draft.dark, ...c },
    };
  },
  async "themes/custom/save"(ctx, b) {
    const raw = b.theme !== undefined ? b.theme : b;
    const saved = await saveCustom(ctx, raw, b.id);
    const full = summaryOf(saved.id, toSimpleTheme(saved), "My themes");
    return { id: saved.id, name: saved.name, theme: full };
  },
  async "themes/custom/delete"(ctx, b) {
    await deleteCustom(ctx, b.id);
    return {};
  },
  /** Exports any custom theme OR any premade built-in theme (or inline draft) as shareable JSON and a compact CCFM-THEME-v1 share code. */
  async "themes/custom/export"(ctx, b) {
    if (b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      return {
        text: exportTheme(draft),
        shareCode: encodeThemeShareCode(draft),
        name: draft.name,
        theme: draft,
      };
    }
    const targetKey = b.id ?? b.key;
    const draft = await resolveShareableDraft(ctx, targetKey);
    if (!draft) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return {
      text: exportTheme(draft),
      shareCode: encodeThemeShareCode(draft),
      name: draft.name,
      theme: draft,
    };
  },
  /** Exports any theme draft or saved/premade theme key as a standalone `:root` CSS variables stylesheet. */
  async "themes/custom/export-css"(ctx, b) {
    if (b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      const c = themeVars(toSimpleTheme(draft));
      return {
        css: exportThemeCss(
          draft.name,
          c.scheme,
          c.vars,
          c.effects?.css,
          c.effects?.customCss,
          encodeThemeShareCode(draft),
        ),
      };
    }
    const targetKey = b.key ?? b.id;
    const r =
      (await resolve(ctx, targetKey)) ??
      (targetKey === "" || targetKey === "standard" || targetKey === undefined
        ? await resolve(ctx, "tahoe_studio_3d")
        : null);
    if (!r) throw new FmError("NOT_FOUND", "That theme isn't available.");
    const draft = await resolveShareableDraft(ctx, targetKey);
    return {
      css: exportThemeCss(
        r.colours.name,
        r.colours.scheme,
        r.colours.vars,
        r.colours.effects?.css,
        r.colours.effects?.customCss,
        draft ? encodeThemeShareCode(draft) : undefined,
      ),
    };
  },
  /** Exports custom themes and/or selected premade themes as a shareable Theme Pack JSON string + compact CCFM-PACK-v1 share code. */
  async "themes/custom/export-pack"(ctx, b) {
    if (Array.isArray(b.keys) && b.keys.length > 0) {
      const drafts: ThemeDraft[] = [];
      for (const k of b.keys.slice(0, 50)) {
        const d = await resolveShareableDraft(ctx, k);
        if (d) drafts.push(d);
      }
      if (!drafts.length)
        throw new FmError(
          "NOT_FOUND",
          "None of the selected themes were found.",
        );
      return {
        text: exportThemePack(drafts),
        shareCode: encodeThemePackShareCode(drafts),
        count: drafts.length,
      };
    }
    const all = await loadCustom(ctx);
    const ids = Array.isArray(b.ids) ? b.ids.filter(isCustomKey) : null;
    const picked: ThemeDraft[] = (
      ids && ids.length ? all.filter((t) => ids.includes(t.id)) : all
    ).map(({ id: _id, ...d }) => d);
    if (b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      if (
        !picked.some((t) => t.name.toLowerCase() === draft.name.toLowerCase())
      ) {
        picked.unshift(draft);
      }
    }
    if (!picked.length)
      throw new FmError(
        "NOT_FOUND",
        "Save at least one custom theme first to export a pack.",
      );
    return {
      text: exportThemePack(picked),
      shareCode: encodeThemePackShareCode(picked),
      count: picked.length,
    };
  },
  /** Saves an exported theme or theme pack directly as a file on disk inside `b.folder` (or the user's home folder). */
  async "themes/custom/save-file"(ctx, b) {
    const targetDir =
      typeof b.folder === "string" && b.folder.trim()
        ? absolutePath(ctx, b.folder)
        : ctx.home;
    assertCreatable(ctx, targetDir);
    await fsp.mkdir(targetDir, { recursive: true });

    const fmt = typeof b.format === "string" ? b.format : "json";
    let content = typeof b.content === "string" ? b.content : "";
    let baseSlug =
      typeof b.name === "string" && b.name.trim()
        ? safeFileSlug(b.name)
        : "codecaine-theme";
    let ext = ".theme.json";

    if (!content) {
      if (fmt === "pack" || Array.isArray(b.keys)) {
        const packRes = (await themeOperations["themes/custom/export-pack"]!(
          ctx,
          b,
        )) as { text: string; shareCode: string };
        content = fmt === "pack-code" ? packRes.shareCode : packRes.text;
        baseSlug = safeFileSlug(
          typeof b.name === "string" && b.name.trim()
            ? b.name
            : "codecaine-theme-pack",
        );
        ext = fmt === "pack-code" ? ".ccfm-pack.txt" : ".theme-pack.json";
      } else if (fmt === "css") {
        const cssRes = (await themeOperations["themes/custom/export-css"]!(
          ctx,
          b,
        )) as { css: string };
        content = cssRes.css;
        ext = ".theme.css";
      } else {
        const expRes = (await themeOperations["themes/custom/export"]!(
          ctx,
          b,
        )) as { text: string; shareCode: string; name: string };
        baseSlug = safeFileSlug(expRes.name);
        content = fmt === "code" ? expRes.shareCode : expRes.text;
        ext = fmt === "code" ? ".ccfm.txt" : ".theme.json";
      }
    } else {
      if (content.length > 600_000)
        throw new FmError(
          "BAD_REQUEST",
          "That theme content is too large to save.",
        );
      if (fmt === "css") ext = ".theme.css";
      else if (fmt === "code") ext = ".ccfm.txt";
      else if (fmt.startsWith("pack")) ext = ".theme-pack.json";
    }

    for (let i = 1; i <= 200; i++) {
      const fileName = i === 1 ? `${baseSlug}${ext}` : `${baseSlug}-${i}${ext}`;
      const fullPath = nodePath.join(targetDir, fileName);
      try {
        await fsp.writeFile(fullPath, content, {
          encoding: "utf8",
          flag: "wx",
        });
        return {
          path: fullPath,
          name: fileName,
          bytes: Buffer.byteLength(content, "utf8"),
        };
      } catch (err: any) {
        if (err?.code === "EEXIST") continue;
        throw err;
      }
    }
    throw new FmError(
      "EXISTS",
      "Could not find a free file name for that theme export.",
    );
  },
  /** Reads a `.theme.json`, `.ccfm`, `.json`, `.txt`, or `.css` file from disk and returns its text for theme import. */
  async "themes/custom/read-file"(ctx, b) {
    if (typeof b.path !== "string" || !b.path.trim())
      throw new FmError("BAD_REQUEST", "Choose a theme file first.");
    const resolved = absolutePath(ctx, b.path);
    if (!/\.(?:json|txt|ccfm|css)$/i.test(resolved)) {
      throw new FmError(
        "BAD_REQUEST",
        "Only .json, .txt, .ccfm, and .css theme files can be imported.",
      );
    }
    const st = await fsp.lstat(resolved).catch(() => null);
    if (!st || st.isSymbolicLink() || !st.isFile())
      throw new FmError("NOT_FOUND", "That theme file could not be found.");
    if (st.size > 600_000)
      throw new FmError(
        "BAD_REQUEST",
        "That file is too large to be a theme file.",
      );
    const text = await fsp.readFile(resolved, "utf8");
    return { path: resolved, name: nodePath.basename(resolved), text };
  },
  /** Pre-flight inspects a bulk theme import to detect name conflicts against existing custom themes or within the batch. */
  async "themes/custom/inspect-pack"(ctx, b) {
    return await inspectBulkThemeImport(ctx, b.text ?? b.json ?? b.themes);
  },
  /** Imports a Theme Pack (or bulk list of themes/share codes) with optional conflict resolution strategies. */
  async "themes/custom/import-pack"(ctx, b) {
    const opts: BulkImportOptions = {
      ...(typeof b.onConflict === "string"
        ? { onConflict: b.onConflict as BulkImportOptions["onConflict"] }
        : {}),
      ...(b.resolutions !== undefined
        ? { resolutions: b.resolutions as BulkImportOptions["resolutions"] }
        : {}),
      ...(Array.isArray(b.includeIndices)
        ? {
            includeIndices: b.includeIndices.filter(
              (n: unknown) => typeof n === "number",
            ),
          }
        : {}),
      ...(b.autoRenameConflicts === true ? { autoRenameConflicts: true } : {}),
    };
    const report = await importThemePackWithReport(
      ctx,
      b.text ?? b.json ?? b.themes,
      opts,
    );
    return {
      imported: report.imported.map((t) => ({
        id: t.id,
        name: t.name,
        dark: t.dark,
        colors: t.colors,
        fx: t.fx,
        base: t.base,
      })),
      count: report.count,
      importedCount: report.importedCount,
      addedCount: report.addedCount,
      replacedCount: report.replacedCount,
      renamedCount: report.renamedCount,
      mergedCount: report.mergedCount,
      skippedCount: report.skippedCount,
      requiresResolution: report.requiresResolution,
      inspection: report.inspection,
      first: report.first ?? null,
    };
  },
  /** Reads shared theme text or CCFM-THEME-v1 share code and returns it as a draft for the editor (nothing is saved yet). */
  async "themes/custom/import"(_ctx, b) {
    const draft: ThemeDraft = parseShared(b.text ?? b.json);
    return { theme: draft, importedCount: 1 };
  },
};
