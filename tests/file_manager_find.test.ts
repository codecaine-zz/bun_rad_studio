import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash, randomBytes } from "crypto";
import { unpackTarGz } from "../src/features/rad/modules/tarutils";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { findOperations } from "../src/features/filemanager/fmFindOps";
import { fillPlaceholders, planExec, runExec, tokenize } from "../src/features/filemanager/fmFindExec";
import { formatResults } from "../src/features/filemanager/fmFindExport";
import { commonFolder, dropNested, resolveTargets } from "../src/features/filemanager/fmFindQuery";
import { findState, runWorkerJob } from "../src/features/filemanager/fmFindRun";
import { MAX_CACHED_RESULTS, type FindItem } from "../src/features/filemanager/fmFindShared";
import { isNoise, pollWatch, startWatch, stopWatch } from "../src/features/filemanager/fmFindWatch";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import { listTrash, restoreFromTrash } from "../src/features/filemanager/fmTrash";
import { extractZip } from "../src/features/filemanager/fmZip";

const posix = process.platform !== "win32";
const posixTest = posix ? test : test.skip;
// Scratch folders live inside the project (and are removed afterwards), not in the system's temporary folder.
const base = join(import.meta.dir, "..", "scratch_find", `t${Date.now().toString(36)}${randomBytes(3).toString("hex")}`);
const home = join(base, "home");
const work = join(home, "work");
const data = join(base, "data");
let ctx: FmContext;

const op = (name: string, body: Record<string, any> = {}): Promise<any> => {
  const handler = findOperations[name];
  if (!handler) throw new Error(`no operation ${name}`);
  return handler(ctx, body) as Promise<any>;
};

async function fails(promise: Promise<unknown>, code: string, messagePart?: string) {
  try {
    await promise;
  } catch (err: any) {
    expect(err.code).toBe(code);
    if (messagePart) expect(err.message).toContain(messagePart);
    return err;
  }
  throw new Error(`expected the call to fail with ${code}`);
}

const names = (items: FindItem[]) => items.map((i) => i.relativePath).sort();

function buildTree() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "sub", "deep"), { recursive: true });
  mkdirSync(join(work, "node_modules"), { recursive: true });
  mkdirSync(join(work, "emptydir"));
  writeFileSync(join(work, "a.txt"), "hello world\nsecond line\n");
  writeFileSync(join(work, "b.txt"), "hello world\nsecond line\n");
  writeFileSync(join(work, "old.txt"), "ancient\n");
  utimesSync(join(work, "old.txt"), new Date(Date.now() - 40 * 86_400_000), new Date(Date.now() - 40 * 86_400_000));
  writeFileSync(join(work, "Caps.TXT"), "Capital Letters\n");
  writeFileSync(join(work, "empty.txt"), "");
  writeFileSync(join(work, ".hidden.txt"), "secret\n");
  writeFileSync(join(work, "node_modules", "m.js"), "module\n");
  writeFileSync(join(work, "sub", "c.md"), "# title\nHello there\n");
  writeFileSync(join(work, "sub", "deep", "d.ts"), "export const x = 1;\n");
  writeFileSync(join(work, "big.bin"), Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.alloc(2996, 7)]));
  if (posix) {
    writeFileSync(join(work, "run.sh"), "#!/bin/sh\necho hi\n");
    chmodSync(join(work, "run.sh"), 0o755);
    symlinkSync("a.txt", join(work, "link"));
  }
}

beforeAll(() => {
  mkdirSync(home, { recursive: true });
  mkdirSync(join(home, "Documents"));
  ctx = createContext({ home, dataDir: data, launch: async () => {} });
  buildTree();
});

afterAll(() => {
  for (const dispose of ctx.disposers.splice(0)) dispose();
  rmSync(base, { recursive: true, force: true });
  try {
    if (readdirSync(join(base, "..")).length === 0) rmSync(join(base, ".."), { recursive: true, force: true });
  } catch {}
});

