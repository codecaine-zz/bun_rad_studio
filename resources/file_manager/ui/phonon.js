// Ollama Phonon Voice Reader, Plain-Text Format Converter, Live Follow-Along Teleprompter & Multi-Format Audio/Video Exporter.
import { ApiError, call, getToken, isPhononSupported } from "./api.js";
import { announce, clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh, saveSettings } from "./nav.js";
import { currentPath } from "./pane.js";
import { registerPowerTab } from "./power.js";
import { selectKeys, selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";
import { showToolsDialog } from "./tools.js";
import { baseName, extensionOf } from "./util.js";

export { isPhononSupported };

function stemOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Checks whether a file entry can be read aloud or converted to plain text / read-along video.
 * Supports plain text, source code, markup, documents, PDFs, e-books, spreadsheets, presentations, subtitles, data files, and OCR images.
 */
const READABLE_EXTS = new Set([
  "txt", "md", "markdown", "rst", "org", "adoc", "asciidoc", "tex", "textile", "wiki", "mediawiki", "log",
  "html", "htm", "xhtml", "svg", "xml", "json", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "plist",
  "csv", "tsv", "xlsx", "xlsm", "ods",
  "docx", "odt", "rtf", "doc", "pages", "epub", "fb2", "mobi", "azw", "azw3",
  "pptx", "ppsx", "odp", "pdf", "ipynb",
  "srt", "vtt", "sbv", "ass", "ssa", "lrc", "ics", "vcs", "vcf", "vcard",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "hpp", "cs", "rb", "php", "sh", "bash", "zsh", "sql", "css",
]);

export function canReadWithPhonon(entry) {
  if (!isPhononSupported()) return false;
  if (!entry || entry.isDir) return false;
  const ext = extensionOf(entry.name);
  if (READABLE_EXTS.has(ext)) return true;
  if (entry.kind === "text" || entry.kind === "code" || entry.kind === "document" || entry.kind === "data") return true;
  return false;
}

function formatDuration(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const hrs = Math.floor(m / 60);
  const mins = m % 60;
  return `${hrs}h ${mins}m`;
}

function audioUrlWithToken(rawPath) {
  const sep = rawPath.includes("?") ? "&" : "?";
  return `${rawPath}${sep}token=${encodeURIComponent(getToken())}`;
}

function rawFileUrl(absPath) {
  return `/api/raw?path=${encodeURIComponent(absPath)}&token=${encodeURIComponent(getToken())}`;
}

const VIDEO_EXT_SET = new Set(["mp4", "webm", "mov", "mkv"]);

const COMMON_FUNCTION_WORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "by", "for", "or", "and", "as", "is", "it", "be", "we", "he", "me", "my", "so", "up", "if", "no", "do",
]);

/**
 * Estimates relative spoken duration weight of a single word token, accounting for
 * spelled-out uppercase/alphanumeric acronyms (TTS, MLX, MP4, MKV, MP3, M4A),
 * digit strings, compound hyphenated words, and short function words.
 */
function estimateSpokenWordWeightClient(rawWord) {
  const core = String(rawWord || "").replace(/^[^A-Za-z0-9\u00C0-\u024F]+|[^A-Za-z0-9\u00C0-\u024F]+$/g, "");
  if (!core) return 1.2;

  const lower = core.toLowerCase();
  if (COMMON_FUNCTION_WORDS.has(lower)) {
    return 1.15;
  }

  const upperCount = (core.match(/[A-Z]/g) || []).length;
  const digitCount = (core.match(/[0-9]/g) || []).length;
  const isAllUpperAcronym = core.length >= 2 && core.length <= 6 && upperCount === core.length;
  const isAlphaNumAcronym = core.length >= 2 && core.length <= 8 && digitCount > 0 && (upperCount + digitCount === core.length || /^[A-Za-z]{1,4}\d+/.test(core));

  let weight;
  if (isAllUpperAcronym) {
    weight = core.length * 2.85;
  } else if (isAlphaNumAcronym) {
    weight = (core.length - digitCount) * 2.6 + digitCount * 3.1;
  } else if (digitCount > 0) {
    const nonDigits = core.length - digitCount;
    weight = Math.pow(Math.max(1, nonDigits), 0.78) + digitCount * 2.75;
  } else {
    const parts = core.split(/[-–—/]+/).filter(Boolean);
    if (parts.length > 1) {
      weight = parts.reduce((acc, p) => acc + Math.max(1.35, Math.pow(p.length, 0.78)), 0) + (parts.length - 1) * 0.45;
    } else {
      weight = Math.max(1.4, Math.pow(core.length, 0.78));
      if (upperCount >= 2 && core.length <= 6) {
        weight *= 1.35;
      }
    }
  }

  return weight;
}

/**
 * Computes client-side word and caption-cue timings for any text chunk so the Follow-Along Teleprompter
 * can render interactive word tokens immediately and synchronize at 60fps during audio playback.
 */
