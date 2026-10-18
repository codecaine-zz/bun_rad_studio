/**
 * Color themes for the File Manager page. They come from the same table the SimpleGUI apps use, so every theme
 * there can be picked here. Each one is turned into the page's own color variables, and every text and background
 * pair is nudged until it passes the contrast checks that tests/file_manager_themes.test.ts runs on all of them.
 */
import type { SimpleGUITheme } from "../../simplegui";
import { SIMPLEGUI_THEMES } from "../../shared/simpleguiThemes";
import { FX_THEME_KEYS, fxCssVars, fxRootAttrs, glassReport, type ThemeFx } from "../../shared/fxThemes";
import { OS_THEME_KEYS, RARE_OS_THEME_KEYS } from "../../shared/osThemes";
import { buildSemanticPalette, contrastRatio, overridesForTheme, parseColor, toHex } from "../../shared/themeSemantic";
import { FmError } from "./fmPaths";
import type { FmContext, FmHandler } from "./fmCore";
import { deleteCustom, exportTheme, exportThemeCss, exportThemePack, importThemePack, isCustomKey, loadCustom, parseShared, saveCustom, toSimpleTheme, validateDraft, type CustomTheme, type ThemeDraft } from "./fmThemeStore";

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
  radius: "sharp" | "soft" | "round" | "pill";
  glow: "none" | "soft" | "neon";
  glowColor: string;
  borderStyle: "flat" | "gradient" | "metal";
}

export interface ThemeContrastItem {
  pair: string;
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  grade: "AAA" | "AA" | "AA Large";
}

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
}

export interface ThemeVars {
  scheme: "light" | "dark";
  vars: Record<string, string>;
  /** Plain-words notes about colors that were changed to keep the text readable. */
  notes: string[];
  /** WCAG contrast telemetry for key foreground/surface pairs. */
  contrast: ThemeContrastItem[];
  effects?: { css: string; attrs: Record<string, string> };
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
    effects = {
      css: fxCssVars(safe) + ` --fx-glass-bg: rgba(${r}, ${g}, ${b}, ${opacity}); --fx-glass-alpha: ${opacity};`,
      attrs: fxRootAttrs(safe),
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
    accent, "accent-text": accentText,
    "accent-soft": accentSoft,
    "focus-ring": focusRing,
    "scrollbar-thumb": scrollbarThumb,
    selected, "selected-text": selectedText, hover,
    danger, "danger-bg": dangerBg, "danger-text": dangerText,
    "toast-bg": toastBg, "toast-text": toastText, "toast-action": toastAction, "toast-good": toastGood, "toast-bad": toastBad,
    good, "warn-bg": warnBg, "warn-text": warnText,
    shadow: dark ? "0 8px 28px rgba(0, 0, 0, 0.6)" : "0 8px 28px rgba(15, 23, 42, 0.22)",
  };

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

function build(): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const seenNames = new Set<string>();
  for (const key of Object.keys(SIMPLEGUI_THEMES).sort()) {
    const theme = SIMPLEGUI_THEMES[key]!;
    if (!theme?.name || seenNames.has(theme.name) || !/^[a-z0-9_]{1,60}$/.test(key)) continue;
    seenNames.add(theme.name);
    const v = themeVars(theme).vars;
    out.set(key, {
      theme,
      summary: { key, name: theme.name, description: theme.description ?? "", dark: theme.is_dark, group: groupOf(key, theme), swatch: [v.bg!, v.panel!, v.accent!, v.text!], preview: previewOf(theme, v), hasEffects: !!theme.fx },
    });
  }
  return out;
}

const entries = () => (table ??= build());

export const listThemes = (): ThemeSummary[] => [...entries().values()].map((e) => e.summary);

function summaryOf(key: string, theme: SimpleGUITheme, group: ThemeGroup): ThemeSummary & ThemeVars {
  const computed = themeVars(theme);
  const v = computed.vars;
  return { key, name: theme.name, description: theme.description ?? "", dark: theme.is_dark, group, swatch: [v.bg!, v.panel!, v.accent!, v.text!], preview: previewOf(theme, v), hasEffects: !!theme.fx, ...computed };
}

