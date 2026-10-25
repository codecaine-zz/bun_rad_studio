/**
 * Compare two folders, then copy the differences you choose in one direction.
 *
 * Every file and folder is put in one of five groups: only on the left, only on the right, different contents,
 * identical, or "cannot compare" (an unreadable folder or file, a pipe or socket, a comparison you cancelled).
 *
 * How things are decided, each covered by tests (tests/file_manager_compare.test.ts):
 *  - Quick check (the default): files of different sizes are different. Files of the same size and the same modified
 *    time are listed as identical but marked "not verified": the contents were NOT read, so this is a strong hint, not a
 *    proof. Files of the same size with different times are listed as different with the reason "date differs", because
 *    the contents were not read either.
 *  - Verified check: every pair of same-sized files is read and compared byte by byte (it stops at the first
 *    difference). Only then is a file called identical without a "not verified" mark. It takes as long as reading the files.
 *  - Symbolic links are never followed. A link is compared by where it points (two links are identical when they point
 *    to the same place) and is copied as a link. Because nothing is followed, a link loop cannot make a scan endless, and
 *    the scan is also bounded by a depth and an entry limit. The two folders you choose are resolved once, so they may
 *    themselves be links.
 *  - A file on one side and a folder on the other is "different" and is never copied over (nothing replaces a folder).
 *  - A folder that cannot be read is "cannot compare", and so is everything on the other side below it: it is never
 *    reported as "only on the other side" just because it could not be looked at.
 *  - Ignore rules use .gitignore syntax, relative to each folder (`node_modules/`, `*.log`, `/build`). Ignored items are
 *    left out of everything, including the copy.
 *  - Copying goes through the shared preview and queue (fmPlan.ts): it creates missing folders, replaces a different
 *    file only when asked (the old one goes to the Recycle Bin) and NEVER deletes anything on either side.
 *
 * The scan runs as a background job (polled with `dev/job/poll`, cancelled with `dev/job/cancel`) and reads files in
 * pieces with the event loop free in between, so the app stays responsive.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, lstatOrNull, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { findDevJob, setProgress, startDevJob, type DevJob } from "./fmDevJobs";
import type { Cancellable } from "./fmDevWalk";
import { ignoreSetFromText, isIgnored, type IgnoreSet } from "./fmDevIgnore";
import { createPlan, type ExplicitItem } from "./fmPlan";
import { FmError, describeFsError } from "./fmPaths";

export const COMPARE_MAX_DEPTH = 64;
export const COMPARE_MAX_ENTRIES = 200_000;
export const COMPARE_MAX_IGNORE_LINES = 200;
const CHUNK = 1024 * 1024;
/** FAT and some network disks store times in 2-second steps. */
const TIME_TOLERANCE_MS = 2000;

export type CompareCategory = "onlyLeft" | "onlyRight" | "different" | "identical" | "cannot";
export type CompareMode = "quick" | "verified";
export type EntryKind = "file" | "dir" | "link" | "other";

export interface SideInfo {
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  /** Where a link points. */
  target?: string;
}

export interface CompareEntry {
  /** Path below the folder, with "/" separators. */
  rel: string;
  category: CompareCategory;
  left: SideInfo | null;
  right: SideInfo | null;
  /** What the decision rests on: "size", "date", "content", "size+date", "type", "link", "unreadable" or "missing". */
  basis: string;
  /** True only when the contents were read and compared. */
  verified: boolean;
  /** One plain sentence about this entry. */
  note: string;
}

export interface CompareSummary {
  left: string;
  right: string;
  mode: CompareMode;
  counts: Record<CompareCategory, number>;
  /** Identical files whose contents were not read (quick check). */
  unverifiedIdentical: number;
  ignore: string[];
  cancelled: boolean;
  scannedLeft: number;
  scannedRight: number;
}

interface ScanEntry extends SideInfo {
  error?: string;
}

interface Scan {
  entries: Map<string, ScanEntry>;
  /** Folders that could not be read, with the reason. */
  unreadable: Map<string, string>;
}

const rel = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);

