import type { HelpTips, SkipRule } from "../helpMatch";

/** Markdown & Documentation Studio. */
export const markdownStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and the document text, so they are restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_render": "Turn the Markdown text into a formatted page in the preview and update the word, character and line counts. This also happens while you type.",
  "#btn_insert_table": "Add a sample table (in Markdown) at the end of your document, then refresh the preview. Edit the sample to fit your data.",
  "#btn_insert_code": "Add a sample TypeScript code block (between ``` lines) at the end of your document, then refresh the preview.",
  "#btn_insert_alert": "Add a sample highlighted note box (a quote line that starts with [!NOTE]) at the end of your document. Other kinds: TIP, IMPORTANT, WARNING, CAUTION.",
  "#btn_reset_doc": "Replace everything in the editor with the built-in sample document. Your own text is lost unless you copied it.",
  "#btn_export_html": "Save the rendered document as document_export.html in the folder this app was started from. An existing file with that name is overwritten.",
  "#txt_md_input": "Write your document in Markdown: # for headings, ** for bold, - for lists, | for tables. The preview below updates as you type.",
  "#md_console": "A log of each render (words, lines, time taken) and of HTML exports. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const markdownStudioSkip: SkipRule[] = [];
