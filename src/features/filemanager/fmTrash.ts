/**
 * The File Manager's own Recycle Bin.
 *
 * "Move to Recycle Bin" is the normal way to delete, and it can always be undone: the item moves into
 * `<data folder>/file_manager_trash/items/<id>/<name>` and `index.json` remembers where it came from.
 * This is deliberately the app's own bin, not the operating system's: the system Trash has no safe, identical API on
 * Windows, macOS and Linux, and this one behaves the same everywhere and can restore to the exact place.
 * Items on another disk are copied into the bin (so deleting something big on a USB stick takes a while).
 */
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import { absolutePath, assertCreatable, assertModifiable, eachItem, exists, lstatOrNull, moveTree, pathApi, type FmContext } from "./fmCore";
import { FmError, describeFsError, uniqueName } from "./fmPaths";

export interface TrashRecord {
  id: string;
  name: string;
  originalPath: string;
  deletedAt: string;
  isDir: boolean;
  /** Bytes for a file; null for a folder (not counted, to keep deleting fast). */
  size: number | null;
}

const queues = new Map<string, Promise<unknown>>();

/** Runs index updates one at a time per bin, so two quick deletes can't overwrite each other's record. */
function serialized<T>(ctx: FmContext, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(ctx.trashRoot) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  queues.set(ctx.trashRoot, next.catch(() => {}));
  return next;
}

const itemsDir = (ctx: FmContext) => nodePath.join(ctx.trashRoot, "items");
const indexFile = (ctx: FmContext) => nodePath.join(ctx.trashRoot, "index.json");

async function readIndex(ctx: FmContext): Promise<TrashRecord[]> {
  let records: TrashRecord[] = [];
  try {
    const parsed = JSON.parse(await fsp.readFile(indexFile(ctx), "utf8"));
    if (Array.isArray(parsed)) {
      records = parsed.filter((r) => r && typeof r.id === "string" && /^[a-f0-9]{16}$/.test(r.id) && typeof r.name === "string" && typeof r.originalPath === "string");
    }
  } catch {
    // no index yet, or it is damaged: items are still found below
  }
  // An item folder with no record (a damaged index) is still listed, so nothing in the bin is ever invisible.
  let ids: string[] = [];
  try {
    ids = await fsp.readdir(itemsDir(ctx));
  } catch {
    return [];
  }
  const known = new Set(records.map((r) => r.id));
  const live = records.filter((r) => ids.includes(r.id));
  for (const id of ids) {
    if (known.has(id) || !/^[a-f0-9]{16}$/.test(id)) continue;
    const inside = await fsp.readdir(nodePath.join(itemsDir(ctx), id)).catch(() => [] as string[]);
    if (inside.length !== 1) continue;
    const name = inside[0]!;
    const st = await lstatOrNull(nodePath.join(itemsDir(ctx), id, name));
    live.push({ id, name, originalPath: nodePath.join(ctx.home, "Restored items", name), deletedAt: (st?.mtime ?? new Date()).toISOString(), isDir: !!st?.isDirectory(), size: st && !st.isDirectory() ? st.size : null });
  }
  return live;
}

async function writeIndex(ctx: FmContext, records: TrashRecord[]): Promise<void> {
  await fsp.mkdir(ctx.trashRoot, { recursive: true });
  const tmp = `${indexFile(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(records, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, indexFile(ctx));
}

export async function listTrash(ctx: FmContext): Promise<{ items: TrashRecord[]; count: number }> {
  const items = await readIndex(ctx);
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return { items, count: items.length };
}

export interface TrashResult {
  path: string;
  id: string;
  name: string;
}

export async function moveToTrash(ctx: FmContext, inputs: unknown): Promise<Array<{ ok: true; value: TrashResult } | { ok: false; code: string; message: string }>> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const paths = inputs.map((i) => absolutePath(ctx, i));
  return serialized(ctx, async () => {
    const records = await readIndex(ctx);
    const results = await eachItem(
      paths,
      async (path) => {
        assertModifiable(ctx, path);
        const st = await fsp.lstat(path);
        const id = randomBytes(8).toString("hex");
        const name = pathApi(ctx).basename(path);
        const dir = nodePath.join(itemsDir(ctx), id);
        await fsp.mkdir(dir, { recursive: true });
        try {
          await moveTree(path, nodePath.join(dir, name));
        } catch (err) {
          await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
          throw err;
        }
        records.push({ id, name, originalPath: path, deletedAt: new Date().toISOString(), isDir: st.isDirectory(), size: st.isDirectory() ? null : st.size });
        return { path, id, name };
      },
      (err) => describeFsError(err, "delete that"),
    );
    await writeIndex(ctx, records);
    return results;
  });
}

export async function restoreFromTrash(ctx: FmContext, ids: unknown): Promise<Array<{ ok: true; value: { id: string; restoredTo: string } } | { ok: false; code: string; message: string }>> {
  if (!Array.isArray(ids) || ids.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  return serialized(ctx, async () => {
    let records = await readIndex(ctx);
    const results = await eachItem(
      ids as string[],
      async (id) => {
        const rec = records.find((r) => r.id === id);
        if (!rec) throw new FmError("NOT_FOUND", "That item is no longer in the Recycle Bin.");
        const source = nodePath.join(itemsDir(ctx), rec.id, rec.name);
        const p = pathApi(ctx);
        const parent = p.dirname(rec.originalPath);
        assertCreatable(ctx, parent);
        await fsp.mkdir(parent, { recursive: true });
        const taken = new Set(await fsp.readdir(parent));
        const finalName = uniqueName(p.basename(rec.originalPath), (n) => taken.has(n));
        const destination = p.join(parent, finalName);
        await moveTree(source, destination);
        await fsp.rm(nodePath.join(itemsDir(ctx), rec.id), { recursive: true, force: true }).catch(() => {});
        records = records.filter((r) => r.id !== id);
        return { id, restoredTo: destination };
      },
      (err) => describeFsError(err, "restore that"),
    );
    await writeIndex(ctx, records);
    return results;
  });
}

/** Permanently deletes the chosen items from the bin (`ids`), or everything in it when `ids` is omitted. */
export async function deleteFromTrash(ctx: FmContext, ids?: unknown): Promise<{ deleted: number }> {
  return serialized(ctx, async () => {
    const records = await readIndex(ctx);
    const chosen = ids === undefined ? records : records.filter((r) => Array.isArray(ids) && ids.includes(r.id));
    let deleted = 0;
    for (const rec of chosen) {
      await fsp.rm(nodePath.join(itemsDir(ctx), rec.id), { recursive: true, force: true });
      deleted++;
    }
    const gone = new Set(chosen.map((r) => r.id));
    await writeIndex(ctx, records.filter((r) => !gone.has(r.id)));
    return { deleted };
  });
}

/** Deletes items for good, bypassing the bin. Callers must have asked the person first. */
export async function deletePermanently(ctx: FmContext, inputs: unknown): Promise<Array<{ ok: true; value: { path: string } } | { ok: false; code: string; message: string }>> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const paths = inputs.map((i) => absolutePath(ctx, i));
  return eachItem(
    paths,
    async (path) => {
      assertModifiable(ctx, path);
      if (!(await exists(path))) throw Object.assign(new Error("gone"), { code: "ENOENT" });
      await fsp.rm(path, { recursive: true, force: false });
      return { path };
    },
    (err) => describeFsError(err, "delete that"),
  );
}
