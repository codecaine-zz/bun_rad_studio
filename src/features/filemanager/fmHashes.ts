/**
 * Every kind of hash and checksum the File Manager can work out, in one catalogue shared by the Crypto tab and the
 * "More info" window.
 *
 * - "Secure" digests (SHA-2, SHA-3, BLAKE2, ...) come from Bun's `Bun.CryptoHasher`, which hashes in pieces, so a big
 *   file is streamed and never held in memory.
 * - "Fast checksums" (CRC32, xxHash, wyhash, ...) come from `Bun.hash`. Only CRC32 (and Adler-32, done here by hand) can
 *   be continued piece by piece; the others need the whole input at once, so for files they are limited to
 *   `MAX_WHOLE_FILE_BYTES` and left out, with a reason, for bigger files.
 *
 * Fast checksums use seed 0 and are written as hex of the number the function returns, most significant digit first
 * ("big-endian"): 8 digits for 32-bit results, 16 for 64-bit ones. That is also what `xxhsum` and `cksum` print.
 */
import { promises as fsp } from "fs";
import { FmError } from "./fmPaths";

export type HashGroup = "classic" | "more" | "legacy" | "fast";

export interface Digester {
  update(chunk: Uint8Array): void;
  digest(): string;
}

export interface HashSpec {
  /** Short stable name used by the API ("sha256", "xxhash64"). */
  id: string;
  label: string;
  group: HashGroup;
  /** One plain-words sentence about what it is for. */
  hint: string;
  /** Number of hex digits of the result. */
  hex: number;
  /** The `Bun.CryptoHasher` / HMAC name, for the secure ones. */
  algo?: string;
  /** The label of the HMAC row (only for the classic ones). */
  hmac?: string;
  /** Hashes in pieces; null when the whole input is needed at once. */
  stream: (() => Digester) | null;
  /** The digest of a whole input. */
  whole: (data: Uint8Array) => string;
}

/** The biggest file the fast checksums that can't be continued piece by piece are worked out for. */
export const MAX_WHOLE_FILE_BYTES = 256 * 1024 * 1024;
const CHUNK = 1024 * 1024;

const supports = (algo: string): boolean => {
  try {
    new Bun.CryptoHasher(algo as Bun.SupportedCryptoAlgorithms);
    return true;
  } catch {
    return false;
  }
};

function secure(id: string, label: string, algo: string, group: HashGroup, hex: number, hint: string, hmac?: string): HashSpec {
  const make = (): Digester => {
    const h = new Bun.CryptoHasher(algo as Bun.SupportedCryptoAlgorithms);
    return { update: (c) => void h.update(c), digest: () => h.digest("hex") };
  };
  return { id, label, group, hint, hex, algo, hmac, stream: make, whole: (data) => finish(make, data) };
}

/** Runs a digester over one whole input. */
function finish(make: () => Digester, data: Uint8Array): string {
  const d = make();
  d.update(data);
  return d.digest();
}

/** Adler-32 (the checksum inside zlib), continued piece by piece: the same value as `Bun.hash.adler32` of the whole input. */
function adlerStream(): Digester {
  let a = 1;
  let b = 0;
  return {
    update(chunk) {
      for (let i = 0; i < chunk.length; ) {
        const end = Math.min(chunk.length, i + 5552); // the longest run before the sums could overflow 32 bits
        for (; i < end; i++) {
          a += chunk[i]!;
          b += a;
        }
        a %= 65521;
        b %= 65521;
      }
    },
    digest: () => (((b << 16) | a) >>> 0).toString(16).padStart(8, "0"),
  };
}

function crcStream(): Digester {
  let crc = 0;
  return { update: (c) => void (crc = Bun.hash.crc32(c, crc)), digest: () => (crc >>> 0).toString(16).padStart(8, "0") };
}

const toHex = (value: number | bigint, width: number): string => (typeof value === "bigint" ? BigInt.asUintN(width * 4, value) : value >>> 0).toString(16).padStart(width, "0");

function fast(id: string, label: string, hex: 8 | 16, hint: string, run: (data: Uint8Array) => number | bigint, stream: (() => Digester) | null = null): HashSpec {
  return { id, label, group: "fast", hint, hex, stream, whole: (data) => toHex(run(data), hex) };
}

const FAST_NOTE = " Not secure: it only spots accidental changes.";

