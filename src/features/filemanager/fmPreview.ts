/**
 * Universal Rich File Preview Engine (`fmPreview.ts`).
 *
 * Inspects any file on disk (read-only, bounded in bytes and time) and produces structured
 * preview data (`RichPreview`) so Quick Look, the Details panel, and the Code Editor can
 * render the best formatted preview for every file format:
 *   - Spreadsheets (.xlsx, .xlsm, .ods) -> multi-sheet tabular grid
 *   - Documents (.docx, .odt, .rtf, .epub, .fb2, .doc) -> formatted headings, paragraphs, lists, tables & chapters
 *   - Presentations (.pptx, .ppsx, .odp) -> slide deck with titles, bullet points & speaker notes
 *   - PDFs (.pdf) -> document metadata, outline, safety flags & extracted readable page text
 *   - SQLite databases (.sqlite, .db, .sqlite3) -> schema summary, table list, column types & sample rows
 *   - Archives (.zip, .tar, .tar.gz, .tgz, .gz, .zst, .jar, .apk, .whl, .cbz) -> entry tree & inner decompressed text
 *   - Fonts (.ttf, .otf, .woff, .woff2, .ttc) -> typographic metrics, glyph count, designer/license & live specimen flag
 *   - Structured data (.json, .jsonl, .yaml, .toml, .ini, .env, .properties, .xml, .plist, binary bplist00, .geojson)
 *   - Jupyter Notebooks (.ipynb) -> markdown + code cells with execution counts and outputs
 *   - Subtitles & Lyrics (.srt, .vtt, .ass, .ssa, .sbv, .lrc) -> timed cue transcript table
 *   - Playlists (.m3u, .m3u8, .pls, .xspf) -> track list & HLS stream info
 *   - Calendars (.ics, .vcs) & Contacts (.vcf, .vcard) -> structured event & contact cards
 *   - Certificates & Keys (.pem, .crt, .cer, .der, .csr, .pub, .asc) -> block details, SHA-256 fingerprint & ASN.1 strings
 *   - 3D Models (.obj, .stl, .ply, .gltf, .glb) -> geometry stats, bounding box & 3D wireframe mesh preview
 *   - Diffs (.diff, .patch) & Logs (.log) -> file hunk stats & log level breakdown
 *   - Executables & Binary files (PE, ELF, Mach-O, WASM, Java .class, .torrent, raw binary) -> headers + Hex/ASCII + Strings
 */
import { createHash } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { brotliDecompressSync, createGunzip, gunzipSync, inflateRawSync, inflateSync, zstdDecompressSync } from "zlib";
import { Database } from "bun:sqlite";
import { Notes, isObj, toTable, type Value } from "./fmConvCommon";
import { DEFAULT_DATA_OPTIONS, parseData } from "./fmConvFormats";
import { parseEnv, parseIni, parseProperties } from "./fmConvMarkup";
import { readSpreadsheet } from "./fmConvSheet";
import { elfInfo, fontInfo, machoInfo, peInfo, sqliteInfo } from "./fmInfoBinary";
import { ascii, be16, be32, clip, fileSource, humanBytes, le16, le32, type InfoGroup, type Source } from "./fmInfoCommon";
import { decodeEntities, xmlAttr, xmlText } from "./fmInfoMeta";
import { parsePdf, pdfGroups, pdfString } from "./fmInfoPdf";
import { gzipDocument, isTarHeader, tarDocument, walkTar, zipDocument } from "./fmInfoZipDoc";
import { extensionOf } from "./fmPaths";
import { sniffType } from "./fmSniff";
import { readCentralDirectory, readZipEntry, type CentralEntry } from "./fmZip";

export type DocBlock =
  | { type: "h1" | "h2" | "h3" | "p" | "li" | "quote" | "code"; text: string }
  | { type: "table"; rows: string[][] };

export interface RichSpreadsheetPreview {
  kind: "spreadsheet";
  formatLabel: string;
  meta: Array<[string, string]>;
  sheets: Array<{
    name: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
    totalCols: number;
  }>;
  hasThumb?: boolean;
}

export interface RichDocumentPreview {
  kind: "document";
  formatLabel: string;
  title?: string;
  author?: string;
  meta: Array<[string, string]>;
  blocks: DocBlock[];
  chapters?: Array<{ title: string; blocks: DocBlock[] }>;
  plainText: string;
  hasThumb?: boolean;
}

export interface RichPresentationPreview {
  kind: "presentation";
  formatLabel: string;
  meta: Array<[string, string]>;
  slides: Array<{
    number: number;
    title: string;
    bullets: string[];
    notes?: string;
  }>;
  plainText: string;
  hasThumb?: boolean;
}

export interface RichPdfPreview {
  kind: "pdf";
  formatLabel: string;
  pages: number | null;
  pageSize: string;
  version: string;
  encrypted: boolean;
  meta: Array<[string, string]>;
  flags: Array<{ label: string; found: boolean; hint: string }>;
  outline: string[];
  extractedText: string;
  hasThumb?: boolean;
}

export interface RichSqlitePreview {
  kind: "sqlite";
  formatLabel: string;
  meta: Array<[string, string]>;
  tables: Array<{
    name: string;
    type: "table" | "view";
    rowCount: number;
    columns: Array<{ name: string; type: string; pk: boolean; notnull: boolean }>;
    rows: string[][];
    sql?: string;
  }>;
}

export interface RichArchivePreview {
  kind: "archive";
  formatLabel: string;
  meta: Array<[string, string]>;
  totalEntries: number;
  files: number;
  folders: number;
  uncompressed: number;
  compressed: number;
  encrypted: number;
  entries: Array<{ name: string; size: number; packed?: number; dir: boolean; encrypted?: boolean }>;
  innerName?: string;
  innerText?: string;
}

export interface RichFontPreview {
  kind: "font";
  formatLabel: string;
  family: string;
  style: string;
  meta: Array<[string, string]>;
  canRenderSpecimen: boolean;
}

export interface RichStructuredPreview {
  kind: "structured";
  subkind: "json" | "jsonl" | "yaml" | "toml" | "ini" | "env" | "xml" | "plist" | "bplist" | "geojson";
  formatLabel: string;
  meta: Array<[string, string]>;
  data?: unknown;
  table?: { headers: string[]; rows: string[][]; totalRows: number } | null;
  formattedText?: string;
}

export interface RichNotebookPreview {
  kind: "notebook";
  formatLabel: string;
  meta: Array<[string, string]>;
  cells: Array<{
    index: number;
    cellType: "markdown" | "code" | "raw";
    executionCount?: number | null;
    source: string;
    outputs?: Array<{ kind: "text" | "error" | "image"; text?: string; mime?: string; dataUrl?: string }>;
  }>;
}

export interface RichSubtitlesPreview {
  kind: "subtitles";
  formatLabel: string;
  meta: Array<[string, string]>;
  cues: Array<{ index: number; start: string; end: string; speaker?: string; text: string }>;
  totalCues: number;
}

export interface RichPlaylistPreview {
  kind: "playlist";
  formatLabel: string;
  meta: Array<[string, string]>;
  tracks: Array<{ index: number; title: string; duration?: string; path: string }>;
}

export interface RichCalendarPreview {
  kind: "calendar";
  formatLabel: string;
  meta: Array<[string, string]>;
  events: Array<{
    summary: string;
    start: string;
    end?: string;
    location?: string;
    organizer?: string;
    status?: string;
    description?: string;
  }>;
}

export interface RichContactPreview {
  kind: "contact";
  formatLabel: string;
  meta: Array<[string, string]>;
  contacts: Array<{
    fullName: string;
    org?: string;
    title?: string;
    phones: string[];
    emails: string[];
    addresses: string[];
    url?: string;
    note?: string;
  }>;
}

export interface RichCertificatePreview {
  kind: "certificate";
  formatLabel: string;
  meta: Array<[string, string]>;
  blocks: Array<{
    label: string;
    bytes: number;
    sha256: string;
    sha1: string;
    details: Array<[string, string]>;
  }>;
}

export interface RichModel3dPreview {
  kind: "model3d";
  formatLabel: string;
  meta: Array<[string, string]>;
  vertices: Array<[number, number, number]>;
  edges: Array<[number, number]>;
}

export interface RichDiffPreview {
  kind: "diff";
  formatLabel: string;
  meta: Array<[string, string]>;
  files: Array<{
    oldFile: string;
    newFile: string;
    added: number;
    removed: number;
    hunks: Array<{ header: string; lines: Array<{ type: "+" | "-" | " "; text: string }> }>;
  }>;
}

export interface RichLogPreview {
  kind: "log";
  formatLabel: string;
  meta: Array<[string, string]>;
  counts: { error: number; warn: number; info: number; debug: number; other: number };
  entries: Array<{ line: number; level: "ERROR" | "WARN" | "INFO" | "DEBUG" | "OTHER"; timestamp?: string; text: string }>;
}

export interface RichBinaryPreview {
  kind: "binary";
  formatLabel: string;
  meta: Array<[string, string]>;
  hexLines: string[];
  strings: string[];
}

export type RichPreview =
  | RichSpreadsheetPreview
  | RichDocumentPreview
  | RichPresentationPreview
  | RichPdfPreview
  | RichSqlitePreview
  | RichArchivePreview
  | RichFontPreview
  | RichStructuredPreview
  | RichNotebookPreview
  | RichSubtitlesPreview
  | RichPlaylistPreview
  | RichCalendarPreview
  | RichContactPreview
  | RichCertificatePreview
  | RichModel3dPreview
  | RichDiffPreview
  | RichLogPreview
  | RichBinaryPreview;

