/**
 * Shared pieces of the "More info" operations (`info/...`): the shape of what they answer, safe reading of a file's
 * start, and starting helper programs without a shell (argument list, time limit, output limit).
 *
 * Everything read from a file is untrusted: text is clamped and stripped of control characters, row counts are
 * capped, and nothing here ever runs, opens or fetches anything named by the file.
 */
import { constants as fsc, promises as fsp, type Stats } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, uniqueName, validateName } from "./fmPaths";
import { childEnv } from "./fmTools";
import { resolveTool } from "./fmToolDetect";

export const MAX_VALUE = 2000;
export const MAX_ROWS = 2000;
/** How much of a file's start the parsers may read. */
export const HEAD_BYTES = 4 * 1024 * 1024;
/** Default time limit of an operation. */
export const OP_TIMEOUT_MS = 10_000;

export type RowFlag = "warn" | "good" | "info";

/** One line of the report: a label, a value and (for jargon) a plain-words explanation shown as a tooltip. */
export interface InfoRow {
  label: string;
  value: string;
  hint?: string;
  flag?: RowFlag;
}

export interface InfoGroup {
  id: string;
  title: string;
  /** Explains the group in plain words. */
  hint?: string;
  rows: InfoRow[];
  note?: string;
}

/** Control characters (except tab and newline) removed, and the text cut to `max` characters. */
export function clip(value: unknown, max = MAX_VALUE): string {
  let s = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} byte${n === 1 ? "" : "s"}`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

/** "1.2 MB (1,234,567 bytes)". */
export function sizeText(n: number): string {
  return n < 1024 ? humanBytes(n) : `${humanBytes(n)} (${n.toLocaleString("en-US")} bytes)`;
}

/** Collects rows, skipping empty values and keeping within the row cap. */
export class Rows {
  readonly rows: InfoRow[] = [];
  add(label: string, value: unknown, hint?: string, flag?: RowFlag): this {
    if (this.rows.length >= MAX_ROWS) return this;
    if (value === undefined || value === null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return this;
    const text = clip(value);
    if (!text.trim()) return this;
    this.rows.push({ label, value: text, ...(hint ? { hint } : {}), ...(flag ? { flag } : {}) });
    return this;
  }
  get length() {
    return this.rows.length;
  }
  group(id: string, title: string, hint?: string, note?: string): InfoGroup | null {
    return this.rows.length || note ? { id, title, rows: this.rows, ...(hint ? { hint } : {}), ...(note ? { note } : {}) } : null;
  }
}

export function pushGroup(list: InfoGroup[], g: InfoGroup | null): void {
  if (g) list.push(g);
}

export interface Target {
  path: string;
  /** lstat of the path itself. */
  lst: Stats;
}

/** A path from the page, checked; its own lstat is taken first so a link is never followed by accident. */
export async function lstatTarget(ctx: FmContext, input: unknown): Promise<Target> {
  const path = absolutePath(ctx, input);
  try {
    return { path, lst: await fsp.lstat(path) };
  } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") throw new FmError("NOT_FOUND", "That item doesn't exist any more.");
    throw err;
  }
}

/** Like lstatTarget, but only an ordinary file is accepted. A link is not followed: the error carries where it points. */
export async function regularFile(ctx: FmContext, input: unknown): Promise<Target> {
  const t = await lstatTarget(ctx, input);
  if (t.lst.isSymbolicLink()) {
    let target: string | null = null;
    try {
      target = await fsp.realpath(t.path);
    } catch {
      target = null;
    }
    throw new FmError("IS_LINK", target ? "This is a link (a shortcut). Ask about the file it points to instead." : "This is a link that points to nothing.", { target });
  }
  if (t.lst.isDirectory()) throw new FmError("NOT_A_FILE", "That is a folder, not a file.");
  if (!t.lst.isFile()) throw new FmError("NOT_A_FILE", "That isn't an ordinary file, so its contents are not read.");
  return t;
}

/** Opens an ordinary file for reading without following a link that appeared in the meantime. */
export async function openForRead(path: string): Promise<fsp.FileHandle> {
  const handle = await fsp.open(path, fsc.O_RDONLY | (fsc.O_NOFOLLOW ?? 0));
  try {
    if (!(await handle.stat()).isFile()) throw new FmError("NOT_A_FILE", "That isn't an ordinary file, so its contents are not read.");
  } catch (err) {
    await handle.close();
    throw err;
  }
  return handle;
}

/** The bytes at `offset` (fewer when the file is shorter). */
export async function readBytes(handle: fsp.FileHandle, offset: number, length: number): Promise<Buffer> {
  const want = Math.max(0, Math.min(length, HEAD_BYTES));
  const buf: Buffer = Buffer.alloc(want);
  let done = 0;
  while (done < want) {
    const { bytesRead } = await handle.read(buf, done, want - done, offset + done);
    if (bytesRead === 0) break;
    done += bytesRead;
  }
  return done === want ? buf : buf.subarray(0, done);
}

/** Where a parser reads from: a file, or bytes already in memory (tests). Reads past the end return fewer bytes. */
export interface Source {
  size: number;
  read(offset: number, length: number): Promise<Buffer>;
}

export function bufferSource(buf: Uint8Array): Source {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  return { size: b.length, read: async (offset, length) => b.subarray(Math.max(0, offset), Math.max(0, Math.min(b.length, offset + length))) };
}

/** A source that reads a file in blocks of 256 KB and remembers the last one, so walking through many small pieces is cheap. */
export function fileSource(handle: fsp.FileHandle, size: number): Source {
  const BLOCK = 256 * 1024;
  let start = -1;
  let block: Buffer = Buffer.alloc(0);
  return {
    size,
    async read(offset, length) {
      if (offset < 0 || offset >= size || length <= 0) return Buffer.alloc(0);
      const end = Math.min(size, offset + length);
      if (end - offset > BLOCK / 2) return readBytes(handle, offset, end - offset);
      if (start < 0 || offset < start || end > start + block.length) {
        start = offset;
        block = await readBytes(handle, offset, Math.min(BLOCK, size - offset));
      }
      return block.subarray(offset - start, Math.min(block.length, end - start));
    },
  };
}

/** The start of a file: at most `limit` bytes. */
export async function readHead(path: string, limit = HEAD_BYTES): Promise<{ bytes: Buffer; size: number }> {
  const handle = await openForRead(path);
  try {
    const size = (await handle.stat()).size;
    return { bytes: await readBytes(handle, 0, Math.min(size, limit)), size };
  } finally {
    await handle.close();
  }
}

/** Runs `work` with a time limit; the answer is a plain error when it takes too long. */
export async function withLimit<T>(ms: number, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new FmError("TIMEOUT", "This took too long, so it was stopped.")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `work`, but gives up waiting after `ms` and answers `fallback` instead (the work is left to finish on its own). */
export async function orElse<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work.catch(() => fallback), new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  failedToStart: boolean;
}

async function readCapped(stream: ReadableStream<Uint8Array>, max: number, onFull: () => void): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const room = max - total;
      if (value.length > room) {
        if (room > 0) chunks.push(Buffer.from(value.subarray(0, room)));
        total = max;
        truncated = true;
        onFull();
        break;
      }
      chunks.push(Buffer.from(value));
      total += value.length;
    }
  } catch {
    // the program was stopped: keep what we have
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

/**
 * Starts a program with an argument list (never a shell). It is stopped when it runs longer than `timeoutMs` or
 * writes more than `maxBytes`. Nothing is sent to it.
 */
export async function runProgram(argv: string[], env: Record<string, string>, { timeoutMs = 8000, maxBytes = 4 * 1024 * 1024 }: { timeoutMs?: number; maxBytes?: number } = {}): Promise<RunResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env });
  } catch {
    return { code: null, stdout: "", stderr: "", truncated: false, timedOut: false, failedToStart: true };
  }
  let timedOut = false;
  const kill = () => { try { proc.kill(); } catch {} };
  const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
  try {
    const [out, err, code] = await Promise.all([readCapped(proc.stdout as ReadableStream<Uint8Array>, maxBytes, kill), readCapped(proc.stderr as ReadableStream<Uint8Array>, 64 * 1024, () => {}), proc.exited]);
    return { code, stdout: out.text, stderr: err.text, truncated: out.truncated, timedOut, failedToStart: false };
  } catch {
    return { code: null, stdout: "", stderr: "", truncated: false, timedOut, failedToStart: false };
  } finally {
    clearTimeout(timer);
  }
}

/** A helper program of the optional tools (exiftool, ffprobe), or null. */
export function helperProgram(ctx: FmContext, tool: "exiftool" | "ffmpeg", program?: string): string | null {
  return resolveTool(ctx, tool, program);
}

export function helperEnv(ctx: FmContext): Record<string, string> {
  return childEnv(ctx);
}

export function installHint(platform: string, what: "exiftool" | "ffprobe"): string {
  const brew = what === "exiftool" ? "exiftool" : "ffmpeg";
  if (platform === "win32") return what === "exiftool" ? "To see more, install ExifTool (for example: winget install OliverBetz.ExifTool)." : "To see more, install FFmpeg (for example: winget install Gyan.FFmpeg).";
  if (platform === "linux") return `To see more, install ${what === "exiftool" ? "libimage-exiftool-perl" : "ffmpeg"} with your package manager.`;
  return `To see more, install it with: brew install ${brew}`;
}

export const be16 = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
export const be32 = (b: Uint8Array, o: number) => (((b[o] ?? 0) * 0x1000000) + (((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0))) >>> 0;
export const le16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
export const le32 = (b: Uint8Array, o: number) => (((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16)) + (b[o + 3] ?? 0) * 0x1000000) >>> 0;
export const ascii = (b: Uint8Array, o: number, n: number) => Buffer.from(b.subarray(o, Math.min(b.length, o + n))).toString("latin1");

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.round(seconds * 100) / 100} s`;
  const t = Math.round(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(t / 3600);
  return h > 0 ? `${h}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}` : `${Math.floor(t / 60)}:${pad(t % 60)}`;
}

