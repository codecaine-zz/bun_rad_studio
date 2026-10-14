import type { HelpTips, SkipRule } from "../helpMatch";

/** Sd Studio: find and replace across many files, with diffs, backups and undo. */
export const sdStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and everything typed or ticked here (find, replace, targets, options), so it is restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_find": "The text to look for. It is a regular expression (a pattern such as \\d+ for numbers) unless Literal String Mode is ticked. Parentheses make capture groups you can reuse as $1, $2.",
  "#txt_replace": "What each match becomes. In regex mode, $1 and $2 insert the first and second capture group (the parts in parentheses). Leave it empty to delete the matches.",
  "#txt_targets": "The files and folders to search, separated by commas or spaces. A folder includes everything inside it, except hidden items, node_modules, .git, dist and build. Paths with spaces are not supported.",
  "#btn_browse_target": "Pick one file with the system dialog and make it the only target, replacing the Target box.",
  "#btn_browse_folder": "Pick a folder with the system dialog and make it the only target, replacing the Target box.",
  "#btn_count_matches": "Count the matches in each file without changing anything or building diffs. The files that contain matches are listed in the table.",
  "#btn_preview_diffs": "Show what the replacement would change, as a before and after comparison (diff) per file, without touching any file. Click a table row to see that file's diff.",
  "#btn_apply_replace": "Really change the files: replace every match in every target file. It asks you to confirm first. Run Preview Diffs before this, and tick Create Backup to keep the originals.",
  "#btn_clear": "Empty the Find and Replace boxes, the diff panel and the file table. Your targets and options stay.",
  "#chk_string_mode": "Literal String Mode: treat the Find text as plain text, so characters such as . * and ( have no special meaning.",
  "#chk_whole_word": "Whole Word Only: only match when the text is a whole word, not part of a longer word. For example cat does not match category.",
  "#chk_ignore_case": "Ignore Case: capital and small letters count as the same, so a matches A.",
  "#chk_backup": "Before a file is changed, save a copy of the original next to it, with the extension from the Ext box added to its name (for example notes.txt.bak).",
  "#txt_backup_ext": "The ending added to backup copies, such as .bak. Used only when Create Backup is ticked.",
  "#txt_flags": "Extra regular-expression flags as letters: i ignore case, m ^ and $ work on every line, s the dot also matches line breaks. The g flag (all matches) is always on.",
  "#chk_escapes": "When on, \\n in the replacement becomes a new line, \\t a tab and \\r a carriage return, and \\\\ a single backslash. When off, they are inserted as typed.",
  "#dd_preset": "Fill in a common job in one step, such as trimming trailing spaces, tabs to spaces or http to https. It overwrites Find, Replace, Flags and the options, then you click Preview Diffs.",
  "#btn_swap": "Exchange the text in Find and Replace With. Useful for reversing a replacement. In regex mode it is only meaningful for simple text.",
  "#txt_exts": "Only look at files with these extensions, separated by commas, for example ts,tsx,md. Leave empty to include every file. Binary files and files over 5 MB are always skipped.",
  "#txt_exclude": "Skip files whose path matches these patterns, separated by commas or spaces, for example *.min.js, vendor or test/**.",
  "#btn_undo_replace": "Put the files changed by the last Replace In Files back to their earlier content, after you confirm. It works only for that last replace, and only until you close this window.",
  "#btn_copy_diff": "Copy the diffs of all files from the last preview or replace to the clipboard.",
  "#btn_save_patch": "Save the diffs of the last preview or replace to a file you choose (sd_changes.diff by default).",
  "#btn_save_report": "Save a summary of the last count, preview or replace (files, matches, status) to a text or Markdown file you choose.",
  "#console_diffs": "Shows the before and after diff of each matching file, and any errors. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const sdStudioSkip: SkipRule[] = [
];
