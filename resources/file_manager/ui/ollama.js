// Built-In Ollama AI Assistant & Full Capability Router UI for Codecaine File Manager.
import { call, getToken } from "./api.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh } from "./nav.js";
import { currentPath } from "./pane.js";
import { closePower, registerPowerTab } from "./power.js";
import { selectedEntries } from "./selection.js";
import { on, state } from "./state.js";

const uiState = {
  subTab: "assistant", // "assistant" | "decision" | "speech" | "meaning" | "models"
  statusData: null,
  loading: false,
  selectedModel: "",
  selectedVoice: "Zoey",
  thinkEnabled: false,
  speakReply: false,
  useWebSearch: false,
  schemaPreset: "",
  promptText: "",
  routeBanner: "",
  thinkingOutput: "",
  answerOutput: "",
  structuredOutput: null,
  refusalBanner: null,
  lastAudioUrl: "",
  autoPlayedAudioUrl: "",
  lastSavedAudioPath: "",
  pendingActions: [],
  // Decision / SystemOne builder state
  decisionModel: "",
  decisionQuestions: [
    {
      id: "q_noul",
      type: "noul",
      instructions: "Does this file or image contain an error, crash, or urgent issue?",
      criteriaText: "",
    },
    {
      id: "q_choice",
      type: "choice",
      instructions: "Which category best fits this file?",
      criteriaText:
        "billing: Invoices, receipts, payments\nbug_report: Crash logs and bug reports\nsource_code: Code and scripts\npersonal: Personal notes and documents",
    },
    {
      id: "q_score",
      type: "score",
      instructions: "Rate the review urgency of this item:",
      criteriaText: "Routine, Soon, Immediate",
    },
  ],
  decisionResult: null,
  // Speech state
  speechModel: "",
  speechText: "",
  speechMode: "speaker", // "speaker" | "file"
  speechFormat: "wav", // "wav" | "pcm"
  speechFilename: "",
  speechResult: null,
  // Live long-task / auto-install progress state
  installing: false,
  longTaskTitle: "",
  longTaskStep: "",
  longTaskPercent: 0,
  longTaskStartedAt: 0,
  longTaskElapsedSec: 0,
  longTaskStepsLog: [],
  lastInstallSummary: null,
  // Meaning search & Web state
  meaningQuery: "",
  meaningMatches: [],
  webQuery: "",
  webResult: null,
  // Model lifecycle state
  pullModelName: "",
  pullResult: null,
  customModelName: "",
  customModelFrom: "lfm3:latest",
  customModelSystem: "You are a helpful coding and file organization assistant.",
  apiKeyInput: "",
  inspectedModelInfo: null,
};

let rootContainer = null;
let assistantTextareaEl = null;
let speechTextareaEl = null;
let liveTickerInterval = null;

function formatElapsedTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}s`;
}

function startLiveTaskTicker(title, initialStep, initialPercent = 8, pollBackend = false) {
  stopLiveTaskTicker();
  uiState.longTaskTitle = title || "Working...";
  uiState.longTaskStep = initialStep || "Processing request...";
  uiState.longTaskPercent = initialPercent;
  uiState.longTaskStartedAt = Date.now();
  uiState.longTaskElapsedSec = 0;
  uiState.longTaskStepsLog = [{ step: uiState.longTaskStep, percent: initialPercent }];

  liveTickerInterval = setInterval(async () => {
    uiState.longTaskElapsedSec = Math.max(0, Math.floor((Date.now() - uiState.longTaskStartedAt) / 1000));
    if (pollBackend) {
      try {
        const st = await call("ollama/installStatus", {});
        if (st?.longTask?.active) {
          uiState.longTaskTitle = st.longTask.title || uiState.longTaskTitle;
          uiState.longTaskStep = st.longTask.step || uiState.longTaskStep;
          uiState.longTaskPercent = typeof st.longTask.percent === "number" ? st.longTask.percent : uiState.longTaskPercent;
          if (Array.isArray(st.longTask.stepsLog) && st.longTask.stepsLog.length > 0) {
            uiState.longTaskStepsLog = st.longTask.stepsLog;
          }
        }
      } catch {
        // ignore transient poll errors while daemon starts
      }
    } else if (uiState.longTaskPercent < 90) {
      uiState.longTaskPercent = Math.min(90, uiState.longTaskPercent + 3);
    }

    const elapsedEl = rootContainer?.querySelector(".ollama-live-elapsed");
    const stepEl = rootContainer?.querySelector(".ollama-live-step");
    const pctEl = rootContainer?.querySelector(".ollama-live-pct");
    const fillEl = rootContainer?.querySelector(".ollama-progress-fill");
    if (elapsedEl) elapsedEl.textContent = `Elapsed: ${formatElapsedTime(uiState.longTaskElapsedSec)}`;
    if (stepEl) stepEl.textContent = uiState.longTaskStep;
    if (pctEl) pctEl.textContent = `${uiState.longTaskPercent}%`;
    if (fillEl) fillEl.style.width = `${Math.max(6, uiState.longTaskPercent)}%`;
  }, 500);
}

function stopLiveTaskTicker() {
  if (liveTickerInterval) {
    clearInterval(liveTickerInterval);
    liveTickerInterval = null;
  }
}

async function copyOllamaOutput(text, label = "Ollama output", btnEl = null) {
  const clean = String(text ?? "");
  if (!clean.trim()) {
    toast("No output to copy yet.");
    return false;
  }
  let copiedOk = false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(clean);
      copiedOk = true;
    } catch {
      // fallback to server clipboard below
    }
  }
  if (!copiedOk) {
    try {
      await call("copytext", { text: clean });
      copiedOk = true;
    } catch {
      copiedOk = false;
    }
  }
  if (btnEl && btnEl instanceof HTMLElement) {
    const origText = btnEl.dataset.origLabel || btnEl.textContent || "📋 Copy";
    btnEl.dataset.origLabel = origText;
    btnEl.textContent = "✓ Copied!";
    btnEl.classList.add("is-copied");
    setTimeout(() => {
      btnEl.textContent = origText;
      btnEl.classList.remove("is-copied");
    }, 1800);
  }
  toast(`Copied ${label} to clipboard (${clean.length.toLocaleString()} chars)`);
  return true;
}

function clearOllamaOutput(scope = "assistant") {
  if (scope === "assistant" || scope === "all") {
    uiState.answerOutput = "";
    uiState.thinkingOutput = "";
    uiState.structuredOutput = null;
    uiState.routeBanner = "";
    uiState.refusalBanner = null;
    uiState.lastAudioUrl = "";
    uiState.autoPlayedAudioUrl = "";
  }
  if (scope === "decision" || scope === "all") {
    uiState.decisionResult = null;
  }
  if (scope === "speech" || scope === "all") {
    uiState.speechResult = null;
    uiState.lastAudioUrl = "";
    uiState.autoPlayedAudioUrl = "";
  }
  if (scope === "meaning" || scope === "all") {
    uiState.meaningMatches = [];
  }
  if (scope === "web" || scope === "all") {
    uiState.webResult = null;
  }
  if (scope === "inspector" || scope === "all") {
    uiState.inspectedModelInfo = null;
  }
  if (scope === "all") {
    uiState.promptText = "";
    uiState.speechText = "";
    if (assistantTextareaEl) assistantTextareaEl.value = "";
    if (speechTextareaEl) speechTextareaEl.value = "";
  }
  toast(scope === "all" ? "Cleared all prompts and Ollama outputs." : "Cleared Ollama output.");
  renderOllamaPanel();
}

async function saveOllamaOutputToFolder(text, baseName = "ollama-output") {
  const clean = String(text ?? "").trim();
  if (!clean) {
    toast("No output to save yet.");
    return;
  }
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const res = await call("phonon/savetxt", {
      text: clean,
      outputDir: currentFolderRel(),
      outputName: `${baseName}-${stamp}`,
    });
    toast(`Saved output to ${res.path}`);
    refresh();
  } catch (err) {
    toast(err.message || "Could not save output to folder", { kind: "error" });
  }
}

async function speakTextWithOllama(text) {
  const clean = String(text ?? "").trim();
  if (!clean) {
    toast("No output text to read aloud.");
    return;
  }
  uiState.loading = true;
  startLiveTaskTicker("Reading Output Aloud", "Synthesizing speech audio for AI output...", 25, false);
  renderOllamaPanel();
  try {
    const res = await call("ollama/speech", {
      model: uiState.speechModel || undefined,
      input: clean,
      voice: uiState.selectedVoice,
      mode: "speaker",
    });
    if (res.audioUrl) {
      uiState.lastAudioUrl = `${res.audioUrl}&token=${encodeURIComponent(getToken())}`;
    }
    toast(`Speaking output aloud with ${res.model || "speech engine"} (${res.voice})`);
  } catch (err) {
    toast(err.message || "Could not speak output", { kind: "error" });
  } finally {
    stopLiveTaskTicker();
    uiState.loading = false;
    renderOllamaPanel();
  }
}

function computeTextTelemetry(text) {
  const s = String(text ?? "");
  if (!s.trim()) return { chars: 0, words: 0, lines: 0 };
  const chars = s.length;
  const words = s.trim().split(/\s+/).filter(Boolean).length;
  const lines = s.split(/\r?\n/).length;
  return { chars, words, lines };
}

function renderFormattedOutputBody(rawText) {
  const text = String(rawText ?? "");
  if (!text.includes("```")) {
    return h("div", { class: "ollama-output-box ollama-prose" }, text);
  }
  const parts = [];
  const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const proseChunk = text.slice(lastIndex, match.index).trim();
      if (proseChunk) {
        parts.push(h("div", { class: "ollama-prose-segment" }, proseChunk));
      }
    }
    const lang = (match[1] || "code").trim();
    const codeBody = match[2] || "";
    parts.push(
      h("div", { class: "ollama-code-block" }, [
        h("div", { class: "ollama-code-header" }, [
          h("span", { class: "ollama-code-lang" }, lang.toUpperCase()),
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-mini",
              title: `Copy ${lang} snippet to clipboard`,
              onclick: (e) => void copyOllamaOutput(codeBody, `${lang} code snippet`, e.currentTarget),
            },
            "📋 Copy Code",
          ),
        ]),
        h("pre", { class: "ollama-code-pre" }, codeBody),
      ]),
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex).trim();
    if (tail) {
      parts.push(h("div", { class: "ollama-prose-segment" }, tail));
    }
  }
  return h("div", { class: "ollama-output-box is-structured" }, parts);
}

