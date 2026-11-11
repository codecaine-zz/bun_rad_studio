/**
 * Native filesystem, exclusive-write, symlink-containment, and streaming download helpers
 * shared by `fmOllama.ts`, `fmBionic.ts`, and `fmPhonon.ts`.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import { promises as fsp } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import { FmError, isSameOrInside } from "./fmPaths";

/**
 * Synchronously reads a UTF-8 text file via native `fs.readFileSync` with zero subprocesses.
 */
export function readTextFileSyncNative(filePath: string): string {
  if (!filePath || filePath.includes("\0")) return "";
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size <= 0) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Synchronously creates a directory and missing parents via native `fs.mkdirSync`.
 */
export function ensureDirectorySyncNative(dirPath: string): void {
  if (!dirPath || dirPath.includes("\0")) return;
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {}
}

/**
 * Synchronously lists immediate entries in a directory via `fs.readdirSync({ withFileTypes: true })`.
 */
export function listDirectoryEntriesSyncNative(
  dirPath: string,
  joinEntry: (name: string) => string,
): Array<{ name: string; path: string; isDir: boolean }> {
  if (!dirPath || dirPath.includes("\0")) return [];
  try {
    const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
    const out: Array<{ name: string; path: string; isDir: boolean }> =
      new Array(dirents.length);
    for (let i = 0; i < dirents.length; i++) {
      const d = dirents[i]!;
      let isDir = d.isDirectory();
      const fullPath = joinEntry(d.name);
      if (!isDir && d.isSymbolicLink()) {
        try {
          isDir = fs.statSync(fullPath).isDirectory();
        } catch {
          isDir = false;
        }
      }
      out[i] = { name: d.name, path: fullPath, isDir };
    }
    return out;
  } catch {
    return [];
  }
}

function resolveDeepestRealTargetSync(
  targetPath: string,
  platform: NodeJS.Platform,
): string {
  const pathOps = platform === "win32" ? nodePath.win32 : nodePath.posix;
  let cur = pathOps.resolve(targetPath);
  const tail: string[] = [];
  for (let i = 0; i < 64; i++) {
    try {
      const realCur = fs.realpathSync(cur);
      return tail.length > 0
        ? pathOps.join(realCur, ...tail.reverse())
        : realCur;
    } catch {
      const parent = pathOps.dirname(cur);
      if (parent === cur) break;
      tail.push(pathOps.basename(cur));
      cur = parent;
    }
  }
  return targetPath;
}

/**
 * Verifies that `targetPath` (including resolved symlink ancestors) stays strictly within `sandboxRoot`.
 */
export function assertRealpathInsideSandboxSync(
  targetPath: string,
  sandboxRoot: string | null | undefined,
  platform: NodeJS.Platform,
): void {
  if (!sandboxRoot) return;
  let realSandbox = sandboxRoot;
  try {
    realSandbox = fs.realpathSync(sandboxRoot);
  } catch {}
  const realTarget = resolveDeepestRealTargetSync(targetPath, platform);
  const fmPlatform =
    platform === "win32" || platform === "darwin" ? platform : "linux";
  if (!isSameOrInside(realTarget, realSandbox, fmPlatform)) {
    throw new FmError(
      "PROTECTED_PATH",
      "Target path resolves outside the workspace sandbox via a symbolic link.",
    );
  }
}

/**
 * Writes a brand-new file exclusively (`{ flag: "wx" }`), refusing to overwrite existing files or symlinks.
 */
export async function writeNewFileExclusiveAsync(
  targetPath: string,
  content: string | Uint8Array,
  mode = 0o644,
): Promise<void> {
  try {
    fs.lstatSync(targetPath);
    throw new FmError(
      "ALREADY_EXISTS",
      `Refusing to overwrite existing path: ${nodePath.basename(targetPath)}`,
    );
  } catch (err) {
    if (err instanceof FmError) throw err;
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code && code !== "ENOENT") throw err;
  }
  try {
    await fsp.writeFile(targetPath, content, { flag: "wx", mode });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      throw new FmError(
        "ALREADY_EXISTS",
        `Refusing to overwrite existing path: ${nodePath.basename(targetPath)}`,
      );
    }
    throw err;
  }
}

