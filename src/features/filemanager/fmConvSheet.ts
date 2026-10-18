/**
 * Spreadsheets without installing anything: reading .xlsx and .ods (shared strings, numbers, dates, booleans, every
 * sheet) and writing a plain .xlsx. This is a deliberately small reader: values only, no formulas' results beyond
 * what the file stored, no styles, charts or pictures.
 */
import { promises as fsp } from "fs";
import { ConvError, MAX_INPUT_BYTES, Notes, isObj, newObj, setKey, uniqueHeaders, type Obj, type Value } from "./fmConvCommon";
import { decodeEntities } from "./fmConvMarkup";
import { readCentralDirectory, readZipEntry, type CentralEntry } from "./fmZip";
import { zipBuffer } from "./fmConvZip";

export interface Sheet {
  name: string;
  rows: Value[][];
}

const MAX_ROWS = 1_048_576;
const MAX_COLS = 16_384;
const MAX_CELLS = 20_000_000;

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? "") : null;
}

/** An Excel serial date as text: "2024-03-01" for a whole day, "2024-03-01T13:30:00" with a time. */
export function excelDate(serial: number, date1904: boolean): string {
  const offset = date1904 ? 24107 : serial >= 60 ? 25569 : 25568;
  const ms = Math.round((serial - offset) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso.slice(0, 19);
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(stripped) && !/^[#0?,.%E+\-() ]*$/.test(stripped);
}

async function entryText(handle: fsp.FileHandle, size: number, entries: Map<string, CentralEntry>, name: string, required: boolean): Promise<string | null> {
  const e = entries.get(name) ?? [...entries.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!e) {
    if (required) throw new ConvError("This doesn't look like a valid spreadsheet (a required part is missing).");
    return null;
  }
  try {
    return (await readZipEntry(handle, size, e, MAX_INPUT_BYTES)).toString("utf8");
  } catch (err: any) {
    throw new ConvError(String(err?.message ?? err));
  }
}

function addCell(rows: Value[][], r: number, c: number, v: Value, state: { cells: number }) {
  if (r >= MAX_ROWS || c >= MAX_COLS) throw new ConvError("This sheet is bigger than a spreadsheet can be (over 1,048,576 rows or 16,384 columns).");
  if (++state.cells > MAX_CELLS) throw new ConvError("This sheet has too many filled cells (over 20 million) for the built-in reader.");
  const row = (rows[r] ??= []);
  while (row.length < c) row.push(null);
  row[c] = v;
}

function densify(rows: Value[][]): Value[][] {
  const out: Value[][] = [];
  for (let i = 0; i < rows.length; i++) out.push(rows[i] ?? []);
  while (out.length && out[out.length - 1]!.every((v) => v === null || v === "")) out.pop();
  const width = out.reduce((m, r) => Math.max(m, r.length), 0);
  return out.map((r) => (r.length < width ? [...r, ...Array.from({ length: width - r.length }, () => null)] : r));
}

function bufferHandle(bytes: Uint8Array): fsp.FileHandle {
  return {
    async read(buf: Buffer, offset: number, length: number, position: number) {
      if (position < 0 || position >= bytes.byteLength || length <= 0) return { bytesRead: 0, buffer: buf };
      const end = Math.min(bytes.byteLength, position + length);
      const count = end - position;
      buf.set(bytes.subarray(position, end), offset);
      return { bytesRead: count, buffer: buf };
    },
    async close() {},
  } as unknown as fsp.FileHandle;
}

async function readXlsxHandle(handle: fsp.FileHandle, size: number): Promise<Sheet[]> {
  let entries: Map<string, CentralEntry>;
  try {
    entries = new Map((await readCentralDirectory(handle, size)).map((e) => [e.name, e]));
  } catch {
    throw new ConvError("This file isn't a valid .xlsx spreadsheet (it can't be opened as a zip).");
  }
  const wb = (await entryText(handle, size, entries, "xl/workbook.xml", true))!;
  const rels = (await entryText(handle, size, entries, "xl/_rels/workbook.xml.rels", false)) ?? "";
  const date1904 = /<workbookPr\b[^>]*\bdate1904\s*=\s*["'](?:1|true)["']/i.test(wb);
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) relTarget.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared: string[] = [];
  const sst = await entryText(handle, size, entries, "xl/sharedStrings.xml", false);
  if (sst) {
    for (const si of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      const body = si[1]!.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
      let s = "";
      for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeEntities(t[1]!);
      shared.push(s);
    }
  }
  const styles = await entryText(handle, size, entries, "xl/styles.xml", false);
  const dateStyles = new Set<number>();
  if (styles) {
    const custom = new Map<number, string>();
    for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) {
      const id = Number(attr(m[0], "numFmtId"));
      const code = attr(m[0], "formatCode");
      if (code !== null) custom.set(id, code);
    }
    const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
    let i = 0;
    for (const xf of cellXfs.matchAll(/<xf\b[^>]*>/g)) {
      const id = Number(attr(xf[0], "numFmtId") ?? 0);
      if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id)!))) dateStyles.add(i);
      i++;
    }
  }
  const sheets: Sheet[] = [];
  const state = { cells: 0 };
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], "r:id") ?? attr(m[0], "id");
    const target = rid ? relTarget.get(rid) : undefined;
    const xml = target ? await entryText(handle, size, entries, target, false) : null;
    if (xml === null) continue;
    const rows: Value[][] = [];
    let autoRow = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rIdx = attr(rm[1]!, "r") ? Number(attr(rm[1]!, "r")) - 1 : autoRow;
      autoRow = rIdx + 1;
      if (!rm[2]) continue;
      let autoCol = 0;
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cm[1]!, "r");
        const col = ref && /^[A-Za-z]+/.test(ref) ? colIndex(/^[A-Za-z]+/.exec(ref)![0]) : autoCol;
        autoCol = col + 1;
        const type = attr(cm[1]!, "t") ?? "n";
        const style = Number(attr(cm[1]!, "s") ?? 0);
        const inner = cm[2] ?? "";
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value: Value = null;
        if (type === "s") value = v !== undefined ? shared[Number(v)] ?? "" : null;
        else if (type === "inlineStr") value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1]!)).join("");
        else if (type === "str" || type === "e") value = v !== undefined ? decodeEntities(v) : null;
        else if (type === "b") value = v === "1";
        else if (type === "d") value = v !== undefined ? decodeEntities(v) : null;
        else if (v !== undefined && v !== "") {
          const num = Number(v);
          value = Number.isFinite(num) ? (dateStyles.has(style) ? excelDate(num, date1904) : num) : decodeEntities(v);
        }
        if (value !== null && value !== "") addCell(rows, rIdx, col, value, state);
      }
    }
    sheets.push({ name, rows: densify(rows) });
  }
  if (!sheets.length) throw new ConvError("This spreadsheet has no sheets.");
  return sheets;
}

