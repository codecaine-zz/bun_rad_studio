/**
 * Embedded color profiles (ICC) and XMP packets. XMP is read with a tiny tokenizer that only looks for a few
 * named elements: it never builds a document, never follows an entity or a DOCTYPE, and never fetches anything.
 */
import { ascii, be16, be32, clip, Rows } from "./fmInfoCommon";

export interface IccInfo {
  description: string;
  colorSpace: string;
  version: string;
  profileClass: string;
  pcs: string;
  cmm: string;
  size: number;
}

const ICC_CLASS: Record<string, string> = {
  scnr: "Input device (scanner or camera)", mntr: "Display", prtr: "Output device (printer)", link: "Device link", abst: "Abstract", spac: "Color space conversion", nmcl: "Named colors",
};
const ICC_SPACE: Record<string, string> = { "RGB ": "RGB", "CMYK": "CMYK", "GRAY": "Gray", "Lab ": "Lab", "XYZ ": "XYZ", "YCbr": "YCbCr", "HSV ": "HSV", "HLS ": "HLS", "CMY ": "CMY" };

function utf16be(buf: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < buf.length && out.length < 300; i += 2) out += String.fromCharCode(be16(buf, i));
  return out.replace(/\0/g, "");
}

/** Reads the header and the description of an ICC profile. */
export function parseIcc(p: Uint8Array): IccInfo | null {
  if (p.length < 132 || ascii(p, 36, 4) !== "acsp") return null;
  let description = "";
  const count = Math.min(be32(p, 128), 200);
  for (let i = 0; i < count; i++) {
    const e = 132 + i * 12;
    if (e + 12 > p.length) break;
    if (ascii(p, e, 4) !== "desc") continue;
    const off = be32(p, e + 4), size = be32(p, e + 8);
    if (off + 12 > p.length) break;
    const end = Math.min(p.length, off + Math.min(size, 4096));
    const type = ascii(p, off, 4);
    if (type === "desc") {
      const n = Math.min(be32(p, off + 8), 200);
      description = ascii(p, off + 12, Math.min(n, end - off - 12)).replace(/\0.*$/, "");
    } else if (type === "mluc") {
      const recs = be32(p, off + 8);
      if (recs > 0 && off + 28 <= end) {
        const len = be32(p, off + 20), at = be32(p, off + 24);
        description = utf16be(p.subarray(off + at, Math.min(end, off + at + Math.min(len, 600))));
      }
    }
    break;
  }
  const major = p[8] ?? 0, minor = (p[9] ?? 0) >> 4, bugfix = (p[9] ?? 0) & 15;
  const cls = ascii(p, 12, 4), space = ascii(p, 16, 4);
  return {
    description: clip(description).trim(), colorSpace: ICC_SPACE[space] ?? space.trim(), version: `${major}.${minor}.${bugfix}`, profileClass: ICC_CLASS[cls] ?? cls,
    pcs: ascii(p, 20, 4).trim(), cmm: ascii(p, 4, 4).replace(/\0/g, "").trim(), size: be32(p, 0),
  };
}

export function iccRows(icc: IccInfo | null, rows = new Rows()): Rows {
  if (!icc) return rows;
  rows.add("Color profile", icc.description || "Embedded profile", "An ICC profile tells programs exactly which colors the numbers in the picture mean, so it looks the same everywhere.");
  rows.add("Profile color space", icc.colorSpace, "The kind of color numbers the profile describes (RGB for screens, CMYK for printing).");
  rows.add("Profile version", icc.version).add("Profile type", icc.profileClass, "What the profile is for.").add("Profile size", icc.size ? `${icc.size.toLocaleString("en-US")} bytes` : "");
  return rows;
}

export interface XmpInfo {
  title: string;
  creator: string;
  rights: string;
  description: string;
  rating: string;
  keywords: string[];
  tool: string;
  created: string;
  modified: string;
  hasGps: boolean;
  bytes: number;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Only the five built-in entities and numeric references are decoded; any other entity is left as it is. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/g, (m, g: string) => {
    if (g[0] === "#") {
      const cp = g[1] === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return ENT[g] ?? m;
  });
}

