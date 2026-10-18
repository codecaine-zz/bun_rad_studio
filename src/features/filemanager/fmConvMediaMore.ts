/**
 * More everyday picture, video and sound edits (effects, crops, fades, volume, noise) for the Convert window. Same
 * rules as fmConvMedia.ts: every command is a list of arguments, and every number has been range-checked by
 * `fmConvOptions.ts` before it gets here.
 */
import { optNum, optStr, parseTime } from "./fmConvOptions";
import { AAC, AUD_IN, BASE, extOfPath, FASTSTART, ff, ffEngine, FIRST_FRAME, H264, IMG_RASTER, im, imSimple, pic, sameCodec, snd, vid, VID_IN } from "./fmConvMedia";
import { choiceOpt, exts, numberOpt, timeOpt, type BuildContext, type ConvDef } from "./fmConvTypes";

/** Picture shapes, as ImageMagick's width:height crop and a label. */
export const SHAPES: Array<[string, string]> = [["1:1", "Square (1:1)"], ["4:5", "Portrait post (4:5)"], ["9:16", "Tall: stories, reels, shorts (9:16)"], ["16:9", "Wide: YouTube, screens (16:9)"], ["4:3", "Classic photo (4:3)"], ["3:2", "Camera photo (3:2)"]];
export const COLORS: Array<[string, string]> = [["white", "White"], ["black", "Black"], ["#808080", "Gray"], ["none", "See-through (PNG)"]];

/** A crop of the middle of the picture to a width:height shape. */
export const shapeCrop = (shape: string) => ["-gravity", "center", "-crop", shape, "+repage"];
/** Cuts the picture to a circle (the corners become see-through). */
export const CIRCLE = ["-gravity", "center", "-crop", "1:1", "+repage", "(", "+clone", "-alpha", "extract", "-fill", "black", "-colorize", "100", "-fill", "white", "-draw", "circle %[fx:w/2],%[fx:h/2] %[fx:w/2],0", ")", "-alpha", "off", "-compose", "CopyOpacity", "-composite"];
export const rounded = (r: number) => ["(", "+clone", "-alpha", "extract", "-fill", "black", "-colorize", "100", "-fill", "white", "-draw", `roundrectangle 0,0 %[fx:w-1],%[fx:h-1] ${r},${r}`, ")", "-alpha", "off", "-compose", "CopyOpacity", "-composite"];

const shapeOpt = (def = "1:1") => choiceOpt("shape", "Shape", "The middle of the picture is kept; the edges are cut.", SHAPES, def);

