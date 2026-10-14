/**
 * Built-in text converters: character encodings, line endings, tabs and spaces, Base64 and hex, and small text
 * to HTML helpers (a safe Markdown renderer, HTML to plain text). Pure functions on bytes and text.
 *
 * Encodings use the platform's TextDecoder for reading. For writing the old encodings (Shift_JIS, GBK, Big5, EUC-KR,
 * Windows code pages) the same decoder is run over every possible byte pair once, and the answers are turned around
 * into a lookup table, so no library is needed and the table can't disagree with the decoder.
 */
import { ConvError } from "./fmConvCommon";

// ---------------------------------------------------------------------------------------------------------------
// Encodings
// ---------------------------------------------------------------------------------------------------------------

export interface EncodingDef {
  id: string;
  label: string;
  /** The TextDecoder label; null for ISO-8859-1, which is read byte for byte. */
  decoder: string | null;
  kind: "unicode" | "single" | "multi";
  /** Can this encoding be written? */
  write: boolean;
}

export const ENCODINGS: EncodingDef[] = [
  { id: "utf-8", label: "UTF-8 (the usual one)", decoder: "utf-8", kind: "unicode", write: true },
  { id: "utf-8-bom", label: "UTF-8 with a byte-order mark (Excel and Notepad like it)", decoder: "utf-8", kind: "unicode", write: true },
  { id: "utf-16le", label: "UTF-16 little-endian (Windows \"Unicode\")", decoder: "utf-16le", kind: "unicode", write: true },
  { id: "utf-16be", label: "UTF-16 big-endian", decoder: "utf-16be", kind: "unicode", write: true },
  { id: "windows-1252", label: "Windows-1252 (Western European)", decoder: "windows-1252", kind: "single", write: true },
  { id: "iso-8859-1", label: "ISO-8859-1 (Latin-1)", decoder: null, kind: "single", write: true },
  { id: "iso-8859-15", label: "ISO-8859-15 (Latin-9, with the euro sign)", decoder: "iso-8859-15", kind: "single", write: true },
  { id: "windows-1250", label: "Windows-1250 (Central European)", decoder: "windows-1250", kind: "single", write: true },
  { id: "windows-1251", label: "Windows-1251 (Cyrillic)", decoder: "windows-1251", kind: "single", write: true },
  { id: "koi8-r", label: "KOI8-R (Russian)", decoder: "koi8-r", kind: "single", write: true },
  { id: "macintosh", label: "Mac Roman (old Macs)", decoder: "macintosh", kind: "single", write: true },
  { id: "shift_jis", label: "Shift_JIS (Japanese)", decoder: "shift_jis", kind: "multi", write: true },
  { id: "euc-jp", label: "EUC-JP (Japanese)", decoder: "euc-jp", kind: "multi", write: true },
  { id: "gbk", label: "GBK (Simplified Chinese)", decoder: "gbk", kind: "multi", write: true },
  { id: "gb18030", label: "GB18030 (Chinese, read only)", decoder: "gb18030", kind: "multi", write: false },
  { id: "big5", label: "Big5 (Traditional Chinese)", decoder: "big5", kind: "multi", write: true },
  { id: "euc-kr", label: "EUC-KR (Korean)", decoder: "euc-kr", kind: "multi", write: true },
];

export const ENCODING_BY_ID = new Map(ENCODINGS.map((e) => [e.id, e]));

export interface Decoded {
  text: string;
  /** The encoding that was used (for "auto", what was found). */
  encoding: string;
  /** Bytes (or characters) that could not be read in that encoding. */
  bad: number;
  /** Where the first one is, in bytes. */
  firstBad: number | null;
  /** How the encoding was decided, in words. */
  how: string;
}

const hasUtf8Bom = (b: Uint8Array) => b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;

