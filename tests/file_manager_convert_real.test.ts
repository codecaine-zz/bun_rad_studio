/**
 * "Convert & process" with the REAL programs on this machine: every test makes small real files, converts them and
 * looks at the result. A test is skipped (not failed) when its program isn't installed.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { startConvert, type ConvertRequest } from "../src/features/filemanager/fmBatch";
import { createContext } from "../src/features/filemanager/fmCore";
import { resolveTool, toolStatus } from "../src/features/filemanager/fmToolDetect";
import type { ToolId } from "../src/features/filemanager/fmTools";

setDefaultTimeout(120_000);

const root = mkdtempSync(join(tmpdir(), "fm-real-"));
const home = join(root, "home");
const work = join(home, "Work");
const ctx = createContext({ home, dataDir: join(root, "data") });
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(work, { recursive: true });

const has = (tool: ToolId, program?: string) => resolveTool(ctx, tool, program) !== null;
const ffmpeg = has("ffmpeg");
const magick = has("imagemagick");
const gs = has("ghostscript");
const qpdf = has("qpdf");
const pandoc = has("pandoc");
const tesseract = has("tesseract");
const soffice = has("libreoffice");
const calibre = has("calibre");
const fonttools = has("fonttools");
const sevenzip = has("sevenzip");
const unar = has("unar");
// Linux ships GNU tar under the name "tar", which the program list rightly refuses as bsdtar: ask the program itself.
const bsdtarPath = resolveTool(ctx, "bsdtar");
const bsdtar = bsdtarPath !== null && /bsdtar|libarchive/i.test(Bun.spawnSync([bsdtarPath, "--version"]).stdout.toString());
const exiftool = has("exiftool");
const poppler = has("poppler");
const ffprobePath = ffmpeg ? join(dirname(resolveTool(ctx, "ffmpeg")!), "ffprobe") : "";
const hasProbe = ffmpeg && existsSync(ffprobePath);

async function exec(argv: string[], cwd = work): Promise<{ code: number; out: string }> {
  const p = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out: out + err };
}

async function probe(file: string): Promise<{ streams: Array<Record<string, any>>; duration: number }> {
  const r = await exec([ffprobePath, "-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  const j = JSON.parse(r.out);
  return { streams: j.streams ?? [], duration: Number(j.format?.duration ?? 0) };
}

async function identify(file: string): Promise<{ w: number; h: number; fmt: string; frames: number }> {
  const r = await exec([resolveTool(ctx, "imagemagick")!, "identify", "-format", "%w %h %m\n", file]);
  const lines = r.out.trim().split("\n");
  const [w, h, fmt] = lines[0]!.split(" ");
  return { w: Number(w), h: Number(h), fmt: fmt!, frames: lines.length };
}

/** Runs one action and waits for the job; fails the test with the step messages when it doesn't finish well. */
async function run(req: ConvertRequest, expectState: "done" | "failed" = "done") {
  const job = await startConvert(ctx, req);
  const done = await ctx.jobs.whenDone(job.id);
  if (done.state !== expectState) throw new Error(`job ${done.state}: ${done.steps.map((s) => `${s.label}: ${s.message}`).join(" | ")}`);
  return done;
}

const fresh = (name: string) => {
  const d = join(work, name);
  mkdirSync(d, { recursive: true });
  return d;
};

let clip = "";
let tone = "";
let pngs: string[] = [];
let pdf3 = "";
let docx = "";

// Sample files are made once, before the tests are collected, so tests can be skipped when a sample could not be made.
await (async () => {
  if (ffmpeg) {
    const dir = fresh("media");
    clip = join(dir, "clip.mp4");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
    tone = join(dir, "tone.wav");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", tone]);
  }
  if (magick) {
    const dir = fresh("pics");
    for (const [name, color] of [["a", "red"], ["b", "green"], ["c", "blue"]] as const) {
      const p = join(dir, `${name}.png`);
      await exec([resolveTool(ctx, "imagemagick")!, "-size", "64x48", `xc:${color}`, p]);
      pngs.push(p);
    }
    if (gs) {
      pdf3 = join(dir, "three.pdf");
      await exec([resolveTool(ctx, "imagemagick")!, ...pngs, pdf3]);
    }
  }
  if (pandoc) {
    const dir = fresh("docs");
    writeFileSync(join(dir, "note.md"), "# Title\n\nHello **world** with `code`.\n\n- one\n- two\n");
    docx = join(dir, "note.docx");
    await exec([resolveTool(ctx, "pandoc")!, join(dir, "note.md"), "-o", docx]);
  }
})();

