/** Builders for small, byte-accurate files used by the "More info" tests. Nothing here depends on the code under test. */
import { crc32, deflateSync } from "zlib";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";

const REPO = join(import.meta.dir, "..");

/** A fresh scratch folder inside the project (never in a system temp folder). */
export function scratchRoot(name: string): { dir: string; remove: () => void } {
  const dir = mkdtempSync(join(REPO, `scratch_info_${name}_`));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------------------------------------------
// TIFF / EXIF
// ---------------------------------------------------------------------------------------------------------------

export interface TagEntry {
  id: number;
  type: number;
  value: number[] | string | Array<[number, number]>;
}

const UNIT: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8 };
export const ascii = (id: number, value: string): TagEntry => ({ id, type: 2, value });
export const short = (id: number, ...value: number[]): TagEntry => ({ id, type: 3, value });
export const long = (id: number, ...value: number[]): TagEntry => ({ id, type: 4, value });
export const rational = (id: number, ...value: Array<[number, number]>): TagEntry => ({ id, type: 5, value });
export const srational = (id: number, ...value: Array<[number, number]>): TagEntry => ({ id, type: 10, value });
export const undef = (id: number, value: number[] | string): TagEntry => ({ id, type: 7, value: typeof value === "string" ? [...Buffer.from(value, "latin1")] : value });
export const byte = (id: number, ...value: number[]): TagEntry => ({ id, type: 1, value });

function count(e: TagEntry): number {
  return typeof e.value === "string" ? e.value.length + 1 : e.value.length;
}
const bytesOf = (e: TagEntry) => count(e) * (UNIT[e.type] ?? 1);
const evenPad = (n: number) => n + (n & 1);

export interface TiffOptions {
  le?: boolean;
  ifd0: TagEntry[];
  exif?: TagEntry[];
  gps?: TagEntry[];
  ifd1?: TagEntry[];
  /** Make the first IFD point back at itself (a loop that a careless reader would follow forever). */
  loop?: boolean;
}

/** A TIFF structure ("II*\0" or "MM\0*") with the given tag lists. */
export function tiff(o: TiffOptions): Buffer {
  const le = o.le ?? false;
  const w16 = (b: Buffer, v: number, at: number) => (le ? b.writeUInt16LE(v, at) : b.writeUInt16BE(v, at));
  const w32 = (b: Buffer, v: number, at: number) => (le ? b.writeUInt32LE(v >>> 0, at) : b.writeUInt32BE(v >>> 0, at));
  const w32s = (b: Buffer, v: number, at: number) => (le ? b.writeInt32LE(v, at) : b.writeInt32BE(v, at));
  const ptr = (id: number): TagEntry => long(id, 0);
  const lists: Array<{ name: string; entries: TagEntry[] }> = [{ name: "ifd0", entries: [...o.ifd0, ...(o.exif ? [ptr(0x8769)] : []), ...(o.gps ? [ptr(0x8825)] : [])] }];
  if (o.exif) lists.push({ name: "exif", entries: [...o.exif, ...(o.loop ? [ptr(0xa005)] : [])] });
  if (o.gps) lists.push({ name: "gps", entries: o.gps });
  if (o.ifd1) lists.push({ name: "ifd1", entries: o.ifd1 });
  for (const l of lists) l.entries.sort((a, b) => a.id - b.id);
  const size = (entries: TagEntry[]) => 2 + entries.length * 12 + 4 + entries.reduce((n, e) => n + (bytesOf(e) > 4 ? evenPad(bytesOf(e)) : 0), 0);
  const offsets = new Map<string, number>();
  let at = 8;
  for (const l of lists) {
    offsets.set(l.name, at);
    at += size(l.entries);
  }
  const out = Buffer.alloc(at);
  out.write(le ? "II" : "MM", 0, "latin1");
  w16(out, 42, 2);
  w32(out, 8, 4);
  for (const l of lists) {
    const start = offsets.get(l.name)!;
    w16(out, l.entries.length, start);
    let extra = start + 2 + l.entries.length * 12 + 4;
    l.entries.forEach((e, i) => {
      const p = start + 2 + i * 12;
      w16(out, e.id, p);
      w16(out, e.type, p + 2);
      w32(out, count(e), p + 4);
      let value = e.id === 0x8769 && e.type === 4 && l.name === "ifd0" ? offsets.get("exif")! : e.id === 0x8825 && l.name === "ifd0" ? offsets.get("gps")! : e.id === 0xa005 && l.name === "exif" ? start : null;
      const raw = Buffer.alloc(Math.max(4, evenPad(bytesOf(e))));
      if (value !== null) w32(raw, value, 0);
      else if (typeof e.value === "string") raw.write(e.value, 0, "latin1");
      else
        e.value.forEach((v, k) => {
          if (Array.isArray(v)) {
            if (e.type === 10) { w32s(raw, v[0], k * 8); w32s(raw, v[1], k * 8 + 4); } else { w32(raw, v[0], k * 8); w32(raw, v[1], k * 8 + 4); }
          } else if (e.type === 3 || e.type === 8) w16(raw, v, k * 2);
          else if (e.type === 4 || e.type === 9) w32(raw, v, k * 4);
          else raw[k] = v & 255;
        });
      value = null;
      if (bytesOf(e) <= 4) raw.copy(out, p + 8, 0, 4);
      else {
        w32(out, extra, p + 8);
        raw.copy(out, extra);
        extra += evenPad(bytesOf(e));
      }
    });
    const next = l.name === "ifd0" ? (o.ifd1 ? offsets.get("ifd1")! : o.loop ? 8 : 0) : 0;
    w32(out, next, start + 2 + l.entries.length * 12);
  }
  return out;
}

