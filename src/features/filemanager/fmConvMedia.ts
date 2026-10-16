/**
 * The catalog of picture, video and sound conversions. ImageMagick is the one engine for pictures, ffmpeg the one
 * engine for video and sound. Every command is a list of arguments (never a shell line); anything the person types
 * (times, text) has been checked by `fmConvOptions.ts` and is passed as a single argument.
 */
import { optNum, optStr, parseTime, type OptionValues } from "./fmConvOptions";
import { choiceOpt, exts, numberOpt, textOpt, timeOpt, toggleOpt, type BuildContext, type ConvDef, type Engine, type Need } from "./fmConvTypes";

export const IMG_IN = exts("jpg jpeg png gif webp bmp tif tiff heic heif avif ico svg");
export const IMG_RASTER = exts("jpg jpeg png gif webp bmp tif tiff heic heif avif ico");
export const VID_IN = exts("mp4 mov mkv avi webm m4v wmv flv mpg mpeg 3gp ts");
export const AUD_IN = exts("mp3 wav flac aac m4a ogg opus wma aiff aif");
export const SUB_IN = exts("srt vtt ass ssa");

export const extOfPath = (p: string) => p.split(".").pop()!.toLowerCase();

// ---------------------------------------------------------------------------------------------------------------
// Pictures: ImageMagick
// ---------------------------------------------------------------------------------------------------------------

/** What ImageMagick needs to be able to open a kind of picture. */
const IM_READ: Record<string, string> = { heic: "read-heic", heif: "read-heic", avif: "read-avif", svg: "read-svg", webp: "read-webp", tif: "read-tiff", tiff: "read-tiff", pdf: "read-pdf", jxl: "read-jxl" };

/** The capabilities for opening this kind of file and (optionally) writing the output kind. */
export const imNeeds = (write?: string) => (ext: string): Need => [write, IM_READ[ext]].filter((x): x is string => !!x);

export const FIRST_FRAME = ["-delete", "1--1"];
const FLATTEN = ["-background", "white", "-alpha", "remove", "-alpha", "off"];

export const im = (argv: (c: BuildContext) => string[], write?: string, extra: Partial<Engine> = {}): Engine => ({ tool: "imagemagick", stage: true, needs: imNeeds(write), argv, ...extra });
/** input, middle arguments, output */
export const imSimple = (middle: string[]) => (c: BuildContext) => [c.inputs[0]!, ...middle, c.output];

export const pic = (id: string, label: string, hint: string, out: string | ConvDef["out"], suffix: string, engines: Engine[], extra: Partial<ConvDef> = {}): ConvDef => ({
  id, label, hint, group: "Pictures", inputs: IMG_IN, out, suffix, mode: "each", engines, ...extra,
});

const fit = (px: number) => ["-resize", `${px}x${px}>`];

export const SOCIAL_SIZES: Array<[string, string, number, number]> = [
  ["square", "Square post (1080 × 1080)", 1080, 1080],
  ["story", "Story or reel (1080 × 1920)", 1080, 1920],
  ["landscape", "Link preview / Facebook (1200 × 630)", 1200, 630],
  ["banner", "Banner / X header (1500 × 500)", 1500, 500],
  ["youtube", "YouTube thumbnail (1280 × 720)", 1280, 720],
  ["avatar", "Profile picture (400 × 400)", 400, 400],
];

export const GRAVITY: Array<[string, string]> = [["SouthEast", "Bottom right"], ["SouthWest", "Bottom left"], ["NorthEast", "Top right"], ["NorthWest", "Top left"], ["Center", "Middle"], ["South", "Bottom middle"], ["North", "Top middle"]];

const FRAME_OPTIONS = [numberOpt("delay", "Time for each picture", "", 40, 5000, 500, "milliseconds", 10), numberOpt("width", "Width", "Pictures wider than this are shrunk.", 100, 2000, 640, "pixels", 10)];

