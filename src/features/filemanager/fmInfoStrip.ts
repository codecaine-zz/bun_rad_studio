/**
 * A lossless cleaner for JPEG, PNG and WebP: makes a copy without the hidden notes (camera, place, dates, author, text,
 * thumbnails). The picture data is copied byte for byte; nothing is re-encoded. The original is never touched.
 */
import { crc32 } from "zlib";
import { promises as fsp } from "fs";
import { absolutePath, pathApi, type FmContext } from "./fmCore";
import { ascii, be16, be32, le32, regularFile, writeNewFile } from "./fmInfoCommon";
import { exifNumber, parseExifBlock } from "./fmInfoExif";
import { FmError, splitName } from "./fmPaths";

export const STRIP_MAX_BYTES = 256 * 1024 * 1024;

export interface StripResult {
  bytes: Buffer;
  removed: string[];
  trailingBytes: number;
}

/** A tiny EXIF block that only says how the picture is turned, so it still shows the right way up. */
function orientationOnly(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  return tiff;
}

export function stripJpeg(input: Buffer, keepOrientation = false): StripResult {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new FmError("NOT_SUPPORTED", "That isn't a JPEG picture.");
  const parts: Buffer[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  let orientation: number | null = null;
  let pos = 2;
  let scanStart = -1;
  const note = (what: string) => { if (!removed.includes(what)) removed.push(what); };
  while (pos + 4 <= input.length) {
    if (input[pos] !== 0xff) throw new FmError("DAMAGED", "This JPEG is damaged, so it can't be cleaned safely.");
    const marker = input[pos + 1]!;
    if (marker === 0xff) { pos++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(input.subarray(pos, pos + 2)); pos += 2; continue; }
    if (marker === 0xd9) break;
    const len = be16(input, pos + 2);
    if (len < 2 || pos + 2 + len > input.length) throw new FmError("DAMAGED", "This JPEG is damaged, so it can't be cleaned safely.");
    const seg = input.subarray(pos, pos + 2 + len);
    const body = seg.subarray(4);
    if (marker === 0xda) { scanStart = pos; break; }
    let keep = true;
    if (marker === 0xfe) { keep = false; note("comments"); }
    else if (marker >= 0xe0 && marker <= 0xef) {
      const tag = ascii(body, 0, 30);
      if (marker === 0xe0 && tag.startsWith("JFIF\0")) keep = true;
      else if (marker === 0xe2 && tag.startsWith("ICC_PROFILE\0")) keep = true;
      else if (marker === 0xee && tag.startsWith("Adobe")) keep = true;
      else {
        keep = false;
        if (marker === 0xe1 && tag.startsWith("Exif\0")) {
          note("EXIF (camera, date, location)");
          const exif = parseExifBlock(body);
          if (exif) {
            orientation = exifNumber(exif, "IFD0", 0x112);
            if (exif.tags.some((t) => t.ifd === "GPS")) note("GPS location");
            if (exif.hasThumbnail) note("hidden thumbnail");
          }
        } else if (marker === 0xe1 && tag.startsWith("http://ns.adobe.com/xap")) note("XMP");
        else if (marker === 0xed) note("Photoshop / IPTC");
        else if (marker === 0xe2 && tag.startsWith("MPF")) note("multi-picture data");
        else note(`other notes (APP${marker - 0xe0})`);
      }
    }
    if (keep) parts.push(seg);
    pos += 2 + len;
  }
  if (scanStart < 0) throw new FmError("DAMAGED", "This JPEG has no picture data, so it can't be cleaned.");
  if (keepOrientation && orientation && orientation > 1 && orientation <= 8) {
    const tiff = orientationOnly(orientation);
    const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
    const head = Buffer.alloc(4);
    head[0] = 0xff;
    head[1] = 0xe1;
    head.writeUInt16BE(payload.length + 2, 2);
    parts.splice(1, 0, Buffer.concat([head, payload]));
  }
  // The picture data runs from the start of the scan to the end-of-image mark; anything after that is extra data.
  let end = input.length;
  for (let i = scanStart + 2 + be16(input, scanStart + 2); i + 1 < input.length; i++) {
    if (input[i] !== 0xff) continue;
    const m = input[i + 1]!;
    if (m === 0xd9) { end = i + 2; break; }
    if (m === 0 || m === 0xff || (m >= 0xd0 && m <= 0xd7)) { if (m !== 0xff) i++; continue; }
    i += 1 + be16(input, i + 2);
  }
  const trailingBytes = input.length - end;
  if (trailingBytes > 0) note("extra data stored after the picture");
  parts.push(input.subarray(scanStart, end));
  return { bytes: Buffer.concat(parts), removed, trailingBytes };
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "hIST", "pHYs", "sPLT", "acTL", "fcTL", "fdAT", "cICP", "mDCv", "cLLi"]);

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

