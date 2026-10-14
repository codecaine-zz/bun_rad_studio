/** Folders and many items at once: counts, total size and a breakdown by kind, with limits on time and number of items. */
import { promises as fsp, type Dirent } from "fs";
import { pathApi, type FmContext } from "./fmCore";
import { humanBytes, lstatTarget, Rows, sizeText, type InfoGroup } from "./fmInfoCommon";
import type { TaskControl } from "./fmInfoTasks";
import { FmError, classify } from "./fmPaths";

export interface ScanLimits {
  maxEntries: number;
  maxMs: number;
  signal?: AbortSignal;
  progress?: TaskControl["progress"];
}

export interface Tally {
  folders: number;
  files: number;
  links: number;
  others: number;
  hidden: number;
  bytes: number;
  onDisk: number;
  unreadable: number;
  kinds: Map<string, { count: number; bytes: number }>;
  newest: { name: string; path: string; ms: number } | null;
  oldest: { name: string; path: string; ms: number } | null;
  largest: Array<{ name: string; path: string; size: number }>;
  partial: boolean;
  cancelled: boolean;
  entries: number;
  startedAt: number;
}

export function newTally(): Tally {
  return { folders: 0, files: 0, links: 0, others: 0, hidden: 0, bytes: 0, onDisk: 0, unreadable: 0, kinds: new Map(), newest: null, oldest: null, largest: [], partial: false, cancelled: false, entries: 0, startedAt: Date.now() };
}

function addFile(t: Tally, name: string, path: string, size: number, mtimeMs: number, blocks: number | undefined, platform: FmContext["platform"]): void {
  t.files++;
  t.bytes += size;
  t.onDisk += blocks !== undefined && platform !== "win32" ? blocks * 512 : size;
  const label = classify(name, false).label;
  const k = t.kinds.get(label) ?? { count: 0, bytes: 0 };
  k.count++;
  k.bytes += size;
  t.kinds.set(label, k);
  if (!t.newest || mtimeMs > t.newest.ms) t.newest = { name, path, ms: mtimeMs };
  if (!t.oldest || mtimeMs < t.oldest.ms) t.oldest = { name, path, ms: mtimeMs };
  if (t.largest.length < 5 || size > t.largest[t.largest.length - 1]!.size) {
    t.largest.push({ name, path, size });
    t.largest.sort((a, b) => b.size - a.size);
    if (t.largest.length > 5) t.largest.pop();
  }
}

const yieldNow = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Walks `root` (links are counted, never followed). Stops at the limits and says so in `partial`. */
export async function scanFolder(ctx: FmContext, root: string, tally: Tally, limits: ScanLimits): Promise<void> {
  const p = pathApi(ctx);
  const stack = [root];
  const deadline = tally.startedAt + limits.maxMs;
  while (stack.length) {
    const dir = stack.pop()!;
    let names: Dirent[];
    try {
      names = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      tally.unreadable++;
      continue;
    }
    for (const d of names) {
      if (limits.signal?.aborted) { tally.cancelled = true; tally.partial = true; return; }
      if (tally.entries >= limits.maxEntries || Date.now() > deadline) { tally.partial = true; return; }
      tally.entries++;
      if (d.name.startsWith(".")) tally.hidden++;
      const full = p.join(dir, d.name);
      if (d.isSymbolicLink()) { tally.links++; continue; }
      if (d.isDirectory()) {
        tally.folders++;
        stack.push(full);
        continue;
      }
      try {
        const st = await fsp.lstat(full);
        if (st.isFile()) addFile(tally, d.name, full, st.size, st.mtimeMs, st.blocks, ctx.platform);
        else tally.others++;
      } catch {
        tally.unreadable++;
      }
      if (tally.entries % 400 === 0) {
        limits.progress?.(tally.entries, 0, `${tally.entries.toLocaleString("en-US")} items so far`);
        await yieldNow();
      }
    }
  }
}

const when = (ms: number) => new Date(ms).toLocaleString();

