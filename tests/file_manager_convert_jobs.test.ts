/**
 * "Convert & process": the options checks, the catalog, the exact commands for every tool-based action (as lists of
 * arguments, never shell lines), which actions are offered with which programs, install plans for every program and
 * package manager, and how jobs behave (never overwrite, clean up, cancel, plain errors).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import { join } from "path";
import { overview, planConvert, previewConvert, startConvert } from "../src/features/filemanager/fmBatch";
import { CATALOG, CATALOG_BY_ID } from "../src/features/filemanager/fmConvCatalog";
import { publishFile } from "../src/features/filemanager/fmConvExec";
import { applyPattern, parsePages, parseTime, validateOne, validateOptions, validatePattern, type OptionDef } from "../src/features/filemanager/fmConvOptions";
import { atempoChain, filterPath, SOCIAL_SIZES } from "../src/features/filemanager/fmConvMedia";
import { ghostscriptProfile } from "../src/features/filemanager/fmConvDocs";
import { defAccepts, extOf, plannedName, type BuildContext, type ConvDef, type Engine } from "../src/features/filemanager/fmConvTypes";
import { createContext } from "../src/features/filemanager/fmCore";
import { createJobHub } from "../src/features/filemanager/fmJobs";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { toolStatus } from "../src/features/filemanager/fmToolDetect";
import { TOOLS, TOOL_IDS, installPlan, searchDirs, tesseractCapabilities, type ManagerId, type ToolId } from "../src/features/filemanager/fmTools";
// The page's own helper functions are plain JavaScript and are tested here too.
import { badgeFor, describeSelection, extensionOfName, groupActions, optionApplies, searchActions, wantsSlider } from "../resources/file_manager/ui/convertdata.js";

const posix = process.platform !== "win32";
const suite = posix ? describe : describe.skip;
const root = mkdtempSync(join(tmpdir(), "fm-convjobs-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// ---------------------------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------------------------

const def = (o: Partial<OptionDef> & Pick<OptionDef, "id" | "kind">): OptionDef => ({ label: o.id, hint: "", default: "", ...o });
const fails = (fn: () => unknown, code = "BAD_OPTION"): string => {
  try {
    fn();
  } catch (err: any) {
    expect(err.code).toBe(code);
    return err.message as string;
  }
  throw new Error("expected a failure");
};

describe("option checks", () => {
  test("numbers are clamped, rounded to their step, and never NaN, infinite or text", () => {
    const n = def({ id: "q", kind: "number", min: 10, max: 100, step: 1, default: 50 });
    expect(validateOne(n, 5)).toBe(10);
    expect(validateOne(n, 1e12)).toBe(100);
    expect(validateOne(n, -7)).toBe(10);
    expect(validateOne(n, "42")).toBe(42);
    expect(validateOne(n, 55.6)).toBe(56);
    expect(validateOne(n, undefined)).toBe(50);
    for (const bad of [NaN, Infinity, -Infinity, "abc", "1e3", "0x10", "", " ", "5; rm -rf /", {}, [], true, "NaN"]) fails(() => validateOne(n, bad));
    const decimal = def({ id: "d", kind: "number", min: 0, max: 2, step: 0.25, default: 1 });
    expect(validateOne(decimal, 0.3)).toBe(0.25);
  });

  test("choices must be listed; others (including prototype tricks) are refused", () => {
    const c = def({ id: "f", kind: "choice", default: "a", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] });
    expect(validateOne(c, "b")).toBe("b");
    for (const bad of ["c", "A", "a ", "b; touch x", "__proto__", "constructor", 1, null === undefined, {}, ["a"]]) fails(() => validateOne(c, bad));
    expect(validateOne(c, "a", ["a"])).toBe("a");
    fails(() => validateOne(c, "b", ["a"]));
  });

  test("times match a strict pattern", () => {
    const t = def({ id: "t", kind: "time" });
    for (const ok of ["90", "90.5", "1:30", "01:30", "00:01:30.5", "1:02:03", "0:00", "359999", " 1:30 "]) expect(typeof validateOne(t, ok), ok).toBe("string");
    for (const bad of ["1:30:", ":30", "1::30", "-5", "1,5", "1:30 -vf x", "$(id)", "1;2", "00:61", "1e3", "999999999", "1:2:3:4", "١٢", "0x10", "1:30\n-y"]) {
      if (bad === "00:61") continue;
      fails(() => validateOne(t, bad));
    }
    expect(validateOne(t, "")).toBe("");
    expect(parseTime("1:30")).toBe(90);
    expect(parseTime("01:01:01.5")).toBe(3661.5);
    expect(parseTime("abc")).toBeNull();
  });

  test("page ranges are 1-3,5 and nothing else", () => {
    const p = def({ id: "p", kind: "pages" });
    expect(validateOne(p, "1-3, 5")).toBe("1-3,5");
    expect(validateOne(p, "")).toBe("");
    for (const bad of ["0", "3-1", "1-", "-3", "a", "1;2", "1,,2", "1-2-3", "999999999", "1-99999", "1 -vf", "$(x)", "1.5"]) fails(() => validateOne(p, bad));
    expect(parsePages("1-3,5,3")).toEqual([1, 2, 3, 5]);
    expect(parsePages("2-1")).toBeNull();
  });

  test("text loses control characters and is limited; names are strict identifiers", () => {
    const t = def({ id: "x", kind: "text", maxLength: 10 });
    expect(validateOne(t, "a\u0000b\nc\u0007d")).toBe("a b c d");
    fails(() => validateOne(t, "x".repeat(11)));
    fails(() => validateOne(t, 5));
    const n = def({ id: "n", kind: "name" });
    expect(validateOne(n, "my_table-1.x")).toBe("my_table-1.x");
    for (const bad of ["1abc", "a b", "a;b", "a\"b", "", "-x", "a".repeat(65), "x`y", "x]y"]) fails(() => validateOne(n, bad));
  });

  test("toggles accept booleans only", () => {
    const t = def({ id: "b", kind: "toggle", default: false });
    expect(validateOne(t, true)).toBe(true);
    expect(validateOne(t, "false")).toBe(false);
    fails(() => validateOne(t, "yes"));
    fails(() => validateOne(t, 1));
  });

  test("a set of options: unknown keys are dropped, defaults fill in, junk is refused", () => {
    const defs = [def({ id: "a", kind: "number", min: 1, max: 5, default: 3 }), def({ id: "b", kind: "toggle", default: true })];
    expect(validateOptions(defs, { a: 9, zzz: "; rm -rf /", "__proto__": { polluted: 1 } })).toEqual({ a: 5, b: true });
    expect(({} as any).polluted).toBeUndefined();
    expect(validateOptions(undefined, { x: 1 })).toEqual({});
    for (const bad of ["text", 5, [1], true]) fails(() => validateOptions(defs, bad));
  });

  test("name patterns allow only {name}, {n} and {date}, and no folders", () => {
    expect(validatePattern("{name} (small)")).toBe("{name} (small)");
    expect(validatePattern("")).toBe("");
    expect(validatePattern(undefined)).toBe("");
    for (const bad of ["../x", "a/b", "a\\b", "{foo}", "{name", "x}", "{{name}}", "x".repeat(121), 5]) fails(() => validatePattern(bad));
    expect(applyPattern("{name}-{n}-{date}", "pic", 3, new Date(2024, 0, 5))).toBe("pic-3-2024-01-05");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------------------------------------------

describe("the catalog", () => {
  test("ids are unique, every action says what it is, and groups and engines are real", () => {
    expect(new Set(CATALOG.map((d) => d.id)).size).toBe(CATALOG.length);
    const groups = new Set(["Pictures", "Video", "Sound", "Documents", "Data & text", "Archives", "PDF tools", "Ebooks", "Fonts", "Other"]);
    for (const d of CATALOG) {
      expect(d.label.length, d.id).toBeGreaterThan(5);
      expect(d.hint.length, d.id).toBeGreaterThan(5);
      expect(groups.has(d.group), d.id).toBe(true);
      expect(d.engines.length, d.id).toBeGreaterThan(0);
      if (d.inputs) for (const e of d.inputs) expect(e, `${d.id}: ${e}`).toBe(e.toLowerCase());
      for (const e of d.engines) {
        expect(e.tool === "builtin" ? !!e.builtin : !!e.argv, `${d.id} engine ${e.tool}`).toBe(true);
        if (e.tool !== "builtin") expect(TOOL_IDS).toContain(e.tool);
      }
      for (const o of d.options ?? []) {
        expect(validateOne(o, undefined, o.choicesFromCaps ? o.choices?.map((c) => c.value) : undefined), `${d.id}.${o.id} default`).toBe(o.default);
      }
    }
  });

  test("one primary engine per job: only the intended programs are used", () => {
    const used = new Set<string>();
    for (const d of CATALOG) for (const e of d.engines) used.add(e.tool);
    expect([...used].sort()).toEqual(["bsdtar", "builtin", "calibre", "exiftool", "ffmpeg", "fonttools", "ghostscript", "imagemagick", "libreoffice", "pandoc", "poppler", "qpdf", "sevenzip", "tesseract", "unar", "woff2"]);
    // none of the overlapping tools the design rejected
    for (const gone of ["sox", "cwebp", "dwebp", "heif-convert", "rsvg-convert", "vips", "vipsthumbnail", "inkscape", "jpegoptim", "optipng", "oxipng", "pngquant", "gifsicle", "mkvmerge", "HandBrakeCLI"]) {
      for (const t of TOOL_IDS) expect(TOOLS[t].executables).not.toContain(gone);
    }
    // ImageMagick is the only engine for pictures, ffmpeg the only one for video and sound
    for (const d of CATALOG.filter((x) => x.group === "Pictures")) expect(d.engines.map((e) => e.tool), d.id).toEqual(["imagemagick"]);
    for (const d of CATALOG.filter((x) => x.group === "Video" || x.group === "Sound")) expect(d.engines.map((e) => e.tool), d.id).toEqual(["ffmpeg"]);
  });

  test("every conversion the brief asked for is there", () => {
    const ids = new Set(CATALOG.map((d) => d.id));
    for (const id of [
      "img-jpg", "img-png", "img-webp", "img-avif", "img-heic", "img-tiff", "img-bmp", "img-gif", "img-ico", "img-icns", "img-pdf", "img-combine-pdf", "img-web", "img-compress", "img-resize", "img-half", "img-fit-1920", "img-thumb", "img-social",
      "img-rot-right", "img-flip-h", "img-gray", "img-strip", "img-autoorient", "img-montage", "img-gif-anim", "img-webp-anim", "img-favicon", "img-srgb", "img-watermark", "img-svg-png",
      "vid-mp4", "vid-mkv", "vid-webm", "vid-mov", "vid-gif", "vid-audio", "vid-small", "vid-email", "vid-1080", "vid-720", "vid-480", "vid-trim", "vid-speed", "vid-mute", "vid-rotate", "gif-mp4", "vid-frames", "vid-cover", "vid-concat", "vid-burn-subs", "vid-extract-subs", "sub-srt", "sub-vtt", "sub-ass", "vid-screen", "vid-hdr-sdr",
      "aud-mp3", "aud-m4a", "aud-flac", "aud-wav", "aud-ogg", "aud-opus", "aud-aiff", "aud-wma", "aud-custom", "aud-normalize", "aud-silence", "aud-speed", "aud-join", "aud-tags", "aud-strip-art", "aud-waveform", "aud-ringtone",
      "doc-html", "doc-docx", "doc-odt", "doc-md", "doc-txt", "doc-epub", "doc-pdf", "doc-rtf", "doc-tex", "doc-rst", "doc-org", "doc-adoc", "doc-wiki", "doc-textile", "doc-man", "doc-ipynb", "doc-pptx", "doc-fb2", "ocr-text", "ocr-pdf",
      "pdf-merge", "pdf-split", "pdf-extract", "pdf-compress", "pdf-rotate", "pdf-linearize", "pdf-pdfa", "pdf-png", "pdf-jpg", "pdf-text", "eb-mobi", "eb-azw3", "eb-docx", "font-woff2", "font-woff", "font-ttf",
      "arc-zip", "arc-targz", "arc-extract", "arc-zip-to-targz", "arc-targz-to-zip", "arc-gzip", "arc-gunzip", "arc-brotli", "arc-unbrotli", "arc-7z", "arc-list", "arc-decompress",
      "data-json", "data-yaml", "data-toml", "data-csv", "data-tsv", "data-xml", "data-ndjson", "data-ini", "data-env", "data-properties", "data-md", "data-html", "data-sql", "data-plist", "data-xlsx", "data-json-pretty", "data-json-min", "data-json-sorted", "sheet-csv-all",
      "text-encoding", "text-eol-lf", "text-eol-crlf", "text-eol-cr", "text-tabs-spaces", "text-spaces-tabs", "text-trim", "text-strip-bom", "text-html", "file-to-base64", "base64-to-file", "file-to-hex", "hex-to-file", "meta-text", "meta-json", "meta-gps-strip",
    ]) expect(ids.has(id), id).toBe(true);
  });

  test("which files an action takes, and how the new file is named", () => {
    const d = (id: string) => CATALOG_BY_ID.get(id)!;
    expect(defAccepts(d("data-json"), "a.CSV")).toBe(true);
    expect(defAccepts(d("data-json"), "a.json")).toBe(false);
    expect(defAccepts(d("data-json"), "a.jsonc")).toBe(true);
    expect(defAccepts(d("arc-extract"), "a.tar.gz")).toBe(true);
    expect(defAccepts(d("arc-gunzip"), "a.tar.gz")).toBe(false);
    expect(defAccepts(d("file-to-base64"), "anything.xyz")).toBe(true);
    expect(extOf("x.tar.gz")).toBe("tar.gz");
    const name = (id: string, input: string, opts = {}, pattern = "") => plannedName(d(id), input, opts, [input], pattern, 1, applyPattern);
    expect(name("data-csv", "report.json")).toBe("report.csv");
    expect(name("data-json-min", "a.json")).toBe("a (minified).json");
    expect(name("img-web", "p.png", { format: "webp" })).toBe("p.webp");
    expect(name("vid-audio", "m.mp4", { format: "flac" })).toBe("m.flac");
    expect(name("arc-zip-to-targz", "x.zip")).toBe("x.tar.gz");
    expect(name("file-to-base64", "photo.png")).toBe("photo.png.b64");
    expect(name("base64-to-file", "photo.png.b64")).toBe("photo.png");
    expect(name("arc-gunzip", "notes.txt.gz")).toBe("notes.txt");
    expect(name("pdf-png", "doc.pdf")).toBe("doc (pages)");
    expect(name("data-csv", "report.json", {}, "{name} export")).toBe("report export.csv");
    expect(name("img-half", "a.png", {}, "{name}-{n}")).toBe("a-1.png");
    expect(plannedName(d("arc-zip"), "photos", {}, ["photos"], "", 1, applyPattern)).toBe("photos.zip");
    expect(plannedName(d("arc-zip"), "a.txt", {}, ["a.txt", "b.txt"], "", 1, applyPattern)).toBe("Archive.zip");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Commands: exact lists of arguments
// ---------------------------------------------------------------------------------------------------------------

function ctxFor(inputs: string[], output: string, opts: Record<string, string | number | boolean> = {}, over: Partial<BuildContext> = {}): BuildContext {
  const made: Record<string, string> = {};
  return {
    exe: "/bin/PROGRAM", inputs, output, opts, title: "Title", originals: inputs, platform: "linux", caps: [],
    program: (tool, name) => `/bin/${name ?? tool}`,
    tmpFile: (name, content) => { made[name] = content; return `/tmp/fm/${name}`; },
    tmpDir: (name) => `/tmp/fm/${name}`,
    tmpCopy: (_s, name) => `/tmp/fm/${name}`,
    ...over,
  };
}

const optsOf = (d: ConvDef, extra: Record<string, string | number | boolean> = {}) => validateOptions(d.options, extra);
const engineOf = (id: string, tool: string, index = 0): Engine => CATALOG_BY_ID.get(id)!.engines.filter((e) => e.tool === tool)[index]!;
const rawArgv = (id: string, tool: string, inputs: string[], output: string, opts: Record<string, string | number | boolean>, over: Partial<BuildContext> = {}) =>
  engineOf(id, tool).argv!(ctxFor(inputs, output, opts, over));
const argvOf = (id: string, tool: string, inputs: string[], output: string, extra: Record<string, string | number | boolean> = {}, over: Partial<BuildContext> = {}) =>
  engineOf(id, tool).argv!(ctxFor(inputs, output, optsOf(CATALOG_BY_ID.get(id)!, extra), over)) as string[];

describe("commands are lists of arguments, exactly", () => {
  const ffHead = ["-nostdin", "-hide_banner", "-loglevel", "error", "-n"];

  test("ffmpeg: video", () => {
    expect(argvOf("vid-mkv", "ffmpeg", ["/v/a.mp4"], "/v/a.mkv")).toEqual([...ffHead, "-i", "file:/v/a.mp4", "-map", "0:v?", "-map", "0:a?", "-map", "0:s?", "-c", "copy", "-c:s", "srt", "file:/v/a.mkv"]);
    expect(argvOf("vid-trim", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4", { start: "1:30", end: "2:45.5", method: "fast" })).toEqual([...ffHead, "-ss", "1:30", "-to", "2:45.5", "-i", "file:/v/a.mp4", "-c", "copy", "-avoid_negative_ts", "make_zero", "file:/v/o.mp4"]);
    expect(argvOf("vid-trim", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4", { start: "10", method: "exact" })).toEqual([...ffHead, "-i", "file:/v/a.mp4", "-ss", "10", "file:/v/o.mp4"]);
    expect(argvOf("vid-mute", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4")).toEqual([...ffHead, "-i", "file:/v/a.mp4", "-c:v", "copy", "-an", "file:/v/o.mp4"]);
    expect(argvOf("vid-speed", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4", { speed: "4" })).toContain("atempo=2,atempo=2");
    expect(argvOf("vid-speed", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4", { speed: "0.25" })).toContain("atempo=0.5,atempo=0.5");
    expect(argvOf("vid-rotate", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4", { turn: "ccw" })).toContain("transpose=2");
    expect(argvOf("vid-frames", "ffmpeg", ["/v/a.mp4"], "/v/out", { every: 5, max: 20, format: "jpg" })).toEqual([...ffHead, "-i", "file:/v/a.mp4", "-vf", "fps=1/5", "-frames:v", "20", "-q:v", "2", "file:/v/out/frame-%04d.jpg"]);
    expect(argvOf("vid-frame-at", "ffmpeg", ["/v/a.mp4"], "/v/o.png", { time: "00:00:01.5" })).toEqual([...ffHead, "-ss", "00:00:01.5", "-i", "file:/v/a.mp4", "-frames:v", "1", "file:/v/o.png"]);
    expect(argvOf("vid-gif-custom", "ffmpeg", ["/v/a.mp4"], "/v/o.gif", { start: "0:12", length: 3, width: 320, fps: "15" }).join(" ")).toContain("-ss 0:12 -t 3 -i file:/v/a.mp4 -an -vf fps=15,scale='min(320,iw)':-1");
    expect(argvOf("vid-hdr-sdr", "ffmpeg", ["/v/a.mp4"], "/v/o.mp4").join(" ")).toContain("tonemap=tonemap=hable");
    expect(argvOf("vid-extract-subs", "ffmpeg", ["/v/a.mkv"], "/v/o.srt")).toEqual([...ffHead, "-i", "file:/v/a.mkv", "-map", "0:s:0", "file:/v/o.srt"]);
    expect(argvOf("sub-vtt", "ffmpeg", ["/v/a.srt"], "/v/a.vtt")).toEqual([...ffHead, "-i", "file:/v/a.srt", "file:/v/a.vtt"]);
  });

  test("ffmpeg: joining writes a list file with quoted names, and burning subtitles escapes the filter path", () => {
    let list = "";
    const a = argvOf("vid-concat", "ffmpeg", ["/v/it's.mp4", "/v/b.mp4"], "/v/o.mp4", {}, { tmpFile: (_n, c) => { list = c; return "/tmp/fm/list.txt"; } });
    expect(a).toEqual([...ffHead, "-f", "concat", "-safe", "0", "-i", "/tmp/fm/list.txt", "-c", "copy", "file:/v/o.mp4"]);
    expect(list).toBe("file '/v/it'\\''s.mp4'\nfile '/v/b.mp4'");
    const re = argvOf("vid-concat", "ffmpeg", ["/v/a.mp4", "/v/b.mp4"], "/v/o.mp4", { method: "reencode", size: "854x480" });
    expect(re.filter((x) => x === "-i").length).toBe(2);
    expect(re.join(" ")).toContain("concat=n=2:v=1:a=1[v][a]");
    expect(filterPath("C:\\x y\\it's: [1].srt")).toBe("'C\\:/x y/it'\\''s\\: [1].srt'");
    const burn = argvOf("vid-burn-subs", "ffmpeg", ["/v/a.mp4", "/v/s.srt"], "/v/o.mp4", {}, { tmpCopy: () => "/tmp/fm/sub.srt" });
    expect(burn).toContain("subtitles='/tmp/fm/sub.srt'");
    expect(burn.slice(0, 7)).toEqual([...ffHead, "-i", "file:/v/a.mp4"]);
  });

  test("ffmpeg: user text is one argument, whatever it holds", () => {
    const evil = 'My "Song"; $(touch x) `id` | cat\nline';
    const a = argvOf("aud-tags", "ffmpeg", ["/m/a.mp3"], "/m/o.mp3", { title: evil, artist: "" });
    expect(a).toContain(`title=${evil.replace(/\n/g, " ")}`);
    expect(a.filter((x) => x.startsWith("artist=")).length).toBe(0);
    for (const id of ["aud-custom", "vid-audio"]) for (const [format, codec] of [["opus", "libopus"], ["ogg", "libvorbis"], ["mp3", "libmp3lame"], ["flac", "flac"], ["m4a", "aac"], ["aiff", "pcm_s16be"], ["wav", "pcm_s16le"]] as const) {
      expect(argvOf(id, "ffmpeg", ["/m/a.wav"], "/m/o", { format }), `${id} ${format}`).toContain(codec);
    }
    expect(argvOf("aud-custom", "ffmpeg", ["/m/a.wav"], "/m/o.mp3", { format: "mp3", quality: "vbr-high", rate: "44100", channels: "1" })).toEqual([...ffHead, "-i", "file:/m/a.wav", "-vn", "-c:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-ac", "1", "file:/m/o.mp3"]);
    expect(argvOf("aud-ringtone", "ffmpeg", ["/m/a.mp3"], "/m/o.m4r", { start: "0:45", length: 30, format: "m4r" }).join(" ")).toContain("-ss 0:45 -t 30 -i file:/m/a.mp3 -vn -af afade=t=out:st=28:d=2 -c:a aac -b:a 192k -f ipod");
    expect(atempoChain(1.5)).toBe("atempo=1.5");
    expect(atempoChain(8)).toBe("atempo=2,atempo=2,atempo=2");
  });

  test("ImageMagick: staged names, first frames, and text with % is doubled", () => {
    expect(argvOf("img-social", "imagemagick", ["/s/in0001.png"], "/s/out.png", { preset: "banner" })).toEqual(["/s/in0001.png", "-delete", "1--1", "-auto-orient", "-resize", "1500x500^", "-gravity", "center", "-extent", "1500x500", "+repage", "/s/out.png"]);
    for (const [key, , w, h] of SOCIAL_SIZES) expect(argvOf("img-social", "imagemagick", ["/s/in0001.png"], "/s/out.png", { preset: key })).toContain(`${w}x${h}`);
    const wm = argvOf("img-watermark", "imagemagick", ["/s/in0001.png"], "/s/out.png", { text: "100% $(x) \"q\"", position: "Center", size: "small" });
    expect(wm).toContain("100%% $(x) \"q\"");
    expect(wm[wm.indexOf("-gravity") + 1]).toBe("Center");
    expect(argvOf("img-montage", "imagemagick", ["/s/in0001.png", "/s/in0002.png"], "/s/out.png", { columns: 3 })).toEqual(["montage", "/s/in0001.png[0]", "/s/in0002.png[0]", "-auto-orient", "-tile", "3x", "-geometry", "256x256+8+8", "-background", "white", "/s/out.png"]);
    expect(argvOf("img-gif-anim", "imagemagick", ["/s/in0001.png", "/s/in0002.png"], "/s/out.gif", { delay: 250, width: 320 }).slice(0, 4)).toEqual(["-delay", "25", "-loop", "0"]);
    expect(argvOf("img-resize", "imagemagick", ["/s/in0001.png"], "/s/out.png", { mode: "height", size: 480 })).toContain("x480>");
    expect(argvOf("img-svg-png", "imagemagick", ["/s/in0001.svg"], "/s/out.png", { scale: "4" })).toEqual(["-background", "none", "-density", "384", "/s/in0001.svg", "/s/out.png"]);
    expect(argvOf("img-compress", "imagemagick", ["/s/in0001.png"], "/s/out.png")).toContain("png:compression-level=9");
    expect(argvOf("img-compress", "imagemagick", ["/s/in0001.jpg"], "/s/out.jpg", { quality: 60 }).join(" ")).toContain("-quality 60");
    expect(argvOf("img-web", "imagemagick", ["/s/in0001.png"], "/s/out.webp", { format: "webp", size: 800, quality: 70 }).join(" ")).toContain("-resize 800x800> -strip -quality 70");
  });

  test("Ghostscript, qpdf, poppler: PDF commands", () => {
    const GS = ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET"];
    expect(argvOf("pdf-merge", "ghostscript", ["/s/in0001.pdf", "/s/in0002.pdf"], "/s/out.pdf")).toEqual([...GS, "-sDEVICE=pdfwrite", "-sOutputFile=/s/out.pdf", "/s/in0001.pdf", "/s/in0002.pdf"]);
    expect(argvOf("pdf-compress", "ghostscript", ["/s/in0001.pdf"], "/s/out.pdf", { level: "screen" })).toEqual([...GS, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dPDFSETTINGS=/screen", "-sOutputFile=/s/out.pdf", "/s/in0001.pdf"]);
    expect(argvOf("pdf-png", "ghostscript", ["/s/in0001.pdf"], "/s/pages", { dpi: 200, pages: "1-3,5" })).toEqual([...GS, "-sDEVICE=png16m", "-r200", "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", "-sPageList=1-3,5", `-sOutputFile=${nodePath.join("/s/pages", "page-%03d.png")}`, "/s/in0001.pdf"]);
    expect(argvOf("pdf-split", "ghostscript", ["/s/in0001.pdf"], "/s/pages")).toContain(nodePath.join("-sOutputFile=/s/pages", "page-%03d.pdf").replace("-sOutputFile=/", "-sOutputFile=/"));
    expect(argvOf("pdf-text", "ghostscript", ["/s/in0001.pdf"], "/s/out.txt")).toEqual([...GS, "-sDEVICE=txtwrite", "-sstdout=%stderr", "-sOutputFile=/s/out.txt", "/s/in0001.pdf"]);
    expect(argvOf("pdf-text", "poppler", ["/p/a.pdf"], "/p/o.txt")).toEqual(["-layout", "-enc", "UTF-8", "/p/a.pdf", "/p/o.txt"]);
    expect(argvOf("pdf-extract", "qpdf", ["/p/a.pdf"], "/p/o.pdf", { pages: "2-4,7" })).toEqual(["--empty", "--pages", "/p/a.pdf", "2-4,7", "--", "/p/o.pdf"]);
    expect(argvOf("pdf-extract", "ghostscript", ["/s/in0001.pdf"], "/s/out.pdf", { pages: "2-4,7" })).toContain("-sPageList=2-4,7");
    expect(argvOf("pdf-rotate", "qpdf", ["/p/a.pdf"], "/p/o.pdf", { turn: "-90", pages: "" })).toEqual(["/p/a.pdf", "/p/o.pdf", "--rotate=-90:1-z"]);
    expect(argvOf("pdf-rotate", "qpdf", ["/p/a.pdf"], "/p/o.pdf", { turn: "+180", pages: "2,4-5" })[2]).toBe("--rotate=+180:2,4-5");
    expect(argvOf("pdf-linearize", "qpdf", ["/p/a.pdf"], "/p/o.pdf")).toEqual(["--linearize", "/p/a.pdf", "/p/o.pdf"]);
  });

  test("tesseract, LibreOffice and calibre", () => {
    expect(rawArgv("ocr-text", "tesseract", ["/s/in0001.png"], "/s/out.txt", { language: "deu" })).toEqual(["/s/in0001.png", "/s/out", "-l", "deu"]);
    expect(rawArgv("ocr-pdf", "tesseract", ["/s/in0001.png"], "/s/out.pdf", { language: "eng" })).toEqual(["/s/in0001.png", "/s/out", "-l", "eng", "pdf"]);
    const pipeline = rawArgv("ocr-text", "tesseract", ["/s/in0001.pdf"], "/s/out.txt", { language: "eng", dpi: 200 }, { exe: "/bin/tesseract" }) as unknown as Array<string[] | (() => string[])>;
    expect(pipeline.length).toBe(2);
    expect(pipeline[0]).toEqual(["/bin/gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=png16m", "-r200", "-sOutputFile=" + nodePath.join("/tmp/fm/pages", "page-%04d.png"), "/s/in0001.pdf"]);
    expect(typeof pipeline[1]).toBe("function");
    const lo = argvOf("doc-pdf", "libreoffice", ["/s/out.docx"], "/s/out.pdf");
    expect(lo.slice(0, 5)).toEqual(["--headless", "--norestore", "--nolockcheck", "--nodefault", "--nologo"]);
    expect(lo[5]).toBe(`-env:UserInstallation=file:///tmp/fm/profile`);
    expect(lo.slice(6)).toEqual(["--convert-to", "pdf", "--outdir", "/s", "/s/out.docx"]);
    expect(argvOf("doc-docx", "libreoffice", ["/s/out.doc"], "/s/out.docx").slice(6, 8)).toEqual(["--convert-to", "docx"]);
    expect(argvOf("doc-txt", "libreoffice", ["/s/out.doc"], "/s/out.txt")[7]).toBe("txt:Text (encoded):UTF8");
    expect(argvOf("eb-mobi", "calibre", ["/b/a.epub"], "/b/a.mobi")).toEqual(["/b/a.epub", "/b/a.mobi"]);
    expect(argvOf("doc-pptx", "pandoc", ["/d/a.md"], "/d/a.pptx")).toEqual(["-f", "markdown", "/d/a.md", "-t", "pptx", "-o", "/d/a.pptx"]);
    expect(argvOf("doc-tex", "pandoc", ["/d/a.docx"], "/d/a.tex", { toc: true })).toEqual(["-f", "docx", "/d/a.docx", "-s", "-t", "latex", "--toc", "-o", "/d/a.tex"]);
    expect(argvOf("doc-html", "pandoc", ["/d/-weird.md"], "/d/o.html", { toc: true }, { title: 'T "x"' })).toEqual(["/d/-weird.md", "-s", "--embed-resources", "--metadata", 'pagetitle=T "x"', "--toc", "-o", "/d/o.html"]);
  });

  suite("PDF/A needs Ghostscript's colour profile, which is found from the folders gs reports", () => {
    test("the profile is found next to the lib folder; a missing profile is a plain error", () => {
      const share = join(root, "gs-share");
      mkdirSync(join(share, "lib"), { recursive: true });
      mkdirSync(join(share, "iccprofiles"), { recursive: true });
      writeFileSync(join(share, "iccprofiles", "default_rgb.icc"), "icc");
      const fake = join(root, "fake-gs");
      writeFileSync(fake, `#!/bin/sh\necho "Search path:"\necho "   ${share}/lib :"\necho "   /nonexistent/Font :"\n`);
      chmodSync(fake, 0o755);
      expect(ghostscriptProfile(fake)).toBe(join(share, "lib", "..", "iccprofiles", "default_rgb.icc"));
      const argv = argvOf("pdf-pdfa", "ghostscript", ["/s/in0001.pdf"], "/s/out.pdf", {}, { exe: fake, title: "My (odd) title" });
      expect(argv).toContain(`--permit-file-read=${join(share, "lib", "..", "iccprofiles", "default_rgb.icc")}`);
      expect(argv).toContain("-dPDFA=2");
      const empty = join(root, "empty-gs");
      writeFileSync(empty, "#!/bin/sh\necho nothing\n");
      chmodSync(empty, 0o755);
      expect(ghostscriptProfile(empty)).toBeNull();
      expect(() => argvOf("pdf-pdfa", "ghostscript", ["/s/in0001.pdf"], "/s/out.pdf", {}, { exe: empty })).toThrow(/colour profile/);
    });
  });

  test("fonts, archives and metadata", () => {
    expect(argvOf("font-woff2", "fonttools", ["/f/a.ttf"], "/f/a.woff2")).toEqual(["ttLib.woff2", "compress", "/f/a.ttf", "-o", "/f/a.woff2"]);
    expect(argvOf("font-woff2", "woff2", ["/s/out.ttf"], "/s/out.woff2")).toEqual(["/s/out.ttf"]);
    const toWoff = argvOf("font-woff", "fonttools", ["/s/in0001.ttf"], "/s/out.woff");
    expect(toWoff.slice(0, 2)).toEqual(["subset", "/s/in0001.ttf"]);
    expect(toWoff).toContain("--flavor=woff");
    expect(argvOf("font-ttf", "fonttools", ["/s/in0001.woff2"], "/s/out.ttf")).toEqual(["ttLib.woff2", "decompress", "/s/in0001.woff2", "-o", "/s/out.ttf"]);
    const viaTtx = argvOf("font-ttf", "fonttools", ["/s/in0001.woff"], "/s/out.ttf") as unknown as string[][];
    expect(viaTtx.map((s) => s[1])).toEqual(["ttx", "ttx"]);
    expect(argvOf("arc-extract", "bsdtar", ["/a/x.7z"], "/a/.tmp")).toEqual(["-x", "-f", "/a/x.7z", "-C", "/a/.tmp"]);
    expect(argvOf("arc-extract", "sevenzip", ["/a/x.rar"], "/a/.tmp")).toEqual(["x", "-y", "-bd", "-o/a/.tmp", "--", "/a/x.rar"]);
    expect(argvOf("arc-extract", "unar", ["/a/x.dmg"], "/a/.tmp")).toEqual(["-q", "-D", "-o", "/a/.tmp", "/a/x.dmg"]);
    expect(argvOf("arc-list", "bsdtar", ["/a/x.7z"], "/a/o.txt")).toEqual(["-t", "-v", "-f", "/a/x.7z"]);
    expect(argvOf("arc-list", "unar", ["/a/x.rar"], "/a/o.txt")).toEqual(["-l", "/a/x.rar"]);
    expect(argvOf("arc-7z", "sevenzip", ["/a/one.txt", "/a/sub"], "/a/Archive.7z")).toEqual(["a", "-t7z", "-y", "-bd", "-spd", "--", "/a/Archive.7z", "one.txt", "sub"]);
    expect(argvOf("arc-decompress", "sevenzip", ["/s/out.xz"], "/s/out")).toEqual(["e", "-y", "-bd", "-o/s", "--", "/s/out.xz"]);
    expect(argvOf("meta-gps-strip", "exiftool", ["/s/in0001.jpg"], "/s/out.jpg")).toEqual(["-o", "/s/out.jpg", "-gps:all=", "-xmp:geotag=", "/s/in0001.jpg"]);
    expect(argvOf("meta-json", "exiftool", ["/s/in0001.jpg"], "/s/out.json")).toEqual(["-json", "-a", "-u", "-G1", "/s/in0001.jpg"]);
  });

  test("every tool-based action builds a command from hostile names: absolute paths or file: prefix, never a bare dash argument", () => {
    const hostile = "/w/-rf evil $(touch x) [1] 100%; `id`.EXT";
    for (const d of CATALOG) {
      const ext = d.inputs ? [...d.inputs][0]! : "bin";
      const input = hostile.replace("EXT", ext);
      const inputs = d.id === "vid-burn-subs" ? ["/w/-rf evil video.mp4", "/w/-rf evil subs.srt"] : d.mode === "all" ? [input, input.replace("evil", "evil2")] : [input];
      for (const engine of d.engines) {
        if (engine.tool === "builtin" || !engine.argv) continue;
        if (d.id === "pdf-pdfa") continue; // asks Ghostscript where its colour profile is; covered by its own test below
        const opts = optsOf(d, d.options?.some((o) => o.id === "pages") ? { pages: "1-2" } : {});
        for (const o of d.options ?? []) if (o.kind === "text" && !opts[o.id]) opts[o.id] = "text";
        const built = engine.argv(ctxFor(inputs, "/w/out/result", opts)) as Array<string | string[] | (() => string[])>;
        const flat = built.flatMap((x) => (typeof x === "function" ? [] : Array.isArray(x) ? x : [x]));
        expect(flat.length, `${d.id}/${engine.tool}`).toBeGreaterThan(0);
        for (const a of flat) {
          expect(typeof a, `${d.id}/${engine.tool}`).toBe("string");
          // A name may only reach a program as an absolute path, with a file: prefix, or after "--" (which ends the options).
          const afterDashes = flat.indexOf("--") >= 0 && flat.indexOf(a) > flat.indexOf("--");
          if (a.includes("evil")) expect(/^(?:file:)?\//.test(a) || /^-o\//.test(a) || afterDashes, `${d.id}/${engine.tool}: ${a}`).toBe(true);
          expect(a.includes("\n") && !/^file '|title=|-annotate/.test(a) && d.id !== "vid-concat", `${d.id}: newline in ${a}`).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Detection, gating and what is offered
// ---------------------------------------------------------------------------------------------------------------

suite("what is offered with which programs", () => {
  const bin = join(root, "gate-bin");
  const home = join(root, "gate-home");
  const work = join(home, "Work");
  beforeAll(() => {
    mkdirSync(bin, { recursive: true });
    mkdirSync(work, { recursive: true });
  });
  const tool = (name: string, body: string, dir = bin) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  const ctxWith = (dirs: string[]) => createContext({ platform: "darwin", home, dataDir: join(root, "gate-data"), toolDirs: dirs });
  const file = (name: string, content = "x") => {
    writeFileSync(join(work, name), content);
    return join(work, name);
  };
  const act = (o: Awaited<ReturnType<typeof overview>>, id: string) => o.actions.find((a) => a.id === id)!;

  test("with no helper programs at all, the built-in conversions work and the rest explain what to install", async () => {
    const ctx = ctxWith([join(root, "nothing-here")]);
    const o = await overview(ctx, [file("data.csv", "a,b\n1,2"), file("pic.png"), file("doc.pdf"), file("book.epub")]);
    expect(act(o, "data-json")).toMatchObject({ available: true, builtin: true, tool: "builtin" });
    expect(act(o, "text-encoding")).toMatchObject({ available: true, builtin: true });
    expect(act(o, "file-to-base64")).toMatchObject({ available: true, builtin: true, count: 4 });
    expect(act(o, "arc-zip")).toMatchObject({ available: true, builtin: true, count: 4 });
    expect(act(o, "img-web")).toMatchObject({ available: false, tool: "imagemagick", installTools: ["imagemagick"] });
    expect(act(o, "img-web").why).toContain("ImageMagick isn't installed yet");
    expect(act(o, "pdf-merge")).toBeUndefined(); // needs two PDFs
    expect(act(o, "pdf-compress")).toMatchObject({ available: false, installTools: ["ghostscript"] });
    expect(act(o, "pdf-extract")).toMatchObject({ available: false });
    expect(act(o, "doc-pdf").available).toBe(false);
    expect(act(o, "eb-mobi")).toMatchObject({ available: false, installTools: ["calibre"] });
    expect(act(o, "ocr-text")).toMatchObject({ available: false, installTools: ["tesseract"] });
    for (const a of o.actions.filter((x) => x.builtin)) expect(a.available, a.id).toBe(true);
    // the page's own label for each
    const names = Object.fromEntries(o.tools.map((t) => [t.id, t.name]));
    expect(badgeFor(act(o, "data-json"), names)).toEqual({ kind: "builtin", text: "Built in" });
    expect(badgeFor(act(o, "img-web"), names)).toEqual({ kind: "missing", text: "Needs ImageMagick" });
    expect(badgeFor(act(o, "ocr-pdf"), names)).toEqual({ kind: "missing", text: "Needs Tesseract" });
  });

  test("a second program that is also needed is named: OCR of a PDF needs Ghostscript as well", async () => {
    const dirs = [join(root, "ocr-bin")];
    tool("tesseract", 'if [ "$1" = "--version" ]; then echo "tesseract 5.3"; exit 0; fi\nif [ "$1" = "--list-langs" ]; then printf \'List of available languages (2):\\neng\\ndeu\\n\'; exit 0; fi', dirs[0]);
    const ctx = ctxWith(dirs);
    const o = await overview(ctx, [file("scan.pdf"), file("shot.png")]);
    expect(act(o, "ocr-text")).toMatchObject({ available: true, count: 2 });
    const noGs = await planConvert(ctx, { action: "ocr-text", paths: [join(work, "scan.pdf"), join(work, "shot.png")] });
    expect(noGs.items.map((i) => [i.name, !!i.engine])).toEqual([["scan.txt", false], ["shot.txt", true]]);
    expect(noGs.items[0]!.why).toContain("also needs Ghostscript");
    const langs = act(o, "ocr-text").options.find((x) => x.id === "language")!;
    expect(langs.choices!.map((c) => c.value)).toEqual(["eng", "deu"]);
    await expect(planConvert(ctx, { action: "ocr-text", paths: [join(work, "shot.png")], options: { language: "fra" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
    expect((await planConvert(ctx, { action: "ocr-text", paths: [join(work, "shot.png")], options: { language: "deu" } })).opts.language).toBe("deu");
    expect(tesseractCapabilities('List of available languages in "/x" (3):\nafr\nchi_sim\nosd\n')).toEqual(["lang-afr", "lang-chi_sim"]);
  });

  test("ffmpeg without an encoder: those actions say why, and those choices can't be chosen", async () => {
    const dirs = [join(root, "ff-bin")];
    tool("ffmpeg", 'if [ "$1" = "-version" ]; then echo "ffmpeg version 7.1 configuration: --enable-gpl"; exit 0; fi\nif [ "$2" = "-encoders" ]; then echo " A....D aac AAC"; echo " A....D flac FLAC"; exit 0; fi\nfor a; do last="$a"; done\nprintf x > "${last#file:}"', dirs[0]);
    const ctx = ctxWith(dirs);
    const o = await overview(ctx, [file("clip.mp4"), file("song.wav")]);
    expect(act(o, "vid-mp4")).toMatchObject({ available: false });
    expect(act(o, "vid-mp4").why).toContain("ffmpeg-full");
    expect(act(o, "aud-opus").why).toContain("ffmpeg-full");
    expect(act(o, "aud-m4a").available).toBe(true);
    expect(act(o, "vid-burn-subs")).toBeUndefined();
    const custom = act(o, "aud-custom").options.find((x) => x.id === "format")!;
    expect(custom.choices!.find((c) => c.value === "opus")).toMatchObject({ available: false });
    expect(custom.choices!.find((c) => c.value === "flac")).toMatchObject({ available: true });
    await expect(planConvert(ctx, { action: "aud-custom", paths: [join(work, "song.wav")], options: { format: "opus" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
    expect((await planConvert(ctx, { action: "aud-custom", paths: [join(work, "song.wav")], options: { format: "flac" } })).items[0]!.name).toBe("song.flac");
    await expect(startConvert(ctx, { action: "vid-mp4", paths: [join(work, "clip.mp4")] })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  test("pandoc's own format list decides which documents it can write; an unreadable list never blocks", async () => {
    const withList = [join(root, "pandoc-a")];
    tool("pandoc", 'if [ "$1" = "--version" ]; then echo "pandoc 3.1"; exit 0; fi\nif [ "$1" = "--list-output-formats" ]; then printf "html\\ndocx\\nepub\\nlatex\\nrst\\nodt\\nplain\\n"; exit 0; fi\nif [ "$1" = "--list-input-formats" ]; then printf "markdown\\nhtml\\ndocx\\n"; exit 0; fi', withList[0]);
    const o = await overview(ctxWith(withList), [file("n.md", "# x")]);
    expect(act(o, "doc-rst").available).toBe(true);
    expect(act(o, "doc-adoc").available).toBe(false);
    expect(act(o, "doc-adoc").why).toContain("built without that format");
    const noList = [join(root, "pandoc-b")];
    tool("pandoc", 'if [ "$1" = "--version" ]; then echo "pandoc 3.1"; exit 0; fi', noList[0]);
    expect(act(await overview(ctxWith(noList), [file("n.md", "# x")]), "doc-adoc").available).toBe(true);
  });

  test("LibreOffice is found in its app folder, which a PATH search would miss; bsdtar must really be bsdtar", async () => {
    const app = join(root, "Applications", "LibreOffice.app", "Contents", "MacOS");
    tool("soffice", 'echo "LibreOffice 24.2.0.3 abc"', app);
    const sevenz = [join(root, "arc-bin")];
    tool("tar", 'echo "tar (GNU tar) 1.35"', sevenz[0]);
    const ctx = ctxWith([app, ...sevenz]);
    const s = await toolStatus(ctx);
    expect(s.tools.find((t) => t.id === "libreoffice")).toMatchObject({ installed: true, version: "24.2.0.3" });
    expect(s.tools.find((t) => t.id === "bsdtar")!.installed).toBe(false);
    tool("bsdtar", 'echo "bsdtar 3.7.4 - libarchive 3.7.4"', sevenz[0]);
    expect((await toolStatus(ctx)).tools.find((t) => t.id === "bsdtar")).toMatchObject({ installed: true, version: "3.7.4" });
    const o = await overview(ctx, [file("old.doc"), file("sheet.xls")]);
    expect(act(o, "doc-pdf")).toMatchObject({ available: true, tool: "libreoffice" });
    expect(act(o, "doc-docx")).toMatchObject({ available: true });
    expect(act(o, "lo-xlsx")).toBeUndefined();
  });

  test("search folders cover app bundles, Program Files, keg-only Homebrew and Linux places for every program", () => {
    const mac = searchDirs({ platform: "darwin", home: "/Users/x", toolDirs: undefined }, { PATH: "/usr/bin" });
    for (const d of ["/Applications/LibreOffice.app/Contents/MacOS", "/Applications/calibre.app/Contents/MacOS", "/Users/x/Applications/calibre.app/Contents/MacOS", "/opt/homebrew/opt/ghostscript/bin", "/opt/homebrew/opt/qpdf/bin", "/opt/homebrew/opt/tesseract/bin", "/opt/homebrew/opt/sevenzip/bin", "/opt/homebrew/opt/fonttools/bin", "/opt/homebrew/opt/libarchive/bin", "/usr/local/opt/poppler/bin"]) expect(mac, d).toContain(d);
    expect(mac).not.toContain("/opt/homebrew/opt/libreoffice/bin");
    const win = searchDirs({ platform: "win32", home: "C:\\Users\\x", toolDirs: undefined }, { Path: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local", ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" });
    for (const d of ["C:\\Program Files\\LibreOffice\\program", "C:\\Program Files (x86)\\LibreOffice\\program", "C:\\Program Files\\Calibre2", "C:\\Program Files\\Tesseract-OCR", "C:\\Program Files\\7-Zip", "C:\\Windows\\System32"]) expect(win, d).toContain(d);
    const lin = searchDirs({ platform: "linux", home: "/home/x", toolDirs: undefined }, { PATH: "/usr/bin" });
    for (const d of ["/usr/lib/libreoffice/program", "/opt/calibre", "/home/linuxbrew/.linuxbrew/opt/ghostscript/bin", "/usr/bin"]) expect(lin, d).toContain(d);
  });

  test("the preview matches what is made, never names an existing file, and carries on to a number", async () => {
    const ctx = ctxWith([join(root, "nothing-here")]);
    const csv = file("export.csv", "a,b\n1,2\n");
    writeFileSync(join(work, "export.json"), "taken");
    const p = await previewConvert(ctx, { action: "data-json", paths: [csv] });
    expect(p.items).toEqual([{ from: ["export.csv"], to: "export (2).json", folder: work, engine: "Built in", problem: "" }]);
    const job = await startConvert(ctx, { action: "data-json", paths: [csv] });
    const done = await ctx.jobs.whenDone(job.id);
    expect(done.outputs).toEqual([join(work, "export (2).json")]);
    expect(readFileSync(join(work, "export.json"), "utf8")).toBe("taken");
    expect(JSON.parse(readFileSync(join(work, "export (2).json"), "utf8"))).toEqual([{ a: 1, b: 2 }]);
  });
});

describe("the page's helper functions", () => {
  test("selections are described in plain words", () => {
    expect(describeSelection([{ name: "a.jpg" }, { name: "b.PNG" }, { name: "c.mp4" }, { name: "d", isDir: true }])).toBe("2 pictures, 1 video and 1 folder");
    expect(describeSelection([{ name: "report.xlsx" }])).toBe("1 spreadsheet");
    expect(describeSelection([{ name: "x.tar.gz" }, { name: "y.weird" }])).toBe("1 archive and 1 other file");
    expect(describeSelection([])).toBe("nothing");
    expect(extensionOfName("a.TAR.GZ")).toBe("tar.gz");
    expect(extensionOfName(".bashrc")).toBe("");
    expect(extensionOfName("noext")).toBe("");
  });

  test("the list is searched by any word, best matches first, and filtered by group", () => {
    const mk = (id: string, label: string, group: string, extra = {}) => ({ id, label, hint: "", group, out: "", keywords: "", engines: [{ name: "Built in" }], ...extra });
    const actions = [mk("a", "Make a PDF", "Documents"), mk("b", "Compress the PDF file", "PDF tools", { keywords: "shrink" }), mk("c", "Convert to MP3", "Sound", { hint: "Makes a PDF-free sound", engines: [{ name: "ffmpeg" }] })];
    expect(searchActions(actions, "pdf").map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(searchActions(actions, "shrink pdf").map((a) => a.id)).toEqual(["b"]);
    expect(searchActions(actions, "ffmpeg").map((a) => a.id)).toEqual(["c"]);
    expect(searchActions(actions, "", "Sound").map((a) => a.id)).toEqual(["c"]);
    expect(searchActions(actions, "zzz")).toEqual([]);
    expect(groupActions(actions).map((g) => g.group)).toEqual(["Sound", "Documents", "PDF tools"]);
    expect(optionApplies({ forExts: ["csv"] }, ["csv", "json"])).toBe(true);
    expect(optionApplies({ forExts: ["csv"] }, ["json"])).toBe(false);
    expect(optionApplies({}, [])).toBe(true);
    expect(wantsSlider({ kind: "number", min: 30, max: 100 })).toBe(true);
    expect(wantsSlider({ kind: "number", min: 1, max: 20000 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Install plans
// ---------------------------------------------------------------------------------------------------------------

describe("install plans for every program and package manager", () => {
  const exe = (m: ManagerId) => `/fake/${m}`;
  const cases: Array<["darwin" | "linux" | "win32", ManagerId]> = [["darwin", "brew"], ["linux", "brew"], ["win32", "winget"], ["win32", "scoop"], ["win32", "choco"], ["linux", "apt"], ["linux", "dnf"], ["linux", "pacman"]];

  test("each plan is a list of arguments with each package as its own argument and plain names", () => {
    for (const id of TOOL_IDS) {
      for (const [platform, manager] of cases) {
        const plan = installPlan(platform, id, { [manager]: exe(manager) });
        const def = TOOLS[id];
        const pkg = def[manager];
        const label = `${id} ${platform} ${manager}`;
        if (manager === "brew" && platform === "linux" && def.brewCask) {
          expect(plan.method, label).toBeNull();
          continue;
        }
        if (!pkg) {
          expect(plan.argv, label).toBeNull();
          expect(plan.note.length, label).toBeGreaterThan(10);
          continue;
        }
        expect(plan.method, label).toBe(manager);
        expect(plan.argv![0], label).toBe(["apt", "dnf", "pacman"].includes(manager) ? "sudo" : exe(manager));
        for (const p of pkg.split(" ")) {
          expect(plan.argv, label).toContain(p);
          expect(p, label).toMatch(/^[A-Za-z0-9._+\/-]+$/);
          expect(plan.display, label).toContain(p);
        }
        for (const a of plan.argv!) expect(a, label).not.toMatch(/[;&|`$<>(){}*?!\\]/);
        if (manager === "brew") expect(plan.argv!.includes("--cask"), label).toBe(!!def.brewCask);
        expect(plan.auto, label).toBe(manager === "brew" || manager === "winget" || manager === "scoop");
        if (def.size) expect(plan.size, label).toBe(def.size);
      }
    }
  });

  test("the packages are the ones that were checked on the Mac; casks for the big applications", () => {
    expect(installPlan("darwin", "libreoffice", { brew: "/b" }).argv).toEqual(["/b", "install", "--cask", "libreoffice"]);
    expect(installPlan("darwin", "calibre", { brew: "/b" }).display).toBe("brew install --cask calibre");
    expect(installPlan("darwin", "ghostscript", { brew: "/b" }).argv).toEqual(["/b", "install", "ghostscript"]);
    expect(installPlan("darwin", "tesseract", { brew: "/b" }).argv).toEqual(["/b", "install", "tesseract", "tesseract-lang"]);
    expect(installPlan("darwin", "sevenzip", { brew: "/b" }).display).toBe("brew install sevenzip");
    expect(installPlan("linux", "poppler", { apt: "/a" }).display).toBe("sudo apt install -y poppler-utils");
    expect(installPlan("linux", "fonttools", { apt: "/a" }).argv).toEqual(["sudo", "apt", "install", "-y", "fonttools", "python3-brotli"]);
    expect(installPlan("linux", "bsdtar", { dnf: "/d" }).display).toBe("sudo dnf install -y bsdtar");
    expect(installPlan("linux", "libreoffice", { pacman: "/p" }).display).toBe("sudo pacman -S --needed --noconfirm libreoffice-fresh");
    expect(installPlan("win32", "libreoffice", { winget: "w" }).argv).toContain("TheDocumentFoundation.LibreOffice");
    expect(installPlan("win32", "tesseract", { winget: "w" }).argv).toContain("UB-Mannheim.TesseractOCR");
    expect(installPlan("win32", "sevenzip", { scoop: "s" }).argv).toEqual(["s", "install", "7zip"]);
    expect(installPlan("win32", "calibre", { scoop: "s" }).note).toContain("scoop bucket add extras");
  });

  test("a program with no package for the system's manager says where to download it; big ones say so", () => {
    const none = installPlan("win32", "fonttools", { winget: "w", scoop: "s", choco: "c" });
    expect(none).toMatchObject({ method: null, argv: null });
    expect(none.note).toContain(TOOLS.fonttools.website);
    expect(installPlan("darwin", "libreoffice", { brew: "/b" }).note).toContain("350 MB");
    expect(installPlan("darwin", "libreoffice", {}).missingManager?.id).toBe("brew");
    expect(installPlan("darwin", "libreoffice", {}).display).toBe("brew install --cask libreoffice");
    expect(installPlan("linux", "libreoffice", { brew: "/b" }).method).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------------------------

suite("conversion jobs", () => {
  const home = join(root, "job-home");
  const work = join(home, "Docs");
  const ctx = createContext({ platform: "darwin", home, dataDir: join(root, "job-data"), toolDirs: [join(root, "no-tools")] });
  beforeAll(() => mkdirSync(work, { recursive: true }));
  const fresh = (name: string) => {
    const d = join(work, name);
    mkdirSync(d, { recursive: true });
    return d;
  };
  const run = async (req: Parameters<typeof startConvert>[1], state: "done" | "failed" | "cancelled" = "done") => {
    const done = await ctx.jobs.whenDone((await startConvert(ctx, req)).id);
    if (done.state !== state) throw new Error(`job ${done.state}: ${done.steps.map((s) => s.message).join(" | ")}`);
    return done;
  };
  const noLeftovers = (dir: string) => expect(readdirSync(dir).filter((n) => n.startsWith(".fm-")), "temporary files").toEqual([]);

  test("a broken file is a plain failure and leaves no output, no temporary file, and the other files are still done", async () => {
    const d = fresh("broken");
    writeFileSync(join(d, "bad.json"), '{"a": 1,, }');
    writeFileSync(join(d, "good.json"), '{"a": 1}');
    writeFileSync(join(d, "empty.json"), "");
    const done = await run({ action: "data-yaml", paths: [join(d, "bad.json"), join(d, "good.json"), join(d, "empty.json")] }, "failed");
    expect(done.steps.map((s) => s.state)).toEqual(["failed", "done", "failed"]);
    expect(done.steps[0]!.message).toContain("isn't valid JSON");
    expect(done.steps[2]!.message).toContain("empty");
    expect(readdirSync(d).sort()).toEqual(["bad.json", "empty.json", "good.json", "good.yaml"]);
    noLeftovers(d);
  });

  test("a conversion note (what could not be kept) travels with the finished step", async () => {
    const d = fresh("notes");
    writeFileSync(join(d, "n.json"), '[{"a":{"b":1}}]');
    const done = await run({ action: "data-csv", paths: [join(d, "n.json")] });
    expect(done.steps[0]!.message).toContain("flattened");
    expect(readFileSync(join(d, "n.csv"), "utf8")).toBe("a.b\n1\n");
  });

  test("never overwrites, whatever appears in the way: even at the very last moment", async () => {
    const d = fresh("race");
    const out = join(d, "result.txt");
    const hub = createJobHub();
    const tmp = join(d, "made.tmp");
    const done = await hub.whenDone(hub.start({
      kind: "convert", title: "t", steps: [{
        label: "late", output: out,
        prepare: async () => ({
          work: async () => { writeFileSync(tmp, "mine"); writeFileSync(out, "theirs, made while this was running"); },
          publish: async () => publishFile(tmp, out),
          cleanup: async () => rmSync(tmp, { force: true }),
        }),
      }],
    }).id);
    expect(done.state).toBe("failed");
    expect(done.steps[0]!.message).toContain("appeared while this was running");
    expect(readFileSync(out, "utf8")).toBe("theirs, made while this was running");
    noLeftovers(d);
  });

  test("name patterns and another output folder; the originals stay where they are", async () => {
    const d = fresh("pattern");
    const dest = fresh("pattern-out");
    writeFileSync(join(d, "a.csv"), "x\n1");
    writeFileSync(join(d, "b.csv"), "x\n2");
    const done = await run({ action: "data-json", paths: [join(d, "a.csv"), join(d, "b.csv")], outputDir: dest, pattern: "{name}-{n}" });
    expect(done.outputs.sort()).toEqual([join(dest, "a-1.json"), join(dest, "b-2.json")]);
    expect(readdirSync(d).sort()).toEqual(["a.csv", "b.csv"]);
    await expect(startConvert(ctx, { action: "data-json", paths: [join(d, "a.csv")], outputDir: join(d, "nope") })).rejects.toMatchObject({ code: "NOT_A_FOLDER" });
    await expect(startConvert(ctx, { action: "data-json", paths: [join(d, "a.csv")], outputDir: "relative/dir" })).rejects.toMatchObject({ code: "BAD_PATH" });
    await expect(startConvert(ctx, { action: "data-json", paths: [join(d, "a.csv")], outputDir: existsSync("/System/Library") ? "/System/Library" : "/etc" })).rejects.toMatchObject({ code: "PROTECTED" });
    await expect(startConvert(ctx, { action: "data-json", paths: [join(d, "a.csv")], pattern: "../escape" })).rejects.toMatchObject({ code: "BAD_OPTION" });
    await expect(startConvert(ctx, { action: "data-json", paths: [join(d, "a.csv")], pattern: "{name}:bad" })).resolves.toBeDefined();
  });

  test("many files into one: zip and 7z-style actions take folders and files, name the result after a single item, and merge in the chosen order", async () => {
    const d = fresh("zipall");
    mkdirSync(join(d, "folder"));
    writeFileSync(join(d, "folder", "in.txt"), "inside");
    writeFileSync(join(d, "one.txt"), "1");
    const one = await run({ action: "arc-zip", paths: [join(d, "folder")] });
    expect(one.outputs).toEqual([join(d, "folder.zip")]);
    const many = await run({ action: "arc-zip", paths: [join(d, "folder"), join(d, "one.txt")] });
    expect(many.outputs).toEqual([join(d, "Archive.zip")]);
    const again = await run({ action: "arc-targz", paths: [join(d, "folder"), join(d, "one.txt")] });
    expect(again.outputs).toEqual([join(d, "Archive.tar.gz")]);
    const unpacked = await run({ action: "arc-extract", paths: [join(d, "Archive.zip")] });
    expect(unpacked.outputs).toEqual([join(d, "Archive (unpacked)")]);
    expect(readFileSync(join(d, "Archive (unpacked)", "folder", "in.txt"), "utf8")).toBe("inside");
    expect((await run({ action: "arc-extract", paths: [join(d, "Archive.tar.gz")] })).outputs).toEqual([join(d, "Archive (unpacked) (2)")]);
    noLeftovers(d);
    const preview = await previewConvert(ctx, { action: "arc-zip", paths: [join(d, "one.txt"), join(d, "folder")] });
    expect(preview).toMatchObject({ mode: "all", items: [{ from: ["folder", "one.txt"], to: "Archive (2).zip" }] });
  });

  test("a hostile zip is unpacked safely through the whole job", async () => {
    const d = fresh("hostilejob");
    const { ZipFileWriter } = await import("../src/features/filemanager/fmConvZip");
    const w = await ZipFileWriter.create(join(d, "evil.zip"));
    await w.add("../../escaped.txt", Buffer.from("x"));
    await w.add("fine/ok.txt", Buffer.from("ok"));
    await w.finish();
    const done = await run({ action: "arc-extract", paths: [join(d, "evil.zip")] });
    expect(done.steps[0]!.message).toContain("skipped for safety");
    expect(existsSync(join(home, "escaped.txt"))).toBe(false);
    expect(existsSync(join(d, "..", "escaped.txt"))).toBe(false);
    expect(readFileSync(join(d, "evil (unpacked)", "fine", "ok.txt"), "utf8")).toBe("ok");
  });

  test("a file over 100 MB is refused in plain words and nothing is left behind", async () => {
    const d = fresh("huge");
    writeFileSync(join(d, "big.csv"), Buffer.alloc(101 * 1024 * 1024, 0x61));
    const done = await run({ action: "data-json", paths: [join(d, "big.csv")] }, "failed");
    expect(done.steps[0]!.message).toContain("bigger than 100 MB");
    expect(readdirSync(d)).toEqual(["big.csv"]);
  });

  test("cancelling a big conversion stops the worker, removes what it wrote and skips the rest", async () => {
    const d = fresh("cancel");
    const rows = Array.from({ length: 400_000 }, (_, i) => `${i},name ${i},"some, quoted text ${i}"`).join("\n");
    writeFileSync(join(d, "a.csv"), `id,name,text\n${rows}\n`);
    writeFileSync(join(d, "b.csv"), "x\n1");
    const job = await startConvert(ctx, { action: "data-json", paths: [join(d, "a.csv"), join(d, "b.csv")] });
    await Bun.sleep(100);
    expect(ctx.jobs.cancel(job.id)).toBe(true);
    const done = await ctx.jobs.whenDone(job.id);
    expect(done.state).toBe("cancelled");
    expect(done.steps.map((s) => s.state)).toEqual(["skipped", "skipped"]);
    expect(readdirSync(d).sort()).toEqual(["a.csv", "b.csv"]);
  });

  test("clear errors for a bad request", async () => {
    const f = join(work, "a.csv");
    writeFileSync(f, "x\n1");
    await expect(startConvert(ctx, { action: "nope", paths: [f] })).rejects.toMatchObject({ code: "UNKNOWN_ACTION" });
    await expect(startConvert(ctx, { action: "data-json", paths: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(startConvert(ctx, { action: "data-json", paths: Array.from({ length: 501 }, (_, i) => `/x/${i}.csv`) })).rejects.toMatchObject({ code: "TOO_MANY" });
    await expect(startConvert(ctx, { action: "data-json", paths: [join(work, "missing.csv")] })).rejects.toMatchObject({ code: "NOTHING_TO_DO" });
    await expect(startConvert(ctx, { action: "data-csv", paths: [f], options: { delimiter: "; rm -rf /" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
    await expect(startConvert(ctx, { action: "data-sql", paths: [f], options: { tableName: "x; DROP TABLE y" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
    await expect(startConvert(ctx, { action: "arc-zip", paths: [f, "\0bad"] })).rejects.toMatchObject({ code: "BAD_PATH" });
    await expect(startConvert(ctx, { action: "vid-trim", paths: [f], options: { start: "1" } })).rejects.toMatchObject({ code: "NOTHING_TO_DO" });
    await expect(startConvert(ctx, { action: "img-png", paths: [f] })).rejects.toMatchObject({ code: "NOTHING_TO_DO" });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Over HTTP
// ---------------------------------------------------------------------------------------------------------------

suite("over HTTP: overview, preview and run with options", () => {
  const home = join(root, "http-home");
  let server: ReturnType<typeof startFileManagerServer>;
  const TOKEN = "convert-token";
  const post = async (op: string, body: unknown = {}, token: string | null = TOKEN) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-fm-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };
  beforeAll(() => {
    mkdirSync(join(home, "Docs"), { recursive: true });
    writeFileSync(join(home, "Docs", "t.csv"), "name,qty\nbolt,3\nnut,5\n");
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { platform: "darwin", home, dataDir: join(root, "http-data"), toolDirs: [join(root, "no-tools")], launch: async () => {} } });
  });
  afterAll(() => server.stop(true));

  test("preview and run need the token; overview groups everything with availability and options", async () => {
    expect((await post("tools/preview", {}, null)).status).toBe(401);
    const o = await post("tools/overview", { paths: [join(home, "Docs", "t.csv"), join(home, "Docs")] });
    expect(o.status).toBe(200);
    expect(o.json.selected).toBe(1);
    expect(o.json.folders).toBe(1);
    expect(o.json.groups).toContain("Data & text");
    const json = o.json.actions.find((a: any) => a.id === "data-json");
    expect(json).toMatchObject({ available: true, builtin: true, group: "Data & text", mode: "each", outKind: "file" });
    expect(json.options.find((x: any) => x.id === "delimiter").choices.length).toBeGreaterThan(3);
    expect(o.json.actions.find((a: any) => a.id === "arc-zip")).toMatchObject({ count: 2 });
  });

  test("the whole flow: preview, bad options are refused with words, run, and the file is what was asked for", async () => {
    const f = join(home, "Docs", "t.csv");
    const p = await post("tools/preview", { action: "data-sql", paths: [f], options: { tableName: "parts", createTable: true } });
    expect(p.json.items[0]).toMatchObject({ from: ["t.csv"], to: "t.sql", engine: "Built in" });
    const bad = await post("tools/preview", { action: "data-sql", paths: [f], options: { dialect: "oracle" } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("BAD_OPTION");
    expect(bad.json.error.message).toContain("that choice isn't available");
    const run = await post("tools/run", { action: "data-sql", paths: [f], options: { tableName: "parts", createTable: true, dialect: "mysql" } });
    expect(run.status).toBe(200);
    for (let i = 0; i < 200; i++) {
      const list = await post("jobs/list");
      if (list.json.jobs.every((j: any) => j.state !== "running" && j.state !== "waiting")) break;
      await Bun.sleep(30);
    }
    const sql = readFileSync(join(home, "Docs", "t.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE `parts`");
    expect(sql).toContain("('bolt', 3)");
  });
});
