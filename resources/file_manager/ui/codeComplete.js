// Code completion: given the text, the caret and the indexes of the open files, work out what to offer. DOM-free.
// complete() returns { from, to, items } (the range to replace and up to 50 ranked items) or null when nothing fits.
import {
  CSS_AT_RULES, CSS_COLORS, CSS_COMMON_VALUES, CSS_PROPS, CSS_VALUES, GLOBALS, HTML_ATTRS, HTML_TAGS, HTML_VOID, KNOWN_RECEIVERS, SQL_KEYWORDS, TOML_COMMON, TYPES, YAML_COMMON, familyOf, languageWords, parseNames, tableKey,
} from "./codeCompleteData.js";
import { V_ATTRIBUTES, V_COMPTIME, V_MODULES } from "./codeCompleteV.js";
import { buildIndex, emptyIndex, indentOf } from "./codeCompleteIndex.js";
import {
  PLAIN_LANGS, callAt, htmlTagContext, inCommentOrString, isWordChar, lineBounds, lookupKey, moduleKey, normalizeType, openTags, parseSignature, receiverAt, structLiteralAt, typeFromInit, wordBefore,
} from "./codeCompleteCtx.js";
import { SNIPPETS } from "./codeSnippetData.js";

export { buildIndex, emptyIndex };
export const MAX_ITEMS = 50;
const HTML_VALUES = { type: "text password email number checkbox radio submit button file date hidden search tel url", target: "_blank _self _parent _top", method: "get post", rel: "stylesheet icon noopener noreferrer", loading: "lazy eager", dir: "ltr rtl", autocomplete: "on off" };
// In Rust the table named after a type holds its `Type::function()`s; the methods of a value live in the lower-case table.
const RUST_INSTANCE = { String: "str", Vec: "vec" };
const WEIGHT = { local: 90, symbol: 60, member: 70, snippet: 40, keyword: 30, builtin: 25, type: 25, other: 15, word: 0 };

const words = (s) => (s ? s.split(" ").filter(Boolean) : []);
const camelParts = (s) => s.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])|\d+/g) ?? [];

/** How well `label` matches what was typed: prefix > camelCase initials > letters in order (-1 = no match). */
export function matchScore(prefix, label) {
  if (!prefix) return 100;
  if (label.startsWith(prefix)) return 1000 - (label.length - prefix.length) * 0.5;
  const lp = prefix.toLowerCase();
  const ll = label.toLowerCase();
  if (ll.startsWith(lp)) return 900 - (label.length - prefix.length) * 0.5;
  if (prefix.length < 2) return -1;
  const parts = label.includes("_") || label.includes("-") ? label.split(/[_-]/) : camelParts(label);
  if (parts.length > 1 && parts.map((p) => p[0] ?? "").join("").toLowerCase().startsWith(lp)) return 700 - parts.length;
  let at = 0;
  for (const ch of lp) { at = ll.indexOf(ch, at); if (at < 0) return -1; at++; }
  return 400 - (ll.length - lp.length) * 0.5;
}

class Collector {
  constructor(prefix, recent) { this.prefix = prefix; this.map = new Map(); this.recent = recent; }

  add(label, kind, extra = {}) {
    const key = extra.key ?? label;
    if (!label || this.map.has(key)) return;
    if (label === this.prefix && (kind === "word" || kind === "other")) return;
    const m = matchScore(this.prefix, extra.match ?? label);
    if (m < 0) return;
    const r = this.recent.indexOf(label);
    const score = m + (WEIGHT[kind] ?? 0) + (extra.boost ?? 0) + (r >= 0 ? 120 - Math.min(r, 20) * 4 : 0);
    this.map.set(key, { label, insert: label, kind, score, ...extra });
  }

  items() {
    return [...this.map.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, MAX_ITEMS);
  }
}

const withParams = (list, kind, c, detail) => { for (const w of parseNames(list)) c.add(w.name, kind, { call: w.method, params: w.params, detail: w.method ? `(${w.params})` : detail }); };