export function tallyGroups(t: Tally, title: string): InfoGroup[] {
  const groups: InfoGroup[] = [];
  const g = new Rows();
  g.add("Items", (t.files + t.folders + t.links + t.others).toLocaleString("en-US"), "Everything counted: files, folders and links.");
  g.add("Files", t.files.toLocaleString("en-US")).add("Folders", t.folders.toLocaleString("en-US")).add("Links", t.links || "", "Shortcuts to other places. They are counted but not followed.");
  g.add("Hidden items", t.hidden || "", "Items whose name starts with a dot.");
  g.add("Total size", sizeText(t.bytes), "Added up from the files' sizes.").add("Size on disk", t.onDisk ? humanBytes(t.onDisk) : "", "The space the files really take. It is usually a little more because disks store files in blocks.");
  if (t.newest) g.add("Newest file", `${t.newest.name}, changed ${when(t.newest.ms)}`);
  if (t.oldest) g.add("Oldest file", `${t.oldest.name}, changed ${when(t.oldest.ms)}`);
  g.add("Not readable", t.unreadable ? `${t.unreadable} (no permission)` : "", "", "warn");
  const note = t.partial ? (t.cancelled ? "Stopped before it finished, so these numbers are lower than the real ones." : "Counting stopped at a safety limit, so these numbers cover only the part counted so far.") : undefined;
  const main = g.group("general", title, undefined, note);
  if (main) groups.push(main);
  const kinds = [...t.kinds].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10);
  if (kinds.length) {
    const r = new Rows();
    for (const [label, k] of kinds) r.add(label, `${k.count.toLocaleString("en-US")} file${k.count === 1 ? "" : "s"}, ${humanBytes(k.bytes)}`);
    const kg = r.group("kinds", "Kinds of files (top 10 by size)");
    if (kg) groups.push(kg);
  }
  if (t.largest.length) {
    const r = new Rows();
    for (const f of t.largest) r.add(f.name, humanBytes(f.size), f.path);
    const lg = r.group("largest", "Largest files");
    if (lg) groups.push(lg);
  }
  return groups;
}

export interface FolderResult {
  groups: InfoGroup[];
  partial: boolean;
  cancelled: boolean;
  files: number;
  folders: number;
  bytes: number;
}

export async function folderInfo(ctx: FmContext, input: unknown, limits: Partial<ScanLimits> = {}): Promise<FolderResult> {
  const t = await lstatTarget(ctx, input);
  if (t.lst.isSymbolicLink()) throw new FmError("IS_LINK", "This is a link. Its folder is not counted.");
  if (!t.lst.isDirectory()) throw new FmError("NOT_A_FOLDER", "That isn't a folder.");
  const tally = newTally();
  await scanFolder(ctx, t.path, tally, { maxEntries: 300_000, maxMs: 10_000, ...limits });
  return { groups: tallyGroups(tally, "This folder"), partial: tally.partial, cancelled: tally.cancelled, files: tally.files, folders: tally.folders, bytes: tally.bytes };
}

export async function manyInfo(ctx: FmContext, inputs: unknown, limits: Partial<ScanLimits> = {}): Promise<FolderResult & { selected: number }> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (inputs.length > 5000) throw new FmError("TOO_MANY", "That is too many items to add up at once.");
  const tally = newTally();
  const lim = { maxEntries: 300_000, maxMs: 10_000, ...limits };
  let selected = 0;
  for (const input of inputs) {
    if (tally.partial) break;
    let t;
    try {
      t = await lstatTarget(ctx, input);
    } catch {
      tally.unreadable++;
      continue;
    }
    selected++;
    tally.entries++;
    if (pathApi(ctx).basename(t.path).startsWith(".")) tally.hidden++;
    if (t.lst.isSymbolicLink()) tally.links++;
    else if (t.lst.isDirectory()) {
      tally.folders++;
      await scanFolder(ctx, t.path, tally, lim);
    } else if (t.lst.isFile()) addFile(tally, pathApi(ctx).basename(t.path), t.path, t.lst.size, t.lst.mtimeMs, t.lst.blocks, ctx.platform);
    else tally.others++;
  }
  return { groups: tallyGroups(tally, `${selected} selected items`), partial: tally.partial, cancelled: tally.cancelled, files: tally.files, folders: tally.folders, bytes: tally.bytes, selected };
}
