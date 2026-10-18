/**
 * Quick Look (Space): what the server says about a file's preview, how sound and video are streamed (Range requests),
 * what it refuses and the macOS document pictures. (The page itself is tested in file_manager_views.test.ts, which owns
 * the shared page harness.)
 * Everything happens in temporary folders.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { previewFile } from "../src/features/filemanager/fmList";
import { fileResponse, mediaKindOf, parseRange, thumbnailsAvailable, wantsThumbnail } from "../src/features/filemanager/fmQuickLook";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { parseTable } from "../resources/file_manager/ui/quicklookTable.js";

const root = mkdtempSync(join(tmpdir(), "fm-quicklook-test-"));
const home = join(root, "home");
const work = join(home, "work");
const dataDir = join(root, "data");
mkdirSync(work, { recursive: true });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SOUND = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

writeFileSync(join(work, "a-picture.png"), PNG);
writeFileSync(join(work, "b-song.mp3"), SOUND);
writeFileSync(join(work, "c-movie.mp4"), SOUND);
writeFileSync(join(work, "d-people.csv"), 'name,city\nAda,"London, UK"\n"Sam ""the man""",Austin\n');
writeFileSync(join(work, "e-notes.txt"), "line one\nline two\n");
writeFileSync(join(work, "f-blob.bin"), Buffer.from([0, 1, 2, 3, 0, 0, 255, 254]));
mkdirSync(join(work, "g-folder"));
writeFileSync(join(work, "g-folder", "inside.txt"), "x");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("what the server says to preview", () => {
  const ctx = createContext({ home, dataDir });
  test("pictures, sound, video and text each get their own kind; unknown binary stays binary", async () => {
    expect(await previewFile(ctx, join(work, "a-picture.png"))).toMatchObject({ type: "image" });
    expect(await previewFile(ctx, join(work, "b-song.mp3"))).toMatchObject({ type: "audio" });
    expect(await previewFile(ctx, join(work, "c-movie.mp4"))).toMatchObject({ type: "video" });
    expect(await previewFile(ctx, join(work, "e-notes.txt"))).toMatchObject({ type: "text", text: "line one\nline two\n" });
    expect(await previewFile(ctx, join(work, "d-people.csv"))).toMatchObject({ type: "text" });
    expect(await previewFile(ctx, join(work, "f-blob.bin"))).toMatchObject({ type: "binary" });
    expect(await previewFile(ctx, join(work, "g-folder"))).toMatchObject({ type: "none" });
  });
  test("kinds are decided by the extension, case-insensitively", () => {
    expect(mediaKindOf("SONG.MP3")).toBe("audio");
    expect(mediaKindOf("clip.MoV")).toBe("video");
    expect(mediaKindOf("notes.txt")).toBeNull();
    expect(wantsThumbnail("Report.DOCX")).toBe(true);
    expect(wantsThumbnail("a.txt")).toBe(false);
  });
  test("document pictures are only offered where the system can make them", async () => {
    writeFileSync(join(work, "doc.pdf"), "%PDF-1.1\n");
    const kind = ((await previewFile(ctx, join(work, "doc.pdf"))) as any).type;
    if (thumbnailsAvailable(ctx)) expect(kind).toBe("thumb");
    else expect(kind).not.toBe("thumb");
    const linux = createContext({ home, dataDir, platform: "linux" });
    expect(thumbnailsAvailable(linux)).toBe(false);
    expect(thumbnailsAvailable(createContext({ home, dataDir, toolDirs: [work] }))).toBe(false);
  });
});

describe("byte ranges", () => {
  test("parses single ranges and refuses the rest", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-5000", 100)).toEqual({ start: 50, end: 99 });
    for (const bad of ["bytes=100-", "bytes=9-3", "bytes=-", "bytes=-0", "items=0-1", "bytes=a-b", "bytes=0-1,5-6"]) expect(parseRange(bad, 100), bad).toBe("bad");
  });
  test("fileResponse answers 200, 206 and 416 with the right headers and bytes", async () => {
    const file = join(work, "b-song.mp3");
    const get = (range?: string) => fileResponse(new Request("http://x/", { headers: range ? { range } : {} }), file, SOUND.length, { "Content-Type": "audio/mpeg" });
    const whole = get();
    expect([whole.status, whole.headers.get("accept-ranges"), whole.headers.get("content-length")]).toEqual([200, "bytes", "1000"]);
    const part = get("bytes=10-19");
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 10-19/1000");
    expect(Buffer.from(await part.arrayBuffer()).equals(SOUND.subarray(10, 20))).toBe(true);
    const bad = get("bytes=5000-");
    expect([bad.status, bad.headers.get("content-range")]).toEqual([416, "bytes */1000"]);
  });
});

