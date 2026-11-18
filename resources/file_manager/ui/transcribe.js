// Audio-to-Text AI Studio: local multi-engine speech transcription, live microphone capture,
// interactive audio-synchronized segments, AI summaries/action items, and multi-format export.
import { ApiError, call, isPhononSupported, rawUrl } from "./api.js";
import { copyToClipboard } from "./copyclip.js";
import { confirmBox } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { currentPath, left, right } from "./pane.js";
import { openPower, registerPowerTab } from "./power.js";
import { selectedEntries } from "./selection.js";
import { emit, state } from "./state.js";
import { extensionOf } from "./util.js";

export const TRANSCRIBE_MEDIA_EXTS = new Set([
  "mp3",
  "wav",
  "m4a",
  "m4b",
  "aac",
  "flac",
  "ogg",
  "opus",
  "oga",
  "aiff",
  "aif",
  "wma",
  "webm",
  "amr",
  "caf",
  "mp4",
  "mov",
  "mkv",
  "avi",
  "m4v",
  "ts",
  "mts",
  "flv",
  "3gp",
]);

const VIDEO_EXTS = new Set([
  "mp4",
  "mov",
  "mkv",
  "avi",
  "m4v",
  "ts",
  "mts",
  "flv",
  "3gp",
  "webm",
]);

/** Extensions supported by the server's `/api/raw` MEDIA_MIME range streamer for browser `<audio>` playback. */
const PLAYABLE_MEDIA_EXTS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "flac",
  "ogg",
  "oga",
  "opus",
  "weba",
  "mp4",
  "m4v",
  "mov",
  "webm",
  "ogv",
]);

const ENGINES = [
  { id: "auto", label: "Auto (Recommended)" },
  {
    id: "python-whisper",
    label: "Python Whisper (faster-whisper / transformers)",
  },
  { id: "whisper-cli", label: "Whisper CLI / mlx_whisper" },
  {
    id: "openai-asr",
    label: "OpenAI-Compatible ASR (/v1/audio/transcriptions)",
  },
  { id: "ollama-omni", label: "Ollama Omni Audio LLM" },
  { id: "os-native", label: "OS Native Speech Recognition" },
  { id: "companion", label: "Companion Subtitles (.srt / .vtt / ffmpeg)" },
];

const MODELS = [
  { id: "openai/whisper-tiny", label: "openai/whisper-tiny (Fastest)" },
  { id: "openai/whisper-base", label: "openai/whisper-base (Balanced)" },
  { id: "openai/whisper-small", label: "openai/whisper-small (High Accuracy)" },
  {
    id: "openai/whisper-large-v3-turbo",
    label: "openai/whisper-large-v3-turbo (Best Quality)",
  },
];

const LANGUAGES = [
  { id: "auto", label: "Auto-detect" },
  { id: "en", label: "English (en)" },
  { id: "es", label: "Spanish (es)" },
  { id: "fr", label: "French (fr)" },
  { id: "de", label: "German (de)" },
  { id: "ja", label: "Japanese (ja)" },
  { id: "zh", label: "Chinese (zh)" },
  { id: "pt", label: "Portuguese (pt)" },
  { id: "it", label: "Italian (it)" },
  { id: "ko", label: "Korean (ko)" },
];

const FORMATS = [
  { id: "md", label: "Markdown (.md)" },
  { id: "txt", label: "Plain Text (.txt)" },
  { id: "srt", label: "SubRip Subtitles (.srt)" },
  { id: "vtt", label: "WebVTT Captions (.vtt)" },
  { id: "lrc", label: "Synced Lyrics (.lrc)" },
  { id: "json", label: "Structured JSON (.json)" },
];

const VALID_ENGINE_SET = new Set(ENGINES.map((e) => e.id));
const VALID_FORMAT_SET = new Set(FORMATS.map((f) => f.id));

/**
 * Extracts the file or folder base name across POSIX (`/`), Windows (`\`), UNC (`\\server\share\file`),
 * and mixed-separator paths regardless of `state.sep`.
 * @param {string | null | undefined} p
 */
export function mediaBaseName(p) {
  const s = String(p ?? "")
    .trim()
    .replace(/[\\/]+$/, "");
  if (!s) return "";
  const idx = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return idx >= 0 ? s.slice(idx + 1) : s;
}

/**
 * Normalizes a queue path key for deduplication across mixed separators (`/` vs `\`),
 * applying case-insensitive matching on Windows (`win32`) while preserving case on POSIX.
 * @param {string | null | undefined} p
 * @param {string} [platform]
 */
