# RAD development cheatsheets

Fast, zero-jargon onboarding and reference guides for building desktop applications, command-line tools, SQLite-backed utilities, and HTTP services with **Bun RAD Studio**. Every section is written in plain English so complete beginners and experienced TypeScript developers have zero questions left.

> [!TIP]
> **Single-file master reference:** Prefer one combined file with all cheat sheets and complete workspace templates? See [`CHEATSHEET.md`](../../CHEATSHEET.md) at the repository root.

## Contents

- [What Bun RAD Studio is](#what-bun-rad-studio-is)
- [Your first 5 minutes](#your-first-5-minutes)
- [The 3 import scenarios](#the-3-import-scenarios)
- [Cheatsheet catalog](#cheatsheet-catalog)
- [Which tool should I use](#which-tool-should-i-use)
- [How do I decision matrix](#how-do-i-decision-matrix)
- [Top 15 pro RAD tips and tricks](#top-15-pro-rad-tips-and-tricks)
- [Quick beginner FAQ](#quick-beginner-faq)
- [Runnable tutorial and cookbook commands](#runnable-tutorial-and-cookbook-commands)
- [Complete main handbook reference map](#complete-main-handbook-reference-map)

---

## What Bun RAD Studio is

**RAD** stands for **Rapid Application Development**. Instead of wiring up HTML/CSS build pipelines, React state managers, Electron bundlers, or dozens of third-party packages, Bun RAD Studio lets you build desktop apps, terminal utilities, and local databases in a single TypeScript file.

Three plain-English concepts power the stack:

- **Bun** is an all-in-one JavaScript and TypeScript runtime. It runs `.ts` files directly without a separate compile step and includes a fast built-in SQLite engine (`bun:sqlite`), package installer (`bun install`), test runner (`bun test`), and standalone executable compiler (`bun build --compile`).
- **WebView desktop windows** are native operating-system window frames (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux) that render lightweight UI directly from your TypeScript code—without bundling a separate Chromium browser.
- **CLI tools** (command-line tools) are programs that run in your terminal, automated scripts, or CI (Continuous Integration) pipelines with no window system required.

Everything in Bun RAD Studio is built on **3 building blocks** that work independently or together:

1. **`SimpleGUI` (`src/simplegui.ts`) — Desktop Windows:** Create a window (`newSimpleWindow`), add widgets top-to-bottom or in auto-closing layouts (`win.row`, `win.card`, `win.grid`), assign an `.id("myId")` to read or update controls (`win.getText("myId")`, `win.setText("myId", "val")`), and launch with `win.run()`.
2. **`SimpleCLI` (`src/simplecli/`) — Terminal and Backend Tools:** Create a CLI app (`newApp`), register typed `--flags` and subcommands, emit human tables in a terminal or JSON when piped (`app.output`), ask interactive questions (`app.prompt`, `app.select`), query OS telemetry (`sys`), or call REST APIs (`createApiClient`).
3. **`45 rad Modules` and `10 System Tools` (`src/features/rad/`) — Built-in Batteries:** Import `rad` once for 45 utility modules (`44` core modules plus the `sliceutils` alias for `arrutils`), covering SQLite WAL/FTS5 (`rad.sqliteutils`), JSON/CSV/ZIP files (`rad.fileutils`, `rad.archiveutils`), arrays/objects (`rad.arrutils`, `rad.objutils`), passwords/JWT (`rad.cryptoutils`, `rad.jwtutils`), `Bun.Glob` (`rad.globutils`), and `Bun.serve` routing (`rad.serverutils`), plus 10 system tools (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`).

```text
*Conceptual diagram*
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BUN RAD STUDIO STACK                               │
├────────────────────────┬───────────────────────────┬─────────────────────────┤
│ SimpleGUI              │ SimpleCLI                 │ 45 rad Modules + Tools  │
│ - Desktop WebView UI   │ - Flags and subcommands   │ - fileutils / sqlite    │
│ - Scoped/paired layout │ - Tables, charts, diffs   │ - arrutils / objutils   │
│ - Tabs, search, charts │ - Prompts and wizards     │ - strutils / cryptoutils│
│ - 310 themes (167 FX)  │ - sys, stdlib, ApiClient  │ - glob, shell, serve    │
│ - State & OS save      │ - Redis fallback & pipes  │ - 10 System CLI tools   │
└────────────────────────┴───────────────────────────┴─────────────────────────┘
```

---

## Your first 5 minutes

Before starting, check that Bun is installed (see [Requirements](../getting-started/requirements.md) and [Install and first launch](../getting-started/install-and-first-launch.md)):

```bash
bun --version
```

### Run an existing tutorial window

Run this command from the cloned repository root:

```bash
bun run examples/rad_tutorial/01_quickstart.ts
```

What appears on screen: a `760x520` dark-themed native desktop window titled **My First Desktop App** with a heading, a **User Authentication** card containing **Username** and **Password** inputs, and a blue **Login** button that opens an in-window greeting dialog when clicked.

### Write a 6-line desktop window (`app.ts`)

Create a file named `app.ts` at the repository root:

```typescript
import { newSimpleWindow } from "./src/simplegui";

const win = newSimpleWindow("Hello RAD", 520, 320, { theme: "apple_dark" });
win.addHeading("Hello!", "Your first desktop window");
win.addTextInput("Enter your name").id("txtName");
win.addButton("Say Hi", (w) => w.info("Hi!", `Hello ${w.getText("txtName") || "Friend"}!`));
win.run();
```

Run it from the repository root:

```bash
bun run app.ts
```

What appears on screen: a `520x320` windowed desktop app (passing explicit width and height sets `fullscreen: false` automatically) showing the heading, an input box with placeholder `"Enter your name"`, and a **Say Hi** button that opens an info dialog greeting whatever name you typed.

### Write a 6-line CLI tool (`app.ts`)

Replace `app.ts` at the repository root with this headless terminal example:

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("greet", "1.0.0").addFlagString("name", "n", "World", "Who to greet");
if (!app.parseCli()) process.exit(0);
app.success(`Hello, ${app.getFlagString("name")}!`);
app.output([{ name: app.getFlagString("name"), runtime: `Bun ${Bun.version}` }]);
```

Run it from the repository root:

```bash
bun run app.ts --name Ada
```

What appears in your terminal: a green success line (`Hello, Ada!`) followed by a Unicode table—or clean JSON if stdout is piped (for example `bun run app.ts --name Ada | cat`). You also get `--help` and `--version` automatically.

### Write a dual-mode GUI and CLI app in one file (`app.ts`)

Because **SimpleGUI**, **SimpleCLI**, and **`rad`** share the same Bun runtime, one pure TypeScript function (`analyzeProject`) can power both a terminal/JSON report and an interactive desktop window in ~25 lines:

```typescript
import { newSimpleWindow } from "./src/simplegui";
import { newApp, sys } from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";

async function analyzeProject(dir: string) {
  const files = await rad.globutils.findFiles("**/*.ts", dir);
  return { directory: dir, tsFiles: files.length, platform: sys.osPlatform(), cpus: sys.cpuCount() };
}

const app = newApp("project-scan", "1.0.0")
  .addFlagBool("cli", "c", false, "Print report to terminal or JSON pipe")
  .addFlagBool("json", "j", false, "Force JSON output")
  .addFlagString("dir", "d", "./src", "Directory to scan");
if (!app.parseCli()) process.exit(0);

const report = await analyzeProject(app.getFlagString("dir"));
if (app.getFlagBool("cli") || app.getFlagBool("json") || !process.stdout.isTTY) {
  app.output([report], { title: "Project Summary" });
} else {
  const win = newSimpleWindow("Project Analyzer", 640, 380, { theme: "apple_dark" });
  win.addHeading("Project Summary", `${report.directory} (${report.platform})`);
  win.addTable("tblStats", ["Directory", "TS Files", "OS", "CPUs"], [[report.directory, report.tsFiles, report.platform, report.cpus]]);
  win.addLabel(`Found ${report.tsFiles} TypeScript files`).id("lblCount");
  win.addButton("Re-scan", async (w) => {
    const fresh = await analyzeProject(app.getFlagString("dir"));
    w.setTableRows("tblStats", [[fresh.directory, fresh.tsFiles, fresh.platform, fresh.cpus]]);
    w.setText("lblCount", `Found ${fresh.tsFiles} TypeScript files`).toast("Updated");
  });
  win.run();
}
```

Run the exact same file either as a GUI desktop app or a scriptable CLI:

```bash
bun run app.ts             # Opens native 640x380 desktop window
bun run app.ts --cli       # Prints Unicode summary table in terminal
bun run app.ts --cli | cat # Switches automatically to JSON when piped
```

> **Note – verification scope:** Every TypeScript example, `D-027` alias snippet, mini-recipe, and API symbol in this hub was verified against TypeScript source, syntax-checked with `Bun.Transpiler` / `tsc --noEmit`, and executed headlessly on macOS (Bun 1.4.4). Native desktop window rendering is documented from `examples/rad_tutorial/01_quickstart.ts` and [Install and first launch](../getting-started/install-and-first-launch.md).

---

## The 3 import scenarios

Almost every `"Cannot find module"` error comes from using a repo-root import path inside a nested folder—or vice versa. Pick the column that matches **where your script lives**:

| What you need | Installed via `bun add bun-rad-studio` | Script at repo root (`app.ts`) | Script in a subfolder (`examples/rad_tutorial/`) |
| :--- | :--- | :--- | :--- |
| **`SimpleGUI` + `SimpleCLI` (+ `rad` in repo)** | `import { newApp, createWindow, sys, stdlib } from "bun-rad-studio";` | `import { newApp, newSimpleWindow, rad } from "./src";` | `import { newApp, newSimpleWindow, rad } from "../../src";` |
| **`SimpleGUI` only (lightweight desktop import)** | `import { newSimpleWindow, createWindow, listThemes } from "bun-rad-studio/simplegui";` | `import { newSimpleWindow } from "./src/simplegui";` | `import { newSimpleWindow } from "../../src/simplegui";` |
| **`SimpleCLI` only (zero-window CLI import)** | `import { newApp, sys, createApiClient } from "bun-rad-studio";` | `import { newApp, sys, createApiClient } from "./src/simplecli";` | `import { newApp, sys, createApiClient } from "../../src/simplecli";` |
| **`rad` / system utilities** | `import { sys, stdlib } from "bun-rad-studio";` *(use repo source for `rad`)* | `import { rad } from "./src/features/rad/index.ts";` | `import { rad } from "../../src/features/rad";` |

> **Note:** In your own external project using `bun add bun-rad-studio`, `"bun-rad-studio"` re-exports root [`index.ts`](../../index.ts) (`SimpleGUI` + `SimpleCLI` + `sys` + `stdlib`), and `"bun-rad-studio/simplegui"` loads only desktop GUI APIs. Inside this cloned repository, `"./index.ts"` exports `SimpleGUI` + `SimpleCLI` while `"./src"` (`src/index.ts`) exports all three (`SimpleGUI`, `SimpleCLI`, and `rad`); inside subfolders, adjust `../` depth to reach `src/`.

### Side-by-side code for all 3 import scenarios

**(a) Script at repository root (`./index.ts` + `./src/features/rad/index.ts`):**

```typescript
// Repo root (app.ts): SimpleGUI + SimpleCLI from ./index.ts, 45 rad modules from ./src/features/rad/index.ts
import { newSimpleWindow, newApp, sys } from "./index.ts";
import { rad } from "./src/features/rad/index.ts";

const files = await rad.globutils.findFiles("**/*.ts", "./src");
const app = newApp("root-check", "1.0.0");
console.log({ os: sys.osPlatform(), tsFiles: files.length });
```

**(b) Script inside a nested folder (`examples/rad_tutorial/` or `applications/`):**

```typescript
// Nested folder (two levels below repo root): import explicit subpath modules from ../../src/
import { newSimpleWindow } from "../../src/simplegui";
import { newApp, createApiClient } from "../../src/simplecli";
import { rad } from "../../src/features/rad";

const app = newApp("nested-tool", "1.0.0");
const api = createApiClient("https://api.example.com");
const slug = rad.strutils.slugify("Hello RAD Studio");
```

**(c) External project installed via `bun add bun-rad-studio`:**

```typescript
// Installed npm package: root barrel ("bun-rad-studio") or lightweight GUI subpath ("bun-rad-studio/simplegui")
import { newApp, createWindow, sys, createApiClient } from "bun-rad-studio";
import { newSimpleWindow, listThemes } from "bun-rad-studio/simplegui";

const app = newApp("external-cli", "1.0.0");
const api = createApiClient("https://api.example.com");
console.log({ themes: listThemes().length, arch: sys.osArch() });
```

### Namespace disambiguation in the unified hub (D-027)

Four identifier names exist in more than one library with different behavior. As recorded in [D-027](../documentation-maintenance/discrepancies.md#d-027) and `src/index.ts`, the unified hub (`"./src"`) exports one concrete definition at the top level while keeping the `rad` variants under their module namespaces:

| Top-level unified export | What it resolves to | How to access the `rad` alternative |
| :--- | :--- | :--- |
| `writeFileAtomic` | **SimpleGUI synchronous** `writeFileAtomic(path, content): void` | `rad.fileutils.writeFileAtomic(path, content)` (**asynchronous** `Promise<void>`) or `fileutils.writeFileAtomic` |
| `LRUCache` | **SimpleCLI** `LRUCache` | `rad.cacheutils.LRUCache` (or `cacheutils.LRUCache`) |
| `Logger`, `LogLevel` | **SimpleCLI** `Logger` and `LogLevel` | `rad.logutils.Logger`, `rad.logutils.LogLevel`, `rad.logutils.newLogger` |
| `TreeNode` | **SimpleCLI** `TreeNode` (terminal tree visualizer) | Use directly for `app.tree(root)` (or TS interface `TreeNode` from `cliutils.ts`) |

Alias top-level imports when combining the unified `./src` barrel (or Node built-ins like `node:util` `parseArgs`) with `rad.*` in one file:

```typescript
import { join } from "node:path";
import { parseArgs as nodeParseArgs } from "node:util";
import {
  writeFileAtomic as writeGuiSync,
  LRUCache as CliLruCache,
  escapeHtml,
  newApp,
} from "./src";
import { rad } from "./src/features/rad/index.ts";

// D-027 safe disambiguation: SimpleGUI sync vs rad.fileutils async; SimpleCLI vs rad.cacheutils
await rad.fileutils.withTempDir(async (dir) => {
  writeGuiSync(join(dir, "sync.txt"), "SimpleGUI sync atomic write");
  await rad.fileutils.writeFileAtomic(join(dir, "async.txt"), "RAD async atomic write");
});
const cliCache = new CliLruCache<string, number>(64);
const radCache = new rad.cacheutils.LRUCache<string, number>(64);
cliCache.set("hits", 1);
radCache.set("hits", 1);

// Root ./src exports rad.htmlutils.escapeHtml directly, while CLI argv parsing uses app.parseArgs()
const safeTitle = escapeHtml("<b>RAD & Studio</b>");
const parsedNode = nodeParseArgs({ args: ["--port", "3000"], options: { port: { type: "string" } } });
const app = newApp("safe-alias", "1.0.0").addFlagString("port", "p", parsedNode.values.port ?? "3000", safeTitle);
app.parseArgs(["--port", "8080"]);
```

---

## Cheatsheet catalog

Use this index to jump straight to the guide built for your task:

| Cheatsheet | Who it is for | What questions it answers |
| :--- | :--- | :--- |
| **[RAD development cheatsheets](index.md)** *(this hub)* | Beginners starting in 5 minutes and developers picking the right tool | How Bun RAD Studio works, dual-mode `app.ts` quickstart, 3 import code examples + D-027 aliasing, tool chooser, 39-goal matrix + 4 mini-recipes, pro tips, and handbook links |
| **[SimpleGUI desktop RAD cheat sheet](simplegui-cheatsheet.md)** | Developers building native desktop windows in TypeScript | Window factories and explicit option precedence, scoped (`win.row`/`win.card`/`win.grid`) and paired layouts, `.id()` placeholder promotion, `getText`/`setText`/`setHtml`/`values()`, `.bindViews` tabs, live table filtering, charts/timers, 35 enterprise controls, `validateForm`, OS state paths, `fire()` modals, file pickers, 310 themes, and headless `bun test` |
| **[SimpleCLI console and backend RAD cheat sheet](simplecli-cheatsheet.md)** | Developers building terminal tools, DevOps scripts, and CI automation | Typed flags and subcommands, `parseCli()` vs `parseArgs()`, TTY tables vs JSON `--json`/pipe `app.output`, interactive prompts/fuzzy menus/wizards, multi-step `Pipeline`, `sys` telemetry and timeouts, `stdlib` helpers, `ApiClient` REST CRUD and `try*` calls, Redis fallback, shell completions, and single-binary builds |
| **[45 RAD utility modules and 10 system tools cheat sheet](rad-modules-cheatsheet.md)** | Developers replacing heavy npm boilerplate with built-in utilities | Confusing-pairs chooser (`fileutils` vs `sqliteutils` vs `stateutils`, `rad.sysutils.execSafe` vs `shellutils`, `asyncutils` vs `flowutils`), exact signatures across all 45 `rad` modules (WAL + FTS5 SQLite, TOML, ZIP/tar, `Bun.Glob`, `Bun.serve`, JWT/crypto, `parallelMap`), and TypeScript Coordinator/Doer APIs for `fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo` |
| **[Studios, codecaine CLI, databases, packaging and FAQ cheat sheet](studios-cli-and-troubleshooting-cheatsheet.md)** | Users launching built-in studios, working with databases, or packaging releases | macOS/Windows/Linux setup and OS prerequisites, `codecaine` master CLI commands, File Manager shortcuts, QBE query syntax and Database Workbench (SQLite/PostgreSQL/MySQL/Redis), Visual Form Designer status, OS config/state/log directories, `--reset-window`/`--server`, and symptom-to-fix troubleshooting |
| **[Complete all-in-one master cheat sheet (`CHEATSHEET.md`)](../../CHEATSHEET.md)** | Readers who want one searchable single-file reference and full app templates | All cheat sheets combined into one repository-root document plus complete copy-paste SimpleGUI studio and SimpleCLI DevOps templates |

---

## Which tool should I use

Pick the simplest tool that matches your goal:

| Tool | Launch / Import | Best for | Important facts to know |
| :--- | :--- | :--- | :--- |
| **`SimpleGUI`** | `import { newSimpleWindow } from "./src/simplegui"` | Code-first desktop windows, dashboards, forms, charts, and maintainable TypeScript apps | Supports IDE autocomplete, reactive state, headless `bun test` testing, and `bun build --compile` |
| **Visual Form Designer** | `bun run start` | Visually sketching a `FormSpec` layout by dragging widgets and exporting starter code | Placing controls, properties, code tabs, undo/redo, Audit, and Import were browser-checked; Run, Export, and native window were not hand-verified, and DB controls are placeholders ([Visual form designer](../visual-designer/index.md), [D-002](../documentation-maintenance/discrepancies.md#d-002)) |
| **`SimpleCLI`** | `import { newApp } from "./src/simplecli"` | Terminal tools, CI/CD jobs, interactive setup wizards, system checks, and REST clients | Runs anywhere with zero window dependencies; `app.output` switches automatically between TTY tables and JSON |
| **`rad.sqliteutils`** | `import { rad } from "./src/features/rad/index.ts"` | Embedding a fast local SQLite database inside your own GUI, CLI, or HTTP service | Uses Bun's built-in `bun:sqlite` in WAL mode with KV tables, JSON document store, migrations, and FTS5 search |
| **Database Workbench** | `bun run workbench` | Inspecting schemas, running SQL queries, staging imports, and managing existing databases | Connects to SQLite, PostgreSQL, and MySQL using OS keychain profiles ([Database Workbench guide](../databases/workbench.md)) |
| **Built-in Studios** | `bun run app:launcher` or `bun run app:files` | Ready-made desktop tools when you do not want to write code | Includes Launcher, Dual-Pane File Manager, SQLite/Postgres/MySQL/Redis studios, API tester, and system monitors |

---

## How do I decision matrix

Every symbol and method below has been verified against `src/simplegui.ts`, `src/simplecli/`, and `src/features/rad/modules/*.ts`:

| Goal | Recommended API | Verified Snippet |
| :--- | :--- | :--- |
| **Open a desktop window** | `newSimpleWindow` / `createWindow` | `const win = newSimpleWindow("App", 900, 620, { theme: "apple_dark" });` |
| **Group controls in an auto-closing row** | `win.row(cb)` | `win.row((w) => { w.addLabel("Name:"); w.addTextInput("Enter name").id("txtName"); });` |
| **Group controls in an auto-closing card** | `win.card(title, cb)` | `win.card("Profile", (w) => { w.addFormField("Email:", "txtEmail", ""); });` |
| **Create an auto-closing multi-column grid** | `win.grid(cols, gap, cb)` | `win.grid(3, 16, (w) => { w.addButton("A"); w.addButton("B"); w.addButton("C"); });` |
| **Pair layout containers manually** | `beginRow`/`endRow`, `beginCard`/`endCard`, `beginGrid`/`endGrid` | `win.beginRow(); win.addLabel("Host:"); win.addTextInput().id("t"); win.endRow();` |
| **Add a labeled input in 1 line** | `addFormField` / `addFormPassword` | `win.addFormField("Email:", "txtEmail", "ada@example.com");` |
| **Read or update plain text safely** | `getText` / `setText` | `const name = win.getText("txtName"); win.setText("lblStatus", "Saved!");` |
| **Render trusted raw HTML explicitly** | `setHtml` | `win.setHtml("lblRich", "<strong>Active</strong>");` |
| **Read checkboxes, numbers, or batch fields** | `getBool` / `getInt` / `getFloat` / `getManyNumbers` / `setValues` | `const ok = win.getBool("chkOk"); const port = win.getInt("txtPort"); win.setValues({ txtHost: "localhost", chkOk: true });` |
| **Switch views automatically on tab click** | `addTabs(...).bindViews(map)` | `win.addTabs(["Tasks", "Charts"], 0).bindViews({ Tasks: ["tbl"], Charts: ["crt"] });` |
| **Filter a table on every keystroke** | `bindTableFilter` / `.filterTable` | `win.bindTableFilter("txtSearch", "tbl", () => rows, { countControlId: "bdg" });` |
| **Fill a form when a table row is clicked** | `bindMasterDetail` / `.bindDetail` | `win.bindMasterDetail("tbl", ["txtId", "txtName", "cmbRole"]);` |
| **Validate a form and focus first error** | `validateForm` | `const res = win.validateForm({ txtEmail: { required: true, label: "Email" } });` |
| **Export table rows to CSV or JSON** | `exportTableCsv` / `exportTableJson` | `const csv = win.exportTableCsv("tbl"); const json = win.exportTableJson("tbl");` |
| **Render line, bar, or area charts** | `addChart` + `setChartData` | `win.addChart("crt", "line", 140); win.setChartData("crt", [10, 40, 85]);` |
| **Render circular donut KPIs** | `addDonutChart` | `win.addDonutChart("dnCpu", "CPU", 68, "Healthy");` |
| **Run repeating UI updates on a timer** | `addTimer` | `win.addTimer(1000, (w) => w.setText("lblClock", new Date().toLocaleTimeString()));` |
| **Two-way bind a control to state** | `.bindState(key)` + `onStateChange` | `win.addTextInput("Name").id("txtName").bindState("username");` |
| **Auto-save inputs and theme across runs** | `autoSaveState: true` / `enableAutoSave` | `const win = newSimpleWindow("App", 800, 600, { appId: "my_app", autoSaveState: true });` |
| **Add a live 310-theme switcher** | `addThemeSelector` / `setTheme` | `win.addThemeSelector("dd_theme", "Theme:");` |
| **Show a rich SweetAlert-style modal** | `win.fire(opts, cb)` | `win.fire({ title: "Deploy?", icon: "question", showCancelButton: true }, cb);` |
| **Show quick alerts, confirms, or toasts** | `info` / `warn` / `ask` / `toast` | `if (await win.ask("Delete item?", "Confirm")) win.toast("Deleted");` |
| **Pick a file or folder in-window** | `open_webview_file_dialog` | `win.open_webview_file_dialog("Open File", ".json", (p) => {});` |
| **Prevent double-clicks during async work** | `withBusyState` | `await win.withBusyState(["btnSave"], "Saving...", async (w, done) => { await Bun.sleep(500); done("Saved"); });` |
| **Parse typed CLI flags and subcommands** | `newApp` / `command` / `parseCli` | `app.addFlagString("env", "e", "dev", "Environment").parseCli();` |
| **Print TTY tables or JSON when piped** | `app.output(data, opts)` | `app.output([{ service: "api", ok: true }], { title: "Status" });` |
| **Ask interactive prompts or form wizards** | `prompt` / `select` / `fuzzySelect` / `form` | `const env = await app.select("Target:", ["dev", "staging", "prod"]);` |
| **Run multi-step terminal task pipelines** | `app.newPipeline(title)` | `await app.newPipeline("Deploy").addStep("Build", () => true).run();` |
| **Run shell commands with timeout or retry** | `sys.execTimeout` / `sys.execRetry` | `const res = await sys.execTimeout("bun --version", 3000);` |
| **Run a command safely without a shell** | `rad.sysutils.execSafe` | `const { stdout, exitCode } = await rad.sysutils.execSafe("git", ["status", "-s"]);` |
| **Call REST APIs without throwing** | `createApiClient` + `tryGet` | `const api = createApiClient("https://api.example.com"); const r = await api.tryGet("/health");` |
| **Query SQLite in WAL mode and bulk insert** | `rad.sqliteutils` | `const db = rad.sqliteutils.openDb("app.db"); rad.sqliteutils.insertMany(db, "tasks", rows);` |
| **Run BM25 full-text search in SQLite** | `createFtsTable` + `searchFtsRanked` | `rad.sqliteutils.createFtsTable(db, "docs", ["title", "body"]); rad.sqliteutils.searchFtsRanked(db, "docs", "bun");` |
| **Scan files with `Bun.Glob`** | `rad.globutils.findFiles` | `const files = await rad.globutils.findFiles("**/*.ts", "./src");` |
| **Start a `Bun.serve` HTTP router** | `rad.serverutils.createRouter` + `serveHttp` | `const r = rad.serverutils.createRouter().get("/ping", () => new Response("ok")); rad.serverutils.serveHttp({ router: r });` |
| **Hash passwords and sign HS256 JWTs** | `cryptoutils.hashPassword` / `jwtutils.signJwt` | `const h = await rad.cryptoutils.hashPassword("example-password"); const t = rad.jwtutils.signJwt({ sub: "1" }, "placeholder-secret");` |
| **Run async tasks with bounded concurrency** | `rad.asyncutils.parallelMap` | `const out = await rad.asyncutils.parallelMap(urls, 4, async (u) => fetch(u));` |
| **Test windows and CLIs headlessly** | `bun test` (`triggerClick`, `parseArgs`) | `await win.triggerClick("btnSave"); app.parseArgs(["--env", "prod"]);` |
| **Compile to a standalone executable** | `bun build --compile` | `bun build --compile examples/rad_tutorial/01_quickstart.ts --outfile my-app` |

### 4 bite-sized copy-paste mini-recipes

#### 1. Desktop form with `win.card`, `win.values()`, and `validateForm`

```typescript
import { newSimpleWindow } from "./src/simplegui";

const win = newSimpleWindow("Quick Signup", 520, 380, { theme: "apple_dark" });
win.card("Account Details", (w) => {
  w.addFormField("Full Name:", "txtName", "");
  w.addFormField("Email:", "txtEmail", "");
  w.addFormPassword("Password:", "txtPass");
});
win.addButton("Create Account", (w) => {
  const check = w.validateForm({
    txtName: { required: true, label: "Full Name" },
    txtEmail: { required: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, label: "Email" },
    txtPass: { required: true, minLength: 8, label: "Password" },
  });
  if (!check.valid) { w.toast(check.firstErrorMessage ?? "Fix highlighted field", 3000, "warning"); return; }
  const data = w.values();
  w.info("Saved", `Created account for ${data.txtName} (${data.txtEmail})`);
});
win.run();
```

#### 2. Zero-SQL `rad.sqliteutils` CRUD and FTS5 search

```typescript
import { rad } from "./src/features/rad/index.ts";

const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.execSql(db, "CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, body TEXT)");
rad.sqliteutils.insertMany(db, "notes", [
  { title: "WAL Mode", body: "Concurrent SQLite reads and writes in Bun" },
  { title: "FTS5 Search", body: "Ranked BM25 full-text queries with zero dependencies" },
]);
rad.sqliteutils.updateRows(db, "notes", { title: "SQLite WAL Mode" }, "title = ?", ["WAL Mode"]);
const notes = rad.sqliteutils.selectRows<{ title: string; body: string }>(db, "notes", ["title", "body"]);
rad.sqliteutils.createFtsTable(db, "notes_fts", ["title", "body"]);
for (const row of notes) rad.sqliteutils.indexFts(db, "notes_fts", row);
const hits = rad.sqliteutils.searchFtsRanked<{ title: string }>(db, "notes_fts", "BM25");
console.log({ count: notes.length, topHit: hits[0]?.title });
rad.sqliteutils.closeDb(db);
```

#### 3. `SimpleCLI` `app.output()` table vs piped JSON

```typescript
import { newApp, sys } from "./src/simplecli";

const app = newApp("host-report", "1.0.0")
  .addFlagBool("json", "j", false, "Force JSON output instead of an interactive table");
if (!app.parseCli()) process.exit(0);

const mem = sys.memoryInfo();
const report = [
  { host: sys.osHostname(), os: `${sys.osPlatform()}/${sys.osArch()}`, cpus: sys.cpuCount(), ramPct: `${mem.percent.toFixed(1)}%` },
];
// Prints a Unicode table on interactive TTYs, or clean JSON when piped (`| cat`) or with `--json`
app.output(report, { title: "Host Telemetry" });
```

#### 4. Native HTTP JSON API with `rad.serverutils.createRouter()` and `rad.sqliteutils`

```typescript
import { rad } from "./src/features/rad/index.ts";

const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.execSql(db, "CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
rad.sqliteutils.insertRow(db, "tasks", { title: "Ship cheatsheet examples" });

const router = rad.serverutils.createRouter()
  .get("/tasks", () => Response.json(rad.sqliteutils.selectRows(db, "tasks", ["id", "title"])))
  .post("/tasks", async (req: Request) => {
    const body = (await req.json()) as { title?: string };
    if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
    const id = rad.sqliteutils.insertRow(db, "tasks", { title: body.title });
    return Response.json({ id, title: body.title }, { status: 201 });
  });

const server = rad.serverutils.serveHttp({ router, port: 0 });
console.log(`JSON API ready at ${server.url}/tasks`); // Call server.stop() and rad.sqliteutils.closeDb(db) on exit
```

---

## Top 15 pro RAD tips and tricks

1. **Prefer scoped layouts (`win.row`, `win.card`, `win.grid`) for safety:** Scoped blocks wrap `begin*` and `end*` in `try / finally`, so your layout stack never gets unbalanced even if an exception occurs inside the callback.
2. **Switch entire tab screens in 1 line (`.bindViews`):** Chain `.bindViews({ "Tab 1": ["cardA", "tblA"], "Tab 2": ["cardB"] })` onto `win.addTabs(...)` instead of writing manual `showControls` / `hideControls` loops.
3. **Wire 1-line live search (`.filterTable`) and debounce heavy queries:** Chain `.filterTable("tblUsers", () => rows)` onto `win.addSearchInput(...)` for instant in-memory search, or wrap database queries in `rad.flowutils.debounce(fn, 200)` so rapid typing stays smooth.
4. **Populate detail forms in 1 line (`bindMasterDetail` / `.bindDetail`):** Attach `.bindDetail(["txtId", "txtName", "cmbRole"])` to your table so clicking any row fills the matching editor fields automatically.
5. **Batch control updates with `setValues` or `setManyTexts`:** Instead of scattering dozens of individual updates across handlers, pass a dictionary to `win.setValues({ txtHost: "localhost", swtTls: true })` or `win.setManyTexts({ lblCount: "5", lblStatus: "Ready" })`.
6. **Prevent accidental double-clicks (`win.withBusyState`):** Wrap slow async button work in `await win.withBusyState(["btnSave"], "Saving...", async (w, done) => { ... done("Saved"); })`; it disables the button while running and restores it automatically afterward.
7. **Validate and focus in 1 call (`win.validateForm`):** Check `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, and custom `validate` rules in one object—SimpleGUI automatically highlights and focuses `res.firstInvalidId`.
8. **Understand explicit window option precedence:** Passing explicit `width, height` opens windowed (`fullscreen: false`), whereas omitting dimensions defaults to `fullscreen: true`; explicit `{ theme, fullscreen }` options override saved `session.json` and `form_state.json` while still restoring input values.
9. **Keep UI text updates XSS-safe (`setText` vs `setHtml`):** `win.setText` and `win.setValue` escape text cleanly on labels, buttons, headings, badges, and checkboxes (without overwriting checkbox `.checked`); use `win.setHtml` only when intentionally rendering trusted HTML markup.
10. **Auto-save inputs and user themes (`autoSaveState: true`):** Pass `{ autoSaveState: true, appId: "my_app" }` to `newSimpleWindow` (or call `win.enableAutoSave()`) so the user's chosen theme and form entries restore across restarts.
11. **Dual-mode TTY and JSON CLI output (`app.output`):** `app.output(rows)` prints a formatted Unicode table in an interactive terminal and automatically switches to clean JSON when stdout is piped (`my-cli | jq`) or when `--json` is passed.
12. **Avoid shell injection and hanging network calls:** Use `rad.sysutils.execSafe(cmd, args)` (shell-free `Bun.spawn` with array arguments) for untrusted values, `sys.execTimeout` for deadlines, and `api.tryGet` (`if (res.ok)`) instead of deeply nested `try / catch` blocks.
13. **Speed up bulk SQLite inserts (`insertMany` and `transaction`):** Wrapping multi-row writes in `rad.sqliteutils.insertMany(db, "tasks", rows)` or `rad.sqliteutils.transaction(db, () => ...)` avoids committing a separate WAL transaction per row.
14. **Keep apps headless-testable in `bun test`:** Export a factory (`export function createApp()`), guard `win.run()` with `if (import.meta.main)`, and drive clicks/inputs via `await win.triggerClick("btnSave")` and `await win.triggerChange("txtSearch", "WAL")`—or CLI flags via `app.parseArgs([...])`.
15. **Compile and validate before sharing:** Ship single-file executables with `bun build --compile`, verify doc links and rules with `bun run docs:check`, and check cheat sheet patterns against `tests/rad_cheatsheet_templates.test.ts`.

---

## Quick beginner FAQ

- **Do I need to learn HTML, CSS, React, or Electron first?**
  No. You write plain TypeScript calling `win.add*` or `app.*`, and `SimpleGUI` / `SimpleCLI` render the native WebView UI or terminal output for you.
- **Why did my window open fullscreen instead of my custom size?**
  Omitting `width` and `height` in `newSimpleWindow("Title")` defaults `fullscreen` to `true`. Pass dimensions such as `newSimpleWindow("Title", 800, 600)` (or `{ fullscreen: false }`) to start windowed.
- **Why does `win.getText("...")` return `""`?**
  Make sure you chained `.id("myId")` when creating the control (`win.addTextInput("Name").id("txtName")`) or used an ID-first builder (`win.addFormField("Name:", "txtName", "")`). Note that `win.addTextInput("Enter name")` treats the single string as a placeholder until `.id(...)` is attached.
- **Why did `win.setText("lblInfo", "<b>Hi</b>")` show literal `<b>Hi</b>` instead of bold text?**
  `setText` intentionally escapes plain text to prevent HTML injection. Call `win.setHtml("lblInfo", "<b>Hi</b>")` when you explicitly want trusted HTML markup.
- **Why did `writeFileAtomic` or `LRUCache` behave differently when imported from `"./src"`?**
  The unified hub follows [D-027](../documentation-maintenance/discrepancies.md#d-027): top-level `writeFileAtomic` is SimpleGUI's synchronous writer, while `rad.fileutils.writeFileAtomic` is async; top-level `LRUCache`, `Logger`, and `LogLevel` come from `SimpleCLI`, while the `rad` variants are `rad.cacheutils.LRUCache` and `rad.logutils.*`.
- **Why do interactive `app.prompt` / `app.select` calls hang or fall back in CI?**
  Non-interactive CI runners have no TTY (`!process.stdin.isTTY`). Register `--flags` with `addFlagString` / `addFlagBool` so automated scripts can pass options non-interactively without prompting.
- **How do I know which features were hands-on verified vs source-only?**
  See [Handbook home](../index.md) and the [Coverage matrix](../documentation-maintenance/coverage-matrix.md). Hands-on verification for this handbook runs on macOS (Apple silicon); Linux automated tests run under virtual display (`xvfb`) in CI, and native Windows/Linux desktop windows are marked unverified in the handbook.

---

## Runnable tutorial and cookbook commands

Run any step-by-step tutorial program or the full workspace template from the repository root:

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

# Built-in cookbook, launcher, File Manager, Visual Designer, and Database Workbench
bun run rad:cookbook
bun run app:launcher
bun run app:files
bun run start
bun run workbench
```

---

## Complete main handbook reference map

Every cheat sheet is self-contained for daily work. Jump into these main handbook pages whenever you need full parameter tables, architecture diagrams, or troubleshooting steps:

| Topic | Primary Reference | Related Deep-Dive Guides |
| :--- | :--- | :--- |
| **SimpleGUI Desktop UI** | **[`docs/SIMPLEGUI_API.md`](../SIMPLEGUI_API.md)** | [Quick Start](../SIMPLEGUI_API.md#1--5-minute-quick-start) · [Controls Reference](../SIMPLEGUI_API.md#6--4-standard-controls-reference) · [Layouts](../SIMPLEGUI_API.md#4--2-layout--container-systems) · [Enterprise Widgets](../SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have) |
| **SimpleCLI Console and Backend** | **[`docs/CLI_API.md`](../CLI_API.md)** | [CLI Flags](../CLI_API.md#2-cli-flags--argument-parsing) · [Interactive Prompts](../CLI_API.md#4-interactive-prompts-menus--input-validation) · [HTTP and Micro-Server](../CLI_API.md#15-http-client-micro-server--rest-apis) |
| **45 `rad` Utility Modules** | **[`src/features/rad/README.md`](../../src/features/rad/README.md)** | [File and Storage](../../src/features/rad/README.md#1-file--storage-8-modules) · [Collections](../../src/features/rad/README.md#2-data-structures--collections-8-modules) · [Concurrency](../../src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules) |
| **10 System Utilities (`fd`..`doggo`)** | **[`docs/SYSTEM_UTILITIES_API.md`](../SYSTEM_UTILITIES_API.md)** | [User Guides Master Hub](../userguides/README.md) · [`fd`](../../src/features/fd/README.md) · [`tokei`](../../src/features/tokei/README.md) · [`procs`](../../src/features/procs/README.md) |
| **Databases (SQLite, PG, MySQL, Redis)** | **[`docs/databases/index.md`](../databases/index.md)** | [Complete Databases Guide](../databases/complete-databases-guide.md) · [Workbench](../databases/workbench.md) · [SQLite Studio](../userguides/01_sqlite_studio.md) · [Postgres Studio](../userguides/42_postgres_studio.md) · [MySQL Studio](../userguides/41_mysql_studio.md) · [Redis Studio](../userguides/40_redis_studio.md) |
| **Visual Form Designer and `FormSpec`** | **[`docs/visual-designer/index.md`](../visual-designer/index.md)** | [FormSpec and Runtime API (`docs/API.md`)](../API.md) · [Generated Applications](../generated-applications/index.md) · [Declarative Module](../API.md#10-simplegui-declarative-module-reference) |
| **310 Themes and 167 FX Shaders** | **[`docs/THEMES.md`](../THEMES.md)** | [Futuristic FX Shaders](../developer/fx-themes.md) · [Universal Theme Persistence](../SIMPLEGUI_API.md#universal-theme-persistence) |
| **Studios, Testing and Packaging** | **[`docs/developer/handbook.md`](../developer/handbook.md)** | [Application Index](../reference/application-index.md) · [Architecture](../developer/architecture.md) · [Testing Guide](../testing/index.md) · [Releasing Binaries](../developer/releasing.md) · [Troubleshooting](../troubleshooting.md) |
