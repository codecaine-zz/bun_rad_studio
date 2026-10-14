/**
 * Types and limits shared by the Find tool's server code and its worker. Imports nothing heavy, so the worker
 * (which loads this file) stays small.
 */
import type { FdFileType, FdItem, FdSearchOptions } from "../../../applications/fd_engine";
import type { RenameRules } from "../../../applications/fd_ops";

export const DEFAULT_MAX_RESULTS = 1500;
export const MAX_RESULTS_CAP = 20_000;
/** The most paths one request may name itself (a whole search result may be bigger: see MAX_RESULTS_CAP). */
export const MAX_PATHS = 5000;
export const MAX_CACHED_RESULTS = 5;
export const FIND_TIMEOUT_MS = 60_000;
export const MAX_WORKERS = 3;
export const MAX_WATCHERS = 2;
/** A live watcher nobody has asked about for this long stops by itself. */
export const WATCH_IDLE_MS = 10 * 60_000;
export const EXEC_TIMEOUT_MS = 60_000;
export const EXEC_OUTPUT_CAP = 64 * 1024;
export const EXEC_MAX_RUNS = 200;
export const TAR_MAX_BYTES = 512 * 1024 * 1024;
export const ZIP_STAGE_MAX_BYTES = 2 * 1024 ** 3;
export const DUPE_MAX_FILE_BYTES = 256 * 1024 * 1024;

/** What the page gets for each match: plain data (no Date objects) and only what it shows or acts on. */
export interface FindItem {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  type: FdFileType;
  sizeBytes: number;
  mtimeMs: number;
  mode: number;
  permStr: string;
  isSymlink: boolean;
  isEmpty: boolean;
  isExecutable: boolean;
  targetSymlink?: string;
  ownerUid: number;
  ownerGid: number;
}

export function toFindItem(it: FdItem): FindItem {
  return {
    path: it.path,
    relativePath: it.relativePath,
    name: it.name,
    extension: it.extension,
    type: it.type,
    sizeBytes: it.sizeBytes,
    mtimeMs: it.mtimeMs,
    mode: it.mode,
    permStr: it.permStr,
    isSymlink: it.isSymlink,
    isEmpty: it.isEmpty,
    isExecutable: it.isExecutable,
    ...(it.targetSymlink ? { targetSymlink: it.targetSymlink } : {}),
    ownerUid: it.ownerUid,
    ownerGid: it.ownerGid,
  };
}

export interface SearchOutcome {
  items: FindItem[];
  totalScanned: number;
  matchedCount: number;
  durationMs: number;
  totalSizeBytes: number;
  truncated: boolean;
  /** The pattern wasn't a valid regular expression, so it was searched for as plain text. */
  patternFallback: boolean;
}

export type WorkerJob =
  | { kind: "search"; options: FdSearchOptions }
  | { kind: "grep"; paths: string[]; query: string; regex: boolean; matchCase: boolean; maxMatches: number }
  | { kind: "dupes"; paths: string[]; minBytes: number }
  | { kind: "largest"; paths: string[]; count: number }
  | { kind: "extstats"; paths: string[] }
  | { kind: "hash"; path: string }
  | { kind: "renameplan"; paths: string[]; rules: RenameRules; platform: string }
  | { kind: "tar"; paths: string[]; base: string; dest: string; maxBytes: number }
  /** Busy loop that only a timeout can end: lets tests prove that a stuck job is stopped. */
  | { kind: "spin"; ms: number };

export interface TarOutcome {
  dest: string;
  files: number;
  folders: number;
  bytes: number;
  skipped: number;
}
