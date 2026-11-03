// Built-In LM Studio Bionic AI Studio, Agent Skills Hub, Phonon 40M Multilingual TTS & ExecuTorch ASR UI.
import { call, getToken } from "./api.js";
import { tokenizeText } from "./codeLogic.js";
import { parseMarkdown } from "./codeMarkdown.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh } from "./nav.js";
import { currentPath } from "./pane.js";
import { closePower, registerPowerTab } from "./power.js";
import { selectedEntries } from "./selection.js";
import { on, state } from "./state.js";

const uiState = {
  subTab: "assistant", // "assistant" | "skills" | "speech_asr" | "meaning" | "models"
  statusData: null,
  loading: false,
  selectedModel: "",
  selectedVoice: "Zoey",
  selectedLanguage: "en",
  thinkEnabled: true,
  thinkingLevel: "auto", // "auto" | "off" | "on" | "low" | "medium" | "high"
  thinkingBudget: 0,
  showAdvancedSampling: false,
  contextLength: 32768,
  temperature: 0.4,
  topP: 0.95,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  maxTokens: 16384,
  seed: "",
  stopSequences: "",
  draftModel: "",
  ttlSeconds: 0,
  customSystemPrompt: "",
  speakReply: false,
  schemaPreset: "",
  selectedSkill: "",
  promptText: "",
  lastSubmittedPrompt: "",
  routeBanner: "",
  reasoningOutput: "",
  answerOutput: "",
  structuredOutput: null,
  lastStats: null,
  lastRuntime: null,
  outputExpanded: false,
  outputFullscreen: false,
  compactControls: false,
  abortController: null,
  markdownView: true,
  showOutline: true,
  codeWrap: true,
  mdFontScale: 14,
  refusalBanner: null,
  lastAudioUrl: "",
  autoPlayedAudioUrl: "",
  lastSavedAudioPath: "",
  pendingActions: [],
  // Skills & Projects state
  inspectedSkill: null,
  newSkillName: "",
  newSkillDisplayName: "",
  newSkillDesc: "",
  newSkillScope: "project-local",
  newSkillInstructions: "1. Inspect the selected files in the workspace.\n2. Summarize findings and propose safe improvements.",
  // Speech & ASR state
  speechText: "",
  speechMode: "speaker", // "speaker" | "file"
  speechFilename: "",
  speechResult: null,
  asrFormat: "markdown",
  asrSaveToFolder: true,
  asrSummarize: true,
  asrResult: null,
  // Meaning search state
  meaningQuery: "",
  meaningMatches: [],
  embedInputText: "",
  embedResult: null,
  // Model lifecycle state
  hubModelQuery: "",
  loadContextLength: 32768,
  loadGpuOffload: "max",
  loadFlashAttention: true,
  loadKvCacheQuant: "f16",
  loadTtlSeconds: 0,
  contextPaths: [],
};

let rootContainer = null;
let promptTextareaEl = null;
let speechTextareaEl = null;

function currentFolderRel() {
  return currentPath() || state.location?.path || state.home || "/";
}

function selectedFilePaths() {
  const activeSel = selectedEntries().map((e) => e.path);
  if (activeSel.length > 0) return activeSel;
  for (const pane of [state.left, state.right]) {
    if (pane?.selection?.size > 0) return [...pane.selection];
  }
  if (Array.isArray(uiState.contextPaths) && uiState.contextPaths.length > 0) {
    return uiState.contextPaths;
  }
  for (const pane of [state.left, state.right]) {
    if (pane?.focusKey) return [pane.focusKey];
  }
  return [];
}

function computeTextTelemetry(text) {
  const s = String(text ?? "");
  if (!s.trim()) return { chars: 0, words: 0, lines: 0 };
  return {
    chars: s.length,
    words: s.trim().split(/\s+/).filter(Boolean).length,
    lines: s.split(/\r?\n/).length,
  };
}

function resolveEffectiveBionicModelId(modelName) {
  const clean = String(modelName ?? uiState.selectedModel ?? "").trim();
  if (clean) return clean;
  const models = uiState.statusData?.models || [];
  const loadedChat = models.find((m) => m.loaded && (m.type === "llm" || m.type === "vlm"));
  if (loadedChat?.id) return loadedChat.id;
  const anyChat = models.find((m) => m.type === "llm" || m.type === "vlm");
  if (anyChat?.id) return anyChat.id;
  const cloudModels = uiState.statusData?.cloudModels || [];
  if (cloudModels.length > 0 && cloudModels[0]?.id) return cloudModels[0].id;
  return "openai/gpt-oss-20b";
}

function getBionicModelThinkingCapabilities(modelName) {
  const clean = resolveEffectiveBionicModelId(modelName);
  const models = [...(uiState.statusData?.models || []), ...(uiState.statusData?.cloudModels || [])];
  const found = models.find((m) => (m.id || m.modelKey || "").toLowerCase() === clean.toLowerCase());
  if (found?.thinkingCapabilities) {
    return found.thinkingCapabilities;
  }
  const lower = clean.toLowerCase();
  if (lower.includes("phonon") || lower.includes("embed") || lower.includes("bge-")) {
    return {
      supportsThinking: false,
      thinkingMode: "none",
      canToggle: false,
      supportedLevels: [],
      defaultLevel: "off",
      supportsThinkingBudget: false,
      badgeLabel: "Direct Output (No Thinking)",
      description: "Direct output model without chain-of-thought reasoning.",
    };
  }
  if (lower.includes("gpt-oss") || lower.includes("gpt_oss") || /^o[134](?:[-:_]|$)/.test(lower)) {
    return {
      supportsThinking: true,
      thinkingMode: "levels",
      canToggle: false,
      supportedLevels: ["low", "medium", "high"],
      defaultLevel: "medium",
      supportsThinkingBudget: false,
      badgeLabel: "Reasoning Effort: Low / Med / High",
      description:
        "Multi-level reasoning model (gpt-oss): select Low, Medium, or High reasoning effort (passes reasoning_effort + Harmony Reasoning: <level>).",
    };
  }
  if (lower.includes("deepseek-r1") || lower.includes("qwq") || lower.includes("phi4-reasoning")) {
    return {
      supportsThinking: true,
      thinkingMode: "always_on",
      canToggle: false,
      supportedLevels: ["on"],
      defaultLevel: "on",
      supportsThinkingBudget: true,
      badgeLabel: "Always-On Chain-of-Thought (<think>)",
      description:
        "Native reasoning model with <think>...</think> traces always active by default.",
    };
  }
  if (
    lower.includes("qwen3") ||
    lower.includes("lfm3") ||
    lower.includes("glm-4.5") ||
    lower.includes("glm-5") ||
    lower.includes("glm-z1") ||
    lower.includes("cogito") ||
    lower.includes("granite3") ||
    lower.includes("smollm3") ||
    lower.includes("deepseek-v3") ||
    lower.includes("deepseek-v4") ||
    lower.includes("kimi-k") ||
    lower.includes("reflection/beam") ||
    lower.includes("muse-spark") ||
    lower.includes("nemotron") ||
    lower.includes("seed-oss") ||
    lower.includes("hunyuan") ||
    lower.includes("mimo") ||
    lower.includes("gemma4") ||
    lower.includes("gemma-4") ||
    lower.includes("muse")
  ) {
    return {
      supportsThinking: true,
      thinkingMode: "toggle",
      canToggle: true,
      supportedLevels: ["off", "on"],
      defaultLevel: "on",
      supportsThinkingBudget: true,
      badgeLabel: "Thinking Toggle: On / Off",
      description:
        "Hybrid thinking model (qwen3.5, DeepSeek-V4, GLM-5, Kimi-K3, Beam-1.0, etc.): toggle thinking On or Off (enable_thinking).",
    };
  }
  return {
    supportsThinking: false,
    thinkingMode: "none",
    canToggle: false,
    supportedLevels: [],
    defaultLevel: "off",
    supportsThinkingBudget: false,
    badgeLabel: "Standard Direct Output (No Thinking)",
    description: "Standard direct output model without chain-of-thought reasoning latency.",
  };
}

function getBionicModelFeatureProfile(modelName) {
  const clean = resolveEffectiveBionicModelId(modelName);
  const models = [...(uiState.statusData?.models || []), ...(uiState.statusData?.cloudModels || [])];
  const found = models.find((m) => (m.id || m.modelKey || "").toLowerCase() === clean.toLowerCase());
  if (found?.featureProfile) {
    return found.featureProfile;
  }
  const lower = clean.toLowerCase();
  const thinkingCaps = getBionicModelThinkingCapabilities(clean);
  const isEmbedding = found?.type === "embedding" || lower.includes("embed") || lower.includes("bge-");
  const isTts = found?.type === "tts" || lower.includes("phonon");
  const isChat = !isEmbedding && !isTts;
  const isCloud =
    Boolean(found?.isCloud) ||
    found?.format === "cloud" ||
    lower.includes("deepseek-v4") ||
    lower.includes("glm-5") ||
    lower.includes("kimi-k3") ||
    lower.includes("muse-spark") ||
    lower.includes("reflection/beam");
  const isVision =
    Boolean(found?.vision) ||
    found?.type === "vlm" ||
    lower.includes("-vl") ||
    lower.includes("_vl") ||
    lower.includes("omni") ||
    lower.includes("qwen3.5") ||
    lower.includes("gemma3") ||
    lower.includes("gemma4") ||
    lower.includes("deepseek-v4.1") ||
    lower.includes("glm-5.3-flash") ||
    lower.includes("kimi-k3") ||
    lower.includes("muse-spark") ||
    lower.includes("llava") ||
    lower.includes("pixtral") ||
    lower.includes("minicpm-v");
  const isTools =
    isChat &&
    (Boolean(found?.trainedForToolUse) ||
      isCloud ||
      (!lower.includes("deepseek-r1") &&
        !lower.includes("qwq") &&
        (lower.includes("gpt-oss") ||
          lower.includes("qwen") ||
          lower.includes("cogito") ||
          lower.includes("lfm3") ||
          lower.includes("gemma4") ||
          lower.includes("llama") ||
          lower.includes("mistral") ||
          lower.includes("deepseek-v4") ||
          lower.includes("kimi") ||
          lower.includes("beam") ||
          lower.includes("muse") ||
          lower.includes("glm"))));

  const indicators = [];
  const useCases = [];

  if (isCloud) {
    indicators.push({
      id: "cloud",
      icon: "☁️",
      label: "Zero-RAM Bionic Cloud",
      description: "Runs on LM Studio Bionic Cloud with 0 GB local RAM impact and up to 262K context.",
    });
  }

  if (isTts) {
    indicators.push({
      id: "tts",
      icon: "🔊",
      label: "Phonon 40M Multilingual TTS",
      description: "24kHz native Metal text-to-speech synthesis across 5 languages.",
    });
    useCases.push("Read files aloud at 24kHz with Zoey, Anton, Marlowe & Maeve");
  } else if (isEmbedding) {
    indicators.push({
      id: "embedding",
      icon: "🔍",
      label: "768-Dim Semantic Embeddings",
      description: "Generates dense vector embeddings for folder search by meaning.",
    });
    useCases.push("Search workspace files by concept & meaning (/v1/embeddings)");
  } else if (thinkingCaps.thinkingMode === "levels") {
    indicators.push({
      id: "thinking_levels",
      icon: "🧠",
      label: "Reasoning Levels (Low / Med / High)",
      description: "Choose Low, Medium, or High reasoning effort (gpt-oss Harmony format).",
    });
    useCases.push("Choose Low, Medium, or High reasoning effort per prompt");
  } else if (thinkingCaps.thinkingMode === "toggle") {
    indicators.push({
      id: "thinking_toggle",
      icon: "🔀",
      label: "Thinking Toggle (On / Off)",
      description: "Turn Deep Thinking On for step-by-step reasoning or Off for instant replies.",
    });
    useCases.push("Toggle Thinking On for deep reflection or Off for fast answers");
  } else if (thinkingCaps.thinkingMode === "always_on") {
    indicators.push({
      id: "thinking_always_on",
      icon: "🧠",
      label: "Always-On Reasoning (<think>)",
      description: "Always performs multi-step chain-of-thought verification.",
    });
    useCases.push("Step-by-step math, logic proofs & root-cause debugging");
  } else {
    indicators.push({
      id: "direct_fast",
      icon: "⚡",
      label: "Fast Direct Output (No Thinking Overhead)",
      description: "Responds immediately without chain-of-thought latency.",
    });
    useCases.push("Instant low-latency code generation & file summarization");
  }

  if (isVision) {
    indicators.push({
      id: "vision",
      icon: "👁",
      label: "Vision VLM (Images & Screenshots)",
      description: "Inspects images, screenshots, diagrams, and documents.",
    });
    useCases.push("Inspect images, receipts, and UI screenshots");
  }

  if (isChat) {
    indicators.push({
      id: "code",
      icon: "💻",
      label: "Chat, Code & Document Synthesis",
      description: "Summarizes files, writes/refactors code, and synthesizes multi-file reports.",
    });
    useCases.push("Summarize files, refactor code, and synthesize multi-file reports");
  }

  if (isTools) {
    indicators.push({
      id: "tools",
      icon: "🛠",
      label: "Tool Use & @Skill Injection",
      description: "Supports Bionic @skill triggers and safe file tool actions.",
    });
    useCases.push("Run @skill agents and safe file organization tools");
  }

  if (isChat) {
    indicators.push({
      id: "structured_json",
      icon: "📐",
      label: "Grammar-Constrained JSON",
      description: "Outputs schema-validated JSON for batch renames, code reviews, and tables.",
    });
  }

  return {
    modelName: clean,
    summary: `Best for: ${useCases.slice(0, 3).join(" • ")}.`,
    useCases,
    indicators,
    features: {
      chat: isChat,
      code: isChat,
      thinking: thinkingCaps.supportsThinking,
      thinkingMode: thinkingCaps.thinkingMode,
      thinkingLevels: thinkingCaps.thinkingMode === "levels",
      thinkingToggle: thinkingCaps.thinkingMode === "toggle",
      thinkingAlwaysOn: thinkingCaps.thinkingMode === "always_on",
      thinkingBudget: thinkingCaps.supportsThinkingBudget,
      vision: isVision,
      tools: isTools,
      structuredJson: isChat,
      embeddings: isEmbedding,
      tts: isTts,
      cloud: isCloud,
    },
    thinkingCapabilities: thinkingCaps,
  };
}

function syncBionicSelectedModelState() {
  const caps = getBionicModelThinkingCapabilities(uiState.selectedModel);
  const profile = getBionicModelFeatureProfile(uiState.selectedModel);
  const feat = profile.features || {};
  if (caps.thinkingMode === "levels") {
    if (uiState.thinkingLevel !== "low" && uiState.thinkingLevel !== "medium" && uiState.thinkingLevel !== "high") {
      uiState.thinkingLevel = caps.defaultLevel || "medium";
    }
    uiState.thinkEnabled = true;
  } else if (caps.thinkingMode === "always_on") {
    uiState.thinkingLevel = "on";
    uiState.thinkEnabled = true;
  } else if (caps.thinkingMode === "none") {
    uiState.thinkingLevel = "off";
    uiState.thinkEnabled = false;
  } else if (caps.thinkingMode === "toggle") {
    if (uiState.thinkingLevel !== "on" && uiState.thinkingLevel !== "off") {
      uiState.thinkingLevel = caps.defaultLevel === "on" ? "on" : "off";
    }
    uiState.thinkEnabled = uiState.thinkingLevel === "on";
  }
  if (!feat.tools) {
    uiState.selectedSkill = "";
  }
  if (!feat.structuredJson) {
    uiState.schemaPreset = "";
  }
  if (!feat.thinkingBudget) {
    uiState.thinkingBudget = 0;
  }
}