async function scanSide(root: string, ignore: IgnoreSet[], job: DevJob, label: "left" | "right"): Promise<Scan> {
  const entries = new Map<string, ScanEntry>();
  const unreadable = new Map<string, string>();
  const queue: Array<{ abs: string; relPath: string; depth: number }> = [{ abs: root, relPath: "", depth: 0 }];
  while (queue.length) {
    if (job.cancelled) break;
    const { abs, relPath, depth } = queue.pop()!;
    let names: string[];
    try {
      names = await fsp.readdir(abs);
    } catch (err) {
      unreadable.set(relPath, describeFsError(err, "read that folder").message);
      continue;
    }
    for (const name of names) {
      if (job.cancelled) break;
      const full = nodePath.join(abs, name);
      const r = rel(relPath, name);
      let st;
      try {
        st = await fsp.lstat(full);
      } catch (err) {
        entries.set(r, { kind: "other", size: 0, mtimeMs: 0, error: describeFsError(err, "read that").message });
        continue;
      }
      const kind: EntryKind = st.isSymbolicLink() ? "link" : st.isDirectory() ? "dir" : st.isFile() ? "file" : "other";
      if (isIgnored(ignore, full, kind === "dir")) continue;
      if (entries.size >= COMPARE_MAX_ENTRIES) throw new FmError("TOO_BIG", `The ${label} folder has more than ${COMPARE_MAX_ENTRIES.toLocaleString("en-US")} items. Compare a smaller folder, or add ignore rules.`);
      const entry: ScanEntry = { kind, size: kind === "file" ? st.size : 0, mtimeMs: Math.floor(st.mtimeMs) };
      if (kind === "link") {
        try { entry.target = await fsp.readlink(full); } catch (err) { entry.error = describeFsError(err, "read that link").message; }
      }
      entries.set(r, entry);
      if (kind === "dir") {
        if (depth + 1 > COMPARE_MAX_DEPTH) unreadable.set(r, `Folders are nested more than ${COMPARE_MAX_DEPTH} levels deep here, so this one was not looked into.`);
        else queue.push({ abs: full, relPath: r, depth: depth + 1 });
      }
    }
    setProgress(job, { phase: "scanning", [`${label}Items`]: entries.size });
    await Promise.resolve();
  }
  return { entries, unreadable };
}

const side = (e: ScanEntry | undefined): SideInfo | null => (e ? { kind: e.kind, size: e.size, mtimeMs: e.mtimeMs, ...(e.target !== undefined ? { target: e.target } : {}) } : null);

/** Byte-for-byte comparison of two files, reading in pieces. Throws if either cannot be read. */
export async function sameContent(a: string, b: string, job: Cancellable, onBytes: (n: number) => void): Promise<boolean | "cancelled"> {
  const fa = await fsp.open(a, "r");
  try {
    const fb = await fsp.open(b, "r");
    try {
      const bufA = Buffer.allocUnsafe(CHUNK);
      const bufB = Buffer.allocUnsafe(CHUNK);
      while (true) {
        if (job.cancelled) return "cancelled";
        const [ra, rb] = await Promise.all([fa.read(bufA, 0, CHUNK, null), fb.read(bufB, 0, CHUNK, null)]);
        if (ra.bytesRead !== rb.bytesRead) return false;
        if (ra.bytesRead === 0) return true;
        if (!bufA.subarray(0, ra.bytesRead).equals(bufB.subarray(0, rb.bytesRead))) return false;
        onBytes(ra.bytesRead);
      }
    } finally {
      await fb.close();
    }
  } finally {
    await fa.close();
  }
}
interface CompareData {
  left: string;
  right: string;
  entries: CompareEntry[];
}

function ancestorUnreadable(unreadable: Map<string, string>, relPath: string): string | null {
  for (const [dir, reason] of unreadable) {
    if (dir === "" || relPath === dir || relPath.startsWith(`${dir}/`)) return reason;
  }
  return null;
}

