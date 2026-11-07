/**
 * Fast asynchronous and synchronous filesystem globbing utilities powered by `Bun.Glob`.
 */
// Feature: RAD - globutils
// Fast asynchronous and synchronous filesystem globbing powered by Bun.Glob
import { Glob } from "bun";

/**
 * Options controlling directory scanning behavior for {@link globScan} and {@link globScanSync}.
 */
export interface GlobScanOptions {
  cwd?: string;
  onlyFiles?: boolean;
  dot?: boolean;
  followSymlinks?: boolean;
  absolute?: boolean;
}

// Doer: Instantiate native Bun.Glob
/**
 * Instantiates a native `Bun.Glob` matcher for `pattern`.
 */
export function createGlob(pattern: string): Glob {
  return new Glob(pattern);
}

// Doer: Test if a single path matches a glob pattern (supports Bun v1.4.4 extglob `!(...)`, `@(...)`, `+(...)`, `?(...)`, `*(...)` and brace ranges `{1..10}`, `{a..z}`)
/**
 * Tests whether `path` matches the glob `pattern` (supporting extglob and brace ranges).
 */
export function globMatch(pattern: string, path: string): boolean {
  const glob = new Glob(pattern.replace(/\\/g, "/"));
  return glob.match(path.replace(/\\/g, "/"));
}

// Doer: Filter an array of paths using a single compiled Bun.Glob instance (supports extglob & brace ranges)
/**
 * Filters `paths` down to entries matching `pattern` using a single compiled `Bun.Glob` instance.
 */
export function globFilter(
  pattern: string,
  paths: readonly string[],
): string[] {
  const glob = new Glob(pattern.replace(/\\/g, "/"));
  return paths.filter((p) => glob.match(p.replace(/\\/g, "/")));
}

// Doer: Check if a path matches any of the provided glob patterns
/**
 * Returns `true` if `path` matches at least one pattern in `patterns`.
 */
export function globMatchAny(
  patterns: readonly string[],
  path: string,
): boolean {
  const norm = path.replace(/\\/g, "/");
  return patterns.some((pattern) =>
    new Glob(pattern.replace(/\\/g, "/")).match(norm),
  );
}

// Doer: Check if a path matches all of the provided glob patterns
/**
 * Returns `true` if `path` matches every pattern in `patterns`.
 */
export function globMatchAll(
  patterns: readonly string[],
  path: string,
): boolean {
  const norm = path.replace(/\\/g, "/");
  return patterns.every((pattern) =>
    new Glob(pattern.replace(/\\/g, "/")).match(norm),
  );
}

// Coordinator: Scan directory asynchronously for all matching paths
/**
 * Asynchronously scans the filesystem for paths matching `pattern` and returns them sorted lexicographically.
 */
export async function globScan(
  pattern: string,
  options: GlobScanOptions = {},
): Promise<string[]> {
  const glob = new Glob(pattern.replace(/\\/g, "/"));
  const results: string[] = [];
  for await (const file of glob.scan({
    cwd: options.cwd ?? ".",
    onlyFiles: options.onlyFiles ?? true,
    dot: options.dot ?? false,
    followSymlinks: options.followSymlinks ?? false,
    absolute: options.absolute ?? false,
  })) {
    results.push(options.absolute ? file : file.replace(/\\/g, "/"));
  }
  return results.sort();
}

// Coordinator: Scan directory synchronously for all matching paths
/**
 * Synchronously scans the filesystem for paths matching `pattern` and returns them sorted lexicographically.
 */
export function globScanSync(
  pattern: string,
  options: GlobScanOptions = {},
): string[] {
  const glob = new Glob(pattern.replace(/\\/g, "/"));
  const results: string[] = [];
  for (const file of glob.scanSync({
    cwd: options.cwd ?? ".",
    onlyFiles: options.onlyFiles ?? true,
    dot: options.dot ?? false,
    followSymlinks: options.followSymlinks ?? false,
    absolute: options.absolute ?? false,
  })) {
    results.push(options.absolute ? file : file.replace(/\\/g, "/"));
  }
  return results.sort();
}

// Coordinator: Find files matching pattern within a root directory
/**
 * Finds all regular files matching `pattern` inside `dir`.
 */
export async function findFiles(pattern: string, dir = "."): Promise<string[]> {
  return globScan(pattern, { cwd: dir, onlyFiles: true });
}

// Coordinator: Check if any file matches the pattern within a directory
/**
 * Returns `true` as soon as at least one file matching `pattern` is found under `dir`.
 */
export async function hasMatch(pattern: string, dir = "."): Promise<boolean> {
  const glob = new Glob(pattern);
  for await (const _ of glob.scan({ cwd: dir, onlyFiles: true })) {
    return true;
  }
  return false;
}

/**
 * Namespace of glob matching and directory scanning utilities powered by `Bun.Glob`.
 */
export const globutils = {
  createGlob,
  glob: globScan,
  globMatch,
  globFilter,
  globMatchAny,
  globMatchAll,
  globScan,
  globScanSync,
  findFiles,
  hasMatch,
};
