/**
 * Pure helpers for Redis Studio: dangerous-command detection, export-document
 * validation, delete-pattern safety and export file naming. No network access.
 */

export const REDIS_EXPORT_VERSION = 1;
export const REDIS_EXPORTABLE_TYPES = ["string", "hash", "list", "set", "zset"] as const;
export type RedisExportableType = (typeof REDIS_EXPORTABLE_TYPES)[number];

export interface RedisExportKey {
  key: string;
  type: RedisExportableType;
  /** Seconds to live, or -1 for persistent. */
  ttl: number;
  value: any;
}

export interface RedisExportDoc {
  format: "redis-studio-export";
  version: number;
  db: number;
  exportedAt: string;
  keys: RedisExportKey[];
  skipped?: number;
}

const DANGEROUS = new Set(["FLUSHALL", "FLUSHDB", "SHUTDOWN", "DEBUG", "SLAVEOF", "REPLICAOF", "ACL", "MODULE", "BGREWRITEAOF"]);

/** True for commands that can destroy data or reconfigure the server (asks the user to confirm). */
export function isDangerousCommand(line: string): boolean {
  const tokens = (line || "").trim().split(/\s+/);
  const cmd = (tokens[0] || "").toUpperCase();
  if (DANGEROUS.has(cmd)) return true;
  if (cmd === "CONFIG" && /^(SET|REWRITE|RESETSTAT)$/i.test(tokens[1] || "")) return true;
  return false;
}

/** Validates a bulk-delete glob. Rejects empty patterns; flags "match everything". */
export function normalizeDeletePattern(raw: string): { ok: boolean; pattern: string; matchesAll: boolean; error?: string } {
  const pattern = (raw || "").trim();
  if (!pattern) return { ok: false, pattern, matchesAll: false, error: "A key pattern is required (e.g. session:*)" };
  return { ok: true, pattern, matchesAll: /^\*+$/.test(pattern) };
}

export function exportFileName(db: number, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `redis_export_db${db}_${stamp}.json`;
}

function validValue(type: string, value: any): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "hash": return !!value && typeof value === "object" && !Array.isArray(value);
    case "list":
    case "set": return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "zset": return Array.isArray(value) && value.every((v) => v && typeof v.member === "string" && Number.isFinite(Number(v.score)));
    default: return false;
  }
}

/** Parses/validates an export document (object or JSON text). */
export function validateExportDoc(input: unknown): { ok: boolean; doc?: RedisExportDoc; errors: string[] } {
  const errors: string[] = [];
  let doc: any = input;
  if (typeof input === "string") {
    try { doc = JSON.parse(input); } catch (e: any) { return { ok: false, errors: [`Invalid JSON: ${e.message}`] }; }
  }
  if (!doc || typeof doc !== "object") return { ok: false, errors: ["Export document must be a JSON object"] };
  if (doc.format !== "redis-studio-export") errors.push("Not a Redis Studio export file (missing format marker)");
  if (!Array.isArray(doc.keys)) errors.push("Missing 'keys' array");
  if (errors.length) return { ok: false, errors };
  const keys: RedisExportKey[] = [];
  doc.keys.forEach((k: any, i: number) => {
    if (!k || typeof k.key !== "string" || !k.key) { errors.push(`keys[${i}]: missing key name`); return; }
    if (!(REDIS_EXPORTABLE_TYPES as readonly string[]).includes(k.type)) { errors.push(`keys[${i}] '${k.key}': unsupported type '${k.type}'`); return; }
    if (!validValue(k.type, k.value)) { errors.push(`keys[${i}] '${k.key}': invalid ${k.type} value`); return; }
    keys.push({ key: k.key, type: k.type, ttl: Number.isFinite(Number(k.ttl)) ? Number(k.ttl) : -1, value: k.value });
  });
  return { ok: errors.length === 0, doc: { ...doc, keys }, errors };
}

import { parseUniversalTable } from "./db/importParser";

export interface RedisImportOptions {
  format?: string;
  fileName?: string;
  base64?: string;
  bytes?: Uint8Array;
  keyPrefix?: string;
  sheet?: string;
}

