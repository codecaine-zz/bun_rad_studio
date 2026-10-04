/**
 * templateutils — Logic-light string templating + Markdown → ANSI renderer.
 *
 * Template syntax (Mustache/Handlebars-flavoured, zero dependencies):
 * - `{{ user.name }}` — dotted paths & array indexes (`items.0`)
 * - `{{ name | "Guest" }}` or `{{ name | Guest }}` — fallback when value is null/undefined
 * - `{{ name | upper }}` — filters (built-ins below or `options.filters`), chainable
 * - `{{{ html }}}` — raw output even when `escape: true`
 * - `{{#if cond}}…{{else}}…{{/if}}`, `{{#unless cond}}…{{/unless}}`
 * - `{{#each list}}{{@index}}: {{this.name}}{{else}}empty{{/each}}` (`@first`, `@last`, `@key` too)
 *
 * Expressions that don't look like paths (e.g. `{{ hello world! }}`) are left untouched.
 *
 * @example
 * import { templateutils } from "./src/features/rad/index.ts";
 * templateutils.renderTemplate("Hi {{ user.name | upper }}!", { user: { name: "ada" } }); // "Hi ADA!"
 */
import { colorText, colors } from "../../../shared/colors.ts";

/** A filter transforms a resolved value. */
export type TemplateFilter = (value: unknown) => unknown;

/** Rendering options. */
export interface TemplateOptions {
  /** HTML-escape `{{ }}` output (`{{{ }}}` stays raw). Default `false`. */
  escape?: boolean;
  /** Behaviour for unresolved variables without fallback. Default `"empty"`. */
  missing?: "empty" | "keep" | "throw";
  /** Extra / overriding filters. */
  filters?: Record<string, TemplateFilter>;
}

/** Compiled template function returned by {@link compileTemplate}. */
export type CompiledTemplate = (vars: Record<string, any>) => string;

type VarNode = { t: "var"; path: string; pipes: string[]; raw: boolean; src: string };
type BlockNode = { t: "if" | "unless" | "each"; path: string; body: Node[]; alt: Node[] };
type Node = { t: "text"; v: string } | VarNode | BlockNode;
type Scope = { data: unknown; meta: Record<string, unknown> }[];