function renderStudioOutputConsole({
  title = "Ollama AI Output Console",
  badge = "",
  content = "",
  thinking = "",
  audioUrl = "",
  clearScope = "assistant",
  saveName = "ollama-output",
  showWhenEmpty = false,
  emptyHint = "Output will appear here — use Copy Output, Save to Folder, Speak Output, or Clear Output anytime.",
}) {
  const hasContent = Boolean(String(content || "").trim());
  const hasThinking = Boolean(String(thinking || "").trim());
  if (!hasContent && !hasThinking && !audioUrl && !showWhenEmpty) return null;

  const stats = computeTextTelemetry(content || thinking);
  const combinedCopyText =
    hasThinking && hasContent
      ? `[Step-by-Step Thinking]\n${thinking}\n\n[Final Answer]\n${content}`
      : hasContent
        ? content
        : thinking;

  return h("div", { class: "ollama-output-console", "data-ollama-output-console": clearScope }, [
    h("div", { class: "ollama-output-header" }, [
      h("div", { class: "ollama-output-title-group" }, [
        h("span", { class: "ollama-status-pulse" }),
        h("strong", { class: "ollama-output-title" }, title),
        badge ? h("span", { class: "ollama-pill is-mlx" }, badge) : null,
        hasContent || hasThinking
          ? h(
              "span",
              { class: "ollama-pill is-ram" },
              `${stats.words.toLocaleString()} words • ${stats.chars.toLocaleString()} chars • ${stats.lines} line${stats.lines === 1 ? "" : "s"}`,
            )
          : h("span", { class: "ollama-pill" }, "Ready"),
      ]),
      h("div", { class: "ollama-output-toolbar" }, [
        h(
          "button",
          {
            type: "button",
            class: "ollama-btn is-copy-btn",
            "data-ollama-action": "copy-output",
            disabled: !hasContent && !hasThinking ? "disabled" : null,
            title: "Copy Ollama output to clipboard",
            onclick: (e) => void copyOllamaOutput(hasContent ? content : thinking, title, e.currentTarget),
          },
          "📋 Copy Output",
        ),
        hasThinking
          ? h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ollama-action": "copy-thinking",
                title: "Copy only the step-by-step thinking trace",
                onclick: (e) => void copyOllamaOutput(thinking, "Thinking trace", e.currentTarget),
              },
              "🧠 Copy Thinking",
            )
          : null,
        hasThinking && hasContent
          ? h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ollama-action": "copy-both",
                title: "Copy both Thinking trace and Final Answer",
                onclick: (e) => void copyOllamaOutput(combinedCopyText, "Thinking + Answer", e.currentTarget),
              },
              "📋 Copy Both",
            )
          : null,
        hasContent
          ? h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ollama-action": "speak-output",
                title: "Read this output out loud",
                onclick: () => void speakTextWithOllama(content),
              },
              "🔊 Read Aloud",
            )
          : null,
        hasContent || hasThinking
          ? h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ollama-action": "save-output",
                title: "Save this output as a .txt file in the active folder pane",
                onclick: () => void saveOllamaOutputToFolder(combinedCopyText, saveName),
              },
              "💾 Save to Folder",
            )
          : null,
        h(
          "button",
          {
            type: "button",
            class: "ollama-btn is-danger is-clear-btn",
            "data-ollama-action": "clear-output",
            disabled: !hasContent && !hasThinking && !audioUrl ? "disabled" : null,
            title: "Clear this Ollama output console",
            onclick: () => clearOllamaOutput(clearScope),
          },
          "🧹 Clear Output",
        ),
      ]),
    ]),
    hasThinking
      ? h("details", { class: "ollama-thinking-details", open: "open" }, [
          h("summary", { class: "ollama-thinking-summary" }, [
            h("span", {}, `🧠 Step-by-Step Deep Reasoning Trace (${thinking.length.toLocaleString()} chars)`),
          ]),
          h("div", { class: "ollama-thinking-box" }, thinking),
        ])
      : null,
    hasContent
      ? renderFormattedOutputBody(content)
      : !hasThinking
        ? h("div", { class: "ollama-output-empty" }, emptyHint)
        : null,
    audioUrl
      ? h("div", { class: "ollama-audio-bar" }, [
          h("span", { class: "ollama-pill is-mlx" }, "🔊 Synthesized 24kHz Audio Ready"),
          createAudioPlayerEl(audioUrl),
        ])
      : null,
  ]);
}

async function runOneClickAutoInstall() {
  if (uiState.installing) return;
  const hw = uiState.statusData?.hardware;
  const osLabel = hw?.platform === "win32" ? "Windows" : hw?.platform === "linux" ? "Linux" : "macOS";
  uiState.installing = true;
  uiState.loading = true;
  uiState.lastInstallSummary = null;
  startLiveTaskTicker(
    `1-Click Auto-Installing Ollama & Starter AI Models (${osLabel})`,
    `Preparing ${osLabel} user-space installer, starting daemon, and pulling hardware-matched starter models...`,
    6,
    true,
  );
  renderOllamaPanel();

  try {
    const res = await call("ollama/install", {
      speechModel: uiState.speechModel || undefined,
    });
    uiState.lastInstallSummary = res;
    toast(
      `Ollama AI installed & ready on ${osLabel}! Configured models: ${(res.pulledModels || []).join(", ") || res.speechModelConfigured}`,
    );
    await refreshOllamaStatus(true);
  } catch (err) {
    toast(err.message || "Auto-install failed", { kind: "error" });
  } finally {
    stopLiveTaskTicker();
    uiState.installing = false;
    uiState.loading = false;
    renderOllamaPanel();
  }
}

function createAudioPlayerEl(audioUrl) {
  if (!audioUrl) return null;
  const shouldAutoplay = uiState.autoPlayedAudioUrl !== audioUrl;
  if (shouldAutoplay) {
    uiState.autoPlayedAudioUrl = audioUrl;
  }
  return h("audio", {
    controls: "controls",
    autoplay: shouldAutoplay ? "autoplay" : null,
    src: audioUrl,
  });
}

function currentFolderRel() {
  return currentPath() || state.location?.path || state.home || "/";
}

function resolveMatchTargetPaths(m) {
  const sep = state.sep || "/";
  const baseDir = (currentPath() || state.location?.path || state.home || "/").replace(/[\\/]+$/, "");
  const rawFile = String(m.absPath || m.path || "").trim();
  const isAbs = rawFile.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawFile);
  const fullFilePath = isAbs
    ? rawFile
    : rawFile
      ? `${baseDir}${sep}${rawFile.replace(/^[.][\\/]/, "")}`
      : baseDir;

  const rawFolder = String(m.folderPath || "").trim();
  const isFolderAbs = rawFolder.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawFolder);
  if (isFolderAbs) {
    return { folderPath: rawFolder, filePath: fullFilePath };
  }
  const lastSlash = Math.max(fullFilePath.lastIndexOf("/"), fullFilePath.lastIndexOf("\\"));
  const folderPath = lastSlash > 0 ? fullFilePath.slice(0, lastSlash) : baseDir || "/";
  return { folderPath, filePath: fullFilePath };
}

function selectedFilePaths() {
  return selectedEntries().map((e) => e.path);
}

function createBadgeEl(badge) {
  const bLower = String(badge || "").toLowerCase();
  const extraClass =
    bLower === "mlx"
      ? " badge-mlx"
      : bLower === "decision"
        ? " badge-decision"
        : bLower === "speech"
          ? " badge-speech"
          : bLower === "vision"
            ? " badge-vision"
            : "";
  return h("span", { class: `ollama-cap-badge${extraClass}` }, badge);
}

export async function refreshOllamaStatus(silent = false) {
  if (!silent) uiState.loading = true;
  renderOllamaPanel();
  try {
    const res = await call("ollama/status", {});
    uiState.statusData = res;
    uiState.pendingActions = Array.isArray(res.pendingActions) ? res.pendingActions : [];
    if (!uiState.selectedModel && Array.isArray(res.models) && res.models.length > 0) {
      const chatModel = res.models.find((m) => m.badges?.includes("Chat")) || res.models[0];
      if (chatModel) uiState.selectedModel = chatModel.name;
    }
    if (!uiState.decisionModel && Array.isArray(res.models)) {
      const decModel = res.models.find((m) => m.badges?.includes("Decision"));
      if (decModel) uiState.decisionModel = decModel.name;
    }
    if (!uiState.speechModel && res.speechCapabilities?.defaultSpeechModel) {
      uiState.speechModel = res.speechCapabilities.defaultSpeechModel;
    }
  } catch (err) {
    if (!silent) toast(err.message || "Could not load Ollama status", { kind: "error" });
  } finally {
    uiState.loading = false;
    renderOllamaPanel();
  }
}