/** Decides the encoding of bytes: a byte-order mark, valid UTF-8, UTF-16 without a mark, or else Windows-1252. */
export function detectEncoding(bytes: Uint8Array): { id: string; how: string } {
  if (hasUtf8Bom(bytes)) return { id: "utf-8-bom", how: "UTF-8 with a byte-order mark" };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { id: "utf-16le", how: "UTF-16 (little-endian) by its byte-order mark" };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { id: "utf-16be", how: "UTF-16 (big-endian) by its byte-order mark" };
  // Text with many zero bytes is UTF-16 (zero is valid in UTF-8, but not in text).
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) (i % 2 ? oddZero++ : evenZero++);
  if (sample.length >= 4 && oddZero > sample.length / 4 && evenZero < sample.length / 20) return { id: "utf-16le", how: "UTF-16 (little-endian), judging by its zero bytes" };
  if (sample.length >= 4 && evenZero > sample.length / 4 && oddZero < sample.length / 20) return { id: "utf-16be", how: "UTF-16 (big-endian), judging by its zero bytes" };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { id: "utf-8", how: "valid UTF-8" };
  } catch {
    // not UTF-8
  }
  return { id: "windows-1252", how: "not valid UTF-8, so assumed to be Windows-1252 (Western European). If accents look wrong, pick the encoding yourself" };
}

function firstInvalidByte(bytes: Uint8Array, label: string): number {
  let lo = 0;
  let hi = bytes.length;
  const fails = (n: number) => {
    try {
      new TextDecoder(label as "utf-8", { fatal: true }).decode(bytes.subarray(0, n), { stream: true });
      return false;
    } catch {
      return true;
    }
  };
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fails(mid)) hi = mid;
    else lo = mid + 1;
  }
  return Math.max(0, lo - 1);
}

