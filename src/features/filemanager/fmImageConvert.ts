/**
 * Universal image-to-PNG conversion helpers for Quick Look, Info panel, Markdown preview and Code Editor.
 *
 * Provides:
 *   1. Pure-TypeScript decoders + PNG encoder (using built-in `zlib.deflateSync`) for Netpbm (PBM/PGM/PPM/PAM),
 *      Truevision TGA, Uncompressed/PackBits/Deflate TIFF, Adobe PSD composite images, QOI, XBM, BMP/ICO/CUR,
 *      and embedded PNG streams (e.g. macOS .icns).
 *   2. External tool fallbacks (ImageMagick `magick`/`convert`, macOS `sips`, `ffmpeg`, macOS `qlmanage`)
 *      for camera RAW, HEIC/HEIF, JPEG2000, JPEG-XL, EXR, HDR, DDS and complex compressed formats.
 */
import { deflateSync, inflateSync } from "zlib";

const MAX_DIM = 4096;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND_SIG = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes raw 8-bit RGBA pixels (`width * height * 4` bytes) into a valid PNG buffer. */
export function encodeRgbaToPng(width: number, height: number, rgba: Uint8Array): Buffer | null {
  if (!(width > 0 && height > 0 && width <= MAX_DIM && height <= MAX_DIM)) return null;
  if (rgba.length < width * height * 4) return null;
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const dstOff = y * (rowBytes + 1);
    raw[dstOff] = 0; // filter type 0 (None)
    const srcOff = y * rowBytes;
    Buffer.from(rgba.buffer, rgba.byteOffset + srcOff, rowBytes).copy(raw, dstOff + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([PNG_SIG, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))]);
}

