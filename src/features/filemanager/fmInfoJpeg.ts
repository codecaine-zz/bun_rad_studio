/** JPEG pictures: reads the marker segments before the image data (size, kind of JPEG, quality estimate, notes inside). */
import { ascii, be16, clip, type Source } from "./fmInfoCommon";
import { parseExifBlock, type ExifData } from "./fmInfoExif";
import { parseIcc, parseXmp, type IccInfo, type XmpInfo } from "./fmInfoMeta";

export interface JpegSegment {
  marker: number;
  name: string;
  offset: number;
  bytes: number;
  detail?: string;
}

export interface JpegInfo {
  width: number | null;
  height: number | null;
  precision: number | null;
  components: number | null;
  sof: string;
  progressive: boolean;
  subsampling: string | null;
  quality: number | null;
  segments: JpegSegment[];
  jfif: { version: string; units: string; density: string } | null;
  adobe: string | null;
  exif: ExifData | null;
  icc: IccInfo | null;
  xmp: XmpInfo | null;
  hasIptc: boolean;
  hasMpf: boolean;
  comments: string[];
  partial: boolean;
}

const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array<number>(32).fill(99)];

/** Position in the zigzag order of each place of an 8x8 block (the order tables are stored in). */
const ZIGZAG = (() => {
  const order: number[] = [];
  for (let s = 0; s < 15; s++) {
    const cells: number[] = [];
    for (let y = 0; y < 8; y++) {
      const x = s - y;
      if (x >= 0 && x < 8) cells.push(y * 8 + x);
    }
    order.push(...(s % 2 === 0 ? cells.reverse() : cells));
  }
  return order;
})();

function qualityOf(tables: Map<number, number[]>): number | null {
  // Values that hit the limits (1 or 255) say nothing about the scale, so they are left out when there are enough others.
  const free: Array<[number, number]> = [], all: Array<[number, number]> = [];
  let allOnes = true;
  for (const [id, zz] of tables) {
    if (zz.length !== 64 || id > 1) continue;
    const std = id === 0 ? STD_LUMA : STD_CHROMA;
    for (let i = 0; i < 64; i++) {
      const pair: [number, number] = [zz[i]!, std[ZIGZAG[i]!]!];
      all.push(pair);
      if (zz[i]! > 1 && zz[i]! < 255) free.push(pair);
      if (zz[i] !== 1) allOnes = false;
    }
  }
  if (!all.length) return null;
  if (allOnes) return 100;
  const use = free.length >= 16 ? free : all;
  const ratio = (use.reduce((n, p) => n + p[0], 0) * 100) / use.reduce((n, p) => n + p[1], 0);
  const q = ratio <= 100 ? (200 - ratio) / 2 : 5000 / ratio;
  return Math.max(1, Math.min(100, Math.round(q)));
}

const SOF_NAME: Record<number, string> = {
  0xc0: "Baseline", 0xc1: "Extended sequential", 0xc2: "Progressive", 0xc3: "Lossless", 0xc5: "Differential sequential", 0xc6: "Differential progressive",
  0xc7: "Differential lossless", 0xc9: "Arithmetic sequential", 0xca: "Arithmetic progressive", 0xcb: "Arithmetic lossless",
};

function subsamplingOf(comps: Array<{ h: number; v: number }>): string | null {
  if (comps.length === 1) return "Grey (one channel)";
  if (comps.length < 3) return null;
  const y = comps[0]!, cb = comps[1]!, cr = comps[2]!;
  if (cb.h !== cr.h || cb.v !== cr.v || !cb.h || !cb.v) return null;
  const hr = y.h / cb.h, vr = y.v / cb.v;
  if (hr === 1 && vr === 1) return "4:4:4";
  if (hr === 2 && vr === 1) return "4:2:2";
  if (hr === 2 && vr === 2) return "4:2:0";
  if (hr === 4 && vr === 1) return "4:1:1";
  if (hr === 1 && vr === 2) return "4:4:0";
  return `${y.h}x${y.v} luma blocks`;
}