async function runSmartAutoRouter(customPrompt) {
  const paths = selectedFilePaths();
  const livePrompt =
    customPrompt !== undefined
      ? String(customPrompt).trim()
      : String(assistantTextareaEl ? assistantTextareaEl.value : uiState.promptText || "").trim();
  if (customPrompt === undefined) {
    uiState.promptText = livePrompt;
  }
  if (!livePrompt && paths.length === 0) {
    toast("Type a plain-English request or select a file to read aloud.");
    return;
  }
  const prompt = livePrompt;
  uiState.loading = true;
  uiState.refusalBanner = null;
  uiState.lastAudioUrl = "";
  uiState.autoPlayedAudioUrl = "";
  uiState.routeBanner = !prompt
    ? `Reading selected file (${paths[0]}) aloud with Speech Engine (${uiState.speechModel || "auto"})...`
    : "Routing your request to the optimal Ollama capability...";
  startLiveTaskTicker(
    !prompt ? "Synthesizing Speech for Selected File" : "Running Ollama AI Capability Router",
    uiState.routeBanner,
    18,
    false,
  );
  renderOllamaPanel();

  try {
    if (prompt && (uiState.schemaPreset || uiState.useWebSearch || uiState.thinkEnabled)) {
      const chatRes = await call("ollama/chat", {
        model: uiState.selectedModel || undefined,
        prompt,
        paths,
        think: uiState.thinkEnabled,
        speakReply: uiState.speakReply,
        voice: uiState.selectedVoice,
        schemaPreset: uiState.schemaPreset || undefined,
        useWebSearch: uiState.useWebSearch,
        enableTools: true,
      });
      uiState.routeBanner = `Executed via /api/chat (${chatRes.model}, num_ctx=${chatRes.enforcedNumCtx}, think=${chatRes.thinkEnabled})`;
      uiState.thinkingOutput = chatRes.thinkingText || "";
      uiState.answerOutput = chatRes.content || "";
      uiState.structuredOutput = chatRes.structuredJson || null;
      if (Array.isArray(chatRes.pendingActions) && chatRes.pendingActions.length > 0) {
        uiState.pendingActions = chatRes.pendingActions;
      }
      if (chatRes.speechResult?.audioUrl) {
        uiState.lastAudioUrl = `${chatRes.speechResult.audioUrl}&token=${encodeURIComponent(getToken())}`;
      }
    } else {
      const routed = await call("ollama/route", {
        prompt,
        paths,
        dirPath: currentFolderRel(),
        model: uiState.selectedModel || undefined,
        speechModel: uiState.speechModel || undefined,
        voice: uiState.selectedVoice,
        speakReply: uiState.speakReply,
      });
      uiState.routeBanner = routed.routeExplanation || `Routed to ${routed.routedCapability}`;
      const r = routed.result || {};
      if (routed.routedCapability === "speech") {
        uiState.thinkingOutput = "";
        uiState.answerOutput = `Speech Read-Aloud (${r.model || "speech"}, voice: ${r.voice}, ${r.chunksCount} chunk(s), ~${r.durationSecondsEstimate}s):\n\n${r.cleanedText}`;
        uiState.lastAudioUrl = r.audioUrl ? `${r.audioUrl}&token=${encodeURIComponent(getToken())}` : "";
        uiState.lastSavedAudioPath = r.savedRelativePath || "";
        if (r.savedRelativePath) refresh();
      } else if (routed.routedCapability === "decision") {
        uiState.decisionResult = r;
        uiState.answerOutput = JSON.stringify(r.answers, null, 2);
      } else if (routed.routedCapability === "semantic_search") {
        uiState.meaningMatches = r.matches || [];
        uiState.answerOutput = (r.matches || [])
          .map((m, idx) => `${idx + 1}. ${m.path} (similarity: ${(m.similarity * 100).toFixed(1)}%)\n   ${m.preview}`)
          .join("\n\n");
      } else {
        uiState.thinkingOutput = r.thinkingText || "";
        uiState.answerOutput = r.content || JSON.stringify(r, null, 2);
        uiState.structuredOutput = r.structuredJson || null;
        if (Array.isArray(r.pendingActions) && r.pendingActions.length > 0) {
          uiState.pendingActions = r.pendingActions;
        }
        if (r.speechResult?.audioUrl) {
          uiState.lastAudioUrl = `${r.speechResult.audioUrl}&token=${encodeURIComponent(getToken())}`;
        }
      }
    }
  } catch (err) {
    if (err.code === "HARDWARE_RAM_REFUSAL" || err.code === "HARDWARE_MLX_EXCLUSIVITY") {
      uiState.refusalBanner = {
        code: err.code,
        message: err.message,
      };
    } else {
      toast(err.message || "Request failed", { kind: "error" });
      uiState.answerOutput = `Error (${err.code || "ERR"}): ${err.message}`;
    }
  } finally {
    stopLiveTaskTicker();
    uiState.loading = false;
    renderOllamaPanel();
  }
}

async function runLiveStreamChat() {
  const prompt = String(assistantTextareaEl ? assistantTextareaEl.value : uiState.promptText || "").trim();
  uiState.promptText = prompt;
  if (!prompt) {
    if (selectedFilePaths().length > 0) {
      await runSmartAutoRouter("");
      return;
    }
    toast("Enter a message to stream or select a file to read aloud.");
    return;
  }
  uiState.loading = true;
  uiState.refusalBanner = null;
  uiState.lastAudioUrl = "";
  uiState.autoPlayedAudioUrl = "";
  uiState.thinkingOutput = "";
  uiState.answerOutput = "";
  uiState.routeBanner = "Streaming live tokens from /api/chat...";
  renderOllamaPanel();

  try {
    const res = await fetch("/api/ollama/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": getToken(),
      },
      body: JSON.stringify({
        model: uiState.selectedModel || undefined,
        prompt,
        paths: selectedFilePaths(),
        think: uiState.thinkEnabled,
        speakReply: uiState.speakReply,
        useWebSearch: uiState.useWebSearch,
      }),
    });

    if (!res.ok || !res.body) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `HTTP ${res.status}`;
      const code = errData?.error?.code || "STREAM_ERR";
      if (code === "HARDWARE_RAM_REFUSAL" || code === "HARDWARE_MLX_EXCLUSIVITY") {
        uiState.refusalBanner = { code, message: msg };
      } else {
        uiState.answerOutput = `Stream Error: ${msg}`;
      }
      uiState.loading = false;
      renderOllamaPanel();
      return;
    }

    const usedModel = res.headers.get("X-Ollama-Model") || uiState.selectedModel || "mlx";
    const usedCtx = res.headers.get("X-Ollama-Num-Ctx") || "8192";
    uiState.routeBanner = `Live Streaming via /api/chat (Model: ${usedModel}, Context: ${usedCtx} tokens)`;
    renderOllamaPanel();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      let updatedThinking = false;
      let updatedAnswer = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const pkt = JSON.parse(trimmed);
          if (pkt.message?.thinking) {
            uiState.thinkingOutput += pkt.message.thinking;
            updatedThinking = true;
          }
          if (pkt.message?.content) {
            uiState.answerOutput += pkt.message.content;
            updatedAnswer = true;
          }
        } catch {
          // ignore partial JSON line
        }
      }
      if (updatedThinking || updatedAnswer) {
        const thinkingBox = rootContainer?.querySelector(".ollama-thinking-box");
        const outputBox = rootContainer?.querySelector(".ollama-output-box");
        if ((updatedThinking && !thinkingBox) || (updatedAnswer && !outputBox)) {
          renderOllamaPanel();
        } else {
          if (updatedThinking && thinkingBox) {
            thinkingBox.textContent = uiState.thinkingOutput;
          }
          if (updatedAnswer && outputBox) {
            outputBox.textContent = uiState.answerOutput;
          }
        }
      }
    }

    if (uiState.speakReply && uiState.answerOutput.trim()) {
      const spk = await call("ollama/speech", {
        input: uiState.answerOutput,
        voice: uiState.selectedVoice,
        mode: "speaker",
        playOnServer: false,
      });
      if (spk.audioUrl) {
        uiState.lastAudioUrl = `${spk.audioUrl}&token=${encodeURIComponent(getToken())}`;
      }
    }
  } catch (err) {
    uiState.answerOutput = `Stream failed: ${err.message}`;
  } finally {
    uiState.loading = false;
    renderOllamaPanel();
  }
}

