// Helpers for code completion that look at the text around the caret: the word being typed, whether the caret is in a
// comment or string, the receiver of a "." and its guessed type, struct-literal and HTML/CSS/JSON positions, call
// signatures. DOM-free and linear in the amount of text they look at (small windows), so they never block typing.
import { tokenizeLine } from "./codeTokens.js";
import { TYPES, familyOf } from "./codeCompleteData.js";
import { V_MODULE_ALIASES } from "./codeCompleteV.js";
import { splitTop } from "./codeCompleteIndex.js";

const WORD_CHARS = { css: /[\w-]/, web: /[\w:-]/, yaml: /[\w.-]/, toml: /[\w.-]/, shell: /[\w$-]/ };
const DOLLAR = new Set(["js", "php", "v", "shell"]);
export const PLAIN_LANGS = new Set(["plain", "markdown", "diff", "ini", "dockerfile", "makefile"]);
const NO_STRING_CHECK = new Set(["json", "html", "xml", "css", "markdown", "plain", "diff", "yaml", "toml", "ini"]);

export function isWordChar(ch, lang) {
  if (!ch) return false;
  const family = familyOf(lang);
  if (WORD_CHARS[family]?.test(ch) || WORD_CHARS[lang]?.test(ch)) return true;
  return /[\w]/.test(ch) || (ch === "$" && DOLLAR.has(family));
}

/** The identifier being typed just before the caret: { start, prefix }. */
export function wordBefore(text, caret, lang) {
  let start = caret;
  while (start > 0 && caret - start < 80 && isWordChar(text[start - 1], lang)) start--;
  if ((lang === "css" || lang === "scss") && text[start - 1] === "@") start--;
  return { start, prefix: text.slice(start, caret) };
}

export function lineBounds(text, pos) {
  const from = text.lastIndexOf("\n", pos - 1) + 1;
  const to = text.indexOf("\n", pos);
  return { from, to: to < 0 ? text.length : to };
}

/** Is the caret inside a comment or a string? (looks at up to 40 lines above to know about open block comments) */
export function inCommentOrString(text, caret, lang) {
  if (NO_STRING_CHECK.has(lang) || NO_STRING_CHECK.has(familyOf(lang))) return false;
  const { from } = lineBounds(text, caret);
  let begin = from;
  for (let n = 0; n < 40 && begin > 0; n++) begin = text.lastIndexOf("\n", begin - 2) + 1;
  let state = "";
  let pos = begin;
  while (pos < from) {
    const end = text.indexOf("\n", pos);
    const line = text.slice(pos, end < 0 ? from : Math.min(end, from));
    state = tokenizeLine(lang, line, state).state;
    pos = end + 1;
    if (end < 0) break;
  }
  const upTo = text.slice(from, caret);
  const { tokens, state: after } = tokenizeLine(lang, upTo, state);
  if (!upTo) return state !== "";
  const last = tokens[tokens.length - 1];
  if (!last) return false;
  if (last.type === "comment") return !(last.text.startsWith("/*") && last.text.endsWith("*/") && last.text.length > 3 && after === "");
  if (last.type === "string") {
    const q = last.text[0];
    const closed = last.text.length > 1 && last.text.endsWith(q) && !last.text.endsWith(`\\${q}`);
    return !closed || after !== "";
  }
  return false;
}

/** The call being typed: `name(` before the caret, and which argument (counting commas) the caret is in. */
export function callAt(text, caret) {
  let depth = 0;
  let commas = 0;
  const from = Math.max(0, caret - 600);
  for (let i = caret - 1; i >= from; i--) {
    const ch = text[i];
    if (ch === "\n" && i < caret - 300) break;
    if (ch === ")" || ch === "]" || ch === "}") depth++;
    else if (ch === "(" || ch === "[" || ch === "{") {
      if (depth > 0) { depth--; continue; }
      if (ch !== "(") return null;
      let e = i;
      let s = e;
      while (s > from && /[\w$.!]/.test(text[s - 1])) s--;
      const name = text.slice(s, e).replace(/^\.+/, "");
      if (!name || /^\d/.test(name)) return null;
      return { name, open: i, active: commas };
    } else if (ch === "," && depth === 0) commas++;
    else if (ch === ";" && depth === 0) return null;
  }
  return null;
}