export function normalizeQueuePathKey(p, platform = state.platform) {
  let s = String(p ?? "").trim();
  if (!s) return "";
  const isUnc = s.startsWith("\\\\") || s.startsWith("//");
  s = s.replace(/[\\/]+/g, "/");
  if (isUnc && !s.startsWith("//")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return platform === "win32" ? s.toLowerCase() : s;
}

function isAbsoluteMediaPath(p) {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/**
 * Resolves a browser-playable `<audio>` URL for a media path, returning `""` for ephemeral
 * `microphone://` URIs, non-absolute paths, or containers not served by `/api/raw` (such as `.mkv`).
 * @param {string | null | undefined} p
 */
export function audioUrlFor(p) {
  const raw = typeof p === "string" ? p.trim() : "";
  if (!raw || raw.startsWith("microphone://")) return "";
  if (raw.startsWith("blob:")) return raw;
  if (!isAbsoluteMediaPath(raw)) return "";
  const ext = extensionOf(mediaBaseName(raw));
  if (!PLAYABLE_MEDIA_EXTS.has(ext)) return "";
  return rawUrl(raw);
}

/**
 * Returns true if the entry (or path string) is an audio or video file supported by Audio-to-Text AI Studio.
 * @param {{ name?: string, path?: string, kind?: string, isDir?: boolean } | string | null | undefined} entry
 */
export function canTranscribeWithAi(entry) {
  if (!entry) return false;
  if (typeof entry === "string") {
    return TRANSCRIBE_MEDIA_EXTS.has(extensionOf(mediaBaseName(entry)));
  }
  if (entry.isDir) return false;
  if (entry.kind === "audio" || entry.kind === "video") return true;
  const nameOrPath = entry.name || entry.path || "";
  return TRANSCRIBE_MEDIA_EXTS.has(extensionOf(mediaBaseName(nameOrPath)));
}

function formatClockTenths(sec) {
  const clamped = Math.max(0, Number(sec) || 0);
  const totalTenths = Math.round(clamped * 10);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const secs = totalSec % 60;
  const mins = Math.floor(totalSec / 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

/**
 * Formats a timestamp in seconds as `[MM:SS.s]` for interactive segment chips.
 * @param {number} sec
 */
export function formatSegmentStamp(sec) {
  return `[${formatClockTenths(sec)}]`;
}

function formatDurationClock(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function stemOf(name) {
  const base = mediaBaseName(name) || "transcript";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function isDemoMode() {
  return (
    typeof window !== "undefined" &&
    typeof window.location?.search === "string" &&
    window.location.search.includes("demo=1")
  );
}

/** Builds a clean synthetic session for `demo=1` screenshot verification with zero real paths or hostnames. */
export function buildDemoTranscribeSession() {
  const segments = [
    {
      start: 0.0,
      end: 4.8,
      text: "First, keep the Audio-to-Text AI Studio cohesive across macOS, Linux, and Windows themes using semantic CSS tokens.",
    },
    {
      start: 4.8,
      end: 9.9,
      text: "Second, decouple the six-tier Whisper inference pipeline from the toolbar, sidebar, and context menu wiring.",
    },
    {
      start: 9.9,
      end: 15.2,
      text: "Third, synchronize every timestamped segment chip directly with the HTML5 audio player for instant click-to-seek review.",
    },
    {
      start: 15.2,
      end: 19.8,
      text: "Fourth, let users switch seamlessly between Markdown, plain text, SRT, VTT, LRC, and structured JSON.",
    },
    {
      start: 19.8,
      end: 24.6,
      text: "Finally, stream live microphone captures straight into local transcription without leaking private paths or telemetry.",
    },
  ];
  const summary =
    "Architecture review covering cross-platform semantic UI design, modular six-tier local Whisper ASR integration, interactive audio-synchronized segment seeking, and multi-format transcript export.";
  const actionItems = [
    "Verify semantic CSS token contrast across light, dark, and custom palettes",
    "Bind segment click-to-seek and timeupdate active highlighting to the audio player",
    "Test instant re-formatting across Markdown, TXT, SRT, VTT, LRC, and JSON outputs",
  ];
  const chapters = [
    { start: 0.0, title: "Cross-Platform Semantic UI" },
    { start: 9.9, title: "Interactive Audio Sync" },
    { start: 19.8, title: "Local Mic & Privacy" },
  ];
  const text = segments.map((s) => s.text).join(" ");
  const formatted = [
    "# Transcript: studio-architecture-note.m4a",
    "",
    "- **Engine:** Whisper Neural ASR (`whisper-base`)",
    "- **Language:** `en` · **Duration:** `0:24`",
    "",
    "## AI Executive Summary",
    summary,
    "",
    "## Action Items",
    ...actionItems.map((item) => `- [ ] ${item}`),
    "",
    "## Timestamped Segments",
    ...segments.map((s) => `- ${formatSegmentStamp(s.start)} ${s.text}`),
  ].join("\n");

  return {
    status: {
      ready: true,
      recommendedEngine: "python-whisper",
      recommendedLabel: "Whisper Neural ASR · whisper-base",
      ffmpegAvailable: true,
      ffmpegPath: "",
      ollamaAvailable: true,
      asrEnvInstalled: true,
    },
    result: {
      sourcePath: "studio-architecture-note.m4a",
      fileName: "studio-architecture-note.m4a",
      engine: "Whisper Neural ASR",
      model: "whisper-base",
      language: "en",
      durationSec: 24.6,
      elapsedMs: 1420,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      text,
      segments,
      formatted,
      format: "md",
      summary,
      actionItems,
      chapters,
      savedPath: null,
      isDemo: true,
    },
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function currentFolderPath() {
  return (
    (state.location?.kind === "folder" && state.location.path) ||
    currentPath() ||
    state.home ||
    ""
  );
}

function findSelectedMediaPaths() {
  const isCandidate = (e) => Boolean(e && !e.isDir && canTranscribeWithAi(e));
  const activeSel = selectedEntries().filter(isCandidate);
  if (activeSel.length > 0) return activeSel.map((e) => e.path);
  for (const p of [left, right]) {
    if (!p) continue;
    const pSel = selectedEntries(p).filter(isCandidate);
    if (pSel.length > 0) return pSel.map((e) => e.path);
  }
  for (const p of [left, right]) {
    if (!p?.focusKey || !Array.isArray(p.entries)) continue;
    const focused = p.entries.find((e) => e.path === p.focusKey);
    if (focused && isCandidate(focused)) return [focused.path];
  }
  return [];
}

function buildFormatSource(r) {
  return {
    fileName: r.fileName || mediaBaseName(r.sourcePath) || "transcript",
    engine: r.engine || "auto",
    model: r.model || "openai/whisper-base",
    language: r.language || "auto",
    durationSec: Number(r.durationSec) || 0,
    text: r.text || "",
    segments: Array.isArray(r.segments) ? r.segments : [],
    summary: r.summary ?? null,
    actionItems: Array.isArray(r.actionItems) ? r.actionItems : [],
    chapters: Array.isArray(r.chapters) ? r.chapters : [],
  };
}

function chooseMicMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  for (const mime of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function extensionForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  return "webm";
}

function mountTranscribeStudio(root) {
  root.classList.add("transcribe-root");

  let statusData = null;
  let statusPromise = null;
  let queue = [];
  let selectedEngine = "auto";
  let selectedModel = "openai/whisper-base";
  let selectedLanguage = "auto";
  let selectedFormat = "md";
  let enhanceAudio = false;
  let summarize = true;
  let saveSidecar = false;
  let results = [];
  let activeResultIndex = 0;
  let activeSegmentIndex = -1;
  let segmentButtons = [];
  let busy = false;
  let installing = false;
  let formatSeq = 0;
  const blobUrls = new Set();

  function revokeBlobUrls() {
    for (const u of blobUrls) {
      try {
        URL?.revokeObjectURL?.(u);
      } catch {}
    }
    blobUrls.clear();
  }

  // Live microphone state
  let recording = false;
  let recStream = null;
  let recRecorder = null;
  let recChunks = [];
  let recAudioCtx = null;
  let recAnalyser = null;
  let recSource = null;
  let recRafId = 0;
  let recTimerId = 0;
  let recStartMs = 0;
  let recMimeType = "";

  // ---------------------------------------------------------------------------
  // Header: Engine Readiness
  // ---------------------------------------------------------------------------
  const enginePill = h(
    "span",
    { id: "transcribe-engine-pill", class: "transcribe-pill muted" },
    "⏳ Checking ASR engines…",
  );
  const ffmpegPill = h(
    "span",
    { id: "transcribe-ffmpeg-pill", class: "transcribe-pill muted" },
    "⏳ Checking FFmpeg…",
  );
  const ollamaPill = h(
    "span",
    { id: "transcribe-ollama-pill", class: "transcribe-pill muted" },
    "⏳ Checking Ollama…",
  );
  const refreshStatusBtn = h(
    "button",
    {
      id: "transcribe-refresh-btn",
      type: "button",
      class: "pw-btn",
      title:
        "Re-scan local Whisper, FFmpeg, and Ollama speech-to-text capabilities",
      onclick: () => void refreshStatus(true),
    },
    "↻ Refresh",
  );
  const installBtn = h(
    "button",
    {
      id: "transcribe-install-btn",
      type: "button",
      class: "pw-btn primary",
      title:
        "Install local Python Whisper ASR environment (~/.bun_rad_studio/asr-env) in one click",
      onclick: () => void handleOneClickInstall(),
    },
    "⚡ 1-Click Install Local Whisper AI",
  );
  const bannerCard = h(
    "section",
    {
      class: "transcribe-banner-card",
      "aria-label": "Speech recognition engine readiness",
    },
    h(
      "div",
      { class: "transcribe-banner-main" },
      h(
        "div",
        { class: "transcribe-banner-title-row" },
        h(
          "h2",
          { class: "transcribe-banner-title" },
          "🎙️ Audio to Text AI Studio",
        ),
        h(
          "span",
          { class: "transcribe-banner-sub" },
          "Local Whisper ASR, live microphone dictation, synced playback & subtitle export",
        ),
      ),
      h(
        "div",
        { class: "transcribe-status-pills" },
        enginePill,
        ffmpegPill,
        ollamaPill,
      ),
    ),
    h(
      "div",
      { class: "transcribe-banner-actions" },
      refreshStatusBtn,
      installBtn,
    ),
  );

  // ---------------------------------------------------------------------------
  // Section 2: Target Media Queue & Live Microphone
  // ---------------------------------------------------------------------------
  const queueBadge = h(
    "span",
    { id: "transcribe-queue-badge", class: "transcribe-pill muted" },
    "0 files queued",
  );
  const useSelectedBtn = h(
    "button",
    {
      id: "transcribe-use-selected-btn",
      type: "button",
      class: "pw-btn",
      title:
        "Add the currently selected audio or video files from the File Manager list",
      onclick: () => addSelectedFromFileManager(),
    },
    "📥 Use Selected Files",
  );
  const pathInput = h("input", {
    id: "transcribe-path-input",
    type: "text",
    class: "transcribe-input",
    placeholder:
      "Enter audio or video file path (e.g. /path/to/recording.m4a)…",
    "aria-label": "Audio or video file path",
    onkeydown: (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        addTypedPath();
      }
    },
  });
  const addPathBtn = h(
    "button",
    {
      id: "transcribe-add-path-btn",
      type: "button",
      class: "pw-btn",
      title: "Add the typed file path to the transcription queue",
      onclick: () => addTypedPath(),
    },
    "➕ Add",
  );
  const clearQueueBtn = h(
    "button",
    {
      id: "transcribe-clear-queue-btn",
      type: "button",
      class: "pw-btn",
      title: "Clear all files from the transcription queue",
      onclick: () => {
        queue = [];
        renderQueue();
      },
    },
    "✕ Clear",
  );
  const queueChipsEl = h("div", {
    id: "transcribe-queue-chips",
    class: "transcribe-queue-chips",
    role: "list",
    "aria-label": "Queued audio and video files",
  });

  const micBtn = h(
    "button",
    {
      id: "transcribe-mic-btn",
      type: "button",
      class: "pw-btn transcribe-mic-btn",
      title: "Record live microphone audio and transcribe it immediately",
      onclick: () => void toggleMicRecording(),
    },
    "🎙️ Record Microphone",
  );
  const micTimerEl = h(
    "span",
    { id: "transcribe-mic-timer", class: "transcribe-mic-timer" },
    "00:00.0",
  );
  const micCanvas = h("canvas", {
    id: "transcribe-mic-canvas",
    class: "transcribe-mic-canvas",
    width: "220",
    height: "32",
    "aria-label": "Live microphone level meter",
  });
  const micStatusEl = h(
    "span",
    { id: "transcribe-mic-status", class: "transcribe-mic-status" },
    "Ready for live microphone capture",
  );

  const queueCard = h(
    "section",
    { class: "transcribe-card", "aria-label": "Target media queue" },
    h(
      "div",
      { class: "transcribe-card-head" },
      h(
        "h3",
        { class: "transcribe-card-title" },
        "🎯 Target Media Queue & Microphone",
      ),
      queueBadge,
    ),
    h(
      "div",
      { class: "transcribe-queue-bar" },
      useSelectedBtn,
      pathInput,
      addPathBtn,
      clearQueueBtn,
    ),
    queueChipsEl,
    h(
      "div",
      { class: "transcribe-mic-bar" },
      micBtn,
      micTimerEl,
      micCanvas,
      micStatusEl,
    ),
  );

  // ---------------------------------------------------------------------------
  // Section 3: Configuration Bar
  // ---------------------------------------------------------------------------
  function buildSelect(id, label, options, currentVal, onChange) {
    const sel = h(
      "select",
      {
        id,
        class: "transcribe-select",
        "aria-label": label,
        onchange: (e) => onChange(e.target.value),
      },
      options.map((opt) =>
        h(
          "option",
          { value: opt.id, selected: opt.id === currentVal },
          opt.label,
        ),
      ),
    );
    sel.value = currentVal;
    return {
      select: sel,
      field: h(
        "label",
        { class: "transcribe-field", for: id },
        h("span", { class: "transcribe-label" }, label),
        sel,
      ),
    };
  }

  const engineCtl = buildSelect(
    "transcribe-engine",
    "ASR Engine",
    ENGINES,
    selectedEngine,
    (v) => {
      selectedEngine = v;
    },
  );
  const modelCtl = buildSelect(
    "transcribe-model",
    "Whisper Model",
    MODELS,
    selectedModel,
    (v) => {
      selectedModel = v;
    },
  );
  const langCtl = buildSelect(
    "transcribe-language",
    "Language",
    LANGUAGES,
    selectedLanguage,
    (v) => {
      selectedLanguage = v;
    },
  );
  const formatCtl = buildSelect(
    "transcribe-format",
    "Output Format",
    FORMATS,
    selectedFormat,
    (v) => {
      selectedFormat = v;
      void handleFormatChange(v);
    },
  );

  function buildCheck(id, labelText, titleText, initial, onToggle) {
    const inp = h("input", {
      id,
      type: "checkbox",
      title: titleText,
      checked: initial ? true : null,
      onchange: (e) => onToggle(Boolean(e.target.checked)),
    });
    return {
      input: inp,
      el: h(
        "label",
        { class: "transcribe-check-pill", for: id, title: titleText },
        inp,
        labelText,
      ),
    };
  }

  const enhanceChk = buildCheck(
    "transcribe-enhance",
    "Enhance Speech Audio",
    "Apply speech-bandpass and loudness normalization via FFmpeg before transcribing",
    enhanceAudio,
    (v) => {
      enhanceAudio = v;
    },
  );
  const summarizeChk = buildCheck(
    "transcribe-summarize",
    "AI Summary & Action Items",
    "Generate an AI executive summary, action items, and chapters using local Ollama when available",
    summarize,
    (v) => {
      summarize = v;
    },
  );
  const saveSidecarChk = buildCheck(
    "transcribe-save-sidecar",
    "Save Next to Source File",
    "Automatically write the formatted transcript file alongside each source media file",
    saveSidecar,
    (v) => {
      saveSidecar = v;
    },
  );

  const runBtn = h(
    "button",
    {
      id: "transcribe-run-btn",
      type: "button",
      class: "pw-btn primary",
      title:
        "Transcribe all queued audio/video files using the selected configuration",
      onclick: () => void runTranscription(),
    },
    "✨ Transcribe Audio",
  );
  const statusLine = h(
    "p",
    {
      id: "transcribe-status-line",
      class: "transcribe-status-line",
      role: "status",
      "aria-live": "polite",
    },
    "Queue audio or video files, or record from your microphone to begin.",
  );

  const configCard = h(
    "section",
    { class: "transcribe-card", "aria-label": "Transcription configuration" },
    h(
      "div",
      { class: "transcribe-config-grid" },
      engineCtl.field,
      modelCtl.field,
      langCtl.field,
      formatCtl.field,
    ),
    h(
      "div",
      { class: "transcribe-checks-row" },
      enhanceChk.el,
      summarizeChk.el,
      saveSidecarChk.el,
    ),
    h("div", { class: "transcribe-run-row" }, runBtn, statusLine),
  );

  // ---------------------------------------------------------------------------
  // Section 4: Results Workspace
  // ---------------------------------------------------------------------------
  const resultsTabsEl = h("div", {
    id: "transcribe-result-tabs",
    class: "transcribe-result-tabs",
    "aria-label": "Transcribed files",
    hidden: true,
    onkeydown: (e) => {
      if (results.length <= 1) return;
      let nextIdx = -1;
      if (e.key === "ArrowRight") {
        nextIdx = (activeResultIndex + 1) % results.length;
      } else if (e.key === "ArrowLeft") {
        nextIdx = (activeResultIndex - 1 + results.length) % results.length;
      } else if (e.key === "Home") {
        nextIdx = 0;
      } else if (e.key === "End") {
        nextIdx = results.length - 1;
      }
      if (nextIdx >= 0) {
        e.preventDefault();
        selectResultTab(nextIdx, { focusTab: true });
      }
    },
  });
  const resultMetaEl = h("div", { class: "transcribe-status-pills" });
  const audioEl = h("audio", {
    id: "transcribe-audio-player",
    class: "transcribe-audio-player",
    controls: true,
    preload: "metadata",
  });
  const playerTrackLabel = h(
    "span",
    { class: "transcribe-pill accent" },
    "🎧 Synchronized Playback",
  );
  const playerNoteEl = h("span", {
    id: "transcribe-player-note",
    class: "transcribe-player-note",
    hidden: true,
  });
  const segmentsListEl = h("div", {
    id: "transcribe-segments",
    class: "transcribe-segments-list",
    role: "list",
    "aria-label": "Interactive timestamped transcript segments",
  });
  const insightsGridEl = h("div", {
    id: "transcribe-insights",
    class: "transcribe-insights-grid",
    hidden: true,
  });
  const formatBadgeEl = h(
    "span",
    { id: "transcribe-format-badge", class: "transcribe-pill accent" },
    ".MD",
  );
  const previewTextarea = h("textarea", {
    id: "transcribe-preview",
    class: "transcribe-preview-textarea",
    rows: "10",
    "aria-label": "Formatted transcript output",
    oninput: () => {
      const r = results[activeResultIndex];
      if (r) r.formatted = previewTextarea.value;
    },
  });

  const copyBtn = h(
    "button",
    {
      id: "transcribe-copy-btn",
      type: "button",
      class: "pw-btn",
      title: "Copy the formatted transcript to your clipboard",
      onclick: () => void handleCopyTranscript(),
    },
    "📋 Copy",
  );
  const saveBtn = h(
    "button",
    {
      id: "transcribe-save-btn",
      type: "button",
      class: "pw-btn primary",
      title: "Save the formatted transcript into the currently open folder",
      onclick: () => void handleSaveToCurrentFolder(),
    },
    "💾 Save to Current Folder",
  );
  const openCodeBtn = h(
    "button",
    {
      id: "transcribe-open-code-btn",
      type: "button",
      class: "pw-btn",
      disabled: true,
      title: "Open the saved transcript file in the built-in Code Editor",
      onclick: () => handleOpenSavedInCode(),
    },
    "📝 Open Saved File in Code Editor",
  );
  const sendPhononBtn = h(
    "button",
    {
      id: "transcribe-send-phonon-btn",
      type: "button",
      class: "pw-btn",
      hidden: !isPhononSupported(),
      title: "Send this transcript to Ollama Voice Reader (Phonon TTS)",
      onclick: () => handleSendToVoiceReader(),
    },
    "🗣️ Send to Voice Reader",
  );

  const resultsEmptyEl = h(
    "div",
    { id: "transcribe-results-empty", class: "transcribe-empty-results" },
    "Transcribed audio segments, synchronized playback, AI summaries, and exportable subtitles (.md, .txt, .srt, .vtt, .lrc, .json) will appear here.",
  );

  const resultPanelEl = h(
    "div",
    {
      id: "transcribe-result-panel",
      class: "transcribe-result-panel",
    },
    h(
      "div",
      { class: "transcribe-card-head" },
      h(
        "h3",
        { class: "transcribe-card-title" },
        "📄 Transcript & Synchronized Review",
      ),
      resultMetaEl,
    ),
    h(
      "div",
      { class: "transcribe-player-wrap" },
      playerTrackLabel,
      audioEl,
      playerNoteEl,
    ),
    h(
      "div",
      { class: "transcribe-segments-section" },
      h(
        "span",
        { class: "transcribe-label" },
        "Interactive Timestamped Segments (click any timestamp to seek & play)",
      ),
      segmentsListEl,
    ),
    insightsGridEl,
    h(
      "div",
      { class: "transcribe-preview-wrap" },
      h(
        "div",
        { class: "transcribe-card-head" },
        h(
          "label",
          { class: "transcribe-label", for: "transcribe-preview" },
          "Formatted Output (editable)",
        ),
        formatBadgeEl,
      ),
      previewTextarea,
    ),
    h(
      "div",
      { class: "transcribe-actions-row" },
      copyBtn,
      saveBtn,
      openCodeBtn,
      sendPhononBtn,
    ),
  );

  const resultsBodyEl = h(
    "div",
    {
      id: "transcribe-results-body",
      class: "transcribe-results-body",
      hidden: true,
    },
    resultsTabsEl,
    resultPanelEl,
  );

  const resultsCard = h(
    "section",
    {
      class: "transcribe-card transcribe-results-card",
      "aria-label": "Transcription results",
    },
    resultsEmptyEl,
    resultsBodyEl,
  );

  root.append(bannerCard, queueCard, configCard, resultsCard);

  // ---------------------------------------------------------------------------
  // Rendering & State Synchronization
  // ---------------------------------------------------------------------------

  function setStatusText(text, isError = false) {
    statusLine.textContent = text;
    statusLine.classList.toggle("is-error", Boolean(isError));
  }

  function renderStatusHeader() {
    const s = statusData;
    if (!s) return;
    const demo = isDemoMode();
    bannerCard.classList.toggle("is-ready", Boolean(s.ready));
    bannerCard.classList.toggle("needs-setup", !s.ready);

    enginePill.className = `transcribe-pill ${s.ready ? "ok" : "warn"}`;
    enginePill.textContent = s.ready
      ? `✓ Engine Ready: ${s.recommendedLabel || s.recommendedEngine || "Local ASR"}`
      : `⚠ Setup Needed: ${s.recommendedLabel || "Install Local Whisper AI"}`;

    ffmpegPill.className = `transcribe-pill ${s.ffmpegAvailable ? "ok" : "warn"}`;
    ffmpegPill.textContent = s.ffmpegAvailable
      ? "✓ FFmpeg Ready"
      : "⚠ FFmpeg Missing";
    ffmpegPill.title =
      !demo && s.ffmpegPath
        ? `FFmpeg: ${s.ffmpegPath}`
        : "Media preprocessing status";

    ollamaPill.className = `transcribe-pill ${s.ollamaAvailable ? "ok" : "muted"}`;
    ollamaPill.textContent = s.ollamaAvailable
      ? "✓ Ollama AI Summary"
      : "○ Ollama Offline";

    if (Array.isArray(s.models) && s.models.length > 0) {
      const byId = new Map(MODELS.map((m) => [m.id, { ...m }]));
      for (const item of s.models) {
        if (typeof item === "string") {
          const id = item.trim();
          if (id && !byId.has(id)) {
            byId.set(id, { id, label: id });
          }
        } else if (item && typeof item === "object") {
          const id = typeof item.id === "string" ? item.id.trim() : "";
          if (!id) continue;
          const label =
            typeof item.label === "string" && item.label.trim()
              ? item.label.trim()
              : id;
          const prev = byId.get(id);
          if (!prev || label !== id) {
            byId.set(id, { id, label });
          }
        }
      }
      const merged = [...byId.values()];
      const currentSelection = selectedModel || modelCtl.select.value;
      if (merged.some((opt) => opt.id === currentSelection)) {
        selectedModel = currentSelection;
      } else {
        selectedModel =
          merged.find((opt) => opt.id === "openai/whisper-base")?.id ||
          merged[0]?.id ||
          "";
      }
      clear(modelCtl.select);
      for (const opt of merged) {
        modelCtl.select.append(
          h(
            "option",
            { value: opt.id, selected: opt.id === selectedModel },
            opt.label,
          ),
        );
      }
      modelCtl.select.value = selectedModel;
    }

    if (Array.isArray(s.languages) && s.languages.length > 0) {
      const langById = new Map(LANGUAGES.map((l) => [l.id, { ...l }]));
      for (const item of s.languages) {
        if (typeof item === "string") {
          const id = item.trim();
          if (id && !langById.has(id)) {
            langById.set(id, { id, label: id });
          }
        } else if (item && typeof item === "object") {
          const rawId = item.id ?? item.code;
          const id = typeof rawId === "string" ? rawId.trim() : "";
          if (!id) continue;
          const label =
            typeof item.label === "string" && item.label.trim()
              ? item.label.trim()
              : id;
          if (!langById.has(id)) {
            langById.set(id, { id, label });
          }
        }
      }
      const mergedLangs = [...langById.values()];
      const curLang = selectedLanguage || langCtl.select.value;
      if (!mergedLangs.some((opt) => opt.id === curLang)) {
        selectedLanguage = mergedLangs[0]?.id || "auto";
      } else {
        selectedLanguage = curLang;
      }
      clear(langCtl.select);
      for (const opt of mergedLangs) {
        langCtl.select.append(
          h(
            "option",
            { value: opt.id, selected: opt.id === selectedLanguage },
            opt.label,
          ),
        );
      }
      langCtl.select.value = selectedLanguage;
    }
  }

  function addPathsToQueue(paths, { replace = false } = {}) {
    const cleaned = (Array.isArray(paths) ? paths : [paths])
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    const nextQueue = replace ? [] : [...queue];
    const seen = new Set(nextQueue.map((p) => normalizeQueuePathKey(p)));
    for (const p of cleaned) {
      const key = normalizeQueuePathKey(p);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      nextQueue.push(p);
    }
    queue = nextQueue;
    renderQueue();
  }

  function addTypedPath() {
    const val = pathInput.value.trim();
    if (!val) return;
    addPathsToQueue([val]);
    pathInput.value = "";
    pathInput.focus();
  }

  function addSelectedFromFileManager() {
    const paths = findSelectedMediaPaths();
    if (!paths.length) {
      toast(
        "Select one or more audio or video files in the File Manager list first.",
        {
          kind: "info",
        },
      );
      return;
    }
    addPathsToQueue(paths);
    toast(
      `Queued ${paths.length} media file${paths.length === 1 ? "" : "s"}.`,
      {
        kind: "success",
      },
    );
  }

  function renderQueue() {
    clear(queueChipsEl);
    queueBadge.textContent = `${queue.length} file${queue.length === 1 ? "" : "s"} queued`;
    clearQueueBtn.hidden = queue.length === 0;
    if (queue.length === 0) {
      queueChipsEl.append(
        h(
          "span",
          { class: "transcribe-queue-empty" },
          "No files queued yet. Click '📥 Use Selected Files', add a path above, or record with your microphone.",
        ),
      );
      return;
    }
    queue.forEach((p, idx) => {
      const name = mediaBaseName(p) || p;
      const isVid = VIDEO_EXTS.has(extensionOf(name));
      queueChipsEl.append(
        h(
          "span",
          {
            class: "transcribe-file-chip",
            role: "listitem",
            title: isDemoMode() ? name : p,
          },
          h("span", { "aria-hidden": "true" }, isVid ? "🎬" : "🎵"),
          h("span", { class: "transcribe-chip-name" }, name),
          h(
            "button",
            {
              type: "button",
              class: "transcribe-chip-remove",
              "aria-label": `Remove ${name}`,
              title: `Remove ${name} from queue`,
              onclick: () => {
                queue.splice(idx, 1);
                renderQueue();
              },
            },
            "✕",
          ),
        ),
      );
    });
  }

  function setActiveSegment(idx, { scroll = false } = {}) {
    activeSegmentIndex = idx;
    segmentButtons.forEach((btn, i) => {
      const active = i === idx;
      btn.classList.toggle("is-active", active);
      if (active) {
        btn.setAttribute("aria-current", "true");
        if (scroll) btn.scrollIntoView?.({ block: "nearest" });
      } else {
        btn.removeAttribute("aria-current");
      }
    });
  }

  function seekToSegment(idx, seg) {
    const targetSec = Math.max(0, Number(seg?.start) || 0);
    try {
      audioEl.currentTime = targetSec;
    } catch {}
    if (idx >= 0) setActiveSegment(idx);
    try {
      const p = audioEl.play?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function syncActiveSegmentToAudioTime() {
    const r = results[activeResultIndex];
    const segs = Array.isArray(r?.segments) ? r.segments : [];
    if (!segs.length) return;
    const t = Math.max(0, Number(audioEl.currentTime) || 0);
    let found = -1;
    for (let i = 0; i < segs.length; i++) {
      const start = Number(segs[i].start) || 0;
      const end = Number(segs[i].end) || start;
      if (
        t >= start &&
        (t < end || (i === segs.length - 1 && t <= end + 0.25))
      ) {
        found = i;
        break;
      }
    }
    if (found !== activeSegmentIndex) {
      setActiveSegment(found, { scroll: !audioEl.paused });
    }
  }

  audioEl.addEventListener("timeupdate", syncActiveSegmentToAudioTime);
  audioEl.addEventListener("seeked", syncActiveSegmentToAudioTime);

  function selectResultTab(idx, { focusTab = false } = {}) {
    if (idx < 0 || idx >= results.length || idx === activeResultIndex) return;
    try {
      audioEl.pause?.();
      audioEl.currentTime = 0;
    } catch {}
    activeResultIndex = idx;
    activeSegmentIndex = -1;
    ++formatSeq;
    renderResults();
    if (focusTab) {
      resultsTabsEl.querySelector(`#transcribe-result-tab-${idx}`)?.focus?.();
    }
  }

  function renderResults() {
    const hasResults = results.length > 0;
    resultsEmptyEl.hidden = hasResults;
    resultsBodyEl.hidden = !hasResults;
    if (!hasResults) {
      clear(resultsTabsEl);
      resultsTabsEl.hidden = true;
      resultsTabsEl.removeAttribute("role");
      resultPanelEl.removeAttribute("role");
      resultPanelEl.removeAttribute("aria-labelledby");
      return;
    }

    if (activeResultIndex < 0 || activeResultIndex >= results.length) {
      activeResultIndex = 0;
    }
    const r = results[activeResultIndex];

    // Multi-file result tabs
    clear(resultsTabsEl);
    const hasMultiTabs = results.length > 1;
    resultsTabsEl.hidden = !hasMultiTabs;
    if (hasMultiTabs) {
      resultsTabsEl.setAttribute("role", "tablist");
      results.forEach((item, idx) => {
        const label =
          item.fileName || mediaBaseName(item.sourcePath) || `File ${idx + 1}`;
        const isSel = idx === activeResultIndex;
        resultsTabsEl.append(
          h(
            "button",
            {
              id: `transcribe-result-tab-${idx}`,
              type: "button",
              role: "tab",
              "aria-selected": String(isSel),
              "aria-controls": "transcribe-result-panel",
              tabindex: isSel ? "0" : "-1",
              class: `transcribe-result-tab${isSel ? " active" : ""}`,
              title: `View transcription result for ${label}`,
              onclick: () => selectResultTab(idx),
            },
            label,
          ),
        );
      });
      resultPanelEl.setAttribute("role", "tabpanel");
      resultPanelEl.setAttribute(
        "aria-labelledby",
        `transcribe-result-tab-${activeResultIndex}`,
      );
    } else {
      resultsTabsEl.removeAttribute("role");
      resultPanelEl.removeAttribute("role");
      resultPanelEl.removeAttribute("aria-labelledby");
    }

    // Metadata pills
    clear(resultMetaEl);
    const engineLabel =
      [r.engine, r.model].filter(Boolean).join(" · ") || "ASR";
    resultMetaEl.append(
      h("span", { class: "transcribe-pill accent" }, `⚙️ ${engineLabel}`),
      h("span", { class: "transcribe-pill" }, `🌐 ${r.language || "auto"}`),
      h(
        "span",
        { class: "transcribe-pill" },
        `⏱ ${formatDurationClock(r.durationSec)} · ${r.wordCount ?? 0} words`,
      ),
    );
    if (r.savedPath) {
      resultMetaEl.append(
        h(
          "span",
          {
            class: "transcribe-pill ok",
            title: r.isDemo ? "" : r.savedPath,
          },
          `✓ Saved: ${mediaBaseName(r.savedPath) || r.savedPath}`,
        ),
      );
    }

    // Audio element source
    const fileLabel = r.fileName || mediaBaseName(r.sourcePath) || "Audio";
    playerTrackLabel.textContent = `🎧 ${fileLabel}`;
    const nextSrc = r.isDemo ? "" : r.previewUrl || audioUrlFor(r.sourcePath);
    if (nextSrc) {
      if (audioEl.getAttribute("src") !== nextSrc) {
        try {
          audioEl.pause?.();
        } catch {}
        audioEl.setAttribute("src", nextSrc);
        if (audioEl.readyState > 0) {
          try {
            audioEl.load?.();
          } catch {}
        }
      }
      playerNoteEl.hidden = true;
      playerNoteEl.textContent = "";
    } else {
      if (audioEl.hasAttribute("src")) {
        try {
          audioEl.pause?.();
        } catch {}
        audioEl.removeAttribute("src");
        if (audioEl.readyState > 0) {
          try {
            audioEl.load?.();
          } catch {}
        }
      }
      if (r.isDemo) {
        playerNoteEl.hidden = true;
        playerNoteEl.textContent = "";
      } else {
        const ext = extensionOf(fileLabel);
        playerNoteEl.hidden = false;
        playerNoteEl.textContent = String(r.sourcePath || "").startsWith(
          "microphone://",
        )
          ? "Ephemeral microphone recording preview unavailable"
          : ext && !PLAYABLE_MEDIA_EXTS.has(ext)
            ? `Browser audio preview unavailable for .${ext} container`
            : "Browser audio preview unavailable for this source";
      }
    }

    // Segments
    clear(segmentsListEl);
    segmentButtons = [];
    const segs = Array.isArray(r.segments) ? r.segments : [];
    if (segs.length === 0) {
      segmentsListEl.append(
        h(
          "span",
          { class: "transcribe-queue-empty" },
          r.text
            ? "No timestamped segments returned; see formatted output below."
            : "No speech detected.",
        ),
      );
    } else {
      segs.forEach((seg, idx) => {
        const segBtn = h(
          "button",
          {
            type: "button",
            role: "listitem",
            class: `transcribe-seg-btn${idx === activeSegmentIndex ? " is-active" : ""}`,
            dataset: {
              segIndex: String(idx),
              start: String(seg.start ?? 0),
              end: String(seg.end ?? 0),
            },
            title: `Seek audio to ${formatSegmentStamp(seg.start)} and play`,
            onclick: () => seekToSegment(idx, seg),
          },
          h(
            "span",
            { class: "transcribe-seg-time" },
            formatSegmentStamp(seg.start),
          ),
          h("span", { class: "transcribe-seg-text" }, seg.text || ""),
        );
        if (idx === activeSegmentIndex)
          segBtn.setAttribute("aria-current", "true");
        segmentButtons.push(segBtn);
        segmentsListEl.append(segBtn);
      });
    }

    // AI Summary, Action Items, Chapters
    clear(insightsGridEl);
    const hasSummary =
      typeof r.summary === "string" && r.summary.trim().length > 0;
    const hasActions = Array.isArray(r.actionItems) && r.actionItems.length > 0;
    const hasChapters = Array.isArray(r.chapters) && r.chapters.length > 0;
    insightsGridEl.hidden = !(hasSummary || hasActions || hasChapters);

    if (hasSummary) {
      insightsGridEl.append(
        h(
          "div",
          { class: "transcribe-insight-card" },
          h(
            "h4",
            { class: "transcribe-insight-title" },
            "🧠 AI Executive Summary",
          ),
          h("p", { class: "transcribe-insight-body" }, r.summary),
        ),
      );
    }
    if (hasActions) {
      insightsGridEl.append(
        h(
          "div",
          { class: "transcribe-insight-card" },
          h("h4", { class: "transcribe-insight-title" }, "✅ Action Items"),
          h(
            "ul",
            { class: "transcribe-insight-list" },
            r.actionItems.map((item) => h("li", {}, item)),
          ),
        ),
      );
    }
    if (hasChapters) {
      insightsGridEl.append(
        h(
          "div",
          { class: "transcribe-insight-card" },
          h("h4", { class: "transcribe-insight-title" }, "📑 Chapters"),
          h(
            "div",
            { class: "transcribe-chapters-list" },
            r.chapters.map((ch) =>
              h(
                "button",
                {
                  type: "button",
                  class: "transcribe-chapter-btn",
                  title: `Jump to ${formatSegmentStamp(ch.start)}`,
                  onclick: () => {
                    const segIdx = segs.findIndex(
                      (s) =>
                        Math.abs(
                          (Number(s.start) || 0) - (Number(ch.start) || 0),
                        ) < 0.5,
                    );
                    seekToSegment(segIdx, { start: ch.start });
                  },
                },
                h(
                  "span",
                  { class: "transcribe-seg-time" },
                  formatSegmentStamp(ch.start),
                ),
                h("span", {}, ch.title || "Chapter"),
              ),
            ),
          ),
        ),
      );
    }

    // Formatted preview & action buttons
    const activeFmt = (r.format || selectedFormat || "md").toLowerCase();
    if (VALID_FORMAT_SET.has(activeFmt)) {
      selectedFormat = activeFmt;
      formatCtl.select.value = activeFmt;
    }
    formatBadgeEl.textContent = `.${activeFmt.toUpperCase()}`;
    previewTextarea.value = r.formatted ?? r.text ?? "";
    openCodeBtn.disabled = !r.savedPath;
    openCodeBtn.title = r.savedPath
      ? `Open ${mediaBaseName(r.savedPath) || "saved transcript"} in the built-in Code Editor`
      : "Open the saved transcript file in the built-in Code Editor";
  }

  // ---------------------------------------------------------------------------
  // Backend Operations
  // ---------------------------------------------------------------------------

  async function refreshStatus(force = false) {
    if (isDemoMode() && !force) {
      const demo = buildDemoTranscribeSession();
      statusData = demo.status;
      renderStatusHeader();
      return statusData;
    }
    if (statusPromise && !force) return statusPromise;
    statusPromise = (async () => {
      try {
        const res = await call("transcribe/status", {});
        statusData = res;
        renderStatusHeader();
        return res;
      } catch (err) {
        enginePill.className = "transcribe-pill warn";
        enginePill.textContent = "⚠ Status check failed";
        ffmpegPill.className = "transcribe-pill muted";
        ffmpegPill.textContent = "FFmpeg unknown";
        ollamaPill.className = "transcribe-pill muted";
        ollamaPill.textContent = "Ollama unknown";
        if (force) {
          toast(
            err instanceof ApiError
              ? err.message
              : "Could not load transcription status.",
            { kind: "error" },
          );
        }
        return null;
      } finally {
        statusPromise = null;
      }
    })();
    return statusPromise;
  }

  function pollInstallJob(jobId) {
    const check = async () => {
      try {
        const { jobs } = await call("jobs/list");
        const found = Array.isArray(jobs)
          ? jobs.find((j) => j.id === jobId)
          : null;
        if (
          !found ||
          found.state === "done" ||
          found.state === "failed" ||
          found.state === "cancelled"
        ) {
          installing = false;
          installBtn.disabled = false;
          if (found?.state === "done") {
            setStatusText("✓ Local Whisper AI installation complete.");
            toast("Local Whisper AI is ready!", { kind: "success" });
            void refreshStatus(true);
          } else if (found?.state === "failed") {
            const msg =
              found.error?.message || "Local Whisper AI install failed.";
            setStatusText(msg, true);
            toast(msg, { kind: "error" });
          } else {
            setStatusText("Local Whisper AI installation stopped.");
          }
          return;
        }
        setTimeout(check, 900);
      } catch {
        installing = false;
        installBtn.disabled = false;
      }
    };
    setTimeout(check, 900);
  }

  async function handleOneClickInstall() {
    if (installing) return;
    const confirmed = await confirmBox({
      title: "Install Local Whisper AI",
      message: `Create a local Python Whisper environment and warm "${selectedModel}" for offline speech-to-text transcription?`,
      confirmLabel: "⚡ Install Whisper AI",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    installing = true;
    installBtn.disabled = true;
    setStatusText("Installing local Whisper AI environment…");
    try {
      const { job } = await call("transcribe/install", {
        confirm: true,
        model: selectedModel,
      });
      if (job) emit("job-started", job);
      toast("Started Local Whisper AI installation in the background.", {
        kind: "info",
      });
      if (job?.state === "done") {
        installing = false;
        installBtn.disabled = false;
        setStatusText("✓ Local Whisper AI installation complete.");
        void refreshStatus(true);
      } else if (job?.id) {
        pollInstallJob(job.id);
      } else {
        installing = false;
        installBtn.disabled = false;
      }
    } catch (err) {
      installing = false;
      installBtn.disabled = false;
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not start Whisper AI installation.";
      setStatusText(msg, true);
      toast(msg, { kind: "error" });
    }
  }

  async function runTranscription() {
    if (busy) return;
    if (queue.length === 0) {
      const sel = findSelectedMediaPaths();
      if (sel.length > 0) {
        addPathsToQueue(sel);
      } else {
        setStatusText(
          "Add an audio/video file to the queue or record your microphone first.",
          true,
        );
        toast("Queue at least one audio or video file first.", {
          kind: "info",
        });
        return;
      }
    }

    busy = true;
    runBtn.disabled = true;
    setStatusText(
      `Transcribing ${queue.length} file${queue.length === 1 ? "" : "s"}…`,
    );
    try {
      const res = await call("transcribe/run", {
        paths: [...queue],
        engine: selectedEngine,
        model: selectedModel,
        language: selectedLanguage,
        format: selectedFormat,
        enhanceAudio,
        summarize,
        saveSidecar,
        outputDir: currentFolderPath(),
      });
      ++formatSeq;
      revokeBlobUrls();
      results = Array.isArray(res?.results) ? res.results : [];
      activeResultIndex = 0;
      activeSegmentIndex = -1;
      renderResults();
      const count = res?.count ?? results.length;
      setStatusText(
        count > 0
          ? `Completed transcription of ${count} file${count === 1 ? "" : "s"}.`
          : "Transcription completed with no results.",
      );
      if (results.some((item) => item.savedPath)) {
        void refresh();
      }
      if (count > 0) {
        toast(`Transcribed ${count} file${count === 1 ? "" : "s"}.`, {
          kind: "success",
        });
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Transcription failed.";
      setStatusText(msg, true);
      toast(msg, { kind: "error" });
    } finally {
      busy = false;
      runBtn.disabled = false;
    }
  }

  async function handleFormatChange(nextFormat) {
    const r = results[activeResultIndex];
    if (!r) return;
    const seq = ++formatSeq;
    try {
      const res = await call("transcribe/format", {
        source: buildFormatSource(r),
        format: nextFormat,
      });
      if (seq !== formatSeq || results[activeResultIndex] !== r) return;
      r.format = res.format || nextFormat;
      r.formatted = res.formatted ?? r.formatted;
      renderResults();
    } catch (err) {
      if (seq !== formatSeq || results[activeResultIndex] !== r) return;
      toast(
        err instanceof ApiError
          ? err.message
          : "Could not reformat transcript.",
        { kind: "error" },
      );
    }
  }

  async function handleCopyTranscript() {
    const text = previewTextarea.value;
    await copyToClipboard(text, { what: "transcript" });
  }

  async function handleSaveToCurrentFolder() {
    const r = results[activeResultIndex];
    if (!r) return;
    const content = previewTextarea.value;
    const folder = currentFolderPath();
    const name = stemOf(
      r.fileName || mediaBaseName(r.sourcePath) || "transcript",
    );
    try {
      const res = await call("transcribe/save", {
        content,
        folder,
        name,
        format: selectedFormat,
      });
      r.savedPath = res.savedPath;
      renderResults();
      toast(
        `Saved ${res.name || mediaBaseName(res.savedPath) || "transcript"}`,
        {
          kind: "success",
        },
      );
      void refresh();
    } catch (err) {
      toast(
        err instanceof ApiError ? err.message : "Could not save transcript.",
        { kind: "error" },
      );
    }
  }

  function handleOpenSavedInCode() {
    const r = results[activeResultIndex];
    if (!r?.savedPath) {
      toast("Save the transcript to disk first.", { kind: "info" });
      return;
    }
    openPower("code", { open: r.savedPath });
  }

  function handleSendToVoiceReader() {
    const r = results[activeResultIndex];
    if (!r) return;
    const usePreview = selectedFormat === "md" || selectedFormat === "txt";
    const text =
      (usePreview ? previewTextarea.value : r.text) ||
      previewTextarea.value ||
      r.text ||
      "";
    if (!text.trim()) {
      toast("There is no transcript text to send.", { kind: "info" });
      return;
    }
    openPower("phonon", {
      text: text.trim(),
      ...(r.savedPath ? { path: r.savedPath } : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Live Microphone Recording & WebAudio Level Meter
  // ---------------------------------------------------------------------------

  function drawIdleMicCanvas() {
    const ctx2d = micCanvas.getContext?.("2d");
    if (!ctx2d) return;
    const w = micCanvas.width;
    const ch = micCanvas.height;
    ctx2d.clearRect(0, 0, w, ch);
    ctx2d.fillStyle = "rgba(128, 128, 128, 0.14)";
    ctx2d.fillRect(0, Math.floor(ch / 2) - 1, w, 2);
  }

  function cleanupMicResources() {
    if (recRafId) {
      cancelAnimationFrame(recRafId);
      recRafId = 0;
    }
    if (recTimerId) {
      clearInterval(recTimerId);
      recTimerId = 0;
    }
    try {
      recSource?.disconnect();
    } catch {}
    try {
      recAnalyser?.disconnect();
    } catch {}
    recSource = null;
    recAnalyser = null;
    if (recStream) {
      for (const track of recStream.getTracks?.() || []) {
        try {
          track.stop();
        } catch {}
      }
      recStream = null;
    }
    if (recAudioCtx) {
      try {
        void recAudioCtx.close?.();
      } catch {}
      recAudioCtx = null;
    }
    drawIdleMicCanvas();
  }

  async function submitRecordedBlob(blob) {
    micStatusEl.textContent = "⏳ Transcribing microphone recording…";
    setStatusText("Transcribing microphone recording…");
    try {
      const buf = await blob.arrayBuffer();
      const audioBase64 = arrayBufferToBase64(buf);
      const ext = extensionForMime(recMimeType || blob.type);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const fileName = `mic-recording-${stamp}.${ext}`;
      const res = await call("transcribe/mic", {
        audioBase64,
        mimeType: recMimeType || blob.type || "audio/webm",
        fileName,
        saveRecordingFolder: currentFolderPath(),
        options: {
          engine: selectedEngine,
          model: selectedModel,
          language: selectedLanguage,
          format: selectedFormat,
          enhanceAudio,
          summarize,
          saveSidecar,
        },
      });
      if (res?.recordingPath) {
        addPathsToQueue([res.recordingPath]);
      }
      if (res?.result) {
        ++formatSeq;
        revokeBlobUrls();
        const recResult = { ...res.result };
        if (
          !res.recordingPath &&
          !audioUrlFor(recResult.sourcePath) &&
          typeof URL?.createObjectURL === "function"
        ) {
          try {
            const previewUrl = URL.createObjectURL(blob);
            if (previewUrl) {
              blobUrls.add(previewUrl);
              recResult.previewUrl = previewUrl;
            }
          } catch {}
        }
        results = [recResult];
        activeResultIndex = 0;
        activeSegmentIndex = -1;
        renderResults();
      }
      micStatusEl.textContent = "✓ Microphone transcription complete";
      setStatusText("Microphone transcription complete.");
      toast("Microphone recording transcribed!", { kind: "success" });
      if (res?.recordingPath || res?.result?.savedPath) {
        void refresh();
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Microphone transcription failed.";
      micStatusEl.textContent = `✗ ${msg}`;
      setStatusText(msg, true);
      toast(msg, { kind: "error" });
    }
  }

  function stopMicRecording({ discard = false } = {}) {
    if (!recording) return;
    recording = false;
    micBtn.textContent = "🎙️ Record Microphone";
    micBtn.classList.remove("is-recording");
    if (discard && recRecorder) {
      recRecorder.onstop = null;
    }
    try {
      if (recRecorder && recRecorder.state !== "inactive") {
        recRecorder.stop();
      }
    } catch {}
    cleanupMicResources();
    if (discard) {
      recChunks = [];
      micTimerEl.textContent = "00:00.0";
      micStatusEl.textContent = "Ready for live microphone capture";
    }
  }

  async function toggleMicRecording() {
    if (recording) {
      stopMicRecording({ discard: false });
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast("Microphone recording is not available in this browser window.", {
        kind: "error",
      });
      return;
    }

    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recMimeType = chooseMicMimeType();
      recChunks = [];
      recRecorder = recMimeType
        ? new MediaRecorder(recStream, { mimeType: recMimeType })
        : new MediaRecorder(recStream);

      recRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recChunks.push(ev.data);
      };
      recRecorder.onstop = () => {
        const chunks = recChunks;
        recChunks = [];
        const blob = new Blob(chunks, {
          type: recMimeType || "audio/webm",
        });
        if (blob.size > 0) {
          void submitRecordedBlob(blob);
        } else {
          micStatusEl.textContent = "No audio captured";
        }
      };

      // Optional WebAudio live level meter
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          recAudioCtx = new Ctx();
          recSource = recAudioCtx.createMediaStreamSource(recStream);
          recAnalyser = recAudioCtx.createAnalyser();
          recAnalyser.fftSize = 256;
          recSource.connect(recAnalyser);
          const buf = new Uint8Array(recAnalyser.frequencyBinCount);
          const drawMeter = () => {
            if (!recording || !recAnalyser) return;
            recAnalyser.getByteTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) {
              const amp = Math.abs(buf[i] - 128) / 128;
              if (amp > peak) peak = amp;
            }
            const ctx2d = micCanvas.getContext?.("2d");
            if (ctx2d) {
              const w = micCanvas.width;
              const ch = micCanvas.height;
              ctx2d.clearRect(0, 0, w, ch);
              ctx2d.fillStyle = "rgba(128, 128, 128, 0.16)";
              ctx2d.fillRect(0, 0, w, ch);
              ctx2d.fillStyle = peak > 0.7 ? "#ef4444" : "#10b981";
              ctx2d.fillRect(0, 4, Math.max(4, Math.round(peak * w)), ch - 8);
            }
            recRafId = requestAnimationFrame(drawMeter);
          };
          recRafId = requestAnimationFrame(drawMeter);
        }
      } catch {
        /* WebAudio visualization optional */
      }

      recording = true;
      recStartMs = Date.now();
      micBtn.textContent = "⏹ Stop & Transcribe";
      micBtn.classList.add("is-recording");
      micStatusEl.textContent = "🔴 Recording live microphone…";
      micTimerEl.textContent = "00:00.0";
      recTimerId = setInterval(() => {
        if (!recording) return;
        micTimerEl.textContent = formatClockTenths(
          (Date.now() - recStartMs) / 1000,
        );
      }, 100);

      recRecorder.start();
    } catch (err) {
      cleanupMicResources();
      recording = false;
      toast(
        `Could not access microphone: ${err?.message || "Permission denied"}`,
        { kind: "error" },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Demo / Payload Initialization & Lifecycle Hooks
  // ---------------------------------------------------------------------------

  function ensureOption(selectEl, value) {
    if (![...selectEl.options].some((o) => o.value === value)) {
      selectEl.append(h("option", { value }, value));
    }
  }

  function applyDemoSession() {
    ++formatSeq;
    revokeBlobUrls();
    const demo = buildDemoTranscribeSession();
    statusData = demo.status;
    renderStatusHeader();
    queue = [demo.result.sourcePath];
    renderQueue();
    results = [{ ...demo.result }];
    activeResultIndex = 0;
    activeSegmentIndex = 0;
    renderResults();
    setStatusText("Demo session loaded (Whisper Neural ASR · whisper-base).");
  }

  function applyPayload(opts) {
    if (!opts || typeof opts !== "object") return;
    if (typeof opts.engine === "string") {
      const eng = opts.engine.trim().toLowerCase();
      if (VALID_ENGINE_SET.has(eng)) {
        selectedEngine = eng;
        engineCtl.select.value = eng;
      }
    }
    if (typeof opts.model === "string" && opts.model.trim()) {
      const m = opts.model.trim();
      selectedModel = m;
      ensureOption(modelCtl.select, m);
      modelCtl.select.value = m;
    }
    if (typeof opts.language === "string" && opts.language.trim()) {
      const lang = opts.language.trim();
      selectedLanguage = lang;
      ensureOption(langCtl.select, lang);
      langCtl.select.value = lang;
    }
    if (typeof opts.enhanceAudio === "boolean") {
      enhanceAudio = opts.enhanceAudio;
      enhanceChk.input.checked = opts.enhanceAudio;
    }
    if (typeof opts.summarize === "boolean") {
      summarize = opts.summarize;
      summarizeChk.input.checked = opts.summarize;
    }
    if (typeof opts.saveSidecar === "boolean") {
      saveSidecar = opts.saveSidecar;
      saveSidecarChk.input.checked = opts.saveSidecar;
    }
    const willAutoRun = opts.autoRun === true || opts.autoStart === true;
    if (typeof opts.format === "string") {
      const rawFmt = opts.format.trim().toLowerCase();
      const fmt = rawFmt === "markdown" ? "md" : rawFmt;
      if (VALID_FORMAT_SET.has(fmt)) {
        selectedFormat = fmt;
        formatCtl.select.value = fmt;
        if (
          results[activeResultIndex] &&
          !opts.paths &&
          !opts.path &&
          !willAutoRun
        ) {
          void handleFormatChange(fmt);
        }
      }
    }
    if (typeof opts.path === "string" && opts.path.trim()) {
      addPathsToQueue([opts.path.trim()], { replace: true });
    } else if (Array.isArray(opts.paths)) {
      addPathsToQueue(opts.paths, { replace: true });
    }
    if (willAutoRun && queue.length > 0) {
      void runTranscription();
    }
  }

  drawIdleMicCanvas();
  renderQueue();
  if (isDemoMode()) {
    applyDemoSession();
  }

  return {
    show(opts) {
      if (isDemoMode() && !opts?.paths && !opts?.path && results.length === 0) {
        applyDemoSession();
      } else if (!isDemoMode()) {
        void refreshStatus(false);
      }
      applyPayload(opts);
    },
    hide() {
      if (recording) stopMicRecording({ discard: true });
      try {
        audioEl.pause?.();
      } catch {}
    },
    dispose() {
      if (recording) stopMicRecording({ discard: true });
      cleanupMicResources();
      revokeBlobUrls();
      try {
        audioEl.pause?.();
      } catch {}
    },
  };
}

registerPowerTab({
  id: "transcribe",
  label: "Audio to Text",
  icon: "🎙️",
  group: "media",
  tip: "Transcribe audio & video files or live microphone speech to Markdown, TXT, SRT, VTT, LRC, or JSON with timestamps and AI summaries.",
  mount: mountTranscribeStudio,
});
