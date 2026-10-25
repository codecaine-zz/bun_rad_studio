/**
 * Built-in archive work, streaming and safe: zip and tar.gz are made and read here with nothing to install, zip and
 * tar.gz are converted into each other without unpacking to disk, and single files can be gzip'd or brotli'd.
 *
 * Reading is defensive: names that leave the target folder ("../", absolute paths, drive letters) are skipped, links
 * are never created, the number of items and the total size are limited (so a "zip bomb" is refused), and the
 * checksums of zip entries are verified. Everything is written to a path that must not exist yet.
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { Transform, pipeline, type Readable } from "stream";
import * as zlib from "zlib";
import { paxRecord } from "../rad/modules/tarutils";
import { ConvError } from "./fmConvCommon";
import { ZipFileWriter } from "./fmConvZip";
import { readCentralDirectory, readZipEntry, safeEntryPath } from "./fmZip";
import type { Platform } from "./fmPaths";

export interface ArchiveLimits {
  /** Most bytes that may be written or produced in total. */
  maxBytes: number;
  /** Most items in one archive. */
  maxEntries: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = { maxBytes: 8 * 1024 ** 3, maxEntries: 100_000 };
const MAX_ENTRY_IN_MEMORY = 512 * 1024 ** 2;
const BLOCK = 512;

// ---------------------------------------------------------------------------------------------------------------
// Output files
// ---------------------------------------------------------------------------------------------------------------

/** A new file written through an optional transform (gzip), where a stream error is a normal rejection. */
class Out {
  private error: Error | null = null;
  private readonly file: fs.WriteStream;
  private readonly head: NodeJS.WritableStream;
  /** True once this stream really created the file (an EEXIST means it is someone else's and must not be removed). */
  private created = false;
  /** Rejects when the file stream fails, so nothing waiting for a drain or a finish is left waiting for an event that can't come. */
  private readonly failure: Promise<never>;
  constructor(private readonly path: string, transform?: Transform) {
    let fail: (e: Error) => void = () => {};
    this.failure = new Promise<never>((_, reject) => (fail = reject));
    this.failure.catch(() => {});
    this.file = fs.createWriteStream(path, { flags: "wx" });
    this.file.on("open", () => (this.created = true));
    this.file.on("error", (e) => { this.error ??= e; fail(e); });
    if (transform) {
      transform.on("error", (e) => { this.error ??= e; fail(e); });
      transform.pipe(this.file);
      this.head = transform;
    } else this.head = this.file;
  }
  async write(buf: Buffer): Promise<void> {
    if (this.error) throw this.error;
    if (this.head.write(buf)) return;
    let cleanup = () => {};
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const onDrain = () => resolve();
          const onError = (e: Error) => reject(e);
          cleanup = () => { this.head.off("drain", onDrain); this.head.off("error", onError); };
          this.head.once("drain", onDrain);
          this.head.once("error", onError);
        }),
        this.failure,
      ]);
    } finally {
      cleanup();
    }
    if (this.error) throw this.error;
  }
  async finish(): Promise<void> {
    if (this.error) throw this.error;
    let cleanup = () => {};
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const onFinish = () => resolve();
          const onError = (e: Error) => reject(e);
          cleanup = () => { this.file.off("finish", onFinish); this.file.off("error", onError); };
          this.file.once("finish", onFinish);
          this.file.once("error", onError);
          this.head.end();
        }),
        this.failure,
      ]);
    } finally {
      cleanup();
    }
    if (this.error) throw this.error;
  }
  /** Stops and removes the file (it was created here with "wx", so it is ours). Resolves once the file is gone. */
  abort(): Promise<void> {
    this.head.end();
    this.file.destroy();
    return new Promise((resolve) => {
      const remove = () => {
        try { if (this.created) fs.rmSync(this.path, { force: true }); } catch {}
        resolve();
      };
      if (this.file.closed) remove();
      else this.file.once("close", remove);
    });
  }
}