function coerceEntryToExportKey(keyName: string, rawVal: any, explicitType?: string, explicitTtl?: any): RedisExportKey | null {
  const key = String(keyName ?? "").trim();
  if (!key) return null;
  const ttl = Number.isFinite(Number(explicitTtl)) && Number(explicitTtl) > 0 ? Math.floor(Number(explicitTtl)) : -1;

  if (explicitType && (REDIS_EXPORTABLE_TYPES as readonly string[]).includes(explicitType)) {
    const t = explicitType as RedisExportableType;
    let v = rawVal;
    if (typeof v === "string" && t !== "string") {
      try { v = JSON.parse(v); } catch {}
    }
    if (t === "string") return { key, type: "string", ttl, value: v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v) };
    if (t === "hash" && v && typeof v === "object" && !Array.isArray(v)) {
      const h: Record<string, string> = {};
      for (const [fk, fv] of Object.entries(v)) h[fk] = fv === null || fv === undefined ? "" : typeof fv === "object" ? JSON.stringify(fv) : String(fv);
      return { key, type: "hash", ttl, value: h };
    }
    if ((t === "list" || t === "set") && Array.isArray(v)) {
      return { key, type: t, ttl, value: v.map((item) => item === null || item === undefined ? "" : typeof item === "object" ? JSON.stringify(item) : String(item)) };
    }
    if (t === "zset" && Array.isArray(v)) {
      const zs = v
        .map((item) => {
          if (item && typeof item === "object" && "member" in item) {
            return { member: String(item.member), score: Number(item.score) || 0 };
          }
          return null;
        })
        .filter((x): x is { member: string; score: number } => x !== null);
      return { key, type: "zset", ttl, value: zs };
    }
  }

  if (rawVal === null || rawVal === undefined) {
    return { key, type: "string", ttl, value: "" };
  }
  if (typeof rawVal === "string" || typeof rawVal === "number" || typeof rawVal === "boolean") {
    return { key, type: "string", ttl, value: String(rawVal) };
  }
  if (Array.isArray(rawVal)) {
    if (rawVal.length > 0 && rawVal.every((x) => x && typeof x === "object" && "member" in x && Number.isFinite(Number(x.score)))) {
      return {
        key,
        type: "zset",
        ttl,
        value: rawVal.map((x) => ({ member: String(x.member), score: Number(x.score) })),
      };
    }
    return {
      key,
      type: "list",
      ttl,
      value: rawVal.map((x) => (x === null || x === undefined ? "" : typeof x === "object" ? JSON.stringify(x) : String(x))),
    };
  }
  if (typeof rawVal === "object") {
    const h: Record<string, string> = {};
    for (const [fk, fv] of Object.entries(rawVal)) {
      h[fk] = fv === null || fv === undefined ? "" : typeof fv === "object" ? JSON.stringify(fv) : String(fv);
    }
    return { key, type: "hash", ttl, value: h };
  }
  return { key, type: "string", ttl, value: String(rawVal) };
}

function normalizeNamespacePrefix(prefix?: string, fallback = "import"): string {
  const raw = (prefix ?? "").trim();
  if (raw) return raw.endsWith(":") ? raw : `${raw}:`;
  const fb = fallback.replace(/\.[^.]+$/, "").replace(/[^\w:-]+/g, "_").replace(/^_+|_+$/g, "");
  return fb ? (fb.endsWith(":") ? fb : `${fb}:`) : "import:";
}

