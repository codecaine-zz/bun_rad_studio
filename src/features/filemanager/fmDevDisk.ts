/**
 * Disk and files report for the Dev tab: where the space goes (by top-level entry and by file type), heavy
 * build folders that can be rebuilt, the largest files, empty files and folders, the newest and oldest files, and
 * duplicate files. Read only. Symbolic links are never followed (counted as skipped), and every scan stops at a
 * file, folder and time limit or when cancelled.
 */
import { createHash } from "crypto";
import { constants, promises as fsp } from "fs";
import * as nodePath from "path";
import { tick } from "./fmCore";
import { setProgress, type DevJob } from "./fmDevJobs";
import { HARD_MAX_SECONDS, VENDORED_DIRS, resolveLimits, type WalkLimits } from "./fmDevWalk";

export const HEAVY_FOLDERS = ["node_modules", "target", ".venv", "dist", "build", ".next", "__pycache__", "Pods", ".gradle", "DerivedData"];
const TOP = 25;
const EMPTY_LIST = 100;

interface Entry {
  path: string;
  bytes: number;
  mtimeMs: number;
}

/** Keeps only the `n` best of a growing list (re-sorted now and then, so adding stays cheap). */
function topList<T>(n: number, better: (a: T, b: T) => number) {
  const items: T[] = [];
  return {
    add(item: T) {
      items.push(item);
      if (items.length > n * 8) {
        items.sort(better);
        items.length = n;
      }
    },
    result: () => items.sort(better).slice(0, n),
  };
}

interface VisitFile {
  abs: string;
  rel: string;
  name: string;
  size: number;
  mtimeMs: number;
  top: string;
}

interface Tree {
  files: number;
  dirs: number;
  symlinks: number;
  stoppedBy: "files" | "folders" | "time" | null;
}