/** Stops a stream that produces more than `limit` bytes: a decompression bomb. */
function capped(limit: number, what: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      if (seen > limit) cb(new ConvError(`${what} would be bigger than the safety limit (${Math.round(limit / 1048576)} MB) once unpacked, so it was stopped.`));
      else cb(null, chunk);
    },
  });
}

/** Streams joined so that an error anywhere ends the last one with that error (a plain .pipe() would wait forever). */
function chain(...streams: [Readable, ...NodeJS.ReadWriteStream[]]): Readable {
  return (pipeline as (...args: unknown[]) => Readable)(...streams, () => {});
}

async function pump(source: NodeJS.ReadableStream, out: Out): Promise<void> {
  for await (const chunk of source) await out.write(chunk as Buffer);
}

function translate(err: any, what: string): never {
  if (err instanceof ConvError) throw err;
  if (/^ZSTD_error_(?:frameParameter_windowTooLarge|memory_allocation|dictionary)/.test(String(err?.code))) throw new ConvError(`${what} needs more memory to open than is allowed (it was made with a very large window setting), so it was not opened.`);
  if (err?.code === "Z_DATA_ERROR" || err?.code === "Z_BUF_ERROR" || err?.code === "ERR_BROTLI_DECODE" || /^ZSTD_error_/.test(String(err?.code)) || /incorrect header check|unexpected end|invalid|corrupt/i.test(String(err?.message))) throw new ConvError(`${what} is damaged or isn't the kind of file it says it is.`);
  throw err;
}

// ---------------------------------------------------------------------------------------------------------------
// Zstandard: reading and writing
// ---------------------------------------------------------------------------------------------------------------

/** zstd's own "magic number" at the start of every frame; the little-endian 0xFD2FB528. */
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/**
 * Watches the compressed bytes as they pass and fails when the file ends in the middle of a zstd frame. The decoder
 * itself does not notice a file that was cut short (it just stops early), which would silently give an incomplete
 * result, so the frame, block and trailer structure is followed here (it is cheap: only the small headers are read).
 */
function zstdCompleteness(what: string): Transform {
  // "skip" counts bytes of a block body or trailer still to pass; "need" collects the bytes of a header being read.
  let state: "magic" | "frame-header" | "block-header" | "skip-body" | "skip-trailer" | "skippable-size" | "skippable-body" = "magic";
  let need: number[] = [];
  let skip = 0;
  let wantChecksum = false;
  let lastBlock = false;
  let headerLength = 0;
  let started = false;
  const finishFrame = () => { state = "magic"; need = []; };
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      started = true;
      for (let i = 0; i < chunk.length; ) {
        if (state === "skip-body" || state === "skip-trailer" || state === "skippable-body") {
          const n = Math.min(skip, chunk.length - i);
          skip -= n;
          i += n;
          if (skip > 0) continue;
          if (state === "skip-body") { if (lastBlock) { if (wantChecksum) { state = "skip-trailer"; skip = 4; } else finishFrame(); } else { state = "block-header"; need = []; } } else finishFrame();
          continue;
        }
        need.push(chunk[i++]!);
        if (state === "magic" && need.length === 4) {
          const m = (need[0]! | (need[1]! << 8) | (need[2]! << 16) | (need[3]! << 24)) >>> 0;
          if (((m & 0xfffffff0) >>> 0) === 0x184d2a50) { state = "skippable-size"; need = []; }
          else if (need.every((b, k) => b === ZSTD_MAGIC[k])) { state = "frame-header"; need = []; headerLength = 0; }
          else { cb(new ConvError(`${what} is damaged or isn't the kind of file it says it is.`)); return; }
        } else if (state === "skippable-size" && need.length === 4) {
          skip = (need[0]! | (need[1]! << 8) | (need[2]! << 16) | (need[3]! << 24)) >>> 0;
          state = "skippable-body";
          need = [];
          if (skip === 0) finishFrame();
        } else if (state === "frame-header") {
          if (headerLength === 0) {
            const fhd = need[0]!;
            const fcsFlag = fhd >> 6;
            const single = (fhd & 0x20) !== 0;
            wantChecksum = (fhd & 0x04) !== 0;
            const dict = [0, 1, 2, 4][fhd & 3]!;
            const fcs = fcsFlag === 0 ? (single ? 1 : 0) : [0, 2, 4, 8][fcsFlag]!;
            headerLength = 1 + (single ? 0 : 1) + dict + fcs;
          }
          if (need.length === headerLength) { state = "block-header"; need = []; }
        } else if (state === "block-header" && need.length === 3) {
          const h = need[0]! | (need[1]! << 8) | (need[2]! << 16);
          lastBlock = (h & 1) === 1;
          const type = (h >> 1) & 3;
          if (type === 3) { cb(new ConvError(`${what} is damaged or isn't the kind of file it says it is.`)); return; }
          skip = type === 1 ? 1 : h >> 3;
          need = [];
          if (skip === 0) { if (lastBlock) { if (wantChecksum) { state = "skip-trailer"; skip = 4; } else finishFrame(); } } else state = "skip-body";
        }
      }
      cb(null, chunk);
    },
    flush(cb) {
      if (started && (state !== "magic" || need.length > 0)) cb(new ConvError(`${what} ends too early: the file was cut short (an incomplete download or a damaged copy), so it was not opened.`));
      else cb();
    },
  });
}