/** Names visible at the caret in this file (locals, params, top-level symbols) and the enclosing class. */
export function scopeAt(index, text, caret) {
  const line = text.slice(0, caret).split("\n").length - 1;
  const ls = lineBounds(text, caret).from;
  const lead = /^[ \t]*/.exec(text.slice(ls, caret))[0];
  const here = indentOf(`${lead}x`);
  const visible = [];
  let enclosing = null;
  let min = Infinity;
  let d = index.decls.length - 1;
  while (d >= 0 && index.decls[d].line >= line) d--;
  for (let j = line - 1; j >= 0; j--) {
    const ind = index.indents[j];
    if (ind === 65535) continue;
    while (d >= 0 && index.decls[d].line === j) {
      const x = index.decls[d--];
      if (x.kind === "class") { if (!enclosing && min > x.indent && here > x.indent) enclosing = x.name; }
      else if (x.kind === "field" || x.kind === "method") continue;
      else if (x.inner ? min > x.indent && here > x.indent : min >= x.indent) visible.push(x);
    }
    if (ind < min) min = ind;
  }
  for (const x of index.decls) if (x.indent === 0 && x.line >= line && x.kind !== "param" && x.kind !== "field" && x.kind !== "method") visible.push({ ...x, below: true });
  return { visible, enclosing };
}

function typeOfName(name, scope, index, family, tfam, others) {
  const decl = scope.visible.find((x) => x.name === name && x.kind !== "import" && x.kind !== "class");
  if (!decl) return "";
  const classes = new Set([index.classes, ...others.map((o) => o.classes)].flatMap((s) => [...s]));
  const t = decl.type ? normalizeType(decl.type, tfam, classes) : normalizeType(typeFromInit(decl.init, family), tfam, classes);
  return t;
}

function memberItems(c, recv, ctx) {
  const { family, index, others, scope } = ctx;
  const indexes = [index, ...others];
  const seen = new Set();
  const addOwner = (cls) => {
    for (const o of indexes) for (const m of o.owners.get(cls) ?? []) {
      if (seen.has(m.name)) continue;
      seen.add(m.name);
      c.add(m.name, "member", { call: m.kind === "method", params: m.params ?? "", detail: m.kind === "method" ? `(${m.params ?? ""})` : `${m.type || "field"} · ${cls}`, sym: m.kind });
    }
  };
  const tfam = tableKey(ctx.lang);
  const table = (key) => { const k = lookupKey(tfam, key); if (k) withParams(TYPES[tfam][k], "member", c, "built-in"); return !!k; };
  let known = false;
  if (recv.type === "string") known = table("string");
  else if (recv.type === "array") known = table("array");
  else if (recv.type === "number") known = table("number") || table("int");
  else if (recv.type === "ident" || recv.type === "call") {
    const name = recv.name;
    if (name === "this" || name === "self" || name === "@") { if (scope.enclosing) { addOwner(scope.enclosing); known = true; } }
    else if (recv.type === "ident") {
      const mod = moduleKey(name, index.imports);
      const direct = (KNOWN_RECEIVERS[tfam] ?? KNOWN_RECEIVERS[family] ?? []).includes(name) || ctx.moduleNames.has(name);
      if (direct || mod.full !== name) known = table(name) || table(mod.last) || (mod.alias ? table(mod.alias) : false) || known;
      if (!known && (index.classes.has(name) || others.some((o) => o.classes.has(name)))) { addOwner(name); known = true; }
      if (!known) {
        const t = typeOfName(name, scope, index, family, tfam, others);
        if (t) { const before = c.map.size; addOwner(t); table(t); if (family === "rust" && RUST_INSTANCE[t]) table(RUST_INSTANCE[t]); known = c.map.size > before; }
      }
    }
  }
  if (recv.type === "ident" && recv.name && (!known || c.map.size < 3)) for (const o of indexes) for (const m of o.uses.get(recv.name) ?? []) if (m !== c.prefix) c.add(m, "member", { detail: "used in your files" });
}

