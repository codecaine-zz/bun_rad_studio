/**
 * The File Manager's remembered settings: pinned folders, view, sorting, theme, and recently opened items.
 * One small JSON file in the app's data folder, validated on every read and write so a hand-edited or damaged
 * file can never break the app.
 */
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import { pathApi, type FmContext } from "./fmCore";

export interface Settings {
  favorites: string[];
  /** A short name of the person's own for a favorite (the key is one of `favorites`). */
  favoriteNames: Record<string, string>;
  recents: Array<{ path: string; at: string }>;
  view: "details" | "list" | "icons";
  sortBy: "name" | "modified" | "size" | "type";
  sortDir: "asc" | "desc";
  foldersFirst: boolean;
  showHidden: boolean;
  showInfoPanel: boolean;
  theme: "auto" | "light" | "dark";
  /** The key of a colour theme from the theme gallery, or "" to use `theme` above. */
  palette: string;
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
  /** The Serve tool's remembered form choices. The network (LAN) option is never remembered. */
  serveOptions: { kind: "auto" | "static" | "php"; liveReload: boolean; openBrowser: boolean };
}

export const WORKSPACES = ["files", "home", "tools", "split", "dual"] as const;
export type Workspace = (typeof WORKSPACES)[number];
export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;
const TOOL_ID = /^[a-z][a-z0-9-]{0,24}$/;

export const DEFAULT_SETTINGS: Settings = {
  favorites: [],
  favoriteNames: {},
  recents: [],
  view: "details",
  sortBy: "name",
  sortDir: "asc",
  foldersFirst: true,
  showHidden: false,
  showInfoPanel: false,
  theme: "auto",
  palette: "",
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
  serveOptions: { kind: "auto", liveReload: true, openBrowser: true },
};

export const MAX_FAVORITES = 100;
export const MAX_FAVORITE_NAME = 60;
export const MAX_RECENTS = 30;

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
  const size = typeof r.textSize === "number" && isFinite(r.textSize) ? Math.round(Math.min(160, Math.max(80, r.textSize))) : DEFAULT_SETTINGS.textSize;
  return {
    favorites,
    favoriteNames: names,
    recents,
    view: oneOf(r.view, ["details", "list", "icons"], DEFAULT_SETTINGS.view),
    sortBy: oneOf(r.sortBy, ["name", "modified", "size", "type"], DEFAULT_SETTINGS.sortBy),
    sortDir: oneOf(r.sortDir, ["asc", "desc"], DEFAULT_SETTINGS.sortDir),
    foldersFirst: typeof r.foldersFirst === "boolean" ? r.foldersFirst : DEFAULT_SETTINGS.foldersFirst,
    showHidden: typeof r.showHidden === "boolean" ? r.showHidden : DEFAULT_SETTINGS.showHidden,
    showInfoPanel: typeof r.showInfoPanel === "boolean" ? r.showInfoPanel : DEFAULT_SETTINGS.showInfoPanel,
    theme: oneOf(r.theme, ["auto", "light", "dark"], DEFAULT_SETTINGS.theme),
    palette: typeof r.palette === "string" && /^[a-z0-9_]{1,60}$/.test(r.palette) ? r.palette : "",
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
    serveOptions: sanitizeServeOptions(r.serveOptions),
  };
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

/** Remembers that an item was opened (newest first, no duplicates, at most 30). */
export async function addRecent(ctx: FmContext, path: string): Promise<Settings> {
  const current = await loadSettings(ctx);
  const recents = [{ path, at: new Date().toISOString() }, ...current.recents.filter((r) => r.path !== path)].slice(0, MAX_RECENTS);
  return updateSettings(ctx, { recents });
}
