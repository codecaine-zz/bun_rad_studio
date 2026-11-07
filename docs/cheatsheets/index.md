# RAD development cheatsheets

Fast, beginner-friendly reference guides and full-featured workspace templates for building desktop applications, command-line tools, SQLite-backed utilities, and REST services with **Bun RAD Studio**. Every section is written in plain English with self-contained code examples so you can learn and build right from the cheat sheet.

> [!TIP]
> **Single-File Master Cheat Sheet:** A combined all-in-one version of all three guides, pro tips, and runnable workspace templates is also available at the repository root in [`CHEATSHEET.md`](../../CHEATSHEET.md).

---

## How Bun RAD Studio works in 60 seconds

Instead of wiring up complex HTML/CSS build pipelines, frontend bundlers, or dozens of `npm` packages, Bun RAD Studio gives you **3 simple building blocks** that work in a single TypeScript file:

1. **🪟 `SimpleGUI` (`src/simplegui.ts`) — For Desktop Apps:** Create a window (`newSimpleWindow`), add controls top-to-bottom (`addHeading`, `addTextInput`, `addTable`, `addButton`), give inputs an `.id("myId")` so you can read them with `win.getText("myId")` or update them with `win.setText("myId", "val")`, and call `win.run()` on the last line.
2. **⌨️ `SimpleCLI` (`src/simplecli/`) — For Terminal & Backend Tools:** Create a CLI app (`newApp`), register typed `--flags` (`addFlagString`, `addFlagBool`), print formatted tables/charts (`app.table`, `app.barChart`), ask interactive terminal questions (`app.prompt`, `app.select`), run OS commands (`sys`), or call REST APIs (`createApiClient`).
3. **🧰 `45 rad Modules` + `10 System Tools` (`src/features/rad/`) — Your Built-In Batteries:** Import `rad` once to get zero-setup SQLite (`rad.sqliteutils`), JSON/CSV/ZIP file helpers (`rad.fileutils`, `rad.archiveutils`), array/object helpers (`rad.arrutils`, `rad.objutils`), password/JWT crypto (`rad.cryptoutils`, `rad.jwtutils`), and fast file/code search (`fd`, `tokei`, `procs`, `doggo`).

---

## Cheatsheet catalog

