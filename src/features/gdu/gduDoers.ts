import { rmSync, lstatSync, readdirSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DiskUsageItem, GduOptions, GduSortBy, MountedDisk } from "./gduTypes.ts";
import { colors } from "../../shared/colors.ts";

export function formatBytes(bytes: number, si: boolean = false): string {
  const base = si ? 1000 : 1024;
  const units = si
    ? ["B", "kB", "MB", "GB", "TB"]
    : ["B", "KiB", "MiB", "GiB", "TiB"];

  if (bytes < base) return `${bytes} B`.padStart(10);
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  const val = (bytes / Math.pow(base, exp)).toFixed(1);
  return `${val} ${units[exp]}`.padStart(10);
}

export function formatCount(count: number): string {
  if (count < 1000) return count.toString().padStart(10);
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`.padStart(10);
  return `${(count / 1000000).toFixed(1)}M`.padStart(10);
}

export function parseByteSize(str: string): number {
  const match = str.trim().match(/^([\d.]+)\s*([kKmMgGtT]?[iI]?[bB]?)$/);
  if (!match) return 0;
  const num = parseFloat(match[1]!);
  const unit = match[2]!.toUpperCase();
  if (unit.startsWith("K")) return num * 1024;
  if (unit.startsWith("M")) return num * 1024 * 1024;
  if (unit.startsWith("G")) return num * 1024 * 1024 * 1024;
  if (unit.startsWith("T")) return num * 1024 * 1024 * 1024 * 1024;
  return num;
}

export function formatGduJson(item: DiskUsageItem): string {
  return JSON.stringify(item, null, 2);
}

export function formatRelativeBar(ratio: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  const bar = "#".repeat(filled).padEnd(width, " ");
  return `[${bar}]`;
}

export function shouldIgnoreItem(
  name: string,
  fullPath: string,
  ignoreDirs: string[] = [],
  noHidden: boolean = false
): boolean {
  if (noHidden && name.startsWith(".")) return true;
  if (!ignoreDirs || !Array.isArray(ignoreDirs)) return false;
  return ignoreDirs.some((ig) => fullPath === ig || name === ig);
}

export function sortDiskItems(
  items: DiskUsageItem[],
  sortBy: "size" | "name" | "count" | "mtime" = "size"
): DiskUsageItem[] {
  if (sortBy === "name") return [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === "count") return [...items].sort((a, b) => b.itemCount - a.itemCount);
  if (sortBy === "mtime") return [...items].sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
  return [...items].sort((a, b) => b.size - a.size);
}

// Doer: permanently delete a file or directory recursively
export function deleteDiskItem(targetPath: string): void {
  rmSync(targetPath, { recursive: true, force: true });
}

// Doer: launch default operating system handler for file or directory
export function openItemInDefaultApp(targetPath: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  Bun.spawn([cmd, targetPath]);
}

export async function scanItem(
  itemPath: string,
  name: string,
  ignoreDirs: string[] = [],
  noHidden: boolean = false,
  depth: number = 0,
  maxDepth?: number
): Promise<DiskUsageItem> {
  const s = await lstat(itemPath);
  if (!s.isDirectory()) {
    return {
      name,
      path: itemPath,
      size: s.size,
      itemCount: 1,
      isDirectory: false,
      mtime: s.mtime,
    };
  }

  let totalSize = s.size;
  let totalCount = 1;
  let latestMtime = s.mtime;
  const children: DiskUsageItem[] = [];

  if (maxDepth === undefined || depth < maxDepth) {
    try {
      const entries = await readdir(itemPath, { withFileTypes: true });
      for (const entry of entries) {
        const childPath = join(itemPath, entry.name);
        if (shouldIgnoreItem(entry.name, childPath, ignoreDirs, noHidden)) {
          continue;
        }
        try {
          const child = await scanItem(childPath, entry.name, ignoreDirs, noHidden, depth + 1, maxDepth);
          totalSize += child.size;
          totalCount += child.itemCount;
          if (child.mtime > latestMtime) latestMtime = child.mtime;
          children.push(child);
        } catch {
          // Permission or broken link
        }
      }
    } catch {
      // Unreadable dir
    }
  }

  children.sort((a, b) => b.size - a.size);

  return {
    name,
    path: itemPath,
    size: totalSize,
    itemCount: totalCount,
    isDirectory: true,
    mtime: latestMtime,
    children,
  };
}

export function scanItemSync(
  itemPath: string,
  name: string,
  ignoreDirs: string[] = [],
  noHidden: boolean = false,
  depth: number = 0,
  maxDepth?: number
): DiskUsageItem {
  let s;
  try {
    s = lstatSync(itemPath);
  } catch {
    return {
      name,
      path: itemPath,
      size: 0,
      itemCount: 1,
      isDirectory: false,
      mtime: new Date(),
    };
  }

  if (!s.isDirectory()) {
    return {
      name,
      path: itemPath,
      size: s.size,
      itemCount: 1,
      isDirectory: false,
      mtime: s.mtime,
    };
  }

  let totalSize = s.size;
  let totalCount = 1;
  let latestMtime = s.mtime;
  const children: DiskUsageItem[] = [];

  if (maxDepth === undefined || depth < maxDepth) {
    try {
      const entries = readdirSync(itemPath, { withFileTypes: true });
      for (const entry of entries) {
        const childPath = join(itemPath, entry.name);
        if (shouldIgnoreItem(entry.name, childPath, ignoreDirs, noHidden)) {
          continue;
        }
        try {
          const child = scanItemSync(childPath, entry.name, ignoreDirs, noHidden, depth + 1, maxDepth);
          totalSize += child.size;
          totalCount += child.itemCount;
          if (child.mtime > latestMtime) latestMtime = child.mtime;
          children.push(child);
        } catch {}
      }
    } catch {}
  }

  children.sort((a, b) => b.size - a.size);

  return {
    name,
    path: itemPath,
    size: totalSize,
    itemCount: totalCount,
    isDirectory: true,
    mtime: latestMtime,
    children,
  };
}

export function parseDfOutput(raw: string): MountedDisk[] {
  const lines = raw.trim().split("\n");
  const disks: MountedDisk[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const filesystem = parts[0]!;
    const size = (parseInt(parts[1]!, 10) || 0) * 1024;
    const used = (parseInt(parts[2]!, 10) || 0) * 1024;
    const available = (parseInt(parts[3]!, 10) || 0) * 1024;
    const percentUsed = parts[4]!;
    const mountPoint = parts[parts.length - 1]!;

    if (filesystem.startsWith("/dev/")) {
      disks.push({ filesystem, size, used, available, percentUsed, mountPoint });
    }
  }
  return disks;
}

export function fetchMountedDisksSync(): MountedDisk[] {
  try {
    const proc = Bun.spawnSync(["df", "-k"]);
    const raw = proc.stdout ? proc.stdout.toString() : "";
    return parseDfOutput(raw);
  } catch {
    return [];
  }
}

export async function fetchMountedDisks(): Promise<MountedDisk[]> {
  const proc = Bun.spawn(["df", "-k"], { stdout: "pipe", stderr: "pipe" });
  const raw = await new Response(proc.stdout).text();
  return parseDfOutput(raw);
}

export function formatGduLine(
  item: DiskUsageItem,
  maxSize: number,
  options: GduOptions
): string {
  const sizeStr = colors.bold(formatBytes(item.size, options.si));
  const countStr = options.showItemCount ? colors.dim(formatCount(item.itemCount)) : "";
  const ratio = maxSize > 0 ? item.size / maxSize : 0;
  const pctStr = options.showRelativeSize ? colors.dim(`[${(ratio * 100).toFixed(1).padStart(5)}%]`) : "";
  const barStr = options.showRelativeSize ? colors.green(formatRelativeBar(ratio)) : "";
  const displayName = item.isDirectory ? colors.blue(`/${item.name}`) : item.name;

  const cols = [sizeStr, countStr, pctStr, barStr, displayName].filter((s) => s.length > 0);
  return cols.join("  ");
}