function flattenGroups(groups: InfoGroup[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const g of groups) {
    for (const r of g.rows) {
      if (r.label && r.value) out.push([r.label, r.value]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Hex + ASCII + Printable Strings + Entropy
// ---------------------------------------------------------------------------------------------------------------

export function buildHexLines(buf: Uint8Array, maxBytes = 2048): string[] {
  const len = Math.min(buf.length, maxBytes);
  const lines: string[] = [];
  for (let off = 0; off < len; off += 16) {
    const slice = buf.subarray(off, Math.min(len, off + 16));
    const hexLeft: string[] = [];
    const hexRight: string[] = [];
    let asciiCol = "";
    for (let i = 0; i < 16; i++) {
      if (i < slice.length) {
        const b = slice[i]!;
        const hx = b.toString(16).padStart(2, "0");
        if (i < 8) hexLeft.push(hx);
        else hexRight.push(hx);
        asciiCol += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
      } else {
        if (i < 8) hexLeft.push("  ");
        else hexRight.push("  ");
        asciiCol += " ";
      }
    }
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hexLeft.join(" ")}  ${hexRight.join(" ")}  |${asciiCol}|`);
  }
  return lines;
}

export function extractPrintableStrings(buf: Uint8Array, minLen = 4, maxCount = 120): string[] {
  const out: string[] = [];
  let cur = "";
  const limit = Math.min(buf.length, 65536);
  for (let i = 0; i < limit && out.length < maxCount; i++) {
    const b = buf[i]!;
    if ((b >= 32 && b <= 126) || b === 9) {
      if (cur.length < 200) cur += String.fromCharCode(b);
    } else {
      if (cur.trim().length >= minLen) out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim().length >= minLen && out.length < maxCount) out.push(cur.trim());
  return out;
}

function shannonEntropy(buf: Uint8Array): number {
  if (!buf.length) return 0;
  const counts = new Uint32Array(256);
  const len = Math.min(buf.length, 65536);
  for (let i = 0; i < len; i++) counts[buf[i]!]!++;
  let e = 0;
  for (let i = 0; i < 256; i++) {
    const c = counts[i]!;
    if (c > 0) {
      const p = c / len;
      e -= p * Math.log2(p);
    }
  }
  return Math.round(e * 100) / 100;
}

// ---------------------------------------------------------------------------------------------------------------
// Apple Binary Property List (bplist00) Pure-TS Decoder
// ---------------------------------------------------------------------------------------------------------------

export function parseBinaryPlist(buf: Buffer): unknown {
  if (buf.length < 40 || buf.subarray(0, 8).toString("ascii") !== "bplist00") return null;
  const trailer = buf.subarray(buf.length - 32);
  const offsetSize = trailer[6]!;
  const objectRefSize = trailer[7]!;
  const numObjects = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const offsetTableOffset = Number(trailer.readBigUInt64BE(24));
  if (
    offsetSize < 1 || offsetSize > 8 ||
    objectRefSize < 1 || objectRefSize > 8 ||
    numObjects < 1 || numObjects > 50_000 ||
    offsetTableOffset < 8 || offsetTableOffset + numObjects * offsetSize > buf.length - 32
  ) {
    return null;
  }
  const readUInt = (pos: number, bytes: number): number => {
    let v = 0;
    for (let i = 0; i < bytes; i++) v = v * 256 + (buf[pos + i] ?? 0);
    return v;
  };
  const offsets = new Array<number>(numObjects);
  for (let i = 0; i < numObjects; i++) {
    offsets[i] = readUInt(offsetTableOffset + i * offsetSize, offsetSize);
  }
  const visited = new Set<number>();
  const decodeObj = (idx: number, depth: number): unknown => {
    if (depth > 16 || idx < 0 || idx >= numObjects || visited.has(idx)) return null;
    const off = offsets[idx]!;
    if (off < 8 || off >= offsetTableOffset) return null;
    const marker = buf[off]!;
    const hi = (marker & 0xf0) >> 4;
    const lo = marker & 0x0f;
    const readLen = (p: number): { len: number; next: number } => {
      if (lo !== 0x0f) return { len: lo, next: p };
      const intMarker = buf[p] ?? 0;
      const intBytes = 1 << (intMarker & 0x0f);
      return { len: readUInt(p + 1, intBytes), next: p + 1 + intBytes };
    };
    switch (hi) {
      case 0x0:
        if (lo === 0x08) return false;
        if (lo === 0x09) return true;
        return null;
      case 0x1: {
        const bytes = 1 << lo;
        if (bytes <= 4) return readUInt(off + 1, bytes);
        if (bytes === 8 && off + 9 <= buf.length) return Number(buf.readBigInt64BE(off + 1));
        return readUInt(off + 1, Math.min(bytes, 8));
      }
      case 0x2: {
        const bytes = 1 << lo;
        if (bytes === 4 && off + 5 <= buf.length) return buf.readFloatBE(off + 1);
        if (bytes === 8 && off + 9 <= buf.length) return buf.readDoubleBE(off + 1);
        return 0;
      }
      case 0x3: {
        if (off + 9 > buf.length) return null;
        const secs = buf.readDoubleBE(off + 1);
        const unixMs = (secs + 978307200) * 1000;
        return Number.isFinite(unixMs) ? new Date(unixMs).toISOString() : secs;
      }
      case 0x4: {
        const { len, next } = readLen(off + 1);
        return `<Data ${len} bytes: ${buf.subarray(next, Math.min(buf.length, next + Math.min(len, 24))).toString("hex")}>`;
      }
      case 0x5: {
        const { len, next } = readLen(off + 1);
        return buf.subarray(next, Math.min(buf.length, next + len)).toString("latin1");
      }
      case 0x6: {
        const { len, next } = readLen(off + 1);
        const raw = buf.subarray(next, Math.min(buf.length, next + len * 2));
        return Buffer.from(raw).swap16().toString("utf16le");
      }
      case 0x8: {
        const bytes = lo + 1;
        return { CF$UID: readUInt(off + 1, bytes) };
      }
      case 0xa:
      case 0xc: {
        const { len, next } = readLen(off + 1);
        visited.add(idx);
        const arr: unknown[] = [];
        for (let i = 0; i < Math.min(len, 500); i++) {
          const ref = readUInt(next + i * objectRefSize, objectRefSize);
          arr.push(decodeObj(ref, depth + 1));
        }
        visited.delete(idx);
        return arr;
      }
      case 0xd: {
        const { len, next } = readLen(off + 1);
        visited.add(idx);
        const obj: Record<string, unknown> = {};
        const valsStart = next + len * objectRefSize;
        for (let i = 0; i < Math.min(len, 500); i++) {
          const kRef = readUInt(next + i * objectRefSize, objectRefSize);
          const vRef = readUInt(valsStart + i * objectRefSize, objectRefSize);
          const k = String(decodeObj(kRef, depth + 1) ?? `key_${i}`);
          obj[k] = decodeObj(vRef, depth + 1);
        }
        visited.delete(idx);
        return obj;
      }
      default:
        return null;
    }
  };
  return decodeObj(topObject, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// RTF (Rich Text Format) Reader
// ---------------------------------------------------------------------------------------------------------------

export function parseRtfDocument(raw: string): { blocks: DocBlock[]; plainText: string; meta: Array<[string, string]> } {
  const skipDests = new Set([
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "datafield",
    "fldinst", "header", "footer", "headerl", "headerr", "footerl", "footerr",
    "Xmlns", "latentstyles", "rsidtbl", "generator", "themedata", "colorschememapping",
  ]);
  const meta: Array<[string, string]> = [];
  const infoMatch = /\{\\info\b([\s\S]{1,4000}?)\}/i.exec(raw);
  if (infoMatch) {
    const infoBody = infoMatch[1]!;
    for (const [tag, label] of [["title", "Title"], ["author", "Author"], ["subject", "Subject"], ["company", "Company"], ["operator", "Last saved by"]] as const) {
      const m = new RegExp(`\\{\\\\${tag}\\s+([^}]{1,200})\\}`, "i").exec(infoBody);
      if (m?.[1]?.trim()) meta.push([label, m[1].trim()]);
    }
  }
  const stack: Array<{ skip: boolean; uc: number }> = [];
  let skip = false;
  let uc = 1;
  let out = "";
  let i = 0;
  const len = Math.min(raw.length, 512 * 1024);

  while (i < len) {
    const ch = raw[i]!;
    if (ch === "{") {
      stack.push({ skip, uc });
      i++;
      if (raw[i] === "\\" && raw[i + 1] === "*") {
        skip = true;
        i += 2;
      }
      continue;
    }
    if (ch === "}") {
      const prev = stack.pop();
      if (prev) {
        skip = prev.skip;
        uc = prev.uc;
      }
      i++;
      continue;
    }
    if (ch === "\\") {
      i++;
      if (i >= len) break;
      const next = raw[i]!;
      if (next === "\\" || next === "{" || next === "}") {
        if (!skip) out += next;
        i++;
        continue;
      }
      if (next === "~") {
        if (!skip) out += "\u00a0";
        i++;
        continue;
      }
      if (next === "-") {
        i++;
        continue;
      }
      if (next === "\n" || next === "\r") {
        if (!skip) out += "\n";
        i++;
        continue;
      }
      if (next === "'") {
        const hex = raw.slice(i + 1, i + 3);
        if (!skip && /^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
        }
        i += 3;
        continue;
      }
      let word = "";
      while (i < len && /[a-zA-Z]/.test(raw[i]!)) word += raw[i++]!;
      let param = "";
      if (i < len && (raw[i] === "-" || /[0-9]/.test(raw[i]!))) {
        param += raw[i++]!;
        while (i < len && /[0-9]/.test(raw[i]!)) param += raw[i++]!;
      }
      if (i < len && raw[i] === " ") i++;
      const w = word.toLowerCase();
      if (skipDests.has(w)) {
        skip = true;
        continue;
      }
      if (w === "uc" && param) {
        uc = Math.max(0, Number(param));
        continue;
      }
      if (w === "u" && param) {
        let code = Number(param);
        if (code < 0) code += 65536;
        if (!skip && code > 0) out += String.fromCodePoint(code);
        for (let s = 0; s < uc && i < len; s++) {
          if (raw[i] === "\\") {
            if (raw[i + 1] === "'") i += 4;
            else {
              i++;
              while (i < len && /[a-zA-Z0-9-]/.test(raw[i]!)) i++;
              if (raw[i] === " ") i++;
            }
          } else if (raw[i] !== "{" && raw[i] !== "}") {
            i++;
          }
        }
        continue;
      }
      if (!skip) {
        if (w === "par" || (w === "pard" && !out.endsWith("\n")) || w === "sect" || w === "page" || w === "line" || w === "row") {
          out += "\n";
        } else if (w === "tab" || w === "cell") {
          out += "\t";
        } else if (w === "bullet") {
          out += "• ";
        } else if (w === "endash") {
          out += "–";
        } else if (w === "emdash") {
          out += "—";
        } else if (w === "lquote") {
          out += "‘";
        } else if (w === "rquote") {
          out += "’";
        } else if (w === "ldblquote") {
          out += "“";
        } else if (w === "rdblquote") {
          out += "”";
        }
      }
      continue;
    }
    if (ch !== "\r" && ch !== "\n") {
      if (!skip) out += ch;
    }
    i++;
  }

  const lines = out.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const blocks: DocBlock[] = [];
  for (const line of lines.slice(0, 400)) {
    if (line.startsWith("• ") || /^[-*]\s+/.test(line)) {
      blocks.push({ type: "li", text: line.replace(/^(?:•|[-*])\s+/, "") });
    } else if (line.length < 80 && /^[A-Z0-9][A-Za-z0-9\s,:—–-]{2,70}$/.test(line) && !line.endsWith(".")) {
      blocks.push({ type: blocks.length === 0 ? "h1" : "h2", text: line });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }
  const plainText = lines.join("\n\n");
  return { blocks, plainText, meta };
}

// ---------------------------------------------------------------------------------------------------------------
// Word (.docx), OpenDocument Text (.odt), Presentations (.pptx, .odp), E-Books (.epub, .fb2)
// ---------------------------------------------------------------------------------------------------------------

function parseDocxBlocks(xml: string): { blocks: DocBlock[]; plainText: string } {
  const blocks: DocBlock[] = [];
  const plainLines: string[] = [];
  const tokenRe = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(xml)) !== null && blocks.length < 400) {
    const chunk = m[0]!;
    if (chunk.startsWith("<w:tbl")) {
      const rows: string[][] = [];
      for (const tr of chunk.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const row: string[] = [];
        for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
          const cellText = [...tc[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
            .map((t) => decodeEntities(t[1]!))
            .join("")
            .trim();
          row.push(cellText);
        }
        if (row.some(Boolean)) rows.push(row);
      }
      if (rows.length) {
        blocks.push({ type: "table", rows });
        plainLines.push(rows.map((r) => r.join("\t")).join("\n"));
      }
    } else {
      const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(chunk)?.[1] ?? "";
      const isList = /<w:numPr\b/.test(chunk) || /List/i.test(style);
      const runs: string[] = [];
      for (const tok of chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)) {
        if (tok[0].startsWith("<w:tab")) runs.push("\t");
        else if (tok[0].startsWith("<w:br")) runs.push("\n");
        else runs.push(decodeEntities(tok[1] ?? ""));
      }
      const text = runs.join("").trim();
      if (!text) continue;
      plainLines.push(text);
      if (/^(?:Title|Heading1|1)$/i.test(style)) blocks.push({ type: "h1", text });
      else if (/^(?:Subtitle|Heading2|2)$/i.test(style)) blocks.push({ type: "h2", text });
      else if (/^Heading[3-6]$/i.test(style)) blocks.push({ type: "h3", text });
      else if (/Quote/i.test(style)) blocks.push({ type: "quote", text });
      else if (isList) blocks.push({ type: "li", text });
      else blocks.push({ type: "p", text });
    }
  }
  return { blocks, plainText: plainLines.join("\n\n") };
}

function parseOdtBlocks(xml: string): { blocks: DocBlock[]; plainText: string } {
  const blocks: DocBlock[] = [];
  const plainLines: string[] = [];
  const stripTags = (s: string) =>
    decodeEntities(
      s
        .replace(/<text:tab\b[^>]*\/>/g, "\t")
        .replace(/<text:line-break\b[^>]*\/>/g, "\n")
        .replace(/<[^>]+>/g, ""),
    ).trim();

  const tokenRe = /<table:table\b[\s\S]*?<\/table:table>|<text:h\b[^>]*>[\s\S]*?<\/text:h>|<text:p\b[^>]*>[\s\S]*?<\/text:p>/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(xml)) !== null && blocks.length < 400) {
    const chunk = m[0]!;
    if (chunk.startsWith("<table:table")) {
      const rows: string[][] = [];
      for (const tr of chunk.matchAll(/<table:table-row\b[\s\S]*?<\/table:table-row>/g)) {
        const row: string[] = [];
        for (const tc of tr[0].matchAll(/<table:table-cell\b[\s\S]*?<\/table:table-cell>/g)) {
          row.push(stripTags(tc[0]));
        }
        if (row.some(Boolean)) rows.push(row);
      }
      if (rows.length) {
        blocks.push({ type: "table", rows });
        plainLines.push(rows.map((r) => r.join("\t")).join("\n"));
      }
    } else if (chunk.startsWith("<text:h")) {
      const lvl = Number(/text:outline-level="(\d+)"/.exec(chunk)?.[1] ?? "1");
      const text = stripTags(chunk);
      if (text) {
        blocks.push({ type: lvl <= 1 ? "h1" : lvl === 2 ? "h2" : "h3", text });
        plainLines.push(text);
      }
    } else {
      const text = stripTags(chunk);
      if (text) {
        blocks.push({ type: "p", text });
        plainLines.push(text);
      }
    }
  }
  return { blocks, plainText: plainLines.join("\n\n") };
}

function parseHtmlToBlocks(xhtml: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  const clean = body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const re = /<(h[1-6]|p|li|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null && blocks.length < 250) {
    const tag = m[1]!.toLowerCase();
    const text = decodeEntities(m[2]!.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (tag === "h1") blocks.push({ type: "h1", text });
    else if (tag === "h2") blocks.push({ type: "h2", text });
    else if (tag.startsWith("h")) blocks.push({ type: "h3", text });
    else if (tag === "li") blocks.push({ type: "li", text });
    else if (tag === "blockquote") blocks.push({ type: "quote", text });
    else if (tag === "pre") blocks.push({ type: "code", text });
    else blocks.push({ type: "p", text });
  }
  if (!blocks.length) {
    const plain = decodeEntities(clean.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (plain) blocks.push({ type: "p", text: plain.slice(0, 4000) });
  }
  return blocks;
}

async function inspectZipBasedRich(handle: fsp.FileHandle, path: string, size: number, ext: string, hasThumb: boolean): Promise<RichPreview | null> {
  if (ext === "xlsx" || ext === "ods" || ext === "xlsm") {
    try {
      const wb = await readSpreadsheet(path);
      const docMeta = await zipDocument(handle, size, ext).catch(() => ({ groups: [], kind: "Spreadsheet" }));
      return {
        kind: "spreadsheet",
        formatLabel: ext === "ods" ? "OpenDocument Spreadsheet (ODS)" : "Excel Workbook (XLSX)",
        meta: flattenGroups(docMeta.groups),
        sheets: wb.slice(0, 20).map((s) => {
          const totalRows = s.rows.length;
          const totalCols = s.rows.reduce((m, r) => Math.max(m, r.length), 0);
          const headers = (s.rows[0] ?? []).slice(0, 50).map((c, i) => String(c || `Col ${i + 1}`));
          const rows = s.rows.slice(1, 201).map((r) => r.slice(0, 50).map((c) => String(c ?? "")));
          return { name: s.name, headers, rows, totalRows: Math.max(0, totalRows - 1), totalCols };
        }),
        hasThumb,
      };
    } catch {
      // fall through to generic zip inspection if malformed
    }
  }

  let entries: CentralEntry[];
  try {
    entries = await readCentralDirectory(handle, size);
  } catch {
    return null;
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const readPart = async (name: string, limit = 1024 * 1024): Promise<string> => {
    const e = byName.get(name);
    if (!e || e.isDir || (e.flags & 1) !== 0) return "";
    try {
      return (await readZipEntry(handle, size, e, limit)).toString("utf8");
    } catch {
      return "";
    }
  };

  const names = entries.map((e) => e.name);
  const docMeta = await zipDocument(handle, size, ext).catch(() => ({ groups: [], kind: "Zip archive" }));
  const meta = flattenGroups(docMeta.groups);

  // Word document (.docx / .docm)
  if (byName.has("word/document.xml")) {
    const xml = await readPart("word/document.xml", 2 * 1024 * 1024);
    const core = await readPart("docProps/core.xml", 256 * 1024);
    const { blocks, plainText } = parseDocxBlocks(xml);
    return {
      kind: "document",
      formatLabel: "Word Document (DOCX)",
      title: xmlText(core, "dc:title") || undefined,
      author: xmlText(core, "dc:creator") || undefined,
      meta,
      blocks,
      plainText,
      hasThumb,
    };
  }

  // PowerPoint presentation (.pptx / .ppsx)
  const slideNames = names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(/slide(\d+)\.xml/i.exec(a)?.[1] ?? 0);
      const nb = Number(/slide(\d+)\.xml/i.exec(b)?.[1] ?? 0);
      return na - nb;
    });
  if (slideNames.length > 0) {
    const slides: RichPresentationPreview["slides"] = [];
    for (const sName of slideNames.slice(0, 60)) {
      const num = Number(/slide(\d+)\.xml/i.exec(sName)?.[1] ?? slides.length + 1);
      const xml = await readPart(sName, 512 * 1024);
      let title = "";
      const bullets: string[] = [];
      for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
        const isTitle = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(sp[0]);
        const paras: string[] = [];
        for (const p of sp[0].matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
          const line = [...p[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
            .map((t) => decodeEntities(t[1]!))
            .join("")
            .trim();
          if (line) paras.push(line);
        }
        if (isTitle && !title && paras.length) {
          title = paras.join(" ");
        } else {
          bullets.push(...paras);
        }
      }
      if (!title && bullets.length) title = bullets.shift()!;
      const notesXml = await readPart(`ppt/notesSlides/notesSlide${num}.xml`, 256 * 1024);
      const notes = notesXml
        ? [...notesXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
            .map((t) => decodeEntities(t[1]!))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        : "";
      slides.push({ number: num, title: title || `Slide ${num}`, bullets, ...(notes ? { notes } : {}) });
    }
    const plainText = slides.map((s) => `[Slide ${s.number}: ${s.title}]\n${s.bullets.map((b) => `• ${b}`).join("\n")}`).join("\n\n");
    return {
      kind: "presentation",
      formatLabel: "PowerPoint Presentation (PPTX)",
      meta,
      slides,
      plainText,
      hasThumb,
    };
  }

  // OpenDocument Text (.odt) or Presentation (.odp)
  const mimetype = (await readPart("mimetype", 1024)).trim();
  if (byName.has("content.xml") && (mimetype.includes("opendocument") || ext === "odt" || ext === "odp")) {
    const contentXml = await readPart("content.xml", 2 * 1024 * 1024);
    const metaXml = await readPart("meta.xml", 256 * 1024);
    if (mimetype.includes("presentation") || ext === "odp" || contentXml.includes("<draw:page")) {
      const slides: RichPresentationPreview["slides"] = [];
      let idx = 1;
      for (const page of contentXml.matchAll(/<draw:page\b([\s\S]*?)<\/draw:page>/g)) {
        const pageAttr = page[1]!;
        const pageName = /draw:name="([^"]+)"/.exec(pageAttr)?.[1] ?? "";
        const paras = [...page[0].matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)]
          .map((p) => decodeEntities(p[1]!.replace(/<[^>]+>/g, "")).trim())
          .filter(Boolean);
        const title = paras.shift() || pageName || `Slide ${idx}`;
        slides.push({ number: idx++, title, bullets: paras });
      }
      const plainText = slides.map((s) => `[Slide ${s.number}: ${s.title}]\n${s.bullets.map((b) => `• ${b}`).join("\n")}`).join("\n\n");
      return {
        kind: "presentation",
        formatLabel: "OpenDocument Presentation (ODP)",
        meta,
        slides,
        plainText,
        hasThumb,
      };
    }
    const { blocks, plainText } = parseOdtBlocks(contentXml);
    return {
      kind: "document",
      formatLabel: "OpenDocument Text (ODT)",
      title: xmlText(metaXml, "dc:title") || undefined,
      author: xmlText(metaXml, "dc:creator") || xmlText(metaXml, "meta:initial-creator") || undefined,
      meta,
      blocks,
      plainText,
      hasThumb,
    };
  }

  // EPUB E-Book (.epub)
  if (mimetype === "application/epub+zip" || byName.has("META-INF/container.xml") || ext === "epub") {
    const containerXml = await readPart("META-INF/container.xml", 64 * 1024);
    const rootPath = xmlAttr(containerXml, "rootfile", "full-path");
    const opf = rootPath ? await readPart(rootPath, 512 * 1024) : "";
    const opfDir = rootPath && rootPath.includes("/") ? rootPath.slice(0, rootPath.lastIndexOf("/") + 1) : "";
    const manifest = new Map<string, string>();
    for (const item of opf.matchAll(/<item\b([^>]+)\/?>/g)) {
      const id = /\bid="([^"]+)"/.exec(item[1]!)?.[1];
      const href = /\bhref="([^"]+)"/.exec(item[1]!)?.[1];
      if (id && href) manifest.set(id, decodeEntities(href));
    }
    const spineIds = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map((m) => m[1]!);
    const chapters: Array<{ title: string; blocks: DocBlock[] }> = [];
    const allBlocks: DocBlock[] = [];
    for (const idref of spineIds.slice(0, 12)) {
      const href = manifest.get(idref);
      if (!href) continue;
      const entryPath = nodePath.posix.normalize(opfDir + href.split("#")[0]!);
      const xhtml = await readPart(entryPath, 512 * 1024);
      if (!xhtml) continue;
      const cBlocks = parseHtmlToBlocks(xhtml);
      if (!cBlocks.length) continue;
      const firstHeading = cBlocks.find((b) => b.type === "h1" || b.type === "h2");
      const chTitle = (firstHeading && "text" in firstHeading ? firstHeading.text : "") || xmlText(xhtml, "title") || `Chapter ${chapters.length + 1}`;
      chapters.push({ title: chTitle, blocks: cBlocks });
      allBlocks.push(...cBlocks);
    }
    const plainText = allBlocks
      .map((b) => (b.type === "table" ? b.rows.map((r) => r.join("\t")).join("\n") : b.text))
      .join("\n\n");
    return {
      kind: "document",
      formatLabel: "E-Book (EPUB)",
      title: xmlText(opf, "dc:title") || undefined,
      author: xmlText(opf, "dc:creator") || undefined,
      meta,
      blocks: allBlocks.slice(0, 300),
      chapters,
      plainText,
      hasThumb,
    };
  }

  // Generic ZIP / JAR / APK / WHL / CBZ archive
  let uncompressed = 0;
  let compressed = 0;
  let files = 0;
  let folders = 0;
  let encrypted = 0;
  for (const e of entries) {
    if (e.isDir) folders++;
    else {
      files++;
      uncompressed += e.usize;
      compressed += e.csize;
      if (e.flags & 1) encrypted++;
    }
  }
  return {
    kind: "archive",
    formatLabel: docMeta.kind || "ZIP Archive",
    meta,
    totalEntries: entries.length,
    files,
    folders,
    uncompressed,
    compressed,
    encrypted,
    entries: entries.slice(0, 400).map((e) => ({
      name: e.name,
      size: e.usize,
      packed: e.csize,
      dir: e.isDir,
      encrypted: (e.flags & 1) !== 0,
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// PDF Text & Metadata Extraction
// ---------------------------------------------------------------------------------------------------------------

function extractPdfStreamsText(rawLatin1: string): { text: string; outline: string[] } {
  const outline: string[] = [];
  const pieces: string[] = [];

  const extractBtEt = (streamContent: string) => {
    for (const bt of streamContent.matchAll(/\bBT\b([\s\S]{1,65536}?)\bET\b/g)) {
      const block = bt[1]!;
      const lineParts: string[] = [];
      const tokRe = /\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")|<[0-9a-fA-F\s]+>\s*Tj|\[([\s\S]*?)\]\s*TJ|\b(?:Td|TD|T\*)\b/g;
      let m: RegExpExecArray | null;
      while ((m = tokRe.exec(block)) !== null) {
        const tok = m[0]!;
        if (tok === "Td" || tok === "TD" || tok === "T*") {
          lineParts.push("\n");
        } else if (m[1] !== undefined) {
          const arr = m[1]!;
          for (const sub of arr.matchAll(/\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>|-?\d+(?:\.\d+)?/g)) {
            const st = sub[0]!;
            if (st.startsWith("(") || st.startsWith("<")) {
              lineParts.push(pdfString(st));
            } else if (Number(st) < -180) {
              lineParts.push(" ");
            }
          }
        } else {
          const strEnd = tok.lastIndexOf(")");
          const hexEnd = tok.lastIndexOf(">");
          const rawLit = strEnd > 0 ? tok.slice(0, strEnd + 1) : hexEnd > 0 ? tok.slice(0, hexEnd + 1) : tok;
          lineParts.push(pdfString(rawLit));
          if (tok.endsWith("'") || tok.endsWith('"')) lineParts.push("\n");
        }
      }
      const joined = lineParts.join("").replace(/[ \t]+/g, " ").trim();
      if (joined) pieces.push(joined);
    }
  };

  extractBtEt(rawLatin1);

  let at = 0;
  let inflatedCount = 0;
  while (inflatedCount < 80 && pieces.join("\n").length < 32_000) {
    const sIdx = rawLatin1.indexOf("stream", at);
    if (sIdx < 0) break;
    at = sIdx + 6;
    const prevCh = rawLatin1[sIdx - 1] ?? "";
    if (/[a-zA-Z]/.test(prevCh)) continue;
    let dataStart = sIdx + 6;
    if (rawLatin1[dataStart] === "\r" && rawLatin1[dataStart + 1] === "\n") dataStart += 2;
    else if (rawLatin1[dataStart] === "\n" || rawLatin1[dataStart] === "\r") dataStart += 1;
    else continue;
    const eIdx = rawLatin1.indexOf("endstream", dataStart);
    if (eIdx < 0) break;
    at = eIdx + 9;
    let dataEnd = eIdx;
    if (rawLatin1[dataEnd - 1] === "\n") dataEnd--;
    if (rawLatin1[dataEnd - 1] === "\r") dataEnd--;
    if (dataEnd <= dataStart || dataEnd - dataStart > 2 * 1024 * 1024) continue;
    const dictSlice = rawLatin1.slice(Math.max(0, sIdx - 300), sIdx);
    if (!/\/FlateDecode\b/.test(dictSlice)) continue;
    const rawBuf = Buffer.from(rawLatin1.slice(dataStart, dataEnd), "latin1");
    let inflated: Buffer | null = null;
    try {
      inflated = inflateSync(rawBuf, { maxOutputLength: 2 * 1024 * 1024 });
    } catch {
      try {
        inflated = inflateRawSync(rawBuf, { maxOutputLength: 2 * 1024 * 1024 });
      } catch {
        inflated = null;
      }
    }
    if (inflated) {
      inflatedCount++;
      extractBtEt(inflated.toString("latin1"));
    }
  }

  for (const m of rawLatin1.matchAll(/\/Title\s*(\((?:\\.|[^\\()])*\)|<[0-9a-fA-F]+>)/g)) {
    const t = pdfString(m[1]!).trim();
    if (t && !outline.includes(t) && outline.length < 60) outline.push(t);
  }

  return { text: pieces.join("\n\n").slice(0, 32_000), outline };
}

async function inspectPdfRich(src: Source, hasThumb: boolean): Promise<RichPdfPreview> {
  const info = await parsePdf(src);
  const groups = pdfGroups(info);
  const headBuf = await src.read(0, Math.min(src.size, 4 * 1024 * 1024));
  const { text: extractedText, outline } = extractPdfStreamsText(headBuf.toString("latin1"));
  return {
    kind: "pdf",
    formatLabel: `PDF Document${info.version ? ` (v${info.version})` : ""}`,
    pages: info.pages,
    pageSize: info.pageSize,
    version: info.version,
    encrypted: info.encrypted,
    meta: flattenGroups(groups),
    flags: info.flags,
    outline,
    extractedText,
    hasThumb,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// SQLite Rich Table & Sample Row Inspector
// ---------------------------------------------------------------------------------------------------------------

async function inspectSqliteRich(src: Source, path: string): Promise<RichSqlitePreview> {
  const base = await sqliteInfo(src).catch(() => ({ groups: [], kind: "SQLite database" }));
  const meta = flattenGroups(base.groups);
  const tables: RichSqlitePreview["tables"] = [];
  let db: Database | null = null;
  try {
    db = new Database(path, { readonly: true });
    const master = db
      .query("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type ASC, name ASC LIMIT 25")
      .all() as Array<{ name: string; type: "table" | "view"; sql?: string }>;
    for (const item of master) {
      const safeIdent = `"${item.name.replace(/"/g, '""')}"`;
      let rowCount = 0;
      try {
        const c = db.query(`SELECT COUNT(*) AS n FROM ${safeIdent}`).get() as { n?: number } | null;
        rowCount = Number(c?.n ?? 0);
      } catch {}
      let columns: Array<{ name: string; type: string; pk: boolean; notnull: boolean }> = [];
      try {
        const cols = db.query(`PRAGMA table_info(${safeIdent})`).all() as Array<{ name: string; type: string; pk: number; notnull: number }>;
        columns = cols.map((col) => ({
          name: String(col.name),
          type: String(col.type || "ANY"),
          pk: Boolean(col.pk),
          notnull: Boolean(col.notnull),
        }));
      } catch {}
      const rows: string[][] = [];
      try {
        const rawRows = db.query(`SELECT * FROM ${safeIdent} LIMIT 50`).all() as Array<Record<string, unknown>>;
        if (!columns.length && rawRows[0]) {
          columns = Object.keys(rawRows[0]).map((k) => ({ name: k, type: "ANY", pk: false, notnull: false }));
        }
        for (const r of rawRows) {
          rows.push(
            columns.map((c) => {
              const v = r[c.name];
              if (v === null || v === undefined) return "—";
              if (v instanceof Uint8Array || Buffer.isBuffer(v)) return `<BLOB ${v.byteLength} B>`;
              return clip(String(v), 200);
            }),
          );
        }
      } catch {}
      tables.push({
        name: item.name,
        type: item.type,
        rowCount,
        columns,
        rows,
        ...(item.sql ? { sql: item.sql } : {}),
      });
    }
  } catch {
    // Fallback to header-only metadata when locked or corrupt
  } finally {
    try { db?.close(); } catch {}
  }
  return {
    kind: "sqlite",
    formatLabel: "SQLite Database",
    meta,
    tables,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Subtitles (.srt, .vtt, .sbv, .ass, .ssa, .lrc) & Playlists (.m3u, .m3u8, .pls, .xspf)
// ---------------------------------------------------------------------------------------------------------------

export function parseSubtitlesRich(text: string, ext: string): RichSubtitlesPreview {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const cues: RichSubtitlesPreview["cues"] = [];
  const meta: Array<[string, string]> = [];

  if (ext === "lrc") {
    for (const m of clean.matchAll(/^\[(ti|ar|al|by|offset):([^\]]*)\]/gim)) {
      const labels: Record<string, string> = { ti: "Title", ar: "Artist", al: "Album", by: "Creator", offset: "Offset (ms)" };
      if (m[2]?.trim()) meta.push([labels[m[1]!.toLowerCase()] ?? m[1]!, m[2].trim()]);
    }
    for (const line of clean.split("\n")) {
      const m = /^\[(\d{1,3}:\d{2}(?:\.\d{1,3})?)\](.*)$/.exec(line.trim());
      if (m) {
        cues.push({ index: cues.length + 1, start: m[1]!, end: "", text: m[2]!.trim() || "♪" });
      }
    }
  } else if (ext === "ass" || ext === "ssa") {
    for (const line of clean.split("\n")) {
      if (/^Title:/i.test(line)) meta.push(["Title", line.slice(6).trim()]);
      else if (/^PlayResX:/i.test(line)) meta.push(["Resolution X", line.slice(9).trim()]);
      else if (/^PlayResY:/i.test(line)) meta.push(["Resolution Y", line.slice(9).trim()]);
      const d = /^Dialogue:\s*[^,]*,([^,]+),([^,]+),[^,]*,([^,]*),[^,]*,[^,]*,[^,]*,[^,]*,(.*)$/i.exec(line);
      if (d) {
        const cueText = d[4]!.replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").trim();
        if (cueText) {
          cues.push({
            index: cues.length + 1,
            start: d[1]!.trim(),
            end: d[2]!.trim(),
            ...(d[3]?.trim() ? { speaker: d[3].trim() } : {}),
            text: cueText,
          });
        }
      }
    }
  } else {
    const blocks = clean.split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length || lines[0]!.startsWith("WEBVTT") || lines[0]!.startsWith("NOTE")) continue;
      let timeLineIdx = lines.findIndex((l) => l.includes("-->") || /^\d+:\d{2}:\d{2}\.\d+,\d+:\d{2}:\d{2}\.\d+$/.test(l));
      if (timeLineIdx < 0) continue;
      const timeLine = lines[timeLineIdx]!;
      let start = "", end = "";
      if (timeLine.includes("-->")) {
        const parts = timeLine.split("-->");
        start = parts[0]!.trim();
        end = (parts[1] ?? "").trim().split(/\s+/)[0] ?? "";
      } else {
        const parts = timeLine.split(",");
        start = parts[0]!.trim();
        end = (parts[1] ?? "").trim();
      }
      const cueText = lines.slice(timeLineIdx + 1).join("\n").replace(/<[^>]+>/g, "").trim();
      if (cueText) cues.push({ index: cues.length + 1, start, end, text: cueText });
    }
  }

  meta.unshift(["Cues", String(cues.length)]);
  if (cues.length) {
    meta.push(["First cue", cues[0]!.start]);
    meta.push(["Last cue", cues[cues.length - 1]!.end || cues[cues.length - 1]!.start]);
  }
  const labels: Record<string, string> = {
    srt: "SubRip Subtitles (SRT)",
    vtt: "WebVTT Subtitles (VTT)",
    ass: "Advanced SubStation Alpha (ASS)",
    ssa: "SubStation Alpha (SSA)",
    sbv: "YouTube Subtitles (SBV)",
    lrc: "Synced Lyrics (LRC)",
  };
  return {
    kind: "subtitles",
    formatLabel: labels[ext] ?? "Subtitles / Captions",
    meta,
    cues: cues.slice(0, 300),
    totalCues: cues.length,
  };
}

