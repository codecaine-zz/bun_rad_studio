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

Postgres Studio Pro features 7 dedicated workspace tabs:

### 1. 📊 Tabular Data Grid
- Paginated, lightning-fast data viewing with custom page sizing (25, 50, 100, 250).
- Real-time row filtering across all columns.
- Dedicated renderers for PostgreSQL native data types:
  - **UUIDs**: Monospace formatting with 1-click clipboard copying.
  - **JSONB**: Highlighted clickable badge; clicking opens the **JSONB Inspector Modal** with tree indentation and full path copying.
  - **Native Arrays**: Formatted tag pills (e.g. `['server', 'datacenter']`).
  - **Timestamps**: Localized date-time formatting with timezone offsets.
- Export results to CSV and JSON.

### 2. ⚡ SQL Query IDE
- Syntax-highlighted query editor with keyboard shortcuts (**Cmd+Enter** or **Ctrl+Enter** to execute).
- 12 Curated PostgreSQL-specific SQL presets covering:
  - Materialized view refreshes
  - Deep JSONB operators (`->>`, `@>`)
  - Native array containment and unnesting
  - Full outer joins
  - CTEs & window ranking functions
  - UUID generation
  - `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)`
  - Active process diagnostics
  - Table bloat & disk usage (`pg_size_pretty`)
  - Extensions inspection
- Formatted tabular output with execution latency and row counts.
- Export results to CSV and Markdown.

### 3. 📐 Visual Query Designer & Access Relational Canvas
- Microsoft Access-style relational canvas:
  - Add tables and views as movable cards with draggable headers.
  - Interactive column lists showing primary keys (🔑) and data types.
  - Automatic relationship discovery via foreign key introspection (`⚡ Auto-Joins`).
  - Automatic clean grid alignment (`📐 Arrange`).
- Deep Zoom & Room Controls:
  - Zoom range from 50% to 200% with preset selectors, zoom-in (`🔍+`), zoom-out (`🔍−`), and 1:1 reset.
  - Canvas stage sized to 2,200px × 1,400px with background grid dots for extensive multi-table schemas.
- **Join Properties Modal with Venn Diagrams**:
  - **Option 1**: INNER JOIN (Only matching rows)
  - **Option 2**: LEFT OUTER JOIN (ALL records from Left Table)
  - **Option 3**: RIGHT OUTER JOIN (ALL records from Right Table)
  - **Option 4**: **FULL OUTER JOIN (Postgres Native)** (ALL records from both tables)
- Lower QBE Matrix:
  - Configure Field, Table, Total (`GroupBy`, `Sum`, `Avg`, `Count`, `Min`, `Max`), Sort, Show, and Criteria.
- Switch between **📐 Design View**, **💻 SQL View** (properly double-quoted identifiers), and **📋 Datasheet View** (live data execution).

### 4. 🧩 PostgreSQL Extensions Manager
- Complete catalog of all extensions supported by the PostgreSQL server (`pg_available_extensions`).
- Filter by All, Installed Only, or search by keyword (e.g. `uuid`, `trgm`, `vector`, `citext`).
- Each card shows extension name, installed version, default available version, and official PostgreSQL documentation comment.
- 1-Click `+ Install` (`CREATE EXTENSION IF NOT EXISTS`) and `✕ Remove` (`DROP EXTENSION`).

### 5. ⚡ Live Activity & Process Diagnostics
- Real-time dashboard powered by `pg_stat_activity`.
- Visual indicators for backend states: `active` (emerald), `idle` (slate), `idle in transaction` (amber).
- Runtime duration tracking with color alerts for long-running queries.
- Action controls:
  - **🛑 Cancel Query**: Calls `pg_cancel_backend(pid)` to abort a slow query without dropping the client socket.
  - **⚡ Kill Process**: Calls `pg_terminate_backend(pid)` to immediately sever a runaway connection.
- Optional 3-second auto-refresh toggle.

### 6. 🔍 Query Plan Visualizer (`EXPLAIN ANALYZE`)
- Runs `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` to display the query execution tree.
- Inspect Seq Scans, Index Scans, Hash Joins, Sort operations, actual execution costs, and buffer cache hits.

### 7. 💻 Raw JSON Telemetry Inspector
- Inspect raw JSON responses from queries and schema reflection.
- 1-Click copying to clipboard for integration with external tooling.

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
# Run server mode on an ephemeral port
bun run applications/postgres_studio.ts --server
```

---

## 🌱 Seeding the Sample Database

To test and explore all PostgreSQL-specific features immediately:
1. Click **`🌱 Seed Sample DB`** in the top navigation bar.
2. The workstation creates a rich enterprise schema including:
   - `customers` (with UUID primary keys and JSONB preferences)
   - `products` (with UUIDs, JSONB hardware specs, and native `text[]` tag arrays)
   - `orders` and `order_items` (with foreign keys and decimal calculations)
   - `audit_logs` (with JSONB event payloads and `TIMESTAMPTZ`)
   - `v_customer_order_summary` (multi-table view)
   - `mv_customer_monthly_revenue` (**Materialized View** with 1-click refresh support)

---

## 🧪 Automated Testing

Postgres Studio Pro is backed by a full automated test suite verifying server APIs, security sanitization, schema reflection, and extensions management:

```bash
# Execute Postgres Studio test suite
bun test tests/postgres_studio.test.ts
```

All 11 tests validate:
- HTML compilation and PostgreSQL aesthetics
- Sanitized configuration endpoint (no password leak)
- Safe non-destructive credential testing
- Reset to `.env` variables
- Schema namespace reflection and switching
- Available extensions catalog
- `pg_stat_activity` diagnostics
- `VACUUM ANALYZE` maintenance
- Database creation validation and identifier safety
- Desktop workstation factory instantiation
