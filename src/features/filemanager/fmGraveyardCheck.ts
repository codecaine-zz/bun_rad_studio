/**
 * Checking the graveyard against its records (Verify and Repair), and previewing what is inside it.
 *
 * Verify never changes anything. Repair only ever fixes the list (drops records whose files are gone, re-records files
 * that have no record, clears unfinished copies, sets aside a damaged record file); it never deletes buried files.
 */
import { createHash } from "crypto";
import { constants, promises as fsp } from "fs";
import * as nodePath from "path";
import { createGraveyardItem, type GraveyardItem } from "../../../applications/rip_engine";
import type { FmContext } from "./fmCore";
import { tick } from "./fmCore";
import { measureTree, removeTree } from "./fmGraveyardMove";
import { payloadStatus } from "./fmGraveyard";
import { ENTRY_ID, graveyardDirOf, isPlainName, isValidItem, manifestFileOf, payloadDirOf, payloadOf, entriesDirOf, readGrave, stagingDirOf, withManifest } from "./fmGraveyardStore";
import { FmError, extensionOf } from "./fmPaths";

const LIST_CAP = 200;
const NOFOLLOW = (constants as Record<string, number>).O_NOFOLLOW ?? 0;
const DEEP_LIMIT = 25 * 1024 * 1024;

export interface VerifyReport {
  dir: string;
  damaged: boolean;
  checked: number;
  /** True when the records and the files agree and nothing is left over. */
  ok: boolean;
  counts: { missing: number; changed: number; unsafe: number; invalid: number; orphans: number; staging: number };
  missing: Array<{ id: string; name: string; originalPath: string }>;
  changed: Array<{ id: string; name: string }>;
  unsafe: Array<{ id: string; name: string }>;
  orphans: Array<{ id: string; name: string }>;
  staging: string[];
}

async function listNames(folder: string): Promise<string[]> {
  return fsp.readdir(folder).catch(() => [] as string[]);
}

async function hashOf(file: string): Promise<string | null> {
  try {
    const handle = await fsp.open(file, constants.O_RDONLY | NOFOLLOW);
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
    return null;
  }
}

/** The folders under entries/ that no usable record points at, with the name of the one thing inside when there is exactly one. */
async function findOrphans(dir: string, knownIds: Set<string>, ids: string[]): Promise<Array<{ id: string; name: string; inside: string[] }>> {
  const out = [];
  for (const id of ids) {
    if (knownIds.has(id)) continue;
    const inside = await listNames(nodePath.join(entriesDirOf(dir), id));
    out.push({ id, name: inside.length === 1 ? inside[0]! : id, inside });
  }
  return out;
}

export async function verifyGraveyard(ctx: FmContext, options: { deep?: boolean } = {}): Promise<VerifyReport> {
  const dir = graveyardDirOf(ctx);
  const state = await readGrave(dir);
  const ids = await listNames(entriesDirOf(dir));
  const present = new Set(ids);
  const report: VerifyReport = { dir, damaged: state.damaged, checked: 0, ok: false, counts: { missing: 0, changed: 0, unsafe: 0, invalid: state.invalid, orphans: 0, staging: 0 }, missing: [], changed: [], unsafe: [], orphans: [], staging: [] };
  const known = new Set<string>();
  for (const { item } of state.buried) {
    known.add(item.id);
    report.checked++;
    if (report.checked % 200 === 0) await tick();
    const status = present.has(item.id) ? await payloadStatus(dir, item) : "missing";
    if (status === "missing") {
      report.counts.missing++;
      if (report.missing.length < LIST_CAP) report.missing.push({ id: item.id, name: item.name, originalPath: item.originalPath });
    } else if (status === "unsafe") {
      report.counts.unsafe++;
      if (report.unsafe.length < LIST_CAP) report.unsafe.push({ id: item.id, name: item.name });
    } else if (options.deep && item.sha256 && item.type === "file" && item.sizeBytes <= DEEP_LIMIT) {
      const now = await hashOf(payloadOf(dir, item));
      if (now !== item.sha256) {
        report.counts.changed++;
        if (report.changed.length < LIST_CAP) report.changed.push({ id: item.id, name: item.name });
      }
    }
  }
  const orphans = await findOrphans(dir, known, ids);
  report.counts.orphans = orphans.length;
  report.orphans = orphans.slice(0, LIST_CAP).map((o) => ({ id: o.id, name: o.name }));
  const staging = await listNames(stagingDirOf(dir));
  report.counts.staging = staging.length;
  report.staging = staging.slice(0, LIST_CAP);
  const c = report.counts;
  report.ok = !report.damaged && c.missing + c.unsafe + c.invalid + c.orphans + c.staging + c.changed === 0;
  return report;
}

