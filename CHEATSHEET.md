# ⚡ Bun RAD Studio — Complete RAD Development Cheat Sheet & Studio Templates

A step-by-step, copy-paste reference for **Rapid Application Development (RAD)** in TypeScript and Bun across **SimpleGUI** (Desktop UI), **SimpleCLI** (Headless Console & Backend), the **45 `rad` Utility Modules**, the **10 Programmatic System Tools**, the **Visual Form Designer**, and **Full-Featured Studio Workspace Templates**.

---

## 📑 Table of Contents

1. [🧭 Ecosystem Architecture & Quick Imports](#1-ecosystem-architecture--quick-imports)
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
   - [Domain 1: File, SQLite (WAL + FTS5), TOML, Archives & State (8 Modules)](#domain-1-file-sqlite-wal--fts5-toml-archives--state-8-modules)
   - [Domain 2: Arrays, Objects, Data Structures, Stats, Math & Graphs (8 Modules)](#domain-2-arrays-objects-data-structures-stats-math--graphs-8-modules)
   - [Domain 3: Strings, Regex, Templates, Colors, HTML & Diffs (6 Modules)](#domain-3-strings-regex-templates-colors-html--diffs-6-modules)
   - [Domain 4: System, CLI, Env, Bun Shell, Glob, Transpiler, Cron & SemVer (9 Modules)](#domain-4-system-cli-env-bun-shell-glob-transpiler-cron--semver-9-modules)
   - [Domain 5: Network, HTTP, `Bun.serve` Router, URL, JWT, Crypto & `Bun.hash` (7 Modules)](#domain-5-network-http-bunserve-router-url-jwt-crypto--bunhash-7-modules)
   - [Domain 6: Async Concurrency, Flow Resilience, Functional, Events, Validation, Mock & Time (7 Modules)](#domain-6-async-concurrency-flow-resilience-functional-events-validation-mock--time-7-modules)
   - [10 System Utilities as Plain TypeScript Functions (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`)](#10-system-utilities-as-plain-typescript-functions)
5. [🎨 Part 4: Visual Form Designer (IDE), Shortcuts & Single-Binary Build](#5-part-4-visual-form-designer-ide-shortcuts--single-binary-build)
6. [💡 Part 5: Pro RAD Tips, Tricks & Power Patterns](#6-part-5-pro-rad-tips-tricks--power-patterns)
   - [SimpleGUI Desktop UI, Layout & Performance Tricks](#simplegui-desktop-ui-layout--performance-tricks)
   - [SimpleCLI Terminal, Piping & Backend Tricks](#simplecli-terminal-piping--backend-tricks)
   - [45 `rad` Modules, SQLite & Native Bun Superpower Tricks](#45-rad-modules-sqlite--native-bun-superpower-tricks)
   - [Cross-Platform Portability & Headless Unit Testing Tricks](#cross-platform-portability--headless-unit-testing-tricks)
7. [🚀 Part 6: Complete Full-Featured Workspace Templates](#7-part-6-complete-full-featured-workspace-templates)
   - [Template 1: Full-Featured SimpleGUI Studio Workspace (Tabs + Live Search + Charts + SQLite + Dialogs)](#template-1-full-featured-simplegui-studio-workspace)
   - [Template 2: Full-Featured SimpleCLI + `rad` DevOps Automation Tool](#template-2-full-featured-simplecli--rad-devops-automation-tool)
8. [📚 Part 7: Complete Main Documentation Reference Map](#8-part-7-complete-main-documentation-reference-map)

---

<a id="1-ecosystem-architecture--quick-imports"></a>

## 1. 🧭 Ecosystem Architecture & Quick Imports

### What is Bun RAD Studio? (In Plain English)

**RAD** stands for **Rapid Application Development**. Instead of spending days setting up HTML/CSS build pipelines, React state managers, Electron bundlers, or dozens of `npm` packages, Bun RAD Studio lets you build **complete desktop apps, terminal tools, and databases in a single TypeScript file**.

Everything is organized into **3 simple building blocks** that work together:

1. **🪟 `SimpleGUI` (`./src/simplegui`)** — **For Desktop Windows.** You write plain TypeScript like `win.addHeading(...)`, `win.addTextInput(...)`, `win.addTable(...)`, and `win.addButton(...)`. SimpleGUI opens a native OS window and handles all the HTML, CSS, themes, and events for you automatically.
2. **⌨️ `SimpleCLI` (`./src/simplecli`)** — **For Terminal & Backend Scripts.** When you don't need a desktop window, `SimpleCLI` gives you command-line `--flags`, colored tables, progress bars, interactive terminal questions (`prompt`, `select`, `confirm`), system checks (`sys`), and an HTTP client (`ApiClient`).
3. **🧰 `45 rad Modules` + `10 System Tools` (`./src/features/rad/`)** — **Your Built-in Batteries.** One import (`rad`) gives you ready-to-use helpers for SQLite databases (`rad.sqliteutils`), JSON/CSV/ZIP files (`rad.fileutils`, `rad.archiveutils`), arrays/objects (`rad.arrutils`, `rad.objutils`), passwords/hashing (`rad.cryptoutils`), and fast file/code search (`fd`, `tokei`, `procs`, `doggo`).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ⚡ BUN RAD STUDIO STACK                            │
├────────────────────────┬───────────────────────────┬─────────────────────────┤
│ 🪟 SimpleGUI           │ ⌨️ SimpleCLI              │ 🧰 45 RAD Modules       │
│  • 100+ Desktop Widgets│  • Flags & Subcommands    │  • fileutils / sqlite   │
│  • 35 Enterprise Comps │  • Tables, Charts, Trees  │  • arrutils / objutils  │
│  • Tabs, Search, Charts│  • Prompts, Fuzzy, Wizard │  • strutils / cryptoutils│
│  • 133 Themes + 12 FX  │  • Pipelines & Benchmarks │  • glob / shell / serve │
│  • Reactive State + IPC│  • sys + ApiClient + Redis│  • 10 System CLI Tools  │
└────────────────────────┴───────────────────────────┴─────────────────────────┘
```

### Standard Imports (Copy-Paste What You Need)

```typescript
// 1. SimpleGUI — Import this when building a Desktop Window app
import {
  simplegui,
  createWindow,
  newSimpleWindow,
  getThemeNames,
  getSavedTheme,
  saveTheme,
  type SimpleWindow,
  type SimpleControlRef,
} from "./src/simplegui";

// 2. SimpleCLI — Import this when building a Terminal / CLI tool or Backend script
import SimpleCLI, {
  newApp,
  createApp,
  sys,
  stdlib,
  createApiClient,
  LogLevel,
  AlertKind,
  TaskStatus,
  FormFieldKind,
  PathMode,
  TreeNode,
} from "./src/simplecli";

// 3. 45 RAD Utility Modules — Import this in ANY app (GUI or CLI) for SQLite, files, arrays, crypto, etc.
import { rad } from "./src/features/rad/index.ts";
```

> 📖 **Deep-Dive Reference (Optional):** [Handbook Home (`docs/index.md`)](docs/index.md) · [Install & First Launch (`docs/getting-started/install-and-first-launch.md`)](docs/getting-started/install-and-first-launch.md) · [Architecture (`docs/developer/architecture.md`)](docs/developer/architecture.md) · [Task Index ("I want to...") (`docs/reference/task-index.md`)](docs/reference/task-index.md) · [Cheatsheet Hub (`docs/cheatsheets/index.md`)](docs/cheatsheets/index.md)

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
   - **To read a checkbox, switch, or slider:** `win.getBool("chkAgree")` (`boolean`) or `win.getNumber("sldVolume")` (`number`).
   - **To react when a user clicks or types:** Pass a callback function `(w, value) => { ... }`. The first parameter `w` is always your `SimpleWindow` instance, and `value` is the latest value of that control!
4. **Open the window at the very end:** Call `win.run()` on the last line of your file.

> 📖 **Deep-Dive Reference (Optional):** [SimpleGUI Beginner & API Guide (`docs/SIMPLEGUI_API.md`)](docs/SIMPLEGUI_API.md) · [SimpleGUI Cheat Sheet (`docs/cheatsheets/simplegui-cheatsheet.md`)](docs/cheatsheets/simplegui-cheatsheet.md) · [Declarative Module Reference (`docs/API.md#10-simplegui-declarative-module-reference`)](docs/API.md#10-simplegui-declarative-module-reference)

<a id="step-1-window-creation-options--lifecycle"></a>

### Step 1: Window Creation, Options & Lifecycle

**Plain-English Summary:** `newSimpleWindow(title, width, height, options)` creates your desktop window. If you set `autoSaveState: true` and give your app a unique `appId`, SimpleGUI will automatically remember the user's window size, chosen color theme, and typed form inputs the next time they open the app!

> 📖 **Deep-Dive Reference (Optional):** [Window Creation & Configuration (`docs/SIMPLEGUI_API.md#window-creation`)](docs/SIMPLEGUI_API.md#window-creation) · [Window Options Table (`#window-options-table`)](docs/SIMPLEGUI_API.md#window-options-table) · [Window State Methods (`#window-state-methods`)](docs/SIMPLEGUI_API.md#window-state-methods) · [Lifecycle & Exit (`docs/API.md#-window-lifecycle--process-exit-methods`)](docs/API.md#-window-lifecycle--process-exit-methods)

```typescript
import { newSimpleWindow } from "./src/simplegui";

// 1. Create a 1040×720 desktop window with custom options
const win = newSimpleWindow("Studio Pro", 1040, 720, {
  theme: "apple_dark", // Starting color theme (choose from 133 built-in themes)
  padding: 20, // Empty space around the outer edges of the window (in pixels)
  spacing: 12, // Vertical gap between stacked rows and cards (in pixels)
  alwaysOnTop: false, // Set true to keep this window floating above all other apps
  fullscreen: false, // Set true to launch in fullscreen mode immediately
  responsive: true, // Automatically wrap rows/grids nicely when the window is resized
  autoSaveState: true, // Automatically save & restore theme + form inputs on close/reopen
  appId: "studio_pro_v1", // Unique name used to save settings in your OS user config folder
  effects: "full", // Visual shader effects: "full" | "reduced" | "off"
});

// 2. Useful Window Methods You Can Call Anytime (Inside button clicks, menus, or timers)
win.setTheme("tokyo_night"); // Change the entire app's color theme instantly (no reload!)
win.setEffects("reduced"); // Turn down background animations for low-power laptops
win.setAlwaysOnTop(true); // Pin or unpin the window above other windows
win.toggleFullscreen(); // Enter or exit native fullscreen mode
win.minimize(); // Minimize the window to the OS dock/taskbar
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

**Plain-English Summary:** You never need to write CSS flexbox or calculate `X`/`Y` pixel coordinates. SimpleGUI gives you **4 easy layout containers**:

- **Default (No container):** Controls stack **top-to-bottom**, one per line.
- **`win.beginRow()` ... `win.endRow()`:** Places everything inside **left-to-right** on a single horizontal line.
- **`win.beginGrid(columns, gapPx)` ... `win.endGrid()`:** Places controls into **equal-width columns** (for example, `beginGrid(3, 16)` makes a 3-column layout where the 4th item automatically wraps to the next row).
- **`win.beginCard("Title", "Subtitle")` ... `win.endCard()`:** Wraps controls inside a **rounded, bordered box** with a header title—great for grouping related settings or forms.

> [!IMPORTANT]
> Always close every `beginRow()` with `endRow()`, every `beginGrid()` with `endGrid()`, and every `beginCard()` with `endCard()`.

> 📖 **Deep-Dive Reference (Optional):** [Layout & Container Systems (`docs/SIMPLEGUI_API.md#layout-systems`)](docs/SIMPLEGUI_API.md#layout-systems) · [Horizontal Rows (`#layout-row`)](docs/SIMPLEGUI_API.md#layout-row) · [Multi-Column Grids (`#layout-grid`)](docs/SIMPLEGUI_API.md#layout-grid) · [Container Cards (`#layout-card`)](docs/SIMPLEGUI_API.md#layout-card) · [Absolute Placement (`#layout-absolute`)](docs/SIMPLEGUI_API.md#layout-absolute)

```typescript
// 1. Page Titles & Section Dividers (Stacked top-to-bottom automatically)
win.addHeading("🚀 Mission Control", "Real-time cluster & data studio"); // Big title + subtitle
win.addSubheading("Cluster Overview"); // Medium section header
win.addCaption("All metrics refresh automatically."); // Small muted helper text
win.addDivider(); // Horizontal separator line

// 2. Horizontal Row — Places Label + Search Box + Button side-by-side on one line
win.beginRow();
win.addLabel("Search:").width(70);
win.addSearchInput("Filter items...").id("txtSearch").width(280);
win.addButton("🔍 Search", (w) => {
  // w.getText("txtSearch") reads whatever the user typed into the search box
  w.toast(`Searching for: ${w.getText("txtSearch")}`);
});
win.endRow(); // <-- Closes the horizontal row

// 3. Multi-Column Grid — 3 equal-width columns with a 16px gap between them
win.beginGrid(3, 16);
win.addTextInput("First Name").id("txtFirst"); // Row 1, Column 1
win.addTextInput("Middle Name").id("txtMid"); // Row 1, Column 2
win.addTextInput("Last Name").id("txtLast"); // Row 1, Column 3
win.addSwitch("Active Account", true).id("swtActive"); // Automatically wraps to Row 2, Column 1!
win.endGrid(); // <-- Closes the grid

// 4. Visual Container Card — Draws a clean framed card box around the controls inside
win.beginCard("👤 Account Profile", "Public workspace settings");
win.addFormField("Display Name:", "txtDisplay", "Ada Lovelace");
win.addFormField("Email:", "txtEmail", "ada@analytical.engine");
win.endCard(); // <-- Closes the card

// 5. Dual-Pane Split View — Left and right resizable panels (like an IDE sidebar + editor)
win.addSplitPane("splitMain", 880, 220, {
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

| What You Want to Do                     | Chainable Methods on `SimpleControlRef`                                                                               | Plain-English Meaning                                                         |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Give it a name & read/set its value** | `.id("myId")`, `.bindState("key")`, `.getValue()`, `.setValue(v)`, `.getText()`, `.setText(t)`                        | `.id()` names the control; `.bindState()` auto-syncs it with a state variable |
| **Change its size or position**         | `.width(px)`, `.height(px)`, `.size(w, h)`, `.at(x, y)`, `.expandFill(true)`                                          | Set pixel dimensions or stretch to fill a row                                 |
| **Style colors & fonts**                | `.bg("#hex")`, `.color("#hex")`, `.font(size, color?, weight?)`, `.bold()`, `.italic()`, `.align(dir)`                | Customize colors, font size, bold/italic, and alignment                       |
| **Add hints, limits & focus**           | `.placeholder("hint")`, `.tooltip("hover text")`, `.readOnly(true)`, `.min(0)`, `.max(100)`, `.focus()`, `.flash()`   | Add placeholder text, numeric min/max bounds, or focus/flash the control      |
| **Show, hide, enable, or disable**      | `.show()`, `.hide()`, `.visible(bool)`, `.enable()`, `.disable()`, `.enabled(bool)`                                   | Toggle whether the user can see or interact with the control                  |
| **Power helpers for Tabs & Tables**     | `.bindViews(viewsMap)`, `.filterTable(tableId)`, `.bindDetail(fieldIds)`, `.debounceChange(ms, cb)`                   | 1-line helpers for tab switching, live table filtering, and debounced search  |
| **Listen to clicks, typing & keys**     | `.onClick(cb)`, `.onDoubleClick(cb)`, `.onRightClick(cb)`, `.onChange(cb)`, `.onEnter(cb)`, `.contextMenu(items, cb)` | Run a function when clicked, typed into, `Enter` pressed, or right-clicked    |

---

<a id="step-4-standard-controls--compound-labeled-form-builders"></a>

### Step 4: Standard Controls & Compound Labeled Form Builders

**Plain-English Summary:** SimpleGUI gives you **two ways** to add form inputs:

1. **Standard Controls (`win.addTextInput`, `win.addDropdown`, `win.addSwitch`, etc.):** Adds just the control itself. Use these when placing several controls inside a custom `beginRow()` or `beginGrid()`.
2. **Compound Labeled Form Builders (`win.addFormField`, `win.addFormDropdown`, `win.addFormSwitch`, etc.):** Adds **both the text label on the left AND the input control on the right** in a single clean line! Note that `addForm*` methods take `(label, id, defaultValue)` so you don't even need to chain `.id()`.

#### How to Read & Write Control Values by ID

| Control Type                                  | How to Read Current Value                                  | How to Change Value from Code                        |
| :-------------------------------------------- | :--------------------------------------------------------- | :--------------------------------------------------- |
| **Text Input / Search / TextArea / Dropdown** | `const text = win.getText("txtUser");` (`string`)          | `win.setText("txtUser", "new text");`                |
| **Checkbox / Switch**                         | `const isOn = win.getBool("swtDark");` (`boolean`)         | `win.setValue("swtDark", true);`                     |
| **Slider / Stepper / Number / Progress**      | `const num = win.getNumber("sldVol");` (`number`)          | `win.setValue("sldVol", 85);`                        |
| **Dropdown Option List (Change choices)**     | `const picked = win.getText("cmbEnv");`                    | `win.setOptions("cmbEnv", ["Dev", "Prod"], "Prod");` |
| **Read ALL Form Controls at Once**            | `const obj = win.getFormValues();` (`Record<string, any>`) | `win.setAll({ txtUser: "ada", sldVol: 90 });`        |

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
  "# Release v1.5\n- Zero-config SQLite\n- 133 Themes",
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
  .addTabs(["index.ts", "schema.sql", "README.md"], 0, {
    closable: true,
    onTabClose: (w, closedTab) => w.toast(`Closed ${closedTab}`),
  })
  .id("docTabs")
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
      id.toLowerCase().includes(query) ||
      name.toLowerCase().includes(query) ||
      status.toLowerCase().includes(query);
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
>
> ```typescript
> win.virtualList(
>   Array.from({ length: 5000 }, (_, i) => ({
>     primary: `Log Entry #${i + 1}`,
>     secondary: `2026-11-07T06:00:${String(i % 60).padStart(2, "0")}Z`,
>   })),
>   {
>     search: true,
>     width: 420,
>     height: 260,
>     onClick: (w, row) => w.toast(`Clicked #${row.index + 1}`),
>   },
> );
> ```

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

**Plain-English Summary:** Need advanced UI components like an **Autocomplete box**, **Multi-level Cascader**, **@Mentions input**, **Rich Text Editor**, **Signature Pad**, **Copy-to-Clipboard button**, **Delete Confirmation Popover (`popconfirm`)**, **Kanban Board**, or **Slide-out Sidebar Drawer**? They are all built directly into `win.*` with zero external libraries!

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
win.copyButton("Copy Token", "rad-token-2026", { width: 150 });

// LoadingButton: Automatically shows a spinner for 1500ms when clicked
win.loadingButton("Run Migration", {
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
    cards: [{ id: "2", title: "Ship 133 Themes", tag: "UI" }],
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
```

---

<a id="step-9-reactive-state-store-two-way-binding--os-persistence"></a>

### Step 9: Reactive State Store, Two-Way Binding & OS Persistence

**Plain-English Summary:**

- **What is `.bindState("key")`?** It links a UI control directly to a named variable inside `win`. If the user types into the box, `win.getState("key")` updates automatically. If your code calls `win.setState("key", "new value")`, the UI box on screen updates automatically!
- **What is `validateForm`?** Instead of writing 20 lines of `if (!email.includes("@"))`, pass a rules object (`required`, `minLength`, `min`, `max`, `email`, `pattern`) to `win.validateForm(...)`. If anything is invalid, it highlights the bad field in red, flashes it, and tells you what failed.
- **How do I save user settings to disk?** Call `win.saveAppFormState()` (saves to your OS user config folder) or `win.saveValuesToFile("./my_settings.json")` (saves all form inputs to a JSON file).

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
const allValues = win.getFormValues(); // Returns { txtOrg: "Cyberdyne Systems", sldQuota: 85, ... }
const subset = win.getFormValues(["txtOrg", "sldQuota"]); // Read only specific control IDs
win.setAll({ txtOrg: "Globex", sldQuota: 60 }); // Fill multiple controls at once
win.resetForm({ txtOrg: "Acme Corp", sldQuota: 50 }); // Reset form back to default values
win.disableControls(["txtOrg", "sldQuota"]); // Grey out / lock multiple controls
win.enableControls(["txtOrg", "sldQuota"]); // Re-enable them

// 3. 1-Line Form Validation (Checks rules, shows red error border, and returns errors)
const validation = win.validateForm({
  txtOrg: { required: true, minLength: 2, label: "Organization" },
  sldQuota: { min: 10, max: 100, label: "Quota (%)" },
});
if (!validation.valid) {
  win.focus(validation.firstInvalidId!); // Jump cursor straight to the first broken field
  win.warn("Validation Error", Object.values(validation.errors).join("\n"));
}

// 4. Save & Load Settings on Disk (macOS Application Support / Linux ~/.config / Windows AppData)
win.saveAppFormState(); // Auto-save form inputs, window size & theme
win.restoreAppFormState(); // Restore saved form inputs
win.saveAppState("my_studio_app"); // Save reactive state store to OS app folder
win.loadAppState("my_studio_app"); // Load reactive state store from OS app folder
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

**Plain-English Summary:** SimpleGUI ships with **133 ready-made color themes** (including macOS Dark/Light, Tokyo Night, Catppuccin, Nord, Dracula, Windows 11, Ubuntu, Retro Win95/Mac Classic, and **12 animated GPU-style FX shader themes**). Drop `win.addThemeSelector("dd_theme", "Theme:")` into any window to give your users a live theme dropdown that automatically remembers their favorite theme!

> 📖 **Deep-Dive Reference (Optional):** [Complete Themes Catalog (`docs/THEMES.md`)](docs/THEMES.md) · [Futuristic FX Themes & Motion Layer (`docs/developer/fx-themes.md`)](docs/developer/fx-themes.md) · [SimpleGUI Visual Themes (`docs/SIMPLEGUI_API.md#visual-themes`)](docs/SIMPLEGUI_API.md#visual-themes) · [Themes & Atmospheric Shaders Tutorial (`docs/userguides/file-manager-themes-complete-tutorial.md`)](docs/userguides/file-manager-themes-complete-tutorial.md)

```typescript
// Option A (Easiest): 1-line theme selector dropdown that switches & saves themes automatically
win.addThemeSelector("dd_theme", "Theme:");

// Option B: Build your own dropdown with all 133 theme names
const themes = getThemeNames();
win
  .addDropdown(themes, "apple_dark", (w, name) => w.setTheme(String(name)))
  .width(240);
```

| Theme Category                | Popular Theme Names You Can Pass to `theme` or `win.setTheme(...)`                                                                                                                                                   |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS & Apple Pro**         | `apple_dark`, `apple_light`, `midnight`, `sonoma_emerald`, `ventura_amber`, `apple_sunset`, `titanium_slate`                                                                                                         |
| **Developer Flagships**       | `codefreelance`, `tokyo_night`, `catppuccin`, `nord`, `dracula`, `one_dark_pro`, `monokai_pro`, `jetbrains_darcula`, `github_dark`, `github_light`, `rose_pine`, `everforest`, `kanagawa`, `gruvbox_dark`, `cobalt2` |
| **Modern SaaS & Cloud**       | `linear_dark`, `raycast_dark`, `vercel_dark`, `supabase`, `tailwind_dark`, `arc_velvet`, `unreal_engine`, `oled_black`                                                                                               |
| **Windows 11 & Linux**        | `win11_slate`, `win11_light`, `ubuntu_dark`, `ubuntu_light`, `adwaita_dark`, `adwaita_light`, `pop_os`, `linux_mint`, `fedora_dark`                                                                                  |
| **12 Futuristic FX Themes**   | `cyberpunk_hologram`, `neon_hud`, `quantum_obsidian`, `deep_space`, `liquid_metal`, `titanium_aurora`, `liquid_metal_light`, `neo_tokyo_dark`, `synthetic_solar`, `neo_tokyo_day`, `aurora_glass`, `plasma_violet`   |
| **Retro & Vintage Computing** | `win95`, `mac_classic`, `mac_os_aqua`, `nextstep`, `amiga`, `c64`, `gameboy`, `amber_crt`, `matrix`, `synthwave`, `playstation`                                                                                      |

---

<a id="3-part-2-step-by-step-simplecli-console--backend-cheat-sheet"></a>

## 3. ⌨️ Part 2: Step-by-Step SimpleCLI Console & Backend Cheat Sheet

### How SimpleCLI Works in 30 Seconds (The 4 Golden Rules)

When you want to build a **terminal tool, build script, DevOps runner, or backend service** (without opening a GUI window), use `SimpleCLI`:

1. **Create the CLI app:** `const app = newApp("tool-name", "1.0.0")`.
2. **Add command-line flags:** Chain `.addFlagString("env", "e", "staging", "Help text")`, `.addFlagInt(...)`, or `.addFlagBool(...)`. This automatically gives your tool `-e` / `--env`, `--help`, `--version`, and typo suggestions!
3. **Parse the arguments:** Call `if (!app.parseCli()) process.exit(0);` (or `app.parseArgs(argv)` in unit tests). Then read values with `app.getFlagString("env")`.
4. **Use built-in terminal UI & system helpers:** Print tables (`app.table`), ask interactive questions (`await app.select(...)`), run shell commands (`sys.execSafe(...)`), or call REST APIs (`createApiClient(...)`).

> 📖 **Deep-Dive Reference (Optional):** [SimpleCLI API Guide (`docs/CLI_API.md`)](docs/CLI_API.md) · [SimpleCLI Cheat Sheet (`docs/cheatsheets/simplecli-cheatsheet.md`)](docs/cheatsheets/simplecli-cheatsheet.md) · [System Utilities & Standard Library (`docs/SYSTEM_UTILITIES_API.md`)](docs/SYSTEM_UTILITIES_API.md)

<a id="cli-step-1-app-setup-flags-subcommands--auto-suggestions"></a>

### Step 1: App Setup, Flags, Subcommands & Auto-Suggestions

**Plain-English Summary:** Every `addFlag*` method takes **`(longName, shortAlias, defaultValue, description, allowedChoices?)`**. For example, `.addFlagString("env", "e", "staging", "Target environment", ["dev", "staging", "prod"])` lets users run `bun my_cli.ts --env prod` or `bun my_cli.ts -e prod`, and automatically rejects invalid values!

> 📖 **Deep-Dive Reference (Optional):** [Architecture & Application Lifecycle (`docs/CLI_API.md#1-architecture--application-lifecycle`)](docs/CLI_API.md#1-architecture--application-lifecycle) · [CLI Flags & Argument Parsing (`docs/CLI_API.md#2-cli-flags--argument-parsing`)](docs/CLI_API.md#2-cli-flags--argument-parsing) · [Shell Completions & Man Pages (`docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation`)](docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation)

```typescript
import { newApp, LogLevel } from "./src/simplecli";

// 1. Define your CLI app name, version, and --flags
const app = newApp("deploy-pilot", "2.1.0")
  .setAuthor("Platform Team")
  .setDescription("Zero-downtime deployment & diagnostics CLI")
  .setLogLevel(LogLevel.INFO)
  .handleErrors() // Catches unexpected errors and prints a clean red alert box instead of a raw stack trace
  // addFlagString(name, shortFlag, defaultVal, description, allowedValues?)
  .addFlagString("env", "e", "staging", "Target environment", [
    "dev",
    "staging",
    "prod",
  ])
  // addFlagInt(name, shortFlag, defaultVal, description)
  .addFlagInt("concurrency", "c", 4, "Parallel worker count")
  // addFlagBool(name, shortFlag, defaultVal, description)
  .addFlagBool("dry-run", "d", false, "Simulate without mutating state")
  // addFlagArray(name, shortFlag, defaultVal, description) — can be passed multiple times: -t v1 -t latest
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

// 3. Parse command-line arguments (automatically prints --help or --version and exits if requested)
if (!app.parseCli()) process.exit(0);

// 4. Read the parsed flag values with full TypeScript types
const env = app.getFlagString("env"); // string ("dev" | "staging" | "prod")
const workers = app.getFlagInt("concurrency"); // number (4)
const dryRun = app.getFlagBool("dry-run"); // boolean (false)
await app.run(); // Dispatches subcommands if one was matched
```

---

<a id="cli-step-2-terminal-ansi-ui-tables-sparklines-charts-trees--diffs"></a>

### Step 2: Terminal ANSI UI, Tables, Sparklines, Charts, Trees & Diffs

**Plain-English Summary:** Turn boring `console.log` output into a polished terminal dashboard. Use `app.banner(...)` for headers, `app.printKv(...)` for aligned `Key: Value` pairs, `app.table(headers, rows)` for Unicode box tables, and `app.output(objects)` when you want a table in the terminal that **automatically switches to JSON** when piped into another command like `jq`!

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

// 2. Formatted Unicode Tables (Pass column headers + array of string rows)
app.table(
  ["Service", "Version", "Latency", "Status"],
  [
    ["auth-api", "v2.1.0", "4.2 ms", app.green("HEALTHY")],
    ["search-db", "v2.0.8", "11.8 ms", app.yellow("WARMING")],
  ],
);

// 3. Smart Output: Prints a pretty table for humans, OR raw JSON when piped (`my-cli | jq`)!
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
// 1. Multi-Step Pipeline Runner (Return true for success, false or throw for failure)
const pipeline = app.newPipeline("Release Verification Pipeline");
pipeline.addStep("Check TypeScript types", async () => true);
pipeline.addStep("Verify bundle integrity", async () => {
  await app.sleep(100);
  return true;
});
const allPassed = await pipeline.run(); // Returns true if every step succeeded

// 2. High-Precision Benchmarking (Measures both milliseconds and nanoseconds)
const metric = await app.measureAsync(async () => {
  await app.sleep(25);
  return "done";
});
app.info(
  `Completed in ${metric.durationMs.toFixed(2)} ms (${metric.durationNs} ns)`,
);
```

---

<a id="cli-step-5-sys-subprocess-hardware-telemetry-network--os-helpers"></a>

### Step 5: `sys` Subprocess, Hardware Telemetry, Network & OS Helpers

**Plain-English Summary:** The `sys` object is your cross-platform OS Swiss Army knife:

- **Run commands:** `sys.execSafe(["git", "status"])` (safest, no shell) or `sys.execOr("git branch --show-current", "main")`.
- **Check hardware:** `sys.cpuCount()`, `sys.ramPercent()`, `sys.diskStats("/")`.
- **Wait for servers/databases to boot:** `await sys.waitForPort("127.0.0.1", 5432, 5000)` or `await sys.waitForHttp("http://localhost:3000/health", 5000)`.
- **Interact with the desktop OS:** `sys.notify("Title", "Message")`, `sys.clipboardCopy("text")`, `await sys.writeJson("~/out.json", data)`.

> 📖 **Deep-Dive Reference (Optional):** [Safe Process Execution (`docs/CLI_API.md#9-safe-process-execution--subprocess-control`)](docs/CLI_API.md#9-safe-process-execution--subprocess-control) · [Hardware Telemetry (`#10-hardware-telemetry--resource-probing`)](docs/CLI_API.md#10-hardware-telemetry--resource-probing) · [OS Directories & File System (`#11-standard-os-directory-resolution--file-system`)](docs/CLI_API.md#11-standard-os-directory-resolution--file-system) · [Network & Port Diagnostics (`#12-network-wi-fi--tcp-port-diagnostics`)](docs/CLI_API.md#12-network-wi-fi--tcp-port-diagnostics) · [Notifications, Speech & Clipboard (`#13-desktop-notifications-speech--audio-utilities`)](docs/CLI_API.md#13-desktop-notifications-speech--audio-utilities)

```typescript
import { sys } from "./src/simplecli";

// 1. Run Terminal Commands Safely
const [stdout, exitCode] = sys.exec("git status --short"); // Returns [outputText, exitCode]
const branch = sys.execOr("git rev-parse --abbrev-ref HEAD", "main"); // Returns fallback "main" if command fails
const safe = await sys.execSafe(["git", "log", "-n", "1"], { timeoutMs: 3000 }); // Argument array (no shell injection!)
const timed = await sys.execTimeout("bun --version", 3000); // Kills command if it takes > 3 seconds
const retried = await sys.execRetry("curl -sf https://example.com", 3, 400); // Retries up to 3 times
const parallel = await sys.execParallel(["echo a", "echo b", "echo c"], 2); // Runs 2 commands at a time

// 2. Inspect CPU, RAM, Disk & Battery
const info = {
  cpu: `${sys.cpuModel()} (${sys.cpuCount()} cores)`,
  load: sys.cpuLoad(), // [1min, 5min, 15min] load averages
  ramPct: sys.ramPercent(), // RAM used %, e.g. 62.4
  disk: sys.diskStats("/"), // { total, used, available, percent }
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
```

---

<a id="cli-step-6-apiclient-rest-crud-safe-try-calls--namespaced-redis"></a>

### Step 6: `ApiClient` REST CRUD, Safe `try*` Calls & Namespaced Redis

**Plain-English Summary:** Calling external HTTP APIs with raw `fetch()` requires writing boilerplate for timeouts, retries, auth headers, and `try/catch` blocks. `createApiClient(baseUrl)` handles all of that automatically:

- **Use `api.tryGet` / `api.tryPost`:** Instead of throwing exceptions on network errors or 500 responses, it returns `{ ok, statusCode, data, error }` so you can handle errors cleanly with `if (res.ok)`.
- **Use `api.resource<T>("/users")`:** Gives you `.list()`, `.get(id)`, `.create(body)`, `.patch(id, body)`, and `.remove(id)` automatically.
- **Use `app.redis("prefix", { fallbackToMemory: true })`:** Connects to Redis if available, or seamlessly falls back to an in-memory Map during local development so your app works offline!

> 📖 **Deep-Dive Reference (Optional):** [HTTP Client, Micro Server & REST APIs (`docs/CLI_API.md#15-http-client-micro-server--rest-apis`)](docs/CLI_API.md#15-http-client-micro-server--rest-apis) · [Non-Throwing `try*` Calls (`#unwrapped-data-fallbacks--non-throwing-try-calls`)](docs/CLI_API.md#unwrapped-data-fallbacks--non-throwing-try-calls) · [CRUD Resource Client (`#zero-boilerplate-crud-resource-client-apiresource`)](docs/CLI_API.md#zero-boilerplate-crud-resource-client-apiresource) · [Reactive State & Namespaced Redis (`#8-reactive-state-store-config--namespaced-redis`)](docs/CLI_API.md#8-reactive-state-store-config--namespaced-redis)

```typescript
import { createApiClient } from "./src/simplecli";

// 1. Configure an HTTP Client with Bearer token, 8s timeout, 3 automatic retries, and a 30s response cache
const api = createApiClient("https://api.example.com/v1")
  .withBearer("my-api-key")
  .setTimeout(8000)
  .setRetries(3, 200)
  .enableCache(30_000, 128)
  .setRateLimit(50, 1000);

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

// 4. Namespaced Redis Cache (Automatically falls back to in-memory cache if Redis isn't running!)
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

<a id="domain-1-file-sqlite-wal--fts5-toml-archives--state-8-modules"></a>

### Domain 1: File, SQLite (WAL + FTS5), TOML, Archives & State (8 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 1 Overview (`src/features/rad/README.md#1-file--storage-8-modules`)](src/features/rad/README.md#1-file--storage-8-modules) · [Databases Guide (`docs/databases/complete-databases-guide.md`)](docs/databases/complete-databases-guide.md)

| Module                                                            | What It Does (Plain English)                                                                                                        | Most Common Functions & Copy-Paste Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| :---------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`fileutils`**](src/features/rad/README.md#1-fileutils)         | Read & write JSON, JSONL, CSV, and text files safely (atomic writes prevent corrupted files on crash).                              | `await rad.fileutils.saveJson("cfg.json", { port: 8080 })`<br>`const cfg = await rad.fileutils.loadJson("cfg.json", { port: 3000 })`<br>`await rad.fileutils.writeCsvObjects("users.csv", rows)`<br>`await rad.fileutils.walkFiles("./src", (p) => p.endsWith(".ts"))`                                                                                                                                                                                                                                                                             |
| [**`sqliteutils`**](src/features/rad/README.md#2-sqliteutils)     | Zero-setup SQLite database (`:memory:` or file) with 1-line helpers for tables, Key-Value storage, JSON documents, and FTS5 search. | **Open DB:** `const db = rad.sqliteutils.openDb("app.sqlite")`<br>**CRUD:** `insertRow(db, "tasks", row)` · `insertMany(db, "tasks", rows)` · `selectRows(db, "tasks", "status = ?", ["Done"])` · `updateRows(db, "tasks", { status: "Done" }, "id = ?", [1])` · `deleteRows(db, "tasks", "id = ?", [1])`<br>**Key-Value:** `createKvTable(db, "kv")` · `setKv(db, "kv", "theme", "nord")` · `getKvOr(db, "kv", "theme", "dark")`<br>**Full-Text Search:** `createFtsTable(db, "fts", ["title", "body"])` · `searchFtsRanked(db, "fts", "sqlite")` |
| [**`tomlutils`**](src/features/rad/README.md#3-tomlutils)         | Parse, edit, and merge `.toml` configuration files with dot-path getters (`"server.port"`).                                         | `const doc = rad.tomlutils.parseToml(tomlStr)`<br>`const port = rad.tomlutils.getInt(doc, "server.port", 3000)`<br>`rad.tomlutils.setTomlPath(doc, "server.tls.enabled", true)`                                                                                                                                                                                                                                                                                                                                                                    |
| [**`archiveutils`**](src/features/rad/README.md#4-archiveutils)   | Create and extract `.zip` archives in memory or on disk (with automatic zip-slip security checks).                                  | `const zipBytes = rad.archiveutils.zipFiles([{ name: "a.txt", data: "hi" }])`<br>`await rad.archiveutils.zipDir("./src", "./src.zip")`<br>`await rad.archiveutils.unzipToDir("./src.zip", "./out")`                                                                                                                                                                                                                                                                                                                                                |
| [**`compressutils`**](src/features/rad/README.md#5-compressutils) | Compress and decompress strings or bytes using Gzip, Brotli, Zstd, or Deflate.                                                      | `const b64 = rad.compressutils.gzipCompressString("large text")`<br>`const text = rad.compressutils.gzipDecompressString(b64)`<br>`rad.compressutils.compress(bytes, "zstd")`                                                                                                                                                                                                                                                                                                                                                                      |
| [**`tarutils`**](src/features/rad/README.md#6-tarutils)           | Pack and unpack `.tar` and `.tar.gz` archives.                                                                                      | `const tar = rad.tarutils.packTarBytes([{ name: "log.txt", data: "ok" }])`<br>`const files = rad.tarutils.unpackTarBytes(tar)`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [**`stateutils`**](src/features/rad/README.md#7-stateutils)       | Reactive state container that notifies subscribers whenever state changes.                                                          | `const store = new rad.stateutils.AppStateStore("my_app", { count: 0 })`<br>`store.update((s) => ({ count: s.count + 1 }))`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [**`cacheutils`**](src/features/rad/README.md#8-cacheutils)       | Fast in-memory caches that automatically evict old items (`LRUCache`) or expired items (`TTLCache`).                                | `const lru = new rad.cacheutils.LRUCache<string, any>(256)`<br>`const ttl = new rad.cacheutils.TTLCache<string, any>(60_000)`                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
  "role = ?",
  ["Admin"],
);
rad.sqliteutils.updateRows(db, "users", { role: "Principal" }, "name = ?", [
  "Alan Turing",
]);
console.log("Total users:", rad.sqliteutils.countRows(db, "users")); // 2
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
| [**`diffutils`**](src/features/rad/README.md#21-diffutils)         | Compare two strings line-by-line and generate Git-style unified or colored diffs.                     | `rad.diffutils.unifiedDiff(oldText, newText, "old", "new", 3)` · `renderColoredDiff(oldText, newText)`                                                                                                |

<a id="domain-4-system-cli-env-bun-shell-glob-transpiler-cron--semver-9-modules"></a>

### Domain 4: System, CLI, Env, Bun Shell, Glob, Transpiler, Cron & SemVer (9 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 4 Overview (`src/features/rad/README.md#4-system-cli--shell-runtime-9-modules`)](src/features/rad/README.md#4-system-cli--shell-runtime-9-modules)

| Module                                                               | What It Does (Plain English)                                                                           | Most Common Functions & Copy-Paste Examples                                                                                   |
| :------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| [**`sysutils`**](src/features/rad/README.md#22-sysutils)             | Get OS/CPU/RAM info, user home/temp folders, clipboard access, and safe command execution.             | `rad.sysutils.getSystemInfo()` · `getHomeDir()` · `getTempDir()` · `await execSafe(["bun", "--version"])`                     |
| [**`cliutils`**](src/features/rad/README.md#23-cliutils)             | Return formatted strings for sparklines, progress bars, bar charts, gauges, and ASCII tables.          | `rad.cliutils.renderSparkline([1, 4, 8, 3, 9])` (`"▁▄▇▃█"`) · `formatProgressBar(45, 100, 30)` · `formatTable(headers, rows)` |
| [**`envutils`**](src/features/rad/README.md#24-envutils)             | Read environment variables as typed numbers/booleans with defaults, or parse `.env` files.             | `rad.envutils.getInt("PORT", 3000)` · `getBool("DEBUG", false)` · `requireEnv("API_URL")` · `loadEnv(".env")`                 |
| [**`shellutils`**](src/features/rad/README.md#25-shellutils)         | Run shell commands via native `Bun.$`, check if a program is installed (`whichCmd`), or pipe commands. | `rad.shellutils.whichCmd("git")` · `await rad.shellutils.execCmd("ls -la")` · `escapeArg(untrustedStr)`                       |
| [**`globutils`**](src/features/rad/README.md#26-globutils)           | Ultra-fast file finding and wildcard matching powered by native `Bun.Glob`.                            | `await rad.globutils.findFiles("**/*.ts", "./src")` · `rad.globutils.globMatch("src/*.ts", "src/index.ts")`                   |
| [**`transpileutils`**](src/features/rad/README.md#27-transpileutils) | Strip TypeScript types to plain JS or inspect `import`/`export` statements via `Bun.Transpiler`.       | `rad.transpileutils.stripTypes("const x: number = 1;")` · `rad.transpileutils.analyzeCode(tsCode)`                            |
| [**`logutils`**](src/features/rad/README.md#28-logutils)             | Lightweight logger with prefixes, timestamps, and log levels (`DEBUG`, `INFO`, `WARN`, `ERROR`).       | `const log = rad.logutils.newLogger({ prefix: "api" }); log.info("Server ready", { port: 3000 })`                             |
| [**`cronutils`**](src/features/rad/README.md#29-cronutils)           | Parse cron schedules (`"*/5 * * * *"`), find the next run time, or translate cron to plain English.    | `rad.cronutils.cronToHuman("*/10 * * * *")` (`"Every 10 minutes"`) · `nextCronRun("0 9 * * 1-5")`                             |
| [**`semverutils`**](src/features/rad/README.md#30-semverutils)       | Parse, compare, sort, and bump semantic version numbers (`"1.5.3"` -> `"1.6.0"`).                      | `rad.semverutils.satisfiesRange("2.4.1", "^2.0.0")` (`true`) · `bumpVersion("1.5.3", "minor")` (`"1.6.0"`)                    |

<a id="domain-5-network-http-bunserve-router-url-jwt-crypto--bunhash-7-modules"></a>

### Domain 5: Network, HTTP, `Bun.serve` Router, URL, JWT, Crypto & `Bun.hash` (7 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 5 Overview (`src/features/rad/README.md#5-network-web--cryptography-7-modules`)](src/features/rad/README.md#5-network-web--cryptography-7-modules) · [Security Guide (`docs/security.md`)](docs/security.md)

| Module                                                         | What It Does (Plain English)                                                                           | Most Common Functions & Copy-Paste Examples                                                                                                           |
| :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`netutils`**](src/features/rad/README.md#31-netutils)       | Get local/public IP addresses, ping TCP ports, resolve DNS hostnames, and check internet connectivity. | `rad.netutils.getLocalIp()` · `await rad.netutils.tcpPing("127.0.0.1", 5432)` · `await rad.netutils.isOnline()`                                       |
| [**`httputils`**](src/features/rad/README.md#32-httputils)     | One-line JSON/text `fetch` helpers with automatic retries and query string builders.                   | `await rad.httputils.getJson("https://api.example.com/items")` · `await rad.httputils.postJson(url, body)` · `buildQuery({ q: "bun" })`               |
| [**`serverutils`**](src/features/rad/README.md#33-serverutils) | Build HTTP servers, REST routers, static file servers, and WebSocket hubs on native `Bun.serve`.       | `const r = rad.serverutils.createRouter(); r.get("/health", () => Response.json({ ok: true })); rad.serverutils.serveHttp({ port: 3000, router: r })` |
| [**`urlutils`**](src/features/rad/README.md#34-urlutils)       | Safely join URL paths without double slashes, edit query params, and hide passwords in DB URLs.        | `rad.urlutils.joinUrl("https://api.io/v1/", "/users/", "42")` · `redactCredentials("postgres://u:secret@host/db")`                                    |
| [**`jwtutils`**](src/features/rad/README.md#35-jwtutils)       | Sign and verify JSON Web Tokens (HS256) with expiration timestamps.                                    | `const token = rad.jwtutils.signJwt({ userId: 1 }, secret, 3600)` · `rad.jwtutils.verifyJwt(token, secret)`                                           |
| [**`cryptoutils`**](src/features/rad/README.md#36-cryptoutils) | SHA-256/HMAC hashing, UUID v4/v7 generation, random tokens, and Argon2/bcrypt password hashing.        | `rad.cryptoutils.uuidV4()` · `sha256("data")` · `randomToken(32)` · `await hashPassword(pw)` / `await verifyPassword(pw, hash)`                       |
| [**`hashutils`**](src/features/rad/README.md#37-hashutils)     | Ultra-fast non-cryptographic hashes (`wyhash`, `crc32`) and memory-efficient `BloomFilter` sets.       | `rad.hashutils.wyhash("cache-key")` · `crc32("data")` · `const bf = rad.hashutils.createBloomFilter(1000, 0.01)`                                      |

<a id="domain-6-async-concurrency-flow-resilience-functional-events-validation-mock--time-7-modules"></a>

### Domain 6: Async Concurrency, Flow Resilience, Functional, Events, Validation, Mock & Time (7 Modules)

> 📖 **Deep-Dive Reference (Optional):** [Domain 6 Overview (`src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules`)](src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules)

| Module                                                       | What It Does (Plain English)                                                                                 | Most Common Functions & Copy-Paste Examples                                                                                             |
| :----------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| [**`asyncutils`**](src/features/rad/README.md#38-asyncutils) | Run async functions over an array with a max concurrency limit (`parallelMap`), or add timeouts to promises. | `await rad.asyncutils.parallelMap(urls, 4, async (u) => fetch(u))` · `await timeoutPromise(work(), 2000)`                               |
| [**`flowutils`**](src/features/rad/README.md#39-flowutils)   | Protect apps from overload: `RateLimiter`, `CircuitBreaker`, `retry`, `debounce`, and `throttle`.            | `await rad.flowutils.retry(fn, 3, 200)` · `debounce(fn, 150)` · `throttle(fn, 200)` · `new RateLimiter(100, 10)`                        |
| [**`fnutils`**](src/features/rad/README.md#40-fnutils)       | Function composition (`pipe`), caching function results (`memoize`), and run-once (`once`) helpers.          | `rad.fnutils.pipe(10, (x) => x * 2, (x) => x + 1)` (`21`) · `once(initFn)` · `memoize(expensiveFn)`                                     |
| [**`eventutils`**](src/features/rad/README.md#41-eventutils) | Strongly-typed pub/sub event bus (`on`, `once`, `off`, `emit`, `waitFor`).                                   | `const bus = rad.eventutils.newEmitter<{ saved: { id: string } }>()` · `bus.on("saved", (e) => ...)` · `bus.emit("saved", { id: "1" })` |
| [**`validutils`**](src/features/rad/README.md#42-validutils) | Quick boolean validators for emails, URLs, IPv4/IPv6 addresses, UUIDs, JSON strings, and numbers.            | `rad.validutils.isEmail("ada@bun.sh")` (`true`) · `isUrl(s)` · `isIpv4(s)` · `isUuid(s)` · `isJson(s)` · `inRange(n, 0, 100)`           |
| [**`mockutils`**](src/features/rad/README.md#43-mockutils)   | Generate realistic fake users, emails, phone numbers, IPs, and lorem ipsum text for prototypes/tests.        | `const fakeUsers = rad.mockutils.mockUsers(25)` · `mockEmail()` · `mockIpv4()` · `loremText(2)`                                         |
| [**`timeutils`**](src/features/rad/README.md#44-timeutils)   | Human-friendly relative dates (`"5 minutes ago"`), date math (`addDays`, `diffDays`), and stopwatches.       | `rad.timeutils.timeAgo(date)` (`"5 minutes ago"`) · `addDays(date, 7)` · `diffDays(a, b)` · `createStopwatch()`                         |

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
import { shouldTrigger } from "./src/features/watchexec/watchexecCoordinator.ts";
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

## 5. 🎨 Part 4: Visual Form Designer (IDE), Shortcuts & Single-Binary Build

> 📖 **Deep-Dive Reference (Optional):** [Visual Form Designer Guide (`docs/visual-designer/index.md`)](docs/visual-designer/index.md) · [Generated Applications (`docs/generated-applications/index.md`)](docs/generated-applications/index.md) · [Designer FormSpec API (`docs/API.md`)](docs/API.md) · [Database Workbench (`docs/databases/workbench.md`)](docs/databases/workbench.md) · [Testing & Verification (`docs/testing/index.md`)](docs/testing/index.md) · [Single-Binary Releasing (`docs/developer/releasing.md`)](docs/developer/releasing.md)

### Launching the Visual Form Designer & Workbenches

```bash
# Launch the Delphi/VB-style Visual Form Designer (101 controls, 6 code generators)
bun run start

# Launch the Application Launcher Studio (67 GUI Studios, 79 CLI Tools, 27 Demos)
bun run app:launcher
bun run cli:launcher --list

# Launch the Database Workbench (SQLite, PostgreSQL, MySQL)
bun run app:sqlite
bun run workbench
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
// 1. Register Custom Keyboard Shortcuts (normalized across macOS Cmd & Windows/Linux Ctrl)
win.onShortcut((w, combo) => {
  if (combo === "ctrl+s" || combo === "meta+s")
    w.toast("Workspace saved!", 1500, "success");
  else if (combo === "ctrl+k" || combo === "meta+k") w.focus("txtSearch");
});

// 2. Programmatic Event Triggers for Headless Unit Tests (No WebView needed!)
await win.triggerChange("txtSearch", "WAL");
await win.triggerClick("btnAddTask");
await win.triggerChange("workspaceTabs", "📊 Telemetry & Charts");
```

### Single-Binary Compilation (`bun build --compile`)

> 📖 **Learn More:** [Standalone Binary Compilation Engine (`docs/SYSTEM_UTILITIES_API.md#14-standalone-binary-compilation-engine`)](docs/SYSTEM_UTILITIES_API.md#14-standalone-binary-compilation-engine) · [CLI Single-Binary Compilation (`docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation`)](docs/CLI_API.md#21-shell-completions-man-pages--single-binary-compilation) · [Releasing & Cross-Platform Packaging (`docs/developer/releasing.md`)](docs/developer/releasing.md)

Turn any SimpleGUI desktop app or SimpleCLI script into a self-contained native executable:

```bash
# Compile a SimpleGUI desktop app into a standalone binary
bun build --compile examples/rad_tutorial/07_contacts.ts --outfile contacts-studio

# Compile a SimpleCLI tool into a standalone binary
bun build --compile cli_apps/tokei_cli.ts --outfile tokei-bun
```

---

<a id="6-part-5-pro-rad-tips-tricks--power-patterns"></a>

## 6. 💡 Part 5: Pro RAD Tips, Tricks & Power Patterns

> 📖 **Learn More:** [Developer Handbook (`docs/developer/handbook.md`)](docs/developer/handbook.md) · [Architecture Deep Dive (`docs/developer/architecture.md`)](docs/developer/architecture.md) · [Task-Oriented Index (`docs/reference/task-index.md`)](docs/reference/task-index.md) · [Troubleshooting (`docs/troubleshooting.md`)](docs/troubleshooting.md)

### SimpleGUI Desktop UI, Layout & Performance Tricks

1. **Zero-Boilerplate Multi-Tab & Sidebar Navigation (`bindViews`)**:
   Instead of writing manual `showControls` / `hideControls` loops for every tab or sidebar menu, chain `.bindViews({ "Tab A": ["card1", "tbl1"], "Tab B": ["card2"] })` right onto `win.addTabs(...)` or `win.addNavigationMenu(...)`. It automatically toggles visibility on initialization and every tab switch.
2. **Instant Live-Search Table Filtering (`filterTable` + `debounceChange`)**:
   Bind a search input directly to any table in one line: `win.addSearchInput("Search...").filterTable("tblUsers", (visible, total) => win.setText("bdgCount", `${visible}/${total}`))`. If your search queries an external API or heavy SQLite query instead, chain `.debounceChange(200, (w, q) => ...)` to prevent UI stutter on fast keystrokes.
3. **1-IPC Batch Updates for High-Frequency Dashboards (`batchUpdate` & `patchState`)**:
   When a timer or background worker updates 5+ controls at once (charts, sparklines, gauges, badges, table rows), wrap them in `win.batchUpdate((w) => { ... })` or call `win.patchState({ ... })`. SimpleGUI coalesces all mutations into a single WebView IPC evaluation frame.
4. **Prevent Double-Clicks on Long Async Operations (`withBusyState`)**:
   Wrap network fetches, database migrations, or CLI subprocesses inside `await win.withBusyState(["btnRun", "btnExport"], "⏳ Processing...", async (ctx) => { ... })`. It automatically disables the buttons, updates the status bar, and restores UI interactivity in a `finally` block—even if an exception is thrown.
5. **Declarative Form Validation with Auto-Focus (`validateForm`)**:
   Skip repetitive `if (!w.getText(...))` checks. Call `const res = win.validateForm({ txtEmail: { required: true, email: true, label: "Email" }, txtPort: { min: 1, max: 65535 } })`. When invalid, `res.firstInvalidId` gives you the exact control ID to pass to `win.focus(res.firstInvalidId!)`.
6. **Table Export & Object Hydration (`getTableObjects` / `exportTableCsv` / `exportTableJson`)**:
   Convert any `addTable` into typed row objects keyed by header names with `win.getTableObjects("tblUsers")`, or export directly to disk/clipboard with `win.exportTableCsv("tblUsers")` and `win.exportTableJson("tblUsers")`.
7. **Auto-Persist Form Inputs & Theme Across Restarts (`enableAutoSave`)**:
   Call `win.enableAutoSave("~/.config/my_app_session.json")` during window setup. Every form input and theme change is persisted automatically on window close and restored on next launch.

```typescript
// Power Pattern: Debounced SQLite Search + Batch Telemetry + Form Validation
win
  .addSearchInput("Search logs...")
  .id("txtLogQuery")
  .debounceChange(180, (w, query) => {
    const rows = rad.sqliteutils.queryAll<any>(
      db,
      "SELECT id, level, msg FROM logs WHERE msg LIKE ?",
      [`%${query}%`],
    );
    w.batchUpdate((ctx) => {
      ctx.setTableRows(
        "tblLogs",
        rows.map((r) => [String(r.id), r.level, r.msg]),
      );
      ctx.setText("bdgCount", `${rows.length} matches`);
    });
  });
```

### SimpleCLI Terminal, Piping & Backend Tricks

1. **Dual-Mode Interactive / CI-Friendly CLI Apps (`isTty` + `--json`)**:
   Always pair interactive prompts or tables with non-interactive flags. Check `app.isTty()` or `app.getFlagBool("json")`: when piped in CI (`my-cli --json | jq`), call `app.printJson(data)` or `app.smartOutput(rows, headers)` which automatically outputs clean TSV/JSON when `stdout` is not a TTY.
2. **Non-Throwing Network & Subprocess Calls (`tryGetJson` / `execSafe`)**:
   Avoid deeply nested `try / catch` blocks in CLI scripts. Use `const res = await app.tryGetJson<Release>("https://...")` (check `res.ok`) and `const proc = await sys.execSafe(["git", "status", "--porcelain"])` (never invokes a shell, immune to command injection, and supports `timeoutMs`).
3. **Interactive Object Table Picker (`selectFromObjects`)**:
   Instead of manually formatting string labels and mapping indices back to objects, pass your array of objects directly to `const chosen = await app.selectFromObjects("Select deployment target:", servers, ["name", "region", "ip"])`. It renders an aligned table prompt and returns the selected `T` object.
4. **Live Progress Loop with ETA (`forEachWithProgress`)**:
   Process arrays with an automatic terminal progress bar and item counter using `await app.forEachWithProgress(files, "Compressing assets", async (file, idx) => { ... })`.
5. **Instant Shell Autocompletions & Man Pages (`enableCompletions`)**:
   Call `app.enableCompletions()` before `app.parseArgs()`. Users automatically get `--completions bash|zsh|fish|powershell` and `--man` flags with zero extra code.

### 45 `rad` Modules, SQLite & Native Bun Superpower Tricks

1. **Always Use Parameterized SQL & Transactions in `rad.sqliteutils`**:
   `rad.sqliteutils.openDb(path)` automatically enables `PRAGMA journal_mode = WAL` for concurrent reads. When inserting or updating hundreds of rows, use `rad.sqliteutils.insertMany(db, "events", rows)` or `rad.sqliteutils.withTransaction(db, () => { ... })` for **50x–100x faster** write throughput than individual inserts.
2. **Hardware-Accelerated Hashing & Globbing (`Bun.hash.wyhash` & `Bun.Glob`)**:
   Prefer `rad.hashutils.wyhash(data)` for ultra-fast non-cryptographic checksums/deduplication and `await rad.globutils.findFiles("**/*.ts", dir)` (powered by native `Bun.Glob`) instead of recursive `fs.readdir` loops.
3. **Composable Reliability (`rad.retry` + `rad.circuitbreaker` + `rad.ratelimit`)**:
   Wrap flaky external APIs with `rad.circuitbreaker.createBreaker` and `rad.retry.retryAsync(fn, { attempts: 3, delayMs: 200 })`, and protect outbound concurrency with `await rad.asyncutils.mapLimit(urls, 6, fetchUrl)`.
4. **Reuse the 10 System Utility Coordinators inside GUI & CLI Apps**:
   Never shell out to external `fd`, `tokei`, `procs`, or `doggo` binaries when building studios—import their TypeScript coordinators directly (`searchEntries`, `computeCodeStats`, `collectProcesses`, `lookupDomain`) from `src/features/<tool>/<tool>Coordinator.ts` for typed, cross-platform data structures.

### Cross-Platform Portability & Headless Unit Testing Tricks

1. **Export a Window Factory Function for Instant Headless `bun test` Verification**:
   Structure your SimpleGUI apps as `export function createMyStudio(dbPath = ":memory:"): SimpleWindow { ... }` and guard the event loop with `if (import.meta.main) createMyStudio().run();`. In `bun test`, instantiate `const win = createMyStudio(":memory:")` and drive the entire UI headlessly in milliseconds using `await win.triggerClick("btnAdd")`, `await win.triggerChange("txtSearch", "query")`, and `expect(win.getTableRows("tbl")).toHaveLength(1)`.
2. **Cross-Platform Keyboard Shortcut Normalization (`onShortcut`)**:
   When binding keyboard shortcuts in `win.onShortcut((w, combo) => ...)`, match both `ctrl+<key>` (Windows/Linux) and `meta+<key>` (macOS `Cmd`), or use standard menu accelerators.
3. **Never Hardcode `/tmp` or Path Separators**:
   Use `sys.tempDir()`, `sys.configDir("app-name")`, `sys.expandPath("~/...")`, and `rad.pathutils.joinPath(...)` so paths resolve cleanly on macOS, Linux, and Windows.

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
| **Documentation Home & Search**          | **[`docs/index.md`](docs/index.md)**                                             | [Task-Oriented Index (`docs/reference/task-index.md`)](docs/reference/task-index.md) · [Requirements (`docs/getting-started/requirements.md`)](docs/getting-started/requirements.md) · [Install & First Launch (`docs/getting-started/install-and-first-launch.md`)](docs/getting-started/install-and-first-launch.md)                                                                                                                                                                                                                                                                                |
| **Focused Cheat Sheets**                 | **[`docs/cheatsheets/index.md`](docs/cheatsheets/index.md)**                     | [SimpleGUI Cheat Sheet (`docs/cheatsheets/simplegui-cheatsheet.md`)](docs/cheatsheets/simplegui-cheatsheet.md) · [SimpleCLI Cheat Sheet (`docs/cheatsheets/simplecli-cheatsheet.md`)](docs/cheatsheets/simplecli-cheatsheet.md) · [45 `rad` Modules Cheat Sheet (`docs/cheatsheets/rad-modules-cheatsheet.md`)](docs/cheatsheets/rad-modules-cheatsheet.md)                                                                                                                                                                                                                                           |
| **SimpleGUI Desktop Framework**          | **[`docs/SIMPLEGUI_API.md`](docs/SIMPLEGUI_API.md)**                             | [Quick Start (`docs/SIMPLEGUI_API.md#quick-start`)](docs/SIMPLEGUI_API.md#quick-start) · [Controls Reference (`docs/SIMPLEGUI_API.md#controls-reference`)](docs/SIMPLEGUI_API.md#controls-reference) · [Layouts (`docs/SIMPLEGUI_API.md#layout-systems`)](docs/SIMPLEGUI_API.md#layout-systems) · [Enterprise & Rich Dialogs (`docs/SIMPLEGUI_API.md#dialogs-sweetalert2-style`)](docs/SIMPLEGUI_API.md#dialogs-sweetalert2-style)                                                                                                                                                                    |
| **SimpleCLI Terminal & Backend**         | **[`docs/CLI_API.md`](docs/CLI_API.md)**                                         | [CLI Flags (`docs/CLI_API.md#2-cli-flags--argument-parsing`)](docs/CLI_API.md#2-cli-flags--argument-parsing) · [Prompts & Wizards (`docs/CLI_API.md#4-interactive-prompts-menus--input-validation`)](docs/CLI_API.md#4-interactive-prompts-menus--input-validation) · [REST & Micro-Server (`docs/CLI_API.md#15-http-client-micro-server--rest-apis`)](docs/CLI_API.md#15-http-client-micro-server--rest-apis)                                                                                                                                                                                        |
| **45 `rad` Utility Modules**             | **[`src/features/rad/README.md`](src/features/rad/README.md)**                   | [File & Storage (`src/features/rad/README.md#1-file--storage-8-modules`)](src/features/rad/README.md#1-file--storage-8-modules) · [Collections (`src/features/rad/README.md#2-data-structures--collections-8-modules`)](src/features/rad/README.md#2-data-structures--collections-8-modules) · [Concurrency (`src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules`)](src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules)                                                                                                                                       |
| **10 System Utilities (`fd`..`doggo`)**  | **[`docs/SYSTEM_UTILITIES_API.md`](docs/SYSTEM_UTILITIES_API.md)**               | [User Guides Master Hub (`docs/userguides/README.md`)](docs/userguides/README.md) · [`fd` (`src/features/fd/README.md`)](src/features/fd/README.md) · [`tokei` (`src/features/tokei/README.md`)](src/features/tokei/README.md) · [`procs` (`src/features/procs/README.md`)](src/features/procs/README.md)                                                                                                                                                                                                                                                                                             |
| **Databases (SQLite, PG, MySQL, Redis)** | **[`docs/databases/index.md`](docs/databases/index.md)**                         | [Complete Databases Guide (`docs/databases/complete-databases-guide.md`)](docs/databases/complete-databases-guide.md) · [Database Workbench (`docs/databases/workbench.md`)](docs/databases/workbench.md) · [SQLite Studio (`docs/userguides/01_sqlite_studio.md`)](docs/userguides/01_sqlite_studio.md) · [Postgres Studio (`docs/userguides/42_postgres_studio.md`)](docs/userguides/42_postgres_studio.md) · [MySQL Studio (`docs/userguides/41_mysql_studio.md`)](docs/userguides/41_mysql_studio.md) · [Redis Studio (`docs/userguides/40_redis_studio.md`)](docs/userguides/40_redis_studio.md) |
| **Visual Form Designer & `FormSpec`**    | **[`docs/visual-designer/index.md`](docs/visual-designer/index.md)**             | [FormSpec & Runtime API (`docs/API.md`)](docs/API.md) · [Generated Applications (`docs/generated-applications/index.md`)](docs/generated-applications/index.md) · [Declarative Module (`docs/API.md#10-simplegui-declarative-module-reference`)](docs/API.md#10-simplegui-declarative-module-reference)                                                                                                                                                                                                                                                                                               |
| **133 Themes & 12 FX Shaders**           | **[`docs/THEMES.md`](docs/THEMES.md)**                                           | [Futuristic FX Shaders (`docs/developer/fx-themes.md`)](docs/developer/fx-themes.md) · [Universal Theme Persistence (`docs/SIMPLEGUI_API.md#universal-theme-persistence`)](docs/SIMPLEGUI_API.md#universal-theme-persistence)                                                                                                                                                                                                                                                                                                                                                                         |
| **Built-In Studios, Scripts & Guides**   | **[`docs/reference/application-index.md`](docs/reference/application-index.md)** | [Script Index (`docs/reference/script-index.md`)](docs/reference/script-index.md) · [Launcher Studio (`docs/userguides/00_launcher_studio.md`)](docs/userguides/00_launcher_studio.md) · [AI & Enhancements Tutorial (`docs/AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL.md`)](docs/AI_AND_ENHANCEMENTS_COMPLETE_TUTORIAL.md)                                                                                                                                                                                                                                                                                |
| **Architecture, Testing & Packaging**    | **[`docs/developer/handbook.md`](docs/developer/handbook.md)**                   | [Architecture (`docs/developer/architecture.md`)](docs/developer/architecture.md) · [Testing Guide (`docs/testing/index.md`)](docs/testing/index.md) · [Releasing Binaries (`docs/developer/releasing.md`)](docs/developer/releasing.md) · [Security (`docs/security.md`)](docs/security.md) · [Troubleshooting (`docs/troubleshooting.md`)](docs/troubleshooting.md)                                                                                                                                                                                                                                 |