function renderHeroBanner() {
  const hw = uiState.statusData?.hardware;
  const ver = uiState.statusData?.version;
  const running = uiState.statusData?.running;
  const speechCaps = uiState.statusData?.speechCapabilities;

  const pills = [];
  if (hw) {
    if (hw.isAppleSiliconMac) {
      pills.push(h("span", { class: "ollama-pill is-mlx" }, `Apple Silicon MLX Exclusive (${hw.cpuModel})`));
    } else {
      const osTag = hw.platform === "win32" ? "Windows" : hw.platform === "linux" ? "Linux" : hw.platform;
      pills.push(h("span", { class: "ollama-pill" }, `${osTag}/${hw.arch} (${hw.cpuCores} cores)`));
    }
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-ram" },
        `70% Safe RAM Ceiling: ${hw.safeMemoryBudgetGb} GB / ${hw.totalRamGb} GB (${hw.tierLabel || hw.ramTier})`,
      ),
    );
  }
  if (ver) {
    pills.push(
      h(
        "span",
        { class: `ollama-pill${ver.reachable ? "" : " is-warn"}` },
        ver.reachable ? `Ollama v${ver.version}` : "Ollama Offline — 1-Click Auto-Install Ready",
      ),
    );
  }
  if (speechCaps) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-mlx" },
        speechCaps.phononSupported
          ? "TTS: Phonon MLX + Text-to-Audio LLMs"
          : `TTS: Cross-Platform Text-to-Audio LLM (${speechCaps.defaultSpeechModel})`,
      ),
    );
  }
  if (running && running.models?.length > 0) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-cloud" },
        `In RAM: ${running.models.length} model(s) (${running.totalMemoryUsedGb} GB)`,
      ),
    );
  }

  return h("div", { class: "ollama-hero-banner" }, [
    h("div", { class: "ollama-hero-left" }, [
      h("div", { class: "ollama-hero-title-row" }, [
        uiState.loading || uiState.installing ? h("span", { class: "ollama-spinner", title: "Live AI / Install Activity in Progress" }) : h("span", { class: "ollama-status-pulse", title: "Ollama AI Router Active" }),
        h("span", { class: "ollama-hero-title" }, "Ollama AI Assistant & Full Capability Router"),
        ...pills,
      ]),
      h(
        "div",
        { class: "ollama-hero-sub" },
        "Click any file or type plain English — routes automatically across Chat, Thinking, Vision, SystemOne Decision, Cross-Platform Speech / Text-to-Audio LLMs, Meaning Search, Web & Cloud.",
      ),
    ]),
    h("div", { class: "ollama-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          title: "1-Click Auto-Install Ollama & OS-Matched Starter Models (Linux ~/.local/bin, Windows winget/OllamaSetup, macOS Homebrew/Bundle)",
          onclick: () => void runOneClickAutoInstall(),
        },
        uiState.installing
          ? [h("span", { class: "ollama-spinner" }), " Auto-Installing..."]
          : "⚡ 1-Click Auto-Install & Setup",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-danger",
          title: "Unload running models from RAM immediately with keep_alive: 0",
          onclick: async () => {
            try {
              const res = await call("ollama/freeRam", {});
              toast(
                res.unloaded?.length
                  ? `Freed ${res.freedGb} GB RAM (unloaded ${res.unloaded.join(", ")})`
                  : "No models were sitting in RAM.",
              );
              void refreshOllamaStatus(true);
            } catch (e) {
              toast(e.message, { kind: "error" });
            }
          },
        },
        "Free Up RAM (keep_alive: 0)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => void refreshOllamaStatus(false),
        },
        uiState.loading ? [h("span", { class: "ollama-spinner" }), " Working..."] : "Refresh Status",
      ),
    ]),
  ]);
}

function renderLiveActivityBanner() {
  const backendTask = uiState.statusData?.longTask;
  const isActive = uiState.loading || uiState.installing || Boolean(backendTask?.active);
  if (!isActive) return null;

  const title = uiState.longTaskTitle || backendTask?.title || "Ollama AI Operation in Progress";
  const step = uiState.longTaskStep || backendTask?.step || uiState.routeBanner || "Processing request...";
  const pct = Math.max(6, Math.min(100, Number(uiState.longTaskPercent || backendTask?.percent || 15)));
  const elapsedSec =
    uiState.longTaskElapsedSec ||
    (backendTask?.elapsedMs ? Math.floor(backendTask.elapsedMs / 1000) : 0);
  const stepsLog =
    Array.isArray(uiState.longTaskStepsLog) && uiState.longTaskStepsLog.length > 0
      ? uiState.longTaskStepsLog
      : Array.isArray(backendTask?.stepsLog)
        ? backendTask.stepsLog
        : [];

  return h("div", { class: "ollama-live-progress-banner", role: "status", "aria-live": "polite" }, [
    h("div", { class: "ollama-row" }, [
      h("span", { class: "ollama-spinner" }),
      h("strong", {}, title),
      h("span", { class: "ollama-pill is-mlx ollama-live-pct" }, `${pct}%`),
      h("span", { class: "ollama-pill is-ram ollama-live-elapsed" }, `Elapsed: ${formatElapsedTime(elapsedSec)}`),
      h("span", { class: "ollama-pill" }, "Live Activity — App is NOT Frozen"),
    ]),
    h("div", { class: "ollama-live-step" }, step),
    h("div", { class: "ollama-progress-track" }, [
      h("div", { class: "ollama-progress-fill", style: `width: ${pct}%;` }),
    ]),
    stepsLog.length > 1
      ? h(
          "div",
          { class: "ollama-step-log" },
          stepsLog.slice(-5).map((entry) => h("div", {}, `• [${entry.percent ?? pct}%] ${entry.step}`)),
        )
      : null,
  ]);
}

function renderCrossPlatformSetupBanner() {
  const inst = uiState.statusData?.installStatus;
  const ver = uiState.statusData?.version;
  const models = uiState.statusData?.models || [];
  const needsSetup = inst && (!inst.binaryInstalled || !ver?.reachable || models.length === 0);
  if (!needsSetup && !uiState.lastInstallSummary) return null;

  const osName = inst?.platform === "win32" ? "Windows" : inst?.platform === "linux" ? "Linux" : "macOS";
  return h("div", { class: "ollama-autoinstall-card" }, [
    h("div", { class: "ollama-row" }, [
      h("span", { class: "ollama-status-pulse" }),
      h(
        "strong",
        {},
        needsSetup
          ? `1-Click ${osName} Auto-Install & Starter Model Setup`
          : `Ollama AI Auto-Setup Completed on ${osName}`,
      ),
      h("span", { class: "ollama-pill is-mlx" }, inst?.installMethodLabel || `${osName} User-Space Auto-Installer`),
    ]),
    h(
      "div",
      {},
      inst?.platformSpeechNote ||
        `Automatically installs Ollama in user space, starts ollama serve, and pulls hardware-matched starter models (${(inst?.recommendedStarterModels || []).join(", ")}).`,
    ),
    h("div", { class: "ollama-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          disabled: uiState.installing ? "disabled" : null,
          onclick: () => void runOneClickAutoInstall(),
        },
        uiState.installing
          ? [h("span", { class: "ollama-spinner" }), ` Installing on ${osName}...`]
          : `⚡ 1-Click Auto-Install Ollama & Starter Models on ${osName}`,
      ),
      inst?.recommendedStarterModels?.length
        ? h(
            "span",
            { class: "ollama-pill" },
            `Starter Models: ${inst.recommendedStarterModels.join(", ")}`,
          )
        : null,
    ]),
  ]);
}

function renderModeTabs() {
  const tabs = [
    { id: "assistant", label: "1. Ask Anything (Auto-Router & Chat)" },
    { id: "decision", label: "2. Decision / SystemOne (/v1/systemone)" },
    { id: "speech", label: "3. Speech & Text-to-Audio LLMs" },
    { id: "meaning", label: "4. Meaning Search & Web (/api/embed)" },
    { id: "models", label: "5. Models, Auto-Install & Hardware Guard" },
  ];
  return h(
    "div",
    { class: "ollama-mode-nav" },
    tabs.map((t) =>
      h(
        "button",
        {
          type: "button",
          class: `ollama-mode-btn${uiState.subTab === t.id ? " is-active" : ""}`,
          onclick: () => {
            uiState.subTab = t.id;
            renderOllamaPanel();
          },
        },
        t.label,
      ),
    ),
  );
}

function renderSelectedFilesStrip() {
  const sel = selectedFilePaths();
  const folder = currentFolderRel();
  return h("div", { class: "ollama-context-strip" }, [
    h("div", { class: "ollama-chip-list" }, [
      h("strong", {}, `Active Folder: ${folder}`),
      h("span", {}, " | Selected Files:"),
      ...(sel.length > 0
        ? sel.slice(0, 6).map((p) => h("span", { class: "ollama-file-chip" }, p.split("/").pop() || p))
        : [h("span", {}, "None (click any file or image in the file list to inspect it)")]),
    ]),
  ]);
}

function renderRefusalBanner() {
  if (!uiState.refusalBanner) return null;
  const hw = uiState.statusData?.hardware;
  const suggestedLocal = hw?.safeMemoryBudgetGb >= 4.2 ? "lfm3-vl:2b-mlx-bf16" : "lfm3:latest";
  return h("div", { class: "ollama-refusal-banner" }, [
    h("strong", {}, "Polite Hardware Safety Protection Triggered"),
    h("div", {}, uiState.refusalBanner.message),
    h("div", { class: "ollama-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: () => {
            uiState.selectedModel = suggestedLocal;
            uiState.refusalBanner = null;
            toast(`Switched to hardware-approved MLX model: ${suggestedLocal}`);
            renderOllamaPanel();
          },
        },
        `Use Best Fitting Local Model (${suggestedLocal})`,
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => {
            uiState.selectedModel = "gemma4:cloud";
            uiState.refusalBanner = null;
            toast("Switched to gemma4:cloud (0 GB local RAM)");
            renderOllamaPanel();
          },
        },
        "Run gemma4:cloud Instead (0 Local RAM)",
      ),
    ]),
  ]);
}

