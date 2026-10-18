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
import { buildSemanticPalette, contrastRatio, overridesForTheme, parseColor, toHex } from "../../shared/themeSemantic";
import { FmError } from "./fmPaths";
import type { FmContext, FmHandler } from "./fmCore";
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

type RGB = [number, number, number];

export type ThemeGroup = "My themes" | "Futuristic" | "Linux" | "Windows" | "macOS" | "Rare and beloved systems" | "Editors and classics";

export interface ThemePreview {
  bg: string;
  panel: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  selected: string;
  selectedText: string;
  radius: FxRadius;
  glow: FxGlow;
  glowColor: string;
  borderStyle: FxBorder;
}

export interface ThemeContrastItem {
  pair: string;
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  grade: "AAA" | "AA" | "AA Large";
}

export type ThemeTier = "low" | "medium" | "ultra";

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
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: RGB) => toHex(c);
const luminanceOf = (c: string) => contrastRatio(c, "#000000");

/** Moves `color` toward white or black, whichever the surfaces call for, until it reads on all of them. */
function readable(color: string, surfaces: string[], min: number): string {
  const rgb = parseColor(color);
  if (surfaces.every((s) => contrastRatio(color, s) >= min)) return hex(rgb);
  // A surface whose ratio against black is under about 4.6 is on the dark side of the middle.
  const darkSurfaces = surfaces.reduce((sum, s) => sum + luminanceOf(s), 0) / surfaces.length < 4.6;
  const toward = darkSurfaces ? WHITE : BLACK;
  for (let i = 1; i <= 20; i++) {
    const out = hex(mix(rgb, toward, i * 0.05));
    if (surfaces.every((s) => contrastRatio(out, s) >= min)) return out;
  }
  return hex(toward);
}

/** Black or white text, whichever reads better on `solid`. */
const textOn = (solid: string) => (contrastRatio(solid, "#ffffff") >= contrastRatio(solid, "#111111") ? "#ffffff" : "#111111");

/** A translucent color laid over a solid one. */
function over(base: string, tint: string, alpha: number): string {
  return hex(mix(parseColor(base), parseColor(tint), alpha));
}

function buildContrastReport(vars: Record<string, string>): ThemeContrastItem[] {
  const specs: Array<[string, string, string, string]> = [
    ["text/bg", "Text / Window", vars.text!, vars.bg!],
    ["text/panel", "Text / Panel", vars.text!, vars.panel!],
    ["muted/panel", "Muted / Panel", vars.muted!, vars.panel!],
    ["accent/panel", "Accent / Panel", vars.accent!, vars.panel!],
    ["selected", "Selection", vars["selected-text"]!, vars.selected!],
    ["danger", "Danger", vars.danger!, vars["danger-bg"]!],
  ];
  return specs.map(([pair, label, fg, bg]) => {
    const r = Math.round(contrastRatio(fg, bg) * 10) / 10;
    return { pair, label, fg, bg, ratio: r, grade: r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "AA Large" };
  });
}

