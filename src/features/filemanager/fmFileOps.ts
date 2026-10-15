/**
 * Copy, move and rename as queued jobs (see fmJobs.ts for the queue and fmOpHistory.ts for the history).
 *
 * Every item is one step, so each can finish, fail, be skipped or be cancelled on its own, and Retry runs only the items
 * that did not finish. The rules below are covered by tests (tests/file_manager_fileops.test.ts):
 *
 *  - Nothing is overwritten silently. The same-name policy is applied when the item runs (not only when it was queued):
 *    "rename" keeps both, "skip" leaves the item alone, "replace" sends the old item to the Recycle Bin first, so it can
 *    be brought back. If the transfer then fails or is cancelled, the old item is restored from the bin.
 *  - Each item is all or nothing. Cancel stops a copy part-way and removes the partial copy; an item that was already
 *    finished stays finished, and items that had not started are reported as "not started". Moves on one disk are a
 *    single rename, so they cannot be cut in half.
 *  - A move across disks copies first and removes the original only after the whole copy succeeded. If the original
 *    cannot be removed, both copies are kept and the step fails with PARTIAL_MOVE: Retry would make another copy, so the
 *    message tells the person to remove the original themselves.
 *  - A file that changes while it is being copied makes that item fail instead of producing a mixed copy.
 *  - Links are copied as links, never followed; anything that is not a regular file, folder or link (a pipe, a socket)
 *    is refused instead of being read.
 *  - Progress is by files and bytes when the sources could be measured. When they could not (unreadable folder, too
 *    many entries) the totals stay null and the page shows item counts only.
 *
 * Archive and conversion jobs can use the same `JobSpec` pieces (`item`, `measure`, `progress`, retryable); nothing
 * here is specific to copying except the step bodies.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertCreatable, assertFolder, assertModifiable, assertNotIntoItself, lstatOrNull, pathApi, type FmContext } from "./fmCore";
import { renameItem, resolveTarget, type Policy } from "./fmOps";
import { FmError, describeFsError } from "./fmPaths";
import { restoreFromTrash } from "./fmTrash";
import { StepSkip, type ItemSize, type JobSpec, type JobStepSpec, type JobView, type StepProgress } from "./fmJobs";

export const MAX_ITEMS_PER_OPERATION = 5000;
const MEASURE_LIMIT = 200_000;
const CHUNK = 1024 * 1024;

export type TransferMode = "copy" | "move";

const word = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Counts the files and bytes under `source` (links count as one small file), or null when that can't be known. */
export async function measureTree(source: string, signal: AbortSignal, limit = MEASURE_LIMIT): Promise<ItemSize | null> {
  let files = 0;
  let bytes = 0;
  let seen = 0;
  const walk = async (path: string): Promise<boolean> => {
    signal.throwIfAborted();
    if (++seen > limit) return false;
    const st = await fsp.lstat(path);
    if (st.isDirectory()) {
      for (const name of await fsp.readdir(path)) if (!(await walk(nodePath.join(path, name)))) return false;
    } else {
      files++;
      if (st.isFile()) bytes += st.size;
    }
    return true;
  };
  try {
    return (await walk(source)) ? { files, bytes } : null;
  } catch (err) {
    if (signal.aborted) throw err;
    return null;
  }
}

interface CopyState {
  /** Set once the top-level destination exists because of this copy: only then may it be removed after a failure. */
  created: boolean;
}

async function copyFileWithProgress(source: string, destination: string, signal: AbortSignal, progress: StepProgress, state: CopyState | null): Promise<void> {
  const before = await fsp.lstat(source);
  const reader = await fsp.open(source, "r");
  try {
    const writer = await fsp.open(destination, "wx", before.mode & 0o7777);
    if (state) state.created = true;
    try {
      const buffer = Buffer.allocUnsafe(CHUNK);
      while (true) {
        signal.throwIfAborted();
        const { bytesRead } = await reader.read(buffer, 0, CHUNK, null);
        if (bytesRead === 0) break;
        await writer.write(buffer, 0, bytesRead);
        progress.bytes(bytesRead);
      }
    } finally {
      await writer.close();
    }
  } finally {
    await reader.close();
  }
  const after = await fsp.lstat(source);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new FmError("CHANGED", "This file changed while it was being copied, so the copy was thrown away. Try again when nothing is writing to it.");
  await fsp.utimes(destination, before.atime, before.mtime).catch(() => {});
  progress.files(1);
}

