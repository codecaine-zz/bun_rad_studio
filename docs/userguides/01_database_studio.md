# 🗄️ Database Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native bun:sqlite (WAL Mode)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:database]  •  [Terminal CLI: bun run cli:database]
```

---

## 🌟 Executive Overview
**Database Studio Pro** is a high-performance, enterprise-grade SQLite query editor, schema browser, and diagnostic workbench engineered natively on Bun's C-level `bun:sqlite` subsystem. It delivers desktop database management speed comparable to Delphi and native desktop database clients—with **zero external software dependencies**, zero brew installations, and instant sub-second boot times.

Whether you are debugging a local application database, inspecting complex relational foreign keys, generating synthetic test data, or benchmarking query plans before deployment, Database Studio Pro gives you a tactile, visual cockpit.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch (in-memory sandbox or active project DB)
bun run app:database

# Backwards-compatible shorthand alias
bun run app:sqlite
```

### 2. Launch Terminal CLI Query Mode
```bash
# Direct SQL query evaluation in terminal
bun run cli:database -f ./app.db "SELECT * FROM users LIMIT 10"

# Dump table schema directly in terminal
bun run cli:database -f ./app.db --schema
```

### 3. Launch Programmatically in TypeScript
```typescript
import { createDatabaseStudio } from "./applications/database_studio";

const studio = createDatabaseStudio("./production.sqlite", {
  fullscreen: false,
  width: 1400,
  height: 900
});
await studio.run();
```

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
- **Database File Path Input**: Accepts `:memory:` (for temporary in-ram experiments) or absolute/relative file paths (e.g. `./data/production.sqlite`).
- **🔌 Connect / Switch DB Button**: Safely disconnects the current handle and mounts the target database file with `PRAGMA journal_mode = WAL` enabled.
- **🌱 Seed 50 Test Records Button**: Instantly provisions a mock schema (`users` and `transactions` tables) and populates 50 realistic relational rows for testing.
- **📋 DDL Schema Button**: Scans `sqlite_master` and renders complete, syntax-highlighted `CREATE TABLE` and `CREATE INDEX` statements.

### 3. SQL Query Editor & Diagnostic Bar
- **Multi-line SQL Editor**: Textarea with monospace font, automatic indentation, and support for multi-statement scripts, CTEs (`WITH ...`), and window functions.
- **⚡ Execute SQL (Ctrl/Cmd + Enter)**: Executes the query with microsecond resolution timer.
- **🔍 Explain Plan Button**: Runs `EXPLAIN QUERY PLAN` and generates a step-by-step breakdown of table scans vs index lookups.
- **🧹 Clear Button**: Resets query editor and data output console.

### 4. Results Grid & Telemetry Panel
- **Execution Telemetry Pill**: Displays exact row count returned and execution latency down to fractional milliseconds (e.g., `42 rows • 0.38ms`).
- **Dynamic Table Grid**: Interactive data grid displaying column headers, numeric alignment, null indicator badges, and scrollable rows.
- **Error Diagnostic Banner**: Displays descriptive SQLite error codes, line numbers, and constraint explanations if a query fails.

### 5. Enterprise Data Export Suite
- **📊 Export CSV**: Converts the active result grid into standardized comma-separated values for spreadsheet analysis.
- **📋 Export JSON**: Formats and copies the active result rows as clean JSON objects.
- **💾 Export SQL Inserts**: Generates a reproducible sequence of `INSERT INTO ... VALUES (...);` migration statements.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Inspecting an Existing Application SQLite Database
1. Open Database Studio Pro via `bun run app:database`.
2. In the **Database File Path** field, enter your database path: `./my_app.sqlite`.
3. Click **🔌 Connect / Switch DB**.
4. Click **📋 DDL Schema** to review all table schemas, primary keys, and foreign keys.
5. In the SQL Editor, type:
   ```sql
   SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'index');
   ```
6. Press `Cmd+Enter` (or click **⚡ Execute SQL**). Inspect your tables in the grid.

### Tutorial 2: Diagnosing Slow Queries with EXPLAIN QUERY PLAN
1. Type a query involving joins or filters:
   ```sql
   SELECT u.name, count(t.id) as orders 
   FROM users u 
   LEFT JOIN transactions t ON u.id = t.user_id 
   WHERE t.status = 'COMPLETED' 
   GROUP BY u.name;
   ```
2. Click **🔍 Explain Plan**.
3. Look at the output:
   - If you see `SCAN TABLE users` or `SCAN TABLE transactions`, you are doing a full table scan.
   - Run `CREATE INDEX idx_transactions_user ON transactions(user_id, status);` to add an index.
   - Run **🔍 Explain Plan** again and verify that SQLite now reports `SEARCH TABLE transactions USING INDEX idx_transactions_user`.

### Tutorial 3: Exporting Test Data as SQL Migrations
1. Run your query filtering target rows:
   ```sql
   SELECT * FROM users WHERE role = 'admin';
   ```
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

---

## 💡 Pro Tips & Enterprise Best Practices
- **Write-Ahead Logging (WAL)**: Database Studio Pro automatically activates `PRAGMA journal_mode = WAL;`. This allows concurrent readers to query the database while your application writes to it, eliminating `database is locked` errors.
- **In-Memory Sandbox Testing**: Use `:memory:` as the file path to test risky `ALTER TABLE` or destructive updates without touching production files on disk.
- **Safe Transaction Rollbacks**: Always wrap multi-statement migrations in `BEGIN TRANSACTION; ... COMMIT;`. If an error occurs midway, Database Studio Pro rolls back changes automatically to maintain ACID consistency.

---

## ❓ Troubleshooting & FAQs

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Database is locked"** | Another process is holding an exclusive write lock without WAL. | Run `PRAGMA journal_mode = WAL;` or close other active SQLite CLI tools. |
| **"No such table"** | Database file connected is empty or path was mistyped. | Verify absolute file path using `ls -la` and click **DDL Schema** to confirm table presence. |
| **Large result set sluggish** | Query returned over 100,000 rows at once. | Add a `LIMIT 1000` clause to your query to paginate results efficiently. |

---

## 📐 Technical Architecture & Offline Resilience
- **Runtime Subsystem**: Pure `bun:sqlite` binary bindings directly linked into Bun's engine.
- **UI Architecture**: High-speed macOS WKWebView with hardware-accelerated CSS and virtual table DOM.
- **Zero Third-Party Binaries**: Zero requirement for `sqlite3` CLI, Homebrew, or external drivers. 100% offline self-contained.
