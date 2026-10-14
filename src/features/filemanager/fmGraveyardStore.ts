/**
 * The graveyard's records: read the engine's manifest (and remember the parsed copy until the file changes, so paging
 * a long list stays quick), change it one writer at a time, and answer the questions the page asks about it.
 *
 * Safety rules kept here:
 *  - a damaged record file is never written over (every change refuses until it is repaired), so a bad read can't
 *    turn into "the graveyard is empty" and orphan everything in it;
 *  - an item's files are always found from the graveyard folder, its id and its name (both checked), never from a
 *    path stored in the record or sent by the page.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { formatHumanSize, getGraveyardDir, loadManifestChecked, saveManifest, type GraveyardItem, type GraveyardManifest, type RipFileType } from "../../../applications/rip_engine";
import type { FmContext } from "./fmCore";
import { FmError, isSameOrInside } from "./fmPaths";

export const ENTRY_ID = /^rip_\d{1,16}_[a-z0-9]{1,12}$/;
/** More than this many "unburied" history records are dropped, oldest first (they only keep Rip Studio's history view). */
export const MAX_HISTORY = 200;
export const MAX_LISTED = 200_000;
export const MAX_QUERY_LENGTH = 200;
export const MAX_PAGE_SIZE = 500;

export const graveyardDirOf = (ctx: FmContext): string => getGraveyardDir(ctx.graveyardDir);
export const entriesDirOf = (dir: string): string => nodePath.join(dir, "entries");
export const stagingDirOf = (dir: string): string => nodePath.join(dir, ".staging");
export const manifestFileOf = (dir: string): string => nodePath.join(dir, "manifest.json");

export function isPlainName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 255 && !/[/\\\0]/.test(name) && name !== "." && name !== "..";
}

export function isValidItem(item: any): item is GraveyardItem {
  return !!item && typeof item === "object" && typeof item.id === "string" && ENTRY_ID.test(item.id) && isPlainName(item.name) && typeof item.originalPath === "string" && Number.isFinite(item.buriedAtMs) && typeof item.status === "string";
}

/** Where an item's files are: `<graveyard>/entries/<id>/<name>`. */
export const payloadDirOf = (dir: string, id: string): string => nodePath.join(entriesDirOf(dir), id);
export const payloadOf = (dir: string, item: { id: string; name: string }): string => nodePath.join(payloadDirOf(dir, item.id), item.name);

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

export interface Indexed {
  item: GraveyardItem;
  /** Lower-case "name and original place", what the search box looks in. */
  key: string;
}

export interface GraveState {
  dir: string;
  exists: boolean;
  damaged: boolean;
  manifest: GraveyardManifest;
  buried: Indexed[];
  /** Records that are not "buried" (restored earlier: Rip Studio's history). */
  history: number;
  /** Buried records that can't be used because their id or name isn't valid. */
  invalid: number;
  truncated: boolean;
}

const cache = new Map<string, { sig: string; state: GraveState }>();

async function signature(dir: string): Promise<string> {
  try {
    const st = await fsp.stat(manifestFileOf(dir));
    return `${st.mtimeMs}:${st.size}:${st.ino}`;
  } catch {
    return "none";
  }
}

export async function readGrave(dir: string): Promise<GraveState> {
  const sig = await signature(dir);
  const hit = cache.get(dir);
  if (hit && hit.sig === sig) return hit.state;
  const { manifest, exists, damaged } = loadManifestChecked(dir);
  const buried: Indexed[] = [];
  let history = 0;
  let invalid = 0;
  let truncated = false;
  for (const item of manifest.items) {
    if (!item || typeof item !== "object") {
      invalid++;
      continue;
    }
    if ((item as GraveyardItem).status !== "buried") {
      history++;
      continue;
    }
    if (!isValidItem(item)) {
      invalid++;
      continue;
    }
    if (buried.length >= MAX_LISTED) {
      truncated = true;
      break;
    }
    buried.push({ item, key: `${item.name}\n${item.originalPath}`.toLowerCase() });
  }
  const state: GraveState = { dir, exists, damaged, manifest, buried, history, invalid, truncated };
  cache.set(dir, { sig, state });
  return state;
}

// ---------------------------------------------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------------------------------------------

const locks = new Map<string, Promise<unknown>>();

/**
 * Loads the records fresh, lets `fn` change them, and saves them, one writer at a time per graveyard. `fn` must be
 * quick (no file work): slow things happen before or after. Refuses when the record file is damaged.
 */
