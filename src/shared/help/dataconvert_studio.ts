import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `dataconvert_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const dataconvertStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_save_state": "Save the window size, theme, both formats and the text in the input and output boxes so they are still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#dd_from": "The format of the text in the Source Document box. Convert reads it this way. Paste, Import and Load Preset set it for you when they can tell the format. For Base64 and URL Encoded, Convert only decodes the text.",
  "#dd_to": "The format you want. Convert writes the result in the Output box. Table-like sources can become JSON, CSV, YAML, XML, SQL INSERTs, an HTML table and more. Base64 and URL Encoded encode the whole input text.",
  "#btn_convert": "Convert the source document into the target format and show the result in the Output box and the table preview. Shortcut: Cmd or Ctrl+Enter. Errors, such as invalid JSON, are shown in the log.",
  "#btn_paste_from_clipboard": "Replace the source document with the text on your clipboard, guess its format (JSON, XML, CSV, TSV, YAML or Markdown table) and convert it straight away.",
  "#btn_swap": "Use the output as the new input and reverse the direction, then convert. It is simplified: the new source is JSON if the old target was a JSON format, otherwise CSV; the new target is CSV if the old source was JSON, otherwise JSON.",
  "#btn_export": "Save the Output box to a file named converted_data with an extension that fits the target format (json, csv, md, sql and so on), in the folder this app was started from. An older file of that name is replaced.",
  "#dd_samples": "Choose one of the built-in example datasets. Nothing happens until you press Load Preset.",
  "#btn_load_sample": "Load the example chosen on the left: it fills the source box, sets the source and target formats and converts it. Replaces the current input. You can undo it.",
  "#btn_beautify": "Tidy the source document. Valid JSON is re-indented so it is easy to read; any other text only has spaces at the start and end of each line removed. Then it converts again.",
  "#btn_minify": "Shrink the source document. Valid JSON is squeezed onto one line; any other text only has runs of spaces and tabs reduced to one space. Then it converts again.",
  "#btn_clear_input": "Empty the source document, the output and the table preview. You can bring it back with Undo.",
  "#btn_paste": "Replace the source document with the text on your clipboard, guess its format (JSON, XML, CSV, TSV, YAML or Markdown table) and convert it straight away.",
  "#btn_undo": "Step back to the previous source text and formats, up to 100 steps, and convert again. Shortcut: Cmd or Ctrl+Z. Take care: the shortcut works anywhere in this window.",
  "#btn_redo": "Step forward again after an Undo and convert. Shortcut: Cmd or Ctrl+Y, or Shift+Cmd or Shift+Ctrl+Z.",
  "#btn_select_all_input": "Select all the text in the source document, ready to copy or replace.",
  "#btn_copy_input": "Copy the whole source document to the clipboard.",
  "#btn_import": "Open a data file (.csv, .tsv, .json, .jsonl, .ndjson, .yaml, .toml, .xml, .md or .txt) with a file dialog. It becomes the source document, its format is set from the file extension and it is converted. You can also drop a file onto the window.",
  "#txt_input_data": "The source document: paste, type, import or drop a file here. The format on the Source Format list decides how it is read. Typing only updates the counts; press Convert (or Cmd or Ctrl+Enter) to convert.",
  "#btn_copy_output": "Copy the whole output to the clipboard. Does nothing if the output box is empty.",
  "#btn_select_all_output": "Select all the text in the output box, ready to copy.",
  "#btn_export_output": "Save the Output box to a file named converted_data with an extension that fits the target format (json, csv, md, sql and so on), in the folder this app was started from. An older file of that name is replaced.",
  "#txt_output_data": "The converted result. Each Convert replaces it. You can select and copy it, or edit it before saving, but edits are not read back by the converter.",
  "#txt_grid_search": "Type a word to show only the rows of the preview table that contain it in any column. The match ignores capital letters. Press Filter Grid to apply it.",
  "#btn_filter_grid": "Apply the search word to the preview table. It hides non-matching rows from the table only; the output text is not changed. An empty search shows all rows.",
  "#btn_reset_grid": "Clear the search word and show all rows of the preview table again.",
  "#dc_console": "A log of conversions, imports, presets, exports and errors. You cannot type here.",
};

/** Controls that need no tip, each with a reason. */
export const dataconvertStudioSkip: SkipRule[] = [];
