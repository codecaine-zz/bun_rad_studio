import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { countText } from "../src/features/filemanager/fmDevCount";
import { HEAVY_FOLDERS } from "../src/features/filemanager/fmDevDisk";
import { detectEnvironment, parseToolVersion } from "../src/features/filemanager/fmDevEnv";
import { toCsv, toMarkdown } from "../src/features/filemanager/fmDevExport";
import { stripCredentials } from "../src/features/filemanager/fmDevGit";
import { isIgnored, parseIgnoreLines, ignoreSetFromText } from "../src/features/filemanager/fmDevIgnore";
import { cancelDevJob, pollDevJob, setProgress, startDevJob } from "../src/features/filemanager/fmDevJobs";
import { LANGUAGES, languageByName, languageForName, languageForShebang } from "../src/features/filemanager/fmDevLangs";
import { detectLicense, parseTomlLite } from "../src/features/filemanager/fmDevManifest";
import { projectInfo } from "../src/features/filemanager/fmDevProject";
import { countFolder, parseStatsOptions } from "../src/features/filemanager/fmDevScan";
import { diffLanguages, validateSnapshot } from "../src/features/filemanager/fmDevStore";
import { findMarkers } from "../src/features/filemanager/fmDevTodo";
import { detectTokei, parseTokeiJson, tokeiArgs } from "../src/features/filemanager/fmDevTokei";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-dev-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const TOKEN = "dev-token-1";
const tokei = await detectTokei(createContext({ home, dataDir }));
if (!tokei.installed) console.log("SKIPPED the tokei parity tests: tokei is not installed here (brew install tokei or cargo install tokei).");
let server: ReturnType<typeof startFileManagerServer>;
let base: string;

const lang = (name: string) => languageByName(name)!;
const count = (text: string, name: string, docs = true) => {
  const c = countText(text, lang(name), docs);
  return `${c.code}/${c.comments}/${c.blanks}`;
};
const write = (path: string, text: string | Buffer) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(op: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}

/** Starts a job through the API and waits for it to finish. */
async function job(op: string, body: Record<string, unknown>) {
  const started = await api(op, body);
  expect(started.status, JSON.stringify(started.json)).toBe(200);
  let since = 0;
  for (let i = 0; i < 600; i++) {
    const p = await api("dev/job/poll", { id: started.json.id, since });
    since = p.json.seq;
    if (p.json.state !== "running") return { id: started.json.id as string, ...p.json };
    await wait(25);
  }
  throw new Error("The job never finished.");
}

const stats = (dir: string, extra: Record<string, unknown> = {}) => job("dev/stats/start", { root: dir, engine: "builtin", ...extra });

beforeAll(() => {
  mkdirSync(home, { recursive: true });
  server = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir } });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the language table", () => {
  test("has more than 60 languages, with unique names and sensible entries", () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(60);
    const names = LANGUAGES.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    for (const l of LANGUAGES) {
      expect(l.exts.length + (l.files?.length ?? 0), l.name).toBeGreaterThan(0);
      for (const e of l.exts) expect(e, l.name).toBe(e.toLowerCase());
      expect(l.literate || l.line?.length || l.block?.length || ["JSON", "Assembly"].includes(l.name) || l.quotes?.length || l.embeds, l.name).toBeTruthy();
    }
    for (const n of ["Rust", "TypeScript", "JavaScript", "Python", "Go", "C", "C++", "Java", "Kotlin", "Swift", "Ruby", "PHP", "Lua", "Shell", "Markdown", "HTML", "CSS", "JSON", "YAML", "TOML", "SQL", "Haskell", "Zig", "Dart", "V"]) expect(languageByName(n), n).toBeTruthy();
  });

  test("V (vlang) is there: .v, .vv and .vsh, // comments and nested /* */", () => {
    const v = lang("V");
    expect(v.exts).toEqual(expect.arrayContaining(["v", "vv", "vsh"]));
    expect(v.line).toEqual(["//"]);
    expect(v.block).toEqual([["/*", "*/"]]);
    expect(v.nested).toBe(true);
    for (const f of ["main.v", "x.vv", "build.vsh", "MAIN.V"]) expect(languageForName(f)?.name, f).toBe("V");
  });

  test("files are recognized by name, extension and first line", () => {
    expect(languageForName("Makefile")?.name).toBe("Makefile");
    expect(languageForName("Dockerfile")?.name).toBe("Dockerfile");
    expect(languageForName("Dockerfile.dev")?.name).toBe("Dockerfile");
    expect(languageForName("CMakeLists.txt")?.name).toBe("CMake");
    expect(languageForName("Gemfile")?.name).toBe("Ruby");
    expect(languageForName("a.d.ts")?.name).toBe("TypeScript");
    expect(languageForName("README")).toBeNull();
    expect(languageForName("photo.png")).toBeNull();
    expect(languageForShebang("#!/usr/bin/env python3")?.name).toBe("Python");
    expect(languageForShebang("#!/usr/bin/env -S bash -e")?.name).toBe("BASH");
    expect(languageForShebang("#!/bin/sh")?.name).toBe("Shell");
    expect(languageForShebang("#!/usr/local/bin/node")?.name).toBe("JavaScript");
    expect(languageForShebang("#!/usr/bin/python3.11")?.name).toBe("Python");
    expect(languageForShebang("#!/bin/unknownthing")).toBeNull();
    expect(languageForShebang("echo hi")).toBeNull();
  });
});

describe("counting lines (the built-in counter)", () => {
  test("code, comment and blank lines; code with a trailing comment is code", () => {
    expect(count("// a\nint x = 1; // b\n\n/* c */\nint y;\n", "C")).toBe("2/2/1");
    expect(count("", "C")).toBe("0/0/0");
    expect(count("x", "C")).toBe("1/0/0");
    expect(count("a\r\n\r\n// c\r\n", "C")).toBe("1/1/1");
  });

  test("a comment marker inside a string is not a comment", () => {
    expect(count('let u = "http://example.com"; \nlet v = \'/* nope */\';\n', "JavaScript")).toBe("2/0/0");
    expect(count('const re = "\\" // still string";\n// real\n', "TypeScript")).toBe("1/1/0");
    expect(count("let s = \"// not\";\n// c\n", "Rust")).toBe("1/1/0");
  });

  test("block comments nest in Rust, V, Haskell, Kotlin and OCaml, but not in C", () => {
    const nested = "/* a /* b */ still comment */\ncode\n";
    expect(count(nested, "Rust")).toBe("1/1/0");
    expect(count(nested, "V")).toBe("1/1/0");
    expect(count(nested, "Kotlin")).toBe("1/1/0");
    expect(count(nested, "C")).toBe("2/0/0"); // the first */ ends the comment, so "still comment */" is code
    expect(count("{- a {- b -} c -}\nx = 1\n", "Haskell")).toBe("1/1/0");
    expect(count("(* a (* b *) c *)\nlet x = 1\n", "OCaml")).toBe("1/1/0");
  });

  test("V: // and /* */ comments, strings, raw strings, nested comments over several lines", () => {
    const v = "module main\n\n// entry\nfn main() {\n\t/* outer\n\t/* inner */\n\tstill outer */\n\tprintln('// not a comment')\n\ts := r'/* raw */'\n}\n";
    expect(count(v, "V")).toBe("5/4/1");
  });

  test("a blank line inside a block comment is a comment, inside a multi-line string it is code (like tokei)", () => {
    expect(count("/* a\n\nb */\n\ncode\n", "C")).toBe("1/3/1");
    expect(count("const a = `x\n\ny`;\n", "JavaScript")).toBe("3/0/0");
  });

  test("a block comment that ends with code after it is a code line", () => {
    expect(count("/* a\nb */ x = 1;\n", "C")).toBe("1/1/0");
    expect(count("int a; /* start\nend */\n", "C")).toBe("1/1/0");
  });

  test("Python docstrings follow the 'doc comments' switch; # inside a string is code", () => {
    const py = '"""Module doc\n\nmore"""\nx = "a # b"  # c\n# only\ndef f():\n    """one"""\n    return 1\n';
    expect(count(py, "Python", true)).toBe("3/5/0");
    expect(count(py, "Python", false)).toBe("7/1/0");
    expect(count("x = '''a\nb'''\n", "Python", false)).toBe("2/0/0");
  });

  test("Rust doc comments count as comments by default and as code when switched off", () => {
    const rs = "//! crate\n/// doc\nfn a() {}\n/** block */\n// plain\n//// four slashes\n";
    expect(count(rs, "Rust", true)).toBe("1/5/0");
    expect(count(rs, "Rust", false)).toBe("4/2/0");
  });

  test("character literals don't open strings in C and Rust, and a lifetime is not a char", () => {
    expect(count("char q = '\"'; // c\nint x;\n", "C")).toBe("2/0/0");
    expect(count("let q = '\"';\nfn f<'a>(x: &'a str) {}\n", "Rust")).toBe("2/0/0");
  });

  test("shell: # starts a comment only at a word start; $# and a#b are code", () => {
    expect(count('echo $#\n# c\necho "a # b"\nx=1 # t\necho a#b\n', "Shell")).toBe("4/1/0");
  });

  test("other comment styles: Lua, SQL, HTML, CSS, Ruby =begin", () => {
    expect(count("--[[ a\nb ]]\nlocal x = 1 -- c\n--  d\n", "Lua")).toBe("1/3/0");
    expect(count("select 1; -- c\n/* x */\n", "SQL")).toBe("1/1/0");
    expect(count("<!-- a -->\n<div>\n<!--\nb\n-->\n</div>\n", "HTML")).toBe("2/4/0");
    expect(count("a{}\n/* c */\n", "CSS")).toBe("1/1/0");
    expect(count("x = 1\n=begin\nnotes\n=end\ny = 2\n", "Ruby")).toBe("2/3/0");
  });

  test("Markdown and plain text count prose as comments; fenced code counts under its own language", () => {
    const md = '# Title\n\ntext\n\n```json\n{ "a": 1 }\n```\n\n```unknownlang\nzzz\n```\n';
    const c = countText(md, lang("Markdown"));
    expect([c.code, c.comments, c.blanks]).toEqual([0, 7, 3]);
    expect(c.children?.JSON).toMatchObject({ code: 1, comments: 0, blanks: 0 });
    expect(count("one\n\ntwo\n", "Plain Text")).toBe("0/2/1");
  });

  test("HTML reports the JavaScript and CSS inside script and style tags separately", () => {
    const html = '<html>\n<script src="a.js"></script>\n<script>\nlet a = 1;\n\n// c\n</script>\n<style>\na { color: red }\n</style>\n<!-- <script> -->\n</html>\n';
    const c = countText(html, lang("HTML"));
    expect([c.code, c.comments, c.blanks]).toEqual([7, 1, 0]);
    expect(c.children?.JavaScript).toMatchObject({ code: 1, comments: 1, blanks: 1 });
    expect(c.children?.CSS).toMatchObject({ code: 1 });
  });
});