function resolveBionicThinkPayload() {
  const caps = getBionicModelThinkingCapabilities(uiState.selectedModel);
  if (caps.thinkingMode === "none" || !caps.supportsThinking) {
    return { think: false, thinkingLevel: "off" };
  }
  let level = uiState.thinkingLevel || "auto";
  if (caps.thinkingMode === "levels") {
    if (level !== "low" && level !== "medium" && level !== "high") {
      level = caps.defaultLevel || "medium";
    }
    return { think: level, thinkingLevel: level };
  }
  if (caps.thinkingMode === "always_on") {
    return { think: true, thinkingLevel: "on" };
  }
  if (level === "auto") {
    return {
      think: uiState.thinkEnabled,
      thinkingLevel: uiState.thinkEnabled ? "on" : "off",
    };
  }
  if (level === "off") return { think: false, thinkingLevel: "off" };
  return { think: true, thinkingLevel: "on" };
}

function buildBionicSamplingPayload() {
  const out = {
    contextLength: Number(uiState.contextLength) || 32768,
    temperature: Number(uiState.temperature),
    topP: Number(uiState.topP),
    topK: Number(uiState.topK),
    minP: Number(uiState.minP),
    repeatPenalty: Number(uiState.repeatPenalty),
    maxTokens: Number(uiState.maxTokens) || 16384,
    draftModel: String(uiState.draftModel || "").trim() || undefined,
    ttlSeconds: Number(uiState.ttlSeconds) > 0 ? Number(uiState.ttlSeconds) : undefined,
    systemPrompt: String(uiState.customSystemPrompt || "").trim() || undefined,
  };
  if (uiState.seed !== "" && Number.isFinite(Number(uiState.seed))) {
    out.seed = Number(uiState.seed);
  }
  if (String(uiState.stopSequences || "").trim()) {
    out.stop = String(uiState.stopSequences)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Number(uiState.thinkingBudget) > 0) {
    out.thinkingBudget = Number(uiState.thinkingBudget);
  }
  return out;
}

async function copyBionicText(text, label = "Bionic output", btnEl = null) {
  const clean = String(text ?? "");
  if (!clean.trim()) {
    toast("No output to copy yet.");
    return false;
  }
  let ok = false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(clean);
      ok = true;
    } catch {}
  }
  if (!ok) {
    try {
      await call("copytext", { text: clean });
      ok = true;
    } catch {}
  }
  if (btnEl && btnEl instanceof HTMLElement) {
    const orig = btnEl.dataset.origLabel || btnEl.textContent || "📋 Copy";
    btnEl.dataset.origLabel = orig;
    btnEl.textContent = "✓ Copied!";
    btnEl.classList.add("is-copied");
    setTimeout(() => {
      btnEl.textContent = orig;
      btnEl.classList.remove("is-copied");
    }, 1600);
  }
  toast(`Copied ${label} to clipboard (${clean.length.toLocaleString()} chars)`);
  return ok;
}