function convertRowsToRedisKeys(
  columns: string[],
  rawRows: Array<Record<string, any> | any[]>,
  opts?: RedisImportOptions & { selectedSheet?: string },
): RedisExportKey[] {
  if (!rawRows.length || !columns.length) return [];
  const rows: Record<string, any>[] = rawRows.map((r) => {
    if (Array.isArray(r)) {
      const obj: Record<string, any> = {};
      columns.forEach((col, i) => {
        obj[col] = r[i] ?? null;
      });
      return obj;
    }
    return r;
  });
  const lowerCols = columns.map((c) => c.toLowerCase());
  const rawPrefix = (opts?.keyPrefix ?? "").trim();
  const explicitPrefix = rawPrefix ? (rawPrefix.endsWith(":") ? rawPrefix : `${rawPrefix}:`) : "";

  // Case 1: INI-style [section, key, value] or section-grouped rows (where "section" is a column)
  if (lowerCols.includes("section")) {
    const secCol = columns[lowerCols.indexOf("section")]!;
    if (lowerCols.length === 3 && lowerCols.includes("key") && lowerCols.includes("value")) {
      const keyCol = columns[lowerCols.indexOf("key")]!;
      const valCol = columns[lowerCols.indexOf("value")]!;
      const sectionHashes = new Map<string, Record<string, string>>();
      const out: RedisExportKey[] = [];
      for (const r of rows) {
        const sec = String(r[secCol] ?? "").trim();
        const k = String(r[keyCol] ?? "").trim();
        if (!k) continue;
        const v = r[valCol] === null || r[valCol] === undefined ? "" : typeof r[valCol] === "object" ? JSON.stringify(r[valCol]) : String(r[valCol]);
        if (!sec) {
          out.push({ key: `${explicitPrefix}${k}`, type: "string", ttl: -1, value: v });
        } else {
          const hashKey = `${explicitPrefix}${sec}`;
          let h = sectionHashes.get(hashKey);
          if (!h) {
            h = {};
            sectionHashes.set(hashKey, h);
          }
          h[k] = v;
        }
      }
      for (const [hk, hv] of sectionHashes.entries()) {
        out.push({ key: hk, type: "hash", ttl: -1, value: hv });
      }
      return out;
    }
    const out: RedisExportKey[] = [];
    rows.forEach((r, idx) => {
      const sec = String(r[secCol] ?? "").trim() || String(idx + 1);
      const hash: Record<string, string> = {};
      for (const c of columns) {
        if (c === secCol) continue;
        const v = r[c];
        if (v === null || v === undefined) continue;
        hash[c] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      out.push({ key: `${explicitPrefix}${sec}`, type: "hash", ttl: -1, value: hash });
    });
    return out;
  }

  // Case 2: Direct key/value table (e.g., .env, .properties, plist dict, or CSV with key,value[,type,ttl])
  const keyIdx = lowerCols.indexOf("key");
  const valIdx = lowerCols.indexOf("value");
  if (keyIdx >= 0 && valIdx >= 0 && columns.length <= 4) {
    const keyCol = columns[keyIdx]!;
    const valCol = columns[valIdx]!;
    const typeCol = lowerCols.indexOf("type") >= 0 ? columns[lowerCols.indexOf("type")]! : undefined;
    const ttlCol = lowerCols.indexOf("ttl") >= 0 ? columns[lowerCols.indexOf("ttl")]! : undefined;
    const allowedExtra = new Set([keyCol, valCol, ...(typeCol ? [typeCol] : []), ...(ttlCol ? [ttlCol] : [])]);
    if (columns.every((c) => allowedExtra.has(c))) {
      const out: RedisExportKey[] = [];
      for (const r of rows) {
        const kName = String(r[keyCol] ?? "").trim();
        if (!kName) continue;
        const entry = coerceEntryToExportKey(
          `${explicitPrefix}${kName}`,
          r[valCol],
          typeCol ? String(r[typeCol] ?? "").toLowerCase() : undefined,
          ttlCol ? r[ttlCol] : undefined,
        );
        if (entry) out.push(entry);
      }
      return out;
    }
  }

  // Case 3: General tabular records -> each row becomes a Redis Hash under <prefix>:<id_or_row_index>
  const ns = normalizeNamespacePrefix(opts?.keyPrefix, opts?.selectedSheet || opts?.fileName || "row");
  const idCandidates = ["key", "id", "uid", "uuid", "code", "sku", "slug", "username", "email", "name"];
  let pkCol: string | undefined;
  for (const cand of idCandidates) {
    const idx = lowerCols.indexOf(cand);
    if (idx >= 0) {
      pkCol = columns[idx]!;
      break;
    }
  }
  const out: RedisExportKey[] = [];
  rows.forEach((r, idx) => {
    const rawId = pkCol && r[pkCol] !== null && r[pkCol] !== undefined && String(r[pkCol]).trim() !== ""
      ? String(r[pkCol]).trim()
      : String(idx + 1);
    const key = rawId.includes(":") && !opts?.keyPrefix ? rawId : `${ns}${rawId}`;
    const hash: Record<string, string> = {};
    for (const c of columns) {
      const v = r[c];
      if (v === null || v === undefined) continue;
      hash[c] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    out.push({ key, type: "hash", ttl: -1, value: hash });
  });
  return out;
}

function tokenizeCliLine(line: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === "\\" && i + 1 < line.length) {
        const next = line[++i]!;
        cur += next === "n" ? "\n" : next === "r" ? "\r" : next === "t" ? "\t" : next;
      } else if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur.length > 0) {
        tokens.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) tokens.push(cur);
  return tokens;
}

