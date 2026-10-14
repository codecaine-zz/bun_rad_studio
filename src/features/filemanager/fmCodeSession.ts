/**
 * The Code tab's remembered state: open tabs (with cursor and scroll), settings, recent files and bookmarks.
 * One small JSON file in the app's data folder, checked on every read and write so a damaged or hand-edited file
 * can never break the editor.
 */
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import { pathApi, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";

export const MAX_SESSION_BYTES = 200 * 1024;
export const THEMES = ["auto", "dracula", "github", "monokai", "nordic", "onedark", "solarized"] as const;

export interface CodeSession {
  version: 1;
  root: string;
  tabs: Array<{ path: string; line: number; col: number; scrollTop: number }>;
  active: string;
  settings: { theme: string; fontSize: number; wrap: boolean; lineNumbers: boolean; minimap: boolean; autosave: boolean; autosaveDelay: number; autosaveOnBlur: boolean; tabSize: number; showHidden: boolean; explorer: boolean; completion: boolean; autoOpen: boolean };
  recents: Array<{ path: string; at: string }>;
  bookmarks: Record<string, number[]>;
}

export const DEFAULT_SETTINGS: CodeSession["settings"] = { theme: "auto", fontSize: 14, wrap: false, lineNumbers: true, minimap: false, autosave: false, autosaveDelay: 1500, autosaveOnBlur: true, tabSize: 2, showHidden: false, explorer: true, completion: true, autoOpen: true };

const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export function sanitizeSession(raw: unknown, ctx: FmContext): CodeSession {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const p = pathApi(ctx);
  const isPath = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 4096 && !v.includes("\0") && p.isAbsolute(v);
  const tabs: CodeSession["tabs"] = [];
  for (const t of Array.isArray(r.tabs) ? r.tabs : []) {
    if (tabs.length >= 50) break;
    if (t && isPath(t.path) && !tabs.some((x) => x.path === p.resolve(t.path))) {
      tabs.push({ path: p.resolve(t.path), line: num(t.line, 1, 10_000_000, 1), col: num(t.col, 1, 100_000, 1), scrollTop: num(t.scrollTop, 0, 100_000_000, 0) });
    }
  }
  const recents: CodeSession["recents"] = [];
  for (const x of Array.isArray(r.recents) ? r.recents : []) {
    if (recents.length >= 30) break;
    if (x && isPath(x.path) && !recents.some((q) => q.path === p.resolve(x.path))) {
      recents.push({ path: p.resolve(x.path), at: typeof x.at === "string" && !isNaN(Date.parse(x.at)) ? x.at : new Date(0).toISOString() });
    }
  }
  const bookmarks: CodeSession["bookmarks"] = {};
  const b = r.bookmarks && typeof r.bookmarks === "object" && !Array.isArray(r.bookmarks) ? r.bookmarks : {};
  for (const key of Object.keys(b).slice(0, 200)) {
    if (!isPath(key) || !Array.isArray(b[key])) continue;
    const lines = [...new Set((b[key] as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 10_000_000))].sort((a, c) => a - c).slice(0, 200);
    if (lines.length) bookmarks[p.resolve(key)] = lines;
  }
  const s = (r.settings && typeof r.settings === "object" ? r.settings : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const active = isPath(r.active) && tabs.some((t) => t.path === p.resolve(r.active)) ? p.resolve(r.active) : "";
  return {
    version: 1,
    root: isPath(r.root) ? p.resolve(r.root) : "",
    tabs,
    active,
    settings: {
      theme: (THEMES as readonly string[]).includes(s.theme as string) ? (s.theme as string) : d.theme,
      fontSize: num(s.fontSize, 8, 40, d.fontSize),
      wrap: bool(s.wrap, d.wrap),
      lineNumbers: bool(s.lineNumbers, d.lineNumbers),
      minimap: bool(s.minimap, d.minimap),
      autosave: bool(s.autosave, d.autosave),
      autosaveDelay: num(s.autosaveDelay, 300, 60000, d.autosaveDelay),
      autosaveOnBlur: bool(s.autosaveOnBlur, d.autosaveOnBlur),
      tabSize: num(s.tabSize, 1, 16, d.tabSize),
      showHidden: bool(s.showHidden, d.showHidden),
      explorer: bool(s.explorer, d.explorer),
      completion: bool(s.completion, d.completion),
      autoOpen: bool(s.autoOpen, d.autoOpen),
    },
    recents,
    bookmarks,
  };
}

const sessionFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_code.json");

export async function loadCodeSession(ctx: FmContext): Promise<CodeSession> {
  try {
    const text = await fsp.readFile(sessionFile(ctx), "utf8");
    if (text.length > MAX_SESSION_BYTES) return sanitizeSession({}, ctx);
    return sanitizeSession(JSON.parse(text), ctx);
  } catch {
    return sanitizeSession({}, ctx);
  }
}

let writing: Promise<unknown> = Promise.resolve();

/** Replaces the parts that are given (tabs, active, root, settings, recents, bookmarks) and saves. */
export async function updateCodeSession(ctx: FmContext, change: unknown): Promise<CodeSession> {
  if (!change || typeof change !== "object" || Array.isArray(change)) throw new FmError("BAD_REQUEST", "That session isn't valid.");
  const run = async () => {
    const current = await loadCodeSession(ctx);
    const patch = change as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...current };
    for (const k of ["root", "tabs", "active", "recents", "bookmarks"]) if (k in patch) merged[k] = patch[k];
    if ("settings" in patch && patch.settings && typeof patch.settings === "object") merged.settings = { ...current.settings, ...(patch.settings as object) };
    const next = sanitizeSession(merged, ctx);
    const text = JSON.stringify(next);
    if (text.length > MAX_SESSION_BYTES) throw new FmError("TOO_LARGE", "There is too much to remember (too many bookmarks or open files).");
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    const tmp = `${sessionFile(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, text, { mode: 0o600 });
    await fsp.rename(tmp, sessionFile(ctx));
    return next;
  };
  const result = writing.then(run, run);
  writing = result.catch(() => {});
  return result;
}
