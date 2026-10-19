/**
 * The File Manager's remembered settings: pinned folders, view, sorting, theme, and recently opened items.
 * One small JSON file in the app's data folder, validated on every read and write so a hand-edited or damaged
 * file can never break the app.
 */
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import { pathApi, type FmContext } from "./fmCore";
import { sanitizeOverrides } from "../../../resources/file_manager/ui/shortcuts.js";
import { ATMOSPHERE_IDS, normalizeAtmosphereSpec } from "../../../resources/file_manager/ui/atmosphereCatalog.js";

export interface Settings {
  favorites: string[];
  /** A short name of the person's own for a favorite (the key is one of `favorites`). */
  favoriteNames: Record<string, string>;
  recents: Array<{ path: string; at: string }>;
  /** Whether opening files records them in `recents` and shows them in the sidebar and on the Home page. */
  recentsEnabled: boolean;
  view: "details" | "list" | "icons";
  sortBy: "name" | "modified" | "size" | "type";
  sortDir: "asc" | "desc";
  foldersFirst: boolean;
  showHidden: boolean;
  showInfoPanel: boolean;
  theme: "auto" | "light" | "dark";
  /** The key of a color theme from the theme gallery, or "" to use `theme` above. */
  palette: string;
  /** Optional light theme key used automatically when `theme === "auto"` and `palette === ""` while the OS is in light mode. */
  preferredLightPalette: string;
  /** Optional dark theme key used automatically when `theme === "auto"` and `palette === ""` while the OS is in dark mode. */
  preferredDarkPalette: string;
  /** Whether the 4-stage Solar Cycle (Dawn / Day / Dusk / Midnight) automatic theme schedule is active. */
  solarScheduleEnabled: boolean;
  /** Dawn (05:00–08:59) palette key for the 4-stage Solar Cycle. */
  solarDawnPalette: string;
  /** Day (09:00–16:59) palette key for the 4-stage Solar Cycle. */
  solarDayPalette: string;
  /** Dusk / Golden Hour (17:00–20:59) palette key for the 4-stage Solar Cycle. */
  solarDuskPalette: string;
  /** Midnight (21:00–04:59) palette key for the 4-stage Solar Cycle. */
  solarNightPalette: string;
  /** Per-folder workspace theme profiles: absolute directory path -> theme palette key. */
  folderThemes: Record<string, string>;
  /** Theme keys pinned by the user to appear at the top of the gallery and in the Themes menu. */
  favoriteThemes: string[];
  /** Optional atmospheric special effect or `+`-combined multi-effect mix shown across the File Manager. */
  atmosphere: AtmosphereEffect;
  /** Intensity of the atmospheric special effect from 10 to 100 (default 60). */
  atmosphereIntensity: number;
  /** Hardware graphics tier for atmospheric effects: "auto" detects Apple Silicon / modern ARM / CPU cores, or manual "low" | "medium" | "high" | "ultra". */
  atmosphereTier: AtmosphereTier;
  /** Real-time reactive physics modulation mode ("off", "activity", "telemetry", "audio"). */
  atmosphereReactive: AtmosphereReactiveMode;
  /** User-saved custom named atmospheric special effect presets (single effect or multi-layer mix + intensity + tier + reactive mode + per-layer modifiers). */
  atmospherePresets: AtmospherePreset[];
  /** Per-layer opacity (10..150), speed (0.25..3.0), and custom hex color tint (#rrggbb) for atmospheric effects. */
  atmosphereLayerMods: Record<string, AtmosphereLayerMod>;
  /** Whether the Ambient Playlist automatic rotation of themes and/or atmospheric effects is enabled. */
  ambientPlaylistEnabled: boolean;
  /** Rotation interval in minutes (1..240) for the Ambient Playlist. */
  ambientPlaylistIntervalMin: number;
  /** What the Ambient Playlist rotates ("themes" | "atmosphere" | "both"). */
  ambientPlaylistTarget: AmbientPlaylistTarget;
  /** Which pool of themes/effects the Ambient Playlist draws from ("favorites" | "presets" | "ultra" | "all"). */
  ambientPlaylistPool: AmbientPlaylistPool;
  /** Typography font pairing profile ("default" | "scifi" | "terminal" | "editorial" | "rounded"). */
  themeFontProfile: ThemeFontProfile;
  /** UI corner sharpness profile ("default" | "sharp" | "rounded" | "pill"). */
  themeCornerProfile: ThemeCornerProfile;
  /** File & folder icon neon drop-shadow glow profile ("off" | "subtle" | "neon" | "hyper"). */
  themeIconGlow: ThemeIconGlow;
  /** Interactive File Manager UI element shader applied to folders, toolbars, breadcrumbs, and rows. */
  uiElementFx: UiElementFx;
  /** Custom visual icon pack style that transforms folder, file, and toolbar icons across the File Manager. */
  iconPackStyle: IconPackStyle;
  /** Visual presentation mode for the built-in Theme Show / Screensaver. */
  themeShowMode: ThemeShowMode;
  /** Curated theme & special effects channel for the Theme Show / Screensaver. */
  themeShowChannel: ThemeShowChannel;
  /** Seconds per theme/scene in the Theme Show / Screensaver (5..600, default 15). */
  themeShowIntervalSec: number;
  /** Minutes of user inactivity before auto-starting the Theme Show screensaver (0 = off, 1..120). */
  themeShowIdleMinutes: number;
  /** Transition style between scenes in the Theme Show ("oklab_morph" | "arc_surge" | "glitch_cut"). */
  themeShowTransition: ThemeShowTransition;
  /** Whether mouse movement or key press immediately wakes/exits the Theme Show (classic screensaver behavior). */
  themeShowExitOnMove: boolean;
  /** Whether to display the ambient digital clock, date, and now-playing theme telemetry badge during the Theme Show. */
  themeShowClock: boolean;
  /** Hardware tier override while the Theme Show is active ("extreme" | "ultra" | "keep"). */
  themeShowBoostTier: ThemeShowBoostTier;
  textSize: number;
  lastPath: string;
  seenWelcome: boolean;
  /** The file list follows the terminal when you `cd` in it. */
  terminalFollow: boolean;
  /** Whether the built-in terminal panel at the bottom of the window is open. */
  terminalOpen: boolean;
  /** Remembered height in pixels of the built-in terminal panel (120..1200, default 300). */
  terminalHeight: number;
  /** Last working folder of the built-in terminal panel ("" = follow the current folder). */
  terminalPath: string;
  workspace: Workspace;
  startWith: "files" | "home" | "last";
  splitSide: "right" | "bottom";
  splitSize: number;
  sidebarCollapsed: boolean;
  focusMode: boolean;
  /** The Power tools tab last used in the Tools view, and in the Split view ("" = none yet). */
  activeTool: string;
  splitTool: string;
  /** The folder shown in the right-hand pane of the Dual view ("" = same as the left). */
  dualPath: string;
  /** Mark files that aren't what their name says, and ask before opening the dangerous ones. */
  typeWarnings: boolean;
  /** Windows and Linux only: the key a Mac keyboard calls Delete sends Backspace, so Backspace deletes instead of going up a folder. */
  backspaceDeletes: boolean;
  /** Desktop app: Ctrl/Cmd+Q and Ctrl/Cmd+W don't close the window, only its close button does. */
  shortcutsCantClose: boolean;
  /** The code editor "Open in editor" starts: "default" uses $VISUAL / $EDITOR, or the first known editor found. */
  editor: "default" | "vscode" | "subl" | "webstorm" | "idea";
  /** The Serve tool's remembered form choices. The network (LAN) is never remembered. */
  serveOptions: { kind: "auto" | "static" | "php"; liveReload: boolean; openBrowser: boolean };
  /** Where Delete sends things: the File Manager's own Recycle Bin, or the Rip graveyard (shared with the `rip` tools). */
  deleteTo: "bin" | "graveyard";
  /** Where the quick-open buttons for saved database connections show the studio: its own desktop window, or the web browser. */
  dbShortcut: "window" | "browser";
  /**
   * Where plain text and source files open when you double-click them, press Enter or choose Open: the File Manager's own
   * Code editor ("builtin", the default), the editor chosen in `editor` ("editor"), or the program the computer normally
   * uses for them ("system"). Programs, documents and everything else use the computer's own program.
   */
  textOpensIn: "builtin" | "editor" | "system";
  /**
   * Where pictures, sound and video open on double-click, Enter or Open: the File Manager's own viewer and player
   * ("manager", the default) or the program the computer normally uses for them ("system").
   */
  mediaOpensIn: "manager" | "system";
  /**
   * Keyboard shortcuts the person changed: action id -> shortcuts ("Mod+Alt+T"; an empty list switches the action off).
   * Actions that aren't listed keep their defaults. Changes that are invalid or would clash with another action are
   * dropped here, so the file can never hold two actions on one key (see ui/shortcuts.js for the rules).
   */
  shortcuts: Record<string, string[]>;
  /** Looks saved in the Image Studio and the Media Studio, to use again on one file or on many at once. */
  studioPresets: { image: StudioPreset[]; media: StudioPreset[] };
  /** Extra columns shown in the Details view ("permissions", "ext"). */
  columns: ExtraColumn[];
  /** How items in a folder are grouped ("none", "kind", "date", "size"). */
  groupBy: GroupByMode;
  /** Color tags assigned to files or folders: absolute path -> tag color key. */
  tags: Record<string, TagColor>;
  /** Whether the collapsible Folder Tree section in the sidebar is expanded. */
  treeExpanded: boolean;
}

