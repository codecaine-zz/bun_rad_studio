// Feature: RAD - archiveutils
// Zero-dependency PKZIP (ZIP) writer/reader on Bun's native deflate + crc32.
// Correct DOS timestamps, UTF-8 names, store-vs-deflate auto selection, directory entries,
// EOCD-based parsing, CRC-32 verification, and zip-slip protection on extraction.
// Limits: classic ZIP (no Zip64) → max 65,535 entries and 4 GiB per entry/archive; no encryption.

import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

/** One entry to put in a ZIP. Names ending in `/` create directory entries (data ignored). */
export interface ZipEntryInput {
  name: string;
  data: string | Uint8Array;
  /** Modification time stored in the archive. Default: now. */
  mtime?: Date;
  /** Force deflate (`true`) or store (`false`). Default: deflate only when it actually shrinks. */
  compress?: boolean;
}

/** Raw central-directory header fields (legacy shape, kept for compatibility). */
export interface ZipEntryHeader {
  name: string;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
  compressionMethod: number;
}

/** Rich, human-friendly description of a ZIP entry returned by {@link listZipDetails}. */
export interface ZipEntryInfo extends ZipEntryHeader {
  isDirectory: boolean;
  modified: Date;
}

/** One extracted entry. */
export interface ZipExtractedEntry {
  name: string;
  data: Uint8Array;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const MAX_U32 = 0xffffffff;

/**
 * Encode a JS Date into MS-DOS `{ time, date }` words used by ZIP headers (2-second resolution).
 * Dates before 1980 clamp to 1980-01-01.
 * @example `archiveutils.toDosDateTime(new Date(2026, 0, 2, 3, 4, 6)); // { time: 6275, date: 23586 }`
 */
export function toDosDateTime(d: Date): { time: number; date: number } {
  if (d.getFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * Decode MS-DOS time/date words back into a local Date.
 * @example `archiveutils.fromDosDateTime(6275, 23586).getFullYear(); // 2026`
 */
export function fromDosDateTime(time: number, date: number): Date {
  return new Date(1980 + (date >> 9), ((date >> 5) & 0xf) - 1, date & 0x1f, time >> 11, (time >> 5) & 0x3f, (time & 0x1f) * 2);
}

interface PreparedEntry {
  nameBuf: Buffer;
  payload: Buffer;
  crc: number;
  rawSize: number;
  method: 0 | 8;
  flags: number;
  dos: { time: number; date: number };
}

function prepareEntry(entry: ZipEntryInput): PreparedEntry {
  const name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name) throw new Error("[archiveutils.zipFiles] Entry name must not be empty");
  const isDir = name.endsWith("/");
  const raw = isDir ? Buffer.alloc(0) : typeof entry.data === "string" ? Buffer.from(entry.data, "utf-8") : Buffer.from(entry.data);
  if (raw.length >= MAX_U32) throw new Error(`[archiveutils.zipFiles] ${name} exceeds 4 GiB (Zip64 unsupported)`);
  const deflated = raw.length && entry.compress !== false ? Buffer.from(Bun.deflateSync(raw)) : null;
  const useDeflate = !!deflated && (entry.compress === true || deflated.length < raw.length);
  const nameBuf = Buffer.from(name, "utf-8");
  return {
    nameBuf,
    payload: useDeflate ? deflated! : raw,
    crc: Bun.hash.crc32(raw) >>> 0,
    rawSize: raw.length,
    method: useDeflate ? 8 : 0,
    flags: nameBuf.length !== name.length ? FLAG_UTF8 : 0,
    dos: toDosDateTime(entry.mtime ?? new Date()),
  };
}

function writeCommonFields(buf: Buffer, at: number, e: PreparedEntry): void {
  buf.writeUInt16LE(20, at); // version needed
  buf.writeUInt16LE(e.flags, at + 2);
  buf.writeUInt16LE(e.method, at + 4);
  buf.writeUInt16LE(e.dos.time, at + 6);
  buf.writeUInt16LE(e.dos.date, at + 8);
  buf.writeUInt32LE(e.crc, at + 10);
  buf.writeUInt32LE(e.payload.length, at + 14);
  buf.writeUInt32LE(e.rawSize, at + 18);
  buf.writeUInt16LE(e.nameBuf.length, at + 22);
}

function buildLocalHeader(e: PreparedEntry): Buffer {
  const local = Buffer.alloc(30 + e.nameBuf.length);
  local.writeUInt32LE(SIG_LOCAL, 0);
  writeCommonFields(local, 4, e);
  e.nameBuf.copy(local, 30);
  return local;
}

function buildCentralHeader(e: PreparedEntry, offset: number): Buffer {
  const central = Buffer.alloc(46 + e.nameBuf.length);
  central.writeUInt32LE(SIG_CENTRAL, 0);
  central.writeUInt16LE(0x0314, 4); // made by: Unix, spec 2.0
  writeCommonFields(central, 6, e);
  const isDir = e.nameBuf[e.nameBuf.length - 1] === 0x2f;
  central.writeUInt32LE((isDir ? 0o40755 : 0o100644) * 0x10000, 38); // unix mode in external attrs
  central.writeUInt32LE(offset, 42);
  e.nameBuf.copy(central, 46);
  return central;
}

function buildEocd(count: number, centralSize: number, centralOffset: number): Buffer {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return eocd;
}

/**
 * Build a complete ZIP archive in memory.
 * @throws When more than 65,535 entries or an entry ≥ 4 GiB is supplied.
 * @example
 * ```ts
 * const zip = archiveutils.zipFiles([
 *   { name: "docs/", data: "" },
 *   { name: "docs/readme.txt", data: "Hello" },
 *   { name: "logo.png", data: pngBytes, compress: false },
 * ]);
 * await Bun.write("bundle.zip", zip);
 * ```
 */
export function zipFiles(entries: ZipEntryInput[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error(`[archiveutils.zipFiles] ${entries.length} entries exceeds 65535 (Zip64 unsupported)`);
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const e = prepareEntry(entry);
    const local = buildLocalHeader(e);
    parts.push(local, e.payload);
    centrals.push(buildCentralHeader(e, offset));
    offset += local.length + e.payload.length;
  }
  if (offset >= MAX_U32) throw new Error("[archiveutils.zipFiles] Archive exceeds 4 GiB (Zip64 unsupported)");
  const centralSize = centrals.reduce((acc, h) => acc + h.length, 0);
  return Buffer.concat([...parts, ...centrals, buildEocd(entries.length, centralSize, offset)]);
}

function findEocd(buf: Buffer): number {
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let pos = buf.length - 22; pos >= minPos; pos--) {
    if (buf.readUInt32LE(pos) === SIG_EOCD) return pos;
  }
  throw new Error(`[archiveutils] Not a ZIP archive: end-of-central-directory record not found (${buf.length} bytes)`);
}

function parseCentralDirectory(buf: Buffer): ZipEntryInfo[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const out: ZipEntryInfo[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== SIG_CENTRAL) throw new Error(`[archiveutils] Corrupt central directory at offset ${pos}`);
    const nameLen = buf.readUInt16LE(pos + 28);
    const name = buf.toString("utf-8", pos + 46, pos + 46 + nameLen);
    out.push({
      name,
      compressionMethod: buf.readUInt16LE(pos + 10),
      modified: fromDosDateTime(buf.readUInt16LE(pos + 12), buf.readUInt16LE(pos + 14)),
      crc32: buf.readUInt32LE(pos + 16),
      compressedSize: buf.readUInt32LE(pos + 20),
      uncompressedSize: buf.readUInt32LE(pos + 24),
      offset: buf.readUInt32LE(pos + 42),
      isDirectory: name.endsWith("/"),
    });
    pos += 46 + nameLen + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  return out;
}

function extractEntry(buf: Buffer, h: ZipEntryHeader): Uint8Array {
  const nameLen = buf.readUInt16LE(h.offset + 26);
  const extraLen = buf.readUInt16LE(h.offset + 28);
  const start = h.offset + 30 + nameLen + extraLen;
  const payload = buf.subarray(start, start + h.compressedSize);
  let data: Uint8Array;
  if (h.compressionMethod === 0) data = payload;
  else if (h.compressionMethod === 8) data = Bun.inflateSync(payload as Uint8Array<ArrayBuffer>);
  else throw new Error(`[archiveutils] ${h.name}: unsupported compression method ${h.compressionMethod}`);
  if (((Bun.hash.crc32(data) >>> 0) !== h.crc32 >>> 0)) throw new Error(`[archiveutils] ${h.name}: CRC-32 mismatch (corrupt archive)`);
  return data;
}

async function toBuffer(zipDataOrPath: Uint8Array | string): Promise<Buffer> {
  if (typeof zipDataOrPath !== "string") return Buffer.from(zipDataOrPath.buffer, zipDataOrPath.byteOffset, zipDataOrPath.byteLength);
  const file = Bun.file(zipDataOrPath);
  if (!(await file.exists())) throw new Error(`[archiveutils] ZIP file not found: ${zipDataOrPath}`);
  return Buffer.from(await file.bytes());
}

/**
 * List entry names (directories included, ending in `/`).
 * @param zipDataOrPath - ZIP bytes or a path to a `.zip` file.
 * @example `await archiveutils.listZipEntries("bundle.zip"); // ["docs/", "docs/readme.txt"]`
 */
export async function listZipEntries(zipDataOrPath: Uint8Array | string): Promise<string[]> {
  return parseCentralDirectory(await toBuffer(zipDataOrPath)).map((h) => h.name);
}

/**
 * Detailed metadata for every entry: sizes, CRC, method, directory flag and modified date.
 * @example
 * ```ts
 * for (const e of await archiveutils.listZipDetails(zip)) console.log(e.name, e.uncompressedSize, e.modified);
 * ```
 */
export async function listZipDetails(zipDataOrPath: Uint8Array | string): Promise<ZipEntryInfo[]> {
  return parseCentralDirectory(await toBuffer(zipDataOrPath));
}

/**
 * Extract one entry's bytes, or `null` when it is not in the archive. CRC-verified.
 * @throws On corrupt data or unsupported compression methods.
 * @example `const bytes = await archiveutils.readZipEntry(zip, "docs/readme.txt");`
 */
export async function readZipEntry(zipDataOrPath: Uint8Array | string, entryName: string): Promise<Uint8Array | null> {
  const buf = await toBuffer(zipDataOrPath);
  const entry = parseCentralDirectory(buf).find((h) => h.name === entryName);
  return entry ? extractEntry(buf, entry) : null;
}

/**
 * Extract one entry decoded as UTF-8 text, or `null` when missing.
 * @example `await archiveutils.readZipText(zip, "docs/readme.txt"); // "Hello"`
 */
export async function readZipText(zipDataOrPath: Uint8Array | string, entryName: string): Promise<string | null> {
  const bytes = await readZipEntry(zipDataOrPath, entryName);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

/**
 * Extract every file entry into memory (directories skipped).
 * @example
 * ```ts
 * const files = await archiveutils.unzipToMemory(zip);
 * files.find((f) => f.name === "docs/readme.txt");
 * ```
 */
export async function unzipToMemory(zipDataOrPath: Uint8Array | string): Promise<ZipExtractedEntry[]> {
  const buf = await toBuffer(zipDataOrPath);
  return parseCentralDirectory(buf)
    .filter((h) => !h.isDirectory)
    .map((h) => ({ name: h.name, data: extractEntry(buf, h) }));
}

/**
 * Resolve `entryName` under `destDir`, rejecting zip-slip paths (`../`, absolute names).
 * @throws When the entry would escape `destDir`.
 * @example `archiveutils.safeJoin("/out", "a/b.txt"); // "/out/a/b.txt"`
 */
export function safeJoin(destDir: string, entryName: string): string {
  const root = resolve(destDir);
  const target = resolve(root, entryName);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`[archiveutils] Refusing to extract "${entryName}": path escapes ${root}`);
  }
  return target;
}