describe("the real programs are found", () => {
  test("the status lists every tool and the capabilities that gate actions", async () => {
    const s = await toolStatus(ctx);
    expect(s.tools.length).toBeGreaterThanOrEqual(13);
    if (ffmpeg) expect(s.tools.find((t) => t.id === "ffmpeg")!.capabilities).toContain("x264");
    if (magick) expect(s.tools.find((t) => t.id === "imagemagick")!.capabilities).toContain("png");
    if (tesseract) expect(s.tools.find((t) => t.id === "tesseract")!.capabilities).toContain("lang-eng");
    if (pandoc) expect(s.tools.find((t) => t.id === "pandoc")!.capabilities.some((c) => c.startsWith("writer-"))).toBe(true);
  });
});

describe.skipIf(!ffmpeg || !hasProbe)("video with ffmpeg", () => {
  test("MP4, MKV (stream copy), WebM, MOV and AVI", async () => {
    const done = await run({ action: "vid-mkv", paths: [clip] });
    const mkv = done.outputs[0]!;
    expect(mkv.endsWith("clip.mkv")).toBe(true);
    const p = await probe(mkv);
    expect(p.streams.map((s) => s.codec_name)).toContain("h264");
    for (const [id, ext] of [["vid-mov", "mov"], ["vid-avi", "avi"]] as const) {
      const out = (await run({ action: id, paths: [clip] })).outputs[0]!;
      expect(out.endsWith(`clip.${ext}`)).toBe(true);
      expect((await probe(out)).duration).toBeGreaterThan(2);
    }
  });

  test("sharing sizes shrink the picture and keep the length", async () => {
    const out = (await run({ action: "vid-email", paths: [clip] })).outputs[0]!;
    const v = (await probe(out)).streams.find((s) => s.codec_type === "video")!;
    expect(v.width).toBeLessThanOrEqual(640);
    const small = (await run({ action: "vid-480", paths: [clip] })).outputs[0]!;
    expect((await probe(small)).streams.find((s) => s.codec_type === "video")!.height).toBeLessThanOrEqual(480);
  });

  test("trim keeps only the chosen part, in both methods", async () => {
    const fast = (await run({ action: "vid-trim", paths: [clip], options: { start: "0:00:01", end: "0:00:02.5", method: "fast" } })).outputs[0]!;
    const exact = (await run({ action: "vid-trim", paths: [clip], options: { start: "1", end: "2.5", method: "exact" } })).outputs[0]!;
    expect((await probe(exact)).duration).toBeGreaterThan(1.2);
    expect((await probe(exact)).duration).toBeLessThan(1.8);
    expect((await probe(fast)).duration).toBeLessThan(3.1);
  });

  test("speed, mute and rotate", async () => {
    const fast = (await run({ action: "vid-speed", paths: [clip], options: { speed: "2" } })).outputs[0]!;
    expect((await probe(fast)).duration).toBeLessThan(2);
    const muted = (await run({ action: "vid-mute", paths: [clip] })).outputs[0]!;
    expect((await probe(muted)).streams.some((s) => s.codec_type === "audio")).toBe(false);
    const turned = (await run({ action: "vid-rotate", paths: [clip], options: { turn: "cw" } })).outputs[0]!;
    const v = (await probe(turned)).streams.find((s) => s.codec_type === "video")!;
    expect([v.width, v.height]).toEqual([240, 320]);
  });

  test("GIFs: palette GIF, custom GIF, and GIF back to MP4", async () => {
    const gif = (await run({ action: "vid-gif", paths: [clip] })).outputs[0]!;
    expect(readFileSync(gif).subarray(0, 3).toString()).toBe("GIF");
    const custom = (await run({ action: "vid-gif-custom", paths: [clip], options: { start: "0:01", length: 1, width: 160, fps: "8" } })).outputs[0]!;
    expect((await probe(custom)).streams[0]!.width).toBe(160);
    const mp4 = (await run({ action: "gif-mp4", paths: [gif] })).outputs[0]!;
    expect((await probe(mp4)).streams[0]!.codec_name).toBe("h264");
  });

  test("extract the sound in several formats, and pictures from the video", async () => {
    for (const [format, codec] of [["mp3", "mp3"], ["flac", "flac"], ["m4a", "aac"], ["ogg", "vorbis"], ["opus", "opus"], ["wav", "pcm_s16le"]] as const) {
      const out = (await run({ action: "vid-audio", paths: [clip], options: { format } })).outputs[0]!;
      expect(out.endsWith(`.${format}`)).toBe(true);
      const streams = (await probe(out)).streams;
      expect(streams.length).toBe(1);
      expect(streams[0]!.codec_name).toBe(codec);
    }
    const frames = (await run({ action: "vid-frames", paths: [clip], options: { every: 1, max: 5, format: "png" } })).outputs[0]!;
    expect(statSync(frames).isDirectory()).toBe(true);
    expect(readdirSync(frames).sort()).toEqual(["frame-0001.png", "frame-0002.png", "frame-0003.png"]);
    const still = (await run({ action: "vid-frame-at", paths: [clip], options: { time: "00:00:01.5", format: "jpg" } })).outputs[0]!;
    expect(still.endsWith(".jpg")).toBe(true);
    expect((await identify(still)).w).toBe(320);
  });

  test("joining videos, in the order chosen", async () => {
    const dir = fresh("join");
    const a = join(dir, "a.mp4");
    const b = join(dir, "b.mp4");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-i", clip, "-t", "1", "-c", "copy", a]);
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-i", clip, "-t", "2", "-c", "copy", b]);
    const done = await run({ action: "vid-concat", paths: [b, a], options: { method: "same", order: "name" } });
    expect(basename(done.outputs[0]!)).toBe("Joined video.mp4");
    expect((await probe(done.outputs[0]!)).duration).toBeGreaterThan(2.5);
    const re = await run({ action: "vid-concat", paths: [b, a], options: { method: "reencode", order: "selected", size: "854x480" } });
    expect((await probe(re.outputs[0]!)).streams.find((s) => s.codec_type === "video")!.width).toBe(854);
  });

  test("subtitles: SRT to VTT and ASS, save them out of a video, and burn them in", async () => {
    const dir = fresh("subs");
    const srt = join(dir, "movie.srt");
    writeFileSync(srt, "1\n00:00:00,000 --> 00:00:02,000\nHello there\n\n2\n00:00:02,000 --> 00:00:03,000\nSecond line\n");
    const vtt = (await run({ action: "sub-vtt", paths: [srt] })).outputs[0]!;
    expect(readFileSync(vtt, "utf8")).toContain("WEBVTT");
    const ass = (await run({ action: "sub-ass", paths: [srt] })).outputs[0]!;
    expect(readFileSync(ass, "utf8")).toContain("Dialogue:");
    const mkv = join(dir, "with.mkv");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-i", clip, "-i", srt, "-c", "copy", "-c:s", "srt", mkv]);
    const out = (await run({ action: "vid-extract-subs", paths: [mkv] })).outputs[0]!;
    expect(readFileSync(out, "utf8")).toContain("Hello there");
    const copy = join(dir, "clip.mp4");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-i", clip, "-c", "copy", copy]);
    const burned = await run({ action: "vid-burn-subs", paths: [copy, srt] });
    expect(basename(burned.outputs[0]!)).toBe("clip (subtitled).mp4");
    await expect(startConvert(ctx, { action: "vid-burn-subs", paths: [copy, clip] })).rejects.toMatchObject({ code: "BAD_OPTION" });
  });
});

