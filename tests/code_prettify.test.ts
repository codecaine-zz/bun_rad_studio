import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startCodeStudioServer } from "../applications/code_studio.ts";
import { extensionOf, formatWithBunFmt, isBuiltIn, minify, prettify, tidyWhitespace } from "../src/shared/code_prettify";
import { codeOperations } from "../src/features/filemanager/fmCodeOps";

const ok = async (path: string, text: string, extra: Record<string, unknown> = {}) => {
  const r = await prettify({ path, text, ...extra });
  expect(r.ok, `${path}: ${JSON.stringify(r.error)}`).toBe(true);
  return r;
};

describe("which language a file is", () => {
  test("the extension wins, then the editor's language", () => {
    expect(extensionOf("src/a.TSX")).toBe("tsx");
    expect(extensionOf("C:\\x\\Style.SCSS")).toBe("scss");
    expect(extensionOf("Makefile", "shell")).toBe("sh");
    expect(extensionOf("", "python")).toBe("py");
    expect(extensionOf(".bashrc")).toBe("bashrc");
    expect(isBuiltIn("ts")).toBe(true);
    expect(isBuiltIn("py")).toBe(false);
  });
});

describe("built-in formatters", () => {
  test("JavaScript, TypeScript and JSX are laid out", async () => {
    expect((await ok("a.js", "const a={b:1,c:[1,2,3]};function f(x){return x+1}")).text).toBe("const a = { b: 1, c: [1, 2, 3] };\nfunction f(x) {\n  return x + 1;\n}\n");
    expect((await ok("a.ts", "interface A{x:number}\nconst a:A={x:1}")).text).toBe("interface A {\n  x: number;\n}\nconst a: A = { x: 1 };\n");
    expect((await ok("a.tsx", "const A=()=><div className='x'>hi</div>")).text).toBe('const A = () => <div className="x">hi</div>;\n');
  });
  test("the editor's indentation is used: two or four spaces, or tabs", async () => {
    expect((await ok("a.js", "function f(){return 1}", { tabWidth: 4 })).text).toBe("function f() {\n    return 1;\n}\n");
    expect((await ok("a.js", "function f(){return 1}", { useTabs: true })).text).toBe("function f() {\n\treturn 1;\n}\n");
  });
  test("plain JSON is always spread over lines, and JSON with comments still works", async () => {
    expect((await ok("a.json", '{"a":1,"b":[1,2]}')).text).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    const commented = await ok("a.json", '{\n // note\n "a":1,}\n');
    expect(commented.engine).toBe("Prettier");
    expect(commented.text).toContain("// note");
  });
  test("CSS, SCSS, Less, HTML, Vue, Markdown, YAML, GraphQL and SQL", async () => {
    expect((await ok("a.css", "a{color:red}")).text).toBe("a {\n  color: red;\n}\n");
    expect((await ok("a.scss", ".a{.b{color:red}}")).text).toBe(".a {\n  .b {\n    color: red;\n  }\n}\n");
    expect((await ok("a.less", ".a{.b{color:red}}")).text).toContain("  .b {");
    expect((await ok("a.html", "<div><p>hi</p><ul><li>a</li></ul></div>")).text).toBe("<div>\n  <p>hi</p>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>\n");
    expect((await ok("a.vue", "<script>export default {a:1}</script>")).text).toContain("export default { a: 1 };");
    expect((await ok("a.md", "# T\n*  a\n*  b")).text).toBe("# T\n\n- a\n- b\n");
    expect((await ok("a.yaml", "a:   1\nb:\n    - x\n    -   y")).text).toBe("a: 1\nb:\n  - x\n  - y\n");
    expect((await ok("a.graphql", "query{a{b}}")).text).toBe("query {\n  a {\n    b\n  }\n}\n");
    const sql = await ok("a.sql", "select a,b from t where x=1 order by a");
    expect(sql.engine).toBe("sql-formatter");
    expect(sql.text).toBe("SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\nORDER BY\n  a");
  });
  test("TOML, Svelte, MDX and Handlebars via Bun v1.4.4 built-in bun fmt", async () => {
    expect(isBuiltIn("toml")).toBe(true);
    expect(isBuiltIn("svelte")).toBe(true);
    expect(isBuiltIn("mdx")).toBe(true);
    expect(isBuiltIn("hbs")).toBe(true);
    const toml = await ok("bunfig.toml", '[install]\ncache =   true\nexact=false\n');
    expect(toml.engine).toBe("bun fmt");
    expect(toml.text).toContain('cache = true\nexact = false\n');
    const svelte = await ok("App.svelte", "<script>let count=0;</script><button>{count}</button>");
    expect(svelte.engine).toBe("bun fmt");
    expect(svelte.text).toContain("let count = 0;");
    const sorted = await formatWithBunFmt('import { z } from "z";\nimport { a } from "a";\nexport const x = [a, z];\n', "index.ts", { sortImports: true });
    expect(sorted.ok).toBe(true);
    expect(sorted.engine).toBe("bun fmt");
    expect(sorted.text!.indexOf('"a"')).toBeLessThan(sorted.text!.indexOf('"z"'));
  });
  test("a file with no name is read by the editor's language", async () => {
    expect((await ok("", "let   a=1", { lang: "javascript" })).text).toBe("let a = 1;\n");
  });
  test("Windows line endings stay Windows line endings", async () => {
    expect((await ok("a.js", "const a = 1;\r\nconst b = 2;\r\n")).text).toBe("const a = 1;\r\nconst b = 2;\r\n");
  });
  test("a mistake is reported with its place and nothing is changed", async () => {
    const r = await prettify({ path: "a.js", text: "const a = {" });
    expect(r.ok).toBe(false);
    expect(r.text).toBeUndefined();
    expect(r.error?.line).toBe(1);
    expect(r.error?.message).toBeTruthy();
    const j = await prettify({ path: "a.json", text: '{"a": }' });
    expect(j.ok).toBe(false);
    expect(j.error?.line).toBeGreaterThan(0);
    expect((await prettify({ path: "a.sql", text: "select (" })).ok).toBe(false);
  });
  test("too much text and a non-string are refused", async () => {
    expect((await prettify({ path: "a.js", text: "x".repeat(900_001) })).ok).toBe(false);
    expect((await prettify({ path: "a.js", text: 5 as any })).ok).toBe(false);
  });
});

