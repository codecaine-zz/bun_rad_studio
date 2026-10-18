/**
 * The File Manager window's size and position.
 *
 * The window opens filling the screen. When the person changes it (resize, move, maximise, full screen) the app
 * remembers that and uses it next time; "Reset to default" goes back to filling the screen.
 *
 * This module is shared by two processes: the window's (reads the saved state at start-up, writes it when the page
 * reports a change) and the server's (the Settings dialog's `window/get|set|reset`). It holds the format, the
 * validation, the atomic file writes and the pure planning of where the window goes, so both agree and tests need
 * no real window. The file is `file_manager_window.json` in the data folder, separate from `file_manager.json` (which
 * the server rewrites on its own), so the two processes never write the same file.
 *
 * Coordinates: x and y are the window's top-left corner, in points (Windows: pixels), measured from the top-left
 * corner of the primary screen with y growing downwards; a monitor left of or above the primary one has negative
 * numbers.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { homedir } from "os";
import * as nodePath from "path";
import { type FmContext, type FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";

export const WINDOW_FILE = "file_manager_window.json";
export const WINDOW_MODES = ["fill", "remember", "fullscreen"] as const;
/** fill = the screen's usable area (the default); remember = what the person last chose; fullscreen = the system's full-screen mode. */
export type WindowMode = (typeof WINDOW_MODES)[number];

export const MIN_WINDOW_WIDTH = 640;
export const MIN_WINDOW_HEIGHT = 420;
export const MAX_WINDOW_SIZE = 16384;
export const MAX_WINDOW_COORD = 100000;
/** The size of the window when it is not maximised and nothing is remembered (also what un-maximising goes back to). */
export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 820 } as const;
/** At least this much of a remembered window must still be on a screen for it to count as "on a screen". */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 60;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A monitor: its whole area and the part programs may use (without the menu bar, Dock or task bar). The first one is the primary. */
export interface FmScreen extends Rect {
  work: Rect;
}

export interface WindowState {
  /** The window's own size and position, as it is when not maximised (kept while it is maximised, so un-maximising comes back to it). */
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
  /** The size of the screen the window was on, and its pixel density: only to recognize a changed set-up. */
  screenWidth: number;
  screenHeight: number;
  dpr: number;
}

export interface WindowPrefs {
  mode: WindowMode;
  state: WindowState | null;
  /** Missing in older preferences, and when off (the default). */
  alwaysOnTop?: boolean;
}

export const DEFAULT_WINDOW_PREFS: Readonly<WindowPrefs> = { mode: "fill", state: null };

const defaultPrefs = (): WindowPrefs => ({ mode: "fill", state: null });

/** A finite number, limited to a range; anything else gives `undefined`. Strings such as "800" are not numbers. */
function number(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : undefined;
}

/** A remembered window that is usable, or null. Sizes are brought into range; a window without usable numbers is dropped. */
export function sanitizeWindowState(raw: unknown): WindowState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const x = number(r.x, -MAX_WINDOW_COORD, MAX_WINDOW_COORD);
  const y = number(r.y, -MAX_WINDOW_COORD, MAX_WINDOW_COORD);
  const width = number(r.width, MIN_WINDOW_WIDTH, MAX_WINDOW_SIZE);
  const height = number(r.height, MIN_WINDOW_HEIGHT, MAX_WINDOW_SIZE);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  const dpr = typeof r.dpr === "number" && Number.isFinite(r.dpr) ? Math.round(Math.min(8, Math.max(0.5, r.dpr)) * 100) / 100 : 1;
  return {
    x,
    y,
    width,
    height,
    maximized: r.maximized === true,
    fullscreen: r.fullscreen === true,
    screenWidth: number(r.screenWidth, 0, MAX_WINDOW_SIZE) ?? 0,
    screenHeight: number(r.screenHeight, 0, MAX_WINDOW_SIZE) ?? 0,
    dpr,
  };
}

export function sanitizeWindowPrefs(raw: unknown): WindowPrefs {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const mode = WINDOW_MODES.includes(r.mode as WindowMode) ? (r.mode as WindowMode) : "fill";
  return { mode, state: sanitizeWindowState(r.state), ...(r.alwaysOnTop === true ? { alwaysOnTop: true } : {}) };
}

export function isWindowMode(v: unknown): v is WindowMode {
  return typeof v === "string" && (WINDOW_MODES as readonly string[]).includes(v);
}

/** The data folder the window process uses: the same choice the server makes (`--data-dir`, else `~/.bun_rad_studio`). */
export function windowDataDir(context: { home?: string; dataDir?: string } = {}): string {
  return nodePath.resolve(context.dataDir ?? nodePath.join(nodePath.resolve(context.home ?? homedir()), ".bun_rad_studio"));
}