describe("/api/raw for Quick Look", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  let base = "";
  beforeAll(() => {
    server = startFileManagerServer({ port: 0, token: "ql-token", context: { home, dataDir: join(root, "data2") } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));
  const raw = (path: string, extra = "", init: RequestInit = {}, token = "ql-token") => fetch(`${base}/api/raw?path=${encodeURIComponent(path)}&token=${token}${extra}`, init);

  test("the player can read local lyrics with Windows paths, mixed-case endings and CRLF text", async () => {
    const lyrics = "\uFEFF[00:01.00]First line\r\n[00:02.00]Second line\r\n";
    for (const name of ["b-song.LRC", "b-song.en.txt"]) {
      const file = join(work, name);
      writeFileSync(file, lyrics);
      expect((await raw(file)).status).toBe(415);
      const response = await raw(file, "&lyrics=1");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("content-security-policy")).toContain("sandbox");
      expect(await response.text()).toBe(lyrics.slice(1));
      expect((await raw(file, "&lyrics=1", {}, "wrong-token")).status).toBe(401);
    }
    const large = join(work, "large.lrc");
    writeFileSync(large, "x".repeat(256 * 1024 + 1));
    expect((await raw(large, "&lyrics=1")).status).toBe(413);
    expect((await raw(join(work, "f-blob.bin"), "&lyrics=1")).status).toBe(415);
  });

  test("streams sound and video, with ranges, the right type and a sandbox policy", async () => {
    const whole = await raw(join(work, "b-song.mp3"));
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("audio/mpeg");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(whole.headers.get("content-security-policy")).toContain("sandbox");
    expect(whole.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await whole.arrayBuffer()).equals(SOUND)).toBe(true);
    const part = await raw(join(work, "c-movie.mp4"), "", { headers: { Range: "bytes=100-199" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-type")).toBe("video/mp4");
    expect(part.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(Buffer.from(await part.arrayBuffer()).equals(SOUND.subarray(100, 200))).toBe(true);
    expect((await raw(join(work, "c-movie.mp4"), "", { headers: { Range: "bytes=9999-" } })).status).toBe(416);
  });

  test("needs the token, and refuses anything a preview can't show before touching the disk", async () => {
    expect((await raw(join(work, "b-song.mp3"), "", {}, "wrong")).status).toBe(401);
    expect((await fetch(`${base}/api/raw?path=${encodeURIComponent(join(work, "b-song.mp3"))}`)).status).toBe(401);
    for (const name of ["e-notes.txt", "f-blob.bin", "d-people.csv"]) expect((await raw(join(work, name))).status, name).toBe(415);
    expect((await raw(join(home, "..", "..", "etc", "passwd"))).status).toBe(415);
    mkdirSync(join(work, "folder.mp3"), { recursive: true });
    expect((await raw(join(work, "folder.mp3"))).status).toBe(400);
    expect((await raw("relative.mp3")).status).toBe(400);
  });

  test("document pictures: 404 where they can't be made, a real PNG on a Mac, and never for a text file", async () => {
    expect((await raw(join(work, "e-notes.txt"), "&thumb=1")).status).toBe(404);
    if (!thumbnailsAvailable(createContext({ home, dataDir }))) {
      writeFileSync(join(work, "x.pdf"), "%PDF-1.1\n");
      expect((await raw(join(work, "x.pdf"), "&thumb=1")).status).toBe(404);
      return;
    }
    const make = Bun.spawnSync(["textutil", "-convert", "docx", "-stdin", "-output", join(work, "memo.docx")], { stdin: new TextEncoder().encode("Hello Quick Look") });
    if (make.exitCode !== 0) return;
    const first = await raw(join(work, "memo.docx"), "&thumb=1");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await first.arrayBuffer());
    expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    const again = Buffer.from(await (await raw(join(work, "memo.docx"), "&thumb=1")).arrayBuffer());
    expect(again.equals(bytes)).toBe(true);
  }, 30_000);

  test("converts non-browser image formats (PPM, TGA, TIFF, PSD, QOI, XBM) and &convert=1 requests to a temporary PNG", async () => {
    const ctx = createContext({ home, dataDir });
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // 1. Netpbm PPM
    const ppmPath = join(work, "sample.ppm");
    writeFileSync(ppmPath, "P3\n2 2\n255\n255 0 0  0 255 0\n0 0 255  255 255 255\n");

    // 2. Truevision TGA (1x1 24-bit uncompressed)
    const tgaPath = join(work, "sample.tga");
    const tgaBuf = Buffer.alloc(18 + 3);
    tgaBuf[2] = 2; // uncompressed true-color
    tgaBuf.writeUInt16LE(1, 12); // width = 1
    tgaBuf.writeUInt16LE(1, 14); // height = 1
    tgaBuf[16] = 24; // 24 bpp
    tgaBuf[18] = 0x11; tgaBuf[19] = 0x22; tgaBuf[20] = 0x33;
    writeFileSync(tgaPath, tgaBuf);

    // 3. TIFF (1x1 uncompressed RGB little-endian)
    const tiffPath = join(work, "sample.tiff");
    const tiffBuf = Buffer.alloc(128);
    tiffBuf.write("II", 0, "ascii");
    tiffBuf.writeUInt16LE(42, 2);
    tiffBuf.writeUInt32LE(8, 4); // IFD offset
    tiffBuf.writeUInt16LE(7, 8); // 7 entries
    const writeTag = (idx: number, tag: number, type: number, count: number, val: number) => {
      const off = 10 + idx * 12;
      tiffBuf.writeUInt16LE(tag, off);
      tiffBuf.writeUInt16LE(type, off + 2);
      tiffBuf.writeUInt32LE(count, off + 4);
      if (type === 3 && count === 1) tiffBuf.writeUInt16LE(val, off + 8);
      else tiffBuf.writeUInt32LE(val, off + 8);
    };
    writeTag(0, 256, 4, 1, 1); // ImageWidth = 1
    writeTag(1, 257, 4, 1, 1); // ImageLength = 1
    writeTag(2, 258, 3, 3, 100); // BitsPerSample -> offset 100
    writeTag(3, 259, 3, 1, 1); // Compression = 1 (none)
    writeTag(4, 262, 3, 1, 2); // Photometric = 2 (RGB)
    writeTag(5, 273, 4, 1, 110); // StripOffsets = 110
    writeTag(6, 277, 3, 1, 3); // SamplesPerPixel = 3
    tiffBuf.writeUInt16LE(8, 100); tiffBuf.writeUInt16LE(8, 102); tiffBuf.writeUInt16LE(8, 104);
    tiffBuf[110] = 200; tiffBuf[111] = 100; tiffBuf[112] = 50;
    writeFileSync(tiffPath, tiffBuf);

    // 4. Adobe PSD (1x1 3-channel 8-bit raw composite)
    const psdPath = join(work, "sample.psd");
    const psdBuf = Buffer.alloc(26 + 4 + 4 + 4 + 2 + 3);
    psdBuf.write("8BPS", 0, "ascii");
    psdBuf.writeUInt16BE(1, 4); // version 1
    psdBuf.writeUInt16BE(3, 12); // 3 channels
    psdBuf.writeUInt32BE(1, 14); // height = 1
    psdBuf.writeUInt32BE(1, 18); // width = 1
    psdBuf.writeUInt16BE(8, 22); // depth = 8
    psdBuf.writeUInt16BE(3, 24); // mode = RGB (3)
    // Color mode data len (0) at 26, image resources len (0) at 30, layer info len (0) at 34
    psdBuf.writeUInt16BE(0, 38); // compression = 0 (raw)
    psdBuf[40] = 255; psdBuf[41] = 128; psdBuf[42] = 64;
    writeFileSync(psdPath, psdBuf);

    // 5. QOI (1x1)
    const qoiPath = join(work, "sample.qoi");
    const qoiBuf = Buffer.alloc(14 + 5 + 8);
    qoiBuf.write("qoif", 0, "ascii");
    qoiBuf.writeUInt32BE(1, 4); // width = 1
    qoiBuf.writeUInt32BE(1, 8); // height = 1
    qoiBuf[12] = 4; // RGBA
    qoiBuf[13] = 0; // sRGB
    qoiBuf[14] = 0xfe; qoiBuf[15] = 10; qoiBuf[16] = 20; qoiBuf[17] = 30; // QOI_OP_RGB
    qoiBuf[14 + 5 + 7] = 1; // end marker
    writeFileSync(qoiPath, qoiBuf);

    // 6. XBM (8x1 monochrome bitmap)
    const xbmPath = join(work, "sample.xbm");
    writeFileSync(xbmPath, "#define icon_width 8\n#define icon_height 1\nstatic unsigned char icon_bits[] = { 0x55 };\n");

    for (const file of [ppmPath, tgaPath, tiffPath, psdPath, qoiPath, xbmPath]) {
      expect(await previewFile(ctx, file)).toMatchObject({ type: "image" });
      const res = await raw(file);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const out = Buffer.from(await res.arrayBuffer());
      expect(out.subarray(0, 8).equals(pngMagic)).toBe(true);
    }

    // 7. Browser-native format with &convert=1 also returns converted PNG
    const bmpPath = join(work, "sample.bmp");
    const bmpBuf = Buffer.alloc(58);
    bmpBuf.write("BM", 0, "ascii");
    bmpBuf.writeUInt32LE(58, 2);
    bmpBuf.writeUInt32LE(54, 10);
    bmpBuf.writeUInt32LE(40, 14);
    bmpBuf.writeInt32LE(1, 18);
    bmpBuf.writeInt32LE(1, 22);
    bmpBuf.writeUInt16LE(1, 26);
    bmpBuf.writeUInt16LE(24, 28);
    bmpBuf[54] = 100; bmpBuf[55] = 150; bmpBuf[56] = 200;
    writeFileSync(bmpPath, bmpBuf);
    const convertedBmp = await raw(bmpPath, "&convert=1");
    expect(convertedBmp.status).toBe(200);
    expect(convertedBmp.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await convertedBmp.arrayBuffer()).subarray(0, 8).equals(pngMagic)).toBe(true);
  });
});

describe("the table reader", () => {
  test("handles quotes, commas inside quotes, doubled quotes, line endings and a missing last newline", () => {
    expect(parseTable('a,b\n1,"x, y"\n"say ""hi""",3', ",")).toEqual([["a", "b"], ["1", "x, y"], ['say "hi"', "3"]]);
    expect(parseTable("a\tb\r\n1\t2\r\n", "\t")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseTable("", ",")).toEqual([]);
    expect(parseTable("one", ",")).toEqual([["one"]]);
    expect(parseTable("a,,c", ",")).toEqual([["a", "", "c"]]);
  });
});