function listItems(block: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (out.length < 50) {
    const open = block.indexOf("<rdf:li", at);
    if (open < 0) break;
    const gt = block.indexOf(">", open);
    if (gt < 0) break;
    const close = block.indexOf("</rdf:li>", gt);
    if (close < 0) break;
    out.push(clip(decodeEntities(block.slice(gt + 1, close).replace(/<[^>]{0,200}>/g, "")), 300).trim());
    at = close + 9;
  }
  return out.filter(Boolean);
}

/** Where `<tag` starts as a whole tag name (so `<item` doesn't match `<items>`), or -1. */
function openAt(xml: string, tag: string): number {
  let from = 0;
  for (;;) {
    const at = xml.indexOf(`<${tag}`, from);
    if (at < 0) return -1;
    const next = xml[at + tag.length + 1];
    if (next === undefined || next === ">" || next === "/" || next === " " || next === "\t" || next === "\n" || next === "\r") return at;
    from = at + 1;
  }
}

function element(xml: string, tag: string): string {
  const open = openAt(xml, tag);
  if (open < 0) return "";
  const gt = xml.indexOf(">", open);
  if (gt < 0) return "";
  if (xml[gt - 1] === "/") return "";
  const close = xml.indexOf(`</${tag}>`, gt);
  return close < 0 ? "" : xml.slice(gt + 1, close);
}

function simple(xml: string, tag: string): string {
  const block = element(xml, tag);
  if (block) {
    const items = listItems(block);
    if (items.length) return items[0]!;
    return clip(decodeEntities(block.replace(/<[^>]{0,200}>/g, "")), 300).trim();
  }
  const attr = new RegExp(`\\b${tag.replace(":", "\\:")}="([^"]{0,300})"`).exec(xml);
  return attr ? clip(decodeEntities(attr[1]!), 300).trim() : "";
}

/** Reads a few well-known fields from an XMP packet (text). */
export function parseXmp(packet: string): XmpInfo {
  const xml = packet.slice(0, 512 * 1024);
  const creatorBlock = element(xml, "dc:creator");
  return {
    title: simple(xml, "dc:title"),
    creator: creatorBlock ? listItems(creatorBlock).join(", ") : simple(xml, "dc:creator"),
    rights: simple(xml, "dc:rights"),
    description: simple(xml, "dc:description"),
    rating: simple(xml, "xmp:Rating"),
    keywords: listItems(element(xml, "dc:subject")),
    tool: simple(xml, "xmp:CreatorTool"),
    created: simple(xml, "xmp:CreateDate") || simple(xml, "photoshop:DateCreated"),
    modified: simple(xml, "xmp:ModifyDate"),
    hasGps: /exif:GPSLatitude/.test(xml),
    bytes: packet.length,
  };
}

/** The text inside the first `<tag ...>text</tag>` of an XML document (tags inside are dropped, entities decoded, nothing fetched). */
export function xmlText(xml: string, tag: string): string {
  const block = element(xml, tag);
  return block ? clip(decodeEntities(block.replace(/<[^>]{0,200}>/g, "")), 500).trim() : "";
}

/** One attribute of the first `<tag ...>` in an XML document. */
export function xmlAttr(xml: string, tag: string, attr: string): string {
  const open = openAt(xml, tag);
  if (open < 0) return "";
  const gt = xml.indexOf(">", open);
  const head = xml.slice(open, gt < 0 ? open + 2000 : gt);
  const m = new RegExp(`\\s${attr.replace(/[:.]/g, "\\$&")}\\s*=\\s*["']([^"']{0,300})["']`).exec(head);
  return m ? clip(decodeEntities(m[1]!), 300).trim() : "";
}

export function xmpRows(x: XmpInfo | null, rows = new Rows()): Rows {
  if (!x) return rows;
  rows.add("Title", x.title).add("Author / creator", x.creator).add("Copyright notice", x.rights).add("Description", x.description);
  rows.add("Star rating", x.rating).add("Keywords", x.keywords.join(", ")).add("Made with", x.tool).add("Created", x.created).add("Changed", x.modified);
  rows.add("Location inside XMP", x.hasGps ? "The XMP notes also hold GPS coordinates." : "", "XMP is a second place where a picture can keep its notes, including a location.", "warn");
  rows.add("XMP size", `${x.bytes.toLocaleString("en-US")} characters`, "XMP is a block of extra notes (title, author, rating, keywords) stored as text inside the file.");
  return rows;
}