export function getThemeColours(key: unknown): (ThemeSummary & ThemeVars) | null {
  if (typeof key !== "string") return null;
  const e = entries().get(key);
  if (!e) return null;
  e.computed ??= themeVars(e.theme);
  return { ...e.summary, ...e.computed };
}

const customSummary = (t: CustomTheme): ThemeSummary => {
  const { notes: _notes, scheme: _scheme, vars: _vars, effects: _effects, contrast: _contrast, ...summary } = summaryOf(t.id, toSimpleTheme(t), "My themes");
  return summary;
};

async function resolve(ctx: FmContext, key: unknown): Promise<{ colours: ThemeSummary & ThemeVars; source: ThemeSource; draft?: CustomTheme } | null> {
  if (isCustomKey(key)) {
    const t = (await loadCustom(ctx)).find((x) => x.id === key);
    return t ? { colours: summaryOf(t.id, toSimpleTheme(t), "My themes"), source: sourceOf(toSimpleTheme(t)), draft: t } : null;
  }
  const colours = getThemeColours(key);
  return colours ? { colours, source: sourceOf(entries().get(key as string)!.theme) } : null;
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
  /** Works out the colors of a theme that isn't saved yet, so the editor can show it live. */
  async "themes/preview"(_ctx, b) {
    const draft = validateDraft(b.theme);
    const c = themeVars(toSimpleTheme(draft));
    return { theme: { key: "preview", name: draft.name, dark: draft.dark, ...c } };
  },
  async "themes/custom/save"(ctx, b) {
    const saved = await saveCustom(ctx, b.theme, b.id);
    return { id: saved.id, name: saved.name };
  },
  async "themes/custom/delete"(ctx, b) {
    await deleteCustom(ctx, b.id);
    return {};
  },
  async "themes/custom/export"(ctx, b) {
    const t = isCustomKey(b.id) ? (await loadCustom(ctx)).find((x) => x.id === b.id) : null;
    if (!t) throw new FmError("NOT_FOUND", "That theme isn't one of yours.");
    return { text: exportTheme(t) };
  },
  /** Exports any theme draft or saved theme key as a standalone `:root` CSS variables stylesheet. */
  async "themes/custom/export-css"(ctx, b) {
    if (b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      const c = themeVars(toSimpleTheme(draft));
      return { css: exportThemeCss(draft.name, c.scheme, c.vars, c.effects?.css) };
    }
    const r = await resolve(ctx, b.key ?? b.id);
    if (!r) throw new FmError("NOT_FOUND", "That theme isn't available.");
    return { css: exportThemeCss(r.colours.name, r.colours.scheme, r.colours.vars, r.colours.effects?.css) };
  },
  /** Exports all custom themes (or a subset by IDs) as a shareable Theme Pack JSON string. */
  async "themes/custom/export-pack"(ctx, b) {
    const all = await loadCustom(ctx);
    const ids = Array.isArray(b.ids) ? b.ids.filter(isCustomKey) : null;
    const picked = ids && ids.length ? all.filter((t) => ids.includes(t.id)) : all;
    if (!picked.length && b.theme && typeof b.theme === "object") {
      const draft = validateDraft(b.theme);
      return { text: exportThemePack([draft]), count: 1 };
    }
    if (!picked.length) throw new FmError("NOT_FOUND", "Save at least one custom theme first to export a pack.");
    return { text: exportThemePack(picked), count: picked.length };
  },
  /** Imports a Theme Pack (or single theme) and saves all themes into the user's custom themes. */
  async "themes/custom/import-pack"(ctx, b) {
    const created = await importThemePack(ctx, b.text);
    return { imported: created.map((t) => ({ id: t.id, name: t.name })), count: created.length, first: created[0] ?? null };
  },
  /** Reads shared theme text and returns it as a draft for the editor (nothing is saved yet). */
  async "themes/custom/import"(_ctx, b) {
    const draft: ThemeDraft = parseShared(b.text);
    return { theme: draft };
  },
};
