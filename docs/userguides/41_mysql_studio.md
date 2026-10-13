# 🐬 MySQL Studio Pro -- Complete Production User Guide

```
Version: 2.6.0  •  Engine: Native Bun SQL (MySQL / InnoDB)  •  Dependencies: 0  •  Offline: 100%
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
# Recommended MSQL_* naming convention
MSQL_HOST=localhost
MSQL_PORT=3306
MSQL_USER=root
MSQL_PASSWORD=your_password
MSQL_NAME=my_app_dev

# Note: MYSQL_* and DB_* are also fully supported as fallbacks
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
By default, MySQL Studio Pro connects to your MySQL server using environment variables configured in your project's `.env` file:

```bash
# Option A: Recommended MSQL_* naming convention
MSQL_HOST=localhost
MSQL_PORT=3306
MSQL_USER=root
MSQL_PASSWORD=your_password
MSQL_NAME=my_app_dev

# Option B: Single connection string URL
MSQL_URL=mysql://root:your_password@localhost:3306/my_app_dev
# Or standard DATABASE_URL=mysql://root:your_password@localhost:3306/my_app_dev

# Note: MYSQL_* (e.g. MYSQL_HOST) and DB_* (e.g. DB_HOST) are also supported
```

### 3. Manual Connection Configuration (No `.env` Required)
If you are working without environment variables, connecting to remote instances, testing ephemeral containers, or managing multiple database servers, MySQL Studio Pro provides a full **Manual Connection & Database Manager**:

- **Opening Connection Config**:
  - Click `🔌 Connection Config...` in the top header.
  - Or click `🔌 Config...` in the sidebar.
  - Or click the **Active Database** KPI card in the telemetry bar.
- **Form Fields vs. Connection URL**:
  - **📋 Form Fields Mode**: Enter `Server Host / IP`, `Port`, `Username`, `Password` (with show/hide eye toggle), `Default Database`, and check `Enable SSL / TLS Encryption`.
  - **🔗 Connection URL Mode**: Paste or edit standard connection URLs (`mysql://user:pass@host:port/database?tls=true`).
  - **Bidirectional Live Synchronization**: Modifying form fields immediately updates the connection URL, and editing the URL instantly parses back into individual form fields.
- **1-Click Connection Presets**:
  - **🏠 Localhost (3306)**: Populates `127.0.0.1:3306` with user `root` and database `my_app_dev`.
  - **🐳 Docker (127.0.0.1:3306)**: Configures standard Docker container defaults (`root` / `rootpassword`).
  - **🔌 Port 3307**: Configures alternate local port setups (e.g. secondary MariaDB / MySQL instance).
  - **☁️ RDS Template**: Pre-fills Amazon RDS / Aurora cluster connection templates with SSL enabled.
  - **↺ Reset to .env**: Re-reads your active `.env` file and restores default environment credentials.
- **Live Connection Testing (`⚡ Test Connection`)**:
  - Validates credentials against the target MySQL server safely before applying them.
  - Reports exact sub-millisecond roundtrip latency (e.g. `2.4 ms`) and verified MySQL server version.
  - Executes `SHOW DATABASES` on the server and renders clickable database chips so you can pick your database with a single click.
- **💾 Saved Connection Profiles**:
  - Click `💾 Save Profile` to store verified connection parameters in local workstation storage.
  - Switch to the **💾 Saved Profiles** tab to launch saved connections with 1-click or delete obsolete profiles.
- **🗄️ Server Database Switcher & Creator**:
  - Switch to the **🗄️ Server Databases** tab to view all databases on the active host.
  - Type a name into **Create New Database on Server** to execute `CREATE DATABASE` and switch active database context instantly.

### 4. Launch Programmatically in TypeScript
You can pass manual connection parameters directly to `createMysqlStudio` without setting any system environment variables:

```typescript
import { createMysqlStudio } from "./applications/mysql_studio";

// Direct manual connection parameters
const studio = createMysqlStudio({
  host: "127.0.0.1",
  mysqlPort: 3306,
  user: "root",
  password: "your_password",
  database: "ecommerce_db",
  tls: false,
  fullscreen: false,
  width: 1400,
  height: 900,
});
await studio.run();
```

---

## 🖼️ Visual Interface Tour

| Microsoft Access Relational Canvas & Multi-Table Joins (1400×1340) |
| :---: |
| ![MySQL Visual Table Joins Canvas](../../screenshots/apps/visual_joins_canvas_mysql.png) |