export const windowFile = (dataDir: string) => nodePath.join(dataDir, WINDOW_FILE);

/** The saved preference. A missing or damaged file means the default (fill the screen). */
export function readWindowPrefs(dataDir: string): WindowPrefs {
  try {
    return sanitizeWindowPrefs(JSON.parse(readFileSync(windowFile(dataDir), "utf8")));
  } catch {
    return defaultPrefs();
  }
}

/** Saves the preference: written to a private temporary file first, then renamed over the old one, so a reader never sees half a file. */
export function writeWindowPrefs(dataDir: string, prefs: WindowPrefs): WindowPrefs {
  const clean = sanitizeWindowPrefs(prefs);
  mkdirSync(dataDir, { recursive: true });
  const file = windowFile(dataDir);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ version: 1, ...clean }, null, 2), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    const wait = process.platform === "win32" ? new Int32Array(new SharedArrayBuffer(4)) : null;
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(tmp, file);
        break;
      } catch (err) {
        // Windows scanners can briefly hold a file without allowing its replacement.
        if (!wait || !(err instanceof Error) || !("code" in err) || !["EPERM", "EACCES", "EBUSY"].includes(String(err.code)) || attempt >= 10) throw err;
        Atomics.wait(wait, 0, 0, 25);
      }
    }
  } catch (err) {
    try { rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
  return clean;
}

/** Forgets everything: the next start fills the screen again. */
export function resetWindowPrefs(dataDir: string): WindowPrefs {
  rmSync(windowFile(dataDir), { force: true });
  return defaultPrefs();
}

export function sameWindowState(a: WindowState | null, b: WindowState | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.maximized === b.maximized && a.fullscreen === b.fullscreen && a.screenWidth === b.screenWidth && a.screenHeight === b.screenHeight && a.dpr === b.dpr;
}

/** While maximised or full screen, the window's own size and position stay what they were, so un-maximising later returns to them. */
export function mergeNormalBounds(previous: WindowState | null, next: WindowState): WindowState {
  if (previous && (next.maximized || next.fullscreen)) return { ...next, x: previous.x, y: previous.y, width: previous.width, height: previous.height };
  return next;
}

export interface ReportResult {
  prefs: WindowPrefs;
  /** True when `prefs` is new and should be written. */
  save: boolean;
  /** True when this change moved the preference to "Remember my window" (the page tells the person once). */
  modeSwitched: boolean;
}

/**
 * What to do when the page says the window now looks like this. Only a real change by the person counts: a window
 * that still fills the screen in "fill" mode (or is still in full screen in that mode) is as it should be, and a
 * report equal to what is saved changes nothing.
 */
export function reduceReport(prefs: WindowPrefs, raw: unknown): ReportResult {
  const nothing: ReportResult = { prefs, save: false, modeSwitched: false };
  const state = sanitizeWindowState(raw);
  if (!state) return nothing;
  if (prefs.mode === "fill" && state.maximized && !state.fullscreen) return nothing;
  if (prefs.mode === "fullscreen" && state.fullscreen) return nothing;
  const merged = mergeNormalBounds(prefs.state, state);
  const modeSwitched = prefs.mode !== "remember";
  if (!modeSwitched && sameWindowState(prefs.state, merged)) return nothing;
  return { prefs: { ...prefs, mode: "remember", state: merged }, save: true, modeSwitched };
}

export type WindowPlanMode = "maximize" | "fullscreen" | "normal";

export interface WindowPlan {
  /** What to do after sizing: fill the usable screen, enter full screen, or just show the window at this size. */
  mode: WindowPlanMode;
  /** Where the window's top-left corner goes; null when unknown (the window is then centered by the system). */
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  /** The usable area of the screen the window goes on (what "fill" falls back to if maximising isn't possible). */
  work: Rect | null;
  /** Why: default = nothing remembered, saved = restored as it was, adjusted = pulled onto the screen, offscreen = its screen is gone. */
  reason: "default" | "saved" | "adjusted" | "offscreen" | "no-screens";
}

const intersection = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
};

const between = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A rect of this size, shrunk to fit and centered in `work`. */
function centeredIn(work: Rect, width: number, height: number): Rect {
  const w = Math.min(width, work.width);
  const h = Math.min(height, work.height);
  return { x: work.x + Math.floor((work.width - w) / 2), y: work.y + Math.floor((work.height - h) / 2), width: w, height: h };
}

