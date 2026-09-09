# 🎨 SimpleGUI Beginner-Friendly API Guide & Reference

Welcome to **SimpleGUI**! SimpleGUI is a lightweight, fluent, and beginner-friendly toolkit for building modern desktop applications in TypeScript and Bun. Designed with zero-boilerplate ergonomics, SimpleGUI lets you build responsive, beautifully styled cross-platform desktop interfaces in minutes.

---

<a id="table-of-contents"></a>
## 📑 Table of Contents

1. [🐣 5-Minute Quick Start](#quick-start)
2. [🧠 SimpleGUI Architecture & Mental Model](#architecture-concepts)
3. [🪟 1. Window Creation & Configuration](#window-creation)
   - [Window Options Table](#window-options-table)
   - [Window State Methods](#window-state-methods)
4. [📐 2. Layout & Container Systems](#layout-systems)
   - [Vertical Stack](#layout-vertical)
   - [Horizontal Row (`beginRow`)](#layout-row)
   - [Multi-Column Grid (`beginGrid`)](#layout-grid)
   - [Container Card (`beginCard`)](#layout-card)
   - [Absolute Placement (`at` / `pos`)](#layout-absolute)
5. [🔗 3. Fluent Method Chaining & Styling (`SimpleControlRef`)](#method-chaining)
   - [Fluent Methods Reference Table](#fluent-methods-table)
6. [🎛️ 4. Standard Controls Reference](#controls-reference)
7. [📝 5. Compound Labeled Form Field Builders](#compound-form-fields)
8. [📊 6. Modern Desktop & Analytics Dashboard Controls](#dashboard-controls)
9. [📋 7. Form State, Serialization & Bulk Operations](#form-state-serialization)
   - [Form Values & Clearing](#form-values-clearing)
   - [Typed Accessors (`getText`, `getBool`, `getInt`, `getFloat`)](#typed-accessors)
   - [Batch Operations (`enableControls`, `setAll`, `getAll`)](#batch-operations)
   - [File Persistence (`saveValuesToFile`, `loadValuesFromFile`)](#file-persistence)
   - [Reactive State Store & Key-Value Management](#reactive-state-store)
   - [App State Persistence & Standard OS User Directories](#app-state-persistence)
   - [Universal Theme Persistence & Form State Auto-Persistence](#universal-theme-persistence)
   - [Two-Way Data & Event Binding (`bind`)](#data-event-binding)
10. [💬 8. In-Window Dialogs, Alerts & Prompts](#dialogs-alerts)
11. [⏱️ 9. Async Workflows, Busy States & Timers](#async-busy-timers)
    - [Async Busy State (`withBusyState`)](#async-busy-state)
    - [Timers (`addTimer` / `removeTimer`)](#timers-api)
12. [📂 10. System Directories & Clipboard Utilities](#system-utilities)
13. [🎨 11. Built-in Visual Themes (17 Themes)](#visual-themes)
14. [📘 12. TypeScript Types & Interfaces Reference](#types-interfaces)
15. [💡 13. Beginner's "How Do I...?" Cheat Sheet](#cheat-sheet)
16. [⚠️ 14. Troubleshooting & Common Pitfalls](#troubleshooting)
17. [🚀 15. Complete Production Studio Application](#production-app)
18. [🌟 16. Related RAD & GUI Ecosystem Projects](#related-projects)

---

<a id="quick-start"></a>
## 1. 🐣 5-Minute Quick Start

Creating your first desktop window with SimpleGUI requires only a few lines of clean TypeScript code:

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Create a window (Title, Width, Height)
const win = simplegui.createWindow("My First Desktop App", 760, 520, {
    theme: "apple_dark" // Pick a sleek dark theme
});

// 2. Add a welcoming title header
win.addLabel("⚡ Welcome to SimpleGUI!").font(22, "#38bdf8", "700");

// 3. Arrange controls inside a visual card box
win.beginCard("User Authentication");
  win.beginRow();
    win.addLabel("Username:").width(90);
    win.addTextInput("Type your username...").id("txtUser").width(240);
  win.endRow();

  win.beginRow();
    win.addLabel("Password:").width(90);
    win.addPasswordInput("••••••••").id("txtPass").width(240);
  win.endRow();
win.endCard();

// 4. Add an interactive button with an event handler
win.addButton("🚀 Login", (w) => {
    const username = w.getText("txtUser") || "Friend";
    w.info("Welcome!", `Hello ${username}, you are logged in!`);
}).bg("#0284c7").color("#ffffff").bold().width(140).height(38);

// 5. Launch application event loop
win.run();
```

> [!TIP]
> **How to run:** Save the code above as `app.ts` and run it from your terminal:
> ```bash
> bun run app.ts
> ```

[⬆️ Back to Top](#table-of-contents)

---

<a id="architecture-concepts"></a>
## 2. 🧠 SimpleGUI Architecture & Mental Model

SimpleGUI uses an intuitive mental model to construct desktop application interfaces:

```
┌────────────────────────────────────────────────────────┐
│ 🪟 SimpleWindow (Desktop Canvas Window)                │
│  ├─ 📐 Layout Systems (Rows, Grids, Cards, Containers) │
│  ├─ 🎛️ Controls (Buttons, Inputs, Tables, Charts)      │
│  ├─ 🔗 Fluent Chaining (.width(), .bg(), .id(), etc.)   │
│  └─ ⚡ Event Handlers & Data Accessors                 │
└────────────────────────────────────────────────────────┘
```

1. **The Window (`SimpleWindow`)**: Represents the native desktop window canvas powered by Bun's native webview engine.
2. **Layout Containers (`beginRow`, `beginCard`, `beginGrid`)**: Automatic coordinate generators that group and position controls without manual X/Y calculations.
3. **Control Identifiers (`.id("myInput")`)**: Unique string keys used to inspect, modify, or serialize state across your application.
4. **Fluent Builder Pipeline (`SimpleControlRef`)**: Method chaining interface for inline configuration of layout, typography, colors, tooltips, visibility, and event listeners.

[⬆️ Back to Top](#table-of-contents)

---

<a id="window-creation"></a>
## 3. 🪟 1. Window Creation & Configuration

Instantiate windows using `createWindow`, `newWindow`, or `simplegui.createWindow`.

```typescript
import { createWindow } from "bun_rad_studio";

// Minimal initialization
const win = createWindow("My App Title", 800, 600);

// Custom initialization options
const customWin = createWindow("Developer Studio", 920, 680, {
    theme: "apple_dark",     // Visual color scheme (17 built-in options)
    padding: 24,             // Window edge margin (pixels)
    spacing: 14,             // Vertical gap between controls (pixels)
    alwaysOnTop: true        // Floats window over other desktop applications
});
```

<a id="window-options-table"></a>
### `SimpleWindowOptions` Specification

| Option Name | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `"SimpleGUI Application"` | Caption displayed in window title bar |
| `width` | `number` | `800` | Window canvas width in pixels |
| `height` | `number` | `600` | Window canvas height in pixels |
| `theme` | `string` | `"apple_dark"` | Active visual color palette key |
| `padding` | `number` | `20` | Canvas outer edge margin padding |
| `spacing` | `number` | `12` | Vertical gap between stacked components |
| `alwaysOnTop` | `boolean` | `false` | Floating window pin mode |
| `background_color` | `string` | *(Theme default)* | Custom background HEX color |
| `font_color` | `string` | *(Theme default)* | Custom text HEX color |

<a id="window-state-methods"></a>
### Window State Methods

```typescript
// Change active theme dynamically at runtime
win.setTheme("catppuccin");

// Toggle native always-on-top window level
win.setAlwaysOnTop(true);

// Toggle full-screen mode
win.toggleFullscreen();

// Close application window cleanly
win.quit();
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="layout-systems"></a>
## 4. 📐 2. Layout & Container Systems

SimpleGUI provides 5 automatic layout positioning choices:

<a id="layout-vertical"></a>
### 1. Default Vertical Stack
Controls placed outside container rows/grids stack top-to-bottom automatically.

```typescript
win.addLabel("Section Title");
win.addTextInput("Type input here...");
```

<a id="layout-row"></a>
### 2. Side-by-Side Horizontal Row (`beginRow` / `endRow`)
Positions controls next to each other on a single horizontal line.

```typescript
win.beginRow();
  win.addLabel("Search:").width(60);
  win.addSearchInput("Type keywords...").id("txtSearch").width(260);
  win.addButton("🔍 Go", (w) => console.log(w.getText("txtSearch")));
win.endRow(); // Always balance with endRow()
```

<a id="layout-grid"></a>
### 3. Multi-Column Grid (`beginGrid` / `endGrid`)
Automatically arranges controls into equal-width columns.

```typescript
// 3 columns with 16px gap
win.beginGrid(3, 16);
  win.addTextInput("First Name").id("txtFirst");
  win.addTextInput("Middle Name").id("txtMid");
  win.addTextInput("Last Name").id("txtLast");
  // Wrapping control automatically starts Row 2, Column 1:
  win.addSwitch("Active Account", true).id("swtActive");
win.endGrid();
```

<a id="layout-card"></a>
### 4. Container Card (`beginCard` / `endCard` / `begin_card` / `end_card`)
Groups related controls inside a styled visual card box with rounded borders, an optional header title, and an optional subtitle caption.

```typescript
win.beginCard("👤 Profile Details", "Configure public-facing profile settings");
  win.addTextInput("Display Name").id("txtName");
  win.addTextInput("Email Address").id("txtEmail");
win.endCard();
```

<a id="layout-typography"></a>
### 5. Typography Helpers (`addHeading`, `addSubheading`, `addCaption`)
Streamlined header and subheader typography blocks matching modern design systems:

```typescript
win.addHeading("🚀 Mission Control", "Real-time orbital mechanics & telemetry");
win.addSubheading("System Health");
win.addCaption("Sensor updates refresh every 100ms automatically.");
```

<a id="layout-statusbar"></a>
### 6. Window Status Bar (`addStatusBar` / `setStatusBarText`)
Docked or inline status strip for instant application status feedback:

```typescript
win.addStatusBar("Status: Ready | All background workers active");

// Dynamically update status text at runtime
win.setStatusBarText("Status: Synchronizing with remote server (84%)...");
```

<a id="layout-absolute"></a>
### 7. Absolute Placement (`.at(x, y)` / `.pos(x, y)`)
Override container layout positioning for precise X/Y pixel placement.

```typescript
win.addButton("❓ Help").at(680, 18).size(90, 32);
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="method-chaining"></a>
## 5. 🔗 3. Fluent Method Chaining & Styling (`SimpleControlRef`)

Every control creation method returns a `SimpleControlRef` builder instance, allowing inline configuration:

```typescript
win.addButton("🚀 Deploy", (w) => console.log("Deploying..."))
    .id("btnDeploy")
    .size(160, 40)
    .bg("#0284c7")
    .color("#ffffff")
    .font(14, "#ffffff", "700")
    .bold()
    .tooltip("Click to trigger production deployment")
    .enabled(true);
```

<a id="fluent-methods-table"></a>
### Fluent Methods Reference Table

| Method | Signature | Description |
| --- | --- | --- |
| `.id()` | `(idStr: string) => this` | Assigns unique ID key for form operations |
| `.at()` / `.pos()` | `(x: number, y: number) => this` | Sets absolute canvas coordinate |
| `.size()` | `(width: number, height: number) => this` | Sets width and height dimensions |
| `.width()` | `(w: number) => this` | Sets control width in pixels |
| `.height()` | `(h: number) => this` | Sets control height in pixels |
| `.bg()` | `(color: string) => this` | Sets background HEX or CSS color |
| `.color()` | `(color: string) => this` | Sets foreground text color |
| `.font()` | `(size: number, color?: string, weight?: string) => this` | Configures typography settings |
| `.bold()` | `(isBold?: boolean) => this` | Sets font weight to bold (700) |
| `.italic()` | `(isItalic?: boolean) => this` | Sets font style to italic |
| `.align()` | `(alignment: "left" \| "center" \| "right") => this` | Sets inline text alignment |
| `.tooltip()` | `(hint: string) => this` | Sets hover tooltip hint text |
| `.placeholder()`| `(ph: string) => this` | Sets input placeholder text |
| `.enabled()` | `(flag?: boolean) => this` | Toggles user interaction state |
| `.visible()` | `(flag?: boolean) => this` | Toggles component visibility |
| `.show()` / `.hide()` | `() => this` | Visibility shortcuts |
| `.enable()` / `.disable()` | `() => this` | Interaction shortcuts |
| `.readOnly()` | `(flag?: boolean) => this` | Toggles text field read-only status |
| `.focus()` | `() => this` | Focuses target input element |
| `.flash()` | `() => this` | Flashes component background highlight |
| `.highlight()` | `(durationMs?: number) => this` | Highlights control for specified duration |
| `.onClick()` | `(handler: EventCallback) => this` | Binds click event listener |
| `.onChange()` | `(handler: EventCallback) => this` | Binds value change listener |
| `.onHover()` | `(handler: EventCallback) => this` | Binds mouse hover listener |
| `.onHoverExit()` | `(handler: EventCallback) => this` | Binds mouse hover exit listener |

[⬆️ Back to Top](#table-of-contents)

---

<a id="controls-reference"></a>
## 6. 🎛️ 4. Standard Controls Reference

SimpleGUI provides a full suite of standard interactive controls:

```typescript
// Labels & Headings
win.addLabel(text: string, opts?: any): SimpleControlRef;

// Buttons
win.addButton(text: string, onClick?: EventCallback, opts?: any): SimpleControlRef;

// Inputs & Text Fields
win.addTextInput(placeholder?: string, initialVal?: string, opts?: any): SimpleControlRef;
win.addPasswordInput(placeholder?: string, opts?: any): SimpleControlRef;
win.addTextArea(placeholder?: string, initialValue?: string, opts?: any): SimpleControlRef;
win.addSearchInput(placeholder?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;

// Checkboxes, Switches & Segmented Tabs
win.addCheckbox(label: string, checked?: boolean, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addSwitch(label: string, checked?: boolean, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addSegmentedControl(items: string[], selectedIndex?: number, onChange?: EventCallback, opts?: any): SimpleControlRef;

// Dropdowns & List Boxes
win.addDropdown(items: string[], selected?: string | number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addListBox(items: string[], selected?: string | number, onChange?: EventCallback, opts?: any): SimpleControlRef;

// Numbers, Sliders & Progress
win.addSlider(min?: number, max?: number, value?: number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addStepper(min?: number, max?: number, value?: number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addProgressBar(value?: number, max?: number, opts?: any): SimpleControlRef;

// Pickers & Status Badges
win.addColorWell(initialColor?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addDatePicker(initialDate?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addTimePicker(initialTime?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addBadge(text: string, type?: "info" | "success" | "warning" | "error", opts?: any): SimpleControlRef;

// Tables, Trees & Code
win.addTable(headers: string[], rows: any[][], onSelect?: EventCallback, opts?: any): SimpleControlRef;
win.addTreeView(nodes: any[], onSelect?: EventCallback, opts?: any): SimpleControlRef;
win.addCodeView(code: string, language?: string, opts?: any): SimpleControlRef;
win.addImage(src: string, width?: number, height?: number, opts?: any): SimpleControlRef;
win.addDivider(opts?: any): SimpleControlRef;
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="compound-form-fields"></a>
## 7. 📝 5. Compound Labeled Form Field Builders

Compound `addForm*` helpers eliminate boilerplate row/label wrapping when constructing form layouts:

```typescript
// Single-line text input with left label
win.addFormField("Full Name:", "txtName", "Jane Doe");

// Multi-line text area with left label
win.addFormTextarea("User Bio:", "txtBio", "TypeScript developer...");

// Masked password input with left label
win.addFormPassword("Security PIN:", "txtPin", "1234");

// Labeled slider bar
win.addFormSlider("Volume:", "sldVol", 80);

// Labeled numeric input
win.addFormNumber("Max Connections:", "numConn", 10);

// Labeled dropdown menu
win.addFormDropdown("Select Environment:", "cmbEnv", ["Dev", "Staging", "Prod"], "Dev");

// Labeled date picker
win.addFormDatePicker("Start Date:", "dtStart", "2026-08-01");

// Labeled progress bar
win.addFormProgress("Download Status:", "prgDownload", 65);

// Labeled switch toggle
win.addFormSwitch("Notifications:", "swtNotify", "Enable Email Alerts", true);

// Labeled link hyperlink
win.addFormLink("Documentation:", "lnkDocs", "Visit API Docs", "https://bun.sh");
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="dashboard-controls"></a>
## 8. 📊 6. Modern Desktop & Analytics Dashboard Controls

SimpleGUI includes rich, specialized components for developer tools, telemetry dashboards, and productivity suites:

```typescript
// Section header with title and subtitle
win.addHeading("System Performance", "Live hardware & server metrics");

// Interactive breadcrumb navigation bar
win.addBreadcrumbs("navBread", ["Home", "Settings", "Security"]);

// Keyboard shortcut capture recorder
win.addShortcutRecorder("recHotkey");

// SVG Vector Chart (line or bar)
win.addChart("crtAnalytics", "line", 140);

// Circular ring progress indicator
win.addCircularProgress("cprCpu", 78);

// Key-Value Property Grid Inspector
win.addPropertyGrid("gridProps", {
    "OS Platform": "macOS Sonoma",
    "Runtime": "Bun v1.3",
    "Memory Usage": "142 MB"
});

// Interactive Data Grid Table
win.addGridTable("tblLogs", ["Timestamp", "Level", "Message"], [
    ["12:00:01", "INFO", "Server started on port 3000"],
    ["12:00:05", "WARN", "High memory load detected"]
]);

// Developer Console Output Box
win.addConsole("conOutput", 140);

// Dial Gauge Meter
win.addGauge("ggeDisk", "Disk Usage", 64);

// Pagination Control Bar
win.addPagination("pagItems", 10, 1);

// Activity Timeline Feed
win.addActivityFeed("feedEvents", 160);
win.addActivityFeedItem("feedEvents", "10:30 AM", "User updated profile photo");

// Markdown Viewer Box
win.addMarkdownView("mdRelease", "# Release v2.0\n- Added fast SQLite engine");

// Micro Sparkline Line Graph
win.addSparkline("spkMemory", [10, 25, 40, 35, 60, 55, 80], 30);

// PIN Code Input Box
win.addPinCode("pinAuth", 4);

// Color Palette Swatch Picker
win.addColorPalette("palAccent", ["#0284c7", "#10b981", "#f59e0b", "#ef4444"], "#0284c7");
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="form-state-serialization"></a>
## 9. 📋 7. Form State, Serialization & Bulk Operations

<a id="form-values-clearing"></a>
### Form Values & Clearing

```typescript
// Returns key-value object of all form fields in the window
const formData = win.getFormValues();
console.log(formData);
// Output: { txtUser: "alex", txtPass: "secret", swtNotify: true }

// Clears all input fields across the entire window
win.clearForm();
```

<a id="typed-accessors"></a>
### Typed Accessors (`getText`, `getBool`, `getInt`, `getFloat`)

```typescript
// String Accessors
const name: string = win.getText("txtName");
win.setText("txtName", "Sarah Connor");

// Boolean Accessors
const active: boolean = win.getBool("swtActive");
win.setBool("swtActive", true);

// Number Accessors
const count: number = win.getInt("numCount");
win.setInt("numCount", 42);

const score: number = win.getFloat("numScore");
win.setFloat("numScore", 98.6);
```

<a id="batch-operations"></a>
### Batch Operations (`enableControls`, `setAll`, `getAll`)

```typescript
// Disable multiple controls at once
win.disableControls(["txtName", "txtEmail", "btnSave"]);

// Re-enable multiple controls
win.enableControls(["txtName", "txtEmail", "btnSave"]);

// Show or hide groups of controls
win.hideControls(["secretPanel1", "secretPanel2"]);
win.showControls(["secretPanel1", "secretPanel2"]);

// Batch update multiple control values
win.setAll({
    txtName: "Alex Mercer",
    txtEmail: "alex@example.com",
    cmbRole: "Developer"
});

// Retrieve specific subset of controls into an object
const subsetData = win.getAll(["txtName", "txtEmail"]);
```

<a id="file-persistence"></a>
### File Persistence (`saveValuesToFile`, `loadValuesFromFile`)

```typescript
// Save window form values to JSON file
win.saveValuesToFile("./user_settings.json");

// Restore window form values from JSON file
win.loadValuesFromFile("./user_settings.json");
```

<a id="reactive-state-store"></a>
### 🔄 Reactive State Store & Key-Value Management

Updating a state value automatically triggers registered reactive listeners and updates bound UI controls across the entire window:

```typescript
// Setting & Getting Reactive State
win.setState("user_role", "Administrator");
win.setStateInt("counter", 42);
win.setStateBool("dark_mode", true);
win.setStateFloat("font_scale", 1.25);

// Check if state key exists
if (win.hasState("user_role")) {
    console.log("State key registered!");
}

const role = win.getState("user_role");                    // string
const count = win.getStateInt("counter");                 // number
const isDark = win.getStateBool("dark_mode");             // boolean
const fallbackRole = win.getStateOr("role", "Guest");     // fallback if key unset
const fallbackCount = win.getStateIntOr("counter", 0);
const fallbackFlag = win.getStateBoolOr("flag", false);
const fallbackScale = win.getStateFloatOr("scale", 1.0);

win.toggleStateBool("dark_mode");        // Toggles boolean state
win.incrementStateInt("counter", 1);     // Increments integer state

// Delete state entry or clear entire state store
win.removeState("user_role");
win.clearState();
```

#### Reactive State Listeners (`onStateChange`)

```typescript
win.onStateChange("counter", (w, val) => {
    w.setText("lbl_counter_display", `Current Count: ${val}`);
    w.setText("badge_count", `Count: ${val}`);
});

win.onStateChange("dark_mode", (w, val) => {
    if (val === "true") {
        w.setTheme("nord");
    } else {
        w.setTheme("apple_light");
    }
});
```

<a id="app-state-persistence"></a>
### 💾 App State Persistence & Standard OS User Directories

SimpleGUI provides robust, crash-proof state persistence following standard operating system directory conventions for macOS (`~/Library/Application Support`), Windows (`%LOCALAPPDATA%`, `%APPDATA%`), and Linux (`$XDG_STATE_HOME`, `$XDG_CONFIG_HOME`, `~/.local/state`).

All state persistence methods write atomically using temporary files and atomic renaming, preventing corrupted state files across abrupt shutdowns.

```typescript
// 1. App-Level State Persistence in Recommended OS User Directories
// Saves state to '<app_state_dir>/state.json'
win.saveAppState("my_app");
win.saveAppStateOr("my_app"); // Returns boolean success flag

// Load state upon startup (automatically updates reactive listeners and bound controls)
if (win.hasSavedAppState("my_app")) {
    win.loadAppState("my_app");
}

// Clear persisted state
win.clearAppState("my_app");

// 2. Automatic State Persistence on Exit
win.enableAutoSaveState("my_app");

// 3. Window Session & Geometry Persistence (Dimensions, theme, fullscreen, state keys)
win.saveWindowSession("my_app");
win.restoreWindowSession("my_app"); // Restores width, height, theme, and state store

// 4. Custom Path JSON Persistence (with automatic ~ and environment variable expansion)
win.saveStateJson("~/app_state.json");
win.loadStateJson("~/app_state.json");

// 5. Standalone Atomic State Serialization (no window instance required)
import { saveStateToFile, loadStateFromFile } from "bun_rad_studio";
saveStateToFile("~/config.json", stateMap);
const loadedMap = loadStateFromFile("~/config.json");
```

<a id="universal-theme-persistence"></a>
### 🎨 Universal Theme Persistence & Form State Auto-Persistence

SimpleGUI includes an automated persistence engine that works out-of-the-box across all applications with zero extra configuration:

#### 1. Global Theme Persistence & Interactive Theme Switcher
- **Interactive Theme Selector (`addThemeSelector`)**: Easily drop a theme selector into any header or toolbar with a single call: `win.addThemeSelector("dd_theme", "Theme:")`.
- **Dynamic Runtime Theme Injection**: When the user picks a theme, SimpleGUI instantly updates `document.body.style.backgroundColor`, `document.body.style.color`, fieldsets, legends, cards, and inputs at runtime with zero page reloads!
- **Automatic Theme Loading**: Every new window created with `createWindow()` / `new_simple_window()` automatically defaults to the user's preferred saved theme (`getSavedTheme()`).
- **Immediate Theme Persistence**: Calling `win.setTheme(themeName)` automatically saves the selection to `~/.config/simplegui/theme.txt` via `saveTheme(themeName)`. When a user changes themes, that theme becomes active across all future application launches.
- **Theme Dropdown Auto-Sync**: Any dropdown named `dd_app_theme`, `dd_theme`, `dd_theme_selector`, or `theme_picker` automatically synchronizes its selected item with the active window theme upon launch.

```typescript
import { getSavedTheme, saveTheme, listThemes, getThemeKeys } from "bun_rad_studio";

// 1. One-line interactive theme selector
win.beginRow();
  win.addHeading("My Studio App");
  win.addThemeSelector("dd_theme", "Theme:"); // Automatically changes theme and persists state!
  win.addButton("btn_save", "💾 Save State", (w) => {
    w.saveAppFormState();
    w.toast("Workspace saved!");
  });
win.endRow();

// 2. Global theme helper methods
const themeKeys = getThemeKeys();    // ["codefreelance", "apple_dark", "nord", ...]
const themeNames = listThemes();     // ["CodeFreelance", "Apple Dark", "Nord", ...]
const currentTheme = getSavedTheme();// e.g. "codefreelance"
saveTheme("codefreelance");          // Persists theme preference to disk
win.restoreSavedTheme();             // Loads and applies saved theme to window
win.setTheme("codefreelance", true); // Dynamically applies colors & persists
```

#### 2. Automatic Form & Session State Persistence (`form_state.json`)
Every `SimpleWindow` has `autoSaveState: true` enabled by default:
- **On Application Startup**: Automatically calls `win.restoreAppFormState()` before the HTML content is rendered. Window geometry (width/height), active theme, reactive state keys, and user form inputs are restored before the first frame displays.
- **On Application Close (`close()`, `Cmd+Q`, `Cmd+W`, `Ctrl+Q`, `Ctrl+W`)**: Automatically calls `win.saveAppFormState()`.
- **Application Identification (`appId`)**: The state file is saved under the application's unique ID. If not explicitly set with `win.setAppId("my_id")`, `win.getAppId()` automatically derives a clean snake_case identifier from the window title (e.g. `'OmniTool Studio Pro'` -> `'omnitool_studio_pro'`).

```typescript
// Form state methods
win.saveAppFormState();         // Explicitly save form state
win.saveAppFormStateOr();       // Non-throwing boolean version
win.restoreAppFormState();      // Manually restore form state
win.clearAppFormState();        // Clear persisted form state

// App ID customization
const appId = win.getAppId();    // Cleaned title or script name
win.setAppId("custom_studio_v2");

// Opting in / out of auto-persistence
win.disableAutoSave();          // Disables auto save/restore on lifecycle
win.enableAutoSave();           // Re-enables auto save/restore
```

#### 3. Intelligent Control Filtering (`shouldPersistControl`)
To maintain a clean developer experience without stale command outputs or security leaks, SimpleGUI intelligently filters controls:

| Control Type | Examples | Persisted? | Rationale |
| :--- | :--- | :---: | :--- |
| **Directory & Paths** | `txt_workspace`, `txt_watch_dir`, `txt_target` | **Yes** | Users expect their last working directory to stay configured. |
| **Search Queries & Filters** | `txt_search`, `txt_query`, `txt_filter` | **Yes** | Keeps current work context across sessions. |
| **CLI Arguments & Flags** | `txt_flags`, `txt_args`, `txt_exec_cmd` | **Yes** | Custom flags and command invocations are preserved. |
| **Dropdown Modes & Presets** | `dd_mode`, `dd_preset`, `dd_format` | **Yes** | Selected tool modes, formats, and presets stay selected. |
| **Checkbox Options & Toggles** | `chk_case`, `chk_hidden`, `chk_recursive` | **Yes** | Feature toggles remain active across sessions. |
| **Sliders & Numeric Ranges** | `sl_depth`, `sl_rate`, `sl_volume` | **Yes** | Numeric preferences and tuners are restored. |
| **User Notes & Templates** | `txt_notes`, `txt_script`, `txt_template` | **Yes** | Content in non-log textareas is preserved. |
| **Window Geometry & Theme** | `width`, `height`, theme | **Yes** | Window size and theme palette are restored. |
| **Output Logs & Consoles** | `txt_output`, `txt_stdout`, `txt_console` | **No** | Applications start clean without stale terminal output. |
| **Sensitive Passwords** | `txt_password`, `txt_secret`, `auth_token` | **No** | Protects user security and credentials. |
| **Stateless UI Elements** | `btn_*`, `lbl_*`, headings, dividers | **No** | Visual structure is defined by application code. |

<a id="data-event-binding"></a>
### 🔗 Two-Way Data & Event Binding (`bind`)

SimpleGUI provides ergonomic binding mechanisms to connect UI controls directly to reactive state keys and handle UI events with concise method chaining:

#### 1. Two-Way Control & State Store Binding (`bindState`)
`bindState` (aliases: `bindControl`, `bindValue`) binds a UI control directly to a key in the application state store.
- When `win.setState(key, val)` is called anywhere in your app, the control value automatically updates in the UI.
- When the user edits or interacts with the control (typing text, toggling a checkbox, moving a slider), the state store key automatically updates!

```typescript
// 1. Create UI controls
win.addTextInput("Full Name", "Ada Lovelace").id("input_user");
win.addCheckbox("Enable Notifications", true).id("chk_notifications");
win.addSlider(0, 100, 75).id("slider_volume");

// 2. Bind controls to state keys (Two-Way Data Binding)
win.bindState("input_user", "username");
win.bindControl("chk_notifications", "notify_enabled");
win.bindValue("slider_volume", "audio_volume");

// Updating state anywhere in your code automatically syncs the UI control!
win.setState("username", "Alan Turing");
win.setStateBool("notify_enabled", false);

// Reading state store gets the live user input!
const user = win.getState("username");

// Fluent chaining directly on SimpleControlRef:
win.addTextInput("Job Title").id("txt_title").bindState("job_title");
```

#### 2. Fluent Event & Shortcut Binding Aliases

```typescript
// Bind click callback
win.bindClick("btn_submit", (w) => {
    w.info("Submitted", "Form processed successfully!");
});

// Bind value change callback
win.bindChange("theme_picker", (w, val) => {
    w.setTheme(val);
});

// Bind Enter key press on input field
win.bindEnter("input_search", (w) => {
    const q = w.getText("input_search");
    console.log(`Search query: ${q}`);
});

// Bind hover, double-click, and right-click
win.bindHover("card_box", () => console.log("Hovering"));
win.bindDblClick("list_item", () => console.log("Double clicked"));
win.bindRightClick("list_item", () => console.log("Context menu requested"));

// Bind keyboard shortcuts
win.bindShortcut("Escape", (w) => w.close());
win.bindShortcut("Ctrl+S", (w) => w.saveAppFormState());
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="dialogs-alerts"></a>
## 10. 💬 8. In-Window Dialogs, Alerts & Prompts

SimpleGUI provides non-blocking modal dialogs rendered directly within the window interface:

```typescript
// ℹ️ Information Popup
win.info("Saved!", "Your profile was saved successfully.");

// ⚠️ Warning Alert
win.warn("Low Storage", "Available disk space is under 5%.");

// ❌ Error Alert
win.error("Connection Failed", "Unable to connect to database server.");

// ❓ Synchronous Confirmation (Returns boolean)
if (win.ask("Are you sure you want to delete this file?", "Confirm Delete")) {
    console.log("User confirmed deletion.");
}

// 💬 In-Window Async Text Prompt Modal
const apiKey = await win.showPrompt("Please enter your API Key:", "sk-default-key", "Enter Key");
if (apiKey) {
    console.log("User entered key:", apiKey);
}
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="async-busy-timers"></a>
## 11. ⏱️ 9. Async Workflows, Busy States & Timers

<a id="async-busy-state"></a>
### Async Busy State (`withBusyState`)

Automatically disables specified controls, sets a loading message, executes async logic, and restores controls upon completion:

```typescript
win.addButton("☁️ Sync Cloud", async (w) => {
    await w.withBusyState(["btnSync", "txtUrl"], "⏳ Syncing cloud data...", async (winContext) => {
        await winContext.sleep(2000); // Simulate background work
        winContext.info("Success", "Cloud files successfully synced!");
    });
});
```

<a id="timers-api"></a>
### Timers (`addTimer` / `removeTimer`)

```typescript
// Create timer executing every 1000 milliseconds
const timer = win.addTimer(1000, (w) => {
    const timeNow = new Date().toLocaleTimeString();
    w.setText("lblClock", `⏰ Time: ${timeNow}`);
}, { id: "clockTimer" });

// Remove timer by ID
win.removeTimer("clockTimer");
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="system-utilities"></a>
## 12. 📂 10. System Directories & Clipboard Utilities

Access system environment paths and clipboard helpers:

```typescript
import { homeDir, desktopDir, downloadsDir, documentsDir, tempDir } from "bun_rad_studio";

console.log("Home:", homeDir());          // e.g. "/Users/alex"
console.log("Desktop:", desktopDir());    // e.g. "/Users/alex/Desktop"
console.log("Downloads:", downloadsDir());// e.g. "/Users/alex/Downloads"
console.log("Documents:", documentsDir());// e.g. "/Users/alex/Documents"
console.log("Temp:", tempDir());          // e.g. "/tmp"

// Copy string to system clipboard
win.copyToClipboard("Copied from SimpleGUI!");
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="visual-themes"></a>
## 13. 🎨 11. Built-in Visual Themes (18 Themes)

Dynamically switch active visual themes at runtime using `win.setTheme(themeKey)`:

| Theme Key | Theme Name | Type | Vibe / Description |
| --- | --- | --- | --- |
| `codefreelance` | CodeFreelance | 🌙 Dark | Official CodeFreelance (#050505 obsidian base, #121212 cards, #0fb36a emerald & #bd00ff purple accents - codefreelance.net) |
| `apple_dark` | Apple Dark | 🌙 Dark | Modern macOS Dark Mode canvas (Default) |
| `apple_light` | Apple Light | ☀️ Light | Clean, bright macOS Aqua light canvas |
| `midnight` | Midnight | 🌙 Dark | Deep space gray & titanium dark mode |
| `sonoma_emerald` | Sonoma Emerald | 🌙 Dark | macOS Sonoma forest green glass theme |
| `ventura_amber` | Ventura Amber | 🌙 Dark | Warm golden sunset dark hues |
| `apple_sunset` | Apple Sunset | 🌙 Dark | Cozy Mojave twilight palette |
| `catppuccin` | Catppuccin | 🌙 Dark | Soothing pastel purple & lavender dark mode |
| `nord` | Nord | 🌙 Dark | Arctic ice blue developer palette |
| `dracula` | Dracula | 🌙 Dark | High-contrast vampire purple palette |
| `cyberpunk` | Cyberpunk | 🌙 Dark | Vibrant neon pink and cyan dark theme |
| `github_dark` | GitHub Dark | 🌙 Dark | Official GitHub dark code palette |
| `github_light` | GitHub Light | ☀️ Light | Official clean GitHub light palette |
| `navy_blue` | Navy Blue | 🌙 Dark | Deep blue ocean dark palette |
| `forest_green` | Forest Green | 🌙 Dark | Natural emerald green dark palette |
| `soft_pastel` | Soft Pastel | ☀️ Light | Warm studio light canvas |
| `solarized_dark` | Solarized Dark | 🌙 Dark | Solarized dark engineering canvas |
| `solarized_light` | Solarized Light | ☀️ Light | Solarized light engineering canvas |

[⬆️ Back to Top](#table-of-contents)

---

<a id="types-interfaces"></a>
## 14. 📘 12. TypeScript Types & Interfaces Reference

```typescript
// Window Options
export interface SimpleWindowOptions {
    title?: string;
    width?: number;
    height?: number;
    theme?: string;
    background_color?: string;
    font_color?: string;
    padding?: number;
    spacing?: number;
    alwaysOnTop?: boolean;
}

// Event Callback Signature
export type EventCallback = (win: SimpleWindow, val?: any) => void;

// Theme Object Definition
export interface ThemeDefinition {
    name: string;
    background_color: string;
    font_color: string;
    card_bg: string;
    border_color: string;
    accent_color: string;
}
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="cheat-sheet"></a>
## 15. 💡 13. Beginner's "How Do I...?" Cheat Sheet

### Q: How do I read text from an input box on button click?
```typescript
win.addTextInput("Enter name...").id("txtName");
win.addButton("Submit", (w) => {
    const userTyped = w.getText("txtName");
    console.log("User typed:", userTyped);
});
```

### Q: How do I change a label's text when a button is clicked?
```typescript
win.addLabel("Initial Status").id("lblStatus");
win.addButton("Update", (w) => {
    w.setText("lblStatus", "✅ Operation Complete!");
});
```

### Q: How do I style a primary action button blue and bold?
```typescript
win.addButton("Click Me")
   .bg("#0284c7")
   .color("#ffffff")
   .bold();
```

### Q: How do I disable a button so the user can't click it?
```typescript
win.addButton("Save").id("btnSave").disabled(true);
// Later, to re-enable it:
win.enableControls(["btnSave"]);
```

### Q: How do I show an error popup message?
```typescript
win.error("Invalid Input", "Please enter a valid email address.");
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="troubleshooting"></a>
## 16. ⚠️ 14. Troubleshooting & Common Pitfalls

1. **Forgot `win.run()`**: If your script exits immediately without opening a window, ensure you called `win.run()` at the end of your file.
2. **Unbalanced Container Calls**: Always balance every `beginRow()` with `endRow()`, `beginGrid()` with `endGrid()`, and `beginCard()` with `endCard()`.
3. **Duplicate Control IDs**: Give every input control a unique `.id("...")` key. Duplicate IDs will overwrite state lookups in `getFormValues()`.
4. **Asynchronous Handlers**: Event callbacks can be `async`. Use `await w.withBusyState(...)` when executing network or file requests.

[⬆️ Back to Top](#table-of-contents)

---

<a id="production-app"></a>
## 17. 🚀 15. Complete Production Studio Application

Below is a complete, copy-paste ready application showcasing layout grids, cards, form fields, telemetry charts, activity feeds, theme switching, timers, and async operations:

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Initialize Desktop Window
const win = simplegui.createWindow("🚀 Developer Studio Desktop App", 920, 700, {
    theme: "apple_dark"
});

// 2. Application Title Header
win.addHeading("⚡ SimpleGUI Production Studio", "Build powerful cross-platform desktop interfaces with Bun & TypeScript");
win.addDivider();

// 3. Multi-Column Grid Layout (2 Equal Columns)
win.beginGrid(2, 16);

  // --- Column 1: System Preferences Card ---
  win.beginCard("⚙️ System Preferences");
    win.addFormField("Application Title:", "txtAppTitle", "My Studio App");
    win.addFormDropdown("Color Theme:", "cmbTheme", ["apple_dark", "catppuccin", "nord", "cyberpunk"], "apple_dark");
    win.addFormSwitch("Telemetry Mode:", "swtTelemetry", "Enable Live Reporting", true);
    win.addFormSlider("System Volume:", "sldVol", 75);
  win.endCard();

  // --- Column 2: Performance Telemetry Card ---
  win.beginCard("📊 Live Diagnostics");
    win.addCircularProgress("cprCpu", 72);
    win.addGauge("ggeMemory", "RAM Usage", 58);
    win.addSparkline("spkReq", [10, 25, 40, 60, 50, 80, 95], 35);
  win.endCard();

win.endGrid();

// 4. Activity Feed Section
win.beginCard("📋 System Activity Feed");
  win.addActivityFeed("feedEvents", 120);
  win.addActivityFeedItem("feedEvents", "10:00:00", "Application engine started.");
  win.addActivityFeedItem("feedEvents", "10:00:02", "IPC webview channel connected.");
win.endCard();

// Live 1-Second Timer
win.addTimer(1000, (w) => {
    const timeNow = new Date().toLocaleTimeString();
    w.addActivityFeedItem("feedEvents", timeNow, "Heartbeat tick received.");
});

// 5. Action Button Row
win.beginRow();
  // Submit Profile Action
  win.addButton("☁️ Sync Cloud", async (w) => {
      await w.withBusyState(["txtAppTitle", "cmbTheme"], "⏳ Synchronizing data...", async (winCtx) => {
          await winCtx.sleep(1500);
          winCtx.info("Sync Complete", "Cloud settings successfully synchronized!");
      });
  }).bg("#0284c7").color("#ffffff").bold().width(160).height(40);

  // Apply Theme Action
  win.addButton("🎨 Apply Theme", (w) => {
      const selectedTheme = w.getText("cmbTheme") || "apple_dark";
      w.setTheme(selectedTheme);
      w.info("Theme Changed", `Switched active theme to '${selectedTheme}'`);
  }).bg("#475569").color("#ffffff").width(140).height(40);

  // Save Settings File Action
  win.addButton("💾 Save to File", (w) => {
      w.saveValuesToFile("./studio_settings.json");
      w.info("Saved", "Settings saved to studio_settings.json");
  }).bg("#059669").color("#ffffff").width(140).height(40);

  // Exit Application Action
  win.addButton("❌ Exit App", (w) => {
      if (w.ask("Are you sure you want to quit?", "Confirm Exit")) {
          w.quit();
      }
  }).bg("#dc2626").color("#ffffff").bold().width(120).height(40);
win.endRow();

// 6. Launch Desktop Application
win.run();
```

---

<a id="related-projects"></a>
## 16. 🌟 Related RAD & GUI Ecosystem Projects

| Project | Description | Primary Use Case |
| :--- | :--- | :--- |
| **[bun_rad_studio](https://github.com/codecaine-zz/bun_rad_studio)** | Full-stack Rapid Application Development (RAD) visual designer and code studio powered by Bun, TypeScript, and modern web UI technologies. | Full-stack desktop & client web applications, rapid UI prototyping, and visual form design. |
| **[bun_simplcli](https://github.com/codecaine-zz/bun_simplcli)** | Zero-dependency, high-performance console utility framework & RAD toolkit built natively for the Bun runtime (cross-platform OS system telemetry, hardware resource monitoring, ANSI styling, interactive prompts, spinners, progress meters, data tables, and logging). | Headless CLI tools, system administration utilities, terminal dashboards, and DevOps automation scripts in Bun (headless companion to Bun RAD Studio). |
| **[vlang_simplegui](https://github.com/codecaine-zz/vlang_simplegui)** | Lightweight, high-productivity cross-platform desktop GUI toolkit and visual designer for the V programming language with 100% API parity. | Native desktop GUI applications, rapid UI prototyping, and cross-platform desktop utilities in V. |
| **[vlang_simplecli](https://github.com/codecaine-zz/vlang_simplecli)** | Zero-dependency, high-productivity console & terminal RAD toolkit for V (ANSI colors, banners, spinners, progress meters, data tables, safe execution). | Headless CLI tools, DevOps automation scripts, and terminal dashboards (headless companion to SimpleGUI in V). |
| **[simple_gg](https://github.com/codecaine-zz/simple_gg)** | Lightweight, hardware-accelerated 2D game & graphics engine with an immediate-mode GUI toolkit written in V. | 2D games, custom canvas widgets, interactive data visualizers, and creative coding. |
| **[bun_webview](https://github.com/codecaine-zz/bun_webview)** | Standalone macOS `.app` packager and native webview window runtime for Bun applications with custom icons, Cocoa menus, and distribution bundling. | Packaging Bun TypeScript/JavaScript apps into native standalone macOS application bundles. |

[⬆️ Back to Top](#table-of-contents)

---

🎉 **You are all set to build amazing desktop apps with SimpleGUI!**