async function saveBionicOutputToFolder(text, baseName = "bionic-output") {
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

async function speakTextWithBionic(text) {
  const clean = String(text ?? "").trim();
  if (!clean) {
    toast("No text to read aloud.");
    return;
  }
  uiState.loading = true;
  renderBionicPanel();
  try {
    const res = await call("bionic/speech", {
      input: clean,
      voice: uiState.selectedVoice,
      language: uiState.selectedLanguage,
      mode: "speaker",
    });
    if (res.audioUrl) {
      uiState.lastAudioUrl = `${res.audioUrl}&token=${encodeURIComponent(getToken())}`;
    }
    toast(`Speaking with Bionic Phonon 40M Multilingual (${res.voice})`);
  } catch (err) {
    toast(err.message || "Could not synthesize speech", { kind: "error" });
  } finally {
    uiState.loading = false;
    renderBionicPanel();
  }
}

function clearBionicOutput(scope = "assistant") {
  if (scope === "assistant" || scope === "all") {
    uiState.answerOutput = "";
    uiState.reasoningOutput = "";
    uiState.structuredOutput = null;
    uiState.lastStats = null;
    uiState.lastRuntime = null;
    uiState.routeBanner = "";
    uiState.refusalBanner = null;
    uiState.lastAudioUrl = "";
    uiState.autoPlayedAudioUrl = "";
  }
  if (scope === "skill" || scope === "all") {
    uiState.inspectedSkill = null;
  }
  if (scope === "speech" || scope === "all") {
    uiState.speechResult = null;
    uiState.lastAudioUrl = "";
  }
  if (scope === "asr" || scope === "all") {
    uiState.asrResult = null;
  }
  if (scope === "meaning" || scope === "all") {
    uiState.meaningMatches = [];
    uiState.embedResult = null;
  }
  renderBionicPanel();
}

function createAudioPlayerEl(audioUrl) {
  if (!audioUrl) return null;
  const shouldAutoplay = uiState.autoPlayedAudioUrl !== audioUrl;
  if (shouldAutoplay) uiState.autoPlayedAudioUrl = audioUrl;
  return h("audio", {
    controls: "controls",
    autoplay: shouldAutoplay ? "autoplay" : null,
    src: audioUrl,
    "aria-label": "Synthesized Bionic 24kHz audio player",
  });
}

function createBadgeEl(badge) {
  const bLower = String(badge || "").toLowerCase();
  const extra =
    bLower.includes("mlx") || bLower.includes("loaded") || bLower.includes("bionic cloud") || bLower.includes("zero local ram")
      ? " badge-mlx"
      : bLower.includes("speech") || bLower.includes("tts")
        ? " badge-speech"
        : bLower.includes("vision")
          ? " badge-vision"
          : bLower.includes("reasoning") || bLower.includes("tools") || bLower.includes("thinking")
            ? " badge-decision"
            : "";
  return h("span", { class: `ollama-cap-badge${extra}` }, badge);
}

/**
 * Extracts YAML frontmatter (`---\n...\n---`) at the top of SKILL.md or Markdown documents
 * so it can be rendered as a structured metadata card above the document body.
 */
function extractYamlFrontmatter(rawText) {
  const src = String(rawText ?? "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { frontmatter: [], body: src };
  const yamlBlock = m[1];
  const body = m[2];
  const entries = [];
  for (const line of yamlBlock.split(/\r?\n/)) {
    const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) {
      const k = kv[1];
      const v = kv[2].replace(/^["']|["']$/g, "").trim();
      if (v) entries.push([k, v]);
    }
  }
  return { frontmatter: entries, body };
}

function mdNodePlainText(node) {
  if (!node) return "";
  if (node.tag === "#text" || node.tag === "code") return String(node.text ?? "");
  if (node.tag === "img") return String(node.alt ?? "");
  return (node.children || []).map(mdNodePlainText).join("");
}

function resolveTokenizerLang(langRaw, codeText = "") {
  const raw = String(langRaw || "").trim().toLowerCase();
  const aliasMap = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    console: "shell",
    terminal: "shell",
    yml: "yaml",
    md: "markdown",
    rs: "rust",
    rb: "ruby",
    cs: "csharp",
    kt: "kotlin",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    htm: "html",
    svg: "xml",
  };
  if (aliasMap[raw]) return aliasMap[raw];
  if (
    [
      "javascript",
      "typescript",
      "json",
      "html",
      "css",
      "markdown",
      "python",
      "go",
      "rust",
      "c",
      "cpp",
      "csharp",
      "java",
      "kotlin",
      "swift",
      "php",
      "ruby",
      "lua",
      "shell",
      "yaml",
      "toml",
      "ini",
      "sql",
      "xml",
      "diff",
      "dockerfile",
      "makefile",
      "v",
    ].includes(raw)
  ) {
    return raw;
  }
  const trimmed = String(codeText || "").trim();
  if (/^[\[{]/.test(trimmed) && /[}\]]$/.test(trimmed)) return "json";
  if (/^(?:bionic_tool|\w+\s*\(|const\s+|let\s+|import\s+|export\s+|await\s+|function\s+|return\s+)/m.test(trimmed)) {
    return "typescript";
  }
  if (/^(?:def\s+|from\s+\S+\s+import\s+)/m.test(trimmed)) return "python";
  if (/^(?:\$\s+|lms\s+|bun\s+|npm\s+|pip\s+|uv\s+|curl\s+|git\s+|fastapi\s+|python3?\s+)/m.test(trimmed)) {
    return "shell";
  }
  if (/[="'{}[\]()]/.test(trimmed)) return "javascript";
  return "plain";
}

function buildSyntaxHighlightedCodePre(codeText, langRaw) {
  const cleanCode = String(codeText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
  const lang = resolveTokenizerLang(langRaw, cleanCode);
  const lines = tokenizeText(lang, cleanCode.length > 200_000 ? cleanCode.slice(0, 200_000) : cleanCode);
  const bodyEl = h("div", {
    class: `bionic-md-code-body${uiState.codeWrap !== false ? " is-wrapped" : ""}`,
    tabindex: "0",
    role: "region",
    "aria-label": `${langRaw || lang} code snippet`,
  });
  const maxLines = Math.min(lines.length, 10000);
  for (let i = 0; i < maxLines; i++) {
    const tokens = lines[i] || [];
    const textCell = h("span", { class: "bionic-md-code-text" });
    if (tokens.length === 0) {
      textCell.append(document.createTextNode(" "));
    } else {
      for (const t of tokens) {
        textCell.append(
          t.type ? h("span", { class: `code-t-${t.type}` }, t.text) : document.createTextNode(t.text),
        );
      }
    }
    bodyEl.append(
      h("div", { class: "bionic-md-code-row" }, [
        h("span", { class: "bionic-md-code-ln", "aria-hidden": "true" }, String(i + 1)),
        textCell,
      ]),
    );
  }
  return bodyEl;
}

/**
 * Builds safe DOM elements from `parseMarkdown` AST nodes with syntax-highlighted code blocks,
 * 1-click Copy Code buttons, GitHub-style alert callouts, and responsive sticky-header tables.
 */
export function buildBionicMarkdownDom(rawSource, clearScope = "assistant") {
  const { frontmatter, body } = extractYamlFrontmatter(rawSource);
  const { nodes } = parseMarkdown(body);
  const headings = [];

  function renderAstNode(node, colHeaders = []) {
    if (!node) return document.createTextNode("");
    switch (node.tag) {
      case "#text":
        return document.createTextNode(node.text || "");
      case "#inline": {
        const frag = document.createDocumentFragment();
        for (const c of node.children || []) frag.append(renderAstNode(c));
        return frag;
      }
      case "br":
        return h("br");
      case "hr":
        return h("hr");
      case "code":
        return h("code", { class: "bionic-md-inline-code" }, node.text || "");
      case "pre": {
        const rawLang = (node.lang || "").trim();
        const codeBody = String(node.text || "").replace(/^\n+|\n+$/g, "");
        const resolvedLang = resolveTokenizerLang(rawLang, codeBody);
        const displayLang =
          rawLang && rawLang.toLowerCase() !== "text"
            ? rawLang.toUpperCase()
            : resolvedLang !== "plain"
              ? `${resolvedLang.toUpperCase()} / SNIPPET`
              : "CODE";
        const lineCount = codeBody ? codeBody.split(/\r?\n/).length : 0;
        const codeEl = buildSyntaxHighlightedCodePre(codeBody, rawLang);
        return h("div", { class: "bionic-md-code-card" }, [
          h("div", { class: "bionic-md-code-bar" }, [
            h("div", { class: "bionic-md-code-meta" }, [
              h("span", { class: "bionic-md-code-lang" }, displayLang),
              h(
                "span",
                { class: "ollama-pill" },
                `${lineCount} ${lineCount === 1 ? "line" : "lines"} • ${codeBody.length.toLocaleString()} chars`,
              ),
            ]),
            h("div", { class: "bionic-md-code-actions" }, [
              h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  title: "Toggle line wrapping inside this code block",
                  onclick: (e) => {
                    const wrapped = codeEl.classList.toggle("is-wrapped");
                    e.currentTarget.textContent = wrapped ? "↩ Wrap: ON" : "↔ Wrap: OFF";
                  },
                },
                uiState.codeWrap !== false ? "↩ Wrap: ON" : "↔ Wrap: OFF",
              ),
              h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini is-primary",
                  title: `Copy ${displayLang} code block`,
                  onclick: (e) => void copyBionicText(codeBody, `${displayLang} snippet`, e.currentTarget),
                },
                "📋 Copy Code",
              ),
            ]),
          ]),
          codeEl,
        ]);
      }
      case "a": {
        const href = String(node.href || "").trim();
        return h(
          "span",
          {
            class: "bionic-md-link",
            title: href ? `Link: ${href} (click to copy URL)` : "Link",
            role: "button",
            tabindex: "0",
            onclick: (e) => {
              if (href) void copyBionicText(href, "URL", e.currentTarget);
            },
          },
          (node.children || []).map((c) => renderAstNode(c)),
        );
      }
      case "blockquote": {
        const rawQuoteText = mdNodePlainText(node).trim();
        const alertMatch = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(rawQuoteText);
        const alertKind = alertMatch ? alertMatch[1].toLowerCase() : "";
        if (alertKind && node.children?.[0]?.children?.[0]?.tag === "#text") {
          node.children[0].children[0].text = String(node.children[0].children[0].text || "").replace(
            /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i,
            "",
          );
        }
        return h(
          "blockquote",
          {
            class: `bionic-md-blockquote${alertKind ? ` is-alert-${alertKind}` : ""}`,
          },
          [
            alertKind ? h("span", { class: "bionic-md-alert-badge" }, `⚡ ${alertKind.toUpperCase()}`) : null,
            ...(node.children || []).map((c) => renderAstNode(c)),
          ],
        );
      }
      case "ul":
        return h(
          "ul",
          {},
          (node.children || []).map((c) => renderAstNode(c)),
        );
      case "ol":
        return h(
          "ol",
          { start: node.start > 1 ? String(node.start) : null },
          (node.children || []).map((c) => renderAstNode(c)),
        );
      case "li": {
        if (node.checked !== undefined) {
          return h("li", { class: "bionic-md-task-item" }, [
            h(
              "span",
              {
                class: "bionic-md-task-box",
                "aria-label": node.checked ? "Completed task" : "Pending task",
              },
              node.checked ? "☑" : "☐",
            ),
            h("span", {}, (node.children || []).map((c) => renderAstNode(c))),
          ]);
        }
        return h(
          "li",
          {},
          (node.children || []).map((c) => renderAstNode(c)),
        );
      }
      case "table": {
        const theadNode = (node.children || []).find((c) => c.tag === "thead");
        const tbodyNode = (node.children || []).find((c) => c.tag === "tbody");
        const headerTexts =
          theadNode?.children?.[0]?.children?.map((th) => mdNodePlainText(th).trim()) || [];
        const thEls = (theadNode?.children?.[0]?.children || []).map((th) =>
          h(
            "th",
            { scope: "col", style: th.align ? `text-align:${th.align}` : null },
            (th.children || []).map((c) => renderAstNode(c)),
          ),
        );
        const trEls = (tbodyNode?.children || []).map((tr) =>
          h(
            "tr",
            {},
            (tr.children || []).map((td, colIdx) =>
              h(
                colIdx === 0 ? "th" : "td",
                {
                  scope: colIdx === 0 ? "row" : null,
                  "data-col-label": headerTexts[colIdx] || `Col ${colIdx + 1}`,
                  style: td.align ? `text-align:${td.align}` : null,
                },
                (td.children || []).map((c) => renderAstNode(c)),
              ),
            ),
          ),
        );
        return h(
          "div",
          {
            class: "bionic-md-table-wrap",
            tabindex: "0",
            role: "region",
            "aria-label": "Formatted Markdown data table",
          },
          [
            h("table", { class: "bionic-md-table" }, [
              h("thead", {}, [h("tr", {}, thEls)]),
              h("tbody", {}, trEls),
            ]),
          ],
        );
      }
      default: {
        if (/^h[1-6]$/.test(node.tag)) {
          const level = Number(node.tag.slice(1)) || 1;
          const headingText = mdNodePlainText(node).trim() || `Section ${headings.length + 1}`;
          const domId = `bionic-md-h-${clearScope}-${headings.length}`;
          const el = h(
            node.tag,
            { id: domId },
            [
              h("span", { class: "bionic-md-heading-anchor" }, `#`.repeat(Math.min(level, 3))),
              ...(node.children || []).map((c) => renderAstNode(c)),
            ],
          );
          headings.push({ level, text: headingText, domId, el });
          return el;
        }
        return h(
          node.tag || "p",
          {},
          (node.children || []).map((c) => renderAstNode(c, colHeaders)),
        );
      }
    }
  }

  const renderedBlocks = nodes.map((n) => renderAstNode(n));
  const fmEl =
    frontmatter.length > 0
      ? h("div", { class: "bionic-md-frontmatter" }, [
          h("div", { class: "bionic-md-fm-title" }, [
            h("span", { class: "ollama-pill is-mlx" }, "📄 YAML Frontmatter Metadata"),
          ]),
          h(
            "div",
            { class: "bionic-md-fm-grid" },
            frontmatter.map(([k, v]) =>
              h("div", { class: "bionic-md-fm-item" }, [
                h("span", { class: "bionic-md-fm-key" }, k),
                h("span", { class: "bionic-md-fm-val" }, v),
              ]),
            ),
          ),
        ])
      : null;

  return { fmEl, renderedBlocks, headings };
}

function scrollBionicConsoleOutput(btnEl, direction = "top") {
  const consoleEl =
    btnEl?.closest?.(".ollama-output-console") ||
    rootContainer?.querySelector?.(".ollama-output-console");
  if (!consoleEl) return;
  for (const box of consoleEl.querySelectorAll(".bionic-md-viewer, .ollama-output-box, .ollama-thinking-box")) {
    box.scrollTo({
      top: direction === "bottom" ? box.scrollHeight : 0,
      behavior: "smooth",
    });
  }
}

export function stopBionicGeneration() {
  if (uiState.abortController) {
    try {
      uiState.abortController.abort();
    } catch {
      // ignore
    }
    uiState.abortController = null;
  }
  uiState.loading = false;
  uiState.routeBanner = "⏹ Bionic generation stopped by user.";
  toast("Stopped LM Studio Bionic generation.");
  renderBionicPanel();
}

function renderBionicOutputConsole({
  title = "LM Studio Bionic Output Console",
  badge = "",
  content = "",
  reasoning = "",
  audioUrl = "",
  clearScope = "assistant",
  saveName = "bionic-output",
  showWhenEmpty = false,
  emptyHint = "Output will appear here in rich Markdown view — use ⤢ Expand Output or ⛶ Fullscreen anytime for full-viewport reading, or use Copy Output, Read Aloud (Phonon 40M), Save to Folder, or Clear Output.",
}) {
  const hasContent = Boolean(String(content || "").trim());
  const hasReasoning = Boolean(String(reasoning || "").trim());
  if (!hasContent && !hasReasoning && !audioUrl && !showWhenEmpty) return null;

  const stats = computeTextTelemetry(content || reasoning);
  const combinedText =
    hasReasoning && hasContent
      ? `[Bionic Step-by-Step Reasoning]\n${reasoning}\n\n[Final Answer]\n${content}`
      : hasContent
        ? content
        : reasoning;

  const mdBuilt = hasContent && uiState.markdownView ? buildBionicMarkdownDom(content, clearScope) : null;
  const headingList = mdBuilt?.headings || [];
  const consoleClasses = [
    "ollama-output-console",
    uiState.outputExpanded ? "is-expanded" : "",
    uiState.outputFullscreen ? "is-fullscreen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return h(
    "div",
    {
      class: consoleClasses,
      "data-bionic-output-console": clearScope,
      style: `--bionic-md-font-size: ${uiState.mdFontScale}px;`,
    },
    [
      h("div", { class: "ollama-output-header" }, [
        h("div", { class: "ollama-output-title-group" }, [
          uiState.loading ? h("span", { class: "ollama-spinner" }) : h("span", { class: "ollama-status-pulse" }),
          h("strong", { class: "ollama-output-title" }, title),
          badge ? h("span", { class: "ollama-pill is-mlx" }, badge) : null,
          hasContent || hasReasoning
            ? h(
                "span",
                { class: "ollama-pill is-ram" },
                `${stats.words.toLocaleString()} words • ${stats.chars.toLocaleString()} chars • ${stats.lines} lines`,
              )
            : h("span", { class: "ollama-pill" }, uiState.loading ? "Generating..." : "Ready"),
        ]),
        h("div", { class: "ollama-output-toolbar" }, [
          uiState.loading
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-danger is-mini",
                  "data-bionic-action": "stop-generation",
                  title: "Stop LLM generation immediately",
                  onclick: () => stopBionicGeneration(),
                },
                "⏹ Stop",
              )
            : null,
          h(
            "button",
            {
              type: "button",
              class: `ollama-btn is-mini${uiState.outputExpanded ? " is-primary" : ""}`,
              "data-bionic-action": "toggle-expand-output",
              "aria-pressed": String(Boolean(uiState.outputExpanded)),
              title: "Expand Output Console and collapse prompt banners above so the LLM response fills the panel",
              onclick: (e) => {
                uiState.outputExpanded = !uiState.outputExpanded;
                if (!uiState.outputExpanded) uiState.outputFullscreen = false;
                renderBionicPanel();
                const consoleEl =
                  e.currentTarget?.closest?.(".ollama-output-console") ||
                  rootContainer?.querySelector?.(".ollama-output-console");
                consoleEl?.scrollIntoView?.({ behavior: "smooth", block: "start" });
              },
            },
            uiState.outputExpanded ? "⤡ Compact View" : "⤢ Expand Output",
          ),
          h(
            "button",
            {
              type: "button",
              class: `ollama-btn is-mini${uiState.outputFullscreen ? " is-primary" : ""}`,
              "data-bionic-action": "toggle-fullscreen-output",
              "aria-pressed": String(Boolean(uiState.outputFullscreen)),
              title: "Toggle Fullscreen Reader Mode across the entire window",
              onclick: () => {
                uiState.outputFullscreen = !uiState.outputFullscreen;
                if (uiState.outputFullscreen) uiState.outputExpanded = true;
                renderBionicPanel();
              },
            },
            uiState.outputFullscreen ? "✕ Exit Fullscreen" : "⛶ Fullscreen",
          ),
          h(
            "button",
            {
              type: "button",
              class: `ollama-btn is-mini${uiState.markdownView ? " is-primary" : ""}`,
              "aria-pressed": uiState.markdownView ? "true" : "false",
              title: "Toggle between formatted Markdown reader view and raw source text",
              onclick: () => {
                uiState.markdownView = !uiState.markdownView;
                renderBionicPanel();
              },
            },
            uiState.markdownView ? "📖 Markdown View" : "{ } Raw Text",
          ),
          headingList.length >= 2 && uiState.markdownView
            ? h(
                "button",
                {
                  type: "button",
                  class: `ollama-btn is-mini${uiState.showOutline ? " is-primary" : ""}`,
                  "aria-pressed": uiState.showOutline ? "true" : "false",
                  title: "Show or hide clickable Markdown section outline",
                  onclick: () => {
                    uiState.showOutline = !uiState.showOutline;
                    renderBionicPanel();
                  },
                },
                `☰ Outline (${headingList.length})`,
              )
            : null,
          hasContent && uiState.markdownView
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  title: "Decrease Markdown reader font size",
                  onclick: () => {
                    uiState.mdFontScale = Math.max(11.5, uiState.mdFontScale - 1);
                    renderBionicPanel();
                  },
                },
                "A−",
              )
            : null,
          hasContent && uiState.markdownView
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  title: "Increase Markdown reader font size",
                  onclick: () => {
                    uiState.mdFontScale = Math.min(20, uiState.mdFontScale + 1);
                    renderBionicPanel();
                  },
                },
                "A+",
              )
            : null,
          hasContent || hasReasoning
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  title: "Scroll to top of output",
                  onclick: (e) => scrollBionicConsoleOutput(e.currentTarget, "top"),
                },
                "⬆ Top",
              )
            : null,
          hasContent || hasReasoning
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  title: "Scroll to bottom of output",
                  onclick: (e) => scrollBionicConsoleOutput(e.currentTarget, "bottom"),
                },
                "⬇ Bottom",
              )
            : null,
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-copy-btn",
              disabled: !hasContent && !hasReasoning ? "disabled" : null,
              onclick: (e) => void copyBionicText(hasContent ? content : reasoning, title, e.currentTarget),
            },
            "📋 Copy Output",
          ),
          hasReasoning
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  onclick: (e) => void copyBionicText(reasoning, "Bionic Reasoning Trace", e.currentTarget),
                },
                "🧠 Copy Reasoning",
              )
            : null,
          hasContent
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  onclick: () => void speakTextWithBionic(content),
                },
                "🔊 Read Aloud (Phonon 40M)",
              )
            : null,
          hasContent || hasReasoning
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  onclick: () => void saveBionicOutputToFolder(combinedText, saveName),
                },
                "💾 Save to Folder",
              )
            : null,
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-danger is-clear-btn",
              disabled: !hasContent && !hasReasoning && !audioUrl ? "disabled" : null,
              onclick: () => clearBionicOutput(clearScope),
            },
            "🧹 Clear",
          ),
        ]),
      ]),
      uiState.lastStats && clearScope === "assistant"
        ? h("div", { class: "bionic-telemetry-strip" }, [
            uiState.lastStats.tokensPerSecond > 0
              ? h("span", { class: "ollama-pill is-mlx" }, `⚡ ${uiState.lastStats.tokensPerSecond} tok/s`)
              : null,
            uiState.lastStats.timeToFirstToken > 0
              ? h("span", { class: "ollama-pill is-ram" }, `TTFT: ${uiState.lastStats.timeToFirstToken}s`)
              : null,
            uiState.lastStats.promptTokens > 0
              ? h(
                  "span",
                  { class: "ollama-pill" },
                  `Tokens: ${uiState.lastStats.promptTokens} prompt + ${uiState.lastStats.completionTokens} completion (${uiState.lastStats.reasoningTokens} reasoning)`,
                )
              : null,
            uiState.lastRuntime
              ? h(
                  "span",
                  { class: "ollama-pill is-cloud" },
                  `Engine: ${uiState.lastRuntime.name} v${uiState.lastRuntime.version} (${uiState.lastRuntime.format})`,
                )
              : null,
          ])
        : null,
      hasReasoning
        ? h("details", { class: "ollama-thinking-details", open: !hasContent ? "open" : null }, [
            h("summary", { class: "ollama-thinking-summary" }, [
              h("span", {}, `🧠 Bionic Step-by-Step Reasoning Trace (${reasoning.length.toLocaleString()} chars — click to expand)`),
            ]),
            uiState.markdownView
              ? h(
                  "div",
                  {
                    class: "bionic-md-viewer",
                    style: "max-block-size: min(210px, 26vh); padding: 10px 14px;",
                    tabindex: "0",
                    role: "region",
                    "aria-label": "Bionic step-by-step reasoning trace",
                  },
                  buildBionicMarkdownDom(reasoning, `${clearScope}-reasoning`).renderedBlocks,
                )
              : h(
                  "div",
                  {
                    class: "ollama-thinking-box",
                    tabindex: "0",
                    role: "region",
                    "aria-label": "Bionic step-by-step reasoning trace",
                  },
                  reasoning,
                ),
          ])
        : null,
      headingList.length >= 2 && uiState.markdownView && uiState.showOutline
        ? h(
            "div",
            {
              class: "bionic-md-outline-bar",
              role: "navigation",
              "aria-label": "Markdown section outline",
            },
            [
              h("strong", {}, "Jump to Section:"),
              ...headingList.map((hd) =>
                h(
                  "button",
                  {
                    type: "button",
                    class: "bionic-md-outline-chip",
                    onclick: () => {
                      hd.el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                    },
                  },
                  `${"#".repeat(Math.min(hd.level, 3))} ${hd.text}`,
                ),
              ),
            ],
          )
        : null,
      hasContent
        ? uiState.markdownView && mdBuilt
          ? h(
              "div",
              {
                class: "bionic-md-viewer",
                tabindex: "0",
                role: "region",
                "aria-label": title,
              },
              [mdBuilt.fmEl, ...mdBuilt.renderedBlocks],
            )
          : h(
              "div",
              {
                class: "ollama-output-box ollama-prose",
                tabindex: "0",
                role: "region",
                "aria-label": title,
              },
              content,
            )
        : !hasReasoning
          ? h("div", { class: "ollama-output-empty" }, emptyHint)
          : null,
      audioUrl
        ? h("div", { class: "ollama-audio-bar" }, [
            h("span", { class: "ollama-pill is-mlx" }, "🔊 Bionic Phonon 40M Multilingual 24kHz Audio Ready"),
            createAudioPlayerEl(audioUrl),
          ])
        : null,
    ],
  );
}

export async function refreshBionicStatus(silent = false) {
  if (!silent) uiState.loading = true;
  renderBionicPanel();
  try {
    const res = await call("bionic/status", { dirPath: currentFolderRel() });
    uiState.statusData = res;
    uiState.pendingActions = Array.isArray(res.pendingActions) ? res.pendingActions : [];
    if (!uiState.selectedModel && Array.isArray(res.models) && res.models.length > 0) {
      const loadedChat = res.models.find((m) => m.loaded && (m.type === "llm" || m.type === "vlm"));
      const anyChat = res.models.find((m) => m.type === "llm" || m.type === "vlm");
      if (loadedChat) uiState.selectedModel = loadedChat.id;
      else if (anyChat) uiState.selectedModel = anyChat.id;
    }
    syncBionicSelectedModelState();
    if (res.tts?.selection?.voiceName) {
      uiState.selectedVoice = res.tts.selection.voiceName;
    }
    if (res.tts?.selection?.language) {
      uiState.selectedLanguage = res.tts.selection.language;
    }
  } catch (err) {
    if (!silent) toast(err.message || "Could not load LM Studio Bionic status", { kind: "error" });
  } finally {
    uiState.loading = false;
    renderBionicPanel();
  }
}

