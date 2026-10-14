import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startConvert } from "../src/features/filemanager/fmBatch";
import { CATALOG_BY_ID } from "../src/features/filemanager/fmConvCatalog";
import { createContext } from "../src/features/filemanager/fmCore";
import { codeGroups } from "../src/features/filemanager/fmInfoCode";
import { documentInfo } from "../src/features/filemanager/fmInfoDoc";
import { TranspileError, jsExtensionFor, loaderFor, scanModule, transpileSource } from "../src/features/filemanager/fmJsTranspile";

const root = mkdtempSync(join(tmpdir(), "fm-transpile-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const TS = `import type { Shape } from "./shape";
import { helper } from "./helper";
interface Point { x: number; y: number }
export enum Color { Red, Green }
export function add(first: number, second: number): number { const total: number = first + second; return total; }
export class Box<T> { constructor(public value: T) {} get(): T { return this.value; } }
export const point: Point = { x: 1, y: 2 };
export default helper;
`;

describe("transpileSource (Bun.Transpiler)", () => {
  test("types are removed and the code still runs", async () => {
    const js = transpileSource(TS, "ts");
    expect(js).not.toMatch(/interface|: number|<T>|import type/);
    expect(js).toContain("export function add(first, second)");
    expect(js).toContain("export default helper");
    // run it for real: the output is plain JavaScript with a working add() and Box
    const dir = join(root, "run");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "helper.mjs"), "export const helper = 7;");
    writeFileSync(join(dir, "out.mjs"), js.replace('"./helper"', '"./helper.mjs"'));
    const mod = await import(join(dir, "out.mjs"));
    expect(mod.add(2, 3)).toBe(5);
    expect(new mod.Box("v").get()).toBe("v");
    expect(mod.Color.Green).toBe(1);
    expect(mod.default).toBe(7);
  });

  test("TSX and JSX tags become plain factory calls: React by default, Preact when asked", () => {
    const tsx = `const App = (p: { name: string }) => <div className="a"><>{p.name}</></div>; export default App;`;
    const react = transpileSource(tsx, "tsx");
    expect(react).toContain('React.createElement("div", {');
    expect(react).toContain("React.Fragment");
    expect(react).not.toContain("jsxDEV");
    const preact = transpileSource(tsx, "tsx", { jsx: "preact" });
    expect(preact).toContain('h("div"');
    expect(preact).toContain("Fragment");
    expect(transpileSource("export const x = <b>hi</b>;", "jsx")).toContain('React.createElement("b"');
  });

  test("minify options shrink the output", () => {
    const plain = transpileSource(TS, "ts");
    const ws = transpileSource(TS, "ts", { minifyWhitespace: true });
    const all = transpileSource(TS, "ts", { minifyWhitespace: true, minifyIdentifiers: true, minifySyntax: true });
    expect(ws.length).toBeLessThan(plain.length);
    expect(all.length).toBeLessThanOrEqual(ws.length);
    expect(ws).not.toContain("\n  ");
    expect(all).toMatch(/export function add\(\w,\w\)/);
    expect(all).toContain("export class Box"); // exported names are never renamed
  });

  test("the target is accepted (browser, bun, node) and unicode survives", () => {
    const source = "export const s: string = 'héllo ✓ 日本';";
    for (const target of ["browser", "node"] as const) expect(transpileSource(source, "ts", { target })).toContain("héllo ✓ 日本");
    // for Bun the letters are written as \u escapes: the same text, safe in any encoding
    const bun = transpileSource(source, "ts", { target: "bun" });
    expect(bun).toContain("\\u65E5");
    expect(new Function(`${bun.replace("export const", "return")}`)()).toBe("héllo ✓ 日本");
  });

  test("syntax errors say where, in plain words, with a limit of three", () => {
    for (const [source, ext, where] of [["const = ;", "ts", /line 1, column 7/i], ["let a: number = 1;\nlet b = (;", "ts", /line 2/i], ["const x = {\n a: 1,,\n};", "ts", /line 2/i], ["<div>", "tsx", /line 1|end of file/i]] as const) {
      let err: any;
      try {
        transpileSource(source, ext);
      } catch (e) {
        err = e;
      }
      expect(err, source).toBeInstanceOf(TranspileError);
      expect(err.message).toMatch(/^The code has a mistake, so it can't be converted\. /);
      expect(err.message).toMatch(where);
      expect(err.problems.length).toBeGreaterThan(0);
      expect(err.problems.length).toBeLessThanOrEqual(3);
    }
  });

  test("the loader and the output extension follow the input extension", () => {
    expect([loaderFor("ts"), loaderFor("mts"), loaderFor("cts"), loaderFor("tsx"), loaderFor("jsx"), loaderFor(".JS")]).toEqual(["ts", "ts", "ts", "tsx", "jsx", "jsx"]);
    expect([jsExtensionFor("ts"), jsExtensionFor("tsx"), jsExtensionFor("jsx"), jsExtensionFor("mts"), jsExtensionFor("cts")]).toEqual(["js", "js", "js", "mjs", "cjs"]);
  });

  test("empty input gives empty output instead of an error", () => {
    expect(transpileSource("", "ts").trim()).toBe("");
  });
});

describe("scanModule and the More info rows", () => {
  const SOURCE = `import a, { b } from "./a";
import type { T } from "types";
import fs from "node:fs";
export { x } from "./x";
export * from "star";
export const q = 1;
export default function f() {}
const lazy = import("lazy");
const c = require("cjs");
`;

  test("imports of every kind and the export names are listed; type-only imports are not", () => {
    const s = scanModule(SOURCE, "ts");
    expect(s.imports.map((i) => `${i.kind}:${i.path}`)).toEqual(expect.arrayContaining(["import-statement:./a", "import-statement:node:fs", "import-statement:./x", "import-statement:star", "dynamic-import:lazy", "require-call:cjs"]));
    expect(s.imports.some((i) => i.path === "types")).toBe(false);
    expect(s.exports).toEqual(expect.arrayContaining(["default", "q", "x"]));
  });

  test("a huge number of imports is capped", () => {
    const many = Array.from({ length: 500 }, (_v, i) => `import "m${i}";`).join("\n");
    expect(scanModule(many, "js").imports.length).toBe(200);
  });

  test("rows: counts and lists, shortened after 30 names; plain scripts and broken files are explained", () => {
    const rows = (text: string, ext = "ts") => codeGroups(text, ext, true)[0]!.rows.map((r) => `${r.label}: ${r.value}`);
    expect(rows(SOURCE)).toEqual(expect.arrayContaining(["Imports: 4 — ./a, node:fs, ./x, star", "Loaded later with import(): 1 — lazy", "Loaded with require(): 1 — cjs", "Default export: Yes"]));
    expect(rows(SOURCE).find((r) => r.startsWith("Exports"))).toMatch(/^Exports: 2 — /);
    const many = Array.from({ length: 45 }, (_v, i) => `export const n${i} = ${i};`).join("\n");
    expect(rows(many).find((r) => r.startsWith("Exports"))).toMatch(/^Exports: 45 — n0, .*… and 15 more$/);
    expect(rows("console.log(1)", "js")[0]).toMatch(/runs as a plain script/);
    const bad = codeGroups("const = ;", "ts", true)[0]!.rows[0]!;
    expect(bad.flag).toBe("warn");
    expect(bad.value).toMatch(/^Mistake found: Line 1, column 7/);
    expect(codeGroups("x", "ts", false)[0]!.rows[0]!.value).toMatch(/larger than the 4 MB sample/);
    expect(codeGroups("hello", "txt", true)).toEqual([]);
  });

  test("a .ts, .tsx and .mjs file in More info get the group, others don't", async () => {
    const ctx = createContext({ home: root, dataDir: join(root, "data") });
    const dir = join(root, "info");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.ts"), SOURCE);
    writeFileSync(join(dir, "b.tsx"), "export const B = () => <b/>;");
    writeFileSync(join(dir, "c.mjs"), "import x from './x.js';\nexport { x };");
    writeFileSync(join(dir, "d.txt"), "import x from './x';");
    for (const [name, expected] of [["a.ts", true], ["b.tsx", true], ["c.mjs", true], ["d.txt", false]] as const) {
      const r = await documentInfo(ctx, join(dir, name));
      expect(r.groups.some((g) => g.id === "modules"), name).toBe(expected);
    }
    const a = (await documentInfo(ctx, join(dir, "a.ts"))).groups.find((g) => g.id === "modules")!;
    expect(a.rows.find((x) => x.label === "Imports")!.value).toContain("./a");
  });
});

(process.platform === "win32" ? describe.skip : describe)("TypeScript to JavaScript in the Convert window", () => {
  const work = join(root, "job-home", "Docs");
  const ctx = createContext({ platform: "darwin", home: join(root, "job-home"), dataDir: join(root, "job-data"), toolDirs: [join(root, "no-tools")] });
  beforeAll(() => mkdirSync(work, { recursive: true }));
  const run = async (req: Parameters<typeof startConvert>[1], state: "done" | "failed" = "done") => {
    const done = await ctx.jobs.whenDone((await startConvert(ctx, req)).id);
    if (done.state !== state) throw new Error(`job ${done.state}: ${done.steps.map((s) => s.message).join(" | ")}`);
    return done;
  };

  test("the action is in the catalog, built in, with its options", () => {
    const def = CATALOG_BY_ID.get("code-ts-js")!;
    expect(def.engines.every((e) => e.tool === "builtin")).toBe(true);
    expect([...def.inputs!].sort()).toEqual(["cts", "jsx", "mts", "ts", "tsx"]);
    expect(def.options!.map((o) => o.id)).toEqual(["target", "jsx", "minifyWhitespace", "minifyIdentifiers", "minifySyntax"]);
    expect(def.options!.find((o) => o.id === "jsx")!.forExts).toEqual(["tsx", "jsx"]);
  });

  test("files get the right new name, next to the original, and nothing is overwritten", async () => {
    const d = join(work, "names");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "a.ts"), TS);
    writeFileSync(join(d, "m.mts"), "export const m: number = 1;");
    writeFileSync(join(d, "c.cts"), "export const c: number = 2;");
    writeFileSync(join(d, "t.tsx"), "export const T = () => <i>x</i>;");
    const done = await run({ action: "code-ts-js", paths: ["a.ts", "m.mts", "c.cts", "t.tsx"].map((n) => join(d, n)) });
    expect(done.outputs.map((p) => p.slice(d.length + 1)).sort()).toEqual(["a.js", "c.cjs", "m.mjs", "t.js"]);
    expect(readFileSync(join(d, "m.mjs"), "utf8")).toContain("export const m = 1");
    expect(readFileSync(join(d, "t.js"), "utf8")).toContain("React.createElement");
    expect(done.steps.find((s) => s.label.includes("t.tsx"))!.message).toMatch(/React/);
    const again = await run({ action: "code-ts-js", paths: [join(d, "a.ts")], options: { minifyWhitespace: true } });
    expect(again.outputs).toEqual([join(d, "a (2).js")]);
    expect(readFileSync(join(d, "a (2).js"), "utf8").length).toBeLessThan(readFileSync(join(d, "a.js"), "utf8").length);
    expect(readdirSync(d).filter((n) => n.startsWith(".fm-"))).toEqual([]);
  });

  test("a mistake in the code fails that one file with the line number and leaves nothing behind", async () => {
    const d = join(work, "broken");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "bad.ts"), "const a = 1;\nconst b: number = ;\n");
    writeFileSync(join(d, "good.ts"), "export const g: number = 1;");
    const done = await run({ action: "code-ts-js", paths: [join(d, "bad.ts"), join(d, "good.ts")] }, "failed");
    expect(done.steps.map((s) => s.state)).toEqual(["failed", "done"]);
    expect(done.steps[0]!.message).toMatch(/^The code has a mistake, so it can't be converted\. Line 2, column /);
    expect(readdirSync(d).sort()).toEqual(["bad.ts", "good.js", "good.ts"]);
  });

  test("the options are checked: a made-up target is refused", async () => {
    const d = join(work, "opts");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "a.ts"), "export const a: number = 1;");
    await expect(startConvert(ctx, { action: "code-ts-js", paths: [join(d, "a.ts")], options: { target: "deno" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
    const done = await run({ action: "code-ts-js", paths: [join(d, "a.ts")], options: { target: "node", minifyIdentifiers: true, minifySyntax: true } });
    expect(done.state).toBe("done");
  });
});
