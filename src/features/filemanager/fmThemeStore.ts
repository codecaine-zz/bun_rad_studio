/**
 * The themes people make themselves in the File Manager's theme editor: checked, kept in their own small file
 * (`file_manager_themes.json` in the app's data folder) and turned into the same shape as the built-in themes.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import type { SimpleGUITheme } from "../../simplegui";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import type { ThemeFx } from "../../shared/fxThemes";

export const MAX_CUSTOM_THEMES = 50;
export const MAX_THEME_NAME = 40;
export const MAX_IMPORT_BYTES = 20_000;
export const EXPORT_FORMAT = "bun-rad-studio-file-manager-theme";

export const REQUIRED_COLOURS = ["background", "text", "accent"] as const;
export const OPTIONAL_COLOURS = ["secondary", "card", "border", "danger", "warning", "success", "info"] as const;
export const COLOUR_KEYS = [...REQUIRED_COLOURS, ...OPTIONAL_COLOURS] as const;
export type ColourKey = (typeof COLOUR_KEYS)[number];

export interface ThemeDraft {
  name: string;
  dark: boolean;
  /** The name of the theme it started from, shown for reference only. */
  base: string;
  colors: Partial<Record<ColourKey, string>>;
  fx?: ThemeFx;
}

export interface CustomTheme extends ThemeDraft {
  id: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();

/** Checks what the editor sent. Throws a plain-words error for anything wrong. */
export function validateDraft(input: unknown): ThemeDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FmError("BAD_REQUEST", "That theme isn't in a form this app understands.");
  const r = input as Record<string, unknown>;
  const name = typeof r.name === "string" ? clean(r.name) : "";
  if (!name) throw new FmError("BAD_REQUEST", "Give the theme a name.");
  if (name.length > MAX_THEME_NAME) throw new FmError("BAD_REQUEST", `Keep the name to ${MAX_THEME_NAME} letters or fewer.`);
  const raw = r.colors && typeof r.colors === "object" && !Array.isArray(r.colors) ? (r.colors as Record<string, unknown>) : {};
  const colors: Partial<Record<ColourKey, string>> = {};
  for (const key of COLOUR_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null || v === "") {
      if ((REQUIRED_COLOURS as readonly string[]).includes(key)) throw new FmError("BAD_REQUEST", `Choose a ${key} colour.`);
      continue;
    }
    if (typeof v !== "string" || !HEX.test(v.trim())) throw new FmError("BAD_REQUEST", `The ${key} colour must look like #1a2b3c.`);
    colors[key] = v.trim().toLowerCase();
  }
  const fx = r.fx === undefined ? undefined : validateEffects(r.fx, colors.accent!);
  return { name, dark: r.dark === true, base: typeof r.base === "string" ? clean(r.base).slice(0, MAX_THEME_NAME) : "", colors, ...(fx ? { fx } : {}) };
}

function validateEffects(input: unknown, accent: string): ThemeFx {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FmError("BAD_REQUEST", "Theme effects must be an object.");
  const r = input as Record<string, unknown>;
  const choice = <T extends string>(key: string, choices: readonly T[], fallback: T): T => {
    if (r[key] === undefined) return fallback;
    const found = choices.find((value) => value === r[key]);
    if (!found) throw new FmError("BAD_REQUEST", `Choose a valid ${key} effect.`);
    return found;
  };
  const number = (key: string, max: number, fallback: number): number => {
    const value = r[key] ?? fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) throw new FmError("BAD_REQUEST", `The ${key} effect must be between 0 and ${max}.`);
    return value;
  };
  const flag = (key: string): boolean => {
    if (r[key] !== undefined && typeof r[key] !== "boolean") throw new FmError("BAD_REQUEST", `The ${key} effect must be on or off.`);
    return r[key] === true;
  };
  const color = (key: string, fallback: string): string => {
    const value = r[key] ?? fallback;
    if (typeof value !== "string" || !HEX.test(value)) throw new FmError("BAD_REQUEST", `The ${key} effect colour must look like #1a2b3c.`);
    return value.toLowerCase();
  };
  return {
    glow: choice("glow", ["none", "soft", "neon"], "soft"),
    glowColor: color("glowColor", accent), glowColor2: color("glowColor2", accent),
    blur: number("blur", 32, 16), glass: number("glass", 1, 0.4),
    glowIntensity: number("glowIntensity", 1, 1), borderOpacity: number("borderOpacity", 1, 0.16),
    grain: choice("grain", ["none", "subtle"], "none"), scanlines: choice("scanlines", ["none", "subtle"], "none"),
    radius: choice("radius", ["sharp", "soft", "round", "pill"], "soft"),
    border: choice("border", ["flat", "gradient", "metal"], "flat"),
    motion: choice("motion", ["calm", "spring", "snappy"], "calm"),
    sheen: flag("sheen"), noise: flag("noise"), chromatic: flag("chromatic"), ambient: flag("ambient"),
  };
}