/** Reads bytes as text. `from` is an encoding id or "auto". Bad bytes are an error unless `replace` is true. */
export function decodeBytes(bytes: Uint8Array, from: string, replace: boolean): Decoded {
  let id = from;
  let how = "chosen by you";
  if (from === "auto") {
    const d = detectEncoding(bytes);
    id = d.id;
    how = d.how;
  }
  const enc = ENCODING_BY_ID.get(id);
  if (!enc) throw new ConvError("That encoding isn't known.");
  if (enc.decoder === null) return { text: Buffer.from(bytes).toString("latin1"), encoding: id, bad: 0, firstBad: null, how };
  try {
    const text = new TextDecoder(enc.decoder as "utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: id, bad: 0, firstBad: null, how };
  } catch {
    const first = firstInvalidByte(bytes, enc.decoder);
    const text = new TextDecoder(enc.decoder as "utf-8").decode(bytes);
    let bad = 0;
    for (let i = text.indexOf("\ufffd"); i >= 0; i = text.indexOf("\ufffd", i + 1)) bad++;
    if (!replace) throw new ConvError(`This file isn't valid ${enc.label.split(" (")[0]}: ${bad || 1} place${bad === 1 ? "" : "s"} can't be read (the first is near byte ${first + 1}). Choose the right "from" encoding, or allow replacing the bad parts.`);
    return { text, encoding: id, bad: bad || 1, firstBad: first, how };
  }
}

const reverseTables = new Map<string, Map<string, number>>();

/** character -> bytes (as a number, 1 or 2 bytes big-endian) for an encoding, built from its decoder. */
function reverseTable(enc: EncodingDef): Map<string, number> {
  const cached = reverseTables.get(enc.id);
  if (cached) return cached;
  const map = new Map<string, number>();
  if (enc.decoder === null) {
    for (let b = 0; b < 256; b++) map.set(String.fromCharCode(b), b);
  } else {
    const dec = new TextDecoder(enc.decoder as "utf-8", { fatal: true });
    for (let b = 0; b < 256; b++) {
      try {
        const s = dec.decode(Uint8Array.of(b));
        if (s && !map.has(s)) map.set(s, b);
      } catch {
        // not a character by itself
      }
    }
    if (enc.kind === "multi") {
      for (let lead = 0x81; lead <= 0xfe; lead++) {
        for (let trail = 0x40; trail <= 0xfe; trail++) {
          try {
            const s = dec.decode(Uint8Array.of(lead, trail));
            if (s && [...s].length === 1 && !s.includes("\ufffd") && !map.has(s)) map.set(s, (lead << 8) | trail);
          } catch {
            // not a pair
          }
        }
      }
    }
  }
  reverseTables.set(enc.id, map);
  return map;
}

export interface Encoded {
  bytes: Buffer;
  /** Characters this encoding has no code for. */
  unmappable: number;
  firstUnmappable: string | null;
}

/** Writes text in an encoding. A character the encoding doesn't have is an error unless `replace` is true (it becomes "?"). */
export function encodeText(text: string, to: string, replace: boolean): Encoded {
  const enc = ENCODING_BY_ID.get(to);
  if (!enc || !enc.write) throw new ConvError("That encoding can't be written.");
  if (to === "utf-8") return { bytes: Buffer.from(text, "utf8"), unmappable: 0, firstUnmappable: null };
  if (to === "utf-8-bom") return { bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]), unmappable: 0, firstUnmappable: null };
  if (to === "utf-16le") return { bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]), unmappable: 0, firstUnmappable: null };
  if (to === "utf-16be") {
    const le = Buffer.from(text, "utf16le");
    le.swap16();
    return { bytes: Buffer.concat([Buffer.from([0xfe, 0xff]), le]), unmappable: 0, firstUnmappable: null };
  }
  const table = reverseTable(enc);
  const out: number[] = [];
  let unmappable = 0;
  let firstUnmappable: string | null = null;
  const chunk: Buffer[] = [];
  const flush = () => { if (out.length) { chunk.push(Buffer.from(out)); out.length = 0; } };
  for (const ch of text) {
    const code = table.get(ch);
    if (code === undefined) {
      unmappable++;
      firstUnmappable ??= ch;
      out.push(0x3f);
    } else if (code > 0xff) out.push(code >> 8, code & 0xff);
    else out.push(code);
    if (out.length > 1 << 16) flush();
  }
  flush();
  if (unmappable && !replace) {
    throw new ConvError(`${unmappable} character${unmappable === 1 ? "" : "s"} can't be written in ${enc.label.split(" (")[0]} (for example "${firstUnmappable}"). Choose UTF-8, or allow replacing them with "?".`);
  }
  return { bytes: Buffer.concat(chunk), unmappable, firstUnmappable };
}

// ---------------------------------------------------------------------------------------------------------------
// Line endings, tabs and spaces
// ---------------------------------------------------------------------------------------------------------------

/** Applies `fn` to the text of a file and returns bytes in the same encoding (UTF-16, UTF-8, or any ASCII-compatible one). */
export function mapText(bytes: Uint8Array, fn: (text: string) => string): Buffer {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) {
    const id = b[0] === 0xff ? "utf-16le" : "utf-16be";
    return encodeText(fn(decodeBytes(b, id, false).text), id, false).bytes;
  }
  const bom = hasUtf8Bom(b) ? b.subarray(0, 3) : Buffer.alloc(0);
  const body = b.subarray(bom.length);
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
    return Buffer.concat([bom, Buffer.from(fn(text), "utf8")]);
  } catch {
    // Some other ASCII-compatible encoding: line breaks, tabs and spaces are the same bytes in all of them.
    return Buffer.concat([bom, Buffer.from(fn(body.toString("latin1")), "latin1")]);
  }
}

export type LineEnding = "lf" | "crlf" | "cr";

export function convertLineEndings(bytes: Uint8Array, to: LineEnding): Buffer {
  const eol = to === "lf" ? "\n" : to === "crlf" ? "\r\n" : "\r";
  return mapText(bytes, (t) => t.replace(/\r\n|\r|\n/g, eol));
}

