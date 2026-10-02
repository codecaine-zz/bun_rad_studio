// Feature: RAD - globutils
// Fast asynchronous and synchronous filesystem globbing powered by Bun.Glob
import { Glob } from "bun";

export interface GlobScanOptions {
  cwd?: string;
  onlyFiles?: boolean;
  dot?: boolean;
  followSymlinks?: boolean;
  absolute?: boolean;
}

// Doer: Instantiate native Bun.Glob
export function createGlob(pattern: string): Glob {
  return new Glob(pattern);
}

// Doer: Test if a single path matches a glob pattern
export function globMatch(pattern: string, path: string): boolean {
  const glob = new Glob(pattern);
  return glob.match(path);
}

// Coordinator: Scan directory asynchronously for all matching paths
export async function globScan(pattern: string, options: GlobScanOptions = {}): Promise<string[]> {
  const glob = new Glob(pattern);
  const results: string[] = [];
  for await (const file of glob.scan({
    cwd: options.cwd ?? ".",
    onlyFiles: options.onlyFiles ?? true,
    dot: options.dot ?? false,
    followSymlinks: options.followSymlinks ?? false,
    absolute: options.absolute ?? false,
  })) {
    results.push(file);
  }
  return results.sort();
}

// Coordinator: Scan directory synchronously for all matching paths
export function globScanSync(pattern: string, options: GlobScanOptions = {}): string[] {
  const glob = new Glob(pattern);
  const results: string[] = [];
  for (const file of glob.scanSync({
    cwd: options.cwd ?? ".",
    onlyFiles: options.onlyFiles ?? true,
    dot: options.dot ?? false,
    followSymlinks: options.followSymlinks ?? false,
    absolute: options.absolute ?? false,
  })) {
    results.push(file);
  }
  return results.sort();
}

// Coordinator: Find files matching pattern within a root directory
export async function findFiles(pattern: string, dir = "."): Promise<string[]> {
  return globScan(pattern, { cwd: dir, onlyFiles: true });
}

// Coordinator: Check if any file matches the pattern within a directory
export async function hasMatch(pattern: string, dir = "."): Promise<boolean> {
  const glob = new Glob(pattern);
  for await (const _ of glob.scan({ cwd: dir, onlyFiles: true })) {
    return true;
  }
  return false;
}

export const globutils = {
  createGlob,
  glob: globScan,
  globMatch,
  globScan,
  globScanSync,
  findFiles,
  hasMatch,
};