export const PICTURE_DEFS: ConvDef[] = [
  pic("img-jpg", "Convert to JPG", "The most common picture format; small files.", "jpg", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...FLATTEN, "-quality", "90"]), "jpeg")]),
  pic("img-png", "Convert to PNG", "Sharp pictures that keep see-through areas.", "png", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient"]), "png")]),
  pic("img-webp", "Convert to WebP", "Small pictures for websites.", "webp", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-quality", "85"]), "webp")]),
  pic("img-avif", "Convert to AVIF", "Even smaller than WebP for the same look. Newer programs only.", "avif", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-quality", "60"]), "avif")], { rejectSame: true }),
  pic("img-heic", "Convert to HEIC", "The format iPhones use; small files.", "heic", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-quality", "80"]), "heic")], { rejectSame: true }),
  pic("img-tiff", "Convert to TIFF", "For printing and archives; no quality is lost.", "tiff", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-compress", "LZW"]), "tiff")]),
  pic("img-bmp", "Convert to BMP", "An old, plain format that every program opens.", "bmp", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...FLATTEN]), "bmp")], { rejectSame: true }),
  pic("img-gif", "Convert to GIF", "Up to 256 colours. Moving pictures keep moving.", "gif", "converted", [im(imSimple(["-auto-orient", "-layers", "optimize"]), "gif")], { rejectSame: true }),
  pic("img-ico", "Make an icon (.ico)", "A Windows icon with the usual sizes.", "ico", "icon", [im(imSimple([...FIRST_FRAME, "-define", "icon:auto-resize=256,128,64,48,32,16"]), "ico")]),
  pic("img-favicon", "Make a favicon (16, 32 and 48 px)", "The small icon for a website's tab: one .ico with three sizes.", "ico", "favicon", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-background", "none", "-resize", "256x256", "-define", "icon:auto-resize=48,32,16"]), "ico")], { keywords: "website tab icon" }),
  pic("img-icns", "Make a Mac icon (.icns)", "An app icon for macOS.", "icns", "icon", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-background", "none", "-resize", "512x512", "-gravity", "center", "-extent", "512x512"]), "icns")]),
  pic("img-pdf", "Make a PDF (one for each picture)", "Each picture becomes its own PDF.", "pdf", "converted", [im(imSimple([...FIRST_FRAME, "-auto-orient"]), "pdf")]),
  pic("img-combine-pdf", "Combine into one PDF", "All the selected pictures, in name order, become pages of one PDF.", "pdf", "combined", [im((c) => [...c.inputs, "-auto-orient", c.output], "pdf")], { mode: "all", allName: "Combined pictures", minFiles: 2, keywords: "merge pages" }),

  pic("img-svg-png", "Turn a drawing (SVG) into a sharp PNG", "Choose how large the picture should be.", "png", "converted", [im((c) => ["-background", "none", "-density", String(96 * optNum(c.opts, "scale")), c.inputs[0]!, c.output], "png")], {
    inputs: exts("svg"), options: [choiceOpt("scale", "Size", "Bigger drawings are sharper but make a larger file.", [["1", "Normal (as drawn)"], ["2", "Twice as big"], ["4", "Four times as big"]], "2")], keywords: "vector svg raster",
  }),
  pic("img-web", "Make a web-sized picture", "Smaller in pixels and in file size, with the hidden camera details removed.", (o) => (o.format === "png" ? "png" : o.format === "webp" ? "webp" : "jpg"), "web", [im((c) => {
    const f = optStr(c.opts, "format");
    const q = String(optNum(c.opts, "quality"));
    const n = optNum(c.opts, "size");
    return [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-resize", `${n}x${n}>`, "-strip", ...(f === "jpg" ? [...FLATTEN, "-sampling-factor", "4:2:0", "-interlace", "Plane", "-quality", q] : f === "webp" ? ["-quality", q] : ["-define", "png:compression-level=9"]), c.output];
  }, undefined, { needs: (ext, o) => [o.format === "webp" ? "webp" : o.format === "png" ? "png" : "jpeg", IM_READ[ext]].filter((x): x is string => !!x) })], {
    options: [
      choiceOpt("format", "Format", "JPG works everywhere, WebP is smaller.", [["jpg", "JPG"], ["webp", "WebP", "webp"], ["png", "PNG"]], "jpg"),
      numberOpt("size", "Longest side", "The picture is shrunk to fit this many pixels (never enlarged).", 100, 8000, 1920, "pixels", 10),
      numberOpt("quality", "Quality", "Higher looks better and makes a bigger file. 80 to 85 is a good balance.", 30, 100, 82, "%"),
    ],
    keywords: "compress optimise optimize resize website email", makes: "web-sized copy",
  }),
  pic("img-compress", "Make the file smaller (same format)", "Removes hidden details and squeezes JPG, PNG and WebP files. The size in pixels stays the same.", "", "smaller", [im((c) => {
    const ext = extOfPath(c.inputs[0]!);
    const q = String(optNum(c.opts, "quality"));
    return [c.inputs[0]!, "-auto-orient", "-strip", ...(ext === "png" ? ["-define", "png:compression-level=9", "-define", "png:compression-strategy=1"] : ext === "jpg" || ext === "jpeg" ? ["-sampling-factor", "4:2:0", "-interlace", "Plane", "-quality", q] : ["-quality", q]), c.output];
  })], {
    inputs: exts("jpg jpeg png webp"), options: [numberOpt("quality", "Quality", "For JPG and WebP. PNG files are never made blurrier.", 30, 100, 80, "%")], keywords: "compress optimise optimize shrink",
  }),
  pic("img-resize", "Resize…", "Choose the new size yourself.", "", "resized", [im((c) => {
    const n = optNum(c.opts, "size");
    const m = optStr(c.opts, "mode");
    return [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-resize", m === "width" ? `${n}x>` : m === "height" ? `x${n}>` : m === "percent" ? `${n}%` : `${n}x${n}>`, c.output];
  })], {
    options: [
      choiceOpt("mode", "Make it", "How the number below is used.", [["fit", "fit inside a square of this many pixels"], ["width", "this many pixels wide"], ["height", "this many pixels high"], ["percent", "this many percent of the size"]], "width"),
      numberOpt("size", "Number", "Pixels, or percent for the last choice.", 1, 20000, 1600, "", 1),
    ],
  }),
  pic("img-half", "Half the size (50%)", "Pictures with a quarter of the pixels.", "", "half size", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-resize", "50%"]))]),
  pic("img-quarter", "Quarter the size (25%)", "Small thumbnails.", "", "quarter size", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-resize", "25%"]))]),
  pic("img-fit-1920", "Fit within 1920 px", "Good for a full-screen picture on the web. Smaller pictures stay as they are.", "", "1920 px", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...fit(1920)]))]),
  pic("img-fit-1280", "Fit within 1280 px", "Good for email.", "", "1280 px", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...fit(1280)]))]),
  pic("img-fit-1080", "Fit within 1080 px", "Full HD height; good for slides and social posts.", "", "1080 px", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...fit(1080)]))]),
  pic("img-fit-800", "Fit within 800 px", "Small enough for a chat message.", "", "800 px", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...fit(800)]))]),
  pic("img-thumb", "Make a thumbnail (256 px)", "A small preview picture with the hidden details removed.", "", "thumbnail", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-thumbnail", "256x256>", "-strip"]))]),
  pic("img-social", "Make a social media picture", "Cuts and scales the picture to the exact size a site asks for.", "", "social", [im((c) => {
    const [, , w, h] = SOCIAL_SIZES.find((s) => s[0] === optStr(c.opts, "preset")) ?? SOCIAL_SIZES[0]!;
    return [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-resize", `${w}x${h}^`, "-gravity", "center", "-extent", `${w}x${h}`, "+repage", c.output];
  })], { options: [choiceOpt("preset", "Where will it be used?", "The middle of the picture is kept; the edges are cut.", SOCIAL_SIZES.map(([v, l]) => [v, l] as [string, string]), "square")], keywords: "instagram facebook twitter youtube avatar" }),
  pic("img-rot-right", "Rotate right", "Turn the picture a quarter turn clockwise.", "", "rotated", [im(imSimple([...FIRST_FRAME, "-rotate", "90"]))]),
  pic("img-rot-left", "Rotate left", "Turn the picture a quarter turn the other way.", "", "rotated", [im(imSimple([...FIRST_FRAME, "-rotate", "270"]))]),
  pic("img-rot-180", "Turn upside down (180°)", "Rotate the picture half a turn.", "", "rotated", [im(imSimple([...FIRST_FRAME, "-rotate", "180"]))]),
  pic("img-flip-h", "Mirror left to right", "Flip the picture like a mirror.", "", "mirrored", [im(imSimple([...FIRST_FRAME, "-flop"]))]),
  pic("img-flip-v", "Flip top to bottom", "Turn the picture over vertically.", "", "flipped", [im(imSimple([...FIRST_FRAME, "-flip"]))]),
  pic("img-autoorient", "Turn upright (use the camera's rotation)", "Fixes pictures that show sideways because of how the phone was held.", "", "upright", [im(imSimple([...FIRST_FRAME, "-auto-orient"]))]),
  pic("img-gray", "Black and white (greyscale)", "Remove the colour: shades of grey only.", "", "black and white", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-colorspace", "Gray"]))], { keywords: "grey gray greyscale grayscale monochrome mono bw" }),
  pic("img-srgb", "Convert colours to sRGB", "Makes colours look right on screens and the web (fixes printer-style CMYK pictures).", "", "sRGB", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-colorspace", "sRGB", "-strip"]))], { keywords: "cmyk colour color profile" }),
  pic("img-strip", "Remove location and camera info", "A copy without the hidden details (where and when it was taken, the camera).", "", "private", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-strip"]))], { keywords: "metadata exif privacy gps" }),
  pic("img-watermark", "Add a text watermark", "Writes a short text on each picture.", "", "watermarked", [im((c) => {
    const size = ({ small: "24", medium: "40", large: "64" } as Record<string, string>)[optStr(c.opts, "size")] ?? "40";
    return [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-gravity", optStr(c.opts, "position"), "-pointsize", size, "-fill", "rgba(255,255,255,0.85)", "-stroke", "rgba(0,0,0,0.6)", "-strokewidth", "1", "-annotate", "+20+20", optStr(c.opts, "text").replace(/%/g, "%%"), c.output];
  })], {
    options: [
      textOpt("text", "Text", "What to write on the picture.", "© My name", 60),
      choiceOpt("position", "Where", "", GRAVITY, "SouthEast"),
      choiceOpt("size", "Letter size", "", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], "medium"),
    ],
    check: (o) => (optStr(o, "text") ? null : "Type the text to write on the pictures."), keywords: "copyright stamp caption",
  }),
  pic("img-montage", "Make a contact sheet", "All the selected pictures as small previews on one sheet.", "png", "contact sheet", [{
    tool: "imagemagick", stage: true, program: "magick", needs: ["png"], argv: (c) => ["montage", ...c.inputs.map((i) => `${i}[0]`), "-auto-orient", "-tile", `${optNum(c.opts, "columns")}x`, "-geometry", "256x256+8+8", "-background", "white", c.output],
  }], { mode: "all", allName: "Contact sheet", minFiles: 2, inputs: IMG_RASTER, options: [numberOpt("columns", "Pictures in each row", "", 1, 12, 4, "", 1)], keywords: "montage overview thumbnails" }),
  pic("img-gif-anim", "Make an animated GIF from pictures", "The pictures, in name order, become the frames of a moving picture.", "gif", "animation", [im((c) => ["-delay", String(Math.max(1, Math.round(optNum(c.opts, "delay") / 10))), "-loop", "0", ...c.inputs.flatMap((i) => [`${i}[0]`, "-resize", `${optNum(c.opts, "width")}x>`]), "-layers", "optimize", c.output], "gif")], {
    mode: "all", allName: "Animation", minFiles: 2, inputs: IMG_RASTER, options: FRAME_OPTIONS, keywords: "slideshow animation",
  }),
  pic("img-webp-anim", "Make an animated WebP from pictures", "Like an animated GIF but smaller and with better colours.", "webp", "animation", [im((c) => ["-delay", String(Math.max(1, Math.round(optNum(c.opts, "delay") / 10))), "-loop", "0", ...c.inputs.flatMap((i) => [`${i}[0]`, "-resize", `${optNum(c.opts, "width")}x>`]), "-quality", "80", c.output], "webp")], {
    mode: "all", allName: "Animation", minFiles: 2, inputs: IMG_RASTER, options: FRAME_OPTIONS,
  }),
];

// ---------------------------------------------------------------------------------------------------------------
// Video: ffmpeg
// ---------------------------------------------------------------------------------------------------------------

export const BASE = ["-nostdin", "-hide_banner", "-loglevel", "error", "-n"];
/** A complete ffmpeg command: global options, then `pre` (before the input), the input, `mid` (after it), the output. */
export const ff = (c: BuildContext, pre: string[], mid: string[]): string[] => [...BASE, ...pre, "-i", `file:${c.inputs[0]}`, ...mid, `file:${c.output}`];
export const ffEngine = (argv: (c: BuildContext) => string[], needs?: Need | ((ext: string, o: OptionValues) => Need), extra: Partial<Engine> = {}): Engine => ({ tool: "ffmpeg", needs, argv, ...extra });

export const H264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p"];
export const AAC = (rate: string) => ["-c:a", "aac", "-b:a", rate];
export const FASTSTART = ["-movflags", "+faststart"];

export const vid = (id: string, label: string, hint: string, out: string | ConvDef["out"], suffix: string, engines: Engine[], extra: Partial<ConvDef> = {}): ConvDef => ({
  id, label, hint, group: "Video", inputs: VID_IN, out, suffix, mode: "each", engines, ...extra,
});

/** The atempo filters for a speed (each atempo only accepts 0.5 to 2). */
export function atempoChain(speed: number): string {
  const parts: number[] = [];
  let s = speed;
  while (s > 2) { parts.push(2); s /= 2; }
  while (s < 0.5) { parts.push(0.5); s *= 2; }
  parts.push(Math.round(s * 10000) / 10000);
  return parts.map((p) => `atempo=${p}`).join(",");
}

/** A file path inside an ffmpeg filter: backslashes, colons and quotes are special there. */
export function filterPath(p: string): string {
  return `'${p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''")}'`;
}

export const AUDIO_FORMATS: Array<[string, string, string?]> = [
  ["mp3", "MP3 (plays everywhere)", "mp3"], ["m4a", "M4A / AAC (good quality, small)"], ["flac", "FLAC (lossless)"], ["wav", "WAV (uncompressed)"],
  ["ogg", "OGG Vorbis", "vorbis"], ["opus", "Opus (best at low sizes)", "opus"], ["aiff", "AIFF (uncompressed, Apple)"],
];
const AUDIO_NEED: Record<string, string | undefined> = { mp3: "mp3", ogg: "vorbis", opus: "opus", wma: "wma" };
const audioFormatChoices = () => AUDIO_FORMATS.map(([v, l, n]) => (n ? [v, l, n] : [v, l]) as [string, string, string]);

const QUALITY_CHOICES: Array<[string, string]> = [["192k", "192 kbps (good)"], ["128k", "128 kbps (smaller)"], ["256k", "256 kbps (better)"], ["320k", "320 kbps (best)"], ["vbr-high", "Variable, high quality"], ["vbr-medium", "Variable, medium quality"]];

/** The codec and quality arguments for a sound format. */
export function audioCodecArgs(format: string, quality: string): string[] {
  const vbrHigh = quality === "vbr-high";
  const vbr = quality.startsWith("vbr");
  switch (format) {
    case "mp3": return ["-c:a", "libmp3lame", ...(vbr ? ["-q:a", vbrHigh ? "2" : "4"] : ["-b:a", quality])];
    case "m4a": case "m4r": return ["-c:a", "aac", "-b:a", vbr ? (vbrHigh ? "192k" : "128k") : quality];
    case "ogg": return ["-c:a", "libvorbis", ...(vbr ? ["-q:a", vbrHigh ? "6" : "4"] : ["-b:a", quality])];
    case "opus": return ["-c:a", "libopus", "-b:a", vbr ? (vbrHigh ? "160k" : "96k") : quality];
    case "flac": return ["-c:a", "flac"];
    case "aiff": return ["-c:a", "pcm_s16be"];
    case "wma": return ["-c:a", "wmav2", "-b:a", vbr ? (vbrHigh ? "192k" : "128k") : quality];
    default: return ["-c:a", "pcm_s16le"];
  }
}

const RATE_CHOICES: Array<[string, string]> = [["keep", "Keep as it is"], ["44100", "44.1 kHz (CD)"], ["48000", "48 kHz (video)"], ["32000", "32 kHz"], ["22050", "22 kHz (smaller)"], ["16000", "16 kHz (speech)"]];
const CHANNEL_CHOICES: Array<[string, string]> = [["keep", "Keep as it is"], ["1", "Mono"], ["2", "Stereo"]];
const rateArgs = (o: OptionValues) => [...(o.rate && o.rate !== "keep" ? ["-ar", String(o.rate)] : []), ...(o.channels && o.channels !== "keep" ? ["-ac", String(o.channels)] : [])];

const mp4Move = (c: BuildContext, vf: string, crf: string, audio: string[], preset = "medium") => ff(c, [], ["-vf", vf, ...H264, "-crf", crf, "-preset", preset, ...audio, ...FASTSTART]);

const ORDER_OPTION = choiceOpt("order", "Order", "Which one comes first.", [["name", "By name"], ["selected", "As selected"], ["modified", "By date"]], "name");

/** Pictures that ffmpeg can read for the GIF maker (it can't open HEIC, AVIF or SVG). */
const GIF_PICTURES = exts("jpg jpeg png webp bmp tif tiff");
const GIF_SHAPES: Record<string, [number, number]> = { "16:9": [16, 9], "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "9:16": [9, 16], "3:2": [3, 2] };
const MAX_GIF_SECONDS = 300;

/** The ffmpeg arguments that turn pictures and video clips, in order, into one animated GIF. */
export function gifFromMixed(c: BuildContext): string[] {
  const width = Math.round(optNum(c.opts, "width"));
  const [sw, sh] = GIF_SHAPES[optStr(c.opts, "shape")] ?? GIF_SHAPES["16:9"]!;
  const height = Math.max(2, Math.round((width * sh) / sw));
  const fps = Math.round(optNum(c.opts, "fps"));
  const still = optNum(c.opts, "still");
  const clip = optNum(c.opts, "clip");
  const isPicture = (p: string) => GIF_PICTURES.has(extOfPath(p));
  const seconds = c.inputs.reduce((sum, p) => sum + (isPicture(p) ? still : clip), 0) * (c.opts.boomerang === true ? 2 : 1);
  if (seconds > MAX_GIF_SECONDS) throw new Error(`That would be up to ${Math.round(seconds)} seconds long, and a GIF that long would be enormous. Choose fewer files, a shorter time for each, or turn off the back-and-forth.`);
  const bg = { black: "black", white: "white", gray: "gray" }[optStr(c.opts, "background")] ?? "black";
  const fill = optStr(c.opts, "fit") === "fill"
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bg}`;
  const inputs = c.inputs.flatMap((p) => (isPicture(p) ? ["-loop", "1", "-framerate", String(fps), "-t", String(still), "-i", `file:${p}`] : ["-t", String(clip), "-i", `file:${p}`]));
  const chains = c.inputs.map((_p, i) => `[${i}:v]fps=${fps},${fill},setsar=1,format=rgb24[v${i}]`);
  const joined = `${c.inputs.map((_p, i) => `[v${i}]`).join("")}concat=n=${c.inputs.length}:v=1:a=0[cat]`;
  const boomerang = c.opts.boomerang === true ? ";[cat]split[f][b];[b]reverse[r];[f][r]concat=n=2:v=1:a=0[all]" : "";
  const last = c.opts.boomerang === true ? "[all]" : "[cat]";
  const dither = { none: "none", bayer: "bayer:bayer_scale=3", smooth: "sierra2_4a" }[optStr(c.opts, "dither")] ?? "sierra2_4a";
  const palette = `;${last}split[a][b];[a]palettegen=max_colors=${Math.round(optNum(c.opts, "colors"))}[p];[b][p]paletteuse=dither=${dither}[out]`;
  const repeat = optStr(c.opts, "repeat") === "once" ? "-1" : "0";
  return [...BASE, ...inputs, "-filter_complex", `${chains.join(";")};${joined}${boomerang}${palette}`, "-map", "[out]", "-loop", repeat, "-f", "gif", `file:${c.output}`];
}

export const VIDEO_DEFS: ConvDef[] = [
  vid("gif-mixed", "Make an animated GIF from pictures and videos", "Select two or more pictures and video clips: they go, in the order you choose, into one looping GIF. (For one video, use “Make an animated GIF”.)", "gif", "animation", [ffEngine(gifFromMixed)], {
    mode: "all", allName: "Animation", minFiles: 2, inputs: new Set([...GIF_PICTURES, ...VID_IN, "gif"]),
    checkFiles: (files) => (files.length > 100 ? "Select at most 100 files for one GIF." : null),
    options: [
      numberOpt("width", "Width", "The GIF is this wide in pixels. Smaller is a much smaller file.", 100, 1280, 480, "pixels", 10),
      choiceOpt("shape", "Shape", "Every picture and clip is fitted into the same shape.", [["16:9", "Wide (16:9)"], ["3:2", "Photo (3:2)"], ["4:3", "Classic (4:3)"], ["1:1", "Square"], ["3:4", "Tall (3:4)"], ["9:16", "Phone (9:16)"]], "16:9"),
      choiceOpt("fit", "How to fit", "Show the whole picture with bars around it, or fill the shape and trim the edges.", [["whole", "Show the whole picture (bars if needed)"], ["fill", "Fill the shape (trim the edges)"]], "whole"),
      choiceOpt("background", "Bars are", "", [["black", "Black"], ["white", "White"], ["gray", "Gray"]], "black"),
      numberOpt("still", "Time for each picture", "How long every picture stays on screen.", 0.1, 10, 1.5, "seconds", 0.1),
      numberOpt("clip", "Most from each video", "A longer video is cut off after this many seconds (from its start).", 1, 60, 5, "seconds"),
      choiceOpt("fps", "Smoothness", "More pictures per second looks smoother and makes a bigger file.", [["8", "8 per second"], ["10", "10 per second"], ["12", "12 per second"], ["15", "15 per second"], ["20", "20 per second"], ["25", "25 per second"]], "12"),
      choiceOpt("colors", "Colours", "A GIF has at most 256 colours. Fewer makes a smaller file.", [["256", "256 (best look)"], ["128", "128"], ["64", "64 (smaller)"], ["32", "32 (smallest)"]], "256"),
      choiceOpt("dither", "Shading", "Smooth looks best; Pattern gives smaller files.", [["smooth", "Smooth"], ["bayer", "Pattern (smaller)"], ["none", "None (flat colours)"]], "smooth"),
      choiceOpt("repeat", "Repeat", "", [["forever", "Forever"], ["once", "Play once"]], "forever"),
      toggleOpt("boomerang", "Play it forwards, then backwards", "Makes a back-and-forth loop. It doubles the length and needs more memory.", false),
      ORDER_OPTION,
    ],
    keywords: "gif animation slideshow loop meme pictures photos clips combine add images videos",
  }),
  vid("vid-mp4", "Convert to MP4", "Plays almost everywhere.", "mp4", "converted", [ffEngine((c) => ff(c, [], ["-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]), "x264")]),
  vid("vid-mkv", "Convert to MKV (no quality loss)", "Moves the picture and sound into an MKV file without re-encoding: very fast.", "mkv", "converted", [ffEngine((c) => ff(c, [], ["-map", "0:v?", "-map", "0:a?", "-map", "0:s?", "-c", "copy", "-c:s", "srt"]))], { rejectSame: true, keywords: "matroska remux" }),
  vid("vid-mov", "Convert to MOV", "For Apple video programs.", "mov", "converted", [ffEngine((c) => ff(c, [], [...H264, "-crf", "20", "-preset", "medium", ...AAC("192k")]), "x264")], { rejectSame: true, keywords: "quicktime" }),
  vid("vid-avi", "Convert to AVI", "An old format for old players.", "avi", "converted", [ffEngine((c) => ff(c, [], ["-c:v", "mpeg4", "-q:v", "4", "-c:a", "libmp3lame", "-q:a", "4"]), "mp3")], { rejectSame: true }),
  vid("vid-webm", "Convert to WebM", "For websites. This one is slow.", "webm", "converted", [ffEngine((c) => ff(c, [], ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus"]), "vp9")]),
  vid("vid-small", "Make smaller for sharing", "A smaller MP4, at most 1280 pixels wide.", "mp4", "small", [ffEngine((c) => ff(c, [], ["-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-crf", "28", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]), "x264")], { keywords: "compress shrink whatsapp" }),
  vid("vid-email", "Make small enough for email", "A small MP4, 640 pixels wide, with mono sound.", "mp4", "email", [ffEngine((c) => mp4Move(c, "scale='min(640,iw)':-2", "31", [...AAC("80k"), "-ac", "1"]), "x264")], { keywords: "compress shrink attachment" }),
  vid("vid-tiny", "Make the smallest file", "Low picture quality, 480 pixels high. Slow, but the file is tiny.", "mp4", "tiny", [ffEngine((c) => mp4Move(c, "scale=-2:'min(480,ih)'", "35", [...AAC("64k"), "-ac", "1"], "slow"), "x264")], { keywords: "compress shrink" }),
  vid("vid-screen", "Shrink a screen recording", "Screen recordings are mostly still, so they shrink a lot with no visible loss.", "mp4", "shrunk", [ffEngine((c) => ff(c, [], ["-vf", "fps=30,scale='min(1920,iw)':-2", ...H264, "-crf", "30", "-preset", "slow", "-tune", "stillimage", ...AAC("96k"), ...FASTSTART]), "x264")], { keywords: "compress screen capture recording" }),
  vid("vid-1080", "Resize to 1080p", "Full HD, at most 1080 pixels high.", "mp4", "1080p", [ffEngine((c) => mp4Move(c, "scale=-2:'min(1080,ih)'", "23", AAC("160k")), "x264")]),
  vid("vid-720", "Resize to 720p", "HD, at most 720 pixels high.", "mp4", "720p", [ffEngine((c) => mp4Move(c, "scale=-2:'min(720,ih)'", "23", AAC("128k")), "x264")]),
  vid("vid-480", "Resize to 480p", "Standard definition, at most 480 pixels high.", "mp4", "480p", [ffEngine((c) => mp4Move(c, "scale=-2:'min(480,ih)'", "25", AAC("96k")), "x264")]),
  vid("vid-trim", "Cut out a part (trim)", "Keep only the part between two times.", "", "trimmed", [ffEngine((c) => {
    const t = [...(c.opts.start ? ["-ss", String(c.opts.start)] : []), ...(c.opts.end ? ["-to", String(c.opts.end)] : [])];
    return optStr(c.opts, "method") === "exact" ? ff(c, [], t) : ff(c, t, ["-c", "copy", "-avoid_negative_ts", "make_zero"]);
  })], {
    options: [
      timeOpt("start", "Start", "Like 1:30 or 00:01:30.5. Leave empty to start at the beginning."),
      timeOpt("end", "End", "Like 2:45. Leave empty to go to the end."),
      choiceOpt("method", "How", "Fast cuts at the nearest key moment and loses no quality; exact is slower and re-encodes.", [["fast", "Fast (may start a moment early)"], ["exact", "Exact (slower)"]], "fast"),
    ],
    check: (o) => {
      const s = o.start ? parseTime(String(o.start)) : 0;
      const e = o.end ? parseTime(String(o.end)) : null;
      if (!o.start && !o.end) return "Type a start time, an end time, or both.";
      if (e !== null && s !== null && e <= s) return "The end must be after the start.";
      return null;
    },
    keywords: "cut clip crop",
  }),
  vid("vid-speed", "Speed up or slow down", "Make the video and its sound faster or slower.", "mp4", "speed", [ffEngine((c) => {
    const s = Number(optStr(c.opts, "speed"));
    return ff(c, [], ["-vf", `setpts=PTS/${s}`, "-af", atempoChain(s), ...H264, "-crf", "23", "-preset", "medium", ...AAC("160k"), ...FASTSTART]);
  }, "x264")], { options: [choiceOpt("speed", "Speed", "", [["0.25", "Quarter speed"], ["0.5", "Half speed"], ["0.75", "Slightly slower"], ["1.25", "Slightly faster"], ["1.5", "One and a half times"], ["2", "Twice as fast"], ["3", "Three times"], ["4", "Four times"]], "2")], keywords: "timelapse slow motion" }),
  vid("vid-mute", "Remove the sound", "A copy with no sound. The picture is not re-encoded.", "", "muted", [ffEngine((c) => ff(c, [], ["-c:v", "copy", "-an"]))]),
  vid("vid-rotate", "Rotate the video", "Turn a video that was filmed sideways.", "mp4", "rotated", [ffEngine((c) => {
    const t = optStr(c.opts, "turn");
    return ff(c, [], ["-vf", t === "cw" ? "transpose=1" : t === "ccw" ? "transpose=2" : "hflip,vflip", ...H264, "-crf", "23", "-preset", "medium", "-c:a", "copy", ...FASTSTART]);
  }, "x264")], { options: [choiceOpt("turn", "Turn", "", [["cw", "A quarter turn right"], ["ccw", "A quarter turn left"], ["half", "Upside down"]], "cw")] }),
  vid("vid-gif", "Make an animated GIF", "A short silent loop, 480 pixels wide.", "gif", "animation", [ffEngine((c) => ff(c, [], ["-an", "-vf", "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse"]))]),
  vid("vid-gif-custom", "Make a GIF (choose the part and size)", "A silent loop with colours chosen for the best look.", "gif", "animation", [ffEngine((c) => {
    const pre = [...(c.opts.start ? ["-ss", String(c.opts.start)] : []), "-t", String(optNum(c.opts, "length"))];
    return ff(c, pre, ["-an", "-vf", `fps=${optNum(c.opts, "fps")},scale='min(${optNum(c.opts, "width")},iw)':-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`]);
  })], {
    options: [
      timeOpt("start", "Start", "Where the loop begins, like 0:12. Empty means the beginning."),
      numberOpt("length", "Length", "How long the loop is.", 1, 60, 6, "seconds"),
      numberOpt("width", "Width", "", 100, 1280, 480, "pixels", 10),
      choiceOpt("fps", "Smoothness", "More pictures per second looks smoother and makes a bigger file.", [["8", "8 per second"], ["12", "12 per second"], ["15", "15 per second"], ["20", "20 per second"], ["25", "25 per second"]], "12"),
    ],
    keywords: "gif loop meme",
  }),
  vid("gif-mp4", "Turn a GIF into an MP4", "Much smaller than the GIF, and it plays the same.", "mp4", "converted", [ffEngine((c) => ff(c, [], ["-an", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", ...H264, "-crf", "23", ...FASTSTART]), "x264")], { inputs: exts("gif") }),
  vid("vid-mp3", "Save the sound as MP3", "Just the audio.", "mp3", "audio", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "libmp3lame", "-q:a", "2"]), "mp3")]),
  vid("vid-audio", "Extract the sound (choose the format)", "Saves just the sound of the video as a music file.", (o) => String(o.format ?? "mp3"), "audio", [ffEngine((c) => {
    const f = optStr(c.opts, "format");
    return ff(c, [], ["-vn", ...audioCodecArgs(f, optStr(c.opts, "quality")), ...(f === "m4a" ? FASTSTART : [])]);
  }, (_e, o) => AUDIO_NEED[String(o.format)])], {
    options: [choiceOpt("format", "Format", "", audioFormatChoices(), "mp3"), choiceOpt("quality", "Quality", "For MP3, M4A, OGG and Opus.", QUALITY_CHOICES, "192k")], keywords: "audio music mp3 extract rip",
  }),
  vid("vid-cover", "Save a cover picture", "One picture from the video, as PNG.", "png", "cover", [ffEngine((c) => ff(c, [], ["-vf", "thumbnail", "-frames:v", "1"]))]),
  vid("vid-frame-at", "Save a picture from a moment", "One picture at the time you choose.", (o) => (o.format === "jpg" ? "jpg" : "png"), "frame", [ffEngine((c) => ff(c, ["-ss", String(c.opts.time || "0")], ["-frames:v", "1", ...(c.opts.format === "jpg" ? ["-q:v", "2"] : [])]))], {
    options: [timeOpt("time", "Time", "Like 1:30 or 00:01:30.5. Empty means the first picture."), choiceOpt("format", "Format", "", [["png", "PNG (sharp)"], ["jpg", "JPG (smaller)"]], "png")], keywords: "screenshot thumbnail still",
  }),
  vid("vid-frames", "Save many pictures from the video", "One picture every few seconds, in a new folder.", "", "frames", [ffEngine((c) => {
    const f = optStr(c.opts, "format");
    return [...BASE, "-i", `file:${c.inputs[0]}`, "-vf", `fps=1/${optNum(c.opts, "every")}`, "-frames:v", String(optNum(c.opts, "max")), ...(f === "jpg" ? ["-q:v", "2"] : []), `file:${c.output}/frame-%04d.${f}`];
  })], {
    outKind: "folder", options: [numberOpt("every", "A picture every", "", 1, 600, 5, "seconds"), numberOpt("max", "Most pictures", "Stops after this many.", 1, 1000, 100), choiceOpt("format", "Format", "", [["png", "PNG (sharp)"], ["jpg", "JPG (smaller)"]], "jpg")], keywords: "screenshots stills",
  }),
  vid("vid-concat", "Join videos into one", "Put the selected videos one after the other, in the order you choose.", "", "joined", [ffEngine((c) => {
    const list = c.tmpFile("list.txt", c.inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    if (optStr(c.opts, "method") !== "reencode") return [...BASE, "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", `file:${c.output}`];
    const [w, h] = optStr(c.opts, "size").split("x");
    const filters = c.inputs.map((_p, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];[${i}:a]aresample=48000[a${i}]`).join(";");
    const maps = c.inputs.map((_p, i) => `[v${i}][a${i}]`).join("");
    return [...BASE, ...c.inputs.flatMap((p) => ["-i", `file:${p}`]), "-filter_complex", `${filters};${maps}concat=n=${c.inputs.length}:v=1:a=1[v][a]`, "-map", "[v]", "-map", "[a]", ...H264, "-crf", "23", "-c:a", "aac", `file:${c.output}`];
  }, (_e, o) => (o.method === "reencode" ? "x264" : undefined))], {
    mode: "all", allName: "Joined video", minFiles: 2, options: [
      choiceOpt("method", "How", "Fast works when all the videos are the same kind (same size and format); otherwise re-encode.", [["same", "Fast: no re-encoding (videos must match)"], ["reencode", "Re-encode (every video needs sound)"]], "same"),
      choiceOpt("size", "Size, when re-encoding", "", [["1280x720", "1280 × 720"], ["1920x1080", "1920 × 1080"], ["854x480", "854 × 480"]], "1280x720"),
      ORDER_OPTION,
    ],
    keywords: "merge concatenate combine",
  }),
  vid("vid-burn-subs", "Burn subtitles into the video", "Select a video and a subtitle file (.srt, .ass, .vtt). The words become part of the picture.", "mp4", "subtitled", [ffEngine((c) => {
    const video = c.inputs.find((p) => VID_IN.has(extOfPath(p)))!;
    const sub = c.inputs.find((p) => SUB_IN.has(extOfPath(p)))!;
    const safe = c.tmpCopy(sub, `sub.${extOfPath(sub)}`);
    return [...BASE, "-i", `file:${video}`, "-vf", `subtitles=${filterPath(safe)}`, ...H264, "-crf", "23", "-c:a", "copy", ...FASTSTART, `file:${c.output}`];
  }, "libass")], {
    mode: "all", allName: "Subtitled video", minFiles: 2, inputs: new Set([...VID_IN, ...SUB_IN]), keywords: "captions hardsub",
    checkFiles: (files) => (files.length === 2 && files.filter((f) => VID_IN.has(extOfPath(f))).length === 1 && files.filter((f) => SUB_IN.has(extOfPath(f))).length === 1 ? null : "Select exactly two files: one video and one subtitle file."),
    outName: (_n, _o, files) => `${(files.find((p) => VID_IN.has(extOfPath(p))) ?? files[0]!).split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "")} (subtitled).mp4`,
  }),
  vid("vid-extract-subs", "Save the subtitles as a file", "Takes the first subtitle track out of the video as an .srt file.", "srt", "subtitles", [ffEngine((c) => ff(c, [], ["-map", "0:s:0"]))], { inputs: exts("mkv mp4 mov m4v webm ts"), keywords: "captions srt" }),
  vid("vid-hdr-sdr", "Make an HDR video look right on normal screens", "HDR videos look grey and dull on normal screens. This converts the colours.", "mp4", "SDR", [ffEngine((c) => ff(c, [], ["-vf", "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p", ...H264, "-crf", "20", "-preset", "medium", "-c:a", "copy", ...FASTSTART]), ["x264", "zimg"])], { note: "Slow. Only helps for HDR videos.", keywords: "tonemap hdr10 dolby" }),
  ...(["srt", "vtt", "ass"] as const).map((fmt) => vid(`sub-${fmt}`, `Convert subtitles to ${fmt.toUpperCase()}`, fmt === "srt" ? "The most common subtitle format." : fmt === "vtt" ? "The subtitle format for web video." : "Subtitles with fonts and colours.", fmt, "converted", [ffEngine((c) => ff(c, [], []))], { inputs: SUB_IN, rejectSame: true, keywords: "captions" })),
];

