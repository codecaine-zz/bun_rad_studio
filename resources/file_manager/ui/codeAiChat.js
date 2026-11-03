// Built-in AI Code Chat & Assistant for the Code Editor (supports both LM Studio Bionic & Ollama).
// Provides multi-turn streaming chat, automatic active-file & selection context, quick code actions
// (Explain, Refactor, Find Bugs, Write Tests, Add Docs), and 1-click Insert / Replace / Diff / Copy on code blocks.
import { call, getToken } from "./api.js";
import {
  applySelectedDiffHunks,
  computeDiffHunks,
  locateTargetRangeInFile,
  parseMarkdown,
  tokenizeLine,
  tokenizeText,
} from "./codeLogic.js";
import { clear, h } from "./dom.js";
import { getClientModelFeatureProfile } from "./ollama.js";

const QUICK_PROMPTS = [
  {
    id: "explain",
    label: "✨ Explain",
    tip: "Explain how the selected code (or active file) works step by step",
    buildPrompt: (hasSel) =>
      hasSel
        ? "Explain the selected code clearly and concisely. Break down what it does, its inputs/outputs, and any important edge cases."
        : "Explain how this file works, its main functions/classes, and its overall architecture.",
  },
  {
    id: "refactor",
    label: "🛠 Refactor",
    tip: "Clean up, simplify, and modernize the selected code (or active file)",
    buildPrompt: (hasSel) =>
      hasSel
        ? "Refactor the selected code to be cleaner, more readable, and maintainable while preserving exact behavior. Return the improved code inside a fenced code block."
        : "Suggest and provide a clean refactoring for this file to improve readability, modularity, and maintainability. Return updated code in fenced code blocks.",
  },
  {
    id: "bugs",
    label: "🐛 Find Bugs",
    tip: "Audit the selected code (or active file) for bugs, edge cases, and security issues",
    buildPrompt: (hasSel) =>
      hasSel
        ? "Check the selected code for potential bugs, edge cases, race conditions, or security issues, and provide fixed code in a fenced code block."
        : "Audit this file for potential bugs, logic errors, unhandled edge cases, or security issues, and show the fixes in fenced code blocks.",
  },
  {
    id: "tests",
    label: "🧪 Write Tests",
    tip: "Generate unit tests for the selected function/code or active file",
    buildPrompt: (hasSel) =>
      hasSel
        ? "Write comprehensive unit tests covering the selected code, including happy paths and edge cases."
        : "Write comprehensive unit tests for the functions and classes in this file.",
  },
  {
    id: "docs",
    label: "📝 Add Docs / Types",
    tip: "Add clear docstrings, comments, and type annotations",
    buildPrompt: (hasSel) =>
      hasSel
        ? "Add clear docstrings/JSDoc comments and strong type annotations to the selected code. Return the updated code in a fenced code block."
        : "Add clear docstrings/comments and type annotations to the main functions and types in this file.",
  },
  {
    id: "optimize",
    label: "⚡ Optimize",
    tip: "Improve performance and reduce complexity",
    buildPrompt: (hasSel) =>
      hasSel
        ? "Optimize the selected code for better performance and lower memory/CPU overhead. Explain the improvement and provide the code block."
        : "Identify performance bottlenecks in this file and provide optimized code blocks.",
  },
];

function splitThinkBlocks(rawText) {
  let content = String(rawText ?? "");
  const reasoningParts = [];
  // Extract gpt-oss Harmony <|channel|>analysis<|message|>...<|end|> blocks
  content = content.replace(
    /<\|(?:start\|>assistant<\|)?channel\|>(?:analysis|thinking|thought)<\|message\|>([\s\S]*?)(?:<\|end\|>|<\|return\|>)/gi,
    (_m, inner) => {
      if (inner && inner.trim()) reasoningParts.push(inner.trim());
      return "";
    },
  );
  content = content.replace(/<\|(?:start\|>assistant<\|)?channel\|>final<\|message\|>/gi, "");
  content = content.replace(/<\|(?:end|return|start|channel|message)\|>/gi, "");
  content = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner) => {
    if (inner && inner.trim()) reasoningParts.push(inner.trim());
    return "";
  });
  // Handle unclosed <think> during live streaming
  const openIdx = content.indexOf("<think>");
  if (openIdx !== -1) {
    const partialThink = content.slice(openIdx + 7).trim();
    if (partialThink) reasoningParts.push(partialThink);
    content = content.slice(0, openIdx);
  }
  return {
    reasoning: reasoningParts.join("\n\n").trim(),
    content: content.trim(),
  };
}

