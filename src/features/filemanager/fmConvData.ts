/**
 * JSON (strict, JSONC and JSON5), YAML, TOML, CSV/TSV and JSON Lines: reading and writing as plain values.
 * `fmConvFormats.ts` joins these with the other data formats and does the converting between them.
 *
 * Parsers are written here (or, for YAML and TOML, use Bun's built-in parsers) so that big whole numbers survive
 * as `bigint`, duplicate keys are reported, and a key called "__proto__" is harmless.
 */
import { ConvError, MAX_DEPTH, Notes, isObj, newObj, plain, setKey, type Obj, type Value } from "./fmConvCommon";

// ---------------------------------------------------------------------------------------------------------------
// JSON, JSONC, JSON5
// ---------------------------------------------------------------------------------------------------------------

function where(text: string, index: number): string {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return `line ${line}, column ${index - last}`;
}

/** Reads JSON. `lenient` also allows comments, trailing commas, single quotes, unquoted keys, hex numbers (JSONC and JSON5). */
export function parseJson(source: string, lenient: boolean, notes: Notes): Value {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  let i = 0;
  const err = (what: string, at = i): never => {
    throw new ConvError(`This isn't valid ${lenient ? "JSON5" : "JSON"}: ${what} at ${where(text, at)}.`);
  };
  const skip = () => {
    for (;;) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\u00a0" || c === "\ufeff") i++;
      else if (lenient && c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; }
      else if (lenient && c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) err("a comment is never closed");
        i = end + 2;
      } else return;
    }
  };
  const ESC: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
  const string = (quote: string): string => {
    const start = i;
    i++;
    let out = "";
    for (;;) {
      if (i >= text.length) err("a string is never closed", start);
      const c = text[i]!;
      if (c === quote) { i++; return out; }
      if (c === "\\") {
        const n = text[i + 1];
        if (n === undefined) err("a string is never closed", start);
        if (n === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) err("a \\u escape needs 4 hex digits");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (n! in ESC) { out += ESC[n!]; i += 2; }
        else if (lenient && n === "'") { out += "'"; i += 2; }
        else if (lenient && (n === "\n" || n === "\r")) { i += n === "\r" && text[i + 2] === "\n" ? 3 : 2; }
        else if (lenient && n === "0" && !/\d/.test(text[i + 2] ?? "")) { out += "\0"; i += 2; }
        else if (lenient && n === "v") { out += "\v"; i += 2; }
        else if (lenient && n === "x") {
          const hex = text.slice(i + 2, i + 4);
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) err("a \\x escape needs 2 hex digits");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else if (lenient && (n === "\u2028" || n === "\u2029")) i += 2;
        // JSON5: a backslash before any other letter or symbol just means that character
        else if (lenient && !/[\d]/.test(n!)) { out += n; i += 2; }
        else err(`"\\${n}" isn't a valid escape`);
      } else if (c < " " && !(lenient && c === "\t")) {
        err("a line break or control character inside a string");
      } else { out += c; i++; }
    }
  };
  const number = (): Value => {
    const m = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 400));
    if (!m) return err("unexpected character");
    const lit = m[0];
    const strictOk = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(lit);
    if (!lenient && !strictOk) err("that isn't a valid number");
    if (/^[+-]?0\d/.test(lit)) err("a number can't start with a zero (0777 is ambiguous: write 777, or 0x1FF for a hex number)");
    i += lit.length;
    if (/^[+-]?\d+$/.test(lit)) {
      const n = Number(lit);
      if (!Number.isSafeInteger(n)) return BigInt(lit.replace(/^\+/, ""));
      return n === 0 ? 0 : n;
    }
    if (/^[+-]?0[xX]/.test(lit)) {
      const big = BigInt(lit.replace(/^\+/, "").replace(/^-/, ""));
      const signed = lit.startsWith("-") ? -big : big;
      return signed >= BigInt(Number.MIN_SAFE_INTEGER) && signed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(signed) : signed;
    }
    return Number(lit);
  };
  const value = (depth: number): Value => {
    if (depth > MAX_DEPTH) err("the data is nested more than 200 levels deep");
    skip();
    const c = text[i];
    if (c === "{") {
      i++;
      const obj = newObj();
      skip();
      if (text[i] === "}") { i++; return obj; }
      for (;;) {
        skip();
        let key: string;
        if (text[i] === '"' || (lenient && text[i] === "'")) key = string(text[i]!);
        else if (lenient && /^[\p{ID_Start}$_]|^\\u[0-9a-fA-F]{4}/u.test(text.slice(i, i + 6))) {
          // an unquoted JSON5 key is an identifier: letters of any language, digits, $ and _, and \uXXXX escapes
          const identRe = /(?:[\p{ID_Start}$_]|\\u[0-9a-fA-F]{4})(?:[\p{ID_Continue}$\u200c\u200d]|\\u[0-9a-fA-F]{4})*/uy;
          identRe.lastIndex = i;
          const m = identRe.exec(text)!;
          key = m[0].replace(/\\u([0-9a-fA-F]{4})/g, (_w, h: string) => String.fromCharCode(parseInt(h, 16)));
          i += m[0].length;
        }
        else return err(text[i] === undefined ? "the text ends too early" : "a key in quotes was expected");
        skip();
        if (text[i] !== ":") err('a ":" was expected');
        i++;
        const v = value(depth + 1);
        if (Object.prototype.hasOwnProperty.call(obj, key)) notes.add(`The key "${key.slice(0, 40)}" appears more than once; the last value was kept.`);
        setKey(obj, key, v);
        skip();
        if (text[i] === ",") { i++; skip(); if (lenient && text[i] === "}") { i++; return obj; } continue; }
        if (text[i] === "}") { i++; return obj; }
        return err(text[i] === undefined ? "the text ends too early" : 'a "," or "}" was expected');
      }
    }
    if (c === "[") {
      i++;
      const arr: Value[] = [];
      skip();
      if (text[i] === "]") { i++; return arr; }
      for (;;) {
        arr.push(value(depth + 1));
        skip();
        if (text[i] === ",") { i++; skip(); if (lenient && text[i] === "]") { i++; return arr; } continue; }
        if (text[i] === "]") { i++; return arr; }
        return err(text[i] === undefined ? "the text ends too early" : 'a "," or "]" was expected');
      }
    }
    if (c === '"' || (lenient && c === "'")) return string(c);
    if (text.startsWith("true", i)) { i += 4; return true; }
    if (text.startsWith("false", i)) { i += 5; return false; }
    if (text.startsWith("null", i)) { i += 4; return null; }
    if (lenient) {
      const m = /^([+-]?)(Infinity|NaN)/.exec(text.slice(i, i + 12));
      if (m) { i += m[0].length; notes.add("Infinity and NaN have no JSON form; they were turned into null."); return null; }
    }
    if (c === undefined) return err("the text ends too early");
    return number();
  };
  skip();
  if (i >= text.length) throw new ConvError("The file is empty: there is no data to convert.");
  const result = value(0);
  skip();
  if (i < text.length) err("there is more text after the data");
  return result;
}