function buildClientWordCues(text, durationSec = 0) {
  const clean = String(text || "").trim();
  if (!clean) return { words: [], cues: [], durationMs: 0 };
  const rawTokens = [];
  const rx = /\S+/g;
  let m;
  while ((m = rx.exec(clean)) !== null) {
    const word = m[0];
    const speakWeight = estimateSpokenWordWeightClient(word);
    let pauseAfterWeight = 0;
    if (/[.!?…]['"”’)\]]*$/.test(word)) pauseAfterWeight = 3.2;
    else if (/[;:—–]['"”’)\]]*$/.test(word)) pauseAfterWeight = 2.0;
    else if (/,['"”’)\]]*$/.test(word)) pauseAfterWeight = 1.35;
    rawTokens.push({
      word,
      charStart: m.index,
      charEnd: m.index + word.length,
      speakWeight,
      pauseAfterWeight,
      weight: speakWeight + pauseAfterWeight,
    });
  }
  if (!rawTokens.length) return { words: [], cues: [], durationMs: 0 };

  const estDurationMs = durationSec > 0
    ? Math.max(80, Math.round(durationSec * 1000))
    : Math.max(1000, Math.round((rawTokens.length / 2.5) * 1000));
  const preRollMs = estDurationMs > 900 ? Math.min(130, Math.round(estDurationMs * 0.02)) : 0;
  const postRollMs = estDurationMs > 1200 ? Math.min(380, Math.round(estDurationMs * 0.045)) : 0;
  const activeSpanMs = Math.max(60, estDurationMs - preRollMs - postRollMs);

  const totalWeight = rawTokens.reduce((acc, t) => acc + t.weight, 0) || 1;
  const words = [];
  let cum = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    const startMs = i === 0
      ? preRollMs
      : Math.max(words[i - 1].endMs, preRollMs + Math.round((cum / totalWeight) * activeSpanMs));
    const wordSpeakEndCum = cum + tok.speakWeight;
    cum += tok.weight;
    const endMs = i === rawTokens.length - 1
      ? Math.max(startMs + 1, preRollMs + activeSpanMs)
      : Math.max(startMs + 1, preRollMs + Math.round((wordSpeakEndCum / totalWeight) * activeSpanMs));
    words.push({
      word: tok.word,
      wordIndex: i,
      cueIndex: 0,
      charStart: tok.charStart,
      charEnd: tok.charEnd,
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs),
    });
  }

  const cues = [];
  let curWords = [];
  let curChars = 0;
  const flush = () => {
    if (!curWords.length) return;
    const cueIdx = cues.length;
    for (const w of curWords) w.cueIndex = cueIdx;
    cues.push({
      index: cueIdx,
      text: curWords.map((w) => w.word).join(" "),
      startMs: curWords[0].startMs,
      endMs: curWords[curWords.length - 1].endMs,
      words: curWords,
    });
    curWords = [];
    curChars = 0;
  };

  for (const w of words) {
    const nextChars = curChars === 0 ? w.word.length : curChars + 1 + w.word.length;
    if (curWords.length >= 10 || (curWords.length > 0 && nextChars > 56)) {
      flush();
    }
    curWords.push(w);
    curChars = curChars === 0 ? w.word.length : curChars + 1 + w.word.length;
    if (/[.!?…]['"”’)\]]*$/.test(w.word) && (curWords.length >= 3 || curChars >= 18)) {
      flush();
    }
  }
  flush();

  return { words, cues, durationMs: estDurationMs };
}

function mountPhononStudio(root, payload) {
  clear(root);
  root.classList.add("phonon-studio-root");

  // Studio state
  let status = null;
  let voices = [];
  let customVoices = [];
  let calibrationScripts = [
    {
      id: "rainbow",
      label: "Studio Calibration Passage (Recommended · ~10s)",
      durationHint: "8–12 sec",
      text: "When sunlight strikes raindrops in the air, they act as a prism and form a rainbow. My voice has its own natural pitch, rhythm, and warmth, and Phonon will use this recording to read any document aloud in my own voice.",
    },
    {
      id: "storyteller",
      label: "Expressive Audiobook & Storytelling (~12s)",
      durationHint: "10–14 sec",
      text: "Deep in the quiet library, the old clock chimed midnight as a warm breeze turned the pages of the manuscript. Every sentence carries a distinct melody—from calm, low reflections to bright, lively questions.",
    },
    {
      id: "technical",
      label: "Crisp Article & Technical Briefing (~10s)",
      durationHint: "8–12 sec",
      text: "Local neural text to speech runs entirely on your computer with zero cloud latency. Convert PDF reports, markdown notes, and source code into clear spoken audio and synchronized read-along video.",
    },
  ];
  let audioFormats = [];
  let videoFormats = [];
  let selectedVoice = state.settings?.phononVoice || "Zoey";
  let selectedFormat = state.settings?.phononFormat || "wav";
  let speed = Number(state.settings?.phononSpeed) || 1;
  let pitch = Number(state.settings?.phononPitch) || 0;
  let syncOffsetMs = Number(state.settings?.phononSyncOffsetMs) || 0;
  let pauseMs = Number(state.settings?.phononPauseMs ?? 200);
  let cleanText = state.settings?.phononCleanText !== false;
  let maxChunkChars = 520;
  let rateOrPitchChangedAt = 0;
  let probedOutputLatencyMs = 72;

  // AI Voice Recorder & Cloning state
  let isRecordingVoice = false;
  let isCloningVoice = false;
  let recStartTimeMs = 0;
  let recTimerId = 0;
  let recRafId = 0;
  let recStream = null;
  let recAudioCtx = null;
  let recSourceNode = null;
  let recAnalyserNode = null;
  let recProcessorNode = null;
  let recFloatChunks = [];
  let recSampleRate = 24000;
  let recordedWavBlob = null;
  let recordedWavBase64 = "";
  let recordedDurationSec = 0;
  let recordedSamplesPreview = null;
  let selectedMicDeviceId = "";
  let selectedCalibrationScriptId = "rainbow";
  const samplePreviewAudioEl = new Audio();

  // Read-Along Video & Teleprompter state
  let selectedAspectRatio = "16:9";
  let selectedVideoTheme = "midnight";
  let saveCompanionSubtitles = true;
  let teleprompterSize = "lg"; // "sm" | "md" | "lg" | "xl"
  let teleprompterAutoScroll = true;
  let activeWordIndex = -1;
  let activeCueIndex = -1;
  let currentTeleprompterData = {
    chunkIndex: 0,
    words: [],
    cues: [],
    durationMs: 0,
    pcmAligned: false,
    synthesizedPitch: 0,
  };
  let wordSpanNodes = [];
  let cueRowNodes = [];
  let rafId = 0;

  function formatPitchLabel(semitones) {
    const p = Math.round((Number(semitones) || 0) * 10) / 10;
    if (Math.abs(p) < 0.05) return "0 st (Natural)";
    return `${p > 0 ? "+" : ""}${p.toFixed(1).replace(/\.0$/, "")} st`;
  }

  function formatSyncOffsetLabel(offset) {
    const ms = Math.round(Number(offset) || 0);
    if (ms === 0) return "0 ms (Auto Pitch-Sync)";
    return ms < 0 ? `${ms} ms (Delay Text)` : `+${ms} ms (Advance Text)`;
  }

  function probeHardwareAudioLatency() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const hwSec = (Number(ctx.outputLatency) || 0) + (Number(ctx.baseLatency) || 0);
      if (hwSec > 0.01 && hwSec < 0.6) {
        probedOutputLatencyMs = Math.round(hwSec * 1000);
      }
      void ctx.close().catch(() => {});
    } catch {}
  }
  probeHardwareAudioLatency();

  function getEffectiveAudioLatencyMs() {
    const rateStretchLatency = Math.round(Math.abs(speed - 1) * 95);
    const pitchShiftLatency = Math.abs(pitch) >= 0.25 ? Math.round(50 + Math.abs(pitch) * 8) : 0;
    const elapsedSinceChange = performance.now() - rateOrPitchChangedAt;
    const settleLatency = elapsedSinceChange >= 0 && elapsedSinceChange < 380
      ? Math.round((1 - elapsedSinceChange / 380) * 110)
      : 0;
    return probedOutputLatencyMs + rateStretchLatency + pitchShiftLatency + settleLatency;
  }

  function applyAudioPlaybackSettings() {
    const bakedPitch = Number(currentTeleprompterData.synthesizedPitch) || 0;
    const residualPitch = pitch - bakedPitch;
    if (Math.abs(residualPitch) >= 0.1) {
      const residualFactor = Math.pow(2, residualPitch / 12);
      audioEl.preservesPitch = false;
      audioEl.webkitPreservesPitch = false;
      audioEl.mozPreservesPitch = false;
      audioEl.playbackRate = Math.max(0.25, Math.min(4.0, speed * residualFactor));
    } else {
      audioEl.preservesPitch = true;
      audioEl.webkitPreservesPitch = true;
      audioEl.mozPreservesPitch = true;
      audioEl.playbackRate = Math.max(0.25, Math.min(4.0, speed));
    }
  }

  // Clean options
  let stripMarkdown = true;
  let stripHtml = true;
  let stripCodeBlocks = false;
  let simplifyUrls = true;
  let stripTimestamps = true;
  let unwrapLines = false;

  // Source & Chunks state
  let sourcePath = "";
  let sourceFormatLabel = "Direct Text";
  let sourceMethod = "Ready";
  let chunks = [];
  let chunkPage = 0;
  const CHUNKS_PER_PAGE = 80;

  // Live Playback state
  let isPlaying = false;
  let isPaused = false;
  let activeChunkIndex = -1;
  let playbackSessionId = 0;
  const chunkAudioCache = new Map(); // `${voice}|${chunkText}` -> Promise<{ url, durationSec, words, cues }>

  const audioEl = new Audio();
  audioEl.preload = "auto";
  audioEl.className = "phonon-native-audio";
  audioEl.controls = true;

  // DOM references
  const bannerBox = h("div", { class: "phonon-banner" });
  const voiceSelect = h("select", { id: "phonon-voice-select", class: "input phonon-select" });
  const defaultVoiceBadge = h("span", { class: "phonon-badge phonon-badge-accent" }, `Default: ${selectedVoice}`);
  const voiceDescEl = h("span", { class: "hint phonon-voice-desc" }, "");
  const speedSlider = h("input", {
    id: "phonon-speed-range",
    type: "range",
    min: "0.5",
    max: "2.0",
    step: "0.05",
    value: String(speed),
  });
  const speedValueLabel = h("span", { class: "phonon-metric-val" }, `${speed.toFixed(2).replace(/\.00$/, ".0")}×`);
  const pitchSlider = h("input", {
    id: "phonon-pitch-range",
    type: "range",
    min: "-6",
    max: "6",
    step: "0.5",
    value: String(pitch),
  });
  const pitchValueLabel = h("span", { class: "phonon-metric-val" }, formatPitchLabel(pitch));
  const syncOffsetSlider = h("input", {
    id: "phonon-sync-offset-range",
    type: "range",
    min: "-300",
    max: "300",
    step: "10",
    value: String(syncOffsetMs),
  });
  const syncOffsetValueLabel = h("span", { class: "phonon-metric-val" }, formatSyncOffsetLabel(syncOffsetMs));
  const pauseSlider = h("input", {
    id: "phonon-pause-range",
    type: "range",
    min: "0",
    max: "1000",
    step: "50",
    value: String(pauseMs),
  });
  const pauseValueLabel = h("span", { class: "phonon-metric-val" }, `${pauseMs} ms`);
  const chunkLimitSelect = h("select", { id: "phonon-chunk-limit", class: "input phonon-select" },
    h("option", { value: "360" }, "360 chars — Ultra-Fast Live Start"),
    h("option", { value: "520", selected: true }, "520 chars — Balanced Streaming (Recommended)"),
    h("option", { value: "850" }, "850 chars — Long Paragraph / Audiobook"),
    h("option", { value: "1100" }, "1100 chars — Max Phonon 8K Context Safe"),
  );

  const sourcePathInput = h("input", {
    id: "phonon-source-path",
    type: "text",
    class: "input phonon-path-input",
    placeholder: "File path to convert to plain text (PDF, DOCX, EPUB, HTML, MD, JSON, SRT, TXT…)",
  });
  const sourceFormatBadge = h("span", { class: "phonon-badge" }, "Format: Direct Text");
  const statsSummaryBadge = h("span", { class: "phonon-badge phonon-badge-muted" }, "0 words · 0 chunks");

  const textArea = h("textarea", {
    id: "phonon-text-editor",
    class: "input phonon-textarea",
    rows: "7",
    placeholder: "Paste or type any text here — or load any document/file above to convert it into plain text, read it out loud with live word-by-word highlighting, and save as an Audio or Read-Along Video file.",
  });

  const formatSelect = h("select", { id: "phonon-format-select", class: "input phonon-select" });
  const formatHintEl = h("p", { class: "hint phonon-format-hint" }, "");
  const videoAspectSelect = h("select", { id: "phonon-video-aspect", class: "input phonon-select" },
    h("option", { value: "16:9", selected: true }, "16:9 Widescreen (1920×1080 — YouTube / Desktop)"),
    h("option", { value: "9:16" }, "9:16 Vertical Short (1080×1920 — Shorts / Reels / TikTok)"),
    h("option", { value: "1:1" }, "1:1 Square (1080×1080 — Social Feed)"),
  );
  const videoThemeSelect = h("select", { id: "phonon-video-theme", class: "input phonon-select" },
    h("option", { value: "midnight", selected: true }, "Midnight Studio (Electric Cyan Highlight)"),
    h("option", { value: "parchment" }, "Warm Book Page (Amber Gold Highlight)"),
    h("option", { value: "cyber" }, "Cyber Neon (Neon Cyan & Violet Highlight)"),
    h("option", { value: "high_contrast" }, "Accessible High Contrast (WCAG AAA Yellow)"),
  );
  const outNameInput = h("input", {
    id: "phonon-out-name",
    type: "text",
    class: "input",
    value: "speech",
    placeholder: "Output file name (without extension)",
  });
  const outDirInput = h("input", {
    id: "phonon-out-dir",
    type: "text",
    class: "input",
    value: currentPath() || state.home || "",
    placeholder: "Output folder path",
  });

  const playBtn = h("button", { type: "button", class: "btn primary phonon-play-btn", onclick: () => startOrResumeReading() }, "▶️ Read Out Loud");
  const pauseBtn = h("button", { type: "button", class: "btn", disabled: true, onclick: () => togglePauseReading() }, "⏸ Pause");
  const stopBtn = h("button", { type: "button", class: "btn", disabled: true, onclick: () => stopReading() }, "⏹ Stop");
  const prevChunkBtn = h("button", { type: "button", class: "btn", disabled: true, onclick: () => stepChunk(-1) }, "⏮ Prev");
  const nextChunkBtn = h("button", { type: "button", class: "btn", disabled: true, onclick: () => stepChunk(1) }, "⏭ Next");
  const nowPlayingStatus = h("div", { class: "phonon-now-playing" }, "Ready to read. Press Read Out Loud to listen and follow along word by word.");

  // Live Follow-Along Teleprompter DOM
  const teleprompterWordBadge = h("span", { class: "phonon-badge phonon-badge-accent" }, "Follow-Along Ready");
  const teleprompterStage = h("div", {
    class: `phonon-teleprompter-stage theme-${selectedVideoTheme} size-${teleprompterSize}`,
    role: "region",
    "aria-label": "Follow-Along Synchronized Text Reader",
  });
  const teleprompterProgressFill = h("div", { class: "phonon-teleprompter-progress-fill" });
  const teleprompterSizeSelect = h("select", {
    class: "input phonon-select phonon-sm-select",
    "aria-label": "Follow-along reader font size",
    onchange: (e) => {
      teleprompterSize = e.target.value;
      updateTeleprompterClasses();
    },
  },
    h("option", { value: "sm" }, "Text: Compact"),
    h("option", { value: "md" }, "Text: Comfortable"),
    h("option", { value: "lg", selected: true }, "Text: Large Teleprompter"),
    h("option", { value: "xl" }, "Text: XL Cinema Stage"),
  );

  // Inline Read-Along Video Preview Player DOM
  const videoPlayerEl = h("video", {
    class: "phonon-video-player",
    controls: true,
    playsinline: true,
    preload: "metadata",
  });
  const videoPlayerCaptionLabel = h("span", { class: "phonon-badge phonon-badge-accent" }, "🎬 Read-Along Video Preview");
  const videoPlayerPathLabel = h("span", { class: "hint" }, "");
  const videoPlayerBox = h("div", { class: "phonon-video-preview-card", hidden: true },
    h("div", { class: "phonon-video-preview-head" },
      h("div", { class: "phonon-inline-row" },
        videoPlayerCaptionLabel,
        videoPlayerPathLabel,
      ),
      h("div", { class: "phonon-inline-row" },
        h("button", {
          type: "button",
          class: "btn phonon-sm-btn",
          onclick: () => {
            videoPlayerEl.pause();
            videoPlayerBox.hidden = true;
          },
        }, "✕ Hide Video Player"),
      ),
    ),
    videoPlayerEl,
  );

  const chunkListContainer = h("div", { class: "phonon-chunk-list" });
  const chunkPagerContainer = h("div", { class: "phonon-chunk-pager" });

  // Populate default sample text so user can test immediately if no file was passed
  const DEFAULT_SAMPLE_TEXT =
    "Welcome to the Codecaine Phonon Voice Studio! Powered by Ollama and Gradium Phonon TTS on Apple Silicon MLX, you can follow along word by word as your document is read out loud, convert any file format into clean plain text, and export synchronized Read-Along Videos in MP4, WebM, MOV, or MKV alongside WAV, MP3, M4A, and FLAC audio.";

  function updateTeleprompterClasses() {
    teleprompterStage.className = `phonon-teleprompter-stage theme-${selectedVideoTheme} size-${teleprompterSize}`;
  }

  function updateVoiceDropdown() {
    clear(voiceSelect);
    const list = voices.length ? voices : [{ id: "Zoey", label: "Zoey", category: "Conversational", desc: "Default voice" }];
    const groups = new Map();
    for (const v of list) {
      const cat = v.category || "Conversational";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(v);
    }
    for (const [cat, items] of groups) {
      const optgroup = h("optgroup", { label: `${cat} Voices (${items.length})` });
      for (const v of items) {
        optgroup.append(
          h("option", { value: v.id, selected: v.id === selectedVoice }, `${v.label}${v.id === (state.settings?.phononVoice || "Zoey") ? " ★ (Default)" : ""} — ${v.desc}`),
        );
      }
      voiceSelect.append(optgroup);
    }
    voiceSelect.value = selectedVoice;
    const currentInfo = list.find((v) => v.id === selectedVoice);
    voiceDescEl.textContent = currentInfo ? `${currentInfo.category}: ${currentInfo.desc}` : "";
    defaultVoiceBadge.textContent = `Default: ${state.settings?.phononVoice || "Zoey"}`;
  }

  function allFormatsList() {
    const aud = audioFormats.length
      ? audioFormats
      : [
          { id: "wav", label: "WAV (24 kHz PCM — Native)", needsFfmpeg: false, isVideo: false, desc: "Uncompressed studio WAV directly from Phonon." },
          { id: "mp3", label: "MP3 (Universal Audio)", needsFfmpeg: true, isVideo: false, desc: "Compact MP3 audio file." },
          { id: "m4a", label: "M4A / AAC (Apple & Podcast)", needsFfmpeg: true, isVideo: false, desc: "High-efficiency M4A audio." },
          { id: "flac", label: "FLAC (Lossless)", needsFfmpeg: true, isVideo: false, desc: "Lossless compressed FLAC." },
          { id: "ogg", label: "OGG Vorbis", needsFfmpeg: true, isVideo: false, desc: "Open-source Ogg Vorbis." },
          { id: "opus", label: "Opus (Best Speech Compression)", needsFfmpeg: true, isVideo: false, desc: "Modern speech codec." },
          { id: "aiff", label: "AIFF (Apple PCM — Native)", needsFfmpeg: false, isVideo: false, desc: "Uncompressed Apple AIFF." },
        ];
    const vid = videoFormats.length
      ? videoFormats
      : [
          { id: "mp4", label: "MP4 Read-Along Video (H.264 + Highlighted Text)", needsFfmpeg: true, isVideo: true, desc: "Universal 1080p MP4 Read-Along Video with synchronized word-by-word text highlighting and .SRT/.VTT subtitles." },
          { id: "webm", label: "WebM Read-Along Video (VP9 + Highlighted Text)", needsFfmpeg: true, isVideo: true, desc: "Open-web VP9/Opus Read-Along Video with synchronized text highlighting." },
          { id: "mov", label: "MOV QuickTime Read-Along Video (Apple H.264)", needsFfmpeg: true, isVideo: true, desc: "Apple QuickTime MOV Read-Along Video with synchronized text highlighting." },
          { id: "mkv", label: "MKV Matroska Read-Along Video (H.264 + Subtitles)", needsFfmpeg: true, isVideo: true, desc: "Archival MKV Read-Along Video with synchronized text highlighting." },
        ];
    return { aud, vid, all: [...aud, ...vid] };
  }

  function updateFormatDropdown() {
    clear(formatSelect);
    const { aud, vid, all } = allFormatsList();
    const audioGroup = h("optgroup", { label: "🎵 Audio Formats (Speech Only)" });
    for (const fmt of aud) {
      const needsFf = fmt.needsFfmpeg && status && !status.ffmpegInstalled;
      audioGroup.append(
        h("option", { value: fmt.id, selected: fmt.id === selectedFormat }, `${fmt.label}${needsFf ? " (install ffmpeg first)" : ""}`),
      );
    }
    const videoGroup = h("optgroup", { label: "🎬 Read-Along Video Formats (Voice + Synchronized Highlighted Text)" });
    for (const fmt of vid) {
      const needsFf = fmt.needsFfmpeg && status && !status.ffmpegInstalled;
      videoGroup.append(
        h("option", { value: fmt.id, selected: fmt.id === selectedFormat }, `${fmt.label}${needsFf ? " (install ffmpeg first)" : ""}`),
      );
    }
    formatSelect.append(audioGroup, videoGroup);
    formatSelect.value = selectedFormat;
    const cur = all.find((f) => f.id === selectedFormat);
    formatHintEl.textContent = cur ? cur.desc : "";
  }

  function renderStatusBanner() {
    clear(bannerBox);
    if (!status) {
      bannerBox.append(h("div", { class: "phonon-banner-row" }, h("span", {}, "Checking Ollama & Phonon voice engine…")));
      return;
    }

    const ready = status.ready;
    const ollamaOk = status.ollamaInstalled;
    const modelOk = status.modelInstalled;
    const ffOk = status.ffmpegInstalled;

    const pills = h("div", { class: "phonon-status-pills" },
      h("span", { class: `phonon-pill ${status.supported !== false ? "ok" : "warn"}` }, status.supported !== false ? "🍎 Apple Silicon MLX (macOS ARM64)" : "⚠ Requires Apple Silicon Mac (MLX)"),
      h("span", { class: `phonon-pill ${ollamaOk ? "ok" : "warn"}` }, ollamaOk ? `✔ Ollama (${status.ollamaVersion || "installed"})` : "✖ Ollama not installed"),
      h("span", { class: `phonon-pill ${modelOk ? "ok" : "warn"}` }, modelOk ? "✔ Phonon TTS Model (38 voices)" : "✖ Phonon model not pulled"),
      h("span", { class: `phonon-pill ${ffOk ? "ok" : "muted"}` }, ffOk ? "✔ ffmpeg (All Audio + Read-Along MP4 Video)" : "ℹ WAV & AIFF ready (install ffmpeg for MP3 & Read-Along Video)"),
      h("code", { class: "phonon-cli-badge" }, `ollama run phonon --voice ${selectedVoice.includes(" ") ? `"${selectedVoice}"` : selectedVoice}`),
    );

    const actions = h("div", { class: "phonon-banner-actions" });

    if (!ready) {
      const btnLabel = !ollamaOk ? "⚡ Auto-Install Ollama & Phonon (1-Click)" : "⚡ Download Phonon Voice Model (1-Click)";
      actions.append(
        h("button", {
          type: "button",
          class: "btn primary phonon-install-btn",
          onclick: () => triggerOneClickInstall(),
        }, btnLabel),
      );
    } else {
      actions.append(
        h("button", {
          type: "button",
          class: "btn phonon-sm-btn",
          title: "Run `ollama pull phonon` to make sure you have the latest Phonon voice model",
          onclick: () => triggerOneClickInstall(),
        }, "↻ Update Phonon Model"),
      );
    }

    if (!ffOk) {
      actions.append(
        h("button", {
          type: "button",
          class: "btn phonon-sm-btn",
          title: "Install ffmpeg with one click to unlock Read-Along Video (MP4/WebM/MOV/MKV) and MP3/M4A/FLAC export",
          onclick: () => installFfmpegHelper(),
        }, "⚡ 1-Click Install ffmpeg"),
      );
    }

    actions.append(
      h("button", {
        type: "button",
        class: "btn phonon-sm-btn",
        onclick: () => refreshStatus(),
      }, "Check Again"),
      h("button", {
        type: "button",
        class: "btn phonon-sm-btn",
        onclick: () => showToolsDialog(),
      }, "All Helper Apps…"),
    );

    bannerBox.append(
      h("div", { class: `phonon-banner-card ${ready ? "is-ready" : "needs-setup"}` },
        h("div", { class: "phonon-banner-main" },
          h("div", { class: "phonon-banner-title" },
            h("strong", {}, ready ? "🗣️ Ollama Phonon Neural TTS & Read-Along Video Studio — Ready" : "🗣️ Set Up Ollama Phonon Voice Engine"),
            h("span", { class: "hint" }, status.install?.note || ""),
          ),
          pills,
        ),
        actions,
      ),
    );
  }

  // -------------------------------------------------------------------------------------------------------------
  // Live Synchronized Follow-Along Teleprompter
  // -------------------------------------------------------------------------------------------------------------

  function renderTeleprompterForChunk(chunkIndex, customWords, customCues, durationSec, pcmAligned = false, synthesizedPitch = 0) {
    clear(teleprompterStage);
    wordSpanNodes = [];
    cueRowNodes = [];
    activeWordIndex = -1;
    activeCueIndex = -1;

    if (!chunks.length) {
      teleprompterStage.append(
        h("div", { class: "phonon-teleprompter-empty" }, "Load a document or type text above to follow along word by word as Phonon reads aloud."),
      );
      teleprompterWordBadge.textContent = "0 words";
      teleprompterProgressFill.style.width = "0%";
      return;
    }

    const idx = Math.max(0, Math.min(chunks.length - 1, chunkIndex < 0 ? 0 : chunkIndex));
    const chunk = chunks[idx];
    const fallback = buildClientWordCues(chunk.text, durationSec);
    const hasCustomWords = Array.isArray(customWords) && customWords.length > 0;
    const words = hasCustomWords ? customWords : fallback.words;
    const cues = Array.isArray(customCues) && customCues.length ? customCues : fallback.cues;
    const durationMs = durationSec > 0 ? Math.round(durationSec * 1000) : fallback.durationMs;

    currentTeleprompterData = {
      chunkIndex: idx,
      words,
      cues,
      durationMs,
      pcmAligned: Boolean(pcmAligned && hasCustomWords),
      synthesizedPitch: Number(synthesizedPitch) || 0,
    };

    // Previous chunk context line (if available)
    if (idx > 0 && chunks[idx - 1]) {
      const prevText = chunks[idx - 1].text;
      const snippet = prevText.length > 110 ? `…${prevText.slice(-110)}` : prevText;
      teleprompterStage.append(
        h("div", {
          class: "phonon-teleprompter-context is-prev",
          title: "Click to jump to previous segment",
          onclick: () => playFromChunk(idx - 1),
        }, `↑ Prev (#${idx}): ${snippet}`),
      );
    }

    const cuesWrap = h("div", { class: "phonon-teleprompter-cues" });
    for (let cIdx = 0; cIdx < cues.length; cIdx++) {
      const cue = cues[cIdx];
      const lineEl = h("div", {
        class: `phonon-teleprompter-line${cIdx === 0 && !isPlaying ? " is-active-cue" : ""}`,
        dataset: { cueIdx: String(cIdx) },
      });
      const cueWords = cue.words || words.filter((w) => w.cueIndex === cIdx);
      for (let k = 0; k < cueWords.length; k++) {
        const w = cueWords[k];
        const wIdx = typeof w.wordIndex === "number" ? w.wordIndex : wordSpanNodes.length;
        const span = h("span", {
          class: "phonon-word is-upcoming",
          dataset: {
            wordIdx: String(wIdx),
            startMs: String(w.startMs),
            endMs: String(w.endMs),
          },
          title: `Click to read from "${w.word}" (${(w.startMs / 1000).toFixed(2)}s)`,
          onclick: (ev) => {
            ev.stopPropagation();
            seekToWordInTeleprompter(idx, w);
          },
        }, w.word);
        wordSpanNodes[wIdx] = span;
        lineEl.append(span, k < cueWords.length - 1 ? " " : "");
      }
      cueRowNodes.push(lineEl);
      cuesWrap.append(lineEl);
    }
    teleprompterStage.append(cuesWrap);

    // Next chunk context preview (if available)
    if (idx + 1 < chunks.length && chunks[idx + 1]) {
      const nextText = chunks[idx + 1].text;
      const snippet = nextText.length > 110 ? `${nextText.slice(0, 110)}…` : nextText;
      teleprompterStage.append(
        h("div", {
          class: "phonon-teleprompter-context is-next",
          title: "Click to jump to next segment",
          onclick: () => playFromChunk(idx + 1),
        }, `↓ Next (#${idx + 2}): ${snippet}`),
      );
    }

    teleprompterWordBadge.textContent = `Segment ${idx + 1}/${chunks.length} · ${words.length} words${currentTeleprompterData.pcmAligned ? " · Waveform Synced" : ""}`;
  }

  function seekToWordInTeleprompter(chunkIdx, wordObj) {
    const targetSec = Math.max(0, (Number(wordObj?.startMs) || 0) / 1000);
    if (isPlaying && activeChunkIndex === chunkIdx && audioEl.src) {
      audioEl.currentTime = Math.min(audioEl.duration || targetSec, targetSec);
      if (isPaused) {
        isPaused = false;
        updateTransportButtons();
        void audioEl.play().catch(() => {});
      }
      syncTeleprompterHighlight();
    } else {
      void playFromChunk(chunkIdx, targetSec);
    }
  }

  function highlightWordAtTimeMs(currentMs, totalDurationMs) {
    const { words, chunkIndex } = currentTeleprompterData;
    if (!words.length) return;

    const pct = totalDurationMs > 0 ? Math.min(100, Math.max(0, (currentMs / totalDurationMs) * 100)) : 0;
    teleprompterProgressFill.style.width = `${pct.toFixed(1)}%`;

    let foundIdx = -1;
    // Do not highlight the first word until the voice actually finishes pre-roll silence and reaches words[0].startMs
    if (currentMs >= words[0].startMs) {
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (currentMs >= w.startMs && currentMs <= w.endMs) {
          foundIdx = i;
          break;
        }
        if (currentMs > w.endMs) {
          foundIdx = i;
        }
      }
    }

    if (foundIdx === activeWordIndex) return;
    activeWordIndex = foundIdx;

    for (let i = 0; i < wordSpanNodes.length; i++) {
      const node = wordSpanNodes[i];
      if (!node) continue;
      if (foundIdx < 0) {
        node.className = "phonon-word is-upcoming";
      } else if (i < foundIdx) {
        node.className = "phonon-word is-spoken";
      } else if (i === foundIdx) {
        node.className = "phonon-word is-speaking";
      } else {
        node.className = "phonon-word is-upcoming";
      }
    }

    const activeWordObj = foundIdx >= 0 ? words[foundIdx] : words[0];
    const cueIdx = activeWordObj?.cueIndex ?? 0;
    if (cueIdx !== activeCueIndex) {
      activeCueIndex = cueIdx;
      for (let c = 0; c < cueRowNodes.length; c++) {
        const row = cueRowNodes[c];
        if (!row) continue;
        row.classList.toggle("is-active-cue", c === cueIdx);
        row.classList.toggle("is-past-cue", c < cueIdx);
      }
      if (teleprompterAutoScroll && cueRowNodes[cueIdx]) {
        cueRowNodes[cueIdx].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    const displayWordNum = foundIdx >= 0 ? foundIdx + 1 : 1;
    teleprompterWordBadge.textContent = `🔊 Word ${displayWordNum}/${words.length} · Segment ${chunkIndex + 1}/${chunks.length} · ${Math.round(pct)}%`;
  }

  function syncTeleprompterHighlight() {
    if (!isPlaying || isPaused) return;
    const durSec = Number.isFinite(audioEl.duration) && audioEl.duration > 0
      ? audioEl.duration
      : (currentTeleprompterData.durationMs / 1000) || 1;
    // When word timings are aligned directly to the WAV PCM samples (pcmAligned),
    // do not warp audioEl.currentTime by a synthetic duration scale factor.
    const scale = (!currentTeleprompterData.pcmAligned && currentTeleprompterData.durationMs > 0)
      ? currentTeleprompterData.durationMs / (durSec * 1000)
      : 1;
    const rawMediaMs = Math.max(0, audioEl.currentTime * 1000 * scale);
    const latencyMs = getEffectiveAudioLatencyMs();
    const currentMs = Math.max(0, rawMediaMs - latencyMs + syncOffsetMs);
    highlightWordAtTimeMs(currentMs, currentTeleprompterData.durationMs || durSec * 1000);
  }

  function startTeleprompterLoop() {
    cancelAnimationFrame(rafId);
    const tick = () => {
      if (!isPlaying || isPaused) return;
      syncTeleprompterHighlight();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopTeleprompterLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  audioEl.addEventListener("timeupdate", () => {
    syncTeleprompterHighlight();
  });

  // -------------------------------------------------------------------------------------------------------------
  // Setup & Status Helpers
  // -------------------------------------------------------------------------------------------------------------

  async function triggerOneClickInstall() {
    try {
      toast("Starting one-click Ollama & Phonon setup…", { kind: "info" });
      const { job } = await call("phonon/install", { confirm: true });
      emit("job-started", job);
      pollJobUntilDone(job.id, async () => {
        await refreshStatus();
        toast("Ollama & Phonon voice model are ready!", { kind: "success" });
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "MANUAL_INSTALL") {
        showToolsDialog();
      } else {
        toast(err instanceof ApiError ? err.message : "Could not start installation.", { kind: "error" });
      }
    }
  }

  async function installFfmpegHelper() {
    try {
      const { job } = await call("tools/install", { tools: ["ffmpeg"], confirm: true });
      emit("job-started", job);
      toast("Installing ffmpeg in the background…", { kind: "info" });
      pollJobUntilDone(job.id, () => refreshStatus());
    } catch {
      showToolsDialog();
    }
  }

  function pollJobUntilDone(jobId, onDone, onProgress) {
    const check = async () => {
      try {
        const { jobs } = await call("jobs/list");
        const found = jobs.find((j) => j.id === jobId);
        if (!found || found.state === "done" || found.state === "failed" || found.state === "cancelled") {
          if (found?.state === "done") {
            onDone?.(found);
          } else if (found?.state === "failed") {
            const failedStep = (found.steps || []).find((s) => s.state === "failed");
            const msg = failedStep?.message || "Installation or export step failed. Check the Tasks panel for details.";
            nowPlayingStatus.textContent = `❌ Export failed: ${msg}`;
            toast(msg, { kind: "error" });
            refreshStatus();
          } else if (found?.state === "cancelled") {
            nowPlayingStatus.textContent = "⏹ Export cancelled.";
          }
          return;
        }
        onProgress?.(found);
        setTimeout(check, 900);
      } catch {}
    };
    setTimeout(check, 900);
  }

  async function refreshStatus() {
    try {
      status = await call("phonon/status");
      voices = status.voices || [];
      customVoices = status.customVoices || [];
      if (Array.isArray(status.calibrationScripts) && status.calibrationScripts.length) {
        calibrationScripts = status.calibrationScripts;
      }
      audioFormats = status.audioFormats || [];
      videoFormats = status.videoFormats || [];
      if (status.settings) {
        selectedVoice = status.settings.voice || selectedVoice;
        selectedFormat = status.settings.format || selectedFormat;
        speed = Number(status.settings.speed) || speed;
        pitch = Number(status.settings.pitch ?? pitch);
        syncOffsetMs = Number(status.settings.syncOffsetMs ?? syncOffsetMs);
        pauseMs = Number(status.settings.pauseMs ?? pauseMs);
        cleanText = status.settings.cleanText ?? cleanText;
        speedSlider.value = String(speed);
        speedValueLabel.textContent = `${speed.toFixed(2).replace(/\.00$/, ".0")}×`;
        pitchSlider.value = String(pitch);
        pitchValueLabel.textContent = formatPitchLabel(pitch);
        syncOffsetSlider.value = String(syncOffsetMs);
        syncOffsetValueLabel.textContent = formatSyncOffsetLabel(syncOffsetMs);
        pauseSlider.value = String(pauseMs);
        pauseValueLabel.textContent = `${pauseMs} ms`;
      }
      updateVoiceDropdown();
      updateFormatDropdown();
      renderStatusBanner();
      renderCustomVoicesList();
      renderActiveVoiceFingerprint();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not check Phonon status.", { kind: "error" });
    }
  }

  async function saveAsDefaultVoice() {
    try {
      const res = await call("phonon/voice", {
        voice: selectedVoice,
        format: selectedFormat,
        speed,
        pitch,
        syncOffsetMs,
        cleanText,
        pauseMs,
      });
      if (res.settings) state.settings = res.settings;
      updateVoiceDropdown();
      toast(`"${selectedVoice}" is now your default Phonon voice.`, { kind: "success" });
      announce(`${selectedVoice} set as default voice`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save default voice.", { kind: "error" });
    }
  }

  async function previewSelectedVoice() {
    stopReading();
    samplePreviewAudioEl.pause();
    const matchedCustom = customVoices.find((cv) => cv.id === selectedVoice);
    const spokenName = matchedCustom ? matchedCustom.label : selectedVoice;
    const sample = matchedCustom
      ? `Hello! This is ${spokenName}, speaking in my own cloned voice at ${matchedCustom.profile?.medianF0Hz || 110} hertz through Ollama Phonon.`
      : `Hello! I am ${spokenName}, speaking through Ollama Phonon in Codecaine File Manager. Watch each word highlight as I speak!`;
    nowPlayingStatus.textContent = `Synthesizing voice preview for "${spokenName}"…`;
    if (matchedCustom) {
      recStateBadge.textContent = `⏳ Synthesizing AI Voice preview for "${spokenName}" (${matchedCustom.profile?.medianF0Hz} Hz)…`;
    }
    try {
      const res = await call("phonon/speak", { text: sample, voice: selectedVoice, pitch });
      currentTeleprompterData.synthesizedPitch = Number(res.pitch) || 0;
      audioEl.src = audioUrlWithToken(res.url);
      applyAudioPlaybackSettings();
      await audioEl.play();
      const statusMsg = matchedCustom
        ? `🔊 Speaking with your cloned AI voice "${spokenName}" (${matchedCustom.profile?.medianF0Hz} Hz ${matchedCustom.profile?.voiceRegister} · ${res.durationSec}s)`
        : `Previewing voice "${spokenName}" (${res.durationSec}s, 24 kHz WAV${pitch ? `, pitch ${formatPitchLabel(pitch)}` : ""}).`;
      nowPlayingStatus.textContent = statusMsg;
      if (matchedCustom) {
        recStateBadge.textContent = statusMsg;
        toast(statusMsg, { kind: "info" });
      }
    } catch (err) {
      nowPlayingStatus.textContent = err instanceof ApiError ? err.message : "Voice preview failed.";
      if (matchedCustom) recStateBadge.textContent = `⚠ ${nowPlayingStatus.textContent}`;
      toast(nowPlayingStatus.textContent, { kind: "error" });
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Chunking & Large-Text Optimization
  // -------------------------------------------------------------------------------------------------------------

  let chunkTimer = null;
  function scheduleRechunk() {
    clearTimeout(chunkTimer);
    chunkTimer = setTimeout(() => {
      void recomputeChunksFromEditor();
    }, 180);
  }

  async function recomputeChunksFromEditor() {
    const raw = textArea.value;
    if (!raw.trim()) {
      chunks = [];
      statsSummaryBadge.textContent = "0 words · 0 chunks";
      renderChunkList();
      renderTeleprompterForChunk(0);
      return;
    }
    try {
      const res = await call("phonon/chunk", { text: raw, maxChars: maxChunkChars });
      chunks = res.chunks || [];
      statsSummaryBadge.textContent = `${res.wordCount.toLocaleString()} words · ${res.charCount.toLocaleString()} chars · ${res.chunkCount.toLocaleString()} Phonon chunk${res.chunkCount === 1 ? "" : "s"} (~${formatDuration(res.estimatedSeconds)})`;
      if (chunkPage * CHUNKS_PER_PAGE >= chunks.length) chunkPage = 0;
      renderChunkList();
      if (!isPlaying) {
        renderTeleprompterForChunk(activeChunkIndex >= 0 ? activeChunkIndex : 0);
      }
    } catch {
      // Fallback client-side count if server is busy
    }
  }

  function renderChunkList() {
    clear(chunkListContainer);
    clear(chunkPagerContainer);

    if (!chunks.length) {
      chunkListContainer.append(
        h("div", { class: "phonon-empty-chunks" }, "No text chunks yet. Load a file or paste text above to split it into Phonon-safe speech segments."),
      );
      return;
    }

    const totalPages = Math.ceil(chunks.length / CHUNKS_PER_PAGE);
    if (totalPages > 1) {
      chunkPagerContainer.append(
        h("button", {
          type: "button",
          class: "btn phonon-sm-btn",
          disabled: chunkPage <= 0,
          onclick: () => { chunkPage = Math.max(0, chunkPage - 1); renderChunkList(); },
        }, "← Prev Page"),
        h("span", { class: "hint" }, `Showing chunks ${chunkPage * CHUNKS_PER_PAGE + 1}–${Math.min(chunks.length, (chunkPage + 1) * CHUNKS_PER_PAGE)} of ${chunks.length.toLocaleString()}`),
        h("button", {
          type: "button",
          class: "btn phonon-sm-btn",
          disabled: chunkPage >= totalPages - 1,
          onclick: () => { chunkPage = Math.min(totalPages - 1, chunkPage + 1); renderChunkList(); },
        }, "Next Page →"),
      );
    }

    const startIdx = chunkPage * CHUNKS_PER_PAGE;
    const visible = chunks.slice(startIdx, startIdx + CHUNKS_PER_PAGE);

    for (const chunk of visible) {
      const isCurrent = chunk.index === activeChunkIndex;
      const cacheKey = `${selectedVoice}|${pitch}|${chunk.text}`;
      const isCached = chunkAudioCache.has(cacheKey);
      const itemEl = h("div", {
        class: `phonon-chunk-item${isCurrent ? " is-active" : ""}${isCached ? " is-cached" : ""}`,
        dataset: { index: String(chunk.index) },
        onclick: () => playFromChunk(chunk.index),
      },
        h("div", { class: "phonon-chunk-meta" },
          h("span", { class: "phonon-chunk-num" }, `#${chunk.index + 1}`),
          h("span", { class: "phonon-chunk-info" }, `Para ${chunk.paragraphIndex + 1} · ${chunk.wordCount} words · ${chunk.charCount}/${maxChunkChars} chars`),
          h("span", { class: "phonon-chunk-state" }, isCurrent ? (isPaused ? "⏸ Paused" : "🔊 Speaking & Following Along") : isCached ? "✔ Cached" : "▶ Click to read & follow along"),
        ),
        h("div", { class: "phonon-chunk-text" }, chunk.text),
      );
      chunkListContainer.append(itemEl);
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Format-to-Plain-Text Extraction & Cleanup
  // -------------------------------------------------------------------------------------------------------------

  async function loadFileAndExtract(filePath) {
    if (!filePath) return;
    stopReading();
    sourcePath = filePath;
    sourcePathInput.value = filePath;
    const stem = stemOf(baseName(filePath, state.sep)) || "speech";
    outNameInput.value = stem;
    const parentIdx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    if (parentIdx > 0) outDirInput.value = filePath.slice(0, parentIdx);

    nowPlayingStatus.textContent = `Converting "${baseName(filePath, state.sep)}" to plain text…`;
    try {
      const res = await call("phonon/extract", {
        path: filePath,
        clean: cleanText,
        stripMarkdown,
        stripHtml,
        stripCodeBlocks,
        simplifyUrls,
        stripTimestamps,
        unwrapLines,
        maxChars: maxChunkChars,
      });
      sourceFormatLabel = res.formatLabel || "Document";
      sourceMethod = res.method || "Built-in Extractor";
      sourceFormatBadge.textContent = `${sourceFormatLabel} (${sourceMethod})`;
      textArea.value = res.text || "";
      chunks = res.chunks || [];
      chunkPage = 0;
      statsSummaryBadge.textContent = `${res.wordCount.toLocaleString()} words · ${res.charCount.toLocaleString()} chars · ${res.chunkCount.toLocaleString()} Phonon chunk${res.chunkCount === 1 ? "" : "s"} (~${formatDuration(res.estimatedSeconds)})`;
      renderChunkList();
      renderTeleprompterForChunk(0);
      nowPlayingStatus.textContent = `Converted "${baseName(filePath, state.sep)}" (${sourceFormatLabel}) into ${res.chunkCount.toLocaleString()} Phonon-safe plain-text chunk${res.chunkCount === 1 ? "" : "s"}.`;
      toast(`Converted ${baseName(filePath, state.sep)} to plain text (${res.wordCount.toLocaleString()} words).`, { kind: "info" });
    } catch (err) {
      nowPlayingStatus.textContent = err instanceof ApiError ? err.message : "Could not extract plain text from that file.";
      toast(nowPlayingStatus.textContent, { kind: "error" });
    }
  }

  async function cleanEditorTextNow() {
    if (!textArea.value.trim()) {
      toast("Paste or load some text first.", { kind: "info" });
      return;
    }
    try {
      const res = await call("phonon/extract", {
        text: textArea.value,
        clean: true,
        stripMarkdown,
        stripHtml,
        stripCodeBlocks,
        simplifyUrls,
        stripTimestamps,
        unwrapLines,
        maxChars: maxChunkChars,
      });
      textArea.value = res.text || "";
      chunks = res.chunks || [];
      chunkPage = 0;
      sourceFormatBadge.textContent = "Plain Text (Cleaned for Speech)";
      statsSummaryBadge.textContent = `${res.wordCount.toLocaleString()} words · ${res.charCount.toLocaleString()} chars · ${res.chunkCount.toLocaleString()} Phonon chunk${res.chunkCount === 1 ? "" : "s"} (~${formatDuration(res.estimatedSeconds)})`;
      renderChunkList();
      renderTeleprompterForChunk(0);
      toast("Converted & cleaned text into speech-ready plain text.", { kind: "info" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not clean text.", { kind: "error" });
    }
  }

  async function saveConvertedPlainText() {
    if (!textArea.value.trim()) {
      toast("There is no plain text in the editor to save.", { kind: "info" });
      return;
    }
    try {
      const res = await call("phonon/savetxt", {
        text: textArea.value,
        sourcePath,
        outputDir: outDirInput.value.trim() || currentPath() || state.home,
        outputName: `${outNameInput.value.trim() || "plain-text"}`,
      });
      toast(`Saved plain text: ${baseName(res.path, state.sep)}`, { kind: "success" });
      if (currentPath() && res.path.startsWith(currentPath())) {
        void refresh().then(() => selectKeys([res.path]));
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save plain text file.", { kind: "error" });
    }
  }

  function loadSelectedFromFileManager() {
    const sel = selectedEntries().filter((e) => !e.isDir);
    if (!sel.length) {
      toast("Select a file in the File Manager first, or type a path into the box.", { kind: "info" });
      return;
    }
    void loadFileAndExtract(sel[0].path);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Streaming Multi-Chunk Read Out Loud Player with Lookahead Prefetching & Word-by-Word Follow-Along
  // -------------------------------------------------------------------------------------------------------------

  function fetchChunkAudio(chunkIndex, voiceName, pitchSemitones = pitch) {
    const chunk = chunks[chunkIndex];
    if (!chunk) return Promise.reject(new Error("Chunk out of range"));
    const normPitch = Math.round((Number(pitchSemitones) || 0) * 10) / 10;
    const key = `${voiceName}|${normPitch}|${chunk.text}`;
    let pending = chunkAudioCache.get(key);
    if (!pending) {
      pending = call("phonon/speak", { text: chunk.text, voice: voiceName, pitch: normPitch }).then((res) => {
        renderChunkList();
        return res;
      }).catch((err) => {
        chunkAudioCache.delete(key);
        throw err;
      });
      chunkAudioCache.set(key, pending);
    }
    return pending;
  }

  function updateTransportButtons() {
    playBtn.textContent = isPlaying && isPaused ? "▶️ Resume Reading" : isPlaying ? "🔄 Restart from Top" : "▶️ Read Out Loud";
    pauseBtn.disabled = !isPlaying;
    pauseBtn.textContent = isPaused ? "▶️ Resume" : "⏸ Pause";
    stopBtn.disabled = !isPlaying && activeChunkIndex < 0;
    prevChunkBtn.disabled = !chunks.length || activeChunkIndex <= 0;
    nextChunkBtn.disabled = !chunks.length || activeChunkIndex < 0 || activeChunkIndex >= chunks.length - 1;
  }

  async function startOrResumeReading() {
    if (isPlaying && isPaused) {
      isPaused = false;
      updateTransportButtons();
      renderChunkList();
      startTeleprompterLoop();
      await audioEl.play().catch(() => {});
      return;
    }
    if (!chunks.length) {
      await recomputeChunksFromEditor();
    }
    if (!chunks.length) {
      toast("Enter or load some text to read out loud.", { kind: "info" });
      return;
    }
    await playFromChunk(0);
  }

  function togglePauseReading() {
    if (!isPlaying) return;
    if (isPaused) {
      isPaused = false;
      startTeleprompterLoop();
      void audioEl.play().catch(() => {});
      nowPlayingStatus.textContent = `Reading chunk ${activeChunkIndex + 1} of ${chunks.length} with voice "${selectedVoice}"…`;
    } else {
      isPaused = true;
      stopTeleprompterLoop();
      audioEl.pause();
      nowPlayingStatus.textContent = `Paused at chunk ${activeChunkIndex + 1} of ${chunks.length}.`;
    }
    updateTransportButtons();
    renderChunkList();
  }

  function stopReading() {
    playbackSessionId++;
    isPlaying = false;
    isPaused = false;
    activeChunkIndex = -1;
    stopTeleprompterLoop();
    audioEl.pause();
    audioEl.removeAttribute("src");
    updateTransportButtons();
    renderChunkList();
    renderTeleprompterForChunk(0);
    nowPlayingStatus.textContent = "Stopped.";
  }

  function stepChunk(delta) {
    if (!chunks.length) return;
    const nextIdx = Math.min(chunks.length - 1, Math.max(0, (activeChunkIndex < 0 ? 0 : activeChunkIndex) + delta));
    void playFromChunk(nextIdx);
  }

  async function playFromChunk(startIndex, seekSec = 0) {
    if (!chunks.length || startIndex < 0 || startIndex >= chunks.length) return;
    const session = ++playbackSessionId;
    isPlaying = true;
    isPaused = false;
    activeChunkIndex = startIndex;

    const targetPage = Math.floor(startIndex / CHUNKS_PER_PAGE);
    if (targetPage !== chunkPage) chunkPage = targetPage;

    updateTransportButtons();
    renderChunkList();
    renderTeleprompterForChunk(startIndex);

    const activeRow = chunkListContainer.querySelector(`.phonon-chunk-item[data-index="${startIndex}"]`);
    activeRow?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const voiceToUse = selectedVoice;
    const pitchToUse = pitch;
    nowPlayingStatus.textContent = `Synthesizing chunk ${startIndex + 1} of ${chunks.length} with voice "${voiceToUse}"${pitchToUse ? ` (pitch ${formatPitchLabel(pitchToUse)})` : ""}…`;

    try {
      // Start current chunk synthesis first so it is queued ahead of background lookahead prefetches
      const currentFetchPromise = fetchChunkAudio(startIndex, voiceToUse, pitchToUse);
      if (startIndex + 1 < chunks.length) {
        setTimeout(() => {
          if (playbackSessionId === session) void fetchChunkAudio(startIndex + 1, voiceToUse, pitchToUse).catch(() => {});
        }, 60);
      }
      if (startIndex + 2 < chunks.length) {
        setTimeout(() => {
          if (playbackSessionId === session) void fetchChunkAudio(startIndex + 2, voiceToUse, pitchToUse).catch(() => {});
        }, 350);
      }
      const res = await currentFetchPromise;
      if (playbackSessionId !== session) return;

      renderTeleprompterForChunk(
        startIndex,
        res.words,
        res.cues,
        res.durationSec,
        res.pcmAligned !== false,
        res.pitch ?? pitchToUse,
      );
      audioEl.src = audioUrlWithToken(res.url);
      applyAudioPlaybackSettings();
      if (seekSec > 0) {
        audioEl.currentTime = seekSec;
      }
      nowPlayingStatus.textContent = `🔊 Speaking chunk ${startIndex + 1} of ${chunks.length} (${voiceToUse}, ${res.durationSec}s${pitchToUse ? `, ${formatPitchLabel(pitchToUse)}` : ""}) — Waveform-synced follow along!`;
      startTeleprompterLoop();
      await audioEl.play();
    } catch (err) {
      if (playbackSessionId !== session) return;
      isPlaying = false;
      stopTeleprompterLoop();
      updateTransportButtons();
      renderChunkList();
      nowPlayingStatus.textContent = err instanceof ApiError ? err.message : "Could not synthesize speech chunk.";
      toast(nowPlayingStatus.textContent, { kind: "error" });
    }
  }

  audioEl.addEventListener("ended", () => {
    if (!isPlaying || isPaused) return;
    stopTeleprompterLoop();
    const session = playbackSessionId;
    const nextIdx = activeChunkIndex + 1;
    if (nextIdx < chunks.length) {
      const currentChunk = chunks[activeChunkIndex];
      const nextChunk = chunks[nextIdx];
      const delay = nextChunk && currentChunk && nextChunk.paragraphIndex !== currentChunk.paragraphIndex
        ? pauseMs
        : Math.min(100, Math.round(pauseMs * 0.4));
      setTimeout(() => {
        if (playbackSessionId === session && isPlaying && !isPaused) {
          void playFromChunk(nextIdx);
        }
      }, delay);
    } else {
      highlightWordAtTimeMs(currentTeleprompterData.durationMs, currentTeleprompterData.durationMs);
      isPlaying = false;
      isPaused = false;
      activeChunkIndex = -1;
      updateTransportButtons();
      renderChunkList();
      nowPlayingStatus.textContent = `✔ Finished reading all ${chunks.length.toLocaleString()} chunks aloud.`;
    }
  });

  // -------------------------------------------------------------------------------------------------------------
  // Inline Read-Along Video Player Preview
  // -------------------------------------------------------------------------------------------------------------

  function loadExportedVideoIntoPreview(videoPath) {
    if (!videoPath) return;
    const ext = extensionOf(videoPath);
    if (!VIDEO_EXT_SET.has(ext)) return;

    clear(videoPlayerEl);
    videoPlayerEl.src = rawFileUrl(videoPath);
    // Attach companion .vtt subtitle track if saved alongside the video
    const dotIdx = videoPath.lastIndexOf(".");
    const vttPath = dotIdx > 0 ? `${videoPath.slice(0, dotIdx)}.vtt` : `${videoPath}.vtt`;
    const trackEl = h("track", {
      kind: "subtitles",
      srclang: "en",
      label: "Follow Along Captions",
      src: rawFileUrl(vttPath),
      default: true,
    });
    videoPlayerEl.append(trackEl);

    const activateSubtitleTrack = () => {
      try {
        if (videoPlayerEl.textTracks && videoPlayerEl.textTracks.length > 0) {
          for (let i = 0; i < videoPlayerEl.textTracks.length; i++) {
            videoPlayerEl.textTracks[i].mode = i === 0 ? "showing" : "disabled";
          }
        }
      } catch {}
    };
    videoPlayerEl.addEventListener("loadedmetadata", activateSubtitleTrack, { once: true });
    setTimeout(activateSubtitleTrack, 120);

    videoPlayerPathLabel.textContent = baseName(videoPath, state.sep);
    videoPlayerBox.hidden = false;
    videoPlayerEl.load();
    videoPlayerBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // -------------------------------------------------------------------------------------------------------------
  // Save as Audio File OR Read-Along Video (Single Text/Document or Batch Selected Files)
  // -------------------------------------------------------------------------------------------------------------

  async function exportEditorTextWithFormat(targetFormat) {
    const raw = textArea.value.trim();
    if (!raw) {
      toast("Enter or load some text before exporting.", { kind: "info" });
      return;
    }
    if (isPlaying || isPaused) {
      stopReading();
    }
    const fmt = targetFormat || selectedFormat || "wav";
    const isVid = VIDEO_EXT_SET.has(fmt);
    try {
      const res = await call(isVid ? "phonon/video" : "phonon/save", {
        text: raw,
        voice: selectedVoice,
        format: fmt,
        speed,
        pitch,
        pauseMs,
        cleanText: false,
        outputDir: outDirInput.value.trim() || currentPath() || state.home,
        outputName: outNameInput.value.trim() || (isVid ? "read-along-video" : "speech"),
        maxChunkChars: Math.max(maxChunkChars, 750),
        aspectRatio: selectedAspectRatio,
        videoTheme: selectedVideoTheme,
        saveSubtitles: saveCompanionSubtitles,
        title: outNameInput.value.trim() || "Ollama Phonon Read-Along",
      });
      emit("job-started", res.job);
      const kindDesc = isVid ? `Read-Along Video (.${fmt.toUpperCase()}, ${selectedAspectRatio})` : `.${fmt.toUpperCase()} audio`;
      nowPlayingStatus.textContent = `⏳ Rendering ${kindDesc} (${chunks.length} chunks, voice: ${selectedVoice})… See Tasks tray for live progress.`;
      toast(`Started rendering ${kindDesc} with voice "${selectedVoice}".`, { kind: "info" });
      pollJobUntilDone(
        res.job.id,
        (finishedJob) => {
          const out = finishedJob.outputs?.[0] || res.outputs?.[0];
          nowPlayingStatus.textContent = out
            ? `✔ Saved ${isVid ? "Read-Along Video" : "audio file"}: ${out}`
            : `✔ ${isVid ? "Read-Along Video" : "Audio"} export complete!`;
          toast(`Saved ${isVid ? "Read-Along Video" : "audio"}: ${out ? baseName(out, state.sep) : fmt.toUpperCase()}`, { kind: "success" });
          if (isVid && out) {
            loadExportedVideoIntoPreview(out);
          }
          if (currentPath() && out && out.startsWith(currentPath())) {
            void refresh().then(() => selectKeys([out]));
          }
        },
        (runningJob) => {
          if (runningJob.log) {
            const lastLine = runningJob.log.trim().split(/\r?\n/).pop();
            if (lastLine) {
              nowPlayingStatus.textContent = `⏳ Rendering ${kindDesc}: ${lastLine}`;
            }
          }
        },
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not start export.", { kind: "error" });
    }
  }

  async function batchConvertSelectedFiles(forceVideo = false) {
    const sel = selectedEntries().filter((e) => !e.isDir);
    if (!sel.length) {
      toast("Select one or more files in the File Manager list first.", { kind: "info" });
      return;
    }
    if (isPlaying || isPaused) {
      stopReading();
    }
    const fmt = forceVideo
      ? (VIDEO_EXT_SET.has(selectedFormat) ? selectedFormat : "mp4")
      : selectedFormat;
    const isVid = VIDEO_EXT_SET.has(fmt);
    const kindDesc = isVid ? `Read-Along Video (.${fmt.toUpperCase()}, ${selectedAspectRatio})` : `.${fmt.toUpperCase()} audio`;
    try {
      const res = await call(isVid ? "phonon/video" : "phonon/save", {
        paths: sel.map((e) => e.path),
        voice: selectedVoice,
        format: fmt,
        speed,
        pitch,
        pauseMs,
        cleanText,
        outputDir: outDirInput.value.trim() || currentPath() || "",
        maxChunkChars: Math.max(maxChunkChars, 800),
        aspectRatio: selectedAspectRatio,
        videoTheme: selectedVideoTheme,
        saveSubtitles: saveCompanionSubtitles,
      });
      emit("job-started", res.job);
      nowPlayingStatus.textContent = `⏳ Converting ${sel.length} file${sel.length === 1 ? "" : "s"} to ${kindDesc} (${selectedVoice})…`;
      toast(
        `Converting ${sel.length} file${sel.length === 1 ? "" : "s"} to .${fmt.toUpperCase()} ${isVid ? "Read-Along Video" : "audio"} with voice "${selectedVoice}"…`,
        { kind: "info" },
      );
      pollJobUntilDone(
        res.job.id,
        (finishedJob) => {
          const out = finishedJob.outputs?.[0] || res.outputs?.[0];
          nowPlayingStatus.textContent = out
            ? `✔ Saved ${isVid ? "Read-Along Video" : "audio file"}: ${out}`
            : `✔ ${isVid ? "Read-Along Video" : "Audio"} batch export complete!`;
          toast(`Saved ${isVid ? "Read-Along Video" : "audio"}: ${out ? baseName(out, state.sep) : fmt.toUpperCase()}`, { kind: "success" });
          if (isVid && out) loadExportedVideoIntoPreview(out);
          if (currentPath() && out && out.startsWith(currentPath())) {
            void refresh().then(() => selectKeys(finishedJob.outputs || [out]));
          }
        },
        (runningJob) => {
          if (runningJob.log) {
            const lastLine = runningJob.log.trim().split(/\r?\n/).pop();
            if (lastLine) {
              nowPlayingStatus.textContent = `⏳ Converting to ${kindDesc}: ${lastLine}`;
            }
          }
        },
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not start batch conversion.", { kind: "error" });
    }
  }

  function loadLargeTextStressSample() {
    const paragraphs = [];
    for (let i = 1; i <= 18; i++) {
      paragraphs.push(
        `Chapter ${i}: Large Text Context Window Optimization & Read-Along Video. When reading a long book, research paper, or technical manual with Ollama Phonon, passing the entire document at once would exceed the 8,192-token context limit shared between text tokens and generated audio codec frames. By splitting documents at natural paragraph, sentence, and clause boundaries, Codecaine File Manager streams chunk ${i} smoothly with live word-by-word follow-along highlighting and stitches 24 kHz PCM audio into full Read-Along MP4 Videos.`,
      );
    }
    sourcePath = "";
    sourceFormatBadge.textContent = "Large Multi-Chapter Sample (18 Paragraphs)";
    outNameInput.value = "large-audiobook-sample";
    textArea.value = paragraphs.join("\n\n");
    void recomputeChunksFromEditor();
    toast("Loaded 18-paragraph large text sample to demonstrate multi-chunk Phonon streaming, follow-along & video stitching.", { kind: "info" });
  }

  // -------------------------------------------------------------------------------------------------------------
  // AI Voice Recorder, Waveform Oscilloscope & Custom Voice Cloning Studio
  // -------------------------------------------------------------------------------------------------------------

  const customVoiceNameInput = h("input", {
    id: "phonon-custom-voice-name",
    type: "text",
    class: "input",
    value: "My Studio Voice",
    placeholder: "Name your AI voice (e.g. My Voice, Alex Narrator)",
  });
  const micDeviceSelect = h("select", { id: "phonon-mic-select", class: "input phonon-select" },
    h("option", { value: "" }, "🎙️ Default System Microphone"),
  );
  const calibrationScriptSelect = h("select", { id: "phonon-calibration-script", class: "input phonon-select" });
  const calibrationPromptBox = h("div", { class: "phonon-calibration-prompt" }, "");
  const recStateBadge = h("span", { class: "phonon-badge phonon-badge-accent" }, "🎙️ 24 kHz Studio Recorder Ready");
  const recTimerLabel = h("span", { class: "phonon-rec-timer" }, "00:00.0 / 00:15.0");
  const recDbMeterFill = h("div", { class: "phonon-db-meter-fill" });
  const recDbLabel = h("span", { class: "phonon-rec-db-label" }, "-∞ dB");
  const waveformCanvas = h("canvas", {
    class: "phonon-waveform-canvas",
    width: "760",
    height: "74",
    "aria-label": "Voice recording waveform oscilloscope",
  });

  const recordVoiceBtn = h("button", {
    type: "button",
    class: "btn phonon-record-btn",
    onclick: () => toggleVoiceRecording(),
  }, "🔴 Record My Voice");

  const playRecordedSampleBtn = h("button", {
    type: "button",
    class: "btn",
    disabled: true,
    onclick: () => playCurrentRecordedSample(),
  }, "🎧 Hear My Recording");

  const hiddenVoiceFileInput = h("input", {
    type: "file",
    class: "phonon-hidden-file-input",
    hidden: true,
    accept: "audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm",
    style: { display: "none" },
    onchange: (e) => {
      const file = e.target.files?.[0];
      if (file) void importVoiceAudioFileFromPicker(file);
      e.target.value = "";
    },
  });

  const importVoiceFileBtn = h("button", {
    type: "button",
    class: "btn",
    title: "Import an existing voice recording file (.WAV, .MP3, .M4A, .FLAC, .OGG) from your computer",
    onclick: () => hiddenVoiceFileInput.click(),
  }, "📂 Import Voice File");

  const cloneVoiceBtn = h("button", {
    type: "button",
    class: "btn primary phonon-clone-btn",
    disabled: true,
    onclick: () => createMyAiVoiceNow(),
  }, "✨ Create My AI Voice & Use for Reading");

  const voiceFingerprintBox = h("div", { class: "phonon-voice-fingerprint-box" });
  const customVoicesListBox = h("div", { class: "phonon-custom-voices-list" });

  function updateCalibrationScriptUI() {
    clear(calibrationScriptSelect);
    for (const sc of calibrationScripts) {
      calibrationScriptSelect.append(
        h("option", { value: sc.id, selected: sc.id === selectedCalibrationScriptId }, sc.label),
      );
    }
    calibrationScriptSelect.append(
      h("option", { value: "editor", selected: selectedCalibrationScriptId === "editor" }, "📖 Read from Current Editor Text"),
    );
    const matched = calibrationScripts.find((s) => s.id === selectedCalibrationScriptId);
    const promptText = selectedCalibrationScriptId === "editor"
      ? (textArea.value.trim().slice(0, 260) || calibrationScripts[0].text)
      : (matched?.text || calibrationScripts[0].text);
    clear(calibrationPromptBox);
    calibrationPromptBox.append(
      h("div", { class: "phonon-calibration-prompt-head" },
        h("strong", {}, "📜 Guided Reading Script (Read this out loud at a natural, comfortable pace):"),
        h("span", { class: "hint" }, matched?.durationHint ? `Target length: ${matched.durationHint}` : "8–15 sec recommended"),
      ),
      h("div", { class: "phonon-calibration-prompt-text" }, `"${promptText}"`),
    );
  }

  calibrationScriptSelect.addEventListener("change", () => {
    selectedCalibrationScriptId = calibrationScriptSelect.value;
    updateCalibrationScriptUI();
  });

  async function refreshMicrophoneDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const mics = devs.filter((d) => d.kind === "audioinput");
      clear(micDeviceSelect);
      micDeviceSelect.append(h("option", { value: "" }, "🎙️ Default System Microphone"));
      mics.forEach((m, idx) => {
        if (!m.deviceId || m.deviceId === "default") return;
        micDeviceSelect.append(
          h("option", { value: m.deviceId, selected: m.deviceId === selectedMicDeviceId }, `🎙️ ${m.label || `Microphone ${idx + 1}`}`),
        );
      });
    } catch {}
  }

  micDeviceSelect.addEventListener("change", () => {
    selectedMicDeviceId = micDeviceSelect.value;
  });

  function drawIdleOrStaticWaveform(samplesFloat32, isActiveRec = false) {
    const ctx2d = waveformCanvas.getContext("2d");
    if (!ctx2d) return;
    const W = waveformCanvas.width;
    const H = waveformCanvas.height;
    ctx2d.clearRect(0, 0, W, H);

    // Subtle studio grid
    ctx2d.fillStyle = "rgba(9, 14, 28, 0.92)";
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, H / 2);
    ctx2d.lineTo(W, H / 2);
    ctx2d.stroke();

    if (!samplesFloat32 || !samplesFloat32.length) {
      ctx2d.fillStyle = "rgba(148, 163, 184, 0.65)";
      ctx2d.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx2d.textAlign = "center";
      ctx2d.fillText("Click '🔴 Record My Voice' and read the passage above (or import an audio file)", W / 2, H / 2 + 4);
      return;
    }

    const numBars = 140;
    const barW = Math.max(2, Math.floor(W / numBars) - 2);
    const step = Math.max(1, Math.floor(samplesFloat32.length / numBars));
    ctx2d.fillStyle = isActiveRec ? "#fb7185" : "#38bdf8";

    for (let b = 0; b < numBars; b++) {
      const start = b * step;
      const end = Math.min(samplesFloat32.length, start + step);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const a = Math.abs(samplesFloat32[i] || 0);
        if (a > peak) peak = a;
      }
      const barH = Math.max(3, Math.min(H - 8, Math.round(peak * (H - 8))));
      const x = b * (W / numBars) + 1;
      const y = Math.round((H - barH) / 2);
      ctx2d.fillRect(x, y, barW, barH);
    }
  }

  function encodeFloat32ToWav24k(monoFloats, srcRate) {
    const targetRate = 24000;
    const maxOutSamples = targetRate * 18; // Cap at 18 seconds
    const rawOutSamples = srcRate === targetRate
      ? monoFloats.length
      : Math.max(1, Math.round((monoFloats.length * targetRate) / srcRate));
    const outSamples = Math.min(maxOutSamples, rawOutSamples);
    const resampled = new Float32Array(outSamples);

    if (srcRate === targetRate) {
      resampled.set(monoFloats.subarray(0, outSamples));
    } else {
      const ratio = srcRate / targetRate;
      for (let i = 0; i < outSamples; i++) {
        const pos = i * ratio;
        const i0 = Math.min(monoFloats.length - 1, Math.floor(pos));
        const i1 = Math.min(monoFloats.length - 1, i0 + 1);
        const frac = pos - i0;
        resampled[i] = monoFloats[i0] * (1 - frac) + monoFloats[i1] * frac;
      }
    }

    const pcmBytes = outSamples * 2;
    const buffer = new ArrayBuffer(44 + pcmBytes);
    const view = new DataView(buffer);
    const writeAscii = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + pcmBytes, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, pcmBytes, true);

    for (let i = 0; i < outSamples; i++) {
      const clamped = Math.max(-1, Math.min(1, resampled[i] || 0));
      view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
    }

    const uint8 = new Uint8Array(buffer);
    let binary = "";
    const chunkStep = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkStep) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkStep));
    }
    const base64 = btoa(binary);
    const blob = new Blob([buffer], { type: "audio/wav" });
    return {
      blob,
      base64,
      durationSec: Math.round((outSamples / targetRate) * 100) / 100,
      resampled,
    };
  }

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }
    stopReading();
    samplePreviewAudioEl.pause();

    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Microphone recording is not available in this window. Use '📂 Import Voice File' instead.", { kind: "error" });
      return;
    }

    try {
      const constraints = {
        audio: selectedMicDeviceId
          ? { deviceId: { exact: selectedMicDeviceId }, echoCancellation: false, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      };
      recStream = await navigator.mediaDevices.getUserMedia(constraints);
      void refreshMicrophoneDevices();

      const Ctx = window.AudioContext || window.webkitAudioContext;
      recAudioCtx = new Ctx();
      recSampleRate = recAudioCtx.sampleRate || 48000;
      recSourceNode = recAudioCtx.createMediaStreamSource(recStream);
      recAnalyserNode = recAudioCtx.createAnalyser();
      recAnalyserNode.fftSize = 1024;
      recProcessorNode = recAudioCtx.createScriptProcessor(4096, 1, 1);
      recFloatChunks = [];

      recProcessorNode.onaudioprocess = (ev) => {
        if (!isRecordingVoice) return;
        const ch0 = ev.inputBuffer.getChannelData(0);
        recFloatChunks.push(new Float32Array(ch0));
      };

      recSourceNode.connect(recAnalyserNode);
      recAnalyserNode.connect(recProcessorNode);
      recProcessorNode.connect(recAudioCtx.destination);

      isRecordingVoice = true;
      recStartTimeMs = performance.now();
      recordVoiceBtn.textContent = "⏹ Stop Recording";
      recordVoiceBtn.classList.add("is-recording");
      recStateBadge.textContent = "🔴 Recording Live Microphone…";
      playRecordedSampleBtn.disabled = true;
      cloneVoiceBtn.disabled = true;

      const timeDomainBuf = new Float32Array(recAnalyserNode.fftSize);
      const drawLiveOscilloscope = () => {
        if (!isRecordingVoice || !recAnalyserNode) return;
        recAnalyserNode.getFloatTimeDomainData(timeDomainBuf);
        let sumSq = 0;
        for (let i = 0; i < timeDomainBuf.length; i++) {
          const s = timeDomainBuf[i];
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / timeDomainBuf.length);
        const db = rms > 0.0001 ? Math.max(-60, Math.min(0, Math.round(20 * Math.log10(rms)))) : -60;
        const pct = Math.max(2, Math.min(100, Math.round(((db + 60) / 60) * 100)));
        recDbMeterFill.style.width = `${pct}%`;
        recDbLabel.textContent = `${db} dB`;

        const ctx2d = waveformCanvas.getContext("2d");
        if (ctx2d) {
          const W = waveformCanvas.width;
          const H = waveformCanvas.height;
          ctx2d.fillStyle = "rgba(9, 14, 28, 0.92)";
          ctx2d.fillRect(0, 0, W, H);
          ctx2d.strokeStyle = "#fb7185";
          ctx2d.lineWidth = 2;
          ctx2d.beginPath();
          const sliceW = W / timeDomainBuf.length;
          for (let i = 0; i < timeDomainBuf.length; i++) {
            const x = i * sliceW;
            const y = (0.5 - timeDomainBuf[i] * 0.45) * H;
            if (i === 0) ctx2d.moveTo(x, y);
            else ctx2d.lineTo(x, y);
          }
          ctx2d.stroke();
        }
        recRafId = requestAnimationFrame(drawLiveOscilloscope);
      };
      recRafId = requestAnimationFrame(drawLiveOscilloscope);

      clearInterval(recTimerId);
      recTimerId = setInterval(() => {
        if (!isRecordingVoice) return;
        const elapsedSec = (performance.now() - recStartTimeMs) / 1000;
        recTimerLabel.textContent = `00:${elapsedSec < 10 ? "0" : ""}${elapsedSec.toFixed(1)} / 00:15.0`;
        if (elapsedSec >= 15.0) {
          stopVoiceRecording();
        }
      }, 100);
    } catch (err) {
      toast(`Could not access microphone: ${err?.message || "Permission denied"}. You can also click '📂 Import Voice File'.`, { kind: "error" });
    }
  }

  function cleanupRecordingAudioGraph() {
    cancelAnimationFrame(recRafId);
    recRafId = 0;
    clearInterval(recTimerId);
    recTimerId = 0;
    try { recProcessorNode?.disconnect(); } catch {}
    try { recAnalyserNode?.disconnect(); } catch {}
    try { recSourceNode?.disconnect(); } catch {}
    recProcessorNode = null;
    recAnalyserNode = null;
    recSourceNode = null;
    if (recStream) {
      for (const track of recStream.getTracks()) {
        try { track.stop(); } catch {}
      }
      recStream = null;
    }
    if (recAudioCtx) {
      void recAudioCtx.close().catch(() => {});
      recAudioCtx = null;
    }
  }

  function stopVoiceRecording() {
    if (!isRecordingVoice) return;
    isRecordingVoice = false;
    recordVoiceBtn.textContent = "🔴 Re-Record My Voice";
    recordVoiceBtn.classList.remove("is-recording");
    recDbMeterFill.style.width = "0%";

    const totalLen = recFloatChunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of recFloatChunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const capturedRate = recSampleRate;
    recFloatChunks = [];
    cleanupRecordingAudioGraph();

    if (merged.length < capturedRate * 1.2) {
      recStateBadge.textContent = "⚠ Recording too short (< 1.5s)";
      toast("Please record at least 2–10 seconds of speech so Phonon can capture your voice profile.", { kind: "info" });
      drawIdleOrStaticWaveform(null);
      return;
    }

    const encoded = encodeFloat32ToWav24k(merged, capturedRate);
    recordedWavBlob = encoded.blob;
    recordedWavBase64 = encoded.base64;
    recordedDurationSec = encoded.durationSec;
    recordedSamplesPreview = encoded.resampled;

    recStateBadge.textContent = `✔ Voice Sample Ready (${recordedDurationSec.toFixed(1)}s · 24 kHz WAV)`;
    recTimerLabel.textContent = `00:${recordedDurationSec < 10 ? "0" : ""}${recordedDurationSec.toFixed(1)} captured`;
    playRecordedSampleBtn.disabled = false;
    cloneVoiceBtn.disabled = false;
    drawIdleOrStaticWaveform(recordedSamplesPreview, false);
    toast(`Captured ${recordedDurationSec.toFixed(1)}s voice sample! Click '✨ Create My AI Voice' to clone and use your voice.`, { kind: "success" });
  }

  async function importVoiceAudioFileFromPicker(file) {
    stopVoiceRecording();
    samplePreviewAudioEl.pause();
    recStateBadge.textContent = `Decoding "${file.name}"…`;
    try {
      const arrayBuf = await file.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const decodeCtx = new Ctx();
      try {
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
        const numCh = audioBuffer.numberOfChannels || 1;
        const len = audioBuffer.length;
        const mono = new Float32Array(len);
        for (let ch = 0; ch < numCh; ch++) {
          const chData = audioBuffer.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            mono[i] += chData[i] / numCh;
          }
        }
        const encoded = encodeFloat32ToWav24k(mono, audioBuffer.sampleRate || 24000);
        recordedWavBlob = encoded.blob;
        recordedWavBase64 = encoded.base64;
        recordedDurationSec = encoded.durationSec;
        recordedSamplesPreview = encoded.resampled;
        const stem = stemOf(file.name);
        if (stem && (!customVoiceNameInput.value.trim() || customVoiceNameInput.value === "My Studio Voice")) {
          customVoiceNameInput.value = stem.slice(0, 32);
        }
        recStateBadge.textContent = `✔ Imported "${file.name}" (${recordedDurationSec.toFixed(1)}s · 24 kHz WAV)`;
        recTimerLabel.textContent = `00:${recordedDurationSec < 10 ? "0" : ""}${recordedDurationSec.toFixed(1)} imported`;
        playRecordedSampleBtn.disabled = false;
        cloneVoiceBtn.disabled = false;
        drawIdleOrStaticWaveform(recordedSamplesPreview, false);
        toast(`Loaded voice sample "${file.name}" (${recordedDurationSec.toFixed(1)}s). Click '✨ Create My AI Voice' to use it!`, { kind: "info" });
      } finally {
        void decodeCtx.close().catch(() => {});
      }
    } catch {
      toast("Could not decode that audio file in the browser. Please choose a .WAV, .MP3, .M4A, or .OGG file.", { kind: "error" });
      recStateBadge.textContent = "⚠ Could not decode audio file";
    }
  }

  function playCurrentRecordedSample() {
    stopReading();
    if (recordedWavBlob) {
      const url = URL.createObjectURL(recordedWavBlob);
      samplePreviewAudioEl.src = url;
      samplePreviewAudioEl.onended = () => URL.revokeObjectURL(url);
      void samplePreviewAudioEl.play().catch(() => {});
      return;
    }
    const activeCustom = customVoices.find((cv) => cv.id === selectedVoice) || customVoices[0];
    if (activeCustom?.sampleUrl) {
      samplePreviewAudioEl.src = audioUrlWithToken(activeCustom.sampleUrl);
      void samplePreviewAudioEl.play().catch(() => {});
    }
  }

  async function createMyAiVoiceNow() {
    if (isCloningVoice) return;
    if (!recordedWavBase64) {
      toast("Record your voice or import a voice audio file first.", { kind: "info" });
      return;
    }
    const voiceName = customVoiceNameInput.value.trim() || "My Studio Voice";
    isCloningVoice = true;
    cloneVoiceBtn.disabled = true;
    cloneVoiceBtn.textContent = "⏳ Cloning Your Real Voice with F5-TTS MLX…";
    recStateBadge.textContent = "🧬 Aligning Voice Sample (Whisper ASR) & Building Zero-Shot Neural Clone…";

    try {
      const res = await call("phonon/clone-voice", {
        name: voiceName,
        audioBase64: recordedWavBase64,
      });
      const created = res.voice;
      customVoices = res.voices || [];
      selectedVoice = created.id;
      chunkAudioCache.clear();
      await refreshStatus();
      selectedVoice = created.id;
      voiceSelect.value = created.id;
      updateVoiceDropdown();
      renderCustomVoicesList();
      renderActiveVoiceFingerprint();
      recStateBadge.textContent = `✨ AI Voice "${created.label}" Ready (${created.profile.medianF0Hz} Hz · ${created.profile.voiceRegister})`;
      toast(`Created your AI voice "${created.label}" (${created.profile.medianF0Hz} Hz ${created.profile.voiceRegister})! Click Read Out Loud to hear your voice.`, { kind: "success" });
      announce(`Created custom AI voice ${created.label}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not create custom AI voice.";
      recStateBadge.textContent = `⚠ ${msg}`;
      toast(msg, { kind: "error" });
    } finally {
      isCloningVoice = false;
      cloneVoiceBtn.disabled = !recordedWavBase64;
      cloneVoiceBtn.textContent = "✨ Create My AI Voice & Use for Reading";
    }
  }

  async function removeCustomVoiceById(voiceId, label) {
    try {
      stopReading();
      const res = await call("phonon/delete-voice", { id: voiceId });
      customVoices = res.voices || [];
      chunkAudioCache.clear();
      await refreshStatus();
      toast(`Removed custom voice "${label || voiceId}".`, { kind: "info" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not delete custom voice.", { kind: "error" });
    }
  }

  function renderActiveVoiceFingerprint() {
    clear(voiceFingerprintBox);
    const activeCustom = customVoices.find((cv) => cv.id === selectedVoice) || customVoices[0];
    if (!activeCustom || !activeCustom.profile) {
      voiceFingerprintBox.hidden = true;
      return;
    }
    voiceFingerprintBox.hidden = false;
    const p = activeCustom.profile;
    const blendBadges = (p.blendComponents || []).map((c) =>
      h("span", { class: "phonon-pill ok" }, `${c.voiceId}: ${Math.round(c.weight * 100)}% (${c.f0Hz} Hz)`),
    );

    voiceFingerprintBox.append(
      h("div", { class: "phonon-fingerprint-head" },
        h("strong", {}, `🧬 Acoustic Voice Biometric Profile — "${activeCustom.label}" (${activeCustom.id})`),
        h("span", { class: "phonon-pill ok" },
          activeCustom.cloningEngine === "f5-tts-mlx"
            ? "✔ Zero-Shot Neural Voice Clone (F5-TTS MLX · 24 kHz)"
            : activeCustom.ollamaRegistered
              ? "✔ Registered in Ollama Phonon ([1, 512, 125] F32 Safetensors)"
              : `✔ Calibrated Neural Profile (${activeCustom.baseVoiceId})`,
        ),
      ),
      h("div", { class: "phonon-fingerprint-grid" },
        h("div", { class: "phonon-fingerprint-stat" },
          h("span", { class: "phonon-fingerprint-label" }, "Fundamental Pitch (F0)"),
          h("strong", { class: "phonon-fingerprint-val" }, `${p.medianF0Hz} Hz (${p.f0MinHz}–${p.f0MaxHz} Hz)`),
          h("span", { class: "hint" }, `${p.voiceRegister} · ±${p.f0StdSemitones} st inflection`),
        ),
        h("div", { class: "phonon-fingerprint-stat" },
          h("span", { class: "phonon-fingerprint-label" }, "Spectral Timbre & Formants"),
          h("strong", { class: "phonon-fingerprint-val" }, `${p.spectralCentroidHz} Hz (${p.timbreLabel})`),
          h("span", { class: "hint" }, `Low ${Math.round((p.formantBands?.low || 0) * 100)}% · Mid ${Math.round(((p.formantBands?.midLow || 0) + (p.formantBands?.midHigh || 0)) * 100)}% · Air ${Math.round((p.formantBands?.air || 0) * 100)}%`),
        ),
        h("div", { class: "phonon-fingerprint-stat" },
          h("span", { class: "phonon-fingerprint-label" }, "Zero-Shot Voice Cloning Engine"),
          h("strong", { class: "phonon-fingerprint-val" }, activeCustom.cloningEngine === "f5-tts-mlx" ? "F5-TTS MLX (Direct Reference Audio)" : `${p.speakingRateSylPerSec} syl/sec · ${p.snrDb} dB SNR`),
          h("span", { class: "hint" }, activeCustom.refTranscript ? `Ref: "${activeCustom.refTranscript}"` : `Closed-Loop F0 Lock (${p.medianF0Hz} Hz) + 4-Band Formant Transfer`),
        ),
      ),
      h("div", { class: "phonon-fingerprint-blend-row" },
        h("span", { class: "hint" }, activeCustom.cloningEngine === "f5-tts-mlx" ? "Conditioned directly on your recorded 24 kHz voice waveform · Fallback Tensor:" : "AdaIN [1, 512, 125] Neural Latent Blend:"),
        ...blendBadges,
      ),
    );
  }

  function renderCustomVoicesList() {
    clear(customVoicesListBox);
    if (!customVoices.length) {
      customVoicesListBox.hidden = true;
      return;
    }
    customVoicesListBox.hidden = false;
    customVoicesListBox.append(
      h("div", { class: "phonon-custom-voices-head" },
        h("strong", {}, `🎙️ My Recorded AI Voices (${customVoices.length})`),
        h("span", { class: "hint" }, "Select any of your recorded voices below to read documents aloud or export audio & video in your own voice."),
      ),
    );

    const rowsWrap = h("div", { class: "phonon-custom-voices-rows" });
    for (const cv of customVoices) {
      const isSelected = cv.id === selectedVoice;
      rowsWrap.append(
        h("div", { class: `phonon-custom-voice-row${isSelected ? " is-active" : ""}` },
          h("div", { class: "phonon-custom-voice-info" },
            h("div", { class: "phonon-inline-row" },
              h("strong", {}, `🎙️ ${cv.label}`),
              h("code", { class: "phonon-cli-badge" }, `--voice ${cv.id}`),
              isSelected ? h("span", { class: "phonon-pill ok" }, "★ Active Voice") : null,
            ),
            h("span", { class: "hint" }, `${cv.profile?.medianF0Hz || 160} Hz ${cv.profile?.voiceRegister || ""} · ${cv.profile?.timbreLabel || ""} · ${cv.durationSec}s sample`),
          ),
          h("div", { class: "phonon-inline-row" },
            h("button", {
              type: "button",
              class: `btn phonon-sm-btn${isSelected ? " primary" : ""}`,
              onclick: () => {
                selectedVoice = cv.id;
                voiceSelect.value = cv.id;
                updateVoiceDropdown();
                renderStatusBanner();
                renderCustomVoicesList();
                renderActiveVoiceFingerprint();
                void saveAsDefaultVoice();
              },
            }, isSelected ? "✓ Using Voice" : "Use My Voice"),
            h("button", {
              type: "button",
              class: "btn phonon-sm-btn",
              title: "Listen to your original recorded microphone sample",
              onclick: () => {
                stopReading();
                samplePreviewAudioEl.src = audioUrlWithToken(cv.sampleUrl);
                void samplePreviewAudioEl.play().catch(() => {});
              },
            }, "🎧 My Recording"),
            h("button", {
              type: "button",
              class: "btn phonon-sm-btn",
              title: "Synthesize speech using your cloned AI voice",
              onclick: () => {
                selectedVoice = cv.id;
                voiceSelect.value = cv.id;
                updateVoiceDropdown();
                renderCustomVoicesList();
                renderActiveVoiceFingerprint();
                void previewSelectedVoice();
              },
            }, "🔊 Preview AI Voice"),
            h("button", {
              type: "button",
              class: "btn phonon-sm-btn",
              title: "Delete this custom voice",
              onclick: () => removeCustomVoiceById(cv.id, cv.label),
            }, "🗑"),
          ),
        ),
      );
    }
    customVoicesListBox.append(rowsWrap);
  }

  updateCalibrationScriptUI();
  drawIdleOrStaticWaveform(null);
  void refreshMicrophoneDevices();

  // Event listeners for controls
  voiceSelect.addEventListener("change", () => {
    selectedVoice = voiceSelect.value;
    const currentInfo = voices.find((v) => v.id === selectedVoice);
    voiceDescEl.textContent = currentInfo ? `${currentInfo.category}: ${currentInfo.desc}` : "";
    renderStatusBanner();
    renderChunkList();
    renderCustomVoicesList();
    renderActiveVoiceFingerprint();
  });

  formatSelect.addEventListener("change", () => {
    selectedFormat = formatSelect.value;
    const { all } = allFormatsList();
    const cur = all.find((f) => f.id === selectedFormat);
    formatHintEl.textContent = cur ? cur.desc : "";
    void saveSettings({ phononFormat: selectedFormat });
  });

  videoAspectSelect.addEventListener("change", () => {
    selectedAspectRatio = videoAspectSelect.value;
  });

  videoThemeSelect.addEventListener("change", () => {
    selectedVideoTheme = videoThemeSelect.value;
    updateTeleprompterClasses();
  });

  speedSlider.addEventListener("input", () => {
    speed = Number(speedSlider.value) || 1;
    rateOrPitchChangedAt = performance.now();
    speedValueLabel.textContent = `${speed.toFixed(2).replace(/\.00$/, ".0")}×`;
    applyAudioPlaybackSettings();
    syncTeleprompterHighlight();
  });
  speedSlider.addEventListener("change", () => {
    void saveSettings({ phononSpeed: speed });
  });

  pitchSlider.addEventListener("input", () => {
    pitch = Number(pitchSlider.value) || 0;
    rateOrPitchChangedAt = performance.now();
    pitchValueLabel.textContent = formatPitchLabel(pitch);
    applyAudioPlaybackSettings();
    syncTeleprompterHighlight();
  });
  pitchSlider.addEventListener("change", () => {
    void saveSettings({ phononPitch: pitch });
    renderChunkList();
    if (isPlaying && activeChunkIndex >= 0 && status?.ffmpegInstalled !== false) {
      const resumeSec = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
      void playFromChunk(activeChunkIndex, resumeSec);
    }
  });

  syncOffsetSlider.addEventListener("input", () => {
    syncOffsetMs = Math.round(Number(syncOffsetSlider.value) || 0);
    syncOffsetValueLabel.textContent = formatSyncOffsetLabel(syncOffsetMs);
    syncTeleprompterHighlight();
  });
  syncOffsetSlider.addEventListener("change", () => {
    void saveSettings({ phononSyncOffsetMs: syncOffsetMs });
  });

  pauseSlider.addEventListener("input", () => {
    pauseMs = Number(pauseSlider.value) || 0;
    pauseValueLabel.textContent = `${pauseMs} ms`;
  });
  pauseSlider.addEventListener("change", () => {
    void saveSettings({ phononPauseMs: pauseMs });
  });

  chunkLimitSelect.addEventListener("change", () => {
    maxChunkChars = Number(chunkLimitSelect.value) || 520;
    void recomputeChunksFromEditor();
  });

  textArea.addEventListener("input", () => {
    scheduleRechunk();
  });

  // Build Layout
  const voiceCard = h("section", { class: "phonon-card" },
    h("div", { class: "phonon-card-head" },
      h("h3", { class: "phonon-card-title" }, "1. Default Voice & Speech Engine Settings"),
      defaultVoiceBadge,
    ),
    h("div", { class: "phonon-grid-2" },
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-voice-select" }, "Ollama Phonon Voice (38 Neural Voices)"),
        h("div", { class: "phonon-inline-row" },
          voiceSelect,
          h("button", { type: "button", class: "btn", onclick: () => previewSelectedVoice() }, "🔊 Preview"),
          h("button", { type: "button", class: "btn primary", onclick: () => saveAsDefaultVoice() }, "⭐ Set Default Voice"),
        ),
        voiceDescEl,
      ),
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-chunk-limit" }, "Large-Text Context Window Chunking"),
        chunkLimitSelect,
        h("span", { class: "hint" }, "Automatically splits books and huge texts into safe segments inside Phonon's 8,192-token limit."),
      ),
    ),
    h("div", { class: "phonon-grid-4 phonon-sliders-row" },
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-speed-range" },
          h("span", {}, "Speaking Speed"),
          speedValueLabel,
        ),
        speedSlider,
      ),
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-pitch-range" },
          h("span", {}, "Voice Pitch (Time-Locked)"),
          pitchValueLabel,
        ),
        pitchSlider,
      ),
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-sync-offset-range" },
          h("span", {}, "Audio-Text Sync Offset"),
          syncOffsetValueLabel,
        ),
        syncOffsetSlider,
      ),
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-pause-range" },
          h("span", {}, "Paragraph Pause Gap"),
          pauseValueLabel,
        ),
        pauseSlider,
      ),
    ),
    // AI Voice Recorder & Voice Cloning Studio Box
    h("div", { class: "phonon-voice-recorder-box" },
      h("div", { class: "phonon-recorder-head" },
        h("div", { class: "phonon-inline-row" },
          h("strong", { class: "phonon-recorder-title" }, "🎙️ AI Voice Recorder — Record & Clone Your Own Voice for Reading"),
          h("span", { class: "hint" }, "Record 5–15 seconds of your voice (or import a WAV/MP3/M4A sample) to synthesize a custom [1, 512, 125] Phonon voice embedding."),
        ),
        recStateBadge,
      ),
      h("div", { class: "phonon-grid-3" },
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-custom-voice-name" }, "Your Custom AI Voice Name"),
          customVoiceNameInput,
        ),
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-mic-select" }, "Microphone Input"),
          h("div", { class: "phonon-inline-row" },
            micDeviceSelect,
            h("button", {
              type: "button",
              class: "btn phonon-sm-btn",
              title: "Refresh available microphones",
              onclick: () => refreshMicrophoneDevices(),
            }, "↻"),
          ),
        ),
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-calibration-script" }, "Calibration Reading Script"),
          calibrationScriptSelect,
        ),
      ),
      calibrationPromptBox,
      h("div", { class: "phonon-waveform-row" },
        waveformCanvas,
        h("div", { class: "phonon-meter-col" },
          recTimerLabel,
          h("div", { class: "phonon-db-meter-track" }, recDbMeterFill),
          recDbLabel,
        ),
      ),
      h("div", { class: "phonon-recorder-actions" },
        recordVoiceBtn,
        playRecordedSampleBtn,
        importVoiceFileBtn,
        hiddenVoiceFileInput,
        cloneVoiceBtn,
      ),
      voiceFingerprintBox,
      customVoicesListBox,
    ),
  );

  const makeToggle = (label, checked, onChange) => {
    const input = h("input", {
      type: "checkbox",
      checked,
      onchange: () => onChange(input.checked),
    });
    return h("label", { class: "phonon-check-pill" }, input, h("span", {}, label));
  };

  const converterCard = h("section", { class: "phonon-card" },
    h("div", { class: "phonon-card-head" },
      h("h3", { class: "phonon-card-title" }, "2. Convert Any Format to Plain Text & Edit"),
      h("div", { class: "phonon-head-badges" }, sourceFormatBadge, statsSummaryBadge),
    ),
    h("div", { class: "phonon-inline-row" },
      h("label", { class: "sr-only", for: "phonon-source-path" }, "Source file path to convert to plain text"),
      sourcePathInput,
      h("button", {
        type: "button",
        class: "btn",
        onclick: () => {
          const p = sourcePathInput.value.trim();
          if (p) void loadFileAndExtract(p);
          else loadSelectedFromFileManager();
        },
      }, "📄 Convert File to Plain Text"),
      h("button", {
        type: "button",
        class: "btn",
        title: "Load the currently selected file from the File Manager list and convert it to plain text",
        onclick: () => loadSelectedFromFileManager(),
      }, "📥 Use Selected File"),
      h("button", {
        type: "button",
        class: "btn",
        title: "Load a multi-chapter large text sample to test out-of-limit chunking and streaming",
        onclick: () => loadLargeTextStressSample(),
      }, "📚 Load Large Text Sample"),
    ),
    h("div", { class: "phonon-cleanup-bar" },
      h("span", { class: "phonon-cleanup-title" }, "Plain-Text Cleanup:"),
      makeToggle("Strip Markdown", stripMarkdown, (v) => { stripMarkdown = v; }),
      makeToggle("Strip HTML Tags", stripHtml, (v) => { stripHtml = v; }),
      makeToggle("Omit Code Blocks", stripCodeBlocks, (v) => { stripCodeBlocks = v; }),
      makeToggle("Simplify URLs", simplifyUrls, (v) => { simplifyUrls = v; }),
      makeToggle("Strip Subtitle Timestamps", stripTimestamps, (v) => { stripTimestamps = v; }),
      makeToggle("Unwrap Line Breaks", unwrapLines, (v) => { unwrapLines = v; }),
      h("button", { type: "button", class: "btn phonon-sm-btn", onclick: () => cleanEditorTextNow() }, "✨ Clean to Plain Text"),
      h("button", { type: "button", class: "btn phonon-sm-btn", onclick: () => saveConvertedPlainText() }, "💾 Save as .TXT"),
      h("button", {
        type: "button",
        class: "btn phonon-sm-btn",
        onclick: () => {
          stopReading();
          textArea.value = "";
          sourcePath = "";
          sourceFormatBadge.textContent = "Format: Direct Text";
          void recomputeChunksFromEditor();
        },
      }, "Clear"),
    ),
    h("label", { class: "sr-only", for: "phonon-text-editor" }, "Plain text content to read out loud or export as audio or video"),
    textArea,
  );

  const playerAndExportCard = h("section", { class: "phonon-card" },
    h("div", { class: "phonon-card-head" },
      h("h3", { class: "phonon-card-title" }, "3. Read Out Loud, Follow Along Word-by-Word & Convert to Audio or Video"),
      teleprompterWordBadge,
    ),
    h("div", { class: "phonon-player-bar" },
      h("div", { class: "phonon-transport-btns" },
        playBtn,
        pauseBtn,
        stopBtn,
        prevChunkBtn,
        nextChunkBtn,
      ),
      audioEl,
    ),
    nowPlayingStatus,
    // Interactive Follow-Along Teleprompter Box
    h("div", { class: "phonon-teleprompter-box" },
      h("div", { class: "phonon-teleprompter-toolbar" },
        h("div", { class: "phonon-inline-row" },
          h("strong", { class: "phonon-teleprompter-title" }, "📖 Live Follow-Along Teleprompter"),
          h("span", { class: "hint" }, "Words light up as they are spoken — click any word to jump!"),
        ),
        h("div", { class: "phonon-inline-row" },
          teleprompterSizeSelect,
          makeToggle("Auto-Scroll", teleprompterAutoScroll, (v) => { teleprompterAutoScroll = v; }),
        ),
      ),
      teleprompterStage,
      h("div", { class: "phonon-teleprompter-progress" }, teleprompterProgressFill),
    ),
    // Inline Read-Along Video Player Preview (revealed when a video is exported)
    videoPlayerBox,
    // Audio & Read-Along Video Export Box
    h("div", { class: "phonon-export-box" },
      h("div", { class: "phonon-grid-3" },
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-format-select" }, "Output Format (Audio or Read-Along Video)"),
          formatSelect,
          formatHintEl,
        ),
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-out-name" }, "Output Filename"),
          outNameInput,
        ),
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-out-dir" }, "Save in Folder"),
          h("div", { class: "phonon-inline-row" },
            outDirInput,
            h("button", {
              type: "button",
              class: "btn phonon-sm-btn",
              title: "Use the folder currently open in the File Manager",
              onclick: () => { outDirInput.value = currentPath() || state.home || ""; },
            }, "Current Folder"),
          ),
        ),
      ),
      h("div", { class: "phonon-grid-2 phonon-video-options-row" },
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-video-aspect" }, "🎬 Read-Along Video Aspect Ratio"),
          videoAspectSelect,
        ),
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-video-theme" }, "🎨 Read-Along Video & Teleprompter Theme"),
          h("div", { class: "phonon-inline-row" },
            videoThemeSelect,
            makeToggle("Save .SRT & .VTT Subtitles", saveCompanionSubtitles, (v) => { saveCompanionSubtitles = v; }),
          ),
        ),
      ),
      h("div", { class: "phonon-export-actions" },
        h("button", {
          type: "button",
          class: "btn primary phonon-save-audio-btn",
          onclick: () => {
            const fmt = VIDEO_EXT_SET.has(selectedFormat) ? "wav" : selectedFormat;
            void exportEditorTextWithFormat(fmt);
          },
        }, "💾 Save Audio File"),
        h("button", {
          type: "button",
          class: "btn primary phonon-save-video-btn",
          title: "Convert text to speech AND render a synchronized Read-Along Video (.MP4/.WebM/.MOV/.MKV) where every word lights up as you follow along",
          onclick: () => {
            const vidFmt = VIDEO_EXT_SET.has(selectedFormat) ? selectedFormat : "mp4";
            selectedFormat = vidFmt;
            formatSelect.value = vidFmt;
            void exportEditorTextWithFormat(vidFmt);
          },
        }, "🎬 Save Read-Along Video (.MP4)"),
        h("button", {
          type: "button",
          class: "btn",
          title: "Convert all selected files in the File Manager into audio files using your Phonon voice",
          onclick: () => batchConvertSelectedFiles(false),
        }, "📚 Batch Save Selected as Audio"),
        h("button", {
          type: "button",
          class: "btn",
          title: "Convert all selected files in the File Manager into synchronized Read-Along MP4 Videos",
          onclick: () => batchConvertSelectedFiles(true),
        }, "🎬 Batch Convert Selected to Video"),
        h("button", {
          type: "button",
          class: "btn",
          title: "Open the destination folder in the File Manager",
          onclick: () => {
            const dir = outDirInput.value.trim();
            if (dir) {
              emit("workspace-go", "files");
              void goTo(dir);
            }
          },
        }, "📂 Open Output Folder"),
      ),
    ),
    h("div", { class: "phonon-chunks-section" },
      h("div", { class: "phonon-chunks-header" },
        h("strong", {}, "Phonon Context-Safe Speech Queue (Click any segment to jump & follow along)"),
        chunkPagerContainer,
      ),
      chunkListContainer,
    ),
  );

  root.append(bannerBox, voiceCard, converterCard, playerAndExportCard);

  // Initialize data
  textArea.value = DEFAULT_SAMPLE_TEXT;
  void refreshStatus();
  void recomputeChunksFromEditor();

  // Handle payload (when opened from right-click menu or command palette with a file or text)
  function applyPayload(p) {
    if (!p || typeof p !== "object") return;
    if (typeof p.path === "string" && p.path.trim()) {
      void loadFileAndExtract(p.path.trim()).then(() => {
        if (p.autoPlay) void startOrResumeReading();
        if (p.autoExportVideo) {
          selectedFormat = "mp4";
          formatSelect.value = "mp4";
          void exportEditorTextWithFormat("mp4");
        }
      });
    } else if (Array.isArray(p.paths) && p.paths.length > 0) {
      void loadFileAndExtract(p.paths[0]).then(() => {
        if (p.autoPlay) void startOrResumeReading();
        if (p.autoExportVideo) {
          selectedFormat = "mp4";
          formatSelect.value = "mp4";
          void exportEditorTextWithFormat("mp4");
        }
      });
    } else if (typeof p.text === "string" && p.text.trim()) {
      textArea.value = p.text.trim();
      void recomputeChunksFromEditor().then(() => {
        if (p.autoPlay) void startOrResumeReading();
        if (p.autoExportVideo) {
          selectedFormat = "mp4";
          formatSelect.value = "mp4";
          void exportEditorTextWithFormat("mp4");
        }
      });
    } else {
      const sel = selectedEntries().filter((e) => !e.isDir && canReadWithPhonon(e));
      if (sel.length === 1 && textArea.value === DEFAULT_SAMPLE_TEXT) {
        void loadFileAndExtract(sel[0].path);
      }
    }
  }

  applyPayload(payload);

  const offFolder = on("location-changed", () => {
    if (!outDirInput.value.trim() && currentPath()) {
      outDirInput.value = currentPath();
    }
  });

  return {
    show(nextPayload) {
      void refreshStatus();
      applyPayload(nextPayload);
    },
    hide() {
      if (isPlaying && !isPaused) togglePauseReading();
      if (isRecordingVoice) stopVoiceRecording();
      samplePreviewAudioEl.pause();
    },
    onPayload(nextPayload) {
      applyPayload(nextPayload);
    },
    dispose() {
      stopReading();
      cleanupRecordingAudioGraph();
      samplePreviewAudioEl.pause();
      offFolder?.();
    },
  };
}

if (isPhononSupported()) {
  registerPowerTab({
    id: "phonon",
    label: "Voice Reader",
    icon: "🗣️",
    tip: "Read text and documents out loud with Ollama Phonon, follow along word-by-word, convert formats to plain text, and save as Audio or Read-Along Video.",
    group: "media",
    mount: mountPhononStudio,
  });
}
