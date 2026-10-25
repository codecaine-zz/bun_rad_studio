/**
 * Applying an operation plan (see fmPlan.ts) and undoing it.
 *
 * Every item is one step of a queued job (fmJobs.ts), so it can finish, fail, be skipped or be cancelled on its own and
 * "Retry" runs only the items that did not finish. Before each item runs, what the preview assumed is checked again:
 *  - the source must still exist and look the same (same kind, size and modified time), or the item fails with
 *    "changed after the preview" instead of acting on something the person never reviewed;
 *  - a destination that was free in the preview but is taken now leaves the item alone ("appeared after the preview");
 *  - a destination that the preview said would be replaced must still be the same item.
 *
 * Renames run in an order that never clashes. Names that swap or move in a cycle (a to b, b to a) are done together in
 * one step through temporary names, and are put back as they were if any of them fails.
 *
 * Undo only reverses what finished, only while the app stays open, and refuses an item that was changed afterwards.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import { assertCreatable, assertModifiable, lstatOrNull, moveTree, pathApi, type FmContext } from "./fmCore";
import { transferStep, undoReplace } from "./fmFileOps";
import { StepSkip, type JobSpec, type JobStepSpec, type JobView, type StepProgress } from "./fmJobs";
import { renameItem } from "./fmOps";
import { FmError, describeFsError } from "./fmPaths";
import { deletePermanently, moveToTrash, restoreFromTrash } from "./fmTrash";
import { fingerprint, findPlan, sameFingerprint, viewOf, type PlanItemInternal, type PlanRecord, type PlanView, type UndoEntry } from "./fmPlan";

export interface ApplyRequest {
  /** The person looked at the preview and agrees. Required when something is replaced or deleted. */
  approved?: unknown;
  /** Required in addition when something is deleted for good. */
  confirmPermanent?: unknown;
  /** Item ids the person took out of the plan. */
  exclude?: unknown;
}

const base = (ctx: FmContext, path: string | null) => (path ? pathApi(ctx).basename(path) : "");

async function recheckSource(ctx: FmContext, item: PlanItemInternal): Promise<void> {
  const name = base(ctx, item.source);
  const now = await fingerprint(item.source!);
  if (!now) throw new FmError("NOT_FOUND", `"${name}" no longer exists. It may have been moved or deleted by another program since the preview.`);
  if (!sameFingerprint(now, item.srcFp)) throw new FmError("CHANGED", `"${name}" changed after the preview (its size, date or kind is different now), so it was left alone. Preview the operation again to review it.`);
}

async function recheckDestination(ctx: FmContext, item: PlanItemInternal): Promise<void> {
  const name = base(ctx, item.destination);
  const now = await fingerprint(item.destination!);
  if (item.replaces) {
    if (!now) return;
    if (!sameFingerprint(now, item.destFp)) throw new FmError("CHANGED", `The existing "${name}" changed after the preview, so it was not replaced. Preview the operation again to review it.`);
    return;
  }
  if (now) throw new StepSkip(`Left alone: "${name}" appeared at the destination after the preview, and nothing is overwritten without being shown first.`);
}

function remember(plan: PlanRecord, item: PlanItemInternal, entry: Omit<UndoEntry, "action" | "source" | "destination" | "afterFp"> & { afterFp: UndoEntry["afterFp"] }): void {
  plan.undoLog.set(item.id, { action: item.action, source: item.source, destination: item.destination, ...entry });
}

function describe(err: unknown, what: string): Error {
  if (err instanceof FmError || err instanceof StepSkip) return err;
  return new Error(describeFsError(err, what).message);
}

function withRecording(progress: StepProgress, record: (patch: Parameters<StepProgress["item"]>[0]) => void): StepProgress {
  return { ...progress, item: (patch) => { record(patch); progress.item(patch); } };
}

function transferPlanStep(ctx: FmContext, plan: PlanRecord, item: PlanItemInternal): JobStepSpec {
  const p = pathApi(ctx);
  const dest = item.destination!;
  const inner = transferStep(ctx, item.action as "copy" | "move", item.source!, p.dirname(dest), item.replaces ? "replace" : "skip", p.basename(dest));
  return {
    ...inner,
    label: `${p.basename(item.source!)} → ${dest}`,
    item: { source: item.source!, destination: dest },
    prepare: async () => {
      const prepared = await inner.prepare!();
      return {
        ...prepared,
        work: async (signal, log, progress) => {
          await recheckSource(ctx, item);
          await recheckDestination(ctx, item);
          if (item.makeParents) {
            assertCreatable(ctx, p.dirname(dest));
            await fsp.mkdir(p.dirname(dest), { recursive: true });
          }
          let replacedTrashId: string | undefined;
          await prepared.work!(signal, log, withRecording(progress, (patch) => { if (patch.replacedTrashId) replacedTrashId = patch.replacedTrashId; }));
          remember(plan, item, { replacedTrashId, afterFp: await fingerprint(dest) });
        },
      };
    },
  };
}

