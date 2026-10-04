// Feature: RAD - tarutils
// Pure-TypeScript POSIX ustar TAR packer/unpacker with PAX long-name support, directory entries,
// checksum verification, transparent gzip (.tar.gz / .tgz), and path-traversal-safe extraction.
// Limits: regular files + directories only (symlinks/devices are skipped on read); 8 GiB per entry.

import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

/** One entry to pack. Names ending in `/` (or `type: "directory"`) create directory entries. */
export interface TarEntry {
  name: string;
  data: Uint8Array | string;
  /** Unix permission bits. Default `0o644` (files) / `0o755` (dirs). */
  mode?: number;
  /** Modification time. Default: now. */
  mtime?: Date;
  type?: TarEntryType;
}

/** Entry kinds understood by this module. */
export type TarEntryType = "file" | "directory";

/** One unpacked entry. `text` is the UTF-8 decoding of `data` (empty for directories). */
export interface UnpackedTarEntry {
  name: string;
  data: Uint8Array;
  text: string;
  type: TarEntryType;
  mode: number;
  mtime: Date;
  size: number;
}

const BLOCK = 512;
const MAX_OCTAL_SIZE = 0o77777777777; // 8 GiB - 1

function writeOctal(buf: Buffer, value: number, offset: number, width: number): void {
  buf.write(value.toString(8).padStart(width - 1, "0") + "\0", offset, "ascii");
}

function readOctal(block: Buffer, offset: number, width: number): number {
  const raw = block.toString("ascii", offset, offset + width).replace(/\0.*$/, "").trim();
  return raw ? parseInt(raw, 8) : 0;
}

function headerChecksum(block: Buffer): number {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : block[i]!;
  return sum;
}

function splitUstarName(name: string): { name: string; prefix: string } | null {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: "" };
  for (let i = name.indexOf("/"); i !== -1; i = name.indexOf("/", i + 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100 && rest) return { name: rest, prefix };
  }
  return null;
}

function createTarHeader(name: string, size: number, typeflag: string, mode: number, mtime: Date, prefix = ""): Buffer {
  if (size > MAX_OCTAL_SIZE) throw new Error(`[tarutils] ${name} is ${size} bytes; ustar max is 8 GiB`);
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, "utf-8");
  writeOctal(header, mode & 0o7777, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, Math.floor(mtime.getTime() / 1000), 136, 12);
  header.write(typeflag, 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  header.write(prefix, 345, 155, "utf-8");
  header.write(headerChecksum(header).toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return header;
}

/**
 * Build a PAX extended-header record body (`"<len> key=value\n"`, where len counts itself).
 * @example `tarutils.paxRecord("path", "a/b"); // "12 path=a/b\n"`
 */
export function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body) + 1;
  while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
  return `${len}${body}`;
}

function padBlock(len: number): Buffer {
  const rem = len % BLOCK;
  return Buffer.alloc(rem ? BLOCK - rem : 0);
}

function packEntry(entry: TarEntry): Buffer[] {
  const isDir = entry.type === "directory" || entry.name.endsWith("/");
  const posix = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
  const name = isDir && !posix.endsWith("/") ? `${posix}/` : posix;
  if (!name) throw new Error("[tarutils.packTarBytes] Entry name must not be empty");
  const data = isDir ? Buffer.alloc(0) : typeof entry.data === "string" ? Buffer.from(entry.data, "utf-8") : Buffer.from(entry.data);
  const mode = entry.mode ?? (isDir ? 0o755 : 0o644);
  const mtime = entry.mtime ?? new Date();
  const split = splitUstarName(name);
  const chunks: Buffer[] = [];
  if (!split) {
    const pax = Buffer.from(paxRecord("path", name), "utf-8");
    chunks.push(createTarHeader("PaxHeader", pax.length, "x", 0o644, mtime), pax, padBlock(pax.length));
  }
  const headerName = split ? split.name : name.slice(-100);
  chunks.push(createTarHeader(headerName, data.length, isDir ? "5" : "0", mode, mtime, split?.prefix ?? ""));
  chunks.push(data, padBlock(data.length));
  return chunks;
}

/**
 * Pack entries into an uncompressed TAR (ustar + PAX for names longer than ustar allows).
 * @example
 * ```ts
 * const tar = tarutils.packTarBytes([
 *   { name: "pkg/", data: "", type: "directory" },
 *   { name: "pkg/index.ts", data: "export {}", mode: 0o644 },
 * ]);
 * ```
 */
export function packTarBytes(entries: TarEntry[]): Uint8Array {
  const chunks = entries.flatMap(packEntry);
  chunks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(chunks);
}

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of data.toString("utf-8").split("\n")) {
    const m = /^\d+ ([^=]+)=(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/**
 * Unpack an (uncompressed) TAR into entries. Verifies header checksums, applies PAX `path`
 * and GNU long-name records, and skips symlinks/devices.
 * @throws On a header checksum mismatch (corrupt archive).
 * @example
 * ```ts
 * for (const e of tarutils.unpackTarBytes(tar)) console.log(e.type, e.name, e.size);
 * ```
 */
export function unpackTarBytes(bytes: Uint8Array): UnpackedTarEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: UnpackedTarEntry[] = [];
  let offset = 0;
  let longName: string | null = null;
  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break;
    if (readOctal(header, 148, 8) !== headerChecksum(header)) throw new Error(`[tarutils] Header checksum mismatch at offset ${offset}`);
    const size = readOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] || 48);
    const data = buf.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + size + padBlock(size).length;
    if (typeflag === "x") longName = parsePax(data).path ?? longName;
    else if (typeflag === "L") longName = data.toString("utf-8").replace(/\0+$/, "");
    else if (typeflag === "0" || typeflag === "5") {
      entries.push(toUnpacked(header, data, typeflag, longName));
      longName = null;
    } else longName = null;
  }
  return entries;
}

