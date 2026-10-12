# 🐬 MySQL Studio Pro -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Native Bun SQL (MySQL / InnoDB)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:mysql]  •  [Direct: bun run applications/mysql_studio.ts]
```

---

## 🌟 Executive Overview
**MySQL Studio Pro** is a high-performance, enterprise-grade MySQL database workstation, query editor, schema visualizer, and diagnostic workbench engineered natively on Bun's built-in `SQL` subsystem. It delivers desktop database management speed comparable to Delphi and native desktop database clients—with **zero external software dependencies**, instant sub-millisecond execution latency, and native support for MySQL 8+ `caching_sha2_password` authentication.

Whether you are debugging web application databases, inspecting relational foreign key trees, designing tables visually without manual SQL, or analyzing query execution plans before deployment, MySQL Studio Pro gives you a tactile, visual cockpit.

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
> **Alternative (Manual Execution):** If you prefer to start/stop MySQL manually without a system daemon, run `mysql.server start` and `mysql.server stop`.

### Step 3: Configure Root Password & Authentication
By default on Homebrew, MySQL installs without a root password. Connect and set your password:
```bash
# Connect as root with no initial password
mysql -u root
```

Inside the MySQL prompt, set your root password and refresh privileges:
```sql
-- Replace 'your_password' with your desired password
ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_password';
FLUSH PRIVILEGES;
EXIT;
```

> **Security Wizard:** You can also run Homebrew's automated security wizard:
> ```bash
> mysql_secure_installation
> ```

### Step 4: Create the Application Database
Create the development database matching your `.env` configuration:
```bash
# Create target database with utf8mb4 encoding
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS my_app_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### Step 5: Configure `.env` in `bun_rad_studio`
Add your database credentials to the `.env` file in the project root:
```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=my_app_dev
```

### Useful Homebrew MySQL Service Commands
| Command | Action |
| :--- | :--- |
| `brew services start mysql` | Start MySQL as a background daemon (auto-starts on boot) |
| `brew services stop mysql` | Stop the MySQL background daemon |
| `brew services restart mysql` | Restart the MySQL background daemon |
| `mysql.server status` | Check service health and PID |
| `mysql -u root -p` | Open the MySQL terminal CLI client |

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch via npm / bun run script
bun run app:mysql

# Direct execution via Bun
bun run applications/mysql_studio.ts
```

### 2. Environment Configuration (`.env`)
MySQL Studio Pro connects directly to your MySQL server using environment variables configured in your project's `.env` file:

```bash
# Option A: Individual connection parameters
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=my_app_dev

# Option B: Single connection string URL
DATABASE_URL=mysql://root:your_password@localhost:3306/my_app_dev
```

### 3. Launch Programmatically in TypeScript
```typescript
import { createMysqlStudio } from "./applications/mysql_studio";

