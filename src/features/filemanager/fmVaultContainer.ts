/**
 * The RADENC payload ("container"): what is inside the encrypted stream. Builders for the writer and the strict
 * name rules the reader applies to every path it finds. See docs/reference/vault-format.md.
 *
 *   M u32-length JSON-manifest
 *   F u16-pathlen path u16-mode f64-mtime-ms u64-size data        (a file)
 *   D u16-pathlen path u16-mode f64-mtime-ms                      (a folder, also empty ones)
 *   E                                                             (end)
 */
import { VaultError } from "./fmVaultFormat";
import { platformName, validateName, type Platform } from "./fmPaths";

export const MAX_ENTRIES = 2_000_000;
export const MAX_DEPTH = 64;
export const MAX_PATH_BYTES = 1024;
export const MAX_NAME_BYTES = 255;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_WARNINGS = 50;

export interface Manifest {
  v: 1;
  kind: "file" | "folder";
  name: string;
  created: string;
  count: number;
  bytes: number;
}

export function encodeManifest(m: Manifest): Buffer {
  const json = Buffer.from(JSON.stringify(m), "utf8");
  const head = Buffer.alloc(5);
  head[0] = 0x4d; // "M"
  head.writeUInt32BE(json.length, 1);
  return Buffer.concat([head, json]);
}

function entryHead(tag: number, path: string, mode: number, mtimeMs: number, extra: number): Buffer {
  const p = Buffer.from(path, "utf8");
  const b = Buffer.alloc(1 + 2 + p.length + 2 + 8 + extra);
  b[0] = tag;
  b.writeUInt16BE(p.length, 1);
  p.copy(b, 3);
  b.writeUInt16BE(mode & 0o777, 3 + p.length);
  b.writeDoubleBE(mtimeMs, 5 + p.length);
  return b;
}

export function encodeFileEntry(path: string, mode: number, mtimeMs: number, size: number): Buffer {
  const b = entryHead(0x46, path, mode, mtimeMs, 8); // "F"
  b.writeUInt32BE(Math.floor(size / 2 ** 32), b.length - 8);
  b.writeUInt32BE(size % 2 ** 32, b.length - 4);
  return b;
}

export function encodeDirEntry(path: string, mode: number, mtimeMs: number): Buffer {
  return entryHead(0x44, path, mode, mtimeMs, 0); // "D"
}

export const END_ENTRY = Buffer.from([0x45]); // "E"

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

/** Why one path component can never be stored or extracted, or null when it is fine on every platform. */
export function componentProblem(name: string, platform: Platform = platformName()): string | null {
  if (name.length === 0) return "an empty name";
  if (name === "." || name === "..") return "a '.' or '..' part";
  if (/[\u0000-\u001f\u007f\\]/.test(name)) return "a name with control characters or a backslash";
  if (name.includes("/")) return "a name containing a slash";
  if (name.includes("\ufffd")) return "a name that isn't valid text";
  if (Buffer.byteLength(name, "utf8") > MAX_NAME_BYTES) return "a name that is too long";
  if (platform === "win32") {
    if (name !== name.trim() || validateName(name, "win32")) return "a name Windows doesn't allow";
    if (/^[A-Za-z]:/.test(name)) return "a drive letter";
  }
  return null;
}

/** Splits and checks a stored relative path. Throws the plain "unsafe contents" error on anything suspicious. */
export function checkEntryPath(path: string, platform: Platform = platformName()): string[] {
  if (path.length === 0) throw unsafe("an entry without a path");
  if (Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES) throw unsafe("a path that is too long");
  if (path.startsWith("/")) throw unsafe("an absolute path");
  if (/^[A-Za-z]:/.test(path)) throw unsafe("a drive letter");
  const parts = path.split("/");
  if (parts.length > MAX_DEPTH) throw unsafe("folders nested too deeply");
  for (const part of parts) {
    const problem = componentProblem(part, platform);
    if (problem) throw unsafe(`an unsafe path (${problem})`);
  }
  return parts;
}

export function unsafe(reason: string): VaultError {
  return new VaultError("BAD_CONTAINER", `The file unlocked, but it contains something that isn't safe to extract (${reason}), so nothing was extracted.`);
}

/** Two names that are the same file on this platform (macOS and Windows ignore case; macOS also ignores accent composition). */
export function collisionKey(path: string, platform: Platform = platformName()): string {
  return platform === "linux" ? path : path.normalize("NFC").toLowerCase();
}