function renderPendingConfirmations() {
  const pending = (uiState.pendingActions || []).filter((a) => a.status === "pending");
  if (pending.length === 0) return null;
  return h(
    "div",
    { class: "ollama-card" },
    pending.map((act) =>
      h("div", { class: "ollama-confirm-card" }, [
        h("strong", {}, `Visual Confirmation Required: ${act.title}`),
        h("div", {}, act.description),
        h("div", { class: "ollama-row" }, [
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-primary",
              onclick: async () => {
                try {
                  await call("ollama/tool/confirm", { actionId: act.actionId, decision: "confirm" });
                  toast(`Executed: ${act.title}`);
                  refresh();
                  void refreshOllamaStatus(true);
                } catch (e) {
                  toast(e.message, { kind: "error" });
                }
              },
            },
            "Confirm & Execute Action",
          ),
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-danger",
              onclick: async () => {
                await call("ollama/tool/confirm", { actionId: act.actionId, decision: "cancel" });
                toast("Cancelled tool action.");
                void refreshOllamaStatus(true);
              },
            },
            "Cancel",
          ),
        ]),
      ]),
    ),
  );
}

function renderAssistantTab() {
  const models = (uiState.statusData?.models || []).filter((m) => !m.badges?.includes("Speech") || m.badges?.includes("Chat"));
  const voices = uiState.statusData?.phononVoices || ["default", "Zoey", "Easton", "Freya"];
  const installedModelNames = new Set(models.map((m) => m.name));

  const modelOptions = [
    h("option", { value: "" }, "Auto-Select Best MLX / Fitting Model"),
    ...models.map((m) =>
      h(
        "option",
        {
          value: m.name,
          selected: uiState.selectedModel === m.name ? "selected" : null,
        },
        `${m.name} (${m.parameterSize}, ~${m.estimatedRamGb} GB) [${(m.badges || []).join(", ")}]`,
      ),
    ),
    !installedModelNames.has("lfm3-omni:latest")
      ? h(
          "option",
          {
            value: "lfm3-omni:latest",
            selected: uiState.selectedModel === "lfm3-omni:latest" ? "selected" : null,
          },
          "lfm3-omni:latest (Liquid LFM3-Omni 2B — Omni Audio, Speech, Vision & Chat)",
        )
      : null,
    !installedModelNames.has("qwen3.5:4b")
      ? h(
          "option",
          {
            value: "qwen3.5:4b",
            selected: uiState.selectedModel === "qwen3.5:4b" ? "selected" : null,
          },
          "qwen3.5:4b (Qwen 3.5 4B — Compact Multimodal for Smaller Memory Computers)",
        )
      : null,
    !installedModelNames.has("qwen3.5:latest")
      ? h(
          "option",
          {
            value: "qwen3.5:latest",
            selected: uiState.selectedModel === "qwen3.5:latest" ? "selected" : null,
          },
          "qwen3.5:latest (Qwen 3.5 — Multimodal Vision, Deep Thinking & Tools)",
        )
      : null,
    h(
      "option",
      {
        value: "gemma4:cloud",
        selected: uiState.selectedModel === "gemma4:cloud" ? "selected" : null,
      },
      "gemma4:cloud (Hybrid Cloud — 0 GB Local RAM)",
    ),
  ].filter(Boolean);

  const quickPrompts = [
    { label: "Summarize Selected File", text: "Summarize the selected file in plain English and highlight key takeaways." },
    { label: "Read Out Loud (Phonon)", text: "Read this out loud with natural date pronunciation." },
    { label: "Crash Check (SystemOne noul)", text: "Does this file contain a crash, bug, or error? Return probability." },
    { label: "Auto-Sort Category (SystemOne choice)", text: "Classify into billing, bug_report, source_code, or personal." },
    { label: "Score Urgency (SystemOne score)", text: "Score urgency across Routine, Soon, or Immediate." },
    { label: "Batch Rename Plan (JSON)", text: "Create a clean batch-rename JSON plan for the selected files." },
    { label: "Deep-Think Code Debug", text: "Debug this code step-by-step and explain how to fix any edge cases." },
  ];

  const sel = selectedFilePaths();
  assistantTextareaEl = h(
    "textarea",
    {
      class: "ollama-textarea",
      placeholder:
        sel.length > 0
          ? `Leave blank to read selected file (${sel[0]}) aloud, or ask anything in plain English (e.g., 'Summarize this file', 'Does this receipt image show a refund?', 'Create a batch rename JSON plan')...`
          : "Ask anything in plain English (e.g., 'Summarize this file', 'Read this out loud', 'Does this receipt image show a refund?', 'Find the file where I wrote the login logic', or 'Create a batch rename JSON plan')...",
      oninput: (e) => {
        uiState.promptText = e.target.value;
      },
      onchange: (e) => {
        uiState.promptText = e.target.value;
      },
    },
    uiState.promptText,
  );

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Conversational AI Assistant & Automatic Capability Router"),
      h("span", { class: "ollama-pill is-mlx" }, "Zero-JSON Plain English Mode"),
    ]),
    h(
      "div",
      { class: "ollama-quick-prompts" },
      quickPrompts.map((qp) =>
        h(
          "button",
          {
            type: "button",
            class: "ollama-quick-chip",
            onclick: () => {
              void runSmartAutoRouter(qp.text);
            },
          },
          qp.label,
        ),
      ),
    ),
    assistantTextareaEl,
    h("div", { class: "ollama-row" }, [
      h(
        "select",
        {
          class: "ollama-select",
          onchange: (e) => {
            uiState.selectedModel = e.target.value;
          },
        },
        modelOptions,
      ),
      h("label", { class: "ollama-row" }, [
        h("input", {
          type: "checkbox",
          checked: uiState.thinkEnabled ? "checked" : null,
          onchange: (e) => {
            uiState.thinkEnabled = e.target.checked;
          },
        }),
        h("span", {}, "Deep Thinking (think: true)"),
      ]),
      h("label", { class: "ollama-row" }, [
        h("input", {
          type: "checkbox",
          checked: uiState.speakReply ? "checked" : null,
          onchange: (e) => {
            uiState.speakReply = e.target.checked;
          },
        }),
        h("span", {}, "Speak Reply (Phonon TTS, forces think: false)"),
      ]),
      h(
        "select",
        {
          class: "ollama-select",
          title: "Phonon Voice",
          onchange: (e) => {
            uiState.selectedVoice = e.target.value;
          },
        },
        voices.slice(0, 16).map((v) =>
          h(
            "option",
            {
              value: v,
              selected: uiState.selectedVoice === v ? "selected" : null,
            },
            `Voice: ${v}`,
          ),
        ),
      ),
      h("label", { class: "ollama-row" }, [
        h("input", {
          type: "checkbox",
          checked: uiState.useWebSearch ? "checked" : null,
          onchange: (e) => {
            uiState.useWebSearch = e.target.checked;
          },
        }),
        h("span", {}, "Web Search (Enforces 32,000+ num_ctx)"),
      ]),
      h(
        "select",
        {
          class: "ollama-select",
          onchange: (e) => {
            uiState.schemaPreset = e.target.value;
          },
        },
        [
          h("option", { value: "" }, "Output: Natural Text / Auto"),
          h(
            "option",
            {
              value: "batch_rename_plan",
              selected: uiState.schemaPreset === "batch_rename_plan" ? "selected" : null,
            },
            "Structured JSON: Batch Rename Plan",
          ),
          h(
            "option",
            {
              value: "folder_organization_plan",
              selected: uiState.schemaPreset === "folder_organization_plan" ? "selected" : null,
            },
            "Structured JSON: Folder Organization Plan",
          ),
          h(
            "option",
            {
              value: "table_extraction",
              selected: uiState.schemaPreset === "table_extraction" ? "selected" : null,
            },
            "Structured JSON: Table Extraction",
          ),
        ],
      ),
    ]),
    h("div", { class: "ollama-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: () => void runSmartAutoRouter(),
        },
        uiState.loading ? [h("span", { class: "ollama-spinner" }), " Running..."] : "Send & Auto-Route Request",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => void runLiveStreamChat(),
        },
        "Stream Live Tokens (/api/chat)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => {
            uiState.promptText = "";
            if (assistantTextareaEl) assistantTextareaEl.value = "";
            if (selectedFilePaths().length > 0) {
              void runSmartAutoRouter("");
            } else {
              renderOllamaPanel();
            }
          },
        },
        sel.length > 0 ? "Clear & Read Selected File Aloud" : "Clear Prompt",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Copy AI output to system clipboard",
          onclick: (e) => void copyOllamaOutput(uiState.answerOutput || uiState.thinkingOutput, "AI response", e.currentTarget),
        },
        "📋 Copy Output",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Clear AI output console",
          onclick: () => clearOllamaOutput("assistant"),
        },
        "🧹 Clear Output",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Clear prompt, thinking, and all output panels",
          onclick: () => clearOllamaOutput("all"),
        },
        "🧹 Clear All",
      ),
    ]),
    renderStudioOutputConsole({
      title: "AI Assistant & Capability Router Output",
      badge: uiState.routeBanner || "Ready",
      content: uiState.answerOutput,
      thinking: uiState.thinkingOutput,
      audioUrl: uiState.lastAudioUrl,
      clearScope: "assistant",
      saveName: "ollama-assistant-output",
      showWhenEmpty: true,
    }),
  ]);
}

