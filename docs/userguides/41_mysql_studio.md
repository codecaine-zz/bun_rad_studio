# 🐬 MySQL Studio Pro -- Complete Production User Guide

```
Version: 3.0.0 Enterprise  •  Engine: Native Bun SQL (MySQL / InnoDB Subsystem)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:mysql]  •  [Direct: bun run applications/mysql_studio.ts]
```

> **Open it from the File Manager.** MySQL Studio can also be opened inside the Codecaine File Manager: the File Manager's **Databases** tool can keep MySQL / MariaDB connections (the password in the keychain) and open this studio for one. A saved connection replaces environment variables ([how](43_file_manager.md#databases-databases-tab), [order of precedence](../databases/index.md#connection-settings-and-environment-variables)).

---

## 🌟 Executive Overview
**MySQL Studio Pro** is an enterprise-grade, high-performance MySQL workstation, visual relational query designer, schema architect, live diagnostic cockpit, and database backup manager engineered natively on Bun's built-in `SQL` subsystem.

It delivers sub-millisecond execution latency, pure macOS WebKit desktop integration, and native support for all modern MySQL features (including MySQL 8+ `caching_sha2_password` authentication, declarative range/list/hash partitioning, custom ENUM/SET types, binary logs, and InnoDB transaction lock tracking)—with **zero external software dependencies**, zero npm packages, and a robust dual-mode connection manager supporting both `.env` environment variables (`MSQL_*` / `MYSQL_*`) and on-the-fly manual credentials.

Following our commitment to **workflow parity**, MySQL Studio Pro brings iconic desktop database workflows to MySQL:
- **🧮 Totals Row**: Live pinned footer row calculating instant sums, averages, counts, min, and max across table records.
- **⚡ Quick Filter Bar**: Instant keystroke column filtering and cell right-click *"Filter by Selection"*.
- **🖨️ Publication Report Generator**: Publication-ready printable report preview modal with `@media print` print styling, `Print / Save PDF`, and `Export HTML`.
- **💾 1-Click Database Backup & SQL Dump**: Instant schema DDL and table data dump generator with copy, download, and SQL editor integration.
- **🏷️ Custom Types & ENUMs Manager**: Real-time reflection and alteration of MySQL `ENUM` and `SET` column definitions.
- **📦 Declarative Partition Trees Explorer**: Visual inspection of partitioned tables, bound expressions, and row estimates.
- **📡 Streaming Replication & Binary Log Diagnostics**: Live binary log status, coordinates, and replica thread telemetry.
- **⚡ Live Activity & Lock Contention Monitor**: Real-time processlist monitoring with 1-click `KILL <PID>` process termination.
- **📐 Visual Query Designer with Cardinality Badges**: Drag-and-drop relationship canvas with cardinality badges (`1` and `∞`) and interactive Venn diagram join properties.

---

## 🖼️ Verified Visual Interface Tour

| Totals Row & Quick Filter Bar Active |
| :---: |
| ![MySQL Totals Row & Filter Bar](../../screenshots/apps/mysql_totals_filter_verified.png) |

| Publication Report Generator Modal | 1-Click Database Backup & SQL Dump Generator |
| :---: | :---: |
| ![Report Modal](../../screenshots/apps/mysql_access_report_modal_verified.png) | ![Database Backup & Dump Modal](../../screenshots/apps/mysql_backup_dump_modal_verified.png) |

| Custom ENUM & SET Types Manager | Add MySQL ENUM Column Modal |
| :---: | :---: |
| ![Custom Types & ENUMs Tab](../../screenshots/apps/mysql_enum_types_tab_verified.png) | ![Add ENUM Column Modal](../../screenshots/apps/mysql_create_enum_modal_verified.png) |

| Declarative Partition Trees Explorer | Streaming Replication & Binary Log Diagnostics |
| :---: | :---: |
| ![Partition Trees Tab](../../screenshots/apps/mysql_partition_trees_tab_verified.png) | ![Replication & Binlogs Tab](../../screenshots/apps/mysql_replication_tab_verified.png) |

| Live Process List & Lock Contention Monitor | Visual Query Designer with Cardinality Badges (`1` & `∞`) |
| :---: | :---: |
| ![Live Activity & Locks Tab](../../screenshots/apps/mysql_activity_locks_tab_verified.png) | ![Visual Query Designer](../../screenshots/apps/mysql_visual_designer_cardinality_verified.png) |

---

## 🍺 Installing & Setting Up MySQL with Homebrew (macOS)

