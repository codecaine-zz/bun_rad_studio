/**
 * Operation plans: what a bulk or destructive operation WILL do, worked out and shown before anything changes.
 *
 * A plan is a list of items (create, copy, move, rename, delete or skip), each with its source and destination,
 * the problems found while planning (a name already taken, a missing file, no permission) and what the person can
 * do afterwards to get things back. Applying a plan (fmPlanRun.ts) checks every item again, because the disk may
 * have changed since the preview, and runs the items through the shared job queue (fmJobs.ts).
 *
 * Rules, covered by tests (tests/file_manager_plan.test.ts):
 *  - Planning never changes a file.
 *  - Nothing is overwritten unless the preview said "replace" for that very item, and the old item then goes to the
 *    Recycle Bin first. A conflict found only while applying leaves that item alone and says so.
 *  - An item with a blocking problem becomes "skip" and keeps its reason; the rest of the plan can still be applied.
 *  - Recovery is described honestly per plan: Undo (this session only), the Recycle Bin, backups and the graveyard are
 *    listed with whether they apply to THIS plan.
 *
 * Requests: copy or move into a folder, rename, batch rename (the same rules as the Rename dialog), delete (Recycle
 * Bin or permanent) and an explicit list of items with exact destinations (used by Compare folders).
 */
import { randomBytes } from "crypto";
import { constants, promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, assertModifiable, assertNotIntoItself, lstatOrNull, pathApi, sameEntry, type FmContext } from "./fmCore";
import { measureTree } from "./fmFileOps";
import { planBulkRename, type BulkSpec } from "./fmOps";
import { FmError, describeFsError, uniqueName, validateName } from "./fmPaths";

export const PLAN_MAX_ITEMS = 5000;
const PLAN_VISIBLE_ITEMS = 2000;
const PLAN_LIFETIME_MS = 30 * 60 * 1000;
const MAX_PLANS = 20;

export type PlanAction = "create" | "copy" | "move" | "rename" | "delete" | "skip";
export type ConflictPolicy = "rename" | "replace" | "skip";

export interface Fingerprint {
  kind: "file" | "dir" | "link" | "other";
  size: number;
  mtimeMs: number;
}

export interface PlanIssue {
  level: "block" | "warn";
  code: string;
  message: string;
}

export interface PlanItem {
  id: number;
  action: PlanAction;
  source: string | null;
  destination: string | null;
  /** Something already at the destination will be replaced (it goes to the Recycle Bin first). */
  replaces: boolean;
  /** Delete for good, bypassing the Recycle Bin. */
  permanent: boolean;
  isDir: boolean;
  bytes: number | null;
  /** Why the item is skipped, or a note about it. */
  reason: string;
  issues: PlanIssue[];
}

export interface PlanItemInternal extends PlanItem {
  srcFp: Fingerprint | null;
  destFp: Fingerprint | null;
  /** Create the destination's missing parent folders when the item runs. */
  makeParents: boolean;
}

export interface PlanSummary {
  create: number;
  copy: number;
  move: number;
  rename: number;
  replace: number;
  delete: number;
  permanentDelete: number;
  skip: number;
  /** Items that have a problem (blocked ones are also counted under skip). */
  problems: number;
}

export interface RecoveryNote {
  kind: "undo" | "recycle-bin" | "backup" | "quarantine";
  available: boolean;
  text: string;
}

export interface PlanView {
  id: string;
  title: string;
  createdAt: number;
  summary: PlanSummary;
  items: PlanItem[];
  itemsOmitted: number;
  warnings: string[];
  recovery: RecoveryNote[];
  /** Applying needs `approved: true`: something is replaced or deleted. */
  needsApproval: boolean;
  /** Applying also needs `confirmPermanent: true`: something is deleted for good. */
  needsPermanentApproval: boolean;
  /** At least one item would actually be changed. */
  canApply: boolean;
  bytes: number | null;
  applied: boolean;
  jobId: string | null;
  undone: boolean;
}