async function runBionicSmartRouter(customPrompt) {
  const paths = selectedFilePaths();
  let livePrompt =
    customPrompt !== undefined
      ? String(customPrompt).trim()
      : String(promptTextareaEl ? promptTextareaEl.value : uiState.promptText || "").trim();

  if (uiState.selectedSkill && livePrompt && !livePrompt.includes(`@${uiState.selectedSkill}`)) {
    livePrompt = `@${uiState.selectedSkill} ${livePrompt}`;
  }
  if (customPrompt === undefined) {
    uiState.promptText = livePrompt;
  }
  if (livePrompt) {
    uiState.lastSubmittedPrompt = livePrompt;
  }
  if (!livePrompt && paths.length === 0) {
    toast("Type a plain-English request, trigger a @skill, or select a file to analyze.");
    return;
  }

  const hasImageSel = paths.some((p) => /\.(png|jpe?g|webp|gif|bmp|heic|tiff?|avif)$/i.test(String(p || "")));
  const hasMediaSel = paths.some((p) => /\.(wav|mp3|m4a|flac|ogg|mp4|mov|webm)$/i.test(String(p || "")));
  if (!livePrompt && paths.length > 0 && !uiState.speakReply && !hasMediaSel) {
    livePrompt = hasImageSel
      ? "Describe and analyze the selected image in detail."
      : "Summarize and explain the selected file.";
  }

  if (uiState.abortController) {
    try {
      uiState.abortController.abort();
    } catch {
      // ignore
    }
  }
  const abortController = new AbortController();
  uiState.abortController = abortController;
  uiState.loading = true;
  uiState.refusalBanner = null;
  uiState.lastAudioUrl = "";
  uiState.routeBanner = "Routing request through LM Studio Bionic Capability Router...";
  renderBionicPanel();

  try {
    const thinkArgs = resolveBionicThinkPayload();
    const samplingArgs = buildBionicSamplingPayload();
    if (livePrompt && uiState.schemaPreset) {
      const chatRes = await call(
        "bionic/chat",
        {
          model: uiState.selectedModel || undefined,
          prompt: livePrompt,
          paths,
          dirPath: currentFolderRel(),
          skill: uiState.selectedSkill || undefined,
          schemaPreset: uiState.schemaPreset,
          speakReply: uiState.speakReply,
          voice: uiState.selectedVoice,
          enableTools: true,
          think: thinkArgs.think,
          thinkingLevel: thinkArgs.thinkingLevel,
          ...samplingArgs,
        },
        { signal: abortController.signal },
      );
      uiState.routeBanner = `Executed Grammar-Constrained JSON (${uiState.schemaPreset}) via ${chatRes.model} (thinking=${chatRes.thinkingLevel || thinkArgs.thinkingLevel})`;
      uiState.reasoningOutput = chatRes.reasoningText || "";
      uiState.answerOutput = chatRes.content || "";
      uiState.structuredOutput = chatRes.structuredJson || null;
      uiState.lastStats = chatRes.stats || null;
      uiState.lastRuntime = chatRes.runtime || null;
      if (chatRes.speechResult?.audioUrl) {
        uiState.lastAudioUrl = `${chatRes.speechResult.audioUrl}&token=${encodeURIComponent(getToken())}`;
      }
    } else {
      const routed = await call(
        "bionic/route",
        {
          prompt: livePrompt,
          paths,
          dirPath: currentFolderRel(),
          model: uiState.selectedModel || undefined,
          voice: uiState.selectedVoice,
          language: uiState.selectedLanguage,
          speakReply: uiState.speakReply,
          think: thinkArgs.think,
          thinkingLevel: thinkArgs.thinkingLevel,
          ...samplingArgs,
        },
        { signal: abortController.signal },
      );
      uiState.routeBanner = routed.routeExplanation || `Routed to ${routed.routedCapability}`;
      const r = routed.result || {};
      if (routed.routedCapability === "speech") {
        uiState.reasoningOutput = "";
        uiState.answerOutput = `Bionic Phonon 40M Multilingual TTS (${r.voice}, ${r.language}, ${r.sampleRate} Hz, ~${r.durationSecondsEstimate}s):\n\n${r.cleanedText}`;
        uiState.lastAudioUrl = r.audioUrl ? `${r.audioUrl}&token=${encodeURIComponent(getToken())}` : "";
        if (r.savedRelativePath) refresh();
      } else if (routed.routedCapability === "transcribe") {
        uiState.reasoningOutput = "";
        uiState.answerOutput = r.transcript || "";
        uiState.asrResult = r;
        if (r.savedRelativePath) refresh();
      } else if (routed.routedCapability === "semantic_search") {
        uiState.meaningMatches = r.matches || [];
        uiState.answerOutput = (r.matches || [])
          .map((m, i) => `${i + 1}. ${m.path} (${(m.similarity * 100).toFixed(1)}% match)\n   ${m.preview}`)
          .join("\n\n");
      } else {
        if (r.model) {
          uiState.selectedModel = r.model;
          syncBionicSelectedModelState();
        }
        uiState.reasoningOutput = r.reasoningText || "";
        uiState.answerOutput = r.content || "";
        uiState.structuredOutput = r.structuredJson || null;
        uiState.lastStats = r.stats || null;
        uiState.lastRuntime = r.runtime || null;
        if (Array.isArray(r.pendingActions) && r.pendingActions.length > 0) {
          uiState.pendingActions = r.pendingActions;
        }
        if (r.speechResult?.audioUrl) {
          uiState.lastAudioUrl = `${r.speechResult.audioUrl}&token=${encodeURIComponent(getToken())}`;
        }
      }
    }
  } catch (err) {
    if (err?.name === "AbortError" || err?.code === "ABORTED" || abortController.signal.aborted) {
      uiState.routeBanner = "⏹ Bionic generation stopped by user.";
      if (!uiState.answerOutput) {
        uiState.answerOutput = "[Generation stopped by user]";
      }
    } else if (err.code === "HARDWARE_RAM_REFUSAL" || err.code === "HARDWARE_MLX_EXCLUSIVITY") {
      uiState.refusalBanner = { code: err.code, message: err.message };
    } else {
      toast(err.message || "Bionic request failed", { kind: "error" });
      uiState.answerOutput = `Error (${err.code || "ERR"}): ${err.message}`;
    }
  } finally {
    if (uiState.abortController === abortController) {
      uiState.abortController = null;
    }
    uiState.loading = false;
    renderBionicPanel();
  }
}

async function runBionicStreamChat() {
  const paths = selectedFilePaths();
  const hasImageSel = paths.some((p) => /\.(png|jpe?g|webp|gif|bmp|heic|tiff?|avif)$/i.test(String(p || "")));
  let prompt = String(promptTextareaEl ? promptTextareaEl.value : uiState.promptText || "").trim();
  uiState.promptText = prompt;
  if (prompt) {
    uiState.lastSubmittedPrompt = prompt;
  }
  if (!prompt) {
    if (paths.length > 0) {
      if (uiState.speakReply && !hasImageSel) {
        await runBionicSmartRouter("");
        return;
      }
      prompt = hasImageSel
        ? "Describe and analyze the selected image in detail."
        : "Summarize and explain the selected file.";
    } else {
      toast("Enter a message to stream from LM Studio Bionic.");
      return;
    }
  }

  if (uiState.abortController) {
    try {
      uiState.abortController.abort();
    } catch {
      // ignore
    }
  }
  const abortController = new AbortController();
  uiState.abortController = abortController;
  uiState.loading = true;
  uiState.reasoningOutput = "";
  uiState.answerOutput = "";
  uiState.routeBanner = "Streaming live tokens from Bionic /v1/chat/completions...";
  renderBionicPanel();

  try {
    const thinkArgs = resolveBionicThinkPayload();
    const samplingArgs = buildBionicSamplingPayload();
    const res = await fetch("/api/bionic/stream", {
      method: "POST",
      signal: abortController.signal,
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": getToken(),
      },
      body: JSON.stringify({
        model: uiState.selectedModel || undefined,
        prompt,
        paths: selectedFilePaths(),
        think: thinkArgs.think,
        thinkingLevel: thinkArgs.thinkingLevel,
        ...samplingArgs,
      }),
    });

    if (!res.ok || !res.body) {
      const errData = await res.json().catch(() => ({}));
      uiState.answerOutput = `Stream Error: ${errData?.error?.message || `HTTP ${res.status}`}`;
      uiState.loading = false;
      renderBionicPanel();
      return;
    }

    const usedModel = res.headers.get("X-Bionic-Model") || uiState.selectedModel || "bionic";
    const usedPort = res.headers.get("X-Bionic-Port") || "1235";
    uiState.routeBanner = `Live SSE Streaming from Bionic Server (127.0.0.1:${usedPort}, Model: ${usedModel})`;
    renderBionicPanel();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processSseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payloadStr = trimmed.slice(5).trim();
      if (!payloadStr || payloadStr === "[DONE]") return;
      try {
        const pkt = JSON.parse(payloadStr);
        const delta = pkt?.choices?.[0]?.delta || {};
        if (delta.reasoning || delta.reasoning_content) {
          uiState.reasoningOutput += delta.reasoning || delta.reasoning_content;
        }
        if (delta.content) {
          uiState.answerOutput += delta.content;
        }
      } catch {}
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) processSseLine(line);
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processSseLine(line);
      }
      renderBionicPanel();
    }
  } catch (err) {
    if (err?.name === "AbortError" || err?.code === "ABORTED" || abortController.signal.aborted) {
      uiState.routeBanner = "⏹ Bionic live stream stopped by user (partial output preserved).";
      if (!uiState.answerOutput && !uiState.reasoningOutput) {
        uiState.answerOutput = "[Live stream stopped by user]";
      }
    } else {
      uiState.answerOutput = `Stream failed: ${err.message}`;
    }
  } finally {
    if (uiState.abortController === abortController) {
      uiState.abortController = null;
    }
    uiState.loading = false;
    renderBionicPanel();
  }
}

async function runBionicSynthesisFlow(pathsOverride = null, mode = "compare", saveToFile = false) {
  const paths = Array.isArray(pathsOverride) && pathsOverride.length > 0 ? pathsOverride : selectedFilePaths();
  if (!paths.length) {
    toast("Select 1 or more files or document packages in the file list first to synthesize.");
    return;
  }
  if (uiState.abortController) {
    try {
      uiState.abortController.abort();
    } catch {
      // ignore
    }
  }
  const abortController = new AbortController();
  uiState.abortController = abortController;
  uiState.subTab = "assistant";
  uiState.loading = true;
  uiState.markdownView = true;
  uiState.routeBanner = `🧬 Synthesizing ${paths.length} ${paths.length === 1 ? "file" : "files"} (${mode})...`;
  renderBionicPanel();
  try {
    const res = await call(
      "bionic/synthesize",
      {
        paths,
        mode,
        model: uiState.selectedModel || undefined,
        saveToFile,
        dirPath: currentFolderRel(),
      },
      { signal: abortController.signal },
    );
    uiState.answerOutput = res.reportMarkdown || "";
    uiState.reasoningOutput = "";
    uiState.routeBanner = `📑 Synthesized ${res.fileCount} ${res.fileCount === 1 ? "document" : "documents"} (${res.mode} via ${res.engine})${
      res.savedRelativePath ? ` · Saved to ${res.savedRelativePath}` : ""
    }`;
    if (res.savedRelativePath) {
      toast(`Saved synthesis report: ${res.savedRelativePath}`);
      await refresh().catch(() => {});
    } else {
      toast(`Synthesized ${res.fileCount} ${res.fileCount === 1 ? "document" : "documents"} in Bionic Markdown Reader`);
    }
  } catch (err) {
    if (err?.name === "AbortError" || err?.code === "ABORTED" || abortController.signal.aborted) {
      uiState.routeBanner = "⏹ Synthesis stopped by user.";
    } else {
      uiState.answerOutput = `Synthesis failed: ${err.message || err}`;
      toast(err.message || "Synthesis failed", { kind: "error" });
    }
  } finally {
    if (uiState.abortController === abortController) {
      uiState.abortController = null;
    }
    uiState.loading = false;
    renderBionicPanel();
  }
}

function renderHeroBanner() {
  const st = uiState.statusData;
  const hw = st?.hardware;
  const srv = st?.server;
  const apps = st?.apps;
  const loaded = st?.loadedModels || [];
  const tts = st?.tts;
  const lifecycle = st?.lifecycle;
  const activePolicy = lifecycle?.exitPolicy || "smart";

  const pills = [];
  if (apps?.bionicAppInstalled) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-mlx" },
        `Bionic.app Installed${apps.bionicInternalPort ? ` (RPC :${apps.bionicInternalPort})` : ""}`,
      ),
    );
  }
  if (srv) {
    pills.push(
      h(
        "span",
        { class: `ollama-pill ${srv.running ? "is-mlx" : "is-warn"}` },
        srv.running ? `lms Server Active (:${srv.port})` : "lms Server Stopped",
      ),
    );
  }
  if (hw) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-ram" },
        `70% Safe RAM Budget: ${hw.safeMemoryBudgetGb} GB / ${hw.totalRamGb} GB`,
      ),
    );
  }
  if (tts?.engineInstalled) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-mlx" },
        `Phonon 40M Metal TTS (${tts.selection?.voiceName || "Zoey"})`,
      ),
    );
  }
  if (loaded.length > 0) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-cloud" },
        `Loaded in Metal RAM: ${loaded.map((m) => m.displayName || m.id).join(", ")}`,
      ),
    );
  }
  const cloudCount = st?.cloudModels?.length || 0;
  if (cloudCount > 0) {
    pills.push(
      h(
        "span",
        { class: "ollama-pill is-cloud" },
        `☁️ ${cloudCount} Bionic Cloud Models (0 GB RAM)`,
      ),
    );
  }

  return h("div", { class: "ollama-hero-banner" }, [
    h("div", { class: "ollama-hero-left" }, [
      h("div", { class: "ollama-hero-title-row" }, [
        uiState.loading
          ? h("span", { class: "ollama-spinner", title: "Bionic Operation in Progress" })
          : h("span", { class: "ollama-status-pulse", title: "LM Studio Bionic Active" }),
        h("span", { class: "ollama-hero-title" }, "🧬 LM Studio Bionic AI Studio, Agent Skills & Metal Engine Hub"),
        ...pills,
      ]),
      h(
        "div",
        { class: "ollama-hero-sub" },
        "Native Apple Silicon MLX / oMLX / Splash / llama.cpp LLMs & VLMs • @Skill Agent Injection • Bionic Workspace Projects • Phonon 40M Multilingual 24kHz Metal TTS • ExecuTorch Whisper ASR • Nomic Embeddings.",
      ),
    ]),
    h("div", { class: "ollama-row" }, [
      h("label", { class: "ollama-row", title: "Configure how Bionic models & server behave when closing File Manager" }, [
        h("span", { class: "ollama-close-label" }, "On Close:"),
        h(
          "select",
          {
            class: "ollama-select",
            "aria-label": "Bionic exit lifecycle policy",
            onchange: async (e) => {
              try {
                const updated = await call("bionic/lifecycle", { exitPolicy: e.target.value });
                if (uiState.statusData) uiState.statusData.lifecycle = updated;
                toast(`Updated Bionic exit policy: ${updated.summaryLabel}`);
                renderBionicPanel();
              } catch (err) {
                toast(err.message, { kind: "error" });
              }
            },
          },
          [
            h("option", { value: "smart", selected: activePolicy === "smart" ? "selected" : null }, "Smart (Preserve Pre-Existing Bionic)"),
            h("option", { value: "unload_all", selected: activePolicy === "unload_all" ? "selected" : null }, "Unload Models on Close"),
            h("option", { value: "stop_server", selected: activePolicy === "stop_server" ? "selected" : null }, "Unload Models & Stop Server"),
            h("option", { value: "keep_open", selected: activePolicy === "keep_open" ? "selected" : null }, "Keep Everything Open"),
          ],
        ),
      ]),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          title: "Start or verify local LM Studio Bionic HTTP server (`lms server start`)",
          onclick: async () => {
            try {
              const res = await call("bionic/server", { action: "start" });
              toast(res.running ? `Bionic HTTP Server running on 127.0.0.1:${res.port}` : "Started Bionic server");
              void refreshBionicStatus(true);
            } catch (err) {
              toast(err.message, { kind: "error" });
            }
          },
        },
        srv?.running ? `✔ Server Active (:${srv.port})` : "⚡ Start Bionic Server (lms server start)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Launch Bionic.app desktop application",
          onclick: async () => {
            try {
              const res = await call("bionic/server", { action: "launch_app" });
              toast(res.launched ? `Launched ${res.app}` : res.message || "Opened Bionic");
            } catch (err) {
              toast(err.message, { kind: "error" });
            }
          },
        },
        "🚀 Open Bionic.app",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-danger",
          title: "Unload all models from Metal RAM (`lms unload --all`)",
          onclick: async () => {
            try {
              const res = await call("bionic/unload", { all: true });
              toast(res.message);
              void refreshBionicStatus(true);
            } catch (err) {
              toast(err.message, { kind: "error" });
            }
          },
        },
        "Free Metal RAM (lms unload)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          onclick: () => void refreshBionicStatus(false),
        },
        uiState.loading ? [h("span", { class: "ollama-spinner" }), " Refreshing..."] : "Refresh",
      ),
    ]),
  ]);
}

