/**
 * The extra picture, video and sound edits, and the Image and Media Studio recipes, with the REAL programs on this
 * machine. Every new action runs once with its default settings; the studios run with many settings at once.
 * Skipped (not failed) when ImageMagick or ffmpeg isn't installed.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { startConvert, type ConvertRequest } from "../src/features/filemanager/fmBatch";
import { overview } from "../src/features/filemanager/fmConvert";
import { MORE_PICTURE_DEFS, MORE_SOUND_DEFS, MORE_VIDEO_DEFS } from "../src/features/filemanager/fmConvMediaMore";
import { createContext } from "../src/features/filemanager/fmCore";
import { resolveTool } from "../src/features/filemanager/fmToolDetect";

setDefaultTimeout(180_000);

const root = mkdtempSync(join(tmpdir(), "fm-studio-"));
const home = join(root, "home");
const work = join(home, "Work");
const ctx = createContext({ home, dataDir: join(root, "data") });
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(work, { recursive: true });

const ffmpegPath = resolveTool(ctx, "ffmpeg");
const magickPath = resolveTool(ctx, "imagemagick");
const ffprobePath = ffmpegPath ? join(dirname(ffmpegPath), "ffprobe") : "";
const media = !!ffmpegPath && existsSync(ffprobePath);

async function exec(argv: string[]): Promise<string> {
  const p = Bun.spawn(argv, { cwd: work, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return out + err;
}

async function run(req: ConvertRequest) {
  const job = await startConvert(ctx, req);
  const done = await ctx.jobs.whenDone(job.id);
  if (done.state !== "done") throw new Error(`${req.action}: job ${done.state}: ${done.steps.map((s) => `${s.label}: ${s.message}`).join(" | ")}`);
  return done.outputs[0]!;
}

async function probe(file: string) {
  const j = JSON.parse(await exec([ffprobePath, "-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
  return { streams: (j.streams ?? []) as Array<Record<string, any>>, duration: Number(j.format?.duration ?? 0) };
}

const identify = async (file: string) => {
  const [w, h, m, a] = (await exec([magickPath!, "identify", "-format", "%w %h %m %A\n", `${file}[0]`])).trim().split(" ");
  return { w: Number(w), h: Number(h), fmt: m!, alpha: a !== "Undefined" && a !== "False" };
};

let photo = "";
let photo2 = "";
let clip = "";
let song = "";

await (async () => {
  if (magickPath) {
    photo = join(work, "photo.jpg");
    photo2 = join(work, "second.png");
    await exec([magickPath, "-size", "320x200", "gradient:orange-navy", photo]);
    await exec([magickPath, "-size", "200x200", "xc:white", "-fill", "red", "-draw", "circle 100,100 100,40", photo2]);
  }
  if (media) {
    clip = join(work, "clip.mp4");
    song = join(work, "song.mp3");
    await exec([ffmpegPath!, "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-ac", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
    await exec([ffmpegPath!, "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-ac", "2", "-c:a", "libmp3lame", song]);
  }
})();

describe("the new actions are listed, the studio recipes are not", () => {
  test.skipIf(!magickPath)("a picture offers grayscale, crop, circle… but never the studio", async () => {
    const ids = (await overview(ctx, [photo])).actions.map((a) => a.id);
    for (const id of ["img-gray", "img-sepia", "img-crop", "img-circle", "img-transparent", "img-adjust"]) expect(ids).toContain(id);
    expect(ids).not.toContain("studio-image");
    expect(ids).not.toContain("studio-media");
  });
});

describe.skipIf(!magickPath)("every new picture action", () => {
  for (const def of MORE_PICTURE_DEFS) {
    test(def.id, async () => {
      const out = await run({ action: def.id, paths: def.mode === "all" ? [photo, photo2] : [photo] });
      expect(existsSync(out)).toBe(true);
      const info = await identify(out);
      expect(info.w).toBeGreaterThan(0);
      if (def.id === "img-crop") expect(info.w).toBe(info.h);
      if (def.id === "img-circle") expect(info.alpha).toBe(true);
      if (def.id === "img-append") expect(info.w).toBeGreaterThan(info.h);
    });
  }
});

describe.skipIf(!media)("every new video action", () => {
  for (const def of MORE_VIDEO_DEFS) {
    test(def.id, async () => {
      const paths = def.id === "vid-add-music" ? [clip, song] : def.id === "vid-still" ? [photo, song] : [clip];
      if (def.id === "vid-still" && !magickPath) return;
      const out = await run({ action: def.id, paths });
      const p = await probe(out);
      expect(p.duration).toBeGreaterThan(1);
      const v = p.streams.find((s) => s.codec_type === "video");
      expect(v).toBeTruthy();
      if (def.id === "vid-crop-shape") expect(v!.height).toBeGreaterThan(v!.width);
      if (def.id === "vid-loop") expect(p.duration).toBeGreaterThan(10);
    });
  }
});

describe.skipIf(!media)("every new sound action", () => {
  for (const def of MORE_SOUND_DEFS) {
    test(def.id, async () => {
      const options = def.id === "aud-trim" ? { start: "1", end: "3" } : def.id === "aud-split" ? { minutes: 1 } : undefined;
      const out = await run({ action: def.id, paths: [song], options });
      if (def.id === "aud-split") {
        expect(readdirSync(out).length).toBeGreaterThanOrEqual(1);
        return;
      }
      const p = await probe(out);
      expect(p.streams.some((s) => s.codec_type === "audio")).toBe(true);
      if (def.id === "aud-trim") expect(p.duration).toBeCloseTo(2, 0);
      if (def.id === "aud-mono") expect(p.streams[0]!.channels).toBe(1);
    });
  }
});

describe.skipIf(!magickPath)("Image Studio", () => {
  test("many changes at once, saved as a round PNG", async () => {
    const out = await run({
      action: "studio-image", paths: [photo],
      options: { brightness: 20, contrast: 15, saturation: 140, hue: 30, warmth: 40, sepia: 20, sharpen: 1, blur: 0.5, vignette: true, rotate: "90", flipH: true, crop: "circle", border: 6, width: 150 },
    });
    expect(out.endsWith(".png")).toBe(true);
    const info = await identify(out);
    expect(info.alpha).toBe(true);
    expect(info.w).toBe(info.h);
  });

  test("grayscale WebP at a chosen width", async () => {
    const out = await run({ action: "studio-image", paths: [photo], options: { gray: true, format: "webp", width: 160, quality: 70 } });
    expect(out.endsWith(".webp")).toBe(true);
    expect((await identify(out)).w).toBe(160);
  });

  test("with no changes it still makes a copy, and JPG with a circle is refused plainly", async () => {
    expect(existsSync(await run({ action: "studio-image", paths: [photo] }))).toBe(true);
    await expect(startConvert(ctx, { action: "studio-image", paths: [photo], options: { crop: "circle", format: "jpg" } })).rejects.toThrow(/PNG, WebP or AVIF/);
  });
});

describe.skipIf(!media)("Media Studio", () => {
  test("a song: trim, faster, louder, fades, bass, normalized, as M4A", async () => {
    const out = await run({ action: "studio-media", paths: [song], options: { start: "1", end: "5", speed: 2, volume: 150, fadeIn: 0.5, fadeOut: 0.5, bass: 4, normalize: true, format: "m4a" } });
    expect(out.endsWith(".m4a")).toBe(true);
    expect((await probe(out)).duration).toBeCloseTo(2, 0);
  });

  test("a fade out without an end time asks ffprobe for the length", async () => {
    const out = await run({ action: "studio-media", paths: [song], options: { fadeOut: 2, denoise: true, voice: true, mono: true } });
    const p = await probe(out);
    expect(p.duration).toBeCloseTo(6, 0);
    expect(p.streams[0]!.channels).toBe(1);
  });

  test("a video: crop to vertical, colors, black and white, mirror, fades, slower", async () => {
    const out = await run({ action: "studio-media", paths: [clip], options: { shape: "9:16", brightness: 10, contrast: 10, saturation: 120, gray: true, mirror: true, fadeIn: 1, fadeOut: 1, speed: 0.5, format: "mp4" } });
    const p = await probe(out);
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect(v.height).toBeGreaterThan(v.width);
    expect(p.duration).toBeGreaterThan(7);
  });

  test("a video's sound saved as MP3, and a silent rotated copy", async () => {
    const mp3 = await run({ action: "studio-media", paths: [clip], options: { format: "mp3", start: "0:01" } });
    expect((await probe(mp3)).streams.every((s) => s.codec_type === "audio")).toBe(true);
    const silent = await run({ action: "studio-media", paths: [clip], options: { mute: true, rotate: "90" } });
    const p = await probe(silent);
    expect(p.streams.some((s) => s.codec_type === "audio")).toBe(false);
    expect(p.streams[0]!.height).toBe(320);
  });
});