function extractEmbeddedPng(buf: Buffer): Buffer | null {
  let best: Buffer | null = null;
  let pos = 0;
  while (pos < buf.length - 24) {
    const start = buf.indexOf(PNG_SIG, pos);
    if (start < 0) break;
    const end = buf.indexOf(IEND_SIG, start + 8);
    if (end < 0) break;
    const candidate = buf.subarray(start, end + 8);
    if (!best || candidate.length > best.length) best = Buffer.from(candidate);
    pos = end + 8;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Netpbm: PBM / PGM / PPM / PNM / PAM (P1..P7)
// ---------------------------------------------------------------------------------------------------------------

function decodeNetpbm(buf: Buffer): Buffer | null {
  if (buf.length < 7 || buf[0] !== 0x50) return null; // 'P'
  const magic = buf[1]! - 0x30;
  if (magic < 1 || magic > 7) return null;
  let pos = 2;

  const skipSpaceAndComments = () => {
    while (pos < buf.length) {
      const b = buf[pos]!;
      if (b === 0x23) { // '#'
        while (pos < buf.length && buf[pos] !== 0x0a && buf[pos] !== 0x0d) pos++;
      } else if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
        pos++;
      } else break;
    }
  };
  const nextToken = (): string => {
    skipSpaceAndComments();
    const start = pos;
    while (pos < buf.length) {
      const b = buf[pos]!;
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x23) break;
      pos++;
    }
    return buf.subarray(start, pos).toString("ascii");
  };

  if (magic === 7) {
    let w = 0, h = 0, depth = 0, maxval = 255;
    while (pos < buf.length) {
      const lineEnd = buf.indexOf(0x0a, pos);
      if (lineEnd < 0) return null;
      const line = buf.subarray(pos, lineEnd).toString("ascii").trim();
      pos = lineEnd + 1;
      if (line === "ENDHDR") break;
      const [k, v] = line.split(/\s+/);
      if (k === "WIDTH") w = Number(v);
      else if (k === "HEIGHT") h = Number(v);
      else if (k === "DEPTH") depth = Number(v);
      else if (k === "MAXVAL") maxval = Number(v);
    }
    if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && depth >= 1 && depth <= 4 && maxval > 0)) return null;
    const rgba = new Uint8Array(w * h * 4);
    const bpp = maxval > 255 ? 2 : 1;
    for (let i = 0; i < w * h; i++) {
      const off = pos + i * depth * bpp;
      if (off + depth * bpp > buf.length) break;
      const readSample = (c: number) => {
        const raw = bpp === 2 ? buf.readUInt16BE(off + c * 2) : buf[off + c]!;
        return Math.round((raw * 255) / maxval);
      };
      const r = readSample(0);
      const g = depth >= 3 ? readSample(1) : r;
      const b = depth >= 3 ? readSample(2) : r;
      const a = depth === 2 ? readSample(1) : depth === 4 ? readSample(3) : 255;
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = a;
    }
    return encodeRgbaToPng(w, h, rgba);
  }

  const w = Number(nextToken());
  const h = Number(nextToken());
  const maxval = magic === 1 || magic === 4 ? 1 : Number(nextToken());
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && maxval > 0 && maxval <= 65535)) return null;
  // Exactly one whitespace byte after header before binary payload
  if (magic >= 4 && pos < buf.length && (buf[pos] === 0x20 || buf[pos] === 0x09 || buf[pos] === 0x0a || buf[pos] === 0x0d)) {
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;
    else pos += 1;
  }

  const rgba = new Uint8Array(w * h * 4);
  if (magic === 1) {
    for (let i = 0; i < w * h; i++) {
      const tok = nextToken();
      const v = tok === "1" ? 0 : 255;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === 2) {
    for (let i = 0; i < w * h; i++) {
      const v = Math.round((Number(nextToken()) * 255) / maxval);
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === 3) {
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = Math.round((Number(nextToken()) * 255) / maxval);
      rgba[i * 4 + 1] = Math.round((Number(nextToken()) * 255) / maxval);
      rgba[i * 4 + 2] = Math.round((Number(nextToken()) * 255) / maxval);
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === 4) {
    const rowBytes = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const byteIdx = pos + y * rowBytes + (x >> 3);
        const bit = ((buf[byteIdx] ?? 0) >> (7 - (x & 7))) & 1;
        const v = bit ? 0 : 255;
        const idx = (y * w + x) * 4;
        rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = v;
        rgba[idx + 3] = 255;
      }
    }
  } else if (magic === 5) {
    const bpp = maxval > 255 ? 2 : 1;
    for (let i = 0; i < w * h; i++) {
      const off = pos + i * bpp;
      if (off + bpp > buf.length) break;
      const raw = bpp === 2 ? buf.readUInt16BE(off) : buf[off]!;
      const v = Math.round((raw * 255) / maxval);
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  } else if (magic === 6) {
    const bpp = maxval > 255 ? 2 : 1;
    for (let i = 0; i < w * h; i++) {
      const off = pos + i * 3 * bpp;
      if (off + 3 * bpp > buf.length) break;
      const r = bpp === 2 ? buf.readUInt16BE(off) : buf[off]!;
      const g = bpp === 2 ? buf.readUInt16BE(off + bpp) : buf[off + 1]!;
      const b = bpp === 2 ? buf.readUInt16BE(off + 2 * bpp) : buf[off + 2]!;
      rgba[i * 4] = Math.round((r * 255) / maxval);
      rgba[i * 4 + 1] = Math.round((g * 255) / maxval);
      rgba[i * 4 + 2] = Math.round((b * 255) / maxval);
      rgba[i * 4 + 3] = 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// Truevision TGA (.tga)
// ---------------------------------------------------------------------------------------------------------------

function decodeTga(buf: Buffer): Buffer | null {
  if (buf.length < 18) return null;
  const idLen = buf[0]!;
  const cmapType = buf[1]!;
  const imgType = buf[2]!;
  if (![1, 2, 3, 9, 10, 11].includes(imgType)) return null;
  const cmapFirst = buf.readUInt16LE(3);
  const cmapLen = buf.readUInt16LE(5);
  const cmapBits = buf[7]!;
  const w = buf.readUInt16LE(12);
  const h = buf.readUInt16LE(14);
  const depth = buf[16]!;
  const desc = buf[17]!;
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM)) return null;
  if (![8, 15, 16, 24, 32].includes(depth)) return null;

  const cmapBytesPerEntry = cmapType === 1 ? Math.ceil(cmapBits / 8) : 0;
  let pos = 18 + idLen + cmapLen * cmapBytesPerEntry;
  if (pos > buf.length) return null;
  const cmapOffset = 18 + idLen;

  const readColor = (off: number, bits: number): [number, number, number, number] => {
    if (bits === 8) {
      const v = buf[off] ?? 0;
      return [v, v, v, 255];
    }
    if (bits === 15 || bits === 16) {
      const v = off + 2 <= buf.length ? buf.readUInt16LE(off) : 0;
      const r = ((v >> 10) & 0x1f) * 255 / 31;
      const g = ((v >> 5) & 0x1f) * 255 / 31;
      const b = (v & 0x1f) * 255 / 31;
      return [Math.round(r), Math.round(g), Math.round(b), 255];
    }
    if (bits === 24) {
      return [buf[off + 2] ?? 0, buf[off + 1] ?? 0, buf[off] ?? 0, 255];
    }
    return [buf[off + 2] ?? 0, buf[off + 1] ?? 0, buf[off] ?? 0, buf[off + 3] ?? 255];
  };

  const bpp = Math.ceil(depth / 8);
  const totalPixels = w * h;
  const pixels = new Uint8Array(totalPixels * 4);
  const isRle = imgType >= 9;
  const isCmap = imgType === 1 || imgType === 9;

  const decodePixelAt = (off: number): [number, number, number, number] => {
    if (isCmap && cmapType === 1) {
      const idx = (bpp === 2 ? buf.readUInt16LE(off) : (buf[off] ?? 0)) - cmapFirst;
      const cOff = cmapOffset + Math.max(0, idx) * cmapBytesPerEntry;
      return readColor(cOff, cmapBits);
    }
    return readColor(off, depth);
  };

  let px = 0;
  while (px < totalPixels && pos < buf.length) {
    if (!isRle) {
      const [r, g, b, a] = decodePixelAt(pos);
      pixels[px * 4] = r;
      pixels[px * 4 + 1] = g;
      pixels[px * 4 + 2] = b;
      pixels[px * 4 + 3] = a;
      pos += bpp;
      px++;
    } else {
      const header = buf[pos++]!;
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        const [r, g, b, a] = decodePixelAt(pos);
        pos += bpp;
        for (let i = 0; i < count && px < totalPixels; i++, px++) {
          pixels[px * 4] = r;
          pixels[px * 4 + 1] = g;
          pixels[px * 4 + 2] = b;
          pixels[px * 4 + 3] = a;
        }
      } else {
        for (let i = 0; i < count && px < totalPixels && pos < buf.length; i++, px++) {
          const [r, g, b, a] = decodePixelAt(pos);
          pos += bpp;
          pixels[px * 4] = r;
          pixels[px * 4 + 1] = g;
          pixels[px * 4 + 2] = b;
          pixels[px * 4 + 3] = a;
        }
      }
    }
  }

  const topToBottom = (desc & 0x20) !== 0;
  if (topToBottom) return encodeRgbaToPng(w, h, pixels);
  const flipped = new Uint8Array(totalPixels * 4);
  const rowBytes = w * 4;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * rowBytes;
    const dst = y * rowBytes;
    flipped.set(pixels.subarray(src, src + rowBytes), dst);
  }
  return encodeRgbaToPng(w, h, flipped);
}