async function runCompare(job: DevJob, left: string, right: string, ignoreLines: string[], mode: CompareMode): Promise<CompareSummary> {
  const sets = (root: string) => (ignoreLines.length ? [ignoreSetFromText(root.replace(/\\/g, "/"), ignoreLines.join("\n"))] : []);
  const [l, r] = await Promise.all([scanSide(left, sets(left), job, "left"), scanSide(right, sets(right), job, "right")]);
  if (job.cancelled) {
    job.data = { left, right, entries: [] } satisfies CompareData;
    return { left, right, mode, counts: { onlyLeft: 0, onlyRight: 0, different: 0, identical: 0, cannot: 0 }, unverifiedIdentical: 0, ignore: ignoreLines, cancelled: true, scannedLeft: l.entries.size, scannedRight: r.entries.size };
  }
  const all = [...new Set([...l.entries.keys(), ...r.entries.keys()])].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const entries: CompareEntry[] = [];
  const toVerify: Array<{ entry: CompareEntry; a: string; b: string }> = [];
  const hasChild = (side: Map<string, ScanEntry>) => {
    const parents = new Set<string>();
    for (const key of side.keys()) { const i = key.lastIndexOf("/"); if (i > 0) parents.add(key.slice(0, i)); }
    return parents;
  };
  const leftParents = hasChild(l.entries);
  const rightParents = hasChild(r.entries);
  const make = (relPath: string, category: CompareCategory, a: ScanEntry | undefined, b: ScanEntry | undefined, basis: string, verified: boolean, note: string): CompareEntry => {
    const entry: CompareEntry = { rel: relPath, category, left: side(a), right: side(b), basis, verified, note };
    entries.push(entry);
    return entry;
  };
  for (const relPath of all) {
    const a = l.entries.get(relPath);
    const b = r.entries.get(relPath);
    if (a?.error || b?.error) { make(relPath, "cannot", a, b, "unreadable", false, a?.error ?? b?.error ?? "It could not be read."); continue; }
    // A folder that could not be looked into must not be reported as an empty folder.
    const own = (a?.kind === "dir" ? l.unreadable.get(relPath) : undefined) ?? (b?.kind === "dir" ? r.unreadable.get(relPath) : undefined);
    if (own && !(a && b)) { make(relPath, "cannot", a, b, "unreadable", false, `This folder can't be looked into (${own}), so its contents were not compared.`); continue; }
    if (a && !b) {
      const blocked = ancestorUnreadable(r.unreadable, relPath);
      if (blocked) { make(relPath, "cannot", a, b, "unreadable", false, `The matching folder on the right can't be read (${blocked}), so this can't be compared.`); continue; }
      if (a.kind === "dir" && leftParents.has(relPath)) continue; // its contents are listed one by one
      make(relPath, "onlyLeft", a, b, "missing", false, a.kind === "dir" ? "An empty folder that is only on the left." : "Only on the left.");
      continue;
    }
    if (b && !a) {
      const blocked = ancestorUnreadable(l.unreadable, relPath);
      if (blocked) { make(relPath, "cannot", a, b, "unreadable", false, `The matching folder on the left can't be read (${blocked}), so this can't be compared.`); continue; }
      if (b.kind === "dir" && rightParents.has(relPath)) continue;
      make(relPath, "onlyRight", a, b, "missing", false, b.kind === "dir" ? "An empty folder that is only on the right." : "Only on the right.");
      continue;
    }
    if (!a || !b) continue;
    if (a.kind === "other" || b.kind === "other") { make(relPath, "cannot", a, b, "unreadable", false, "A pipe, socket or device can't be compared."); continue; }
    if (a.kind !== b.kind) {
      const word = (k: EntryKind) => (k === "dir" ? "a folder" : k === "link" ? "a link" : "a file");
      make(relPath, "different", a, b, "type", true, `It is ${word(a.kind)} on the left and ${word(b.kind)} on the right.`);
      continue;
    }
    if (a.kind === "dir") {
      const why = l.unreadable.get(relPath) ?? r.unreadable.get(relPath);
      if (why) make(relPath, "cannot", a, b, "unreadable", false, `This folder can't be read (${why}), so its contents were not compared.`);
      continue;
    }
    if (a.kind === "link") {
      if (a.target === b.target) make(relPath, "identical", a, b, "link", true, "Both links point to the same place.");
      else make(relPath, "different", a, b, "link", true, `The links point to different places (${a.target} and ${b.target}).`);
      continue;
    }
    if (a.size !== b.size) { make(relPath, "different", a, b, "size", true, "The sizes are different."); continue; }
    if (mode === "verified") {
      const entry = make(relPath, "identical", a, b, "content", true, "Same size; the contents have not been checked yet.");
      toVerify.push({ entry, a: nodePath.join(left, ...relPath.split("/")), b: nodePath.join(right, ...relPath.split("/")) });
      continue;
    }
    if (Math.abs(a.mtimeMs - b.mtimeMs) <= TIME_TOLERANCE_MS) make(relPath, "identical", a, b, "size+date", false, "Same size and modified time. The contents were not read, so this is not verified.");
    else make(relPath, "different", a, b, "date", false, "Same size but a different modified time. The contents were not read: use the verified check to be sure.");
  }

  let cancelled: boolean = job.cancelled;
  let bytesDone = 0;
  const bytesTotal = toVerify.reduce((t, v) => t + (v.entry.left?.size ?? 0), 0);
  setProgress(job, { phase: "verifying", filesDone: 0, filesTotal: toVerify.length, bytesDone: 0, bytesTotal });
  for (let i = 0; i < toVerify.length; i++) {
    const { entry, a, b } = toVerify[i]!;
    if (job.cancelled) {
      cancelled = true;
      for (const rest of toVerify.slice(i)) Object.assign(rest.entry, { category: "cannot", basis: "cancelled", verified: false, note: "Not compared: the comparison was cancelled before this file." });
      break;
    }
    try {
      const result = await sameContent(a, b, job, (n) => { bytesDone += n; });
      if (result === "cancelled") { Object.assign(entry, { category: "cannot", basis: "cancelled", verified: false, note: "Not compared: the comparison was cancelled before this file." }); cancelled = true; continue; }
      if (result) entry.note = "The contents are identical (compared byte by byte).";
      else Object.assign(entry, { category: "different", note: "The contents are different (same size)." });
    } catch (err) {
      Object.assign(entry, { category: "cannot", basis: "unreadable", verified: false, note: describeFsError(err, "read that file").message });
    }
    setProgress(job, { filesDone: i + 1, bytesDone });
  }
  cancelled = cancelled || job.cancelled;
  const counts: Record<CompareCategory, number> = { onlyLeft: 0, onlyRight: 0, different: 0, identical: 0, cannot: 0 };
  for (const e of entries) counts[e.category]++;
  job.data = { left, right, entries } satisfies CompareData;
  return {
    left, right, mode, counts,
    unverifiedIdentical: entries.filter((e) => e.category === "identical" && !e.verified).length,
    ignore: ignoreLines, cancelled,
    scannedLeft: l.entries.size, scannedRight: r.entries.size,
  };
}