/** Compresses one file with zstd (level 1 to 19). */
export async function zstdFile(input: string, output: string, level = 3): Promise<void> {
  const out = new Out(output, zlib.createZstdCompress({ params: { [zlib.constants.ZSTD_c_compressionLevel]: level, [zlib.constants.ZSTD_c_checksumFlag]: 1 } }));
  try {
    await pump(fs.createReadStream(input), out);
    await out.finish();
  } catch (err) {
    await out.abort();
    throw err;
  }
}

/** The stream of the contents of a .zst file: checked for being complete, decompressed, and capped at `limit` bytes. */
function unzstdStream(input: string, limit: number, what: string): Readable {
  return chain(fs.createReadStream(input), zstdCompleteness(what), zlib.createZstdDecompress(), capped(limit, what));
}

export async function unzstdFile(input: string, output: string, limit = DEFAULT_ARCHIVE_LIMITS.maxBytes): Promise<void> {
  if ((await fsp.stat(input)).size === 0) throw new ConvError("The file is empty: there is nothing to open.");
  const out = new Out(output);
  try {
    await pump(unzstdStream(input, limit, "This file"), out);
    await out.finish();
  } catch (err) {
    await out.abort();
    translate(err, "This file");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Single files: gzip and brotli
// ---------------------------------------------------------------------------------------------------------------

export async function gzipFile(input: string, output: string, level = 6): Promise<void> {
  const out = new Out(output, zlib.createGzip({ level }));
  try {
    await pump(fs.createReadStream(input), out);
    await out.finish();
  } catch (err) {
    await out.abort();
    throw err;
  }
}

export async function gunzipFile(input: string, output: string, limit = DEFAULT_ARCHIVE_LIMITS.maxBytes): Promise<void> {
  const out = new Out(output);
  try {
    await pump(chain(fs.createReadStream(input), zlib.createGunzip(), capped(limit, "This file")), out);
    await out.finish();
  } catch (err) {
    await out.abort();
    translate(err, "This file");
  }
}

export async function brotliFile(input: string, output: string): Promise<void> {
  const out = new Out(output, zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }));
  try {
    await pump(fs.createReadStream(input), out);
    await out.finish();
  } catch (err) {
    await out.abort();
    throw err;
  }
}

