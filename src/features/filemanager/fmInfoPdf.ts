/**
 * PDF documents: a tolerant text scan for version, page count, page size, the Info dictionary and warning signs.
 * Nothing in the file is run or evaluated; "has JavaScript" is only a pattern found in the text.
 */
import { inflateSync } from "zlib";
import { clip, Rows, type InfoGroup, type Source } from "./fmInfoCommon";

const FULL_READ = 24 * 1024 * 1024;
const PART = 8 * 1024 * 1024;

export function pdfString(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("<") && s.endsWith(">")) {
    const hex = s.slice(1, -1).replace(/\s+/g, "");
    if (/^[0-9a-fA-F]*$/.test(hex)) {
      const b = Buffer.from(hex.length % 2 ? hex + "0" : hex, "hex");
      return clip(b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(2)).swap16().toString("utf16le") : b.toString("latin1"), 500).trim();
    }
  }
  if (s.startsWith("(")) s = s.slice(1, s.endsWith(")") ? -1 : undefined);
  s = s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_m, g: string) => {
    if (g === "n") return "\n";
    if (g === "r") return "\r";
    if (g === "t") return "\t";
    if (g === "b" || g === "f") return "";
    if (/^[0-7]/.test(g)) return String.fromCharCode(parseInt(g, 8) & 255);
    return g.startsWith("\n") || g.startsWith("\r") ? "" : g;
  });
  const b = Buffer.from(s, "latin1");
  return clip(b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(2)).swap16().toString("utf16le") : s, 500).trim();
}

export function pdfDate(v: string): string {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz]|[+-]\d{2}'?(?:\d{2}'?)?)?/.exec(v.trim());
  if (!m) return v;
  const zone = m[7] ? (m[7].toUpperCase() === "Z" ? " UTC" : ` (${m[7].replace(/'/g, "").replace(/^([+-]\d{2})(\d{2})?$/, (_x, h: string, mm?: string) => `${h}:${mm ?? "00"}`)})`) : "";
  return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"} ${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}${zone}`;
}

/** Finds `/Key value` in a dictionary text: a (string), <hex string>, or a /Name or number. */
function dictValue(dict: string, key: string): string | null {
  const at = dict.indexOf(`/${key}`);
  if (at < 0) return null;
  let i = at + key.length + 1;
  const next = dict[i];
  if (next && /[A-Za-z0-9]/.test(next)) return dictValue(dict.slice(i), key);
  while (i < dict.length && /\s/.test(dict[i]!)) i++;
  if (dict[i] === "(") {
    let depth = 0;
    for (let j = i; j < dict.length && j < i + 4000; j++) {
      const c = dict[j];
      if (c === "\\") { j++; continue; }
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return dict.slice(i, j + 1);
    }
    return dict.slice(i, i + 500);
  }
  if (dict[i] === "<" && dict[i + 1] !== "<") {
    const end = dict.indexOf(">", i);
    return end < 0 ? null : dict.slice(i, end + 1);
  }
  const m = /^[^\s/<>\[\]()]+/.exec(dict.slice(i, i + 80));
  return m ? m[0] : null;
}

export interface PdfInfo {
  version: string;
  pages: number | null;
  pageSize: string;
  encrypted: boolean;
  linearized: boolean;
  info: Record<string, string>;
  flags: Array<{ label: string; found: boolean; hint: string }>;
  partial: boolean;
}

async function readText(src: Source): Promise<{ text: string; partial: boolean }> {
  if (src.size <= FULL_READ) return { text: (await src.read(0, src.size)).toString("latin1"), partial: false };
  const head = await src.read(0, PART);
  const tail = await src.read(src.size - PART, PART);
  return { text: head.toString("latin1") + "\n" + tail.toString("latin1"), partial: true };
}

/** Inflates the object streams (modern PDFs keep most dictionaries in them) so their text can be scanned too. */
function objectStreamText(text: string): string {
  const out: string[] = [];
  let at = 0;
  let totalInflated = 0;
  const maxTotal = 4 * 1024 * 1024;
  for (let n = 0; n < 60 && totalInflated < maxTotal; n++) {
    const t = text.indexOf("/ObjStm", at);
    if (t < 0) break;
    at = t + 7;
    const s = text.indexOf("stream", t);
    if (s < 0) break;
    const start = text[s + 6] === "\r" ? s + 8 : s + 7;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    if (end - start > 512 * 1024) continue;
    try {
      const inflated = inflateSync(Buffer.from(text.slice(start, end), "latin1"), { maxOutputLength: maxTotal - totalInflated });
      totalInflated += inflated.length;
      out.push(inflated.toString("latin1"));
    } catch {
      // not Flate data (or too big): skipped
    }
  }
  return out.join("\n");
}

