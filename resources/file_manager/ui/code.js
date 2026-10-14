// The "Code" tab of the Power tools: a code editor inside the File Manager. This file builds the layout and joins the
// parts together (documents, editors, Explorer and panels, find bar, status bar, menus, keyboard, session).
// Other modules: codeEditor (the text area), codeDocs (open files), codeActions (save, close, rename ...),
// codeCommands (every command), codeRunUi (Run and Build presets), codeLogic (the pure logic, unit-tested).
import { call } from "./api.js";
import { debounce, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { registerOpener } from "./openwith.js";
import { activePowerTab, openPower, powerIsOpen, registerPowerTab } from "./power.js";
import { state } from "./state.js";
import { commandForEvent, shiftBookmarks } from "./codeLogic.js";
import { createActions } from "./codeActions.js";
import { createAssist } from "./codeAssist.js";
import { THEME_CHOICES, createCommands } from "./codeCommands.js";
import { openPalette, openRegexSandbox, openShortcutsHelp } from "./codeDialogs.js";
import { createDocs, isDirty } from "./codeDocs.js";
import { createEditor } from "./codeEditor.js";
import { createExplorer } from "./codeExplorer.js";
import { createFindBar } from "./codeFindBar.js";
import { createBookmarksPanel, createGitPanel, createOutlinePanel, createSearchPanel } from "./codePanels.js";
import { renderMarkdown, renderSource } from "./codePreview.js";
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
  File: ["newFile", "quickOpen", "openPath", "recent", "-", "save", "saveAs", "saveAll", "revert", "-", "rename", "deleteFile", "copyPath", "-", "closeTab", "closeOthers", "closeAll"],
  Edit: ["undo", "redo", "-", "find", "replace", "findNext", "findPrev", "findInFiles", "-", "goToLine", "goToSymbol", "-", "complete", "selectAll", "clipboard"],
  Selection: ["toggleComment", "blockComment", "-", "indent", "outdent", "-", "selectLine", "selectWord", "-", "deleteLine", "duplicate", "duplicateUp", "moveUp", "moveDown", "joinLines"],
  Tools: ["sortAsc", "sortDesc", "sortNumeric", "reverseLines", "dedupe", "-", "trim", "finalNewline", "tabsToSpaces", "spacesToTabs", "-", "upper", "lower", "title", "camel", "snake", "kebab", "-", "urlEncode", "urlDecode", "-", "format", "minify", "-", "regexSandbox"],
  Go: ["bookmarkToggle", "bookmarkNext", "bookmarkPrev", "bookmarkClear", "-", "goToLine", "goToSymbol", "quickOpen"],
  View: ["wrap", "lineNumbers", "-", "zoomIn", "zoomOut", "zoomReset", "-", "zen", "explorer", "preview", "-", "panelFiles", "panelGit", "panelOutline", "panelBookmarks", "-", "completion", "autoOpen", "autosave", "autosaveOptions", "-", "shortcuts", "palette"],
};