function jsonNumber(n: number, notes: Notes): string {
  if (!Number.isFinite(n)) {
    notes.add("A number that isn't finite (NaN or Infinity) was written as null.");
    return "null";
  }
  return String(n === 0 ? 0 : n);
}

/** Writes JSON. `indent` 0 is the smallest form (no spaces). */
export function writeJson(v: Value, indent: number, notes: Notes): string {
  const nl = (level: number) => (indent > 0 ? `\n${" ".repeat(indent * level)}` : "");
  const go = (x: Value, level: number): string => {
    if (level > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
    if (x === null) return "null";
    if (typeof x === "string") return JSON.stringify(x);
    if (typeof x === "number") return jsonNumber(x, notes);
    if (typeof x === "bigint") return x.toString();
    if (typeof x === "boolean") return x ? "true" : "false";
    if (Array.isArray(x)) {
      if (x.length === 0) return "[]";
      return `[${x.map((e) => nl(level + 1) + go(e, level + 1)).join(",")}${nl(level)}]`;
    }
    const keys = Object.keys(x);
    if (keys.length === 0) return "{}";
    return `{${keys.map((k) => `${nl(level + 1)}${JSON.stringify(k)}:${indent > 0 ? " " : ""}${go(x[k]!, level + 1)}`).join(",")}${nl(level)}}`;
  };
  return `${go(v, 0)}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// JSON Lines
// ---------------------------------------------------------------------------------------------------------------

export function parseNdjson(text: string, notes: Notes): Value {
  const out: Value[] = [];
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
    if (!line.trim()) continue;
    try {
      out.push(parseJson(line, false, notes));
    } catch (err: any) {
      throw new ConvError(`Line ${n + 1} isn't valid JSON: ${String(err?.message ?? err).replace(/^This isn't valid JSON: /, "").replace(/ at line 1, column/, ", at column")}`);
    }
  }
  if (!out.length) throw new ConvError("The file is empty: there are no JSON lines to convert.");
  return out;
}

export function writeNdjson(v: Value, notes: Notes): string {
  const list = Array.isArray(v) ? v : isObj(v) && Object.keys(v).length === 1 && Array.isArray(Object.values(v)[0]) ? (Object.values(v)[0] as Value[]) : [v];
  if (!Array.isArray(v) && list.length === 1 && list[0] === v) notes.add("The data is one item, so the file has one line.");
  return list.map((x) => writeJson(x, 0, notes).trimEnd()).join("\n") + (list.length ? "\n" : "");
}

// ---------------------------------------------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------------------------------------------

export function parseYaml(text: string): Value {
  if (!text.trim()) throw new ConvError("The file is empty: there is no data to convert.");
  const yaml = (Bun as any).YAML as { parse(text: string): unknown } | undefined;
  if (!yaml) throw new ConvError("This version of the app can't read YAML.");
  try {
    return plain(yaml.parse(text.replace(/^\ufeff/, "")));
  } catch (err: any) {
    if (err instanceof ConvError) throw err;
    throw new ConvError(`This isn't valid YAML: ${String(err?.message ?? err).split("\n")[0]!.slice(0, 200)}`);
  }
}

