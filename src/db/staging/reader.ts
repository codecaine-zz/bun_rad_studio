/**
 * Streaming and multi-format readers for the formats the import understands: delimited text (comma, tab, semicolon,
 * pipe, ...), JSON arrays/wrappers/JSON5/JSONC, JSON Lines / NDJSON, Excel (.xlsx), OpenDocument (.ods), YAML, TOML,
 * XML, Apple Property Lists (.plist), SQL dumps (INSERT & COPY), Markdown tables, HTML tables, INI, .env and .properties.
 */
import { ConvError, Notes, isObj, newObj, setKey, toTable, type Obj, type Value } from "../../features/filemanager/fmConvCommon";
import { parseJson as parseLenientJson, parseToml, parseYaml } from "../../features/filemanager/fmConvData";
import { parseEnv, parseHtmlTable, parseIni, parseMarkdownTable, parsePlist, parseProperties, parseSql, parseXml } from "../../features/filemanager/fmConvMarkup";
import { readSpreadsheet, readSpreadsheetBuffer, type Sheet } from "../../features/filemanager/fmConvSheet";
import { StagingError, limitMessage, limits } from "./limits";
import { decodeChunks, detectEncoding, ENCODING_LABELS, isEncodingName, type ByteSource, type EncodingInfo, type EncodingName } from "./source";
import { inferColumn, parseBoolean, parseDate, parseNumber, type InferredColumn } from "./values";

export type SourceFormat =
  | "csv"
  | "json"
  | "ndjson"
  | "xlsx"
  | "ods"
  | "yaml"
  | "toml"
  | "xml"
  | "sql"
  | "markdown"
  | "html"
  | "ini"
  | "env"
  | "properties"
  | "plist";

export const SOURCE_FORMATS: SourceFormat[] = [
  "csv",
  "json",
  "ndjson",
  "xlsx",
  "ods",
  "yaml",
  "toml",
  "xml",
  "sql",
  "markdown",
  "html",
  "ini",
  "env",
  "properties",
  "plist",
];

export const isSourceFormat = (v: unknown): v is SourceFormat => typeof v === "string" && (SOURCE_FORMATS as string[]).includes(v);

export interface SourceSettings {
  format: SourceFormat;
  /** One character; "" for a file with a single column. Ignored for JSON. */
  delimiter: string;
  /** `"`, `'` or "" (no quoting). */
  quote: string;
  hasHeader: boolean;
  encoding: EncodingName;
  /** Optional worksheet or table name for multi-sheet spreadsheets or multi-table files. */
  sheet?: string;
}

export interface SourceRow {
  /** Row number as a spreadsheet shows it: the header is row 1 when there is one. */
  n: number;
  cells: (string | null)[];
  /** Set when the row is damaged (wrong number of fields, not valid JSON...). */
  problem?: string;
  /** The row's own cells when they did not fit the header. */
  rawCells?: (string | null)[];
  /** JSON fields that are not among the columns. */
  extra?: Record<string, string | null>;
}

export interface ReadContext {
  warnings: Set<string>;
  /** Characters that could not be decoded. */
  replaced: { replaced: number };
}

export const newReadContext = (): ReadContext => ({ warnings: new Set(), replaced: { replaced: 0 } });

const esc = (c: string) => c.replace(/[\\\]^-]/g, "\\$&");

interface RawRecord {
  cells: string[];
  blank: boolean;
}

/** Splits text into records and fields following RFC 4180, leniently: a quote inside an unquoted field is just a quote. */
export async function* parseDelimited(chunks: AsyncIterable<string>, opts: { delimiter: string; quote: string }, ctx: ReadContext): AsyncGenerator<RawRecord> {
  const D = opts.delimiter;
  const Q = opts.quote;
  const special = new RegExp(`[${D ? esc(D) : ""}${Q ? esc(Q) : ""}\\r\\n]`, "g");
  let row: string[] = [];
  let field = "";
  let atStart = true;
  let inQ = false;
  let sawQuote = false;
  let pendingQuote = false;
  let pendingCR = false;
  let recChars = 0;
  const cap = limits.maxRecordChars;
  const tooBig = () => new StagingError(limitMessage("record"), "RECORD_TOO_BIG", 413);

  for await (const s of chunks) {
    let i = 0;
    if (pendingCR) {
      pendingCR = false;
      if (s[0] === "\n") i = 1;
    }
    if (pendingQuote) {
      pendingQuote = false;
      if (s[0] === Q) {
        field += Q;
        i = 1;
      } else inQ = false;
    }
    while (i < s.length) {
      if (inQ) {
        const j = s.indexOf(Q, i);
        if (j < 0) {
          field += s.slice(i);
          recChars += s.length - i;
          i = s.length;
          break;
        }
        field += s.slice(i, j);
        recChars += j - i;
        if (j + 1 >= s.length) {
          pendingQuote = true;
          i = s.length;
          break;
        }
        if (s[j + 1] === Q) {
          field += Q;
          i = j + 2;
        } else {
          inQ = false;
          i = j + 1;
        }
        continue;
      }
      special.lastIndex = i;
      const m = special.exec(s);
      const j = m ? m.index : s.length;
      if (j > i) {
        field += s.slice(i, j);
        recChars += j - i;
        atStart = false;
      }
      if (!m) {
        i = s.length;
        break;
      }
      const c = s[j];
      if (Q && c === Q) {
        if (atStart) {
          inQ = true;
          sawQuote = true;
          atStart = false;
        } else field += c;
        i = j + 1;
        continue;
      }
      if (D && c === D) {
        if (recChars > cap) throw tooBig();
        row.push(field);
        field = "";
        atStart = true;
        sawQuote = false;
        i = j + 1;
        continue;
      }
      // end of record
      i = j + 1;
      if (c === "\r") {
        if (i >= s.length) pendingCR = true;
        else if (s[i] === "\n") i++;
      }
      if (recChars > cap) throw tooBig();
      const blank = row.length === 0 && field === "" && !sawQuote;
      row.push(field);
      yield { cells: row, blank };
      row = [];
      field = "";
      atStart = true;
      sawQuote = false;
      recChars = 0;
    }
    if (recChars > cap || field.length > cap) throw tooBig();
  }
  if (inQ) ctx.warnings.add("A quote was opened and never closed, so the last row may be incomplete.");
  if (row.length || field !== "" || sawQuote) {
    row.push(field);
    yield { cells: row, blank: false };
  }
}