export const EXTRA_COLUMNS = ["permissions", "ext"] as const;
export type ExtraColumn = (typeof EXTRA_COLUMNS)[number];
export const GROUP_BY_MODES = ["none", "kind", "date", "size"] as const;
export type GroupByMode = (typeof GROUP_BY_MODES)[number];
export const TAG_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "gray"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const MAX_TAGS = 500;

export interface StudioPreset {
  name: string;
  /** Studio option id -> value. The studio and the conversion job check them again when they are used. */
  options: Record<string, string | number | boolean>;
}

export interface AtmosphereLayerMod {
  opacity?: number;
  speed?: number;
  color?: string;
}

export interface AtmospherePreset {
  name: string;
  effect: AtmosphereEffect;
  intensity: number;
  tier: AtmosphereTier;
  reactive: AtmosphereReactiveMode;
  layerMods?: Record<string, AtmosphereLayerMod>;
}

export const WORKSPACES = ["files", "home", "tools", "split", "dual"] as const;
export type Workspace = (typeof WORKSPACES)[number];
export const ATMOSPHERE_EFFECTS: readonly string[] = ATMOSPHERE_IDS;
export type AtmosphereEffect = string;
export const ATMOSPHERE_TIERS = ["auto", "low", "medium", "high", "ultra", "extreme"] as const;
export type AtmosphereTier = (typeof ATMOSPHERE_TIERS)[number];
export const ATMOSPHERE_REACTIVE_MODES = ["off", "activity", "telemetry", "audio"] as const;
export type AtmosphereReactiveMode = (typeof ATMOSPHERE_REACTIVE_MODES)[number];
export const AMBIENT_PLAYLIST_TARGETS = ["themes", "atmosphere", "both"] as const;
export type AmbientPlaylistTarget = (typeof AMBIENT_PLAYLIST_TARGETS)[number];
export const AMBIENT_PLAYLIST_POOLS = ["favorites", "presets", "ultra", "all"] as const;
export type AmbientPlaylistPool = (typeof AMBIENT_PLAYLIST_POOLS)[number];
export const THEME_FONT_PROFILES = ["default", "scifi", "cyberpunk", "terminal", "editorial", "technical", "rounded"] as const;
export type ThemeFontProfile = (typeof THEME_FONT_PROFILES)[number];
export const THEME_CORNER_PROFILES = ["default", "sharp", "chamfer", "rounded", "pill", "organic"] as const;
export type ThemeCornerProfile = (typeof THEME_CORNER_PROFILES)[number];
export const THEME_ICON_GLOWS = ["off", "subtle", "soft", "neon", "plasma", "hyper"] as const;
export type ThemeIconGlow = (typeof THEME_ICON_GLOWS)[number];
export const UI_ELEMENT_FX_MODES = ["auto", "off", "tahoe_glass_folders", "fluent_mica_folders", "xdr_titanium_folders", "google_material_folders", "fire_folders", "slime_drip", "cryo_frost", "tesla_arcs", "storm_wind", "mercury_chrome", "holo_glitch", "void_tentacles", "kaleidoscope_prism", "lava_wax", "acid_warp", "oil_slick_chrome", "shroom_spores", "holiday_festive_glow", "nerd_arcane_runes", "nerd_lcars_hud", "horror_blood_moon", "horror_vhs_static", "realworld_mahogany_brass", "realworld_stained_glass", "screen_melt_ooze", "molten_lava_melt", "crt_magnetic_warp", "fever_dream_ripple"] as const;
export type UiElementFx = (typeof UI_ELEMENT_FX_MODES)[number];
export const ICON_PACK_STYLES = ["auto", "default", "macos_tahoe_3d", "win11_fluent_pro", "pro_studio_xdr", "hdr_photo_studio", "linux_papirus_pro", "nordic_minimal", "google_material_3d", "inferno", "inferno_burn", "slime", "bio_slime", "storm_tempest", "storm_weather", "neon_cyber", "liquid_gems", "liquid_chrome", "cryo_crystal", "retro_pixel", "arcane_glyphs", "xenotech_2126", "psychedelic_trip", "lava_groovy", "op_art_illusion", "us_holidays_festive", "nerd_rpg_arcane", "nerd_scifi_fleet", "nerd_hacker_retro", "horror_crypt", "realworld_objects"] as const;
export type IconPackStyle = (typeof ICON_PACK_STYLES)[number];
export const THEME_SHOW_MODES = ["cinema_hud", "pure_canvas", "living_desktop", "retro_afterdark"] as const;
export type ThemeShowMode = (typeof THEME_SHOW_MODES)[number];
export const THEME_SHOW_CHANNELS = ["all_ultra", "storms_debris", "year_2126", "tesla_physics", "visceral_fx", "linux_retro", "us_holidays", "nerd_complete", "horror_nightmare", "realworld_objects", "favorites"] as const;
export type ThemeShowChannel = (typeof THEME_SHOW_CHANNELS)[number];
export const THEME_SHOW_TRANSITIONS = ["oklab_morph", "arc_surge", "glitch_cut"] as const;
export type ThemeShowTransition = (typeof THEME_SHOW_TRANSITIONS)[number];
export const THEME_SHOW_BOOST_TIERS = ["extreme", "ultra", "keep"] as const;
export type ThemeShowBoostTier = (typeof THEME_SHOW_BOOST_TIERS)[number];
export const MAX_FOLDER_THEMES = 100;
export const MAX_ATMOSPHERE_PRESETS = 50;
export const MAX_LAYER_MODS = 32;
export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;
export const TERMINAL_HEIGHT_MIN = 120;
export const TERMINAL_HEIGHT_MAX = 1200;
export const TERMINAL_HEIGHT_DEFAULT = 300;
const TOOL_ID = /^[a-z][a-z0-9-]{0,24}$/;

