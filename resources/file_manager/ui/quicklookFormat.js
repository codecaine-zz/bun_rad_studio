// Formatted previews for Quick Look and the Details panel: spreadsheets, documents, presentations, PDFs,
// SQLite databases, archives, fonts, structured data (JSON/YAML/TOML/INI/ENV/XML/Plist/bplist), Jupyter notebooks,
// subtitles, playlists, calendars, contacts, certificates, 3D models, diffs, logs, source code, and binary hex/strings.
import { rawUrl } from "./api.js";
import { detectLanguage, languageInfo } from "./codeLang.js";
import { extractSymbols, tokenizeText } from "./codeLogic.js";
import { renderMarkdown } from "./codePreview.js";
import { copyToClipboard, flashCopied } from "./copyclip.js";
import { openInSqliteStudio } from "./dbFiles.js";
import { h, iconFor } from "./dom.js";
import { toast } from "./menus.js";
import { openPower } from "./power.js";
import { emit } from "./state.js";
import {
  extensionOf,
  formatDate,
  formatSize,
  isExtractableEntry,
} from "./util.js";

let cachedQuickLookSelection = "";
const QL_PROGRESS_STORAGE_KEY = "fm.ql.progress.v1";

export function setCachedQuickLookSelection(text) {
  cachedQuickLookSelection = String(text ?? "");
}

const qlMemoryProgressFallback = new Map();

function readProgressMap() {
  try {
    const ls =
      typeof localStorage !== "undefined"
        ? localStorage
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : null;
    if (ls) {
      const raw = ls.getItem(QL_PROGRESS_STORAGE_KEY);
      if (raw) return JSON.parse(raw) || {};
    }
  } catch {}
  return Object.fromEntries(qlMemoryProgressFallback.entries());
}

function writeProgressMap(map) {
  qlMemoryProgressFallback.clear();
  for (const [k, v] of Object.entries(map || {})) {
    qlMemoryProgressFallback.set(k, v);
  }
  try {
    const ls =
      typeof localStorage !== "undefined"
        ? localStorage
        : typeof window !== "undefined" && window.localStorage
          ? window.localStorage
          : null;
    if (ls) {
      ls.setItem(QL_PROGRESS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

export function loadQuickLookReadingProgress(filePath) {
  if (!filePath) return null;
  try {
    const map = readProgressMap();
    const entry = map?.[filePath];
    if (!entry || typeof entry !== "object") return null;
    return {
      chapterIdx: typeof entry.chapterIdx === "number" ? entry.chapterIdx : -1,
      scrollTop: typeof entry.scrollTop === "number" ? entry.scrollTop : 0,
      scrollRatio:
        typeof entry.scrollRatio === "number" ? entry.scrollRatio : 0,
      updatedAt: Number(entry.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function saveQuickLookReadingProgress(
  filePath,
  { chapterIdx = -1, scrollTop = 0, scrollRatio = 0 } = {},
) {
  if (!filePath) return;
  try {
    const map = readProgressMap();
    map[filePath] = {
      chapterIdx: Number.isFinite(chapterIdx) ? chapterIdx : -1,
      scrollTop: Math.max(0, Math.round(Number(scrollTop) || 0)),
      scrollRatio: Number.isFinite(scrollRatio)
        ? Math.max(0, Math.min(1, Number(scrollRatio)))
        : 0,
      updatedAt: Date.now(),
    };
    const keys = Object.keys(map);
    if (keys.length > 150) {
      keys
        .sort((a, b) => (map[a]?.updatedAt || 0) - (map[b]?.updatedAt || 0))
        .slice(0, keys.length - 150)
        .forEach((k) => delete map[k]);
    }
    writeProgressMap(map);
  } catch {}
}

export function clearQuickLookHighlights() {
  if (typeof globalThis.CSS !== "undefined" && globalThis.CSS?.highlights) {
    try {
      globalThis.CSS.highlights.delete("ql-search");
      globalThis.CSS.highlights.delete("ql-search-active");
    } catch {}
  }
  if (typeof document !== "undefined") {
    for (const el of document.querySelectorAll("[data-ql-match-active]")) {
      delete el.dataset.qlMatchActive;
    }
  }
}

export function ensureQuickLookFindBar(hostEl) {
  const host =
    hostEl ||
    (typeof document !== "undefined"
      ? document.querySelector(".ql-body")
      : null);
  if (!host) return null;
  let bar = host.querySelector(".ql-find-bar");
  if (bar) return bar;

  let matches = [];
  let activeIdx = -1;

  const input = h("input", {
    type: "search",
    class: "ql-fmt-search ql-find-input",
    placeholder: "Find in preview… (Enter next, Shift+Enter prev)",
    "aria-label": "Find in preview",
  });
  const countEl = h(
    "span",
    { class: "ql-fmt-count ql-find-count", "aria-live": "polite" },
    "Type to find",
  );

  const collectRanges = (query) => {
    clearQuickLookHighlights();
    const q = String(query ?? "")
      .trim()
      .toLowerCase();
    if (
      !q ||
      typeof document === "undefined" ||
      typeof document.createTreeWalker !== "function"
    )
      return [];
    const NF = (typeof NodeFilter !== "undefined"
      ? NodeFilter
      : typeof window !== "undefined" && window.NodeFilter) || {
      SHOW_TEXT: 4,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
    };
    const found = [];
    const walker = document.createTreeWalker(host, NF.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NF.FILTER_REJECT;
        if (
          parent.closest(
            ".ql-fmt-head, .ql-find-bar, .code-md-toolbar, [data-copy-ui], [hidden], script, style",
          )
        ) {
          return NF.FILTER_REJECT;
        }
        return node.nodeValue && node.nodeValue.trim()
          ? NF.FILTER_ACCEPT
          : NF.FILTER_SKIP;
      },
    });
    let textNode = walker.nextNode();
    while (textNode) {
      const val = (textNode.nodeValue || "").toLowerCase();
      let startPos = 0;
      const doc = textNode.ownerDocument || document;
      while (startPos <= val.length - q.length) {
        const idx = val.indexOf(q, startPos);
        if (idx === -1) break;
        if (
          typeof doc.createRange === "function" ||
          typeof Range !== "undefined"
        ) {
          const range =
            typeof doc.createRange === "function"
              ? doc.createRange()
              : new Range();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + q.length);
          found.push(range);
        }
        startPos = idx + q.length;
        if (found.length >= 1000) break;
      }
      if (found.length >= 1000) break;
      textNode = walker.nextNode();
    }
    return found;
  };

  const applyHighlights = (scrollToActive = true) => {
    clearQuickLookHighlights();
    if (!matches.length) {
      countEl.textContent = input.value.trim() ? "No matches" : "Type to find";
      return;
    }
    if (activeIdx < 0 || activeIdx >= matches.length) activeIdx = 0;
    countEl.textContent = `${activeIdx + 1} of ${matches.length}`;

    if (
      typeof globalThis.CSS !== "undefined" &&
      globalThis.CSS?.highlights &&
      typeof globalThis.Highlight === "function"
    ) {
      try {
        const allHighlight = new globalThis.Highlight(...matches);
        globalThis.CSS.highlights.set("ql-search", allHighlight);
        const activeRange = matches[activeIdx];
        if (activeRange) {
          const activeHighlight = new globalThis.Highlight(activeRange);
          activeHighlight.priority = 1;
          globalThis.CSS.highlights.set("ql-search-active", activeHighlight);
        }
      } catch {}
    }

    const activeRange = matches[activeIdx];
    const targetEl = activeRange?.startContainer?.parentElement;
    if (targetEl) {
      targetEl.dataset.qlMatchActive = "true";
      if (scrollToActive && typeof targetEl.scrollIntoView === "function") {
        targetEl.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  };

  const runSearch = () => {
    matches = collectRanges(input.value);
    activeIdx = matches.length ? 0 : -1;
    applyHighlights(true);
  };

  const stepMatch = (delta) => {
    if (!matches.length) {
      runSearch();
      return;
    }
    activeIdx = (activeIdx + delta + matches.length) % matches.length;
    applyHighlights(true);
  };

  input.addEventListener("input", runSearch);
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      stepMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      bar.hidden = true;
      clearQuickLookHighlights();
    }
  });

  const prevBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-find-prev",
      title: "Previous match (Shift+Enter)",
      onclick: () => stepMatch(-1),
    },
    "↑ Prev",
  );
  const nextBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-find-next",
      title: "Next match (Enter)",
      onclick: () => stepMatch(1),
    },
    "↓ Next",
  );
  const closeBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-find-close",
      title: "Close Find bar (Esc)",
      onclick: () => {
        bar.hidden = true;
        clearQuickLookHighlights();
      },
    },
    "✕",
  );

  bar = h(
    "div",
    {
      class: "ql-find-bar",
      "data-copy-ui": "",
      hidden: true,
      role: "search",
      "aria-label": "Find in preview",
    },
    h("span", { class: "ql-fmt-badge" }, "🔍 Find"),
    input,
    countEl,
    prevBtn,
    nextBtn,
    closeBtn,
  );
  bar._focusInput = (seedText = "") => {
    bar.hidden = false;
    if (seedText && !input.value) {
      input.value = seedText;
    }
    if (input.value) runSearch();
    input.focus();
    input.select?.();
  };
  bar._refreshSearch = () => {
    if (!bar.hidden && input.value) runSearch();
  };

  const head = host.querySelector(".ql-fmt-head, .code-md-toolbar");
  if (head && head.parentElement) {
    head.insertAdjacentElement("afterend", bar);
  } else {
    host.prepend(bar);
  }
  return bar;
}

export function toggleQuickLookFindBar(hostEl, seedText = "") {
  const host =
    hostEl ||
    (typeof document !== "undefined"
      ? document.querySelector(".ql-body")
      : null);
  const bar = ensureQuickLookFindBar(host);
  if (!bar) return false;
  if (!bar.hidden && !seedText) {
    const inp = bar.querySelector(".ql-find-input");
    if (typeof document !== "undefined" && document.activeElement !== inp) {
      bar._focusInput?.();
      return true;
    }
    bar.hidden = true;
    clearQuickLookHighlights();
    return false;
  }
  bar._focusInput?.(seedText);
  return true;
}