function parseDecisionQuestionsFromUi() {
  return uiState.decisionQuestions.map((q, idx) => {
    const id = q.id || `q_${idx + 1}`;
    if (q.type === "noul") {
      return { id, type: "noul", instructions: q.instructions };
    }
    if (q.type === "choice") {
      const criteria = {};
      for (const line of String(q.criteriaText || "").split("\n")) {
        const clean = line.trim();
        if (!clean) continue;
        const colonIdx = clean.indexOf(":");
        if (colonIdx > 0) {
          const label = clean.slice(0, colonIdx).trim();
          const desc = clean.slice(colonIdx + 1).trim();
          criteria[label] = desc || label;
        } else {
          criteria[clean] = `Category ${clean}`;
        }
      }
      return { id, type: "choice", instructions: q.instructions, criteria };
    }
    const levels = String(q.criteriaText || "")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { id, type: "score", instructions: q.instructions, criteria: levels };
  });
}

function renderDecisionTab() {
  const decisionModels = ["d3:9b-mxfp8", "nimble", "clef-flash", "clef", "tev1", "clef:cloud"];

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Decision / SystemOne Engine (POST /v1/systemone)"),
      h(
        "span",
        { class: "ollama-pill is-mlx" },
        "Multi-Question noul (0..1) + choice (2..26 labels) + score (2..10 rubric levels)",
      ),
    ]),
    h("div", { class: "ollama-row" }, [
      h("span", {}, "Decision Model:"),
      h(
        "select",
        {
          class: "ollama-select",
          onchange: (e) => {
            uiState.decisionModel = e.target.value;
          },
        },
        [
          h("option", { value: "" }, "Auto-Select Best Installed Decision Model"),
          ...decisionModels.map((m) =>
            h(
              "option",
              {
                value: m,
                selected: uiState.decisionModel === m ? "selected" : null,
              },
              m,
            ),
          ),
        ],
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => {
            uiState.decisionQuestions.push({
              id: `q_${uiState.decisionQuestions.length + 1}`,
              type: "noul",
              instructions: "Is this file safe to archive?",
              criteriaText: "",
            });
            renderOllamaPanel();
          },
        },
        "+ Add Question",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: async () => {
            uiState.loading = true;
            renderOllamaPanel();
            try {
              const questions = parseDecisionQuestionsFromUi();
              const res = await call("ollama/decision", {
                model: uiState.decisionModel || undefined,
                paths: selectedFilePaths(),
                state: uiState.promptText || "Evaluate the selected workspace files or text.",
                questions,
              });
              uiState.decisionResult = res;
              toast(`SystemOne scored ${Object.keys(res.answers || {}).length} question(s) via ${res.model}`);
            } catch (e) {
              toast(e.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderOllamaPanel();
            }
          },
        },
        uiState.loading ? "Scoring..." : "Run Multi-Question SystemOne Check",
      ),
      uiState.decisionResult
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn",
              onclick: () => clearOllamaOutput("decision"),
            },
            "🧹 Clear Decision Output",
          )
        : null,
    ]),
    ...uiState.decisionQuestions.map((q, idx) =>
      h("div", { class: "ollama-model-card" }, [
        h("div", { class: "ollama-row" }, [
          h("strong", {}, `Question #${idx + 1} (${q.id})`),
          h(
            "select",
            {
              class: "ollama-select",
              onchange: (e) => {
                q.type = e.target.value;
                if (q.type === "choice" && !q.criteriaText) {
                  q.criteriaText =
                    "billing: Invoices & receipts\nbug_report: Crash logs\nsource_code: Code files\npersonal: Notes";
                } else if (q.type === "score" && !q.criteriaText) {
                  q.criteriaText = "Routine, Soon, Immediate";
                }
                renderOllamaPanel();
              },
            },
            [
              h(
                "option",
                { value: "noul", selected: q.type === "noul" ? "selected" : null },
                "noul (Yes/No Probability 0..1)",
              ),
              h(
                "option",
                { value: "choice", selected: q.type === "choice" ? "selected" : null },
                "choice (2..26 Named Labels)",
              ),
              h(
                "option",
                { value: "score", selected: q.type === "score" ? "selected" : null },
                "score (2..10 Ordered Rubric Levels)",
              ),
            ],
          ),
          uiState.decisionQuestions.length > 1
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-danger",
                  onclick: () => {
                    uiState.decisionQuestions.splice(idx, 1);
                    renderOllamaPanel();
                  },
                },
                "Remove",
              )
            : null,
        ]),
        h("input", {
          class: "ollama-input",
          value: q.instructions,
          placeholder: "Question instructions...",
          oninput: (e) => {
            q.instructions = e.target.value;
          },
        }),
        q.type !== "noul"
          ? h(
              "textarea",
              {
                class: "ollama-textarea",
                placeholder:
                  q.type === "choice"
                    ? "One label: description per line (2 to 26 labels)"
                    : "Comma-separated ordered rubric levels from lowest to highest (2 to 10 levels)",
                oninput: (e) => {
                  q.criteriaText = e.target.value;
                },
              },
              q.criteriaText,
            )
          : null,
      ]),
    ),
    uiState.decisionResult
      ? renderStudioOutputConsole({
          title: "SystemOne Decision Engine Output",
          badge: `Model: ${uiState.decisionResult.model}`,
          content: JSON.stringify(uiState.decisionResult.answers, null, 2),
          clearScope: "decision",
          saveName: "systemone-decision-output",
        })
      : null,
  ]);
}