const REDIS_CLI_WRITE_CMDS = new Set([
  "SET", "SETEX", "PSETEX", "SETNX", "MSET",
  "HSET", "HMSET",
  "RPUSH", "LPUSH",
  "SADD",
  "ZADD",
  "EXPIRE", "PEXPIRE",
]);

function looksLikeRedisCliScript(text: string, fileName?: string): boolean {
  if (fileName && /\.(redis|resp)$/i.test(fileName)) return true;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//") && !l.startsWith("--"));
  if (!lines.length) return false;
  let matched = 0;
  for (const l of lines) {
    const first = (l.split(/\s+/)[0] || "").toUpperCase();
    if (REDIS_CLI_WRITE_CMDS.has(first)) matched++;
    else return false;
  }
  return matched > 0;
}

function parseRedisCliScript(text: string, keyPrefix = ""): RedisExportKey[] {
  const pfx = keyPrefix.trim();
  const map = new Map<string, RedisExportKey>();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("--")) continue;
    const toks = tokenizeCliLine(trimmed);
    if (toks.length < 2) continue;
    const cmd = toks[0]!.toUpperCase();
    if (cmd === "SET" || cmd === "SETNX") {
      if (toks.length < 3) continue;
      const k = `${pfx}${toks[1]!}`;
      let ttl = -1;
      for (let i = 3; i < toks.length - 1; i++) {
        const opt = toks[i]!.toUpperCase();
        if (opt === "EX") ttl = Math.max(1, parseInt(toks[i + 1]!, 10) || -1);
        if (opt === "PX") ttl = Math.max(1, Math.ceil((parseInt(toks[i + 1]!, 10) || 0) / 1000));
      }
      map.set(k, { key: k, type: "string", ttl, value: toks[2]! });
    } else if (cmd === "SETEX") {
      if (toks.length < 4) continue;
      const k = `${pfx}${toks[1]!}`;
      map.set(k, { key: k, type: "string", ttl: Math.max(1, parseInt(toks[2]!, 10) || -1), value: toks[3]! });
    } else if (cmd === "PSETEX") {
      if (toks.length < 4) continue;
      const k = `${pfx}${toks[1]!}`;
      map.set(k, { key: k, type: "string", ttl: Math.max(1, Math.ceil((parseInt(toks[2]!, 10) || 0) / 1000)), value: toks[3]! });
    } else if (cmd === "MSET") {
      for (let i = 1; i < toks.length - 1; i += 2) {
        const k = `${pfx}${toks[i]!}`;
        map.set(k, { key: k, type: "string", ttl: -1, value: toks[i + 1]! });
      }
    } else if (cmd === "HSET" || cmd === "HMSET") {
      const k = `${pfx}${toks[1]!}`;
      const existing = map.get(k);
      const hash: Record<string, string> = existing && existing.type === "hash" ? { ...existing.value } : {};
      for (let i = 2; i < toks.length - 1; i += 2) {
        hash[toks[i]!] = toks[i + 1]!;
      }
      map.set(k, { key: k, type: "hash", ttl: existing ? existing.ttl : -1, value: hash });
    } else if (cmd === "RPUSH" || cmd === "LPUSH") {
      const k = `${pfx}${toks[1]!}`;
      const existing = map.get(k);
      const list: string[] = existing && existing.type === "list" ? [...existing.value] : [];
      const vals = toks.slice(2);
      if (cmd === "LPUSH") list.unshift(...vals.reverse());
      else list.push(...vals);
      map.set(k, { key: k, type: "list", ttl: existing ? existing.ttl : -1, value: list });
    } else if (cmd === "SADD") {
      const k = `${pfx}${toks[1]!}`;
      const existing = map.get(k);
      const set = new Set<string>(existing && existing.type === "set" ? existing.value : []);
      for (const v of toks.slice(2)) set.add(v);
      map.set(k, { key: k, type: "set", ttl: existing ? existing.ttl : -1, value: [...set] });
    } else if (cmd === "ZADD") {
      const k = `${pfx}${toks[1]!}`;
      const existing = map.get(k);
      const zset: { member: string; score: number }[] = existing && existing.type === "zset" ? [...existing.value] : [];
      for (let i = 2; i < toks.length - 1; i += 2) {
        const score = Number(toks[i]!);
        const member = toks[i + 1]!;
        if (!Number.isFinite(score)) continue;
        const idx = zset.findIndex((x) => x.member === member);
        if (idx >= 0) zset[idx]!.score = score;
        else zset.push({ member, score });
      }
      map.set(k, { key: k, type: "zset", ttl: existing ? existing.ttl : -1, value: zset });
    } else if (cmd === "EXPIRE" || cmd === "PEXPIRE") {
      const k = `${pfx}${toks[1]!}`;
      const existing = map.get(k);
      if (existing && toks[2]) {
        const rawTtl = parseInt(toks[2], 10);
        if (Number.isFinite(rawTtl) && rawTtl > 0) {
          existing.ttl = cmd === "PEXPIRE" ? Math.max(1, Math.ceil(rawTtl / 1000)) : rawTtl;
        }
      }
    }
  }
  return [...map.values()];
}

