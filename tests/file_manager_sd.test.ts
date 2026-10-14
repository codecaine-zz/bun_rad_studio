import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { editScript, splitLines, unifiedDiff } from "../src/features/filemanager/fmSdDiff";
import { runSdJob, sdState } from "../src/features/filemanager/fmSdRun";
import { compileSpec, eolOf, rewriteText } from "../src/features/filemanager/fmSdShared";
import { sdOperations } from "../src/features/filemanager/fmSdOps";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-sd-"));
const home = join(root, "home");
const dataDir = join(root, "data");
let ctx: FmContext;
let n = 0;

beforeAll(() => {
  mkdirSync(home);
  mkdirSync(dataDir);
  ctx = createContext({ home, dataDir });
});
afterAll(() => {
  for (const d of ctx.disposers) d();
  rmSync(root, { recursive: true, force: true });
});

/** A fresh folder with the given files (a Buffer value is written as it is). */
function mk(files: Record<string, string | Buffer>): string {
  const dir = join(root, `case${++n}`);
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

const op = (name: string, body: Record<string, any> = {}) => sdOperations[`sd/${name}`]!(ctx, body) as Promise<any>;
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err: any) {
    return err as { code: string; message: string };
  }
  throw new Error("expected an error");
};
const preview = (dir: string, extra: Record<string, any> = {}) => op("preview", { find: "foo", replace: "bar", targets: [dir], ...extra });
const names = (r: any) => r.files.map((f: any) => f.path.slice(f.path.lastIndexOf("/") + 1)).sort();

