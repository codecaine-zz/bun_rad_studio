// Direct one-click media actions for the right-click menu, the Details panel and Quick Look's More menu.
// Each button starts a conversion job right away (using its default settings) so the original file is never changed
// and the new copy appears beside it in the folder.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { inTrash } from "./pane.js";
import { emit } from "./state.js";
import { extensionOf } from "./util.js";

const PIC_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico", "svg"]);
const VID_EXTS = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv", "mpg", "mpeg", "3gp", "ts"]);
const AUD_EXTS = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "aif"]);
const SUB_EXTS = new Set(["srt", "vtt", "ass", "ssa", "sub"]);

/** Starts a one-click media job and hands it to the task tray. */
export async function runQuickMedia(action, paths, label, options = undefined) {
  try {
    const body = options ? { action, paths, options } : { action, paths };
    const { job } = await call("tools/run", body);
    emit("job-started", job);
    toast(`${label}: making a new copy…`, { kind: "info" });
    return job;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't start that.", { kind: "error" });
    return null;
  }
}

/**
 * Returns the one-click actions that fit `entries` (each item has `{ id, label, icon, tip, options? }`).
 * Returns an empty list in the Recycle Bin, when folders are selected, or when the selection is not media.
 */
export function quickMediaActions(entries) {
  if (inTrash() || !entries?.length || entries.some((e) => e.isDir || e.isSymlink)) return [];
  const exts = entries.map((e) => extensionOf(e.name));
  const allPic = exts.every((x) => PIC_EXTS.has(x));
  const allVid = exts.every((x) => VID_EXTS.has(x));
  const allAud = exts.every((x) => AUD_EXTS.has(x));

  if (allPic) {
    const allJpg = exts.every((x) => x === "jpg" || x === "jpeg");
    const allPng = exts.every((x) => x === "png");
    const allWebp = exts.every((x) => x === "webp");
    const out = [
      { id: "img-rot-right", label: "Rotate right (90°)", icon: "↻", tip: "Turn a quarter turn clockwise and save as a new picture." },
      { id: "img-rot-left", label: "Rotate left (90°)", icon: "↺", tip: "Turn a quarter turn counter-clockwise and save as a new picture." },
      { id: "img-enhance", label: "Auto-enhance photo", icon: "✨", tip: "Stretch the light and color so a dull photo looks clearer." },
      { id: "img-web", label: "Make web-sized (1920 px)", icon: "📉", tip: "Shrink to at most 1920 pixels wide and remove hidden camera info." },
      { id: "img-scan", label: "Clean page scan", icon: "📄", tip: "Turn a photographed page into a clean, readable black-and-white scan." },
      { id: "img-strip", label: "Remove private info", icon: "🛡️", tip: "Save a copy without GPS location, camera model or dates." },
    ];
    if (!allJpg) out.push({ id: "img-jpg", label: "Convert to JPG", icon: "🖼️", tip: "Save a copy in the standard JPG format." });
    if (!allPng) out.push({ id: "img-png", label: "Convert to PNG", icon: "🖼️", tip: "Save a lossless PNG copy." });
    if (!allWebp) out.push({ id: "img-webp", label: "Convert to WebP", icon: "🖼️", tip: "Save a compact WebP copy for the web." });
    if (entries.length >= 2) {
      out.push(
        { id: "img-combine-pdf", label: "Combine into one PDF", icon: "📑", tip: "Put all the selected pictures, in order, into one PDF document." },
        { id: "img-montage", label: "Put side by side", icon: "🧩", tip: "Join the selected pictures into a single grid picture." },
        { id: "img-gif-anim", label: "Make an animated GIF", icon: "🎞️", tip: "Turn the selected pictures into a looping animated GIF." },
      );
    }
    return out;
  }

  if (allVid) {
    const allMp4 = exts.every((x) => x === "mp4");
    const out = [
      { id: "vid-small", label: "Make smaller for sharing", icon: "📉", tip: "A smaller MP4 (up to 720p) that is quick to send in chat or email." },
      { id: "vid-mp3", label: "Save the sound as MP3", icon: "🎵", tip: "Extract just the audio track as an MP3 file." },
      { id: "vid-mute", label: "Remove the sound (mute)", icon: "🔇", tip: "Save a silent copy of the video without re-encoding the picture." },
      { id: "vid-gif", label: "Make an animated GIF", icon: "🎞️", tip: "Turn the video into a looping animated GIF." },
      { id: "vid-cover", label: "Save a cover picture", icon: "🖼️", tip: "Save a still frame from the video as a PNG picture." },
      { id: "vid-vertical-blur", label: "Fit vertical (9:16 blur)", icon: "📱", tip: "Fit into a 9:16 vertical frame with a blurred background for Shorts or Reels." },
      { id: "vid-normalize", label: "Normalize video sound", icon: "🔊", tip: "Make quiet and loud parts of the video's audio even." },
      { id: "vid-voice", label: "Clean up speech", icon: "🎙️", tip: "Reduce background rumble and hiss so voices in the video are clearer." },
      { id: "vid-speed", label: "Speed up 2×", icon: "⏩", tip: "Double the playback speed of the video.", options: { speed: "2" } },
    ];
    if (!allMp4) out.push({ id: "vid-mp4", label: "Convert to MP4", icon: "🎬", tip: "Save a compatible H.264 MP4 copy that plays everywhere." });
    if (entries.length >= 2) out.push({ id: "vid-concat", label: "Join videos into one", icon: "🔗", tip: "Play the selected videos one after another in a single MP4." });
    return out;
  }

  if (allAud) {
    const allMp3 = exts.every((x) => x === "mp3");
    const allWav = exts.every((x) => x === "wav");
    const allM4a = exts.every((x) => x === "m4a");
    const out = [
      { id: "aud-normalize", label: "Normalize volume", icon: "🔊", tip: "Bring the loudness to the standard level so it isn't too quiet or too loud." },
      { id: "aud-voice", label: "Make speech clearer", icon: "🎙️", tip: "Cut low rumble, reduce hiss and even out the volume of voices." },
      { id: "aud-denoise", label: "Reduce background noise", icon: "🧹", tip: "Soften steady background hiss and hum." },
      { id: "aud-silence", label: "Cut start & end silence", icon: "✂️", tip: "Remove dead air at the beginning and end of the recording." },
      { id: "aud-small-voice", label: "Make small voice M4A", icon: "📉", tip: "Shrink a voice recording into a tiny mono M4A for sharing." },
      { id: "aud-waveform", label: "Draw waveform picture", icon: "📈", tip: "Make a PNG picture of the sound wave." },
    ];
    if (!allMp3) out.push({ id: "aud-mp3", label: "Convert to MP3", icon: "🎵", tip: "Save a copy in the universal MP3 format." });
    if (!allWav) out.push({ id: "aud-wav", label: "Convert to WAV", icon: "🎵", tip: "Save an uncompressed WAV copy for editing." });
    if (!allM4a) out.push({ id: "aud-m4a", label: "Convert to M4A", icon: "🎵", tip: "Save a compact M4A (AAC) copy." });
    if (entries.length >= 2) out.push({ id: "aud-join", label: "Join sounds into one", icon: "🔗", tip: "Play the selected audio files one after another in a single file." });
    return out;
  }

  if (entries.length === 2) {
    const pics = exts.filter((x) => PIC_EXTS.has(x)).length;
    const vids = exts.filter((x) => VID_EXTS.has(x)).length;
    const auds = exts.filter((x) => AUD_EXTS.has(x)).length;
    const subs = exts.filter((x) => SUB_EXTS.has(x)).length;
    if (pics === 1 && auds === 1) {
      return [{ id: "vid-still", label: "Make a video from picture and sound", icon: "🎬", tip: "Show the picture for the whole length of the sound as an MP4 video." }];
    }
    if (vids === 1 && auds === 1) {
      return [{ id: "vid-add-music", label: "Add music to the video", icon: "🎶", tip: "Put the sound file on the video as its soundtrack." }];
    }
    if (vids === 1 && subs === 1) {
      return [{ id: "vid-burn-subs", label: "Burn subtitles into the video", icon: "💬", tip: "Draw the subtitles permanently onto the video picture." }];
    }
  }
  return [];
}

/** Menu items for the right-click menu or Quick Look's More menu. */
export function quickMediaMenuItems(entries, { limit = 6, wrap = (fn) => fn } = {}) {
  const actions = quickMediaActions(entries).slice(0, limit);
  if (!actions.length) return [];
  const paths = entries.map((e) => e.path);
  return [
    { header: "One-click media" },
    ...actions.map((a) => ({
      label: a.label,
      icon: a.icon,
      tip: a.tip,
      action: wrap(() => runQuickMedia(a.id, paths, a.label, a.options)),
    })),
  ];
}

/** A compact "One-click" card for the Details panel on the right. */
export function quickMediaBlock(entries) {
  const actions = quickMediaActions(entries);
  if (!actions.length) return null;
  const paths = entries.map((e) => e.path);
  return h("div", { class: "mq-box", role: "group", "aria-label": "One-click media actions" },
    h("div", { class: "mq-title" }, "One-click"),
    h("div", { class: "mq-buttons" },
      actions.map((a) => h("button", {
        type: "button",
        class: "btn mq-btn",
        dataset: { quickAction: a.id },
        title: a.tip,
        onclick: () => runQuickMedia(a.id, paths, a.label, a.options),
      }, `${a.icon} ${a.label}`))),
  );
}