async function folderRoot(ctx: FmContext, input: unknown, which: string): Promise<string> {
  const path = absolutePath(ctx, input);
  const st = await lstatOrNull(path);
  if (!st) throw new FmError("NOT_FOUND", `The ${which} folder doesn't exist.`);
  // Only a folder that is itself a link is resolved; the rest of the path stays as the person typed it.
  const real = st.isSymbolicLink() ? await fsp.realpath(path).catch(() => path) : path;
  const stat = await fsp.stat(real).catch(() => null);
  if (!stat?.isDirectory()) throw new FmError("NOT_A_FOLDER", `The ${which} location isn't a folder.`);
  return real;
}

export function cleanIgnoreLines(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  const lines = Array.isArray(input) ? input : typeof input === "string" ? input.split("\n") : null;
  if (!lines) throw new FmError("BAD_REQUEST", "Ignore rules must be a list of lines.");
  const clean = lines.filter((l): l is string => typeof l === "string").map((l) => l.replace(/\r$/, "").trim()).filter((l) => l && !l.startsWith("#"));
  if (clean.length > COMPARE_MAX_IGNORE_LINES) throw new FmError("TOO_MANY", `Use at most ${COMPARE_MAX_IGNORE_LINES} ignore rules.`);
  return clean.map((l) => l.slice(0, 300));
}

export async function startCompare(ctx: FmContext, body: Record<string, any>): Promise<{ id: string }> {
  const left = await folderRoot(ctx, body.left, "left");
  const right = await folderRoot(ctx, body.right, "right");
  const p = pathApi(ctx);
  const inside = (a: string, b: string) => a === b || a.startsWith(b.endsWith(p.sep) ? b : b + p.sep);
  if (inside(left, right) || inside(right, left)) throw new FmError("OVERLAP", "One folder is inside the other (or they are the same), so comparing them would not tell you anything useful. Choose two separate folders.");
  const mode: CompareMode = body.mode === "verified" ? "verified" : "quick";
  const ignore = cleanIgnoreLines(body.ignore);
  const job = startDevJob(ctx, "compare", `${left}  ↔  ${right}`, (j) => runCompare(j, left, right, ignore, mode));
  return { id: job.id };
}