function renderModeTabs() {
  const skillCount = uiState.statusData?.skills?.length || 8;
  const modelCount = uiState.statusData?.models?.length || 0;
  const cloudCount = uiState.statusData?.cloudModels?.length || 0;
  const modelsLabel =
    cloudCount > 0
      ? `5. Models (${modelCount} Local + ${cloudCount} Cloud), Metal Engines & Hardware Guard`
      : `5. Models (${modelCount}), Metal Engines & Hardware Guard`;
  const tabs = [
    { id: "assistant", label: "1. Bionic AI & @Skills Router" },
    { id: "skills", label: `2. Agent Skills (${skillCount}) & Bionic Projects` },
    { id: "speech_asr", label: "3. Phonon 40M TTS & Whisper ASR" },
    { id: "meaning", label: "4. Embeddings & Meaning Search (/v1/embeddings)" },
    { id: "models", label: modelsLabel },
  ];

  return h(
    "div",
    {
      class: "ollama-mode-nav",
      role: "tablist",
      "aria-label": "LM Studio Bionic Studio Modes",
    },
    tabs.map((t, idx) =>
      h(
        "button",
        {
          type: "button",
          role: "tab",
          "data-bionic-subtab": t.id,
          "aria-selected": uiState.subTab === t.id ? "true" : "false",
          tabindex: uiState.subTab === t.id ? "0" : "-1",
          class: `ollama-mode-btn${uiState.subTab === t.id ? " is-active" : ""}`,
          onclick: () => {
            uiState.subTab = t.id;
            renderBionicPanel();
          },
          onkeydown: (e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
              e.preventDefault();
              const nextIdx =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? tabs.length - 1
                    : (idx + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              uiState.subTab = tabs[nextIdx].id;
              renderBionicPanel();
              const btns = rootContainer?.querySelectorAll(".ollama-mode-nav [role='tab']");
              btns?.[nextIdx]?.focus?.();
            }
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
        : [h("span", {}, "None (select any file, image, or audio clip in the file list to inspect or process)")]),
    ]),
  ]);
}

function renderBionicSelectedModelCapabilitiesCard(profile) {
  if (!profile) return null;
  const f = profile.features || {};
  return h(
    "div",
    {
      class: "bionic-model-capabilities-card",
      role: "region",
      "aria-label": `Selected Model Capabilities (${profile.modelName || "Auto"})`,
      "data-bionic-model-capabilities-card": profile.modelName,
      "data-thinking-mode": f.thinkingMode || "none",
    },
    [
      h("div", { class: "ollama-row", style: "flex-wrap:wrap;gap:6px;align-items:center;" }, [
        h(
          "strong",
          { style: "font-size:12px;" },
          `Selected Model Capabilities (${profile.modelName || "Auto"}):`,
        ),
        ...(profile.indicators || []).map((ind) =>
          h(
            "span",
            {
              class: "ollama-pill is-mlx",
              "data-bionic-model-indicator": ind.id,
              title: ind.description,
              style: "font-size:11px;padding:2px 8px;",
            },
            `${ind.icon} ${ind.label}`,
          ),
        ),
      ]),
      h(
        "div",
        { class: "ollama-model-use-cases" },
        `What you can use this model for: ${(profile.useCases || []).join(" • ")}`,
      ),
    ],
  );
}

function renderBionicThinkingControlBar() {
  const caps = getBionicModelThinkingCapabilities(uiState.selectedModel);
  const thinkArgs = resolveBionicThinkPayload();
  const activeLevel = thinkArgs.thinkingLevel;

  const samplingBtn = h(
    "button",
    {
      type: "button",
      class: `ollama-btn${uiState.showAdvancedSampling ? " is-primary" : ""}`,
      "data-bionic-action": "toggle-sampling",
      "aria-expanded": String(Boolean(uiState.showAdvancedSampling)),
      "aria-pressed": String(Boolean(uiState.showAdvancedSampling)),
      style: "margin-left:auto;padding:3px 10px;font-size:12px;",
      onclick: () => {
        uiState.showAdvancedSampling = !uiState.showAdvancedSampling;
        renderBionicPanel();
      },
    },
    uiState.showAdvancedSampling
      ? "⚙️ Hide LM Studio Sampling & Speculative Decoding"
      : "⚙️ Sampling, Context & Speculative Decoding",
  );

  if (!caps.supportsThinking || caps.thinkingMode === "none") {
    return h(
      "div",
      {
        class: "bionic-thinking-control-bar",
        role: "toolbar",
        "aria-label": "Bionic Reasoning and Sampling Controls",
        "data-thinking-mode": "none",
      },
      [
        h(
          "span",
          { class: "ollama-pill", title: caps.description },
          "⚡ Direct Output Model (Thinking Controls Hidden — Not Used by This Model)",
        ),
        samplingBtn,
      ],
    );
  }

  const pillDefs =
    caps.thinkingMode === "levels"
      ? [
          { id: "low", label: "Low Effort", hint: "reasoning_effort: \"low\" + Harmony Reasoning: low (gpt-oss)" },
          { id: "medium", label: "Medium Effort", hint: "reasoning_effort: \"medium\" + Harmony Reasoning: medium (gpt-oss)" },
          { id: "high", label: "High Effort", hint: "reasoning_effort: \"high\" + Harmony Reasoning: high (gpt-oss)" },
        ]
      : caps.thinkingMode === "toggle"
        ? [
            { id: "off", label: "Off (Fast)", hint: "enable_thinking: false — Skip chain-of-thought for instant reply" },
            { id: "on", label: "On (Think)", hint: "enable_thinking: true — Enable chain-of-thought reasoning" },
          ]
        : [];

  const showBudgetControl =
    caps.supportsThinkingBudget &&
    (caps.thinkingMode === "always_on" || (caps.thinkingMode === "toggle" && activeLevel !== "off"));

  return h(
    "div",
    {
      class: "bionic-thinking-control-bar",
      role: "toolbar",
      "aria-label": "Bionic Reasoning and Sampling Controls",
      "data-thinking-mode": caps.thinkingMode,
    },
    [
      h(
        "span",
        {
          class: "ollama-pill is-mlx",
          title: caps.description,
        },
        `🧠 ${caps.badgeLabel}`,
      ),
      pillDefs.length > 0
        ? h(
            "div",
            { class: "ollama-row", style: "gap:4px;" },
            pillDefs.map((p) => {
              const isSelected = activeLevel === p.id;
              return h(
                "button",
                {
                  type: "button",
                  class: `ollama-btn${isSelected ? " is-primary" : ""}`,
                  "data-bionic-thinking-level": p.id,
                  "aria-pressed": String(isSelected),
                  title: p.hint,
                  style: "padding:3px 9px;font-size:12px;",
                  onclick: () => {
                    uiState.thinkingLevel = p.id;
                    uiState.thinkEnabled = p.id !== "off";
                    renderBionicPanel();
                  },
                },
                p.label,
              );
            }),
          )
        : null,
      showBudgetControl
        ? h("label", { class: "ollama-row", style: "font-size:12px;gap:4px;" }, [
            h("span", {}, "Thinking Budget:"),
            h(
              "select",
              {
                class: "ollama-select",
                "data-bionic-select": "thinking-budget",
                style: "padding:2px 6px;font-size:12px;",
                onchange: (e) => {
                  uiState.thinkingBudget = Number(e.target.value) || 0;
                },
              },
              [
                { val: 0, label: "Auto (Unlimited)" },
                { val: 1024, label: "1,024 tokens" },
                { val: 4096, label: "4,096 tokens" },
                { val: 8192, label: "8,192 tokens" },
                { val: 16384, label: "16,384 tokens" },
                { val: 32768, label: "32,768 tokens" },
              ].map((opt) =>
                h(
                  "option",
                  {
                    value: String(opt.val),
                    selected: Number(uiState.thinkingBudget) === opt.val ? "selected" : null,
                  },
                  opt.label,
                ),
              ),
            ),
          ])
        : null,
      samplingBtn,
    ],
  );
}

