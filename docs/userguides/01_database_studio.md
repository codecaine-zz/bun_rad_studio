# 🗄️ Database Studio Pro -- User Guide

**Database Studio Pro** is an enterprise-grade SQLite query editor, schema browser, and database workbench built directly on Bun's native `bun:sqlite` engine. It provides Delphi-style database management speed with zero external client tools required.

---

## ⚡ Quick Start

```bash
# Launch with default in-memory sandbox
bun run app:database

# Launch with backwards-compatible alias
bun run app:sqlite
```

You can also pass a file path directly in TypeScript code:
```ts
import { createDatabaseStudio } from "./applications/database_studio";
const win = createDatabaseStudio("./my_database.sqlite");
win.run();
```

---

## 🖥️ User Interface Overview

Database Studio Pro features a responsive multi-panel layout:

1. **Header & Navigation Bar**:
   - **Theme Selector**: Dynamically change form styling (Sonoma Emerald, Cupertino Blue, Midnight Indigo, etc.).
   - **💾 Save State**: Immediately saves window bounds, active queries, and layout preferences to disk.
   - **Center**: Centers the window on your primary display.
2. **Database Connection & Seed Controls**:
   - **Database File Path**: Accepts `:memory:` or absolute/relative paths to SQLite files on disk (e.g. `./data/app.db`).
   - **🔌 Connect / Switch DB**: Opens and mounts the specified database with WAL journaling enabled.
   - **🌱 Seed 50 Test Records**: Generates 50 synthetic users and transactions for rapid testing.
   - **DDL Schema**: Instant introspective DDL generator displaying table definitions and indexes.
3. **Query Editor & Execution Actions**:
   - **SQL Query Input**: Multi-line SQL text area supporting `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and multi-statement transactions.
   - **⚡ Execute SQL**: Executes the query with high-resolution microsecond timing.
   - **🔍 Explain Plan**: Runs `EXPLAIN QUERY PLAN` to help diagnose slow queries and missing indexes.
4. **Data Grid & Results View**:
   - **Results Table / Output Console**: Renders formatted SQL results with column headers, row counts, and error diagnostics.
5. **Enterprise Export Actions**:
   - **📊 Export CSV**: Converts the active result set into standardized comma-separated values.
   - **📋 Export JSON**: Dumps active result rows as structured JSON.
   - **💾 Export SQL Inserts**: Generates complete `INSERT INTO ...` statements for table migration.

---

## 📖 Practical Tutorials

### 1. Connecting to an Existing SQLite Database on Disk
1. Enter the relative or absolute path in the **Database File Path** input:
   ```text
   ./my_project/production.sqlite
   ```
2. Click **🔌 Connect / Switch DB**.
3. Database Studio Pro will open the file in read-write mode, verify schema tables, and populate the table selector.
4. Click **DDL Schema** to view the table definitions.

### 2. Optimizing Queries with EXPLAIN QUERY PLAN
1. Enter your complex query:
   ```sql
   SELECT u.name, SUM(t.amount) AS total_spent 
   FROM users u 
   JOIN transactions t ON u.id = t.user_id 
   WHERE t.status = 'COMPLETED' 
   GROUP BY u.name 
   ORDER BY total_spent DESC;
   ```
2. Click **🔍 Explain Plan**.
3. Inspect the execution plan in the results view to check whether SQLite is utilizing an index (`USING INDEX idx_user_id`) or performing an expensive full table scan (`SCAN TABLE`).

### 3. Migrating Data with SQL INSERT Exports
1. Run any filter query:
   ```sql
   SELECT * FROM users WHERE status = 'ACTIVE';
   ```
2. Click **💾 Export SQL Inserts**.
3. The query editor will generate executable `INSERT INTO users (id, name, email, role, status) VALUES (...)` statements ready to paste into migration files.

---

## 🛡️ Enterprise Resilience Features
- **Automatic Rollbacks**: In the event of a query syntax error or constraint violation, the engine automatically rolls back transactions to prevent database lockups.
- **WAL Mode Enabled**: Native connection opens with `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL` for enterprise-level concurrency and write throughput.
- **Memory Safety**: Queries with massive result sets are bounded to prevent UI thread lockups.