const YAML_RESERVED = /^(?:true|false|null|yes|no|on|off|y|n|nan|inf)$/i;

function yamlScalarKey(s: string): string {
  if (s !== "" && /^[A-Za-z_][A-Za-z0-9_./@+-]*(?: [A-Za-z0-9_./@+()-]+)*$/.test(s) && !YAML_RESERVED.test(s)) return s;
  return JSON.stringify(s);
}

export function writeYaml(v: Value): string {
  const lines: string[] = [];
  const scalar = (x: Value): string => {
    if (x === null) return "null";
    if (typeof x === "string") return yamlScalarKey(x);
    if (typeof x === "number") {
      if (Number.isNaN(x)) return ".nan";
      if (!Number.isFinite(x)) return x > 0 ? ".inf" : "-.inf";
      return String(x === 0 ? 0 : x);
    }
    return String(x);
  };
  const isContainer = (x: Value): x is Value[] | Obj => typeof x === "object" && x !== null;
  const empty = (x: Value[] | Obj) => (Array.isArray(x) ? x.length === 0 : Object.keys(x).length === 0);
  const block = (x: Value[] | Obj, indent: string, level: number) => {
    if (level > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
    if (Array.isArray(x)) {
      for (const item of x) {
        if (isContainer(item) && !empty(item)) {
          const start = lines.length;
          block(item, `${indent}  `, level + 1);
          // the first line of the nested block shares the dash
          lines[start] = `${indent}- ${lines[start]!.slice(indent.length + 2)}`;
        } else lines.push(`${indent}- ${isContainer(item) ? (Array.isArray(item) ? "[]" : "{}") : scalar(item)}`);
      }
    } else {
      for (const [k, item] of Object.entries(x)) {
        if (isContainer(item) && !empty(item)) {
          lines.push(`${indent}${yamlScalarKey(k)}:`);
          block(item, Array.isArray(item) ? `${indent}  ` : `${indent}  `, level + 1);
        } else lines.push(`${indent}${yamlScalarKey(k)}: ${isContainer(item) ? (Array.isArray(item) ? "[]" : "{}") : scalar(item)}`);
      }
    }
  };
  if (isContainer(v) && !empty(v)) block(v, "", 0);
  else lines.push(isContainer(v) ? (Array.isArray(v) ? "[]" : "{}") : scalar(v));
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// TOML
// ---------------------------------------------------------------------------------------------------------------

export function parseToml(text: string): Value {
  if (!text.trim()) throw new ConvError("The file is empty: there is no data to convert.");
  try {
    return plain(Bun.TOML.parse(text.replace(/^\ufeff/, "")));
  } catch (err: any) {
    throw new ConvError(`This isn't valid TOML: ${String(err?.message ?? err).split("\n")[0]!.slice(0, 200)}`);
  }
}

const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));