/** Calendar date-times written as text by the file; shown as written, with a plain ISO form when it can be read. */
export function isoFromExif(text: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null;
}

export interface Box {
  type: string;
  /** Where the box starts, where its content starts, and where it ends (exclusive). */
  start: number;
  body: number;
  end: number;
}

/** The boxes (ISO base media format: MP4, MOV, HEIC) between `start` and `end`. A bad size stops the walk. */
export function readBoxes(buf: Uint8Array, start: number, end: number, max = 2000): Box[] {
  const out: Box[] = [];
  let p = start;
  const stop = Math.min(end, buf.length);
  while (p + 8 <= stop && out.length < max) {
    let size = be32(buf, p);
    let header = 8;
    if (size === 1) {
      if (p + 16 > stop) break;
      size = be32(buf, p + 8) * 0x100000000 + be32(buf, p + 12);
      header = 16;
    } else if (size === 0) size = stop - p;
    if (size < header) break;
    out.push({ type: ascii(buf, p + 4, 4), start: p, body: p + header, end: Math.min(stop, p + size) });
    p += size;
  }
  return out;
}

/** Writes `data` as a NEW file in `folder`: a name that is taken gets "(2)", "(3)" ... and nothing is ever overwritten. */
export async function writeNewFile(ctx: FmContext, folder: string, wanted: string, data: string | Uint8Array): Promise<{ path: string; name: string }> {
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  const reason = validateName(wanted, ctx.platform);
  if (reason) throw new FmError("BAD_NAME", reason);
  const taken = new Set((await fsp.readdir(folder)).map((n) => n.toLowerCase()));
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = uniqueName(wanted, (n) => taken.has(n.toLowerCase()));
    const target = pathApi(ctx).join(folder, name);
    try {
      await fsp.writeFile(target, data, { flag: "wx" });
      return { path: target, name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      taken.add(name.toLowerCase());
    }
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name for the new file.");
}