function renderBionicAdvancedSamplingPanel() {
  if (!uiState.showAdvancedSampling) return null;
  const models = (uiState.statusData?.models || []).filter((m) => m.type === "llm" || m.type === "vlm");
  return h(
    "div",
    {
      class: "bionic-advanced-sampling-panel",
      role: "region",
      "aria-label": "LM Studio Bionic Sampling and Speculative Decoding Parameters",
    },
    [
      h("div", { class: "ollama-row", style: "justify-content:space-between;" }, [
        h("strong", { style: "font-size:12px;" }, "⚙️ LM Studio Bionic Sampling, Context & Speculative Decoding Parameters"),
        h(
          "button",
          {
            type: "button",
            class: "ollama-btn",
            style: "padding:2px 8px;font-size:11px;",
            onclick: () => {
              uiState.contextLength = 32768;
              uiState.temperature = 0.4;
              uiState.topP = 0.95;
              uiState.topK = 40;
              uiState.minP = 0.05;
              uiState.repeatPenalty = 1.1;
              uiState.maxTokens = 16384;
              uiState.seed = "";
              uiState.stopSequences = "";
              uiState.draftModel = "";
              uiState.ttlSeconds = 0;
              uiState.customSystemPrompt = "";
              renderBionicPanel();
            },
          },
          "Reset Defaults",
        ),
      ]),
      h("div", { class: "ollama-row", style: "flex-wrap:wrap;gap:10px;font-size:12px;" }, [
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Context Length:"),
          h(
            "select",
            {
              class: "ollama-select",
              onchange: (e) => {
                uiState.contextLength = Number(e.target.value) || 32768;
              },
            },
            [4096, 8192, 16384, 32768, 65536, 131072].map((ctxVal) =>
              h(
                "option",
                {
                  value: String(ctxVal),
                  selected: Number(uiState.contextLength) === ctxVal ? "selected" : null,
                },
                `${ctxVal.toLocaleString()} tokens`,
              ),
            ),
          ),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Temperature:"),
          h("input", {
            type: "number",
            class: "ollama-input",
            style: "width:68px;",
            step: "0.05",
            min: "0",
            max: "2",
            value: String(uiState.temperature),
            oninput: (e) => {
              uiState.temperature = Number(e.target.value);
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Top-P:"),
          h("input", {
            type: "number",
            class: "ollama-input",
            style: "width:68px;",
            step: "0.05",
            min: "0",
            max: "1",
            value: String(uiState.topP),
            oninput: (e) => {
              uiState.topP = Number(e.target.value);
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Top-K:"),
          h("input", {
            type: "number",
            class: "ollama-input",
            style: "width:68px;",
            step: "1",
            min: "1",
            max: "200",
            value: String(uiState.topK),
            oninput: (e) => {
              uiState.topK = Number(e.target.value);
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Min-P:"),
          h("input", {
            type: "number",
            class: "ollama-input",
            style: "width:68px;",
            step: "0.01",
            min: "0",
            max: "1",
            value: String(uiState.minP),
            oninput: (e) => {
              uiState.minP = Number(e.target.value);
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Repeat Penalty:"),
          h("input", {
            type: "number",
            class: "ollama-input",
            style: "width:68px;",
            step: "0.05",
            min: "0.5",
            max: "2.0",
            value: String(uiState.repeatPenalty),
            oninput: (e) => {
              uiState.repeatPenalty = Number(e.target.value);
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Max Tokens:"),
          h("input", {
            type: "number",
            class: "ollama-input",
            style: "width:82px;",
            step: "256",
            min: "64",
            max: "131072",
            value: String(uiState.maxTokens),
            oninput: (e) => {
              uiState.maxTokens = Number(e.target.value);
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Seed:"),
          h("input", {
            type: "text",
            class: "ollama-input",
            style: "width:76px;",
            placeholder: "Random",
            value: String(uiState.seed),
            oninput: (e) => {
              uiState.seed = e.target.value;
            },
          }),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Draft Model (Speculative Decoding):"),
          h(
            "select",
            {
              class: "ollama-select",
              onchange: (e) => {
                uiState.draftModel = e.target.value;
              },
            },
            [
              h("option", { value: "" }, "None (Standard Decoding)"),
              ...models.map((m) =>
                h(
                  "option",
                  { value: m.id, selected: uiState.draftModel === m.id ? "selected" : null },
                  `${m.displayName} (${m.paramsString})`,
                ),
              ),
            ],
          ),
        ]),
        h("label", { class: "ollama-row", style: "gap:4px;" }, [
          h("span", {}, "Stop Sequences:"),
          h("input", {
            type: "text",
            class: "ollama-input",
            style: "width:130px;",
            placeholder: "e.g. <|eot_id|>, STOP",
            value: String(uiState.stopSequences),
            oninput: (e) => {
              uiState.stopSequences = e.target.value;
            },
          }),
        ]),
      ]),
      h("input", {
        type: "text",
        class: "ollama-input",
        placeholder: "Optional Custom System Prompt override...",
        value: uiState.customSystemPrompt,
        oninput: (e) => {
          uiState.customSystemPrompt = e.target.value;
        },
      }),
    ],
  );
}

function renderAssistantTab() {
  const models = (uiState.statusData?.models || []).filter((m) => m.type === "llm" || m.type === "vlm");
  const cloudModels = uiState.statusData?.cloudModels || [];
  const modelIds = new Set(models.map((m) => m.id));
  const cloudIds = new Set(cloudModels.map((m) => m.id));
  const skills = uiState.statusData?.skills || [];
  const voices = uiState.statusData?.tts?.voices || [];
  const selectedProfile = getBionicModelFeatureProfile(uiState.selectedModel);
  const feat = selectedProfile.features || {};

  const quickPrompts = [
    feat.chat
      ? { label: "Summarize Selected File", text: "Summarize the selected file and highlight key architecture points." }
      : null,
    feat.vision
      ? { label: "👁 Inspect Selected Image / Screenshot", text: "Inspect the selected image or screenshot and describe its contents, text, and layout." }
      : null,
    feat.thinkingLevels
      ? { label: "🧠 Multi-Level Architecture Audit (gpt-oss)", text: "Perform a deep architectural and security audit of the selected code." }
      : null,
    feat.thinking
      ? { label: "🧠 Step-by-Step Code Debug", text: "Debug this code step-by-step and explain how to fix any edge cases." }
      : null,
    { label: "🔊 Read Aloud (Phonon 40M)", text: "Read this out loud with Bionic Phonon 40M Multilingual TTS." },
    { label: "🎙️ Transcribe Audio (ASR)", text: "Transcribe this audio file to Markdown and summarize key points." },
    feat.tools
      ? { label: "📄 @documents Skill", text: "@documents-presentations-spreadsheets-and-graphics Review this document and suggest improvements." }
      : null,
    feat.tools
      ? { label: "🕒 @file-history Skill", text: "@file-history Explain how Bionic tracks file history and changes." }
      : null,
    { label: "🔍 Find File by Meaning", text: "Find the file where authentication or login verification is implemented." },
    feat.structuredJson
      ? { label: "📋 Batch Rename JSON Plan", text: "Create a batch-rename JSON plan for the selected files." }
      : null,
  ].filter(Boolean);

  promptTextareaEl = h(
    "textarea",
    {
      class: "ollama-textarea",
      "aria-label": "Ask LM Studio Bionic or trigger a @skill",
      placeholder: `Ask LM Studio Bionic anything supported by ${selectedProfile.modelName} (${selectedProfile.summary})...`,
      oninput: (e) => {
        uiState.promptText = e.target.value;
      },
      onchange: (e) => {
        uiState.promptText = e.target.value;
      },
      onkeydown: (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void runBionicSmartRouter();
          return;
        }
        if (e.key === "ArrowUp" && !String(e.target?.value || "").trim() && uiState.lastSubmittedPrompt) {
          e.preventDefault();
          uiState.promptText = uiState.lastSubmittedPrompt;
          if (e.target) e.target.value = uiState.lastSubmittedPrompt;
          return;
        }
        if (e.key === "Escape" && (uiState.outputFullscreen || uiState.outputExpanded)) {
          e.preventDefault();
          uiState.outputFullscreen = false;
          uiState.outputExpanded = false;
          renderBionicPanel();
        }
      },
    },
    uiState.promptText,
  );

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Conversational Bionic AI Assistant, @Skill Injector & Metal Capability Router"),
      h("span", { class: "ollama-pill is-mlx" }, "Apple Silicon MLX / oMLX / Splash + Phonon 40M"),
      h("span", { class: "ollama-pill", "data-bionic-kbd-hint": "true", title: "Press Enter (or Cmd/Ctrl+Enter) to submit, Shift+Enter for a newline, Up Arrow in an empty prompt to recall your last prompt, or Esc to exit fullscreen" }, "⌨️ Enter to send • Shift+Enter newline • ↑ recall"),
      cloudModels.length > 0
        ? h("span", { class: "ollama-pill is-cloud" }, `☁️ ${cloudModels.length} Bionic Cloud Models`)
        : null,
      h(
        "button",
        {
          type: "button",
          class: `ollama-btn is-mini${uiState.compactControls ? " is-primary" : ""}`,
          "data-bionic-action": "toggle-compact-controls",
          "aria-pressed": String(Boolean(uiState.compactControls)),
          title: "Collapse or restore prompt banners and model cards so the Bionic Output Console gets maximum vertical space",
          onclick: () => {
            uiState.compactControls = !uiState.compactControls;
            renderBionicPanel();
          },
        },
        uiState.compactControls ? "🔽 Show Prompt Controls" : "🔼 Compact Controls",
      ),
    ]),
    renderBionicSelectedModelCapabilitiesCard(selectedProfile),
    !uiState.compactControls && !uiState.outputExpanded && cloudModels.length > 0
      ? h(
          "div",
          {
            class: "ollama-quick-prompts",
            "data-bionic-cloud-bar": "true",
            role: "group",
            "aria-label": "Quick-select Bionic Cloud Models (0 GB Local RAM)",
          },
          [
            h("span", { class: "ollama-pill is-cloud" }, "☁️ Bionic Cloud Models (0 GB RAM):"),
            ...cloudModels.map((cm) => {
              const active = (uiState.selectedModel || "").toLowerCase() === cm.id.toLowerCase();
              return h(
                "button",
                {
                  type: "button",
                  class: `ollama-quick-chip${active ? " is-active" : ""}`,
                  "data-bionic-cloud-chip": cm.id,
                  "aria-pressed": String(active),
                  title: `Select Bionic Cloud Model ${cm.displayName} (${cm.id}) — 0 GB Local RAM, ${(cm.maxContextLength || 256000).toLocaleString()} context${cm.vision ? ", Vision VLM" : ""}`,
                  onclick: () => {
                    uiState.selectedModel = cm.id;
                    syncBionicSelectedModelState();
                    toast(`Selected Bionic Cloud Model: ${cm.displayName} (${cm.id})`);
                    renderBionicPanel();
                  },
                },
                `☁️ ${cm.displayName}${cm.vision ? " 👁" : ""}${active ? " ✓" : ""}`,
              );
            }),
          ],
        )
      : null,
    h(
      "div",
      { class: "ollama-quick-prompts" },
      quickPrompts.map((qp) =>
        h(
          "button",
          {
            type: "button",
            class: "ollama-quick-chip",
            onclick: () => void runBionicSmartRouter(qp.text),
          },
          qp.label,
        ),
      ),
    ),
    promptTextareaEl,
    renderBionicThinkingControlBar(),
    renderBionicAdvancedSamplingPanel(),
    h("div", { class: "ollama-row ollama-assistant-options-row" }, [
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Select LM Studio Bionic Model",
          "data-bionic-select": "assistant-model",
          onchange: (e) => {
            uiState.selectedModel = e.target.value;
            syncBionicSelectedModelState();
            renderBionicPanel();
          },
        },
        [
          h("option", { value: "", selected: !uiState.selectedModel ? "selected" : null }, "Auto-Select Best Loaded MLX / Cloud Model"),
          !modelIds.has("openai/gpt-oss-20b") && !cloudIds.has("openai/gpt-oss-20b")
            ? h(
                "option",
                { value: "openai/gpt-oss-20b", selected: uiState.selectedModel === "openai/gpt-oss-20b" ? "selected" : null },
                "OpenAI gpt-oss 20B (openai/gpt-oss-20b) — Multi-Level Reasoning: Low / Medium / High [MXFP4]",
              )
            : null,
          !modelIds.has("qwen/qwen3.5-9b") && !cloudIds.has("qwen/qwen3.5-9b")
            ? h(
                "option",
                { value: "qwen/qwen3.5-9b", selected: uiState.selectedModel === "qwen/qwen3.5-9b" ? "selected" : null },
                "Qwen 3.5 9B MLX (qwen/qwen3.5-9b) — Hybrid Thinking Toggle: On / Off + Vision",
              )
            : null,
          !modelIds.has("deepseek/deepseek-r1-0528-qwen3-8b") && !cloudIds.has("deepseek/deepseek-r1-0528-qwen3-8b")
            ? h(
                "option",
                { value: "deepseek/deepseek-r1-0528-qwen3-8b", selected: uiState.selectedModel === "deepseek/deepseek-r1-0528-qwen3-8b" ? "selected" : null },
                "DeepSeek-R1 8B (deepseek/deepseek-r1-0528-qwen3-8b) — Always-On Chain-of-Thought Reasoning",
              )
            : null,
          !modelIds.has("qwen/qwen2.5-coder-7b-instruct") && !cloudIds.has("qwen/qwen2.5-coder-7b-instruct")
            ? h(
                "option",
                { value: "qwen/qwen2.5-coder-7b-instruct", selected: uiState.selectedModel === "qwen/qwen2.5-coder-7b-instruct" ? "selected" : null },
                "Qwen 2.5 Coder 7B (qwen/qwen2.5-coder-7b-instruct) — Fast Direct Output (No Thinking Overhead)",
              )
            : null,
          ...models
            .filter((m) => m.type === "llm" || m.type === "vlm")
            .map((m) =>
              h(
                "option",
                { value: m.id, selected: uiState.selectedModel === m.id ? "selected" : null },
                `${m.loaded ? "✓ LOADED: " : ""}${m.displayName} (${m.id}) — ${m.paramsString}, ~${m.estimatedRamGb} GB [${m.quantization}]`,
              ),
            ),
          ...cloudModels.map((cm) =>
            h(
              "option",
              { value: cm.id, selected: uiState.selectedModel === cm.id ? "selected" : null },
              `☁️ BIONIC CLOUD: ${cm.displayName} (${cm.id}) — 0 GB Local RAM, ${Math.round((cm.maxContextLength || 256000) / 1000)}K Ctx${cm.vision ? " + Vision VLM" : ""}`,
            ),
          ),
        ].filter(Boolean),
      ),
      feat.tools
        ? h(
            "select",
            {
              class: "ollama-select",
              "aria-label": "Inject Bionic Agent Skill",
              onchange: (e) => {
                uiState.selectedSkill = e.target.value;
              },
            },
            [
              h("option", { value: "" }, "No @Skill Override (Auto-Detect @mentions)"),
              ...skills.map((s) =>
                h(
                  "option",
                  { value: s.name, selected: uiState.selectedSkill === s.name ? "selected" : null },
                  `@${s.name} — ${s.displayName} (${s.scope})`,
                ),
              ),
            ],
          )
        : null,
      feat.structuredJson
        ? h(
            "select",
            {
              class: "ollama-select",
              "aria-label": "Structured JSON Schema Output",
              onchange: (e) => {
                uiState.schemaPreset = e.target.value;
              },
            },
            [
              h("option", { value: "", selected: !uiState.schemaPreset ? "selected" : null }, "Freeform Markdown / Code Output"),
              h("option", { value: "batch_rename_plan", selected: uiState.schemaPreset === "batch_rename_plan" ? "selected" : null }, "JSON Schema: Batch Rename Plan"),
              h("option", { value: "folder_organization_plan", selected: uiState.schemaPreset === "folder_organization_plan" ? "selected" : null }, "JSON Schema: Folder Organization Plan"),
              h("option", { value: "table_extraction", selected: uiState.schemaPreset === "table_extraction" ? "selected" : null }, "JSON Schema: Structured Table Extraction"),
              h("option", { value: "code_review_report", selected: uiState.schemaPreset === "code_review_report" ? "selected" : null }, "JSON Schema: Code Review Report"),
              h("option", { value: "security_audit_report", selected: uiState.schemaPreset === "security_audit_report" ? "selected" : null }, "JSON Schema: Security Audit Report"),
            ],
          )
        : null,
      h("label", { class: "ollama-row" }, [
        h("input", {
          type: "checkbox",
          checked: uiState.speakReply ? "checked" : null,
          onchange: (e) => {
            uiState.speakReply = e.target.checked;
          },
        }),
        h("span", {}, `Speak Reply (${uiState.selectedVoice})`),
      ]),
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Select Bionic Phonon 40M Voice",
          onchange: (e) => {
            uiState.selectedVoice = e.target.value;
          },
        },
        (voices.length ? voices : [{ name: "Zoey" }, { name: "Anton" }, { name: "Marlowe" }, { name: "Maeve" }]).map((v) =>
          h(
            "option",
            { value: v.name, selected: uiState.selectedVoice === v.name ? "selected" : null },
            `Voice: ${v.name}${v.locale ? ` (${v.locale})` : ""}`,
          ),
        ),
      ),
    ]),
    h("div", { class: "ollama-row ollama-assistant-actions-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          "data-bionic-action": "ask-smart-router",
          disabled: uiState.loading ? "disabled" : null,
          onclick: () => void runBionicSmartRouter(),
        },
        uiState.loading ? [h("span", { class: "ollama-spinner" }), " Running Bionic..."] : "🧬 Ask Bionic (Smart Auto-Router)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          "data-bionic-action": "stream-live-tokens",
          disabled: uiState.loading ? "disabled" : null,
          onclick: () => void runBionicStreamChat(),
        },
        "⚡ Stream Live Tokens (/api/bionic/stream)",
      ),
      uiState.loading
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-danger",
              "data-bionic-action": "stop-generation",
              title: "Stop LLM generation immediately (preserves tokens generated so far)",
              onclick: () => stopBionicGeneration(),
            },
            "⏹ Stop Generation",
          )
        : null,
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Synthesize and compare all selected files or document packages into a structured Markdown report",
          disabled: uiState.loading ? "disabled" : null,
          onclick: () => void runBionicSynthesisFlow(null, "compare", false),
        },
        "📑 Synthesize Selected",
      ),
      h(
        "button",
        {
          type: "button",
          class: `ollama-btn${uiState.outputExpanded ? " is-primary" : ""}`,
          "data-bionic-action": "toggle-expand-output",
          "aria-pressed": String(Boolean(uiState.outputExpanded)),
          title: "Expand Output Console and collapse prompt banners above so the LLM response fills the viewport",
          onclick: () => {
            uiState.outputExpanded = !uiState.outputExpanded;
            if (!uiState.outputExpanded) uiState.outputFullscreen = false;
            renderBionicPanel();
          },
        },
        uiState.outputExpanded ? "⤡ Collapse Output" : "⤢ Expand Output",
      ),
      h(
        "button",
        {
          type: "button",
          class: `ollama-btn${uiState.outputFullscreen ? " is-primary" : ""}`,
          "data-bionic-action": "toggle-fullscreen-output",
          "aria-pressed": String(Boolean(uiState.outputFullscreen)),
          title: "Toggle Fullscreen Reader Mode across the entire window",
          onclick: () => {
            uiState.outputFullscreen = !uiState.outputFullscreen;
            if (uiState.outputFullscreen) uiState.outputExpanded = true;
            renderBionicPanel();
          },
        },
        uiState.outputFullscreen ? "✕ Exit Fullscreen" : "⛶ Fullscreen",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Load the selected file in the file list directly into the Bionic Markdown Reader",
          onclick: async () => {
            const sel = selectedFilePaths();
            if (!sel.length) {
              toast("Select a Markdown or text file in the file list first.");
              return;
            }
            try {
              const prev = await call("preview", { path: sel[0] });
              const rawText = prev.text || prev.rich?.plainText || "";
              if (!rawText) {
                toast("Selected file does not contain readable text.", { kind: "error" });
                return;
              }
              uiState.markdownView = true;
              uiState.routeBanner = `📖 Viewing Markdown File: ${sel[0]}`;
              uiState.answerOutput = rawText;
              uiState.reasoningOutput = "";
              renderBionicPanel();
              toast(`Opened ${sel[0].split("/").pop()} in Bionic Markdown Reader`);
            } catch (err) {
              toast(err.message || "Could not read file", { kind: "error" });
            }
          },
        },
        "📖 View Selected File as Markdown",
      ),
      uiState.answerOutput || uiState.reasoningOutput
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-danger",
              onclick: () => clearBionicOutput("assistant"),
            },
            "🧹 Clear Output",
          )
        : null,
    ]),
    uiState.routeBanner ? h("div", { class: "ollama-pill is-ram" }, uiState.routeBanner) : null,
    renderBionicOutputConsole({
      title: "LM Studio Bionic Response & Reasoning Console",
      badge: uiState.selectedModel || "Apple Metal MLX",
      content: uiState.answerOutput,
      reasoning: uiState.reasoningOutput,
      audioUrl: uiState.lastAudioUrl,
      clearScope: "assistant",
      saveName: "bionic-response",
      showWhenEmpty: true,
    }),
  ]);
}