function toUnpacked(header: Buffer, data: Buffer, typeflag: string, longName: string | null): UnpackedTarEntry {
  const base = header.toString("utf-8", 0, 100).replace(/\0.*$/s, "");
  const prefix = header.toString("utf-8", 345, 500).replace(/\0.*$/s, "");
  const name = longName ?? (prefix ? `${prefix}/${base}` : base);
  const isDir = typeflag === "5";
  return {
    name,
    data,
    text: isDir ? "" : data.toString("utf-8"),
    type: isDir ? "directory" : "file",
    mode: readOctal(header, 100, 8),
    mtime: new Date(readOctal(header, 136, 12) * 1000),
    size: data.length,
  };
}

/**
 * Entry names in a TAR (or gzip'd TAR — detected automatically).
 * @example `tarutils.listTarEntries(tar); // ["pkg/", "pkg/index.ts"]`
 */
export function listTarEntries(bytes: Uint8Array): string[] {
  return unpackTarBytes(maybeGunzip(bytes)).map((e) => e.name);
}

/**
 * Pack entries and gzip the result (`.tar.gz` / `.tgz` bytes).
 * @example `await Bun.write("bundle.tgz", tarutils.packTarGz([{ name: "a.txt", data: "hi" }]));`
 */
export function packTarGz(entries: TarEntry[], level?: number): Uint8Array {
  const tar = packTarBytes(entries) as Uint8Array<ArrayBuffer>;
  return level === undefined ? Bun.gzipSync(tar) : Bun.gzipSync(tar, { level: level as any });
}

/**
 * Unpack `.tar.gz` bytes (plain TAR bytes also accepted).
 * @example `tarutils.unpackTarGz(await Bun.file("bundle.tgz").bytes());`
 */
export function unpackTarGz(bytes: Uint8Array): UnpackedTarEntry[] {
  return unpackTarBytes(maybeGunzip(bytes));
}

function maybeGunzip(bytes: Uint8Array): Uint8Array {
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes as Uint8Array<ArrayBuffer>) : bytes;
}

function safeTarget(destDir: string, name: string): string {
  const root = resolve(destDir);
  const target = resolve(root, name);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`[tarutils] Refusing to extract "${name}": path escapes ${root}`);
  }
  return target;
}

/**
 * Archive a directory to disk. Output is gzip-compressed when `destTarPath` ends in `.gz`/`.tgz`.
 * Preserves relative paths, permission bits, mtimes and empty directories.
 * @param filter - Optional predicate on the relative POSIX path.
 * @returns Number of entries written.
 * @example
 * ```ts
 * await tarutils.createTarFile("./dist", "./release/dist.tgz", (rel) => !rel.endsWith(".map"));
 * ```
 */
export async function createTarFile(srcDir: string, destTarPath: string, filter?: (relPath: string) => boolean): Promise<number> {
  const entries: TarEntry[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const full = join(current, item.name);
      const rel = relative(srcDir, full).replace(/\\/g, "/");
      if (filter && !filter(rel)) continue;
      const st = await stat(full);
      if (item.isDirectory()) {
        entries.push({ name: `${rel}/`, data: "", type: "directory", mode: st.mode, mtime: st.mtime });
        await walk(full);
      } else if (item.isFile()) entries.push({ name: rel, data: await Bun.file(full).bytes(), mode: st.mode, mtime: st.mtime });
    }
  };
  await walk(srcDir);
  await mkdir(dirname(destTarPath), { recursive: true });
  const gz = /\.(tgz|gz)$/i.test(destTarPath);
  await Bun.write(destTarPath, gz ? packTarGz(entries) : packTarBytes(entries));
  return entries.length;
}

/**
 * Extract a `.tar` / `.tar.gz` / `.tgz` file (gzip auto-detected) into `destDir`.
 * Path-traversal safe; restores directory structure.
 * @returns Number of files written.
 * @example `await tarutils.extractTarFile("./release/dist.tgz", "./restore");`
 */
export async function extractTarFile(tarPath: string, destDir: string): Promise<number> {
  const file = Bun.file(tarPath);
  if (!(await file.exists())) throw new Error(`[tarutils.extractTarFile] File not found: ${tarPath}`);
  let files = 0;
  for (const entry of unpackTarGz(await file.bytes())) {
    const outPath = safeTarget(destDir, entry.name);
    if (entry.type === "directory") {
      await mkdir(outPath, { recursive: true });
      continue;
    }
    await mkdir(dirname(outPath), { recursive: true });
    await Bun.write(outPath, entry.data);
    files++;
  }
  return files;
}

export const tarutils = {
  packTarBytes,
  unpackTarBytes,
  listTarEntries,
  packTarGz,
  unpackTarGz,
  createTarFile,
  extractTarFile,
  paxRecord,
};
