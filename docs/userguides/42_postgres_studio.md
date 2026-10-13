# 🐘 Postgres Studio Pro -- Complete Production User Guide

```
Version: 1.0.0  •  Engine: Native Bun SQL (PostgreSQL Subsystem)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:postgres]  •  [Alias: bun run app:pg]  •  [Direct: bun run applications/postgres_studio.ts]
```

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
| **Relational Joins** | Native `FULL OUTER JOIN`, `LATERAL JOIN`, recursive CTEs. | Emulates `FULL OUTER JOIN` via `UNION` of `LEFT` and `RIGHT` joins. | **Visual Query Designer**: Access-style relational canvas with Venn diagrams featuring native `FULL OUTER JOIN` option. |
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
PG_PASSWORD=@Delphi32@
PG_DATABASE=mydb
PG_SCHEMA=public
PG_TLS=false

# Full Connection URL (Alternative):
# PG_URL=postgresql://root:@Delphi32@@localhost:5432/mydb?schema=public&sslmode=prefer

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

### 1. 📊 Tabular Data Grid & Access-Style GUI CRUD Layer
- **Microsoft Access Workflow Parity**:
  - **Pinned Totals Row (`[ 🧮 Totals ]`)**: Pinned footer row calculating live aggregations across all visible records (`Total: N`, `Count: N`, and numeric aggregations `Σ sum`, `x̄ avg`, `min`, `max`).
  - **Inline Quick Filter Bar (`[ ⚡ Filter Bar ]`)**: Persistent inline filter inputs positioned directly under each column header for instant keystroke filtering, plus cell right-click **"Filter by Selection"** shortcut.
  - **Publication Report Generator (`🖨️ Report`)**: Opens a publication-ready printable report preview modal with report header, formatted table, summary counts, `@media print` print styles, **`🖨️ Print / Save PDF`**, and **`📥 Export HTML`**.
  - **Access Form View & Design View**: Switch between Datasheet View and single-record Form View with record stepper/navigator, or open the interactive Table Design View supporting live `ALTER TABLE ADD/DROP COLUMN`, data type modifications, and index toggles.
- **Access-Style CRUD Operations**:
  - `+ Add Record`: Visual dialog with input fields auto-configured for PostgreSQL types (UUID generation, JSONB validator, array tags).
  - `✎ Edit Row` & **Inline Double-Click Cell Editing**: Direct in-place editing on any cell with automatic type casting.
  - `⧉ Duplicate Row`: Clones selected record for rapid prototyping and mock data population.
  - `🗑 Delete Row`: Safe deletion with confirmation prompt and primary key resolution.
  - `📐 Design Table`: Access-style Table Designer modal to add/remove columns, change types (`VARCHAR`, `UUID`, `JSONB`, `NUMERIC`, etc.), toggle PK and NOT NULL.
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

### 2. ⚡ SQL Query IDE & 1-Click Database Backup
- **1-Click Database Backup & SQL Dump (`💾 DB Backup / Dump`)**:
  - High-performance SQL dump generator producing standard PostgreSQL recovery scripts.
  - 3 dump modes: **Complete (Schema DDL + Table Data)**, **Schema Only (DDL, Indexes, Keys, Sequences, Views)**, or **Data Only (INSERT Statements)**.
  - Table selection checklist to backup specific tables or the entire schema.
  - Live syntax-styled SQL preview with **`📋 Copy SQL`**, **`📥 Download .sql`**, and **`🚀 Open in SQL IDE`**.
- Syntax-highlighted query editor with keyboard shortcuts (**Cmd+Enter** or **Ctrl+Enter** to execute).
- 12 Curated PostgreSQL-specific SQL presets covering Materialized view refreshes, JSONB operators (`->>`, `@>`), array containment, CTEs, window functions, and `EXPLAIN (ANALYZE, BUFFERS)`.
- Tabular output with execution latency and row counts; export results to CSV and Markdown.

### 3. 📐 Visual Query Designer & Access Relational Canvas
- Microsoft Access-style relational canvas:
  - Add tables and views as movable cards with draggable headers.
  - Interactive column lists showing primary keys (🔑) and data types.
  - Automatic relationship discovery via foreign key introspection (`⚡ Auto-Joins`).
  - Access cardinality badges (`1` and `∞`) displayed on relationship endpoints.
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