/**
 * Extract the whole archive into `destDir` (created as needed). Protected against zip-slip.
 * @returns Number of files written.
 * @example `await archiveutils.unzipToDir("bundle.zip", "./extracted");`
 */
export async function unzipToDir(zipDataOrPath: Uint8Array | string, destDir: string): Promise<number> {
  const buf = await toBuffer(zipDataOrPath);
  let written = 0;
  for (const h of parseCentralDirectory(buf)) {
    const outPath = safeJoin(destDir, h.name);
    if (h.isDirectory) {
      await mkdir(outPath, { recursive: true });
      continue;
    }
    await mkdir(dirname(outPath), { recursive: true });
    await Bun.write(outPath, extractEntry(buf, h));
    written++;
  }
  return written;
}

/**
 * Zip a single file (stored under its base name, preserving mtime).
 * @example `await archiveutils.zipFile("./report.pdf", "./out/report.zip");`
 */
export async function zipFile(srcPath: string, destZipPath: string): Promise<void> {
  const file = Bun.file(srcPath);
  if (!(await file.exists())) throw new Error(`[archiveutils.zipFile] Source not found: ${srcPath}`);
  const name = srcPath.split(/[/\\]/).pop() || "file";
  const mtime = (await stat(srcPath)).mtime;
  await mkdir(dirname(destZipPath), { recursive: true });
  await Bun.write(destZipPath, zipFiles([{ name, data: await file.bytes(), mtime }]));
}