export function withManifest<T>(dir: string, fn: (manifest: GraveyardManifest) => T): Promise<T> {
  const previous = locks.get(dir) ?? Promise.resolve();
  const run = async (): Promise<T> => {
    const { manifest, damaged } = loadManifestChecked(dir);
    if (damaged) throw new FmError("DAMAGED", "The graveyard's record file is damaged, so nothing can be changed yet. Open Verify and choose Repair first.");
    const result = fn(manifest);
    const old = manifest.items.filter((i) => i && i.status !== "buried");
    if (old.length > MAX_HISTORY) {
      const drop = new Set(old.sort((a, b) => (b.buriedAtMs ?? 0) - (a.buriedAtMs ?? 0)).slice(MAX_HISTORY));
      manifest.items = manifest.items.filter((i) => !drop.has(i));
    }
    saveManifest(dir, manifest);
    cache.delete(dir);
    return result;
  };
  const next = previous.then(run, run);
  locks.set(dir, next.catch(() => {}));
  return next;
}

/** Throws unless the records can be changed (the file isn't damaged). Called before anything is moved. */
export async function assertWritable(dir: string): Promise<void> {
  const { damaged } = loadManifestChecked(dir);
  if (damaged) throw new FmError("DAMAGED", "The graveyard's record file is damaged, so nothing can be changed yet. Open Verify and choose Repair first.");
}

/** Collects new records and saves them together, in small groups when the graveyard is big. */
export function createRecorder(dir: string, batch = 1) {
  const pending: GraveyardItem[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const items = pending.splice(0, pending.length);
    try {
      await withManifest(dir, (m) => void m.items.unshift(...[...items].reverse()));
    } catch (err) {
      pending.unshift(...items);
      throw err;
    }
  };
  return {
    async add(item: GraveyardItem) {
      pending.push(item);
      if (pending.length >= batch) await flush();
    },
    flush,
  };
}

const claimed = new Set<string>();

/** Marks ids as being worked on, so two requests can't restore or delete the same item at once. */
export function claim(dir: string, ids: string[]): { got: string[]; busy: string[]; release: () => void } {
  const got: string[] = [];
  const busy: string[] = [];
  for (const id of ids) {
    const key = `${dir}\0${id}`;
    if (claimed.has(key)) busy.push(id);
    else {
      claimed.add(key);
      got.push(id);
    }
  }
  return { got, busy, release: () => got.forEach((id) => claimed.delete(`${dir}\0${id}`)) };
}

// ---------------------------------------------------------------------------------------------------------------
// What the page sees
// ---------------------------------------------------------------------------------------------------------------

export interface GraveRow {
  id: string;
  name: string;
  originalPath: string;
  /** The folder it was buried from ("" when that isn't known, after a repair). */
  folder: string;
  type: RipFileType;
  sizeBytes: number;
  humanSize: string;
  fileCount: number;
  buriedAt: string;
  buriedAtMs: number;
  unknownOrigin: boolean;
  /** Set on the rows of a listed page: the item's files are no longer in the graveyard. */
  missing?: boolean;
}

export function rowOf(item: GraveyardItem): GraveRow {
  const size = Number.isFinite(item.sizeBytes) && item.sizeBytes > 0 ? item.sizeBytes : 0;
  const type: RipFileType = (["file", "directory", "symlink", "other"] as const).includes(item.type as never) ? item.type : "file";
  const unknown = !item.originalPath || !nodePath.isAbsolute(item.originalPath);
  return {
    id: item.id,
    name: item.name,
    originalPath: item.originalPath,
    folder: unknown ? "" : nodePath.dirname(item.originalPath),
    type,
    sizeBytes: size,
    humanSize: formatHumanSize(size),
    fileCount: Number.isFinite(item.fileCount) ? item.fileCount : 0,
    buriedAt: typeof item.buriedAt === "string" ? item.buriedAt : new Date(item.buriedAtMs).toISOString(),
    buriedAtMs: item.buriedAtMs,
    unknownOrigin: unknown,
  };
}

export type GraveFilter = "all" | "here" | "files" | "folders";
export type GraveSort = "buried" | "name" | "size" | "folder" | "type";

