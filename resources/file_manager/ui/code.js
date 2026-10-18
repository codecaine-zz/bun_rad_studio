// The "Code" tab of the Power tools: a code editor inside the File Manager. This file builds the layout and joins the
// parts together (documents, editors, Explorer and panels, find bar, status bar, menus, keyboard, session).
// Other modules: codeEditor (the text area), codeDocs (open files), codeActions (save, close, rename ...),
// codeCommands (every command), codeRunUi (Run and Build presets), codeLogic (the pure logic, unit-tested).
import { call, rawUrl } from "./api.js";
import { debounce, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { registerOpener } from "./openwith.js";
import { activePowerTab, openPower, powerIsOpen, registerPowerTab } from "./power.js";
import { state } from "./state.js";
import { commandForEvent, computeGutterLineChanges, computeLineDiff, extractSymbols, extractTodos, findLineColors, shiftBookmarks, symbolAt } from "./codeLogic.js";
import { shortcutText } from "./codeKeys.js";
import { createActions } from "./codeActions.js";
import { createAssist } from "./codeAssist.js";
import { THEME_CHOICES, createCommands } from "./codeCommands.js";
import { openPalette, openRegexSandbox, openShortcutsHelp } from "./codeDialogs.js";
import { keysOf } from "./keymap.js";
import { TRANSFORMS } from "./textConvert.js";
import { createDocs, isDirty } from "./codeDocs.js";
import { createEditor } from "./codeEditor.js";
import { createExplorer } from "./codeExplorer.js";
import { createFindBar } from "./codeFindBar.js";
import { createBookmarksPanel, createGitPanel, createHistoryPanel, createOutlinePanel, createSearchPanel, createTodosPanel } from "./codePanels.js";
import { createZoomableImage, renderCodeInspectorPreview, renderCsvPreview, renderJsonPreview, renderMarkdown, renderNotebookPreview, renderSource, renderStructuredDataPreview, slugifyMarkdownHeading } from "./codePreview.js";
import { createRunUi } from "./codeRunUi.js";
import { createStatus } from "./codeStatus.js";
import { renderTabs, renderWelcome, wireTabKeys } from "./codeTabs.js";

const docs = createDocs();

/** True when any open file has changes that aren't saved (the File Manager asks before closing). */
export const codeHasUnsaved = () => docs.anyDirty();

/** Opens the Power tools panel on the Code tab and opens `path` in the editor. */
export function openInCode(path) {
  openPower("code", { open: path });
}

/** Opens the Power tools panel on the Code tab with `path` (a folder) as the Explorer's workspace folder. */
export function openFolderInCode(path) {
  openPower("code", { folder: path });
}

registerOpener("code", (path) => openInCode(path));

const MENUS = {
  File: ["newFile", "quickOpen", "openPath", "recent", "recentToggle", "recentClear", "-", "save", "saveAs", "saveAll", "revert", "diffSaved", "diffTab", "panelHistory", "-", "rename", "deleteFile", "copyPath", "-", "closeTab", "closeOthers", "closeAll"],
  Edit: ["undo", "redo", "-", "find", "replace", "findNext", "findPrev", "findInFiles", "-", "goToLine", "goToSymbol", "renameSymbol", "editAllOccurrences", "inspectToken", "-", "insertSnippet", "insertGenerated", "complete", "selectAll", "clipboard"],
  Selection: ["expandSelection", "goToBracket", "nextOccurrence", "prevOccurrence", "editAllOccurrences", "prefixSuffixLines", "numberLines", "-", "foldBlock", "unfoldBlock", "foldAll", "unfoldAll", "-", "toggleComment", "blockComment", "wrapTag", "-", "indent", "outdent", "-", "selectLine", "selectWord", "-", "deleteLine", "duplicate", "duplicateUp", "moveUp", "moveDown", "joinLines"],
  Tools: ["toggleValue", "toggleQuotes", "evalMath", "-", "sortJson", "csvToMd", "-", "sortAsc", "sortDesc", "sortNumeric", "reverseLines", "dedupe", "-", "trim", "finalNewline", "tabsToSpaces", "spacesToTabs", "-", "upper", "lower", "title", "camel", "snake", "kebab", "-", "convertText", "removeAccents", "composeAccents", "decomposeAccents", "-", "urlEncode", "urlDecode", "-", "format", "minify", "-", "regexSandbox"],
  Go: ["goToBracket", "nextOccurrence", "prevOccurrence", "-", "bookmarkToggle", "bookmarkNext", "bookmarkPrev", "bookmarkClear", "-", "goToLine", "goToSymbol", "quickOpen"],
  View: ["wrap", "lineNumbers", "minimap", "stickyScroll", "whitespace", "indentGuides", "ruler", "wordHighlight", "-", "zoomIn", "zoomOut", "zoomReset", "-", "zen", "explorer", "preview", "splitEditor", "-", "panelFiles", "panelGit", "panelOutline", "panelTodos", "panelBookmarks", "panelHistory", "-", "completion", "autoOpen", "autosave", "autosaveOptions", "-", "shortcuts", "palette"],
};

function mount(root) {
  root.classList.add("code-root");
  const settings = () => docs.settings;
  const doc = () => docs.active;
  const ed = () => doc()?.editor ?? null;
  let started = false;
  let zen = false;
  let previewOn = false;
  let previewWidth = 45;
  let splitEditorOn = false;
  let splitDocId = 0;
  let mdController = null;
  // Zen mode hides the toolbar and its Preview button, so the preview has a switch of its own that stays in sight.
  const zenPreview = h("button", { type: "button", class: "code-zen-preview", "aria-pressed": "false", title: "Show or hide the preview & live inspector next to the text", onclick: () => commands.run("preview") }, "👁 Preview");

  const editors = h("div", { class: "code-editors" });
  const welcome = h("div", { class: "code-welcome" });
  const tabStrip = h("div", { class: "code-tabs", role: "tablist", "aria-label": "Open files" });
  const crumbs = h("nav", { class: "code-crumbs", "aria-label": "File path and current symbol", hidden: true });
  const banner = h("div", { class: "code-banner", role: "status", hidden: true });
  const previewBody = h("div", { class: "code-preview-body" });
  const previewTitle = h("strong", {}, "Preview");
  const previewExtra = h("span", { class: "code-row-tools" });
  const splitSlider = h("input", {
    type: "range",
    class: "code-preview-split-slider",
    min: "15",
    max: "85",
    step: "1",
    value: "45",
    "aria-label": "Resize code editor and preview split",
    title: "Slide to resize the code editor and preview split (15% – 85%)",
    oninput: () => setPreviewWidth(Number(splitSlider.value)),
  });
  const splitVal = h("span", {
    class: "code-preview-split-val",
    title: "Double-click to reset split width to 45%",
    ondblclick: () => setPreviewWidth(45),
  }, "45%");
  const splitCtl = h("label", {
    class: "code-preview-split-ctl",
    title: "Slide to resize the code editor and preview",
  }, splitSlider, splitVal);
  const previewResizer = h("div", {
    class: "code-preview-resizer",
    role: "separator",
    "aria-orientation": "vertical",
    "aria-label": "Resize code editor and preview",
    "aria-valuemin": "15",
    "aria-valuemax": "85",
    "aria-valuenow": "45",
    tabindex: "0",
    hidden: true,
    title: "Drag to resize the code editor and preview (double-click to reset, or use Left/Right arrow keys)",
    ondblclick: () => setPreviewWidth(previewWidth === 45 ? 50 : 45),
  }, h("span", { class: "code-preview-resizer-grip", "aria-hidden": "true" }, "⋮"));
  const preview = h("aside", { class: "code-preview-pane", "aria-label": "Preview", dataset: { width: "45" }, hidden: true }, h("div", { class: "code-preview-head" }, previewTitle, h("span", { class: "code-grow" }), splitCtl, previewExtra), previewBody);

  const splitSelect = h("select", {
    class: "code-in code-split-select",
    "aria-label": "Select open tab for split editor",
    title: "Choose which open tab to display in the side-by-side split pane",
    onchange: () => {
      splitDocId = Number(splitSelect.value) || 0;
      updateSplitPane();
    },
  });
  const splitDiffBtn = h("button", {
    type: "button",
    class: "btn code-small code-split-diff-btn",
    title: "Compare the active editor tab with this split pane tab",
    onclick: () => {
      const cur = doc();
      const target = docs.get(splitDocId) ?? docs.list().find((x) => x !== cur && x.kind !== "diff") ?? cur;
      if (!cur || !target) return;
      const r = computeLineDiff(target.text, cur.text, { oldLabel: target.name, newLabel: cur.name });
      if (r.identical) return void toast(`"${cur.name}" and "${target.name}" have identical text.`);
      docs.openView(`Diff: ${target.name} ↔ ${cur.name}`, r.diff, "diff");
    },
  }, "⇄ Diff");
  const splitCloseBtn = h("button", {
    type: "button",
    class: "btn code-small code-split-close-btn",
    title: "Close side-by-side split editor pane",
    "aria-label": "Close side-by-side split editor pane",
    onclick: () => app.toggleSplitEditor(),
  }, "✕");
  const splitBody = h("div", { class: "code-split-body" });
  const splitPane = h("aside", { class: "code-split-pane", "aria-label": "Side-by-side split editor", hidden: true },
    h("div", { class: "code-preview-head" }, h("strong", {}, "Split editor"), splitSelect, h("span", { class: "code-grow" }), splitDiffBtn, splitCloseBtn),
    splitBody,
  );

  const status = createStatus({ onLanguage: () => actions.pickLanguage(), onEol: () => actions.pickEol(), onIndent: () => actions.pickIndent(), onEncoding: () => actions.pickEncoding(), onPosition: () => actions.goToLine(), onAutosave: () => setSetting("autosave", !settings().autosave) });

  const findBar = createFindBar({ getEditor: ed, toast, onClose: () => ed()?.focus() });
  const explorer = createExplorer({
    onOpen: (path) => open(path),
    onRenamed: (from, to) => { docs.pathMoved(from, to); call("code/presets/move", { from, to }).catch(() => {}); },
    onDeleted: (path) => docs.list().filter((d) => d.path === path || d.path.startsWith(path + state.sep)).forEach((d) => docs.close(d.id)),
    onRootChanged: (r) => docs.setRoot(r),
  });
  const runUi = createRunUi({ getWorkspace: () => explorer.root });

  async function open(path, line = 1, col = 1, length = 0) {
    try {
      const d = await docs.openPath(path, { line, col });
      if (length && d.editor) d.editor.setSelection(d.editor.lineOffset(line, col), d.editor.lineOffset(line, col) + length);
    } catch (err) {
      toast(err?.message || "That file couldn't be opened.", { kind: "error" });
    }
  }

  const ctx = {
    docs, explorer, doc, ed, open,
    setLanguage(d, id) { d.lang = id; d.langPinned = true; if (id === "v" && d.indent.size === null) d.indent = { useTabs: true, size: null }; d.editor?.setOptions(optionsFor(d)); assist.reset(d); afterMeta(); updatePreview(); },
    statusButton: (name) => status.el.querySelector(`.code-st-${name}`),
    refreshEditor(d) { d.editor?.setOptions(optionsFor(d)); afterMeta(); },
  };
  const actions = createActions(ctx);
  const assist = createAssist({ settings, docs: () => docs.list(), unit: (d) => actions.unitOf(d, settings().tabSize) });

  const panels = {
    files: explorer,
    search: createSearchPanel({ getRoot: () => explorer.root, getHidden: () => settings().showHidden, onOpen: open }),
    git: createGitPanel({ getRoot: () => explorer.root, onOpen: (p) => open(p), onDiff: (title, text, lang) => docs.openView(title, text, lang) }),
    outline: createOutlinePanel({ getDoc: doc, onGo: (line) => ed()?.goTo(line) }),
    todos: createTodosPanel({ getDoc: doc, getDocs: () => docs.list(), onGo: (d, line, col) => { docs.activate(d.id); d.editor?.goTo(line, col); } }),
    bookmarks: createBookmarksPanel({ getDocs: () => docs.list(), onGo: async (d, line) => { docs.activate(d.id); d.editor?.goTo(line); }, onClear: () => docs.list().forEach((d) => { docs.setBookmarks(d, []); d.editor?.setBookmarks([]); }) }),
    history: createHistoryPanel({
      getDoc: doc,
      onSnapshot: () => {
        const d = doc();
        if (!d) return;
        docs.snapshot(d, "Manual snapshot");
        toast(`Saved local snapshot of ${d.name}.`, { kind: "success" });
      },
      onDiff: (d, snap) => {
        const r = computeLineDiff(snap.text, d.text, { oldLabel: `${d.name} (${snap.label} ${snap.timeLabel})`, newLabel: `${d.name} (current)` });
        if (r.identical) return void toast("Current file is identical to that snapshot.");
        docs.openView(`Diff: ${d.name} @ ${snap.timeLabel}`, r.diff, "diff");
      },
      onRestore: (d, snap) => {
        if (!d.editor) return;
        const curText = d.editor.getText();
        if (curText === snap.text) return void toast("Current file already matches that snapshot.");
        docs.snapshot(d, "Before restore");
        d.editor.apply({ from: 0, to: curText.length, insert: snap.text, selStart: 0, selEnd: 0 });
        d.editor.focus();
        toast(`Restored ${d.name} from snapshot (${snap.label}).`, { kind: "success" });
      },
    }),
  };
  const PANEL_NAMES = { files: "Files", search: "Search", git: "Git", outline: "Outline", todos: "Tasks", bookmarks: "Bookmarks", history: "History" };
  const panelHost = h("div", { class: "code-panel-host" });
  const sideButtons = Object.entries(PANEL_NAMES).map(([id, label]) => h("button", { type: "button", class: "code-side-tab", role: "tab", dataset: { panel: id }, title: { files: "The folder tree", search: "Find text in every file", git: "See which files changed (read only)", outline: "Functions and headings of this file", todos: "TODO, FIXME, BUG and NOTE comments across open files", bookmarks: "Lines you marked", history: "Local file timeline snapshots (diff and restore)" }[id], onclick: () => showPanel(id, true) }, label));
  const side = h("div", { class: "code-side" }, h("div", { class: "code-side-tabs", role: "tablist", "aria-label": "Side panels" }, sideButtons), panelHost);
  let panel = "files";

  function showPanel(name, focus = false) {
    panel = name;
    if (!settings().explorer) docs.setSetting("explorer", true);
    for (const b of sideButtons) { b.classList.toggle("active", b.dataset.panel === name); b.setAttribute("aria-selected", String(b.dataset.panel === name)); }
    panelHost.replaceChildren(panels[name].el);
    panels[name].show?.();
    if (name === "search" && focus) panels.search.focusWith(ed() ? ed().getText().slice(ed().getSelection().start, ed().getSelection().end).split("\n")[0].slice(0, 100) : "");
  }

  // -- the editor of each file ---------------------------------------------------------------------------------------

  function optionsFor(d) {
    const s = settings();
    const useTabs = d.indent.useTabs;
    return {
      lang: d.lang,
      wrap: s.wrap,
      lineNumbers: s.lineNumbers,
      minimap: s.minimap,
      stickyScroll: s.stickyScroll !== false,
      whitespace: s.whitespace,
      indentGuides: s.indentGuides !== false,
      ruler: s.ruler,
      wordHighlight: s.wordHighlight !== false,
      fontSize: s.fontSize,
      tabSize: useTabs ? Math.max(4, s.tabSize) : d.indent.size ?? s.tabSize,
      unit: actions.unitOf(d, s.tabSize),
      readOnly: d.readOnly,
    };
  }

  function updateLineChanges(d) {
    if (!d?.editor || d.kind === "diff") return;
    if (d.text.length > 300_000) {
      d.editor.setLineChanges(new Map());
      return;
    }
    d.editor.setLineChanges(computeGutterLineChanges(d.savedText ?? "", d.text ?? ""));
  }

  const refreshSoon = debounce(() => {
    const d = doc();
    if (d) {
      d.cachedSymbols = null;
      d.cachedTodos = null;
      updateLineChanges(d);
    }
    findBar.refresh();
    panels.outline.update?.();
    if (panel === "todos") panels.todos.update?.();
    if (panel === "history") panels.history.update?.();
    updateCrumbs();
    if (previewOn) updatePreview();
    if (splitEditorOn) updateSplitPane();
  }, 350);

  // Autosave: a timer that restarts on every keystroke, and an immediate pass when the user moves away.
  let autosaveTimer = null;
  let autosaving = false;
  async function autosaveNow() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    if (!settings().autosave || autosaving) return;
    autosaving = true;
    try {
      for (const d of docs.list().filter((x) => x.kind === "file" && x.path && isDirty(x) && !x.readOnly && !x.external)) {
        try {
          await docs.save(d, { auto: true });
        } catch (err) {
          d.external = err.code === "CHANGED_ON_DISK" ? "changed" : d.external;
          toast(`Autosave skipped for ${d.name}: ${err.message}`, { kind: "error" });
        }
      }
    } finally {
      autosaving = false;
    }
    afterMeta();
  }
  function autosaveSoon() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosaveNow, settings().autosaveDelay ?? 1500);
  }
  /** Saves right away when the user leaves the editor (another tab, panel or window), if they asked for that. */
  const autosaveOnLeave = () => { if (settings().autosave && settings().autosaveOnBlur !== false) autosaveNow(); };
  editors.addEventListener("focusout", (ev) => { if (!ev.relatedTarget || !editors.contains(ev.relatedTarget)) autosaveOnLeave(); });
  const onHidden = () => { if (document.hidden) autosaveOnLeave(); };
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("blur", autosaveOnLeave);

  function ensureEditor(d) {
    if (d.editor) return d.editor;
    const e = createEditor({
      onChange: () => {
        const was = isDirty(d);
        const before = d.lineCountBefore ?? e.lineCount;
        d.text = e.getText();
        d.lineCountBefore = e.lineCount;
        if (isDirty(d) !== was) renderTabsNow();
        if (e.lineCount !== before && d.bookmarks.length) syncBookmarks(d, e, e.lineCount - before);
        updateStatus();
        refreshSoon();
        if (settings().autosave) autosaveSoon();
        docs.persist();
      },
      onSelect: (s) => { d.line = s.line; d.col = s.col; d.sel = s; updateStatus(); updateCrumbs(); assist.caretMoved(d); },
      onClip: (text) => actions.rememberClip(text),
      onKey: (ev) => assist.keydown(d, ev),
      onBookmark: (line) => actions.bookmark("toggle", line),
      onScroll: ({ topLine, ratio }) => {
        if (d === doc() && previewOn && d.lang === "markdown") {
          mdController?.syncToEditor?.(topLine, ratio);
        }
      },
    });
    d.editor = e;
    e.setOptions(optionsFor(d));
    e.setText(d.text);
    d.lineCountBefore = e.lineCount;
    e.setBookmarks(d.bookmarks);
    updateLineChanges(d);
    assist.attach(d, e);
    e.el.hidden = true;
    editors.append(e.el);
    return e;
  }

  function syncBookmarks(d, e, delta) {
    const line = e.getText().slice(0, e.getSelection().start).split("\n").length;
    docs.setBookmarks(d, shiftBookmarks(d.bookmarks, delta > 0 ? line - delta : line, delta));
    e.setBookmarks(d.bookmarks);
  }

  function updateCrumbs() {
    const d = doc();
    crumbs.hidden = !d;
    if (!d) return;
    const items = [];
    const rel = d.path && explorer.root && d.path.startsWith(explorer.root + state.sep) ? d.path.slice(explorer.root.length + 1) : d.path || d.name;
    const parts = rel.split(/[\\/]/).filter(Boolean);
    parts.slice(-4).forEach((seg, idx, arr) => {
      if (idx > 0) items.push(h("span", { class: "code-crumb-sep", "aria-hidden": "true" }, "›"));
      items.push(h("button", {
        type: "button",
        class: "code-crumb-btn",
        title: d.path ? `Path: ${d.path} (click to copy path)` : d.name,
        onclick: () => (d.path ? actions.copyPath(d) : actions.quickOpen()),
      }, idx === arr.length - 1 ? `📄 ${seg}` : seg));
    });

    if (d.text.length < 300_000) {
      d.cachedSymbols ??= extractSymbols(d.text, d.lang);
      const activeSym = symbolAt(d.cachedSymbols, d.line || 1);
      if (activeSym) {
        items.push(h("span", { class: "code-crumb-sep", "aria-hidden": "true" }, "›"));
        items.push(h("button", {
          type: "button",
          class: "code-crumb-btn code-crumb-sym",
          title: `Current ${activeSym.kind}: ${activeSym.name} (line ${activeSym.line}). Click to jump to any symbol.`,
          onclick: () => actions.goToSymbol(),
        }, `ƒ ${activeSym.name}`));
      }
    }

    items.push(h("span", { class: "code-grow" }));

    if (d.kind !== "diff") {
      const diags = d.editor?.getDiagnostics?.() ?? [];
      if (diags.length > 0) {
        const first = diags[0];
        items.push(h("button", {
          type: "button",
          class: "code-crumb-pill code-crumb-diag",
          title: `${first.message} (line ${first.line}, col ${first.col}). Click to jump to syntax error.`,
          onclick: () => d.editor?.goTo(first.line, first.col),
        }, `⚠ ${diags.length} ${diags.length === 1 ? "error" : "errors"}`));
      }
    }

    if (d.kind !== "diff" && d.text.length < 300_000) {
      const curLineText = d.text.split("\n")[(d.line || 1) - 1] ?? "";
      const lineColors = findLineColors(curLineText);
      for (const c of lineColors.slice(0, 3)) {
        const dot = h("span", { class: "code-crumb-color-dot" });
        dot.style.backgroundColor = c.color;
        items.push(h("button", {
          type: "button",
          class: "code-crumb-pill code-crumb-color",
          title: `Color ${c.color} on line ${d.line || 1}. Click to open color picker.`,
          onclick: () => {
            if (d.editor) {
              const pos = d.editor.lineOffset(d.line || 1, c.from + 1);
              d.editor.setSelection(pos, pos + (c.to - c.from));
            }
            actions.inspectToken();
          },
        }, dot, c.color));
      }
    }

    if (d.sel?.wordCount > 1) {
      items.push(h("button", {
        type: "button",
        class: "code-crumb-pill",
        title: `"${d.sel.word}" appears ${d.sel.wordCount} times in this file. Click for next occurrence, or press F2 / Rename Symbol to rename all.`,
        onclick: () => actions.stepOccurrence(1),
      }, `${d.sel.word} · ${d.sel.wordCount}×`));
    }

    if (d.text.length < 300_000) {
      d.cachedTodos ??= extractTodos(d.text);
      if (d.cachedTodos.length) {
        items.push(h("button", {
          type: "button",
          class: "code-crumb-pill code-crumb-todo",
          title: `${d.cachedTodos.length} task ${d.cachedTodos.length === 1 ? "comment" : "comments"} (TODO/FIXME) in this file. Click to open the Tasks panel.`,
          onclick: () => showPanel("todos", true),
        }, `✓ ${d.cachedTodos.length} ${d.cachedTodos.length === 1 ? "task" : "tasks"}`));
      }
    }

    if (d.kind !== "diff") {
      items.push(h("button", {
        type: "button",
        class: "code-crumb-pill",
        title: "Inspect value or pick a color at the cursor (Alt+I)",
        onclick: () => actions.inspectToken(),
      }, "🔍 Inspect"));
    }

    crumbs.replaceChildren(...items);
  }

  function updateSplitPane() {
    const cur = doc();
    splitPane.hidden = !splitEditorOn || !cur;
    if (splitPane.hidden) return;
    const allDocs = docs.list();
    if (!allDocs.some((x) => x.id === splitDocId)) {
      const other = allDocs.find((x) => x !== cur && x.kind !== "diff") ?? cur;
      splitDocId = other ? other.id : 0;
    }
    splitSelect.replaceChildren(
      ...allDocs.map((x) => h("option", { value: String(x.id), selected: x.id === splitDocId ? "" : null }, x === cur ? `${x.name} (active)` : x.name)),
    );
    const target = docs.get(splitDocId) ?? cur;
    if (!target) {
      splitBody.replaceChildren(h("p", { class: "code-hint" }, "No open tab to display."));
      return;
    }
    renderSource(splitBody, target.text, target.lang);
  }

  function showActive() {
    const d = doc();
    for (const x of docs.list()) if (x.editor) x.editor.el.hidden = x !== d;
    editors.hidden = !d;
    welcome.hidden = !!d;
    if (!d) {
      renderWelcome(welcome, {
        recents: docs.session.recents,
        recentsEnabled: settings().recentsEnabled !== false,
        onNew: () => docs.newUntitled(),
        onQuickOpen: () => actions.quickOpen(),
        onOpen: (p) => open(p),
        onOpenByPath: () => actions.openByPath(),
        onRemoveRecent: (p) => docs.removeRecent(p),
        onClearRecents: () => actions.clearRecent(),
        onToggleRecents: (on) => actions.toggleRecent(on),
      });
    } else {
      const e = ensureEditor(d);
      e.el.hidden = false;
      e.layout();
      if (d.path) { explorer.setActive(d.path); explorer.reveal(d.path); }
      requestAnimationFrame(() => { if (!e.hasFocus() && root.contains(document.activeElement) === false) e.focus(); });
    }
    renderTabsNow();
    updateStatus();
    updateCrumbs();
    updateBanner();
    panels.outline.update?.();
    if (panel === "todos") panels.todos.update?.();
    if (panel === "bookmarks") panels.bookmarks.update?.();
    if (panel === "history") panels.history.update?.();
    updatePreview();
    updateSplitPane();
    findBar.refresh();
    runButtons.hidden = !d || d.kind === "diff";
  }

  function renderTabsNow() {
    renderTabs(tabStrip, docs.list(), docs.active?.id, {
      activate: (d) => { saveScroll(); docs.activate(d.id); },
      close: (d) => actions.closeTab(d),
      closeOthers: (d) => actions.closeDocs(docs.list().filter((x) => x !== d)),
      closeAll: () => actions.closeDocs([...docs.list()]),
      copyPath: (d) => actions.copyPath(d),
    });
  }

  function saveScroll() {
    const d = doc();
    if (d?.editor) d.scrollTop = d.editor.scrollTop;
  }

  function updateStatus() {
    const d = doc();
    const e = ed();
    const sel = d?.sel ?? { line: 1, col: 1, start: 0, end: 0 };
    status.setAutosave(Boolean(settings().autosave), Math.round((settings().autosaveDelay ?? 1500) / 100) / 10);
    status.update(d, sel, e && sel.end > sel.start && sel.end - sel.start < 2_000_000 ? e.getText().slice(sel.start, sel.end) : "");
  }

  function updateBanner() {
    const d = doc();
    const items = [];
    const act = (label, tip, run) => h("button", { type: "button", class: "btn code-small", title: tip, onclick: run }, label);
    if (d?.external === "changed") items.push(["This file was changed by another program. Your unsaved edits are kept.", act("Load the disk version", "Throw away your edits and read the file again", () => actions.revert(d)), act("Keep mine", "Hide this message; saving will ask what to do", () => { d.external = ""; afterMeta(); })]);
    else if (d?.external === "deleted") items.push(["This file was deleted or moved by another program.", act("Save it again", "Write your text back to the same place", () => actions.save(d)), act("Save as…", "Save your text somewhere else", () => actions.saveAs(d))]);
    else if (d?.truncated) items.push([`This file is bigger than 5 MB. Only the first part is shown, and it can't be edited or saved here.`]);
    else if (d?.symlink && d.kind === "file") items.push(["This is a link to another file. You can edit the text, but saving over a link isn't allowed: use Save as… for a copy."]);
    else if (d?.kind === "file" && !d.writable) items.push(["This file is read-only on disk. Use Save as… to make an editable copy."]);
    else if (d?.guessed) items.push([`This file isn't valid UTF-8, so it's shown as Latin-1.`, act("Reopen as UTF-8", "Read the file again as UTF-8 (unreadable characters will show as ?)", () => docs.reload(d, "utf-8"))]);
    else if (d?.mixedEol) items.push([`This file mixes line endings. Saving will make every line end with ${d.eol === "crlf" ? "CRLF" : d.eol === "cr" ? "CR" : "LF"}.`]);
    banner.hidden = !items.length;
    banner.replaceChildren(...(items[0] ? [h("span", {}, items[0][0]), ...items[0].slice(1)] : []));
  }

  const afterMeta = () => {
    const d = doc();
    if (d) updateLineChanges(d);
    if (panel === "history") panels.history.update?.();
    renderTabsNow();
    updateStatus();
    updateCrumbs();
    updateBanner();
  };

  // -- preview -----------------------------------------------------------------------------------------------------

  const slugifyHeading = slugifyMarkdownHeading;

  function resolveLocalImageSrc(d, rawSrc) {
    const s = String(rawSrc ?? "").trim();
    if (!s || (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^file:\/\//i.test(s) && !/^[A-Za-z]:[\\/]/.test(s))) return "";
    let clean = s.split("#")[0].split("?")[0];
    try { clean = decodeURIComponent(clean); } catch {}
    if (/^file:\/\//i.test(clean)) {
      try { clean = decodeURIComponent(new URL(clean).pathname); } catch { return ""; }
    }
    const sep = state.sep || "/";
    const baseDir = d?.path
      ? d.path.slice(0, Math.max(d.path.lastIndexOf("/"), d.path.lastIndexOf("\\"))) || d.path
      : explorer.root || (state.location.kind === "folder" && state.location.path) || state.home || "";
    const isAbs = clean.startsWith("/") || /^[A-Za-z]:[\\/]/.test(clean);
    const joined = isAbs ? clean : `${baseDir}${sep}${clean}`;
    const driveMatch = /^[A-Za-z]:/.exec(joined);
    const prefix = driveMatch ? driveMatch[0] : joined.startsWith("/") ? "" : "";
    const parts = joined.slice(prefix.length).split(/[\\/]+/);
    const norm = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") norm.pop();
      else norm.push(part);
    }
    const resolved = prefix ? `${prefix}${sep}${norm.join(sep)}` : `${sep}${norm.join(sep)}`;
    return rawUrl(resolved);
  }

  function jumpToHeadingInDoc(targetDoc, rawFrag) {
    const lineMatch = /^L(\d+)(?:C(\d+))?(?:-L?\d+)?$/i.exec(rawFrag);
    if (lineMatch) {
      targetDoc?.editor?.goTo(Number(lineMatch[1]), Number(lineMatch[2] || 1));
      return true;
    }
    const wanted = slugifyHeading(rawFrag);
    if (!wanted) return false;
    let found = false;
    if (targetDoc === doc() && !preview.hidden) {
      const headingEl = [...previewBody.querySelectorAll("h1, h2, h3, h4, h5, h6")].find(
        (el) => el.dataset.slug === wanted || slugifyHeading(el.textContent) === wanted || el.textContent.trim().toLowerCase() === rawFrag.toLowerCase(),
      );
      if (headingEl) {
        headingEl.scrollIntoView?.({ behavior: "smooth", block: "start" });
        found = true;
      }
    }
    if (targetDoc) {
      const sym = extractSymbols(targetDoc.text, targetDoc.lang).find(
        (s) => slugifyHeading(s.name) === wanted || s.name.trim().toLowerCase() === rawFrag.toLowerCase(),
      );
      if (sym) {
        targetDoc.editor?.goTo(sym.line, 1);
        found = true;
      }
    }
    return found;
  }

  async function openMarkdownLink(rawHref) {
    const href = String(rawHref ?? "").trim();
    if (!href) return;
    if (/^(?:https?:\/\/|\/\/|www\.[^\s/]+\.[^\s]+)/i.test(href)) {
      const url = href.startsWith("//") ? `https:${href}` : /^www\./i.test(href) ? `https://${href}` : href;
      try {
        await call("link/open", { url });
      } catch (err) {
        toast(err?.message || "Couldn't open that web address.", { kind: "error" });
      }
      return;
    }
    if (href.startsWith("#")) {
      let frag = href.slice(1);
      try { frag = decodeURIComponent(frag); } catch {}
      if (!jumpToHeadingInDoc(doc(), frag.trim())) {
        toast(`Heading "${frag}" wasn't found in this document.`);
      }
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^file:\/\//i.test(href) && !/^[A-Za-z]:[\\/]/.test(href)) {
      const addr = href.replace(/^mailto:/i, "");
      call("copytext", { text: addr })
        .then(() => toast(`Copied "${addr}" to the clipboard.`))
        .catch(() => toast(`Link: ${href}`));
      return;
    }
    let pathPart = href;
    let frag = "";
    if (!/^file:\/\//i.test(pathPart)) {
      const hashIdx = pathPart.indexOf("#");
      if (hashIdx >= 0) {
        frag = pathPart.slice(hashIdx + 1);
        pathPart = pathPart.slice(0, hashIdx);
      }
    } else {
      try {
        const u = new URL(pathPart);
        if (u.hash) frag = u.hash.slice(1);
        pathPart = `${u.protocol}//${u.host}${u.pathname}`;
      } catch {}
    }
    try { frag = decodeURIComponent(frag); } catch {}
    let line = 1;
    let col = 1;
    const lineSuffix = !/^file:\/\//i.test(pathPart) ? /:(\d+)(?::(\d+))?$/.exec(pathPart) : null;
    if (lineSuffix) {
      line = Number(lineSuffix[1]) || 1;
      col = Number(lineSuffix[2]) || 1;
      pathPart = pathPart.slice(0, lineSuffix.index);
    } else if (/^L(\d+)(?:C(\d+))?/i.test(frag)) {
      const m = /^L(\d+)(?:C(\d+))?/i.exec(frag);
      line = Number(m[1]) || 1;
      col = Number(m[2]) || 1;
      frag = "";
    }
    if (!/^file:\/\//i.test(pathPart)) {
      try { pathPart = decodeURIComponent(pathPart); } catch {}
    }
    const d = doc();
    const baseDir = d?.path
      ? d.path.slice(0, Math.max(d.path.lastIndexOf("/"), d.path.lastIndexOf("\\"))) || d.path
      : explorer.root || (state.location.kind === "folder" && state.location.path) || state.home;
    try {
      const resolved = await call("typedpath", { text: pathPart || d?.path || "", cwd: baseDir });
      if (!resolved.exists) {
        toast(`Linked file not found: ${pathPart}`, { kind: "error" });
        return;
      }
      if (resolved.isDir) {
        await explorer.setRoot(resolved.path);
        showPanel("files");
        return;
      }
      await open(resolved.path, line, col);
      if (frag) jumpToHeadingInDoc(doc(), frag);
    } catch (err) {
      toast(err?.message || "Couldn't open that linked file.", { kind: "error" });
    }
  }

  function setPreviewWidth(nextPct) {
    previewWidth = Math.max(15, Math.min(85, Math.round(Number(nextPct) || 45)));
    preview.style.flexBasis = `${previewWidth}%`;
    preview.dataset.width = String(previewWidth);
    previewResizer.setAttribute("aria-valuenow", String(previewWidth));
    splitSlider.value = String(previewWidth);
    splitVal.textContent = `${previewWidth}%`;
    ed()?.layout();
  }

  function updatePreview() {
    const d = doc();
    zenPreview.setAttribute("aria-pressed", String(previewOn));
    preview.hidden = !previewOn || !d;
    previewResizer.hidden = preview.hidden;
    mdController = null;
    if (preview.hidden) return;
    previewExtra.replaceChildren();
    if (d.lang === "markdown") {
      previewTitle.textContent = "Markdown preview";
      mdController = renderMarkdown(previewBody, d.text, {
        onOpenLink: openMarkdownLink,
        onGoLine: (l, c) => ed()?.goTo(l, c),
        resolveImageSrc: (src) => resolveLocalImageSrc(d, src),
        mode: d.mdPreviewMode || "preview",
        onModeChange: (m) => { d.mdPreviewMode = m; },
        syncScroll: d.mdSyncScroll !== false,
        onSyncScrollChange: (on) => { d.mdSyncScroll = on; },
      });
    } else if (/\.ipynb$/i.test(d.name)) {
      previewTitle.textContent = "Jupyter Notebook preview";
      renderNotebookPreview(previewBody, d.text);
    } else if (/\.(jsonl|ndjson)$/i.test(d.name)) {
      previewTitle.textContent = "JSON Lines Explorer";
      renderStructuredDataPreview(previewBody, d.text, "jsonl");
    } else if (d.lang === "json") {
      previewTitle.textContent = "JSON Tree Explorer";
      renderJsonPreview(previewBody, d.text, { onGoLine: (l, c) => ed()?.goTo(l, c) });
      previewExtra.append(
        h("button", { type: "button", class: "btn code-small", title: "Sort all object keys alphabetically", onclick: () => commands.run("sortJson") }, "Sort keys A–Z"),
        h("button", { type: "button", class: "btn code-small", title: "Format JSON with indentation", onclick: () => commands.run("format") }, "Prettify"),
      );
    } else if (d.lang === "yaml" || /\.(ya?ml)$/i.test(d.name)) {
      previewTitle.textContent = "YAML Tree Explorer";
      renderStructuredDataPreview(previewBody, d.text, "yaml");
    } else if (d.lang === "toml" || /\.toml$/i.test(d.name)) {
      previewTitle.textContent = "TOML Tree Explorer";
      renderStructuredDataPreview(previewBody, d.text, "toml");
    } else if (d.lang === "ini" || /\.(ini|cfg|conf|env|properties)$/i.test(d.name) || /^\.env(\..+)?$/i.test(d.name)) {
      previewTitle.textContent = "Config / Env Explorer";
      renderStructuredDataPreview(previewBody, d.text, "ini");
    } else if (/\.(csv|tsv)$/i.test(d.name)) {
      previewTitle.textContent = "Table preview";
      renderCsvPreview(previewBody, d.text);
      previewExtra.append(h("button", { type: "button", class: "btn code-small", title: "Convert this CSV/TSV into a formatted Markdown table", onclick: () => commands.run("csvToMd") }, "To Markdown table"));
    } else if (d.lang === "html" || d.lang === "xml") {
      previewTitle.textContent = /\.svg$/i.test(d.name) ? "SVG preview & source" : "HTML source (colored)";
      renderSource(previewBody, d.text, d.lang);
      if (/\.svg$/i.test(d.name) && d.path) {
        previewBody.prepend(h("div", { class: "code-pv-card" }, createZoomableImage(rawUrl(d.path), `Preview of ${d.name}`, `Picture: ${d.name}`, d.name)));
      }
      previewExtra.append(h("button", { type: "button", class: "btn code-small", disabled: !d.path, title: "Open this file in your web browser. Save first to see your latest changes.", onclick: () => (isDirty(d) ? toast("Save the file first so the browser shows your latest changes.") : call("open", { path: d.path }).catch((e) => toast(e.message, { kind: "error" }))) }, "Open in browser"));
    } else {
      previewTitle.textContent = "Live Inspector";
      renderCodeInspectorPreview(previewBody, d, { onGoLine: (l, c) => ed()?.goTo(l, c), onOpenDiff: () => commands.run("diffSaved") });
    }
  }

  // -- settings ----------------------------------------------------------------------------------------------------

  function applySettings() {
    const s = settings();
    root.className = root.className.replace(/\bcode-theme-\w+/g, "").trim();
    if (s.theme !== "auto") root.classList.add(`code-theme-${s.theme}`);
    root.classList.toggle("code-no-side", !s.explorer || zen);
    previewOn = s.preview === true;
    updatePreview();
    explorer.setShowHidden(s.showHidden);
    for (const d of docs.list()) d.editor?.setOptions(optionsFor(d));
    for (const b of themeButtons) b.setAttribute("aria-pressed", String(b.dataset.theme === s.theme));
  }
  const setSetting = (k, v) => docs.setSetting(k, v);

  // -- the commands ------------------------------------------------------------------------------------------------

  const app = {
    ed, doc, docs, toast, findBar, ...actions,
    get settings() { return settings(); },
    unit: () => actions.unitOf(doc(), settings().tabSize),
    setSetting,
    applyResult(r) {
      const e = ed();
      if (!r || !e) return;
      if (r.from !== undefined) e.apply(r);
      if (r.message) toast(r.message);
    },
    newFile: () => docs.newUntitled(),
    undo(redo) { ed()?.focus(); document.execCommand(redo ? "redo" : "undo"); },
    find: (replace) => ed() && findBar.open({ replace }),
    showPanel,
    toggleZen() {
      zen = !zen;
      root.classList.toggle("code-zen", zen);
      applySettings();
      ed()?.layout();
      if (zen) toast(`Zen mode: press Esc, ${shortcutText("zen", state.platform)} or the “Leave zen mode” button to come back.`, { timeout: 5000 });
      else ed()?.focus();
    },
    isZen: () => zen,
    toggleSide() { setSetting("explorer", !settings().explorer); },
    togglePreview() { setSetting("preview", !previewOn); },
    isPreview: () => previewOn,
    toggleSplitEditor() {
      splitEditorOn = !splitEditorOn;
      updateSplitPane();
      ed()?.layout();
    },
    isSplitEditor: () => splitEditorOn,
    regexSandbox: () => openRegexSandbox(ed() ? ed().getText().slice(0, 5000) : ""),
    convertText: () => openPalette({ title: "Convert text", placeholder: "Type what you want, for example base64, snake, accents, links", empty: "No conversion matches.", items: TRANSFORMS.map((t) => ({ label: t.label, detail: `${t.group} · ${t.tip}`, value: t.id })), onPick: (id) => commands.run(`tx:${id}`) }),
    shortcuts: () => openShortcutsHelp(commands.list.filter((c) => !c.hidden).map((c) => ({ group: c.group, label: c.label, shortcut: c.shortcut }))),
    palette: () => openPalette({ title: "Command palette", placeholder: "Type a command", empty: "No command matches.", items: commands.list.filter((c) => !c.hidden).map((c) => ({ label: c.label, detail: c.group, hint: c.shortcut, value: c.id })), onPick: (id) => commands.run(id) }),
    suggest: () => assist.suggest(doc()),
    runDefault: (kind) => runUi.runDefault(doc(), kind),
    openPresets: () => runUi.openPresets(doc()),
    closeOthers: () => actions.closeDocs(docs.list().filter((x) => x !== doc())),
    closeAll: () => actions.closeDocs([...docs.list()]),
  };
  const commands = createCommands(app);

  const menuButton = (name, ids) => h("button", { type: "button", class: "code-menu-btn", "aria-haspopup": "menu", title: `${name} menu`, onclick: (e) => showMenu(commands.menu(ids), { anchor: e.currentTarget, label: `${name} menu` }) }, name);
  const themeButtons = THEME_CHOICES.map(([id, label]) => h("button", { type: "button", class: "code-theme-btn", dataset: { theme: id }, "aria-pressed": "false", title: `Editor colors: ${label}`, onclick: () => setSetting("theme", id) }, label.split(" (")[0].replace("Follow the File Manager", "Auto")));
  const quick = (label, tip, run, extra = {}) => h("button", { type: "button", class: "code-btn", title: tip, "aria-label": tip, onclick: run, ...extra }, label);
  const runMain = quick("▶ Run", "Run this file: sends its default Run command to the Terminal and presses Enter (Ctrl/Cmd+Enter)", () => commands.run("run"));
  const runMore = quick("▾", "Choose a Run or Build preset, or edit the presets of this file", (e) => runUi.presetMenu(doc(), e.currentTarget));
  const buildBtn = quick("🔨 Build", "Build: sends this file's Build command to the Terminal and presses Enter (Ctrl/Cmd+B)", () => commands.run("build"));
  const runButtons = h("span", { class: "code-run-group", hidden: true }, runMain, runMore, buildBtn, quick("Presets…", "Add, edit and choose the commands saved for this file", () => commands.run("presets")));
  const themeMenu = h("button", { type: "button", class: "code-menu-btn", "aria-haspopup": "menu", title: "Choose the editor colors", onclick: (e) => showMenu(THEME_CHOICES.map(([id, label]) => ({ label, checked: settings().theme === id, action: () => setSetting("theme", id) })), { anchor: e.currentTarget, label: "Editor colors" }) }, "Colors");
  const toolbar = h("div", { class: "code-toolbar", role: "toolbar", "aria-label": "Editor commands" },
    ...Object.entries(MENUS).map(([name, ids]) => menuButton(name, ids)), themeMenu,
    h("span", { class: "code-sep" }),
    quick("💾 Save", "Save this file (Ctrl/Cmd+S)", () => commands.run("save")),
    quick("🔎 Find", "Find in this file (Ctrl/Cmd+F)", () => commands.run("find")),
    quick("✨ Format", "Format / prettify the whole file (Alt+Shift+F). Minify is in the Tools menu.", () => commands.run("format")),
    quick("🔤 Convert", "Change the case, clean up, encode or extract: about seventy text conversions for the selection or the whole file", () => commands.run("convertText")),
    quick("🧩 Snippet", "Insert a code snippet or generated value (Alt+S)", () => commands.run("insertSnippet")),
    runButtons,
    h("span", { class: "code-grow" }),
    quick("🗺 Minimap", "Show or hide the code minimap (Alt+M)", () => commands.run("minimap")),
    quick("◫ Split", "Show or hide the side-by-side split editor pane", () => commands.run("splitEditor")),
    quick("👁 Preview", "Show a preview or Live Code Inspector next to the text (Markdown, JSON, CSV, HTML & code)", () => commands.run("preview")),
    quick("⛶ Zen", "Hide everything except the text (press again to come back)", () => commands.run("zen")));

  const work = h("div", { class: "code-work" }, editors, welcome, splitPane, previewResizer, preview);
  previewResizer.addEventListener("mousedown", (startEv) => {
    if (startEv.button !== 0) return;
    startEv.preventDefault();
    previewResizer.classList.add("is-dragging");
    const startX = startEv.clientX;
    const startWidth = previewWidth;
    const onMove = (moveEv) => {
      const rect = work.getBoundingClientRect();
      if (rect.width > 0) {
        const pct = ((rect.right - moveEv.clientX) / rect.width) * 100;
        setPreviewWidth(pct);
      } else {
        const deltaPct = ((startX - moveEv.clientX) / 800) * 100;
        setPreviewWidth(startWidth + deltaPct);
      }
    };
    const onUp = () => {
      previewResizer.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  previewResizer.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 1 : 5;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPreviewWidth(previewWidth + step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPreviewWidth(previewWidth - step);
    } else if (e.key === "Home") {
      e.preventDefault();
      setPreviewWidth(75);
    } else if (e.key === "End") {
      e.preventDefault();
      setPreviewWidth(25);
    } else if (e.key === "0" || e.key === "Enter") {
      e.preventDefault();
      setPreviewWidth(45);
    }
  });
  const center = h("div", { class: "code-center" }, tabStrip, crumbs, banner, findBar.el, work, status.el);
  // Zen mode hides the toolbar (and its Zen button), so it needs a way out that stays in sight.
  const zenExit = h("button", { type: "button", class: "code-zen-exit", title: `Leave zen mode (Esc or ${shortcutText("zen", state.platform)})`, "aria-label": "Leave zen mode", onclick: () => commands.run("zen") }, "✕ Leave zen mode");
  const zenBar = h("div", { class: "code-zen-bar" }, zenPreview, zenExit);
  root.append(toolbar, h("div", { class: "code-main" }, side, center), zenBar);
  wireTabKeys(tabStrip, (id) => { saveScroll(); docs.activate(id); });

  root.addEventListener("keydown", (e) => {
    e.stopPropagation(); // typing here must never reach the File Manager's own shortcuts (Delete, Ctrl+D ...)
    if (e.defaultPrevented || e.isComposing) return;
    // Esc leaves zen mode when nothing else (a menu, the completion list, the find bar) used it first.
    if (zen && e.key === "Escape" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); commands.run("zen"); return; }
    keysOf("code.save"); // brings the key table up to date with Settings
    const id = commandForEvent(e, state.platform);
    if (id && commands.run(id)) e.preventDefault();
  });
  window.addEventListener("beforeunload", (e) => { if (docs.anyDirty()) { e.preventDefault(); e.returnValue = ""; } });

  const visible = () => powerIsOpen() && activePowerTab() === "code";
  // Esc also leaves zen mode when the keyboard focus is outside the editor (after clicking a button, say). Without this the
  // key would reach the File Manager and close the whole Tools view while the editor stayed in zen mode.
  document.addEventListener("keydown", (e) => {
    if (!zen || e.key !== "Escape" || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (root.contains(e.target) || !visible() || document.querySelector(".modal-backdrop, .menu")) return;
    e.preventDefault();
    e.stopPropagation();
    commands.run("zen");
  }, true);
  async function checkDisk() {
    if (!visible() || !docs.list().length) return;
    const r = await docs.checkExternal();
    if (r.reloaded.length) toast(`${r.reloaded.map((d) => d.name).join(", ")} changed on disk and was updated here.`);
    if (r.changed.length || r.deleted.length) afterMeta();
  }
  window.addEventListener("focus", checkDisk);

  docs.subscribe((kind) => {
    if (kind === "tabs" || kind === "active") showActive();
    else if (kind === "recents") { if (!doc()) showActive(); }
    else if (kind === "goto") { showActive(); const d = doc(); if (d?.editor) d.editor.goTo(d.line, d.col); }
    else if (kind === "reload") { for (const d of docs.list()) if (d.editor && d.editor.getText() !== d.text) { d.editor.setText(d.text); d.editor.setOptions(optionsFor(d)); updateLineChanges(d); assist.reset(d); } afterMeta(); updatePreview(); updateSplitPane(); }
    else if (kind === "saved" || kind === "meta") { afterMeta(); if (kind === "saved") findBar.refresh(); }
    else if (kind === "settings") { applySettings(); updateStatus(); ed()?.layout(); if (!doc()) showActive(); }
    else if (kind === "bookmarks") { panels.bookmarks.update?.(); }
  });

  async function start() {
    started = true;
    await docs.loadSession();
    explorer.setShowHidden(settings().showHidden);
    applySettings();
    await explorer.setRoot(docs.session.root || (state.location.kind === "folder" && state.location.path) || state.home, true);
    showPanel("files");
    await docs.restoreTabs();
    for (const d of docs.list()) if (d.editor && d.scrollTop) d.editor.scrollTop = d.scrollTop;
    showActive();
  }

  return {
    async show(opts) {
      try {
        if (!started) await start();
        else if (!explorer.root) await explorer.setRoot((state.location.kind === "folder" && state.location.path) || state.home, true);
        if (opts?.folder) {
          await explorer.setRoot(opts.folder);
          showPanel("files");
        }
        if (opts?.open) await open(opts.open, Number.isInteger(opts.line) && opts.line > 0 ? opts.line : 1);
      } catch (err) {
        toast(err?.message || "The code editor couldn't start.", { kind: "error" });
      }
      ed()?.layout();
      ed()?.focus();
      checkDisk();
    },
    hide() {
      saveScroll();
      docs.persistNow();
    },
  };
}

registerPowerTab({ id: "code", label: "Code", icon: "📝", tip: "A code editor: tabs, find and replace, formatting, Git changes, and Run and Build presets that use the Terminal", mount });