// ---------------------------------------------------------------------------------------------------------------
// Quite OK Image (.qoi)
// ---------------------------------------------------------------------------------------------------------------

function decodeQoi(buf: Buffer): Buffer | null {
  if (buf.length < 22 || buf.subarray(0, 4).toString("ascii") !== "qoif") return null;
  const w = buf.readUInt32BE(4);
  const h = buf.readUInt32BE(8);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM)) return null;
  const totalPixels = w * h;
  const rgba = new Uint8Array(totalPixels * 4);
  const index = new Uint8Array(64 * 4);
  let r = 0, g = 0, b = 0, a = 255;
  let run = 0;
  let p = 14;
  const end = buf.length - 8;
  for (let px = 0; px < totalPixels; px++) {
    if (run > 0) {
      run--;
    } else if (p < end) {
      const b1 = buf[p++]!;
      if (b1 === 0xfe) {
        r = buf[p++] ?? 0;
        g = buf[p++] ?? 0;
        b = buf[p++] ?? 0;
      } else if (b1 === 0xff) {
        r = buf[p++] ?? 0;
        g = buf[p++] ?? 0;
        b = buf[p++] ?? 0;
        a = buf[p++] ?? 255;
      } else if ((b1 & 0xc0) === 0x00) {
        const idx = (b1 & 0x3f) * 4;
        r = index[idx]!;
        g = index[idx + 1]!;
        b = index[idx + 2]!;
        a = index[idx + 3]!;
      } else if ((b1 & 0xc0) === 0x40) {
        r = (r + ((b1 >> 4) & 0x03) - 2) & 0xff;
        g = (g + ((b1 >> 2) & 0x03) - 2) & 0xff;
        b = (b + (b1 & 0x03) - 2) & 0xff;
      } else if ((b1 & 0xc0) === 0x80) {
        const b2 = buf[p++] ?? 0;
        const vg = (b1 & 0x3f) - 32;
        r = (r + vg - 8 + ((b2 >> 4) & 0x0f)) & 0xff;
        g = (g + vg) & 0xff;
        b = (b + vg - 8 + (b2 & 0x0f)) & 0xff;
      } else if ((b1 & 0xc0) === 0xc0) {
        run = b1 & 0x3f;
      }
      const hash = ((r * 3 + g * 5 + b * 7 + a * 11) & 0x3f) * 4;
      index[hash] = r;
      index[hash + 1] = g;
      index[hash + 2] = b;
      index[hash + 3] = a;
    }
    const dst = px * 4;
    rgba[dst] = r;
    rgba[dst + 1] = g;
    rgba[dst + 2] = b;
    rgba[dst + 3] = a;
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// TIFF (.tif, .tiff) — Uncompressed (1), Deflate (8 / 32946), PackBits (32773)
// ---------------------------------------------------------------------------------------------------------------

function unpackBits(src: Uint8Array, expectedLen: number): Uint8Array {
  const out = new Uint8Array(expectedLen);
  let i = 0, o = 0;
  while (i < src.length && o < expectedLen) {
    const n = (src[i++]! << 24) >> 24; // signed int8
    if (n >= 0) {
      const count = n + 1;
      for (let k = 0; k < count && i < src.length && o < expectedLen; k++) out[o++] = src[i++]!;
    } else if (n !== -128) {
      const count = 1 - n;
      const val = src[i++] ?? 0;
      for (let k = 0; k < count && o < expectedLen; k++) out[o++] = val;
    }
  }
  return out;
}

function decodeTiff(buf: Buffer): Buffer | null {
  if (buf.length < 8) return null;
  const le = buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 42 && buf[3] === 0;
  const be = buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0 && buf[3] === 42;
  if (!le && !be) return null;
  const u16 = (off: number) => (le ? buf.readUInt16LE(off) : buf.readUInt16BE(off));
  const u32 = (off: number) => (le ? buf.readUInt32LE(off) : buf.readUInt32BE(off));
  const ifdOff = u32(4);
  if (ifdOff + 2 > buf.length) return null;
  const numEntries = u16(ifdOff);
  if (ifdOff + 2 + numEntries * 12 > buf.length) return null;

  const readValues = (type: number, count: number, valOff: number): number[] => {
    const sizeByType: Record<number, number> = { 1: 1, 3: 2, 4: 4 };
    const unit = sizeByType[type] ?? 0;
    if (!unit) return [];
    const total = unit * count;
    const dataPos = total <= 4 ? valOff : u32(valOff);
    if (dataPos + total > buf.length) return [];
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const p = dataPos + i * unit;
      out.push(unit === 1 ? buf[p]! : unit === 2 ? u16(p) : u32(p));
    }
    return out;
  };

  let w = 0, h = 0, compression = 1, photometric = 2, samplesPerPixel = 1, rowsPerStrip = 0;
  let bitsPerSample = [8];
  let stripOffsets: number[] = [];
  let stripByteCounts: number[] = [];

  for (let i = 0; i < numEntries; i++) {
    const eOff = ifdOff + 2 + i * 12;
    const tag = u16(eOff);
    const type = u16(eOff + 2);
    const count = u32(eOff + 4);
    const vals = readValues(type, count, eOff + 8);
    if (!vals.length) continue;
    if (tag === 256) w = vals[0]!;
    else if (tag === 257) h = vals[0]!;
    else if (tag === 258) bitsPerSample = vals;
    else if (tag === 259) compression = vals[0]!;
    else if (tag === 262) photometric = vals[0]!;
    else if (tag === 273) stripOffsets = vals;
    else if (tag === 277) samplesPerPixel = vals[0]!;
    else if (tag === 278) rowsPerStrip = vals[0]!;
    else if (tag === 279) stripByteCounts = vals;
  }

  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && stripOffsets.length > 0)) return null;
  if (![1, 8, 32946, 32773].includes(compression)) return null;
  const bps = bitsPerSample[0] ?? 8;
  if (bps !== 8 && bps !== 16) return null;
  const bytesPerSample = bps / 8;
  if (!rowsPerStrip || rowsPerStrip > h) rowsPerStrip = h;

  const rawPixels = new Uint8Array(w * h * samplesPerPixel * bytesPerSample);
  let writePos = 0;
  for (let s = 0; s < stripOffsets.length; s++) {
    const off = stripOffsets[s]!;
    const rowsInStrip = Math.min(rowsPerStrip, h - s * rowsPerStrip);
    if (rowsInStrip <= 0) break;
    const expectedBytes = rowsInStrip * w * samplesPerPixel * bytesPerSample;
    const count = stripByteCounts[s] ?? expectedBytes;
    if (off + count > buf.length) return null;
    const slice = buf.subarray(off, off + count);
    let decoded: Uint8Array;
    if (compression === 1) {
      decoded = slice;
    } else if (compression === 8 || compression === 32946) {
      try { decoded = inflateSync(slice); } catch { return null; }
    } else if (compression === 32773) {
      decoded = unpackBits(slice, expectedBytes);
    } else return null;
    const toCopy = Math.min(decoded.length, rawPixels.length - writePos);
    rawPixels.set(decoded.subarray(0, toCopy), writePos);
    writePos += toCopy;
  }

  const rgba = new Uint8Array(w * h * 4);
  const sampleAt = (idx: number) => {
    if (bytesPerSample === 1) return rawPixels[idx] ?? 0;
    const p = idx * 2;
    const v16 = le ? (rawPixels[p] ?? 0) | ((rawPixels[p + 1] ?? 0) << 8) : ((rawPixels[p] ?? 0) << 8) | (rawPixels[p + 1] ?? 0);
    return v16 >> 8;
  };
  for (let i = 0; i < w * h; i++) {
    const base = i * samplesPerPixel;
    if (samplesPerPixel === 1 || samplesPerPixel === 2) {
      let v = sampleAt(base);
      if (photometric === 0) v = 255 - v;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = samplesPerPixel === 2 ? sampleAt(base + 1) : 255;
    } else {
      rgba[i * 4] = sampleAt(base);
      rgba[i * 4 + 1] = sampleAt(base + 1);
      rgba[i * 4 + 2] = sampleAt(base + 2);
      rgba[i * 4 + 3] = samplesPerPixel >= 4 ? sampleAt(base + 3) : 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// Adobe Photoshop (.psd) composite image reader
// ---------------------------------------------------------------------------------------------------------------

function decodePsd(buf: Buffer): Buffer | null {
  if (buf.length < 26 || buf.subarray(0, 4).toString("ascii") !== "8BPS") return null;
  const version = buf.readUInt16BE(4);
  if (version !== 1 && version !== 2) return null;
  const channels = buf.readUInt16BE(12);
  const h = buf.readUInt32BE(14);
  const w = buf.readUInt32BE(18);
  const depth = buf.readUInt16BE(22);
  const colorMode = buf.readUInt16BE(24);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && depth === 8 && (colorMode === 1 || colorMode === 3))) return null;

  let pos = 26;
  if (pos + 4 > buf.length) return null;
  pos += 4 + buf.readUInt32BE(pos); // skip Color Mode Data
  if (pos + 4 > buf.length) return null;
  pos += 4 + buf.readUInt32BE(pos); // skip Image Resources
  if (pos + (version === 2 ? 8 : 4) > buf.length) return null;
  const layerLen = version === 2 ? Number(buf.readBigUInt64BE(pos)) : buf.readUInt32BE(pos);
  pos += (version === 2 ? 8 : 4) + layerLen;
  if (pos + 2 > buf.length) return null;

  const compression = buf.readUInt16BE(pos);
  pos += 2;
  const numPixels = w * h;
  const chCount = Math.min(channels, 4);
  const planes: Uint8Array[] = [];

  if (compression === 0) {
    for (let c = 0; c < chCount; c++) {
      if (pos + numPixels > buf.length) return null;
      planes.push(buf.subarray(pos, pos + numPixels));
      pos += numPixels;
    }
  } else if (compression === 1) {
    const countBytes = version === 2 ? 4 : 2;
    const rowTableBytes = channels * h * countBytes;
    if (pos + rowTableBytes > buf.length) return null;
    let dataPos = pos + rowTableBytes;
    for (let c = 0; c < chCount; c++) {
      const plane = new Uint8Array(numPixels);
      for (let y = 0; y < h; y++) {
        const countOff = pos + (c * h + y) * countBytes;
        const rowByteCount = countBytes === 4 ? buf.readUInt32BE(countOff) : buf.readUInt16BE(countOff);
        if (dataPos + rowByteCount > buf.length) return null;
        const rowData = unpackBits(buf.subarray(dataPos, dataPos + rowByteCount), w);
        plane.set(rowData, y * w);
        dataPos += rowByteCount;
      }
      planes.push(plane);
    }
  } else return null;

  const rgba = new Uint8Array(numPixels * 4);
  for (let i = 0; i < numPixels; i++) {
    if (colorMode === 1) {
      const v = planes[0]![i]!;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = planes[1] ? planes[1][i]! : 255;
    } else {
      rgba[i * 4] = planes[0]![i]!;
      rgba[i * 4 + 1] = planes[1] ? planes[1][i]! : planes[0]![i]!;
      rgba[i * 4 + 2] = planes[2] ? planes[2][i]! : planes[0]![i]!;
      rgba[i * 4 + 3] = planes[3] ? planes[3][i]! : 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// X11 Bitmap (.xbm)
// ---------------------------------------------------------------------------------------------------------------

function decodeXbm(buf: Buffer): Buffer | null {
  const text = buf.subarray(0, Math.min(buf.length, 512 * 1024)).toString("ascii");
  const wMatch = /#define\s+\w+_width\s+(\d+)/.exec(text);
  const hMatch = /#define\s+\w+_height\s+(\d+)/.exec(text);
  const bodyMatch = /\{([\s\S]+?)\}/.exec(text);
  if (!wMatch || !hMatch || !bodyMatch) return null;
  const w = Number(wMatch[1]);
  const h = Number(hMatch[1]);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM)) return null;
  const bytes = (bodyMatch[1]!.match(/0x[\da-fA-F]+|\d+/g) ?? []).map((s) => Number(s) & 0xff);
  const rowBytes = Math.ceil(w / 8);
  if (bytes.length < rowBytes * h) return null;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = bytes[y * rowBytes + (x >> 3)] ?? 0;
      const bit = (b >> (x & 7)) & 1;
      const v = bit ? 0 : 255;
      const idx = (y * w + x) * 4;
      rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// X11 Pixmap (.xpm)
// ---------------------------------------------------------------------------------------------------------------

const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  none: [0, 0, 0, 0], transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 255], white: [255, 255, 255, 255],
  red: [255, 0, 0, 255], green: [0, 128, 0, 255], blue: [0, 0, 255, 255],
  yellow: [255, 255, 0, 255], cyan: [0, 255, 255, 255], magenta: [255, 0, 255, 255],
  gray: [128, 128, 128, 255], grey: [128, 128, 128, 255], orange: [255, 165, 0, 255],
  purple: [128, 0, 128, 255], brown: [165, 42, 42, 255], pink: [255, 192, 203, 255],
};