/** The EXIF block a JPEG keeps in an APP1 segment. */
export const exifBlock = (t: Buffer) => Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t]);

/** A photo's typical EXIF: camera, lens, settings and a GPS position (48°51'29.6" N, 2°17'40.2" E, 35.5 m). */
export function photoTiff(le: boolean, extra: Partial<TiffOptions> = {}): Buffer {
  return tiff({
    le,
    ifd0: [ascii(0x10f, "Canon"), ascii(0x110, "Canon EOS R5"), short(0x112, 6), rational(0x11a, [72, 1]), rational(0x11b, [72, 1]), short(0x128, 2), ascii(0x131, "Test Software 1.0"), ascii(0x132, "2024:05:01 12:34:56"), ascii(0x13b, "Jane Doe"), ascii(0x8298, "(c) Jane")],
    exif: [
      rational(0x829a, [1, 250]), rational(0x829d, [28, 10]), short(0x8822, 3), short(0x8827, 400), undef(0x9000, "0232"), ascii(0x9003, "2024:05:01 12:34:56"), ascii(0x9011, "+02:00"),
      short(0x9207, 5), short(0x9209, 16), rational(0x920a, [50, 1]), short(0xa001, 1), long(0xa002, 640), long(0xa003, 480), short(0xa403, 0), short(0xa405, 75),
      ascii(0xa431, "123456789"), ascii(0xa434, "RF24-70mm F2.8 L IS USM"), undef(0x927c, "MAKERNOTE-BYTES-0123456789"),
    ],
    gps: [ascii(1, "N"), rational(2, [48, 1], [51, 1], [296, 10]), ascii(3, "E"), rational(4, [2, 1], [17, 1], [402, 10]), byte(5, 0), rational(6, [355, 10]), rational(17, [900, 10]), ascii(18, "WGS-84")],
    ifd1: [long(0x201, 1000), long(0x202, 20)],
    ...extra,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------------------------------------------

export function chunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
export const text = (key: string, value: string) => chunk("tEXt", Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0]), Buffer.from(value, "latin1")]));
export const ztxt = (key: string, value: string) => chunk("zTXt", Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0, 0]), deflateSync(Buffer.from(value, "latin1"))]));
export const itxt = (key: string, value: string, compressed = false) =>
  chunk("iTXt", Buffer.concat([Buffer.from(key, "latin1"), Buffer.from([0, compressed ? 1 : 0, 0, 0, 0]), compressed ? deflateSync(Buffer.from(value, "utf8")) : Buffer.from(value, "utf8")]));
export const phys = (ppm: number) => chunk("pHYs", Buffer.concat([u32(ppm), u32(ppm), Buffer.from([1])]));