/** What is before a "." at `dot`: { type: "string"|"array"|"number"|"ident"|"call"|"other", name, chain, via }. */
export function receiverAt(text, dot) {
  let i = dot - 1;
  const ch = text[i];
  if (!ch) return { type: "other", name: "" };
  if (ch === '"' || ch === "'" || ch === "`") return { type: "string", name: "" };
  if (/\d/.test(ch) && /^\d[\d_.]*$/.test(text.slice(Math.max(0, i - 20), i + 1).split(/[^\w.]/).pop() ?? "")) return { type: "number", name: "" };
  let call = false;
  if (ch === ")" || ch === "]") {
    let depth = 0;
    const open = ch === ")" ? "(" : "[";
    const stop = Math.max(0, i - 400);
    for (; i >= stop; i--) {
      if (text[i] === ch) depth++;
      else if (text[i] === open && --depth === 0) break;
    }
    if (depth !== 0 || i < 0) return { type: "other", name: "" };
    if (open === "[" && !/[\w$)\]]/.test(text[i - 1] ?? " ")) return { type: "array", name: "" };
    call = open === "(";
    i--;
  }
  let end = i + 1;
  while (i >= 0 && /[\w$]/.test(text[i])) i--;
  const name = text.slice(i + 1, end);
  if (!name) return { type: "other", name: "" };
  const chain = [name];
  while (text[i] === "." && !call) {
    let j = i - 1;
    const e2 = j + 1;
    while (j >= 0 && /[\w$]/.test(text[j])) j--;
    if (j + 1 === e2) break;
    chain.unshift(text.slice(j + 1, e2));
    i = j;
  }
  return { type: call ? "call" : "ident", name, chain };
}

const ALIASES = { python: { string: "str", array: "list", map: "dict" }, rust: { string: "String", array: "Vec" } };

/** Canonical table key for a type written in code ("[]int", "Vec<String>", "string", "Map<K,V>"). */
export function normalizeType(type, family, classes) {
  let t = String(type ?? "").trim().replace(/^(?:mut|const|&|\*|\?|!|\.\.\.)+\s*/, "").replace(family === "cpp" ? /^(?:\w+::)+/ : /^$/, "").replace(/<[^>]*>|\[[^\]]*\](?=\w)/g, "").replace(/\?$/, "");
  if (!t) return "";
  const table = TYPES[family] ?? {};
  if (table[t] || classes?.has(t)) return t;
  if (/^(?:\[\]|\w+\[\]$|\[)/.test(String(type).trim().replace(/^(?:mut|&|\*|\?|!)+\s*/, "")) || /^(?:array|list|vec|vector|arraylist|slice|iterable)$/i.test(t)) return "array";
  if (/^(?:string|str|String|NSString|rune_string)$/.test(t)) return "string";
  if (/^(?:int|i\d+|u\d+|f\d+|float|double|number|long|short|usize|isize|integer|decimal|byte|Int|Double|Float)$/.test(t)) return table[t] ? t : "number";
  if (/^(?:map|dict|hashmap|dictionary|Map)$/i.test(t)) return "map";
  if (/^(?:promise|set|date|regexp)$/i.test(t)) return t.toLowerCase();
  return t;
}

/** The table key for `key` in this family, honouring per-language names ("string" is "str" in Python). */
export function lookupKey(family, key) {
  const table = TYPES[family] ?? {};
  if (table[key]) return key;
  const alias = ALIASES[family]?.[key];
  if (alias && table[alias]) return alias;
  if (["java", "csharp", "kotlin", "cpp", "swift"].includes(family)) { const hit = Object.keys(table).find((k) => k.toLowerCase() === String(key).toLowerCase()); if (hit) return hit; }
  return "";
}

