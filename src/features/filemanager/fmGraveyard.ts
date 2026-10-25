/**
 * Burying, restoring and emptying: the three things that change what is in the Rip graveyard.
 *
 * Records come from `applications/rip_engine.ts` (same layout, ids and fields as Rip Studio and `bun run cli:rip`).
 * Order of events, so an interruption never loses anything:
 *   bury:    check the guards -> measure -> move the files into the graveyard -> write the record.
 *            (A crash between the last two leaves files without a record; Verify finds and re-records them.)
 *   restore: check the destination -> move the files out -> mark the record restored.
 *   empty:   delete the files -> remove the record.
 */
import { createHash } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { createGraveyardItem, isProtectedPath, newBurialId, type GraveyardItem, type RipFileType } from "../../../applications/rip_engine";
import { absolutePath, assertCreatable, assertFolder, assertModifiable, eachItem, lstatOrNull, pathApi, type FmContext } from "./fmCore";
import { graveyardHooksOf } from "./fmGraveyardHooks";
import { checkAbort, measureTree, placeTree, removeTree, type MoveEnv } from "./fmGraveyardMove";
import { assertWritable, claim, createRecorder, entriesDirOf, graveyardDirOf, payloadDirOf, payloadOf, readGrave, stagingDirOf, withManifest, type GraveState } from "./fmGraveyardStore";
import { FmError, describeFsError, isSameOrInside, uniqueName } from "./fmPaths";
import { moveToTrash } from "./fmTrash";

export type Outcome<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export const moveEnv = (ctx: FmContext, signal?: AbortSignal, progress?: MoveEnv["progress"]): MoveEnv => ({ signal, hooks: graveyardHooksOf(ctx), progress });

const SHA_LIMIT = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------------
// Bury
// ---------------------------------------------------------------------------------------------------------------

export interface BuryValue {
  path: string;
  id: string;
  name: string;
  type: RipFileType;
  sizeBytes: number;
  via: "rename" | "copy";
  warning?: string;
}

function protectionMessage(reason: string | undefined): string {
  if (reason && /graveyard/i.test(reason)) return "That is the graveyard itself (or inside it), so it can't be buried.";
  if (reason && /home/i.test(reason)) return "This is your home folder and can't be buried.";
  return "This is a system folder that your computer needs to work, so it can't be buried.";
}

/** The refusals, shared with Delete (the File Manager's own protected-path rules) plus the Rip engine's. Throws a plain-words FmError. */
export function assertBuryable(ctx: FmContext, path: string): void {
  assertModifiable(ctx, path);
  const dir = graveyardDirOf(ctx);
  const guard = isProtectedPath(path, { cwd: nodePath.dirname(path), graveyardDir: dir });
  if (guard.protected) throw new FmError("PROTECTED", protectionMessage(guard.reason));
  if (isSameOrInside(dir, path, ctx.platform)) throw new FmError("PROTECTED", "That folder contains the graveyard, so it can't be buried.");
}

