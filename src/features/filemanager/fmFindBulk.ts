/**
 * The Find tool's actions on a set of results: copy, move, Recycle Bin, delete, archive, export, run a command,
 * change permissions and batch rename. Each one reuses the File Manager's own functions, so the same
 * protections (system folders, the Recycle Bin, never overwriting) apply here too.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import { parseMode, type RenameRules } from "../../../applications/fd_ops";
import { absolutePath, assertFolder, assertModifiable, eachItem, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { copyItems, moveItems, renameItem, type Policy } from "./fmOps";
import { FmError, describeFsError } from "./fmPaths";
import { deletePermanently, moveToTrash } from "./fmTrash";
import { archiveFormat, archivePaths } from "./fmFindArchive";
import { MAX_EXPORT_TEXT, exportFormat, formatResults, saveNewFile } from "./fmFindExport";
import { planExec, runExec } from "./fmFindExec";
import { dropNested, resolveTargets } from "./fmFindQuery";
import { runWorkerJob } from "./fmFindRun";
import { MAX_PATHS } from "./fmFindShared";

type Outcome<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

const needConfirm = (b: Record<string, any>, what: string) => {
  if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", `${what} needs to be confirmed.`);
};

/** How a batch went, small enough to send back: counts, the first few problems, and what was done. */
function tally<T>(paths: string[], results: Outcome<T>[], isSkipped: (v: T) => boolean = () => false) {
  let done = 0;
  let skipped = 0;
  const errors: Array<{ path: string; message: string }> = [];
  let failed = 0;
  results.forEach((r, i) => {
    if (!r.ok) {
      failed++;
      if (errors.length < 50) errors.push({ path: paths[i] ?? "", message: r.message });
    } else if (isSkipped(r.value)) skipped++;
    else done++;
  });
  return { done, skipped, failed, errors };
}

const policyOf = (v: unknown): Policy => (v === "replace" || v === "skip" ? v : "rename");

async function transferOp(ctx: FmContext, b: Record<string, any>, copying: boolean) {
  const targets = await resolveTargets(ctx, b);
  const paths = dropNested(targets.paths, ctx.platform);
  const policy = policyOf(b.policy);
  const results = await (copying ? copyItems : moveItems)(ctx, paths, b.dest, policy);
  const pairs: Array<{ from: string; to: string }> = [];
  for (const r of results) if (r.ok && r.value.destination && pairs.length < MAX_PATHS) pairs.push({ from: r.value.source, to: r.value.destination });
  const replaced = results.flatMap((r) => (r.ok && r.value.replaced ? [r.value.replaced] : []));
  return { ...tally(paths, results, (v) => v.status === "skipped"), pairs, replaced };
}