export function tabsToSpaces(bytes: Uint8Array, width: number): Buffer {
  return mapText(bytes, (t) => t.split(/(\r\n|\r|\n)/).map((part, i) => {
    if (i % 2) return part;
    let col = 0;
    let out = "";
    for (const ch of part) {
      if (ch === "\t") { const n = width - (col % width); out += " ".repeat(n); col += n; }
      else { out += ch; col++; }
    }
    return out;
  }).join(""));
}

export function spacesToTabs(bytes: Uint8Array, width: number): Buffer {
  return mapText(bytes, (t) => t.replace(/^[ \t]+/gm, (lead) => {
    const cols = [...lead].reduce((c, ch) => (ch === "\t" ? c + width - (c % width) : c + 1), 0);
    return "\t".repeat(Math.floor(cols / width)) + " ".repeat(cols % width);
  }));
}

export function stripTrailingSpaces(bytes: Uint8Array): Buffer {
  return mapText(bytes, (t) => t.replace(/[ \t\f\v]+(?=\r?\n|\r|$)/g, ""));
}

export function stripUtf8Bom(bytes: Uint8Array): Buffer {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) throw new ConvError("This file is UTF-16, which always needs its mark. Use \"Change the text encoding\" to turn it into UTF-8 instead.");
  return hasUtf8Bom(b) ? b.subarray(3) : b;
}

// ---------------------------------------------------------------------------------------------------------------
// Base64 and hex
// ---------------------------------------------------------------------------------------------------------------

export function encodeBase64(bytes: Uint8Array, wrap: number): string {
  const s = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  if (!wrap) return `${s}\n`;
  const lines: string[] = [];
  for (let i = 0; i < s.length; i += wrap) lines.push(s.slice(i, i + wrap));
  return `${lines.join("\n")}\n`;
}

export function decodeBase64(text: string): Buffer {
  let s = text.trim();
  const url = /^data:[^,]*;base64,/i.exec(s);
  if (url) s = s.slice(url[0].length);
  s = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bad = /[^A-Za-z0-9+/=]/.exec(s);
  if (bad) throw new ConvError(`This isn't Base64 text: the character "${bad[0]}" at position ${bad.index + 1} isn't allowed.`);
  if (!s) throw new ConvError("The file is empty: there is nothing to decode.");
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new ConvError("This Base64 text is damaged (its length isn't possible).");
  return Buffer.from(s, "base64");
}

export function encodeHex(bytes: Uint8Array, spaced: boolean, upper: boolean): string {
  let hex = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex");
  if (upper) hex = hex.toUpperCase();
  if (!spaced) return `${hex}\n`;
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += 32) lines.push(hex.slice(i, i + 32).replace(/(..)(?=.)/g, "$1 "));
  return `${lines.join("\n")}\n`;
}

export function decodeHex(text: string): Buffer {
  const s = text.replace(/0x/gi, "").replace(/[\s,:]+/g, "");
  const bad = /[^0-9a-fA-F]/.exec(s);
  if (bad) throw new ConvError(`This isn't hex text: the character "${bad[0]}" isn't allowed (hex uses 0-9 and a-f).`);
  if (!s) throw new ConvError("The file is empty: there is nothing to decode.");
  if (s.length % 2) throw new ConvError("This hex text has an odd number of digits, so it can't be whole bytes.");
  return Buffer.from(s, "hex");
}

const SIGNATURES: Array<[number[], string]> = [
  [[0x89, 0x50, 0x4e, 0x47], "png"], [[0xff, 0xd8, 0xff], "jpg"], [[0x47, 0x49, 0x46, 0x38], "gif"], [[0x25, 0x50, 0x44, 0x46], "pdf"], [[0x50, 0x4b, 0x03, 0x04], "zip"],
  [[0x1f, 0x8b], "gz"], [[0x42, 0x4d], "bmp"], [[0x49, 0x44, 0x33], "mp3"], [[0x4f, 0x67, 0x67, 0x53], "ogg"], [[0x66, 0x4c, 0x61, 0x43], "flac"], [[0x37, 0x7a, 0xbc, 0xaf], "7z"],
];