export const DEFAULT_SETTINGS: Settings = {
  favorites: [],
  favoriteNames: {},
  recents: [],
  recentsEnabled: true,
  view: "details",
  sortBy: "name",
  sortDir: "asc",
  foldersFirst: true,
  showHidden: false,
  showInfoPanel: false,
  theme: "auto",
  palette: "",
  preferredLightPalette: "",
  preferredDarkPalette: "",
  solarScheduleEnabled: false,
  solarDawnPalette: "",
  solarDayPalette: "",
  solarDuskPalette: "",
  solarNightPalette: "",
  folderThemes: {},
  favoriteThemes: [],
  atmosphere: "none",
  atmosphereIntensity: 60,
  atmosphereTier: "auto",
  atmosphereReactive: "off",
  atmospherePresets: [],
  atmosphereLayerMods: {},
  ambientPlaylistEnabled: false,
  ambientPlaylistIntervalMin: 15,
  ambientPlaylistTarget: "both",
  ambientPlaylistPool: "favorites",
  themeFontProfile: "default",
  themeCornerProfile: "default",
  themeIconGlow: "off",
  uiElementFx: "off",
  iconPackStyle: "default",
  themeShowMode: "cinema_hud",
  themeShowChannel: "all_ultra",
  themeShowIntervalSec: 15,
  themeShowIdleMinutes: 0,
  themeShowTransition: "oklab_morph",
  themeShowExitOnMove: false,
  themeShowClock: true,
  themeShowBoostTier: "extreme",
  textSize: 100,
  lastPath: "",
  seenWelcome: false,
  terminalFollow: true,
  terminalOpen: false,
  terminalHeight: TERMINAL_HEIGHT_DEFAULT,
  terminalPath: "",
  workspace: "files",
  startWith: "files",
  splitSide: "right",
  splitSize: 50,
  sidebarCollapsed: false,
  focusMode: false,
  activeTool: "",
  splitTool: "",
  dualPath: "",
  typeWarnings: true,
  backspaceDeletes: true,
  shortcutsCantClose: false,
  editor: "default",
  serveOptions: { kind: "auto", liveReload: true, openBrowser: true },
  deleteTo: "bin",
  dbShortcut: "window",
  textOpensIn: "builtin",
  mediaOpensIn: "manager",
  shortcuts: {},
  studioPresets: { image: [], media: [] },
  columns: [],
  groupBy: "none",
  tags: {},
  treeExpanded: false,
};