interface JsonItem {
  value?: unknown;
  error?: string;
}

/** Streams the elements of a top-level JSON array (or extracts the array from a JSON/JSONC/JSON5 wrapper object). */
export async function* parseJsonArray(chunks: AsyncIterable<string>): AsyncGenerator<JsonItem> {
  let started = false;
  let finished = false;
  let depth = 0;
  let inStr = false;
  let esc2 = false;
  let cur = "";
  const notListError = () =>
    new StagingError(
      'This JSON file is not a list. A JSON file for import must be a list of records, for example [{"name": "Ann"}, ...]. If every record is on its own line, choose “JSON Lines”.',
      "BAD_JSON",
    );
  const finish = (): JsonItem | null => {
    const t = cur.trim();
    cur = "";
    if (!t) return null;
    try {
      return { value: JSON.parse(t) };
    } catch (e) {
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try {
          return { value: parseLenientJson(t, true, new Notes()) };
        } catch {
          // Fall back to standard JSON.parse error message below
        }
      }
      return { error: `Not valid JSON: ${(e as Error).message}` };
    }
  };
  const structural = /["\\[\]{},]/g;
  const iter = chunks[Symbol.asyncIterator]();
  for (;;) {
    const next = await iter.next();
    if (next.done) break;
    const s = next.value;
    let i = 0;
    while (i < s.length && !finished) {
      if (!started) {
        const m = /\S/.exec(s.slice(i));
        if (!m) break;
        const firstChar = s[i + m.index];
        if (firstChar !== "[") {
          if (firstChar === "{" || firstChar === "/") {
            let full = s.slice(i + m.index);
            for (;;) {
              const rest = await iter.next();
              if (rest.done) break;
              full += rest.value;
              if (full.length > limits.maxFileBytes) throw new StagingError(limitMessage("file"), "FILE_TOO_BIG", 413);
            }
            let parsed: Value;
            try {
              parsed = parseLenientJson(full, true, new Notes());
            } catch {
              throw notListError();
            }
            let target: Value = parsed;
            for (let d = 0; d < 4 && isObj(target) && Object.keys(target).length === 1; d++) {
              const only = Object.values(target)[0]!;
              if (Array.isArray(only) || isObj(only)) target = only;
              else break;
            }
            if (Array.isArray(target)) {
              for (const item of target) yield { value: item };
              return;
            }
            if (isObj(target)) {
              const arrProp = Object.values(target).find((v) => Array.isArray(v)) as Value[] | undefined;
              if (arrProp) {
                for (const item of arrProp) yield { value: item };
                return;
              }
              const entries = Object.entries(target);
              if (entries.length > 0 && entries.every(([, v]) => isObj(v))) {
                for (const [k, v] of entries) yield { value: { id: k, ...(v as Obj) } };
                return;
              }
            }
          }
          throw notListError();
        }
        started = true;
        depth = 1;
        i += m.index + 1;
        continue;
      }
      if (inStr) {
        let j = i;
        for (; j < s.length; j++) {
          const c = s[j];
          if (esc2) esc2 = false;
          else if (c === "\\") esc2 = true;
          else if (c === '"') {
            inStr = false;
            j++;
            break;
          }
        }
        cur += s.slice(i, j);
        i = j;
        continue;
      }
      structural.lastIndex = i;
      const m = structural.exec(s);
      const j = m ? m.index : s.length;
      cur += s.slice(i, j);
      if (!m) {
        i = s.length;
        break;
      }
      const c = s[j]!;
      i = j + 1;
      if (c === '"') {
        inStr = true;
        cur += c;
      } else if (c === "{" || c === "[") {
        depth++;
        cur += c;
      } else if (c === "}" || (c === "]" && depth > 1)) {
        depth--;
        cur += c;
      } else if (c === "]") {
        const item = finish();
        if (item) yield item;
        finished = true;
      } else if (c === "," && depth === 1) {
        const item = finish();
        if (item) yield item;
      } else cur += c;
    }
    if (cur.length > limits.maxRecordChars) throw new StagingError(limitMessage("record"), "RECORD_TOO_BIG", 413);
  }
  if (!started) throw new StagingError("This file is empty.", "EMPTY");
  if (!finished) {
    const item = finish();
    if (item) yield item;
    throw new StagingError("The JSON list is cut off: it never closes with “]”.", "BAD_JSON");
  }
}

/** Streams the lines of a JSON Lines file. */
export async function* parseNdjson(chunks: AsyncIterable<string>): AsyncGenerator<JsonItem & { blank?: boolean }> {
  let tail = "";
  const one = (line: string): JsonItem & { blank?: boolean } => {
    const t = line.trim();
    if (!t) return { blank: true };
    try {
      return { value: JSON.parse(t) };
    } catch (e) {
      return { error: `Not valid JSON: ${(e as Error).message}` };
    }
  };
  for await (const s of chunks) {
    const parts = (tail + s).split(/\r\n|\n|\r/);
    tail = parts.pop() ?? "";
    for (const p of parts) yield one(p);
    if (tail.length > limits.maxRecordChars) throw new StagingError(limitMessage("record"), "RECORD_TOO_BIG", 413);
  }
  if (tail.trim()) yield one(tail);
}

