import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { createContext } from "../src/features/filemanager/fmCore";
import { codeOperations } from "../src/features/filemanager/fmCodeOps";
import { decodeBytes, encodeText, normalizeEol } from "../src/features/filemanager/fmCodeFiles";
import { parseStatus } from "../src/features/filemanager/fmCodeGit";
import { MAX_SESSION_BYTES, sanitizeSession } from "../src/features/filemanager/fmCodeSession";
import { MAX_COMMAND, MAX_FILE_ENTRIES, MAX_PRESET_BYTES, MAX_PRESETS_PER_ENTRY, checkPreset, defaultAsk, extensionKey, sanitizeDoc } from "../src/features/filemanager/fmCodePresets";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const posix = process.platform !== "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const parent = join(import.meta.dir, "..", ".build_check");
mkdirSync(parent, { recursive: true });
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(parent, "fm-code-"));
  roots.push(root);
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  const ctx = createContext({ home, dataDir: join(root, "data"), launch: async () => {} });
  const op = (name: string, body: Record<string, unknown> = {}) => codeOperations[name]!(ctx, body) as Promise<any>;
  return { root, home, work, ctx, op };
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const rejects = async (p: Promise<unknown>, code: string) => {
  try {
    await p;
  } catch (err: any) {
    expect(err.code).toBe(code);
    expect(String(err.message).length).toBeGreaterThan(10);
    return;
  }
  throw new Error(`expected ${code}, but it succeeded`);
};

describe("code/read", () => {
  test("plain UTF-8 text, a trailing newline and the details the editor needs", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "a.txt"), "héllo\nworld\n");
    const { file } = await op("code/read", { path: join(work, "a.txt") });
    expect(file).toMatchObject({ name: "a.txt", text: "héllo\nworld\n", encoding: "utf-8", guessed: false, eol: "lf", mixedEol: false, truncated: false, symlink: false });
    expect(file.size).toBe(13);
    expect(file.mtimeMs).toBeGreaterThan(0);
  });

  test("CRLF is reported and the text uses plain newlines; mixed endings are flagged", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "w.txt"), "a\r\nb\r\nc");
    expect((await op("code/read", { path: join(work, "w.txt") })).file).toMatchObject({ text: "a\nb\nc", eol: "crlf", mixedEol: false });
    writeFileSync(join(work, "m.txt"), "a\r\nb\nc\r\nd\n");
    expect((await op("code/read", { path: join(work, "m.txt") })).file).toMatchObject({ text: "a\nb\nc\nd\n", eol: "crlf", mixedEol: true });
    writeFileSync(join(work, "c.txt"), "a\rb\r");
    expect((await op("code/read", { path: join(work, "c.txt") })).file).toMatchObject({ text: "a\nb\n", eol: "cr" });
  });

  test("UTF-8 with a BOM, and UTF-16 in both byte orders, are decoded and remembered", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "bom.txt"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("ok ✓")]));
    expect((await op("code/read", { path: join(work, "bom.txt") })).file).toMatchObject({ text: "ok ✓", encoding: "utf-8-bom" });
    writeFileSync(join(work, "le.txt"), encodeText("line ✓\nz", "utf-16le"));
    expect((await op("code/read", { path: join(work, "le.txt") })).file).toMatchObject({ text: "line ✓\nz", encoding: "utf-16le" });
    writeFileSync(join(work, "be.txt"), encodeText("line ✓\nz", "utf-16be"));
    expect((await op("code/read", { path: join(work, "be.txt") })).file).toMatchObject({ text: "line ✓\nz", encoding: "utf-16be" });
  });

  test("bytes that are not UTF-8 are read as Latin-1 (and marked as a guess); an encoding can be forced", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "l.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    expect((await op("code/read", { path: join(work, "l.txt") })).file).toMatchObject({ text: "café", encoding: "latin1", guessed: true });
    writeFileSync(join(work, "u.txt"), "café");
    expect((await op("code/read", { path: join(work, "u.txt"), encoding: "latin1" })).file).toMatchObject({ encoding: "latin1", guessed: false });
    await rejects(op("code/read", { path: join(work, "u.txt"), encoding: "ebcdic" }), "BAD_ENCODING");
  });

  test("binary files, folders, missing files and bad paths are refused in plain words", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "b.bin"), Buffer.from([1, 2, 0, 3, 4]));
    await rejects(op("code/read", { path: join(work, "b.bin") }), "BINARY");
    await rejects(op("code/read", { path: work }), "IS_FOLDER");
    await rejects(op("code/read", { path: join(work, "nope.txt") }), "NOT_FOUND");
    await rejects(op("code/read", { path: "relative.txt" }), "BAD_PATH");
    await rejects(op("code/read", { path: 42 }), "BAD_PATH");
    await rejects(op("code/read", {}), "BAD_PATH");
  });

  test("a file bigger than 5 MB is read only in part and flagged", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "big.txt"), "x".repeat(5 * 1024 * 1024 + 100));
    const { file } = await op("code/read", { path: join(work, "big.txt") });
    expect(file.truncated).toBe(true);
    expect(file.text.length).toBe(5 * 1024 * 1024);
    expect(file.size).toBe(5 * 1024 * 1024 + 100);
  });

  test("an empty file is fine", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "e.txt"), "");
    expect((await op("code/read", { path: join(work, "e.txt") })).file).toMatchObject({ text: "", size: 0, eol: "lf" });
  });

  test.skipIf(!posix)("a link can be read but is reported as a link", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "real.txt"), "hi");
    symlinkSync(join(work, "real.txt"), join(work, "link.txt"));
    expect((await op("code/read", { path: join(work, "link.txt") })).file).toMatchObject({ text: "hi", symlink: true });
  });

  test.skipIf(!posix)("a named pipe is not read (it would never end)", async () => {
    const { work, op } = sandbox();
    spawnSync("mkfifo", [join(work, "pipe")]);
    if (existsSync(join(work, "pipe"))) await rejects(op("code/read", { path: join(work, "pipe") }), "NOT_A_FILE");
  });
});

describe("encoding helpers", () => {
  test("encode and decode round trip for every encoding", () => {
    const text = "Hello — ✓ 日本 😀\nline";
    for (const enc of ["utf-8", "utf-8-bom", "utf-16le", "utf-16be"] as const) {
      const back = decodeBytes(encodeText(text, enc));
      expect(back.text).toBe(text);
      expect(back.encoding).toBe(enc);
    }
    expect(decodeBytes(encodeText("café", "latin1")).text).toBe("café");
    expect(() => encodeText("日本", "latin1")).toThrow(/Latin-1/);
  });

  test("line-ending counting", () => {
    expect(normalizeEol("a\nb")).toEqual({ text: "a\nb", eol: "lf", mixed: false });
    expect(normalizeEol("a\r\nb\r\n")).toEqual({ text: "a\nb\n", eol: "crlf", mixed: false });
    expect(normalizeEol("a\nb\r\nc\n")).toMatchObject({ eol: "lf", mixed: true });
    expect(normalizeEol("")).toEqual({ text: "", eol: "lf", mixed: false });
  });
});