/**
 * Moves/renames `srcPath` to `dstPath` without invoking OS shells or `mv`, refusing silent overwrites.
 */
export async function moveFileSafeExclusiveAsync(
  srcPath: string,
  dstPath: string,
): Promise<void> {
  try {
    fs.lstatSync(srcPath);
  } catch {
    throw new FmError(
      "NOT_FOUND",
      `Source path does not exist: ${nodePath.basename(srcPath)}`,
    );
  }
  try {
    fs.lstatSync(dstPath);
    throw new FmError(
      "ALREADY_EXISTS",
      `Destination already exists: ${nodePath.basename(dstPath)}`,
    );
  } catch (err) {
    if (err instanceof FmError) throw err;
  }
  try {
    await fsp.rename(srcPath, dstPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EXDEV") {
      const st = await fsp.lstat(srcPath);
      if (!st.isFile()) {
        throw new FmError(
          "MOVE_FAILED",
          "Cross-device directory move is not supported for this tool action.",
        );
      }
      await fsp.copyFile(srcPath, dstPath, fs.constants.COPYFILE_EXCL);
      await fsp.unlink(srcPath);
      return;
    }
    throw new FmError(
      "MOVE_FAILED",
      (err as Error)?.message || "Failed to move or rename file.",
    );
  }
}

/**
 * Creates a private `0700` per-session temporary directory using `fs.mkdtempSync`.
 */
export function createSessionTempDirSync(prefix: string): string {
  const dir = fs.mkdtempSync(nodePath.join(tmpdir(), prefix));
  try {
    fs.chmodSync(dir, 0o700);
  } catch {}
  return dir;
}

/**
 * Removes a file or directory safely, ignoring missing paths.
 */
export function removePathForceSync(targetPath: string): void {
  if (!targetPath || targetPath.includes("\0")) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {}
}

/**
 * Applies POSIX file mode safely without spawning `chmod`.
 */
export function chmodSafeSync(targetPath: string, mode: number): void {
  if (!targetPath || targetPath.includes("\0")) return;
  try {
    fs.chmodSync(targetPath, mode);
  } catch {}
}

/**
 * Streams an HTTPS download directly to `destPath` on disk while computing its SHA-256 digest,
 * avoiding multi-GB RAM buffering.
 */
export async function streamDownloadWithSha256(
  url: string,
  destPath: string,
  options: {
    maxBytes?: number;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    onProgress?: (receivedBytes: number, totalBytes: number) => void;
  } = {},
): Promise<{ bytesWritten: number; sha256: string }> {
  const maxBytes = options.maxBytes ?? 2 * 1024 ** 3;
  const res = await fetch(url, {
    redirect: "follow",
    signal: options.signal ?? AbortSignal.timeout(300_000),
    headers: options.headers,
  });
  if (!res.ok) {
    throw new FmError(
      "DOWNLOAD_FAILED",
      `Failed to download ${url} (HTTP ${res.status}).`,
    );
  }
  const totalBytes = Number(res.headers.get("content-length") || 0);
  if (totalBytes > maxBytes) {
    throw new FmError(
      "DOWNLOAD_FAILED",
      `Remote file exceeds maximum allowed size (${maxBytes} bytes).`,
    );
  }
  removePathForceSync(destPath);
  const fh = await fsp.open(destPath, "wx", 0o600);
  const hash = createHash("sha256");
  let received = 0;
  try {
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          received += value.byteLength;
          if (received > maxBytes) {
            throw new FmError(
              "DOWNLOAD_FAILED",
              `Downloaded archive exceeded maximum allowed size (${maxBytes} bytes).`,
            );
          }
          hash.update(value);
          await fh.write(value);
          options.onProgress?.(received, totalBytes);
        }
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        throw new FmError(
          "DOWNLOAD_FAILED",
          `Downloaded archive exceeded maximum allowed size (${maxBytes} bytes).`,
        );
      }
      received = buf.byteLength;
      hash.update(buf);
      await fh.write(buf);
      options.onProgress?.(received, totalBytes);
    }
  } catch (err) {
    await fh.close().catch(() => {});
    removePathForceSync(destPath);
    throw err;
  }
  await fh.close();
  return { bytesWritten: received, sha256: hash.digest("hex").toLowerCase() };
}