/** The shape the built-in themes have, so one code path makes the page colours for both. */
export function toSimpleTheme(t: ThemeDraft): SimpleGUITheme {
  const c = t.colors;
  const semantic: Record<string, string> = {};
  for (const k of ["danger", "warning", "success", "info"] as const) if (c[k]) semantic[k] = c[k]!;
  return {
    name: t.name,
    background_color: c.background!,
    font_color: c.text!,
    accent_color: c.accent!,
    secondary_accent: c.secondary,
    card_background: c.card,
    card_border: c.border,
    description: t.base ? `Your theme, started from ${t.base}` : "Your own theme",
    is_dark: t.dark,
    semantic: Object.keys(semantic).length ? semantic : undefined,
    fx: t.fx,
  };
}

const file = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_themes.json");
const ID = /^custom_[0-9a-f]{8}$/;
export const isCustomKey = (key: unknown): key is string => typeof key === "string" && ID.test(key);

export async function loadCustom(ctx: FmContext): Promise<CustomTheme[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fsp.readFile(file(ctx), "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray((parsed as any)?.themes) ? (parsed as any).themes : [];
  const out: CustomTheme[] = [];
  for (const item of list.slice(0, MAX_CUSTOM_THEMES)) {
    try {
      if (isCustomKey(item?.id) && !out.some((t) => t.id === item.id)) out.push({ id: item.id, ...validateDraft(item) });
    } catch {
      // A damaged entry is left out; the rest still load.
    }
  }
  return out;
}

let writing: Promise<unknown> = Promise.resolve();

async function saveAll(ctx: FmContext, themes: CustomTheme[]): Promise<void> {
  const run = async () => {
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    const tmp = `${file(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, themes }, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, file(ctx));
  };
  const result = writing.then(run, run);
  writing = result.catch(() => {});
  await result;
}

/** Saves a new theme, or replaces the one with `id`. */
export async function saveCustom(ctx: FmContext, draftInput: unknown, id?: unknown): Promise<CustomTheme> {
  const draft = validateDraft(draftInput);
  const all = await loadCustom(ctx);
  if (id !== undefined && id !== null && id !== "") {
    if (!isCustomKey(id)) throw new FmError("BAD_REQUEST", "That isn't one of your themes.");
    const i = all.findIndex((t) => t.id === id);
    if (i < 0) throw new FmError("NOT_FOUND", "That theme has been deleted.");
    all[i] = { id, ...draft };
    await saveAll(ctx, all);
    return all[i]!;
  }
  if (all.length >= MAX_CUSTOM_THEMES) throw new FmError("TOO_MANY", `You can keep up to ${MAX_CUSTOM_THEMES} themes of your own. Delete one first.`);
  const made: CustomTheme = { id: `custom_${randomBytes(4).toString("hex")}`, ...draft };
  all.push(made);
  await saveAll(ctx, all);
  return made;
}

export async function deleteCustom(ctx: FmContext, id: unknown): Promise<void> {
  if (!isCustomKey(id)) throw new FmError("BAD_REQUEST", "That isn't one of your themes.");
  const all = await loadCustom(ctx);
  if (!all.some((t) => t.id === id)) throw new FmError("NOT_FOUND", "That theme has already been deleted.");
  await saveAll(ctx, all.filter((t) => t.id !== id));
}

/** The text a person can copy to share a theme. */
export const exportTheme = (t: ThemeDraft): string => JSON.stringify({ format: EXPORT_FORMAT, version: 1, name: t.name, dark: t.dark, colors: t.colors, ...(t.fx ? { fx: t.fx } : {}) }, null, 2);

/** Reads shared theme text. Accepts the exported form or a bare `{ name, dark, colors }`. */
export function parseShared(text: unknown): ThemeDraft {
  if (typeof text !== "string" || !text.trim()) throw new FmError("BAD_REQUEST", "Paste the theme text first.");
  if (text.length > MAX_IMPORT_BYTES) throw new FmError("BAD_REQUEST", "That text is too long to be a theme.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FmError("BAD_REQUEST", "That text isn't a theme. Copy the whole text from Export.");
  }
  if (data && typeof data === "object" && (data as any).format !== undefined && (data as any).format !== EXPORT_FORMAT) throw new FmError("BAD_REQUEST", "That isn't a File Manager theme.");
  return validateDraft(data);
}
