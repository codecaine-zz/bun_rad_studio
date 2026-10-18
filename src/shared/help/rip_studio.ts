import type { HelpTips, SkipRule } from "../helpMatch";

/** Rip Studio: bury files in a recoverable graveyard instead of deleting them. */
export const ripStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and what is typed in the boxes, so they are restored next time you open this app.",
  "#btn_refresh": "Read the graveyard again and update the table and the counts, for example after burying or restoring items from another program.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_bury_target": "The full path of the file or folder to bury, for example /Users/me/old_notes.txt. Use the Browse buttons to pick one instead of typing.",
  "#btn_browse_file": "Pick a file with the system dialog, put its path in the Target Path box and check it at once. The file is not moved yet.",
  "#btn_browse_folder": "Pick a folder with the system dialog, put its path in the Target Path box and check it at once. The folder is not moved yet.",
  "#btn_inspect_target": "Check the target without changing it: whether it exists, its type, size and file count, and whether it is a protected system location that cannot be buried.",
  "#btn_bury_target": "Move the target into the graveyard, a holding folder, instead of deleting it. It is gone from its place but can be restored with Unbury. No confirmation is asked.",
  "#btn_clear_input": "Empty the Target Path box and reset the inspection message. Nothing is moved.",
  "#btn_filter_all": "Show every buried item in the table.",
  "#btn_filter_cwd": "Show only items that were buried from the folder this app was started in, or from folders inside it.",
  "#btn_filter_files": "Show only buried files, not folders.",
  "#btn_filter_dirs": "Show only buried folders, not single files.",
  "#txt_search_filter": "Type part of a name, an original path or an item ID to narrow the table. Press the Filter button to apply it.",
  "#btn_search_go": "Apply the search text and the chosen type filter to the table.",
  "#btn_unbury_selected": "Move the selected item back to the place it was buried from. It fails if something already exists there. Click a row in the table first.",
  "#btn_unbury_last": "Restore the item that was buried most recently, back to its original place. It fails if something already exists there.",
  "#btn_decompose_selected": "Permanently delete the selected item from the graveyard. It cannot be restored afterwards and no confirmation is asked. Click a row in the table first.",
  "#btn_decompose_all": "Permanently delete every item in the graveyard and free the disk space. It cannot be undone and no confirmation is asked.",
  "#btn_preview_item": "Show the first part of the selected item in the log below: the beginning of a text file (about 2500 characters), or the first 30 names inside a folder.",
  "#btn_copy_path": "Show the original location of the selected item in the log and in a message. In the desktop window it does not put the path on the clipboard.",
  "#rip_console": "A log of burials, restores, previews and errors. You can't type here.",
  "#btn_clear_console": "Empty the log. Nothing is buried, restored or deleted.",
};

/** Controls that need no tip, each with a reason. */
export const ripStudioSkip: SkipRule[] = [];
