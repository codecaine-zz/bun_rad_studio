/**
 * The recipes behind the Image Studio and the Media Studio tabs. Each studio collects every slider and switch the
 * person set and runs ONE command through the normal conversion jobs (`tools/run`), so the result gets a safe new
 * name, the job list shows its progress, and nothing is overwritten. They are `hidden`: the Convert window doesn't
 * list them, because a long list of sliders belongs in the studio, not in a menu.
 */
import { optBool, optNum, optStr, parseTime, type OptionValues } from "./fmConvOptions";
import { AUD_IN, audioCodecArgs, BASE, extOfPath, ffEngine, FIRST_FRAME, H264, IMG_IN, im, imNeeds, pic, sameCodec, vid, VID_IN, atempoChain } from "./fmConvMedia";
import { CIRCLE, COLOURS, fades, probeSeconds, rounded, SHAPES, shapeCrop, videoShapeCrop } from "./fmConvMediaMore";
import { choiceOpt, numberOpt, timeOpt, toggleOpt, type BuildContext, type ConvDef } from "./fmConvTypes";

// ---------------------------------------------------------------------------------------------------------------
// Image Studio (ImageMagick)
// ---------------------------------------------------------------------------------------------------------------

const IMAGE_FORMATS: Array<[string, string]> = [["keep", "Same as the original"], ["jpg", "JPG"], ["png", "PNG"], ["webp", "WebP"], ["avif", "AVIF"]];
const WRITE_NEED: Record<string, string> = { jpg: "jpeg", png: "png", webp: "webp", avif: "avif" };
/** Formats that keep see-through parts. */
const ALPHA_OK = new Set(["png", "webp", "avif"]);

const needsAlpha = (o: OptionValues) => optStr(o, "crop") === "circle" || optNum(o, "corners") > 0 || optBool(o, "transparent");
/** The new file's format: as chosen, else PNG when see-through parts are made, else the original's. */
const imageOut = (o: OptionValues): string => (optStr(o, "format") !== "keep" ? optStr(o, "format") : needsAlpha(o) ? "png" : "");

