/**
 * API operations of the "Find" power tool, namespaced `find/...`. They give the File Manager everything the
 * stand-alone Fd Studio can do: a full file search, a closer look at one result, searching inside files, finding
 * duplicates, and bulk actions on the results. Heavy work runs in a worker (see fmFindRun) so the server stays
 * responsive; the last few searches are kept here so a request doesn't have to carry thousands of paths.
 */
import { promises as fsp } from "fs";
import { userInfo } from "os";
import { hexPreview } from "../../../applications/fd_ops";
import { FD_PRESETS, FD_PRESET_NONE, FD_SORT_KEYS } from "../../fd_helpers";
import { absolutePath, pathApi, type FmHandler } from "./fmCore";
import { FmError, protectedReason } from "./fmPaths";
import { bulkOperations } from "./fmFindBulk";
import { EXPORT_FORMATS } from "./fmFindExport";
import { parseSearch, resolveTargets, statItem, storeResults } from "./fmFindQuery";
import { runWorkerJob } from "./fmFindRun";
import { DEFAULT_MAX_RESULTS, EXEC_OUTPUT_CAP, EXEC_TIMEOUT_MS, MAX_PATHS, MAX_RESULTS_CAP, MAX_WATCHERS, type SearchOutcome } from "./fmFindShared";
import { pollWatch, startWatch, stopWatch } from "./fmFindWatch";

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** The preset's "Modified" label turned into the short form the search understands. */
function presetAge(label: string): string {
  if (/10 min/i.test(label)) return "10m";
  if (/1 hour/i.test(label)) return "1h";
  if (/24 hours/i.test(label)) return "24h";
  if (/7 days/i.test(label)) return "7d";
  if (/30 days/i.test(label)) return "30d";
  return "";
}

export const findOperations: Record<string, FmHandler> = {
  ...bulkOperations,

  async "find/meta"(ctx) {
    return {
      presets: FD_PRESETS.map((p) => ({ label: p.label, pattern: p.pattern, exts: p.exts, size: p.size, modified: presetAge(p.age), type: p.type })),
      presetNone: FD_PRESET_NONE,
      sortKeys: [...FD_SORT_KEYS],
      exportFormats: [...EXPORT_FORMATS],
      limits: { defaultMaxResults: DEFAULT_MAX_RESULTS, maxResultsCap: MAX_RESULTS_CAP, maxPaths: MAX_PATHS, maxWatchers: MAX_WATCHERS, execSeconds: EXEC_TIMEOUT_MS / 1000, execOutputBytes: EXEC_OUTPUT_CAP },
      posix: ctx.platform !== "win32",
      platform: ctx.platform,
    };
  },

  async "find/search"(ctx, b) {
    const { root, options } = await parseSearch(ctx, b);
    const found = await runWorkerJob<SearchOutcome>(ctx, { kind: "search", options });
    return { resultId: storeResults(ctx, root, found.items), root, ...found };
  },

  async "find/inspect"(ctx, b) {
    const path = absolutePath(ctx, b.path);
    const p = pathApi(ctx);
    const item = await statItem(ctx, path, null);
    if (!item) throw Object.assign(new Error("gone"), { code: "ENOENT" });
    const st = await fsp.lstat(path);
    let linkTarget: string | null = null;
    let broken = false;
    if (st.isSymbolicLink()) {
      linkTarget = await fsp.readlink(path).catch(() => null);
      broken = !(await fsp.stat(path).then(() => true, () => false));
    }
    const entries = st.isDirectory() ? (await fsp.readdir(path).catch(() => [])).length : null;
    const me = ctx.platform === "win32" ? null : (() => { try { return userInfo().uid; } catch { return null; } })();
    return {
      path,
      name: p.basename(path),
      type: item.type,
      isDir: st.isDirectory(),
      sizeBytes: st.size,
      mode: (st.mode & 0o777).toString(8).padStart(3, "0"),
      permStr: item.permStr,
      mtimeMs: st.mtimeMs,
      createdMs: st.birthtimeMs,
      uid: ctx.platform === "win32" ? null : st.uid,
      gid: ctx.platform === "win32" ? null : st.gid,
      owner: me === null ? null : st.uid === me ? "you" : `user ${st.uid}`,
      linkTarget,
      broken,
      entries,
      protected: protectedReason(path, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "modify"),
    };
  },

  async "find/sha256"(ctx, b) {
    const path = absolutePath(ctx, b.path);
    if (!(await fsp.stat(path)).isFile()) throw new FmError("NOT_A_FILE", "A fingerprint (SHA-256) can only be made for a file.");
    return { path, ...(await runWorkerJob<{ sha256: string; size: number }>(ctx, { kind: "hash", path })) };
  },

  async "find/hex"(ctx, b) {
    const path = absolutePath(ctx, b.path);
    const st = await fsp.stat(path);
    if (!st.isFile()) throw new FmError("NOT_A_FILE", "The hex view shows the contents of a file, not a folder.");
    const length = clamp(b.length, 256, 16, 4096);
    return { path, size: st.size, bytes: Math.min(length, st.size), hex: hexPreview(path, length) };
  },

  async "find/grep"(ctx, b) {
    const query = typeof b.query === "string" ? b.query.slice(0, 500) : "";
    if (!query) throw new FmError("BAD_PATTERN", "Type the text to look for inside the files.");
    const targets = await resolveTargets(ctx, b);
    const found = await runWorkerJob<{ matches: Array<{ path: string; line: number; text: string }>; filesScanned: number; filesWithHits: number; truncated: boolean }>(ctx, {
      kind: "grep", paths: targets.paths, query, regex: b.regex === true, matchCase: b.matchCase === true, maxMatches: clamp(b.maxMatches, 500, 1, 2000),
    });
    const p = pathApi(ctx);
    return { ...found, matches: found.matches.map((m) => ({ ...m, relativePath: targets.root ? p.relative(targets.root, m.path) : p.basename(m.path) })) };
  },

  async "find/dupes"(ctx, b) {
    const targets = await resolveTargets(ctx, b);
    return await runWorkerJob(ctx, { kind: "dupes", paths: targets.paths, minBytes: clamp(b.minBytes, 1, 1, Number.MAX_SAFE_INTEGER) });
  },

  async "find/largest"(ctx, b) {
    const targets = await resolveTargets(ctx, b);
    return { files: await runWorkerJob(ctx, { kind: "largest", paths: targets.paths, count: clamp(b.count, 20, 1, 100) }) };
  },

  async "find/extstats"(ctx, b) {
    const targets = await resolveTargets(ctx, b);
    return { rows: await runWorkerJob(ctx, { kind: "extstats", paths: targets.paths }) };
  },

  async "find/watch/start"(ctx, b) {
    return await startWatch(ctx, b);
  },
  async "find/watch/poll"(ctx, b) {
    return pollWatch(ctx, b);
  },
  async "find/watch/stop"(ctx, b) {
    return stopWatch(ctx, b);
  },
};