export async function parseJpeg(src: Source): Promise<JpegInfo> {
  const info: JpegInfo = {
    width: null, height: null, precision: null, components: null, sof: "", progressive: false, subsampling: null, quality: null, segments: [], jfif: null, adobe: null,
    exif: null, icc: null, xmp: null, hasIptc: false, hasMpf: false, comments: [], partial: false,
  };
  const head = await src.read(0, 2);
  if (head.length < 2 || head[0] !== 0xff || head[1] !== 0xd8) return { ...info, partial: true };
  let pos = 2;
  const tables = new Map<number, number[]>();
  const iccParts = new Map<number, Buffer>();
  while (info.segments.length < 300) {
    const h = await src.read(pos, 4);
    if (h.length < 2) { info.partial = true; break; }
    if (h[0] !== 0xff) { info.partial = true; break; }
    const marker = h[1]!;
    if (marker === 0xff) { pos += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (marker === 0xd9) break;
    if (h.length < 4) { info.partial = true; break; }
    const len = be16(h, 2);
    if (len < 2) { info.partial = true; break; }
    const body = await src.read(pos + 4, len - 2);
    if (body.length < len - 2) info.partial = true;
    const seg: JpegSegment = { marker, name: "", offset: pos, bytes: len + 2 };
    if (marker >= 0xe0 && marker <= 0xef) {
      seg.name = `APP${marker - 0xe0}`;
      const tag = ascii(body, 0, 30);
      if (marker === 0xe0 && tag.startsWith("JFIF\0") && body.length >= 14) {
        const units = body[7];
        info.jfif = { version: `${body[5]}.${String(body[6]).padStart(2, "0")}`, units: units === 1 ? "dots per inch" : units === 2 ? "dots per centimetre" : "no unit (aspect ratio only)", density: `${be16(body, 8)} × ${be16(body, 10)}` };
        seg.detail = "JFIF";
      } else if (marker === 0xe1 && tag.startsWith("Exif\0")) {
        info.exif = info.exif ?? parseExifBlock(body);
        seg.detail = "EXIF";
      } else if (marker === 0xe1 && tag.startsWith("http://ns.adobe.com/xap/1.0/")) {
        info.xmp = info.xmp ?? parseXmp(body.subarray(29).toString("utf8"));
        seg.detail = "XMP";
      } else if (marker === 0xe2 && tag.startsWith("ICC_PROFILE\0")) {
        iccParts.set(body[12] ?? 0, Buffer.from(body.subarray(14)));
        seg.detail = "ICC colour profile";
      } else if (marker === 0xe2 && tag.startsWith("MPF\0")) {
        info.hasMpf = true;
        seg.detail = "MPF (multi-picture)";
      } else if (marker === 0xed && tag.startsWith("Photoshop 3.0")) {
        info.hasIptc = body.includes(Buffer.from("8BIM\x04\x04", "latin1"));
        seg.detail = info.hasIptc ? "Photoshop / IPTC" : "Photoshop";
      } else if (marker === 0xee && tag.startsWith("Adobe")) {
        const t = body[11];
        info.adobe = t === 0 ? "Adobe (no colour change)" : t === 1 ? "Adobe (YCbCr)" : t === 2 ? "Adobe (YCCK)" : "Adobe";
        seg.detail = "Adobe";
      } else seg.detail = clip(tag.split("\0")[0], 40);
    } else if (marker === 0xfe) {
      seg.name = "COM";
      if (info.comments.length < 5) info.comments.push(clip(body.toString("utf8"), 500).trim());
    } else if (marker === 0xdb) {
      seg.name = "DQT";
      let p = 0;
      while (p < body.length) {
        const pq = body[p]! >> 4, tq = body[p]! & 15;
        const size = pq ? 128 : 64;
        if (p + 1 + size > body.length) break;
        const t: number[] = [];
        for (let i = 0; i < 64; i++) t.push(pq ? be16(body, p + 1 + i * 2) : body[p + 1 + i]!);
        if (!tables.has(tq)) tables.set(tq, t);
        p += 1 + size;
      }
    } else if (SOF_NAME[marker] !== undefined || (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) {
      seg.name = `SOF${marker - 0xc0}`;
      if (body.length >= 6) {
        info.precision = body[0]!;
        info.height = be16(body, 1);
        info.width = be16(body, 3);
        const n = body[5]!;
        info.components = n;
        const comps: Array<{ h: number; v: number }> = [];
        for (let i = 0; i < n && 6 + i * 3 + 2 < body.length; i++) comps.push({ h: body[6 + i * 3 + 1]! >> 4, v: body[6 + i * 3 + 1]! & 15 });
        info.subsampling = subsamplingOf(comps);
        info.sof = SOF_NAME[marker] ?? `Type ${marker - 0xc0}`;
        info.progressive = marker === 0xc2 || marker === 0xca || marker === 0xc6;
      }
    } else if (marker === 0xc4) seg.name = "DHT";
    else if (marker === 0xdd) seg.name = "DRI";
    else if (marker === 0xda) {
      seg.name = "SOS (start of image data)";
      info.segments.push(seg);
      break;
    } else seg.name = `0x${marker.toString(16).toUpperCase()}`;
    info.segments.push(seg);
    pos += 2 + len;
  }
  if (iccParts.size) {
    const total = [...iccParts.keys()].sort((a, b) => a - b).map((k) => iccParts.get(k)!);
    info.icc = parseIcc(Buffer.concat(total).subarray(0, 2 * 1024 * 1024));
  }
  info.quality = qualityOf(tables);
  if (info.width === null) info.partial = true;
  return info;
}