export const MAX_FAVORITES = 100;
export const MAX_FAVORITE_NAME = 60;
export const MAX_FAVORITE_THEMES = 50;
export const MAX_RECENTS = 30;
export const MAX_STUDIO_PRESETS = 50;
export const MAX_PRESET_NAME = 40;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Keeps only what is valid, with defaults for the rest. Paths must be absolute for the platform. */
export function sanitizeSettings(raw: unknown, ctx: FmContext): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = pathApi(ctx);
  const isPath = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 4096 && !v.includes("\0") && p.isAbsolute(v);
  const favorites: string[] = [];
  for (const f of Array.isArray(r.favorites) ? r.favorites : []) if (isPath(f) && !favorites.includes(p.resolve(f)) && favorites.length < MAX_FAVORITES) favorites.push(p.resolve(f));
  const names: Record<string, string> = {};
  const rawNames = r.favoriteNames && typeof r.favoriteNames === "object" && !Array.isArray(r.favoriteNames) ? (r.favoriteNames as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(rawNames)) {
    if (!isPath(key) || typeof value !== "string") continue;
    const path = p.resolve(key);
    // eslint-disable-next-line no-control-regex
    const name = value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, MAX_FAVORITE_NAME);
    if (favorites.includes(path) && name) names[path] = name;
  }
  const recents: Settings["recents"] = [];
  for (const x of Array.isArray(r.recents) ? r.recents : []) {
    const item = x as { path?: unknown; at?: unknown };
    if (isPath(item?.path) && recents.length < MAX_RECENTS && !recents.some((q) => q.path === p.resolve(item.path as string))) {
      recents.push({ path: p.resolve(item.path as string), at: typeof item.at === "string" && !isNaN(Date.parse(item.at)) ? item.at : new Date(0).toISOString() });
    }
  }
  const favoriteThemes: string[] = [];
  for (const k of Array.isArray(r.favoriteThemes) ? r.favoriteThemes : []) {
    if (typeof k === "string" && /^[a-z0-9_]{1,60}$/.test(k) && !favoriteThemes.includes(k) && favoriteThemes.length < MAX_FAVORITE_THEMES) {
      favoriteThemes.push(k);
    }
  }
  const columns: ExtraColumn[] = [];
  for (const c of Array.isArray(r.columns) ? r.columns : []) {
    if ((EXTRA_COLUMNS as readonly string[]).includes(c as string) && !columns.includes(c as ExtraColumn)) {
      columns.push(c as ExtraColumn);
    }
  }
  const tags: Record<string, TagColor> = {};
  const rawTags = r.tags && typeof r.tags === "object" && !Array.isArray(r.tags) ? (r.tags as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(rawTags)) {
    if (Object.keys(tags).length >= MAX_TAGS) break;
    if (!isPath(key) || typeof value !== "string") continue;
    if ((TAG_COLORS as readonly string[]).includes(value)) {
      tags[p.resolve(key)] = value as TagColor;
    }
  }
  const size = typeof r.textSize === "number" && isFinite(r.textSize) ? Math.round(Math.min(160, Math.max(80, r.textSize))) : DEFAULT_SETTINGS.textSize;
  const atmosphereIntensity = typeof r.atmosphereIntensity === "number" && isFinite(r.atmosphereIntensity) ? Math.round(Math.min(100, Math.max(10, r.atmosphereIntensity))) : DEFAULT_SETTINGS.atmosphereIntensity;
  const terminalHeight = typeof r.terminalHeight === "number" && isFinite(r.terminalHeight) ? Math.round(Math.min(TERMINAL_HEIGHT_MAX, Math.max(TERMINAL_HEIGHT_MIN, r.terminalHeight))) : DEFAULT_SETTINGS.terminalHeight;
  const isPaletteKey = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,60}$/.test(v);
  const folderThemes: Record<string, string> = {};
  const rawFolderThemes = r.folderThemes && typeof r.folderThemes === "object" && !Array.isArray(r.folderThemes) ? (r.folderThemes as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(rawFolderThemes)) {
    if (Object.keys(folderThemes).length >= MAX_FOLDER_THEMES) break;
    if (!isPath(key) || !isPaletteKey(value)) continue;
    folderThemes[p.resolve(key)] = value;
  }
  return {
    favorites,
    favoriteNames: names,
    recents,
    recentsEnabled: typeof r.recentsEnabled === "boolean" ? r.recentsEnabled : DEFAULT_SETTINGS.recentsEnabled,
    view: oneOf(r.view, ["details", "list", "icons"], DEFAULT_SETTINGS.view),
    sortBy: oneOf(r.sortBy, ["name", "modified", "size", "type"], DEFAULT_SETTINGS.sortBy),
    sortDir: oneOf(r.sortDir, ["asc", "desc"], DEFAULT_SETTINGS.sortDir),
    foldersFirst: typeof r.foldersFirst === "boolean" ? r.foldersFirst : DEFAULT_SETTINGS.foldersFirst,
    showHidden: typeof r.showHidden === "boolean" ? r.showHidden : DEFAULT_SETTINGS.showHidden,
    showInfoPanel: typeof r.showInfoPanel === "boolean" ? r.showInfoPanel : DEFAULT_SETTINGS.showInfoPanel,
    theme: oneOf(r.theme, ["auto", "light", "dark"], DEFAULT_SETTINGS.theme),
    palette: isPaletteKey(r.palette) ? r.palette : "",
    preferredLightPalette: isPaletteKey(r.preferredLightPalette) ? r.preferredLightPalette : "",
    preferredDarkPalette: isPaletteKey(r.preferredDarkPalette) ? r.preferredDarkPalette : "",
    solarScheduleEnabled: typeof r.solarScheduleEnabled === "boolean" ? r.solarScheduleEnabled : DEFAULT_SETTINGS.solarScheduleEnabled,
    solarDawnPalette: isPaletteKey(r.solarDawnPalette) ? r.solarDawnPalette : "",
    solarDayPalette: isPaletteKey(r.solarDayPalette) ? r.solarDayPalette : "",
    solarDuskPalette: isPaletteKey(r.solarDuskPalette) ? r.solarDuskPalette : "",
    solarNightPalette: isPaletteKey(r.solarNightPalette) ? r.solarNightPalette : "",
    folderThemes,
    favoriteThemes,
    atmosphere: normalizeAtmosphereSpec(r.atmosphere) || DEFAULT_SETTINGS.atmosphere,
    atmosphereIntensity,
    atmosphereTier: oneOf(r.atmosphereTier, ATMOSPHERE_TIERS, DEFAULT_SETTINGS.atmosphereTier),
    atmosphereReactive: oneOf(r.atmosphereReactive, ATMOSPHERE_REACTIVE_MODES, DEFAULT_SETTINGS.atmosphereReactive),
    atmospherePresets: sanitizeAtmospherePresets(r.atmospherePresets),
    atmosphereLayerMods: sanitizeAtmosphereLayerMods(r.atmosphereLayerMods),
    ambientPlaylistEnabled: typeof r.ambientPlaylistEnabled === "boolean" ? r.ambientPlaylistEnabled : DEFAULT_SETTINGS.ambientPlaylistEnabled,
    ambientPlaylistIntervalMin: typeof r.ambientPlaylistIntervalMin === "number" && isFinite(r.ambientPlaylistIntervalMin) ? Math.round(Math.min(240, Math.max(1, r.ambientPlaylistIntervalMin))) : DEFAULT_SETTINGS.ambientPlaylistIntervalMin,
    ambientPlaylistTarget: oneOf(r.ambientPlaylistTarget, AMBIENT_PLAYLIST_TARGETS, DEFAULT_SETTINGS.ambientPlaylistTarget),
    ambientPlaylistPool: oneOf(r.ambientPlaylistPool, AMBIENT_PLAYLIST_POOLS, DEFAULT_SETTINGS.ambientPlaylistPool),
    themeFontProfile: oneOf(r.themeFontProfile, THEME_FONT_PROFILES, DEFAULT_SETTINGS.themeFontProfile),
    themeCornerProfile: oneOf(r.themeCornerProfile, THEME_CORNER_PROFILES, DEFAULT_SETTINGS.themeCornerProfile),
    themeIconGlow: oneOf(r.themeIconGlow, THEME_ICON_GLOWS, DEFAULT_SETTINGS.themeIconGlow),
    uiElementFx: oneOf(r.uiElementFx, UI_ELEMENT_FX_MODES, DEFAULT_SETTINGS.uiElementFx),
    iconPackStyle: oneOf(r.iconPackStyle, ICON_PACK_STYLES, DEFAULT_SETTINGS.iconPackStyle),
    themeShowMode: oneOf(r.themeShowMode, THEME_SHOW_MODES, DEFAULT_SETTINGS.themeShowMode),
    themeShowChannel: oneOf(r.themeShowChannel, THEME_SHOW_CHANNELS, DEFAULT_SETTINGS.themeShowChannel),
    themeShowIntervalSec: typeof r.themeShowIntervalSec === "number" && isFinite(r.themeShowIntervalSec) ? Math.round(Math.min(600, Math.max(5, r.themeShowIntervalSec))) : DEFAULT_SETTINGS.themeShowIntervalSec,
    themeShowIdleMinutes: typeof r.themeShowIdleMinutes === "number" && isFinite(r.themeShowIdleMinutes) ? Math.round(Math.min(120, Math.max(0, r.themeShowIdleMinutes))) : DEFAULT_SETTINGS.themeShowIdleMinutes,
    themeShowTransition: oneOf(r.themeShowTransition, THEME_SHOW_TRANSITIONS, DEFAULT_SETTINGS.themeShowTransition),
    themeShowExitOnMove: typeof r.themeShowExitOnMove === "boolean" ? r.themeShowExitOnMove : DEFAULT_SETTINGS.themeShowExitOnMove,
    themeShowClock: typeof r.themeShowClock === "boolean" ? r.themeShowClock : DEFAULT_SETTINGS.themeShowClock,
    themeShowBoostTier: oneOf(r.themeShowBoostTier, THEME_SHOW_BOOST_TIERS, DEFAULT_SETTINGS.themeShowBoostTier),
    textSize: size,
    lastPath: isPath(r.lastPath) ? p.resolve(r.lastPath) : "",
    seenWelcome: typeof r.seenWelcome === "boolean" ? r.seenWelcome : DEFAULT_SETTINGS.seenWelcome,
    terminalFollow: typeof r.terminalFollow === "boolean" ? r.terminalFollow : DEFAULT_SETTINGS.terminalFollow,
    terminalOpen: typeof r.terminalOpen === "boolean" ? r.terminalOpen : DEFAULT_SETTINGS.terminalOpen,
    terminalHeight,
    terminalPath: isPath(r.terminalPath) ? p.resolve(r.terminalPath) : "",
    workspace: oneOf(r.workspace, WORKSPACES, DEFAULT_SETTINGS.workspace),
    startWith: oneOf(r.startWith, ["files", "home", "last"], DEFAULT_SETTINGS.startWith),
    splitSide: oneOf(r.splitSide, ["right", "bottom"], DEFAULT_SETTINGS.splitSide),
    splitSize: typeof r.splitSize === "number" && isFinite(r.splitSize) ? Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r.splitSize))) : DEFAULT_SETTINGS.splitSize,
    sidebarCollapsed: typeof r.sidebarCollapsed === "boolean" ? r.sidebarCollapsed : DEFAULT_SETTINGS.sidebarCollapsed,
    focusMode: typeof r.focusMode === "boolean" ? r.focusMode : DEFAULT_SETTINGS.focusMode,
    activeTool: typeof r.activeTool === "string" && TOOL_ID.test(r.activeTool) ? r.activeTool : "",
    splitTool: typeof r.splitTool === "string" && TOOL_ID.test(r.splitTool) ? r.splitTool : "",
    dualPath: isPath(r.dualPath) ? p.resolve(r.dualPath) : "",
    typeWarnings: typeof r.typeWarnings === "boolean" ? r.typeWarnings : DEFAULT_SETTINGS.typeWarnings,
    backspaceDeletes: typeof r.backspaceDeletes === "boolean" ? r.backspaceDeletes : DEFAULT_SETTINGS.backspaceDeletes,
    shortcutsCantClose: typeof r.shortcutsCantClose === "boolean" ? r.shortcutsCantClose : DEFAULT_SETTINGS.shortcutsCantClose,
    editor: oneOf(r.editor, ["default", "vscode", "subl", "webstorm", "idea"], DEFAULT_SETTINGS.editor),
    serveOptions: sanitizeServeOptions(r.serveOptions),
    deleteTo: oneOf(r.deleteTo, ["bin", "graveyard"], DEFAULT_SETTINGS.deleteTo),
    dbShortcut: oneOf(r.dbShortcut, ["window", "browser"], DEFAULT_SETTINGS.dbShortcut),
    textOpensIn: oneOf(r.textOpensIn, ["builtin", "editor", "system"], DEFAULT_SETTINGS.textOpensIn),
    mediaOpensIn: oneOf(r.mediaOpensIn, ["manager", "system"], DEFAULT_SETTINGS.mediaOpensIn),
    shortcuts: sanitizeOverrides(r.shortcuts, ctx.platform) as Record<string, string[]>,
    studioPresets: sanitizeStudioPresets(r.studioPresets),
    columns,
    groupBy: oneOf(r.groupBy, GROUP_BY_MODES, DEFAULT_SETTINGS.groupBy),
    tags,
    treeExpanded: typeof r.treeExpanded === "boolean" ? r.treeExpanded : DEFAULT_SETTINGS.treeExpanded,
  };
}