/** Copies a file, folder or link to a path that does not exist yet, reporting progress and honouring `signal`. */
export async function copyWithProgress(source: string, destination: string, signal: AbortSignal, progress: StepProgress, state: CopyState = { created: false }, top = true): Promise<void> {
  signal.throwIfAborted();
  const st = await fsp.lstat(source);
  if (st.isDirectory()) {
    await fsp.mkdir(destination, { mode: st.mode & 0o7777 });
    if (top) state.created = true;
    for (const name of await fsp.readdir(source)) await copyWithProgress(nodePath.join(source, name), nodePath.join(destination, name), signal, progress, state, false);
    await fsp.utimes(destination, st.atime, st.mtime).catch(() => {});
  } else if (st.isSymbolicLink()) {
    await fsp.symlink(await fsp.readlink(source), destination);
    if (top) state.created = true;
    progress.files(1);
  } else if (st.isFile()) {
    await copyFileWithProgress(source, destination, signal, progress, top ? state : null);
  } else {
    throw new FmError("NOT_REGULAR", `"${nodePath.basename(source)}" is a special file (a pipe, socket or device), so it was not copied.`);
  }
}

export async function undoReplace(ctx: FmContext, replacedTrashId: string | undefined): Promise<string> {
  if (!replacedTrashId) return "";
  const [back] = await restoreFromTrash(ctx, [replacedTrashId]).catch(() => [undefined]);
  return back && back.ok ? " The item that was in the way has been put back." : " The item that was in the way is in the Recycle Bin: open it there to restore it.";
}

/** One copy or move. `name` gives the item a different name in `destDir` (the plans use it for exact destinations). */
export function transferStep(ctx: FmContext, mode: TransferMode, source: string, destDir: string, policy: Policy, name?: string): JobStepSpec {
  const p = pathApi(ctx);
  let size: ItemSize | null = null;
  return {
    label: p.basename(source),
    item: { source },
    keepFinishedOnCancel: true,
    measure: async (signal) => (size = await measureTree(source, signal)),
    prepare: async () => ({
      work: async (signal, _log, progress) => {
        const verb = mode === "copy" ? "copy" : "move";
        let replacedTrashId: string | undefined;
        let state: CopyState = { created: false };
        let target: string | null = null;
        try {
          if (mode === "move") assertModifiable(ctx, source);
          assertCreatable(ctx, destDir);
          await assertFolder(destDir, "The destination");
          const st = await lstatOrNull(source);
          if (!st) throw new FmError("NOT_FOUND", `"${p.basename(source)}" no longer exists. It may have been moved or deleted by another program.`);
          if (st.isDirectory()) assertNotIntoItself(ctx, source, destDir);
          signal.throwIfAborted();
          const resolved = await resolveTarget(ctx, source, destDir, policy, mode === "copy", name);
          if (!resolved.target) {
            throw new StepSkip(mode === "move" && p.dirname(source) === destDir ? "Already in that folder." : "Left alone: something with that name is already there.");
          }
          target = resolved.target;
          replacedTrashId = resolved.replaced?.trashId;
          progress.item({ destination: target, replacedTrashId, bytes: size?.bytes ?? null, files: size?.files ?? null });
          if (signal.aborted) {
            const back = await undoReplace(ctx, replacedTrashId);
            progress.note(`Stopped before anything was ${verb === "copy" ? "copied" : "moved"}.${back}`);
            signal.throwIfAborted();
          }
          let renamed = false;
          if (mode === "move") {
            try {
              await fsp.rename(source, target);
              renamed = true;
            } catch (err: any) {
              if (err?.code !== "EXDEV") throw err;
            }
          }
          if (renamed) {
            if (size) progress.bytes(size.bytes);
            progress.files(size ? size.files : 1);
            return;
          }
          await copyWithProgress(source, target, signal, progress, state);
          if (mode === "move") {
            signal.throwIfAborted();
            try {
              await fsp.rm(source, { recursive: true, force: false });
            } catch {
              throw new FmError("PARTIAL_MOVE", `"${p.basename(source)}" was copied to the new place, but the original could not be removed. Both copies exist: remove the original yourself (retrying would make a third copy).`);
            }
          }
        } catch (err) {
          const partial = err instanceof FmError && err.code === "PARTIAL_MOVE";
          let note = "";
          if (!partial && target && state.created) {
            await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
            note = " The partly made copy was removed.";
          }
          if (!(err instanceof StepSkip) && !partial) {
            const back = await undoReplace(ctx, replacedTrashId);
            if (back) note += back;
          }
          if (signal.aborted) {
            progress.note(`Stopped part-way through "${p.basename(source)}".${note || " Nothing of it was kept."}`);
            throw err;
          }
          if (err instanceof StepSkip) throw err;
          const described = describeFsError(err, verb + " that");
          throw new Error(`${p.basename(source)}: ${described.message}${note}`);
        }
      },
    }),
  };
}

