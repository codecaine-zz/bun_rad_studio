# 🐘 Postgres Studio Pro -- Complete Production User Guide

```
Version: 1.0.0  •  Engine: Native Bun SQL (PostgreSQL Subsystem)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:postgres]  •  [Alias: bun run app:pg]  •  [Direct: bun run applications/postgres_studio.ts]
```

> **Open it from the File Manager.** PostgreSQL Studio can also be opened inside the Codecaine File Manager: the File Manager's **Databases** tool can keep PostgreSQL connections (the password in the keychain) and open this studio for one. A saved connection replaces environment variables ([how](43_file_manager.md#databases-databases-tab), [order of precedence](../databases/index.md#connection-settings-and-environment-variables)).

---

## 🌟 Executive Overview
**Postgres Studio Pro** is an enterprise-grade, high-performance PostgreSQL database workstation, visual relational query designer, schema explorer, extensions manager, and live diagnostics cockpit engineered natively on Bun's built-in `SQL` subsystem.

It delivers sub-millisecond execution latency, pure macOS WebKit desktop integration, and native support for all modern PostgreSQL features—with **zero external software drivers**, zero npm dependencies, and an interactive connection workbench supporting both `.env` environment variables (`PG_HOST`, `PG_PORT`, etc.) and manual on-the-fly connection configuration.

---

## 🚀 Advanced PostgreSQL Capabilities (PostgreSQL vs. MySQL)

Postgres Studio Pro is purpose-built to harness the architectural advantages and unique features that PostgreSQL offers beyond traditional MySQL databases:

| Feature Area | 🐘 PostgreSQL (Postgres Studio Pro) | 🐬 MySQL / MariaDB | Advantage in Postgres Studio |
| :--- | :--- | :--- | :--- |
| **Schema Namespaces** | Multi-schema namespaces (`public`, `analytics`, `auth`, `staging`) inside a single database with `search_path`. | Single flat namespace (Database = Schema). | **Active Schema Switcher**: 1-click switch between schemas in header and sidebar without reconnecting. |
| **Materialized Views** | Native `MATERIALIZED VIEW` with disk persistence and indexable caches. | Not supported natively (requires triggers or temporary tables). | **Materialized Views Explorer**: Dedicated sidebar section with 1-click `⚡ Refresh` (`REFRESH MATERIALIZED VIEW CONCURRENTLY`). |
| **Extensions Ecosystem** | Dynamically loadable extensions (`uuid-ossp`, `pg_trgm`, `vector`, `citext`, `hstore`, `postgis`). | Fixed plugin architecture requiring root system compiles. | **Extensions Manager**: Visual catalog of all `pg_available_extensions` with installed status badges and 1-click install/remove. |
| **Live Diagnostics** | Fine-grained real-time engine telemetry via `pg_stat_activity`. | `SHOW PROCESSLIST` with coarse thread statuses. | **Live Activity Monitor**: Real-time process table, query duration color-coding, and 1-click `pg_cancel_backend` and `pg_terminate_backend`. |
| **Rich Native Types** | Native `UUID` (`gen_random_uuid()`), native `JSONB` with binary indexing (`@>`, `->>`), native `ARRAY` types (`text[]`, `integer[]`, `unnest`), `TIMESTAMPTZ`, and `NUMERIC`. | Emulated UUIDs (char36), basic JSON without GIN indexing, no native array types. | **Rich Data Grid Badges**: Monospace copyable UUIDs, interactive JSONB modal with syntax highlighting, and array chip formatters. |
| **Relational Joins** | Native `FULL OUTER JOIN`, `LATERAL JOIN`, recursive CTEs. | Emulates `FULL OUTER JOIN` via `UNION` of `LEFT` and `RIGHT` joins. | **Visual Query Designer**: relational canvas with Venn diagrams featuring native `FULL OUTER JOIN` option. |
| **Execution Plans** | `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)` showing buffer cache hit ratios and precise node costs. | `EXPLAIN FORMAT=TREE` / basic tabular output. | **Query Plan Visualizer**: Execution tree breakdown with planning vs. execution times and cache hits. |
| **Storage Maintenance** | `VACUUM`, `VACUUM ANALYZE`, `VACUUM FULL` to reclaim bloat and update statistics. | `OPTIMIZE TABLE` (locks table and rebuilds file). | **1-Click Maintenance**: Dedicated `🧹 VACUUM ANALYZE` trigger in top navigation. |

