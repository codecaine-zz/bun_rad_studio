import { writeFileSync } from "fs";
import { join } from "path";

export function generateCoreWorkstations(outDir: string) {
  // 01_database_studio.md
  writeFileSync(join(outDir, "01_database_studio.md"), `# 🗄️ Database Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native bun:sqlite (WAL Mode)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:database]  •  [Terminal CLI: bun run cli:database]
\`\`\`

---

## 🌟 Executive Overview
**Database Studio Pro** is a high-performance, enterprise-grade SQLite query editor, schema browser, and diagnostic workbench engineered natively on Bun's C-level \`bun:sqlite\` subsystem. It delivers desktop database management speed comparable to Delphi and native desktop database clients—with **zero external software dependencies**, zero brew installations, and instant sub-second boot times.

Whether you are debugging a local application database, inspecting complex relational foreign keys, generating synthetic test data, or benchmarking query plans before deployment, Database Studio Pro gives you a tactile, visual cockpit.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch (in-memory sandbox or active project DB)
bun run app:database

# Backwards-compatible shorthand alias
bun run app:sqlite
\`\`\`

### 2. Launch Terminal CLI Query Mode
\`\`\`bash
# Direct SQL query evaluation in terminal
bun run cli:database -f ./app.db "SELECT * FROM users LIMIT 10"

# Dump table schema directly in terminal
bun run cli:database -f ./app.db --schema
\`\`\`

### 3. Launch Programmatically in TypeScript
\`\`\`typescript
import { createDatabaseStudio } from "./applications/database_studio";

const studio = createDatabaseStudio("./production.sqlite", {
  fullscreen: false,
  width: 1400,
  height: 900
});
await studio.run();
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Database Studio Desktop](../../screenshots/apps/database_studio_desktop.png) | ![Database Studio Responsive](../../screenshots/apps/database_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Window Header & Command Bar
- **Theme Selector**: Dynamic live switcher across all 63 studio themes (including Codefreelance, Sonoma Emerald, Cupertino Blue, Midnight, and Cyberpunk).
- **💾 Save State**: Immediately saves the current window coordinates, dimensions, active database path, and last query to local disk.
- **Center Window**: Re-centers the desktop application onto your active monitor screen.
- **⛶ Fullscreen**: Toggles distraction-free borderless fullscreen workstation mode.

### 2. Connection & Database Management Panel
- **Database File Path Input**: Accepts \`:memory:\` (for temporary in-ram experiments) or absolute/relative file paths (e.g. \`./data/production.sqlite\`).
- **🔌 Connect / Switch DB Button**: Safely disconnects the current handle and mounts the target database file with \`PRAGMA journal_mode = WAL\` enabled.
- **🌱 Seed 50 Test Records Button**: Instantly provisions a mock schema (\`users\` and \`transactions\` tables) and populates 50 realistic relational rows for testing.
- **📋 DDL Schema Button**: Scans \`sqlite_master\` and renders complete, syntax-highlighted \`CREATE TABLE\` and \`CREATE INDEX\` statements.

### 3. SQL Query Editor & Diagnostic Bar
- **Multi-line SQL Editor**: Textarea with monospace font, automatic indentation, and support for multi-statement scripts, CTEs (\`WITH ...\`), and window functions.
- **⚡ Execute SQL (Ctrl/Cmd + Enter)**: Executes the query with microsecond resolution timer.
- **🔍 Explain Plan Button**: Runs \`EXPLAIN QUERY PLAN\` and generates a step-by-step breakdown of table scans vs index lookups.
- **🧹 Clear Button**: Resets query editor and data output console.

### 4. Results Grid & Telemetry Panel
- **Execution Telemetry Pill**: Displays exact row count returned and execution latency down to fractional milliseconds (e.g., \`42 rows • 0.38ms\`).
- **Dynamic Table Grid**: Interactive data grid displaying column headers, numeric alignment, null indicator badges, and scrollable rows.
- **Error Diagnostic Banner**: Displays descriptive SQLite error codes, line numbers, and constraint explanations if a query fails.

### 5. Enterprise Data Export Suite
> The grid toolbar's **📤 Export** dialog (CSV, TSV, JSON, JSON Lines, SQL, Markdown — whole table, copy or save) supersedes these buttons; see *Visual Data Management* below.
- **📊 Export CSV**: Converts the active result grid into standardized comma-separated values for spreadsheet analysis.
- **📋 Export JSON**: Formats and copies the active result rows as clean JSON objects.
- **💾 Export SQL Inserts**: Generates a reproducible sequence of \`INSERT INTO ... VALUES (...);\` migration statements.

---

## 🖱️ Visual Data Management (Full GUI CRUD — No SQL Required)

SQLite Studio Pro works like Microsoft Access: you can create tables, add/edit/delete rows, import and export data entirely with buttons and dialogs. SQL is optional.

### Editing Rows (toolbar above the data grid)
| Button | What it does |
| :--- | :--- |
| **➕ New Row** | Opens a form with one field per column (PK / required / foreign-key badges, "default" checkboxes, **Now** button for dates, value suggestions for foreign keys). \`Cmd/Ctrl+Enter\` saves. **Save & add another** keeps the form open. |
| **📝 Edit / 📄 Duplicate** | Edit or copy the single ticked row in the form dialog. |
| **🗑️ Delete** | Deletes every ticked row (confirmation first). Tick the header checkbox to select the whole page. |
| **📥 Import / 📋 Paste rows** | Opens the Import Wizard (see below), pre-targeted at the open table. |
| **📤 Export / 📋 Copy** | Export dialog / copy ticked (or all page) rows as tab-separated text for Excel or Sheets. |
| **🛠️ Design Table / ⋯ More** | Table designer, rename, empty, delete. |
| **Page size** | 25 / 50 / 100 / 250 / 500 rows per page. |

- **Inline editing**: double-click any cell, type, press **Enter** to save (**Esc** cancels).
- **Right-click a row** (or a cell) for: Edit cell, Set cell to NULL, Copy value, Edit row, Duplicate row, Copy row, Delete row.
- Works on tables with no primary key or composite keys (rows are addressed by SQLite \`rowid\`). Views and ad-hoc query results are read-only.

### Designing Tables Visually
- **➕ New Table** (header or sidebar) opens the **Table Designer**: name the table, add columns with a friendly type picker (INTEGER, TEXT, REAL, BOOLEAN, DATE, DATETIME, BLOB, JSON…), and set **PK**, **Auto #**, **Required**, **Unique**, a **Default value** (e.g. \`0\`, \`CURRENT_TIMESTAMP\`) and **Link to table** (foreign key with on-delete behaviour). Quick-add chips insert common columns (\`id\`, \`created_at\`…). A live **SQL preview** shows the generated \`CREATE TABLE\`.
- **🛠️ Design Table** on an existing table lets you rename it, rename/add/remove/reorder columns and change types or constraints. The table is rebuilt safely inside a transaction: data is copied, indexes and triggers are restored. Removed columns lose their data. *CHECK constraints, multi-column UNIQUE and multi-column foreign keys can't be represented and are dropped — the designer warns you first.*
- **Sidebar ⋯ menu** (hover a table, or right-click it): Open, Add row, Design, Add column, New index, Import into, Export, Copy name, Rename, Empty table, Delete.
- **👁️ New View**: save a SELECT as a view (pre-filled from the SQL editor).
- **Schema Designer & DDL tab** adds management cards: Manage table, **Indexes** (create/drop), **Relationships**, **Triggers**.

### Import Wizard (📥 Import)
1. **Choose data**: *Browse files…* (system dialog), drag & drop a file, **📋 Paste from clipboard**, or paste straight into the box (cells copied from Excel / Google Sheets / a web table work). Pressing \`Cmd/Ctrl+V\` on the grid also opens the wizard with the clipboard.
2. **Format** is auto-detected: **CSV** (delimiter auto: comma, semicolon, tab, pipe), **TSV**, **JSON** (array of objects/arrays, or an object containing an array), **JSON Lines**, **Markdown tables**, **SQL scripts**. Options: first row is header, trim spaces, empty cells → NULL.
3. **Preview** shows the first rows and the row × column count.
4. **Destination**: *Create a new table* (editable column names and types — types are inferred; optional auto-number \`id\` column; untick columns to skip) or *Add to an existing table* (column mapping with auto-matching by name; append or replace all rows; on duplicate: stop / skip / overwrite).
- Imports run in **one transaction**: any error rolls everything back and nothing is imported.
- **SQL scripts** (\`.sql\` dumps, pasted \`INSERT\`s) run all-or-nothing as a single transaction.
- Excel \`.xlsx\` files are not read directly — copy the cells, or *Save As → CSV*.

### Export & Backup
- **📤 Export** exports the *whole* open table (not only the visible page), or the current query result, as **CSV, TSV, JSON, JSON Lines, SQL INSERTs (optionally with \`CREATE TABLE\`) or Markdown**. Choose **Copy to clipboard** or **Save file**.
- Saved files are written to your **\`~/Downloads\`** folder (a numeric suffix is added if the name exists) and the full path is shown in a notification.
- **💾 Backup** (header or sidebar) writes a complete SQL dump (schema, indexes, views, triggers, data) that can be restored with *Import → SQL script*.

### GUI CRUD HTTP API (for scripting / the embedded server)
| Endpoint | Purpose |
| :--- | :--- |
| \`POST /api/table/data\` | Paged rows; now also returns \`editable\`, \`isView\`, \`pkColumns\` and each row's \`__rowid__\`. |
| \`POST /api/table/mutate\` | \`insert\` / \`update\` / \`delete\`. Payload supports \`useRowid\`, \`rowId\`, \`rowIds\` (bulk delete), \`data\`; an empty \`data\` inserts \`DEFAULT VALUES\`. |
| \`POST /api/schema/create-table\` · \`redesign-table\` · \`rename-table\` · \`drop\` · \`create-index\` · \`create-view\` · \`details\` | Schema designer operations. |
| \`POST /api/import\` | Bulk insert \`{ table, create, createColumns, columns, rows, mode, onConflict }\` in one transaction. |
| \`POST /api/script\` | Run a multi-statement SQL script transactionally. |
| \`POST /api/table/all\` · \`/api/dump\` | All rows of a table · full SQL dump. |
| \`POST /api/pick-file\` · \`/api/export-file\` | Native file chooser (returns text) · save text into \`~/Downloads\`. |

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Inspecting an Existing Application SQLite Database
1. Open Database Studio Pro via \`bun run app:database\`.
2. In the **Database File Path** field, enter your database path: \`./my_app.sqlite\`.
3. Click **🔌 Connect / Switch DB**.
4. Click **📋 DDL Schema** to review all table schemas, primary keys, and foreign keys.
5. In the SQL Editor, type:
   \`\`\`sql
   SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'index');
   \`\`\`
6. Press \`Cmd+Enter\` (or click **⚡ Execute SQL**). Inspect your tables in the grid.

### Tutorial 2: Diagnosing Slow Queries with EXPLAIN QUERY PLAN
1. Type a query involving joins or filters:
   \`\`\`sql
   SELECT u.name, count(t.id) as orders 
   FROM users u 
   LEFT JOIN transactions t ON u.id = t.user_id 
   WHERE t.status = 'COMPLETED' 
   GROUP BY u.name;
   \`\`\`
2. Click **🔍 Explain Plan**.
3. Look at the output:
   - If you see \`SCAN TABLE users\` or \`SCAN TABLE transactions\`, you are doing a full table scan.
   - Run \`CREATE INDEX idx_transactions_user ON transactions(user_id, status);\` to add an index.
   - Run **🔍 Explain Plan** again and verify that SQLite now reports \`SEARCH TABLE transactions USING INDEX idx_transactions_user\`.

### Tutorial 3: Exporting Test Data as SQL Migrations
1. Run your query filtering target rows:
   \`\`\`sql
   SELECT * FROM users WHERE role = 'admin';
   \`\`\`
2. Click **💾 Export SQL Inserts**.
3. The generated statements will populate the output ready to be copied into your migration files or shared with team members.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | SQL Editor | Execute active query |
| **Cmd + E** / **Ctrl + E** | SQL Editor | Run Explain Query Plan |
| **Cmd + L** / **Ctrl + L** | SQL Editor | Clear query input and results |
| **Cmd + S** / **Ctrl + S** | Window | Save workspace state & layout |
| **F11** or **F** | Global Window | Toggle fullscreen display mode |
| **Escape** | Dialogs / Overlays | Close active modal |
| **Cmd/Ctrl + Enter** | Row form | Save row |
| **Enter** / **Esc** | Inline cell editor | Save / cancel the edit |
| **Cmd/Ctrl + V** | Data grid (editable table) | Open Import Wizard with clipboard rows |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Write-Ahead Logging (WAL)**: Database Studio Pro automatically activates \`PRAGMA journal_mode = WAL;\`. This allows concurrent readers to query the database while your application writes to it, eliminating \`database is locked\` errors.
- **In-Memory Sandbox Testing**: Use \`:memory:\` as the file path to test risky \`ALTER TABLE\` or destructive updates without touching production files on disk.
- **Safe Transaction Rollbacks**: Always wrap multi-statement migrations in \`BEGIN TRANSACTION; ... COMMIT;\`. If an error occurs midway, Database Studio Pro rolls back changes automatically to maintain ACID consistency.

---

## ❓ Troubleshooting & FAQs

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Database is locked"** | Another process is holding an exclusive write lock without WAL. | Run \`PRAGMA journal_mode = WAL;\` or close other active SQLite CLI tools. |
| **"No such table"** | Database file connected is empty or path was mistyped. | Verify absolute file path using \`ls -la\` and click **DDL Schema** to confirm table presence. |
| **Large result set sluggish** | Query returned over 100,000 rows at once. | Add a \`LIMIT 1000\` clause to your query to paginate results efficiently. |

---

## 📐 Technical Architecture & Offline Resilience
- **Runtime Subsystem**: Pure \`bun:sqlite\` binary bindings directly linked into Bun's engine.
- **UI Architecture**: High-speed macOS WKWebView with hardware-accelerated CSS and virtual table DOM.
- **Zero Third-Party Binaries**: Zero requirement for \`sqlite3\` CLI, Homebrew, or external drivers. 100% offline self-contained.
`);

  // 02_system_package_studio.md
  writeFileSync(join(outDir, "02_system_package_studio.md"), `# 💻 System Information Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.5.0  •  Engine: systeminformation (60 APIs) via a local Bun telemetry server  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:system]  •  [Terminal CLI: bun run cli:system]
\`\`\`

---

## 🌟 Executive Overview
**System Information Studio Pro** is a hardware and OS intelligence workstation. It exposes the entire \`systeminformation\` API surface (60 methods across 10 domains: hardware, OS, CPU, memory/battery, graphics, disks, network, processes, peripherals and virtualization) through a fast desktop UI with live KPI cards, visual smart cards, a raw JSON inspector and a telemetry log.

The studio runs a background telemetry server on a local loopback port, so the window never blocks while a slow query (for example a full audit) is running.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Desktop GUI
bun run app:system

# Programmatic launch
import { createSystemStudio } from "./applications/system_studio";
await createSystemStudio({ fullscreen: false }).run();
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![System Studio Desktop](../../screenshots/apps/system_studio_desktop.png) | ![System Studio Responsive](../../screenshots/apps/system_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Header & KPI Cards
- **Full System Audit / Static Hardware / Dynamic Telemetry**: one-click presets (\`getAllData\`, \`getStaticData\`, \`getDynamicData\`).
- **KPI cards**: CPU cores and speed, live CPU load, memory used / total, primary network gateway and battery or AC power. **Load and Memory show a rolling sparkline** of the last 60 samples.
- **🌓 Theme**: switch between the dark and light theme (remembered). **⌨ Shortcuts** lists every keyboard shortcut.

### 2. Quick Bar
- **Favorites (★) and Recents**: chips for the methods you pinned and the ones you used last; click a chip to run it.
- **Auto-refresh**: refresh the KPI cards every 1, 2, 5, 10 or 30 seconds. Tick **Re-run method** to also re-run the selected method each time.
- **Alerts (90%)**: shows a warning toast and a log entry when CPU load or memory reaches 90% (at most once per minute per metric).

### 3. API Sidebar
- Search box, collapsible categories, category pills and a resizable width. Every method shows its description and, where relevant, a parameter box.

### 4. Method Toolbar
- **🚀 Run Method / 📋 Run Entire Category / ⏱️ Live Stream (1s) / 📋 Copy JSON / 💾 Save Report / 🧹 Clear**.
- **☆ Favorite**: pin the current method to the quick bar.
- **📸 Snapshot and 🔀 Compare**: remember a result, then re-run the method and see exactly which values **changed, were added or were removed** (for example before and after plugging in a drive or joining a network).
- **⬇ Export**: save the current result as **JSON, CSV, Markdown or an HTML report** into the \`reports/\` folder.
- **📄 Full Report**: runs a complete system audit and saves it as a single readable HTML report.

### 5. Result Tabs
- **📊 Visual Smart Cards**: human-readable cards, tables and gauges.
- **💻 Raw JSON Inspector**: syntax-highlighted JSON with a **search box** that filters to matching lines and highlights hits.
- **⚡ Telemetry Log**: timestamped record of every query, export, alert and refresh.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Spot What Changed After a Hardware or Network Event
1. Select a method such as \`networkInterfaces\` or \`blockDevices\`.
2. Click **📸 Snapshot**.
3. Make the change (connect a USB drive, switch Wi-Fi, ...).
4. Click **🔀 Compare**. A dialog lists every changed, added and removed field.

### Tutorial 2: Create a Shareable System Report
1. Click **📄 Full Report**.
2. Open the HTML file shown in the toast (inside \`reports/\`) in any browser, or attach it to a support ticket.
3. For a single method, choose **CSV**, **Markdown** or **HTML report** in the export menu and click **⬇ Export**.

### Tutorial 3: Watch for Resource Pressure
1. Set **Auto-refresh** to 2s and tick **Alerts (90%)**.
2. Start a heavy build. The sparklines show the trend and you get a warning if CPU or memory reaches 90%.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| **Cmd/Ctrl + Enter** or **R** | Run the selected method |
| **Cmd/Ctrl + K** or **/** | Focus the API filter |
| **Cmd/Ctrl + S** | Export in the chosen format |
| **Cmd/Ctrl + Shift + C** | Copy JSON |
| **1 / 2 / 3** | Visual / JSON / Log tab |
| **\*** | Toggle favorite |
| **?** | Show shortcuts |
| **Esc** | Close dialogs |
| **F11** or **F** | Toggle fullscreen |

---

## 💡 Pro Tips
- Favorites, recent methods, theme and export settings are stored locally in the window and survive restarts.
- Exported reports contain hardware serial numbers and UUIDs for some methods (for example \`system\`, \`uuid\`) -- review them before sharing publicly.

---

## ❓ Troubleshooting & FAQs

| Question | Answer |
| :--- | :--- |
| **A method shows an error or empty values.** | Some APIs need OS permissions or are not available on every platform (for example temperatures on some machines). The Telemetry Log shows the exact error. |
| **Where are exported files saved?** | In the \`reports/\` folder of the directory the studio was launched from. |
| **Compare is greyed out.** | Take a **📸 Snapshot** first; the button enables once a snapshot exists. |
`);

  // 03_task_watcher_studio.md
  writeFileSync(join(outDir, "03_task_watcher_studio.md"), `# ⏱️ Task Watcher Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native fs.watch & Bun.spawn  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:watcher]  •  [Terminal CLI: bun run cli:watcher]
\`\`\`

---

## 🌟 Executive Overview
**Task Watcher Studio** is an ultra-fast, native filesystem watcher, automated test runner, and task execution workstation. Engineered on top of Node's recursive \`fs.watch\` primitive and \`Bun.spawn\`, it completely eliminates heavyweight third-party watcher dependencies like \`chokidar\` or \`watchexec\`.

It provides sub-millisecond file change detection, smart debounce buffers, customizable extension white-lists, directory exclusion rules, and a streaming desktop console with microsecond execution timings.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:watcher

# Shorthand alias
bun run app:watch
\`\`\`

### 2. Launch Terminal CLI Watcher Mode
\`\`\`bash
# Watch current directory and run tests on save
bun run cli:watcher -d ./src -e "bun test"

# Watch with specific extension filters
bun run cli:watcher -d ./ -x "ts,js,json" -e "bun run build"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Task Watcher Desktop](../../screenshots/apps/watcher_studio_desktop.png) | ![Task Watcher Responsive](../../screenshots/apps/watcher_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Watch Target Configuration Bar
- **Watch Directory Path**: Input folder to monitor recursively (e.g. \`./src\`, \`./applications\`, or absolute path).
- **Execution Command**: Shell command to trigger whenever a matching file changes (e.g., \`bun test\`, \`bun run build\`, \`tsc --noEmit\`).
- **File Extensions Filter**: Comma-separated list of extensions to monitor (e.g., \`ts,tsx,js,json,css,html\`).
- **Ignore Patterns**: Comma-separated list of paths or subdirectories to ignore (e.g. \`node_modules,.git,dist,.temp,build\`).
- **Debounce Delay (ms)**: Debounce buffer window (default \`300ms\`) to coalesce rapid multi-file IDE saves into a single run.
- **📁 Browse... (Watch Directory / Run In)**: Opens a folder picker so you never have to type a path. **Run In** sets the working directory the command executes in (blank = current directory).
- **Preset Dropdown**: One-click commands (\`bun test\`, \`tsc --noEmit\`, \`eslint\`, \`bun build\`, \`npm test\`, ...) that fill the Execute Command box; you can still edit it afterwards.
- **Restart on Change**: When on, a new file change kills the running command and restarts it. When off, the running command finishes and extra changes are logged and ignored.
- **Notify When Done**: Shows a success or failure toast (with run number and duration) when a run ends.
- **Copy Log / Export Log**: Copy the console output to the clipboard or save it to a file through a save dialog.
- **Clear History**: Empties the File Modification History table (which now includes a **Duration** column).
- **Live Streaming & Validation**: Output streams into the console as it is produced, and a missing watch or working directory shows an error toast instead of failing silently.

### 2. Execution Control Panel
- **▶ Start Watching Button**: Starts the native background recursive file watcher.
- **⏹ Stop Watching Button**: Gracefully stops the watcher and clears active timeouts.
- **⚡ Trigger Now Button**: Manually forces an immediate execution of the configured command without touching files.
- **🧹 Clear Console Button**: Wipes the streaming terminal output log.

### 3. Live Streaming Terminal Console
- **Output Window**: High-contrast, dark-mode terminal screen streaming \`stdout\` and \`stderr\` from the spawned process.
- **Status Badges**: Shows whether the last execution passed (green check) or failed with non-zero exit code (red alert).
- **Execution History Table**: Records timestamp, changed file path, event type (\`change\`, \`rename\`, \`add\`), and process duration in milliseconds.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Setting Up Instant Test-Driven Development (TDD)
1. Launch Task Watcher Studio: \`bun run app:watcher\`.
2. Set **Watch Directory**: \`./src\`.
3. Set **Execution Command**: \`bun test\`.
4. Set **File Extensions**: \`ts,tsx\`.
5. Set **Ignore Patterns**: \`node_modules,dist,.git\`.
6. Click **▶ Start Watching**.
7. Edit any test file in your editor and hit save. Task Watcher Studio instantly captures the event, runs your test suite, and displays colored terminal output in the GUI.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Space** / **Enter** | Toolbar | Toggle Watcher Start/Stop |
| **Cmd + T** / **Ctrl + T** | Toolbar | Trigger Command Immediately |
| **Cmd + K** / **Ctrl + K** | Console | Clear execution log |
| **Cmd + S** / **Ctrl + S** | Window | Save watcher presets |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Tune Debounce for IDEs**: Modern IDEs like VS Code often perform multi-stage saves (temp file write, rename, formatting). Setting debounce to \`250ms–350ms\` prevents duplicate execution runs.
- **Ignore Heavy Folders**: Always include \`node_modules\` and \`.git\` in your ignore list to save CPU cycles and prevent spurious file event storms.
`);

  // 04_json_query_studio.md
  writeFileSync(join(outDir, "04_json_query_studio.md"), `# 🔍 JSON Query Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Pure TypeScript/Bun AST Query Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:json]  •  [Terminal CLI: bun run cli:json]
\`\`\`

---

## 🌟 Executive Overview
**JSON Query Studio Pro** is an enterprise-grade JSON inspection, transformation, projection, and formatting workbench. Powered by a pure TypeScript recursive query evaluation engine, it provides rich, \`jq\`-compatible selector syntax without requiring Homebrew, C compilers, or external \`jq\` binaries.

It handles multi-megabyte payloads effortlessly, supports nested path extraction, array slicing, dictionary projections, key sorting, and minification, complete with one-click export to clipboard or disk.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:json

# Shorthand alias
bun run app:jq
\`\`\`

### 2. Launch Terminal CLI Query Mode
\`\`\`bash
# Query JSON file directly in terminal
bun run cli:json package.json ".scripts"

# Filter array of objects in terminal
bun run cli:json data.json ".users[] | {name: .name, email: .email}"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![JSON Studio Desktop](../../screenshots/apps/json_studio_desktop.png) | ![JSON Studio Responsive](../../screenshots/apps/json_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Query Configuration & Selector Bar
- **Query Expression Input**: Type your selector (e.g. \`.\`, \`.users[]\`, \`.data.items[0:5]\`, \`keys\`, \`length\`).
- **Presets Dropdown**: Pre-built one-click queries:
  - Identity (\`.\`)
  - Top-Level Keys (\`keys\`)
  - Array Length (\`length\`)
  - First 5 Items (\`.[0:5]\`)
  - Key-Value Projection (\`.[] | {id: .id, name: .name}\`)
- **⚡ Execute Query Button**: Runs the evaluation in microseconds.

### 2. Dual-Pane JSON Workspace
- **Source JSON Editor (Left Pane)**: Multi-line text area with syntax validation, line numbers, sample payload loader, and file upload button.
- **Transformed Result Output (Right Pane)**: Formatted, color-highlighted output viewer displaying filtered results.
- **Telemetry Pill**: Displays input byte size, result byte size, and query execution time in microseconds.

### 3. Document Tools (File I/O, Formatting, Conversion, Search)
- **📂 Open File... / 🌐 Load URL...**: Load a \`.json\`, \`.geojson\`, \`.txt\` or \`.csv\` file (CSV is converted to JSON automatically) or fetch JSON from an http(s) URL.
- **💾 Save Output... / 💾 Save Input...**: Save either pane to disk (the output defaults to \`.csv\` / \`.yaml\` when you converted it). **📋 Copy Output** copies it to the clipboard.
- **⇄ Output → Input**: Moves the result into the input pane so you can chain queries. **🗑 Clear** empties everything.
- **✨ Format / 🗜 Minify / 🔤 Sort Keys**: Re-indent the input (**Indent**: 2 spaces, 4 spaces or Tab), strip all whitespace, or sort object keys alphabetically at every level.
- **✔ Validate**: Checks the input and reports the **line and column** of the first syntax error. Invalid input is also reported by every other tool.
- **📊 Stats**: Size in bytes, nesting depth and counts of objects, arrays, keys, strings, numbers, booleans and nulls.
- **Convert Output**: **→ CSV** (array of objects becomes a table), **→ YAML**, and **CSV Input → JSON** for pasted CSV.
- **Find**: Search every key and value; matching jq-style paths (e.g. \`.modules[2].status\`) are listed in the console and the output pane.
- **Compact Output / Live Query**: Print results on a single line, or re-run the query automatically as you type.

### 4. Supported Query Syntax
- **Paths & iteration**: \`.a.b\`, \`.items[0]\`, \`.items[]\`, \`.items[].name\`, \`[ ... ]\` array wrapping, and \`|\` pipelines.
- **Filtering**: \`select(.lines > 2000)\`, \`select(.status == "stable" and .lines < 3000)\`, \`select(.name | contains("x"))\`, with \`==  !=  >  <  >=  <=\`, \`and\`, \`or\`, \`not\`.
- **Transforms**: \`map\`, \`sort\`, \`sort_by\`, \`unique\`, \`unique_by\`, \`group_by\`, \`min_by\`, \`max_by\`, \`del(.key)\`, \`to_entries\`, \`from_entries\`, \`keys\`, \`values\`, \`add\`, \`length\`, \`flatten\`, \`any\`, \`all\`, and the alternative operator \`.a // "default"\`.
- **Strings**: \`contains\`, \`startswith\`, \`endswith\`, \`test("regex")\`, \`split\`, \`join\`, \`ltrimstr\`, \`rtrimstr\`, \`ascii_downcase\`, \`ascii_upcase\`, \`tostring\`, \`tonumber\`.
- **JavaScript mode**: start with \`$\` (e.g. \`$.modules.map(m => m.name.toUpperCase())\`) for full JavaScript expressions.
- **External jq**: choose **External jq CLI** in the Engine dropdown to use the real \`jq\` binary if it is installed.
---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Filtering and Re-Projecting an API Response
1. Paste this JSON payload into the left editor:
   \`\`\`json
   {
     "status": "success",
     "users": [
       { "id": 1, "name": "Alice", "role": "admin", "secret": "x99" },
       { "id": 2, "name": "Bob", "role": "developer", "secret": "y44" }
     ]
   }
   \`\`\`
2. In the query bar, type:
   \`\`\`text
   .users[] | {id: .id, name: .name}
   \`\`\`
3. Press **Cmd+Enter**. The output instantly displays:
   \`\`\`json
   [
     { "id": 1, "name": "Alice" },
     { "id": 2, "name": "Bob" }
   ]
   \`\`\`
   Notice the \`secret\` field is stripped cleanly!

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Query Bar / Editor | Execute active query |
| **Cmd + P** / **Ctrl + P** | Left Editor | Format / Pretty-Print JSON |
| **Cmd + M** / **Ctrl + M** | Left Editor | Minify JSON |
| **Cmd + Shift + C** | Output Pane | Copy result to clipboard |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Validating Broken JSON**: If an API returns malformed JSON, paste it into the left editor and hit **Format**. The diagnostic banner points to the exact line and character where a trailing comma or missing quote occurred.
- **Large Dataset Slicing**: When inspecting large 50MB log dumps, use array slice notation \`.[0:10]\` to examine sample records without locking up your browser.
`);

  // 05_devtools_studio.md
  writeFileSync(join(outDir, "05_devtools_studio.md"), `# 🛠️ DevTools Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: 6-in-1 Native Bun Subsystems  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:devtools]  •  [Terminal CLI: bun run cli:devtools]
\`\`\`

---

## 🌟 Executive Overview
**DevTools Studio Pro** is a unified 6-in-1 developer workstation combining the most essential day-to-day command-line developer utilities into a single high-speed desktop interface. Powered by pure Bun and Node subsystem primitives, it replaces 6 separate CLI packages (\`ripgrep\`, \`fd\`, \`sd\`, \`watchexec\`, \`rm-improved/rip\`, and \`jq\`) with **zero external binary requirements**.

Instead of switching between disjointed terminal tabs and memorizing conflicting flags, DevTools Studio Pro gives developers a cohesive GUI cockpit for searching, replacing, watching, querying, and managing project files.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:devtools

# Shorthand alias
bun run app:omnitool
\`\`\`

### 2. Launch Terminal CLI Multi-Tool
\`\`\`bash
# Search using ripgrep mode
bun run cli:devtools search "TODO" ./src

# Find files using fd mode
bun run cli:devtools find "*.test.ts"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![DevTools Studio Desktop](../../screenshots/apps/devtools_studio_desktop.png) | ![DevTools Studio Responsive](../../screenshots/apps/devtools_studio_responsive.png) |

---

## 🧭 The 6 Integrated Developer Engines

| Mode | Engine Name | Replaces Tool | What it does |
| :-: | :--- | :--- | :--- |
| **1** | **Ripgrep (rg)** | \`rg\` | Recursive regex search with line numbers, optional context lines and a files-only summary. |
| **2** | **Fd** | \`fd\` | Find files and folders by regex or literal text, filtered to files only or folders only. |
| **3** | **Sd** | \`sd\` | Regex find-and-replace with a dry-run preview of the changed lines. |
| **4** | **Watchexec** | \`watchexec\` | Points you to Watcher Studio for continuous file watching. |
| **5** | **Rip** | \`rip\` | Moves a file or folder to the macOS Trash, with **Undo Last Trash**. |
| **6** | **JQ** | \`jq\` | JSON queries against a file or inline JSON. |

Choose the engine from the dropdown at the top, set a **Target Path** and **Pattern**, then click **Execute Tool Command**.

---

## 🧰 Search Controls

- **Folder... / File...**: pick the target with a native dialog instead of typing a path.
- **Case Sensitive**, **Whole Word**, **Literal (not regex)**: apply to rg, fd and sd. Literal mode lets you search for text such as \`foo(\` without escaping it. Sd also treats \`$\` in the replacement literally in this mode.
- **Include / !Exclude globs**: for example \`*.ts *.{js,jsx} !*.test.ts\`. Separate patterns with spaces, \`;\` or \`|\`. A pattern with no \`/\` matches the file name; one with a \`/\` matches the path relative to the target.
- **Include Hidden**: also search dotfiles and dot-folders (off by default).
- **Respect .gitignore**: skips what the target folder's own \`.gitignore\` ignores (on by default). Negated (\`!\`) rules are not supported. \`node_modules\`, \`.git\` and \`dist\` are always skipped.
- **Max results**: caps output (1-100000, default 200).
- **Context lines (rg)**: shows N lines around each match (0-20).
- **Files With Matches Only (rg)**: lists each matching file with its match count.
- Binary files and files over 1.5 MB (1 MB for sd) are skipped.

## 🔁 Safe Replace (Sd)

- **Dry Run (sd)** is on by default and shows up to 3 before/after lines per file without touching anything.
- Untick it to apply. You are asked to confirm first.
- **Backup .bak (sd)** writes \`<file>.bak\` with the original content before each change.
- Regex mode supports capture groups such as \`$1\`.

## 📋 Results

- **Copy Results** copies the output; **Save Results...** writes it to a file.
- **Undo Last Trash** restores the most recent item moved by Rip. It refuses to overwrite a path that already exists again.
- A target path that does not exist shows an error instead of running.

---

## 🛠️ Step-by-Step Tutorial: Find and Rename an API Name Safely
1. Launch with \`bun run app:devtools\`.
2. Click **Folder...** and choose your project.
3. In **Ripgrep** mode, enter \`oldApiEndpoint\`, tick **Whole Word** and **Literal**, set the include globs to \`*.ts\`, and run it to review every hit.
4. Switch to **Sd**, enter \`newSecureApiEndpoint\` as the replacement, and run it with **Dry Run** still ticked.
5. Check the previewed lines. Untick **Dry Run**, tick **Backup .bak** if you want one, and run again to confirm.

---

## 💡 Pro Tips & Best Practices
- Run a Ripgrep search with the same options before every Sd replace, so you know the scope.
- Without the **Case Sensitive** box ticked, Sd also replaces differently-cased matches (for example \`Foo\` when you search \`foo\`).
- Values typed into the app are kept in the saved form state, so avoid putting secrets in the pattern or replacement.
`);

  // 06_process_monitor_studio.md
  writeFileSync(join(outDir, "06_process_monitor_studio.md"), `# 📊 Process Monitor Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native macOS ps / sysinfo Subsystem  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:process]  •  [Terminal CLI: bun run cli:process]
\`\`\`

---

## 🌟 Executive Overview
**Process Monitor Studio** is an enterprise-grade desktop system task manager and process telemetry workstation built natively for Bun RAD Studio. Designed as a developer-focused alternative to macOS Activity Monitor and Linux \`htop\`, it provides live process inspection, PID search, CPU% and RSS memory telemetry, listening socket discovery, and safe process termination signals (\`SIGTERM\`, \`SIGKILL\`).

It allows developers to instantly pinpoint runaway development servers, orphan background tasks, memory leaks, and port conflicts without navigating cryptic terminal commands.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:process

# Shorthand alias
bun run app:procs
\`\`\`

### 2. Launch Terminal CLI Process Inspector
\`\`\`bash
# List top CPU processes in terminal
bun run cli:process --top cpu

# Search process by name or PID
bun run cli:process --search "node"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Process Monitor Desktop](../../screenshots/apps/process_studio_desktop.png) | ![Process Monitor Responsive](../../screenshots/apps/process_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Real-time Telemetry Status Bar
- **Total Process Count**: Live tally of active system processes.
- **Aggregated CPU Load**: Overall user and system CPU load percentage.
- **Physical Memory Bar**: System-wide RAM consumption and available buffer space.
- **Auto-Refresh Switcher**: Toggle polling intervals (1s, 2s, 5s, or Manual Pause).

### 2. Process Search & Filter Toolbar
- **Search Process / PID Input**: Real-time filtering by process name, command arguments, or numeric PID.
- **Sort Dropdown**: Sort by CPU (High to Low), Memory/RSS (High to Low), PID, or Name.
- **User Mode Toggle**: Filter between "All System Processes" and "My User Processes Only".

### 3. Interactive Process Data Table
- **PID**: Process Identification number.
- **User / Owner**: Operating system user account executing the task.
- **CPU %**: Real-time CPU core utilization.
- **RSS Memory**: Resident Set Size physical memory consumption formatted in MB/GB.
- **Command / Path**: Full binary path and invocation arguments.
- **Action Buttons**: One-click **Terminate (SIGTERM)** and **Force Kill (SIGKILL)** buttons.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Finding and Killing a Stale Server Holding a Port
1. Launch Process Monitor Studio: \`bun run app:process\`.
2. In the search bar, type the name of your server runtime: \`bun\` or \`node\`.
3. Locate the rogue process in the filtered list.
4. Review the **RSS Memory** and **CPU%** columns to confirm it is the orphaned task.
5. Click **Terminate (SIGTERM)** to shut it down gracefully.
6. If the process does not terminate within 3 seconds, click **Force Kill (SIGKILL)** to release the port immediately.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + F** / **Ctrl + F** | Toolbar | Focus process search bar |
| **Cmd + R** / **Ctrl + R** | Global | Force immediate process list refresh |
| **Cmd + K** / **Ctrl + K** | Selected Row | Send SIGTERM signal |
| **Cmd + Shift + K** | Selected Row | Send SIGKILL signal |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Graceful vs Force Kill**: Always attempt \`SIGTERM\` (Terminate) first. This allows databases (like SQLite or Postgres) and node apps to flush writes to disk and close open sockets cleanly before exiting.
`);

  console.log("✔ Core Workstations (01 to 06) generated with AAA quality.");
}