If you do not already have a running MySQL server, you can install and configure one locally in minutes using [Homebrew](https://brew.sh):

### Step 1: Install MySQL Server
```bash
# Update Homebrew formulae
brew update

# Install the latest stable MySQL server (MySQL 8.x / 9.x)
brew install mysql
```

### Step 2: Start the MySQL Background Service
Launch MySQL as a background service so it runs automatically on login:
```bash
# Start MySQL background daemon
brew services start mysql

# Verify the service is running and listening on port 3306
brew services list | grep mysql
```

### Step 3: Configure Root Password & Authentication
By default on Homebrew, MySQL installs without a root password. Connect and set your password:
```bash
# Connect as root with no initial password
mysql -u root
```

Inside the MySQL prompt, set your root password and refresh privileges:
```sql
-- Replace 'choose-a-strong-password' with your desired password
ALTER USER 'root'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
FLUSH PRIVILEGES;
EXIT;
```

### Step 4: Create the Application Database
Create the development database matching your `.env` configuration:
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS my_app_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

---

## 🔌 Environment Variables Configuration (`MSQL_*` Convention)

MySQL Studio Pro natively detects and loads connection parameters from `.env` in the project root, supporting standard MySQL environment variable conventions with seamless fallbacks:

```bash
# ==============================================================================
# 🐬 MySQL Studio Pro Configuration
# ==============================================================================

# Recommended Primary Convention:
MSQL_HOST=localhost
MSQL_PORT=3306
MSQL_USER=root
MSQL_PASSWORD=your-password
MSQL_NAME=my_app_dev
MSQL_TLS=false

# Full Connection URL (Alternative):
# MSQL_URL=mysql://user:your-password@localhost:3306/my_app_dev

# Supported Fallbacks:
# MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_DB
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
```

---

## 🛠️ Manual Connection Configuration Workbench

If you do not have or do not want to use `.env` variables, click **`🔌 Connection Config...`** in the header. The workbench provides:

1. **Form Fields Mode & URL Mode**:
   - Live bidirectional synchronization between discrete fields (`Host`, `Port`, `Username`, `Password`, `Database`, `SSL/TLS`) and the standard `mysql://...` connection string.
   - Built-in password visibility toggle (`👁️`).
2. **One-Click Presets**:
   - `🏠 Localhost (3306)`: Sets `localhost:3306`, `root`, `my_app_dev`.
   - `🐳 Docker (127.0.0.1:3306)`: Sets standard Docker host IP.
   - `🔌 Port 3307`: Secondary MySQL/MariaDB instance preset.
   - `☁️ RDS Template`: Cloud template with SSL encryption automatically enabled.
   - `↺ Reset to .env`: Restores values from the project `.env` file at any time.
3. **⚡ Non-Destructive Connection Test**:
   - Tests credentials and network connectivity safely without modifying the active workspace connection.
   - Displays roundtrip query latency (`1.8 ms`) and exact MySQL engine version.
4. **💾 Saved Profiles**:
   - Save custom cluster profiles directly in workstation memory (`localStorage`) for fast switching between dev, staging, and production environments.
5. **🗄️ Server Database Switcher & Creator**:
   - Lists all databases on the active MySQL server (`SHOW DATABASES`).
   - 1-click database switching and 1-click database creation with SQL injection validation.

---

## 🖥️ Workstation Workspace Overview (All 11 Dedicated Panes)

MySQL Studio Pro features 11 dedicated enterprise workstation tabs:

### 1. 📊 Tabular Data Grid & GUI CRUD Layer
- **Workflow Parity**:
  - **Pinned Totals Row (`[ 🧮 Totals ]`)**: Pinned footer row calculating live aggregations across visible table records (`Total: N`, `Count: N`, and numeric aggregations `Σ sum`, `x̄ avg`, `min`, `max`).
  - **Inline Quick Filter Bar (`[ ⚡ Filter Bar ]`)**: Persistent inline filter inputs positioned directly under each column header for instant keystroke filtering, plus cell right-click **"Filter by Selection"** shortcut.
  - **Publication Report Generator (`🖨️ Report`)**: Opens a publication-ready printable report preview modal with report header, formatted table, summary counts, `@media print` print styles, **`🖨️ Print / Save PDF`**, and **`📥 Export HTML`**.
  - **Form View & Table Designer**: Switch between Datasheet View and single-record Form View with record stepper/navigator, or open the interactive Table Design View supporting live `ALTER TABLE` operations.
- **CRUD Operations**:
  - `+ Add Record`: Visual dialog with input fields auto-configured for MySQL types (`INT`, `VARCHAR`, `DECIMAL`, `DATETIME`, `ENUM`).
  - `✎ Edit Row` & **Inline Double-Click Cell Editing**: Direct in-place editing on any cell with automatic type casting.
  - `⧉ Duplicate Row`: Clones selected record for rapid prototyping and mock data population.
  - `🗑 Delete Row`: Safe deletion with confirmation prompt and primary key resolution.
  - `📐 Design Table`: Table Designer modal to add/remove columns, change types, toggle PK and NOT NULL.
  - `⚡ Indexes Manager`: View all table indexes with 1-click index creation supporting **BTREE, FULLTEXT, and SPATIAL** algorithms.
  - `📥 Import Wizard`: Import rows from CSV or JSON format with preview and batch insertion.
  - `📤 Export Wizard`: Export table data or query results to CSV, JSON, or SQL INSERT scripts.

#### Creating, editing and dropping views

The **＋ Create view** button on the sidebar **Views** header, **🧱 Create view** beside the SQL editor (it takes the selected text, or the whole editor), **Save as View** in the Visual Query Designer and **👁️ New View** all open one dialog: name (validated as you type, quoted with backticks), the `SELECT` query (editable), an optional column list, **Replace if it exists** (`CREATE OR REPLACE VIEW`), **Algorithm** (`UNDEFINED`/`MERGE`/`TEMPTABLE`), **SQL security** (`DEFINER`/`INVOKER`) and a read-only **DDL preview**. MySQL has no `CREATE VIEW IF NOT EXISTS`, so that clause is never generated (older builds produced it and the statement always failed). **Check query** runs the query with `LIMIT 0` and looks for a name collision, creating nothing, and explains errors in plain words; errors stay inside the dialog. On success the tree refreshes, the view opens, a toast appears and the audit log gets an entry. Right-click a view for **Edit view definition…** (read back from `information_schema.views`, saved with `CREATE OR REPLACE VIEW`) or **Drop view…** (asks first). A table can never be overwritten by this dialog, and only one `SELECT`/`WITH`/`VALUES` statement is accepted.

Every prompt and confirmation of the studio (save connection profile, add enum value, terminate process, save designer query …) now uses an in-page dialog: the browser's native `prompt()`/`confirm()` do nothing in the desktop window. Enter confirms, Esc closes only the dialog.

#### The datasheet works like a desktop database

Every data grid (a table opened from the sidebar, and query results) works like a classic datasheet, the same way in the three studios. Everything below is remembered **per table** (or per result shape for queries) in this browser, together with the hidden columns, and **Reset to default** in the *Hide / Unhide Fields* list forgets it all.

| What | How |
| :--- | :--- |
| **Hide / Unhide Fields** | The **Columns** button (badge `9 of 14`), the **▾** on a header, a right-click on a header, or the strip *N hidden columns · Show all · Unhide Fields…* open one checklist: a checkbox per field (type and PK/FK/IDX marks, alias and real name), a filter box, **Select all**, **Clear**, **Only keys**. At least one field always stays visible. Ctrl/Cmd+click and Shift+click on headers select several columns; **Hide Fields (n selected)** hides them together. |
| **Column width** | Drag the right edge of a header (cursor `col-resize`, a guide line follows, 48–900 px, mouse, touch and pen). **Double-click** the edge to fit the content (header plus the first 150 rows, capped at 480 px). Keyboard: focus a header and press **Alt+←/→** (10 px, Shift = 40 px), or **Field Width…** in the header menu (number box, **Standard Width**, **Best Fit**). **Fit all columns** and **Reset widths** are in the header menu and in *Datasheet layout*. The header, filter bar, totals row and body share one column grid, so they stay aligned. |
| **Column alias (caption)** | **Rename Field…** (header menu or the ✎ in the field list) gives a column a *display name*: it shows in the header (dotted underline, tooltip = real name), in the Hide / Unhide list (alias and real name) and can be cleared with **Use real name**. It never touches the database, SQL, sorting or the generated statements, which always use the real name. *Use display names (aliases) in copy/export* (off by default, shown in the list) puts the aliases in the header of copied/exported data. |
| **Reorder** | Drag a header onto another one (a bar shows where it lands), or **Move left / Move right** in the header menu. Copy and export follow the grid order. |
| **Freeze columns** | **Freeze columns up to here** keeps that column and everything left of it (plus the checkbox and `#` gutter) in place while you scroll sideways; **Unfreeze all columns** releases them. |
| **Filter** | **Filter…** in the header menu: a condition (equals, contains, begins/ends with, greater/less than, between, is empty, is not empty) or a checklist of the distinct values with a search box. It filters the rows of the page that is showing (the database query is not changed); a header mark and the strip *N filters: x of y rows on this page* show it, **Clear all filters** removes them. *Filter by selection* (right-click a cell) and the **Filter Bar** keep working as before. |
| **Sort** | **Sort A → Z / Z → A / Clear sort** in the header menu (as before, a plain click on a header sorts; SQLite and MySQL sort on the server, the PostgreSQL grid has no header sort). |
| **Formatting** | *Datasheet layout* in the field list: **Row height** (compact / normal / spacious), **Font size**, **Alternate row color**. **Reset layout** returns widths, order, frozen columns and formatting to default and keeps hidden columns and display names. |

Not included: the per-column totals functions (Sum, Avg, Count, Min, Max) are not in this release (the **Totals** row keeps its existing behavior), filters work on the loaded page rather than on the whole table, *Save as SQL alias* is not offered, and a plain click on a header still sorts (selects the column) so Ctrl/Cmd+click and Shift+click select columns.

#### Focus mode: use the whole window for one section

Every major section has a **⤢ Focus** button in its header: the tab bar (acts on the current tab), the sidebar object tree, the SQL editor, the data grid toolbar, the Visual Query Designer ribbon, and the header of each other tab (schema, macros, plan, audit and so on). **Alt+Enter** (Option+Enter on a Mac) focuses the section under the cursor and leaves focus mode again; a double-click on a section's header toggles it too. In focus mode the application header, KPI strip, tab bar, sidebar and footer are hidden and the section fills the window. A slim bar stays at the top with the section name, an **Editor / Both / Results** switch (where a section has an editor and a result: the SQL editor, the data grid) and an **✕ Exit focus** button that is always there.

Focus only hides the other regions: the grid's columns, widths, scroll position and selection and the editor's unsaved text are untouched, and grids, the designer canvas and diagrams re-fit to the larger area. Each tab remembers its own last focus state (also after a reload). It never uses the browser full-screen API (the window's own full-screen toggle is the separate **F11** / **Ctrl+Cmd+F**), and **Esc is not used**, because it belongs to open dialogs, menus and popovers. The shortcut appears in the **⌨ Shortcuts** list.

#### Showing and hiding columns

Every data grid (a table opened from the sidebar, and the result of a query) has a **Columns** button in its toolbar. It shows how many columns are visible (`9 of 14` when some are hidden, the plain count when all are shown).

- **Pick columns**: click **Columns** (or focus it and press Enter / ↓). A popover lists every column with its type and **PK** / **FK** / **IDX** marks. Tick or untick a column to show or hide it at once. Tables with more than 8 columns get a filter box. **Show all**, **Hide all**, **Only keys** (primary key, foreign key and indexed columns) and **Reset to default** act on the whole list, or only on the matches while a filter is typed. One column always stays visible (the primary key, otherwise the first column).
- **Hide from the header**: each column header has a ▾ button; right-click the header (or press Shift+F10 / the Menu key on a focused header) for the same menu: **Sort ascending / descending**, **Hide column**, **Hide other columns**, **Show all columns**, **Choose columns…**.
- **Nothing is lost silently**: while columns are hidden a strip above the grid says `N hidden columns`, lists the first ones as chips (click a chip to bring that column back), and offers **Show all** and **Choose columns…**. It also warns when a quick filter or the sort order uses a column you have hidden.
- **Remembered**: the choice is saved in this browser per database and table (query results: per set of result columns) and comes back after a reload. **Reset to default** forgets it. Hidden columns only change what is drawn; sorting, filtering, selection, inline editing, **Add / Edit row** (which always lists every column) and keyboard use are unaffected.
- **Copy and export follow what you see**: **Copy**, **Export** (grid dialog and the Export CSV / JSON / SQL buttons) and **Report** use the visible columns only; the buttons' tooltips and the Export dialog say so. Tick **Include hidden columns when copying or exporting** in the Columns popover to include every column. The JSON Inspector tab always shows the raw rows.
- **Keyboard**: Tab to **Columns**; in the popover ↑ / ↓ / Home / End move between columns, Space toggles, Tab stays inside, **Esc closes only the popover** and returns focus to the button.

### 2. ⚡ SQL Query IDE & 1-Click Database Backup
- **1-Click Database Backup & SQL Dump (`💾 DB Backup / Dump`)**:
  - High-performance SQL dump generator producing standard MySQL recovery scripts.
  - 3 dump modes: **Complete (Schema DDL + Table Data)**, **Schema Only (DDL, Indexes, Keys, Views)**, or **Data Only (INSERT Statements)**.
  - Table selection checklist to backup specific tables or the entire database.
  - Live syntax-styled SQL preview with **`📋 Copy SQL`**, **`📥 Download .sql`**, and **`🚀 Open in SQL IDE`**.
- Syntax-highlighted query editor with keyboard shortcuts (**Cmd+Enter** or **Ctrl+Enter** to execute). In the **Visual Query Designer**, **Cmd/Ctrl+Enter** or **F5** runs the designer query (Design/Datasheet view) or the SQL as written (SQL view), also while the cursor is in one of its fields; the **! Run** button shows the shortcut and the page never reloads. **Cmd/Ctrl+/** or **F1** (or the **⌨ Shortcuts** button) lists every shortcut.
- 11 Curated MySQL-specific SQL presets covering Multi-table joins, Customer lifetime spend, Sales by category, Inventory alerts, and Audit trails.
- Tabular output with execution latency and row counts; export results to CSV, JSON, and SQL.

### 3. 📐 Visual Query Designer & Relational Canvas
- **Relational Canvas**:
  - Add tables and views as movable cards with draggable headers.
  - Interactive column lists showing primary keys (🔑) and data types.
  - Automatic relationship discovery via foreign key introspection (`⚡ Auto-Detect Joins`).
  - **Cardinality Badges (`1` and `∞`)** displayed on relationship endpoints.
  - Automatic clean grid alignment (`📐 Auto-Arrange`).
- **Deep Zoom & Room Expansion Controls**:
  - Zoom range from 50% to 200% (`🔍+`, `🔍−`, `1:1`, `🎯 Fit`).
  - Room presets: `⤢ Canvas`, `⤡ Split`, and `⤢ Grid` with draggable horizontal resizer bar (`#qbeResizerBar`).
- **Join Properties Modal with Interactive Venn Diagrams**:
  - **Option 1**: INNER JOIN (Only matching rows)
  - **Option 2**: LEFT OUTER JOIN (ALL records from Left Table)
  - **Option 3**: RIGHT OUTER JOIN (ALL records from Right Table)
  - **Option 4**: FULL OUTER JOIN (Emulated union of left and right joins)
  - **Option 5**: CROSS JOIN (Cartesian product)
  - Dynamic SVG Venn diagram preview with live SQL snippet generation.
- **Lower QBE Matrix**:
  - Configure Field, Table, Total (`GroupBy`, `Sum`, `Avg`, `Count`, `Min`, `Max`), Sort, Show, and Criteria.
- Switch between **📐 Design View**, **💻 SQL View**, and **📋 Datasheet View**.

### 4. 🏛️ Schema Designer & DDL Generator
- Visual schema explorer listing all database tables and views.
- Inspect detailed column definitions, collation, indexes, and foreign keys.
- Live DDL viewer displaying exact `SHOW CREATE TABLE` and `SHOW CREATE VIEW` definitions.

### 5. 🏷️ MySQL Custom ENUM & SET Types Manager
- Dedicated workstation tab inspecting `information_schema.COLUMNS` where `DATA_TYPE IN ('enum', 'set')`.
- Visual cards grid displaying each column's ENUM type, allowed values pills, and cardinality.
- Inline **`➕ Add Value`** to append new enum labels dynamically (`ALTER TABLE tbl MODIFY COLUMN col ENUM(...)`).
- **`➕ Add ENUM Column`** modal dialog to add new enumeration columns on the fly.

### 6. 📦 Declarative Partition Trees Explorer
- Dedicated workstation tab inspecting `information_schema.PARTITIONS`.
- Visualizes partition hierarchies with partition strategy badges (**RANGE**, **LIST**, **HASH**, **KEY**).
- Displays child partition names (e.g. `p2023`, `p2024`, `p_future`), partition bound expressions (e.g. `2024`, `MAXVALUE`), relation storage size, and row count estimates.

### 7. ⚡ Live Activity & Lock Contention Monitor
- Dedicated workstation tab monitoring live MySQL database processes and transactions:
  - Real-time process table (`SHOW PROCESSLIST`): `PID`, `User`, `Database`, `Client Host`, `State` (`WAITING ON EMPTY QUEUE`, `SLEEP`, `EXECUTING`), `Time`, `Executing Query`.
  - Transaction lock contention detection via `information_schema.innodb_lock_waits` and `innodb_trx`.
  - 1-click **`⚡ Kill <PID>`** process termination.

### 8. 📡 Streaming Replication & Binary Log Diagnostics
- Dedicated workstation tab inspecting MySQL replication and change-data-capture pipelines:
  - **Replica Status (`SHOW REPLICA STATUS` / `SHOW SLAVE STATUS`)**: IO Running, SQL Running, Source Host, Source Log File, Lag (Seconds), Last Error.
  - **Binary Log Files (`SHOW BINARY LOGS`)**: List of active binary logs with file sizes.
  - **Master / Coordinator Status (`SHOW BINARY LOG STATUS` / `SHOW MASTER STATUS`)**: Current binlog file and binlog position coordinate.

### 9. 🔍 Query Plan Visualizer
- Visualizer executing `EXPLAIN FORMAT=TREE` and `EXPLAIN ANALYZE` (MySQL 8.0.16+).
- Hierarchical display of table scans, index lookups, filter predicates, and execution timings.

### 10. 💻 Raw JSON Inspector
- Formatted JSON inspector displaying raw API payloads and database row data.
- Built-in syntax highlighting and 1-click copy for easy debugging.

### 11. ⚙️ MySQL Maintenance & Telemetry
- Dedicated server maintenance dashboard:
  - `OPTIMIZE TABLE`: Rebuilds and defragments InnoDB tablespaces.
  - `CHECK TABLE`: Validates table integrity and index structures.
  - `ANALYZE TABLE`: Updates key distribution statistics for query optimizer.
  - System Variables Explorer: Inspect live global and session variables.

### 12. ⚡ Macro Designer (Automation)
A visual action matrix (reorder ▲/▼, per-step conditions, Action Catalog, Single Step debugger, AutoExec, JSON import/export), shared with SQLite Studio and adapted to MySQL.
- **Error handling**: macros stop at the first failing step. Set **On error: Continue** on the macro, or tick **On Err ⏭** on one step, to keep going. An unparsable condition fails the step instead of silently running it.
- **🧪 Dry Run / 🔒 Atomic**: run the data steps on the server inside one transaction on a pinned connection; Dry Run always rolls back, Atomic commits only if every step succeeds. **MySQL commits implicitly before DDL** (`CREATE`/`DROP`/`ALTER`/`TRUNCATE`), so DDL steps (including `MakeTable`) and `VacuumDatabase` are *refused* in these modes rather than silently committing.
- **Pre-flight validation**: missing arguments block the run; `UPDATE`/`DELETE` without `WHERE` asks for confirmation.
- **Parameter prompts**: `[Enter Start Date]` in `RunSQL` / `OpenQuery` / `MakeTable` SQL prompts once per run; values are inserted as quoted literals with `'` and `\` escaped for MySQL.
- **Sub-macros**: `RunMacro` runs another macro (recursion-guarded). **Duplicate** clones a macro.
- **Export**: JSON, **SQL script** (`START TRANSACTION; ... COMMIT;`, backtick identifiers) and **VBA module**.
- **🧬 Code Generation (Python · Bun · V)**: translate a macro, a saved query, or the SQL in the editor into a standalone program that uses the **native SQLite driver** of your language, then **Copy to Clipboard** (or Download) for RAD work. Open it from **🧬 Code** in the SQL editor bar or Macro ribbon, or the 🧬 button on a saved query / macro in the sidebar.
  - **Python** → `sqlite3` (stdlib): parameterized queries, `with conn:` transaction, `argparse`, type hints.
  - **Bun** → `bun:sqlite`: prepared statements, `db.transaction()`, WAL + `foreign_keys`, `parseArgs`.
  - **V** → `db.sqlite`: `!` error propagation, `begin`/`commit`/`rollback`, `flag` module (V binds parameters as text, so numbers/NULLs are inlined and user text is bound).
  - The whole macro runs in **one transaction** (rolled back on error; `continueOnError` steps are caught). `VACUUM`/backup steps run after the commit. `[Enter ...]` prompts become `?` placeholders filled from command-line flags, `RunMacro` becomes a function call, and `[var]` conditions become native `if`s. UI-only actions (dialogs, navigation, reports) are skipped and listed as warnings.
  - MySQL SQL is translated to SQLite on a best-effort basis (backticks, `NOW() - INTERVAL n DAY`, `LIMIT a,b`, ...); anything that has no SQLite equivalent (`CONCAT`, `ON DUPLICATE KEY`, `ENUM`, ...) is reported in a ⚠️ review list instead of being silently changed.
- **Maintenance & backup actions**: `VacuumDatabase` runs `OPTIMIZE TABLE` (+ `ANALYZE TABLE` with *analyze*) on every table; `BackupDatabase` generates the SQL dump.
- **Storage**: macros and saved queries are stored as JSON per connection under `~/.bun_rad_studio/macros/` (override with `STUDIO_MACRO_STORE_DIR`) — nothing is created inside your database. Saved queries from the Visual Query Designer appear under **👁️ Saved Queries** and can be used by `OpenQuery` / `MakeTable`.

---

## 🌱 Sample Databases

**🌱 Seed Sample DB** opens **Sample databases**: eleven production-style synthetic databases (Medicare Part D formulary builder, hospital, claims, banking ledger, e-commerce, SaaS billing, HR, warehouse, airline, issue tracker, IoT) at Small / Medium / Large size. Each is created in a **new database** (default `sample_<id>`; a taken name is refused and existing databases are never touched) using `JSON` and generated columns, `COMMENT` clauses on every table and column, triggers and indexes, with a progress bar and **Cancel** (a cancelled or failed sample is dropped again). Then **Open it** switches the studio to it. The **Example queries** panel lets you choose one read-only query (or all) and **Put in the SQL editor** (switches to the sample first so table names resolve) or **Run it** inside the dialog. See [Sample databases](../databases/sample-datasets.md).

---

## Import with staging

**📥 Import with staging** (button in the header) is the careful way to bring incoming records into a MySQL / MariaDB database: the rows are copied into a **staging table** first, checked there, and only then **promoted** into your real table in one transaction — with an **Undo this import** button. It is a five-step wizard (*Source → Map → Load to staging → Check → Review & promote*) with plain-words messages and one main button per step.

- **Source:** drop or pick a CSV, TSV, semicolon/pipe-separated text, JSON list or JSON Lines file (or paste text). Encoding (UTF-8, UTF-16, Latin-1), separator, quotes and header row are detected and editable, with a live preview. Excel files are not read (use *Save As → CSV UTF-8*). Big files are streamed, never loaded whole (limits: 2 GB, 5,000,000 rows).
- **Map:** pick the target table (or **Create a new table from this data**); columns are matched by name and synonym, with suggested clean-ups (trim, empty → NULL, dates, numbers like `1.234,56`, yes/no) and your own checks. The mapping is remembered per table.
- **Load to staging:** the staging table is `stg_<table>_<yyyymmdd>_<hhmm>` in the same database, all columns `TEXT` plus `_stg_*` bookkeeping columns. Your table is not touched. Cancel rolls everything back.
- **Check:** types, sizes, required columns, repeats in the file, rows that already exist (new / same / changed), foreign keys, unique collisions, your own rules and the table's own CHECK rules. Fix a cell in place, skip rows, clean a whole column, download the rejects as CSV, check again.
- **Review & promote:** add new only, upsert, update only, add everything, or append; a dry run with exact counts, a before/after sample, the exact SQL and a test run that is rolled back; then one transaction. In MySQL an import **without a key column** cannot be undone (MySQL has no `RETURNING`), and creating a table cannot be rehearsed because MySQL commits DDL at once.

Full guide, naming convention, safety notes and limitations: [Import with staging](../databases/staging-import.md). The File Manager can open this wizard for a connection or for a data file ([File Manager: Databases](43_file_manager.md#databases-databases-tab)).

## 📡 RESTful HTTP API Reference

MySQL Studio Pro exposes a high-performance, local HTTP telemetry and database API:

| Method | Endpoint | Description | Payload / Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/schema` | Complete schema reflection (tables, views, columns, keys, row counts) | None |
| `POST` | `/api/query` | Execute arbitrary SQL queries with execution timing | `{ sql: string, params?: any[] }` |
| `POST` | `/api/explain` | Return tree execution plan for queries | `{ sql: string }` |
| `POST` | `/api/table/data` | Paginated table rows with sorting, filtering, and total counts | `{ table: string, page?: number, pageSize?: number, orderBy?: string, orderDir?: "ASC"\|"DESC", search?: string }` |
| `POST` | `/api/table/aggregates` | Calculate totals row aggregations (Sum, Avg, Count, Min, Max) | `{ table: string }` |
| `POST` | `/api/table/mutate` | Insert, update, or delete records | `{ table: string, action: "insert"\|"update"\|"delete", payload: object }` |
| `POST` | `/api/rows/insert` | Insert row convenience endpoint | `{ table: string, row: object }` |
| `POST` | `/api/rows/update` | Update row convenience endpoint | `{ table: string, pkCol: string, pkVal: any, row: object }` |
| `POST` | `/api/rows/delete` | Delete row convenience endpoint | `{ table: string, rowId: any, pkColumn: string }` |
| `POST` | `/api/rows/import-batch`| Batch import records | `{ table: string, rows: object[] }` |
| `POST` | `/api/table/truncate` | Truncate table convenience endpoint | `{ table: string }` |
| `POST` | `/api/database/dump` | Generate complete SQL dump & recovery script | `{ mode?: "all"\|"schema"\|"data", tables?: string[] }` |
| `GET` | `/api/types/enums` | List all custom ENUM/SET columns across tables | `?schema=my_app_dev` |
| `POST` | `/api/types/enums/add-value` | Append new allowed value to ENUM definition | `{ table: string, column: string, value: string }` |
| `POST` | `/api/types/enums/create` | Add new ENUM column to table | `{ name: "table.column", values: string[] }` |
| `GET` | `/api/partitions` | Query declarative partition trees from `information_schema` | `?schema=my_app_dev` |
| `GET` | `/api/replication` | Query replication status and binary logs | None |
| `GET` | `/api/activity` | Query active processes and lock waits | None |
| `POST` | `/api/activity/terminate`| Terminate blocking database process (`KILL <PID>`) | `{ pid: number }` |
| `GET` | `/api/kpis` | Database KPIs (size, tables, views, rows, version) | None |
| `POST` | `/api/pragma` | Execute maintenance operations (`vacuum`, `integrity_check`, variables) | `{ pragma: string, value?: string }` |
| `POST` | `/api/export` | Export rows to CSV, JSON, or SQL | `{ format: "csv"\|"json"\|"sql", rows: object[], tableName?: string }` |
| `GET`/`POST` | `/api/macros/list` | List saved macros | — |
| `POST` | `/api/macros/save` / `/api/macros/delete` | Create/update or delete a macro | `{ macro: MacroDefinition }` / `{ id?: string, name?: string }` |
| `POST` | `/api/macros/run` | Run a macro with step telemetry | `{ macro?, id?, variables?, transaction?: boolean, dryRun?: boolean, params?: Record<string, any> }` |
| `POST` | `/api/macros/validate` | Pre-flight check | `{ macro: MacroDefinition }` |
| `POST` | `/api/macros/export` | Export as `json`, `sql` or `vba` | `{ macro?, id?, format? }` |
| `POST` | `/api/codegen` | Translate a macro or SQL to native-SQLite code | `{ kind: "macro"\|"sql", target: "python"\|"bun"\|"vlang", macro?, id?, sql?, name? }` |
| `GET`/`POST` | `/api/queries/list`, `/api/queries/save`, `/api/queries/delete` | Saved named queries | `{ query }` / `{ id }` |

---

## 🧪 Comprehensive Automated Test Suite Verification

MySQL Studio Pro features an exhaustive automated test suite validating every tier of the database workstation against a live MySQL server instance:

```bash
# Run the complete MySQL test suite
bun test tests/mysql_studio_e2e.test.ts tests/mysql_manual_config.test.ts
```

### Verified Test Results (35 Passing Tests, 0 Failures):
- `tests/mysql_studio_e2e.test.ts`:
  1. `✓ 1. HTML contains all 11 enterprise workstation navigation tabs and corresponding panes`
  2. `✓ 2. HTML includes Visual Query Designer with deep zoom, room presets, resizer bar, and Venn preview`
  3. `✓ 3. HTML bundles the GUI CRUD layer (inline edits, modals, table designer)`
  4. `✓ 4. GET /api/schema returns tables, columns, indexes, and exact row counts`
  5. `✓ 5. POST /api/table/data returns paginated rows with column data`
  6. `✓ 6. Complete Table Lifecycle: Create, Insert, Update, Import Batch, Truncate, Drop`
  7. `✓ 7. Totals Row & Quick Filter Bar in Datasheet`
  8. `✓ 8. Publication Report Generator Modal & Print View`
  9. `✓ 9. MySQL Custom ENUM/SET Types Management via information_schema.COLUMNS`
  10. `✓ 10. Declarative Partition Trees Explorer (information_schema.PARTITIONS)`
  11. `✓ 11. Streaming Replication & Binary Log Diagnostics (SHOW BINARY LOGS & REPLICA STATUS)`
  12. `✓ 12. Live Process List & Lock Contention Monitor (PROCESSLIST & innodb_lock_waits)`
  13. `✓ 13. Enterprise 1-Click Database Backup & SQL Dump Generator`
  14. `✓ 14. POST /api/query executes SQL queries with execution timing`
  15. `✓ 15. POST /api/explain returns tree execution plan for queries`
  16. `✓ 16. GET /api/kpis returns enterprise database metrics`
  17. `✓ 17. POST /api/pragma retrieves MySQL system variables`
  18. `✓ 18. POST /api/export exports query results in CSV, JSON, and SQL formats`
  19. `✓ 19. HTML includes 22 theme options, persistent SQL banner, and 5 KPI cards`
  20. `✓ 20. Audit log entries are written to audit_logs during operations`
- `tests/mysql_manual_config.test.ts`:
  21. `✓ 1. GET /api/config returns sanitized connection details without exposing raw password`
  22. `✓ 2. POST /api/test-config performs safe non-destructive credential verification`
  23. `✓ 3. POST /api/config with resetToEnv restores environment configuration`
  24. `✓ 4. POST /api/create-database validates database names and rejects unsafe characters`
  25. `✓ 5. MySQL Studio HTML contains all manual connection controls, tabs, and presets`
  26. `✓ 6. Embedded client scripts compile with zero syntax errors (new Function validation)`
  27. `✓ 7. Connection URL parsing and serialization round-trip logic`
  28. `✓ 8. Programmatic creation via createMysqlStudio accepts manual connection options`
  29. `✓ 9. Correctly resolves MSQL_* environment variable naming convention`
  30. `✓ 10. POST /api/query executes queries and returns rows, columns, and latency`
  31. `✓ 11. POST /api/explain parses query plan tree with timing and costs`
  32. `✓ 12. createMysqlStudio resolves default database to real DB and never :memory:`
  33. `✓ 13. POST /api/query executes queries with both MySQL backticks and ANSI double quotes seamlessly`
  34. `✓ 14. POST /api/explain handles both MySQL backticks and ANSI double quotes without syntax errors`
  35. `✓ 15. Client HTML quoteSqlIdentifier generates MySQL backtick identifiers`

**Execution Summary: 35 passing tests, 289 expect() assertions, 0 errors.**

---

## 🔒 Security & Architecture Notes
- **Local Workstation Guard**: All internal API endpoints are restricted to loopback connections (`127.0.0.1` / `localhost`) via `guardLocalRequest()`.
- **Parameterized Queries**: All user inputs in the search bar, data grid mutations, and server operations use parameterized queries to prevent SQL injection.
- **Isolated Threading**: The background HTTP telemetry and MySQL engine runs on an isolated thread via Bun's Web Worker API, ensuring the desktop UI remains responsive with zero event loop blocking.
- **Safe Authentication**: Natively supports modern MySQL 8+ `caching_sha2_password` and `mysql_native_password` authentication mechanisms.
