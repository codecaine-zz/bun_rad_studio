import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as tsm from "typescript";

const ts: any = (tsm as any).default ?? tsm;
const UI = join(import.meta.dir, "..", "resources", "file_manager", "ui");
const files = readdirSync(UI).filter((f) => f.endsWith(".js"));

interface ModuleInfo {
  exports: Set<string>;
  imports: Array<{ from: string; names: string[]; namespace: string | null; defaultName: string | null }>;
  sf: any;
  text: string;
}

function parse(file: string): ModuleInfo {
  const text = readFileSync(join(UI, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const exports = new Set<string>();
  const imports: ModuleInfo["imports"] = [];
  for (const st of sf.statements) {
    const hasExport = st.modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isImportDeclaration(st)) {
      const clause = st.importClause;
      const names: string[] = [];
      let namespace: string | null = null;
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) namespace = clause.namedBindings.name.text;
        else for (const el of clause.namedBindings.elements) names.push((el.propertyName ?? el.name).text);
      }
      imports.push({ from: st.moduleSpecifier.text, names, namespace, defaultName: clause?.name?.text ?? null });
    } else if (hasExport && ts.isFunctionDeclaration(st) && st.name) exports.add(st.name.text);
    else if (hasExport && ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) exports.add(d.name.text);
    else if (hasExport && ts.isClassDeclaration(st) && st.name) exports.add(st.name.text);
    else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) exports.add(el.name.text);
  }
  return { exports, imports, sf, text };
}

const modules = new Map(files.map((f) => [f, parse(f)]));

/** How many times `name` is used as an identifier in the file, not counting its import line. */
function uses(info: ModuleInfo, name: string): number {
  let n = 0;
  const visit = (node: any) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && node.text === name) {
      const parent = node.parent;
      // `obj.name` and `{ name: value }` are not uses of the variable
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) return;
      if (ts.isPropertyAssignment(parent) && parent.name === node) return;
      n++;
    }
    ts.forEachChild(node, visit);
  };
  visit(info.sf);
  return n;
}

describe("the File Manager page is wired together correctly", () => {
  test("every module parses", () => {
    expect(files.length).toBeGreaterThan(15);
    for (const [file, info] of modules) expect((info.sf as any).parseDiagnostics.length, file).toBe(0);
  });

  test("every import points at a module that exists and really exports that name", () => {
    const problems: string[] = [];
    for (const [file, info] of modules) {
      for (const imp of info.imports) {
        if (!imp.from.startsWith("./")) {
          problems.push(`${file}: imports "${imp.from}", but the page may only import its own modules`);
          continue;
        }
        const target = imp.from.slice(2);
        const other = modules.get(target);
        if (!other) {
          problems.push(`${file}: imports ${imp.from}, which doesn't exist`);
          continue;
        }
        for (const name of imp.names) if (!other.exports.has(name)) problems.push(`${file}: ${imp.from} has no export "${name}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("members used through a namespace import (ops.something) exist", () => {
    const problems: string[] = [];
    for (const [file, info] of modules) {
      for (const imp of info.imports) {
        if (!imp.namespace) continue;
        const other = modules.get(imp.from.slice(2));
        if (!other) continue;
        const re = new RegExp(`\\b${imp.namespace}\\.(\\w+)`, "g");
        const code = info.text.split("\n").filter((line) => !line.startsWith("import ")).join("\n");
        for (const m of code.matchAll(re)) if (!other.exports.has(m[1]!)) problems.push(`${file}: ${imp.namespace}.${m[1]} is not exported by ${imp.from}`);
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  test("nothing is imported without being used", () => {
    const unused: string[] = [];
    for (const [file, info] of modules) {
      for (const imp of info.imports) {
        for (const name of imp.names) if (uses(info, name) === 0) unused.push(`${file}: ${name}`);
        if (imp.namespace && uses(info, imp.namespace) === 0) unused.push(`${file}: * as ${imp.namespace}`);
      }
    }
    expect(unused).toEqual([]);
  });

  test("no module imports another in a circle that would run before it is ready", () => {
    // Modules may reference each other inside functions, but a cycle at load time breaks `const` exports.
    const graph = new Map<string, string[]>();
    for (const [file, info] of modules) graph.set(file, info.imports.map((i) => i.from.slice(2)));
    const state = new Map<string, number>();
    const cycles: string[] = [];
    const visit = (node: string, trail: string[]) => {
      if (state.get(node) === 2) return;
      if (state.get(node) === 1) return void cycles.push([...trail.slice(trail.indexOf(node)), node].join(" -> "));
      state.set(node, 1);
      for (const next of graph.get(node) ?? []) visit(next, [...trail, node]);
      state.set(node, 2);
    };
    for (const f of graph.keys()) visit(f, []);
    expect(cycles).toEqual([]);
  });

  test("the page never builds HTML from strings, and never evaluates code", () => {
    const banned = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/, /\bsetTimeout\s*\(\s*["'`]/, /\bsetInterval\s*\(\s*["'`]/, /javascript:/i, /\bimport\s*\(/, /setAttribute\(\s*["']style["']/, /\.cssText\b/, /\bvoid\s+\w+\s*;/];
    const problems: string[] = [];
    for (const [file, info] of modules) for (const re of banned) if (re.test(info.text)) problems.push(`${file}: ${re}`);
    expect(problems).toEqual([]);
  });

  test("index.html loads only this page's own files, with no inline script or style", () => {
    const html = readFileSync(join(UI, "..", "index.html"), "utf8");
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i); // every <script> has a src
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    // Only the page's own files, in-page anchors, and the empty icon that stops the browser asking for /favicon.ico.
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) expect(m[1]!.startsWith("/ui/") || m[1]!.startsWith("#") || m[1] === "data:,", m[1]).toBe(true);
    for (const m of html.matchAll(/\/ui\/([\w.-]+)/g)) expect(existsSync(join(UI, m[1]!)), m[1]).toBe(true);
    expect(html).toContain('name="fm-token"');
  });

  test("every element id the code looks up exists in index.html", () => {
    const html = readFileSync(join(UI, "..", "index.html"), "utf8");
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!));
    const missing: string[] = [];
    for (const [file, info] of modules) for (const m of info.text.matchAll(/\$\(\s*["']#([\w-]+)["']\s*\)/g)) if (!ids.has(m[1]!)) missing.push(`${file}: #${m[1]}`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
