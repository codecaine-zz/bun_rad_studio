# Complete guide to databases in the File Manager

Codecaine File Manager and Bun RAD Studio include a complete, local-first database suite for four engines: **SQLite**, **MySQL / MariaDB**, **PostgreSQL**, and **Redis**. From one tab in the File Manager you can manage connections, keep passwords in your operating system's keychain, detect `.env` and environment settings, generate realistic synthetic sample databases, validate incoming files in a staging table before promoting them, open each engine's full Studio inside the File Manager window, and **clone entire databases, selected tables, views, indexes, foreign keys, or Redis key groups seamlessly across any engine**.

Verified on macOS (Bun 1.3.12, 17 October 2026) by automated test suites (`tests/file_manager_db_page.test.ts`, `tests/file_manager_db_profiles.test.ts`, `tests/file_manager_db_sample.test.ts`, `tests/file_manager_db_import_page.test.ts`, `tests/file_manager_db_clone.test.ts`).

## Contents

- [The four database engines at a glance](#the-four-database-engines-at-a-glance)
- [Opening the Databases tool](#opening-the-databases-tool)
- [Working with SQLite files in the file list](#working-with-sqlite-files-in-the-file-list)
- [Adding and importing connections](#adding-and-importing-connections)
- [How settings and passwords are kept safe](#how-settings-and-passwords-are-kept-safe)
- [Creating a new SQLite or sample database](#creating-a-new-sqlite-or-sample-database)
- [Bun JavaScript & Visual Macro Studio](#bun-javascript--visual-macro-studio)
- [Using the built-in studios](#using-the-built-in-studios)
- [Cloning databases, tables, views and Redis keys across engines](#cloning-databases-tables-views-and-redis-keys-across-engines)
- [Cross-engine type translation reference](#cross-engine-type-translation-reference)
- [Universal 15-format data import & staging](#universal-15-format-data-import--staging)
- [Troubleshooting](#troubleshooting)
- [See also](#see-also)

## The four database engines at a glance

| Feature | SQLite | MySQL / MariaDB | PostgreSQL | Redis |
|---|---|---|---|---|
| **How data is stored** | One file on disk (`.sqlite`, `.db`) | Database server on a port (default `3306`) | Database server on a port (default `5432`) | In-memory key–value server on a port (default `6379`) |
| **Needs a server running?** | No — built into Bun (`bun:sqlite`) | Yes | Yes | Yes |
| **Logins & passwords** | None (file permissions) | User name, password in OS keychain, optional TLS | User name, password in OS keychain, schema, optional TLS | Optional user name and password in OS keychain, database number `0–15`, optional TLS |
| **Main building blocks** | Tables, views, indexes, foreign keys, triggers, FTS5 search | Tables, views, indexes, foreign keys, partitions, routines | Schemas, tables, views, materialized views, sequences, indexes, foreign keys | Keys (`string`, `hash`, `list`, `set`, `zset`, `stream`) with optional TTL |
| **Built-in studio** | SQLite Studio | MySQL Studio | PostgreSQL Studio | Redis Studio |
| **Supports cross-engine cloning?** | **Yes** (source & target, or a brand-new `.sqlite` file) | **Yes** (source & target) | **Yes** (source & target) | **Yes** (source & target; maps between Redis key groups and SQL tables) |
| **Supports Bun JS & Visual Macros?** | **Yes** (`CurrentDb`, `DoCmd`, `OpenRecordset`, `db.transaction`) | **Yes** | **Yes** | **Yes** (`connections.use()` & Redis commands) |

## Opening the Databases tool

You can reach the **Databases** tool in four ways:

1. Click **🗄️ Databases** in the top toolbar (next to **Find & more**).
2. Click **Find & more** (`Alt+3` or `Ctrl/⌘+Shift+F`) and choose the **🗄️ Databases** tab.
3. On the **Home** view (`Alt+2`), click the **Databases** tile, or click a saved connection's shortcut tile under **Databases** to launch its studio straight away.
4. Select any `.sqlite` file, `.env` file, or any of the 15 supported data files (`.csv`, `.tsv`, `.json`, `.ndjson`, `.xlsx`, `.ods`, `.yaml`, `.toml`, `.xml`, `.sql`, `.md`, `.html`, `.ini`, `.plist`) in the file list and right-click it for context-specific database actions.

## Working with SQLite files in the file list

The File Manager checks the first 16 bytes of local files (`SQLite format 3\0`), so it recognizes a real SQLite database even if its file extension is `.db`, `.sqlite3`, `.dat`, or something custom — and it is never fooled by a plain text file that happens to be named `.db`.

### Create a brand-new SQLite database

- **In the file list:** right-click empty space in any folder and click **New SQLite database**, or click **🪶 New SQLite** in the toolbar.
- **In the Databases tab:** click **🪶 New SQLite database…** in the toolbar. Choose a folder, a file name, and one of four starter templates:
  - **Empty database** — valid SQLite header in WAL mode with no tables.
  - **Starter tables (`users` + `items`)** — ready-made `users` and `items` tables with sample rows.
  - **Key–value store (`kv_store`)** — a `kv_store` table (`k`, `v`, `updated_at`) for application settings or cache entries.
  - **Notes table (`notes`)** — a `notes` table (`id`, `title`, `body`, `tags`, `created_at`) with sample welcome note.

### Right-click a SQLite file

Right-clicking any recognized SQLite file in the file list offers:

- **Open in SQLite Studio** — starts SQLite Studio for that file right inside the File Manager's Databases tab.
- **Open in SQLite Studio in its own window** — opens the dedicated desktop window for that file.
- **Open in SQLite Studio in my browser** — starts the local server and opens it in your default browser.
- **Add as database connection** — saves the file in the Databases connection list so it is always one click away.
- **🧬 Clone database / tables…** — opens the cross-engine clone wizard with this SQLite file pre-selected as the source, so you can clone its tables into MySQL, PostgreSQL, Redis, or another SQLite file.
- **Clone into a new SQLite file…** — opens the clone wizard ready to copy all or selected tables from this file into a brand-new `.sqlite` file in the same folder.
- **⚡ Run Bun JS macro on database…** — opens the **Bun JS & Visual Macro Studio** with this SQLite file pre-selected as the target database.

## Adding and importing connections

At the top of the **Databases** tab, the toolbar provides four ways to add a connection:

1. **＋ Add connection…**
   - Pick the engine (**SQLite**, **MySQL / MariaDB**, **PostgreSQL**, or **Redis**).
   - Give the connection a **Name**, an optional **Folder** (for grouping in the sidebar) and **Tags**, and choose its **Environment**: **Development**, **Test**, **Staging**, or **⚠ Production**.
   - Tick **Favorite** to pin it to the top of the list and show it on the Home page.
   - For **SQLite**, enter the file path (or click **Use the folder I'm browsing**) and pick **Read & write**, **Create the file if it isn't there**, **Read-only**, or **In memory**.
   - For **MySQL / MariaDB** and **PostgreSQL**, fill in **Host**, **Port**, **User**, **Password** (saved only to your OS keychain), **Database**, **Schema** (PostgreSQL), and **TLS / SSL** options.
   - For **Redis**, fill in **Host**, **Port**, **Database number (0–15)**, optional **Key prefix**, **User**, **Password**, and **TLS**.
2. **Paste address…**
   - Paste a standard connection URL (`mysql://user:your-password@localhost:3306/shop`, `postgres://user:your-password@localhost:5432/app`, `redis://localhost:6379/0`, or `sqlite:/path/to/file.sqlite`).
   - Click **Fill in the form** to inspect every parsed field before saving. If a password was in the pasted URL, it is moved into the keychain password box and removed from the visible address.
3. **Import from environment…** and **Found in your environment**
   - When the Databases tab opens, it inspects environment variables (`MSQL_*`, `MYSQL_*`, `MARIADB_*`, `DB_*`, `PG*`, `POSTGRES_*`, `REDIS_*`, `SQLITE_*`, `DATABASE_URL`) and `.env` files in the app's startup folder.
   - If a local Redis server is running on `127.0.0.1:6379` with no password required, the File Manager detects it with a single `PING` and saves **Local server (127.0.0.1:6379)** automatically.
   - Click **Save to the manager** on any discovered card to store it permanently (and move any password into the OS keychain).
4. **Import .env file…** (or right-click any `.env` file in the file list → **Import database settings…**)
   - Reads the file safely (without executing shell expressions or following symlinks), previews the connections found inside, and lets you save them with one click.

## How settings and passwords are kept safe

### OS keychain storage

Passwords are stored in your computer's native credential store (**macOS Keychain**, **Windows Credential Manager**, or **libsecret** on Linux) under the service `com.User.bun-rad-studio.db`. They are never written to `file_manager_databases.json`, never returned to the browser after saving, and automatically scrubbed from error messages and studio logs.

### Which setting wins (Effective settings)

Select any connection in the list and scroll to **Effective settings**. Every field shows its active value and the exact source it came from, in priority order:

1. **This connection** — values explicitly saved on the connection (and its password in the keychain).
2. **Your defaults for this engine** — optional engine-wide defaults configured via **Defaults…**.
3. **Environment variables** — variables and `.env` files loaded when the app started (only when **Use environment variables for this engine** is enabled, and never for passwords when a connection specifies its own host).
4. **Studio default** — the fallback built into the studio (`localhost:3306` for MySQL, `localhost:5432` for PostgreSQL, `127.0.0.1:6379` for Redis).

When the File Manager starts a studio for a saved connection, it builds a **clean, isolated environment**: all database environment variables (`MYSQL_*`, `PG*`, `REDIS_*`, `DATABASE_URL`, etc.) are stripped first, only the chosen connection's settings are injected, and the child process runs with `--no-env-file` so no stale `.env` file can override your choice.

### Testing a connection

Click **Test connection** in a connection's detail panel. The File Manager connects in read-only mode with a 10-second timeout and reports in plain language:

- Whether the server answered, the engine version (`SQLite 3.x`, `MySQL 8.x/9.x`, `PostgreSQL 16/18`, `Redis 7/8`), and the response time in milliseconds.
- For SQLite, MySQL, and PostgreSQL: how many tables and views are in the database.
- For Redis: the database number and how many keys (`DBSIZE`) are present.

## Creating a new SQLite or sample database

Click **🌱 New sample database…** in the Databases toolbar to create a self-contained SQLite database populated with realistic, deterministic **synthetic data** (and automatically add it to your connection list). You can also click **🌱 Seed Sample DB** inside SQLite Studio, MySQL Studio, or PostgreSQL Studio to load the same samples into any engine:

- **Medicare Part D Formulary Builder** (41 tables, 9 views, 11 example queries)
- **Hospital EHR** (22 tables, 7 views, 9 example queries)
- **Health Insurance Claims Adjudication** (18 tables, 6 views, 8 example queries)
- **E-commerce Marketplace** (19 tables, 7 views, 9 example queries)
- **Retail Banking and Double-Entry Ledger** (15 tables, 7 views, 9 example queries)
- **HR and Payroll** (17 tables, 6 views, 8 example queries)
- **Warehouse, Inventory and Supply Chain** (19 tables, 6 views, 8 example queries)
- **Airline Reservations** (18 tables, 6 views, 8 example queries)
- **Project Management and Issue Tracker** (13 tables, 6 views, 9 example queries)
- **IoT Telemetry** (14 tables, 6 views, 7 example queries)
- **SaaS Subscription Billing** (19 tables, 8 views, 8 example queries)

Pick **Small** (a few thousand rows, created in about a second), **Medium** (~30,000–55,000 rows), or **Large** (~150,000–410,000 rows). Full details are in [Sample databases](sample-datasets.md).

## Bun JavaScript & Visual Macro Studio

Click **⚡ Macros (Bun JS)…** in the Databases toolbar, click **Macros…** on any saved connection, or right-click a `.sqlite` file in the file list and choose **Run Bun JS macro on database…** to open the **Bun JavaScript & Visual Macro Studio**.

It brings Microsoft Access-style VBA & Macro automation to modern Bun JavaScript across **SQLite**, **MySQL / MariaDB**, **PostgreSQL**, and **Redis**:

- **Dual-Mode Authoring (`🥟 Bun JS Code (VBA Style)` & `⚡ Visual Actions (DoCmd)`):**
  - Write async Bun JavaScript using familiar Access-inspired objects (`CurrentDb`, `DoCmd`, `TempVars`, `OpenRecordset`, `DCount`, `DLookup`, `DSum`, `DAvg`, `DMin`, `DMax`, `MsgBox`, `db.query`, `db.execute`, `db.transaction`, and `connections.use()`), or build declarative visual action pipelines (`SetTempVar`, `RunSQL`, `AssertCount`, `Log`, `ExportData`, `RunCode`) and click **⇄ Convert Actions to Bun JS** at any time.
- **5 Built-in Starter Macros:**
  1. **Table Row Counter (Bun JS)** — lists every table in the target database and prints live row counts using `CurrentDb.tables()` and `DCount("*", table)`.
  2. **Customer Order Audit (Access VBA style)** — iterates rows with `CurrentDb.OpenRecordset()`, computes aggregates via `DCount`, `DLookup`, and `DSum`, stores state in `TempVars`, and displays an interactive summary table.
  3. **Loyalty Tier Promotion (Transactional)** — runs a batch `UPDATE` inside `await db.transaction(async (tx) => { ... })` so any error rolls back cleanly.
  4. **Quick VIP Report (Visual DoCmd + RunCode)** — combines declarative visual actions with an embedded `RunCode` Bun JS step.
  5. **Redis Key Inspector & Cache Macro** — inspects Redis key groups and runs `PING` / `DBSIZE` commands, or switches across saved profiles via `await connections.use(profileId)`.
- **Target Any Engine or Scratch In-Memory DB:**
  - Run against **🧪 Scratch SQLite (In-Memory Demo DB)** (pre-seeded with `customers`, `orders`, and `audit_logs`), any saved SQLite, MySQL, PostgreSQL, or Redis connection, or any `.sqlite` file on disk.
- **Dry Run, Syntax Check & Multi-Language Export:**
  - Click **✓ Check Syntax** to validate your Bun JS code without connecting, **🧪 Dry Run (Rollback)** to execute inside a transaction that automatically rolls back at the end so you can inspect logs and output tables safely, or export any macro to **🥟 Export .ts** (standalone Bun script), **🧾 Export VBA** (Access VBA module), or **📄 Export .sql**.

## Using the built-in studios

Select a connection and choose how to open its studio:

- **Open in … Studio** — starts the studio server on a private local port (`127.0.0.1`) and embeds it right below the connection details. Click **⛶ Expand** in the studio bar (or **⛶ Focus**, `Alt+6`) to give the studio the entire window, and use the **Open studios** strip at the top to switch between running SQLite, PostgreSQL, MySQL, and Redis studios with one click.
- **Open in a window** — opens the studio as a standalone native desktop window.
- **Open in my browser** — opens the studio in your system web browser.

While a studio runs in the tab, a control bar above it shows **● Running**, **Stop**, **Restart** (re-reads your connection settings), **Open in a separate window**, **Open in my browser**, and a collapsible **Log** panel with secrets redacted.

> **Warning – Production and read-only connections.** The embedded studios have full editing and DDL tools. When you open a studio for a connection marked **Production** or **Read-only**, the File Manager asks for confirmation first and keeps a warning banner visible above the studio. For hard read-only enforcement, use **Test connection**, the studio's **🔒 Read-Only Guard**, the [Database Workbench](workbench.md), or a database user role that has `SELECT`-only privileges.

### What each studio provides

- **SQLite Studio, MySQL Studio, and PostgreSQL Studio:**
  - **Data Grid Pro:**
    - Browse tables and views, click column headers to sort, or **Shift+Click** multiple headers for multi-column sorting (`1▲`, `2▼`).
    - Toggle the **⚡ Filter Bar** for server-backed per-column operators (`=`, `!=`, `>=`, `<=`, `> `, `<`, `null`, `!null`, or substring match).
    - Click **↗** on any **Foreign Key cell** (for example `customer_id` in `orders`) to jump straight to the referenced parent row in `customers`.
    - Open the collapsible **🔍 Inspector** side drawer to inspect every field of the selected row, pretty-print nested JSON or BLOBs, copy values, and follow foreign-key links.
    - Add, edit, duplicate, or delete rows in a guided modal, toggle **🧮 Totals** (`SUM`, `AVG`, `MIN`, `MAX`), choose visible columns, generate printable HTML **🖨️ Reports**, export to CSV/JSON/Markdown/SQL, or click **💾 DB Backup / Dump** for a full `.sql` schema + data dump.
  - **SQL Editor IDE & Explain Plan:**
    - **Multi-Tab SQL Worksheets:** create, rename, and persist multiple worksheet tabs (`Query 1`, `Query 2`, `+`), and highlight any SQL snippet in the editor to **▶ Run Selection** only.
    - **✨ Format SQL & Schema Autocomplete:** format multi-statement SQL with one click (`Ctrl/⌘+Shift+F`) and get live table.column completions as you type (`customers.` or `Ctrl+Space`).
    - **🕒 Query History Drawer:** searchable history of executed SQL queries with execution latency, row counts, and one-click **Load** or **▶ Run**.
    - **Transaction & Read-Only Guard Bar:** interactive `BEGIN`, `COMMIT`, and `ROLLBACK` buttons with a live `TX ACTIVE` indicator, plus a **🔒 Read-Only: ON/OFF** toggle that blocks destructive `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, and `ALTER` statements.
    - **Explain Plan & Create View:** inspect visual `EXPLAIN` / `EXPLAIN QUERY PLAN` execution trees and save any `SELECT` query as a reusable database view (`🧱 Create view`).
  - **Visual Query Designer (QBE):** add tables to the visual canvas, auto-detect foreign-key joins, pick aggregates, sorting, and filter criteria, and run or inspect the generated SQL.
  - **Schema Designer, Full ER Diagram & Schema Diff:**
    - **📋 Table Designer:** create and alter tables, columns, primary keys, foreign keys, and indexes visually with a live DDL preview.
    - **🗺️ Full ER Diagram:** interactive SVG entity-relationship diagram of every table, column, primary key (`🔑`), and foreign-key connector line in the database, with zoom controls and `.svg` export.
    - **🔀 Schema Diff & Migration:** click **📸 Capture Baseline Snapshot**, modify your schema, and click **⚡ Compare Current vs Baseline** to generate ready-to-run `ALTER TABLE` / `CREATE TABLE` migration DDL.
  - **In-Studio Macro Designer & Multi-Language Codegen:**
    - Build multi-step macros combining `RunSQL`, `ExportData`, `AssertCount`, `MsgBox`, and `RunCode` (Bun JS), export macros to **🥟 Bun JS**, **🧾 VBA**, or **📜 SQL**, and click **🧬 Code** to generate complete database scripts in **Python**, **Bun (`bun:sqlite` / `mysql2` / `pg`)**, **Bun (`bun:sql`)**, **TypeScript**, and **V (vlang)**.
  - **Unified Workbench v2 (`/workbench`):** inline spreadsheet cell editing with staged change tracking, diff review drawer, partial-failure recovery, and transaction controls.
  - **Engine Diagnostics:** WAL/PRAGMA performance profiles (`Performance`, `Balanced`, `Safety`) and Integrity Check in SQLite; Live Activity, InnoDB Locks, Partition Trees, and Binary Logs in MySQL; Schemas, Sequences, Extensions, and Vacuum/Analyze in PostgreSQL.
- **Redis Studio:**
  - **Key Browser:** filter by pattern or type (`string`, `hash`, `list`, `set`, `zset`, `stream`), inspect and edit Hash fields, List items, Set members, or ZSet scores in place, set or clear TTL expirations, and add or delete keys.
  - **Universal 15-Format Import (`⬆ Import`):** import records from CSV, TSV, JSON, NDJSON, Excel (`.xlsx`), ODS, YAML, TOML, XML, SQL `INSERT`, Markdown tables, HTML tables, INI, `.env`, or Apple `.plist` directly into Redis Hashes (`<prefix>:<id>`) or JSON strings.
  - **CLI & Diagnostics:** interactive Redis CLI console, Slowlog inspector, Memory analyzer, Pub/Sub monitor, and live Server telemetry.

## Cloning databases, tables, views and Redis keys across engines

The **🧬 Clone database / tables…** wizard lets you copy an entire database — or any combination of tables, views, indexes, foreign keys, and Redis key groups — between **any** of the four engines (`SQLite`, `MySQL / MariaDB`, `PostgreSQL`, `Redis`), existing `.sqlite` files on disk, or a **brand-new SQLite file**.

> **Warning – Overwriting target tables or keys.** When **If a target table / key exists** is set to **Drop & recreate (replace)** or **Truncate then insert**, existing target tables or Redis keys with matching names are replaced. Always click **Preview plan & SQL** first to review the exact `CREATE` / `DROP` statements and row counts. Targets marked **Production** or **Read-only** require you to type the target connection's exact name before cloning can start.

### Ways to open the Clone wizard

1. **Databases toolbar:** click **🧬 Clone database / tables…** at the top of the Databases tab.
2. **Connection details:** select any saved connection and click **Clone…** in its action bar (pre-selects that connection as the source).
3. **File list right-click:** right-click any SQLite file in the file list and click **Clone database / tables…**.

### Step-by-step workflow

1. **Choose the Source (read-only):**
   - Pick any saved **SQLite, MySQL / MariaDB, PostgreSQL, or Redis connection** or choose **🪶 SQLite file on disk…** and click **Inspect file** (inspection runs automatically whenever you change a saved source connection, or click **↻ Refresh**). The File Manager connects in read-only mode and lists every table, view, or Redis key group with its row/key count, column count, primary key, foreign keys, and secondary indexes.
2. **Choose the Target (destination):**
   - **🪶 New SQLite database file…:** choose a folder and a new file name (for example `analytics_copy.sqlite`), and optionally keep **Also save the new SQLite file as a connection in Databases** ticked.
   - **Saved connection:** clone into any configured SQLite, MySQL / MariaDB, PostgreSQL, or Redis connection (even the **same** connection if you want to duplicate tables with a prefix or new name).
   - **🪶 Existing SQLite file on disk…:** clone tables into an existing `.sqlite` file without needing to save a connection first.
3. **Pick which tables, views, or Redis key groups to clone:**
   - Use the **Filter tables, views or key groups** box or the **Select all**, **Tables only**, and **Select none** buttons to choose which objects to include.
   - To **rename a single table** on the target, type its new name in the **Target name** box on that row.
   - To **prefix every cloned table** (for example `stg_` or `bak_`), enter a prefix in **Target name prefix**. This also allows you to duplicate tables inside the **same** database without collisions.
4. **Choose Clone options:**
   - **What to copy:**
     - **Structure and data (tables + rows / keys)** — creates target tables and copies all rows or keys in batches.
     - **Structure only (DDL — no rows)** — creates the translated table structures, primary keys, foreign keys, and indexes with 0 rows.
     - **Data only (rows / keys)** — copies rows into existing target tables (and automatically creates any table that does not exist yet).
   - **If target exists:**
     - **Drop and recreate table / overwrite keys (`replace`)** — drops the target table (in reverse foreign-key order) and recreates it cleanly.
     - **Clear existing rows (truncate), then copy (`truncate`)** — keeps the existing target table structure, deletes its rows, and inserts the cloned rows.
     - **Keep existing rows, append new (`append`)** — keeps existing rows and inserts only rows whose primary/unique key does not collide (`INSERT OR IGNORE`, `INSERT IGNORE`, or `ON CONFLICT DO NOTHING`).
     - **Keep existing rows, update matching primary keys (`upsert`)** — inserts new rows and updates existing rows that match on the primary key (`ON CONFLICT DO UPDATE` / `ON DUPLICATE KEY UPDATE`).
     - **Skip tables / keys that already exist (`skip`)** — leaves any table that already exists on the target untouched and only creates missing tables.
     - **Stop with an error if any target exists (`fail`)** — aborts before changing anything if any selected target table already exists.
   - **Row / key limit per table:** optional cap (for example `1000`) when you want a lightweight development snapshot of a large database.
   - **Views:** tick **Include views** (recreates native `CREATE VIEW` when source and target share the same SQL engine, or materializes as a table across engines) or tick **Materialize views as tables** (turns every view's result set into a real table on the target).
   - **Copy indexes & Copy foreign keys:** kept on by default. Tables are automatically sorted in **topological dependency order** so parent tables are created and populated before child tables that reference them. When cloning into PostgreSQL, serial/identity sequences are automatically advanced past the highest cloned ID so subsequent `INSERT` statements never collide.
5. **Preview plan & SQL (dry run):**
   - Click **Preview plan & SQL** before running. The preview panel shows every source object, its target name, the action (`replace`, `create`, `upsert`, `append`, `skip`), estimated rows, cross-engine translation warnings, and the generated `CREATE TABLE` and `CREATE INDEX` DDL statements that will run.
6. **Clone now:**
   - Click **Clone now**. When finished, a toast banner reports the objects cloned, rows or keys copied, and elapsed time. If you cloned into a new SQLite file with **Also save the new SQLite file as a connection in Databases** ticked, it appears immediately in your Databases connection list and is selected for you.

## Cross-engine type translation reference

When cloning between SQLite, MySQL / MariaDB, and PostgreSQL, every column's type, nullability, default value, and auto-increment / identity property is mapped through a canonical type system:

| Canonical type | SQLite | MySQL / MariaDB | PostgreSQL |
|---|---|---|---|
| **Auto-increment primary key** | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT` / `BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY` | `INTEGER` / `BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` |
| **Integer (`integer`)** | `INTEGER` | `INT` | `INTEGER` |
| **64-bit integer (`bigint`)** | `INTEGER` | `BIGINT` | `BIGINT` |
| **Floating point (`float`)** | `REAL` | `DOUBLE` | `DOUBLE PRECISION` |
| **Exact decimal (`decimal`)** | `NUMERIC(p,s)` | `DECIMAL(p,s)` | `NUMERIC(p,s)` |
| **Boolean (`boolean`)** | `BOOLEAN` (`0` / `1`) | `TINYINT(1)` (`0` / `1`) | `BOOLEAN` (`TRUE` / `FALSE`) |
| **Short string (`varchar`)** | `VARCHAR(n)` | `VARCHAR(n)` (`VARCHAR(255)` when indexed and `n > 255`) | `VARCHAR(n)` |
| **Long text (`text`)** | `TEXT` | `LONGTEXT` (`VARCHAR(255)` when part of a key/index) | `TEXT` |
| **JSON (`json`)** | `TEXT` | `JSON` | `JSONB` |
| **UUID (`uuid`)** | `TEXT` | `CHAR(36)` | `UUID` |
| **Date / Time (`date`, `time`)** | `DATE` / `TIME` | `DATE` / `TIME` | `DATE` / `TIME` |
| **Timestamp (`timestamp`)** | `TIMESTAMP` | `DATETIME` | `TIMESTAMPTZ` |
| **Binary (`binary`)** | `BLOB` | `LONGBLOB` (`VARBINARY` when indexed) | `BYTEA` |

### How SQL ↔ Redis cloning maps data

- **SQL table → Redis:**
  - Each row becomes a Redis key named `<prefix><targetTable>:<primaryKeyValue>` (or `<rowNumber>` if the table has no primary key).
  - In **Redis Hash** mode (default), every column of the row is stored as a field of the hash (`HSET`), and `<prefix><targetTable>:_ids` stores the set of all primary keys (`SADD`).
  - In **JSON string** mode, the row object is serialized as a JSON string (`SET`).
- **Redis → SQL table:**
  - Keys in Redis are grouped by the prefix before their first `:` (for example `customers:101`, `customers:102` form the `customers` group; unprefixed keys form `redis_keys`).
  - **Hash key groups** automatically become structured SQL tables with `redis_key` (primary key), `key_id`, one column per discovered hash field, and `ttl_ms`.
  - **String, list, set, and sorted-set groups** become SQL tables with `redis_key` (primary key), `redis_type`, `value_text`, `value_json`, and `ttl_ms`.
- **Redis → Redis:**
  - Copies `string`, `hash`, `list`, `set`, and `zset` keys across Redis servers or database numbers while preserving millisecond TTLs (`PTTL` / `PEXPIRE`) and applying any target key prefix or group rename.

## Universal 15-format data import & staging

You can load any of **15 structured file formats** into SQLite, MySQL / MariaDB, PostgreSQL, or Redis:

- **Delimited text:** `.csv`, `.tsv`, `.psv` (pipe), `.ssv` (semicolon)
- **JSON family:** `.json` (arrays, `{ rows: [...] }`, or single objects), `.jsonc`, `.json5`, `.ndjson` / `.jsonl`
- **Spreadsheets:** Excel workbooks (`.xlsx`) and OpenDocument spreadsheets (`.ods`), with a live **Sheet selector** for multi-sheet workbooks
- **Config & serialization:** `.yaml` / `.yml`, `.toml`, `.xml`, Apple `.plist`, `.ini` / `.env` / `.properties`
- **Tables in documents & dumps:** SQL `INSERT` dumps (`.sql`), Markdown pipe tables (`.md`), and HTML `<table>` documents (`.html`)

### Importing with the 5-step Staging Wizard

1. Right-click any supported file in the File Manager and click **Load into a database (staging first)…**, or select a saved SQL connection in the Databases tab and click **Import data with staging…**.
2. The studio opens the 5-step **Import with staging** wizard:
   - **1 · Source:** detects format, encoding, delimiter, quotes, headers, or spreadsheet sheet, and previews the first rows.
   - **2 · Map:** matches file columns to table columns (or creates a new table) and applies clean-ups (trim spaces, parse dates and numbers, convert yes/no to booleans).
   - **3 · Load to staging:** loads the file into a temporary `stg_<table>_<timestamp>` table without touching your real table.
   - **4 · Check:** validates every cell's type, length, required status, duplicates, and foreign keys, letting you fix or skip bad rows in place.
   - **5 · Review & promote:** runs a dry-run preview showing exact row counts and SQL, promotes the valid rows in a single transaction, and records an undo snapshot so **Undo** can revert the batch cleanly.

Full details are in [Import with staging](staging-import.md).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| **"Nothing answered at host:port"** when testing MySQL, PostgreSQL, or Redis | The database server is not running on that port, or a firewall is blocking it. Start the server (for example `brew services start mysql`, `postgresql@18`, or `redis`) and click **Test connection** again. |
| **"The server refused the user name or password"** | Edit the connection, type the password again in the **Password** field, and click **Save**. Check **Effective settings** to confirm which user name and database are being sent. |
| **Source and target are the same database error in Clone** | When duplicating tables inside the same database, either enter a **Target table / key prefix** (such as `copy_`) or type a new **Target name** next to the table so a table does not overwrite itself. |
| **Redis Studio's "Open in a window" button is disabled** | When a Redis connection uses a password, opening the standalone desktop window would pass the Redis URL on the process command line. Use **Open in Redis Studio** (inside the tab) or **Open in my browser** instead, which keep the password off the command line. |

## See also

- [Databases overview](index.md)
- [Database Workbench guide](workbench.md)
- [Sample databases](sample-datasets.md)
- [Import with staging](staging-import.md)
- [Codecaine File Manager guide](../userguides/43_file_manager.md#databases-databases-tab)
- [Database tests](../testing/database-tests.md)