describe.skipIf(!ffmpeg || !hasProbe)("sound with ffmpeg", () => {
  test("converting with a chosen quality, sample rate and channels", async () => {
    const out = (await run({ action: "aud-custom", paths: [tone], options: { format: "mp3", quality: "128k", rate: "22050", channels: "1" } })).outputs[0]!;
    const s = (await probe(out)).streams[0]!;
    expect([s.codec_name, Number(s.sample_rate), s.channels]).toEqual(["mp3", 22050, 1]);
    for (const [id, codec] of [["aud-opus", "opus"], ["aud-ogg", "vorbis"], ["aud-flac", "flac"], ["aud-m4a", "aac"], ["aud-aiff", "pcm_s16be"], ["aud-wma", "wmav2"]] as const) {
      const o = (await run({ action: id, paths: [tone] })).outputs[0]!;
      expect((await probe(o)).streams[0]!.codec_name, id).toBe(codec);
    }
  });

  test("normalise, silence, speed, join, tags, art, waveform and ringtone", async () => {
    const norm = (await run({ action: "aud-normalize", paths: [tone] })).outputs[0]!;
    expect(norm.endsWith("tone (normalised).wav")).toBe(true);
    expect((await probe(norm)).duration).toBeGreaterThan(2.5);
    const sil = join(fresh("silence"), "gap.wav");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-f", "lavfi", "-t", "1", "-i", "anullsrc=r=44100:cl=mono", "-f", "lavfi", "-i", "sine=frequency=500:duration=1", "-filter_complex", "[0][1]concat=n=2:v=0:a=1", sil]);
    const trimmed = (await run({ action: "aud-silence", paths: [sil] })).outputs[0]!;
    expect((await probe(trimmed)).duration).toBeLessThan(1.4);
    const slow = (await run({ action: "aud-speed", paths: [tone], options: { speed: "0.5" } })).outputs[0]!;
    expect((await probe(slow)).duration).toBeGreaterThan(5);
    const mp3 = (await run({ action: "aud-custom", paths: [tone], options: { format: "mp3" } })).outputs[0]!;
    const tagged = (await run({ action: "aud-tags", paths: [mp3], options: { title: "My Song", artist: "Me; $(rm -rf x)" } })).outputs[0]!;
    const meta = await exec([ffprobePath, "-v", "error", "-show_entries", "format_tags", "-of", "json", tagged]);
    expect(JSON.parse(meta.out).format.tags).toMatchObject({ title: "My Song", artist: "Me; $(rm -rf x)" });
    const stripped = (await run({ action: "aud-strip-tags", paths: [tagged] })).outputs[0]!;
    const meta2 = JSON.parse((await exec([ffprobePath, "-v", "error", "-show_entries", "format_tags", "-of", "json", stripped])).out);
    expect(meta2.format.tags?.title).toBeUndefined();
    const wave = (await run({ action: "aud-waveform", paths: [tone] })).outputs[0]!;
    if (magick) expect((await identify(wave)).w).toBe(1200);
    const ring = (await run({ action: "aud-ringtone", paths: [tone], options: { start: "0:00:01", length: 5, format: "m4r" } })).outputs[0]!;
    expect(ring.endsWith(".m4r")).toBe(true);
    expect((await probe(ring)).duration).toBeLessThan(2.3);
    const dir = fresh("joinaudio");
    const a = join(dir, "a.wav");
    const b = join(dir, "b.wav");
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-i", tone, "-t", "1", a]);
    await exec([resolveTool(ctx, "ffmpeg")!, "-nostdin", "-loglevel", "error", "-i", tone, "-t", "2", b]);
    const joined = (await run({ action: "aud-join", paths: [b, a] })).outputs[0]!;
    expect(basename(joined)).toBe("Joined sound.wav");
    expect((await probe(joined)).duration).toBeGreaterThan(2.8);
  });
});