async function sha256Of(file: string): Promise<string | undefined> {
  try {
    const handle = await fsp.open(file, "r");
    try {
      const hash = createHash("sha256");
      const buf = Buffer.allocUnsafe(64 * 1024);
      for (;;) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        if (bytesRead === 0) break;
        hash.update(buf.subarray(0, bytesRead));
      }
      return hash.digest("hex");
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

const typeOf = (st: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }): RipFileType => (st.isSymbolicLink() ? "symlink" : st.isDirectory() ? "directory" : st.isFile() ? "file" : "other");

type Recorder = ReturnType<typeof createRecorder>;

/** Buries one item (an absolute path the File Manager's guards accepted). */
export async function buryOne(ctx: FmContext, path: string, env: MoveEnv, recorder: Recorder): Promise<BuryValue> {
  assertBuryable(ctx, path);
  const dir = graveyardDirOf(ctx);
  const st = await fsp.lstat(path);
  const type = typeOf(st);
  const name = nodePath.basename(path);
  const metrics = await measureTree(path, env.signal);
  const sha256 = type === "file" && metrics.sizeBytes <= SHA_LIMIT ? await sha256Of(path) : undefined;
  checkAbort(env);

  let id = newBurialId();
  await fsp.mkdir(entriesDirOf(dir), { recursive: true, mode: 0o700 });
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.mkdir(payloadDirOf(dir, id), { mode: 0o700 });
      break;
    } catch (err: any) {
      if (err?.code !== "EEXIST" || attempt > 5) throw err;
      id = newBurialId();
    }
  }
  const stagingDir = nodePath.join(stagingDirOf(dir), id);
  let placed;
  try {
    placed = await placeTree(path, payloadOf(dir, { id, name }), nodePath.join(stagingDir, name), env);
  } catch (err) {
    await fsp.rmdir(payloadDirOf(dir, id)).catch(() => {});
    await fsp.rmdir(stagingDir).catch(() => {});
    throw err;
  }
  await fsp.rmdir(stagingDir).catch(() => {});
  await recorder.add(
    createGraveyardItem({ id, name, originalPath: path, cwd: nodePath.dirname(path), graveyardDir: dir, graveyardPath: payloadOf(dir, { id, name }), now: new Date(), type, mode: st.mode, sizeBytes: metrics.sizeBytes, fileCount: metrics.fileCount, sha256 }),
  );
  return { path, id, name, type, sizeBytes: metrics.sizeBytes, via: placed.via, ...(placed.warning ? { warning: placed.warning } : {}) };
}

export const describeBury = (err: unknown) => describeFsError(err, "bury that");

