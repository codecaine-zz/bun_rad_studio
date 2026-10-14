/**
 * Reading what the page sent: the search form (checked and clamped), and "which items" for every bulk action,
 * which is either a recent search (resultId, with the page's filter and sort) or a list of paths.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { parseDurationMs, parseSizeFilter, type FdFileType, type FdSearchOptions } from "../../../applications/fd_engine";
import { filterResults, parseMaxResults, sortResults } from "../../fd_helpers";
import { absolutePath, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, type Platform } from "./fmPaths";
import { DEFAULT_MAX_RESULTS, MAX_CACHED_RESULTS, MAX_PATHS, MAX_RESULTS_CAP, type FindItem } from "./fmFindShared";
import { findState, type StoredResults } from "./fmFindRun";

// ---------------------------------------------------------------------------------------------------------------
// The search form
// ---------------------------------------------------------------------------------------------------------------

const TYPES = new Set<FdFileType>(["file", "directory", "executable", "symlink", "empty"]);

function words(value: unknown, maxItems: number, maxLength: number): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\s]+/) : [];
  return list.filter((w): w is string => typeof w === "string").map((w) => w.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems);
}

function depth(value: unknown, what: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) throw new FmError("BAD_DEPTH", `${what} must be a whole number, like 2.`);
  return Math.max(0, Math.min(64, n));
}

export interface ParsedSearch {
  root: string;
  options: FdSearchOptions;
}

/** Turns the page's form values into engine options. Anything odd is clamped or explained in plain words. */
export async function parseSearch(ctx: FmContext, b: Record<string, any>): Promise<ParsedSearch> {
  const root = absolutePath(ctx, b.root);
  await assertFolder(root, "The folder to search");
  const pattern = typeof b.pattern === "string" ? b.pattern.slice(0, 500) : "";
  const searchMode = b.mode === "glob" || b.mode === "fixed" ? b.mode : "regex";
  const caseMode = b.caseMode === "sensitive" || b.caseMode === "ignore" ? b.caseMode : "smart";

  const typeList = words(b.types ?? (typeof b.type === "string" && b.type !== "all" ? [b.type] : []), 10, 20);
  const types = typeList.filter((t): t is FdFileType => TYPES.has(t as FdFileType));

  let minSizeBytes: number | undefined;
  let maxSizeBytes: number | undefined;
  if (typeof b.size === "string" && b.size.trim()) {
    const parsed = parseSizeFilter(b.size.slice(0, 30));
    if (!parsed || !Number.isFinite(parsed.bytes)) throw new FmError("BAD_SIZE", 'I couldn\'t understand that size. Try "+1M" (bigger than 1 MB) or "-10k" (smaller than 10 KB).');
    if (parsed.mode === "greater") minSizeBytes = parsed.bytes;
    else if (parsed.mode === "less") maxSizeBytes = parsed.bytes;
    else {
      minSizeBytes = Math.floor(parsed.bytes * 0.9);
      maxSizeBytes = Math.ceil(parsed.bytes * 1.1);
    }
  }

  let changedWithinMs: number | undefined;
  if (typeof b.modified === "string" && b.modified.trim() && b.modified !== "any") {
    const ms = parseDurationMs(b.modified.slice(0, 20));
    if (ms === null || !Number.isFinite(ms) || ms <= 0) throw new FmError("BAD_AGE", 'I couldn\'t understand that time. Try "24h" or "7d".');
    changedWithinMs = Math.min(ms, 3650 * 86_400_000);
  }

  const minDepth = depth(b.minDepth, "The smallest depth");
  let maxDepth = depth(b.maxDepth, "The largest depth");
  if (minDepth !== undefined && maxDepth !== undefined && minDepth > maxDepth) throw new FmError("BAD_DEPTH", "The smallest depth can't be bigger than the largest depth.");
  const followSymlinks = b.followSymlinks === true;
  // Links that point back up the tree would loop for a very long time, so following them always has a depth limit.
  if (followSymlinks && maxDepth === undefined) maxDepth = 20;

  const options: FdSearchOptions = {
    searchRoot: root,
    pattern,
    searchMode,
    caseMode,
    fullPath: b.fullPath === true,
    types: types.length ? types : undefined,
    extensions: words(b.extensions, 50, 20),
    hidden: b.hidden === true,
    noIgnore: b.noIgnore === true,
    excludePatterns: words(b.exclude, 50, 100),
    minDepth,
    maxDepth,
    followSymlinks,
    minSizeBytes,
    maxSizeBytes,
    changedWithinMs,
    maxResults: parseMaxResults(String(b.maxResults ?? ""), DEFAULT_MAX_RESULTS, MAX_RESULTS_CAP),
  };
  return { root, options };
}

// ---------------------------------------------------------------------------------------------------------------
// Recent results (kept here because a request can only carry 1 MB)
// ---------------------------------------------------------------------------------------------------------------

export function storeResults(ctx: FmContext, root: string, items: FindItem[]): string {
  const { results } = findState(ctx);
  const id = randomBytes(8).toString("hex");
  results.set(id, { id, root, items, at: Date.now() });
  while (results.size > MAX_CACHED_RESULTS) {
    const oldest = results.keys().next().value;
    if (oldest === undefined) break;
    results.delete(oldest);
  }
  return id;
}

