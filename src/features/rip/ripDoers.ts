/**
 * Low-level filesystem, manifest I/O, and formatting helpers for the `rip`
 * safe file deletion and graveyard system.
 */
import {
  cp,
  lstat,
  mkdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { GraveyardManifest, GraveyardRecord } from "./ripTypes.ts";
import { colors } from "../../shared/colors.ts";

/**
 * Resolves the active graveyard directory path from an explicit override,
 * the `GRAVEYARD` environment variable, or the default `~/.local/share/rip/graveyard`.
 */
export function resolveGraveyardDir(customDir?: string): string {
  if (customDir) return resolve(customDir);
  if (process.env.GRAVEYARD) return resolve(process.env.GRAVEYARD);
  return join(homedir(), ".local", "share", "rip", "graveyard");
}

/**
 * Generates a unique graveyard record identifier combining a millisecond timestamp,
 * a random suffix, and the sanitized basename of `originalPath`.
 */
export function generateRecordId(originalPath: string): string {
  const base = basename(originalPath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  return `${timestamp}_${rand}_${base}`;
}

/**
 * Formats a byte count into a human-readable string (`B`, `KB`, or `MB`).
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Ensures that the specified directory (and any parent directories) exists on disk.
 */
export async function ensureDirectoryExists(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

/**
 * Converts a `rip_engine.ts` `GraveyardItem` into a `GraveyardRecord` while preserving extra fields.
 */
function itemToRecord(item: Record<string, any>): GraveyardRecord {
  const deletedAt =
    typeof item.deletedAt === "string"
      ? item.deletedAt
      : typeof item.buriedAt === "string"
        ? item.buriedAt
        : new Date().toISOString();
  const size =
    typeof item.size === "number"
      ? item.size
      : typeof item.sizeBytes === "number"
        ? item.sizeBytes
        : 0;
  const isDirectory =
    typeof item.isDirectory === "boolean"
      ? item.isDirectory
      : item.type === "directory";
  return {
    ...item,
    id: String(item.id ?? ""),
    originalPath: String(item.originalPath ?? ""),
    graveyardPath: String(item.graveyardPath ?? ""),
    deletedAt,
    isDirectory,
    size,
  };
}

/**
 * Converts a `GraveyardRecord` into a `rip_engine.ts`-compatible `GraveyardItem` object.
 */
function recordToItem(
  rec: GraveyardRecord,
  graveyardDir: string,
): Record<string, unknown> {
  const buriedAt = rec.deletedAt || new Date().toISOString();
  const buriedAtMs =
    typeof rec.buriedAtMs === "number"
      ? rec.buriedAtMs
      : Date.parse(buriedAt) || Date.now();
  const sizeBytes = typeof rec.size === "number" ? rec.size : 0;
  const cwd = typeof rec.cwd === "string" ? rec.cwd : dirname(rec.originalPath);
  return {
    ...rec,
    id: rec.id,
    name: typeof rec.name === "string" ? rec.name : basename(rec.originalPath),
    originalPath: rec.originalPath,
    relativePath:
      typeof rec.relativePath === "string"
        ? rec.relativePath
        : basename(rec.originalPath),
    graveyardRel:
      typeof rec.graveyardRel === "string"
        ? rec.graveyardRel
        : relative(graveyardDir, rec.graveyardPath),
    graveyardPath: rec.graveyardPath,
    buriedAt,
    deletedAt: buriedAt,
    buriedAtMs,
    sizeBytes,
    size: sizeBytes,
    humanSize:
      typeof rec.humanSize === "string"
        ? rec.humanSize
        : formatByteSize(sizeBytes),
    fileCount: typeof rec.fileCount === "number" ? rec.fileCount : 1,
    type:
      typeof rec.type === "string"
        ? rec.type
        : rec.isDirectory
          ? "directory"
          : "file",
    isDirectory: rec.isDirectory,
    mode: typeof rec.mode === "number" ? rec.mode : 0o644,
    permStr:
      typeof rec.permStr === "string"
        ? rec.permStr
        : rec.isDirectory
          ? "rwxr-xr-x"
          : "rw-r--r--",
    cwd,
    status: typeof rec.status === "string" ? rec.status : "buried",
  };
}

/**
 * Reads and parses `manifest.json` from the graveyard directory, reconciling both
 * `items` (`rip_engine.ts`) and legacy `records` schemas, and throwing if an existing manifest is corrupted.
 */
export async function readManifest(
  graveyardDir: string,
): Promise<GraveyardManifest> {
  const manifestPath = join(graveyardDir, "manifest.json");
  const manifestFile = Bun.file(manifestPath);
  if (!(await manifestFile.exists())) {
    return {
      version: "1.0.0",
      graveyardRoot: graveyardDir,
      lastUpdated: new Date().toISOString(),
      records: [],
      items: [],
    };
  }
  const raw = await manifestFile.text();
  if (!raw.trim()) {
    return {
      version: "1.0.0",
      graveyardRoot: graveyardDir,
      lastUpdated: new Date().toISOString(),
      records: [],
      items: [],
    };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(
      `[RipManifest] Graveyard manifest is corrupted (${manifestPath}): ${err?.message || "invalid JSON"}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `[RipManifest] Graveyard manifest has invalid root structure: ${manifestPath}`,
    );
  }
  const rawItems: any[] | null = Array.isArray(parsed.items)
    ? parsed.items
    : null;
  const rawRecords: any[] | null = Array.isArray(parsed.records)
    ? parsed.records
    : null;

  let records: GraveyardRecord[];
  if (rawItems) {
    records = rawItems
      .filter((it) => !it?.status || it.status === "buried")
      .map(itemToRecord);
  } else if (rawRecords) {
    records = rawRecords.map(itemToRecord);
  } else {
    records = [];
  }

  return {
    version: parsed.version ?? "1.0.0",
    graveyardRoot: parsed.graveyardRoot ?? graveyardDir,
    lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    records,
    items: rawItems ?? records.map((r) => recordToItem(r, graveyardDir)),
  };
}

/**
 * Atomically writes the updated `GraveyardManifest` to `manifest.json` inside `graveyardDir`
 * with both `items` (for `rip_engine.ts`) and `records` (for `src/features/rip` callers).
 */
export async function writeManifest(
  graveyardDir: string,
  manifest: GraveyardManifest,
): Promise<void> {
  await ensureDirectoryExists(graveyardDir);
  const manifestPath = join(graveyardDir, "manifest.json");
  const tmpPath = join(
    graveyardDir,
    `.manifest.json.tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
  );
  const items = manifest.records.map((r) => recordToItem(r, graveyardDir));
  const payload = {
    version: typeof manifest.version === "string" ? manifest.version : "1.0.0",
    graveyardRoot: graveyardDir,
    lastUpdated: new Date().toISOString(),
    items,
    records: manifest.records,
  };
  try {
    await writeFile(tmpPath, JSON.stringify(payload, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    await rename(tmpPath, manifestPath);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {}
    throw err;
  }
}

/**
 * Moves a file or directory from `source` to `destination`, creating destination parent directories if needed.
 */
export async function movePath(
  source: string,
  destination: string,
): Promise<void> {
  await ensureDirectoryExists(dirname(destination));
  try {
    await rename(source, destination);
  } catch (err: any) {
    if (err?.code === "EXDEV") {
      await cp(source, destination, { recursive: true });
      await rm(source, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

/**
 * Permanently and recursively removes a file or directory from disk (`rm -rf`).
 */
export async function permanentDelete(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

/**
 * Inspects a filesystem path to determine whether it is a directory and its size in bytes.
 * Throws an error if the target path does not exist.
 */
export async function inspectPath(
  targetPath: string,
): Promise<{ isDirectory: boolean; size: number }> {
  try {
    const s = await lstat(targetPath);
    return { isDirectory: s.isDirectory(), size: s.size };
  } catch {
    throw new Error(
      `[RipInspect] File or directory does not exist: ${targetPath}`,
    );
  }
}

/**
 * Formats a single `GraveyardRecord` as a single-line colorized summary row for seance listings.
 */
export function formatGraveyardRecord(record: GraveyardRecord): string {
  const date = new Date(record.deletedAt).toLocaleString();
  const typeTag = record.isDirectory
    ? colors.blue("[DIR]")
    : colors.green("[FILE]");
  const idStr = colors.dim(`(${record.id})`);
  const sizeStr = colors.yellow(formatByteSize(record.size));
  return `${colors.dim(date)}  ${typeTag}  ${sizeStr.padEnd(10)}  ${record.originalPath}  ${idStr}`;
}

/**
 * Formats detailed multi-line key-value metadata for a single `GraveyardRecord`.
 */
export function formatRecordDetail(record: GraveyardRecord): string {
  return [
    `ID           : ${record.id}`,
    `Original Path: ${record.originalPath}`,
    `Graveyard Loc: ${record.graveyardPath}`,
    `Deleted At   : ${new Date(record.deletedAt).toLocaleString()}`,
    `Type         : ${record.isDirectory ? "Directory" : "File"}`,
    `Size         : ${formatByteSize(record.size)} (${record.size} bytes)`,
  ].join("\n");
}

/**
 * Calculates the total byte size and item count across all records in a `GraveyardManifest`.
 */
export function computeGraveyardSize(manifest: GraveyardManifest): {
  totalBytes: number;
  count: number;
} {
  const totalBytes = manifest.records.reduce(
    (acc, r) => acc + (r.size || 0),
    0,
  );
  return { totalBytes, count: manifest.records.length };
}

/**
 * Formats a human-readable summary sentence stating total item count and storage used by the graveyard.
 */
export function formatGraveyardSummary(manifest: GraveyardManifest): string {
  const { totalBytes, count } = computeGraveyardSize(manifest);
  return `Graveyard contains ${count} item(s) occupying ${formatByteSize(totalBytes)}.`;
}
