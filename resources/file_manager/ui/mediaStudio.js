// The Media Studio: open a song, a voice recording or a video, play it, mark where it should start and end, and change
// the speed, loudness, sound and picture. You hear and see the changes while it plays (the browser does the preview),
// and "Save a copy" makes the real file with ffmpeg through one conversion job (studio-media). The original stays.
import { rawUrl } from "./api.js";
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";
import { baseName, bulkCard, extOf, fileRow, group, presetCard, saveCopy, select, slider, toggle } from "./studioCommon.js";

const VIDEO_IN = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv", "mpg", "mpeg", "3gp", "ts"]);
const AUDIO_IN = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "aif"]);
/** What the browser itself can play for the preview (the rest still save fine). */
const PLAYABLE = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "mp4", "m4v", "mov", "webm"]);
export const isStudioMedia = (name) => VIDEO_IN.has(extOf(name)) || AUDIO_IN.has(extOf(name));

/** Seconds as the time text the server reads: "1:05.3", or "1:02:03.5". */
export function timeText(seconds) {
  const t = Math.max(0, Math.round(seconds * 10) / 10);
  const hrs = Math.floor(t / 3600);
  const min = Math.floor((t % 3600) / 60);
  const sec = (t % 60).toFixed(1).padStart(4, "0");
  return hrs ? `${hrs}:${String(min).padStart(2, "0")}:${sec}` : `${min}:${sec}`;
}
/** The reverse, for what the person types ("90", "1:30", "1:02:03.5"); null when it isn't a time. */
export function readTime(text) {
  const s = String(text ?? "").trim();
  if (!/^(?:\d{1,3}:)?\d{1,2}:\d{1,2}(?:\.\d{1,3})?$|^\d{1,6}(?:\.\d{1,3})?$/.test(s)) return null;
  return s.split(":").map(Number).reduce((a, p) => a * 60 + p, 0);
}

const VIDEO_ONLY = ["mute", "brightness", "contrast", "saturation", "gray", "mirror", "fadePicture", "rotate", "shape", "size"];
const signed = (v) => (v > 0 ? `+${v}` : String(v));
const PRESETS = [
  ["Podcast voice", { voice: true, denoise: true, normalize: true, mono: true }],
  ["Louder", { volume: 180, normalize: true }],
  ["Bass boost", { bass: 10 }],
  ["Ringtone (30 s)", { fadeIn: 1, fadeOut: 2, format: "m4a" }, (st) => st.ringtone()],
  ["Sound only (MP3)", { format: "mp3" }],
  ["Fast (2×)", { speed: 2 }],
  ["Slow motion", { speed: 0.5 }],
  ["Vertical for shorts", { shape: "9:16", size: "1080" }],
  ["Old film", { gray: true, contrast: 20 }],
];

