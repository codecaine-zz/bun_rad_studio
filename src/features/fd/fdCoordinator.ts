import { resolve } from "node:path";
import type { FdEntry, FdOptions } from "./fdTypes.ts";
import {
  buildMatcher,
  collectAllEntries,
  executeCommand,
  formatFdEntry,
  matchesChangedWithin,
  matchesEmpty,
  matchesExclude,
  matchesExtension,
  matchesMinDepth,
  matchesSize,
  matchesType,
} from "./fdDoers.ts";

export async function searchFiles(options: FdOptions): Promise<FdEntry[]> {
  const root = resolve(options.rootPath);
  const matcher = buildMatcher(options.pattern, options.caseSensitive);
  const allEntries = await collectAllEntries(
    root,
    1,
    options.rootPath,
    options.maxDepth,
    options.hidden
  );

  return allEntries.filter((entry) => {
    if (!matchesMinDepth(entry.depth, options.minDepth)) return false;
    if (matchesExclude(entry.displayPath, options.exclude)) return false;
    if (!matchesSize(entry.size, options.sizeFilter)) return false;
    if (!matchesChangedWithin(entry.mtime, options.changedWithin)) return false;
    if (!matchesEmpty(entry, options.empty)) return false;
    if (!matcher(entry.name, entry.displayPath)) return false;
    if (!matchesType(entry, options.typeFilter)) return false;
    if (!matchesExtension(entry.name, options.extension)) return false;
    return true;
  });
}

export async function runFdCoordinator(options: FdOptions): Promise<string[]> {
  const matches = await searchFiles(options);

  if (options.execCmd && options.execCmd.length > 0) {
    for (const match of matches) {
      const targetPath = options.absolute ? match.path : match.displayPath;
      await executeCommand(options.execCmd, targetPath);
    }
    return [];
  }

  return matches.map((m) => formatFdEntry(m, options.absolute));
}