describe("diff", () => {
  const apply = (a: string[], b: string[]) => editScript(a, b).filter((o) => o.k !== "-").map((o) => o.s);
  test("the edit script always rebuilds the new text, on random edits", () => {
    let seed = 7;
    const rnd = (m: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % m;
    for (let round = 0; round < 200; round++) {
      const a = Array.from({ length: rnd(40) }, () => String(rnd(6)));
      const b = a.filter(() => rnd(4) !== 0).flatMap((x) => (rnd(5) === 0 ? [x, String(rnd(6))] : [x]));
      expect(apply(a, b)).toEqual(b);
      expect(editScript(a, b).filter((o) => o.k !== "+").map((o) => o.s)).toEqual(a);
    }
  });
  test("a unified diff has headers, hunk markers and +/- lines with context", () => {
    const d = unifiedDiff("/x/a.txt", "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n", "one\ntwo\nthree\nFOUR\nfive\nsix\nseven\neight\n", { maxLines: 100, maxChars: 10000 });
    expect(d.text.split("\n")).toEqual(["--- /x/a.txt", "+++ /x/a.txt", "@@ -1,7 +1,7 @@", " one", " two", " three", "-four", "+FOUR", " five", " six", " seven"]);
    expect([d.hunks, d.added, d.removed, d.truncated]).toEqual([1, 1, 1, false]);
  });
  test("far-apart changes make separate hunks, and a big diff is cut with a note", () => {
    const a = Array.from({ length: 50 }, (_, i) => `l${i}`);
    const b = a.map((l, i) => (i === 2 || i === 40 ? `${l}!` : l));
    expect(unifiedDiff("p", a.join("\n"), b.join("\n"), { maxLines: 100, maxChars: 10000 }).hunks).toBe(2);
    const cut = unifiedDiff("p", a.join("\n"), a.map((l) => `${l}!`).join("\n"), { maxLines: 10, maxChars: 10000 });
    expect(cut.truncated).toBe(true);
    expect(cut.text).toContain("only the start");
    expect(cut.added).toBe(50);
  });
  test("carriage returns are shown, and a line-break-only change is explained", () => {
    expect(unifiedDiff("p", "a\r\nb\r\n", "a\nb\n", { maxLines: 50, maxChars: 1000 }).text).toContain("-a␍");
    expect(unifiedDiff("p", "a\nb", "a\nb\n", { maxLines: 50, maxChars: 1000 }).text).toContain("Only the line break");
    expect(splitLines("")).toEqual([]);
  });
});

describe("rewriting text", () => {
  const run = (text: string, spec: Partial<Parameters<typeof compileSpec>[0]>) => {
    const c = compileSpec({ find: "foo", replace: "bar", literal: false, wholeWord: false, ignoreCase: false, flags: "g", escapes: false, ...spec });
    return rewriteText(text, c, { left: 1000 });
  };
  test("regex, plain text, whole word, ignore case", () => {
    expect(run("a.c abc", { find: "a.c", replace: "X" }).final).toBe("X X");
    expect(run("a.c abc", { find: "a.c", replace: "X", literal: true }).final).toBe("X abc");
    expect(run("foo food foo", { wholeWord: true }).final).toBe("bar food bar");
    expect(run("cat dog cats", { find: "cat|dog", replace: "pet", wholeWord: true }).final).toBe("pet pet cats");
    expect(run("Foo FOO foo", { ignoreCase: true }).matches).toBe(3);
    expect(run("Foo FOO foo", {}).matches).toBe(1);
  });
  test("captures, escapes and flags", () => {
    expect(run("function loadAsync() {}", { find: "function (\\w+)Async", replace: "function $1Sync" }).final).toBe("function loadSync() {}");
    expect(run("a b", { find: " ", replace: "\\n", escapes: true }).final).toBe("a\nb");
    expect(run("a b", { find: " ", replace: "\\n" }).final).toBe("a\\nb");
    expect(run("x \ny \n", { find: " $", replace: "", flags: "gm" }).final).toBe("x\ny\n");
    expect(run("a\nb", { find: "a.b", replace: "X", flags: "gs" }).final).toBe("X");
  });
  test("bad patterns and flags are explained in plain words", () => {
    expect(() => compileSpec({ find: "(", replace: "", literal: false, wholeWord: false, ignoreCase: false, flags: "g", escapes: false })).toThrow(/valid pattern/);
    expect(() => compileSpec({ find: "a", replace: "", literal: false, wholeWord: false, ignoreCase: false, flags: "x", escapes: false })).toThrow(/flags/);
    expect(() => compileSpec({ find: "", replace: "", literal: false, wholeWord: false, ignoreCase: false, flags: "g", escapes: false })).toThrow(/what to look for/);
    expect(() => compileSpec({ find: "(", replace: "", literal: true, wholeWord: false, ignoreCase: false, flags: "g", escapes: false })).not.toThrow();
  });
  test("a CRLF file is matched as LF and keeps CRLF; a pattern about \\r sees the raw text", () => {
    expect(eolOf("a\r\nb\r\n")).toBe("crlf");
    expect(eolOf("a\nb\r\n")).toBe("mixed");
    expect(run("a\r\n\r\n\r\n\r\nb\r\n", { find: "\\n{3,}", replace: "\\n\\n", escapes: true }).final).toBe("a\r\n\r\nb\r\n");
    expect(run("a\r\nb\r\n", { find: "\\r\\n", replace: "\\n", escapes: true }).final).toBe("a\nb\n");
    expect(run("one foo\r\n", {}).final).toBe("one bar\r\n");
  });
  test("a run over the replacement limit changes nothing", () => {
    const c = compileSpec({ find: "a", replace: "b", literal: false, wholeWord: false, ignoreCase: false, flags: "g", escapes: false });
    const r = rewriteText("aaaa", c, { left: 3 });
    expect([r.capped, r.final]).toEqual([true, "aaaa"]);
  });
});

describe("counting and preview", () => {
  test("count lists matching files with per-file and total counts, and changes nothing", async () => {
    const dir = mk({ "a.txt": "foo foo", "sub/b.txt": "foo\nbar", "c.txt": "nothing" });
    const r = await op("count", { find: "foo", targets: [dir] });
    expect(names(r)).toEqual(["a.txt", "b.txt"]);
    expect(r.files.find((f: any) => f.path.endsWith("a.txt")).matches).toBe(2);
    expect(r.stats).toMatchObject({ filesScanned: 3, filesMatched: 2, replacements: 3 });
    expect(r.stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("foo foo");
  });
  test("preview gives a unified diff per file", async () => {
    const dir = mk({ "a.txt": "x\nfoo here\ny\n" });
    const r = await preview(dir);
    const d = await op("diff", { id: r.id, path: join(dir, "a.txt") });
    expect(d.diff).toContain("-foo here");
    expect(d.diff).toContain("+bar here");
    expect(d.diff).toContain("@@ -1,3 +1,3 @@");
    expect(r.files[0]).toMatchObject({ matches: 1, changed: true, hunks: 1, added: 1, removed: 1, hasDiff: true });
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("x\nfoo here\ny\n");
  });
  test("a replacement that changes nothing still counts the matches but isn't a change", async () => {
    const dir = mk({ "a.txt": "foo" });
    const r = await preview(dir, { replace: "foo" });
    expect(r.files[0]).toMatchObject({ matches: 1, changed: false });
    const err = await fails(op("apply", { id: r.id, confirm: true }));
    expect(err.code).toBe("NOTHING_TO_DO");
  });
  test("extension filter, exclude patterns and a single file target", async () => {
    const dir = mk({ "a.ts": "foo", "b.md": "foo", "vendor/c.ts": "foo", "d.min.js": "foo" });
    expect(names(await preview(dir, { exts: "ts, .md", exclude: "vendor" }))).toEqual(["a.ts", "b.md"]);
    expect(names(await preview(dir, { exts: ["ts"], exclude: "*.min.js, vendor" }))).toEqual(["a.ts"]);
    expect(names(await preview(dir, { targets: [join(dir, "b.md")] }))).toEqual(["b.md"]);
  });
  test("it skips node_modules, .git, dist and hidden items unless asked, and says what it skipped", async () => {
    const dir = mk({ "a.txt": "foo", "node_modules/x.txt": "foo", ".git/y.txt": "foo", "dist/z.txt": "foo", ".hidden.txt": "foo", ".cfg/w.txt": "foo" });
    expect(names(await preview(dir))).toEqual(["a.txt"]);
    expect(names(await preview(dir, { defaultExcludes: false, hidden: true }))).toEqual([".hidden.txt", "w.txt", "x.txt", "y.txt", "z.txt", "a.txt"].sort());
    expect(names(await preview(dir, { defaultExcludes: false }))).toEqual(["a.txt", "x.txt", "z.txt"]);
  });
  test("binary, huge, non-UTF-8 files and links are never touched", async () => {
    const dir = mk({ "a.txt": "foo", "bin.dat": Buffer.from([102, 111, 111, 0, 1, 2]), "big.txt": "foo ".repeat(2_000_000), "latin.txt": Buffer.from([102, 111, 111, 0xe9]) });
    writeFileSync(join(dir, "target.txt"), "foo");
    try {
      symlinkSync(join(dir, "target.txt"), join(dir, "link.txt"));
    } catch {}
    const r = await preview(dir);
    expect(names(r)).toEqual(["a.txt", "target.txt"]);
    expect(r.stats.skipped).toMatchObject({ binary: 1, large: 1, notText: 1 });
    if (process.platform !== "win32") expect(r.stats.skipped.links).toBe(1);
  });
  test("a bad pattern, a missing target and no targets are refused with plain messages", async () => {
    const dir = mk({ "a.txt": "foo" });
    expect((await fails(op("preview", { find: "(", targets: [dir] }))).code).toBe("BAD_PATTERN");
    expect((await fails(op("preview", { find: "a", targets: [join(dir, "nope")] }))).code).toBe("NOT_FOUND");
    expect((await fails(op("preview", { find: "a", targets: [] }))).code).toBe("BAD_REQUEST");
    expect((await fails(op("preview", { find: "a", targets: ["relative/path"] }))).code).toBe("BAD_PATH");
  });
});

describe("replacing", () => {
  test("it needs confirmation, a preview and a known result", async () => {
    const dir = mk({ "a.txt": "foo" });
    const r = await preview(dir);
    expect((await fails(op("apply", { id: r.id }))).code).toBe("NEEDS_CONFIRM");
    expect((await fails(op("apply", { id: "nope", confirm: true }))).code).toBe("NO_PREVIEW");
    const counted = await op("count", { find: "foo", targets: [dir] });
    expect((await fails(op("apply", { id: counted.id, confirm: true }))).code).toBe("NEEDS_PREVIEW");
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("foo");
  });
  test("replace without a backup, then the same preview can't be applied twice", async () => {
    const dir = mk({ "a.txt": "foo 1", "b.txt": "foo 2" });
    const r = await preview(dir);
    const done = await op("apply", { id: r.id, confirm: true });
    expect(done).toMatchObject({ replaced: 2, replacements: 2, skipped: 0, backups: 0 });
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("bar 1");
    expect(readdirSync(dir).sort()).toEqual(["a.txt", "b.txt"]);
    const again = await op("apply", { id: r.id, confirm: true });
    expect(again.rows.map((x: any) => x.status)).toEqual(["already", "already"]);
    expect(done.undo).toHaveLength(1);
  });
  test("backups use the chosen ending and never overwrite an existing backup", async () => {
    const dir = mk({ "a.txt": "foo", "a.txt.bak": "precious" });
    const r = await preview(dir, { targets: [join(dir, "a.txt")] });
    const done = await op("apply", { id: r.id, confirm: true, backup: true });
    expect(readFileSync(join(dir, "a.txt.bak"), "utf8")).toBe("precious");
    expect(readFileSync(join(dir, "a.txt (2).bak"), "utf8")).toBe("foo");
    expect(done.backups).toBe(1);
    const r2 = await preview(dir, { find: "bar", replace: "baz", targets: [join(dir, "a.txt")] });
    await op("apply", { id: r2.id, confirm: true, backup: true, backupExt: "orig" });
    expect(readFileSync(join(dir, "a.txt.orig"), "utf8")).toBe("bar");
    expect((await fails(op("apply", { id: r2.id, confirm: true, backup: true, backupExt: "../x" }))).code).toBe("BAD_REQUEST");
  });
  test("only the ticked files are changed", async () => {
    const dir = mk({ "a.txt": "foo", "b.txt": "foo", "c.txt": "foo" });
    const r = await preview(dir);
    const done = await op("apply", { id: r.id, confirm: true, paths: [join(dir, "b.txt")] });
    expect(done.replaced).toBe(1);
    expect(["a.txt", "b.txt", "c.txt"].map((f) => readFileSync(join(dir, f), "utf8"))).toEqual(["foo", "bar", "foo"]);
    expect((await fails(op("apply", { id: r.id, confirm: true, paths: [join(dir, "other.txt")] }))).code).toBe("BAD_REQUEST");
    expect((await fails(op("apply", { id: r.id, confirm: true, paths: [] }))).code).toBe("NOTHING_TO_DO");
  });
  test("a file's permissions, BOM and CRLF line endings survive", async () => {
    const dir = mk({ "a.txt": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("foo\r\nkeep\r\nfoo\r\n")]) });
    const p = join(dir, "a.txt");
    if (process.platform !== "win32") chmodSync(p, 0o750);
    const r = await preview(dir);
    const d = await op("diff", { id: r.id, path: p });
    expect(d.diff).not.toContain("␍");
    await op("apply", { id: r.id, confirm: true });
    const bytes = readFileSync(p);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString("utf8")).toBe("bar\r\nkeep\r\nbar\r\n");
    if (process.platform !== "win32") expect(statSync(p).mode & 0o777).toBe(0o750);
    expect(readdirSync(dir)).toEqual(["a.txt"]);
  });
  test("a file edited after the preview is skipped with a reason, the others still change", async () => {
    const dir = mk({ "a.txt": "foo", "b.txt": "foo" });
    const r = await preview(dir);
    writeFileSync(join(dir, "a.txt"), "foo, but edited");
    const done = await op("apply", { id: r.id, confirm: true });
    expect(done.rows.find((x: any) => x.path.endsWith("a.txt"))).toMatchObject({ status: "changed" });
    expect(done.rows.find((x: any) => x.path.endsWith("a.txt")).message).toContain("edited after the preview");
    expect(done).toMatchObject({ replaced: 1, skipped: 1 });
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("foo, but edited");
    expect(readFileSync(join(dir, "b.txt"), "utf8")).toBe("bar");
  });
  test("files in protected places are skipped, never written", async () => {
    const trashed = join(ctx.trashRoot, "x");
    mkdirSync(trashed, { recursive: true });
    writeFileSync(join(trashed, "a.txt"), "foo");
    const r = await preview(trashed);
    expect(r.files).toHaveLength(1);
    const done = await op("apply", { id: r.id, confirm: true });
    expect(done.rows[0].status).toBe("protected");
    expect(readFileSync(join(trashed, "a.txt"), "utf8")).toBe("foo");
    expect(done.runId).toBeNull();
  });
  test("the change and the skipped reasons are explained per file", async () => {
    const dir = mk({ "a.txt": "foo" });
    const r = await preview(dir);
    const done = await op("apply", { id: r.id, confirm: true });
    expect(done.rows[0]).toMatchObject({ status: "replaced", replacements: 1 });
  });
});