export const HASH_SPECS: HashSpec[] = [
  secure("sha256", "SHA-256", "sha256", "classic", 64, "The usual modern fingerprint. If two files give the same SHA-256, they are the same file.", "HMAC-SHA256"),
  secure("sha512", "SHA-512", "sha512", "classic", 128, "A longer fingerprint with the same purpose as SHA-256.", "HMAC-SHA512"),
  secure("sha384", "SHA-384", "sha384", "classic", 96, "A shortened SHA-512. Used by some certificates and download pages.", "HMAC-SHA384"),
  secure("sha1", "SHA-1", "sha1", "classic", 40, "An older fingerprint, still used by some download pages and by Git. Not safe against deliberate tampering any more.", "HMAC-SHA1"),
  secure("md5", "MD5", "md5", "classic", 32, "A short, old fingerprint. Fast, but no longer safe against deliberate tampering. Fine to spot accidental damage.", "HMAC-MD5"),
  secure("sha224", "SHA-224", "sha224", "more", 56, "A shortened SHA-256. Secure; rarely asked for."),
  secure("sha512-256", "SHA-512/256", "sha512-256", "more", 64, "SHA-512 cut down to 256 bits (it is not just the first half of SHA-512). Secure, and fast on 64-bit computers."),
  secure("sha3-256", "SHA3-256", "sha3-256", "more", 64, "The newer SHA-3 family, built differently from SHA-2. Secure."),
  secure("sha3-384", "SHA3-384", "sha3-384", "more", 96, "SHA-3 with a 384-bit result. Secure."),
  secure("sha3-512", "SHA3-512", "sha3-512", "more", 128, "SHA-3 with a 512-bit result. Secure."),
  secure("blake2b256", "BLAKE2b-256", "blake2b256", "more", 64, "A modern, very fast and secure fingerprint with a 256-bit result."),
  secure("blake2b512", "BLAKE2b-512", "blake2b512", "more", 128, "A modern, very fast and secure fingerprint with a 512-bit result."),
  secure("blake2s256", "BLAKE2s-256", "blake2s256", "more", 64, "BLAKE2 tuned for small computers. Secure."),
  secure("ripemd160", "RIPEMD-160", "ripemd160", "more", 40, "Used by Bitcoin addresses. Secure enough, but little used elsewhere."),
  secure("md4", "MD4", "md4", "legacy", 32, "OBSOLETE and BROKEN. Only for checking very old systems (it is behind NTLM and old file-sharing lists). Never use it for anything new."),
  fast("crc32", "CRC32", 8, `The check number inside zip, PNG and gzip files.${FAST_NOTE}`, (d) => Bun.hash.crc32(d), crcStream),
  fast("adler32", "Adler-32", 8, `A very quick check number used by zlib.${FAST_NOTE}`, (d) => Bun.hash.adler32(d), adlerStream),
  fast("xxhash32", "xxHash32", 8, `A very fast 32-bit check number (xxHash). Same as the xxh32sum tool.${FAST_NOTE}`, (d) => Bun.hash.xxHash32(d)),
  fast("xxhash64", "xxHash64", 16, `A very fast 64-bit check number (xxHash). Same as the xxh64sum tool.${FAST_NOTE}`, (d) => Bun.hash.xxHash64(d)),
  fast("xxh3", "XXH3", 16, `The newest and fastest xxHash, 64 bits. Same as xxh3 of the xxhsum tool.${FAST_NOTE}`, (d) => Bun.hash.xxHash3(d)),
  fast("wyhash", "wyhash", 16, `A very fast 64-bit check number used by hash tables.${FAST_NOTE}`, (d) => Bun.hash.wyhash(d)),
  fast("cityhash32", "CityHash32", 8, `Google's quick 32-bit check number.${FAST_NOTE}`, (d) => Bun.hash.cityHash32(d)),
  fast("cityhash64", "CityHash64", 16, `Google's quick 64-bit check number.${FAST_NOTE}`, (d) => Bun.hash.cityHash64(d)),
  fast("murmur32v2", "MurmurHash2 (32-bit)", 8, `A quick 32-bit check number used in hash tables.${FAST_NOTE}`, (d) => Bun.hash.murmur32v2(d)),
  fast("murmur32v3", "MurmurHash3 (32-bit)", 8, `A quick 32-bit check number used in hash tables and Bloom filters.${FAST_NOTE}`, (d) => Bun.hash.murmur32v3(d)),
  fast("murmur64v2", "MurmurHash2 (64-bit)", 16, `A quick 64-bit check number used in hash tables.${FAST_NOTE}`, (d) => Bun.hash.murmur64v2(d)),
  fast("rapidhash", "rapidhash", 16, `A very fast 64-bit check number (the successor of wyhash).${FAST_NOTE}`, (d) => Bun.hash.rapidhash(d)),
].filter((s) => s.group === "fast" || (s.algo !== undefined && supports(s.algo)));

