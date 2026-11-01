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
  speakReply: false,
  schemaPreset: "",
  selectedSkill: "",
  promptText: "",
  routeBanner: "",
  reasoningOutput: "",
  answerOutput: "",
  structuredOutput: null,
  lastStats: null,
  lastRuntime: null,
  outputExpanded: false,
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
    bLower.includes("mlx") || bLower.includes("loaded")
      ? " badge-mlx"
      : bLower.includes("speech") || bLower.includes("tts")
        ? " badge-speech"
        : bLower.includes("vision")
          ? " badge-vision"
          : bLower.includes("reasoning") || bLower.includes("tools")
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
  const maxLines = Math.min(lines.length, 2500);
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

function renderBionicOutputConsole({
  title = "LM Studio Bionic Output Console",
  badge = "",
  content = "",
  reasoning = "",
  audioUrl = "",
  clearScope = "assistant",
  saveName = "bionic-output",
  showWhenEmpty = false,
  emptyHint = "Output will appear here in rich Markdown view — use Markdown / Raw toggle, Section Outline, Copy Output, Read Aloud (Phonon 40M), Save to Folder, or Clear Output anytime.",
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

  return h(
    "div",
    {
      class: `ollama-output-console${uiState.outputExpanded ? " is-expanded" : ""}`,
      "data-bionic-output-console": clearScope,
      style: `--bionic-md-font-size: ${uiState.mdFontScale}px;`,
    },
    [
      h("div", { class: "ollama-output-header" }, [
        h("div", { class: "ollama-output-title-group" }, [
          h("span", { class: "ollama-status-pulse" }),
          h("strong", { class: "ollama-output-title" }, title),
          badge ? h("span", { class: "ollama-pill is-mlx" }, badge) : null,
          hasContent || hasReasoning
            ? h(
                "span",
                { class: "ollama-pill is-ram" },
                `${stats.words.toLocaleString()} words • ${stats.chars.toLocaleString()} chars • ${stats.lines} lines`,
              )
            : h("span", { class: "ollama-pill" }, "Ready"),
        ]),
        h("div", { class: "ollama-output-toolbar" }, [
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
                    uiState.mdFontScale = Math.min(18, uiState.mdFontScale + 1);
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
                  title: "Expand or compact output reader height",
                  onclick: () => {
                    uiState.outputExpanded = !uiState.outputExpanded;
                    renderBionicPanel();
                  },
                },
                uiState.outputExpanded ? "↕ Compact" : "↕ Expand",
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
  if (!livePrompt && paths.length === 0) {
    toast("Type a plain-English request, trigger a @skill, or select a file to read aloud / transcribe.");
    return;
  }

  uiState.loading = true;
  uiState.refusalBanner = null;
  uiState.lastAudioUrl = "";
  uiState.routeBanner = "Routing request through LM Studio Bionic Capability Router...";
  renderBionicPanel();

  try {
    if (livePrompt && uiState.schemaPreset) {
      const chatRes = await call("bionic/chat", {
        model: uiState.selectedModel || undefined,
        prompt: livePrompt,
        paths,
        dirPath: currentFolderRel(),
        skill: uiState.selectedSkill || undefined,
        schemaPreset: uiState.schemaPreset,
        speakReply: uiState.speakReply,
        voice: uiState.selectedVoice,
        enableTools: true,
      });
      uiState.routeBanner = `Executed Grammar-Constrained JSON (${uiState.schemaPreset}) via ${chatRes.model}`;
      uiState.reasoningOutput = chatRes.reasoningText || "";
      uiState.answerOutput = chatRes.content || "";
      uiState.structuredOutput = chatRes.structuredJson || null;
      uiState.lastStats = chatRes.stats || null;
      uiState.lastRuntime = chatRes.runtime || null;
      if (chatRes.speechResult?.audioUrl) {
        uiState.lastAudioUrl = `${chatRes.speechResult.audioUrl}&token=${encodeURIComponent(getToken())}`;
      }
    } else {
      const routed = await call("bionic/route", {
        prompt: livePrompt,
        paths,
        dirPath: currentFolderRel(),
        model: uiState.selectedModel || undefined,
        voice: uiState.selectedVoice,
        language: uiState.selectedLanguage,
        speakReply: uiState.speakReply,
      });
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
    if (err.code === "HARDWARE_RAM_REFUSAL" || err.code === "HARDWARE_MLX_EXCLUSIVITY") {
      uiState.refusalBanner = { code: err.code, message: err.message };
    } else {
      toast(err.message || "Bionic request failed", { kind: "error" });
      uiState.answerOutput = `Error (${err.code || "ERR"}): ${err.message}`;
    }
  } finally {
    uiState.loading = false;
    renderBionicPanel();
  }
}

async function runBionicStreamChat() {
  const prompt = String(promptTextareaEl ? promptTextareaEl.value : uiState.promptText || "").trim();
  uiState.promptText = prompt;
  if (!prompt) {
    if (selectedFilePaths().length > 0) {
      await runBionicSmartRouter("");
      return;
    }
    toast("Enter a message to stream from LM Studio Bionic.");
    return;
  }

  uiState.loading = true;
  uiState.reasoningOutput = "";
  uiState.answerOutput = "";
  uiState.routeBanner = "Streaming live tokens from Bionic /v1/chat/completions...";
  renderBionicPanel();

  try {
    const res = await fetch("/api/bionic/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": getToken(),
      },
      body: JSON.stringify({
        model: uiState.selectedModel || undefined,
        prompt,
        paths: selectedFilePaths(),
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payloadStr = trimmed.slice(5).trim();
        if (!payloadStr || payloadStr === "[DONE]") continue;
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
      }
      renderBionicPanel();
    }
  } catch (err) {
    uiState.answerOutput = `Stream failed: ${err.message}`;
  } finally {
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
  uiState.subTab = "assistant";
  uiState.loading = true;
  uiState.markdownView = true;
  uiState.routeBanner = `🧬 Synthesizing ${paths.length} ${paths.length === 1 ? "file" : "files"} (${mode})...`;
  renderBionicPanel();
  try {
    const res = await call("bionic/synthesize", {
      paths,
      mode,
      model: uiState.selectedModel || undefined,
      saveToFile,
      dirPath: currentFolderRel(),
    });
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
    uiState.answerOutput = `Synthesis failed: ${err.message || err}`;
    toast(err.message || "Synthesis failed", { kind: "error" });
  } finally {
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
  const tabs = [
    { id: "assistant", label: "1. Bionic AI & @Skills Router" },
    { id: "skills", label: `2. Agent Skills (${skillCount}) & Bionic Projects` },
    { id: "speech_asr", label: "3. Phonon 40M TTS & Whisper ASR" },
    { id: "meaning", label: "4. Embeddings & Meaning Search (/v1/embeddings)" },
    { id: "models", label: `5. Models (${modelCount}), Metal Engines & Hardware Guard` },
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
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const delta = e.key === "ArrowRight" ? 1 : -1;
              const nextIdx = (idx + delta + tabs.length) % tabs.length;
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

function renderAssistantTab() {
  const models = (uiState.statusData?.models || []).filter((m) => m.type === "llm" || m.type === "vlm");
  const skills = uiState.statusData?.skills || [];
  const voices = uiState.statusData?.tts?.voices || [];

  const quickPrompts = [
    { label: "Summarize Selected File", text: "Summarize the selected file and highlight key architecture points." },
    { label: "🔊 Read Aloud (Phonon 40M)", text: "Read this out loud with Bionic Phonon 40M Multilingual TTS." },
    { label: "🎙️ Transcribe Audio (ASR)", text: "Transcribe this audio file to Markdown and summarize key points." },
    { label: "📄 @documents Skill", text: "@documents-presentations-spreadsheets-and-graphics Review this document and suggest improvements." },
    { label: "🕒 @file-history Skill", text: "@file-history Explain how Bionic tracks file history and changes." },
    { label: "🔍 Find File by Meaning", text: "Find the file where authentication or login verification is implemented." },
    { label: "📋 Batch Rename JSON Plan", text: "Create a batch-rename JSON plan for the selected files." },
  ];

  promptTextareaEl = h(
    "textarea",
    {
      class: "ollama-textarea",
      "aria-label": "Ask LM Studio Bionic or trigger a @skill",
      placeholder:
        "Ask LM Studio Bionic anything in plain English, type @skill-name to inject a Bionic Agent Skill (e.g. @documents-presentations-spreadsheets-and-graphics, @browser-control, @file-history), or leave blank with a selected file to read it aloud / transcribe it...",
      oninput: (e) => {
        uiState.promptText = e.target.value;
      },
    },
    uiState.promptText,
  );

  return h("div", { class: "ollama-card" }, [
    h("div", { class: "ollama-card-title" }, [
      h("span", {}, "Conversational Bionic AI Assistant, @Skill Injector & Metal Capability Router"),
      h("span", { class: "ollama-pill is-mlx" }, "Apple Silicon MLX / oMLX / Splash + Phonon 40M"),
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
            onclick: () => void runBionicSmartRouter(qp.text),
          },
          qp.label,
        ),
      ),
    ),
    promptTextareaEl,
    h("div", { class: "ollama-row" }, [
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Select LM Studio Bionic Model",
          onchange: (e) => {
            uiState.selectedModel = e.target.value;
          },
        },
        [
          h("option", { value: "", selected: !uiState.selectedModel ? "selected" : null }, "Auto-Select Best Loaded MLX Model"),
          ...models.map((m) =>
            h(
              "option",
              { value: m.id, selected: uiState.selectedModel === m.id ? "selected" : null },
              `${m.loaded ? "✓ LOADED: " : ""}${m.displayName} (${m.id}) — ${m.paramsString}, ~${m.estimatedRamGb} GB [${m.quantization}]`,
            ),
          ),
        ],
      ),
      h(
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
      ),
      h(
        "select",
        {
          class: "ollama-select",
          "aria-label": "Structured JSON Schema Output",
          onchange: (e) => {
            uiState.schemaPreset = e.target.value;
          },
        },
        [
          h("option", { value: "" }, "Freeform Markdown / Code Output"),
          h("option", { value: "batch_rename_plan" }, "JSON Schema: Batch Rename Plan"),
          h("option", { value: "folder_organization_plan" }, "JSON Schema: Folder Organization Plan"),
          h("option", { value: "table_extraction" }, "JSON Schema: Structured Table Extraction"),
        ],
      ),
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
    h("div", { class: "ollama-row" }, [
      h(
        "button",
        {
          type: "button",
          class: "ollama-btn is-primary",
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
          disabled: uiState.loading ? "disabled" : null,
          onclick: () => void runBionicStreamChat(),
        },
        "⚡ Stream Live Tokens (/api/bionic/stream)",
      ),
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
    h(
      "div",
      { class: "ollama-model-grid" },
      models.map((m) =>
        h("div", { class: "ollama-model-card" }, [
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
            {},
            `ID: ${m.id} | Arch: ${m.architecture} | Quant: ${m.quantization} | Max Ctx: ${m.maxContextLength.toLocaleString()}`,
          ),
          h("div", { class: "ollama-row" }, [
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
                        await call("bionic/load", { model: m.id, contextLength: uiState.loadContextLength });
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
        ]),
      ),
    ),
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
    cloudModels.length > 0
      ? h("div", { class: "ollama-card-title" }, [
          h("span", {}, `Bionic Cloud Models (${cloudModels.length}) — Zero Local RAM Footprint`),
        ])
      : null,
    cloudModels.length > 0
      ? h(
          "div",
          { class: "ollama-model-grid" },
          cloudModels.map((cm) =>
            h("div", { class: "ollama-model-card" }, [
              h("div", { class: "ollama-row" }, [
                h("strong", {}, cm.displayName),
                h("span", { class: "ollama-pill is-cloud" }, `Max Ctx: ${cm.maxContextLength.toLocaleString()}`),
              ]),
              h("div", { class: "ollama-badge-row" }, (cm.badges || []).map(createBadgeEl)),
              h("div", {}, `Model ID: ${cm.id}`),
            ]),
          ),
        )
      : null,
  ]);
}

export function renderBionicPanel() {
  if (!rootContainer) return;
  const prevScroll = rootContainer.scrollTop || 0;
  clear(rootContainer);

  const rootDataset =
    typeof document !== "undefined" && document.documentElement?.dataset
      ? document.documentElement.dataset
      : {};

  const suite = h(
    "div",
    {
      class: "ollama-suite bionic-suite",
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
}

export function mountBionicTool(container) {
  rootContainer = container;
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
  return {
    show(opts) {
      applyOpts(opts || {});
    },
    onPayload(opts) {
      applyOpts(opts || {});
    },
    dispose() {
      offSelection?.();
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
