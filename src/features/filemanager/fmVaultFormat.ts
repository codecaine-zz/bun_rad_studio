/**
 * RADENC v1: the byte-exact file format behind the File Manager's "Encrypt…" and the `vault_cli`.
 * Specified in docs/reference/vault-format.md. This module is independent of the File Manager's context, so the
 * command-line tool uses the very same code.
 *
 *   header (64 bytes, also the AAD of every chunk)  |  chunk 0 | chunk 1 | ... | last chunk
 *   chunk = AES-256-GCM(plaintext piece of 1 << chunkLog2 bytes) + 16-byte tag
 */
import { argon2, createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { totalmem } from "node:os";
import { FmError } from "./fmPaths";

export const MAGIC = Buffer.from("RADENC01", "latin1");
export const HEADER_SIZE = 64;
export const TAG_SIZE = 16;
export const KDF_ARGON2ID = 1;
export const CIPHER_AES256GCM_STREAM = 1;
export const FLAG_GZIP = 1;
export const DEFAULT_CHUNK_LOG2 = 20;
export const MIN_CHUNK_LOG2 = 12;
export const MAX_CHUNK_LOG2 = 24;
export const KDF_INFO = "radenc v1 file key";
export const EXTENSION = ".radenc";

export type Level = "standard" | "maximum";

export interface KdfParams {
  memoryKiB: number;
  passes: number;
  parallelism: number;
}

export const LEVELS: Record<Level, KdfParams> = {
  standard: { memoryKiB: 256 * 1024, passes: 3, parallelism: 4 },
  maximum: { memoryKiB: 1024 * 1024, passes: 4, parallelism: 4 },
};

/** What a reader accepts before it runs the (expensive) key derivation: a hostile file must not be able to demand the moon. */
export const KDF_LIMITS = { maxMemoryKiB: 2 * 1024 * 1024, maxPasses: 10, maxParallelism: 16 } as const;

/** One message for every reason a file cannot be opened, so a wrong password and a damaged file look the same. */
export const WRONG_OR_DAMAGED = "Wrong password, or the file is damaged or has been changed.";

export class VaultError extends FmError {}

export interface VaultHeader extends KdfParams {
  kdfId: number;
  salt: Buffer;
  cipherId: number;
  chunkLog2: number;
  flags: number;
  noncePrefix: Buffer;
}

export type HeaderCheck = { ok: true; header: VaultHeader; raw: Buffer } | { ok: false; code: "NOT_RADENC" | "UNSUPPORTED" | "BAD_PARAMS"; detail: string };

export function levelOf(p: KdfParams): Level | "custom" {
  for (const name of ["standard", "maximum"] as const) {
    const l = LEVELS[name];
    if (l.memoryKiB === p.memoryKiB && l.passes === p.passes && l.parallelism === p.parallelism) return name;
  }
  return "custom";
}

/** A plain reason why these parameters are refused, or null when they are acceptable. */
export function kdfRefusal(p: KdfParams): string | null {
  if (!Number.isInteger(p.memoryKiB) || !Number.isInteger(p.passes) || !Number.isInteger(p.parallelism)) return "The key settings are not whole numbers.";
  if (p.parallelism < 1 || p.parallelism > KDF_LIMITS.maxParallelism) return `The key settings ask for ${p.parallelism} parallel lanes (allowed: 1 to ${KDF_LIMITS.maxParallelism}).`;
  if (p.passes < 1 || p.passes > KDF_LIMITS.maxPasses) return `The key settings ask for ${p.passes} passes (allowed: 1 to ${KDF_LIMITS.maxPasses}).`;
  if (p.memoryKiB < 8 * p.parallelism) return "The key settings ask for too little memory.";
  if (p.memoryKiB > KDF_LIMITS.maxMemoryKiB) return `The key settings ask for ${Math.round(p.memoryKiB / 1024)} MB of memory (the most this program accepts is ${KDF_LIMITS.maxMemoryKiB / 1024} MB).`;
  return null;
}

export function encodeHeader(h: VaultHeader): Buffer {
  const b = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(b, 0);
  b[8] = h.kdfId;
  b.writeUInt32BE(h.memoryKiB, 9);
  b[13] = h.passes;
  b[14] = h.parallelism;
  h.salt.copy(b, 15);
  b[47] = h.cipherId;
  b[48] = h.chunkLog2;
  b[49] = h.flags;
  h.noncePrefix.copy(b, 50);
  return b; // bytes 57..63 are reserved and stay zero
}

export function newHeader(params: KdfParams, compress: boolean, chunkLog2 = DEFAULT_CHUNK_LOG2): VaultHeader {
  return { kdfId: KDF_ARGON2ID, ...params, salt: randomBytes(32), cipherId: CIPHER_AES256GCM_STREAM, chunkLog2, flags: compress ? FLAG_GZIP : 0, noncePrefix: randomBytes(7) };
}

/** Reads and checks a header without any secret. Every refusal is decided here, before any key derivation. */
export function parseHeader(raw: Buffer): HeaderCheck {
  if (raw.length < MAGIC.length || !raw.subarray(0, 8).equals(MAGIC)) {
    return { ok: false, code: "NOT_RADENC", detail: "This isn't a RADENC encrypted file." };
  }
  if (raw.length < HEADER_SIZE) return { ok: false, code: "NOT_RADENC", detail: "This file is too short to be a RADENC encrypted file." };
  const h: VaultHeader = {
    kdfId: raw[8]!,
    memoryKiB: raw.readUInt32BE(9),
    passes: raw[13]!,
    parallelism: raw[14]!,
    salt: Buffer.from(raw.subarray(15, 47)),
    cipherId: raw[47]!,
    chunkLog2: raw[48]!,
    flags: raw[49]!,
    noncePrefix: Buffer.from(raw.subarray(50, 57)),
  };
  if (h.kdfId !== KDF_ARGON2ID || h.cipherId !== CIPHER_AES256GCM_STREAM) return { ok: false, code: "UNSUPPORTED", detail: "This file uses a method this program doesn't know." };
  if ((h.flags & ~FLAG_GZIP) !== 0 || !raw.subarray(57, HEADER_SIZE).every((x) => x === 0)) return { ok: false, code: "UNSUPPORTED", detail: "This file uses options this program doesn't know." };
  if (h.chunkLog2 < MIN_CHUNK_LOG2 || h.chunkLog2 > MAX_CHUNK_LOG2) return { ok: false, code: "BAD_PARAMS", detail: "This file's block size is outside the allowed range." };
  const refusal = kdfRefusal(h);
  if (refusal) return { ok: false, code: "BAD_PARAMS", detail: `${refusal} It was refused for safety.` };
  return { ok: true, header: h, raw: Buffer.from(raw.subarray(0, HEADER_SIZE)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------------------------

/** The password as bytes: Unicode NFKC, then UTF-8, so the same typed password always gives the same key. */
export function passwordBytes(password: string): Buffer {
  return Buffer.from(password.normalize("NFKC"), "utf8");
}

function argon2Async(message: Buffer, salt: Buffer, p: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message, nonce: salt, parallelism: p.parallelism, tagLength: 32, memory: p.memoryKiB, passes: p.passes }, (err, key) => (err ? reject(err) : resolve(Buffer.from(key))));
  });
}