/** Buries each path in turn; one that fails (or is refused) doesn't stop the rest. */
export async function buryPaths(ctx: FmContext, paths: string[], env: MoveEnv): Promise<Array<Outcome<BuryValue>>> {
  const dir = graveyardDirOf(ctx);
  await assertWritable(dir);
  const recorder = createRecorder(dir, (await readGrave(dir)).buried.length > 5000 ? 25 : 1);
  try {
    return await eachItem(paths, (p) => buryOne(ctx, p, env, recorder), describeBury);
  } finally {
    await recorder.flush();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------------------------------------------

export type ConflictChoice = "ask" | "replace" | "rename" | "skip";

export interface RestoreOptions {
  /** A folder to restore into, instead of where each item came from. */
  to?: string;
  conflict: ConflictChoice;
  /** Create the original folder when it no longer exists. */
  makeFolders: boolean;
}

export interface RestoreValue {
  id: string;
  name: string;
  status: "done" | "skipped";
  restoredTo: string | null;
  replaced?: { path: string; trashId: string };
  warning?: string;
}

/** The files of an item, found only inside the graveyard. Null when they're gone. Refuses a folder that has been swapped for a link. */
export async function payloadStatus(dir: string, item: { id: string; name: string }): Promise<"ok" | "missing" | "unsafe"> {
  for (const folder of [entriesDirOf(dir), payloadDirOf(dir, item.id)]) {
    const st = await lstatOrNull(folder).catch(() => null);
    if (!st) return "missing";
    if (!st.isDirectory()) return "unsafe";
  }
  return (await lstatOrNull(payloadOf(dir, item))) ? "ok" : "missing";
}

/** Where an item would be restored to, and its folder. Throws the plain-words reasons it can't be. */
export async function restoreTarget(ctx: FmContext, item: GraveyardItem, to: string | undefined): Promise<{ parent: string; target: string }> {
  const p = pathApi(ctx);
  if (to) {
    const parent = absolutePath(ctx, to);
    await assertFolder(parent, "That destination");
    return { parent, target: p.join(parent, item.name) };
  }
  if (!item.originalPath || !nodePath.isAbsolute(item.originalPath)) throw new FmError("NO_ORIGIN", "This item came from a place that isn't known (it was found during a repair). Use “Restore to…” and choose a folder.");
  const target = p.resolve(item.originalPath);
  return { parent: p.dirname(target), target };
}

export async function restoreOne(ctx: FmContext, item: GraveyardItem, options: RestoreOptions, env: MoveEnv): Promise<RestoreValue> {
  const dir = graveyardDirOf(ctx);
  const p = pathApi(ctx);
  const status = await payloadStatus(dir, item);
  if (status === "unsafe") throw new FmError("UNSAFE", "This item's place in the graveyard isn't a normal folder, so it was left alone. Open Verify to see what is wrong.");
  if (status === "missing") throw new FmError("MISSING_FILES", "This item's files are no longer in the graveyard, so there is nothing to restore. Open Verify to tidy up the list.");
  const { parent, target } = await restoreTarget(ctx, item, options.to);
  assertCreatable(ctx, parent);
  if (isSameOrInside(parent, dir, ctx.platform)) throw new FmError("PROTECTED", "Items can't be restored into the graveyard.");
  const parentStat = await fsp.stat(parent).catch(() => null);
  if (parentStat && !parentStat.isDirectory()) throw new FmError("FOLDER_GONE", `The place it came from is now a file, not a folder (${parent}).`, { folder: parent });
  if (!parentStat) {
    if (!options.makeFolders) throw new FmError("FOLDER_GONE", `The folder it came from doesn't exist any more (${parent}).`, { folder: parent });
    await fsp.mkdir(parent, { recursive: true });
  }
  let finalTarget = target;
  let replaced: RestoreValue["replaced"];
  const existing = await lstatOrNull(target);
  if (existing) {
    if (options.conflict === "skip") return { id: item.id, name: item.name, status: "skipped", restoredTo: null };
    if (options.conflict === "ask") throw new FmError("CONFLICT", `Something named "${p.basename(target)}" is already in ${parent}. Choose Replace, Keep both or Skip.`, { path: target, existingIsDir: existing.isDirectory() });
    if (options.conflict === "rename") {
      const taken = new Set(await fsp.readdir(parent));
      finalTarget = p.join(parent, uniqueName(p.basename(target), (n) => taken.has(n)));
    } else {
      // Replace: what is there goes to the Recycle Bin first, so even this can be undone.
      assertModifiable(ctx, target);
      const [moved] = await moveToTrash(ctx, [target]);
      if (!moved || !moved.ok) throw new FmError(moved && !moved.ok ? moved.code : "TRASH_FAILED", moved && !moved.ok ? moved.message : "The item in the way couldn't be replaced.");
      replaced = { path: target, trashId: moved.value.id };
    }
  }
  const placed = await placeTree(payloadOf(dir, item), finalTarget, p.join(parent, `.rip-restoring-${item.id}`), env);
  await fsp.rmdir(payloadDirOf(dir, item.id)).catch(() => {});
  return { id: item.id, name: item.name, status: "done", restoredTo: finalTarget, ...(replaced ? { replaced } : {}), ...(placed.warning ? { warning: placed.warning } : {}) };
}

/** Marks restored items in the records. */
export async function markRestored(ctx: FmContext, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const gone = new Set(ids);
  await withManifest(graveyardDirOf(ctx), (m) => {
    for (const item of m.items) if (item && gone.has(item.id) && item.status === "buried") item.status = "unburied";
  });
}

export const describeRestore = (err: unknown) => describeFsError(err, "restore that");

/** Restores each item in turn and records the ones that worked. Per-item problems are reported, not thrown. */
export async function restoreItems(ctx: FmContext, items: GraveyardItem[], options: RestoreOptions, env: MoveEnv): Promise<Array<Outcome<RestoreValue>>> {
  await assertWritable(graveyardDirOf(ctx));
  const done: string[] = [];
  try {
    return await eachItem(
      items,
      async (item) => {
        const hold = claim(graveyardDirOf(ctx), [item.id]);
        if (hold.busy.length) throw new FmError("BUSY", "Something else is already working on this item. Try again in a moment.");
        try {
          const value = await restoreOne(ctx, item, options, env);
          if (value.status === "done") done.push(item.id);
          return value;
        } finally {
          hold.release();
        }
      },
      describeRestore,
    );
  } finally {
    await markRestored(ctx, done);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Empty (decompose)
// ---------------------------------------------------------------------------------------------------------------

export interface DecomposeSummary {
  deleted: number;
  freedBytes: number;
  failed: Array<{ id: string; name: string; message: string }>;
  stoppedEarly: boolean;
}

/** Permanently deletes the chosen items' files and records. Stops between items when `env.signal` aborts. */
export async function decomposeItems(ctx: FmContext, items: GraveyardItem[], env: { signal?: AbortSignal; progress?: (done: number, total: number) => void }): Promise<DecomposeSummary> {
  const dir = graveyardDirOf(ctx);
  await assertWritable(dir);
  const summary: DecomposeSummary = { deleted: 0, freedBytes: 0, failed: [], stoppedEarly: false };
  let gone: string[] = [];
  const save = async () => {
    if (!gone.length) return;
    const ids = new Set(gone.splice(0, gone.length));
    await withManifest(dir, (m) => {
      m.items = m.items.filter((i) => !(i && ids.has(i.id)));
    });
  };
  try {
    for (const item of items) {
      if (env.signal?.aborted) {
        summary.stoppedEarly = true;
        break;
      }
      const hold = claim(dir, [item.id]);
      if (hold.busy.length) {
        summary.failed.push({ id: item.id, name: item.name, message: "Something else is already working on this item." });
        continue;
      }
      try {
        await removeTree(payloadDirOf(dir, item.id));
        gone.push(item.id);
        summary.deleted++;
        summary.freedBytes += Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0;
      } catch (err) {
        summary.failed.push({ id: item.id, name: item.name, message: describeFsError(err, "delete that").message });
      } finally {
        hold.release();
      }
      env.progress?.(summary.deleted + summary.failed.length, items.length);
      if (gone.length >= 50) await save();
    }
  } finally {
    await save();
  }
  return summary;
}

/** Empties the whole graveyard: every item, and any files with no record, and unfinished copies. */
export async function decomposeEverything(ctx: FmContext, state: GraveState, env: { signal?: AbortSignal; progress?: (done: number, total: number) => void }): Promise<DecomposeSummary> {
  const dir = graveyardDirOf(ctx);
  const summary: DecomposeSummary = { deleted: 0, freedBytes: 0, failed: [], stoppedEarly: false };
  const byId = new Map(state.buried.map((x) => [x.item.id, x.item]));
  const names = await fsp.readdir(entriesDirOf(dir)).catch(() => [] as string[]);
  const removed = new Set<string>();
  for (const [i, name] of names.entries()) {
    if (env.signal?.aborted) {
      summary.stoppedEarly = true;
      break;
    }
    try {
      await removeTree(nodePath.join(entriesDirOf(dir), name));
      removed.add(name);
      const item = byId.get(name);
      if (item) {
        summary.deleted++;
        summary.freedBytes += Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0;
      }
    } catch (err) {
      summary.failed.push({ id: name, name, message: describeFsError(err, "delete that").message });
    }
    env.progress?.(i + 1, names.length);
  }
  if (!summary.stoppedEarly) await removeTree(stagingDirOf(dir)).catch(() => {});
  await withManifest(dir, (m) => {
    // Everything whose files are gone leaves the list. Earlier restores (history) go too, unless something couldn't be deleted.
    const complete = !summary.stoppedEarly && summary.failed.length === 0;
    m.items = complete ? [] : m.items.filter((i) => !!i && (i.status !== "buried" || !removed.has(i.id)));
  });
  return summary;
}