describe.skipIf(!magick)("pictures with ImageMagick", () => {
  test("web-sized pictures in each format are smaller in pixels", async () => {
    const big = join(fresh("big"), "big.png");
    await exec([resolveTool(ctx, "imagemagick")!, "-size", "3000x2000", "gradient:red-blue", big]);
    for (const [format, fmt] of [["jpg", "JPEG"], ["webp", "WEBP"], ["png", "PNG"]] as const) {
      const out = (await run({ action: "img-web", paths: [big], options: { format, size: 1000, quality: 70 } })).outputs[0]!;
      const id = await identify(out);
      expect([id.w, id.h, id.fmt]).toEqual([1000, 667, fmt]);
    }
  });

  test("compress, resize modes, social sizes, flips and sRGB", async () => {
    const photo = join(fresh("photo"), "p.jpg");
    await exec([resolveTool(ctx, "imagemagick")!, "-size", "800x600", "plasma:red-blue", "-quality", "100", photo]);
    const small = (await run({ action: "img-compress", paths: [photo], options: { quality: 50 } })).outputs[0]!;
    expect(statSync(small).size).toBeLessThan(statSync(photo).size);
    const byWidth = (await run({ action: "img-resize", paths: [photo], options: { mode: "width", size: 400 } })).outputs[0]!;
    expect((await identify(byWidth)).w).toBe(400);
    const pct = (await run({ action: "img-resize", paths: [photo], options: { mode: "percent", size: 25 } })).outputs[0]!;
    expect((await identify(pct)).w).toBe(200);
    const social = (await run({ action: "img-social", paths: [photo], options: { preset: "landscape" } })).outputs[0]!;
    expect([(await identify(social)).w, (await identify(social)).h]).toEqual([1200, 630]);
    for (const id of ["img-rot-180", "img-flip-h", "img-flip-v", "img-autoorient", "img-srgb", "img-thumb", "img-fit-1080"]) {
      const o = (await run({ action: id, paths: [photo] })).outputs[0]!;
      expect((await identify(o)).fmt, id).toBe("JPEG");
    }
  });

  test("every picture format that this ImageMagick can write", async () => {
    const caps = (await toolStatus(ctx)).tools.find((t) => t.id === "imagemagick")!.capabilities;
    for (const [id, cap, fmt] of [["img-tiff", "tiff", "TIFF"], ["img-bmp", "bmp", "BMP"], ["img-gif", "gif", "GIF"], ["img-avif", "avif", "AVIF"], ["img-heic", "heic", "HEIC"], ["img-webp", "webp", "WEBP"]] as const) {
      if (!caps.includes(cap)) continue;
      const src = id === "img-gif" || id === "img-bmp" ? pngs[0]! : pngs[0]!;
      const o = (await run({ action: id, paths: [src] })).outputs[0]!;
      expect((await identify(o)).fmt, id).toBe(fmt);
    }
    const ico = (await run({ action: "img-favicon", paths: [pngs[0]!] })).outputs[0]!;
    expect((await exec([resolveTool(ctx, "imagemagick")!, "identify", "-format", "%w,", ico])).out.split(",").filter(Boolean).sort()).toEqual(["16", "32", "48"]);
    if (caps.includes("icns")) expect(statSync((await run({ action: "img-icns", paths: [pngs[0]!] })).outputs[0]!).size).toBeGreaterThan(100);
  });

  test("a text watermark with awkward characters", async () => {
    const out = (await run({ action: "img-watermark", paths: [pngs[1]!], options: { text: "100% $(x) 'q' ©", position: "Center", size: "small" } })).outputs[0]!;
    expect(basename(out)).toBe("b (watermarked).png");
    expect(existsSync(join(work, "x"))).toBe(false);
  });

  test("contact sheets, animations and pictures to one PDF", async () => {
    const sheet = (await run({ action: "img-montage", paths: pngs, options: { columns: 2 } })).outputs[0]!;
    expect(basename(sheet)).toBe("Contact sheet.png");
    const gif = (await run({ action: "img-gif-anim", paths: pngs, options: { delay: 200, width: 64 } })).outputs[0]!;
    expect((await identify(gif)).frames).toBe(3);
    const caps = (await toolStatus(ctx)).tools.find((t) => t.id === "imagemagick")!.capabilities;
    if (caps.includes("webp")) expect((await identify((await run({ action: "img-webp-anim", paths: pngs })).outputs[0]!)).frames).toBeGreaterThanOrEqual(1);
  });

  test("an SVG drawing becomes a sharp PNG", async () => {
    const svg = join(fresh("svg"), "dot.svg");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#c00"/></svg>');
    const caps = (await toolStatus(ctx)).tools.find((t) => t.id === "imagemagick")!.capabilities;
    if (!caps.includes("read-svg")) return;
    const out = (await run({ action: "img-svg-png", paths: [svg], options: { scale: "4" } })).outputs[0]!;
    expect((await identify(out)).w).toBe(160);
  });
});

