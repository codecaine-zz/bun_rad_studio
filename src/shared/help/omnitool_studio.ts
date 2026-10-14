import type { HelpTips, SkipRule } from "../helpMatch";

/** DevTools Studio / OmniTool Studio: search, find, replace, trash and JSON query in one window. */
export const omnitoolStudioTips: HelpTips = {
  "#dd_mode": "Choose which tool the Execute button runs: code search, file finder, find and replace, watcher (only shows a note, it does not watch files), safe trash or JSON query. Each tool uses only some of the fields below.",
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and what is typed in the boxes and ticked below, so they are restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_search_path": "The folder or file the tool works on. A relative path starts from the folder this app was launched in. Use the Folder and File buttons to pick one.",
  "#btn_browse_folder": "Pick a folder with the system dialog and put its path in the Target Path box.",
  "#btn_browse_target_file": "Pick a single file with the system dialog and put its path in the Target Path box. Useful for searching one file or loading a JSON file.",
  "#txt_pattern": "What to look for. Search, Find and Replace use a regular expression (a pattern such as foo|bar) unless Literal is ticked. For the JSON tool, type a query such as .name, or a JSON object to test it.",
  "#txt_replace": "Text that replaces each match in Find and Replace mode. In regex mode, $1 and $2 insert parts of the match that are in parentheses. Other modes ignore this box.",
  "#txt_include": "Limit which files are used. Type name patterns such as *.ts, or put ! in front to leave files out, such as !*.test.ts. Separate several with spaces or commas.",
  "#txt_max": "The most results to list for Search and Find, from 1 to 100000. The default is 200. The list stops there and says so.",
  "#txt_context": "Search only: how many lines before and after each match to show, from 0 to 20.",
  "#dd_fd_type": "File Finder only: list files and folders, only files, or only folders.",
  "#chk_case": "When on, capital letters must match exactly (Foo does not match foo). When off, case is ignored. This applies to Search, Find and Replace.",
  "#chk_word": "When on, a match must be a whole word, not part of a longer one. For example cat does not match category.",
  "#chk_fixed": "When on, the pattern is plain text and characters such as . and * have no special meaning. When off, it is a regular expression.",
  "#chk_hidden": "When on, files and folders whose names start with a dot (such as .env and .git contents) are included. When off, they are skipped.",
  "#chk_gitignore": "When on, files and folders listed in the .gitignore file at the top of the target folder are skipped.",
  "#chk_files_only": "Search only: list just the names of files that contain a match, with a count, instead of every matching line.",
  "#chk_dry_run": "Find and Replace only. When on, the tool only shows what would change and writes nothing. Turn it off to really change the files.",
  "#chk_backup": "Find and Replace only: before changing a file, save the original beside it as the file name plus .bak. Only matters when Dry Run is off.",
  "#btn_run_omni": "Run the tool chosen in the first list on the target path. Find and Replace (when Dry Run is off) and Safe Trash ask you to confirm first. The output appears in the results box.",
  "#btn_clear_out": "Empty the results box. Nothing on disk is affected.",
  "#btn_copy_results": "Copy everything in the results box to the clipboard.",
  "#btn_save_results": "Save everything in the results box to a text file you choose.",
  "#btn_undo_trash": "Move the item last sent to the Trash by this window back to its original place. It only remembers one item, and only until you close the window.",
  "#txt_results": "The output of the last run. You can select and edit the text here, and copy or save it with the buttons above.",
  "#omni_console": "A log of each run: the tool, how many files were scanned or changed and how long it took. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const omnitoolStudioSkip: SkipRule[] = [
];
