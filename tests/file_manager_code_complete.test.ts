import { describe, expect, test } from "bun:test";
import { acceptEdit, buildIndex, complete, createSnippetSession, expandSnippet, matchScore, newLineEdit, shouldAutoOpen, signatureAt, snippetPreview } from "../resources/file_manager/ui/codeLogic.js";

// The code-completion and snippet engines have no page in them, so they are tested on text alone.
function items(lang: string, text: string, opts: { manual?: boolean; others?: string[]; recent?: string[] } = {}): string[] | null {
  const index = buildIndex(text, lang, text.length);
  const others = (opts.others ?? []).map((o) => buildIndex(o, lang));
  const r = complete({ text, caret: text.length, lang, index, others, manual: opts.manual, recent: opts.recent });
  return r ? r.items.map((i: any) => i.label) : null;
}
const first = (lang: string, text: string, opts = {}) => items(lang, text, opts)?.[0];
const has = (lang: string, text: string, label: string, opts = {}) => expect(items(lang, text, opts)).toContain(label);

describe("ranking", () => {
  test("a prefix beats camelCase initials, which beat letters in order, and no match is -1", () => {
    const prefix = matchScore("get", "getName");
    const initials = matchScore("gn", "getName");
    const subsequence = matchScore("gtn", "getName");
    expect(prefix).toBeGreaterThan(initials);
    expect(initials).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
    expect(matchScore("xyz", "getName")).toBe(-1);
    expect(matchScore("GET", "getName")).toBeGreaterThan(initials);
  });

  test("names accepted lately come first among equals", () => {
    const text = "const alphaOne = 1;\nconst alphaTwo = 2;\nalpha";
    expect(first("javascript", text)).toBe("alphaOne");
    expect(first("javascript", text, { recent: ["alphaTwo"] })).toBe("alphaTwo");
  });

  test("the word being typed is not offered back to you as a member", () => {
    expect(items("javascript", "const arr = [1];\narr.pu")).toEqual(["push"]);
    expect(items("html", "<di")).not.toContain("di");
  });
});

describe("what is offered, by language", () => {
  test("JavaScript and TypeScript: members of known objects and of values, locals, and other tabs", () => {
    has("javascript", "console.", "log");
    has("javascript", "const s = 'x';\ns.sta", "startsWith");
    has("javascript", "const xs = [1];\nxs.fi", "filter");
    has("typescript", "function alpha() {}\nconst beta = 1;\nal", "alpha");
    expect(first("javascript", "fooB", { others: ["function fooBarBaz() {}"] })).toBe("fooBarBaz");
    expect(items("typescript", "class A {\n  count = 1;\n  inc() { this.co")).toEqual(["count"]);
  });

  test("Python, Go, Rust, PHP, Ruby, Swift, Kotlin", () => {
    has("python", "import os\nos.pa", "path");
    has("python", "xs = [1, 2]\nxs.ap", "append");
    has("python", "name = 'x'\nname.up", "upper");
    has("go", 'import "fmt"\nfunc main() {\n\tfmt.Pr', "Println");
    has("go", "func main() {\n\tstrings.Spl", "Split");
    has("rust", 'fn main() {\n    let s = String::from("a");\n    s.to_', "to_string");
    has("rust", "fn main() { let s = String::ne", "new");
    has("php", "<?php\n$arr = [1];\narray_ma", "array_map");
    has("ruby", "xs = [1, 2]\nxs.ma", "map");
    has("swift", 'let s = "a"\ns.up', "uppercased");
    has("kotlin", 'fun main() {\n    val s = "abc"\n    s.sub', "substring");
    has("kotlin", "fun main() { printl", "println");
  });

  test("Java, C#, C and C++ know their standard members and the types of locals", () => {
    has("java", "class A {\n  void f() {\n    System.", "currentTimeMillis");
    has("java", "class A {\n  void f() {\n    System.out.", "println");
    expect(items("java", 'class A {\n  void f() {\n    String s = "x";\n    s.sub')).toEqual(["substring"]);
    expect(items("java", "import java.util.*;\nclass A {\n  void f() {\n    List<String> xs = new ArrayList<>();\n    xs.ad")).toEqual(["add", "addAll"]);
    expect(items("csharp", "class A {\n  void F() {\n    var l = new List<int>();\n    l.Ad")).toEqual(["Add", "AddRange"]);
    expect(items("csharp", 'class A {\n  void F() {\n    string s = "a";\n    s.Sub')).toEqual(["Substring"]);
    has("csharp", "class A { void F() { Console.Wr", "WriteLine");
    expect(items("c", "struct P {\n  int x;\n  int y;\n};\nvoid f(struct P *p) {\n  p->")).toEqual(["x", "y"]);
    has("c", "#include <stdio.h>\nint main() {\n  prin", "printf");
    expect(items("cpp", "#include <vector>\nint main() {\n  std::vector<int> v;\n  v.pu")).toEqual(["push_back"]);
  });

  test("Shell, SQL, HTML, CSS, JSON, YAML and TOML", () => {
    has("shell", "ech", "echo");
    has("sql", "SELE", "SELECT");
    has("sql", "CREATE TABLE users (\n  id INTEGER,\n  email TEXT\n);\nSELECT users.em", "email");
    expect(items("html", "<di")?.slice(0, 2)).toEqual(["div", "audio"]);
    has("html", "<a hr", "href");
    expect(items("html", '<input type="te')?.slice(0, 2)).toEqual(["tel", "text"]);
    expect(items("html", "<div><span>x</span></")).toEqual(["div"]);
    has("css", "a { col", "color");
    has("css", "a { display: fl", "flex");
    expect(items("css", ":root { --main: red; }\na { color: var(--ma")).toEqual(["var(--main)"]);
    expect(items("json", '{\n  "alpha": 1,\n  "beta": {\n    "al')).toEqual(["alpha"]);
    has("json", '{"a": tr', "true");
    has("yaml", "name: x\nna", "name");
    has("toml", "[a]\nnam", "name");
  });

  test("plain text and Markdown stay quiet unless asked, and comments and strings never complete", () => {
    expect(items("plain", "hello world hel")).toBeNull();
    expect(items("plain", "hello world hel", { manual: true })).toEqual(["hello"]);
    expect(items("javascript", "// con")).toBeNull();
    expect(items("javascript", "const s = 'con")).toBeNull();
    expect(items("python", "# pri")).toBeNull();
  });
});

