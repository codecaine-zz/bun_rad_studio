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
  /** Theme keys pinned by the user to appear at the top of the gallery and in the Themes menu. */
  favoriteThemes: string[];
  /** Optional atmospheric special effect or `+`-combined multi-effect mix shown across the File Manager. */
  atmosphere: AtmosphereEffect;
  /** Intensity of the atmospheric special effect from 10 to 100 (default 60). */
  atmosphereIntensity: number;
  /** Hardware graphics tier for atmospheric effects: "auto" detects Apple Silicon / modern ARM / CPU cores, or manual "low" | "medium" | "high" | "ultra". */
  atmosphereTier: AtmosphereTier;
  textSize: number;
  lastPath: string;
  seenWelcome: boolean;
  /** The file list follows the terminal when you `cd` in it. */
  terminalFollow: boolean;
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

export const WORKSPACES = ["files", "home", "tools", "split", "dual"] as const;
export type Workspace = (typeof WORKSPACES)[number];
export const ATMOSPHERE_EFFECTS: readonly string[] = ATMOSPHERE_IDS;
export type AtmosphereEffect = string;
export const ATMOSPHERE_TIERS = ["auto", "low", "medium", "high", "ultra"] as const;
export type AtmosphereTier = (typeof ATMOSPHERE_TIERS)[number];
export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;
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
  favoriteThemes: [],
  atmosphere: "none",
  atmosphereIntensity: 60,
  atmosphereTier: "auto",
  textSize: 100,
  lastPath: "",
  seenWelcome: false,
  terminalFollow: true,
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
  backspaceDeletes: false,
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
  const isPaletteKey = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,60}$/.test(v);
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
    favoriteThemes,
    atmosphere: normalizeAtmosphereSpec(r.atmosphere) || DEFAULT_SETTINGS.atmosphere,
    atmosphereIntensity,
    atmosphereTier: oneOf(r.atmosphereTier, ATMOSPHERE_TIERS, DEFAULT_SETTINGS.atmosphereTier),
    textSize: size,
    lastPath: isPath(r.lastPath) ? p.resolve(r.lastPath) : "",
    seenWelcome: typeof r.seenWelcome === "boolean" ? r.seenWelcome : DEFAULT_SETTINGS.seenWelcome,
    terminalFollow: typeof r.terminalFollow === "boolean" ? r.terminalFollow : DEFAULT_SETTINGS.terminalFollow,
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

export async function loadSettings(ctx: FmContext): Promise<Settings> {
  try {
    return sanitizeSettings(JSON.parse(await fsp.readFile(settingsFile(ctx), "utf8")), ctx);
  } catch {
    return sanitizeSettings({}, ctx);
  }
}

let writing: Promise<unknown> = Promise.resolve();

/** Applies a partial change and saves it. Unknown keys are ignored. */
export async function updateSettings(ctx: FmContext, change: unknown): Promise<Settings> {
  const run = async () => {
    const current = await loadSettings(ctx);
    const patch = change && typeof change === "object" ? (change as Record<string, unknown>) : {};
    const keys = Object.keys(DEFAULT_SETTINGS);
    const merged: Record<string, unknown> = { ...current };
    for (const k of keys) if (k in patch) merged[k] = patch[k];
    const next = sanitizeSettings(merged, ctx);
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    const tmp = `${settingsFile(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, settingsFile(ctx));
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