function makeExportDoc(keys: RedisExportKey[], db = 0): RedisExportDoc {
  return {
    format: "redis-studio-export",
    version: REDIS_EXPORT_VERSION,
    db,
    exportedAt: new Date().toISOString(),
    keys,
  };
}

/**
 * Universal multi-format Redis key import parser.
 * Supports:
 * - Native Redis Studio export JSON (`{ format: "redis-studio-export", keys: [...] }`)
 * - JSON / JSONC / JSON5 arrays of key objects, record arrays, or key-value maps
 * - JSONL / NDJSON streams
 * - Redis CLI scripts (`SET`, `MSET`, `HSET`, `HMSET`, `RPUSH`, `LPUSH`, `SADD`, `ZADD`, `EXPIRE`)
 * - Excel (`.xlsx`) & OpenDocument (`.ods`) spreadsheets
 * - CSV, TSV, PSV delimited files
 * - YAML (`.yaml`/`.yml`), TOML (`.toml`), XML (`.xml`), Apple Plist (`.plist`)
 * - SQL dumps (`INSERT INTO ... VALUES` and PostgreSQL `COPY ... FROM stdin`)
 * - Markdown tables (`.md`), HTML `<table>` (`.html`)
 * - INI/CFG (`.ini`/`.cfg`/`.conf`), Dotenv (`.env`), and Java `.properties`
 */