describe("code/save", () => {
  const read = (op: Function, path: string) => op("code/read", { path }).then((r: any) => r.file);

  test("saves, keeping the line endings, BOM and a missing final newline; leaves no temporary files", async () => {
    const { work, op } = sandbox();
    const path = join(work, "a.txt");
    writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("one\r\ntwo")]));
    const f = await read(op, path);
    const saved = await op("code/save", { path, text: "one\nTWO\nthree", encoding: f.encoding, eol: f.eol, expected: { mtimeMs: f.mtimeMs, size: f.size } });
    expect(saved.created).toBe(false);
    expect(readFileSync(path)).toEqual(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("one\r\nTWO\r\nthree")]));
    expect(saved.size).toBe(statSync(path).size);
    expect(readdirSync(work)).toEqual(["a.txt"]);
  });

  test("a file changed by another program is not overwritten unless forced", async () => {
    const { work, op } = sandbox();
    const path = join(work, "a.txt");
    writeFileSync(path, "original");
    const f = await read(op, path);
    writeFileSync(path, "someone else wrote this");
    await rejects(op("code/save", { path, text: "mine", expected: { mtimeMs: f.mtimeMs, size: f.size } }), "CHANGED_ON_DISK");
    expect(readFileSync(path, "utf8")).toBe("someone else wrote this");
    await op("code/save", { path, text: "mine", expected: { mtimeMs: f.mtimeMs, size: f.size }, force: true });
    expect(readFileSync(path, "utf8")).toBe("mine");
  });

  test("a deleted file says so instead of quietly coming back", async () => {
    const { work, op } = sandbox();
    await rejects(op("code/save", { path: join(work, "gone.txt"), text: "x" }), "GONE");
    expect(existsSync(join(work, "gone.txt"))).toBe(false);
  });

  test.skipIf(!posix)("the permissions are kept", async () => {
    const { work, op } = sandbox();
    const path = join(work, "run.sh");
    writeFileSync(path, "#!/bin/sh\n");
    chmodSync(path, 0o751);
    await op("code/save", { path, text: "#!/bin/sh\necho hi\n" });
    expect(statSync(path).mode & 0o777).toBe(0o751);
  });

  test.skipIf(!posix)("a link is never replaced", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "real.txt"), "real");
    symlinkSync(join(work, "real.txt"), join(work, "link.txt"));
    await rejects(op("code/save", { path: join(work, "link.txt"), text: "x" }), "IS_LINK");
    await rejects(op("code/saveas", { path: join(work, "link.txt"), text: "x", overwrite: true }), "IS_LINK");
    expect(readFileSync(join(work, "real.txt"), "utf8")).toBe("real");
    expect(readdirSync(work).sort()).toEqual(["link.txt", "real.txt"]);
  });

  test.skipIf(!posix || isRoot)("a read-only file is not replaced", async () => {
    const { work, op } = sandbox();
    const path = join(work, "ro.txt");
    writeFileSync(path, "keep");
    chmodSync(path, 0o444);
    await rejects(op("code/save", { path, text: "x" }), "READ_ONLY");
    expect(readFileSync(path, "utf8")).toBe("keep");
  });

  test("protected places are refused", async () => {
    const { op, ctx, home } = sandbox();
    const system = posix ? "/etc/hosts" : "C:\\Windows\\win.ini";
    await rejects(op("code/save", { path: system, text: "x" }), "PROTECTED");
    await rejects(op("code/saveas", { path: join(ctx.trashRoot, "x.txt"), text: "x" }), "PROTECTED");
    await rejects(op("code/save", { path: join(ctx.trashRoot, "x.txt"), text: "x" }), "PROTECTED");
    void home;
  });

  test("big text can be sent in pieces", async () => {
    const { work, op } = sandbox();
    const path = join(work, "big.txt");
    const line = "0123456789".repeat(9) + "\n";
    const text = line.repeat(30_000); // ~2.7 MB
    const id = "upload-test-1";
    for (let i = 0, n = 0; i < text.length; i += 100_000, n++) await op("code/chunk", { id, index: n, text: text.slice(i, i + 100_000) });
    const saved = await op("code/saveas", { path, upload: id });
    expect(saved).toMatchObject({ created: true, size: text.length });
    expect(readFileSync(path, "utf8")).toBe(text);
    await rejects(op("code/saveas", { path: join(work, "x.txt"), upload: id }), "BAD_REQUEST"); // each upload is used once
  });

  test("uploads must arrive in order, with a valid id, and stay within size limits", async () => {
    const { op } = sandbox();
    await rejects(op("code/chunk", { id: "bad id!", index: 0, text: "x" }), "BAD_REQUEST");
    await rejects(op("code/chunk", { id: "order-test-1", index: 1, text: "x" }), "BAD_REQUEST");
    await rejects(op("code/chunk", { id: "order-test-2", index: 0, text: "x".repeat(200_001) }), "BAD_REQUEST");
    await rejects(op("code/chunk", { id: "order-test-3", index: 0, text: 5 }), "BAD_REQUEST");
  });

  test("bad inputs: no text, odd encodings, odd line endings", async () => {
    const { work, op } = sandbox();
    const path = join(work, "a.txt");
    writeFileSync(path, "x");
    await rejects(op("code/save", { path }), "BAD_REQUEST");
    await rejects(op("code/save", { path, text: 5 }), "BAD_REQUEST");
    await rejects(op("code/save", { path, text: "x", encoding: "rot13" }), "BAD_ENCODING");
    await rejects(op("code/save", { path, text: "x", eol: "weird" }), "BAD_REQUEST");
    await rejects(op("code/save", { path, text: "日本", encoding: "latin1" }), "ENCODING");
    expect(readFileSync(path, "utf8")).toBe("x");
  });
});

describe("code/saveas", () => {
  test("creates a new file, and asks before replacing one", async () => {
    const { work, op } = sandbox();
    const path = join(work, "new.txt");
    expect(await op("code/saveas", { path, text: "first\n" })).toMatchObject({ created: true, size: 6 });
    await rejects(op("code/saveas", { path, text: "second" }), "EXISTS");
    expect(readFileSync(path, "utf8")).toBe("first\n");
    expect(await op("code/saveas", { path, text: "second", overwrite: true })).toMatchObject({ created: false });
    expect(readFileSync(path, "utf8")).toBe("second");
    expect(readdirSync(work)).toEqual(["new.txt"]);
  });

  test("a missing folder, a folder with that name and an over-long name are refused", async () => {
    const { work, op } = sandbox();
    await rejects(op("code/saveas", { path: join(work, "nope", "a.txt"), text: "x" }), "NOT_FOUND");
    mkdirSync(join(work, "dir"));
    await rejects(op("code/saveas", { path: join(work, "dir"), text: "x", overwrite: true }), "IS_FOLDER");
    await rejects(op("code/saveas", { path: join(work, "a".repeat(300)), text: "x" }), "BAD_NAME");
  });

  test("Windows line endings and UTF-16 are written as asked", async () => {
    const { work, op } = sandbox();
    await op("code/saveas", { path: join(work, "w.txt"), text: "a\nb", eol: "crlf" });
    expect(readFileSync(join(work, "w.txt"), "utf8")).toBe("a\r\nb");
    await op("code/saveas", { path: join(work, "u.txt"), text: "hi", encoding: "utf-16le" });
    expect([...readFileSync(join(work, "u.txt"))]).toEqual([0xff, 0xfe, 0x68, 0, 0x69, 0]);
  });
});

