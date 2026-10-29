/**
 * JSON tools -- pure helpers used by JSON Query Studio (no GUI / IO dependencies, fully unit-testable).
 */

export interface JsonValidation {
  ok: boolean;
  error?: string;
  /** 1-based line of the first syntax error (best effort). */
  line?: number;
  /** 1-based column of the first syntax error (best effort). */
  col?: number;
}

/** Locate the first offending character by finding the shortest prefix that fails for a reason other than "ran out of input". */
function locateJsonError(text: string, message: string): { line: number; col: number } {
  let pos = -1;
  const m = message.match(/position (\d+)/i);
  if (m) pos = parseInt(m[1]!, 10);
  if (pos < 0) {
    // JavaScriptCore reports e.g.: Unexpected identifier "oops" -- find that token in the text
    const tok = message.match(/(?:identifier|token|character)\s+["'`](.+?)["'`]/i);
    if (tok) {
      const at = text.indexOf(tok[1]!);
      if (at >= 0) pos = at;
    }
  }
  if (pos < 0 && text.length <= 300_000) {
    if (text.length <= 512) {
      for (let n = 1; n <= text.length; n++) {
        try {
          JSON.parse(text.slice(0, n));
        } catch (e: any) {
          if (/unexpected (token|identifier|character)|unrecognized/i.test(String(e?.message)) && !/eof|end of/i.test(String(e?.message))) {
            pos = n - 1;
            break;
          }
        }
      }
    } else {
      // Binary search over prefix length in O(log N) instead of O(N^2)
      let lo = 1;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        let hardError = false;
        try {
          JSON.parse(text.slice(0, mid));
        } catch (e: any) {
          const msg = String(e?.message);
          if (/unexpected (token|identifier|character)|unrecognized/i.test(msg) && !/eof|end of/i.test(msg)) {
            hardError = true;
          }
        }
        if (hardError) {
          hi = mid;
        } else {
          lo = mid + 1;
        }
      }
      pos = Math.max(0, lo - 1);
    }
  }
  if (pos < 0) pos = Math.max(0, text.length - 1);
  const before = text.slice(0, pos);
  const line = before.split("\n").length;
  const col = pos - (before.lastIndexOf("\n") + 1) + 1;
  return { line, col };
}

export function validateJson(text: string): JsonValidation {
  if (!text.trim()) return { ok: false, error: "Document is empty", line: 1, col: 1 };
  try {
    JSON.parse(text);
    return { ok: true };
  } catch (e: any) {
    const message = String(e?.message || e);
    const { line, col } = locateJsonError(text, message);
    return { ok: false, error: message, line, col };
  }
}

export type IndentChoice = "2 spaces" | "4 spaces" | "Tab" | string;

export function indentFrom(choice: IndentChoice | undefined): string | number {
  const c = String(choice || "2 spaces").toLowerCase();
  if (c.startsWith("tab")) return "\t";
  if (c.startsWith("4")) return 4;
  return 2;
}

export function formatJson(text: string, indent: string | number = 2): string {
  return JSON.stringify(JSON.parse(text), null, indent);
}

export function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text));
}

export function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value).sort((a, b) => a.localeCompare(b))) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

// ------------------------------------------------------------------ CSV

function csvCell(v: any): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Array of objects -> CSV (union of keys as header). Array of primitives -> one `value` column. Object -> key,value rows. */
export function jsonToCsv(value: any): string {
  if (Array.isArray(value)) {
    const rows = value;
    if (rows.length > 0 && rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
      const headers: string[] = [];
      for (const r of rows) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
      return [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n");
    }
    return ["value", ...rows.map(csvCell)].join("\n");
  }
  if (value && typeof value === "object") {
    return ["key,value", ...Object.entries(value).map(([k, v]) => `${csvCell(k)},${csvCell(v)}`)].join("\n");
  }
  return csvCell(value);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function inferScalar(s: string): any {
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** CSV text (first row = header) -> array of objects with number/boolean/null inference. */
export function csvToJson(text: string): any[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...body] = rows as [string[], ...string[][]];
  return body.map((r) => {
    const o: Record<string, any> = {};
    header.forEach((h, i) => { o[h] = inferScalar(r[i] ?? ""); });
    return o;
  });
}

// ------------------------------------------------------------------ YAML

function yamlScalar(v: any): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (s === "" || /^[\s]|[\s]$|^[-?:,\[\]{}#&*!|>'"%@`]|: |#|^(true|false|null|yes|no|on|off|~)$/i.test(s) || /^-?\d+(\.\d+)?$/.test(s) || s.includes("\n")) {
    return JSON.stringify(s);
  }
  return s;
}

export function jsonToYaml(value: any, level = 0): string {
  const pad = "  ".repeat(level);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (item && typeof item === "object" && (Array.isArray(item) ? item.length : Object.keys(item).length)) {
          const inner = jsonToYaml(item, level + 1);
          const lines = inner.split("\n");
          lines[0] = lines[0]!.trimStart();
          return `${pad}- ${lines.join("\n")}`;
        }
        return `${pad}- ${item && typeof item === "object" ? (Array.isArray(item) ? "[]" : "{}") : yamlScalar(item)}`;
      })
      .join("\n");
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return keys
      .map((k) => {
        const v = value[k];
        const key = /^[A-Za-z_][\w.-]*$/.test(k) ? k : JSON.stringify(k);
        if (v && typeof v === "object" && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
          return `${pad}${key}:\n${jsonToYaml(v, level + 1)}`;
        }
        return `${pad}${key}: ${v && typeof v === "object" ? (Array.isArray(v) ? "[]" : "{}") : yamlScalar(v)}`;
      })
      .join("\n");
  }
  return pad + yamlScalar(value);
}

// ------------------------------------------------------------------ stats / search

export interface JsonStats {
  bytes: number;
  depth: number;
  objects: number;
  arrays: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  keys: number;
}

export function jsonStats(value: any, text?: string): JsonStats {
  const s: JsonStats = {
    bytes: new TextEncoder().encode(text ?? JSON.stringify(value)).length,
    depth: 0, objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, keys: 0,
  };
  const walk = (v: any, d: number) => {
    s.depth = Math.max(s.depth, d);
    if (Array.isArray(v)) { s.arrays++; v.forEach((x) => walk(x, d + 1)); }
    else if (v && typeof v === "object") {
      s.objects++;
      for (const k of Object.keys(v)) { s.keys++; walk(v[k], d + 1); }
    } else if (v === null) s.nulls++;
    else if (typeof v === "string") s.strings++;
    else if (typeof v === "number") s.numbers++;
    else if (typeof v === "boolean") s.booleans++;
  };
  walk(value, 1);
  return s;
}

export interface JsonSearchHit { path: string; kind: "key" | "value"; preview: string }

/** Find keys / scalar values containing `term` (case-insensitive). Paths are jq-style (`.a.b[2].c`). */
export function searchJson(value: any, term: string, limit = 200): JsonSearchHit[] {
  const t = term.toLowerCase();
  const hits: JsonSearchHit[] = [];
  if (!t) return hits;
  const walk = (v: any, path: string) => {
    if (hits.length >= limit) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const k of Object.keys(v)) {
        const p = /^[A-Za-z_]\w*$/.test(k) ? `${path}.${k}` : `${path}["${k}"]`;
        if (k.toLowerCase().includes(t)) hits.push({ path: p, kind: "key", preview: k });
        walk(v[k], p);
      }
    } else if (String(v).toLowerCase().includes(t)) {
      hits.push({ path: path || ".", kind: "value", preview: JSON.stringify(v) });
    }
  };
  walk(value, "");
  return hits.slice(0, limit);
}