/** Calls `visitFile` for every regular file below `root` (stat'ed) and `visitDir` for every folder with its entry count. */
async function walkAll(root: string, o: { skipDirs?: string[]; limits?: Partial<WalkLimits>; heavies?: Map<string, HeavyAcc> }, signal: { cancelled: boolean }, visitFile: (f: VisitFile, heavy: HeavyAcc | null) => void, visitDir: (path: string, entries: number) => void, onTick: (t: Tree) => void): Promise<Tree> {
  const limits = resolveLimits(o.limits);
  const started = Date.now();
  const tree: Tree = { files: 0, dirs: 0, symlinks: 0, stoppedBy: null };
  const stack: Array<{ dir: string; rel: string; top: string; heavy: HeavyAcc | null }> = [{ dir: root, rel: "", top: "", heavy: null }];
  let lastYield = Date.now();
  while (stack.length && !signal.cancelled) {
    if (Date.now() - started > limits.maxSeconds * 1000) return { ...tree, stoppedBy: "time" };
    if (tree.dirs >= limits.maxDirs) return { ...tree, stoppedBy: "folders" };
    const frame = stack.pop()!;
    tree.dirs++;
    let entries;
    try {
      entries = await fsp.readdir(frame.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    visitDir(frame.dir, entries.length);
    entries.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    const files = entries.filter((e) => e.isFile());
    for (const e of entries) {
      if (e.isSymbolicLink()) tree.symlinks++;
      else if (e.isDirectory() && !o.skipDirs?.includes(e.name)) {
        const rel = frame.rel ? `${frame.rel}/${e.name}` : e.name;
        let heavy = frame.heavy;
        if (!heavy && HEAVY_FOLDERS.includes(e.name)) heavy = { path: nodePath.join(frame.dir, e.name), name: e.name, bytes: 0, files: 0 };
        stack.push({ dir: nodePath.join(frame.dir, e.name), rel, top: frame.top || e.name, heavy });
        if (heavy && heavy !== frame.heavy) o.heavies?.set(heavy.path, heavy);
      }
    }
    for (let i = 0; i < files.length; i += 16) {
      if (signal.cancelled) break;
      const chunk = files.slice(i, i + 16);
      const stats = await Promise.all(chunk.map((e) => fsp.lstat(nodePath.join(frame.dir, e.name)).catch(() => null)));
      for (let k = 0; k < chunk.length; k++) {
        const st = stats[k];
        if (!st || !st.isFile()) continue;
        if (tree.files >= limits.maxFiles) return { ...tree, stoppedBy: "files" };
        tree.files++;
        const e = chunk[k]!;
        if (frame.heavy) {
          frame.heavy.bytes += st.size;
          frame.heavy.files++;
        }
        visitFile({ abs: nodePath.join(frame.dir, e.name), rel: frame.rel ? `${frame.rel}/${e.name}` : e.name, name: e.name, size: st.size, mtimeMs: st.mtimeMs, top: frame.top || e.name }, frame.heavy);
      }
    }
    onTick(tree);
    if (Date.now() - lastYield > 12) {
      await tick();
      lastYield = Date.now();
    }
  }
  return tree;
}

interface HeavyAcc {
  path: string;
  name: string;
  bytes: number;
  files: number;
}

export interface DiskReport {
  root: string;
  files: number;
  folders: number;
  symlinks: number;
  totalBytes: number;
  stoppedBy: string | null;
  elapsedMs: number;
  top: Array<{ name: string; isDir: boolean; bytes: number; files: number }>;
  exts: Array<{ ext: string; files: number; bytes: number }>;
  heavy: Array<{ path: string; name: string; bytes: number; files: number }>;
  largest: Entry[];
  emptyFiles: { count: number; paths: string[] };
  emptyFolders: { count: number; paths: string[] };
  newest: Entry[];
  oldest: Entry[];
}

export async function runDisk(job: DevJob, limits?: Partial<WalkLimits>): Promise<DiskReport> {
  const started = Date.now();
  const root = job.root;
  const top = new Map<string, { isDir: boolean; bytes: number; files: number }>();
  const exts = new Map<string, { files: number; bytes: number }>();
  const largest = topList<Entry>(TOP, (a, b) => b.bytes - a.bytes);
  const newest = topList<Entry>(10, (a, b) => b.mtimeMs - a.mtimeMs);
  const oldest = topList<Entry>(10, (a, b) => a.mtimeMs - b.mtimeMs);
  const emptyFiles = { count: 0, paths: [] as string[] };
  const emptyFolders = { count: 0, paths: [] as string[] };
  let totalBytes = 0;
  const heavies = new Map<string, HeavyAcc>();
  const tree = await walkAll(
    root,
    { limits, heavies },
    job,
    (f) => {
      totalBytes += f.size;
      const t = top.get(f.top) ?? { isDir: f.top !== f.rel, bytes: 0, files: 0 };
      t.bytes += f.size;
      t.files++;
      top.set(f.top, t);
      const dot = f.name.lastIndexOf(".");
      const ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : "(none)";
      const x = exts.get(ext) ?? { files: 0, bytes: 0 };
      x.files++;
      x.bytes += f.size;
      exts.set(ext, x);
      const entry = { path: f.rel, bytes: f.size, mtimeMs: f.mtimeMs };
      largest.add(entry);
      newest.add(entry);
      oldest.add(entry);
      if (f.size === 0) {
        emptyFiles.count++;
        if (emptyFiles.paths.length < EMPTY_LIST) emptyFiles.paths.push(f.rel);
      }
    },
    (dir, n) => {
      if (n === 0 && dir !== root) {
        emptyFolders.count++;
        if (emptyFolders.paths.length < EMPTY_LIST) emptyFolders.paths.push(nodePath.relative(root, dir).replace(/\\/g, "/"));
      }
    },
    (t) => setProgress(job, { files: t.files, folders: t.dirs, bytes: totalBytes }),
  );
  const heavy = [...heavies.values()].filter((h) => h.files > 0 || h.bytes > 0).sort((a, b) => b.bytes - a.bytes).map((h) => ({ ...h, path: nodePath.relative(root, h.path).replace(/\\/g, "/") }));
  // Top-level entries that are folders show even when they hold nothing countable; plain files at the top are listed too.
  const topRows = [...top].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.bytes - a.bytes).slice(0, 60);
  const extRows = [...exts].map(([ext, v]) => ({ ext, ...v })).sort((a, b) => b.bytes - a.bytes).slice(0, 60);
  return { root, files: tree.files, folders: tree.dirs, symlinks: tree.symlinks, totalBytes, stoppedBy: tree.stoppedBy, elapsedMs: Date.now() - started, top: topRows, exts: extRows, heavy, largest: largest.result(), emptyFiles, emptyFolders, newest: newest.result(), oldest: oldest.result() };
}

// ---------------------------------------------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------------------------------------------

export const DUPE_MAX_FILE_BYTES = 512 * 1024 * 1024;
export const DUPE_MAX_HASH_BYTES = 8 * 1024 ** 3;
const QUICK = 64 * 1024;

export interface DupeGroup {
  size: number;
  files: string[];
  /** Space that deleting all but one copy would free. */
  wasted: number;
}

export interface DupeReport {
  root: string;
  filesScanned: number;
  groups: DupeGroup[];
  groupCount: number;
  totalWasted: number;
  hashedBytes: number;
  stoppedBy: string | null;
  elapsedMs: number;
}

async function openNoFollow(abs: string) {
  return fsp.open(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
}

/** A fingerprint of the first and last 64 KB and the size: files that differ here can't be copies. */
async function quickHash(abs: string, size: number): Promise<string | null> {
  let h;
  try {
    h = await openNoFollow(abs);
    const hash = createHash("sha1").update(String(size));
    const head = Buffer.alloc(Math.min(QUICK, size));
    const r1 = await h.read(head, 0, head.length, 0);
    hash.update(head.subarray(0, r1.bytesRead));
    if (size > QUICK * 2) {
      const tail = Buffer.alloc(QUICK);
      const r2 = await h.read(tail, 0, QUICK, size - QUICK);
      hash.update(tail.subarray(0, r2.bytesRead));
    }
    return hash.digest("hex");
  } catch {
    return null;
  } finally {
    await h?.close().catch(() => {});
  }
}

async function fullHash(abs: string, signal: { cancelled: boolean }): Promise<string | null> {
  let h;
  try {
    h = await openNoFollow(abs);
    const hash = createHash("sha256");
    const buf = Buffer.alloc(1024 * 1024);
    let pos = 0;
    while (!signal.cancelled) {
      const { bytesRead } = await h.read(buf, 0, buf.length, pos);
      if (bytesRead === 0) break;
      hash.update(buf.subarray(0, bytesRead));
      pos += bytesRead;
    }
    return signal.cancelled ? null : hash.digest("hex");
  } catch {
    return null;
  } finally {
    await h?.close().catch(() => {});
  }
}

export async function runDupes(job: DevJob, o: { minBytes: number; vendored: boolean; limits?: Partial<WalkLimits> }): Promise<DupeReport> {
  const started = Date.now();
  const bySize = new Map<number, string[]>();
  const deadline = started + HARD_MAX_SECONDS * 1000;
  const tree = await walkAll(
    job.root,
    { skipDirs: o.vendored ? [".git"] : VENDORED_DIRS, limits: o.limits },
    job,
    (f) => {
      if (f.size < o.minBytes || f.size > DUPE_MAX_FILE_BYTES) return;
      const list = bySize.get(f.size);
      if (list) list.push(f.rel);
      else bySize.set(f.size, [f.rel]);
    },
    () => {},
    (t) => setProgress(job, { phase: "listing", files: t.files, folders: t.dirs }),
  );
  let stoppedBy: string | null = tree.stoppedBy;
  const candidates = [...bySize].filter(([, list]) => list.length > 1);
  let hashedBytes = 0;
  const groups: DupeGroup[] = [];
  let done = 0;
  outer: for (const [size, list] of candidates.sort((a, b) => b[0] * (b[1].length - 1) - a[0] * (a[1].length - 1))) {
    if (job.cancelled) break;
    if (Date.now() > deadline) {
      stoppedBy = "time";
      break;
    }
    const byQuick = new Map<string, string[]>();
    for (const rel of list) {
      const q = await quickHash(nodePath.join(job.root, rel), size);
      if (q) byQuick.set(q, [...(byQuick.get(q) ?? []), rel]);
    }
    for (const same of byQuick.values()) {
      if (same.length < 2) continue;
      const byFull = new Map<string, string[]>();
      for (const rel of same) {
        if (hashedBytes + size > DUPE_MAX_HASH_BYTES) {
          stoppedBy = "bytes";
          break outer;
        }
        const f = await fullHash(nodePath.join(job.root, rel), job);
        hashedBytes += size;
        if (f) byFull.set(f, [...(byFull.get(f) ?? []), rel]);
        if (Date.now() > deadline) {
          stoppedBy = "time";
          break outer;
        }
      }
      for (const files of byFull.values()) if (files.length > 1) groups.push({ size, files: files.sort(), wasted: size * (files.length - 1) });
    }
    setProgress(job, { phase: "comparing", checked: ++done, of: candidates.length, hashedBytes });
    await tick();
  }
  groups.sort((a, b) => b.wasted - a.wasted || a.files[0]!.localeCompare(b.files[0]!));
  return { root: job.root, filesScanned: tree.files, groups: groups.slice(0, 200), groupCount: groups.length, totalWasted: groups.reduce((n, g) => n + g.wasted, 0), hashedBytes, stoppedBy, elapsedMs: Date.now() - started };
}

