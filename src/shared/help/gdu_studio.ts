import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `gdu_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const gduStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_path": "The folder to measure, such as /Users/you/Downloads or C:\\Users\\you. A dot (.) means the folder this app was started in. Press Scan Target to measure it.",
  "#dd_sort": "How the rows are ordered: biggest first, by name, by number of items inside, or newest first. The order is applied the next time you scan.",
  "#txt_min_size": "Optional. Hide rows smaller than this size, for example 500k, 1M or 2G. Leave empty to list everything. Applies to the next scan and only changes the list, not the total.",
  "#chk_si": "ON shows sizes in decimal units (1 MB = 1,000,000 bytes). OFF uses binary units (1 MB = 1,048,576 bytes). Takes effect on the next scan.",
  "#chk_no_hidden": "ON leaves out files and folders whose names start with a dot (hidden items) when measuring, so they are not counted in the sizes. Takes effect on the next scan.",
  "#btn_scan": "Measure every file and folder inside the target path and list the items with their size, a bar showing their share, their item count and date. Big folders can take a while.",
  "#btn_parent": "Go up one folder from the one now shown and scan it.",
  "#btn_drill_in": "Scan inside the folder you selected in the table, to see what takes up its space. Select a folder row first; files cannot be opened.",
  "#btn_disks": "Show the disks and volumes connected to this computer, with their sizes and free space, in the box at the bottom.",
  "#btn_delete": "Permanently delete the item selected in the table, after you confirm. Folders are deleted with everything inside. It does not go to the Trash and cannot be undone.",
  "#btn_rescan": "Measure the current folder again, for example after you deleted or added files.",
  "#console_gdu": "Details of the selected table row (type, exact size, path, date), the current folder's total, or the list of mounted disks.",
};

/** Controls that need no tip, each with a reason. */
export const gduStudioSkip: SkipRule[] = [
];
