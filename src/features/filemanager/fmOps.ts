/**
 * Changing things: new folder or file, rename, bulk rename, copy, move, and the exact "put it back" move behind Undo.
 * Every function checks that the target is allowed to change (see protectedReason) before touching the disk.
 */
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import { absolutePath, assertCreatable, assertFolder, assertModifiable, assertNotIntoItself, copyTree, eachItem, exists, lstatOrNull, moveTree, pathApi, sameEntry, type FmContext } from "./fmCore";
import { FmError, cleanName, describeFsError, uniqueName, validateName, splitName } from "./fmPaths";
import { moveToTrash } from "./fmTrash";

type Outcome<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

function checkedName(ctx: FmContext, name: unknown): string {
  const reason = validateName(name, ctx.platform);
  if (reason) throw new FmError("BAD_NAME", reason);
  return cleanName(name);
}

async function namesIn(dir: string): Promise<Set<string>> {
  return new Set(await fsp.readdir(dir));
}

// ---------------------------------------------------------------------------------------------------------------
// New folder / file
// ---------------------------------------------------------------------------------------------------------------

/** Creates a new folder inside `parentInput`, choosing a free `"New folder"` name when `nameInput` is omitted. */
export async function makeFolder(ctx: FmContext, parentInput: unknown, nameInput?: unknown): Promise<{ path: string; name: string }> {
  const parent = absolutePath(ctx, parentInput);
  await assertFolder(parent, "The folder you are in");
  assertCreatable(ctx, parent);
  const taken = await namesIn(parent);
  const name = nameInput === undefined || nameInput === "" ? uniqueName("New folder", (n) => taken.has(n)) : checkedName(ctx, nameInput);
  const path = pathApi(ctx).join(parent, name);
  try {
    await fsp.mkdir(path);
  } catch (err: any) {
    if (err?.code === "EEXIST") throw new FmError("EXISTS", `"${name}" already exists here. Choose a different name.`);
    throw err;
  }
  return { path, name };
}

/** Creates a new file inside `parentInput` without overwriting existing files, choosing a free `"New file.txt"` name when `nameInput` is omitted. */
export async function makeFile(ctx: FmContext, parentInput: unknown, nameInput?: unknown, content = ""): Promise<{ path: string; name: string }> {
  const parent = absolutePath(ctx, parentInput);
  await assertFolder(parent, "The folder you are in");
  assertCreatable(ctx, parent);
  const taken = await namesIn(parent);
  const name = nameInput === undefined || nameInput === "" ? uniqueName("New file.txt", (n) => taken.has(n)) : checkedName(ctx, nameInput);
  const path = pathApi(ctx).join(parent, name);
  try {
    await fsp.writeFile(path, content, { flag: "wx" });
  } catch (err: any) {
    if (err?.code === "EEXIST") throw new FmError("EXISTS", `"${name}" already exists here. Choose a different name.`);
    throw err;
  }
  return { path, name };
}

// ---------------------------------------------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------------------------------------------

/** Renames in place. Never replaces an existing item; a change of letter case only ("a.txt" to "A.txt") is allowed. */
export async function renameItem(ctx: FmContext, pathInput: unknown, newNameInput: unknown): Promise<{ from: string; to: string }> {
  const from = absolutePath(ctx, pathInput);
  assertModifiable(ctx, from);
  const name = checkedName(ctx, newNameInput);
  const p = pathApi(ctx);
  const to = p.join(p.dirname(from), name);
  if (to === from) return { from, to };
  if (!(await exists(from))) throw Object.assign(new Error("gone"), { code: "ENOENT" });
  if (await exists(to)) {
    if (!(await sameEntry(from, to))) throw new FmError("EXISTS", `"${name}" already exists here. Choose a different name.`);
    // Only the letter case differs on a case-insensitive disk: go through a temporary name.
    const temp = p.join(p.dirname(from), `.fm-rename-${randomBytes(6).toString("hex")}`);
    await fsp.rename(from, temp);
    try {
      await fsp.rename(temp, to);
    } catch (err) {
      await fsp.rename(temp, from).catch(() => {});
      throw err;
    }
    return { from, to };
  }
  await fsp.rename(from, to);
  return { from, to };
}

/**
 * Moves one item to an exact new full path (never overwriting). This is what Undo uses to put things back,
 * and it checks the same protections as a normal move.
 */
