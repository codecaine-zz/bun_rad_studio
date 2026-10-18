import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { createContext } from "../src/features/filemanager/fmCore";
import { bufferSource } from "../src/features/filemanager/fmInfoCommon";
import { parseExifBlock, parseTiff, summarizeExif, gpsOf } from "../src/features/filemanager/fmInfoExif";
import { analyzeImage, aspectText, commonImageRows, type ImageAnalysis } from "../src/features/filemanager/fmInfoImage";
import { imageInfo } from "../src/features/filemanager/fmInfoImageOps";
import { exiftoolInfo, groupExiftoolJson } from "../src/features/filemanager/fmInfoExiftool";
import { parseJpeg } from "../src/features/filemanager/fmInfoJpeg";
import { parseSvg } from "../src/features/filemanager/fmInfoSvg";
import { parseXmp, parseIcc, decodeEntities } from "../src/features/filemanager/fmInfoMeta";
import { stripFile, stripJpeg, stripPng, stripWebp } from "../src/features/filemanager/fmInfoStrip";
import {
  SCAN_DATA, SVG_NASTY, SVG_PLAIN, app1Exif, app1Xmp, ascii as tAscii, bmp, box, chunk, com, gif, ico, icc, iccp, itxt, jpeg, long, photoTiff, phys, png, quantTable, scratchRoot, segment, short, text, tiff, webpExtended,
  webpLossless, webpLossy, ztxt, rational, undef,
} from "./file_manager_info_fixtures";

const root = scratchRoot("image");
const ctx = createContext({ home: root.dir, dataDir: join(root.dir, "data") });
afterAll(() => root.remove());

const rowsOf = (a: ImageAnalysis) => Object.fromEntries(commonImageRows(a).rows.map((r) => [r.label, r.value]));
const analyze = async (b: Buffer, ext = "") => (await analyzeImage(bufferSource(b), ext))!;
const tool = (name: string) => Bun.which(name);
const exiftool = tool("exiftool");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("PNG", () => {
  const exifBlock = photoTiff(false);
  const file = png({
    w: 7, h: 5, colorType: 6,
    before: [phys(11811), chunk("gAMA", Buffer.from([0, 1, 0x86, 0xa0])), chunk("sRGB", Buffer.from([0])), iccp("Test sRGB", icc("My ICC profile")), chunk("tIME", Buffer.from([0x07, 0xe8, 5, 1, 12, 30, 15])), text("Author", "Jane"), ztxt("Comment", "squeezed note"), itxt("Title", "Ünïcode título", true), itxt("XML:com.adobe.xmp", '<x:xmpmeta><dc:creator><rdf:Seq><rdf:li>Xmp Creator</rdf:li></rdf:Seq></dc:creator></x:xmpmeta>')],
    after: [chunk("eXIf", exifBlock)],
  });

  test("size, color type, bit depth, density, gamma, profile name, times and text notes", async () => {
    const a = await analyze(file);
    expect([a.kind, a.width, a.height, a.hasAlpha]).toEqual(["png", 7, 5, true]);
    const r = rowsOf(a);
    expect(r["Color type"]).toContain("RGBA");
    expect(r["Bit depth"]).toBe("8 bits per channel");
    expect(r["Channels"]).toBe("4");
    expect(r["Bits per pixel"]).toBe("32");
    expect(r["Pixel density"]).toContain("300 × 300 DPI");
    expect(r["Gamma"]).toBe("1");
    expect(r["Color space"]).toContain("sRGB");
    expect(r["Color profile name"]).toContain("My ICC profile");
    expect(r["Last changed (stored in the file)"]).toBe("2024-05-01 12:30:15 UTC");
    expect(r["Interlaced"]).toStartWith("No");
    const texts = Object.fromEntries(a.groups.find((g) => g.id === "png-text")!.rows.map((x) => [x.label, x.value]));
    expect(texts).toEqual({ Author: "Jane", Comment: "squeezed note", Title: "Ünïcode título" });
    expect(a.xmp?.creator).toBe("Xmp Creator");
    expect(a.icc?.description).toBe("My ICC profile");
    expect(a.textNotes).toBe(4);
  });

  test("the eXIf chunk is read and the GPS position comes out right", async () => {
    const a = await analyze(file);
    expect(a.exif).not.toBeNull();
    const gps = gpsOf(a.exif!)!;
    expect(gps.lat).toBeCloseTo(48.858222, 5);
    expect(gps.lon).toBeCloseTo(2.2945, 5);
  });

  test("interlaced palette pictures and 16-bit grays", async () => {
    const p = rowsOf(await analyze(png({ colorType: 3, interlace: 1, depth: 8 })));
    expect(p["Interlaced"]).toContain("Adam7");
    expect(p["Palette colors"]).toBe("4");
    const g = rowsOf(await analyze(png({ colorType: 0, depth: 16 })));
    expect([g["Bit depth"], g["Channels"], g["Transparency"]]).toEqual(["16 bits per channel", "1", "No"]);
  });

  test("a PNG with a text bomb inside gives up on that note instead of expanding it", async () => {
    const bomb = chunk("zTXt", Buffer.concat([Buffer.from("Big\0\0", "latin1"), require("zlib").deflateSync(Buffer.alloc(5_000_000, 0x41))]));
    const a = await analyze(png({ before: [bomb] }));
    expect(a.groups.find((g) => g.id === "png-text")!.rows[0]!.value).toBe("(too large to read)");
  });
});