const studio = createMysqlStudio({
  fullscreen: false,
  width: 1400,
  height: 900,
  initialDbPath: "my_app_dev"
});
await studio.run();
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1260×880) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![MySQL Studio Desktop](../../screenshots/apps/mysql_studio_desktop.png) | ![MySQL Studio Responsive](../../screenshots/apps/mysql_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Window Header & Command Bar
- **Brand Title & Connection Status**: Displays live database connection state and active database identifier.
- **📂 Open / Browse DB**: Opens the interactive server database browser modal. Auto-discovers and lists all schemas on the MySQL server (`SHOW DATABASES`) with 1-click database switching.
- **🌱 Seed Sample DB**: Instantly provisions an enterprise relational starter dataset (5 relational tables: `customers`, `products`, `orders`, `order_items`, `audit_logs` + 7 pre-built views) with 1-click.
- **🧹 Vacuum DB**: Runs `OPTIMIZE TABLE` across all tables in the active schema, defragmenting InnoDB tablespaces and updating index statistics.
- **Telemetry Cards**: Live KPI summary display showing:
  - **Active Database & Version**: Server version (e.g. MySQL 8.x) and schema name.
  - **Storage Size**: Total allocated table and index space in formatted megabytes/kilobytes.
  - **Tables & Views Count**: Total active base tables and relational views.
  - **Total Rows**: Aggregate row count across all tables.

### 2. Relational Object Tree (Left Sidebar)
- **Tables Section**: Collapsible listing of all `BASE TABLE` objects with row counts. Click any table to immediately open it in the paginated Data Grid.
- **Views Section**: Collapsible listing of all `VIEW` objects. Click any view to inspect its live computed projection.
- **Context Actions**: Right-click or use toolbar icons to redesign table structures, drop objects, or view table details.

### 3. Workstation Tabs

#### Tab 1: 📊 Table Data Grid & CRUD Editor
- **Paginated Data Grid**: High-performance virtualized grid with page-size selectors (10, 25, 50, 100, 500 rows).
- **Search & Filter**: Type in the search bar and press Enter to instantly filter table records across all columns using server-side parameterized `LIKE` queries.
- **Column Header Sorting**: Click any column header to sort ascending (`ASC`) or descending (`DESC`).
- **Inline Editing & Mutations**:
  - **Insert Row**: Click `+ Add Row` to open the modal form and insert records with type validation.
  - **Edit Row**: Double-click any cell or row to update values in-place with instant primary-key targeted `UPDATE`.
  - **Delete Row**: Click the delete icon on any row to remove records with safety confirmation.

#### Tab 2: ⚡ SQL Query IDE
- **Interactive Multi-Line Editor**: Write and run arbitrary SQL queries with syntax highlighting and keyboard shortcut execution (`Ctrl + Enter` / `Cmd + Enter`).
- **Pre-Loaded SQL Presets**: 11 production-grade SQL presets ready to execute:
  1. *4-Table Join View: Extended Order Details*
  2. *3-Table Join View: Customer Lifetime Orders & Spend*
  3. *3-Table Join View: Product Sales & Stock Performance*
  4. *3-Table Join View: Pending Shipments Pipeline*
  5. *2-Table Join View: VIP Segment Completed Orders*
  6. *All Customers (Tier & Lifetime Spend)*
  7. *Sales by Category Breakdown*
  8. *High-Value Orders (> $1,000)*
  9. *Products Low Stock Alert (< 50 units)*
  10. *Database Schema Master Table (`information_schema`)*
  11. *Audit Log Trail (Recent Mutations)*
- **Explain Query Plan**: Click **Explain Plan** to execute MySQL's `EXPLAIN` engine and inspect scan types (`ALL`, `index`, `range`), key utilization, and estimated row scans.
- **Export Query Results**: Export query result sets directly to CSV, JSON, or SQL INSERT statements with 1-click.

#### Tab 3: 📐 Visual Query Designer (QBE)
- Visual query matrix allowing non-technical users to build relational queries, select columns, define join relationships, specify search criteria, and preview generated SQL in real-time.

#### Tab 4: 🛠️ Table Schema Designer
- Visual table designer to inspect and alter column specifications:
  - Column name, data type, nullability (`NOT NULL`), default values, primary key (`PRI`), and auto-increment (`AUTO_INCREMENT`).
  - View raw generated `CREATE TABLE` and `CREATE VIEW` DDL syntax.

#### Tab 5: 📦 Import & Export Workbench
- **Export Data**: Export entire tables or selected schemas to formatted `.csv`, `.json`, or `.sql` dump files. Files are automatically saved to your system `Downloads` directory.
- **Import Data**: Batch import CSV or JSON files with automated column mapping.
- **Execute Scripts**: Paste or load multi-statement SQL migration scripts and execute them sequentially.

#### Tab 6: 🚀 Server Performance & PRAGMA Operations
- **Run Full VACUUM (OPTIMIZE TABLE)**: Rebuilds and optimizes InnoDB tables, reclaiming fragmented storage.
- **Run Integrity Check (CHECK TABLE)**: Scans tables for corruption and validates key index trees.
- **Server Variables & Status**: Inspect live MySQL session and global variables with real-time telemetry output.

---

## 🔒 Security & Architecture Notes
- **Local Workstation Guard**: All internal API endpoints are restricted to loopback connections (`127.0.0.1` / `localhost`) via `guardLocalRequest()`.
- **Parameterized Queries**: All user inputs in the search bar, data grid mutations, and server operations use parameterized queries to prevent SQL injection.
- **Isolated Threading**: The background HTTP telemetry and MySQL engine runs on an isolated thread via Bun's Web Worker API, ensuring the desktop UI remains responsive with zero event loop blocking.
