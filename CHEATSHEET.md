# ⚡ Bun RAD Studio — Complete RAD Development Cheat Sheet & Studio Templates

A step-by-step, copy-paste reference for **Rapid Application Development (RAD)** in TypeScript and Bun across **SimpleGUI** (Desktop UI), **SimpleCLI** (Headless Console & Backend), the **45 `rad` Utility Modules**, the **10 Programmatic System Tools**, the **Visual Form Designer**, and **Full-Featured Studio Workspace Templates**.

---

## 📑 Table of Contents

1. [🧭 Ecosystem Architecture, Beginner Quick-Start & 3 Import Scenarios](#1-ecosystem-architecture--quick-imports)
2. [🪟 Part 1: Step-by-Step SimpleGUI Desktop RAD Cheat Sheet](#2-part-1-step-by-step-simplegui-desktop-rad-cheat-sheet)
   - [Step 1: Window Creation, Options & Lifecycle](#step-1-window-creation-options--lifecycle)
   - [Step 2: Layout & Container Systems (Rows, Grids, Cards, Splits)](#step-2-layout--container-systems-rows-grids-cards-splits)
   - [Step 3: Fluent Method Chaining (`SimpleControlRef`)](#step-3-fluent-method-chaining-simplecontrolref)
   - [Step 4: Standard Controls & Compound Labeled Form Builders](#step-4-standard-controls--compound-labeled-form-builders)
   - [Step 5: Tabs, Segmented Controls & Multi-View Switching](#step-5-tabs-segmented-controls--multi-view-switching)
   - [Step 6: Live Search Filtering & Dynamic Data Tables](#step-6-live-search-filtering--dynamic-data-tables)
   - [Step 7: Charts, Gauges, Sparklines & Live Telemetry](#step-7-charts-gauges-sparklines--live-telemetry)
   - [Step 8: VLang Parity, Studio Extended & 35 Enterprise Widgets](#step-8-vlang-parity-studio-extended--35-enterprise-widgets)
   - [Step 9: Reactive State Store, Two-Way Binding & OS Persistence](#step-9-reactive-state-store-two-way-binding--os-persistence)
   - [Step 10: Menus, Context Menus, SweetAlert2 `fire()`, Modals & File Pickers](#step-10-menus-context-menus-sweetalert2-fire-modals--file-pickers)
   - [Step 11: 133 Visual Themes & 12 Futuristic FX Shader Themes](#step-11-133-visual-themes--12-futuristic-fx-shader-themes)
3. [⌨️ Part 2: Step-by-Step SimpleCLI Console & Backend Cheat Sheet](#3-part-2-step-by-step-simplecli-console--backend-cheat-sheet)
   - [Step 1: App Setup, Flags, Subcommands & Auto-Suggestions](#cli-step-1-app-setup-flags-subcommands--auto-suggestions)
   - [Step 2: Terminal ANSI UI, Tables, Sparklines, Charts, Trees & Diffs](#cli-step-2-terminal-ansi-ui-tables-sparklines-charts-trees--diffs)
   - [Step 3: Interactive Prompts, Fuzzy Select, Form Wizards & File Picker](#cli-step-3-interactive-prompts-fuzzy-select-form-wizards--file-picker)
   - [Step 4: Task Pipelines, Structured Logging & Benchmarking](#cli-step-4-task-pipelines-structured-logging--benchmarking)
   - [Step 5: `sys` Subprocess, Hardware Telemetry, Network & OS Helpers](#cli-step-5-sys-subprocess-hardware-telemetry-network--os-helpers)
   - [Step 6: `ApiClient` REST CRUD, Safe `try*` Calls & Namespaced Redis](#cli-step-6-apiclient-rest-crud-safe-try-calls--namespaced-redis)
4. [🧰 Part 3: 45 `rad` Utility Modules & 10 System Tools Cheat Sheet](#4-part-3-45-rad-utility-modules--10-system-tools-cheat-sheet)
   - [Confusing Pairs Explained (Which Module Should I Pick?)](#confusing-pairs-explained)
   - [Domain 1: File, SQLite (WAL + FTS5), TOML, Archives & State (8 Modules)](#domain-1-file-sqlite-wal--fts5-toml-archives--state-8-modules)
   - [Domain 2: Arrays, Objects, Data Structures, Stats, Math & Graphs (8 Modules)](#domain-2-arrays-objects-data-structures-stats-math--graphs-8-modules)
   - [Domain 3: Strings, Regex, Templates, Colors, HTML & Diffs (6 Modules)](#domain-3-strings-regex-templates-colors-html--diffs-6-modules)
   - [Domain 4: System, CLI, Env, Bun Shell, Glob, Transpiler, Cron & SemVer (9 Modules)](#domain-4-system-cli-env-bun-shell-glob-transpiler-cron--semver-9-modules)
   - [Domain 5: Network, HTTP, `Bun.serve` Router, URL, JWT, Crypto & `Bun.hash` (7 Modules)](#domain-5-network-http-bunserve-router-url-jwt-crypto--bunhash-7-modules)
   - [Domain 6: Async Concurrency, Flow Resilience, Functional, Events, Validation, Mock & Time (7 Modules)](#domain-6-async-concurrency-flow-resilience-functional-events-validation-mock--time-7-modules)
   - [10 System Utilities as Plain TypeScript Functions (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`)](#10-system-utilities-as-plain-typescript-functions)
5. [🎨 Part 4: Visual Form Designer (IDE), `codecaine` CLI, Workbenches & Packaging](#5-part-4-visual-form-designer-ide-shortcuts--single-binary-build)
6. [💡 Part 5: Pro RAD Tips, Tricks & Power Patterns](#6-part-5-pro-rad-tips-tricks--power-patterns)
   - [SimpleGUI Desktop UI, Layout & Performance Tricks](#simplegui-desktop-ui-layout--performance-tricks)
   - [SimpleCLI Terminal, Piping & Backend Tricks](#simplecli-terminal-piping--backend-tricks)
   - [45 `rad` Modules, SQLite & Native Bun Superpower Tricks](#45-rad-modules-sqlite--native-bun-superpower-tricks)
   - [Cross-Platform Portability & Headless Unit Testing Tricks](#cross-platform-portability--headless-unit-testing-tricks)
7. [🚀 Part 6: Complete Full-Featured Workspace Templates](#7-part-6-complete-full-featured-workspace-templates)
   - [Template 1: Full-Featured SimpleGUI Studio Workspace (Tabs + Live Search + Charts + SQLite + Dialogs)](#template-1-full-featured-simplegui-studio-workspace)
   - [Template 2: Full-Featured SimpleCLI + `rad` DevOps Automation Tool](#template-2-full-featured-simplecli--rad-devops-automation-tool)
8. [📚 Part 7: Complete Main Documentation Reference Map](#8-part-7-complete-main-documentation-reference-map)
   - [Focused Companion Cheat Sheet: Studios, `codecaine` CLI & Troubleshooting](docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md)
9. [🩺 Part 8: Master Troubleshooting & "No Questions Left" FAQ](#9-part-8-master-troubleshooting--no-questions-left-faq)

---

<a id="1-ecosystem-architecture--quick-imports"></a>

## 1. 🧭 Ecosystem Architecture, Beginner Quick-Start & 3 Import Scenarios

### What is Bun RAD Studio? (In Plain English)

**RAD** stands for **Rapid Application Development**. Instead of spending days setting up HTML/CSS build pipelines, React state managers, Electron bundlers, or dozens of `npm` packages, Bun RAD Studio lets you build **complete desktop apps, terminal tools, and databases in a single TypeScript file**.

Everything is organized into **3 simple building blocks** that work together:

1. **🪟 `SimpleGUI` (`./src/simplegui`)** — **For Desktop Windows.** You write plain TypeScript like `win.addHeading(...)`, `win.addTextInput(...)`, `win.addTable(...)`, and `win.addButton(...)`. SimpleGUI opens a native OS window and handles all the HTML, CSS, themes, and events for you automatically.
2. **⌨️ `SimpleCLI` (`./src/simplecli`)** — **For Terminal & Backend Scripts.** When you don't need a desktop window, `SimpleCLI` gives you command-line `--flags`, colored tables, progress bars, interactive terminal questions (`prompt`, `select`, `confirm`), system checks (`sys`), and an HTTP client (`createApiClient`).
3. **🧰 `45 rad Modules` + `10 System Tools` (`./src/features/rad/`)** — **Your Built-in Batteries.** One import (`rad`) gives you ready-to-use helpers for SQLite databases (`rad.sqliteutils`), JSON/CSV/ZIP files (`rad.fileutils`, `rad.archiveutils`), arrays/objects (`rad.arrutils`, `rad.objutils`), passwords/hashing (`rad.cryptoutils`), and fast file/code search (`fd`, `tokei`, `procs`, `doggo`).

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ⚡ BUN RAD STUDIO STACK                            │
├────────────────────────┬───────────────────────────┬─────────────────────────┤
│ 🪟 SimpleGUI           │ ⌨️ SimpleCLI              │ 🧰 45 RAD Modules       │
│  • 100+ Desktop Widgets│  • Flags & Subcommands    │  • fileutils / sqlite   │
│  • 35 Enterprise Comps │  • Tables, Charts, Trees  │  • arrutils / objutils  │
│  • Tabs, Search, Charts│  • Prompts, Fuzzy, Wizard │  • strutils / cryptoutils│
│  • 310 Themes (167 FX) │  • Pipelines & Benchmarks │  • glob / shell / serve │
│  • Reactive State + IPC│  • sys + ApiClient + Redis│  • 10 System CLI Tools  │
└────────────────────────┴───────────────────────────┴─────────────────────────┘
```

### Beginner 60-Second Quick-Start & OS Prerequisites

**Required software:** [Bun](https://bun.sh) (`bun --version`; handbook baseline tested on Bun 1.4.2 / 1.4.4) and `git` (for cloning). Terminal CLI tools need **no** window library; native GUI windows depend on your OS WebView runtime:

| OS          | Native Desktop Window Prerequisite                                                                                               | Verification & Key Notes                                                                                                                                                                                                                                                                                          |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS**   | Built-in Apple **WKWebView** (nothing extra to install)                                                                          | **Verified** on macOS Apple silicon for handbook commands. For downloaded unsigned `.app` or binary releases, inspect checksums then clear quarantine with `xattr -dr com.apple.quarantine "/Applications/Codecaine File Manager.app"`.                                                                           |
| **Linux**   | **GTK 4** + **WebKitGTK 6.0** (`sudo apt install libgtk-4-1 libwebkitgtk-6.0-4`), plus `xclip` / `wl-copy` for clipboard buttons | **CI-verified** with `xvfb` on `ubuntu-latest`; a real desktop window was **not** hand-opened for the handbook. On Ubuntu 24.04+, AppArmor may block WebKit namespaces (`bwrap: setting up uid map: Permission denied`): run `sh install.sh --apparmor` in a release folder, or pass `--server` for browser mode. |
| **Windows** | **Microsoft Edge WebView2** + **Visual C++ 2015–2022 x64 Redistributable**                                                       | Native Windows GUI was **not** hand-verified for the handbook. Even on **Windows ARM64**, the `webview-bun` native DLL is **x64**—install the x64 VC++ runtime (and use x64 Bun for `webview-bun` tests). Avoid running from Parallels/VMware UNC shares (`\\Mac\...`); use a local drive (`C:\...`).             |

**Clone, install, and run your first desktop app in 4 commands:**

```bash
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio
bun install

# Run the built-in quickstart tutorial OR create app.ts at repo root and run it:
bun run examples/rad_tutorial/01_quickstart.ts
bun run app.ts
```

### 3 Import Scenarios (Pick the One Matching Your File Location)

Import paths change depending on whether you installed `bun-rad-studio` as a package, placed `app.ts` at the repository root, or wrote a file inside a subfolder like `examples/rad_tutorial/`:

#### Scenario A: External Project (installed via `bun add bun-rad-studio` / npm)

```typescript
// Full unified barrel (SimpleGUI + SimpleCLI + 45 rad modules)
import { simplegui, newSimpleWindow, newApp, sys, rad } from "bun-rad-studio";
// Lightweight GUI-only subpath (lazy-loads webview-bun without pulling CLI modules)
import { createWindow, type SimpleWindow } from "bun-rad-studio/simplegui";
```

#### Scenario B: Repository Root File (e.g. `app.ts` next to `package.json`)

```typescript
// Option 1: Full repo-root barrel
import { simplegui, newSimpleWindow, newApp, sys, rad } from "./src";
```

```typescript
// Option 2: Import submodules directly at repo root (lighter startup)
import {
  createWindow,
  getThemeNames,
  getSavedTheme,
  saveTheme,
  type SimpleControlRef,
} from "./src/simplegui";
import SimpleCLI, {
  createApp,
  stdlib,
  createApiClient,
  LogLevel,
  AlertKind,
  TaskStatus,
  FormFieldKind,
  PathMode,
  TreeNode,
} from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";
```

#### Scenario C: Repository Subfolder (e.g. `examples/rad_tutorial/01_quickstart.ts`)

```typescript
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";
import { newApp, sys, stdlib, createApiClient } from "../../src/simplecli";
import { rad } from "../../src/features/rad/index.ts";
```

> [!NOTE]
> **`D-027` Symbol Disambiguation (`"bun-rad-studio"` / `"./src"` Top-Level Barrel):**
> Two symbol groups share names across `SimpleCLI`, `SimpleGUI`, and `rad`. The top-level barrel explicitly pins these exports (`src/index.ts`) so there is never an ambiguous re-export:
>
> - `LRUCache`, `Logger`, `LogLevel`, and `TreeNode` exported directly from `"bun-rad-studio"` / `"./src"` come from **`SimpleCLI`**. The `rad` versions stay cleanly under **`rad.cacheutils.LRUCache`** and **`rad.logutils.Logger`** / **`rad.logutils.LogLevel`**.
> - `writeFileAtomic` exported directly from `"bun-rad-studio"` / `"./src"` comes from **`SimpleGUI`** and is **synchronous** (`writeFileAtomic(path, data)`). Use **`await rad.fileutils.writeFileAtomic(path, data)`** when you want the **async** `Promise<void>` version!

> 📖 **Deep-Dive Reference (Optional):** [Handbook Home (`docs/index.md`)](docs/index.md) · [Requirements (`docs/getting-started/requirements.md`)](docs/getting-started/requirements.md) · [Install & First Launch (`docs/getting-started/install-and-first-launch.md`)](docs/getting-started/install-and-first-launch.md) · [Architecture (`docs/developer/architecture.md`)](docs/developer/architecture.md) · [Task Index ("I want to...") (`docs/reference/task-index.md`)](docs/reference/task-index.md) · [Cheatsheet Hub (`docs/cheatsheets/index.md`)](docs/cheatsheets/index.md)

---

<a id="2-part-1-step-by-step-simplegui-desktop-rad-cheat-sheet"></a>

## 2. 🪟 Part 1: Step-by-Step SimpleGUI Desktop RAD Cheat Sheet

### How SimpleGUI Works in 30 Seconds (The 4 Golden Rules)

Before reading the steps below, here is the entire mental model of SimpleGUI:

1. **Create a window:** Call `const win = newSimpleWindow("Window Title", width, height, options)`.
2. **Add controls in the order you want them to appear:** Every `win.add*()` call places a widget on screen from top to bottom.
3. **Give interactive controls an `.id("name")` so you can read or change them later:**
   - **To read a text box or dropdown:** `win.getText("txtName")` (returns a `string`).
   - **To change a text box, label, or badge:** `win.setText("lblResult", "Saved!")`.
   - **To read a checkbox, switch, or slider:** `win.getBool("chkAgree")` (`boolean`) or `win.getInt("sldVolume")` / `win.getFloat("sldVolume")` (`number`).
   - **To react when a user clicks or types:** Pass a callback function `(w, value) => { ... }`. The first parameter `w` is always your `SimpleWindow` instance, and `value` is the latest value of that control!
4. **Open the window at the very end:** Call `win.run()` on the last line of your file.

> 📖 **Deep-Dive Reference (Optional):** [SimpleGUI Beginner & API Guide (`docs/SIMPLEGUI_API.md`)](docs/SIMPLEGUI_API.md) · [SimpleGUI Cheat Sheet (`docs/cheatsheets/simplegui-cheatsheet.md`)](docs/cheatsheets/simplegui-cheatsheet.md) · [Declarative Module Reference (`docs/API.md#10-simplegui-declarative-module-reference`)](docs/API.md#10-simplegui-declarative-module-reference)

<a id="step-1-window-creation-options--lifecycle"></a>

### Step 1: Window Creation, Options & Lifecycle

**Plain-English Summary:** `newSimpleWindow`, `createWindow`, `newWindow`, and `new_simple_window` are equivalent factories that accept either a positional `(title, width, height, options)` signature or a single `{ title, width, height, ... }` config object.

**Important defaults & session precedence rules (`src/simplegui.ts`):**

- **Fullscreen default:** If you pass **neither `width` nor `height`** (e.g. `createWindow("Dashboard")` or `createWindow("Dashboard", { appId: "dash" })`), the window opens **fullscreen by default (`fullscreen: true`)**. Passing either `width` or `height` sets `fullscreen: false` unless you also pass `fullscreen: true`.
- **Explicit options always win over saved sessions:** When `autoSaveState: true` loads `session.json`, `form_state.json`, or global `~/.config/simplegui/theme.txt`, any **explicit `{ theme, fullscreen }` or explicit `width` / `height`** you passed in code wins and is **not** overwritten by disk state (while saved control inputs in `form_state.json` still restore cleanly!).

> 📖 **Deep-Dive Reference (Optional):** [Window Creation & Configuration (`docs/SIMPLEGUI_API.md#window-creation`)](docs/SIMPLEGUI_API.md#window-creation) · [Window Options Table (`#window-options-table`)](docs/SIMPLEGUI_API.md#window-options-table) · [Window State Methods (`#window-state-methods`)](docs/SIMPLEGUI_API.md#window-state-methods) · [Lifecycle & Exit (`docs/API.md#-window-lifecycle--process-exit-methods`)](docs/API.md#-window-lifecycle--process-exit-methods)

| Factory Call Form                                                       | Resulting `width` / `height` / `fullscreen`                             | Typical Use Case                                          |
| :---------------------------------------------------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------- |
| `createWindow("Dashboard")`                                             | Fullscreen (`fullscreen: true`)                                         | Full-screen workspace studios                             |
| `createWindow("App", { theme: "apple_dark", appId: "my_app" })`         | Fullscreen (`fullscreen: true`) + named app state folder                | Full-screen app with saved preferences                    |
| `newSimpleWindow("Studio Pro", 1040, 720, { ... })`                     | Windowed `1040×720` (`fullscreen: false`)                               | Standard desktop dialog / studio window                   |
| `createWindow({ title: "Compact", width: 520, height: 360 })`           | Windowed `520×360` (`fullscreen: false`)                                | Single-object declarative options style                   |
| `createWindow("App", 900, 600, { autoSaveState: true, theme: "nord" })` | Starts at `900×600` & `"nord"`, ignoring saved `session.json` overrides | Pinning fixed dimensions/theme while keeping saved inputs |

```typescript
import { newSimpleWindow, createWindow } from "./src/simplegui";

// 1. Equivalent Window Factory Overloads:
//    createWindow(options) | createWindow(title, options) | createWindow(title, width, height, options)
const win = newSimpleWindow("Studio Pro", 1040, 720, {
  theme: "apple_dark", // Explicit theme wins over saved session/global theme (310 built-in themes)
  padding: 20, // Empty space around the outer edges of the window (in pixels)
  spacing: 12, // Vertical gap between stacked rows and cards (in pixels)
  alwaysOnTop: false, // Set true to keep this window floating above all other apps
  fullscreen: false, // Omit width & height to default to fullscreen: true, or force explicitly
  responsive: true, // Automatically wrap rows/grids nicely when the window is resized
  autoSaveState: true, // Save & restore form inputs (+ non-overridden theme/window geometry)
  appId: "studio_pro_v1", // Unique name used to save settings in your OS user state folder
  effects: "full", // Visual shader effects: "full" | "reduced" | "off"
});

// 2. Useful Window Methods You Can Call Anytime (Inside button clicks, menus, or timers)
win.setTheme("tokyo_night"); // Change the entire app's color theme instantly (no reload!)
win.setEffects("reduced"); // Turn down background animations for low-power laptops
win.setAlwaysOnTop(true); // Pin or unpin the window above other windows
win.toggleFullscreen(); // Enter or exit native fullscreen mode
win.center(); // Center the window on the display (also win.setMinimizable(true))
win.setSize(1200, 800); // Resize the window to 1200px wide by 800px tall
win.addStatusBar("Ready"); // Add a thin info bar at the very bottom of the window
win.setStatusBarText("Working…"); // Change the text shown in the bottom status bar
// win.quit();                     // Close the window and exit the program cleanly

// 3. Start the window! (Always put this at the very bottom of your file)
win.run();
```

---

<a id="step-2-layout--container-systems-rows-grids-cards-splits"></a>

### Step 2: Layout & Container Systems (Rows, Grids, Cards, Splits)

**Plain-English Summary:** You never need to write CSS flexbox or calculate `X`/`Y` pixel coordinates. SimpleGUI gives you **both** classic `begin*`/`end*` pairs **and** modern **scoped callback helpers** (`win.row`, `win.grid`, `win.card`, `win.section`, `win.groupBox`) that automatically close in a `try/finally` block—so an error inside your builder never leaves a container unclosed!

```text
Default Stack (no container)     win.row(cb)                 win.grid(3, 16, cb)
┌───────────────────────────┐   ┌───────────────────────┐   ┌────────┬────────┬────────┐
│ [ Heading               ] │   │ [Lbl] [Input] [Btn]   │   │ Cell 1 │ Cell 2 │ Cell 3 │
│ [ Control 2             ] │   └───────────────────────┘   ├────────┼────────┴────────┤
│ [ Control 3             ] │                               │ Cell 4 (auto-wraps)    │
└───────────────────────────┘   win.card("Title", cb)       └──────────────────────────┘
                                ┌── Title ─────────────────────────────────────────────┐
                                │  Controls inside share a framed card surface         │
                                └──────────────────────────────────────────────────────┘
```

> [!TIP]
> **Prefer Scoped Callbacks for Clean Nesting:** `win.row(cb)` / `win.card(title, cb)` / `win.grid(cols, gap, cb)` wrap `begin*()` and `end*()` in `try/finally` automatically. If you use `beginRow()`, `beginGrid()`, or `beginCard()` manually, always pair each call with `endRow()`, `endGrid()`, or `endCard()`.

> 📖 **Deep-Dive Reference (Optional):** [Layout & Container Systems (`docs/SIMPLEGUI_API.md#layout-systems`)](docs/SIMPLEGUI_API.md#layout-systems) · [Horizontal Rows (`#layout-row`)](docs/SIMPLEGUI_API.md#layout-row) · [Multi-Column Grids (`#layout-grid`)](docs/SIMPLEGUI_API.md#layout-grid) · [Container Cards (`#layout-card`)](docs/SIMPLEGUI_API.md#layout-card) · [Absolute Placement (`#layout-absolute`)](docs/SIMPLEGUI_API.md#layout-absolute)

```typescript
// 1. Page Titles & Section Dividers (Stacked top-to-bottom automatically)
win.addHeading("🚀 Mission Control", "Real-time cluster & data studio"); // Big title + subtitle
win.addSubheading("Cluster Overview"); // Medium section header
win.addCaption("All metrics refresh automatically."); // Small muted helper text
win.addDivider(); // Horizontal separator line

// 2. Scoped Horizontal Row — Automatically closes even if an exception occurs!
//    Signatures: win.row(cb) | win.row("rowId", cb)
win.row((w) => {
  w.addLabel("Search:").width(70);
  w.addSearchInput("Filter items...").id("txtSearch").width(280);
  w.addButton("🔍 Search", (ctx) => {
    ctx.toast(`Searching for: ${ctx.getText("txtSearch")}`);
  });
});

// 3. Scoped Multi-Column Grid — 3 equal-width columns with 16px gap (gap defaults to win.spacing)
//    Signatures: win.grid(cols, cb) | win.grid(cols, gapPx, cb)
win.grid(3, 16, (w) => {
  w.addTextInput("First Name").id("txtFirst"); // Row 1, Column 1
  w.addTextInput("Middle Name").id("txtMid"); // Row 1, Column 2
  w.addTextInput("Last Name").id("txtLast"); // Row 1, Column 3
  w.addSwitch("Active Account", true).id("swtActive"); // Auto-wraps to Row 2, Column 1!
});

// 4. Scoped Framed Card / Section / GroupBox (section & groupBox are aliases of card)
//    Signatures: win.card(title, cb) | win.card(cb) | win.section(title, cb) | win.groupBox(title, cb)
win.card("👤 Account Profile", (w) => {
  w.addFormField("Display Name:", "txtDisplay", "Ada Lovelace");
  w.addFormField("Email:", "txtEmail", "ada@analytical.engine");
});

// Classic begin* / end* form is equally supported whenever you want imperative blocks (e.g. for .id() on cards)
win
  .beginCard("📦 Legacy Begin/End Style", "Optional subtitle")
  .id("cardLegacy");
win.beginRow();
win.addLabel("Note:").width(60);
win.addTextInput("Works identically").id("txtNote");
win.endRow();
win.endCard();

// 5. Dual-Pane Split View — Left and right resizable panels (like an IDE sidebar + editor)
win.addSplitPane("splitMain", {
  width: 880,
  height: 220,
  left_title: "Navigator",
  left_content: "src/\n  index.ts\n  simplegui.ts",
  right_title: "Inspector",
  right_content: "Selected: simplegui.ts\nStatus: Clean",
  initialSplit: 0.35, // Left pane starts at 35% width, right pane at 65%
});

// 6. Absolute Pixel Placement (Optional) — Place a control at exact (X, Y) coordinates
win
  .addButton("❓ Help", (w) => w.info("Help", "Press Cmd+K for commands."))
  .at(920, 18) // X = 920px from left, Y = 18px from top
  .size(90, 32); // Width = 90px, Height = 32px
```

---

<a id="step-3-fluent-method-chaining-simplecontrolref"></a>

### Step 3: Fluent Method Chaining (`SimpleControlRef`)

**Plain-English Summary:** Every time you call `win.addButton(...)`, `win.addTextInput(...)`, or any other `win.add*()` method, it returns a **control handle** (`SimpleControlRef`). This lets you chain `.id(...)`, `.width(...)`, `.bg(...)`, `.bold()`, `.tooltip(...)`, and event handlers right onto the end of the line using dots (`.`)—just like building a sentence!

> 📖 **Deep-Dive Reference (Optional):** [Fluent Method Chaining & Styling (`docs/SIMPLEGUI_API.md#method-chaining`)](docs/SIMPLEGUI_API.md#method-chaining) · [Fluent Methods Reference Table (`#fluent-methods-table`)](docs/SIMPLEGUI_API.md#fluent-methods-table) · [Event Registration API (`docs/API.md#event-registration-api`)](docs/API.md#event-registration-api)

```typescript
win
  .addButton("🚀 Deploy Production", (w) => w.toast("Deploying..."))
  .id("btnDeploy") // Give it an ID so you can reference it later
  .size(190, 40) // Set width=190px, height=40px (or use .width(190).height(40))
  .bg("#0284c7") // Button background color (any HEX or CSS color)
  .color("#ffffff") // Text color
  .font(14, "#ffffff", "700") // Font size (14px), color, and weight ("700" = bold)
  .bold() // Shortcut for bold text (.italic() also exists)
  .align("center") // Text alignment: "left" | "center" | "right"
  .tooltip("Trigger production build") // Popup hint shown when hovering the mouse
  .opacity(100) // Transparency from 0 (invisible) to 100 (solid)
  .expandFill(true) // Stretch to fill remaining horizontal space in a row
  .enabled(true) // Enable/disable clicking (.enable() / .disable())
  .visible(true) // Show/hide the control (.show() / .hide())
  .onDoubleClick((w) => w.toast("Double-clicked!"))
  .onRightClick((w) => w.toast("Right-clicked!"));
```

#### Quick Reference: What You Can Chain onto Any Control

| What You Want to Do                     | Chainable Methods on `SimpleControlRef`                                                                                                                     | Plain-English Meaning                                                                                                                                           |
| :-------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Give it a name & read/set its value** | `.id("myId")`, `.bindState("key")`, `.value()` / `.value(v)`, `.text()` / `.text(t)`, `.checked()` / `.checked(b)`, `.clear()`                              | `.id()` names the control (and promotes an un-set input arg to placeholder); zero-arg `.value()`/`.text()`/`.checked()` read the value, one-arg forms update it |
| **Change its size or position**         | `.width(px)`, `.height(px)`, `.size(w, h)`, `.at(x, y)`, `.expandFill(true)`                                                                                | Set pixel dimensions or stretch to fill a row                                                                                                                   |
| **Style colors & fonts**                | `.bg("#hex")`, `.color("#hex")`, `.font(size, color?, weight?)`, `.bold()`, `.italic()`, `.align(dir)`                                                      | Customize colors, font size, bold/italic, and alignment — custom `.bg()`/`.color()` **survive `win.setTheme()`**                                                |
| **Add hints, limits & focus**           | `.placeholder("hint")`, `.tooltip("hover text")`, `.readOnly(true)`, `.min(0)`, `.max(100)`, `.focus()`, `.flash()`                                         | Add placeholder text, numeric min/max bounds, or focus/flash the control                                                                                        |
| **Show, hide, enable, or disable**      | `.show()`, `.hide()`, `.visible(bool)`, `.toggleVisible()`, `.isVisible()`, `.enable()`, `.disable()`, `.enabled(bool)`, `.toggleEnabled()`, `.isEnabled()` | Query or toggle whether the user can see or interact with the control                                                                                           |
| **Power helpers for Tabs & Tables**     | `.bindViews(viewsMap)`, `.filterTable(tableId, rowsOrFn, opts?)`, `.bindDetail(colMap, cb)`                                                                 | 1-line helpers for tab switching, live table filtering, and master-detail row click binding                                                                     |
| **Listen to clicks, typing & keys**     | `.onClick(cb)`, `.onDoubleClick(cb)`, `.onRightClick(cb)`, `.onChange(cb)`, `.onEnter(cb)`, `.contextMenu(items, cb)`                                       | Run a function when clicked, typed into (wrap `cb` in `rad.flowutils.debounce` if querying DB/HTTP), `Enter` pressed, or right-clicked                          |

> [!TIP]
> **`.id()` Placeholder Promotion:** Writing `win.addInput("Enter username").id("txtUser")` or `win.addTextInput("Enter username").id("txtUser")` automatically promotes `"Enter username"` into the input's **placeholder** (unless `.placeholder(...)` was set explicitly) and migrates any stored value or listeners to `"txtUser"`.

```typescript
// Reading, Updating, Fluent Chaining & Batch Forms Side-by-Side
win.addInput("Enter username").id("txtUser");
win.addCheckbox("Enable TLS", false).id("chkTls");
win.addSlider(0, 100, 50).id("sldVol");
win.addHtmlView("<em>Waiting...</em>", 320, 48).id("htmlBanner");

// 1. win.control(id) throws immediately on typo; win.getControl(id) returns null
const volHandle = win.control("sldVol"); // Throws if "sldVol" does not exist
const maybeMissing = win.getControl("optField"); // Returns SimpleControlRef | null
if (maybeMissing) {
  maybeMissing.toggleVisible(); // Returns new boolean visibility (not `this`)
  maybeMissing.toggleEnabled();
}

// 2. setText (escaped plain text) vs setChecked (checkbox boolean) vs setValue (data) vs setHtml (raw HTML)
win.setText("txtUser", "ada.lovelace"); // Sets input value cleanly (HTML-safe on labels/buttons)
win.setText("chkTls", "Force TLS 1.3"); // Updates checkbox LABEL caption only (does NOT check/uncheck!)
win.setChecked("chkTls", true); // Checks the checkbox without changing its caption
win.setValue("sldVol", 85); // Updates numeric slider value (or dropdown/progress)
win.setHtml("htmlBanner", "<strong>TLS Active</strong>"); // Writes raw innerHTML (trusted markup only!)

// 3. Fluent handle chaining & batch form state reads/writes
volHandle.value(90); // 1-arg sets; volHandle.value() reads ("90")
const snapshot = win.values(["txtUser", "chkTls", "sldVol"]); // { txtUser: "ada.lovelace", chkTls: true, sldVol: 90 }
win.setValues({ txtUser: "grace.hopper", chkTls: false, sldVol: 65 });
```

---

<a id="step-4-standard-controls--compound-labeled-form-builders"></a>

### Step 4: Standard Controls & Compound Labeled Form Builders

**Plain-English Summary:** SimpleGUI gives you **two ways** to add form inputs:

1. **Standard Controls (`win.addTextInput`, `win.addDropdown`, `win.addSwitch`, etc.):** Adds just the control itself. Use these when placing several controls inside a custom `win.row(...)` or `win.grid(...)`.
2. **Compound Labeled Form Builders (`win.addFormField`, `win.addFormDropdown`, `win.addFormSwitch`, etc.):** Adds **both the text label on the left AND the input control on the right** in a single clean line! Note that `addForm*` methods take `(label, id, defaultValue)` so you don't even need to chain `.id()`.

#### How to Read & Update Any Control (Without Surprises)

- **`win.control(id)` vs `win.getControl(id)`:** `win.control(id)` (alias `win.ref(id)`) returns a `SimpleControlRef` handle and **throws a descriptive error** if `id` does not exist — great for catching typos immediately. `win.getControl(id)` returns `null` when missing.
- **`getText` / `setText` vs `setValue` vs `setHtml`:**
  - `setText(id, text)` and `setValue(id, val)` **safely escape plain text** (`textContent` on `<button>`, `.rad-btn-caption` inside badge buttons, `.text`/`.caption` on checkbox/switch/label, `.value`/`.checked` on inputs/selects/checkboxes).
  - **Important for checkboxes & switches:** `getText(id)` / `setText(id, caption)` read/update the **label caption** without changing the checked boolean state; use `getBool(id)` / `setValue(id, true)` (or `.checked(true)`) for checked state!
  - `setHtml(id, rawHtml)` explicitly writes raw `innerHTML` when you intentionally render HTML markup (never pass untrusted user input to `setHtml`).
- **Batch Reads, Batch Writes & Resets:** Use `win.values()` / `win.getValues(ids?)` / `win.getAllValues()` / `win.getFormValues(ids?)` to read multiple fields into an object, `win.values(map)` / `win.setValues(map)` / `win.setFormValues(map)` / `win.setManyTexts(map)` to update many controls at once, and `win.resetForm(defaultsOrIds?)` / `win.clearForm()` to restore defaults or empty inputs.

| What You Need                            | Single-Control Method (`win.*`)                                                            | Fluent Handle (`win.control("id").*`)   | Batch Form / Table Method                                       |
| :--------------------------------------- | :----------------------------------------------------------------------------------------- | :-------------------------------------- | :-------------------------------------------------------------- |
| **Text Input / Search / Dropdown**       | `win.getText("txtUser")` · `win.setText("txtUser", "ada")`                                 | `.text()` · `.text("ada")` · `.clear()` | `win.values(["txtUser"])` · `win.setValues({ txtUser: "ada" })` |
| **Checkbox / Switch (checked state)**    | `win.getBool("swtDark")` · `win.setValue("swtDark", true)`                                 | `.checked()` · `.checked(true)`         | `win.setManyChecked({ swtDark: true })`                         |
| **Checkbox / Switch (label text only)**  | `win.getText("swtDark")` · `win.setText("swtDark", "Night Mode")`                          | `.text()` · `.text("Night Mode")`       | `win.setManyTexts({ swtDark: "Night Mode" })`                   |
| **Slider / Stepper / Number / Progress** | `win.getInt("sldVol")` · `win.getFloat("sldVol")` · `win.setValue("sldVol", 85)`           | `.value()` · `.value(85)`               | `win.setManyNumbers({ sldVol: 85 })`                            |
| **Raw HTML Markup (trusted only)**       | `win.setHtml("lblPreview", "<b>Ready</b>")`                                                | —                                       | —                                                               |
| **Visibility & Enabled Toggles**         | `win.setControlVisible("id", false)` · `win.showControls(["id"])` / `hideControls(["id"])` | `.toggleVisible()` · `.toggleEnabled()` | `win.setManyVisibility(map)` · `win.setManyEnabled(map)`        |
| **Dropdown Choices / Reset Form**        | `win.setListItems("cmbEnv", ["Dev", "Prod"]).setValue("cmbEnv", "Prod")`                   | `.options(["Dev", "Prod"])`             | `win.resetForm({ txtUser: "" })` · `win.clearForm()`            |

> 📖 **Deep-Dive Reference (Optional):** [Standard Controls Reference (`docs/SIMPLEGUI_API.md#controls-reference`)](docs/SIMPLEGUI_API.md#controls-reference) · [Compound Labeled Form Field Builders (`#compound-form-fields`)](docs/SIMPLEGUI_API.md#compound-form-fields) · [Supported Component Reference (`docs/API.md#3-supported-component-reference`)](docs/API.md#3-supported-component-reference)

#### 1. Standard Controls (`win.add*`)

```typescript
// --- Text & Input Boxes (All text inputs update on every single keystroke!) ---
win.addLabel("Status: Online").id("lblStatus");
// addTextInput(placeholder, initialValue, onChangeCallback?)
win
  .addTextInput("Enter username...", "admin", (w, text) => {
    console.log("User typed:", text);
  })
  .id("txtUser");

win.addPasswordInput("Enter password...").id("txtPass"); // Masks characters with dots (•••)
win
  .addSearchInput("Search records...", (w, query) => {
    // Fires immediately on every keystroke as the user types!
    console.log("Live search query:", query);
  })
  .id("txtSearch");
win
  .addTextArea("Multi-line notes...", "Initial notes")
  .id("txtNotes")
  .height(100);

// --- Checkboxes, Switches, Radio Buttons & Dropdowns ---
// addCheckbox(label, defaultChecked, onChangeCallback?)
win.addCheckbox("Remember session", true, (w, checked) => {}).id("chkRemember");
// addSwitch(label, defaultOn, onChangeCallback?)
win.addSwitch("Dark Mode", true, (w, isOn) => {}).id("swtDark");
// addRadioGroup(id, optionsArray, defaultSelected, onChangeCallback?)
win.addRadioGroup(
  "grpPlan",
  ["Starter", "Pro", "Enterprise"],
  "Pro",
  (w, chosen) => {},
);
// addDropdown(optionsArray, defaultSelected, onChangeCallback?)
win
  .addDropdown(["Dev", "Staging", "Production"], "Staging", (w, chosen) => {})
  .id("cmbEnv");
// addListBox(itemsArray, defaultSelectedIndex, onSelectCallback?)
win
  .addListBox(["api-server", "worker-node", "redis-cache"], 0, (w, item) => {})
  .id("lstNodes");

// --- Sliders, Steppers, Progress Bars & Pickers ---
// addSlider(min, max, initialValue, onChangeCallback?)
win
  .addSlider(0, 100, 75, (w, val) => w.setValue("prgBuild", Number(val)))
  .id("sldVol");
// addStepper(min, max, initialValue, onChangeCallback?) — +/- number counter box
win.addStepper(1, 32, 4, (w, val) => {}).id("stpThreads");
// addProgressBar(currentValue, maxValue)
win.addProgressBar(68, 100).id("prgBuild");
win.addDatePicker("2026-11-07", (w, dateStr) => {}).id("dtRelease");
win.addTimePicker("09:30", (w, timeStr) => {}).id("tmDeploy");
win.addColorWell("#38bdf8", (w, hexColor) => {}).id("clrAccent");
// addBadge(text, variant) — variant can be "info" | "success" | "warning" | "error"
win.addBadge("HEALTHY", "success").id("bdgHealth");

// --- Code Viewer, Markdown Viewer & Live HTML Box ---
win.addCodeView("const x: number = 42;", "typescript").id("codePreview");
win.addMarkdownView(
  "mdDoc",
  "# Release v1.5\n- Zero-config SQLite\n- 310 Themes (167 FX)",
  140,
);
win
  .addHtmlView("<h3>Live HTML</h3><p>Updated via setHtml()</p>", 400, 100)
  .id("htmlPreview");
win.setHtml("htmlPreview", "<h3>Updated!</h3><p>Real-time DOM injection.</p>");
```

#### 2. Compound Labeled Form Builders (`win.addForm*` — Label + Input in 1 Line)

Each `addForm*` method takes **`(labelText, controlId, initialValue)`** and automatically aligns the label and input field for you:

```typescript
win.beginCard("⚙️ Service Configuration");
win.addFormField("Service Name:", "fName", "auth-gateway"); // Text input with label
win.addFormPassword("Signing Secret:", "fSecret", "placeholder-pw"); // Password input with label
win.addFormDropdown(
  "Region:",
  "fRegion",
  ["us-east-1", "eu-west-1", "ap-northeast-1"],
  "us-east-1",
);
win.addFormNumber("Max Workers:", "fWorkers", 8); // Numeric input with label
win.addFormSlider("CPU Limit (%):", "fCpuLimit", 80); // Slider (0..100) with label
win.addFormDatePicker("Maintenance Date:", "fMaintDate", "2026-12-01");
win.addFormSwitch(
  "Auto-Scaling:",
  "fAutoScale",
  "Enable horizontal scaling",
  true,
);
win.addFormProgress("Rollout Progress:", "fRollout", 100);
win.addFormTextarea(
  "Deployment Notes:",
  "fNotes",
  "Zero-downtime rolling update.",
);
win.addFormLink(
  "Runbook:",
  "fRunbook",
  "Open Production Runbook",
  "https://bun.sh",
);
win.endCard();
```

---

<a id="step-5-tabs-segmented-controls--multi-view-switching"></a>

### Step 5: Tabs, Segmented Controls & Multi-View Switching

**Plain-English Summary:** How do you create a multi-page app with tabs like `"📊 Overview"`, `"🔍 Explorer"`, and `"⚙️ Settings"`?

1. Give each card or control an `.id("...")`.
2. Create a dictionary (`TAB_VIEWS`) that lists which control IDs belong to which tab.
3. Call `win.addTabs(["📊 Overview", "🔍 Explorer", "⚙️ Settings"], 0).bindViews(TAB_VIEWS)`.
   That's it! When the user clicks a tab, SimpleGUI automatically shows that tab's controls and hides the others.

> 📖 **Deep-Dive Reference (Optional):** [Standard Controls Reference (`docs/SIMPLEGUI_API.md#controls-reference`)](docs/SIMPLEGUI_API.md#controls-reference) · [Modern Desktop & Dashboard Controls (`#dashboard-controls`)](docs/SIMPLEGUI_API.md#dashboard-controls) · [Enterprise Navigation (`#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have`)](docs/SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have)

```typescript
// 1. Define which control IDs belong to each tab
const TAB_VIEWS: Record<string, string[]> = {
  "📊 Overview": ["cardOverview", "chartTraffic", "tblRecent"],
  "🔍 Explorer": ["cardExplorer", "txtSearch", "tblRecords"],
  "⚙️ Settings": ["cardSettings", "fName", "cmbTheme", "swtAutoSave"],
};

// 2. Recommended 1-Line Way: Chain .bindViews(TAB_VIEWS) onto addTabs()!
//    It automatically hides non-active tabs at startup and switches views when clicked.
win
  .addTabs(["📊 Overview", "🔍 Explorer", "⚙️ Settings"], 0)
  .id("mainTabs")
  .bindViews(TAB_VIEWS, (w, activeTab) => {
    w.setStatusBarText(`Active view: ${activeTab}`);
  });

// (Alternative Manual Way: If you ever want to show/hide groups of controls yourself)
function switchTabViewManually(w: SimpleWindow, activeTab: string) {
  for (const [tabName, controlIds] of Object.entries(TAB_VIEWS)) {
    if (tabName === activeTab) w.showControls(controlIds);
    else w.hideControls(controlIds);
  }
}

// 3. Closable IDE / Document Tabs (Each tab has an "×" close button)
win
  .addTabs(["index.ts", "schema.sql", "README.md"], 0)
  .id("docTabs")
  .closable(true)
  .onTabClose((w, closedTab) => w.toast(`Closed ${closedTab}`))
  .onChange((w, openTab) => w.setStatusBarText(`Editing ${openTab}`));

// 4. Segmented Pill Control (Great for switching chart time ranges like 24h / 7d / 30d)
win
  .addSegmentedControl(["24h", "7d", "30d", "90d"], 1, (w, range) => {
    w.toast(`Switched telemetry window to: ${range}`);
  })
  .id("segRange");

// 5. Enterprise Top AppBar (Full header bar with Title + Tabs + Search Box + Notification Badge)
win.appBar("OmniStudio", ["Dashboard", "Analytics", "Settings"], {
  search: true,
  menuButton: true,
  actions: [
    { label: "Alerts", icon: "bell", badge: 3, value: "alerts" },
    { label: "Profile", icon: "user", value: "profile" },
  ],
  onClick: (w, actionOrTab) => w.toast(`AppBar selected: ${actionOrTab}`),
});
```

---

<a id="step-6-live-search-filtering--dynamic-data-tables"></a>

### Step 6: Live Search Filtering & Dynamic Data Tables

**Plain-English Summary:** Data tables (`win.addTable`) display rows of strings (`string[][]`).

- **How table clicks work:** When a user clicks (or double-clicks) a row in `addTable`, your callback `(w, selectedRowId)` receives the **first column (`row[0]`)** of that row as `selectedRowId` (for example, `"srv-01"`).
- **How live search works:** Because `addSearchInput` fires on every keystroke, you have **two easy ways** to filter a table live as the user types:
  1. **1-Line Automatic Way (`.filterTable` or `win.bindTableFilter`):** Filters any table across all columns automatically!
  2. **Custom Filter Way (`w.setTableRows`):** Write a small function that filters your array (or runs a SQLite `SELECT ... WHERE name LIKE ?` query) and calls `w.setTableRows("tblServices", filteredRows)` to update the table on screen immediately.

> 📖 **Deep-Dive Reference (Optional):** [Real-Time Keystroke & Input Synchronization (`docs/SIMPLEGUI_API.md#real-time-keystroke--input-synchronization`)](docs/SIMPLEGUI_API.md#real-time-keystroke--input-synchronization) · [Data Tables & Virtual Lists (`docs/SIMPLEGUI_API.md#controls-reference`)](docs/SIMPLEGUI_API.md#controls-reference) · [Databases Overview (`docs/databases/index.md`)](docs/databases/index.md) · [Complete Databases Guide (`docs/databases/complete-databases-guide.md`)](docs/databases/complete-databases-guide.md)

```typescript
// 1. Your table rows: each row is an array of strings matching the column headers.
//    Tip: Put the unique ID in column 0 so row click callbacks receive that ID!
const ALL_SERVICES = [
  ["srv-01", "Auth Gateway", "Production", "99.99%", "Healthy"],
  ["srv-02", "Billing Worker", "Production", "99.95%", "Healthy"],
  ["srv-03", "Search Indexer", "Staging", "98.40%", "Degraded"],
  ["srv-04", "Analytics Ingest", "Development", "100.0%", "Healthy"],
  ["srv-05", "Notification Hub", "Production", "99.91%", "Healthy"],
];

// 2. Custom Filter Function (Combines the Search Box text + Environment Dropdown)
function refreshServiceTable(w: SimpleWindow) {
  const query = (w.getText("txtLiveSearch") || "").trim().toLowerCase();
  const envFilter = w.getText("cmbEnvFilter") || "All";

  const filtered = ALL_SERVICES.filter(([id, name, env, uptime, status]) => {
    const matchesEnv = envFilter === "All" || env === envFilter;
    const matchesQuery =
      !query ||
      id?.toLowerCase().includes(query) ||
      name?.toLowerCase().includes(query) ||
      status?.toLowerCase().includes(query);
    return matchesEnv && matchesQuery;
  });

  // Update the table on screen with the matching rows!
  w.setTableRows("tblServices", filtered);
  w.setText(
    "lblMatchCount",
    `${filtered.length} / ${ALL_SERVICES.length} services`,
  );
  w.setStatusBarText(`Showing ${filtered.length} matching service(s)`);
}

// 3. Build the Search & Filter Bar
win.beginRow();
win
  .addSearchInput("🔍 Type to filter by ID, name, or status...", (w) =>
    refreshServiceTable(w),
  )
  .id("txtLiveSearch")
  .width(340);
win
  .addDropdown(["All", "Production", "Staging", "Development"], "All", (w) =>
    refreshServiceTable(w),
  )
  .id("cmbEnvFilter")
  .width(160);
win
  .addButton("🧹 Clear", (w) => {
    w.setText("txtLiveSearch", "");
    w.setValue("cmbEnvFilter", "All");
    refreshServiceTable(w);
  })
  .width(90);
win.addLabel("5 / 5 services").id("lblMatchCount").bold();
win.endRow();

// 4. Add the Data Table: addTable(id, columnHeaders, initialRows, onRowClickCallback)
win
  .addTable(
    "tblServices",
    ["ID", "Service Name", "Environment", "Uptime", "Status"],
    ALL_SERVICES,
    (w, selectedRowId) => {
      // selectedRowId is the first cell (column 0) of the clicked row, e.g. "srv-01"
      w.setState("selected_service", String(selectedRowId));
      w.setStatusBarText(`Selected service: ${selectedRowId}`);
    },
  )
  .multiSelect(true) // Allow selecting multiple rows
  .checkboxSelection(true) // Show a checkbox on the left of every row
  .onDoubleClick((w, rowId) => {
    w.info(
      "Service Inspector",
      `Inspecting live metrics for service: ${rowId}`,
    );
  });

// --- BONUS TABLE POWER SHORTCUTS ---

// Shortcut A: 1-Line Live Search (if you only need a search box without extra dropdown filters)
win.bindTableFilter("txtLiveSearch", "tblServices", () => ALL_SERVICES, {
  countControlId: "lblMatchCount",
  countFormat: (matched, total) => `${matched} / ${total} services`,
});

// Shortcut B: 1-Line Master-Detail Form Fill
// Clicking any row in "tblServices" automatically copies its 5 cells into these 5 form controls!
win.bindMasterDetail("tblServices", [
  "txtId",
  "txtName",
  "cmbEnv",
  "txtUptime",
  "cmbStatus",
]);

// Shortcut C: Read or Export Table Data as Objects, CSV, or JSON in 1 Line
const rows = win.getTableRows("tblServices"); // Returns string[][]
const objects = win.getTableObjects("tblServices"); // Returns [{ ID: "srv-01", "Service Name": "Auth Gateway", ... }]
const csvText = win.exportTableCsv("tblServices"); // Returns ready-to-save CSV text
const jsonText = win.exportTableJson("tblServices"); // Returns formatted JSON string
```

> [!TIP]
> **Have 5,000+ rows? Use `virtualList`:** Standard tables are great for up to a few hundred rows. When displaying thousands of log lines, use `win.virtualList(items, { search: true })`, which only renders the rows currently visible on screen:

```typescript
win.virtualList(
  Array.from({ length: 5000 }, (_, i) => ({
    primary: `Log Entry #${i + 1}`,
    secondary: `2026-11-07T06:00:${String(i % 60).padStart(2, "0")}Z`,
  })),
  {
    search: true,
    width: 420,
    height: 260,
    onClick: (w, row) => w.toast(`Clicked #${row.index + 1}`),
  },
);
```

---

<a id="step-7-charts-gauges-sparklines--live-telemetry"></a>

### Step 7: Charts, Gauges, Sparklines & Live Telemetry

**Plain-English Summary:** You don't need Chart.js or D3 to build live monitoring dashboards.

1. Add a chart or gauge (`win.addChart("myChart", "line", 140)`, `win.addSparkline("mySpark", [10, 20, 30], 40)`, `win.addCircularProgress("myRing", 75)`, or `win.addGauge("myGauge", "Disk", 60)`).
2. To make it update live on screen every second, call `win.addTimer(1000, (w) => { ... })` and push new numbers using `w.setChartData("myChart", numbers)`, `w.setSparklineData("mySpark", numbers)`, `w.setCircularProgress("myRing", 80)`, or `w.setGaugeValue("myGauge", 65)`.

> 📖 **Deep-Dive Reference (Optional):** [Modern Desktop & Analytics Dashboard Controls (`docs/SIMPLEGUI_API.md#dashboard-controls`)](docs/SIMPLEGUI_API.md#dashboard-controls) · [Timers API (`#timers-api`)](docs/SIMPLEGUI_API.md#timers-api) · [Async Workflows, Busy States & Timers (`#async-busy-timers`)](docs/SIMPLEGUI_API.md#async-busy-timers)

```typescript
// Row 1: Executive KPI Cards, Donut Chart & Apple Watch-Style Activity Rings
win.beginRow();
// addScoreCard(title, numericScore, subtitle, letterGrade)
win
  .addScoreCard("System Health", 99.4, "All clusters nominal", "A+")
  .width(185);
// addDonutChart(id, title, percentage0to100, subtitle)
win.addDonutChart("donutCpu", "CPU Load", 64, "10.2 / 16 Cores").width(180);
// addActivityRings(id, arrayOf3ConcentricRings)
win
  .addActivityRings("ringsCluster", [
    { label: "Compute", percent: 82, color: "#fa114f" },
    { label: "Memory", percent: 68, color: "#a1ff00" },
    { label: "Network", percent: 91, color: "#00f0ff" },
  ])
  .width(175);
// statistic(title, value, options) — Big number KPI box with trend arrow
win.statistic("Throughput", 14280, {
  suffix: " req/s",
  trend: "+18.4%",
  width: 190,
});
win.endRow();

// Row 2: Vector Line/Bar Chart, Radial Progress Ring, Dial Gauge & Inline Sparkline
win.beginRow();
// addChart(id, "line" | "bar", heightInPx)
win.addChart("crtLatency", "line", 140).width(340);
// addCircularProgress(id, percentage0to100)
win.addCircularProgress("cprMem", 72);
// addGauge(id, label, value0to100)
win.addGauge("ggeDisk", "NVMe Usage", 58);
// addSparkline(id, initialNumberArray, heightInPx)
win.addSparkline("spkRps", [18, 24, 32, 29, 45, 52, 61, 58, 74], 40);
win.endRow();

// Row 3: Proportional Stacked Bar & GitHub-Style Contribution Heatmap
win.addSegmentDistributionBar("segStorage", [
  { label: "Database", value: 45, color: "#38bdf8" },
  { label: "Media", value: 30, color: "#a78bfa" },
  { label: "Logs", value: 15, color: "#f59e0b" },
  { label: "Free", value: 10, color: "#10b981" },
]);
win.addActivityHeatmap("heatCommits", 16); // Shows 16 weeks of activity squares

// Row 4: Live Timer — Automatically runs every 1000ms (1 second) and updates the charts!
const series = [22, 28, 35, 31, 44, 52, 49, 63];
win.addTimer(
  1000,
  (w) => {
    const nextVal = Math.floor(30 + Math.random() * 55);
    series.push(nextVal);
    if (series.length > 10) series.shift(); // Keep the last 10 points

    // Push the new numbers to the charts & gauges on screen:
    w.setChartData("crtLatency", series);
    w.setSparklineData("spkRps", series);
    w.setCircularProgress("cprMem", nextVal);
    w.setGaugeValue("ggeDisk", Math.min(100, nextVal + 10));
  },
  { id: "telemetryTimer" },
);
```

| Chart / Telemetry Widget      | How You Create It                                      | How You Update It Live                 |
| :---------------------------- | :----------------------------------------------------- | :------------------------------------- |
| **Vector Line / Bar Chart**   | `win.addChart(id, "line" \| "bar", height)`            | `win.setChartData(id, number[])`       |
| **Inline SVG Sparkline**      | `win.addSparkline(id, number[], height)`               | `win.setSparklineData(id, number[])`   |
| **Circular Progress Ring**    | `win.addCircularProgress(id, percent)`                 | `win.setCircularProgress(id, percent)` |
| **Metric Comparison Gauge**   | `win.addGauge(id, title, value)`                       | `win.setGaugeValue(id, value)`         |
| **Donut Percentage Chart**    | `win.addDonutChart(id, title, pct, subtitle)`          | `win.setValue(id, pct)`                |
| **Concentric Activity Rings** | `win.addActivityRings(id, rings[])`                    | `win.setValue(id, rings)`              |
| **Proportional Segment Bar**  | `win.addSegmentDistributionBar(id, segments[])`        | `win.setValue(id, segments)`           |
| **Activity Heatmap**          | `win.addActivityHeatmap(id, weeks, data?)`             | `win.setValue(id, data)`               |
| **Executive Score Card**      | `win.addScoreCard(title, score, sub, grade)`           | `win.setText(id, title)`               |
| **Enterprise KPI Statistic**  | `win.statistic(title, val, { prefix, suffix, trend })` | `win.setValue(id, val)`                |

---

<a id="step-8-vlang-parity-studio-extended--35-enterprise-widgets"></a>

### Step 8: VLang Parity, Studio Extended & 35 Enterprise Widgets

**Plain-English Summary:** Need advanced UI components like an **Autocomplete box**, **Multi-level Cascader**, **@Mentions input**, **Rich Text Editor**, **Signature Pad**, **Copy-to-Clipboard button**, **Delete Confirmation Popover (`popconfirm`)**, **Kanban Board**, or **Slide-out Sidebar Drawer**? They are all built directly into `win.*` with zero external libraries! Every enterprise widget returns a `SimpleControlRef` and can also be constructed via `win.ui("<type>", cfg)` or driven dynamically via `win.uiCall(id, method, ...args)`.

| Group                     | `win.*` Enterprise Helpers (`src/simplegui.ts`)                                                                                                                                                                        | What They Do (Plain English)                                                                                                                                                                                                                               |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feedback & Surfaces**   | `skeleton`, `paper`, `emptyState`, `result`, `backdrop` (+`showBackdrop`/`hideBackdrop`)                                                                                                                               | Loading shimmer placeholders, elevated surface cards, zero-data states, status result banners, and full-window blocking backdrops                                                                                                                          |
| **Navigation & Overlays** | `appBar`, `bottomNav`, `fab`, `speedDial`, `backToTop`, `scrollProgress`, `drawer` (+`openDrawer`/`closeDrawer`/`toggleDrawer`), `popover`, `hoverCard`, `popconfirm`, `tour` (+`startTour`/`stopTour`), `anchorLinks` | App top/bottom bars, floating action buttons & speed dials, scroll indicators, slide-out navigation drawers, click/hover popovers, inline delete confirmations (`popconfirm`), guided UI onboarding tours, and smooth anchor jump links                    |
| **Advanced Inputs**       | `autocomplete` (multi / free-solo / groups), `cascader`, `treeSelect`, `mentions`, `signaturePad`, `richText`, `copyButton`, `loadingButton` (+`setLoading`)                                                           | Searchable tag/combo dropdowns, hierarchical region pickers, collapsible tree selectors, `@mention` textareas, mouse/touch signature canvases (outputs PNG data URL), WYSIWYG HTML editors, one-click clipboard copy buttons, and spinner buttons          |
| **Data Display**          | `chips`, `avatarGroup`, `descriptions`, `statistic`, `countdown`, `watermark`, `masonry`, `imageCompare`, `marquee`, `typography`, `virtualList`                                                                       | Interactive pill chips, stacked "+N" avatars, key/value description grids, animated KPI counters, live countdown timers, repeating watermarks, Pinterest masonry grids, before/after image sliders, tickers, themed headings, and 100k+ row windowed lists |

> 📖 **Deep-Dive Reference (Optional):** [VLang SimpleGUI Control Parity (`docs/SIMPLEGUI_API.md#-vlang-simplegui-control-parity-55-controls--nameless-shorthands`)](docs/SIMPLEGUI_API.md#-vlang-simplegui-control-parity-55-controls--nameless-shorthands) · [Enterprise Components (`docs/SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have`)](docs/SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have) · [Visual Components (`docs/API.md#visual-components`)](docs/API.md#visual-components)

```typescript
// --- 1. Rich Inputs & Selectors ---
// Autocomplete: Text box that suggests matching items as the user types
win.autocomplete(["Bun", "TypeScript", "SQLite", "Rust"], {
  label: "Runtime",
  placeholder: "Type to filter...",
  onChange: (w, val) => w.toast(`Picked: ${val}`),
});

// Cascader: Multi-level drill-down picker (e.g. Region -> Zone)
win.cascader(
  [
    {
      label: "US-East",
      value: "use1",
      children: [{ label: "Zone A", value: "a" }],
    },
  ],
  { label: "Availability Zone", width: 300 },
);

// TreeSelect: Dropdown with a collapsible folder/file tree inside
win.treeSelect(
  [
    {
      label: "src",
      value: "src",
      children: [{ label: "index.ts", value: "idx" }],
    },
  ],
  { label: "Source Files", multiple: true, expandAll: true, width: 320 },
);

// Mentions: Input box that pops up a user list when you type "@"
win.mentions(["Ada", "Alan", "Grace"], {
  placeholder: "Type @ to mention...",
  width: 380,
});

// RichText & SignaturePad: WYSIWYG formatting editor and mouse/trackpad signature canvas
win.richText({
  value: "<b>Formatted</b> rich text note",
  width: 480,
  height: 180,
});
win.signaturePad({ width: 380, height: 150, saveButton: true });

// --- 2. Smart Action Buttons & Popovers ---
// CopyButton: Copies text to OS clipboard and shows a "Copied!" checkmark automatically
win.copyButton("Copy Token", "placeholder-token-2026", { width: 150 });

// LoadingButton: Automatically shows a spinner when clicked, or toggle manually with win.setLoading(id, bool)
win.loadingButton("Run Migration", {
  id: "btnMigrate",
  autoLoadingMs: 1500,
  color: "success",
  width: 160,
});

// Popconfirm: Asks "Are you sure?" in a small bubble before running destructive actions
win.popconfirm("Drop Table", "Permanently drop table?", {
  text: "This action cannot be undone.",
  onChange: (w, confirmed) => confirmed && w.toast("Dropped!", 1500, "error"),
});

// Popover, HoverCard, Floating Action Button (FAB) & SpeedDial
win.popover("Inspect Headers", {
  title: "HTTP/2",
  text: "cache-control: max-age=3600",
});
win.hoverCard("@ada", { name: "Ada Lovelace", text: "Principal Architect" });
win.fab("add", {
  label: "New Record",
  onClick: (w) => w.toast("Creating record..."),
});
win.speedDial(
  [
    { id: "export", icon: "download", label: "Export CSV" },
    { id: "share", icon: "share", label: "Share Link" },
  ],
  { direction: "right", onClick: (w, id) => w.toast(`Action: ${id}`) },
);

// --- 3. Tag Chips, Key-Value Descriptions, Kanban Board & Slide-Out Drawer ---
win.chips(["Zero Config", { label: "WAL Mode", color: "success" }], {
  clickable: true,
  selectable: true,
  deletable: true,
});
win.descriptions(
  "Cluster Node #1",
  [
    ["Host", "10.0.4.12"],
    ["Kernel", "Darwin arm64"],
    ["Status", "ONLINE"],
  ],
  { bordered: true, width: 520 },
);
win.addKanbanBoard("kanbanSprint", [
  {
    id: "todo",
    title: "To Do",
    cards: [{ id: "1", title: "Add FTS5 Search", tag: "DB" }],
  },
  {
    id: "done",
    title: "Done",
    cards: [{ id: "2", title: "Ship 310 Themes", tag: "UI" }],
  },
]);
win.drawer("Workspace Menu", {
  id: "mainDrawer",
  trigger: "☰ Open Drawer",
  anchor: "left",
  items: [
    { label: "Dashboard", icon: "home", value: "dash" },
    { label: "Settings", icon: "settings", value: "settings" },
  ],
});
// Runtime imperative calls: win.openDrawer("mainDrawer"), win.startTour("tourId"), win.uiCall("cmpId", "reset", 60)
```

---

<a id="step-9-reactive-state-store-two-way-binding--os-persistence"></a>

### Step 9: Reactive State Store, Two-Way Binding & OS Persistence

**Plain-English Summary:**

- **What is `.bindState("key")`?** It links a UI control directly to a named variable inside `win`. If the user types into the box, `win.getState("key")` updates automatically. If your code calls `win.setState("key", "new value")`, the UI box on screen updates automatically!
- **What is `validateForm`?** Pass a rules object (`required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `validate`, `message`, `label`, or a validator function `(val, win) => boolean | string`) to `win.validateForm(rules, opts?)`. For emails, use `pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/` or `validate: (v) => rad.validutils.isEmail(v) || "Invalid email"`. It returns `{ valid, errors, firstErrorId, firstInvalidId, firstErrorMessage }`.
- **How do I save user settings to disk?** Pass `{ autoSaveState: true, appId: "my_app" }` (or call `win.enableAutoSave()` with zero args) to auto-save `session.json` + `form_state.json`, call `win.enableAutoSaveState("my_app")` to auto-save `stateStore`, or use `win.saveValuesToFile("./my_settings.json")`.

#### `validateForm(rules, opts?)` Rule Keys & Options (`src/simplegui.ts`)

| Rule Key / Option             | Type / Purpose                                                                | Example                                                                      |
| :---------------------------- | :---------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **`required`**                | `boolean` — rejects empty strings or empty selections                         | `{ required: true, label: "Workspace" }`                                     |
| **`minLength` / `maxLength`** | `number` — enforces trimmed string length bounds                              | `{ minLength: 3, maxLength: 64 }`                                            |
| **`min` / `max`**             | `number` — parses finite numbers and checks inclusive bounds                  | `{ min: 1, max: 65535, label: "Port" }`                                      |
| **`pattern`**                 | `RegExp` — validates text against a regex pattern                             | `{ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter valid email" }`    |
| **`validate`**                | `(val, win) => boolean \| string` (or pass the function directly as the rule) | `validate: (v, w) => v === w.getText("txtPass") \|\| "Passwords must match"` |
| **`label` / `message`**       | Custom display name or override error message                                 | `{ required: true, label: "API URL" }`                                       |
| **2nd arg `opts`**            | `{ highlight?: boolean; focusFirst?: boolean; toastOnError?: boolean }`       | Highlights invalid inputs, focuses `firstInvalidId`, optional error toast    |

#### Exact OS Persistence Directory Paths (`src/simplegui.ts`)

| Helper / File                                                                     | macOS Path                                      | Linux Path                                          | Windows Path                                |
| :-------------------------------------------------------------------------------- | :---------------------------------------------- | :-------------------------------------------------- | :------------------------------------------ |
| **`getAppStateDir(app)`** (`session.json`, `form_state.json`, `enableAutoSave()`) | `~/Library/Application Support/<app>`           | `$XDG_STATE_HOME/<app>` (or `~/.local/state/<app>`) | `%LOCALAPPDATA%\<app>`                      |
| **`getAppConfigDir(app)`**                                                        | `$XDG_CONFIG_HOME/<app>` (or `~/.config/<app>`) | `$XDG_CONFIG_HOME/<app>` (or `~/.config/<app>`)     | `%APPDATA%\<app>`                           |
| **`getAppDataDir(app)`**                                                          | `~/Library/Application Support/<app>`           | `$XDG_DATA_HOME/<app>` (or `~/.local/share/<app>`)  | `%LOCALAPPDATA%\<app>`                      |
| **`getAppCacheDir(app)`**                                                         | `~/Library/Caches/<app>`                        | `$XDG_CACHE_HOME/<app>` (or `~/.cache/<app>`)       | `%LOCALAPPDATA%\<app>\Cache`                |
| **`getAppLogDir(app)`**                                                           | `~/Library/Logs/<app>`                          | `<stateDir>/log`                                    | `%LOCALAPPDATA%\<app>\Logs`                 |
| **Global Theme (`saveTheme` / `getSavedTheme`)**                                  | `~/.config/simplegui/theme.txt`                 | `~/.config/simplegui/theme.txt`                     | `%USERPROFILE%\.config\simplegui\theme.txt` |

> 📖 **Deep-Dive Reference (Optional):** [Form State, Serialization & Bulk Operations (`docs/SIMPLEGUI_API.md#form-state-serialization`)](docs/SIMPLEGUI_API.md#form-state-serialization) · [Reactive State Store (`#reactive-state-store`)](docs/SIMPLEGUI_API.md#reactive-state-store) · [Two-Way Data & Event Binding (`#data-event-binding`)](docs/SIMPLEGUI_API.md#data-event-binding) · [App State & OS Directories (`#app-state-persistence`)](docs/SIMPLEGUI_API.md#app-state-persistence) · [Data & Files Reference (`docs/reference/data-and-files.md`)](docs/reference/data-and-files.md)

```typescript
// 1. Two-Way Reactive State Binding (.bindState)
//    Links "txtOrg" to the state key "org_name", and "sldQuota" to "quota_pct"
win
  .addTextInput("Organization Name", "Acme Corp")
  .id("txtOrg")
  .bindState("org_name");
win.addSlider(0, 100, 50).id("sldQuota").bindState("quota_pct");

// Run a callback whenever "org_name" or "quota_pct" changes (from user typing OR code!)
win.onStateChange("org_name", (w, val) => {
  w.setText(
    "lblHeader",
    `Workspace: ${val} (Quota: ${w.getState("quota_pct")}%)`,
  );
});
win.onStateChange("quota_pct", (w, val) => {
  w.setText(
    "lblHeader",
    `Workspace: ${w.getState("org_name")} (Quota: ${val}%)`,
  );
});

// Changing state from code automatically updates the text box & slider on screen!
win.setState("org_name", "Cyberdyne Systems");
win.setStateInt("quota_pct", 85);

// 2. Read, Fill, or Reset an Entire Form in 1 Line
const allValues = win.getFormValues(); // Or win.values() -> { txtOrg: "Cyberdyne Systems", sldQuota: 85, ... }
const subset = win.values(["txtOrg", "sldQuota"]); // Read only specific control IDs
win.setValues({ txtOrg: "Globex", sldQuota: 60 }); // Update multiple controls cleanly
win.resetForm({ txtOrg: "Acme Corp", sldQuota: 50 }); // Reset form back to default values
win.disableControls(["txtOrg", "sldQuota"]); // Grey out / lock multiple controls
win.enableControls(["txtOrg", "sldQuota"]); // Re-enable them

// 3. 1-Line Form Validation (Checks rules, highlights errors, and focuses first broken field)
const validation = win.validateForm(
  {
    txtOrg: { required: true, minLength: 2, label: "Organization" },
    txtEmail: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Enter a valid contact email",
    },
    sldQuota: { min: 10, max: 100, label: "Quota (%)" },
  },
  { highlight: true, focusFirst: true },
);
if (!validation.valid) {
  win.warn("Validation Error", Object.values(validation.errors).join("\n"));
}

// 4. Save & Load Settings on Disk (using appId + OS-native state folders)
win.enableAutoSave(); // Zero-arg helper: saves form inputs, geometry & theme on close
win.saveAppFormState(); // Save form inputs & session immediately
win.restoreAppFormState(); // Restore saved form inputs (respects explicit constructor options)
win.saveAppState("my_studio_app"); // Save reactive state store to OS state folder
win.loadAppState("my_studio_app"); // Load reactive state store from OS state folder
win.saveValuesToFile("./workspace_backup.json"); // Save all form values to any JSON file
win.loadValuesFromFile("./workspace_backup.json"); // Load form values back from a JSON file
```

---

<a id="step-10-menus-context-menus-sweetalert2-fire-modals--file-pickers"></a>

### Step 10: Menus, Context Menus, SweetAlert2 `fire()`, Modals & File Pickers

**Plain-English Summary:**

- **Need a quick notification banner?** Call `win.toast("Saved!", 2000, "success")`.
- **Need an alert box?** Call `win.info("Title", "Message")`, `win.warn(...)`, or `win.error(...)`.
- **Need a Yes/No question or text prompt?** Call `win.confirm("Delete?", "Confirm", (yes) => ...)` or `win.prompt("Name:", "default", "Title", (val) => ...)`.
- **Need a rich 3-button dialog (Confirm / Deny / Cancel)?** Call `win.fire({ title, text, icon, showDenyButton, showCancelButton }, (res) => ...)`.
- **Need a file or folder picker?** Use `win.open_webview_file_dialog`, `win.open_webview_folder_dialog`, or `win.save_webview_file_dialog`—they render right inside the window and work on macOS, Linux, and Windows without OS permission popups!

> 📖 **Deep-Dive Reference (Optional):** [Desktop Menu Bar, Toolbars & Context Menus (`docs/SIMPLEGUI_API.md#15--desktop-menu-bar-toolbars--context-menus`)](docs/SIMPLEGUI_API.md#15--desktop-menu-bar-toolbars--context-menus) · [SweetAlert2-Style Dialogs (`#dialogs-sweetalert2-style`)](docs/SIMPLEGUI_API.md#dialogs-sweetalert2-style) · [In-Window Dialogs, Alerts & Prompts (`#dialogs-alerts`)](docs/SIMPLEGUI_API.md#dialogs-alerts) · [Async Busy State (`#async-busy-state`)](docs/SIMPLEGUI_API.md#async-busy-state)

```typescript
// 1. Top Desktop Menu Bar & Quick Action Toolbar
//    Use "---" inside items[] to draw a divider line between menu items!
win.addMenuBar("mainMenu", [
  {
    label: "File",
    items: [
      "📄 New  ⌘N",
      "📂 Open...  ⌘O",
      "💾 Save  ⌘S",
      "---",
      "🚪 Quit  ⌘Q",
    ],
  },
  { label: "View", items: ["🎨 Switch Theme", "🖥 Toggle Fullscreen  F11"] },
]);
win.onClick("mainMenu", (w, clickedItem) => {
  if (clickedItem.includes("Quit")) w.quit();
  else w.toast(`Menu clicked: ${clickedItem}`);
});

win.addToolBar("mainToolbar", [
  "📄 New",
  "📂 Open",
  "💾 Save",
  "🔄 Refresh",
  "⚙️ Settings",
]);
win.onClick("mainToolbar", (w, action) =>
  w.setStatusBarText(`Toolbar: ${action}`),
);

// 2. Right-Click Context Menus (On the whole window OR on a specific control)
win.setGlobalContextMenu([
  "🔄 Refresh View",
  "🎨 Cycle Theme",
  "---",
  "ℹ️ About Studio",
]);
win.onGlobalContextMenu((w, action) => w.toast(`Canvas action: ${action}`));

win
  .addTextInput("Right-click this input box!", "Hello World")
  .id("txtEditable")
  .contextMenu(["🔤 UPPERCASE", "🔡 lowercase", "🧹 Clear"], (w, action) => {
    const cur = w.getText("txtEditable");
    if (action.includes("UPPER")) w.setText("txtEditable", cur.toUpperCase());
    else if (action.includes("lower"))
      w.setText("txtEditable", cur.toLowerCase());
    else w.setText("txtEditable", "");
  });

// 3. Popups: Info, Warning, Error, Yes/No Confirm, Text Prompt & SweetAlert2 fire()
win.info("Saved", "Configuration written to disk.");
win.warn("High Latency", "Upstream API response exceeded 500ms.");
win.error("Connection Lost", "Could not reach database replica.");

win.confirm(
  "Apply schema changes to production?",
  "Confirm Migration",
  (ok) => {
    if (ok) win.toast("Migration started!", 2000, "success");
  },
);

win.prompt("Enter release tag:", "v1.6.0", "Create Tag", (tag) => {
  if (tag !== null) win.toast(`Tagged ${tag}`);
});

// SweetAlert2-style fire() dialog with Confirm, Deny, and Cancel buttons
win.fire(
  {
    title: "Publish Release v1.6.0?",
    text: "Choose how to handle this release artifact:",
    icon: "question", // "success" | "error" | "warning" | "info" | "question"
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: "🚀 Publish Now",
    denyButtonText: "📝 Save as Draft",
  },
  (result) => {
    if (result.isConfirmed) win.toast("Published!", 2000, "success");
    else if (result.isDenied) win.toast("Saved as draft.", 2000, "info");
  },
);

// 4. Backdrop-Blur Modal Dialog
win.addModal(
  "cfgModal",
  "⚙️ Advanced Settings",
  "Configure worker concurrency and WAL checkpoints.",
  false,
);
win.on("cfgModal", "confirm", (w) => w.toast("Settings confirmed ✅"));
win.addButton("🪟 Open Modal", (w) => w.openModal("cfgModal"));

// 5. Built-in File & Folder Pickers (Works identically on macOS, Linux, and Windows)
win.open_webview_file_dialog(
  "Select SQLite Database",
  ".sqlite,.db",
  (filePath) => {
    if (filePath) win.toast(`Opened file: ${filePath}`);
  },
);
win.open_webview_folder_dialog("Choose Workspace Folder", (folderPath) => {
  if (folderPath) win.setStatusBarText(`Workspace folder: ${folderPath}`);
});
win.save_webview_file_dialog("Export Report", "report.json", (savePath) => {
  if (savePath) win.saveValuesToFile(String(savePath));
});

// 6. Async Busy State Wrapper — Automatically disables "btnSync" while the async function runs
//    so users cannot accidentally double-click it, then re-enables it when done!
win
  .addButton("☁️ Sync Remote", async (w) => {
    await w.withBusyState(
      ["btnSync"],
      "⏳ Synchronizing cluster state...",
      async (ctx) => {
        await ctx.sleep(1200);
        ctx.toast("Cluster synchronized!", 2000, "success");
      },
    );
  })
  .id("btnSync");
```

---

<a id="step-11-133-visual-themes--12-futuristic-fx-shader-themes"></a>

### Step 11: 133 Visual Themes & 12 Futuristic FX Shader Themes

**Plain-English Summary:** SimpleGUI ships with **310 ready-made color themes** (`getThemeNames()`, `385` total theme keys via `getThemeKeys()` — see [`docs/THEMES.md`](docs/THEMES.md)), spanning classic developer palettes, OS heritage themes (macOS Dark/Light, Windows 11/95, Ubuntu, Retro Mac Classic), and **167 futuristic FX shader themes** (including the 12 core FX flagship presets). Drop `win.addThemeSelector("dd_theme", "Theme:")` into any window to give users a live theme dropdown that automatically remembers their favorite theme!

> 📖 **Deep-Dive Reference (Optional):** [Complete Themes Catalog (`docs/THEMES.md`)](docs/THEMES.md) · [Futuristic FX Themes & Motion Layer (`docs/developer/fx-themes.md`)](docs/developer/fx-themes.md) · [SimpleGUI Visual Themes (`docs/SIMPLEGUI_API.md#visual-themes`)](docs/SIMPLEGUI_API.md#visual-themes) · [Themes & Atmospheric Shaders Tutorial (`docs/userguides/file-manager-themes-complete-tutorial.md`)](docs/userguides/file-manager-themes-complete-tutorial.md)

```typescript
import {
  getThemeKeys,
  getThemeNames,
  isFxTheme,
  newSimpleWindow,
} from "./src/simplegui";

const win = newSimpleWindow("Theme Explorer", 720, 440, {
  theme: "cyberpunk_hologram",
  effects: "full",
});

// Option A (Easiest): 1-line built-in theme selector (switches & persists automatically)
win.addThemeSelector("dd_theme", "Theme:");

// Option B: Inspect all 310 display names, 385 total theme keys, and 167 FX shader themes
const namedThemes = getThemeNames(); // 310 themes
const allKeys = getThemeKeys(); // 385 keys (includes aliases)
const fxThemes = namedThemes.filter((name) => isFxTheme(name)); // 167 FX shader themes

win.addLabel(
  `Loaded ${namedThemes.length} themes (${allKeys.length} keys, ${fxThemes.length} FX)`,
);

win
  .addDropdown(fxThemes, "cyberpunk_hologram", (w, name) =>
    w.setTheme(String(name)),
  )
  .id("cmbFx")
  .width(240);

win.addDropdown(["full", "reduced", "off"], "full", (w, mode) =>
  w.setEffects(String(mode) as "full" | "reduced" | "off"),
);
```

| Theme Category                                         | Popular Theme Names You Can Pass to `theme` or `win.setTheme(...)`                                                                                                                                                   |
| :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS & Apple Pro**                                  | `apple_dark`, `apple_light`, `midnight`, `sonoma_emerald`, `ventura_amber`, `apple_sunset`, `titanium_slate`                                                                                                         |
| **Developer Flagships**                                | `codefreelance`, `tokyo_night`, `catppuccin`, `nord`, `dracula`, `one_dark_pro`, `monokai_pro`, `jetbrains_darcula`, `github_dark`, `github_light`, `rose_pine`, `everforest`, `kanagawa`, `gruvbox_dark`, `cobalt2` |
| **Modern SaaS & Cloud**                                | `linear_dark`, `raycast_dark`, `vercel_dark`, `supabase`, `tailwind_dark`, `arc_velvet`, `unreal_engine`, `oled_black`                                                                                               |
| **Windows 11 & Linux**                                 | `win11_slate`, `win11_light`, `ubuntu_dark`, `ubuntu_light`, `adwaita_dark`, `adwaita_light`, `pop_os`, `linux_mint`, `fedora_dark`                                                                                  |
| **Core Futuristic FX Flagships (167 total FX themes)** | `cyberpunk_hologram`, `neon_hud`, `quantum_obsidian`, `deep_space`, `liquid_metal`, `titanium_aurora`, `liquid_metal_light`, `neo_tokyo_dark`, `synthetic_solar`, `neo_tokyo_day`, `aurora_glass`, `plasma_violet`   |
| **Retro & Vintage Computing**                          | `win95`, `mac_classic`, `mac_os_aqua`, `nextstep`, `amiga`, `c64`, `gameboy`, `amber_crt`, `matrix`, `synthwave`, `playstation`                                                                                      |

---

<a id="3-part-2-step-by-step-simplecli-console--backend-cheat-sheet"></a>

## 3. ⌨️ Part 2: Step-by-Step SimpleCLI Console & Backend Cheat Sheet

### How SimpleCLI Works in 30 Seconds (The 4 Golden Rules)

When you want to build a **terminal tool, build script, DevOps runner, or backend service** (without opening a GUI window), use `SimpleCLI`:

1. **Create the CLI app:** `const app = newApp("tool-name", "1.0.0")`.
2. **Add command-line flags:** Chain `.addFlagString("env", "e", "staging", "Help text")`, `.addFlagInt(...)`, or `.addFlagBool(...)`. This automatically gives your tool `-e` / `--env`, `--help`, `--version`, `--completion <shell>`, and typo suggestions!
3. **Parse arguments (`parseCli()` vs `parseArgs(argv)`):** Use `app.parseCli()` in production (`process.argv.slice(2)` when no array is passed), or **`app.parseArgs(argv)` in `bun test` unit tests** with an explicit string array `["--env", "prod"]`. Call `await app.run()` to dispatch subcommands or default `.action(...)`.
4. **Use built-in terminal UI & system helpers:** Print tables (`app.table`) or TTY/JSON auto-output (`app.output`), ask interactive questions (`await app.select(...)`), run commands (`sys.exec` / `rad.sysutils.execSafe`), or call REST APIs (`createApiClient(...)`).

> 📖 **Deep-Dive Reference (Optional):** [SimpleCLI API Guide (`docs/CLI_API.md`)](docs/CLI_API.md) · [SimpleCLI Cheat Sheet (`docs/cheatsheets/simplecli-cheatsheet.md`)](docs/cheatsheets/simplecli-cheatsheet.md) · [System Utilities & Standard Library (`docs/SYSTEM_UTILITIES_API.md`)](docs/SYSTEM_UTILITIES_API.md)

<a id="cli-step-1-app-setup-flags-subcommands--auto-suggestions"></a>

### Step 1: App Setup, Flags, Subcommands & Headless `parseArgs` Testing

**Plain-English Summary:** Every `addFlag*` method takes **`(longName, shortAlias, defaultValue, description, allowedChoices?)`**. For example, `.addFlagString("env", "e", "staging", "Target environment", ["dev", "staging", "prod"])` lets users run `--env prod` or `-e prod`, rejects invalid choices, and handles `--help`, `--version`, and `--completion bash|zsh|fish` automatically!

| Parsing Method                | Reads From                                                       | Best For                             | Return Value                                                                                    |
| :---------------------------- | :--------------------------------------------------------------- | :----------------------------------- | :---------------------------------------------------------------------------------------------- |
| **`app.parseCli(rawArgs?)`**  | `process.argv.slice(2)` unless `rawArgs` is passed               | Production CLI entrypoints           | `false` on `--help`, `--version`, `--completion`, or invalid flags/subcommand; otherwise `true` |
| **`app.parseArgs(argv)`**     | Explicit `string[]` only (never touches `process.argv`)          | **Headless `bun test` unit testing** | `false` on meta-flags or validation errors; otherwise `true`                                    |
| **`await app.run(rawArgs?)`** | Calls `parseArgs`, dispatches matching subcommand or `.action()` | Full subcommand routing              | `Promise<boolean>`                                                                              |

> 📖 **Deep-Dive Reference (Optional):** [Architecture & Application Lifecycle (`docs/CLI_API.md#1-architecture--application-lifecycle`)](docs/CLI_API.md#1-architecture--application-lifecycle) · [CLI Flags & Argument Parsing (`docs/CLI_API.md#2-cli-flags--argument-parsing`)](docs/CLI_API.md#2-cli-flags--argument-parsing) · [Shell Completions & Man Pages (`docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation`)](docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation)

```typescript
import { newApp, LogLevel } from "./src/simplecli";

// 1. Export a factory so bun test can test parsing & actions headlessly!
export function buildDeployCli() {
  const app = newApp("deploy-pilot", "2.1.0")
    .setAuthor("Platform Team")
    .setDescription("Zero-downtime deployment & diagnostics CLI")
    .setLogLevel(LogLevel.INFO)
    .handleErrors() // Catches unexpected errors and prints a clean red alert box
    // addFlagString(name, shortFlag, defaultVal, description, allowedValues?)
    .addFlagString("env", "e", "staging", "Target environment", [
      "dev",
      "staging",
      "prod",
    ])
    .addFlagInt("concurrency", "c", 4, "Parallel worker count")
    .addFlagBool("dry-run", "d", false, "Simulate without mutating state")
    .addFlagBool("json", "j", false, "Emit machine-readable JSON")
    // Repeatable array flag: `-t v1 -t latest`
    .addFlagArray("tag", "t", [], "Repeatable build tags");

  // 2. Optional: Add Git-style subcommands (e.g. `deploy-pilot rollout api --force`)
  app.command("rollout", "Roll out service to target cluster", (sub) => {
    sub.addFlagBool("force", "f", false, "Bypass preflight checks");
    sub.action(async (flags, positionalArgs) => {
      sub.success(
        `Rolling out (${positionalArgs.join(", ") || "all"}) with force=${flags.force}`,
      );
    });
  });

  return app;
}

if (import.meta.main) {
  const app = buildDeployCli();
  if (!app.parseCli()) process.exit(0);
  const env = app.getFlagString("env"); // "dev" | "staging" | "prod"
  const workers = app.getFlagInt("concurrency"); // number
  const dryRun = app.getFlagBool("dry-run"); // boolean
  await app.run(); // Dispatches subcommands if matched
}
```

#### Headless `bun test` Pattern (No Interactive Prompts or Live Redis Needed)

```typescript
import { describe, expect, test } from "bun:test";
import { createApiClient, newApp, sys } from "./src/simplecli";

describe("deploy-pilot CLI (headless)", () => {
  test("parses flags, hits mock JSON server, and caches offline in Redis memory mode", async () => {
    const cli = newApp("deploy-pilot", "1.0.0")
      .addFlagString("env", "e", "staging", "Target env", [
        "dev",
        "staging",
        "prod",
      ])
      .addFlagInt("concurrency", "c", 4, "Worker count")
      .addFlagBool("dry-run", "d", false, "Dry run");

    expect(cli.parseArgs(["--env", "prod", "-dc", "8"])).toBe(true);
    expect(cli.getFlagString("env")).toBe("prod");
    expect(cli.getFlagInt("concurrency")).toBe(8);
    expect(cli.getFlagBool("dry-run")).toBe(true);

    const server = sys.serveJson(
      { "/health": { ok: true, region: "us-east" } },
      0,
    );
    try {
      const api = createApiClient(`http://127.0.0.1:${server.port}`);
      const health = await api.tryGet<{ ok: boolean }>("/health");
      expect(health.ok).toBe(true);
      expect(health.data?.ok).toBe(true);
    } finally {
      server.stop(true);
    }

    const cache = cli.redis("test_deploy", { inMemory: true });
    await cache.connect();
    await cache.set("last_env", cli.getFlagString("env"));
    expect(await cache.get("last_env")).toBe("prod");
    await cache.close();
  });
});
```

---

<a id="cli-step-2-terminal-ansi-ui-tables-sparklines-charts-trees--diffs"></a>

### Step 2: Terminal ANSI UI, TTY vs `--json` Output, Sparklines, Charts, Trees & Diffs

**Plain-English Summary:** Turn plain `console.log` output into a dual-mode dashboard. `app.output(data, { format, title })` checks **both `--json` (`getFlagBool("json")`) and `!process.stdout.isTTY`**: human terminals see Unicode tables (`app.table`) or aligned key-value pairs (`app.printKv`), while piped CI commands (`my-cli | jq`) or `--json` runs automatically emit clean pretty-printed JSON!

> 📖 **Deep-Dive Reference (Optional):** [Console UI & RAD Components (`docs/CLI_API.md#3-console-ui--rad-components`)](docs/CLI_API.md#3-console-ui--rad-components) · [Tables & Smart Output (`#key-value-pairs-formatted-tables--smart-output`)](docs/CLI_API.md#key-value-pairs-formatted-tables--smart-output) · [Sparklines, Bar Charts, Gauges, Trees & Diffs (`#unicode-sparklines`)](docs/CLI_API.md#unicode-sparklines)

```typescript
import { AlertKind, TaskStatus, TreeNode } from "./src/simplecli";

// 1. Headers, Numbered Steps, Framed Panels & Key-Value Summaries
app.banner("DeployPilot v2.1", "Cluster: us-east-1 (Production)");
app.step(1, "Verifying Upstream Endpoints");
app.panel("TLS Status", "All edge certificates valid for 82 days.");
app.printKv({
  Cluster: "prod-us-east-1",
  Workers: "8 active",
  Latency: app.green("4.2 ms"), // Color helpers: app.green(), app.red(), app.cyan(), app.yellow(), app.bold()
});

// 2. Formatted Unicode Tables & Object Conversion
app.table(
  ["Service", "Version", "Latency", "Status"],
  [
    ["auth-api", "v2.1.0", "4.2 ms", app.green("HEALTHY")],
    ["search-db", "v2.0.8", "11.8 ms", app.yellow("WARMING")],
  ],
);
const jsonRows = app.tableToJson(
  ["Service", "Version"],
  [["auth-api", "v2.1.0"]],
);

// 3. TTY vs `--json` / Piped CI Output:
//    • On interactive TTY without `--json`: prints Unicode table (arrays) or key-value view (objects).
//    • When `--json` flag is set OR `!process.stdout.isTTY` (unless format is "text" | "markdown"): emits JSON!
app.output([{ service: "auth-api", healthy: true, latencyMs: 4.2 }], {
  title: "Nodes",
});

// 4. Terminal Charts: Sparklines (▂▄▆█), Horizontal Bar Charts & Health Gauges
app.info(`RPS Trend: ${app.sparkline([120, 145, 210, 190, 310, 420, 395])}`);
app.barChart(
  "CPU Utilization (%)",
  { "Core 0": 38.5, "Core 1": 74.0, Memory: 61.2 },
  28,
);
app.gauge("Connection Pool", 42, 50, "conns"); // Automatically shows OK / WARN / CRITICAL badge

// 5. Folder/Service Hierarchy Tree & Line-by-Line Color Diff
const root = new TreeNode("cluster-topology");
root.addChild("api-gateway").addChild("auth-service");
root.addChild("postgres-primary").addChild("replica-01");
app.tree(root);

app.diff("workers: 4\nenv: staging", "workers: 8\nenv: production");

// 6. Status Badges, Callout Alert Boxes & Task Checklists
app.println(
  `${app.badge("ENV", "PRODUCTION", AlertKind.WARNING)} Starting rollout...`,
);
app.alert(
  AlertKind.TIP,
  "Pro Tip",
  "Pass --json to pipe structured output into jq.",
);
app.taskItem("Compile TypeScript bundle", TaskStatus.DONE, 118); // Shows ✅ and "118ms"
app.taskItem("Run smoke tests", TaskStatus.RUNNING, 0); // Shows spinner icon
```

---

<a id="cli-step-3-interactive-prompts-fuzzy-select-form-wizards--file-picker"></a>

### Step 3: Interactive Prompts, Fuzzy Select, Form Wizards & File Picker

**Plain-English Summary:** Need to ask the user questions in the terminal?

- `prompt` / `promptPassword` / `promptEmail` / `promptNumber` validate the user's input automatically (for example, `promptNumber("Count:", 4, 1, 32)` won't let the user proceed until they enter a number between 1 and 32).
- `select` / `multiSelect` / `fuzzySelect` render interactive menus with keyboard navigation.
- `form` runs a multi-question wizard and returns an object with all answers.

> 📖 **Deep-Dive Reference (Optional):** [Interactive Prompts, Menus & Input Validation (`docs/CLI_API.md#4-interactive-prompts-menus--input-validation`)](docs/CLI_API.md#4-interactive-prompts-menus--input-validation) · [Fuzzy Search Menus (`#single-multi-select--fuzzy-search-menus`)](docs/CLI_API.md#single-multi-select--fuzzy-search-menus) · [Form Wizard Builder (`#interactive-form--wizard-builder`)](docs/CLI_API.md#interactive-form--wizard-builder) · [Path Prompt & File Picker (`#path-validation-prompt--interactive-file-picker`)](docs/CLI_API.md#path-validation-prompt--interactive-file-picker)

```typescript
import { FormFieldKind, PathMode } from "./src/simplecli";

// 1. Validated Single-Line Questions
const name = await app.prompt("Service name:", "api-gateway"); // Default is "api-gateway" if user presses Enter
const secret = await app.promptPassword("Enter deployment token:"); // Hides typed characters
const email = await app.promptEmail("On-call alert email:", "ops@example.com"); // Re-prompts until valid email
const replicas = await app.promptNumber("Replica count (1-32):", 4, 1, 32); // Enforces min=1, max=32
const confirmed = await app.confirm("Proceed with production rollout?", false); // Yes/No -> returns boolean

// 2. Interactive Menus: Single Choice, Multi-Choice & Live Fuzzy Filter
const target = await app.select("Select target region:", [
  "us-east-1",
  "eu-west-1",
  "ap-south-1",
]);
const modules = await app.multiSelect("Enable modules:", [
  "Metrics",
  "Tracing",
  "WAF",
  "Backups",
]);
const branch = await app.fuzzySelect("Checkout branch:", [
  "main",
  "feat/rad-cheatsheet",
  "fix/ipc-sync",
]);

// 3. Multi-Field Terminal Form Wizard (Asks each field in sequence and returns a key-value object)
const wizardData = await app.form("New Microservice Wizard", [
  {
    key: "service",
    label: "Service ID",
    kind: FormFieldKind.TEXT,
    required: true,
  },
  {
    key: "port",
    label: "HTTP Port",
    kind: FormFieldKind.NUMBER,
    defaultVal: "8080",
  },
]);

// 4. Validated File Path Prompt (Verifies the file actually exists on disk!)
const configPath = await app.promptPath(
  "Config file:",
  "./package.json",
  PathMode.FILE,
);
```

---

<a id="cli-step-4-task-pipelines-structured-logging--benchmarking"></a>

### Step 4: Task Pipelines, Structured Logging & Benchmarking

**Plain-English Summary:** When running a multi-step build or deployment script, use `app.newPipeline("Title")`. Add each step with `pipeline.addStep("Step name", async () => true)`. When you call `await pipeline.run()`, SimpleCLI runs each step in order, times how long each step took, and prints a pass/fail summary table at the end!

> 📖 **Deep-Dive Reference (Optional):** [Multi-Step Task Pipeline Runner (`docs/CLI_API.md#5-multi-step-task-pipeline-runner`)](docs/CLI_API.md#5-multi-step-task-pipeline-runner) · [Structured Multi-Level Logging (`#6-structured-multi-level-logging--file-logging`)](docs/CLI_API.md#6-structured-multi-level-logging--file-logging) · [Benchmark & Execution Timing (`#7-benchmark--execution-timing`)](docs/CLI_API.md#7-benchmark--execution-timing)

```typescript
import {
  createApiClient,
  Logger,
  LogLevel,
  newApp,
  sys,
} from "./src/simplecli";

const app = newApp("release-cli", "1.0.0")
  .setLogLevel(LogLevel.DEBUG)
  .setLogFile(`${sys.tempDir()}/release-cli.log`);

// Standalone Logger (great for modular workers) + app logger helpers
const auditLog = new Logger(LogLevel.INFO);
auditLog.info("Starting release verification");

// 1. Animated Spinner & Determinate Progress Bar
await app.spinner("Warming build cache...", 250);
for (let i = 1; i <= 4; i++) {
  app.progressBar(i, 4, "Verifying shards", 24);
  await app.sleep(40);
}

// 2. Multi-Step Pipeline Runner (Return true for success, false or throw for failure)
const pipeline = app.newPipeline("Release Verification Pipeline");
pipeline.addStep("Check TypeScript types", async () => true);
pipeline.addStep("Verify bundle integrity", async () => {
  await app.sleep(80);
  return true;
});
const allPassed = await pipeline.run(); // Returns true if every step succeeded

// 3. High-Precision Timing + HTTP Endpoint Load Benchmark (`sys.serveJson` + `api.benchmark`)
app.resetTimer();
const metric = await app.measureAsync(async () => {
  await app.sleep(25);
  return "done";
});
app.info(
  `Step took ${metric.durationMs.toFixed(2)} ms (${metric.durationNs} ns); total=${app.elapsedMs()} ms`,
);

const mock = sys.serveJson({ "/health": { ok: true } }, 0);
try {
  const stats = await createApiClient(
    `http://127.0.0.1:${mock.port}`,
  ).benchmark("/health", {
    requests: 20,
    concurrency: 4,
  });
  app.success(
    `Benchmark p50=${stats.p50Ms.toFixed(1)}ms p95=${stats.p95Ms.toFixed(1)}ms ok=${stats.successful}/${stats.requests}`,
  );
} finally {
  mock.stop(true);
}
```

---

<a id="cli-step-5-sys-subprocess-hardware-telemetry-network--os-helpers"></a>

### Step 5: `sys` Subprocess, Hardware Telemetry, Network, OS Helpers & `stdlib`

**Plain-English Summary:** The `sys` object is your cross-platform OS Swiss Army knife, while `stdlib` (`Stdlib`) covers crypto, hashing, validation, formatting, statistics, and collections:

- **Run commands safely:** Use `await rad.sysutils.execSafe("git", ["status", "--short"])` (takes `cmd` + `args[]`, spawns **without** a shell to prevent shell injection!) when passing user input, or `sys.exec("git status")` / `sys.execOr("git branch --show-current", "main")` for trusted shell one-liners.
- **Check hardware:** `sys.cpuCount()`, `sys.ramPercent()`, `sys.diskStats("/")`.
- **Wait for servers/databases to boot:** `await sys.waitForPort("127.0.0.1", 5432, 5000)` or `await sys.waitForHttp("http://localhost:3000/health", 5000)`.
- **Interact with the desktop OS:** `sys.notify("Title", "Message")`, `sys.clipboardCopy("text")`, `await sys.writeJson("~/out.json", data)`.

#### Subprocess Return Shapes (`sys` vs `rad.sysutils`)

| Function                                             | Runs via Shell?           | Arguments                                        | Return Shape                                                    |
| :--------------------------------------------------- | :------------------------ | :----------------------------------------------- | :-------------------------------------------------------------- |
| **`sys.exec(cmd, cwd?)`**                            | Yes (`shell: true`)       | Single command string                            | `[output: string, exitCode: number]` (sync tuple)               |
| **`sys.execOr(cmd, fallback?, cwd?)`**               | Yes (`shell: true`)       | Command string + fallback                        | `string` (stdout on exit 0, else `fallback`)                    |
| **`await sys.execTimeout(cmd, ms?, cwd?)`**          | Yes (`shell: true`)       | Command string + timeout ms                      | `Promise<{ output, exitCode, durationMs, timedOut, attempts }>` |
| **`await rad.sysutils.execSafe(cmd, args?, opts?)`** | **No** (safe `Bun.spawn`) | `(cmd: string, args?: string[], { cwd?, env? })` | `Promise<{ stdout: string, stderr: string, exitCode: number }>` |

> 📖 **Deep-Dive Reference (Optional):** [Safe Process Execution (`docs/CLI_API.md#9-safe-process-execution--subprocess-control`)](docs/CLI_API.md#9-safe-process-execution--subprocess-control) · [Hardware Telemetry (`#10-hardware-telemetry--resource-probing`)](docs/CLI_API.md#10-hardware-telemetry--resource-probing) · [OS Directories & File System (`#11-standard-os-directory-resolution--file-system`)](docs/CLI_API.md#11-standard-os-directory-resolution--file-system) · [Network & Port Diagnostics (`#12-network-wi-fi--tcp-port-diagnostics`)](docs/CLI_API.md#12-network-wi-fi--tcp-port-diagnostics) · [Notifications, Speech & Clipboard (`#13-desktop-notifications-speech--audio-utilities`)](docs/CLI_API.md#13-desktop-notifications-speech--audio-utilities)

> **Warning – Keep encryption keys and user arguments separate from commands:** Always pass untrusted filenames or flags via `rad.sysutils.execSafe(cmd, [arg1, arg2])` instead of string-interpolating into `sys.exec(...)`, and never hardcode production passphrases when using `stdlib.aesEncrypt` / `aesDecrypt`.

```typescript
import { rad } from "./src";
import { stdlib, sys } from "./src/simplecli";

// 1. Run Terminal Commands Safely
const [stdout, exitCode] = sys.exec("git status --short"); // Tuple: [outputText, exitCode]
const branch = sys.execOr("git rev-parse --abbrev-ref HEAD", "main"); // Fallback "main" on error
const safe = await rad.sysutils.execSafe("git", ["log", "-n", "1"]); // No shell! { stdout, stderr, exitCode }
const timed = await sys.execTimeout("bun --version", 3000); // { output, exitCode, durationMs, timedOut, attempts }
const retried = await sys.execRetry("curl -sf https://example.com", 3, 400); // Retries up to 3 times
const parallel = await sys.execParallel(["echo a", "echo b", "echo c"], 2); // Runs 2 commands at a time

// 2. Inspect CPU, RAM, Disk & Battery
const info = {
  cpu: `${sys.cpuModel()} (${sys.cpuCount()} cores)`,
  load: sys.cpuLoad(), // [1min, 5min, 15min] load averages
  ramPct: sys.ramPercent(), // RAM used %, e.g. 62.4
  disk: sys.diskStats("/"), // { totalBytes, freeBytes, usedBytes, percent }
  battery: sys.batteryPercent(), // Laptop battery % (or 100 on desktop)
};

// 3. Check Network Ports & Wait for Local Services to Start
const ip = sys.localIp(); // Local LAN IPv4 address
const portOpen = await sys.checkPort("127.0.0.1", 5432, 500); // Is port 5432 open right now? (boolean)
const dbReady = await sys.waitForPort("127.0.0.1", 5432, 5000); // Poll up to 5s until port 5432 opens
const apiReady = await sys.waitForHttp("http://127.0.0.1:3000/health", 5000); // Poll until HTTP 200 OK

// 4. Native OS Notifications, Clipboard & Path-Expanded JSON Writing ("~/" expands to user Home dir)
sys.notify("Build Finished", "All checks passed!", true);
sys.clipboardCopy("Copied from SimpleCLI");
await sys.writeJson("~/report.json", info);

// 5. Stdlib Highlights: Crypto, Validation, Formatting & Statistics
const hash = stdlib.sha256("hello");
const cipher = stdlib.aesEncrypt(
  "sensitive payload",
  process.env.APP_KEY || "placeholder-secret-key",
);
const plain = stdlib.aesDecrypt(
  cipher,
  process.env.APP_KEY || "placeholder-secret-key",
);
const valid =
  stdlib.isEmail("ada@example.com") &&
  stdlib.isPort(8080) &&
  stdlib.isSemver("1.4.0");
const p95 = stdlib.percentile([12, 18, 25, 42, 95], 95); // Also: sum, mean, median, variance, humanSize, LRUCache
```

---

<a id="cli-step-6-apiclient-rest-crud-safe-try-calls--namespaced-redis"></a>

### Step 6: `ApiClient` REST CRUD, Safe `try*` Calls, Mock Servers & Namespaced Redis

**Plain-English Summary:** Calling external HTTP APIs with raw `fetch()` requires writing boilerplate for timeouts, retries, auth headers, and `try/catch` blocks. `createApiClient(baseUrl)` handles all of that automatically—plus you can spin up a zero-config local mock JSON server (`sys.serveJson`) to run fast headless integration tests without hitting real APIs:

- **Use `api.tryGet` / `api.tryPost`:** Instead of throwing exceptions on network errors or 500 responses, it returns `{ ok, statusCode, data, error }` so you can handle errors cleanly with `if (res.ok)`.
- **Use interceptors, `.scope()`, & `.toCurl()`:** Attach auth/trace headers globally via `useRequestInterceptor`, inspect/transform responses with `useResponseInterceptor`, fork child clients with `.scope("/admin")`, and generate safe debug curl snippets with `.toCurl(..., { redactSecrets: true })`.
- **Use `api.resource<T>("/users")`:** Gives you `.list()`, `.get(id)`, `.create(body)`, `.patch(id, body)`, and `.remove(id)` automatically.
- **Use `app.redis("prefix", { fallbackToMemory: true })`:** Connects to Redis if available, or seamlessly falls back to an in-memory Map (`inMemory: true` forces offline mode) during local development and tests!

> 📖 **Deep-Dive Reference (Optional):** [HTTP Client, Micro Server & REST APIs (`docs/CLI_API.md#15-http-client-micro-server--rest-apis`)](docs/CLI_API.md#15-http-client-micro-server--rest-apis) · [Non-Throwing `try*` Calls (`#unwrapped-data-fallbacks--non-throwing-try-calls`)](docs/CLI_API.md#unwrapped-data-fallbacks--non-throwing-try-calls) · [CRUD Resource Client (`#zero-boilerplate-crud-resource-client-apiresource`)](docs/CLI_API.md#zero-boilerplate-crud-resource-client-apiresource) · [Reactive State & Namespaced Redis (`#8-reactive-state-store-config--namespaced-redis`)](docs/CLI_API.md#8-reactive-state-store-config--namespaced-redis)

```typescript
import { createApiClient, newApp, sys } from "./src/simplecli";

const app = newApp("deploy_pilot", "1.0.0");

// 1. Configure an HTTP Client with Bearer token, 8s timeout, 3 retries, cache & interceptors
const api = createApiClient("https://api.example.com/v1")
  .withBearer("your-api-token")
  .setTimeout(8000)
  .setRetries(3, 200)
  .enableCache(30_000, 128)
  .setRateLimit(50, 1000)
  .useRequestInterceptor((req) => {
    req.headers["X-Trace-Id"] = crypto.randomUUID();
    return req;
  })
  .useResponseInterceptor((res) => res)
  .onError((err) => app.warn(`HTTP failure: ${err.message}`));

const adminApi = api.scope("/admin"); // Inherits auth, headers, retries & interceptors
const curlDebug = api.toCurl("POST", "/users", {
  body: { name: "Ada" },
  redactSecrets: true,
});

// 2. Non-Throwing `tryGet` Call — Never crashes your script if the server is down!
const res = await api.tryGet<{ status: string }>("/health");
if (res.ok) app.success(`API status: ${res.data?.status}`);
else app.warn(`API unreachable (${res.statusCode}): ${res.error}`);

// 3. Zero-Boilerplate CRUD Client for REST Endpoints
interface User {
  id: number;
  name: string;
  role: string;
}
const users = api.resource<User, number>("/users");
// await users.list({ role: "admin" });           -> GET /users?role=admin
// await users.get(1);                            -> GET /users/1
// await users.create({ name: "Ada", role: "admin" }); -> POST /users
// await users.patch(1, { role: "principal" });   -> PATCH /users/1
// await users.remove(1);                         -> DELETE /users/1

// 4. Ephemeral Local Mock Server (`port = 0` lets OS pick a free port — ideal for `bun test`)
const mockServer = sys.serveJson(
  {
    "/health": { status: "ok" },
    "POST /users": async (req: Request) =>
      new Response(JSON.stringify({ id: 99, ...(await req.json()) }), {
        status: 201,
      }),
  },
  0,
);
const localApi = createApiClient(`http://127.0.0.1:${mockServer.port}`);
const localHealth = await localApi.tryGet<{ status: string }>("/health");
mockServer.stop(true);

// 5. Namespaced Redis Cache (Automatically falls back to in-memory store if Redis isn't running!)
const cache = app.redis("deploy_pilot", { fallbackToMemory: true });
await cache.connect();
const summary = await cache.getOrSet(
  "cluster_summary",
  async () => ({ nodes: 12, healthy: true, updatedAt: Date.now() }),
  60, // Cache for 60 seconds
);
await cache.close();
```

---

<a id="4-part-3-45-rad-utility-modules--10-system-tools-cheat-sheet"></a>

## 4. 🧰 Part 3: 45 `rad` Utility Modules & 10 System Tools Cheat Sheet

### What is `rad`? (In Plain English)

Instead of installing dozens of third-party npm packages (`lodash`, `uuid`, `chalk`, `dotenv`, `glob`, `semver`, `cron-parser`, `better-sqlite3`), **`import { rad } from "./src/features/rad/index.ts"` gives you 45 zero-dependency utility modules** organized into 6 easy categories.

**Quick Rule of Thumb — Which `rad` Module Do I Need?**

- **Saving/loading JSON, CSV, or `.jsonl` files?** Use `rad.fileutils`.
- **Storing data in a local SQLite database (tables, key-value, JSON docs, or full-text search)?** Use `rad.sqliteutils`.
- **Grouping, sorting, deduplicating, or chunking arrays?** Use `rad.arrutils`.
- **Safely reading deep object properties (`user.profile.name`) or omitting fields?** Use `rad.objutils`.
- **Formatting strings (`slugify`, `toCamelCase`, masking emails)?** Use `rad.strutils`.
- **Finding files with wildcards (`**/*.ts`)?** Use `rad.globutils`.
- **Hashing passwords, generating UUIDs, or signing JWTs?** Use `rad.cryptoutils` and `rad.jwtutils`.
- **Running async tasks in parallel with a concurrency limit or retry logic?** Use `rad.asyncutils` and `rad.flowutils`.

> 📖 **Deep-Dive Reference (Optional):** [45 RAD Modules Reference (`src/features/rad/README.md`)](src/features/rad/README.md) · [RAD Modules Cheat Sheet (`docs/cheatsheets/rad-modules-cheatsheet.md`)](docs/cheatsheets/rad-modules-cheatsheet.md) · [10 System Utilities Cookbook (`docs/SYSTEM_UTILITIES_API.md`)](docs/SYSTEM_UTILITIES_API.md)

<a id="confusing-pairs-explained"></a>

### Confusing Pairs Explained (Which Module Should I Pick?)

Several `rad` modules and built-in tools sound similar at first glance. Use this cheat-comparison table to pick the right one in 5 seconds:

| Confusing Pair / Group                                                       | Pick This One When...                                                                                                                                                                                                                                                                                                                                         | Key Difference                                                                                                                                                                  |
| :--------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`fileutils`** vs **`sqliteutils`** vs **`stateutils`** vs **`cacheutils`** | **`fileutils`**: Config/export files (JSON, JSONL, CSV, text).<br>**`sqliteutils`**: Queryable tables, concurrent reads (`WAL`), FTS5 search, persistent KV/docs.<br>**`stateutils`**: Reactive in-memory app state store (`AppStateStore` + `persistState` JSON).<br>**`cacheutils`**: Ephemeral RAM-only `LRUCache` / `TTLCache` (lost when process exits). | `fileutils.writeFileAtomic` saves whole files safely; `sqliteutils` gives SQL + indexes; `stateutils` triggers UI/store listeners; `cacheutils` auto-evicts hot keys in memory. |
| **`sysutils`** vs **`shellutils`**                                           | **`sysutils`**: Cross-platform OS metadata + **safe** arg-array spawning (`execSafe(cmd, args)` — **no shell**).<br>**`shellutils`**: Trusted shell scripts/pipelines via `Bun.$` (`execCmd`, `whichCmd`, `escapeArg`).                                                                                                                                       | Always prefer `rad.sysutils.execSafe("git", [userArg])` when arguments come from users; `shellutils.execCmd` runs inside a shell.                                               |
| **`cryptoutils`** vs **`hashutils`** vs **`jwtutils`**                       | **`cryptoutils`**: Security-critical hashing (`sha256`, `hmac`), `uuidV4`, `randomToken`, password hashing (`hashPassword`).<br>**`hashutils`**: Non-cryptographic fast hashes (`wyhash`, `crc32`, `BloomFilter`).<br>**`jwtutils`**: Stateless HS256 auth tokens (`signJwt`, `verifyJwt`).                                                                   | **Never** use `hashutils` (`wyhash`/`crc32`) for passwords or signatures; use `cryptoutils` / `jwtutils`.                                                                       |
| **`archiveutils`** vs **`tarutils`** vs **`compressutils`**                  | **`archiveutils`**: Standard `.zip` files (`zipDir`, `unzipToDir`).<br>**`tarutils`**: Unix `.tar` / `.tar.gz` tarballs (`packTarBytes`, `unpackTarBytes`).<br>**`compressutils`**: Single-buffer/string compression (`gzip`, `brotli`, `zstd`, `deflate`).                                                                                                   | `.zip` and `.tar` bundle **multiple files & folders**; `compressutils` shrinks a single byte buffer or string.                                                                  |
| **`globutils`** vs **`fd` (`searchFiles`)**                                  | **`globutils`**: Fast wildcard matching inside your code (`findFiles("**/*.ts", "./src")`, `globMatch`).<br>**`fd` (`searchFiles`)**: Full CLI/GUI studio search with depth, hidden, size, type & extension filters (`src/features/fd/fdCoordinator.ts`).                                                                                                     | `globutils` wraps `Bun.Glob`; `fd` adds `.gitignore`-aware project file discovery & GUI/CLI controls.                                                                           |
| **`asyncutils`** vs **`flowutils`** vs **`fnutils`**                         | **`asyncutils`**: Concurrency over lists/promises (`parallelMap`, `parallelFilter`, `timeoutPromise`, `WorkerPool`).<br>**`flowutils`**: Resilience & rate shaping (`retry`, `CircuitBreaker`, `RateLimiter`, `debounce`, `throttle`).<br>**`fnutils`**: Pure function helpers (`pipe`, `memoize`, `once`).                                                   | Remember: `retry`, `CircuitBreaker`, and `RateLimiter` live inside **`rad.flowutils`**, while bounded concurrency (`parallelMap`) lives inside **`rad.asyncutils`**.            |

```typescript
import { join } from "node:path";
import { rad } from "./src";

// 1. Storage & State: fileutils (files) vs sqliteutils (SQL) vs stateutils (store) vs cacheutils (RAM)
await rad.fileutils.withTempDir(async (dir) => {
  await rad.fileutils.writeFileAtomic(
    join(dir, "cfg.json"),
    JSON.stringify({ port: 8080 }),
  );
  const db = rad.sqliteutils.openDb(":memory:");
  rad.sqliteutils.createKvTable(db, "kv");
  rad.sqliteutils.setKv(db, "kv", "theme", "nord");

  const store = new rad.stateutils.AppStateStore(
    "pairs",
    { step: 1 },
    { customPath: join(dir, "state.json") },
  );
  await store.update((d) => {
    d.step = 2;
  }); // Atomic JSON save + reactive listeners

  const lru = new rad.cacheutils.LRUCache<string, string>(64);
  lru.set("hot:1", "ram-only"); // Ephemeral RAM cache (lost on process exit)
  db.close();
}, "pairs-demo-");

// 2. Shell vs shell-free + Security hashing vs fast non-crypto hashes
const gitRes = await rad.sysutils.execSafe("git", ["status", "--short"]); // No shell -> safe for user args
const hashOk = await rad.cryptoutils.hashPassword("example-password-123"); // Auth-grade password hash
const fastKey = rad.hashutils.wyhash("cache-key"); // Ultra-fast non-crypto hash (never for passwords)
```

<a id="domain-1-file-sqlite-wal--fts5-toml-archives--state-8-modules"></a>

### Domain 1: File, SQLite (WAL + FTS5), TOML, Archives & State (8 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 1 Overview (`src/features/rad/README.md#1-file--storage-8-modules`)](src/features/rad/README.md#1-file--storage-8-modules) · [Databases Guide (`docs/databases/complete-databases-guide.md`)](docs/databases/complete-databases-guide.md)

| Module                                                            | What It Does (Plain English)                                                                                                        | Most Common Functions & Copy-Paste Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| :---------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`fileutils`**](src/features/rad/README.md#1-fileutils)         | Read & write JSON, JSONL, CSV, and text files safely (atomic writes prevent corrupted files on crash).                              | `await rad.fileutils.saveJson("cfg.json", { port: 8080 })`<br>`const cfg = await rad.fileutils.loadJson("cfg.json", { port: 3000 })`<br>`await rad.fileutils.writeCsvObjects("users.csv", rows)`<br>`await rad.fileutils.walkFiles("./src", (p) => p.endsWith(".ts"))`                                                                                                                                                                                                                                                                                    |
| [**`sqliteutils`**](src/features/rad/README.md#2-sqliteutils)     | Zero-setup SQLite database (`:memory:` or file) with 1-line helpers for tables, Key-Value storage, JSON documents, and FTS5 search. | **Open DB:** `const db = rad.sqliteutils.openDb("app.sqlite")`<br>**CRUD:** `insertRow(db, "tasks", row)` · `insertMany(db, "tasks", rows)` · `selectRows(db, "tasks", ["*"], "status = ?", ["Done"])` · `updateRows(db, "tasks", { status: "Done" }, "id = ?", [1])` · `deleteRows(db, "tasks", "id = ?", [1])`<br>**Key-Value:** `createKvTable(db, "kv")` · `setKv(db, "kv", "theme", "nord")` · `getKvOr(db, "kv", "theme", "dark")`<br>**Full-Text Search:** `createFtsTable(db, "fts", ["title", "body"])` · `searchFtsRanked(db, "fts", "sqlite")` |
| [**`tomlutils`**](src/features/rad/README.md#3-tomlutils)         | Parse, edit, and merge `.toml` configuration files with dot-path getters (`"server.port"`).                                         | `const doc = rad.tomlutils.parseToml(tomlStr)`<br>`const port = rad.tomlutils.getInt(doc, "server.port", 3000)`<br>`rad.tomlutils.setTomlPath(doc, "server.tls.enabled", true)`                                                                                                                                                                                                                                                                                                                                                                           |
| [**`archiveutils`**](src/features/rad/README.md#4-archiveutils)   | Create and extract `.zip` archives in memory or on disk (with automatic zip-slip security checks).                                  | `const zipBytes = rad.archiveutils.zipFiles([{ name: "a.txt", data: "hi" }])`<br>`await rad.archiveutils.zipDir("./src", "./src.zip")`<br>`await rad.archiveutils.unzipToDir("./src.zip", "./out")`                                                                                                                                                                                                                                                                                                                                                       |
| [**`compressutils`**](src/features/rad/README.md#5-compressutils) | Compress and decompress strings or bytes using Gzip, Brotli, Zstd, or Deflate.                                                      | `const b64 = rad.compressutils.gzipCompressString("large text")`<br>`const text = rad.compressutils.gzipDecompressString(b64)`<br>`rad.compressutils.compress(bytes, "zstd")`                                                                                                                                                                                                                                                                                                                                                                             |
| [**`tarutils`**](src/features/rad/README.md#6-tarutils)           | Pack and unpack `.tar` and `.tar.gz` archives.                                                                                      | `const tar = rad.tarutils.packTarBytes([{ name: "log.txt", data: "ok" }])`<br>`const files = rad.tarutils.unpackTarBytes(tar)`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [**`stateutils`**](src/features/rad/README.md#7-stateutils)       | Reactive state container that notifies subscribers whenever state changes.                                                          | `const store = new rad.stateutils.AppStateStore("my_app", { count: 0 })`<br>`store.update((s) => ({ count: s.count + 1 }))`                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [**`cacheutils`**](src/features/rad/README.md#8-cacheutils)       | Fast in-memory caches that automatically evict old items (`LRUCache`) or expired items (`TTLCache`).                                | `const lru = new rad.cacheutils.LRUCache<string, any>(256)`<br>`const ttl = new rad.cacheutils.TTLCache<string, any>(60_000)`                                                                                                                                                                                                                                                                                                                                                                                                                             |

#### Quick Recipe: Using `rad.sqliteutils` in 10 Lines (No SQL Boilerplate Required!)

```typescript
import { rad } from "./src/features/rad/index.ts";

// 1. Open a file database ("./studio.sqlite") or fast in-memory database (":memory:")
const db = rad.sqliteutils.openDb(":memory:");

// 2. Create a table and insert multiple rows in a single fast transaction
rad.sqliteutils.execSql(
  db,
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT)",
);
rad.sqliteutils.insertMany(db, "users", [
  { name: "Ada Lovelace", role: "Admin" },
  { name: "Alan Turing", role: "Engineer" },
]);

// 3. Query, update, or count rows with safe '?' parameter placeholders
const admins = rad.sqliteutils.selectRows<{ id: number; name: string }>(
  db,
  "users",
  ["id", "name"],
  "role = ?",
  ["Admin"],
);
rad.sqliteutils.updateRows(db, "users", { role: "Principal" }, "name = ?", [
  "Alan Turing",
]);
console.log("Total users:", rad.sqliteutils.countRows(db, "users")); // 2
```

#### Quick Recipe: Atomic Files, CSV, TOML, ZIP Archives, State Rollback & TTL Cache

```typescript
import { join } from "node:path";
import { rad } from "./src";

await rad.fileutils.withTempDir(async (dir) => {
  // 1. Atomic file + CSV round-trip
  await rad.fileutils.writeFileAtomic(
    join(dir, "manifest.json"),
    JSON.stringify({ ok: true }),
  );
  await rad.fileutils.writeCsvObjects(join(dir, "users.csv"), [
    { id: 1, name: "Ada" },
  ]);
  const csvRows = await rad.fileutils.readCsvObjects(join(dir, "users.csv"));

  // 2. TOML dot-path mutation + serialization (Bun.TOML)
  const doc = rad.tomlutils.parseToml("[server]\nport = 8080\n");
  const port = rad.tomlutils.getInt(doc, "server.port", 3000);
  rad.tomlutils.setTomlPath(doc, "server.tls.enabled", true);
  const tomlOut = rad.tomlutils.stringifyToml(doc);

  // 3. In-memory PKZIP archive + extraction
  const zipBytes = rad.archiveutils.zipFiles([
    { name: "server.toml", data: tomlOut },
  ]);
  const entries = await rad.archiveutils.unzipToMemory(zipBytes);

  // 4. Persistent reactive store with rollback + RAM TTLCache
  const store = new rad.stateutils.AppStateStore(
    "domain1-demo",
    { theme: "dark", port },
    { customPath: join(dir, "state.json") },
  );
  await store.load();
  await store.patch({ theme: "nord" });
  store.rollback(); // Restores "dark"

  const cache = new rad.cacheutils.TTLCache<string, number>(30_000);
  cache.set("rows", csvRows.length);
  console.log({
    entries: entries.length,
    theme: store.get().theme,
    cached: cache.size(),
  });
}, "rad-d1-");
```

<a id="domain-2-arrays-objects-data-structures-stats-math--graphs-8-modules"></a>

### Domain 2: Arrays, Objects, Data Structures, Stats, Math & Graphs (8 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 2 Overview (`src/features/rad/README.md#2-data-structures--collections-8-modules`)](src/features/rad/README.md#2-data-structures--collections-8-modules)

| Module                                                                             | What It Does (Plain English)                                                                               | Most Common Functions & Copy-Paste Examples                                                                                                                                                                                   |
| :--------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`arrutils` / `sliceutils`**](src/features/rad/README.md#9-arrutils--sliceutils) | Everyday array helpers: group items by a property, remove duplicates, split into pages (`chunk`), or sort. | `rad.arrutils.at(arr, -1)` (last item) · `chunk(arr, 10)` (paginate) · `unique(arr)` · `uniqBy(users, (u) => u.id)` · `groupBy(users, (u) => u.role)` · `sortBy(users, (u) => u.score)` · `partition(users, (u) => u.active)` |
| [**`objutils`**](src/features/rad/README.md#10-objutils)                           | Safely read/write nested object paths (`"a.b[0].c"`), deep-clone objects, or pick/omit keys.               | `rad.objutils.get(user, "profile.city", "Unknown")` · `set(obj, "a.b.c", 42)` · `deepClone(obj)` · `deepMerge(a, b)` · `pick(user, ["id", "name"])` · `omit(user, ["password"])`                                              |
| [**`structutils`**](src/features/rad/README.md#11-structutils)                     | Classic computer science data structures ready to use with TypeScript generics.                            | `new rad.structutils.SimpleQueue<T>()` · `new SimpleStack<T>()` · `new SimpleRingBuffer<T>(100)` · `new SimplePriorityQueue<T>()` · `new SimpleTrie()`                                                                        |
| [**`statutils`**](src/features/rad/README.md#12-statutils)                         | Calculate averages, medians, percentiles (`P95`/`P99`), standard deviation, and trend lines.               | `rad.statutils.mean([10, 20, 30])` (`20`) · `median(nums)` · `percentile(latencies, 95)` · `stdDev(nums)` · `linearRegression(x, y)`                                                                                          |
| [**`mathutils`**](src/features/rad/README.md#13-mathutils)                         | Clamp numbers between min/max bounds, interpolate (`lerp`), remap ranges, and geometry helpers.            | `rad.mathutils.clamp(score, 0, 100)` · `lerp(0, 100, 0.5)` (`50`) · `remap(val, 0, 10, 0, 100)` · `randomInt(1, 6)`                                                                                                           |
| [**`bitutils`**](src/features/rad/README.md#14-bitutils)                           | Compact bit arrays (`BitSet`) and bitmask flag helpers.                                                    | `const bs = new rad.bitutils.BitSet(64); bs.set(3); bs.get(3)` (`true`) · `rad.bitutils.hasFlag(mask, flag)`                                                                                                                  |
| [**`graphutils`**](src/features/rad/README.md#15-graphutils)                       | Directed graphs for dependency resolution (`topologicalSort`), cycle detection, and shortest path.         | `const g = rad.graphutils.newGraph<string>(); g.addEdge("build", "test"); g.topologicalSort()`                                                                                                                                |

#### Quick Recipe: Collections, Priority Queues, P95 Stats & Build Graph

```typescript
import { rad } from "./src";

// 1. Immutable array & object transforms (zero input mutation)
const jobs = [
  { id: "build", team: "core", ms: 120 },
  { id: "test", team: "core", ms: 95 },
  { id: "test", team: "core", ms: 95 }, // Duplicate id filtered below
  { id: "deploy", team: "ops", ms: 840 },
];
const uniqueJobs = rad.arrutils.uniqBy(jobs, (j) => j.id);
const byTeam = rad.arrutils.groupBy(uniqueJobs, (j) => j.team);
const summary = uniqueJobs.map((j) => rad.objutils.pick(j, ["id", "ms"]));
const safeTimeout = rad.objutils.get(
  { limits: { timeoutMs: 5000 } },
  "limits.timeoutMs",
  1000,
);

// 2. Priority queue (lower priority number runs first) + prefix trie + percentiles + DAG order
const pq = new rad.structutils.SimplePriorityQueue<string>();
pq.enqueue("low-priority-cleanup", 10);
pq.enqueue("hotfix-deploy", 1);

const cmds = new rad.structutils.SimpleTrie([
  "build",
  "bundle",
  "bench",
  "deploy",
]);
const latencies = [42, 48, 51, 55, 49, 46, 390];
const p95 = rad.statutils.percentile(latencies, 95);
const outliers = rad.statutils.detectOutliers(latencies); // [390]

const dag = rad.graphutils
  .newGraph<string>()
  .addEdge("build", "test")
  .addEdge("test", "deploy");
console.log({
  next: pq.dequeue(),
  matches: cmds.withPrefix("bu"),
  p95,
  outliers,
  order: dag.topologicalSort(),
  groups: Object.keys(byTeam),
  picked: summary.length,
  safeTimeout,
});
```

<a id="domain-3-strings-regex-templates-colors-html--diffs-6-modules"></a>

### Domain 3: Strings, Regex, Templates, Colors, HTML & Diffs (6 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 3 Overview (`src/features/rad/README.md#3-strings-text--markup-6-modules`)](src/features/rad/README.md#3-strings-text--markup-6-modules)

| Module                                                             | What It Does (Plain English)                                                                          | Most Common Functions & Copy-Paste Examples                                                                                                                                                           |
| :----------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`strutils`**](src/features/rad/README.md#16-strutils)           | Convert string casing, generate URL slugs, mask sensitive emails/tokens, and check spelling distance. | `rad.strutils.slugify("Hello World!")` (`"hello-world"`) · `toCamelCase` / `toSnakeCase` / `toKebabCase` / `toTitleCase` · `truncate(s, 40)` · `maskEmail("ada@example.com")` (`"a***a@example.com"`) |
| [**`regexutils`**](src/features/rad/README.md#17-regexutils)       | Clean regex matching, group extraction, and escaping user input for safe regular expressions.         | `rad.regexutils.findFirst(/\d+/, "v42")` (`"42"`) · `findAll(/\w+/g, str)` · `extractGroups(/(?<yr>\d{4})/, "2026")` · `escapeRegExp(userInput)`                                                      |
| [**`templateutils`**](src/features/rad/README.md#18-templateutils) | Fill `{{variable \| default}}` text templates and render Markdown in the terminal.                    | `rad.templateutils.renderTemplate("Hi {{user.name \| Guest}}!", { user: { name: "Ada" } })`                                                                                                           |
| [**`colorutils`**](src/features/rad/README.md#19-colorutils)       | Convert HEX/RGB/HSL colors, lighten/darken colors, and check WCAG contrast readability.               | `const rgb = rad.colorutils.hexToRgb("#38bdf8")` · `lighten(rgb, 0.15)` · `isAccessible(fgRgb, bgRgb, "AA")`                                                                                          |
| [**`htmlutils`**](src/features/rad/README.md#20-htmlutils)         | Escape untrusted HTML, strip HTML tags to plain text, or extract all links (`<a href>`).              | `rad.htmlutils.escapeHtml(untrusted)` · `stripTags("<p>Hi <b>Bun</b></p>")` (`"Hi Bun"`) · `extractLinks(html)`                                                                                       |
| [**`diffutils`**](src/features/rad/README.md#21-diffutils)         | Compare two strings line-by-line and generate Git-style unified or colored diffs.                     | `rad.diffutils.unifiedDiff(oldText, newText, "old.txt")` · `renderColoredDiff(patch)`                                                                                                                 |

#### Quick Recipe: Text Slugs, Safe HTML, Contrast Colors, Templates & Diffs

```typescript
import { rad } from "./src";

const slug = rad.strutils.slugify("Release Notes v2.4!"); // "release-notes-v24"
const masked = rad.strutils.maskEmail("ada@example.com"); // "a***a@example.com"
const safeNote = rad.htmlutils.escapeHtml("<script>alert(1)</script> Ready");
const plainSummary = rad.htmlutils.stripTags("<p>Hello <b>Bun RAD</b></p>");

// Compute accessible foreground text color ({ r, g, b }) against a brand background hex
const bgRgb = rad.colorutils.hexToRgb("#1e293b");
const fgRgb = rad.colorutils.bestTextColor(bgRgb); // { r: 255, g: 255, b: 255 }

// Render mustache template + generate a colored terminal diff
const banner = rad.templateutils.renderTemplate(
  "Deploy {{slug}} by {{owner | unknown}}",
  {
    slug,
    owner: masked,
  },
);
const patch = rad.diffutils.unifiedDiff(
  "port=3000\nmode=dev\n",
  "port=8080\nmode=prod\n",
  "app.env",
);
console.log(banner, fgRgb, safeNote, plainSummary);
console.log(rad.diffutils.renderColoredDiff(patch));
```

<a id="domain-4-system-cli-env-bun-shell-glob-transpiler-cron--semver-9-modules"></a>

### Domain 4: System, CLI, Env, Bun Shell, Glob, Transpiler, Cron & SemVer (9 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 4 Overview (`src/features/rad/README.md#4-system-cli--shell-runtime-9-modules`)](src/features/rad/README.md#4-system-cli--shell-runtime-9-modules)

| Module                                                               | What It Does (Plain English)                                                                           | Most Common Functions & Copy-Paste Examples                                                                                    |
| :------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| [**`sysutils`**](src/features/rad/README.md#22-sysutils)             | Get OS/CPU/RAM info, user home/temp folders, clipboard access, and safe command execution.             | `rad.sysutils.getSystemInfo()` · `getHomeDir()` · `getTempDir()` · `await execSafe("bun", ["--version"])`                      |
| [**`cliutils`**](src/features/rad/README.md#23-cliutils)             | Return formatted strings for sparklines, progress bars, bar charts, gauges, and ASCII trees.           | `rad.cliutils.renderSparkline([1, 4, 8, 3, 9])` (`"▁▄▇▃█"`) · `formatProgressBar(45, 100, 30)` · `renderGauge(75, 0, 100, 20)` |
| [**`envutils`**](src/features/rad/README.md#24-envutils)             | Read environment variables as typed numbers/booleans with defaults, or parse `.env` files.             | `rad.envutils.getInt("PORT", 3000)` · `getBool("DEBUG", false)` · `requireEnv("API_URL")` · `loadEnv(".env")`                  |
| [**`shellutils`**](src/features/rad/README.md#25-shellutils)         | Run shell commands via native `Bun.$`, check if a program is installed (`whichCmd`), or pipe commands. | `rad.shellutils.whichCmd("git")` · `await rad.shellutils.execCmd("ls -la")` · `escapeArg(untrustedStr)`                        |
| [**`globutils`**](src/features/rad/README.md#26-globutils)           | Ultra-fast file finding and wildcard matching powered by native `Bun.Glob`.                            | `await rad.globutils.findFiles("**/*.ts", "./src")` · `rad.globutils.globMatch("src/*.ts", "src/index.ts")`                    |
| [**`transpileutils`**](src/features/rad/README.md#27-transpileutils) | Strip TypeScript types to plain JS or inspect `import`/`export` statements via `Bun.Transpiler`.       | `rad.transpileutils.stripTypes("const x: number = 1;")` · `rad.transpileutils.analyzeCode(tsCode)`                             |
| [**`logutils`**](src/features/rad/README.md#28-logutils)             | Lightweight logger with prefixes, timestamps, and log levels (`DEBUG`, `INFO`, `WARN`, `ERROR`).       | `const log = rad.logutils.newLogger({ prefix: "api" }); log.info("Server ready", { port: 3000 })`                              |
| [**`cronutils`**](src/features/rad/README.md#29-cronutils)           | Parse cron schedules (`"*/5 * * * *"`), find the next run time, or translate cron to plain English.    | `rad.cronutils.cronToHuman("*/10 * * * *")` (`"Every 10 minutes"`) · `nextCronRun(parseCron("0 9 * * 1-5"))`                   |
| [**`semverutils`**](src/features/rad/README.md#30-semverutils)       | Parse, compare, sort, and bump semantic version numbers (`"1.5.3"` -> `"1.6.0"`).                      | `rad.semverutils.satisfiesRange("2.4.1", "^2.0.0")` (`true`) · `bumpVersion("1.5.3", "minor")` (`"1.6.0"`)                     |

#### Quick Recipe: Safe Subprocesses, `.env` Parsing, Globs, Cron, SemVer & Bun Transpiler

```typescript
import { rad } from "./src";

// 1. Safe arg-array command + fast Bun.Glob file search + .env string parsing
const versionRes = await rad.sysutils.execSafe("bun", ["--version"]);
const radModules = await rad.globutils.findFiles(
  "*.ts",
  "./src/features/rad/modules",
);
const envMap = rad.envutils.parseEnvString("PORT=8080\nDEBUG=true\n");

// 2. Cron humanizer + SemVer + Bun.Transpiler + terminal sparkline/gauge strings
const schedule = rad.cronutils.parseCron("0 9 * * 1-5");
const nextRun = rad.cronutils.nextCronRun(schedule);
const nextVer = rad.semverutils.satisfiesRange("2.4.1", "^2.0.0")
  ? rad.semverutils.bumpVersion("2.4.1", "minor")
  : "2.4.1";

const jsOut = rad.transpileutils.stripTypes(
  "import { join } from 'node:path'; export const port: number = 8080;",
);
const meta = rad.transpileutils.analyzeCode(
  "import { rad } from './src'; export const ready = true;",
);
console.log({
  bun: versionRes.stdout.trim(),
  modulesFound: radModules.length,
  envPort: envMap.PORT,
  cron: `${rad.cronutils.cronToHuman("0 9 * * 1-5")} -> ${nextRun.toISOString()}`,
  nextVer,
  exports: meta.exports,
  jsOut: jsOut.trim(),
  cpuGauge: rad.cliutils.renderGauge(72, 0, 100, 16),
});
```

<a id="domain-5-network-http-bunserve-router-url-jwt-crypto--bunhash-7-modules"></a>

### Domain 5: Network, HTTP, `Bun.serve` Router, URL, JWT, Crypto & `Bun.hash` (7 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 5 Overview (`src/features/rad/README.md#5-network-web--cryptography-7-modules`)](src/features/rad/README.md#5-network-web--cryptography-7-modules) · [Security Guide (`docs/security.md`)](docs/security.md)

| Module                                                         | What It Does (Plain English)                                                                           | Most Common Functions & Copy-Paste Examples                                                                                                           |
| :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`netutils`**](src/features/rad/README.md#31-netutils)       | Get local/public IP addresses, ping TCP ports, resolve DNS hostnames, and check internet connectivity. | `rad.netutils.getLocalIp()` · `await rad.netutils.tcpPing("127.0.0.1", 5432)` · `await rad.netutils.isOnline()`                                       |
| [**`httputils`**](src/features/rad/README.md#32-httputils)     | One-line JSON/text `fetch` helpers with automatic retries and query string builders.                   | `await rad.httputils.getJson("https://api.example.com/items")` · `await rad.httputils.postJson(url, body)` · `buildQuery({ q: "bun" })`               |
| [**`serverutils`**](src/features/rad/README.md#33-serverutils) | Build HTTP servers, REST routers, static file servers, and WebSocket hubs on native `Bun.serve`.       | `const r = rad.serverutils.createRouter(); r.get("/health", () => Response.json({ ok: true })); rad.serverutils.serveHttp({ port: 3000, router: r })` |
| [**`urlutils`**](src/features/rad/README.md#34-urlutils)       | Safely join URL paths without double slashes, edit query params, and hide passwords in DB URLs.        | `rad.urlutils.joinUrl("https://api.io/v1/", "/users/", "42")` · `redactCredentials("postgres://u:placeholder@host/db")`                               |
| [**`jwtutils`**](src/features/rad/README.md#35-jwtutils)       | Sign and verify JSON Web Tokens (HS256) with expiration timestamps.                                    | `const token = rad.jwtutils.signJwt({ userId: 1 }, secret, 3600)` · `rad.jwtutils.verifyJwt(token, secret)`                                           |
| [**`cryptoutils`**](src/features/rad/README.md#36-cryptoutils) | SHA-256/HMAC hashing, UUID v4/v7 generation, random tokens, and Argon2/bcrypt password hashing.        | `rad.cryptoutils.uuidV4()` · `sha256("data")` · `randomToken(32)` · `await hashPassword(pw)` / `await verifyPassword(pw, hash)`                       |
| [**`hashutils`**](src/features/rad/README.md#37-hashutils)     | Ultra-fast non-cryptographic hashes (`wyhash`, `crc32`) and memory-efficient `BloomFilter` sets.       | `rad.hashutils.wyhash("cache-key")` · `crc32("data")` · `const bf = rad.hashutils.createBloomFilter(1000, 0.01)`                                      |

#### Quick Recipe: `Bun.serve` API Router, Ephemeral Test Port, URL Redaction, JWT & `wyhash`

```typescript
import { rad } from "./src";

const jwtSecret = "your-jwt-secret-key"; // Load from process.env in production
const router = rad.serverutils.createRouter();
router.get("/users/:id", (req, params) => {
  const auth =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const claims = auth
    ? rad.jwtutils.verifyJwt<{ sub: string }>(auth, jwtSecret)
    : null;
  return Response.json({
    requestedId: params.id,
    viewer: claims?.sub ?? "anon",
  });
});

const server = rad.serverutils.serveHttp({ port: 0, router }); // port: 0 picks free loopback port
try {
  const token = rad.jwtutils.signJwt({ sub: "ada" }, jwtSecret, 3600);
  const endpoint = rad.urlutils.joinUrl(server.url, "/users/", "42");
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const safeDbUrl = rad.urlutils.redactCredentials(
    "postgres://user:placeholder@localhost:5432/appdb",
  );
  const requestId = rad.cryptoutils.uuidV4();
  const cacheDigest = rad.hashutils.wyhash(`${endpoint}:${requestId}`);
  console.log({ api: await res.json(), safeDbUrl, requestId, cacheDigest });
} finally {
  server.stop(true);
}
```

<a id="domain-6-async-concurrency-flow-resilience-functional-events-validation-mock--time-7-modules"></a>

### Domain 6: Async Concurrency, Flow Resilience, Functional, Events, Validation, Mock & Time (7 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 6 Overview (`src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules`)](src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules)

| Module                                                       | What It Does (Plain English)                                                                                 | Most Common Functions & Copy-Paste Examples                                                                                   |
| :----------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| [**`asyncutils`**](src/features/rad/README.md#38-asyncutils) | Run async functions over an array with a max concurrency limit (`parallelMap`), or add timeouts to promises. | `await rad.asyncutils.parallelMap(urls, 4, async (u) => fetch(u))` · `await timeoutPromise(work(), 2000)`                     |
| [**`flowutils`**](src/features/rad/README.md#39-flowutils)   | Protect apps from overload: `RateLimiter`, `CircuitBreaker`, `retry`, `debounce`, and `throttle`.            | `await rad.flowutils.retry(fn, 3, 200)` · `debounce(fn, 150)` · `throttle(fn, 200)` · `new RateLimiter(100, 10)`              |
| [**`fnutils`**](src/features/rad/README.md#40-fnutils)       | Function composition (`pipe`), caching function results (`memoize`), and run-once (`once`) helpers.          | `rad.fnutils.pipe(10, (x) => x * 2, (x) => x + 1)` (`21`) · `once(initFn)` · `memoize(expensiveFn)`                           |
| [**`eventutils`**](src/features/rad/README.md#41-eventutils) | Publish/subscribe event bus (`on`, `once`, `off`, `emit`, `listenerCount`).                                  | `const bus = rad.eventutils.newEmitter(); bus.on("saved", (e) => ...); bus.emit("saved", { id: "1" })`                        |
| [**`validutils`**](src/features/rad/README.md#42-validutils) | Quick boolean validators for emails, URLs, IPv4/IPv6 addresses, UUIDs, JSON strings, and numbers.            | `rad.validutils.isEmail("ada@bun.sh")` (`true`) · `isUrl(s)` · `isIpv4(s)` · `isUuid(s)` · `isJson(s)` · `inRange(n, 0, 100)` |
| [**`mockutils`**](src/features/rad/README.md#43-mockutils)   | Generate realistic fake users, emails, phone numbers, IPs, and lorem ipsum text for prototypes/tests.        | `const fakeUsers = rad.mockutils.mockUsers(25)` · `mockEmail()` · `mockIpv4()` · `loremText(2)`                               |
| [**`timeutils`**](src/features/rad/README.md#44-timeutils)   | Human-friendly relative dates (`"5 minutes ago"`), date math (`addDays`, `diffDays`), and stopwatches.       | `rad.timeutils.timeAgo(date)` (`"5 minutes ago"`) · `addDays(date, 7)` · `diffDays(a, b)` · `createStopwatch()`               |

#### Quick Recipe: Concurrency Cap, Retries, Circuit Breaker, Events, Validation & Time

```typescript
import { rad } from "./src";

const breaker = new rad.flowutils.CircuitBreaker(3, 5_000);
const limiter = new rad.flowutils.RateLimiter(10, 10);
const bus = rad.eventutils.newEmitter();
bus.on("synced", (item) => console.log("Synced:", item.email));

const candidates = ["ada@example.com", "bad-email", "grace@example.com"];
const validEmails = candidates.filter((email) => rad.validutils.isEmail(email));

// Process up to 2 valid users concurrently with rate limiting, retries & circuit breaker
const synced = await rad.asyncutils.parallelMap(
  validEmails,
  2,
  async (email, idx) => {
    await limiter.wait();
    return breaker.execute(() =>
      rad.flowutils.retry(
        async () => {
          const score = rad.fnutils.pipe(
            idx + 1,
            (n) => n * 10,
            (n) => Math.min(n, 100),
          );
          if (!rad.validutils.inRange(score, 0, 100))
            throw new Error("Out of range");
          const due = rad.timeutils.addDays(new Date(), 7);
          bus.emit("synced", { email, due: rad.timeutils.timeAgo(due) });
          return { email, score };
        },
        3,
        50,
      ),
    );
  },
);
console.log({
  syncedCount: synced.length,
  listeners: bus.listenerCount("synced"),
});
```

---

<a id="10-system-utilities-as-plain-typescript-functions"></a>

### 10 System Utilities as Plain TypeScript Functions

**Plain-English Summary:** In addition to the 45 `rad` modules, Bun RAD Studio includes **10 full system tools** (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`). Each tool works in **3 ways**:

1. **As a Desktop GUI Studio** (e.g., `bun run app:tokei` or `bun run app:fd`).
2. **As a Terminal CLI Tool** (e.g., `bun run cli:tokei` or `bun run cli:fd`).
3. **As a Plain TypeScript Function** you can `import` and call inside your own code!

> 📖 **Deep-Dive Reference (Optional):** [System Utilities API & Cookbook (`docs/SYSTEM_UTILITIES_API.md`)](docs/SYSTEM_UTILITIES_API.md) · [Developer Architecture (`docs/developer/architecture.md`)](docs/developer/architecture.md)

| Utility         | What It Does (Plain English)                                       | API Cookbook Section                                                                          | Feature README                                            | Desktop Studio Guide                                       |
| :-------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------- |
| **`fd`**        | Fast file & folder search by name, extension, or regex             | [`1. fd`](docs/SYSTEM_UTILITIES_API.md#1-fd-fast-file--directory-search)                      | [`fd/README.md`](src/features/fd/README.md)               | [Fd Studio](docs/userguides/17_fd_studio.md)               |
| **`sd`**        | Find & replace text across strings or files (literal or regex)     | [`2. sd`](docs/SYSTEM_UTILITIES_API.md#2-sd-search--displace--sed-alternative)                | [`sd/README.md`](src/features/sd/README.md)               | [Sd Studio](docs/userguides/19_sd_studio.md)               |
| **`rip`**       | Safe file delete that moves files to a graveyard with 1-click undo | [`3. rip`](docs/SYSTEM_UTILITIES_API.md#3-rip--rip2-safe-removal-with-graveyard--undo)        | [`rip/README.md`](src/features/rip/README.md)             | [Rip Studio](docs/userguides/18_rip_studio.md)             |
| **`procs`**     | List running OS processes sorted by CPU or memory usage            | [`4. procs`](docs/SYSTEM_UTILITIES_API.md#4-procs-modern-process-viewer)                      | [`procs/README.md`](src/features/procs/README.md)         | [Procs Studio](docs/userguides/20_procs_studio.md)         |
| **`watchexec`** | Watch folders for file changes and automatically re-run a command  | [`5. watchexec`](docs/SYSTEM_UTILITIES_API.md#5-watchexec-file-watcher--process-orchestrator) | [`watchexec/README.md`](src/features/watchexec/README.md) | [Watchexec Studio](docs/userguides/21_watchexec_studio.md) |
| **`tokei`**     | Count lines of code (LOC), comments, and blanks by language        | [`6. tokei`](docs/SYSTEM_UTILITIES_API.md#6-tokei-fast-code--loc-counter)                     | [`tokei/README.md`](src/features/tokei/README.md)         | [Tokei Studio](docs/userguides/22_tokei_studio.md)         |
| **`gdu`**       | Analyze disk space usage across folders and files                  | [`7. gdu`](docs/SYSTEM_UTILITIES_API.md#7-gdu--gdu-go-pretty-fast-disk-usage-analyzer)        | [`gdu/README.md`](src/features/gdu/README.md)             | [Gdu Studio](docs/userguides/23_gdu_studio.md)             |
| **`ipinfo`**    | Look up IP geolocation, ISP/ASN, and CIDR subnet ranges            | [`8. ipinfo`](docs/SYSTEM_UTILITIES_API.md#8-ipinfo--ipinfo-cli-ip-geolocation--asn-details)  | [`ipinfo/README.md`](src/features/ipinfo/README.md)       | [IpInfo Studio](docs/userguides/24_ipinfo_studio.md)       |
| **`subfinder`** | Discover subdomains for a domain and verify DNS resolution         | [`9. subfinder`](docs/SYSTEM_UTILITIES_API.md#9-subfinder-passive-subdomain-discovery)        | [`subfinder/README.md`](src/features/subfinder/README.md) | [Subfinder Studio](docs/userguides/25_subfinder_studio.md) |
| **`doggo`**     | Query DNS records (`A`, `AAAA`, `MX`, `TXT`, `NS`, `CNAME`)        | [`10. doggo`](docs/SYSTEM_UTILITIES_API.md#10-doggo-dns-client-for-humans)                    | [`doggo/README.md`](src/features/doggo/README.md)         | [Doggo Studio](docs/userguides/26_doggo_studio.md)         |

```typescript
// Copy-Paste Examples: Calling the 10 System Utilities Directly from Your TypeScript Code
import { searchFiles } from "./src/features/fd/fdCoordinator.ts";
import { buildReplacerRegex, replaceText } from "./src/features/sd/sdDoers.ts";
import { buryTarget, unburyTarget } from "./src/features/rip/ripCoordinator.ts";
import {
  resolveGraveyardDir,
  readManifest,
} from "./src/features/rip/ripDoers.ts";
import { getProcesses } from "./src/features/procs/procsCoordinator.ts";
import { shouldTrigger } from "./src/features/watchexec/watchexecDoers.ts"; // Also startWatcher in watchexecCoordinator.ts
import { computeCodeStats } from "./src/features/tokei/tokeiCoordinator.ts";
import { analyzeDirectory } from "./src/features/gdu/gduCoordinator.ts";
import { formatBytes } from "./src/features/gdu/gduDoers.ts";
import { queryIp } from "./src/features/ipinfo/ipinfoCoordinator.ts";
import { enumerateDomain } from "./src/features/subfinder/subfinderCoordinator.ts";
import { lookupDomain } from "./src/features/doggo/doggoCoordinator.ts";

// 1. fd — Find all ".ts" files under "src/" whose filename matches "studio"
const tsFiles = await searchFiles({
  pattern: "studio",
  rootPath: "src",
  extension: "ts",
  hidden: false,
  absolute: false,
});

// 2. sd — Replace every occurrence of "3000" with "8080" in a string
const updated = replaceText(
  "port: 3000",
  buildReplacerRegex("3000", true, "g"),
  "8080",
);

// 3. rip — Inspect the safe-delete graveyard manifest (or call buryTarget / unburyTarget)
const graveyard = resolveGraveyardDir();
const manifest = await readManifest(graveyard);

// 4. procs — Get running processes matching "bun", sorted by CPU usage
const bunProcs = await getProcesses("bun", "cpu");

// 5. watchexec — Check if a changed file path should trigger a rebuild
const triggers = shouldTrigger("src/index.ts", ["ts"], ["node_modules"]);

// 6. tokei — Count lines of code, comments, and blanks in "src/" sorted by code size
const locReports = await computeCodeStats({
  paths: ["src"],
  sort: "code",
  showFiles: false,
  hidden: false,
});

// 7. gdu — Calculate total disk space used by "./src" (ignoring node_modules)
const dirTree = await analyzeDirectory({
  targetDir: "./src",
  nonInteractive: true,
  showItemCount: true,
  showRelativeSize: true,
  showDisks: false,
  summarize: true,
  noHidden: true,
  si: false,
  ignoreDirs: ["node_modules"],
});
console.log("src size:", formatBytes(dirTree.size));

// 8. ipinfo — Look up geographic location and network ASN for an IP address
const cfInfo = await queryIp("1.1.1.1");

// 9. subfinder — Discover subdomains for a domain with a 5000ms timeout
const subs = await enumerateDomain("example.com", 5000, false);

// 10. doggo — Look up DNS "A" records for a domain
const dns = await lookupDomain("example.com", "A");
```

---

<a id="5-part-4-visual-form-designer-ide-shortcuts--single-binary-build"></a>

## 5. 🎨 Part 4: Visual Form Designer, `codecaine` CLI, Studios, Paths & Single-Binary Build

> 📖 **Deep-Dive Reference (Optional):** [Visual Form Designer Guide (`docs/visual-designer/index.md`)](docs/visual-designer/index.md) · [File Manager Guide (`docs/userguides/43_file_manager.md`)](docs/userguides/43_file_manager.md) · [Database Workbench (`docs/databases/workbench.md`)](docs/databases/workbench.md) · [Saved Data & Files (`docs/reference/data-and-files.md`)](docs/reference/data-and-files.md) · [Studios, CLI & Troubleshooting Cheat Sheet (`docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md`)](docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md) · [Single-Binary Releasing (`docs/developer/releasing.md`)](docs/developer/releasing.md)

### Launching the Visual Form Designer, Workbenches & Master `codecaine` CLI

```bash
# 1. Visual Form Designer (IDE), Application Launcher & File Manager
bun run start                 # Delphi/VB-style Form Designer (rebuild src/ide/ assets via bun run ide:build)
bun run app:launcher          # Unified GUI Launcher Studio (desktop studios, CLIs & demos)
bun run cli:launcher --list   # Print all available studios, CLIs, and demos
bun run app:files             # Codecaine File Manager Studio (--reset-window, --server, --browser)

# 2. Databases: Unified Workbench vs Dedicated Studios
bun run workbench             # Database Workbench (SQLite/PostgreSQL/MySQL over loopback; WORKBENCH_PORT env)
bun run app:sqlite            # SQLite Studio Pro (QBE filters, Cloning, Macros, Staging Wizard)
bun run app:postgres          # PostgreSQL Studio (also app:mysql, app:redis)

# 3. Master `codecaine` Suite CLI (cli_apps/codecaine_suite_cli.ts)
bun run codecaine             # Opens GUI Launcher Studio when called with no subcommand
bun run codecaine doctor      # Verifies Bun runtime, repo root, Homebrew status & saved config paths
bun run codecaine list --json # Filterable inventory (--apps, --cli, --demos, --category <name>, --search <term>)
bun run codecaine search json # Fuzzy search across GUI studios, CLIs, and demos
bun run codecaine run app:fd  # Run any studio/CLI/demo directly (`app`, `cli`, `demo`, `info <tool>`)
bun run codecaine brew status # Homebrew tap/cask helpers: status, doctor, check, install-deps, cask, link, unlink
```

> **Designer Verification Status (`docs/visual-designer/index.md`):** Browser checks verified `Form1` (`800x600`), **95 visual + 6 non-visual palette controls**, **6 live code tabs** (`TypeScript`, `Full bun.ts`, `V Code`, `HTML/CSS`, `JSON`, `SQLite`), Audit/Auto-Fix, Import JSON, and Undo/Redo. Native **Run** / **Export** button clicks, **Keys** dialog, right-click menu, drag move/resize, and Windows/Linux native windows were **not hand-verified**, and Database controls (`DB Grid`, `DB Navigator`, etc.) plus the Database Wizard are UI placeholders (**`D-002`**) — wire real databases with `rad.sqliteutils`, `bun run workbench`, or `bun run app:sqlite`. Designer state auto-saves to `~/.bun_rad_studio/designer_draft.json`, previews from `.rad_preview/`, and exports to `exported_project/`.

### File Manager & Database Workbench Essentials

> **Warning – Encryption keys and destructive SQL have no undo backdoor:** `RADENC` (`bun run cli:vault`) and `RADSEC` (`file_manager_secrets.radsec`) encrypt locally with **Argon2id + HKDF-SHA-256 + AES-256-GCM**—lost passphrases without your offline 160-bit recovery key cannot be recovered. In Database Workbench, toggling off **`READ ONLY`** requires a one-time confirmation token (2-minute expiry) for destructive SQL or production writes, and Workbench SQLite edits modify the **original database file** directly (whereas legacy `bun run app:sqlite` works on a `.sqlite_uploads/` copy).

- **File Manager Flags (`bun run app:files`):** Pass `--reset-window` to clear corrupted/offscreen bounds (`file_manager_window.json`) and reopen in screen-filling mode (with `1280x820` un-maximized default), `--server` to host loopback `127.0.0.1:<port>` for Chrome/Brave (great on Linux VMs), `--browser` to open the default browser, `--port <n>`, `--path <dir>`, `--width <n> --height <n>`, `--home`, or `--data-dir <dir>`.
- **File Manager Workstation Shortcuts:** `Alt+5` Dual-Pane Commander (`Tab` switches panes, `F5` copies, `F6` moves), `Space` Quick Look preview (EXIF/GPS scrubber & code viewer), `Cmd/Ctrl+J` synced terminal drawer, `F2` Bulk Rename, `Alt+Delete` Rip Graveyard bury (one-click `Ctrl/Cmd+Z` undo), `Ctrl/Cmd+Alt+L` encrypt/decrypt via `RADENC`.
- **Database Workbench (`bun run workbench`):** Stores profiles in `~/.bun_rad_studio/connections.json` (`0600` permissions; override folder via `STUDIO_DB_PROFILE_DIR` for isolated tests) and stores passwords in the OS keychain via `Bun.secrets` (service `bun-rad-studio.database`). Supports `POST /api/v2/sqlite/backup` (`VACUUM INTO`), SQL execution with rollback, and read-only safety guards. _(SSH tunnels and Workbench CSV/file import are not implemented yet — use the 5-step Staging Import Wizard inside `app:sqlite` / `app:postgres` / `app:mysql`.)_

```sql
-- QBE Criteria / Or Grid Filters -> Safe SQL Predicates (SQLite / Workbench)
-- Same row = AND; second "Or" row = OR:
SELECT id, customer, amount, status
FROM invoices
WHERE (customer LIKE '%acme%' AND amount BETWEEN 100 AND 500)
   OR status IN ('open', 'pending')
ORDER BY amount DESC;

-- Full-text FTS5 ranking via BM25 (negative rank = higher relevance):
SELECT title, bm25(docs_fts) AS rank
FROM docs_fts
WHERE docs_fts MATCH 'sqlite AND wal'
ORDER BY rank LIMIT 10;
```

```typescript
import { rad } from "./src/features/rad/index.ts";
import { createRedisNamespace } from "./src/simplecli";

// Safe local SQLite (auto-WAL) + FTS5 + Redis fallback cache + credential masking
const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.createFtsTable(db, "docs_fts", ["title", "body"]);
rad.sqliteutils.indexFts(db, "docs_fts", {
  title: "SQLite WAL Mode",
  body: "Concurrent readers without blocking writers",
});
const hits = rad.sqliteutils.searchFtsRanked<{ title: string }>(
  db,
  "docs_fts",
  "sqlite AND wal",
);

const redis = createRedisNamespace("studio_cache", { inMemory: true });
await redis.set("search:wal", JSON.stringify(hits), 60); // 60s TTL
const cached = await redis.get("search:wal");
await redis.close();
db.close();

// Always redact DB connection strings before logging or showing in UI diagnostics
const safeConnStr = rad.urlutils.redactCredentials(
  "postgres://user:placeholder@localhost:5432/appdb",
);
console.log({ hits: JSON.parse(cached ?? "[]"), safeConnStr });
```

### OS Config, State & Studio Data Paths

| What Is Saved                                     | macOS                                           | Linux                                           | Windows                                                     |
| :------------------------------------------------ | :---------------------------------------------- | :---------------------------------------------- | :---------------------------------------------------------- |
| **Global SimpleGUI theme**                        | `~/.config/simplegui/theme.txt`                 | `~/.config/simplegui/theme.txt`                 | `%USERPROFILE%\.config\simplegui\theme.txt`                 |
| **App config (`getAppConfigDir`)**                | `~/.config/<app>` (`$XDG_CONFIG_HOME`)          | `~/.config/<app>` (`$XDG_CONFIG_HOME`)          | `%APPDATA%\<app>`                                           |
| **App state (`session.json`, `form_state.json`)** | `~/Library/Application Support/<app>`           | `~/.local/state/<app>` (`$XDG_STATE_HOME`)      | `%LOCALAPPDATA%\<app>`                                      |
| **Studio, File Manager & Workbench data**         | `~/.bun_rad_studio/`                            | `~/.bun_rad_studio/`                            | `%USERPROFILE%\.bun_rad_studio\`                            |
| **Rip Graveyard (`rip` / `Alt+Delete`)**          | `$GRAVEYARD` or `~/.local/share/rip/graveyard/` | `$GRAVEYARD` or `~/.local/share/rip/graveyard/` | `$GRAVEYARD` or `%USERPROFILE%\.local\share\rip\graveyard\` |
| **Synthetic sample DBs (`BUNRAD_SAMPLE_DIR`)**    | `~/bun_rad_samples`                             | `~/bun_rad_samples`                             | `%USERPROFILE%\bun_rad_samples`                             |

```typescript
import { join } from "node:path";
import { rad } from "./src/features/rad/index.ts";
import { newApp } from "./src/simplecli";
import {
  getAppConfigFile,
  getAppStateFile as getGuiStateFile,
  writeFileAtomic as writeGuiFileAtomic,
} from "./src/simplegui";

// 1. OS-standard SimpleGUI config/state file paths + synchronous atomic save
const cfgFile = getAppConfigFile("acme-studio", "prefs.json");
const guiStateFile = getGuiStateFile("acme-studio", "session.json");
await rad.fileutils.withTempDir(async (tmpDir) => {
  writeGuiFileAtomic(
    join(tmpDir, "sync-prefs.json"),
    JSON.stringify({ theme: "nord" }),
  );
  await rad.fileutils.writeFileAtomic(
    join(tmpDir, "async-export.json"),
    JSON.stringify({ ok: true }),
  );
}, "paths-demo-");

// 2. SimpleCLI dotfile-style state helper (~/.<app>/<file>)
const cliStateFile = newApp("acme-cli", "1.0.0").getAppStateFile(
  "acme-cli",
  "history.json",
);
console.log({ cfgFile, guiStateFile, cliStateFile });
```

### Universal Desktop Window Keyboard Shortcuts

| Shortcut (macOS / Win+Linux)                                                 | Action                                                 |
| :--------------------------------------------------------------------------- | :----------------------------------------------------- |
| <kbd>Cmd+Q</kbd> / <kbd>Ctrl+Q</kbd> or <kbd>Cmd+W</kbd> / <kbd>Ctrl+W</kbd> | Close window & auto-save form state                    |
| <kbd>Cmd+F</kbd> / <kbd>F11</kbd> / <kbd>Alt+Enter</kbd>                     | Toggle native fullscreen mode                          |
| <kbd>Escape</kbd>                                                            | Dismiss open modal/popover or exit fullscreen          |
| <kbd>Cmd+M</kbd> / <kbd>Ctrl+M</kbd>                                         | Minimize window (auto-exits fullscreen space on macOS) |
| <kbd>Cmd+Shift+T</kbd> / <kbd>Ctrl+Shift+T</kbd>                             | Toggle Always-on-Top window pin                        |
| <kbd>Cmd+Shift+C</kbd> / <kbd>Ctrl+Shift+C</kbd>                             | Center window on primary display                       |
| <kbd>Cmd/Ctrl +</kbd> / <kbd>Cmd/Ctrl -</kbd> / <kbd>Cmd/Ctrl 0</kbd>        | Zoom workspace in, out, or reset to 100%               |

### Custom Keyboard Shortcuts & Headless UI Testing (`bun test`)

```typescript
// 1. Register Custom Keyboard Shortcuts (`onShortcut` takes exact key string + callback)
const saveWorkspace = (w: SimpleWindow) =>
  w.toast("Workspace saved!", 1500, "success");
win.onShortcut("ctrl+s", saveWorkspace);
win.onShortcut("meta+s", saveWorkspace); // macOS Cmd+S
win.onShortcut("ctrl+k", (w) => w.focus("txtSearch"));
win.onShortcut("meta+k", (w) => w.focus("txtSearch"));

// 2. Programmatic Event Triggers for Headless Unit Tests (No WebView needed!)
await win.triggerChange("txtSearch", "WAL");
await win.triggerClick("btnAddTask");
await win.triggerChange("workspaceTabs", "📊 Telemetry & Charts");
```

### Single-Binary Compilation & Cross-Platform Release Notes

> 📖 **Learn More:** [Standalone Binary Compilation Engine (`docs/SYSTEM_UTILITIES_API.md#14-standalone-binary-compilation-engine`)](docs/SYSTEM_UTILITIES_API.md#14-standalone-binary-compilation-engine) · [CLI Single-Binary Compilation (`docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation`)](docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation) · [Releasing & Cross-Platform Packaging (`docs/developer/releasing.md`)](docs/developer/releasing.md)

Turn any SimpleGUI desktop app or SimpleCLI script into a self-contained native executable, or package shared-runtime distributions (`runtime/bun` + `BUN_BE_BUN=1` + `apps/*.js`, `cli/*.js`):

```bash
# 1. Compile your own standalone SimpleGUI or SimpleCLI executable
bun build --compile examples/rad_tutorial/07_contacts.ts --outfile contacts-studio
bun build --compile cli_apps/tokei_cli.ts --outfile tokei-bun

# 2. Workspace packaging & release scripts
bun run build                 # Library build (dist/)
bun run build:binary          # Compiled binary build
bun run build:mac-apps        # macOS .app bundles
bun run release:build         # Cross-platform shared-runtime archive build (docs/developer/releasing.md)
bun run npm:build             # Build publishable npm package (dist/npm/)
```

- **macOS downloaded archives:** Gatekeeper may quarantine unsigned `.app` / binaries as _"damaged"_ — verify the release checksum first, then run `xattr -cr /path/to/App.app` (or `xattr -dr com.apple.quarantine ./codecaine-file-manager`).
- **Ubuntu 24.04+ Linux:** AppArmor may block WebKitGTK's sandbox (`bwrap: setting up uid map: Permission denied`). Run `sh install.sh --apparmor` from an extracted release folder, or use `--server` in Chrome/Brave.
- **Windows (incl. ARM64) & Parallels/VMware:** Always clone/extract to local NTFS (`C:\Users\<you>\...`, never `\\Mac\...` UNC paths), and ensure Edge WebView2 + Microsoft Visual C++ **x64** Redistributable (`vc_redist.x64.exe`) + **x64 Bun** are installed.

---

<a id="6-part-5-pro-rad-tips-tricks--power-patterns"></a>

## 6. 💡 Part 5: Pro RAD Tips, Tricks & Power Patterns

> 📖 **Learn More:** [Developer Handbook (`docs/developer/handbook.md`)](docs/developer/handbook.md) · [Architecture Deep Dive (`docs/developer/architecture.md`)](docs/developer/architecture.md) · [Task-Oriented Index (`docs/reference/task-index.md`)](docs/reference/task-index.md) · [Troubleshooting (`docs/troubleshooting.md`)](docs/troubleshooting.md)

### SimpleGUI Desktop UI, Layout & Performance Tricks

1. **Zero-Boilerplate Multi-Tab & Sidebar Navigation (`bindViews`)**:
   Instead of writing manual `showControls` / `hideControls` loops for every tab or sidebar menu, chain `.bindViews({ "Tab A": ["card1", "tbl1"], "Tab B": ["card2"] })` right onto `win.addTabs(...)`, `win.addTabPills(...)`, `win.addSidebar(...)`, or `win.addNavRail(...)`. It automatically toggles visibility on initialization and every selection change.
2. **Instant Live-Search Table Filtering (`filterTable` + `rad.flowutils.debounce`)**:
   Bind a search input directly to any in-memory table in one call: `win.addSearchInput("Search...").filterTable("tblUsers", () => allUsers, { countControlId: "bdgCount" })`. If your search hits an external API or heavy SQLite query instead, wrap the `.onChange(...)` handler with `rad.flowutils.debounce((w, q) => ..., 180)` to prevent UI stutter on fast keystrokes.
3. **Coalesced Multi-Control Updates (`values`, `setManyTexts`, `setManyVisibility`)**:
   When a timer or background worker refreshes 5+ controls at once (labels, badges, inputs, panel visibility), batch them with `win.values({ lblCpu: "42%", ... })`, `win.setManyTexts({ bdgCount: "12 matches", lblStatus: "Ready" })`, and `win.setManyVisibility({ pnlLoading: false, tblLogs: true })`.
4. **Prevent Double-Clicks on Long Async Operations (`withBusyState`)**:
   Wrap network fetches, database migrations, or CLI subprocesses inside `await win.withBusyState(["btnRun", "btnExport"], "⏳ Processing...", async (w) => { ... })`. It disables the target controls, updates the window status text, and restores interactivity in a `finally` block—even if an exception throws.
5. **Declarative Form Validation with Auto-Focus (`validateForm`)**:
   Skip repetitive `if (!w.getText(...))` checks. Call `const res = win.validateForm({ txtEmail: { required: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, label: "Email" }, txtPort: { min: 1, max: 65535 } })`. When invalid, `res.firstInvalidId` gives you the exact control ID to pass to `win.focus(res.firstInvalidId!)`.
6. **Table Export & Object Hydration (`getTableObjects` / `exportTableCsv` / `exportTableJson`)**:
   Convert any `addTable` into typed row objects keyed by header names with `win.getTableObjects("tblUsers")`, or export directly with `win.exportTableCsv("tblUsers", "users.csv")` and `win.exportTableJson("tblUsers", "users.json")`.
7. **Auto-Persist Form Inputs & Theme Across Restarts (`enableAutoSave`)**:
   Pass `{ autoSaveState: true, appId: "my_app" }` to `newSimpleWindow(...)` or call `win.enableAutoSave()` (zero arguments) during window setup. Every form input and window bound is saved on close (`session.json` + `form_state.json`) and restored on launch unless overridden by explicit window options.

```typescript
import { rad } from "./src/features/rad/index.ts";

// Power Pattern: Debounced SQLite Search + Batch Text Updates
const debouncedQuery = rad.flowutils.debounce((w, query: string) => {
  const rows = rad.sqliteutils.queryAll<any>(
    db,
    "SELECT id, level, msg FROM logs WHERE msg LIKE ?",
    [`%${query}%`],
  );
  w.setTableRows(
    "tblLogs",
    rows.map((r) => [String(r.id), r.level, r.msg]),
  );
  w.setManyTexts({
    bdgCount: `${rows.length} matches`,
    lblStatus: "Search updated",
  });
}, 180);

win.addSearchInput("Search logs...").id("txtLogQuery").onChange(debouncedQuery);
```

### SimpleCLI Terminal, Piping & Backend Tricks

1. **Dual-Mode Interactive / CI-Friendly CLI Apps (`app.output` + `--json`)**:
   Always pair interactive prompts or tables with non-interactive flags. Gate interactive prompts on `process.stdin.isTTY` (plus a `--yes` flag), and render results via `app.output(rows, { title: "Results" })` — SimpleCLI automatically prints a styled table/KV box in terminals (`process.stdout.isTTY`) and clean machine-readable JSON whenever stdout is piped (`my-cli | jq`) or `--json` is passed.
2. **Non-Throwing Network & Subprocess Calls (`createApiClient().tryGet` / `rad.sysutils.execSafe`)**:
   Avoid nested `try / catch` boilerplate in CLI scripts. Use `const res = await createApiClient(baseUrl).tryGet<Release>("/latest")` (check `res.ok`, or `await app.httpGetJson<Release>(url)` for quick URLs) and `const proc = await rad.sysutils.execSafe("git", ["status", "--porcelain"])` (spawns `Bun.spawn` directly without a shell — immune to command injection).
3. **Interactive Fuzzy & Choice Pickers (`fuzzySelect` / `select`)**:
   Format aligned label strings (`servers.map((s) => `${s.name} (${s.region}) — ${s.ip}`)`) and let users type-to-filter with `const picked = await app.fuzzySelect("Select deployment target:", labels)` (or `app.select(...)` for numbered menus).
4. **Live Progress Bars & Multi-Step Pipelines (`progressBar` / `newPipeline`)**:
   Render live progress updates inside loops with `app.progressBar(i + 1, files.length, "Compressing", 30)`, or track multi-stage operations with automatic step timing via `const pipe = app.newPipeline("Build"); pipe.addStep(...); await pipe.run();`.
5. **Instant Shell Completions & Man Pages (`--completion` / `generateCompletions` / `generateManPage`)**:
   `app.parseCli()` and `app.parseArgs(argv)` automatically handle `--completion <zsh|bash|fish>` and `completion <shell>` out of the box! You can also export them programmatically via `app.generateCompletions("zsh")` and `app.generateManPage()`.

```typescript
import { rad } from "./src/features/rad/index.ts";
import { createApiClient, newApp, sys } from "./src/simplecli";

const app = newApp("ops-cli", "1.0.0").addFlagBool(
  "yes",
  "y",
  false,
  "Skip interactive confirmation",
);
const files = ["api.ts", "gui.ts", "worker.ts"];
for (let i = 0; i < files.length; i++) {
  app.progressBar(i + 1, files.length, "Compressing", 30); // (current, total, label, width)
}

const server = sys.serveJson({ "/status": { service: "api", ok: true } }, 0);
try {
  const api = createApiClient(`http://127.0.0.1:${server.port}`);
  const health = await api.tryGet<{ service: string; ok: boolean }>("/status"); // Never throws
  const git = await rad.sysutils.execSafe("git", ["status", "--short"]);
  app.output(
    [
      {
        service: health.data?.service ?? "api",
        ok: health.ok,
        dirtyFiles: git.stdout.trim() ? "yes" : "no",
      },
    ],
    {
      title: "Deploy Readiness",
    },
  );
  const zshScript = app.generateCompletions("zsh");
  console.log("Generated zsh completion bytes:", zshScript.length);
} finally {
  server.stop(true);
}
```

### 45 `rad` Modules, SQLite & Native Bun Superpower Tricks

1. **Always Use Parameterized SQL & Transactions in `rad.sqliteutils`**:
   `rad.sqliteutils.openDb(path)` automatically enables `PRAGMA journal_mode = WAL` for concurrent reads. When inserting or updating hundreds of rows, use `rad.sqliteutils.insertMany(db, "events", rows)` or wrap custom queries inside `rad.sqliteutils.transaction(db, () => { ... })` for **50x–100x faster** write throughput than individual auto-committed inserts.
2. **Hardware-Accelerated Hashing & Globbing (`Bun.hash.wyhash` & `Bun.Glob`)**:
   Prefer `rad.hashutils.wyhash(data)` for ultra-fast non-cryptographic checksums/deduplication and `await rad.globutils.findFiles("**/*.ts", dir)` (powered by native `Bun.Glob`) instead of manual recursive `fs.readdir` loops.
3. **Composable Resilience (`rad.flowutils` + `rad.asyncutils`)**:
   Protect flaky external APIs with `const breaker = new rad.flowutils.CircuitBreaker(5, 10_000)` (`await breaker.execute(fn)`), `const limiter = new rad.flowutils.RateLimiter(20, 10)` (`await limiter.wait()`), and `await rad.flowutils.retry(fn, 3, 200)` — then cap outbound concurrency cleanly with `await rad.asyncutils.parallelMap(urls, 6, fetchUrl)`.
4. **Reuse the 10 System Utility Coordinators Inside GUI & CLI Apps**:
   Never shell out to external `fd`, `tokei`, `procs`, or `doggo` binaries when building studios—import their TypeScript coordinators directly (`searchFiles`, `computeCodeStats`, `getProcesses`, `lookupDomain`) from `src/features/<tool>/<tool>Coordinator.ts` for typed, cross-platform data structures.

```typescript
import { searchFiles } from "./src/features/fd/fdCoordinator.ts";
import { getProcesses } from "./src/features/procs/procsCoordinator.ts";
import { rad } from "./src/features/rad/index.ts";
import { computeCodeStats } from "./src/features/tokei/tokeiCoordinator.ts";

// 1. High-throughput WAL SQLite batch insert + explicit transaction
const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.execSql(
  db,
  "CREATE TABLE audit (id INTEGER PRIMARY KEY, path TEXT, hash TEXT)",
);
rad.sqliteutils.transaction(db, () => {
  rad.sqliteutils.insertMany(db, "audit", [
    { path: "src/index.ts", hash: rad.hashutils.wyhash("src/index.ts") },
    {
      path: "src/simplegui.ts",
      hash: rad.hashutils.wyhash("src/simplegui.ts"),
    },
  ]);
});
db.close();

// 2. Native TypeScript coordinators (no external binary dependency) + resilient parallel pipeline
const tsEntries = await searchFiles({
  rootPath: "./src/features/rad/modules",
  extension: "ts",
  hidden: false,
  absolute: false,
});
const locReports = await computeCodeStats({
  paths: ["./src/features/rad/modules"],
  sort: "code",
  showFiles: false,
  hidden: false,
});
const procs = await getProcesses("bun", undefined, 5);

const breaker = new rad.flowutils.CircuitBreaker(5, 10_000);
const hashes = await rad.asyncutils.parallelMap(
  tsEntries.slice(0, 4),
  2,
  async (entry) =>
    breaker.execute(() =>
      rad.flowutils.retry(async () => rad.hashutils.wyhash(entry.path), 2, 20),
    ),
);
console.log({
  modules: tsEntries.length,
  languages: locReports.length,
  bunProcs: procs.length,
  hashes,
});
```

### Cross-Platform Portability & Headless Unit Testing Tricks

1. **Export a Window Factory Function for Instant Headless `bun test` Verification**:
   Structure your SimpleGUI apps as `export function createMyStudio(dbPath = ":memory:"): SimpleWindow { ... }` and guard the event loop with `if (import.meta.main) createMyStudio().run();`. In `bun test`, instantiate `const win = createMyStudio(":memory:")` and drive the entire UI headlessly in milliseconds using `await win.triggerClick("btnAdd")`, `await win.triggerChange("txtSearch", "query")`, and `expect(win.getTableRows("tbl")).toHaveLength(1)`.
2. **Cross-Platform Keyboard Shortcut Normalization (`onShortcut`)**:
   Register both `ctrl+<key>` (Windows/Linux) and `meta+<key>` (macOS `Cmd`) with `win.onShortcut("ctrl+s", onSave)` and `win.onShortcut("meta+s", onSave)`, or bind standard menu bar accelerators.
3. **Never Hardcode `/tmp` or Path Separators**:
   Use `import { join } from "node:path"`, `sys.tempDir()`, `rad.stateutils.resolveConfigDir("app-name")`, and `Prompts.expandPath("~/...")` (or `rad.sysutils.getHomeDir()`) so paths resolve cleanly on macOS, Linux, and Windows.

```typescript
// app.ts — Dual-mode GUI + CLI entry point with portable paths & headless bun test factory
import { join } from "node:path";
import { rad } from "./src/features/rad/index.ts";
import { newApp, Prompts, sys } from "./src/simplecli";
import { newSimpleWindow, SimpleWindow } from "./src/simplegui";

export function createDualStudio(
  dbPath = join(rad.stateutils.resolveConfigDir("acme-studio"), "tasks.sqlite"),
): SimpleWindow {
  const win = newSimpleWindow("Acme Studio", {
    width: 880,
    height: 560,
    theme: "nord",
    fullscreen: false,
  });
  win.addTable("tblTasks", ["Task", "Status"], []);
  win.addInput("New task...").id("txtTask");
  win
    .addButton("Add Task")
    .id("btnAdd")
    .onClick(() => {
      const title = String(win.getValue("txtTask") ?? "").trim();
      if (!title) return;
      win.setTableRows("tblTasks", [
        ...win.getTableRows("tblTasks"),
        [title, "Open"],
      ]);
      win.setText("txtTask", "");
    });
  const onSave = () =>
    console.log(
      "Saved to:",
      dbPath,
      "home:",
      Prompts.expandPath("~/.acme"),
      "tmp:",
      sys.tempDir(),
    );
  win.onShortcut("ctrl+s", onSave).onShortcut("meta+s", onSave);
  return win;
}

if (import.meta.main) {
  if (Bun.argv.includes("--cli")) {
    const cli = newApp("acme-studio", "1.0.0").addFlagBool(
      "json",
      "j",
      false,
      "Output JSON",
    );
    cli.parseCli();
    cli.output({
      mode: "headless-cli",
      configDir: rad.stateutils.resolveConfigDir("acme-studio"),
    });
  } else {
    createDualStudio(":memory:").run();
  }
}
```

---

<a id="7-part-6-complete-full-featured-workspace-templates"></a>

## 7. 🚀 Part 6: Complete Full-Featured Workspace Templates

> 📖 **Deep-Dive Reference (Optional):** [Production App Walkthrough (`docs/SIMPLEGUI_API.md#production-app`)](docs/SIMPLEGUI_API.md#production-app) · [Application Index (`docs/reference/application-index.md`)](docs/reference/application-index.md) · [Script Index (`docs/reference/script-index.md`)](docs/reference/script-index.md) · [Studio User Guides Hub (`docs/userguides/README.md`)](docs/userguides/README.md)

<a id="template-1-full-featured-simplegui-studio-workspace"></a>

### Template 1: Full-Featured SimpleGUI Studio Workspace

This complete, runnable template combines **Menu Bar & Quick Toolbar**, **Live Theme Selector**, **Multi-Tab View Navigation** (`Overview`, `Live Search & SQLite CRUD`, `Telemetry & Charts`, `Workspace Settings`), **Live Keystroke Search + Category Filtering**, **Charts / Donut / Activity Rings / Sparklines / Timer Telemetry**, **Right-Click Context Menus**, **SweetAlert2 `fire()` Dialogs**, **Webview File Picker**, and **Reactive State**:

> **Run directly:** `bun run examples/rad_tutorial/12_full_studio_workspace_template.ts`

```typescript
import { newSimpleWindow, type SimpleWindow } from "./src/simplegui";
import { rad } from "./src/features/rad/index.ts";

export function createFullStudioWorkspace(dbPath = ":memory:"): SimpleWindow {
  // 1. Initialize Embedded SQLite Database (WAL mode via rad.sqliteutils)
  const db = rad.sqliteutils.openDb(dbPath);
  rad.sqliteutils.execSql(
    db,
    `CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL
    )`,
  );

  if (rad.sqliteutils.countRows(db, "tasks") === 0) {
    rad.sqliteutils.insertMany(db, "tasks", [
      {
        title: "Configure WAL checkpoints",
        category: "Database",
        priority: "High",
        status: "Done",
      },
      {
        title: "Add multi-tab workspace switcher",
        category: "Frontend",
        priority: "High",
        status: "Done",
      },
      {
        title: "Wire real-time keystroke search filter",
        category: "Frontend",
        priority: "Medium",
        status: "In Progress",
      },
      {
        title: "Benchmark wyhash & BloomFilter",
        category: "Backend",
        priority: "Low",
        status: "Todo",
      },
      {
        title: "Deploy production binary build",
        category: "DevOps",
        priority: "High",
        status: "In Progress",
      },
    ]);
  }

  // 2. Create Desktop Window
  const win = newSimpleWindow("⚡ OmniStudio RAD Workspace", 1080, 780, {
    theme: "apple_dark",
    padding: 16,
    spacing: 10,
  });

  // 3. Top Menu Bar & Quick Action Toolbar
  win.addMenuBar("mainMenu", [
    {
      label: "File",
      items: ["📄 New Task", "💾 Export JSON...", "---", "🚪 Exit"],
    },
    {
      label: "View",
      items: ["🗂 Tasks & Search", "📊 Telemetry & Charts", "⚙️ Settings"],
    },
    { label: "Help", items: ["ℹ️ About OmniStudio"] },
  ]);

  win.addToolBar("mainToolbar", [
    "➕ Quick Task",
    "🔄 Refresh",
    "📊 Pulse Check",
    "💾 Export JSON",
  ]);

  // 4. Header Row with Live Theme Switcher
  win.beginRow();
  win.addHeading(
    "⚡ OmniStudio Workspace",
    "Tabs, Live Search, SQLite CRUD, Charts & Rich Dialogs",
  );
  win.addThemeSelector("dd_theme", "Theme:");
  win.endRow();

  // 5. Tab Bar Navigation (1-Line .bindViews switches visible workspace sections)
  const TAB_GROUPS: Record<string, string[]> = {
    "🗂 Tasks & Search": ["cardSearch", "tblTasks", "cardEditor"],
    "📊 Telemetry & Charts": ["cardKpis", "cardCharts", "cardFeed"],
    "⚙️ Settings": ["cardSettings"],
  };

  function activateTab(w: SimpleWindow, tabName: string) {
    for (const [tab, ids] of Object.entries(TAB_GROUPS)) {
      if (tab === tabName) w.showControls(ids);
      else w.hideControls(ids);
    }
    w.setState("active_tab", tabName);
    w.setStatusBarText(
      `View: ${tabName} | Total tasks: ${rad.sqliteutils.countRows(db, "tasks")}`,
    );
  }

  win
    .addTabs(["🗂 Tasks & Search", "📊 Telemetry & Charts", "⚙️ Settings"], 0)
    .id("workspaceTabs")
    .bindViews(TAB_GROUPS, (w, tabName) => {
      w.setState("active_tab", tabName);
      w.setStatusBarText(
        `View: ${tabName} | Total tasks: ${rad.sqliteutils.countRows(db, "tasks")}`,
      );
    });

  // ============================================================================
  // TAB 1: LIVE SEARCH FILTERING + SQLITE DATA TABLE + CRUD EDITOR
  // ============================================================================
  const refreshTable = (w: SimpleWindow) => {
    const q = (w.getText("txtSearch") || "").trim();
    const cat = w.getText("cmbCatFilter") || "All";
    const clauses: string[] = [];
    const params: any[] = [];

    if (q) {
      clauses.push("(title LIKE ? OR priority LIKE ? OR status LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (cat && cat !== "All") {
      clauses.push("category = ?");
      params.push(cat);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = rad.sqliteutils.queryAll<any>(
      db,
      `SELECT id, title, category, priority, status FROM tasks ${whereSql} ORDER BY id DESC`,
      params,
    );

    w.setTableRows(
      "tblTasks",
      rows.map((r) => [
        String(r.id),
        r.title,
        r.category,
        r.priority,
        r.status,
      ]),
    );
    w.setText("bdgCount", `${rows.length} matching`);
    w.setStatusBarText(`Showing ${rows.length} task(s)`);
  };

  win.beginCard("🔍 Live Search & Multi-Facet Filter").id("cardSearch");
  win.beginRow();
  win
    .addSearchInput("Filter by title, priority, or status...", (w) =>
      refreshTable(w),
    )
    .id("txtSearch")
    .width(340);
  win
    .addDropdown(
      ["All", "Database", "Frontend", "Backend", "DevOps"],
      "All",
      (w) => refreshTable(w),
    )
    .id("cmbCatFilter")
    .width(160);
  win
    .addButton("🧹 Reset", (w) => {
      w.setText("txtSearch", "");
      w.setValue("cmbCatFilter", "All");
      refreshTable(w);
    })
    .width(95);
  win.addBadge("5 matching", "info").id("bdgCount");
  win.endRow();
  win.endCard();

  win
    .addTable(
      "tblTasks",
      ["ID", "Task Title", "Category", "Priority", "Status"],
      [],
      (w, rowId) => {
        w.setState("selected_task_id", String(rowId));
        w.setStatusBarText(
          `Selected task #${rowId} (Double-click row to toggle Done)`,
        );
      },
    )
    .onDoubleClick((w, rowId) => {
      const row = rad.sqliteutils.selectOne<any>(db, "tasks", "id = ?", [
        Number(rowId),
      ]);
      if (!row) return;
      const nextStatus = row.status === "Done" ? "In Progress" : "Done";
      rad.sqliteutils.updateRows(
        db,
        "tasks",
        { status: nextStatus },
        "id = ?",
        [Number(rowId)],
      );
      refreshTable(w);
      w.toast(`Task #${rowId} marked ${nextStatus}`, 1600, "success");
    });

  win.beginCard("✏️ Add / Manage Tasks").id("cardEditor");
  win.beginRow();
  win
    .addTextInput("New task title...", "")
    .id("txtNewTitle")
    .width(300)
    .contextMenu(["🔤 UPPERCASE", "🔡 lowercase", "🧹 Clear"], (w, act) => {
      const cur = w.getText("txtNewTitle");
      if (act.includes("UPPER")) w.setText("txtNewTitle", cur.toUpperCase());
      else if (act.includes("lower"))
        w.setText("txtNewTitle", cur.toLowerCase());
      else w.setText("txtNewTitle", "");
    });
  win
    .addDropdown(["Database", "Frontend", "Backend", "DevOps"], "Frontend")
    .id("cmbNewCat")
    .width(140);
  win
    .addDropdown(["High", "Medium", "Low"], "Medium")
    .id("cmbNewPrio")
    .width(120);
  win
    .addButton("➕ Add Task", (w) => {
      const title = w.getText("txtNewTitle").trim();
      if (!title)
        return void w.warn("Title Required", "Enter a task title first.");
      rad.sqliteutils.insertRow(db, "tasks", {
        title,
        category: w.getText("cmbNewCat") || "Frontend",
        priority: w.getText("cmbNewPrio") || "Medium",
        status: "Todo",
      });
      w.setText("txtNewTitle", "");
      refreshTable(w);
      w.addActivityFeedItem(
        "feedAudit",
        new Date().toLocaleTimeString(),
        `Added task "${title}"`,
      );
      w.toast(`Added "${title}"`, 1800, "success");
    })
    .bg("#0284c7")
    .color("#ffffff")
    .bold()
    .width(130);

  win
    .addButton("🗑 Delete Selected", (w) => {
      const id = w.getStateOr("selected_task_id", "");
      if (!id)
        return void w.info(
          "No Selection",
          "Click a task row in the table first.",
        );
      w.fire(
        {
          title: `Delete Task #${id}?`,
          text: "This will remove the record from SQLite.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Delete",
          confirmButtonColor: "#dc2626",
        },
        (res) => {
          if (res.isConfirmed) {
            rad.sqliteutils.deleteRows(db, "tasks", "id = ?", [Number(id)]);
            w.removeState("selected_task_id");
            refreshTable(w);
            w.toast(`Deleted task #${id}`, 1600, "error");
          }
        },
      );
    })
    .bg("#dc2626")
    .color("#ffffff")
    .width(150);
  win.endRow();
  win.endCard();

  // ============================================================================
  // TAB 2: CHARTS, GAUGES, RINGS & REAL-TIME TELEMETRY
  // ============================================================================
  win.beginCard("📈 Cluster KPIs & Activity Rings").id("cardKpis");
  win.beginRow();
  win
    .addScoreCard("SLA Uptime", 99.98, "30-day rolling window", "A+")
    .width(190);
  win
    .addDonutChart("donutStorage", "SQLite Pages", 62, "WAL Checkpoint OK")
    .width(185);
  win
    .addActivityRings("ringsHealth", [
      { label: "CPU", percent: 74, color: "#fa114f" },
      { label: "RAM", percent: 58, color: "#a1ff00" },
      { label: "I/O", percent: 89, color: "#00f0ff" },
    ])
    .width(175);
  win.addCircularProgress("cprCache", 84);
  win.addGauge("ggeLatency", "P95 Latency (ms)", 14);
  win.endRow();
  win.endCard();

  win.beginCard("📊 Live Throughput Chart & Sparkline").id("cardCharts");
  win.beginRow();
  win.addChart("crtThroughput", "line", 130).width(420);
  win.addSparkline("spkTrend", [20, 35, 28, 45, 60, 52, 75, 68], 40);
  win
    .addButton("⚡ Simulate Load Spike", async (w) => {
      await w.withBusyState(
        ["btnSpike"],
        "⏳ Running load generator...",
        async (ctx) => {
          await ctx.sleep(800);
          const spike = [45, 62, 78, 95, 88, 92, 99, 85];
          ctx.setChartData("crtThroughput", spike);
          ctx.setSparklineData("spkTrend", spike);
          ctx.setCircularProgress("cprCache", 96);
          ctx.setGaugeValue("ggeLatency", 42);
          ctx.toast("Load spike telemetry captured!", 1800, "info");
        },
      );
    })
    .id("btnSpike")
    .bg("#7c3aed")
    .color("#ffffff")
    .width(190);
  win.endRow();
  win.endCard();

  win.beginCard("📋 Live Activity Audit Stream").id("cardFeed");
  win.addActivityFeed("feedAudit", 110);
  win.addActivityFeedItem(
    "feedAudit",
    new Date().toLocaleTimeString(),
    "OmniStudio workspace initialized.",
  );
  win.endCard();

  // ============================================================================
  // TAB 3: WORKSPACE SETTINGS & REACTIVE STATE BINDING
  // ============================================================================
  win.beginCard("⚙️ Workspace Preferences & Persistence").id("cardSettings");
  win.addFormField("Workspace Name:", "txtWsName", "Production Ops");
  win.bindState("txtWsName", "workspace_name");
  win.addFormSlider("Telemetry Poll Rate (s):", "sldPoll", 5);
  win.addFormSwitch(
    "Auto-Save Session:",
    "swtAutoSave",
    "Persist form & window state on close",
    true,
  );

  win.beginRow();
  win
    .addButton("💾 Save Workspace JSON", (w) => {
      w.save_webview_file_dialog(
        "Export Workspace Settings",
        "workspace_settings.json",
        (dest) => {
          if (dest) {
            w.saveValuesToFile(String(dest));
            w.toast(`Saved to ${dest}`, 2000, "success");
          }
        },
      );
    })
    .bg("#059669")
    .color("#ffffff")
    .width(200);

  win
    .addButton("📂 Load Workspace JSON", (w) => {
      w.open_webview_file_dialog("Load Workspace Settings", ".json", (src) => {
        if (src) {
          w.loadValuesFromFile(String(src));
          w.toast(`Loaded ${src}`, 2000, "info");
        }
      });
    })
    .width(200);
  win.endRow();
  win.endCard();

  // Wire Menu & Toolbar handlers
  win.onClick("mainMenu", (w, item) => {
    if (item.includes("Exit")) w.quit();
    else if (item.includes("Tasks & Search"))
      activateTab(w, "🗂 Tasks & Search");
    else if (item.includes("Telemetry & Charts"))
      activateTab(w, "📊 Telemetry & Charts");
    else if (item.includes("Settings")) activateTab(w, "⚙️ Settings");
    else if (item.includes("About"))
      w.info("About OmniStudio", "Built with Bun RAD Studio & SimpleGUI.");
  });

  win.onClick("mainToolbar", (w, action) => {
    if (action.includes("Refresh")) refreshTable(w);
    else if (action.includes("Pulse")) activateTab(w, "📊 Telemetry & Charts");
    else if (action.includes("Quick Task")) {
      w.prompt("Task title:", "Review PR #42", "Quick Task", (title) => {
        if (title) {
          rad.sqliteutils.insertRow(db, "tasks", {
            title,
            category: "DevOps",
            priority: "Medium",
            status: "Todo",
          });
          refreshTable(w);
          w.toast(`Created "${title}"`, 1500, "success");
        }
      });
    }
  });

  // Live 2-second heartbeat timer for telemetry
  const telemetryHistory = [32, 40, 38, 50, 46, 62, 58, 65];
  win.addTimer(
    2000,
    (w) => {
      const next = Math.floor(35 + Math.random() * 45);
      telemetryHistory.push(next);
      if (telemetryHistory.length > 8) telemetryHistory.shift();
      w.setChartData("crtThroughput", telemetryHistory);
      w.setSparklineData("spkTrend", telemetryHistory);
    },
    { id: "pulseTimer" },
  );

  win.addStatusBar("Ready");
  refreshTable(win);
  activateTab(win, "🗂 Tasks & Search");

  return win;
}

if (import.meta.main) createFullStudioWorkspace().run();
```

---

<a id="template-2-full-featured-simplecli--rad-devops-automation-tool"></a>

### Template 2: Full-Featured SimpleCLI + `rad` DevOps Automation Tool

```typescript
import { newApp, sys, AlertKind, TaskStatus } from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";
import { computeCodeStats } from "./src/features/tokei/tokeiCoordinator.ts";

export async function runDevOpsCli(argv = process.argv.slice(2)) {
  const app = newApp("rad-ops", "1.5.0")
    .setDescription(
      "Full-featured SimpleCLI + RAD workspace audit & telemetry tool",
    )
    .addFlagString("path", "p", "./src", "Target directory to analyze")
    .addFlagBool("json", "j", false, "Emit machine-readable JSON output")
    .handleErrors();

  if (!app.parseArgs(argv)) return;

  const targetPath = app.getFlagString("path");
  app.banner("⚡ RAD-Ops Workspace Auditor", `Scanning target: ${targetPath}`);

  // 1. Multi-Step Pipeline
  const pipe = app.newPipeline("Workspace Health & Codebase Audit");
  let locReports: Awaited<ReturnType<typeof computeCodeStats>> = [];
  let tsFiles: string[] = [];

  pipe.addStep(
    "Scan TypeScript files via Bun.Glob (rad.globutils)",
    async () => {
      tsFiles = await rad.globutils.findFiles("**/*.ts", targetPath);
      return tsFiles.length > 0;
    },
  );

  pipe.addStep("Compute LOC metrics via tokei coordinator", async () => {
    locReports = await computeCodeStats({
      paths: [targetPath],
      sort: "code",
      showFiles: false,
      hidden: false,
    });
    return locReports.length > 0;
  });

  await pipe.run();

  // 2. Hardware & System Telemetry
  app.step(1, "System & Runtime Telemetry");
  app.printKv({
    "Host / OS": `${sys.osHostname()} (${sys.osPlatform()} ${sys.osArch()})`,
    "CPU Cores": `${sys.cpuCount()} cores (${sys.cpuModel()})`,
    "RAM Usage": `${sys.ramPercent().toFixed(1)}%`,
    "TS Files Found": String(tsFiles.length),
  });

  // 3. Codebase Breakdown Table & Bar Chart
  app.step(2, "Language Breakdown");
  app.table(
    ["Language", "Files", "Code LOC", "Comments", "Blanks"],
    locReports
      .slice(0, 6)
      .map((r) => [
        r.language,
        String(r.files),
        String(r.stats.code),
        String(r.stats.comment),
        String(r.stats.blank),
      ]),
  );

  const chartData: Record<string, number> = {};
  for (const r of locReports.slice(0, 5)) chartData[r.language] = r.stats.code;
  app.barChart("Lines of Code by Language", chartData, 28);

  app.alert(
    AlertKind.SUCCESS,
    "Audit Complete",
    `Verified ${tsFiles.length} TypeScript files.`,
  );
}

if (import.meta.main) await runDevOpsCli();
```

---

<a id="8-part-7-complete-main-documentation-reference-map"></a>

## 8. 📚 Part 7: Complete Main Documentation Reference Map

Use this master reference directory to jump straight from any cheat sheet section to the authoritative in-depth guide, architecture breakdown, or API reference:

| Domain / Topic                           | Primary Reference Document                                                       | Focused Deep-Dive Guides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :--------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Documentation Home & Search**          | **[`docs/index.md`](docs/index.md)**                                             | [Task-Oriented Index (`docs/reference/task-index.md`)](docs/reference/task-index.md) · [Requirements (`docs/getting-started/requirements.md`)](docs/getting-started/requirements.md) · [Install & First Launch (`docs/getting-started/install-and-first-launch.md`)](docs/getting-started/install-and-first-launch.md) · [Saved Data & Files (`docs/reference/data-and-files.md`)](docs/reference/data-and-files.md)                                                                                                                                                                                  |
| **Focused Cheat Sheets**                 | **[`docs/cheatsheets/index.md`](docs/cheatsheets/index.md)**                     | [SimpleGUI Cheat Sheet (`docs/cheatsheets/simplegui-cheatsheet.md`)](docs/cheatsheets/simplegui-cheatsheet.md) · [SimpleCLI Cheat Sheet (`docs/cheatsheets/simplecli-cheatsheet.md`)](docs/cheatsheets/simplecli-cheatsheet.md) · [45 `rad` Modules Cheat Sheet (`docs/cheatsheets/rad-modules-cheatsheet.md`)](docs/cheatsheets/rad-modules-cheatsheet.md) · [Studios, CLI & Troubleshooting (`docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md`)](docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md)                                                                     |
| **SimpleGUI Desktop Framework**          | **[`docs/SIMPLEGUI_API.md`](docs/SIMPLEGUI_API.md)**                             | [Quick Start (`docs/SIMPLEGUI_API.md#quick-start`)](docs/SIMPLEGUI_API.md#quick-start) · [Controls Reference (`docs/SIMPLEGUI_API.md#controls-reference`)](docs/SIMPLEGUI_API.md#controls-reference) · [Layouts (`docs/SIMPLEGUI_API.md#layout-systems`)](docs/SIMPLEGUI_API.md#layout-systems) · [Enterprise & Rich Dialogs (`docs/SIMPLEGUI_API.md#dialogs-sweetalert2-style`)](docs/SIMPLEGUI_API.md#dialogs-sweetalert2-style)                                                                                                                                                                    |
| **SimpleCLI Terminal & Backend**         | **[`docs/CLI_API.md`](docs/CLI_API.md)**                                         | [CLI Flags (`docs/CLI_API.md#2-cli-flags--argument-parsing`)](docs/CLI_API.md#2-cli-flags--argument-parsing) · [Prompts & Wizards (`docs/CLI_API.md#4-interactive-prompts-menus--input-validation`)](docs/CLI_API.md#4-interactive-prompts-menus--input-validation) · [REST & Micro-Server (`docs/CLI_API.md#15-http-client-micro-server--rest-apis`)](docs/CLI_API.md#15-http-client-micro-server--rest-apis)                                                                                                                                                                                        |
| **45 `rad` Utility Modules**             | **[`src/features/rad/README.md`](src/features/rad/README.md)**                   | [File & Storage (`src/features/rad/README.md#1-file--storage-8-modules`)](src/features/rad/README.md#1-file--storage-8-modules) · [Collections (`src/features/rad/README.md#2-data-structures--collections-8-modules`)](src/features/rad/README.md#2-data-structures--collections-8-modules) · [Concurrency (`src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules`)](src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules)                                                                                                                                       |
| **10 System Utilities (`fd`..`doggo`)**  | **[`docs/SYSTEM_UTILITIES_API.md`](docs/SYSTEM_UTILITIES_API.md)**               | [User Guides Master Hub (`docs/userguides/README.md`)](docs/userguides/README.md) · [`fd` (`src/features/fd/README.md`)](src/features/fd/README.md) · [`tokei` (`src/features/tokei/README.md`)](src/features/tokei/README.md) · [`procs` (`src/features/procs/README.md`)](src/features/procs/README.md)                                                                                                                                                                                                                                                                                             |
| **Databases (SQLite, PG, MySQL, Redis)** | **[`docs/databases/index.md`](docs/databases/index.md)**                         | [Complete Databases Guide (`docs/databases/complete-databases-guide.md`)](docs/databases/complete-databases-guide.md) · [Database Workbench (`docs/databases/workbench.md`)](docs/databases/workbench.md) · [SQLite Studio (`docs/userguides/01_sqlite_studio.md`)](docs/userguides/01_sqlite_studio.md) · [Postgres Studio (`docs/userguides/42_postgres_studio.md`)](docs/userguides/42_postgres_studio.md) · [MySQL Studio (`docs/userguides/41_mysql_studio.md`)](docs/userguides/41_mysql_studio.md) · [Redis Studio (`docs/userguides/40_redis_studio.md`)](docs/userguides/40_redis_studio.md) |
| **Visual Form Designer & `FormSpec`**    | **[`docs/visual-designer/index.md`](docs/visual-designer/index.md)**             | [FormSpec & Runtime API (`docs/API.md`)](docs/API.md) · [Generated Applications (`docs/generated-applications/index.md`)](docs/generated-applications/index.md) · [Declarative Module (`docs/API.md#10-simplegui-declarative-module-reference`)](docs/API.md#10-simplegui-declarative-module-reference)                                                                                                                                                                                                                                                                                               |
| **310 Themes (167 FX Shaders)**          | **[`docs/THEMES.md`](docs/THEMES.md)**                                           | [Futuristic FX Shaders (`docs/developer/fx-themes.md`)](docs/developer/fx-themes.md) · [Universal Theme Persistence (`docs/SIMPLEGUI_API.md#universal-theme-persistence`)](docs/SIMPLEGUI_API.md#universal-theme-persistence)                                                                                                                                                                                                                                                                                                                                                                         |
| **Built-In Studios, Scripts & Guides**   | **[`docs/reference/application-index.md`](docs/reference/application-index.md)** | [Script Index (`docs/reference/script-index.md`)](docs/reference/script-index.md) · [Launcher Studio (`docs/userguides/00_launcher_studio.md`)](docs/userguides/00_launcher_studio.md) · [File Manager (`docs/userguides/43_file_manager.md`)](docs/userguides/43_file_manager.md) · [AI & Enhancements Tutorial (`docs/AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL.md`)](docs/AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL.md)                                                                                                                                                                                    |
| **Architecture, Testing & Packaging**    | **[`docs/developer/handbook.md`](docs/developer/handbook.md)**                   | [Architecture (`docs/developer/architecture.md`)](docs/developer/architecture.md) · [Testing Guide (`docs/testing/index.md`)](docs/testing/index.md) · [Releasing Binaries (`docs/developer/releasing.md`)](docs/developer/releasing.md) · [Security (`docs/security.md`)](docs/security.md) · [Troubleshooting (`docs/troubleshooting.md`)](docs/troubleshooting.md)                                                                                                                                                                                                                                 |

---

<a id="9-part-8-master-troubleshooting--no-questions-left-faq"></a>

## 9. 🩺 Part 8: Master Troubleshooting & "No Questions Left" FAQ

### Symptom -> Cause -> 10-Second Fix Table

| Symptom / Error                                                                   | Root Cause                                                                                                                                                                         | 10-Second Fix                                                                                                                                                                                                                                               |
| :-------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Script exits immediately with no window**                                       | Missing `win.run()` (or forgot `if (import.meta.main) win.run()`).                                                                                                                 | Add `win.run()` on the final line of your entrypoint script.                                                                                                                                                                                                |
| **`getText("txtUser")` returns `""` or `setText` does nothing**                   | Control wasn't chained with `.id("txtUser")` (got an auto-ID instead).                                                                                                             | Chain `.id("txtUser")` onto the control builder, e.g. `win.addInput("Username").id("txtUser")`.                                                                                                                                                             |
| **Window opens fullscreen or ignores `width` / `height`**                         | `newSimpleWindow` defaults to `fullscreen: true` when `width`, `height`, and `fullscreen` are omitted (`src/simplegui.ts`), or explicit `fullscreen: true` overrides width/height. | Pass explicit numbers: `newSimpleWindow("My App", 1000, 700)` or `{ width: 1000, height: 700, fullscreen: false }`.                                                                                                                                         |
| **Code changes to `width` / `theme` seem ignored on launch**                      | Stale `session.json` bounds/theme are restored when `{ width, theme, fullscreen }` weren't explicitly set in options.                                                              | Pass `{ width, height, theme, fullscreen }` explicitly in `SimpleWindowOptions` (explicit options override `session.json`), or launch File Manager with `--reset-window`.                                                                                   |
| **`setText("lbl", "<b>OK</b>")` shows raw `<b>` tags**                            | `setText()` escapes HTML intentionally to block accidental DOM injection.                                                                                                          | Use `win.setHtml("lbl", "<b>OK</b>")` only for trusted markup (sanitize user strings first).                                                                                                                                                                |
| **`Cannot find module "bun-rad-studio"` / `"./src/simplegui"`**                   | Wrong import specifier for your file's location (npm install vs repo root vs subfolder).                                                                                           | Use `"bun-rad-studio/simplegui"` (npm), `"./src/simplegui"` (repo root), or `"../../src/simplegui"` (`examples/rad_tutorial/`, `applications/`).                                                                                                            |
| **Duplicate symbol (`writeFileAtomic`, `LRUCache`, `Logger`) from barrel import** | Top-level barrel combines SimpleGUI (sync), SimpleCLI, and `rad.*` (async) exports (`D-027`).                                                                                      | Use `rad.fileutils.writeFileAtomic` (async) vs `SimpleGUI` sync helper, `rad.cacheutils.LRUCache` vs `SimpleCLI`, package exports `"bun-rad-studio"` / `"bun-rad-studio/simplegui"`, or source paths `"./src/simplecli"` / `"./src/features/rad/index.ts"`. |
| **Live search or timer updates lag**                                              | Running SQL/HTTP calls on every keystroke or issuing 10+ separate DOM evaluations.                                                                                                 | Use `.filterTable("tbl", () => rows)` for in-memory filtering, wrap SQL/HTTP calls in `rad.flowutils.debounce(fn, 180)`, and batch updates with `values({...})`, `setManyTexts({...})`, or `setManyVisibility({...})`.                                      |
| **Inserting 1,000+ SQLite rows is very slow**                                     | Separate `db.run("INSERT ...")` statements flush disk transactions per row.                                                                                                        | Use `rad.sqliteutils.insertMany(db, table, rows)` or `rad.sqliteutils.transaction(db, () => { ... })`.                                                                                                                                                      |
| **CLI hangs in GitHub Actions or breaks piped `jq`**                              | Interactive prompts hang without a TTY, or ANSI tables corrupt piped stdout.                                                                                                       | Gate prompts on `process.stdin.isTTY` (add `--yes`), and print results with `app.output(data)` which switches cleanly to JSON when piped or `--json` is passed.                                                                                             |
| **`TypeError: sys.execSafe is not a function`**                                   | `execSafe` lives on `rad.sysutils`, not `sys`.                                                                                                                                     | Import `rad` and call `await rad.sysutils.execSafe("git", ["status", "--short"])` (takes command + args array, no shell!).                                                                                                                                  |
| **`src/ide/` edits don't appear in Visual Form Designer**                         | `bun run start` serves the bundled `src/ide.html` artifact.                                                                                                                        | Rebuild designer assets with `bun run ide:build`.                                                                                                                                                                                                           |
| **Visual Designer DB controls / Run / Export behave unexpectedly**                | DB controls (`DB Grid`, `DB Navigator`, etc.) & DB Wizard are placeholders (`D-002`); native Run/Export clicks aren't hand-verified (`docs/visual-designer/index.md`).             | Copy generated TypeScript/SQLite tabs and build real database logic with `rad.sqliteutils`, `bun run workbench`, or `bun run app:sqlite`.                                                                                                                   |
| **macOS says extracted release `.app` is `"damaged"`**                            | Unsigned archive downloaded from browser retains `com.apple.quarantine`.                                                                                                           | Verify the release checksum first, then run `xattr -cr /path/to/App.app` or `xattr -dr com.apple.quarantine ./codecaine-file-manager`.                                                                                                                      |
| **Ubuntu 24.04+ WebKit crashes (`bwrap: setting up uid map: Permission denied`)** | AppArmor blocks unprivileged user namespaces for WebKitGTK.                                                                                                                        | Run `sh install.sh --apparmor` in the extracted release folder, or start File Manager with `--server` and open in Chrome/Brave.                                                                                                                             |
| **Windows DLL load error or Parallels `\\Mac\...` failure**                       | ARM64 DLL mismatch or UNC path rejected by `cmd.exe` / WebView2.                                                                                                                   | Move/extract to local NTFS (`C:\Users\...`), install Edge WebView2 + **x64** Microsoft VC++ Redistributable (`vc_redist.x64.exe`) + **x64** Bun.                                                                                                            |
| **`EADDRINUSE` or `403 Forbidden` on File Manager / Workbench**                   | Port already bound (`8995–9005`), or `localGuard.ts` blocked a non-loopback origin.                                                                                                | Pass `--port 9020` / set `WORKBENCH_PORT=9100`, and open `http://127.0.0.1:<port>` locally (or via SSH local tunnel).                                                                                                                                       |
| **`app:sqlite` / `app:postgres` / `app:mysql` ignores `.env` from File Manager**  | File Manager intentionally strips inherited DB env vars when spawning child studios to prevent secret leaks.                                                                       | Save a connection profile in Workbench / File Manager (`~/.bun_rad_studio/connections.json`), or launch directly from your workspace (`bun run app:postgres`).                                                                                              |
| **`bun run docs:check` fails on secret scanner or `bun run <cmd>`**               | Password-like example string `>= 8` chars without safe prefix, or unknown script name.                                                                                             | Prefix example secrets with `placeholder-`, `your-`, `my-`, or `example-` (e.g. `"placeholder-secret"`, `"postgres://user:placeholder@localhost:5432/appdb"`), and use only scripts listed in `package.json` or real `.ts` files.                           |

### Common Pitfalls: ❌ Wrong vs ✅ Right

```typescript
import { rad } from "./src/features/rad/index.ts";
import {
  createWindow,
  writeFileAtomic as writeGuiFileAtomic,
} from "./src/simplegui";

// 1. Window sizing & theme precedence over cached session.json + D-027 disambiguation
// ❌ Wrong: omit width/height/fullscreen (opens fullscreen default or reuses stale session.json)
const staleWin = createWindow("Studio", { appId: "acme-studio" });
// ✅ Right: pin explicit window geometry & theme; alias SimpleGUI sync vs rad async atomic writes
const win = createWindow("Studio", {
  width: 960,
  height: 640,
  theme: "nord",
  fullscreen: false,
  appId: "acme-studio",
});
writeGuiFileAtomic("./prefs.json", JSON.stringify({ ok: true })); // Sync SimpleGUI helper
void rad.fileutils.writeFileAtomic(
  "./export.json",
  JSON.stringify({ ok: true }),
); // Async rad helper
void staleWin;

// 2. Modal callback inside onClick (never block the WebView thread with await!)
win
  .addButton("Delete")
  .id("btnDel")
  .onClick(async () => {
    // ❌ Wrong: await win.confirm("Delete?", "Confirm") inside an IPC click handler can deadlock!
    // ✅ Right: pass a trailing callback `(ok) => ...` so the click handler returns right away
    win.confirm("Delete item?", "Confirm", (ok) => {
      if (ok) win.setText("lblStatus", "Deleted");
    });
  });

// 3. Control state updates: setText (plain text) vs setChecked (boolean) vs setHtml (live HTML)
// ❌ Wrong: win.setText("chkDark", "true"); win.setText("htmlOut", "<b>Ready</b>");
// ✅ Right: use method matching control type
win.setChecked("chkDark", true);
win.setHtml("htmlOut", "<b>Ready</b>");

// 4. Never interpolate user input into a shell string
const userBranch = "main";
// ❌ Wrong: await rad.shellutils.execCmd(`git log -n 1 ${userBranch}`);
// ✅ Right: spawn directly without a shell via rad.sysutils.execSafe(cmd, args)
await rad.sysutils.execSafe("git", ["log", "-n", "1", userBranch]);
```

### Plain-English "No Questions Left" FAQ

- **Do I need React, Electron, Vite, or a bundler just to start?**
  No. Bun runs TypeScript directly with zero config: `SimpleGUI` drives a native OS WebView (`webview-bun`), `SimpleCLI` prints pure ANSI/JSON to stdout, and `rad` provides 45 zero-dependency utility modules.
- **Can I combine `SimpleGUI`, `SimpleCLI`, and `rad` in the same app?**
  Yes — in fact that's the recommended pattern: build your desktop window with `SimpleGUI`, store local data with `rad.sqliteutils`, call REST APIs with `createApiClient`, and run shell-free subprocesses with `rad.sysutils.execSafe`.
- **When should I call `win.setText(...)` vs `win.setValue(...)` vs `win.setHtml(...)`?**
  - `win.setText(id, str)`: sets **escaped plain text** (`labels`, `badges`, `buttons`, `textInputs`, `textAreas`).
  - `win.setValue(id, val)`: sets **raw data values** (`slider`, `stepper`, `progressBar`, `checkbox`, `switch`, `dropdown`, `codeView`).
  - `win.setHtml(id, html)`: sets **live HTML markup** inside `addHtmlView` (never pass unescaped user input!).
- **How do I test a SimpleGUI or SimpleCLI app in `bun test` without popping up windows or waiting on prompts?**
  - **GUI:** Export `createMyApp(dbPath = ":memory:")`, skip `win.run()` unless `import.meta.main`, and drive everything headlessly via `await win.triggerClick(id)`, `await win.triggerChange(id, val)`, `win.values()`, and `win.getTableRows(id)`.
  - **CLI:** Pass an argv array synchronously to `app.parseArgs(["--env", "prod", "--json"])` (or dispatch subcommands with `await app.run(["deploy", "--env", "prod", "--json"])`), mock HTTP endpoints on an ephemeral port via `sys.serveJson(routes, 0)`, and pass `{ inMemory: true }` to `app.redis(...)`.
- **Where are all my saved themes, studio drafts, DB profiles, and backups stored?**
  See [OS Config, State & Studio Data Paths](#5-part-4-visual-form-designer-ide-shortcuts--single-binary-build) above and [`docs/reference/data-and-files.md`](docs/reference/data-and-files.md) for exact macOS, Linux, and Windows locations (`~/.bun_rad_studio/`, `~/.config/simplegui/theme.txt`, `STUDIO_DB_PROFILE_DIR`, `$GRAVEYARD`, `~/bun_rad_samples`).