/** Which screens exist now, in a usable order; broken entries are dropped. */
function usableScreens(screens: FmScreen[]): FmScreen[] {
  const ok = (r: Rect | undefined) => !!r && [r.x, r.y, r.width, r.height].every((n) => typeof n === "number" && Number.isFinite(n)) && r.width >= 1 && r.height >= 1;
  return (Array.isArray(screens) ? screens : []).filter((s) => ok(s) && ok(s.work));
}

/**
 * Where the window goes at start-up. Pure: the saved preference, the screens that exist now (the first is the
 * primary) and the default size in, an exact size, position and mode out. A remembered window is always brought
 * fully onto a screen; one whose monitor is gone comes back centered on the primary screen.
 */
export function planWindow(prefs: WindowPrefs, screens: FmScreen[], defaults: { width: number; height: number } = DEFAULT_WINDOW_SIZE): WindowPlan {
  const dw = number(defaults.width, MIN_WINDOW_WIDTH, MAX_WINDOW_SIZE) ?? DEFAULT_WINDOW_SIZE.width;
  const dh = number(defaults.height, MIN_WINDOW_HEIGHT, MAX_WINDOW_SIZE) ?? DEFAULT_WINDOW_SIZE.height;
  const list = usableScreens(screens);
  const primary = list[0];
  const state = prefs.mode === "remember" ? prefs.state : null;

  if (!state) {
    const mode: WindowPlanMode = prefs.mode === "fullscreen" ? "fullscreen" : "maximize";
    if (!primary) return { mode, x: null, y: null, width: dw, height: dh, work: null, reason: "no-screens" };
    const r = centeredIn(primary.work, dw, dh);
    return { mode, x: r.x, y: r.y, width: r.width, height: r.height, work: primary.work, reason: "default" };
  }

  const mode: WindowPlanMode = state.fullscreen ? "fullscreen" : state.maximized ? "maximize" : "normal";
  if (!primary) return { mode, x: null, y: null, width: state.width, height: state.height, work: null, reason: "no-screens" };

  const rect: Rect = { x: state.x, y: state.y, width: state.width, height: state.height };
  let best: FmScreen | null = null;
  let bestArea = 0;
  for (const s of list) {
    const i = intersection(rect, s.work) ?? intersection(rect, s);
    const area = i && i.width >= Math.min(MIN_VISIBLE_WIDTH, rect.width) && i.height >= Math.min(MIN_VISIBLE_HEIGHT, rect.height) ? i.width * i.height : 0;
    if (area > bestArea) {
      best = s;
      bestArea = area;
    }
  }
  if (!best) {
    const r = centeredIn(primary.work, state.width, state.height);
    return { mode, x: r.x, y: r.y, width: r.width, height: r.height, work: primary.work, reason: "offscreen" };
  }
  const work = best.work;
  const width = Math.min(rect.width, work.width);
  const height = Math.min(rect.height, work.height);
  const x = between(rect.x, work.x, work.x + work.width - width);
  const y = between(rect.y, work.y, work.y + work.height - height);
  const moved = x !== rect.x || y !== rect.y || width !== rect.width || height !== rect.height;
  return { mode, x, y, width, height, work, reason: moved ? "adjusted" : "saved" };
}

/** What the page and the Settings dialog are told about the preference. */
const describe = (prefs: WindowPrefs) => ({ ...prefs, saved: prefs.state !== null });

/** `window/get`, `window/set` and `window/reset`: the Settings dialog reads and writes the same file the window process uses. */
export const windowOperations: Record<string, FmHandler> = {
  async "window/get"(ctx: FmContext) {
    return describe(readWindowPrefs(ctx.dataDir));
  },
  async "window/set"(ctx: FmContext, b) {
    const hasMode = b.mode !== undefined;
    const hasState = b.state !== undefined && b.state !== null;
    if (!hasMode && !hasState) throw new FmError("BAD_REQUEST", "Choose how the window should open.");
    if (hasMode && !isWindowMode(b.mode)) throw new FmError("BAD_REQUEST", "That isn't one of the window choices.");
    const current = readWindowPrefs(ctx.dataDir);
    let state = current.state;
    if (hasState) {
      state = sanitizeWindowState(b.state);
      if (!state) throw new FmError("BAD_REQUEST", "That window size and position isn't valid.");
    }
    const mode: WindowMode = hasMode ? b.mode : current.mode;
    return describe(writeWindowPrefs(ctx.dataDir, { ...current, mode, state }));
  },
  async "window/reset"(ctx: FmContext) {
    return describe(resetWindowPrefs(ctx.dataDir));
  },
};