export async function relocate(ctx: FmContext, pairs: unknown): Promise<Outcome<{ from: string; to: string }>[]> {
  if (!Array.isArray(pairs) || pairs.length === 0) throw new FmError("BAD_REQUEST", "Nothing to move.");
  const p = pathApi(ctx);
  return eachItem(
    pairs as Array<{ from: unknown; to: unknown }>,
    async (pair) => {
      const from = absolutePath(ctx, pair?.from);
      const to = absolutePath(ctx, pair?.to);
      assertModifiable(ctx, from);
      assertCreatable(ctx, p.dirname(to));
      const nameReason = validateName(p.basename(to), ctx.platform);
      if (nameReason) throw new FmError("BAD_NAME", nameReason);
      assertNotIntoItself(ctx, from, p.dirname(to));
      if (await exists(to)) throw new FmError("EXISTS", `Something named "${p.basename(to)}" is already there.`);
      await fsp.mkdir(p.dirname(to), { recursive: true });
      await moveTree(from, to);
      return { from, to };
    },
    (err) => describeFsError(err, "move that"),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Copy and move
// ---------------------------------------------------------------------------------------------------------------

/** Conflict resolution policy when copying or moving an item onto an existing name (`"rename"`, `"replace"`, or `"skip"`). */
export type Policy = "rename" | "replace" | "skip";

/** Per-item outcome of a copy or move operation, including any existing item moved to the Recycle Bin under `"replace"`. */
export interface TransferResult {
  source: string;
  destination: string | null;
  status: "done" | "skipped";
  /** Something that was in the way and was sent to the Recycle Bin first (Replace). */
  replaced?: { path: string; trashId: string };
}

/** Which of `sources` would land on an existing item in `destDir` (the app asks what to do about each). */
export async function findConflicts(ctx: FmContext, sourcesInput: unknown, destInput: unknown): Promise<{ conflicts: Array<{ source: string; name: string; existingIsDir: boolean; sourceIsDir: boolean }> }> {
  if (!Array.isArray(sourcesInput)) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const destDir = absolutePath(ctx, destInput);
  await assertFolder(destDir, "The destination");
  const p = pathApi(ctx);
  const conflicts = [];
  for (const s of sourcesInput) {
    const source = absolutePath(ctx, s);
    if (p.dirname(source) === destDir) continue; // copying into its own folder always makes a "copy" name; moving is a no-op
    const target = p.join(destDir, p.basename(source));
    const [existing, src] = await Promise.all([lstatOrNull(target), lstatOrNull(source)]);
    if (existing && src) conflicts.push({ source, name: p.basename(source), existingIsDir: existing.isDirectory(), sourceIsDir: src.isDirectory() });
  }
  return { conflicts };
}

/** Where an item goes in `destDir` under the chosen policy; null when it is to be left alone. Replace sends the old item to the Recycle Bin first. */
export async function resolveTarget(ctx: FmContext, source: string, destDir: string, policy: Policy, copying: boolean, name?: string): Promise<{ target: string | null; replaced?: { path: string; trashId: string } }> {
  const p = pathApi(ctx);
  const base = name ?? p.basename(source);
  const sameFolder = p.dirname(source) === destDir && base === p.basename(source);
  const target = p.join(destDir, base);
  if (sameFolder) {
    if (!copying) return { target: null }; // moving into the folder it is already in
    const taken = await namesIn(destDir);
    return { target: p.join(destDir, uniqueName(base, (n) => taken.has(n), "copy")) };
  }
  if (!(await exists(target))) return { target };
  if (policy === "skip") return { target: null };
  if (policy === "rename") {
    const taken = await namesIn(destDir);
    return { target: p.join(destDir, uniqueName(base, (n) => taken.has(n))) };
  }
  // replace: the old item goes to the Recycle Bin first, so even Replace can be undone
  assertModifiable(ctx, target);
  const [result] = await moveToTrash(ctx, [target]);
  if (!result || !result.ok) throw new FmError(result && !result.ok ? result.code : "TRASH_FAILED", result && !result.ok ? result.message : "The existing item couldn't be replaced.");
  return { target, replaced: { path: target, trashId: result.value.id } };
}

async function transfer(ctx: FmContext, sourcesInput: unknown, destInput: unknown, policyInput: unknown, copying: boolean): Promise<Outcome<TransferResult>[]> {
  if (!Array.isArray(sourcesInput) || sourcesInput.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const destDir = absolutePath(ctx, destInput);
  await assertFolder(destDir, "The destination");
  assertCreatable(ctx, destDir);
  const policy: Policy = policyInput === "replace" || policyInput === "skip" ? policyInput : "rename";
  return eachItem(
    sourcesInput,
    async (s): Promise<TransferResult> => {
      const source = absolutePath(ctx, s);
      if (!copying) assertModifiable(ctx, source);
      const st = await fsp.lstat(source);
      if (st.isDirectory()) assertNotIntoItself(ctx, source, destDir);
      const { target, replaced } = await resolveTarget(ctx, source, destDir, policy, copying);
      if (!target) return { source, destination: null, status: "skipped" };
      if (copying) await copyTree(source, target);
      else await moveTree(source, target);
      return { source, destination: target, status: "done", ...(replaced ? { replaced } : {}) };
    },
    (err) => describeFsError(err, copying ? "copy that" : "move that"),
  );
}

/** Copies `sources` into `dest` using the specified conflict `policy` (`"rename"` by default). */
export const copyItems = (ctx: FmContext, sources: unknown, dest: unknown, policy?: unknown) => transfer(ctx, sources, dest, policy, true);
/** Moves `sources` into `dest` using the specified conflict `policy` (`"rename"` by default). */
export const moveItems = (ctx: FmContext, sources: unknown, dest: unknown, policy?: unknown) => transfer(ctx, sources, dest, policy, false);

// ---------------------------------------------------------------------------------------------------------------
// Bulk rename
// ---------------------------------------------------------------------------------------------------------------

/** Rule specification for a bulk rename operation (`replace`, `number`, `case`, or `affix` mode). */
export type BulkSpec =
  | { mode: "replace"; find: string; replace: string; matchCase?: boolean; useRegex?: boolean }
  | { mode: "number"; pattern: string; start?: number; padding?: number }
  | { mode: "case"; style: "lower" | "upper" | "title" | "sentence" | "snake" | "kebab" | "camel" }
  | { mode: "affix"; prefix?: string; suffix?: string };

/** Preview or execution row for a single file in a bulk rename operation. */
export interface BulkRow {
  from: string;
  to: string;
  changed: boolean;
  error: string | null;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s_\-.(\[])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

function splitIdentifierWords(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function toAlphaIndex(index0: number): string {
  let n = Math.max(0, index0) + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "A";
}

function expandRenameTokens(template: string, base: string, ext: string, paddedNum: string, index0: number): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const cleanExt = ext.replace(/^\./, "");
  return template
    .split("{n}").join(paddedNum)
    .split("{name}").join(base)
    .split("{ext}").join(cleanExt)
    .split("{date}").join(`${yyyy}-${mm}-${dd}`)
    .split("{year}").join(yyyy)
    .split("{month}").join(mm)
    .split("{day}").join(dd)
    .split("{alpha}").join(toAlphaIndex(index0));
}

/**
 * Works out the new names, without touching the disk. The extension (".jpg") is kept as it is in every mode, and
 * `existing` lists names in the folder that are NOT being renamed, so a clash with them is reported.
 */
export function planBulkRename(names: string[], spec: BulkSpec, existing: Set<string>, platform: Parameters<typeof validateName>[1]): BulkRow[] {
  const rows: BulkRow[] = names.map((from, index) => {
    const [base, ext] = splitName(from);
    let nextBase = base;
    let customError: string | null = null;
    switch (spec.mode) {
      case "replace": {
        if (!spec.find) break;
        const flags = spec.matchCase ? "g" : "gi";
        if (spec.useRegex) {
          try {
            const re = new RegExp(spec.find, flags);
            nextBase = base.replace(re, spec.replace ?? "");
          } catch {
            customError = "Invalid regular expression.";
          }
        } else {
          nextBase = base.replace(new RegExp(spec.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags), () => spec.replace ?? "");
        }
        break;
      }
      case "number": {
        const n = (spec.start ?? 1) + index;
        const padded = String(n).padStart(Math.max(1, Math.min(10, spec.padding ?? 1)), "0");
        const pattern = spec.pattern || "{n}";
        const hasCounterToken = pattern.includes("{n}") || pattern.includes("{alpha}");
        const raw = hasCounterToken ? pattern : `${pattern} {n}`;
        nextBase = expandRenameTokens(raw, base, ext, padded, index);
        break;
      }
      case "case": {
        if (spec.style === "lower") nextBase = base.toLowerCase();
        else if (spec.style === "upper") nextBase = base.toUpperCase();
        else if (spec.style === "title") nextBase = titleCase(base);
        else if (spec.style === "snake") {
          const words = splitIdentifierWords(base).map((w) => w.toLowerCase());
          if (words.length) nextBase = words.join("_");
        } else if (spec.style === "kebab") {
          const words = splitIdentifierWords(base).map((w) => w.toLowerCase());
          if (words.length) nextBase = words.join("-");
        } else if (spec.style === "camel") {
          const words = splitIdentifierWords(base).map((w) => w.toLowerCase());
          if (words.length) nextBase = words[0]! + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
        } else {
          nextBase = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
        }
        break;
      }
      case "affix": {
        const padded = String(index + 1).padStart(2, "0");
        const pre = expandRenameTokens(spec.prefix ?? "", base, ext, padded, index);
        const suf = expandRenameTokens(spec.suffix ?? "", base, ext, padded, index);
        nextBase = `${pre}${base}${suf}`;
        break;
      }
    }
    return {
      from,
      to: nextBase + ext,
      changed: nextBase + ext !== from,
      error: customError ?? (nextBase.trim() === "" ? "The new name would be empty." : null),
    };
  });
  const finalNames = new Map<string, number>();
  for (const r of rows) finalNames.set(platform === "win32" || platform === "darwin" ? r.to.toLowerCase() : r.to, (finalNames.get(platform === "win32" || platform === "darwin" ? r.to.toLowerCase() : r.to) ?? 0) + 1);
  const existingKeys = new Set([...existing].map((n) => (platform === "win32" || platform === "darwin" ? n.toLowerCase() : n)));
  for (const r of rows) {
    if (!r.changed) continue;
    const key = platform === "win32" || platform === "darwin" ? r.to.toLowerCase() : r.to;
    r.error = r.error ?? validateName(r.to, platform) ?? (finalNames.get(key)! > 1 ? "Two items would get this same name." : existingKeys.has(key) ? "An item with this name already exists." : null);
  }
  return rows;
}

/** Previews (`apply = false`) or atomically executes (`apply = true`) a bulk rename of `namesInput` inside `folderInput` using temporary staging names. */
export async function bulkRename(ctx: FmContext, folderInput: unknown, namesInput: unknown, spec: BulkSpec, apply: boolean): Promise<{ rows: BulkRow[]; applied: boolean }> {
  const folder = absolutePath(ctx, folderInput);
  await assertFolder(folder, "That folder");
  if (!Array.isArray(namesInput) || namesInput.length === 0 || namesInput.some((n) => typeof n !== "string")) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const p = pathApi(ctx);
  const names = namesInput as string[];
  if (names.some((n) => n !== p.basename(n))) throw new FmError("BAD_REQUEST", "Only names inside the folder can be renamed together.");
  const inFolder = await namesIn(folder);
  const renamed = new Set(names);
  const existing = new Set([...inFolder].filter((n) => !renamed.has(n)));
  const rows = planBulkRename(names, spec, existing, ctx.platform);
  if (!apply) return { rows, applied: false };
  if (rows.some((r) => r.error)) throw new FmError("BAD_NAME", "Some of the new names can't be used. Fix them first.");
  for (const r of rows) assertModifiable(ctx, p.join(folder, r.from));
  const changed = rows.filter((r) => r.changed);
  // Two steps through temporary names, so swapping names (a to b, b to a) can't clash half-way.
  const staged: Array<{ temp: string; row: BulkRow; finished: boolean }> = [];
  try {
    for (const row of changed) {
      const temp = p.join(folder, `.fm-bulk-${randomBytes(6).toString("hex")}`);
      await fsp.rename(p.join(folder, row.from), temp);
      staged.push({ temp, row, finished: false });
    }
    for (const s of staged) {
      await fsp.rename(s.temp, p.join(folder, s.row.to));
      s.finished = true;
    }
  } catch (err) {
    // Put everything back the way it was, whichever step each item had reached.
    for (const s of staged) await fsp.rename(s.finished ? p.join(folder, s.row.to) : s.temp, p.join(folder, s.row.from)).catch(() => {});
    throw err;
  }
  return { rows, applied: true };
}