/**
 * Password -> Argon2id -> HKDF-SHA-256 -> the 32-byte file key. The caller must `fill(0)` the returned key when done.
 * Refuses unreasonable parameters first. Runs on a worker thread, so the program stays responsive.
 */
export async function deriveFileKey(password: string, header: VaultHeader, forCreating = false): Promise<Buffer> {
  const refusal = kdfRefusal(header);
  if (refusal) throw new VaultError("BAD_PARAMS", WRONG_OR_DAMAGED);
  const needBytes = header.memoryKiB * 1024;
  const pw = passwordBytes(password);
  let master: Buffer | null = null;
  try {
    if (needBytes > totalmem() * 0.8) throw new Error("not enough memory");
    master = await argon2Async(pw, header.salt, header);
    return Buffer.from(hkdfSync("sha256", master, header.salt, KDF_INFO, 32));
  } catch (err) {
    if (err instanceof VaultError) throw err;
    const mb = Math.round(header.memoryKiB / 1024);
    if (forCreating) {
      throw new VaultError("NO_MEMORY", header.memoryKiB > LEVELS.standard.memoryKiB
        ? "This computer can't spare that much memory for the Maximum level. Choose Standard."
        : "This computer doesn't have enough free memory even for the Standard level. Close other programs and try again.");
    }
    throw new VaultError("NO_MEMORY", `This computer can't spare the ${mb} MB of memory needed to open this file. Close other programs and try again.`);
  } finally {
    pw.fill(0);
    master?.fill(0);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Chunks (STREAM construction)
// ---------------------------------------------------------------------------------------------------------------

function nonceFor(prefix: Buffer, counter: number, last: boolean): Buffer {
  const nonce = Buffer.alloc(12);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(counter, 7);
  nonce[11] = last ? 1 : 0;
  return nonce;
}

export function sealChunk(key: Buffer, raw: Buffer, prefix: Buffer, counter: number, last: boolean, plain: Buffer): Buffer {
  if (!Number.isInteger(counter) || counter < 0 || counter > 0xffffffff) throw new VaultError("TOO_LARGE", "This is too large to encrypt in one file.");
  const cipher = createCipheriv("aes-256-gcm", key, nonceFor(prefix, counter, last), { authTagLength: TAG_SIZE });
  cipher.setAAD(raw);
  const body = cipher.update(plain);
  const tail = cipher.final();
  return Buffer.concat([body, tail, cipher.getAuthTag()]);
}

/** The plaintext of one sealed block; throws the "wrong password or damaged" error when it does not authenticate. */
export function openChunk(key: Buffer, raw: Buffer, prefix: Buffer, counter: number, last: boolean, sealed: Buffer): Buffer {
  if (sealed.length < TAG_SIZE) throw new VaultError("WRONG_PASSWORD", WRONG_OR_DAMAGED);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonceFor(prefix, counter, last), { authTagLength: TAG_SIZE });
    decipher.setAAD(raw);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_SIZE));
    const body = decipher.update(sealed.subarray(0, sealed.length - TAG_SIZE));
    const tail = decipher.final();
    return tail.length ? Buffer.concat([body, tail]) : body;
  } catch {
    throw new VaultError("WRONG_PASSWORD", WRONG_OR_DAMAGED);
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new VaultError("CANCELLED", "Cancelled.");
}