/** A small valid ICC profile that says its description is `description`. */
export function icc(description = "Test sRGB profile"): Buffer {
  const desc = Buffer.concat([Buffer.from("desc\0\0\0\0", "latin1"), u32(description.length + 1), Buffer.from(`${description}\0`, "latin1"), Buffer.alloc(78)]);
  const header = Buffer.alloc(128);
  header.writeUInt32BE(128 + 4 + 12 + desc.length, 0);
  header.write("lcms", 4, "latin1");
  header.writeUInt32BE(0x02400000, 8);
  header.write("mntr", 12, "latin1");
  header.write("RGB ", 16, "latin1");
  header.write("XYZ ", 20, "latin1");
  header.write("acsp", 36, "latin1");
  const table = Buffer.concat([u32(1), Buffer.from("desc", "latin1"), u32(128 + 16), u32(desc.length)]);
  return Buffer.concat([header, table, desc]);
}
export const iccp = (name: string, profile: Buffer) => chunk("iCCP", Buffer.concat([Buffer.from(name, "latin1"), Buffer.from([0, 0]), deflateSync(profile)]));

export interface PngOptions {
  w?: number;
  h?: number;
  /** PNG color type: 0 gray, 2 RGB, 3 palette, 4 gray+alpha, 6 RGBA. */
  colorType?: number;
  depth?: number;
  interlace?: number;
  before?: Buffer[];
  after?: Buffer[];
  trailing?: Buffer;
}

export function png(o: PngOptions = {}): Buffer {
  const w = o.w ?? 2, h = o.h ?? 2, ct = o.colorType ?? 2, depth = o.depth ?? 8;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ct]!;
  const rowBytes = Math.ceil((w * channels * depth) / 8);
  const raw = Buffer.alloc((rowBytes + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < rowBytes; x++) raw[y * (rowBytes + 1) + 1 + x] = (x * 40 + y * 70 + 10) & 255;
  const ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([depth, ct, 0, 0, o.interlace ?? 0])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), ...(ct === 3 ? [chunk("PLTE", Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]))] : []),
    ...(o.before ?? []), chunk("IDAT", deflateSync(raw)), ...(o.after ?? []), chunk("IEND"), ...(o.trailing ? [o.trailing] : []),
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------------------------------------------

const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];

/** A quantisation table as libjpeg writes it for a quality setting, in the order the file stores it. */
export function quantTable(quality: number, chroma = false): number[] {
  const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
  const base = chroma ? [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array<number>(32).fill(99)] : STD_LUMA;
  return ZIGZAG.map((n) => Math.max(1, Math.min(255, Math.floor((base[n]! * scale + 50) / 100))));
}

export const segment = (marker: number, data: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(data.length + 2) >> 8, (data.length + 2) & 255]), data]);
export const app1Exif = (t: Buffer) => segment(0xe1, exifBlock(t));
export const app1Xmp = (xml: string) => segment(0xe1, Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(xml, "utf8")]));
export const com = (s: string) => segment(0xfe, Buffer.from(s, "latin1"));

export const SCAN_DATA = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0x78, 0x9a, 0xff, 0xd0, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0xff, 0x00, 0x33]);

export interface JpegOptions {
  w?: number;
  h?: number;
  progressive?: boolean;
  quality?: number;
  segments?: Buffer[];
  jfif?: boolean;
  gray?: boolean;
  subsampling?: "420" | "422" | "444";
  trailing?: Buffer;
}

export function jpeg(o: JpegOptions = {}): Buffer {
  const w = o.w ?? 64, h = o.h ?? 48;
  const jfif = o.jfif === false ? [] : [segment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0]))];
  const comps = o.gray ? [[1, 0x11, 0]] : [[1, o.subsampling === "444" ? 0x11 : o.subsampling === "422" ? 0x21 : 0x22, 0], [2, 0x11, 1], [3, 0x11, 1]];
  const sof = Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, comps.length, ...comps.flat()]);
  const dqt = [segment(0xdb, Buffer.from([0, ...quantTable(o.quality ?? 85)])), ...(o.gray ? [] : [segment(0xdb, Buffer.from([1, ...quantTable(o.quality ?? 85, true)]))])];
  const sos = segment(0xda, Buffer.from([comps.length, ...comps.flatMap((c) => [c[0]!, c[2] ? 0x11 : 0x00]), 0, 63, 0]));
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...jfif, ...(o.segments ?? []), ...dqt, segment(o.progressive ? 0xc2 : 0xc0, sof), sos, SCAN_DATA, Buffer.from([0xff, 0xd9]), ...(o.trailing ? [o.trailing] : [])]);
}

// ---------------------------------------------------------------------------------------------------------------
// GIF, WebP, BMP, ICO, SVG
// ---------------------------------------------------------------------------------------------------------------

const GIF_FRAME_DATA = Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]);