| Cheatsheet | What it covers | Best for |
| :--- | :--- | :--- |
| **[SimpleGUI Desktop RAD Cheat Sheet](simplegui-cheatsheet.md)** | Step-by-step window creation, layouts (`beginRow`, `beginGrid`, `beginCard`), **tabs & view switching**, **live search filtering**, **charts & telemetry**, 100+ controls, 35 enterprise components, reactive state, 133 themes, menus, SweetAlert2 `fire()`, file pickers, pro tips, and a **full Studio Workspace Template**. | Building cross-platform desktop GUI apps in TypeScript |
| **[SimpleCLI Console & Backend Cheat Sheet](simplecli-cheatsheet.md)** | Step-by-step CLI flags, subcommands, ANSI tables, sparklines, bar charts, trees, diffs, interactive prompts, fuzzy selectors, console form wizards, multi-step pipelines, `sys` hardware/network/OS helpers, `ApiClient` REST CRUD, Redis cache-aside, pro tips, and a **full CLI Workspace Template**. | Building terminal tools, DevOps pipelines, and headless services |
| **[45 RAD Utility Modules & 10 System Tools Cheat Sheet](rad-modules-cheatsheet.md)** | Plain-English purpose + copy-paste examples for all 45 `rad.*` modules (`fileutils`, `sqliteutils`, `tomlutils`, `arrutils`, `objutils`, `strutils`, `cryptoutils`, `serverutils`, `globutils`, `shellutils`, `hashutils`, etc.) plus all 10 system tools (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`). | Eliminating boilerplate across file I/O, SQLite, collections, crypto, and system automation |

---

## Quick "How do I...?" RAD decision matrix

| Goal | Recommended API | Copy-Paste Snippet |
| :--- | :--- | :--- |
| **Open a desktop window** | `newSimpleWindow` | `const win = newSimpleWindow("App", 900, 620, { theme: "apple_dark" });` |
| **Place controls side by side** | `beginRow` / `endRow` | `win.beginRow(); win.addLabel("Name:"); win.addTextInput().id("t"); win.endRow();` |
| **Create a multi-column grid** | `beginGrid` / `endGrid` | `win.beginGrid(3, 16); /* controls */ win.endGrid();` |
| **Group controls in a card** | `beginCard` / `endCard` | `win.beginCard("Profile", "Subtitle"); /* controls */ win.endCard();` |
| **Add a labeled input in 1 line** | `addFormField` | `win.addFormField("Email:", "txtEmail", "ada@example.com");` |
| **Add tabs & switch views** | `.bindViews(viewsMap)` | `win.addTabs(["Tasks", "Charts"], 0).bindViews({ Tasks: ["tbl"], Charts: ["crt"] });` |
| **Filter a table on every keystroke** | `bindTableFilter` / `.filterTable` | `win.bindTableFilter("txtSearch", "tbl", () => rows, { countControlId: "bdg" });` |
| **Populate form on table row click** | `bindMasterDetail` | `win.bindMasterDetail("tbl", ["txtId", "txtName", "cmbRole"]);` |
| **Validate a form in 1 line** | `validateForm` | `const { valid, errors } = win.validateForm({ txtEmail: { required: true } });` |
| **Export table to CSV / JSON** | `exportTableCsv` / `exportTableJson` | `const csv = win.exportTableCsv("tbl"); const json = win.exportTableJson("tbl");` |
| **Render live charts & gauges** | `addChart` / `addDonutChart` | `win.addChart("crt", "line", 140); win.setChartData("crt", [10, 40, 85]);` |
| **Two-way bind a control to state** | `.bindState(key)` | `win.addTextInput("Name").id("txtName").bindState("username");` |
| **Add a live 133-theme switcher** | `addThemeSelector` | `win.addThemeSelector("dd_theme", "Theme:");` |
| **Show a rich confirmation modal** | `win.fire(opts, cb)` | `win.fire({ title: "Deploy?", icon: "question", showCancelButton: true }, cb);` |
| **Pick a file or folder in-window** | `open_webview_file_dialog` | `win.open_webview_file_dialog("Open File", ".json", (p) => {});` |
| **Parse typed CLI flags** | `SimpleCLI` | `app.addFlagString("env", "e", "dev", "Environment").parseCli();` |
| **Query SQLite with WAL + FTS5** | `rad.sqliteutils` | `const db = rad.sqliteutils.openDb("app.db"); rad.sqliteutils.queryAll(db, sql);` |
| **Scan files with `Bun.Glob`** | `rad.globutils` | `const files = await rad.globutils.findFiles("**/*.ts", "./src");` |
| **Compile to a standalone binary** | `bun build --compile` | `bun build --compile examples/rad_tutorial/01_quickstart.ts --outfile my-app` |

---

## Top 10 pro RAD tips and tricks (In plain English)

1. **1-Line Tab Switching (`.bindViews`)**: Instead of manually hiding and showing controls when a user clicks a tab, chain `.bindViews({ "Tab 1": ["cardA", "tblA"], "Tab 2": ["cardB"] })` onto `win.addTabs(...)`.
2. **1-Line Live Table Search (`.filterTable` & `.debounceChange`)**: Chain `.filterTable("tblUsers")` onto `win.addSearchInput(...)` for instant in-memory search, or `.debounceChange(200, (w, q) => ...)` when querying SQLite so the UI stays smooth while typing fast.
3. **Batch Multiple UI Updates (`win.batchUpdate`)**: When a timer or search callback updates several labels, tables, and charts at once, wrap them in `win.batchUpdate((w) => { ... })` so they render in a single WebView frame.
4. **Prevent Accidental Double-Clicks (`win.withBusyState`)**: Wrap async button work in `await win.withBusyState(["btnSave"], "⏳ Saving...", async (ctx) => { ... })`. It disables the button while running and re-enables it automatically even if an error occurs.
5. **1-Line Form Validation (`win.validateForm`)**: Check required fields, min/max numbers, and email formatting in one call—and jump the user's cursor straight to the first invalid field with `win.focus(res.firstInvalidId!)`.
6. **Auto-Save User Inputs & Themes (`autoSaveState: true`)**: Pass `{ autoSaveState: true, appId: "my_app" }` to `newSimpleWindow` (or call `win.enableAutoSave()`) so the user's theme and form values are restored automatically next time they open the app.
7. **Dual-Mode Terminal + JSON Output (`app.output`)**: In SimpleCLI, `app.output(rows)` prints a formatted Unicode table when run by a human in a terminal, and automatically prints clean JSON when piped (`my-cli | jq`) or when `--json` is passed.
8. **Never Crash on Network or Command Errors (`tryGet` & `execSafe`)**: Use `await api.tryGet("/status")` (`if (res.ok)`) and `await sys.execSafe(["git", "status"])` instead of deeply nested `try / catch` blocks.
9. **50x Faster Bulk SQLite Inserts (`rad.sqliteutils.insertMany`)**: When inserting multiple rows into SQLite, use `rad.sqliteutils.insertMany(db, "tasks", rows)` to run all inserts inside a single WAL transaction.
10. **Test Desktop Windows Headlessly in `bun test`**: Export a function that creates and returns your `SimpleWindow` (`export function createApp()`), guard `win.run()` with `if (import.meta.main)`, and test clicks/typing in milliseconds using `await win.triggerClick("btnSave")` and `await win.triggerChange("txtSearch", "query")`.

---

## Complete main documentation reference map

Every cheat sheet is self-contained for daily development. When you want to explore full architectural diagrams, edge-case options, or step-by-step tutorials, jump to these main handbook guides:

| Topic | Primary Reference | Related Deep-Dive Guides |
| :--- | :--- | :--- |
| **SimpleGUI Desktop UI** | **[`docs/SIMPLEGUI_API.md`](../SIMPLEGUI_API.md)** | [Quick Start](../SIMPLEGUI_API.md#quick-start) · [Controls Reference](../SIMPLEGUI_API.md#controls-reference) · [Layouts](../SIMPLEGUI_API.md#layout-systems) · [Enterprise Widgets](../SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have) |
| **SimpleCLI Console & Backend** | **[`docs/CLI_API.md`](../CLI_API.md)** | [CLI Flags](../CLI_API.md#2-cli-flags--argument-parsing) · [Interactive Prompts](../CLI_API.md#4-interactive-prompts-menus--input-validation) · [HTTP & Micro-Server](../CLI_API.md#15-http-client-micro-server--rest-apis) |
| **45 `rad` Utility Modules** | **[`src/features/rad/README.md`](../../src/features/rad/README.md)** | [File & SQLite](../../src/features/rad/README.md#1-file--storage-8-modules) · [Collections](../../src/features/rad/README.md#2-data-structures--collections-8-modules) · [Concurrency](../../src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules) |
| **10 System Utilities (`fd`..`doggo`)** | **[`docs/SYSTEM_UTILITIES_API.md`](../SYSTEM_UTILITIES_API.md)** | [User Guides Master Hub](../userguides/README.md) · [`fd`](../../src/features/fd/README.md) · [`tokei`](../../src/features/tokei/README.md) · [`procs`](../../src/features/procs/README.md) |
| **Databases (SQLite, PG, MySQL, Redis)** | **[`docs/databases/index.md`](../databases/index.md)** | [Complete Databases Guide](../databases/complete-databases-guide.md) · [Workbench](../databases/workbench.md) · [SQLite Studio](../userguides/01_sqlite_studio.md) · [Postgres Studio](../userguides/42_postgres_studio.md) · [MySQL Studio](../userguides/41_mysql_studio.md) · [Redis Studio](../userguides/40_redis_studio.md) |
| **Visual Form Designer & `FormSpec`** | **[`docs/visual-designer/index.md`](../visual-designer/index.md)** | [FormSpec & Runtime API (`docs/API.md`)](../API.md) · [Generated Applications](../generated-applications/index.md) · [Declarative Module](../API.md#10-simplegui-declarative-module-reference) |
| **133 Themes & 12 FX Shaders** | **[`docs/THEMES.md`](../THEMES.md)** | [Futuristic FX Shaders](../developer/fx-themes.md) · [Universal Theme Persistence](../SIMPLEGUI_API.md#universal-theme-persistence) |
| **Studios, Testing & Packaging** | **[`docs/developer/handbook.md`](../developer/handbook.md)** | [Application Index](../reference/application-index.md) · [Architecture](../developer/architecture.md) · [Testing Guide](../testing/index.md) · [Releasing Binaries](../developer/releasing.md) · [Troubleshooting](../troubleshooting.md) |

---

## Runnable tutorial & template programs

Run any of the step-by-step tutorial programs or the full workspace template directly from the repository root:

```bash
# Step-by-step RAD tutorial examples
bun run examples/rad_tutorial/01_quickstart.ts
bun run examples/rad_tutorial/02_layout.ts
bun run examples/rad_tutorial/03_controls.ts
bun run examples/rad_tutorial/04_state.ts
bun run examples/rad_tutorial/05_dialogs_menus.ts
bun run examples/rad_tutorial/06_themes.ts
bun run examples/rad_tutorial/07_contacts.ts
bun run examples/rad_tutorial/08_parity_and_extended.ts
bun run examples/rad_tutorial/09_sweetalert_and_menus.ts
bun run examples/rad_tutorial/10_rad_modules.ts
bun run examples/rad_tutorial/11_system_tools.ts

# Full-featured Studio Workspace Template (Tabs + Live Search + SQLite + Charts + Dialogs)
bun run examples/rad_tutorial/12_full_studio_workspace_template.ts

# All 10 System Utilities + 45 RAD Modules Cookbook
bun run rad:cookbook
```