// ---------------------------------------------------------------------------------------------------------------
// Sound: ffmpeg
// ---------------------------------------------------------------------------------------------------------------

export const snd = (id: string, label: string, hint: string, out: string | ConvDef["out"], suffix: string, engines: Engine[], extra: Partial<ConvDef> = {}): ConvDef => ({
  id, label, hint, group: "Sound", inputs: AUD_IN, out, suffix, mode: "each", engines, ...extra,
});

/** Settings for a sound that is written in its own format again. */
export const sameCodec = (ext: string): string[] => (ext === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ext === "m4a" || ext === "aac" ? ["-c:a", "aac", "-b:a", "192k"] : ext === "ogg" ? ["-c:a", "libvorbis", "-b:a", "192k"] : ext === "opus" ? ["-c:a", "libopus", "-b:a", "160k"] : []);

export const SOUND_DEFS: ConvDef[] = [
  snd("aud-mp3", "Convert to MP3", "Plays everywhere.", "mp3", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "libmp3lame", "-q:a", "2"]), "mp3")], { rejectSame: true }),
  snd("aud-m4a", "Convert to M4A (AAC)", "Good quality in a small file.", "m4a", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "aac", "-b:a", "192k"]))], { rejectSame: true }),
  snd("aud-wav", "Convert to WAV", "Uncompressed, for editing.", "wav", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "pcm_s16le"]))], { rejectSame: true }),
  snd("aud-flac", "Convert to FLAC", "Lossless but smaller than WAV.", "flac", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "flac"]))], { rejectSame: true }),
  snd("aud-ogg", "Convert to OGG", "An open format with good quality for its size.", "ogg", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "libvorbis", "-q:a", "5"]), "vorbis")], { rejectSame: true }),
  snd("aud-opus", "Convert to Opus", "The best quality at small sizes; good for speech.", "opus", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "libopus", "-b:a", "128k"]), "opus")], { rejectSame: true }),
  snd("aud-aiff", "Convert to AIFF", "Uncompressed, for Apple programs.", "aiff", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "pcm_s16be"]))], { rejectSame: true }),
  snd("aud-wma", "Convert to WMA", "The old Windows Media format.", "wma", "converted", [ffEngine((c) => ff(c, [], ["-vn", "-c:a", "wmav2", "-b:a", "192k"]), "wma")], { rejectSame: true }),
  snd("aud-custom", "Convert (choose the format and quality)", "Pick the format, the bitrate, the sample rate and mono or stereo.", (o) => String(o.format ?? "mp3"), "converted", [ffEngine((c) => ff(c, [], ["-vn", ...audioCodecArgs(optStr(c.opts, "format"), optStr(c.opts, "quality")), ...rateArgs(c.opts)]), (_e, o) => AUDIO_NEED[String(o.format)])], {
    options: [
      choiceOpt("format", "Format", "", audioFormatChoices(), "mp3"),
      choiceOpt("quality", "Quality", "For MP3, M4A, OGG and Opus. FLAC, WAV and AIFF are always full quality.", QUALITY_CHOICES, "192k"),
      choiceOpt("rate", "Sample rate", "", RATE_CHOICES, "keep"),
      choiceOpt("channels", "Channels", "", CHANNEL_CHOICES, "keep"),
    ],
    keywords: "bitrate kbps vbr mono stereo sample rate",
  }),
  snd("aud-normalize", "Make the volume even (normalise)", "Brings quiet and loud files to the same loudness (the EBU R128 standard).", "", "normalised", [ffEngine((c) => ff(c, [], ["-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", ...sameCodec(extOfPath(c.inputs[0]!))]))], { keywords: "loudness volume level loudnorm" }),
  snd("aud-silence", "Cut the silence at the start and end", "Removes the quiet parts at the beginning and the end.", "", "trimmed", [ffEngine((c) => {
    const s = "silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB";
    return ff(c, [], ["-vn", "-af", `${s},areverse,${s},areverse`, ...sameCodec(extOfPath(c.inputs[0]!))]);
  })], { keywords: "trim quiet" }),
  snd("aud-speed", "Speed up or slow down", "Change how fast the sound plays. The pitch stays the same.", "", "speed", [ffEngine((c) => ff(c, [], ["-vn", "-af", atempoChain(Number(optStr(c.opts, "speed"))), ...sameCodec(extOfPath(c.inputs[0]!))]))], {
    options: [choiceOpt("speed", "Speed", "", [["0.5", "Half speed"], ["0.75", "Slightly slower"], ["1.25", "Slightly faster"], ["1.5", "One and a half times"], ["2", "Twice as fast"]], "1.5")], keywords: "tempo podcast audiobook",
  }),
  snd("aud-join", "Join sounds into one file", "Put the selected files one after the other.", "", "joined", [ffEngine((c) => [...BASE, ...c.inputs.flatMap((p) => ["-i", `file:${p}`]), "-filter_complex", `${c.inputs.map((_p, i) => `[${i}:a]`).join("")}concat=n=${c.inputs.length}:v=0:a=1[a]`, "-map", "[a]", ...sameCodec(extOfPath(c.inputs[0]!)), `file:${c.output}`])], {
    mode: "all", allName: "Joined sound", minFiles: 2, options: [ORDER_OPTION], keywords: "merge concatenate combine",
  }),
  snd("aud-strip-art", "Remove the cover picture", "A copy of the song without its album art. The sound is not re-encoded.", "", "no cover", [ffEngine((c) => ff(c, [], ["-map", "0:a", "-c", "copy", "-map_metadata", "0"]))], { inputs: exts("mp3 flac m4a ogg opus aac") }),
  snd("aud-strip-tags", "Remove all the tags", "A copy without title, artist and so on. The sound is not re-encoded.", "", "no tags", [ffEngine((c) => ff(c, [], ["-map", "0:a", "-c", "copy", "-map_metadata", "-1"]))], { inputs: exts("mp3 flac m4a ogg opus aac wav aiff"), keywords: "metadata id3 privacy" }),
  snd("aud-tags", "Change the title, artist or album", "Fills in the tags you type; empty fields stay as they are.", "", "tagged", [ffEngine((c) => ff(c, [], ["-map", "0", "-c", "copy", ...(["title", "artist", "album"] as const).flatMap((k) => (optStr(c.opts, k) ? ["-metadata", `${k}=${optStr(c.opts, k)}`] : []))]))], {
    inputs: exts("mp3 flac m4a ogg opus"), options: [textOpt("title", "Title", ""), textOpt("artist", "Artist", ""), textOpt("album", "Album", "")],
    check: (o) => (optStr(o, "title") || optStr(o, "artist") || optStr(o, "album") ? null : "Type at least one of title, artist or album."), keywords: "id3 metadata",
  }),
  snd("aud-waveform", "Draw the sound as a picture (waveform)", "A PNG picture of the sound wave.", "png", "waveform", [ffEngine((c) => ff(c, [], ["-filter_complex", "showwavespic=s=1200x240:colors=#3b82f6", "-frames:v", "1"]))], { keywords: "wave spectrum picture" }),
  snd("aud-ringtone", "Make a ringtone", "A short clip with a gentle fade-out.", (o) => (o.format === "mp3" ? "mp3" : "m4r"), "ringtone", [ffEngine((c) => {
    const len = optNum(c.opts, "length");
    const mp3 = optStr(c.opts, "format") === "mp3";
    return ff(c, [...(c.opts.start ? ["-ss", String(c.opts.start)] : []), "-t", String(len)], ["-vn", "-af", `afade=t=out:st=${Math.max(0, len - 2)}:d=2`, ...(mp3 ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ["-c:a", "aac", "-b:a", "192k", "-f", "ipod"])]);
  }, (_e, o) => (o.format === "mp3" ? "mp3" : undefined))], {
    options: [
      timeOpt("start", "Start", "Where the clip begins, like 0:45. Empty means the beginning."),
      numberOpt("length", "Length", "iPhone ringtones can be up to 40 seconds.", 5, 40, 30, "seconds"),
      choiceOpt("format", "For", "", [["m4r", "iPhone (.m4r)"], ["mp3", "Android and others (.mp3)", "mp3"]], "m4r"),
    ],
    keywords: "iphone android clip",
  }),
];