export function getSelectedTextInQuickLook(rootEl = null) {
  if (
    typeof window === "undefined" ||
    typeof window.getSelection !== "function"
  )
    return "";
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return "";
  const text = sel.toString();
  if (!text || !text.trim()) return "";
  const scope =
    rootEl ||
    (typeof document !== "undefined"
      ? document.querySelector(".ql-body, .ql")
      : null);
  if (scope) {
    const a = sel.anchorNode;
    const f = sel.focusNode;
    if (a && !scope.contains(a) && f && !scope.contains(f)) return "";
  }
  return text;
}

function tableElementToTsv(table) {
  if (!table) return "";
  return [...table.querySelectorAll("tr")]
    .map((tr) =>
      [...tr.querySelectorAll("th, td")]
        .map((c) => (c.textContent || "").trim())
        .join("\t"),
    )
    .filter(Boolean)
    .join("\n");
}

function blocksToPlainText(blocks = []) {
  return blocks
    .map((b) =>
      b.type === "table" && Array.isArray(b.rows)
        ? b.rows.map((r) => r.join("\t")).join("\n")
        : b.text || "",
    )
    .filter(Boolean)
    .join("\n\n");
}

export function extractQuickLookPreviewText(entry, preview, rootEl = null) {
  const scope =
    rootEl ||
    (typeof document !== "undefined"
      ? document.querySelector(".ql-body")
      : null);
  const rich = preview?.rich;
  if (rich) {
    switch (rich.kind) {
      case "document": {
        const chapSelect = scope?.querySelector?.(".ql-fmt-select");
        const chapIdx = chapSelect ? Number(chapSelect.value) : -1;
        if (chapIdx >= 0 && rich.chapters?.[chapIdx]) {
          const ch = rich.chapters[chapIdx];
          return [ch.title || "", blocksToPlainText(ch.blocks || [])]
            .filter(Boolean)
            .join("\n\n");
        }
        return (
          rich.plainText ||
          blocksToPlainText(rich.blocks || []) ||
          (preview?.type === "text" ? preview.text : "") ||
          ""
        );
      }
      case "pdf":
        return rich.extractedText || "";
      case "presentation":
        return (rich.slides || [])
          .map((s) =>
            [
              `Slide ${s.number}: ${s.title || ""}`.trim(),
              ...(s.bullets || []).map((b) => `- ${b}`),
              s.notes ? `Speaker notes: ${s.notes}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n");
      case "spreadsheet": {
        const domTable = scope?.querySelector?.(".ql-fmt-table");
        const domTsv = tableElementToTsv(domTable);
        if (domTsv) return domTsv;
        const s = rich.sheets?.[0];
        if (!s) return "";
        return [
          s.headers.join("\t"),
          ...(s.rows || []).map((r) => r.join("\t")),
        ]
          .filter(Boolean)
          .join("\n");
      }
      case "sqlite": {
        const sqlPre = scope?.querySelector?.(".ql-rich-pre");
        const domTable = scope?.querySelector?.(".ql-fmt-table");
        const domTsv = tableElementToTsv(domTable);
        if (domTsv || sqlPre?.textContent) {
          return [domTsv, sqlPre?.textContent || ""]
            .filter(Boolean)
            .join("\n\n");
        }
        const t = rich.tables?.[0];
        if (!t) return "";
        const headers = (t.columns || []).map((c) => c.name).join("\t");
        return [headers, ...(t.rows || []).map((r) => r.join("\t"))]
          .filter(Boolean)
          .join("\n");
      }
      case "structured": {
        const prettyEl = scope?.querySelector?.(
          ".ql-pretty-json-pre:not([hidden])",
        );
        if (prettyEl) {
          return rich.data !== undefined
            ? JSON.stringify(rich.data, null, 2)
            : prettyEl.textContent || "";
        }
        return (
          (preview?.type === "text" && preview.text) ||
          rich.formattedText ||
          (rich.data !== undefined ? JSON.stringify(rich.data, null, 2) : "")
        );
      }
      case "notebook":
        return (rich.cells || [])
          .map((c) =>
            [c.source || "", ...(c.outputs || []).map((o) => o.text || "")]
              .filter(Boolean)
              .join("\n"),
          )
          .filter(Boolean)
          .join("\n\n");
      case "subtitles":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.cues || [])
            .map(
              (c) =>
                `${c.start}${c.end ? ` --> ${c.end}` : ""} ${c.speaker ? `[${c.speaker}] ` : ""}${c.text}`,
            )
            .join("\n")
        );
      case "playlist":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.tracks || [])
            .map(
              (t) =>
                `${t.index}. ${t.title}${t.duration ? ` (${t.duration})` : ""} — ${t.path}`,
            )
            .join("\n")
        );
      case "calendar":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.events || [])
            .map((ev) =>
              [
                ev.summary,
                `Starts: ${ev.start || "—"}`,
                ev.end ? `Ends: ${ev.end}` : "",
                ev.location ? `Location: ${ev.location}` : "",
                ev.description || "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n")
        );
      case "contact":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.contacts || [])
            .map((c) =>
              [
                c.fullName,
                [c.title, c.org].filter(Boolean).join(" · "),
                ...(c.phones || []),
                ...(c.emails || []),
                ...(c.addresses || []),
                c.url || "",
                c.note || "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n")
        );
      case "certificate":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.blocks || [])
            .map((b) =>
              [
                b.label,
                `SHA-256: ${b.sha256}`,
                `SHA-1: ${b.sha1}`,
                ...(b.details || []).map(([k, v]) => `${k}: ${v}`),
              ].join("\n"),
            )
            .join("\n\n")
        );
      case "model3d":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.meta || []).map(([k, v]) => `${k}: ${v}`).join("\n")
        );
      case "diff":
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.files || [])
            .map((f) =>
              [
                f.newFile || f.oldFile,
                ...(f.hunks || []).flatMap((hk) => [
                  hk.header,
                  ...(hk.lines || []).map((l) => `${l.type}${l.text}`),
                ]),
              ].join("\n"),
            )
            .join("\n\n")
        );
      case "log": {
        const logList = scope?.querySelector?.(".ql-log-list");
        if (logList && !logList.closest("[hidden]")) {
          const lines = [...logList.querySelectorAll(".ql-log-line")].map(
            (row) => {
              const lvl = row.querySelector(".ql-log-badge")?.textContent || "";
              const msg = row.querySelector(".ql-log-msg")?.textContent || "";
              return `[${lvl}] ${msg}`.trim();
            },
          );
          if (lines.length) return lines.join("\n");
        }
        return (
          (preview?.type === "text" && preview.text) ||
          (rich.entries || []).map((e) => `[${e.level}] ${e.text}`).join("\n")
        );
      }
      case "archive":
        return (
          rich.innerText || (rich.entries || []).map((e) => e.name).join("\n")
        );
      case "binary": {
        const visiblePre = scope?.querySelector?.(
          "pre.ql-hex-dump:not([hidden])",
        );
        if (visiblePre?.textContent) return visiblePre.textContent;
        return (rich.hexLines || []).join("\n");
      }
    }
  }
  if (
    preview?.type === "text" &&
    typeof preview.text === "string" &&
    preview.text
  ) {
    return preview.text;
  }
  const mdDom = scope?.querySelector?.(
    ".code-md-content:not([hidden]), pre.ql-text:not([hidden]), pre.code-md-plain:not([hidden])",
  );
  if (mdDom?.textContent) return mdDom.textContent;
  return "";
}

export function buildQuickLookCopyButtons(
  entry,
  preview,
  getContainer = null,
  helpers = {},
) {
  const findBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-find-btn",
      "data-copy-ui": "",
      title: "Find text in this preview (⌘F / Ctrl+F)",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        const host =
          getContainer?.() ?? findBtn.closest(".ql-body, .ql-fmt-wrap, .ql");
        const selText =
          getSelectedTextInQuickLook(host) || cachedQuickLookSelection;
        toggleQuickLookFindBar(
          host,
          selText && selText.length <= 80 ? selText.trim() : "",
        );
      },
    },
    "🔍 Find",
  );

  const askAiBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-ask-ai-btn",
      "data-copy-ui": "",
      title:
        "Send selected passage (or document context) to LM Studio Bionic AI",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        const host =
          getContainer?.() ?? askAiBtn.closest(".ql-body, .ql-fmt-wrap, .ql");
        const selText = (
          getSelectedTextInQuickLook(host) ||
          cachedQuickLookSelection ||
          ""
        ).trim();
        const prompt = selText
          ? `Analyze and explain this selected passage from "${entry?.name || "document"}":\n\n> ${selText.slice(0, 2400)}`
          : `Summarize and highlight the key takeaways of "${entry?.name || "this file"}".`;
        helpers.onClose?.();
        openPower("bionic", {
          subTab: "assistant",
          paths: entry?.path ? [entry.path] : [],
          prompt,
        });
      },
    },
    "🤖 Ask AI",
  );

  const speakSelBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-speak-sel-btn",
      "data-copy-ui": "",
      title:
        "Read selected passage (or full document) aloud in Phonon Voice Reader",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        const host =
          getContainer?.() ??
          speakSelBtn.closest(".ql-body, .ql-fmt-wrap, .ql");
        const selText = (
          getSelectedTextInQuickLook(host) ||
          cachedQuickLookSelection ||
          ""
        ).trim();
        helpers.onClose?.();
        if (selText) {
          openPower("phonon", {
            text: selText,
            path: entry?.path,
            autoPlay: true,
          });
        } else if (entry?.path) {
          openPower("phonon", { path: entry.path, autoPlay: true });
        } else {
          const allText = extractQuickLookPreviewText(entry, preview, host);
          openPower("phonon", { text: allText, autoPlay: true });
        }
      },
    },
    "🗣️ Speak",
  );

  const copyAllBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-copy-all-btn",
      "data-copy-ui": "",
      title: "Copy all text in this preview to the clipboard",
      onmousedown: (e) => e.preventDefault(),
      onclick: async () => {
        const host =
          getContainer?.() ?? copyAllBtn.closest(".ql-body, .ql-fmt-wrap, .ql");
        const text = extractQuickLookPreviewText(entry, preview, host);
        if (!text) {
          toast("There is no text in this preview to copy.", { kind: "info" });
          return;
        }
        if (
          await copyToClipboard(text, {
            what: `all preview text from ${entry?.name || "preview"}`,
          })
        ) {
          flashCopied(copyAllBtn, "Copied All ✓");
        }
      },
    },
    "📋 Copy All Text",
  );

  const copySelBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small ql-copy-sel-btn",
      "data-copy-ui": "",
      title:
        "Copy the highlighted/selected text in this preview to the clipboard",
      onmousedown: (e) => e.preventDefault(),
      onclick: async () => {
        const host =
          getContainer?.() ?? copySelBtn.closest(".ql-body, .ql-fmt-wrap, .ql");
        const selText =
          getSelectedTextInQuickLook(host) || cachedQuickLookSelection;
        if (selText) {
          if (
            await copyToClipboard(selText, {
              what: `selected text (${selText.length.toLocaleString("en-US")} chars)`,
            })
          ) {
            flashCopied(copySelBtn, "Copied Selection ✓");
          }
          return;
        }
        toast(
          "Select some text in the preview first, or click Copy All Text.",
          { kind: "info" },
        );
      },
    },
    "✂️ Copy Selected",
  );

  let wrapped = helpers.initialWrapped !== false;
  const wrapBtn =
    helpers.hasPre === false
      ? null
      : h(
          "button",
          {
            type: "button",
            class: `code-btn code-small ql-wrap-btn${wrapped ? " active" : ""}`,
            "aria-pressed": String(wrapped),
            "data-copy-ui": "",
            title: "Toggle soft line wrapping in this preview",
            onmousedown: (e) => e.preventDefault(),
            onclick: () => {
              wrapped = !wrapped;
              wrapBtn.classList.toggle("active", wrapped);
              wrapBtn.setAttribute("aria-pressed", String(wrapped));
              const host =
                getContainer?.() ??
                wrapBtn.closest(".ql-body, .ql-fmt-wrap, .ql");
              for (const pre of host?.querySelectorAll?.("pre") || []) {
                pre.classList.toggle("ql-nowrap", !wrapped);
                if (pre.classList.contains("ql-hex-dump")) {
                  pre.classList.toggle("ql-wrap-on", wrapped);
                }
              }
            },
          },
          "↩ Wrap",
        );

  return h(
    "span",
    {
      class: "ql-copy-group",
      role: "group",
      "aria-label": "Preview text actions",
      "data-copy-ui": "",
    },
    wrapBtn,
    findBtn,
    askAiBtn,
    speakSelBtn,
    copyAllBtn,
    copySelBtn,
  );
}

function metaChips(meta = []) {
  const valid = meta.filter(
    ([k, v]) => k && v && !/\b(?:null|undefined)\b/i.test(String(v)),
  );
  if (!valid.length) return null;
  return h(
    "div",
    { class: "ql-fmt-chips" },
    ...valid
      .slice(0, 8)
      .map(([k, v]) =>
        h(
          "span",
          { class: "ql-fmt-chip", title: `${k}: ${v}` },
          h("strong", {}, `${k}: `),
          String(v),
        ),
      ),
  );
}

function buildDataTree(key, value, depth, filterText) {
  const labelKey =
    key !== null
      ? h("span", { class: "code-t-property" }, `${String(key)}: `)
      : null;
  if (value === null || value === undefined || typeof value !== "object") {
    const type =
      value === null || value === undefined
        ? "constant"
        : typeof value === "string"
          ? "string"
          : typeof value === "number"
            ? "number"
            : "keyword";
    const text =
      value === null || value === undefined
        ? "—"
        : typeof value === "string"
          ? JSON.stringify(value)
          : String(value);
    if (
      filterText &&
      !`${key ?? ""} ${text}`.toLowerCase().includes(filterText)
    )
      return null;
    return h(
      "div",
      { class: "code-json-leaf" },
      labelKey,
      h("span", { class: `code-t-${type}` }, text),
    );
  }
  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  const summary = isArr
    ? `Array(${entries.length})`
    : `{${entries.length} ${entries.length === 1 ? "key" : "keys"}}`;
  if (depth > 7)
    return h(
      "div",
      { class: "code-json-leaf" },
      labelKey,
      h("span", { class: "code-hint" }, summary),
    );
  const children = [];
  for (const [k, v] of entries.slice(0, 250)) {
    const child = buildDataTree(k, v, depth + 1, filterText);
    if (child) children.push(child);
  }
  if (
    filterText &&
    !children.length &&
    !String(key ?? "")
      .toLowerCase()
      .includes(filterText)
  )
    return null;
  if (entries.length > 250)
    children.push(
      h("div", { class: "code-hint" }, `… ${entries.length - 250} more items`),
    );
  return h(
    "details",
    { class: "code-json-branch", open: depth < 2 || Boolean(filterText) },
    h(
      "summary",
      { class: "code-json-sum" },
      labelKey,
      h("span", { class: "code-badge code-badge-quiet" }, summary),
    ),
    h("div", { class: "code-json-children" }, children),
  );
}

function buildInteractiveGrid(
  headers,
  rows,
  { maxRows = 200, filterPlaceholder = "Filter rows…" } = {},
) {
  let sortCol = -1;
  let sortDesc = false;
  let colCount = headers.length;
  for (let i = 0; i < rows.length; i++) {
    const rowLen = rows[i]?.length ?? 0;
    if (rowLen > colCount) colCount = rowLen;
  }
  const filter = h("input", {
    type: "search",
    class: "ql-fmt-search",
    placeholder: filterPlaceholder,
    "aria-label": filterPlaceholder,
  });
  const countLabel = h("span", { class: "ql-fmt-count" });
  const host = h("div", { class: "ql-fmt-grid-scroll" });

  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          r.some((c) =>
            String(c ?? "")
              .toLowerCase()
              .includes(q),
          ),
        )
      : [...rows];
    if (sortCol >= 0) {
      filtered.sort((a, b) => {
        const va = String(a[sortCol] ?? "").trim();
        const vb = String(b[sortCol] ?? "").trim();
        const na = Number(va);
        const nb = Number(vb);
        const cmp =
          !Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== ""
            ? na - nb
            : va.localeCompare(vb);
        return sortDesc ? -cmp : cmp;
      });
    }
    countLabel.textContent = `${filtered.length.toLocaleString("en-US")} ${filtered.length === 1 ? "row" : "rows"} · ${colCount} ${colCount === 1 ? "column" : "columns"}`;
    const ths = Array.from({ length: colCount }, (_, c) => {
      const label = headers[c] || `Col ${c + 1}`;
      const arrow = sortCol === c ? (sortDesc ? " ↓" : " ↑") : "";
      return h(
        "th",
        {
          scope: "col",
          class: "ql-fmt-th-sort",
          title: `Click to sort by ${label}`,
          onclick: () => {
            if (sortCol === c) sortDesc = !sortDesc;
            else {
              sortCol = c;
              sortDesc = false;
            }
            draw();
          },
        },
        `${label}${arrow}`,
      );
    });
    const trs = filtered
      .slice(0, maxRows)
      .map((r) =>
        h(
          "tr",
          {},
          ...Array.from({ length: colCount }, (_, c) =>
            h("td", {}, String(r[c] ?? "")),
          ),
        ),
      );
    host.replaceChildren(
      h(
        "table",
        { class: "ql-fmt-table" },
        h("thead", {}, h("tr", {}, ...ths)),
        h("tbody", {}, ...trs),
      ),
    );
  };
  filter.addEventListener("input", draw);
  draw();
  return h(
    "div",
    { class: "ql-fmt-grid" },
    h("div", { class: "ql-fmt-bar" }, filter, countLabel),
    host,
  );
}

function renderDocBlocks(blocks = []) {
  const out = [];
  let listItems = [];
  const flushList = () => {
    if (!listItems.length) return;
    out.push(
      h(
        "ul",
        { class: "ql-doc-list" },
        ...listItems.map((t) => h("li", {}, t)),
      ),
    );
    listItems = [];
  };
  for (const b of blocks) {
    if (b.type === "li") {
      listItems.push(b.text);
      continue;
    }
    flushList();
    if (b.type === "h1") out.push(h("h1", { class: "ql-doc-h1" }, b.text));
    else if (b.type === "h2") out.push(h("h2", { class: "ql-doc-h2" }, b.text));
    else if (b.type === "h3") out.push(h("h3", { class: "ql-doc-h3" }, b.text));
    else if (b.type === "quote")
      out.push(h("blockquote", { class: "ql-doc-quote" }, b.text));
    else if (b.type === "code")
      out.push(h("pre", { class: "ql-doc-code" }, b.text));
    else if (b.type === "table" && Array.isArray(b.rows) && b.rows.length) {
      const width = Math.max(...b.rows.map((r) => r.length), 1);
      const head = b.rows[0] ?? [];
      const body = b.rows.slice(1);
      out.push(
        h(
          "div",
          { class: "ql-doc-table-wrap" },
          h(
            "table",
            { class: "ql-fmt-table" },
            h(
              "thead",
              {},
              h(
                "tr",
                {},
                ...Array.from({ length: width }, (_, i) =>
                  h("th", {}, head[i] ?? ""),
                ),
              ),
            ),
            h(
              "tbody",
              {},
              ...body.map((r) =>
                h(
                  "tr",
                  {},
                  ...Array.from({ length: width }, (_, i) =>
                    h("td", {}, r[i] ?? ""),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    } else if (b.text) {
      out.push(h("p", { class: "ql-doc-p" }, b.text));
    }
  }
  flushList();
  return out.length
    ? out
    : [
        h(
          "p",
          { class: "ql-note" },
          "No readable text blocks found in this document.",
        ),
      ];
}

function renderColouredCodeLines(text, langId) {
  const lines = tokenizeText(
    langId,
    text.length > 500_000 ? text.slice(0, 500_000) : text,
  );
  const pre = h("pre", {
    class: "ql-text ql-code-pre",
    tabindex: "0",
    "aria-label": "Source code preview",
  });
  const max = Math.min(lines.length, 3000);
  for (let i = 0; i < max; i++) {
    const tokens = lines[i];
    const lineSpan = h("span", {
      class: "ql-code-line",
      dataset: { ln: String(i + 1) },
    });
    for (const t of tokens) {
      lineSpan.append(
        t.type
          ? h("span", { class: `code-t-${t.type}` }, t.text)
          : document.createTextNode(t.text),
      );
    }
    if (i < max - 1 || text.endsWith("\n"))
      lineSpan.append(document.createTextNode("\n"));
    pre.append(lineSpan);
  }
  if (lines.length > max) {
    pre.append(
      h(
        "span",
        { class: "ql-code-line code-hint" },
        `\n… Showing first ${max.toLocaleString("en-US")} of ${lines.length.toLocaleString("en-US")} lines — open in Code Editor to view all.`,
      ),
    );
  }
  return pre;
}

function buildModeSwitcher(modes, initialId, onSelect) {
  let active = initialId;
  const btns = modes.map(({ id, label, title }) =>
    h(
      "button",
      {
        type: "button",
        class: `code-btn code-small ql-mode-btn${id === active ? " active" : ""}`,
        "aria-pressed": String(id === active),
        title: title || label,
        onclick: (ev) => {
          active = id;
          for (const b of btns) {
            const on = b.dataset.modeId === active;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
          }
          onSelect(active);
          const root = ev.currentTarget?.closest?.(
            ".ql-body, .ql-fmt-wrap, .ql",
          );
          root?.querySelector?.(".ql-find-bar")?._refreshSearch?.();
          const wrapBtn = root?.querySelector?.(".ql-wrap-btn");
          if (wrapBtn) {
            const anyVisiblePre = [
              ...(root?.querySelectorAll?.("pre") || []),
            ].some((p) => !p.hidden && !p.closest("[hidden]"));
            wrapBtn.hidden = !anyVisiblePre;
          }
        },
        dataset: { modeId: id },
      },
      label,
    ),
  );
  return h(
    "span",
    { class: "ql-mode-group", role: "group", "aria-label": "Preview mode" },
    ...btns,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Individual Rich Format Renderers for Quick Look
// ---------------------------------------------------------------------------------------------------------------

function renderSpreadsheetQuickLook(entry, rich) {
  const sheets = rich.sheets || [];
  let activeIdx = 0;
  const stage = h("div", { class: "ql-fmt-stage" });
  const tabBtns = sheets.map((s, idx) =>
    h(
      "button",
      {
        type: "button",
        class: `code-btn code-small ql-sheet-tab${idx === 0 ? " active" : ""}`,
        "aria-pressed": String(idx === 0),
        title: `Show sheet "${s.name}" (${s.totalRows} rows)`,
        onclick: () => {
          activeIdx = idx;
          tabBtns.forEach((b, i) => {
            b.classList.toggle("active", i === activeIdx);
            b.setAttribute("aria-pressed", String(i === activeIdx));
          });
          drawSheet();
        },
      },
      `${s.name} (${s.totalRows})`,
    ),
  );

  const drawSheet = () => {
    const s = sheets[activeIdx];
    if (!s || (!s.headers.length && !s.rows.length)) {
      stage.replaceChildren(
        h("p", { class: "ql-note" }, "This sheet is empty."),
      );
      return;
    }
    stage.replaceChildren(
      buildInteractiveGrid(s.headers, s.rows, {
        filterPlaceholder: `Filter ${s.name}…`,
      }),
    );
  };
  drawSheet();

  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      sheets.length > 1
        ? h(
            "div",
            {
              class: "ql-sheet-tabs",
              role: "tablist",
              "aria-label": "Workbook sheets",
            },
            ...tabBtns,
          )
        : null,
      metaChips(rich.meta),
    ),
    stage,
  );
}

function renderDocumentQuickLook(entry, preview, rich, helpers = {}) {
  const isTextType = preview.type === "text";
  const plainPre = h(
    "pre",
    {
      class: isTextType ? "ql-text" : "ql-rich-pre",
      tabindex: "0",
      "aria-label": `Contents of ${entry.name}`,
      hidden: true,
    },
    (isTextType ? preview.text : rich.plainText) || "(An empty document.)",
  );
  const readerHost = h("div", { class: "ql-doc-reader" });
  const thumbHost = rich.hasThumb
    ? h(
        "div",
        { class: "ql-doc", hidden: true },
        h("img", {
          class: "ql-image",
          src: `${rawUrl(entry.path)}&thumb=1`,
          alt: `First page of ${entry.name}`,
        }),
      )
    : null;

  let chapterIdx = -1;
  const chapters = rich.chapters || [];
  const savedProgress = entry?.path
    ? loadQuickLookReadingProgress(entry.path)
    : null;
  if (
    savedProgress &&
    typeof savedProgress.chapterIdx === "number" &&
    savedProgress.chapterIdx >= -1 &&
    savedProgress.chapterIdx < chapters.length
  ) {
    chapterIdx = savedProgress.chapterIdx;
  }

  let chapterSelect = null;
  const drawReader = () => {
    const blocks =
      chapterIdx >= 0 && chapters[chapterIdx]
        ? chapters[chapterIdx].blocks
        : rich.blocks;
    readerHost.replaceChildren(
      ...(rich.title ? [h("h1", { class: "ql-doc-title" }, rich.title)] : []),
      ...(rich.author
        ? [h("p", { class: "ql-doc-author" }, `By ${rich.author}`)]
        : []),
      ...renderDocBlocks(blocks),
    );
  };
  if (chapters.length > 1) {
    chapterSelect = h(
      "select",
      {
        class: "ql-fmt-select",
        "aria-label": "Select chapter",
        onchange: () => {
          chapterIdx = Number(chapterSelect.value);
          drawReader();
          readerHost.scrollTop = 0;
          if (entry?.path) {
            saveQuickLookReadingProgress(entry.path, {
              chapterIdx,
              scrollTop: 0,
            });
          }
        },
      },
      h("option", { value: "-1" }, `All chapters (${chapters.length})`),
      ...chapters.map((c, i) =>
        h("option", { value: String(i) }, `${i + 1}. ${c.title}`),
      ),
    );
    chapterSelect.value = String(chapterIdx);
  }
  drawReader();

  let resumeChip = null;
  if (
    savedProgress &&
    (savedProgress.chapterIdx >= 0 || savedProgress.scrollTop > 40)
  ) {
    const chapLabel =
      savedProgress.chapterIdx >= 0 && chapters[savedProgress.chapterIdx]
        ? `Ch. ${savedProgress.chapterIdx + 1}`
        : "Saved spot";
    resumeChip = h(
      "button",
      {
        type: "button",
        class: "code-btn code-small ql-resume-chip",
        title:
          "Resumed from your last reading position — click to reset to the beginning",
        onclick: () => {
          chapterIdx = -1;
          if (chapterSelect) chapterSelect.value = "-1";
          drawReader();
          readerHost.scrollTop = 0;
          if (entry?.path)
            saveQuickLookReadingProgress(entry.path, {
              chapterIdx: -1,
              scrollTop: 0,
            });
          resumeChip.remove();
        },
      },
      `🔖 Resumed (${chapLabel})`,
    );
    if (savedProgress.scrollTop > 0) {
      queueMicrotask(() => {
        readerHost.scrollTop = savedProgress.scrollTop;
      });
    }
  }

  if (entry?.path) {
    readerHost.addEventListener(
      "scroll",
      () => {
        saveQuickLookReadingProgress(entry.path, {
          chapterIdx,
          scrollTop: readerHost.scrollTop,
        });
      },
      { passive: true },
    );
  }

  const modes = [
    {
      id: "formatted",
      label: "Formatted",
      title: "Show formatted document headings, paragraphs, and tables",
    },
    {
      id: "plain",
      label: "Plain text",
      title: "Show raw/extracted plain text",
    },
    ...(thumbHost
      ? [
          {
            id: "thumb",
            label: "Page image",
            title: "Show the first page image from Quick Look",
          },
        ]
      : []),
  ];
  const switcher = buildModeSwitcher(modes, "formatted", (mode) => {
    readerHost.hidden = mode !== "formatted";
    plainPre.hidden = mode !== "plain";
    if (thumbHost) thumbHost.hidden = mode !== "thumb";
  });

  const voiceReaderBtn = entry?.path
    ? h(
        "button",
        {
          type: "button",
          class: "code-btn code-small",
          title:
            "Open this book or document in the Phonon Voice Reader to listen out loud or export audio/video",
          onclick: () => {
            helpers.onClose?.();
            openPower("phonon", { path: entry.path, autoPlay: false });
          },
        },
        "🗣️ Read in Voice Reader",
      )
    : null;

  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      chapterSelect,
      resumeChip,
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      voiceReaderBtn,
      switcher,
    ),
    readerHost,
    plainPre,
    thumbHost,
  );
}

function renderPresentationQuickLook(entry, rich) {
  const slides = rich.slides || [];
  let cur = 0;
  let showAll = slides.length <= 1;
  const stage = h("div", { class: "ql-slide-stage" });
  const counter = h("span", { class: "ql-fmt-count" });

  const renderSlideCard = (s) =>
    h(
      "article",
      { class: "ql-slide-card" },
      h("div", { class: "ql-slide-num" }, `Slide ${s.number}`),
      h("h2", { class: "ql-slide-title" }, s.title || `Slide ${s.number}`),
      s.bullets?.length
        ? h(
            "ul",
            { class: "ql-slide-bullets" },
            ...s.bullets.map((b) => h("li", {}, b)),
          )
        : h("p", { class: "ql-note" }, "(Visual slide without text bullets)"),
      s.notes
        ? h(
            "div",
            { class: "ql-slide-notes" },
            h("strong", {}, "Speaker notes: "),
            s.notes,
          )
        : null,
    );

  const draw = () => {
    counter.textContent = slides.length
      ? `Slide ${cur + 1} of ${slides.length}`
      : "No slides";
    if (!slides.length) {
      stage.replaceChildren(
        h("p", { class: "ql-note" }, "No slides found in this presentation."),
      );
      return;
    }
    if (showAll) {
      stage.replaceChildren(
        h("div", { class: "ql-slide-deck" }, ...slides.map(renderSlideCard)),
      );
    } else {
      stage.replaceChildren(renderSlideCard(slides[cur]));
    }
  };

  const prevBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small",
      title: "Previous slide",
      onclick: () => {
        if (cur > 0) {
          cur--;
          showAll = false;
          draw();
        }
      },
    },
    "← Prev",
  );
  const nextBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small",
      title: "Next slide",
      onclick: () => {
        if (cur < slides.length - 1) {
          cur++;
          showAll = false;
          draw();
        }
      },
    },
    "Next →",
  );
  const modeSwitcher = buildModeSwitcher(
    [
      { id: "deck", label: `All slides (${slides.length})` },
      { id: "single", label: "Single slide" },
    ],
    showAll ? "deck" : "single",
    (m) => {
      showAll = m === "deck";
      draw();
    },
  );
  showAll = true;
  draw();

  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      prevBtn,
      counter,
      nextBtn,
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      modeSwitcher,
    ),
    stage,
  );
}

function renderPdfQuickLook(entry, rich) {
  const hasText = Boolean(rich.extractedText && rich.extractedText.trim());
  const thumbWrap = rich.hasThumb
    ? h(
        "div",
        { class: "ql-pdf-thumb" },
        h("img", {
          class: "ql-image",
          src: `${rawUrl(entry.path)}&thumb=1`,
          alt: `First page of ${entry.name}`,
        }),
      )
    : null;

  const textSection = h(
    "div",
    { class: "ql-pdf-details" },
    rich.outline?.length
      ? h(
          "div",
          { class: "ql-fmt-section" },
          h("h4", {}, `Outline / Bookmarks (${rich.outline.length})`),
          h(
            "ul",
            { class: "ql-doc-list" },
            ...rich.outline.slice(0, 30).map((o) => h("li", {}, o)),
          ),
        )
      : null,
    h(
      "div",
      { class: "ql-fmt-section" },
      h("h4", {}, "Extracted Document Text"),
      hasText
        ? h("pre", { class: "ql-rich-pre", tabindex: "0" }, rich.extractedText)
        : h(
            "p",
            { class: "ql-note" },
            rich.encrypted
              ? "This PDF is encrypted, so its text cannot be read without a password."
              : "This PDF contains scanned images or custom vector glyphs rather than plain text streams.",
          ),
    ),
    rich.flags?.some((f) => f.found)
      ? h(
          "div",
          { class: "ql-fmt-section ql-pdf-warn" },
          h("h4", {}, "Active Content Warnings"),
          h(
            "ul",
            { class: "ql-doc-list" },
            ...rich.flags
              .filter((f) => f.found)
              .map((f) => h("li", {}, `${f.label}: ${f.hint}`)),
          ),
        )
      : null,
  );

  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      rich.pages
        ? h(
            "span",
            { class: "ql-fmt-chip" },
            h("strong", {}, "Pages: "),
            String(rich.pages),
          )
        : null,
      rich.pageSize
        ? h(
            "span",
            { class: "ql-fmt-chip" },
            h("strong", {}, "Size: "),
            rich.pageSize,
          )
        : null,
      metaChips(rich.meta),
    ),
    h("div", { class: "ql-pdf-split" }, thumbWrap, textSection),
  );
}

function renderSqliteQuickLook(entry, rich, { onClose } = {}) {
  const tables = rich.tables || [];
  let activeIdx = 0;
  let viewMode = "rows";
  const stage = h("div", { class: "ql-fmt-stage" });

  const tabBtns = tables.map((t, idx) =>
    h(
      "button",
      {
        type: "button",
        class: `code-btn code-small ql-sheet-tab${idx === 0 ? " active" : ""}`,
        "aria-pressed": String(idx === 0),
        title: `${t.type} ${t.name} (${t.rowCount} rows)`,
        onclick: () => {
          activeIdx = idx;
          tabBtns.forEach((b, i) => {
            b.classList.toggle("active", i === activeIdx);
            b.setAttribute("aria-pressed", String(i === activeIdx));
          });
          drawTable();
        },
      },
      `${t.name} (${t.rowCount})`,
    ),
  );

  const drawTable = () => {
    const t = tables[activeIdx];
    if (!t) {
      stage.replaceChildren(
        h(
          "p",
          { class: "ql-note" },
          "No user tables found in this SQLite database.",
        ),
      );
      return;
    }
    if (viewMode === "schema") {
      const schemaRows = t.columns.map((c) => [
        c.name,
        c.type,
        c.pk ? "Primary Key" : "",
        c.notnull ? "NOT NULL" : "",
      ]);
      stage.replaceChildren(
        buildInteractiveGrid(
          ["Column", "Type", "Key", "Constraints"],
          schemaRows,
          { filterPlaceholder: "Filter columns…" },
        ),
        t.sql ? h("pre", { class: "ql-rich-pre" }, t.sql) : null,
      );
      return;
    }
    const headers = t.columns.map((c) => `${c.name}${c.pk ? " 🔑" : ""}`);
    stage.replaceChildren(
      buildInteractiveGrid(headers, t.rows, {
        filterPlaceholder: `Filter ${t.name} rows…`,
      }),
    );
  };

  const switcher = buildModeSwitcher(
    [
      { id: "rows", label: "Data rows" },
      { id: "schema", label: "Columns & SQL" },
    ],
    "rows",
    (m) => {
      viewMode = m;
      drawTable();
    },
  );
  const studioBtn = h(
    "button",
    {
      type: "button",
      class: "code-btn code-small",
      title: "Open this database in SQLite Studio",
      onclick: () => {
        onClose?.();
        openInSqliteStudio(entry.path);
      },
    },
    "Open in SQLite Studio",
  );
  drawTable();

  return h(
    "div",
    { class: "ql-card ql-card-wide ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      tables.length
        ? h("div", { class: "ql-sheet-tabs", role: "tablist" }, ...tabBtns)
        : null,
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      studioBtn,
      switcher,
    ),
    stage,
  );
}

function renderArchiveQuickLook(entry, rich, helpers = {}) {
  const entries = rich.entries || [];
  const rows = entries.map((e) => [
    e.dir ? `📁 ${e.name}` : e.name,
    e.dir ? "Folder" : formatSize(e.size),
    e.packed !== undefined && !e.dir ? formatSize(e.packed) : "—",
    e.encrypted ? "🔒 Encrypted" : e.dir ? "Folder" : "File",
  ]);
  const extractBtn =
    isExtractableEntry(entry) && helpers.canExtract !== false
      ? h(
          "button",
          {
            type: "button",
            class: "code-btn code-small ql-extract-btn",
            "data-copy-ui": "",
            title: "Unpack this archive into the current folder",
            onclick: () => {
              emit("archive-extract", {
                entry,
                mode: "smart",
                pane: helpers.pane,
                onSuccess: helpers.onClose,
              });
            },
          },
          "📦 Extract here",
        )
      : null;
  return h(
    "div",
    { class: "ql-card ql-card-wide ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      extractBtn ? h("span", { class: "code-grow" }) : null,
      extractBtn,
    ),
    rich.innerText
      ? h(
          "div",
          { class: "ql-fmt-section" },
          h("h4", {}, `Decompressed Preview: ${rich.innerName || entry.name}`),
          h("pre", { class: "ql-rich-pre", tabindex: "0" }, rich.innerText),
        )
      : null,
    rows.length
      ? buildInteractiveGrid(
          ["Path inside archive", "Unpacked size", "Packed size", "Kind"],
          rows,
          {
            maxRows: 300,
            filterPlaceholder: "Filter files in archive…",
          },
        )
      : !rich.innerText
        ? h("p", { class: "ql-note" }, "Archive summary loaded above.")
        : null,
  );
}

const loadedPreviewFonts = new Map();
const MAX_PREVIEW_FONTS = 8;

function renderFontQuickLook(entry, rich) {
  const fontFamilyId = `fm-ql-font-${Date.now()}`;
  const sampleText = "The quick brown fox jumps over the lazy dog 0123456789";
  const sizes = [14, 18, 24, 36, 48];
  const sampleInput = h("input", {
    type: "text",
    class: "ql-fmt-search",
    value: sampleText,
    "aria-label": "Custom sample text for font preview",
    placeholder: "Type sample text…",
  });
  const specimenLines = sizes.map((pt) =>
    h(
      "div",
      { class: "ql-font-line" },
      h("span", { class: "ql-font-size" }, `${pt}px`),
      h(
        "div",
        {
          class: "ql-font-sample",
          style: `font-family: "${fontFamilyId}", sans-serif; font-size: ${pt}px;`,
        },
        sampleText,
      ),
    ),
  );
  sampleInput.addEventListener("input", () => {
    const val = sampleInput.value || sampleText;
    for (const row of specimenLines) {
      row.querySelector(".ql-font-sample").textContent = val;
    }
  });

  if (
    rich.canRenderSpecimen &&
    typeof FontFace === "function" &&
    document.fonts?.add
  ) {
    try {
      const face = new FontFace(
        fontFamilyId,
        `url("${rawUrl(entry.path)}&font=1")`,
      );
      face
        .load()
        .then((loaded) => {
          while (loadedPreviewFonts.size >= MAX_PREVIEW_FONTS) {
            const oldestKey = loadedPreviewFonts.keys().next().value;
            const oldestFace = loadedPreviewFonts.get(oldestKey);
            loadedPreviewFonts.delete(oldestKey);
            if (oldestFace) document.fonts.delete?.(oldestFace);
          }
          loadedPreviewFonts.set(fontFamilyId, loaded);
          document.fonts.add(loaded);
        })
        .catch(() => {});
    } catch {}
  }

  return h(
    "div",
    { class: "ql-card ql-card-wide ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, `${rich.family} (${rich.style})`),
      metaChips(rich.meta),
    ),
    h(
      "div",
      { class: "ql-font-specimen" },
      h(
        "div",
        { class: "ql-fmt-bar" },
        h("strong", {}, "Specimen preview:"),
        sampleInput,
      ),
      h(
        "div",
        {
          class: "ql-font-alphabet",
          style: `font-family: "${fontFamilyId}", sans-serif;`,
        },
        h("div", {}, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
        h("div", {}, "abcdefghijklmnopqrstuvwxyz"),
        h("div", {}, "0123456789 !@#$%^&*()_+-=[]{};':\",./<>?"),
      ),
      ...specimenLines,
    ),
  );
}

function renderStructuredQuickLook(entry, preview, rich) {
  const isText = preview.type === "text";
  const rawSource = isText ? preview.text : rich.formattedText || "";
  const langId = detectLanguage(entry.name, rawSource.slice(0, 200));
  const plainPre = isText
    ? renderColouredCodeLines(rawSource, langId === "plain" ? "json" : langId)
    : h("pre", { class: "ql-rich-pre", tabindex: "0" }, rawSource);

  const treeFilter = h("input", {
    type: "search",
    class: "ql-fmt-search",
    placeholder: "Filter keys or values…",
    "aria-label": "Filter keys or values",
  });
  const treeBody = h("div", { class: "code-json-tree" });
  const drawTree = () => {
    const node = buildDataTree(
      null,
      rich.data,
      0,
      treeFilter.value.trim().toLowerCase(),
    );
    treeBody.replaceChildren(
      node ?? h("p", { class: "code-hint" }, "Nothing matches the filter."),
    );
  };
  treeFilter.addEventListener("input", drawTree);
  drawTree();
  const treeWrap = h(
    "div",
    { class: "ql-fmt-stage" },
    h("div", { class: "ql-fmt-bar" }, treeFilter),
    treeBody,
  );

  const tableWrap = rich.table
    ? buildInteractiveGrid(rich.table.headers, rich.table.rows, {
        filterPlaceholder: "Filter records…",
      })
    : null;

  const canPrettyJson =
    (rich.subkind === "json" || rich.subkind === "geojson") &&
    rich.data !== undefined;
  let prettyPre = canPrettyJson
    ? h("div", { class: "ql-pretty-host", hidden: true })
    : null;
  let prettyRendered = false;
  const ensurePrettyRendered = () => {
    if (!canPrettyJson || prettyRendered || !prettyPre) return;
    prettyRendered = true;
    const built = renderColouredCodeLines(
      JSON.stringify(rich.data, null, 2),
      "json",
    );
    built.classList.add("ql-pretty-json-pre");
    const hostRoot = prettyPre.closest(".ql-body, .ql-fmt-wrap, .ql");
    const wrapBtn = hostRoot?.querySelector?.(".ql-wrap-btn");
    if (wrapBtn && wrapBtn.getAttribute("aria-pressed") === "false") {
      built.classList.add("ql-nowrap");
    }
    prettyPre.replaceWith(built);
    prettyPre = built;
  };

  const initialMode = rich.subkind === "jsonl" && tableWrap ? "table" : "tree";
  treeWrap.hidden = initialMode !== "tree";
  if (tableWrap) tableWrap.hidden = initialMode !== "table";
  if (prettyPre) prettyPre.hidden = initialMode !== "pretty";
  plainPre.hidden = initialMode !== "source";

  const modes = [
    { id: "tree", label: "Structured tree" },
    ...(tableWrap
      ? [{ id: "table", label: `Table (${rich.table.totalRows})` }]
      : []),
    ...(prettyPre ? [{ id: "pretty", label: "✨ Pretty JSON" }] : []),
    { id: "source", label: "Source" },
  ];
  const switcher = buildModeSwitcher(modes, initialMode, (m) => {
    if (m === "pretty") ensurePrettyRendered();
    treeWrap.hidden = m !== "tree";
    if (tableWrap) tableWrap.hidden = m !== "table";
    if (prettyPre) prettyPre.hidden = m !== "pretty";
    plainPre.hidden = m !== "source";
  });

  return h(
    "div",
    {
      class: isText
        ? "ql-textwrap ql-fmt-wrap"
        : "ql-card ql-card-wide ql-fmt-wrap",
    },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    treeWrap,
    tableWrap,
    prettyPre,
    plainPre,
  );
}

function renderNotebookQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  const nbHost = h(
    "div",
    { class: "ql-nb-cells" },
    ...rich.cells.map((cell) => {
      if (cell.cellType === "markdown") {
        const mdBox = h("div", { class: "ql-nb-md code-preview-body" });
        renderMarkdown(mdBox, cell.source);
        return h("div", { class: "ql-nb-cell ql-nb-cell-md" }, mdBox);
      }
      const codeBox = renderColouredCodeLines(cell.source, "python");
      codeBox.classList.remove("ql-text");
      codeBox.classList.add("ql-nb-code");
      const outNodes = (cell.outputs || []).map((o) => {
        if (o.kind === "image" && o.dataUrl) {
          return h(
            "div",
            { class: "ql-nb-out ql-nb-out-img" },
            h("img", { src: o.dataUrl, alt: "Notebook cell output" }),
          );
        }
        return h(
          "pre",
          { class: `ql-nb-out${o.kind === "error" ? " ql-nb-out-err" : ""}` },
          o.text || "",
        );
      });
      return h(
        "div",
        { class: "ql-nb-cell ql-nb-cell-code" },
        h(
          "div",
          { class: "ql-nb-prompt" },
          `In [${cell.executionCount ?? " "}]:`,
        ),
        h("div", { class: "ql-nb-cell-body" }, codeBox, ...outNodes),
      );
    }),
  );
  const switcher = buildModeSwitcher(
    [
      { id: "notebook", label: `Notebook (${rich.cells.length} cells)` },
      { id: "raw", label: "Raw JSON" },
    ],
    "notebook",
    (m) => {
      nbHost.hidden = m !== "notebook";
      plainPre.hidden = m !== "raw";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    nbHost,
    plainPre,
  );
}

function renderSubtitlesQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  const hasSpeaker = rich.cues.some((c) => c.speaker);
  const hasEnd = rich.cues.some((c) => c.end);
  const headers = [
    "#",
    "Start",
    ...(hasEnd ? ["End"] : []),
    ...(hasSpeaker ? ["Speaker"] : []),
    "Text",
  ];
  const rows = rich.cues.map((c) => [
    String(c.index),
    c.start,
    ...(hasEnd ? [c.end] : []),
    ...(hasSpeaker ? [c.speaker || ""] : []),
    c.text,
  ]);
  const grid = buildInteractiveGrid(headers, rows, {
    filterPlaceholder: "Search captions or lyrics…",
  });
  const switcher = buildModeSwitcher(
    [
      { id: "cues", label: `Timed cues (${rich.totalCues})` },
      { id: "plain", label: "Plain text" },
    ],
    "cues",
    (m) => {
      grid.hidden = m !== "cues";
      plainPre.hidden = m !== "plain";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    grid,
    plainPre,
  );
}

function renderPlaylistQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  const rows = rich.tracks.map((t) => [
    String(t.index),
    t.title,
    t.duration || "—",
    t.path,
  ]);
  const grid = buildInteractiveGrid(
    ["#", "Title", "Duration", "Path / Stream"],
    rows,
    { filterPlaceholder: "Filter tracks…" },
  );
  const switcher = buildModeSwitcher(
    [
      { id: "tracks", label: `Tracks (${rich.tracks.length})` },
      { id: "plain", label: "Plain text" },
    ],
    "tracks",
    (m) => {
      grid.hidden = m !== "tracks";
      plainPre.hidden = m !== "plain";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    grid,
    plainPre,
  );
}

function renderCalendarQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  const cards = h(
    "div",
    { class: "ql-fmt-cards" },
    ...(rich.events.length
      ? rich.events.map((ev) =>
          h(
            "article",
            { class: "ql-fmt-card" },
            h("h3", {}, `📅 ${ev.summary}`),
            h(
              "dl",
              { class: "ql-facts" },
              h("dt", {}, "Starts"),
              h("dd", {}, ev.start || "—"),
              ...(ev.end ? [h("dt", {}, "Ends"), h("dd", {}, ev.end)] : []),
              ...(ev.location
                ? [h("dt", {}, "Location"), h("dd", {}, ev.location)]
                : []),
              ...(ev.organizer
                ? [h("dt", {}, "Organizer"), h("dd", {}, ev.organizer)]
                : []),
              ...(ev.status
                ? [h("dt", {}, "Status"), h("dd", {}, ev.status)]
                : []),
            ),
            ev.description
              ? h("p", { class: "ql-doc-p" }, ev.description)
              : null,
          ),
        )
      : [h("p", { class: "ql-note" }, "No calendar events found.")]),
  );
  const switcher = buildModeSwitcher(
    [
      { id: "cards", label: `Events (${rich.events.length})` },
      { id: "plain", label: "Raw iCalendar" },
    ],
    "cards",
    (m) => {
      cards.hidden = m !== "cards";
      plainPre.hidden = m !== "plain";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    cards,
    plainPre,
  );
}

function renderContactQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  const cards = h(
    "div",
    { class: "ql-fmt-cards" },
    ...(rich.contacts.length
      ? rich.contacts.map((c) =>
          h(
            "article",
            { class: "ql-fmt-card" },
            h("h3", {}, `👤 ${c.fullName}`),
            c.title || c.org
              ? h(
                  "p",
                  { class: "ql-doc-author" },
                  [c.title, c.org].filter(Boolean).join(" · "),
                )
              : null,
            h(
              "dl",
              { class: "ql-facts" },
              ...(c.phones.length
                ? [h("dt", {}, "Phone"), h("dd", {}, c.phones.join(", "))]
                : []),
              ...(c.emails.length
                ? [h("dt", {}, "Email"), h("dd", {}, c.emails.join(", "))]
                : []),
              ...(c.addresses.length
                ? [h("dt", {}, "Address"), h("dd", {}, c.addresses.join(" | "))]
                : []),
              ...(c.url ? [h("dt", {}, "Website"), h("dd", {}, c.url)] : []),
              ...(c.note ? [h("dt", {}, "Note"), h("dd", {}, c.note)] : []),
            ),
          ),
        )
      : [h("p", { class: "ql-note" }, "No vCard contacts found.")]),
  );
  const switcher = buildModeSwitcher(
    [
      { id: "cards", label: `Contacts (${rich.contacts.length})` },
      { id: "plain", label: "Raw vCard" },
    ],
    "cards",
    (m) => {
      cards.hidden = m !== "cards";
      plainPre.hidden = m !== "plain";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    cards,
    plainPre,
  );
}

function renderCertificateQuickLook(entry, preview, rich) {
  const isText = preview.type === "text";
  const plainPre = isText
    ? h(
        "pre",
        { class: "ql-text", tabindex: "0", hidden: true },
        preview.text || "",
      )
    : null;
  const cards = h(
    "div",
    { class: "ql-fmt-cards" },
    ...rich.blocks.map((b) =>
      h(
        "article",
        { class: "ql-fmt-card" },
        h("h3", {}, `🔐 ${b.label}`),
        h(
          "dl",
          { class: "ql-facts" },
          h("dt", {}, "Size"),
          h("dd", {}, `${b.bytes.toLocaleString("en-US")} bytes`),
          h("dt", {}, "SHA-256"),
          h("dd", { class: "ql-mono" }, b.sha256),
          h("dt", {}, "SHA-1"),
          h("dd", { class: "ql-mono" }, b.sha1),
          ...b.details.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]),
        ),
      ),
    ),
  );
  const switcher = plainPre
    ? buildModeSwitcher(
        [
          { id: "cert", label: "Certificate details" },
          { id: "plain", label: "PEM text" },
        ],
        "cert",
        (m) => {
          cards.hidden = m !== "cert";
          plainPre.hidden = m !== "plain";
        },
      )
    : null;
  return h(
    "div",
    {
      class: isText
        ? "ql-textwrap ql-fmt-wrap"
        : "ql-card ql-card-wide ql-fmt-wrap",
    },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    cards,
    plainPre,
  );
}

function renderModel3dQuickLook(entry, preview, rich) {
  const isText = preview.type === "text";
  const plainPre = isText
    ? h(
        "pre",
        { class: "ql-text", tabindex: "0", hidden: true },
        preview.text || "",
      )
    : null;
  let yaw = 35;
  let pitch = 20;
  const svgHost = h("div", { class: "ql-3d-stage" });

  const drawWireframe = () => {
    const verts = rich.vertices || [];
    const edges = rich.edges || [];
    if (!verts.length) {
      svgHost.replaceChildren(
        h("p", { class: "ql-note" }, "3D scene metadata loaded above."),
      );
      return;
    }
    const radY = (yaw * Math.PI) / 180;
    const radP = (pitch * Math.PI) / 180;
    const cosY = Math.cos(radY),
      sinY = Math.sin(radY);
    const cosP = Math.cos(radP),
      sinP = Math.sin(radP);
    const project = ([x, y, z]) => {
      const rx = x * cosY + z * sinY;
      const rz = -x * sinY + z * cosY;
      const ry = y * cosP - rz * sinP;
      const pz = y * sinP + rz * cosP;
      const scale = 140 / (2.6 - pz * 0.35);
      return [200 + rx * scale, 150 - ry * scale];
    };
    const projected = verts.map(project);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 400 300");
    svg.setAttribute("class", "ql-3d-svg");
    if (edges.length) {
      const d = edges
        .map(([a, b]) => {
          const pa = projected[a],
            pb = projected[b];
          if (!pa || !pb) return "";
          return `M${pa[0].toFixed(1)},${pa[1].toFixed(1)}L${pb[0].toFixed(1)},${pb[1].toFixed(1)}`;
        })
        .join("");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1");
      path.setAttribute("fill", "none");
      path.setAttribute("opacity", "0.78");
      svg.appendChild(path);
    } else {
      for (const [px, py] of projected.slice(0, 600)) {
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", px.toFixed(1));
        c.setAttribute("cy", py.toFixed(1));
        c.setAttribute("r", "1.6");
        c.setAttribute("fill", "currentColor");
        svg.appendChild(c);
      }
    }
    svgHost.replaceChildren(svg);
  };

  const yawInput = h("input", {
    type: "range",
    min: "-180",
    max: "180",
    value: String(yaw),
    "aria-label": "Rotate 3D model horizontally",
    oninput: () => {
      yaw = Number(yawInput.value);
      drawWireframe();
    },
  });
  const pitchInput = h("input", {
    type: "range",
    min: "-85",
    max: "85",
    value: String(pitch),
    "aria-label": "Tilt 3D model vertically",
    oninput: () => {
      pitch = Number(pitchInput.value);
      drawWireframe();
    },
  });
  drawWireframe();

  const viewWrap = h(
    "div",
    { class: "ql-3d-wrap" },
    rich.vertices?.length
      ? h(
          "div",
          { class: "ql-fmt-bar" },
          h("label", {}, "Rotate Y ", yawInput),
          h("label", {}, "Tilt X ", pitchInput),
        )
      : null,
    svgHost,
  );
  const switcher = plainPre
    ? buildModeSwitcher(
        [
          { id: "3d", label: "3D Wireframe" },
          { id: "plain", label: "Source" },
        ],
        "3d",
        (m) => {
          viewWrap.hidden = m !== "3d";
          plainPre.hidden = m !== "plain";
        },
      )
    : null;

  return h(
    "div",
    {
      class: isText
        ? "ql-textwrap ql-fmt-wrap"
        : "ql-card ql-card-wide ql-fmt-wrap",
    },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    viewWrap,
    plainPre,
  );
}

function renderDiffQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  const diffHost = h(
    "div",
    { class: "ql-diff-files" },
    ...rich.files.map((f) =>
      h(
        "section",
        { class: "ql-fmt-card" },
        h(
          "div",
          { class: "ql-fmt-bar" },
          h("strong", {}, f.newFile || f.oldFile),
          h("span", { class: "code-t-inserted" }, `+${f.added}`),
          h("span", { class: "code-t-deleted" }, `-${f.removed}`),
        ),
        ...f.hunks.map((hk) =>
          h(
            "div",
            { class: "code-pv-hunk" },
            h("div", { class: "ql-diff-hdr" }, hk.header),
            ...hk.lines.map((l) =>
              h(
                "div",
                {
                  class: `code-pv-line ${l.type === "+" ? "code-t-inserted" : l.type === "-" ? "code-t-deleted" : ""}`,
                },
                `${l.type}${l.text}`,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  const switcher = buildModeSwitcher(
    [
      { id: "diff", label: "Formatted diff" },
      { id: "plain", label: "Plain patch" },
    ],
    "diff",
    (m) => {
      diffHost.hidden = m !== "diff";
      plainPre.hidden = m !== "plain";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    diffHost,
    plainPre,
  );
}

function renderLogQuickLook(entry, preview, rich) {
  const plainPre = h(
    "pre",
    { class: "ql-text", tabindex: "0", hidden: true },
    preview.text || "",
  );
  let levelFilter = "ALL";
  const search = h("input", {
    type: "search",
    class: "ql-fmt-search",
    placeholder: "Filter log lines…",
    "aria-label": "Filter log lines",
  });
  const listHost = h("div", { class: "ql-log-list" });

  const drawLogs = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = rich.entries.filter((e) => {
      if (levelFilter !== "ALL" && e.level !== levelFilter) return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
    listHost.replaceChildren(
      ...filtered
        .slice(0, 300)
        .map((e) =>
          h(
            "div",
            { class: `ql-log-line ql-log-${e.level.toLowerCase()}` },
            h("span", { class: "code-pv-ln" }, String(e.line)),
            h(
              "span",
              { class: `ql-log-badge ql-log-badge-${e.level.toLowerCase()}` },
              e.level,
            ),
            h("span", { class: "ql-log-msg" }, e.text),
          ),
        ),
    );
  };
  search.addEventListener("input", drawLogs);
  const levelBtns = [
    ["ALL", `All (${rich.entries.length})`],
    ["ERROR", `Errors (${rich.counts.error})`],
    ["WARN", `Warnings (${rich.counts.warn})`],
    ["INFO", `Info (${rich.counts.info})`],
    ["DEBUG", `Debug (${rich.counts.debug})`],
  ].map(([lvl, label]) =>
    h(
      "button",
      {
        type: "button",
        class: `code-btn code-small${lvl === "ALL" ? " active" : ""}`,
        onclick: (ev) => {
          levelFilter = lvl;
          for (const b of ev.currentTarget.parentElement.querySelectorAll(
            "button",
          ))
            b.classList.toggle("active", b === ev.currentTarget);
          drawLogs();
        },
      },
      label,
    ),
  );
  drawLogs();

  const logStage = h(
    "div",
    { class: "ql-fmt-stage" },
    h("div", { class: "ql-fmt-bar" }, search, ...levelBtns),
    listHost,
  );
  const switcher = buildModeSwitcher(
    [
      { id: "log", label: "Log viewer" },
      { id: "plain", label: "Plain text" },
    ],
    "log",
    (m) => {
      logStage.hidden = m !== "log";
      plainPre.hidden = m !== "plain";
    },
  );
  return h(
    "div",
    { class: "ql-textwrap ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      metaChips(rich.meta),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    logStage,
    plainPre,
  );
}

function renderBinaryQuickLook(entry, rich) {
  const facts = [
    ["Type", rich.formatLabel || entry.label],
    ["Size", formatSize(entry.size)],
    ["Modified", entry.mtimeMs ? formatDate(entry.mtimeMs) : ""],
    ...(rich.meta || []).filter(([k]) => k !== "Size"),
  ].filter(([, v]) => v);

  const hexPre = h(
    "pre",
    {
      class: "ql-hex-dump",
      tabindex: "0",
      "aria-label": `Hex dump of ${entry.name}`,
    },
    rich.hexLines?.length ? rich.hexLines.join("\n") : "(Empty file)",
  );
  const stringsPre = h(
    "pre",
    {
      class: "ql-hex-dump",
      tabindex: "0",
      "aria-label": `Extracted strings of ${entry.name}`,
      hidden: true,
    },
    rich.strings?.length
      ? rich.strings.join("\n")
      : "(No printable ASCII strings of 4+ characters in the first 64 KB.)",
  );
  const switcher = buildModeSwitcher(
    [
      { id: "hex", label: `Hex + ASCII (${rich.hexLines?.length || 0} rows)` },
      { id: "strings", label: `Strings (${rich.strings?.length || 0})` },
    ],
    "hex",
    (m) => {
      hexPre.hidden = m !== "hex";
      stringsPre.hidden = m !== "strings";
    },
  );

  return h(
    "div",
    { class: "ql-card ql-card-wide ql-fmt-wrap" },
    h(
      "div",
      { class: "ql-fmt-head" },
      h(
        "span",
        { class: "ql-bigicon", "aria-hidden": "true" },
        entry.icon || iconFor(entry.name, false),
      ),
      h("h3", {}, entry.name),
      h("span", { class: "ql-fmt-badge" }, rich.formatLabel),
      h("span", { class: "code-grow" }),
      switcher,
    ),
    h(
      "dl",
      { class: "ql-facts" },
      ...facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, String(v))]),
    ),
    hexPre,
    stringsPre,
  );
}

/**
 * Renders the formatted Quick Look body when `preview.rich` is available or when a text file is a known programming language.
 * Returns null when Quick Look should use its default plain text / CSV / Markdown view.
 */
function attachCopyButtonsToRichHead(node, entry, preview, helpers = {}) {
  if (!node) return null;
  if (preview?.rich?.kind === "font") return node;
  const head = node.querySelector?.(".ql-fmt-head");
  if (head && !head.querySelector(".ql-copy-group")) {
    if (!head.querySelector(".code-grow")) {
      head.append(h("span", { class: "code-grow" }));
    }
    const allPres = [...(node.querySelectorAll?.("pre") || [])];
    const hasPre =
      allPres.length > 0 || Boolean(node.querySelector?.(".ql-pretty-host"));
    const onlyHex =
      allPres.length > 0 &&
      allPres.every((p) => p.classList.contains("ql-hex-dump"));
    const group = buildQuickLookCopyButtons(entry, preview, () => node, {
      ...helpers,
      hasPre,
      initialWrapped: !onlyHex,
    });
    const wrapBtn = group.querySelector?.(".ql-wrap-btn");
    if (wrapBtn) {
      const anyVisiblePre = allPres.some(
        (p) => !p.hidden && !p.closest("[hidden]"),
      );
      wrapBtn.hidden = !anyVisiblePre;
    }
    head.append(group);
  }
  return node;
}

export function renderRichQuickLook(entry, preview, helpers = {}) {
  const rich = preview?.rich;
  let node = null;
  if (rich) {
    switch (rich.kind) {
      case "spreadsheet":
        node = renderSpreadsheetQuickLook(entry, rich);
        break;
      case "document":
        node = renderDocumentQuickLook(entry, preview, rich, helpers);
        break;
      case "presentation":
        node = renderPresentationQuickLook(entry, rich);
        break;
      case "pdf":
        node = renderPdfQuickLook(entry, rich);
        break;
      case "sqlite":
        node = renderSqliteQuickLook(entry, rich, helpers);
        break;
      case "archive":
        node = renderArchiveQuickLook(entry, rich, helpers);
        break;
      case "font":
        node = renderFontQuickLook(entry, rich);
        break;
      case "structured":
        node = renderStructuredQuickLook(entry, preview, rich);
        break;
      case "notebook":
        node = renderNotebookQuickLook(entry, preview, rich);
        break;
      case "subtitles":
        node = renderSubtitlesQuickLook(entry, preview, rich);
        break;
      case "playlist":
        node = renderPlaylistQuickLook(entry, preview, rich);
        break;
      case "calendar":
        node = renderCalendarQuickLook(entry, preview, rich);
        break;
      case "contact":
        node = renderContactQuickLook(entry, preview, rich);
        break;
      case "certificate":
        node = renderCertificateQuickLook(entry, preview, rich);
        break;
      case "model3d":
        node = renderModel3dQuickLook(entry, preview, rich);
        break;
      case "diff":
        node = renderDiffQuickLook(entry, preview, rich);
        break;
      case "log":
        node = renderLogQuickLook(entry, preview, rich);
        break;
      case "binary":
        node = renderBinaryQuickLook(entry, rich);
        break;
    }
    if (node) return attachCopyButtonsToRichHead(node, entry, preview, helpers);
  }

  // Syntax-highlighted source code for programming languages
  if (preview?.type === "text" && preview.text) {
    const ext = extensionOf(entry.name);
    if (ext === "csv" || ext === "tsv") return null;
    const firstLine = preview.text.split(/\r?\n/, 1)[0] || "";
    const langId = detectLanguage(entry.name, firstLine);
    if (langId && langId !== "plain" && langId !== "markdown") {
      const lang = languageInfo(langId);
      const symbols = extractSymbols(preview.text, langId);
      const codePre = renderColouredCodeLines(preview.text, langId);
      const lineCount = preview.text.split(/\r?\n/).length;
      const meta = [
        ["Language", lang.name],
        ["Lines", lineCount.toLocaleString("en-US")],
        ...(symbols.length ? [["Symbols", String(symbols.length)]] : []),
      ];
      return attachCopyButtonsToRichHead(
        h(
          "div",
          { class: "ql-textwrap ql-fmt-wrap" },
          h(
            "div",
            { class: "ql-fmt-head" },
            h("span", { class: "ql-fmt-badge" }, lang.name),
            metaChips(meta),
          ),
          codePre,
        ),
        entry,
        preview,
        helpers,
      );
    }
  }
  return null;
}

/**
 * Compact rich preview block for the right-hand Details panel (`#info`) for non-text files
 * (spreadsheets, documents, presentations, PDFs, SQLite databases, archives, fonts, 3D models, binary files).
 */
export function renderRichInfoSummary(entry, preview) {
  const rich = preview?.rich;
  if (!rich) return null;
  const rows = (rich.meta || [])
    .filter(([k, v]) => k && v && !/\b(?:null|undefined)\b/i.test(`${k} ${v}`))
    .slice(0, 6);
  let bodyNode = null;

  if (rich.kind === "spreadsheet" && rich.sheets?.length) {
    const s = rich.sheets[0];
    rows.unshift([
      "Sheets",
      rich.sheets.map((x) => `${x.name} (${x.totalRows})`).join(", "),
    ]);
    if (s.rows.length) {
      const sample = s.rows
        .slice(0, 4)
        .map((r) => r.slice(0, 4).join(" · "))
        .join("\n");
      bodyNode = h("pre", { class: "info-rich-snippet" }, sample);
    }
  } else if (rich.kind === "document" && rich.plainText) {
    bodyNode = h(
      "pre",
      { class: "info-rich-snippet" },
      rich.plainText.slice(0, 400),
    );
  } else if (rich.kind === "presentation" && rich.slides?.length) {
    const text = rich.slides
      .slice(0, 5)
      .map((s) => `${s.number}. ${s.title}`)
      .join("\n");
    bodyNode = h("pre", { class: "info-rich-snippet" }, text);
  } else if (rich.kind === "pdf") {
    if (rich.pages) rows.unshift(["Pages", String(rich.pages)]);
    if (rich.extractedText)
      bodyNode = h(
        "pre",
        { class: "info-rich-snippet" },
        rich.extractedText.slice(0, 400),
      );
  } else if (rich.kind === "sqlite" && rich.tables?.length) {
    rows.unshift([
      "Tables",
      rich.tables.map((t) => `${t.name} (${t.rowCount})`).join(", "),
    ]);
  } else if (rich.kind === "archive") {
    if (rich.innerText) {
      bodyNode = h(
        "pre",
        { class: "info-rich-snippet" },
        rich.innerText.slice(0, 400),
      );
    } else if (rich.entries?.length) {
      bodyNode = h(
        "pre",
        { class: "info-rich-snippet" },
        rich.entries
          .slice(0, 8)
          .map((e) => e.name)
          .join("\n"),
      );
    }
  } else if (rich.kind === "font") {
    rows.unshift(["Font", `${rich.family} (${rich.style})`]);
  } else if (rich.kind === "binary" && rich.hexLines?.length) {
    const cleanHex = rich.hexLines
      .slice(0, 6)
      .map((line) => line.slice(0, 58))
      .join("\n");
    bodyNode = h("pre", { class: "info-rich-snippet" }, cleanHex);
  }

  return h(
    "div",
    { class: "info-rich-box" },
    h("div", { class: "info-rich-title" }, rich.formatLabel || entry.label),
    rows.length
      ? h(
          "dl",
          { class: "info-rich-facts" },
          ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, String(v))]),
        )
      : null,
    bodyNode,
  );
}