describe("code/stat", () => {
  test("reports size, time and whether each file exists", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "a.txt"), "abc");
    const { stats } = await op("code/stat", { paths: [join(work, "a.txt"), join(work, "no.txt"), work] });
    expect(stats[0]).toMatchObject({ exists: true, size: 3 });
    expect(stats[1]).toMatchObject({ exists: false });
    expect(stats[2]).toMatchObject({ exists: false });
    await rejects(op("code/stat", { paths: "x" }), "BAD_REQUEST");
    await rejects(op("code/stat", { paths: Array(61).fill(join(work, "a.txt")) }), "BAD_REQUEST");
  });
});

describe("code/files", () => {
  test("lists relative paths, skipping node_modules, .git, build output and hidden files", async () => {
    const { work, op } = sandbox();
    for (const d of ["src/deep", "node_modules/pkg", ".git/objects", "dist", ".hidden"]) mkdirSync(join(work, d), { recursive: true });
    for (const f of ["README.md", "src/a.ts", "src/deep/b.ts", "node_modules/pkg/i.js", ".git/HEAD", "dist/out.js", ".hidden/x", ".env"]) writeFileSync(join(work, f), "x");
    const r = await op("code/files", { root: work });
    expect(r.files.sort()).toEqual(["README.md", "src/a.ts", "src/deep/b.ts"]);
    expect(r.truncated).toBe(false);
    const withHidden = await op("code/files", { root: work, hidden: true });
    expect(withHidden.files).toContain(".env");
    expect(withHidden.files).toContain(".hidden/x");
    expect(withHidden.files).not.toContain("node_modules/pkg/i.js");
  });

  test.skipIf(!posix)("links to folders are not followed", async () => {
    const { work, op } = sandbox();
    mkdirSync(join(work, "a"));
    writeFileSync(join(work, "a", "f.txt"), "x");
    symlinkSync(work, join(work, "a", "loop"));
    expect((await op("code/files", { root: work })).files).toEqual(["a/f.txt"]);
  });

  test("a huge folder is skipped, and the root must be a folder", async () => {
    const { work, op } = sandbox();
    mkdirSync(join(work, "huge"));
    for (let i = 0; i < 5001; i++) writeFileSync(join(work, "huge", `f${i}`), "");
    writeFileSync(join(work, "ok.txt"), "");
    const r = await op("code/files", { root: work });
    expect(r.files).toEqual(["ok.txt"]);
    expect(r.skipped[0]).toContain("huge/");
    await rejects(op("code/files", { root: join(work, "ok.txt") }), "NOT_A_FOLDER");
    await rejects(op("code/files", { root: "nope" }), "BAD_PATH");
  }, 30_000);
});

describe("code/search", () => {
  function project() {
    const s = sandbox();
    mkdirSync(join(s.work, "src"));
    mkdirSync(join(s.work, "node_modules"));
    writeFileSync(join(s.work, "src", "a.ts"), "const Alpha = 1;\nlet beta = alpha + 2;\n// TODO fix\n");
    writeFileSync(join(s.work, "src", "b.txt"), "alphabet soup\r\nthe alpha\n");
    writeFileSync(join(s.work, "node_modules", "n.js"), "alpha");
    writeFileSync(join(s.work, "bin.dat"), Buffer.from([0x61, 0x6c, 0x70, 0x68, 0x61, 0, 1]));
    return s;
  }

  test("finds text, ignoring case by default, with line and column; skips binaries and node_modules", async () => {
    const { work, op } = project();
    const r = await op("code/search", { root: work, query: "alpha" });
    const found = r.matches.map((m: any) => `${m.path}:${m.line}:${m.col}`).sort();
    expect(found).toEqual(["src/a.ts:1:7", "src/a.ts:2:12", "src/b.txt:1:1", "src/b.txt:2:5"]);
    expect(r.skippedBinary).toBe(1);
    expect(r.truncated).toBe(false);
    expect(r.matches[0].length).toBe(5);
  });

  test("case, whole word, regex and file filters", async () => {
    const { work, op } = project();
    expect((await op("code/search", { root: work, query: "alpha", caseSensitive: true })).matches.length).toBe(3);
    expect((await op("code/search", { root: work, query: "alpha", wholeWord: true })).matches.length).toBe(3);
    expect([...new Set((await op("code/search", { root: work, query: "al(ph)a\\b", regex: true })).matches.map((m: any) => m.path))].sort()).toEqual(["src/a.ts", "src/b.txt"]);
    expect((await op("code/search", { root: work, query: "alpha", include: "*.txt" })).matches.map((m: any) => m.path)).toEqual(["src/b.txt", "src/b.txt"]);
    expect((await op("code/search", { root: work, query: "a.b", regex: false })).matches).toEqual([]);
  });

  test("a bad pattern gives a friendly error, and bad requests are refused", async () => {
    const { work, op } = project();
    await rejects(op("code/search", { root: work, query: "(", regex: true }), "BAD_PATTERN");
    await rejects(op("code/search", { root: work, query: "" }), "BAD_REQUEST");
    await rejects(op("code/search", { root: work, query: "x".repeat(501) }), "BAD_REQUEST");
    await rejects(op("code/search", { root: join(work, "nothing"), query: "x" }), "NOT_FOUND");
  });

  test("the result list is capped at 1000", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "many.txt"), "match\n".repeat(1500));
    const r = await op("code/search", { root: work, query: "match" });
    expect(r.matches.length).toBe(1000);
    expect(r.truncated).toBe(true);
  });

  test("a pattern that would run forever is stopped by the time limit, and the server stays responsive", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "evil.txt"), `${"a".repeat(40)}!\n`.repeat(100));
    const started = Date.now();
    const r = await op("code/search", { root: work, query: "^(a+)+$", regex: true, timeMs: 600 });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect((await op("code/stat", { paths: [join(work, "evil.txt")] })).stats[0].exists).toBe(true);
  });

  test("empty matches (like a*) do not hang", async () => {
    const { work, op } = sandbox();
    writeFileSync(join(work, "t.txt"), "bbb aaa\n");
    const r = await op("code/search", { root: work, query: "a*", regex: true });
    expect(r.matches.map((m: any) => m.length)).toEqual([3]);
  });
});

const git = spawnSync("git", ["--version"]);
const hasGit = git.status === 0;