export const HASH_BY_ID = new Map(HASH_SPECS.map((s) => [s.id, s]));
export const HASH_BY_LABEL = new Map(HASH_SPECS.map((s) => [s.label, s]));
/** The five digests the File Manager always worked out first, in their usual order. */
export const CLASSIC_IDS = ["sha256", "sha512", "sha384", "sha1", "md5"];
export const FAST_GROUP_TITLE = "Fast checksums (to spot accidental changes only, NOT secure)";

export const specsOf = (group: HashGroup): HashSpec[] => HASH_SPECS.filter((s) => s.group === group);
export const secureSpecs = (): HashSpec[] => HASH_SPECS.filter((s) => s.group !== "fast");
export const fastSpecs = (): HashSpec[] => specsOf("fast");

/** What each result row is, in plain words (by label), for tooltips. */
export const hashHints = (): Record<string, string> => Object.fromEntries(HASH_SPECS.map((s) => [s.label, s.hint]));

/** Digests of some bytes with the given kinds, as [label, hex] rows. */
export function digestBytes(data: Uint8Array, specs: HashSpec[]): Array<[string, string]> {
  return specs.map((s) => [s.label, s.whole(data)] as [string, string]);
}

export interface FileDigests {
  size: number;
  rows: Array<{ spec: HashSpec; value: string }>;
  /** Kinds that were not worked out, with the reason. */
  skipped: Array<{ spec: HashSpec; reason: string }>;
}

export interface FileDigestOptions {
  /** How to open the file (the "More info" window passes a stricter opener that refuses links). */
  open?: (path: string) => Promise<fsp.FileHandle>;
  signal?: AbortSignal;
  progress?: (done: number, total: number) => void;
}

/** Streams a file once through every wanted kind. Throws a CANCELLED error soon after `signal` aborts. */
export async function digestFile(path: string, specs: HashSpec[], options: FileDigestOptions = {}): Promise<FileDigests> {
  const handle = await (options.open ?? ((p: string) => fsp.open(p, "r")))(path);
  try {
    const st = await handle.stat();
    if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't an ordinary file.");
    const size = st.size;
    const streamers = specs.filter((s) => s.stream).map((s) => ({ spec: s, d: s.stream!() }));
    const wholes = specs.filter((s) => !s.stream);
    const keep = wholes.length > 0 && size <= MAX_WHOLE_FILE_BYTES;
    const all = keep ? Buffer.allocUnsafe(size) : null;
    const buf = Buffer.allocUnsafe(Math.min(CHUNK, Math.max(1, size)));
    let pos = 0;
    options.progress?.(0, size);
    for (;;) {
      if (options.signal?.aborted) throw new FmError("CANCELLED", "Stopped.");
      const { bytesRead } = await handle.read(buf, 0, buf.length, pos);
      if (bytesRead === 0) break;
      const piece = buf.subarray(0, bytesRead);
      for (const x of streamers) x.d.update(piece);
      if (all && pos + bytesRead <= all.length) all.set(piece, pos);
      pos += bytesRead;
      options.progress?.(pos, Math.max(size, pos));
    }
    const rows = new Map<string, string>();
    for (const x of streamers) rows.set(x.spec.id, x.d.digest());
    const skipped: FileDigests["skipped"] = [];
    for (const w of wholes) {
      if (all && pos === all.length) rows.set(w.id, w.whole(all));
      else skipped.push({ spec: w, reason: `Skipped: this kind needs the whole file in memory at once, and the file is bigger than ${MAX_WHOLE_FILE_BYTES / 1048576} MB.` });
    }
    return { size: pos, rows: specs.filter((s) => rows.has(s.id)).map((s) => ({ spec: s, value: rows.get(s.id)! })), skipped };
  } finally {
    await handle.close();
  }
}