export function createCodeAiChat(ctx) {
  // ctx: { getDoc, getEditor, docs, getWorkspace, toast }
  const state = {
    engine: "bionic", // "bionic" | "ollama"
    engineManuallyChosen: false,
    bionicStatus: null,
    ollamaStatus: null,
    bionicModel: "",
    ollamaModel: "",
    thinkingLevel: "auto", // "auto" | "off" | "on" | "low" | "medium" | "high"
    selectedSkill: "",
    includeFile: true,
    includeSelection: true,
    codeWrap: true,
    expanded: false,
    fullscreen: false,
    loading: false,
    statusLoading: false,
    promptText: "",
    messages: [],
    codeCardStates: new Map(),
    abortController: null,
  };

  const root = h("aside", {
    class: "code-ai-pane",
    "aria-label": "AI Code Chat (LM Studio Bionic & Ollama)",
    hidden: true,
  });

  let promptInputEl = null;
  let threadContainerEl = null;

  function activeSelectionInfo() {
    const d = ctx.getDoc?.();
    const e = ctx.getEditor?.();
    if (!d || !e || d.kind === "diff") return { hasSelection: false, text: "", startLine: 1, endLine: 1, start: 0, end: 0 };
    const sel = e.getSelection();
    if (!sel || sel.end <= sel.start) return { hasSelection: false, text: "", startLine: d.line || 1, endLine: d.line || 1, start: sel?.start || 0, end: sel?.end || 0 };
    const full = e.getText();
    const slice = full.slice(sel.start, sel.end);
    const startLine = full.slice(0, sel.start).split("\n").length;
    const endLine = startLine + slice.split("\n").length - 1;
    return {
      hasSelection: true,
      text: slice,
      startLine,
      endLine,
      start: sel.start,
      end: sel.end,
    };
  }

  function getCombinedBionicModels(bionicStatus) {
    const localModels = Array.isArray(bionicStatus?.models)
      ? bionicStatus.models.filter((m) => m.type === "llm" || m.type === "vlm")
      : [];
    const cloudModels = Array.isArray(bionicStatus?.cloudModels) ? bionicStatus.cloudModels : [];
    const seen = new Set(localModels.map((m) => m.id));
    const merged = [...localModels];
    for (const cm of cloudModels) {
      if (cm?.id && !seen.has(cm.id)) {
        seen.add(cm.id);
        merged.push(cm);
      }
    }
    return merged;
  }

  function resolveCodeChatActiveProfile() {
    const isBionic = state.engine === "bionic";
    const bionicModels = getCombinedBionicModels(state.bionicStatus);
    const ollamaModels = Array.isArray(state.ollamaStatus?.models) ? state.ollamaStatus.models : [];
    const activeModelName = isBionic
      ? state.bionicModel || "openai/gpt-oss-20b"
      : state.ollamaModel || "qwen3.5:latest";
    return getClientModelFeatureProfile(activeModelName, isBionic ? bionicModels : ollamaModels);
  }

  function syncCodeChatModelCapabilities() {
    const profile = resolveCodeChatActiveProfile();
    const feat = profile.features || {};
    const caps = profile.thinkingCapabilities || {};
    if (caps.thinkingMode === "levels") {
      if (state.thinkingLevel !== "low" && state.thinkingLevel !== "medium" && state.thinkingLevel !== "high") {
        state.thinkingLevel = caps.defaultLevel || "medium";
      }
    } else if (caps.thinkingMode === "always_on") {
      state.thinkingLevel = "on";
    } else if (caps.thinkingMode === "none") {
      state.thinkingLevel = "off";
    } else if (caps.thinkingMode === "toggle") {
      if (state.thinkingLevel !== "on" && state.thinkingLevel !== "off") {
        state.thinkingLevel = caps.defaultLevel === "on" ? "on" : "off";
      }
    }
    if (!feat.tools) {
      state.selectedSkill = "";
    }
  }

  function resolveCodeChatThinkArgs() {
    const profile = resolveCodeChatActiveProfile();
    const caps = profile.thinkingCapabilities || {};
    if (caps.thinkingMode === "none" || !caps.supportsThinking) {
      return { think: false, thinkingLevel: "off" };
    }
    if (caps.thinkingMode === "levels") {
      const lvl =
        state.thinkingLevel === "low" || state.thinkingLevel === "medium" || state.thinkingLevel === "high"
          ? state.thinkingLevel
          : caps.defaultLevel || "medium";
      return { think: lvl, thinkingLevel: lvl };
    }
    if (caps.thinkingMode === "always_on") {
      return { think: true, thinkingLevel: "on" };
    }
    const isOn = state.thinkingLevel !== "off";
    return { think: isOn, thinkingLevel: isOn ? "on" : "off" };
  }

  async function refreshEngines(silent = false) {
    if (!silent) {
      state.statusLoading = true;
      render();
    }
    const dirPath = ctx.getWorkspace?.() || "/";
    const [bRes, oRes] = await Promise.allSettled([
      call("bionic/status", { dirPath }),
      call("ollama/status", {}),
    ]);

    if (bRes.status === "fulfilled" && bRes.value) {
      state.bionicStatus = bRes.value;
      const models = getCombinedBionicModels(bRes.value);
      if (!state.bionicModel && models.length > 0) {
        const loadedChat = models.find((m) => m.loaded && (m.type === "llm" || m.type === "vlm"));
        const anyChat = models.find((m) => m.type === "llm" || m.type === "vlm") || models[0];
        if (loadedChat) state.bionicModel = loadedChat.id;
        else if (anyChat) state.bionicModel = anyChat.id;
      }
    }

    if (oRes.status === "fulfilled" && oRes.value) {
      state.ollamaStatus = oRes.value;
      const models = Array.isArray(oRes.value.models) ? oRes.value.models : [];
      if (!state.ollamaModel && models.length > 0) {
        const chatModel = models.find((m) => m.badges?.includes("Chat")) || models[0];
        if (chatModel) state.ollamaModel = chatModel.name;
      }
    }

    // Auto-select online engine if user hasn't explicitly picked one yet
    if (!state.engineManuallyChosen) {
      const bionicOnline = Boolean(state.bionicStatus?.server?.running || (state.bionicStatus?.models?.length > 0));
      const ollamaOnline = Boolean(state.ollamaStatus?.daemon?.running && (state.ollamaStatus?.models?.length > 0));
      if (state.bionicStatus?.server?.running) {
        state.engine = "bionic";
      } else if (ollamaOnline && !bionicOnline) {
        state.engine = "ollama";
      }
    }

    state.statusLoading = false;
    render();
  }

  async function copyCodeText(text, label = "code", btnEl = null) {
    const clean = String(text ?? "");
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
      }, 1500);
    }
    ctx.toast?.(`Copied ${label} (${clean.length.toLocaleString()} chars)`);
  }

  function insertCodeIntoEditor(codeText, mode = "cursor") {
    const clean = String(codeText ?? "");
    if (!clean) return;
    let d = ctx.getDoc?.();
    if (!d || d.kind === "diff") {
      d = ctx.docs?.newUntitled?.();
    }
    const e = ctx.getEditor?.();
    if (!d || !e) {
      ctx.toast?.("Open an editable file tab first.", { kind: "error" });
      return;
    }
    if (d.readOnly) {
      ctx.toast?.("Current file is read-only.", { kind: "error" });
      return;
    }

    if (mode === "file") {
      ctx.docs?.snapshot?.(d, "Before AI Apply File");
      const fullLen = e.getText().length;
      e.apply({
        from: 0,
        to: fullLen,
        insert: clean,
        selStart: 0,
        selEnd: clean.length,
      });
      e.focus();
      ctx.toast?.(`Applied AI code to ${d.name} (snapshot saved in History).`, { kind: "success" });
      return;
    }

    const sel = e.getSelection();
    const hasSel = sel && sel.end > sel.start;
    ctx.docs?.snapshot?.(d, hasSel ? "Before AI Replace Selection" : "Before AI Insert");
    const from = hasSel ? sel.start : (sel?.start ?? e.getText().length);
    const to = hasSel ? sel.end : from;
    e.apply({
      from,
      to,
      insert: clean,
      selStart: from,
      selEnd: from + clean.length,
    });
    e.focus();
    ctx.toast?.(
      hasSel
        ? `Replaced selection in ${d.name} (Undo or History to restore).`
        : `Inserted AI code at cursor in ${d.name}.`,
      { kind: "success" },
    );
  }

  function diffCodeWithEditor(codeText, langHint = "") {
    const clean = String(codeText ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");
    const d = ctx.getDoc?.();
    if (!d) {
      ctx.docs?.openView?.("AI Code Preview", clean, langHint || "javascript");
      return;
    }
    const selInfo = activeSelectionInfo();
    const target = locateTargetRangeInFile(d.text, clean, selInfo);
    const baseText =
      target.mode === "snippet"
        ? selInfo.hasSelection
          ? selInfo.text
          : d.text
        : target.baseText;
    const baseLabel =
      target.mode === "selection"
        ? `${d.name} (Lines ${target.startLine}–${target.endLine})`
        : target.mode === "subblock"
          ? `${d.name} (Lines ${target.startLine}–${target.endLine})`
          : d.name;
    const diffRes = computeDiffHunks(baseText, clean, {
      oldLabel: baseLabel,
      newLabel: "AI Suggestion",
      context: 3,
      mergeGap: 0,
    });
    if (diffRes.identical) {
      ctx.toast?.("AI code block is identical to your current code.");
      return;
    }
    ctx.docs?.openView?.(`Diff: ${d.name} ↔ AI`, diffRes.diff, "diff");
  }

  function resolveCodeLang(rawLang, codeText) {
    const d = ctx.getDoc?.();
    const raw = String(rawLang || d?.lang || "").trim().toLowerCase();
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
      yml: "yaml",
      md: "markdown",
      rs: "rust",
      cs: "csharp",
      "c++": "cpp",
      "c#": "csharp",
    };
    if (aliasMap[raw]) return aliasMap[raw];
    if (
      [
        "javascript", "typescript", "json", "html", "css", "markdown", "python",
        "go", "rust", "c", "cpp", "csharp", "java", "kotlin", "swift", "php",
        "ruby", "lua", "shell", "yaml", "toml", "ini", "sql", "xml", "diff", "v",
      ].includes(raw)
    ) {
      return raw;
    }
    if (/[="'{}[\]()]/.test(String(codeText || ""))) return "typescript";
    return "plain";
  }

  function renderTokenizedSpan(lang, lineStr) {
    const span = h("span", { class: "bionic-md-code-text" });
    const tokens = tokenizeLine(lang, lineStr || "").tokens || [];
    if (tokens.length === 0) {
      span.append(document.createTextNode(lineStr || " "));
    } else {
      for (const t of tokens) {
        span.append(
          t.type ? h("span", { class: `code-t-${t.type}` }, t.text) : document.createTextNode(t.text),
        );
      }
    }
    return span;
  }

  function renderCodeBlockCard(codeText, rawLang, cardKey = "") {
    const cleanCode = String(codeText ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");
    const lang = resolveCodeLang(rawLang, cleanCode);
    const displayLang = (rawLang || lang || "code").toUpperCase();
    const lines = tokenizeText(lang, cleanCode.length > 200_000 ? cleanCode.slice(0, 200_000) : cleanCode);

    const effectiveKey = cardKey || `${lang}:${cleanCode.length}:${cleanCode.slice(0, 120)}`;

    function computeOrGetCardState(forceRediff = false) {
      let cs = state.codeCardStates.get(effectiveKey);
      const d = ctx.getDoc?.();
      const canDiffDoc = Boolean(d && d.kind !== "diff" && String(d.text ?? "").trim().length > 0);

      if (
        !cs ||
        forceRediff ||
        cs.cleanCode !== cleanCode ||
        (!state.loading && cs.wasStreaming) ||
        (canDiffDoc && cs.docId !== d.id && cs.acceptedHunkIds.size === 0 && !cs.userToggled)
      ) {
        if (canDiffDoc) {
          const selInfo = activeSelectionInfo();
          const target = locateTargetRangeInFile(d.text, cleanCode, selInfo);
          const isSnippet = target.mode === "snippet";
          const targetLabel =
            target.mode === "selection"
              ? `${d.name} · Selection L${target.startLine}–${target.endLine}`
              : target.mode === "subblock"
                ? `${d.name} · Lines ${target.startLine}–${target.endLine}`
                : isSnippet
                  ? `${d.name} · Insert at L${target.startLine}`
                  : `${d.name} (L1–${target.endLine})`;
          const diffRes = isSnippet
            ? { identical: false, added: 0, removed: 0, hunks: [], diff: "", ops: [] }
            : computeDiffHunks(target.baseText, cleanCode, {
                oldLabel: targetLabel,
                newLabel: "AI Proposed",
                context: 2,
                mergeGap: 0,
              });
          const hasHunks = !isSnippet && !diffRes.identical && diffRes.hunks.length > 0;
          cs = {
            cardKey: effectiveKey,
            cleanCode,
            docId: d.id,
            docName: d.name,
            targetMode: target.mode,
            targetLabel,
            originalBaseText: target.baseText,
            lastAppliedText: target.baseText,
            targetFrom: target.from,
            targetTo: target.to,
            lastAppliedLen: target.to - target.from,
            startLine: target.startLine,
            endLine: target.endLine,
            diffRes,
            selectedHunkIds: new Set(diffRes.hunks.map((h) => h.id)),
            acceptedHunkIds: new Set(),
            userToggled: false,
            // Front-and-centre diff preview before Apply whenever there are hunks!
            viewMode: hasHunks ? "diff" : "code",
            wasStreaming: Boolean(state.loading),
          };
        } else {
          cs = {
            cardKey: effectiveKey,
            cleanCode,
            docId: d?.id ?? 0,
            docName: d?.name || "",
            targetMode: "cursor",
            targetLabel: "",
            originalBaseText: "",
            lastAppliedText: "",
            targetFrom: 0,
            targetTo: 0,
            lastAppliedLen: 0,
            startLine: 1,
            endLine: 1,
            diffRes: { identical: false, added: 0, removed: 0, hunks: [], diff: "", ops: [] },
            selectedHunkIds: new Set(),
            acceptedHunkIds: new Set(),
            userToggled: false,
            viewMode: "code",
            wasStreaming: Boolean(state.loading),
          };
        }
        state.codeCardStates.set(effectiveKey, cs);
      }
      return cs;
    }

    function buildRawCodeBody() {
      const bodyEl = h("div", {
        class: `bionic-md-code-body${state.codeWrap ? " is-wrapped" : ""}`,
        tabindex: "0",
        role: "region",
        "aria-label": `${displayLang} code snippet`,
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

    function applyHunkSetToEditor(cs, hunkIdsToApply, snapshotLabel, toastMsg) {
      let d = ctx.getDoc?.();
      if (!d || d.kind === "diff") {
        d = ctx.docs?.newUntitled?.();
      }
      const e = ctx.getEditor?.();
      if (!d || !e) {
        ctx.toast?.("Open an editable file tab first.", { kind: "error" });
        return false;
      }
      if (d.readOnly) {
        ctx.toast?.("Current file is read-only.", { kind: "error" });
        return false;
      }

      const applied = applySelectedDiffHunks(cs.originalBaseText, cleanCode, hunkIdsToApply, {
        context: 2,
        mergeGap: 0,
      });

      ctx.docs?.snapshot?.(d, snapshotLabel);
      const curDocText = e.getText();
      let safeFrom = Math.max(0, Math.min(cs.targetFrom, curDocText.length));
      let safeTo = Math.max(safeFrom, Math.min(safeFrom + cs.lastAppliedLen, curDocText.length));

      // If lines above cs.targetFrom were edited manually, relocate the expected block before splicing
      const expectedPrev = cs.lastAppliedText ?? cs.originalBaseText ?? "";
      if (expectedPrev && curDocText.slice(safeFrom, safeTo) !== expectedPrev) {
        const relocatedIdx = curDocText.indexOf(expectedPrev);
        if (relocatedIdx !== -1) {
          safeFrom = relocatedIdx;
          safeTo = relocatedIdx + expectedPrev.length;
        }
      }

      // Update card state BEFORE e.apply() because e.apply() synchronously triggers onSelect -> aiChat.updateContext()
      cs.userToggled = true;
      cs.targetFrom = safeFrom;
      cs.lastAppliedLen = applied.text.length;
      cs.lastAppliedText = applied.text;
      cs.acceptedHunkIds = new Set(applied.appliedHunkIds);
      cs.selectedHunkIds = new Set(applied.appliedHunkIds);

      e.apply({
        from: safeFrom,
        to: safeTo,
        insert: applied.text,
        selStart: safeFrom,
        selEnd: safeFrom,
      });
      e.focus();
      ctx.toast?.(
        toastMsg ||
          `Applied ${applied.appliedCount}/${applied.totalHunks} ${applied.appliedCount === 1 ? "hunk" : "hunks"} to ${d.name} (snapshot saved in History).`,
        { kind: "success" },
      );
      return true;
    }

    const cardEl = h("div", {
      class: "bionic-md-code-card code-ai-code-card",
      dataset: { cardKey: effectiveKey },
    });

    function refreshCardDom() {
      const cs = computeOrGetCardState(false);
      const hunks = cs.diffRes?.hunks || [];
      const totalHunks = hunks.length;
      const hasHunks = !cs.diffRes?.identical && totalHunks > 0;
      const selectedCount = cs.selectedHunkIds.size;
      const acceptedCount = cs.acceptedHunkIds.size;
      const selInfo = activeSelectionInfo();
      const insertLabel = selInfo.hasSelection ? "⤓ Replace Selection" : "⤓ Insert at Cursor";

      cardEl.classList.toggle("has-diff-review", hasHunks);
      cardEl.classList.toggle("is-diff-view", hasHunks && cs.viewMode === "diff");

      // 1. Card Header Bar (Diff & Hunk controls front and centre)
      const barEl = h("div", { class: "bionic-md-code-bar code-ai-card-bar" }, [
        h("div", { class: "bionic-md-code-meta" }, [
          h("span", { class: "bionic-md-code-lang" }, displayLang),
          h(
            "span",
            { class: "ollama-pill" },
            `${lines.length} ${lines.length === 1 ? "line" : "lines"}`,
          ),
          hasHunks
            ? h(
                "span",
                {
                  class: "code-ai-diff-stats-pill",
                  title: `Proposed edit has +${cs.diffRes.added} added and −${cs.diffRes.removed} removed lines across ${totalHunks} ${totalHunks === 1 ? "hunk" : "hunks"}`,
                },
                [
                  h("span", { class: "code-ai-stat-hunks" }, `⇄ ${totalHunks} ${totalHunks === 1 ? "hunk" : "hunks"}`),
                  h("span", { class: "code-ai-stat-add" }, `+${cs.diffRes.added}`),
                  h("span", { class: "code-ai-stat-del" }, `−${cs.diffRes.removed}`),
                ],
              )
            : cs.diffRes?.identical && cs.originalBaseText
              ? h("span", { class: "ollama-pill code-ai-identical-pill" }, "✓ Identical to editor")
              : null,
          hasHunks && cs.targetLabel
            ? h(
                "button",
                {
                  type: "button",
                  class: "code-ai-target-pill",
                  title: `Comparing against ${cs.targetLabel}. Click to jump editor to line ${cs.startLine}.`,
                  onclick: () => {
                    const ed = ctx.getEditor?.();
                    ed?.goTo?.(cs.startLine || 1, 1);
                    ed?.focus?.();
                  },
                },
                `🎯 ${cs.targetLabel}`,
              )
            : null,
          hasHunks
            ? h(
                "div",
                {
                  class: "code-ai-view-switch",
                  role: "tablist",
                  "aria-label": "Toggle between Diff Review and Raw Code",
                },
                [
                  h(
                    "button",
                    {
                      type: "button",
                      role: "tab",
                      class: `code-ai-view-tab${cs.viewMode === "diff" ? " is-active" : ""}`,
                      "aria-selected": String(cs.viewMode === "diff"),
                      "data-ai-view-mode": "diff",
                      title: "Inspect diff and accept/reject individual hunks before applying",
                      onclick: () => {
                        cs.viewMode = "diff";
                        refreshCardDom();
                      },
                    },
                    `⇄ Diff & Hunks (${totalHunks})`,
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      role: "tab",
                      class: `code-ai-view-tab${cs.viewMode === "code" ? " is-active" : ""}`,
                      "aria-selected": String(cs.viewMode === "code"),
                      "data-ai-view-mode": "code",
                      title: "View the full proposed code block",
                      onclick: () => {
                        cs.viewMode = "code";
                        refreshCardDom();
                      },
                    },
                    "📄 Proposed Code",
                  ),
                ],
              )
            : null,
        ]),
        h("div", { class: "bionic-md-code-actions" }, [
          hasHunks
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini is-primary code-ai-apply-hunks-btn",
                  "data-ai-apply-selected-hunks": "true",
                  disabled: selectedCount === 0 && acceptedCount === 0 ? "disabled" : null,
                  title:
                    selectedCount === 0 && acceptedCount > 0
                      ? "Revert applied hunks back to the original code"
                      : `Apply the ${selectedCount} checked ${selectedCount === 1 ? "hunk" : "hunks"} (out of ${totalHunks}) to ${cs.docName || "the editor"} (saves a History snapshot first)`,
                  onclick: () => {
                    cs.userToggled = true;
                    if (selectedCount === 0 && acceptedCount > 0) {
                      applyHunkSetToEditor(
                        cs,
                        [],
                        `Before AI Revert Hunks`,
                        `Reverted AI hunks in ${cs.docName || "editor"}.`,
                      );
                    } else {
                      applyHunkSetToEditor(
                        cs,
                        cs.selectedHunkIds,
                        `Before AI Apply Hunks (${selectedCount}/${totalHunks})`,
                        `Applied ${selectedCount}/${totalHunks} selected ${selectedCount === 1 ? "hunk" : "hunks"} to ${cs.docName || "editor"} (History snapshot saved).`,
                      );
                    }
                    refreshCardDom();
                  },
                },
                selectedCount === 0 && acceptedCount > 0
                  ? `↩ Revert Applied (${acceptedCount})`
                  : `✓ Apply Selected ${selectedCount === 1 ? "Hunk" : "Hunks"} (${selectedCount}/${totalHunks})`,
              )
            : h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini is-primary",
                  title: selInfo.hasSelection
                    ? "Replace the highlighted selection in the active editor with this code block (saves a History snapshot first)"
                    : "Insert this code block at the cursor in the active editor (saves a History snapshot first)",
                  onclick: () => insertCodeIntoEditor(cleanCode, "cursor"),
                },
                insertLabel,
              ),
          hasHunks
            ? h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  "data-ai-apply-all": "true",
                  title: `Accept all ${totalHunks} hunks (apply whole proposed edit) to ${cs.docName || "editor"}`,
                  onclick: () => {
                    cs.userToggled = true;
                    cs.selectedHunkIds = new Set(hunks.map((x) => x.id));
                    applyHunkSetToEditor(
                      cs,
                      cs.selectedHunkIds,
                      "Before AI Apply Whole Edit",
                      `Applied all ${totalHunks} hunks to ${cs.docName || "editor"} (History snapshot saved).`,
                    );
                    refreshCardDom();
                  },
                },
                "📄 Apply Whole Edit",
              )
            : h(
                "button",
                {
                  type: "button",
                  class: "ollama-btn is-mini",
                  title: "Replace the entire active file with this code block (saves a History snapshot first)",
                  onclick: () => insertCodeIntoEditor(cleanCode, "file"),
                },
                "📄 Apply File",
              ),
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-mini",
              "data-ai-open-diff-tab": "true",
              title: "Open unified diff in a full editor tab",
              onclick: () => diffCodeWithEditor(cleanCode, lang),
            },
            "⇄ Diff Tab",
          ),
          h(
            "button",
            {
              type: "button",
              class: "ollama-btn is-mini",
              "data-ai-copy-code": "true",
              title:
                hasHunks && selectedCount > 0 && selectedCount < totalHunks
                  ? `Copy code with only the ${selectedCount} selected ${selectedCount === 1 ? "hunk" : "hunks"} applied`
                  : "Copy code block to clipboard",
              onclick: (e) => {
                if (hasHunks && selectedCount > 0 && selectedCount < totalHunks) {
                  const partial = applySelectedDiffHunks(cs.originalBaseText, cleanCode, cs.selectedHunkIds, {
                    context: 2,
                    mergeGap: 0,
                  });
                  void copyCodeText(
                    partial.text,
                    `${displayLang} (${selectedCount}/${totalHunks} hunks)`,
                    e.currentTarget,
                  );
                } else {
                  void copyCodeText(cleanCode, `${displayLang} code block`, e.currentTarget);
                }
              },
            },
            hasHunks && selectedCount > 0 && selectedCount < totalHunks
              ? `📋 Copy (${selectedCount}/${totalHunks})`
              : "📋 Copy",
          ),
        ]),
      ]);

      // 2. Front-and-Centre Diff & Hunk Review Body (when hasHunks && viewMode === "diff")
      if (hasHunks && cs.viewMode === "diff") {
        const hunkToolbar = h("div", { class: "code-ai-hunk-toolbar" }, [
          h("div", { class: "code-ai-hunk-toolbar-info" }, [
            h(
              "span",
              { class: "code-ai-hunk-guide" },
              "Review diff before Apply — uncheck unrelated changes or accept individual hunks:",
            ),
            h(
              "span",
              { class: "code-ai-hunk-counter" },
              `${selectedCount} of ${totalHunks} selected`,
            ),
            acceptedCount > 0
              ? h(
                  "span",
                  { class: "code-ai-hunk-applied-pill" },
                  `✓ ${acceptedCount}/${totalHunks} applied in editor`,
                )
              : null,
          ]),
          h("div", { class: "code-ai-hunk-bulk-actions" }, [
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ai-hunks-all": "true",
                title: "Select all hunks for Apply",
                onclick: () => {
                  cs.userToggled = true;
                  cs.selectedHunkIds = new Set(hunks.map((x) => x.id));
                  refreshCardDom();
                },
              },
              `☑ All (${totalHunks})`,
            ),
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ai-hunks-none": "true",
                title: "Deselect all hunks",
                onclick: () => {
                  cs.userToggled = true;
                  cs.selectedHunkIds.clear();
                  refreshCardDom();
                },
              },
              "☐ None",
            ),
            totalHunks > 1
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "ollama-btn is-mini",
                    "data-ai-hunks-invert": "true",
                    title: "Invert hunk selection",
                    onclick: () => {
                      cs.userToggled = true;
                      const next = new Set();
                      for (const hk of hunks) {
                        if (!cs.selectedHunkIds.has(hk.id)) next.add(hk.id);
                      }
                      cs.selectedHunkIds = next;
                      refreshCardDom();
                    },
                  },
                  "⇄ Invert",
                )
              : null,
            h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                "data-ai-rediff": "true",
                title: "Re-compare this AI code block against your current editor selection or file",
                onclick: () => {
                  computeOrGetCardState(true);
                  refreshCardDom();
                },
              },
              "↻ Re-diff",
            ),
          ]),
        ]);

        const hunkCards = hunks.map((hunk) => {
          const isSelected = cs.selectedHunkIds.has(hunk.id);
          const isAccepted = cs.acceptedHunkIds.has(hunk.id);
          const oldEndLine = hunk.oldStart + Math.max(0, hunk.oldCount - 1);
          const lineRangeLabel =
            hunk.oldCount > 1 ? `Lines ${hunk.oldStart}–${oldEndLine}` : `Line ${hunk.oldStart}`;

          const diffRows = hunk.lines.map((op) => {
            const rowKind = op.type === "+" ? "is-add" : op.type === "-" ? "is-del" : "is-ctx";
            const absOld =
              op.oldLine !== null ? (cs.startLine > 1 ? cs.startLine + op.oldLine - 1 : op.oldLine) : "";
            const absNew =
              op.newLine !== null ? (cs.startLine > 1 ? cs.startLine + op.newLine - 1 : op.newLine) : "";
            return h("div", { class: `code-ai-diff-row ${rowKind}` }, [
              h(
                "span",
                { class: "code-ai-diff-ln is-old", "aria-hidden": "true" },
                absOld !== "" ? String(absOld) : "",
              ),
              h(
                "span",
                { class: "code-ai-diff-ln is-new", "aria-hidden": "true" },
                absNew !== "" ? String(absNew) : "",
              ),
              h("span", { class: "code-ai-diff-sign", "aria-hidden": "true" }, op.type),
              renderTokenizedSpan(lang, op.line),
            ]);
          });

          return h(
            "section",
            {
              class: `code-ai-hunk-card${isSelected ? " is-selected" : " is-excluded"}${isAccepted ? " is-accepted" : ""}`,
              "data-ai-hunk-id": String(hunk.id),
            },
            [
              h("div", { class: "code-ai-hunk-head" }, [
                h(
                  "label",
                  {
                    class: "code-ai-hunk-toggle",
                    title: isSelected
                      ? `Hunk #${hunk.number} is included in "Apply Selected Hunks". Uncheck to skip this hunk.`
                      : `Hunk #${hunk.number} is skipped. Check to include it in "Apply Selected Hunks".`,
                  },
                  [
                    h("input", {
                      type: "checkbox",
                      class: "code-ai-hunk-checkbox",
                      "data-ai-hunk-check": String(hunk.id),
                      checked: isSelected ? "checked" : null,
                      onchange: (e) => {
                        cs.userToggled = true;
                        if (e.target.checked) cs.selectedHunkIds.add(hunk.id);
                        else cs.selectedHunkIds.delete(hunk.id);
                        refreshCardDom();
                      },
                    }),
                    h("span", { class: "code-ai-hunk-title" }, `Hunk #${hunk.number}`),
                  ],
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "code-ai-hunk-loc",
                    "data-ai-jump-line": String(cs.startLine > 1 ? cs.startLine + hunk.oldStart - 1 : hunk.oldStart),
                    title: `Jump active editor to ${lineRangeLabel} (${hunk.header})`,
                    onclick: () => {
                      const targetLine = cs.startLine > 1 ? cs.startLine + hunk.oldStart - 1 : hunk.oldStart;
                      const ed = ctx.getEditor?.();
                      ed?.goTo?.(targetLine, 1);
                      ed?.focus?.();
                    },
                  },
                  `${lineRangeLabel} · ${hunk.header} ↗`,
                ),
                h("span", { class: "code-ai-hunk-deltas" }, [
                  h("span", { class: "code-ai-delta-add" }, `+${hunk.added}`),
                  h("span", { class: "code-ai-delta-del" }, `−${hunk.removed}`),
                ]),
                h(
                  "span",
                  {
                    class: `code-ai-hunk-status-pill ${
                      isAccepted ? "is-accepted" : isSelected ? "is-included" : "is-skipped"
                    }`,
                  },
                  isAccepted ? "✓ Applied" : isSelected ? "Included" : "Skipped",
                ),
                h("span", { class: "code-grow" }),
                h(
                  "button",
                  {
                    type: "button",
                    class: `ollama-btn is-mini ${isAccepted ? "is-active" : "is-primary"} code-ai-accept-hunk-btn`,
                    "data-ai-accept-hunk": String(hunk.id),
                    title: isAccepted
                      ? `Revert Hunk #${hunk.number} in ${cs.docName || "the editor"}`
                      : `Accept and apply ONLY Hunk #${hunk.number} to ${cs.docName || "the editor"} right now (saves History snapshot)`,
                    onclick: () => {
                      cs.userToggled = true;
                      const nextAccepted = new Set(cs.acceptedHunkIds);
                      const reverting = nextAccepted.has(hunk.id);
                      if (reverting) {
                        nextAccepted.delete(hunk.id);
                        cs.selectedHunkIds.delete(hunk.id);
                      } else {
                        nextAccepted.add(hunk.id);
                        cs.selectedHunkIds.add(hunk.id);
                      }
                      applyHunkSetToEditor(
                        cs,
                        nextAccepted,
                        reverting
                          ? `Before AI Revert Hunk #${hunk.number}`
                          : `Before AI Accept Hunk #${hunk.number}`,
                        reverting
                          ? `Reverted Hunk #${hunk.number} in ${cs.docName || "editor"}.`
                          : `Accepted Hunk #${hunk.number} (${lineRangeLabel}) in ${cs.docName || "editor"} (History snapshot saved).`,
                      );
                      refreshCardDom();
                    },
                  },
                  isAccepted ? `↩ Revert Hunk #${hunk.number}` : `✓ Accept Hunk #${hunk.number}`,
                ),
              ]),
              h(
                "div",
                { class: `code-ai-hunk-lines${state.codeWrap ? " is-wrapped" : ""}` },
                diffRows,
              ),
            ],
          );
        });

        const diffReviewBody = h("div", { class: "code-ai-diff-review" }, [
          hunkToolbar,
          h("div", { class: "code-ai-hunk-list" }, hunkCards),
        ]);

        cardEl.replaceChildren(barEl, diffReviewBody);
        return;
      }

      // 3. Raw Code Body
      cardEl.replaceChildren(barEl, buildRawCodeBody());
    }

    refreshCardDom();
    return cardEl;
  }

  function renderAstNode(node, ctxMeta = { msgKey: "", blockIdx: 0 }) {
    if (!node) return document.createTextNode("");
    switch (node.tag) {
      case "#text":
        return document.createTextNode(node.text || "");
      case "#inline": {
        const frag = document.createDocumentFragment();
        for (const c of node.children || []) frag.append(renderAstNode(c, ctxMeta));
        return frag;
      }
      case "br":
        return h("br");
      case "hr":
        return h("hr");
      case "code":
        return h("code", { class: "bionic-md-inline-code" }, node.text || "");
      case "pre": {
        const idx = ctxMeta.blockIdx++;
        const cardKey = `${ctxMeta.msgKey || "msg"}:block:${idx}`;
        return renderCodeBlockCard(node.text || "", node.lang || "", cardKey);
      }
      case "a": {
        const href = String(node.href || "").trim();
        return h(
          "a",
          {
            href: href || "#",
            class: "bionic-md-link",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          (node.children || []).map((c) => renderAstNode(c, ctxMeta)),
        );
      }
      case "blockquote":
        return h(
          "blockquote",
          { class: "bionic-md-blockquote" },
          (node.children || []).map((c) => renderAstNode(c, ctxMeta)),
        );
      case "ul":
        return h("ul", {}, (node.children || []).map((c) => renderAstNode(c, ctxMeta)));
      case "ol":
        return h(
          "ol",
          { start: node.start > 1 ? String(node.start) : null },
          (node.children || []).map((c) => renderAstNode(c, ctxMeta)),
        );
      case "li":
        return h("li", {}, (node.children || []).map((c) => renderAstNode(c, ctxMeta)));
      case "table": {
        const theadNode = (node.children || []).find((c) => c.tag === "thead");
        const tbodyNode = (node.children || []).find((c) => c.tag === "tbody");
        const thEls = (theadNode?.children?.[0]?.children || []).map((th) =>
          h("th", {}, (th.children || []).map((c) => renderAstNode(c, ctxMeta))),
        );
        const trEls = (tbodyNode?.children || []).map((tr) =>
          h(
            "tr",
            {},
            (tr.children || []).map((td) =>
              h("td", {}, (td.children || []).map((c) => renderAstNode(c, ctxMeta))),
            ),
          ),
        );
        return h("div", { class: "bionic-md-table-wrap" }, [
          h("table", { class: "bionic-md-table" }, [
            h("thead", {}, [h("tr", {}, thEls)]),
            h("tbody", {}, trEls),
          ]),
        ]);
      }
      default: {
        if (/^h[1-6]$/.test(node.tag)) {
          return h(
            node.tag,
            { class: `bionic-md-heading bionic-md-${node.tag}` },
            (node.children || []).map((c) => renderAstNode(c, ctxMeta)),
          );
        }
        const safeTag = ["p", "strong", "em", "del", "span", "div"].includes(node.tag) ? node.tag : "span";
        return h(
          safeTag,
          {},
          (node.children || []).map((c) => renderAstNode(c, ctxMeta)),
        );
      }
    }
  }

  function renderMarkdownBody(rawText, msgKey = "") {
    const clean = String(rawText ?? "").trim();
    if (!clean) return h("div", { class: "code-ai-empty-msg" }, "…");
    const { nodes } = parseMarkdown(clean);
    const ctxMeta = { msgKey: msgKey || "msg", blockIdx: 0 };
    const out = (nodes || []).map((n) => renderAstNode(n, ctxMeta));
    return h("div", { class: "bionic-md-viewer code-ai-md-body" }, out);
  }

  function buildPromptWithEditorContext(userPrompt) {
    const d = ctx.getDoc?.();
    const selInfo = activeSelectionInfo();
    const parts = [];

    const profile = resolveCodeChatActiveProfile();
    if (state.engine === "bionic" && state.selectedSkill && profile.features?.tools && !userPrompt.includes(`@${state.selectedSkill}`)) {
      parts.push(`@${state.selectedSkill}`);
    }

    parts.push(
      "You are an expert AI pair-programming assistant embedded inside the Codecaine Code Editor. Provide concise, accurate answers and place any code solutions inside fenced markdown code blocks with the language tag.",
    );

    if (d && d.kind !== "diff") {
      const fileHeader = `Active Editor File: ${d.name}${d.path ? ` (${d.path})` : ""} [Language: ${d.lang || "text"}, Cursor Line: ${d.line || 1}]`;
      if (selInfo.hasSelection && state.includeSelection) {
        parts.push(
          `${fileHeader}\nSelected Code (Lines ${selInfo.startLine}–${selInfo.endLine}):\n\`\`\`${d.lang || ""}\n${selInfo.text.slice(0, 24000)}\n\`\`\``,
        );
      }
      if (state.includeFile && d.text) {
        // Avoid duplicating if the selection is already the entire file
        if (!selInfo.hasSelection || !state.includeSelection || selInfo.text.length < d.text.length) {
          const maxFileChars = 28000;
          const truncated = d.text.length > maxFileChars;
          const fileSnippet = truncated ? `${d.text.slice(0, maxFileChars)}\n/* ... truncated (${d.text.length} total chars) ... */` : d.text;
          parts.push(`${fileHeader}\nFull File Content:\n\`\`\`${d.lang || ""}\n${fileSnippet}\n\`\`\``);
        }
      }
    }

    // Include recent conversation turns (up to last 4 messages) for multi-turn continuity
    const recentMsgs = state.messages.slice(-4);
    if (recentMsgs.length > 0) {
      const historyLines = recentMsgs
        .filter((m) => m.content && !m.streaming)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 2500)}`);
      if (historyLines.length > 0) {
        parts.push(`Recent Conversation Context:\n${historyLines.join("\n\n")}`);
      }
    }

    parts.push(`User Request:\n${userPrompt}`);
    return parts.join("\n\n");
  }

  async function sendPrompt(customPromptText) {
    if (state.loading) return;
    const rawPrompt =
      customPromptText !== undefined
        ? String(customPromptText).trim()
        : String(promptInputEl ? promptInputEl.value : state.promptText || "").trim();
    if (!rawPrompt) {
      ctx.toast?.("Type a question or click one of the Quick Code chips above.");
      return;
    }

    if (customPromptText === undefined) {
      state.promptText = "";
      if (promptInputEl) promptInputEl.value = "";
    }

    const d = ctx.getDoc?.();
    const selInfo = activeSelectionInfo();
    const contextBadge = d
      ? selInfo.hasSelection && state.includeSelection
        ? `${d.name} (L${selInfo.startLine}–L${selInfo.endLine})`
        : state.includeFile
          ? d.name
          : "No file context"
      : "No open file";

    const fullPrompt = buildPromptWithEditorContext(rawPrompt);
    const activeEngine = state.engine;
    const activeModel = activeEngine === "bionic" ? state.bionicModel : state.ollamaModel;

    const userMsg = {
      id: Date.now(),
      role: "user",
      content: rawPrompt,
      contextBadge,
      engine: activeEngine,
      model: activeModel,
    };
    const assistantMsg = {
      id: Date.now() + 1,
      role: "assistant",
      content: "",
      reasoning: "",
      engine: activeEngine,
      model: activeModel || (activeEngine === "bionic" ? "LM Studio Bionic" : "Ollama"),
      streaming: true,
      error: "",
      stats: null,
    };

    state.messages.push(userMsg, assistantMsg);
    state.loading = true;
    const abortCtrl = new AbortController();
    state.abortController = abortCtrl;
    render();
    scrollToLatestReply();

    try {
      if (activeEngine === "bionic") {
        await streamFromBionic(fullPrompt, assistantMsg, abortCtrl.signal);
      } else {
        await streamFromOllama(fullPrompt, assistantMsg, abortCtrl.signal);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        assistantMsg.content = assistantMsg.content
          ? `${assistantMsg.content}\n\n*(Stopped by user)*`
          : "*(Generation stopped)*";
      } else {
        assistantMsg.error = err?.message || "AI request failed.";
      }
    } finally {
      assistantMsg.streaming = false;
      state.loading = false;
      state.abortController = null;
      render();
      scrollToLatestReply();
    }
  }

  async function streamFromBionic(fullPrompt, assistantMsg, signal) {
    const thinkArgs = resolveCodeChatThinkArgs();
    const profile = resolveCodeChatActiveProfile();
    const res = await fetch("/api/bionic/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": getToken(),
      },
      body: JSON.stringify({
        model: state.bionicModel || undefined,
        prompt: fullPrompt,
        paths: [],
        maxTokens: 16384,
        think: thinkArgs.think,
        thinkingLevel: thinkArgs.thinkingLevel,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      // Fallback to RPC bionic/chat
      const rpcRes = await call(
        "bionic/chat",
        {
          model: state.bionicModel || undefined,
          prompt: fullPrompt,
          paths: [],
          dirPath: ctx.getWorkspace?.() || "/",
          skill: profile.features?.tools && state.selectedSkill ? state.selectedSkill : undefined,
          maxTokens: 16384,
          think: thinkArgs.think,
          thinkingLevel: thinkArgs.thinkingLevel,
        },
        { signal },
      );
      assistantMsg.model = rpcRes.model || assistantMsg.model;
      assistantMsg.reasoning = rpcRes.reasoningText || "";
      assistantMsg.content = rpcRes.content || "";
      assistantMsg.stats = rpcRes.stats || null;
      return;
    }

    const usedModel = res.headers.get("X-Bionic-Model");
    if (usedModel) assistantMsg.model = usedModel;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawAccum = "";
    let explicitReasoning = "";

    const processBionicSseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payloadStr = trimmed.slice(5).trim();
      if (!payloadStr || payloadStr === "[DONE]") return;
      try {
        const pkt = JSON.parse(payloadStr);
        const delta = pkt?.choices?.[0]?.delta || {};
        if (delta.reasoning || delta.reasoning_content) {
          explicitReasoning += delta.reasoning || delta.reasoning_content;
        }
        if (delta.content) {
          rawAccum += delta.content;
        }
      } catch {}
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) processBionicSseLine(line);
        }
        const split = splitThinkBlocks(rawAccum);
        assistantMsg.reasoning = [explicitReasoning, split.reasoning].filter(Boolean).join("\n\n");
        assistantMsg.content = split.content;
        renderThreadOnly();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processBionicSseLine(line);
      }
      const split = splitThinkBlocks(rawAccum);
      assistantMsg.reasoning = [explicitReasoning, split.reasoning].filter(Boolean).join("\n\n");
      assistantMsg.content = split.content;
      renderThreadOnly();
    }
  }

  async function streamFromOllama(fullPrompt, assistantMsg, signal) {
    const thinkArgs = resolveCodeChatThinkArgs();
    const res = await fetch("/api/ollama/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": getToken(),
      },
      body: JSON.stringify({
        model: state.ollamaModel || undefined,
        prompt: fullPrompt,
        paths: [],
        numPredict: 16384,
        think: thinkArgs.think,
        thinkingLevel: thinkArgs.thinkingLevel,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const rpcRes = await call(
        "ollama/chat",
        {
          model: state.ollamaModel || undefined,
          prompt: fullPrompt,
          paths: [],
          numPredict: 16384,
          think: thinkArgs.think,
          thinkingLevel: thinkArgs.thinkingLevel,
        },
        { signal },
      );
      assistantMsg.model = rpcRes.model || assistantMsg.model;
      assistantMsg.reasoning = rpcRes.thinkingText || "";
      assistantMsg.content = rpcRes.content || "";
      return;
    }

    const usedModel = res.headers.get("X-Ollama-Model");
    if (usedModel) assistantMsg.model = usedModel;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawAccum = "";
    let explicitThinking = "";

    const processOllamaLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const pkt = JSON.parse(trimmed);
        if (pkt.message?.thinking) {
          explicitThinking += pkt.message.thinking;
        }
        if (pkt.message?.content) {
          rawAccum += pkt.message.content;
        }
      } catch {}
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) processOllamaLine(line);
        }
        const split = splitThinkBlocks(rawAccum);
        assistantMsg.reasoning = [explicitThinking, split.reasoning].filter(Boolean).join("\n\n");
        assistantMsg.content = split.content;
        renderThreadOnly();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processOllamaLine(line);
      }
      const split = splitThinkBlocks(rawAccum);
      assistantMsg.reasoning = [explicitThinking, split.reasoning].filter(Boolean).join("\n\n");
      assistantMsg.content = split.content;
      renderThreadOnly();
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      try {
        state.abortController.abort();
      } catch {}
    }
  }

  function scrollToLatestReply() {
    if (!threadContainerEl) return;
    requestAnimationFrame(() => {
      if (!threadContainerEl) return;
      const cards = threadContainerEl.querySelectorAll(".code-ai-msg.is-assistant");
      const lastCard = cards[cards.length - 1];
      if (lastCard instanceof HTMLElement) {
        lastCard.scrollIntoView({ block: "start", behavior: "instant" });
      } else {
        threadContainerEl.scrollTop = threadContainerEl.scrollHeight;
      }
    });
  }

  function renderMessageCard(msg, idx = 0) {
    if (msg.role === "user") {
      return h("div", { class: "code-ai-msg is-user" }, [
        h("div", { class: "code-ai-msg-head" }, [
          h("strong", {}, "You"),
          msg.contextBadge ? h("span", { class: "code-ai-ctx-pill" }, `📎 ${msg.contextBadge}`) : null,
        ]),
        h("div", { class: "code-ai-user-text" }, msg.content),
      ]);
    }

    const engineBadge = msg.engine === "bionic" ? "🧬 LM Studio Bionic" : "🤖 Ollama";
    return h("div", { class: "code-ai-msg is-assistant" }, [
      h("div", { class: "code-ai-msg-head" }, [
        h("span", { class: "code-ai-engine-tag" }, engineBadge),
        msg.model ? h("span", { class: "code-ai-model-tag" }, msg.model) : null,
        h("span", { class: "code-grow" }),
        msg.content
          ? h(
              "button",
              {
                type: "button",
                class: "ollama-btn is-mini",
                title: "Copy entire AI response",
                onclick: (e) => void copyCodeText(msg.content, "AI response", e.currentTarget),
              },
              "📋 Copy",
            )
          : null,
      ]),
      msg.reasoning
        ? h("details", { class: "ollama-thinking-details code-ai-think", open: !msg.content ? "open" : null }, [
            h("summary", { class: "ollama-thinking-summary" }, `🧠 Reasoning Trace (${msg.reasoning.length.toLocaleString()} chars)`),
            h("div", { class: "ollama-thinking-box" }, msg.reasoning),
          ])
        : null,
      msg.error
        ? h("div", { class: "code-ai-err" }, `⚠ ${msg.error}`)
        : msg.streaming && !msg.content && !msg.reasoning
          ? h("div", { class: "code-ai-streaming" }, "⚡ Thinking & streaming tokens…")
          : renderMarkdownBody(msg.content, `msg-${msg.id ?? idx}`),
    ]);
  }

  function buildThreadNodes() {
    if (state.messages.length === 0) {
      const d = ctx.getDoc?.();
      return [
        h("div", { class: "code-ai-welcome" }, [
          h("div", { class: "code-ai-welcome-title" }, "🤖 Code Editor AI Assistant"),
          h(
            "p",
            { class: "code-ai-welcome-sub" },
            "Ask questions about your active file, highlight lines to refactor or debug, and review inline diffs or accept individual hunks with 1 click.",
          ),
          d
            ? h("div", { class: "code-ai-welcome-file" }, `📄 Active tab: ${d.name} (${d.lang || "text"})`)
            : h("div", { class: "code-ai-welcome-file" }, "Open any file tab or start chatting below."),
        ]),
      ];
    }
    return state.messages.map((m, idx) => renderMessageCard(m, idx));
  }

  function renderThreadOnly() {
    if (!threadContainerEl) {
      render();
      return;
    }
    clear(threadContainerEl);
    threadContainerEl.append(...buildThreadNodes());
    scrollToLatestReply();
  }

  function render() {
    const savedDraft = promptInputEl ? promptInputEl.value : state.promptText;
    const hadFocus = promptInputEl && document.activeElement === promptInputEl;
    const prevScrollTop = threadContainerEl ? threadContainerEl.scrollTop : 0;
    clear(root);

    const isBionic = state.engine === "bionic";
    const bionicOnline = Boolean(state.bionicStatus?.server?.running);
    const ollamaOnline = Boolean(state.ollamaStatus?.daemon?.running);
    const currentOnline = isBionic ? bionicOnline : ollamaOnline;

    const bionicModels = getCombinedBionicModels(state.bionicStatus);
    const ollamaModels = Array.isArray(state.ollamaStatus?.models) ? state.ollamaStatus.models : [];
    const skills = Array.isArray(state.bionicStatus?.skills) ? state.bionicStatus.skills : [];

    const d = ctx.getDoc?.();
    const selInfo = activeSelectionInfo();

    root.classList.toggle("is-expanded", Boolean(state.expanded));
    root.classList.toggle("is-fullscreen", Boolean(state.fullscreen));

    // 1. Header bar: Engine Switcher (LM Studio Bionic vs Ollama) + status dot + Expand/Fullscreen/Stop/Close
    const head = h("div", { class: "code-preview-head code-ai-head" }, [
      h("div", { class: "code-ai-engine-switch", role: "group", "aria-label": "Choose AI Engine" }, [
        h(
          "button",
          {
            type: "button",
            class: `code-ai-eng-btn${isBionic ? " is-active" : ""}`,
            "aria-pressed": String(isBionic),
            title: "Use LM Studio / Bionic local server (:1234 / :1235)",
            onclick: () => {
              state.engine = "bionic";
              state.engineManuallyChosen = true;
              syncCodeChatModelCapabilities();
              render();
            },
          },
          [
            h("span", { class: `code-ai-dot ${bionicOnline ? "is-online" : "is-offline"}` }),
            "🧬 LM Studio",
          ],
        ),
        h(
          "button",
          {
            type: "button",
            class: `code-ai-eng-btn${!isBionic ? " is-active" : ""}`,
            "aria-pressed": String(!isBionic),
            title: "Use Ollama local server (:11434)",
            onclick: () => {
              state.engine = "ollama";
              state.engineManuallyChosen = true;
              syncCodeChatModelCapabilities();
              render();
            },
          },
          [
            h("span", { class: `code-ai-dot ${ollamaOnline ? "is-online" : "is-offline"}` }),
            "🤖 Ollama",
          ],
        ),
      ]),
      h("span", { class: "code-grow" }),
      state.loading
        ? h(
            "button",
            {
              type: "button",
              class: "btn code-small danger",
              "data-code-ai-action": "stop-generation",
              title: "Stop LLM generation immediately",
              onclick: stopGeneration,
            },
            "⏹ Stop",
          )
        : null,
      h(
        "button",
        {
          type: "button",
          class: `btn code-small${state.expanded ? " primary" : ""}`,
          "data-code-ai-action": "toggle-expand",
          "aria-pressed": String(Boolean(state.expanded)),
          title: "Expand AI Chat pane width for easier reading of long responses and code blocks",
          onclick: () => {
            state.expanded = !state.expanded;
            if (!state.expanded) state.fullscreen = false;
            render();
          },
        },
        state.expanded ? "⤡ Narrow" : "⤢ Expand",
      ),
      h(
        "button",
        {
          type: "button",
          class: `btn code-small${state.fullscreen ? " primary" : ""}`,
          "data-code-ai-action": "toggle-fullscreen",
          "aria-pressed": String(Boolean(state.fullscreen)),
          title: "Toggle Fullscreen AI Reader Mode",
          onclick: () => {
            state.fullscreen = !state.fullscreen;
            if (state.fullscreen) state.expanded = true;
            render();
          },
        },
        state.fullscreen ? "✕ Exit Full" : "⛶ Full",
      ),
      h(
        "button",
        {
          type: "button",
          class: `btn code-small${state.codeWrap ? " primary" : ""}`,
          title: "Toggle word-wrap inside chat code blocks",
          onclick: () => {
            state.codeWrap = !state.codeWrap;
            render();
          },
        },
        "↩ Wrap",
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn code-small",
          title: "Refresh LM Studio & Ollama models",
          onclick: () => void refreshEngines(false),
        },
        state.statusLoading ? "…" : "↻",
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn code-small",
          title: "Clear chat history",
          disabled: state.messages.length === 0 ? "disabled" : null,
          onclick: () => {
            state.messages = [];
            state.codeCardStates.clear();
            render();
          },
        },
        "🧹",
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn code-small",
          title: "Hide AI Code Chat (Mod+Shift+I)",
          "aria-label": "Close AI Code Chat",
          onclick: () => ctx.onClose?.(),
        },
        "✕",
      ),
    ]);

    const activeProfile = resolveCodeChatActiveProfile();
    const activeFeatures = activeProfile.features || {};

    // 2. Model & @Skill selector row (+ Start Server helper if offline)
    const modelBar = h("div", { class: "code-ai-model-bar" }, [
      isBionic
        ? h(
            "select",
            {
              class: "code-in code-ai-select",
              "aria-label": "Select LM Studio model",
              title: "Choose LM Studio / Bionic model",
              onchange: (e) => {
                state.bionicModel = e.target.value;
                syncCodeChatModelCapabilities();
                render();
              },
            },
            bionicModels.length === 0
              ? [h("option", { value: "" }, bionicOnline ? "Default loaded model" : "LM Studio offline — click Start")]
              : bionicModels.map((m) =>
                  h(
                    "option",
                    {
                      value: m.id,
                      selected: m.id === state.bionicModel ? "selected" : null,
                    },
                    m.isCloud || m.format === "cloud"
                      ? `☁️ ${m.displayName || m.id} (BIONIC CLOUD • 0 GB RAM)`
                      : `${m.loaded ? "🟢 " : ""}${m.displayName || m.id} (${(m.format || "mlx").toUpperCase()})`,
                  ),
                ),
          )
        : h(
            "select",
            {
              class: "code-in code-ai-select",
              "aria-label": "Select Ollama model",
              title: "Choose Ollama model",
              onchange: (e) => {
                state.ollamaModel = e.target.value;
                syncCodeChatModelCapabilities();
                render();
              },
            },
            ollamaModels.length === 0
              ? [h("option", { value: "" }, ollamaOnline ? "Default Ollama model" : "Ollama offline")]
              : ollamaModels.map((m) =>
                  h(
                    "option",
                    {
                      value: m.name,
                      selected: m.name === state.ollamaModel ? "selected" : null,
                    },
                    `${m.name} (${m.parameterSize || "LLM"})`,
                  ),
                ),
          ),
      isBionic && skills.length > 0 && activeFeatures.tools
        ? h(
            "select",
            {
              class: "code-in code-ai-skill-select",
              "aria-label": "Attach Bionic @Skill",
              title: "Optional: inject a Bionic @skill into your editor prompt",
              onchange: (e) => {
                state.selectedSkill = e.target.value;
              },
            },
            [
              h("option", { value: "" }, "No @skill"),
              ...skills.map((s) =>
                h(
                  "option",
                  {
                    value: s.name,
                    selected: s.name === state.selectedSkill ? "selected" : null,
                  },
                  `@${s.name}`,
                ),
              ),
            ],
          )
        : null,
      activeFeatures.thinkingLevels
        ? h(
            "select",
            {
              class: "code-in code-ai-skill-select",
              "aria-label": "Reasoning effort level (Low / Medium / High)",
              title: "Select reasoning effort level for this multi-level reasoning model (gpt-oss)",
              onchange: (e) => {
                state.thinkingLevel = e.target.value;
              },
            },
            [
              { val: "low", label: "🧠 Effort: Low" },
              { val: "medium", label: "🧠 Effort: Medium" },
              { val: "high", label: "🧠 Effort: High" },
            ].map((opt) =>
              h(
                "option",
                {
                  value: opt.val,
                  selected: (state.thinkingLevel === "low" || state.thinkingLevel === "medium" || state.thinkingLevel === "high" ? state.thinkingLevel : "medium") === opt.val ? "selected" : null,
                },
                opt.label,
              ),
            ),
          )
        : activeFeatures.thinkingToggle
          ? h(
              "select",
              {
                class: "code-in code-ai-skill-select",
                "aria-label": "Toggle thinking On or Off",
                title: "Turn chain-of-thought thinking On or Off for this model",
                onchange: (e) => {
                  state.thinkingLevel = e.target.value;
                },
              },
              [
                { val: "off", label: "🔀 Think: Off (Fast)" },
                { val: "on", label: "🔀 Think: On (Deep)" },
              ].map((opt) =>
                h(
                  "option",
                  {
                    value: opt.val,
                    selected: (state.thinkingLevel === "on" ? "on" : "off") === opt.val ? "selected" : null,
                  },
                  opt.label,
                ),
              ),
            )
          : activeFeatures.thinkingAlwaysOn
            ? h(
                "span",
                {
                  class: "code-ai-chip",
                  title: "Native chain-of-thought reasoning is always active for this model",
                  style: "cursor:default;",
                },
                "🧠 Always-On <think>",
              )
            : null,
      !currentOnline && isBionic
        ? h(
            "button",
            {
              type: "button",
              class: "btn code-small primary",
              title: "Start LM Studio / Bionic local server via lms CLI",
              onclick: async () => {
                try {
                  ctx.toast?.("Starting LM Studio local server…");
                  await call("bionic/server/control", { action: "start" });
                  await refreshEngines(false);
                } catch (err) {
                  ctx.toast?.(err?.message || "Could not start LM Studio server", { kind: "error" });
                }
              },
            },
            "▶ Start Server",
          )
        : null,
    ]);

    const modelCapabilitiesBar = h(
      "div",
      {
        class: "code-ai-quick-bar code-ai-model-caps-bar",
        "data-code-model-capabilities": activeProfile.modelName,
      },
      (activeProfile.indicators || []).map((ind) =>
        h(
          "span",
          {
            class: "code-ai-chip",
            "data-model-indicator": ind.id,
            title: ind.description,
            style: "cursor:default;font-size:10.5px;padding:2px 6px;",
          },
          `${ind.icon} ${ind.label}`,
        ),
      ),
    );

    // 3. Quick Code Action Chips
    const quickBar = h(
      "div",
      { class: "code-ai-quick-bar", role: "toolbar", "aria-label": "Quick AI code actions" },
      QUICK_PROMPTS.map((q) =>
        h(
          "button",
          {
            type: "button",
            class: "code-ai-chip",
            title: q.tip,
            disabled: state.loading ? "disabled" : null,
            onclick: () => void sendPrompt(q.buildPrompt(selInfo.hasSelection)),
          },
          q.label,
        ),
      ),
    );

    // 4. Thread container
    threadContainerEl = h(
      "div",
      {
        class: "code-ai-thread",
        role: "log",
        "aria-live": "polite",
        tabindex: "0",
      },
      buildThreadNodes(),
    );

    // 5. Context Bar + Prompt Composer
    const contextBar = h("div", { class: "code-ai-context-bar" }, [
      d && d.kind !== "diff"
        ? h(
            "label",
            {
              class: `code-ai-ctx-toggle${state.includeFile ? " is-on" : ""}`,
              title: "Include active editor file content as context",
            },
            [
              h("input", {
                type: "checkbox",
                checked: state.includeFile ? "checked" : null,
                onchange: (e) => {
                  state.includeFile = e.target.checked;
                  render();
                },
              }),
              `📄 ${d.name}`,
            ],
          )
        : h("span", { class: "code-ai-ctx-muted" }, "No active file"),
      selInfo.hasSelection
        ? h(
            "label",
            {
              class: `code-ai-ctx-toggle is-selection${state.includeSelection ? " is-on" : ""}`,
              title: "Include highlighted selection lines in prompt",
            },
            [
              h("input", {
                type: "checkbox",
                checked: state.includeSelection ? "checked" : null,
                onchange: (e) => {
                  state.includeSelection = e.target.checked;
                  render();
                },
              }),
              `✂️ Lines ${selInfo.startLine}–${selInfo.endLine} (${selInfo.text.length} chars)`,
            ],
          )
        : null,
    ]);

    promptInputEl = h("textarea", {
      class: "code-in code-ai-input",
      "aria-label": "Ask AI Code Assistant",
      rows: "3",
      placeholder: selInfo.hasSelection
        ? `Ask ${isBionic ? "LM Studio" : "Ollama"} about selected lines ${selInfo.startLine}–${selInfo.endLine}… (Enter to send, Shift+Enter for newline)`
        : `Ask ${isBionic ? "LM Studio" : "Ollama"} about ${d ? d.name : "your code"}… (Enter to send, Shift+Enter for newline)`,
      value: savedDraft,
      oninput: (e) => {
        state.promptText = e.target.value;
      },
      onkeydown: (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void sendPrompt();
        }
      },
    });
    promptInputEl.value = savedDraft;

    const composer = h("div", { class: "code-ai-composer" }, [
      contextBar,
      promptInputEl,
      h("div", { class: "code-ai-composer-foot" }, [
        h(
          "span",
          { class: "code-ai-foot-hint" },
          isBionic
            ? `LM Studio (${state.bionicStatus?.server?.port || 1234})`
            : "Ollama (:11434)",
        ),
        h("span", { class: "code-grow" }),
        state.loading
          ? h(
              "button",
              {
                type: "button",
                class: "btn code-small danger",
                onclick: stopGeneration,
              },
              "⏹ Stop",
            )
          : h(
              "button",
              {
                type: "button",
                class: "code-btn primary code-small",
                onclick: () => void sendPrompt(),
              },
              "⚡ Send",
            ),
      ]),
    ]);

    root.append(head, modelBar, modelCapabilitiesBar, quickBar, threadContainerEl, composer);
    if (threadContainerEl && prevScrollTop > 0) {
      threadContainerEl.scrollTop = prevScrollTop;
    }
    if (hadFocus && promptInputEl) {
      promptInputEl.focus();
    }
  }

  let lastCtxKey = "";
  let msgSeq = 0;

  const controller = {
    el: root,
    refreshEngines,
    updateContext() {
      if (root.hidden) return;
      const d = ctx.getDoc?.();
      const sel = activeSelectionInfo();
      const nextKey = `${d?.id ?? 0}:${d?.name ?? ""}:${sel.hasSelection ? `${sel.start}-${sel.end}` : "nosel"}`;
      if (nextKey === lastCtxKey) return;
      lastCtxKey = nextKey;
      render();
    },
    focusInput() {
      if (!state.bionicStatus && !state.ollamaStatus) {
        void refreshEngines(true);
      }
      render();
      requestAnimationFrame(() => promptInputEl?.focus());
    },
    askAboutSelection(actionId = "explain") {
      if (!state.bionicStatus && !state.ollamaStatus) {
        void refreshEngines(true);
      }
      const q = QUICK_PROMPTS.find((x) => x.id === actionId) || QUICK_PROMPTS[0];
      const selInfo = activeSelectionInfo();
      void sendPrompt(q.buildPrompt(selInfo.hasSelection));
    },
    pushMessage(msg) {
      if (!msg || typeof msg !== "object") return;
      state.messages.push({
        id: msg.id ?? ++msgSeq,
        role: msg.role || "assistant",
        engine: msg.engine || state.engine,
        model: msg.model || (state.engine === "bionic" ? state.bionicModel : state.ollamaModel) || "local-llm",
        reasoning: msg.reasoning || "",
        content: String(msg.content ?? ""),
        contextBadge: msg.contextBadge || "",
        streaming: false,
        error: msg.error || "",
      });
      render();
    },
    getMessages() {
      return state.messages;
    },
  };
  root._aiChatController = controller;
  return controller;
}
