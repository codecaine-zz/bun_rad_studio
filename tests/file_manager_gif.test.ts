import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import * as ui6 from "../resources/file_manager/ui/gifcore.js";
const { GifError, composeFrames, composedBytes, describeGif, durationMs, frameMs, parseGif }: any = ui6;
import { CATALOG_BY_ID } from "../src/features/filemanager/fmConvCatalog";
import { gifFromMixed } from "../src/features/filemanager/fmConvMedia";

// A small GIF writer for the tests (palette of up to 256 colors, LZW compression, optional interlacing).
interface TFrame { x?: number; y?: number; w: number; h: number; pixels: number[]; delay?: number; disposal?: number; transparent?: number; interlaced?: boolean }
function lzwEncode(indices: number[], minCode: number): number[] {
  const clear = 1 << minCode, end = clear + 1;
  const out: number[] = []; let acc = 0, bits = 0;
  const put = (code: number, size: number) => { acc |= code << bits; bits += size; while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; } };
  let size = minCode + 1, next = end + 1;
  let dict = new Map<string, number>();
  put(clear, size);
  let cur = "";
  for (const v of indices) {
    const key = cur ? `${cur},${v}` : `${v}`;
    const known = !cur ? true : cur.includes(",") ? dict.has(key) : false;
    if (!cur) { cur = `${v}`; continue; }
    if (known) { cur = key; continue; }
    put(cur.includes(",") ? dict.get(cur)! : Number(cur), size);
    dict.set(key, next++);
    if (next - 1 === (1 << size) && size < 12) size++;
    if (next >= 4096) { put(clear, size); dict = new Map(); size = minCode + 1; next = end + 1; }
    cur = `${v}`;
  }
  if (cur) put(cur.includes(",") ? dict.get(cur)! : Number(cur), size);
  put(end, size);
  if (bits > 0) out.push(acc & 255);
  return out;
}
function interlace(pixels: number[], w: number, h: number): number[] {
  const rows: number[][] = []; for (let y = 0; y < h; y++) rows.push(pixels.slice(y * w, y * w + w));
  const order: number[] = []; for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]] as Array<[number, number]>) for (let y = s; y < h; y += st) order.push(y);
  return order.flatMap((y) => rows[y]!);
}
function encodeGif(opts: { width: number; height: number; palette: number[][]; frames: TFrame[]; loop?: number; commentless?: boolean }): Uint8Array {
  const { width, height, palette, frames } = opts;
  let bitsPal = 1; while ((1 << bitsPal) < palette.length) bitsPal++;
  const full = Array.from({ length: 1 << bitsPal }, (_, i) => palette[i] ?? [0, 0, 0]);
  const b: number[] = [...Buffer.from("GIF89a"), width & 255, width >> 8, height & 255, height >> 8, 0x80 | ((bitsPal - 1) << 4) | (bitsPal - 1), 0, 0, ...full.flat()];
  if (opts.loop !== undefined) b.push(0x21, 0xff, 11, ...Buffer.from("NETSCAPE2.0"), 3, 1, opts.loop & 255, opts.loop >> 8, 0);
  for (const f of frames) {
    b.push(0x21, 0xf9, 4, ((f.disposal ?? 0) << 2) | (f.transparent !== undefined ? 1 : 0), (f.delay ?? 10) & 255, (f.delay ?? 10) >> 8, f.transparent ?? 0, 0);
    b.push(0x2c, (f.x ?? 0) & 255, (f.x ?? 0) >> 8, (f.y ?? 0) & 255, (f.y ?? 0) >> 8, f.w & 255, f.w >> 8, f.h & 255, f.h >> 8, f.interlaced ? 0x40 : 0);
    const minCode = Math.max(2, bitsPal);
    b.push(minCode);
    const data = lzwEncode(f.interlaced ? interlace(f.pixels, f.w, f.h) : f.pixels, minCode);
    for (let i = 0; i < data.length; i += 255) { const chunk = data.slice(i, i + 255); b.push(chunk.length, ...chunk); }
    b.push(0);
  }
  b.push(0x3b);
  return Uint8Array.from(b);
}
const PAL = [[0, 0, 0], [255, 0, 0], [0, 0, 255], [0, 255, 0]];
const px = (rgba: Uint8ClampedArray, w: number, x: number, y: number) => [...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe("reading a GIF", () => {
  test("frames, size, delays and the pixels come back exactly", () => {
    const a = Array.from({ length: 12 }, (_, i) => i % 4);
    const gif = parseGif(encodeGif({ width: 4, height: 3, palette: PAL, loop: 0, frames: [{ w: 4, h: 3, pixels: a, delay: 5 }, { w: 4, h: 3, pixels: a.map((v) => (v + 1) % 4), delay: 20 }] }));
    expect([gif.width, gif.height, gif.frames.length, gif.loop]).toEqual([4, 3, 2, 0]);
    expect([...gif.frames[0].pixels]).toEqual(a);
    expect([...gif.frames[1].pixels]).toEqual(a.map((v) => (v + 1) % 4));
    expect(gif.frames.map((f: any) => frameMs(f.delay))).toEqual([50, 200]);
    expect(durationMs(gif)).toBe(250);
  });
  test("a delay of 0 or 1 hundredth is shown for a tenth of a second, as browsers do", () => {
    expect(frameMs(0)).toBe(100);
    expect(frameMs(1)).toBe(100);
    expect(frameMs(2)).toBe(20);
  });
  test("big pictures with many colors survive the compression (the code size grows to 12 bits)", () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 7) & 255]);
    const pixels = Array.from({ length: 200 * 100 }, (_, i) => (rnd() < 0.5 ? Math.floor(rnd() * 256) : i % 17));
    const gif = parseGif(encodeGif({ width: 200, height: 100, palette, frames: [{ w: 200, h: 100, pixels }] }));
    expect([...gif.frames[0].pixels]).toEqual(pixels);
    expect(gif.frames[0].partial).toBe(false);
  });
  test("an interlaced picture is put back in the right row order", () => {
    const pixels = Array.from({ length: 5 * 17 }, (_, i) => Math.floor(i / 5) % 4);
    const gif = parseGif(encodeGif({ width: 5, height: 17, palette: PAL, frames: [{ w: 5, h: 17, pixels, interlaced: true }] }));
    expect([...gif.frames[0].pixels]).toEqual(pixels);
  });
  test("the repeat count: forever, once and a number", () => {
    const f = [{ w: 1, h: 1, pixels: [1] }, { w: 1, h: 1, pixels: [2] }];
    expect(describeGif(parseGif(encodeGif({ width: 1, height: 1, palette: PAL, frames: f, loop: 0 }))).loop).toBe("forever");
    expect(describeGif(parseGif(encodeGif({ width: 1, height: 1, palette: PAL, frames: f }))).loop).toBe("once");
    expect(describeGif(parseGif(encodeGif({ width: 1, height: 1, palette: PAL, frames: f, loop: 3 }))).loop).toBe("4 times");
  });
  test("facts for the viewer", () => {
    const d = describeGif(parseGif(encodeGif({ width: 2, height: 2, palette: PAL, loop: 0, frames: [{ w: 2, h: 2, pixels: [0, 1, 2, 3], delay: 10 }, { w: 2, h: 2, pixels: [3, 2, 1, 0], delay: 10, transparent: 0 }] })));
    expect(d).toMatchObject({ frames: 2, seconds: 0.2, fps: 10, animated: true, transparent: true });
    expect(describeGif(parseGif(encodeGif({ width: 1, height: 1, palette: PAL, frames: [{ w: 1, h: 1, pixels: [1] }] }))).animated).toBe(false);
  });
});