function mount(root) {
  let path = null;
  let isVideo = false;
  let audio = null; // { ctx, src, gain, bass, treble } once the sound has been wired for the preview
  const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
  const player = h("div", { class: "mst-player" });
  let media = null;

  const c = {};
  const add = (ctl) => (c[ctl.input.dataset.opt] = ctl);
  const on = () => draw();
  add(slider({ id: "speed", label: "Speed", min: 0.25, max: 4, step: 0.05, value: 1, format: (v) => `${v.toFixed(2)}×`, tip: "Faster or slower; voices keep their normal pitch.", onInput: on }));
  add(slider({ id: "volume", label: "Volume", min: 0, max: 500, step: 5, value: 100, format: (v) => `${v}%`, onInput: on }));
  add(slider({ id: "fadeIn", label: "Fade in", min: 0, max: 60, step: 0.5, value: 0, format: (v) => `${v} s`, onInput: on }));
  add(slider({ id: "fadeOut", label: "Fade out", min: 0, max: 60, step: 0.5, value: 0, format: (v) => `${v} s`, onInput: on }));
  add(slider({ id: "bass", label: "Bass boost", min: 0, max: 20, value: 0, format: (v) => `${v} dB`, onInput: on }));
  add(slider({ id: "treble", label: "Treble", min: -12, max: 12, value: 0, format: (v) => `${signed(v)} dB`, onInput: on }));
  add(toggle({ id: "normalize", label: "Even loudness", tip: "Makes quiet and loud parts more even, at a comfortable level.", onInput: on }));
  add(toggle({ id: "denoise", label: "Reduce background noise", tip: "Takes out hiss and hum.", onInput: on }));
  add(toggle({ id: "voice", label: "Clearer speech", tip: "Cuts rumble and boosts the range voices are in.", onInput: on }));
  add(toggle({ id: "mono", label: "Mono", tip: "The same sound in both ears.", onInput: on }));
  add(toggle({ id: "reverse", label: "Backwards", onInput: on }));
  add(toggle({ id: "mute", label: "No sound", tip: "Keeps only the picture of a video.", onInput: on }));
  add(slider({ id: "brightness", label: "Brightness", min: -100, max: 100, value: 0, format: signed, onInput: on }));
  add(slider({ id: "contrast", label: "Contrast", min: -100, max: 100, value: 0, format: signed, onInput: on }));
  add(slider({ id: "saturation", label: "Colour", min: 0, max: 300, value: 100, format: (v) => `${v}%`, onInput: on }));
  add(toggle({ id: "gray", label: "Black and white", onInput: on }));
  add(toggle({ id: "mirror", label: "Mirror", onInput: on }));
  add(toggle({ id: "fadePicture", label: "Fade the picture too", value: true, tip: "Fades from and to black along with the sound.", onInput: on }));
  add(select({ id: "rotate", label: "Rotate", choices: [["0", "None"], ["90", "Right"], ["180", "Upside down"], ["270", "Left"]], value: "0", onInput: on }));
  add(select({ id: "shape", label: "Shape", choices: [["keep", "Keep the shape"], ["1:1", "Square (1:1)"], ["4:5", "Portrait post (4:5)"], ["9:16", "Tall: shorts, reels (9:16)"], ["16:9", "Wide: YouTube (16:9)"]], value: "keep", tip: "Cuts the middle of the video to this shape.", onInput: on }));
  add(select({ id: "size", label: "Size", choices: [["keep", "Keep the size"], ["1080", "1080p"], ["720", "720p"], ["480", "480p (small file)"]], value: "keep", onInput: on }));
  add(select({ id: "format", label: "Save as", choices: [["auto", "Same kind as the original"], ["mp4", "MP4 video"], ["mp3", "MP3 sound"], ["m4a", "M4A sound"], ["wav", "WAV sound"], ["flac", "FLAC sound"]], value: "auto", onInput: on }));

  // Start and end: typed, or taken from where the player is.
  const startIn = h("input", { type: "text", id: "mst-start", class: "pw-mono mst-time", placeholder: "beginning", "aria-label": "Start time", spellcheck: "false" });
  const endIn = h("input", { type: "text", id: "mst-end", class: "pw-mono mst-time", placeholder: "end", "aria-label": "End time", spellcheck: "false" });
  for (const el of [startIn, endIn]) el.addEventListener("input", draw);
  const here = (input) => () => { if (media) { input.value = timeText(media.currentTime); draw(); } };
  const setStart = h("button", { type: "button", class: "pw-btn", id: "mst-set-start", title: "Start the saved file where the player is now", onclick: here(startIn) }, "⇤ Start here");
  const setEnd = h("button", { type: "button", class: "pw-btn", id: "mst-set-end", title: "End the saved file where the player is now", onclick: here(endIn) }, "End here ⇥");
  const playPart = h("button", { type: "button", class: "pw-btn", id: "mst-play-part", title: "Play just the part between the start and the end" }, "▶ Play the part");
  const clearPart = h("button", { type: "button", class: "pw-btn", title: "Keep the whole length", onclick: () => { startIn.value = ""; endIn.value = ""; draw(); } }, "Whole length");
  const lengthNote = h("span", { class: "pw-status mst-length" });
  const timeWarn = h("p", { class: "pw-status pw-bad", hidden: true });

  const range = () => ({ start: readTime(startIn.value) ?? 0, end: readTime(endIn.value) ?? (media?.duration || Infinity) });
  playPart.addEventListener("click", () => {
    if (!media) return;
    media.currentTime = range().start;
    wireSound();
    media.play().catch(() => {});
  });

  function wireSound() {
    if (audio || !media) return;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(media);
      const bass = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 120 });
      const treble = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 4000 });
      const gain = ctx.createGain();
      src.connect(bass).connect(treble).connect(gain).connect(ctx.destination);
      audio = { ctx, gain, bass, treble };
      draw();
    } catch { /* No Web Audio: the preview plays without the sound changes. */ }
  }

  /**
   * The loudness right now: the volume slider, the fades, and silence when "No sound" is on. The player's own mute
   * button counts too: once the sound goes through Web Audio, WebKit (the desktop window) ignores the element's mute.
   */
  function loudness() {
    const v = values();
    if (v.mute || (audio && media?.muted)) return 0;
    let g = v.volume / 100;
    if (media) {
      const { start, end } = range();
      const t = media.currentTime;
      if (v.fadeIn > 0 && t < start + v.fadeIn) g *= Math.max(0, (t - start) / v.fadeIn);
      if (v.fadeOut > 0 && Number.isFinite(end) && t > end - v.fadeOut) g *= Math.max(0, (end - t) / v.fadeOut);
    }
    return g;
  }

  function tick() {
    if (!media || media.paused) return;
    const { end } = range();
    if (media.currentTime >= end) media.pause();
    if (audio) audio.gain.gain.value = loudness();
    else { const want = Math.min(1, loudness()); if (Math.abs(media.volume - want) > 0.001) media.volume = want; }
    requestAnimationFrame(tick);
  }

  const values = () => {
    const v = Object.fromEntries(Object.entries(c).map(([id, ctl]) => [id, ctl.get()]));
    v.start = readTime(startIn.value) === null ? "" : startIn.value.trim();
    v.end = readTime(endIn.value) === null ? "" : endIn.value.trim();
    return v;
  };

  function draw() {
    const v = values();
    if (media) {
      media.playbackRate = v.speed;
      media.preservesPitch = true;
      if (audio) {
        audio.gain.gain.value = loudness();
        audio.bass.gain.value = v.bass;
        audio.treble.gain.value = v.treble;
      }
      if (isVideo) {
        media.style.filter = `brightness(${1 + v.brightness / 100}) contrast(${1 + v.contrast / 100}) saturate(${v.saturation / 100})${v.gray ? " grayscale(1)" : ""}`;
        media.style.transform = `rotate(${v.rotate}deg) scaleX(${v.mirror ? -1 : 1})`;
        player.style.aspectRatio = v.shape === "keep" ? "" : v.shape.replace(":", " / ");
        player.classList.toggle("mst-shaped", v.shape !== "keep");
      }
    }
    // Things that only make sense for a video.
    for (const id of VIDEO_ONLY) c[id].el.hidden = !isVideo;
    pictureGroup.hidden = !isVideo;
    const bad = (startIn.value.trim() && readTime(startIn.value) === null) || (endIn.value.trim() && readTime(endIn.value) === null);
    const { start, end } = range();
    timeWarn.hidden = !bad && !(end <= start);
    timeWarn.textContent = bad ? "Type a time like 90, 1:30 or 1:02:03.5." : "The end must be after the start.";
    if (Number.isFinite(end) && end > start) lengthNote.textContent = `Saved length: ${timeText((end - start) / v.speed)}${v.speed !== 1 ? ` (at ${v.speed}×)` : ""}`;
    else lengthNote.textContent = "";
    saveBtn.disabled = !path || bad || end <= start;
  }

  function ringtone() {
    if (!media) return;
    const s = media.currentTime;
    startIn.value = timeText(s);
    endIn.value = timeText(Math.min(media.duration || s + 30, s + 30));
  }

  function load(p) {
    path = p;
    files.setName(p);
    isVideo = VIDEO_IN.has(extOf(p));
    if (audio) { audio.ctx.close().catch(() => {}); audio = null; }
    media?.pause();
    player.replaceChildren();
    startIn.value = "";
    endIn.value = "";
    status.textContent = "";
    empty.hidden = true;
    if (PLAYABLE.has(extOf(p))) {
      media = h(isVideo ? "video" : "audio", { controls: true, preload: "metadata", class: isVideo ? "mst-video" : "mst-audio", src: rawUrl(p), id: "mst-media" });
      media.addEventListener("play", () => { wireSound(); audio?.ctx.resume(); requestAnimationFrame(tick); });
      media.addEventListener("loadedmetadata", draw);
      media.addEventListener("volumechange", draw);
      player.append(media);
      if (!isVideo) player.prepend(h("div", { class: "mst-note-art", "aria-hidden": "true" }, "🎵"));
    } else {
      media = null;
      player.append(h("p", { class: "pw-hint" }, "This file can't be played here, but you can still type a start and end and save."));
    }
    player.classList.toggle("mst-is-video", isVideo);
    draw();
  }
  const files = fileRow({ what: "song or video", accepts: isStudioMedia, onPick: load, idPrefix: "mst" });
  const empty = h("p", { class: "pw-hint" }, "Select a song, recording or video in the file list and press “Use the selected song or video”, or right-click one and choose “Edit in Media Studio”.");

  const saveBtn = h("button", { type: "button", class: "pw-btn primary", id: "mst-save", disabled: true, title: "Save the edited file as a new file next to the original" }, "Save a copy");
  const savedAs = h("span", { class: "pw-mono" });
  saveBtn.addEventListener("click", async () => {
    if (!path) return;
    media?.pause();
    const v = values();
    if (!isVideo) for (const id of VIDEO_ONLY) delete v[id];
    const out = await saveCopy({ action: "studio-media", path, options: v, status, button: saveBtn });
    if (out) savedAs.textContent = baseName(out);
  });

  const studio = { ringtone };
  const applyValues = (o, extra) => { for (const ctl of Object.values(c)) ctl.reset(); for (const [k, val] of Object.entries(o)) c[k]?.set(val); extra?.(studio); draw(); };
  // A preset is about how things sound and look; where a song starts and ends is different for every file.
  const mine = presetCard({ kind: "media", idPrefix: "mst", getValues: values, applyValues, skip: ["start", "end"] });
  const bulk = bulkCard({ what: "song or video", whatMany: "songs and videos", accepts: isStudioMedia, action: "studio-media", getValues: values, idPrefix: "mst",
    check: () => (timeWarn.hidden ? null : timeWarn.textContent) });
  const presets = h("div", { class: "pw-row st-presets" }, h("span", { class: "st-file-label" }, "Quick recipes:"),
    PRESETS.map(([label, set, extra]) => h("button", { type: "button", class: "pw-btn st-preset", onclick: () => applyValues(set, extra) }, label)),
    h("button", { type: "button", class: "pw-btn", id: "mst-reset", title: "Put everything back to normal", onclick: () => { for (const ctl of Object.values(c)) ctl.reset(); startIn.value = ""; endIn.value = ""; draw(); } }, "Reset all"));

  const pictureGroup = group("Picture (videos)", c.brightness.el, c.contrast.el, c.saturation.el, c.gray.el, c.mirror.el, c.rotate.el, c.shape.el, c.size.el, c.fadePicture.el, c.mute.el);
  root.append(h("div", { class: "st-wrap" },
    h("div", { class: "st-head" }, h("h2", { class: "st-title" }, "🎬 Media Studio"), h("p", { class: "pw-hint" }, "Trim, speed up, fade, clean up and boost songs, voice recordings and videos. You hear the changes while it plays; saving makes a new file and never changes the original.")),
    files.el,
    presets,
    mine.el,
    h("div", { class: "st-body" },
      h("div", { class: "st-preview" }, empty, player,
        h("div", { class: "pw-card" }, h("h3", {}, "Keep only part of it"),
          h("div", { class: "pw-row" }, setStart, h("label", { class: "mst-time-label" }, "Start", startIn), h("label", { class: "mst-time-label" }, "End", endIn), setEnd),
          h("div", { class: "pw-row" }, playPart, clearPart, lengthNote), timeWarn),
        h("div", { class: "pw-row" }, saveBtn, savedAs), status, bulk.el),
      h("div", { class: "st-panels" },
        group("Speed and loudness", c.speed.el, c.volume.el, c.fadeIn.el, c.fadeOut.el, c.normalize.el),
        group("Sound", c.bass.el, c.treble.el, c.denoise.el, c.voice.el, c.mono.el, c.reverse.el),
        pictureGroup,
        group("Saving", c.format.el)))));
  draw();

  return {
    show(opts) {
      const first = opts?.path ?? opts?.paths?.[0];
      if (first) load(first);
      bulk.update();
    },
    hide() { media?.pause(); },
  };
}

registerPowerTab({ id: "mediastudio", label: "Media Studio", icon: "🎬", tip: "Edit songs, voice recordings and videos: trim, speed, volume, fades, bass, noise, picture colour, shape and format", group: "media", mount });