function createStep(ctx: FmContext, plan: PlanRecord, item: PlanItemInternal): JobStepSpec {
  const dest = item.destination!;
  return {
    label: `New folder ${base(ctx, dest)}`,
    item: { source: dest },
    keepFinishedOnCancel: true,
    prepare: async () => ({
      work: async (_signal, _log, progress) => {
        try {
          await recheckDestination(ctx, item);
          assertCreatable(ctx, pathApi(ctx).dirname(dest));
          await fsp.mkdir(dest, { recursive: true });
          progress.item({ destination: dest });
          progress.files(1);
          remember(plan, item, { afterFp: await fingerprint(dest) });
        } catch (err) {
          throw describe(err, "make that folder");
        }
      },
    }),
  };
}

function deleteStep(ctx: FmContext, plan: PlanRecord, item: PlanItemInternal): JobStepSpec {
  const source = item.source!;
  return {
    label: `${item.permanent ? "Delete" : "Recycle"} ${base(ctx, source)}`,
    item: { source },
    keepFinishedOnCancel: true,
    prepare: async () => ({
      work: async (_signal, _log, progress) => {
        try {
          await recheckSource(ctx, item);
          const [result] = item.permanent ? await deletePermanently(ctx, [source]) : await moveToTrash(ctx, [source]);
          if (!result || !result.ok) throw new FmError(result && !result.ok ? result.code : "FAILED", result && !result.ok ? result.message : "The item couldn't be deleted.");
          progress.item({ destination: null, bytes: item.bytes, files: 1 });
          progress.files(1);
          if (!item.permanent) remember(plan, item, { trashId: (result.value as unknown as { id: string }).id, afterFp: null });
        } catch (err) {
          throw describe(err, "delete that");
        }
      },
    }),
  };
}

function renameStep(ctx: FmContext, plan: PlanRecord, item: PlanItemInternal): JobStepSpec {
  const old = base(ctx, item.source);
  const name = base(ctx, item.destination);
  return {
    label: `${old} → ${name}`,
    item: { source: item.source! },
    keepFinishedOnCancel: true,
    prepare: async () => ({
      work: async (_signal, _log, progress) => {
        try {
          await recheckSource(ctx, item);
          const r = await renameItem(ctx, item.source, name);
          progress.item({ destination: r.to });
          progress.files(1);
          remember(plan, item, { afterFp: await fingerprint(r.to) });
        } catch (err) {
          throw describe(err, "rename that");
        }
      },
    }),
  };
}

/** Renames many items through temporary names, so names that swap can't clash half-way. Everything is put back if one fails. */
export async function stageRenames(ctx: FmContext, pairs: Array<{ from: string; to: string }>): Promise<void> {
  const p = pathApi(ctx);
  const staged: Array<{ temp: string; pair: { from: string; to: string }; finished: boolean }> = [];
  try {
    for (const pair of pairs) {
      const temp = p.join(p.dirname(pair.from), `.fm-plan-${randomBytes(6).toString("hex")}`);
      await fsp.rename(pair.from, temp);
      staged.push({ temp, pair, finished: false });
    }
    for (const s of staged) {
      if (await lstatOrNull(s.pair.to)) throw new FmError("EXISTS", `"${p.basename(s.pair.to)}" is already taken.`);
      await fsp.rename(s.temp, s.pair.to);
      s.finished = true;
    }
  } catch (err) {
    for (const s of staged) await fsp.rename(s.finished ? s.pair.to : s.temp, s.pair.from).catch(() => {});
    throw err;
  }
}

