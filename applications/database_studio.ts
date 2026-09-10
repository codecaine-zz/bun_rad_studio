/**
 * Database Studio Pro -- Embedded Database Explorer & Query IDE
 * High-performance embedded SQLite workbench powered by native bun:sqlite.
 */
import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Database } from "bun:sqlite";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

export function createSqliteStudio(initialDbPath: string = ":memory:", options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  let activeDbPath = initialDbPath;
  let db = new Database(activeDbPath);

  // Initialize corporate starter schema
  const initStarterSchema = (database: Database) => {
    database.run(`
      CREATE TABLE IF NOT EXISTS developers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        language TEXT NOT NULL,
        department TEXT DEFAULT 'Engineering',
        stars INTEGER DEFAULT 0,
        salary INTEGER DEFAULT 120000,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      );
    `);

    const count = (database.query("SELECT count(*) as c FROM developers;").get() as any)?.c || 0;
    if (count === 0) {
      database.run(`
        INSERT INTO developers (name, language, department, stars, salary, active) VALUES
          ('Linus Torvalds', 'C / Git', 'Core Systems', 99999, 350000, 1),
          ('Brendan Eich', 'JavaScript', 'Web Architecture', 88500, 320000, 1),
          ('Jarred Sumner', 'Zig / TypeScript', 'Runtime Infrastructure', 76400, 310000, 1),
          ('Dennis Ritchie', 'C / Unix', 'Operating Systems', 99999, 300000, 0),
          ('Guido van Rossum', 'Python', 'Language Design', 62000, 280000, 1),
          ('Ada Lovelace', 'Analytical Engine', 'Pioneering', 100000, 400000, 0),
          ('Grace Hopper', 'COBOL / Compilers', 'Systems Architecture', 98000, 330000, 0),
          ('Ken Thompson', 'Go / Unix / B', 'Core Systems', 97000, 320000, 1);
      `);
      database.run(`
        INSERT INTO audit_logs (action, entity, details) VALUES
          ('SCHEMA_INIT', 'DATABASE', 'Enterprise schema initialized with seed data.');
      `);
    }
  };

  initStarterSchema(db);

  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("Database Studio Pro (SQLite Studio Pro) -- Enterprise SQLite Workbench & Query IDE", 1160, 900, {
    appId: "sqlite_studio",
    theme: options.theme || getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
    fullscreen,
  });

  // Top Title Bar
  win.beginRow();
  win.addHeading("Database Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise SQLite Workbench Powered by Native bun:sqlite -- Sub-Millisecond Embedded SQL Engine");

  // Connection & Database Source
  win.beginGroupBox("Database Source & Connection Profile");
  win.beginRow();
  win.addLabel("lbl_path", "Database File:");
  win.addInput("txt_db_path", activeDbPath).width(340);
  win.addButton("btn_connect", "🔌 Connect / Reload");
  win.addButton("btn_memory", "🧠 In-Memory DB");
  win.addButton("btn_seed", "🌱 Seed 50 Records");
  win.endRow();
  win.endGroupBox();

  // Query & Preset Controls
  win.beginGroupBox("SQL Query Editor & Execution Presets");
  win.beginRow();
  win.addLabel("lbl_presets", "SQL Snippets:");
  win.addDropdown(
    "dd_sql_presets",
    [
      "1. Select All Developers (SELECT * FROM developers ORDER BY stars DESC)",
      "2. High Compensation (SELECT name, department, salary FROM developers WHERE salary >= 300000)",
      "3. Department Salary Aggregates (SELECT department, count(*) as count, avg(salary) as avg_sal FROM developers GROUP BY department)",
      "4. Database Schema Master (SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view'))",
      "5. Table Columns DDL (PRAGMA table_info(developers))",
      "6. Table Indexes (PRAGMA index_list(developers))",
      "7. Audit Trail (SELECT * FROM audit_logs ORDER BY timestamp DESC)",
      "8. Explain Query Plan (EXPLAIN QUERY PLAN SELECT * FROM developers WHERE stars > 80000)",
    ],
    "1. Select All Developers (SELECT * FROM developers ORDER BY stars DESC)"
  ).width(360);
  win.addButton("btn_run_sql", "⚡ Execute SQL");
  win.addButton("btn_explain", "🔍 Query Plan");
  win.addButton("btn_clear_query", "Clear Editor");
  win.endRow();

  win.addTextarea("txt_sql_query", "SELECT id, name, language, department, stars, salary, active, created_at\nFROM developers\nORDER BY stars DESC;");

  // Export Toolbar
  win.beginRow();
  win.addButton("btn_export_csv", "📋 Export Results CSV");
  win.addButton("btn_export_json", "💾 Export Results JSON");
  win.addButton("btn_export_inserts", "📝 Export SQL INSERTs");
  win.addButton("btn_table_stats", "📊 Table Row Counts");
  win.endRow();
  win.endGroupBox();

  // Results Table
  win.beginGroupBox("Tabular Query Results");
  win.addTable(
    "tbl_results",
    ["id", "name", "language", "department", "stars", "salary", "active", "created_at"],
    [
      ["1", "Linus Torvalds", "C / Git", "Core Systems", "99999", "350000", "1", "2026-09-09 12:00:00"],
      ["6", "Ada Lovelace", "Analytical Engine", "Pioneering", "100000", "400000", "0", "2026-09-09 12:00:00"],
      ["4", "Dennis Ritchie", "C / Unix", "Operating Systems", "99999", "300000", "0", "2026-09-09 12:00:00"],
      ["7", "Grace Hopper", "COBOL / Compilers", "Systems Architecture", "98000", "330000", "0", "2026-09-09 12:00:00"],
      ["8", "Ken Thompson", "Go / Unix / B", "Core Systems", "97000", "320000", "1", "2026-09-09 12:00:00"],
      ["2", "Brendan Eich", "JavaScript", "Web Architecture", "88500", "320000", "1", "2026-09-09 12:00:00"],
      ["3", "Jarred Sumner", "Zig / TypeScript", "Runtime Infrastructure", "76400", "310000", "1", "2026-09-09 12:00:00"],
      ["5", "Guido van Rossum", "Python", "Language Design", "62000", "280000", "1", "2026-09-09 12:00:00"],
    ]
  );
  win.endGroupBox();

  // Execution Telemetry
  win.beginGroupBox("Query Execution & Enterprise Audit Log");
  win.addConsole("sql_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", `Connection: ${activeDbPath}  |  Ready  |  Rows: 8  |  Latency: 0.08ms`);
  win.endRow();

  let lastQueryRows: Record<string, any>[] = [];

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Database Studio profile saved successfully!");
  });

  win.onClick("btn_clear_query", () => {
    win.setText("txt_sql_query", "");
  });

  const executeSql = (queryText?: string) => {
    const sql = (queryText || win.getValue("txt_sql_query") || "").trim();
    if (!sql) return;

    win.appendConsole("sql_console", `[SQL Execute] ${sql.replace(/\n/g, " ")}\n`, 1);
    const t0 = performance.now();

    try {
      if (/^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql)) {
        const query = db.query(sql);
        const rows = query.all() as Record<string, any>[];
        lastQueryRows = rows;
        const elapsed = (performance.now() - t0).toFixed(2);

        if (rows.length === 0) {
          win.setTableData("tbl_results", ["Status"], [["(0 rows returned)"]]);
        } else {
          const firstRow = rows[0] || {};
          const headers = Object.keys(firstRow);
          const data = rows.slice(0, 100).map((r) => headers.map((h) => String(r[h] ?? "")));
          win.setTableData("tbl_results", headers, data);
        }

        win.appendConsole("sql_console", `[Success] ${rows.length} row(s) returned in ${elapsed}ms\n`, 2);
        win.setText("lbl_status", `Connection: ${basename(activeDbPath)}  |  OK (${rows.length} rows)  |  Latency: ${elapsed}ms`);
        win.setStatus(`Query OK (${rows.length} rows, ${elapsed}ms)`);
      } else {
        db.run(sql);
        const elapsed = (performance.now() - t0).toFixed(2);
        win.appendConsole("sql_console", `[Success] Statement executed in ${elapsed}ms\n`, 2);
        win.setText("lbl_status", `Connection: ${basename(activeDbPath)}  |  Statement OK  |  Latency: ${elapsed}ms`);
        win.setStatus(`Statement executed (${elapsed}ms)`);
        
        // Log mutation
        db.run("INSERT INTO audit_logs (action, entity, details) VALUES ('SQL_MUTATION', 'USER', ?);", [sql.slice(0, 100)]);
      }
    } catch (e: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.appendConsole("sql_console", `[SQL Error] ${e.message} (${elapsed}ms)\n`, 3);
      win.setStatus(`Error: ${e.message}`);
    }
  };

  win.onClick("btn_run_sql", () => executeSql());

  win.onClick("btn_explain", () => {
    const sql = (win.getValue("txt_sql_query") || "").trim();
    if (!sql) return;
    executeSql(`EXPLAIN QUERY PLAN ${sql}`);
  });

  win.onClick("btn_connect", () => {
    const rawPath = win.getValue("txt_db_path") || ":memory:";
    try {
      const targetPath = rawPath === ":memory:" ? ":memory:" : resolve(process.cwd(), rawPath);
      db = new Database(targetPath);
      activeDbPath = rawPath;
      initStarterSchema(db);
      win.appendConsole("sql_console", `[Connection] Switched to database: ${targetPath}\n`, 2);
      win.setText("lbl_status", `Connection: ${basename(activeDbPath)}  |  Connected`);
      win.toast(`Connected to ${basename(activeDbPath)}`);
      executeSql("SELECT * FROM developers;");
    } catch (err: any) {
      win.appendConsole("sql_console", `[Connection Failed] ${err.message}\n`, 3);
      win.toast(`Failed to connect: ${err.message}`);
    }
  });

  win.onClick("btn_memory", () => {
    win.setText("txt_db_path", ":memory:");
    db = new Database(":memory:");
    activeDbPath = ":memory:";
    initStarterSchema(db);
    win.appendConsole("sql_console", `[Connection] Initialized isolated in-memory database (:memory:)\n`, 2);
    win.toast("Active in-memory database");
    executeSql("SELECT * FROM developers;");
  });

  win.onClick("btn_seed", () => {
    const departments = ["Core Systems", "Cloud & Infra", "Developer Experience", "Security", "AI & ML", "Frontend Platform"];
    const languages = ["TypeScript", "Zig", "Rust", "Go", "C++", "Python", "Swift"];
    const firstNames = ["James", "Sarah", "David", "Elena", "Michael", "Sophia", "Alex", "Chloe", "Marcus", "Emily"];
    const lastNames = ["Chen", "Patel", "Novak", "Kim", "Larsson", "O'Connor", "Mueller", "Dubois", "Santos", "Tan"];

    try {
      db.run("BEGIN TRANSACTION;");
      for (let i = 0; i < 50; i++) {
        const first = firstNames[i % firstNames.length] ?? "Dev";
        const last = lastNames[(i * 3) % lastNames.length] ?? "Engineer";
        const name = `${first} ${last}`;
        const lang = languages[i % languages.length] ?? "TypeScript";
        const dept = departments[i % departments.length] ?? "Core Systems";
        const stars = Math.floor(Math.random() * 50000) + 5000;
        const salary = Math.floor(Math.random() * 150000) + 120000;
        db.run(
          "INSERT INTO developers (name, language, department, stars, salary, active) VALUES (?, ?, ?, ?, ?, 1);",
          [name, lang, dept, stars, salary]
        );
      }
      db.run("COMMIT;");
      win.appendConsole("sql_console", "[Seed Data] Successfully inserted 50 realistic enterprise developer profiles.\n", 2);
      win.toast("Seeded 50 developer records!");
      executeSql("SELECT * FROM developers ORDER BY id DESC LIMIT 50;");
    } catch (err: any) {
      db.run("ROLLBACK;");
      win.appendConsole("sql_console", `[Seed Error] ${err.message}\n`, 3);
    }
  });

  win.onClick("btn_export_csv", () => {
    if (lastQueryRows.length === 0) {
      win.toast("No query results to export");
      return;
    }
    const headers = Object.keys(lastQueryRows[0] || {});
    const csvLines = [headers.join(",")];
    for (const r of lastQueryRows) {
      csvLines.push(headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
    }
    const csvContent = csvLines.join("\n");
    const exportPath = resolve(process.cwd(), "query_export.csv");
    try {
      writeFileSync(exportPath, csvContent, "utf8");
      win.appendConsole("sql_console", `[Export CSV] Saved ${lastQueryRows.length} rows to ${exportPath}\n`, 2);
      win.toast(`Exported CSV: ${basename(exportPath)}`);
    } catch (e: any) {
      win.appendConsole("sql_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  win.onClick("btn_export_json", () => {
    if (lastQueryRows.length === 0) {
      win.toast("No query results to export");
      return;
    }
    const exportPath = resolve(process.cwd(), "query_export.json");
    try {
      writeFileSync(exportPath, JSON.stringify(lastQueryRows, null, 2), "utf8");
      win.appendConsole("sql_console", `[Export JSON] Saved ${lastQueryRows.length} rows to ${exportPath}\n`, 2);
      win.toast(`Exported JSON: ${basename(exportPath)}`);
    } catch (e: any) {
      win.appendConsole("sql_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  win.onClick("btn_export_inserts", () => {
    if (lastQueryRows.length === 0) {
      win.toast("No query results to export");
      return;
    }
    const headers = Object.keys(lastQueryRows[0] || {});
    const lines = lastQueryRows.map((r) => {
      const vals = headers.map((h) => {
        const v = r[h];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return v;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      return `INSERT INTO query_export (${headers.join(", ")}) VALUES (${vals.join(", ")});`;
    });
    const exportPath = resolve(process.cwd(), "query_export.sql");
    try {
      writeFileSync(exportPath, lines.join("\n"), "utf8");
      win.appendConsole("sql_console", `[Export SQL] Saved ${lines.length} INSERT statements to ${exportPath}\n`, 2);
      win.toast(`Exported SQL: ${basename(exportPath)}`);
    } catch (e: any) {
      win.appendConsole("sql_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  win.onClick("btn_table_stats", () => {
    const tables = (db.query("SELECT name FROM sqlite_master WHERE type='table';").all() as any[]) || [];
    const stats: string[] = ["[Database Table Statistics]"];
    for (const t of tables) {
      try {
        const count = (db.query(`SELECT count(*) as c FROM ${t.name};`).get() as any)?.c || 0;
        stats.push(`  • Table '${t.name}': ${count} rows`);
      } catch {}
    }
    win.appendConsole("sql_console", stats.join("\n") + "\n", 1);
  });

  win.onChange("dd_sql_presets", (_w, selected: string) => {
    if (selected.includes("Select All")) {
      win.setText("txt_sql_query", "SELECT id, name, language, department, stars, salary, active, created_at\nFROM developers\nORDER BY stars DESC;");
    } else if (selected.includes("High Compensation")) {
      win.setText("txt_sql_query", "SELECT name, department, salary, language\nFROM developers\nWHERE salary >= 300000\nORDER BY salary DESC;");
    } else if (selected.includes("Department Salary")) {
      win.setText("txt_sql_query", "SELECT department, count(*) as dev_count, avg(salary) as average_salary, sum(stars) as total_stars\nFROM developers\nGROUP BY department\nORDER BY average_salary DESC;");
    } else if (selected.includes("Database Schema Master")) {
      win.setText("txt_sql_query", "SELECT name, type, sql\nFROM sqlite_master\nWHERE type IN ('table', 'view')\nORDER BY type, name;");
    } else if (selected.includes("Table Columns DDL")) {
      win.setText("txt_sql_query", "PRAGMA table_info(developers);");
    } else if (selected.includes("Table Indexes")) {
      win.setText("txt_sql_query", "PRAGMA index_list(developers);");
    } else if (selected.includes("Audit Trail")) {
      win.setText("txt_sql_query", "SELECT id, action, entity, timestamp, details\nFROM audit_logs\nORDER BY timestamp DESC;");
    } else if (selected.includes("Explain Query Plan")) {
      win.setText("txt_sql_query", "EXPLAIN QUERY PLAN\nSELECT * FROM developers\nWHERE stars > 80000\nORDER BY salary DESC;");
    }
    executeSql();
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

export const createDatabaseStudio = createSqliteStudio;

// Export flagship SQLite Studio Pro workstation factory as well
export { createSqliteStudioPro, startSqliteStudioServer } from "./sqlite_studio";

if (import.meta.main) {
  const win = createDatabaseStudio(":memory:", { fullscreen: true });
  console.log("⚡ Launching Database Studio Pro (Enterprise SQLite Fullscreen)...");
  win.run();
}