export async function parsePdf(src: Source): Promise<PdfInfo> {
  const { text, partial } = await readText(src);
  const first = text.indexOf("%PDF-");
  const version = first >= 0 ? (/^%PDF-(\d\.\d)/.exec(text.slice(first, first + 12))?.[1] ?? "") : "";
  const all = text + "\n" + objectStreamText(text);
  const info: PdfInfo = { version, pages: null, pageSize: "", encrypted: false, linearized: text.slice(0, 2048).includes("/Linearized"), info: {}, flags: [], partial };
  info.encrypted = /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(text.slice(-65536)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(text.slice(0, 4096));

  // Page count: the largest /Count of a /Pages node, or the number of /Page objects.
  let count = 0;
  for (let at = 0, n = 0; n < 5000; n++) {
    const p = all.indexOf("/Pages", at);
    if (p < 0) break;
    at = p + 6;
    if (/[A-Za-z]/.test(all[p + 6] ?? "")) continue;
    const lo = Math.max(0, p - 800);
    const win = all.slice(lo, p + 800);
    const from = win.lastIndexOf("<<", p - lo), to = win.indexOf(">>", p - lo);
    const dict = win.slice(Math.max(0, from), to < 0 ? win.length : to + 2);
    if (!/\/Type\s*\/Pages\b/.test(dict)) continue;
    const c = /\/Count\s+(\d{1,7})/.exec(dict)?.[1];
    if (c) count = Math.max(count, Number(c));
  }
  if (count > 0) info.pages = count;
  else {
    let n = 0;
    for (const m of all.matchAll(/\/Type\s*\/Page(?![A-Za-z])/g)) { n++; if (n > 100000) break; }
    info.pages = n || null;
  }
  const box = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(all);
  if (box) {
    const w = Math.abs(Number(box[3]) - Number(box[1])), h = Math.abs(Number(box[4]) - Number(box[2]));
    if (w > 0 && h > 0) {
      const inch = (x: number) => Math.round((x / 72) * 100) / 100;
      const named = ([[595, 842, "A4"], [612, 792, "US Letter"], [612, 1008, "US Legal"], [420, 595, "A5"], [842, 1191, "A3"]] as const).find(([a, b]) => (Math.abs(w - a) <= 2 && Math.abs(h - b) <= 2) || (Math.abs(w - b) <= 2 && Math.abs(h - a) <= 2));
      info.pageSize = `${Math.round(w)} × ${Math.round(h)} points (${inch(w)} × ${inch(h)} inches)${named ? `, ${named[2]}` : ""}`;
    }
  }
  // The Info dictionary: the trailer says which object it is.
  const ref = [...all.matchAll(/\/Info\s+(\d+)\s+(\d+)\s+R/g)].pop();
  if (ref) {
    const head = new RegExp(`(?:^|[\\s>])${ref[1]}\\s+${ref[2]}\\s+obj\\b`);
    const m = head.exec(all);
    if (m) {
      const end = all.indexOf("endobj", m.index);
      const dict = all.slice(m.index, end < 0 ? m.index + 8000 : Math.min(end, m.index + 8000));
      for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"]) {
        const v = dictValue(dict, key);
        if (v) info.info[key] = key.endsWith("Date") ? pdfDate(pdfString(v)) : v.startsWith("(") || v.startsWith("<") ? pdfString(v) : clip(v.replace(/^\//, ""), 100);
      }
    }
  }
  const has = (re: RegExp) => re.test(all);
  info.flags = [
    { label: "JavaScript", found: has(/\/JavaScript\b|\/JS\s*[(<]/), hint: "A PDF can contain small programs. They run when you open it in some viewers." },
    { label: "Launch action", found: has(/\/Launch\b/), hint: "A PDF can ask your computer to start another program." },
    { label: "Embedded files", found: has(/\/EmbeddedFile\b/), hint: "Other files can be hidden inside a PDF." },
    { label: "Runs something when opened", found: has(/\/OpenAction\b|\/AA\s*<</), hint: "An action that happens as soon as the PDF is opened." },
    { label: "Sends form data", found: has(/\/SubmitForm\b/), hint: "A form that can send what you type to a web address." },
    { label: "Media or 3D content", found: has(/\/RichMedia\b|\/Movie\b|\/3D\b/), hint: "Video, sound or 3D objects inside the PDF." },
  ];
  return info;
}

export function pdfGroups(p: PdfInfo): InfoGroup[] {
  const groups: InfoGroup[] = [];
  const r = new Rows();
  r.add("PDF version", p.version, "The version of the PDF standard the file follows.");
  r.add("Pages", p.pages, "How many pages the document has.").add("Page size", p.pageSize, "The size of the first page.");
  r.add("Password-protected", p.encrypted ? "Yes (encrypted)" : "No", "An encrypted PDF is scrambled so only people with the password can read it.", p.encrypted ? "warn" : undefined);
  r.add("Fast web view", p.linearized ? "Yes (linearized)" : "No", "A 'linearized' PDF can show its first page before the whole file has downloaded.");
  const g = r.group("document", "PDF document", undefined, p.partial ? "Large file: only its first and last parts were scanned, so some facts may be missing." : undefined);
  if (g) groups.push(g);
  const i = new Rows();
  const label: Record<string, string> = { Title: "Title", Author: "Author", Subject: "Subject", Keywords: "Keywords", Creator: "Made with", Producer: "PDF made by", CreationDate: "Created", ModDate: "Changed", Trapped: "Trapped" };
  for (const [k, v] of Object.entries(p.info)) i.add(label[k] ?? k, v, k === "Producer" ? "The program that wrote the PDF file itself." : k === "Creator" ? "The program the document was first made in." : undefined);
  const gi = i.group("docinfo", "Document details", "Details the author's program stored in the PDF.");
  if (gi) groups.push(gi);
  const s = new Rows();
  for (const f of p.flags) s.add(f.label, f.found ? "Found. It was NOT run." : "Not found", f.hint, f.found ? "warn" : "good");
  const gs = s.group("security", "PDF safety check", "Signs of active content, found by scanning the file's text. Nothing was run, so this can miss hidden or scrambled content.");
  if (gs) groups.push(gs);
  return groups;
}
