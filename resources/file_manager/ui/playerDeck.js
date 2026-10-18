// Media Deck (Power tool + persistent Window Shade mini-player): modular audio & video rack for the modern desktop.
// Includes the Main Deck (clickable LED clock, bitrate/kHz/stereo readout, scrolling marquee, four-mode
// spectrum/oscilloscope/radial/VU visualizer with falling peak-hold caps, vinyl pitch mode, stereo balance, A-B loop),
// the 10-band Graphic Equalizer + Preamp + DSP boosts with a live spline frequency curve, the Playlist Editor with Jump-to-
// File filter and M3U/M3U8 import/export, synced karaoke .lrc lyrics, five skins, and a persistent Window Shade bar when
// you go back to browsing files.
import { call, lyricsUrl, rawUrl } from "./api.js";
import { $, announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { visibleEntries } from "./nav.js";
import { currentPath } from "./pane.js";
import { activePowerTab, openPower, powerIsOpen, registerPowerTab } from "./power.js";
import { closeQuickLook, quickLookIsOpen } from "./quicklook.js";
import { selectedEntries } from "./selection.js";
import { on, state } from "./state.js";
import { extensionOf, formatSize } from "./util.js";
import {
  DECK_HARDWARE_TIERS, EQ_BANDS, EQ_PRESETS, LYRIC_EXTS, MAX_VIZ_LAYERS, PLAYER_SKINS, PlayQueue,
  SUBTITLE_EXTS, VIZ_CATEGORIES, VIZ_MIX_PRESETS, VIZ_MODES, activeLrcIndex, clampBalance, clampGain,
  detectDeckHardwareTier, formatClock, formatLedClock, formatM3u, formatVizLabel, isPlaylistFile,
  mediaKindOfName, normalizeVizSpec, parseLrc, parseM3u, parseVizLayers, srtToVtt, subtitleText,
} from "./mediacore.js";
import { drawEqSplineCanvas, readTags, renderAudioVisualizer } from "./mediaplayer.js";

const DECK_PREFS_KEY = "fm_media_deck_v1";
const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const MAX_COVER_BYTES = 8 * 1024 * 1024;

function syncSliderVars(el) {
  if (!el) return;
  el.style.setProperty("--attr-min", el.min || "0");
  el.style.setProperty("--attr-max", el.max || "100");
  el.style.setProperty("--control-value", el.value || "0");
}

function loadDeckPrefs() {
  const d = {
    skin: "classic",
    vizMode: "spectrum",
    hwTier: "auto",
    vizMixMode: false,
    clock24h: false,
    volume: 0.85,
    muted: false,
    balance: 0,
    rate: 1,
    vinylPitch: false,
    repeat: "all",
    shuffle: false,
    eqOn: true,
    preamp: 0,
    eq: EQ_PRESETS["Full Bass & Treble"] ? EQ_PRESETS["Full Bass & Treble"].slice() : EQ_PRESETS.Flat.slice(),
    preset: "Full Bass & Treble",
    dspBass: false,
    dspTreble: false,
    dspVocal: false,
    showEq: true,
    showPl: true,
    showLyr: true,
    showFx: false,
    shadeMode: false,
    remainingTime: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(DECK_PREFS_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      if (PLAYER_SKINS.some((s) => s.id === raw.skin)) d.skin = raw.skin;
      if (typeof raw.vizMode === "string" && raw.vizMode.trim()) {
        d.vizMode = normalizeVizSpec(raw.vizMode);
      }
      if (DECK_HARDWARE_TIERS.some((t) => t.id === raw.hwTier)) d.hwTier = raw.hwTier;
      d.vizMixMode = raw.vizMixMode === true;
      d.clock24h = raw.clock24h === true;
      if (typeof raw.volume === "number") d.volume = Math.max(0, Math.min(1, raw.volume));
      d.muted = raw.muted === true;
      if (typeof raw.balance === "number") d.balance = clampBalance(raw.balance);
      if (SPEEDS.includes(raw.rate)) d.rate = raw.rate;
      d.vinylPitch = raw.vinylPitch === true;
      if (raw.repeat === "all" || raw.repeat === "one" || raw.repeat === "off") d.repeat = raw.repeat;
      d.shuffle = raw.shuffle === true;
      if (typeof raw.eqOn === "boolean") d.eqOn = raw.eqOn;
      if (typeof raw.preamp === "number") d.preamp = clampGain(raw.preamp);
      if (Array.isArray(raw.eq) && raw.eq.length === EQ_BANDS.length) d.eq = raw.eq.map(clampGain);
      if (typeof raw.preset === "string") d.preset = raw.preset;
      d.dspBass = raw.dspBass === true;
      d.dspTreble = raw.dspTreble === true;
      d.dspVocal = raw.dspVocal === true;
      if (typeof raw.showEq === "boolean") d.showEq = raw.showEq;
      if (typeof raw.showPl === "boolean") d.showPl = raw.showPl;
      if (typeof raw.showLyr === "boolean") d.showLyr = raw.showLyr;
      if (typeof raw.showFx === "boolean") d.showFx = raw.showFx;
      d.shadeMode = raw.shadeMode === true;
      d.remainingTime = raw.remainingTime === true;
    }
  } catch { /* defaults are fine */ }
  return d;
}

const saveDeckPrefs = (prefs) => {
  try { localStorage.setItem(DECK_PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
};

const dataUrlOf = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

let deckController = null;

/** Opens the Media Deck and plays or enqueues the given entries or paths. */
export function openInMediaDeck(opts = {}) {
  if (quickLookIsOpen()) closeQuickLook();
  openPower("player", opts);
}

function mount(root) {
  const prefs = loadDeckPrefs();
  let tracks = []; // Array<{ name, path, size, isDir?: false, title?: string, artist?: string, album?: string, duration?: number }>
  let subtitlePool = [];
  let queue = new PlayQueue(0, 0);
  queue.setRepeat(prefs.repeat);
  if (prefs.shuffle) queue.setShuffle(true);

  let currentEntry = null;
  let currentTags = null;
  let currentCover = "";
  let loop = { a: null, b: null };
  let graph = null; // { ctx, preamp, filters, dspLow, dspHigh, dspMid, panner, analyser, out }
  let graphTried = false;
  let raf = 0;
  let loadToken = 0;
  let trackUrls = [];
  let lyricSources = [];
  let activeLrcCues = [];
  let lastActiveCue = -1;
  let plFilter = "";
  let fxSearchQuery = "";
  let fxCategory = "all";
  let sleepRemainingMin = 0;
  let sleepInterval = 0;
  const peaks = new Float32Array(64);
  let vizPhase = 0;
  let vizAutoCycle = false;
  let userEnabledVideoDsp = false;

  const media = h("video", { class: "wa-media", playsinline: true, preload: "metadata", "aria-label": "Media Deck player" });
  media.volume = prefs.volume;
  media.muted = prefs.muted;
  media.defaultPlaybackRate = media.playbackRate = prefs.rate;
  media.preservesPitch = !prefs.vinylPitch;

  const save = () => saveDeckPrefs(prefs);
  const isVideo = () => !!(currentEntry && mediaKindOfName(currentEntry.name) === "video");
  const effectiveHwTier = () => (prefs.hwTier === "auto" ? detectDeckHardwareTier() : prefs.hwTier);

  // --- Studio Clock, Date & Sleep Timer --------------------------------------------------------------------------
  const studioClockBtn = h("button", {
    type: "button",
    class: "wa-studio-clock",
    title: "Studio Clock & Date — click to toggle 12h / 24h format",
    "aria-label": "Studio clock and date",
    onclick: () => {
      prefs.clock24h = !prefs.clock24h;
      updateStudioClock();
      save();
    },
  }, "🕒 --:--");

  function updateStudioClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: !prefs.clock24h,
    });
    const dateStr = now.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    studioClockBtn.textContent = `🕒 ${timeStr} · ${dateStr}`;
  }
  updateStudioClock();
  const clockInterval = setInterval(() => {
    if (shell.isConnected) updateStudioClock();
    else clearInterval(clockInterval);
  }, 15000);

  const sleepBtn = h("button", {
    type: "button",
    class: "wa-pill-btn wa-sleep-btn",
    title: "Sleep Timer: automatically fade and stop playback after 15m / 30m / 60m",
    onclick: () => cycleSleepTimer(),
  }, "🌙 Sleep");

  function cycleSleepTimer() {
    const steps = [0, 15, 30, 60];
    const nextIdx = (steps.indexOf(sleepRemainingMin) + 1) % steps.length;
    sleepRemainingMin = steps[nextIdx];
    if (sleepInterval) {
      clearInterval(sleepInterval);
      sleepInterval = 0;
    }
    if (sleepRemainingMin > 0) {
      sleepBtn.textContent = `🌙 ${sleepRemainingMin}m`;
      sleepBtn.classList.add("is-on");
      toast(`Sleep timer set for ${sleepRemainingMin} minutes.`, { kind: "info" });
      sleepInterval = setInterval(() => {
        if (!shell.isConnected) {
          clearInterval(sleepInterval);
          return;
        }
        sleepRemainingMin = Math.max(0, sleepRemainingMin - 1);
        if (sleepRemainingMin === 0) {
          clearInterval(sleepInterval);
          sleepInterval = 0;
          sleepBtn.textContent = "🌙 Sleep";
          sleepBtn.classList.remove("is-on");
          stopPlayback();
          toast("Sleep timer finished — playback stopped.", { kind: "info" });
        } else {
          sleepBtn.textContent = `🌙 ${sleepRemainingMin}m`;
        }
      }, 60000);
    } else {
      sleepBtn.textContent = "🌙 Sleep";
      sleepBtn.classList.remove("is-on");
    }
  }

  // --- Titlebar & Rack Toggles -----------------------------------------------------------------------------------
  const skinSelect = h("select", { class: "wa-select wa-skin-select", "aria-label": "Player skin", title: "Change Media Deck skin (16 studio themes)" },
    ...PLAYER_SKINS.map((s) => h("option", { value: s.id, selected: s.id === prefs.skin }, `🎨 ${s.label}`)),
  );
  const fxToggleBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.showFx ? " is-on" : ""}`, "aria-pressed": String(prefs.showFx), title: "Show or hide the 108-Mode Visualizer & Atmospheric FX Mixer rack (X)", onclick: () => toggleRack("fx") }, "✨ FX");
  const eqToggleBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.showEq ? " is-on" : ""}`, "aria-pressed": String(prefs.showEq), title: "Show or hide the 10-band Graphic Equalizer rack (E)", onclick: () => toggleRack("eq") }, "EQ");
  const plToggleBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.showPl ? " is-on" : ""}`, "aria-pressed": String(prefs.showPl), title: "Show or hide the Playlist Editor rack (Q)", onclick: () => toggleRack("pl") }, "PL");
  const lyrToggleBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.showLyr ? " is-on" : ""}`, "aria-pressed": String(prefs.showLyr), title: "Show or hide the Synced Lyrics & Karaoke rack (L)", onclick: () => toggleRack("lyr") }, "LYR");
  const shadeToggleBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.shadeMode ? " is-on" : ""}`, "aria-pressed": String(prefs.shadeMode), title: "Toggle compact Window Shade mode", onclick: () => toggleRack("shade") }, "SHADE");

  const titlebar = h("header", { class: "wa-titlebar" },
    h("div", { class: "wa-brand" },
      h("span", { class: "wa-bolt", "aria-hidden": "true" }, "⚡"),
      h("span", { class: "wa-brand-title" }, "AMPDECK PRO // CODECAINE AUDIO & VIDEO RACK"),
      studioClockBtn,
    ),
    h("div", { class: "wa-titlebar-actions" },
      sleepBtn,
      h("div", { class: "wa-rack-toggles", role: "group", "aria-label": "Rack modules" }, fxToggleBtn, eqToggleBtn, plToggleBtn, lyrToggleBtn, shadeToggleBtn),
      skinSelect,
    ),
  );

  // --- Main Rack: Digital LCD Readout + Visualizer/Video Stage + Seek + Mixer + Transport ------------------------
  const ledClock = h("button", {
    type: "button", class: "wa-led-clock", title: "Click to switch between elapsed and remaining time",
    "aria-label": "Playback clock. Click to switch between elapsed and remaining time.",
    onclick: () => { prefs.remainingTime = !prefs.remainingTime; save(); refreshTime(); },
  }, "00:00");
  const playGlyph = h("div", { class: "wa-play-state", "aria-hidden": "true" }, "■ READY");

  const marqueeText = h("div", { class: "wa-marquee" }, "*** AMPDECK PRO — SELECT OR LOAD A TRACK TO PLAY ***");
  const marqueeWrap = h("div", { class: "wa-marquee-wrap", role: "status", "aria-live": "polite" }, marqueeText);

  const kbpsBadge = h("span", { class: "wa-badge", title: "Bitrate" }, "--- KBPS");
  const khzBadge = h("span", { class: "wa-badge", title: "Sample rate" }, "44.1 KHZ");
  const chanBadge = h("span", { class: "wa-badge wa-badge-active", title: "Stereo output" }, "STEREO");
  const pitchBadge = h("span", { class: "wa-badge", title: "Pitch mode" }, prefs.vinylPitch ? "VINYL" : "LOCK");
  const fxCountBadge = h("span", { class: "wa-badge wa-badge-active", title: "Active Visualizer & Atmospheric FX Layers" }, `${parseVizLayers(prefs.vizMode).length}FX`);
  const loopBadge = h("span", { class: "wa-badge wa-badge-active", title: "A-B loop", hidden: true }, "A–B");
  const stageStatus = h("p", { class: "wa-msg", role: "status", hidden: true });

  const displayBox = h("div", { class: "wa-display" },
    h("div", { class: "wa-lcd-left" }, ledClock, playGlyph),
    h("div", { class: "wa-lcd-right" },
      marqueeWrap,
      h("div", { class: "wa-badges" }, kbpsBadge, khzBadge, chanBadge, pitchBadge, fxCountBadge, loopBadge),
      stageStatus,
    ),
  );

  const vizCanvas = h("canvas", {
    class: "wa-viz", width: 540, height: 170,
    title: "Click to cycle visualizer preset (V)",
    onclick: () => cycleVizMode(),
  });
  const coverBox = h("div", { class: "wa-art", "aria-hidden": "true" }, "🎵");
  const customMixOption = h("option", { value: prefs.vizMode, hidden: !prefs.vizMode.includes("+") }, `🔀 ${formatVizLabel(prefs.vizMode)}`);
  const vizSelect = h("select", {
    class: "wa-select wa-viz-select",
    "aria-label": "Visualizer preset",
    title: "Choose from 108 real-time audio visualizers & multi-layer signature mixes",
  },
    customMixOption,
    h("optgroup", { label: "✨ Multi-Layer Signature Mixes (3FX)" },
      ...VIZ_MIX_PRESETS.map((p) => h("option", { value: p.id, selected: p.id === prefs.vizMode }, `${p.icon} ${p.label}`)),
    ),
    h("optgroup", { label: "🚀 Modern ARM / Apple M-Series Ultra" },
      ...VIZ_MODES.filter((m) => m.tier === "ultra").map((m) => h("option", { value: m.id, selected: m.id === prefs.vizMode }, `${m.icon || "🔮"} ${m.label}`)),
    ),
    h("optgroup", { label: "⚡ Medium Graphics (60fps Stage FX)" },
      ...VIZ_MODES.filter((m) => m.tier === "medium").map((m) => h("option", { value: m.id, selected: m.id === prefs.vizMode }, `${m.icon || "🌈"} ${m.label}`)),
    ),
    h("optgroup", { label: "🔋 Low Graphics (Eco Studio Analyzers)" },
      ...VIZ_MODES.filter((m) => m.tier === "low").map((m) => h("option", { value: m.id, selected: m.id === prefs.vizMode }, `${m.icon || "📊"} ${m.label}`)),
    ),
  );
  const vizModeBtn = h("button", {
    type: "button", class: "wa-viz-mode-btn",
    title: "Next visualizer preset (V)",
    onclick: () => cycleVizMode(),
  }, "⏭ Viz");
  const vizSurpriseBtn = h("button", {
    type: "button", class: "wa-viz-mode-btn",
    title: "Generate a creative 3-layer Visualizer + Atmospheric FX mix",
    onclick: () => surpriseVizMix(),
  }, "🎲 Mix");
  const vizFxStudioBtn = h("button", {
    type: "button", class: "wa-viz-mode-btn",
    title: "Open the 108-Mode Visualizer & Multi-Layer FX Studio Rack (X)",
    onclick: () => {
      if (!prefs.showFx) toggleRack("fx");
      fxRack.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    },
  }, "✨ 108 FX");
  const vizAutoBtn = h("button", {
    type: "button", class: "wa-viz-mode-btn",
    "aria-pressed": "false",
    title: "Auto-cycle through visualizers every 7 seconds",
    onclick: () => {
      vizAutoCycle = !vizAutoCycle;
      vizAutoBtn.classList.toggle("is-on", vizAutoCycle);
      vizAutoBtn.setAttribute("aria-pressed", String(vizAutoCycle));
    },
  }, "🔄 Auto");

  const subSelect = h("select", { class: "wa-select", hidden: true, "aria-label": "Video subtitles", title: "Choose subtitle track" });
  const pipBtn = h("button", { type: "button", class: "wa-pill-btn", hidden: true, title: "Picture in picture", "aria-label": "Picture in picture", onclick: () => togglePip() }, "⧉ PiP");
  const fsBtn = h("button", { type: "button", class: "wa-pill-btn", title: "Full screen stage (F)", "aria-label": "Full screen video", onclick: () => toggleFullscreen() }, "⛶ Full");

  const stageCard = h("div", { class: "wa-stage" },
    vizCanvas,
    media,
    coverBox,
    h("div", { class: "wa-stage-overlay" },
      h("div", { class: "wa-viz-controls" }, vizSelect, vizModeBtn, vizSurpriseBtn, vizFxStudioBtn, vizAutoBtn),
      h("div", { class: "wa-video-tools" }, subSelect, pipBtn, fsBtn),
    ),
  );

  const seekElapsed = h("span", { class: "wa-time" }, "0:00");
  const seekTotal = h("span", { class: "wa-time" }, "0:00");
  const seekInput = h("input", { type: "range", class: "wa-slider wa-seek", min: "0", max: "1000", step: "1", value: "0", "aria-label": "Track position" });
  const abHighlight = h("div", { class: "wa-ab-bar", hidden: true });
  const seekRow = h("div", { class: "wa-seek-row" },
    seekElapsed,
    h("div", { class: "wa-seek-wrap" }, seekInput, abHighlight),
    seekTotal,
  );

  const muteBtn = h("button", { type: "button", class: "wa-btn wa-btn-sm", title: "Mute or unmute sound (M)", "aria-label": "Mute", onclick: () => setMuted(!prefs.muted) }, "🔊");
  const volInput = h("input", { type: "range", class: "wa-slider", min: "0", max: "100", step: "1", value: String(Math.round(prefs.volume * 100)), "aria-label": "Volume" });
  const volLabel = h("span", { class: "wa-mix-val" }, `${Math.round(prefs.volume * 100)}%`);

  const balInput = h("input", { type: "range", class: "wa-slider", min: "-100", max: "100", step: "5", value: String(prefs.balance), "aria-label": "Stereo balance", ondblclick: () => setBalance(0) });
  const balLabel = h("span", { class: "wa-mix-val", title: "Click to reset stereo balance to center", style: "cursor:pointer", onclick: () => setBalance(0) }, "CTR");

  const speedSelect = h("select", { class: "wa-select", "aria-label": "Playback speed", title: "Playback speed ([ and ])" },
    ...SPEEDS.map((s) => h("option", { value: String(s), selected: s === prefs.rate }, `${s}×`)),
  );
  const vinylBtn = h("button", {
    type: "button", class: `wa-pill-btn${prefs.vinylPitch ? " is-on" : ""}`,
    "aria-pressed": String(prefs.vinylPitch),
    title: "Vinyl turntable mode: changing speed also shifts pitch",
    onclick: () => toggleVinylPitch(),
  }, "💿 Vinyl");

  const mixerRow = h("div", { class: "wa-mix-row" },
    h("div", { class: "wa-mix-cell" }, muteBtn, volInput, volLabel),
    h("div", { class: "wa-mix-cell" }, h("span", { class: "wa-mix-label" }, "PAN"), balInput, balLabel),
    h("div", { class: "wa-mix-cell" }, speedSelect, vinylBtn),
  );

  // --- Transport Controls ----------------------------------------------------------------------------------------
  const prevBtn = h("button", { type: "button", class: "wa-btn", title: "Previous track (B)", "aria-label": "Previous track", onclick: () => previous() }, "⏮");
  const playBtn = h("button", { type: "button", class: "wa-btn wa-btn-play", title: "Play or pause (Space)", "aria-label": "Play", onclick: () => togglePlay() }, "▶");
  const stopBtn = h("button", { type: "button", class: "wa-btn", title: "Stop playback", "aria-label": "Stop", onclick: () => stopPlayback() }, "⏹");
  const nextBtn = h("button", { type: "button", class: "wa-btn", title: "Next track (N)", "aria-label": "Next track", onclick: () => next(false) }, "⏭");
  const abLoopBtn = h("button", { type: "button", class: "wa-btn wa-btn-sm", title: "Set A–B repeat loop points (A)", "aria-label": "A-B loop", onclick: () => cycleAbLoop() }, "A–B");
  const shufBtn = h("button", { type: "button", class: `wa-btn wa-btn-sm${prefs.shuffle ? " is-on" : ""}`, "aria-pressed": String(prefs.shuffle), title: "Shuffle queue (S)", onclick: () => setShuffle(!queue.shuffle) }, "🔀 SHUF");
  const repBtn = h("button", { type: "button", class: `wa-btn wa-btn-sm${prefs.repeat !== "off" ? " is-on" : ""}`, title: "Cycle repeat mode (R)", onclick: () => setRepeat(queue.cycleRepeat()) }, "🔁 REP ALL");
  const loadFolderBtn = h("button", { type: "button", class: "wa-pill-btn", title: "Load all audio and video files from the current File Manager folder", onclick: () => loadCurrentFolder(true) }, "📂 Folder");
  const addSelBtn = h("button", { type: "button", class: "wa-pill-btn", title: "Add the files selected in the File Manager to the playlist", onclick: () => addSelectedFromManager() }, "➕ Selected");
  const loadLibBtn = h("button", { type: "button", class: "wa-pill-btn", title: "Load the local Codecaine music lyrics library", onclick: () => loadCodecaineLibrary() }, "🎵 Library");

  const transportBar = h("div", { class: "wa-transport-row" },
    h("div", { class: "wa-transport-main" }, prevBtn, playBtn, stopBtn, nextBtn, abLoopBtn, shufBtn, repBtn),
    h("div", { class: "wa-transport-modes" }, loadFolderBtn, addSelBtn, loadLibBtn),
  );

  const mainRack = h("section", { class: "wa-rack wa-main-rack", "aria-label": "Main Media Deck" },
    displayBox,
    stageCard,
    seekRow,
    mixerRow,
    transportBar,
  );

  // --- Equalizer & DSP Rack --------------------------------------------------------------------------------------
  const eqOnCheck = h("input", { type: "checkbox", checked: prefs.eqOn, "aria-label": "Equalizer enabled" });
  const eqPresetSelect = h("select", { class: "wa-select", "aria-label": "Equalizer preset", title: "Choose an equalizer preset" },
    ...Object.keys(EQ_PRESETS).map((name) => h("option", { value: name, selected: name === prefs.preset }, name)),
    h("option", { value: "Custom", selected: !Object.keys(EQ_PRESETS).includes(prefs.preset) }, "Custom"),
  );
  const eqFlatBtn = h("button", { type: "button", class: "wa-pill-btn", title: "Reset all bands and preamp to 0 dB Flat", onclick: () => applyPreset("Flat") }, "Flat");
  const dspBassBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.dspBass ? " is-on" : ""}`, "aria-pressed": String(prefs.dspBass), title: "Sub-bass boost (+5 dB below 90 Hz)", onclick: () => toggleDsp("dspBass") }, "🔊 Sub-Bass +5dB");
  const dspTrebleBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.dspTreble ? " is-on" : ""}`, "aria-pressed": String(prefs.dspTreble), title: "Air treble crispness (+4 dB above 6 kHz)", onclick: () => toggleDsp("dspTreble") }, "✨ Air Exciter +4dB");
  const dspVocalBtn = h("button", { type: "button", class: `wa-pill-btn${prefs.dspVocal ? " is-on" : ""}`, "aria-pressed": String(prefs.dspVocal), title: "Vocal presence boost (+3.5 dB around 1.8 kHz)", onclick: () => toggleDsp("dspVocal") }, "🎙️ Vocal Presence");

  const eqSplineCanvas = h("canvas", { class: "wa-eq-curve", width: 320, height: 62, "aria-hidden": "true" });
  const preampValLabel = h("span", { class: "wa-band-val" }, `${prefs.preamp > 0 ? "+" : ""}${prefs.preamp}dB`);
  const preampSlider = h("input", {
    type: "range", class: "wa-vslider", min: "-12", max: "12", step: "1",
    value: String(prefs.preamp), orient: "vertical", "aria-label": "Preamp gain",
    oninput: () => onPreampInput(),
  });
  const bandValLabels = EQ_BANDS.map((_, i) => h("span", { class: "wa-band-val" }, `${prefs.eq[i] > 0 ? "+" : ""}${prefs.eq[i]}dB`));
  const bandSliders = EQ_BANDS.map((hz, i) => h("input", {
    type: "range", class: "wa-vslider", min: "-12", max: "12", step: "1",
    value: String(prefs.eq[i]), orient: "vertical",
    "aria-label": `${hz >= 1000 ? `${hz / 1000} kilohertz` : `${hz} hertz`} equalizer gain`,
    oninput: () => onBandInput(i),
  }));

  const eqRack = h("section", { class: "wa-rack wa-eq-rack", "aria-label": "Graphic Equalizer and DSP", hidden: !prefs.showEq },
    h("header", { class: "wa-rack-head" },
      h("span", { class: "wa-rack-title" }, "🎚 GRAPHIC EQUALIZER // 10-BAND + PREAMP"),
      h("div", { class: "wa-rack-controls" },
        h("label", { class: "wa-eq-toggle" }, eqOnCheck, " ON"),
        eqPresetSelect,
        eqFlatBtn,
      ),
    ),
    h("div", { class: "wa-eq-body" },
      eqSplineCanvas,
      h("div", { class: "wa-eq-bands" },
        h("div", { class: "wa-band-col wa-preamp-col" }, preampValLabel, preampSlider, h("span", { class: "wa-band-lbl" }, "PRE")),
        ...EQ_BANDS.map((hz, i) => h("div", { class: "wa-band-col" },
          bandValLabels[i],
          bandSliders[i],
          h("span", { class: "wa-band-lbl" }, hz >= 1000 ? `${hz / 1000}k` : String(hz)),
        )),
      ),
    ),
    h("div", { class: "wa-dsp-row" },
      h("span", { class: "wa-dsp-title" }, "DSP FX:"),
      dspBassBtn,
      dspTrebleBtn,
      dspVocalBtn,
    ),
  );

  // --- Playlist Editor Rack --------------------------------------------------------------------------------------
  const plSearchInput = h("input", {
    type: "search", class: "wa-pl-filter",
    placeholder: "Jump to file (filter tracks by name, artist or format)...",
    "aria-label": "Filter playlist tracks",
  });
  const plCountLabel = h("span", { class: "wa-pl-stats" }, "0 tracks");
  const plList = h("ol", { class: "wa-pl-list", "aria-label": "Playlist tracks" });
  const plEmpty = h("div", { class: "wa-pl-empty" },
    "Playlist is empty. Click “📂 Folder” or “🎵 Library” to load tracks, or drag audio/video files here.",
  );

  const plRack = h("section", { class: "wa-rack wa-pl-rack", "aria-label": "Playlist Editor", hidden: !prefs.showPl },
    h("header", { class: "wa-rack-head" },
      h("span", { class: "wa-rack-title" }, "☰ PLAYLIST EDITOR // M3U8"),
      h("div", { class: "wa-rack-controls" },
        h("button", { type: "button", class: "wa-pill-btn", title: "Load the local Codecaine music lyrics library", onclick: () => loadCodecaineLibrary() }, "🎵 Music Library"),
        h("button", { type: "button", class: "wa-pill-btn", title: "Replace playlist with current folder's media", onclick: () => loadCurrentFolder(true) }, "📂 Folder"),
        h("button", { type: "button", class: "wa-pill-btn", title: "Import a selected .m3u or .m3u8 playlist file", onclick: () => importM3uFromSelection() }, "📥 Load .M3U"),
        h("button", { type: "button", class: "wa-pill-btn", title: "Save this playlist as playlist.m3u8 in the current folder", onclick: () => exportM3uToFolder() }, "💾 Save .M3U8"),
        h("button", { type: "button", class: "wa-pill-btn", title: "Sort playlist alphabetically", onclick: () => sortPlaylist("name") }, "A–Z"),
        h("button", { type: "button", class: "wa-pill-btn", title: "Clear playlist", onclick: () => clearPlaylist() }, "🗑 Clear"),
      ),
    ),
    h("div", { class: "wa-pl-toolbar" }, plSearchInput, plCountLabel),
    plList,
    plEmpty,
  );

  // --- Synced Karaoke Lyrics Rack --------------------------------------------------------------------------------
  const lyrSelect = h("select", { class: "wa-select", hidden: true, "aria-label": "Lyrics source" });
  const lyrBody = h("div", { class: "wa-lyr-body", "aria-label": "Lyrics" },
    h("pre", { class: "wa-lyr-plain" }, "Synced .lrc or embedded lyrics will appear here when a track plays."),
  );
  const lyrRack = h("section", { class: "wa-rack wa-lyr-rack", "aria-label": "Synced Lyrics", hidden: !prefs.showLyr },
    h("header", { class: "wa-rack-head" },
      h("span", { class: "wa-rack-title" }, "♪ SYNCED LRC & LYRICS"),
      h("div", { class: "wa-rack-controls" }, lyrSelect),
    ),
    lyrBody,
  );

  // --- 108-Mode Visualizer & Atmospheric FX Studio Rack (Multi-Layer Mixer + Hardware Tiers) --------------------
  const fxMixToggleBtn = h("button", {
    type: "button",
    class: `wa-pill-btn${prefs.vizMixMode ? " is-on" : ""}`,
    "aria-pressed": String(prefs.vizMixMode),
    title: "When enabled, clicking any visualizer card adds or removes it as a layer (up to 4 simultaneous effects)",
    onclick: () => {
      prefs.vizMixMode = !prefs.vizMixMode;
      fxMixToggleBtn.classList.toggle("is-on", prefs.vizMixMode);
      fxMixToggleBtn.setAttribute("aria-pressed", String(prefs.vizMixMode));
      save();
      renderFxRack();
    },
  }, `🔀 Mix Mode (Up to ${MAX_VIZ_LAYERS})`);

  const fxSurpriseMixBtn = h("button", {
    type: "button",
    class: "wa-pill-btn",
    title: "Generate a creative 3-layer mix combining an atmospheric backdrop, middle harmonic wave/mandala, and foreground analyzer",
    onclick: () => surpriseVizMix(),
  }, "🎲 Surprise 3-Layer Mix");

  const fxClearMixBtn = h("button", {
    type: "button",
    class: "wa-pill-btn",
    title: "Reset to single Classic Spectrum analyzer",
    onclick: () => setVizMode("spectrum"),
  }, "↺ Reset");

  const fxActiveLayersRow = h("div", { class: "wa-fx-active-layers", "aria-label": "Active visualizer layers" });
  const fxPresetPillsRow = h("div", { class: "wa-fx-presets-row", "aria-label": "Signature multi-layer mixes" },
    ...VIZ_MIX_PRESETS.map((preset) => h("button", {
      type: "button",
      class: "wa-pill-btn wa-fx-preset-pill",
      dataset: { presetId: preset.id },
      title: preset.desc,
      onclick: () => setVizMode(preset.id),
    }, `${preset.icon} ${preset.label}`)),
  );

  const fxTierRow = h("div", { class: "wa-fx-tier-row", role: "group", "aria-label": "Hardware graphics tier" },
    ...DECK_HARDWARE_TIERS.map((tier) => h("button", {
      type: "button",
      class: `wa-pill-btn wa-fx-tier-btn${prefs.hwTier === tier.id ? " is-on" : ""}`,
      dataset: { tierId: tier.id },
      title: tier.desc,
      onclick: () => {
        prefs.hwTier = tier.id;
        save();
        renderFxRack();
      },
    }, `${tier.label} (${tier.badge})`)),
  );

  const fxSearchInput = h("input", {
    type: "search",
    class: "wa-pl-filter wa-fx-search",
    placeholder: "Search 108 visualizers & weather effects (rain, synthwave, wormhole, M4 metaballs, VU, matrix)...",
    "aria-label": "Search visualizers",
    oninput: () => {
      fxSearchQuery = fxSearchInput.value;
      renderFxRack();
    },
  });

  const fxCatRow = h("div", { class: "wa-fx-cat-row", role: "group", "aria-label": "Visualizer categories" },
    ...VIZ_CATEGORIES.map((cat) => h("button", {
      type: "button",
      class: `wa-pill-btn wa-fx-cat-btn${fxCategory === cat.id ? " is-on" : ""}`,
      dataset: { catId: cat.id },
      onclick: () => {
        fxCategory = cat.id;
        renderFxRack();
      },
    }, `${cat.icon} ${cat.label}`)),
  );

  const fxGridContainer = h("div", { class: "wa-fx-sections" });

  const fxRack = h("section", { class: "wa-rack wa-fx-rack", "aria-label": "108-Mode Visualizer and Atmospheric FX Studio", hidden: !prefs.showFx },
    h("header", { class: "wa-rack-head" },
      h("span", { class: "wa-rack-title" }, "✨ VISUALIZER & ATMOSPHERIC FX STUDIO // 108 MODES + 4-LAYER MIXER"),
      h("div", { class: "wa-rack-controls" }, fxMixToggleBtn, fxSurpriseMixBtn, fxClearMixBtn),
    ),
    h("div", { class: "wa-fx-mixer-dock" },
      h("div", { class: "wa-fx-dock-label" }, "ACTIVE LAYER STACK (BACK → FRONT):"),
      fxActiveLayersRow,
      h("div", { class: "wa-fx-dock-label" }, "SIGNATURE 3-LAYER STUDIO MIXES:"),
      fxPresetPillsRow,
    ),
    h("div", { class: "wa-fx-toolbar" },
      fxTierRow,
      h("div", { class: "wa-fx-filter-bar" }, fxSearchInput, fxCatRow),
    ),
    fxGridContainer,
  );

  const racksGrid = h("div", { class: "wa-racks" }, mainRack, fxRack, eqRack, plRack, lyrRack);

  const shell = h("div", {
    class: `wa-shell${prefs.shadeMode ? " is-shade" : ""}`,
    dataset: { skin: prefs.skin },
    tabindex: "-1",
  }, titlebar, racksGrid);

  root.append(shell);

  // --- Persistent Mini-Player / Window Shade Bar (outside Power Panel) -------------------------------------------
  const miniClock = h("span", { class: "wa-mini-clock" }, "00:00");
  const miniTitle = h("span", { class: "wa-mini-title" }, "AmpDeck Pro");
  const miniPlayBtn = h("button", { type: "button", class: "wa-mini-btn", title: "Play or pause", "aria-label": "Play or pause", onclick: () => togglePlay() }, "▶");
  const miniPrevBtn = h("button", { type: "button", class: "wa-mini-btn", title: "Previous track", "aria-label": "Previous track", onclick: () => previous() }, "⏮");
  const miniNextBtn = h("button", { type: "button", class: "wa-mini-btn", title: "Next track", "aria-label": "Next track", onclick: () => next(false) }, "⏭");
  const miniVol = h("input", { type: "range", class: "wa-slider wa-mini-vol", min: "0", max: "100", value: String(Math.round(prefs.volume * 100)), "aria-label": "Mini player volume", oninput: () => setVolume(Number(miniVol.value) / 100) });
  const miniOpenBtn = h("button", { type: "button", class: "wa-mini-btn wa-mini-open", title: "Open full Media Deck", onclick: () => openPower("player") }, "🎛️ Deck");
  const miniCloseBtn = h("button", { type: "button", class: "wa-mini-btn", title: "Stop and hide mini-player", "aria-label": "Close mini-player", onclick: () => { stopPlayback(); miniBar.hidden = true; } }, "✕");
  const miniBar = h("aside", { class: "wa-mini-bar", dataset: { skin: prefs.skin }, "aria-label": "Media Deck Mini Player", hidden: true },
    h("div", { class: "wa-mini-left" },
      h("span", { class: "wa-mini-bolt", "aria-hidden": "true" }, "⚡ AMPDECK"),
      miniClock,
      miniTitle,
    ),
    h("div", { class: "wa-mini-controls" },
      miniPrevBtn,
      miniPlayBtn,
      miniNextBtn,
      miniVol,
      miniOpenBtn,
      miniCloseBtn,
    ),
  );
  const appEl = $("#app");
  const statusEl = $("#status");
  if (appEl && statusEl && statusEl.parentNode === appEl) appEl.insertBefore(miniBar, statusEl);
  else appEl?.append(miniBar);

  for (const s of [seekInput, volInput, balInput, preampSlider, miniVol, ...bandSliders]) syncSliderVars(s);

  // --- Audio Graph (Preamp + 10-Band EQ + 3 DSP Filters + Stereo Panner + Analyser) ------------------------------
  async function ensureGraph() {
    if (graph || graphTried) return graph;
    graphTried = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      await ctx.resume();
      if (ctx.state !== "running") { await ctx.close(); return null; }
      const source = ctx.createMediaElementSource(media);
      const preamp = ctx.createGain();
      const filters = EQ_BANDS.map((hz, i) => {
        const f = ctx.createBiquadFilter();
        f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
        f.frequency.value = hz;
        f.Q.value = 1.1;
        return f;
      });
      const dspLow = ctx.createBiquadFilter();
      dspLow.type = "lowshelf";
      dspLow.frequency.value = 85;
      const dspMid = ctx.createBiquadFilter();
      dspMid.type = "peaking";
      dspMid.frequency.value = 1800;
      dspMid.Q.value = 1.0;
      const dspHigh = ctx.createBiquadFilter();
      dspHigh.type = "highshelf";
      dspHigh.frequency.value = 6500;

      const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      const out = ctx.createGain();
      const chain = [source, preamp, ...filters, dspLow, dspMid, dspHigh, ...(panner ? [panner] : []), analyser, out, ctx.destination];
      chain.reduce((a, b) => (a.connect(b), b));
      graph = { ctx, preamp, filters, dspLow, dspMid, dspHigh, panner, analyser, out };
      if (ctx.sampleRate) khzBadge.textContent = `${(ctx.sampleRate / 1000).toFixed(1)} KHZ`;
      applyLevel();
      applyEqAndDsp();
    } catch { graph = null; }
    return graph;
  }

  function applyEqAndDsp() {
    if (graph) {
      graph.preamp.gain.value = prefs.eqOn ? Math.pow(10, prefs.preamp / 20) : 1;
      graph.filters.forEach((f, i) => { f.gain.value = prefs.eqOn ? prefs.eq[i] : 0; });
      graph.dspLow.gain.value = prefs.dspBass ? 5.5 : 0;
      graph.dspHigh.gain.value = prefs.dspTreble ? 4.5 : 0;
      graph.dspMid.gain.value = prefs.dspVocal ? 3.5 : 0;
      if (graph.panner) graph.panner.pan.value = Math.max(-1, Math.min(1, prefs.balance / 100));
    }
    eqOnCheck.checked = prefs.eqOn;
    preampSlider.value = String(prefs.preamp);
    preampValLabel.textContent = `${prefs.preamp > 0 ? "+" : ""}${prefs.preamp}dB`;
    syncSliderVars(preampSlider);
    bandSliders.forEach((s, i) => {
      s.value = String(prefs.eq[i]);
      bandValLabels[i].textContent = `${prefs.eq[i] > 0 ? "+" : ""}${prefs.eq[i]}dB`;
      syncSliderVars(s);
    });
    balInput.value = String(prefs.balance);
    balLabel.textContent = prefs.balance === 0 ? "CTR" : prefs.balance < 0 ? `L${Math.abs(prefs.balance)}` : `R${prefs.balance}`;
    syncSliderVars(balInput);
    dspBassBtn.classList.toggle("is-on", prefs.dspBass);
    dspBassBtn.setAttribute("aria-pressed", String(prefs.dspBass));
    dspTrebleBtn.classList.toggle("is-on", prefs.dspTreble);
    dspTrebleBtn.setAttribute("aria-pressed", String(prefs.dspTreble));
    dspVocalBtn.classList.toggle("is-on", prefs.dspVocal);
    dspVocalBtn.setAttribute("aria-pressed", String(prefs.dspVocal));
    eqPresetSelect.value = Object.keys(EQ_PRESETS).includes(prefs.preset) ? prefs.preset : "Custom";
    drawEqSplineCanvas(eqSplineCanvas, prefs.preamp, prefs.eq, prefs.eqOn);
  }

  function applyLevel() {
    if (graph) {
      media.volume = 1;
      media.muted = false;
      graph.out.gain.value = prefs.muted ? 0 : prefs.volume;
    } else {
      media.volume = prefs.volume;
      media.muted = prefs.muted;
    }
    const pct = Math.round((prefs.muted ? 0 : prefs.volume) * 100);
    volInput.value = String(pct);
    miniVol.value = String(pct);
    volLabel.textContent = `${pct}%`;
    syncSliderVars(volInput);
    syncSliderVars(miniVol);
    muteBtn.textContent = prefs.muted || prefs.volume === 0 ? "🔇" : prefs.volume < 0.4 ? "🔉" : "🔊";
    save();
  }

  function setVolume(v) {
    prefs.volume = Math.max(0, Math.min(1, v));
    if (prefs.volume > 0) prefs.muted = false;
    applyLevel();
  }

  function setMuted(m) {
    prefs.muted = !!m;
    applyLevel();
  }

  function setBalance(pan) {
    prefs.balance = clampBalance(pan);
    userEnabledVideoDsp = true;
    if (!media.paused && prefs.balance !== 0) ensureGraph().then(applyEqAndDsp);
    else applyEqAndDsp();
    save();
  }

  function onPreampInput() {
    prefs.preamp = clampGain(preampSlider.value);
    prefs.eqOn = true;
    userEnabledVideoDsp = true;
    if (!media.paused) ensureGraph().then(applyEqAndDsp);
    else applyEqAndDsp();
    save();
  }

  function onBandInput(i) {
    prefs.eq[i] = clampGain(bandSliders[i].value);
    prefs.preset = "Custom";
    prefs.eqOn = true;
    userEnabledVideoDsp = true;
    if (!media.paused) ensureGraph().then(applyEqAndDsp);
    else applyEqAndDsp();
    save();
  }

  function applyPreset(name) {
    prefs.eq = (EQ_PRESETS[name] ?? EQ_PRESETS.Flat).slice();
    if (name === "Flat") prefs.preamp = 0;
    prefs.preset = name;
    prefs.eqOn = true;
    userEnabledVideoDsp = name !== "Flat";
    if (!media.paused && userEnabledVideoDsp) ensureGraph().then(applyEqAndDsp);
    else applyEqAndDsp();
    save();
  }

  function toggleDsp(key) {
    prefs[key] = !prefs[key];
    userEnabledVideoDsp = true;
    if (!media.paused) ensureGraph().then(applyEqAndDsp);
    else applyEqAndDsp();
    save();
  }

  function toggleVinylPitch() {
    prefs.vinylPitch = !prefs.vinylPitch;
    media.preservesPitch = !prefs.vinylPitch;
    vinylBtn.classList.toggle("is-on", prefs.vinylPitch);
    vinylBtn.setAttribute("aria-pressed", String(prefs.vinylPitch));
    pitchBadge.textContent = prefs.vinylPitch ? "VINYL" : "LOCK";
    pitchBadge.classList.toggle("wa-badge-active", prefs.vinylPitch);
    save();
  }

  function toggleRack(which) {
    if (which === "fx") {
      prefs.showFx = !prefs.showFx;
      fxRack.hidden = !prefs.showFx;
      fxToggleBtn.classList.toggle("is-on", prefs.showFx);
      fxToggleBtn.setAttribute("aria-pressed", String(prefs.showFx));
      if (prefs.showFx) renderFxRack();
    } else if (which === "eq") {
      prefs.showEq = !prefs.showEq;
      eqRack.hidden = !prefs.showEq;
      eqToggleBtn.classList.toggle("is-on", prefs.showEq);
      eqToggleBtn.setAttribute("aria-pressed", String(prefs.showEq));
    } else if (which === "pl") {
      prefs.showPl = !prefs.showPl;
      plRack.hidden = !prefs.showPl;
      plToggleBtn.classList.toggle("is-on", prefs.showPl);
      plToggleBtn.setAttribute("aria-pressed", String(prefs.showPl));
    } else if (which === "lyr") {
      prefs.showLyr = !prefs.showLyr;
      lyrRack.hidden = !prefs.showLyr;
      lyrToggleBtn.classList.toggle("is-on", prefs.showLyr);
      lyrToggleBtn.setAttribute("aria-pressed", String(prefs.showLyr));
    } else if (which === "shade") {
      prefs.shadeMode = !prefs.shadeMode;
      shell.classList.toggle("is-shade", prefs.shadeMode);
      shadeToggleBtn.classList.toggle("is-on", prefs.shadeMode);
      shadeToggleBtn.setAttribute("aria-pressed", String(prefs.shadeMode));
    }
    save();
  }

  function drawIdleViz() {
    if (isVideo() || (typeof HTMLCanvasElement !== "undefined" && vizCanvas instanceof HTMLCanvasElement && typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent ?? ""))) return;
    const g2 = typeof vizCanvas.getContext === "function" ? vizCanvas.getContext("2d") : null;
    if (!g2) return;
    const freqData = new Uint8Array(128);
    const timeData = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      freqData[i] = Math.max(12, Math.round(95 * Math.exp(-i / 42) + 45 * Math.sin(i * 0.28 + 0.8) * Math.sin(i * 0.11)));
      timeData[i] = Math.round(128 + 38 * Math.sin(i * 0.22) * Math.cos(i * 0.07));
    }
    vizPhase += 4;
    const accent = getComputedStyle(shell).getPropertyValue("--wa-led").trim() || "#00ff44";
    renderAudioVisualizer(g2, vizCanvas.width, vizCanvas.height, prefs.vizMode, freqData, timeData, peaks, accent, vizPhase);
  }

  function syncVizSelectUI() {
    const normalized = normalizeVizSpec(prefs.vizMode);
    prefs.vizMode = normalized;
    const layers = parseVizLayers(normalized);
    fxCountBadge.textContent = `${layers.length}FX`;
    const matchesOption = [...vizSelect.options].some((o) => o.value === normalized && o !== customMixOption);
    if (matchesOption) {
      customMixOption.hidden = true;
      vizSelect.value = normalized;
    } else {
      customMixOption.value = normalized;
      customMixOption.textContent = `🔀 ${formatVizLabel(normalized)}`;
      customMixOption.hidden = false;
      vizSelect.value = normalized;
    }
  }

  function setVizMode(spec) {
    const normalized = normalizeVizSpec(spec);
    if (!normalized) return;
    prefs.vizMode = normalized;
    syncVizSelectUI();
    if (!fxRack.hidden) renderFxRack();
    if (media.paused || !graph) drawIdleViz();
    save();
  }

  function toggleVizLayer(modeId) {
    const current = parseVizLayers(prefs.vizMode);
    const idx = current.indexOf(modeId);
    if (idx >= 0) {
      if (current.length === 1) return; // keep at least 1 active visualizer
      current.splice(idx, 1);
    } else {
      if (current.length >= MAX_VIZ_LAYERS) current.shift();
      current.push(modeId);
    }
    setVizMode(current.join("+"));
  }

  function surpriseVizMix() {
    const backdrops = VIZ_MODES.filter((m) => (m.depth ?? 2) === 1);
    const middles = VIZ_MODES.filter((m) => (m.depth ?? 2) === 2);
    const foregrounds = VIZ_MODES.filter((m) => (m.depth ?? 2) === 3);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.id || "spectrum";
    const mix = [pick(backdrops), pick(middles), pick(foregrounds)];
    setVizMode(mix.join("+"));
    toast(`🎲 Mixed: ${formatVizLabel(prefs.vizMode)}`, { kind: "info" });
  }

  function cycleVizMode() {
    const activeLayers = parseVizLayers(prefs.vizMode);
    const primary = activeLayers[0] || "spectrum";
    const idx = VIZ_MODES.findIndex((m) => m.id === primary);
    setVizMode(VIZ_MODES[(idx + 1) % VIZ_MODES.length].id);
  }

  function renderFxRack() {
    const activeLayers = parseVizLayers(prefs.vizMode);
    const normalizedSpec = activeLayers.join("+");

    // 1. Update Active Layer Stack chips
    fxActiveLayersRow.replaceChildren(
      ...activeLayers.map((id, idx) => {
        const m = VIZ_MODES.find((item) => item.id === id) || { id, label: id, icon: "✨" };
        return h("span", { class: "wa-fx-layer-chip" },
          h("span", { class: "wa-fx-layer-num" }, `L${idx + 1}`),
          `${m.icon || "✨"} ${m.label}`,
          activeLayers.length > 1
            ? h("button", {
                type: "button",
                class: "wa-fx-layer-remove",
                title: `Remove ${m.label} from mix`,
                onclick: () => toggleVizLayer(id),
              }, "×")
            : null,
        );
      }),
    );

    // 2. Highlight active Signature Mix Preset pill
    for (const btn of fxPresetPillsRow.querySelectorAll(".wa-fx-preset-pill")) {
      btn.classList.toggle("is-on", normalizeVizSpec(btn.dataset.presetId) === normalizedSpec);
    }

    // 3. Highlight active Hardware Tier button
    for (const btn of fxTierRow.querySelectorAll(".wa-fx-tier-btn")) {
      btn.classList.toggle("is-on", btn.dataset.tierId === prefs.hwTier);
    }

    // 4. Highlight active Category button
    for (const btn of fxCatRow.querySelectorAll(".wa-fx-cat-btn")) {
      btn.classList.toggle("is-on", btn.dataset.catId === fxCategory);
    }

    // 5. Render Sectioned Visualizer Cards (Low / Medium / Modern ARM Ultra)
    const q = fxSearchQuery.trim().toLowerCase();
    const sections = [
      {
        tier: "ultra",
        title: "🚀 HIGH-END & MODERN ARM ULTRA (APPLE M-SERIES / 120FPS RAYMARCHED & COSMIC FX)",
        subtitle: "42 out-of-this-world 3D hypercubes, supernovas, liquid metal metaballs, and relativistic spacetime shaders",
      },
      {
        tier: "medium",
        title: "⚡ MEDIUM GRAPHICS (BALANCED 60FPS STAGE, WEATHER & SYNTHWAVE HORIZONS)",
        subtitle: "46 multi-layer neon ribbons, thunderstorms, auroras, 3D synthwave grids, and particle constellations",
      },
      {
        tier: "low",
        title: "🔋 LOW GRAPHICS (ECO-FRIENDLY STUDIO ANALYZERS, CRT SCOPES & CHILL AMBIENCE)",
        subtitle: "30 zero-lag precision FFT analyzers, broadcast VU meters, and lightweight lo-fi weather effects",
      },
    ];

    const sectionNodes = [];
    for (const sec of sections) {
      const items = VIZ_MODES.filter((m) => {
        if ((m.tier || "medium") !== sec.tier) return false;
        if (fxCategory !== "all" && m.cat !== fxCategory) return false;
        if (q && !`${m.label} ${m.desc || ""} ${m.badge || ""} ${m.cat || ""}`.toLowerCase().includes(q)) return false;
        return true;
      });
      if (!items.length) continue;

      const cards = items.map((m) => {
        const layerIdx = activeLayers.indexOf(m.id);
        const isSelected = layerIdx >= 0;
        const c1 = m.params?.color1 || "#00f5ff";
        const c2 = m.params?.color2 || "#ec4899";
        const mixBtn = h("button", {
          type: "button",
          class: `wa-fx-card-mix-btn${isSelected ? " is-on" : ""}`,
          title: isSelected ? `Remove ${m.label} from multi-layer mix` : `Layer ${m.label} on top of current visualizer`,
          onclick: (ev) => {
            ev.stopPropagation();
            toggleVizLayer(m.id);
          },
        }, isSelected ? `✓ Layer ${layerIdx + 1}` : "+ Mix");

        return h("div", {
          class: `wa-fx-card${isSelected ? " is-active" : ""}`,
          role: "button",
          tabindex: "0",
          onclick: () => {
            if (prefs.vizMixMode) toggleVizLayer(m.id);
            else setVizMode(m.id);
          },
          onkeydown: (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              if (prefs.vizMixMode) toggleVizLayer(m.id);
              else setVizMode(m.id);
            }
          },
        },
          h("div", {
            class: "wa-fx-card-preview",
            style: `background: radial-gradient(circle at 22% 35%, ${c1}44, transparent 65%), linear-gradient(135deg, #070b14 0%, ${c2}33 100%); border-bottom: 1px solid ${c1}55;`,
          },
            h("span", { class: "wa-fx-card-icon" }, m.icon || "✨"),
            h("span", { class: "wa-fx-card-badge" }, m.badge || m.tier.toUpperCase()),
            mixBtn,
          ),
          h("div", { class: "wa-fx-card-body" },
            h("div", { class: "wa-fx-card-title" }, m.label),
            h("div", { class: "wa-fx-card-desc" }, m.desc || "Real-time audio-reactive visualizer & stage effect"),
          ),
        );
      });

      sectionNodes.push(
        h("div", { class: "wa-fx-tier-section" },
          h("div", { class: "wa-fx-tier-header" },
            h("div", { class: "wa-fx-tier-title" }, `${sec.title} (${items.length})`),
            h("div", { class: "wa-fx-tier-sub" }, sec.subtitle),
          ),
          h("div", { class: "wa-fx-grid" }, ...cards),
        ),
      );
    }

    fxGridContainer.replaceChildren(
      ...(sectionNodes.length
        ? sectionNodes
        : [h("div", { class: "wa-pl-empty" }, "No visualizers match that search or category filter.")]),
    );
  }

  function startVizLoop() {
    if (raf || isVideo() || !graph || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const g2 = vizCanvas.getContext("2d");
    const freqData = new Uint8Array(graph.analyser.frequencyBinCount);
    const timeData = new Uint8Array(graph.analyser.frequencyBinCount);
    let last = 0;
    const frame = (now) => {
      raf = 0;
      if (isVideo() || media.paused || document.hidden || !vizCanvas.isConnected) return;
      raf = requestAnimationFrame(frame);
      const tier = effectiveHwTier();
      const minDelta = tier === "low" ? 38 : tier === "medium" ? 24 : 16;
      if (now - last < minDelta) return;
      last = now;
      vizPhase++;
      if (vizAutoCycle && vizPhase % 210 === 0) cycleVizMode();
      graph.analyser.getByteFrequencyData(freqData);
      if (typeof graph.analyser.getByteTimeDomainData === "function") {
        graph.analyser.getByteTimeDomainData(timeData);
      }
      const accent = getComputedStyle(shell).getPropertyValue("--wa-led").trim() || "#00ff41";
      renderAudioVisualizer(g2, vizCanvas.width, vizCanvas.height, prefs.vizMode, freqData, timeData, peaks, accent, vizPhase);
    };
    raf = requestAnimationFrame(frame);
  }

  // --- Queue & Track Loading -------------------------------------------------------------------------------------
  function rebuildQueue(startIndex = 0) {
    queue = new PlayQueue(tracks.length, Math.max(0, Math.min(tracks.length - 1, startIndex)));
    queue.setRepeat(prefs.repeat);
    if (prefs.shuffle) queue.setShuffle(true);
  }

  function renderPlaylist() {
    const q = plFilter.trim().toLowerCase();
    const totalBytes = tracks.reduce((sum, t) => sum + (Number(t.size) || 0), 0);
    plCountLabel.textContent = `${tracks.length} track${tracks.length === 1 ? "" : "s"}${totalBytes ? ` · ${formatSize(totalBytes)}` : ""}`;
    plEmpty.hidden = tracks.length > 0;
    const rows = [];
    tracks.forEach((item, idx) => {
      const label = [item.artist, item.title || item.name].filter(Boolean).join(" — ");
      const ext = extensionOf(item.name).toUpperCase() || "MEDIA";
      if (q && !`${label} ${item.name} ${ext}`.toLowerCase().includes(q)) return;
      const isCurrent = currentEntry && currentEntry.path === item.path;
      rows.push(h("li", { class: `wa-pl-row${isCurrent ? " is-current" : ""}`, dataset: { index: String(idx) } },
        h("button", {
          type: "button", class: "wa-pl-play", "aria-current": isCurrent ? "true" : null,
          onclick: () => playAtIndex(idx),
        },
          h("span", { class: "wa-pl-num" }, `${String(idx + 1).padStart(2, "0")}.`),
          h("span", { class: "wa-pl-icon", "aria-hidden": "true" }, mediaKindOfName(item.name) === "video" ? "🎞️" : "🎵"),
          h("span", { class: "wa-pl-name" }, label),
          h("span", { class: "wa-pl-ext" }, ext),
          item.duration ? h("span", { class: "wa-pl-dur" }, formatClock(item.duration)) : null,
          item.size ? h("span", { class: "wa-pl-size" }, formatSize(item.size)) : null,
        ),
        h("div", { class: "wa-pl-actions" },
          h("button", { type: "button", class: "wa-pl-mini", title: "Move up", "aria-label": `Move ${item.name} up`, disabled: idx === 0, onclick: () => moveTrack(idx, -1) }, "↑"),
          h("button", { type: "button", class: "wa-pl-mini", title: "Move down", "aria-label": `Move ${item.name} down`, disabled: idx === tracks.length - 1, onclick: () => moveTrack(idx, 1) }, "↓"),
          h("button", { type: "button", class: "wa-pl-mini", title: "Remove from playlist", "aria-label": `Remove ${item.name}`, onclick: () => removeTrack(idx) }, "✕"),
        ),
      ));
    });
    plList.replaceChildren(...rows);
  }

  function moveTrack(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const [moved] = tracks.splice(index, 1);
    tracks.splice(target, 0, moved);
    const curIdx = currentEntry ? tracks.findIndex((t) => t.path === currentEntry.path) : 0;
    rebuildQueue(Math.max(0, curIdx));
    renderPlaylist();
  }

  function removeTrack(index) {
    const removed = tracks[index];
    tracks.splice(index, 1);
    if (!tracks.length) {
      stopPlayback();
      currentEntry = null;
      rebuildQueue(0);
      renderPlaylist();
      refreshDisplay();
      return;
    }
    const wasCurrent = removed && currentEntry && removed.path === currentEntry.path;
    const nextIdx = Math.min(index, tracks.length - 1);
    rebuildQueue(wasCurrent ? nextIdx : Math.max(0, tracks.findIndex((t) => t.path === currentEntry?.path)));
    renderPlaylist();
    if (wasCurrent) loadTrack(tracks[nextIdx], true);
  }

  function sortPlaylist(how) {
    if (tracks.length < 2) return;
    if (how === "name") tracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    else if (how === "reverse") tracks.reverse();
    const curIdx = currentEntry ? tracks.findIndex((t) => t.path === currentEntry.path) : 0;
    rebuildQueue(Math.max(0, curIdx));
    renderPlaylist();
  }

  function clearPlaylist() {
    stopPlayback();
    tracks = [];
    currentEntry = null;
    currentTags = null;
    currentCover = "";
    rebuildQueue(0);
    renderPlaylist();
    refreshDisplay();
    updateMiniBar();
  }

  function refreshDisplay() {
    if (!currentEntry) {
      marqueeText.textContent = "*** AMPDECK PRO — SELECT OR LOAD A TRACK TO PLAY ***";
      miniTitle.textContent = "AmpDeck Pro";
      coverBox.style.backgroundImage = "";
      coverBox.textContent = "🎵";
      kbpsBadge.textContent = "--- KBPS";
      shell.classList.remove("is-video");
      pipBtn.hidden = true;
      drawIdleViz();
      return;
    }
    const t = currentTags ?? {};
    const trackTitle = t.title || currentEntry.title || currentEntry.name.replace(/\.[^.]+$/, "");
    const trackArtist = t.artist || currentEntry.artist || "";
    const idx = tracks.findIndex((x) => x.path === currentEntry.path);
    const numPrefix = idx >= 0 ? `${idx + 1}. ` : "";
    const durText = Number.isFinite(media.duration) && media.duration > 0 ? ` (${formatClock(media.duration)})` : "";
    const banner = `${numPrefix}${trackArtist ? `${trackArtist} - ` : ""}${trackTitle}${t.album ? ` [${t.album}]` : ""}${durText}  ***  `;
    marqueeText.textContent = `${banner}${banner}`;
    miniTitle.textContent = `${trackArtist ? `${trackArtist} — ` : ""}${trackTitle}`;
    coverBox.style.backgroundImage = currentCover ? `url("${currentCover}")` : "";
    coverBox.textContent = currentCover ? "" : isVideo() ? "🎞️" : "💿";
    shell.classList.toggle("is-video", isVideo());
    pipBtn.hidden = !isVideo();
    if (Number.isFinite(media.duration) && media.duration > 0 && currentEntry.size > 0) {
      const kbps = Math.max(32, Math.min(9999, Math.round((currentEntry.size * 8) / (media.duration * 1000))));
      kbpsBadge.textContent = `${kbps} KBPS`;
    } else {
      kbpsBadge.textContent = isVideo() ? "VIDEO" : "AUDIO";
    }
    if (media.paused) drawIdleViz();
  }

  function refreshButtons() {
    const paused = media.paused;
    playBtn.textContent = paused ? "▶" : "⏸";
    playBtn.setAttribute("aria-label", paused ? "Play" : "Pause");
    miniPlayBtn.textContent = paused ? "▶" : "⏸";
    playGlyph.textContent = !currentEntry ? "■ READY" : paused ? "❚❚ PAUSED" : "▶ PLAYING";
    shufBtn.classList.toggle("is-on", queue.shuffle);
    shufBtn.setAttribute("aria-pressed", String(queue.shuffle));
    repBtn.classList.toggle("is-on", queue.repeat !== "off");
    repBtn.textContent = queue.repeat === "one" ? "🔂 REP 1" : queue.repeat === "all" ? "🔁 REP ALL" : "🔁 REP OFF";
    abLoopBtn.classList.toggle("is-on", loop.a !== null);
    abLoopBtn.textContent = loop.a === null ? "A–B" : loop.b === null ? "A→" : "A⇄B";
    loopBadge.hidden = loop.a === null;
    updateMiniBar();
  }

  function updateMiniBar() {
    const inPlayerTab = powerIsOpen() && activePowerTab() === "player";
    miniBar.hidden = !currentEntry || inPlayerTab;
  }

  function refreshTime() {
    const d = media.duration;
    const clockStr = formatLedClock(media.currentTime, d, prefs.remainingTime);
    ledClock.textContent = clockStr;
    miniClock.textContent = clockStr;
    seekElapsed.textContent = formatClock(media.currentTime);
    seekTotal.textContent = Number.isFinite(d) ? formatClock(d) : "0:00";
    if (document.activeElement !== seekInput || !seekInput.matches(":active")) {
      seekInput.value = Number.isFinite(d) && d > 0 ? String(Math.round((media.currentTime / d) * 1000)) : "0";
      syncSliderVars(seekInput);
    }
    if (loop.a !== null && loop.b !== null && media.currentTime >= loop.b) media.currentTime = loop.a;
    refreshKaraokeHighlight();
  }

  function drawAbBar() {
    const d = media.duration;
    abHighlight.hidden = !(loop.a !== null && Number.isFinite(d) && d > 0);
    if (abHighlight.hidden) return;
    abHighlight.style.left = `${(loop.a / d) * 100}%`;
    abHighlight.style.width = `${(((loop.b ?? media.currentTime) - loop.a) / d) * 100}%`;
  }

  // --- Subtitles & Synced Karaoke Lyrics -------------------------------------------------------------------------
  function clearTextTracks() {
    media.querySelectorAll("track").forEach((t) => t.remove());
    trackUrls.forEach((u) => URL.revokeObjectURL(u));
    trackUrls = [];
    subSelect.replaceChildren();
    subSelect.hidden = true;
    lyricSources = [];
    activeLrcCues = [];
    lastActiveCue = -1;
    lyrSelect.replaceChildren();
    lyrSelect.hidden = true;
    lyrBody.replaceChildren(h("pre", { class: "wa-lyr-plain" }, "No lyrics found for this track."));
  }

  function renderSelectedLyrics() {
    const src = lyricSources[Number(lyrSelect.value)] ?? lyricSources[0];
    if (!src) {
      activeLrcCues = [];
      lyrBody.replaceChildren(h("pre", { class: "wa-lyr-plain" }, "No lyrics found for this track."));
      return;
    }
    const cues = parseLrc(src.text);
    activeLrcCues = cues;
    lastActiveCue = -1;
    if (cues.length >= 2) {
      const syncWrap = h("div", { class: "wa-lyr-sync" },
        ...cues.map((cue, idx) => h("button", {
          type: "button", class: "wa-lyr-line", dataset: { cue: String(idx) },
          title: `Jump to ${formatClock(cue.time)}`,
          onclick: () => { media.currentTime = cue.time; if (media.paused) play(); },
        }, h("span", { class: "wa-lrc-time" }, formatClock(cue.time)), h("span", { class: "wa-lrc-text" }, cue.text))),
      );
      lyrBody.replaceChildren(syncWrap);
      refreshKaraokeHighlight();
    } else {
      lyrBody.replaceChildren(h("pre", { class: "wa-lyr-plain" }, src.text));
    }
  }

  function refreshKaraokeHighlight() {
    if (!activeLrcCues.length) return;
    const idx = activeLrcIndex(activeLrcCues, media.currentTime);
    if (idx === lastActiveCue) return;
    lastActiveCue = idx;
    const lines = lyrBody.querySelectorAll(".wa-lyr-line");
    lines.forEach((el, i) => {
      const active = i === idx;
      el.classList.toggle("is-active", active);
      if (active && !lyrRack.hidden && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  async function loadTrackSubtitlesAndLyrics(token, embeddedLyrics) {
    if (!currentEntry) return;
    const addLyric = (label, text) => {
      const clean = String(text ?? "").trim();
      if (clean) lyricSources.push({ label, text: clean });
    };
    addLyric("Embedded lyrics", embeddedLyrics);
    const base = currentEntry.name.replace(/\.[^.]+$/, "").toLowerCase();
    const candidates = subtitlePool.filter((e) => {
      const n = e.name.toLowerCase();
      const ext = extensionOf(n);
      return n.startsWith(`${base}.`) && (LYRIC_EXTS.includes(ext) || SUBTITLE_EXTS.includes(ext));
    });
    for (const side of candidates) {
      const ext = extensionOf(side.name);
      try {
        if (SUBTITLE_EXTS.includes(ext) && isVideo()) {
          const res = await fetch(rawUrl(side.path));
          if (res.ok) {
            const rawText = await res.text();
            if (token !== loadToken) return;
            const url = URL.createObjectURL(new Blob([srtToVtt(rawText)], { type: "text/vtt" }));
            trackUrls.push(url);
            const label = side.name.slice(base.length + 1).replace(/\.(srt|vtt)$/i, "") || "Subtitles";
            media.append(h("track", { kind: "subtitles", label, src: url }));
            addLyric(side.name, subtitleText(rawText));
          }
        } else if (LYRIC_EXTS.includes(ext) && side.size <= 256 * 1024) {
          const res = await fetch(lyricsUrl(side.path));
          if (res.ok) {
            const text = await res.text();
            if (token !== loadToken) return;
            addLyric(side.name, text);
          }
        }
      } catch { /* skip unreadable sidecar */ }
    }
    if (token !== loadToken) return;
    const textTracks = [...media.textTracks];
    if (textTracks.length) {
      subSelect.replaceChildren(
        h("option", { value: "-1" }, "Subtitles: off"),
        ...textTracks.map((t, i) => h("option", { value: String(i) }, t.label || `Subtitle ${i + 1}`)),
      );
      subSelect.hidden = false;
    }
    if (lyricSources.length) {
      lyrSelect.replaceChildren(...lyricSources.map((s, i) => h("option", { value: String(i) }, s.label)));
      lyrSelect.hidden = lyricSources.length < 2;
      renderSelectedLyrics();
    }
  }

  async function loadTrack(entry, autoplay = true, startSeconds = 0) {
    if (!entry) return;
    media.pause();
    currentEntry = entry;
    const token = ++loadToken;
    currentTags = null;
    currentCover = "";
    loop = { a: null, b: null };
    stageStatus.hidden = true;
    stageStatus.textContent = "";
    clearTextTracks();
    media.src = rawUrl(entry.path);
    media.load();
    media.playbackRate = prefs.rate;
    media.preservesPitch = !prefs.vinylPitch;
    if (startSeconds > 0) {
      media.addEventListener("loadedmetadata", () => {
        if (token === loadToken && startSeconds < (media.duration || Infinity)) media.currentTime = startSeconds;
      }, { once: true });
    }
    refreshDisplay();
    renderPlaylist();
    refreshButtons();
    drawAbBar();
    if (autoplay) await play();
    if (isVideo()) {
      await loadTrackSubtitlesAndLyrics(token, null);
      return;
    }
    readTags(entry).then(async (t) => {
      if (token !== loadToken) return;
      if (t) {
        currentTags = t;
        if (t.title) entry.title = t.title;
        if (t.artist) entry.artist = t.artist;
        if (t.album) entry.album = t.album;
        if (t.cover && t.cover.data.length <= MAX_COVER_BYTES) {
          try { currentCover = await dataUrlOf(new Blob([t.cover.data], { type: t.cover.mime })); } catch { currentCover = ""; }
        }
        if (token === loadToken) {
          refreshDisplay();
          renderPlaylist();
        }
      }
      await loadTrackSubtitlesAndLyrics(token, t?.lyrics);
    }).catch(() => {});
  }

  async function play() {
    if (!currentEntry && tracks.length) {
      await loadTrack(tracks[queue.index] ?? tracks[0], true);
      return;
    }
    if (!currentEntry) return;
    try {
      await media.play();
      if (!isVideo() || prefs.eqOn || prefs.bassBoost > 0 || prefs.trebleBoost > 0 || prefs.stereoWidth !== 100 || prefs.balance !== 0) {
        await ensureGraph();
        graph?.ctx.resume?.();
      }
      startVizLoop();
    } catch (err) {
      if (err && err.name === "NotAllowedError") {
        stageStatus.textContent = "Press Play to start audio playback.";
        stageStatus.hidden = false;
      }
    }
    refreshButtons();
  }

  function togglePlay() {
    if (!currentEntry && tracks.length) {
      loadTrack(tracks[queue.index] ?? tracks[0], true);
      return;
    }
    if (media.paused) play();
    else media.pause();
  }

  function stopPlayback() {
    media.pause();
    try { media.currentTime = 0; } catch {}
    refreshTime();
    refreshButtons();
  }

  function playAtIndex(idx) {
    if (idx < 0 || idx >= tracks.length) return;
    queue.jumpTo(idx);
    loadTrack(tracks[queue.index], true);
  }

  function next(auto = false) {
    const i = queue.next(auto);
    if (i === null || !tracks[i]) {
      media.pause();
      refreshButtons();
      return;
    }
    loadTrack(tracks[i], true);
  }

  function previous() {
    if (!tracks.length) return;
    const r = queue.prev(media.currentTime);
    if (r.restart) {
      media.currentTime = 0;
      if (media.paused) play();
    } else if (tracks[r.index]) {
      loadTrack(tracks[r.index], true);
    }
  }

  function setShuffle(on) {
    queue.setShuffle(on);
    prefs.shuffle = on;
    save();
    refreshButtons();
  }

  function setRepeat(mode) {
    queue.setRepeat(mode);
    prefs.repeat = queue.repeat;
    save();
    refreshButtons();
  }

  function cycleAbLoop() {
    if (loop.a === null) loop = { a: media.currentTime, b: null };
    else if (loop.b === null) { loop.b = Math.max(media.currentTime, loop.a + 0.5); media.currentTime = loop.a; }
    else loop = { a: null, b: null };
    refreshButtons();
    drawAbBar();
  }

  async function togglePip() {
    try {
      if (document.pictureInPictureEnabled && typeof media.requestPictureInPicture === "function") {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await media.requestPictureInPicture();
      } else if (typeof media.webkitSupportsPresentationMode === "function" && media.webkitSupportsPresentationMode("picture-in-picture")) {
        media.webkitSetPresentationMode(media.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
      }
    } catch { /* ignore */ }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stageCard.requestFullscreen) await stageCard.requestFullscreen();
    } catch { /* ignore */ }
  }

  // --- Playlist Loading & M3U Import/Export ----------------------------------------------------------------------
  function ingestEntries(newEntries, { replace = false, startEntry = null, startTime = 0, autoplay = true } = {}) {
    const playable = newEntries.filter((e) => e && !e.isDir && mediaKindOfName(e.name));
    const subs = newEntries.filter((e) => e && !e.isDir && (LYRIC_EXTS.includes(extensionOf(e.name)) || SUBTITLE_EXTS.includes(extensionOf(e.name))));
    if (subs.length) {
      const seenSub = new Set(subtitlePool.map((s) => s.path));
      for (const s of subs) if (!seenSub.has(s.path)) subtitlePool.push(s);
    }
    if (!playable.length) {
      toast("No playable audio or video files were found.", { kind: "info" });
      return;
    }
    if (replace) {
      tracks = playable.map((e) => ({ ...e }));
    } else {
      const existing = new Set(tracks.map((t) => t.path));
      for (const e of playable) if (!existing.has(e.path)) tracks.push({ ...e });
    }
    const targetPath = startEntry?.path ?? playable[0].path;
    const startIdx = Math.max(0, tracks.findIndex((t) => t.path === targetPath));
    rebuildQueue(startIdx);
    renderPlaylist();
    loadTrack(tracks[startIdx], autoplay, startTime);
  }

  async function loadCurrentFolder(replace = true) {
    const folder = currentPath();
    if (!folder) {
      const vis = visibleEntries();
      if (vis.length) ingestEntries(vis, { replace });
      return;
    }
    try {
      const res = await call("list", { path: folder, showHidden: !!state.settings?.showHidden });
      ingestEntries(res.entries ?? [], { replace });
    } catch {
      ingestEntries(visibleEntries(), { replace });
    }
  }

  async function addSelectedFromManager() {
    const sel = selectedEntries();
    if (!sel.length) return loadCurrentFolder(false);
    const collected = [];
    for (const item of sel) {
      if (item.isDir) {
        try {
          const res = await call("list", { path: item.path, showHidden: !!state.settings?.showHidden });
          collected.push(...(res.entries ?? []));
        } catch { /* skip */ }
      } else if (isPlaylistFile(item.name)) {
        await loadM3uPath(item.path, false);
      } else {
        collected.push(item);
      }
    }
    if (collected.length) ingestEntries(collected, { replace: tracks.length === 0 });
  }

  async function loadCodecaineLibrary() {
    const candidates = ["music lyrics", "~/music lyrics"];
    const cur = currentPath();
    if (cur) {
      const sep = state.sep || "/";
      candidates.unshift(`${cur}${sep}music lyrics`);
    }
    for (const candidate of candidates) {
      try {
        const resolved = await call("typedpath", { text: candidate, cwd: cur || state.home });
        if (resolved.exists && resolved.isDir) {
          const listed = await call("list", { path: resolved.path, showHidden: false });
          if ((listed.entries ?? []).some((e) => mediaKindOfName(e.name))) {
            ingestEntries(listed.entries, { replace: true });
            toast(`Loaded Codecaine music library (${listed.entries.filter((e) => mediaKindOfName(e.name)).length} tracks).`, { kind: "success" });
            return;
          }
        }
      } catch { /* try next */ }
    }
    await loadCurrentFolder(true);
  }

  async function loadM3uPath(path, replace = false) {
    try {
      const { file } = await call("code/read", { path });
      const items = parseM3u(file.text);
      if (!items.length) return toast("That playlist file has no tracks.", { kind: "info" });
      const sep = state.sep || "/";
      const dir = path.slice(0, Math.max(0, path.lastIndexOf(sep)));
      const resolvedEntries = [];
      for (const item of items) {
        const full = item.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(item.path) ? item.path : `${dir}${sep}${item.path}`;
        try {
          const { entry } = await call("entry", { path: full });
          if (entry && !entry.isDir) resolvedEntries.push({ ...entry, title: item.title || entry.name, duration: item.duration || 0 });
        } catch { /* skip missing file */ }
      }
      if (!resolvedEntries.length) return toast("None of the tracks in that M3U playlist could be found on disk.", { kind: "error" });
      ingestEntries(resolvedEntries, { replace });
      toast(`Loaded ${resolvedEntries.length} track${resolvedEntries.length === 1 ? "" : "s"} from playlist.`, { kind: "success" });
    } catch (err) {
      toast(`Couldn't read playlist: ${err instanceof Error ? err.message : String(err)}`, { kind: "error" });
    }
  }

  async function importM3uFromSelection() {
    const sel = selectedEntries().find((e) => !e.isDir && isPlaylistFile(e.name));
    if (sel) return loadM3uPath(sel.path, false);
    const inFolder = visibleEntries().find((e) => !e.isDir && isPlaylistFile(e.name));
    if (inFolder) return loadM3uPath(inFolder.path, false);
    toast("Select an .m3u or .m3u8 playlist file in the File Manager first.", { kind: "info" });
  }

  async function exportM3uToFolder() {
    if (!tracks.length) return toast("Add tracks to the playlist before saving an M3U8 file.", { kind: "info" });
    const folder = currentPath() || state.home;
    if (!folder) return;
    const sep = state.sep || "/";
    const outPath = `${folder}${sep}playlist.m3u8`;
    try {
      const content = formatM3u(tracks);
      await call("code/saveas", { path: outPath, text: content, encoding: "utf-8", eol: "\n", overwrite: true });
      toast("Saved playlist.m3u8 in the current folder.", { kind: "success" });
    } catch (err) {
      toast(`Couldn't save playlist: ${err instanceof Error ? err.message : String(err)}`, { kind: "error" });
    }
  }

  // --- Events ----------------------------------------------------------------------------------------------------
  skinSelect.addEventListener("change", () => {
    prefs.skin = skinSelect.value;
    shell.dataset.skin = prefs.skin;
    miniBar.dataset.skin = prefs.skin;
    drawEqSplineCanvas(eqSplineCanvas, prefs.preamp, prefs.eq, prefs.eqOn);
    if (media.paused) drawIdleViz();
    save();
  });
  vizSelect.addEventListener("change", () => {
    setVizMode(vizSelect.value);
  });
  eqOnCheck.addEventListener("change", async () => {
    prefs.eqOn = eqOnCheck.checked;
    if (prefs.eqOn && !graph) {
      await ensureGraph();
      graph?.ctx.resume?.();
    }
    applyEqAndDsp();
    save();
  });
  eqPresetSelect.addEventListener("change", () => {
    if (eqPresetSelect.value !== "Custom") applyPreset(eqPresetSelect.value);
  });
  volInput.addEventListener("input", () => setVolume(Number(volInput.value) / 100));
  balInput.addEventListener("input", () => setBalance(Number(balInput.value)));
  speedSelect.addEventListener("change", () => {
    prefs.rate = Number(speedSelect.value);
    media.playbackRate = prefs.rate;
    save();
  });
  seekInput.addEventListener("input", () => {
    syncSliderVars(seekInput);
    if (Number.isFinite(media.duration)) media.currentTime = (Number(seekInput.value) / 1000) * media.duration;
  });
  subSelect.addEventListener("change", () => {
    const idx = Number(subSelect.value);
    [...media.textTracks].forEach((t, i) => { t.mode = i === idx ? "showing" : "disabled"; });
  });
  lyrSelect.addEventListener("change", renderSelectedLyrics);
  plSearchInput.addEventListener("input", () => {
    plFilter = plSearchInput.value;
    renderPlaylist();
  });

  media.addEventListener("timeupdate", () => { refreshTime(); drawAbBar(); });
  media.addEventListener("durationchange", () => { refreshTime(); refreshDisplay(); drawAbBar(); });
  media.addEventListener("loadedmetadata", () => {
    if (currentEntry && Number.isFinite(media.duration)) {
      currentEntry.duration = media.duration;
      renderPlaylist();
    }
    refreshDisplay();
  });
  media.addEventListener("play", () => { refreshButtons(); startVizLoop(); });
  media.addEventListener("pause", refreshButtons);
  media.addEventListener("ended", () => next(true));
  media.addEventListener("error", () => {
    if (!currentEntry) return;
    stageStatus.textContent = `Cannot play “${currentEntry.name}” in the built-in player.`;
    stageStatus.hidden = false;
    refreshButtons();
  });

  shell.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === " " || lower === "k") { e.preventDefault(); togglePlay(); }
    else if (k === "ArrowRight") { e.preventDefault(); if (Number.isFinite(media.duration)) media.currentTime = Math.min(media.duration, media.currentTime + 5); }
    else if (k === "ArrowLeft") { e.preventDefault(); if (Number.isFinite(media.duration)) media.currentTime = Math.max(0, media.currentTime - 5); }
    else if (k === "ArrowUp") { e.preventDefault(); setVolume(prefs.volume + 0.05); }
    else if (k === "ArrowDown") { e.preventDefault(); setVolume(prefs.volume - 0.05); }
    else if (lower === "n") { e.preventDefault(); next(false); }
    else if (lower === "b") { e.preventDefault(); previous(); }
    else if (lower === "s") { e.preventDefault(); setShuffle(!queue.shuffle); }
    else if (lower === "r") { e.preventDefault(); setRepeat(queue.cycleRepeat()); }
    else if (lower === "e") { e.preventDefault(); toggleRack("eq"); }
    else if (lower === "q") { e.preventDefault(); toggleRack("pl"); }
    else if (lower === "l") { e.preventDefault(); toggleRack("lyr"); }
    else if (lower === "x") { e.preventDefault(); toggleRack("fx"); }
    else if (lower === "v") { e.preventDefault(); cycleVizMode(); }
    else if (lower === "a") { e.preventDefault(); cycleAbLoop(); }
    else if (lower === "j") { e.preventDefault(); if (!prefs.showPl) toggleRack("pl"); plSearchInput.focus(); }
  });

  on("power", updateMiniBar);
  on("power-tab", updateMiniBar);

  syncVizSelectUI();
  if (prefs.showFx) renderFxRack();
  applyEqAndDsp();
  applyLevel();
  refreshDisplay();
  refreshButtons();

  deckController = {
    open(opts = {}) {
      if (Array.isArray(opts.entries) && opts.entries.length) {
        ingestEntries(opts.entries, {
          replace: opts.enqueue !== true,
          startEntry: opts.start ?? opts.entries[0],
          startTime: Number(opts.currentTime) || 0,
          autoplay: opts.paused !== true,
        });
        return;
      }
      if (Array.isArray(opts.paths) && opts.paths.length) {
        Promise.all(opts.paths.map((p) => call("entry", { path: p }).then((r) => r.entry).catch(() => null))).then((resolved) => {
          const valid = resolved.filter(Boolean);
          const m3u = valid.find((e) => !e.isDir && isPlaylistFile(e.name));
          if (m3u) loadM3uPath(m3u.path, opts.enqueue !== true);
          else if (valid.length) ingestEntries(valid, { replace: opts.enqueue !== true && tracks.length === 0 ? true : opts.enqueue !== true });
        });
        return;
      }
      if (typeof opts.path === "string" && opts.path) {
        if (isPlaylistFile(opts.path)) {
          loadM3uPath(opts.path, false);
          return;
        }
        call("entry", { path: opts.path }).then(({ entry }) => {
          if (entry) ingestEntries([entry], { replace: false, startEntry: entry });
        }).catch(() => {});
        return;
      }
      if (!tracks.length) {
        const vis = visibleEntries().filter((e) => !e.isDir && mediaKindOfName(e.name));
        if (vis.length) ingestEntries(vis, { replace: true, autoplay: false });
      }
    },
  };

  return {
    show(opts) {
      updateMiniBar();
      deckController.open(opts);
      announce("Media Deck open");
    },
    hide() {
      updateMiniBar();
    },
  };
}

on("player-deck-open", (payload) => {
  if (quickLookIsOpen()) closeQuickLook();
  openPower("player", payload);
});

registerPowerTab({
  id: "player",
  label: "Media Deck",
  icon: "🎛️",
  tip: "Play music and videos in a modular rack with spectrum and oscilloscope visualizers, ten-band equalizer, playlists and synced lyrics",
  group: "media",
  mount,
});
