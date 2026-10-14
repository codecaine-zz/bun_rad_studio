/**
 * Zip files: create one from files and folders, or extract one into a new folder.
 *
 * Written with node:zlib so it works the same on Windows, macOS and Linux with nothing to install. Files are
 * streamed (never held whole in memory). Not supported, and refused with a clear message: ZIP64 (over 4 GB or
 * 65,535 entries), password-protected archives, and compression methods other than "stored" and "deflate".
 *
 * Extraction is defensive: names that try to leave the target folder ("../", absolute paths, drive letters) are
 * skipped, links inside an archive are not created, declared and actual sizes are enforced (zip bombs), every file's
 * checksum is verified, and a failed extraction removes the folder it created.
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import * as zlib from "zlib";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, splitName, uniqueName, validateName } from "./fmPaths";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_DESCRIPTOR = 0x08074b50;
const U32 = 0xffffffff;
const FLAG_ENCRYPTED = 0x1;
const FLAG_DESCRIPTOR = 0x8;
const FLAG_UTF8 = 0x800;

export interface ZipLimits {
  /** Most bytes that extraction may write in total. */
  maxTotalBytes: number;
  /** Most entries that extraction will process. */
  maxEntries: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxTotalBytes: 8 * 1024 ** 3, maxEntries: 100_000 };

function dosDateTime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function fromDosDateTime(time: number, date: number): Date {
  const year = ((date >> 9) & 0x7f) + 1980;
  const month = Math.max(1, (date >> 5) & 0xf);
  const day = Math.max(1, date & 0x1f);
  return new Date(year, month - 1, day, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2);
}

/**
 * A file being written, where a stream error (disk full, file locked) becomes a normal rejection of the next
 * write or of `finish()`, instead of an unhandled 'error' event that would crash the whole program.
 */