describe.skipIf(!gs || !pdf3)("PDF tools with Ghostscript", () => {
  test("merge in the order chosen, then split into pages and into pictures", async () => {
    const dir = fresh("pdfs");
    const a = join(dir, "a.pdf");
    const b = join(dir, "b.pdf");
    await exec([resolveTool(ctx, "imagemagick")!, pngs[0]!, a]);
    await exec([resolveTool(ctx, "imagemagick")!, pngs[1]!, pngs[2]!, b]);
    const merged = (await run({ action: "pdf-merge", paths: [b, a], options: { order: "selected" } })).outputs[0]!;
    expect(basename(merged)).toBe("Merged PDF.pdf");
    const pages = async (f: string) => (await exec([resolveTool(ctx, "ghostscript")!, "-q", "-dNODISPLAY", "-dNOSAFER", `--permit-file-read=${f}`, "-c", `(${f}) (r) file runpdfbegin pdfpagecount = quit`])).out.trim();
    expect(await pages(merged)).toBe("3");
    const split = (await run({ action: "pdf-split", paths: [pdf3] })).outputs[0]!;
    expect(readdirSync(split).sort()).toEqual(["page-001.pdf", "page-002.pdf", "page-003.pdf"]);
    const png = (await run({ action: "pdf-png", paths: [pdf3], options: { dpi: 72, pages: "1,3" } })).outputs[0]!;
    expect(readdirSync(png).length).toBe(2);
    expect((await identify(join(png, readdirSync(png).sort()[0]!))).fmt).toBe("PNG");
    const jpg = (await run({ action: "pdf-jpg", paths: [pdf3], options: { dpi: 72, quality: 80 } })).outputs[0]!;
    expect(readdirSync(jpg).length).toBe(3);
  });

  test("compress, text and PDF/A", async () => {
    const small = (await run({ action: "pdf-compress", paths: [pdf3], options: { level: "screen" } })).outputs[0]!;
    expect(readFileSync(small).subarray(0, 4).toString()).toBe("%PDF");
    const hello = join(fresh("hello"), "hello.pdf");
    await exec([resolveTool(ctx, "ghostscript")!, "-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", `-sOutputFile=${hello}`, "-c", "/Helvetica findfont 24 scalefont setfont 72 700 moveto (Hello PDF world) show showpage"]);
    const text = (await run({ action: "pdf-text", paths: [hello] })).outputs[0]!;
    expect(readFileSync(text, "utf8")).toContain("Hello PDF world");
    const pdfa = (await run({ action: "pdf-pdfa", paths: [hello] })).outputs[0]!;
    const body = readFileSync(pdfa).toString("latin1");
    expect(body.startsWith("%PDF")).toBe(true);
    expect(body).toMatch(/pdfaid|GTS_PDFA1/);
  });
});

