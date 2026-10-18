import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `tokei_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const tokeiStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Save the window size, theme and what you typed or ticked in the boxes, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_path": "The folder to count lines of code in. A dot means the folder the app was started from. Subfolders are included.",
  "#dd_sort": "Which column orders the language table: Code, Files, Lines, Comments or Blanks, biggest first. It applies the next time you press Analyze.",
  "#txt_exclude": "Folder or file names to skip, separated by commas, such as node_modules,dist. Exact names only, not wildcards. node_modules, .git, .graveyard, dist and build are always skipped.",
  "#btn_analyze": "Scan the folder and count files, code lines, comment lines and blank lines for each programming language. The table and totals update; a scan also runs when the app opens.",
  "#chk_hidden": "ON: also count files and folders whose names start with a dot, such as .github. OFF: skip them.",
  "#chk_files": "ON: the preview box lists every file with its own line counts. OFF: it shows a Markdown table of the languages instead.",
  "#btn_copy_markdown": "Show the results as a Markdown table in the preview box and copy it to the clipboard, ready to paste into a README. Run Analyze first.",
  "#btn_export_json": "Show the results as JSON text in the preview box, for use in other programs. Nothing is saved to a file and nothing is copied. Run Analyze first.",
  "#btn_clear": "Empty the language table and the preview box. The totals above stay until the next scan.",
  "#console_tokei": "Preview of the report: a Markdown table, a per-file list or JSON, depending on your last action.",
};

/** Controls that need no tip, each with a reason. */
export const tokeiStudioSkip: SkipRule[] = [];