function clampText(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function renameRules(b: Record<string, any>): RenameRules {
  const r = (b.rules && typeof b.rules === "object" ? b.rules : {}) as Record<string, any>;
  const caseMode = r.caseMode === "lower" || r.caseMode === "upper" || r.caseMode === "title" ? r.caseMode : "none";
  return {
    find: clampText(r.find, 200),
    replace: clampText(r.replace, 200),
    useRegex: r.useRegex === true,
    prefix: clampText(r.prefix, 100),
    suffix: clampText(r.suffix, 100),
    caseMode,
    numbering: r.numbering === true,
    spacesToUnderscore: r.spacesToUnderscore === true,
  };
}

interface PlanRow {
  from: string;
  to: string;
  oldName: string;
  newName: string;
  changed: boolean;
  error?: string;
}

/**
 * Previews, or with `apply: true` does, the batch rename. Names are worked out by the plan (in a worker, since a
 * regular expression can be slow), and applied through the File Manager's own rename in two steps, so names can
 * move around among the items (a to b and b to c) without clashing.
 */
async function renamePlanOp(ctx: FmContext, b: Record<string, any>) {
  const targets = await resolveTargets(ctx, b);
  const rows = await runWorkerJob<PlanRow[]>(ctx, { kind: "renameplan", paths: targets.paths, rules: renameRules(b), platform: ctx.platform });
  const p = pathApi(ctx);
  const changed = rows.filter((r) => r.changed);
  for (const r of changed) {
    if (r.error) continue;
    try {
      assertModifiable(ctx, r.from);
    } catch (err) {
      r.error = describeFsError(err).message;
    }
  }
  const summary = {
    total: rows.length,
    changed: changed.length,
    conflicts: changed.filter((r) => r.error).length,
    rows: changed.slice(0, 2000),
  };
  if (b.apply !== true) return { applied: false, ...summary };

  const todo = changed.filter((r) => !r.error);
  if (todo.length === 0) throw new FmError("NOTHING_TO_DO", changed.length ? "None of the new names can be used. Check the preview to see why." : "No names would change.");
  const staged: Array<{ row: PlanRow; temp: string }> = [];
  const failed: Array<{ path: string; message: string }> = [];
  for (const row of todo) {
    try {
      const { to } = await renameItem(ctx, row.from, `.fm-find-${randomBytes(5).toString("hex")}`);
      staged.push({ row, temp: to });
    } catch (err) {
      failed.push({ path: row.from, message: describeFsError(err, "rename that").message });
    }
  }
  const renamed: Array<{ from: string; to: string }> = [];
  for (const { row, temp } of staged) {
    try {
      const done = await renameItem(ctx, temp, row.newName);
      renamed.push({ from: row.from, to: done.to });
    } catch (err) {
      let message = describeFsError(err, "rename that").message;
      try {
        await renameItem(ctx, temp, p.basename(row.from));
      } catch {
        message += ` It is now called "${p.basename(temp)}" in the same folder.`;
      }
      failed.push({ path: row.from, message });
    }
  }
  return { applied: true, ...summary, renamed, failed: failed.slice(0, 50), failedCount: failed.length };
}

async function chmodOp(ctx: FmContext, b: Record<string, any>) {
  if (ctx.platform === "win32") throw new FmError("UNSUPPORTED", "Permissions work differently on Windows, so they can't be changed here.");
  // Either one mode for the chosen items, or a list of { path, mode } (what Undo sends to put old modes back).
  let wanted: Array<{ path: string; mode: number }>;
  if (Array.isArray(b.modes)) {
    if (b.modes.length === 0 || b.modes.length > MAX_PATHS) throw new FmError("BAD_REQUEST", "Nothing was selected.");
    wanted = b.modes.map((m: any) => ({ path: absolutePath(ctx, m?.path), mode: modeOf(m?.mode) }));
  } else {
    const mode = modeOf(b.mode);
    wanted = (await resolveTargets(ctx, b)).paths.map((path) => ({ path, mode }));
  }
  const results = await eachItem(
    wanted,
    async ({ path, mode }) => {
      assertModifiable(ctx, path);
      const st = await fsp.lstat(path);
      if (st.isSymbolicLink()) throw new FmError("IS_LINK", "This is a link. Change the permissions of the item it points to instead.");
      const before = (st.mode & 0o777).toString(8).padStart(3, "0");
      await fsp.chmod(path, mode);
      return { path, before, after: mode.toString(8).padStart(3, "0") };
    },
    (err) => describeFsError(err, "change the permissions of that"),
  );
  const changed = results.flatMap((r) => (r.ok ? [r.value] : []));
  return { ...tally(wanted.map((w) => w.path), results), changed };
}

/** "644", "0755" or "rwxr-xr-x". Only the nine ordinary permission bits are used (no setuid and the like). */
function modeOf(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) throw new FmError("BAD_MODE", "Type the permissions, like 644 or rwxr-xr-x.");
  try {
    return parseMode(value) & 0o777;
  } catch {
    throw new FmError("BAD_MODE", "Use three digits like 644 or 755, or letters like rwxr-xr-x.");
  }
}

export const bulkOperations: Record<string, FmHandler> = {
  async "find/copy"(ctx, b) {
    return await transferOp(ctx, b, true);
  },
  async "find/move"(ctx, b) {
    return await transferOp(ctx, b, false);
  },
  async "find/trash"(ctx, b) {
    const paths = dropNested((await resolveTargets(ctx, b)).paths, ctx.platform);
    const results = await moveToTrash(ctx, paths);
    return { ...tally(paths, results), trashed: results.flatMap((r) => (r.ok ? [{ path: r.value.path, id: r.value.id }] : [])) };
  },
  async "find/delete"(ctx, b) {
    needConfirm(b, "Deleting for good");
    const paths = dropNested((await resolveTargets(ctx, b)).paths, ctx.platform);
    return tally(paths, await deletePermanently(ctx, paths));
  },
  async "find/archive"(ctx, b) {
    const targets = await resolveTargets(ctx, b);
    return await archivePaths(ctx, targets.paths, archiveFormat(b.format), b.dest, b.name);
  },
  async "find/export"(ctx, b) {
    const format = exportFormat(b.format);
    const { items } = await resolveTargets(ctx, b, { needItems: true });
    if (items.length === 0) throw new FmError("NOTHING_TO_DO", "None of those items exist any more. Search again.");
    const text = formatResults(items, format);
    if (b.dest !== undefined && b.dest !== null && b.dest !== "") return { count: items.length, format, saved: await saveNewFile(ctx, b.dest, format, text, b.name) };
    if (text.length > MAX_EXPORT_TEXT) throw new FmError("TOO_BIG", "That's too much text to copy at once. Save it to a folder instead.");
    return { count: items.length, format, text };
  },
  async "find/exec"(ctx, b) {
    needConfirm(b, "Running a command");
    const targets = await resolveTargets(ctx, b);
    const plan = planExec(b.template, targets.paths, b.mode === "each" ? "each" : "batch", ctx.platform);
    const cwd = b.cwd ? absolutePath(ctx, b.cwd) : (targets.root ?? ctx.home);
    await assertFolder(cwd, "The folder to run in");
    return await runExec(ctx, plan, cwd);
  },
  async "find/chmod"(ctx, b) {
    return await chmodOp(ctx, b);
  },
  async "find/renameplan"(ctx, b) {
    return await renamePlanOp(ctx, b);
  },
}