export function parsePlaylistRich(text: string, ext: string): RichPlaylistPreview {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const tracks: RichPlaylistPreview["tracks"] = [];
  const meta: Array<[string, string]> = [];
  const isHls = lines.some((l) => l.startsWith("#EXT-X-VERSION") || l.startsWith("#EXT-X-TARGETDURATION") || l.startsWith("#EXT-X-STREAM-INF"));

  if (ext === "pls") {
    const titles = new Map<string, string>();
    const files = new Map<string, string>();
    const lengths = new Map<string, string>();
    for (const line of lines) {
      const m = /^(File|Title|Length)(\d+)=(.*)$/i.exec(line);
      if (!m) continue;
      const [, k, idx, val] = m;
      if (k!.toLowerCase() === "file") files.set(idx!, val!);
      else if (k!.toLowerCase() === "title") titles.set(idx!, val!);
      else if (k!.toLowerCase() === "length") lengths.set(idx!, val!);
    }
    for (const [idx, path] of files) {
      const secs = Number(lengths.get(idx) ?? -1);
      tracks.push({
        index: tracks.length + 1,
        title: titles.get(idx) || nodePath.basename(path),
        ...(secs > 0 ? { duration: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` } : {}),
        path,
      });
    }
  } else {
    let pendingTitle = "";
    let pendingDur = "";
    for (const line of lines) {
      if (line.startsWith("#EXTINF:")) {
        const m = /^#EXTINF:(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line);
        if (m) {
          const secs = Math.round(Number(m[1]));
          pendingDur = secs > 0 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "";
          pendingTitle = m[2]!.trim();
        }
      } else if (line.startsWith("#EXT-X-")) {
        const kv = /^#(EXT-X-[A-Z0-9-]+):(.*)$/.exec(line);
        if (kv && meta.length < 10) meta.push([kv[1]!, clip(kv[2]!, 100)]);
      } else if (!line.startsWith("#")) {
        tracks.push({
          index: tracks.length + 1,
          title: pendingTitle || nodePath.basename(line),
          ...(pendingDur ? { duration: pendingDur } : {}),
          path: line,
        });
        pendingTitle = "";
        pendingDur = "";
      }
    }
  }
  meta.unshift(["Tracks / segments", String(tracks.length)]);
  return {
    kind: "playlist",
    formatLabel: isHls ? "HLS Media Playlist (M3U8)" : ext === "pls" ? "Audio Playlist (PLS)" : "Media Playlist (M3U)",
    meta,
    tracks: tracks.slice(0, 300),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Calendars (.ics) & Contacts (.vcf)
// ---------------------------------------------------------------------------------------------------------------

function unfoldIcsLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function formatIcsDate(raw: string): string {
  const v = raw.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return v;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return date;
  return `${date} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}${m[7] ? " UTC" : ""}`;
}

export function parseCalendarRich(text: string): RichCalendarPreview {
  const lines = unfoldIcsLines(text);
  const events: RichCalendarPreview["events"] = [];
  const meta: Array<[string, string]> = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^BEGIN:(VEVENT|VTODO)$/i.test(trimmed)) {
      cur = {};
      continue;
    }
    if (/^END:(VEVENT|VTODO)$/i.test(trimmed)) {
      if (cur) {
        events.push({
          summary: cur.SUMMARY || "(Untitled event)",
          start: formatIcsDate(cur.DTSTART || ""),
          ...(cur.DTEND ? { end: formatIcsDate(cur.DTEND) } : {}),
          ...(cur.LOCATION ? { location: cur.LOCATION } : {}),
          ...(cur.ORGANIZER ? { organizer: cur.ORGANIZER.replace(/^mailto:/i, "") } : {}),
          ...(cur.STATUS ? { status: cur.STATUS } : {}),
          ...(cur.DESCRIPTION ? { description: cur.DESCRIPTION.replace(/\\n/gi, "\n").replace(/\\,/g, ",") } : {}),
        });
      }
      cur = null;
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const rawKey = trimmed.slice(0, colon);
    const key = rawKey.split(";")[0]!.toUpperCase();
    const val = trimmed.slice(colon + 1).trim();
    if (cur) {
      cur[key] = val;
    } else if (key === "X-WR-CALNAME") {
      meta.push(["Calendar name", val]);
    } else if (key === "PRODID") {
      meta.push(["Created by", val]);
    } else if (key === "X-WR-TIMEZONE") {
      meta.push(["Timezone", val]);
    }
  }
  meta.unshift(["Events", String(events.length)]);
  return {
    kind: "calendar",
    formatLabel: "iCalendar Schedule (ICS)",
    meta,
    events: events.slice(0, 200),
  };
}

export function parseContactRich(text: string): RichContactPreview {
  const lines = unfoldIcsLines(text);
  const contacts: RichContactPreview["contacts"] = [];
  let cur: RichContactPreview["contacts"][number] | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      cur = { fullName: "", phones: [], emails: [], addresses: [] };
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      if (cur) {
        if (!cur.fullName) cur.fullName = cur.emails[0] || cur.phones[0] || "Contact";
        contacts.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const rawKey = trimmed.slice(0, colon);
    const key = rawKey.split(";")[0]!.toUpperCase();
    const val = trimmed.slice(colon + 1).replace(/\\;/g, ";").replace(/\\n/gi, ", ").trim();
    if (!val) continue;
    if (key === "FN") cur.fullName = val;
    else if (key === "N" && !cur.fullName) cur.fullName = val.split(";").filter(Boolean).reverse().join(" ");
    else if (key === "ORG") cur.org = val.replace(/;/g, " · ");
    else if (key === "TITLE") cur.title = val;
    else if (key === "TEL") cur.phones.push(val);
    else if (key === "EMAIL") cur.emails.push(val);
    else if (key === "ADR") cur.addresses.push(val.split(";").filter(Boolean).join(", "));
    else if (key === "URL") cur.url = val;
    else if (key === "NOTE") cur.note = val;
  }
  return {
    kind: "contact",
    formatLabel: "vCard Address Book (VCF)",
    meta: [["Contacts", String(contacts.length)]],
    contacts: contacts.slice(0, 200),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Certificates & Keys (.pem, .crt, .cer, .der, .csr, .pub, .asc)
// ---------------------------------------------------------------------------------------------------------------

function extractDerReadableStrings(der: Buffer): Array<[string, string]> {
  const details: Array<[string, string]> = [];
  const strings: string[] = [];
  const dates: string[] = [];
  for (let i = 0; i < der.length - 4; i++) {
    const tag = der[i]!;
    const len = der[i + 1]!;
    if ((tag === 0x0c || tag === 0x13 || tag === 0x16) && len >= 2 && len <= 120 && i + 2 + len <= der.length) {
      const s = der.subarray(i + 2, i + 2 + len).toString("utf8");
      if (/^[\x20-\x7e]+$/.test(s)) {
        strings.push(s);
        i += 1 + len;
      }
    } else if ((tag === 0x17 || tag === 0x18) && len >= 10 && len <= 20 && i + 2 + len <= der.length) {
      const d = der.subarray(i + 2, i + 2 + len).toString("ascii");
      if (/^\d{10,14}Z$/.test(d)) {
        const yr = d.length >= 15 ? d.slice(0, 4) : Number(d.slice(0, 2)) >= 50 ? `19${d.slice(0, 2)}` : `20${d.slice(0, 2)}`;
        const rest = d.length >= 15 ? d.slice(4) : d.slice(2);
        dates.push(`${yr}-${rest.slice(0, 2)}-${rest.slice(2, 4)} ${rest.slice(4, 6)}:${rest.slice(6, 8)} UTC`);
        i += 1 + len;
      }
    }
  }
  if (dates[0]) details.push(["Valid from", dates[0]]);
  if (dates[1]) details.push(["Valid until", dates[1]]);
  const uniqueStrings = [...new Set(strings)].slice(0, 12);
  if (uniqueStrings.length) details.push(["Subject / Issuer fields", uniqueStrings.join(" · ")]);
  return details;
}

export function parseCertificateRich(buf: Buffer, text: string, ext: string): RichCertificatePreview {
  const blocks: RichCertificatePreview["blocks"] = [];
  if (ext === "pub" || /^(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+)\s+/i.test(text.trim())) {
    for (const line of text.split(/\r?\n/)) {
      const m = /^(ssh-\S+|ecdsa-\S+)\s+([A-Za-z0-9+/=]+)(?:\s+(.*))?$/.exec(line.trim());
      if (!m) continue;
      const raw = Buffer.from(m[2]!, "base64");
      const sha256 = createHash("sha256").update(raw).digest("base64").replace(/=+$/, "");
      const sha1 = createHash("sha1").update(raw).digest("hex");
      blocks.push({
        label: `SSH Public Key (${m[1]})`,
        bytes: raw.length,
        sha256: `SHA256:${sha256}`,
        sha1,
        details: [
          ["Algorithm", m[1]!],
          ...(m[3] ? [["Comment", m[3].trim()] as [string, string]] : []),
        ],
      });
    }
  }
  for (const m of text.matchAll(/-----BEGIN ([A-Z0-9 -]+)-----([\s\S]*?)-----END \1-----/g)) {
    const label = m[1]!;
    const b64 = m[2]!.replace(/\s+/g, "");
    const der = Buffer.from(b64, "base64");
    const sha256 = createHash("sha256").update(der).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? "";
    const sha1 = createHash("sha1").update(der).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? "";
    blocks.push({
      label,
      bytes: der.length,
      sha256,
      sha1,
      details: extractDerReadableStrings(der),
    });
  }
  if (!blocks.length && buf.length > 16 && buf[0] === 0x30) {
    const sha256 = createHash("sha256").update(buf).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? "";
    const sha1 = createHash("sha1").update(buf).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? "";
    blocks.push({
      label: "DER Certificate / ASN.1 Structure",
      bytes: buf.length,
      sha256,
      sha1,
      details: extractDerReadableStrings(buf),
    });
  }
  return {
    kind: "certificate",
    formatLabel: "Cryptographic Certificate / Key",
    meta: [["Blocks", String(blocks.length)]],
    blocks,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 3D Models (.obj, .stl, .ply, .gltf, .glb)
// ---------------------------------------------------------------------------------------------------------------

function normalizeWireframe(verts: Array<[number, number, number]>, rawEdges: Array<[number, number]>): {
  vertices: Array<[number, number, number]>;
  edges: Array<[number, number]>;
  boundsText: string;
} {
  if (!verts.length) return { vertices: [], edges: [], boundsText: "" };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of verts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  const maxSpan = Math.max(dx, dy, dz, 1e-6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const maxVerts = 1200;
  const stride = Math.max(1, Math.floor(verts.length / maxVerts));
  const normVerts: Array<[number, number, number]> = [];
  const indexMap = new Map<number, number>();
  for (let i = 0; i < verts.length && normVerts.length < maxVerts; i += stride) {
    const [x, y, z] = verts[i]!;
    indexMap.set(i, normVerts.length);
    normVerts.push([
      Math.round(((x - cx) / maxSpan) * 2000) / 1000,
      Math.round(((y - cy) / maxSpan) * 2000) / 1000,
      Math.round(((z - cz) / maxSpan) * 2000) / 1000,
    ]);
  }
  const edges: Array<[number, number]> = [];
  for (const [a, b] of rawEdges) {
    const ma = indexMap.get(a);
    const mb = indexMap.get(b);
    if (ma !== undefined && mb !== undefined && ma !== mb) {
      edges.push([ma, mb]);
      if (edges.length >= 1000) break;
    }
  }
  const fmt = (n: number) => Math.round(n * 100) / 100;
  return {
    vertices: normVerts,
    edges,
    boundsText: `${fmt(dx)} × ${fmt(dy)} × ${fmt(dz)}`,
  };
}

export function parseModel3dRich(buf: Buffer, text: string, ext: string): RichModel3dPreview {
  const verts: Array<[number, number, number]> = [];
  const rawEdges: Array<[number, number]> = [];
  const meta: Array<[string, string]> = [];
  let totalVerts = 0;
  let totalFaces = 0;
  let normals = 0;
  let uvs = 0;
  const objects: string[] = [];

  if (ext === "obj") {
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (s.startsWith("v ")) {
        totalVerts++;
        const parts = s.slice(2).trim().split(/\s+/).map(Number);
        if (parts.length >= 3 && parts.every(Number.isFinite) && verts.length < 5000) {
          verts.push([parts[0]!, parts[1]!, parts[2]!]);
        }
      } else if (s.startsWith("vn ")) {
        normals++;
      } else if (s.startsWith("vt ")) {
        uvs++;
      } else if (s.startsWith("o ") || s.startsWith("g ")) {
        const name = s.slice(2).trim();
        if (name && objects.length < 10 && !objects.includes(name)) objects.push(name);
      } else if (s.startsWith("f ")) {
        totalFaces++;
        if (rawEdges.length < 3000) {
          const idxList = s
            .slice(2)
            .trim()
            .split(/\s+/)
            .map((tok) => Number(tok.split("/")[0]) - 1)
            .filter((n) => n >= 0 && n < verts.length);
          for (let i = 0; i < idxList.length; i++) {
            rawEdges.push([idxList[i]!, idxList[(i + 1) % idxList.length]!]);
          }
        }
      }
    }
    meta.push(["Vertices", totalVerts.toLocaleString("en-US")], ["Faces", totalFaces.toLocaleString("en-US")]);
    if (normals) meta.push(["Normals", normals.toLocaleString("en-US")]);
    if (uvs) meta.push(["UV coordinates", uvs.toLocaleString("en-US")]);
    if (objects.length) meta.push(["Objects / groups", objects.join(", ")]);
  } else if (ext === "stl") {
    const isAscii = text.trimStart().startsWith("solid") && text.includes("facet") && text.includes("vertex");
    if (isAscii) {
      let tri: number[] = [];
      for (const m of text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)) {
        const idx = verts.length;
        verts.push([Number(m[1]), Number(m[2]), Number(m[3])]);
        tri.push(idx);
        if (tri.length === 3) {
          totalFaces++;
          rawEdges.push([tri[0]!, tri[1]!], [tri[1]!, tri[2]!], [tri[2]!, tri[0]!]);
          tri = [];
        }
      }
      totalVerts = verts.length;
    } else if (buf.length >= 84) {
      totalFaces = buf.readUInt32LE(80);
      totalVerts = totalFaces * 3;
      const maxTri = Math.min(totalFaces, 600);
      for (let i = 0; i < maxTri && 84 + (i + 1) * 50 <= buf.length; i++) {
        const off = 84 + i * 50 + 12;
        const base = verts.length;
        for (let v = 0; v < 3; v++) {
          const vo = off + v * 12;
          verts.push([buf.readFloatLE(vo), buf.readFloatLE(vo + 4), buf.readFloatLE(vo + 8)]);
        }
        rawEdges.push([base, base + 1], [base + 1, base + 2], [base + 2, base]);
      }
    }
    meta.push(["Triangles", totalFaces.toLocaleString("en-US")], ["Vertices", totalVerts.toLocaleString("en-US")]);
  } else if (ext === "ply") {
    const endHdr = text.indexOf("end_header");
    const hdr = endHdr >= 0 ? text.slice(0, endHdr) : text.slice(0, 2000);
    totalVerts = Number(/element\s+vertex\s+(\d+)/i.exec(hdr)?.[1] ?? 0);
    totalFaces = Number(/element\s+face\s+(\d+)/i.exec(hdr)?.[1] ?? 0);
    const fmt = /format\s+(\S+)/i.exec(hdr)?.[1] ?? "ascii";
    meta.push(["Format", fmt], ["Vertices", totalVerts.toLocaleString("en-US")], ["Faces", totalFaces.toLocaleString("en-US")]);
    if (fmt === "ascii" && endHdr >= 0) {
      const bodyLines = text.slice(endHdr + 10).trim().split(/\r?\n/);
      for (let i = 0; i < Math.min(totalVerts, bodyLines.length, 2000); i++) {
        const nums = bodyLines[i]!.trim().split(/\s+/).map(Number);
        if (nums.length >= 3 && nums.every(Number.isFinite)) verts.push([nums[0]!, nums[1]!, nums[2]!]);
      }
      for (let i = totalVerts; i < Math.min(totalVerts + totalFaces, bodyLines.length, totalVerts + 1000); i++) {
        const nums = bodyLines[i]!.trim().split(/\s+/).map(Number);
        const cnt = nums[0] ?? 0;
        if (cnt >= 3 && nums.length >= cnt + 1) {
          for (let k = 1; k <= cnt; k++) {
            rawEdges.push([nums[k]!, nums[k === cnt ? 1 : k + 1]!]);
          }
        }
      }
    }
  } else if (ext === "gltf" || ext === "glb") {
    let jsonStr = text;
    if (ext === "glb" && buf.length >= 20 && buf.readUInt32LE(0) === 0x46546c67) {
      const chunkLen = buf.readUInt32LE(12);
      const chunkType = buf.readUInt32LE(16);
      if (chunkType === 0x4e4f534a && 20 + chunkLen <= buf.length) {
        jsonStr = buf.subarray(20, 20 + chunkLen).toString("utf8");
      }
    }
    try {
      const gltf = JSON.parse(jsonStr);
      meta.push(["glTF version", String(gltf.asset?.version ?? "2.0")]);
      if (gltf.asset?.generator) meta.push(["Generator", String(gltf.asset.generator)]);
      meta.push(["Meshes", String((gltf.meshes ?? []).length)]);
      meta.push(["Nodes", String((gltf.nodes ?? []).length)]);
      meta.push(["Materials", String((gltf.materials ?? []).length)]);
      meta.push(["Animations", String((gltf.animations ?? []).length)]);
    } catch {}
  }

  const { vertices, edges, boundsText } = normalizeWireframe(verts, rawEdges);
  if (boundsText) meta.push(["Bounding box", boundsText]);
  const labels: Record<string, string> = {
    obj: "Wavefront 3D Object (OBJ)",
    stl: "Stereolithography 3D Mesh (STL)",
    ply: "Polygon 3D Mesh (PLY)",
    gltf: "glTF 3D Scene (GLTF)",
    glb: "Binary glTF 3D Scene (GLB)",
  };
  return {
    kind: "model3d",
    formatLabel: labels[ext] ?? "3D Model",
    meta,
    vertices,
    edges,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Jupyter Notebook (.ipynb), Diff (.diff/.patch), Log (.log)
// ---------------------------------------------------------------------------------------------------------------

export function parseNotebookRich(text: string): RichNotebookPreview | null {
  try {
    const nb = JSON.parse(text);
    if (!nb || typeof nb !== "object" || !Array.isArray(nb.cells)) return null;
    const kernel = nb.metadata?.kernelspec?.display_name || nb.metadata?.kernelspec?.name || "";
    const lang = nb.metadata?.language_info?.name || "python";
    const meta: Array<[string, string]> = [
      ["Cells", String(nb.cells.length)],
      ["Language", String(lang)],
      ...(kernel ? [["Kernel", String(kernel)] as [string, string]] : []),
      ["Notebook format", `v${nb.nbformat ?? 4}.${nb.nbformat_minor ?? 0}`],
    ];
    const joinLines = (v: unknown): string => (Array.isArray(v) ? v.map(String).join("") : typeof v === "string" ? v : "");
    const cells: RichNotebookPreview["cells"] = nb.cells.slice(0, 150).map((c: any, idx: number) => {
      const cellType = c.cell_type === "markdown" ? "markdown" : c.cell_type === "code" ? "code" : "raw";
      const outputs: NonNullable<RichNotebookPreview["cells"][number]["outputs"]> = [];
      if (Array.isArray(c.outputs)) {
        for (const o of c.outputs.slice(0, 10)) {
          if (o.output_type === "stream") {
            outputs.push({ kind: "text", text: joinLines(o.text).slice(0, 4000) });
          } else if (o.output_type === "error") {
            outputs.push({ kind: "error", text: `${o.ename || "Error"}: ${o.evalue || ""}\n${joinLines(o.traceback).replace(/\x1b\[[0-9;]*m/g, "")}`.slice(0, 4000) });
          } else if (o.data && typeof o.data === "object") {
            if (o.data["image/png"]) {
              const b64 = joinLines(o.data["image/png"]).replace(/\s+/g, "");
              outputs.push({ kind: "image", mime: "image/png", dataUrl: `data:image/png;base64,${b64}` });
            } else if (o.data["text/plain"]) {
              outputs.push({ kind: "text", text: joinLines(o.data["text/plain"]).slice(0, 4000) });
            }
          }
        }
      }
      return {
        index: idx + 1,
        cellType,
        executionCount: typeof c.execution_count === "number" ? c.execution_count : null,
        source: joinLines(c.source),
        ...(outputs.length ? { outputs } : {}),
      };
    });
    return {
      kind: "notebook",
      formatLabel: `Jupyter Notebook (${lang})`,
      meta,
      cells,
    };
  } catch {
    return null;
  }
}

export function parseDiffRich(text: string): RichDiffPreview {
  const files: RichDiffPreview["files"] = [];
  let curFile: RichDiffPreview["files"][number] | null = null;
  let curHunk: RichDiffPreview["files"][number]["hunks"][number] | null = null;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("diff --git ")) {
      curFile = null;
      curHunk = null;
    } else if (line.startsWith("--- ")) {
      curFile = { oldFile: line.slice(4).trim(), newFile: "", added: 0, removed: 0, hunks: [] };
      files.push(curFile);
      curHunk = null;
    } else if (line.startsWith("+++ ") && curFile) {
      curFile.newFile = line.slice(4).trim();
    } else if (line.startsWith("@@")) {
      if (!curFile) {
        curFile = { oldFile: "patch", newFile: "patch", added: 0, removed: 0, hunks: [] };
        files.push(curFile);
      }
      curHunk = { header: line, lines: [] };
      curFile.hunks.push(curHunk);
    } else if (curHunk && curHunk.lines.length < 400) {
      if (line.startsWith("+")) {
        curHunk.lines.push({ type: "+", text: line.slice(1) });
        curFile!.added++;
        totalAdded++;
      } else if (line.startsWith("-")) {
        curHunk.lines.push({ type: "-", text: line.slice(1) });
        curFile!.removed++;
        totalRemoved++;
      } else if (line.startsWith(" ") || line === "") {
        curHunk.lines.push({ type: " ", text: line.slice(1) });
      }
    }
  }
  return {
    kind: "diff",
    formatLabel: "Unified Diff / Patch",
    meta: [
      ["Files changed", String(files.length)],
      ["Additions", `+${totalAdded}`],
      ["Deletions", `-${totalRemoved}`],
    ],
    files: files.slice(0, 50),
  };
}

export function parseLogRich(text: string): RichLogPreview {
  const counts = { error: 0, warn: 0, info: 0, debug: 0, other: 0 };
  const entries: RichLogPreview["entries"] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim()) continue;
    const tsMatch = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})/.exec(raw);
    const lvlMatch = /\b(FATAL|CRITICAL|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\b/i.exec(raw);
    const rawLvl = (lvlMatch?.[1] ?? "").toUpperCase();
    let level: RichLogPreview["entries"][number]["level"] = "OTHER";
    if (rawLvl === "ERROR" || rawLvl === "ERR" || rawLvl === "FATAL" || rawLvl === "CRITICAL") {
      level = "ERROR";
      counts.error++;
    } else if (rawLvl === "WARN" || rawLvl === "WARNING") {
      level = "WARN";
      counts.warn++;
    } else if (rawLvl === "INFO") {
      level = "INFO";
      counts.info++;
    } else if (rawLvl === "DEBUG" || rawLvl === "TRACE") {
      level = "DEBUG";
      counts.debug++;
    } else {
      counts.other++;
    }
    if (entries.length < 400) {
      entries.push({
        line: i + 1,
        level,
        ...(tsMatch ? { timestamp: tsMatch[1] } : {}),
        text: raw,
      });
    }
  }
  return {
    kind: "log",
    formatLabel: "Application / System Log",
    meta: [
      ["Lines", String(entries.length)],
      ["Errors", String(counts.error)],
      ["Warnings", String(counts.warn)],
      ["Info", String(counts.info)],
    ],
    counts,
    entries,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// WebAssembly (.wasm), Java Class (.class), BitTorrent (.torrent)
// ---------------------------------------------------------------------------------------------------------------

function inspectWasm(buf: Buffer): Array<[string, string]> {
  if (buf.length < 8 || buf.readUInt32LE(0) !== 0x6d736100) return [];
  const ver = buf.readUInt32LE(4);
  const meta: Array<[string, string]> = [["WebAssembly version", String(ver)]];
  const secNames: Record<number, string> = {
    0: "Custom", 1: "Type", 2: "Import", 3: "Function", 4: "Table", 5: "Memory",
    6: "Global", 7: "Export", 8: "Start", 9: "Element", 10: "Code", 11: "Data", 12: "DataCount",
  };
  const sections: string[] = [];
  let pos = 8;
  const readLebU32 = (): number => {
    let res = 0, shift = 0;
    while (pos < buf.length && shift < 35) {
      const b = buf[pos++]!;
      res |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return res >>> 0;
  };
  while (pos < buf.length && sections.length < 25) {
    const id = buf[pos++]!;
    const len = readLebU32();
    const end = pos + len;
    sections.push(`${secNames[id] ?? `Section ${id}`} (${humanBytes(len)})`);
    if (end <= pos || end > buf.length) break;
    pos = end;
  }
  if (sections.length) meta.push(["Sections", sections.join(", ")]);
  return meta;
}

function inspectJavaClass(buf: Buffer): Array<[string, string]> {
  if (buf.length < 10 || buf.readUInt32BE(0) !== 0xcafebabe) return [];
  const minor = buf.readUInt16BE(4);
  const major = buf.readUInt16BE(6);
  if (major < 45 || major > 90) return [];
  const jdk = major >= 49 ? `Java SE ${major - 44}` : `JDK 1.${major - 44}`;
  const cpCount = buf.readUInt16BE(8);
  return [
    ["Format", "Java Bytecode (.class)"],
    ["Target platform", `${jdk} (class v${major}.${minor})`],
    ["Constant pool entries", String(cpCount)],
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Structured Data Inspector (.json, .jsonl, .yaml, .toml, .ini, .env, .properties, .xml, .plist)
// ---------------------------------------------------------------------------------------------------------------

function inspectStructuredText(text: string, ext: string, baseName: string): RichStructuredPreview | null {
  const lowerBase = baseName.toLowerCase();
  const isEnv = ext === "env" || lowerBase === ".env" || lowerBase.startsWith(".env.");
  const isIni = ["ini", "cfg", "conf", "editorconfig", "gitconfig", "npmrc", "desktop"].includes(ext) || [".editorconfig", ".gitconfig", ".npmrc"].includes(lowerBase);
  const isProps = ext === "properties";
  const isJsonl = ext === "jsonl" || ext === "ndjson";
  const isJson = ["json", "jsonc", "json5", "geojson", "webmanifest", "har"].includes(ext) || [".babelrc", ".eslintrc", ".prettierrc", "tsconfig.json"].includes(lowerBase);
  const isYaml = ext === "yaml" || ext === "yml";
  const isToml = ext === "toml" || lowerBase === "cargo.lock" || lowerBase === "poetry.lock";
  const isXml = ["xml", "plist", "xsd", "xsl", "xslt", "rss", "atom", "gpx", "kml", "csproj", "vcxproj", "resx", "wsdl"].includes(ext);

  if (!isEnv && !isIni && !isProps && !isJsonl && !isJson && !isYaml && !isToml && !isXml) return null;

  try {
    const notes = new Notes();
    let data: unknown;
    let subkind: RichStructuredPreview["subkind"] = "json";
    let formatLabel = "Structured Data";

    if (isEnv) {
      subkind = "env";
      formatLabel = "Environment Variables (.env)";
      data = parseEnv(text, true);
    } else if (isProps) {
      subkind = "ini";
      formatLabel = "Java Properties";
      data = parseProperties(text, true);
    } else if (isIni) {
      subkind = "ini";
      formatLabel = "INI / Configuration File";
      data = parseIni(text, true, notes);
    } else if (isJsonl) {
      subkind = "jsonl";
      formatLabel = "JSON Lines (NDJSON)";
      data = parseData("ndjson", text, DEFAULT_DATA_OPTIONS, notes);
    } else if (isYaml) {
      subkind = "yaml";
      formatLabel = "YAML Document";
      data = parseData("yaml", text, DEFAULT_DATA_OPTIONS, notes);
    } else if (isToml) {
      subkind = "toml";
      formatLabel = "TOML Configuration";
      data = parseData("toml", text, DEFAULT_DATA_OPTIONS, notes);
    } else if (isXml) {
      subkind = ext === "plist" || text.includes("<!DOCTYPE plist") ? "plist" : "xml";
      formatLabel = subkind === "plist" ? "Property List (XML Plist)" : `XML Document (${ext.toUpperCase()})`;
      data = parseData(subkind === "plist" ? "plist" : "xml", text, DEFAULT_DATA_OPTIONS, notes);
    } else {
      subkind = ext === "geojson" ? "geojson" : "json";
      formatLabel = ext === "geojson" ? "GeoJSON Features" : ext === "webmanifest" ? "Web App Manifest" : "JSON Data";
      const stripped = ext === "jsonc" || ext === "json5" || lowerBase === "tsconfig.json"
        ? text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,(\s*[}\]])/g, "$1")
        : text;
      data = JSON.parse(stripped);
    }

    const meta: Array<[string, string]> = [];
    let table: RichStructuredPreview["table"] = null;
    if (Array.isArray(data)) {
      meta.push(["Top-level type", `Array (${data.length} items)`]);
    } else if (data && typeof data === "object") {
      meta.push(["Top-level keys", String(Object.keys(data as object).length)]);
    }

    const isTabularData =
      (Array.isArray(data) && data.length > 0 && data.every((r) => isObj(r) || Array.isArray(r))) ||
      (isObj(data) && Object.values(data).length === 1 && Array.isArray(Object.values(data)[0]) && (Object.values(data)[0] as unknown[]).length > 0 && (Object.values(data)[0] as unknown[]).every(isObj));

    if (isTabularData) {
      const extracted = toTable(data as Value, { flatten: true, notes });
      if (extracted.columns.length > 0 && extracted.rows.length > 0) {
        const colCount = Math.min(40, extracted.columns.length);
        table = {
          headers: extracted.columns.slice(0, colCount),
          rows: extracted.rows.slice(0, 200).map((r) => r.slice(0, colCount).map((v) => {
            return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          })),
          totalRows: extracted.rows.length,
        };
      }
    } else if ((subkind === "env" || subkind === "ini") && data && typeof data === "object" && !Array.isArray(data)) {
      const rows: string[][] = [];
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
            rows.push([`${k}.${sk}`, String(sv ?? "")]);
          }
        } else {
          rows.push([k, String(v ?? "")]);
        }
      }
      if (rows.length) table = { headers: ["Key", "Value"], rows: rows.slice(0, 200), totalRows: rows.length };
    }

    return {
      kind: "structured",
      subkind,
      formatLabel,
      meta,
      data,
      table,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Main Entry Point: inspectRichPreview
// ---------------------------------------------------------------------------------------------------------------

export async function inspectRichPreview(
  handle: fsp.FileHandle,
  path: string,
  size: number,
  head: Buffer,
  text: string | null,
  hasThumb: boolean,
): Promise<RichPreview | null> {
  const name = nodePath.basename(path);
  const ext = extensionOf(name);
  const lastExt = ext.includes(".") ? ext.slice(ext.lastIndexOf(".") + 1) : ext;
  const src = fileSource(handle, size);
  const sniff = sniffType(head);

  // 1. Apple Binary Property List (bplist00)
  if (head.length >= 8 && head.subarray(0, 8).toString("ascii") === "bplist00") {
    const fullBuf = size <= 2 * 1024 * 1024 ? await src.read(0, size) : head;
    const parsed = parseBinaryPlist(fullBuf);
    if (parsed !== null) {
      const formattedText = JSON.stringify(parsed, null, 2);
      return {
        kind: "structured",
        subkind: "bplist",
        formatLabel: "Apple Binary Property List (bplist00)",
        meta: [
          ["Encoding", "Binary Plist v0.0"],
          ["Top-level type", Array.isArray(parsed) ? `Array (${parsed.length})` : typeof parsed === "object" && parsed ? `Dictionary (${Object.keys(parsed).length} keys)` : typeof parsed],
        ],
        data: parsed,
        formattedText,
      };
    }
  }

  // 2. SQLite Database
  if (sniff?.kind === "sqlite" || ["sqlite", "sqlite3", "db", "db3", "s3db"].includes(lastExt)) {
    if (head.length >= 16 && ascii(head, 0, 16) === "SQLite format 3\0") {
      return await inspectSqliteRich(src, path);
    }
  }

  // 3. PDF Document
  if (sniff?.kind === "pdf" || lastExt === "pdf") {
    return await inspectPdfRich(src, hasThumb);
  }

  // 4. ZIP-based Documents, Spreadsheets, Presentations, E-Books & Archives
  const isZipMagic = head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7);
  if (isZipMagic || ["zip", "docx", "docm", "xlsx", "xlsm", "pptx", "ppsx", "odt", "ods", "odp", "epub", "jar", "apk", "war", "whl", "vsix", "nupkg", "cbz"].includes(lastExt)) {
    const zipRich = await inspectZipBasedRich(handle, path, size, lastExt, hasThumb);
    if (zipRich) return zipRich;
  }

  // 5. TAR, TARGZ, GZIP, ZSTD, BROTLI Archives & Compressed Single Files
  if (ext === "tar.gz" || lastExt === "tgz" || lastExt === "gz" || sniff?.kind === "gzip") {
    const gzDoc = await gzipDocument(handle, path, size).catch(() => ({ groups: [], kind: "Gzip archive" }));
    const meta = flattenGroups(gzDoc.groups);
    let innerText: string | undefined;
    let innerName = name.replace(/\.(?:gz|tgz)$/i, "");
    try {
      const decomp = gunzipSync(head.subarray(0, Math.min(head.length, 64 * 1024)), { maxOutputLength: 64 * 1024 });
      if (!isTarHeader(decomp) && !decomp.subarray(0, 4096).includes(0)) {
        innerText = new TextDecoder("utf-8").decode(decomp);
      }
    } catch {
      // partial stream: try streaming gunzip via gzipDocument
    }
    return {
      kind: "archive",
      formatLabel: gzDoc.kind || "Gzip Compressed File",
      meta,
      totalEntries: 1,
      files: 1,
      folders: 0,
      uncompressed: 0,
      compressed: size,
      encrypted: 0,
      entries: [],
      ...(innerText ? { innerName, innerText } : {}),
    };
  }
  if (lastExt === "tar" || sniff?.kind === "tar") {
    const tarDoc = await tarDocument(path, size).catch(() => ({ groups: [], kind: "Tar archive" }));
    return {
      kind: "archive",
      formatLabel: tarDoc.kind || "TAR Archive",
      meta: flattenGroups(tarDoc.groups),
      totalEntries: 0,
      files: 0,
      folders: 0,
      uncompressed: size,
      compressed: size,
      encrypted: 0,
      entries: [],
    };
  }
  if (lastExt === "zst" || sniff?.kind === "zstd" || lastExt === "br") {
    try {
      const raw = size <= 512 * 1024 ? await src.read(0, size) : head;
      const decomp = lastExt === "br" ? brotliDecompressSync(raw, { maxOutputLength: 64 * 1024 }) : zstdDecompressSync(raw, { maxOutputLength: 64 * 1024 });
      const isText = !decomp.subarray(0, 4096).includes(0);
      return {
        kind: "archive",
        formatLabel: lastExt === "br" ? "Brotli Compressed File" : "Zstandard Compressed File (.zst)",
        meta: [
          ["Compressed size", humanBytes(size)],
          ["Decompressed preview", humanBytes(decomp.length)],
        ],
        totalEntries: 1,
        files: 1,
        folders: 0,
        uncompressed: decomp.length,
        compressed: size,
        encrypted: 0,
        entries: [],
        ...(isText ? { innerName: name.replace(/\.(?:zst|br)$/i, ""), innerText: new TextDecoder("utf-8").decode(decomp) } : {}),
      };
    } catch {}
  }

  // 6. Fonts (.ttf, .otf, .woff, .woff2, .ttc, .eot)
  if (sniff?.kind === "ttf" || sniff?.kind === "otf" || sniff?.kind === "woff" || sniff?.kind === "woff2" || ["ttf", "otf", "woff", "woff2", "ttc", "eot"].includes(lastExt)) {
    const fInfo = await fontInfo(src).catch(() => ({ groups: [], kind: "Font" }));
    const meta = flattenGroups(fInfo.groups);
    const family = meta.find(([k]) => k === "Family")?.[1] || name.replace(/\.[^.]+$/, "");
    const style = meta.find(([k]) => k === "Style")?.[1] || "Regular";
    return {
      kind: "font",
      formatLabel: fInfo.kind || `Font (${lastExt.toUpperCase()})`,
      family,
      style,
      meta,
      canRenderSpecimen: ["ttf", "otf", "woff", "woff2", "ttc"].includes(lastExt),
    };
  }

  // 7. RTF Document (.rtf or {\rtf magic)
  const headText = text ?? (head.length ? new TextDecoder("utf-8", { fatal: false }).decode(head) : "");
  if (lastExt === "rtf" || headText.startsWith("{\\rtf")) {
    const { blocks, plainText, meta } = parseRtfDocument(headText);
    return {
      kind: "document",
      formatLabel: "Rich Text Document (RTF)",
      meta: [["Paragraphs", String(blocks.length)], ...meta],
      blocks,
      plainText,
      hasThumb,
    };
  }

  // 8. FictionBook E-Book (.fb2)
  if (lastExt === "fb2") {
    const title = xmlText(headText, "book-title");
    const author = [xmlText(headText, "first-name"), xmlText(headText, "last-name")].filter(Boolean).join(" ");
    const blocks = parseHtmlToBlocks(headText);
    return {
      kind: "document",
      formatLabel: "FictionBook E-Book (FB2)",
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      meta: [
        ...(title ? [["Title", title] as [string, string]] : []),
        ...(author ? [["Author", author] as [string, string]] : []),
      ],
      blocks,
      plainText: blocks.map((b) => ("text" in b ? b.text : "")).join("\n\n"),
    };
  }

  // 9. 3D Models (.obj, .stl, .ply, .gltf, .glb)
  if (["obj", "stl", "ply", "gltf", "glb"].includes(lastExt)) {
    return parseModel3dRich(head, headText, lastExt);
  }

  // 10. Text-based rich formats when `text !== null` (or known extension)
  if (text !== null) {
    if (lastExt === "ipynb") {
      const nb = parseNotebookRich(text);
      if (nb) return nb;
    }
    if (["srt", "vtt", "sbv", "ass", "ssa", "lrc"].includes(lastExt)) {
      return parseSubtitlesRich(text, lastExt);
    }
    if (["m3u", "m3u8", "pls"].includes(lastExt)) {
      return parsePlaylistRich(text, lastExt);
    }
    if (["ics", "ical", "vcs", "ifb"].includes(lastExt) || text.startsWith("BEGIN:VCALENDAR")) {
      return parseCalendarRich(text);
    }
    if (["vcf", "vcard"].includes(lastExt) || text.startsWith("BEGIN:VCARD")) {
      return parseContactRich(text);
    }
    if (["pem", "crt", "cer", "csr", "pub", "asc"].includes(lastExt) || /-----BEGIN [A-Z0-9 -]+-----/.test(text.slice(0, 512))) {
      return parseCertificateRich(head, text, lastExt);
    }
    if (lastExt === "diff" || lastExt === "patch") {
      return parseDiffRich(text);
    }
    if (lastExt === "log") {
      return parseLogRich(text);
    }
    const structured = inspectStructuredText(text, lastExt, name);
    if (structured) return structured;
    return null;
  }

  // 11. DER Certificate
  if (["der", "cer", "crt"].includes(lastExt) && head[0] === 0x30) {
    return parseCertificateRich(head, "", lastExt);
  }

  // 12. Executables, WASM, Java Class, & Arbitrary Binary Files
  const meta: Array<[string, string]> = [];
  let formatLabel = sniff?.label || (lastExt ? `${lastExt.toUpperCase()} Binary File` : "Binary File");
  if (sniff?.kind === "pe" || lastExt === "exe" || lastExt === "dll") {
    const pe = await peInfo(src).catch(() => null);
    if (pe) {
      formatLabel = pe.kind;
      meta.push(...flattenGroups(pe.groups));
    }
  } else if (sniff?.kind === "elf" || lastExt === "so") {
    const elf = await elfInfo(src).catch(() => null);
    if (elf) {
      formatLabel = elf.kind;
      meta.push(...flattenGroups(elf.groups));
    }
  } else if (sniff?.kind === "macho" || lastExt === "dylib") {
    const mo = await machoInfo(src).catch(() => null);
    if (mo) {
      formatLabel = mo.kind;
      meta.push(...flattenGroups(mo.groups));
    }
  } else if (head.length >= 8 && head.readUInt32LE(0) === 0x6d736100) {
    formatLabel = "WebAssembly Binary Module (.wasm)";
    meta.push(...inspectWasm(head));
  } else if (head.length >= 10 && head.readUInt32BE(0) === 0xcafebabe) {
    const jc = inspectJavaClass(head);
    if (jc.length) {
      formatLabel = "Java Compiled Class (.class)";
      meta.push(...jc);
    }
  }
  meta.push(["Size", `${humanBytes(size)} (${size.toLocaleString("en-US")} bytes)`]);
  meta.push(["Entropy", `${shannonEntropy(head)} bits/byte`]);

  return {
    kind: "binary",
    formatLabel,
    meta,
    hexLines: buildHexLines(head, 2048),
    strings: extractPrintableStrings(head, 4, 120),
  };
}