describe("languages without a built-in formatter", () => {
  const tools = (command: string, args: string[]) => ({ py: [{ id: "t", name: "faketool", command, args: () => args, install: "faketool (not real)" }] });
  test("the installed formatter gets the text on its input and its output is used", async () => {
    const r = await prettify({ path: "a.py", text: "print(1)\n" }, tools(process.execPath, ["-e", "process.stdout.write((await Bun.stdin.text()).toUpperCase())"]) as any);
    expect(r).toMatchObject({ ok: true, text: "PRINT(1)\n", engine: "faketool" });
    expect(r.basic).toBeUndefined();
  });
  test("a formatter that fails reports its own words and changes nothing", async () => {
    const r = await prettify({ path: "a.py", text: "x" }, tools(process.execPath, ["-e", "console.error('bad syntax'); process.exit(2)"]) as any);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain("bad syntax");
  });
  test("without a formatter only whitespace is tidied, and it says so and says what to install", async () => {
    const r = await prettify({ path: "a.py", text: "def f( x ):   \n  return x\n\n\n\n\nprint( f(1) )" }, tools("definitely-not-installed-xyz", []) as any);
    expect(r).toMatchObject({ ok: true, engine: "whitespace tidy", basic: true });
    expect(r.text).toBe("def f( x ):\n  return x\n\n\nprint( f(1) )\n");
    expect(r.message).toContain("faketool (not real)");
  });
  test("C-style code without clang-format gets its indentation tidied", async () => {
    const r = await prettify({ path: "A.java", text: "class A{\nvoid f(){\nint x=1;\n}\n}" }, {});
    expect(r).toMatchObject({ ok: true, basic: true, engine: "indentation tidy" });
    expect(r.text).toContain("\n  void f(){\n    int x=1;\n  }\n");
  });
  test("an unknown kind of file only gets the whitespace tidy", async () => {
    const r = await prettify({ path: "notes.xyz", text: "a  \n\n\n\n\nb" }, {});
    expect(r).toMatchObject({ ok: true, text: "a\n\n\nb\n", basic: true });
  });
  test("tidyWhitespace keeps the file's line endings and an empty file stays empty", () => {
    expect(tidyWhitespace("a \r\nb\t\r\n\r\n\r\n\r\n\r\nc")).toBe("a\r\nb\r\n\r\n\r\nc\r\n");
    expect(tidyWhitespace("  \n\n")).toBe("");
  });
});

