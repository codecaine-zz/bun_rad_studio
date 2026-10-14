/**
 * Changing permissions: looking at what an item has now, working out what a change would do without touching
 * anything (the preview), doing it, and putting it back (Undo).
 *
 * The preview and the real change go through the same scan, so they always agree. What the scan finds is also what
 * decides which risky cases need the person's confirmation: the server works that out itself and never trusts the page.
 *
 * Safety, each covered by tests: links are never followed or changed; the file type bits are never touched; system
 * folders and the Recycle Bin are refused; a recursive run stays on the disk it started on, can't loop, and is limited
 * in items and time; every item is looked at again just before it is changed and left alone if it was swapped for
 * something else meanwhile; items that belong to someone else are reported, not attempted.
 */
import { randomBytes } from "crypto";
import { absolutePath, pathApi, type FmContext } from "./fmCore";
import { FmError, describeFsError, isSameOrInside, protectedReason } from "./fmPaths";
import {
  MODE_MASK, RISK_MESSAGES, newModeFor, octalOf, parseChange, risksOfChange, symbolicOf,
  type Change, type FlagChange, type Risk, type RiskCode,
} from "./fmPermsModel";
import { flagsToChange, hasExtraRules, ownerNamesOf, readFlags, writeFlags, type FlagState, type PermStat, type PermsHooks } from "./fmPermsSys";

/** What the caller offers a long run: a way to stop it, and somewhere to report how far it got. */
export interface RunControl {
  signal: AbortSignal;
  report(phase: "checking" | "changing", done: number, changed: number): void;
}

export const NO_CONTROL: RunControl = { signal: new AbortController().signal, report() {} };

const HOME_SUBFOLDERS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Movies", "Videos", "Public", "Library", "AppData", "Templates"];

/** Why this item's permissions must not be changed, or null. Your home folder and main personal folders may be changed, but not all at once. */
export function protectedChangeReason(ctx: FmContext, path: string, recursive: boolean): string | null {
  const reason = protectedReason(path, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "modify");
  if (!reason) return null;
  const p = pathApi(ctx);
  const norm = (x: string) => (ctx.platform === "linux" ? x : x.toLowerCase());
  const t = norm(p.resolve(path));
  if (t === norm(p.resolve(ctx.home))) return recursive ? "This is your home folder. Changing everything inside it in one go is too risky. Choose the folders inside it instead." : null;
  if (!reason.includes("Recycle Bin") && HOME_SUBFOLDERS.some((n) => t === norm(p.join(ctx.home, n)))) return null;
  return reason;
}

function checkedPaths(ctx: FmContext, hooks: PermsHooks, input: unknown, recursive: boolean): string[] {
  if (!Array.isArray(input) || input.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (input.length > hooks.limits.maxPaths) throw new FmError("BAD_REQUEST", `Too many items at once (the limit is ${hooks.limits.maxPaths}).`);
  const unique = [...new Set(input.map((i) => absolutePath(ctx, i)))];
  // With "everything inside", an item that is already inside another chosen folder would be handled twice.
  return recursive ? unique.filter((p) => !unique.some((q) => q !== p && isSameOrInside(p, q, ctx.platform))) : unique;
}

/** A sentence for a failed change that a beginner can act on. */
export function permError(err: unknown, platform: string): string {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "EPERM") return platform === "darwin" ? "Only the owner (or an administrator) can change this, or it is locked. Unlock it first." : "Only the owner (or an administrator) can change the permissions of this item.";
  if (code === "EACCES") return "You don't have access to this item or the folder it is in.";
  if (code === "EROFS") return "That disk is read-only, so nothing on it can be changed.";
  if (code === "ENOENT") return "That item doesn't exist any more. It may have been moved or deleted.";
  if (code === "ENOTDIR") return "A folder on the way to this item has been replaced by a file.";
  if (code === "ELOOP") return "That item is a link that points back to itself.";
  if (code === "EBUSY") return "That item is in use by another program.";
  return describeFsError(err, "change that").message;
}

