/**
 * The RADENC engine: encrypt one file or folder, decrypt one .radenc file, look inside a header. It knows nothing about
 * the File Manager's context, so the command-line tool (`cli_apps/vault_cli.ts`) uses it unchanged.
 *
 * Rules it keeps: nothing is ever overwritten; output is written to a temporary file/folder next to the destination and
 * published atomically; a new file is checked (every chunk re-authenticated) before it is published; a failure or a
 * cancel leaves nothing behind; secrets exist only in local variables until the key has been derived.
 */
import * as fs from "node:fs";
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { randomBytes } from "node:crypto";
import { Readable, pipeline } from "node:stream";
import { createGunzip, createGzip } from "node:zlib";
import { MAX_NAME_BYTES, unsafe } from "./fmVaultContainer";
import { extractContainer } from "./fmVaultExtract";
import {
  EXTENSION, HEADER_SIZE, LEVELS, TAG_SIZE, FLAG_GZIP, VaultError, WRONG_OR_DAMAGED, deriveFileKey, encodeHeader, levelOf, newHeader, openBlocks,
  parseHeader, sealStream, throwIfAborted, verifyCiphertext, type KdfParams, type Level,
} from "./fmVaultFormat";
import { containerStream, scanSource, type ScanResult } from "./fmVaultWalk";
import { FmError, describeFsError, isSameOrInside, platformName, uniqueName, type Platform } from "./fmPaths";

export interface EncryptRequest {
  source: string;
  outputDir: string;
  password: string;
  level: Level;
  compress: boolean;
  hideName: boolean;
  platform?: Platform;
  signal?: AbortSignal;
  /** Already counted by the caller (the task runner counts everything first for the progress bar). */
  scan?: ScanResult;
  onPhase?: (phase: "deriving" | "encrypting" | "verifying" | "finishing") => void;
  /** Source bytes read so far (a delta), then, while verifying, ciphertext bytes re-read (a delta). */
  onBytes?: (n: number, phase: "encrypting" | "verifying") => void;
  /** Internal, for tests only: lower key-derivation settings, smaller chunks, and a hook that runs after the file is written. Never exposed through the API. */
  internal?: { kdf?: KdfParams; chunkLog2?: number; afterWrite?: (tempPath: string) => Promise<void> };
}

export interface EncryptResult {
  output: string;
  outputName: string;
  kind: "file" | "folder";
  entries: number;
  plainBytes: number;
  cipherBytes: number;
  warnings: string[];
}

export interface DecryptRequest {
  source: string;
  outputDir: string;
  password: string;
  platform?: Platform;
  signal?: AbortSignal;
  onPhase?: (phase: "deriving" | "decrypting" | "finishing") => void;
  /** Ciphertext bytes read so far (a delta). */
  onBytes?: (n: number) => void;
}

export interface DecryptResult {
  output: string;
  outputName: string;
  kind: "file" | "folder";
  entries: number;
  plainBytes: number;
}

export type InspectResult =
  | { valid: true; version: 1; level: Level | "custom"; compressed: boolean; size: number; chunkSize: number; kdf: KdfParams }
  | { valid: false; reason: "not-radenc" | "unsupported" | "refused"; message: string; size: number };

// ---------------------------------------------------------------------------------------------------------------

/** Turns any error into a code and a plain sentence. Never repeats raw system text, which could be anything. */
export function vaultErrorInfo(err: unknown, what = "do that"): { code: string; message: string } {
  if (err instanceof FmError) return { code: err.code, message: err.message };
  const code = (err as NodeJS.ErrnoException)?.code;
  if (typeof code === "string" && code.startsWith("Z_")) return { code: "BAD_CONTAINER", message: WRONG_OR_DAMAGED };
  if (typeof code === "string" && /^E[A-Z]+$/.test(code)) {
    const info = describeFsError(err, what);
    if (!info.message.startsWith("Something went wrong")) return info;
  }
  return { code: "FAILED", message: "Something went wrong. Nothing was changed." };
}

const wrongOrDamaged = (code: string) => new VaultError(code, WRONG_OR_DAMAGED);

async function readHeader(fh: fs.promises.FileHandle): Promise<Buffer> {
  const raw = Buffer.alloc(HEADER_SIZE);
  const { bytesRead } = await fh.read(raw, 0, HEADER_SIZE, 0);
  return raw.subarray(0, bytesRead);
}

