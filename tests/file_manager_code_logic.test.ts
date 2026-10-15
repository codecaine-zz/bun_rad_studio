import { describe, expect, test } from "bun:test";
import * as logic from "../resources/file_manager/ui/codeLogic.js";
import { defaultAsk } from "../src/features/filemanager/fmCodePresets";

// The page's modules are plain JavaScript, so their results are loosely typed here.
const L: any = logic;

const { tokenizeLine, tokenizeText, createHighlighter } = L;

/** [type, text] pairs for the coloured pieces of a text (plain pieces are left out). */
const coloured = (lang: string, text: string) => tokenizeText(lang, text).flat().filter((t: any) => t.type).map((t: any) => [t.type, t.text]);
const roundTrip = (lang: string, text: string) => tokenizeText(lang, text).map((tokens: any[]) => tokens.map((t) => t.text).join("")).join("\n");

describe("language detection", () => {
  test("by file name, extension and first line", () => {
    const d = L.detectLanguage;
    expect([d("a.ts"), d("A.TSX"), d("x.mjs"), d("main.go"), d("lib.rs"), d("x.PY"), d("Dockerfile"), d("dockerfile.dev"), d("Makefile"), d("GNUmakefile"), d(".bashrc"), d("notes.md"), d("a.yml"), d("a.toml"), d("a.sql"), d("a.svg"), d("a.patch"), d(".env"), d("tsconfig.json")]).toEqual(
      ["typescript", "typescript", "javascript", "go", "rust", "python", "dockerfile", "dockerfile", "makefile", "makefile", "shell", "markdown", "yaml", "toml", "sql", "xml", "diff", "ini", "json"],
    );
    expect(d("script", "#!/usr/bin/env python3")).toBe("python");
    expect(d("run", "#!/bin/bash")).toBe("shell");
    expect(d("run", "#!/usr/bin/env -S node --flag")).toBe("javascript");
    expect(d("x", "<?php echo 1;")).toBe("php");
    expect(d("unknown.zzz")).toBe("plain");
    expect(d("/some/dir/a.cpp")).toBe("cpp");
    expect(d("C:\\dir\\a.java")).toBe("java");
  });

  test("every language the tab promises exists", () => {
    const ids = L.LANGS.map((l: any) => l.id);
    for (const id of ["javascript", "typescript", "json", "html", "css", "markdown", "python", "go", "rust", "c", "cpp", "java", "shell", "yaml", "toml", "sql", "php", "ruby", "swift", "kotlin", "lua", "xml", "diff", "ini", "dockerfile", "makefile", "plain"]) expect(ids).toContain(id);
  });
});

describe("highlighting", () => {
  test("JavaScript: keywords, strings, comments, numbers, functions, regexes, templates across lines", () => {
    const c = coloured("javascript", 'const x = 42; // hi\nfunction go(a) { return "s" + /ab+c/g.test(a) }\nconst t = `one\ntwo`;');
    expect(c).toContainEqual(["keyword", "const"]);
    expect(c).toContainEqual(["number", "42"]);
    expect(c).toContainEqual(["comment", "// hi"]);
    expect(c).toContainEqual(["function", "go"]);
    expect(c).toContainEqual(["string", '"s"']);
    expect(c).toContainEqual(["regexp", "/ab+c/g"]);
    expect(c).toContainEqual(["string", "`one"]);
    expect(c).toContainEqual(["string", "two`;".slice(0, 4)]);
  });

  test("division is not a regex", () => {
    expect(coloured("javascript", "const r = a / b / c;").some(([t]: any) => t === "regexp")).toBe(false);
  });

  test("block comments continue over lines and stop", () => {
    const lines = tokenizeText("c", "int a; /* start\nstill\nend */ int b;");
    expect(lines[1]).toEqual([{ text: "still", type: "comment" }]);
    expect(lines[2]!.map((t: any) => t.text).join("")).toBe("end */ int b;");
    expect(lines[2]![0]).toEqual({ text: "end */", type: "comment" });
    expect(lines[2]!.some((t: any) => t.type === "type" && t.text === "int")).toBe(true);
  });

  test("TypeScript, JSON (keys differ from values), Python (triple quotes, decorators), Go, Rust", () => {
    expect(coloured("typescript", "interface A { x: string }")).toContainEqual(["keyword", "interface"]);
    const json = coloured("json", '{"name": "x", "n": 1, "ok": true, "z": null}');
    expect(json).toContainEqual(["property", '"name"']);
    expect(json).toContainEqual(["string", '"x"']);
    expect(json).toContainEqual(["number", "1"]);
    expect(json).toContainEqual(["constant", "true"]);
    const py = tokenizeText("python", '@property\ndef f(self):\n    """doc\n    more"""\n    return f"x{1}"');
    expect(py[0]![0]).toEqual({ text: "@property", type: "meta" });
    expect(py[2]!.some((t: any) => t.type === "string")).toBe(true);
    expect(py[3]![0]!.type).toBe("string");
    expect(py[4]!.some((t: any) => t.type === "string" && t.text === 'f"x{1}"')).toBe(true);
    expect(coloured("go", "func main() {\n\tfmt.Println(`raw\nmore`)\n}")).toContainEqual(["keyword", "func"]);
    expect(coloured("rust", '#[derive(Debug)]\nfn main() { let s: &str = "a"; }')).toContainEqual(["meta", "#[derive(Debug)]"]);
  });

  test("C family and others", () => {
    expect(coloured("c", "#include <stdio.h>\nint main(void) { return 0; }")).toContainEqual(["meta", "#include"]);
    expect(coloured("cpp", "template <class T> class Foo : public Bar {};")).toContainEqual(["keyword", "template"]);
    expect(coloured("java", "@Override public void run() {}")).toContainEqual(["meta", "@Override"]);
    expect(coloured("csharp", "public async Task<int> Go() { await x; }")).toContainEqual(["keyword", "async"]);
    expect(coloured("kotlin", "fun main() = println(\"x\")")).toContainEqual(["keyword", "fun"]);
    expect(coloured("swift", "func f() -> Int { return 1 }")).toContainEqual(["keyword", "func"]);
    expect(coloured("php", '<?php $a = "x"; // c')).toContainEqual(["variable", "$a"]);
    expect(coloured("ruby", "def hi\n  @x = nil\nend")).toContainEqual(["variable", "@x"]);
    expect(coloured("lua", "local function f() end -- c")).toContainEqual(["comment", "-- c"]);
    expect(coloured("lua", "--[[ multi\nline ]] x = 1").filter(([t]: any) => t === "comment").length).toBe(2);
  });

  test("shell: variables and comments, but # inside a word is not a comment", () => {
    const c = coloured("shell", 'echo "$HOME" ${PATH} $1 # note\necho a#b');
    expect(c).toContainEqual(["variable", "${PATH}"]);
    expect(c).toContainEqual(["comment", "# note"]);
    expect(c.filter(([t]: any) => t === "comment").length).toBe(1);
  });

  test("YAML, TOML, INI keys and sections", () => {
    expect(coloured("yaml", "name: app\nitems:\n  - a: 1 # c\nurl: http://x.y/z")).toContainEqual(["property", "name"]);
    expect(coloured("yaml", "url: http://x.y/z")).toContainEqual(["property", "url"]);
    expect(coloured("toml", '[package]\nname = "x"')).toContainEqual(["tag", "[package]"]);
    expect(coloured("toml", '[package]\nname = "x"')).toContainEqual(["property", "name"]);
    expect(coloured("ini", "; c\n[sec]\nkey=value")).toContainEqual(["tag", "[sec]"]);
    expect(coloured("ini", "key=value")).toContainEqual(["property", "key"]);
  });

  test("SQL is case-insensitive; Dockerfile and Makefile", () => {
    expect(coloured("sql", "SeLeCt a FROM t -- x")).toContainEqual(["keyword", "SeLeCt"]);
    expect(coloured("dockerfile", "FROM node:20 AS build\nRUN echo $X")).toContainEqual(["keyword", "FROM"]);
    expect(coloured("dockerfile", "run echo")).toContainEqual(["keyword", "run"]);
    const mk = coloured("makefile", "CC := gcc\nbuild: main.o\n\t$(CC) -o app\n# c");
    expect(mk).toContainEqual(["property", "CC"]);
    expect(mk).toContainEqual(["function", "build"]);
    expect(mk).toContainEqual(["variable", "$(CC)"]);
  });

  test("HTML: tags, attributes, entities, comments, and embedded script/style", () => {
    const html = '<!DOCTYPE html>\n<!-- c -->\n<div class="a" id=b>&amp; hi</div>\n<script>\nconst x = 1;\n</script>\n<style>\na { color: red; }\n</style>';
    const c = coloured("html", html);
    expect(c).toContainEqual(["meta", "<!DOCTYPE html>"]);
    expect(c).toContainEqual(["comment", "<!-- c -->"]);
    expect(c).toContainEqual(["tag", "<div"]);
    expect(c).toContainEqual(["attr", "class"]);
    expect(c).toContainEqual(["string", '"a"']);
    expect(c).toContainEqual(["constant", "&amp;"]);
    expect(c).toContainEqual(["keyword", "const"]);
    expect(c).toContainEqual(["property", "color"]);
    expect(roundTrip("html", html)).toBe(html);
  });

  test("a tag that continues over several lines keeps its attributes", () => {
    const c = tokenizeText("html", '<a\n  href="x"\n  title="long\n text">t</a>');
    expect(c[1]!.some((t: any) => t.type === "attr")).toBe(true);
    expect(c[3]!.some((t: any) => t.type === "string")).toBe(true);
    expect(c[3]!.some((t: any) => t.type === "tag")).toBe(true);
  });

  test("XML", () => {
    expect(coloured("xml", '<?xml version="1.0"?>\n<a:b x="1"/>')).toContainEqual(["meta", '<?xml version="1.0"?>']);
  });

  test("CSS: selectors, properties, values, at-rules, comments, nesting", () => {
    const css = "@media (max-width: 600px) {\n  .a:hover, #b > p { color: #fff; margin: 0 -1.5em !important; background: url(x.png) }\n}\n/* c */";
    const c = coloured("css", css);
    expect(c).toContainEqual(["keyword", "@media"]);
    expect(c).toContainEqual(["type", ".a"]);
    expect(c).toContainEqual(["attr", ":hover"]);
    expect(c).toContainEqual(["property", "color"]);
    expect(c).toContainEqual(["number", "#fff"]);
    expect(c).toContainEqual(["number", "-1.5em"]);
    expect(c).toContainEqual(["keyword", "!important"]);
    expect(c).toContainEqual(["comment", "/* c */"]);
    expect(roundTrip("css", css)).toBe(css);
  });

  test("Markdown: headings, emphasis, code, links, lists, fences", () => {
    const md = "# Title\n\nsome *em* and **strong** and `code` and [l](http://x)\n- item\n```js\nlet a\n```\n> quote";
    const c = coloured("markdown", md);
    expect(c).toContainEqual(["heading", "# Title"]);
    expect(c).toContainEqual(["emphasis", "*em*"]);
    expect(c).toContainEqual(["strong", "**strong**"]);
    expect(c).toContainEqual(["string", "`code`"]);
    expect(c).toContainEqual(["link", "[l](http://x)"]);
    expect(c).toContainEqual(["keyword", "- "]);
    expect(c).toContainEqual(["string", "let a"]);
    expect(roundTrip("markdown", md)).toBe(md);
  });

  test("diff", () => {
    const c = coloured("diff", "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n same");
    expect(c.map(([t]: any) => t)).toEqual(["keyword", "keyword", "keyword", "meta", "deleted", "inserted"]);
  });

  test("plain text stays plain, and every language gives back exactly the text it was given", () => {
    const sample = 'if (a) { "str\\"ing" + `t${x}` /* c */ } // end\n\ttab\t<b>&amp;</b> $x #y ; -- {{ }} \u00e9\u4e2d';
    for (const lang of L.LANGS.map((l: any) => l.id)) expect(roundTrip(lang, sample)).toBe(sample);
    expect(coloured("plain", "const x = 1")).toEqual([]);
  });

  test("pathological inputs finish quickly: long lines, unterminated everything, deep nesting, huge repeats", () => {
    const evil = [
      "a".repeat(500_000),
      '"'.repeat(100_000),
      "/*".repeat(50_000),
      "<".repeat(50_000),
      "<a ".repeat(30_000),
      "`".repeat(30_000),
      "(".repeat(100_000),
      "*_".repeat(500),
      "[a](".repeat(500),
      "\\".repeat(100_000),
      ("0".repeat(100) + ".").repeat(1000),
      "{".repeat(20_000) + ":".repeat(20_000),
      "/".repeat(50_000),
      "$".repeat(50_000) + "{".repeat(50_000),
      " ".repeat(200_000) + "x",
      "a=b ".repeat(30_000),
      ("[" + "a".repeat(100)).repeat(1000),
    ];
    for (const lang of L.LANGS.map((l: any) => l.id)) {
      const started = performance.now();
      for (const text of evil) {
        const lines = text.length > 1900 ? [text.slice(0, 1900), text.slice(1900, 3800)] : [text];
        let state = "";
        for (const line of lines) {
          const r = tokenizeLine(lang, line, state);
          state = r.state;
          expect(r.tokens.map((t: any) => t.text).join("")).toBe(line);
        }
        // and as one very long line
        expect(tokenizeLine(lang, text, "").tokens.map((t: any) => t.text).join("")).toBe(text);
      }
      expect(performance.now() - started, lang).toBeLessThan(2500);
    }
  });

  test("many lines of a big file highlight in bounded time", () => {
    const line = 'const value = compute(a, b) + "text" + 12345; // comment here\n';
    const text = line.repeat(50_000);
    const hl = createHighlighter("javascript");
    const t0 = performance.now();
    hl.setLines(text.split("\n"));
    expect(hl.line(49_999).length).toBeGreaterThan(3);
    expect(performance.now() - t0).toBeLessThan(2500);
  });
});