function symbolItems(c, ctx) {
  const { scope, others, family } = ctx;
  const seen = new Set();
  for (const x of scope.visible) {
    if (seen.has(x.name)) continue;
    seen.add(x.name);
    const fnLike = x.kind === "function";
    c.add(x.name, x.kind === "param" || x.kind === "variable" ? "local" : "symbol", { call: fnLike, params: x.params ?? "", sym: x.kind, detail: fnLike ? `(${x.params ?? ""})` : x.kind === "import" ? x.detail || "import" : `${x.type || x.kind}${x.below ? " · declared below" : ""}`, boost: x.below ? -20 : 0 });
  }
  for (const o of others) {
    if (o.family !== family) continue;
    for (const x of o.decls) if (x.indent === 0 && x.kind !== "param" && x.kind !== "import" && x.kind !== "field" && x.kind !== "method") c.add(x.name, "other", { call: x.kind === "function", params: x.params ?? "", sym: x.kind, detail: x.kind === "function" ? `(${x.params ?? ""}) · other tab` : "other tab" });
  }
}

function wordItems(c, ctx) {
  const { index, others, family } = ctx;
  for (const [w] of index.words) c.add(w, "word", { detail: "word" });
  for (const o of others) if (o.family === family) for (const [w] of o.words) c.add(w, "other", { detail: "other tab" });
}

function generalItems(c, ctx) {
  const { lang, family, prefix } = ctx;
  const lw = languageWords(lang);
  symbolItems(c, ctx);
  for (const k of lw.keywords) c.add(k, "keyword", { detail: "keyword" });
  for (const k of [...lw.types, ...lw.constants]) c.add(k, "type", { detail: "built-in" });
  if (GLOBALS[family] || GLOBALS[lang]) withParams(GLOBALS[lang] ?? GLOBALS[family], "builtin", c, "built-in");
  if (family === "v" && prefix.startsWith("$")) for (const w of words(V_COMPTIME)) c.add(`$${w.replace(/\(\)$/, "")}`, "keyword", { detail: "compile-time", call: w.endsWith("()") });
  if (family === "shell" && !prefix.startsWith("$")) for (const x of ctx.index.decls) if (x.kind === "variable") c.add(`$${x.name}`, "local", { detail: "variable" });
  wordItems(c, ctx);
}

function snippetItems(c, ctx) {
  if (!ctx.prefix || PLAIN_LANGS.has(ctx.lang) && ctx.lang !== "markdown") return;
  for (const s of SNIPPETS[ctx.lang] ?? SNIPPETS[ctx.family] ?? []) {
    if (!s.prefix.startsWith(ctx.prefix.toLowerCase())) continue;
    c.add(s.prefix, "snippet", { key: `snippet:${s.prefix}`, snippet: s.body, detail: s.label, boost: s.prefix === ctx.prefix.toLowerCase() ? 20 : -10 }); // a snippet leads only when you typed all of its name
  }
}

function htmlItems(c, ctx) {
  const { text, start, caret, index, others } = ctx;
  if (text.slice(start - 2, start) === "</") {
    const open = openTags(text, start - 2);
    const top = open[open.length - 1];
    if (top) c.add(top, "member", { insert: `${top}>`, detail: "close the open tag", boost: 400 });
    return true;
  }
  const tag = htmlTagContext(text, start);
  if (!tag) return false;
  if (tag.inValue) {
    const token = ((htmlTagContext(text, caret)?.value ?? tag.value).split(/\s+/).pop() ?? "");
    ctx.from = caret - token.length;
    ctx.prefix = token;
    c.prefix = token;
    if (tag.attr === "class") for (const o of [index, ...others]) for (const k of o.keys) if (!k.startsWith("<") && !k.startsWith("--")) c.add(k, "other", { detail: "class or id in your files" });
    for (const v of words(HTML_VALUES[tag.attr] ?? "")) c.add(v, "keyword", { detail: `${tag.attr} value` });
    return true;
  }
  if (tag.bare) {
    const names = new Set(words(HTML_TAGS));
    for (const o of [index, ...others]) for (const k of o.keys) if (k.startsWith("<") && k.slice(1) !== c.prefix) names.add(k.slice(1));
    for (const n of names) c.add(n, "keyword", { detail: HTML_VOID.has(n) ? "tag (no closing)" : "tag" });
    return true;
  }
  for (const a of words(HTML_ATTRS)) c.add(a, "keyword", { insert: a.endsWith("-") ? a : `${a}=""`, back: a.endsWith("-") ? 0 : 1, detail: "attribute" });
  return true;
}