describe("ignore rules (.gitignore syntax)", () => {
  const set = (text: string) => [ignoreSetFromText("/p", text)];
  test("patterns, anchors, folders only, wildcards, ** and negation", () => {
    const rules = set("*.log\nbuild/\n/root.txt\ndocs/**/*.tmp\n!keep.log\nsrc/gen?.js\n[ab].txt\n# comment\n\n");
    expect(isIgnored(rules, "/p/x.log", false)).toBe(true);
    expect(isIgnored(rules, "/p/sub/x.log", false)).toBe(true);
    expect(isIgnored(rules, "/p/keep.log", false)).toBe(false);
    expect(isIgnored(rules, "/p/sub/keep.log", false)).toBe(false);
    expect(isIgnored(rules, "/p/build", true)).toBe(true);
    expect(isIgnored(rules, "/p/build", false)).toBe(false); // a file named build is not the folder
    expect(isIgnored(rules, "/p/root.txt", false)).toBe(true);
    expect(isIgnored(rules, "/p/sub/root.txt", false)).toBe(false);
    expect(isIgnored(rules, "/p/docs/a/b/c.tmp", false)).toBe(true);
    expect(isIgnored(rules, "/p/docs/c.tmp", false)).toBe(true);
    expect(isIgnored(rules, "/p/other/c.tmp", false)).toBe(false);
    expect(isIgnored(rules, "/p/src/gen1.js", false)).toBe(true);
    expect(isIgnored(rules, "/p/src/gen12.js", false)).toBe(false);
    expect(isIgnored(rules, "/p/a.txt", false)).toBe(true);
    expect(isIgnored(rules, "/p/c.txt", false)).toBe(false);
    expect(isIgnored(rules, "/elsewhere/x.log", false)).toBe(false);
  });
  test("bad and oversized lines are skipped, escapes work", () => {
    expect(parseIgnoreLines(["[", "\\#hash", "\\!bang", "x".repeat(600), "ok"]).length).toBeGreaterThanOrEqual(3);
    expect(isIgnored(set("\\#file\n"), "/p/#file", false)).toBe(true);
  });
});

