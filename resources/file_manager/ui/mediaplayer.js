// The player inside Quick Look: sound and video with a queue (the other sound and video files of the folder), shuffle and
// repeat, speed, an A-B loop, volume, stereo balance, preamp + ten-band equalizer with spline curve, multi-mode
// spectrum/oscilloscope/radial/VU visualizers with peak-hold caps, skins, tags and cover art, subtitles, picture in
// picture, full screen, handoff to the full Media Deck, and the computer's media keys.
import { lyricsUrl, rawUrl } from "./api.js";
import { h } from "./dom.js";
import {
  EQ_BANDS, EQ_PRESETS, LYRIC_EXTS, PLAYER_SKINS, PlayQueue, SUBTITLE_EXTS, VIZ_MODES,
  clampBalance, clampGain, computeEqSpline, formatClock, formatLedClock, mediaKindOfName,
  parseFlac, parseId3, parseMp4Tags, parseOggTags, renderAudioVisualizer, srtToVtt, subtitleText,
} from "./mediacore.js";
import { emit } from "./state.js";
import { formatSize } from "./util.js";

export { renderAudioVisualizer };

const PREFS_KEY = "fm_player_v1";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const MAX_TAG_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

function syncSliderVars(el) {
  if (!el) return;
  el.style.setProperty("--attr-min", el.min || "0");
  el.style.setProperty("--attr-max", el.max || "100");
  el.style.setProperty("--control-value", el.value || "0");
}

function loadPrefs() {
  const d = {
    volume: 0.8, muted: false, rate: 1, repeat: "off", shuffle: false,
    eqOn: false, preamp: 0, balance: 0, eq: EQ_PRESETS.Flat.slice(), preset: "Flat",
    vizMode: "spectrum", skin: "classic", remainingTime: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      if (typeof raw.volume === "number") d.volume = Math.max(0, Math.min(1, raw.volume));
      d.muted = raw.muted === true;
      if (SPEEDS.includes(raw.rate)) d.rate = raw.rate;
      if (raw.repeat === "all" || raw.repeat === "one") d.repeat = raw.repeat;
      d.shuffle = raw.shuffle === true;
      d.eqOn = raw.eqOn === true;
      if (typeof raw.preamp === "number") d.preamp = clampGain(raw.preamp);
      if (typeof raw.balance === "number") d.balance = clampBalance(raw.balance);
      if (Array.isArray(raw.eq) && raw.eq.length === EQ_BANDS.length) d.eq = raw.eq.map(clampGain);
      if (typeof raw.preset === "string") d.preset = raw.preset;
      if (VIZ_MODES.some((m) => m.id === raw.vizMode)) d.vizMode = raw.vizMode;
      if (PLAYER_SKINS.some((s) => s.id === raw.skin)) d.skin = raw.skin;
      d.remainingTime = raw.remainingTime === true;
    }
  } catch { /* no saved choices: the defaults are fine */ }
  return d;
}

const savePrefs = (prefs) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode: choices last for this window only */ } };

async function fetchRange(path, start, end) {
  const res = await fetch(rawUrl(path), { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok) throw new Error("range failed");
  return new Uint8Array(await res.arrayBuffer());
}

/** The tags and cover picture inside an audio file, read from just the parts of it that hold them. Null when there are none. */
export async function readTags(entry) {
  const name = entry.name.toLowerCase();
  // Skip tag box-walking for video files (.mov, .mp4, .m4v, etc.): their moov atom sits at the end of large files
  // and holds multi-megabyte frame tables, so fetching it from JS competes with <video> streaming and causes stutter.
  if (mediaKindOfName(name) === "video") return null;
  try {
    if (name.endsWith(".mp3")) return parseId3(await fetchRange(entry.path, 0, Math.min(entry.size, MAX_TAG_BYTES) - 1));
    if (name.endsWith(".flac")) return parseFlac(await fetchRange(entry.path, 0, Math.min(entry.size, MAX_TAG_BYTES) - 1));
    if (/\.(ogg|oga|opus)$/.test(name)) return parseOggTags(await fetchRange(entry.path, 0, Math.min(entry.size, MAX_TAG_BYTES) - 1));
    if (name.endsWith(".m4a")) {
      // Walk the top-level boxes by their sizes until the one called "moov".
      let pos = 0;
      for (let i = 0; i < 64 && pos + 8 <= entry.size; i++) {
        const head = await fetchRange(entry.path, pos, pos + 15);
        const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
        let size = dv.getUint32(0);
        const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
        if (size === 1 && head.length >= 16) size = dv.getUint32(8) * 0x100000000 + dv.getUint32(12);
        if (size === 0) size = entry.size - pos;
        if (size < 8) return null;
        if (type === "moov") return size > MAX_TAG_BYTES ? null : parseMp4Tags(await fetchRange(entry.path, pos + 8, pos + size - 1));
        pos += size;
      }
    }
  } catch { /* the tags are a nicety: the file name does the job */ }
  return null;
}

const dataUrlOf = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** Draws the 10-band EQ spline curve onto a canvas. */
export function drawEqSplineCanvas(canvas, preamp, bands, eqOn) {
  if (!canvas || typeof canvas.getContext !== "function") return;
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement && typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent ?? "")) return;
  const g2 = canvas.getContext("2d");
  if (!g2) return;
  const w = canvas.width;
  const h = canvas.height;
  g2.clearRect(0, 0, w, h);
  g2.fillStyle = "rgba(10, 15, 28, 0.85)";
  g2.fillRect(0, 0, w, h);
  const { points, anchors, zeroY } = computeEqSpline(preamp, bands, w, h);
  // 0 dB / preamp line
  g2.strokeStyle = "rgba(148, 163, 184, 0.35)";
  g2.lineWidth = 1;
  g2.beginPath();
  g2.moveTo(0, zeroY);
  g2.lineTo(w, zeroY);
  g2.stroke();
  // Spline curve
  if (points.length) {
    g2.strokeStyle = eqOn ? "#22c55e" : "#64748b";
    g2.lineWidth = 2;
    g2.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) g2.moveTo(pt.x, pt.y);
      else g2.lineTo(pt.x, pt.y);
    });
    g2.stroke();
  }
  for (const pt of anchors) {
    g2.fillStyle = eqOn ? "#facc15" : "#94a3b8";
    g2.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
}