// ---------------------------------------------------------------------------------------------------------------
// Looking at items
// ---------------------------------------------------------------------------------------------------------------

export interface PermItem {
  path: string;
  name: string;
  isDir: boolean;
  isLink: boolean;
  /** Twelve permission bits, or null where the platform has none (Windows) or for a link. */
  mode: number | null;
  octal: string | null;
  symbolic: string | null;
  uid: number | null;
  gid: number | null;
  owner: string | null;
  group: string | null;
  /** Whether this person may change it, and if not, why. */
  canChange: boolean;
  reason: string | null;
  flags: FlagState | null;
  /** True when extra access rules (an ACL) are on the item; null when unknown. */
  acl: boolean | null;
}

export interface PermsSupport {
  platform: string;
  mode: boolean;
  specialBits: boolean;
  locked: boolean;
  hidden: boolean;
  readonly: boolean;
  /** True when the program runs as the administrator account, which may change anything that isn't protected. */
  admin: boolean;
}

export function supportFor(ctx: FmContext, hooks: PermsHooks): PermsSupport {
  const p = ctx.platform;
  return { platform: p, mode: p !== "win32", specialBits: p !== "win32", locked: p === "darwin", hidden: p !== "linux", readonly: p === "win32", admin: hooks.uid() === 0 };
}

function isOwner(hooks: PermsHooks, st: PermStat): boolean {
  const uid = hooks.uid();
  return uid === null || uid === 0 || st.uid === uid;
}

export async function getPerms(ctx: FmContext, hooks: PermsHooks, input: unknown): Promise<{ support: PermsSupport; items: PermItem[] }> {
  const paths = checkedPaths(ctx, hooks, input, false);
  const p = pathApi(ctx);
  const items: PermItem[] = [];
  const names = new Map<string, { owner: string; group: string } | null>();
  let lookups = 0;
  for (const path of paths) {
    let st: PermStat;
    try {
      st = await hooks.fs.lstat(path);
    } catch (err) {
      items.push({ path, name: p.basename(path) || path, isDir: false, isLink: false, mode: null, octal: null, symbolic: null, uid: null, gid: null, owner: null, group: null, canChange: false, reason: permError(err, ctx.platform), flags: null, acl: null });
      continue;
    }
    const isLink = st.isSymbolicLink();
    const win = ctx.platform === "win32";
    const mode = win || isLink ? null : st.mode & MODE_MASK;
    let reason: string | null = null;
    if (isLink) reason = "This is a link (shortcut). Its permissions aren't changed here, and neither are those of the item it points to.";
    else if (!st.isDirectory() && !st.isFile()) reason = "This isn't an ordinary file or folder.";
    else reason = protectedChangeReason(ctx, path, false) ?? (!win && !isOwner(hooks, st) ? "You aren't the owner of this item. Changing who may use it needs its owner or an administrator, and isn't done here." : null);
    let owner: string | null = null;
    let group: string | null = null;
    if (!win && lookups < 20) {
      const key = `${st.uid}:${st.gid}`;
      if (!names.has(key)) {
        lookups++;
        names.set(key, await ownerNamesOf(ctx.platform, hooks, path));
      }
      owner = names.get(key)?.owner ?? null;
      group = names.get(key)?.group ?? null;
    }
    const flags = !isLink && items.length < 200 && (ctx.platform === "darwin" || win) ? await readFlags(ctx.platform, hooks, path, st.mode) : null;
    const acl = !isLink && items.length < 20 ? await hasExtraRules(ctx.platform, hooks, path) : null;
    items.push({ path, name: p.basename(path) || path, isDir: st.isDirectory(), isLink, mode, octal: mode === null ? null : octalOf(mode), symbolic: mode === null ? null : symbolicOf(mode), uid: win ? null : st.uid, gid: win ? null : st.gid, owner, group, canChange: reason === null, reason, flags, acl });
  }
  return { support: supportFor(ctx, hooks), items };
}

