import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `code_studio` (NovaCode Studio Pro). Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const codeStudioTips: HelpTips = {
  // Top toolbar
  "#zen-exit-btn": "Leave Zen mode and show the toolbar, side panels and status bar again. Shortcut: F11.",
  "#btn-toggle-sidebar": "Show or hide the side panel with the file list. Shortcut: Ctrl+B.",
  "#btn-quick-open": "Open a search box to jump to a file or run a command, such as switching theme. Type part of a name and press Enter. Shortcut: Ctrl+P (Cmd+P on a Mac).",
  "#btn-undo": "Undo your last edit in the current file. Shortcut: Ctrl+Z (Cmd+Z on a Mac). Greyed out when there is nothing to undo.",
  "#btn-redo": "Redo an edit you just undid. Shortcut: Ctrl+Shift+Z (Cmd+Shift+Z on a Mac). Greyed out when there is nothing to redo.",
  "#btn-run-cmd": "Open the terminal at the bottom with the command bun run followed by the current file already typed. Press Enter there to start it. It does not run anything by itself.",
  "#btn-format-doc": "Tidy the current file. A JSON file is re-indented using the tab size from Settings; any other file only has the spaces at the ends of lines removed. Shortcut: Shift+Alt+F.",
  "#btn-clipboard-ring": "Open the list of the last things you copied in the editor. Pick one to paste it at the cursor. Shortcut: Ctrl+Shift+V.",
  "#btn-find": "Show or hide the Find and Replace bar for the current file. Shortcut: Ctrl+F.",
  "#btn-toggle-preview": "Show or hide a panel beside the editor that displays the current file as Markdown, a web page, a JSON tree or word statistics. Shortcut: Ctrl+\\.",
  "#btn-toggle-wrap": "Turn word wrap on or off. ON: long lines continue on the next row. OFF: long lines run off the side. Shortcut: Alt+Z.",
  "#btn-zen-mode": "Hide the toolbar, side panels and status bar to focus on the code. Press Exit Zen Mode or F11 to return.",
  "#theme-selector": "Change the colour theme of the editor only: One Dark, Dracula, Monokai, GitHub Dark, Nordic or Solarized Light.",
  "#btn-toggle-drawer": "Show or hide the bottom panel with the terminal, regex tester, text comparer and code snippets. Shortcut: Ctrl+`.",
  "#btn-save-file": "Save the current file to disk in the workspace folder. If the editor cannot reach its background server, it keeps the file in the editor's memory only. Shortcut: Ctrl+S.",

  // Activity bar and sidebar header
  "#act-files": "Show the file list of the workspace folder. Click a file to open it. Shortcut: Ctrl+Shift+E.",
  "#act-search": "Search for text in every file of the workspace. Shortcut: Ctrl+Shift+F.",
  "#act-outline": "List the functions, classes and similar items found in the current file. Click one to jump to its line.",
  "#act-bookmarks": "List the lines you marked with a bookmark. Click one to jump to it. Click a line number in the editor to add a bookmark.",
  "#act-clipboard": "List the recent things you copied in the editor, with a Paste button for each.",
  "#act-git": "List the files with unsaved changes, with a button to save them all. It reads the editor's unsaved state, not the real Git repository.",
  "#act-shortcuts": "Show the cheat sheet of keyboard shortcuts. Shortcut: F1.",
  "#act-settings": "Open the editor preferences: word wrap, font size, tab size and auto save.",
  "#btn-new-file": "Create a new, empty file in the workspace. You are asked for its path, such as src/app.ts.",
  "#btn-new-folder": "Create a new folder in the workspace. You are asked for its path, such as src/utils.",
  "#btn-refresh-tree": "Reload the file list from disk, to show files added or removed outside the editor.",
  "#btn-collapse-sidebar": "Hide the side panel. Use the Explorer button in the toolbar to bring it back.",

  // Workspace search
  "#ws-search-query": "Text to look for in all files of the workspace. Results appear below as you type; click one to jump to it.",
  "#ws-replace-query": "The text that Replace All puts in place of the search text. Leave empty to delete the matches.",
  "#ws-opt-case": "Match Case. ON: capital and small letters must match exactly in the search. It does not affect Replace All.",
  "#ws-opt-word": "Whole Word. ON: only find the search text when it stands alone as a word. It does not affect Replace All.",
  "#ws-opt-regex": "Regex. ON: treat the search text as a regular expression, a pattern such as [0-9]+. It does not affect Replace All.",
  "#btn-ws-replace-all": "After you confirm, replace every exact, case-sensitive occurrence of the search text with the replacement in all open workspace files. Changed files are saved to disk. Regex and the options above are not used.",
  "#btn-clear-bookmarks": "Remove all bookmarks in every file. The lines themselves are not changed.",
  "#btn-clear-clipboard": "Empty the clipboard history list of the editor. Your system clipboard is not touched.",

  // Settings
  "#set-word-wrap": "ON: long lines wrap onto the next row. OFF: long lines run off the side and you scroll sideways.",
  "#set-font-size": "Size of the code text, from 11 to 22 pixels. The current size is shown next to the label.",
  "#set-tab-size": "How many spaces make one level of indentation, 2, 4 or 8. Used by the Tab key and by JSON formatting.",
  "#set-auto-save": "ON: the file is saved on its own a moment after you stop typing. OFF: save by hand with Ctrl+S. The status bar shows the current state.",
  "#set-autosave-delay": "How long to wait after your last keystroke before the file is saved automatically. Only used when Auto Save is on.",

  // Tabs and Find & Replace bar
  "#btn-add-tab": "Open a new empty file in a new tab.",
  ".tab-close-btn": "Close this tab. The file stays in the workspace; unsaved changes are kept in memory.",
  "#fr-find-input": "Text to find in the current file. Matches are highlighted and counted; Enter goes to the next one and Shift+Enter to the previous one.",
  "#fr-opt-case": "Match Case. ON: capital and small letters must match exactly.",
  "#fr-opt-word": "Whole Word. ON: only match the text when it stands alone as a word.",
  "#fr-opt-regex": "Regular Expression. ON: treat the text as a pattern such as \\d+ for digits, instead of plain text.",
  "#fr-prev-btn": "Jump to the previous match. Shortcut: Shift+Enter.",
  "#fr-next-btn": "Jump to the next match. Shortcut: Enter.",
  "#fr-close-btn": "Close the Find and Replace bar. Shortcut: Escape.",
  "#fr-replace-input": "The text to put in place of what was found. Leave empty to delete the matches.",
  "#fr-replace-one-btn": "Replace the match you are on with the replacement text, then move to the next.",
  "#fr-replace-all-btn": "Replace every match in the current file with the replacement text.",
  "#editor-textarea": "The editor. Type or paste code here. Press Ctrl+S to save and Ctrl+/ to comment a line; click a line number to set a bookmark.",

  // Preview panel
  "text:Markdown": "Show the file as formatted Markdown text, with headings, lists and links.",
  "text:HTML Sandbox": "Show the file as a live web page in a safe box. Scripts in it may run, but cannot reach the editor.",
  "text:JSON Tree": "Show the file as a collapsible tree of JSON data, or the error if the JSON is invalid.",
  "text:Metrics": "Show counts for the file: lines, words, characters, size in bytes and estimated reading time.",
  "#btn-close-preview": "Close the preview panel.",

  // Bottom drawer
  "text:Terminal": "Show the terminal. Type a shell command and press Enter to run it in the workspace folder.",
  "text:Regex Sandbox": "Show the regular expression tester: type a pattern and some text, and see the matches at once.",
  "text:Diff Compare": "Show the text comparer: paste two versions of some text and see which lines changed.",
  "text:Snippets": "Show ready-made code snippets. Click one to insert it at the cursor in the editor.",
  "#btn-drawer-clear": "Empty the terminal output. It clears the terminal even when another tab of the drawer is showing.",
  "#btn-drawer-close": "Close the bottom panel.",
  "#term-input": "Type a shell command, such as ls -la or bun --version, and press Enter. It runs on this computer in the workspace folder and its output appears above. The commands are not restricted.",
  "#reg-pattern": "A regular expression, a search pattern, such as ([A-Z][a-z]+) to match capitalised words. Matches show on the right as you type.",
  "#reg-flags": "Letters that change how the pattern works: g finds all matches, i ignores capital letters, m treats each line separately.",
  "#reg-test-string": "The text to search with the pattern above. Matches are highlighted in the result box on the right.",
  "#diff-original": "Paste the original text here. The comparison updates as you type.",
  "#diff-modified": "Paste the changed text here. Lines that differ from the original show in the result, compared line by line from the top.",

  // Pop-up windows
  "#palette-search-input": "Type part of a file name or command, then press Enter to open or run the highlighted result. Press Escape to close.",
  "#clipboard-search-input": "Type to narrow the list of copied items. Press Enter, or 1 to 9, to paste the item you want.",
  "#btn-close-shortcuts-modal": "Close the list of keyboard shortcuts.",
  "#btn-close-about-modal": "Close this information window.",
  "#quick-input-field": "Type your answer for the question at the top of this window, such as a line number or a file path, and press Enter. Press Escape to cancel.",
  "#quick-input-cancel-btn": "Close this window without doing anything.",
  "#quick-input-confirm-btn": "Carry out the action named on this button, such as go to a line, create a file or save a file under a new name, using the text you typed.",

  // Controls built at run time
  "#btn-save-all-git": "Save every file with unsaved changes at once.",
  "#btn-quick-add-bm": "Bookmark the line the cursor is on, so you can jump back to it later.",
  ".btn-del-bm": "Remove this bookmark. The line itself is not changed.",
  ".btn-del-quick-bm": "Remove this bookmark. The line itself is not changed.",
  ".clip-paste-btn": "Paste this copied text into the editor at the cursor.",
  ".clip-del-btn": "Remove this item from the clipboard history.",
};

/** Controls that need no tip, each with a reason. */
export const codeStudioSkip: SkipRule[] = [];
