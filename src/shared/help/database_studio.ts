import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `database_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const databaseStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_save_state": "Save the window size, theme, database path and the SQL in the editor so they are still here next time you open this app. It does not save the database itself.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#txt_db_path": "The SQLite database file to work with, for example data/app.db, relative to the folder this app was started from. :memory: is a temporary database that disappears when you close the app. Press Connect to switch to it.",
  "#btn_connect": "Open the database file named on the left and make it the active one. A file that does not exist yet is created. An empty database gets the demo tables. It then lists the tables or the developers.",
  "#btn_memory": "Switch to a fresh temporary database in memory with the demo developers and audit_logs tables. Anything in the temporary database you were using before is lost.",
  "#btn_seed": "Add 50 random fake developers to the developers table of the open database. It needs a table of that name and changes the database for real. The new rows are shown afterwards.",
  "#dd_sql_presets": "Pick a ready-made example query. It replaces the text in the editor and runs at once. The examples use the demo developers and audit_logs tables, so they fail on other databases.",
  "#btn_run_sql": "Run the SQL in the editor. A query that reads data (SELECT, PRAGMA, EXPLAIN, WITH, VALUES) shows its rows in the table. Any other statement such as INSERT, UPDATE, DELETE or DROP changes the database at once and cannot be undone. Shortcut: Cmd or Ctrl+Enter in the editor.",
  "#btn_explain": "Show how SQLite plans to run the SQL in the editor (EXPLAIN QUERY PLAN), for example whether it uses an index. The query itself is not run. Do not use it on a query that already starts with EXPLAIN.",
  "#btn_clear_query": "Empty the SQL editor. The results table and the database are not changed.",
  "#txt_sql_query": "Type SQL here, for example SELECT * FROM developers;. Press Execute SQL, or Cmd or Ctrl+Enter, to run it. Statements that change data run immediately.",
  "#btn_export_csv": "Save all rows of the last query result as query_export.csv in the folder this app was started from, replacing any older file of that name. Open it in a spreadsheet.",
  "#btn_export_json": "Save all rows of the last query result as query_export.json (a list of objects, one per row) in the folder this app was started from, replacing any older file of that name.",
  "#btn_export_inserts": "Save the last query result as INSERT statements for a table named query_export in query_export.sql, in the folder this app was started from. Replaces any older file of that name.",
  "#btn_table_stats": "Count the rows of every table in the open database and list them in the log at the bottom.",
  "#sql_console": "A log of every SQL statement run, how long it took, errors, exports and connections. You cannot type here.",
};

/** Controls that need no tip, each with a reason. */
export const databaseStudioSkip: SkipRule[] = [];