describe("the incremental highlighter", () => {
  const lines = (s: string) => s.split("\n");
  const whole = (lang: string, text: string) => tokenizeText(lang, text);

  test("matches a full re-scan after edits, including block comments opening and closing", () => {
    const hl = createHighlighter("javascript");
    let text = "let a = 1;\nlet b = 2;\nlet c = 3;\nlet d = 4;";
    hl.setLines(lines(text));
    expect(hl.line(3)).toEqual(whole("javascript", text)[3]!);
    const edits = ["let a = 1;\n/* open\nlet b = 2;\nlet c = 3;\nlet d = 4;", "let a = 1;\n/* open\nlet b = 2;\n*/ let c = 3;\nlet d = 4;", "let a = 1;\nlet b = 2;\n*/ let c = 3;\nlet d = 4;", "x\ny", "", "let q = `a\nb`;\nlet z;"];
    for (const next of edits) {
      text = next;
      hl.setLines(lines(text));
      const expected = whole("javascript", text);
      for (let i = 0; i < expected.length; i++) expect(hl.line(i), `line ${i} of ${JSON.stringify(next)}`).toEqual(expected[i]!);
    }
  });

  test("lines below an edit keep their colours when the state doesn't change, and change when it does", () => {
    const hl = createHighlighter("javascript");
    const base = Array.from({ length: 30 }, (_, i) => `let v${i} = ${i};`);
    hl.setLines(base);
    for (let i = 0; i < 30; i++) hl.line(i);
    const keep = hl.line(25);
    hl.setLines([...base.slice(0, 5), "let changed = 1;", ...base.slice(6)]);
    expect(hl.line(25)).toBe(keep);
    hl.setLines([...base.slice(0, 5), "/*", ...base.slice(6)]);
    expect(hl.line(25)).toEqual([{ text: base[25], type: "comment" }]);
  });

  test("changing the language starts over", () => {
    const hl = createHighlighter("plain");
    hl.setLines(["const x = 1"]);
    expect(hl.line(0)).toEqual([{ text: "const x = 1", type: "" }]);
    hl.setLanguage("javascript");
    expect(hl.line(0)[0]).toEqual({ text: "const", type: "keyword" });
    hl.setEnabled(false);
    expect(hl.line(0)).toEqual([]);
  });
});

describe("comments", () => {
  const apply = (e: any, text: string) => (e && e.from !== undefined ? text.slice(0, e.from) + e.insert + text.slice(e.to) : text);

  test("line comments toggle on and off, and the text comes back exactly", () => {
    for (const [lang, marker] of [["javascript", "//"], ["python", "#"], ["shell", "#"], ["sql", "--"], ["lua", "--"], ["go", "//"], ["yaml", "#"], ["ini", ";"], ["php", "//"]] as const) {
      const text = "a\n  b\n\n    c";
      const on = apply(L.toggleLineComment(text, 0, text.length, lang), text);
      expect(on, lang).toBe(`${marker} a\n${marker}   b\n\n${marker}     c`);
      const off = apply(L.toggleLineComment(on, 0, on.length, lang), on);
      expect(off, lang).toBe(text);
    }
  });

  test("indentation is respected: the marker goes at the shallowest indent", () => {
    const text = "  a\n    b";
    expect(apply(L.toggleLineComment(text, 0, text.length, "javascript"), text)).toBe("  // a\n  //   b");
  });

  test("a mix of commented and plain lines gets commented, never half-uncommented", () => {
    const text = "// a\nb";
    expect(apply(L.toggleLineComment(text, 0, text.length, "javascript"), text)).toBe("// // a\n// b");
  });

  test("languages with only block comments comment each line with the markers", () => {
    const text = "a { b: c }";
    const on = apply(L.toggleLineComment(text, 0, 0, "css"), text);
    expect(on).toBe("/* a { b: c } */");
    expect(apply(L.toggleLineComment(on, 0, 0, "css"), on)).toBe(text);
    const html = "<p>x</p>";
    const h = apply(L.toggleLineComment(html, 0, 0, "html"), html);
    expect(h).toBe("<!-- <p>x</p> -->");
    expect(apply(L.toggleLineComment(h, 0, 0, "html"), h)).toBe(html);
  });

  test("languages without comments say so", () => {
    expect(L.toggleLineComment("{}", 0, 0, "json")).toMatchObject({ message: expect.stringContaining("no comments") });
    expect(L.toggleBlockComment("x", 0, 1, "diff")).toMatchObject({ message: expect.any(String) });
  });

  test("block comment wraps a selection and unwraps it (inside or including the markers)", () => {
    const text = "x = a + b;";
    const wrapped = L.toggleBlockComment(text, 4, 9, "javascript")!;
    const t1 = apply(wrapped, text);
    expect(t1).toBe("x = /* a + b */;");
    expect(apply(L.toggleBlockComment(t1, wrapped.selStart, wrapped.selEnd, "javascript"), t1)).toBe(text);
    expect(apply(L.toggleBlockComment(t1, 4, 15, "javascript"), t1)).toBe(text);
    const inner = t1.indexOf("a + b");
    expect(apply(L.toggleBlockComment(t1, inner, inner + 5, "javascript"), t1)).toBe(text);
  });
});