---

## 🔌 Environment Variables Configuration (`PG_*` Convention)

Postgres Studio Pro natively detects and loads connection parameters from `.env` in the project root, supporting standard PostgreSQL environment variable conventions with seamless fallbacks:

```bash
# ==============================================================================
# 🐘 PostgreSQL Studio Pro Configuration
# ==============================================================================

# Recommended Primary Convention:
PG_HOST=localhost
PG_PORT=5432
PG_USER=root
PG_PASSWORD=your-password
PG_DATABASE=mydb
PG_SCHEMA=public
PG_TLS=false

# Full Connection URL (Alternative):
# PG_URL=postgres://user:your-password@localhost:5432/mydb?schema=public&sslmode=prefer

# Supported Fallbacks:
# POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
```

---

## 🛠️ Manual Connection Configuration Workbench

If you do not have or do not want to use `.env` variables, click **`🔌 Connection Config...`** in the header. The workbench provides:

1. **Form Fields Mode & URL Mode**:
   - Live bidirectional synchronization between discrete fields (`Host`, `Port`, `Username`, `Password`, `Database`, `Schema`, `SSL/TLS`) and the standard `postgresql://...` connection string.
   - Built-in password visibility toggle (`👁️`).
2. **One-Click Presets**:
   - `🏠 Localhost (5432)`: Sets `localhost:5432`, `postgres`, `mydb`.
   - `🐳 Docker (127.0.0.1:5432)`: Sets standard Docker host IP.
   - `🔌 Port 5433`: Secondary PostgreSQL instance preset.
   - `☁️ Cloud (Supabase/Neon/RDS)`: Cloud template with SSL encryption automatically enabled.
   - `↺ Reset to .env`: Restores values from the project `.env` file at any time.
3. **⚡ Non-Destructive Connection Test**:
   - Tests credentials and network connectivity safely without modifying the active workspace connection.
   - Displays roundtrip query latency (`0.4ms`) and exact PostgreSQL engine version (`PostgreSQL 18.6`).
4. **💾 Saved Profiles**:
   - Save custom cluster profiles directly in workstation memory (`localStorage`) for fast switching between dev, staging, and production environments.
5. **🗄️ Cluster Database Manager**:
   - Lists all databases on the active PostgreSQL cluster (`pg_database`) with human-readable storage sizes.
   - 1-click database switching and 1-click database creation with SQL injection validation.

---

## 🖥️ Workstation Workspace Overview

Postgres Studio Pro features 11 dedicated enterprise workstation tabs:

### 1. 📊 Tabular Data Grid & GUI CRUD Layer
- **Workflow Parity**:
  - **Pinned Totals Row (`[ 🧮 Totals ]`)**: Pinned footer row calculating live aggregations across all visible records (`Total: N`, `Count: N`, and numeric aggregations `Σ sum`, `x̄ avg`, `min`, `max`).
  - **Inline Quick Filter Bar (`[ ⚡ Filter Bar ]`)**: Persistent inline filter inputs positioned directly under each column header for instant keystroke filtering, plus cell right-click **"Filter by Selection"** shortcut.
  - **Publication Report Generator (`🖨️ Report`)**: Opens a publication-ready printable report preview modal with report header, formatted table, summary counts, `@media print` print styles, **`🖨️ Print / Save PDF`**, and **`📥 Export HTML`**.
  - **Form View & Design View**: Switch between Datasheet View and single-record Form View with record stepper/navigator, or open the interactive Table Design View supporting live `ALTER TABLE ADD/DROP COLUMN`, data type modifications, and index toggles.
