import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `jq_studio` (the same page is used by `json_studio`). Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const jqStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_filter": "The query to run on the input JSON. A single dot (.) means the whole document. Try .author.name, .modules[0] or .tags | join(\", \"). Text starting with $ is run as JavaScript, with $ as your data.",
  "#dd_engine": "Who runs the query: the built-in engine, which understands common jq filters and JavaScript, or the jq program installed on this computer. If jq is not installed, the built-in engine is used anyway.",
  "#btn_execute": "Run the query on the input document and show the result in the output box. A mistake in the query or in the JSON is explained in the output and the log.",
  "#dd_presets": "Pick a ready-made example query. It is typed into the query box and run at once on the current input.",
  "#btn_reset_sample": "Put the built-in sample document back into the input and output boxes and set the query to a dot. Anything you typed there is lost.",
  "#btn_open": "Choose a .json, .csv, .txt or .geojson file and load it into the input box. A CSV file is turned into JSON on the way in.",
  "#btn_url": "Ask for a web address that returns JSON, such as https://example.com/data.json, and load the answer into the input box.",
  "#btn_save_out": "Save the output box to a file you choose. The suggested file name ends in .csv, .yaml or .json depending on what the output looks like.",
  "#btn_save_in": "Save the input box to a file you choose, suggested name input.json.",
  "#btn_copy_out": "Copy the whole output box to the clipboard.",
  "#btn_swap": "Move the output into the input box, so your next query works on the result of this one.",
  "#btn_clear_all": "Empty the input and output boxes and reset the query to a dot. This cannot be undone.",
  "#dd_indent": "How far nested lines are indented when JSON is written out: 2 spaces, 4 spaces or a tab. Used by Format, Sort Keys and query output from the built-in engine.",
  "#btn_format": "Rewrite the input JSON neatly, one item per line, with the chosen indent. Stops with an error message if the JSON is not valid.",
  "#btn_minify": "Squeeze the input JSON onto one line by removing all spaces and line breaks. Stops with an error message if the JSON is not valid.",
  "#btn_sort_keys": "Put the names inside every object of the input in alphabetical order, all the way down. The input is rewritten with the chosen indent.",
  "#btn_validate": "Check that the input is valid JSON. If not, the log tells you the line and column of the first mistake.",
  "#btn_stats": "Count what the input contains (objects, arrays, keys, strings, numbers), its size in bytes and how deeply it is nested. The numbers appear in the log and the status line.",
  "#chk_compact": "ON writes query results from the built-in engine on one line. OFF spreads them over several lines using the Indent setting.",
  "#chk_live": "ON runs the query again each time you change the query box, so the output keeps up. OFF runs it only when you press Run Query.",
  "#btn_to_csv": "Turn the output into CSV text, which spreadsheets can open. Works best when the output is a list of objects. The output must be valid JSON first.",
  "#btn_to_yaml": "Turn the output into YAML, a more readable text format. The output must be valid JSON first.",
  "#btn_csv_in": "Treat the input as CSV (the first line holds the column names) and turn it into a JSON list with one object per row.",
  "#txt_find": "A word to look for in the names and values of the input JSON. The search ignores upper and lower case. Press Enter to search.",
  "#btn_find": "List every key or value in the input that contains the search word, with its path, in the log. The output box shows just the paths. At most 100 matches are shown.",
  "#txt_input_json": "The JSON document to work on. Type, paste, or load one with Open File or Load URL. Queries and the tools above read from here.",
  "#txt_output_json": "The result of the last query or conversion. You can edit it, copy it, or move it back to the input with Output to Input.",
  "#jq_console": "A log of what was done, how long queries took and any errors. You can select and copy text from it.",
};

/** Controls that need no tip, each with a reason. */
export const jqStudioSkip: SkipRule[] = [
];