function mount(root) {
  root.classList.add("code-root");
  const settings = () => docs.settings;
  const doc = () => docs.active;
  const ed = () => doc()?.editor ?? null;
  let started = false;
  let zen = false;
  let previewOn = false;

  const editors = h("div", { class: "code-editors" });
  const welcome = h("div", { class: "code-welcome" });
  const tabStrip = h("div", { class: "code-tabs", role: "tablist", "aria-label": "Open files" });
  const banner = h("div", { class: "code-banner", role: "status", hidden: true });
  const previewBody = h("div", { class: "code-preview-body" });
  const previewTitle = h("strong", {}, "Preview");
  const previewExtra = h("span", {});
  const preview = h("aside", { class: "code-preview-pane", "aria-label": "Preview", hidden: true }, h("div", { class: "code-preview-head" }, previewTitle, previewExtra), previewBody);
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
    setLanguage(d, id) { d.lang = id; d.langPinned = true; if (id === "v" && d.indent.size === null) d.indent = { useTabs: true, size: null }; d.editor?.setOptions(optionsFor(d)); assist.reset(d); afterMeta(); },
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
    bookmarks: createBookmarksPanel({ getDocs: () => docs.list(), onGo: async (d, line) => { docs.activate(d.id); d.editor?.goTo(line); }, onClear: () => docs.list().forEach((d) => { docs.setBookmarks(d, []); d.editor?.setBookmarks([]); }) }),
  };
  const PANEL_NAMES = { files: "Files", search: "Search", git: "Git", outline: "Outline", bookmarks: "Bookmarks" };
  const panelHost = h("div", { class: "code-panel-host" });
  const sideButtons = Object.entries(PANEL_NAMES).map(([id, label]) => h("button", { type: "button", class: "code-side-tab", role: "tab", dataset: { panel: id }, title: { files: "The folder tree", search: "Find text in every file", git: "See which files changed (read only)", outline: "Functions and headings of this file", bookmarks: "Lines you marked" }[id], onclick: () => showPanel(id, true) }, label));
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
    return { lang: d.lang, wrap: s.wrap, lineNumbers: s.lineNumbers, fontSize: s.fontSize, tabSize: useTabs ? Math.max(4, s.tabSize) : d.indent.size ?? s.tabSize, unit: actions.unitOf(d, s.tabSize), readOnly: d.readOnly };
  }

  const refreshSoon = debounce(() => { findBar.refresh(); panels.outline.update?.(); if (previewOn) updatePreview(); }, 350);
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
          await docs.save(d);
          d.autoSavedText = d.savedText;
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
      onSelect: (s) => { d.line = s.line; d.col = s.col; d.sel = s; updateStatus(); assist.caretMoved(d); },
      onClip: (text) => actions.rememberClip(text),
      onKey: (ev) => assist.keydown(d, ev),
    });
    d.editor = e;
    e.setOptions(optionsFor(d));
    e.setText(d.text);
    d.lineCountBefore = e.lineCount;
    e.setBookmarks(d.bookmarks);
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

  function showActive() {
    const d = doc();
    for (const x of docs.list()) if (x.editor) x.editor.el.hidden = x !== d;
    editors.hidden = !d;
    welcome.hidden = !!d;
    if (!d) {
      renderWelcome(welcome, { recents: docs.session.recents, onNew: () => docs.newUntitled(), onQuickOpen: () => actions.quickOpen(), onOpen: (p) => open(p), onOpenByPath: () => actions.openByPath() });
    } else {
      const e = ensureEditor(d);
      e.el.hidden = false;
      e.layout();
      if (d.path) { explorer.setActive(d.path); explorer.reveal(d.path); }
      requestAnimationFrame(() => { if (!e.hasFocus() && root.contains(document.activeElement) === false) e.focus(); });
    }
    renderTabsNow();
    updateStatus();
    updateBanner();
    panels.outline.update?.();
    if (panel === "bookmarks") panels.bookmarks.update?.();
    updatePreview();
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

  const afterMeta = () => { renderTabsNow(); updateStatus(); updateBanner(); };

  // -- preview -----------------------------------------------------------------------------------------------------

  function updatePreview() {
    const d = doc();
    preview.hidden = !previewOn || !d;
    if (preview.hidden) return;
    previewExtra.replaceChildren();
    if (d.lang === "markdown") {
      previewTitle.textContent = "Preview";
      renderMarkdown(previewBody, d.text);
    } else if (d.lang === "html" || d.lang === "xml") {
      previewTitle.textContent = "HTML source (coloured)";
      renderSource(previewBody, d.text, d.lang);
      previewExtra.append(h("button", { type: "button", class: "btn code-small", disabled: !d.path, title: "Open this file in your web browser. Save first to see your latest changes.", onclick: () => (isDirty(d) ? toast("Save the file first so the browser shows your latest changes.") : call("open", { path: d.path }).catch((e) => toast(e.message, { kind: "error" }))) }, "Open in browser"));
    } else {
      previewTitle.textContent = "Preview";
      previewBody.replaceChildren(h("p", { class: "code-hint" }, "A preview is available for Markdown and HTML files."));
    }
  }

  // -- settings ----------------------------------------------------------------------------------------------------

  function applySettings() {
    const s = settings();
    root.className = root.className.replace(/\bcode-theme-\w+/g, "").trim();
    if (s.theme !== "auto") root.classList.add(`code-theme-${s.theme}`);
    root.classList.toggle("code-no-side", !s.explorer || zen);
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
    toggleZen() { zen = !zen; root.classList.toggle("code-zen", zen); applySettings(); ed()?.layout(); },
    isZen: () => zen,
    toggleSide() { setSetting("explorer", !settings().explorer); },
    togglePreview() { previewOn = !previewOn; updatePreview(); },
    isPreview: () => previewOn,
    regexSandbox: () => openRegexSandbox(ed() ? ed().getText().slice(0, 5000) : ""),
    shortcuts: () => openShortcutsHelp(commands.list.map((c) => ({ group: c.group, label: c.label, shortcut: c.shortcut }))),
    palette: () => openPalette({ title: "Command palette", placeholder: "Type a command", empty: "No command matches.", items: commands.list.map((c) => ({ label: c.label, detail: c.group, hint: c.shortcut, value: c.id })), onPick: (id) => commands.run(id) }),
    suggest: () => assist.suggest(doc()),
    runDefault: (kind) => runUi.runDefault(doc(), kind),
    openPresets: () => runUi.openPresets(doc()),
    closeOthers: () => actions.closeDocs(docs.list().filter((x) => x !== doc())),
    closeAll: () => actions.closeDocs([...docs.list()]),
  };
  const commands = createCommands(app);

  const menuButton = (name, ids) => h("button", { type: "button", class: "code-menu-btn", "aria-haspopup": "menu", title: `${name} menu`, onclick: (e) => showMenu(commands.menu(ids), { anchor: e.currentTarget, label: `${name} menu` }) }, name);
  const themeButtons = THEME_CHOICES.map(([id, label]) => h("button", { type: "button", class: "code-theme-btn", dataset: { theme: id }, "aria-pressed": "false", title: `Editor colours: ${label}`, onclick: () => setSetting("theme", id) }, label.split(" (")[0].replace("Follow the File Manager", "Auto")));
  const quick = (label, tip, run, extra = {}) => h("button", { type: "button", class: "code-btn", title: tip, "aria-label": tip, onclick: run, ...extra }, label);
  const runMain = quick("▶ Run", "Run this file: sends its default Run command to the Terminal and presses Enter (Ctrl/Cmd+Enter)", () => commands.run("run"));
  const runMore = quick("▾", "Choose a Run or Build preset, or edit the presets of this file", (e) => runUi.presetMenu(doc(), e.currentTarget));
  const buildBtn = quick("🔨 Build", "Build: sends this file's Build command to the Terminal and presses Enter (Ctrl/Cmd+B)", () => commands.run("build"));
  const runButtons = h("span", { class: "code-run-group", hidden: true }, runMain, runMore, buildBtn, quick("Presets…", "Add, edit and choose the commands saved for this file", () => commands.run("presets")));
  const themeMenu = h("button", { type: "button", class: "code-menu-btn", "aria-haspopup": "menu", title: "Choose the editor colours", onclick: (e) => showMenu(THEME_CHOICES.map(([id, label]) => ({ label, checked: settings().theme === id, action: () => setSetting("theme", id) })), { anchor: e.currentTarget, label: "Editor colours" }) }, "Colours");
  const toolbar = h("div", { class: "code-toolbar", role: "toolbar", "aria-label": "Editor commands" },
    ...Object.entries(MENUS).map(([name, ids]) => menuButton(name, ids)), themeMenu,
    h("span", { class: "code-sep" }),
    quick("💾 Save", "Save this file (Ctrl/Cmd+S)", () => commands.run("save")), quick("🔎 Find", "Find in this file (Ctrl/Cmd+F)", () => commands.run("find")),
    runButtons,
    h("span", { class: "code-grow" }),
    quick("👁 Preview", "Show a preview next to the text (Markdown and HTML)", () => commands.run("preview")), quick("⛶ Zen", "Hide everything except the text (press again to come back)", () => commands.run("zen")));

  const centre = h("div", { class: "code-centre" }, tabStrip, banner, findBar.el, h("div", { class: "code-work" }, editors, welcome, preview), status.el);
  root.append(toolbar, h("div", { class: "code-main" }, side, centre));
  wireTabKeys(tabStrip, (id) => { saveScroll(); docs.activate(id); });

  root.addEventListener("keydown", (e) => {
    e.stopPropagation(); // typing here must never reach the File Manager's own shortcuts (Delete, Ctrl+D ...)
    if (e.defaultPrevented || e.isComposing) return;
    const id = commandForEvent(e, state.platform);
    if (id && commands.run(id)) e.preventDefault();
  });
  window.addEventListener("beforeunload", (e) => { if (docs.anyDirty()) { e.preventDefault(); e.returnValue = ""; } });

  const visible = () => powerIsOpen() && activePowerTab() === "code";
  async function checkDisk() {
    if (!visible() || !docs.list().length) return;
    const r = await docs.checkExternal();
    if (r.reloaded.length) toast(`${r.reloaded.map((d) => d.name).join(", ")} changed on disk and was updated here.`);
    if (r.changed.length || r.deleted.length) afterMeta();
  }
  window.addEventListener("focus", checkDisk);

  docs.subscribe((kind) => {
    if (kind === "tabs" || kind === "active") showActive();
    else if (kind === "goto") { showActive(); const d = doc(); if (d?.editor) d.editor.goTo(d.line, d.col); }
    else if (kind === "reload") { for (const d of docs.list()) if (d.editor && d.editor.getText() !== d.text) { d.editor.setText(d.text); d.editor.setOptions(optionsFor(d)); assist.reset(d); } afterMeta(); updatePreview(); }
    else if (kind === "saved" || kind === "meta") { afterMeta(); if (kind === "saved") findBar.refresh(); }
    else if (kind === "settings") { applySettings(); updateStatus(); ed()?.layout(); }
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