export interface UndoEntry {
  action: PlanAction;
  source: string | null;
  destination: string | null;
  replacedTrashId?: string;
  trashId?: string;
  /** What the destination looked like right after the item finished: Undo refuses to touch it if it changed since. */
  afterFp: Fingerprint | null;
}

export interface PlanRecord {
  id: string;
  title: string;
  createdAt: number;
  items: PlanItemInternal[];
  applied: boolean;
  jobId: string | null;
  undone: boolean;
  undoLog: Map<number, UndoEntry>;
}

const stores = new WeakMap<FmContext, Map<string, PlanRecord>>();

export function planStore(ctx: FmContext): Map<string, PlanRecord> {
  let store = stores.get(ctx);
  if (!store) stores.set(ctx, (store = new Map()));
  return store;
}

export function findPlan(ctx: FmContext, id: unknown): PlanRecord {
  const plan = typeof id === "string" ? planStore(ctx).get(id) : undefined;
  if (!plan) throw new FmError("PLAN_GONE", "That preview is no longer available. Preview the operation again.");
  if (!plan.applied && Date.now() - plan.createdAt > PLAN_LIFETIME_MS) {
    planStore(ctx).delete(plan.id);
    throw new FmError("PLAN_EXPIRED", "That preview is too old to trust, because files may have changed since. Preview the operation again.");
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------
// Looking at the disk
// ---------------------------------------------------------------------------------------------------------------

export async function fingerprint(path: string): Promise<Fingerprint | null> {
  const st = await lstatOrNull(path);
  if (!st) return null;
  return { kind: st.isSymbolicLink() ? "link" : st.isDirectory() ? "dir" : st.isFile() ? "file" : "other", size: st.isFile() ? st.size : 0, mtimeMs: Math.floor(st.mtimeMs) };
}

export const sameFingerprint = (a: Fingerprint | null, b: Fingerprint | null): boolean => !!a && !!b && a.kind === b.kind && a.size === b.size && a.mtimeMs === b.mtimeMs;

async function writable(folder: string): Promise<boolean> {
  try {
    await fsp.access(folder, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** The nearest folder that exists at or above `path` (where a missing destination would be created). */
async function nearestExisting(ctx: FmContext, path: string): Promise<string> {
  const p = pathApi(ctx);
  let at = path;
  while (!(await lstatOrNull(at))) {
    const up = p.dirname(at);
    if (up === at) break;
    at = up;
  }
  return at;
}

// ---------------------------------------------------------------------------------------------------------------
// Building plans
// ---------------------------------------------------------------------------------------------------------------

class Builder {
  items: PlanItemInternal[] = [];
  constructor(readonly ctx: FmContext) {}

  add(item: Partial<PlanItemInternal> & { action: PlanAction }): PlanItemInternal {
    const full: PlanItemInternal = {
      id: this.items.length,
      source: null,
      destination: null,
      replaces: false,
      permanent: false,
      isDir: false,
      bytes: null,
      reason: "",
      issues: [],
      srcFp: null,
      destFp: null,
      makeParents: false,
      ...item,
    };
    this.items.push(full);
    return full;
  }

  /** An item that will not be done: it stays in the list with its reason, so nothing disappears silently. */
  skip(source: string | null, destination: string | null, reason: string, issue?: PlanIssue): PlanItemInternal {
    return this.add({ action: "skip", source, destination, reason, issues: issue ? [issue] : [] });
  }

  block(source: string | null, destination: string | null, code: string, message: string): PlanItemInternal {
    return this.skip(source, destination, message, { level: "block", code, message });
  }
}

const errorOf = (err: unknown, what: string) => (err instanceof FmError ? err.message : describeFsError(err, what).message);

function checkCount(count: number): void {
  if (count === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (count > PLAN_MAX_ITEMS) throw new FmError("TOO_MANY", `That is more than ${PLAN_MAX_ITEMS} items at once. Do it in smaller groups.`);
}

/** Drops (and reports) items that sit inside another selected item: changing both would break one of them. */
function nestedIn(ctx: FmContext, paths: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const p = pathApi(ctx);
  for (const path of paths) {
    for (const other of paths) {
      if (other !== path && path.startsWith(other.endsWith(p.sep) ? other : other + p.sep)) result.set(path, other);
    }
  }
  return result;
}

async function planTransfer(b: Builder, mode: "copy" | "move", sourcesInput: unknown, destInput: unknown, policy: ConflictPolicy): Promise<string> {
  const ctx = b.ctx;
  if (!Array.isArray(sourcesInput)) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  checkCount(sourcesInput.length);
  const p = pathApi(ctx);
  const destDir = absolutePath(ctx, destInput);
  await assertFolder(destDir, "The destination");
  assertCreatable(ctx, destDir);
  const sources = sourcesInput.map((s) => absolutePath(ctx, s));
  const inside = nestedIn(ctx, sources);
  const taken = new Set((await fsp.readdir(destDir)).map((n) => n));
  const claimed = new Set<string>();
  const destWritable = await writable(destDir);
  const seen = new Set<string>();
  for (const source of sources) {
    const base = p.basename(source);
    if (seen.has(source)) { b.skip(source, null, "Selected more than once."); continue; }
    seen.add(source);
    const outer = inside.get(source);
    if (outer) { b.skip(source, null, `Already included with "${p.basename(outer)}".`); continue; }
    const fp = await fingerprint(source);
    if (!fp) { b.block(source, null, "NOT_FOUND", `"${base}" no longer exists.`); continue; }
    try {
      if (mode === "move") assertModifiable(ctx, source);
      if (fp.kind === "dir") assertNotIntoItself(ctx, source, destDir);
    } catch (err) {
      b.block(source, null, err instanceof FmError ? err.code : "BLOCKED", errorOf(err, `${mode} that`));
      continue;
    }
    if (fp.kind === "other") { b.block(source, null, "NOT_REGULAR", `"${base}" is a special file (a pipe, socket or device).`); continue; }
    if (!destWritable) { b.block(source, null, "EACCES", `You don't have permission to put files in "${p.basename(destDir) || destDir}".`); continue; }
    if (mode === "move" && !(await writable(p.dirname(source)))) { b.block(source, null, "EACCES", `You don't have permission to remove "${base}" from its folder.`); continue; }
    const sameFolder = p.dirname(source) === destDir;
    if (sameFolder && mode === "move") { b.skip(source, null, "Already in that folder."); continue; }
    let name = base;
    const clash = (n: string) => taken.has(n) || claimed.has(n);
    let replaces = false;
    if (sameFolder || clash(name)) {
      if (policy === "skip") { b.skip(source, p.join(destDir, name), "Left alone: something with that name is already there.", { level: "warn", code: "EXISTS", message: `"${name}" already exists there.` }); continue; }
      if (policy === "replace" && !sameFolder && !claimed.has(name)) replaces = true;
      else name = uniqueName(name, clash, sameFolder ? "copy" : "number");
    }
    const destination = p.join(destDir, name);
    claimed.add(name);
    const item = b.add({ action: mode, source, destination, isDir: fp.kind === "dir", srcFp: fp, replaces });
    if (replaces) {
      item.destFp = await fingerprint(destination);
      if (item.destFp && sameFingerprint(item.destFp, fp) && (await sameEntry(source, destination))) {
        item.action = "skip"; item.replaces = false; item.reason = "The source and the destination are the same item."; item.issues.push({ level: "block", code: "SAME", message: item.reason });
        continue;
      }
      try { assertModifiable(ctx, destination); }
      catch (err) { item.action = "skip"; item.replaces = false; item.reason = errorOf(err, "replace that"); item.issues.push({ level: "block", code: "PROTECTED", message: item.reason }); continue; }
      item.issues.push({ level: "warn", code: "REPLACE", message: `Replaces the existing "${name}". The old one goes to the Recycle Bin first.` });
    }
    if (sameFolder) item.issues.push({ level: "warn", code: "RENAMED", message: `A copy in the same folder gets the name "${name}".` });
  }
  const where = p.basename(destDir) || destDir;
  return `${mode === "copy" ? "Copy" : "Move"} ${sources.length} ${sources.length === 1 ? "item" : "items"} to "${where}"`;
}

function renamePairs(ctx: FmContext, pairs: Array<{ path: string; name: string }>) {
  const p = pathApi(ctx);
  return pairs.map(({ path, name }) => ({ path, name, destination: p.join(p.dirname(path), name) }));
}

async function planRenames(b: Builder, pairsInput: Array<{ path: string; name: string; error?: string | null }>): Promise<string> {
  const ctx = b.ctx;
  checkCount(pairsInput.length);
  const p = pathApi(ctx);
  const sources = new Map(pairsInput.map((r) => [r.path, r.name] as const));
  const insensitive = ctx.platform === "win32" || ctx.platform === "darwin";
  const key = (n: string) => (insensitive ? n.toLowerCase() : n);
  const finals = new Map<string, number>();
  for (const r of renamePairs(ctx, pairsInput)) finals.set(key(r.destination), (finals.get(key(r.destination)) ?? 0) + 1);
  for (const { path, name, destination } of renamePairs(ctx, pairsInput)) {
    const old = p.basename(path);
    const given = pairsInput.find((r) => r.path === path)?.error;
    if (given) { b.block(path, destination, "BAD_NAME", given); continue; }
    if (name === old) { b.skip(path, null, "The name stays the same."); continue; }
    const bad = validateName(name, ctx.platform);
    if (bad) { b.block(path, destination, "BAD_NAME", bad); continue; }
    try { assertModifiable(ctx, path); } catch (err) { b.block(path, destination, "PROTECTED", errorOf(err, "rename that")); continue; }
    const fp = await fingerprint(path);
    if (!fp) { b.block(path, destination, "NOT_FOUND", `"${old}" no longer exists.`); continue; }
    if ((finals.get(key(destination)) ?? 0) > 1) { b.block(path, destination, "DUPLICATE", "Two items would get this same name."); continue; }
    if (!(await writable(p.dirname(path)))) { b.block(path, destination, "EACCES", `You don't have permission to rename items in this folder.`); continue; }
    const taken = await lstatOrNull(destination);
    // Another item that is itself being renamed away frees its name; that is fine.
    const freed = sources.has(destination) && sources.get(destination) !== p.basename(destination);
    if (taken && !freed && !(await sameEntry(path, destination))) { b.block(path, destination, "EXISTS", `"${name}" already exists in that folder. Renaming never replaces an existing item.`); continue; }
    b.add({ action: "rename", source: path, destination, isDir: fp.kind === "dir", srcFp: fp });
  }
  return `Rename ${pairsInput.length} ${pairsInput.length === 1 ? "item" : "items"}`;
}

async function planDelete(b: Builder, pathsInput: unknown, permanent: boolean): Promise<string> {
  const ctx = b.ctx;
  if (!Array.isArray(pathsInput)) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  checkCount(pathsInput.length);
  const p = pathApi(ctx);
  const paths = pathsInput.map((s) => absolutePath(ctx, s));
  const inside = nestedIn(ctx, paths);
  for (const path of paths) {
    const base = p.basename(path);
    const outer = inside.get(path);
    if (outer) { b.skip(path, null, `Already included with "${p.basename(outer)}".`); continue; }
    const fp = await fingerprint(path);
    if (!fp) { b.block(path, null, "NOT_FOUND", `"${base}" no longer exists.`); continue; }
    try { assertModifiable(ctx, path); } catch (err) { b.block(path, null, "PROTECTED", errorOf(err, "delete that")); continue; }
    if (!(await writable(p.dirname(path)))) { b.block(path, null, "EACCES", `You don't have permission to remove "${base}" from its folder.`); continue; }
    let bytes: number | null = fp.kind === "file" ? fp.size : null;
    const issues: PlanIssue[] = [];
    if (fp.kind === "dir") {
      const size = await measureTree(path, AbortSignal.timeout(4000)).catch(() => null);
      bytes = size ? size.bytes : null;
      issues.push({ level: "warn", code: "FOLDER", message: size ? `The folder and its ${size.files} ${size.files === 1 ? "file" : "files"} go with it.` : "The folder and everything inside it goes with it (it is too big to count quickly)." });
    }
    if (permanent) issues.push({ level: "warn", code: "PERMANENT", message: "Deleted for good: it will not be in the Recycle Bin and cannot be brought back." });
    b.add({ action: "delete", source: path, destination: null, permanent, isDir: fp.kind === "dir", srcFp: fp, bytes, issues });
  }
  return `${permanent ? "Delete for good" : "Move to the Recycle Bin"}: ${paths.length} ${paths.length === 1 ? "item" : "items"}`;
}

export interface ExplicitItem {
  action: "copy" | "move" | "create";
  source?: string;
  destination: string;
  replace?: boolean;
  /** Leave this item out and say why (it stays in the preview as a skipped item). */
  skipReason?: string;
  /** What the source and the existing destination looked like when the person chose them; a difference blocks the item. */
  expect?: { size: number; mtimeMs: number };
  expectDest?: { size: number; mtimeMs: number };
}

async function planExplicit(b: Builder, itemsInput: unknown, title: string): Promise<string> {
  const ctx = b.ctx;
  if (!Array.isArray(itemsInput)) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  checkCount(itemsInput.length);
  const p = pathApi(ctx);
  const claimed = new Set<string>();
  for (const raw of itemsInput as ExplicitItem[]) {
    const action = raw?.action;
    if (action !== "copy" && action !== "move" && action !== "create") throw new FmError("BAD_REQUEST", "Every item needs an action: copy, move or create.");
    const destination = absolutePath(ctx, raw.destination);
    const source = action === "create" ? null : absolutePath(ctx, raw.source);
    const label = p.basename(destination);
    if (raw.skipReason) { b.skip(source, destination, String(raw.skipReason).slice(0, 300)); continue; }
    try {
      assertCreatable(ctx, p.dirname(destination));
      if (action === "move" && source) assertModifiable(ctx, source);
    } catch (err) { b.block(source, destination, "PROTECTED", errorOf(err, "do that")); continue; }
    if (claimed.has(destination)) { b.block(source, destination, "DUPLICATE", "Two items would be written to this same place."); continue; }
    claimed.add(destination);
    const srcFp = source ? await fingerprint(source) : null;
    if (source && !srcFp) { b.block(source, destination, "NOT_FOUND", `"${p.basename(source)}" no longer exists.`); continue; }
    if (srcFp && srcFp.kind === "other") { b.block(source, destination, "NOT_REGULAR", `"${p.basename(source!)}" is a special file (a pipe, socket or device).`); continue; }
    const parent = await nearestExisting(ctx, p.dirname(destination));
    const parentStat = await lstatOrNull(parent);
    if (!parentStat || !parentStat.isDirectory()) { b.block(source, destination, "NOT_A_FOLDER", `"${p.basename(parent)}" is not a folder, so "${label}" can't be put inside it.`); continue; }
    if (!(await writable(parent))) { b.block(source, destination, "EACCES", `You don't have permission to write in "${p.basename(parent) || parent}".`); continue; }
    const destFp = await fingerprint(destination);
    const moved = (now: Fingerprint | null, was?: { size: number; mtimeMs: number }) => !!was && (!now || now.size !== was.size || now.mtimeMs !== Math.floor(was.mtimeMs));
    if (srcFp && moved(srcFp, raw.expect)) { b.block(source, destination, "CHANGED", `"${p.basename(source!)}" changed after you compared the folders. Compare again.`); continue; }
    if (raw.expectDest && moved(destFp, raw.expectDest)) { b.block(source, destination, "CHANGED", `"${label}" at the destination changed after you compared the folders. Compare again.`); continue; }
    const item = b.add({ action, source, destination, isDir: (srcFp?.kind ?? "dir") === "dir", srcFp, destFp, makeParents: true });
    if (action === "create") {
      if (destFp) { item.action = "skip"; item.reason = "A folder with this name already exists."; }
      continue;
    }
    if (destFp) {
      if (destFp.kind === "dir" || srcFp!.kind === "dir") { item.action = "skip"; item.reason = `"${label}" is a ${destFp.kind === "dir" ? "folder" : "file"} there but a ${srcFp!.kind === "dir" ? "folder" : "file"} here, so it was not touched.`; item.issues.push({ level: "block", code: "TYPE_MISMATCH", message: item.reason }); continue; }
      if (!raw.replace) { item.action = "skip"; item.reason = "Left alone: something with that name is already there."; item.issues.push({ level: "warn", code: "EXISTS", message: `"${label}" already exists there.` }); continue; }
      item.replaces = true;
      item.issues.push({ level: "warn", code: "REPLACE", message: `Replaces the existing "${label}". The old one goes to the Recycle Bin first.` });
    }
  }
  return title;
}

export type PlanRequest =
  | { type: "transfer"; mode: "copy" | "move"; sources: unknown; destination: unknown; policy?: unknown }
  | { type: "rename"; items: unknown }
  | { type: "bulk-rename"; folder: unknown; names: unknown; spec: BulkSpec }
  | { type: "delete"; paths: unknown; permanent?: unknown }
  | { type: "items"; title?: unknown; items: unknown };

const policyOf = (v: unknown): ConflictPolicy => (v === "replace" || v === "skip" ? v : "rename");

function summarize(items: PlanItemInternal[]): PlanSummary {
  const s: PlanSummary = { create: 0, copy: 0, move: 0, rename: 0, replace: 0, delete: 0, permanentDelete: 0, skip: 0, problems: 0 };
  for (const i of items) {
    if (i.issues.length) s.problems++;
    if (i.action === "skip") s.skip++;
    else if (i.replaces) s.replace++;
    else if (i.action === "delete") i.permanent ? s.permanentDelete++ : s.delete++;
    else s[i.action]++;
  }
  return s;
}

function recoveryOf(items: PlanItemInternal[]): RecoveryNote[] {
  const live = items.filter((i) => i.action !== "skip");
  const replaces = live.some((i) => i.replaces);
  const recycled = live.some((i) => i.action === "delete" && !i.permanent);
  const permanent = live.some((i) => i.action === "delete" && i.permanent);
  const undoable = live.some((i) => !(i.action === "delete" && i.permanent));
  const notes: RecoveryNote[] = [
    {
      kind: "undo",
      available: undoable,
      text: undoable
        ? "Undo puts the items back (moves and renames are reversed, copies go to the Recycle Bin). It works until you close the File Manager, and skips anything you changed afterwards."
        : "Undo is not available: everything here is deleted for good.",
    },
    {
      kind: "recycle-bin",
      available: replaces || recycled,
      text: replaces || recycled
        ? `${recycled ? "Deleted items" : "Replaced items"} go to the Recycle Bin, where you can restore them any time until you empty it.`
        : "Nothing here goes to the Recycle Bin.",
    },
    { kind: "backup", available: false, text: "No backup copies are made. (Backups exist only in the Replace tool, which keeps its own backup files.)" },
    { kind: "quarantine", available: false, text: "Nothing is sent to the Graveyard. To bury items there instead, use the Graveyard tool." },
  ];
  if (permanent) notes.push({ kind: "recycle-bin", available: false, text: "Items deleted for good are NOT recoverable by any of the above." });
  return notes;
}

export function viewOf(plan: PlanRecord): PlanView {
  const summary = summarize(plan.items);
  const live = plan.items.filter((i) => i.action !== "skip");
  const warnings: string[] = [];
  if (summary.permanentDelete) warnings.push(`${summary.permanentDelete} ${summary.permanentDelete === 1 ? "item is" : "items are"} deleted for good. This cannot be undone.`);
  if (summary.replace) warnings.push(`${summary.replace} existing ${summary.replace === 1 ? "item is" : "items are"} replaced.`);
  if (summary.problems - summary.skip > 0) warnings.push("Some items have warnings. Open them to see why.");
  const blocked = plan.items.filter((i) => i.issues.some((x) => x.level === "block")).length;
  if (blocked) warnings.push(`${blocked} ${blocked === 1 ? "item" : "items"} can't be done and will be skipped.`);
  const bytes = live.every((i) => i.bytes !== null) ? live.reduce((t, i) => t + (i.bytes ?? 0), 0) : null;
  const needsPermanentApproval = live.some((i) => i.action === "delete" && i.permanent);
  return {
    id: plan.id,
    title: plan.title,
    createdAt: plan.createdAt,
    summary,
    items: plan.items.slice(0, PLAN_VISIBLE_ITEMS).map(({ srcFp: _a, destFp: _b, makeParents: _c, ...item }) => item),
    itemsOmitted: Math.max(0, plan.items.length - PLAN_VISIBLE_ITEMS),
    warnings,
    recovery: recoveryOf(plan.items),
    needsApproval: live.some((i) => i.replaces || i.action === "delete"),
    needsPermanentApproval,
    canApply: live.length > 0 && !plan.applied,
    bytes,
    applied: plan.applied,
    jobId: plan.jobId,
    undone: plan.undone,
  };
}

/** Works out a plan from a request and remembers it for a while. Nothing on disk is changed. */
export async function createPlan(ctx: FmContext, request: PlanRequest): Promise<PlanView> {
  const b = new Builder(ctx);
  let title: string;
  switch (request?.type) {
    case "transfer":
      if (request.mode !== "copy" && request.mode !== "move") throw new FmError("BAD_REQUEST", "Choose copy or move.");
      title = await planTransfer(b, request.mode, request.sources, request.destination, policyOf(request.policy));
      break;
    case "rename": {
      if (!Array.isArray(request.items)) throw new FmError("BAD_REQUEST", "Nothing was selected.");
      const pairs = request.items.map((i: { path?: unknown; name?: unknown }) => {
        if (typeof i?.name !== "string") throw new FmError("BAD_NAME", "Every item needs a new name.");
        return { path: absolutePath(ctx, i.path), name: i.name };
      });
      title = await planRenames(b, pairs);
      break;
    }
    case "bulk-rename": {
      const folder = absolutePath(ctx, request.folder);
      await assertFolder(folder, "That folder");
      if (!Array.isArray(request.names) || request.names.length === 0 || request.names.some((n) => typeof n !== "string")) throw new FmError("BAD_REQUEST", "Nothing was selected.");
      const p = pathApi(ctx);
      const names = request.names as string[];
      if (names.some((n) => n !== p.basename(n))) throw new FmError("BAD_REQUEST", "Only names inside the folder can be renamed together.");
      const renamed = new Set(names);
      const existing = new Set((await fsp.readdir(folder)).filter((n) => !renamed.has(n)));
      const rows = planBulkRename(names, request.spec, existing, ctx.platform);
      title = await planRenames(b, rows.map((r) => ({ path: p.join(folder, r.from), name: r.to, error: r.error })));
      break;
    }
    case "delete":
      title = await planDelete(b, request.paths, request.permanent === true);
      break;
    case "items":
      title = await planExplicit(b, request.items, typeof request.title === "string" && request.title.trim() ? request.title.trim().slice(0, 200) : "Copy selected items");
      break;
    default:
      throw new FmError("BAD_REQUEST", "That kind of operation can't be previewed.");
  }
  const plan: PlanRecord = { id: randomBytes(8).toString("hex"), title, createdAt: Date.now(), items: b.items, applied: false, jobId: null, undone: false, undoLog: new Map() };
  const store = planStore(ctx);
  store.set(plan.id, plan);
  // Keep the newest plans only; one that ran is kept longer than one that never did, so Undo stays possible.
  while (store.size > MAX_PLANS) {
    const oldest = [...store.values()].filter((x) => !x.applied).sort((x, y) => x.createdAt - y.createdAt)[0] ?? [...store.values()][0]!;
    store.delete(oldest.id);
  }
  return viewOf(plan);
}