function renderSkillsAndProjectsTab() {
  const skills = uiState.statusData?.skills || [];
  const counts = uiState.statusData?.skillCounts || { builtin: 0, global: 0, project: 0, harness: 0 };
  const projects = uiState.statusData?.projects || [];

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h(
        "span",
        {},
        `Bionic Agent Skills Hub (${skills.length} total — ${counts.builtin} Built-in, ${counts.global} Global, ${counts.project} Project, ${counts.harness} Harness)`,
      ),
      h("span", { class: "ollama-pill is-mlx" }, "Trigger with @skill-name in Bionic Chat"),
    ]),
    uiState.inspectedSkill
      ? renderBionicOutputConsole({
          title: `SKILL.md Markdown Inspector: @${uiState.inspectedSkill.skill?.name}`,
          badge: `Companion Files: ${(uiState.inspectedSkill.companionFiles || []).join(", ")}`,
          content: uiState.inspectedSkill.content,
          clearScope: "skill",
          saveName: `skill-${uiState.inspectedSkill.skill?.name || "bionic"}`,
        })
      : null,
    h(
      "div",
      { class: "bionic-skill-grid" },
      skills.map((s) =>
        h("div", { class: "bionic-skill-card" }, [
          h("div", { class: "ollama-row" }, [
            h("span", { class: "bionic-skill-token" }, s.triggerToken),
            h("strong", {}, s.displayName),
            h("span", { class: "ollama-pill" }, s.scope),
          ]),
          h("div", {}, s.description),
          h("div", { class: "ollama-row" }, [
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-primary is-mini",
                onclick: () => {
                  uiState.selectedSkill = s.name;
                  uiState.promptText = `${s.triggerToken} ${uiState.promptText || ""}`.trim();
                  uiState.subTab = "assistant";
                  toast(`Injected ${s.triggerToken} into Bionic prompt`);
                  renderBionicPanel();
                },
              },
              `⚡ Use ${s.triggerToken}`,
            ),
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                onclick: async () => {
                  try {
                    const detail = await call("bionic/skill/read", {
                      nameOrPath: s.name,
                      dirPath: currentFolderRel(),
                    });
                    uiState.inspectedSkill = detail;
                    renderBionicPanel();
                  } catch (err) {
                    toast(err.message, { kind: "error" });
                  }
                },
              },
              "📖 Inspect SKILL.md",
            ),
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                onclick: (e) => void copyBionicText(s.skillMdPath, `${s.name} SKILL.md path`, e.currentTarget),
              },
              "📋 Copy Path",
            ),
          ]),
        ]),
      ),
    ),
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Create New Bionic Agent Skill (SKILL.md Generator)"),
      h("span", { class: "ollama-pill is-ram" }, "Saves to <folder>/.agents/skills/<name>/SKILL.md or ~/.lmstudio/skills"),
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        "aria-label": "Skill kebab-case name",
        placeholder: "Skill name in kebab-case (e.g. code-auditor)",
        value: uiState.newSkillName,
        oninput: (e) => {
          uiState.newSkillName = e.target.value;
        },
      }),
      h("input", {
        class: "ollama-input",
        "aria-label": "Skill display name",
        placeholder: "Display Name (e.g. Code Auditor)",
        value: uiState.newSkillDisplayName,
        oninput: (e) => {
          uiState.newSkillDisplayName = e.target.value;
        },
      }),
      h("input", {
        class: "ollama-input",
        "aria-label": "Skill description",
        placeholder: "When should Bionic trigger this skill?",
        value: uiState.newSkillDesc,
        oninput: (e) => {
          uiState.newSkillDesc = e.target.value;
        },
      }),
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Skill target scope",
          onchange: (e) => {
            uiState.newSkillScope = e.target.value;
          },
        },
        [
          h("option", { value: "project-local" }, "Project Skill (<activeFolder>/.agents/skills)"),
          h("option", { value: "lmstudio-global" }, "Global Bionic Skill (~/.lmstudio/skills)"),
        ],
      ),
    ]),
    h(
      "textarea",
      {
        class: "ollama-textarea",
        "aria-label": "Skill Markdown instructions",
        placeholder: "Skill Markdown instructions...",
        oninput: (e) => {
          uiState.newSkillInstructions = e.target.value;
        },
      },
      uiState.newSkillInstructions,
    ),
    h("div", { class: "ollama-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: async () => {
            try {
              const res = await call("bionic/skill/create", {
                name: uiState.newSkillName,
                displayName: uiState.newSkillDisplayName,
                description: uiState.newSkillDesc,
                instructions: uiState.newSkillInstructions,
                scope: uiState.newSkillScope,
                dirPath: currentFolderRel(),
              });
              toast(`Created Bionic skill @${res.skill.name} at ${res.skillMdPath}`);
              refresh();
              void refreshBionicStatus(true);
            } catch (err) {
              toast(err.message, { kind: "error" });
            }
          },
        },
        "✨ Create Bionic SKILL.md",
      ),
    ]),
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, `Bionic Workspace Projects (${projects.length}) — ~/.lmstudio/apps/bionic/projects`),
    ]),
    h(
      "div",
      { class: "ollama-model-grid" },
      projects.map((p) =>
        h("div", { class: "ollama-model-card" }, [
          h("div", { class: "ollama-row" }, [
            h("strong", {}, p.name),
            h("span", { class: "ollama-pill is-mlx" }, `${p.fileCount} item(s)`),
          ]),
          h("div", {}, `Workspace: ${p.workspaceDir}`),
          h("div", { class: "ollama-row" }, [
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn",
                onclick: async () => {
                  const ok = await goTo(p.workspaceDir);
                  if (ok) {
                    if (state.workspace !== "split") closePower();
                    toast(`Opened Bionic Project Workspace: ${p.name}`);
                  }
                },
              },
              "📂 Open Workspace in File Manager",
            ),
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                onclick: (e) => void copyBionicText(p.workspaceDir, "Workspace path", e.currentTarget),
              },
              "📋 Copy Path",
            ),
          ]),
        ]),
      ),
    ),
  ]);
}

function renderSpeechAndAsrTab() {
  const tts = uiState.statusData?.tts;
  const asr = uiState.statusData?.asr;
  const voices = tts?.voices || [];
  const langs = tts?.supportedLanguages || ["en", "fr", "de", "es", "pt"];
  const sel = selectedFilePaths();

  speechTextareaEl = h(
    "textarea",
    {
      class: "ollama-textarea",
      "aria-label": "Text to synthesize with Bionic Phonon 40M Multilingual TTS",
      placeholder:
        sel.length > 0
          ? `Leave blank to read selected file (${sel[0]}) aloud, or type text in English, French, German, Spanish, or Portuguese...`
          : "Enter text to synthesize at 24kHz using Bionic's native Apple Metal Phonon 40M Multilingual engine (xn-ptts)...",
      oninput: (e) => {
        uiState.speechText = e.target.value;
      },
      onkeydown: (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !uiState.loading) {
          e.preventDefault();
          e.currentTarget.parentElement?.querySelector("button.ollama-btn.is-primary")?.click();
        }
      },
    },
    uiState.speechText,
  );

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Bionic Phonon 40M Multilingual Native Metal TTS (xn-ptts-mac-arm64-apple-metal)"),
      h(
        "span",
        { class: `ollama-pill ${tts?.engineInstalled ? "is-mlx" : "is-warn"}` },
        tts?.engineInstalled ? "✔ Native tts_engine.node + 24kHz Safetensors Voices Ready" : "Fallback TTS Active",
      ),
    ]),
    speechTextareaEl,
    h("div", { class: "ollama-row" }, [
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Select Bionic Voice",
          onchange: (e) => {
            uiState.selectedVoice = e.target.value;
          },
        },
        voices.map((v) =>
          h(
            "option",
            { value: v.name, selected: uiState.selectedVoice === v.name ? "selected" : null },
            `${v.name} (${v.gender}, ${v.locale}) — ${v.description}`,
          ),
        ),
      ),
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Select TTS Language",
          onchange: (e) => {
            uiState.selectedLanguage = e.target.value;
          },
        },
        langs.map((l) =>
          h("option", { value: l, selected: uiState.selectedLanguage === l ? "selected" : null }, `Language: ${l.toUpperCase()}`),
        ),
      ),
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Speech output mode",
          onchange: (e) => {
            uiState.speechMode = e.target.value;
          },
        },
        [
          h("option", { value: "speaker", selected: uiState.speechMode === "speaker" ? "selected" : null }, "Play Out Loud (24kHz Player)"),
          h("option", { value: "file", selected: uiState.speechMode === "file" ? "selected" : null }, "Save 24kHz WAV to Active Folder"),
        ],
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          disabled: uiState.loading ? "disabled" : null,
          onclick: async () => {
            const input = String(speechTextareaEl ? speechTextareaEl.value : uiState.speechText || "").trim();
            uiState.speechText = input;
            uiState.loading = true;
            renderBionicPanel();
            try {
              const res = await call("bionic/speech", {
                input: input || undefined,
                path: !input && sel.length > 0 ? sel[0] : undefined,
                voice: uiState.selectedVoice,
                language: uiState.selectedLanguage,
                mode: uiState.speechMode,
                saveDir: currentFolderRel(),
              });
              uiState.speechResult = res;
              if (res.audioUrl) {
                uiState.lastAudioUrl = `${res.audioUrl}&token=${encodeURIComponent(getToken())}`;
              }
              if (res.savedRelativePath) {
                toast(`Saved 24kHz WAV to ${res.savedRelativePath}`);
                refresh();
              } else {
                toast(`Synthesized ${res.durationSecondsEstimate}s 24kHz audio with ${res.voice}`);
              }
            } catch (err) {
              toast(err.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderBionicPanel();
            }
          },
        },
        uiState.loading ? [h("span", { class: "ollama-spinner" }), " Synthesizing..."] : "🔊 Synthesize with Bionic Phonon 40M",
      ),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn",
          title: "Save current voice & language as default in ~/.lmstudio/.internal/tts-model-selection.json",
          onclick: async () => {
            try {
              const updated = await call("bionic/ttsConfig", {
                voice: uiState.selectedVoice,
                language: uiState.selectedLanguage,
              });
              if (uiState.statusData) uiState.statusData.tts = updated;
              toast(`Saved ${uiState.selectedVoice} (${uiState.selectedLanguage}) to Bionic tts-model-selection.json`);
              renderBionicPanel();
            } catch (err) {
              toast(err.message, { kind: "error" });
            }
          },
        },
        "💾 Save as Bionic Default Voice",
      ),
    ]),
    uiState.speechResult
      ? renderBionicOutputConsole({
          title: `Phonon 40M Multilingual Output (${uiState.speechResult.voice}, ${uiState.speechResult.sampleRate} Hz)`,
          badge: `${uiState.speechResult.durationSecondsEstimate}s • ${uiState.speechResult.engine}`,
          content: uiState.speechResult.cleanedText,
          audioUrl: uiState.lastAudioUrl,
          clearScope: "speech",
          saveName: "bionic-speech-script",
        })
      : null,
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Bionic ExecuTorch Whisper Metal ASR Audio/Video Transcription"),
      h(
        "span",
        { class: `ollama-pill ${asr?.installed ? "is-mlx" : "is-warn"}` },
        asr?.installed ? "✔ whisper_engine_executorch_metal.node Installed" : "ASR Engine Ready",
      ),
    ]),
    h("div", { class: "ollama-row" }, [
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Select transcript export format",
          onchange: (e) => {
            uiState.asrFormat = e.target.value;
          },
        },
        [
          h("option", { value: "markdown" }, "Format: Markdown (.md) + AI Summary"),
          h("option", { value: "txt" }, "Format: Plain Text (.txt)"),
          h("option", { value: "srt" }, "Format: SubRip Subtitles (.srt)"),
          h("option", { value: "json" }, "Format: Structured JSON (.json)"),
        ],
      ),
      h("label", { class: "ollama-row" }, [
        h("input", {
          type: "checkbox",
          checked: uiState.asrSaveToFolder ? "checked" : null,
          onchange: (e) => {
            uiState.asrSaveToFolder = e.target.checked;
          },
        }),
        h("span", {}, "Save Transcript File to Folder"),
      ]),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          disabled: uiState.loading ? "disabled" : null,
          onclick: async () => {
            if (sel.length === 0) {
              toast("Select an audio, video, or subtitle file in the File Manager list first.");
              return;
            }
            uiState.loading = true;
            renderBionicPanel();
            try {
              const res = await call("bionic/transcribe", {
                path: sel[0],
                format: uiState.asrFormat,
                saveToFolder: uiState.asrSaveToFolder,
                summarize: true,
                model: uiState.selectedModel || undefined,
              });
              uiState.asrResult = res;
              if (res.savedRelativePath) {
                toast(`Saved Bionic ASR transcript to ${res.savedRelativePath}`);
                refresh();
              } else {
                toast("Completed Bionic ASR transcription");
              }
            } catch (err) {
              toast(err.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderBionicPanel();
            }
          },
        },
        "🎙️ Transcribe Selected File with Bionic ASR",
      ),
    ]),
    uiState.asrResult
      ? renderBionicOutputConsole({
          title: `Bionic ExecuTorch ASR Transcript (${uiState.asrResult.sourcePath})`,
          badge: uiState.asrResult.engine,
          content: uiState.asrResult.transcript,
          clearScope: "asr",
          saveName: "bionic-asr-transcript",
        })
      : null,
  ]);
}

function renderMeaningTab() {
  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Bionic Local Embeddings & Semantic Folder Search (POST /v1/embeddings)"),
      h("span", { class: "ollama-pill is-mlx" }, "text-embedding-nomic-embed-text-v1.5 (768-dim Nomic BERT)"),
    ]),
    h("div", { class: "ollama-row" }, [
      h("input", {
        class: "ollama-input",
        "aria-label": "Semantic meaning search query",
        placeholder: "Describe what you're looking for by meaning (e.g., 'database login verification logic' or 'audio waveform synthesis')...",
        value: uiState.meaningQuery,
        oninput: (e) => {
          uiState.meaningQuery = e.target.value;
        },
        onkeydown: (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !uiState.loading) {
            e.preventDefault();
            e.currentTarget.parentElement?.querySelector("button.ollama-btn.is-primary")?.click();
          }
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          disabled: uiState.loading ? "disabled" : null,
          onclick: async () => {
            if (!uiState.meaningQuery.trim()) return;
            uiState.loading = true;
            renderBionicPanel();
            try {
              const res = await call("bionic/semanticSearch", {
                query: uiState.meaningQuery.trim(),
                dirPath: currentFolderRel(),
              });
              uiState.meaningMatches = res.matches || [];
              toast(`Scanned ${res.scannedFilesCount} files with ${res.model}`);
            } catch (err) {
              toast(err.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderBionicPanel();
            }
          },
        },
        "🔍 Search Folder by Meaning (/v1/embeddings)",
      ),
      uiState.meaningMatches.length > 0
        ? h(
            "button",
            {
              type: "button",
              class: "ollama-btn",
              onclick: () => clearBionicOutput("meaning"),
            },
            "🧹 Clear Results",
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
                h("span", { class: "ollama-pill is-mlx" }, `${(m.similarity * 100).toFixed(1)}% cosine similarity`),
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
                      const ok = await goTo(m.folderPath, { select: m.absPath });
                      if (ok) {
                        if (state.workspace !== "split") closePower();
                        toast(`Selected ${m.name}`);
                      }
                    },
                  },
                  "📂 Reveal in File Manager",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    onclick: (e) => void copyBionicText(m.preview, `${m.name} snippet`, e.currentTarget),
                  },
                  "📋 Copy Snippet",
                ),
              ]),
            ]),
          ),
        )
      : null,
  ]);
}

