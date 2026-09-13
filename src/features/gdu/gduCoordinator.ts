import { basename, resolve } from "node:path";
import type { DiskUsageItem, GduOptions, MountedDisk } from "./gduTypes.ts";
import {
  fetchMountedDisks,
  fetchMountedDisksSync,
  formatBytes,
  formatGduJson,
  formatGduLine,
  parseByteSize,
  scanItem,
  scanItemSync,
  sortDiskItems,
} from "./gduDoers.ts";
import { renderTable, type ColumnDef } from "../../shared/table.ts";
import { colors } from "../../shared/colors.ts";

export async function analyzeDirectory(options: GduOptions): Promise<DiskUsageItem> {
  const fullPath = resolve(options.targetDir);
  const name = basename(fullPath) || fullPath;
  return await scanItem(fullPath, name, options.ignoreDirs ?? [], options.noHidden ?? false, 0, options.maxDepth);
}

export function analyzeDirectorySync(options: GduOptions): DiskUsageItem {
  const fullPath = resolve(options.targetDir);
  const name = basename(fullPath) || fullPath;
  return scanItemSync(fullPath, name, options.ignoreDirs ?? [], options.noHidden ?? false, 0, options.maxDepth);
}

export function formatDisksTable(disks: MountedDisk[]): string {
  const columns: ColumnDef<MountedDisk>[] = [
    { header: "Filesystem", align: "left", getValue: (d) => colors.bold(d.filesystem) },
    { header: "Size", align: "right", getValue: (d) => formatBytes(d.size) },
    { header: "Used", align: "right", getValue: (d) => formatBytes(d.used) },
    { header: "Avail", align: "right", getValue: (d) => colors.green(formatBytes(d.available)) },
    { header: "Use%", align: "right", getValue: (d) => d.percentUsed },
    { header: "Mounted on", align: "left", getValue: (d) => colors.cyan(d.mountPoint) },
  ];
  return renderTable(columns, disks);
}

export function formatReport(root: DiskUsageItem, options: GduOptions): string[] {
  if (options.json) {
    return [formatGduJson(root)];
  }

  if (options.summarize) {
    return [formatGduLine(root, root.size, options)];
  }

  let rawItems = root.children ?? [];
  if (options.minSize) {
    const minBytes = typeof options.minSize === "number" ? options.minSize : parseByteSize(options.minSize);
    rawItems = rawItems.filter((item) => item.size >= minBytes);
  }

  const sorted = sortDiskItems(rawItems, options.sortBy ?? "size");
  const limit = options.top ? sorted.slice(0, options.top) : sorted;
  const maxSize = sorted[0]?.size ?? root.size;

  return limit.map((item) => formatGduLine(item, maxSize, options));
}

export async function runGduCoordinator(options: GduOptions): Promise<string[]> {
  if (options.showDisks) {
    const disks = await fetchMountedDisks();
    return [formatDisksTable(disks)];
  }

  const root = await analyzeDirectory(options);
  return formatReport(root, options);
}