| Access-Style Join Properties Modal (Venn Diagrams) | Deep Zoom & Expansive Room Mode (125%) |
| :---: | :---: |
| ![Join Properties Modal](../../screenshots/apps/visual_joins_properties_modal.png) | ![Deep Canvas Zooming](../../screenshots/apps/visual_joins_zoom_room.png) |

| High-Resolution Desktop (1260×880) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![MySQL Studio Desktop](../../screenshots/apps/mysql_studio_desktop.png) | ![MySQL Studio Responsive](../../screenshots/apps/mysql_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Window Header & Command Bar
- **Brand Title & Connection Status**: Displays live database connection state, latency indicators, and active database identifier.
- **🔌 Connection Config...**: Opens the interactive **MySQL Connection & Database Manager** modal to configure credentials manually, test connections, apply presets, or manage saved profiles.
- **📂 Databases...**: Opens the discovered server database listing (`SHOW DATABASES`) with 1-click database switching and new database provisioning.
- **🌱 Seed Sample DB**: Instantly provisions an enterprise relational starter dataset (5 relational tables: `customers`, `products`, `orders`, `order_items`, `audit_logs` + 7 pre-built views) with 1-click.
- **🧹 Vacuum DB**: Runs `OPTIMIZE TABLE` across all tables in the active schema, defragmenting InnoDB tablespaces and updating index statistics.
- **Telemetry Cards**: Live KPI summary display showing:
  - **Active Database & Version**: Server version (e.g. MySQL 8.x) and schema name. *Clicking this card opens the Connection Config modal immediately.*
  - **Storage Size**: Total allocated table and index space in formatted megabytes/kilobytes.
  - **Tables & Views Count**: Total active base tables and relational views.
  - **Total Rows**: Aggregate row count across all tables.

### 2. Relational Object Tree (Left Sidebar)
- **Workbench Shortcuts**: Includes quick action buttons:
  - `🔌 Config...`: Direct shortcut to the manual connection workbench.
  - `📂 Databases`: Direct shortcut to the server database scanner.
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

#### Tab 3: 📐 Visual Query Designer & Microsoft Access Relational Canvas

MySQL Studio Pro features an enterprise-grade visual query designer inspired directly by Microsoft Access. It transforms complex MySQL multi-table joins into a tactile, visual experience—allowing anyone to drag relationships, select join types, and generate optimized MySQL queries with zero syntax friction.

```mermaid
graph LR
    C[customers] -- "INNER JOIN (`id` = `customer_id`)" --> O[orders]
    O -- "INNER JOIN (`id` = `order_id`)" --> OI[order_items]
    OI -- "INNER JOIN (`product_id` = `id`)" --> P[products]
    style C fill:#1e293b,stroke:#00758f,stroke-width:2px,color:#f8fafc
    style O fill:#1e293b,stroke:#f29111,stroke-width:2px,color:#f8fafc
    style OI fill:#1e293b,stroke:#34d399,stroke-width:2px,color:#f8fafc
    style P fill:#1e293b,stroke:#a855f7,stroke-width:2px,color:#f8fafc
```

##### 1. Graphical Relational Canvas
- **Draggable MySQL Entity Cards**: Each table card displays its table name, column list, native MySQL types (`INT`, `VARCHAR(255)`, `DATETIME`, `DECIMAL(10,2)`), primary keys (`🔑`), and foreign key indicators (`🔗`). Header drag handles allow free positioning across the infinite workspace.
- **Field-to-Field Drag & Drop**: Click any field in Table A and drag your cursor directly onto the target join field in Table B. The engine draws an interactive SVG Bézier curve connecting the exact column rows.
- **Directional Line Arrows & Relational Semantics**:
  - **INNER JOIN**: Solid balanced line between matching columns.
  - **LEFT OUTER JOIN**: Directional arrow pointing right (`▶`) toward the secondary table, indicating complete left-table preservation with `NULL` fills for unmatched right-table rows.
  - **RIGHT OUTER JOIN**: Directional arrow pointing left (`◀`) toward the primary table, preserving all right-table rows.
  - **FULL OUTER JOIN**: Double-headed directional arrows (`◀▶`) for complete Cartesian set unions.
  - **CROSS JOIN**: Distinctive Cartesian cross indicator (`⨯`).
- **Interactive Join Badges**: Click or double-click the join pill badge (`= INNER`, `⇥ LEFT`, `⇤ RIGHT`, `↔ FULL`, `⨯ CROSS`) on the relationship line to open the **Join Properties** modal dialog.
- **⚡ Auto-Detect Joins**: Automatically reads MySQL `information_schema.KEY_COLUMN_USAGE` constraints and naming conventions (e.g. `customer_id` ➔ `customers.id`, `order_id` ➔ `orders.id`) to construct a multi-table spanning tree in one click.
- **Relational Topology Validation**: Real-time indicator verifies that all selected tables form a single connected graph (`● All 4 tables connected in relational graph`).

##### 2. Microsoft Access Join Properties Modal Dialog
Double-clicking any join connector line or clicking **Properties** launches the Microsoft Access Join Properties dialog:

| Access Join Properties Dialog (Interactive Venn Diagram) |
| :---: |
| ![Join Properties Modal](../../screenshots/apps/visual_joins_properties_modal.png) |

- **5 Relational Radio Directives**:
  1. **Option 1 (INNER JOIN)**: *"Only include rows where the joined fields from both tables are equal."*
  2. **Option 2 (LEFT OUTER JOIN)**: *"Include ALL records from '&lt;Left Table&gt;' and only those records from '&lt;Right Table&gt;' where the joined fields are equal."*
  3. **Option 3 (RIGHT OUTER JOIN)**: *"Include ALL records from '&lt;Right Table&gt;' and only those records from '&lt;Left Table&gt;' where the joined fields are equal."*
  4. **Option 4 (FULL OUTER JOIN)**: *"Include ALL records from both tables whether or not there are matching records."*
  5. **Option 5 (CROSS JOIN)**: *"Produce the Cartesian product of all rows between '&lt;Left Table&gt;' and '&lt;Right Table&gt;'."*
- **Dynamic Venn Diagram Visualizer**: High-resolution SVG preview illuminating the exact mathematical subset included (intersection, left-dominant, right-dominant, or complete union).
- **Live Generated MySQL Syntax**: Live preview of the generated `FROM `t1` [TYPE] JOIN `t2` ON `t1`.`c1` = `t2`.`c2`` clause with proper backtick escaping.
- **⇄ Swap Tables & 🗑️ Delete Join**: Reverse join orientation with 1-click or cleanly remove the relationship.

##### 3. Deep Canvas Zooming & Navigation (40% to 250%)
- **Zoom Toolbar**: `🔍−` (Zoom out by 15%), `🔍+` (Zoom in by 15%), `1:1` (Reset to 100%), `🎯 Fit All` (calculates bounding box and scales all tables to fit into the viewport).
- **Scale Presets**: Quick dropdown with `50%`, `75%`, `90%`, `100%`, `125%`, `150%`, `200%`.
- **Mouse Wheel Zoom**: Hold `Ctrl` or `Cmd` and scroll your mouse wheel to zoom smoothly in and out centered at the mouse cursor.
- **Canvas Panning**: Drag on empty canvas background to pan around large enterprise database schemas.

##### 4. Expansive Room Modes & Draggable Resizer Splitter
- **Room Presets**:
  - `⤢ Canvas`: Maximizes canvas vertical space (up to 750px / 70vh) for large schemas with dozens of tables.
  - `⤡ Split`: Balanced 50/50 split between visual relationship canvas and QBE criteria matrix.
  - `⤢ Grid`: Maximizes lower QBE grid when configuring complex criteria, sorting, and aggregate functions.
- **Interactive Draggable Resizer Splitter (`#qbeResizerBar`)**: Drag the resizer handle between **180px and 1200px** to fine-tune your workspace height.

##### 5. Section Ease of Use & Ergonomic Enhancements
- **QBE Grid Density**: Select `Compact`, `Normal`, or `Spacious` cell density to view up to 12+ columns simultaneously.
- **Criteria Syntax Help (`💡 Syntax Help`)**: Instant cheat sheet for comparisons (`> 100`, `<> 'cancelled'`), pattern matches (`LIKE 'A%'`), ranges (`BETWEEN 10 AND 50`), and sets (`IN ('VIP', 'Gold')`).
- **Fullscreen Workspace Toggle (`◀▶ Sidebar`)**: 1-click collapse of the left database object tree to expand the Visual Designer, SQL IDE, or Data Grid to **100% full-screen width**.
- **SQL IDE Font & Height Controls**: `A−` / `A+` font size scaling (10px - 22px), `↕ Resize Editor` (160px / 320px / 580px), and `▲ Minimize` / `▼ Expand`.
- **Datasheet Tab**: Test your visual query immediately with 1-click execution and inspect the resulting data records side-by-side.


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