/**
 * Recursively zip a directory (paths relative to `srcDir`, mtimes preserved).
 * @param filter - Optional predicate on the relative POSIX path; return `false` to exclude.
 * @returns Number of files archived.
 * @example
 * ```ts
 * await archiveutils.zipDir("./site", "./site.zip", (rel) => !rel.startsWith(".git/"));
 * ```
 */
export async function zipDir(srcDir: string, destZipPath: string, filter?: (relPath: string) => boolean): Promise<number> {
  const entries: ZipEntryInput[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const full = join(current, item.name);
      const rel = relative(srcDir, full).replace(/\\/g, "/");
      if (item.isDirectory()) await walk(full);
      else if (item.isFile() && (!filter || filter(rel))) {
        entries.push({ name: rel, data: await Bun.file(full).bytes(), mtime: (await stat(full)).mtime });
      }
    }
  };
  await walk(srcDir);
  await mkdir(dirname(destZipPath), { recursive: true });
  await Bun.write(destZipPath, zipFiles(entries));
  return entries.length;
}

export const archiveutils = {
  zipFiles,
  zipFile,
  zipDir,
  listZipEntries,
  listZipDetails,
  readZipEntry,
  readZipText,
  unzipToMemory,
  unzipToDir,
  safeJoin,
  toDosDateTime,
  fromDosDateTime,
};