export function writeToml(v: Value, notes: Notes): string {
  let root: Obj;
  if (isObj(v)) root = v;
  else {
    root = newObj();
    setKey(root, Array.isArray(v) ? "data" : "value", v);
    notes.add(`TOML needs a table at the top, so the data was put under the name "${Array.isArray(v) ? "data" : "value"}".`);
  }
  const inline = (x: Value, level = 0): string => {
    if (level > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
    if (x === null) {
      notes.add("TOML has no null, so empty values inside lists were written as empty text.");
      return '""';
    }
    if (typeof x === "string") return JSON.stringify(x);
    if (typeof x === "boolean") return String(x);
    if (typeof x === "number") return Number.isNaN(x) ? "nan" : !Number.isFinite(x) ? (x > 0 ? "inf" : "-inf") : String(x === 0 ? 0 : x);
    if (typeof x === "bigint") {
      if (x > 9223372036854775807n || x < -9223372036854775808n) {
        notes.add("A whole number was too big for TOML (over 64 bits) and was written as text.");
        return JSON.stringify(x.toString());
      }
      return x.toString();
    }
    if (Array.isArray(x)) return `[${x.map((e) => inline(e, level + 1)).join(", ")}]`;
    const parts = Object.entries(x).filter(([, e]) => e !== null).map(([k, e]) => `${tomlKey(k)} = ${inline(e, level + 1)}`);
    return parts.length ? `{ ${parts.join(", ")} }` : "{}";
  };
  const out: string[] = [];
  const table = (obj: Obj, path: string[], level: number) => {
    if (level > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
    const subs: Array<[string, Value]> = [];
    for (const [k, x] of Object.entries(obj)) {
      if (x === null) { notes.add("TOML has no null, so keys with an empty value were left out."); continue; }
      const asTable = isObj(x) && Object.keys(x).length > 0;
      const asTables = Array.isArray(x) && x.length > 0 && x.every((e) => isObj(e) && Object.keys(e).length > 0);
      if (asTable || asTables) subs.push([k, x]);
      else out.push(`${tomlKey(k)} = ${inline(x)}`);
    }
    for (const [k, x] of subs) {
      const p = [...path, tomlKey(k)];
      if (Array.isArray(x)) {
        for (const e of x) {
          out.push("", `[[${p.join(".")}]]`);
          table(e as Obj, p, level + 1);
        }
      } else {
        out.push("", `[${p.join(".")}]`);
        table(x as Obj, p, level + 1);
      }
    }
  };
  table(root, [], 0);
  return `${out.join("\n").replace(/^\n+/, "")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// CSV and TSV
// ---------------------------------------------------------------------------------------------------------------

export type Delimiter = "," | ";" | "\t" | "|";

/** The most likely separator, from the first lines: the one that appears in every line, most often, outside quotes. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const d of [",", ";", "\t", "|"] as Delimiter[]) {
    const counts = lines.map((l) => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 1000 : 0) + counts[0]!;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function parseCsvRows(source: string, delimiter: Delimiter): string[][] {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let line = 1;
  const n = text.length;
  let dirty = false;
  while (i < n) {
    const c = text[i]!;
    if (c === '"' && field === "" && !dirty) {
      const startLine = line;
      i++;
      for (;;) {
        if (i >= n) throw new ConvError(`The quoted text that starts on line ${startLine} never ends (a closing " is missing).`);
        const q = text[i]!;
        if (q === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        if (q === "\n") line++;
        field += q;
        i++;
      }
      dirty = true;
      continue;
    }
    if (c === delimiter) { row.push(field); field = ""; dirty = false; i++; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++;
      line++;
      const blank = row.length === 0 && field === "" && !dirty;
      row.push(field);
      field = "";
      dirty = false;
      if (!blank) rows.push(row);
      row = [];
      continue;
    }
    field += c;
    dirty = true;
    i++;
  }
  if (field !== "" || row.length > 0 || dirty) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function writeCsvRows(columns: string[] | null, rows: Value[][], delimiter: Delimiter, notes: Notes): string {
  const cell = (v: Value): string => {
    let s: string;
    if (v === null) s = "";
    else if (typeof v === "number" && !Number.isFinite(v)) { notes.add("A number that isn't finite was written as an empty cell."); s = ""; }
    else s = typeof v === "string" ? v : String(v);
    return /["\r\n]/.test(s) || s.includes(delimiter) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  if (columns) lines.push(columns.map(cell).join(delimiter));
  for (const r of rows) lines.push(r.map(cell).join(delimiter));
  return `${lines.join("\n")}\n`;
}