function renderSpeechTab() {
  const voices = uiState.statusData?.phononVoices || ["default", "Zoey", "Easton", "Freya"];
  const speechCaps = uiState.statusData?.speechCapabilities;
  const availableSpeechModels = speechCaps?.availableSpeechModels || [
    { name: "phonon", label: "Gradium Phonon TTS (Apple Silicon MLX)" },
    { name: "lfm3-omni:latest", label: "Liquid LFM3-Omni 2B (Cross-Platform Omni Audio, Speech, Vision & Chat LLM)" },
    { name: "orpheus:latest", label: "Orpheus TTS 3B (Cross-Platform Text-to-Audio LLM)" },
    { name: "kokoro:latest", label: "Kokoro 82M TTS (Ultra-Light Cross-Platform Speech)" },
    { name: "oute-tts:latest", label: "OuteTTS 1B (Cross-Platform Voice & Audio LLM)" },
    { name: "parler-tts:latest", label: "Parler-TTS Mini (Prompt-Controlled Text-to-Audio)" },
  ];
  const activeSpeechModel = uiState.speechModel || speechCaps?.defaultSpeechModel || "phonon";
  const sel = selectedFilePaths();

  speechTextareaEl = h(
    "textarea",
    {
      class: "ollama-textarea",
      placeholder:
        sel.length > 0
          ? `Leave blank to read selected file (${sel[0]}) aloud, or type custom text with dates like 10/28 and **markdown**...`
          : `Type text to synthesize with ${activeSpeechModel} (e.g., 'Meeting on 10/28: review **README.md** and \`fmOllama.ts\`')...`,
      oninput: (e) => {
        uiState.speechText = e.target.value;
      },
      onchange: (e) => {
        uiState.speechText = e.target.value;
      },
    },
    uiState.speechText,
  );

  const runSpeechRequest = async (overrideBlankForFile = false) => {
    const currentSel = selectedFilePaths();
    const liveSpeechText = overrideBlankForFile
      ? ""
      : String(speechTextareaEl ? speechTextareaEl.value : uiState.speechText || "").trim();
    uiState.speechText = liveSpeechText;
    if (overrideBlankForFile && speechTextareaEl) {
      speechTextareaEl.value = "";
    }
    uiState.loading = true;
    uiState.lastAudioUrl = "";
    uiState.autoPlayedAudioUrl = "";
    startLiveTaskTicker(
      `Synthesizing Speech Audio (${activeSpeechModel})`,
      `Converting dates & stripping markdown, then generating 24kHz audio via ${activeSpeechModel}...`,
      22,
      false,
    );
    renderOllamaPanel();
    try {
      const res = await call("ollama/speech", {
        model: activeSpeechModel,
        input: liveSpeechText || undefined,
        path: !liveSpeechText && currentSel.length > 0 ? currentSel[0] : undefined,
        voice: uiState.selectedVoice,
        mode: uiState.speechMode,
        responseFormat: uiState.speechFormat,
        saveDir: currentFolderRel(),
        saveFilename: uiState.speechFilename || undefined,
      });
      uiState.speechResult = res;
      uiState.lastAudioUrl = `${res.audioUrl}&token=${encodeURIComponent(getToken())}`;
      if (res.savedRelativePath) {
        toast(`Saved ${res.responseFormat.toUpperCase()} file: ${res.savedRelativePath}`);
        refresh();
      } else {
        toast(`Playing ${res.model} voice "${res.voice}" (~${res.durationSecondsEstimate}s)`);
      }
    } catch (e) {
      toast(e.message, { kind: "error" });
    } finally {
      stopLiveTaskTicker();
      uiState.loading = false;
      renderOllamaPanel();
    }
  };

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Speech & Cross-Platform Text-to-Audio LLMs (/v1/audio/speech + OS/LLM Synthesis)"),
      h(
        "span",
        { class: "ollama-pill is-mlx" },
        "Auto Date Words (10/28 -> October 28) + Markdown Strip + 4,096-Char Chunking",
      ),
    ]),
    speechCaps?.platformSpeechNote
      ? h("div", { class: "ollama-pill is-ram" }, speechCaps.platformSpeechNote)
      : null,
    speechTextareaEl,
    h("div", { class: "ollama-row" }, [
      h("span", {}, "Text-to-Audio Model:"),
      h(
        "select",
        {
          class: "ollama-select",
          title: "Choose Phonon (Apple Silicon MLX) or a Cross-Platform Text-to-Audio LLM for Linux & Windows",
          onchange: (e) => {
            uiState.speechModel = e.target.value;
            renderOllamaPanel();
          },
        },
        availableSpeechModels.map((m) =>
          h(
            "option",
            {
              value: m.name,
              selected: activeSpeechModel === m.name ? "selected" : null,
            },
            m.label || m.name,
          ),
        ),
      ),
      h("span", {}, "Voice:"),
      h(
        "select",
        {
          class: "ollama-select",
          onchange: (e) => {
            uiState.selectedVoice = e.target.value;
          },
        },
        voices.map((v) =>
          h(
            "option",
            {
              value: v,
              selected: uiState.selectedVoice === v ? "selected" : null,
            },
            v,
          ),
        ),
      ),
      h("span", {}, "Mode:"),
      h(
        "select",
        {
          class: "ollama-select",
          onchange: (e) => {
            uiState.speechMode = e.target.value;
            renderOllamaPanel();
          },
        },
        [
          h(
            "option",
            { value: "speaker", selected: uiState.speechMode === "speaker" ? "selected" : null },
            "Speaker Mode (Stream & Play Now)",
          ),
          h(
            "option",
            { value: "file", selected: uiState.speechMode === "file" ? "selected" : null },
            "File Mode (Save 24kHz Mono WAV/PCM to Active Pane)",
          ),
        ],
      ),
      h(
        "select",
        {
          class: "ollama-select",
          onchange: (e) => {
            uiState.speechFormat = e.target.value;
          },
        },
        [
          h(
            "option",
            { value: "wav", selected: uiState.speechFormat === "wav" ? "selected" : null },
            "Format: 24kHz Mono WAV",
          ),
          h(
            "option",
            { value: "pcm", selected: uiState.speechFormat === "pcm" ? "selected" : null },
            "Format: Raw 24kHz PCM",
          ),
        ],
      ),
      uiState.speechMode === "file"
        ? h("input", {
            class: "ollama-input",
            placeholder: "Optional filename (e.g. summary.wav)",
            value: uiState.speechFilename,
            oninput: (e) => {
              uiState.speechFilename = e.target.value;
            },
          })
        : null,
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: () => void runSpeechRequest(false),
        },
        uiState.loading
          ? [h("span", { class: "ollama-spinner" }), " Synthesizing..."]
          : uiState.speechMode === "file"
            ? "Save Speech Audio to Folder"
            : "Speak Out Loud Now",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => {
            if (selectedFilePaths().length > 0) {
              void runSpeechRequest(true);
            } else {
              uiState.speechText = "";
              if (speechTextareaEl) speechTextareaEl.value = "";
              renderOllamaPanel();
            }
          },
        },
        sel.length > 0 ? "Clear & Read Selected File" : "Clear Text",
      ),
      uiState.speechResult
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn",
              onclick: (e) => void copyOllamaOutput(uiState.speechResult.cleanedText || "", "Cleaned speech text", e.currentTarget),
            },
            "📋 Copy Cleaned Text",
          )
        : null,
      uiState.speechResult
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn",
              onclick: () => clearOllamaOutput("speech"),
            },
            "🧹 Clear Speech Output",
          )
        : null,
    ]),
    uiState.speechResult
      ? renderStudioOutputConsole({
          title: "Speech Synthesis Output & Cleaned Text",
          badge: `${uiState.speechResult.model || activeSpeechModel} • Voice: ${uiState.speechResult.voice} • ~${uiState.speechResult.durationSecondsEstimate}s`,
          content: `${uiState.speechResult.engineNote ? `[Engine Note: ${uiState.speechResult.engineNote}]\n\n` : ""}${uiState.speechResult.cleanedText || ""}`,
          audioUrl: uiState.lastAudioUrl,
          clearScope: "speech",
          saveName: "speech-transcript",
        })
      : null,
  ]);
}

function renderMeaningAndWebTab() {
  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Semantic Meaning Search (POST /api/embed) & Live Web Search (32,000+ num_ctx)"),
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        placeholder: "Search active folder by meaning (e.g., 'where is the database login or token verification logic')...",
        value: uiState.meaningQuery,
        oninput: (e) => {
          uiState.meaningQuery = e.target.value;
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: async () => {
            if (!uiState.meaningQuery.trim()) return;
            uiState.loading = true;
            renderOllamaPanel();
            try {
              const res = await call("ollama/semanticSearch", {
                query: uiState.meaningQuery,
                dirPath: currentFolderRel(),
              });
              uiState.meaningMatches = res.matches || [];
            } catch (e) {
              toast(e.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderOllamaPanel();
            }
          },
        },
        "Search Folder by Meaning (/api/embed)",
      ),
      uiState.meaningMatches.length > 0
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn",
              onclick: () => clearOllamaOutput("meaning"),
            },
            "🧹 Clear Meaning Results",
          )
        : null,
    ]),
    uiState.meaningMatches.length > 0
      ? h(
          "div",
          { class: "ollama-model-grid" },
          uiState.meaningMatches.map((m) =>
            h("div", { class: "ollama-model-card" }, [
              h("div", { class: "ollama-row" }, [
                h("strong", {}, m.name),
                h("span", { class: "ollama-pill is-mlx" }, `${(m.similarity * 100).toFixed(1)}% match`),
              ]),
              h("div", {}, m.path),
              h("div", {}, m.preview),
              h("div", { class: "ollama-row" }, [
                h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn",
                    onclick: async () => {
                      const { folderPath, filePath } = resolveMatchTargetPaths(m);
                      const ok = await goTo(folderPath, { select: filePath });
                      if (ok) {
                        if (state.workspace !== "split") closePower();
                        toast(`Opened folder and selected ${m.name}`);
                      }
                    },
                  },
                  "Open Containing Folder",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    onclick: (e) => void copyOllamaOutput(m.preview || m.path, `${m.name} preview`, e.currentTarget),
                  },
                  "📋 Copy Snippet",
                ),
              ]),
            ]),
          ),
        )
      : null,
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Ollama Cloud Web Search & Web Fetch (https://ollama.com/api/web_search)"),
      h("span", { class: "ollama-pill is-ram" }, "Auto-Enforces num_ctx >= 32,000 Tokens"),
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        placeholder: "Web search query or URL to fetch...",
        value: uiState.webQuery,
        oninput: (e) => {
          uiState.webQuery = e.target.value;
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: async () => {
            if (!uiState.webQuery.trim()) return;
            uiState.loading = true;
            renderOllamaPanel();
            try {
              const isUrl = /^https?:\/\//i.test(uiState.webQuery.trim());
              uiState.webResult = isUrl
                ? await call("ollama/webFetch", { url: uiState.webQuery.trim() })
                : await call("ollama/webSearch", { query: uiState.webQuery.trim() });
            } catch (e) {
              toast(e.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderOllamaPanel();
            }
          },
        },
        "Run Web Search / Fetch",
      ),
      uiState.webResult
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn",
              onclick: () => clearOllamaOutput("web"),
            },
            "🧹 Clear Web Output",
          )
        : null,
    ]),
    uiState.webResult
      ? renderStudioOutputConsole({
          title: "Web Search & Fetch Output",
          badge: "32,000+ num_ctx Grounded",
          content: JSON.stringify(uiState.webResult, null, 2),
          clearScope: "web",
          saveName: "web-search-output",
        })
      : null,
  ]);
}