export function stripPng(input: Buffer, keepOrientation = false): StripResult {
  if (input.length < 8 || input[0] !== 0x89 || ascii(input, 1, 3) !== "PNG") throw new FmError("NOT_SUPPORTED", "That isn't a PNG picture.");
  const parts: Buffer[] = [input.subarray(0, 8)];
  const removed: string[] = [];
  const note = (what: string) => { if (!removed.includes(what)) removed.push(what); };
  let pos = 8;
  let orientation: number | null = null;
  let sawEnd = false;
  let afterHeader: number | null = null;
  while (pos + 12 <= input.length) {
    const len = be32(input, pos);
    const type = ascii(input, pos + 4, 4);
    if (pos + 12 + len > input.length) throw new FmError("DAMAGED", "This PNG is damaged, so it can't be cleaned safely.");
    const chunk = input.subarray(pos, pos + 12 + len);
    if (PNG_KEEP.has(type)) {
      parts.push(chunk);
      if (type === "IHDR") afterHeader = parts.length;
    } else if (type === "eXIf") {
      note("EXIF (camera, date, location)");
      const exif = parseExifBlock(input.subarray(pos + 8, pos + 8 + len));
      if (exif) {
        orientation = exifNumber(exif, "IFD0", 0x112);
        if (exif.tags.some((t) => t.ifd === "GPS")) note("GPS location");
      }
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") note("text notes");
    else if (type === "tIME") note("last-changed time");
    else if (/^[a-z]/.test(type)) note(`other notes (${type})`);
    else parts.push(chunk); // an unknown chunk the picture may need
    pos += 12 + len;
    if (type === "IEND") { sawEnd = true; break; }
  }
  if (!sawEnd) throw new FmError("DAMAGED", "This PNG is cut short, so it can't be cleaned safely.");
  const trailingBytes = input.length - pos;
  if (trailingBytes > 0) note("extra data stored after the picture");
  if (keepOrientation && orientation && orientation > 1 && orientation <= 8 && afterHeader !== null) parts.splice(afterHeader, 0, pngChunk("eXIf", orientationOnly(orientation)));
  return { bytes: Buffer.concat(parts), removed, trailingBytes };
}

export function stripWebp(input: Buffer): StripResult {
  if (input.length < 12 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 4) !== "WEBP") throw new FmError("NOT_SUPPORTED", "That isn't a WebP picture.");
  const removed: string[] = [];
  const parts: Buffer[] = [];
  let pos = 12;
  while (pos + 8 <= input.length) {
    const type = ascii(input, pos, 4);
    const len = le32(input, pos + 4);
    const total = 8 + len + (len & 1);
    if (pos + 8 + len > input.length) throw new FmError("DAMAGED", "This WebP is damaged, so it can't be cleaned safely.");
    const chunk = Buffer.from(input.subarray(pos, Math.min(input.length, pos + total)));
    if (type === "EXIF" || type === "XMP ") {
      if (!removed.includes(type === "EXIF" ? "EXIF (camera, date, location)" : "XMP")) removed.push(type === "EXIF" ? "EXIF (camera, date, location)" : "XMP");
    } else {
      if (type === "VP8X") chunk[8] = chunk[8]! & ~0x0c;
      parts.push(chunk);
    }
    pos += total;
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(4 + body.length, 4);
  head.write("WEBP", 8, "latin1");
  return { bytes: Buffer.concat([head, body]), removed, trailingBytes: 0 };
}

export interface StripDone {
  path: string;
  name: string;
  removed: string[];
  bytesBefore: number;
  bytesAfter: number;
  trailingBytes: number;
  keptOrientation: boolean;
}

/** Makes `<name> (no metadata).<ext>` next to the picture. Only JPEG, PNG and WebP are cleaned here. */
export async function stripFile(ctx: FmContext, input: unknown, keepOrientation = false): Promise<StripDone> {
  const target = await regularFile(ctx, input);
  const src = absolutePath(ctx, input);
  if (target.lst.size > STRIP_MAX_BYTES) throw new FmError("TOO_BIG", "That picture is too big for the built-in cleaner.");
  const bytes = await fsp.readFile(src);
  let result: StripResult;
  let kind: string;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) { kind = "jpg"; result = stripJpeg(bytes, keepOrientation); }
  else if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") { kind = "png"; result = stripPng(bytes, keepOrientation); }
  else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") { kind = "webp"; result = stripWebp(bytes); }
  else throw new FmError("NOT_SUPPORTED", "The built-in cleaner works on JPEG, PNG and WebP pictures. For other kinds, use Convert or process, then \"Remove location and camera info\".");
  const p = pathApi(ctx);
  const [base, ext] = splitName(p.basename(src));
  const wanted = `${base} (no metadata)${ext || `.${kind}`}`;
  const written = await writeNewFile(ctx, p.dirname(src), wanted, result.bytes);
  return { ...written, removed: result.removed, bytesBefore: bytes.length, bytesAfter: result.bytes.length, trailingBytes: result.trailingBytes, keptOrientation: keepOrientation };
}