/** A file extension for bytes, from their first bytes; "bin" when unknown. */
export function sniffExtension(b: Uint8Array): string {
  for (const [sig, ext] of SIGNATURES) if (sig.every((x, i) => b[i] === x)) return ext;
  if (b.length >= 12 && Buffer.from(b.subarray(0, 4)).toString("latin1") === "RIFF") {
    const kind = Buffer.from(b.subarray(8, 12)).toString("latin1");
    return kind === "WAVE" ? "wav" : kind === "WEBP" ? "webp" : "bin";
  }
  if (b.length >= 12 && Buffer.from(b.subarray(4, 8)).toString("latin1") === "ftyp") return "mp4";
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, 2000));
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000e-\u001f]/.test(t)) return "txt";
  } catch {
    // binary
  }
  return "bin";
}

// ---------------------------------------------------------------------------------------------------------------
// Text, Markdown and HTML
// ---------------------------------------------------------------------------------------------------------------

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escapeKeepEntities = (s: string) => s.replace(/&(?!#?[A-Za-z0-9]{1,12};)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A link or picture address that is safe to put in a page, or null. Only web, mail and relative addresses pass. */
export function safeUrl(raw: string, image = false): string | null {
  // eslint-disable-next-line no-control-regex
  const url = raw.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!url) return null;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  if (!scheme) return url;
  const s = scheme[1]!.toLowerCase();
  if (s === "http" || s === "https" || s === "mailto" || s === "tel") return url;
  if (image && s === "data" && /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(url)) return url;
  return null;
}

export const PAGE_STYLE = "body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#222}pre{background:#f5f5f5;padding:.8rem;overflow:auto}code{background:#f5f5f5;padding:.1rem .25rem}pre code{padding:0}blockquote{border-left:4px solid #ccc;margin-left:0;padding-left:1rem;color:#555}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.3rem .6rem}img{max-width:100%}";

function inline(src: string): string {
  const holds: string[] = [];
  const hold = (html: string) => `\u0000${holds.push(html) - 1}\u0000`;
  let s = src;
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_m, _t, code: string) => hold(`<code>${escapeHtml(code.replace(/^ (.*) $/s, "$1"))}</code>`));
  s = s.replace(/\\\n/g, () => hold("<br>\n"));
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|>~<&"])/g, (_m, c: string) => hold(escapeHtml(c)));
  s = s.replace(/<((?:https?|mailto):[^\s<>]+)>/gi, (_m, u: string) => hold(`<a href="${escapeHtml(safeUrl(u) ?? "#")}">${escapeHtml(u)}</a>`));
  s = s.replace(/!\[([^\]]*)\]\(\s*([^\s)]*(?:\([^)]*\)[^\s)]*)*)(?:\s+"([^"]*)")?\s*\)/g, (_m, alt: string, url: string, title?: string) => {
    const safe = safeUrl(url, true);
    return hold(safe ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""}>` : escapeHtml(alt));
  });
  s = s.replace(/\[((?:[^\]\\]|\\.)*)\]\(\s*([^\s)]*(?:\([^)]*\)[^\s)]*)*)(?:\s+"([^"]*)")?\s*\)/g, (_m, text: string, url: string, title?: string) => {
    const safe = safeUrl(url);
    const inner = inline(text);
    return hold(safe ? `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""} rel="noopener noreferrer">${inner}</a>` : inner);
  });
  s = escapeKeepEntities(s);
  s = s.replace(/ {2,}\n/g, "<br>\n");
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>").replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>");
  s = s.replace(/\*(?=\S)([^*]*?\S)\*/g, "<em>$1</em>").replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => holds[Number(i)]!);
}

const isFence = (l: string) => /^ {0,3}(`{3,}|~{3,})/.test(l);
const isHr = (l: string) => /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(l);
const isHeading = (l: string) => /^ {0,3}#{1,6}(?:\s|$)/.test(l);
const bulletStart = (l: string) => /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+\S/.test(l) || /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(l) || /^\s*\|\s*:?-+:?\s*\|\s*$/.test(l);