function sanitizeAtmosphereLayerMods(raw: unknown): Record<string, AtmosphereLayerMod> {
  const out: Record<string, AtmosphereLayerMod> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_LAYER_MODS) break;
    if (!id || id === "none" || !ATMOSPHERE_EFFECTS.includes(id) || !val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    const mod: AtmosphereLayerMod = {};
    if (typeof v.opacity === "number" && isFinite(v.opacity)) {
      mod.opacity = Math.round(Math.min(150, Math.max(10, v.opacity)));
    }
    if (typeof v.speed === "number" && isFinite(v.speed)) {
      mod.speed = Math.round(Math.min(3.0, Math.max(0.25, v.speed)) * 100) / 100;
    }
    if (typeof v.color === "string" && /^#[0-9a-fA-F]{6}$/.test(v.color.trim())) {
      mod.color = v.color.trim().toLowerCase();
    }
    if (mod.opacity !== undefined || mod.speed !== undefined || mod.color !== undefined) {
      out[id] = mod;
    }
  }
  return out;
}

function sanitizeAtmospherePresets(raw: unknown): AtmospherePreset[] {
  const out: AtmospherePreset[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_ATMOSPHERE_PRESETS || !item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    // eslint-disable-next-line no-control-regex
    const name = typeof x.name === "string" ? x.name.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, MAX_PRESET_NAME) : "";
    const effect = normalizeAtmosphereSpec(x.effect);
    if (!name || !effect || effect === "none" || out.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    const intensity = typeof x.intensity === "number" && isFinite(x.intensity) ? Math.round(Math.min(100, Math.max(10, x.intensity))) : DEFAULT_SETTINGS.atmosphereIntensity;
    const tier = oneOf(x.tier, ATMOSPHERE_TIERS, DEFAULT_SETTINGS.atmosphereTier);
    const reactive = oneOf(x.reactive, ATMOSPHERE_REACTIVE_MODES, DEFAULT_SETTINGS.atmosphereReactive);
    const layerMods = sanitizeAtmosphereLayerMods(x.layerMods);
    out.push(Object.keys(layerMods).length ? { name, effect, intensity, tier, reactive, layerMods } : { name, effect, intensity, tier, reactive });
  }
  return out;
}