const jsonCell = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Header names made safe to show and to use: never empty, never repeated. */
export function cleanHeaderNames(names: (string | null)[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw, i) => {
    let name = (raw ?? "").replace(/^\uFEFF/, "").replace(/[\u0000-\u001f]/g, " ").trim();
    if (!name) name = `column_${i + 1}`;
    if (name.length > 120) name = name.slice(0, 120);
    const key = name.toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    return k === 1 ? name : `${name}_${k}`;
  });
}

function encodingFor(sample: Uint8Array, forced?: EncodingName): EncodingInfo {
  const detected = detectEncoding(sample);
  if (!forced || forced === detected.encoding) return detected;
  return { encoding: forced, bomBytes: forced === "utf-8" && detected.bomBytes === 3 ? 3 : (forced === "utf-16le" && detected.bomBytes === 2 && detected.encoding === "utf-16le") || (forced === "utf-16be" && detected.encoding === "utf-16be" && detected.bomBytes === 2) ? 2 : 0, label: ENCODING_LABELS[forced] };
}

async function textOf(src: ByteSource, enc: EncodingInfo, ctx: ReadContext): Promise<AsyncGenerator<string>> {
  return decodeChunks(src.chunks(), enc, ctx.replaced);
}

const DELIMS: [string, string][] = [
  [",", "comma"],
  ["\t", "tab"],
  [";", "semicolon"],
  ["|", "pipe"],
];

export const DELIMITER_NAMES: Record<string, string> = { ",": "comma", "\t": "tab", ";": "semicolon", "|": "pipe", "": "no separator (one column)" };

async function* once(text: string): AsyncGenerator<string> {
  yield text;
}

async function sampleRecords(text: string, delimiter: string, quote: string, max: number): Promise<string[][]> {
  const ctx = newReadContext();
  const out: string[][] = [];
  for await (const r of parseDelimited(once(text), { delimiter, quote }, ctx)) {
    if (!r.blank) out.push(r.cells);
    if (out.length >= max) break;
  }
  return out;
}

export async function detectDelimited(text: string): Promise<{ delimiter: string; quote: string }> {
  const quote = /(^|[,;\t|\n])"/.test(text) ? '"' : /(^|[,;\t|\n])'[^'\n]*'([,;\t|\n]|$)/.test(text) ? "'" : '"';
  let best = { delimiter: "", score: 0 };
  for (const [d] of DELIMS) {
    let recs: string[][];
    try {
      recs = await sampleRecords(text, d, quote, 40);
    } catch {
      continue;
    }
    if (recs.length === 0) continue;
    const counts = recs.map((r) => r.length);
    const mode = [...counts].sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0]!;
    if (mode < 2) continue;
    const share = counts.filter((c) => c === mode).length / counts.length;
    const score = share * 10 + Math.min(mode, 20) / 20 + (recs.length >= 2 ? 0.5 : 0);
    if (share >= 0.5 && score > best.score) best = { delimiter: d, score };
  }
  return { delimiter: best.delimiter, quote };
}

const looksTyped = (v: string) => parseNumber(v, "auto") !== null || parseDate(v) !== null || parseBoolean(v) === "true" || parseBoolean(v) === "false";

/** Does the first record look like column names rather than data? */
export function looksLikeHeader(first: string[], rest: string[][]): boolean {
  if (!first.length) return false;
  if (first.some((c) => c.trim() === "")) return first.filter((c) => c.trim() !== "").length >= first.length - 1 && first.every((c) => !looksTyped(c)) && first.filter((c) => c.trim()).length > 0;
  const lower = first.map((c) => c.trim().toLowerCase());
  if (new Set(lower).size !== lower.length) return false;
  if (first.some((c) => looksTyped(c) || c.length > 80)) return false;
  if (!rest.length) return true;
  return true;
}

export interface SourceColumn {
  name: string;
  index: number;
  inferred: InferredColumn;
  /** A few distinct non-empty values for the screen. */
  samples: string[];
}

export interface Analysis {
  fileName: string;
  size: number;
  settings: SourceSettings;
  detected: { encoding: string; delimiter: string; quote: string; newline: "\r\n" | "\n" | "\r" | "mixed" | "none"; format: SourceFormat };
  encodingLabel: string;
  columns: SourceColumn[];
  /** Preview rows, aligned with `columns`. */
  rows: { n: number; cells: (string | null)[]; problem?: string }[];
  sampledRows: number;
  warnings: string[];
  /** Plain words about what was detected. */
  summary: string;
  /** Available worksheet or table names when a file has multiple sheets/tables. */
  sheets?: string[];
}

function detectNewline(text: string): Analysis["detected"]["newline"] {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  if (kinds === 0) return "none";
  if (kinds > 1) return "mixed";
  return crlf ? "\r\n" : lf ? "\n" : "\r";
}