function renderModelsAndAccountTab() {
  const st = uiState.statusData;
  const hw = st?.hardware;
  const models = st?.models || [];
  const catalog = st?.recommendedCatalog || [];
  const running = st?.running?.models || [];
  const cloud = st?.cloudAccount;

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Hardware Guard, Installed Models (/api/tags, /api/show, /api/ps) & Cloud Account"),
      hw
        ? h(
            "span",
            { class: "ollama-pill is-ram" },
            `70% Safe Memory Budget: ${hw.safeMemoryBudgetGb} GB of ${hw.totalRamGb} GB Total RAM`,
          )
        : null,
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        placeholder: "Pull model (e.g. qwen3.5:4b, lfm3-omni:latest, qwen3.5:latest, lfm3:latest, nimble, llama3:70b)...",
        value: uiState.pullModelName,
        oninput: (e) => {
          uiState.pullModelName = e.target.value;
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: async () => {
            if (!uiState.pullModelName.trim()) return;
            uiState.loading = true;
            uiState.refusalBanner = null;
            startLiveTaskTicker(
              `Pulling Model: ${uiState.pullModelName.trim()}`,
              `Validating hardware guard & downloading ${uiState.pullModelName.trim()} via POST /api/pull...`,
              8,
              true,
            );
            renderOllamaPanel();
            try {
              const res = await call("ollama/pull", { model: uiState.pullModelName.trim() });
              uiState.pullResult = res;
              if (!res.ok) {
                uiState.refusalBanner = {
                  code: res.verdict?.code || "HARDWARE_RAM_REFUSAL",
                  message: res.status,
                };
              } else {
                toast(`Pulled ${uiState.pullModelName} (${res.status})`);
                void refreshOllamaStatus(true);
              }
            } catch (e) {
              toast(e.message, { kind: "error" });
            } finally {
              stopLiveTaskTicker();
              uiState.loading = false;
              renderOllamaPanel();
            }
          },
        },
        uiState.loading ? [h("span", { class: "ollama-spinner" }), " Pulling Model..."] : "Hardware-Checked Pull (/api/pull)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => void runOneClickAutoInstall(),
        },
        uiState.installing
          ? [h("span", { class: "ollama-spinner" }), " Auto-Installing..."]
          : "⚡ 1-Click Auto-Install Ollama & Starter Models",
      ),
    ]),
    h("div", { class: "ollama-card-title" }, [
      h(
        "span",
        {},
        `Installed Hardware-Approved Models (${models.length}) — ${hw?.isAppleSiliconMac ? "Non-MLX Standard Models Hidden automatically (Rule A)" : "Filtered by 70% RAM Ceiling"}`,
      ),
    ]),
    h(
      "div",
      { class: "ollama-model-grid" },
      models.map((m) =>
        h("div", { class: "ollama-model-card" }, [
          h("div", { class: "ollama-row" }, [
            h("strong", {}, m.name),
            h("span", { class: "ollama-pill" }, `${m.parameterSize} • ${m.sizeGb} GB`),
          ]),
          h("div", { class: "ollama-badge-row" }, (m.badges || []).map(createBadgeEl)),
          h(
            "div",
            {},
            `Runner: ${m.runner} | Quant: ${m.quantization || "native"} | Ctx: ${m.contextLength}${m.voices?.length ? ` | Voices: ${m.voices.length}` : ""}`,
          ),
          h("div", { class: "ollama-row" }, [
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn",
                onclick: async () => {
                  const info = await call("ollama/show", { model: m.name, forceRefresh: true });
                  uiState.inspectedModelInfo = { name: m.name, info };
                  renderOllamaPanel();
                },
              },
              "Inspect (/api/show)",
            ),
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn",
                onclick: async () => {
                  await call("ollama/freeRam", { model: m.name });
                  toast(`Unloaded ${m.name} from RAM (keep_alive: 0)`);
                  void refreshOllamaStatus(true);
                },
              },
              "Unload RAM",
            ),
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-danger",
                onclick: async () => {
                  try {
                    await call("ollama/delete", { model: m.name });
                    toast(`Deleted ${m.name}`);
                    void refreshOllamaStatus(true);
                  } catch (e) {
                    toast(e.message, { kind: "error" });
                  }
                },
              },
              "Delete",
            ),
          ]),
        ]),
      ),
    ),
    uiState.inspectedModelInfo
      ? renderStudioOutputConsole({
          title: `Model Inspector (/api/show: ${uiState.inspectedModelInfo.name})`,
          badge: "Manifest & Tensor Metadata",
          content: JSON.stringify(uiState.inspectedModelInfo.info?.details || uiState.inspectedModelInfo.info, null, 2),
          clearScope: "inspector",
          saveName: `model-inspect-${String(uiState.inspectedModelInfo.name || "model").replace(/[^a-z0-9_-]/gi, "-")}`,
        })
      : null,
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Custom Modelfile Preset (/api/create, /api/copy, /api/push) & Cloud API Key (/api/usage, /api/balance)"),
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        placeholder: "New custom model name (e.g. codecaine-helper)",
        value: uiState.customModelName,
        oninput: (e) => {
          uiState.customModelName = e.target.value;
        },
      }),
      h("input", {
        class: "ollama-input",
        placeholder: "Base model (e.g. lfm3-omni:latest, qwen3.5:latest, lfm3:latest)",
        value: uiState.customModelFrom,
        oninput: (e) => {
          uiState.customModelFrom = e.target.value;
        },
      }),
      h("input", {
        class: "ollama-input",
        placeholder: "System prompt...",
        value: uiState.customModelSystem,
        oninput: (e) => {
          uiState.customModelSystem = e.target.value;
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: async () => {
            try {
              await call("ollama/create", {
                model: uiState.customModelName,
                from: uiState.customModelFrom,
                system: uiState.customModelSystem,
              });
              toast(`Created custom model ${uiState.customModelName}`);
              void refreshOllamaStatus(true);
            } catch (e) {
              toast(e.message, { kind: "error" });
            }
          },
        },
        "Save Preset (/api/create)",
      ),
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        type: "password",
        placeholder: "OLLAMA_API_KEY (for Web Search & :cloud models)",
        value: uiState.apiKeyInput,
        oninput: (e) => {
          uiState.apiKeyInput = e.target.value;
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: async () => {
            await call("ollama/account", { apiKey: uiState.apiKeyInput });
            toast("Updated OLLAMA_API_KEY");
            void refreshOllamaStatus(true);
          },
        },
        "Save OLLAMA_API_KEY & Check Balance",
      ),
      cloud
        ? h(
            "span",
            { class: "ollama-pill is-cloud" },
            `Cloud Key: ${cloud.hasApiKey ? "Configured" : "Local Mode"} | Balance: ${JSON.stringify(cloud.balance)}`,
          )
        : null,
    ]),
    running.length > 0
      ? h(
          "div",
          { class: "ollama-output-box" },
          `Currently Sitting in RAM (/api/ps):\n${running.map((r) => `• ${r.name} — ${r.sizeGb} GB (${r.processor})`).join("\n")}`,
        )
      : null,
    catalog.length > 0
      ? h("div", { class: "ollama-card-title" }, [h("span", {}, "Hardware-Evaluated Model Catalog")])
      : null,
    h(
      "div",
      { class: "ollama-model-grid" },
      catalog.map((c) =>
        h("div", { class: "ollama-model-card" }, [
          h("div", { class: "ollama-row" }, [
            h("strong", {}, c.label),
            h(
              "span",
              { class: `ollama-pill ${c.hardwareVerdict?.allowed ? "is-mlx" : "is-warn"}` },
              c.hardwareVerdict?.allowed ? `Fits RAM (~${c.estimatedRamGb} GB)` : "Blocked by RAM Guard",
            ),
          ]),
          h("div", { class: "ollama-badge-row" }, (c.badges || []).map(createBadgeEl)),
          h("div", {}, c.description),
          c.hardwareVerdict?.allowed && !c.name.endsWith(":cloud")
            ? h("div", { class: "ollama-row" }, [
                h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    onclick: async () => {
                      uiState.pullModelName = c.name;
                      uiState.loading = true;
                      startLiveTaskTicker(
                        `Pulling ${c.name}`,
                        `Downloading ${c.label} (${c.name}) via POST /api/pull...`,
                        8,
                        true,
                      );
                      renderOllamaPanel();
                      try {
                        const res = await call("ollama/pull", { model: c.name });
                        if (res.ok) {
                          toast(`Pulled ${c.name}`);
                          void refreshOllamaStatus(true);
                        } else {
                          toast(res.status || `Failed to pull ${c.name}`, { kind: "error" });
                        }
                      } catch (e) {
                        toast(e.message, { kind: "error" });
                      } finally {
                        stopLiveTaskTicker();
                        uiState.loading = false;
                        renderOllamaPanel();
                      }
                    },
                  },
                  `⬇ Pull ${c.name}`,
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    onclick: (e) => void copyOllamaOutput(`ollama run ${c.name}`, `ollama run ${c.name}`, e.currentTarget),
                  },
                  `📋 Copy CLI: ollama run ${c.name}`,
                ),
              ])
            : null,
        ]),
      ),
    ),
  ]);
}

export function renderOllamaPanel() {
  if (!rootContainer) return;
  clear(rootContainer);

  const suite = h("div", { class: "ollama-suite" }, [
    renderHeroBanner(),
    renderLiveActivityBanner(),
    renderCrossPlatformSetupBanner(),
    renderModeTabs(),
    renderSelectedFilesStrip(),
    renderRefusalBanner(),
    renderPendingConfirmations(),
    uiState.subTab === "assistant"
      ? renderAssistantTab()
      : uiState.subTab === "decision"
        ? renderDecisionTab()
        : uiState.subTab === "speech"
          ? renderSpeechTab()
          : uiState.subTab === "meaning"
            ? renderMeaningAndWebTab()
            : renderModelsAndAccountTab(),
  ]);

  rootContainer.appendChild(suite);
}

export function mountOllamaTool(container) {
  rootContainer = container;
  if (typeof window !== "undefined" && window.location?.search) {
    const sub = new URLSearchParams(window.location.search).get("subTab");
    if (sub) uiState.subTab = sub;
  }
  renderOllamaPanel();
  if (!uiState.statusData && !uiState.loading) {
    void refreshOllamaStatus(false);
  }
  const offSelection = on("selection", () => {
    if (rootContainer && !rootContainer.hidden) renderOllamaPanel();
  });
  return {
    show(opts) {
      if (opts?.subTab) uiState.subTab = opts.subTab;
      if (opts?.prompt) {
        uiState.promptText = opts.prompt;
        void runSmartAutoRouter(opts.prompt);
      } else {
        void refreshOllamaStatus(true);
      }
    },
    dispose() {
      offSelection?.();
    },
  };
}

registerPowerTab({
  id: "ollama",
  label: "Ollama AI",
  icon: "🤖",
  tip: "Conversational Ollama AI assistant and full capability router for chat, deep thinking, vision, SystemOne decision scoring, Phonon speech, meaning search, web search, and Apple Silicon MLX model management.",
  group: "automate",
  mount: mountOllamaTool,
});