describe("when the list opens by itself", () => {
  const auto = (lang: string, text: string) => shouldAutoOpen(text, text.length, lang);
  test("after two identifier characters, and after . :: ->", () => {
    expect(auto("javascript", "co")).toBe(true);
    expect(auto("javascript", "c")).toBe(false);
    expect(auto("javascript", "foo.")).toBe(true);
    expect(auto("rust", "a::")).toBe(true);
    expect(auto("c", "a->")).toBe(true);
    expect(auto("v", "import ")).toBe(true);
  });
  test("never in comments, numbers, plain text or Markdown", () => {
    expect(auto("javascript", "// co")).toBe(false);
    expect(auto("javascript", "1.")).toBe(false);
    expect(auto("v", "x.1")).toBe(false);
    expect(auto("plain", "hello")).toBe(false);
    expect(auto("markdown", "hello")).toBe(false);
  });
});

describe("accepting a suggestion", () => {
  const run = (lang: string, text: string, pick: (i: any) => boolean) => {
    const r = complete({ text, caret: text.length, lang, index: buildIndex(text, lang, text.length), manual: true })!;
    return acceptEdit(r, r.items.find(pick), text, text.length);
  };
  test("a function gets () with the caret inside when it takes arguments, after it when it takes none", () => {
    expect(run("javascript", "function foo(a, b) {}\nfo", (i) => i.label === "foo")).toMatchObject({ from: 22, to: 24, insert: "foo()", caret: 4 });
    expect(run("javascript", "function bar() {}\nba", (i) => i.label === "bar")).toMatchObject({ insert: "bar()", caret: 5 });
  });
  test("no () is added when one is already there, or for a plain name", () => {
    const text = "function foo(a) {}\nfo(1)";
    const r = complete({ text, caret: 21, lang: "javascript", index: buildIndex(text, "javascript"), manual: true })!;
    expect(acceptEdit(r, r.items.find((i: any) => i.label === "foo"), text, 21).insert).toBe("foo");
    expect(run("javascript", "const total = 1;\ntot", (i) => i.label === "total").insert).toBe("total");
  });
  test("a snippet is handed back as text for the snippet engine", () => {
    const text = "for";
    const r = complete({ text, caret: 3, lang: "javascript", index: buildIndex(text, "javascript"), manual: true })!;
    const edit = acceptEdit(r, r.items.find((i: any) => i.kind === "snippet"), text, 3);
    expect(edit.snippet).toContain("$1");
    expect(edit.insert).toBe("");
  });
});

describe("signature help", () => {
  const sig = (lang: string, text: string) => signatureAt(text, text.length, lang, buildIndex(text, lang));
  test("names the call, its parameters and the one being typed", () => {
    expect(sig("javascript", "function add(a, b) {}\nadd(1, ")).toMatchObject({ name: "add", params: ["a", "b"], active: 1 });
    expect(sig("python", "def f(x, y=2):\n  pass\nf(1,")).toMatchObject({ params: ["x", "y=2"], active: 1 });
    expect(sig("javascript", "Math.max(")).toMatchObject({ name: "Math.max", detail: "built-in" });
    expect(sig("javascript", "const x = 1;")).toBeNull();
  });
});