export function imageStudioArgs(c: BuildContext): string[] {
  const o = c.opts;
  const a: string[] = [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient"];
  const crop = optStr(o, "crop");
  if (crop !== "keep" && crop !== "circle") a.push(...shapeCrop(crop));
  const rotate = optStr(o, "rotate");
  if (rotate !== "0") a.push("-rotate", rotate);
  if (optBool(o, "flipH")) a.push("-flop");
  if (optBool(o, "flipV")) a.push("-flip");
  const width = optNum(o, "width");
  if (width > 0) a.push("-resize", `${width}x>`);
  if (optBool(o, "enhance")) a.push("-auto-gamma", "-auto-level");
  const b = optNum(o, "brightness");
  const k = optNum(o, "contrast");
  if (b !== 0 || k !== 0) a.push("-brightness-contrast", `${b}x${k}`);
  const sat = optNum(o, "saturation");
  const hue = optNum(o, "hue");
  // -modulate's hue is 100 for no change and 0 or 200 for half a turn either way.
  if (sat !== 100 || hue !== 0) a.push("-modulate", `100,${sat},${(100 + hue / 1.8).toFixed(2)}`);
  const warmth = optNum(o, "warmth");
  if (warmth !== 0) a.push("-channel", "R", "-evaluate", "multiply", (1 + warmth / 400).toFixed(4), "-channel", "B", "-evaluate", "multiply", (1 - warmth / 400).toFixed(4), "+channel");
  if (optBool(o, "gray")) a.push("-colorspace", "Gray", "-colorspace", "sRGB");
  const sepia = optNum(o, "sepia");
  if (sepia > 0) a.push("-sepia-tone", `${sepia}%`);
  if (optBool(o, "invert")) a.push("-negate");
  const blur = optNum(o, "blur");
  if (blur > 0) a.push("-blur", `0x${blur}`);
  const sharpen = optNum(o, "sharpen");
  if (sharpen > 0) a.push("-unsharp", `0x${sharpen}+1+0.02`);
  if (optBool(o, "vignette")) a.push("-background", "black", "-vignette", "0x%[fx:min(w,h)/6]");
  if (optBool(o, "transparent")) a.push("-fuzz", "10%", "-transparent", "white");
  if (crop === "circle") a.push(...CIRCLE);
  const corners = optNum(o, "corners");
  if (corners > 0 && crop !== "circle") a.push(...rounded(corners));
  const border = optNum(o, "border");
  if (border > 0) a.push("-bordercolor", optStr(o, "borderColour"), "-border", String(border));
  const out = imageOut(o) || extOfPath(c.inputs[0]!);
  if (out === "jpg" || out === "jpeg") a.push("-background", "white", "-alpha", "remove", "-alpha", "off");
  if (["jpg", "jpeg", "webp", "avif"].includes(out)) a.push("-quality", String(optNum(o, "quality")));
  if (optBool(o, "strip")) a.push("-strip");
  a.push(c.output);
  return a;
}

const IMAGE_OPTIONS = [
  numberOpt("brightness", "Brightness", "", -100, 100, 0),
  numberOpt("contrast", "Contrast", "", -100, 100, 0),
  numberOpt("saturation", "Colour", "", 0, 300, 100, "%"),
  numberOpt("hue", "Hue", "", -180, 180, 0, "°"),
  numberOpt("warmth", "Warmth", "", -100, 100, 0),
  numberOpt("blur", "Blur", "", 0, 40, 0, "", 0.5),
  numberOpt("sharpen", "Sharpen", "", 0, 5, 0, "", 0.5),
  numberOpt("sepia", "Sepia", "", 0, 100, 0, "%"),
  toggleOpt("gray", "Black and white", ""),
  toggleOpt("invert", "Negative", ""),
  toggleOpt("enhance", "Auto-enhance", ""),
  toggleOpt("vignette", "Vignette", ""),
  toggleOpt("transparent", "White to see-through", ""),
  choiceOpt("rotate", "Rotate", "", [["0", "None"], ["90", "Right"], ["180", "Upside down"], ["270", "Left"]], "0"),
  toggleOpt("flipH", "Mirror", ""),
  toggleOpt("flipV", "Flip", ""),
  choiceOpt("crop", "Shape", "", [["keep", "Keep the shape"], ...SHAPES, ["circle", "Circle"]], "keep"),
  numberOpt("corners", "Round corners", "", 0, 400, 0, "pixels"),
  numberOpt("width", "Width", "0 keeps the size; bigger pictures are shrunk to this width.", 0, 12000, 0, "pixels"),
  numberOpt("border", "Border", "", 0, 300, 0, "pixels"),
  choiceOpt("borderColour", "Border colour", "", COLOURS.slice(0, 3), "white"),
  choiceOpt("format", "Save as", "", IMAGE_FORMATS, "keep"),
  numberOpt("quality", "Quality", "", 30, 100, 88, "%"),
  toggleOpt("strip", "Remove location and camera info", "", true),
];

// ---------------------------------------------------------------------------------------------------------------
// Media Studio (ffmpeg): sound files and videos
// ---------------------------------------------------------------------------------------------------------------

const MEDIA_FORMATS: Array<[string, string]> = [["auto", "Same kind as the original"], ["mp4", "MP4 video"], ["mp3", "MP3 sound"], ["m4a", "M4A sound"], ["wav", "WAV sound"], ["flac", "FLAC sound"]];
const SOUND_OUT = new Set(["mp3", "m4a", "wav", "flac"]);
const H264_CONTAINERS = new Set(["mp4", "mov", "m4v", "mkv"]);

const mediaOut = (o: OptionValues): string => (optStr(o, "format") === "auto" ? "" : optStr(o, "format"));

/** The audio filters, in the order they should run. */
function audioChain(o: OptionValues, length: number | null): string[] {
  const f: string[] = [];
  const speed = optNum(o, "speed");
  if (speed !== 1) f.push(atempoChain(speed));
  if (optBool(o, "denoise")) f.push("highpass=f=70", "afftdn=nf=-25");
  if (optBool(o, "voice")) f.push("highpass=f=90", "lowpass=f=12000", "acompressor=threshold=-20dB:ratio=3:attack=5:release=120");
  const bass = optNum(o, "bass");
  if (bass > 0) f.push(`bass=g=${bass}:f=110`);
  const treble = optNum(o, "treble");
  if (treble !== 0) f.push(`treble=g=${treble}:f=4000`);
  const volume = optNum(o, "volume");
  if (volume !== 100) f.push(`volume=${volume / 100}`);
  if (optBool(o, "reverse")) f.push("areverse");
  if (optBool(o, "normalize")) f.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  if (bass > 0 || volume > 100 || treble > 0) f.push("alimiter=limit=0.97");
  f.push(...fades("a", optNum(o, "fadeIn"), optNum(o, "fadeOut"), length));
  return f;
}

/** The video filters, in the order they should run. */
function videoChain(o: OptionValues, length: number | null): string[] {
  const f: string[] = [];
  const shape = optStr(o, "shape");
  if (shape !== "keep") f.push(videoShapeCrop(shape));
  const turn = optStr(o, "rotate");
  if (turn === "90") f.push("transpose=1");
  else if (turn === "270") f.push("transpose=2");
  else if (turn === "180") f.push("hflip,vflip");
  if (optBool(o, "mirror")) f.push("hflip");
  const size = optStr(o, "size");
  if (size !== "keep") f.push(`scale=-2:'min(ih,${size})'`);
  const b = optNum(o, "brightness");
  const k = optNum(o, "contrast");
  const s = optNum(o, "saturation");
  if (b !== 0 || k !== 0 || s !== 100) f.push(`eq=brightness=${(b / 200).toFixed(3)}:contrast=${(1 + k / 100).toFixed(3)}:saturation=${(s / 100).toFixed(3)}`);
  if (optBool(o, "gray")) f.push("hue=s=0");
  const speed = optNum(o, "speed");
  if (speed !== 1) f.push(`setpts=PTS/${speed}`);
  if (optBool(o, "reverse")) f.push("reverse");
  if (optBool(o, "fadePicture")) f.push(...fades("v", optNum(o, "fadeIn"), optNum(o, "fadeOut"), length));
  f.push("format=yuv420p");
  return f;
}

export function mediaStudioArgs(c: BuildContext): string[] {
  const o = c.opts;
  const input = c.inputs[0]!;
  const inExt = extOfPath(input);
  const isVideo = VID_IN.has(inExt);
  const outExt = extOfPath(c.output);
  const soundOnly = !isVideo || SOUND_OUT.has(outExt);
  const start = parseTime(optStr(o, "start")) ?? 0;
  const end = parseTime(optStr(o, "end"));
  const speed = optNum(o, "speed");
  let span: number | null = end !== null ? end - start : null;
  if (span === null && optNum(o, "fadeOut") > 0) {
    const all = probeSeconds(c, input);
    span = all !== null ? all - start : null;
  }
  const length = span !== null ? span / speed : null;
  const pre = [...(start > 0 ? ["-ss", String(start)] : []), ...(end !== null ? ["-t", String(Math.max(0.01, end - start))] : [])];
  const af = audioChain(o, length);
  const mute = optBool(o, "mute") && !soundOnly;
  const audio = mute ? ["-an"] : [...(af.length ? ["-af", af.join(",")] : []), ...(optBool(o, "mono") ? ["-ac", "1"] : []), ...(optBool(o, "normalize") ? ["-ar", "48000"] : [])];
  let codecs: string[];
  if (soundOnly) {
    codecs = ["-vn", ...(outExt === "mp4" ? ["-c:a", "aac", "-b:a", "192k"] : SOUND_OUT.has(outExt) && outExt !== inExt ? audioCodecArgs(outExt, outExt === "mp3" ? "vbr-high" : "192k") : sameCodec(outExt))];
  } else {
    const vf = videoChain(o, length);
    // Unusual containers (webm, avi, wmv…) get ffmpeg's own codecs for them.
    const enc = H264_CONTAINERS.has(outExt) ? [...H264, "-crf", "20", "-preset", "medium", ...(mute ? [] : ["-c:a", "aac", "-b:a", "192k"])] : [];
    codecs = ["-vf", vf.join(","), ...enc, ...(outExt === "mkv" ? [] : H264_CONTAINERS.has(outExt) ? ["-movflags", "+faststart"] : [])];
  }
  return [...BASE, ...pre, "-i", `file:${input}`, ...audio, ...codecs, `file:${c.output}`];
}

const MEDIA_OPTIONS = [
  timeOpt("start", "Start", "Leave empty to start at the beginning."),
  timeOpt("end", "End", "Leave empty to go to the end."),
  numberOpt("speed", "Speed", "", 0.25, 4, 1, "×", 0.05),
  numberOpt("volume", "Volume", "", 0, 500, 100, "%"),
  numberOpt("fadeIn", "Fade in", "", 0, 60, 0, "seconds", 0.5),
  numberOpt("fadeOut", "Fade out", "", 0, 60, 0, "seconds", 0.5),
  numberOpt("bass", "Bass boost", "", 0, 20, 0, "dB"),
  numberOpt("treble", "Treble", "", -12, 12, 0, "dB"),
  toggleOpt("normalize", "Even loudness", ""),
  toggleOpt("denoise", "Reduce background noise", ""),
  toggleOpt("voice", "Clearer speech", ""),
  toggleOpt("mono", "Mono", ""),
  toggleOpt("reverse", "Backwards", ""),
  toggleOpt("mute", "No sound", ""),
  numberOpt("brightness", "Brightness", "", -100, 100, 0),
  numberOpt("contrast", "Contrast", "", -100, 100, 0),
  numberOpt("saturation", "Colour", "", 0, 300, 100, "%"),
  toggleOpt("gray", "Black and white", ""),
  toggleOpt("mirror", "Mirror", ""),
  toggleOpt("fadePicture", "Fade the picture too", "", true),
  choiceOpt("rotate", "Rotate", "", [["0", "None"], ["90", "Right"], ["180", "Upside down"], ["270", "Left"]], "0"),
  choiceOpt("shape", "Shape", "", [["keep", "Keep the shape"], ...SHAPES.filter(([s]) => s !== "4:3" && s !== "3:2")], "keep"),
  choiceOpt("size", "Size", "", [["keep", "Keep the size"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"]], "keep"),
  choiceOpt("format", "Save as", "", MEDIA_FORMATS, "auto"),
];

const mediaNeed = (ext: string, o: OptionValues) => {
  const f = optStr(o, "format");
  if (f === "mp3") return "mp3";
  return VID_IN.has(ext) && (f === "mp4" || (f === "auto" && H264_CONTAINERS.has(ext))) ? "x264" : undefined;
};

export const STUDIO_DEFS: ConvDef[] = [
  pic("studio-image", "Image Studio", "Every change made in the Image Studio, saved as a new picture.", imageOut, "edited", [{
    ...im(imageStudioArgs), needs: (ext, o) => imNeeds(WRITE_NEED[imageOut(o)])(ext),
  }], {
    hidden: true, inputs: IMG_IN, options: IMAGE_OPTIONS,
    check: (o) => (needsAlpha(o) && optStr(o, "format") !== "keep" && !ALPHA_OK.has(optStr(o, "format")) ? "A circle, round corners or a see-through background need PNG, WebP or AVIF: JPG can't keep see-through parts." : null),
  }),
  vid("studio-media", "Media Studio", "Every change made in the Media Studio, saved as a new file.", mediaOut, "edited", [ffEngine(mediaStudioArgs, mediaNeed)], {
    hidden: true, inputs: new Set([...VID_IN, ...AUD_IN]), options: MEDIA_OPTIONS,
    check: (o) => {
      const s = parseTime(optStr(o, "start"));
      const e = parseTime(optStr(o, "end"));
      return s !== null && e !== null && e <= s ? "The end must be after the start." : null;
    },
  }),
];