describe("code/git", () => {
  test("status text is parsed", () => {
    const s = parseStatus("## main...origin/main [ahead 2, behind 1]\n M a.ts\nA  b.ts\n?? c.ts\nR  old.ts -> new.ts\nUU conflict.ts\n D gone.ts\n");
    expect(s).toMatchObject({ branch: "main", ahead: 2, behind: 1 });
    expect(s.files.map((f) => `${f.path}:${f.label}`)).toEqual(["a.ts:modified", "b.ts:added", "c.ts:new (untracked)", "new.ts:renamed", "conflict.ts:conflict", "gone.ts:deleted"]);
    expect(s.files[3]!.from).toBe("old.ts");
    expect(parseStatus("## No commits yet on trunk\n").branch).toBe("trunk");
  });

  test.skipIf(!hasGit)("a real repository: status, diff and the committed text", async () => {
    const { work, op } = sandbox();
    const run = (...args: string[]) => {
      const r = spawnSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args], { cwd: work });
      expect(r.status, `git ${args.join(" ")}: ${r.stderr}`).toBe(0);
    };
    run("init", "-q");
    writeFileSync(join(work, "a.txt"), "one\ntwo\n");
    run("add", ".");
    run("commit", "-q", "-m", "first");
    writeFileSync(join(work, "a.txt"), "one\nTWO\n");
    writeFileSync(join(work, "new.txt"), "fresh\n");
    const status = await op("code/git", { root: work });
    expect(status).toMatchObject({ available: true, isRepo: true });
    expect(status.files.map((f: any) => `${f.path}:${f.label}`).sort()).toEqual(["a.txt:modified", "new.txt:new (untracked)"]);
    const diff = await op("code/git", { root: work, action: "diff", file: "a.txt" });
    expect(diff.diff).toContain("-two");
    expect(diff.diff).toContain("+TWO");
    expect((await op("code/git", { root: work, action: "show", file: "a.txt" })).text).toBe("one\ntwo\n");
    expect((await op("code/git", { root: work, action: "show", file: "new.txt" })).message).toContain("isn't in the last commit");
    await rejects(op("code/git", { root: work, action: "diff", file: "../x" }), "BAD_PATH");
    await rejects(op("code/git", { root: work, action: "diff", file: "/etc/passwd" }), "BAD_PATH");
    await rejects(op("code/git", { root: work, action: "diff" }), "BAD_REQUEST");
    await rejects(op("code/git", { root: work, action: "push" }), "BAD_REQUEST");
  });

  test.skipIf(!hasGit)("a folder outside any repository says so", async () => {
    const { root, op } = sandbox();
    const plain = join(root, "plain");
    mkdirSync(plain);
    // The sandbox itself lives inside this project's repository when it has one, so only check the shape.
    const r = await op("code/git", { root: plain });
    expect(r.available).toBe(true);
    expect(typeof r.isRepo).toBe("boolean");
  });
});

describe("code/session", () => {
  test("whether the preview is open and whether recent files are remembered are kept; anything but true or false is ignored", async () => {
    const { op } = sandbox();
    expect((await op("code/session")).session.settings.preview).toBe(false);
    expect((await op("code/session")).session.settings.recentsEnabled).toBe(true);
    expect((await op("code/session", { set: { settings: { preview: true, recentsEnabled: false } } })).session.settings).toMatchObject({ preview: true, recentsEnabled: false });
    expect((await op("code/session")).session.settings).toMatchObject({ preview: true, recentsEnabled: false });
    expect((await op("code/session", { set: { settings: { preview: "yes", recentsEnabled: "no" } } })).session.settings).toMatchObject({ preview: false, recentsEnabled: true });
  });

  test("starts with defaults; saves and returns what was set; keeps unspecified parts", async () => {
    const { op, work, home } = sandbox();
    const first = (await op("code/session")).session;
    expect(first).toMatchObject({ version: 1, tabs: [], recents: [], bookmarks: {}, active: "", settings: { theme: "auto", fontSize: 14, tabSize: 2 } });
    const a = join(work, "a.ts");
    const saved = (await op("code/session", { set: { root: work, tabs: [{ path: a, line: 5, col: 3, scrollTop: 120 }], active: a, settings: { theme: "dracula", wrap: true }, recents: [{ path: a, at: "2025-01-01T00:00:00Z" }], bookmarks: { [a]: [9, 3, 3, 12] } } })).session;
    expect(saved.tabs).toEqual([{ path: a, line: 5, col: 3, scrollTop: 120 }]);
    expect(saved.active).toBe(a);
    expect(saved.settings).toMatchObject({ theme: "dracula", wrap: true, fontSize: 14 });
    expect(saved.bookmarks[a]).toEqual([3, 9, 12]);
    const again = (await op("code/session", { set: { settings: { fontSize: 18 } } })).session;
    expect(again.tabs.length).toBe(1);
    expect(again.settings).toMatchObject({ theme: "dracula", fontSize: 18 });
    expect((await op("code/session")).session).toEqual(again);
    void home;
  });

  test("everything is validated and clamped", () => {
    const { ctx } = sandbox();
    const abs = (n: string) => join(ctx.home, n);
    const s = sanitizeSession({
      root: "relative", active: abs("not-open"),
      tabs: [{ path: abs("a"), line: -5, col: 1e12, scrollTop: "x" }, { path: abs("a") }, { path: "rel" }, { path: abs("n\0ul") }, null, 7, { path: abs("b"), line: 2.6 }],
      settings: { theme: "<script>", fontSize: 500, tabSize: 0, wrap: "yes", minimap: true, autosave: 1 },
      recents: [{ path: abs("r"), at: "not a date" }, { path: "rel" }],
      bookmarks: { [abs("a")]: ["x", -1, 0, 4.5, 7], rel: [1], [abs("e")]: [] },
    }, ctx);
    expect(s.root).toBe("");
    expect(s.active).toBe("");
    expect(s.tabs).toEqual([{ path: abs("a"), line: 1, col: 100000, scrollTop: 0 }, { path: abs("b"), line: 3, col: 1, scrollTop: 0 }]);
    expect(s.settings).toMatchObject({ theme: "auto", fontSize: 40, tabSize: 1, wrap: false, minimap: true, autosave: false });
    expect(s.settings).toMatchObject({ autosaveDelay: 1500, autosaveOnBlur: true });
    expect(sanitizeSession({ settings: { autosaveDelay: 5, autosaveOnBlur: false } }, ctx).settings).toMatchObject({ autosaveDelay: 300, autosaveOnBlur: false });
    expect(sanitizeSession({ settings: { autosaveDelay: 1e9 } }, ctx).settings.autosaveDelay).toBe(60000);
    expect(sanitizeSession({ settings: { autosaveDelay: "soon" } }, ctx).settings.autosaveDelay).toBe(1500);
    expect(s.recents).toEqual([{ path: abs("r"), at: new Date(0).toISOString() }]);
    expect(s.bookmarks).toEqual({ [abs("a")]: [7] });
  });

  test("lists are capped: 50 tabs, 30 recent files, 200 bookmarks per file", () => {
    const { ctx } = sandbox();
    const abs = (n: string) => join(ctx.home, n);
    const many = Array.from({ length: 80 }, (_, i) => ({ path: abs(`f${i}`) }));
    const s = sanitizeSession({ tabs: many, recents: many, bookmarks: { [abs("a")]: Array.from({ length: 500 }, (_, i) => i + 1) } }, ctx);
    expect(s.tabs.length).toBe(50);
    expect(s.recents.length).toBe(30);
    expect(s.bookmarks[abs("a")]!.length).toBe(200);
  });

  test("a session that would not fit in 200 KB is refused, and the old one stays", async () => {
    const { op, home } = sandbox();
    await op("code/session", { set: { settings: { fontSize: 20 } } });
    const bookmarks: Record<string, number[]> = {};
    for (let i = 0; i < 200; i++) bookmarks[join(home, `${"d".repeat(3500)}${i}`)] = Array.from({ length: 200 }, (_, j) => 1_000_000 + j);
    await rejects(op("code/session", { set: { bookmarks } }), "TOO_LARGE");
    expect((await op("code/session")).session.settings.fontSize).toBe(20);
    expect(MAX_SESSION_BYTES).toBe(200 * 1024);
  });

  test("a damaged or oversized file on disk gives the defaults instead of an error", async () => {
    const { op, ctx } = sandbox();
    mkdirSync(ctx.dataDir, { recursive: true });
    writeFileSync(join(ctx.dataDir, "file_manager_code.json"), "{not json");
    expect((await op("code/session")).session.tabs).toEqual([]);
    writeFileSync(join(ctx.dataDir, "file_manager_code.json"), JSON.stringify({ settings: { theme: "monokai" }, pad: "x".repeat(MAX_SESSION_BYTES) }));
    expect((await op("code/session")).session.settings.theme).toBe("auto");
  });

  test("bad requests", async () => {
    const { op } = sandbox();
    await rejects(op("code/session", { set: "x" }), "BAD_REQUEST");
    await rejects(op("code/session", { set: [1] }), "BAD_REQUEST");
    await rejects(op("code/session", { set: null }), "BAD_REQUEST");
  });
});