function renameGroupStep(ctx: FmContext, plan: PlanRecord, items: PlanItemInternal[]): JobStepSpec {
  return {
    label: `Swap or rotate the names of ${items.length} items`,
    item: { source: items[0]!.source! },
    keepFinishedOnCancel: true,
    prepare: async () => ({
      work: async (_signal, _log, progress) => {
        try {
          for (const item of items) { await recheckSource(ctx, item); assertModifiable(ctx, item.source!); }
          await stageRenames(ctx, items.map((i) => ({ from: i.source!, to: i.destination! })));
          for (const item of items) remember(plan, item, { afterFp: await fingerprint(item.destination!) });
          progress.item({ destination: items[0]!.destination });
          progress.files(items.length);
        } catch (err) {
          throw describe(err, "rename those");
        }
      },
    }),
  };
}

/** Renames in an order where each new name is free when it is used; whatever is left (swaps and rotations) is one group. */
function orderRenames(ctx: FmContext, items: PlanItemInternal[]): Array<PlanItemInternal | PlanItemInternal[]> {
  const pending = new Set(items);
  const out: Array<PlanItemInternal | PlanItemInternal[]> = [];
  const insensitive = ctx.platform === "win32" || ctx.platform === "darwin";
  const key = (s: string) => (insensitive ? s.toLowerCase() : s);
  const sourceCounts = new Map<string, number>();
  for (const i of pending) {
    const k = key(i.source!);
    sourceCounts.set(k, (sourceCounts.get(k) ?? 0) + 1);
  }
  let progressed = true;
  while (pending.size && progressed) {
    progressed = false;
    for (const item of pending) {
      const dstKey = key(item.destination!);
      const srcKey = key(item.source!);
      if ((sourceCounts.get(dstKey) ?? 0) === 0 || dstKey === srcKey) {
        out.push(item);
        pending.delete(item);
        const rem = (sourceCounts.get(srcKey) ?? 1) - 1;
        if (rem <= 0) sourceCounts.delete(srcKey);
        else sourceCounts.set(srcKey, rem);
        progressed = true;
      }
    }
  }
  if (pending.size) out.push([...pending]);
  return out;
}

/** Checks the approvals, queues every item of the plan and returns the job. The plan can be applied only once. */
export async function applyPlan(ctx: FmContext, id: unknown, request: ApplyRequest = {}): Promise<{ plan: PlanView; job: JobView }> {
  const plan = findPlan(ctx, id);
  if (plan.applied) throw new FmError("ALREADY_APPLIED", "That preview was already applied.");
  const exclude = new Set(Array.isArray(request.exclude) ? request.exclude.filter((n): n is number => Number.isInteger(n)) : []);
  for (const item of plan.items) {
    if (exclude.has(item.id) && item.action !== "skip") {
      item.action = "skip"; item.replaces = false; item.reason = "Left out by you."; item.issues = [];
    }
  }
  const view = viewOf(plan);
  if (!view.canApply) throw new FmError("NOTHING_TO_DO", "Nothing in this preview can be done.");
  if (view.needsApproval && request.approved !== true) throw new FmError("APPROVAL_REQUIRED", "This changes or deletes existing items. Look at the preview and approve it first.");
  if (view.needsPermanentApproval && request.confirmPermanent !== true) throw new FmError("APPROVAL_REQUIRED", "Some items are deleted for good and can't be brought back. Confirm that first.");

  const live = plan.items.filter((i) => i.action !== "skip");
  const steps: JobStepSpec[] = [];
  const stepItems: PlanItemInternal[] = [];
  const push = (step: JobStepSpec, item: PlanItemInternal) => { steps.push(step); stepItems.push(item); };
  for (const item of live.filter((i) => i.action === "create")) push(createStep(ctx, plan, item), item);
  for (const item of live.filter((i) => i.action === "copy" || i.action === "move")) push(transferPlanStep(ctx, plan, item), item);
  for (const entry of orderRenames(ctx, live.filter((i) => i.action === "rename"))) {
    if (Array.isArray(entry)) push(renameGroupStep(ctx, plan, entry), entry[0]!);
    else push(renameStep(ctx, plan, entry), entry);
  }
  for (const item of live.filter((i) => i.action === "delete")) push(deleteStep(ctx, plan, item), item);

  const kinds = new Set(live.map((i) => i.action));
  const only = kinds.size === 1 ? [...kinds][0]! : "mixed";
  const spec: JobSpec = { kind: only === "copy" || only === "move" || only === "rename" || only === "delete" ? only : "mixed", title: plan.title, retryable: true, steps };
  plan.applied = true;
  const job = ctx.jobs.start(spec);
  plan.jobId = job.id;
  return { plan: viewOf(plan), job };
}

// ---------------------------------------------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------------------------------------------

export interface UndoResult {
  ok: boolean;
  path: string;
  message: string;
}