function cssItems(c, ctx) {
  const { text, start, index, others } = ctx;
  let depth = 0;
  for (let i = start - 1, n = 0; i >= 0 && n < 30_000; i--, n++) { if (text[i] === "}") depth++; else if (text[i] === "{") { if (depth === 0) { depth = -1; break; } depth--; } }
  const customs = [index, ...others].flatMap((o) => [...o.keys]).filter((k) => k.startsWith("--"));
  if (depth !== -1) {
    if (ctx.prefix.startsWith("@")) for (const r of words(CSS_AT_RULES)) c.add(r, "keyword", { detail: "at-rule" });
    for (const t of words(HTML_TAGS)) c.add(t, "keyword", { detail: "element" });
    for (const o of [index, ...others]) for (const k of o.keys) if (!k.startsWith("<") && !k.startsWith("--")) c.add(k, "other", { detail: "class or id" });
    return true;
  }
  const open = text.lastIndexOf("{", start);
  const seg = text.slice(Math.max(open, text.lastIndexOf(";", start - 1), text.lastIndexOf("}", start - 1)) + 1, start);
  if (seg.includes(":")) {
    const prop = seg.slice(0, seg.indexOf(":")).trim().toLowerCase();
    for (const v of words(CSS_VALUES[prop] ?? "")) c.add(v, "keyword", { detail: `${prop} value` });
    if (/color|background|border|outline|shadow|fill|stroke/.test(prop)) for (const v of words(CSS_COLORS)) c.add(v, "keyword", { detail: "color" });
    for (const v of words(CSS_COMMON_VALUES)) c.add(v, "keyword", { detail: "common value" });
    for (const v of customs) c.add(`var(${v})`, "local", { detail: "custom property" });
  } else {
    for (const p of words(CSS_PROPS)) c.add(p, "keyword", { insert: `${p}: `, detail: "property", match: p });
    for (const v of customs) c.add(v, "local", { insert: `${v}: `, detail: "custom property" });
  }
  return true;
}