export const MORE_PICTURE_DEFS: ConvDef[] = [
  pic("img-sepia", "Old photo (sepia)", "Warm brown tones, like an old print.", "", "sepia", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-sepia-tone", `${optNum(c.opts, "amount")}%`, c.output])], {
    options: [numberOpt("amount", "Strength", "", 10, 100, 80, "%")], keywords: "vintage retro brown effect filter",
  }),
  pic("img-invert", "Invert the colors (negative)", "Black becomes white, red becomes cyan, like a film negative.", "", "negative", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-negate"]))], { keywords: "negate negative effect filter" }),
  pic("img-enhance", "Auto-enhance (fix dull colors)", "Stretches the colors and light so a dull or gray photo looks crisp.", "", "enhanced", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-auto-gamma", "-auto-level"]))], { keywords: "auto fix improve levels contrast" }),
  pic("img-adjust", "Brightness, contrast and color…", "Make the picture lighter or darker, punchier or softer, more or less colorful.", "", "adjusted", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient",
    "-brightness-contrast", `${optNum(c.opts, "brightness")}x${optNum(c.opts, "contrast")}`, "-modulate", `100,${optNum(c.opts, "saturation")}`, c.output])], {
    options: [
      numberOpt("brightness", "Brightness", "Below 0 is darker, above 0 is lighter.", -100, 100, 10),
      numberOpt("contrast", "Contrast", "Below 0 is softer, above 0 is punchier.", -100, 100, 10),
      numberOpt("saturation", "Color", "100 keeps it, 0 is gray, 200 is twice as colorful.", 0, 300, 110, "%"),
    ], keywords: "light dark saturation vibrance exposure",
  }),
  pic("img-blur", "Blur the picture…", "Soften the whole picture (to hide details, or for a background).", "", "blurred", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-blur", `0x${optNum(c.opts, "amount")}`, c.output])], {
    options: [numberOpt("amount", "How much", "", 1, 40, 8)], keywords: "soft background effect",
  }),
  pic("img-sharpen", "Sharpen", "Makes a slightly soft photo look crisper.", "", "sharpened", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-unsharp", `0x${optNum(c.opts, "amount")}+1+0.02`, c.output])], {
    options: [numberOpt("amount", "How much", "", 0.5, 5, 1.5, "", 0.5)], keywords: "crisp detail focus unsharp",
  }),
  pic("img-pixelate", "Pixelate (big blocks)", "Turns the picture into big squares, to hide faces or make retro art.", "", "pixelated", [im((c) => {
    const n = optNum(c.opts, "block");
    return [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-scale", `${(100 / n).toFixed(3)}%`, "-scale", `${n * 100}%`, c.output];
  })], { options: [numberOpt("block", "Block size", "", 2, 64, 12, "pixels")], keywords: "mosaic hide retro 8-bit censor" }),
  pic("img-vignette", "Soft dark edges (vignette)", "Darkens the edges so the eye goes to the middle.", "", "vignette", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-background", "black", "-vignette", "0x%[fx:min(w,h)/6]"]))], { keywords: "effect filter frame" }),
  pic("img-sketch", "Pencil sketch", "Turns a photo into a gray pencil drawing.", "", "sketch", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-colorspace", "Gray", "-sketch", "0x20+120"]))], { keywords: "drawing art effect charcoal" }),
  pic("img-crop", "Crop to a shape (square, 16:9…)", "Keeps the middle in the shape a site or screen wants.", "", "cropped", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", ...shapeCrop(optStr(c.opts, "shape")), c.output])], {
    options: [shapeOpt()], keywords: "cut aspect ratio square instagram",
  }),
  pic("img-trim", "Cut away empty edges", "Removes plain borders around a picture, logo or screenshot.", "", "trimmed", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-fuzz", "8%", "-trim", "+repage"]))], { keywords: "autocrop border whitespace" }),
  pic("img-pad-square", "Fit into a square (add edges)", "The whole picture stays; plain edges fill the rest of a square.", "", "square", [im((c) => {
    const bg = optStr(c.opts, "colour");
    return [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-background", bg, "-gravity", "center", "-extent", "%[fx:max(w,h)]x%[fx:max(w,h)]", c.output];
  })], {
    out: (o) => (o.colour === "none" ? "png" : ""), options: [choiceOpt("colour", "Edge color", "", COLORS, "white")], keywords: "letterbox pad extend",
  }),
  pic("img-border", "Add a border", "A plain frame around the picture.", "", "border", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-bordercolor", optStr(c.opts, "colour"), "-border", String(optNum(c.opts, "size")), c.output])], {
    options: [numberOpt("size", "Thickness", "", 1, 300, 20, "pixels"), choiceOpt("colour", "Color", "", COLORS.slice(0, 3), "white")], keywords: "frame edge",
  }),
  pic("img-circle", "Make a round picture (circle)", "Cuts a square from the middle and rounds it, for profile pictures. Saved as PNG.", "png", "round", [im(imSimple([...FIRST_FRAME, "-auto-orient", ...CIRCLE]), "png")], { keywords: "avatar profile circle round" }),
  pic("img-rounded", "Round the corners", "Soft rounded corners, like an app icon or a card. Saved as PNG.", "png", "rounded", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", ...rounded(optNum(c.opts, "radius")), c.output], "png")], {
    options: [numberOpt("radius", "Roundness", "", 4, 400, 40, "pixels")], keywords: "corner radius card icon",
  }),
  pic("img-transparent", "Make the white background see-through", "Plain white (or nearly white) becomes transparent, for logos and signatures. Saved as PNG.", "png", "transparent", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-fuzz", `${optNum(c.opts, "fuzz")}%`, "-transparent", "white", c.output], "png")], {
    options: [numberOpt("fuzz", "How close to white", "Higher also removes light grays.", 0, 50, 10, "%")], keywords: "remove background transparent logo signature",
  }),
  pic("img-scan", "Clean up a photographed page (document scan)", "Turns a photo of a page, receipt or whiteboard into crisp dark writing on clean white paper.", "", "scan", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-colorspace", "Gray", "(", "+clone", "-blur", "0x20", ")", "+swap", "-compose", "DivideSrc", "-composite", "-linear-stretch", "5%x1%"]))], {
    keywords: "document scan receipt page whiteboard paper clean contrast",
  }),
  pic("img-polaroid", "Polaroid photo frame", "Adds a classic white photo frame with a wider bottom edge, like an instant camera print.", "", "polaroid", [im(imSimple([...FIRST_FRAME, "-auto-orient", "-bordercolor", "white", "-border", "24x24", "-gravity", "south", "-background", "white", "-splice", "0x56"]))], {
    keywords: "polaroid frame instant photo print border",
  }),
  pic("img-shadow", "Add a soft drop shadow (for screenshots)", "Puts a soft shadow behind a screenshot or card on a see-through background. Saved as PNG.", "png", "shadow", [im(imSimple([...FIRST_FRAME, "-auto-orient", "(", "+clone", "-background", "black", "-shadow", "60x12+0+8", ")", "+swap", "-background", "none", "-layers", "merge", "+repage"]), "png")], {
    keywords: "shadow drop screenshot card png",
  }),
  pic("img-posterize", "Poster look (fewer, bold colors)", "Reduces the picture to a handful of flat, bold color steps, like a screen-printed poster.", "", "poster", [im((c) => [c.inputs[0]!, ...FIRST_FRAME, "-auto-orient", "-posterize", String(optNum(c.opts, "levels")), c.output])], {
    options: [numberOpt("levels", "Color levels", "Fewer is bolder; 4 to 8 works well.", 2, 16, 6)], keywords: "poster posterize flat colors art",
  }),
  pic("img-append", "Put side by side", "Joins the selected pictures into one, next to each other or one under the other.", "png", "joined", [im((c) => {
    const across = optStr(c.opts, "direction") === "across";
    return [...c.inputs.flatMap((i) => [`${i}[0]`, "-auto-orient", "-resize", across ? "x1080>" : "1080x>"]), "-background", "white", "-gravity", "center", across ? "+append" : "-append", c.output];
  }, "png")], {
    mode: "all", allName: "Side by side", minFiles: 2, inputs: IMG_RASTER, options: [choiceOpt("direction", "Direction", "", [["across", "Next to each other"], ["down", "One under the other"]], "across")], keywords: "combine collage before after merge join",
  }),
];

