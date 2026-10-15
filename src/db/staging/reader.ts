/**
 * Streaming readers for the formats the import understands: delimited text (comma, tab, semicolon, pipe, ...),
 * a JSON array of objects (or arrays) and JSON Lines / NDJSON. Memory stays bounded by one chunk plus one record,
 * so a 500 MB file is never held at once.
 */
import { StagingError, limitMessage, limits } from "./limits";
import { decodeChunks, detectEncoding, ENCODING_LABELS, isEncodingName, type ByteSource, type EncodingInfo, type EncodingName } from "./source";
import { inferColumn, parseBoolean, parseDate, parseNumber, type InferredColumn } from "./values";

export type SourceFormat = "csv" | "json" | "ndjson";

export interface SourceSettings {
  format: SourceFormat;
  /** One character; "" for a file with a single column. Ignored for JSON. */
  delimiter: string;
  /** `"`, `'` or "" (no quoting). */
  quote: string;
  hasHeader: boolean;
  encoding: EncodingName;
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

/** Streams the elements of a top-level JSON array. */
export async function* parseJsonArray(chunks: AsyncIterable<string>): AsyncGenerator<JsonItem> {
  let started = false;
  let finished = false;
  let depth = 0;
  let inStr = false;
  let esc2 = false;
  let cur = "";
  const finish = (): JsonItem | null => {
    const t = cur.trim();
    cur = "";
    if (!t) return null;
    try {
      return { value: JSON.parse(t) };
    } catch (e) {
      return { error: `Not valid JSON: ${(e as Error).message}` };
    }
  };
  const structural = /["\\[\]{},]/g;
  for await (const s of chunks) {
    let i = 0;
    while (i < s.length && !finished) {
      if (!started) {
        const m = /\S/.exec(s.slice(i));
        if (!m) break;
        if (s[i + m.index] !== "[") throw new StagingError("This JSON file is not a list. A JSON file for import must be a list of records, for example [{\"name\": \"Ann\"}, ...]. If every record is on its own line, choose “JSON Lines”.", "BAD_JSON");
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

function detectFormat(head: string, fileName: string): SourceFormat {
  const t = head.trimStart();
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (t.startsWith("[")) return "json";
  if (t.startsWith("{")) return "ndjson";
  if (ext === "ndjson" || ext === "jsonl") return "ndjson";
  if (ext === "json") return "json";
  return "csv";
}

const SAMPLE_ROWS = 2000;
const PREVIEW_ROWS = 20;
const SAMPLE_BYTES = 256 * 1024;

/** Looks at the start of a source and works out how to read it. `overrides` (from the person) win over the detection. */
export async function analyzeSource(src: ByteSource, overrides: Partial<SourceSettings> = {}, previewRows = PREVIEW_ROWS): Promise<Analysis> {
  const sampleBytes = await src.sample(SAMPLE_BYTES);
  if (sampleBytes.length === 0) throw new StagingError("This file is empty.", "EMPTY");
  const sniff = (head: Uint8Array) => {
    if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
      throw new StagingError("This looks like an Excel (.xlsx) or other zipped file. Excel files can't be read here. In Excel choose File → Save As → “CSV UTF-8” and load that file instead.", "EXCEL_UNSUPPORTED");
    }
    if (head.length >= 8 && head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
      throw new StagingError("This looks like an old Excel (.xls) file. Excel files can't be read here. In Excel choose File → Save As → “CSV UTF-8” and load that file instead.", "EXCEL_UNSUPPORTED");
    }
  };
  sniff(sampleBytes);
  const enc = encodingFor(sampleBytes, overrides.encoding);
  const ctx = newReadContext();
  const headText = new TextDecoder(enc.encoding as any, { fatal: false, ignoreBOM: true }).decode(sampleBytes.subarray(enc.bomBytes)).replace(/^\uFEFF/, "");
  const detectedFormat = detectFormat(headText, src.name);
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

  if (format === "csv") {
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
  if (ctx.replaced.replaced > 0) warnings.push(`${ctx.replaced.replaced} character${ctx.replaced.replaced === 1 ? "" : "s"} could not be read with ${enc.label} and show as “�”. Try another encoding.`);
  for (const w of ctx.warnings) warnings.push(w);
  const ragged = rawRows.filter((r) => r.problem).length;
  if (ragged) warnings.push(`${ragged} of the first ${rawRows.length} rows ${ragged === 1 ? "is" : "are"} damaged (wrong number of fields or not valid JSON). ${ragged === 1 ? "It" : "They"} will be marked as ${ragged === 1 ? "a problem" : "problems"} in the staging table.`);
  const newline = detectNewline(headText);
  const settings: SourceSettings = { format, delimiter: format === "csv" ? delimiter : "", quote: format === "csv" ? quote : "", hasHeader, encoding: enc.encoding };
  const where = format === "csv" ? `${DELIMITER_NAMES[delimiter] ?? "custom"}-separated text` : format === "json" ? "a JSON list" : "JSON Lines (one record per line)";
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
    summary: `Read as ${where}, ${enc.label}${format === "csv" ? (hasHeader ? ", first row = column names" : ", no header row") : ""}. ${columns.length} column${columns.length === 1 ? "" : "s"}.`,
  };
}

/**
 * Streams the data rows of a source. For JSON the caller passes the column list that analysis found; fields that are
 * not in it are returned in `extra`. `onWarn` collects notes about the whole file.
 */
export async function* readRows(src: ByteSource, settings: SourceSettings, columns: string[], ctx: ReadContext = newReadContext()): AsyncGenerator<SourceRow> {
  const enc = encodingFor(await src.sample(16), settings.encoding);
  const forced: EncodingInfo = { ...enc, encoding: settings.encoding, label: ENCODING_LABELS[settings.encoding] };
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
