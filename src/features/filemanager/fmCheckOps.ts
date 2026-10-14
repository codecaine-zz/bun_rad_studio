/**
 * The operations behind the "this file isn't what its name says" badges: `check/files` for a screenful of files
 * and `check/one` for the details panel. Each file is judged by `checkFile` (a few hundred bytes are read).
 */
import { absolutePath, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { checkFile, type FileCheck } from "./fmCheck";
import { FmError } from "./fmPaths";

export const MAX_CHECK_PATHS = 300;
export const CHECK_CONCURRENCY = 16;
export const CHECK_TIME_CAP_MS = 3000;

export interface CheckEntry {
  path: string;
  check: FileCheck | null;
  /** True when the time ran out before this file was looked at. */
  skipped?: boolean;
}

export interface CheckOptions {
  concurrency?: number;
  timeCapMs?: number;
  /** Replaceable for tests. */
  check?: (path: string, name: string) => Promise<FileCheck | null>;
}

/** Checks many files, a few at a time, and stops starting new ones when the time cap is reached. */
export async function checkMany(ctx: FmContext, pathsInput: unknown, options: CheckOptions = {}): Promise<CheckEntry[]> {
  if (!Array.isArray(pathsInput)) throw new FmError("BAD_REQUEST", "Choose some files to check.");
  if (pathsInput.length > MAX_CHECK_PATHS) throw new FmError("TOO_MANY", `Check at most ${MAX_CHECK_PATHS} files at once.`);
  const api = pathApi(ctx);
  const items = pathsInput.map((p) => ({ given: String(p), path: absolutePath(ctx, p) }));
  const run = options.check ?? checkFile;
  const deadline = Date.now() + (options.timeCapMs ?? CHECK_TIME_CAP_MS);
  const results: Array<CheckEntry | undefined> = new Array(items.length);
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < items.length) {
      if (Date.now() >= deadline) return;
      const i = next++;
      const item = items[i]!;
      results[i] = { path: item.given, check: await run(item.path, api.basename(item.path)).catch(() => null) };
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
  });
  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency ?? CHECK_CONCURRENCY, items.length)) }, worker);
  await Promise.race([Promise.all(workers), timeUp]);
  stopped = true;
  clearTimeout(timer);
  return items.map((item, i) => results[i] ?? { path: item.given, check: null, skipped: true });
}

export const checkOperations: Record<string, FmHandler> = {
  async "check/files"(ctx, b) {
    return { results: await checkMany(ctx, b.paths) };
  },
  async "check/one"(ctx, b) {
    const path = absolutePath(ctx, b.path);
    return { path: String(b.path), check: await checkFile(path, pathApi(ctx).basename(path)) };
  },
};
