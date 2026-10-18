// What the File, Go and status-bar commands actually do: saving (with the "changed on disk" and "file exists"
// questions), closing with unsaved changes, renaming, deleting, quick open, bookmarks and the pickers behind the
// status bar. `ctx` carries the Code tab's parts (documents, the current editor, the explorer ...).
import { call, ApiError } from "./api.js";
import { confirmBox, promptBox } from "./dialogs.js";
import { showMenu, toast } from "./menus.js";
import { baseName, parentOf } from "./util.js";
import { state } from "./state.js";
import {
  GENERATOR_ITEMS, LANGS, SNIPPETS, addLinePrefixSuffix, buildLineStarts, computeLineDiff, convertIndent,
  editAllOccurrences, expandSnippet, extractSymbols, findMatchingBracket, findWordOccurrences, indentUnit,
  inspectTokenAtCaret, lineAt, numberSelectedLines, renameSymbolInText, snippetPreview, stepBookmark, toggleBookmark,
  wrapWithTag,
} from "./codeLogic.js";
import { movePresets, workspaceFiles } from "./codeIO.js";
import { askChangedOnDisk, askLine, askUnsaved, openClipboardHistory, openPalette, openTokenInspector } from "./codeDialogs.js";
import { isDirty } from "./codeDocs.js";
import { encodingName } from "./codeStatus.js";

const problem = (err) => (err?.friendly || err instanceof ApiError ? err.message : "That didn't work. Try again.");