class SafeWriter {
  private error: Error | null = null;
  private readonly stream: fs.WriteStream;
  constructor(path: string, mode?: number) {
    this.stream = fs.createWriteStream(path, { flags: "wx", mode });
    this.stream.on("error", (err) => {
      this.error ??= err;
    });
  }
  async write(buf: Buffer): Promise<void> {
    if (this.error) throw this.error;
    if (this.stream.write(buf)) return;
    await new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        this.stream.off("drain", onDrain);
        this.stream.off("error", onError);
        err ? reject(err) : resolve();
      };
      const onDrain = () => done();
      const onError = (err: Error) => done(err);
      this.stream.once("drain", onDrain);
      this.stream.once("error", onError);
    });
    if (this.error) throw this.error;
  }
  async finish(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.once("finish", () => resolve());
      this.stream.once("error", reject);
      this.stream.end();
    });
    if (this.error) throw this.error;
  }
  /** Stops writing and waits (briefly) until the file is closed, so it can be deleted. */
  async abort(): Promise<void> {
    this.stream.destroy();
    await new Promise<void>((resolve) => {
      if ((this.stream as any).closed) return resolve();
      this.stream.once("close", () => resolve());
      setTimeout(resolve, 300);
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------------------------

interface PlannedEntry {
  /** Name inside the zip, with "/" separators and a trailing "/" for folders. */
  name: string;
  path: string;
  isDir: boolean;
  mode: number;
  mtime: Date;
}

async function planEntries(ctx: FmContext, sources: string[], exclude: Set<string>): Promise<{ entries: PlannedEntry[]; skippedLinks: number }> {
  const p = pathApi(ctx);
  const entries: PlannedEntry[] = [];
  let skippedLinks = 0;
  const walk = async (path: string, zipName: string) => {
    if (exclude.has(path)) return;
    const st = await fsp.lstat(path);
    if (st.isSymbolicLink()) {
      skippedLinks++;
      return;
    }
    if (st.isDirectory()) {
      entries.push({ name: `${zipName}/`, path, isDir: true, mode: st.mode & 0o777, mtime: st.mtime });
      for (const child of (await fsp.readdir(path)).sort()) await walk(p.join(path, child), `${zipName}/${child}`);
    } else if (st.isFile()) {
      entries.push({ name: zipName, path, isDir: false, mode: st.mode & 0o777, mtime: st.mtime });
    }
  };
  for (const s of sources) await walk(s, p.basename(s));
  return { entries, skippedLinks };
}

export interface ZipCreated {
  zipPath: string;
  files: number;
  folders: number;
  skippedLinks: number;
  bytes: number;
}

/** Zips `sources` (all in one folder) into a new .zip beside them. Never overwrites: a taken name gets "(2)". */
export async function createZip(ctx: FmContext, sourcesInput: unknown, nameInput?: unknown): Promise<ZipCreated> {
  if (!Array.isArray(sourcesInput) || sourcesInput.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const p = pathApi(ctx);
  const sources = sourcesInput.map((s) => absolutePath(ctx, s));
  const parent = p.dirname(sources[0]!);
  if (sources.some((s) => p.dirname(s) !== parent)) throw new FmError("BAD_REQUEST", "Select items from one folder to put them in the same zip file.");
  await assertFolder(parent, "The folder");
  assertCreatable(ctx, parent);

  const baseName = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim().replace(/\.zip$/i, "") : sources.length === 1 ? splitName(p.basename(sources[0]!))[0] : "Archive";
  const nameReason = validateName(`${baseName}.zip`, ctx.platform);
  if (nameReason) throw new FmError("BAD_NAME", nameReason);
  const taken = new Set(await fsp.readdir(parent));
  const finalName = uniqueName(`${baseName}.zip`, (n) => taken.has(n));
  const zipPath = p.join(parent, finalName);
  const tempPath = p.join(parent, `.${finalName}.fm-tmp`);

  const { entries, skippedLinks } = await planEntries(ctx, sources, new Set([zipPath, tempPath]));
  if (entries.length > 65_535) throw new FmError("TOO_MANY", "That's too many items for one zip file (the limit is 65,535). Zip them in smaller groups.");

  const out = new SafeWriter(tempPath, 0o644);
  const write = (buf: Buffer) => out.write(buf);
  let offset = 0;
  const central: Buffer[] = [];
  let files = 0;
  let folders = 0;
  let bytes = 0;
  try {
    for (const e of entries) {
      const nameBuf = Buffer.from(e.name, "utf8");
      if (nameBuf.length > 0xffff) throw new FmError("NAME_TOO_LONG", "A file name inside is too long for a zip file.");
      const { time, date } = dosDateTime(e.mtime);
      const localOffset = offset;
      const flags = e.isDir ? FLAG_UTF8 : FLAG_UTF8 | FLAG_DESCRIPTOR;
      const header = Buffer.alloc(30);
      header.writeUInt32LE(SIG_LOCAL, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(flags, 6);
      header.writeUInt16LE(0, 8); // method: patched in the central directory below; decided after reading the file
      header.writeUInt16LE(time, 10);
      header.writeUInt16LE(date, 12);
      header.writeUInt16LE(nameBuf.length, 26);
      let crc = 0;
      let usize = 0;
      let csize = 0;
      let method = 0;
      if (e.isDir) {
        await write(header);
        await write(nameBuf);
        offset += 30 + nameBuf.length;
        folders++;
      } else {
        const stat = await fsp.stat(e.path);
        method = stat.size === 0 ? 0 : 8;
        header.writeUInt16LE(method, 8);
        await write(header);
        await write(nameBuf);
        offset += 30 + nameBuf.length;
        if (method === 8) {
          const source = fs.createReadStream(e.path);
          const deflater = zlib.createDeflateRaw({ level: 6 });
          source.on("data", (chunk) => {
            crc = zlib.crc32(chunk as Buffer, crc);
            usize += (chunk as Buffer).length;
          });
          source.on("error", (err) => deflater.destroy(err));
          source.pipe(deflater);
          for await (const chunk of deflater) {
            csize += (chunk as Buffer).length;
            await write(chunk as Buffer);
          }
          offset += csize;
        }
        if (usize > U32 || csize > U32) throw new FmError("TOO_BIG", `"${e.name}" is over 4 GB, which this zip writer doesn't support.`);
        const descriptor = Buffer.alloc(16);
        descriptor.writeUInt32LE(SIG_DESCRIPTOR, 0);
        descriptor.writeUInt32LE(crc >>> 0, 4);
        descriptor.writeUInt32LE(csize, 8);
        descriptor.writeUInt32LE(usize, 12);
        await write(descriptor);
        offset += 16;
        files++;
        bytes += usize;
      }
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(SIG_CENTRAL, 0);
      cd.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, zip 2.0
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(flags, 8);
      cd.writeUInt16LE(method, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(crc >>> 0, 16);
      cd.writeUInt32LE(csize, 20);
      cd.writeUInt32LE(usize, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      const unixMode = (e.isDir ? 0o040000 : 0o100000) | (e.mode || (e.isDir ? 0o755 : 0o644));
      cd.writeUInt32LE(((unixMode << 16) | (e.isDir ? 0x10 : 0)) >>> 0, 38);
      cd.writeUInt32LE(localOffset, 42);
      central.push(cd, nameBuf);
    }
    const cdSize = central.reduce((n, b) => n + b.length, 0);
    for (const b of central) await write(b);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cdSize, 12);
    end.writeUInt32LE(offset, 16);
    await write(end);
    await out.finish();
    if (offset + cdSize + 22 > U32) throw new FmError("TOO_BIG", "The zip file would be over 4 GB, which this zip writer doesn't support.");
    await fsp.rename(tempPath, zipPath);
  } catch (err) {
    await out.abort();
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
  return { zipPath, files, folders, skippedLinks, bytes };
}

// ---------------------------------------------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------------------------------------------

export interface CentralEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  csize: number;
  usize: number;
  localOffset: number;
  mode: number;
  mtime: Date;
  isDir: boolean;
}

export async function readAt(handle: fsp.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await handle.read(buf, done, length - done, position + done);
    if (bytesRead === 0) throw new FmError("BAD_ZIP", "This zip file is damaged (it ends too early).");
    done += bytesRead;
  }
  return buf;
}

export async function readCentralDirectory(handle: fsp.FileHandle, size: number): Promise<CentralEntry[]> {
  const tailLength = Math.min(size, 65_557);
  const tail = await readAt(handle, size - tailLength, tailLength);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_END) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new FmError("BAD_ZIP", "This doesn't look like a valid zip file.");
  const count = tail.readUInt16LE(at + 10);
  const cdSize = tail.readUInt32LE(at + 12);
  const cdOffset = tail.readUInt32LE(at + 16);
  if (count === 0xffff || cdSize === U32 || cdOffset === U32) throw new FmError("ZIP64", "This is a very large (ZIP64) archive, which isn't supported here.");
  if (cdSize > 128 * 1024 * 1024 || cdOffset + cdSize > size) throw new FmError("BAD_ZIP", "This zip file is damaged.");
  const cd = await readAt(handle, cdOffset, cdSize);
  const entries: CentralEntry[] = [];
  let pos = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > cd.length || cd.readUInt32LE(pos) !== SIG_CENTRAL) throw new FmError("BAD_ZIP", "This zip file is damaged.");
    const flags = cd.readUInt16LE(pos + 8);
    const nameLength = cd.readUInt16LE(pos + 28);
    const extraLength = cd.readUInt16LE(pos + 30);
    const commentLength = cd.readUInt16LE(pos + 32);
    const madeBy = cd.readUInt16LE(pos + 4) >> 8;
    const external = cd.readUInt32LE(pos + 38);
    const rawName = cd.subarray(pos + 46, pos + 46 + nameLength);
    const name = (flags & FLAG_UTF8 ? rawName.toString("utf8") : rawName.toString("latin1")).replace(/\\/g, "/");
    entries.push({
      name,
      flags,
      method: cd.readUInt16LE(pos + 10),
      crc: cd.readUInt32LE(pos + 16),
      csize: cd.readUInt32LE(pos + 20),
      usize: cd.readUInt32LE(pos + 24),
      localOffset: cd.readUInt32LE(pos + 42),
      mode: madeBy === 3 ? (external >>> 16) & 0xffff : 0,
      mtime: fromDosDateTime(cd.readUInt16LE(pos + 12), cd.readUInt16LE(pos + 14)),
      isDir: name.endsWith("/") || (external & 0x10) !== 0,
    });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** A safe relative path for an archive entry name, or the reason it is skipped. */
export function safeEntryPath(name: string, platform: Parameters<typeof validateName>[1]): { path: string[] } | { skip: string } {
  const cleaned = name.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) return { skip: "it has an absolute path" };
  const parts = cleaned.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.length === 0) return { skip: "it has no name" };
  if (parts.includes("..")) return { skip: "it tries to leave the folder" };
  for (const part of parts) {
    const reason = validateName(part, platform);
    if (reason) return { skip: `its name can't be used on this computer (${part})` };
  }
  return { path: parts };
}

export interface ZipExtracted {
  folder: string;
  files: number;
  folders: number;
  bytes: number;
  skipped: string[];
}

/** Extracts `zip` into a NEW folder named after it, inside `destInput` (or beside the zip). */
export async function extractZip(ctx: FmContext, zipInput: unknown, destInput?: unknown, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipExtracted> {
  const zipPath = absolutePath(ctx, zipInput);
  const p = pathApi(ctx);
  const destDir = destInput === undefined ? p.dirname(zipPath) : absolutePath(ctx, destInput);
  await assertFolder(destDir, "The destination");
  assertCreatable(ctx, destDir);
  const st = await fsp.stat(zipPath);
  if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't a zip file.");
  const handle = await fsp.open(zipPath, "r");
  const taken = new Set(await fsp.readdir(destDir));
  const root = p.join(destDir, uniqueName(splitName(p.basename(zipPath))[0] || "Extracted", (n) => taken.has(n)));
  const result: ZipExtracted = { folder: root, files: 0, folders: 0, bytes: 0, skipped: [] };
  try {
    const entries = await readCentralDirectory(handle, st.size);
    if (entries.length > limits.maxEntries) throw new FmError("TOO_MANY", `This zip file has too many items (${entries.length}).`);
    await fsp.mkdir(root);
    for (const e of entries) {
      if (e.flags & FLAG_ENCRYPTED) throw new FmError("ENCRYPTED", "This zip file is password-protected, which isn't supported here.");
      const safe = safeEntryPath(e.name, ctx.platform);
      if ("skip" in safe) {
        result.skipped.push(`"${e.name}" was skipped: ${safe.skip}.`);
        continue;
      }
      const target = p.join(root, ...safe.path);
      const relative = p.relative(root, target);
      if (relative.startsWith("..") || p.isAbsolute(relative)) {
        result.skipped.push(`"${e.name}" was skipped: it tries to leave the folder.`);
        continue;
      }
      if (((e.mode & 0o170000) === 0o120000)) {
        result.skipped.push(`"${e.name}" was skipped: links inside zip files aren't created.`);
        continue;
      }
      if (e.isDir) {
        await fsp.mkdir(target, { recursive: true });
        result.folders++;
        continue;
      }
      if (e.method !== 0 && e.method !== 8) throw new FmError("UNSUPPORTED", `"${e.name}" uses a compression method that isn't supported here.`);
      if (result.bytes + e.usize > limits.maxTotalBytes) throw new FmError("TOO_BIG", "Extracting this would use more disk space than the safety limit allows.");
      await fsp.mkdir(p.dirname(target), { recursive: true });
      const header = await readAt(handle, e.localOffset, 30);
      if (header.readUInt32LE(0) !== SIG_LOCAL) throw new FmError("BAD_ZIP", "This zip file is damaged.");
      const dataStart = e.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      if (dataStart + e.csize > st.size) throw new FmError("BAD_ZIP", "This zip file is damaged (it ends too early).");
      await extractEntry(zipPath, e, dataStart, target);
      result.files++;
      result.bytes += e.usize;
      if (ctx.platform !== "win32" && e.mode) await fsp.chmod(target, e.mode & 0o777).catch(() => {});
      await fsp.utimes(target, e.mtime, e.mtime).catch(() => {});
    }
  } catch (err) {
    await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
    throw err;
  } finally {
    await handle.close();
  }
  return result;
}

async function extractEntry(zipPath: string, e: CentralEntry, dataStart: number, target: string): Promise<void> {
  const out = new SafeWriter(target);
  let crc = 0;
  let written = 0;
  try {
    if (e.csize > 0 || e.usize > 0) {
      const raw = fs.createReadStream(zipPath, { start: dataStart, end: dataStart + Math.max(e.csize, 1) - 1 });
      const stream: NodeJS.ReadableStream = e.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
      raw.on("error", (err) => (stream as any).destroy?.(err));
      for await (const chunk of stream) {
        const buf = chunk as Buffer;
        written += buf.length;
        // The declared size is a promise: a file that grows past it is a zip bomb or damaged.
        if (written > e.usize) throw new FmError("BAD_ZIP", `"${e.name}" is larger than the zip file says. The archive is damaged or unsafe.`);
        crc = zlib.crc32(buf, crc);
        await out.write(buf);
      }
    }
    if (written !== e.usize || (crc >>> 0) !== e.crc) throw new FmError("BAD_ZIP", `"${e.name}" is damaged (its checksum doesn't match).`);
    await out.finish();
  } catch (err: any) {
    await out.abort();
    if (err?.code === "Z_DATA_ERROR" || err?.code === "Z_BUF_ERROR") throw new FmError("BAD_ZIP", `"${e.name}" is damaged and can't be read.`);
    throw err;
  }
}

/** The whole content of one zip entry, checked against its size and checksum; refuses entries bigger than `limit` bytes. */
export async function readZipEntry(handle: fsp.FileHandle, fileSize: number, e: CentralEntry, limit: number): Promise<Buffer> {
  if (e.flags & FLAG_ENCRYPTED) throw new FmError("ENCRYPTED", "This zip file is password-protected, which isn't supported here.");
  if (e.method !== 0 && e.method !== 8) throw new FmError("UNSUPPORTED", `"${e.name}" uses a compression method that isn't supported here.`);
  if (e.usize > limit || e.csize > limit) throw new FmError("TOO_BIG", `"${e.name}" is bigger than the safety limit (${Math.round(limit / 1048576)} MB).`);
  const header = await readAt(handle, e.localOffset, 30);
  if (header.readUInt32LE(0) !== SIG_LOCAL) throw new FmError("BAD_ZIP", "This zip file is damaged.");
  const dataStart = e.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  if (dataStart + e.csize > fileSize) throw new FmError("BAD_ZIP", "This zip file is damaged (it ends too early).");
  const raw = e.csize ? await readAt(handle, dataStart, e.csize) : Buffer.alloc(0);
  let data: Buffer;
  try {
    data = e.method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, Math.min(limit, e.usize + 1)) }) : raw;
  } catch (err: any) {
    if (err?.code === "ERR_BUFFER_TOO_LARGE") throw new FmError("BAD_ZIP", `"${e.name}" is larger than the zip file says. The archive is damaged or unsafe.`);
    throw new FmError("BAD_ZIP", `"${e.name}" is damaged and can't be read.`);
  }
  if (data.length !== e.usize || (zlib.crc32(data) >>> 0) !== e.crc) throw new FmError("BAD_ZIP", `"${e.name}" is damaged (its checksum doesn't match).`);
  return data;
}
