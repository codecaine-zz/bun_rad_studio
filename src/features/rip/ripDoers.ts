import { mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { GraveyardManifest, GraveyardRecord } from "./ripTypes.ts";
import { colors } from "../../shared/colors.ts";

export function resolveGraveyardDir(customDir?: string): string {
  if (customDir) return resolve(customDir);
  if (process.env.GRAVEYARD) return resolve(process.env.GRAVEYARD);
  return join(homedir(), ".local", "share", "graveyard");
}

export function generateRecordId(originalPath: string): string {
  const base = basename(originalPath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 7);
  return `${timestamp}_${rand}_${base}`;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function ensureDirectoryExists(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function readManifest(graveyardDir: string): Promise<GraveyardManifest> {
  const manifestFile = Bun.file(join(graveyardDir, "manifest.json"));
  if (!(await manifestFile.exists())) {
    return { version: 1, records: [] };
  }
  try {
    return (await manifestFile.json()) as GraveyardManifest;
  } catch {
    return { version: 1, records: [] };
  }
}

export async function writeManifest(
  graveyardDir: string,
  manifest: GraveyardManifest
): Promise<void> {
  const manifestPath = join(graveyardDir, "manifest.json");
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function movePath(source: string, destination: string): Promise<void> {
  await ensureDirectoryExists(dirname(destination));
  await rename(source, destination);
}

export async function permanentDelete(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

export async function inspectPath(targetPath: string): Promise<{ isDirectory: boolean; size: number }> {
  try {
    const s = await stat(targetPath);
    return { isDirectory: s.isDirectory(), size: s.size };
  } catch {
    throw new Error(`[RipInspect] File or directory does not exist: ${targetPath}`);
  }
}

export function formatGraveyardRecord(record: GraveyardRecord): string {
  const date = new Date(record.deletedAt).toLocaleString();
  const typeTag = record.isDirectory ? colors.blue("[DIR]") : colors.green("[FILE]");
  const idStr = colors.dim(`(${record.id})`);
  const sizeStr = colors.yellow(formatByteSize(record.size));
  return `${colors.dim(date)}  ${typeTag}  ${sizeStr.padEnd(10)}  ${record.originalPath}  ${idStr}`;
}

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

export function computeGraveyardSize(manifest: GraveyardManifest): { totalBytes: number; count: number } {
  const totalBytes = manifest.records.reduce((acc, r) => acc + (r.size || 0), 0);
  return { totalBytes, count: manifest.records.length };
}

export function formatGraveyardSummary(manifest: GraveyardManifest): string {
  const { totalBytes, count } = computeGraveyardSize(manifest);
  return `Graveyard contains ${count} item(s) occupying ${formatByteSize(totalBytes)}.`;
}