describe.skipIf(!API_OPERATIONS.includes("code/read"))("over HTTP (once fmServer merges codeOperations)", () => {
  test("read, save with a stale check, and the shape of errors", async () => {
    const { root, home, work } = sandbox();
    const server = startFileManagerServer({ port: 0, token: "tok", context: { home, dataDir: join(root, "data"), launch: async () => {} } });
    try {
      const api = async (op: string, body: unknown) => {
        const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": "tok" }, body: JSON.stringify(body) });
        return { status: res.status, json: (await res.json()) as any };
      };
      writeFileSync(join(work, "a.txt"), "hello");
      const r = await api("code/read", { path: join(work, "a.txt") });
      expect(r.json.file.text).toBe("hello");
      const ok = await api("code/save", { path: join(work, "a.txt"), text: "bye", expected: { mtimeMs: r.json.file.mtimeMs, size: r.json.file.size } });
      expect(ok.json.ok).toBe(true);
      writeFileSync(join(work, "a.txt"), "changed elsewhere!");
      const stale = await api("code/save", { path: join(work, "a.txt"), text: "x", expected: { mtimeMs: r.json.file.mtimeMs, size: r.json.file.size } });
      expect(stale.status).toBe(400);
      expect(stale.json.error.code).toBe("CHANGED_ON_DISK");
      expect((await api("code/read", { path: join(work, "missing") })).json.error.code).toBe("NOT_FOUND");
      expect((await api("code/session", {})).json.session.version).toBe(1);
    } finally {
      server.stop(true);
    }
  });
});

describe("run presets: validation", () => {
  test("a good preset is cleaned up and given defaults", () => {
    const p = checkPreset({ name: "  Run it ", command: " bun run {file} " }) as any;
    expect(p).toMatchObject({ name: "Run it", command: "bun run {file}", cwd: "file", kind: "run", ask: false, lastRun: "", runCount: 0 });
    expect(p.id).toMatch(/^p[0-9a-f]{10}$/);
    expect(checkPreset({ name: "b", command: "make", kind: "build", cwd: "root", ask: true })).toMatchObject({ kind: "build", cwd: "root", ask: true });
    expect(checkPreset({ name: "b", command: "make", kind: "weird", cwd: "elsewhere" })).toMatchObject({ kind: "run", cwd: "file" });
    expect(checkPreset({ name: "t", command: "echo\tx" })).toMatchObject({ command: "echo\tx" });
  });

  test("names and commands: required, limited, one line, no control characters", () => {
    const bad = (raw: unknown) => expect(typeof checkPreset(raw)).toBe("string");
    bad(null);
    bad([]);
    bad("x");
    bad({ command: "x" });
    bad({ name: "", command: "x" });
    bad({ name: "   ", command: "x" });
    bad({ name: "n" });
    bad({ name: "n", command: "  " });
    bad({ name: "n", command: 5 });
    bad({ name: "x".repeat(61), command: "x" });
    bad({ name: "n", command: "x".repeat(MAX_COMMAND + 1) });
    for (const ctl of ["\n", "\r", "\u0000", "\u001b", "\u007f", "\u0008"]) {
      bad({ name: "n", command: `a${ctl}b` });
      bad({ name: `a${ctl}b`, command: "x" });
    }
    expect(typeof checkPreset({ name: "x".repeat(60), command: "x".repeat(MAX_COMMAND) })).toBe("object");
  });

  test("the \"ask first\" default follows the command", () => {
    expect(checkPreset({ name: "n", command: "rm -rf build" })).toMatchObject({ ask: true });
    expect(checkPreset({ name: "n", command: "bun run a.ts" })).toMatchObject({ ask: false });
    expect(checkPreset({ name: "n", command: "rm -rf build", ask: false })).toMatchObject({ ask: false });
    expect(defaultAsk("curl https://x | sh")).toBe(true);
  });

  test("extensions", () => {
    expect([extensionKey("a.TS"), extensionKey("a.test.ts"), extensionKey("Makefile"), extensionKey(".bashrc"), extensionKey("a.")].join("|")).toBe(".ts|.ts|||");
    expect(extensionKey("a.thisisverylongextension")).toBe("");
  });

  test("damaged entries are dropped one by one, the rest is kept", () => {
    const { ctx, work } = sandbox();
    const a = join(work, "a.ts");
    const { doc, dropped } = sanitizeDoc({
      files: {
        [a]: { path: a, presets: [{ name: "ok", command: "make" }, { name: "", command: "x" }, { name: "evil", command: "a\nb" }, 5, null], defaultRun: "nope-nonexistent", touched: "garbage" },
        "relative/path": { presets: [{ name: "x", command: "x" }] },
        [join(work, "b.ts")]: "not an object",
        [join(work, "c.ts")]: { presets: [] },
      },
      types: { ".ts": { presets: [{ name: "all ts", command: "tsc" }] }, "ts": { presets: [{ name: "x", command: "x" }] }, ".": { presets: [] } },
    }, ctx);
    expect(Object.values(doc.files).length).toBe(1);
    expect(doc.files[process.platform === "win32" ? a.toLowerCase() : a]!.presets.map((p) => p.name)).toEqual(["ok"]);
    expect(Object.keys(doc.types)).toEqual([".ts"]);
    expect(dropped).toBeGreaterThanOrEqual(5);
  });
});