describe("line operations", () => {
  const apply = (e: any, text: string) => (e && e.from !== undefined ? text.slice(0, e.from) + e.insert + text.slice(e.to) : text);

  test("indent and outdent (tabs and spaces), empty lines untouched", () => {
    const text = "a\n\n  b";
    expect(apply(L.indentLines(text, 0, text.length, "  "), text)).toBe("  a\n\n    b");
    expect(apply(L.indentLines(text, 0, text.length, "\t"), text)).toBe("\ta\n\n\t  b");
    expect(apply(L.outdentLines("    a\n\tb\n c\nd", 0, 14, "  "), "    a\n\tb\n c\nd")).toBe("  a\nb\nc\nd");
    expect(L.outdentLines("a", 0, 1, "  ")).toBeNull();
  });

  test("Tab with no selection goes to the next tab stop", () => {
    expect(L.tabAtCaret("ab", 2, "    ").insert).toBe("  ");
    expect(L.tabAtCaret("", 0, "    ").insert).toBe("    ");
    expect(L.tabAtCaret("ab", 1, "\t").insert).toBe("\t");
  });

  test("delete line: middle, first, last, only, and the caret lands sensibly", () => {
    const t = "one\ntwo\nthree";
    expect(apply(L.deleteLines(t, 5, 5), t)).toBe("one\nthree");
    expect(L.deleteLines(t, 5, 5)!.selStart).toBe(5);
    expect(apply(L.deleteLines(t, 0, 0), t)).toBe("two\nthree");
    expect(apply(L.deleteLines(t, 10, 10), t)).toBe("one\ntwo");
    expect(apply(L.deleteLines("only", 2, 2), "only")).toBe("");
    expect(apply(L.deleteLines(t, 0, 8), t)).toBe("three");
  });

  test("duplicate down and up", () => {
    const t = "a\nb\nc";
    expect(apply(L.duplicateLines(t, 2, 2, "down"), t)).toBe("a\nb\nb\nc");
    expect(L.duplicateLines(t, 2, 2, "down")!.selStart).toBe(4);
    expect(apply(L.duplicateLines(t, 2, 2, "up"), t)).toBe("a\nb\nb\nc");
    expect(apply(L.duplicateLines(t, 0, 3, "down"), t)).toBe("a\nb\na\nb\nc");
  });

  test("move lines up and down, with limits", () => {
    const t = "a\nb\nc";
    expect(apply(L.moveLines(t, 2, 2, -1), t)).toBe("b\na\nc");
    expect(apply(L.moveLines(t, 2, 2, 1), t)).toBe("a\nc\nb");
    expect(L.moveLines(t, 0, 0, -1)).toBeNull();
    expect(L.moveLines(t, 4, 4, 1)).toBeNull();
    const up = L.moveLines(t, 2, 2, -1)!;
    expect([up.selStart, up.selEnd]).toEqual([0, 0]);
  });

  test("join lines", () => {
    expect(apply(L.joinLines("a\n   b\nc", 0, 0), "a\n   b\nc")).toBe("a b\nc");
    expect(apply(L.joinLines("a\nb\nc\nd", 0, 5), "a\nb\nc\nd")).toBe("a b c\nd");
    expect(L.joinLines("last", 2, 2)).toBeNull();
    expect(apply(L.joinLines("a \nb", 0, 0), "a \nb")).toBe("a b");
  });

  test("select line and word", () => {
    expect(L.selectLine("ab\ncd", 1, 1)).toEqual({ selStart: 0, selEnd: 3 });
    expect(L.selectLine("ab\ncd", 3, 4)).toEqual({ selStart: 3, selEnd: 5 });
    expect(L.wordAt("foo_bar baz", 2)).toEqual({ selStart: 0, selEnd: 7 });
    expect(L.wordAt("foo bar", 3)).toEqual({ selStart: 0, selEnd: 3 });
    expect(L.wordAt("  ", 1)).toBeNull();
  });

  test("sort ascending and descending, ignoring case, numeric; selection or whole text", () => {
    const t = "b\nA\nc\na\n10\n9\n";
    expect(apply(L.sortLines(t, 0, 0), t)).toBe("10\n9\nA\na\nb\nc\n");
    expect(apply(L.sortLines(t, 0, 0, { descending: true }), t)).toBe("c\nb\na\nA\n9\n10\n");
    expect(apply(L.sortLines(t, 0, 0, { ignoreCase: true }), t)).toBe("10\n9\nA\na\nb\nc\n");
    expect(apply(L.sortLines("10\n9\n100", 0, 0, { numeric: true }), "10\n9\n100")).toBe("9\n10\n100");
    expect(apply(L.sortLines("c\nb\na\nz\ny", 2, 5), "c\nb\na\nz\ny")).toBe("c\na\nb\nz\ny");
    expect(L.sortLines("a\nb", 0, 0)).toMatchObject({ message: expect.stringContaining("already") });
  });

  test("remove duplicate lines keeps the first and says how many went", () => {
    const t = "a\nb\na\nc\nb\n";
    const e = L.removeDuplicateLines(t, 0, 0)!;
    expect(apply(e, t)).toBe("a\nb\nc\n");
    expect(e.message).toBe("Removed 2 duplicate lines.");
    expect(apply(L.removeDuplicateLines("A\na", 0, 0, { ignoreCase: true }), "A\na")).toBe("A");
    expect(L.removeDuplicateLines("a\nb", 0, 0)).toMatchObject({ message: expect.stringContaining("no duplicate") });
    expect(L.removeDuplicateLines("x\nx", 0, 0)!.message).toBe("Removed 1 duplicate line.");
  });

  test("trim trailing whitespace, final newline, reverse, convert indentation", () => {
    expect(apply(L.trimTrailingWhitespace("a  \nb\t\n c ", 0, 0), "a  \nb\t\n c ")).toBe("a\nb\n c");
    expect(L.ensureFinalNewline("a")).toMatchObject({ insert: "\n" });
    expect(L.ensureFinalNewline("a\n")).toMatchObject({ message: expect.any(String) });
    expect(apply(L.reverseLines("a\nb\nc", 0, 0), "a\nb\nc")).toBe("c\nb\na");
    expect(apply(L.convertIndent("\ta\n    b\n  c", "spaces", 4), "")).toBe("    a\n    b\n  c");
    expect(apply(L.convertIndent("    a\n      b", "tabs", 2), "")).toBe("\t\ta\n\t\t\tb");
    expect(L.convertIndent("a", "tabs", 4)).toBeNull();
  });

  test("case changes, on a selection or the word at the caret", () => {
    expect(apply(L.changeCase("hello world", 0, 5, "upper"), "hello world")).toBe("HELLO world");
    expect(apply(L.changeCase("hello world", 8, 8, "upper"), "hello world")).toBe("hello WORLD");
    expect(apply(L.changeCase("HELLO WORLD", 0, 11, "lower"), "HELLO WORLD")).toBe("hello world");
    expect(apply(L.changeCase("hello wORLD it's", 0, 16, "title"), "hello wORLD it's")).toBe("Hello World It's");
    expect(apply(L.changeCase("some_var-name Here", 0, 18, "camel"), "some_var-name Here")).toBe("someVarNameHere");
    expect(apply(L.changeCase("someVarName", 0, 11, "snake"), "someVarName")).toBe("some_var_name");
    expect(apply(L.changeCase("someVarName", 0, 11, "kebab"), "someVarName")).toBe("some-var-name");
    expect(L.changeCase("  ", 1, 1, "upper")).toMatchObject({ message: expect.any(String) });
  });

  test("URL encode and decode, with a friendly message for bad input", () => {
    expect(apply(L.urlEncode("a b&c/é", 0, 7), "a b&c/é")).toBe("a%20b%26c%2F%C3%A9");
    expect(apply(L.urlDecode("a%20b%26c+d", 0, 11), "a%20b%26c+d")).toBe("a b&c d");
    expect(L.urlDecode("100%", 0, 4)).toMatchObject({ message: expect.stringContaining("isn't valid") });
  });

  test("offsets, lines and columns", () => {
    const t = "ab\ncde\n\nf";
    expect(L.lineCol(t, 0)).toEqual({ line: 1, col: 1 });
    expect(L.lineCol(t, 4)).toEqual({ line: 2, col: 2 });
    expect(L.lineCol(t, t.length)).toEqual({ line: 4, col: 2 });
    expect(L.offsetOf(t, 2, 3)).toBe(5);
    expect(L.offsetOf(t, 2, 99)).toBe(6);
    expect(L.offsetOf(t, 99)).toBe(t.length);
    const starts = L.buildLineStarts(t);
    expect(starts).toEqual([0, 3, 7, 8]);
    expect([L.lineAt(starts, 0), L.lineAt(starts, 2), L.lineAt(starts, 3), L.lineAt(starts, 8)]).toEqual([0, 0, 1, 3]);
  });
});