describe("EXIF", () => {
  for (const le of [false, true]) {
    test(`${le ? "little" : "big"}-endian: camera, lens, settings and GPS rationals`, () => {
      const exif = parseTiff(photoTiff(le))!;
      expect(exif.littleEndian).toBe(le);
      const report = summarizeExif(exif, { xmp: true });
      const camera = Object.fromEntries(report.camera.rows.map((r) => [r.label, r.value]));
      expect(camera["Camera"]).toBe("Canon EOS R5");
      expect(camera["Lens"]).toBe("RF24-70mm F2.8 L IS USM");
      expect(camera["Exposure time"]).toBe("1/250 s");
      expect(camera["Aperture"]).toBe("f/2.8");
      expect(camera["ISO"]).toBe("400");
      expect(camera["Focal length"]).toBe("50 mm (75 mm in 35 mm film terms)");
      expect(camera["Date taken"]).toBe("2024-05-01 12:34:56 (time zone +02:00)");
      expect(camera["Flash"]).toBe("Flash did not fire, suppressed");
      expect(camera["Metering"]).toBe("Pattern (matrix)");
      expect(camera["Exposure program"]).toBe("Aperture priority");
      expect(camera["White balance"]).toBe("Auto");
      expect(camera["Artist"]).toBe("Jane Doe");
      expect(camera["Software"]).toBe("Test Software 1.0");
      expect(camera["Camera serial number"]).toBe("123456789");
      const image = Object.fromEntries(report.image.rows.map((r) => [r.label, r.value]));
      expect(image["Orientation"]).toContain("90° right");
      expect(image["Resolution"]).toBe("72 × 72 per inch");
      expect(image["Color space"]).toBe("sRGB");
      expect(image["Thumbnail"]).toContain("preview");
      expect(image["Camera maker's extra notes"]).toContain("Present");
      expect(report.gps).toMatchObject({ lat: 48.858222, lon: 2.2945, altitude: 35.5, direction: 90 });
      expect(report.gps!.latText).toBe("48° 51′ 29.6″ N");
      expect(report.location.rows[0]!.value).toBe("This photo contains the location where it was taken.");
      expect(report.privacy.filter((p) => p.present).map((p) => p.id).sort()).toEqual(["dates", "gps", "maker", "owner", "serial", "software", "thumbnail", "xmp"]);
      expect(report.photo).toMatchObject({ camera: "Canon EOS R5", iso: "ISO 400", aperture: "f/2.8", shutter: "1/250 s", focal: "50 mm" });
    });
  }

  test("south and west references give negative numbers, and below sea level is negative", () => {
    const t = tiff({ ifd0: [], gps: [tAscii(1, "S"), rational(2, [33, 1], [51, 1], [0, 1]), tAscii(3, "W"), rational(4, [151, 1], [12, 1], [0, 1]), { id: 5, type: 1, value: [1] }, rational(6, [10, 1])] });
    const g = gpsOf(parseTiff(t)!)!;
    expect(g.lat).toBeCloseTo(-33.85, 6);
    expect(g.lon).toBeCloseTo(-151.2, 6);
    expect(g.altitude).toBe(-10);
  });

  test("nonsense coordinates are not reported", () => {
    for (const bad of [
      tiff({ ifd0: [], gps: [tAscii(1, "N"), rational(2, [95, 1], [0, 1], [0, 1]), tAscii(3, "E"), rational(4, [2, 1], [0, 1], [0, 1])] }),
      tiff({ ifd0: [], gps: [tAscii(1, "N"), rational(2, [1, 0], [0, 1], [0, 1]), tAscii(3, "E"), rational(4, [2, 1], [0, 1], [0, 1])] }),
      tiff({ ifd0: [], gps: [tAscii(1, "X"), rational(2, [1, 1], [0, 1], [0, 1]), tAscii(3, "E"), rational(4, [2, 1], [0, 1], [0, 1])] }),
    ]) expect(gpsOf(parseTiff(bad)!)).toBeNull();
  });

  test("a loop of IFDs ends, and each tag is read once", () => {
    const t = tiff({ ifd0: [tAscii(0x10f, "Loopy")], exif: [short(0x8827, 100)], loop: true });
    const start = Date.now();
    const exif = parseTiff(t)!;
    expect(Date.now() - start).toBeLessThan(500);
    expect(exif.tags.filter((x) => x.name === "Make")).toHaveLength(1);
    expect(exif.tags.filter((x) => x.name === "ISOSpeedRatings")).toHaveLength(1);
  });

  test("absurd counts, offsets outside the data and a missing byte order mark are handled", () => {
    const base = Buffer.from(photoTiff(false));
    const hugeCount = Buffer.from(base);
    hugeCount.writeUInt32BE(0xfffffff0, 8 + 2 + 4); // the count of the first entry
    expect(() => parseTiff(hugeCount)).not.toThrow();
    const badOffset = Buffer.from(base);
    badOffset.writeUInt32BE(0x7fffffff, 4);
    expect(parseTiff(badOffset)!.tags).toEqual([]);
    expect(parseTiff(Buffer.from("not a tiff at all"))).toBeNull();
    expect(parseTiff(Buffer.alloc(3))).toBeNull();
    expect(parseExifBlock(Buffer.from("Exif\0\0II*\0"))).toBeNull();
    const cut = parseTiff(base.subarray(0, 90))!;
    expect(cut.partial).toBe(true);
  });

  test("random damage never throws and stays quick", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const base = photoTiff(true);
    const start = Date.now();
    for (let i = 0; i < 400; i++) {
      const b = Buffer.from(base);
      for (let k = 0; k < 6; k++) b[rnd() % b.length] = rnd() & 255;
      expect(() => summarizeExif(parseTiff(b) ?? { littleEndian: false, tags: [], partial: true, hasThumbnail: false, hasMakerNote: false, makerNoteBytes: 0 })).not.toThrow();
    }
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe("JPEG", () => {
  test("baseline: size, type, subsampling, quality estimate, JFIF and segments", async () => {
    const a = await analyze(jpeg({ w: 800, h: 600, quality: 85 }));
    const r = rowsOf(a);
    expect([a.kind, a.width, a.height]).toEqual(["jpeg", 800, 600]);
    expect(r["JPEG type"]).toBe("Baseline");
    expect(r["Chroma subsampling"]).toBe("4:2:0");
    expect(r["Quality (estimate)"]).toBe("about 85 of 100");
    expect(r["Aspect ratio"]).toBe("4:3");
    expect(r["Megapixels"]).toBe("0.48 MP");
    expect(r["JFIF version"]).toBe("1.01");
    expect(r["Pixel density"]).toContain("72 × 72");
  });

  test("progressive, gray and the other subsampling modes", async () => {
    expect(rowsOf(await analyze(jpeg({ progressive: true })))["JPEG type"]).toContain("Progressive");
    expect(rowsOf(await analyze(jpeg({ gray: true })))["Chroma subsampling"]).toContain("Gray");
    expect(rowsOf(await analyze(jpeg({ subsampling: "444" })))["Chroma subsampling"]).toBe("4:4:4");
    expect(rowsOf(await analyze(jpeg({ subsampling: "422" })))["Chroma subsampling"]).toBe("4:2:2");
  });

  test("the quality estimate follows the quality the tables were made for", async () => {
    for (const q of [10, 30, 50, 75, 90, 95]) {
      const info = await parseJpeg(bufferSource(jpeg({ quality: q })));
      expect(Math.abs(info.quality! - q), `quality ${q}`).toBeLessThanOrEqual(2);
    }
    expect(quantTable(100)[0]).toBe(1);
    expect((await parseJpeg(bufferSource(jpeg({ quality: 100 })))).quality).toBe(100);
  });

  test("Exif (both byte orders), XMP, ICC, Adobe, MPF, Photoshop and comment segments are recognized", async () => {
    const xmp = '<x:xmpmeta xmlns:dc="d"><rdf:RDF><rdf:Description xmp:Rating="4" xmp:CreatorTool="Tool X"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">A &amp; B</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>Ann</rdf:li><rdf:li>Bob</rdf:li></rdf:Seq></dc:creator><dc:subject><rdf:Bag><rdf:li>cat</rdf:li><rdf:li>dog</rdf:li></rdf:Bag></dc:subject><dc:rights><rdf:Alt><rdf:li>(c) Me</rdf:li></rdf:Alt></dc:rights></rdf:Description></rdf:RDF></x:xmpmeta>';
    const profile = icc("Display P3");
    const iccSeg = segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1]), profile]));
    for (const le of [true, false]) {
      const a = await analyze(jpeg({ segments: [app1Exif(photoTiff(le)), app1Xmp(xmp), iccSeg, segment(0xe2, Buffer.from("MPF\0abcd", "latin1")), segment(0xed, Buffer.from("Photoshop 3.0\0" + "8BIM\x04\x04\0\0\0\0\0\0", "latin1")), segment(0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1")), com("hello comment")] }));
      expect(a.exif?.littleEndian).toBe(le);
      expect(a.xmp).toMatchObject({ title: "A & B", creator: "Ann, Bob", rating: "4", tool: "Tool X", rights: "(c) Me", keywords: ["cat", "dog"] });
      expect(a.icc).toMatchObject({ description: "Display P3", colorSpace: "RGB", profileClass: "Display", version: "2.4.0" });
      expect(a.hasIptc).toBe(true);
      const r = rowsOf(a);
      expect(r["Comment"]).toBe("hello comment");
      expect(r["Color handling"]).toBe("Adobe (YCbCr)");
      const segs = a.groups.find((g) => g.id === "jpeg-structure")!.rows[0]!.value;
      expect(segs).toContain("APP1 (EXIF)");
      expect(segs).toContain("APP1 (XMP)");
      expect(segs).toContain("ICC color profile");
      expect(segs).toContain("MPF");
    }
  });

  test("cut-off and corrupt JPEG files give a partial answer", async () => {
    const full = jpeg({ segments: [app1Exif(photoTiff(false))] });
    const info = await parseJpeg(bufferSource(full.subarray(0, 40)));
    expect(info.partial).toBe(true);
    expect((await parseJpeg(bufferSource(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x02])))).partial).toBe(true);
    expect((await parseJpeg(bufferSource(Buffer.from("not a jpeg")))).partial).toBe(true);
  });
});

describe("GIF, WebP, BMP, ICO and TIFF", () => {
  test("an animated GIF: frames, loop and duration", async () => {
    const a = await analyze(gif(4, 25, 3, "made by tests"));
    const r = rowsOf(a);
    expect([a.width, a.height, a.animated]).toEqual([3, 2, true]);
    expect(r["Frames"]).toBe("4");
    expect(r["Animation length"]).toBe("1 s");
    expect(r["Loops"]).toBe("3 times");
    expect(r["Colors in the main palette"]).toBe("2");
    expect(r["Transparency"]).toBe("Yes");
    expect(a.groups.find((g) => g.id === "gif-comments")!.rows[0]!.value).toBe("made by tests");
    expect(rowsOf(await analyze(gif(2, 10, 0)))["Loops"]).toBe("Forever");
    const still = await analyze(gif(1, 0, null));
    expect(still.animated).toBe(false);
  });

  test("WebP lossy, lossless and extended with EXIF, XMP, ICC and animation", async () => {
    const lossy = await analyze(webpLossy(300, 200));
    expect([lossy.width, lossy.height, rowsOf(lossy)["Encoding"]]).toEqual([300, 200, "Lossy (VP8)"]);
    const lossless = await analyze(webpLossless(65, 33, true));
    expect([lossless.width, lossless.height, lossless.hasAlpha]).toEqual([65, 33, true]);
    const ext = await analyze(webpExtended(1000, 700, { exif: Buffer.concat([Buffer.from("Exif\0\0", "latin1"), photoTiff(false)]), xmp: "<x:xmpmeta><dc:title><rdf:Alt><rdf:li>WebP title</rdf:li></rdf:Alt></dc:title></x:xmpmeta>", icc: icc("WebP profile"), alpha: true }));
    expect([ext.width, ext.height, ext.hasAlpha]).toEqual([1000, 700, true]);
    expect(rowsOf(ext)["Contains"]).toBe("color profile, transparency, EXIF, XMP");
    expect(gpsOf(ext.exif!)!.lat).toBeCloseTo(48.858222, 5);
    expect(ext.xmp?.title).toBe("WebP title");
    expect(ext.icc?.description).toBe("WebP profile");
    const anim = await analyze(webpExtended(50, 40, { animated: 5 }));
    expect(anim.animated).toBe(true);
    expect(rowsOf(anim)["Frames"]).toBe("5");
    expect(rowsOf(anim)["Animation length"]).toBe("0.2 s");
    expect(rowsOf(anim)["Loops"]).toBe("Forever");
  });

  test("BMP and ICO", async () => {
    const b = await analyze(bmp(30, 20, 24, 96));
    expect([b.width, b.height]).toEqual([30, 20]);
    expect(rowsOf(b)["Bits per pixel"]).toBe("24");
    expect(rowsOf(b)["Pixel density"]).toBe("96 × 96 DPI");
    expect(rowsOf(b)["Compression"]).toBe("None");
    const i = await analyze(ico([16, 32, 256]));
    expect(rowsOf(i)["Sizes"]).toBe("16×16 (32-bit), 32×32 (32-bit), 256×256 (32-bit)");
    expect([i.width, i.height]).toEqual([256, 256]);
    expect(rowsOf(await analyze(ico([32], true)))["Kind"]).toContain("Cursor");
  });

  test("TIFF in both byte orders, with the camera notes", async () => {
    for (const le of [true, false]) {
      const t = tiff({ le, ifd0: [long(0x100, 1024), long(0x101, 768), short(0x102, 8, 8, 8), short(0x103, 5), short(0x106, 2), short(0x115, 3), tAscii(0x10f, "Scanner Co"), rational(0x11a, [300, 1]), rational(0x11b, [300, 1]), short(0x128, 2)], exif: [short(0x8827, 200)] });
      const a = await analyze(t);
      expect([a.kind, a.width, a.height]).toEqual(["tiff", 1024, 768]);
      const r = rowsOf(a);
      expect(r["Compression"]).toBe("LZW");
      expect(r["Color model"]).toBe("RGB");
      expect(r["Bits per channel"]).toBe("8, 8, 8");
      expect(r["Byte order"]).toContain(le ? "Little" : "Big");
      expect(a.exif!.tags.find((x) => x.name === "ISOSpeedRatings")!.value).toBe(200);
    }
  });

  test("an animated PNG (APNG): frames, duration and loops", async () => {
    const u = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const fctl = (seq: number) => chunk("fcTL", Buffer.concat([u(seq), u(2), u(2), u(0), u(0), Buffer.from([0, 10, 0, 100, 0, 0])]));
    const a = await analyze(png({ before: [chunk("acTL", Buffer.concat([u(3), u(2)])), fctl(0)], after: [fctl(1), fctl(2)] }));
    const r = rowsOf(a);
    expect(a.animated).toBe(true);
    expect(r["Animated"]).toBe("Yes, 3 frames");
    expect(r["Animation length"]).toBe("0.3 s");
    expect(r["Loops"]).toBe("2 times");
  });

  test("HEIC / AVIF: the size comes from the image-spatial-extents boxes, and the largest picture is the one shown", async () => {
    const be32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const full = (type: string, ...p: Buffer[]) => box(type, Buffer.alloc(4), ...p);
    const heif = (brand: string) => Buffer.concat([
      box("ftyp", Buffer.from(brand, "latin1"), Buffer.alloc(4), Buffer.from("mif1heic", "latin1")),
      full("meta", box("iprp", box("ipco", full("ispe", be32(160), be32(120)), full("ispe", be32(4032), be32(3024)), full("pixi", Buffer.from([3, 8, 8, 8])), box("irot", Buffer.from([1])), box("colr", Buffer.from("nclx\0\0\0\0\0\0\0\0\0", "latin1"))))),
      box("mdat", Buffer.alloc(32)),
    ]);
    for (const brand of ["heic", "avif"]) {
      const a = await analyze(heif(brand));
      expect([a.kind, a.width, a.height]).toEqual(["heif", 4032, 3024]);
      const r = rowsOf(a);
      expect(r["Brand"]).toBe(brand);
      expect(r["Pictures inside"]).toContain("2");
      expect(r["Bit depth"]).toBe("8 bits per channel, 3 channels");
      expect(r["Rotation stored"]).toBe("90° turn");
    }
    expect((await analyze(heif("heic").subarray(0, 40))).partial).toBe(true);
  });

  test("aspect ratios", () => {
    expect(aspectText(1920, 1080)).toBe("16:9");
    expect(aspectText(1, 1)).toBe("1:1");
    expect(aspectText(1001, 997)).toBe("1:1");
    expect(aspectText(0, 5)).toBe("");
  });
});

describe("SVG", () => {
  test("size, viewBox and element count", () => {
    const s = parseSvg(SVG_PLAIN)!;
    expect(s).toMatchObject({ width: "120mm", height: "80", viewBox: "0 0 300 200", elements: 4, title: "A & B", scripts: 0 });
    expect(s.pixelWidth).toBeCloseTo(453.54, 1);
    expect(s.pixelHeight).toBe(80);
  });

  test("a billion-laughs document is never expanded, and its script and links are reported, not run", async () => {
    const start = Date.now();
    const s = parseSvg(SVG_NASTY)!;
    expect(Date.now() - start).toBeLessThan(200);
    expect(s).toMatchObject({ hasDoctype: true, entities: 6, scripts: 1, eventAttributes: 1, externalRefs: 1, foreignObjects: 1 });
    const a = await analyze(Buffer.from(SVG_NASTY), "svg");
    const safety = a.groups.find((g) => g.id === "svg-safety")!.rows;
    expect(safety.find((r) => r.label === "Scripts")!.flag).toBe("warn");
    expect(safety.find((r) => r.label === "Entity definitions")!.value).toContain("not expanded");
    expect(JSON.stringify(a.groups)).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(JSON.stringify(a.groups)).not.toContain("root:");
  });

  test("pathological markup is handled in linear time", () => {
    for (const evil of ["<svg>" + "<!--".repeat(300_000), "<svg>" + "<!DOCTYPE [".repeat(150_000), "<svg>" + "<![CDATA[".repeat(200_000), "<svg " + "a=\"".repeat(100_000), "<svg>" + "<title ".repeat(200_000)]) {
      const start = Date.now();
      parseSvg(evil);
      expect(Date.now() - start, evil.slice(0, 14)).toBeLessThan(1500);
    }
  });

  test("viewBox alone gives the size, and a file with no svg tag is not an SVG", () => {
    expect(parseSvg('<svg viewBox="0 0 24 16"></svg>')).toMatchObject({ pixelWidth: 24, pixelHeight: 16 });
    expect(parseSvg("<html></html>")).toBeNull();
  });
});

describe("XMP and ICC helpers", () => {
  test("only the five built-in entities and numeric references are decoded", () => {
    expect(decodeEntities("&lt;a&gt; &amp; &quot;x&quot; &#65;&#x42; &evil; &#1114112;")).toBe('<a> & "x" AB &evil; ');
    const x = parseXmp('<!DOCTYPE x [<!ENTITY e "boom">]><x><dc:title><rdf:Alt><rdf:li>&e;</rdf:li></rdf:Alt></dc:title></x>');
    expect(x.title).toBe("&e;");
  });

  test("a huge XMP packet of unclosed list items is read in linear time", () => {
    const start = Date.now();
    parseXmp(`<dc:subject>${"<rdf:li>".repeat(60_000)}</dc:subject>`);
    expect(Date.now() - start).toBeLessThan(500);
  });

  test("bad ICC data is ignored", () => {
    expect(parseIcc(Buffer.alloc(200))).toBeNull();
    expect(parseIcc(icc("ok"))?.description).toBe("ok");
    const cut = icc("cut").subarray(0, 140);
    expect(() => parseIcc(cut)).not.toThrow();
  });
});

describe("damaged files never throw or hang", () => {
  const samples: Array<[string, Buffer, string]> = [
    ["png", png({ before: [text("A", "b"), iccp("P", icc())], after: [chunk("eXIf", photoTiff(true))] }), "png"],
    ["jpeg", jpeg({ segments: [app1Exif(photoTiff(false)), app1Xmp("<x/>")] }), "jpg"],
    ["gif", gif(3), "gif"],
    ["webp", webpExtended(20, 20, { exif: photoTiff(true), xmp: "<x/>", animated: 2 }), "webp"],
    ["bmp", bmp(5, 5), "bmp"],
    ["ico", ico([16, 32]), "ico"],
    ["tiff", photoTiff(true), "tif"],
    ["svg", Buffer.from(SVG_NASTY), "svg"],
  ];
  for (const [name, bytes, ext] of samples) {
    test(`${name}: every cut length and random byte damage`, async () => {
      const start = Date.now();
      for (let len = 0; len < bytes.length; len += Math.max(1, Math.floor(bytes.length / 60))) await analyzeImage(bufferSource(bytes.subarray(0, len)), ext);
      let seed = 99;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
      for (let i = 0; i < 80; i++) {
        const b = Buffer.from(bytes);
        for (let k = 0; k < 4; k++) b[rnd() % b.length] = rnd() & 255;
        await analyzeImage(bufferSource(b), ext);
      }
      expect(Date.now() - start).toBeLessThan(8000);
    });
  }

  test("a PNG that claims enormous chunks and a GIF made of endless blocks end quickly", async () => {
    const liar = Buffer.concat([png().subarray(0, 8), chunk("IHDR", Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])])), Buffer.from([0x7f, 0xff, 0xff, 0xff]), Buffer.from("tEXt")]);
    const start = Date.now();
    const a = await analyze(liar);
    expect(a.partial).toBe(true);
    const endless = Buffer.concat([gif(1).subarray(0, 25), Buffer.alloc(300_000, 0x21)]);
    await analyzeImage(bufferSource(endless), "gif");
    expect(Date.now() - start).toBeLessThan(3000);
  });

  test("things that are not pictures are not pictures", async () => {
    expect(await analyzeImage(bufferSource(Buffer.from("just some words")), "txt")).toBeNull();
    expect(await analyzeImage(bufferSource(Buffer.alloc(0)), "png")).toBeNull();
  });
});

