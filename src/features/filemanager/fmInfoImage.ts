/** Pictures: finds out what kind of picture a file is and reads what is inside, with built-in readers only. */
import { ascii, clip, formatDuration, HEAD_BYTES, le16, le32, Rows, type InfoGroup, type Source } from "./fmInfoCommon";
import { parseTiff, type ExifData } from "./fmInfoExif";
import { parseJpeg } from "./fmInfoJpeg";
import type { IccInfo, XmpInfo } from "./fmInfoMeta";
import { parsePng } from "./fmInfoPng";
import { looksLikeSvg, parseSvg, svgGroups, type SvgInfo } from "./fmInfoSvg";
import { COMPRESSION_TIFF, PHOTOMETRIC, name } from "./fmInfoTables";
import { parseHeif, parseWebp } from "./fmInfoImage2";

export type ImageKind = "png" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tiff" | "heif" | "svg";

export interface ImageAnalysis {
  kind: ImageKind;
  format: string;
  label: string;
  mime: string;
  width: number | null;
  height: number | null;
  animated: boolean;
  hasAlpha: boolean | null;
  rows: Rows;
  groups: InfoGroup[];
  exif: ExifData | null;
  icc: IccInfo | null;
  xmp: XmpInfo | null;
  hasIptc: boolean;
  textNotes: number;
  svg: SvgInfo | null;
  partial: boolean;
  notes: string[];
}

const KINDS: Record<ImageKind, { format: string; label: string; mime: string }> = {
  png: { format: "PNG", label: "PNG picture", mime: "image/png" },
  jpeg: { format: "JPEG", label: "JPEG photo", mime: "image/jpeg" },
  gif: { format: "GIF", label: "GIF picture", mime: "image/gif" },
  webp: { format: "WebP", label: "WebP picture", mime: "image/webp" },
  bmp: { format: "BMP", label: "BMP bitmap", mime: "image/bmp" },
  ico: { format: "ICO / CUR", label: "Icon", mime: "image/x-icon" },
  tiff: { format: "TIFF", label: "TIFF picture", mime: "image/tiff" },
  heif: { format: "HEIC / AVIF", label: "HEIC or AVIF picture", mime: "image/heif" },
  svg: { format: "SVG", label: "SVG drawing", mime: "image/svg+xml" },
};

