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
import { normalizeAtmosphereSpec } from "../../../resources/file_manager/ui/atmosphereCatalog.js";

export const MAX_CUSTOM_THEMES = 50;
export const MAX_THEME_NAME = 40;
export const MAX_IMPORT_BYTES = 20_000;
export const MAX_PACK_IMPORT_BYTES = 200_000;
export const EXPORT_FORMAT = "bun-rad-studio-file-manager-theme";
export const EXPORT_PACK_FORMAT = "bun-rad-studio-file-manager-theme-pack";

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
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
const expandHex = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const m = v.trim().match(SHORT_HEX);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : v;
};

/**
 * Forward- and backward-compatible migration for shared theme objects and packs:
 * expands 3-digit hex codes (#abc -> #aabbcc), maps SimpleGUI keys (background_color, font_color, etc.),
 * and ignores unknown future schema fields.
 */
export function migrateThemeInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const r = input as Record<string, unknown>;
  const rawColors = r.colors && typeof r.colors === "object" && !Array.isArray(r.colors) ? { ...(r.colors as Record<string, unknown>) } : {};
  const legacyMap: Array<[string, ColourKey]> = [
    ["background_color", "background"],
    ["font_color", "text"],
    ["accent_color", "accent"],
    ["secondary_accent", "secondary"],
    ["card_background", "card"],
    ["card_border", "border"],
  ];
  for (const [legacyKey, targetKey] of legacyMap) {
    if (rawColors[targetKey] === undefined && typeof r[legacyKey] === "string") rawColors[targetKey] = r[legacyKey];
  }
  if (r.semantic && typeof r.semantic === "object" && !Array.isArray(r.semantic)) {
    const sem = r.semantic as Record<string, unknown>;
    for (const k of ["danger", "warning", "success", "info"] as const) {
      if (rawColors[k] === undefined && typeof sem[k] === "string") rawColors[k] = sem[k];
    }
  }
  for (const k of Object.keys(rawColors)) rawColors[k] = expandHex(rawColors[k]);
  let fx = r.fx;
  if (fx && typeof fx === "object" && !Array.isArray(fx)) {
    const fxObj = { ...(fx as Record<string, unknown>) };
    if (fxObj.glowColor !== undefined) fxObj.glowColor = expandHex(fxObj.glowColor);
    if (fxObj.glowColor2 !== undefined) fxObj.glowColor2 = expandHex(fxObj.glowColor2);
    fx = fxObj;
  }
  return {
    ...r,
    dark: typeof r.dark === "boolean" ? r.dark : r.is_dark === true,
    colors: rawColors,
    ...(fx !== undefined ? { fx } : {}),
  };
}

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
      if ((REQUIRED_COLOURS as readonly string[]).includes(key)) throw new FmError("BAD_REQUEST", `Choose a ${key} color.`);
      continue;
    }
    if (typeof v !== "string" || !HEX.test(v.trim())) throw new FmError("BAD_REQUEST", `The ${key} color must look like #1a2b3c.`);
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
    if (typeof value !== "string" || !HEX.test(value)) throw new FmError("BAD_REQUEST", `The ${key} effect color must look like #1a2b3c.`);
    return value.toLowerCase();
  };
  let atmosphere = "none";
  if (r.atmosphere !== undefined) {
    const parsedAtmo = normalizeAtmosphereSpec(r.atmosphere, { strict: true });
    if (!parsedAtmo) throw new FmError("BAD_REQUEST", "Choose a valid atmosphere effect.");
    atmosphere = parsedAtmo;
  }
  const backdropStyle = r.backdropStyle !== undefined ? choice("backdropStyle", ["glass", "liquid", "mica", "acrylic", "frosted", "oled", "matte"], "glass") : undefined;
  const cursorEffect = r.cursorEffect !== undefined ? choice("cursorEffect", ["none", "spotlight", "ripple", "magnetic", "prism"], "spotlight") : undefined;
  const vignette = r.vignette !== undefined ? choice("vignette", ["none", "subtle", "cinema", "ambient"], "none") : undefined;
  const saturation = r.saturation !== undefined ? number("saturation", 2.5, 1.35) : undefined;
  const uiElementFx = r.uiElementFx !== undefined ? choice("uiElementFx", ["off", "tahoe_glass_folders", "fluent_mica_folders", "xdr_titanium_folders", "google_material_folders", "cupertino_ceramic_bevel", "swiss_sapphire_chronograph", "teenage_field_anodized", "blueprint_cad_cyanotype", "kyoto_washi_sumi", "carbon_kevlar_weave", "fire_folders", "slime_drip", "cryo_frost", "tesla_arcs", "storm_wind", "mercury_chrome", "holo_glitch", "void_tentacles", "kaleidoscope_prism", "lava_wax", "acid_warp", "oil_slick_chrome", "shroom_spores", "holiday_festive_glow", "nerd_arcane_runes", "nerd_lcars_hud", "horror_blood_moon", "horror_vhs_static", "realworld_mahogany_brass", "realworld_stained_glass", "screen_melt_ooze", "molten_lava_melt", "crt_magnetic_warp", "fever_dream_ripple", "godmode_omega_halo", "godmode_photonic_crystal", "godmode_dyson_lattice", "godmode_chrono_crystal", "godmode_neural_synapse", "godmode_zero_point_arc", "flash_3000_vector_hud", "spinning_3d_holo_folders", "c4d_mograph_extrude_folders", "houdini_procedural_vex_hud"], "off") : undefined;
  const iconPackStyle = r.iconPackStyle !== undefined ? choice("iconPackStyle", ["default", "macos_tahoe_3d", "win11_fluent_pro", "pro_studio_xdr", "hdr_photo_studio", "linux_papirus_pro", "nordic_minimal", "google_material_3d", "cupertino_hig_studio", "swiss_horology_gold", "teenage_field_synth", "blueprint_cad_pro", "kyoto_zen_ink", "carbon_aerospace", "inferno", "inferno_burn", "slime", "bio_slime", "storm_tempest", "storm_weather", "neon_cyber", "liquid_gems", "liquid_chrome", "cryo_crystal", "retro_pixel", "arcane_glyphs", "xenotech_2126", "psychedelic_trip", "lava_groovy", "op_art_illusion", "us_holidays_festive", "nerd_rpg_arcane", "nerd_scifi_fleet", "nerd_hacker_retro", "horror_crypt", "realworld_objects", "godmode_celestial", "godmode_photonic", "godmode_quantum", "godmode_chrono", "godmode_omni_pantheon", "macos_sequoia_hig", "apple_vision_glass_3d", "dev_polyglot_pro", "creative_cinema_8k", "cyberdeck_matrix_hud", "royal_24k_gold_obsidian", "anime_mecha_neon", "steampunk_brass_clockwork", "bioluminescent_eden", "holo_prismatic_foil", "stained_glass_cathedral_pro", "synthwave_outrun_1984", "nasa_apollo_telemetry", "obsidian_blood_ruby", "aurora_nordic_ice", "vaporwave_marble_plaza", "quantum_superconductor"], "default") : undefined;
  const fontProfile = r.fontProfile !== undefined ? choice("fontProfile", ["default", "scifi", "terminal", "editorial", "rounded", "humanist_hig", "swiss_grotesk", "drafting_cad"], "default") : undefined;
  const cornerProfile = r.cornerProfile !== undefined ? choice("cornerProfile", ["default", "sharp", "chamfered", "rounded", "squircle_hig", "pill"], "default") : undefined;
  const iconGlow = r.iconGlow !== undefined ? choice("iconGlow", ["off", "subtle", "ambient_p3", "xdr_specular", "neon", "hyper"], "off") : undefined;
  const iconAnimation = r.iconAnimation !== undefined ? choice("iconAnimation", ["off", "spring_pop_3d", "levitate_float", "holo_foil_shimmer", "orbital_halo_spin", "cyber_glitch_pulse", "heartbeat_biolum", "clockwork_gear_tick", "liquid_jelly_morph", "plasma_arc_surge", "fire_ember_flicker", "godmode_pantheon_ascend", "folder_3d_spin_turntable", "flash_2advanced_vector_hud", "folder_3d_flip_origami", "gyro_3d_cube_matrix", "flash_fwa_kinetic_eq", "hologram_3d_projector_beam", "quantum_3d_phase_split", "m4_liquid_metal_morph", "houdini_vex_particle_burst", "c4d_mograph_cloner_wave", "after_effects_graph_overshoot", "unreal_nanite_mesh_lod", "blender_geometry_nodes_bloom", "raytraced_caustic_refraction"], "off") : undefined;
  const customVars = r.customVars !== undefined ? validateCustomVars(r.customVars) : undefined;
  const customCss = r.customCss !== undefined ? sanitizeCustomCss(r.customCss) : undefined;
  return {
    glow: choice("glow", ["none", "soft", "neon", "bloom", "aurora", "laser", "plasma", "ember"], "soft"),
    glowColor: color("glowColor", accent), glowColor2: color("glowColor2", accent),
    blur: number("blur", 32, 16), glass: number("glass", 1, 0.4),
    glowIntensity: number("glowIntensity", 1, 1), borderOpacity: number("borderOpacity", 1, 0.16),
    grain: choice("grain", ["none", "subtle", "film", "halftone"], "none"),
    scanlines: choice("scanlines", ["none", "subtle", "crt", "interlace"], "none"),
    radius: choice("radius", ["sharp", "soft", "round", "pill", "squircle"], "soft"),
    border: choice("border", ["flat", "gradient", "metal", "hologram", "neon", "iridescent", "bevel", "double"], "flat"),
    motion: choice("motion", ["calm", "spring", "snappy", "elastic", "cinematic", "zero"], "calm"),
    sheen: flag("sheen"), noise: flag("noise"), chromatic: flag("chromatic"), ambient: flag("ambient"),
    ...(atmosphere !== "none" ? { atmosphere } : {}),
    ...(backdropStyle !== undefined ? { backdropStyle } : {}),
    ...(cursorEffect !== undefined ? { cursorEffect } : {}),
    ...(vignette !== undefined ? { vignette } : {}),
    ...(saturation !== undefined ? { saturation } : {}),
    ...(uiElementFx && uiElementFx !== "off" ? { uiElementFx } : {}),
    ...(iconPackStyle && iconPackStyle !== "default" ? { iconPackStyle } : {}),
    ...(fontProfile && fontProfile !== "default" ? { fontProfile } : {}),
    ...(cornerProfile && cornerProfile !== "default" ? { cornerProfile } : {}),
    ...(iconGlow && iconGlow !== "off" ? { iconGlow } : {}),
    ...(iconAnimation && iconAnimation !== "off" ? { iconAnimation } : {}),
    ...(customVars && Object.keys(customVars).length ? { customVars } : {}),
    ...(customCss ? { customCss } : {}),
    ...(r.prismEdge !== undefined ? { prismEdge: flag("prismEdge") } : {}),
    ...(r.innerGlow !== undefined ? { innerGlow: flag("innerGlow") } : {}),
    ...(r.frostedRim !== undefined ? { frostedRim: flag("frostedRim") } : {}),
    ...(r.neonPulse !== undefined ? { neonPulse: flag("neonPulse") } : {}),
    ...(r.crtCurve !== undefined ? { crtCurve: flag("crtCurve") } : {}),
    ...(r.parallax !== undefined ? { parallax: flag("parallax") } : {}),
  };
}