describe("typing helpers", () => {
  test("Enter keeps the indentation, adds a level after an opening bracket, and opens a block between { and }", () => {
    const e1 = L.newLineEdit("  foo", 5, 5, "javascript", "  ")!;
    expect(e1.insert).toBe("\n  ");
    expect(L.newLineEdit("  if (x) {", 10, 10, "javascript", "  ")!.insert).toBe("\n    ");
    const e3 = L.newLineEdit("  {}", 3, 3, "javascript", "  ")!;
    expect(e3.insert).toBe("\n    \n  ");
    expect(e3.selStart).toBe(3 + 1 + 4);
    expect(L.newLineEdit("def f():", 8, 8, "python", "    ")!.insert).toBe("\n    ");
    expect(L.newLineEdit("<div></div>", 5, 5, "html", "  ")!.insert).toBe("\n  \n");
    expect(L.newLineEdit("\tx", 2, 2, "plain", "\t")!.insert).toBe("\n\t");
  });

  test("Enter continues Markdown lists and ends them on an empty item", () => {
    expect(L.newLineEdit("- item", 6, 6, "markdown", "  ")!.insert).toBe("\n- ");
    expect(L.newLineEdit("  9. item", 9, 9, "markdown", "  ")!.insert).toBe("\n  10. ");
    expect(L.newLineEdit("- [x] done", 10, 10, "markdown", "  ")!.insert).toBe("\n- [ ] ");
    const end = L.newLineEdit("a\n- ", 4, 4, "markdown", "  ")!;
    expect([end.from, end.to, end.insert]).toEqual([2, 4, ""]);
  });

  test("brackets and quotes close themselves, wrap a selection, and are stepped over", () => {
    expect(L.typedCharEdit("", 0, 0, "(", "javascript")).toMatchObject({ insert: "()", selStart: 1 });
    expect(L.typedCharEdit("a", 0, 0, "(", "javascript")).toBeNull();
    expect(L.typedCharEdit("foo", 3, 3, "[", "javascript")).toMatchObject({ insert: "[]" });
    expect(L.typedCharEdit("ab", 0, 2, "(", "javascript")).toMatchObject({ insert: "(ab)", selStart: 1, selEnd: 3 });
    expect(L.typedCharEdit("()", 1, 1, ")", "javascript")).toEqual({ move: 2 });
    expect(L.typedCharEdit("", 0, 0, '"', "javascript")).toMatchObject({ insert: '""' });
    expect(L.typedCharEdit("it", 2, 2, "'", "javascript")).toBeNull();
    expect(L.typedCharEdit("", 0, 0, '"', "plain")).toBeNull();
    expect(L.typedCharEdit("", 0, 0, "(", "plain")).toMatchObject({ insert: "()" });
    expect(L.typedCharEdit('""', 1, 1, '"', "javascript")).toEqual({ move: 2 });
    expect(L.typedCharEdit("", 0, 0, "x", "javascript")).toBeNull();
    expect(L.typedCharEdit("", 0, 0, "'", "rust")).toBeNull();
  });

  test("Backspace removes an empty pair, or one level of space indentation", () => {
    expect(L.backspaceEdit("a()", 2, 2, "  ")).toMatchObject({ from: 1, to: 3 });
    expect(L.backspaceEdit('""', 1, 1, "  ")).toMatchObject({ from: 0, to: 2 });
    expect(L.backspaceEdit("      x", 6, 6, "    ")).toMatchObject({ from: 4, to: 6 });
    expect(L.backspaceEdit("    x", 4, 4, "    ")).toMatchObject({ from: 0, to: 4 });
    expect(L.backspaceEdit("ab", 2, 2, "  ")).toBeNull();
    expect(L.backspaceEdit("  \tx", 3, 3, "\t")).toBeNull();
  });

  test("bracket matching both ways, nesting, and giving up when there is no partner", () => {
    const t = "f(a[1], {b: (c)})";
    expect(L.findMatchingBracket(t, 1)).toEqual({ open: 1, close: 16 });
    expect(L.findMatchingBracket(t, 17)).toEqual({ open: 1, close: 16 });
    expect(L.findMatchingBracket(t, 3)).toEqual({ open: 3, close: 5 });
    expect(L.findMatchingBracket(t, 16)).toEqual({ open: 1, close: 16 });
    expect(L.findMatchingBracket("(((", 0)).toBeNull();
    expect(L.findMatchingBracket("abc", 1)).toBeNull();
    expect(L.findMatchingBracket("(" + "x".repeat(200_000) + ")", 0, 1000)).toBeNull();
  });

  test("indentation and line-ending detection", () => {
    expect(L.detectIndent("a\n  b\n    c\n  d\n")).toEqual({ useTabs: false, size: 2 });
    expect(L.detectIndent("a\n    b\n        c\n    d")).toEqual({ useTabs: false, size: 4 });
    expect(L.detectIndent("a\n\tb\n\t\tc")).toEqual({ useTabs: true, size: null });
    expect(L.detectIndent("a\nb")).toEqual({ useTabs: false, size: null });
    expect(L.detectIndent("")).toEqual({ useTabs: false, size: null });
    expect(L.detectIndent("a\n   b\n   c\n")).toEqual({ useTabs: false, size: 3 });
    expect(L.detectEol("a\nb\n")).toEqual({ eol: "lf", mixed: false });
    expect(L.detectEol("a\r\nb\r\n")).toEqual({ eol: "crlf", mixed: false });
    expect(L.detectEol("a\rb")).toEqual({ eol: "cr", mixed: false });
    expect(L.detectEol("a\r\nb\nc\r\n")).toEqual({ eol: "crlf", mixed: true });
    expect(L.detectEol("none")).toEqual({ eol: "lf", mixed: false });
    expect(L.indentUnit({ useTabs: true, size: null })).toBe("\t");
    expect(L.indentUnit({ useTabs: false, size: 3 })).toBe("   ");
    expect(L.indentUnit({ useTabs: false, size: null })).toBe("  ");
  });

  test("statistics", () => {
    expect(L.textStats("")).toEqual({ chars: 0, words: 0, lines: 1 });
    expect(L.textStats("one two\nthree\n")).toEqual({ chars: 14, words: 3, lines: 2 });
    expect(L.textStats("a\n\nb")).toEqual({ chars: 4, words: 2, lines: 3 });
  });

  test("bookmarks: toggle, step with wrap-around, and follow edits", () => {
    expect(L.toggleBookmark([], 5)).toEqual([5]);
    expect(L.toggleBookmark([3, 5], 4)).toEqual([3, 4, 5]);
    expect(L.toggleBookmark([3, 4, 5], 4)).toEqual([3, 5]);
    expect(L.stepBookmark([3, 7, 9], 3, 1)).toBe(7);
    expect(L.stepBookmark([3, 7, 9], 9, 1)).toBe(3);
    expect(L.stepBookmark([3, 7, 9], 7, -1)).toBe(3);
    expect(L.stepBookmark([3, 7, 9], 3, -1)).toBe(9);
    expect(L.stepBookmark([], 3, 1)).toBeNull();
    expect(L.shiftBookmarks([2, 5, 8], 4, 2)).toEqual([2, 5, 10].map((v, i) => (i === 1 ? 7 : v)).map((v) => v).slice(0, 0).concat([2, 7, 10]));
    expect(L.shiftBookmarks([2, 5, 8], 4, -2)).toEqual([2, 8 - 2]);
    expect(L.shiftBookmarks([2, 5], 4, 0)).toEqual([2, 5]);
  });
});