describe("undo", () => {
  test("restores the exact old bytes, keeps the last 5 runs, and then has nothing left", async () => {
    const fresh = createContext({ home, dataDir: join(root, "data-undo") });
    const call = (name: string, body: Record<string, any>) => sdOperations[`sd/${name}`]!(fresh, body) as Promise<any>;
    const dir = mk({ "a.txt": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("foo\r\n")]), "b.txt": "foo" });
    const before = readFileSync(join(dir, "a.txt"));
    const r = await call("preview", { find: "foo", replace: "bar", targets: [dir] });
    await call("apply", { id: r.id, confirm: true, backup: true });
    const undone = await call("undo", { confirm: true });
    expect(undone.restored).toBe(2);
    expect(readFileSync(join(dir, "a.txt")).equals(before)).toBe(true);
    expect(readFileSync(join(dir, "b.txt"), "utf8")).toBe("foo");
    expect(readFileSync(join(dir, "b.txt.bak"), "utf8")).toBe("foo");
    expect((await call("undo", { confirm: true }).catch((e: any) => e)).code).toBe("NOTHING_TO_UNDO");
    for (let i = 0; i < 7; i++) {
      const d = mk({ "x.txt": "foo" });
      const p = await call("preview", { find: "foo", replace: "bar", targets: [d] });
      await call("apply", { id: p.id, confirm: true });
    }
    expect((await call("info", {})).undo).toHaveLength(5);
    for (const d of fresh.disposers) d();
  });
  test("undo needs confirmation", async () => {
    expect((await fails(op("undo", {}))).code).toBe("NEEDS_CONFIRM");
  });
  test("after an undo the same preview can be applied again", async () => {
    const fresh = createContext({ home, dataDir: join(root, "data-undo3") });
    const call = (name: string, body: Record<string, any>) => sdOperations[`sd/${name}`]!(fresh, body) as Promise<any>;
    const dir = mk({ "a.txt": "foo" });
    const r = await call("preview", { find: "foo", replace: "bar", targets: [dir] });
    await call("apply", { id: r.id, confirm: true });
    await call("undo", { confirm: true });
    const again = await call("apply", { id: r.id, confirm: true });
    expect(again.replaced).toBe(1);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("bar");
    for (const d of fresh.disposers) d();
  });
  test("a file edited after the replace is left alone with an explanation, the others are restored", async () => {
    const fresh = createContext({ home, dataDir: join(root, "data-undo2") });
    const call = (name: string, body: Record<string, any>) => sdOperations[`sd/${name}`]!(fresh, body) as Promise<any>;
    const dir = mk({ "a.txt": "foo", "b.txt": "foo", "c.txt": "foo" });
    const r = await call("preview", { find: "foo", replace: "bar", targets: [dir] });
    await call("apply", { id: r.id, confirm: true, backup: true });
    writeFileSync(join(dir, "a.txt"), "bar plus my own edit");
    rmSync(join(dir, "c.txt"));
    const u = await call("undo", { confirm: true });
    const by = (f: string) => u.rows.find((x: any) => x.path.endsWith(f));
    expect(by("a.txt").status).toBe("edited");
    expect(by("a.txt").message).toContain("edited after the replace");
    expect(by("a.txt").message).toContain("a.txt.bak");
    expect(by("c.txt").status).toBe("missing");
    expect(by("b.txt").status).toBe("restored");
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("bar plus my own edit");
    expect(readFileSync(join(dir, "b.txt"), "utf8")).toBe("foo");
    expect(u).toMatchObject({ restored: 1, left: 2 });
    for (const d of fresh.disposers) d();
  });
});