export function getResults(ctx: FmContext, id: unknown): StoredResults {
  const { results } = findState(ctx);
  const found = typeof id === "string" ? results.get(id) : undefined;
  if (!found) throw new FmError("RESULT_GONE", "Those search results are too old to use. Search again.");
  // Using a result keeps it among the most recent.
  results.delete(found.id);
  results.set(found.id, found);
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// Which items?
// ---------------------------------------------------------------------------------------------------------------

export interface Targets {
  paths: string[];
  items: FindItem[];
  /** The search folder, when the items came from a search. */
  root: string | null;
}

function typeOf(st: import("fs").Stats): FdFileType {
  if (st.isSymbolicLink()) return "symlink";
  if (st.isDirectory()) return "directory";
  if (st.isSocket()) return "socket";
  if (st.isFIFO()) return "pipe";
  if (st.isFile() && (st.mode & 0o111) !== 0) return "executable";
  return "file";
}

const perms = (mode: number) => [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001].map((bit, i) => (mode & bit ? "rwx"[i % 3] : "-")).join("");

/** Describes one path like a search result does (for exports and bulk actions on a hand-picked list). */
export async function statItem(ctx: FmContext, path: string, root: string | null): Promise<FindItem | null> {
  const p = pathApi(ctx);
  try {
    const st = await fsp.lstat(path);
    const name = p.basename(path);
    const rel = root ? p.relative(root, path) : name;
    const extension = p.extname(name).replace(/^\./, "").toLowerCase();
    let empty = false;
    if (st.isFile()) empty = st.size === 0;
    else if (st.isDirectory()) empty = (await fsp.readdir(path).catch(() => ["x"])).length === 0;
    return {
      path,
      relativePath: rel.split(p.sep).join("/"),
      name,
      extension,
      type: typeOf(st),
      sizeBytes: st.size,
      mtimeMs: st.mtimeMs,
      mode: st.mode,
      permStr: perms(st.mode),
      isSymlink: st.isSymbolicLink(),
      isEmpty: empty,
      isExecutable: !st.isDirectory() && (st.mode & 0o111) !== 0,
      ownerUid: st.uid,
      ownerGid: st.gid,
    };
  } catch {
    return null;
  }
}

/**
 * The items a bulk action works on: `paths` (at most MAX_PATHS), or the recent search `resultId` with the page's
 * `filter` and `sort` applied the same way the page shows them. `expectedCount` lets the page say how many it
 * is showing, so nothing is done to a different list than the one on screen.
 */
export async function resolveTargets(ctx: FmContext, b: Record<string, any>, options: { needItems?: boolean } = {}): Promise<Targets> {
  let result: Targets;
  if (Array.isArray(b.paths)) {
    if (b.paths.length === 0) throw new FmError("NOTHING_TO_DO", "Nothing is selected.");
    if (b.paths.length > MAX_PATHS) throw new FmError("TOO_MANY", `That's too many items to pick one by one (the limit is ${MAX_PATHS}). Use the whole result list instead.`);
    const paths = [...new Set(b.paths.map((x: unknown) => absolutePath(ctx, x)))] as string[];
    const root = typeof b.resultId === "string" ? (findState(ctx).results.get(b.resultId)?.root ?? null) : null;
    const items: FindItem[] = [];
    if (options.needItems) {
      for (let i = 0; i < paths.length; i += 64) {
        for (const it of await Promise.all(paths.slice(i, i + 64).map((x) => statItem(ctx, x, root)))) if (it) items.push(it);
      }
    }
    result = { paths, items, root };
  } else if (typeof b.resultId === "string") {
    const stored = getResults(ctx, b.resultId);
    const filter = typeof b.filter === "string" ? b.filter.slice(0, 200) : "";
    const sort = typeof b.sort === "string" ? b.sort : "Default order";
    const items = sortResults(filterResults(stored.items, filter), sort);
    result = { paths: items.map((i) => i.path), items, root: stored.root };
  } else {
    throw new FmError("BAD_REQUEST", "Nothing is selected.");
  }
  if (result.paths.length === 0) throw new FmError("NOTHING_TO_DO", "There are no matching items to work on.");
  if (b.expectedCount !== undefined && Number(b.expectedCount) !== result.paths.length) {
    throw new FmError("STALE_LIST", "The list changed since you looked at it, so nothing was done. Search again and retry.");
  }
  return result;
}

/** Leaves out items that lie inside another item of the list (a folder already includes what's in it). */
export function dropNested(paths: string[], platform: Platform): string[] {
  const p = platform === "win32" ? nodePath.win32 : nodePath.posix;
  const key = (x: string) => (platform === "linux" ? x : x.toLowerCase());
  const all = new Set(paths.map(key));
  return paths.filter((path) => {
    let dir = p.dirname(path);
    while (true) {
      if (all.has(key(dir))) return false;
      const up = p.dirname(dir);
      if (up === dir) return true;
      dir = up;
    }
  });
}

/** The deepest folder that contains every path. */
export function commonFolder(paths: string[], platform: Platform): string {
  const p = platform === "win32" ? nodePath.win32 : nodePath.posix;
  const parts = paths.map((x) => p.dirname(x).split(p.sep));
  let common = parts[0] ?? [];
  for (const other of parts.slice(1)) {
    let n = 0;
    while (n < common.length && n < other.length && (platform === "linux" ? common[n] === other[n] : common[n]!.toLowerCase() === other[n]!.toLowerCase())) n++;
    common = common.slice(0, n);
  }
  const joined = common.join(p.sep);
  if (!joined) return p.parse(paths[0] ?? "/").root || p.sep;
  // "C:" alone isn't a folder; "" alone (POSIX root) is "/".
  return /^[A-Za-z]:$/.test(joined) ? `${joined}${p.sep}` : joined;
}