/** A guess at the type of an initial value: "string", "array", "number", a class name, or "". */
export function typeFromInit(init, family) {
  const s = String(init ?? "").trim().replace(/^(?:await|new)\s+/, "").replace(/^&/, "");
  if (!s) return "";
  if (/^(?:[rcRC]|js)?["'`]/.test(s) && !/^(?:r|c|js)[\w]/.test(s) || /^(?:r|c|js)['"]/.test(s)) return "string";
  if (/^\[\]|^\[/.test(s)) return "array";
  if (/^-?\d/.test(s)) return /^-?\d[\d_]*\.\d/.test(s) ? "f64" : "number";
  if (/^(?:true|false|True|False)\b/.test(s)) return "bool";
  if (/^map\[|^\{\s*\}|^\{\s*['"]/.test(s)) return family === "python" || family === "js" ? "map" : "map";
  const call = /^(str|list|dict|set|int|float)\(/.exec(s);
  if (call && family === "python") return { str: "string", list: "array", dict: "map", set: "set", int: "number", float: "number" }[call[1]];
  const cls = /^([A-Z][\w]*)(?:::\w+|\.new)?\s*(?:[{(<[]|$)/.exec(s);
  return cls ? cls[1] : "";
}

/** Names of V modules: "net.http" -> "http", with the aliases V uses ("x.json2" -> "json2"). */
export function moduleKey(name, imports) {
  const hit = imports?.find((m) => m.name === name);
  const full = hit?.full ?? name;
  const last = full.split(/[.:/]/).pop();
  return { full, last, alias: V_MODULE_ALIASES[last] ?? "" };
}

/** Open elements before `pos` in HTML (names of tags not yet closed), innermost last. */
export function openTags(text, pos) {
  const stack = [];
  const src = text.slice(Math.max(0, pos - 60_000), pos).replace(/<!--[^]*?-->/g, "");
  for (const m of src.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">]){0,2000}?)(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (m[1]) { const at = stack.lastIndexOf(name); if (at >= 0) stack.length = at; } else if (!m[4] && !VOID.has(name)) stack.push(name);
  }
  return stack;
}
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Inside an HTML tag at `start`? -> { tagName, attr (name of the attribute whose value is being typed, or ""), inValue } or null. */
export function htmlTagContext(text, start) {
  const lt = text.lastIndexOf("<", start - 1);
  if (lt < 0 || start - lt > 2000) return null;
  const inside = text.slice(lt, start);
  if (inside.includes(">") && !/=\s*["'][^"']*$/.test(inside)) return null;
  if (/^<[!?]/.test(inside)) return null;
  const name = /^<\/?([A-Za-z][\w:-]*)/.exec(inside);
  const value = /([\w:-]+)\s*=\s*(["'])([^"']*)$/.exec(inside);
  if (value) return { tagName: name?.[1] ?? "", attr: value[1], inValue: true, value: value[3] };
  return { tagName: name?.[1] ?? "", attr: "", inValue: false, bare: !name || inside.length === 1 || !/\s/.test(inside) };
}

/** Inside a struct literal `Name{ ... }`? -> { name, used: Set of field names already written } or null (V, Go, Rust). */
export function structLiteralAt(text, start) {
  let depth = 0;
  const from = Math.max(0, start - 800);
  for (let i = start - 1; i >= from; i--) {
    const ch = text[i];
    if (ch === "}" || ch === ")" || ch === "]") depth++;
    else if (ch === "(" || ch === "[") { if (depth === 0) return null; depth--; }
    else if (ch === "{") {
      if (depth > 0) { depth--; continue; }
      const head = text.slice(Math.max(0, i - 80), i);
      const m = /(?:^|[^\w.])&?([A-Z]\w*)\s*$/.exec(head);
      const line = text.slice(text.lastIndexOf("\n", i) + 1, i);
      if (!m || /\b(?:struct|interface|enum|union|impl|trait|fn|if|for|match|else|while|type|class)\b/.test(line)) return null;
      const body = text.slice(i + 1, start);
      const last = body.slice(Math.max(body.lastIndexOf("\n"), body.lastIndexOf(",")) + 1);
      if (last.includes(":")) return { name: m[1], used: new Set(), inValue: true };
      return { name: m[1], used: new Set([...body.matchAll(/(?:^|[\s,])(\w+)\s*:/g)].map((x) => x[1])), inValue: false };
    }
  }
  return null;
}

/** Signature help: the function being called at the caret and which parameter is active. */
export function parseSignature(name, params, active) {
  const list = splitTop(params).map((p) => p.trim()).filter(Boolean);
  return { name, params: list, active: Math.min(active, Math.max(0, list.length - 1)) };
}
