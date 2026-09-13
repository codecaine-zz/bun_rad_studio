import { readdir, stat, lstat } from "node:fs/promises";
import { join, resolve, relative, extname } from "node:path";
import type { EntryTypeFilter, FdEntry } from "./fdTypes.ts";
import { colors } from "../../shared/colors.ts";

export function isEntryExecutable(mode: number): boolean {
  return (mode & 0o111) !== 0;
}

export function buildMatcher(
  pattern?: string,
  caseSensitive?: boolean
): (name: string, path: string) => boolean {
  if (!pattern) return () => true;
  const isCase =
    caseSensitive !== undefined ? caseSensitive : pattern !== pattern.toLowerCase();
  try {
    const regex = new RegExp(pattern, isCase ? "" : "i");
    return (name: string, path: string) => regex.test(name) || regex.test(path);
  } catch {
    const term = isCase ? pattern : pattern.toLowerCase();
    return (name: string, path: string) =>
      (isCase ? name : name.toLowerCase()).includes(term) ||
      (isCase ? path : path.toLowerCase()).includes(term);
  }
}

export function matchesType(entry: FdEntry, filter?: EntryTypeFilter): boolean {
  if (!filter) return true;
  if (filter === "f") return entry.isFile;
  if (filter === "d") return entry.isDirectory;
  if (filter === "l") return entry.isSymlink;
  if (filter === "x") return entry.isExecutable;
  return true;
}

export function matchesExtension(name: string, ext?: string): boolean {
  if (!ext) return true;
  const targetExt = ext.startsWith(".") ? ext.slice(1) : ext;
  const currentExt = extname(name).replace(/^\./, "");
  return currentExt.toLowerCase() === targetExt.toLowerCase();
}

export function parseSizeFilter(filter: string): { op: ">" | "<" | "="; bytes: number } | null {
  const match = filter.trim().match(/^([+-]?)([\d.]+)\s*([kKmMgGtT]?[bB]?)$/);
  if (!match) return null;
  const sign = match[1];
  const num = parseFloat(match[2]!);
  const unit = match[3]!.toUpperCase();

  let mult = 1;
  if (unit.startsWith("K")) mult = 1024;
  else if (unit.startsWith("M")) mult = 1024 * 1024;
  else if (unit.startsWith("G")) mult = 1024 * 1024 * 1024;
  else if (unit.startsWith("T")) mult = 1024 * 1024 * 1024 * 1024;

  const bytes = num * mult;
  const op = sign === "+" ? ">" : sign === "-" ? "<" : "=";
  return { op, bytes };
}

export function matchesSize(size: number | undefined, filter?: string): boolean {
  if (!filter) return true;
  if (size === undefined) return false;
  const parsed = parseSizeFilter(filter);
  if (!parsed) return true;
  if (parsed.op === ">") return size > parsed.bytes;
  if (parsed.op === "<") return size < parsed.bytes;
  return Math.abs(size - parsed.bytes) < 512;
}

export function matchesExclude(path: string, excludes?: string[]): boolean {
  if (!excludes || excludes.length === 0) return false;
  return excludes.some((ex) => path.includes(ex));
}

export function parseDurationMs(duration: string): number | null {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*([smhdwy]?)$/i);
  if (!match) return null;
  const val = parseFloat(match[1]!);
  const unit = (match[2] || "s").toLowerCase();
  if (unit === "s") return val * 1000;
  if (unit === "m") return val * 60 * 1000;
  if (unit === "h") return val * 60 * 60 * 1000;
  if (unit === "d") return val * 24 * 60 * 60 * 1000;
  if (unit === "w") return val * 7 * 24 * 60 * 60 * 1000;
  if (unit === "y") return val * 365 * 24 * 60 * 60 * 1000;
  return val * 1000;
}

export function matchesChangedWithin(mtime?: Date, duration?: string): boolean {
  if (!duration || !mtime) return true;
  const ms = parseDurationMs(duration);
  if (ms === null) return true;
  return mtime.getTime() >= Date.now() - ms;
}

export function matchesMinDepth(depth: number, minDepth?: number): boolean {
  if (minDepth === undefined) return true;
  return depth >= minDepth;
}

export function matchesEmpty(entry: FdEntry, emptyOnly?: boolean): boolean {
  if (!emptyOnly) return true;
  if (entry.isFile) return entry.size === 0;
  return false;
}

export async function readDirectoryEntries(
  dirPath: string,
  currentDepth: number,
  basePath: string,
  showHidden: boolean
): Promise<FdEntry[]> {
  try {
    const dirEntries = await readdir(dirPath, { withFileTypes: true });
    const results: FdEntry[] = [];
    const rootDir = resolve(basePath);

    for (const d of dirEntries) {
      if (!showHidden && d.name.startsWith(".")) continue;
      const fullPath = join(dirPath, d.name);
      const isSymlink = d.isSymbolicLink();
      const isDirectory = d.isDirectory();
      const isFile = d.isFile();

      let isExecutable = false;
      let size: number | undefined = undefined;
      let mtime: Date | undefined = undefined;
      try {
        const s = await stat(fullPath);
        size = s.size;
        mtime = s.mtime;
        isExecutable = isFile && isEntryExecutable(s.mode);
      } catch {
        // Unreadable file or broken symlink
      }

      const relFromRoot = relative(rootDir, fullPath);
      const displayPath = basePath === "." ? relFromRoot : join(basePath, relFromRoot);

      results.push({
        path: fullPath,
        displayPath: displayPath || fullPath,
        name: d.name,
        isDirectory,
        isFile,
        isSymlink,
        isExecutable,
        depth: currentDepth,
        size,
        mtime,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function collectAllEntries(
  currentDir: string,
  currentDepth: number,
  basePath: string,
  maxDepth: number | undefined,
  showHidden: boolean
): Promise<FdEntry[]> {
  if (maxDepth !== undefined && currentDepth > maxDepth) return [];
  const entries = await readDirectoryEntries(currentDir, currentDepth, basePath, showHidden);
  const collected: FdEntry[] = [];

  for (const entry of entries) {
    collected.push(entry);
    if (entry.isDirectory && !entry.isSymlink) {
      if (maxDepth === undefined || currentDepth < maxDepth) {
        const sub = await collectAllEntries(
          entry.path,
          currentDepth + 1,
          basePath,
          maxDepth,
          showHidden
        );
        collected.push(...sub);
      }
    }
  }
  return collected;
}

export function formatFdEntry(entry: FdEntry, useAbsolute: boolean): string {
  const p = useAbsolute ? entry.path : entry.displayPath;
  if (entry.isDirectory) return colors.blue(colors.bold(p));
  if (entry.isExecutable) return colors.green(colors.bold(p));
  if (entry.isSymlink) return colors.cyan(p);
  return p;
}

export async function executeCommand(
  cmdTemplate: string[],
  targetPath: string
): Promise<number> {
  const args = cmdTemplate.map((arg) => (arg === "{}" ? targetPath : arg));
  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  return await proc.exited;
}
