/** Text files: encoding guess, line endings, counts, indentation, and a check of JSON files. Reads at most the first 4 MB. */
import { clip, Rows, type InfoGroup } from "./fmInfoCommon";

export interface TextStats {
  encoding: string;
  bom: string;
  lineEnding: string;
  lines: number;
  words: number;
  chars: number;
  longest: number;
  trailingNewline: boolean;
  shebang: string;
  indent: string;
  truncated: boolean;
  blankLines: number;
}

/** Decides the encoding from a byte-order mark, or by whether the bytes are valid UTF-8. */
export function guessEncoding(b: Uint8Array): { name: string; bom: string; text: string } {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xfe && b[2] === 0 && b[3] === 0) return { name: "UTF-32 (little-endian)", bom: "Has a byte-order mark", text: "" };
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { name: "UTF-8", bom: "Has a byte-order mark (BOM)", text: buf.subarray(3).toString("utf8") };
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return { name: "UTF-16 (little-endian)", bom: "Has a byte-order mark (BOM)", text: buf.subarray(2).toString("utf16le") };
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return { name: "UTF-16 (big-endian)", bom: "Has a byte-order mark (BOM)", text: Buffer.from(buf.subarray(2)).swap16().toString("utf16le") };
  let ascii = true;
  for (let i = 0; i < b.length; i++) if (b[i]! > 0x7f) { ascii = false; break; }
  if (ascii) return { name: "ASCII (plain English letters only)", bom: "", text: buf.toString("latin1") };
  try {
    // A character cut in half at the end of the sample is not an error, so an unfinished last character is left out of the check.
    let end = b.length;
    for (let i = 1; i <= Math.min(3, b.length); i++) {
      const byte = b[b.length - i]!;
      if ((byte & 0xc0) === 0x80) continue;
      const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
      if (i < need) end = b.length - i;
      break;
    }
    new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, end));
    return { name: "UTF-8", bom: "No byte-order mark", text: buf.toString("utf8") };
  } catch {
    return { name: "Not UTF-8: probably Windows-1252 or Latin-1", bom: "", text: buf.toString("latin1") };
  }
}

function indentText(tabs: number, spaces: number, widths: Map<number, number>): string {
  if (tabs && spaces) return `Mixed: ${tabs} lines with tabs, ${spaces} with spaces`;
  if (tabs) return "Tabs";
  if (!spaces) return "";
  for (const unit of [8, 4, 3, 2]) {
    let covered = 0;
    for (const [w, n] of widths) if (w % unit === 0) covered += n;
    if (covered / spaces >= 0.8) return `Spaces (${unit} per level)`;
  }
  return "Spaces (uneven widths)";
}

export function analyzeText(bytes: Uint8Array, totalSize: number): { stats: TextStats; text: string } {
  const { name, bom, text } = guessEncoding(bytes);
  let crlf = 0, lf = 0, cr = 0;
  let lines = 0, words = 0, longest = 0, blank = 0, tabs = 0, spaces = 0, chars = 0, cur = 0, lead = 0;
  const widths = new Map<number, number>();
  let inWord = false, lineStart = true, onlySpace = true;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    chars++;
    if (c === 10 || c === 13) {
      if (c === 13 && text.charCodeAt(i + 1) === 10) { crlf++; i++; } else if (c === 13) cr++; else lf++;
      lines++;
      if (onlySpace) blank++;
      longest = Math.max(longest, cur);
      cur = 0;
      lead = 0;
      lineStart = true;
      onlySpace = true;
      inWord = false;
      continue;
    }
    cur++;
    const space = c === 32 || c === 9 || c === 0xa0;
    if (lineStart) {
      if (c === 32) { lead++; continue; }
      lineStart = false;
      if (!space || c === 9) {
        if (c === 9) tabs++;
        else if (lead > 0) { spaces++; widths.set(lead, (widths.get(lead) ?? 0) + 1); }
      }
    }
    if (space) inWord = false;
    else {
      onlySpace = false;
      if (!inWord) { inWord = true; words++; }
    }
  }
  if (cur > 0) { lines++; longest = Math.max(longest, cur); if (onlySpace) blank++; }
  const kinds = [crlf && "Windows (CRLF)", lf && "Unix / macOS (LF)", cr && "Classic Mac (CR)"].filter(Boolean) as string[];
  const lineEnding = kinds.length === 0 ? "No line breaks" : kinds.length === 1 ? kinds[0]! : `Mixed: ${[crlf && `${crlf} CRLF`, lf && `${lf} LF`, cr && `${cr} CR`].filter(Boolean).join(", ")}`;
  const first = text.slice(0, 200).split(/\r?\n|\r/)[0] ?? "";
  return {
    text,
    stats: {
      encoding: name, bom, lineEnding, lines, words, chars, longest, trailingNewline: /[\r\n]$/.test(text), shebang: first.startsWith("#!") ? clip(first, 200) : "",
      indent: indentText(tabs, spaces, widths), truncated: totalSize > bytes.length, blankLines: blank,
    },
  };
}