// ---------------------------------------------------------------------------------------------------------------
// The scan: what a change would do to every item in it
// ---------------------------------------------------------------------------------------------------------------

export type ItemState = "change" | "same" | "blocked" | "skipped";

interface ScanItem {
  path: string;
  isDir: boolean;
  mode: number;
  newMode: number;
  ino: number;
  dev: number;
  state: ItemState;
  reason: string;
  flagsBefore: FlagState | null;
  /** The extra settings that need changing on this item. */
  flagsChange: FlagChange;
}

interface Scan {
  items: ScanItem[];
  visited: number;
  risks: RiskCode[];
  /** Folders that could not be looked inside. */
  unreadable: Array<{ path: string; reason: string }>;
}

class Stop extends Error {
  constructor(readonly why: "cancelled" | "time") {
    super(why);
  }
}

async function scan(ctx: FmContext, hooks: PermsHooks, change: Change, roots: string[], ctl: RunControl): Promise<Scan> {
  const lim = hooks.limits;
  const p = pathApi(ctx);
  const deadline = hooks.now() + lim.maxMillis;
  const recursive = change.recursive;
  const out: Scan = { items: [], visited: 0, risks: [], unreadable: [] };
  const seenDirs = new Set<string>();
  const hasFlags = Object.keys(change.flags).length > 0;
  const win = ctx.platform === "win32";
  const riskSet = new Set<RiskCode>();
  const trashRoot = p.resolve(ctx.trashRoot);

  const tick = () => {
    if (ctl.signal.aborted) throw new Stop("cancelled");
    if (hooks.now() > deadline) throw new Stop("time");
  };

  async function decide(path: string, st: PermStat, isDir: boolean): Promise<ScanItem> {
    const mode = st.mode & MODE_MASK;
    const item: ScanItem = { path, isDir, mode, newMode: mode, ino: st.ino, dev: st.dev, state: "same", reason: "", flagsBefore: null, flagsChange: {} };
    if (!win) item.newMode = newModeFor(mode, isDir, change);
    if (hasFlags) {
      item.flagsBefore = await readFlags(ctx.platform, hooks, path, st.mode);
      item.flagsChange = flagsToChange(item.flagsBefore, change.flags);
    }
    const needs = item.newMode !== mode || Object.keys(item.flagsChange).length > 0;
    if (!needs) return item;
    if (!win && !isOwner(hooks, st)) {
      item.state = "blocked";
      item.reason = "You aren't the owner of this item, so you can't change it.";
      return item;
    }
    item.state = "change";
    if (item.newMode !== mode) for (const r of risksOfChange(mode, item.newMode, isDir)) riskSet.add(r);
    return item;
  }

  async function walk(path: string, st: PermStat, rootDev: number, isRoot: boolean): Promise<void> {
    out.visited++;
    ctl.report("checking", out.visited, 0);
    if (out.visited > lim.maxItems) throw new FmError("TOO_MANY", `That is more than ${lim.maxItems.toLocaleString("en-US")} items. Choose a smaller folder, or change the inside folders one at a time.`);
    if (out.visited % 64 === 0) tick();
    const skip = (reason: string): void => {
      out.items.push({ path, isDir: false, mode: 0, newMode: 0, ino: 0, dev: 0, state: "skipped", reason, flagsBefore: null, flagsChange: {} });
    };
    if (st.isSymbolicLink()) return skip("link");
    const isDir = st.isDirectory();
    if (!isDir && !st.isFile()) return skip("not an ordinary file or folder");
    if (!isRoot && st.dev !== rootDev) return skip("on another disk");
    if (isSameOrInside(path, trashRoot, ctx.platform)) return skip("in the Recycle Bin");
    const inScope = !recursive || recursive.scope === "all" || (recursive.scope === "files" ? !isDir : isDir);
    if (inScope) out.items.push(await decide(path, st, isDir));
    if (!isDir || !recursive) return;
    if (st.ino) {
      const key = `${st.dev}:${st.ino}`;
      if (seenDirs.has(key)) return;
      seenDirs.add(key);
    }
    tick();
    let names: string[];
    try {
      names = await hooks.fs.readdir(path);
    } catch (err) {
      out.unreadable.push({ path, reason: permError(err, ctx.platform) });
      return;
    }
    for (const name of names) {
      const child = p.join(path, name);
      let cst: PermStat;
      try {
        cst = await hooks.fs.lstat(child);
      } catch {
        continue;
      }
      await walk(child, cst, rootDev, false);
    }
  }

  for (const root of roots) {
    const reason = protectedChangeReason(ctx, root, recursive !== null);
    if (reason) throw new FmError("PROTECTED", `"${p.basename(root) || root}": ${reason}`);
  }
  for (const root of roots) {
    let st: PermStat;
    try {
      st = await hooks.fs.lstat(root);
    } catch (err) {
      out.items.push({ path: root, isDir: false, mode: 0, newMode: 0, ino: 0, dev: 0, state: "blocked", reason: permError(err, ctx.platform), flagsBefore: null, flagsChange: {} });
      continue;
    }
    await walk(root, st, st.dev, true);
  }
  const changing = out.items.filter((i) => i.state === "change").length;
  out.risks = [...riskSet];
  if (changing > lim.manyItems && recursive) out.risks.push("many-items");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------------------------

export interface Example {
  path: string;
  state: ItemState;
  isDir: boolean;
  before: string | null;
  after: string | null;
  beforeText: string | null;
  afterText: string | null;
  flags: FlagChange;
  reason: string;
}

export interface Counts {
  /** Items the change was looked at for. */
  considered: number;
  willChange: number;
  alreadyCorrect: number;
  cannotChange: number;
  skipped: number;
}

export interface Plan {
  counts: Counts;
  examples: Example[];
  /** Why some items can't be changed: the first few. */
  problems: Array<{ path: string; reason: string }>;
  problemCount: number;
  /** Items left out and why ("link": 3). */
  skippedBecause: Array<{ reason: string; count: number }>;
  risks: Risk[];
  needsConfirm: boolean;
}

function riskList(codes: RiskCode[]): Risk[] {
  return codes.map((code) => ({ code, message: RISK_MESSAGES[code] }));
}

function summarize(ctx: FmContext, hooks: PermsHooks, s: Scan): Plan {
  const lim = hooks.limits;
  const counts: Counts = { considered: 0, willChange: 0, alreadyCorrect: 0, cannotChange: 0, skipped: 0 };
  const skippedBy = new Map<string, number>();
  const problems: Array<{ path: string; reason: string }> = [];
  const changes: Example[] = [];
  const others: Example[] = [];
  const win = ctx.platform === "win32";
  for (const i of s.items) {
    if (i.state === "skipped") {
      counts.skipped++;
      skippedBy.set(i.reason, (skippedBy.get(i.reason) ?? 0) + 1);
      continue;
    }
    counts.considered++;
    if (i.state === "same") counts.alreadyCorrect++;
    else if (i.state === "blocked") {
      counts.cannotChange++;
      problems.push({ path: i.path, reason: i.reason });
    } else counts.willChange++;
    if (i.state === "change" || (i.state === "blocked" && others.length < lim.maxExamples)) {
      const ex: Example = { path: i.path, state: i.state, isDir: i.isDir, before: win ? null : octalOf(i.mode), after: win ? null : octalOf(i.newMode), beforeText: win ? null : symbolicOf(i.mode), afterText: win ? null : symbolicOf(i.newMode), flags: i.flagsChange, reason: i.reason };
      (i.state === "change" ? changes : others).push(ex);
    }
  }
  for (const u of s.unreadable) problems.push({ path: u.path, reason: `Couldn't look inside this folder: ${u.reason}` });
  const examples = [...changes.slice(0, lim.maxExamples), ...others].slice(0, lim.maxExamples);
  const risks = riskList(s.risks);
  return {
    counts,
    examples,
    problems: problems.slice(0, lim.maxProblems),
    problemCount: problems.length,
    skippedBecause: [...skippedBy].map(([reason, count]) => ({ reason, count })),
    risks,
    needsConfirm: risks.length > 0,
  };
}

/** What a change would do, without changing anything. */
export async function planPerms(ctx: FmContext, hooks: PermsHooks, body: Record<string, any>, ctl: RunControl = NO_CONTROL): Promise<Plan> {
  const change = parseChange(body.change, ctx.platform);
  const roots = checkedPaths(ctx, hooks, body.paths, change.recursive !== null);
  try {
    return summarize(ctx, hooks, await scan(ctx, hooks, change, roots, ctl));
  } catch (err) {
    if (err instanceof Stop) throw new FmError(err.why === "time" ? "TOO_SLOW" : "CANCELLED", err.why === "time" ? `Looking through these items took longer than ${Math.round(hooks.limits.maxMillis / 1000)} seconds, so it was stopped. Choose a smaller folder.` : "Cancelled. Nothing was changed.");
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------------------------------------------

interface UndoEntry {
  path: string;
  isDir: boolean;
  ino: number;
  dev: number;
  /** Modes before and after, when the mode was changed. */
  mode?: { before: number; after: number };
  /** The extra settings before and after, for the keys that were changed. */
  flags?: { before: FlagChange; after: FlagChange };
}

interface UndoRecord {
  entries: UndoEntry[];
  made: number;
}

const MAX_UNDO_RECORDS = 20;
const MAX_UNDO_ENTRIES = 500_000;
const undoStores = new WeakMap<FmContext, Map<string, UndoRecord>>();

function storeUndo(ctx: FmContext, entries: UndoEntry[]): string {
  let store = undoStores.get(ctx);
  if (!store) undoStores.set(ctx, (store = new Map()));
  const id = randomBytes(9).toString("hex");
  store.set(id, { entries, made: Date.now() });
  let total = 0;
  for (const r of store.values()) total += r.entries.length;
  for (const key of [...store.keys()]) {
    if (store.size <= MAX_UNDO_RECORDS && total <= MAX_UNDO_ENTRIES) break;
    if (key === id) continue;
    total -= store.get(key)!.entries.length;
    store.delete(key);
  }
  return id;
}

export interface ApplyResult {
  counts: { changed: number; alreadyCorrect: number; failed: number; skipped: number; notDone: number };
  examples: Example[];
  problems: Array<{ path: string; reason: string }>;
  problemCount: number;
  /** Set when the run ended early. */
  stopped: "cancelled" | "time" | null;
  /** Hand this back to `undoPerms` to put the old permissions back. Null when nothing was changed. */
  undo: { id: string; count: number } | null;
}

/** Changes one item: unlocks it first when needed, sets the mode, then the extra settings. Returns what really took effect. */
async function changeOne(ctx: FmContext, hooks: PermsHooks, path: string, current: { mode: number; flags: FlagState | null }, want: { mode: number | null; flags: FlagChange }): Promise<{ mode: number | null; partial: boolean }> {
  const platform = ctx.platform;
  let flags = current.flags;
  let actual: number | null = null;
  let partial = false;
  const modeChange = want.mode !== null && want.mode !== current.mode;
  const mustUnlock = platform === "darwin" && modeChange && flags?.locked === true;
  if (mustUnlock) {
    await writeFlags(platform, hooks, path, { locked: false });
    flags = { ...flags, locked: false };
  }
  if (modeChange) {
    try {
      await hooks.fs.chmod(path, want.mode!);
    } catch (err) {
      if (mustUnlock) await writeFlags(platform, hooks, path, { locked: true }).catch(() => {});
      throw err;
    }
    actual = (await hooks.fs.lstat(path)).mode & MODE_MASK;
    partial = actual !== want.mode;
  }
  const wanted: FlagChange = { ...want.flags };
  if (mustUnlock && wanted.locked === undefined) wanted.locked = true;
  const needed = flagsToChange(flags, wanted);
  if (Object.keys(needed).length) await writeFlags(platform, hooks, path, needed);
  return { mode: actual, partial };
}

export async function applyPerms(ctx: FmContext, hooks: PermsHooks, body: Record<string, any>, ctl: RunControl = NO_CONTROL): Promise<ApplyResult> {
  const change = parseChange(body.change, ctx.platform);
  const roots = checkedPaths(ctx, hooks, body.paths, change.recursive !== null);
  let s: Scan;
  try {
    s = await scan(ctx, hooks, change, roots, ctl);
  } catch (err) {
    if (err instanceof Stop) throw new FmError(err.why === "time" ? "TOO_SLOW" : "CANCELLED", err.why === "time" ? `Looking through these items took longer than ${Math.round(hooks.limits.maxMillis / 1000)} seconds, so nothing was changed. Choose a smaller folder.` : "Cancelled. Nothing was changed.");
    throw err;
  }
  const risks = riskList(s.risks);
  if (risks.length > 0 && body.confirmed !== true) {
    throw new FmError("NEEDS_CONFIRM", "This change needs to be confirmed first.", { risks, plan: summarize(ctx, hooks, s).counts });
  }

  const win = ctx.platform === "win32";
  const entries: UndoEntry[] = [];
  const examples: Example[] = [];
  const problems: Array<{ path: string; reason: string }> = [];
  const counts = { changed: 0, alreadyCorrect: 0, failed: 0, skipped: 0, notDone: 0 };
  const fail = (path: string, reason: string) => {
    counts.failed++;
    problems.push({ path, reason });
  };
  let stopped: ApplyResult["stopped"] = null;
  const deadline = hooks.now() + hooks.limits.maxMillis;
  let done = 0;

  // Children before their folder: a folder that loses its "open" permission must not lock its own contents out.
  for (const item of s.items) {
    if (item.state === "skipped") counts.skipped++;
    else if (item.state === "same") counts.alreadyCorrect++;
    else if (item.state === "blocked") fail(item.path, item.reason);
  }
  const work = s.items.filter((i) => i.state === "change");
  for (let k = work.length - 1; k >= 0; k--) {
    const item = work[k]!;
    if (ctl.signal.aborted) stopped = "cancelled";
    else if (hooks.now() > deadline) stopped = "time";
    if (stopped) {
      counts.notDone += k + 1;
      break;
    }
    ctl.report("changing", ++done, counts.changed);
    let st: PermStat;
    try {
      st = await hooks.fs.lstat(item.path);
    } catch (err) {
      fail(item.path, permError(err, ctx.platform));
      continue;
    }
    if (st.isSymbolicLink() || st.isDirectory() !== item.isDir || (item.ino !== 0 && (st.ino !== item.ino || st.dev !== item.dev))) {
      fail(item.path, "It was replaced by something else while this was running, so it was left alone.");
      continue;
    }
    const before = st.mode & MODE_MASK;
    const target = win ? null : newModeFor(before, item.isDir, change);
    try {
      const res = await changeOne(ctx, hooks, item.path, { mode: before, flags: item.flagsBefore }, { mode: target, flags: item.flagsChange });
      const entry: UndoEntry = { path: item.path, isDir: item.isDir, ino: item.ino, dev: item.dev };
      if (res.mode !== null) entry.mode = { before, after: res.mode };
      const flagKeys = Object.keys(item.flagsChange) as Array<keyof FlagChange>;
      if (flagKeys.length) {
        const prior: FlagChange = {};
        for (const key of flagKeys) if (item.flagsBefore?.[key] !== undefined) prior[key] = item.flagsBefore[key];
        entry.flags = { before: prior, after: { ...item.flagsChange } };
      }
      if (entry.mode || entry.flags) entries.push(entry);
      if (res.partial) {
        if (res.mode === before) fail(item.path, "The computer didn't accept that change (some special settings can only be set by an administrator).");
        else {
          counts.changed++;
          problems.push({ path: item.path, reason: `Changed, but not exactly as asked: it is now ${octalOf(res.mode!)}. The computer keeps some special settings off for you.` });
        }
      } else counts.changed++;
      if (examples.length < hooks.limits.maxExamples) examples.push({ path: item.path, state: "change", isDir: item.isDir, before: win ? null : octalOf(before), after: win ? null : octalOf(res.mode ?? target ?? before), beforeText: win ? null : symbolicOf(before), afterText: win ? null : symbolicOf(res.mode ?? target ?? before), flags: item.flagsChange, reason: "" });
    } catch (err) {
      fail(item.path, permError(err, ctx.platform));
    }
  }
  entries.reverse();
  const undo = entries.length ? { id: storeUndo(ctx, entries), count: entries.length } : null;
  return { counts, examples, problems: problems.slice(0, hooks.limits.maxProblems), problemCount: problems.length, stopped, undo };
}

// ---------------------------------------------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------------------------------------------

export interface UndoResult {
  restored: number;
  skipped: Array<{ path: string; reason: string }>;
  skippedCount: number;
}

/** Puts back what a change recorded. Items that were changed again since, or replaced, are left as they are. */
export async function undoPerms(ctx: FmContext, hooks: PermsHooks, id: unknown): Promise<UndoResult> {
  const store = undoStores.get(ctx);
  const record = typeof id === "string" ? store?.get(id) : undefined;
  if (!store || !record || typeof id !== "string") throw new FmError("NO_UNDO", "That change can't be undone any more.");
  store.delete(id);
  const skipped: UndoResult["skipped"] = [];
  let skippedCount = 0;
  let restored = 0;
  const skip = (path: string, reason: string) => {
    skippedCount++;
    if (skipped.length < hooks.limits.maxProblems) skipped.push({ path, reason });
  };
  // Folders first: they were changed last, and their contents can only be reached once they are back.
  for (const e of record.entries) {
    let st: PermStat;
    try {
      st = await hooks.fs.lstat(e.path);
    } catch (err) {
      skip(e.path, permError(err, ctx.platform));
      continue;
    }
    if (st.isSymbolicLink() || st.isDirectory() !== e.isDir || (e.ino !== 0 && (st.ino !== e.ino || st.dev !== e.dev))) {
      skip(e.path, "It was replaced by something else since, so it was left alone.");
      continue;
    }
    if (protectedReason(e.path, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "create")) {
      skip(e.path, "It is in a protected place now, so it was left alone.");
      continue;
    }
    const nowMode = st.mode & MODE_MASK;
    if (e.mode && nowMode !== e.mode.after) {
      skip(e.path, "Its permissions were changed again since, so they were left as they are.");
      continue;
    }
    const nowFlags = e.flags ? await readFlags(ctx.platform, hooks, e.path, st.mode) : null;
    let flagsBack: FlagChange = {};
    if (e.flags) {
      for (const key of Object.keys(e.flags.before) as Array<keyof FlagChange>) {
        if (nowFlags && nowFlags[key] !== undefined && nowFlags[key] !== e.flags.after[key]) continue;
        flagsBack[key] = e.flags.before[key];
      }
    }
    try {
      await changeOne(ctx, hooks, e.path, { mode: nowMode, flags: nowFlags }, { mode: e.mode ? e.mode.before : null, flags: flagsBack });
      restored++;
    } catch (err) {
      skip(e.path, permError(err, ctx.platform));
    }
  }
  return { restored, skipped, skippedCount };
}