export interface GraveQuery {
  query: string;
  filter: GraveFilter;
  folder: string;
  sort: GraveSort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function parseQuery(body: Record<string, any>): GraveQuery {
  const query = typeof body.query === "string" ? body.query.slice(0, MAX_QUERY_LENGTH) : "";
  const filter: GraveFilter = body.filter === "here" || body.filter === "files" || body.filter === "folders" ? body.filter : "all";
  const sort: GraveSort = body.sort === "name" || body.sort === "size" || body.sort === "folder" || body.sort === "type" ? body.sort : "buried";
  const dir = body.dir === "asc" || body.dir === "desc" ? body.dir : sort === "buried" || sort === "size" ? "desc" : "asc";
  const pageNumber = Number(body.page);
  const sizeNumber = Number(body.pageSize);
  const folder = typeof body.folder === "string" && body.folder && !body.folder.includes("\0") && nodePath.isAbsolute(body.folder) ? nodePath.resolve(body.folder) : "";
  if (filter === "here" && !folder) throw new FmError("BAD_REQUEST", "Open a folder first: \"From the current folder\" needs one.");
  return {
    query,
    filter,
    folder,
    sort,
    dir,
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
    pageSize: Number.isInteger(sizeNumber) ? Math.min(MAX_PAGE_SIZE, Math.max(1, sizeNumber)) : 100,
  };
}

/** The items that match the search and filter, in the order they are stored (newest first). */
export function filterItems(state: GraveState, q: GraveQuery): Indexed[] {
  const terms = q.query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length && q.filter === "all") return state.buried;
  return state.buried.filter(({ item, key }) => {
    if (q.filter === "files" && item.type === "directory") return false;
    if (q.filter === "folders" && item.type !== "directory") return false;
    if (q.filter === "here" && (!item.originalPath || item.originalPath === q.folder || !isSameOrInside(item.originalPath, q.folder))) return false;
    return terms.every((t) => key.includes(t));
  });
}

export function runQuery(state: GraveState, q: GraveQuery): { total: number; pages: number; page: number; items: GraveyardItem[] } {
  const list = filterItems(state, q);
  const sign = q.dir === "asc" ? 1 : -1;
  const folderOf = (i: GraveyardItem) => (i.originalPath ? nodePath.dirname(i.originalPath) : "");
  const compare = (a: Indexed, b: Indexed): number => {
    let c = 0;
    if (q.sort === "name") c = collator.compare(a.item.name, b.item.name);
    else if (q.sort === "size") c = (a.item.sizeBytes || 0) - (b.item.sizeBytes || 0);
    else if (q.sort === "folder") c = collator.compare(folderOf(a.item), folderOf(b.item));
    else if (q.sort === "type") c = collator.compare(a.item.type ?? "", b.item.type ?? "");
    else c = a.item.buriedAtMs - b.item.buriedAtMs;
    return c * sign || b.item.buriedAtMs - a.item.buriedAtMs || (a.item.id < b.item.id ? -1 : 1);
  };
  const sorted = list === state.buried ? [...list] : list;
  sorted.sort(compare);
  const pages = Math.max(1, Math.ceil(sorted.length / q.pageSize));
  const page = Math.min(q.page, pages);
  return { total: sorted.length, pages, page, items: sorted.slice((page - 1) * q.pageSize, page * q.pageSize).map((x) => x.item) };
}

export interface GraveStats {
  dir: string;
  exists: boolean;
  damaged: boolean;
  count: number;
  bytes: number;
  human: string;
  today: number;
  oldest: GraveRow | null;
  newest: GraveRow | null;
  history: number;
  invalid: number;
  truncated: boolean;
  free: { freeBytes: number; totalBytes: number } | null;
}

async function freeSpace(dir: string): Promise<GraveStats["free"]> {
  let current = dir;
  for (;;) {
    try {
      const s = await fsp.statfs(current);
      return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
    } catch {
      const parent = nodePath.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

export async function graveStats(ctx: FmContext): Promise<GraveStats> {
  const dir = graveyardDirOf(ctx);
  const state = await readGrave(dir);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  let bytes = 0;
  let today = 0;
  let oldest: GraveyardItem | null = null;
  let newest: GraveyardItem | null = null;
  for (const { item } of state.buried) {
    bytes += Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0;
    if (item.buriedAtMs >= startOfToday.getTime()) today++;
    if (!oldest || item.buriedAtMs < oldest.buriedAtMs) oldest = item;
    if (!newest || item.buriedAtMs > newest.buriedAtMs) newest = item;
  }
  return {
    dir,
    exists: state.exists,
    damaged: state.damaged,
    count: state.buried.length,
    bytes,
    human: formatHumanSize(bytes),
    today,
    oldest: oldest ? rowOf(oldest) : null,
    newest: newest ? rowOf(newest) : null,
    history: state.history,
    invalid: state.invalid,
    truncated: state.truncated,
    free: await freeSpace(dir),
  };
}

/** The buried items chosen by id. Ids that aren't in the graveyard are reported, never guessed at. */
export function pickByIds(state: GraveState, ids: unknown): { items: GraveyardItem[]; unknown: string[] } {
  if (!Array.isArray(ids) || ids.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (ids.length > MAX_LISTED) throw new FmError("BAD_REQUEST", "That is too many items at once.");
  const byId = new Map(state.buried.map((x) => [x.item.id, x.item]));
  const seen = new Set<string>();
  const items: GraveyardItem[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !ENTRY_ID.test(id)) throw new FmError("BAD_REQUEST", "That isn't a valid item.");
    if (seen.has(id)) continue;
    seen.add(id);
    const item = byId.get(id);
    if (item) items.push(item);
    else unknown.push(id);
  }
  return { items, unknown };
}