### 12. ⚡ Macro Designer (Microsoft Access-Style Macros)
- **Visual Action Matrix**: Build ordered macros from the action catalog (`RunSQL`, `OpenQuery`, `InsertRecord`, `UpdateRecord`, `DeleteRecord`, `MakeTable`, `EmptyTable`, `RunMacro`, `SetVariable`, `VacuumDatabase`, `BackupDatabase`, ...), each with an optional `If` condition and per-step `On Err ⏭` flag.
- **Error Handling**: A macro stops at the first failing step. Set **On error: Continue** on the macro (or tick a single step) to keep going. A condition that cannot be evaluated fails the step instead of silently running it.
- **🧪 Dry Run & 🔒 Atomic**: Both run every step on one pinned connection inside `BEGIN ... COMMIT`. **Dry Run** always rolls back; **Atomic** commits only if every step succeeds. PostgreSQL DDL is transactional, so even `MakeTable` / `CREATE` / `DROP` steps are rolled back. `VACUUM` cannot run in a transaction and is refused in these modes.
- **`[Enter ...]` Prompts**: SQL such as `WHERE name = [Enter Customer Name]` asks for a value at run time. Values are escaped as string literals (numbers stay numeric), so quote-injection attempts are harmless.
- **Sub-Macros**: `RunMacro` runs another macro by name (with a recursion guard). **Validate** flags missing arguments, unbounded `UPDATE`/`DELETE`, and unknown sub-macros before running.
- **Export**: **SQL** produces a `BEGIN; ... COMMIT;` script with `"double-quoted"` identifiers; **VBA** produces an Access `DoCmd` module; **JSON** round-trips through **Import**.
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
| `GET`/`POST` | `/api/queries/list` | List saved queries | — |
| `POST` | `/api/queries/save` | Save a query (incl. visual designer state) | `{ query: SavedQueryDefinition }` |
| `POST` | `/api/queries/delete` | Delete a saved query | `{ id?: string, name?: string }` |

---

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
1. Click **`🌱 Seed Sample DB`** in the top navigation bar.
2. The workstation creates a rich enterprise schema including:
   - `customers` (with UUID primary keys and JSONB preferences)
   - `products` (with UUIDs, JSONB hardware specs, and native `text[]` tag arrays)
   - `orders` and `order_items` (with foreign keys and decimal calculations)
   - `sales_history` (declarative range partitioned table with partitions `sales_2024`, `sales_2025`, `sales_2026`)
   - `audit_logs` (with JSONB event payloads and `TIMESTAMPTZ`)
   - `v_customer_order_summary` (multi-table view)
   - `mv_daily_sales_analytics` (**Materialized View** with 1-click refresh support)

---

## 🧪 Automated Testing Suite

Postgres Studio Pro is backed by automated test suites verifying server APIs, security sanitization, schema reflection, extensions management, Access-style features, and complete end-to-end CRUD operations:

```bash
# 1. Run Comprehensive End-to-End Enterprise Test Suite (26 tests)
bun test tests/postgres_studio_e2e.test.ts

# 2. Run Microsoft Access Visual Joins & Relational Canvas Suite (9 tests)
bun test tests/access_visual_joins.test.ts

# 3. Run the Macro Designer suite (15 tests, live database)
bun test tests/postgres_studio_macros.test.ts

# Run all 35 tests together (509 assertions)
bun test tests/access_visual_joins.test.ts tests/postgres_studio_e2e.test.ts
```

All 35 automated tests pass with 100% success:
- [x] HTML compilation and all 11 workstation navigation tabs & panes
- [x] Access-style GUI CRUD layer (inline edits, row modals, table designer, import/export)
- [x] Visual Query Designer with deep zoom (40%-250%), room presets, cardinality badges (`1` and `∞`), and interactive Venn diagrams
- [x] Microsoft Access Totals Row & Quick Filter Bar in Datasheet view
- [x] Microsoft Access Publication Report Generator Modal & Print View
- [x] PostgreSQL 1-Click Database Backup & SQL Dump Generator (`All`, `Schema`, `Data`)
- [x] PostgreSQL Custom ENUM Types Management (`pg_type` & `pg_enum`)
- [x] Declarative Partition Trees Explorer (`pg_partitioned_table` & `pg_inherits`)
- [x] Streaming Replication & Write-Ahead Log Diagnostics (`pg_stat_replication`, `pg_stat_wal`)
- [x] Lock contention detection with 1-click PID termination
- [x] Engine Tuning GUC Parameter Catalog (`pg_settings`)
- [x] Schema namespace reflection, table lifecycles, and GIN/BTREE indexing
- [x] Performance telemetry (cache hit ratio, bloat, locks) and `VACUUM ANALYZE` maintenance
- [x] Macro Designer: stop-on-error, Dry Run / Atomic transactions, `[Enter ...]` prompts, sub-macros, SQL/VBA export