/**
 * @param {{ entries: any[], start: any, onTrack: (entry: any) => void, announce: (text: string) => void, subtitleEntries?: any[], onOpenDeck?: (state: any) => void }} options
 */
export function createPlayer({ entries, start, onTrack, announce, subtitleEntries = [], onOpenDeck }) {
  const prefs = loadPrefs();
  const list = entries.filter((e) => mediaKindOfName(e.name));
  const queue = new PlayQueue(list.length, Math.max(0, list.findIndex((e) => e.path === start.path)));
  queue.setRepeat(prefs.repeat);
  if (prefs.shuffle) queue.setShuffle(true);

  const media = h("video", { class: "mp-media", playsinline: true, preload: "metadata", "aria-label": "Player" });
  media.volume = prefs.volume;
  media.muted = prefs.muted;
  let level = prefs.volume;
  let silent = prefs.muted;
  media.defaultPlaybackRate = media.playbackRate = prefs.rate;

  let entry = list[queue.index] ?? start;
  let tags = null;
  let loop = { a: null, b: null };
  let cover = "";
  let graph = null; // { ctx, analyser, filters, preamp, panner, out }
  let graphTried = false;
  let raf = 0;
  let destroyed = false;
  let loadToken = 0;
  let trackUrls = [];
  let lyricSources = [];
  const peaks = new Float32Array(64);
  let vizPhase = 0;

  // --- parts ---------------------------------------------------------------------------------------------------
  const art = h("div", { class: "mp-art", "aria-hidden": "true" });
  const canvas = h("canvas", { class: "mp-viz", width: 640, height: 160, title: "Click to cycle visualizer mode (V)" });
  const vizBadge = h("span", { class: "mp-viz-badge" });
  const stage = h("div", { class: "mp-stage" }, art, canvas, vizBadge, media);
  const title = h("div", { class: "mp-title" });
  const artist = h("div", { class: "mp-artist" });
  const message = h("p", { class: "mp-message", role: "status" });
  const info = h("div", { class: "mp-info" }, title, artist, message);

  const seek = h("input", { type: "range", class: "mp-seek", min: "0", max: "1000", value: "0", step: "1", "aria-label": "Position" });
  const elapsed = h("span", { class: "mp-time mp-time-toggle", title: "Click to toggle elapsed or remaining time" }, "0:00");
  const total = h("span", { class: "mp-time" }, "0:00");
  const abMark = h("div", { class: "mp-ab", hidden: true });
  const seekRow = h("div", { class: "mp-seekrow" }, elapsed, h("div", { class: "mp-seekwrap" }, seek, abMark), total);

  const btn = (cls, label, text, onclick) => h("button", { type: "button", class: `mp-btn ${cls}`, "aria-label": label, title: label, onclick }, text);
  const shuffleBtn = btn("", "Shuffle", "🔀", () => setShuffle(!queue.shuffle));
  const prevBtn = btn("", "Previous (B)", "⏮", () => previous());
  const playBtn = btn("mp-play", "Play (Space)", "▶", () => toggle());
  const nextBtn = btn("", "Next (N)", "⏭", () => next(false));
  const repeatBtn = btn("", "Repeat", "🔁", () => setRepeat(queue.cycleRepeat()));
  const muteBtn = btn("", "Mute (M)", "🔊", () => setMuted(!silent));
  const volume = h("input", { type: "range", class: "mp-volume", min: "0", max: "100", value: String(Math.round(prefs.volume * 100)), "aria-label": "Volume" });
  const speed = h("select", { class: "mp-select", "aria-label": "Speed ([ and ])", title: "Speed ([ slower, ] faster)" }, ...SPEEDS.map((s) => h("option", { value: String(s), selected: s === prefs.rate }, `${s}×`)));
  const abBtn = btn("", "A–B loop (A)", "A–B", () => cycleLoop());
  const vizBtn = btn("", "Visualizer mode (V)", "📊", () => cycleVizMode());
  const vizSelect = h("select", { class: "mp-select", "aria-label": "Visualizer preset", title: "Choose visualizer preset (V cycles)" }, ...VIZ_MODES.map((m) => h("option", { value: m.id, selected: m.id === prefs.vizMode }, m.label)));
  const eqBtn = btn("", "Equalizer (E)", "🎚", () => togglePanel("eq"));
  const queueBtn = btn("", "Queue (Q)", "☰", () => togglePanel("queue"));
  const lyricsBtn = btn("", "Show lyrics (L)", "♪", () => togglePanel("lyrics"));
  lyricsBtn.hidden = true;
  const subSelect = h("select", { class: "mp-select", hidden: true, "aria-label": "Subtitles (C)", title: "Subtitles (C)" });
  const skinSelect = h("select", { class: "mp-select", "aria-label": "Player skin", title: "Choose player skin" }, ...PLAYER_SKINS.map((s) => h("option", { value: s.id, selected: s.id === prefs.skin }, s.label)));
  const deckBtn = btn("", "Open in Media Deck (W)", "🎛️", () => openInDeck());
  const pipBtn = btn("", "Picture in picture", "⧉", () => pip());
  const fsBtn = btn("", "Full screen (F)", "⛶", () => fullscreen());
  const buttons = h("div", { class: "mp-buttons" }, shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn,
    h("span", { class: "mp-sep" }), muteBtn, volume, speed, abBtn, vizBtn, vizSelect, eqBtn, queueBtn, lyricsBtn, subSelect, skinSelect, deckBtn, pipBtn, fsBtn);

  const eqPreset = h("select", { class: "mp-select", "aria-label": "Equalizer preset" }, ...Object.keys(EQ_PRESETS).map((n) => h("option", { value: n }, n)), h("option", { value: "Custom" }, "Custom"));
  const eqOn = h("input", { type: "checkbox", "aria-label": "Equalizer on" });
  const preampInput = h("input", { type: "range", class: "mp-preamp", min: "-12", max: "12", step: "1", value: String(prefs.preamp), orient: "vertical", "aria-label": "Preamp gain", oninput: () => preampChanged() });
  const balanceInput = h("input", { type: "range", class: "mp-balance", min: "-100", max: "100", step: "5", value: String(prefs.balance), "aria-label": "Stereo balance", oninput: () => balanceChanged() });
  const eqCurveCanvas = h("canvas", { class: "mp-eq-curve", width: 220, height: 48, "aria-hidden": "true" });
  const bandInputs = EQ_BANDS.map((hz, i) => h("input", { type: "range", class: "mp-band", min: "-12", max: "12", step: "1", value: String(prefs.eq[i]), orient: "vertical", "aria-label": `${hz >= 1000 ? `${hz / 1000} kilohertz` : `${hz} hertz`} gain`, oninput: () => bandChanged(i) }));
  const eqPanel = h("div", { class: "mp-panel", hidden: true },
    h("div", { class: "mp-paneltop" }, h("label", {}, eqOn, " On"), eqPreset, h("button", { type: "button", class: "btn", onclick: () => applyPreset("Flat") }, "Reset")),
    eqCurveCanvas,
    h("div", { class: "mp-eq-meta" }, h("label", { class: "mp-balance-wrap" }, "Pan L/R ", balanceInput)),
    h("div", { class: "mp-bands" },
      h("label", { class: "mp-band-wrap mp-preamp-wrap" }, preampInput, h("span", {}, "Pre")),
      ...EQ_BANDS.map((hz, i) => h("label", { class: "mp-band-wrap" }, bandInputs[i], h("span", {}, hz >= 1000 ? `${hz / 1000}k` : String(hz)))),
    ),
    h("p", { class: "mp-note", id: "mp-eqnote" }, ""));
  const queueList = h("ol", { class: "mp-queue", "aria-label": "Play queue" });
  const queuePanel = h("div", { class: "mp-panel", hidden: true }, queueList);
  const lyricsSelect = h("select", { class: "mp-select", hidden: true, "aria-label": "Lyrics source" });
  const lyricsText = h("pre", { class: "mp-lyrics", "aria-label": "Lyrics" });
  const lyricsPanel = h("div", { class: "mp-panel mp-lyrics-panel", hidden: true },
    h("div", { class: "mp-paneltop" }, h("strong", {}, "Lyrics"), lyricsSelect), lyricsText);

  const root = h("div", { class: "mp", tabindex: "-1", dataset: { skin: prefs.skin } }, stage, info, seekRow, buttons, eqPanel, queuePanel, lyricsPanel);

  for (const el of [seek, volume, preampInput, balanceInput, ...bandInputs]) syncSliderVars(el);

  // --- helpers -------------------------------------------------------------------------------------------------
  const save = () => savePrefs(prefs);
  const say = (text) => announce?.(text);
  const showMessage = (text) => { message.textContent = text; message.hidden = !text; };
  const isVideo = () => mediaKindOfName(entry.name) === "video";

  function openInDeck() {
    const payload = { entries: list, start: entry, currentTime: media.currentTime, paused: media.paused };
    media.pause();
    if (typeof onOpenDeck === "function") onOpenDeck(payload);
    else emit("player-deck-open", payload);
  }

  function drawIdleViz() {
    if (isVideo() || (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement && typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent ?? ""))) return;
    const g2 = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!g2) return;
    const freqData = new Uint8Array(128);
    const timeData = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      freqData[i] = Math.max(14, Math.round(105 * Math.exp(-i / 42) + 45 * Math.sin(i * 0.28 + 0.8) * Math.sin(i * 0.11)));
      timeData[i] = Math.round(128 + 38 * Math.sin(i * 0.22) * Math.cos(i * 0.07));
    }
    vizPhase += 4;
    const accent = getComputedStyle(root).getPropertyValue("--mp-led").trim() || "#00ff41";
    renderAudioVisualizer(g2, canvas.width, canvas.height, prefs.vizMode, freqData, timeData, peaks, accent, vizPhase);
  }

  function setVizMode(id) {
    const modeObj = VIZ_MODES.find((m) => m.id === id);
    if (!modeObj) return;
    prefs.vizMode = modeObj.id;
    vizSelect.value = modeObj.id;
    vizBadge.textContent = modeObj.label;
    if (media.paused || !graph) drawIdleViz();
    save();
    say(`Visualizer: ${modeObj.label}`);
  }

  function cycleVizMode() {
    const idx = VIZ_MODES.findIndex((m) => m.id === prefs.vizMode);
    const nextMode = VIZ_MODES[(idx + 1) % VIZ_MODES.length];
    setVizMode(nextMode.id);
  }

  function renderQueue() {
    queueList.replaceChildren(...list.map((e, i) => h("li", { class: i === list.indexOf(entry) ? "is-current" : "" },
      h("button", { type: "button", class: "mp-qitem", "aria-current": i === list.indexOf(entry) ? "true" : null, onclick: () => playIndex(i) },
        h("span", { class: "mp-qicon", "aria-hidden": "true" }, mediaKindOfName(e.name) === "video" ? "🎞️" : "🎵"), h("span", { class: "mp-qname" }, e.name), h("span", { class: "mp-qsize" }, formatSize(e.size))))));
  }

  function refreshButtons() {
    playBtn.textContent = media.paused ? "▶" : "⏸";
    playBtn.setAttribute("aria-label", media.paused ? "Play (Space)" : "Pause (Space)");
    playBtn.title = playBtn.getAttribute("aria-label");
    shuffleBtn.setAttribute("aria-pressed", String(queue.shuffle));
    shuffleBtn.classList.toggle("is-on", queue.shuffle);
    repeatBtn.textContent = queue.repeat === "one" ? "🔂" : "🔁";
    repeatBtn.classList.toggle("is-on", queue.repeat !== "off");
    repeatBtn.setAttribute("aria-label", `Repeat: ${queue.repeat === "off" ? "off" : queue.repeat === "all" ? "all" : "this one"}`);
    repeatBtn.title = repeatBtn.getAttribute("aria-label");
    muteBtn.textContent = silent || level === 0 ? "🔇" : level < 0.4 ? "🔉" : "🔊";
    muteBtn.setAttribute("aria-pressed", String(silent));
    abBtn.classList.toggle("is-on", loop.a !== null);
    abBtn.textContent = loop.a === null ? "A–B" : loop.b === null ? "A→" : "A⇄B";
    prevBtn.disabled = nextBtn.disabled = list.length < 2 && queue.repeat === "off";
    vizBtn.hidden = isVideo();
    vizSelect.hidden = isVideo();
    vizBadge.hidden = isVideo();
    vizSelect.value = prefs.vizMode;
    vizBadge.textContent = VIZ_MODES.find((m) => m.id === prefs.vizMode)?.label ?? "";
    pipBtn.hidden = !isVideo() || !canPip();
    fsBtn.hidden = !isVideo();
  }

  function refreshTime() {
    const d = media.duration;
    elapsed.textContent = formatLedClock(media.currentTime, d, prefs.remainingTime);
    total.textContent = Number.isFinite(d) ? formatClock(d) : "0:00";
    if (document.activeElement !== seek || !seek.matches(":active")) {
      seek.value = Number.isFinite(d) && d > 0 ? String(Math.round((media.currentTime / d) * 1000)) : "0";
      syncSliderVars(seek);
    }
    seek.setAttribute("aria-valuetext", `${formatClock(media.currentTime)} of ${total.textContent}`);
    if (loop.a !== null && loop.b !== null && media.currentTime >= loop.b) media.currentTime = loop.a;
  }

  function drawAb() {
    const d = media.duration;
    abMark.hidden = !(loop.a !== null && Number.isFinite(d) && d > 0);
    if (abMark.hidden) return;
    abMark.style.left = `${(loop.a / d) * 100}%`;
    abMark.style.width = `${(((loop.b ?? media.currentTime) - loop.a) / d) * 100}%`;
  }

  // --- the audio graph: preamp, equalizer, stereo balance and spectrum -----------------------------------------
  async function ensureGraph() {
    if (graph || graphTried) return graph;
    graphTried = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      await ctx.resume();
      if (ctx.state !== "running") { await ctx.close(); return null; } // routing the sound through a stopped context would silence it
      const source = ctx.createMediaElementSource(media);
      const preamp = ctx.createGain();
      const filters = EQ_BANDS.map((hz, i) => {
        const f = ctx.createBiquadFilter();
        f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
        f.frequency.value = hz;
        f.Q.value = 1.1;
        f.gain.value = prefs.eqOn ? prefs.eq[i] : 0;
        return f;
      });
      const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      const out = ctx.createGain();
      const chain = [source, preamp, ...filters, ...(panner ? [panner] : []), analyser, out, ctx.destination];
      chain.reduce((a, b) => (a.connect(b), b));
      graph = { ctx, preamp, panner, analyser, filters, out };
      applyLevel();
      applyEq();
    } catch { graph = null; }
    return graph;
  }

  function applyEq() {
    if (graph) {
      graph.preamp.gain.value = prefs.eqOn ? Math.pow(10, prefs.preamp / 20) : 1;
      if (graph.panner) graph.panner.pan.value = Math.max(-1, Math.min(1, prefs.balance / 100));
      graph.filters.forEach((f, i) => { f.gain.value = prefs.eqOn ? prefs.eq[i] : 0; });
    }
    eqOn.checked = prefs.eqOn;
    preampInput.value = String(prefs.preamp);
    preampInput.setAttribute("aria-valuetext", `${prefs.preamp > 0 ? "+" : ""}${prefs.preamp} decibels`);
    syncSliderVars(preampInput);
    balanceInput.value = String(prefs.balance);
    balanceInput.setAttribute("aria-valuetext", prefs.balance === 0 ? "Center" : prefs.balance < 0 ? `${Math.abs(prefs.balance)}% Left` : `${prefs.balance}% Right`);
    syncSliderVars(balanceInput);
    bandInputs.forEach((el, i) => {
      el.value = String(prefs.eq[i]);
      el.setAttribute("aria-valuetext", `${prefs.eq[i] > 0 ? "+" : ""}${prefs.eq[i]} decibels`);
      syncSliderVars(el);
    });
    eqPreset.value = Object.keys(EQ_PRESETS).includes(prefs.preset) ? prefs.preset : "Custom";
    drawEqSplineCanvas(eqCurveCanvas, prefs.preamp, prefs.eq, prefs.eqOn);
    const note = eqPanel.querySelector("#mp-eqnote");
    if (note) note.textContent = graphTried && !graph ? "The equalizer and the spectrum aren't available here: this window's audio system could not be started. Playing is not affected." : "";
  }

  function preampChanged() {
    prefs.preamp = clampGain(preampInput.value);
    prefs.eqOn = true;
    if (!media.paused) ensureGraph().then(applyEq);
    else applyEq();
    save();
  }

  function balanceChanged() {
    prefs.balance = clampBalance(balanceInput.value);
    if (!media.paused && prefs.balance !== 0) ensureGraph().then(applyEq);
    else applyEq();
    save();
  }

  function bandChanged(i) {
    prefs.eq[i] = clampGain(bandInputs[i].value);
    prefs.preset = "Custom";
    prefs.eqOn = true;
    if (!media.paused) ensureGraph().then(applyEq);
    else applyEq();
    save();
  }

  function applyPreset(name) {
    prefs.eq = (EQ_PRESETS[name] ?? EQ_PRESETS.Flat).slice();
    if (name === "Flat") prefs.preamp = 0;
    prefs.preset = name;
    prefs.eqOn = name !== "Flat" || prefs.eqOn;
    if (!media.paused && prefs.eqOn) ensureGraph().then(applyEq);
    else applyEq();
    save();
  }

  function startViz() {
    if (raf || destroyed || isVideo() || !graph || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const g2 = canvas.getContext("2d");
    const freqData = new Uint8Array(graph.analyser.frequencyBinCount);
    const timeData = new Uint8Array(graph.analyser.frequencyBinCount);
    let last = 0;
    const frame = (now) => {
      raf = 0;
      if (destroyed || media.paused || document.hidden || !canvas.isConnected) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // about 30 pictures a second is plenty, and light
      last = now;
      vizPhase++;
      graph.analyser.getByteFrequencyData(freqData);
      if (prefs.vizMode === "oscilloscope" && typeof graph.analyser.getByteTimeDomainData === "function") {
        graph.analyser.getByteTimeDomainData(timeData);
      }
      const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#00ff41";
      renderAudioVisualizer(g2, canvas.width, canvas.height, prefs.vizMode, freqData, timeData, peaks, accent, vizPhase);
    };
    raf = requestAnimationFrame(frame);
  }

  // --- loading a track -----------------------------------------------------------------------------------------
  function showInfo() {
    const t = tags ?? {};
    title.textContent = t.title || entry.name.replace(/\.[^.]+$/, "");
    artist.textContent = [t.artist, t.album, t.year, t.track ? `track ${t.track}` : ""].filter(Boolean).join("  ·  ") || `${formatSize(entry.size)}`;
    art.style.backgroundImage = cover ? `url("${cover}")` : "";
    art.textContent = cover ? "" : mediaKindOfName(entry.name) === "video" ? "🎞️" : "🎵";
    root.classList.toggle("is-video", isVideo());
    root.classList.toggle("has-cover", !!cover);
    refreshMediaSession();
  }

  function clearTracks() {
    media.querySelectorAll("track").forEach((t) => t.remove());
    trackUrls.forEach((u) => URL.revokeObjectURL(u));
    trackUrls = [];
    subSelect.replaceChildren();
    subSelect.hidden = true;
    lyricSources = [];
    lyricsSelect.replaceChildren();
    lyricsSelect.hidden = true;
    lyricsText.textContent = "";
    lyricsBtn.hidden = true;
    lyricsPanel.hidden = true;
    root.classList.toggle("has-panel", !eqPanel.hidden || !queuePanel.hidden);
  }

  async function loadSubtitles(token) {
    if (!isVideo()) return;
    const base = entry.name.replace(/\.[^.]+$/, "").toLowerCase();
    const found = subtitleEntries.filter((e) => {
      const n = e.name.toLowerCase();
      return SUBTITLE_EXTS.some((x) => n.endsWith(`.${x}`)) && n.startsWith(`${base}.`);
    });
    if (!found.length) return;
    for (const [i, sub] of found.entries()) {
      try {
        const res = await fetch(rawUrl(sub.path));
        if (!res.ok) continue;
        const url = URL.createObjectURL(new Blob([srtToVtt(await res.text())], { type: "text/vtt" }));
        if (token !== loadToken || destroyed) { URL.revokeObjectURL(url); return; }
        trackUrls.push(url);
        const label = sub.name.slice(base.length + 1).replace(/\.(srt|vtt)$/i, "") || `Subtitles ${i + 1}`;
        media.append(h("track", { kind: "subtitles", label, src: url, srclang: label.slice(0, 2).toLowerCase() }));
      } catch { /* a subtitle file that won't load is skipped */ }
    }
    refreshSubtitleOptions();
    setSubtitle(-1);
  }

  function refreshSubtitleOptions() {
    const tracks = [...media.textTracks];
    subSelect.replaceChildren(
      h("option", { value: "-1" }, "Subtitles: off"),
      ...tracks.map((track, i) => h("option", { value: String(i) }, track.label || track.language || `Subtitle ${i + 1}`)),
    );
    subSelect.hidden = tracks.length === 0;
    if (Number(subSelect.value) >= tracks.length) setSubtitle(-1);
  }

  function setSubtitle(index) {
    [...media.textTracks].forEach((t, i) => { t.mode = i === index ? "showing" : "disabled"; });
    subSelect.value = String(index);
  }

  async function loadLyrics(token, embedded) {
    const add = (label, text) => {
      const value = String(text ?? "").trim();
      if (value) lyricSources.push({ label, text: value });
    };
    add("Embedded lyrics", embedded);
    const base = entry.name.replace(/\.[^.]+$/, "").toLowerCase();
    const allowed = isVideo() ? [...LYRIC_EXTS, ...SUBTITLE_EXTS] : LYRIC_EXTS;
    const found = subtitleEntries.filter((e) => {
      const name = e.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf(".") + 1);
      return name.startsWith(`${base}.`) && allowed.includes(ext);
    }).sort((a, b) => a.name.localeCompare(b.name));
    for (const sidecar of found) {
      if (sidecar.size > 256 * 1024) {
        if (token === loadToken && !destroyed) showMessage(`Lyrics file “${sidecar.name}” is larger than the 256 KB display limit.`);
        continue;
      }
      try {
        const res = await fetch(lyricsUrl(sidecar.path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (token !== loadToken || destroyed) return;
        const ext = sidecar.name.slice(sidecar.name.lastIndexOf(".") + 1).toLowerCase();
        add(sidecar.name, ext === "srt" || ext === "vtt" ? subtitleText(text) : text);
      } catch (err) {
        if (token === loadToken && !destroyed) showMessage(`Couldn't load lyrics file “${sidecar.name}”: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (token !== loadToken || destroyed || !lyricSources.length) return;
    lyricsSelect.replaceChildren(...lyricSources.map((source, i) => h("option", { value: String(i) }, source.label)));
    lyricsSelect.hidden = lyricSources.length < 2;
    lyricsBtn.hidden = false;
    const first = lyricSources[0];
    if (first) lyricsText.textContent = first.text;
  }

  async function loadEntry(next, autoplay = true) {
    entry = next;
    const token = ++loadToken;
    tags = null; cover = ""; loop = { a: null, b: null };
    showMessage("");
    clearTracks();
    if (!media.paused) media.pause();
    media.src = rawUrl(entry.path);
    media.load();
    showInfo();
    renderQueue();
    refreshButtons();
    drawAb();
    onTrack?.(entry);
    say(`Playing ${entry.name}`);
    if (autoplay) play();
    if (isVideo()) {
      loadLyrics(token, null);
    } else {
      readTags(entry).then(async (t) => {
        if (token !== loadToken || destroyed) return;
        if (t) {
          tags = t;
          if (t.cover && t.cover.data.length <= MAX_COVER_BYTES) { try { cover = await dataUrlOf(new Blob([t.cover.data], { type: t.cover.mime })); } catch { cover = ""; } }
          if (token === loadToken && !destroyed) showInfo();
        }
        await loadLyrics(token, t?.lyrics);
      }).catch((err) => {
        if (token === loadToken && !destroyed) showMessage(`Couldn't read this file's media tags: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    loadSubtitles(token);
  }

  function playIndex(listIndex) {
    queue.jumpTo(listIndex);
    loadEntry(list[queue.index]);
  }

  async function play() {
    try {
      await media.play();
      // Keep video (.mov/.mp4) on the native hardware A/V clock unless EQ or stereo balance DSP is actively enabled.
      if (!isVideo() || prefs.eqOn || prefs.balance !== 0) {
        await ensureGraph();
        graph?.ctx.resume?.();
      }
      startViz();
    } catch (err) {
      // Only a refusal for lack of a click or key press gets this message; a format that can't be played has its own (the error event).
      if (err && err.name === "NotAllowedError") showMessage("Press Play to start. This window needs a click or key press before it may play sound.");
    }
    refreshButtons();
  }

  function toggle() { if (media.paused) play(); else media.pause(); }
  function next(auto) { const i = queue.next(auto); if (i === null) { media.pause(); refreshButtons(); return; } loadEntry(list[i]); }
  function previous() {
    const r = queue.prev(media.currentTime);
    if (r.restart) { media.currentTime = 0; if (media.paused) play(); } else loadEntry(list[r.index]);
  }
  function setShuffle(on) { queue.setShuffle(on); prefs.shuffle = on; save(); refreshButtons(); say(`Shuffle ${on ? "on" : "off"}`); }
  function setRepeat(mode) { prefs.repeat = mode; save(); refreshButtons(); say(`Repeat ${mode === "off" ? "off" : mode === "all" ? "all" : "this one"}`); }
  function cycleLoop() {
    if (loop.a === null) { loop = { a: media.currentTime, b: null }; say("Loop start set"); }
    else if (loop.b === null) { loop.b = Math.max(media.currentTime, loop.a + 0.5); media.currentTime = loop.a; say("Loop on"); }
    else { loop = { a: null, b: null }; say("Loop off"); }
    refreshButtons(); drawAb();
  }
  function seekBy(sec) { if (Number.isFinite(media.duration)) media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + sec)); }
  /**
   * Volume and mute. Once the sound goes through the audio graph (spectrum and equalizer), some engines (WebKit, which
   * the desktop window uses) ignore the element's own volume and mute, so the graph's last gain does both and the
   * element stays at full volume; without a graph the element does it.
   */
  function applyLevel() {
    if (graph) {
      media.volume = 1;
      media.muted = false;
      graph.out.gain.value = silent ? 0 : level;
    } else {
      media.volume = level;
      media.muted = silent;
    }
    const pct = Math.round((silent ? 0 : level) * 100);
    volume.value = String(pct);
    volume.setAttribute("aria-valuetext", `${pct}%`);
    syncSliderVars(volume);
    prefs.volume = level; prefs.muted = silent; save(); refreshButtons();
  }
  function setVolume(v) { level = Math.max(0, Math.min(1, v)); if (level > 0) silent = false; applyLevel(); }
  function setMuted(on) { silent = on; applyLevel(); say(on ? "Muted" : "Sound on"); }
  function setRate(r) { media.playbackRate = r; prefs.rate = r; speed.value = String(r); save(); say(`Speed ${r}`); }
  function togglePanel(which) {
    const panels = { eq: eqPanel, queue: queuePanel, lyrics: lyricsPanel };
    const panel = panels[which];
    if (!panel) return;
    const open = panel.hidden;
    Object.values(panels).forEach((item) => { item.hidden = true; });
    panel.hidden = !open;
    root.classList.toggle("has-panel", !panel.hidden);
    if (which === "eq" && !panel.hidden) ensureGraph().then(applyEq);
  }
  /**
   * Full screen: the real thing where the engine allows it; otherwise (the desktop window's WebKit view has element
   * full screen switched off) the player fills the whole window, controls included. F, the button or Esc leaves it.
   */
  const fsElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
  function setFill(on) {
    root.classList.toggle("mp-fill", on);
    fsBtn.setAttribute("aria-pressed", String(on));
    fsBtn.title = on ? "Leave full screen (F or Esc)" : "Full screen (F)";
    say(on ? "Full screen" : "Full screen off");
  }
  async function fullscreen() {
    if (root.classList.contains("mp-fill")) return setFill(false);
    if (fsElement()) {
      try { await (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document); } catch { /* already out */ }
      return;
    }
    try {
      if (stage.requestFullscreen && document.fullscreenEnabled) return await stage.requestFullscreen();
      if (stage.webkitRequestFullscreen && document.webkitFullscreenEnabled) return stage.webkitRequestFullscreen();
    } catch { /* refused: fill the window instead */ }
    setFill(true);
  }
  /** Picture in picture: the standard way, or WebKit's presentation mode (Safari and the desktop window). */
  const webkitPip = () => typeof media.webkitSupportsPresentationMode === "function" && media.webkitSupportsPresentationMode("picture-in-picture");
  const canPip = () => (!!document.pictureInPictureEnabled && typeof media.requestPictureInPicture === "function") || webkitPip();
  async function pip() {
    try {
      if (document.pictureInPictureEnabled && typeof media.requestPictureInPicture === "function") {
        if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await media.requestPictureInPicture();
        return;
      }
      if (webkitPip()) return media.webkitSetPresentationMode(media.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
    } catch { /* refused: say so below */ }
    showMessage("Picture in picture isn't available for this video.");
  }

  // --- computer media keys and the lock screen ---------------------------------------------------------------
  function refreshMediaSession() {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: title.textContent, artist: tags?.artist ?? "", album: tags?.album ?? "", artwork: cover ? [{ src: cover }] : [] });
    } catch { /* not supported */ }
  }
  function wireMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* an action this engine lacks */ } };
    set("play", () => play()); set("pause", () => media.pause());
    set("previoustrack", () => previous()); set("nexttrack", () => next(false));
    set("seekbackward", () => seekBy(-10)); set("seekforward", () => seekBy(10));
    set("seekto", (d) => { if (typeof d.seekTime === "number") media.currentTime = d.seekTime; });
  }

  // --- events --------------------------------------------------------------------------------------------------
  media.addEventListener("timeupdate", () => { refreshTime(); drawAb(); });
  media.addEventListener("durationchange", () => { refreshTime(); drawAb(); });
  media.addEventListener("play", () => { refreshButtons(); startViz(); });
  media.addEventListener("pause", refreshButtons);
  media.addEventListener("ended", () => next(true));
  media.addEventListener("error", () => {
    showMessage(`The built-in player can't play “${entry.name}”. Its format or codec may not be supported on this computer. Press Enter to open it in another program.`);
    refreshButtons();
  });
  media.addEventListener("loadedmetadata", () => {
    refreshSubtitleOptions();
    if (isVideo() && media.videoWidth) artist.textContent = `${artist.textContent}  ·  ${media.videoWidth} × ${media.videoHeight}`;
  });
  elapsed.addEventListener("click", () => {
    prefs.remainingTime = !prefs.remainingTime;
    save();
    refreshTime();
  });
  canvas.addEventListener("click", () => { if (!isVideo()) cycleVizMode(); });
  seek.addEventListener("input", () => {
    syncSliderVars(seek);
    if (Number.isFinite(media.duration)) media.currentTime = (Number(seek.value) / 1000) * media.duration;
  });
  volume.addEventListener("input", () => setVolume(Number(volume.value) / 100));
  speed.addEventListener("change", () => setRate(Number(speed.value)));
  vizSelect.addEventListener("change", () => setVizMode(vizSelect.value));
  skinSelect.addEventListener("change", () => {
    prefs.skin = skinSelect.value;
    root.dataset.skin = prefs.skin;
    if (media.paused || !graph) drawIdleViz();
    save();
  });
  subSelect.addEventListener("change", () => setSubtitle(Number(subSelect.value)));
  lyricsSelect.addEventListener("change", () => {
    const source = lyricSources[Number(lyricsSelect.value)];
    if (source) lyricsText.textContent = source.text;
  });
  eqOn.addEventListener("change", () => {
    prefs.eqOn = eqOn.checked;
    if (!media.paused && prefs.eqOn) ensureGraph().then(applyEq);
    else applyEq();
    save();
  });
  eqPreset.addEventListener("change", () => { if (eqPreset.value !== "Custom") applyPreset(eqPreset.value); });
  stage.addEventListener("click", (e) => { if (isVideo() && e.target === media) toggle(); });
  stage.addEventListener("dblclick", (e) => { if (isVideo() && e.target === media) fullscreen(); });
  document.addEventListener("visibilitychange", startViz);

  /** The keys the player owns. Returns true when it used the key. */
  function handleKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === " " || lower === "k") toggle();
    else if (k === "ArrowRight") seekBy(e.shiftKey ? 30 : 5);
    else if (k === "ArrowLeft") seekBy(e.shiftKey ? -30 : -5);
    else if (k === "ArrowUp") setVolume(level + 0.05);
    else if (k === "ArrowDown") setVolume(level - 0.05);
    else if (lower === "m") setMuted(!silent);
    else if (lower === "n" || k === "PageDown") next(false);
    else if (lower === "b" || k === "PageUp") previous();
    else if (k === "Home") media.currentTime = 0;
    else if (k === "End") { if (Number.isFinite(media.duration)) media.currentTime = Math.max(0, media.duration - 0.1); }
    else if (/^[0-9]$/.test(k)) { if (Number.isFinite(media.duration)) media.currentTime = (Number(k) / 10) * media.duration; }
    else if (k === "[") setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(prefs.rate) - 1)]);
    else if (k === "]") setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(prefs.rate) + 1)]);
    else if (lower === "a") cycleLoop();
    else if (lower === "r") setRepeat(queue.cycleRepeat());
    else if (lower === "s") setShuffle(!queue.shuffle);
    else if (lower === "v" && !isVideo()) cycleVizMode();
    else if (lower === "w") openInDeck();
    else if (lower === "f" && isVideo()) fullscreen();
    else if (lower === "e") togglePanel("eq");
    else if (lower === "q") togglePanel("queue");
    else if (lower === "l" && !lyricsBtn.hidden) togglePanel("lyrics");
    else if (lower === "c" && !subSelect.hidden) { const n = Number(subSelect.value) + 1; setSubtitle(n >= media.textTracks.length ? -1 : n); }
    else if ((k === "," || k === ".") && isVideo() && media.paused) media.currentTime += k === "." ? 1 / 30 : -1 / 30;
    else return false;
    refreshButtons();
    return true;
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", startViz);
    try { if (document.pictureInPictureElement === media) document.exitPictureInPicture().catch(() => {}); } catch { /* already out */ }
    try { if (media.webkitPresentationMode === "picture-in-picture") media.webkitSetPresentationMode("inline"); } catch { /* already out */ }
    try { if (fsElement()) Promise.resolve((document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)).catch(() => {}); } catch { /* already out */ }
    media.pause();
    clearTracks();
    media.removeAttribute("src");
    media.load();
    graph?.ctx.close?.().catch(() => {});
    if ("mediaSession" in navigator) {
      for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"]) { try { navigator.mediaSession.setActionHandler(a, null); } catch { /* not set */ } }
      try { navigator.mediaSession.metadata = null; } catch { /* not set */ }
    }
  }

  wireMediaSession();
  applyEq();
  renderQueue();
  refreshButtons();
  loadEntry(entry);

  return {
    root,
    handleKey,
    destroy,
    /** Leaves the "fill the window" full screen. Returns true when it was on (so Esc did something). */
    leaveFill() { if (!root.classList.contains("mp-fill")) return false; setFill(false); return true; },
    /** The entry the player is on now. */
    current: () => entry,
    /** Starts another file that is in the queue (when Quick Look is asked to show it). Returns false when it isn't. */
    show(target) {
      const i = list.findIndex((e) => e.path === target.path);
      if (i < 0) return false;
      if (entry.path !== target.path) playIndex(i);
      return true;
    },
    media,
  };
}

