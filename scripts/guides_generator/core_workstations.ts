import { writeFileSync } from "fs";
import { join } from "path";

export function generateCoreWorkstations(outDir: string) {
  // 01_database_studio.md
  writeFileSync(join(outDir, "01_database_studio.md"), `# 🗄️ Database Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native bun:sqlite (WAL Mode)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:database]  •  [Terminal CLI: bun run cli:database]
\`\`\`

---

## 🌟 Executive Overview
**Database Studio Pro** is a high-performance, enterprise-grade SQLite query editor, schema browser, and diagnostic workbench engineered natively on Bun's C-level \`bun:sqlite\` subsystem. It delivers desktop database management speed comparable to Delphi and native desktop database clients—with **zero external software dependencies**, zero brew installations, and instant sub-second boot times.

Whether you are debugging a local application database, inspecting complex relational foreign keys, generating synthetic test data, or benchmarking query plans before deployment, Database Studio Pro gives you a tactile, visual cockpit.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch (in-memory sandbox or active project DB)
bun run app:database

# Backwards-compatible shorthand alias
bun run app:sqlite
\`\`\`

### 2. Launch Terminal CLI Query Mode
\`\`\`bash
# Direct SQL query evaluation in terminal
bun run cli:database -f ./app.db "SELECT * FROM users LIMIT 10"

# Dump table schema directly in terminal
bun run cli:database -f ./app.db --schema
\`\`\`

### 3. Launch Programmatically in TypeScript
\`\`\`typescript
import { createDatabaseStudio } from "./applications/database_studio";

const studio = createDatabaseStudio("./production.sqlite", {
  fullscreen: false,
  width: 1400,
  height: 900
});
await studio.run();
\`\`\`

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
- **Database File Path Input**: Accepts \`:memory:\` (for temporary in-ram experiments) or absolute/relative file paths (e.g. \`./data/production.sqlite\`).
- **🔌 Connect / Switch DB Button**: Safely disconnects the current handle and mounts the target database file with \`PRAGMA journal_mode = WAL\` enabled.
- **🌱 Seed 50 Test Records Button**: Instantly provisions a mock schema (\`users\` and \`transactions\` tables) and populates 50 realistic relational rows for testing.
- **📋 DDL Schema Button**: Scans \`sqlite_master\` and renders complete, syntax-highlighted \`CREATE TABLE\` and \`CREATE INDEX\` statements.

### 3. SQL Query Editor & Diagnostic Bar
- **Multi-line SQL Editor**: Textarea with monospace font, automatic indentation, and support for multi-statement scripts, CTEs (\`WITH ...\`), and window functions.
- **⚡ Execute SQL (Ctrl/Cmd + Enter)**: Executes the query with microsecond resolution timer.
- **🔍 Explain Plan Button**: Runs \`EXPLAIN QUERY PLAN\` and generates a step-by-step breakdown of table scans vs index lookups.
- **🧹 Clear Button**: Resets query editor and data output console.

### 4. Results Grid & Telemetry Panel
- **Execution Telemetry Pill**: Displays exact row count returned and execution latency down to fractional milliseconds (e.g., \`42 rows • 0.38ms\`).
- **Dynamic Table Grid**: Interactive data grid displaying column headers, numeric alignment, null indicator badges, and scrollable rows.
- **Error Diagnostic Banner**: Displays descriptive SQLite error codes, line numbers, and constraint explanations if a query fails.

### 5. Enterprise Data Export Suite
- **📊 Export CSV**: Converts the active result grid into standardized comma-separated values for spreadsheet analysis.
- **📋 Export JSON**: Formats and copies the active result rows as clean JSON objects.
- **💾 Export SQL Inserts**: Generates a reproducible sequence of \`INSERT INTO ... VALUES (...);\` migration statements.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Inspecting an Existing Application SQLite Database
1. Open Database Studio Pro via \`bun run app:database\`.
2. In the **Database File Path** field, enter your database path: \`./my_app.sqlite\`.
3. Click **🔌 Connect / Switch DB**.
4. Click **📋 DDL Schema** to review all table schemas, primary keys, and foreign keys.
5. In the SQL Editor, type:
   \`\`\`sql
   SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'index');
   \`\`\`
6. Press \`Cmd+Enter\` (or click **⚡ Execute SQL**). Inspect your tables in the grid.

### Tutorial 2: Diagnosing Slow Queries with EXPLAIN QUERY PLAN
1. Type a query involving joins or filters:
   \`\`\`sql
   SELECT u.name, count(t.id) as orders 
   FROM users u 
   LEFT JOIN transactions t ON u.id = t.user_id 
   WHERE t.status = 'COMPLETED' 
   GROUP BY u.name;
   \`\`\`
2. Click **🔍 Explain Plan**.
3. Look at the output:
   - If you see \`SCAN TABLE users\` or \`SCAN TABLE transactions\`, you are doing a full table scan.
   - Run \`CREATE INDEX idx_transactions_user ON transactions(user_id, status);\` to add an index.
   - Run **🔍 Explain Plan** again and verify that SQLite now reports \`SEARCH TABLE transactions USING INDEX idx_transactions_user\`.

### Tutorial 3: Exporting Test Data as SQL Migrations
1. Run your query filtering target rows:
   \`\`\`sql
   SELECT * FROM users WHERE role = 'admin';
   \`\`\`
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
- **Write-Ahead Logging (WAL)**: Database Studio Pro automatically activates \`PRAGMA journal_mode = WAL;\`. This allows concurrent readers to query the database while your application writes to it, eliminating \`database is locked\` errors.
- **In-Memory Sandbox Testing**: Use \`:memory:\` as the file path to test risky \`ALTER TABLE\` or destructive updates without touching production files on disk.
- **Safe Transaction Rollbacks**: Always wrap multi-statement migrations in \`BEGIN TRANSACTION; ... COMMIT;\`. If an error occurs midway, Database Studio Pro rolls back changes automatically to maintain ACID consistency.

---

## ❓ Troubleshooting & FAQs

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Database is locked"** | Another process is holding an exclusive write lock without WAL. | Run \`PRAGMA journal_mode = WAL;\` or close other active SQLite CLI tools. |
| **"No such table"** | Database file connected is empty or path was mistyped. | Verify absolute file path using \`ls -la\` and click **DDL Schema** to confirm table presence. |
| **Large result set sluggish** | Query returned over 100,000 rows at once. | Add a \`LIMIT 1000\` clause to your query to paginate results efficiently. |

---

## 📐 Technical Architecture & Offline Resilience
- **Runtime Subsystem**: Pure \`bun:sqlite\` binary bindings directly linked into Bun's engine.
- **UI Architecture**: High-speed macOS WKWebView with hardware-accelerated CSS and virtual table DOM.
- **Zero Third-Party Binaries**: Zero requirement for \`sqlite3\` CLI, Homebrew, or external drivers. 100% offline self-contained.
`);

  // 02_system_package_studio.md
  writeFileSync(join(outDir, "02_system_package_studio.md"), `# 💻 System & Package Workstation -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Node:os & Bun Package Subsystem  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:system]  •  [Terminal CLI: bun run cli:system]
\`\`\`

---

## 🌟 Executive Overview
**System & Package Workstation** is an enterprise hardware diagnostics, memory telemetry, and package exploration control center built natively for Bun RAD Studio. It replaces external, slow package manager utilities with real-time access to machine hardware telemetry, local Bun module cache footprint analysis, and lightning-fast package search directly against the npm/bun registries.

Designed for software engineers, systems architects, and DevOps professionals, this workstation gives you complete visibility into system load, CPU architecture, memory pressure, and package dependencies in a unified cockpit.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:system

# Backwards-compatible alias
bun run app:brew
\`\`\`

### 2. Launch Terminal CLI Diagnostic Mode
\`\`\`bash
# Print machine telemetry and cache stats to terminal
bun run cli:system

# Search packages from the command line
bun run cli:system --search "express"
\`\`\`

### 3. Launch Programmatically in TypeScript
\`\`\`typescript
import { createSystemStudio } from "./applications/system_studio";

const app = createSystemStudio({ fullscreen: false });
await app.run();
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![System Workstation Desktop](../../screenshots/apps/system_studio_desktop.png) | ![System Workstation Responsive](../../screenshots/apps/system_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Hardware Telemetry Bento Grid
- **RAM Usage Gauge**: Displays total physical memory, active consumption, free buffer memory, and dynamic percentage utilization bar.
- **CPU Architecture Card**: Displays CPU model string (e.g. Apple M1/M2/M3 or Intel x86_64), core count, logical thread topology, and system architecture.
- **System Uptime Counter**: Formatted live display of system uptime (Days, Hours, Minutes, Seconds).
- **OS Platform Badge**: Shows kernel version, macOS/Darwin build number, and host architecture.

### 2. Bun Module Cache Diagnostics Panel
- **Global Cache Directory**: Displays the exact filesystem location of Bun's global package cache (\`~/.bun/install/cache\`).
- **Cache Size Footprint**: Calculates total disk space consumed by cached tarballs and unpacked module dependencies.
- **Cached Package Count**: Total count of unique dependency versions currently cached offline.
- **🧹 Clean Cache Button**: Triggers safe removal of stale, dangling packages to reclaim gigabytes of drive space.

### 3. Package Registry Explorer & Search
- **Search Package Input**: Type any keyword (e.g. \`typescript\`, \`zod\`, \`tailwind\`, \`drizzle\`).
- **🔎 Search Registry Button**: Queries registry API asynchronously with zero blocking.
- **Package Results Table**: Lists package name, latest semver version, package description, weekly downloads, license, and repository URL.
- **Install Command Generator**: Click any row to generate one-click \`bun add <package>\` installation snippets.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Checking System Memory Pressure During Heavy Builds
1. Launch the workstation: \`bun run app:system\`.
2. Observe the **RAM Usage Gauge** before starting your build or container cluster.
3. Launch your compilation or test suite in the background.
4. Watch the memory percentage bar update live; identify if your workstation is approaching swap memory pressure.

### Tutorial 2: Auditing and Cleaning Bun Package Cache
1. Open the workstation and navigate to the **Bun Module Cache** card.
2. Review the **Cache Size Footprint** (often 5GB–15GB after working on multiple projects).
3. Click **🧹 Clean Cache**.
4. The workstation safely purges orphaned packages while keeping your project-level \`node_modules\` intact.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + R** / **Ctrl + R** | Global | Refresh telemetry & metrics |
| **Cmd + F** / **Ctrl + F** | Package Search | Focus package search bar |
| **Cmd + S** / **Ctrl + S** | Window | Save window state & theme |
| **F11** or **F** | Global | Toggle borderless fullscreen |
| **Escape** | Window | Cancel search or close modal |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Zero Homebrew Dependency**: This workstation uses native \`node:os\`, \`node:v8\`, and Bun C++ APIs. It will run on a brand-new pristine macOS machine without Homebrew or Xcode command line tools installed.
- **Fast Package Discovery**: When evaluating dependencies for a new project, use the package registry search to compare download trends, bundle size impact, and open-source licenses before running \`bun add\`.

---

## ❓ Troubleshooting & FAQs

| Question | Answer |
| :--- | :--- |
| **Why is cache size showing 0 bytes?** | You have not yet run \`bun install\` or \`bun add\` on this user profile. Once you install any package, Bun populates its global cache. |
| **Does Clean Cache break my existing projects?** | No. Your project's local \`node_modules\` directory contains all installed files. Cleaning the global cache only frees up downloaded tarballs. |
`);

  // 03_task_watcher_studio.md
  writeFileSync(join(outDir, "03_task_watcher_studio.md"), `# ⏱️ Task Watcher Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native fs.watch & Bun.spawn  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:watcher]  •  [Terminal CLI: bun run cli:watcher]
\`\`\`

---

## 🌟 Executive Overview
**Task Watcher Studio** is an ultra-fast, native filesystem watcher, automated test runner, and task execution workstation. Engineered on top of Node's recursive \`fs.watch\` primitive and \`Bun.spawn\`, it completely eliminates heavyweight third-party watcher dependencies like \`chokidar\` or \`watchexec\`.

It provides sub-millisecond file change detection, smart debounce buffers, customizable extension white-lists, directory exclusion rules, and a streaming desktop console with microsecond execution timings.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:watcher

# Shorthand alias
bun run app:watch
\`\`\`

### 2. Launch Terminal CLI Watcher Mode
\`\`\`bash
# Watch current directory and run tests on save
bun run cli:watcher -d ./src -e "bun test"

# Watch with specific extension filters
bun run cli:watcher -d ./ -x "ts,js,json" -e "bun run build"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Task Watcher Desktop](../../screenshots/apps/watcher_studio_desktop.png) | ![Task Watcher Responsive](../../screenshots/apps/watcher_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Watch Target Configuration Bar
- **Watch Directory Path**: Input folder to monitor recursively (e.g. \`./src\`, \`./applications\`, or absolute path).
- **Execution Command**: Shell command to trigger whenever a matching file changes (e.g., \`bun test\`, \`bun run build\`, \`tsc --noEmit\`).
- **File Extensions Filter**: Comma-separated list of extensions to monitor (e.g., \`ts,tsx,js,json,css,html\`).
- **Ignore Patterns**: Comma-separated list of paths or subdirectories to ignore (e.g. \`node_modules,.git,dist,.temp,build\`).
- **Debounce Delay (ms)**: Debounce buffer window (default \`300ms\`) to coalesce rapid multi-file IDE saves into a single run.

### 2. Execution Control Panel
- **▶ Start Watching Button**: Starts the native background recursive file watcher.
- **⏹ Stop Watching Button**: Gracefully stops the watcher and clears active timeouts.
- **⚡ Trigger Now Button**: Manually forces an immediate execution of the configured command without touching files.
- **🧹 Clear Console Button**: Wipes the streaming terminal output log.

### 3. Live Streaming Terminal Console
- **Output Window**: High-contrast, dark-mode terminal screen streaming \`stdout\` and \`stderr\` from the spawned process.
- **Status Badges**: Shows whether the last execution passed (green check) or failed with non-zero exit code (red alert).
- **Execution History Table**: Records timestamp, changed file path, event type (\`change\`, \`rename\`, \`add\`), and process duration in milliseconds.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Setting Up Instant Test-Driven Development (TDD)
1. Launch Task Watcher Studio: \`bun run app:watcher\`.
2. Set **Watch Directory**: \`./src\`.
3. Set **Execution Command**: \`bun test\`.
4. Set **File Extensions**: \`ts,tsx\`.
5. Set **Ignore Patterns**: \`node_modules,dist,.git\`.
6. Click **▶ Start Watching**.
7. Edit any test file in your editor and hit save. Task Watcher Studio instantly captures the event, runs your test suite, and displays colored terminal output in the GUI.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Space** / **Enter** | Toolbar | Toggle Watcher Start/Stop |
| **Cmd + T** / **Ctrl + T** | Toolbar | Trigger Command Immediately |
| **Cmd + K** / **Ctrl + K** | Console | Clear execution log |
| **Cmd + S** / **Ctrl + S** | Window | Save watcher presets |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Tune Debounce for IDEs**: Modern IDEs like VS Code often perform multi-stage saves (temp file write, rename, formatting). Setting debounce to \`250ms–350ms\` prevents duplicate execution runs.
- **Ignore Heavy Folders**: Always include \`node_modules\` and \`.git\` in your ignore list to save CPU cycles and prevent spurious file event storms.
`);

  // 04_json_query_studio.md
  writeFileSync(join(outDir, "04_json_query_studio.md"), `# 🔍 JSON Query Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Pure TypeScript/Bun AST Query Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:json]  •  [Terminal CLI: bun run cli:json]
\`\`\`

---

## 🌟 Executive Overview
**JSON Query Studio Pro** is an enterprise-grade JSON inspection, transformation, projection, and formatting workbench. Powered by a pure TypeScript recursive query evaluation engine, it provides rich, \`jq\`-compatible selector syntax without requiring Homebrew, C compilers, or external \`jq\` binaries.

It handles multi-megabyte payloads effortlessly, supports nested path extraction, array slicing, dictionary projections, key sorting, and minification, complete with one-click export to clipboard or disk.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:json

# Shorthand alias
bun run app:jq
\`\`\`

### 2. Launch Terminal CLI Query Mode
\`\`\`bash
# Query JSON file directly in terminal
bun run cli:json package.json ".scripts"

# Filter array of objects in terminal
bun run cli:json data.json ".users[] | {name: .name, email: .email}"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![JSON Studio Desktop](../../screenshots/apps/json_studio_desktop.png) | ![JSON Studio Responsive](../../screenshots/apps/json_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Query Configuration & Selector Bar
- **Query Expression Input**: Type your selector (e.g. \`.\`, \`.users[]\`, \`.data.items[0:5]\`, \`keys\`, \`length\`).
- **Presets Dropdown**: Pre-built one-click queries:
  - Identity (\`.\`)
  - Top-Level Keys (\`keys\`)
  - Array Length (\`length\`)
  - First 5 Items (\`.[0:5]\`)
  - Key-Value Projection (\`.[] | {id: .id, name: .name}\`)
- **⚡ Execute Query Button**: Runs the evaluation in microseconds.

### 2. Dual-Pane JSON Workspace
- **Source JSON Editor (Left Pane)**: Multi-line text area with syntax validation, line numbers, sample payload loader, and file upload button.
- **Transformed Result Output (Right Pane)**: Formatted, color-highlighted output viewer displaying filtered results.
- **Telemetry Pill**: Displays input byte size, result byte size, and query execution time in microseconds.

### 3. Formatting & Utility Toolbar
- **Format / Pretty-Print**: Re-indents the active JSON with standardized 2-space indentation.
- **Minify / Compact**: Strips all whitespace, tabs, and newlines for optimized network payloads.
- **📋 Copy Result**: Copies transformed JSON to clipboard with tactile feedback.
- **💾 Export File**: Saves output directly to disk.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Filtering and Re-Projecting an API Response
1. Paste this JSON payload into the left editor:
   \`\`\`json
   {
     "status": "success",
     "users": [
       { "id": 1, "name": "Alice", "role": "admin", "secret": "x99" },
       { "id": 2, "name": "Bob", "role": "developer", "secret": "y44" }
     ]
   }
   \`\`\`
2. In the query bar, type:
   \`\`\`text
   .users[] | {id: .id, name: .name}
   \`\`\`
3. Press **Cmd+Enter**. The output instantly displays:
   \`\`\`json
   [
     { "id": 1, "name": "Alice" },
     { "id": 2, "name": "Bob" }
   ]
   \`\`\`
   Notice the \`secret\` field is stripped cleanly!

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Query Bar / Editor | Execute active query |
| **Cmd + P** / **Ctrl + P** | Left Editor | Format / Pretty-Print JSON |
| **Cmd + M** / **Ctrl + M** | Left Editor | Minify JSON |
| **Cmd + Shift + C** | Output Pane | Copy result to clipboard |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Validating Broken JSON**: If an API returns malformed JSON, paste it into the left editor and hit **Format**. The diagnostic banner points to the exact line and character where a trailing comma or missing quote occurred.
- **Large Dataset Slicing**: When inspecting large 50MB log dumps, use array slice notation \`.[0:10]\` to examine sample records without locking up your browser.
`);

  // 05_devtools_studio.md
  writeFileSync(join(outDir, "05_devtools_studio.md"), `# 🛠️ DevTools Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: 6-in-1 Native Bun Subsystems  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:devtools]  •  [Terminal CLI: bun run cli:devtools]
\`\`\`

---

## 🌟 Executive Overview
**DevTools Studio Pro** is a unified 6-in-1 developer workstation combining the most essential day-to-day command-line developer utilities into a single high-speed desktop interface. Powered by pure Bun and Node subsystem primitives, it replaces 6 separate CLI packages (\`ripgrep\`, \`fd\`, \`sd\`, \`watchexec\`, \`rm-improved/rip\`, and \`jq\`) with **zero external binary requirements**.

Instead of switching between disjointed terminal tabs and memorizing conflicting flags, DevTools Studio Pro gives developers a cohesive GUI cockpit for searching, replacing, watching, querying, and managing project files.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:devtools

# Shorthand alias
bun run app:omnitool
\`\`\`

### 2. Launch Terminal CLI Multi-Tool
\`\`\`bash
# Search using ripgrep mode
bun run cli:devtools search "TODO" ./src

# Find files using fd mode
bun run cli:devtools find "*.test.ts"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![DevTools Studio Desktop](../../screenshots/apps/devtools_studio_desktop.png) | ![DevTools Studio Responsive](../../screenshots/apps/devtools_studio_responsive.png) |

---

## 🧭 The 6 Integrated Developer Engines

| Mode | Engine Name | Replaces Tool | Primary Use Case |
| :-: | :--- | :--- | :--- |
| **1** | **Ripgrep (rg)** | \`rg\` (ripgrep) | Ultra-fast recursive regex pattern search across codebases. |
| **2** | **Fd Search** | \`fd\` (fd-find) | Lightning-fast glob/regex file & folder discovery. |
| **3** | **Sd Replace** | \`sd\` (sed alternative) | Interactive regex find-and-replace with live visual diffs. |
| **4** | **Rip Graveyard** | \`rip\` (rm-improved) | Safe file deletion with quarantine graveyard & unbury recovery. |
| **5** | **Watchexec** | \`watchexec\` / \`chokidar\` | Automated task runner triggering tests/builds on file save. |
| **6** | **JQ Query** | \`jq\` CLI | High-speed JSON inspection, projection, and formatting. |

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Switching Between Ripgrep and Sd in One Workspace
1. Launch DevTools Studio Pro: \`bun run app:devtools\`.
2. Select **Ripgrep (rg)** mode from the top navigation tabs.
3. Search for \`oldApiEndpoint\` across \`./src\`. Notice matching lines appear with file paths and line numbers.
4. Switch to **Sd Replace** mode.
5. Enter \`oldApiEndpoint\` in Find and \`newSecureApiEndpoint\` in Replace.
6. Review the unified diff preview showing green additions and red deletions.
7. Click **Apply Replacement** to update files safely with automatic \`.bak\` backups.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + 1..6** / **Ctrl + 1..6** | Global | Switch directly between the 6 engine modes |
| **Cmd + Enter** / **Ctrl + Enter** | Active Mode | Execute search, replace, or query |
| **Cmd + K** / **Ctrl + K** | Active Mode | Clear results table |
| **Cmd + S** / **Ctrl + S** | Window | Save window configuration |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Zero Toolchain Drift**: Because DevTools Studio Pro uses self-contained Bun primitives, your entire engineering team shares identical search, replace, and watch behavior across macOS (Apple Silicon & Intel), Linux, and Windows.
`);

  // 06_process_monitor_studio.md
  writeFileSync(join(outDir, "06_process_monitor_studio.md"), `# 📊 Process Monitor Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native macOS ps / sysinfo Subsystem  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:process]  •  [Terminal CLI: bun run cli:process]
\`\`\`

---

## 🌟 Executive Overview
**Process Monitor Studio** is an enterprise-grade desktop system task manager and process telemetry workstation built natively for Bun RAD Studio. Designed as a developer-focused alternative to macOS Activity Monitor and Linux \`htop\`, it provides live process inspection, PID search, CPU% and RSS memory telemetry, listening socket discovery, and safe process termination signals (\`SIGTERM\`, \`SIGKILL\`).

It allows developers to instantly pinpoint runaway development servers, orphan background tasks, memory leaks, and port conflicts without navigating cryptic terminal commands.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:process

# Shorthand alias
bun run app:procs
\`\`\`

### 2. Launch Terminal CLI Process Inspector
\`\`\`bash
# List top CPU processes in terminal
bun run cli:process --top cpu

# Search process by name or PID
bun run cli:process --search "node"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Process Monitor Desktop](../../screenshots/apps/process_studio_desktop.png) | ![Process Monitor Responsive](../../screenshots/apps/process_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Real-time Telemetry Status Bar
- **Total Process Count**: Live tally of active system processes.
- **Aggregated CPU Load**: Overall user and system CPU load percentage.
- **Physical Memory Bar**: System-wide RAM consumption and available buffer space.
- **Auto-Refresh Switcher**: Toggle polling intervals (1s, 2s, 5s, or Manual Pause).

### 2. Process Search & Filter Toolbar
- **Search Process / PID Input**: Real-time filtering by process name, command arguments, or numeric PID.
- **Sort Dropdown**: Sort by CPU (High to Low), Memory/RSS (High to Low), PID, or Name.
- **User Mode Toggle**: Filter between "All System Processes" and "My User Processes Only".

### 3. Interactive Process Data Table
- **PID**: Process Identification number.
- **User / Owner**: Operating system user account executing the task.
- **CPU %**: Real-time CPU core utilization.
- **RSS Memory**: Resident Set Size physical memory consumption formatted in MB/GB.
- **Command / Path**: Full binary path and invocation arguments.
- **Action Buttons**: One-click **Terminate (SIGTERM)** and **Force Kill (SIGKILL)** buttons.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Finding and Killing a Stale Server Holding a Port
1. Launch Process Monitor Studio: \`bun run app:process\`.
2. In the search bar, type the name of your server runtime: \`bun\` or \`node\`.
3. Locate the rogue process in the filtered list.
4. Review the **RSS Memory** and **CPU%** columns to confirm it is the orphaned task.
5. Click **Terminate (SIGTERM)** to shut it down gracefully.
6. If the process does not terminate within 3 seconds, click **Force Kill (SIGKILL)** to release the port immediately.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + F** / **Ctrl + F** | Toolbar | Focus process search bar |
| **Cmd + R** / **Ctrl + R** | Global | Force immediate process list refresh |
| **Cmd + K** / **Ctrl + K** | Selected Row | Send SIGTERM signal |
| **Cmd + Shift + K** | Selected Row | Send SIGKILL signal |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Graceful vs Force Kill**: Always attempt \`SIGTERM\` (Terminate) first. This allows databases (like SQLite or Postgres) and node apps to flush writes to disk and close open sockets cleanly before exiting.
`);

  console.log("✔ Core Workstations (01 to 06) generated with AAA quality.");
}