function splitRow(l: string): string[] {
  const t = l.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") { cur += "|"; i++; }
    else if (t[i] === "|") { cells.push(cur.trim()); cur = ""; }
    else cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
}

function blocks(lines: string[], depth: number): string {
  if (depth > 20) return `<p>${escapeHtml(lines.join("\n"))}</p>`;
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/.exec(line);
    if (fence) {
      const mark = fence[1]!;
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}\\s*$`).test(lines[i]!)) body.push(lines[i++]!);
      i++;
      const lang = fence[2] && /^[\w+#.-]{1,30}$/.test(fence[2]) ? ` class="language-${escapeHtml(fence[2])}"` : "";
      out.push(`<pre><code${lang}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/.exec(line);
    if (h && isHeading(line)) { out.push(`<h${h[1]!.length}>${inline((h[2] ?? "").trim())}</h${h[1]!.length}>`); i++; continue; }
    if (isHr(line)) { out.push("<hr>"); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim() && (/^ {0,3}>/.test(lines[i]!) || !(bulletStart(lines[i]!) || isFence(lines[i]!) || isHeading(lines[i]!)))) body.push(lines[i++]!.replace(/^ {0,3}> ?/, ""));
      out.push(`<blockquote>\n${blocks(body, depth + 1)}\n</blockquote>`);
      continue;
    }
    if (/^( {4}|\t)\S/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && (/^( {4}|\t)/.test(lines[i]!) || !lines[i]!.trim())) body.push(lines[i++]!.replace(/^( {4}|\t)/, ""));
      while (body.length && !body[body.length - 1]!.trim()) body.pop();
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (lines[i + 1] !== undefined && line.includes("|") && isTableSep(lines[i + 1]!)) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((c) => (/^:-+:$/.test(c) ? "center" : /^-+:$/.test(c) ? "right" : /^:-+$/.test(c) ? "left" : ""));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|")) rows.push(splitRow(lines[i++]!));
      const cell = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
      out.push(`<table>\n<thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead>\n<tbody>\n${rows.map((r) => `<tr>${head.map((_c, k) => cell("td", r[k] ?? "", k)).join("")}</tr>`).join("\n")}\n</tbody>\n</table>`);
      continue;
    }
    if (bulletStart(line)) {
      const first = /^( {0,3})([-+*]|\d{1,9}[.)])([ \t]+)?/.exec(line)!;
      const ordered = /\d/.test(first[2]!);
      const start = ordered ? parseInt(first[2]!, 10) : 1;
      const items: string[][] = [];
      let loose = false;
      let cur: string[] | null = null;
      let sawBlank = false;
      while (i < lines.length) {
        const l = lines[i]!;
        const m = /^( {0,3})([-+*]|\d{1,9}[.)])(?:[ \t]+(.*))?$/.exec(l);
        if (m && /\d/.test(m[2]!) === ordered && !isHr(l)) {
          if (sawBlank && cur) loose = true;
          cur = [m[3] ?? ""];
          items.push(cur);
          sawBlank = false;
        } else if (!l.trim()) {
          sawBlank = true;
        } else if (cur && /^( {2,}|\t)/.test(l)) {
          if (sawBlank) { cur.push(""); loose = true; }
          cur.push(l.replace(/^( {1,4}|\t)/, ""));
          sawBlank = false;
        } else if (cur && !sawBlank && !isFence(l) && !isHeading(l) && !isHr(l) && !/^ {0,3}>/.test(l)) {
          cur.push(l);
        } else break;
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      const rendered = items.map((it) => {
        let task = "";
        const t = /^\[([ xX])\][ \t]+/.exec(it[0]!);
        if (t) { task = `<input type="checkbox" disabled${t[1] !== " " ? " checked" : ""}> `; it = [it[0]!.slice(t[0].length), ...it.slice(1)]; }
        const body = blocks(it, depth + 1);
        const tight = !loose && /^<p>[\s\S]*<\/p>$/.test(body) && body.indexOf("</p>") === body.length - 4;
        return `<li>${task}${tight ? body.slice(3, -4) : body}</li>`;
      });
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>\n${rendered.join("\n")}\n</${tag}>`);
      continue;
    }
    const para: string[] = [line];
    i++;
    let setext = 0;
    while (i < lines.length && lines[i]!.trim() && !isFence(lines[i]!) && !isHeading(lines[i]!) && !isHr(lines[i]!) && !/^ {0,3}>/.test(lines[i]!) && !/^ {0,3}(?:[-+*]|1[.)])[ \t]+\S/.test(lines[i]!)) {
      if (/^ {0,3}=+\s*$/.test(lines[i]!)) { setext = 1; i++; break; }
      if (/^ {0,3}-+\s*$/.test(lines[i]!)) { setext = 2; i++; break; }
      if (lines[i + 1] !== undefined && lines[i]!.includes("|") && isTableSep(lines[i + 1]!)) break;
      para.push(lines[i++]!);
    }
    const text = inline(para.map((p) => p.replace(/^\s+/, "")).join("\n"));
    out.push(setext ? `<h${setext}>${text}</h${setext}>` : `<p>${text}</p>`);
  }
  return out.join("\n");
}

/** Markdown to HTML. Everything the writer typed as raw HTML is shown as text, and links are limited to safe addresses. */
export function markdownToHtml(md: string, title: string): { html: string; fragment: string } {
  const lines = md.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n");
  const fragment = blocks(lines, 0);
  return { html: markdownPage(fragment, title), fragment };
}

/** The whole web page around a rendered Markdown fragment: UTF-8, a title (the first heading), and a policy that forbids scripts. */
export function markdownPage(fragment: string, title: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(fragment);
  const pageTitle = h1 ? h1[1]!.replace(/<[^>]*>/g, "") : escapeHtml(title);
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'">\n<title>${pageTitle || escapeHtml(title)}</title>\n<style>${PAGE_STYLE}</style>\n</head>\n<body>\n${fragment}\n</body>\n</html>\n`;
}

