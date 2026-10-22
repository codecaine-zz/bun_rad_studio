/**
 * Reading files for the Dev tab's scans: never through a symbolic link (the file is opened with O_NOFOLLOW and must be
 * a regular file), never more than a fixed number of bytes, and a quick test for binary files.
 */
import { constants, promises as fsp } from "fs";
import type { FileHandle } from "fs/promises";

export const MAX_READ_BYTES = 8 * 1024 * 1024;

export type ReadResult =
  | { kind: "ok"; buf: Buffer; size: number; mtimeMs: number }
  | { kind: "big"; size: number; mtimeMs: number }
  | { kind: "skip" };

/** Reads a whole regular file of at most `maxBytes`; a bigger one is reported ("big") but not read. */
export async function readRegularFile(abs: string, maxBytes = MAX_READ_BYTES): Promise<ReadResult> {
  let handle: FileHandle | null = null;
  try {
    const lst = await fsp.lstat(abs);
    if (lst.isSymbolicLink() || !lst.isFile()) return { kind: "skip" };
    handle = await fsp.open(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = await handle.stat();
    if (!st.isFile()) return { kind: "skip" };
    if (st.size > maxBytes) return { kind: "big", size: st.size, mtimeMs: st.mtimeMs };
    const buf = Buffer.allocUnsafe(st.size);
    let got = 0;
    while (got < st.size) {
      const { bytesRead } = await handle.read(buf, got, st.size - got, got);
      if (bytesRead === 0) break;
      got += bytesRead;
    }
    return { kind: "ok", buf: got === st.size ? buf : buf.subarray(0, got), size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { kind: "skip" };
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** The first `bytes` bytes of a regular file (for the `#!` line), or null. */
export async function readHead(abs: string, bytes = 256): Promise<Buffer | null> {
  let handle: FileHandle | null = null;
  try {
    const lst = await fsp.lstat(abs);
    if (lst.isSymbolicLink() || !lst.isFile()) return null;
    handle = await fsp.open(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = await handle.stat();
    if (!st.isFile()) return null;
    const buf = Buffer.alloc(Math.min(bytes, st.size));
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** A NUL byte near the start means the file is not text. */
export function looksBinary(buf: Buffer): boolean {
  const end = Math.min(buf.length, 8000);
  return buf.subarray(0, end).includes(0);
}

/** The text of a buffer, without a byte order mark. */
export function decodeText(buf: Buffer): string {
  const text = buf.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export const MAX_MANIFEST_BYTES = 512 * 1024;

/** A small text file (a manifest), or null when it is missing, too big, not a regular file or binary. */
export async function readManifestText(abs: string): Promise<string | null> {
  const read = await readRegularFile(abs, MAX_MANIFEST_BYTES);
  return read.kind === "ok" && !looksBinary(read.buf) ? decodeText(read.buf) : null;
}