describe("the strippers", () => {
  const richJpeg = () => jpeg({ segments: [app1Exif(photoTiff(false)), app1Xmp("<x:xmpmeta/>"), segment(0xed, Buffer.from("Photoshop 3.0\0", "latin1")), segment(0xe2, Buffer.from("MPF\0zzzz", "latin1")), com("secret"), segment(0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1"))], trailing: Buffer.from("EXTRA-HIDDEN-DATA") });

  test("JPEG: picture data identical, EXIF/GPS/XMP/comments gone, ICC, JFIF and Adobe kept", async () => {
    const original = richJpeg();
    const out = stripJpeg(original);
    const sos = original.indexOf(Buffer.from([0xff, 0xda]));
    const outSos = out.bytes.indexOf(Buffer.from([0xff, 0xda]));
    expect(out.bytes.subarray(outSos, outSos + 14 + SCAN_DATA.length)).toEqual(original.subarray(sos, sos + 14 + SCAN_DATA.length));
    expect(out.bytes.subarray(outSos).subarray(0, -2).includes(SCAN_DATA)).toBe(true);
    expect(out.bytes.at(-2)).toBe(0xff);
    expect(out.bytes.at(-1)).toBe(0xd9);
    expect(out.trailingBytes).toBe("EXTRA-HIDDEN-DATA".length);
    expect(out.removed).toEqual(expect.arrayContaining(["EXIF (camera, date, location)", "GPS location", "hidden thumbnail", "XMP", "Photoshop / IPTC", "comments", "multi-picture data"]));
    const a = await analyze(out.bytes);
    expect(a.exif).toBeNull();
    expect(a.xmp).toBeNull();
    expect(a.hasIptc).toBe(false);
    expect(rowsOf(a)["Comment"]).toBeUndefined();
    expect(rowsOf(a)["Color handling"]).toBe("Adobe (YCbCr)");
    expect(rowsOf(a)["JFIF version"]).toBe("1.01");
    expect([a.width, a.height]).toEqual([64, 48]);
    expect(out.bytes.includes(Buffer.from("EXTRA-HIDDEN"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("secret"))).toBe(false);
  });

  test("JPEG: keeping the orientation leaves only that one note", async () => {
    const out = stripJpeg(richJpeg(), true);
    const a = await analyze(out.bytes);
    expect(a.exif!.tags.map((t) => t.name)).toEqual(["Orientation"]);
    expect(a.exif!.tags[0]!.value).toBe(6);
    expect(gpsOf(a.exif!)).toBeNull();
    expect(out.bytes.includes(Buffer.from("Canon"))).toBe(false);
    // a picture that is already upright gets no EXIF at all
    const upright = stripJpeg(jpeg({ segments: [app1Exif(tiff({ ifd0: [short(0x112, 1)] }))] }), true);
    expect((await analyze(upright.bytes)).exif).toBeNull();
  });

  test("JPEG: a progressive file with several scans keeps them all", () => {
    const base = jpeg({ progressive: true });
    const sosAt = base.indexOf(Buffer.from([0xff, 0xda]));
    const second = Buffer.concat([segment(0xda, Buffer.from([1, 1, 0x00, 1, 5, 0x00])), Buffer.from([0x77, 0x88, 0xff, 0x00, 0x99])]);
    const multi = Buffer.concat([base.subarray(0, base.length - 2), second, Buffer.from([0xff, 0xd9])]);
    const out = stripJpeg(multi);
    expect(out.bytes.subarray(out.bytes.indexOf(Buffer.from([0xff, 0xda])))).toEqual(multi.subarray(sosAt));
    expect(out.trailingBytes).toBe(0);
  });

  test("JPEG: damaged input is refused, not half-copied", () => {
    expect(() => stripJpeg(Buffer.from("nope"))).toThrow();
    expect(() => stripJpeg(jpeg().subarray(0, 30))).toThrow();
    expect(() => stripJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0]))).toThrow();
  });

  test("PNG: pixel data identical; text, time and EXIF gone; color chunks kept", async () => {
    const original = png({ before: [phys(2835), iccp("P", icc("keep me")), chunk("gAMA", Buffer.from([0, 1, 0x86, 0xa0])), text("Author", "Jane"), ztxt("Comment", "x"), itxt("Title", "t"), chunk("tIME", Buffer.from([0x07, 0xe8, 5, 1, 1, 1, 1])), chunk("prVt", Buffer.from("private")), chunk("tRNS", Buffer.from([0, 0]))], after: [chunk("eXIf", photoTiff(true))], trailing: Buffer.from("TRAILING-SECRET") });
    const out = stripPng(original);
    const idat = (b: Buffer) => { const at = b.indexOf("IDAT"); return b.subarray(at - 4, at + 8 + b.readUInt32BE(at - 4)); };
    expect(idat(out.bytes)).toEqual(idat(original));
    const a = await analyze(out.bytes);
    expect(a.exif).toBeNull();
    expect(a.groups.find((g) => g.id === "png-text")).toBeUndefined();
    expect(a.icc?.description).toBe("keep me");
    expect(rowsOf(a)["Pixel density"]).toContain("72 × 72");
    expect(rowsOf(a)["Gamma"]).toBe("1");
    expect(out.bytes.includes(Buffer.from("TRAILING"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("private"))).toBe(false);
    expect(out.removed).toEqual(expect.arrayContaining(["text notes", "last-changed time", "EXIF (camera, date, location)", "GPS location", "other notes (prVt)", "extra data stored after the picture"]));
    expect(out.bytes.at(-12)).toBe(0);
    expect(out.bytes.subarray(-8, -4).toString()).toBe("IEND");
  });

  test("PNG: orientation can be kept, and a cut-short file is refused", async () => {
    const out = stripPng(png({ after: [chunk("eXIf", photoTiff(false))] }), true);
    const a = await analyze(out.bytes);
    expect(a.exif!.tags.map((t) => t.name)).toEqual(["Orientation"]);
    expect(() => stripPng(png().subarray(0, 40))).toThrow();
  });

  test("WebP: EXIF and XMP chunks removed, the flags cleared, the RIFF size fixed", async () => {
    const original = webpExtended(100, 50, { exif: photoTiff(false), xmp: "<x:xmpmeta/>", alpha: true });
    const out = stripWebp(original);
    expect(out.bytes.readUInt32LE(4)).toBe(out.bytes.length - 8);
    const a = await analyze(out.bytes);
    expect(a.exif).toBeNull();
    expect(a.xmp).toBeNull();
    expect(rowsOf(a)["Contains"]).toBe("transparency");
    expect([a.width, a.height]).toEqual([100, 50]);
  });

  test("files: a copy named “(no metadata)” is made next to the original, which is never touched, and nothing is overwritten", async () => {
    const dir = join(root.dir, "strip");
    require("fs").mkdirSync(dir, { recursive: true });
    const file = join(dir, "holiday.jpg");
    writeFileSync(file, richJpeg());
    const before = sha(readFileSync(file));
    const first = await stripFile(ctx, file);
    expect(first.name).toBe("holiday (no metadata).jpg");
    const second = await stripFile(ctx, file);
    expect(second.name).toBe("holiday (no metadata) (2).jpg");
    expect(sha(readFileSync(file))).toBe(before);
    expect(readdirSync(dir).sort()).toEqual(["holiday (no metadata) (2).jpg", "holiday (no metadata).jpg", "holiday.jpg"]);
    expect((await analyze(readFileSync(first.path))).exif).toBeNull();
    expect(first.bytesAfter).toBeLessThan(first.bytesBefore);
    // an existing file in the way is not replaced
    writeFileSync(join(dir, "pic (no metadata).png"), "mine");
    writeFileSync(join(dir, "pic.png"), png({ before: [text("a", "b")] }));
    const third = await stripFile(ctx, join(dir, "pic.png"));
    expect(third.name).toBe("pic (no metadata) (2).png");
    expect(readFileSync(join(dir, "pic (no metadata).png"), "utf8")).toBe("mine");
    await expect(stripFile(ctx, join(dir, "holiday (no metadata).jpg").replace("holiday", "gone"))).rejects.toThrow();
  });

  test("files: other kinds and links are refused with a clear message", async () => {
    const dir = join(root.dir, "strip2");
    require("fs").mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.gif"), gif(1));
    await expect(stripFile(ctx, join(dir, "a.gif"))).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    require("fs").symlinkSync(join(dir, "a.gif"), join(dir, "link.gif"));
    await expect(stripFile(ctx, join(dir, "link.gif"))).rejects.toMatchObject({ code: "IS_LINK" });
  });
});

describe("the picture report", () => {
  test("imageInfo gathers the groups, the privacy list and the photo strip", async () => {
    const dir = join(root.dir, "report");
    require("fs").mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "p.jpg"), jpeg({ w: 4000, h: 3000, segments: [app1Exif(photoTiff(true))] }));
    const r = await imageInfo(ctx, join(dir, "p.jpg"));
    expect(r.groups.map((g) => g.id)).toEqual(expect.arrayContaining(["image", "camera", "location", "jpeg-structure"]));
    expect(r.gps).toMatchObject({ lat: 48.858222 });
    expect(r.photo).toMatchObject({ size: "4000 × 3000", camera: "Canon EOS R5", iso: "ISO 400" });
    expect(r.canStrip).toBe(true);
    expect(r.privacy.find((p) => p.id === "gps")!.present).toBe(true);
    writeFileSync(join(dir, "plain.png"), png());
    const plain = await imageInfo(ctx, join(dir, "plain.png"));
    expect(plain.gps).toBeNull();
    expect(plain.photo).toBeNull();
    expect(plain.privacy.every((p) => !p.present)).toBe(true);
    await expect(imageInfo(ctx, join(dir, "plain.png") + ".missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    writeFileSync(join(dir, "words.png"), "not really a picture");
    await expect(imageInfo(ctx, join(dir, "words.png"))).rejects.toMatchObject({ code: "NOT_AN_IMAGE" });
  });
});

describe("ExifTool (optional)", () => {
  test("its JSON is grouped by where each tag lives, with long values cut and noise left out", () => {
    const g = groupExiftoolJson([{ SourceFile: "/x.jpg", "ExifTool:ExifToolVersion": 13, "IFD0:Make": "Canon", "IFD0:Model": "R5", "ExifIFD:ISO": 400, "GPS:GPSLatitude": "48 deg", "System:FileName": "x.jpg", "XMP-dc:Subject": ["a", "b"], "Composite:Nested": { a: 1 }, "IFD0:Empty": "", "Weird": "no group", "IFD0:Long": "x".repeat(5000) }]);
    expect(g.groups.map((x) => x.title)).toEqual(["Composite", "ExifIFD", "GPS", "IFD0", "Other", "XMP-dc", "System"]);
    const ifd0 = g.groups.find((x) => x.title === "IFD0")!;
    expect(ifd0.rows.map((r) => r.label)).toEqual(["Make", "Model", "Long"]);
    expect(ifd0.rows[2]!.value.length).toBe(2000);
    expect(g.groups.find((x) => x.title === "XMP-dc")!.rows[0]!.value).toBe("a, b");
    expect(g.groups.find((x) => x.title === "Composite")!.rows[0]!.value).toBe('{"a":1}');
    expect(g.groups.find((x) => x.title === "GPS")!.hint).toContain("taken");
    expect(g.tags).toBe(9);
    expect(groupExiftoolJson(null).groups).toEqual([]);
    expect(groupExiftoolJson([{ a: 1 }]).groups[0]!.title).toBe("Other");
    const many = groupExiftoolJson([Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`G${i % 7}:T${i}`, i]))]);
    expect(many.tags).toBe(2000);
    expect(many.truncated).toBe(true);
  });

  test("without the helper program there is a friendly hint and nothing breaks", async () => {
    const dir = join(root.dir, "exif");
    require("fs").mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "p.jpg"), jpeg());
    for (const [platform, hint] of [["darwin", "brew install exiftool"], ["linux", "libimage-exiftool-perl"], ["win32", "winget install OliverBetz.ExifTool"]] as const) {
      if (platform === "win32") continue; // the path rules of Windows need a Windows path
      const bare = createContext({ platform, home: root.dir, dataDir: join(root.dir, "d"), toolDirs: [] });
      const r = await exiftoolInfo(bare, join(dir, "p.jpg"));
      expect(r.available).toBe(false);
      expect(r.hint).toContain(hint);
      expect(r.groups).toEqual([]);
    }
  });

  test.skipIf(!exiftool)("the real program's tags are listed, for a file whose name starts with a dash too", async () => {
    const dir = join(root.dir, "exif2");
    require("fs").mkdirSync(dir, { recursive: true });
    const p = join(dir, "-dash.jpg");
    writeFileSync(p, jpeg({ segments: [app1Exif(photoTiff(false))] }));
    const r = await exiftoolInfo(ctx, p);
    expect(r.available).toBe(true);
    const all = Object.fromEntries(r.groups.flatMap((g) => g.rows.map((x) => [`${g.title}/${x.label}`, x.value])));
    expect(all["IFD0/Make"]).toBe("Canon");
    expect(all["IFD0/Model"]).toBe("Canon EOS R5");
    expect(all["ExifIFD/ISO"]).toBe("400");
    expect(Object.keys(all).some((k) => k.startsWith("GPS/"))).toBe(true);
    expect(r.groups.map((g) => g.title)).toEqual(expect.arrayContaining(["IFD0", "ExifIFD", "GPS", "File", "System"]));
    // the picture is not changed, and no stray files are made
    expect(readdirSync(dir)).toEqual(["-dash.jpg"]);
    // a name ending in "|" is never handed over (ExifTool would treat it as a command)
    const pipe = join(dir, "evil.jpg|");
    writeFileSync(pipe, jpeg());
    const refused = await exiftoolInfo(ctx, pipe);
    expect(refused.groups).toEqual([]);
    expect(refused.hint).toContain("not asked");
    // an empty file gives nothing, quickly
    writeFileSync(join(dir, "empty.jpg"), "");
    expect((await exiftoolInfo(ctx, join(dir, "empty.jpg"))).groups).toEqual([]);
    await expect(exiftoolInfo(ctx, dir)).rejects.toMatchObject({ code: "NOT_A_FILE" });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Against real programs, when they are installed
// ---------------------------------------------------------------------------------------------------------------
const magick = tool("magick");
const identify = tool("identify");
const real = join(root.dir, "real");

async function run(argv: string[]): Promise<string> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out;
}

describe.skipIf(!magick)("real pictures made by ImageMagick", () => {
  beforeAll(async () => {
    require("fs").mkdirSync(real, { recursive: true });
    for (const name of ["a.png", "b.jpg", "c.gif", "d.bmp", "e.tif", "f.webp", "g.ico"]) {
      const size = name === "g.ico" ? "32x32" : "97x61";
      await run([magick!, "-size", size, "gradient:orange-purple", ...(name === "b.jpg" ? ["-quality", "72"] : []), join(real, name)]);
    }
    await run([magick!, "-size", "40x30", "-delay", "7", "xc:red", "xc:blue", "-loop", "2", join(real, "anim.gif")]);
  });

  test("the sizes match what ImageMagick says", async () => {
    for (const name of ["a.png", "b.jpg", "c.gif", "d.bmp", "e.tif", "f.webp"]) {
      if (!existsSync(join(real, name))) continue;
      const a = await analyze(readFileSync(join(real, name)), name.split(".")[1]);
      expect([name, a.width, a.height]).toEqual([name, 97, 61]);
    }
    if (existsSync(join(real, "g.ico"))) expect((await analyze(readFileSync(join(real, "g.ico")), "ico")).width).toBe(32);
  });

  test.skipIf(!exiftool)("HEIC and AVIF files made by ImageMagick agree with exiftool on the size", async () => {
    for (const ext of ["avif", "heic"]) {
      const path = join(real, `h.${ext}`);
      await run([magick!, "-size", "90x50", "gradient:red-blue", path]);
      if (!existsSync(path)) continue;
      const [j] = JSON.parse(await run([exiftool!, "-json", "-n", path]));
      const a = await analyze(readFileSync(path), ext);
      expect([ext, a.kind, a.width, a.height]).toEqual([ext, "heif", j.ImageWidth, j.ImageHeight]);
    }
  });

  test("the JPEG quality estimate is close to ImageMagick's own", async () => {
    const q = Number((await run([identify!, "-format", "%Q", join(real, "b.jpg")])).trim());
    const mine = (await parseJpeg(bufferSource(readFileSync(join(real, "b.jpg"))))).quality!;
    expect(q).toBe(72);
    expect(Math.abs(mine - q)).toBeLessThanOrEqual(2);
  });

  test("an animated GIF made by ImageMagick has the right frame count and loop", async () => {
    const r = rowsOf(await analyze(readFileSync(join(real, "anim.gif")), "gif"));
    expect(r["Frames"]).toBe("2");
    expect(r["Animation length"]).toBe("0.14 s");
    if (exiftool) {
      const [j] = JSON.parse(await run([exiftool, "-json", "-n", join(real, "anim.gif")]));
      expect(r["Loops"]).toBe(j.AnimationIterations === 0 ? "Forever" : `${j.AnimationIterations} time${j.AnimationIterations === 1 ? "" : "s"}`);
      expect(Number(r["Frames"])).toBe(j.FrameCount);
    }
  });

  test.skipIf(!exiftool)("the same pictures agree with exiftool on size and format details", async () => {
    for (const name of ["a.png", "b.jpg", "c.gif", "d.bmp", "e.tif", "f.webp"]) {
      if (!existsSync(join(real, name))) continue;
      const [j] = JSON.parse(await run([exiftool!, "-json", "-n", "--", join(real, name)]));
      const a = await analyze(readFileSync(join(real, name)), name.split(".")[1]);
      expect([name, a.width, a.height]).toEqual([name, j.ImageWidth, j.ImageHeight]);
    }
    const [png2] = JSON.parse(await run([exiftool!, "-json", "-n", join(real, "a.png")]));
    const a = rowsOf(await analyze(readFileSync(join(real, "a.png")), "png"));
    expect(a["Bit depth"]).toBe(`${png2.BitDepth} bits per channel`);
  });

  test.skipIf(!exiftool)("camera and GPS tags written by exiftool are read back the same, in both byte orders", async () => {
    for (const [file, order] of [["jbig.jpg", "MM"], ["jlittle.jpg", "II"]] as const) {
      const path = join(real, file);
      copyFileSync(join(real, "b.jpg"), path);
      await run([exiftool!, "-overwrite_original", "-n", `-ExifByteOrder=${order}`, "-Make=Nikon", "-Model=D850", "-LensModel=24-70mm f/2.8", "-ISO=640", "-FNumber=4", "-ExposureTime=0.01", "-FocalLength=35", "-DateTimeOriginal=2023:12:25 08:09:10", "-GPSLatitude=33.8688", "-GPSLatitudeRef=S", "-GPSLongitude=151.2093", "-GPSLongitudeRef=E", "-GPSAltitude=12", "-Artist=Test Person", path]);
      const a = await analyze(readFileSync(path), "jpg");
      const [j] = JSON.parse(await run([exiftool!, "-json", "-n", "-GPSLatitude", "-GPSLongitude", "-GPSAltitude", "-ISO", "-FNumber", "-ExposureTime", "-FocalLength", "-Make", "-Model", "-Artist", "--", path]));
      expect(a.exif!.littleEndian).toBe(order === "II");
      const gps = gpsOf(a.exif!)!;
      expect(gps.lat).toBeCloseTo(j.GPSLatitude, 4);
      expect(gps.lon).toBeCloseTo(j.GPSLongitude, 4);
      expect(gps.altitude).toBeCloseTo(j.GPSAltitude, 1);
      const get = (n: string) => a.exif!.tags.find((t) => t.name === n)?.value;
      expect(get("Make")).toBe(j.Make);
      expect(get("Model")).toBe(j.Model);
      expect(get("Artist")).toBe(j.Artist);
      expect(get("ISOSpeedRatings")).toBe(j.ISO);
      expect(get("FNumber") as number).toBeCloseTo(j.FNumber, 3);
      expect(get("ExposureTime") as number).toBeCloseTo(j.ExposureTime, 4);
      expect(get("FocalLength") as number).toBeCloseTo(j.FocalLength, 3);
    }
  });

  test.skipIf(!exiftool || !identify)("stripping a real JPEG: still opens, EXIF and GPS are gone, the original is untouched", async () => {
    const path = join(real, "photo.jpg");
    copyFileSync(join(real, "b.jpg"), path);
    await run([exiftool!, "-overwrite_original", "-GPSLatitude=10", "-GPSLatitudeRef=N", "-GPSLongitude=20", "-GPSLongitudeRef=E", "-Make=Leica", "-Comment=top secret", "-XMP:Creator=Someone", path]);
    const before = sha(readFileSync(path));
    expect(JSON.parse(await run([exiftool!, "-json", "-GPSLatitude", path]))[0].GPSLatitude).toBeDefined();
    const done = await stripFile(ctx, path);
    expect(sha(readFileSync(path))).toBe(before);
    const [j] = JSON.parse(await run([exiftool!, "-json", "-a", "-G1", done.path]));
    for (const key of Object.keys(j)) expect(key, key).not.toMatch(/^(GPS|IFD0:Make|XMP|Photoshop|IPTC|ExifIFD)/);
    expect(JSON.stringify(j)).not.toContain("top secret");
    const [wh] = (await run([identify!, "-format", "%w %h\n", done.path])).trim().split("\n");
    expect(wh).toBe("97 61");
    // the pixels are the same
    const a = await run([magick!, path, "-depth", "8", "rgb:-"]);
    const b = await run([magick!, done.path, "-depth", "8", "rgb:-"]);
    expect(createHash("sha256").update(a).digest("hex")).toBe(createHash("sha256").update(b).digest("hex"));
  });

  test("a real PNG stripped is still a valid image for ImageMagick", async () => {
    if (!identify) return;
    const path = join(real, "t.png");
    copyFileSync(join(real, "a.png"), path);
    writeFileSync(path, png({ w: 9, h: 7, before: [text("Author", "x"), chunk("tIME", Buffer.from([0x07, 0xe8, 1, 1, 1, 1, 1]))] }));
    const out = await stripFile(ctx, path);
    expect((await run([identify, "-format", "%w x %h", out.path])).trim()).toBe("9 x 7");
    expect(statSync(out.path).size).toBeLessThan(statSync(path).size);
  });
});