describe("counting a folder", () => {
  const dir = join(root, "count");
  const opts = (extra: Record<string, unknown> = {}) => parseStatsOptions({ engine: "builtin", ...extra });
  const run = async (extra: Record<string, unknown> = {}, at = dir) => (await countFolder(at, opts(extra), { cancelled: false })).result;
  const names = async (extra: Record<string, unknown> = {}, at = dir) => {
    const { files } = await countFolder(at, opts(extra), { cancelled: false });
    return files.map((f) => f.path).sort();
  };

  beforeAll(() => {
    write(join(dir, "src", "a.js"), "let a = 1;\n// c\n");
    write(join(dir, "src", "b.ts"), "export const b = 2;\n");
    write(join(dir, "main.v"), "fn main() {\n\t// hi\n}\n");
    write(join(dir, "run"), "#!/usr/bin/env python3\nprint(1)\n# c\n");
    write(join(dir, "notes"), "no extension, no shebang\n");
    write(join(dir, "README.md"), "# hi\n");
    write(join(dir, "image.js"), Buffer.from([0x61, 0x62, 0, 0x63, 0x0a]));
    write(join(dir, "data.bin"), "x");
    write(join(dir, ".gitignore"), "*.log\nbuild/\n/top.js\n!keep.log\nignored_dir\n");
    write(join(dir, "top.js"), "ignored by anchor\n");
    write(join(dir, "src", "top.js"), "not ignored (anchored rule)\n");
    write(join(dir, "x.log"), "var x;\n");
    write(join(dir, "keep.log"), "var y;\n");
    write(join(dir, "logs.js"), "var z;\n");
    write(join(dir, "build", "out.js"), "var out;\n");
    write(join(dir, "ignored_dir", "i.js"), "var i;\n");
    write(join(dir, "pkg", ".gitignore"), "local.js\n");
    write(join(dir, "pkg", "local.js"), "var l;\n");
    write(join(dir, "pkg", "keepme.js"), "var k;\n");
    write(join(dir, ".hidden", "h.js"), "var h;\n");
    write(join(dir, ".secret.js"), "var s;\n");
    write(join(dir, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
    write(join(dir, "dist", "bundle.js"), "var b;\n");
    write(join(dir, "docs", "min.min.js"), "var m;\n");
    mkdirSync(join(root, "outside"), { recursive: true });
    write(join(root, "outside", "secret.js"), "var leaked = 1;\nvar leaked2 = 2;\n");
    symlinkSync(join(root, "outside"), join(dir, "linkdir"));
    symlinkSync(join(root, "outside", "secret.js"), join(dir, "linkfile.js"));
  });

  test("counts the right files and skips what it should (default options)", async () => {
    expect(await names()).toEqual(["README.md", "docs/min.min.js", "logs.js", "main.v", "pkg/keepme.js", "run", "src/a.js", "src/b.ts", "src/top.js"].sort());
    const r = await run();
    expect(r.skipped.binary).toBe(1);
    expect(r.skipped.symlinks).toBe(2);
    expect(r.skipped.unknown).toBeGreaterThanOrEqual(2); // "notes" and "data.bin"
    expect(r.skipped.vendored).toBeGreaterThanOrEqual(2); // node_modules and dist
    expect(r.languages.map((l) => l.name)).toEqual(expect.arrayContaining(["JavaScript", "TypeScript", "V", "Python", "Markdown"]));
    const v = r.languages.find((l) => l.name === "V")!;
    expect([v.files, v.code, v.comments]).toEqual([1, 2, 1]);
    const py = r.languages.find((l) => l.name === "Python")!;
    expect([py.files, py.code, py.comments]).toEqual([1, 1, 2]); // found by its #! line, which is a comment too
  });

  test("never follows a symbolic link out of the folder", async () => {
    const { files } = await countFolder(dir, opts({ hidden: true, vendored: true, respectGitignore: false }), { cancelled: false });
    expect(files.some((f) => f.path.startsWith("linkdir") || f.path === "linkfile.js")).toBe(false);
    expect(JSON.stringify(files)).not.toContain("leaked");
  });

  test(".gitignore: wildcard, folder, anchored, negation, nested file — and the switch turns it off", async () => {
    const list = await names();
    expect(list).not.toContain("x.log");
    expect(list).not.toContain("build/out.js");
    expect(list).not.toContain("ignored_dir/i.js");
    expect(list).not.toContain("pkg/local.js");
    expect(list).not.toContain("top.js");
    expect(list).toContain("src/top.js");
    const off = await names({ respectGitignore: false, vendored: true });
    expect(off).toEqual(expect.arrayContaining(["top.js", "build/out.js", "ignored_dir/i.js", "pkg/local.js"]));
  });

  test("a negation re-includes a file an earlier rule ignored", async () => {
    const d = join(root, "negate");
    write(join(d, ".gitignore"), "*.js\n!keep.js\n");
    write(join(d, "a.js"), "var a;\n");
    write(join(d, "keep.js"), "var k;\n");
    write(join(d, "sub", "keep.js"), "var k2;\n");
    expect(await names({}, d)).toEqual(["keep.js", "sub/keep.js"]);
  });

  test("hidden files and vendored folders are opt-in", async () => {
    expect(await names()).not.toContain(".secret.js");
    expect(await names({ hidden: true })).toEqual(expect.arrayContaining([".secret.js", ".hidden/h.js"]));
    expect(await names()).not.toContain("node_modules/dep/index.js");
    expect(await names({ vendored: true })).toEqual(expect.arrayContaining(["node_modules/dep/index.js", "dist/bundle.js"]));
  });

  test("exclude patterns", async () => {
    const list = await names({ excludes: ["*.min.js", "src/"] });
    expect(list).not.toContain("docs/min.min.js");
    expect(list.some((p) => p.startsWith("src/"))).toBe(false);
    expect(list).toContain("pkg/keepme.js");
  });

  test("a sub-folder of a repository still honours the repository's .gitignore", async () => {
    const repo = join(root, "repo");
    write(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    write(join(repo, ".gitignore"), "generated/\n*.tmp.js\n");
    write(join(repo, "app", "keep.js"), "var a;\n");
    write(join(repo, "app", "generated", "g.js"), "var g;\n");
    write(join(repo, "app", "x.tmp.js"), "var t;\n");
    expect(await names({}, join(repo, "app"))).toEqual(["keep.js"]);
  });

  test("a file over the size limit is skipped and reported, not read", async () => {
    const big = join(root, "bigfile");
    write(join(big, "huge.js"), Buffer.alloc(9 * 1024 * 1024, "a\n"));
    write(join(big, "small.js"), "var a;\n");
    const r = await run({}, big);
    expect(r.skipped.tooBig).toBe(1);
    expect(r.totals.files).toBe(1);
  });

  test("limits: files, folders and cancelling stop the walk and say so", async () => {
    const many = join(root, "many");
    for (let i = 0; i < 12; i++) write(join(many, `d${i % 4}`, `f${i}.js`), "var a;\n");
    const byFiles = await run({ maxFiles: 5 }, many);
    expect(byFiles.stoppedBy).toBe("files");
    expect(byFiles.totals.files).toBe(5);
    const byDirs = await run({ maxDirs: 2 }, many);
    expect(byDirs.stoppedBy).toBe("folders");
    expect(byDirs.totals.files).toBeLessThan(12);
    const cancelled = await countFolder(many, opts(), { cancelled: true });
    expect(cancelled.result.totals.files).toBe(0);
  });
});

describe("tokei", () => {
  test("its JSON is read defensively", () => {
    const parsed = parseTokeiJson(JSON.stringify({
      Rust: { blanks: 1, code: 3, comments: 2, reports: [{ name: "./a.rs", stats: { blanks: 1, code: 3, comments: 2, blobs: {} } }, { name: 5 }, null], children: {} },
      HTML: { code: 4, comments: "x", blanks: -3, reports: [{ name: "./b/c.html", stats: { code: 1, comments: 0, blanks: 0, blobs: { CSS: { code: 2, comments: 0, blanks: 1 } } } }], children: { JavaScript: [{ stats: { code: 5, comments: 1, blanks: 0 } }] } },
      Total: { code: 999 },
    }));
    const rust = parsed.languages.find((l) => l.name === "Rust")!;
    expect([rust.files, rust.code, rust.comments, rust.blanks, rust.lines]).toEqual([1, 3, 2, 1, 6]);
    const html = parsed.languages.find((l) => l.name === "HTML")!;
    expect([html.code, html.comments, html.blanks]).toEqual([4, 0, 0]); // bad numbers count as 0
    expect(parsed.languages.find((l) => l.name === "JavaScript")).toMatchObject({ files: 0, code: 5, comments: 1 });
    expect(parsed.files.find((f) => f.path === "b/c.html")).toMatchObject({ language: "HTML", code: 3, blanks: 1 });
    expect(() => parseTokeiJson("not json")).toThrow();
    expect(() => parseTokeiJson("[1,2]")).toThrow();
  });

  test("arguments are separate values (no shell), and patterns can't be mistaken for options", () => {
    const args = tokeiArgs({ respectGitignore: false, hidden: true, vendored: false, excludes: ["--evil", "a b; rm -rf ~"] });
    expect(args).toEqual(expect.arrayContaining(["--output", "json", "--hidden", "--no-ignore", "--exclude=--evil", "--exclude=a b; rm -rf ~", "--exclude=node_modules", "--exclude=.git", "."]));
    expect(args.at(-1)).toBe(".");
    expect(tokeiArgs({ respectGitignore: true, hidden: false, vendored: true, excludes: [] })).toEqual(["--output", "json", "."]);
  });

  test("when tokei is not installed the API says so and the built-in counter does the work", async () => {
    const bare = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "data2"), toolDirs: [join(root, "no-tools")] } });
    try {
      const call = async (op: string, body: Record<string, unknown>) => (await (await fetch(`http://127.0.0.1:${bare.port}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) })).json()) as any;
      const meta = await call("dev/meta", {});
      expect(meta.tokei.installed).toBe(false);
      expect(meta.installHint).toContain("brew install tokei");
      expect(meta.installHint).toContain("cargo install tokei");
      const dirOk = join(root, "count");
      const forced = await call("dev/stats/start", { root: dirOk, engine: "tokei" });
      let p: any;
      do { await wait(20); p = await call("dev/job/poll", { id: forced.id, since: 0 }); } while (p.state === "running");
      expect(p.state).toBe("failed");
      expect(p.error.code).toBe("TOKEI_MISSING");
      const auto = await call("dev/stats/start", { root: dirOk });
      do { await wait(20); p = await call("dev/job/poll", { id: auto.id, since: 0 }); } while (p.state === "running");
      expect(p.state).toBe("done");
      expect(p.result.engine).toBe("builtin");
      expect(p.result.engineLabel).toBe("Built-in counter");
      expect(p.result.notes.join(" ")).toContain("brew install tokei");
    } finally {
      bare.stop(true);
    }
  });

  describe.skipIf(!tokei.installed)("parity with the real tokei binary", () => {
    const dir = join(root, "parity");
    beforeAll(() => {
      write(join(dir, "a.rs"), "fn main() {\n    /* a /* nested */ b */\n    let s = \"// not a comment\";\n    let r = r#\"/* raw */\"#;\n    let q = 'x';\n    // c\n}\n\n");
      write(join(dir, "b.ts"), "export const t = `line1\n\nline3 // inside`;\n/* block\n\nstill */\nconst u = 'x'; // trailing\n\n");
      write(join(dir, "c.py"), "# comment\nx = '# not'\n\ndef f():\n    return 1  # t\n");
      write(join(dir, "d.sh"), '#!/bin/sh\n# c\necho $#\necho a # b\n\nx="#"\n');
      write(join(dir, "e.c"), "#include <stdio.h>\n/* c */\nint main() { return 0; } // t\nchar q = 'x';\n\n");
      write(join(dir, "f.css"), "/* c */\na { color: red; }\n\nb {\n  margin: 0;\n}\n");
      write(join(dir, "g.json"), '{\n  "a": "// not",\n  "b": [1, 2]\n}\n');
      write(join(dir, "h.go"), "package main\n\n// c\nfunc main() {\n\ts := `raw // x`\n\t_ = s\n}\n");
      write(join(dir, "i.yaml"), "# c\nkey: value # t\nlist:\n  - a\n\n");
      write(join(dir, "j.toml"), '# c\n[package]\nname = "x" # t\n');
      write(join(dir, "k.sql"), "-- c\nselect 1;\n/* b */\n\n");
      write(join(dir, "l.rb"), "# c\nputs 'a'\n\nclass A\nend\n");
      write(join(dir, "m.lua"), "-- c\n--[[ a\nb ]]\nprint(1)\n");
      write(join(dir, "n.hs"), "-- c\n{- a {- b -} c -}\nmain = print 1\n");
      write(join(dir, "o.md"), "# Title\n\ntext\n");
    });

    test("both engines give the same totals on a fixture of ordinary code (within a small tolerance)", async () => {
      const t = await stats(dir, { engine: "tokei" });
      const b = await stats(dir, { engine: "builtin" });
      expect(t.result.engine).toBe("tokei");
      expect(t.result.engineLabel).toMatch(/^tokei \d/);
      expect(b.result.engine).toBe("builtin");
      for (const row of t.result.languages) {
        const mine = b.result.languages.find((l: any) => l.name === row.name);
        expect(mine, `built-in has ${row.name}`).toBeTruthy();
        expect([mine.files, mine.code, mine.comments, mine.blanks], `${row.name}: tokei [files, code, comments, blanks] vs built-in`).toEqual([row.files, row.code, row.comments, row.blanks]);
      }
      const tol = (x: number, y: number) => Math.abs(x - y) <= Math.max(1, Math.round(0.02 * Math.max(x, y)));
      for (const key of ["files", "code", "comments", "blanks", "lines"] as const) expect(tol(t.result.totals[key], b.result.totals[key]), `${key}: tokei ${t.result.totals[key]} vs built-in ${b.result.totals[key]}`).toBe(true);
    });

    test("tokei honours the same switches (hidden, .gitignore, vendored, excludes)", async () => {
      const d = join(root, "parity2");
      write(join(d, ".git", "HEAD"), "ref: refs/heads/main\n"); // tokei only reads .gitignore inside a Git repository
      write(join(d, ".gitignore"), "ign.js\n");
      write(join(d, "a.js"), "var a;\n");
      write(join(d, "ign.js"), "var i;\n");
      write(join(d, ".h.js"), "var h;\n");
      write(join(d, "node_modules", "n.js"), "var n;\n");
      write(join(d, "skip.min.js"), "var m;\n");
      const files = async (engine: string, extra: Record<string, unknown> = {}) => {
        const done = await stats(d, { engine, ...extra });
        const list = await api("dev/stats/files", { id: done.id, limit: 100 });
        return list.json.rows.map((r: any) => r.path).sort();
      };
      for (const extra of [{}, { hidden: true }, { respectGitignore: false }, { vendored: true }, { excludes: ["*.min.js"] }]) {
        expect(await files("tokei", extra), JSON.stringify(extra)).toEqual(await files("builtin", extra));
      }
    });
  });
});

describe("running it on a real tree gives plausible numbers", () => {
  test("this repository's own File Manager server code has TypeScript and a sensible total", async () => {
    const r = await stats(join(import.meta.dir, "..", "src", "features", "filemanager"));
    const ts = r.result.languages.find((l: any) => l.name === "TypeScript");
    expect(ts.files).toBeGreaterThan(40);
    expect(r.result.totals.code).toBeGreaterThan(5000);
    expect(r.result.totals.lines).toBe(r.result.totals.code + r.result.totals.comments + r.result.totals.blanks);
  });
});

describe("stats through the API: jobs, drill-down, sort, export, snapshots", () => {
  const dir = join(root, "api-stats");
  let jobId = "";
  beforeAll(async () => {
    write(join(dir, "a.js"), "let a = 1;\n// c\n\nlet b;\n");
    write(join(dir, "b.js"), "let c;\n");
    write(join(dir, "sub", "c.ts"), 'const x: number = 1;\n// =danger,"quoted"\n');
    write(join(dir, "=evil.rs"), "fn main() {}\n");
    jobId = (await stats(dir)).id;
  });

  test("the summary has languages, totals and which engine produced them", async () => {
    const p = await api("dev/job/poll", { id: jobId, since: 0 });
    const r = p.json.result;
    expect(p.json.state).toBe("done");
    expect(r.engine).toBe("builtin");
    expect(r.root).toBe(dir);
    expect(r.totals).toMatchObject({ files: 4, code: 5 });
    expect(r.languages[0].name).toBe("JavaScript");
    expect(r.fileCount).toBe(4);
  });

  test("the file table: by language, sorted, filtered and paged", async () => {
    const all = await api("dev/stats/files", { id: jobId, sort: "code", dir: "desc" });
    expect(all.json.total).toBe(4);
    expect(all.json.rows[0].path).toBe("a.js");
    const js = await api("dev/stats/files", { id: jobId, language: "JavaScript", sort: "path", dir: "asc" });
    expect(js.json.rows.map((r: any) => r.path)).toEqual(["a.js", "b.js"]);
    expect(js.json.rows[0]).toMatchObject({ code: 2, comments: 1, blanks: 1 });
    expect((await api("dev/stats/files", { id: jobId, filter: "SUB" })).json.rows.map((r: any) => r.path)).toEqual(["sub/c.ts"]);
    const paged = await api("dev/stats/files", { id: jobId, limit: 1, offset: 1, sort: "path", dir: "asc" });
    expect(paged.json.rows.length).toBe(1);
    expect(paged.json.total).toBe(4);
    expect((await api("dev/stats/files", { id: jobId, sort: "nonsense", limit: 9999 })).status).toBe(200);
    expect((await api("dev/stats/files", { id: "nope" })).json.error.code).toBe("NO_JOB");
  });

  test("export: CSV is quoted and spreadsheet-safe, Markdown is a table, JSON parses", async () => {
    const csv = (await api("dev/export", { id: jobId, format: "csv", scope: "languages" })).json.text as string;
    expect(csv.split("\r\n")[0]).toBe("Language,Files,Code,Comments,Blanks,Lines,Code %");
    expect(csv).toContain("Total,4,5,2,1,8,100");
    const files = (await api("dev/export", { id: jobId, format: "csv", scope: "files" })).json.text as string;
    expect(files).toContain("'=evil.rs"); // a leading = would run as a formula in a spreadsheet
    const md = (await api("dev/export", { id: jobId, format: "md", scope: "languages" })).json.text as string;
    expect(md.split("\n")[0]).toBe("| Language | Files | Code | Comments | Blanks | Lines | Code % |");
    expect(md.split("\n")[1]).toBe("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    const json = JSON.parse((await api("dev/export", { id: jobId, format: "json", scope: "languages" })).json.text);
    expect(json.rows.at(-1)).toMatchObject({ Language: "Total", Code: 5 });
    expect(json.engine).toBe("Built-in counter");
    expect((await api("dev/export", { id: jobId, format: "xml" })).json.error.code).toBe("BAD_FORMAT");
    expect((await api("dev/export", { id: jobId, format: "csv", scope: "weird" })).json.error.code).toBe("BAD_SCOPE");
  });

  test("the pure formatters", () => {
    expect(toCsv({ title: "t", columns: ["a", "b"], rows: [["x,y", 'q"r'], ["@sum", 1], ["-1", null]] })).toBe('a,b\r\n"x,y","q""r"\r\n\'@sum,1\r\n\'-1,\r\n');
    expect(toMarkdown({ title: "t", columns: ["n", "v"], rows: [["a|b", 1234]] })).toBe("| n | v |\n| --- | ---: |\n| a\\|b | 1,234 |\n");
  });

  test("saving an export writes a new file and never replaces an existing one", async () => {
    const first = await api("dev/export/save", { id: jobId, format: "csv", scope: "languages", folder: dir });
    expect(first.status).toBe(200);
    expect(first.json.name).toMatch(/^Code-statistics-\d{4}-\d\d-\d\d\.csv$/);
    const original = readFileSync(first.json.path, "utf8");
    writeFileSync(first.json.path, "MY OWN CONTENT");
    const second = await api("dev/export/save", { id: jobId, format: "csv", scope: "languages", folder: dir });
    expect(second.json.name).toMatch(/ \(2\)\.csv$/);
    expect(readFileSync(first.json.path, "utf8")).toBe("MY OWN CONTENT");
    expect(readFileSync(second.json.path, "utf8")).toBe(original);
    expect((await api("dev/export/save", { id: jobId, format: "csv", scope: "languages", folder: "/usr/bin" })).json.error.code).toBe("BAD_PATH");
    expect((await api("dev/export/save", { id: jobId, format: "csv", scope: "languages", folder: join(root, "outside") })).json.error.code).toBe("BAD_PATH");
    expect((await api("dev/export/save", { id: jobId, format: "csv", scope: "languages", folder: join(dir, "..", "api-stats-evil") })).json.error.code).toBe("BAD_PATH");
    expect((await api("dev/export/save", { id: jobId, format: "csv", scope: "languages", folder: join(dir, "missing") })).json.error.code).toBe("NOT_FOUND");
  });

  test("snapshots: save, list, compare, delete, and what is refused", async () => {
    expect((await api("dev/snapshot/save", { id: jobId, name: "   " })).json.error.code).toBe("BAD_NAME");
    const saved = await api("dev/snapshot/save", { id: jobId, name: "  Before\tthe  refactor \n" });
    expect(saved.json.snapshot.name).toBe("Before the refactor");
    expect(saved.json.snapshot.totals.code).toBe(5);
    expect(JSON.parse(readFileSync(join(dataDir, "file_manager_dev_snapshots.json"), "utf8")).snapshots.length).toBe(1);
    write(join(dir, "d.js"), "var d1;\nvar d2;\n");
    write(join(dir, "e.py"), "x = 1\n");
    rmSync(join(dir, "sub"), { recursive: true });
    const later = (await stats(dir)).id;
    const diff = await api("dev/snapshot/diff", { id: later, snapshotId: saved.json.snapshot.id });
    expect(diff.json.totals.delta).toMatchObject({ code: 2, files: 1 }); // +2 js +1 py −1 ts
    const row = (n: string) => diff.json.rows.find((r: any) => r.name === n);
    expect(row("JavaScript")).toMatchObject({ status: "changed", codeDelta: 2, filesDelta: 1 });
    expect(row("Python")).toMatchObject({ status: "added", codeDelta: 1 });
    expect(row("TypeScript")).toMatchObject({ status: "removed", codeDelta: -1 });
    expect(row("Rust")).toMatchObject({ status: "same", codeDelta: 0 });
    const list = await api("dev/snapshot/list", { root: dir });
    expect(list.json.snapshots[0]).toMatchObject({ name: "Before the refactor", sameFolder: true });
    const csv = (await api("dev/export", { id: later, format: "csv", scope: "diff", snapshotId: saved.json.snapshot.id })).json.text as string;
    expect(csv).toContain("Python,added");
    expect((await api("dev/snapshot/diff", { id: later, snapshotId: "ffffffffffff" })).json.error.code).toBe("NO_SNAPSHOT");
    expect((await api("dev/snapshot/delete", { snapshotId: saved.json.snapshot.id })).json.deleted).toBe(true);
    expect((await api("dev/snapshot/delete", { snapshotId: saved.json.snapshot.id })).json.deleted).toBe(false);
  });

  test("snapshots are capped at 50, and a damaged store file is ignored", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const s = await api("dev/snapshot/save", { id: jobId, name: `s${i}` });
      expect(s.status, `save ${i}`).toBe(200);
      ids.push(s.json.snapshot.id);
    }
    const over = await api("dev/snapshot/save", { id: jobId, name: "one too many" });
    expect(over.status).toBe(400);
    expect(over.json.error.code).toBe("TOO_MANY");
    for (const id of ids) await api("dev/snapshot/delete", { snapshotId: id });
    writeFileSync(join(dataDir, "file_manager_dev_snapshots.json"), '{"snapshots":[{"id":"zz"},{"id":"aabbccddeeff","name":"ok","root":"/x","createdAt":"2026-01-01T00:00:00Z","languages":[{"name":"C","files":1,"code":2,"comments":3,"blanks":4}]},5,null]}');
    const list = await api("dev/snapshot/list", {});
    expect(list.json.snapshots.map((s: any) => s.name)).toEqual(["ok"]);
    writeFileSync(join(dataDir, "file_manager_dev_snapshots.json"), "not json at all");
    expect((await api("dev/snapshot/list", {})).json.snapshots).toEqual([]);
    expect((await api("dev/snapshot/save", { id: jobId, name: "after damage" })).status).toBe(200);
  });

  test("snapshot validation and diff maths", () => {
    const good = { id: "aabbccddeeff", name: "n", root: "/x", createdAt: "2026-01-01T00:00:00Z", languages: [{ name: "C", files: 1, code: 2, comments: 3, blanks: 4 }] };
    expect(validateSnapshot(good)?.totals).toMatchObject({ code: 2, lines: 9 });
    expect(validateSnapshot({ ...good, id: "../etc" })).toBeNull();
    expect(validateSnapshot({ ...good, languages: [{ name: "C", files: -1, code: 2, comments: 3, blanks: 4 }] })).toBeNull();
    expect(validateSnapshot({ ...good, languages: [{ name: "C", files: 1, code: "2", comments: 3, blanks: 4 }] })).toBeNull();
    expect(validateSnapshot({ ...good, languages: Array.from({ length: 401 }, (_, i) => ({ name: `L${i}`, files: 0, code: 0, comments: 0, blanks: 0 })) })).toBeNull();
    expect(validateSnapshot({ ...good, createdAt: "yesterday-ish" })).toBeNull();
    const d = diffLanguages([{ name: "A", files: 1, code: 10, comments: 0, blanks: 0 }, { name: "B", files: 1, code: 5, comments: 0, blanks: 0 }], [{ name: "A", files: 2, code: 4, comments: 1, blanks: 0 }, { name: "C", files: 1, code: 1, comments: 0, blanks: 0 }]);
    expect(d.rows.map((r) => [r.name, r.status, r.codeDelta])).toEqual([["A", "changed", -6], ["B", "removed", -5], ["C", "added", 1]]);
    expect(d.totals.delta.code).toBe(-10);
  });
});