function isZipHeader(bytes?: Uint8Array): boolean {
  return Boolean(bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
}

function detectFormat(head: string, fileName: string, sampleBytes?: Uint8Array): SourceFormat {
  const lower = fileName.toLowerCase();
  const ext = lower.includes(".") ? (lower.split(".").pop() ?? "") : "";
  if (isZipHeader(sampleBytes)) return ext === "ods" ? "ods" : "xlsx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "ods") return "ods";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "toml") return "toml";
  if (ext === "plist") return "plist";
  if (ext === "xml") return "xml";
  if (ext === "sql") return "sql";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "ini" || ext === "cfg" || ext === "conf") return "ini";
  if (ext === "env" || lower === ".env" || lower.startsWith(".env.")) return "env";
  if (ext === "properties") return "properties";
  if (ext === "ndjson" || ext === "jsonl") return "ndjson";
  if (ext === "jsonc" || ext === "json5") return "json";

  const t = head.trimStart();
  if (/^\[[A-Za-z0-9_.\- ]+\]\s*\r?\n\s*[A-Za-z0-9_.\-]+\s*=/.test(t)) return "ini";
  if (/^\[\[[A-Za-z0-9_.\-"]+\]\]/.test(t)) return "toml";
  if (t.startsWith("[")) return "json";
  if (t.startsWith("{")) {
    const firstLine = t.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.endsWith("}") && ext === "json") return "json";
    return "ndjson";
  }
  if (ext === "json") return "json";
  if (/^\s*<!DOCTYPE\s+plist\b/i.test(t) || /<plist[\s>]/i.test(t.slice(0, 512))) return "plist";
  if (/<table[\s>]/i.test(t) && /<tr[\s>]/i.test(t)) return "html";
  if (/^\s*<\?xml\b/i.test(t) || (/^\s*<[A-Za-z_][\w:.-]*[\s>]/.test(t) && !/^\s*<!DOCTYPE\s+html\b/i.test(t))) return "xml";
  if (/^\s*(?:(?:--|#).*\r?\n\s*)*(?:INSERT\s+(?:IGNORE\s+|OR\s+\w+\s+)?INTO|CREATE\s+TABLE|COPY\s+\S+)\b/im.test(t)) return "sql";
  if (/^\s*\|.+\|\s*\r?\n\s*\|[\s:|-]+\|/m.test(t)) return "markdown";
  if (/^\s*---\s*\r?\n/.test(t)) return "yaml";
  return "csv";
}

async function readAllBytes(src: ByteSource): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of src.chunks()) {
    total += chunk.byteLength;
    if (total > limits.maxFileBytes) throw new StagingError(limitMessage("file"), "FILE_TOO_BIG", 413);
    parts.push(chunk);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.byteLength;
  }
  return out;
}

async function readAllText(src: ByteSource, enc: EncodingInfo, ctx: ReadContext): Promise<string> {
  let out = "";
  for await (const chunk of await textOf(src, enc, ctx)) {
    out += chunk;
    if (out.length > limits.maxFileBytes) throw new StagingError(limitMessage("file"), "FILE_TOO_BIG", 413);
  }
  return out;
}

function extractCreateTableColumns(sql: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi;
  for (const m of sql.matchAll(re)) {
    const rawTable = m[1]!.replace(/[`"[\]]/g, "").split(".").pop()!.toLowerCase();
    const body = m[2]!;
    const cols: string[] = [];
    let depth = 0;
    let cur = "";
    const parts: string[] = [];
    for (const ch of body) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    for (const p of parts) {
      const trimmed = p.trim();
      if (!trimmed || /^(?:PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY)\b/i.test(trimmed)) continue;
      const cm = /^(?:`([^`]+)`|"([^"]+)"|\[([^\]]+)\]|([A-Za-z_][\w$]*))\s+/i.exec(trimmed);
      const colName = cm?.[1] ?? cm?.[2] ?? cm?.[3] ?? cm?.[4];
      if (colName) cols.push(colName);
    }
    if (cols.length) map.set(rawTable, cols);
  }
  return map;
}

function parseSqlWithCopy(source: string, notes: Notes): Value {
  const createCols = extractCreateTableColumns(source);
  const copyTables = new Map<string, Obj[]>();
  const copyRe = /COPY\s+([^\s(]+)\s*(?:\(([^)]+)\))?\s+FROM\s+stdin\s*;\r?\n([\s\S]*?)\r?\n\\\.(?:\r?\n|$)/gi;
  for (const m of source.matchAll(copyRe)) {
    const tableName = m[1]!.replace(/[`"[\]]/g, "").split(".").pop()!;
    const declaredCols = m[2]
      ? m[2].split(",").map((c) => c.trim().replace(/^["`[]|["`\]]$/g, ""))
      : createCols.get(tableName.toLowerCase()) ?? null;
    const lines = m[3]!.split(/\r?\n/).filter((l) => l.length > 0);
    const list = copyTables.get(tableName) ?? [];
    for (const line of lines) {
      const fields = line.split("\t").map((f) =>
        f === "\\N"
          ? null
          : f.replace(/\\([trn\\])/g, (_s, ch) => (ch === "t" ? "\t" : ch === "r" ? "\r" : ch === "n" ? "\n" : "\\")),
      );
      const cols = declaredCols ?? fields.map((_, i) => `column_${i + 1}`);
      const rec = newObj();
      cols.forEach((c, i) => setKey(rec, c, fields[i] ?? null));
      list.push(rec);
    }
    if (list.length) copyTables.set(tableName, list);
  }

  let parsed: Value | null = null;
  try {
    parsed = parseSql(source, false, notes);
  } catch (err) {
    if (!copyTables.size) throw err;
  }

  const applyCreateCols = (tableName: string, rows: Obj[]): Obj[] => {
    if (!rows.length) return rows;
    const firstKeys = Object.keys(rows[0]!);
    if (!firstKeys.every((k, i) => k === `column${i + 1}`)) return rows;
    const ddlCols = createCols.get(tableName.replace(/[`"[\]]/g, "").split(".").pop()!.toLowerCase());
    if (!ddlCols || ddlCols.length !== firstKeys.length) return rows;
    return rows.map((r) => {
      const next = newObj();
      ddlCols.forEach((col, i) => setKey(next, col, r[`column${i + 1}`] ?? null));
      return next;
    });
  };

  if (parsed && Array.isArray(parsed)) {
    let singleTableName = "";
    const insMatch = /insert\s+(?:ignore\s+)?(?:or\s+\w+\s+)?into\s+([^\s(]+)/i.exec(source);
    if (insMatch) singleTableName = insMatch[1]!;
    const updated = singleTableName ? applyCreateCols(singleTableName, parsed as Obj[]) : (parsed as Obj[]);
    if (!copyTables.size) return updated;
    const combined = newObj();
    setKey(combined, singleTableName || "insert_rows", updated);
    for (const [k, v] of copyTables) setKey(combined, k, [...((combined[k] as Obj[] | undefined) ?? []), ...v]);
    return Object.keys(combined).length === 1 ? (Object.values(combined)[0] as Value) : combined;
  }
  if (parsed && isObj(parsed)) {
    const combined = newObj();
    for (const [k, v] of Object.entries(parsed)) {
      setKey(combined, k, Array.isArray(v) ? applyCreateCols(k, v as Obj[]) : v);
    }
    for (const [k, v] of copyTables) setKey(combined, k, [...((combined[k] as Obj[] | undefined) ?? []), ...v]);
    return combined;
  }
  if (copyTables.size === 1) return [...copyTables.values()][0]!;
  const out = newObj();
  for (const [k, v] of copyTables) setKey(out, k, v);
  return out;
}

const STRUCTURED_FORMATS = new Set<SourceFormat>([
  "xlsx",
  "ods",
  "yaml",
  "toml",
  "xml",
  "sql",
  "markdown",
  "html",
  "ini",
  "env",
  "properties",
  "plist",
]);

export const FORMAT_DESCRIPTIONS: Record<SourceFormat, string> = {
  csv: "delimited text",
  json: "a JSON list",
  ndjson: "JSON Lines (one record per line)",
  xlsx: "an Excel (.xlsx) spreadsheet",
  ods: "an OpenDocument (.ods) spreadsheet",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  sql: "SQL statements",
  markdown: "a Markdown table",
  html: "an HTML table",
  ini: "an INI file",
  env: "a .env file",
  properties: "a .properties file",
  plist: "an Apple Property List (.plist)",
};

async function parseStructuredSource(
  src: ByteSource,
  format: SourceFormat,
  enc: EncodingInfo,
  ctx: ReadContext,
  hasHeaderOverride: boolean | undefined,
  selectedSheet?: string,
): Promise<{ columns: string[]; rows: (string | null)[][]; hasHeader: boolean; sheets?: string[]; activeSheet?: string }> {
  if (format === "xlsx" || format === "ods") {
    let allSheets: Sheet[];
    try {
      allSheets = src.path ? await readSpreadsheet(src.path) : await readSpreadsheetBuffer(await readAllBytes(src), src.name);
    } catch (err: any) {
      throw new StagingError(
        `This Excel (.xlsx) or spreadsheet file can't be read here (${err?.message ?? "damaged archive"}). In Excel choose File → Save As → “CSV UTF-8” and load that file instead.`,
        "EXCEL_UNSUPPORTED",
      );
    }
    const sheetNames = allSheets.map((s) => s.name);
    const chosen = (selectedSheet ? allSheets.find((s) => s.name === selectedSheet) : undefined) ?? allSheets.find((s) => s.rows.length > 0) ?? allSheets[0];
    if (!chosen || chosen.rows.length === 0) throw new StagingError("This spreadsheet has no rows.", "EMPTY");
    const nonBlank = chosen.rows.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
    if (!nonBlank.length) throw new StagingError("This spreadsheet has no rows.", "EMPTY");
    const strRows = nonBlank.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
    const hasHeader = hasHeaderOverride ?? looksLikeHeader(strRows[0]!, strRows.slice(1));
    const width = hasHeader ? strRows[0]!.length : Math.max(...strRows.slice(0, 200).map((r) => r.length));
    if (width > limits.maxColumns) throw new StagingError(limitMessage("columns"), "TOO_MANY_COLUMNS");
    const columns = hasHeader
      ? cleanHeaderNames(strRows[0]!.concat(Array(Math.max(0, width - strRows[0]!.length)).fill("")))
      : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
    const data = (hasHeader ? strRows.slice(1) : strRows).map((r) => columns.map((_, i) => (r[i] === undefined || r[i] === "" ? null : r[i]!)));
    return {
      columns,
      rows: data,
      hasHeader,
      ...(sheetNames.length > 1 ? { sheets: sheetNames, activeSheet: chosen.name } : {}),
    };
  }

  const fullText = await readAllText(src, enc, ctx);
  if (!fullText.trim()) throw new StagingError("This file is empty.", "EMPTY");
  const notes = new Notes();
  let val: Value;
  try {
    switch (format) {
      case "yaml":
        val = parseYaml(fullText);
        break;
      case "toml":
        val = parseToml(fullText);
        break;
      case "xml":
        val = parseXml(fullText);
        break;
      case "plist":
        val = parsePlist(fullText, notes);
        break;
      case "sql":
        val = parseSqlWithCopy(fullText, notes);
        break;
      case "markdown":
        val = parseMarkdownTable(fullText, false, notes);
        break;
      case "html":
        val = parseHtmlTable(fullText, hasHeaderOverride ?? true, false, notes);
        break;
      case "ini":
        val = parseIni(fullText, false, notes);
        break;
      case "env":
        val = parseEnv(fullText, false);
        break;
      case "properties":
        val = parseProperties(fullText, false);
        break;
      default:
        val = parseLenientJson(fullText, true, notes);
        break;
    }
  } catch (err: any) {
    if (err instanceof StagingError) throw err;
    throw new StagingError(err instanceof ConvError ? err.message : `Could not read ${FORMAT_DESCRIPTIONS[format] ?? format}: ${err?.message ?? err}`, "BAD_FORMAT");
  }
  for (const w of notes.list) ctx.warnings.add(w);

  let cur: Value = val;
  for (let d = 0; d < 4 && isObj(cur) && Object.keys(cur).length === 1; d++) {
    const only = Object.values(cur)[0]!;
    if (Array.isArray(only) || (isObj(only) && Object.values(only).some((v) => Array.isArray(v) || isObj(v)))) cur = only;
    else break;
  }

  let sheets: string[] | undefined;
  let activeSheet: string | undefined;
  if (isObj(cur)) {
    const arrayKeys = Object.keys(cur).filter((k) => Array.isArray((cur as Obj)[k]) && ((cur as Obj)[k] as Value[]).length > 0);
    if (arrayKeys.length > 1) {
      sheets = arrayKeys;
      activeSheet = selectedSheet && arrayKeys.includes(selectedSheet) ? selectedSheet : arrayKeys[0]!;
      cur = (cur as Obj)[activeSheet]!;
    } else if (arrayKeys.length === 1) {
      const candidate = (cur as Obj)[arrayKeys[0]!] as Value[];
      if (candidate.every((x) => isObj(x) || Array.isArray(x))) {
        cur = candidate;
      }
    } else {
      const entries = Object.entries(cur);
      if (entries.length > 0 && entries.every(([, v]) => isObj(v))) {
        const keyField = format === "ini" || format === "toml" ? "section" : "id";
        cur = entries.map(([k, v]) => {
          const rec = newObj();
          if (!(keyField in (v as Obj))) setKey(rec, keyField, k);
          for (const [ik, iv] of Object.entries(v as Obj)) setKey(rec, ik, iv);
          return rec;
        });
      } else if (
        (format === "env" || format === "properties" || format === "ini") &&
        entries.length > 0 &&
        entries.every(([, v]) => !isObj(v) && !Array.isArray(v))
      ) {
        cur = entries.map(([k, v]) => {
          const rec = newObj();
          setKey(rec, "key", k);
          setKey(rec, "value", v);
          return rec;
        });
      }
    }
  }

  if (Array.isArray(cur) && cur.length > 0 && cur.every((r) => Array.isArray(r))) {
    const strRows = (cur as Value[][]).map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
    const hasHeader = hasHeaderOverride ?? looksLikeHeader(strRows[0]!, strRows.slice(1));
    const width = hasHeader ? strRows[0]!.length : Math.max(...strRows.slice(0, 200).map((r) => r.length));
    if (width > limits.maxColumns) throw new StagingError(limitMessage("columns"), "TOO_MANY_COLUMNS");
    const columns = hasHeader
      ? cleanHeaderNames(strRows[0]!.concat(Array(Math.max(0, width - strRows[0]!.length)).fill("")))
      : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
    const data = (hasHeader ? strRows.slice(1) : strRows).map((r) => columns.map((_, i) => (r[i] === undefined || r[i] === "" ? null : r[i]!)));
    return { columns, rows: data, hasHeader, ...(sheets ? { sheets, activeSheet } : {}) };
  }

  let table: { columns: string[]; rows: Value[][] };
  try {
    table = toTable(cur, { flatten: true, notes });
  } catch (err: any) {
    throw new StagingError(err?.message ?? "This file has no tabular records.", "EMPTY");
  }
  for (const w of notes.list) ctx.warnings.add(w);
  if (!table.columns.length || !table.rows.length) throw new StagingError("This file has no records.", "EMPTY");
  if (table.columns.length > limits.maxColumns) throw new StagingError(limitMessage("columns"), "TOO_MANY_COLUMNS");
  const columns = cleanHeaderNames(table.columns);
  const rows = table.rows.map((r) => columns.map((_, i) => jsonCell(r[i])));
  return { columns, rows, hasHeader: true, ...(sheets ? { sheets, activeSheet } : {}) };
}

const SAMPLE_ROWS = 2000;
const PREVIEW_ROWS = 20;
const SAMPLE_BYTES = 256 * 1024;

/** Looks at the start of a source and works out how to read it. `overrides` (from the person) win over the detection. */
export async function analyzeSource(src: ByteSource, overrides: Partial<SourceSettings> = {}, previewRows = PREVIEW_ROWS): Promise<Analysis> {
  const sampleBytes = await src.sample(SAMPLE_BYTES);
  if (sampleBytes.length === 0) throw new StagingError("This file is empty.", "EMPTY");
  if (sampleBytes.length >= 8 && sampleBytes[0] === 0xd0 && sampleBytes[1] === 0xcf && sampleBytes[2] === 0x11 && sampleBytes[3] === 0xe0) {
    throw new StagingError(
      "This looks like an old Excel (.xls) file. Excel files can't be read here. In Excel choose File → Save As → “CSV UTF-8” and load that file instead.",
      "EXCEL_UNSUPPORTED",
    );
  }
  const enc = isZipHeader(sampleBytes)
    ? { encoding: "utf-8" as EncodingName, bomBytes: 0, label: ENCODING_LABELS["utf-8"] }
    : encodingFor(sampleBytes, overrides.encoding);
  const ctx = newReadContext();
  const headText = isZipHeader(sampleBytes)
    ? ""
    : new TextDecoder(enc.encoding as any, { fatal: false, ignoreBOM: true }).decode(sampleBytes.subarray(enc.bomBytes)).replace(/^\uFEFF/, "");
  const detectedFormat = detectFormat(headText, src.name, sampleBytes);
  const format = overrides.format ?? detectedFormat;
  let delimiter = overrides.delimiter ?? "";
  let quote = overrides.quote ?? '"';
  let detectedDelim = "";
  let detectedQuote = '"';
  if (format === "csv") {
    // Do not judge the delimiter on a half record at the end of the sample.
    const lastBreak = headText.lastIndexOf("\n");
    const cut = src.size <= SAMPLE_BYTES || lastBreak < 0 ? headText : headText.slice(0, lastBreak + 1);
    const d = await detectDelimited(cut);
    detectedDelim = d.delimiter;
    detectedQuote = d.quote;
    if (overrides.delimiter === undefined) delimiter = d.delimiter;
    if (overrides.quote === undefined) quote = d.quote;
  }
  const warnings: string[] = [];
  let hasHeader = overrides.hasHeader ?? true;
  const rawRows: { n: number; cells: (string | null)[]; problem?: string }[] = [];
  let columns: string[] = [];
  const rowsForInfer: (string | null)[][] = [];
  let sheets: string[] | undefined;
  let activeSheet: string | undefined;

  if (STRUCTURED_FORMATS.has(format)) {
    const parsed = await parseStructuredSource(src, format, enc, ctx, overrides.hasHeader, overrides.sheet);
    columns = parsed.columns;
    hasHeader = parsed.hasHeader;
    sheets = parsed.sheets;
    activeSheet = parsed.activeSheet ?? overrides.sheet;
    parsed.rows.slice(0, SAMPLE_ROWS).forEach((cells, idx) => {
      const n = idx + (hasHeader ? 2 : 1);
      rawRows.push({ n, cells });
      rowsForInfer.push(cells);
    });
  } else if (format === "csv") {
    const records: string[][] = [];
    for await (const r of parseDelimited(await textOf(src, enc, ctx), { delimiter, quote }, ctx)) {
      if (r.blank) continue;
      records.push(r.cells);
      if (records.length >= SAMPLE_ROWS + 1) break;
    }
    if (!records.length) throw new StagingError("This file has no rows.", "EMPTY");
    if (overrides.hasHeader === undefined) hasHeader = looksLikeHeader(records[0]!, records.slice(1));
    const width = hasHeader ? records[0]!.length : Math.max(...records.slice(0, 200).map((r) => r.length));
    if (width > limits.maxColumns) throw new StagingError(limitMessage("columns"), "TOO_MANY_COLUMNS");
    columns = hasHeader ? cleanHeaderNames(records[0]!.concat(Array(Math.max(0, width - records[0]!.length)).fill(""))) : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
    const data = hasHeader ? records.slice(1) : records;
    data.forEach((cells, idx) => {
      const n = idx + (hasHeader ? 2 : 1);
      const problem = cells.length !== columns.length ? `Row has ${cells.length} field${cells.length === 1 ? "" : "s"} but there are ${columns.length} columns.` : undefined;
      const fixed = columns.map((_, i) => cells[i] ?? null);
      rawRows.push({ n, cells: fixed, ...(problem ? { problem } : {}) });
      rowsForInfer.push(fixed);
    });
  } else {
    const items = format === "json" ? parseJsonArray(await textOf(src, enc, ctx)) : parseNdjson(await textOf(src, enc, ctx));
    const keyOrder: string[] = [];
    const seen = new Set<string>();
    const objs: { n: number; value?: unknown; error?: string }[] = [];
    let n = 0;
    try {
      for await (const it of items) {
        if ("blank" in it && it.blank) continue;
        n++;
        objs.push({ n, ...it });
        if (it.value && typeof it.value === "object" && !Array.isArray(it.value)) for (const k of Object.keys(it.value)) if (!seen.has(k)) (seen.add(k), keyOrder.push(k));
        if (n >= SAMPLE_ROWS) break;
      }
    } catch (e) {
      if (!(e instanceof StagingError) || n === 0) throw e;
    }
    if (!objs.length) throw new StagingError("This file has no records.", "EMPTY");
    const arrays = objs.some((o) => Array.isArray(o.value));
    if (arrays && keyOrder.length === 0) {
      const width = Math.max(...objs.map((o) => (Array.isArray(o.value) ? o.value.length : 0)));
      const first = objs[0]!.value as unknown[];
      const headerish = overrides.hasHeader ?? looksLikeHeader(first.map((c) => String(c ?? "")), []);
      hasHeader = headerish;
      columns = headerish ? cleanHeaderNames(first.map((c) => (c === null ? null : String(c)))) : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
      for (const o of objs.slice(headerish ? 1 : 0)) {
        const cells = columns.map((_, i) => (Array.isArray(o.value) ? jsonCell(o.value[i]) : null));
        rawRows.push({ n: o.n + (headerish ? 0 : 0), cells, ...(o.error ? { problem: o.error } : {}) });
        rowsForInfer.push(cells);
      }
    } else {
      hasHeader = true;
      if (keyOrder.length > limits.maxColumns) throw new StagingError(limitMessage("columns"), "TOO_MANY_COLUMNS");
      columns = cleanHeaderNames(keyOrder);
      for (const o of objs) {
        if (o.error || !o.value || typeof o.value !== "object" || Array.isArray(o.value)) {
          rawRows.push({ n: o.n, cells: columns.map(() => null), problem: o.error ?? "This record is not an object with named fields." });
          continue;
        }
        const obj = o.value as Record<string, unknown>;
        const cells = keyOrder.map((k) => jsonCell(obj[k]));
        rawRows.push({ n: o.n, cells });
        rowsForInfer.push(cells);
      }
    }
  }

  const sourceColumns: SourceColumn[] = columns.map((name, index) => {
    const col = rowsForInfer.map((r) => r[index] ?? null);
    const samples: string[] = [];
    for (const v of col) if (v !== null && v !== "" && !samples.includes(v) && samples.length < 5) samples.push(v.length > 80 ? v.slice(0, 80) + "…" : v);
    return { name, index, inferred: inferColumn(col), samples };
  });
  if (ctx.replaced.replaced > 0) warnings.push(`${ctx.replaced.replaced} character${ctx.replaced.replaced === 1 ? "" : "s"} could not be read with ${enc.label} and show as “\ufffd”. Try another encoding.`);
  for (const w of ctx.warnings) warnings.push(w);
  const ragged = rawRows.filter((r) => r.problem).length;
  if (ragged) warnings.push(`${ragged} of the first ${rawRows.length} rows ${ragged === 1 ? "is" : "are"} damaged (wrong number of fields or not valid JSON). ${ragged === 1 ? "It" : "They"} will be marked as ${ragged === 1 ? "a problem" : "problems"} in the staging table.`);
  const newline = detectNewline(headText);
  const settings: SourceSettings = {
    format,
    delimiter: format === "csv" ? delimiter : "",
    quote: format === "csv" ? quote : "",
    hasHeader,
    encoding: enc.encoding,
    ...(activeSheet ? { sheet: activeSheet } : {}),
  };
  const where = format === "csv" ? `${DELIMITER_NAMES[delimiter] ?? "custom"}-separated text` : FORMAT_DESCRIPTIONS[format] ?? format;
  return {
    fileName: src.name,
    size: src.size,
    settings,
    detected: { encoding: enc.encoding, delimiter: detectedDelim, quote: detectedQuote, newline, format: detectedFormat },
    encodingLabel: enc.label,
    columns: sourceColumns,
    rows: rawRows.slice(0, previewRows),
    sampledRows: rawRows.length,
    warnings,
    summary: `Read as ${where}${activeSheet ? ` (${activeSheet})` : ""}, ${enc.label}${format === "csv" || format === "xlsx" || format === "ods" ? (hasHeader ? ", first row = column names" : ", no header row") : ""}. ${columns.length} column${columns.length === 1 ? "" : "s"}.`,
    ...(sheets ? { sheets } : {}),
  };
}

/**
 * Streams the data rows of a source. For JSON the caller passes the column list that analysis found; fields that are
 * not in it are returned in `extra`. `onWarn` collects notes about the whole file.
 */
export async function* readRows(src: ByteSource, settings: SourceSettings, columns: string[], ctx: ReadContext = newReadContext()): AsyncGenerator<SourceRow> {
  const sample = await src.sample(16);
  const enc = isZipHeader(sample)
    ? { encoding: "utf-8" as EncodingName, bomBytes: 0, label: ENCODING_LABELS["utf-8"] }
    : encodingFor(sample, settings.encoding);
  const forced: EncodingInfo = { ...enc, encoding: settings.encoding, label: ENCODING_LABELS[settings.encoding] };
  if (STRUCTURED_FORMATS.has(settings.format)) {
    const parsed = await parseStructuredSource(src, settings.format, forced, ctx, settings.hasHeader, settings.sheet);
    for (let idx = 0; idx < parsed.rows.length; idx++) {
      const r = parsed.rows[idx]!;
      const n = idx + (parsed.hasHeader ? 2 : 1);
      const cells = columns.map((_, i) => r[i] ?? null);
      yield { n, cells };
    }
    return;
  }
  const text = decodeChunks(src.chunks(), forced, ctx.replaced);
  if (settings.format === "csv") {
    let n = 0;
    let first = true;
    for await (const r of parseDelimited(text, { delimiter: settings.delimiter, quote: settings.quote }, ctx)) {
      n++;
      if (r.blank) continue;
      if (first) {
        first = false;
        if (settings.hasHeader) continue;
      }
      const cells = columns.map((_, i) => r.cells[i] ?? null);
      if (r.cells.length !== columns.length) {
        yield { n, cells, problem: `Row has ${r.cells.length} field${r.cells.length === 1 ? "" : "s"} but there are ${columns.length} columns.`, rawCells: r.cells };
      } else yield { n, cells };
    }
    return;
  }
  const keyOrder = columns;
  const items = settings.format === "json" ? parseJsonArray(text) : parseNdjson(text);
  let n = 0;
  let skippedHeader = false;
  for await (const it of items) {
    if ("blank" in it && it.blank) continue;
    n++;
    if (it.error) {
      yield { n, cells: columns.map(() => null), problem: it.error };
      continue;
    }
    const v = it.value;
    if (Array.isArray(v)) {
      if (settings.hasHeader && !skippedHeader) {
        skippedHeader = true;
        continue;
      }
      yield { n, cells: columns.map((_, i) => jsonCell(v[i])), ...(v.length !== columns.length ? { problem: `Row has ${v.length} field${v.length === 1 ? "" : "s"} but there are ${columns.length} columns.`, rawCells: v.map(jsonCell) } : {}) };
    } else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const known = new Set(keyOrder.map((c) => c));
      const originalKeys = Object.keys(obj);
      const byName = new Map(originalKeys.map((k) => [k, k] as const));
      const cells = columns.map((c) => (byName.has(c) ? jsonCell(obj[c]) : null));
      const extra: Record<string, string | null> = {};
      for (const k of originalKeys) if (!known.has(k)) extra[k] = jsonCell(obj[k]);
      yield { n, cells, ...(Object.keys(extra).length ? { extra } : {}) };
    } else {
      yield { n, cells: columns.map(() => null), problem: "This record is not an object with named fields." };
    }
  }
}

export { isEncodingName };