const TAG_RE = /\{\{\{\s*([\s\S]+?)\s*\}\}\}|\{\{\s*([\s\S]+?)\s*\}\}/g;
const PATH_RE = /^(?:[#/]?(?:if|unless|each)\b.*|else|[\w@$][\w.@$-]*(?:\s*\|.*)?)$/;

/** Built-in filters: `upper lower trim capitalize title json escape length`. */
export const builtinFilters: Record<string, TemplateFilter> = {
  upper: (v) => String(v ?? "").toUpperCase(),
  lower: (v) => String(v ?? "").toLowerCase(),
  trim: (v) => String(v ?? "").trim(),
  capitalize: (v) => { const s = String(v ?? ""); return s.charAt(0).toUpperCase() + s.slice(1); },
  title: (v) => String(v ?? "").replace(/[\p{L}\d]+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  json: (v) => JSON.stringify(v),
  escape: (v) => Bun.escapeHTML(String(v ?? "")),
  length: (v) => (v == null ? 0 : (v as { length?: number }).length ?? Object.keys(v as object).length),
};

function tokenize(template: string): (string | { expr: string; raw: boolean; src: string })[] {
  const out: (string | { expr: string; raw: boolean; src: string })[] = [];
  let last = 0;
  for (const m of template.matchAll(TAG_RE)) {
    const expr = (m[1] ?? m[2])!.trim();
    if (!PATH_RE.test(expr)) continue;
    if (m.index > last) out.push(template.slice(last, m.index));
    out.push({ expr, raw: m[1] !== undefined, src: m[0] });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

function parseNodes(tokens: ReturnType<typeof tokenize>, pos: { i: number }, closer?: string): { nodes: Node[]; alt: Node[] } {
  const nodes: Node[] = [], alt: Node[] = [];
  let target = nodes;
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i++]!;
    if (typeof tok === "string") { target.push({ t: "text", v: tok }); continue; }
    const block = tok.expr.match(/^#(if|unless|each)\s+(.+)$/);
    if (block) {
      const inner = parseNodes(tokens, pos, block[1]);
      target.push({ t: block[1] as BlockNode["t"], path: block[2]!.trim(), body: inner.nodes, alt: inner.alt });
    } else if (tok.expr === "else" && closer) target = alt;
    else if (tok.expr.startsWith("/")) {
      if (tok.expr.slice(1) !== closer) throw new Error(`[templateutils] Unexpected {{${tok.expr}}} (open block: ${closer ?? "none"})`);
      return { nodes, alt };
    } else {
      const [path, ...pipes] = tok.expr.split("|").map((s) => s.trim());
      target.push({ t: "var", path: path!, pipes, raw: tok.raw, src: tok.src });
    }
  }
  if (closer) throw new Error(`[templateutils] Unclosed {{#${closer}}} block`);
  return { nodes, alt };
}

function lookup(scope: Scope, path: string): unknown {
  const top = scope[scope.length - 1]!;
  if (path === "this" || path === ".") return top.data;
  if (path.startsWith("@")) return top.meta[path.slice(1)];
  const strict = path.startsWith("this.");
  const keys = (strict ? path.slice(5) : path).split(".");
  for (let s = scope.length - 1; s >= (strict ? scope.length - 1 : 0); s--) {
    let cur: any = scope[s]!.data;
    if (cur == null || !(keys[0]! in Object(cur))) continue;
    for (const k of keys) cur = cur == null ? undefined : cur[k];
    return cur;
  }
  return undefined;
}

function truthy(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

function applyPipes(value: unknown, pipes: string[], filters: Record<string, TemplateFilter>): unknown {
  let v = value;
  for (const p of pipes) {
    if (filters[p]) v = filters[p]!(v);
    else if (v === undefined || v === null) v = p.replace(/^(["'])(.*)\1$/, "$2");
  }
  return v;
}

function renderVar(node: VarNode, scope: Scope, opts: TemplateOptions, filters: Record<string, TemplateFilter>): string {
  const v = applyPipes(lookup(scope, node.path), node.pipes, filters);
  if (v === undefined || v === null) {
    if (opts.missing === "throw") throw new Error(`[templateutils.renderTemplate] Missing variable "${node.path}"`);
    return opts.missing === "keep" ? node.src : "";
  }
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return opts.escape && !node.raw ? Bun.escapeHTML(s) : s;
}

function renderEach(node: BlockNode, scope: Scope, opts: TemplateOptions, filters: Record<string, TemplateFilter>): string {
  const list = lookup(scope, node.path);
  const entries: [string | number, unknown][] = Array.isArray(list) ? list.map((v, i) => [i, v]) : list && typeof list === "object" ? Object.entries(list) : [];
  if (entries.length === 0) return renderNodes(node.alt, scope, opts, filters);
  return entries
    .map(([key, data], i) => renderNodes(node.body, [...scope, { data, meta: { index: i, key, first: i === 0, last: i === entries.length - 1 } }], opts, filters))
    .join("");
}

function renderNodes(nodes: Node[], scope: Scope, opts: TemplateOptions, filters: Record<string, TemplateFilter>): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += n.v;
    else if (n.t === "var") out += renderVar(n, scope, opts, filters);
    else if (n.t === "each") out += renderEach(n, scope, opts, filters);
    else {
      const cond = truthy(lookup(scope, n.path));
      out += renderNodes((n.t === "if" ? cond : !cond) ? n.body : n.alt, scope, opts, filters);
    }
  }
  return out;
}

/**
 * Parse once, render many times (fastest for hot paths like per-request emails).
 * @throws on unbalanced `{{#block}}` tags.
 * @example
 * const greet = templateutils.compileTemplate("Hello {{name}}!");
 * greet({ name: "Ada" }); // "Hello Ada!"
 */
export function compileTemplate(template: string, options: TemplateOptions = {}): CompiledTemplate {
  const { nodes } = parseNodes(tokenize(template), { i: 0 });
  const filters = { ...builtinFilters, ...options.filters };
  return (vars) => renderNodes(nodes, [{ data: vars, meta: {} }], options, filters);
}

/**
 * Render a template in one call.
 * @example templateutils.renderTemplate("Hello {{name | User}}!", {}); // "Hello User!"
 * @example templateutils.renderTemplate("{{#each xs}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}", { xs: [1, 2] }); // "1, 2"
 * @example templateutils.renderTemplate("<b>{{bio}}</b>", { bio: "<script>" }, { escape: true }); // "<b>&lt;script&gt;</b>"
 */
export function renderTemplate(template: string, vars: Record<string, any>, options: TemplateOptions = {}): string {
  return compileTemplate(template, options)(vars);
}

/**
 * Unique variable/block paths referenced by a template (excludes `this`/`@meta`).
 * @example templateutils.templateVariables("{{a}} {{#each b}}{{this.c}}{{/each}}"); // ["a","b"]
 */
export function templateVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const tok of tokenize(template)) {
    if (typeof tok === "string" || tok.expr === "else" || tok.expr.startsWith("/")) continue;
    const path = tok.expr.replace(/^#(?:if|unless|each)\s+/, "").split("|")[0]!.trim();
    if (path !== "this" && !path.startsWith("this.") && !path.startsWith("@")) seen.add(path);
  }
  return [...seen];
}

function renderInlineMd(line: string): string {
  return line
    .replace(/`([^`]+)`/g, (_, code) => colors.yellow(` ${code} `))
    .replace(/\*\*([^*]+)\*\*/g, (_, t) => colors.bold(t))
    .replace(/~~([^~]+)~~/g, (_, t) => colorText(t, "9"))
    .replace(/(^|[^*])\*([^*]+)\*/g, (_, pre, t) => pre + colors.dim(t))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `${colorText(text, "4")} ${colors.gray(`(${url})`)}`);
}

function renderBlockMd(line: string): string | null {
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const [lvl, text] = [h[1]!.length, h[2]!];
    if (lvl === 1) return colors.bold(colors.magenta(`\n=== ${text} ===\n`));
    if (lvl === 2) return colors.bold(colors.cyan(`\n-- ${text} --`));
    return colors.bold(colors.yellow(`${"   ".repeat(lvl - 2)}${text}`));
  }
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return colors.gray("─".repeat(40));
  if (/^\s*>\s?/.test(line)) return colors.gray("│ ") + colors.dim(renderInlineMd(line.replace(/^\s*>\s?/, "")));
  const task = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
  if (task) return `${task[1]} ${task[2] === " " ? "☐" : colors.green("☑")} ${renderInlineMd(task[3]!)}`;
  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (bullet) return `${bullet[1]} • ${renderInlineMd(bullet[2]!)}`;
  const num = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
  if (num) return `${num[1]} ${colors.cyan(`${num[2]}.`)} ${renderInlineMd(num[3]!)}`;
  return null;
}

/**
 * Render Markdown for terminals: headings (h1–h6), fenced code, bullets, numbered & task lists,
 * blockquotes, horizontal rules, **bold**, *italic*, ~~strike~~, `code` and [links](url).
 * Colours are suppressed automatically when stdout is not a TTY.
 * @example console.log(templateutils.renderMarkdownAnsi("# Release\n- [x] tests\n> shipped **today**"));
 */
export function renderMarkdownAnsi(markdown: string): string {
  const formatted: string[] = [];
  let inCode = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) {
      inCode = !inCode;
      formatted.push(colors.gray("----------------------------------------"));
    } else if (inCode) formatted.push(colors.cyan(`  ${line}`));
    else formatted.push(renderBlockMd(line) ?? renderInlineMd(line));
  }
  return formatted.join("\n");
}

/** Namespace bundle. */
export const templateutils = {
  builtinFilters,
  compileTemplate,
  renderTemplate,
  templateVariables,
  renderMarkdownAnsi,
};