/** Reads a file's header (no password needed) and says what it is. */
export async function inspectFile(path: string): Promise<InspectResult> {
  const fh = await fsp.open(path, "r");
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new VaultError("NOT_A_FILE", "That isn't a file.");
    const check = parseHeader(await readHeader(fh));
    if (!check.ok) return { valid: false, reason: check.code === "NOT_RADENC" ? "not-radenc" : check.code === "UNSUPPORTED" ? "unsupported" : "refused", message: check.detail, size: st.size };
    const h = check.header;
    return { valid: true, version: 1, level: levelOf(h), compressed: (h.flags & FLAG_GZIP) !== 0, size: st.size, chunkSize: 1 << h.chunkLog2, kdf: { memoryKiB: h.memoryKiB, passes: h.passes, parallelism: h.parallelism } };
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Streams, names, publishing
// ---------------------------------------------------------------------------------------------------------------

function gzipped(source: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
  const gz = createGzip({ level: 6 });
  pipeline(Readable.from(source), gz, () => {});
  return gz as unknown as AsyncIterable<Buffer>;
}

function gunzipped(source: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
  const gunzip = createGunzip();
  pipeline(Readable.from(source), gunzip, () => {});
  return gunzip as unknown as AsyncIterable<Buffer>;
}

const norm = (name: string, platform: Platform) => (platform === "linux" ? name : name.normalize("NFC").toLowerCase());

async function takenNames(dir: string, platform: Platform): Promise<Set<string>> {
  return new Set((await fsp.readdir(dir)).map((n) => norm(n, platform)));
}

/** "<name>.radenc", shortened if the name is too long; "Encrypted file N.radenc" when the name is to be hidden. */
function outputCandidate(scan: ScanResult, hideName: boolean, taken: Set<string>, platform: Platform): string {
  if (hideName) {
    for (let n = 1; n < 100_000; n++) {
      const name = `Encrypted file ${n}${EXTENSION}`;
      if (!taken.has(norm(name, platform))) return name;
    }
    throw new VaultError("NO_FREE_NAME", "Could not find a free name for the encrypted file.");
  }
  let stem = scan.name;
  const room = MAX_NAME_BYTES - EXTENSION.length - 8;
  while (Buffer.byteLength(stem, "utf8") > room) stem = [...stem].slice(0, -1).join("");
  return uniqueName(`${stem}${EXTENSION}`, (c) => taken.has(norm(c, platform)));
}

const LINK_UNSUPPORTED = new Set(["EPERM", "ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "EINVAL", "EACCES"]);

/** Gives `temp` its final name without ever replacing an existing file: a hard link then removal; rename where links aren't available. */
async function publishFile(temp: string, dir: string, pick: (taken: Set<string>) => string, platform: Platform): Promise<{ path: string; name: string }> {
  const taken = await takenNames(dir, platform);
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = pick(taken);
    const target = nodePath.join(dir, name);
    try {
      await fsp.link(temp, target);
      await fsp.unlink(temp).catch(() => {});
      return { path: target, name };
    } catch (err: any) {
      if (err?.code === "EEXIST") {
        taken.add(norm(name, platform));
        continue;
      }
      if (LINK_UNSUPPORTED.has(err?.code)) {
        const present = await fsp.lstat(target).then(() => true, () => false);
        if (present) {
          taken.add(norm(name, platform));
          continue;
        }
        await fsp.rename(temp, target);
        return { path: target, name };
      }
      throw err;
    }
  }
  throw new VaultError("NO_FREE_NAME", "Could not find a free name for the result.");
}

/** Same for a folder: renaming onto an existing empty folder can replace it, so the name is checked immediately before. */
async function publishFolder(temp: string, dir: string, wanted: string, platform: Platform): Promise<{ path: string; name: string }> {
  const taken = await takenNames(dir, platform);
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = uniqueName(wanted, (c) => taken.has(norm(c, platform)));
    const target = nodePath.join(dir, name);
    const present = await fsp.lstat(target).then(() => true, () => false);
    if (present) {
      taken.add(norm(name, platform));
      continue;
    }
    try {
      await fsp.rename(temp, target);
      return { path: target, name };
    } catch (err: any) {
      if (err?.code === "EEXIST" || err?.code === "ENOTEMPTY") {
        taken.add(norm(name, platform));
        continue;
      }
      throw err;
    }
  }
  throw new VaultError("NO_FREE_NAME", "Could not find a free name for the result.");
}

const tempName = (suffix = "tmp") => `.radenc-${randomBytes(6).toString("hex")}.${suffix}`;

async function assertOutputFolder(dir: string): Promise<void> {
  const st = await fsp.stat(dir).catch((err) => {
    if (err?.code === "ENOENT") throw new VaultError("NOT_FOUND", "The output folder doesn't exist.");
    throw err;
  });
  if (!st.isDirectory()) throw new VaultError("NOT_A_FOLDER", "The output location isn't a folder.");
}

// ---------------------------------------------------------------------------------------------------------------
// Encrypt
// ---------------------------------------------------------------------------------------------------------------

export async function encryptItem(req: EncryptRequest): Promise<EncryptResult> {
  const platform = req.platform ?? platformName();
  const { signal } = req;
  await assertOutputFolder(req.outputDir);
  const scan = req.scan ?? (await scanSource(req.source, signal));
  if (scan.kind === "folder" && isSameOrInside(req.outputDir, req.source, platform)) {
    throw new VaultError("OUTPUT_INSIDE", "The output folder can't be inside the folder being encrypted. Choose another output folder.");
  }
  const params = req.internal?.kdf ?? LEVELS[req.level];
  const header = newHeader(params, req.compress, req.internal?.chunkLog2);
  const raw = encodeHeader(header);
  throwIfAborted(signal);
  req.onPhase?.("deriving");
  const key = await deriveFileKey(req.password, header, true);
  let temp: string | null = null;
  try {
    throwIfAborted(signal);
    temp = nodePath.join(req.outputDir, tempName());
    req.onPhase?.("encrypting");
    let cipherBytes = HEADER_SIZE;
    const out = await fsp.open(temp, "wx", 0o600);
    try {
      await out.write(raw);
      let plain: AsyncIterable<Buffer> = containerStream(req.source, scan, signal, (n) => req.onBytes?.(n, "encrypting"));
      if (req.compress) plain = gzipped(plain);
      const sealed = await sealStream(plain, key, header, raw, async (block) => {
        let off = 0;
        while (off < block.length) off += (await out.write(block, off, block.length - off)).bytesWritten;
      }, signal);
      cipherBytes += sealed.cipherBytes;
      await out.sync();
    } finally {
      await out.close();
    }
    if (req.internal?.afterWrite) await req.internal.afterWrite(temp);

    req.onPhase?.("verifying");
    const check = await fsp.open(temp, "r");
    let ok: boolean;
    try {
      ok = await verifyCiphertext(check, (await check.stat()).size, key, raw, signal, (n) => req.onBytes?.(n, "verifying"));
    } finally {
      await check.close();
    }
    if (!ok) throw new VaultError("VERIFY_FAILED", "The encrypted copy didn't pass its check, so it was not kept. Your original is untouched. Try again, and if it keeps happening check the disk.");

    req.onPhase?.("finishing");
    throwIfAborted(signal);
    const published = await publishFile(temp, req.outputDir, (taken) => outputCandidate(scan, req.hideName, taken, platform), platform);
    temp = null;
    return { output: published.path, outputName: published.name, kind: scan.kind, entries: scan.entries, plainBytes: scan.bytes, cipherBytes, warnings: scan.warnings };
  } finally {
    key.fill(0);
    if (temp) await fsp.rm(temp, { force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Decrypt
// ---------------------------------------------------------------------------------------------------------------

export async function decryptFile(req: DecryptRequest): Promise<DecryptResult> {
  const platform = req.platform ?? platformName();
  const { signal } = req;
  await assertOutputFolder(req.outputDir);
  const fh = await fsp.open(req.source, "r");
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new VaultError("NOT_A_FILE", "That isn't a file.");
    const check = parseHeader(await readHeader(fh));
    if (!check.ok) throw wrongOrDamaged(check.code);
    if (st.size < HEADER_SIZE + TAG_SIZE) throw wrongOrDamaged("WRONG_PASSWORD");
    throwIfAborted(signal);
    req.onPhase?.("deriving");
    const key = await deriveFileKey(req.password, check.header);
    const state: { tempDir?: string } = {};
    try {
      throwIfAborted(signal);
      req.onPhase?.("decrypting");
      let plain: AsyncIterable<Buffer> = openBlocks(fh, st.size, key, check.header, check.raw, signal, req.onBytes);
      if ((check.header.flags & FLAG_GZIP) !== 0) plain = gunzipped(plain);
      const done = await extractContainer(plain, { tempParent: req.outputDir, platform, signal, state });
      req.onPhase?.("finishing");
      throwIfAborted(signal);
      let published: { path: string; name: string };
      if (done.kind === "file") {
        published = await publishFile(done.path, req.outputDir, (taken) => uniqueName(done.name, (c) => taken.has(norm(c, platform))), platform);
      } else {
        published = await publishFolder(done.path, req.outputDir, done.name, platform);
      }
      return { output: published.path, outputName: published.name, kind: done.kind, entries: done.entries, plainBytes: done.bytes };
    } catch (err) {
      if (err instanceof FmError) throw err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (typeof code === "string" && code.startsWith("Z_")) throw unsafe("the packed data is damaged");
      throw err;
    } finally {
      key.fill(0);
      if (state.tempDir) await fsp.rm(state.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await fh.close();
  }
}