export function textGroups(s: TextStats, json: Rows | null): InfoGroup[] {
  const ge = s.truncated ? "≥ " : "";
  const r = new Rows();
  r.add("Encoding", s.encoding, "How letters are turned into bytes. UTF-8 is the usual choice and handles every language.");
  r.add("Byte-order mark", s.bom, "A few invisible bytes at the very start. Some programs show them as strange characters.");
  r.add("Line endings", s.lineEnding, "How the end of a line is marked. Windows and Unix use different marks, which can confuse programs.", s.lineEnding.startsWith("Mixed") ? "warn" : undefined);
  r.add("Lines", `${ge}${s.lines.toLocaleString("en-US")}`).add("Empty lines", s.blankLines ? `${ge}${s.blankLines.toLocaleString("en-US")}` : "");
  r.add("Words", `${ge}${s.words.toLocaleString("en-US")}`).add("Characters", `${ge}${s.chars.toLocaleString("en-US")}`);
  r.add("Longest line", `${ge}${s.longest.toLocaleString("en-US")} characters`);
  r.add("Ends with a new line", s.lines > 0 ? (s.truncated ? "Not checked (large file)" : s.trailingNewline ? "Yes" : "No") : "", "Many tools expect the last line to end with a line break.");
  r.add("Indentation", s.indent, "Whether lines are shifted in with tabs or with spaces.");
  r.add("Starts with a #! line", s.shebang, "A first line like #!/bin/sh tells the system which program should run this file.");
  const g = r.group("document", "Text file", undefined, s.truncated ? "Only the first 4 MB were read. Counts marked ≥ are at least that many." : undefined);
  const out: InfoGroup[] = g ? [g] : [];
  if (json) {
    const jg = json.group("json", "JSON check");
    if (jg) out.push(jg);
  }
  return out;
}

export function jsonRows(text: string, complete: boolean): Rows | null {
  const t = text.trimStart();
  if (!/^[[{"\d\-tfn]/.test(t)) return null;
  const r = new Rows();
  if (!complete) {
    r.add("Valid JSON", "Not checked: the file is larger than the 4 MB sample");
    return r;
  }
  try {
    const v = JSON.parse(text.replace(/^\uFEFF/, ""));
    r.add("Valid JSON", "Yes", "Whether the file follows the JSON rules, so other programs can read it.", "good");
    const type = Array.isArray(v) ? "List (array)" : v === null ? "null" : typeof v === "object" ? "Object (a set of named values)" : typeof v;
    r.add("Top level is", type);
    if (Array.isArray(v)) r.add("Items", v.length.toLocaleString("en-US"));
    else if (v && typeof v === "object") {
      const keys = Object.keys(v);
      r.add("Keys", keys.length.toLocaleString("en-US")).add("First keys", keys.slice(0, 20).map((k) => clip(k, 60)).join(", "));
    }
  } catch (err: any) {
    r.add("Valid JSON", `No: ${clip(String(err?.message ?? "it can't be read"), 200)}`, "The file doesn't follow the JSON rules, so programs that read JSON may refuse it.", "warn");
  }
  return r;
}