function checkedPolicy(value: unknown): Policy {
  return value === "replace" || value === "skip" ? value : "rename";
}

/** Queues a copy or move of `sources` into `dest`. Problems with the request itself throw; problems with an item are reported per item. */
export async function startTransfer(ctx: FmContext, mode: TransferMode, sourcesInput: unknown, destInput: unknown, policyInput?: unknown): Promise<JobView> {
  if (!Array.isArray(sourcesInput) || sourcesInput.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (sourcesInput.length > MAX_ITEMS_PER_OPERATION) throw new FmError("TOO_MANY", `That is more than ${MAX_ITEMS_PER_OPERATION} items at once. Do it in smaller groups.`);
  const destDir = absolutePath(ctx, destInput);
  await assertFolder(destDir, "The destination");
  assertCreatable(ctx, destDir);
  const policy = checkedPolicy(policyInput);
  const sources = sourcesInput.map((s) => absolutePath(ctx, s));
  const where = pathApi(ctx).basename(destDir) || destDir;
  const spec: JobSpec = {
    kind: mode,
    title: `${mode === "copy" ? "Copy" : "Move"} ${word(sources.length, "item")} to "${where}"`,
    retryable: true,
    steps: sources.map((s) => transferStep(ctx, mode, s, destDir, policy)),
  };
  return ctx.jobs.start(spec);
}

/** Queues renames: each `{ path, name }` gives one item a new name in its own folder. Never replaces an existing item. */
export async function startRenames(ctx: FmContext, itemsInput: unknown): Promise<JobView> {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (itemsInput.length > MAX_ITEMS_PER_OPERATION) throw new FmError("TOO_MANY", `That is more than ${MAX_ITEMS_PER_OPERATION} items at once. Do it in smaller groups.`);
  const p = pathApi(ctx);
  const items = itemsInput.map((i: { path?: unknown; name?: unknown }) => {
    const path = absolutePath(ctx, i?.path);
    if (typeof i?.name !== "string") throw new FmError("BAD_NAME", "Every item needs a new name.");
    return { path, name: i.name };
  });
  const steps: JobStepSpec[] = items.map(({ path, name }) => ({
    label: `${p.basename(path)} → ${name}`,
    item: { source: path },
    prepare: async () => ({
      work: async (_signal, _log, progress) => {
        try {
          const r = await renameItem(ctx, path, name);
          progress.item({ destination: r.to });
          progress.files(1);
        } catch (err) {
          throw new Error(`${p.basename(path)}: ${describeFsError(err, "rename that").message}`);
        }
      },
    }),
    keepFinishedOnCancel: true,
  }));
  return ctx.jobs.start({ kind: "rename", title: `Rename ${word(items.length, "item")}`, retryable: true, steps });
}