describe("run presets: saving, looking up, and remembering", () => {
  const preset = (name: string, command = "bun run {file}", extra: object = {}) => ({ name, command, cwd: "file", kind: "run", ...extra });

  test("a preset saved for a file is listed for that file only, and survives a restart", async () => {
    const { root, work, ctx, op } = sandbox();
    const a = join(work, "a.ts");
    const saved = await op("code/presets/save", { path: a, scope: "file", preset: preset("Run") });
    expect(saved.presets).toHaveLength(1);
    expect(saved.presets[0]).toMatchObject({ name: "Run", scope: "file", ext: "", runCount: 0 });
    expect((await op("code/presets/list", { path: join(work, "b.ts") })).presets).toEqual([]);
    // "restart": a brand-new context over the same data folder
    const again = createContext({ home: ctx.home, dataDir: join(root, "data") });
    const listed = (await codeOperations["code/presets/list"]!(again, { path: a })) as any;
    expect(listed.presets.map((p: any) => p.name)).toEqual(["Run"]);
    expect(existsSync(join(root, "data", "file_manager_code_presets.json"))).toBe(true);
    expect(readdirSync(join(root, "data")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  test("this file's presets come before the ones for all files of the same type", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    await op("code/presets/save", { path: a, scope: "ext", preset: preset("All TS", "tsc --noEmit", { cwd: "root", kind: "build" }) });
    await op("code/presets/save", { path: a, scope: "file", preset: preset("Just this") });
    await op("code/presets/save", { path: a, scope: "ext", preset: preset("All TS 2", "bun test {file}") });
    const list = await op("code/presets/list", { path: a });
    expect(list.presets.map((p: any) => `${p.scope}:${p.name}`)).toEqual(["file:Just this", "ext:All TS", "ext:All TS 2"]);
    expect(list.presets[1].ext).toBe(".ts");
    expect((await op("code/presets/list", { path: join(work, "other.ts") })).presets.map((p: any) => p.name)).toEqual(["All TS", "All TS 2"]);
    expect((await op("code/presets/list", { path: join(work, "other.py") })).presets).toEqual([]);
    expect((await op("code/presets/list", { path: join(work, "x.TS") })).presets).toHaveLength(2);
    await rejects(op("code/presets/save", { path: join(work, "Makefile"), scope: "ext", preset: preset("x") }), "NO_EXTENSION");
  });

  test("editing keeps the id, position and run history; moving between lists works", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    await op("code/presets/save", { path: a, scope: "file", preset: preset("One") });
    const two = (await op("code/presets/save", { path: a, scope: "file", preset: preset("Two") })).presets[1];
    await op("code/presets/save", { path: a, scope: "file", preset: preset("Three") });
    await op("code/presets/ran", { path: a, id: two.id });
    const edited = await op("code/presets/save", { path: a, scope: "file", preset: { ...preset("Two!", "node {file}"), id: two.id } });
    expect(edited.presets.map((p: any) => p.name)).toEqual(["One", "Two!", "Three"]);
    expect(edited.presets[1]).toMatchObject({ id: two.id, command: "node {file}", runCount: 1 });
    expect(edited.presets[1].lastRun).not.toBe("");
    const moved = await op("code/presets/save", { path: a, scope: "ext", preset: { ...preset("Two!", "node {file}"), id: two.id } });
    expect(moved.presets.map((p: any) => `${p.scope}:${p.name}`)).toEqual(["file:One", "file:Three", "ext:Two!"]);
    expect(moved.presets[2].id).toBe(two.id);
  });

  test("bad presets are refused with a plain message, and nothing is stored", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    await rejects(op("code/presets/save", { path: a, preset: { name: "x", command: "a\nrm -rf ~" } }), "BAD_PRESET");
    await rejects(op("code/presets/save", { path: a, preset: { name: "", command: "x" } }), "BAD_PRESET");
    await rejects(op("code/presets/save", { path: a }), "BAD_PRESET");
    await rejects(op("code/presets/save", { path: "relative.ts", preset: preset("x") }), "BAD_PATH");
    await rejects(op("code/presets/list", {}), "BAD_PATH");
    expect((await op("code/presets/list", { path: a })).presets).toEqual([]);
  });

  test("at most 20 presets per file and per type", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    for (let i = 0; i < MAX_PRESETS_PER_ENTRY; i++) await op("code/presets/save", { path: a, scope: "file", preset: preset(`p${i}`) });
    await rejects(op("code/presets/save", { path: a, scope: "file", preset: preset("one too many") }), "TOO_MANY");
    for (let i = 0; i < MAX_PRESETS_PER_ENTRY; i++) await op("code/presets/save", { path: a, scope: "ext", preset: preset(`t${i}`) });
    await rejects(op("code/presets/save", { path: a, scope: "ext", preset: preset("one too many") }), "TOO_MANY");
    expect((await op("code/presets/list", { path: a })).presets).toHaveLength(40);
    const first = (await op("code/presets/list", { path: a })).presets[0];
    expect((await op("code/presets/save", { path: a, scope: "file", preset: { ...preset("renamed"), id: first.id } })).presets[0].name).toBe("renamed");
  });

  test("delete, reorder", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    const ids: string[] = [];
    for (const n of ["A", "B", "C"]) ids.push((await op("code/presets/save", { path: a, scope: "file", preset: preset(n) })).presets.at(-1).id);
    expect((await op("code/presets/reorder", { path: a, ids: [ids[2], ids[0], ids[1]] })).presets.map((p: any) => p.name)).toEqual(["C", "A", "B"]);
    expect((await op("code/presets/reorder", { path: a, ids: [ids[1]] })).presets.map((p: any) => p.name)).toEqual(["B", "C", "A"]);
    await rejects(op("code/presets/reorder", { path: a, ids: "x" }), "BAD_REQUEST");
    expect((await op("code/presets/delete", { path: a, id: ids[0] })).presets.map((p: any) => p.name)).toEqual(["B", "C"]);
    await rejects(op("code/presets/delete", { path: a, id: ids[0] }), "NOT_FOUND");
    await rejects(op("code/presets/delete", { path: a, id: "nope" }), "NOT_FOUND");
    await op("code/presets/delete", { path: a, id: ids[1] });
    await op("code/presets/delete", { path: a, id: ids[2] });
    expect((await op("code/presets/list", { path: a })).presets).toEqual([]);
  });

  test("one default Run preset and one Build preset per file; kinds are enforced; deleting clears them", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    const run = (await op("code/presets/save", { path: a, scope: "file", preset: preset("Run") })).presets[0].id;
    const run2 = (await op("code/presets/save", { path: a, scope: "file", preset: preset("Run 2") })).presets[1].id;
    const build = (await op("code/presets/save", { path: a, scope: "ext", preset: preset("Build", "tsc", { kind: "build", cwd: "root" }) })).presets[2].id;
    let l = await op("code/presets/default", { path: a, id: run, kind: "run" });
    expect([l.defaultRun, l.defaultBuild]).toEqual([run, ""]);
    l = await op("code/presets/default", { path: a, id: run2, kind: "run" });
    expect(l.defaultRun).toBe(run2);
    l = await op("code/presets/default", { path: a, id: build, kind: "build" });
    expect([l.defaultRun, l.defaultBuild]).toEqual([run2, build]);
    expect((await op("code/presets/list", { path: join(work, "other.ts") })).defaultBuild).toBe("");
    await rejects(op("code/presets/default", { path: a, id: build, kind: "run" }), "WRONG_KIND");
    await rejects(op("code/presets/default", { path: a, id: run, kind: "build" }), "WRONG_KIND");
    await rejects(op("code/presets/default", { path: a, id: "zzz", kind: "run" }), "NOT_FOUND");
    l = await op("code/presets/delete", { path: a, id: run2 });
    expect(l.defaultRun).toBe("");
    l = await op("code/presets/default", { path: a, id: "", kind: "build" });
    expect(l.defaultBuild).toBe("");
  });

  test("running is only recorded: time, count, and the last preset used for the file", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    const x = (await op("code/presets/save", { path: a, scope: "file", preset: preset("X") })).presets[0].id;
    const y = (await op("code/presets/save", { path: a, scope: "ext", preset: preset("Y") })).presets[1].id;
    await op("code/presets/ran", { path: a, id: x });
    await op("code/presets/ran", { path: a, id: x });
    const l = await op("code/presets/ran", { path: a, id: y });
    expect(l.presets.map((p: any) => [p.name, p.runCount])).toEqual([["X", 2], ["Y", 1]]);
    expect(l.last).toBe(y);
    expect(Date.now() - Date.parse(l.presets[0].lastRun)).toBeLessThan(10_000);
    await rejects(op("code/presets/ran", { path: a, id: "nope" }), "NOT_FOUND");
    // another file of the same type: the ext preset is shared, its count is shared, but "last used" is per file
    const other = await op("code/presets/list", { path: join(work, "b.ts") });
    expect(other.presets[0]).toMatchObject({ name: "Y", runCount: 1 });
    expect(other.last).toBe("");
  });

  test("renaming a file moves its presets (and merges into an existing entry without losing any)", async () => {
    const { work, op } = sandbox();
    const a = join(work, "a.ts");
    const b = join(work, "renamed.ts");
    const id = (await op("code/presets/save", { path: a, scope: "file", preset: preset("Mine") })).presets[0].id;
    await op("code/presets/default", { path: a, id, kind: "run" });
    expect(await op("code/presets/move", { from: a, to: b })).toEqual({ moved: true });
    expect((await op("code/presets/list", { path: a })).presets).toEqual([]);
    const moved = await op("code/presets/list", { path: b });
    expect(moved.presets.map((p: any) => p.name)).toEqual(["Mine"]);
    expect(moved.defaultRun).toBe(id);
    expect(await op("code/presets/move", { from: a, to: join(work, "z.ts") })).toEqual({ moved: false });
    expect(await op("code/presets/move", { from: b, to: b })).toEqual({ moved: false });
    await op("code/presets/save", { path: a, scope: "file", preset: preset("Other") });
    await op("code/presets/save", { path: a, scope: "file", preset: preset("Mine") });
    await op("code/presets/move", { from: a, to: b });
    expect((await op("code/presets/list", { path: b })).presets.map((p: any) => p.name).sort()).toEqual(["Mine", "Other"]);
    await rejects(op("code/presets/move", { from: a }), "BAD_PATH");
  });

  // A presets file that is already nearly full, written the way the program writes it, so a few saves reach the limits
  // (hundreds of saves one after another only measured how fast the disk is: over 30 s on a slow CI machine).
  const seededEntry = (path: string, seconds: number, count: number, command: string) => ({
    path,
    presets: Array.from({ length: count }, (_, i) => ({ id: `p${seconds}x${i}`, name: `p${i}`, command, cwd: "file", kind: "run", ask: false, lastRun: "", runCount: 0 })),
    defaultRun: "", defaultBuild: "", last: "", touched: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
  });
  const seed = (ctx: { dataDir: string }, files: Record<string, unknown>) => {
    mkdirSync(ctx.dataDir, { recursive: true });
    writeFileSync(join(ctx.dataDir, "file_manager_code_presets.json"), JSON.stringify({ version: 1, files, types: {} }));
  };

  test("only the newest 500 files' entries are kept", async () => {
    const { work, op, ctx } = sandbox();
    const total = MAX_FILE_ENTRIES + 12;
    seed(ctx, Object.fromEntries(Array.from({ length: MAX_FILE_ENTRIES }, (_, i) => [join(work, `f${i}.txt`), seededEntry(join(work, `f${i}.txt`), i, 1, "echo")])));
    for (let i = MAX_FILE_ENTRIES; i < total; i++) await op("code/presets/save", { path: join(work, `f${i}.txt`), scope: "file", preset: preset("p", "echo") });
    const doc = JSON.parse(readFileSync(join(ctx.dataDir, "file_manager_code_presets.json"), "utf8"));
    expect(Object.keys(doc.files)).toHaveLength(MAX_FILE_ENTRIES);
    expect((await op("code/presets/list", { path: join(work, "f0.txt") })).presets).toEqual([]);
    expect((await op("code/presets/list", { path: join(work, "f11.txt") })).presets).toEqual([]);
    expect((await op("code/presets/list", { path: join(work, "f12.txt") })).presets).toHaveLength(1);
    expect((await op("code/presets/list", { path: join(work, `f${total - 1}.txt`) })).presets).toHaveLength(1);
  }, 60_000);

  test("the file never grows past 500 KB: the oldest files' presets go first", async () => {
    const { work, op, ctx } = sandbox();
    const command = "x".repeat(MAX_COMMAND);
    // 12 files with a full list of the longest commands is about 506 KB: under the limit, and nearly at it.
    seed(ctx, Object.fromEntries(Array.from({ length: 12 }, (_, f) => [join(work, `big${f}.txt`), seededEntry(join(work, `big${f}.txt`), f, MAX_PRESETS_PER_ENTRY, command)])));
    expect(statSync(join(ctx.dataDir, "file_manager_code_presets.json")).size).toBeLessThanOrEqual(MAX_PRESET_BYTES);
    for (let i = 0; i < MAX_PRESETS_PER_ENTRY; i++) await op("code/presets/save", { path: join(work, "big12.txt"), scope: "file", preset: preset(`p${i}`, command) });
    expect(statSync(join(ctx.dataDir, "file_manager_code_presets.json")).size).toBeLessThanOrEqual(MAX_PRESET_BYTES);
    expect((await op("code/presets/list", { path: join(work, "big12.txt") })).presets).toHaveLength(MAX_PRESETS_PER_ENTRY);
    expect((await op("code/presets/list", { path: join(work, "big0.txt") })).presets).toEqual([]);
  }, 60_000);

  test("a damaged file starts fresh, and the old one is kept aside", async () => {
    const { work, op, ctx } = sandbox();
    mkdirSync(ctx.dataDir, { recursive: true });
    writeFileSync(join(ctx.dataDir, "file_manager_code_presets.json"), "{ this is not json");
    expect((await op("code/presets/list", { path: join(work, "a.ts") })).presets).toEqual([]);
    await op("code/presets/save", { path: join(work, "a.ts"), scope: "file", preset: preset("New") });
    expect(readFileSync(join(ctx.dataDir, "file_manager_code_presets.json.damaged"), "utf8")).toBe("{ this is not json");
    expect((await op("code/presets/list", { path: join(work, "a.ts") })).presets.map((p: any) => p.name)).toEqual(["New"]);
    writeFileSync(join(ctx.dataDir, "file_manager_code_presets.json"), JSON.stringify({ files: { [join(work, "a.ts")]: { presets: [{ name: "evil", command: "a\nb" }, { name: "fine", command: "ok" }] } }, extra: "ignored" }));
    expect((await op("code/presets/list", { path: join(work, "a.ts") })).presets.map((p: any) => p.name)).toEqual(["fine"]);
  });

  test("many saves at once don't lose each other", async () => {
    const { work, op } = sandbox();
    await Promise.all(Array.from({ length: 40 }, (_, i) => op("code/presets/save", { path: join(work, `c${i}.ts`), scope: "file", preset: preset(`p${i}`) })));
    await Promise.all(Array.from({ length: 10 }, (_, i) => op("code/presets/save", { path: join(work, "same.ts"), scope: "file", preset: preset(`same${i}`) })));
    for (let i = 0; i < 40; i++) expect((await op("code/presets/list", { path: join(work, `c${i}.ts`) })).presets.map((p: any) => p.name)).toEqual([`p${i}`]);
    expect((await op("code/presets/list", { path: join(work, "same.ts") })).presets).toHaveLength(10);
  });

  test("export and import round trip; imports are validated, never run, and get fresh ids", async () => {
    const a = sandbox();
    const f = join(a.work, "a.ts");
    await a.op("code/presets/save", { path: f, scope: "file", preset: preset("Run") });
    const build = (await a.op("code/presets/save", { path: f, scope: "ext", preset: preset("Build", "make", { kind: "build", cwd: "root" }) })).presets[1].id;
    await a.op("code/presets/default", { path: f, id: build, kind: "build" });
    const { data } = await a.op("code/presets/export");
    expect(data.format).toBe("bun-rad-file-manager-run-presets");
    const wire = JSON.parse(JSON.stringify(data));

    const b = sandbox();
    const result = await b.op("code/presets/import", { data: wire });
    expect(result).toMatchObject({ imported: 2, skipped: 0, files: 1, types: 1 });
    const list = await b.op("code/presets/list", { path: f });
    expect(list.presets.map((p: any) => `${p.scope}:${p.name}:${p.kind}:${p.cwd}:${p.command}`)).toEqual(["file:Run:run:file:bun run {file}", "ext:Build:build:root:make"]);
    expect(list.presets[0].id).not.toBe((await a.op("code/presets/list", { path: f })).presets[0].id);
    expect(list.presets.find((p: any) => p.name === "Build").id).toBe(list.defaultBuild);
    // importing the same file again adds nothing
    expect(await b.op("code/presets/import", { data: wire })).toMatchObject({ imported: 0, skipped: 2 });
    expect((await b.op("code/presets/list", { path: f })).presets).toHaveLength(2);
    // replace mode
    await b.op("code/presets/save", { path: join(b.work, "keep.ts"), scope: "file", preset: preset("Gone") });
    await b.op("code/presets/import", { data: wire, mode: "replace" });
    expect((await b.op("code/presets/list", { path: join(b.work, "keep.ts") })).presets.map((p: any) => p.name)).toEqual(["Build"]);
  });

  test("bad imports: not a presets file, nothing usable, hostile content", async () => {
    const { work, op } = sandbox();
    await rejects(op("code/presets/import", { data: "x" }), "BAD_FILE");
    await rejects(op("code/presets/import", { data: [] }), "BAD_FILE");
    await rejects(op("code/presets/import", {}), "BAD_FILE");
    await rejects(op("code/presets/import", { data: { format: "something-else", files: {} } }), "BAD_FILE");
    await rejects(op("code/presets/import", { data: { files: {} } }), "EMPTY");
    await rejects(op("code/presets/import", { data: { files: { [join(work, "a.ts")]: { presets: [{ name: "x", command: "a\nb" }] } } } }), "EMPTY");
    await rejects(op("code/presets/import", { data: { files: { "relative.ts": { presets: [{ name: "x", command: "x" }] } } } }), "EMPTY");
    const r = await op("code/presets/import", { data: { files: { [join(work, "a.ts")]: { presets: [{ name: "ok", command: "echo ok", id: "../../etc/passwd" }, { name: "evil", command: "echo $(rm -rf ~)\r" }, { name: "x".repeat(99), command: "x" }] } } } });
    expect(r).toMatchObject({ imported: 1 });
    expect(r.skipped).toBeGreaterThanOrEqual(2);
    const list = await op("code/presets/list", { path: join(work, "a.ts") });
    expect(list.presets).toHaveLength(1);
    expect(list.presets[0].id).toMatch(/^p[0-9a-f]{10}$/);
  });

  test("the nearest project folder is found by its marker files", async () => {
    const { work, op } = sandbox();
    mkdirSync(join(work, "proj", "src", "deep"), { recursive: true });
    mkdirSync(join(work, "lone"), { recursive: true });
    writeFileSync(join(work, "proj", "package.json"), "{}");
    writeFileSync(join(work, "proj", "src", "deep", "a.ts"), "");
    expect(await op("code/root", { path: join(work, "proj", "src", "deep", "a.ts") })).toEqual({ root: join(work, "proj") });
    mkdirSync(join(work, "proj", "src", "deep", ".git"));
    expect((await op("code/root", { path: join(work, "proj", "src", "deep", "a.ts") })).root).toBe(join(work, "proj", "src", "deep"));
    for (const marker of ["Cargo.toml", "go.mod", "pyproject.toml", "Makefile"]) {
      mkdirSync(join(work, `m-${marker}`));
      writeFileSync(join(work, `m-${marker}`, marker), "");
      expect((await op("code/root", { path: join(work, `m-${marker}`, "x.txt") })).root).toBe(join(work, `m-${marker}`));
    }
    await rejects(op("code/root", { path: "rel" }), "BAD_PATH");
  });

  test("presets are only stored: the server has no operation that runs anything", () => {
    for (const name of Object.keys(codeOperations)) expect(name).not.toMatch(/(^|\/)(run|exec|execute|spawn|shell)$/);
  });
});
