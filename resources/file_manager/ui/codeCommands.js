// Every command of the Code tab in one table: its name, shortcut and what it does. The menus, the command
// palette, the shortcuts list and the keyboard all read this table. `app` is the Code tab's services (code.js).
import {
  KEYMAP, changeCase, changeDiacritics, convertIndent, csvToMarkdownTable, deleteLines, duplicateLines, ensureFinalNewline,
  evaluateMathEdit, expandSelection, formatCode, formatShortcut, indentLines, joinLines, minifyCode, moveLines, outdentLines,
  removeDuplicateLines, reverseLines, selectLine, shortcutText, sortJsonKeys, sortLines, toggleBlockComment, toggleLineComment,
  toggleQuotes, toggleValueAtCaret, trimTrailingWhitespace, urlDecode, urlEncode, wordAt,
} from "./codeLogic.js";
import { askAutosave } from "./codeDialogs.js";
import { TRANSFORMS, convertText } from "./textConvert.js";
import { keysOf } from "./keymap.js";
import { state } from "./state.js";
import { formatWithV } from "./codeVFormat.js";
import { prettifyDoc } from "./codePrettify.js";

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
  add("File", "recentToggle", "Remember recent files", () => app.toggleRecent(), { tip: "Turn remembering recently opened files in the Code editor on or off.", checked: () => app.settings.recentsEnabled !== false });
  add("File", "recentClear", "Clear recent files", () => app.clearRecent(), { tip: "Remove all remembered recent files from the Code editor." });
  add("File", "save", "Save", () => app.save(), { tip: "Save this file (asks for a name if it is new)." });
  add("File", "saveAs", "Save as…", () => app.saveAs(), { tip: "Save this text under another name or in another place." });
  add("File", "saveAll", "Save all", () => app.saveAll(), { tip: "Save every file with unsaved changes." });
  add("File", "revert", "Revert to the saved file", () => app.revert(), { tip: "Throw away your changes and read the file from disk again." });
  add("File", "diffSaved", "Compare with saved file", () => app.diffWithSaved(), { tip: "Open a unified diff showing every line added or removed since the last save." });
  add("File", "diffTab", "Compare with another open tab…", () => app.diffWithTab(), { tip: "Pick another open tab and see a line-by-line unified diff between the two files." });
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
  add("Edit", "renameSymbol", "Rename symbol across file…", () => app.renameSymbol(), { tip: "Rename every whole-word occurrence of the variable, function or identifier under the cursor." });
  add("Edit", "inspectToken", "Inspect value / color picker at cursor…", () => app.inspectToken(), { tip: "Decode and convert the value under the cursor: color picker (#hex, rgb, hsl + WCAG contrast), JWT claims, Unix timestamps, cron schedules, chmod modes, number bases, URLs and UTF-8 bytes." });
  add("Edit", "insertSnippet", "Insert code snippet…", () => app.insertSnippet(), { tip: "Pick a built-in template for this language and expand it at the cursor." });
  add("Edit", "insertGenerated", "Insert generated value (UUID, date, timestamp)…", () => app.insertGenerated(), { tip: "Insert a fresh UUID v4, ISO-8601 timestamp, today's date, Unix epoch, random hex token, number sequence or Lorem ipsum." });
  add("Edit", "complete", "Show suggestions", () => app.suggest(), { tip: "Open the list of suggestions at the cursor (Alt+/ or Ctrl+Space). Enter or Tab picks one, Esc closes it." });
  add("Edit", "selectAll", "Select all", () => app.ed()?.ta.select(), { tip: "Select the whole file." });
  add("Edit", "clipboard", "Clipboard history…", () => app.clipboardHistory(), { tip: "Paste something you copied a little while ago." });

  add("Selection", "expandSelection", "Expand selection", sel((t, s, e) => expandSelection(t, s, e)), { tip: "Progressively grow the selection: word → inside quotes/brackets → quotes/brackets → line → enclosing block → whole file." });
  add("Selection", "goToBracket", "Go to matching bracket", () => app.goToBracket(), { tip: "Jump the cursor to the matching (, ), [, ], { or }." });
  add("Selection", "nextOccurrence", "Next occurrence of word", () => app.stepOccurrence(1), { tip: "Jump to the next occurrence of the word under the cursor." });
  add("Selection", "prevOccurrence", "Previous occurrence of word", () => app.stepOccurrence(-1), { tip: "Jump to the previous occurrence of the word under the cursor." });
  add("Selection", "editAllOccurrences", "Edit all occurrences of word / selection…", () => app.editAllOccurrencesPrompt(), { tip: "Multi-cursor style batch edit: replace every occurrence of the current word or selected phrase across the file at once." });
  add("Selection", "prefixSuffixLines", "Add prefix / suffix to lines (multi-line cursor)…", () => app.prefixSuffixLinesPrompt(), { tip: "Add a prefix and/or suffix to every selected line at once (use prefix|suffix to wrap each line)." });
  add("Selection", "numberLines", "Number selected lines (1. 2. 3. …)", () => app.numberLinesAction(), { tip: "Prepend sequential line numbers (1., 2., 3. …) to each non-empty line in the selection." });
  add("Selection", "foldBlock", "Fold block at cursor", () => { if (!app.ed()?.foldAtCursor()) app.toast("No foldable block at the cursor."); }, { tip: "Collapse the code block or Markdown section enclosing the cursor." });
  add("Selection", "unfoldBlock", "Unfold block at cursor", () => { if (!app.ed()?.unfoldAtCursor()) app.toast("Nothing folded at the cursor."); }, { tip: "Expand a folded block at or around the cursor." });
  add("Selection", "foldAll", "Fold all blocks", () => app.ed()?.foldAll(), { tip: "Collapse all foldable blocks and sections in the file." });
  add("Selection", "unfoldAll", "Unfold all blocks", () => app.ed()?.unfoldAll(), { tip: "Expand all folded blocks in the file." });
  add("Selection", "toggleComment", "Comment or uncomment lines", text((t, s, e, d) => toggleLineComment(t, s, e, d.lang)), { tip: "Add or remove // or # in front of the selected lines." });
  add("Selection", "blockComment", "Comment or uncomment the selection (block)", text((t, s, e, d) => toggleBlockComment(t, s, e, d.lang)), { tip: "Wrap the selection in a block comment, or take it out." });
  add("Selection", "wrapTag", "Wrap selection with HTML/XML tag…", () => app.wrapTag(), { tip: "Wrap the selection or line with a tag or Emmet abbreviation like div.card#hero or ul>li*." });
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

  add("Text tools", "toggleValue", "Flip value at cursor (true/false, const/let, ===/!==…)", text((t, s, e) => toggleValueAtCaret(t, s, e)), { tip: "Flip booleans, keywords and operators under the cursor: true ↔ false, yes ↔ no, on ↔ off, const ↔ let, === ↔ !==, min ↔ max, left ↔ right." });
  add("Text tools", "toggleQuotes", "Cycle string quotes (\" ↔ ' ↔ `)", text((t, s, e) => toggleQuotes(t, s, e)), { tip: "Switch the quotes of the string around the cursor between double quotes, single quotes and template backticks." });
  add("Text tools", "evalMath", "Evaluate math expression", text((t, s, e) => evaluateMathEdit(t, s, e)), { tip: "Calculate the selected math expression (or the current line) in place. Write an = at the end of the expression to keep the formula and append the answer." });
  add("Text tools", "sortJson", "Sort JSON keys alphabetically", text((t) => sortJsonKeys(t, unit())), { tip: "Recursively sort every object's keys A to Z in a JSON document." });
  add("Text tools", "csvToMd", "Convert CSV/TSV to Markdown table", text((t, s, e) => {
    const hasSel = s < e;
    const src = hasSel ? t.slice(s, e) : t;
    try {
      const md = csvToMarkdownTable(src);
      const from = hasSel ? s : 0;
      const to = hasSel ? e : t.length;
      return { from, to, insert: md, selStart: from, selEnd: from + md.length, message: "Converted CSV/TSV into a formatted Markdown table." };
    } catch (err) {
      return { message: err?.message || "Couldn't convert to a Markdown table." };
    }
  }), { tip: "Turn comma-, tab- or semicolon-separated rows into a neatly aligned Markdown table." });
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
  add("Text tools", "format", "Format / prettify document", () => (app.doc()?.lang === "v" ? formatWithV(app) : prettifyDoc(app, "prettify", formatLocal)), { tip: "Lay out the whole file neatly. Built in: JavaScript, TypeScript, JSX, JSON, CSS, SCSS, Less, HTML, Vue, Markdown, YAML, GraphQL, SQL and XML. Python, Go, Rust, C, C++, Java, C# and shell use the formatter you have installed (ruff or black, gofmt, rustfmt, clang-format, shfmt); without one only whitespace is tidied. V files use v fmt." });
  add("Text tools", "minify", "Minify (JavaScript, JSON or CSS)", () => prettifyDoc(app, "minify", formatNow(true)), { tip: "Squeeze JavaScript, JSON or CSS onto as few characters as possible (comments are removed). Undo brings the original back." });
  add("Text tools", "tabsToSpaces", "Convert indentation to spaces", text((t) => convertIndent(t, "spaces", app.doc().indent.size ?? app.settings.tabSize)), { tip: "Replace tab characters at the start of lines with spaces." });
  add("Text tools", "spacesToTabs", "Convert indentation to tabs", text((t) => convertIndent(t, "tabs", app.doc().indent.size ?? app.settings.tabSize)), { tip: "Replace groups of spaces at the start of lines with tabs." });
  add("Text tools", "regexSandbox", "Regex sandbox…", () => app.regexSandbox(), { tip: "Try a regular expression on sample text." });

  add("View", "wrap", "Word wrap", setting("wrap"), { tip: "Wrap long lines instead of scrolling sideways.", checked: () => app.settings.wrap });
  add("View", "lineNumbers", "Line numbers", setting("lineNumbers"), { tip: "Show or hide the line numbers.", checked: () => app.settings.lineNumbers });
  add("View", "minimap", "Minimap", setting("minimap"), { tip: "Show a miniature overview of the file on the right side of the editor.", checked: () => app.settings.minimap });
  add("View", "stickyScroll", "Sticky scroll header", () => app.setSetting("stickyScroll", app.settings.stickyScroll === false), { tip: "Pin the enclosing function, class or section header at the top of the editor while scrolling.", checked: () => app.settings.stickyScroll !== false });
  add("View", "whitespace", "Show whitespace dots", setting("whitespace"), { tip: "Draw a subtle dot for space characters so extra spaces are easy to spot.", checked: () => app.settings.whitespace });
  add("View", "indentGuides", "Indentation guides", setting("indentGuides"), { tip: "Show subtle vertical lines for each indentation level.", checked: () => app.settings.indentGuides !== false });
  add("View", "ruler", "80-column ruler", setting("ruler"), { tip: "Show a vertical guide line at 80 columns.", checked: () => app.settings.ruler });
  add("View", "wordHighlight", "Highlight word occurrences", setting("wordHighlight"), { tip: "Automatically highlight all occurrences of the identifier under the cursor.", checked: () => app.settings.wordHighlight !== false });
  add("View", "zoomIn", "Bigger text", zoom(1), { tip: "Make the text larger." });
  add("View", "zoomOut", "Smaller text", zoom(-1), { tip: "Make the text smaller." });
  add("View", "zoomReset", "Normal text size", zoom(0), { tip: "Go back to the normal text size." });
  add("View", "zen", "Zen mode", () => app.toggleZen(), { tip: "Hide everything except the text and the tabs. Press again to come back.", checked: () => app.isZen() });
  add("View", "explorer", "Show the side panel", () => app.toggleSide(), { tip: "Show or hide the Explorer and other side panels.", checked: () => app.settings.explorer });
  add("View", "preview", "Preview & Live Inspector", () => app.togglePreview(), { tip: "Show a formatted preview (Markdown, JSON tree, CSV table, colored HTML) or Live Code Inspector (diff, outline & TODOs) next to the text.", checked: () => app.isPreview() });
  add("View", "splitEditor", "Side-by-side split editor", () => app.toggleSplitEditor(), { tip: "Open a second editor pane side by side to view or compare another open tab.", checked: () => app.isSplitEditor() });
  add("View", "panelFiles", "Explorer", () => app.showPanel("files"), { tip: "Show the folder tree." });
  add("View", "panelGit", "Git changes", () => app.showPanel("git"), { tip: "See which files changed since the last commit." });
  add("View", "panelOutline", "Outline", () => app.showPanel("outline"), { tip: "List the functions, classes and headings of this file." });
  add("View", "panelTodos", "Tasks (TODO / FIXME)", () => app.showPanel("todos"), { tip: "List every TODO, FIXME, BUG, HACK and NOTE comment across open files." });
  add("View", "panelBookmarks", "Bookmarks", () => app.showPanel("bookmarks"), { tip: "List the lines you marked." });
  add("View", "panelHistory", "Local file history (timeline)", () => app.showPanel("history"), { tip: "Browse saved snapshots of this file, compare changes or restore an earlier version." });
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
  const needs = new Set(["complete", "find", "replace", "findNext", "findPrev", "goToLine", "goToSymbol", "renameSymbol", "editAllOccurrences", "prefixSuffixLines", "numberLines", "foldBlock", "unfoldBlock", "foldAll", "unfoldAll", "inspectToken", "insertSnippet", "insertGenerated", "expandSelection", "goToBracket", "nextOccurrence", "prevOccurrence", "wrapTag", "toggleValue", "toggleQuotes", "evalMath", "sortJson", "csvToMd", "diffSaved", "diffTab", "selectAll", "toggleComment", "blockComment", "indent", "outdent", "selectLine", "selectWord", "deleteLine", "duplicate", "duplicateUp", "moveUp", "moveDown", "joinLines", "sortAsc", "sortDesc", "sortNumeric", "reverseLines", "dedupe", "trim", "finalNewline", "upper", "lower", "title", "camel", "snake", "kebab", "urlEncode", "urlDecode", "format", "minify", "tabsToSpaces", "spacesToTabs", "undo", "redo", "bookmarkToggle", "bookmarkNext", "bookmarkPrev", "bookmarkClear"]);

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