export function gif(frames = 3, delayCs = 10, loops: number | null = 0, comment?: string): Buffer {
  const parts: Buffer[] = [Buffer.from("GIF89a", "latin1"), Buffer.from([0x03, 0x00, 0x02, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00])];
  if (loops !== null) parts.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from("NETSCAPE2.0", "latin1"), Buffer.from([0x03, 0x01, loops & 255, loops >> 8, 0x00]));
  if (comment) parts.push(Buffer.from([0x21, 0xfe, comment.length]), Buffer.from(comment, "latin1"), Buffer.from([0]));
  for (let i = 0; i < frames; i++) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x05, delayCs & 255, delayCs >> 8, 0x00, 0x00]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, 0x03, 0x00, 0x02, 0x00, 0x00]), GIF_FRAME_DATA);
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

const riff = (chunks: Buffer[]) => {
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};
export const webpChunk = (type: string, data: Buffer) => {
  const h = Buffer.alloc(8);
  h.write(type, 0, "latin1");
  h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, ...(data.length & 1 ? [Buffer.alloc(1)] : [])]);
};
const le24 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255]);

export function webpLossy(w: number, h: number): Buffer {
  const d = Buffer.alloc(10 + 6);
  d.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a], 0);
  d.writeUInt16LE(w, 6);
  d.writeUInt16LE(h, 8);
  return riff([webpChunk("VP8 ", d)]);
}
export function webpLossless(w: number, h: number, alpha: boolean): Buffer {
  const d = Buffer.alloc(10);
  d[0] = 0x2f;
  d.writeUInt32LE(((w - 1) | ((h - 1) << 14) | ((alpha ? 1 : 0) << 28)) >>> 0, 1);
  return riff([webpChunk("VP8L", d)]);
}
export function webpExtended(w: number, h: number, opts: { exif?: Buffer; xmp?: string; animated?: number; alpha?: boolean; icc?: Buffer } = {}): Buffer {
  const flags = (opts.icc ? 0x20 : 0) | (opts.alpha ? 0x10 : 0) | (opts.exif ? 0x08 : 0) | (opts.xmp ? 0x04 : 0) | (opts.animated ? 0x02 : 0);
  const vp8x = Buffer.concat([Buffer.from([flags, 0, 0, 0]), le24(w - 1), le24(h - 1)]);
  const chunks = [webpChunk("VP8X", vp8x), ...(opts.icc ? [webpChunk("ICCP", opts.icc)] : [])];
  if (opts.animated) {
    chunks.push(webpChunk("ANIM", Buffer.from([0, 0, 0, 0, 0, 0])));
    for (let i = 0; i < opts.animated; i++) chunks.push(webpChunk("ANMF", Buffer.concat([le24(0), le24(0), le24(w - 1), le24(h - 1), le24(40), Buffer.from([0]), webpLossless(w, h, false).subarray(12)])));
  } else chunks.push(webpChunk("VP8L", (() => { const d = Buffer.alloc(10); d[0] = 0x2f; d.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 1); return d; })()));
  if (opts.exif) chunks.push(webpChunk("EXIF", opts.exif));
  if (opts.xmp) chunks.push(webpChunk("XMP ", Buffer.from(opts.xmp, "utf8")));
  return riff(chunks);
}

export function bmp(w: number, h: number, bpp = 24, dpi = 72): Buffer {
  const rowBytes = Math.ceil((w * bpp) / 32) * 4;
  const head = Buffer.alloc(54);
  head.write("BM", 0, "latin1");
  head.writeUInt32LE(54 + rowBytes * h, 2);
  head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14);
  head.writeInt32LE(w, 18);
  head.writeInt32LE(h, 22);
  head.writeUInt16LE(1, 26);
  head.writeUInt16LE(bpp, 28);
  head.writeInt32LE(Math.round(dpi / 0.0254), 38);
  head.writeInt32LE(Math.round(dpi / 0.0254), 42);
  return Buffer.concat([head, Buffer.alloc(rowBytes * h, 0x7f)]);
}

export function ico(sizes: number[], cursor = false): Buffer {
  const head = Buffer.alloc(6 + sizes.length * 16);
  head.writeUInt16LE(cursor ? 2 : 1, 2);
  head.writeUInt16LE(sizes.length, 4);
  sizes.forEach((s, i) => {
    head[6 + i * 16] = s >= 256 ? 0 : s;
    head[7 + i * 16] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, 10 + i * 16);
    head.writeUInt16LE(32, 12 + i * 16);
    head.writeUInt32LE(40, 14 + i * 16);
    head.writeUInt32LE(head.length, 18 + i * 16);
  });
  return Buffer.concat([head, Buffer.alloc(40)]);
}