export function themeVars(theme: SimpleGUITheme): ThemeVars {
  const dark = theme.is_dark;
  let bg = hex(parseColor(theme.background_color, dark ? [22, 25, 29] : WHITE));
  const fg = hex(parseColor(theme.font_color, dark ? [232, 234, 237] : [27, 31, 36]));
  const card = theme.card_background ? hex(parseColor(theme.card_background)) : "";
  const panel = card && contrastRatio(card, bg) >= 1.04 ? card : over(bg, fg, 0.07);
  // A mid-tone background beside a light panel (a teal desktop behind silver windows) can't hold any text color
  // on both, so the page background takes the panel's color.
  const reads = (c: string) => Math.min(contrastRatio(c, bg), contrastRatio(c, panel));
  if (Math.max(reads("#000000"), reads("#ffffff")) < 5) bg = panel;
  const surfaceElevated = dark ? over(panel, "#ffffff", 0.05) : over(panel, "#ffffff", 0.55);
  const surfaceSunken = dark ? over(bg, "#000000", 0.2) : over(panel, "#000000", 0.04);
  let text = readable(fg, [bg, panel, surfaceElevated, surfaceSunken], 4.5);
  let hover = over(panel, text, 0.11);
  for (let i = 0; i < 3; i++) {
    text = readable(text, [bg, panel, hover, surfaceElevated, surfaceSunken], 4.5);
    hover = over(panel, text, 0.11);
  }
  const rawBorder = theme.card_border && contrastRatio(theme.card_border, bg) >= 1.15 ? hex(parseColor(theme.card_border)) : over(panel, text, dark ? 0.16 : 0.18);
  const border = contrastRatio(rawBorder, panel) > 1.85 ? over(panel, rawBorder, dark ? 0.42 : 0.48) : rawBorder;
  const borderSubtle = over(panel, border, 0.58);
  const borderStrong = over(border, text, 0.28);
  const accent = readable(hex(parseColor(theme.accent_color, [11, 92, 213])), [bg, panel], 4.5);
  const accentText = textOn(accent);
  const accentSoft = over(panel, accent, dark ? 0.22 : 0.15);
  const focusRing = readable(accent, [bg, panel], 3);
  const selected = over(bg, accent, 0.3);
  const selectedText = readable(text, [selected], 4.5);
  const muted = readable(over(text, panel, 0.38), [bg, panel, hover, selected, surfaceElevated], 4.5);
  const scrollbarThumb = over(panel, muted, 0.48);

  const sem = buildSemanticPalette({ background: bg, card: panel, isDark: dark, overrides: overridesForTheme(theme) });
  const alpha = dark ? 0.18 : 0.14;
  const dangerBg = over(bg, sem.danger.solid, alpha + 0.06);
  const danger = readable(sem.danger.text, [bg, hover, dangerBg], 4.5);
  const dangerText = readable(sem.danger.text, [dangerBg], 4.5);
  const warnBg = over(bg, sem.warning.solid, alpha + 0.06);
  const warnText = readable(sem.warning.text, [warnBg], 4.5);
  const toastBg = text;
  const toastText = readable(bg, [toastBg], 4.5);
  const toastAction = readable(accent, [toastBg], 4.5);
  const toastGood = readable(sem.success.text, [toastBg], 3);
  const toastBad = readable(sem.danger.text, [toastBg], 3);
  const good = readable(sem.success.text, [panel], 3);

  const notes: string[] = [];
  const asked = (c: string | undefined, fallback: string) => hex(parseColor(c, parseColor(fallback)));
  if (bg !== asked(theme.background_color, bg) && theme.background_color) notes.push("The window color was matched to the cards, because no text color reads well on both.");
  if (text !== asked(theme.font_color, text) && theme.font_color) notes.push("The text color was adjusted a little so it stays easy to read.");
  if (accent !== asked(theme.accent_color, accent) && theme.accent_color) notes.push("The accent color was adjusted a little so it stands out from the background.");
  let effects: ThemeVars["effects"];
  if (theme.fx) {
    const safe = { ...theme, background_color: bg, card_background: panel, font_color: text };
    const report = glassReport({ ...safe, fx: theme.fx });
    const mutedReport = glassReport({ ...safe, font_color: muted, fx: theme.fx });
    const opacity = Math.max(report.alpha, mutedReport.alpha);
    const [r, g, b] = parseColor(panel);
    const cleanedCustomCss = theme.fx.customCss ? sanitizeCustomCss(theme.fx.customCss) : "";
    effects = {
      css: fxCssVars(safe) + ` --fx-glass-bg: rgba(${r}, ${g}, ${b}, ${opacity}); --fx-glass-alpha: ${opacity};`,
      attrs: fxRootAttrs(safe),
      ...(cleanedCustomCss ? { customCss: cleanedCustomCss } : {}),
    };
    if (opacity > report.requestedAlpha) notes.push(`Panel opacity was raised to ${Math.round(opacity * 100)}% to keep text readable.`);
  }

  const vars: Record<string, string> = {
    bg, panel,
    "surface-elevated": surfaceElevated,
    "surface-sunken": surfaceSunken,
    text, muted, border,
    "border-subtle": borderSubtle,
    "border-strong": borderStrong,
    accent, "accent-p3": srgbToDisplayP3(accent, 0.14), "accent-text": accentText,
    "accent-soft": accentSoft,
    "focus-ring": focusRing,
    "scrollbar-thumb": scrollbarThumb,
    selected, "selected-text": selectedText, hover,
    danger, "danger-bg": dangerBg, "danger-text": dangerText,
    "toast-bg": toastBg, "toast-text": toastText, "toast-action": toastAction, "toast-good": toastGood, "toast-bad": toastBad,
    good, "warn-bg": warnBg, "warn-text": warnText,
    shadow: dark ? "0 8px 28px rgba(0, 0, 0, 0.6)" : "0 8px 28px rgba(15, 23, 42, 0.22)",
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

const WINDOWS = /windows|\bwin ?(3|9|me|xp|vista|7|8|10|11)\b|\bxp\b|vista|fluent|metro|aero|luna|terminal campbell/i;
const MAC = /mac ?os|macos|sonoma|ventura|sequoia|tahoe|monterey|big sur|yosemite|snow leopard|liquid glass|\bsystem 7\b|aqua|apple/i;

function groupOf(key: string, theme: SimpleGUITheme): ThemeGroup {
  if (FX_THEME_KEYS.includes(key)) return "Futuristic";
  if (RARE_OS_THEME_KEYS.includes(key)) return "Rare and beloved systems";
  if (OS_THEME_KEYS.includes(key) || /linux|gnome|kde|distro|desktop/i.test(theme.description)) {
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

export function sourceOf(theme: SimpleGUITheme): ThemeSource {
  const bg = hex(parseColor(theme.background_color));
  const card = theme.card_background ? hex(parseColor(theme.card_background)) : over(bg, hex(parseColor(theme.font_color)), 0.07);
  const sem = buildSemanticPalette({ background: bg, card, isDark: theme.is_dark, overrides: overridesForTheme(theme) });
  return {
    dark: theme.is_dark,
    ...(theme.fx ? { fx: { ...theme.fx } } : {}),
    colors: {
      background: bg, text: hex(parseColor(theme.font_color)), accent: hex(parseColor(theme.accent_color)),
      secondary: hex(parseColor(theme.secondary_accent ?? theme.accent_color)), card, border: theme.card_border ? hex(parseColor(theme.card_border)) : over(bg, hex(parseColor(theme.font_color)), 0.22),
      danger: sem.danger.solid, warning: sem.warning.solid, success: sem.success.solid, info: sem.info.solid,
    },
  };
}

let table: Map<string, Entry> | null = null;

function previewOf(theme: SimpleGUITheme, v: Record<string, string>): ThemePreview {
  const fx = theme.fx;
  return {
    bg: v.bg!,
    panel: v.panel!,
    accent: v.accent!,
    text: v.text!,
    muted: v.muted!,
    border: v.border!,
    selected: v.selected!,
    selectedText: v["selected-text"]!,
    radius: fx?.radius ?? "soft",
    glow: fx?.glow ?? "none",
    glowColor: fx?.glowColor ?? v.accent!,
    borderStyle: fx?.border ?? "flat",
  };
}

function fallbackMetaFor(key: string, theme: SimpleGUITheme): { fallbackKey?: string; fallbackName?: string } {
  if (!theme.fx) return {};
  const fbKey = FX_FALLBACK_THEMES[key] ?? getFallbackThemeKey(key);
  let resolvedKey = fbKey && fbKey !== key && SIMPLEGUI_THEMES[fbKey] ? fbKey : (theme.is_dark ? "midnight" : "apple_light");
  const fbTheme = SIMPLEGUI_THEMES[resolvedKey];
  if (fbTheme?.name) {
    const firstKey = Object.keys(SIMPLEGUI_THEMES).sort().find((k) => SIMPLEGUI_THEMES[k]?.name === fbTheme.name);
    if (firstKey) resolvedKey = firstKey;
  }
  return { fallbackKey: resolvedKey, fallbackName: fbTheme?.name ?? resolvedKey };
}

function templateTierMeta(key: string, theme: SimpleGUITheme): Pick<ThemeSummary, "tier" | "motion" | "atmosphere" | "cursorEffect" | "backdropStyle" | "uiElementFx" | "iconPackStyle"> {
  const fx = theme.fx;
  if (!fx) {
    return { tier: "low", motion: "none", backdropStyle: "solid" };
  }
  const hay = `${key} ${theme.name} ${theme.description ?? ""}`;
  let backdropStyle: string = fx.backdropStyle ?? "";
  if (!backdropStyle) {
    if (/liquid|tahoe|vision|spatial|caustic|fluid|ferrofluid|soliton/i.test(hay) || ((fx.glass ?? 0) >= 0.65 && (fx.blur ?? 0) >= 24 && fx.sheen)) {
      backdropStyle = "liquid";
    } else if (/mica|acrylic|win11|fluent|copilot|aero/i.test(hay) || (fx.noise && (fx.blur ?? 0) >= 16)) {
      backdropStyle = "mica";
    } else if ((fx.blur ?? 0) >= 18) {
      backdropStyle = "frosted";
    } else {
      backdropStyle = "glass";
    }
  }
  const hasAtmo = Boolean(fx.atmosphere && fx.atmosphere !== "none");
  const isUltra =
    hasAtmo
    || (fx.blur ?? 0) >= 18
    || backdropStyle === "liquid"
    || fx.glow === "plasma"
    || fx.glow === "laser"
    || fx.glow === "bloom"
    || Boolean(fx.prismEdge)
    || Boolean(fx.chromatic)
    || Boolean(fx.uiElementFx && fx.uiElementFx !== "off");
  return {
    tier: isUltra ? "ultra" : "medium",
    motion: fx.motion ?? "calm",
    ...(hasAtmo ? { atmosphere: fx.atmosphere } : {}),
    ...(fx.cursorEffect && fx.cursorEffect !== "none" ? { cursorEffect: fx.cursorEffect } : {}),
    ...(fx.uiElementFx && fx.uiElementFx !== "off" ? { uiElementFx: fx.uiElementFx } : {}),
    ...(fx.iconPackStyle && fx.iconPackStyle !== "default" ? { iconPackStyle: fx.iconPackStyle } : {}),
    backdropStyle,
  };
}

function build(): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const seenNames = new Set<string>();
  for (const key of Object.keys(SIMPLEGUI_THEMES).sort()) {
    const theme = SIMPLEGUI_THEMES[key]!;
    if (!theme?.name || seenNames.has(theme.name) || !/^[a-z0-9_]{1,60}$/.test(key)) continue;
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

export const listThemes = (): ThemeSummary[] => [...entries().values()].map((e) => e.summary);

function summaryOf(key: string, theme: SimpleGUITheme, group: ThemeGroup): ThemeSummary & ThemeVars {
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

export function getThemeColours(key: unknown): (ThemeSummary & ThemeVars) | null {
  if (typeof key !== "string") return null;
  const e = entries().get(key);
  if (!e) return null;
  e.computed ??= themeVars(e.theme);
  return { ...e.summary, ...e.computed };
}

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
  opts?: { revertToFallbackTheme?: boolean }
): FmHardwareThemeResult | null {
  const requested = getThemeColours(key);
  if (!requested) return null;
  const hardware = detectThemeHardware(hw);
  const revert = opts?.revertToFallbackTheme !== false;
  if (requested.hasEffects && hardware.shouldUseFallbackTheme) {
    const fbKey = requested.fallbackKey ?? (requested.dark ? "midnight" : "apple_light");
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
  const { notes: _notes, scheme: _scheme, vars: _vars, effects: _effects, contrast: _contrast, ...summary } = summaryOf(t.id, toSimpleTheme(t), "My themes");
  return summary;
};

async function resolve(ctx: FmContext, key: unknown): Promise<{ colours: ThemeSummary & ThemeVars; source: ThemeSource; draft?: CustomTheme } | null> {
  if (isCustomKey(key)) {
    const customList = await loadCustom(ctx);
    const found = customList.find((x) => x.id === key);
    return found ? { colours: summaryOf(found.id, toSimpleTheme(found), "My themes"), source: sourceOf(toSimpleTheme(found)), draft: found } : null;
  }
  const colours = getThemeColours(key);
  return colours ? { colours, source: sourceOf(entries().get(key as string)!.theme) } : null;
}

/** Converts any resolved theme (premade built-in or custom) into a portable ThemeDraft for sharing/exporting. */
async function resolveShareableDraft(ctx: FmContext, keyOrId: unknown): Promise<ThemeDraft | null> {
  const effectiveKey = (keyOrId === "" || keyOrId === "standard" || keyOrId === "default" || keyOrId === undefined || keyOrId === null)
    ? "tahoe_studio_3d"
    : keyOrId;
  const r = (await resolve(ctx, effectiveKey)) ?? (effectiveKey === "tahoe_studio_3d" ? await resolve(ctx, "dracula") : null);
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
  return (name || "theme")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "theme";
}

export const themeOperations: Record<string, FmHandler> = {
  async "themes/list"(ctx) {
    return { themes: [...(await loadCustom(ctx)).map(customSummary), ...listThemes()] };
  },
  async "themes/get"(ctx, b) {
    const r = await resolve(ctx, b.key);
    if (!r) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return { theme: r.colours, source: r.source, custom: r.draft ? { id: r.draft.id, name: r.draft.name, base: r.draft.base } : null };
  },
  async "themes/resolve-hardware"(_ctx, b) {
    const res = getThemeColoursForHardware(b.key, b.hardware as FxHardwareInput | undefined, {
      revertToFallbackTheme: b.revertToFallbackTheme !== false,
    });
    if (!res) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return res;
  },
  /** Works out the colors of a theme that isn't saved yet, so the editor can show it live. */
  async "themes/preview"(_ctx, b) {
    const raw = b.theme !== undefined ? b.theme : b;
    const draft = validateDraft(raw);
    const c = themeVars(toSimpleTheme(draft));
    return { theme: { key: "preview", name: draft.name, dark: draft.dark, ...c } };
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
      return { text: exportTheme(draft), shareCode: encodeThemeShareCode(draft), name: draft.name, theme: draft };
    }
    const targetKey = b.id ?? b.key;
    const draft = await resolveShareableDraft(ctx, targetKey);
    if (!draft) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return { text: exportTheme(draft), shareCode: encodeThemeShareCode(draft), name: draft.name, theme: draft };
  },
  /** Exports any theme draft or saved/premade theme key as a standalone `:root` CSS variables stylesheet. */
  async "themes/custom/export-css"(ctx, b) {
    if (b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      const c = themeVars(toSimpleTheme(draft));
      return { css: exportThemeCss(draft.name, c.scheme, c.vars, c.effects?.css, c.effects?.customCss, encodeThemeShareCode(draft)) };
    }
    const targetKey = b.key ?? b.id;
    const r = (await resolve(ctx, targetKey)) ?? ((targetKey === "" || targetKey === "standard" || targetKey === undefined) ? await resolve(ctx, "tahoe_studio_3d") : null);
    if (!r) throw new FmError("NOT_FOUND", "That theme isn't available.");
    const draft = await resolveShareableDraft(ctx, targetKey);
    return { css: exportThemeCss(r.colours.name, r.colours.scheme, r.colours.vars, r.colours.effects?.css, r.colours.effects?.customCss, draft ? encodeThemeShareCode(draft) : undefined) };
  },
  /** Exports custom themes and/or selected premade themes as a shareable Theme Pack JSON string + compact CCFM-PACK-v1 share code. */
  async "themes/custom/export-pack"(ctx, b) {
    if (Array.isArray(b.keys) && b.keys.length > 0) {
      const drafts: ThemeDraft[] = [];
      for (const k of b.keys.slice(0, 50)) {
        const d = await resolveShareableDraft(ctx, k);
        if (d) drafts.push(d);
      }
      if (!drafts.length) throw new FmError("NOT_FOUND", "None of the selected themes were found.");
      return { text: exportThemePack(drafts), shareCode: encodeThemePackShareCode(drafts), count: drafts.length };
    }
    const all = await loadCustom(ctx);
    const ids = Array.isArray(b.ids) ? b.ids.filter(isCustomKey) : null;
    const picked: ThemeDraft[] = (ids && ids.length ? all.filter((t) => ids.includes(t.id)) : all).map(({ id: _id, ...d }) => d);
    if (b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      if (!picked.some((t) => t.name.toLowerCase() === draft.name.toLowerCase())) {
        picked.unshift(draft);
      }
    }
    if (!picked.length) throw new FmError("NOT_FOUND", "Save at least one custom theme first to export a pack.");
    return { text: exportThemePack(picked), shareCode: encodeThemePackShareCode(picked), count: picked.length };
  },
  /** Saves an exported theme or theme pack directly as a file on disk inside `b.folder` (or the user's home folder). */
  async "themes/custom/save-file"(ctx, b) {
    const rawFolder = typeof b.folder === "string" && b.folder.trim() ? b.folder.trim() : ctx.home;
    const targetDir = nodePath.resolve(rawFolder);
    await fsp.mkdir(targetDir, { recursive: true });

    const fmt = typeof b.format === "string" ? b.format : "json";
    let content = typeof b.content === "string" ? b.content : "";
    let baseSlug = typeof b.name === "string" && b.name.trim() ? safeFileSlug(b.name) : "codecaine-theme";
    let ext = ".theme.json";

    if (!content) {
      if (fmt === "pack" || Array.isArray(b.keys)) {
        const packRes = (await themeOperations["themes/custom/export-pack"]!(ctx, b)) as { text: string; shareCode: string };
        content = fmt === "pack-code" ? packRes.shareCode : packRes.text;
        baseSlug = safeFileSlug(typeof b.name === "string" && b.name.trim() ? b.name : "codecaine-theme-pack");
        ext = fmt === "pack-code" ? ".ccfm-pack.txt" : ".theme-pack.json";
      } else if (fmt === "css") {
        const cssRes = (await themeOperations["themes/custom/export-css"]!(ctx, b)) as { css: string };
        content = cssRes.css;
        ext = ".theme.css";
      } else {
        const expRes = (await themeOperations["themes/custom/export"]!(ctx, b)) as { text: string; shareCode: string; name: string };
        baseSlug = safeFileSlug(expRes.name);
        content = fmt === "code" ? expRes.shareCode : expRes.text;
        ext = fmt === "code" ? ".ccfm.txt" : ".theme.json";
      }
    } else {
      if (fmt === "css") ext = ".theme.css";
      else if (fmt === "code") ext = ".ccfm.txt";
      else if (fmt.startsWith("pack")) ext = ".theme-pack.json";
    }

    let fileName = `${baseSlug}${ext}`;
    let fullPath = nodePath.join(targetDir, fileName);
    for (let i = 2; i < 200; i++) {
      try {
        await fsp.access(fullPath);
        fileName = `${baseSlug}-${i}${ext}`;
        fullPath = nodePath.join(targetDir, fileName);
      } catch {
        break;
      }
    }
    await fsp.writeFile(fullPath, content, "utf8");
    return { path: fullPath, name: fileName, bytes: Buffer.byteLength(content, "utf8") };
  },
  /** Reads a `.theme.json`, `.ccfm`, `.json`, `.txt`, or `.css` file from disk and returns its text for theme import. */
  async "themes/custom/read-file"(_ctx, b) {
    if (typeof b.path !== "string" || !b.path.trim()) throw new FmError("BAD_REQUEST", "Choose a theme file first.");
    const resolved = nodePath.resolve(b.path.trim());
    const st = await fsp.stat(resolved).catch(() => null);
    if (!st || !st.isFile()) throw new FmError("NOT_FOUND", "That theme file could not be found.");
    if (st.size > 600_000) throw new FmError("BAD_REQUEST", "That file is too large to be a theme file.");
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
      ...(typeof b.onConflict === "string" ? { onConflict: b.onConflict as BulkImportOptions["onConflict"] } : {}),
      ...(b.resolutions !== undefined ? { resolutions: b.resolutions as BulkImportOptions["resolutions"] } : {}),
      ...(Array.isArray(b.includeIndices) ? { includeIndices: b.includeIndices.filter((n: unknown) => typeof n === "number") } : {}),
      ...(b.autoRenameConflicts === true ? { autoRenameConflicts: true } : {}),
    };
    const report = await importThemePackWithReport(ctx, b.text ?? b.json ?? b.themes, opts);
    return {
      imported: report.imported.map((t) => ({ id: t.id, name: t.name, dark: t.dark, colors: t.colors, fx: t.fx, base: t.base })),
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
