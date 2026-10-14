/**
 * Walks a folder for the Dev tab's scans (code statistics, TODO scanner): sorted, one folder at a time, never
 * following symbolic links, honouring .gitignore files, hidden-file and vendored-folder switches and the user's
 * exclude globs, and stopping at hard limits (files, folders, time) or when cancelled.
 */
import { promises as fsp, type Dirent } from "fs";
import * as nodePath from "path";
import { tick } from "./fmCore";
import { inheritedIgnores, isIgnored, readIgnoreFiles, type IgnoreSet, parseIgnoreLines } from "./fmDevIgnore";

/** Folders full of other people's code or build output. */
export const VENDORED_DIRS = ["node_modules", "target", "dist", "build", ".git"];

export const HARD_MAX_FILES = 200_000;
export const HARD_MAX_DIRS = 100_000;
export const HARD_MAX_SECONDS = 60;
export const MAX_EXCLUDES = 50;

export interface WalkLimits {
  maxFiles: number;
  maxDirs: number;
  maxSeconds: number;
}

export interface WalkOptions extends Partial<WalkLimits> {
  respectIgnore?: boolean;
  hidden?: boolean;
  vendored?: boolean;
  excludes?: string[];
}

export interface WalkFile {
  abs: string;
  /** Relative to the scanned folder, with "/" separators. */
  rel: string;
  name: string;
}

export interface WalkReport {
  dirs: number;
  files: number;
  symlinks: number;
  ignored: number;
  hiddenSkipped: number;
  vendoredSkipped: number;
  /** Set when a limit stopped the walk: "files", "folders" or "time". */
  stoppedBy: "files" | "folders" | "time" | "bytes" | null;
  cancelled: boolean;
}

export interface Cancellable {
  cancelled: boolean;
}

const clampInt = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function resolveLimits(o: Partial<WalkLimits> | undefined): WalkLimits {
  return {
    maxFiles: clampInt(o?.maxFiles, HARD_MAX_FILES, 1, HARD_MAX_FILES),
    maxDirs: clampInt(o?.maxDirs, HARD_MAX_DIRS, 1, HARD_MAX_DIRS),
    maxSeconds: clampInt(o?.maxSeconds, HARD_MAX_SECONDS, 1, HARD_MAX_SECONDS),
  };
}

/** The user's exclude patterns (one per entry, .gitignore syntax) as a rule set for a scan of `root`. */
export function excludeSet(root: string, patterns: string[] | undefined): IgnoreSet | null {
  const clean = (patterns ?? []).filter((p) => typeof p === "string").map((p) => p.trim()).filter(Boolean).slice(0, MAX_EXCLUDES);
  const rules = parseIgnoreLines(clean.filter((p) => !p.startsWith("!")));
  return rules.length ? { base: root.replace(/\\/g, "/").replace(/\/$/, ""), rules } : null;
}

/**
 * Calls `onFiles` with the files of each folder in turn (already filtered) until the walk ends. `onFiles` may be
 * slow; the walk waits for it. Returns what was skipped and why it ended.
 */
export async function walkFiles(root: string, options: WalkOptions, signal: Cancellable, onFiles: (files: WalkFile[], report: WalkReport) => Promise<void | "bytes">): Promise<WalkReport> {
  const limits = resolveLimits(options);
  const report: WalkReport = { dirs: 0, files: 0, symlinks: 0, ignored: 0, hiddenSkipped: 0, vendoredSkipped: 0, stoppedBy: null, cancelled: false };
  const started = Date.now();
  const respect = options.respectIgnore !== false;
  const inherited = respect ? await inheritedIgnores(root) : [];
  const excludes = excludeSet(root, options.excludes);
  const stack: Array<{ dir: string; rel: string; sets: IgnoreSet[] }> = [{ dir: root, rel: "", sets: inherited }];
  let lastYield = Date.now();
  while (stack.length) {
    if (signal.cancelled) {
      report.cancelled = true;
      break;
    }
    if (Date.now() - started > limits.maxSeconds * 1000) {
      report.stoppedBy = "time";
      break;
    }
    if (report.dirs >= limits.maxDirs) {
      report.stoppedBy = "folders";
      break;
    }
    const frame = stack.pop()!;
    report.dirs++;
    let entries: Dirent[];
    try {
      entries = await fsp.readdir(frame.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    let sets = frame.sets;
    if (respect) {
      const own = await readIgnoreFiles(frame.dir);
      if (own) sets = [...sets, own];
    }
    const files: WalkFile[] = [];
    const dirs: Array<{ dir: string; rel: string; sets: IgnoreSet[] }> = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) {
        report.symlinks++;
        continue;
      }
      const isDir = e.isDirectory();
      if (!isDir && !e.isFile()) continue;
      if (e.name.startsWith(".") && !options.hidden) {
        report.hiddenSkipped++;
        continue;
      }
      if (isDir && !options.vendored && VENDORED_DIRS.includes(e.name)) {
        report.vendoredSkipped++;
        continue;
      }
      const abs = nodePath.join(frame.dir, e.name);
      const absSlash = abs.replace(/\\/g, "/");
      if ((respect && isIgnored(sets, absSlash, isDir)) || (excludes && isIgnored([excludes], absSlash, isDir))) {
        report.ignored++;
        continue;
      }
      const rel = frame.rel ? `${frame.rel}/${e.name}` : e.name;
      if (isDir) dirs.push({ dir: abs, rel, sets });
      else files.push({ abs, rel, name: e.name });
    }
    if (files.length) {
      const room = limits.maxFiles - report.files;
      if (files.length > room) {
        files.length = Math.max(0, room);
        report.stoppedBy = "files";
      }
      report.files += files.length;
      if (files.length && (await onFiles(files, report)) === "bytes") report.stoppedBy = "bytes";
      if (report.stoppedBy) break;
    }
    for (let k = dirs.length - 1; k >= 0; k--) stack.push(dirs[k]!);
    if (Date.now() - lastYield > 12) {
      await tick();
      lastYield = Date.now();
    }
  }
  return report;
}