describe("find and replace", () => {
  const f = (text: string, query: string, o: object = {}) => L.findAll(text, { query, ...o });

  test("plain text, case, whole word", () => {
    expect(f("Foo foo FOO", "foo").matches.map((m: any) => m.index)).toEqual([0, 4, 8]);
    expect(f("Foo foo FOO", "foo", { caseSensitive: true }).matches.map((m: any) => m.index)).toEqual([4]);
    expect(f("foo foobar barfoo foo_x $foo", "foo", { wholeWord: true }).matches.map((m: any) => m.index)).toEqual([0]);
    expect(f("a.b a+b", "a.b").matches.length).toBe(1);
    expect(f("a $x b", "$x", { wholeWord: true }).matches.length).toBe(1);
  });

  test("regular expressions, with line anchors", () => {
    expect(f("a1 b22 c333", "\\d+", { regex: true }).matches.map((m: any) => m.text)).toEqual(["1", "22", "333"]);
    expect(f("one\ntwo\nthree", "^t", { regex: true }).matches.map((m: any) => m.index)).toEqual([4, 8]);
    expect(f("ab", "(a)(?<second>b)", { regex: true }).matches[0]).toMatchObject({ groups: ["a", "b"], named: { second: "b" } });
  });

  test("bad patterns return an error instead of throwing", () => {
    for (const q of ["(", "[", "*a", "a{2,1}", "\\", "(?<n", "(?<=a"]) {
      const r = f("text", q, { regex: true });
      expect(r.matches).toEqual([]);
      expect(r.error, q).toMatch(/isn't valid/);
    }
    expect(f("x", "").matches).toEqual([]);
    expect(f("x", "a".repeat(1001)).matches).toEqual([]);
  });

  test("evil patterns are refused before they can run", () => {
    for (const q of ["(a+)+$", "(a*)*b", "(.*)*x", "(\\w+\\s?)*$", "(x+x+)+y", "(a|a)*b", "(a|aa)+$", "(.|a)*", "(a|)*b", "(?:a+)+", "((a+))+", "(a+){2,}", "([a-z]+)*end"]) {
      const r = f("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!", q, { regex: true });
      expect(r.error, q).toMatch(/very long time/);
    }
    // still allowed
    for (const q of ["(ab)+", "(a|b)+", "(foo|bar)*baz", "\\d+(\\.\\d+)?", "[a-z]+@[a-z]+\\.com", "(?:x|y){2,5}", "^\\s*$", "a++b".replace("++", "+"), "(a+)?b", "\\(a+\\)+"]) {
      expect(L.regexRisk(q), q).toBe("");
    }
  });

  test("a huge number of matches is cut off, not hung", () => {
    const r = f("a".repeat(100_000), "a");
    expect(r.truncated).toBe(true);
    expect(r.matches.length).toBe(20_000);
    expect(f("ab".repeat(10), "x*", { regex: true }).matches).toEqual([]);
    expect(L.findAll("abc", { query: "x*", regex: true }, { allowEmpty: true }).matches.length).toBe(4);
  });

  test("next and previous match wrap around", () => {
    const t = "a1 a2 a3";
    const s = { query: "a\\d", regex: true };
    expect(L.nextMatch(t, 0, s)).toEqual({ index: 0, length: 2 });
    expect(L.nextMatch(t, 1, s)).toEqual({ index: 3, length: 2 });
    expect(L.nextMatch(t, 7, s)).toEqual({ index: 0, length: 2 });
    expect(L.nextMatch(t, 7, s, false)).toBeNull();
    expect(L.previousMatch(t, 3, s)).toEqual({ index: 0, length: 2 });
    expect(L.previousMatch(t, 0, s)).toEqual({ index: 6, length: 2 });
    expect(L.previousMatch(t, 0, s, false)).toBeNull();
    expect(L.nextMatch(t, 0, { query: "(" , regex: true })).toBeNull();
  });

  test("replace: literal text keeps $ as is; regex mode expands $1, $&, $<name>, $$ and \\n", () => {
    expect(L.replaceAll("a.b a.b", { query: "a.b" }, "$&$1")).toEqual({ text: "$&$1 $&$1", count: 2, error: "" });
    expect(L.replaceAll("John Smith", { query: "(\\w+) (\\w+)", regex: true }, "$2, $1")).toMatchObject({ text: "Smith, John", count: 1 });
    expect(L.replaceAll("abc", { query: "b", regex: true }, "[$&]")).toMatchObject({ text: "a[b]c" });
    expect(L.replaceAll("abc", { query: "(?<x>b)", regex: true }, "<$<x>>")).toMatchObject({ text: "a<b>c" });
    expect(L.replaceAll("abc", { query: "b", regex: true }, "$$")).toMatchObject({ text: "a$c" });
    expect(L.replaceAll("a,b", { query: ",", regex: true }, "\\n")).toMatchObject({ text: "a\nb" });
    expect(L.replaceAll("abc", { query: "(b)", regex: true }, "$2$1")).toMatchObject({ text: "a$2bc" });
    expect(L.replaceAll("abc", { query: "x" }, "y")).toEqual({ text: "abc", count: 0, error: "" });
    expect(L.replaceAll("abc", { query: "(" , regex: true }, "y").error).toMatch(/isn't valid/);
    expect(L.replaceAll("aaa", { query: "a*", regex: true }, "X")).toMatchObject({ text: "X" });
    expect(L.replaceAll("Foo foo", { query: "foo" }, "bar")).toMatchObject({ text: "bar bar" });
    expect(L.replaceAll("a\nb", { query: "^", regex: true }, "> ")).toMatchObject({ count: 0 });
  });

  test("replacing one match", () => {
    expect(L.replacementAt("x1 x2", 3, { query: "x(\\d)", regex: true }, "y$1")).toEqual({ length: 2, insert: "y2" });
    expect(L.replacementAt("x1 x2", 1, { query: "x(\\d)", regex: true }, "y$1")).toBeNull();
  });

  test("the regex sandbox lists matches with positions and groups, and explains problems", () => {
    const r = L.runRegexSandbox("(\\w)(\\d)", "g", "a1 b2\nc3");
    expect(r.matches.map((m: any) => [m.text, m.line, m.col, m.groups])).toEqual([["a1", 1, 1, ["a", "1"]], ["b2", 1, 4, ["b", "2"]], ["c3", 2, 1, ["c", "3"]]]);
    expect(L.runRegexSandbox("a", "i", "A a").matches.length).toBe(2);
    expect(L.runRegexSandbox("(", "g", "x").error).toMatch(/isn't valid/);
    expect(L.runRegexSandbox("a", "gz", "x").error).toMatch(/flags/);
    expect(L.runRegexSandbox("a", "gg", "x").error).toMatch(/flags/);
    expect(L.runRegexSandbox("(a+)+", "g", "aaa").error).toMatch(/very long time/);
    expect(L.runRegexSandbox("", "g", "x").matches).toEqual([]);
    expect(L.runRegexSandbox("a*", "g", "baab").matches.length).toBe(4);
    expect(L.runRegexSandbox(".", "g", "x".repeat(2000)).truncated).toBe(true);
    expect(L.runRegexSandbox("(?<n>b)", "", "abc").matches[0]!.named).toEqual({ n: "b" });
  });
});

describe("symbols (outline)", () => {
  const names = (lang: string, text: string) => L.extractSymbols(text, lang).map((s: any) => `${s.kind}:${s.name}@${s.line}`);

  test("JavaScript and TypeScript", () => {
    const js = "export function a() {}\nclass B extends C {\n  method(x) {\n    if (x) {\n    }\n  }\n  static async load() {}\n}\nconst f = (x) => x;\nconst g = async function () {};\nexport default async function* gen() {}\n";
    expect(names("javascript", js)).toEqual(["function:a@1", "class:B@2", "method:method@3", "method:load@7", "function:f@9", "function:g@10", "function:gen@11"]);
    const ts = "interface I { a: 1 }\nexport type T<A> = A | B;\nenum E { A }\nnamespace N.M {}\nexport const h = (a: number): string => `x`;\nabstract class K {}";
    expect(names("typescript", ts)).toEqual(["interface:I@1", "type:T@2", "enum:E@3", "namespace:N.M@4", "function:h@5", "class:K@6"]);
  });

  test("Python, Go, Rust", () => {
    expect(names("python", "class A:\n    def m(self):\n        pass\n\nasync def top():\n    pass\n")).toEqual(["class:A@1", "method:m@2", "function:top@5"]);
    expect(L.extractSymbols("class A:\n    def m(self):\n", "python")[1]!.level).toBe(1);
    expect(names("go", "package x\nfunc main() {}\nfunc (s *Server) Start() error {\n}\ntype P struct {\n}\ntype Q interface {\n}")).toEqual(["function:main@2", "method:Server.Start@3", "struct:P@5", "interface:Q@7"]);
    expect(names("rust", "pub fn a() {}\nstruct S;\nimpl Foo for Bar {\n}\nimpl<T> Baz<T> {\n}\npub(crate) async fn b() {}\nmod m {}\ntrait T {}")).toEqual(["function:a@1", "struct:S@2", "impl:Foo for Bar@3", "impl:Baz<T>@5", "function:b@7", "mod:m@8", "trait:T@9"]);
  });

  test("C, C++, Java, C#, Kotlin, Swift, PHP, Ruby, Lua, shell", () => {
    expect(names("c", "#include <x.h>\nstruct point {\n  int x;\n};\nstatic int add(int a, int b)\n{\n  if (a) { return 1; }\n  return a + b;\n}\nint main(void) {\n  foo(1);\n}")).toEqual(["struct:point@2", "function:add@5", "function:main@10"]);
    expect(names("cpp", "namespace n {\nclass Foo {\n};\n}\nvoid Foo::bar() {}")).toEqual(["namespace:n@1", "class:Foo@2", "function:Foo::bar@5"]);
    expect(names("java", "public class A {\n  public static void main(String[] args) {\n  }\n  private int f() { return 1; }\n}\ninterface I {}")).toEqual(["class:A@1", "method:main@2", "method:f@4", "interface:I@6"]);
    expect(names("csharp", "namespace X.Y {\n  public class C {\n    public void Run() {}\n  }\n}")).toEqual(["namespace:X.Y@1", "class:C@2", "method:Run@3"]);
    expect(names("kotlin", "class A\nfun main() {}\nprivate fun String.ext() = 1\nobject O")).toEqual(["class:A@1", "function:main@2", "function:ext@3", "object:O@4"]);
    expect(names("swift", "struct S {}\nfunc f() {}\nprotocol P {}\nextension S {}")).toEqual(["struct:S@1", "function:f@2", "protocol:P@3", "extension:S@4"]);
    expect(names("php", "<?php\nclass A {\n  public function b() {}\n}\nfunction c() {}")).toEqual(["class:A@2", "function:b@3", "function:c@5"]);
    expect(names("ruby", "module M\n  class A\n    def b; end\n    def self.c; end\n  end\nend")).toEqual(["module:M@1", "class:A@2", "method:b@3", "method:c@4"]);
    expect(names("lua", "local function a() end\nfunction M.b() end\nlocal c = function() end")).toEqual(["function:a@1", "function:M.b@2", "function:c@3"]);
    expect(names("shell", "build() {\n}\nfunction deploy {\n}\nfoo () { :; }")).toEqual(["function:build@1", "function:deploy@3", "function:foo@5"]);
  });

  test("Markdown headings skip fenced code; HTML headings; CSS rules; JSON keys; YAML; TOML; INI; SQL; Make; Docker; diff", () => {
    expect(names("markdown", "# One\ntext\n```\n# not a heading\n```\n## Two ##\n")).toEqual(["heading:One@1", "heading:Two@6"]);
    expect(L.extractSymbols("# a\n## b\n### c", "markdown").map((s: any) => s.level)).toEqual([0, 1, 2]);
    expect(names("html", '<h1>Title</h1>\n<section id="intro"><h2><b>Sub</b></h2>')).toEqual(["heading:Title@1", "heading:Sub@2", "element:#intro@2"]);
    expect(names("css", ".a, .b {\n  color: red;\n}\n@media (x) {\n  .c { }\n}\nbody {")).toEqual(["rule:.a, .b@1", "at-rule:@media (x)@4", "rule:body@7"]);
    expect(names("json", '{\n  "name": "x",\n  "deps": {\n    "inner": 1\n  },\n  "v": 2\n}')).toEqual(["key:name@2", "key:deps@3", "key:v@6"]);
    expect(names("yaml", "a: 1\nb:\n  c: 2\nd-e: 3")).toEqual(["key:a@1", "key:b@2", "key:d-e@4"]);
    expect(names("toml", "[package]\nname = 1\n[[bin]]")).toEqual(["section:package@1", "section:bin@3"]);
    expect(names("ini", "[a]\nk=v\n[b c]")).toEqual(["section:a@1", "section:b c@3"]);
    expect(names("sql", "CREATE TABLE IF NOT EXISTS users (id int);\ncreate or replace view v as select 1;")).toEqual(["table:users@1", "view:v@2"]);
    expect(names("makefile", "CC = gcc\nbuild: main.o\n\tcc\nclean:\n")).toEqual(["target:build@2", "target:clean@4"]);
    expect(names("dockerfile", "FROM node:20 AS build\nRUN x\nFROM nginx")).toEqual(["stage:build@1", "stage:nginx@3"]);
    expect(names("diff", "diff --git a/x.ts b/x.ts\n+a")).toEqual(["file:x.ts@1"]);
    expect(names("plain", "anything")).toEqual([]);
  });

  test("symbolAt finds the enclosing symbol, and long or evil lines don't hang", () => {
    const syms = L.extractSymbols("function a() {}\n\nfunction b() {}", "javascript");
    expect(L.symbolAt(syms, 2)).toMatchObject({ name: "a" });
    expect(L.symbolAt(syms, 3)).toMatchObject({ name: "b" });
    expect(L.symbolAt(syms, 0)).toBeNull();
    const started = performance.now();
    for (const lang of ["c", "cpp", "javascript", "java", "rust", "python", "go", "csharp"]) L.extractSymbols(`${"int ".repeat(40)}x(`.repeat(2000).split("(").join("\n"), lang);
    L.extractSymbols(("a ".repeat(75) + "\n").repeat(5000), "c");
    L.extractSymbols(("static ".repeat(20) + "\n").repeat(5000), "csharp");
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

describe("formatting", () => {
  test("JSON: pretty-printed, minified, numbers kept exactly, empty containers compact", () => {
    const src = '{"a":1,"b":[1,2,{"c":null}],"d":{},"e":[],"big":12345678901234567890,"f":1.50,"s":"x\\"y"}';
    expect(L.formatJson(src).text).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    {\n      "c": null\n    }\n  ],\n  "d": {},\n  "e": [],\n  "big": 12345678901234567890,\n  "f": 1.50,\n  "s": "x\\"y"\n}');
    expect(L.formatJson(src, "\t").text).toContain('\n\t"a": 1');
    expect(L.minifyJson(L.formatJson(src).text!).text).toBe(src);
    expect(L.formatJson("[1,2]\n").text).toBe("[\n  1,\n  2\n]\n");
    expect(L.formatJson("  7  ").text).toBe("7");
    expect(L.formatJson('"a:b,c"').text).toBe('"a:b,c"');
  });

  test("JSON mistakes are explained with their position", () => {
    const bad = (s: string) => (L.formatJson(s) as any).error;
    expect(bad('{"a":1,}')).toMatchObject({ line: 1, col: 8 });
    expect(bad('{"a":1,}').message).toMatch(/double quotes/);
    expect(bad("{a:1}").message).toMatch(/isn't valid JSON/);
    expect(bad('{"a":1\n"b":2}')).toMatchObject({ line: 2, col: 1 });
    expect(bad('{"a":1\n"b":2}').message).toMatch(/comma/);
    expect(bad("[1,2").message).toMatch(/ends too soon/);
    expect(bad("").message).toMatch(/no JSON/);
    expect(bad("{} {}").message).toMatch(/extra text/);
    expect(bad("// c\n{}").message).toMatch(/comments/);
    expect(bad("{'a':1}").message).toMatch(/double quotes/);
    expect(bad('"abc').message).toMatch(/never ends/);
    expect(bad('"a\nb"').message).toMatch(/line break/);
    expect(bad('"\\q"').message).toMatch(/escape/);
    expect(bad('"\\u12"').message).toMatch(/hex/);
    expect(bad("[01]").message).toMatch(/isn't valid/);
    expect(bad('{"a" 1}').message).toMatch(/colon/);
    expect(bad("[,]").message).toMatch(/value was expected/);
    expect(bad("]").message).toMatch(/value was expected/);
    expect((L.minifyJson("{bad") as any).error).toBeTruthy();
  });

  test("CSS formatting and minifying leave strings and comments alone", () => {
    const src = 'a,b{color:red;background:url("x;y.png")}\n@media (max-width:600px){.c{margin:0 auto}}/* keep: this */';
    const pretty = L.formatCss(src).text!;
    expect(pretty).toBe('a, b {\n  color: red;\n  background: url("x;y.png")\n}\n\n@media (max-width:600px) {\n  .c {\n    margin: 0 auto\n  }\n}\n\n/* keep: this */\n');
    expect(L.formatCss(L.formatCss(src).text!).text).toBe(pretty);
    expect(L.minifyCss("a {\n  color: red ;\n  margin: 0  auto;\n}\n/* gone */\n.b > .c{x:y}").text).toBe("a{color:red;margin:0 auto}.b>.c{x:y}");
    expect(L.minifyCss('a::after{content:"a  b ; c"}').text).toBe('a::after{content:"a  b ; c"}');
    expect(L.minifyCss("/*! keep */a{}").text).toBe("/*! keep */a{}");
    expect(L.formatCss("a:hover{color:red}").text).toBe("a:hover {\n  color: red\n}\n");
  });

  test("C-family re-indentation by bracket depth, leaving strings, comments and templates alone", () => {
    const src = "function f(a) {\nif (a) {\nreturn [1,\n2];\n} else {\nx(`a\n  b`);\n}\n/* c\n   d */\n}\n";
    expect(L.reindentCode(src, "javascript").text).toBe("function f(a) {\n  if (a) {\n    return [1,\n      2];\n  } else {\n    x(`a\n  b`);\n  }\n  /* c\n   d */\n}\n");
    expect(L.reindentCode("{\n// }\n\"}\"\n}", "javascript").text).toBe("{\n  // }\n  \"}\"\n}");
    expect(L.reindentCode("}\n}\nx", "go", "\t").text).toBe("}\n}\nx");
  });

  test("HTML tidy: block elements on their own lines, inline text together, scripts and styles formatted, pre untouched", () => {
    const src = '<!DOCTYPE html><html><head><title>Hi</title><style>a{color:red}</style></head><body><div class="a"><p>Some <b>bold</b> and <a href="x">link</a>.</p><ul><li>One</li><li>Two</li></ul><br><pre>  keep\n   this </pre></div><script>if(a){b()}</script></body></html>';
    const out = L.formatCode("html", src).text!;
    expect(out).toBe([
      "<!DOCTYPE html>", "<html>", "  <head>", "    <title>Hi</title>", "    <style>", "      a {", "        color: red", "      }", "    </style>", "  </head>", "  <body>",
      '    <div class="a">', "      <p>Some <b>bold</b> and <a href=\"x\">link</a>.</p>", "      <ul>", "        <li>One</li>", "        <li>Two</li>", "      </ul>", "      <br>",
      "      <pre>  keep\n   this </pre>", "    </div>", "    <script>", "      if(a){b()}", "    </script>", "  </body>", "</html>", "",
    ].join("\n"));
    expect(L.formatCode("html", out).text).toBe(out);
    expect(L.formatHtml("<a>unclosed <b>x", "  ", (c: string) => ({ text: c }), (c: string) => ({ text: c })).text).toContain("<a>");
    expect(L.formatHtml("</p>stray", "  ", (c: string) => ({ text: c }), (c: string) => ({ text: c })).text).toBe("</p>stray\n");
    expect((L.formatHtml("<div>".repeat(400), "  ", (c: string) => ({ text: c }), (c: string) => ({ text: c })) as any).error).toBeTruthy();
    expect(L.formatCode("xml", "<a><b>1</b><c/></a>").text).toBe("<a>\n  <b>1</b>\n  <c/>\n</a>\n");
  });

  test("formatting and minifying say when they can't", () => {
    expect(L.formatCode("python", "x")).toMatchObject({ message: expect.stringContaining("isn't available") });
    expect(L.minifyCode("python", "x")).toMatchObject({ message: expect.stringContaining("JSON and CSS") });
    expect(L.formatCode("json", "{").error).toBeTruthy();
  });
});

describe("Markdown reader", () => {
  const tree = (s: string) => L.parseMarkdown(s).nodes;
  const tags = (nodes: any[]): any[] => nodes.map((n) => (n.children ? [n.tag, tags(n.children)] : n.tag === "#text" ? n.text : n.tag));

  test("headings, paragraphs, emphasis, code, links, images", () => {
    expect(tags(tree("# Title\n\nHello *world* and **bold** and ~~gone~~ and `code`.\n\n![alt text](http://x/y.png) [link](http://x \"t\") <https://auto.link>"))).toEqual([
      ["h1", ["Title"]],
      ["p", ["Hello ", ["em", ["world"]], " and ", ["strong", ["bold"]], " and ", ["del", ["gone"]], " and ", "code", "."]],
      ["p", ["img", " ", ["a", ["link"]], " ", ["a", ["https://auto.link"]]]],
    ]);
    const p = tree("![alt text](http://x/y.png) [link](http://x/ \"t\")")[0].children;
    expect(p[0]).toEqual({ tag: "img", alt: "alt text", src: "http://x/y.png" });
    expect(p[2]).toMatchObject({ tag: "a", href: "http://x/" });
  });

  test("raw HTML stays text (never becomes markup)", () => {
    const t = tree("<script>alert(1)</script> <b>x</b>");
    expect(JSON.stringify(t)).not.toContain('"tag":"script"');
    expect(t[0].tag).toBe("p");
    expect(t[0].children.every((c: any) => c.tag === "#text")).toBe(true);
    expect(t[0].children.map((c: any) => c.text).join("")).toBe("<script>alert(1)</script> <b>x</b>");
  });

  test("lists: nested, ordered with a start, tasks, tight and loose", () => {
    const t = tree("- a\n- b\n  - b1\n  - b2\n- c\n\n3. x\n4. y\n\n- [ ] todo\n- [x] done");
    expect(t[0].tag).toBe("ul");
    expect(t[0].children.length).toBe(3);
    expect(t[0].children[1].children.map((c: any) => c.tag)).toEqual(["#inline", "ul"]);
    expect(t[0].children[1].children[1].children.length).toBe(2);
    expect(t[1]).toMatchObject({ tag: "ol", start: 3 });
    expect(t[2].children.map((c: any) => c.checked)).toEqual([false, true]);
  });

  test("fenced code keeps its text and language; blockquotes nest; rules; tables with alignment", () => {
    const t = tree("```ts\nlet a = 1;\n  # not heading\n```\n\n> quoted\n> more\n\n---\n\n| A | B |\n|:--|--:|\n| 1 | **2** |\n| 3 |");
    expect(t[0]).toEqual({ tag: "pre", lang: "ts", text: "let a = 1;\n  # not heading" });
    expect(t[1].tag).toBe("blockquote");
    expect(t[1].children[0].tag).toBe("p");
    expect(t[2].tag).toBe("hr");
    const table = t[3];
    expect(table.tag).toBe("table");
    const [thead, tbody] = table.children;
    expect(thead.children[0].children.map((c: any) => [c.tag, c.align])).toEqual([["th", "left"], ["th", "right"]]);
    expect(tbody.children.length).toBe(2);
    expect(tbody.children[0].children[1].children[0].tag).toBe("strong");
    expect(tbody.children[1].children[1].children).toEqual([]);
  });

  test("setext headings, hard breaks, escapes, indented code", () => {
    expect(tree("Title\n=====\n\nSub\n---")[0]).toMatchObject({ tag: "h1" });
    expect(tree("Title\n=====\n\nSub\n---")[1]).toMatchObject({ tag: "h2" });
    expect(tags(tree("a  \nb"))).toEqual([["p", ["a", "br", "b"]]]);
    expect(tags(tree("\\*not em\\*"))).toEqual([["p", ["*not em*"]]]);
    expect(tree("    code here\n    more")[0]).toEqual({ tag: "pre", lang: "", text: "code here\nmore" });
  });

  test("hostile and huge inputs stay bounded", () => {
    const started = performance.now();
    L.parseMarkdown("*".repeat(100_000));
    L.parseMarkdown("[a](".repeat(5000));
    L.parseMarkdown("> ".repeat(2000) + "x");
    L.parseMarkdown("- ".repeat(2000) + "x");
    L.parseMarkdown("`".repeat(50_000));
    L.parseMarkdown("_a_ ".repeat(20_000));
    L.parseMarkdown("| a |\n|---|\n".repeat(2000));
    L.parseMarkdown("a\n".repeat(200_000));
    expect(L.parseMarkdown("x".repeat(600_000)).truncated).toBe(true);
    expect(performance.now() - started).toBeLessThan(4000);
  });
});

describe("keyboard shortcuts", () => {
  const key = (over: object) => ({ key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

  test("Mod is Command on a Mac and Control elsewhere, and the other one doesn't count", () => {
    expect(L.matchShortcut(key({ key: "s", metaKey: true }), "Mod+S", "darwin")).toBe(true);
    expect(L.matchShortcut(key({ key: "s", ctrlKey: true }), "Mod+S", "darwin")).toBe(false);
    expect(L.matchShortcut(key({ key: "s", ctrlKey: true }), "Mod+S", "linux")).toBe(true);
    expect(L.matchShortcut(key({ key: "s", metaKey: true }), "Mod+S", "linux")).toBe(false);
    expect(L.matchShortcut(key({ key: "S", ctrlKey: true, shiftKey: true }), "Mod+S", "linux")).toBe(false);
    expect(L.matchShortcut(key({ key: "S", ctrlKey: true, shiftKey: true }), "Mod+Shift+S", "linux")).toBe(true);
  });

  test("Alt shortcuts use the physical key (Option changes the typed letter on a Mac)", () => {
    expect(L.matchShortcut(key({ key: "˜", code: "KeyN", altKey: true }), "Alt+N", "darwin")).toBe(true);
    expect(L.matchShortcut(key({ key: "ArrowUp", altKey: true }), "Alt+ArrowUp", "linux")).toBe(true);
    expect(L.matchShortcut(key({ key: "ArrowUp", altKey: true, shiftKey: true }), "Alt+ArrowUp", "linux")).toBe(false);
  });

  test("lookup of the command for a key press: the keys this tab uses, and no accidental clashes", () => {
    const cmd = (e: object, p = "linux") => L.commandForEvent(key(e), p);
    expect(cmd({ key: "Enter", ctrlKey: true })).toBe("run");
    expect(cmd({ key: "Enter", metaKey: true }, "darwin")).toBe("run");
    expect(cmd({ key: "b", ctrlKey: true })).toBe("build");
    expect(cmd({ key: "/", ctrlKey: true })).toBe("toggleComment");
    expect(cmd({ key: "+", ctrlKey: true, shiftKey: true })).toBe("zoomIn");
    expect(cmd({ key: "=", ctrlKey: true })).toBe("zoomIn");
    expect(cmd({ key: "F3" })).toBe("findNext");
    expect(cmd({ key: "F3", shiftKey: true })).toBe("findPrev");
    expect(cmd({ key: "d", ctrlKey: true })).toBe("duplicate");
    // undo and redo are bound here: a native window without an Edit menu doesn't pass Ctrl/Cmd+Z to the text box
    expect(cmd({ key: "z", ctrlKey: true })).toBe("undo");
    expect(cmd({ key: "z", metaKey: true }, "darwin")).toBe("undo");
    expect(cmd({ key: "z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(cmd({ key: "y", ctrlKey: true })).toBe("redo");
    expect(cmd({ key: "a", ctrlKey: true })).toBeNull();
    expect(cmd({ key: "x" })).toBeNull();
    const seen = new Map<string, string>();
    for (const [id, specs] of Object.entries(L.KEYMAP)) for (const spec of specs as string[]) {
      const norm = JSON.stringify(L.parseShortcut(spec));
      expect(seen.get(norm), `${spec} used by ${id} and ${seen.get(norm)}`).toBeUndefined();
      seen.set(norm, id);
    }
  });

  test("shortcuts are shown the way each system writes them", () => {
    expect(L.formatShortcut("Mod+Shift+S", "darwin")).toBe("⌘⇧S");
    expect(L.formatShortcut("Mod+Shift+S", "linux")).toBe("Ctrl+Shift+S");
    expect(L.formatShortcut("Alt+ArrowUp", "linux")).toBe("Alt+Up");
    expect(L.formatShortcut("Mod+Enter", "darwin")).toBe("⌘↩");
    expect(L.formatShortcut("F3", "linux")).toBe("F3");
    expect(L.shortcutText("save", "linux")).toBe("Ctrl+S");
    expect(L.shortcutText("nope", "linux")).toBe("");
  });
});

describe("Run and Build presets: quoting and expansion", () => {
  const q = L.quoteArg;
  const nasty = ["/home/me/it's here.ts", "/tmp/a b/c.ts", "/tmp/$HOME/`id`.ts", "/tmp/a;b&c|d.ts", "/tmp/(x)/{y}.ts", "/tmp/a\"b.ts", "/tmp/*?[x].ts", "/tmp/~/x.ts", "/tmp/a\\b.ts", "/tmp/é中😀.ts", "", " ", "-rf", "/tmp/a#b!c%d^e.ts", "/tmp/tab\tin.ts"];

  test("POSIX: plain paths stay plain, everything else goes in single quotes with ' escaped", () => {
    expect(q("/home/me/app.ts")).toEqual({ text: "/home/me/app.ts" });
    expect(q("/home/me/it's here.ts")).toEqual({ text: "'/home/me/it'\\''s here.ts'" });
    expect(q("/tmp/$HOME/`id`.ts")).toEqual({ text: "'/tmp/$HOME/`id`.ts'" });
    expect(q("")).toEqual({ text: "''" });
    expect(q("~")).toEqual({ text: "'~'" });
    expect(q("/tmp/a;b&c|d")).toEqual({ text: "'/tmp/a;b&c|d'" });
  });

  test("what the shell would read back is exactly the original (POSIX, run through a real shell)", () => {
    if (process.platform === "win32") return;
    for (const value of nasty) {
      const quoted = q(value).text!;
      const r = Bun.spawnSync(["sh", "-c", `printf '%s' ${quoted}`]);
      expect(r.stdout.toString(), value).toBe(value);
    }
  });

  test("PowerShell: single quotes, with ' and curly quotes doubled", () => {
    expect(q("C:\\Users\\me\\app.ts", "powershell")).toEqual({ text: "C:\\Users\\me\\app.ts" });
    expect(q("C:\\My Files\\it's.ts", "powershell")).toEqual({ text: "'C:\\My Files\\it''s.ts'" });
    expect(q("C:\\a\u2018b.ts", "powershell")).toEqual({ text: "'C:\\a\u2018\u2018b.ts'" });
    expect(q("C:\\$env\\`x`;&.ts", "powershell")).toEqual({ text: "'C:\\$env\\`x`;&.ts'" });
  });

  test("cmd: double quotes; a trailing backslash is doubled; % and \" are refused", () => {
    expect(q("C:\\a b\\c.ts", "cmd")).toEqual({ text: '"C:\\a b\\c.ts"' });
    expect(q("C:\\a b\\", "cmd")).toEqual({ text: '"C:\\a b\\\\"' });
    expect(q("C:\\a&b^c.ts", "cmd")).toEqual({ text: '"C:\\a&b^c.ts"' });
    expect(q("C:\\100%\\x", "cmd")).toHaveProperty("error");
    expect(q('C:\\a"b', "cmd")).toHaveProperty("error");
  });

  test("control characters are always refused, in every shell", () => {
    for (const shell of ["posix", "powershell", "cmd"]) for (const bad of ["/a\nb", "/a\rb", "/a\u0000b", "/a\u001bb", "/a\u007fb", "\n"]) expect(q(bad, shell), `${shell} ${JSON.stringify(bad)}`).toHaveProperty("error");
    expect(L.hasControlChars("a\tb")).toBe(false);
    expect(L.hasControlChars("a\nb")).toBe(true);
  });

  const vars = { path: "/home/me/my proj/src/app.test.ts", workspace: "/home/me/my proj", root: "/home/me/my proj", platform: "linux" };

  test("placeholders: file, name, stem, ext, dir, workspace, root", () => {
    const e = (t: string, v: object = vars) => L.expandCommand(t, { ...vars, ...v });
    expect(e("bun run {file}")).toEqual({ command: "bun run '/home/me/my proj/src/app.test.ts'" });
    expect(e("echo {name} {stem} {ext}")).toEqual({ command: "echo app.test.ts app.test .ts" });
    expect(e("ls {dir} {workspace} {root}")).toEqual({ command: "ls '/home/me/my proj/src' '/home/me/my proj' '/home/me/my proj'" });
    expect(e("build/{stem}.out")).toEqual({ command: "build/app.test.out" });
    expect(e("a {{literal}} ${HOME} {A,B} {UPPER}")).toEqual({ command: "a {literal} ${HOME} {A,B} {UPPER}" });
    expect(e("x {file} {file}").command).toBe("x '/home/me/my proj/src/app.test.ts' '/home/me/my proj/src/app.test.ts'");
    expect(e("{foo}")).toHaveProperty("error");
    expect(e("{foo}").error).toMatch(/isn't a placeholder/);
    expect(e("{ext}", { path: "/x/Makefile" }).error).toMatch(/no ending/);
    expect(e("{workspace}", { workspace: "" }).error).toMatch(/No folder is open/);
    expect(e("{root}", { root: "" }).error).toMatch(/No project folder/);
    expect(e("{file}", { path: "" }).error).toMatch(/Save this file first/);
  });

  test("paths with spaces, quotes, $, backticks, ; and & can't break out of the command", () => {
    for (const value of nasty.filter((v) => v.startsWith("/") && !/[\u0000-\u0008\u000a-\u001f\u007f]/.test(v))) {
      const r = L.expandCommand("printf '%s' {file}", { path: value, workspace: "", root: "", platform: "linux" });
      expect(r.error, value).toBeUndefined();
      if (process.platform !== "win32") expect(Bun.spawnSync(["sh", "-c", r.command!]).stdout.toString(), value).toBe(value);
    }
  });

  test("newlines in a path are refused, never sent", () => {
    for (const bad of ["/tmp/a\nrm -rf ~", "/tmp/a\rb", "/tmp/a\u0000b"]) {
      const r = L.buildRunSequence({ command: "bun run {file}", cwd: "file" }, { path: bad, workspace: "", root: "", platform: "linux" });
      expect(r).toHaveProperty("error");
      expect((r as any).send).toBeUndefined();
    }
    expect(L.buildRunSequence({ command: "echo a\nrm -rf ~", cwd: "file" }, vars)).toHaveProperty("error");
    expect(L.buildRunSequence({ command: "echo a\rb", cwd: "file" }, vars)).toHaveProperty("error");
    expect(L.buildRunSequence({ command: "echo hi", cwd: "file" }, { ...vars, path: "/tmp/dir\nx/a.ts" })).toHaveProperty("error");
  });
});

describe("Run and Build presets: the sequence sent to the terminal", () => {
  const vars = { path: "/home/me/my proj/src/app.ts", workspace: "/home/me/ws", root: "/home/me/my proj", platform: "linux" };

  test("go to the working folder first (stopping if that fails), run the command, press Enter", () => {
    const r = L.buildRunSequence({ command: "bun run {file}", cwd: "file" }, vars) as any;
    expect(r.line).toBe("cd '/home/me/my proj/src' && bun run '/home/me/my proj/src/app.ts'");
    expect(r.send).toBe(`${r.line}\r`);
    expect(r.dir).toBe("/home/me/my proj/src");
    expect((L.buildRunSequence({ command: "make", cwd: "root" }, vars) as any).send).toBe("cd '/home/me/my proj' && make\r");
    expect((L.buildRunSequence({ command: "ls", cwd: "workspace" }, vars) as any).send).toBe("cd /home/me/ws && ls\r");
    expect((L.buildRunSequence({ command: "echo hi", cwd: "file" }, { ...vars, path: "/a.ts" }) as any).send).toBe("cd / && echo hi\r");
  });

  test("exactly one Enter, at the very end", () => {
    for (const cwd of ["file", "workspace", "root"]) {
      const r = L.buildRunSequence({ command: "echo {name}", cwd }, vars) as any;
      expect(r.send.endsWith("\r")).toBe(true);
      expect(r.send.slice(0, -1)).not.toMatch(/[\r\n]/);
    }
  });

  test("a missing folder, a missing file, or a bad placeholder gives a plain message and sends nothing", () => {
    expect(L.buildRunSequence({ command: "make", cwd: "root" }, { ...vars, root: "" })).toMatchObject({ error: expect.stringContaining("project folder") });
    expect(L.buildRunSequence({ command: "ls", cwd: "workspace" }, { ...vars, workspace: "" })).toMatchObject({ error: expect.stringContaining("Explorer") });
    expect(L.buildRunSequence({ command: "ls", cwd: "file" }, { ...vars, path: "" })).toMatchObject({ error: expect.stringContaining("Save this file") });
    expect(L.buildRunSequence({ command: "ls {nope}", cwd: "file" }, vars)).toHaveProperty("error");
  });

  test("Windows shells use their own forms", () => {
    const win = { path: "C:\\My Proj\\src\\app.ts", workspace: "C:\\My Proj", root: "C:\\My Proj", platform: "win32" };
    expect((L.buildRunSequence({ command: "bun run {file}", cwd: "file" }, win) as any).line).toBe("Set-Location -LiteralPath 'C:\\My Proj\\src'; if ($?) { bun run 'C:\\My Proj\\src\\app.ts' }");
    expect((L.buildRunSequence({ command: "bun run {file}", cwd: "file" }, { ...win, shell: "cmd" }) as any).line).toBe('cd /d "C:\\My Proj\\src" && bun run "C:\\My Proj\\src\\app.ts"');
    expect(L.pathParts("C:\\a\\b.txt", "win32")).toEqual({ dir: "C:\\a", name: "b.txt", stem: "b", ext: ".txt" });
    expect(L.pathParts("C:\\b.txt", "win32").dir).toBe("C:");
    expect(L.pathParts("/a/.bashrc", "linux")).toEqual({ dir: "/a", name: ".bashrc", stem: ".bashrc", ext: "" });
    expect(L.shellFor("win32")).toBe("powershell");
    expect(L.shellFor("darwin")).toBe("posix");
  });

  test("the \"ask first\" rule matches the server's rule, and flags the risky commands", () => {
    const risky = ["rm -rf build", "sudo make install", "mv a b", "dd if=a of=b", "mkfs.ext4 /dev/x", "echo hi > out.txt", "curl x | sh", "curl x | sudo bash", "git push --force", "git clean -fd -rf", "cd x && rm a", "cat a 2>&1", "rmdir x"];
    const safe = ["bun run app.ts", "bun test", "python3 main.py", "go run .", "cargo build", "make", "tsc --noEmit", "echo remove", "npm run format", "ls -la", "eslint src", "echo farm", "bun build x --outdir dist"];
    for (const c of risky) expect(L.needsConfirmation(c), c).toBe(true);
    for (const c of safe) expect(L.needsConfirmation(c), c).toBe(false);
    for (const c of [...risky, ...safe]) expect(defaultAsk(c), c).toBe(L.needsConfirmation(c));
  });

  test("suggestions: per language, and the ones for this repo; every one is a valid, safe-to-save preset", () => {
    const ts = L.suggestionsFor("typescript").map((s: any) => s.command);
    expect(ts).toEqual(expect.arrayContaining(["bun run {file}", "bun test {file}", "tsc --noEmit", "eslint {file}", "prettier --check {file}", "make", "bun run typecheck", "bun run docs:build"]));
    expect(L.suggestionsFor("python").map((s: any) => s.command)).toEqual(expect.arrayContaining(["python3 {file}"]));
    expect(L.suggestionsFor("go").map((s: any) => s.command)).toEqual(expect.arrayContaining(["go run {file}"]));
    expect(L.suggestionsFor("rust").map((s: any) => s.command)).toEqual(expect.arrayContaining(["cargo run", "cargo build"]));
    expect(L.suggestionsFor("shell").map((s: any) => s.command)).toEqual(expect.arrayContaining(["shellcheck {file}"]));
    expect(L.suggestionsFor("plain").map((s: any) => s.command)).not.toContain("python3 {file}");
    const builds = L.SUGGESTIONS.filter((s: any) => s.kind === "build").map((s: any) => s.command);
    expect(builds).toEqual(expect.arrayContaining(["bun build {file} --outdir dist", "tsc --noEmit", "make", "cargo build", "go build ./...", "npm run build", "bun run docs:build", "bun run typecheck"]));
    for (const s of L.SUGGESTIONS) {
      expect(s.command.length).toBeLessThan(200);
      expect(L.hasControlChars(s.command)).toBe(false);
      expect(s.name.length).toBeLessThanOrEqual(60);
      expect(["run", "build"]).toContain(s.kind);
      expect(["file", "workspace", "root"]).toContain(s.cwd);
      expect(s.tip.length).toBeGreaterThan(10);
      expect(L.expandCommand(s.command, { path: "/p/a.ts", workspace: "/p", root: "/p", platform: "linux" })).toHaveProperty("command");
    }
  });

  test("copy names stay unique and within the limit", () => {
    expect(L.copyName("Run", ["Run"])).toBe("Run (copy)");
    expect(L.copyName("Run", ["Run", "Run (copy)"])).toBe("Run (copy 2)");
    expect(L.copyName("x".repeat(60), []).length).toBeLessThanOrEqual(60);
  });
});