/**
 * Attempts to fetch and verify an official sibling `sha256sum.txt` / `SHA256SUMS.txt` digest for `assetName`.
 * When `expectedSha256` is explicitly supplied, requires an exact match; when a remote checksum manifest
 * is reachable alongside `downloadUrl`, verifies `actualSha256` against it and rejects mismatches.
 */
export async function verifyDownloadedArchiveIntegrity(params: {
  downloadUrl: string;
  assetName: string;
  actualSha256: string;
  expectedSha256?: string | null;
  minBytes?: number;
  bytesWritten: number;
  magicCheckPath?: string;
  expectedMagic?: "gzip" | "zstd" | "zip" | "pe";
  checkRemoteManifest?: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    downloadUrl,
    assetName,
    actualSha256,
    expectedSha256,
    minBytes = 16,
    bytesWritten,
    magicCheckPath,
    expectedMagic,
    checkRemoteManifest,
    signal,
  } = params;
  if (bytesWritten < minBytes) {
    throw new FmError(
      "INTEGRITY_FAILED",
      `Downloaded ${assetName} was truncated (${bytesWritten} bytes).`,
    );
  }
  if (magicCheckPath && expectedMagic) {
    const fh = await fsp.open(magicCheckPath, "r");
    try {
      const hdr = Buffer.alloc(6);
      const { bytesRead } = await fh.read(hdr, 0, 6, 0);
      const ok =
        expectedMagic === "gzip"
          ? bytesRead >= 2 && hdr[0] === 0x1f && hdr[1] === 0x8b
          : expectedMagic === "zstd"
            ? bytesRead >= 4 &&
              hdr[0] === 0x28 &&
              hdr[1] === 0xb5 &&
              hdr[2] === 0x2f &&
              hdr[3] === 0xfd
            : expectedMagic === "zip"
              ? bytesRead >= 4 &&
                hdr[0] === 0x50 &&
                hdr[1] === 0x4b &&
                hdr[2] === 0x03 &&
                hdr[3] === 0x04
              : bytesRead >= 2 && hdr[0] === 0x4d && hdr[1] === 0x5a;
      if (!ok) {
        throw new FmError(
          "INTEGRITY_FAILED",
          `Downloaded ${assetName} failed ${expectedMagic.toUpperCase()} header integrity verification.`,
        );
      }
    } finally {
      await fh.close().catch(() => {});
    }
  }

  let requiredHash = expectedSha256?.trim().toLowerCase() || "";
  const shouldProbeManifest =
    !requiredHash && (checkRemoteManifest ?? bytesWritten >= 65_536);
  if (shouldProbeManifest) {
    for (const sumFile of [
      "sha256sum.txt",
      "SHA256SUMS.txt",
      `${assetName}.sha256`,
    ]) {
      let sumUrl = "";
      try {
        sumUrl = new URL(sumFile, downloadUrl).href;
      } catch {
        continue;
      }
      const res = await fetch(sumUrl, {
        redirect: "follow",
        signal: signal ?? AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res?.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) continue;
      const text = (await res.text().catch(() => "")).slice(0, 256 * 1024);
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const single = /^([0-9a-fA-F]{64})$/.exec(line);
        if (single && sumFile.endsWith(".sha256")) {
          requiredHash = single[1]!.toLowerCase();
          break;
        }
        const m = /^([0-9a-fA-F]{64})\s+[* ]?(.+?)\s*$/.exec(line);
        if (m) {
          const entryBase = nodePath.basename(m[2]!.replace(/\\/g, "/"));
          if (entryBase === assetName) {
            requiredHash = m[1]!.toLowerCase();
            break;
          }
        }
      }
      if (requiredHash) break;
    }
  }

  if (requiredHash && actualSha256.toLowerCase() !== requiredHash) {
    throw new FmError(
      "INTEGRITY_FAILED",
      `SHA-256 integrity mismatch for ${assetName} (expected ${requiredHash.slice(0, 12)}…, got ${actualSha256.slice(0, 12)}…).`,
    );
  }
}