describe("the snippet engine", () => {
  test("expands stops, defaults, mirrors and indentation", () => {
    const e = expandSnippet("for (let ${1:i} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}", { indent: "  ", unit: "  " });
    expect(e.text).toBe("for (let i = 0; i < n; i++) {\n    \n  }");
    expect(e.stops.map((s) => s.n)).toEqual([1, 2, 0]);
    expect(e.stops[0]!.ranges.length).toBe(3);
    expect(e.stops[2]!.ranges[0]).toEqual({ start: 34, end: 34 });
  });
  test("nested defaults and escaped characters", () => {
    expect(expandSnippet("${1:a ${2:b}} $2 $0").text).toBe("a b b ");
    expect(expandSnippet("\\$1 \\} $1").text).toBe("$1 } ");
    expect(snippetPreview("${1:name}(${2:x})")).toBe("name(x)");
  });
  test("a snippet with no stops ends with the caret after it", () => {
    const e = expandSnippet("hello");
    expect(e.stops).toEqual([{ n: 0, ranges: [{ start: 5, end: 5 }] }]);
  });
  test("a session visits the stops in order and ends on $0", () => {
    const e = expandSnippet("a ${1:x} b ${2:y} c $0");
    const s = createSnippetSession(e, 10);
    expect(s.select()).toEqual({ start: 12, end: 13 });
    expect(s.move(1)).toEqual({ start: 16, end: 17 });
    expect(s.move(-1)).toEqual({ start: 12, end: 13 });
    s.move(1);
    expect(s.move(1)).toEqual({ start: 20, end: 20 });
    expect(s.done).toBe(true);
  });
  test("typing in a stop updates its mirrors", () => {
    const e = expandSnippet("${1:a}-$1-${2:b}-$1");
    const s = createSnippetSession(e, 0);
    let text = e.text;
    expect(text).toBe("a-a-b-a");
    text = "xyz-a-b-a";
    const edits = s.change(text, 0, 1, 3);
    for (const ed of edits) text = text.slice(0, ed.from) + ed.insert + text.slice(ed.to);
    expect(text).toBe("xyz-xyz-b-xyz");
    expect(s.current()).toEqual({ start: 0, end: 3 });
  });
  test("every built-in snippet expands to something with its stops inside the text", () => {
    const { SNIPPETS } = require("../resources/file_manager/ui/codeLogic.js");
    let count = 0;
    for (const [lang, list] of Object.entries(SNIPPETS) as [string, any[]][]) {
      for (const sn of list) {
        count++;
        const e = expandSnippet(sn.body);
        expect(e.text.length, `${lang}:${sn.prefix}`).toBeGreaterThan(0);
        for (const st of e.stops) for (const r of st.ranges) expect(r.end).toBeLessThanOrEqual(e.text.length);
      }
    }
    expect(count).toBeGreaterThan(150);
  });
});

describe("speed", () => {
  test("a completion on a 5,000-line file takes well under 20 ms, and the index is built once", () => {
    const text = `${Array.from({ length: 1250 }, (_, i) => `export function fn${i}(a: number, b: string) {\n  const value${i} = a + ${i};\n  return value${i};\n}\n`).join("")}\nconst zz = val`;
    expect(text.split("\n").length).toBeGreaterThan(5000);
    let t = performance.now();
    const index = buildIndex(text, "typescript", text.length);
    expect(performance.now() - t).toBeLessThan(150);
    t = performance.now();
    let r: any;
    for (let i = 0; i < 20; i++) r = complete({ text, caret: text.length, lang: "typescript", index, others: [] });
    expect((performance.now() - t) / 20).toBeLessThan(20);
    expect(r.items[0].label).toBe("value0");
  });
  test("a huge file is only scanned near the caret", () => {
    const text = `${"word ".repeat(300_000)}\nhello hel`;
    const index = buildIndex(text, "plain", text.length);
    expect(index.big).toBe(true);
    expect(index.words.size).toBeLessThan(100);
  });
});

describe("typing helpers that completion relies on", () => {
  test("Enter on an empty line does not add a level of indentation", () => {
    const text = "fn main() {\n\tx()\n}\n";
    expect(newLineEdit(text, text.length, text.length, "v", "\t").insert).toBe("\n");
    expect(newLineEdit("a(", 2, 2, "javascript", "  ").insert).toBe("\n  ");
    expect(newLineEdit("  a", 3, 3, "javascript", "  ").insert).toBe("\n  ");
  });
});