export function detectImageKind(head: Uint8Array): ImageKind | null {
  const s = ascii(head, 0, 12);
  if (head[0] === 0x89 && s.slice(1, 4) === "PNG") return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (s.startsWith("GIF87a") || s.startsWith("GIF89a")) return "gif";
  if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") return "webp";
  if (s.startsWith("BM") && head.length >= 26) return "bmp";
  if (head[0] === 0 && head[1] === 0 && (head[2] === 1 || head[2] === 2) && head[3] === 0 && (head[4] ?? 0) + ((head[5] ?? 0) << 8) > 0) return "ico";
  if ((s.startsWith("II*\0") || s.startsWith("MM\0*")) ) return "tiff";
  if (s.slice(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif|avis)/.test(ascii(head, 8, 4))) return "heif";
  if (looksLikeSvg(Buffer.from(head.subarray(0, 8192)).toString("utf8"))) return "svg";
  return null;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function aspectText(w: number, h: number): string {
  if (!w || !h) return "";
  const g = gcd(w, h);
  const a = w / g, b = h / g;
  return a <= 50 && b <= 50 ? `${a}:${b}` : `${(Math.round((w / h) * 100) / 100).toString()}:1`;
}

function parseBmp(head: Buffer): Rows {
  const r = new Rows();
  const size = le32(head, 14);
  let w: number, h: number, bpp: number, comp = 0, dpiX = 0, dpiY = 0, colors = 0;
  if (size === 12) {
    w = le16(head, 18);
    h = le16(head, 20);
    bpp = le16(head, 24);
  } else {
    w = head.readInt32LE(18);
    h = head.readInt32LE(22);
    bpp = le16(head, 28);
    comp = le32(head, 30);
    dpiX = head.readInt32LE(38);
    dpiY = head.readInt32LE(42);
    colors = le32(head, 46);
  }
  r.add("Width × height", `${Math.abs(w)} × ${Math.abs(h)} pixels`);
  r.add("Row order", h < 0 ? "Top to bottom" : "Bottom to top (the usual BMP way)");
  r.add("Bits per pixel", bpp, "How many bits describe one pixel. 24 means full colour; 32 adds transparency.");
  r.add("Compression", ["None", "RLE 8-bit", "RLE 4-bit", "Bit fields", "JPEG", "PNG", "Bit fields with alpha"][comp] ?? `Method ${comp}`, "Most BMP files are not compressed, which is why they are large.");
  if (dpiX > 0 && dpiY > 0) r.add("Pixel density", `${Math.round(dpiX * 0.0254)} × ${Math.round(dpiY * 0.0254)} DPI`, "How many pixels fit in an inch when printed.");
  r.add("Palette colours", colors || "");
  r.add("DIB header", size === 12 ? "OS/2 core" : size === 40 ? "Windows (BITMAPINFOHEADER)" : `${size} bytes`);
  return r;
}

function parseIco(head: Buffer): { rows: Rows; w: number; h: number; count: number } {
  const rows = new Rows();
  const type = le16(head, 2);
  const count = Math.min(le16(head, 4), 256);
  const sizes: string[] = [];
  let bw = 0, bh = 0;
  for (let i = 0; i < count && 6 + i * 16 + 16 <= head.length; i++) {
    const e = 6 + i * 16;
    const w = head[e] || 256, h = head[e + 1] || 256;
    const bpp = le16(head, e + 6);
    if (w * h > bw * bh) { bw = w; bh = h; }
    sizes.push(`${w}×${h}${bpp && type === 1 ? ` (${bpp}-bit)` : ""}`);
  }
  rows.add("Kind", type === 2 ? "Cursor (.cur)" : "Icon (.ico)").add("Pictures inside", count, "An icon file holds several copies of the same picture at different sizes.");
  rows.add("Sizes", sizes.join(", "));
  return { rows, w: bw, h: bh, count };
}

async function parseGif(src: Source, deadline = Date.now() + 6000): Promise<{ rows: Rows; w: number; h: number; frames: number; animated: boolean; partial: boolean; comments: string[] }> {
  const rows = new Rows();
  const h = await src.read(0, 13);
  const w = le16(h, 6), ht = le16(h, 8), packed = h[10]!;
  const gct = (packed & 0x80) !== 0 ? 1 << ((packed & 7) + 1) : 0;
  rows.add("Version", ascii(h, 0, 6)).add("Colours in the main palette", gct || "", "GIF pictures use at most 256 colours.");
  let pos = 13 + gct * 3;
  let frames = 0, duration = 0, loops: number | null = null, partial = false, interlaced = false, transparent = false;
  const comments: string[] = [];
  const skipBlocks = async (at: number): Promise<number> => {
    let p = at;
    for (;;) {
      const b = await src.read(p, 1);
      if (!b.length) return -1;
      if (b[0] === 0) return p + 1;
      p += 1 + b[0]!;
      if (p > src.size) return -1;
    }
  };
  while (pos < src.size) {
    if (Date.now() > deadline || frames > 100_000) { partial = true; break; }
    const t = await src.read(pos, 2);
    if (!t.length) break;
    if (t[0] === 0x3b) break;
    if (t[0] === 0x21 && t.length === 2) {
      const label = t[1]!;
      if (label === 0xf9) {
        const d = await src.read(pos + 2, 6);
        if (d.length >= 6) {
          duration += le16(d, 2) / 100;
          if ((d[1]! & 1) !== 0) transparent = true;
        }
      } else if (label === 0xff) {
        const d = await src.read(pos + 2, 17);
        if (d.length >= 17 && ascii(d, 1, 11) === "NETSCAPE2.0" && d[12] === 3) loops = le16(d, 14);
      } else if (label === 0xfe && comments.length < 3) {
        const d = await src.read(pos + 2, 256);
        comments.push(clip(Buffer.from(d.subarray(1, 1 + (d[0] ?? 0))).toString("latin1"), 300));
      }
      const next = await skipBlocks(pos + 2);
      if (next < 0) { partial = true; break; }
      pos = next;
    } else if (t[0] === 0x2c) {
      const d = await src.read(pos + 1, 9);
      if (d.length < 9) { partial = true; break; }
      const lp = d[8]!;
      if (frames === 0) interlaced = (lp & 0x40) !== 0;
      frames++;
      const lct = (lp & 0x80) !== 0 ? 3 * (1 << ((lp & 7) + 1)) : 0;
      const next = await skipBlocks(pos + 10 + lct + 1);
      if (next < 0) { partial = true; break; }
      pos = next;
    } else { partial = true; break; }
  }
  const animated = frames > 1;
  rows.add("Frames", `${partial ? "at least " : ""}${frames}`, "A GIF can hold several pictures shown one after another, like a short film.");
  if (animated) {
    rows.add("Animation length", formatDuration(duration)).add("Loops", loops === null ? "Plays once" : loops === 0 ? "Forever" : `${loops} time${loops === 1 ? "" : "s"}`);
  }
  rows.add("Interlaced", interlaced ? "Yes" : "No", "An interlaced picture appears in a rough form first while it loads.").add("Transparency", transparent ? "Yes" : "No");
  return { rows, w, h: ht, frames, animated, partial, comments };
}

function parseTiffImage(buf: Buffer, size: number): { rows: Rows; w: number | null; h: number | null; exif: ExifData | null; partial: boolean } {
  const exif = parseTiff(buf);
  const rows = new Rows();
  if (!exif) return { rows, w: null, h: null, exif: null, partial: true };
  const n = (id: number) => { const t = exif.tags.find((x) => x.ifd === "IFD0" && x.id === id); const v = Array.isArray(t?.value) ? t!.value[0] : t?.value; return typeof v === "number" ? v : null; };
  const bits = exif.tags.find((x) => x.ifd === "IFD0" && x.id === 0x102)?.value;
  const comp = n(0x103), photo = n(0x106), spp = n(0x115);
  rows.add("Byte order", exif.littleEndian ? "Little-endian (II)" : "Big-endian (MM)", "How the numbers in the file are written. It doesn't affect the picture.");
  rows.add("Compression", comp !== null ? name(COMPRESSION_TIFF, comp) : "").add("Colour model", photo !== null ? name(PHOTOMETRIC, photo) : "", "How the colours of each pixel are stored.");
  rows.add("Channels", spp, "How many numbers describe one pixel.").add("Bits per channel", Array.isArray(bits) ? bits.join(", ") : bits);
  rows.add("Planar layout", n(0x11c) === 2 ? "Separate planes" : n(0x11c) === 1 ? "Chunky (interleaved)" : "");
  return { rows, w: n(0x100), h: n(0x101), exif, partial: exif.partial || size > buf.length };
}

/** Reads a picture file. Never throws: a damaged file gives a partial answer with a note. */
export async function analyzeImage(src: Source, extHint = ""): Promise<ImageAnalysis | null> {
  const head = await src.read(0, 64);
  let kind = detectImageKind(head);
  if (!kind && extHint === "svg") kind = "svg";
  if (!kind) return null;
  const meta = KINDS[kind];
  const out: ImageAnalysis = { kind, ...meta, width: null, height: null, animated: false, hasAlpha: null, rows: new Rows(), groups: [], exif: null, icc: null, xmp: null, hasIptc: false, textNotes: 0, svg: null, partial: false, notes: [] };
  try {
    if (kind === "png") {
      const p = await parsePng(src);
      Object.assign(out, { width: p.width, height: p.height, rows: p.rows, groups: p.groups, exif: p.exif, icc: p.icc, xmp: p.xmp, hasAlpha: p.hasAlpha, animated: p.frames > 1, textNotes: p.textCount, partial: p.partial });
    } else if (kind === "jpeg") {
      const j = await parseJpeg(src);
      const r = out.rows;
      Object.assign(out, { width: j.width, height: j.height, exif: j.exif, icc: j.icc, xmp: j.xmp, hasIptc: j.hasIptc, partial: j.partial });
      r.add("JPEG type", j.sof ? `${j.sof}${j.progressive ? " (loads blurry first, then sharpens)" : ""}` : "", "Progressive JPEGs show a rough picture first and sharpen as they load. Baseline ones load top to bottom.");
      r.add("Bits per channel", j.precision).add("Channels", j.components, "How many numbers describe one pixel (3 = red, green, blue).");
      r.add("Chroma subsampling", j.subsampling, "How much colour detail was dropped to save space. 4:4:4 keeps all of it; 4:2:0 is the usual saving.");
      r.add("Quality (estimate)", j.quality ? `about ${j.quality} of 100` : "", "A guess of the 'quality' setting used when the file was saved. Higher keeps more detail and makes bigger files.");
      if (j.jfif) {
        r.add("JFIF version", j.jfif.version);
        if (j.jfif.units.startsWith("dots")) r.add("Pixel density", `${j.jfif.density} (${j.jfif.units})`, "How many pixels fit in a unit when printed.");
      }
      r.add("Colour handling", j.adobe, "Which program-specific colour mode the file declares.");
      for (const c of j.comments) r.add("Comment", c);
      const seg = new Rows();
      seg.add("Segments", j.segments.map((s) => (s.detail ? `${s.name} (${s.detail})` : s.name)).join(", "), "A JPEG file is a list of labelled blocks. APP blocks carry notes: EXIF is the camera's notes, XMP is extra text.");
      seg.add("Multi-picture data (MPF)", j.hasMpf ? "Present: the file holds extra pictures, such as a preview or depth map" : "");
      const g = seg.group("jpeg-structure", "JPEG structure");
      if (g) out.groups.push(g);
    } else if (kind === "gif") {
      const g = await parseGif(src);
      Object.assign(out, { width: g.w, height: g.h, rows: g.rows, animated: g.animated, partial: g.partial });
      out.textNotes = g.comments.length;
      if (g.comments.length) { const r = new Rows(); g.comments.forEach((c) => r.add("Comment", c)); const grp = r.group("gif-comments", "Comments inside the picture"); if (grp) out.groups.push(grp); }
    } else if (kind === "webp") {
      const w = await parseWebp(src);
      Object.assign(out, { width: w.width, height: w.height, rows: w.rows, animated: w.animated, hasAlpha: w.alpha, exif: w.exif, xmp: w.xmp, icc: w.icc, partial: w.partial });
    } else if (kind === "bmp") {
      const b = await src.read(0, 64);
      if (b.length < 26) out.partial = true;
      else {
        out.rows = parseBmp(Buffer.from(b));
        const size = le32(b, 14);
        out.width = size === 12 ? le16(b, 18) : Math.abs(b.readInt32LE(18));
        out.height = size === 12 ? le16(b, 20) : Math.abs(b.readInt32LE(22));
      }
    } else if (kind === "ico") {
      const b = await src.read(0, 6 + 256 * 16);
      const i = parseIco(Buffer.from(b));
      Object.assign(out, { rows: i.rows, width: i.w, height: i.h });
      out.notes.push("The size shown is that of the largest picture inside.");
    } else if (kind === "tiff") {
      const b = await src.read(0, HEAD_BYTES);
      const t = parseTiffImage(Buffer.from(b), src.size);
      Object.assign(out, { rows: t.rows, width: t.w, height: t.h, exif: t.exif, partial: t.partial });
    } else if (kind === "heif") {
      const hf = await parseHeif(src);
      Object.assign(out, { rows: hf.rows, width: hf.width, height: hf.height, partial: hf.partial, hasAlpha: null });
      out.notes.push("HEIC and AVIF are read only for size and colour details. Install ExifTool to also see camera notes and location.");
    } else if (kind === "svg") {
      const b = await src.read(0, 2 * 1024 * 1024);
      const s = parseSvg(Buffer.from(b).toString("utf8"));
      if (!s) out.partial = true;
      else {
        const g = svgGroups(s);
        Object.assign(out, { svg: s, rows: g.rows, groups: g.groups, width: s.pixelWidth, height: s.pixelHeight });
        if (src.size > b.length) out.partial = true;
      }
    }
  } catch {
    out.partial = true;
  }
  if (out.partial) out.notes.push("Partly readable: the file is damaged, cut short or uses a part of the format that isn't read here.");
  return out;
}

export function commonImageRows(a: ImageAnalysis): Rows {
  const r = new Rows();
  r.add("Format", a.label);
  if (a.width && a.height) {
    r.add("Size", `${a.width.toLocaleString("en-US")} × ${a.height.toLocaleString("en-US")} pixels`, "A pixel is one tiny dot of the picture. Width × height.");
    r.add("Aspect ratio", aspectText(a.width, a.height), "The shape of the picture: width compared with height.");
    r.add("Megapixels", `${Math.round(((a.width * a.height) / 1e6) * 100) / 100} MP`, "One megapixel is a million pixels.");
  }
  for (const row of a.rows.rows) r.rows.push(row);
  return r;
}