// ---------------------------------------------------------------------------------------------------------------
// Hidden details (metadata): ExifTool. Stripping everything stays with ImageMagick and ffmpeg; reading and fine edits are ExifTool's.
// ---------------------------------------------------------------------------------------------------------------

const META_IN = exts("jpg jpeg png gif webp tif tiff heic heif avif mp4 mov m4v mkv avi webm mp3 flac m4a wav ogg opus pdf docx xlsx pptx odt");
const GPS_IN = exts("jpg jpeg tif tiff heic heif png webp mp4 mov m4v");
const exif = (argv: (c: BuildContext) => string[], extra: Partial<Engine> = {}): Engine => ({ tool: "exiftool", stage: true, argv, ...extra });

export const META_DEFS: ConvDef[] = [
  { id: "meta-text", label: "Save the hidden details as a text file", hint: "Everything stored inside the file: camera, place, date, software and more.", group: "Other", inputs: META_IN, out: "txt", suffix: "details", mode: "each", engines: [exif((c) => ["-a", "-u", "-G1", "-s", c.inputs[0]!], { stdoutIsOutput: true })], keywords: "metadata exif info properties camera gps" },
  { id: "meta-json", label: "Save the hidden details as JSON", hint: "The same details in a form other programs can read.", group: "Other", inputs: META_IN, out: "json", suffix: "details", mode: "each", engines: [exif((c) => ["-json", "-a", "-u", "-G1", c.inputs[0]!], { stdoutIsOutput: true })], keywords: "metadata exif" },
  { id: "meta-gps-strip", label: "Remove only the location (GPS)", hint: "A copy without where it was taken. The date, camera and picture stay.", group: "Other", inputs: GPS_IN, out: "", suffix: "no location", mode: "each", engines: [exif((c) => ["-o", c.output, "-gps:all=", "-xmp:geotag=", c.inputs[0]!])], keywords: "privacy gps location exif remove" },
];