export async function parseRedisImportPayload(
  input: unknown,
  opts: RedisImportOptions = {},
): Promise<{ ok: boolean; doc?: RedisExportDoc; errors: string[]; detectedFormat?: string }> {
  const keyPrefix = (opts.keyPrefix ?? "").trim();

  // 1. Binary spreadsheet (.xlsx / .ods) via base64 or bytes
  if (opts.base64 || opts.bytes) {
    try {
      const parsed = await parseUniversalTable({
        base64: opts.base64,
        bytes: opts.bytes,
        fileName: opts.fileName,
        format: opts.format,
        sheet: opts.sheet,
      });
      const keys = convertRowsToRedisKeys(parsed.columns, parsed.rows, { ...opts, selectedSheet: parsed.selectedSheet });
      if (!keys.length) return { ok: false, errors: ["No keys or rows found in spreadsheet"] };
      return { ok: true, doc: makeExportDoc(keys), errors: [], detectedFormat: parsed.format };
    } catch (e: any) {
      return { ok: false, errors: [e?.message || String(e)] };
    }
  }

  // 2. Pre-parsed JS object / array
  if (input && typeof input === "object") {
    const obj = input as any;
    if (obj.format === "redis-studio-export" || ("keys" in obj && Object.keys(obj).length <= 6 && !opts.format)) {
      const v = validateExportDoc(obj);
      if (v.ok && v.doc) {
        if (keyPrefix) {
          v.doc.keys = v.doc.keys.map((k) => ({ ...k, key: `${keyPrefix}${k.key}` }));
        }
        return { ...v, detectedFormat: "redis-studio-export" };
      }
      // If it explicitly had format === "redis-studio-export", return validation errors directly
      if (obj.format === "redis-studio-export") return v;
    }

    if (Array.isArray(obj)) {
      if (obj.length > 0 && obj.every((x) => x && typeof x === "object" && typeof x.key === "string" && "value" in x)) {
        const keys: RedisExportKey[] = [];
        for (const item of obj) {
          const entry = coerceEntryToExportKey(`${keyPrefix}${item.key}`, item.value, item.type, item.ttl);
          if (entry) keys.push(entry);
        }
        return { ok: keys.length > 0, doc: makeExportDoc(keys), errors: keys.length ? [] : ["No valid keys in array"], detectedFormat: "json" };
      }
      const cols = Array.from(new Set(obj.flatMap((x) => (x && typeof x === "object" ? Object.keys(x) : []))));
      const keys = convertRowsToRedisKeys(cols, obj, opts);
      return { ok: keys.length > 0, doc: makeExportDoc(keys), errors: keys.length ? [] : ["No keys extracted from JSON array"], detectedFormat: "json" };
    }

    // Plain object key-value map
    const entries = Object.entries(obj);
    if (entries.length > 0) {
      const keys: RedisExportKey[] = [];
      for (const [k, v] of entries) {
        const entry = coerceEntryToExportKey(`${keyPrefix}${k}`, v);
        if (entry) keys.push(entry);
      }
      if (keys.length > 0) {
        return { ok: true, doc: makeExportDoc(keys), errors: [], detectedFormat: "json-map" };
      }
    }
    return validateExportDoc(input);
  }

  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, errors: ["Invalid JSON: Empty import payload"] };
  }

  const text = input.replace(/^\uFEFF/, "").trim();
  const fmtHint = (opts.format && opts.format !== "auto" ? opts.format : "").toLowerCase();
  const extMatch = (opts.fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1]! : "";

  // 3. Redis CLI command script
  if (fmtHint === "redis" || fmtHint === "cli" || looksLikeRedisCliScript(text, opts.fileName)) {
    const keys = parseRedisCliScript(text, keyPrefix);
    if (keys.length > 0) {
      return { ok: true, doc: makeExportDoc(keys), errors: [], detectedFormat: "redis-cli" };
    }
  }

  // 4. Check if it's JSON / JSONC / JSON5
  const looksLikeIniSection = /^\[[A-Za-z0-9_.:-]+\]\s*(?:[#;].*)?(?:\r?\n|$)/.test(text);
  const isJsonCandidate =
    fmtHint === "json" ||
    fmtHint === "jsonc" ||
    fmtHint === "json5" ||
    ext === "json" ||
    ext === "jsonc" ||
    ext === "json5" ||
    (!fmtHint && (text.startsWith("{") || (text.startsWith("[") && !looksLikeIniSection)));
  if (isJsonCandidate) {
    try {
      const parsedJson = typeof Bun !== "undefined" && (Bun as any).JSON5 ? (Bun as any).JSON5.parse(text) : JSON.parse(text);
      if (parsedJson && typeof parsedJson === "object") {
        if ((parsedJson as any).format === "redis-studio-export") {
          const v = validateExportDoc(parsedJson);
          if (v.ok && v.doc && keyPrefix) {
            v.doc.keys = v.doc.keys.map((k) => ({ ...k, key: `${keyPrefix}${k.key}` }));
          }
          return { ...v, detectedFormat: "redis-studio-export" };
        }
        return parseRedisImportPayload(parsedJson, opts);
      }
    } catch (jsonErr: any) {
      // Check if it's JSONL / NDJSON (multiple JSON objects per line)
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((l) => l.startsWith("{") && l.endsWith("}"))) {
        try {
          const objs = lines.map((l) => JSON.parse(l));
          return parseRedisImportPayload(objs, { ...opts, format: "ndjson" });
        } catch {}
      }
      if (fmtHint === "json" || ext === "json" || text.startsWith("{") || (text.startsWith("[") && !looksLikeIniSection)) {
        return { ok: false, errors: [`Invalid JSON: ${jsonErr.message}`] };
      }
    }
  }

  // 5. YAML / TOML direct key-value mapping support (when top-level is a key-value map of Redis keys)
  if (fmtHint === "yaml" || fmtHint === "yml" || ext === "yaml" || ext === "yml" || /^---\s*\r?\n/.test(text)) {
    try {
      const yDoc = Bun.YAML.parse(text);
      if (yDoc && typeof yDoc === "object") {
        return parseRedisImportPayload(yDoc, { ...opts, format: "yaml" });
      }
    } catch {}
  }
  if (fmtHint === "toml" || ext === "toml") {
    try {
      const tDoc = Bun.TOML.parse(text);
      if (tDoc && typeof tDoc === "object" && !Array.isArray(tDoc)) {
        // Flatten section tables or convert via parseUniversalTable
        const parsed = await parseUniversalTable({ content: text, format: "toml", fileName: opts.fileName, sheet: opts.sheet });
        const keys = convertRowsToRedisKeys(parsed.columns, parsed.rows, { ...opts, selectedSheet: parsed.selectedSheet });
        if (keys.length > 0) return { ok: true, doc: makeExportDoc(keys), errors: [], detectedFormat: "toml" };
      }
    } catch {}
  }

  // 6. Check if text looks like a supported structured/tabular/config format (or has an explicit format/fileName)
  const hasExplicitFormat = Boolean(fmtHint || ext);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const looksStructured =
    hasExplicitFormat ||
    /^<\?xml[\s>]|^<!DOCTYPE\s+plist|^<plist[\s>]|^<!DOCTYPE\s+html|^<html[\s>]|^<table[\s>]|^<[a-zA-Z0-9_:-]+[\s>]/i.test(text) ||
    /^(INSERT\s+INTO|REPLACE\s+INTO|COPY\s+|CREATE\s+TABLE)/im.test(text) ||
    /^\s*\|.+\|\s*$/m.test(lines[0] || "") ||
    (/^\s*\[[a-zA-Z0-9_.-]+\]\s*$/m.test(text) && /^\s*[a-zA-Z0-9_.-]+\s*=/m.test(text)) ||
    (lines.length >= 1 && lines.every((l) => /^\s*(?:export\s+)?[a-zA-Z_][a-zA-Z0-9_.-]*\s*[=:]\s*.*$/.test(l) || l.trim().startsWith("#"))) ||
    (lines.length >= 2 && (lines[0]!.includes(",") || lines[0]!.includes("\t") || lines[0]!.includes("|") || lines[0]!.includes(";")));

  if (!looksStructured) {
    return {
      ok: false,
      errors: ["Invalid JSON: Could not parse input as Redis export JSON, CSV/TSV, YAML, TOML, XML, SQL, Key-Value, or Redis CLI commands"],
    };
  }

  try {
    const parsed = await parseUniversalTable({
      content: text,
      fileName: opts.fileName,
      format: fmtHint || undefined,
      sheet: opts.sheet,
    });
    const keys = convertRowsToRedisKeys(parsed.columns, parsed.rows, { ...opts, selectedSheet: parsed.selectedSheet });
    if (!keys.length) {
      return { ok: false, errors: ["Invalid JSON: No importable keys or rows found in input"] };
    }
    return { ok: true, doc: makeExportDoc(keys), errors: [], detectedFormat: parsed.format };
  } catch (err: any) {
    return { ok: false, errors: [`Invalid JSON: ${err?.message || String(err)}`] };
  }
}