describe("putting the frames together", () => {
  test("a small frame on top of a whole one, with transparency, leaves the rest alone", () => {
    const gif = parseGif(encodeGif({ width: 4, height: 4, palette: PAL, frames: [
      { w: 4, h: 4, pixels: Array(16).fill(1) },
      { x: 1, y: 1, w: 2, h: 2, pixels: [2, 0, 0, 2], transparent: 0 },
    ] }));
    const [one, two] = composeFrames(gif);
    expect(px(one, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(two, 4, 1, 1)).toEqual([0, 0, 255, 255]);
    expect(px(two, 4, 2, 1)).toEqual([255, 0, 0, 255]); // the transparent pixel shows the frame below
    expect(px(two, 4, 0, 0)).toEqual([255, 0, 0, 255]);
  });
  test("disposal 2 clears the old frame's area, disposal 3 puts back what was there", () => {
    const base = { w: 4, h: 4, pixels: Array(16).fill(1) };
    const clearing = parseGif(encodeGif({ width: 4, height: 4, palette: PAL, frames: [{ ...base, disposal: 2 }, { x: 1, y: 1, w: 1, h: 1, pixels: [2] }] }));
    const [, afterClear] = composeFrames(clearing);
    expect(px(afterClear, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(afterClear, 4, 1, 1)).toEqual([0, 0, 255, 255]);
    const restoring = parseGif(encodeGif({ width: 4, height: 4, palette: PAL, frames: [base, { x: 1, y: 1, w: 2, h: 2, pixels: [2, 2, 2, 2], disposal: 3 }, { x: 0, y: 0, w: 1, h: 1, pixels: [3] }] }));
    const [, , third] = composeFrames(restoring);
    expect(px(third, 4, 1, 1)).toEqual([255, 0, 0, 255]); // the blue square was taken back
    expect(px(third, 4, 0, 0)).toEqual([0, 255, 0, 255]);
  });
  test("how much memory the whole animation takes is known up front", () => {
    const gif = parseGif(encodeGif({ width: 10, height: 10, palette: PAL, frames: [{ w: 10, h: 10, pixels: Array(100).fill(1) }, { w: 10, h: 10, pixels: Array(100).fill(2) }] }));
    expect(composedBytes(gif)).toBe(10 * 10 * 4 * 2);
  });
});

describe("files that aren't GIFs", () => {
  test("each problem is a sentence", () => {
    expect(() => parseGif(Uint8Array.from(Buffer.from("PNG not a gif")))).toThrow(GifError);
    expect(() => parseGif(Uint8Array.from(Buffer.from("GIF89a")))).toThrow(/size|isn't/);
    expect(() => parseGif(Uint8Array.from([...Buffer.from("GIF89a"), 1, 0, 1, 0, 0, 0, 0, 0x3b]))).toThrow(/no pictures/);
  });
  test("a cut-off file gives the frames it has, or a clear error, never a crash", () => {
    const whole = encodeGif({ width: 30, height: 30, palette: PAL, frames: [{ w: 30, h: 30, pixels: Array.from({ length: 900 }, (_, i) => i % 4) }, { w: 30, h: 30, pixels: Array.from({ length: 900 }, (_, i) => (i + 1) % 4) }] });
    for (const cut of [20, 60, 120, 200, whole.length - 3]) {
      try { const g = parseGif(whole.subarray(0, cut)); expect(g.frames.length).toBeGreaterThan(0); } catch (e) { expect(e).toBeInstanceOf(GifError); }
    }
  });
  test("too many frames is refused with a reason", () => {
    const frames = Array.from({ length: 30 }, () => ({ w: 1, h: 1, pixels: [1] }));
    expect(() => parseGif(encodeGif({ width: 1, height: 1, palette: PAL, frames }), { maxFrames: 10 })).toThrow(/more than 10 frames/);
  });
});

describe("the GIF maker and real ffmpeg output", () => {
  const FF = ["/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"].find((p) => existsSync(p));
  const dir = mkdtempSync(join(tmpdir(), "fm-gif-"));
  test("it is in the list and takes pictures and videos", () => {
    const def = CATALOG_BY_ID.get("gif-mixed")!;
    expect(def.mode).toBe("all");
    expect(def.minFiles).toBe(2);
    for (const ext of ["png", "jpg", "mp4", "mov", "webm", "gif"]) expect(def.inputs!.has(ext), ext).toBe(true);
    expect(def.inputs!.has("heic")).toBe(false);
    expect(def.options!.map((o: any) => o.id)).toEqual(["width", "shape", "fit", "background", "still", "clip", "fps", "colors", "dither", "repeat", "boomerang", "order"]);
    expect(def.checkFiles!(Array(101).fill("a.png"))).toContain("at most 100");
  });
  const opts = { width: 240, shape: "16:9", fit: "whole", background: "black", still: 1, clip: 2, fps: "10", colors: "256", dither: "smooth", repeat: "forever", boomerang: false };
  test("the command is a list of arguments, with each file as one argument, and a too-long result is refused", () => {
    const argv = gifFromMixed({ exe: "ffmpeg", inputs: ["/a b/it's; rm -rf.png", "/c/d.mp4"], output: "/o/out.gif", opts } as any);
    expect(argv).toContain("file:/a b/it's; rm -rf.png");
    expect(argv.filter((x) => x === "-i").length).toBe(2);
    expect(argv.at(-1)).toBe("file:/o/out.gif");
    expect(() => gifFromMixed({ exe: "ffmpeg", inputs: Array(40).fill("/c/d.mp4"), output: "/o/o.gif", opts: { ...opts, clip: 10 } } as any)).toThrow(/too long|enormous/);
    expect(gifFromMixed({ exe: "f", inputs: ["/a.png"], output: "/o.gif", opts: { ...opts, repeat: "once" } } as any)).toContain("-1");
  });
  test.skipIf(!FF)("pictures and a video become one GIF with the right frames, size and colors", () => {
    const ff = (...a: string[]) => spawnSync(FF!, ["-loglevel", "error", "-y", ...a], { encoding: "utf8" });
    ff("-f", "lavfi", "-i", "color=c=red:s=640x360:d=0.1", "-frames:v", "1", join(dir, "a.png"));
    ff("-f", "lavfi", "-i", "color=c=blue:s=300x500:d=0.1", "-frames:v", "1", join(dir, "b.png"));
    ff("-f", "lavfi", "-i", "testsrc=s=320x240:d=3:r=15", "-pix_fmt", "yuv420p", join(dir, "c.mp4"));
    const out = join(dir, "out.gif");
    const argv = gifFromMixed({ exe: FF!, inputs: [join(dir, "a.png"), join(dir, "b.png"), join(dir, "c.mp4")], output: out, opts } as any);
    const r = spawnSync(FF!, argv.filter((x) => x !== "-n"), { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const gif = parseGif(readFileSync(out));
    expect([gif.width, gif.height]).toEqual([240, 135]);
    expect(gif.frames.length).toBe(40); // 10 for each picture (1 s at 10 per second) and 20 for the 2 seconds taken from the video
    expect(gif.loop).toBe(0);
    const frames = composeFrames(gif);
    const mid = (f: Uint8ClampedArray) => px(f, 240, 120, 67);
    expect(mid(frames[3])[0]).toBeGreaterThan(200); // red picture
    expect(mid(frames[3])[2]).toBeLessThan(60);
    expect(mid(frames[13])[2]).toBeGreaterThan(200); // blue picture, in the middle of black bars on both sides
    expect(px(frames[13], 240, 2, 67).slice(0, 3).every((v) => v < 40)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
