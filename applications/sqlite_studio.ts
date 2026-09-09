import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Database } from "bun:sqlite";

export function createSqliteStudio(dbPath: string = ":memory:"): SimpleWindow {
  let db = new Database(dbPath);

  // Initialize sample in-memory table
  db.run(`
    CREATE TABLE IF NOT EXISTS developers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      stars INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );
  `);

  db.run(`
    INSERT OR IGNORE INTO developers (id, name, language, stars, active) VALUES
      (1, 'Linus Torvalds', 'C / Git', 99999, 1),
      (2, 'Brendan Eich', 'JavaScript', 88500, 1),
      (3, 'Jarred Sumner', 'Zig / TypeScript (Bun)', 76400, 1),
      (4, 'Dennis Ritchie', 'C / Unix', 99999, 0),
      (5, 'Guido van Rossum', 'Python', 62000, 1);
  `);

  const win = newSimpleWindow("SQLite Studio Pro -- Embedded Database Explorer & Query IDE", 1140, 880, {
    appId: "sqlite_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Top Title Bar
  win.beginRow();
  win.addHeading("SQLite Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();

  // Query & Preset Controls
  win.beginGroupBox("SQL Query Editor & Presets");
  win.beginRow();
  win.addLabel("lbl_presets", "SQL Snippets:");
  win.addDropdown("dd_sql_presets", [
    "1. Select All Developers (SELECT * FROM developers)",
    "2. High Star Ranking (SELECT * FROM developers WHERE stars > 70000)",
    "3. Active Status Counts (SELECT active, count(*) FROM developers GROUP BY active)",
    "4. Schema Info (PRAGMA table_info(developers))",
    "5. Database Tables (SELECT name FROM sqlite_master WHERE type='table')",
  ], "1. Select All Developers (SELECT * FROM developers)");
  win.addButton("btn_run_sql", "⚡ Execute SQL (Cmd+Enter)");
  win.addButton("btn_reset_db", "Reset Sample DB");
  win.endRow();

  win.addTextarea("txt_sql_query", "SELECT * FROM developers ORDER BY stars DESC;");
  win.endGroupBox();

  // Results Table
  win.beginGroupBox("Tabular Query Results");
  win.addTable("tbl_results", ["id", "name", "language", "stars", "active"], [
    ["1", "Linus Torvalds", "C / Git", "99999", "1"],
    ["4", "Dennis Ritchie", "C / Unix", "99999", "0"],
    ["2", "Brendan Eich", "JavaScript", "88500", "1"],
    ["3", "Jarred Sumner", "Zig / TypeScript (Bun)", "76400", "1"],
    ["5", "Guido van Rossum", "Python", "62000", "1"],
  ]);
  win.endGroupBox();

  // Execution Telemetry
  win.beginGroupBox("Query Execution & Audit Log");
  win.addConsole("sql_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Rows: 5  |  Execution Time: 0.12ms");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());

  const executeSql = () => {
    const sql = (win.getValue("txt_sql_query") || "").trim();
    if (!sql) return;

    win.appendConsole("sql_console", `[SQLite] Executing: ${sql}\n`, 1);
    const t0 = performance.now();

    try {
      if (/^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql)) {
        const query = db.query(sql);
        const rows = query.all() as Record<string, any>[];
        const elapsed = (performance.now() - t0).toFixed(2);

        if (rows.length === 0) {
          win.setTableData("tbl_results", ["Status"], [["(0 rows returned)"]]);
        } else {
          const firstRow = rows[0] || {};
          const headers = Object.keys(firstRow);
          const data = rows.map((r) => headers.map((h) => String(r[h] ?? "")));
          win.setTableData("tbl_results", headers, data);
        }

        win.appendConsole("sql_console", `[SQLite] Success: ${rows.length} rows returned in ${elapsed}ms\n`, 2);
        win.setStatus(`Query OK (${rows.length} rows, ${elapsed}ms)`);
      } else {
        db.run(sql);
        const elapsed = (performance.now() - t0).toFixed(2);
        win.appendConsole("sql_console", `[SQLite] Statement executed successfully in ${elapsed}ms\n`, 2);
        win.setStatus(`Statement executed (${elapsed}ms)`);
      }
    } catch (e: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.appendConsole("sql_console", `[SQLite Error] ${e.message} (${elapsed}ms)\n`, 3);
      win.setStatus(`Error: ${e.message}`);
    }
  };

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("SQLite Studio state saved!");
  });
  win.onClick("btn_run_sql", executeSql);

  win.onChange("dd_sql_presets", (_w, selected: string) => {
    if (selected.includes("Select All")) {
      win.setText("txt_sql_query", "SELECT * FROM developers;");
    } else if (selected.includes("High Star")) {
      win.setText("txt_sql_query", "SELECT * FROM developers WHERE stars > 70000 ORDER BY stars DESC;");
    } else if (selected.includes("Active Status")) {
      win.setText("txt_sql_query", "SELECT active, count(*) as count FROM developers GROUP BY active;");
    } else if (selected.includes("Schema Info")) {
      win.setText("txt_sql_query", "PRAGMA table_info(developers);");
    } else if (selected.includes("Database Tables")) {
      win.setText("txt_sql_query", "SELECT name, type, sql FROM sqlite_master;");
    }
    executeSql();
  });

  return win;
}

export const createDatabaseStudio = createSqliteStudio;

if (import.meta.main) {
  const win = createDatabaseStudio();
  console.log("Launching Database Studio Pro...");
  win.run();
}