describe("limits and safety", () => {
  test("more than 100000 replacements in a run stops the run and says so", async () => {
    const dir = mk({ "a.txt": "a ".repeat(60_000), "b.txt": "a ".repeat(60_000) });
    const r = await op("count", { find: "a", targets: [dir] });
    expect(r.stats.replacementsCapped).toBe(true);
    expect(r.files).toHaveLength(1);
    expect(r.stats.replacements).toBe(60_000);
  });
  test("a run looks at 5000 files at most", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5003; i++) files[`f${i}.txt`] = "x";
    const dir = mk(files);
    const r = await op("count", { find: "x", targets: [dir] });
    expect(r.stats.filesCapped).toBe(true);
    expect(r.stats.filesScanned).toBe(5000);
  });
  test("a runaway pattern is stopped by the time limit, the server stays responsive and nothing changes", async () => {
    // "a*a*a*a*a*c" on a long run of a's takes seconds (and grows steeply); the limit here is a fraction of a second.
    const text = `${"a".repeat(110)}!`;
    const dir = mk({ "a.txt": text });
    const state = sdState(ctx);
    state.timeoutMs = 300;
    try {
      const started = Date.now();
      const pending = op("preview", { find: "a*a*a*a*a*c", replace: "b", targets: [dir] });
      let ticks = 0;
      const timer = setInterval(() => ticks++, 25);
      const err = await fails(pending);
      clearInterval(timer);
      expect(err.code).toBe("TIMEOUT");
      expect(err.message).toContain("nothing was changed");
      expect(Date.now() - started).toBeLessThan(2000);
      expect(ticks).toBeGreaterThan(5);
      expect(state.workers.size).toBe(0);
    } finally {
      state.timeoutMs = 60_000;
    }
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe(text);
    expect((await preview(mk({ "a.txt": "foo" }))).files).toHaveLength(1);
  });
  test("a job that keeps the worker busy is ended at the limit too", async () => {
    const err = await fails(runSdJob(ctx, { kind: "spin", ms: 5000 }, 300));
    expect(err.code).toBe("TIMEOUT");
    expect(sdState(ctx).workers.size).toBe(0);
  });
  test("saving a patch or a report creates a new file and never overwrites one", async () => {
    const dir = mk({ "a.txt": "foo" });
    const out = mk({ "replace_changes.patch": "mine", "replace_report.md": "mine" });
    const r = await preview(dir);
    const p1 = await op("savediff", { id: r.id, folder: out });
    expect(p1.name).toBe("replace_changes (2).patch");
    const p2 = await op("savediff", { id: r.id, folder: out });
    expect(p2.name).toBe("replace_changes (3).patch");
    expect(readFileSync(join(out, "replace_changes.patch"), "utf8")).toBe("mine");
    expect(readFileSync(p1.path, "utf8")).toContain("+bar");
    const rep = await op("savereport", { id: r.id, folder: out, name: "my report.md" });
    expect(rep.name).toBe("my report.md");
    expect(readFileSync(rep.path, "utf8")).toContain("| Preview ready |");
    expect((await op("savereport", { id: r.id, folder: out })).name).toBe("replace_report (2).md");
    expect((await fails(op("savediff", { id: r.id, folder: out, name: "a/b.patch" }))).code).toBe("BAD_NAME");
    expect((await fails(op("savediff", { id: r.id, folder: join(out, "missing") }))).code).toBe("NOT_FOUND");
    expect((await fails(op("savediff", { id: r.id, folder: ctx.trashRoot }))).code).toBe("PROTECTED");
    const counted = await op("count", { find: "foo", targets: [dir] });
    expect((await fails(op("savediff", { id: counted.id, folder: out }))).code).toBe("NOTHING_TO_DO");
    expect((await op("savereport", { id: counted.id, folder: out })).files).toBe(1);
  });
  test("it reports its presets and limits", async () => {
    const info = await op("info");
    expect(info.presets.length).toBeGreaterThan(5);
    expect(info.defaultExcludes).toEqual(["node_modules", ".git", "dist"]);
    expect(info.limits).toMatchObject({ files: 5000, replacements: 100000, seconds: 60, undoRuns: 5 });
  });
  test("only the newest few results are kept", async () => {
    const fresh = createContext({ home, dataDir: join(root, "data-keep") });
    const dir = mk({ "a.txt": "foo" });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push(((await sdOperations["sd/count"]!(fresh, { find: "foo", targets: [dir] })) as any).id);
    expect(((await sdOperations["sd/diff"]!(fresh, { id: ids[0], path: join(dir, "a.txt") }).catch((e: any) => e)) as any).code).toBe("NO_PREVIEW");
    expect(((await sdOperations["sd/diff"]!(fresh, { id: ids[7], path: join(dir, "a.txt") })) as any).matches).toBe(1);
    for (const d of fresh.disposers) d();
  });
  test("a file edited to the same size and modification time is still caught (the content is compared)", async () => {
    const dir = mk({ "a.txt": "foo" });
    const p = join(dir, "a.txt");
    const r = await preview(dir);
    const st = statSync(p);
    writeFileSync(p, "fXo"); // same size
    utimesSync(p, st.atime, st.mtime); // same mtime
    const done = await op("apply", { id: r.id, confirm: true });
    expect(done.rows[0].status).toBe("changed");
    expect(readFileSync(p, "utf8")).toBe("fXo");
  });
});