const SAFE_VAR_KEY = /^[a-z][a-z0-9-]{0,48}$/i;
const UNSAFE_CSS_VALUE = /[;{}<>]|url\s*\(|javascript:|expression\s*\(|@import/i;

/** Validates per-token CSS custom property overrides (`customVars`) for deep theme hacking. */
export function validateCustomVars(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FmError("BAD_REQUEST", "Custom variable overrides must be an object.");
  const out: Record<string, string> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 64) throw new FmError("BAD_REQUEST", "Keep custom variable overrides to 64 tokens or fewer.");
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey).trim().replace(/^--/, "");
    if (!SAFE_VAR_KEY.test(key)) throw new FmError("BAD_REQUEST", `Invalid CSS variable name "--${key}".`);
    if (rawVal === undefined || rawVal === null || rawVal === "") continue;
    if (typeof rawVal !== "string") throw new FmError("BAD_REQUEST", `The value for "--${key}" must be a string.`);
    const val = clean(rawVal).slice(0, 160);
    if (!val) continue;
    if (UNSAFE_CSS_VALUE.test(val)) throw new FmError("BAD_REQUEST", `The value for "--${key}" contains disallowed CSS syntax.`);
    out[key] = val;
  }
  return out;
}

/** Sanitizes personal CSS overrides (`customCss`) so users can hack selectors, keyframes, and shaders safely without XSS/external requests. */
export function sanitizeCustomCss(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") throw new FmError("BAD_REQUEST", "Custom CSS must be text.");
  if (raw.length > 8000) throw new FmError("BAD_REQUEST", "Keep custom CSS overrides under 8,000 characters.");
  const stripped = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/<\/?\s*style[^>]*>/gi, "")
    .replace(/<\/?\s*script[^>]*>/gi, "")
    .replace(/@import\b[^;{}]*;?/gi, "")
    .replace(/url\s*\(\s*['"]?\s*(?:https?:|ftp:|data:text\/html|javascript:|vbscript:|file:|\/\/)[^)]*\)/gi, "none")
    .replace(/expression\s*\([^)]*\)/gi, "none")
    .replace(/-moz-binding\s*:[^;{}]*/gi, "")
    .replace(/behavior\s*:[^;{}]*/gi, "")
    .replace(/javascript\s*:/gi, "")
    .trim();
  return stripped;
}

export const THEME_SHARE_CODE_PREFIX = "CCFM-THEME-v1:";
export const PACK_SHARE_CODE_PREFIX = "CCFM-PACK-v1:";

/** Encodes any ThemeDraft (premade or custom/hacked) into a compact one-line shareable code (`CCFM-THEME-v1:...`). */
export function encodeThemeShareCode(t: ThemeDraft): string {
  const payload = {
    format: EXPORT_FORMAT,
    version: 1,
    name: t.name,
    dark: t.dark,
    ...(t.base ? { base: t.base } : {}),
    colors: t.colors,
    ...(t.fx ? { fx: t.fx } : {}),
  };
  return `${THEME_SHARE_CODE_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

/** Encodes an array of ThemeDrafts (premade + custom bundle) into a compact one-line shareable pack code (`CCFM-PACK-v1:...`). */
export function encodeThemePackShareCode(themes: ThemeDraft[]): string {
  const payload = {
    format: EXPORT_PACK_FORMAT,
    version: 1,
    themes: themes.map((t) => ({
      name: t.name,
      dark: t.dark,
      ...(t.base ? { base: t.base } : {}),
      colors: t.colors,
      ...(t.fx ? { fx: t.fx } : {}),
    })),
  };
  return `${PACK_SHARE_CODE_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

/** Strips surrounding markdown code fences (```json ... ```), backticks, or quotes from pasted text. */
function unwrapPastedEnvelope(raw: string): string {
  let s = raw.trim();
  const fenceMatch = s.match(/^```(?:json|css|txt|text|ccfm)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch && fenceMatch[1]) s = fenceMatch[1].trim();
  if ((s.startsWith("`") && s.endsWith("`")) || (s.startsWith('"') && s.endsWith('"') && !s.startsWith('"{')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Parses a standalone `:root { --bg: #...; --text: #...; --accent: #... }` CSS variables block into a ThemeDraft. */
function tryParseCssTheme(raw: string): ThemeDraft | null {
  if (!raw.includes(":root") && !raw.includes("--bg") && !raw.includes("--background")) return null;
  const headerMatch = raw.match(/\/\*\s*([^*(\n]+?)\s*(?:\((dark|light)\))?\s*(?:—|-)\s*exported from File Manager/i);
  const name = clean(headerMatch?.[1] || "Imported CSS Theme").slice(0, MAX_THEME_NAME) || "Imported CSS Theme";
  const schemeMatch = raw.match(/color-scheme\s*:\s*(dark|light)/i);
  const dark = (headerMatch?.[2] || schemeMatch?.[1] || "dark").toLowerCase() !== "light";

  const pickHexVar = (...varNames: string[]): string | undefined => {
    for (const vn of varNames) {
      const m = raw.match(new RegExp(`--${vn}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b`));
      if (m && m[1]) {
        const exp = expandHex(m[1]);
        if (typeof exp === "string" && HEX.test(exp)) return exp.toLowerCase();
      }
    }
    return undefined;
  };

  const background = pickHexVar("bg", "background", "window-bg");
  const text = pickHexVar("text", "fg", "foreground");
  const accent = pickHexVar("accent", "primary", "focus-ring");
  if (!background || !text || !accent) return null;

  const card = pickHexVar("panel", "card", "surface-elevated");
  const border = pickHexVar("border", "border-subtle");
  const danger = pickHexVar("danger");
  const good = pickHexVar("good", "success");

  let customCss = "";
  const customSplit = raw.split(/\/\*\s*Personal Custom CSS Overrides\s*\*\//i);
  if (customSplit.length > 1 && customSplit[1]?.trim()) {
    customCss = sanitizeCustomCss(customSplit[1].trim());
  }

  return validateDraft({
    name,
    dark,
    base: "CSS Import",
    colors: {
      background,
      text,
      accent,
      ...(card ? { card } : {}),
      ...(border ? { border } : {}),
      ...(danger ? { danger } : {}),
      ...(good ? { success: good } : {}),
    },
    ...(customCss
      ? {
          fx: {
            glow: "soft",
            glowColor: accent,
            glowColor2: accent,
            blur: 16,
            glass: 0.4,
            glowIntensity: 1,
            borderOpacity: 0.16,
            grain: "none",
            scanlines: "none",
            radius: "soft",
            border: "flat",
            motion: "calm",
            sheen: false,
            noise: false,
            chromatic: false,
            ambient: false,
            customCss,
          },
        }
      : {}),
  });
}

/** Decodes a `CCFM-THEME-v1:...` or `CCFM-PACK-v1:...` share code into a JSON string, or returns the input unchanged if not a share code. */
export function decodeShareCodeToJson(raw: string): string {
  const trimmed = unwrapPastedEnvelope(raw);
  for (const prefix of [THEME_SHARE_CODE_PREFIX, PACK_SHARE_CODE_PREFIX]) {
    if (trimmed.startsWith(prefix)) {
      // Collapse any accidental line wraps or spaces inside a single share code
      const b64 = trimmed.slice(prefix.length).replace(/\s+/g, "");
      if (!b64) throw new FmError("BAD_REQUEST", "That share code is incomplete.");
      try {
        return Buffer.from(b64, "base64url").toString("utf8");
      } catch {
        throw new FmError("BAD_REQUEST", "That share code couldn't be decoded.");
      }
    }
  }
  // Also check if a single CCFM share code is embedded inside a CSS comment or chat message
  const embedded = trimmed.match(/CCFM-(?:THEME|PACK)-v1:[A-Za-z0-9+/=_-]{8,}/);
  if (embedded && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const token = embedded[0];
    const pfx = token.startsWith(THEME_SHARE_CODE_PREFIX) ? THEME_SHARE_CODE_PREFIX : PACK_SHARE_CODE_PREFIX;
    const b64 = token.slice(pfx.length).trim();
    if (b64) {
      try {
        return Buffer.from(b64, "base64url").toString("utf8");
      } catch { /* fall through */ }
    }
  }
  return trimmed;
}

/** The shape the built-in themes have, so one code path makes the page colors for both. */
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
      if (isCustomKey(item?.id) && !out.some((t) => t.id === item.id)) out.push({ id: item.id, ...validateDraft(migrateThemeInput(item)) });
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
export const exportTheme = (t: ThemeDraft): string => JSON.stringify({ format: EXPORT_FORMAT, version: 1, name: t.name, dark: t.dark, ...(t.base ? { base: t.base } : {}), colors: t.colors, ...(t.fx ? { fx: t.fx } : {}) }, null, 2);

/** Formats computed theme tokens as a standalone `:root` CSS custom properties stylesheet (including personal customCss rules). */
export function exportThemeCss(name: string, scheme: "light" | "dark", vars: Record<string, string>, effectsCss?: string, customCss?: string, shareCode?: string): string {
  const safeName = clean(name || "Custom Theme");
  const lines = [
    `/* ${safeName} (${scheme}) — exported from File Manager */`,
    ...(shareCode ? [`/* ${shareCode} */`] : []),
    ":root {",
    `  color-scheme: ${scheme};`,
  ];
  for (const [k, v] of Object.entries(vars)) lines.push(`  --${k}: ${v};`);
  if (effectsCss) {
    for (const part of effectsCss.split(";").map((s) => s.trim()).filter(Boolean)) {
      lines.push(`  ${part};`);
    }
  }
  lines.push("}");
  if (customCss && customCss.trim()) {
    lines.push("", "/* Personal Custom CSS Overrides */", sanitizeCustomCss(customCss));
  }
  return lines.join("\n");
}

/** Exports multiple themes as a single shareable Theme Pack JSON string. */
export function exportThemePack(themes: ThemeDraft[]): string {
  return JSON.stringify({
    format: EXPORT_PACK_FORMAT,
    version: 1,
    themes: themes.map((t) => ({
      name: t.name,
      dark: t.dark,
      ...(t.base ? { base: t.base } : {}),
      colors: t.colors,
      ...(t.fx ? { fx: t.fx } : {}),
    })),
  }, null, 2);
}

/** Reads shared theme text or `CCFM-THEME-v1:` / `CCFM-PACK-v1:` share code. Accepts the exported form, a legacy/SimpleGUI object, `:root` CSS, or a bare `{ name, dark, colors }`. */
export function parseShared(text: unknown): ThemeDraft {
  if (typeof text !== "string" || !text.trim()) throw new FmError("BAD_REQUEST", "Paste the theme text first.");
  if (text.length > MAX_IMPORT_BYTES) throw new FmError("BAD_REQUEST", "That text is too long to be a theme.");
  const decoded = decodeShareCodeToJson(text);
  let data: unknown;
  try {
    data = JSON.parse(decoded);
  } catch {
    const cssTheme = tryParseCssTheme(decoded);
    if (cssTheme) return cssTheme;
    throw new FmError("BAD_REQUEST", "That text isn't a theme. Copy the whole text from Export.");
  }
  if (Array.isArray(data) && data.length > 0) {
    return validateDraft(migrateThemeInput(data[0]));
  }
  if (data && typeof data === "object" && (data as any).format === EXPORT_PACK_FORMAT && Array.isArray((data as any).themes) && (data as any).themes.length > 0) {
    return validateDraft(migrateThemeInput((data as any).themes[0]));
  }
  if (data && typeof data === "object" && (data as any).format !== undefined && (data as any).format !== EXPORT_FORMAT) throw new FmError("BAD_REQUEST", "That isn't a File Manager theme.");
  return validateDraft(migrateThemeInput(data));
}

/**
 * Parses any bulk theme input into an array of validated ThemeDrafts:
 * - Multiple `CCFM-THEME-v1:...` and/or `CCFM-PACK-v1:...` share codes on separate lines or mixed in text
 * - A Theme Pack JSON object (`{ format: "bun-rad-studio-file-manager-theme-pack", themes: [...] }`)
 * - A JSON array of theme objects (`[ { name, dark, colors, fx }, ... ]`)
 * - Newline-delimited JSON objects (NDJSON)
 * - A single Theme JSON object (`{ format: "bun-rad-studio-file-manager-theme", ... }`)
 * - A standalone `:root` CSS variables stylesheet
 */
export function parseThemePack(input: unknown): ThemeDraft[] {
  if (Array.isArray(input)) {
    if (!input.length) throw new FmError("BAD_REQUEST", "That theme pack has no themes in it.");
    return input.slice(0, MAX_CUSTOM_THEMES).map((item) => validateDraft(migrateThemeInput(item)));
  }
  if (typeof input !== "string" || !input.trim()) throw new FmError("BAD_REQUEST", "Paste the theme pack text first.");
  if (input.length > MAX_PACK_IMPORT_BYTES) throw new FmError("BAD_REQUEST", "That text is too long to be a theme pack.");

  const trimmed = unwrapPastedEnvelope(input);

  // Check if multiple CCFM share codes are present in the text
  const shareCodeMatches = [...trimmed.matchAll(/CCFM-(?:THEME|PACK)-v1:[A-Za-z0-9+/=_-]+/g)].map((m) => m[0]);
  if (shareCodeMatches.length > 1 || (shareCodeMatches.length === 1 && !trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    const collected: ThemeDraft[] = [];
    for (const token of shareCodeMatches) {
      const jsonStr = decodeShareCodeToJson(token);
      let parsedToken: unknown;
      try {
        parsedToken = JSON.parse(jsonStr);
      } catch {
        throw new FmError("BAD_REQUEST", "One of the share codes couldn't be decoded.");
      }
      const list = parsedToken && typeof parsedToken === "object" && Array.isArray((parsedToken as any).themes)
        ? (parsedToken as any).themes
        : [parsedToken];
      for (const item of list) {
        if (collected.length >= MAX_CUSTOM_THEMES) break;
        collected.push(validateDraft(migrateThemeInput(item)));
      }
    }
    if (!collected.length) throw new FmError("BAD_REQUEST", "That theme pack has no themes in it.");
    return collected;
  }

  const decoded = decodeShareCodeToJson(trimmed);
  let data: unknown;
  try {
    data = JSON.parse(decoded);
  } catch {
    // Support newline-delimited JSON objects (NDJSON) pasted together
    const lines = decoded.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => l.startsWith("{") && l.endsWith("}"))) {
      const ndjsonDrafts: ThemeDraft[] = [];
      for (const line of lines.slice(0, MAX_CUSTOM_THEMES)) {
        try {
          const obj = JSON.parse(line);
          const sub = obj && typeof obj === "object" && Array.isArray((obj as any).themes) ? (obj as any).themes : [obj];
          for (const item of sub) {
            if (ndjsonDrafts.length < MAX_CUSTOM_THEMES) ndjsonDrafts.push(validateDraft(migrateThemeInput(item)));
          }
        } catch {
          throw new FmError("BAD_REQUEST", "That text isn't valid JSON. Copy the whole text from Export.");
        }
      }
      if (ndjsonDrafts.length) return ndjsonDrafts;
    }
    const cssTheme = tryParseCssTheme(decoded);
    if (cssTheme) return [cssTheme];
    throw new FmError("BAD_REQUEST", "That text isn't valid JSON. Copy the whole text from Export.");
  }
  if (!data || typeof data !== "object") throw new FmError("BAD_REQUEST", "That text isn't a theme pack.");
  if (Array.isArray(data)) {
    if (!data.length) throw new FmError("BAD_REQUEST", "That theme pack has no themes in it.");
    return data.slice(0, MAX_CUSTOM_THEMES).map((item) => validateDraft(migrateThemeInput(item)));
  }
  const r = data as Record<string, unknown>;
  if (r.format !== undefined && r.format !== EXPORT_PACK_FORMAT && r.format !== EXPORT_FORMAT) {
    throw new FmError("BAD_REQUEST", "That isn't a File Manager theme or theme pack.");
  }
  const items = Array.isArray(r.themes) ? r.themes : [r];
  if (!items.length) throw new FmError("BAD_REQUEST", "That theme pack has no themes in it.");
  const drafts: ThemeDraft[] = [];
  for (const item of items.slice(0, MAX_CUSTOM_THEMES)) {
    drafts.push(validateDraft(migrateThemeInput(item)));
  }
  return drafts;
}

export const parseBulkThemes = parseThemePack;

export type ThemeConflictStrategy = "replace" | "keep_both" | "skip" | "merge_fx";

export interface BulkThemeInspectItem {
  index: number;
  draft: ThemeDraft;
  hasConflict: boolean;
  conflictKind: "none" | "existing_custom" | "batch_duplicate";
  existingCustom?: {
    id: string;
    name: string;
    dark: boolean;
    colors: ThemeDraft["colors"];
    fx?: ThemeFx;
  };
  batchDuplicateIndex?: number;
  identical: boolean;
  changedColors: string[];
  changedFx: boolean;
  suggestedRename: string;
  recommendedAction: ThemeConflictStrategy;
}

export interface BulkThemeInspection {
  totalCount: number;
  conflictCount: number;
  cleanCount: number;
  existingCustomCount: number;
  maxCustomThemes: number;
  items: BulkThemeInspectItem[];
}

export interface BulkItemResolution {
  index?: number;
  name?: string;
  action: ThemeConflictStrategy | "add";
  renameTo?: string;
  targetId?: string;
}

export interface BulkImportOptions {
  /** Default strategy when a conflict occurs and no per-item resolution is specified. */
  onConflict?: ThemeConflictStrategy | "prompt";
  /** Per-item resolution choices keyed by item index or theme name. */
  resolutions?: BulkItemResolution[] | Record<string, BulkItemResolution | ThemeConflictStrategy>;
  /** Optional subset of batch indices to include. */
  includeIndices?: number[];
  /** When true under keep_both, automatically renames conflicting themes using suggestedRename so names stay unique. */
  autoRenameConflicts?: boolean;
}

export interface BulkImportReport {
  imported: CustomTheme[];
  count: number;
  importedCount: number;
  addedCount: number;
  replacedCount: number;
  renamedCount: number;
  mergedCount: number;
  skippedCount: number;
  requiresResolution: boolean;
  inspection: BulkThemeInspection;
  first: CustomTheme | null;
}

const normName = (name: string) => clean(name).toLowerCase();

function nextUniqueThemeName(baseName: string, takenLowerNames: Set<string>): string {
  const root = clean(baseName).replace(/\s*\(\d+\)$/, "").slice(0, 33) || "Imported Theme";
  for (let n = 2; n <= 99; n++) {
    const candidate = `${root} (${n})`.slice(0, MAX_THEME_NAME);
    if (!takenLowerNames.has(normName(candidate))) {
      return candidate;
    }
  }
  return `${root.slice(0, 31)} (${randomBytes(2).toString("hex")})`;
}

function diffDrafts(existing: ThemeDraft, incoming: ThemeDraft): { identical: boolean; changedColors: string[]; changedFx: boolean } {
  const changedColors: string[] = [];
  for (const k of COLOUR_KEYS) {
    const a = (existing.colors[k] ?? "").toLowerCase();
    const b = (incoming.colors[k] ?? "").toLowerCase();
    if (a !== b) changedColors.push(k);
  }
  const changedDark = existing.dark !== incoming.dark;
  const changedFx = JSON.stringify(existing.fx ?? null) !== JSON.stringify(incoming.fx ?? null);
  const identical = !changedDark && changedColors.length === 0 && !changedFx;
  return { identical, changedColors, changedFx };
}

/** Pre-flight inspection of a bulk theme import to detect name collisions against existing custom themes or within the batch itself. */
export async function inspectBulkThemeImport(ctx: FmContext, input: unknown): Promise<BulkThemeInspection> {
  const drafts = parseThemePack(input);
  const existing = await loadCustom(ctx);
  const takenNames = new Set<string>(existing.map((t) => normName(t.name)));
  const seenBatchNames = new Map<string, number>();

  const items: BulkThemeInspectItem[] = drafts.map((draft, index) => {
    const key = normName(draft.name);
    const matchExisting = existing.find((t) => normName(t.name) === key);
    const earlierBatchIdx = seenBatchNames.get(key);
    seenBatchNames.set(key, earlierBatchIdx ?? index);

    if (matchExisting) {
      const { identical, changedColors, changedFx } = diffDrafts(matchExisting, draft);
      const suggestedRename = nextUniqueThemeName(draft.name, takenNames);
      takenNames.add(normName(suggestedRename));
      return {
        index,
        draft,
        hasConflict: true,
        conflictKind: "existing_custom",
        existingCustom: {
          id: matchExisting.id,
          name: matchExisting.name,
          dark: matchExisting.dark,
          colors: matchExisting.colors,
          ...(matchExisting.fx ? { fx: matchExisting.fx } : {}),
        },
        identical,
        changedColors,
        changedFx,
        suggestedRename,
        recommendedAction: identical ? "skip" : "replace",
      };
    }

    if (earlierBatchIdx !== undefined) {
      const earlierDraft = drafts[earlierBatchIdx]!;
      const { identical, changedColors, changedFx } = diffDrafts(earlierDraft, draft);
      const suggestedRename = nextUniqueThemeName(draft.name, takenNames);
      takenNames.add(normName(suggestedRename));
      return {
        index,
        draft,
        hasConflict: true,
        conflictKind: "batch_duplicate",
        batchDuplicateIndex: earlierBatchIdx,
        identical,
        changedColors,
        changedFx,
        suggestedRename,
        recommendedAction: identical ? "skip" : "keep_both",
      };
    }

    takenNames.add(key);
    return {
      index,
      draft,
      hasConflict: false,
      conflictKind: "none",
      identical: false,
      changedColors: [],
      changedFx: false,
      suggestedRename: draft.name,
      recommendedAction: "keep_both",
    };
  });

  const conflictCount = items.filter((i) => i.hasConflict).length;
  return {
    totalCount: items.length,
    conflictCount,
    cleanCount: items.length - conflictCount,
    existingCustomCount: existing.length,
    maxCustomThemes: MAX_CUSTOM_THEMES,
    items,
  };
}

function lookupItemResolution(
  item: BulkThemeInspectItem,
  options?: BulkImportOptions,
): { action: ThemeConflictStrategy | "add"; renameTo?: string; targetId?: string } {
  const res = options?.resolutions;
  if (Array.isArray(res)) {
    const byIdx = res.find((r) => r && r.index === item.index);
    if (byIdx) return { action: byIdx.action, renameTo: byIdx.renameTo, targetId: byIdx.targetId };
    const byName = res.find((r) => r && r.index === undefined && typeof r.name === "string" && normName(r.name) === normName(item.draft.name));
    if (byName) return { action: byName.action, renameTo: byName.renameTo, targetId: byName.targetId };
  } else if (res && typeof res === "object") {
    const raw = (res as Record<string, any>)[String(item.index)] ?? (res as Record<string, any>)[item.draft.name] ?? (res as Record<string, any>)[normName(item.draft.name)];
    if (typeof raw === "string" && ["replace", "keep_both", "skip", "merge_fx"].includes(raw)) {
      return { action: raw as ThemeConflictStrategy };
    }
    if (raw && typeof raw === "object" && typeof raw.action === "string") {
      return { action: raw.action, renameTo: raw.renameTo, targetId: raw.targetId };
    }
  }
  if (!item.hasConflict) return { action: "add" };
  const fallback = options?.onConflict && options.onConflict !== "prompt" ? options.onConflict : "keep_both";
  return { action: fallback };
}

/** Imports a Theme Pack (or bulk list of themes) with conflict resolution strategies (`replace`, `keep_both`, `merge_fx`, `skip`). */
export async function importThemePackWithReport(
  ctx: FmContext,
  input: unknown,
  options?: BulkImportOptions,
): Promise<BulkImportReport> {
  const inspection = await inspectBulkThemeImport(ctx, input);
  const hasExplicitResolutions =
    (Array.isArray(options?.resolutions) && options!.resolutions.length > 0) ||
    (options?.resolutions && typeof options.resolutions === "object" && Object.keys(options.resolutions).length > 0);

  if (options?.onConflict === "prompt" && inspection.conflictCount > 0 && !hasExplicitResolutions) {
    return {
      imported: [],
      count: 0,
      importedCount: 0,
      addedCount: 0,
      replacedCount: 0,
      renamedCount: 0,
      mergedCount: 0,
      skippedCount: 0,
      requiresResolution: true,
      inspection,
      first: null,
    };
  }

  const includeSet = Array.isArray(options?.includeIndices) ? new Set(options!.includeIndices) : null;
  const all = await loadCustom(ctx);
  const imported: CustomTheme[] = [];
  let addedCount = 0;
  let replacedCount = 0;
  let renamedCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;

  for (const item of inspection.items) {
    if (includeSet && !includeSet.has(item.index)) {
      skippedCount++;
      continue;
    }

    const { action, renameTo, targetId } = lookupItemResolution(item, options);
    if (action === "skip") {
      skippedCount++;
      continue;
    }

    const draft = item.draft;
    const existingIdx = targetId
      ? all.findIndex((t) => t.id === targetId)
      : all.findIndex((t) => normName(t.name) === normName(draft.name));

    if (action === "replace" && existingIdx >= 0) {
      const prev = all[existingIdx]!;
      const updated: CustomTheme = { id: prev.id, ...draft, name: prev.name };
      all[existingIdx] = updated;
      imported.push(updated);
      replacedCount++;
      continue;
    }

    if (action === "merge_fx" && existingIdx >= 0) {
      const prev = all[existingIdx]!;
      const mergedFx: ThemeFx | undefined = draft.fx
        ? {
            ...(prev.fx ?? {}),
            ...draft.fx,
            glowColor: prev.colors.accent || draft.fx.glowColor,
            glowColor2: prev.colors.secondary || prev.colors.accent || draft.fx.glowColor2,
          }
        : prev.fx;
      const updated: CustomTheme = {
        ...prev,
        ...(mergedFx ? { fx: mergedFx } : {}),
      };
      all[existingIdx] = updated;
      imported.push(updated);
      mergedCount++;
      continue;
    }

    // Add new custom theme (either clean or keep_both)
    if (all.length >= MAX_CUSTOM_THEMES) {
      throw new FmError("TOO_MANY", `You can keep up to ${MAX_CUSTOM_THEMES} themes of your own (you currently have ${all.length}).`);
    }

    let finalName = draft.name;
    const shouldRename =
      Boolean(renameTo && clean(renameTo)) ||
      (existingIdx >= 0 && (hasExplicitResolutions || options?.autoRenameConflicts === true || options?.onConflict === "keep_both"));

    if (renameTo && clean(renameTo)) {
      finalName = clean(renameTo).slice(0, MAX_THEME_NAME);
      if (normName(finalName) !== normName(draft.name)) renamedCount++;
    } else if (shouldRename && existingIdx >= 0) {
      const takenNow = new Set(all.map((t) => normName(t.name)));
      finalName = nextUniqueThemeName(draft.name, takenNow);
      renamedCount++;
    }

    let id = `custom_${randomBytes(4).toString("hex")}`;
    while (all.some((t) => t.id === id)) id = `custom_${randomBytes(4).toString("hex")}`;
    const made: CustomTheme = { id, ...draft, name: finalName };
    all.push(made);
    imported.push(made);
    addedCount++;
  }

  await saveAll(ctx, all);
  return {
    imported,
    count: imported.length,
    importedCount: imported.length,
    addedCount,
    replacedCount,
    renamedCount,
    mergedCount,
    skippedCount,
    requiresResolution: false,
    inspection,
    first: imported[0] ?? null,
  };
}

/** Imports a Theme Pack (or single theme) and saves all of them into the user's custom themes. */
export async function importThemePack(ctx: FmContext, text: unknown, options?: BulkImportOptions): Promise<CustomTheme[]> {
  const report = await importThemePackWithReport(ctx, text, options);
  return report.imported;
}

