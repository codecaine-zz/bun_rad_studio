// Every command of the Code tab in one table: its name, shortcut and what it does. The menus, the command
// palette, the shortcuts list and the keyboard all read this table. `app` is the Code tab's services (code.js).
import { KEYMAP, changeCase, changeDiacritics, convertIndent, deleteLines, duplicateLines, ensureFinalNewline, formatCode, formatShortcut, indentLines, joinLines, minifyCode, moveLines, outdentLines, removeDuplicateLines, reverseLines, selectLine, shortcutText, sortLines, toggleBlockComment, toggleLineComment, trimTrailingWhitespace, urlDecode, urlEncode, wordAt } from "./codeLogic.js";
import { askAutosave } from "./codeDialogs.js";
import { TRANSFORMS, convertText } from "./textConvert.js";
import { keysOf } from "./keymap.js";
import { state } from "./state.js";
import { formatWithV } from "./codeVFormat.js";

export const THEME_CHOICES = [["auto", "Follow the File Manager (light or dark)"], ["dracula", "Dracula"], ["github", "GitHub"], ["monokai", "Monokai"], ["nordic", "Nordic"], ["onedark", "One Dark"], ["solarized", "Solarized"]];

export function createCommands(app) {
  const edit = (fn) => () => {
    const ed = app.ed();
    if (!ed) return;
    const { start, end } = ed.getSelection();
    app.applyResult(fn(ed.getText(), start, end, app.doc()));
  };
  const text = (fn) => edit((t, s, e, d) => fn(t, s, e, d));
  const unit = () => app.unit();
  const setting = (key) => () => app.setSetting(key, !app.settings[key]);
  const zoom = (d) => () => app.setSetting("fontSize", Math.max(8, Math.min(40, d === 0 ? 14 : app.settings.fontSize + d)));
  const sel = (fn) => () => {
    const ed = app.ed();
    if (!ed) return;
    const { start, end } = ed.getSelection();
    const r = fn(ed.getText(), start, end);
    if (r) ed.setSelection(r.selStart, r.selEnd);
  };
  const formatNow = (minify) => edit((t, s, e, d) => {
    const r = minify ? minifyCode(d.lang, t) : formatCode(d.lang, t, unit());
    if (r.error) {
      app.toast(`${r.error.message}${r.error.line ? ` (line ${r.error.line}, column ${r.error.col})` : ""}`, { kind: "error" });
      if (r.error.at !== undefined) app.ed().goTo(r.error.line, r.error.col);
      return null;
    }
    if (r.message) return { message: r.message };
    return r.text === t ? { message: "Nothing needed changing." } : { from: 0, to: t.length, insert: r.text, selStart: Math.min(s, r.text.length), selEnd: Math.min(e, r.text.length) };
  });
  const cmds = [];
  const add = (g, id, label, run, extra = {}) => {
    cmds.push({ id, group: g, label, run, ...extra });
  };
  const needsEditor = () => !!app.ed();

  add("File", "newFile", "New file", () => app.newFile(), { tip: "Start a new, empty file. Save it to give it a name." });
  add("File", "quickOpen", "Go to file…", () => app.quickOpen(), { tip: "Find a file in the workspace by typing part of its name." });
  add("File", "openPath", "Open file by path…", () => app.openByPath(), { tip: "Type the full path of a file to open." });
  add("File", "recent", "Open recent file…", () => app.openRecent(), { tip: "Pick from the files you opened lately." });
  add("File", "save", "Save", () => app.save(), { tip: "Save this file (asks for a name if it is new)." });
  add("File", "saveAs", "Save as…", () => app.saveAs(), { tip: "Save this text under another name or in another place." });
  add("File", "saveAll", "Save all", () => app.saveAll(), { tip: "Save every file with unsaved changes." });
  add("File", "revert", "Revert to the saved file", () => app.revert(), { tip: "Throw away your changes and read the file from disk again." });
  add("File", "rename", "Rename this file…", () => app.renameFile(), { tip: "Change the file's name. Its run presets and bookmarks come along." });
  add("File", "deleteFile", "Move this file to the Recycle Bin…", () => app.deleteFile(), { tip: "Remove the file from disk (it goes to the Recycle Bin)." });
  add("File", "copyPath", "Copy the file's path", () => app.copyPath(), { tip: "Copy the full path of this file." });
  add("File", "closeTab", "Close tab", () => app.closeTab(), { tip: "Close this file (asks first if it has unsaved changes)." });
  add("File", "closeOthers", "Close the other tabs", () => app.closeOthers(), { tip: "Close every tab except this one." });
  add("File", "closeAll", "Close all tabs", () => app.closeAll(), { tip: "Close every tab (asks first about unsaved changes)." });

  add("Edit", "undo", "Undo", () => app.undo(false), { tip: "Take back the last change." });
  add("Edit", "redo", "Redo", () => app.undo(true), { tip: "Put back a change you took back." });
  add("Edit", "find", "Find…", () => app.find(false), { tip: "Look for text in this file." });
  add("Edit", "replace", "Replace…", () => app.find(true), { tip: "Find text and replace it." });
  add("Edit", "findNext", "Find next", () => app.findBar.next(), { tip: "Jump to the next match." });
  add("Edit", "findPrev", "Find previous", () => app.findBar.prev(), { tip: "Jump to the previous match." });
  add("Edit", "findInFiles", "Find in all files…", () => app.showPanel("search", true), { tip: "Search every file of the Explorer's folder." });
  add("Edit", "goToLine", "Go to line…", () => app.goToLine(), { tip: "Jump to a line number." });
  add("Edit", "goToSymbol", "Go to symbol…", () => app.goToSymbol(), { tip: "Jump to a function, class or heading in this file." });
  add("Edit", "complete", "Show suggestions", () => app.suggest(), { tip: "Open the list of suggestions at the cursor (Alt+/ or Ctrl+Space). Enter or Tab picks one, Esc closes it." });
  add("Edit", "selectAll", "Select all", () => app.ed()?.ta.select(), { tip: "Select the whole file." });
  add("Edit", "clipboard", "Clipboard history…", () => app.clipboardHistory(), { tip: "Paste something you copied a little while ago." });

  add("Selection", "toggleComment", "Comment or uncomment lines", text((t, s, e, d) => toggleLineComment(t, s, e, d.lang)), { tip: "Add or remove // or # in front of the selected lines." });
  add("Selection", "blockComment", "Comment or uncomment the selection (block)", text((t, s, e, d) => toggleBlockComment(t, s, e, d.lang)), { tip: "Wrap the selection in a block comment, or take it out." });
  add("Selection", "indent", "Indent lines", text((t, s, e) => indentLines(t, s, e, unit())), { tip: "Move the selected lines one step to the right." });
  add("Selection", "outdent", "Outdent lines", text((t, s, e) => outdentLines(t, s, e, unit())), { tip: "Move the selected lines one step to the left." });
  add("Selection", "selectLine", "Select line", sel((t, s, e) => selectLine(t, s, e)), { tip: "Select the whole line (again to add the next one)." });
  add("Selection", "selectWord", "Select word", sel((t, s) => wordAt(t, s)), { tip: "Select the word at the cursor." });
  add("Selection", "deleteLine", "Delete line", text((t, s, e) => deleteLines(t, s, e)), { tip: "Remove the selected lines." });
  add("Selection", "duplicate", "Duplicate line down", text((t, s, e) => duplicateLines(t, s, e, "down")), { tip: "Copy the selected lines just below themselves." });
  add("Selection", "duplicateUp", "Duplicate line up", text((t, s, e) => duplicateLines(t, s, e, "up")), { tip: "Copy the selected lines just above themselves." });
  add("Selection", "moveUp", "Move line up", text((t, s, e) => moveLines(t, s, e, -1)), { tip: "Swap the selected lines with the line above." });
  add("Selection", "moveDown", "Move line down", text((t, s, e) => moveLines(t, s, e, 1)), { tip: "Swap the selected lines with the line below." });
  add("Selection", "joinLines", "Join lines", text((t, s, e) => joinLines(t, s, e)), { tip: "Put the selected lines (or this line and the next) on one line." });

  add("Text tools", "sortAsc", "Sort lines A to Z", text((t, s, e) => sortLines(t, s, e)), { tip: "Sort the selected lines (or the whole file) in order." });
  add("Text tools", "sortDesc", "Sort lines Z to A", text((t, s, e) => sortLines(t, s, e, { descending: true })), { tip: "Sort the selected lines (or the whole file) backwards." });
  add("Text tools", "sortNumeric", "Sort lines by number", text((t, s, e) => sortLines(t, s, e, { numeric: true, ignoreCase: true })), { tip: "Sort lines so that 2 comes before 10." });
  add("Text tools", "reverseLines", "Reverse the order of lines", text((t, s, e) => reverseLines(t, s, e)), { tip: "Flip the selected lines upside down." });
  add("Text tools", "dedupe", "Remove duplicate lines", text((t, s, e) => removeDuplicateLines(t, s, e)), { tip: "Keep only the first copy of each repeated line." });
  add("Text tools", "trim", "Trim trailing spaces", text((t, s, e) => trimTrailingWhitespace(t, s, e)), { tip: "Remove spaces and tabs at the ends of lines." });
  add("Text tools", "finalNewline", "Make sure the file ends with a new line", text((t) => ensureFinalNewline(t)), { tip: "Add a line break at the very end if it is missing." });
  add("Text tools", "upper", "UPPERCASE", text((t, s, e) => changeCase(t, s, e, "upper")), { tip: "Make the selected text (or the word) capital letters." });
  add("Text tools", "lower", "lowercase", text((t, s, e) => changeCase(t, s, e, "lower")), { tip: "Make the selected text (or the word) small letters." });
  add("Text tools", "title", "Title Case", text((t, s, e) => changeCase(t, s, e, "title")), { tip: "Capitalise each word." });
  add("Text tools", "camel", "camelCase", text((t, s, e) => changeCase(t, s, e, "camel")), { tip: "Join words like someVariableName." });
  add("Text tools", "snake", "snake_case", text((t, s, e) => changeCase(t, s, e, "snake")), { tip: "Join words like some_variable_name." });
  add("Text tools", "kebab", "kebab-case", text((t, s, e) => changeCase(t, s, e, "kebab")), { tip: "Join words like some-variable-name." });
  add("Text tools", "removeAccents", "Remove accents (é → e)", text((t, s, e) => changeDiacritics(t, s, e, "remove")), { tip: "Take the accents off Latin and Greek letters in the selection, or in the whole file when nothing is selected. ß becomes ss, æ becomes ae. Other scripts are left alone." });
  add("Text tools", "composeAccents", "Join letters and accents (fix split accents)", text((t, s, e) => changeDiacritics(t, s, e, "compose")), { tip: "Fix text where an accent is stored apart from its letter (common in names copied from an older Mac), so that é is one character again." });
  add("Text tools", "decomposeAccents", "Split letters and accents", text((t, s, e) => changeDiacritics(t, s, e, "decompose")), { tip: "Store each accent as a separate mark after its letter. The text looks the same; it is for programs that want it this way." });
  add("Text tools", "convertText", "Convert text…", () => app.convertText(), { tip: "Pick from about seventy conversions (case, clean-up, lines, Base64, escapes, extract links ...) and apply it to the selection, or to the whole file when nothing is selected." });
  for (const t of TRANSFORMS) add("Convert", `tx:${t.id}`, `${t.group}: ${t.label}`, text((tx, s, e) => convertText(tx, s, e, t.id)), { tip: t.tip, hidden: true });
  add("Text tools", "urlEncode", "URL-encode the selection", text((t, s, e) => urlEncode(t, s, e)), { tip: "Turn spaces and symbols into %20 style codes." });
  add("Text tools", "urlDecode", "URL-decode the selection", text((t, s, e) => urlDecode(t, s, e)), { tip: "Turn %20 style codes back into text." });
  const formatLocal = formatNow(false);
  add("Text tools", "format", "Format document", () => (app.doc()?.lang === "v" ? formatWithV(app) : formatLocal()), { tip: "Tidy this file: JSON, CSS, HTML, XML and C-style code such as JavaScript. V files are formatted by v fmt." });
  add("Text tools", "minify", "Minify (JSON or CSS)", formatNow(true), { tip: "Squeeze JSON or CSS onto as few characters as possible." });
  add("Text tools", "tabsToSpaces", "Convert indentation to spaces", text((t) => convertIndent(t, "spaces", app.doc().indent.size ?? app.settings.tabSize)), { tip: "Replace tab characters at the start of lines with spaces." });
  add("Text tools", "spacesToTabs", "Convert indentation to tabs", text((t) => convertIndent(t, "tabs", app.doc().indent.size ?? app.settings.tabSize)), { tip: "Replace groups of spaces at the start of lines with tabs." });
  add("Text tools", "regexSandbox", "Regex sandbox…", () => app.regexSandbox(), { tip: "Try a regular expression on sample text." });

  add("View", "wrap", "Word wrap", setting("wrap"), { tip: "Wrap long lines instead of scrolling sideways.", checked: () => app.settings.wrap });
  add("View", "lineNumbers", "Line numbers", setting("lineNumbers"), { tip: "Show or hide the line numbers.", checked: () => app.settings.lineNumbers });
  add("View", "zoomIn", "Bigger text", zoom(1), { tip: "Make the text larger." });
  add("View", "zoomOut", "Smaller text", zoom(-1), { tip: "Make the text smaller." });
  add("View", "zoomReset", "Normal text size", zoom(0), { tip: "Go back to the normal text size." });
  add("View", "zen", "Zen mode", () => app.toggleZen(), { tip: "Hide everything except the text and the tabs. Press again to come back.", checked: () => app.isZen() });
  add("View", "explorer", "Show the side panel", () => app.toggleSide(), { tip: "Show or hide the Explorer and other side panels.", checked: () => app.settings.explorer });
  add("View", "preview", "Preview (Markdown, HTML)", () => app.togglePreview(), { tip: "Show a formatted preview of a Markdown file, or coloured HTML source, next to the text.", checked: () => app.isPreview() });
  add("View", "panelFiles", "Explorer", () => app.showPanel("files"), { tip: "Show the folder tree." });
  add("View", "panelGit", "Git changes", () => app.showPanel("git"), { tip: "See which files changed since the last commit." });
  add("View", "panelOutline", "Outline", () => app.showPanel("outline"), { tip: "List the functions, classes and headings of this file." });
  add("View", "panelBookmarks", "Bookmarks", () => app.showPanel("bookmarks"), { tip: "List the lines you marked." });
  add("View", "completion", "Code suggestions", setting("completion"), { tip: "Offer words, functions and snippets while you type. Turn off to type without pop-ups.", checked: () => app.settings.completion !== false });
  add("View", "autoOpen", "Suggest while typing", setting("autoOpen"), { tip: "Open the suggestion list by itself after a few letters. Turn off to open it yourself with Alt+/ or Ctrl+Space.", checked: () => app.settings.autoOpen !== false });
  add("View", "autosave", "Autosave", setting("autosave"), { tip: "Save changes automatically a moment after you stop typing, and when you switch away (only for files already on disk). Fine-tune it with Autosave options.", checked: () => app.settings.autosave });
  add("View", "autosaveOptions", "Autosave options…", async () => {
    const answer = await askAutosave(app.settings);
    if (!answer) return;
    for (const [key, value] of Object.entries(answer)) app.setSetting(key, value);
  }, { tip: "Turn Autosave on, choose how long it waits after you stop typing, and decide whether it also saves when you switch away." });
  add("View", "shortcuts", "Keyboard shortcuts…", () => app.shortcuts(), { tip: "Show every keyboard shortcut." });
  add("View", "palette", "Command palette…", () => app.palette(), { tip: "Search every command by name." });

  add("Go", "bookmarkToggle", "Toggle bookmark", () => app.bookmark("toggle"), { tip: "Mark or unmark this line." });
  add("Go", "bookmarkNext", "Next bookmark", () => app.bookmark("next"), { tip: "Jump to the next marked line." });
  add("Go", "bookmarkPrev", "Previous bookmark", () => app.bookmark("prev"), { tip: "Jump to the previous marked line." });
  add("Go", "bookmarkClear", "Clear bookmarks in this file", () => app.bookmark("clear"), { tip: "Remove every mark in this file." });

  add("Run", "run", "Run (default Run preset)", () => app.runDefault("run"), { tip: "Send this file's default Run command to the Terminal and press Enter." });
  add("Run", "build", "Build (Build preset)", () => app.runDefault("build"), { tip: "Send this file's Build command to the Terminal and press Enter." });
  add("Run", "presets", "Run presets…", () => app.openPresets(), { tip: "Add, edit and choose the commands saved for this file." });

  // The label is worked out each time it is read, so a shortcut changed in Settings shows up at once.
  for (const c of cmds) Object.defineProperty(c, "shortcut", { configurable: true, enumerable: true, get() { keysOf("code.save"); return shortcutText(c.id, state.platform, KEYMAP); }, set(v) { Object.defineProperty(c, "shortcut", { value: v, writable: true, configurable: true, enumerable: true }); } });
  // typing keys that the browser itself handles are listed too, for the shortcuts help
  cmds.find((c) => c.id === "selectAll").shortcut = formatShortcut("Mod+A", state.platform);
  const byId = new Map(cmds.map((c) => [c.id, c]));
  const needs = new Set(["complete", "find", "replace", "findNext", "findPrev", "goToLine", "goToSymbol", "selectAll", "toggleComment", "blockComment", "indent", "outdent", "selectLine", "selectWord", "deleteLine", "duplicate", "duplicateUp", "moveUp", "moveDown", "joinLines", "sortAsc", "sortDesc", "sortNumeric", "reverseLines", "dedupe", "trim", "finalNewline", "upper", "lower", "title", "camel", "snake", "kebab", "urlEncode", "urlDecode", "format", "minify", "tabsToSpaces", "spacesToTabs", "undo", "redo", "bookmarkToggle", "bookmarkNext", "bookmarkPrev", "bookmarkClear"]);

  return {
    list: cmds,
    byId,
    /** Runs a command by id (does nothing when there is no open file for a command that needs one). */
    run(id) {
      const c = byId.get(id);
      if (!c) return false;
      if (needs.has(id) && !needsEditor()) return true;
      c.run();
      return true;
    },
    /** Items for showMenu() for one group (or a list of ids). */
    menu(names) {
      const out = [];
      for (const name of names) {
        if (name === "-") out.push({ separator: true });
        else {
          const c = byId.get(name);
          if (c) out.push({ label: c.label, shortcut: c.shortcut, checked: c.checked ? c.checked() : undefined, disabled: needs.has(c.id) && !needsEditor(), action: () => c.run() });
        }
      }
      return out;
    },
  };
}