export function createActions(ctx) {
  const { docs, explorer } = ctx;
  const sep = () => state.sep;
  let fileCache = { root: "", hidden: false, files: [] };
  const clips = [];

  async function saveAs(doc = ctx.doc()) {
    if (!doc || doc.kind === "diff") return false;
    const folder = doc.path ? parentOf(doc.path, sep()) : explorer.root || state.home;
    const result = await promptBox({
      title: "Save as", label: "Full path of the file to save", confirmLabel: "Save", value: doc.path || `${folder}${sep()}${doc.name}`,
      hint: "A new file is created. You'll be asked before anything that exists is replaced. ~ means your home folder.",
      submit: async (text) => {
        const typed = await call("typedpath", { text, cwd: folder });
        try {
          return await docs.saveAs(doc, typed.path);
        } catch (err) {
          if (err.code !== "EXISTS") throw err;
          if (await confirmBox({ title: "Replace the existing file?", message: `"${baseName(typed.path, sep())}" already exists. Saving will replace it.`, confirmLabel: "Replace", danger: true })) return await docs.saveAs(doc, typed.path, { overwrite: true });
          throw new ApiError("Pick a different name.", "EXISTS", 400);
        }
      },
    });
    if (result) explorer.refresh();
    return !!result;
  }

  /** Saves one document; asks what to do when the file changed or vanished. Returns true when it ended up saved. */
  async function save(doc = ctx.doc()) {
    if (!doc || doc.kind === "diff") return false;
    if (doc.kind === "untitled" || !doc.path) return saveAs(doc);
    if (doc.truncated) {
      toast("This big file is only partly shown, so it can't be saved here.", { kind: "error" });
      return false;
    }
    try {
      await docs.save(doc);
      return true;
    } catch (err) {
      if (err.code === "CHANGED_ON_DISK" || err.code === "GONE") {
        const choice = await askChangedOnDisk(doc.name, err.code === "GONE");
        try {
          if (choice === "overwrite") {
            if (err.code === "GONE") await docs.saveAs(doc, doc.path, { overwrite: true });
            else await docs.save(doc, { force: true });
            return true;
          }
          if (choice === "reload") await docs.reload(doc);
          else if (choice === "copy") return await saveAs(doc);
        } catch (again) {
          toast(problem(again), { kind: "error" });
        }
        return false;
      }
      toast(problem(err), { kind: "error" });
      return false;
    }
  }

  async function saveAll() {
    let saved = 0;
    for (const doc of docs.list().filter((d) => isDirty(d) && d.kind !== "diff")) if (await save(doc)) saved++;
    if (saved) toast(`Saved ${saved} ${saved === 1 ? "file" : "files"}.`, { kind: "success" });
  }

  /** Closes the given documents, asking once about unsaved changes. Returns false when the person cancelled. */
  async function closeDocs(list) {
    const dirty = list.filter((d) => isDirty(d) && d.kind !== "diff");
    if (dirty.length) {
      const answer = await askUnsaved(dirty.map((d) => d.name));
      if (answer === null) return false;
      if (answer === "save") for (const d of dirty) if (!(await save(d))) return false;
    }
    for (const d of list) docs.close(d.id);
    return true;
  }

  const closeTab = (doc = ctx.doc()) => (doc ? closeDocs([doc]) : false);

  async function revert(doc = ctx.doc()) {
    if (!doc?.path) return;
    if (isDirty(doc) && !(await confirmBox({ title: "Throw away your changes?", message: `"${doc.name}" will be read from disk again. Your unsaved changes will be lost.`, confirmLabel: "Revert", danger: true }))) return;
    try {
      await docs.reload(doc);
    } catch (err) {
      toast(problem(err), { kind: "error" });
    }
  }

  async function renameFile(doc = ctx.doc()) {
    if (!doc?.path) return void toast("Save this file first; only saved files can be renamed.");
    const r = await promptBox({ title: "Rename file", label: "New name", value: doc.name, confirmLabel: "Rename", selectBase: true, submit: (name) => call("rename", { path: doc.path, name }) });
    if (!r) return;
    docs.pathMoved(r.from, r.to);
    movePresets(r.from, r.to).catch(() => {});
    explorer.refresh();
    toast(`Renamed to ${baseName(r.to, sep())}.`, { kind: "success" });
  }

  async function deleteFile(doc = ctx.doc()) {
    if (!doc?.path) return;
    if (!(await confirmBox({ title: "Move to the Recycle Bin?", message: `"${doc.name}" will go to the Recycle Bin. You can get it back from there.`, confirmLabel: "Move to Recycle Bin", danger: true }))) return;
    try {
      const r = (await call("trash", { paths: [doc.path] })).results[0];
      if (!r?.ok) throw new ApiError(r?.message ?? "That couldn't be deleted.", r?.code ?? "UNKNOWN", 400);
      docs.close(doc.id);
      explorer.refresh();
      toast(`${doc.name} is in the Recycle Bin.`, { kind: "success" });
    } catch (err) {
      toast(problem(err), { kind: "error" });
    }
  }

  async function copyPath(doc = ctx.doc()) {
    if (!doc?.path) return;
    try {
      await call("copytext", { text: doc.path });
      toast("Path copied.", { kind: "success" });
    } catch (err) {
      toast(problem(err), { kind: "error" });
    }
  }

  async function openByPath() {
    const doc = await promptBox({
      title: "Open file", label: "Full path of the file", confirmLabel: "Open",
      submit: async (text) => {
        const typed = await call("typedpath", { text, cwd: explorer.root || state.home });
        try {
          return await docs.openPath(typed.path);
        } catch (err) {
          throw new ApiError(problem(err), err.code ?? "UNKNOWN", 400);
        }
      },
    });
    return doc;
  }

  /** Go to file: a search box over the files of the workspace folder. */
  async function quickOpen() {
    const root = explorer.root;
    if (!root) return void toast("Open a folder in the Explorer first.");
    const recents = docs.settings.recentsEnabled === false ? [] : docs.session.recents.map((r) => ({ label: baseName(r.path, sep()), detail: r.path, hint: "recent", value: r.path }));
    const palette = openPalette({ title: "Go to file", placeholder: "Type part of a file name", items: recents, empty: "No matching files.", onPick: (path) => ctx.open(path) });
    const hidden = docs.settings.showHidden;
    try {
      if (fileCache.root !== root || fileCache.hidden !== hidden) {
        const r = await workspaceFiles(root, hidden);
        fileCache = { root, hidden, files: r.files, note: r.truncated || r.timedOut };
      }
      palette.setItems([...recents.filter((x) => x.detail.startsWith(root)), ...fileCache.files.map((rel) => ({ label: rel.slice(rel.lastIndexOf("/") + 1), detail: rel, value: `${root}${sep()}${rel.replaceAll("/", sep())}` }))]);
    } catch (err) {
      toast(problem(err), { kind: "error" });
    }
  }

  function clearRecent() {
    docs.clearRecents();
    toast("Cleared recent files.", { kind: "success" });
  }

  function toggleRecent(force) {
    const next = typeof force === "boolean" ? force : docs.settings.recentsEnabled === false;
    docs.setRecentsEnabled(next);
    toast(next ? "Recent files turned on." : "Recent files turned off.");
  }

  function openRecent() {
    const enabled = docs.settings.recentsEnabled !== false;
    const items = [
      ...(enabled ? docs.session.recents.map((r) => ({ label: baseName(r.path, sep()), detail: r.path, value: r.path })) : []),
      ...(docs.session.recents.length ? [{ label: "Clear recent files", detail: "Remove all remembered recent files in the Code editor", hint: "action", value: "__clear__" }] : []),
      {
        label: enabled ? "Turn off recent files" : "Turn on recent files",
        detail: enabled ? "Stop remembering recently opened files in the Code editor" : "Resume remembering recently opened files in the Code editor",
        hint: "setting",
        value: "__toggle__",
      },
    ];
    openPalette({
      title: "Open recent file",
      placeholder: "Type to filter",
      items,
      empty: enabled ? "No recent files yet." : "Recent files are turned off.",
      onPick: (val) => {
        if (val === "__clear__") clearRecent();
        else if (val === "__toggle__") toggleRecent();
        else ctx.open(val);
      },
    });
  }

  async function goToLine() {
    const ed = ctx.ed();
    if (!ed) return;
    const r = await askLine(ed.lineCount);
    if (r) ed.goTo(r.line, r.col);
  }

  function goToSymbol() {
    const doc = ctx.doc();
    const ed = ctx.ed();
    if (!doc || !ed) return;
    const symbols = extractSymbols(doc.text, doc.lang);
    openPalette({
      title: "Go to symbol", placeholder: "Type part of a function, class or heading", empty: "No symbols were found in this file.",
      items: symbols.map((s) => ({ label: s.name, detail: `${s.kind} · line ${s.line}`, value: s.line })), onPick: (line) => ed.goTo(line),
    });
  }

  function bookmark(action, specificLine = 0) {
    const doc = ctx.doc();
    const ed = ctx.ed();
    if (!doc || !ed) return;
    const line = specificLine > 0 ? specificLine : ed.getText().slice(0, ed.getSelection().start).split("\n").length;
    if (action === "toggle") docs.setBookmarks(doc, toggleBookmark(doc.bookmarks, line));
    else if (action === "clear") docs.setBookmarks(doc, []);
    else {
      const next = stepBookmark(doc.bookmarks, line, action === "next" ? 1 : -1);
      if (next === null) return void toast("No bookmarks in this file yet. Press Ctrl/Cmd+F2 on a line to add one.");
      ed.goTo(next);
    }
    ed.setBookmarks(doc.bookmarks);
  }

  function goToBracket() {
    const ed = ctx.ed();
    if (!ed) return;
    const text = ed.getText();
    const { start } = ed.getSelection();
    const m = findMatchingBracket(text, start);
    if (!m) return void toast("Put the cursor next to a bracket ( ), [ ] or { } first.");
    const target = start === m.open || start === m.open + 1 ? m.close : m.open;
    const st = buildLineStarts(text);
    const l = lineAt(st, target);
    ed.goTo(l + 1, target - st[l] + 1);
  }

  function stepOccurrence(dir = 1) {
    const ed = ctx.ed();
    if (!ed) return;
    const text = ed.getText();
    const { start, end } = ed.getSelection();
    const occ = findWordOccurrences(text, start, end);
    if (!occ || occ.matches.length < 2) return void toast("Put the cursor on a repeated word or variable name first.");
    const nextIdx = (occ.current + dir + occ.matches.length) % occ.matches.length;
    const m = occ.matches[nextIdx];
    const st = buildLineStarts(text);
    const l = lineAt(st, m.index);
    ed.reveal(l + 1, m.index - st[l] + 1);
    ed.setSelection(m.index, m.index + m.length);
    ed.focus();
  }

  async function renameSymbol() {
    const ed = ctx.ed();
    if (!ed) return;
    const text = ed.getText();
    const { start, end } = ed.getSelection();
    const occ = findWordOccurrences(text, start, end, 2_000_000);
    if (!occ) return void toast("Put the cursor on a word or variable name first.");
    const newName = await promptBox({
      title: `Rename "${occ.word}" (${occ.matches.length} ${occ.matches.length === 1 ? "occurrence" : "occurrences"})`,
      label: "New name for every occurrence in this file",
      value: occ.word,
      confirmLabel: "Rename all",
      hint: `Replaces all ${occ.matches.length} whole-word occurrences in this file. Undo (Ctrl/Cmd+Z) restores the original name.`,
      submit: (val) => {
        if (!val.trim()) throw new ApiError("Type the new name.", "EMPTY", 0);
        return val.trim();
      },
    });
    if (!newName || newName === occ.word) return;
    const r = renameSymbolInText(ed.getText(), start, end, newName);
    if (r.from !== undefined) {
      ed.apply(r);
      ed.focus();
    }
    if (r.message) toast(r.message, { kind: "success" });
  }

  async function wrapTag() {
    const ed = ctx.ed();
    if (!ed) return;
    const spec = await promptBox({
      title: "Wrap with HTML / XML tag",
      label: "Tag or abbreviation (for example div.card#hero, span, or ul>li*)",
      value: "div",
      confirmLabel: "Wrap",
      hint: "Use .class and #id, > for nested tags, and * at the end to wrap each selected line separately.",
      submit: (val) => {
        if (!val.trim()) throw new ApiError("Type a tag name.", "EMPTY", 0);
        return val.trim();
      },
    });
    if (!spec) return;
    const { start, end } = ed.getSelection();
    const r = wrapWithTag(ed.getText(), start, end, spec);
    if (r.from !== undefined) {
      ed.apply(r);
      ed.focus();
    } else if (r.message) toast(r.message, { kind: "error" });
  }

  function inspectToken() {
    const ed = ctx.ed();
    if (!ed) return;
    const { start, end } = ed.getSelection();
    const info = inspectTokenAtCaret(ed.getText(), start, end);
    openTokenInspector(info, {
      onReplace: (from, to, value) => {
        ed.apply({ from, to, insert: value, selStart: from, selEnd: from + value.length });
        ed.focus();
      },
      onOpenUrl: (url) => {
        call("link/open", { url }).catch((err) => toast(problem(err), { kind: "error" }));
      },
    });
  }

  function insertSnippet() {
    const doc = ctx.doc();
    const ed = ctx.ed();
    if (!doc || !ed) return;
    const u = indentUnit({ useTabs: doc.indent.useTabs, size: doc.indent.size ?? docs.settings.tabSize });
    const list = SNIPPETS[doc.lang] ?? [];
    if (!list.length) return void toast("No code snippets are defined for this language yet.");
    openPalette({
      title: `Insert snippet (${doc.lang})`,
      placeholder: "Type a snippet prefix or description…",
      empty: "No matching snippets.",
      items: list.map((s) => ({ label: s.prefix, detail: s.detail, hint: snippetPreview(s.body, u).slice(0, 40), value: s })),
      onPick: (s) => {
        const text = ed.getText();
        const { start, end } = ed.getSelection();
        const linePrefix = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
        const baseIndent = /^[ \t]*/.exec(linePrefix)?.[0] ?? "";
        const exp = expandSnippet(s.body, baseIndent, u);
        const firstStop = exp.stops[0] ?? { start: exp.text.length, end: exp.text.length };
        ed.apply({
          from: start,
          to: end,
          insert: exp.text,
          selStart: start + firstStop.start,
          selEnd: start + firstStop.end,
        });
        ed.focus();
      },
    });
  }

  function insertGenerated() {
    const ed = ctx.ed();
    if (!ed) return;
    openPalette({
      title: "Insert generated value",
      placeholder: "Pick a generator (UUID, ISO date, Unix timestamp, hex token, sequence, Lorem ipsum…)",
      items: GENERATOR_ITEMS.map((g) => ({ label: g.label, detail: g.detail, value: g })),
      onPick: (g) => {
        const val = g.build();
        const { start, end } = ed.getSelection();
        ed.apply({ from: start, to: end, insert: val, selStart: start + val.length, selEnd: start + val.length });
        ed.focus();
      },
    });
  }

  function diffWithSaved() {
    const doc = ctx.doc();
    if (!doc || doc.kind === "diff") return;
    const r = computeLineDiff(doc.savedText ?? "", doc.text ?? "", { oldLabel: `${doc.name} (saved)`, newLabel: `${doc.name} (current)` });
    if (r.identical) return void toast("No unsaved changes compared to the saved file.");
    docs.openView(`Diff: ${doc.name}`, r.diff, "diff");
  }

  function diffWithTab() {
    const doc = ctx.doc();
    if (!doc) return;
    const others = docs.list().filter((d) => d !== doc && d.kind !== "diff");
    if (!others.length) return void toast("Open a second file tab first to compare two files.");
    openPalette({
      title: `Compare "${doc.name}" with another open tab`,
      placeholder: "Choose a tab to compare against",
      items: others.map((d) => ({ label: d.name, detail: d.path || "unsaved tab", value: d })),
      onPick: (other) => {
        const r = computeLineDiff(other.text, doc.text, { oldLabel: other.name, newLabel: doc.name });
        if (r.identical) return void toast(`"${doc.name}" and "${other.name}" have identical text.`);
        docs.openView(`Diff: ${other.name} ↔ ${doc.name}`, r.diff, "diff");
      },
    });
  }

  function rememberClip(text) {
    const i = clips.indexOf(text);
    if (i >= 0) clips.splice(i, 1);
    clips.unshift(text);
    clips.length = Math.min(clips.length, 20);
  }

  function clipboardHistory() {
    const ed = ctx.ed();
    if (!ed) return void toast("Open a file first.");
    openClipboardHistory([...clips], (text) => {
      const { start, end } = ed.getSelection();
      ed.apply({ from: start, to: end, insert: text, selStart: start + text.length, selEnd: start + text.length });
      ed.focus();
    });
  }

  // -- status bar pickers ------------------------------------------------------------------------------------------

  function pickLanguage() {
    const doc = ctx.doc();
    if (!doc) return;
    openPalette({ title: "Choose the language", placeholder: "Type a language", items: LANGS.map((l) => ({ label: l.name, detail: l.id === doc.lang ? "current" : "", value: l.id })), onPick: (id) => ctx.setLanguage(doc, id) });
  }

  function pickEol() {
    const doc = ctx.doc();
    if (!doc || doc.readOnly) return;
    showMenu([["lf", "LF (Mac, Linux)"], ["crlf", "CRLF (Windows)"], ["cr", "CR (old Mac)"]].map(([id, label]) => ({ label, checked: doc.eol === id, action: () => { doc.eol = id; docs.emit("meta"); } })), { anchor: ctx.statusButton("eol"), label: "Line endings" });
  }

  function pickIndent() {
    const doc = ctx.doc();
    if (!doc) return;
    const set = (useTabs, size) => { doc.indent = { useTabs, size: useTabs ? doc.indent.size : size }; ctx.refreshEditor(doc); };
    const convert = (to) => {
      const r = convertIndent(doc.text, to, doc.indent.size ?? docs.settings.tabSize);
      if (r) ctx.ed().apply({ ...r, selStart: 0, selEnd: 0 });
      else toast("The indentation already looks like that.");
    };
    showMenu([
      { header: "Indent with" },
      { label: "Tabs", checked: doc.indent.useTabs, action: () => set(true) },
      ...[2, 3, 4, 8].map((n) => ({ label: `Spaces: ${n}`, checked: !doc.indent.useTabs && doc.indent.size === n, action: () => set(false, n) })),
      { separator: true },
      { label: "Convert existing indentation to spaces", action: () => convert("spaces") },
      { label: "Convert existing indentation to tabs", action: () => convert("tabs") },
    ], { anchor: ctx.statusButton("indent"), label: "Indentation" });
  }

  function pickEncoding() {
    const doc = ctx.doc();
    if (!doc) return;
    const encodings = ["utf-8", "utf-8-bom", "utf-16le", "utf-16be", "latin1"];
    const reopen = async (enc) => {
      if (isDirty(doc) && !(await confirmBox({ title: "Throw away your changes?", message: "Reopening reads the file again and drops unsaved changes.", confirmLabel: "Reopen", danger: true }))) return;
      docs.reload(doc, enc).catch((err) => toast(problem(err), { kind: "error" }));
    };
    showMenu([
      ...(doc.path ? [{ header: "Reopen the file as" }, ...encodings.map((e) => ({ label: encodingName(e), checked: doc.encoding === e, action: () => reopen(e) }))] : []),
      { header: "Save the file as" },
      ...encodings.map((e) => ({ label: encodingName(e), checked: doc.encoding === e, action: () => { doc.encoding = e; docs.emit("meta"); } })),
    ], { anchor: ctx.statusButton("enc"), label: "Text encoding" });
  }

  async function editAllOccurrencesPrompt() {
    const ed = ctx.ed();
    if (!ed) return;
    const text = ed.getText();
    const { start, end } = ed.getSelection();
    const selected = start !== end ? text.slice(start, end) : "";
    const occ = !selected ? findWordOccurrences(text, start, end, 2_000_000) : null;
    const target = selected || occ?.word || "";
    if (!target || target.includes("\n")) {
      return void toast("Select a phrase or put the cursor on a word to edit all its occurrences at once.");
    }
    const replacement = await promptBox({
      title: `Edit all occurrences of "${target}"`,
      label: "Replacement text for every occurrence in this file",
      value: target,
      confirmLabel: "Replace all",
      hint: "Replaces every matching occurrence across the file simultaneously (Undo restores all at once).",
      submit: (val) => val,
    });
    if (replacement === null || replacement === undefined || replacement === target) return;
    const r = editAllOccurrences(ed.getText(), start, end, replacement, { wholeWord: !selected });
    if (r.from !== undefined) {
      ed.apply(r);
      ed.focus();
    }
    if (r.message) toast(r.message, { kind: "success" });
  }

  async function prefixSuffixLinesPrompt() {
    const ed = ctx.ed();
    if (!ed) return;
    const spec = await promptBox({
      title: "Add prefix / suffix to lines (multi-line cursor edit)",
      label: "Format: prefix | suffix (for example: - [ ]  |  or  \" | \",)",
      value: "- ",
      confirmLabel: "Apply to lines",
      hint: "Use | to separate prefix and suffix (e.g. '<li>|</li>' wraps every selected line). Without |, adds a prefix to each line.",
      submit: (val) => {
        if (!val) throw new ApiError("Enter a prefix or prefix|suffix.", "EMPTY", 0);
        return val;
      },
    });
    if (!spec) return;
    const pipe = spec.indexOf("|");
    const prefix = pipe >= 0 ? spec.slice(0, pipe) : spec;
    const suffix = pipe >= 0 ? spec.slice(pipe + 1) : "";
    const { start, end } = ed.getSelection();
    const r = addLinePrefixSuffix(ed.getText(), start, end, prefix, suffix);
    if (r.from !== undefined) {
      ed.apply(r);
      ed.focus();
    }
    if (r.message) toast(r.message, { kind: "success" });
  }

  function numberLinesAction() {
    const ed = ctx.ed();
    if (!ed) return;
    const { start, end } = ed.getSelection();
    const r = numberSelectedLines(ed.getText(), start, end, { startAt: 1, step: 1, separator: ". " });
    if (r.from !== undefined) {
      ed.apply(r);
      ed.focus();
    }
    if (r.message) toast(r.message, { kind: "success" });
  }

  return { save, saveAs, saveAll, closeDocs, closeTab, revert, renameFile, deleteFile, copyPath, openByPath, quickOpen, openRecent, clearRecent, toggleRecent, goToLine, goToSymbol, bookmark, goToBracket, stepOccurrence, renameSymbol, editAllOccurrencesPrompt, prefixSuffixLinesPrompt, numberLinesAction, wrapTag, inspectToken, insertSnippet, insertGenerated, diffWithSaved, diffWithTab, rememberClip, clipboardHistory, pickLanguage, pickEol, pickIndent, pickEncoding, unitOf: (doc, fallback) => indentUnit({ useTabs: doc.indent.useTabs, size: doc.indent.size ?? fallback }) };
}