function sanitizePresetList(raw: unknown): StudioPreset[] {
  const out: StudioPreset[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_STUDIO_PRESETS || !item || typeof item !== "object") continue;
    const x = item as { name?: unknown; options?: unknown };
    // eslint-disable-next-line no-control-regex
    const name = typeof x.name === "string" ? x.name.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, MAX_PRESET_NAME) : "";
    if (!name || out.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    const options: StudioPreset["options"] = {};
    const rawOpts = x.options && typeof x.options === "object" && !Array.isArray(x.options) ? (x.options as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(rawOpts).slice(0, 60)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(k)) continue;
      if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) options[k] = v;
      else if (typeof v === "string" && v.length <= 60 && !v.includes("\0")) options[k] = v;
    }
    out.push({ name, options });
  }
  return out;
}

function sanitizeStudioPresets(raw: unknown): Settings["studioPresets"] {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return { image: sanitizePresetList(r.image), media: sanitizePresetList(r.media) };
}

function sanitizeServeOptions(raw: unknown): Settings["serveOptions"] {
  const d = DEFAULT_SETTINGS.serveOptions;
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    kind: oneOf(r.kind, ["auto", "static", "php"], d.kind),
    liveReload: typeof r.liveReload === "boolean" ? r.liveReload : d.liveReload,
    openBrowser: typeof r.openBrowser === "boolean" ? r.openBrowser : d.openBrowser,
  };
}

const settingsFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager.json");

let writing: Promise<unknown> = Promise.resolve();

async function readSettingsRaw(ctx: FmContext): Promise<Settings> {
  try {
    const raw = JSON.parse(await fsp.readFile(settingsFile(ctx), "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.backspaceDeletes === false && raw.backspaceGoesUp !== true) {
      delete raw.backspaceDeletes;
    }
    return sanitizeSettings(raw, ctx);
  } catch {
    return sanitizeSettings({}, ctx);
  }
}

export async function loadSettings(ctx: FmContext): Promise<Settings> {
  await writing;
  return readSettingsRaw(ctx);
}

/** Applies a partial change and saves it. Unknown keys are ignored. */
export async function updateSettings(ctx: FmContext, change: unknown): Promise<Settings> {
  const run = async () => {
    const current = await readSettingsRaw(ctx);
    const patch = change && typeof change === "object" ? (change as Record<string, unknown>) : {};
    const keys = Object.keys(DEFAULT_SETTINGS);
    const merged: Record<string, unknown> = { ...current };
    for (const k of keys) if (k in patch) merged[k] = patch[k];
    const next = sanitizeSettings(merged, ctx);
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    const tmp = `${settingsFile(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    const stored = next.backspaceDeletes === false ? { ...next, backspaceGoesUp: true } : next;
    const body = JSON.stringify(stored, null, 2);
    await fsp.writeFile(tmp, body, { mode: 0o600 });
    try {
      await fsp.rename(tmp, settingsFile(ctx));
    } catch {
      await fsp.writeFile(settingsFile(ctx), body, { mode: 0o600 });
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
    return next;
  };
  const result = writing.then(run, run);
  writing = result.catch(() => {});
  return result;
}

/** Remembers that an item was opened (newest first, no duplicates, at most 30). No-op when `recentsEnabled` is false. */
export async function addRecent(ctx: FmContext, path: string): Promise<Settings> {
  const current = await loadSettings(ctx);
  if (!current.recentsEnabled) return current;
  const p = pathApi(ctx);
  const resolved = p.resolve(path);
  const recents = [{ path: resolved, at: new Date().toISOString() }, ...current.recents.filter((r) => r.path !== resolved)].slice(0, MAX_RECENTS);
  return updateSettings(ctx, { recents });
}

/** Removes one item from the Recent list by path. */
export async function removeRecent(ctx: FmContext, path: string): Promise<Settings> {
  const current = await loadSettings(ctx);
  const p = pathApi(ctx);
  const resolved = p.resolve(path);
  const recents = current.recents.filter((r) => r.path !== resolved);
  return updateSettings(ctx, { recents });
}

/** Clears every remembered item from the Recent list. */
export async function clearRecents(ctx: FmContext): Promise<Settings> {
  return updateSettings(ctx, { recents: [] });
}

/** Removes items from the Recent list whose file is no longer on disk. */
export async function pruneRecents(ctx: FmContext): Promise<{ settings: Settings; removed: number }> {
  const current = await loadSettings(ctx);
  const kept: Settings["recents"] = [];
  for (const item of current.recents) {
    try {
      const st = await fsp.stat(item.path);
      if (!st.isDirectory()) kept.push(item);
    } catch {
      // missing or unreadable file is dropped
    }
  }
  const removed = current.recents.length - kept.length;
  const settings = removed > 0 ? await updateSettings(ctx, { recents: kept }) : current;
  return { settings, removed };
}