- **CRUD Operations**:
  - `+ Add Record`: Visual dialog with input fields auto-configured for PostgreSQL types (UUID generation, JSONB validator, array tags).
  - `✎ Edit Row` & **Inline Double-Click Cell Editing**: Direct in-place editing on any cell with automatic type casting.
  - `⧉ Duplicate Row`: Clones selected record for rapid prototyping and mock data population.
  - `🗑 Delete Row`: Safe deletion with confirmation prompt and primary key resolution.
  - `📐 Design Table`: Table Designer modal to add/remove columns, change types (`VARCHAR`, `UUID`, `JSONB`, `NUMERIC`, etc.), toggle PK and NOT NULL.
  - `⚡ Indexes Manager`: View all table indexes with 1-click index creation supporting **BTREE, GIN, GIST, BRIN, and HASH** algorithms.
  - `📥 Import Wizard`: Import rows from CSV or JSON format with preview and batch insertion.
  - `📤 Export Wizard`: Export table data or query results to CSV, JSON, or SQL INSERT scripts.
- **Sidebar Right-Click Context Menus**:
  - Context menu on tables and views: *Open Datasheet*, *Design Table*, *Manage Indexes*, *Export Data*, *Truncate Table*, *Drop Table*.
- Dedicated renderers for PostgreSQL native data types:
  - **UUIDs**: Monospace formatting with 1-click clipboard copying.
  - **JSONB**: Clickable highlighted badge; clicking opens the **JSONB Inspector Modal** with tree indentation and full path copying.
  - **Native Arrays**: Formatted tag pills (e.g. `['server', 'datacenter']`).
  - **Timestamps**: Localized date-time formatting with timezone offsets.

#### Creating, editing and dropping views

The **＋ Create view** button on the sidebar **Standard Views** header and **＋ Create materialized view** on **Materialized Views**, **🧱 Create view** beside the SQL editors, and **Save as View** in the Visual Query Designer open one dialog: name (validated, quoted), **Schema** picker, the `SELECT` query (editable), an optional column list, **Materialized view**, **Replace if it exists** (`CREATE OR REPLACE VIEW`), **IF NOT EXISTS**, **Drop and re-create** (needed when the columns change, because `CREATE OR REPLACE` cannot drop or rename columns; the dialog tells you so), **security_barrier**, **WITH DATA / WITH NO DATA** and a read-only **DDL preview**. A materialized view cannot use `OR REPLACE`; use *Drop and re-create* to change one. **Check query** runs the real DDL inside a transaction that is always rolled back and explains errors in plain words; errors stay inside the dialog. On success the tree refreshes, the new view opens, a toast appears and the audit log gets an entry. Right-click a view or materialized view for **✏️ Edit view definition…** or **Drop** (asks first). Only one `SELECT`/`WITH`/`VALUES`/`TABLE` statement is accepted, with dollar-quotes, comments and strings handled.

Every prompt and confirmation of the studio (delete record, drop column or index, enum values, restart sequence, GUC setting, save connection profile, designer query names …) now uses an in-page dialog: the browser's native `prompt()`/`confirm()` do nothing in the desktop window. Enter confirms, Esc closes only the dialog.

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
| **Sort** | **Sort A → Z / Z → A / Clear sort** in the header menu (the PostgreSQL grid has no header sort; the menu then shows no sort entries). |
| **Formatting** | *Datasheet layout* in the field list: **Row height** (compact / normal / spacious), **Font size**, **Alternate row color**. **Reset layout** returns widths, order, frozen columns and formatting to default and keeps hidden columns and display names. |

Not included: the per-column totals functions (Sum, Avg, Count, Min, Max) are not in this release (the **Totals** row keeps its existing behavior), filters work on the loaded page rather than on the whole table, *Save as SQL alias* is not offered, and a plain click on a header still sorts (selects the column) so Ctrl/Cmd+click and Shift+click select columns.

#### Focus mode: use the whole window for one section