describe("jobs: progress polling and cancelling", () => {
  test("poll answers 'unchanged' until something changes; cancel is remembered; finished jobs hand over their result", async () => {
    const ctx = createContext({ home, dataDir });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const j = startDevJob(ctx, "stats", root, async (self) => {
      setProgress(self, { files: 1 });
      await gate;
      return { done: true, cancelled: self.cancelled };
    });
    const first = pollDevJob(ctx, { id: j.id, since: 0 });
    expect(first).toMatchObject({ state: "running", progress: { files: 1 } });
    expect(pollDevJob(ctx, { id: j.id, since: first.seq as number })).toMatchObject({ unchanged: true });
    setProgress(j, { files: 2 });
    expect(pollDevJob(ctx, { id: j.id, since: first.seq as number })).toMatchObject({ progress: { files: 2 } });
    expect(cancelDevJob(ctx, { id: j.id }).cancelled).toBe(true);
    release();
    await wait(20);
    const end = pollDevJob(ctx, { id: j.id, since: 0 });
    expect(end.state).toBe("cancelled");
    expect(end.result).toEqual({ done: true, cancelled: true });
    expect(() => pollDevJob(ctx, { id: "missing" })).toThrow();
  });

  test("at most three scans run at once; a failing job reports its error", async () => {
    const ctx = createContext({ home, dataDir });
    const never: Array<() => void> = [];
    for (let i = 0; i < 3; i++) startDevJob(ctx, "disk", root, () => new Promise<void>((r) => never.push(r)));
    expect(() => startDevJob(ctx, "disk", root, async () => 1)).toThrow(/already running/);
    never.forEach((r) => r());
    await wait(10);
    const bad = startDevJob(ctx, "todo", root, async () => { throw new Error("boom"); });
    await wait(10);
    expect(pollDevJob(ctx, { id: bad.id })).toMatchObject({ state: "failed", error: { message: "boom" } });
  });

  test("cancelling a real scan through the API stops it", async () => {
    const many = join(root, "cancel-me");
    for (let i = 0; i < 400; i++) write(join(many, `d${i % 40}`, `f${i}.ts`), `export const v${i} = ${i};\n`.repeat(200));
    const started = await api("dev/stats/start", { root: many, engine: "builtin" });
    await api("dev/job/cancel", { id: started.json.id });
    let p: any;
    do { await wait(15); p = (await api("dev/job/poll", { id: started.json.id, since: 0 })).json; } while (p.state === "running");
    expect(p.state).toBe("cancelled");
    expect(p.result.totals.files).toBeLessThan(400);
  });
});