describe("through the HTTP API", () => {
  const TOKEN = "sd-test-token";
  let server: ReturnType<typeof startFileManagerServer>;
  let base: string;
  beforeAll(() => {
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(root, "data-http") } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));
  const api = async (name: string, body: unknown = {}, token = TOKEN) => {
    const res = await fetch(`${base}/api/sd/${name}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": token }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };

  test("the operations are registered and need the token", async () => {
    expect((await api("info", {}, "wrong")).status).toBeGreaterThanOrEqual(400);
    const info = await api("info");
    expect(info.status).toBe(200);
    expect(info.json.ok).toBe(true);
    expect(info.json.presets.length).toBeGreaterThan(0);
  });
  test("preview, diff, apply (confirm first), undo", async () => {
    const dir = mk({ "a.txt": "hello foo\n", "b.txt": "foo foo\n" });
    const p = await api("preview", { find: "(f)oo", replace: "$1ee", targets: [dir], backup: true });
    expect(p.status).toBe(200);
    expect(p.json.stats).toMatchObject({ filesMatched: 2, replacements: 3 });
    const d = await api("diff", { id: p.json.id, path: join(dir, "a.txt") });
    expect(d.json.diff).toContain("+hello fee");
    const refused = await api("apply", { id: p.json.id });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NEEDS_CONFIRM");
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("hello foo\n");
    const ok = await api("apply", { id: p.json.id, confirm: true, backup: true, paths: [join(dir, "a.txt")] });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ replaced: 1, backups: 1 });
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("hello fee\n");
    expect(readFileSync(join(dir, "b.txt"), "utf8")).toBe("foo foo\n");
    expect(existsSync(join(dir, "a.txt.bak"))).toBe(true);
    expect((await api("undo", {})).status).toBe(409);
    const u = await api("undo", { confirm: true });
    expect(u.json.restored).toBe(1);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("hello foo\n");
  });
  test("bad requests get a plain 400 error", async () => {
    const e1 = await api("preview", { find: "(", targets: [root] });
    expect(e1.status).toBe(400);
    expect(e1.json.error.code).toBe("BAD_PATTERN");
    const e2 = await api("preview", { targets: [root] });
    expect(e2.status).toBe(400);
    const e3 = await api("apply", { id: 5, confirm: true });
    expect(e3.json.error.code).toBe("NO_PREVIEW");
  });
});
