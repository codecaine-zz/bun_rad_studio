// Ollama Phonon Voice Reader, Plain-Text Format Converter, Large-Text Streaming Reader & Multi-Format Audio Exporter.
import { ApiError, call, getToken } from "./api.js";
import { announce, clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh, saveSettings } from "./nav.js";
import { currentPath } from "./pane.js";
import { registerPowerTab } from "./power.js";
import { selectKeys, selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";
import { showToolsDialog } from "./tools.js";
import { baseName, extensionOf } from "./util.js";

function stemOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Checks whether a file entry can be read aloud or converted to plain text.
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

function mountPhononStudio(root, payload) {
  clear(root);
  root.classList.add("phonon-studio-root");

  // Studio state
  let status = null;
  let voices = [];
  let audioFormats = [];
  let selectedVoice = state.settings?.phononVoice || "Zoey";
  let selectedFormat = state.settings?.phononFormat || "wav";
  let speed = Number(state.settings?.phononSpeed) || 1;
  let pauseMs = Number(state.settings?.phononPauseMs ?? 200);
  let cleanText = state.settings?.phononCleanText !== false;
  let maxChunkChars = 520;

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
  const chunkAudioCache = new Map(); // `${voice}|${chunkText}` -> Promise<{ url, durationSec }>

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
    rows: "9",
    placeholder: "Paste or type any text here — or load any document/file above to convert it into plain text and read it out loud with Ollama Phonon. Arbitrarily large books and documents are automatically split into context-safe chunks.",
  });

  const formatSelect = h("select", { id: "phonon-format-select", class: "input phonon-select" });
  const formatHintEl = h("p", { class: "hint phonon-format-hint" }, "");
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
  const nowPlayingStatus = h("div", { class: "phonon-now-playing" }, "Ready to read. Select a voice and press Read Out Loud.");

  const chunkListContainer = h("div", { class: "phonon-chunk-list" });
  const chunkPagerContainer = h("div", { class: "phonon-chunk-pager" });

  // Populate default sample text so user can test immediately if no file was passed
  const DEFAULT_SAMPLE_TEXT =
    "Welcome to the Codecaine Phonon Voice Studio! Powered by Ollama and Gradium Phonon TTS, you can choose your default voice from 38 expressive neural voices, convert documents and files from any format into clean plain text, read arbitrarily large texts out loud with automatic context-window chunking, and save speech as WAV, MP3, M4A, FLAC, OGG, Opus, AIFF, or WMA.";

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

  function updateFormatDropdown() {
    clear(formatSelect);
    const list = audioFormats.length
      ? audioFormats
      : [
          { id: "wav", label: "WAV (24 kHz PCM — Native)", needsFfmpeg: false, desc: "Uncompressed studio WAV directly from Phonon." },
          { id: "mp3", label: "MP3 (Universal Audio)", needsFfmpeg: true, desc: "Compact MP3 audio file." },
          { id: "m4a", label: "M4A / AAC (Apple & Podcast)", needsFfmpeg: true, desc: "High-efficiency M4A audio." },
          { id: "flac", label: "FLAC (Lossless)", needsFfmpeg: true, desc: "Lossless compressed FLAC." },
          { id: "ogg", label: "OGG Vorbis", needsFfmpeg: true, desc: "Open-source Ogg Vorbis." },
          { id: "opus", label: "Opus (Best Speech Compression)", needsFfmpeg: true, desc: "Modern speech codec." },
          { id: "aiff", label: "AIFF (Apple PCM — Native)", needsFfmpeg: false, desc: "Uncompressed Apple AIFF." },
        ];
    for (const fmt of list) {
      const needsFf = fmt.needsFfmpeg && status && !status.ffmpegInstalled;
      formatSelect.append(
        h("option", { value: fmt.id, selected: fmt.id === selectedFormat }, `${fmt.label}${needsFf ? " (install ffmpeg first)" : ""}`),
      );
    }
    formatSelect.value = selectedFormat;
    const cur = list.find((f) => f.id === selectedFormat);
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
      h("span", { class: `phonon-pill ${ollamaOk ? "ok" : "warn"}` }, ollamaOk ? `✔ Ollama (${status.ollamaVersion || "installed"})` : "✖ Ollama not installed"),
      h("span", { class: `phonon-pill ${modelOk ? "ok" : "warn"}` }, modelOk ? "✔ Phonon TTS Model (38 voices)" : "✖ Phonon model not pulled"),
      h("span", { class: `phonon-pill ${ffOk ? "ok" : "muted"}` }, ffOk ? "✔ ffmpeg (All audio formats)" : "ℹ WAV & AIFF ready (install ffmpeg for MP3/M4A/FLAC)"),
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
          title: "Install ffmpeg with one click to unlock MP3, M4A, AAC, FLAC, OGG, Opus, and WMA export",
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
            h("strong", {}, ready ? "🗣️ Ollama Phonon Neural TTS Studio — Ready" : "🗣️ Set Up Ollama Phonon Voice Engine"),
            h("span", { class: "hint" }, status.install?.note || ""),
          ),
          pills,
        ),
        actions,
      ),
    );
  }

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

  function pollJobUntilDone(jobId, onDone) {
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
            toast(msg, { kind: "error" });
            refreshStatus();
          }
          return;
        }
        setTimeout(check, 900);
      } catch {}
    };
    setTimeout(check, 900);
  }

  async function refreshStatus() {
    try {
      status = await call("phonon/status");
      voices = status.voices || [];
      audioFormats = status.audioFormats || [];
      if (status.settings) {
        selectedVoice = status.settings.voice || selectedVoice;
        selectedFormat = status.settings.format || selectedFormat;
        speed = Number(status.settings.speed) || speed;
        pauseMs = Number(status.settings.pauseMs ?? pauseMs);
        cleanText = status.settings.cleanText ?? cleanText;
        speedSlider.value = String(speed);
        speedValueLabel.textContent = `${speed.toFixed(2).replace(/\.00$/, ".0")}×`;
        pauseSlider.value = String(pauseMs);
        pauseValueLabel.textContent = `${pauseMs} ms`;
      }
      updateVoiceDropdown();
      updateFormatDropdown();
      renderStatusBanner();
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
    const sample = `Hello! I am ${selectedVoice}, speaking through Ollama Phonon in Codecaine File Manager.`;
    nowPlayingStatus.textContent = `Synthesizing voice preview for "${selectedVoice}"…`;
    try {
      const res = await call("phonon/speak", { text: sample, voice: selectedVoice });
      audioEl.src = audioUrlWithToken(res.url);
      audioEl.playbackRate = speed;
      await audioEl.play();
      nowPlayingStatus.textContent = `Previewing voice "${selectedVoice}" (${res.durationSec}s, 24 kHz WAV).`;
    } catch (err) {
      nowPlayingStatus.textContent = err instanceof ApiError ? err.message : "Voice preview failed.";
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
      return;
    }
    try {
      const res = await call("phonon/chunk", { text: raw, maxChars: maxChunkChars });
      chunks = res.chunks || [];
      statsSummaryBadge.textContent = `${res.wordCount.toLocaleString()} words · ${res.charCount.toLocaleString()} chars · ${res.chunkCount.toLocaleString()} Phonon chunk${res.chunkCount === 1 ? "" : "s"} (~${formatDuration(res.estimatedSeconds)})`;
      if (chunkPage * CHUNKS_PER_PAGE >= chunks.length) chunkPage = 0;
      renderChunkList();
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
      const cacheKey = `${selectedVoice}|${chunk.text}`;
      const isCached = chunkAudioCache.has(cacheKey);
      const itemEl = h("div", {
        class: `phonon-chunk-item${isCurrent ? " is-active" : ""}${isCached ? " is-cached" : ""}`,
        dataset: { index: String(chunk.index) },
        onclick: () => playFromChunk(chunk.index),
      },
        h("div", { class: "phonon-chunk-meta" },
          h("span", { class: "phonon-chunk-num" }, `#${chunk.index + 1}`),
          h("span", { class: "phonon-chunk-info" }, `Para ${chunk.paragraphIndex + 1} · ${chunk.wordCount} words · ${chunk.charCount}/${maxChunkChars} chars`),
          h("span", { class: "phonon-chunk-state" }, isCurrent ? (isPaused ? "⏸ Paused" : "🔊 Speaking") : isCached ? "✔ Cached" : "▶ Click to read here"),
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
  // Streaming Multi-Chunk Read Out Loud Player with Lookahead Prefetching
  // -------------------------------------------------------------------------------------------------------------

  function fetchChunkAudio(chunkIndex, voiceName) {
    const chunk = chunks[chunkIndex];
    if (!chunk) return Promise.reject(new Error("Chunk out of range"));
    const key = `${voiceName}|${chunk.text}`;
    let pending = chunkAudioCache.get(key);
    if (!pending) {
      pending = call("phonon/speak", { text: chunk.text, voice: voiceName }).then((res) => {
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
      void audioEl.play().catch(() => {});
      nowPlayingStatus.textContent = `Reading chunk ${activeChunkIndex + 1} of ${chunks.length} with voice "${selectedVoice}"…`;
    } else {
      isPaused = true;
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
    audioEl.pause();
    audioEl.removeAttribute("src");
    updateTransportButtons();
    renderChunkList();
    nowPlayingStatus.textContent = "Stopped.";
  }

  function stepChunk(delta) {
    if (!chunks.length) return;
    const nextIdx = Math.min(chunks.length - 1, Math.max(0, (activeChunkIndex < 0 ? 0 : activeChunkIndex) + delta));
    void playFromChunk(nextIdx);
  }

  async function playFromChunk(startIndex) {
    if (!chunks.length || startIndex < 0 || startIndex >= chunks.length) return;
    const session = ++playbackSessionId;
    isPlaying = true;
    isPaused = false;
    activeChunkIndex = startIndex;

    const targetPage = Math.floor(startIndex / CHUNKS_PER_PAGE);
    if (targetPage !== chunkPage) chunkPage = targetPage;

    updateTransportButtons();
    renderChunkList();

    const activeRow = chunkListContainer.querySelector(`.phonon-chunk-item[data-index="${startIndex}"]`);
    activeRow?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const voiceToUse = selectedVoice;
    nowPlayingStatus.textContent = `Synthesizing chunk ${startIndex + 1} of ${chunks.length} with voice "${voiceToUse}"…`;

    // Prefetch next 2 chunks in the background so large documents stream without gaps!
    if (startIndex + 1 < chunks.length) void fetchChunkAudio(startIndex + 1, voiceToUse).catch(() => {});
    if (startIndex + 2 < chunks.length) {
      setTimeout(() => {
        if (playbackSessionId === session) void fetchChunkAudio(startIndex + 2, voiceToUse).catch(() => {});
      }, 300);
    }

    try {
      const res = await fetchChunkAudio(startIndex, voiceToUse);
      if (playbackSessionId !== session) return;

      audioEl.src = audioUrlWithToken(res.url);
      audioEl.playbackRate = speed;
      nowPlayingStatus.textContent = `🔊 Speaking chunk ${startIndex + 1} of ${chunks.length} (${voiceToUse}, ${res.durationSec}s)…`;
      await audioEl.play();
    } catch (err) {
      if (playbackSessionId !== session) return;
      isPlaying = false;
      updateTransportButtons();
      renderChunkList();
      nowPlayingStatus.textContent = err instanceof ApiError ? err.message : "Could not synthesize speech chunk.";
      toast(nowPlayingStatus.textContent, { kind: "error" });
    }
  }

  audioEl.addEventListener("ended", () => {
    if (!isPlaying || isPaused) return;
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
      isPlaying = false;
      isPaused = false;
      activeChunkIndex = -1;
      updateTransportButtons();
      renderChunkList();
      nowPlayingStatus.textContent = `✔ Finished reading all ${chunks.length.toLocaleString()} chunks aloud.`;
    }
  });

  // -------------------------------------------------------------------------------------------------------------
  // Save as Any Audio File Format (Single Text/Document or Batch Selected Files)
  // -------------------------------------------------------------------------------------------------------------

  async function saveEditorTextAsAudioFile() {
    const raw = textArea.value.trim();
    if (!raw) {
      toast("Enter or load some text before saving an audio file.", { kind: "info" });
      return;
    }
    try {
      const res = await call("phonon/save", {
        text: raw,
        voice: selectedVoice,
        format: selectedFormat,
        speed,
        pauseMs,
        cleanText: false, // Editor text is already visible/editable
        outputDir: outDirInput.value.trim() || currentPath() || state.home,
        outputName: outNameInput.value.trim() || "speech",
        maxChunkChars: Math.max(maxChunkChars, 750),
      });
      emit("job-started", res.job);
      nowPlayingStatus.textContent = `Saving audio as .${selectedFormat.toUpperCase()} (${chunks.length} chunks, voice: ${selectedVoice})… See Tasks tray for live progress.`;
      toast(`Started saving .${selectedFormat.toUpperCase()} audio file with voice "${selectedVoice}".`, { kind: "info" });
      pollJobUntilDone(res.job.id, (finishedJob) => {
        const out = finishedJob.outputs?.[0];
        nowPlayingStatus.textContent = out ? `✔ Saved audio file: ${out}` : "✔ Audio export complete!";
        toast(`Saved audio file: ${out ? baseName(out, state.sep) : selectedFormat.toUpperCase()}`, { kind: "success" });
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not export audio file.", { kind: "error" });
    }
  }

  async function batchConvertSelectedFilesToAudio() {
    const sel = selectedEntries().filter((e) => !e.isDir);
    if (!sel.length) {
      toast("Select one or more files in the File Manager list first.", { kind: "info" });
      return;
    }
    try {
      const res = await call("phonon/save", {
        paths: sel.map((e) => e.path),
        voice: selectedVoice,
        format: selectedFormat,
        speed,
        pauseMs,
        cleanText,
        outputDir: outDirInput.value.trim() || currentPath() || "",
        maxChunkChars: Math.max(maxChunkChars, 800),
      });
      emit("job-started", res.job);
      toast(`Converting ${sel.length} file${sel.length === 1 ? "" : "s"} to .${selectedFormat.toUpperCase()} audio with voice "${selectedVoice}"…`, { kind: "info" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not start batch audio conversion.", { kind: "error" });
    }
  }

  function loadLargeTextStressSample() {
    const paragraphs = [];
    for (let i = 1; i <= 18; i++) {
      paragraphs.push(
        `Chapter ${i}: Large Text Context Window Optimization. When reading a long book, research paper, or technical manual with Ollama Phonon, passing the entire document at once would exceed the 8,192-token context limit shared between text tokens and generated audio codec frames. By splitting documents at natural paragraph, sentence, and clause boundaries, Codecaine File Manager streams chunk ${i} smoothly while prefetching upcoming chunks in the background and stitching 24 kHz 16-bit PCM audio frames seamlessly on disk.`,
      );
    }
    sourcePath = "";
    sourceFormatBadge.textContent = "Large Multi-Chapter Sample (18 Paragraphs)";
    outNameInput.value = "large-audiobook-sample";
    textArea.value = paragraphs.join("\n\n");
    void recomputeChunksFromEditor();
    toast("Loaded 18-paragraph large text sample to demonstrate multi-chunk Phonon streaming & stitching.", { kind: "info" });
  }

  // Event listeners for controls
  voiceSelect.addEventListener("change", () => {
    selectedVoice = voiceSelect.value;
    const currentInfo = voices.find((v) => v.id === selectedVoice);
    voiceDescEl.textContent = currentInfo ? `${currentInfo.category}: ${currentInfo.desc}` : "";
    renderStatusBanner();
    renderChunkList();
  });

  formatSelect.addEventListener("change", () => {
    selectedFormat = formatSelect.value;
    const cur = audioFormats.find((f) => f.id === selectedFormat);
    formatHintEl.textContent = cur ? cur.desc : "";
    void saveSettings({ phononFormat: selectedFormat });
  });

  speedSlider.addEventListener("input", () => {
    speed = Number(speedSlider.value) || 1;
    speedValueLabel.textContent = `${speed.toFixed(2).replace(/\.00$/, ".0")}×`;
    audioEl.playbackRate = speed;
  });
  speedSlider.addEventListener("change", () => {
    void saveSettings({ phononSpeed: speed });
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
    h("div", { class: "phonon-grid-2 phonon-sliders-row" },
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-speed-range" },
          h("span", {}, "Speaking Speed"),
          speedValueLabel,
        ),
        speedSlider,
      ),
      h("div", { class: "phonon-field" },
        h("label", { class: "phonon-label", for: "phonon-pause-range" },
          h("span", {}, "Paragraph Pause Gap"),
          pauseValueLabel,
        ),
        pauseSlider,
      ),
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
    h("label", { class: "sr-only", for: "phonon-text-editor" }, "Plain text content to read out loud or export as audio"),
    textArea,
  );

  const playerAndExportCard = h("section", { class: "phonon-card" },
    h("div", { class: "phonon-card-head" },
      h("h3", { class: "phonon-card-title" }, "3. Read Out Loud & Save as Any Audio File Format"),
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
    h("div", { class: "phonon-export-box" },
      h("div", { class: "phonon-grid-3" },
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-format-select" }, "Audio File Format"),
          formatSelect,
          formatHintEl,
        ),
        h("div", { class: "phonon-field" },
          h("label", { class: "phonon-label", for: "phonon-out-name" }, "Output Audio Filename"),
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
      h("div", { class: "phonon-export-actions" },
        h("button", {
          type: "button",
          class: "btn primary phonon-save-audio-btn",
          onclick: () => saveEditorTextAsAudioFile(),
        }, "💾 Save Audio File"),
        h("button", {
          type: "button",
          class: "btn",
          title: "Convert all selected files in the File Manager into audio files using your Phonon voice",
          onclick: () => batchConvertSelectedFilesToAudio(),
        }, "📚 Batch Save Selected File(s) as Audio"),
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
        h("strong", {}, "Phonon Context-Safe Speech Queue (Click any segment to jump & read from there)"),
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
      });
    } else if (Array.isArray(p.paths) && p.paths.length > 0) {
      void loadFileAndExtract(p.paths[0]).then(() => {
        if (p.autoPlay) void startOrResumeReading();
      });
    } else if (typeof p.text === "string" && p.text.trim()) {
      textArea.value = p.text.trim();
      void recomputeChunksFromEditor().then(() => {
        if (p.autoPlay) void startOrResumeReading();
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
    },
    onPayload(nextPayload) {
      applyPayload(nextPayload);
    },
    dispose() {
      stopReading();
      offFolder?.();
    },
  };
}

registerPowerTab({
  id: "phonon",
  label: "Voice Reader",
  icon: "🗣️",
  tip: "Read text and documents out loud with Ollama Phonon, convert formats to plain text, set your default voice, and save as any audio file.",
  group: "media",
  mount: mountPhononStudio,
});