export function textToHtml(text: string, title: string, layout: "pre" | "paragraphs"): string {
  const t = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const body = layout === "pre" ? `<pre>${escapeHtml(t)}</pre>` : t.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>\n")}</p>`).join("\n");
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(title)}</title>\n<style>${PAGE_STYLE}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euro: "€", trade: "™" };

/** The words of a web page: tags removed, paragraphs and list items on their own lines, entities decoded. */
export function htmlToText(html: string): string {
  let s = html.replace(/^\ufeff/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|head|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_m, body: string) => `\n${body.replace(/<[^>]*>/g, "").replace(/\n/g, "\u0001").replace(/ /g, "\u0002").replace(/\t/g, "\u0003")}\n`);
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|section|article|header|footer)\s*>/gi, "\n\n").replace(/<(p|div|h[1-6]|tr|ul|ol|blockquote|section|article)\b[^>]*>/gi, "\n").replace(/<\/t[dh]\s*>/gi, "\t");
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z]{2,8});/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
    }
    return NAMED[body] ?? m;
  });
  s = s.replace(/[ \t\r\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\u0001/g, "\n").replace(/\u0002/g, " ").replace(/\u0003/g, "\t").trim();
  if (!s) throw new ConvError("There is no text in this page.");
  return `${s}\n`;
}