export const SVG_PLAIN = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="80" viewBox="0 0 300 200"><title>A &amp; B</title><rect width="10" height="10"/><circle r="4"/></svg>`;
export const SVG_NASTY = `<?xml version="1.0"?>
<!DOCTYPE svg [
<!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">
<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
<!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
<!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;">
<!ENTITY x SYSTEM "file:///etc/passwd">
]>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(&e;)</script><text>&e;&x;</text><image href="https://example.com/track.png"/><foreignObject><div>hi</div></foreignObject></svg>`;

// ---------------------------------------------------------------------------------------------------------------
// Sound and video
// ---------------------------------------------------------------------------------------------------------------

export function wav(seconds: number, rate = 8000, channels = 1, bits = 16, info?: Record<string, string>): Buffer {
  const dataLen = Math.round(seconds * rate) * channels * (bits / 8);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * channels * (bits / 8), 8);
  fmt.writeUInt16LE(channels * (bits / 8), 12);
  fmt.writeUInt16LE(bits, 14);
  const list = info ? (() => {
    const items = Object.entries(info).map(([k, v]) => { const s = Buffer.from(`${v}\0`, "latin1"); return Buffer.concat([Buffer.from(k, "latin1"), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(s.length); return b; })(), s, ...(s.length & 1 ? [Buffer.alloc(1)] : [])]); });
    const body = Buffer.concat([Buffer.from("INFO", "latin1"), ...items]);
    const h = Buffer.alloc(8);
    h.write("LIST", 0, "latin1");
    h.writeUInt32LE(body.length, 4);
    return Buffer.concat([h, body]);
  })() : Buffer.alloc(0);
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), webpChunk("fmt ", fmt), list, (() => { const h = Buffer.alloc(8); h.write("data", 0, "latin1"); h.writeUInt32LE(dataLen, 4); return Buffer.concat([h, Buffer.alloc(dataLen)]); })()]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

const syncsafe = (n: number) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);

/** MP3: an ID3v2.3 tag, `frames` MPEG-1 Layer III frames at 128 kbit/s and 44.1 kHz (with a Xing header), and an ID3v1 tag. */
export function mp3(frames = 40, tags: Record<string, string> = { TIT2: "Song Title", TPE1: "The Artist", TALB: "The Album", TYER: "1999", TCON: "Rock", TRCK: "3/12" }, opts: { cover?: boolean; v1?: boolean } = {}): Buffer {
  const items = Object.entries(tags).map(([id, v]) => { const body = Buffer.concat([Buffer.from([3]), Buffer.from(v, "utf8")]); const h = Buffer.alloc(10); h.write(id, 0, "latin1"); h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); });
  if (opts.cover) { const body = Buffer.concat([Buffer.from([0]), Buffer.from("image/jpeg\0", "latin1"), Buffer.from([3, 0]), Buffer.from([0xff, 0xd8, 0xff, 0xd9])]); const h = Buffer.alloc(10); h.write("APIC", 0, "latin1"); h.writeUInt32BE(body.length, 4); items.push(Buffer.concat([h, body])); }
  const tagBody = Buffer.concat(items);
  const id3 = Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.from([3, 0, 0]), syncsafe(tagBody.length), tagBody]);
  const frameSize = 417;
  const list: Buffer[] = [];
  for (let i = 0; i < frames; i++) {
    const f = Buffer.alloc(frameSize);
    f.set([0xff, 0xfb, 0x90, 0x00], 0);
    if (i === 0) {
      f.write("Xing", 36, "latin1");
      f.writeUInt32BE(0x3, 40);
      f.writeUInt32BE(frames, 44);
      f.writeUInt32BE(frames * frameSize, 48);
    }
    list.push(f);
  }
  const v1 = opts.v1 === false ? Buffer.alloc(0) : (() => { const t = Buffer.alloc(128); t.write("TAG", 0, "latin1"); t.write("Old Title", 3, "latin1"); t.write("Old Artist", 33, "latin1"); t[127] = 17; return t; })();
  return Buffer.concat([id3, ...list, v1]);
}

export function flac(seconds: number, rate = 44100, channels = 2, bits = 16, comments: string[] = ["TITLE=Flac Song", "ARTIST=Flac Artist", "ALBUM=Flac Album", "DATE=2001"]): Buffer {
  const info = Buffer.alloc(34);
  info.writeUInt16BE(4096, 0);
  info.writeUInt16BE(4096, 2);
  const total = BigInt(Math.round(seconds * rate));
  const packed = (BigInt(rate) << 44n) | (BigInt(channels - 1) << 41n) | (BigInt(bits - 1) << 36n) | total;
  info.writeBigUInt64BE(packed, 10);
  const vendor = Buffer.from("test vendor", "utf8");
  const parts = [(() => { const b = Buffer.alloc(4); b.writeUInt32LE(vendor.length); return b; })(), vendor, (() => { const b = Buffer.alloc(4); b.writeUInt32LE(comments.length); return b; })()];
  for (const c of comments) { const s = Buffer.from(c, "utf8"); const b = Buffer.alloc(4); b.writeUInt32LE(s.length); parts.push(b, s); }
  const vc = Buffer.concat(parts);
  const block = (type: number, last: boolean, data: Buffer) => Buffer.concat([Buffer.from([(last ? 0x80 : 0) | type, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255]), data]);
  return Buffer.concat([Buffer.from("fLaC", "latin1"), block(0, false, info), block(4, true, vc)]);
}

function oggPage(packet: Buffer, granule: bigint, seq: number, flags: number): Buffer {
  const segs: number[] = [];
  let left = packet.length;
  while (left >= 255) { segs.push(255); left -= 255; }
  segs.push(left);
  const h = Buffer.alloc(27 + segs.length);
  h.write("OggS", 0, "latin1");
  h[5] = flags;
  h.writeBigUInt64LE(granule < 0n ? 0xffffffffffffffffn : granule, 6);
  h.writeUInt32LE(1, 14);
  h.writeUInt32LE(seq, 18);
  h[26] = segs.length;
  h.set(segs, 27);
  return Buffer.concat([h, packet]);
}

function vorbisCommentBody(comments: string[]): Buffer {
  const vendor = Buffer.from("test", "utf8");
  const parts = [(() => { const b = Buffer.alloc(4); b.writeUInt32LE(vendor.length); return b; })(), vendor, (() => { const b = Buffer.alloc(4); b.writeUInt32LE(comments.length); return b; })()];
  for (const c of comments) { const s = Buffer.from(c, "utf8"); const b = Buffer.alloc(4); b.writeUInt32LE(s.length); parts.push(b, s); }
  return Buffer.concat(parts);
}

export function oggVorbis(seconds: number, rate = 44100, channels = 2, comments = ["TITLE=Ogg Song", "ARTIST=Ogg Artist"]): Buffer {
  const id = Buffer.alloc(30);
  id[0] = 1;
  id.write("vorbis", 1, "latin1");
  id[11] = channels;
  id.writeUInt32LE(rate, 12);
  id.writeUInt32LE(0, 16);
  id.writeUInt32LE(128000, 20);
  id[28] = 0xb8;
  id[29] = 1;
  const cm = Buffer.concat([Buffer.from([3]), Buffer.from("vorbis", "latin1"), vorbisCommentBody(comments), Buffer.from([1])]);
  return Buffer.concat([oggPage(id, 0n, 0, 2), oggPage(cm, 0n, 1, 0), oggPage(Buffer.alloc(20), BigInt(Math.round(seconds * rate)), 2, 4)]);
}

export function oggOpus(seconds: number, comments = ["TITLE=Opus Song", "ARTIST=Opus Artist"]): Buffer {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "latin1");
  head[8] = 1;
  head[9] = 2;
  head.writeUInt16LE(312, 10);
  head.writeUInt32LE(44100, 12);
  const tags = Buffer.concat([Buffer.from("OpusTags", "latin1"), vorbisCommentBody(comments)]);
  return Buffer.concat([oggPage(head, 0n, 0, 2), oggPage(tags, 0n, 1, 0), oggPage(Buffer.alloc(20), BigInt(Math.round(seconds * 48000) + 312), 2, 4)]);
}

export const box = (type: string, ...payload: Buffer[]) => {
  const body = Buffer.concat(payload);
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + body.length, 0);
  h.write(type, 4, "latin1");
  return Buffer.concat([h, body]);
};
const be = (n: number, bytes = 4) => { const b = Buffer.alloc(bytes); if (bytes === 4) b.writeUInt32BE(n >>> 0); else b.writeUInt16BE(n); return b; };
const fullBox = (type: string, ...payload: Buffer[]) => box(type, Buffer.alloc(4), ...payload);

/** An MP4 with one video track (320×240, avc1, 25 fps) and one stereo audio track (mp4a, 44.1 kHz), and iTunes-style tags. */
export function mp4(seconds = 4, tags: Record<string, string> = { "©nam": "Movie Title", "©ART": "Movie Artist", "©alb": "Movie Album", "©day": "2020" }, withCover = true): Buffer {
  const ts = 1000, dur = seconds * ts;
  const mvhd = fullBox("mvhd", be(0), be(0), be(ts), be(dur), Buffer.alloc(80));
  const track = (kind: "vide" | "soun") => {
    const tkhd = fullBox("tkhd", be(0), be(0), be(kind === "vide" ? 1 : 2), be(0), be(dur), Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(36), be(kind === "vide" ? 320 * 65536 : 0), be(kind === "vide" ? 240 * 65536 : 0));
    const mdhd = fullBox("mdhd", be(0), be(0), be(kind === "vide" ? 25000 : 44100), be(seconds * (kind === "vide" ? 25000 : 44100)), be(0x15c7, 2), be(0, 2));
    const hdlr = fullBox("hdlr", be(0), Buffer.from(kind, "latin1"), Buffer.alloc(12), Buffer.from("Handler\0", "latin1"));
    const entry = kind === "vide"
      ? box("avc1", Buffer.alloc(6), be(1, 2), Buffer.alloc(16), be(320, 2), be(240, 2), Buffer.alloc(50))
      : box("mp4a", Buffer.alloc(6), be(1, 2), Buffer.alloc(8), be(2, 2), be(16, 2), Buffer.alloc(4), be(44100 * 65536));
    const stsd = fullBox("stsd", be(1), entry);
    const stts = fullBox("stts", be(1), be(seconds * 25), be(1000));
    const stbl = box("stbl", stsd, stts);
    return box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", stbl)));
  };
  const items = Object.entries(tags).map(([k, v]) => box(k, box("data", be(1), be(0), Buffer.from(v, "utf8"))));
  if (withCover) items.push(box("covr", box("data", be(13), be(0), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))));
  items.push(box("trkn", box("data", be(0), be(0), Buffer.from([0, 0, 0, 2, 0, 9, 0, 0]))));
  const meta = fullBox("meta", box("hdlr", Buffer.alloc(24)), box("ilst", ...items));
  const moov = box("moov", mvhd, track("vide"), track("soun"), box("udta", meta));
  return Buffer.concat([box("ftyp", Buffer.from("isom", "latin1"), be(512), Buffer.from("isomiso2avc1mp41", "latin1")), box("mdat", Buffer.alloc(100)), moov]);
}

// ---------------------------------------------------------------------------------------------------------------
// Documents and programs
// ---------------------------------------------------------------------------------------------------------------

export function pdf(opts: { title?: string; author?: string; pages?: number; encrypted?: boolean; javascript?: boolean; launch?: boolean; compressedObjects?: boolean; linearized?: boolean } = {}): Buffer {
  const pages = opts.pages ?? 3;
  const objs: string[] = [];
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R${opts.javascript ? " /OpenAction 5 0 R" : ""} >>\nendobj\n`);
  objs.push(`2 0 obj\n<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${10 + i} 0 R`).join(" ")}] /MediaBox [0 0 595 842] >>\nendobj\n`);
  objs.push(`3 0 obj\n<< /Title (${opts.title ?? "Quarterly \\(draft\\) Report"}) /Author <FEFF004A006F00650044006F0065> /Producer (Test Producer 1.2) /Creator (Writer) /CreationDate (D:20240102030405+02'00') /ModDate (D:20240203040506Z) >>\nendobj\n`);
  if (opts.javascript) objs.push(`5 0 obj\n<< /S /JavaScript /JS (app.alert\\('hi'\\)) >>\nendobj\n`);
  if (opts.launch) objs.push(`6 0 obj\n<< /S /Launch /F (cmd.exe) >>\nendobj\n`);
  for (let i = 0; i < pages; i++) objs.push(`${10 + i} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`);
  return Buffer.from(`%PDF-1.7\n${opts.linearized ? "1 0 obj\n<< /Linearized 1 >>\nendobj\n" : ""}${objs.join("")}trailer\n<< /Size 20 /Root 1 0 R /Info 3 0 R${opts.encrypted ? " /Encrypt 9 0 R" : ""} >>\nstartxref\n0\n%%EOF\n`, "latin1");
}

export function sqliteDb(pageSize = 4096, tables = ["users", "orders"]): Buffer {
  const page = Buffer.alloc(pageSize);
  page.write("SQLite format 3\0", 0, "latin1");
  page.writeUInt16BE(pageSize === 65536 ? 1 : pageSize, 16);
  page[18] = 1;
  page[19] = 1;
  page[21] = 64;
  page[22] = 32;
  page[23] = 32;
  page.writeUInt32BE(5, 24);
  page.writeUInt32BE(1, 28);
  page.writeUInt32BE(1, 40);
  page.writeUInt32BE(4, 44);
  page.writeUInt32BE(1, 56);
  page.writeUInt32BE(7, 60);
  page.writeUInt32BE(3045000, 96);
  const cells: Buffer[] = tables.map((t, i) => {
    const cols = ["table", t, t, "2", `CREATE TABLE ${t}(id)`].map((s) => Buffer.from(s, "utf8"));
    const serial = cols.map((c, k) => (k === 3 ? 1 : 13 + c.length * 2));
    const header = Buffer.from([serial.length + 1, ...serial]);
    const data = Buffer.concat([...cols.slice(0, 3), Buffer.from([2]), cols[4]!]);
    const payload = Buffer.concat([header, data]);
    return Buffer.concat([Buffer.from([payload.length, i + 1]), payload]);
  });
  page[100] = 0x0d;
  page.writeUInt16BE(cells.length, 103);
  let end = pageSize;
  cells.forEach((c, i) => {
    end -= c.length;
    c.copy(page, end);
    page.writeUInt16BE(end, 108 + i * 2);
  });
  page.writeUInt16BE(end, 105);
  return page;
}

/** A minimal ELF header for a 64-bit little-endian x86-64 program with an interpreter. */
export function elf64(): Buffer {
  const b = Buffer.alloc(64 + 56 + 32);
  b.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  b.writeUInt16LE(3, 16);
  b.writeUInt16LE(0x3e, 18);
  b.writeUInt32LE(1, 20);
  b.writeBigUInt64LE(0x1040n, 24);
  b.writeBigUInt64LE(64n, 32);
  b.writeUInt16LE(64, 52);
  b.writeUInt16LE(56, 54);
  b.writeUInt16LE(1, 56);
  b.writeUInt32LE(3, 64);
  b.writeBigUInt64LE(120n, 64 + 8);
  b.writeBigUInt64LE(28n, 64 + 32);
  b.write("/lib64/ld-linux-x86-64.so.2\0", 120, "latin1");
  return b;
}

export function pe64(dll = false): Buffer {
  const b = Buffer.alloc(0x200);
  b.write("MZ", 0, "latin1");
  b.writeUInt32LE(0x80, 0x3c);
  b.write("PE\0\0", 0x80, "latin1");
  b.writeUInt16LE(0x8664, 0x84);
  b.writeUInt16LE(5, 0x86);
  b.writeUInt32LE(1700000000, 0x88);
  b.writeUInt16LE(240, 0x94);
  b.writeUInt16LE(dll ? 0x2022 : 0x22, 0x96);
  b.writeUInt16LE(0x20b, 0x98);
  b.writeUInt32LE(0x1000, 0x98 + 16);
  b.writeUInt16LE(3, 0x98 + 68);
  return b;
}

export function machoUniversal(): Buffer {
  const slice = Buffer.alloc(64);
  slice.writeUInt32LE(0xfeedfacf, 0);
  slice.writeUInt32LE(0x0100000c, 4);
  slice.writeUInt32LE(2, 12);
  const slice2 = Buffer.from(slice);
  slice2.writeUInt32LE(0x01000007, 4);
  const h = Buffer.alloc(8 + 40);
  h.writeUInt32BE(0xcafebabe, 0);
  h.writeUInt32BE(2, 4);
  const at = 4096;
  h.writeUInt32BE(0x0100000c, 8);
  h.writeUInt32BE(at, 16);
  h.writeUInt32BE(64, 20);
  h.writeUInt32BE(0x01000007, 28);
  h.writeUInt32BE(at + 64, 36);
  h.writeUInt32BE(64, 40);
  return Buffer.concat([h, Buffer.alloc(at - h.length), slice, slice2]);
}