describe("project overview", () => {
  const dir = (name: string) => join(root, "proj", name);
  const card = (info: Awaited<ReturnType<typeof projectInfo>>, id: string) => info.cards.find((c) => c.id === id);
  const fact = (c: any, key: string) => c?.facts.find((f: string[]) => f[0] === key)?.[1];

  test("Node / Bun: package, scripts, runner from the lockfile, workspaces, TypeScript, test runner", async () => {
    const d = dir("node");
    write(join(d, "package.json"), JSON.stringify({ name: "demo", version: "1.2.3", type: "module", scripts: { dev: "bun run src/index.ts", "test:unit": "bun test", "bad;name": "x", build: "tsc" }, workspaces: ["packages/*"], engines: { node: ">=20", bun: ">=1.1" }, dependencies: { a: "1", b: "2" }, devDependencies: { typescript: "5", vitest: "1" }, license: "MIT" }));
    write(join(d, "bun.lock"), "");
    write(join(d, "tsconfig.json"), '{ "compilerOptions": { "strict": true } }');
    const c = card(await projectInfo(d), "node")!;
    expect(c.title).toBe("Node / Bun");
    expect(c.runner).toBe("bun");
    expect(fact(c, "Package")).toBe("demo 1.2.3");
    expect(fact(c, "Dependencies")).toBe("2 packages");
    expect(fact(c, "Dev dependencies")).toBe("2 packages");
    expect(fact(c, "Lockfile")).toBe("bun");
    expect(fact(c, "TypeScript")).toBe("yes, strict");
    expect(fact(c, "Test runner")).toBe("vitest");
    expect(c.lists.find((l) => l.label === "Workspaces")?.items).toEqual(["packages/*"]);
    expect(c.scripts?.map((s) => s.name)).toEqual(["dev", "test:unit", "bad;name", "build"]);
  });

  test("a damaged package.json still gets a card, and an over-size manifest or a symlinked one is not read", async () => {
    const broken = dir("broken");
    write(join(broken, "package.json"), "{ not json");
    expect(card(await projectInfo(broken), "node")).toBeTruthy();
    const huge = dir("huge");
    write(join(huge, "package.json"), JSON.stringify({ name: "x".repeat(600 * 1024) }));
    expect(card(await projectInfo(huge), "node")).toBeUndefined();
    const linked = dir("linked");
    write(join(root, "outside", "package.json"), '{"name":"leaked-name"}');
    mkdirSync(linked, { recursive: true });
    symlinkSync(join(root, "outside", "package.json"), join(linked, "package.json"));
    expect(JSON.stringify(await projectInfo(linked))).not.toContain("leaked-name");
  });

  test("Rust, Go, V, PHP, Ruby, Swift, C/C++", async () => {
    const rust = dir("rust");
    write(join(rust, "Cargo.toml"), '[package]\nname = "crate"\nversion = "0.3.0"\nedition = "2021"\n# comment\n[dependencies]\nserde = "1"\ntokio = { version = "1", features = ["full"] }\n[dev-dependencies]\ncriterion = "0.5"\n[workspace]\nmembers = [\n  "a", # x\n  "b",\n]\n');
    const r = card(await projectInfo(rust), "rust")!;
    expect([fact(r, "Package"), fact(r, "Edition"), fact(r, "Dependencies"), fact(r, "Dev dependencies")]).toEqual(["crate 0.3.0", "2021", "2 crates", "1 crate"]);
    expect(r.lists[0]).toEqual({ label: "Workspace members", items: ["a", "b"] });
    const go = dir("go");
    write(join(go, "go.mod"), "module example.com/m\n\ngo 1.22\n\nrequire (\n\tgithub.com/a/b v1.0.0\n\tgithub.com/c/d v2.0.0 // indirect\n)\n");
    const g = card(await projectInfo(go), "go")!;
    expect([fact(g, "Module"), fact(g, "Go version"), fact(g, "Requirements")]).toEqual(["example.com/m", "1.22", "2 modules"]);
    const v = dir("v");
    write(join(v, "v.mod"), "Module {\n\tname: 'vproj'\n\tdescription: 'A V thing'\n\tversion: '0.2.0'\n\tdependencies: ['nedpals.args', 'x.y']\n}\n");
    const vc = card(await projectInfo(v), "v")!;
    expect([fact(vc, "Module"), fact(vc, "Version")]).toEqual(["vproj", "0.2.0"]);
    expect(vc.lists[0]!.items).toEqual(["nedpals.args", "x.y"]);
    const php = dir("php");
    write(join(php, "composer.json"), '{"name":"v/p","require":{"php":"^8.2","ext-json":"*","a/b":"1"},"require-dev":{"c/d":"1"}}');
    const p = card(await projectInfo(php), "php")!;
    expect([fact(p, "PHP"), fact(p, "Dependencies"), fact(p, "Dev dependencies")]).toEqual(["^8.2", "1 package", "1 package"]);
    const ruby = dir("ruby");
    write(join(ruby, "Gemfile"), "source 'https://rubygems.org'\nruby '3.3.0'\ngem 'rails'\ngem \"puma\"\n");
    const rb = card(await projectInfo(ruby), "ruby")!;
    expect([fact(rb, "Gems in Gemfile"), fact(rb, "Ruby")]).toEqual(["2", "3.3.0"]);
    const swift = dir("swift");
    write(join(swift, "Package.swift"), '// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "Sw", dependencies: [.package(url: "x", from: "1.0.0")])\n');
    const sw = card(await projectInfo(swift), "swift")!;
    expect([fact(sw, "Package"), fact(sw, "Swift tools"), fact(sw, "Dependencies")]).toEqual(["Sw", "5.9", "1 package"]);
    const c = dir("c");
    write(join(c, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.20)\nproject(Thing LANGUAGES CXX)\n");
    write(join(c, "Makefile"), "all: build\nbuild:\n\techo hi\n.PHONY: all\nVAR := 1\ntest:\n");
    const info = await projectInfo(c);
    expect([fact(card(info, "c"), "CMake project"), fact(card(info, "c"), "CMake minimum")]).toEqual(["Thing", "3.20"]);
    expect(card(info, "make")!.lists[0]!.items).toEqual(["all", "build", "test"]);
  });

  test("Python (pyproject, requirements, virtual environment), Java/Kotlin, .NET", async () => {
    const py = dir("py");
    write(join(py, "pyproject.toml"), '[project]\nname = "pkg"\nversion = "1.0"\nrequires-python = ">=3.10"\ndependencies = ["requests", "rich>=13"]\n[build-system]\nbuild-backend = "hatchling.build"\n[tool.ruff]\nline-length = 100\n[tool.pytest.ini_options]\n');
    write(join(py, "requirements.txt"), "# c\nrequests\n\n-r other.txt\nflask==2\n");
    write(join(py, ".venv", "pyvenv.cfg"), "home = /usr/bin\n");
    const p = card(await projectInfo(py), "python")!;
    expect([fact(p, "Project"), fact(p, "Python"), fact(p, "Dependencies"), fact(p, "requirements.txt"), fact(p, "Virtual environment"), fact(p, "Build backend")]).toEqual(["pkg 1.0", ">=3.10", "2 packages", "2 requirements", ".venv/", "hatchling.build"]);
    expect(p.lists[0]!.items).toEqual(expect.arrayContaining(["ruff"]));
    const jvm = dir("jvm");
    write(join(jvm, "pom.xml"), "<project><parent><groupId>p</groupId></parent><groupId>com.x</groupId><artifactId>app</artifactId><version>2.0</version><dependencies><dependency/><dependency/></dependencies></project>");
    expect(fact(card(await projectInfo(jvm), "jvm"), "Maven")).toBe("com.x:app:2.0");
    const gradle = dir("gradle");
    write(join(gradle, "build.gradle.kts"), 'plugins {\n  kotlin("jvm") version "1.9"\n  application\n}\n');
    write(join(gradle, "gradlew"), "#!/bin/sh\n");
    const gc = card(await projectInfo(gradle), "jvm")!;
    expect(gc.title).toBe("Java / Kotlin");
    expect(fact(gc, "Wrapper")).toBe("gradlew present");
    const net = dir("net");
    write(join(net, "App.sln"), "");
    write(join(net, "App.csproj"), "<Project><PropertyGroup><TargetFrameworks>net8.0;net6.0</TargetFrameworks></PropertyGroup></Project>");
    const n = card(await projectInfo(net), "dotnet")!;
    expect(fact(n, "Target frameworks")).toBe("net8.0, net6.0");
    expect(n.lists.map((l) => l.label)).toEqual(["Solutions", "Projects"]);
  });

  test("Docker, CI, editorconfig, CODEOWNERS, version pins — and .env files by name only", async () => {
    const d = dir("misc");
    write(join(d, "Dockerfile"), "FROM node:20 AS build\nFROM --platform=linux/amd64 nginx:1\n");
    write(join(d, "compose.yaml"), "services:\n  web:\n    image: x\n  db:\n    image: y\nvolumes: {}\n");
    write(join(d, ".github", "workflows", "ci.yml"), "name: CI pipeline\non: push\n");
    write(join(d, ".github", "workflows", "release.yaml"), "on: push\n");
    write(join(d, ".gitlab-ci.yml"), "stages: []\n");
    write(join(d, ".editorconfig"), "root = true\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ncharset = utf-8\n");
    write(join(d, ".github", "CODEOWNERS"), "# owners\n* @me\n/docs @you\n");
    write(join(d, ".nvmrc"), "20\n");
    write(join(d, ".env"), "API_KEY=SUPERSECRETVALUE123\n");
    write(join(d, ".env.local"), "TOKEN=ANOTHERSECRET456\n");
    write(join(d, "README.md"), "# readme\n");
    const info = await projectInfo(d);
    const docker = card(info, "docker")!;
    expect(docker.lists.find((l) => l.label === "Base images")?.items).toEqual(["node:20", "nginx:1"]);
    expect(docker.lists.find((l) => l.label === "Compose services")?.items).toEqual(["web", "db"]);
    const ci = card(info, "ci")!;
    expect(fact(ci, "Systems")).toBe("GitHub Actions, GitLab CI");
    expect(ci.lists[0]!.items).toEqual(["CI pipeline (ci.yml)", "release.yaml"]);
    const files = card(info, "files")!;
    expect(fact(files, ".editorconfig")).toBe("space, size 2, lf, utf-8");
    expect(fact(files, "CODEOWNERS")).toBe(".github/CODEOWNERS — 2 rules");
    expect(fact(files, "README")).toBe("README.md");
    expect(files.lists.find((l) => l.label.startsWith("Environment files"))?.items).toEqual([".env", ".env.local"]);
    expect(files.lists.find((l) => l.label === "Version pin files")?.items).toEqual([".nvmrc"]);
    const text = JSON.stringify(info);
    expect(text).not.toContain("SUPERSECRETVALUE123");
    expect(text).not.toContain("ANOTHERSECRET456");
  });

  test("license detection from the text", async () => {
    const samples: Record<string, string> = {
      MIT: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy",
      "Apache-2.0": "Apache License\nVersion 2.0, January 2004",
      "GPL-3.0": "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007",
      "GPL-2.0": "GNU GENERAL PUBLIC LICENSE\nVersion 2, June 1991",
      "AGPL-3.0": "GNU AFFERO GENERAL PUBLIC LICENSE Version 3",
      "LGPL-3.0": "GNU LESSER GENERAL PUBLIC LICENSE Version 3",
      "BSD-3-Clause": "Redistribution and use in source and binary forms, with or without modification, are permitted provided that ... Neither the name of the copyright holder nor",
      "BSD-2-Clause": "Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following two conditions are met",
      ISC: "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted",
      "MPL-2.0": "Mozilla Public License Version 2.0",
      Unlicense: "This is free and unencumbered software released into the public domain.",
    };
    for (const [name, text] of Object.entries(samples)) expect(detectLicense(text), name).toBe(name);
    expect(detectLicense("All rights reserved. Do not copy.")).toBeNull();
    const d = dir("lic");
    write(join(d, "LICENSE"), samples.MIT!);
    expect(fact(card(await projectInfo(d), "files"), "License file")).toBe("LICENSE — MIT");
  });

  test("TOML-lite: sections, strings, arrays that span lines, comments in strings", () => {
    const t = parseTomlLite('title = "a # not comment" # real\n[a.b]\nx = 1\narr = [\n "p", # c\n "q"\n]\nflag = true\n[[bin]]\nname = \'z\'\nbroken line\n=nokey\n');
    expect(t[""]!.title).toBe("a # not comment");
    expect(t["a.b"]).toEqual({ x: 1, arr: ["p", "q"], flag: true });
    expect(t.bin!.name).toBe("z");
  });
});

describe("git summary against a real repository", () => {
  const repo = join(root, "gitrepo");
  const envBefore: Record<string, string | undefined> = {};
  const gitEnv: Record<string, string> = {
    GIT_CONFIG_GLOBAL: join(root, "gitconfig-global"), GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Ada Lovelace", GIT_AUTHOR_EMAIL: "ada@example.com", GIT_COMMITTER_NAME: "Ada Lovelace", GIT_COMMITTER_EMAIL: "ada@example.com",
  };
  const git = (args: string[], extra: Record<string, string> = {}) => {
    const r = Bun.spawnSync(["git", ...args], { cwd: repo, env: { ...process.env, ...gitEnv, ...extra }, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
    return r.stdout.toString();
  };
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const gitAvailable = Bun.spawnSync(["git", "--version"]).exitCode === 0;

  beforeAll(() => {
    if (!gitAvailable) return;
    for (const [k, v] of Object.entries(gitEnv)) {
      envBefore[k] = process.env[k];
      process.env[k] = v;
    }
    writeFileSync(gitEnv.GIT_CONFIG_GLOBAL!, "");
    mkdirSync(repo, { recursive: true });
    git(["init", "-q", "-b", "main"]);
    const commit = (file: string, text: string, message: string, days: number, author = "Ada Lovelace") => {
      writeFileSync(join(repo, file), text);
      git(["add", file]);
      const when = daysAgo(days);
      git(["commit", "-q", "-m", message], { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when, GIT_AUTHOR_NAME: author, GIT_COMMITTER_NAME: author });
    };
    commit("a.txt", "one\n", "first", 400);
    commit("big.bin", "x".repeat(5000), "add a bigger file", 40, "Grace Hopper");
    commit("b.txt", "two\n", "second", 35);
    commit("c.txt", "three\n", "third: the last one", 2);
    git(["tag", "v1.0.0"]);
    git(["remote", "add", "origin", "https://octocat:ghp_SECRETTOKEN123@github.com/octo/demo.git"]);
    git(["remote", "add", "ssh", "git@github.com:octo/demo.git"]);
    writeFileSync(join(repo, "dirty.txt"), "untracked\n");
    writeFileSync(join(repo, "a.txt"), "one changed\n");
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(envBefore)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test.skipIf(!gitAvailable)("branch, changes, commits, dates, contributors, activity, tags, size, biggest files", async () => {
    const res = (await api("dev/git", { root: repo })).json.git;
    expect(res).toMatchObject({ available: true, isRepo: true, branch: "main", commitCount: 4, changed: 1, untracked: 1, staged: 0, subfolder: false });
    expect(res.lastCommit).toMatchObject({ subject: "third: the last one", author: "Ada Lovelace" });
    expect(res.lastCommit.hash).toHaveLength(12);
    expect(Date.now() - Date.parse(res.firstCommitDate)).toBeGreaterThan(390 * 86_400_000);
    expect(res.contributors).toEqual([{ name: "Ada Lovelace", commits: 3 }, { name: "Grace Hopper", commits: 1 }]);
    expect(res.contributorCount).toBe(2);
    expect(res.perMonth).toHaveLength(12);
    expect(res.perMonth.reduce((n: number, m: any) => n + m.commits, 0)).toBe(3); // the 400-day-old commit is outside the last 12 months
    expect(res.tags).toEqual({ count: 1, latest: ["v1.0.0"] });
    expect(res.gitDirBytes).toBeGreaterThan(0);
    expect(res.biggestFiles[0]).toEqual({ path: "big.bin", bytes: 5000 });
    expect(res.upstream).toBeNull();
  });

  test.skipIf(!gitAvailable)("remote addresses lose their credentials, and nothing secret reaches the answer", async () => {
    const res = (await api("dev/git", { root: repo })).json.git;
    expect(res.remotes).toEqual([{ name: "origin", url: "https://github.com/octo/demo.git" }, { name: "ssh", url: "git@github.com:octo/demo.git" }]);
    const text = JSON.stringify(res);
    expect(text).not.toContain("ghp_SECRETTOKEN123");
    expect(text).not.toContain("octocat");
    expect(stripCredentials("https://u:p@host/x.git")).toBe("https://host/x.git");
    expect(stripCredentials("https://token@host/x.git")).toBe("https://host/x.git");
    expect(stripCredentials("ssh://git:pw@host:22/x.git")).toBe("ssh://host:22/x.git");
    expect(stripCredentials("git@github.com:o/r.git")).toBe("git@github.com:o/r.git");
    expect(stripCredentials("/local/path.git")).toBe("/local/path.git");
  });

  test.skipIf(!gitAvailable)("a sub-folder reports the repository's top, and a folder outside any repository says so", async () => {
    mkdirSync(join(repo, "sub"), { recursive: true });
    const sub = (await api("dev/git", { root: join(repo, "sub") })).json.git;
    expect(sub).toMatchObject({ isRepo: true, subfolder: true });
    const plain = join(root, "no-repo");
    mkdirSync(plain, { recursive: true });
    const none = (await api("dev/git", { root: plain })).json.git;
    expect(none.isRepo).toBe(false);
    expect(none.message).toContain("isn't inside a Git repository");
  });

  test.skipIf(!gitAvailable)("it only reads: the repository is exactly as it was", async () => {
    const before = git(["status", "--porcelain"]) + git(["rev-parse", "HEAD"]);
    await api("dev/git", { root: repo });
    expect(git(["status", "--porcelain"]) + git(["rev-parse", "HEAD"])).toBe(before);
  });
});

describe("disk, heavy folders, duplicates", () => {
  const dir = join(root, "disk");
  beforeAll(() => {
    write(join(dir, "src", "main.ts"), "x".repeat(1000));
    write(join(dir, "src", "copy.ts"), "x".repeat(1000));
    write(join(dir, "src", "other.ts"), "y".repeat(1000));
    write(join(dir, "docs", "a.md"), "z".repeat(3000));
    write(join(dir, "docs", "empty.txt"), "");
    write(join(dir, "node_modules", "pkg", "index.js"), "n".repeat(20_000));
    write(join(dir, "node_modules", "pkg", "node_modules", "inner", "i.js"), "i".repeat(100));
    write(join(dir, "target", "debug", "bin"), "b".repeat(8000));
    write(join(dir, "dupe1.bin"), "d".repeat(2048));
    write(join(dir, "nm", "node_modules", "dupe2.bin"), "d".repeat(2048));
    write(join(dir, "dupe3.bin"), `${"d".repeat(2047)}e`);
    write(join(dir, "tail1.bin"), `${"h".repeat(100_000)}-${"t".repeat(100_000)}`);
    write(join(dir, "tail2.bin"), `${"h".repeat(100_000)}+${"t".repeat(100_000)}`);
    mkdirSync(join(dir, "empty-dir"), { recursive: true });
    mkdirSync(join(dir, "docs", "also-empty"), { recursive: true });
    symlinkSync(join(root, "outside"), join(dir, "link-out"));
    utimesSync(join(dir, "docs", "a.md"), new Date("2001-01-01T00:00:00Z"), new Date("2001-01-01T00:00:00Z"));
    utimesSync(join(dir, "src", "main.ts"), new Date("2040-01-01T00:00:00Z"), new Date("2040-01-01T00:00:00Z"));
  });

  test("breakdown by top-level entry and by extension, largest first", async () => {
    const r = (await job("dev/disk/start", { root: dir })).result;
    expect(r.symlinks).toBe(1);
    const byName = Object.fromEntries(r.top.map((t: any) => [t.name, t]));
    expect(byName.node_modules).toMatchObject({ bytes: 20_100, files: 2, isDir: true });
    expect(byName.src).toMatchObject({ bytes: 3000, files: 3 });
    expect(r.top.map((t: any) => t.bytes)).toEqual([...r.top.map((t: any) => t.bytes)].sort((a, b) => b - a));
    const ext = Object.fromEntries(r.exts.map((e: any) => [e.ext, e]));
    expect(ext.bin).toMatchObject({ files: 5 });
    expect(ext.ts).toMatchObject({ files: 3, bytes: 3000 });
    expect(r.totalBytes).toBe(r.top.reduce((n: number, t: any) => n + t.bytes, 0));
  });

  test("heavy folders are listed with sizes (outermost only), and the list matches the documented names", async () => {
    const r = (await job("dev/disk/start", { root: dir })).result;
    expect(r.heavy.map((h: any) => [h.path, h.bytes, h.files])).toEqual([["node_modules", 20_100, 2], ["target", 8000, 1], ["nm/node_modules", 2048, 1]]);
    expect(HEAVY_FOLDERS).toEqual(["node_modules", "target", ".venv", "dist", "build", ".next", "__pycache__", "Pods", ".gradle", "DerivedData"]);
  });

  test("largest, empty, newest and oldest", async () => {
    const r = (await job("dev/disk/start", { root: dir })).result;
    expect(r.largest[0].bytes).toBe(200_001);
    expect(r.largest[2].path).toBe("node_modules/pkg/index.js");
    expect(r.emptyFiles).toEqual({ count: 1, paths: ["docs/empty.txt"] });
    expect(r.emptyFolders.count).toBe(2);
    expect(r.emptyFolders.paths.sort()).toEqual(["docs/also-empty", "empty-dir"]);
    expect(r.newest[0].path).toBe("src/main.ts");
    expect(r.oldest[0].path).toBe("docs/a.md");
  });

  test("duplicates: same size and head and tail but different middle are not duplicates; vendored folders are opt-in", async () => {
    const r = (await job("dev/dupes/start", { root: dir, minBytes: 1 })).result;
    const groups = r.groups.map((g: any) => g.files);
    expect(groups).toContainEqual(["src/copy.ts", "src/main.ts"]);
    expect(groups.flat()).not.toContain("tail1.bin");
    expect(groups.flat()).not.toContain("dupe3.bin");
    expect(groups.flat()).not.toContain("nm/node_modules/dupe2.bin");
    expect(r.totalWasted).toBe(1000);
    const all = (await job("dev/dupes/start", { root: dir, minBytes: 1, vendored: true })).result;
    expect(all.groups.map((g: any) => g.files)).toContainEqual(["dupe1.bin", "nm/node_modules/dupe2.bin"]);
    const big = (await job("dev/dupes/start", { root: dir, minBytes: 1500 })).result;
    expect(big.groups).toEqual([]);
  });

  test("the disk scan honours the file limit and says it stopped", async () => {
    const r = (await job("dev/disk/start", { root: dir, maxFiles: 3 })).result;
    expect(r.stoppedBy).toBe("files");
    expect(r.files).toBe(3);
  });
});

describe("TODO scanner", () => {
  const dir = join(root, "todo");
  beforeAll(() => {
    write(join(dir, "a.ts"), "// TODO: first\nconst x = 1; // FIXME(me) second\nconst tags = [\"TODO\", 'FIXME'];\n/* HACK here */\nconst TODO_LIST = 1;\nlet todo = 'lowercase todo';\n");
    write(join(dir, "b.py"), "# XXX check\n# BUG: broken\n# NOTE: nb\nprint('TODOS')\n");
    write(join(dir, "c.md"), "NOTE that this is prose\n");
    write(join(dir, "bin.js"), Buffer.from("// TODO in a binary\0\0"));
    write(join(dir, "ignored", "d.ts"), "// TODO ignored\n");
    write(join(dir, ".gitignore"), "ignored/\n");
    write(join(dir, "node_modules", "m.js"), "// TODO vendored\n");
    write(join(dir, ".env"), "TODO=secret-value-123\n");
    write(join(dir, "package-lock.json"), '{"a":"TODO"}');
    write(join(root, "outside", "t.js"), "// TODO leaked\n");
    symlinkSync(join(root, "outside"), join(dir, "link"));
  });

  test("finds markers with tag, file, line and text; not in strings, identifiers, binary, ignored, vendored, env or symlinked files", async () => {
    const r = (await job("dev/todo/start", { root: dir })).result;
    const found = r.items.map((i: any) => `${i.tag} ${i.path}:${i.line} ${i.text}`);
    expect(found).toEqual(expect.arrayContaining(["TODO a.ts:1 TODO: first", "FIXME a.ts:2 FIXME(me) second", "HACK a.ts:4 HACK here", "XXX b.py:1 XXX check", "BUG b.py:2 BUG: broken", "NOTE b.py:3 NOTE: nb", "NOTE c.md:1 NOTE that this is prose"]));
    expect(r.items.length).toBe(7);
    expect(r.counts).toEqual({ TODO: 1, FIXME: 1, HACK: 1, XXX: 1, BUG: 1, NOTE: 2 });
    expect(r.filesWithHits).toBe(3);
    const text = JSON.stringify(r);
    expect(text).not.toContain("secret-value-123");
    expect(text).not.toContain("leaked");
    expect(text).not.toContain("vendored");
    expect(text).not.toContain("ignored");
  });

  test("custom markers, the .gitignore switch, and validation", async () => {
    const only = (await job("dev/todo/start", { root: dir, tags: ["bug", "XXX"] })).result;
    expect(only.items.map((i: any) => i.tag).sort()).toEqual(["BUG", "XXX"]);
    const all = (await job("dev/todo/start", { root: dir, tags: ["TODO"], respectGitignore: false, vendored: true })).result;
    expect(all.items.map((i: any) => i.path).sort()).toEqual(["a.ts", "ignored/d.ts", "node_modules/m.js"]);
    for (const tags of [[], ["lower case"], ["A"], Array.from({ length: 13 }, (_, i) => `TAG${i}`), "TODO", [5]]) expect((await api("dev/todo/start", { root: dir, tags })).status, JSON.stringify(tags)).toBe(400);
    const re = /(?<![A-Za-z0-9_])(TODO)(?![A-Za-z0-9_])/;
    expect(findMarkers("x TODO y", re)[0]).toEqual({ tag: "TODO", text: "TODO y" });
    expect(findMarkers("// TODO fix */", re)[0]!.text).toBe("TODO fix");
  });

  test("export lists the markers as CSV", async () => {
    const r = await job("dev/todo/start", { root: dir });
    const csv = (await api("dev/export", { id: r.id, format: "csv", scope: "todo" })).json.text as string;
    expect(csv.split("\r\n")[0]).toBe("Tag,Path,Line,Text");
    expect(csv).toContain("TODO,a.ts,1,TODO: first");
  });
});

describe("developer tools on this computer", () => {
  const bin = join(root, "fake-bin");
  const fake = (name: string, output: string, code = 0) => {
    write(join(bin, name), `#!/bin/sh\necho "${output}"\nexit ${code}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  beforeAll(() => {
    fake("git", "git version 9.8.7");
    fake("node", "v22.1.0");
    fake("python3", "Python 3.12.4");
    fake("go", "go version go1.22.3 darwin/arm64");
    fake("java", 'openjdk version \\"21.0.2\\" 2024-01-16');
    fake("tokei", "tokei 13.0.0-alpha.5 compiled with serialization support");
    fake("jq", "broken", 3);
  });

  test.skipIf(process.platform === "win32")("installed tools get a version, missing ones an install hint; the answer is cached", async () => {
    const ctx = createContext({ home, dataDir, toolDirs: [bin], platform: "darwin" });
    const first = await detectEnvironment(ctx);
    const by = Object.fromEntries(first.tools.map((t) => [t.id, t]));
    expect(by.git).toMatchObject({ installed: true, version: "9.8.7" });
    expect(by.node).toMatchObject({ installed: true, version: "22.1.0" });
    expect(by.python3).toMatchObject({ installed: true, version: "3.12.4" });
    expect(by.go).toMatchObject({ installed: true, version: "1.22.3" });
    expect(by.java).toMatchObject({ installed: true, version: "21.0.2" });
    expect(by.tokei!.version).toBe("13.0.0-alpha.5");
    expect(by.jq).toMatchObject({ installed: false });
    expect(by.jq!.note).toContain("didn't answer");
    expect(by.cargo).toMatchObject({ installed: false, path: null, hint: "brew install rust" });
    expect(by.rg!.hint).toBe("brew install ripgrep");
    expect(first.tools.map((t) => t.id)).toEqual(expect.arrayContaining(["git", "bun", "node", "npm", "pnpm", "yarn", "deno", "python3", "pip", "go", "rustc", "cargo", "v", "java", "javac", "dotnet", "ruby", "php", "swift", "clang", "gcc", "make", "cmake", "docker", "tokei", "rg", "fd", "jq", "gh"]));
    expect(first.cached).toBe(false);
    rmSync(join(bin, "node"));
    const second = await detectEnvironment(ctx);
    expect(second.cached).toBe(true);
    expect(second.tools.find((t) => t.id === "node")!.installed).toBe(true);
    const fresh = await detectEnvironment(ctx, true);
    expect(fresh.tools.find((t) => t.id === "node")!.installed).toBe(false);
    const linux = await detectEnvironment(createContext({ home, dataDir, toolDirs: [bin], platform: "linux" }), true);
    expect(linux.tools.find((t) => t.id === "rg")!.hint).toBe("sudo apt install ripgrep");
    expect(parseToolVersion("tool 1.2.3-beta\nother 9.9")).toBe("1.2.3-beta");
    expect(parseToolVersion("nothing here")).toBeNull();
  });

  test.skipIf(process.platform === "win32")("a program that never answers, and ignores the polite stop, doesn't hold up the others", async () => {
    const slow = join(root, "slow-bin");
    write(join(slow, "git"), "#!/bin/sh\ntrap '' TERM\nwhile :; do sleep 1; done\n");
    chmodSync(join(slow, "git"), 0o755);
    write(join(slow, "node"), '#!/bin/sh\necho "v22.1.0"\n');
    chmodSync(join(slow, "node"), 0o755);
    const started = Date.now();
    const result = await detectEnvironment(createContext({ home, dataDir, toolDirs: [slow], platform: "linux" }), true);
    expect(Date.now() - started).toBeLessThan(7000);
    const by = Object.fromEntries(result.tools.map((t) => [t.id, t]));
    expect(by.node).toMatchObject({ installed: true, version: "22.1.0" });
    expect(by.git).toMatchObject({ installed: false });
    expect(by.git!.path).toBeTruthy();
    expect(by.git!.note).toContain("didn't answer");
  }, 30_000);

  test("the API returns the table", async () => {
    const res = await api("dev/env", {});
    expect(res.status).toBe(200);
    expect(res.json.tools.length).toBeGreaterThanOrEqual(29);
    expect(res.json.tools.every((t: any) => typeof t.installed === "boolean" && typeof t.hint === "string")).toBe(true);
  });
});

describe("the API's guards", () => {
  const devOps = () => API_OPERATIONS.filter((o) => o.startsWith("dev/"));
  test("there are dev operations, and every one needs the session token", async () => {
    expect(devOps().length).toBeGreaterThanOrEqual(15);
    for (const op of devOps()) {
      for (const headers of [{}, { "x-fm-token": "wrong" }] as Array<Record<string, string>>) {
        const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ root }) });
        expect(res.status, op).toBe(401);
      }
    }
  });

  test("every one refuses foreign Host and Origin headers and non-JSON bodies", async () => {
    for (const op of devOps()) {
      const host = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Host: "attacker.example" }, body: "{}" });
      expect(host.status, `${op} host`).toBe(403);
      const origin = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Origin: "https://evil.example" }, body: "{}" });
      expect(origin.status, `${op} origin`).toBe(403);
      const plain = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "text/plain", "x-fm-token": TOKEN }, body: "{}" });
      expect(plain.status, `${op} type`).toBe(415);
    }
    expect((await fetch(`${base}/api/dev/meta`)).status).not.toBe(200); // GET is not an operation
  });

  test("folders are validated: relative, missing, a file, a null byte, wrong types", async () => {
    for (const op of ["dev/stats/start", "dev/disk/start", "dev/dupes/start", "dev/todo/start", "dev/project", "dev/git"]) {
      expect((await api(op, { root: "relative/path" })).json.error.code, op).toBe("BAD_PATH");
      expect((await api(op, {})).json.error.code, op).toBe("BAD_PATH");
      expect((await api(op, { root: 5 })).json.error.code, op).toBe("BAD_PATH");
      expect((await api(op, { root: `${root}/a\0b` })).json.error.code, op).toBe("BAD_PATH");
      expect((await api(op, { root: join(root, "does-not-exist") })).json.error.code, op).toBe("NOT_FOUND");
      expect((await api(op, { root: join(root, "count", "README.md") })).json.error.code, op).toBe("NOT_A_FOLDER");
    }
    expect((await api("dev/job/poll", { id: 5 })).json.error.code).toBe("NO_JOB");
    expect((await api("dev/job/cancel", { id: "nope" })).json.error.code).toBe("NO_JOB");
  });

  test("a bad option can't crash a scan: odd excludes, limits and types are cleaned up", async () => {
    const r = await stats(join(root, "count"), { excludes: [5, null, "", "x".repeat(1000), "src/"], maxFiles: "lots", maxDirs: -4, maxSeconds: 0, respectGitignore: "yes", hidden: 1 });
    expect(r.state).toBe("done");
    expect(r.result.options.excludes).toEqual(["src/"]);
  });

  test("meta describes the limits and the tools", async () => {
    const m = (await api("dev/meta", {})).json;
    expect(m.languageCount).toBeGreaterThanOrEqual(60);
    expect(m.languages).toContain("V");
    expect(m.limits).toMatchObject({ maxFiles: 200_000, maxSeconds: 60, maxFileBytes: 8 * 1024 * 1024, maxSnapshots: 50 });
    expect(m.vendoredDirs).toEqual(["node_modules", "target", "dist", "build", ".git"]);
    expect(existsSync(join(root, "count"))).toBe(true);
  });
});
