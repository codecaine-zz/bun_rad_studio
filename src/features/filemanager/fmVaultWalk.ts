/**
 * Reads what is to be encrypted: counts it first (so the progress bar and the manifest are right), then streams it as a
 * RADENC container one entry at a time, never holding more than one block of a file in memory.
 * Links and special files (devices, sockets, pipes) are not stored; each one is reported as a warning.
 */
import * as fs from "node:fs";
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { END_ENTRY, MAX_DEPTH, MAX_ENTRIES, MAX_PATH_BYTES, MAX_WARNINGS, componentProblem, encodeDirEntry, encodeFileEntry, encodeManifest, type Manifest } from "./fmVaultContainer";
import { VaultError, throwIfAborted } from "./fmVaultFormat";

export interface ScanResult {
  kind: "file" | "folder";
  name: string;
  /** Number of files and folders stored (the folder being encrypted itself is not counted). */
  entries: number;
  files: number;
  bytes: number;
  warnings: string[];
}

interface WalkEntry {
  rel: string;
  abs: string;
  st: fs.Stats;
  isDir: boolean;
}

const READ_SIZE = 1 << 20;
const NO_FOLLOW = fs.constants.O_NOFOLLOW ?? 0;

class Warnings {
  list: string[] = [];
  extra = 0;
  add(text: string): void {
    if (this.list.length < MAX_WARNINGS) this.list.push(text);
    else this.extra++;
  }
  result(): string[] {
    return this.extra ? [...this.list, `…and ${this.extra} more items were skipped.`] : this.list;
  }
}

const bytesOf = (s: string) => Buffer.byteLength(s, "utf8");
const short = (rel: string) => (rel.length > 80 ? `${rel.slice(0, 77)}…` : rel);

/** Walks a folder in a fixed (sorted) order, folders before their contents. Skips what can't be stored, with a warning. */
async function* walk(root: string, signal: AbortSignal | undefined, warnings: Warnings): AsyncGenerator<WalkEntry> {
  async function* inner(dirAbs: string, dirRel: string, depth: number): AsyncGenerator<WalkEntry> {
    throwIfAborted(signal);
    const names = (await fsp.readdir(dirAbs)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      throwIfAborted(signal);
      const rel = dirRel ? `${dirRel}/${name}` : name;
      const problem = componentProblem(name);
      if (problem) {
        warnings.add(`Skipped "${short(rel)}": it has ${problem}.`);
        continue;
      }
      const abs = nodePath.join(dirAbs, name);
      const st = await fsp.lstat(abs);
      if (st.isSymbolicLink()) {
        warnings.add(`Skipped the link "${short(rel)}" (links are not stored).`);
      } else if (st.isDirectory() || st.isFile()) {
        if (depth + 1 > MAX_DEPTH) throw new VaultError("TOO_DEEP", `"${short(rel)}" is nested more than ${MAX_DEPTH} folders deep, which can't be stored.`);
        if (bytesOf(rel) > MAX_PATH_BYTES) throw new VaultError("PATH_TOO_LONG", `The path "${short(rel)}" is too long to store (the limit is ${MAX_PATH_BYTES} bytes).`);
        if (st.isDirectory()) {
          yield { rel, abs, st, isDir: true };
          yield* inner(abs, rel, depth + 1);
        } else {
          yield { rel, abs, st, isDir: false };
        }
      } else {
        warnings.add(`Skipped "${short(rel)}": it isn't an ordinary file or folder.`);
      }
    }
  }
  yield* inner(root, "", 0);
}

/** Looks at the item (a file or a folder) and counts what would be stored. Never reads file contents. */
export async function scanSource(source: string, signal?: AbortSignal): Promise<ScanResult> {
  const st = await fsp.lstat(source);
  const name = nodePath.basename(source);
  const problem = componentProblem(name);
  if (problem) throw new VaultError("BAD_SOURCE", `"${short(name)}" can't be encrypted: it has ${problem}.`);
  if (st.isSymbolicLink()) throw new VaultError("BAD_SOURCE", "That is a link, not a file or folder. Encrypt the item it points to instead.");
  if (st.isFile()) return { kind: "file", name, entries: 1, files: 1, bytes: st.size, warnings: [] };
  if (!st.isDirectory()) throw new VaultError("BAD_SOURCE", "That isn't an ordinary file or folder, so it can't be encrypted.");
  const warnings = new Warnings();
  let entries = 0;
  let files = 0;
  let bytes = 0;
  for await (const e of walk(source, signal, warnings)) {
    if (++entries > MAX_ENTRIES) throw new VaultError("TOO_MANY", `That folder holds more than ${MAX_ENTRIES.toLocaleString("en-US")} items, which is more than one encrypted file can hold. Encrypt smaller folders.`);
    if (!e.isDir) {
      files++;
      bytes += e.st.size;
    }
  }
  return { kind: "folder", name, entries, files, bytes, warnings: warnings.result() };
}

const changed = (rel: string) => new VaultError("CHANGED", `"${short(rel)}" changed while it was being encrypted. Close whatever is using it and try again.`);

async function* fileEntry(abs: string, rel: string, expectedSize: number, signal: AbortSignal | undefined, onBytes?: (n: number) => void): AsyncGenerator<Buffer> {
  const fh = await fsp.open(abs, fs.constants.O_RDONLY | NO_FOLLOW);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.size !== expectedSize) throw changed(rel);
    yield encodeFileEntry(rel, st.mode, st.mtimeMs, st.size);
    let left = st.size;
    while (left > 0) {
      throwIfAborted(signal);
      const buf = Buffer.allocUnsafe(Math.min(READ_SIZE, left));
      const { bytesRead } = await fh.read(buf, 0, buf.length, null);
      if (bytesRead === 0) throw changed(rel);
      left -= bytesRead;
      onBytes?.(bytesRead);
      yield bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
    }
  } finally {
    await fh.close();
  }
}

/** The container as a stream of buffers: manifest, then every entry, then the end marker. */
export async function* containerStream(source: string, scan: ScanResult, signal?: AbortSignal, onBytes?: (n: number) => void): AsyncGenerator<Buffer> {
  const manifest: Manifest = { v: 1, kind: scan.kind, name: scan.name, created: new Date().toISOString(), count: scan.entries, bytes: scan.bytes };
  yield encodeManifest(manifest);
  if (scan.kind === "file") {
    yield* fileEntry(source, scan.name, scan.bytes, signal, onBytes);
  } else {
    let entries = 0;
    let bytes = 0;
    for await (const e of walk(source, signal, new Warnings())) {
      entries++;
      if (e.isDir) {
        yield encodeDirEntry(e.rel, e.st.mode, e.st.mtimeMs);
      } else {
        yield* fileEntry(e.abs, e.rel, e.st.size, signal, onBytes);
        bytes += e.st.size;
      }
    }
    if (entries !== scan.entries || bytes !== scan.bytes) throw changed(scan.name);
  }
  yield END_ENTRY;
}
