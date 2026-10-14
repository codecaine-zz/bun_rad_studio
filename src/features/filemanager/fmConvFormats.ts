/**
 * Converting between the data formats: the registry of formats, which file extensions mean which format, and the
 * function that reads one format and writes another. Pure text in, text out.
 */
import { ConvError, Notes, inferScalar, isObj, recordsFromRows, sortKeysDeep, toTable, unflatten, type Value } from "./fmConvCommon";
import {
  detectDelimiter, parseCsvRows, parseJson, parseNdjson, parseToml, parseYaml, writeCsvRows, writeJson, writeNdjson, writeToml, writeYaml, type Delimiter,
} from "./fmConvData";
import {
  parseEnv, parseHtmlTable, parseIni, parseMarkdownTable, parsePlist, parseProperties, parseSql, parseXml, writeEnv, writeHtmlTable, writeIni, writeMarkdownTable,
  writePlist, writeProperties, writeSql, writeXml, type Dialect,
} from "./fmConvMarkup";

export type DataFormat =
  | "json" | "jsonc" | "json5" | "yaml" | "toml" | "csv" | "tsv" | "xml" | "ndjson" | "ini" | "env" | "properties" | "markdown" | "html" | "sql" | "plist" | "sheet";

/** File extensions that mean a data format (for reading). */
export const DATA_EXTENSIONS: Record<string, DataFormat> = {
  json: "json", jsonc: "jsonc", json5: "json5", yaml: "yaml", yml: "yaml", toml: "toml", csv: "csv", tsv: "tsv", tab: "tsv", xml: "xml", ndjson: "ndjson", jsonl: "ndjson",
  ini: "ini", env: "env", properties: "properties", md: "markdown", markdown: "markdown", html: "html", htm: "html", sql: "sql", plist: "plist", xlsx: "sheet", ods: "sheet",
};

export interface DataOptions {
  /** Nested data in a table: dotted column names (true) or JSON text in one cell (false). */
  flatten: boolean;
  /** Dotted names back into nested data when reading flat formats (CSV, INI, .env, .properties). */
  unflatten: boolean;
  /** First row holds the column names. */
  header: boolean;
  delimiter: "auto" | Delimiter;
  /** Read numbers and true/false in text formats as numbers and booleans (only when nothing is lost). */
  types: boolean;
  sortKeys: boolean;
  /** JSON indent; 0 is the smallest form. */
  indent: number;
  tableName: string;
  rootName: string;
  itemName: string;
  dialect: Dialect;
  createTable: boolean;
  /** Start a CSV/TSV with a byte-order mark so Excel reads accents correctly. */
  bom: boolean;
  title: string;
}

export const DEFAULT_DATA_OPTIONS: DataOptions = {
  flatten: true, unflatten: false, header: true, delimiter: "auto", types: true, sortKeys: false, indent: 2, tableName: "data", rootName: "root", itemName: "item",
  dialect: "ansi", createTable: false, bom: false, title: "Table",
};

export const WRITABLE: ReadonlyArray<Exclude<DataFormat, "jsonc" | "json5" | "sheet">> = ["json", "yaml", "toml", "csv", "tsv", "xml", "ndjson", "ini", "env", "properties", "markdown", "html", "sql", "plist"];

/** The extension of the file a format is written to. */
export const FORMAT_EXTENSION: Record<string, string> = {
  json: "json", yaml: "yaml", toml: "toml", csv: "csv", tsv: "tsv", xml: "xml", ndjson: "ndjson", ini: "ini", env: "env", properties: "properties", markdown: "md", html: "html", sql: "sql", plist: "plist",
};

export function parseData(format: DataFormat, text: string, o: DataOptions, notes: Notes): Value {
  switch (format) {
    case "json": return parseJson(text, false, notes);
    case "jsonc": case "json5": return parseJson(text, true, notes);
    case "ndjson": return parseNdjson(text, notes);
    case "yaml": return parseYaml(text);
    case "toml": return parseToml(text);
    case "xml": return parseXml(text);
    case "plist": return parsePlist(text, notes);
    case "ini": return maybeUnflatten(parseIni(text, o.types, notes), o);
    case "env": return maybeUnflatten(parseEnv(text, o.types), o);
    case "properties": return maybeUnflatten(parseProperties(text, o.types), o);
    case "markdown": return parseMarkdownTable(text, o.types, notes);
    case "html": return parseHtmlTable(text, o.header, o.types, notes);
    case "sql": return parseSql(text, o.types, notes);
    case "csv": case "tsv": {
      const delimiter: Delimiter = format === "tsv" ? "\t" : o.delimiter === "auto" ? detectDelimiter(text) : o.delimiter;
      const rows = parseCsvRows(text, delimiter);
      if (!rows.length) throw new ConvError("The file is empty: there are no rows to convert.");
      if (!o.header) return rows.map((r) => r.map((c) => (o.types ? inferScalar(c) : c)));
      if (rows.length === 1) notes.add("The file has only a header row and no data rows.");
      const recs = recordsFromRows(rows[0]!, rows.slice(1), o.types);
      return o.unflatten ? recs.map((r) => unflatten(r)) : recs;
    }
    case "sheet": throw new ConvError("Spreadsheets are read by the spreadsheet reader.");
  }
}

function maybeUnflatten(v: Value, o: DataOptions): Value {
  return o.unflatten && isObj(v) ? unflatten(v) : v;
}

export function writeData(format: DataFormat, value: Value, o: DataOptions, notes: Notes): string {
  const v = o.sortKeys ? sortKeysDeep(value) : value;
  switch (format) {
    case "json": return writeJson(v, o.indent, notes);
    case "yaml": return writeYaml(v);
    case "toml": return writeToml(v, notes);
    case "ndjson": return writeNdjson(v, notes);
    case "xml": return writeXml(v, { rootName: o.rootName, itemName: o.itemName }, notes);
    case "plist": return writePlist(v, notes);
    case "ini": return writeIni(v, notes);
    case "env": return writeEnv(v, notes);
    case "properties": return writeProperties(v, notes);
    case "markdown": return writeMarkdownTable(v, o.flatten, notes);
    case "html": return writeHtmlTable(v, o.flatten, o.title, notes);
    case "sql": return writeSql(v, { table: o.tableName, dialect: o.dialect, createTable: o.createTable, flatten: o.flatten }, notes);
    case "csv": case "tsv": {
      const delimiter: Delimiter = format === "tsv" ? "\t" : o.delimiter === "auto" ? "," : o.delimiter;
      const t = toTable(v, { flatten: o.flatten, notes });
      const hasHeader = !(Array.isArray(v) && v.length > 0 && v.every((r) => Array.isArray(r)));
      const body = writeCsvRows(hasHeader ? t.columns : null, t.rows, delimiter, notes);
      return (o.bom ? "\ufeff" : "") + body;
    }
    default: throw new ConvError(`Writing ${format} isn't supported.`);
  }
}

/** Reads `text` as `from` and writes it as `to`; the notes say what could not be kept exactly. */
export function convertData(from: DataFormat, to: DataFormat, text: string, o: DataOptions): { text: string; notes: string } {
  const notes = new Notes();
  const value = parseData(from, text, o, notes);
  return { text: writeData(to, value, o, notes), notes: notes.toString() };
}
