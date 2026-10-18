/**
 * Universal multi-format tabular & key-value import parser for all database studios
 * (SQLite, MySQL, PostgreSQL, and Redis).
 *
 * Supports:
 * - Delimited text: CSV, TSV, PSV, semicolon-separated, whitespace/custom-delimited
 * - JSON family: JSON array of objects/arrays, wrapper objects, keyed maps, single object, JSONC, JSON5, NDJSON / JSONL
 * - Spreadsheets: Excel (.xlsx) and OpenDocument (.ods), including multi-sheet selection
 * - Data serialization: YAML (.yaml, .yml), TOML (.toml), XML (.xml), Apple Property Lists (.plist)
 * - Database dumps: SQL (.sql) INSERT INTO ... VALUES and PostgreSQL COPY ... FROM stdin
 * - Markup tables: Markdown tables (.md, .markdown), HTML tables (.html, .htm)
 * - Config / key-value files: INI (.ini, .cfg, .conf), .env, Java .properties
 */
import { Notes, isObj, type Obj, type Value } from "../features/filemanager/fmConvCommon";
import { parseJson as parseLenientJson } from "../features/filemanager/fmConvData";
import { analyzeSource, cleanHeaderNames, isSourceFormat, newReadContext, readRows, type SourceFormat, type SourceSettings } from "./staging/reader";
import { fileSource, memorySource, type ByteSource } from "./staging/source";

export interface UniversalParseOptions {
  content?: string;
  bytes?: Uint8Array;
  base64?: string;
  filePath?: string;
  filename?: string;
  fileName?: string;
  format?: string;
  delimiter?: string;
  hasHeader?: boolean;
  sheet?: string;
}

export interface UniversalParsedTable {
  format: SourceFormat;
  columns: string[];
  rows: (string | null)[][];
  records: Record<string, any>[];
  sheets?: string[];
  activeSheet?: string;
  selectedSheet?: string;
  warnings: string[];
}

export function binarySource(bytes: Uint8Array, name = "upload"): ByteSource {
  return {
    name,
    size: bytes.byteLength,
    async sample(n = 65536) {
      return bytes.subarray(0, n);
    },
    async *chunks() {
      for (let i = 0; i < bytes.byteLength; i += 1 << 16) {
        yield bytes.subarray(i, i + (1 << 16));
      }
    },
  };
}

function normalizeFormatOverride(fmt?: string): Partial<SourceSettings> {
  if (!fmt || fmt === "auto") return {};
  const lower = fmt.toLowerCase().trim();
  if (lower === "tsv" || lower === "tab") return { format: "csv", delimiter: "\t" };
  if (lower === "psv" || lower === "pipe") return { format: "csv", delimiter: "|" };
  if (lower === "ssv" || lower === "semicolon") return { format: "csv", delimiter: ";" };
  if (lower === "jsonl" || lower === "ndjson") return { format: "ndjson" };
  if (lower === "jsonc" || lower === "json5" || lower === "json") return { format: "json" };
  if (lower === "yml" || lower === "yaml") return { format: "yaml" };
  if (lower === "md" || lower === "markdown") return { format: "markdown" };
  if (lower === "htm" || lower === "html") return { format: "html" };
  if (lower === "cfg" || lower === "conf" || lower === "ini") return { format: "ini" };
  if (isSourceFormat(lower)) return { format: lower };
  return {};
}

function coerceCellValue(val: string | null): any {
  if (val === null || val === undefined) return null;
  return val;
}

export async function parseUniversalTable(opts: UniversalParseOptions): Promise<UniversalParsedTable> {
  const filename = opts.fileName ?? opts.filename ?? (opts.filePath ? opts.filePath.split(/[\\/]/).pop() : undefined) ?? "import.txt";
  let src: ByteSource;
  if (opts.filePath) {
    src = fileSource(opts.filePath, filename);
  } else if (opts.bytes) {
    src = binarySource(opts.bytes, filename);
  } else if (opts.base64) {
    src = binarySource(new Uint8Array(Buffer.from(opts.base64, "base64")), filename);
  } else {
    src = memorySource(opts.content ?? "", filename);
  }

  const overrides: Partial<SourceSettings> = {
    ...normalizeFormatOverride(opts.format),
    ...(opts.delimiter !== undefined ? { delimiter: opts.delimiter } : {}),
    ...(opts.hasHeader !== undefined ? { hasHeader: opts.hasHeader } : {}),
    ...(opts.sheet ? { sheet: opts.sheet } : {}),
  };

  try {
    const analysis = await analyzeSource(src, overrides);
    const colNames = analysis.columns.map((c) => c.name);
    const rows: (string | null)[][] = [];
    const records: Record<string, any>[] = [];
    const ctx = newReadContext();
    for await (const r of readRows(src, analysis.settings, colNames, ctx)) {
      rows.push(r.cells);
      const rec: Record<string, any> = {};
      colNames.forEach((col, i) => {
        rec[col] = coerceCellValue(r.cells[i] ?? null);
      });
      if (r.extra) {
        for (const [k, v] of Object.entries(r.extra)) {
          if (!(k in rec)) rec[k] = coerceCellValue(v);
        }
      }
      records.push(rec);
    }
    const activeSheet = analysis.sheets ? (analysis.settings.sheet ?? analysis.sheets[0]) : undefined;
    return {
      format: analysis.settings.format,
      columns: colNames,
      rows,
      records,
      ...(analysis.sheets ? { sheets: analysis.sheets, activeSheet, selectedSheet: activeSheet } : {}),
      warnings: analysis.warnings,
    };
  } catch (err: any) {
    // Fallback for a single flat JSON object like {"id": 1, "name": "Alice"} when format is json/auto
    const text = opts.content ?? (opts.base64 ? Buffer.from(opts.base64, "base64").toString("utf8") : "");
    if (text && text.trim().startsWith("{")) {
      try {
        const parsed: Value = parseLenientJson(text, true, new Notes());
        if (isObj(parsed) && Object.keys(parsed).length > 0) {
          const rawKeys = Object.keys(parsed as Obj);
          const columns = cleanHeaderNames(rawKeys);
          const row = rawKeys.map((k) => {
            const v = (parsed as Obj)[k];
            return v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
          });
          const rec: Record<string, any> = {};
          columns.forEach((c, i) => {
            rec[c] = row[i];
          });
          return {
            format: "json",
            columns,
            rows: [row],
            records: [rec],
            warnings: [],
          };
        }
      } catch {
        // Ignore fallback error and rethrow original
      }
    }
    throw err;
  }
}