export async function readXlsx(path: string): Promise<Sheet[]> {
  const handle = await fsp.open(path, "r");
  try {
    const size = (await handle.stat()).size;
    return await readXlsxHandle(handle, size);
  } finally {
    await handle.close();
  }
}

export async function readXlsxBuffer(bytes: Uint8Array): Promise<Sheet[]> {
  return readXlsxHandle(bufferHandle(bytes), bytes.byteLength);
}

function odsText(cell: string): string {
  const paras = [...cell.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>|<text:p\b[^>]*\/>/g)].map((p) => (p[1] ?? "")
    .replace(/<text:s\b([^>]*)\/>/g, (_m, a: string) => " ".repeat(Math.min(1000, Number(/text:c="(\d+)"/.exec(a)?.[1] ?? 1))))
    .replace(/<text:tab\s*\/>/g, "\t").replace(/<text:line-break\s*\/>/g, "\n").replace(/<[^>]*>/g, ""));
  return decodeEntities(paras.join("\n"));
}

async function readOdsHandle(handle: fsp.FileHandle, size: number): Promise<Sheet[]> {
  let entries: Map<string, CentralEntry>;
  try {
    entries = new Map((await readCentralDirectory(handle, size)).map((e) => [e.name, e]));
  } catch {
    throw new ConvError("This file isn't a valid .ods spreadsheet (it can't be opened as a zip).");
  }
  const xml = (await entryText(handle, size, entries, "content.xml", true))!;
  const sheets: Sheet[] = [];
  const state = { cells: 0 };
  for (const tm of xml.matchAll(/<table:table(?=[\s>])([^>]*?)>([\s\S]*?)<\/table:table>/g)) {
    const name = attr(tm[1]!, "table:name") ?? `Sheet${sheets.length + 1}`;
    const rows: Value[][] = [];
    let r = 0;
    for (const rm of tm[2]!.matchAll(/<table:table-row(?=[\s>\/])([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const repeat = Math.min(Number(attr(rm[1]!, "table:number-rows-repeated") ?? 1), 100_000);
      const cells: Array<[number, Value, number]> = [];
      let c = 0;
      for (const cm of (rm[2] ?? "").matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const times = Math.min(Number(attr(cm[1]!, "table:number-columns-repeated") ?? 1), MAX_COLS);
        const type = attr(cm[1]!, "office:value-type");
        let value: Value = null;
        if (type === "float" || type === "percentage" || type === "currency") {
          const num = Number(attr(cm[1]!, "office:value"));
          value = Number.isFinite(num) ? num : null;
        } else if (type === "boolean") value = attr(cm[1]!, "office:boolean-value") === "true";
        else if (type === "date") value = attr(cm[1]!, "office:date-value");
        else if (type === "time") value = attr(cm[1]!, "office:time-value");
        else if (type === "string") value = attr(cm[1]!, "office:string-value") ?? odsText(cm[2] ?? "");
        if (value !== null && value !== "") cells.push([c, value, Math.min(times, 1000)]);
        c += times;
      }
      if (cells.length) for (let k = 0; k < Math.min(repeat, 1000); k++) for (const [col, v, times] of cells) for (let t = 0; t < times; t++) addCell(rows, r + k, col + t, v, state);
      r += repeat;
    }
    sheets.push({ name, rows: densify(rows) });
  }
  if (!sheets.length) throw new ConvError("This spreadsheet has no sheets.");
  return sheets;
}

export async function readOds(path: string): Promise<Sheet[]> {
  const handle = await fsp.open(path, "r");
  try {
    const size = (await handle.stat()).size;
    return await readOdsHandle(handle, size);
  } finally {
    await handle.close();
  }
}

export async function readOdsBuffer(bytes: Uint8Array): Promise<Sheet[]> {
  return readOdsHandle(bufferHandle(bytes), bytes.byteLength);
}

export async function readSpreadsheet(path: string): Promise<Sheet[]> {
  return path.toLowerCase().endsWith(".ods") ? readOds(path) : readXlsx(path);
}

export async function readSpreadsheetBuffer(bytes: Uint8Array, name = ""): Promise<Sheet[]> {
  const handle = bufferHandle(bytes);
  try {
    const entries = new Map((await readCentralDirectory(handle, bytes.byteLength)).map((e) => [e.name.toLowerCase(), e]));
    if (entries.has("content.xml") && !entries.has("xl/workbook.xml")) return await readOdsHandle(handle, bytes.byteLength);
    if (entries.has("xl/workbook.xml")) return await readXlsxHandle(handle, bytes.byteLength);
  } catch {
    // Fall through to extension-specific reader for clear error reporting
  }
  return name.toLowerCase().endsWith(".ods") ? readOdsBuffer(bytes) : readXlsxBuffer(bytes);
}

/** A sheet as data: a list of records when the first row is a header, otherwise a list of lists. */
export function sheetValue(sheet: Sheet, header: boolean): Value {
  if (!header || sheet.rows.length === 0) return sheet.rows;
  const names = uniqueHeaders(sheet.rows[0]!.map((h) => (h === null ? "" : String(h))));
  return sheet.rows.slice(1).map((r) => {
    const rec: Obj = newObj();
    names.forEach((n, i) => setKey(rec, n, r[i] ?? ""));
    return rec;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Writing .xlsx
// ---------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const XML_BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;
const esc = (s: string) => s.replace(XML_BAD, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function sheetName(raw: string, taken: Set<string>): string {
  let n = raw.replace(/[[\]:*?/\\]/g, "_").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Sheet";
  let k = 2;
  while (taken.has(n.toLowerCase())) { const suffix = ` (${k++})`; n = `${n.slice(0, 31 - suffix.length)}${suffix}`; }
  taken.add(n.toLowerCase());
  return n;
}

/** Sheets for a value: an object whose values are all lists becomes one sheet per key; anything else is one sheet. */
export function sheetsFromValue(v: Value, defaultName: string, tableFor: (value: Value) => { columns: string[]; rows: Value[][] }, header: boolean): Array<{ name: string; columns: string[] | null; rows: Value[][] }> {
  const taken = new Set<string>();
  const make = (name: string, value: Value) => {
    const t = tableFor(value);
    const plainRows = Array.isArray(value) && value.length > 0 && value.every((r) => Array.isArray(r));
    return { name: sheetName(name, taken), columns: header && !plainRows ? t.columns : null, rows: t.rows };
  };
  if (isObj(v) && Object.keys(v).length > 1 && Object.values(v).every((x) => Array.isArray(x) && x.length > 0)) return Object.entries(v).map(([k, x]) => make(k, x));
  return [make(defaultName, v)];
}

export function writeXlsx(sheets: Array<{ name: string; columns: string[] | null; rows: Value[][] }>, notes: Notes): Buffer {
  const strings: string[] = [];
  const index = new Map<string, number>();
  const sst = (s: string): number => {
    let i = index.get(s);
    if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i); }
    return i;
  };
  const sheetXml = sheets.map((sh) => {
    const all: Value[][] = sh.columns ? [sh.columns, ...sh.rows] : sh.rows;
    if (all.length > MAX_ROWS) throw new ConvError(`There are more rows (${all.length}) than a spreadsheet can hold (1,048,576). Split the data into smaller files first.`);
    const width = all.reduce((m, r) => Math.max(m, r.length), 0);
    if (width > MAX_COLS) throw new ConvError("There are more columns than a spreadsheet can hold (16,384).");
    const widths = Array.from({ length: width }, () => 8);
    const rows = all.map((r, ri) => {
      const cells = r.map((v, ci) => {
        if (v === null || v === undefined || v === "") return "";
        const ref = `${colName(ci)}${ri + 1}`;
        const head = sh.columns && ri === 0;
        const style = head ? ' s="1"' : "";
        if (typeof v === "number" && Number.isFinite(v)) { widths[ci] = Math.max(widths[ci]!, String(v).length + 2); return `<c r="${ref}"${style}><v>${v}</v></c>`; }
        if (typeof v === "boolean") return `<c r="${ref}" t="b"${style}><v>${v ? 1 : 0}</v></c>`;
        let s = typeof v === "string" ? v : String(v);
        if (s.length > 32_767) { s = s.slice(0, 32_767); notes.add("Text longer than 32,767 characters was cut, which is the most a spreadsheet cell holds."); }
        widths[ci] = Math.max(widths[ci]!, Math.min(60, Math.max(...s.split("\n").map((l) => l.length)) + 2));
        return `<c r="${ref}" t="s"${style}><v>${sst(s)}</v></c>`;
      }).join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join("");
    const cols = width ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, w)}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = sh.columns ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  });
  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  const entries: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`) },
    { name: "_rels/.rels", data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: "xl/workbook.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name).replace(/"/g, "&quot;")}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>') },
    { name: "xl/sharedStrings.xml", data: Buffer.from(sstXml) },
    ...sheetXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(x) })),
  ];
  return zipBuffer(entries);
}