// -------------------------------------------------------------------------------------------------------------
describe("find/meta", () => {
  test("hands the page the presets, sort keys and limits it can't import itself", async () => {
    const meta = await op("find/meta");
    expect(meta.presets.length).toBeGreaterThanOrEqual(8);
    expect(meta.presets.find((p: any) => p.label.startsWith("Recently"))).toMatchObject({ modified: "24h", type: "file" });
    expect(meta.presets.find((p: any) => p.label === "Images").exts).toContain("png");
    expect(meta.sortKeys[0]).toBe("Default order");
    expect(meta.sortKeys).toContain("Size (largest)");
    expect(meta.limits).toMatchObject({ defaultMaxResults: 1500, maxResultsCap: 20000, maxPaths: 5000, maxWatchers: 2 });
    expect(meta.exportFormats).toEqual(["json", "csv", "tsv", "md", "paths"]);
    expect(meta.posix).toBe(posix);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("find/search", () => {
  const search = (body: Record<string, any> = {}) => op("find/search", { root: work, ...body });

  test("lists everything (without hidden files and node_modules) as plain data and remembers it", async () => {
    const r = await search();
    expect(names(r.items)).toEqual(expect.arrayContaining(["Caps.TXT", "a.txt", "b.txt", "big.bin", "empty.txt", "emptydir", "old.txt", "sub", "sub/c.md", "sub/deep", "sub/deep/d.ts"]));
    expect(names(r.items)).not.toContain(".hidden.txt");
    expect(names(r.items).some((n) => n.startsWith("node_modules"))).toBe(false);
    expect(r.matchedCount).toBe(r.items.length);
    expect(r.totalScanned).toBeGreaterThanOrEqual(r.matchedCount);
    expect(typeof r.resultId).toBe("string");
    expect(r.root).toBe(work);
    const a = r.items.find((i: FindItem) => i.name === "a.txt");
    expect(a).toMatchObject({ type: "file", sizeBytes: 24, extension: "txt", isSymlink: false });
    expect(typeof a.mtimeMs).toBe("number");
    expect(JSON.stringify(a)).not.toContain("mtimeStr");
    expect(r.patternFallback).toBe(false);
  });

  test("regex, glob and fixed-string modes", async () => {
    expect(names((await search({ pattern: "^a\\.txt$" })).items)).toEqual(["a.txt"]);
    expect(names((await search({ pattern: "*.ts", mode: "glob" })).items)).toEqual(["sub/deep/d.ts"]);
    expect(names((await search({ pattern: "a.txt", mode: "fixed" })).items)).toEqual(["a.txt"]);
    // "." is a wildcard in a regex but a plain dot in fixed mode
    expect(names((await search({ pattern: "a.tx", mode: "regex" })).items)).toContain("a.txt");
    expect(names((await search({ pattern: "(", mode: "fixed" })).items)).toEqual([]);
  });

  test("a broken regular expression is searched as text and the page is told", async () => {
    const r = await search({ pattern: "a(" });
    expect(r.patternFallback).toBe(true);
    expect(r.items).toEqual([]);
  });

  test("case modes: smart, sensitive, ignore", async () => {
    expect(names((await search({ pattern: "caps" })).items)).toEqual(["Caps.TXT"]); // smart: all lower case = ignore case
    expect(names((await search({ pattern: "Caps" })).items)).toEqual(["Caps.TXT"]); // smart: capital = exact
    expect(names((await search({ pattern: "caps", caseMode: "sensitive" })).items)).toEqual([]);
    expect(names((await search({ pattern: "CAPS", caseMode: "ignore" })).items)).toEqual(["Caps.TXT"]);
    expect(names((await search({ pattern: "CAPS" })).items)).toEqual([]);
  });

  test("type filters", async () => {
    expect(names((await search({ types: ["directory"] })).items)).toEqual(["emptydir", "sub", "sub/deep"]);
    expect(names((await search({ type: "directory" })).items)).toEqual(["emptydir", "sub", "sub/deep"]);
    expect(names((await search({ types: ["empty"] })).items)).toEqual(["empty.txt", "emptydir"]);
    expect(names((await search({ type: "all" })).items).length).toBeGreaterThan(10);
    const files = (await search({ types: ["file"] })).items as FindItem[];
    expect(files.every((i) => i.type !== "directory")).toBe(true);
    expect(names(files)).toContain("a.txt");
    if (posix) {
      expect(names((await search({ types: ["symlink"] })).items)).toEqual(["link"]);
      expect(names((await search({ types: ["executable"] })).items)).toContain("run.sh");
    }
    // unknown type names are ignored
    expect((await search({ types: ["bogus"] })).items.length).toBeGreaterThan(10);
  });

  test("extensions, exclusions, depth, size and age", async () => {
    expect(names((await search({ extensions: "ts, md" })).items)).toEqual(["sub/c.md", "sub/deep/d.ts"]);
    expect(names((await search({ extensions: [".MD"] })).items)).toEqual(["sub/c.md"]);
    expect(names((await search({ exclude: "sub" })).items).some((n) => n.startsWith("sub"))).toBe(false);
    expect(names((await search({ maxDepth: 1 })).items).every((n) => !n.includes("/"))).toBe(true);
    expect(names((await search({ minDepth: 2 })).items).every((n) => n.includes("/"))).toBe(true);
    expect(names((await search({ size: "+2k" })).items)).toEqual(["big.bin"]);
    expect(names((await search({ size: "3000", types: ["file"] })).items)).toEqual(["big.bin"]); // "about this size": plus or minus 10%
    expect(names((await search({ size: "-1k", types: ["file"] })).items)).not.toContain("big.bin");
    const recent = names((await search({ modified: "30d", types: ["file"] })).items);
    expect(recent).toContain("a.txt");
    expect(recent).not.toContain("old.txt");
    expect(names((await search({ modified: "any", types: ["file"] })).items)).toContain("old.txt");
  });

  test("hidden files, .gitignore and match-full-path", async () => {
    expect(names((await search({ hidden: true })).items)).toContain(".hidden.txt");
    expect(names((await search({ noIgnore: true })).items)).toContain("node_modules/m.js");
    writeFileSync(join(work, ".gitignore"), "b.txt\n");
    try {
      expect(names((await search({})).items)).not.toContain("b.txt");
      expect(names((await search({ noIgnore: true })).items)).toContain("b.txt");
    } finally {
      rmSync(join(work, ".gitignore"));
    }
    expect(names((await search({ pattern: "^sub/deep", fullPath: true })).items)).toEqual(["sub/deep", "sub/deep/d.ts"]);
    expect(names((await search({ pattern: "^sub/deep" })).items)).toEqual([]);
  });

  posixTest("symbolic links are followed only when asked (and the depth is then limited)", async () => {
    mkdirSync(join(work, "loop"));
    symlinkSync(work, join(work, "loop", "back"));
    try {
      const plain = names((await search({ pattern: "d\\.ts" })).items);
      expect(plain).toEqual(["sub/deep/d.ts"]);
      const followed = names((await search({ pattern: "d\\.ts", followSymlinks: true, maxResults: 50 })).items);
      expect(followed.length).toBeGreaterThan(1); // reached again through loop/back/...
      expect(followed.length).toBeLessThanOrEqual(50);
    } finally {
      rmSync(join(work, "loop"), { recursive: true, force: true });
    }
  });

  test("the result limit defaults, is clamped and reports truncation", async () => {
    const few = await search({ maxResults: 3 });
    expect(few.items.length).toBe(3);
    expect(few.truncated).toBe(true);
    expect((await search({ maxResults: 0 })).truncated).toBe(false); // falls back to the default
    expect((await search({ maxResults: "banana" })).items.length).toBeGreaterThan(3);
    expect((await search({ maxResults: 99999999 })).truncated).toBe(false);
  });

  test("bad input is explained in plain words", async () => {
    await fails(search({ size: "lots" }), "BAD_SIZE", "+1M");
    await fails(search({ modified: "yesterday-ish" }), "BAD_AGE");
    await fails(search({ minDepth: 5, maxDepth: 2 }), "BAD_DEPTH");
    await fails(search({ minDepth: "x" }), "BAD_DEPTH");
    await fails(op("find/search", { root: "relative/path" }), "BAD_PATH");
    await fails(op("find/search", {}), "BAD_PATH");
    await fails(op("find/search", { root: "a\0b" }), "BAD_PATH");
    await fails(op("find/search", { root: join(work, "nope") }), "NOT_FOUND");
    await fails(op("find/search", { root: join(work, "a.txt") }), "NOT_A_FOLDER");
  });

  test("odd values are clamped instead of trusted", async () => {
    const r = await search({ pattern: "x".repeat(10_000), exclude: Array.from({ length: 500 }, (_, i) => `e${i}`), extensions: 5, maxDepth: 9999, mode: "nonsense", caseMode: "nonsense" });
    expect(r.items).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("remembered results and choosing items", () => {
  test("only the last few searches are kept, and using one keeps it fresh", async () => {
    const first = (await op("find/search", { root: work, pattern: "a" })).resultId;
    const second = (await op("find/search", { root: work, pattern: "b" })).resultId;
    for (let i = 0; i < MAX_CACHED_RESULTS - 2; i++) await op("find/search", { root: work, pattern: `c${i}` });
    await op("find/largest", { resultId: first }); // touch the oldest: now `second` is the oldest
    await op("find/search", { root: work, pattern: "newest" });
    expect(findState(ctx).results.size).toBe(MAX_CACHED_RESULTS);
    await op("find/largest", { resultId: first });
    await fails(op("find/largest", { resultId: second }), "RESULT_GONE", "Search again");
    await fails(op("find/largest", { resultId: "unknown" }), "RESULT_GONE");
  });

  test("a request must say which items, and the list can't be a different one than the page shows", async () => {
    const r = await op("find/search", { root: work, types: ["file"] });
    await fails(resolveTargets(ctx, {}), "BAD_REQUEST");
    await fails(resolveTargets(ctx, { paths: [] }), "NOTHING_TO_DO");
    await fails(resolveTargets(ctx, { paths: Array.from({ length: 5001 }, (_, i) => join(work, `f${i}`)) }), "TOO_MANY");
    await fails(resolveTargets(ctx, { paths: ["relative"] }), "BAD_PATH");
    await fails(resolveTargets(ctx, { resultId: r.resultId, filter: "zzz-no-such-file" }), "NOTHING_TO_DO");
    await fails(resolveTargets(ctx, { resultId: r.resultId, expectedCount: r.items.length + 1 }), "STALE_LIST");
    const ok = await resolveTargets(ctx, { resultId: r.resultId, expectedCount: r.items.length });
    expect(ok.paths.length).toBe(r.items.length);
    expect(ok.root).toBe(work);
  });

  test("the page's filter and sort are applied with the same helpers as Fd Studio", async () => {
    const r = await op("find/search", { root: work, types: ["file"] });
    const filtered = await resolveTargets(ctx, { resultId: r.resultId, filter: "TXT", sort: "Size (largest)" });
    expect(filtered.items.every((i) => /txt/i.test(i.name) || /txt/i.test(i.relativePath))).toBe(true);
    const sizes = filtered.items.map((i) => i.sizeBytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    const byName = await resolveTargets(ctx, { resultId: r.resultId, sort: "Name (Z→A)" });
    expect(byName.items[0]!.name.localeCompare(byName.items.at(-1)!.name, undefined, { sensitivity: "base" })).toBeGreaterThan(0);
  });

  test("hand-picked paths are checked, de-duplicated and described", async () => {
    const t = await resolveTargets(ctx, { paths: [join(work, "a.txt"), join(work, "a.txt"), join(work, "gone.txt")] }, { needItems: true });
    expect(t.paths.length).toBe(2);
    expect(t.items.map((i) => i.name)).toEqual(["a.txt"]);
    expect(t.root).toBeNull();
  });

  test("items inside a chosen folder are left out of folder actions, and the common folder is found", () => {
    expect(dropNested(["/a/b", "/a/b/c.txt", "/a/d.txt", "/a/b/x/y"], "linux")).toEqual(["/a/b", "/a/d.txt"]);
    expect(dropNested(["/a/B", "/a/b/c"], "darwin")).toEqual(["/a/B"]);
    expect(commonFolder(["/a/b/c.txt", "/a/b/d/e.txt"], "linux")).toBe("/a/b");
    expect(commonFolder(["/a/b/c.txt", "/x/y.txt"], "linux")).toBe("/");
    expect(commonFolder(["/a/b/c.txt"], "linux")).toBe("/a/b");
    expect(commonFolder(["C:\\a\\x.txt", "C:\\b\\y.txt"], "win32")).toBe("C:\\");
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("looking closer at one item", () => {
  test("find/inspect describes a file, a link and a protected folder", async () => {
    const f = await op("find/inspect", { path: join(work, "a.txt") });
    expect(f).toMatchObject({ name: "a.txt", type: "file", isDir: false, sizeBytes: 24, linkTarget: null, entries: null });
    expect(f.protected).toBeNull();
    expect(f.mtimeMs).toBeGreaterThan(0);
    if (posix) {
      expect(f.mode).toMatch(/^[0-7]{3}$/);
      expect(f.owner).toBe("you");
      const l = await op("find/inspect", { path: join(work, "link") });
      expect(l).toMatchObject({ type: "symlink", linkTarget: "a.txt", broken: false });
      const d = await op("find/inspect", { path: join(work, "sub") });
      expect(d).toMatchObject({ isDir: true, entries: 2 });
      expect((await op("find/inspect", { path: join(home, "Documents") })).protected).toContain("personal folders");
    }
    await fails(op("find/inspect", { path: join(work, "nope") }), "ENOENT");
    await fails(op("find/inspect", { path: "rel" }), "BAD_PATH");
  });

  test("find/sha256 matches the real fingerprint", async () => {
    const r = await op("find/sha256", { path: join(work, "a.txt") });
    expect(r.sha256).toBe(createHash("sha256").update("hello world\nsecond line\n").digest("hex"));
    expect(r.size).toBe(24);
    expect((await op("find/sha256", { path: join(work, "empty.txt") })).sha256).toBe(createHash("sha256").update("").digest("hex"));
    await fails(op("find/sha256", { path: join(work, "sub") }), "NOT_A_FILE");
    await fails(op("find/sha256", { path: join(work, "nope") }), "ENOENT");
  });

  test("find/hex shows the first bytes, never more than asked or allowed", async () => {
    const r = await op("find/hex", { path: join(work, "big.bin"), length: 32 });
    expect(r.bytes).toBe(32);
    expect(r.size).toBe(3000);
    const lines = r.hex.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toStartWith("000000  00 01 02 03 07");
    expect((await op("find/hex", { path: join(work, "big.bin"), length: 99999 })).bytes).toBe(3000);
    expect((await op("find/hex", { path: join(work, "a.txt") })).bytes).toBe(24);
    expect((await op("find/hex", { path: join(work, "a.txt"), length: 1 })).bytes).toBe(16); // at least 16
    await fails(op("find/hex", { path: join(work, "sub") }), "NOT_A_FILE");
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("searching inside files, duplicates, largest files, usage by type", () => {
  let id: string;
  beforeAll(async () => {
    id = (await op("find/search", { root: work, types: ["file"] })).resultId;
  });

  test("find/grep: plain text, case, regex, caps", async () => {
    const r = await op("find/grep", { resultId: id, query: "hello" });
    expect(r.matches.map((m: any) => `${m.relativePath}:${m.line}`).sort()).toEqual(["a.txt:1", "b.txt:1", "sub/c.md:2"]);
    expect(r.filesWithHits).toBe(3);
    expect(r.filesScanned).toBeGreaterThanOrEqual(5);
    expect(r.truncated).toBe(false);
    expect((await op("find/grep", { resultId: id, query: "hello", matchCase: true })).matches.map((m: any) => m.relativePath)).toEqual(["a.txt", "b.txt"]);
    expect((await op("find/grep", { resultId: id, query: "^sec.nd", regex: true })).matches.length).toBe(2);
    expect((await op("find/grep", { resultId: id, query: "^sec.nd" })).matches.length).toBe(0); // not a regex: dots are dots
    expect((await op("find/grep", { resultId: id, query: "line", maxMatches: 1 })).truncated).toBe(true);
    expect((await op("find/grep", { paths: [join(work, "a.txt")], query: "world" })).matches[0].relativePath).toBe("a.txt");
  });

  test("find/grep: bad input", async () => {
    await fails(op("find/grep", { resultId: id, query: "" }), "BAD_PATTERN");
    await fails(op("find/grep", { resultId: id, query: "(", regex: true }), "BAD_PATTERN", "isn't a valid pattern");
    await fails(op("find/grep", { query: "x" }), "BAD_REQUEST");
  });

  test("find/dupes groups identical files and counts the space they waste", async () => {
    const r = await op("find/dupes", { resultId: id });
    expect(r.totalGroups).toBe(1);
    expect(r.groups[0].paths.map((p: string) => p.slice(work.length + 1)).sort()).toEqual(["a.txt", "b.txt"]);
    expect(r.groups[0].sizeBytes).toBe(24);
    expect(r.wastedBytes).toBe(24);
    expect(r.skippedTooBig).toBe(0);
    expect((await op("find/dupes", { resultId: id, minBytes: 1000 })).totalGroups).toBe(0);
  });

  test("find/largest and find/extstats", async () => {
    const big = (await op("find/largest", { resultId: id, count: 2 })).files;
    expect(big.length).toBe(2);
    expect(big[0].path).toBe(join(work, "big.bin"));
    expect(big[0].sizeBytes).toBe(3000);
    expect((await op("find/largest", { resultId: id, count: 9999 })).files.length).toBeLessThanOrEqual(100);
    const rows = (await op("find/extstats", { resultId: id })).rows;
    expect(rows[0]).toMatchObject({ ext: ".bin", count: 1, sizeBytes: 3000 });
    expect(rows.find((r: any) => r.ext === ".txt").count).toBeGreaterThanOrEqual(3);
  });

  posixTest("links are never counted as a second copy of the file they point to", async () => {
    const withLink = [join(work, "a.txt"), join(work, "b.txt"), join(work, "link")];
    const d = await op("find/dupes", { paths: withLink });
    expect(d.groups[0].paths.map((p: string) => p.slice(work.length + 1)).sort()).toEqual(["a.txt", "b.txt"]);
    expect((await op("find/grep", { paths: [join(work, "a.txt"), join(work, "link")], query: "world" })).matches.length).toBe(1);
    expect((await op("find/largest", { paths: [join(work, "link")] })).files).toEqual([]);
    expect((await op("find/extstats", { paths: [join(work, "link")] })).rows).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("the worker keeps the server free and ends stuck jobs", () => {
  test("a job that never ends is stopped at the time limit with a plain message", async () => {
    const started = Date.now();
    const err = await fails(runWorkerJob(ctx, { kind: "spin", ms: 20_000 }, 200), "TIMEOUT", "took longer than");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(err.message).toContain("smaller folder");
    expect(findState(ctx).workers.size).toBe(0);
  });

  test("the server's time limit applies to searches too, and a later search still works", async () => {
    const state = findState(ctx);
    state.timeoutMs = 1;
    try {
      await fails(op("find/search", { root: work }), "TIMEOUT");
    } finally {
      state.timeoutMs = 60_000;
    }
    expect(state.workers.size).toBe(0);
    expect((await op("find/search", { root: work, pattern: "a.txt" })).matchedCount).toBe(1);
  });

  test("the main thread keeps running while a worker is busy", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    await runWorkerJob(ctx, { kind: "spin", ms: 400 });
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(15);
  });

  test("only a few jobs run at once", async () => {
    const running = [1, 2, 3].map(() => runWorkerJob(ctx, { kind: "spin", ms: 500 }));
    await fails(runWorkerJob(ctx, { kind: "spin", ms: 10 }), "BUSY");
    await Promise.all(running);
    expect(findState(ctx).workers.size).toBe(0);
    await runWorkerJob(ctx, { kind: "spin", ms: 5 });
  });

  test("errors inside the worker arrive as readable errors", async () => {
    await fails(runWorkerJob(ctx, { kind: "hash", path: join(work, "nope") }), "ENOENT", "doesn't exist");
    await fails(runWorkerJob(ctx, { kind: "grep", paths: [], query: "(", regex: true, matchCase: false, maxMatches: 5 }), "BAD_PATTERN");
  });

  test("stopping the server's context ends running workers", async () => {
    const other = createContext({ home, dataDir: join(data, "other") });
    const pending = runWorkerJob(other, { kind: "spin", ms: 5000 }, 20_000);
    const outcome = pending.then(() => null, (err) => err);
    await Bun.sleep(100);
    expect(findState(other).workers.size).toBe(1);
    for (const dispose of other.disposers.splice(0)) dispose();
    expect(findState(other).workers.size).toBe(0);
    expect((await outcome).code).toBe("CANCELLED");
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("copy, move, Recycle Bin and delete", () => {
  const dest = join(home, "dest");
  const fresh = async () => {
    buildTree();
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest);
    return (await op("find/search", { root: work, types: ["file"], pattern: "\\.(txt|md)$" })).resultId as string;
  };

  test("find/copy copies the matches, and never overwrites what is already there", async () => {
    const id = await fresh();
    writeFileSync(join(dest, "a.txt"), "keep me");
    const r = await op("find/copy", { resultId: id, dest });
    expect(r.failed).toBe(0);
    expect(r.done).toBeGreaterThanOrEqual(5);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("keep me");
    expect(readFileSync(join(dest, "a (2).txt"), "utf8")).toBe("hello world\nsecond line\n");
    expect(existsSync(join(work, "a.txt"))).toBe(true);
    expect(r.pairs.length).toBe(r.done);
    const skip = await op("find/copy", { resultId: id, dest, policy: "skip" });
    expect(skip.done).toBe(0);
    expect(skip.skipped).toBeGreaterThanOrEqual(5);
  });

  test("find/move moves them (links and folders inside a chosen folder aren't moved twice)", async () => {
    const id = await fresh();
    const r = await op("find/move", { resultId: id, dest });
    expect(r.failed).toBe(0);
    expect(existsSync(join(work, "a.txt"))).toBe(false);
    expect(existsSync(join(dest, "a.txt"))).toBe(true);
    expect(r.pairs[0]).toHaveProperty("from");
    const folders = await op("find/move", { paths: [join(work, "sub"), join(work, "sub", "deep", "d.ts")], dest });
    expect(folders.failed).toBe(0);
    expect(folders.done).toBe(1); // the folder; its content went with it
    expect(existsSync(join(dest, "sub", "deep", "d.ts"))).toBe(true);
  });

  test("a folder can't be moved or copied into itself", async () => {
    await fresh();
    const r = await op("find/move", { paths: [join(work, "sub")], dest: join(work, "sub", "deep") });
    expect(r.failed).toBe(1);
    expect(r.errors[0].message).toContain("inside itself");
    expect(existsSync(join(work, "sub", "c.md"))).toBe(true);
  });

  test("find/move and find/copy check the destination", async () => {
    const id = await fresh();
    await fails(op("find/move", { resultId: id, dest: join(work, "nope") }), "NOT_FOUND");
    await fails(op("find/copy", { resultId: id, dest: join(work, "a.txt") }), "NOT_A_FOLDER");
    await fails(op("find/copy", { resultId: id, dest: "relative" }), "BAD_PATH");
    await fails(op("find/copy", { resultId: id }), "BAD_PATH");
  });

  posixTest("protected places can't be a destination or be moved", async () => {
    const id = await fresh();
    await fails(op("find/move", { resultId: id, dest: "/usr/bin" }), "PROTECTED");
    await fails(op("find/copy", { resultId: id, dest: "/etc" }), "PROTECTED");
    const r = await op("find/move", { paths: [join(home, "Documents"), "/usr"], dest });
    expect(r.failed).toBe(2);
    expect(r.errors.map((e: any) => e.message).join(" ")).toContain("can't be moved");
    expect(existsSync(join(home, "Documents"))).toBe(true);
    const homeItself = await op("find/move", { paths: [home], dest });
    expect(homeItself.errors[0].message).toContain("home folder");
  });

  test("find/trash sends the matches to the Recycle Bin, where they can be found again", async () => {
    const id = await fresh();
    const before = (await listTrash(ctx)).count;
    const r = await op("find/trash", { resultId: id });
    expect(r.failed).toBe(0);
    expect(r.trashed.length).toBe(r.done);
    expect(existsSync(join(work, "a.txt"))).toBe(false);
    expect((await listTrash(ctx)).count).toBe(before + r.done);
    expect(r.trashed[0].id).toMatch(/^[0-9a-f]+$/);
    // the ids are what the page's Undo hands to the Recycle Bin to bring the items back
    const back = await restoreFromTrash(ctx, r.trashed.map((t: any) => t.id));
    expect(back.every((x) => x.ok)).toBe(true);
    expect(existsSync(join(work, "a.txt"))).toBe(true);
    expect((await listTrash(ctx)).count).toBe(before);
  });

  posixTest("find/trash refuses protected items one by one", async () => {
    await fresh();
    const r = await op("find/trash", { paths: [join(home, "Documents"), join(work, "a.txt")] });
    expect(r.failed).toBe(1);
    expect(r.done).toBe(1);
    expect(existsSync(join(home, "Documents"))).toBe(true);
  });

  test("find/delete needs confirm: true, and is checked before anything happens", async () => {
    const id = await fresh();
    await fails(op("find/delete", { resultId: id }), "NEEDS_CONFIRM");
    await fails(op("find/delete", { resultId: id, confirm: "yes" }), "NEEDS_CONFIRM");
    expect(existsSync(join(work, "a.txt"))).toBe(true);
    await fails(op("find/delete", { resultId: id, confirm: true, expectedCount: 1 }), "STALE_LIST");
    expect(existsSync(join(work, "a.txt"))).toBe(true);
    const r = await op("find/delete", { resultId: id, confirm: true });
    expect(r.failed).toBe(0);
    expect(existsSync(join(work, "a.txt"))).toBe(false);
    expect(existsSync(join(work, "sub", "c.md"))).toBe(false);
    expect(existsSync(join(work, "big.bin"))).toBe(true);
  });

  posixTest("find/delete refuses system folders, the home folder and the Recycle Bin", async () => {
    await fresh();
    const r = await op("find/delete", { paths: [home, join(home, "Documents"), "/usr", ctx.trashRoot], confirm: true });
    expect(r.failed).toBe(3); // the Documents folder is inside the home folder, which is refused as a whole
    expect(r.done).toBe(0);
    expect(existsSync(join(home, "Documents"))).toBe(true);
    expect((await op("find/delete", { paths: [join(home, "Documents")], confirm: true })).failed).toBe(1);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("archives", () => {
  const dest = join(home, "archives");
  beforeAll(() => {
    buildTree();
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest);
  });

  test("zip: a new file with the matches inside, laid out like the search folder", async () => {
    const id = (await op("find/search", { root: work, pattern: "\\.(txt|md|ts)$", types: ["file"] })).resultId;
    const r = await op("find/archive", { resultId: id, format: "zip", dest, name: "mine" });
    expect(r).toMatchObject({ format: "zip", folders: 2, skipped: 0 }); // the folders "sub" and "sub/deep" are entries too
    expect(r.archivePath).toBe(join(dest, "mine.zip"));
    expect(r.files).toBeGreaterThanOrEqual(5);
    expect(r.size).toBeGreaterThan(100);
    const out = await extractZip(ctx, r.archivePath, join(base));
    expect(readFileSync(join(out.folder, "mine", "a.txt"), "utf8")).toBe("hello world\nsecond line\n");
    expect(readFileSync(join(out.folder, "mine", "sub", "deep", "d.ts"), "utf8")).toBe("export const x = 1;\n");
    rmSync(out.folder, { recursive: true, force: true });
    // nothing was left behind in the private staging folder
    expect(existsSync(join(data, "find_stage")) ? readdirSync(join(data, "find_stage")).length : 0).toBe(0);
  });

  test("tar.gz: a new file whose entries are the matches", async () => {
    const id = (await op("find/search", { root: work, pattern: "\\.(txt|md|ts)$", types: ["file"] })).resultId;
    const r = await op("find/archive", { resultId: id, format: "tar.gz", dest, name: "mine" });
    expect(r.archivePath).toBe(join(dest, "mine.tar.gz"));
    expect(r.format).toBe("tar.gz");
    const entries = unpackTarGz(new Uint8Array(readFileSync(r.archivePath)));
    const byName = new Map(entries.map((e) => [e.name, e]));
    expect(byName.get("a.txt")!.text).toBe("hello world\nsecond line\n");
    expect(byName.get("sub/c.md")!.text).toBe("# title\nHello there\n");
    expect(byName.get("sub/deep/d.ts")!.size).toBe(20);
    expect(r.files).toBe(entries.filter((e) => e.type === "file").length);
  });

  test("archives never overwrite: a taken name gets (2)", async () => {
    const paths = [join(work, "a.txt")];
    const a = await op("find/archive", { paths, format: "tar.gz", dest, name: "mine" });
    expect(a.archivePath).toBe(join(dest, "mine (2).tar.gz"));
    const b = await op("find/archive", { paths, format: "zip", dest, name: "mine" });
    expect(b.archivePath).toBe(join(dest, "mine (2).zip"));
    expect(unpackTarGz(new Uint8Array(readFileSync(join(dest, "mine.tar.gz")))).length).toBeGreaterThan(1); // the first one is untouched
  });

  test("folders are archived with their content, links are left out and counted", async () => {
    const tarred = await op("find/archive", { paths: [join(work, "sub")], format: "tar.gz", dest, name: "folder" });
    const names = unpackTarGz(new Uint8Array(readFileSync(tarred.archivePath))).map((e) => e.name).sort();
    expect(names).toEqual(["sub/", "sub/c.md", "sub/deep/", "sub/deep/d.ts"]);
    expect(tarred.folders).toBe(2);
    if (posix) {
      const withLink = await op("find/archive", { paths: [join(work, "link"), join(work, "a.txt")], format: "tar.gz", dest, name: "linked" });
      expect(withLink.skipped).toBe(1);
      expect(withLink.files).toBe(1);
      await fails(op("find/archive", { paths: [join(work, "link")], format: "tar.gz", dest, name: "onlylink" }), "NOTHING_TO_DO");
      const zipped = await op("find/archive", { paths: [join(work, "link"), join(work, "sub")], format: "zip", dest, name: "zl" });
      expect(zipped.skipped).toBe(1);
    }
    const zipped = await op("find/archive", { paths: [join(work, "sub"), join(work, "sub", "c.md")], format: "zip", dest, name: "z2" });
    expect(zipped.files).toBe(2);
  });

  test("items from different folders can be archived together", async () => {
    const r = await op("find/archive", { paths: [join(work, "a.txt"), join(work, "sub", "c.md")], format: "tar.gz", dest, name: "mixed" });
    expect(unpackTarGz(new Uint8Array(readFileSync(r.archivePath))).map((e) => e.name).sort()).toEqual(["a.txt", "sub/c.md"]);
  });

  test("bad input", async () => {
    const paths = [join(work, "a.txt")];
    await fails(op("find/archive", { paths, format: "rar", dest }), "BAD_FORMAT");
    await fails(op("find/archive", { paths, format: "zip" }), "BAD_PATH");
    await fails(op("find/archive", { paths, format: "zip", dest: join(dest, "nope") }), "NOT_FOUND");
    await fails(op("find/archive", { paths, format: "zip", dest, name: "a/b" }), "BAD_NAME");
    await fails(op("find/archive", { paths: [join(work, "gone.txt")], format: "zip", dest }), "NOTHING_TO_DO");
    if (posix) await fails(op("find/archive", { paths, format: "tar.gz", dest: "/usr/bin" }), "PROTECTED");
  });

  test("the default name says what it is", async () => {
    const r = await op("find/archive", { paths: [join(work, "a.txt")], format: "tar.gz", dest });
    expect(r.archivePath).toMatch(/fd_archive_\d{8}_\d{4}\.tar\.gz$/);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("exporting the results", () => {
  const dest = join(home, "exports");
  let items: FindItem[];
  let id: string;
  beforeAll(async () => {
    buildTree();
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest);
    if (posix) writeFileSync(join(work, '=evil, "name".txt'), "x");
    const r = await op("find/search", { root: work, types: ["file"], pattern: "txt$" });
    items = r.items;
    id = r.resultId;
  });

  test("formats", () => {
    const one = items.filter((i) => i.name === "a.txt");
    expect(JSON.parse(formatResults(one, "json"))[0]).toMatchObject({ name: "a.txt", sizeBytes: 24, relativePath: "a.txt", path: join(work, "a.txt") });
    const csv = formatResults(items, "csv").split("\n");
    expect(csv[0]).toBe("Name,Type,SizeBytes,HumanSize,RelativePath,FullPath,Modified,Permissions");
    expect(csv.find((l) => l.startsWith("a.txt,"))).toContain(",24,");
    if (posix) expect(formatResults(items, "csv")).toContain(`"'=evil, ""name"".txt"`); // quoted, and not a spreadsheet formula
    expect(formatResults(one, "tsv").split("\n")[0]).toBe("Name\tType\tSize\tPath\tModified\tPerms");
    expect(formatResults(one, "md")).toStartWith("| Name | Type | Size |");
    expect(formatResults(one, "paths")).toBe(`${join(work, "a.txt")}\n`);
    expect(formatResults([{ ...one[0]!, name: "we|ird\nname" }], "md").split("\n").length).toBe(4); // header, rule, one row, end
  });

  test("returns the text when no folder is given (for the clipboard)", async () => {
    const r = await op("find/export", { resultId: id, format: "paths", filter: "a.txt" });
    expect(r.count).toBe(1);
    expect(r.text).toBe(`${join(work, "a.txt")}\n`);
    const picked = await op("find/export", { paths: [join(work, "a.txt"), join(work, "b.txt")], format: "tsv" });
    expect(picked.count).toBe(2);
  });

  test("saves a NEW file in the chosen folder and never overwrites", async () => {
    const a = await op("find/export", { resultId: id, format: "json", dest });
    expect(a.saved.name).toMatch(/^fd_results_\d{8}_\d{4}\.json$/);
    expect(JSON.parse(readFileSync(a.saved.path, "utf8")).length).toBe(a.count);
    const b = await op("find/export", { resultId: id, format: "json", dest });
    expect(b.saved.path).not.toBe(a.saved.path);
    expect(b.saved.name).toContain("(2)");
    const c = await op("find/export", { resultId: id, format: "md", dest, name: "report" });
    expect(c.saved.name).toBe("report.md");
    writeFileSync(join(dest, "report.md"), "precious");
    const d = await op("find/export", { resultId: id, format: "md", dest, name: "report.md" });
    expect(d.saved.name).toBe("report (2).md");
    expect(readFileSync(join(dest, "report.md"), "utf8")).toBe("precious");
    expect((await op("find/export", { resultId: id, format: "csv", dest })).saved.name).toEndWith(".csv");
    expect((await op("find/export", { resultId: id, format: "paths", dest })).saved.name).toEndWith(".txt");
    expect((await op("find/export", { resultId: id, format: "tsv", dest })).saved.name).toEndWith(".tsv");
  });

  test("bad input", async () => {
    await fails(op("find/export", { resultId: id, format: "xml", dest }), "BAD_FORMAT");
    await fails(op("find/export", { resultId: id, dest }), "BAD_FORMAT");
    await fails(op("find/export", { resultId: id, format: "json", dest: join(dest, "nope") }), "NOT_FOUND");
    await fails(op("find/export", { resultId: id, format: "json", dest: join(work, "a.txt") }), "NOT_A_FOLDER");
    await fails(op("find/export", { resultId: id, format: "json", dest, name: "a/b" }), "BAD_NAME");
    await fails(op("find/export", { paths: [join(work, "gone")], format: "json" }), "NOTHING_TO_DO");
    if (posix) await fails(op("find/export", { resultId: id, format: "json", dest: "/usr/bin" }), "PROTECTED");
  });

  test("a huge result is not forced through the clipboard (saving it to a folder still works)", async () => {
    const many = join(work, "many");
    mkdirSync(many);
    for (let i = 0; i < 1100; i++) writeFileSync(join(many, `${"n".repeat(80)}${i}.dat`), "");
    const r = await op("find/search", { root: many });
    expect(r.items.length).toBe(1100);
    await fails(op("find/export", { resultId: r.resultId, format: "paths" }), "TOO_BIG", "Save it to a folder");
    const saved = await op("find/export", { resultId: r.resultId, format: "paths", dest });
    expect(readFileSync(saved.saved.path, "utf8").split("\n").length).toBe(1101);
    rmSync(many, { recursive: true, force: true });
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("running a command (no shell)", () => {
  const bun = process.execPath;
  const show = `${JSON.stringify(bun)} -e "console.log(JSON.stringify(process.argv.slice(1)))"`;
  // (a pair of braces in a command is a placeholder, so the script avoids "{}")
  const sleepy = `${JSON.stringify(bun)} -e "setTimeout(function () { }, 20000)"`;

  test("the command is split into words the way people type them", () => {
    expect(tokenize("wc -l {}", "linux")).toEqual(["wc", "-l", "{}"]);
    expect(tokenize(`echo "two words" 'single ""quoted""' plain\\ space`, "linux")).toEqual(["echo", "two words", 'single ""quoted""', "plain space"]);
    expect(tokenize(`say "a \\"quote\\" and \\\\"`, "linux")).toEqual(["say", 'a "quote" and \\']);
    expect(tokenize('prog "" x', "linux")).toEqual(["prog", "", "x"]);
    expect(tokenize("  spaced   out  ", "linux")).toEqual(["spaced", "out"]);
    expect(tokenize('C:\\Tools\\x.exe "C:\\My Files\\a.txt"', "win32")).toEqual(["C:\\Tools\\x.exe", "C:\\My Files\\a.txt"]);
    expect(tokenize("a;b | c && d $(e)", "linux")).toEqual(["a;b", "|", "c", "&&", "d", "$(e)"]); // no meaning: just words
    expect(() => tokenize('say "unclosed', "linux")).toThrow("isn't closed");
    expect(() => tokenize("say 'unclosed", "linux")).toThrow("isn't closed");
  });

  test("placeholders", () => {
    expect(fillPlaceholders("{}", "/a/b/photo.final.jpg", "linux")).toBe("/a/b/photo.final.jpg");
    expect(fillPlaceholders("{/}", "/a/b/photo.final.jpg", "linux")).toBe("photo.final.jpg");
    expect(fillPlaceholders("{//}", "/a/b/photo.final.jpg", "linux")).toBe("/a/b");
    expect(fillPlaceholders("{.}", "/a/b/photo.final.jpg", "linux")).toBe("/a/b/photo.final");
    expect(fillPlaceholders("{/.}", "/a/b/photo.final.jpg", "linux")).toBe("photo.final");
    expect(fillPlaceholders("x-{/.}.png", "/a/README", "linux")).toBe("x-README.png");
    expect(fillPlaceholders("{}", "C:\\a\\b.txt", "win32")).toBe("C:\\a\\b.txt");
    expect(fillPlaceholders("{/}", "C:\\a\\b.txt", "win32")).toBe("b.txt");
  });

  test("planning: -x runs once per item, -X once with every item; {} is added when missing", () => {
    const paths = ["/p/a.txt", "/p/b c.txt"];
    expect(planExec("wc -l {}", paths, "each", "linux").runs).toEqual([{ path: "/p/a.txt", args: ["-l", "/p/a.txt"] }, { path: "/p/b c.txt", args: ["-l", "/p/b c.txt"] }]);
    expect(planExec("wc -l {}", paths, "batch", "linux")).toEqual({ program: "wc", runs: [{ path: null, args: ["-l", "/p/a.txt", "/p/b c.txt"] }] });
    expect(planExec("ls", paths, "batch", "linux").runs[0]!.args).toEqual(["/p/a.txt", "/p/b c.txt"]);
    expect(planExec("cp {} /backup/{/}.bak", paths, "batch", "linux").runs[0]!.args).toEqual(["/p/a.txt", "/p/b c.txt", "/backup/a.txt.bak", "/backup/b c.txt.bak"]);
  });

  test("planning: bad commands", () => {
    expect(() => planExec("", ["/a"], "each", "linux")).toThrow("Type a command");
    expect(() => planExec("   ", ["/a"], "each", "linux")).toThrow("Type a command");
    expect(() => planExec(undefined, ["/a"], "each", "linux")).toThrow("Type a command");
    expect(() => planExec("{} -v", ["/a"], "each", "linux")).toThrow("program name");
    expect(() => planExec("x".repeat(2001), ["/a"], "each", "linux")).toThrow("too long");
    expect(() => planExec("a\0b", ["/a"], "each", "linux")).toThrow("isn't valid");
    expect(() => planExec(Array.from({ length: 101 }, () => "x").join(" "), ["/a"], "each", "linux")).toThrow("too many parts");
    expect(() => planExec("echo {}", Array.from({ length: 201 }, (_, i) => `/a${i}`), "each", "linux")).toThrow("201 times");
    expect(() => planExec("echo {}", Array.from({ length: 5000 }, (_, i) => `/${"d".repeat(50)}${i}`), "batch", "linux")).toThrow("too many items");
  });

  test("find/exec needs confirm: true", async () => {
    const id = (await op("find/search", { root: work, pattern: "^a\\.txt$" })).resultId;
    await fails(op("find/exec", { resultId: id, template: show }), "NEEDS_CONFIRM");
    await fails(op("find/exec", { resultId: id, template: show, confirm: 1 }), "NEEDS_CONFIRM");
  });

  test("find/exec runs the program with the file as an argument", async () => {
    const id = (await op("find/search", { root: work, pattern: "^(a|b)\\.txt$" })).resultId;
    const each = await op("find/exec", { resultId: id, template: `${show} {/}`, mode: "each", confirm: true });
    expect(each.runs.length).toBe(2);
    expect(each.runs.map((r: any) => JSON.parse(r.stdout))).toEqual([["a.txt"], ["b.txt"]]);
    expect(each.runs[0].exitCode).toBe(0);
    expect(each.runs[0].path).toBe(join(work, "a.txt"));
    const batch = await op("find/exec", { resultId: id, template: `${show} {}`, confirm: true });
    expect(batch.runs.length).toBe(1);
    expect(JSON.parse(batch.runs[0].stdout)).toEqual([join(work, "a.txt"), join(work, "b.txt")]);
    const picked = await op("find/exec", { paths: [join(work, "a.txt")], template: show, confirm: true, mode: "each" });
    expect(JSON.parse(picked.runs[0].stdout)).toEqual([join(work, "a.txt")]); // {} was added
  });

  posixTest("nothing in a file name is treated as shell syntax", async () => {
    const nasty = join(work, "x; touch pwned `touch pwned2` $(touch pwned3) 'q' \"d\".txt");
    writeFileSync(nasty, "x");
    const r = await op("find/exec", { paths: [nasty], template: show, confirm: true, mode: "each" });
    expect(JSON.parse(r.runs[0].stdout)).toEqual([nasty]);
    for (const n of ["pwned", "pwned2", "pwned3"]) expect(existsSync(join(work, n))).toBe(false);
    expect(existsSync(join(process.cwd(), "pwned"))).toBe(false);
    // and the command text itself is not run by a shell either
    const sh = await op("find/exec", { paths: [join(work, "a.txt")], template: `${show} ; touch ${JSON.stringify(join(work, "pwned"))}`, confirm: true, mode: "each" });
    expect(existsSync(join(work, "pwned"))).toBe(false);
    expect(JSON.parse(sh.runs[0].stdout)).toContain(";");
    rmSync(nasty);
  });

  test("a program that isn't there, and a command that fails, are explained", async () => {
    const missing = await op("find/exec", { paths: [join(work, "a.txt")], template: "definitely-not-a-program-xyz {}", confirm: true, mode: "each" });
    expect(missing.runs[0].exitCode).toBeNull();
    expect(missing.runs[0].error).toContain("wasn't found");
    const failing = await op("find/exec", { paths: [join(work, "a.txt")], template: `${JSON.stringify(bun)} -e "process.exit(3)"`, confirm: true, mode: "each" });
    expect(failing.runs[0].exitCode).toBe(3);
  });

  test("find/exec checks its input", async () => {
    const paths = [join(work, "a.txt")];
    await fails(op("find/exec", { paths, template: "", confirm: true }), "BAD_COMMAND");
    await fails(op("find/exec", { paths, template: 'say "x', confirm: true }), "BAD_COMMAND");
    await fails(op("find/exec", { paths, template: "echo {}", confirm: true, cwd: join(work, "nope") }), "NOT_FOUND");
    await fails(op("find/exec", { template: "echo {}", confirm: true }), "BAD_REQUEST");
  });

  test("a run that takes too long is stopped, and so is too much output", async () => {
    const plan = planExec(sleepy, [join(work, "a.txt")], "each", process.platform);
    const started = Date.now();
    const slow = await runExec(ctx, plan, work, { timeoutMs: 400 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(slow.runs[0]!.timedOut).toBe(true);
    expect(slow.timedOut).toBe(true);
    expect(slow.runs[0]!.error).toContain("too long");
    expect(findState(ctx).children.size).toBe(0);

    const loud = planExec(`${JSON.stringify(bun)} -e "console.log('x'.repeat(300000))"`, [join(work, "a.txt")], "each", process.platform);
    const out = await runExec(ctx, loud, work);
    expect(out.truncated).toBe(true);
    expect(out.runs[0]!.stdout.length).toBeLessThanOrEqual(64 * 1024);
    expect(out.runs[0]!.exitCode).toBe(0);

    const many = planExec(`${JSON.stringify(bun)} -e "console.log('y'.repeat(40000))"`, [join(work, "a.txt"), join(work, "b.txt"), join(work, "old.txt")], "each", process.platform);
    const shared = await runExec(ctx, many, work);
    expect(shared.runs.reduce((n, r) => n + r.stdout.length + r.stderr.length, 0)).toBeLessThanOrEqual(64 * 1024);

    const late = planExec(sleepy, [join(work, "a.txt"), join(work, "b.txt")], "each", process.platform);
    const budget = await runExec(ctx, late, work, { timeoutMs: 300 });
    expect(budget.runs.length).toBe(1);
    expect(budget.notRun).toBe(1);
  });

  test("running programs are ended when the server stops", async () => {
    const other = createContext({ home, dataDir: join(data, "exec") });
    const plan = planExec(sleepy, [join(work, "a.txt")], "each", process.platform);
    const running = runExec(other, plan, work, { timeoutMs: 30_000 });
    await Bun.sleep(300);
    expect(findState(other).children.size).toBe(1);
    for (const dispose of other.disposers.splice(0)) dispose();
    const done = await running;
    expect(done.runs[0]!.exitCode).not.toBe(0);
    expect(findState(other).children.size).toBe(0);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("permissions", () => {
  posixTest("find/chmod changes the permissions and reports what they were", async () => {
    buildTree();
    const a = join(work, "a.txt");
    chmodSync(a, 0o644);
    const r = await op("find/chmod", { paths: [a], mode: "600" });
    expect(r.changed).toEqual([{ path: a, before: "644", after: "600" }]);
    expect(statSync(a).mode & 0o777).toBe(0o600);
    expect((await op("find/chmod", { paths: [a], mode: "rwxr-xr-x" })).changed[0].after).toBe("755");
    expect(statSync(a).mode & 0o777).toBe(0o755);
    // the way Undo puts old permissions back
    const back = await op("find/chmod", { modes: [{ path: a, mode: "644" }] });
    expect(back.done).toBe(1);
    expect(statSync(a).mode & 0o777).toBe(0o644);
    // only the nine ordinary bits are ever set
    await op("find/chmod", { paths: [a], mode: "4777" });
    expect(statSync(a).mode & 0o7777).toBe(0o777);
  });

  posixTest("find/chmod skips links, protected places and bad modes", async () => {
    buildTree();
    const l = await op("find/chmod", { paths: [join(work, "link")], mode: "600" });
    expect(l.failed).toBe(1);
    expect(l.errors[0].message).toContain("link");
    const p = await op("find/chmod", { paths: [home, join(home, "Documents")], mode: "700" });
    expect(p.failed).toBe(2);
    await fails(op("find/chmod", { paths: [join(work, "a.txt")], mode: "999" }), "BAD_MODE");
    await fails(op("find/chmod", { paths: [join(work, "a.txt")], mode: "" }), "BAD_MODE");
    await fails(op("find/chmod", { paths: [join(work, "a.txt")] }), "BAD_MODE");
    await fails(op("find/chmod", { modes: [] }), "BAD_REQUEST");
    await fails(op("find/chmod", { modes: [{ path: join(work, "a.txt"), mode: "zzz" }] }), "BAD_MODE");
    const gone = await op("find/chmod", { paths: [join(work, "gone.txt")], mode: "644" });
    expect(gone.failed).toBe(1);
  });

  test("is not offered on Windows", async () => {
    const win = createContext({ platform: "win32", home: "C:\\Users\\me", dataDir: join(data, "win") });
    await fails(findOperations["find/chmod"]!(win, { paths: ["C:\\a.txt"], mode: "644" }) as Promise<unknown>, "UNSUPPORTED");
    expect(((await findOperations["find/meta"]!(win, {})) as any).posix).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("batch rename", () => {
  const files = ["one 1.txt", "two 2.txt", "Three.TXT"];
  const make = () => {
    buildTree();
    const dir = join(work, "rn");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    for (const f of files) writeFileSync(join(dir, f), f);
    return dir;
  };
  const paths = (dir: string, list = files) => list.map((f) => join(dir, f));

  test("previews without touching anything", async () => {
    const dir = make();
    const r = await op("find/renameplan", { paths: paths(dir), rules: { find: " ", replace: "_" } });
    expect(r.applied).toBe(false);
    expect(r.rows.map((x: any) => x.newName)).toEqual(["one_1.txt", "two_2.txt"]);
    expect(r.changed).toBe(2);
    expect(r.total).toBe(3);
    expect(r.conflicts).toBe(0);
    expect(readdirSync(dir).sort()).toEqual([...files].sort());
  });

  test("find/replace (plain and regex), case, prefix, suffix, numbering, spaces to underscores", async () => {
    const dir = make();
    const plan = async (rules: Record<string, any>) => (await op("find/renameplan", { paths: paths(dir), rules })).rows.map((x: any) => x.newName);
    expect(await plan({ find: "1", replace: "one" })).toEqual(["one one.txt"]);
    expect(await plan({ find: "[0-9]", replace: "#", useRegex: true })).toEqual(["one #.txt", "two #.txt"]);
    expect(await plan({ find: ".", replace: "!" })).toEqual([]); // plain text: no dot in the names to replace
    expect(await plan({ caseMode: "upper" })).toEqual(["ONE 1.txt", "TWO 2.txt", "THREE.TXT"]);
    expect(await plan({ caseMode: "lower" })).toEqual(["three.TXT"]);
    expect(await plan({ caseMode: "title" })).toEqual(["One 1.txt", "Two 2.txt"]);
    expect(await plan({ prefix: "pre_", suffix: "_suf" })).toEqual(["pre_one 1_suf.txt", "pre_two 2_suf.txt", "pre_Three_suf.TXT"]);
    expect(await plan({ numbering: true })).toEqual(["one 1_001.txt", "two 2_002.txt", "Three_003.TXT"]);
    expect(await plan({ spacesToUnderscore: true })).toEqual(["one_1.txt", "two_2.txt"]);
  });

  test("conflicts are reported and those items are not renamed", async () => {
    const dir = make();
    writeFileSync(join(dir, "taken.txt"), "t");
    const r = await op("find/renameplan", { paths: [join(dir, "one 1.txt"), join(dir, "two 2.txt")], rules: { find: "one 1", replace: "taken" } });
    expect(r.conflicts).toBe(1);
    expect(r.rows[0].error).toContain("already exists");
    const dup = await op("find/renameplan", { paths: paths(dir, ["one 1.txt", "two 2.txt"]), rules: { find: "one 1|two 2", replace: "same", useRegex: true } });
    expect(dup.conflicts).toBe(1);
    expect(dup.rows.map((x: any) => x.error).filter(Boolean)[0]).toContain("Duplicate");
    const applied = await op("find/renameplan", { paths: paths(dir, ["one 1.txt", "two 2.txt"]), rules: { find: "one 1|two 2", replace: "same", useRegex: true }, apply: true });
    expect(applied.renamed.length).toBe(1);
    expect(readdirSync(dir).filter((n) => n.startsWith("same"))).toEqual(["same.txt"]);
    // nothing to do at all
    await fails(op("find/renameplan", { paths: [join(dir, "taken.txt")], rules: {}, apply: true }), "NOTHING_TO_DO");
    await fails(op("find/renameplan", { paths: [join(dir, "taken.txt")], rules: { find: "taken", replace: "same" }, apply: true }), "NOTHING_TO_DO");
  });

  test("names that can't exist are refused with a reason", async () => {
    const dir = make();
    const p = [join(dir, "one 1.txt")];
    expect((await op("find/renameplan", { paths: p, rules: { find: "one", replace: "a/b" } })).rows[0].error).toContain("slash");
    expect((await op("find/renameplan", { paths: p, rules: { find: "one 1", replace: " " } })).rows[0].error).toBeTruthy();
    expect((await op("find/renameplan", { paths: p, rules: { find: "one", replace: " x" } })).rows[0].error).toContain("space");
    expect((await op("find/renameplan", { paths: p, rules: { find: "one 1", replace: "x".repeat(200), prefix: "p".repeat(100) } })).rows[0].error).toContain("too long");
    await fails(op("find/renameplan", { paths: p, rules: { find: "(", useRegex: true } }), "BAD_PATTERN", "valid pattern");
  });

  test("applies the plan through the File Manager's own rename", async () => {
    const dir = make();
    const r = await op("find/renameplan", { paths: paths(dir), rules: { find: " ", replace: "_" }, apply: true });
    expect(r.applied).toBe(true);
    expect(r.renamed).toEqual([{ from: join(dir, "one 1.txt"), to: join(dir, "one_1.txt") }, { from: join(dir, "two 2.txt"), to: join(dir, "two_2.txt") }]);
    expect(r.failed).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual(["Three.TXT", "one_1.txt", "two_2.txt"]);
    expect(readFileSync(join(dir, "one_1.txt"), "utf8")).toBe("one 1.txt");
    expect(readdirSync(dir).some((n) => n.startsWith(".fm-find"))).toBe(false);
  });

  test("names can pass among the items (a to b while b to c) without clashing", async () => {
    const dir = make();
    for (const n of ["f1.txt", "f2.txt", "f3.txt"]) writeFileSync(join(dir, n), n);
    // numbered in the order given: f2 is first, then f3, then f1
    const r = await op("find/renameplan", { paths: [join(dir, "f2.txt"), join(dir, "f3.txt"), join(dir, "f1.txt")], rules: { find: "f", replace: "", numbering: true }, apply: true });
    expect(r.renamed.length).toBe(3);
    expect(readFileSync(join(dir, "2_001.txt"), "utf8")).toBe("f2.txt");
    expect(readFileSync(join(dir, "3_002.txt"), "utf8")).toBe("f3.txt");
    expect(readFileSync(join(dir, "1_003.txt"), "utf8")).toBe("f1.txt");
    // n.txt becomes n_001.txt, which is the CURRENT name of the other item, which moves on to n_001_002.txt
    const chain = make();
    writeFileSync(join(chain, "n.txt"), "N");
    writeFileSync(join(chain, "n_001.txt"), "M");
    const c = await op("find/renameplan", { paths: [join(chain, "n.txt"), join(chain, "n_001.txt")], rules: { numbering: true } });
    expect(c.conflicts).toBe(0);
    const done = await op("find/renameplan", { paths: [join(chain, "n.txt"), join(chain, "n_001.txt")], rules: { numbering: true }, apply: true });
    expect(done.renamed.length).toBe(2);
    expect(done.failed).toEqual([]);
    expect(readFileSync(join(chain, "n_001.txt"), "utf8")).toBe("N");
    expect(readFileSync(join(chain, "n_001_002.txt"), "utf8")).toBe("M");
    expect(existsSync(join(chain, "n.txt"))).toBe(false);
  });

  posixTest("protected items are reported, not renamed", async () => {
    const dir = make();
    const r = await op("find/renameplan", { paths: [join(home, "Documents"), join(dir, "one 1.txt")], rules: { prefix: "x_" } });
    expect(r.conflicts).toBe(1);
    const applied = await op("find/renameplan", { paths: [join(home, "Documents"), join(dir, "one 1.txt")], rules: { prefix: "x_" }, apply: true });
    expect(applied.renamed.length).toBe(1);
    expect(existsSync(join(home, "Documents"))).toBe(true);
    expect(existsSync(join(dir, "x_one 1.txt"))).toBe(true);
    const sys = await op("find/renameplan", { paths: ["/usr/bin/env"], rules: { prefix: "x_" } });
    expect(sys.conflicts).toBe(1);
  });

  test("a change of letter case alone is allowed", async () => {
    const dir = make();
    const r = await op("find/renameplan", { paths: [join(dir, "Three.TXT")], rules: { caseMode: "lower" }, apply: true });
    expect(r.renamed.length).toBe(1);
    expect(readdirSync(dir)).toContain("three.TXT");
    expect(readdirSync(dir)).not.toContain("Three.TXT");
  });

  test("uses the page's filter and sort when working on a search result", async () => {
    const dir = make();
    const id = (await op("find/search", { root: dir, types: ["file"] })).resultId;
    const r = await op("find/renameplan", { resultId: id, filter: "txt", sort: "Name (A→Z)", rules: { numbering: true, find: " ", replace: "" } });
    expect(r.rows.map((x: any) => x.newName)).toEqual(["one1_001.txt", "Three_002.TXT", "two2_003.txt"]);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("live mode (watching the search folder)", () => {
  test("noise is ignored", () => {
    expect(isNoise(".git/index", true)).toBe(true);
    expect(isNoise("src/node_modules/x/y.js", false)).toBe(true);
    expect(isNoise("a.txt~", false)).toBe(true);
    expect(isNoise(".hidden.txt", false)).toBe(true);
    expect(isNoise(".hidden.txt", true)).toBe(false);
    expect(isNoise(".github/ci.yml", true)).toBe(false); // not the .git folder
    expect(isNoise("sub\\.git\\HEAD", true)).toBe(true);
    expect(isNoise(".fm-find-abc123", true)).toBe(true);
    expect(isNoise("a.txt", false)).toBe(false);
  });

  /** Starts a watcher and waits until the events from before it started (some systems replay them) have passed. */
  const startQuiet = async (body: Record<string, any>) => {
    const w = await op("find/watch/start", body);
    await Bun.sleep(250);
    return { w, baseline: (await op("find/watch/poll", w)).changes as number };
  };
  const waitForChange = async (w: any, baseline: number) => {
    let polled = await op("find/watch/poll", w);
    for (let i = 0; i < 60 && polled.changes <= baseline; i++) {
      await Bun.sleep(50);
      polled = await op("find/watch/poll", w);
    }
    return polled;
  };

  test("counts changes and reports them when asked; stops on request", async () => {
    buildTree();
    const { w, baseline } = await startQuiet({ root: work });
    expect(w.root).toBe(work);
    expect(await op("find/watch/poll", w)).toMatchObject({ active: true, error: null });
    writeFileSync(join(work, "live-new.txt"), "x");
    const polled = await waitForChange(w, baseline);
    expect(polled.changes).toBeGreaterThan(baseline);
    expect(polled.lastName).toContain("live-new");
    // changes inside node_modules don't count
    await Bun.sleep(300);
    const settled = (await op("find/watch/poll", w)).changes;
    mkdirSync(join(work, "node_modules", "z"), { recursive: true });
    writeFileSync(join(work, "node_modules", "z", "q.js"), "x");
    await Bun.sleep(400);
    expect((await op("find/watch/poll", w)).changes).toBe(settled);
    expect((await op("find/watch/stop", w)).stopped).toBe(true);
    expect((await op("find/watch/stop", w)).stopped).toBe(false);
    expect(await op("find/watch/poll", w)).toMatchObject({ active: false });
    expect(findState(ctx).watchers.size).toBe(0);
  });

  test("hidden files count only when asked", async () => {
    buildTree();
    const quiet = await startQuiet({ root: work });
    writeFileSync(join(work, ".dot-live.txt"), "x");
    await Bun.sleep(400);
    expect((await op("find/watch/poll", quiet.w)).changes).toBe(quiet.baseline);
    await op("find/watch/stop", quiet.w);
    const loud = await startQuiet({ root: work, hidden: true });
    writeFileSync(join(work, ".dot-live2.txt"), "x");
    expect((await waitForChange(loud.w, loud.baseline)).changes).toBeGreaterThan(loud.baseline);
    await op("find/watch/stop", loud.w);
  });

  test("at most two at a time", async () => {
    const a = await op("find/watch/start", { root: work });
    const b = await op("find/watch/start", { root: join(work, "sub") });
    await fails(op("find/watch/start", { root: join(work, "emptydir") }), "TOO_MANY_WATCHERS", "2 folders");
    await op("find/watch/stop", a);
    const c = await op("find/watch/start", { root: join(work, "emptydir") });
    await op("find/watch/stop", b);
    await op("find/watch/stop", c);
    expect(findState(ctx).watchers.size).toBe(0);
  });

  test("bad input", async () => {
    await fails(op("find/watch/start", { root: join(work, "nope") }), "NOT_FOUND");
    await fails(op("find/watch/start", { root: join(work, "a.txt") }), "NOT_A_FOLDER");
    await fails(op("find/watch/start", { root: "relative" }), "BAD_PATH");
    expect(await op("find/watch/poll", {})).toMatchObject({ active: false });
    expect(await op("find/watch/poll", { watchId: "nope" })).toMatchObject({ active: false });
    expect(await op("find/watch/stop", {})).toEqual({ stopped: false });
  });

  test("a watcher nobody asks about stops by itself", async () => {
    const w = await startWatch(ctx, { root: work }, 80);
    expect(pollWatch(ctx, w, 80).active).toBe(true);
    await Bun.sleep(300);
    expect(pollWatch(ctx, w, 80).active).toBe(false);
    expect(findState(ctx).watchers.size).toBe(0);
    const again = await startWatch(ctx, { root: work }, 80);
    expect(stopWatch(ctx, again).stopped).toBe(true);
  });

  test("every watcher ends when the server's cleanup runs", async () => {
    const other = createContext({ home, dataDir: join(data, "watch") });
    await startWatch(other, { root: work });
    await startWatch(other, { root: join(work, "sub") });
    expect(findState(other).watchers.size).toBe(2);
    for (const dispose of other.disposers.splice(0)) dispose();
    expect(findState(other).watchers.size).toBe(0);
  });
});

// -------------------------------------------------------------------------------------------------------------
describe("over HTTP, through the real server", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  let url: string;
  const TOKEN = "find-test-token";
  const call = async (name: string, body: unknown = {}, headers: Record<string, string> = {}) => {
    const res = await fetch(`${url}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };

  beforeAll(() => {
    buildTree();
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(base, "http-data"), launch: async () => {} } });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => {
    server.stop(true);
  });

  test("every find operation is registered", () => {
    for (const name of Object.keys(findOperations)) expect(API_OPERATIONS).toContain(name);
    for (const name of ["find/meta", "find/search", "find/inspect", "find/sha256", "find/hex", "find/grep", "find/dupes", "find/largest", "find/extstats", "find/copy", "find/move", "find/trash", "find/delete", "find/archive", "find/export", "find/exec", "find/chmod", "find/renameplan", "find/watch/start", "find/watch/poll", "find/watch/stop"]) {
      expect(API_OPERATIONS).toContain(name);
    }
  });

  test("they need the session token and a JSON body", async () => {
    expect((await call("find/meta", {}, { "x-fm-token": "wrong" })).status).toBe(401);
    const res = await fetch(`${url}/api/find/search`, { method: "POST", headers: { "x-fm-token": TOKEN, "Content-Type": "text/plain" }, body: "{}" });
    expect(res.status).toBe(415);
    const bad = await fetch(`${url}/api/find/search`, { method: "POST", headers: { "x-fm-token": TOKEN, "Content-Type": "application/json" }, body: "[1]" });
    expect(bad.status).toBe(400);
  });

  test("search, then act on the remembered result by id", async () => {
    const meta = await call("find/meta");
    expect(meta.status).toBe(200);
    expect(meta.json.ok).toBe(true);
    const s = await call("find/search", { root: work, pattern: "\\.txt$", types: ["file"] });
    expect(s.status).toBe(200);
    expect(s.json.ok).toBe(true);
    expect(s.json.items.length).toBeGreaterThan(3);
    const id = s.json.resultId;
    const g = await call("find/grep", { resultId: id, query: "world" });
    expect(g.json.matches.length).toBe(2);
    const d = await call("find/dupes", { resultId: id });
    expect(d.json.totalGroups).toBe(1);
    const e = await call("find/export", { resultId: id, format: "paths", filter: "b.txt" });
    expect(e.json.text).toBe(`${join(work, "b.txt")}\n`);
  });

  test("errors come back as plain JSON with a good status", async () => {
    const a = await call("find/search", { root: "relative" });
    expect(a.status).toBe(400);
    expect(a.json).toMatchObject({ ok: false, error: { code: "BAD_PATH" } });
    const b = await call("find/grep", { resultId: "old", query: "x" });
    expect(b.json.error.code).toBe("RESULT_GONE");
    const c = await call("find/inspect", { path: join(work, "nope") });
    expect(c.status).toBe(400);
    expect(c.json.error.code).toBe("ENOENT");
    expect(c.json.error.message).toContain("doesn't exist");
  });

  test("deleting and running commands without confirm: true answers 409 and does nothing", async () => {
    const s = await call("find/search", { root: work, pattern: "^a\\.txt$" });
    const del = await call("find/delete", { resultId: s.json.resultId });
    expect(del.status).toBe(409);
    expect(del.json.error.code).toBe("NEEDS_CONFIRM");
    const exec = await call("find/exec", { resultId: s.json.resultId, template: "echo {}" });
    expect(exec.status).toBe(409);
    expect(existsSync(join(work, "a.txt"))).toBe(true);
    const ok = await call("find/delete", { resultId: s.json.resultId, confirm: true });
    expect(ok.status).toBe(200);
    expect(ok.json.done).toBe(1);
    expect(existsSync(join(work, "a.txt"))).toBe(false);
  });

  posixTest("protected places stay protected over HTTP", async () => {
    const r = await call("find/delete", { paths: ["/usr", join(home, "Documents")], confirm: true });
    expect(r.json.failed).toBe(2);
    expect((await call("find/move", { paths: [join(work, "b.txt")], dest: "/etc" })).json.error.code).toBe("PROTECTED");
  });

  test("other requests are answered while a search runs", async () => {
    const order: string[] = [];
    const slow = call("find/search", { root: work }).then(() => order.push("search"));
    const quick = call("find/meta").then(() => order.push("meta"));
    await Promise.all([slow, quick]);
    expect(order.sort()).toEqual(["meta", "search"]);
  });

  test("a live watcher started over HTTP is gone after the server stops", async () => {
    const other = startFileManagerServer({ port: 0, token: "t2", context: { home, dataDir: join(base, "http-data2"), launch: async () => {} } });
    const r = await fetch(`http://127.0.0.1:${other.port}/api/find/watch/start`, { method: "POST", headers: { "x-fm-token": "t2", "Content-Type": "application/json" }, body: JSON.stringify({ root: work }) });
    expect(((await r.json()) as any).ok).toBe(true);
    expect(findState(other.context).watchers.size).toBe(1);
    other.stop(true);
    expect(findState(other.context).watchers.size).toBe(0);
    const w = await call("find/watch/start", { root: work });
    expect(w.json.ok).toBe(true);
    expect((await call("find/watch/stop", { watchId: w.json.watchId })).json.stopped).toBe(true);
  });
});
