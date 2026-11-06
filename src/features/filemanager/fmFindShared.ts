/**
 * Types and limits shared by the Find tool's server code and its worker. Imports nothing heavy, so the worker
 * (which loads this file) stays small.
 */
import type { FdFileType, FdItem, FdSearchOptions } from "../../../applications/fd_engine";
import type { RenameRules } from "../../../applications/fd_ops";

/** Default maximum number of matches returned by a Find search when no limit is specified. */
export const DEFAULT_MAX_RESULTS = 1500;
/** Hard upper cap on the number of matches a single Find search may return. */
export const MAX_RESULTS_CAP = 20_000;
/** The most paths one request may name itself (a whole search result may be bigger: see MAX_RESULTS_CAP). */
export const MAX_PATHS = 5000;
/** Maximum number of recent search result sets retained in memory per File Manager context. */
export const MAX_CACHED_RESULTS = 5;
/** Maximum wall-clock time in milliseconds allowed for a Find worker job before it is terminated. */
export const FIND_TIMEOUT_MS = 60_000;
/** Maximum number of concurrent Find worker threads allowed per File Manager context. */
export const MAX_WORKERS = 3;
/** Maximum number of simultaneous live folder watchers allowed per File Manager context. */
export const MAX_WATCHERS = 2;
/** A live watcher nobody has asked about for this long stops by itself. */
export const WATCH_IDLE_MS = 10 * 60_000;
/** Maximum total execution time in milliseconds for a `find/exec` command batch. */
export const EXEC_TIMEOUT_MS = 60_000;
/** Maximum combined stdout/stderr byte length retained across `find/exec` runs. */
export const EXEC_OUTPUT_CAP = 64 * 1024;
/** Maximum number of individual process invocations allowed in `"each"` mode for `find/exec`. */
export const EXEC_MAX_RUNS = 200;
/** Maximum uncompressed input byte total (512 MB) allowed when building a `.tar` or `.tar.gz` archive. */
export const TAR_MAX_BYTES = 512 * 1024 * 1024;
/** Maximum total staged bytes (2 GB) allowed when preparing a `.zip` archive from Find results. */
export const ZIP_STAGE_MAX_BYTES = 2 * 1024 ** 3;
/** Maximum size in bytes (256 MB) of an individual file hashed during duplicate detection. */
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

/** Converts an `FdItem` from the underlying `fd_engine` into a serializable `FindItem` for the UI. */
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

/** Result payload returned by a `"search"` worker job, including matched items and scan statistics. */
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

/** Discriminated union of background tasks executable by the Find worker (`fmFindWorker.ts`). */
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

/** Summary returned by a `"tar"` worker job after writing a `.tar` or `.tar.gz` archive. */
export interface TarOutcome {
  dest: string;
  files: number;
  folders: number;
  bytes: number;
  skipped: number;
}
