/** WebP and HEIC/AVIF pictures: container walkers that read sizes, flags and embedded notes. */
import { ascii, be32, formatDuration, le16, le32, readBoxes, Rows, type Source } from "./fmInfoCommon";
import { parseExifBlock, type ExifData } from "./fmInfoExif";
import { parseIcc, parseXmp, type IccInfo, type XmpInfo } from "./fmInfoMeta";

export interface WebpInfo {
  width: number | null;
  height: number | null;
  rows: Rows;
  animated: boolean;
  alpha: boolean | null;
  exif: ExifData | null;
  xmp: XmpInfo | null;
  icc: IccInfo | null;
  partial: boolean;
}

const le24 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);

export async function parseWebp(src: Source, deadline = Date.now() + 6000): Promise<WebpInfo> {
  const info: WebpInfo = { width: null, height: null, rows: new Rows(), animated: false, alpha: null, exif: null, xmp: null, icc: null, partial: false };
  const r = info.rows;
  let pos = 12;
  let encoding = "", flags = 0, frames = 0, duration = 0, loops: number | null = null, sawAlph = false;
  for (let n = 0; n < 10_000 && pos + 8 <= src.size; n++) {
    if (Date.now() > deadline) { info.partial = true; break; }
    const h = await src.read(pos, 8);
    if (h.length < 8) break;
    const type = ascii(h, 0, 4);
    const len = le32(h, 4);
    if (pos + 8 + len > src.size) { info.partial = true; if (type !== "VP8X" && type !== "VP8 " && type !== "VP8L") break; }
    const read = async (max = 2 * 1024 * 1024) => (len > max ? Buffer.alloc(0) : src.read(pos + 8, len));
    if (type === "VP8X") {
      const d = await read();
      if (d.length >= 10) {
        flags = d[0]!;
        info.width = 1 + le24(d, 4);
        info.height = 1 + le24(d, 7);
        encoding = encoding || "Extended (VP8X)";
      }
    } else if (type === "VP8 ") {
      const d = await src.read(pos + 8, 10);
      if (d.length >= 10 && d[3] === 0x9d && d[4] === 0x01 && d[5] === 0x2a) {
        info.width = info.width ?? (le16(d, 6) & 0x3fff);
        info.height = info.height ?? (le16(d, 8) & 0x3fff);
      }
      encoding = "Lossy (VP8)";
    } else if (type === "VP8L") {
      const d = await src.read(pos + 8, 5);
      if (d.length >= 5 && d[0] === 0x2f) {
        const bits = le32(d, 1);
        info.width = info.width ?? 1 + (bits & 0x3fff);
        info.height = info.height ?? 1 + ((bits >> 14) & 0x3fff);
        if (info.alpha === null) info.alpha = ((bits >> 28) & 1) === 1;
      }
      encoding = "Lossless (VP8L)";
    } else if (type === "ALPH") sawAlph = true;
    else if (type === "ANIM") {
      const d = await read();
      if (d.length >= 6) loops = le16(d, 4);
    } else if (type === "ANMF") {
      frames++;
      const d = await src.read(pos + 8, 16);
      if (d.length >= 15) duration += le24(d, 12) / 1000;
    } else if (type === "EXIF") {
      const d = await read();
      const block = d.length > 6 && ascii(d, 0, 4) === "Exif" ? d.subarray(6) : d;
      info.exif = info.exif ?? parseExifBlock(block);
    } else if (type === "XMP ") info.xmp = parseXmp((await read()).toString("utf8"));
    else if (type === "ICCP") info.icc = parseIcc(await read());
    pos += 8 + len + (len & 1);
  }
  if (flags & 0x10 || sawAlph) info.alpha = true;
  else if (info.alpha === null) info.alpha = false;
  info.animated = (flags & 0x02) !== 0 || frames > 1;
  r.add("Encoding", encoding, "Lossy WebP drops a little detail to save space. Lossless WebP keeps every pixel.");
  const has = [flags & 0x20 ? "colour profile" : "", flags & 0x10 ? "transparency" : "", flags & 0x08 ? "EXIF" : "", flags & 0x04 ? "XMP" : "", flags & 0x02 ? "animation" : ""].filter(Boolean);
  r.add("Contains", has.join(", "), "Extra parts the file declares: a colour profile (ICC), see-through areas, EXIF camera notes, XMP text notes, animation.");
  r.add("Transparency", info.alpha ? "Yes" : "No");
  if (info.animated) {
    r.add("Frames", frames || "").add("Animation length", duration ? formatDuration(duration) : "").add("Loops", loops === null ? "" : loops === 0 ? "Forever" : `${loops} time${loops === 1 ? "" : "s"}`);
  }
  return info;
}

export interface HeifInfo {
  width: number | null;
  height: number | null;
  rows: Rows;
  partial: boolean;
}

export async function parseHeif(src: Source): Promise<HeifInfo> {
  const rows = new Rows();
  const buf = await src.read(0, 4 * 1024 * 1024);
  const ftyp = readBoxes(buf, 0, buf.length).find((b) => b.type === "ftyp");
  const sizes: Array<[number, number]> = [];
  let depth = "", rotation: number | null = null, colour = "";
  if (ftyp) {
    rows.add("Brand", ascii(buf, ftyp.body, 4).trim(), "The label that says which kind of HEIF file this is (heic = Apple photos, avif = AV1 images).");
    const compat: string[] = [];
    for (let p = ftyp.body + 8; p + 4 <= ftyp.end && compat.length < 8; p += 4) compat.push(ascii(buf, p, 4).trim());
    rows.add("Also compatible with", compat.join(", "));
  }
  const walk = (start: number, end: number, level: number) => {
    if (level > 6) return;
    for (const b of readBoxes(buf, start, end)) {
      if (b.type === "meta") walk(b.body + 4, b.end, level + 1);
      else if (b.type === "iprp" || b.type === "ipco") walk(b.body, b.end, level + 1);
      else if (b.type === "ispe" && b.end - b.body >= 12 && sizes.length < 64) sizes.push([be32(buf, b.body + 4), be32(buf, b.body + 8)]);
      else if (b.type === "pixi" && b.end - b.body >= 6 && !depth) depth = `${buf[b.body + 5] ?? ""} bits per channel, ${buf[b.body + 4] ?? ""} channels`;
      else if (b.type === "irot" && rotation === null) rotation = ((buf[b.body] ?? 0) & 3) * 90;
      else if (b.type === "colr" && !colour) {
        const t = ascii(buf, b.body, 4);
        colour = t === "nclx" ? "Described by number codes (nclx)" : t === "prof" || t === "rICC" ? "Embedded ICC profile" : "";
      }
    }
  };
  walk(0, buf.length, 0);
  sizes.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
  const best = sizes[0];
  rows.add("Pictures inside", sizes.length > 1 ? `${sizes.length} (the largest is shown; the others are previews)` : "", "HEIC files often hold the main picture and smaller preview pictures.");
  rows.add("Bit depth", depth).add("Rotation stored", rotation === null ? "" : `${rotation}° turn`, "The picture is stored this way up and a viewer turns it.").add("Colour description", colour);
  return { width: best?.[0] ?? null, height: best?.[1] ?? null, rows, partial: !best };
}
