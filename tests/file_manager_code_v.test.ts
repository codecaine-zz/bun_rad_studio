import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { formatV, vVersion } from "../src/features/filemanager/fmCodeFormat";
import { SNIPPETS, buildIndex, commentSyntax, complete, detectIndent, detectLanguage, expandSnippet, extractSymbols, suggestionsFor, tokenizeText, toggleBlockComment, toggleLineComment } from "../resources/file_manager/ui/codeLogic.js";

// V (vlang 0.5.2): the editor's knowledge of the language, checked against the real `v` when it is installed.
const haveV = Bun.which("v") !== null;
const realV = haveV ? test : test.skip;
const root = mkdtempSync(join(tmpdir(), "fm-code-v-"));
const types = (src: string) => tokenizeText("v", src).flat().filter((t: any) => t.type).map((t: any) => `${t.type}:${t.text}`);

beforeAll(() => mkdirSync(join(root, "snip"), { recursive: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("V files are recognised", () => {
  test("by name, by the v.mod file name and by the shebang", () => {
    for (const name of ["a.v", "a.vsh", "a.vv", "v.mod", "x_test.v", "x.c.v", "x.js.v", "FOO.V"]) expect(detectLanguage(name), name).toBe("v");
    expect(detectLanguage("script", "#!/usr/bin/env -S v run")).toBe("v");
    expect(detectLanguage("notes.vb")).not.toBe("v");
  });
  test("comments are // and /* */, and a V file with no indentation yet defaults to tabs", () => {
    expect(commentSyntax("v")).toEqual({ line: "//", block: ["/*", "*/"] });
    expect(toggleLineComment("a\nb\n", 0, 3, "v")).toMatchObject({ insert: "// a\n// b" });
    expect(toggleBlockComment("abc", 0, 3, "v")).toMatchObject({ insert: "/* abc */" });
    expect(detectIndent("fn a() {\n\tx\n}\n")).toEqual({ useTabs: true, size: null });
  });
});

describe("V highlighting", () => {
  test("keywords of the 0.5.2 token table, builtin types, option and result types", () => {
    const t = types("module main\nimport os\npub struct User {\npub mut:\n\tname string\n\tage ?int\n}\nfn f() !string { return error('x') }\nenum C { a }\ninterface I {}\ntype N = int | f64\nconst k = 1\n__global g = 1");
    for (const kw of ["keyword:module", "keyword:import", "keyword:pub", "keyword:struct", "keyword:mut", "keyword:fn", "keyword:return", "keyword:enum", "keyword:interface", "keyword:type", "keyword:const", "keyword:__global"]) expect(t, kw).toContain(kw);
    expect(t).toContain("type:string");
    expect(t).toContain("type:?int");
    expect(t).toContain("type:!string");
    expect(t).toContain("type:f64");
  });
  test("strings with $name and ${expr}, raw and C strings, runes, escapes", () => {
    const t = types("a := 'Hi $u.name and ${u.age + 1}!'\nr := r'raw\\n'\nc := c'cstr'\nch := `a`\nq := \"dq $x\"");
    expect(t).toContain("variable:$u.name");
    expect(t).toContain("variable:${u.age + 1}");
    expect(t).toContain("string:r'raw\\n'");
    expect(t).toContain("string:c'cstr'");
    expect(t).toContain("string:`a`");
    expect(t).toContain("variable:$x");
  });
  test("attributes in both spellings, compile-time $if and $for, numbers", () => {
    const t = types("@[json: 'x']\n[deprecated]\n$if windows { } $else { }\n$for f in T.fields { }\nn := 0x_ff + 1_000 + 0b101 + 3.5e-2");
    expect(t).toContain("meta:@[json: 'x']");
    expect(t).toContain("meta:[deprecated]");
    expect(t).toContain("meta:$if");
    expect(t).toContain("meta:$else");
    expect(t).toContain("meta:$for");
    expect(t).toEqual(expect.arrayContaining(["number:0x_ff", "number:1_000", "number:0b101", "number:3.5e-2"]));
  });
  test("block comments nest, and an unfinished one carries over to the next line", () => {
    const rows = tokenizeText("v", "/* a /* b */ still */ fn\n/* open\nstill comment */ fn");
    expect(rows[0].filter((t: any) => t.type).map((t: any) => `${t.type}:${t.text}`)).toEqual(["comment:/* a /* b */ still */", "keyword:fn"]);
    expect(rows[1][0].type).toBe("comment");
    expect(rows[2].map((t: any) => t.type)).toContain("keyword");
  });
});

describe("V outline", () => {
  test("functions, methods, structs, interfaces, enums, types, constants and tests", () => {
    const src = "module main\nimport os\nstruct U {}\ninterface S { speak() string }\nenum Color { red }\ntype Num = int | f64\nconst pi = 3.14\nfn (u U) greet() string { return '' }\nfn test_add() { assert true }\nfn main() {}\n";
    const names = extractSymbols(src, "v").map((s: any) => `${s.kind}:${s.name}`);
    expect(names).toEqual(["module:main", "import:os", "struct:U", "interface:S", "enum:Color", "type:Num", "const:pi", "method:U.greet", "test:test_add", "function:main"]);
  });
});

describe("V completion", () => {
  const items = (text: string, manual = false) => {
    const r = complete({ text, caret: text.length, lang: "v", index: buildIndex(text, "v", text.length), manual });
    return r ? r.items.map((i: any) => i.label) : null;
  };
  test("keywords, builtin functions and module names after `import `", () => {
    expect(items("fn main() {\n\tmu")).toContain("mut");
    expect(items("fn main() {\n\tprin")).toEqual(expect.arrayContaining(["print", "println"]));
    for (const w of ["println", "print", "eprintln", "panic", "exit", "error", "dump"]) expect(items(`fn main() {\n\t${w.slice(0, 3)}`), w).toContain(w);
    expect(items("import ")).toEqual(expect.arrayContaining(["os", "strings", "time", "math"]));
  });
  test("members of modules, strings, arrays, maps, structs and methods", () => {
    expect(items("import os\nfn main() {\n\tos.")).toEqual(expect.arrayContaining(["args", "read_file"]));
    expect(items("import strings\nfn main() {\n\tstrings.b")).toContain("Builder");
    expect(items("import time\nfn main() {\n\ttime.n")).toContain("now");
    expect(items("import math\nfn main() {\n\tmath.s")).toEqual(expect.arrayContaining(["sin", "sqrt"]));
    expect(items("fn main() {\n\ts := 'abc'\n\ts.to")).toEqual(expect.arrayContaining(["to_lower", "to_upper"]));
    expect(items("fn main() {\n\ta := [1, 2]\n\ta.fi")).toEqual(expect.arrayContaining(["first", "filter"]));
    expect(items("fn main() {\n\tm := map[string]int{}\n\tm.ke")).toContain("keys");
    expect(items("struct User {\n\tname string\n\tage int\n}\nfn main() {\n\tu := User{}\n\tu.na")).toEqual(["name"]);
    expect(items("struct U {}\nfn (u U) greet() string { return '' }\nfn main() {\n\tu := U{}\n\tu.gr")).toEqual(["greet"]);
  });
  test("fields inside a struct literal, attributes after @[ and compile-time words after $", () => {
    expect(items("struct User {\n\tname string\n\tage int\n}\nfn main() {\n\tu := User{\n\t\t", true)).toEqual(["age", "name"]);
    expect(items("@[")).toEqual(expect.arrayContaining(["deprecated:", "inline", "json:"]));
    expect(items("fn main() {\n\t$")).toEqual(expect.arrayContaining(["$if", "$for", "$env"]));
  });
  test("nothing inside comments and strings", () => {
    expect(items("// pri")).toBeNull();
    expect(items("x := 'pri")).toBeNull();
  });
});

describe("V snippets and Run and Build presets", () => {
  test("there are plenty of snippets, each with a prefix, a label and a place it belongs", () => {
    const list = (SNIPPETS as any).v as any[];
    expect(list.length).toBeGreaterThanOrEqual(30);
    for (const s of list) {
      expect(s.prefix && s.label && s.body, s.prefix).toBeTruthy();
      expect(["top", "body", "expr", "attr", "file"]).toContain(s.where);
    }
    expect(new Set(list.map((s) => s.prefix)).size).toBe(list.length);
  });

  realV("every snippet, with its blanks filled in, is accepted by `v fmt -verify`", () => {
    const wrap = (where: string, t: string) =>
      where === "top" ? `module main\n\n${t}\n`
        : where === "body" ? `module main\n\nimport os\n\nfn main() {\n${t.split("\n").map((l) => `\t${l}`).join("\n")}\n}\n`
          : where === "expr" ? `module main\n\nfn main() {\n\tx := foo() ${t}\n}\n`
            : where === "attr" ? `module main\n\n${t}\nfn main() {}\n`
              : `${t}\n`;
    const failures: string[] = [];
    for (const s of (SNIPPETS as any).v as any[]) {
      const e = expandSnippet(s.body, { unit: "\t" });
      let text = e.text;
      const empties = e.stops.filter((st) => st.n !== 0 || s.body.includes("$0")).flatMap((st) => st.ranges).filter((r) => r.start === r.end).sort((a, b) => b.start - a.start);
      for (const r of empties) text = `${text.slice(0, r.start)}println('ok')${text.slice(r.start)}`;
      const file = join(root, "snip", `s_${s.prefix}.v`);
      writeFileSync(file, wrap(s.where, text));
      const r = Bun.spawnSync(["v", "fmt", "-verify", file], { cwd: join(root, "snip") });
      if (r.exitCode !== 0) failures.push(`${s.prefix}: ${r.stdout.toString()}${r.stderr.toString()}`.slice(0, 160));
    }
    expect(failures).toEqual([]);
  });

  test("the V presets include run, build, test, format, vet and project builds", () => {
    const cmds = suggestionsFor("v").map((s: any) => s.command);
    for (const c of ["v run {file}", "v {file}", "v -prod {file}", "v test {file}", "v fmt -w {file}", "v vet {file}", "v ."]) expect(cmds, c).toContain(c);
    const repo = suggestionsFor("v").filter((s: any) => s.repo).map((s: any) => s.command);
    expect(repo).toEqual(expect.arrayContaining(["bun run typecheck", "bun run docs:build"]));
  });
});

describe("Format with v fmt (the server side)", () => {
  const ugly = "module main\nfn main(){\nx:=1\n   println( x )\n}\n";
  const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith("fm-vfmt-"));

  realV("formats V text and leaves no temporary file behind", async () => {
    const before = leftovers().length;
    const r = await formatV(ugly);
    expect(r).toMatchObject({ available: true, formatted: true });
    expect(r.text).toBe("module main\n\nfn main() {\n\tx := 1\n\tprintln(x)\n}\n");
    expect(leftovers().length).toBe(before);
  });

  realV("a syntax error comes back as V's own message, without the temporary file's name", async () => {
    const r = await formatV("fn main( {\n");
    expect(r.available).toBe(true);
    expect(r.formatted).toBe(false);
    expect(r.problem).toContain("error");
    expect(r.problem).not.toContain("fm-vfmt");
    expect(r.text).toBeUndefined();
  });

  realV("reports the installed version", async () => {
    const r = await vVersion({} as any);
    expect(r.available).toBe(true);
    expect(r.version).toMatch(/^V \d+\.\d+\.\d+/);
  });

  test("says so in plain words when V isn't installed", async () => {
    const r = await formatV(ugly, { command: "definitely-not-a-program-v" });
    expect(r).toMatchObject({ available: false, formatted: false });
    expect(r.message).toContain("isn't installed");
  });

  test("refuses text that isn't a string or is far too big", async () => {
    await expect(formatV(42 as any)).rejects.toThrow(/no text/i);
    await expect(formatV("x".repeat(1_000_000))).rejects.toThrow(/too big/i);
  });

  const posix = process.platform === "win32" ? test.skip : test;
  const fake = (name: string, body: string) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    const script = join(dir, "fake-v");
    writeFileSync(script, `#!/bin/sh\n${body}\n`);
    chmodSync(script, 0o755);
    return { dir, script };
  };

  posix("the temporary file is private (0600), argv only, and is deleted even when v fails", async () => {
    const { dir, script } = fake("mode", 'ls -l "$2" | cut -c1-10 > "$(dirname "$0")/mode.txt"\necho "$1" > "$(dirname "$0")/arg.txt"\ncat "$2"\nexit 3');
    const r = await formatV("fn main() {}\n", { command: script, tempDir: dir });
    expect(r.formatted).toBe(false);
    expect(readFileSync(join(dir, "mode.txt"), "utf8").trim()).toBe("-rw-------");
    expect(readFileSync(join(dir, "arg.txt"), "utf8").trim()).toBe("fmt");
    expect(readdirSync(dir).filter((n) => n.startsWith("fm-vfmt-"))).toEqual([]);
  });

  posix("stops v after the time limit", async () => {
    const { dir, script } = fake("slow", "sleep 5");
    const started = Date.now();
    const r = await formatV("fn main() {}\n", { command: script, tempDir: dir, timeoutMs: 300 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.problem).toContain("took longer");
    expect(readdirSync(dir).filter((n) => n.startsWith("fm-vfmt-"))).toEqual([]);
  });

  posix("stops v when it prints more than 1 MB", async () => {
    const { dir, script } = fake("loud", "head -c 3000000 /dev/zero | tr '\\0' 'a'");
    const r = await formatV("fn main() {}\n", { command: script, tempDir: dir });
    expect(r.formatted).toBe(false);
    expect(r.problem).toContain("too big");
  });
});