function parseXpmColor(spec: string): [number, number, number, number] {
  const s = spec.trim().toLowerCase();
  if (NAMED_COLORS[s]) return NAMED_COLORS[s]!;
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0]! + hex[0]!, 16), parseInt(hex[1]! + hex[1]!, 16), parseInt(hex[2]! + hex[2]!, 16), 255];
    }
    if (hex.length === 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
    }
    if (hex.length === 12) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(8, 10), 16), 255];
    }
  }
  return [128, 128, 128, 255];
}

function decodeXpm(buf: Buffer): Buffer | null {
  const text = buf.subarray(0, Math.min(buf.length, 1024 * 1024)).toString("ascii");
  if (!text.includes("XPM") && !text.includes("static")) return null;
  const strings: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) strings.push(m[1]!);
  if (strings.length < 3) return null;
  const header = strings[0]!.trim().split(/\s+/).map(Number);
  if (header.length < 4) return null;
  const [w, h, numColors, cpp] = header as [number, number, number, number];
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && numColors > 0 && cpp > 0 && cpp <= 8)) return null;
  if (strings.length < 1 + numColors + h) return null;
  const palette = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < numColors; i++) {
    const line = strings[1 + i]!;
    const key = line.slice(0, cpp);
    const rest = line.slice(cpp);
    const cm = /\bc\s+([^\s\t]+)/i.exec(rest) ?? /\bg\s+([^\s\t]+)/i.exec(rest) ?? /\bm\s+([^\s\t]+)/i.exec(rest);
    palette.set(key, parseXpmColor(cm ? cm[1]! : "#000000"));
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = strings[1 + numColors + y] ?? "";
    for (let x = 0; x < w; x++) {
      const key = row.slice(x * cpp, (x + 1) * cpp);
      const [r, g, b, a] = palette.get(key) ?? [0, 0, 0, 255];
      const idx = (y * w + x) * 4;
      rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = a;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// Wireless Bitmap (.wbmp)
// ---------------------------------------------------------------------------------------------------------------

function decodeWbmp(buf: Buffer): Buffer | null {
  if (buf.length < 5 || buf[0] !== 0 || buf[1] !== 0) return null;
  let pos = 2;
  const readVarUInt = (): number => {
    let v = 0;
    for (let i = 0; i < 5 && pos < buf.length; i++) {
      const b = buf[pos++]!;
      v = (v << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return v;
    }
    return -1;
  };
  const w = readVarUInt();
  const h = readVarUInt();
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM)) return null;
  const rowBytes = Math.ceil(w / 8);
  if (pos + rowBytes * h > buf.length) return null;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = buf[pos + y * rowBytes + (x >> 3)]!;
      const bit = (b >> (7 - (x & 7))) & 1;
      const v = bit ? 255 : 0;
      const idx = (y * w + x) * 4;
      rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// Radiance RGBE HDR (.hdr)
// ---------------------------------------------------------------------------------------------------------------

function decodeHdr(buf: Buffer): Buffer | null {
  const headStr = buf.subarray(0, Math.min(buf.length, 4096)).toString("ascii");
  if (!headStr.startsWith("#?RADIANCE") && !headStr.startsWith("#?RGBE")) return null;
  const resMatch = /\r?\n\r?\n-Y\s+(\d+)\s+\+X\s+(\d+)\r?\n/.exec(headStr);
  if (!resMatch) return null;
  const h = Number(resMatch[1]);
  const w = Number(resMatch[2]);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM)) return null;
  let pos = resMatch.index + resMatch[0].length;
  const rgbe = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    if (pos + 4 > buf.length) return null;
    if (buf[pos] === 2 && buf[pos + 1] === 2 && ((buf[pos + 2]! << 8) | buf[pos + 3]!) === w) {
      pos += 4;
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < w && pos < buf.length) {
          const code = buf[pos++]!;
          if (code > 128) {
            const count = code - 128;
            const val = buf[pos++] ?? 0;
            for (let i = 0; i < count && x < w; i++, x++) rgbe[(y * w + x) * 4 + ch] = val;
          } else {
            for (let i = 0; i < code && x < w && pos < buf.length; i++, x++) rgbe[(y * w + x) * 4 + ch] = buf[pos++]!;
          }
        }
      }
    } else {
      for (let x = 0; x < w; x++) {
        if (pos + 4 > buf.length) return null;
        const d = (y * w + x) * 4;
        rgbe[d] = buf[pos]!; rgbe[d + 1] = buf[pos + 1]!; rgbe[d + 2] = buf[pos + 2]!; rgbe[d + 3] = buf[pos + 3]!;
        pos += 4;
      }
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  const tone = (v: number) => Math.max(0, Math.min(255, Math.round(Math.pow(v / (1 + v), 1 / 2.2) * 255)));
  for (let i = 0; i < w * h; i++) {
    const e = rgbe[i * 4 + 3]!;
    if (e === 0) {
      rgba[i * 4 + 3] = 255;
    } else {
      const f = Math.pow(2, e - 136);
      rgba[i * 4] = tone(rgbe[i * 4]! * f);
      rgba[i * 4 + 1] = tone(rgbe[i * 4 + 1]! * f);
      rgba[i * 4 + 2] = tone(rgbe[i * 4 + 2]! * f);
      rgba[i * 4 + 3] = 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// ZSoft PCX (.pcx)
// ---------------------------------------------------------------------------------------------------------------

function decodePcx(buf: Buffer): Buffer | null {
  if (buf.length < 128 || buf[0] !== 0x0a || buf[2] !== 1) return null;
  const bpp = buf[3]!;
  const xmin = buf.readUInt16LE(4), ymin = buf.readUInt16LE(6);
  const xmax = buf.readUInt16LE(8), ymax = buf.readUInt16LE(10);
  const w = xmax - xmin + 1, h = ymax - ymin + 1;
  const planes = buf[65]!;
  const bytesPerLine = buf.readUInt16LE(66);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && bpp === 8 && (planes === 1 || planes === 3 || planes === 4))) return null;
  const scanLen = bytesPerLine * planes;
  const totalBytes = scanLen * h;
  const decoded = new Uint8Array(totalBytes);
  let src = 128, dst = 0;
  while (dst < totalBytes && src < buf.length) {
    const b = buf[src++]!;
    if ((b & 0xc0) === 0xc0) {
      const count = b & 0x3f;
      const val = buf[src++] ?? 0;
      for (let i = 0; i < count && dst < totalBytes; i++) decoded[dst++] = val;
    } else {
      decoded[dst++] = b;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  if (planes === 1) {
    const hasPal = buf.length >= 769 && buf[buf.length - 769] === 0x0c;
    const palOff = hasPal ? buf.length - 768 : 16;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = decoded[y * scanLen + x]!;
        const d = (y * w + x) * 4;
        if (hasPal) {
          rgba[d] = buf[palOff + idx * 3]!;
          rgba[d + 1] = buf[palOff + idx * 3 + 1]!;
          rgba[d + 2] = buf[palOff + idx * 3 + 2]!;
        } else {
          rgba[d] = rgba[d + 1] = rgba[d + 2] = idx;
        }
        rgba[d + 3] = 255;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      const rowOff = y * scanLen;
      for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4;
        rgba[d] = decoded[rowOff + x]!;
        rgba[d + 1] = decoded[rowOff + bytesPerLine + x]!;
        rgba[d + 2] = decoded[rowOff + bytesPerLine * 2 + x]!;
        rgba[d + 3] = planes === 4 ? decoded[rowOff + bytesPerLine * 3 + x]! : 255;
      }
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

// ---------------------------------------------------------------------------------------------------------------
// BMP / ICO / CUR
// ---------------------------------------------------------------------------------------------------------------

function decodeBmp(buf: Buffer): Buffer | null {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  const pixelOff = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const h = Math.abs(rawH);
  const bpp = buf.readUInt16LE(28);
  const comp = buf.readUInt32LE(30);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && comp === 0 && (bpp === 24 || bpp === 32))) return null;
  const bytesPerPixel = bpp / 8;
  const stride = (w * bytesPerPixel + 3) & ~3;
  if (pixelOff + stride * h > buf.length) return null;
  const rgba = new Uint8Array(w * h * 4);
  const topDown = rawH < 0;
  for (let y = 0; y < h; y++) {
    const srcRow = topDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = pixelOff + srcRow * stride + x * bytesPerPixel;
      const d = (y * w + x) * 4;
      rgba[d] = buf[s + 2]!;
      rgba[d + 1] = buf[s + 1]!;
      rgba[d + 2] = buf[s]!;
      rgba[d + 3] = bpp === 32 ? buf[s + 3]! : 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

function decodeIco(buf: Buffer): Buffer | null {
  if (buf.length < 22 || buf.readUInt16LE(0) !== 0) return null;
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  if ((type !== 1 && type !== 2) || count < 1 || count > 256 || 6 + count * 16 > buf.length) return null;
  let bestOff = 0, bestSize = 0, bestScore = -1;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const w = buf[e]! || 256;
    const h = buf[e + 1]! || 256;
    const bpp = buf.readUInt16LE(e + 6);
    const sz = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    if (off + sz > buf.length || sz < 40) continue;
    const score = w * h * 100 + bpp;
    if (score > bestScore) { bestScore = score; bestOff = off; bestSize = sz; }
  }
  if (!bestSize) return null;
  const sub = buf.subarray(bestOff, bestOff + bestSize);
  if (sub.length >= 8 && sub.subarray(0, 8).equals(PNG_SIG)) return Buffer.from(sub);
  const hdrSize = sub.readUInt32LE(0);
  if (hdrSize < 40 || sub.length < hdrSize) return null;
  const w = sub.readInt32LE(4);
  const rawH = sub.readInt32LE(8);
  const h = Math.abs(rawH) >> 1;
  const bpp = sub.readUInt16LE(14);
  const comp = sub.readUInt32LE(16);
  if (!(w > 0 && h > 0 && w <= MAX_DIM && h <= MAX_DIM && comp === 0 && (bpp === 32 || bpp === 24))) return null;
  const bytesPerPixel = bpp / 8;
  const stride = (w * bytesPerPixel + 3) & ~3;
  if (hdrSize + stride * h > sub.length) return null;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = hdrSize + srcRow * stride + x * bytesPerPixel;
      const d = (y * w + x) * 4;
      rgba[d] = sub[s + 2]!;
      rgba[d + 1] = sub[s + 1]!;
      rgba[d + 2] = sub[s]!;
      rgba[d + 3] = bpp === 32 ? sub[s + 3]! : 255;
    }
  }
  return encodeRgbaToPng(w, h, rgba);
}

/** Attempts to decode an image buffer into a valid PNG buffer using pure-TypeScript decoders. */
export function decodeImageToPngBuffer(buf: Buffer, ext: string): Buffer | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return buf;
  if (ext === "pbm" || ext === "pgm" || ext === "ppm" || ext === "pnm" || ext === "pam") {
    const pnm = decodeNetpbm(buf);
    if (pnm) return pnm;
  }
  if (ext === "qoi" || (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "qoif")) {
    const qoi = decodeQoi(buf);
    if (qoi) return qoi;
  }
  if (ext === "tif" || ext === "tiff") {
    const tif = decodeTiff(buf);
    if (tif) return tif;
  }
  if (ext === "psd" || (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "8BPS")) {
    const psd = decodePsd(buf);
    if (psd) return psd;
  }
  if (ext === "xbm") {
    const xbm = decodeXbm(buf);
    if (xbm) return xbm;
  }
  if (ext === "xpm") {
    const xpm = decodeXpm(buf);
    if (xpm) return xpm;
  }
  if (ext === "wbmp") {
    const wbmp = decodeWbmp(buf);
    if (wbmp) return wbmp;
  }
  if (ext === "hdr") {
    const hdr = decodeHdr(buf);
    if (hdr) return hdr;
  }
  if (ext === "pcx") {
    const pcx = decodePcx(buf);
    if (pcx) return pcx;
  }
  if (ext === "ico" || ext === "cur") {
    const ico = decodeIco(buf);
    if (ico) return ico;
  }
  if (ext === "bmp") {
    const bmp = decodeBmp(buf);
    if (bmp) return bmp;
  }
  if (ext === "tga") {
    const tga = decodeTga(buf);
    if (tga) return tga;
  }
  const embedded = extractEmbeddedPng(buf);
  if (embedded) return embedded;
  // Fallback auto-sniff by content regardless of extension
  return decodeNetpbm(buf) ?? decodeTiff(buf) ?? decodePsd(buf) ?? decodeQoi(buf) ?? decodeBmp(buf) ?? decodeIco(buf) ?? decodeHdr(buf) ?? decodePcx(buf) ?? decodeXpm(buf) ?? decodeXbm(buf) ?? null;
}