async function putBack(ctx: FmContext, entry: UndoEntry): Promise<void> {
  const name = base(ctx, entry.destination ?? entry.source);
  if (entry.action === "delete") {
    const [r] = await restoreFromTrash(ctx, [entry.trashId]);
    if (!r || !r.ok) throw new FmError("RESTORE_FAILED", r && !r.ok ? r.message : `"${name}" couldn't be restored from the Recycle Bin.`);
    return;
  }
  const now = await fingerprint(entry.destination!);
  if (!now) throw new FmError("NOT_FOUND", `"${name}" is no longer there.`);
  if (!sameFingerprint(now, entry.afterFp)) throw new FmError("CHANGED", `"${name}" was changed after the operation, so Undo left it alone.`);
  if (entry.action === "copy") {
    const [r] = await moveToTrash(ctx, [entry.destination]);
    if (!r || !r.ok) throw new FmError("TRASH_FAILED", r && !r.ok ? r.message : `The copy "${name}" couldn't be removed.`);
  } else if (entry.action === "create") {
    await fsp.rmdir(entry.destination!).catch(() => { throw new FmError("NOT_EMPTY", `The folder "${name}" has something in it now, so Undo left it alone.`); });
  } else {
    if (await lstatOrNull(entry.source!)) throw new FmError("EXISTS", `Something is already at the original place of "${name}", so it was not moved back.`);
    try { await fsp.rename(entry.destination!, entry.source!); }
    catch (err: any) { if (err?.code !== "EXDEV") throw err; await moveTree(entry.destination!, entry.source!); }
  }
  if (entry.replacedTrashId) {
    const note = await undoReplace(ctx, entry.replacedTrashId);
    if (!/put back/.test(note)) throw new FmError("RESTORE_FAILED", `The item that was replaced is still in the Recycle Bin: restore it from there.`);
  }
}

/** Reverses what the plan did, item by item. Items that cannot be reversed safely are reported and left as they are. */
export async function undoPlan(ctx: FmContext, id: unknown): Promise<{ plan: PlanView; results: UndoResult[] }> {
  const plan = findPlan(ctx, id);
  if (!plan.applied) throw new FmError("NOT_APPLIED", "That operation was never applied.");
  const job = ctx.jobs.list().find((j) => j.id === plan.jobId);
  if (job && (job.state === "running" || job.state === "waiting")) throw new FmError("STILL_RUNNING", "Wait for the operation to finish (or cancel it) before undoing it.");
  if (!plan.undoLog.size) throw new FmError("NOTHING_TO_UNDO", "There is nothing to undo: nothing finished, or it was already undone.");
  const results: UndoResult[] = [];
  const entries = [...plan.undoLog.entries()].sort((a, b) => b[0] - a[0]);
  const renames = entries.filter(([, e]) => e.action === "rename");
  const rest = entries.filter(([, e]) => e.action !== "rename");

  if (renames.length) {
    try {
      for (const [, e] of renames) {
        const now = await fingerprint(e.destination!);
        if (!now) throw new FmError("NOT_FOUND", `"${base(ctx, e.destination)}" is no longer there.`);
        if (!sameFingerprint(now, e.afterFp)) throw new FmError("CHANGED", `"${base(ctx, e.destination)}" was changed after the operation, so Undo left the renames alone.`);
      }
      await stageRenames(ctx, renames.map(([, e]) => ({ from: e.destination!, to: e.source! })));
      for (const [i, e] of renames) { plan.undoLog.delete(i); results.push({ ok: true, path: e.source!, message: `Renamed back to "${base(ctx, e.source)}".` }); }
    } catch (err) {
      const message = err instanceof FmError ? err.message : describeFsError(err, "undo that").message;
      for (const [, e] of renames) results.push({ ok: false, path: e.destination!, message });
    }
  }
  for (const [i, e] of rest) {
    try {
      await putBack(ctx, e);
      plan.undoLog.delete(i);
      results.push({ ok: true, path: e.destination ?? e.source ?? "", message: e.action === "delete" ? "Restored from the Recycle Bin." : e.action === "copy" ? "The copy went to the Recycle Bin." : e.action === "create" ? "The new folder was removed." : "Moved back." });
    } catch (err) {
      results.push({ ok: false, path: e.destination ?? e.source ?? "", message: err instanceof FmError ? err.message : describeFsError(err, "undo that").message });
    }
  }
  plan.undone = plan.undoLog.size === 0;
  return { plan: viewOf(plan), results };
}