export async function unbrotliFile(input: string, output: string, limit = DEFAULT_ARCHIVE_LIMITS.maxBytes): Promise<void> {
  const out = new Out(output);
  try {
    await pump(chain(fs.createReadStream(input), zlib.createBrotliDecompress(), capped(limit, "This file")), out);
    await out.finish();
  } catch (err) {
    await out.abort();
    translate(err, "This file");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// tar: writing and reading
// ---------------------------------------------------------------------------------------------------------------

function octal(buf: Buffer, value: number, offset: number, width: number): void {
  buf.write(`${value.toString(8).padStart(width - 1, "0")}\0`, offset, "ascii");
}

function rawHeader(name: string, prefix: string, size: number, type: string, mode: number, mtime: Date): Buffer {
  const h = Buffer.alloc(BLOCK);
  h.write(name, 0, 100, "utf8");
  octal(h, mode & 0o7777, 100, 8);
  octal(h, 0, 108, 8);
  octal(h, 0, 116, 8);
  if (size > 0o77777777777) throw new ConvError("A file is over 8 GB, which the tar format used here can't hold.");
  octal(h, size, 124, 12);
  octal(h, Math.max(0, Math.floor(mtime.getTime() / 1000)), 136, 12);
  h.write(type, 156, "ascii");
  h.write("ustar\0", 257, "ascii");
  h.write("00", 263, "ascii");
  h.write(prefix, 345, 155, "utf8");
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i]!;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return h;
}

/** The header blocks of one tar item (a PAX record first when the name is too long for ustar). */
function tarHeader(name: string, size: number, type: "0" | "5", mode: number, mtime: Date): Buffer[] {
  const out: Buffer[] = [];
  let fieldName = name;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    let split = -1;
    for (let i = name.indexOf("/"); i !== -1; i = name.indexOf("/", i + 1)) {
      if (Buffer.byteLength(name.slice(0, i)) <= 155 && Buffer.byteLength(name.slice(i + 1)) <= 100 && name.slice(i + 1)) { split = i; break; }
    }
    if (split > 0) { prefix = name.slice(0, split); fieldName = name.slice(split + 1); }
    else {
      const pax = Buffer.from(paxRecord("path", name), "utf8");
      out.push(rawHeader("PaxHeader", "", pax.length, "x", 0o644, mtime), pax, Buffer.alloc((BLOCK - (pax.length % BLOCK)) % BLOCK));
      fieldName = Buffer.from(name).subarray(-100).toString("utf8").replace(/^\uFFFD+/, "");
    }
  }
  out.push(rawHeader(fieldName, prefix, size, type, mode, mtime));
  return out;
}

export interface TarItem {
  name: string;
  type: "file" | "dir" | "link" | "other";
  size: number;
  mode: number;
  mtime: Date;
  /** The file's bytes; must be read to the end or dropped before asking for the next item. */
  data: () => AsyncGenerator<Buffer>;
}

