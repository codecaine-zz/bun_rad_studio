/**
 * The Code tab's file reading and writing: decoding text (UTF-8, UTF-16, Latin-1), remembering the line-ending style,
 * and saving safely: a temporary file in the same folder is written, flushed and renamed over the original, and the
 * save is refused when the file changed on disk since it was opened.
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import { absolutePath, assertCreatable, assertFolder, assertModifiable, lstatOrNull, pathApi, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";

export const MAX_READ_BYTES = 5 * 1024 * 1024;
export const MAX_SAVE_CHARS = 16 * 1024 * 1024;
const MAX_UPLOAD_CHARS = 200_000;

export const ENCODINGS = ["utf-8", "utf-8-bom", "utf-16le", "utf-16be", "latin1"] as const;
export type Encoding = (typeof ENCODINGS)[number];
export type Eol = "lf" | "crlf" | "cr";
const EOL_TEXT: Record<Eol, string> = { lf: "\n", crlf: "\r\n", cr: "\r" };

export interface CodeFile {
  path: string;
  name: string;
  text: string;
  encoding: Encoding;
  /** True when the encoding was guessed because the bytes are not valid UTF-8. */
  guessed: boolean;
  eol: Eol;
  mixedEol: boolean;
  size: number;
  mtimeMs: number;
  /** Only the first part was read: the editor must not save it back. */
  truncated: boolean;
  /** The file is a link; it can be read, but saving is refused. */
  symlink: boolean;
  writable: boolean;
}

export function decodeBytes(bytes: Buffer, forced?: Encoding, truncated = false): { text: string; encoding: Encoding; guessed: boolean } {
  let encoding: Encoding | undefined = forced;
  let body = bytes;
  const bom8 = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const bomLe = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const bomBe = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
  if (!encoding) encoding = bom8 ? "utf-8-bom" : bomLe ? "utf-16le" : bomBe ? "utf-16be" : undefined;
  let guessed = false;
  if (encoding === "utf-8-bom" || (encoding === "utf-8" && bom8)) {
    if (bom8) body = bytes.subarray(3);
    if (encoding === "utf-8" && bom8) encoding = "utf-8-bom";
  } else if (encoding === "utf-16le" && bomLe) body = bytes.subarray(2);
  else if (encoding === "utf-16be" && bomBe) body = bytes.subarray(2);

  if (!encoding) {
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8", guessed: false };
    } catch {
      if (!truncated) return { text: body.toString("latin1"), encoding: "latin1", guessed: true };
      encoding = "utf-8"; // cut in the middle of a character: show what is readable
    }
  }
  if (encoding === "latin1") return { text: body.toString("latin1"), encoding, guessed };
  if (encoding === "utf-16le") return { text: body.subarray(0, body.length - (body.length % 2)).toString("utf16le"), encoding, guessed };
  if (encoding === "utf-16be") {
    const even = Buffer.from(body.subarray(0, body.length - (body.length % 2)));
    even.swap16();
    return { text: even.toString("utf16le"), encoding, guessed };
  }
  return { text: new TextDecoder("utf-8").decode(body), encoding, guessed };
}

export function encodeText(text: string, encoding: Encoding): Buffer {
  switch (encoding) {
    case "utf-8-bom": return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
    case "utf-16le": return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    case "utf-16be": {
      const body = Buffer.from(text, "utf16le");
      body.swap16();
      return Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
    }
    case "latin1": {
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) > 255) throw new FmError("ENCODING", "This text has characters that Latin-1 can't hold. Change the encoding to UTF-8 and save again.");
      }
      return Buffer.from(text, "latin1");
    }
    default: return Buffer.from(text, "utf8");
  }
}

/** Counts line endings; the most common one wins. The text is returned with plain "\n" line endings. */
export function normalizeEol(text: string): { text: string; eol: Eol; mixed: boolean } {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) { crlf++; i++; } else cr++;
    } else if (c === 10) lf++;
  }
  const kinds = [crlf, lf, cr].filter((n) => n > 0).length;
  if (kinds === 0) return { text, eol: "lf", mixed: false };
  const eol: Eol = crlf >= lf && crlf >= cr ? "crlf" : lf >= cr ? "lf" : "cr";
  return { text: kinds === 1 && eol === "lf" ? text : text.replace(/\r\n?/g, "\n"), eol, mixed: kinds > 1 };
}

const isEncoding = (v: unknown): v is Encoding => typeof v === "string" && (ENCODINGS as readonly string[]).includes(v);
const isEol = (v: unknown): v is Eol => v === "lf" || v === "crlf" || v === "cr";

