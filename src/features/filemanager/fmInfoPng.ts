/** PNG pictures: walks the chunk list (reading only the chunks that matter, anywhere in the file). */
import { inflateSync } from "zlib";
import { ascii, be16, be32, clip, Rows, type InfoGroup, type Source } from "./fmInfoCommon";
import { parseExifBlock, type ExifData } from "./fmInfoExif";
import { parseIcc, parseXmp, type IccInfo, type XmpInfo } from "./fmInfoMeta";

export interface PngInfo {
  width: number | null;
  height: number | null;
  rows: Rows;
  groups: InfoGroup[];
  exif: ExifData | null;
  icc: IccInfo | null;
  xmp: XmpInfo | null;
  hasAlpha: boolean;
  frames: number;
  textCount: number;
  chunkNames: string[];
  partial: boolean;
}

const COLOR_TYPE: Record<number, { name: string; channels: number }> = {
  0: { name: "Greyscale", channels: 1 }, 2: { name: "True colour (RGB)", channels: 3 }, 3: { name: "Indexed colour (palette)", channels: 1 },
  4: { name: "Greyscale with transparency", channels: 2 }, 6: { name: "True colour with transparency (RGBA)", channels: 4 },
};
const MAX_CHUNKS = 20_000;
const MAX_READ = 1024 * 1024;

function inflateLimited(data: Uint8Array, max: number): Buffer | null {
  try {
    return inflateSync(data, { maxOutputLength: max });
  } catch {
    return null;
  }
}

const cut = (b: Uint8Array, from: number): number => {
  for (let i = from; i < b.length; i++) if (b[i] === 0) return i;
  return -1;
};

