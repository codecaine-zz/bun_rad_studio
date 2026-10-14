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
  recents: Array<{ path: string; at: string }>;
  view: "details" | "list" | "icons";
  sortBy: "name" | "modified" | "size" | "type";
  sortDir: "asc" | "desc";
  foldersFirst: boolean;
  showHidden: boolean;
  showInfoPanel: boolean;
  theme: "auto" | "light" | "dark";
  textSize: number;
  lastPath: string;
  seenWelcome: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  favorites: [],
  recents: [],
  view: "details",
  sortBy: "name",
  sortDir: "asc",
  foldersFirst: true,
  showHidden: false,
  showInfoPanel: false,
  theme: "auto",
  textSize: 100,
  lastPath: "",
  seenWelcome: false,
};

export const MAX_FAVORITES = 50;
export const MAX_RECENTS = 30;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Keeps only what is valid, with defaults for the rest. Paths must be absolute for the platform. */
export function sanitizeSettings(raw: unknown, ctx: FmContext): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = pathApi(ctx);
  const isPath = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 4096 && !v.includes("\0") && p.isAbsolute(v);
  const favorites: string[] = [];
  for (const f of Array.isArray(r.favorites) ? r.favorites : []) if (isPath(f) && !favorites.includes(p.resolve(f)) && favorites.length < MAX_FAVORITES) favorites.push(p.resolve(f));
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
    recents,
    view: oneOf(r.view, ["details", "list", "icons"], DEFAULT_SETTINGS.view),
    sortBy: oneOf(r.sortBy, ["name", "modified", "size", "type"], DEFAULT_SETTINGS.sortBy),
    sortDir: oneOf(r.sortDir, ["asc", "desc"], DEFAULT_SETTINGS.sortDir),
    foldersFirst: typeof r.foldersFirst === "boolean" ? r.foldersFirst : DEFAULT_SETTINGS.foldersFirst,
    showHidden: typeof r.showHidden === "boolean" ? r.showHidden : DEFAULT_SETTINGS.showHidden,
    showInfoPanel: typeof r.showInfoPanel === "boolean" ? r.showInfoPanel : DEFAULT_SETTINGS.showInfoPanel,
    theme: oneOf(r.theme, ["auto", "light", "dark"], DEFAULT_SETTINGS.theme),
    textSize: size,
    lastPath: isPath(r.lastPath) ? p.resolve(r.lastPath) : "",
    seenWelcome: typeof r.seenWelcome === "boolean" ? r.seenWelcome : DEFAULT_SETTINGS.seenWelcome,
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