// ---------------------------------------------------------------------------------------------------------------
// Video and sound
// ---------------------------------------------------------------------------------------------------------------

/** How long a sound or video is, in seconds, using ffprobe (installed with ffmpeg); null when it can't be told. */
export function probeSeconds(c: BuildContext, file: string): number | null {
  const bin = c.program("ffmpeg", "ffprobe");
  if (!bin) return null;
  try {
    const r = Bun.spawnSync([bin, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `file:${file}`], { stdout: "pipe", stderr: "ignore" });
    const n = parseFloat(r.stdout.toString());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** ffmpeg's crop to a width:height shape, kept to even sizes (H.264 needs them). */
export function videoShapeCrop(shape: string): string {
  const [w, h] = shape.split(":").map(Number);
  const r = (w! / h!).toFixed(6);
  return `crop=w='trunc(min(iw,ih*${r})/2)*2':h='trunc(min(ih,iw/${r})/2)*2'`;
}

/** afade/fade filters for the start and end; `length` is how long the result is (null: fade out can't be placed). */
export function fades(kind: "a" | "v", fadeIn: number, fadeOut: number, length: number | null): string[] {
  const name = kind === "a" ? "afade" : "fade";
  const out: string[] = [];
  if (fadeIn > 0) out.push(`${name}=t=in:st=0:d=${fadeIn}`);
  if (fadeOut > 0 && length) out.push(`${name}=t=out:st=${Math.max(0, length - fadeOut).toFixed(3)}:d=${fadeOut}`);
  return out;
}

const fadeOpts = [numberOpt("fadeIn", "Fade in", "0 for none.", 0, 60, 2, "seconds", 0.5), numberOpt("fadeOut", "Fade out", "0 for none.", 0, 60, 3, "seconds", 0.5)];
const VIDEO_SHAPES = SHAPES.filter(([s]) => s !== "4:3" && s !== "3:2");
const x264 = ["-crf", "23", "-preset", "medium"];

export const MORE_VIDEO_DEFS: ConvDef[] = [
  vid("vid-crop-shape", "Crop to a shape (vertical, square…)", "Keeps the middle of the picture: make a wide video tall for shorts and reels, or square.", "mp4", "cropped", [ffEngine((c) => ff(c, [], ["-vf", videoShapeCrop(optStr(c.opts, "shape")), ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], {
    options: [choiceOpt("shape", "Shape", "", VIDEO_SHAPES, "9:16")], keywords: "vertical portrait tiktok reels shorts square aspect",
  }),
  vid("vid-vertical-blur", "Fit into vertical (9:16) with blurred background", "Keeps the whole wide video in the middle and fills the top and bottom with a soft, blurred copy — for shorts, reels and TikTok without cutting anything off.", "mp4", "vertical", [ffEngine((c) => ff(c, [], ["-vf", "split[bg][fg];[bg]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:5[bg2];[fg]scale=720:1280:force_original_aspect_ratio=decrease[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2,format=yuv420p", ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], {
    keywords: "vertical portrait tiktok reels shorts blur background pillarbox 9:16",
  }),
  vid("vid-boomerang", "Make a boomerang (forward then backward)", "Plays the clip forwards and then right back to the start in one smooth silent loop. Best for short clips.", "mp4", "boomerang", [ffEngine((c) => ff(c, [], ["-vf", "split[f][b];[b]reverse[r];[f][r]concat=n=2:v=1:a=0,format=yuv420p", "-an", ...H264, ...x264, ...FASTSTART]), "x264")], {
    keywords: "boomerang bounce loop forward backward instagram",
  }),
  vid("vid-fade", "Fade in and out", "The picture fades from and to black and the sound fades in and out.", "mp4", "faded", [ffEngine((c) => {
    const len = probeSeconds(c, c.inputs[0]!);
    const fi = optNum(c.opts, "fadeIn");
    const fo = optNum(c.opts, "fadeOut");
    return ff(c, [], ["-vf", ["format=yuv420p", ...fades("v", fi, fo, len)].join(","), "-af", ["anull", ...fades("a", fi, fo, len)].join(","), ...H264, ...x264, ...AAC("160k"), ...FASTSTART]);
  }, "x264")], { options: fadeOpts, keywords: "fade black transition" }),
  vid("vid-gray", "Black and white video (grayscale)", "Removes the color from the picture. The sound stays.", "mp4", "black and white", [ffEngine((c) => ff(c, [], ["-vf", "hue=s=0", ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], { keywords: "gray gray grayscale grayscale monochrome" }),
  vid("vid-mirror", "Mirror left to right", "Flips the picture like a mirror (fixes selfie videos).", "mp4", "mirrored", [ffEngine((c) => ff(c, [], ["-vf", "hflip", ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], { keywords: "flip selfie" }),
  vid("vid-reverse", "Play backwards (reverse)", "The video and its sound run backwards. Best for short clips: the whole video is held in memory.", "mp4", "reversed", [ffEngine((c) => ff(c, [], ["-vf", "reverse", "-af", "areverse", ...H264, ...x264, ...AAC("160k"), ...FASTSTART]), "x264")], { keywords: "rewind backward" }),
  vid("vid-color", "Brightness, contrast and color…", "Make a dark or dull video brighter and more colorful.", "mp4", "adjusted", [ffEngine((c) => {
    const eq = `eq=brightness=${(optNum(c.opts, "brightness") / 200).toFixed(3)}:contrast=${(1 + optNum(c.opts, "contrast") / 100).toFixed(3)}:saturation=${(optNum(c.opts, "saturation") / 100).toFixed(3)}`;
    return ff(c, [], ["-vf", eq, ...H264, ...x264, "-c:a", "copy", ...FASTSTART]);
  }, "x264")], {
    options: [numberOpt("brightness", "Brightness", "Below 0 is darker.", -100, 100, 10), numberOpt("contrast", "Contrast", "Below 0 is softer.", -100, 100, 10), numberOpt("saturation", "Color", "100 keeps it, 0 is gray.", 0, 300, 120, "%")],
    keywords: "light dark saturation exposure grade",
  }),
  vid("vid-denoise", "Clean up a grainy video", "Smooths the speckles of a video filmed in low light.", "mp4", "clean", [ffEngine((c) => ff(c, [], ["-vf", "hqdn3d=4:3:6:4.5", ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], { keywords: "noise grain low light denoise" }),
  vid("vid-sharpen", "Sharpen a soft video", "Brings out edges and detail in a slightly blurry video.", "mp4", "sharpened", [ffEngine((c) => ff(c, [], ["-vf", "unsharp=5:5:1.0:5:5:0.0", ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], { keywords: "crisp detail focus unsharp" }),
  vid("vid-volume", "Make the sound louder or quieter", "Changes the volume. The picture is not re-encoded.", "", "volume", [ffEngine((c) => ff(c, [], ["-c:v", "copy", "-af", `volume=${optNum(c.opts, "volume") / 100}`, ...AAC("192k")]))], {
    inputs: exts("mp4 mov m4v mkv"), options: [numberOpt("volume", "Volume", "100 keeps it, 200 is twice as loud.", 0, 500, 150, "%")], keywords: "loud quiet gain boost",
  }),
  vid("vid-normalize", "Make the video's sound even (normalize)", "Evens out quiet and loud parts of the sound (the EBU R128 standard). The picture is not re-encoded.", "", "normalized", [ffEngine((c) => ff(c, [], ["-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", ...AAC("192k")]))], {
    inputs: exts("mp4 mov m4v mkv"), keywords: "loudness volume level loudnorm even audio",
  }),
  vid("vid-voice", "Clean up speech in a video", "Cuts background rumble and hiss and evens out voices in a lecture, interview or screen recording. The picture is not re-encoded.", "", "clear voice", [ffEngine((c) => ff(c, [], ["-c:v", "copy", "-af", "highpass=f=80,afftdn=nf=-20,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", ...AAC("192k")]))], {
    inputs: exts("mp4 mov m4v mkv"), keywords: "speech voice podcast lecture noise hiss clarity",
  }),
  vid("vid-fps", "Change the frames per second", "Smaller files at 24 or 30; smoother motion is not created.", "mp4", "fps", [ffEngine((c) => ff(c, [], ["-vf", `fps=${optStr(c.opts, "fps")}`, ...H264, ...x264, "-c:a", "copy", ...FASTSTART]), "x264")], {
    options: [choiceOpt("fps", "Frames per second", "", [["24", "24 (film)"], ["25", "25"], ["30", "30 (most videos)"], ["60", "60 (smooth)"], ["15", "15 (small)"]], "30")], keywords: "framerate frame rate",
  }),
  vid("vid-loop", "Repeat (loop) the video", "Plays the video several times in a row in one file. Not re-encoded.", "", "looped", [ffEngine((c) => ff(c, ["-stream_loop", String(optNum(c.opts, "times") - 1)], ["-c", "copy"]))], {
    options: [numberOpt("times", "Times in total", "", 2, 50, 3)], keywords: "repeat loop",
  }),
  vid("vid-add-music", "Add music or a voice-over", "Select one video and one sound file. The sound replaces the video's own sound, or plays together with it.", "mp4", "with music", [ffEngine((c) => {
    const video = c.inputs.find((p) => VID_IN.has(extOfPath(p)))!;
    const sound = c.inputs.find((p) => AUD_IN.has(extOfPath(p)))!;
    const mix = optStr(c.opts, "how") === "mix";
    const music = `volume=${optNum(c.opts, "volume") / 100}`;
    const audio = mix ? ["-filter_complex", `[1:a]${music}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`, "-map", "0:v", "-map", "[a]"] : ["-filter_complex", `[1:a]${music}[a]`, "-map", "0:v", "-map", "[a]", "-shortest"];
    return [...BASE, "-i", `file:${video}`, "-i", `file:${sound}`, ...audio, "-c:v", "copy", ...AAC("192k"), ...FASTSTART, `file:${c.output}`];
  })], {
    mode: "all", allName: "Video with music", minFiles: 2, inputs: new Set([...VID_IN, ...AUD_IN]),
    options: [choiceOpt("how", "The video's own sound", "", [["replace", "Replace it with the new sound"], ["mix", "Keep it and mix in the new sound"]], "replace"), numberOpt("volume", "New sound's volume", "", 0, 300, 100, "%")],
    checkFiles: (files) => (files.length === 2 && files.filter((f) => VID_IN.has(extOfPath(f))).length === 1 && files.filter((f) => AUD_IN.has(extOfPath(f))).length === 1 ? null : "Select exactly two files: one video and one sound file."),
    outName: (_n, _o, files) => `${(files.find((p) => VID_IN.has(extOfPath(p))) ?? files[0]!).split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "")} (with music).mp4`,
    keywords: "soundtrack background music voiceover narration audio replace",
  }),
  vid("vid-still", "Make a video from a picture and a sound", "Select one picture and one sound file: the picture shows for as long as the sound plays (for podcasts and music uploads).", "mp4", "video", [ffEngine((c) => {
    const picture = c.inputs.find((p) => IMG_RASTER.has(extOfPath(p)))!;
    const sound = c.inputs.find((p) => AUD_IN.has(extOfPath(p)))!;
    return [...BASE, "-loop", "1", "-framerate", "2", "-i", `file:${picture}`, "-i", `file:${sound}`, "-vf", "scale=trunc(min(iw\\,1920)/2)*2:-2,format=yuv420p", "-c:v", "libx264", "-tune", "stillimage", ...AAC("192k"), "-shortest", ...FASTSTART, `file:${c.output}`];
  }, "x264")], {
    mode: "all", allName: "Picture video", minFiles: 2, inputs: new Set([...IMG_RASTER, ...AUD_IN]),
    checkFiles: (files) => (files.length === 2 && files.filter((f) => IMG_RASTER.has(extOfPath(f))).length === 1 && files.filter((f) => AUD_IN.has(extOfPath(f))).length === 1 ? null : "Select exactly two files: one picture and one sound file."),
    outName: (_n, _o, files) => `${(files.find((p) => AUD_IN.has(extOfPath(p))) ?? files[0]!).split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "")} (video).mp4`,
    keywords: "podcast youtube music upload cover slideshow audiogram",
  }),
];

const sndSame = (c: BuildContext) => sameCodec(extOfPath(c.inputs[0]!));
const sndFilter = (af: string) => (c: BuildContext) => ff(c, [], ["-vn", "-af", af, ...sndSame(c)]);

export const MORE_SOUND_DEFS: ConvDef[] = [
  snd("aud-volume", "Make louder or quieter", "Changes the volume of the whole file.", "", "volume", [ffEngine((c) => ff(c, [], ["-vn", "-af", `volume=${optNum(c.opts, "volume") / 100}`, ...sndSame(c)]))], {
    options: [numberOpt("volume", "Volume", "100 keeps it, 200 is twice as loud, 50 is half.", 0, 500, 150, "%")], keywords: "loud quiet gain boost",
  }),
  snd("aud-fade", "Fade in and out", "The sound starts softly and ends softly.", "", "faded", [ffEngine((c) => {
    const len = probeSeconds(c, c.inputs[0]!);
    const fi = optNum(c.opts, "fadeIn");
    const fo = optNum(c.opts, "fadeOut");
    // Without ffprobe the end is unknown: fade the reversed sound in, then turn it back round.
    const af = len !== null || fo === 0 ? ["anull", ...fades("a", fi, fo, len)].join(",") : [...fades("a", fi, 0, null), "areverse", `afade=t=in:st=0:d=${fo}`, "areverse"].join(",");
    return ff(c, [], ["-vn", "-af", af, ...sndSame(c)]);
  })], { options: fadeOpts, keywords: "fade intro outro" }),
  snd("aud-trim", "Cut out a part (trim)", "Keep only the part between two times.", "", "trimmed", [ffEngine((c) => {
    const start = parseTime(optStr(c.opts, "start")) ?? 0;
    const end = parseTime(optStr(c.opts, "end"));
    return ff(c, start > 0 ? ["-ss", String(start)] : [], ["-vn", ...(end !== null ? ["-t", String(Math.max(0.01, end - start))] : []), ...sndSame(c)]);
  })], {
    options: [timeOpt("start", "Start", "Like 1:30 or 90. Leave empty to start at the beginning."), timeOpt("end", "End", "Like 2:45. Leave empty to go to the end.")],
    check: (o) => { const s = parseTime(String(o.start ?? "")); const e = parseTime(String(o.end ?? "")); return s !== null && e !== null && e <= s ? "The end must be after the start." : null; },
    keywords: "cut clip shorten",
  }),
  snd("aud-mono", "Make mono", "Both speakers play the same sound; the file is smaller.", "", "mono", [ffEngine((c) => ff(c, [], ["-vn", "-ac", "1", ...sndSame(c)]))], { keywords: "channels stereo" }),
  snd("aud-small-voice", "Make small for sharing (voice M4A)", "Turns a long meeting, lecture or voice memo into a tiny mono M4A file that is easy to email or message.", "m4a", "small", [ffEngine((c) => ff(c, [], ["-vn", "-ac", "1", "-ar", "24000", "-c:a", "aac", "-b:a", "48k", ...FASTSTART]))], {
    keywords: "compress shrink voice memo lecture meeting podcast email whatsapp",
  }),
  snd("aud-reverse", "Play backwards (reverse)", "The sound runs backwards.", "", "reversed", [ffEngine(sndFilter("areverse"))], { keywords: "backward rewind" }),
  snd("aud-denoise", "Reduce background noise", "Lowers steady hiss and hum (fans, air conditioning) in recordings.", "", "clean", [ffEngine(sndFilter("highpass=f=70,afftdn=nf=-25"))], { keywords: "noise hiss hum clean denoise" }),
  snd("aud-voice", "Make speech clearer", "Cuts rumble and evens the level of a voice recording, podcast or lecture.", "", "clear voice", [ffEngine(sndFilter("highpass=f=90,lowpass=f=12000,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-1.5:LRA=11"))], {
    keywords: "podcast voice speech compressor clarity",
  }),
  snd("aud-bass", "Bass boost", "More low end for small speakers.", "", "bass", [ffEngine((c) => ff(c, [], ["-vn", "-af", `bass=g=${optNum(c.opts, "gain")}:f=110,alimiter=limit=0.95`, ...sndSame(c)]))], {
    options: [numberOpt("gain", "How much", "", 1, 20, 6, "dB")], keywords: "bass boost equalizer equaliser eq low",
  }),
  snd("aud-treble", "Make brighter and crisper (treble boost)", "Adds clarity and sparkle to muffled recordings or dull songs.", "", "crisp", [ffEngine((c) => ff(c, [], ["-vn", "-af", `treble=g=${optNum(c.opts, "gain")}:f=4000,alimiter=limit=0.95`, ...sndSame(c)]))], {
    options: [numberOpt("gain", "How much", "", 1, 15, 5, "dB")], keywords: "treble high crisp clarity equalizer equaliser eq",
  }),
  snd("aud-echo", "Add room echo (reverb)", "Gives a dry voice or instrument a warm room echo.", "", "echo", [ffEngine(sndFilter("aecho=0.8:0.88:60|120:0.35|0.2"))], {
    keywords: "echo reverb room hall delay effect",
  }),
  snd("aud-nightcore", "Nightcore (faster and higher pitch)", "Speeds up the song and raises the pitch together, like a sped-up record.", "", "nightcore", [ffEngine(sndFilter("asetrate=44100*1.25,aresample=44100"))], {
    keywords: "nightcore pitch fast chipmunk remix",
  }),
  snd("aud-slowed", "Slowed and dreamy (slowed + reverb)", "Slows the song down and lowers the pitch with a gentle echo.", "", "slowed", [ffEngine(sndFilter("asetrate=44100*0.85,aresample=44100,aecho=0.8:0.88:80:0.25"))], {
    keywords: "slowed reverb vaporwave pitch deep dreamy",
  }),
  snd("aud-8d", "8D rotating sound (for headphones)", "Gently moves the sound from ear to ear in a circle. Listen with headphones.", "", "8D", [ffEngine(sndFilter("apulsator=mode=sine:hz=0.125:amount=0.85"))], {
    keywords: "8d binaural pan headphones surround",
  }),
  snd("aud-karaoke", "Try to remove the singer (karaoke)", "Removes what sits in the middle of a stereo song, usually the voice. Works best on older stereo recordings.", "", "karaoke", [ffEngine(sndFilter("pan=stereo|c0=c0-c1|c1=c1-c0"))], { keywords: "vocals instrumental remove voice" }),
  snd("aud-split", "Split into equal parts", "Cuts a long recording into pieces of the same length, in a new folder. Not re-encoded.", "", "parts", [ffEngine((c) => {
    const ext = extOfPath(c.inputs[0]!);
    return [...BASE, "-i", `file:${c.inputs[0]}`, "-vn", "-f", "segment", "-segment_time", String(optNum(c.opts, "minutes") * 60), "-c", "copy", "-reset_timestamps", "1", `file:${c.output}/part-%03d.${ext}`];
  })], { outKind: "folder", options: [numberOpt("minutes", "Each part", "", 1, 600, 10, "minutes")], keywords: "split chunks segment pieces" }),
];

