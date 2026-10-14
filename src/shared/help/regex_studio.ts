import type { HelpTips, SkipRule } from "../helpMatch";

/** Regex Studio: test a regular expression, preview a replacement and generate code. */
export const regexStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and everything typed or ticked here (pattern, substitution, text, flags), so it is restored next time you open this app.",
  "#btn_save_ws_file": "Save the pattern, substitution, test text and flags to a .json file you choose, so you can share it or come back to it later.",
  "#btn_load_ws_file": "Open a workspace file saved with Save Workspace File. It replaces the pattern, substitution, test text and flags, then tests the pattern.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_pattern": "The regular expression (regex): a pattern that describes text to find. For example \\d+ finds numbers, and parentheses make capture groups. Write it without the surrounding slashes.",
  "#btn_test": "Run the pattern on the test text and list every match in the table, with its position, line and capture groups. Matches are also highlighted in the view below the text.",
  "#btn_explain": "Write a plain-language, part-by-part explanation of the pattern to the log at the bottom.",
  "#btn_cheatsheet": "Write a short reference of regex symbols (character classes, groups, repeats, anchors and so on) to the log at the bottom.",
  "#dd_lib": "Choose a ready-made pattern, such as email addresses, IP addresses or dates. It replaces the pattern box and is tested at once. Flags and substitution stay as they are.",
  "#txt_subst": "The text that replaces each match in Preview Replace. Use $1, $2 for capture groups, $& for the whole match. Example: [$1 at $2].",
  "#btn_replace": "Show the test text with every match replaced by the Substitution text. The result goes to the log at the bottom; your test text is not changed.",
  "#chk_g": "Global (g): find every match. When off, only the first match is found.",
  "#chk_i": "Case Insensitive (i): treat capital and small letters as the same, so a matches A.",
  "#chk_m": "Multiline (m): make ^ and $ match at the start and end of every line, not just of the whole text.",
  "#chk_s": "DotAll (s): let the dot . match line breaks too. Normally it stops at the end of a line.",
  "#chk_u": "Unicode (u): treat the text as Unicode, so characters outside the basic alphabet (emoji, many accents) count as one character and \\p{...} classes work.",
  "#chk_live": "When on, the results update as you type. It pauses for very large text or for patterns that could hang the computer; then press Test Pattern.",
  "#btn_load_corpus": "Load a text file (up to 5 MB) into the test text box to try the pattern on it. This replaces the current test text.",
  "#txt_corpus": "The text the pattern is tested against. Type, paste or load a file. Results update as you type if Live results is on.",
  "#txt_marked": "A copy of the test text with every match wrapped in « and ». It is for reading only; changes here are overwritten.",
  "#txt_group_n": "Which part of each match Copy Matches copies: 0 for the whole match, 1 for the first capture group (first set of parentheses), 2 for the second, and so on.",
  "#btn_copy_matches": "Copy the matches to the clipboard, one per line. It copies the part chosen in the group number box.",
  "#btn_export_matches": "Save all matches to a file you choose. A name ending in .csv gives a spreadsheet table; any other name gives JSON.",
  "#btn_copy_replaced": "Copy the result of the last Preview Replace to the clipboard. Run Preview Replace first.",
  "#btn_save_replaced": "Save the result of the last Preview Replace to a text file you choose. Run Preview Replace first.",
  "#dd_lang": "The programming language that Code Snippet writes code for.",
  "#btn_gen_code": "Write ready-to-use code that applies this pattern in the chosen language to the log, and copy it to the clipboard. The global flag is always included.",
  "#regex_console": "A log of tests, explanations, replacement previews, generated code and errors. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const regexStudioSkip: SkipRule[] = [
];