class Puller {
  private buf: Buffer = Buffer.alloc(0);
  private done = false;
  private readonly it: AsyncIterator<Buffer>;
  constructor(source: AsyncIterable<Buffer>) {
    this.it = source[Symbol.asyncIterator]();
  }
  private async fill(): Promise<boolean> {
    if (this.done) return false;
    const r = await this.it.next();
    if (r.done) { this.done = true; return false; }
    this.buf = this.buf.length ? Buffer.concat([this.buf, r.value]) : r.value;
    return true;
  }
  /** Exactly `n` bytes, or fewer at the end of the stream. */
  async take(n: number): Promise<Buffer> {
    while (this.buf.length < n && (await this.fill())) { /* keep reading */ }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  /** Up to `n` bytes, whatever is available next. */
  async some(n: number): Promise<Buffer> {
    if (!this.buf.length) await this.fill();
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  async close(): Promise<void> {
    if (this.done) return;
    this.done = true;
    try { await this.it.return?.(); } catch {}
  }
}

function tarNumber(h: Buffer, off: number, len: number): number {
  if (h[off]! & 0x80) {
    let n = 0;
    for (let i = 1; i < len; i++) n = n * 256 + h[off + i]!;
    return n;
  }
  const t = h.toString("ascii", off, off + len).replace(/\0.*$/s, "").trim();
  return t ? parseInt(t, 8) : 0;
}

/** Reads the items of a tar stream one by one. Names come from PAX and GNU long-name records as well as ustar. */
export async function* tarItems(source: AsyncIterable<Buffer>, limits: ArchiveLimits): AsyncGenerator<TarItem> {
  const pull = new Puller(source);
  try {
    let longName: string | null = null;
    let paxSize: number | null = null;
    let entries = 0;
    let total = 0;
    for (;;) {
      const h = await pull.take(BLOCK);
      if (h.length < BLOCK) {
        if (h.length === 0) return;
        throw new ConvError("This archive is damaged (it ends in the middle of an item).");
      }
      if (h.every((b) => b === 0)) return;
      let sum = 0;
      for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i]!;
      if (tarNumber(h, 148, 8) !== sum) throw new ConvError("This isn't a valid tar archive (a header's checksum doesn't match). It may be damaged or a different kind of file.");
      let size = tarNumber(h, 124, 12);
      if (paxSize !== null) size = paxSize;
      const flag = String.fromCharCode(h[156] || 48);
      const padding = (BLOCK - (size % BLOCK)) % BLOCK;
      const skipData = async () => { let left = size + padding; while (left > 0) { const c = await pull.some(Math.min(left, 1 << 20)); if (!c.length) throw new ConvError("This archive is damaged (it ends too early)."); left -= c.length; } };
      if (flag === "x" || flag === "L" || flag === "K") {
        if (size > 1 << 20) throw new ConvError("This archive is damaged (a name record is too big).");
        const body = await pull.take(size);
        await pull.take(padding);
        if (flag === "x") {
          for (const line of body.toString("utf8").split("\n")) {
            const m = /^\d+ ([^=]+)=(.*)$/.exec(line);
            if (m?.[1] === "path") longName = m[2]!;
            if (m?.[1] === "size" && /^\d+$/.test(m[2]!)) {
              const parsed = Number(m[2]);
              if (Number.isSafeInteger(parsed) && parsed >= 0) paxSize = parsed;
            }
          }
        } else if (flag === "L") longName = body.toString("utf8").replace(/\0+$/, "");
        continue;
      }
      if (flag === "g") {
        longName = null;
        paxSize = null;
        await skipData();
        continue;
      }
      const base = h.toString("utf8", 0, 100).replace(/\0.*$/s, "");
      const prefix = h.toString("ascii", 257, 262) === "ustar" ? h.toString("utf8", 345, 500).replace(/\0.*$/s, "") : "";
      const name = longName ?? (prefix ? `${prefix}/${base}` : base);
      longName = null;
      paxSize = null;
      const type = flag === "0" || flag === "7" ? "file" : flag === "5" ? "dir" : flag === "1" || flag === "2" ? "link" : "other";
      if (++entries > limits.maxEntries) throw new ConvError(`This archive has too many items (more than ${limits.maxEntries}).`);
      if (type === "file") {
        total += size;
        if (total > limits.maxBytes) throw new ConvError("Unpacking this would use more disk space than the safety limit allows.");
      }
      let remaining = type === "file" ? size : 0;
      const dataLeft = type === "file" ? 0 : size;
      let consumed = false;
      yield {
        name, type, size, mode: tarNumber(h, 100, 8), mtime: new Date(tarNumber(h, 136, 12) * 1000),
        data: async function* () {
          consumed = true;
          while (remaining > 0) {
            const c = await pull.some(Math.min(remaining, 1 << 20));
            if (!c.length) throw new ConvError("This archive is damaged (it ends too early).");
            remaining -= c.length;
            yield c;
          }
          await pull.take(padding);
        },
      };
      if (!consumed) {
        let left = (type === "file" ? size : dataLeft) + padding;
        while (left > 0) {
          const c = await pull.some(Math.min(left, 1 << 20));
          if (!c.length) throw new ConvError("This archive is damaged (it ends too early).");
          left -= c.length;
        }
      } else if (remaining > 0) throw new ConvError("An item was not read completely.");
    }
  } finally {
    await pull.close();
  }
}

/** The bytes of a tar file: read as they are, or through gzip or zstd when the first bytes say it is compressed. */
function tarSource(path: string, limits: ArchiveLimits): AsyncIterable<Buffer> {
  const head = Buffer.alloc(4);
  const fd = fs.openSync(path, "r");
  try { fs.readSync(fd, head, 0, 4, 0); } finally { fs.closeSync(fd); }
  const src = fs.createReadStream(path);
  const cap = limits.maxBytes + limits.maxEntries * 1024;
  if (head[0] === 0x1f && head[1] === 0x8b) return chain(src, zlib.createGunzip(), capped(cap, "This archive")) as unknown as AsyncIterable<Buffer>;
  if (ZSTD_MAGIC.every((b, i) => head[i] === b)) return chain(src, zstdCompleteness("This archive"), zlib.createZstdDecompress(), capped(cap, "This archive")) as unknown as AsyncIterable<Buffer>;
  return src;
}

// ---------------------------------------------------------------------------------------------------------------
// Creating archives from files and folders
// ---------------------------------------------------------------------------------------------------------------

interface Planned {
  name: string;
  path: string;
  dir: boolean;
  mode: number;
  mtime: Date;
  size: number;
}

/** Every file and folder to archive, named relative to the folder that holds the selection. Links are skipped. */
async function plan(sources: string[], limits: ArchiveLimits): Promise<{ items: Planned[]; skippedLinks: number }> {
  const items: Planned[] = [];
  let skippedLinks = 0;
  const walk = async (path: string, name: string) => {
    const st = await fsp.lstat(path);
    if (st.isSymbolicLink()) { skippedLinks++; return; }
    if (items.length >= limits.maxEntries) throw new ConvError(`That's too many items for one archive (the limit is ${limits.maxEntries}).`);
    if (st.isDirectory()) {
      items.push({ name: `${name}/`, path, dir: true, mode: st.mode & 0o777, mtime: st.mtime, size: 0 });
      for (const child of (await fsp.readdir(path)).sort()) await walk(nodePath.join(path, child), `${name}/${child}`);
    } else if (st.isFile()) items.push({ name, path, dir: false, mode: st.mode & 0o777, mtime: st.mtime, size: st.size });
  };
  for (const s of sources) await walk(s, nodePath.basename(s));
  return { items, skippedLinks };
}

async function* fileChunks(path: string, expected: number): AsyncGenerator<Buffer> {
  let seen = 0;
  for await (const chunk of fs.createReadStream(path)) {
    seen += (chunk as Buffer).length;
    if (seen > expected) throw new ConvError(`"${nodePath.basename(path)}" changed while it was being archived. Try again when nothing is using it.`);
    yield chunk as Buffer;
  }
  if (seen !== expected) throw new ConvError(`"${nodePath.basename(path)}" changed while it was being archived. Try again when nothing is using it.`);
}

export interface Made {
  files: number;
  folders: number;
  skippedLinks: number;
}

export async function createZipFrom(sources: string[], output: string, limits = DEFAULT_ARCHIVE_LIMITS): Promise<Made> {
  const { items, skippedLinks } = await plan(sources, limits);
  if (!items.length) throw new ConvError("There is nothing to put in the zip file (links are skipped, and empty selections have no files).");
  const zip = await ZipFileWriter.create(output);
  let files = 0;
  let folders = 0;
  let bytes = 0;
  try {
    for (const it of items) {
      if (it.dir) { await zip.add(it.name, Buffer.alloc(0), it.mtime, it.mode || 0o755); folders++; continue; }
      bytes += it.size;
      if (bytes > limits.maxBytes) throw new ConvError("That is more data than the safety limit allows for one archive.");
      await zip.addStream(it.name, fileChunks(it.path, it.size), it.mtime, it.mode || 0o644);
      files++;
    }
    await zip.finish();
  } catch (err) {
    await zip.abort();
    throw err;
  }
  return { files, folders, skippedLinks };
}

export async function createTarGzFrom(sources: string[], output: string, limits = DEFAULT_ARCHIVE_LIMITS, level = 6): Promise<Made> {
  return await createTarFrom(sources, output, limits, zlib.createGzip({ level }));
}

export async function createTarZstFrom(sources: string[], output: string, limits = DEFAULT_ARCHIVE_LIMITS, level = 3): Promise<Made> {
  return await createTarFrom(sources, output, limits, zlib.createZstdCompress({ params: { [zlib.constants.ZSTD_c_compressionLevel]: level, [zlib.constants.ZSTD_c_checksumFlag]: 1 } }));
}

async function createTarFrom(sources: string[], output: string, limits: ArchiveLimits, compressor: Transform): Promise<Made> {
  const { items, skippedLinks } = await plan(sources, limits);
  if (!items.length) { compressor.destroy(); throw new ConvError("There is nothing to put in the archive (links are skipped, and empty selections have no files)."); }
  const out = new Out(output, compressor);
  let files = 0;
  let folders = 0;
  let bytes = 0;
  try {
    for (const it of items) {
      for (const b of tarHeader(it.name, it.dir ? 0 : it.size, it.dir ? "5" : "0", it.mode || (it.dir ? 0o755 : 0o644), it.mtime)) await out.write(b);
      if (it.dir) { folders++; continue; }
      bytes += it.size;
      if (bytes > limits.maxBytes) throw new ConvError("That is more data than the safety limit allows for one archive.");
      for await (const c of fileChunks(it.path, it.size)) await out.write(c);
      const pad = (BLOCK - (it.size % BLOCK)) % BLOCK;
      if (pad) await out.write(Buffer.alloc(pad));
      files++;
    }
    await out.write(Buffer.alloc(BLOCK * 2));
    await out.finish();
  } catch (err) {
    await out.abort();
    throw err;
  }
  return { files, folders, skippedLinks };
}

// ---------------------------------------------------------------------------------------------------------------
// Extracting tar.gz
// ---------------------------------------------------------------------------------------------------------------

export interface Extracted {
  files: number;
  folders: number;
  bytes: number;
  skipped: string[];
}

/** Unpacks a .tar.gz (or .tar) into `dest`, which must exist and be empty or new. */
export async function extractTarGz(input: string, dest: string, platform: Platform, limits = DEFAULT_ARCHIVE_LIMITS): Promise<Extracted> {
  const result: Extracted = { files: 0, folders: 0, bytes: 0, skipped: [] };
  const skip = (name: string, why: string) => { if (result.skipped.length < 50) result.skipped.push(`"${name}" was skipped: ${why}.`); };
  try {
    for await (const item of tarItems(tarSource(input, limits), limits)) {
      if (item.type === "link") { skip(item.name, "links inside archives aren't created"); continue; }
      if (item.type === "other") { skip(item.name, "it isn't a file or folder"); continue; }
      const safe = safeEntryPath(item.name, platform);
      if ("skip" in safe) { skip(item.name, safe.skip); continue; }
      const target = nodePath.join(dest, ...safe.path);
      const rel = nodePath.relative(dest, target);
      if (rel.startsWith("..") || nodePath.isAbsolute(rel)) { skip(item.name, "it tries to leave the folder"); continue; }
      if (item.type === "dir") {
        await fsp.mkdir(target, { recursive: true });
        result.folders++;
        continue;
      }
      await fsp.mkdir(nodePath.dirname(target), { recursive: true });
      const out = fs.createWriteStream(target, { flags: "wx", mode: platform === "win32" ? undefined : (item.mode & 0o777) || 0o644 });
      let failed: Error | null = null;
      out.on("error", (e) => { failed ??= e; });
      try {
        for await (const chunk of item.data()) {
          if (!out.write(chunk)) {
            await new Promise<void>((res, rej) => {
              const onDrain = () => { out.off("error", onErr); res(); };
              const onErr = (e: Error) => { out.off("drain", onDrain); rej(e); };
              out.once("drain", onDrain);
              out.once("error", onErr);
            });
          }
          if (failed) throw failed;
        }
        await new Promise<void>((res, rej) => { out.once("finish", res); out.once("error", rej); out.end(); });
      } catch (err: any) {
        out.destroy();
        if (err?.code === "EEXIST") { skip(item.name, "the same name appears twice in the archive (the first was kept)"); for await (const _c of item.data()) { /* drained */ } continue; }
        throw err;
      }
      result.files++;
      result.bytes += item.size;
      await fsp.utimes(target, item.mtime, item.mtime).catch(() => {});
    }
  } catch (err) {
    translate(err, "This archive");
  }
  if (result.files + result.folders === 0) throw new ConvError(result.skipped.length ? "Nothing in this archive could be unpacked safely." : "This archive is empty.");
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// zip <-> tar.gz without unpacking to disk
// ---------------------------------------------------------------------------------------------------------------

export async function zipToTarGz(input: string, output: string, platform: Platform, limits = DEFAULT_ARCHIVE_LIMITS): Promise<Extracted> {
  const handle = await fsp.open(input, "r");
  const result: Extracted = { files: 0, folders: 0, bytes: 0, skipped: [] };
  let out: Out | null = null;
  try {
    const size = (await handle.stat()).size;
    let entries;
    try {
      entries = await readCentralDirectory(handle, size);
    } catch (err: any) {
      throw new ConvError(String(err?.message ?? "This isn't a valid zip file."));
    }
    if (entries.length > limits.maxEntries) throw new ConvError(`This zip file has too many items (${entries.length}).`);
    out = new Out(output, zlib.createGzip({ level: 6 }));
    for (const e of entries) {
      const safe = safeEntryPath(e.name, platform);
      if ("skip" in safe) { result.skipped.push(`"${e.name}" was skipped: ${safe.skip}.`); continue; }
      if ((e.mode & 0o170000) === 0o120000) { result.skipped.push(`"${e.name}" was skipped: links inside zip files aren't copied.`); continue; }
      const name = safe.path.join("/");
      if (e.isDir) {
        for (const b of tarHeader(`${name}/`, 0, "5", e.mode & 0o777 || 0o755, e.mtime)) await out.write(b);
        result.folders++;
        continue;
      }
      if (result.bytes + e.usize > limits.maxBytes) throw new ConvError("Converting this would use more space than the safety limit allows.");
      let data: Buffer;
      try {
        data = await readZipEntry(handle, size, e, MAX_ENTRY_IN_MEMORY);
      } catch (err: any) {
        throw new ConvError(String(err?.message ?? err));
      }
      for (const b of tarHeader(name, data.length, "0", e.mode & 0o777 || 0o644, e.mtime)) await out.write(b);
      await out.write(data);
      const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
      if (pad) await out.write(Buffer.alloc(pad));
      result.files++;
      result.bytes += data.length;
    }
    await out.write(Buffer.alloc(BLOCK * 2));
    await out.finish();
  } catch (err) {
    await out?.abort();
    throw err;
  } finally {
    await handle.close();
  }
  if (result.files + result.folders === 0) throw new ConvError(result.skipped.length ? "Nothing in this zip file could be copied safely." : "This zip file is empty.");
  return result;
}

export async function tarGzToZip(input: string, output: string, platform: Platform, limits = DEFAULT_ARCHIVE_LIMITS): Promise<Extracted> {
  const result: Extracted = { files: 0, folders: 0, bytes: 0, skipped: [] };
  const zip = await ZipFileWriter.create(output);
  try {
    for await (const item of tarItems(tarSource(input, limits), limits)) {
      if (item.type === "link") { result.skipped.push(`"${item.name}" was skipped: links inside archives aren't copied.`); continue; }
      if (item.type === "other") { result.skipped.push(`"${item.name}" was skipped: it isn't a file or folder.`); continue; }
      const safe = safeEntryPath(item.name, platform);
      if ("skip" in safe) { result.skipped.push(`"${item.name}" was skipped: ${safe.skip}.`); continue; }
      const name = safe.path.join("/");
      if (item.type === "dir") { await zip.add(`${name}/`, Buffer.alloc(0), item.mtime, item.mode || 0o755); result.folders++; continue; }
      await zip.addStream(name, item.data(), item.mtime, item.mode || 0o644);
      result.files++;
      result.bytes += item.size;
    }
    await zip.finish();
  } catch (err) {
    await zip.abort();
    translate(err, "This archive");
  }
  if (result.files + result.folders === 0) throw new ConvError(result.skipped.length ? "Nothing in this archive could be copied safely." : "This archive is empty.");
  return result;
}
