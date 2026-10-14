import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `fd_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const fdStudioTips: HelpTips = {
  // Window
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_unbury_last": "Bring back the item that was most recently buried (moved to the graveyard) to the place it came from. Only items still marked as buried count.",
  "#btn_toggle_graveyard": "Show or hide the Graveyard panel at the bottom. The number is how many buried items it holds. Buried items are kept safe and can be restored.",

  // Search
  "#txt_pattern": "What to look for in file and folder names. How it is read depends on Mode: a regex (pattern language), a glob such as *.ts, or plain text. Leave empty to list everything. Press Enter to search.",
  "#txt_root": "The folder to search in, including all folders inside it. A dot (.) is the folder this app was started in. Press Enter to search again. New File and New Folder also use this folder.",
  "#btn_browse_root": "Choose the folder to search in from a folder picker, then search it straight away.",
  "#dd_mode": "How the pattern is read. Regex: a pattern language, for example ^test.*\\.ts$. Glob: wildcards such as *.png. Fixed String: the exact letters you typed. Changing it searches again.",
  "#dd_case": "Whether capital letters matter. Smart Case ignores them unless the pattern contains a capital. Case Sensitive and Ignore Case do what they say. Changing it searches again.",
  "#btn_search": "Search the Search Root with the pattern and all the filters, then list the matches in the table. Click a row to select it.",
  "#btn_toggle_watch": "Start or stop the live watcher. While it runs, the search repeats by itself whenever a file in the Search Root changes. Names starting with a dot, .git and node_modules are ignored.",
  "#btn_clear": "Stop the watcher and reset the pattern, root, extensions, max depth, size and type filter, then search again. Exclude, Min Depth, Modified and the checkboxes stay as they are.",
  "#dd_preset": "Pick a ready-made search such as Images, Logs or Large files. It fills in extensions, size, age and type, replaces the pattern, and searches at once.",
  "#dd_history": "Your last searches. Pick one to put its pattern back in the Pattern box and search again. Only patterns that were not empty are kept.",
  "#txt_max_results": "The most items to list. Searching stops when this many are found. The default is 1500 and the highest allowed is 20000.",
  "#dd_sort": "Change the order of the rows in the table. This only reorders the current results; it does not search again.",
  "#txt_filter": "Type part of a name or path to hide other rows from the current results, without searching again. Batch buttons then only act on the rows still shown.",

  // Type and constraints
  "#btn_type_all": "Show every kind of item: files, folders, links and so on. This is the default.",
  "#btn_type_files": "Show only regular files, no folders. Searches again.",
  "#btn_type_dirs": "Show only folders. Searches again.",
  "#btn_type_exec": "Show only files the system marks as executable (programs and scripts). Searches again.",
  "#btn_type_symlinks": "Show only symbolic links, which are shortcuts to another file or folder. Searches again.",
  "#btn_type_empty": "Show only files with no content and folders with nothing in them. Searches again.",
  "#txt_exts": "Only list files with these endings. Separate several with commas, for example ts,tsx,json. A leading dot is fine.",
  "#txt_exclude": "Names or paths to leave out, separated by commas. Wildcards such as *.log work. It starts with node_modules, dist and .git; delete the text to exclude nothing.",
  "#txt_min_depth": "Skip matches that are too shallow. 1 means items directly inside the root folder; 2 starts one folder deeper. Leave empty for no limit.",
  "#txt_max_depth": "Do not look deeper than this many folder levels. 1 means only items directly inside the root folder. Leave empty to search all levels.",
  "#txt_size": "Filter by size. +1M means bigger than 1 MB, -10k means smaller than 10 KB, and 5M alone means about 5 MB (within 10 percent). Units are k, M, G, T.",
  "#dd_age": "Only list items changed within the chosen time. Changing it searches again.",
  "#chk_hidden": "ON also lists files and folders whose names start with a dot (hidden items). OFF skips them. Applies the next time you search.",
  "#chk_no_ignore": "ON ignores the .gitignore rules and the built-in skip of node_modules, .git and .DS_Store. OFF respects them. The Exclude box still applies. Applies the next time you search.",
  "#chk_follow": "ON treats a symbolic link as the file or folder it points to and looks inside linked folders. OFF treats links as links. Applies the next time you search.",
  "#chk_full_path": "ON (-p) matches the pattern against the whole path, not only the name. OFF matches the name only. Applies the next time you search.",
  "#chk_watch": "ON starts the live watcher, which repeats the search when files in the Search Root change. OFF stops it. Same as the Start Watcher button.",

  // Selected item
  "#btn_copy_rel": "Copy the path of the selected item, counted from the Search Root, to the clipboard.",
  "#btn_copy_abs": "Copy the complete path of the selected item to the clipboard.",
  "#btn_reveal": "Show the selected item in your computer's file manager (Finder on a Mac, Explorer on Windows).",
  "#btn_preview_content": "Show the first 2000 characters of the selected text file in the console below. For a folder it lists the first 30 entries. Files over 5 MB are not previewed.",
  "#btn_move_one": "Move the selected item into the Target Destination Folder, creating that folder if needed. There is no confirmation, and a file with the same name there is replaced.",
  "#btn_bury_one": "Move the selected item to the graveyard instead of deleting it. You can bring it back with Undo Rip or from the Graveyard panel.",
  "#btn_delete_one": "Permanently delete the selected item, with everything inside if it is a folder, after you confirm. It cannot be undone; Safe Bury keeps it recoverable.",
  "#txt_exec_cmd": "A shell command to run on matches. {} is replaced by the file path; {/} is the name, {.} the path without extension, {//} the folder. If you leave {} out it is added at the end. Press Enter to run it on the selected item.",
  "#btn_exec_one": "Run the command on the selected item only and show its output in the console. For example wc -l {} counts the lines of a file.",
  "#btn_exec_all": "Run the command once with all listed matches filled in at once (like fd -X) and show the output in the console. Check the command first: it can change or delete files.",

  // Batch operations
  "#txt_dest_dir": "The folder that Move Item, Copy All, Move All, Archive All and the exports use. It is created if missing. ./output is relative to where this app was started.",
  "#btn_browse_dest": "Choose the destination folder from a folder picker.",
  "#btn_copy_all_files": "Copy every listed match into the destination folder. Items go straight into it without their sub-folders, and files with the same name are overwritten.",
  "#btn_move_all": "Move every listed match into the destination folder. There is no confirmation. Items lose their sub-folders and files with the same name there are replaced.",
  "#btn_archive_all": "Pack all listed files into one .tar.gz archive in the destination folder, with their relative paths. Folders themselves are not included.",
  "#btn_copy_all_rel": "Copy the relative paths of all listed matches to the clipboard, one per line.",
  "#btn_copy_all_abs": "Copy the full paths of all listed matches to the clipboard, one per line.",
  "#btn_export_json": "Save the listed matches as fd_search_results.json in the destination folder and copy the same text to the clipboard.",
  "#btn_export_csv": "Save the listed matches as fd_search_results.csv in the destination folder, which spreadsheets can open, and copy the text to the clipboard.",
  "#btn_export_saveas": "Choose where to save the listed matches. The file type you give decides the format: .json, .csv, .tsv, .md or .txt (list of paths).",
  "#btn_bury_all": "Move every listed match to the graveyard instead of deleting it. There is no confirmation, but you can restore the items from the Graveyard panel.",
  "#btn_delete_all": "Permanently delete every listed match, including the contents of folders, after you confirm the count. It cannot be undone. Safe Bury All is the recoverable choice.",

  // File operations
  "#txt_ops_name": "A name for New File, New Folder or Rename Selected. Use a name only, without slashes.",
  "#btn_new_file": "Create an empty file with the typed name in the Search Root folder. Undo Last Change can remove it again.",
  "#btn_new_folder": "Create a folder with the typed name in the Search Root folder. Undo Last Change can remove it again.",
  "#btn_rename_one": "Rename the selected item to the typed name, in the same folder. It will not overwrite an existing item. Undo Last Change can reverse it.",
  "#btn_duplicate_one": "Make a copy of the selected file or folder next to it, named with the word copy added. Undo Last Change can remove the copy.",
  "#btn_open_one": "Open the selected item with the program your computer normally uses for it.",
  "#txt_chmod": "The new permissions: octal such as 644 (owner may write, everyone may read) or 755 (also executable), or letters such as rwxr-xr-x. These matter on Mac and Linux.",
  "#btn_chmod": "Change the permissions of the selected item to the value on the left. The old and new values are shown in the console. Undo Last Change does not reverse it.",
  "#btn_preview_hex": "Show the first 256 bytes of the selected file as hexadecimal numbers next to text in the console. Useful for binary files. Not for folders.",
  "#btn_undo_op": "Reverse the latest New File, New Folder, Rename, Duplicate or Batch Rename. The number is how many steps can be undone. Moves, deletes and permission changes are not included.",
  "#txt_br_find": "Text to look for in the names of all listed matches, ignoring the file ending. Leave empty if you only want a prefix, suffix, number or case change.",
  "#txt_br_replace": "What to put in place of the found text. Leave empty to remove it. With Regex on, $1 can insert a captured part.",
  "#chk_br_regex": "ON reads the Find text as a regex (pattern language). OFF treats it as plain letters.",
  "#dd_br_case": "Change the capital letters of the new names: all lowercase, all UPPERCASE, or Title Case. Keep Case leaves them.",
  "#txt_br_prefix": "Text to add to the start of every new name.",
  "#txt_br_suffix": "Text to add to the end of every new name, before the file ending.",
  "#chk_br_number": "ON adds a counter such as _001, _002 to each new name, in the order of the table.",
  "#chk_br_spaces": "ON replaces spaces in the names with underscores.",
  "#btn_br_preview": "List how the listed matches would be renamed, marking any that would clash, without changing anything.",
  "#btn_br_apply": "Rename all listed matches by the rules above, after you confirm. The file ending is kept. Undo Last Change can reverse the batch.",
  "#txt_grep": "Text to look for inside the listed files (not their names). Binary files and files over 5 MB are skipped.",
  "#chk_grep_regex": "ON reads the text to find as a regex (pattern language). OFF looks for exactly those letters.",
  "#chk_grep_case": "ON matches capital and small letters exactly. OFF ignores the difference.",
  "#btn_grep": "Search inside the listed files for the text. Matching lines with file name and line number appear in the console; the first 80 are shown.",
  "#btn_dupes": "Find listed files with identical content, by size and a checksum, and show how much space the extra copies use. Nothing is changed.",
  "#btn_largest": "Show the 15 biggest files among the listed matches in the console.",
  "#btn_ext_stats": "Show how much disk space each file type uses among the listed matches, biggest first.",
  "#btn_export_tsv": "Save the listed matches as fd_search_results.tsv (tab-separated) in the destination folder and copy the text to the clipboard.",
  "#btn_export_md": "Save the listed matches as a Markdown table, fd_search_results.md, in the destination folder and copy the text to the clipboard.",
  "#btn_export_paths": "Save the full paths of the listed matches, one per line, as fd_search_results.txt in the destination folder and copy the text to the clipboard.",

  // Graveyard
  "#btn_unbury_selected": "Move the selected buried item back to the place it was buried from.",
  "#btn_decompose_selected": "Permanently delete the selected buried item from the graveyard. It asks for no confirmation and cannot be undone.",
  "#btn_decompose_all": "Permanently delete everything in the graveyard. It asks for no confirmation and cannot be undone.",
  "#btn_refresh_graveyard": "Read the graveyard again and update the list and the counts.",

  // Console
  "#fd_console": "The log of what you did and what happened, with command output, previews and errors.",
  "#btn_clear_console": "Empty the console log below. It does not change any files.",
};

/** Controls that need no tip, each with a reason. */
export const fdStudioSkip: SkipRule[] = [
];