export async function readCodeFile(ctx: FmContext, input: unknown, forcedEncoding?: unknown): Promise<CodeFile> {
  const path = absolutePath(ctx, input);
  const link = await lstatOrNull(path);
  if (!link) throw new FmError("NOT_FOUND", "That file doesn't exist any more.");
  const st = await fsp.stat(path);
  if (st.isDirectory()) throw new FmError("IS_FOLDER", "That is a folder, not a file.");
  if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't an ordinary file, so it can't be opened in the editor.");
  if (forcedEncoding !== undefined && !isEncoding(forcedEncoding)) throw new FmError("BAD_ENCODING", "That text encoding isn't supported.");
  const handle = await fsp.open(path, "r");
  let bytes: Buffer;
  try {
    const want = Math.min(st.size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(want);
    let got = 0;
    while (got < want) {
      const { bytesRead } = await handle.read(buffer, got, want - got, got);
      if (!bytesRead) break;
      got += bytesRead;
    }
    bytes = buffer.subarray(0, got);
  } finally {
    await handle.close();
  }
  const truncated = st.size > MAX_READ_BYTES;
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff) || forcedEncoding === "utf-16le" || forcedEncoding === "utf-16be";
  if (!utf16 && bytes.includes(0)) {
    throw new FmError("BINARY", "This file isn't text (it contains binary data), so the editor won't open it. Use the File Manager's preview or an app made for this kind of file.");
  }
  const decoded = decodeBytes(bytes, forcedEncoding as Encoding | undefined, truncated);
  const norm = normalizeEol(decoded.text);
  const writable = await fsp.access(path, fs.constants.W_OK).then(() => true, () => false);
  return {
    path, name: pathApi(ctx).basename(path), text: norm.text, encoding: decoded.encoding, guessed: decoded.guessed, eol: norm.eol, mixedEol: norm.mixed,
    size: st.size, mtimeMs: st.mtimeMs, truncated, symlink: link.isSymbolicLink(), writable,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Big text arrives in pieces (a request may be at most 1 MB)
// ---------------------------------------------------------------------------------------------------------------

interface Upload { parts: string[]; chars: number; timer: NodeJS.Timeout }
const uploads = new WeakMap<FmContext, Map<string, Upload>>();

export function uploadChunk(ctx: FmContext, body: Record<string, any>): { received: number } {
  const id = typeof body.id === "string" && /^[\w-]{6,64}$/.test(body.id) ? body.id : "";
  if (!id) throw new FmError("BAD_REQUEST", "That upload has no valid id.");
  if (typeof body.text !== "string" || body.text.length > MAX_UPLOAD_CHARS) throw new FmError("BAD_REQUEST", "That piece of text is too large.");
  let map = uploads.get(ctx);
  if (!map) uploads.set(ctx, (map = new Map()));
  let up = map.get(id);
  if (!up) {
    if (map.size >= 4) throw new FmError("BUSY", "Too many saves are in progress. Try again in a moment.");
    up = { parts: [], chars: 0, timer: setTimeout(() => map!.delete(id), 120_000) };
    up.timer.unref?.();
    map.set(id, up);
    ctx.disposers.push(() => { clearTimeout(up!.timer); map!.delete(id); });
  }
  if (!Number.isInteger(body.index) || body.index !== up.parts.length) throw new FmError("BAD_REQUEST", "The pieces of text arrived out of order.");
  if (up.chars + body.text.length > MAX_SAVE_CHARS) throw new FmError("TOO_BIG", "That file is too big to save from the editor.");
  up.parts.push(body.text);
  up.chars += body.text.length;
  return { received: up.chars };
}

function takeText(ctx: FmContext, body: Record<string, any>): string {
  if (typeof body.upload === "string") {
    const map = uploads.get(ctx);
    const up = map?.get(body.upload);
    if (!up || !map) throw new FmError("BAD_REQUEST", "The text to save is missing. Try saving again.");
    clearTimeout(up.timer);
    map.delete(body.upload);
    return up.parts.join("") + (typeof body.text === "string" ? body.text : "");
  }
  if (typeof body.text !== "string") throw new FmError("BAD_REQUEST", "There is no text to save.");
  if (body.text.length > MAX_SAVE_CHARS) throw new FmError("TOO_BIG", "That file is too big to save from the editor.");
  return body.text;
}

// ---------------------------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------------------------

export interface SaveResult { path: string; size: number; mtimeMs: number; created: boolean }

async function writeAtomic(ctx: FmContext, target: string, bytes: Buffer, mode: number | null): Promise<void> {
  const p = pathApi(ctx);
  const temp = p.join(p.dirname(target), `.${p.basename(target).slice(0, 60)}.fm-save-${randomBytes(5).toString("hex")}.tmp`);
  try {
    const handle = await fsp.open(temp, "wx", mode ?? 0o644);
    try {
      await handle.writeFile(bytes);
      if (mode !== null && process.platform !== "win32") await handle.chmod(mode);
      await handle.sync().catch(() => {});
    } finally {
      await handle.close();
    }
    await fsp.rename(temp, target);
  } catch (err) {
    await fsp.rm(temp, { force: true }).catch(() => {});
    throw err;
  }
}

function options(body: Record<string, any>) {
  const encoding = body.encoding === undefined ? "utf-8" : body.encoding;
  const eol = body.eol === undefined ? "lf" : body.eol;
  if (!isEncoding(encoding)) throw new FmError("BAD_ENCODING", "That text encoding isn't supported.");
  if (!isEol(eol)) throw new FmError("BAD_REQUEST", "That line ending isn't supported.");
  return { encoding, eol };
}

function bytesFor(ctx: FmContext, body: Record<string, any>): Buffer {
  const { encoding, eol } = options(body);
  const text = takeText(ctx, body).replace(/\r\n?/g, "\n");
  return encodeText(eol === "lf" ? text : text.replace(/\n/g, EOL_TEXT[eol]), encoding);
}

const refuseLink = () => new FmError("IS_LINK", "This is a link to another file, so the editor won't replace it. Open the file the link points to, or use Save As to make a separate copy.");

/** Saves a file that was opened from disk. `expected` is its size and modified time when it was read. */
export async function saveCodeFile(ctx: FmContext, body: Record<string, any>): Promise<SaveResult> {
  const path = absolutePath(ctx, body.path);
  assertModifiable(ctx, path);
  const bytes = bytesFor(ctx, body);
  const st = await lstatOrNull(path);
  if (!st) throw new FmError("GONE", "This file was deleted or moved since you opened it. Use Save As to write it somewhere.");
  if (st.isSymbolicLink()) throw refuseLink();
  if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't an ordinary file.");
  if (await fsp.access(path, fs.constants.W_OK).then(() => false, () => true)) throw new FmError("READ_ONLY", "This file is read-only. Change its permissions, or use Save As to make a copy.");
  const expected = body.expected as { mtimeMs?: unknown; size?: unknown } | undefined;
  if (body.force !== true && expected && typeof expected === "object" && (Math.abs(Number(expected.mtimeMs) - st.mtimeMs) > 1 || Number(expected.size) !== st.size)) {
    throw new FmError("CHANGED_ON_DISK", "This file was changed by another program since you opened it.");
  }
  await writeAtomic(ctx, path, bytes, st.mode & 0o7777);
  const after = await fsp.stat(path);
  return { path, size: after.size, mtimeMs: after.mtimeMs, created: false };
}

/** Writes to a typed path. Never replaces an existing file unless `overwrite` is true. */
export async function saveCodeFileAs(ctx: FmContext, body: Record<string, any>): Promise<SaveResult> {
  const path = absolutePath(ctx, body.path);
  const p = pathApi(ctx);
  const parent = p.dirname(path);
  assertCreatable(ctx, parent);
  const bytes = bytesFor(ctx, body);
  const baseName = p.basename(path);
  if (baseName.length > 255 || (ctx.platform === "win32" && /[<>:"|?*]/.test(baseName))) throw new FmError("BAD_NAME", "That file name isn't valid.");
  const existing = await lstatOrNull(path);
  if (existing) {
    if (existing.isSymbolicLink()) throw refuseLink();
    if (existing.isDirectory()) throw new FmError("IS_FOLDER", "A folder with that name already exists.");
    if (body.overwrite !== true) throw new FmError("EXISTS", `"${p.basename(path)}" already exists. Choose another name, or replace it.`);
    assertModifiable(ctx, path);
  } else {
    await assertFolder(parent, "The folder to save in");
  }
  await writeAtomic(ctx, path, bytes, existing ? existing.mode & 0o7777 : null);
  const after = await fsp.stat(path);
  return { path, size: after.size, mtimeMs: after.mtimeMs, created: !existing };
}

/** Size and modified time of several files, so the editor can notice changes made elsewhere. */
export async function statFiles(ctx: FmContext, inputs: unknown): Promise<Array<{ path: string; exists: boolean; size: number; mtimeMs: number }>> {
  if (!Array.isArray(inputs) || inputs.length > 60) throw new FmError("BAD_REQUEST", "Too many files to check at once.");
  const out = [];
  for (const input of inputs) {
    const path = absolutePath(ctx, input);
    const st = await fsp.stat(path).catch(() => null);
    out.push({ path, exists: !!st?.isFile(), size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0 });
  }
  return out;
}