export async function parsePng(src: Source, deadline = Date.now() + 6000): Promise<PngInfo> {
  const info: PngInfo = { width: null, height: null, rows: new Rows(), groups: [], exif: null, icc: null, xmp: null, hasAlpha: false, frames: 0, textCount: 0, chunkNames: [], partial: false };
  const rows = info.rows;
  const texts = new Rows();
  let pos = 8;
  let idat = 0, palette = 0, trns = false, animFrames = 0, plays: number | null = null, duration = 0, depth = 0, ctype = -1, interlace = 0;
  let seq = 0;
  for (; seq < MAX_CHUNKS; seq++) {
    if (Date.now() > deadline) { info.partial = true; break; }
    const h = await src.read(pos, 8);
    if (h.length < 8) { if (pos < src.size) info.partial = true; break; }
    const len = be32(h, 0);
    const type = ascii(h, 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) { info.partial = true; break; }
    if (pos + 12 + len > src.size) { info.partial = true; break; }
    if (info.chunkNames.length < 60 && !info.chunkNames.includes(type)) info.chunkNames.push(type);
    const data = async (max = MAX_READ) => (len > max ? Buffer.alloc(0) : src.read(pos + 8, len));
    if (type === "IHDR") {
      const d = await data();
      if (d.length >= 13) {
        info.width = be32(d, 0);
        info.height = be32(d, 4);
        depth = d[8]!;
        ctype = d[9]!;
        interlace = d[12]!;
        rows.add("Compression", d[10] === 0 ? "Deflate (lossless)" : `Method ${d[10]}`, "PNG squeezes pictures without losing any detail.");
      }
    } else if (type === "pHYs") {
      const d = await data();
      if (d.length >= 9) {
        const x = be32(d, 0), y = be32(d, 4);
        if (d[8] === 1 && x && y) rows.add("Pixel density", `${Math.round(x * 0.0254 * 10) / 10} × ${Math.round(y * 0.0254 * 10) / 10} DPI (${x} × ${y} pixels per metre)`, "How many pixels fit in an inch when printed. It doesn't change the pixel count.");
        else if (x && y) rows.add("Pixel shape", `${x}:${y}`, "Shape of one pixel; no real-world size is given.");
      }
    } else if (type === "gAMA") {
      const d = await data();
      if (d.length >= 4) rows.add("Gamma", String(be32(d, 0) / 100000), "A number describing how bright the middle tones are.");
    } else if (type === "cHRM") {
      const d = await data();
      if (d.length >= 32) rows.add("Chromaticities", `white ${be32(d, 0) / 1e5}, ${be32(d, 4) / 1e5}; red ${be32(d, 8) / 1e5}, ${be32(d, 12) / 1e5}`, "The exact colours of red, green, blue and white the picture was made for.");
    } else if (type === "sRGB") {
      const d = await data();
      rows.add("Colour space", `sRGB (${["perceptual", "relative colorimetric", "saturation", "absolute colorimetric"][d[0] ?? 0] ?? "intent " + d[0]})`, "The standard colours for screens and the web.");
    } else if (type === "iCCP") {
      const d = await data();
      const z = cut(d, 0);
      if (z > 0 && d.length > z + 2) {
        const name = clip(Buffer.from(d.subarray(0, z)).toString("latin1"), 80);
        const profile = inflateLimited(d.subarray(z + 2), 2 * 1024 * 1024);
        info.icc = profile ? parseIcc(profile) : null;
        rows.add("Colour profile name", info.icc?.description ? `${name} (${info.icc.description})` : name, "The name of the embedded colour profile (ICC).");
      }
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const d = await data(2 * MAX_READ);
      const z = cut(d, 0);
      if (z > 0) {
        const key = clip(Buffer.from(d.subarray(0, z)).toString("latin1"), 80);
        let text = "";
        if (type === "tEXt") text = Buffer.from(d.subarray(z + 1)).toString("latin1");
        else if (type === "zTXt") text = inflateLimited(d.subarray(z + 2), 256 * 1024)?.toString("latin1") ?? "(too large to read)";
        else {
          const compressed = d[z + 1] === 1;
          const l1 = cut(d, z + 3), l2 = l1 < 0 ? -1 : cut(d, l1 + 1);
          if (l2 >= 0) {
            const raw = d.subarray(l2 + 1);
            text = compressed ? inflateLimited(raw, 256 * 1024)?.toString("utf8") ?? "(too large to read)" : Buffer.from(raw).toString("utf8");
          }
        }
        info.textCount++;
        if (type === "iTXt" && key === "XML:com.adobe.xmp") info.xmp = parseXmp(text);
        else if (texts.length < 100) texts.add(key, text, "A note stored in the picture by the program that made it.");
      }
    } else if (type === "tIME") {
      const d = await data();
      if (d.length >= 7) rows.add("Last changed (stored in the file)", `${be16(d, 0)}-${String(d[2]).padStart(2, "0")}-${String(d[3]).padStart(2, "0")} ${String(d[4]).padStart(2, "0")}:${String(d[5]).padStart(2, "0")}:${String(d[6]).padStart(2, "0")} UTC`);
    } else if (type === "eXIf") {
      const d = await data();
      info.exif = info.exif ?? parseExifBlock(d);
    } else if (type === "acTL") {
      const d = await data();
      if (d.length >= 8) { animFrames = be32(d, 0); plays = be32(d, 4); }
    } else if (type === "fcTL") {
      const d = await data();
      info.frames++;
      if (d.length >= 24) {
        const den = be16(d, 22) || 100;
        duration += be16(d, 20) / den;
      }
    } else if (type === "PLTE") palette = len / 3;
    else if (type === "tRNS") trns = true;
    else if (type === "IDAT") idat++;
    pos += 12 + len;
    if (type === "IEND") break;
  }
  if (seq >= MAX_CHUNKS) info.partial = true;
  const ct = COLOR_TYPE[ctype];
  if (ct) {
    info.hasAlpha = ctype === 4 || ctype === 6 || trns;
    rows.add("Colour type", ct.name, "How the colours of each pixel are stored.");
    rows.add("Bit depth", `${depth} bits per channel`, "How many bits describe each colour channel. 8 is usual; 16 holds smoother gradients.");
    rows.add("Channels", ct.channels, "How many numbers describe one pixel (for example red, green, blue and transparency).");
    rows.add("Bits per pixel", depth * ct.channels).add("Transparency", info.hasAlpha ? "Yes" : "No");
    if (palette) rows.add("Palette colours", palette);
  }
  rows.add("Interlaced", interlace === 1 ? "Yes (Adam7): shows blurry first, then sharpens" : "No", "An interlaced picture appears in a rough form first while it loads.");
  if (animFrames > 0) {
    rows.add("Animated", `Yes, ${animFrames} frames`, "An animated PNG (APNG) shows several pictures one after another.");
    rows.add("Animation length", duration > 0 ? `${Math.round(duration * 100) / 100} s` : "").add("Loops", plays === 0 ? "Forever" : plays ? `${plays} time${plays === 1 ? "" : "s"}` : "");
  }
  const g = texts.group("png-text", "Text notes inside the picture", "Notes (tEXt, iTXt, zTXt chunks) that programs add: title, author, software, comments.");
  if (g) info.groups.push(g);
  const names = new Rows();
  names.add("Chunks present", info.chunkNames.join(", "), "A PNG file is a list of labelled blocks called chunks. IHDR is the header, IDAT holds the pixels.");
  names.add("Pixel data blocks", idat);
  const gn = names.group("png-chunks", "PNG structure");
  if (gn) info.groups.push(gn);
  return info;
}