/**
 * Cuts the plaintext stream into fixed chunks and writes each one sealed. A full chunk is only sealed once more
 * data follows, so the last chunk is the one flagged "last" (it is empty only when the whole payload is empty).
 */
export async function sealStream(source: AsyncIterable<Buffer>, key: Buffer, header: VaultHeader, raw: Buffer, write: (block: Buffer) => Promise<void>, signal?: AbortSignal): Promise<{ chunks: number; cipherBytes: number }> {
  const size = 1 << header.chunkLog2;
  const buf = Buffer.allocUnsafe(size);
  let fill = 0;
  let counter = 0;
  let cipherBytes = 0;
  const flush = async (last: boolean) => {
    throwIfAborted(signal);
    const sealed = sealChunk(key, raw, header.noncePrefix, counter++, last, buf.subarray(0, fill));
    fill = 0;
    cipherBytes += sealed.length;
    await write(sealed);
  };
  for await (const piece of source) {
    let off = 0;
    while (off < piece.length) {
      if (fill === size) await flush(false);
      const n = Math.min(size - fill, piece.length - off);
      piece.copy(buf, fill, off, off + n);
      fill += n;
      off += n;
    }
  }
  await flush(true);
  buf.fill(0);
  return { chunks: counter, cipherBytes };
}

async function readExactly(fh: FileHandle, buf: Buffer, position: number): Promise<void> {
  let got = 0;
  while (got < buf.length) {
    const { bytesRead } = await fh.read(buf, got, buf.length - got, position + got);
    if (bytesRead === 0) throw new VaultError("WRONG_PASSWORD", WRONG_OR_DAMAGED);
    got += bytesRead;
  }
}

/**
 * Reads the sealed blocks after the header and yields each authenticated plaintext. The block that ends exactly at the
 * end of the file is opened as the "last" one, so truncation, reordering, duplication and appended data all fail.
 */
export async function* openBlocks(fh: FileHandle, fileSize: number, key: Buffer, header: VaultHeader, raw: Buffer, signal?: AbortSignal, onBytes?: (n: number) => void): AsyncGenerator<Buffer> {
  const full = (1 << header.chunkLog2) + TAG_SIZE;
  const body = fileSize - HEADER_SIZE;
  if (body < TAG_SIZE) throw new VaultError("WRONG_PASSWORD", WRONG_OR_DAMAGED);
  const blocks = Math.ceil(body / full);
  const lastLen = body - (blocks - 1) * full;
  if (blocks > 0xffffffff || lastLen < TAG_SIZE) throw new VaultError("WRONG_PASSWORD", WRONG_OR_DAMAGED);
  const buf = Buffer.allocUnsafe(full);
  for (let i = 0; i < blocks; i++) {
    throwIfAborted(signal);
    const last = i === blocks - 1;
    const sealed = buf.subarray(0, last ? lastLen : full);
    await readExactly(fh, sealed, HEADER_SIZE + i * full);
    onBytes?.(sealed.length);
    yield openChunk(key, raw, header.noncePrefix, i, last, sealed);
  }
}

/** Re-reads a finished file and authenticates every chunk with `key`. Returns false on any difference. */
export async function verifyCiphertext(fh: FileHandle, fileSize: number, key: Buffer, expectedHeader: Buffer, signal?: AbortSignal, onBytes?: (n: number) => void): Promise<boolean> {
  try {
    const raw = Buffer.alloc(HEADER_SIZE);
    await readExactly(fh, raw, 0);
    if (raw.length !== expectedHeader.length || !timingSafeEqual(raw, expectedHeader)) return false;
    const parsed = parseHeader(raw);
    if (!parsed.ok) return false;
    for await (const _ of openBlocks(fh, fileSize, key, parsed.header, parsed.raw, signal, onBytes)) void _;
    return true;
  } catch (err) {
    if (err instanceof VaultError && err.code === "CANCELLED") throw err;
    return false;
  }
}