const CATEGORIES: readonly CompareCategory[] = ["onlyLeft", "onlyRight", "different", "identical", "cannot"];

function dataOf(ctx: FmContext, id: unknown): CompareData {
  const job = findDevJob(ctx, id, ["compare"]);
  if (job.state === "running") throw new FmError("STILL_RUNNING", "The comparison is still running.");
  if (!job.data) throw new FmError("NO_JOB", "That comparison has no results. Run it again.");
  return job.data as CompareData;
}

export function listEntries(ctx: FmContext, body: Record<string, any>): { total: number; entries: CompareEntry[] } {
  const data = dataOf(ctx, body.id);
  const category = CATEGORIES.includes(body.category) ? (body.category as CompareCategory) : null;
  const query = typeof body.query === "string" ? body.query.trim().toLowerCase() : "";
  const filtered = data.entries.filter((e) => (!category || e.category === category) && (!query || e.rel.toLowerCase().includes(query)));
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(body.limit) || 500)));
  return { total: filtered.length, entries: filtered.slice(offset, offset + limit) };
}

/** Builds the copy preview for the chosen entries. Nothing is changed; applying goes through `plan/apply`. */
export async function planCopy(ctx: FmContext, body: Record<string, any>) {
  const data = dataOf(ctx, body.id);
  const toRight = body.direction !== "toLeft";
  if (!Array.isArray(body.paths) || body.paths.length === 0) throw new FmError("BAD_REQUEST", "Select the differences to copy first.");
  const wanted = new Set(body.paths.filter((x: unknown): x is string => typeof x === "string"));
  const from = toRight ? data.left : data.right;
  const to = toRight ? data.right : data.left;
  const items: ExplicitItem[] = [];
  const byRel = new Map(data.entries.map((e) => [e.rel, e] as const));
  for (const relPath of wanted) {
    const e = byRel.get(relPath);
    const sourceSide = e ? (toRight ? e.left : e.right) : null;
    const destSide = e ? (toRight ? e.right : e.left) : null;
    const source = nodePath.join(from, ...relPath.split("/"));
    const destination = nodePath.join(to, ...relPath.split("/"));
    const skip = (reason: string) => items.push({ action: "copy", source, destination, skipReason: reason });
    if (!e) { skip("That item is not in the comparison."); continue; }
    if (e.category === "identical") { skip("Already identical."); continue; }
    if (e.category === "cannot") { skip(`Not copied: ${e.note}`); continue; }
    if (!sourceSide) { skip(`It is only on the ${toRight ? "right" : "left"}, so there is nothing to copy ${toRight ? "to the right" : "to the left"}. Nothing is ever deleted.`); continue; }
    if (e.category === "different" && e.basis === "type") { skip("A file and a folder share this name, so neither is copied over the other."); continue; }
    if (sourceSide.kind === "dir") {
      if (destSide) { skip("The folder already exists there."); continue; }
      items.push({ action: "create", destination });
      continue;
    }
    items.push({ action: "copy", source, destination, replace: e.category === "different" && body.replace === true, expect: { size: sourceSide.size, mtimeMs: sourceSide.mtimeMs }, ...(destSide ? { expectDest: { size: destSide.size, mtimeMs: destSide.mtimeMs } } : {}) });
  }
  const title = `Copy ${wanted.size} selected ${wanted.size === 1 ? "difference" : "differences"} to the ${toRight ? "right" : "left"} folder`;
  return await createPlan(ctx, { type: "items", title, items });
}

export const compareOperations: Record<string, FmHandler> = {
  async "compare/start"(ctx, b) {
    return await startCompare(ctx, b);
  },
  async "compare/entries"(ctx, b) {
    return listEntries(ctx, b);
  },
  async "compare/plan"(ctx, b) {
    return { plan: await planCopy(ctx, b) };
  },
};