Every major section has a **⤢ Focus** button in its header: the tab bar (acts on the current tab), the sidebar object tree, the SQL editor, the data grid toolbar, the Visual Query Designer ribbon, and the header of each other tab (schema, macros, plan, audit and so on). **Alt+Enter** (Option+Enter on a Mac) focuses the section under the cursor and leaves focus mode again; a double-click on a section's header toggles it too. In focus mode the application header, KPI strip, tab bar, sidebar and footer are hidden and the section fills the window. A slim bar stays at the top with the section name, an **Editor / Both / Results** switch (where a section has an editor and a result: the SQL editor, the data grid, the SQL Query Console tab, whose editor and results can each be focused alone) and an **✕ Exit focus** button that is always there.

Focus only hides the other regions: the grid's columns, widths, scroll position and selection and the editor's unsaved text are untouched, and grids, the designer canvas and diagrams re-fit to the larger area. Each tab remembers its own last focus state (also after a reload). It never uses the browser full-screen API (the window's own full-screen toggle is the separate **F11** / **Ctrl+Cmd+F**), and **Esc is not used**, because it belongs to open dialogs, menus and popovers. The shortcut appears in the **⌨ Shortcuts** list.

#### Showing and hiding columns

The Datasheet grid and the **SQL Query Console** results each have a **Columns** button in their toolbar. It shows how many columns are visible (`9 of 14` when some are hidden, the plain count when all are shown).

- **Pick columns**: click **Columns** (or focus it and press Enter / ↓). A popover lists every column with its type and **PK** / **FK** / **IDX** marks. Tick or untick a column to show or hide it at once. Tables with more than 8 columns get a filter box. **Show all**, **Hide all**, **Only keys** (primary key, foreign key and indexed columns) and **Reset to default** act on the whole list, or only on the matches while a filter is typed. One column always stays visible (the primary key, otherwise the first column).
- **Hide from the header**: each column header has a ▾ button; right-click the header (or press Shift+F10 / the Menu key on a focused header) for the same menu: **Hide column**, **Hide other columns**, **Show all columns**, **Choose columns…**.
- **Nothing is lost silently**: while columns are hidden a strip above the grid says `N hidden columns`, lists the first ones as chips (click a chip to bring that column back), and offers **Show all** and **Choose columns…**. It also warns when a quick filter uses a column you have hidden.
- **Remembered**: the choice is saved in this browser per database, schema and table (query results: per set of result columns) and comes back after a reload. **Reset to default** forgets it. Hidden columns only change what is drawn; filtering, inline editing, **Add / Edit row** and **Form View** (which always show every column) and keyboard use are unaffected.
- **Copy and export follow what you see**: the grid's **CSV / JSON** buttons, the **Export CSV / JSON / SQL** buttons, **Report**, and the console's **Markdown** and **Export CSV** use the visible columns only; the buttons' tooltips say so. Tick **Include hidden columns when copying or exporting** in the Columns popover to include every column. The Raw JSON Inspector always shows the raw result.
- **Keyboard**: Tab to **Columns**; in the popover ↑ / ↓ / Home / End move between columns, Space toggles, Tab stays inside, **Esc closes only the popover** and returns focus to the button.

### 2. ⚡ SQL Query IDE & 1-Click Database Backup
- **1-Click Database Backup & SQL Dump (`💾 DB Backup / Dump`)**:
  - High-performance SQL dump generator producing standard PostgreSQL recovery scripts.
  - 3 dump modes: **Complete (Schema DDL + Table Data)**, **Schema Only (DDL, Indexes, Keys, Sequences, Views)**, or **Data Only (INSERT Statements)**.
  - Table selection checklist to backup specific tables or the entire schema.
  - Live syntax-styled SQL preview with **`📋 Copy SQL`**, **`📥 Download .sql`**, and **`🚀 Open in SQL IDE`**.
- Syntax-highlighted query editor with keyboard shortcuts (**Cmd+Enter** or **Ctrl+Enter** to execute). In the **Visual Query Designer**, **Cmd/Ctrl+Enter** or **F5** runs the designer query (Design/Datasheet view) or the SQL as written (SQL view), also while the cursor is in one of its fields; the **! Run** button shows the shortcut and the page never reloads (the Run button used to ignore edits made in the SQL view). **Cmd/Ctrl+/** or **F1** (or the **⌨ Shortcuts** button in the header) lists every shortcut.
- 12 Curated PostgreSQL-specific SQL presets covering Materialized view refreshes, JSONB operators (`->>`, `@>`), array containment, CTEs, window functions, and `EXPLAIN (ANALYZE, BUFFERS)`.
- Tabular output with execution latency and row counts; export results to CSV and Markdown.

### 3. 📐 Visual Query Designer & Relational Canvas
- Relational canvas:
  - Add tables and views as movable cards with draggable headers.
  - Interactive column lists showing primary keys (🔑) and data types.
  - Automatic relationship discovery via foreign key introspection (`⚡ Auto-Joins`).
  - cardinality badges (`1` and `∞`) displayed on relationship endpoints.
  - Automatic clean grid alignment (`📐 Arrange`).
- **Deep Zoom & Room Expansion Controls**:
  - Zoom range from 40% to 250% (`🔍+`, `🔍−`, `1:1`, `Fit to View`).
  - Room presets: `Canvas Only`, `Split View`, and `Grid Only` with draggable horizontal resizer bar.
- **Join Properties Modal with Interactive Venn Diagrams**:
  - **Option 1**: INNER JOIN (Only matching rows)
  - **Option 2**: LEFT OUTER JOIN (ALL records from Left Table)
  - **Option 3**: RIGHT OUTER JOIN (ALL records from Right Table)
  - **Option 4**: **FULL OUTER JOIN (Postgres Native)** (ALL records from both tables)
  - Dynamic SVG Venn diagram preview with live SQL snippet generation.
- Lower QBE Matrix:
  - Configure Field, Table, Total (`GroupBy`, `Sum`, `Avg`, `Count`, `Min`, `Max`), Sort, Show, and Criteria.
- Switch between **📐 Design View**, **💻 SQL View**, and **📋 Datasheet View**.

### 4. 🏷️ PostgreSQL Custom Types & ENUMs Manager
- Dedicated workstation tab inspecting `pg_type` and `pg_enum`.
- Visual cards grid displaying each custom ENUM type, schema tag, allowed values badges, and cardinality.
- Inline **`➕ Add Value`** to append new enum labels dynamically (`ALTER TYPE ... ADD VALUE`).
- **`➕ Create ENUM Type`** modal dialog to define new enumeration types on the fly.
- Safe `Drop` button with confirmation.

### 5. 📦 Declarative Partition Trees Explorer
- Dedicated workstation tab inspecting `pg_partitioned_table`, `pg_inherits`, `pg_class`, and `pg_namespace`.
- Visualizes partition hierarchies with partition strategy badges (**RANGE**, **LIST**, **HASH**).
- Displays child partition names, partition bound expressions (e.g. `FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')`), relation storage size, and row count estimates.

### 6. 📡 Streaming Replication & WAL Diagnostics
- Dedicated workstation tab monitoring PostgreSQL high-availability infrastructure:
  - **Connected Streaming Standbys (`pg_stat_replication`)**: Standby PIDs, client addresses, application names, replication states, sync states, and write/flush/replay lag.
  - **Replication Slots (`pg_replication_slots`)**: Slot names, plugin drivers, slot types, active statuses, and WAL status.
  - **Write-Ahead Log Metrics (`pg_stat_wal`)**: Real-time diagnostic cards for total WAL records generated, full page images written, and WAL buffers full events.

### 7. 🧩 PostgreSQL Extensions Manager
- Complete catalog of all extensions supported by the PostgreSQL server (`pg_available_extensions`).
- Filter by All, Installed Only, or search by keyword (e.g. `uuid`, `trgm`, `vector`, `citext`).
- 1-Click `+ Install` (`CREATE EXTENSION IF NOT EXISTS`) and `✕ Remove` (`DROP EXTENSION`).

### 8. ⚡ Live Activity & Lock Contention Monitor
- Real-time dashboard powered by `pg_stat_activity` and `pg_locks`.
- **Lock Contention Detection**: Identifies blocked queries waiting on table or tuple locks, displaying blocked PID, blocking PID, lock mode, granted status, and exact query.
- 1-Click **`🛑 Cancel Query`** (`pg_cancel_backend`) and **`⚡ Kill Process`** (`pg_terminate_backend`) to clear deadlocks immediately.
- Visual indicators for backend states: `active` (emerald), `idle` (slate), `idle in transaction` (amber).

### 9. 🔍 Query Plan Visualizer (`EXPLAIN ANALYZE`)
- Runs `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` to display the query execution tree.
- Inspect Seq Scans, Index Scans, Hash Joins, Sort operations, actual execution costs, and buffer cache hits.

### 10. ⚙️ Engine Tuning & GUC Parameter Catalog
- Interactive configuration catalog powered by `pg_settings`.
- Categorized by subsystem: **Memory**, **Write-Ahead Log (WAL)**, **Query Tuning**, **Connections**, **Autovacuum**, and **Client Connection**.
- Displays parameter name, category, current value, unit, and short description with runtime tuning support.

### 11. 🚀 Performance & Telemetry Dashboard
- Live PostgreSQL cluster health diagnostics:
  - **Buffer Cache Hit Ratio Gauge**: Real-time ratio of in-memory buffer hits vs. disk block reads.
  - **Database Storage Footprint**: Human-readable disk size via `pg_size_pretty(pg_database_size())`.
  - **Table Bloat & Tuple Analysis**: Live statistics on dead tuples vs. live tuples, vacuum timestamps, and analyze timestamps.
  - **1-Click Maintenance**: Run global cluster `VACUUM ANALYZE` or per-table vacuum directly from the dashboard.

### 12. ⚡ Macro Designer
- **Visual Action Matrix**: Build ordered macros from the action catalog (`RunSQL`, `OpenQuery`, `InsertRecord`, `UpdateRecord`, `DeleteRecord`, `MakeTable`, `EmptyTable`, `RunMacro`, `SetVariable`, `VacuumDatabase`, `BackupDatabase`, ...), each with an optional `If` condition and per-step `On Err ⏭` flag.
- **Error Handling**: A macro stops at the first failing step. Set **On error: Continue** on the macro (or tick a single step) to keep going. A condition that cannot be evaluated fails the step instead of silently running it.
- **🧪 Dry Run & 🔒 Atomic**: Both run every step on one pinned connection inside `BEGIN ... COMMIT`. **Dry Run** always rolls back; **Atomic** commits only if every step succeeds. PostgreSQL DDL is transactional, so even `MakeTable` / `CREATE` / `DROP` steps are rolled back. `VACUUM` cannot run in a transaction and is refused in these modes.
- **`[Enter ...]` Prompts**: SQL such as `WHERE name = [Enter Customer Name]` asks for a value at run time. Values are escaped as string literals (numbers stay numeric), so quote-injection attempts are harmless.
- **Sub-Macros**: `RunMacro` runs another macro by name (with a recursion guard). **Validate** flags missing arguments, unbounded `UPDATE`/`DELETE`, and unknown sub-macros before running.
- **Export**: **SQL** produces a `BEGIN; ... COMMIT;` script with `"double-quoted"` identifiers; **VBA** produces a VBA `DoCmd` module; **JSON** round-trips through **Import**.
- **🧬 Code Generation (Python · Bun · V)**: translate a macro, a saved query, or the SQL in the editor into a standalone program that uses the **native SQLite driver** of your language, then **Copy to Clipboard** (or Download) for RAD work. Open it from **🧬 Code** in the SQL editor bar or Macro ribbon, or the 🧬 button on a saved query / macro in the sidebar.
  - **Python** → `sqlite3` (stdlib): parameterized queries, `with conn:` transaction, `argparse`, type hints.
  - **Bun** → `bun:sqlite`: prepared statements, `db.transaction()`, WAL + `foreign_keys`, `parseArgs`.
  - **V** → `db.sqlite`: `!` error propagation, `begin`/`commit`/`rollback`, `flag` module (V binds parameters as text, so numbers/NULLs are inlined and user text is bound).
  - The whole macro runs in **one transaction** (rolled back on error; `continueOnError` steps are caught). `VACUUM`/backup steps run after the commit. `[Enter ...]` prompts become `?` placeholders filled from command-line flags, `RunMacro` becomes a function call, and `[var]` conditions become native `if`s. UI-only actions (dialogs, navigation, reports) are skipped and listed as warnings.
  - Postgres SQL is translated to SQLite on a best-effort basis (`::casts`, `ILIKE`, `"public".` prefixes, `NOW() - INTERVAL 'n days'`, ...); anything with no SQLite equivalent (`JSONB`, `DISTINCT ON`, `to_jsonb`, ...) is reported in a ⚠️ review list instead of being silently changed.
- **AutoExec & Navigation Pane**: A macro flagged `AutoExec` runs when the page opens or the connection changes. Macros and saved queries are listed in the sidebar under `⚡ Macros` and `👁️ Saved Queries`.
- **Storage**: Macros and saved queries are kept as JSON in `~/.bun_rad_studio/macros` (override with `STUDIO_MACRO_STORE_DIR`), one file per `host:port/database/schema`. Nothing is created inside your database.

#### Macro API

| Method | Endpoint | Description | Body |
|---|---|---|---|
| `GET`/`POST` | `/api/macros/list` | List macros for the current connection | — |
| `POST` | `/api/macros/save` | Create or update a macro | `{ macro: MacroDefinition }` |
| `POST` | `/api/macros/delete` | Delete a macro by ID or name | `{ id?: string, name?: string }` |
| `POST` | `/api/macros/run` | Run a macro and return step telemetry | `{ macro?: MacroDefinition, id?: string, variables?, transaction?: boolean, dryRun?: boolean, params?: Record<string, any> }` |
| `POST` | `/api/macros/validate` | Pre-flight check | `{ macro: MacroDefinition }` |
| `POST` | `/api/macros/export` | Export as `json`, `sql`, or `vba` | `{ macro?: MacroDefinition, id?: string, format?: string }` |
| `POST` | `/api/codegen` | Translate a macro or SQL to native-SQLite code | `{ kind: "macro"\|"sql", target: "python"\|"bun"\|"vlang", macro?, id?, sql?, name? }` |
| `GET`/`POST` | `/api/queries/list` | List saved queries | — |
| `POST` | `/api/queries/save` | Save a query (incl. visual designer state) | `{ query: SavedQueryDefinition }` |
| `POST` | `/api/queries/delete` | Delete a saved query | `{ id?: string, name?: string }` |

---

## Import with staging

**📥 Import with staging** (button in the header) is the careful way to bring incoming records into a PostgreSQL database: the rows are copied into a **staging table** first, checked there, and only then **promoted** into your real table in one transaction — with an **Undo this import** button. It is a five-step wizard (*Source → Map → Load to staging → Check → Review & promote*) with plain-words messages and one main button per step.

- **Source:** drop or pick a CSV, TSV, semicolon/pipe-separated text, JSON list or JSON Lines file (or paste text). Encoding (UTF-8, UTF-16, Latin-1), separator, quotes and header row are detected and editable, with a live preview. Excel files are not read (use *Save As → CSV UTF-8*). Big files are streamed, never loaded whole (limits: 2 GB, 5,000,000 rows).
- **Map:** pick the target table (or **Create a new table from this data**); columns are matched by name and synonym, with suggested clean-ups (trim, empty → NULL, dates, numbers like `1.234,56`, yes/no) and your own checks. The mapping is remembered per table.
- **Load to staging:** the staging table is `stg_<table>_<yyyymmdd>_<hhmm>` in the same database and schema as the target, all columns `TEXT` plus `_stg_*` bookkeeping columns. Your table is not touched. Cancel rolls everything back.
- **Check:** types, sizes, required columns, repeats in the file, rows that already exist (new / same / changed), foreign keys, unique collisions, your own rules and the table's own CHECK rules. Fix a cell in place, skip rows, clean a whole column, download the rejects as CSV, check again.
- **Review & promote:** add new only, upsert, update only, add everything, or append; a dry run with exact counts, a before/after sample, the exact SQL and a test run that is rolled back; then one transaction. Sequences of `serial`/identity columns are moved past explicitly imported ids.

Full guide, naming convention, safety notes and limitations: [Import with staging](../databases/staging-import.md). The File Manager can open this wizard for a connection or for a data file ([File Manager: Databases](43_file_manager.md#databases-databases-tab)).

## 🏃 Launching Postgres Studio Pro

### Method 1: Desktop Application
```bash
# Launch the native desktop workstation
bun run app:postgres

# Shorthand alias
bun run app:pg
```

### Method 2: Master Launcher
```bash
# Open Launcher Studio Pro and select Postgres Studio Pro
bun run app:launcher
```

### Method 3: Headless / Web Workstation
```bash
# Run server mode on custom port (defaults to 54321)
PORT=54321 bun run applications/postgres_studio.ts --server
```

---

## 🌱 Seeding the Sample Database

To test and explore all PostgreSQL-specific features immediately:
1. Click **`🌱 Seed Sample DB`** in the top navigation bar. **Sample databases** opens: eleven production-style synthetic databases (Medicare Part D formulary builder, hospital, claims, banking ledger, e-commerce, SaaS billing, HR, warehouse, airline, issue tracker, IoT) with Small / Medium / Large data. Pick one, type the name of the **new schema** (default `sample_<id>`; existing schemas are never touched, a taken name is refused) and press **Create sample database**.
2. The sample uses UUID and JSONB columns, `text[]` arrays, identity columns, `COMMENT ON` documentation for every table and column, partial indexes, triggers and PL/pgSQL functions, and **materialized views**.
3. **Open it** switches the studio to the new schema. In the **Example queries** panel choose one query (or all), then **Put in the SQL editor** (this switches to the sample first so the table names resolve) or **Run it** to see the rows inside the dialog. Example queries only read data.

Details, the catalog and the safety rules: [Sample databases](../databases/sample-datasets.md). The older classic starter set (`customers`, `products`, `orders`, `sales_history`, `audit_logs`, `mv_daily_sales_analytics`) is still created by the `/api/seed-sample` endpoint.

---

## 🧪 Automated Testing Suite

Postgres Studio Pro is backed by automated test suites verifying server APIs, security sanitization, schema reflection, extensions management, datasheet features, and complete end-to-end CRUD operations:

```bash
# 1. Run Comprehensive End-to-End Enterprise Test Suite (26 tests)
bun test tests/postgres_studio_e2e.test.ts

# 2. Run Visual Joins & Relational Canvas Suite (9 tests)
bun test tests/studio_visual_joins.test.ts

# 3. Run the Macro Designer suite (15 tests, live database)
bun test tests/postgres_studio_macros.test.ts

# Run all 35 tests together (509 assertions)
bun test tests/studio_visual_joins.test.ts tests/postgres_studio_e2e.test.ts
```

All 35 automated tests pass with 100% success:
- [x] HTML compilation and all 11 workstation navigation tabs & panes
- [x] GUI CRUD layer (inline edits, row modals, table designer, import/export)
- [x] Visual Query Designer with deep zoom (40%-250%), room presets, cardinality badges (`1` and `∞`), and interactive Venn diagrams
- [x] Totals Row & Quick Filter Bar in Datasheet view
- [x] Publication Report Generator Modal & Print View
- [x] PostgreSQL 1-Click Database Backup & SQL Dump Generator (`All`, `Schema`, `Data`)
- [x] PostgreSQL Custom ENUM Types Management (`pg_type` & `pg_enum`)
- [x] Declarative Partition Trees Explorer (`pg_partitioned_table` & `pg_inherits`)
- [x] Streaming Replication & Write-Ahead Log Diagnostics (`pg_stat_replication`, `pg_stat_wal`)
- [x] Lock contention detection with 1-click PID termination
- [x] Engine Tuning GUC Parameter Catalog (`pg_settings`)
- [x] Schema namespace reflection, table lifecycles, and GIN/BTREE indexing
- [x] Performance telemetry (cache hit ratio, bloat, locks) and `VACUUM ANALYZE` maintenance
- [x] Macro Designer: stop-on-error, Dry Run / Atomic transactions, `[Enter ...]` prompts, sub-macros, SQL/VBA export

