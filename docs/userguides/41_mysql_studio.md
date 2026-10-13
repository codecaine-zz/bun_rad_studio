# 🐬 MySQL Studio Pro -- Complete Production User Guide

```
Version: 3.0.0 Enterprise  •  Engine: Native Bun SQL (MySQL / InnoDB Subsystem)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:mysql]  •  [Direct: bun run applications/mysql_studio.ts]
```

---

## 🌟 Executive Overview
**MySQL Studio Pro** is an enterprise-grade, high-performance MySQL workstation, visual relational query designer, schema architect, live diagnostic cockpit, and database backup manager engineered natively on Bun's built-in `SQL` subsystem.

It delivers sub-millisecond execution latency, pure macOS WebKit desktop integration, and native support for all modern MySQL features (including MySQL 8+ `caching_sha2_password` authentication, declarative range/list/hash partitioning, custom ENUM/SET types, binary logs, and InnoDB transaction lock tracking)—with **zero external software dependencies**, zero npm packages, and a robust dual-mode connection manager supporting both `.env` environment variables (`MSQL_*` / `MYSQL_*`) and on-the-fly manual credentials.

Following our commitment to **Microsoft Access workflow parity**, MySQL Studio Pro brings iconic desktop database workflows to MySQL:
- **🧮 Microsoft Access Totals Row**: Live pinned footer row calculating instant sums, averages, counts, min, and max across table records.
- **⚡ Access Quick Filter Bar**: Instant keystroke column filtering and cell right-click *"Filter by Selection"*.
- **🖨️ Access Publication Report Generator**: Publication-ready printable report preview modal with `@media print` print styling, `Print / Save PDF`, and `Export HTML`.
- **💾 1-Click Database Backup & SQL Dump**: Instant schema DDL and table data dump generator with copy, download, and SQL editor integration.
- **🏷️ Custom Types & ENUMs Manager**: Real-time reflection and alteration of MySQL `ENUM` and `SET` column definitions.
- **📦 Declarative Partition Trees Explorer**: Visual inspection of partitioned tables, bound expressions, and row estimates.
- **📡 Streaming Replication & Binary Log Diagnostics**: Live binary log status, coordinates, and replica thread telemetry.
- **⚡ Live Activity & Lock Contention Monitor**: Real-time processlist monitoring with 1-click `KILL <PID>` process termination.
- **📐 Visual Query Designer with Cardinality Badges**: Drag-and-drop relationship canvas with Access cardinality badges (`1` and `∞`) and interactive Venn diagram join properties.

---

## 🖼️ Verified Visual Interface Tour

| Microsoft Access Totals Row & Quick Filter Bar Active |
| :---: |
| ![MySQL Totals Row & Filter Bar](../../screenshots/apps/mysql_totals_filter_verified.png) |

| Access Publication Report Generator Modal | 1-Click Database Backup & SQL Dump Generator |
| :---: | :---: |
| ![Access Report Modal](../../screenshots/apps/mysql_access_report_modal_verified.png) | ![Database Backup & Dump Modal](../../screenshots/apps/mysql_backup_dump_modal_verified.png) |

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
-- Replace '@Delphi32@' with your desired password
ALTER USER 'root'@'localhost' IDENTIFIED BY '@Delphi32@';
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
MSQL_PASSWORD=@Delphi32@
MSQL_NAME=my_app_dev
MSQL_TLS=false

# Full Connection URL (Alternative):
# MSQL_URL=mysql://root:@Delphi32@@localhost:3306/my_app_dev

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

### 1. 📊 Tabular Data Grid & Access-Style GUI CRUD Layer
- **Microsoft Access Workflow Parity**:
  - **Pinned Totals Row (`[ 🧮 Totals ]`)**: Pinned footer row calculating live aggregations across visible table records (`Total: N`, `Count: N`, and numeric aggregations `Σ sum`, `x̄ avg`, `min`, `max`).
  - **Inline Quick Filter Bar (`[ ⚡ Filter Bar ]`)**: Persistent inline filter inputs positioned directly under each column header for instant keystroke filtering, plus cell right-click **"Filter by Selection"** shortcut.
  - **Publication Report Generator (`🖨️ Report`)**: Opens a publication-ready printable report preview modal with report header, formatted table, summary counts, `@media print` print styles, **`🖨️ Print / Save PDF`**, and **`📥 Export HTML`**.
  - **Access Form View & Table Designer**: Switch between Datasheet View and single-record Form View with record stepper/navigator, or open the interactive Table Design View supporting live `ALTER TABLE` operations.
- **Access-Style CRUD Operations**:
  - `+ Add Record`: Visual dialog with input fields auto-configured for MySQL types (`INT`, `VARCHAR`, `DECIMAL`, `DATETIME`, `ENUM`).
  - `✎ Edit Row` & **Inline Double-Click Cell Editing**: Direct in-place editing on any cell with automatic type casting.
  - `⧉ Duplicate Row`: Clones selected record for rapid prototyping and mock data population.
  - `🗑 Delete Row`: Safe deletion with confirmation prompt and primary key resolution.
  - `📐 Design Table`: Access-style Table Designer modal to add/remove columns, change types, toggle PK and NOT NULL.
  - `⚡ Indexes Manager`: View all table indexes with 1-click index creation supporting **BTREE, FULLTEXT, and SPATIAL** algorithms.
  - `📥 Import Wizard`: Import rows from CSV or JSON format with preview and batch insertion.
  - `📤 Export Wizard`: Export table data or query results to CSV, JSON, or SQL INSERT scripts.

### 2. ⚡ SQL Query IDE & 1-Click Database Backup
- **1-Click Database Backup & SQL Dump (`💾 DB Backup / Dump`)**:
  - High-performance SQL dump generator producing standard MySQL recovery scripts.
  - 3 dump modes: **Complete (Schema DDL + Table Data)**, **Schema Only (DDL, Indexes, Keys, Views)**, or **Data Only (INSERT Statements)**.
  - Table selection checklist to backup specific tables or the entire database.
  - Live syntax-styled SQL preview with **`📋 Copy SQL`**, **`📥 Download .sql`**, and **`🚀 Open in SQL IDE`**.
- Syntax-highlighted query editor with keyboard shortcuts (**Cmd+Enter** or **Ctrl+Enter** to execute).
- 11 Curated MySQL-specific SQL presets covering Multi-table joins, Customer lifetime spend, Sales by category, Inventory alerts, and Audit trails.
- Tabular output with execution latency and row counts; export results to CSV, JSON, and SQL.

### 3. 📐 Visual Query Designer & Microsoft Access Relational Canvas
- **Microsoft Access Relational Canvas**:
  - Add tables and views as movable cards with draggable headers.
  - Interactive column lists showing primary keys (🔑) and data types.
  - Automatic relationship discovery via foreign key introspection (`⚡ Auto-Detect Joins`).
  - **Access Cardinality Badges (`1` and `∞`)** displayed on relationship endpoints.
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

---

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
  3. `✓ 3. HTML bundles the Access-style GUI CRUD layer (inline edits, modals, table designer)`
  4. `✓ 4. GET /api/schema returns tables, columns, indexes, and exact row counts`
  5. `✓ 5. POST /api/table/data returns paginated rows with column data`
  6. `✓ 6. Complete Table Lifecycle: Create, Insert, Update, Import Batch, Truncate, Drop`
  7. `✓ 7. Microsoft Access Totals Row & Quick Filter Bar in Datasheet`
  8. `✓ 8. Microsoft Access Publication Report Generator Modal & Print View`
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