function jsonItems(c, ctx) {
  const { text, start, index, others } = ctx;
  const { from } = lineBounds(text, start);
  const before = text.slice(from, start);
  const quotes = (before.match(/(?<!\\)"/g) ?? []).length;
  if (quotes % 2 === 1 && /(?:^\s*|[{,]\s*)"[^"]*$/.test(before)) {
    ctx.from = start;
    for (const o of [index, ...others]) if (o.family === "json") for (const k of o.keys) c.add(k, "other", { detail: "key used in your files" });
    return true;
  }
  if (quotes % 2 === 0) for (const v of ["true", "false", "null"]) c.add(v, "keyword", { detail: "value" });
  return true;
}

function sqlItems(c, ctx) {
  const { text, start, index, prefix, others } = ctx;
  const tables = new Map(index.tables);
  for (const o of others) for (const [k, v] of o.tables ?? []) tables.set(k, new Set([...(tables.get(k) ?? []), ...v]));
  if (text[start - 1] === ".") {
    const owner = /(\w+)\.$/.exec(text.slice(Math.max(0, start - 60), start))?.[1] ?? "";
    const real = index.sqlAliases?.[owner] ?? owner;
    for (const col of tables.get(real) ?? []) c.add(col, "member", { detail: `column of ${real}` });
    return true;
  }
  const upper = prefix.length > 1 && prefix === prefix.toUpperCase();
  const fix = (w) => (upper ? w.toUpperCase() : w);
  for (const k of words(SQL_KEYWORDS)) c.add(fix(k), "keyword", { detail: "keyword", match: k });
  withParams(GLOBALS.sql, "builtin", c, "function");
  const afterFrom = /\b(?:from|join|into|update|table)\s+\w*$/i.test(text.slice(Math.max(0, start - 40), start + prefix.length));
  for (const [t, cols] of tables) { c.add(t, "symbol", { detail: "table", boost: afterFrom ? 80 : 0 }); for (const col of cols) c.add(col, "symbol", { detail: `column of ${t}` }); }
  return true;
}

function vItems(c, ctx) {
  const { text, start } = ctx;
  const line = text.slice(lineBounds(text, start).from, ctx.caret);
  if (/^\s*import\s+[\w.]*$/.test(line)) {
    const typed = /[\w.]*$/.exec(line)[0];
    c.prefix = typed;
    ctx.from = ctx.caret - typed.length;
    words(V_MODULES).forEach((m, i) => c.add(m, "keyword", { detail: "module", boost: Math.max(0, 60 - i) })); // the list starts with the common ones
    return true;
  }
  if (text.slice(start - 2, start) === "@[") { for (const a of words(V_ATTRIBUTES)) c.add(a, "keyword", { detail: "attribute" }); return true; }
  return false;
}

function literalItems(c, ctx) {
  const lit = structLiteralAt(ctx.text, ctx.start);
  if (!lit || lit.inValue) return false;
  const fields = [ctx.index, ...ctx.others].flatMap((o) => o.owners.get(lit.name) ?? []).filter((m) => m.kind === "field");
  if (!fields.length) return false;
  for (const f of fields) if (!lit.used.has(f.name)) c.add(f.name, "member", { insert: `${f.name}: `, detail: `${f.type || "field"} · ${lit.name}`, boost: 200 });
  return true;
}

function memberContext(text, start, family) {
  const two = text.slice(start - 2, start);
  const arrow = two === "->" && (family === "c" || family === "php");
  const scope = two === "::" && ["rust", "c", "php", "ruby", "swift"].includes(family);
  if (text[start - 1] === "." && text[start - 2] !== ".") return { dot: start - 1 };
  if (arrow || scope) return { dot: start - 2 };
  return null;
}

/**
 * @param {{ text: string, caret: number, lang: string, index?: object, others?: object[], recent?: string[], manual?: boolean, moduleNames?: Set<string>, snippets?: boolean }} req
 * @returns {null | { from: number, to: number, items: object[], prefix: string }}
 */
export function complete(req) {
  const { text, caret, lang, index = emptyIndex(lang), others = [], recent = [], manual = false, snippets = true } = req;
  const family = familyOf(lang);
  if (PLAIN_LANGS.has(lang) && lang !== "markdown" && !manual) return null;
  if (lang === "markdown" && !snippets) return null;
  const { start, prefix } = wordBefore(text, caret, lang);
  const ctx = { text, caret, lang, family, index, others, start, prefix, from: start, scope: { visible: [], enclosing: null }, moduleNames: req.moduleNames ?? new Set() };
  if (inCommentOrString(text, caret, lang)) return null;
  const c = new Collector(prefix, recent);
  const web = family === "web" || lang === "html" || lang === "xml";
  let done = false;
  if (web) done = htmlItems(c, ctx);
  else if (lang === "css") done = cssItems(c, ctx);
  else if (lang === "json") done = jsonItems(c, ctx);
  else if (lang === "yaml" || lang === "toml" || lang === "ini") {
    for (const o of [index, ...others]) for (const k of o.keys) c.add(k, "other", { detail: "key in your files" });
    for (const w of words(lang === "yaml" ? YAML_COMMON : TOML_COMMON)) c.add(w, "keyword", { detail: "common word" });
    done = true;
  } else if (lang === "sql") done = sqlItems(c, ctx);
  if (!done) {
    if (!PLAIN_LANGS.has(lang)) ctx.scope = scopeAt(index, text, caret);
    if (family === "v") done = vItems(c, ctx);
    const member = !done && !PLAIN_LANGS.has(lang) ? memberContext(text, start, family) : null;
    if (member) { memberItems(c, receiverAt(text, member.dot), ctx); done = true; }
    else if (!done) {
      const lit = ["v", "go", "rust"].includes(family) && literalItems(c, ctx);
      if (!lit || prefix) generalItems(c, ctx);
      if (snippets) snippetItems(c, ctx);
    }
  } else if (snippets && !web && lang !== "css") snippetItems(c, ctx);
  if (lang === "html" && text[start - 1] === "!" && !prefix) { ctx.from = start - 1; for (const s of SNIPPETS.html.filter((x) => x.prefix === "!")) c.map.set("!", { label: "!", insert: "!", kind: "snippet", score: 2000, snippet: s.body, detail: s.label }); }
  const explicit = manual || /(?:\.|::|->|<\/|@\[|<|@|\$|\bimport )$/.test(text.slice(Math.max(0, start - 8), start)) || c.map.has("!");
  if (!c.prefix && !explicit) return null;
  const items = c.items();
  if (!items.length) return null;
  return { from: ctx.from, to: caret, items, prefix: c.prefix };
}

/** The edit that accepting `item` makes: { from, to, insert, caret (offset from `from`), snippet }. */
export function acceptEdit(result, item, text, caret) {
  const { from } = result;
  const to = Math.max(caret, result.to);
  if (item.snippet) return { from, to, insert: "", snippet: item.snippet, caret: 0 };
  let insert = item.insert ?? item.label;
  let at = insert.length - (item.back ?? 0);
  if (item.call && !/^\s*\(/.test(text.slice(to, to + 3)) && !/[\s({[\]}),.;:]/.test(insert[insert.length - 1] ?? " ")) {
    insert += "()";
    at = item.params ? insert.length - 1 : insert.length;
  }
  return { from, to, insert, caret: at, snippet: "" };
}

/** Should typing `text[caret - 1]` open the list by itself? */
export function shouldAutoOpen(text, caret, lang) {
  if (PLAIN_LANGS.has(lang) && lang !== "markdown" || lang === "markdown") return false;
  const family = familyOf(lang);
  const ch = text[caret - 1];
  const prev = text[caret - 2] ?? "";
  if (!ch) return false;
  if (inCommentOrString(text, caret, lang)) return false;
  if (ch === "." ) return /[\w$)\]"'`}>]/.test(prev) && !/^\d+$/.test(wordBefore(text, caret - 1, lang).prefix);
  if (ch === ":") return prev === ":" && ["rust", "c", "php", "ruby", "swift"].includes(family);
  if (ch === ">") return prev === "-" && (family === "c" || family === "php");
  if (ch === "<") return family === "web";
  if (ch === "/") return family === "web" && prev === "<";
  if (ch === "@") return lang === "css";
  if (ch === "[") return family === "v" && prev === "@";
  if (ch === "$") return family === "v" || family === "shell" || family === "php";
  if (ch === " ") return family === "v" && /\bimport $/.test(text.slice(Math.max(0, caret - 8), caret));
  if (ch === "!") return lang === "html" && /^\s*!$/.test(text.slice(lineBounds(text, caret).from, caret));
  if (!isWordChar(ch, lang) || /\d/.test(ch) && !isWordChar(prev, lang)) return false;
  const { prefix } = wordBefore(text, caret, lang);
  return prefix.length >= 2 && !/^\d/.test(prefix);
}

const SIG_KINDS = ["function", "method"];

/** Signature help for the call around the caret: { name, params: string[], active, detail } or null. */
export function signatureAt(text, caret, lang, index = emptyIndex(lang), others = []) {
  const family = familyOf(lang);
  const call = callAt(text, caret);
  if (!call) return null;
  const parts = call.name.split(".");
  const fn = parts[parts.length - 1];
  const recv = parts.length > 1 ? parts[parts.length - 2] : "";
  for (const o of [index, ...others]) {
    const d = o.decls.find((x) => SIG_KINDS.includes(x.kind) && x.name === fn && (x.params !== undefined));
    if (d) return { ...parseSignature(call.name, d.params, call.active), detail: o === index ? "in this file" : "in another tab" };
  }
  const globals = parseNames(GLOBALS[lang] ?? GLOBALS[family] ?? "").find((w) => w.name === call.name && w.method);
  if (globals) return { ...parseSignature(call.name, globals.params, call.active), detail: "built-in" };
  const tables = TYPES[tableKey(lang)] ?? {};
  const order = recv && tables[recv] ? [recv] : Object.keys(tables);
  for (const key of order) {
    const w = parseNames(tables[key]).find((x) => x.name === fn && x.method);
    if (w) return { ...parseSignature(`${recv || key}.${fn}`, w.params, call.active), detail: "built-in" };
  }
  return null;
}