describe("minify", () => {
  test("JavaScript loses its comments and spaces, but keeps its names", async () => {
    const r = await minify({ path: "a.js", text: "// c\nconst total = 1 ;\nfunction add ( first , second ) { return first + second }\n" });
    expect(r).toMatchObject({ ok: true, engine: "Bun minifier" });
    expect(r.text).toBe("const total=1;function add(first,second){return first+second}");
  });
  test("JSON and CSS", async () => {
    expect((await minify({ path: "a.json", text: '{ "a": 1,\n "b": [ 1, 2 ] }' })).text).toBe('{"a":1,"b":[1,2]}');
    const css = await minify({ path: "a.css", text: "/* c */\n.a { color: red; }\n" });
    expect(css.ok).toBe(true);
    expect(css.text).not.toContain("/*");
    expect(css.text!.length).toBeLessThan(20);
  });
  test("TypeScript and other languages are refused instead of being squashed blindly", async () => {
    for (const p of ["a.ts", "a.tsx", "a.py", "a.html"]) {
      const r = await minify({ path: p, text: "x = 1" });
      expect(r.ok, p).toBe(false);
      expect(r.error?.message).toContain("JSON, CSS and JavaScript");
    }
  });
  test("a mistake in JavaScript or JSON is reported", async () => {
    expect((await minify({ path: "a.js", text: "const = " })).ok).toBe(false);
    expect((await minify({ path: "a.json", text: "{" })).ok).toBe(false);
  });
});

describe("the File Manager's code/prettify", () => {
  const op: any = (codeOperations as any)["code/prettify"];
  test("prettifies, minifies and refuses a missing text", async () => {
    expect(await op({}, { text: "let a=1", path: "a.js" })).toMatchObject({ formatted: true, text: "let a = 1;\n" });
    expect(await op({}, { mode: "minify", text: "let a = 1 ;", path: "a.js" })).toMatchObject({ formatted: true, text: "let a=1;" });
    await expect(op({}, { path: "a.js" })).rejects.toThrow("no text");
  });
});

describe("NovaCode Studio Pro's /api/prettify", () => {
  let server: any;
  let base = "";
  beforeAll(() => { server = startCodeStudioServer({ port: 0, host: "127.0.0.1" }); base = `http://127.0.0.1:${server.port}`; });
  afterAll(() => server.stop(true));
  const post = (body: unknown) => fetch(`${base}/api/prettify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  test("formats and minifies the text it is sent", async () => {
    const a: any = await (await post({ text: "const a={b:1}", path: "x.ts" })).json();
    expect(a).toMatchObject({ ok: true, text: "const a = { b: 1 };\n", engine: "Prettier" });
    const b: any = await (await post({ mode: "minify", text: "const a = { b: 1 };", path: "x.js" })).json();
    expect(b).toMatchObject({ ok: true, text: "const a={b:1};" });
  });
  test("a mistake comes back as an error with a place, a missing text as a 400", async () => {
    const bad: any = await (await post({ text: "const a = {", path: "x.js" })).json();
    expect(bad.ok).toBe(false);
    expect(bad.error.line).toBe(1);
    expect((await post({ path: "x.js" })).status).toBe(400);
  });
  test("the page asks for it and the old whitespace-only 'Prettify' is gone", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('"/api/prettify"');
    expect(html).toContain("Minify (JavaScript, JSON, CSS)");
    expect(html).not.toContain('l.replace(/\\s+$/, "")).join("\\n");\n          els.textarea.value = cleaned;\n          handleTextChange();\n          flashStatusBar("Document formatted');
  });
});