function renderModelsAndEnginesTab() {
  const st = uiState.statusData;
  const hw = st?.hardware;
  const models = st?.models || [];
  const cloudModels = st?.cloudModels || [];
  const backends = st?.backends || [];

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "LM Studio Bionic Local Models (`lms ls` / `lms ps` / `/api/v0/models`) & Hardware Guard"),
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
        "aria-label": "Download model from LM Studio Hub",
        placeholder: "Download MLX model from LM Studio Hub (e.g. qwen/qwen3.5-9b, mlx-community/Llama-3.2-3B-Instruct-4bit)...",
        value: uiState.hubModelQuery,
        oninput: (e) => {
          uiState.hubModelQuery = e.target.value;
        },
        onkeydown: (e) => {
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !uiState.loading) {
            e.preventDefault();
            e.currentTarget.parentElement?.querySelector("button.ollama-btn.is-primary")?.click();
          }
        },
      }),
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
          onclick: async () => {
            if (!uiState.hubModelQuery.trim()) return;
            uiState.loading = true;
            renderBionicPanel();
            try {
              const res = await call("bionic/get", { model: uiState.hubModelQuery.trim() });
              if (!res.ok) {
                uiState.refusalBanner = { code: res.verdict?.code || "HARDWARE_RAM_REFUSAL", message: res.status };
              } else {
                toast(res.status);
                void refreshBionicStatus(true);
              }
            } catch (err) {
              toast(err.message, { kind: "error" });
            } finally {
              uiState.loading = false;
              renderBionicPanel();
            }
          },
        },
        "⬇ Hardware-Checked Download (`lms get --mlx`)",
      ),
    ]),
    h("div", { class: "ollama-row", style: "flex-wrap:wrap;gap:10px;font-size:12px;margin:4px 0;" }, [
      h("strong", {}, "Load Settings (lms load):"),
      h("label", { class: "ollama-row", style: "gap:4px;" }, [
        h("span", {}, "Context:"),
        h(
          "select",
          {
            class: "ollama-select",
            onchange: (e) => {
              uiState.loadContextLength = Number(e.target.value) || 32768;
            },
          },
          [4096, 8192, 16384, 32768, 65536, 131072].map((ctxVal) =>
            h(
              "option",
              {
                value: String(ctxVal),
                selected: Number(uiState.loadContextLength) === ctxVal ? "selected" : null,
              },
              `${ctxVal.toLocaleString()} tokens`,
            ),
          ),
        ),
      ]),
      h("label", { class: "ollama-row", style: "gap:4px;" }, [
        h("span", {}, "GPU Offload:"),
        h(
          "select",
          {
            class: "ollama-select",
            onchange: (e) => {
              uiState.loadGpuOffload = e.target.value;
            },
          },
          [
            { val: "max", label: "Max (100% Apple Metal)" },
            { val: "0.75", label: "75% GPU Layers" },
            { val: "0.5", label: "50% GPU Layers" },
            { val: "off", label: "CPU Only" },
          ].map((g) =>
            h(
              "option",
              { value: g.val, selected: String(uiState.loadGpuOffload) === g.val ? "selected" : null },
              g.label,
            ),
          ),
        ),
      ]),
      h("label", { class: "ollama-row", style: "gap:4px;" }, [
        h("span", {}, "KV Cache Quant:"),
        h(
          "select",
          {
            class: "ollama-select",
            onchange: (e) => {
              uiState.loadKvCacheQuant = e.target.value;
            },
          },
          [
            { val: "f16", label: "FP16 (Full Precision)" },
            { val: "q8_0", label: "Q8_0 (8-bit Compressed KV)" },
            { val: "q4_0", label: "Q4_0 (4-bit Ultra-Compact KV)" },
          ].map((kv) =>
            h(
              "option",
              { value: kv.val, selected: uiState.loadKvCacheQuant === kv.val ? "selected" : null },
              kv.label,
            ),
          ),
        ),
      ]),
      h("label", { class: "ollama-row", style: "gap:4px;" }, [
        h("input", {
          type: "checkbox",
          checked: uiState.loadFlashAttention ? "checked" : null,
          onchange: (e) => {
            uiState.loadFlashAttention = e.target.checked;
          },
        }),
        h("span", {}, "Flash Attention"),
      ]),
      h("label", { class: "ollama-row", style: "gap:4px;" }, [
        h("span", {}, "Idle Auto-Evict (TTL):"),
        h(
          "select",
          {
            class: "ollama-select",
            onchange: (e) => {
              uiState.loadTtlSeconds = Number(e.target.value) || 0;
            },
          },
          [
            { val: 0, label: "Keep Loaded" },
            { val: 300, label: "5 min (300s)" },
            { val: 900, label: "15 min (900s)" },
            { val: 1800, label: "30 min (1800s)" },
          ].map((t) =>
            h(
              "option",
              { value: String(t.val), selected: Number(uiState.loadTtlSeconds) === t.val ? "selected" : null },
              t.label,
            ),
          ),
        ),
      ]),
    ]),
    h(
      "div",
      { class: "ollama-model-grid" },
      models.map((m) => {
        const profile = m.featureProfile || getBionicModelFeatureProfile(m.id);
        return h("div", { class: "ollama-model-card" }, [
          h("div", { class: "ollama-row" }, [
            h("strong", {}, m.displayName),
            h(
              "span",
              { class: `ollama-pill ${m.loaded ? "is-mlx" : ""}` },
              `${m.paramsString} • ${m.sizeGb} GB (~${m.estimatedRamGb} GB RAM)`,
            ),
          ]),
          h("div", { class: "ollama-badge-row" }, (m.badges || []).map(createBadgeEl)),
          h(
            "div",
            { class: "ollama-row", style: "flex-wrap:wrap;gap:4px;margin:2px 0;" },
            (profile.indicators || []).map((ind) =>
              h(
                "span",
                {
                  class: "ollama-pill is-mlx",
                  "data-bionic-model-indicator": ind.id,
                  title: ind.description,
                  style: "font-size:10.5px;padding:1px 6px;",
                },
                `${ind.icon} ${ind.label}`,
              ),
            ),
          ),
          h(
            "div",
            { class: "ollama-model-use-cases" },
            `What you can use it for: ${(profile.useCases || []).join(" • ")}`,
          ),
          h(
            "div",
            {},
            `ID: ${m.id} | Arch: ${m.architecture} | Quant: ${m.quantization} | Max Ctx: ${m.maxContextLength.toLocaleString()}`,
          ),
          h("div", { class: "ollama-row" }, [
            m.type !== "tts"
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    onclick: () => {
                      uiState.selectedModel = m.id;
                      uiState.subTab = "assistant";
                      syncBionicSelectedModelState();
                      toast(`Selected ${m.displayName} in Bionic AI Studio`);
                      renderBionicPanel();
                    },
                  },
                  "✓ Select Model in Studio",
                )
              : null,
            !m.loaded && m.type !== "tts"
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-primary is-mini",
                    onclick: async () => {
                      uiState.loading = true;
                      renderBionicPanel();
                      try {
                        await call("bionic/load", {
                          model: m.id,
                          contextLength: uiState.loadContextLength,
                          gpuOffload: uiState.loadGpuOffload,
                          flashAttention: uiState.loadFlashAttention,
                          kvCacheQuant: uiState.loadKvCacheQuant,
                          ttlSeconds: uiState.loadTtlSeconds > 0 ? uiState.loadTtlSeconds : undefined,
                        });
                        toast(`Loaded ${m.displayName} into Metal RAM`);
                        void refreshBionicStatus(true);
                      } catch (err) {
                        toast(err.message, { kind: "error" });
                      } finally {
                        uiState.loading = false;
                        renderBionicPanel();
                      }
                    },
                  },
                  "⚡ Load into Metal RAM",
                )
              : null,
            m.loaded && m.type !== "tts"
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-danger is-mini",
                    onclick: async () => {
                      try {
                        await call("bionic/unload", { model: m.id });
                        toast(`Unloaded ${m.displayName} from RAM`);
                        void refreshBionicStatus(true);
                      } catch (err) {
                        toast(err.message, { kind: "error" });
                      }
                    },
                  },
                  "Unload RAM",
                )
              : null,
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                onclick: (e) => void copyBionicText(`lms load ${m.id}`, `lms load ${m.id}`, e.currentTarget),
              },
              "📋 Copy CLI",
            ),
          ]),
        ]);
      }),
    ),
    cloudModels.length > 0
      ? h("div", { class: "ollama-card-title" }, [
          h("span", {}, `☁️ Bionic Cloud Models (${cloudModels.length}) — Zero Local RAM Footprint`),
          h("span", { class: "ollama-pill is-cloud" }, "Up to 262K Context • Thinking Toggle • Vision VLM • Tool Use"),
        ])
      : null,
    cloudModels.length > 0
      ? h(
          "div",
          { class: "ollama-model-grid" },
          cloudModels.map((cm) => {
            const profile = cm.featureProfile || getBionicModelFeatureProfile(cm.id);
            const indicators = profile.indicators || [];
            const useCases = profile.useCases || [];
            const isSelected = (uiState.selectedModel || "").toLowerCase() === cm.id.toLowerCase();
            return h("div", { class: "ollama-model-card", "data-bionic-cloud-card": cm.id }, [
              h("div", { class: "ollama-row" }, [
                h("strong", {}, `☁️ ${cm.displayName}`),
                h("span", { class: "ollama-pill is-cloud" }, `Max Ctx: ${(cm.maxContextLength || 256000).toLocaleString()}`),
                isSelected ? h("span", { class: "ollama-pill is-mlx" }, "✓ Active in Studio") : null,
              ]),
              h("div", { class: "ollama-badge-row" }, (cm.badges || []).map(createBadgeEl)),
              indicators.length > 0
                ? h(
                    "div",
                    { class: "ollama-row", style: "flex-wrap:wrap;gap:4px;margin:2px 0;" },
                    indicators.map((ind) =>
                      h(
                        "span",
                        {
                          class: "ollama-pill is-mlx",
                          "data-bionic-model-indicator": ind.id,
                          title: ind.description || ind.label,
                          style: "font-size:10.5px;padding:1px 6px;",
                        },
                        `${ind.icon} ${ind.label}`,
                      ),
                    ),
                  )
                : null,
              useCases.length > 0
                ? h(
                    "div",
                    { class: "ollama-model-use-cases" },
                    `What you can use it for: ${useCases.slice(0, 3).join(" • ")}`,
                  )
                : null,
              h(
                "div",
                {},
                `ID: ${cm.id} | RAM: 0 GB Local (Bionic Cloud) | Format: ${(cm.format || "cloud").toUpperCase()}`,
              ),
              h("div", { class: "ollama-row" }, [
                h(
                  "button",
                  {
                    type: "button",
                    class: `ollama-btn is-mini${isSelected ? " is-primary" : ""}`,
                    "data-bionic-action": "select-cloud-model",
                    "data-bionic-model-id": cm.id,
                    onclick: () => {
                      uiState.selectedModel = cm.id;
                      syncBionicSelectedModelState();
                      uiState.subTab = "assistant";
                      toast(`Selected Bionic Cloud Model in Studio: ${cm.displayName} (${cm.id})`);
                      renderBionicPanel();
                    },
                  },
                  isSelected ? "✓ Selected in Studio" : "✓ Select Model in Studio",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    onclick: (e) => void copyBionicText(cm.id, cm.id, e.currentTarget),
                  },
                  "📋 Copy Model ID",
                ),
              ]),
            ]);
          }),
        )
      : null,
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, `Installed LM Studio Bionic Metal Engine Backends (${backends.length})`),
    ]),
    h(
      "div",
      { class: "bionic-engine-grid" },
      backends.map((b) =>
        h("div", { class: "bionic-engine-card" }, [
          h("div", { class: "ollama-row" }, [
            h("strong", {}, b.name),
            h("span", { class: "ollama-pill is-mlx" }, `v${b.version || "1.0"}`),
            h("span", { class: "ollama-pill" }, b.format),
          ]),
          h("div", {}, b.description),
        ]),
      ),
    ),
  ]);
}

export function renderBionicPanel() {
  if (!rootContainer) return;
  const prevScroll = rootContainer.scrollTop || 0;
  const savedBoxScrolls = new Map();
  if (rootContainer.querySelectorAll) {
    for (const consoleEl of rootContainer.querySelectorAll("[data-bionic-output-console]")) {
      const scope = consoleEl.getAttribute("data-bionic-output-console") || "default";
      const outBox = consoleEl.querySelector(".bionic-md-viewer, .ollama-output-box");
      const thinkBox = consoleEl.querySelector(".ollama-thinking-box");
      savedBoxScrolls.set(scope, {
        outTop: outBox ? outBox.scrollTop || 0 : 0,
        outLeft: outBox ? outBox.scrollLeft || 0 : 0,
        thinkTop: thinkBox ? thinkBox.scrollTop || 0 : 0,
      });
    }
  }
  clear(rootContainer);

  const rootDataset =
    typeof document !== "undefined" && document.documentElement?.dataset
      ? document.documentElement.dataset
      : {};
  const suiteClasses = [
    "ollama-suite",
    "bionic-suite",
    uiState.outputExpanded ? "is-output-expanded" : "",
    uiState.outputFullscreen ? "is-output-fullscreen" : "",
    uiState.compactControls ? "is-compact-controls" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const suite = h(
    "div",
    {
      class: suiteClasses,
      "data-theme-scheme": rootDataset.theme || "auto",
      "data-theme-palette": rootDataset.palette || "standard",
    },
    [
      renderHeroBanner(),
      renderModeTabs(),
      renderSelectedFilesStrip(),
      uiState.refusalBanner
        ? h("div", { class: "ollama-refusal-banner" }, [
            h("strong", {}, "Polite Hardware Safety Protection Triggered"),
            h("div", {}, uiState.refusalBanner.message),
          ])
        : null,
      uiState.subTab === "assistant"
        ? renderAssistantTab()
        : uiState.subTab === "skills"
          ? renderSkillsAndProjectsTab()
          : uiState.subTab === "speech_asr"
            ? renderSpeechAndAsrTab()
            : uiState.subTab === "meaning"
              ? renderMeaningTab()
              : renderModelsAndEnginesTab(),
    ],
  );

  rootContainer.appendChild(suite);
  if (prevScroll > 0) rootContainer.scrollTop = prevScroll;
  if (savedBoxScrolls.size > 0 && rootContainer.querySelectorAll) {
    for (const consoleEl of rootContainer.querySelectorAll("[data-bionic-output-console]")) {
      const scope = consoleEl.getAttribute("data-bionic-output-console") || "default";
      const saved = savedBoxScrolls.get(scope);
      if (!saved) continue;
      const outBox = consoleEl.querySelector(".bionic-md-viewer, .ollama-output-box");
      const thinkBox = consoleEl.querySelector(".ollama-thinking-box");
      if (outBox) {
        if (saved.outTop > 0) outBox.scrollTop = saved.outTop;
        if (saved.outLeft > 0) outBox.scrollLeft = saved.outLeft;
      }
      if (thinkBox && saved.thinkTop > 0) {
        thinkBox.scrollTop = saved.thinkTop;
      }
    }
  }
}

export function mountBionicTool(container) {
  rootContainer = container;
  if (typeof window !== "undefined" && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const sub = params.get("subTab");
    if (sub) uiState.subTab = sub;
    const modelParam = params.get("model");
    if (modelParam) {
      uiState.selectedModel = modelParam;
      syncBionicSelectedModelState();
    }
    if (params.get("adv") === "1") uiState.showAdvancedSampling = true;
    if (params.get("expand") === "1") uiState.outputExpanded = true;
    if (params.get("fullscreen") === "1") {
      uiState.outputFullscreen = true;
      uiState.outputExpanded = true;
    }
    if (params.get("compact") === "1") uiState.compactControls = true;
  }
  renderBionicPanel();
  if (!uiState.statusData && !uiState.loading) {
    void refreshBionicStatus(false);
  }
  const offSelection = on("selection", () => {
    if (rootContainer && !rootContainer.hidden) renderBionicPanel();
  });
  const applyOpts = (opts) => {
    if (!opts) return;
    if (opts.subTab) uiState.subTab = opts.subTab;
    if (typeof opts.path === "string" && opts.path.trim()) {
      uiState.contextPaths = [opts.path.trim()];
    } else if (Array.isArray(opts.paths) && opts.paths.length > 0) {
      uiState.contextPaths = opts.paths;
    }
    if (opts.synthesize) {
      void runBionicSynthesisFlow(opts.paths || uiState.contextPaths, opts.mode || "compare", Boolean(opts.saveToFile));
    } else if (opts.prompt) {
      uiState.promptText = opts.prompt;
      void runBionicSmartRouter(opts.prompt);
    } else {
      void refreshBionicStatus(true);
    }
    renderBionicPanel();
  };
  const onEscapeFullscreen = (e) => {
    if (e.key === "Escape" && rootContainer && !rootContainer.hidden && uiState.outputFullscreen) {
      e.preventDefault();
      e.stopPropagation();
      uiState.outputFullscreen = false;
      renderBionicPanel();
    }
  };
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("keydown", onEscapeFullscreen);
  }
  return {
    show(opts) {
      applyOpts(opts || {});
    },
    onPayload(opts) {
      applyOpts(opts || {});
    },
    dispose() {
      offSelection?.();
      if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
        document.removeEventListener("keydown", onEscapeFullscreen);
      }
    },
  };
}

registerPowerTab({
  id: "bionic",
  label: "LM Studio Bionic",
  icon: "🧬",
  tip: "Built-In LM Studio Bionic AI Studio: Apple Silicon MLX/oMLX/Splash LLMs & VLMs, @Skill Agent Hub, Bionic Projects, Phonon 40M Multilingual 24kHz Metal TTS, ExecuTorch Whisper ASR, and Nomic Embeddings.",
  group: "automate",
  mount: mountBionicTool,
});