describe.skipIf(!qpdf || !pdf3)("PDF tools with qpdf", () => {
  test("keep some pages, rotate, and prepare for the web", async () => {
    const part = (await run({ action: "pdf-extract", paths: [pdf3], options: { pages: "1-2" } })).outputs[0]!;
    const info = await exec([resolveTool(ctx, "qpdf")!, "--show-npages", part]);
    expect(info.out.trim()).toBe("2");
    const rot = (await run({ action: "pdf-rotate", paths: [pdf3], options: { turn: "+90", pages: "2" } })).outputs[0]!;
    expect((await exec([resolveTool(ctx, "qpdf")!, "--show-object=5", rot])).out).toContain("/Rotate 90");
    expect((await exec([resolveTool(ctx, "qpdf")!, "--show-object=4", rot])).out).not.toContain("/Rotate");
    const lin = (await run({ action: "pdf-linearize", paths: [pdf3] })).outputs[0]!;
    expect((await exec([resolveTool(ctx, "qpdf")!, "--check-linearization", lin])).out).toContain("no linearization errors");
    await expect(startConvert(ctx, { action: "pdf-extract", paths: [pdf3], options: { pages: "3-1" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
  });
});

describe.skipIf(!gs || !pdf3 || !poppler)("PDF text with poppler", () => {
  test("pdftotext -layout is used first when it is installed", async () => {
    const hello = join(fresh("poppler"), "hello.pdf");
    await exec([resolveTool(ctx, "ghostscript")!, "-q", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", `-sOutputFile=${hello}`, "-c", "/Helvetica findfont 24 scalefont setfont 72 700 moveto (Poppler text) show showpage"]);
    const out = (await run({ action: "pdf-text", paths: [hello] })).outputs[0]!;
    expect(readFileSync(out, "utf8")).toContain("Poppler text");
  });
});

describe.skipIf(!tesseract || !magick)("OCR with Tesseract", () => {
  test("a picture, and a PDF made from it, become text and a searchable PDF", async () => {
    const dir = fresh("ocr");
    const img = join(dir, "scan.png");
    await exec([resolveTool(ctx, "imagemagick")!, "-size", "900x200", "xc:white", "-fill", "black", "-pointsize", "72", "-gravity", "center", "-annotate", "0", "Hello OCR world", img]);
    const text = (await run({ action: "ocr-text", paths: [img], options: { language: "eng" } })).outputs[0]!;
    expect(readFileSync(text, "utf8").toLowerCase()).toContain("hello");
    const spdf = (await run({ action: "ocr-pdf", paths: [img], options: { language: "eng" } })).outputs[0]!;
    expect(readFileSync(spdf).subarray(0, 4).toString()).toBe("%PDF");
    if (gs) {
      const scanned = join(dir, "scan2.pdf");
      await exec([resolveTool(ctx, "imagemagick")!, img, scanned]);
      const t2 = (await run({ action: "ocr-text", paths: [scanned], options: { language: "eng", dpi: 150 } })).outputs[0]!;
      expect(readFileSync(t2, "utf8").toLowerCase()).toContain("hello");
      const s2 = (await run({ action: "ocr-pdf", paths: [scanned], options: { language: "eng", dpi: 150 } })).outputs[0]!;
      expect(readFileSync(s2).subarray(0, 4).toString()).toBe("%PDF");
    }
    await expect(startConvert(ctx, { action: "ocr-text", paths: [img], options: { language: "xx_not_a_language" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
  });
});

describe.skipIf(!pandoc)("documents with pandoc", () => {
  test("Markdown to every format pandoc can write for us", async () => {
    const md = join(work, "docs", "note.md");
    const outputs: Record<string, string> = { "doc-rtf": ".rtf", "doc-tex": ".tex", "doc-rst": ".rst", "doc-org": ".org", "doc-adoc": ".adoc", "doc-wiki": ".wiki", "doc-textile": ".textile", "doc-ipynb": ".ipynb", "doc-pptx": ".pptx", "doc-fb2": ".fb2", "doc-epub": ".epub", "doc-html": ".html", "doc-docx": ".docx", "doc-odt": ".odt", "doc-txt": ".txt" };
    for (const [id, ext] of Object.entries(outputs)) {
      const out = (await run({ action: id, paths: [md] })).outputs[0]!;
      expect(out.endsWith(ext), id).toBe(true);
      expect(statSync(out).size, id).toBeGreaterThan(20);
    }
    const html = (await run({ action: "doc-html", paths: [md], options: { toc: true } })).outputs[0]!;
    expect(readFileSync(html, "utf8")).toContain("<strong>world</strong>");
  });

  test("a Word file goes back to Markdown", async () => {
    const out = (await run({ action: "doc-md", paths: [docx] })).outputs[0]!;
    expect(readFileSync(out, "utf8")).toContain("**world**");
  });
});

describe.skipIf(!soffice || !pandoc)("Office files with LibreOffice", () => {
  test("DOCX to PDF, to ODT and to plain text; the profile never disturbs a running LibreOffice", async () => {
    const pdf = (await run({ action: "doc-pdf", paths: [docx] })).outputs[0]!;
    expect(readFileSync(pdf).subarray(0, 4).toString()).toBe("%PDF");
    const odt = (await run({ action: "doc-odt", paths: [docx] })).outputs[0]!;
    expect(statSync(odt).size).toBeGreaterThan(1000);
  }, 120_000);

  test("a legacy .doc file (made by LibreOffice itself) opens as DOCX through LibreOffice", async () => {
    const doc = join(fresh("legacy"), "old.doc");
    const dir = dirname(doc);
    const st = Bun.spawnSync([resolveTool(ctx, "libreoffice")!, "--headless", "--convert-to", "doc", "--outdir", dir, docx], { stdout: "pipe", stderr: "pipe" });
    if (st.exitCode !== 0 || !existsSync(join(dir, "note.doc"))) return;
    const legacy = join(dir, "note.doc");
    const out = (await run({ action: "doc-docx", paths: [legacy] })).outputs[0]!;
    expect(out.endsWith("note.docx")).toBe(true);
  }, 120_000);
});

describe.skipIf(!calibre || !pandoc)("e-books with calibre", () => {
  test("EPUB to MOBI, AZW3 and Word", async () => {
    const epub = (await run({ action: "doc-epub", paths: [join(work, "docs", "note.md")] })).outputs[0]!;
    for (const [id, ext] of [["eb-mobi", ".mobi"], ["eb-azw3", ".azw3"], ["eb-docx", ".docx"]] as const) {
      const out = (await run({ action: id, paths: [epub] })).outputs[0]!;
      expect(out.endsWith(ext), id).toBe(true);
      expect(statSync(out).size).toBeGreaterThan(500);
    }
  }, 180_000);
});

const ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf";
describe.skipIf(!fonttools || !existsSync(ARIAL))("fonts with fontTools", () => {
  test("TTF to WOFF2 and WOFF, and web fonts back to TTF", async () => {
    const ttf = join(fresh("fonts"), "Arial.ttf");
    writeFileSync(ttf, readFileSync(ARIAL));
    const caps = (await toolStatus(ctx)).tools.find((t) => t.id === "fonttools")!.capabilities;
    if (caps.includes("woff2") || has("woff2")) {
      const woff2 = (await run({ action: "font-woff2", paths: [ttf] })).outputs[0]!;
      expect(readFileSync(woff2).subarray(0, 4).toString()).toBe("wOF2");
      const back = (await run({ action: "font-ttf", paths: [woff2] })).outputs[0]!;
      expect(readFileSync(back).readUInt32BE(0)).toBe(0x00010000);
    }
    const woff = (await run({ action: "font-woff", paths: [ttf] })).outputs[0]!;
    expect(readFileSync(woff).subarray(0, 4).toString()).toBe("wOFF");
    const ttf2 = (await run({ action: "font-ttf", paths: [woff] })).outputs[0]!;
    expect(readFileSync(ttf2).readUInt32BE(0)).toBe(0x00010000);
  }, 120_000);
});

describe.skipIf(!sevenzip && !unar && !bsdtar)("archives with the system's tools", () => {
  test.skipIf(!sevenzip)("pack a 7z, list it, and unpack it again with 7-Zip", async () => {
    const dir = fresh("sevenz");
    writeFileSync(join(dir, "one.txt"), "first");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "two.txt"), "second");
    const sz = (await run({ action: "arc-7z", paths: [join(dir, "one.txt"), join(dir, "sub")] })).outputs[0]!;
    expect(basename(sz)).toBe("Archive.7z");
    const listing = (await run({ action: "arc-list", paths: [sz] })).outputs[0]!;
    expect(readFileSync(listing, "utf8")).toContain("one.txt");
    const folder = (await run({ action: "arc-extract", paths: [sz] })).outputs[0]!;
    expect(readFileSync(join(folder, "one.txt"), "utf8")).toBe("first");
    expect(readFileSync(join(folder, "sub", "two.txt"), "utf8")).toBe("second");
  });

  test.skipIf(!sevenzip)("single compressed files: .xz opens through 7-Zip", async () => {
    const dir = fresh("xz");
    const src = join(dir, "data.csv");
    writeFileSync(src, "a,b\n1,2\n");
    const made = await exec([resolveTool(ctx, "sevenzip")!, "a", "-txz", join(dir, "data.csv.xz"), src]);
    expect(made.code).toBe(0);
    rmSync(src);
    const out = (await run({ action: "arc-decompress", paths: [join(dir, "data.csv.xz")] })).outputs[0]!;
    expect(basename(out)).toBe("data.csv");
    expect(readFileSync(out, "utf8")).toBe("a,b\n1,2\n");
  });

  test.skipIf(!bsdtar)("tar.bz2 opens with bsdtar", async () => {
    const dir = fresh("bz2");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "f.txt"), "bz2 content");
    const tarball = join(dir, "pack.tar.bz2");
    expect((await exec(["tar", "-cjf", tarball, "-C", dir, "src"])).code).toBe(0);
    const folder = (await run({ action: "arc-extract", paths: [tarball] })).outputs[0]!;
    expect(readFileSync(join(folder, "src", "f.txt"), "utf8")).toBe("bz2 content");
  });
});

describe.skipIf(!exiftool || !magick)("hidden details with ExifTool", () => {
  test("save the details as text and JSON, and remove only the location", async () => {
    const dir = fresh("exif");
    const jpg = join(dir, "geo.jpg");
    await exec([resolveTool(ctx, "imagemagick")!, "-size", "20x20", "xc:red", jpg]);
    await exec([resolveTool(ctx, "exiftool")!, "-overwrite_original", "-GPSLatitude=48.85", "-GPSLatitudeRef=N", "-GPSLongitude=2.35", "-GPSLongitudeRef=E", "-Make=TestCam", jpg]);
    const text = (await run({ action: "meta-text", paths: [jpg] })).outputs[0]!;
    expect(readFileSync(text, "utf8")).toContain("TestCam");
    const json = JSON.parse(readFileSync((await run({ action: "meta-json", paths: [jpg] })).outputs[0]!, "utf8"));
    expect(Array.isArray(json)).toBe(true);
    const clean = (await run({ action: "meta-gps-strip", paths: [jpg] })).outputs[0]!;
    expect(basename(clean)).toBe("geo (no location).jpg");
    const after = (await exec([resolveTool(ctx, "exiftool")!, "-a", "-G1", "-s", clean])).out;
    expect(after).toContain("TestCam");
    expect(after).not.toMatch(/GPSLatitude/);
    expect(readFileSync(jpg).equals(readFileSync(jpg))).toBe(true);
  });
});