/** Sets a damaged record file aside (renamed, never deleted) so a fresh one can be made. Returns where it went. */
export async function quarantineDamaged(dir: string): Promise<string | null> {
  const file = manifestFileOf(dir);
  const backup = `${file}.damaged-${Date.now()}`;
  try {
    await fsp.rename(file, backup);
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
  return backup;
}

export interface RepairOptions {
  missing: boolean;
  orphans: boolean;
  staging: boolean;
  damaged: boolean;
}

export interface RepairReport {
  droppedRecords: number;
  adopted: number;
  /** Files with no record that couldn't be re-recorded (more than one thing in the folder, or a name that isn't ours). */
  leftAlone: number;
  stagingCleared: number;
  damagedBackup: string | null;
}

export async function repairGraveyard(ctx: FmContext, options: RepairOptions): Promise<RepairReport> {
  const dir = graveyardDirOf(ctx);
  const report: RepairReport = { droppedRecords: 0, adopted: 0, leftAlone: 0, stagingCleared: 0, damagedBackup: null };
  const first = await readGrave(dir);
  if (first.damaged) {
    if (!options.damaged) throw new FmError("DAMAGED", "The graveyard's record file is damaged. Repair needs to set it aside and start a fresh list.");
    report.damagedBackup = await quarantineDamaged(dir);
  }
  const state = await readGrave(dir);
  const ids = await listNames(entriesDirOf(dir));
  const present = new Set(ids);

  if (options.missing) {
    const bad = new Set<string>();
    for (const { item } of state.buried) if (!present.has(item.id) || (await payloadStatus(dir, item)) === "missing") bad.add(item.id);
    if (bad.size || state.invalid) {
      report.droppedRecords = await withManifest(dir, (m) => {
        let dropped = 0;
        m.items = m.items.filter((i) => {
          const drop = !i || (i.status === "buried" && (bad.has(i.id) || !isValidItem(i)));
          if (drop) dropped++;
          return !drop;
        });
        return dropped;
      });
    }
  }

  if (options.orphans) {
    const current = await readGrave(dir);
    const known = new Set(current.buried.map((x) => x.item.id));
    const found = await findOrphans(dir, known, ids);
    const adopt: GraveyardItem[] = [];
    for (const o of found) {
      if (!ENTRY_ID.test(o.id) || o.inside.length !== 1 || !isPlainName(o.inside[0])) {
        report.leftAlone++;
        continue;
      }
      const payload = nodePath.join(entriesDirOf(dir), o.id, o.inside[0]!);
      try {
        const st = await fsp.lstat(payload);
        const metrics = await measureTree(payload);
        const when = (await fsp.lstat(payloadDirOf(dir, o.id))).mtime;
        adopt.push(
          createGraveyardItem({
            id: o.id,
            name: o.inside[0]!,
            originalPath: "",
            cwd: "",
            graveyardDir: dir,
            graveyardPath: payload,
            now: when,
            type: st.isSymbolicLink() ? "symlink" : st.isDirectory() ? "directory" : st.isFile() ? "file" : "other",
            mode: st.mode,
            sizeBytes: metrics.sizeBytes,
            fileCount: metrics.fileCount,
          }),
        );
      } catch {
        report.leftAlone++;
      }
    }
    if (adopt.length) {
      const adoptedIds = new Set(adopt.map((a) => a.id));
      await withManifest(dir, (m) => {
        // an older record of the same id (a restore that left files behind) is replaced by the new one
        m.items = [...adopt, ...m.items.filter((i) => !(i && adoptedIds.has(i.id)))];
      });
      report.adopted = adopt.length;
    }
  }

  if (options.staging) {
    const left = await listNames(stagingDirOf(dir));
    if (left.length) {
      await removeTree(stagingDirOf(dir));
      report.stagingCleared = left.length;
    }
  }
  return report;
}

// ---------------------------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------------------------

export type Preview =
  | { kind: "text"; text: string; truncated: boolean; bytes: number }
  | { kind: "image"; mime: string; dataUrl: string; bytes: number }
  | { kind: "folder"; entries: Array<{ name: string; type: "file" | "folder" | "link" | "other" }>; total: number }
  | { kind: "link"; target: string }
  | { kind: "binary"; bytes: number }
  | { kind: "none"; reason: string };

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif" };
const TEXT_BYTES = 64 * 1024;
const IMAGE_BYTES = 8 * 1024 * 1024;
const FOLDER_LIST = 200;

/** A read-only look at one buried item. Looks only inside the graveyard and never follows a link. */
export async function previewBuried(ctx: FmContext, id: unknown): Promise<Preview> {
  if (typeof id !== "string" || !ENTRY_ID.test(id)) throw new FmError("BAD_REQUEST", "That isn't a valid item.");
  const dir = graveyardDirOf(ctx);
  const item = (await readGrave(dir)).buried.find((x) => x.item.id === id)?.item;
  if (!item) throw new FmError("NOT_FOUND", "That item is no longer in the graveyard.");
  const status = await payloadStatus(dir, item);
  if (status !== "ok") return { kind: "none", reason: status === "missing" ? "The files of this item are no longer in the graveyard." : "This item's place in the graveyard isn't a normal folder, so it isn't shown." };
  const file = payloadOf(dir, item);
  const st = await fsp.lstat(file);
  if (st.isSymbolicLink()) return { kind: "link", target: await fsp.readlink(file) };
  if (st.isDirectory()) {
    const all = (await fsp.readdir(file, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    return { kind: "folder", total: all.length, entries: all.slice(0, FOLDER_LIST).map((e) => ({ name: e.name, type: e.isDirectory() ? "folder" : e.isSymbolicLink() ? "link" : e.isFile() ? "file" : "other" })) };
  }
  if (!st.isFile()) return { kind: "none", reason: "This is a special kind of file (a device, pipe or socket) and can't be shown." };
  const mime = IMAGE_TYPES[extensionOf(item.name)];
  const limit = mime ? IMAGE_BYTES : TEXT_BYTES;
  if (mime && st.size > IMAGE_BYTES) return { kind: "none", reason: "This picture is too big to show here. Restore it to open it." };
  const handle = await fsp.open(file, constants.O_RDONLY | NOFOLLOW);
  try {
    const buffer = Buffer.alloc(Math.min(st.size, limit));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const data = buffer.subarray(0, bytesRead);
    if (mime) return { kind: "image", mime, dataUrl: `data:${mime};base64,${data.toString("base64")}`, bytes: st.size };
    if (data.includes(0)) return { kind: "binary", bytes: st.size };
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: false }).decode(data), truncated: st.size > data.length, bytes: st.size };
  } finally {
    await handle.close();
  }
}
