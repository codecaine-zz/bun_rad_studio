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
13. [🎨 11. Built-in Visual Themes (42 Built-in Themes)](#visual-themes)
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
| `theme` | `string` | `"midnight"` (or saved) | Active visual color palette key |
| `background_color` | `string` | *(Theme default)* | Custom background HEX color |
| `font_color` | `string` | *(Theme default)* | Custom text HEX color |
| `padding` | `number` | `20` | Canvas outer edge margin padding |
| `spacing` | `number` | `12` | Vertical gap between stacked components |
| `alwaysOnTop` | `boolean` | `false` | Floating window pin mode |
| `appId` / `app_id` | `string` | `""` | Unique application ID for persistent state isolation |
| `autoSave` / `auto_save` / `autoSaveState` / `auto_save_state` | `boolean` | `true` | Automatically persist and restore window state between sessions |
| `fullscreen` | `boolean` | `true` | Launch window in borderless fullscreen/maximized mode |
| `responsive` | `boolean` | `true` | Enable responsive flex/grid wrapping on resizing |

<a id="window-state-methods"></a>
### Window State Methods

```typescript
// Change active theme dynamically at runtime
win.setTheme("catppuccin");

// Toggle native always-on-top window level
win.setAlwaysOnTop(true);

// Toggle full-screen mode
win.toggleFullscreen();

// Minimize application window (auto-exits fullscreen space if needed)
win.minimize();

// Close application window & terminate process cleanly
win.quit();

// Resize window canvas dynamically
win.setSize(1024, 768);
win.resize(1024, 768);

// Adjust individual control dimensions dynamically
win.setControlWidth(320, "btnSubmit");
win.setControlHeight(44, "btnSubmit");

// Retrieve placed control specs or full form specification
const spec = win.getControlSpec("btnSubmit");
const allControls = win.getControls();
const formSpec = win.getFormSpec();
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
| `.bg()` / `.backgroundColor()` | `(color: string) => this` | Sets background HEX or CSS color |
| `.color()` / `.fontColor()` | `(color: string) => this` | Sets foreground text color |
| `.font()` | `(size: number, color?: string, weight?: string) => this` | Configures typography settings |
| `.fontSize()` | `(size: number) => this` | Sets font size in pixels |
| `.bold()` | `(isBold?: boolean) => this` | Sets font weight to bold (700) |
| `.italic()` | `(isItalic?: boolean) => this` | Sets font style to italic |
| `.align()` | `(alignment: "left" \| "center" \| "right") => this` | Sets inline text alignment |
| `.tooltip()` | `(hint: string) => this` | Sets hover tooltip hint text |
| `.placeholder()`| `(ph: string) => this` | Sets input placeholder text |
| `.opacity()` | `(percent: number) => this` | Sets control opacity percentage (0-100) |
| `.expandFill()` | `(expand?: boolean) => this` | Expands control to fill remaining flex/container width |
| `.enabled()` | `(flag?: boolean) => this` | Toggles user interaction state |
| `.visible()` | `(flag?: boolean) => this` | Toggles component visibility |
| `.show()` / `.hide()` | `() => this` | Visibility shortcuts |
| `.enable()` / `.disable()` | `() => this` | Interaction shortcuts |
| `.readOnly()` | `(flag?: boolean) => this` | Toggles text field read-only status |
| `.focus()` | `() => this` | Focuses target input element |
| `.flash()` | `() => this` | Flashes component background highlight |
| `.highlight()` | `(durationMs?: number) => this` | Highlights control for specified duration |
| `.min()` / `.max()` / `.step()` | `(val: number) => this` | Configures numeric range boundaries and interval |
| `.multiSelect()` | `(enable?: boolean) => this` | Enables multi-row/item selection on ListBox and Table |
| `.checkboxSelection()` | `(enable?: boolean) => this` | Renders row selection checkboxes |
| `.getSelectedItems()` | `() => string[]` | Returns array of selected strings from ListBox |
| `.getSelectedRows()` | `() => any[]` | Returns array of selected row data from Table |
| `.value()` / `.getValue()` / `.setValue()` | `(val?: any) => any \| this` | Getter/setter for control value |
| `.text()` / `.getText()` / `.setText()` | `(txt?: string) => string \| this` | Getter/setter for control text or label |
| `.appendText()` / `.appendLine()` | `(text: string) => this` | Appends text or lines to text area or console |
| `.options()` | `(items: string[]) => this` | Replaces dropdown/listbox options |
| `.increment()` | `(delta?: number) => number` | Increments numeric control value |
| `.toggleChecked()` | `() => boolean` | Toggles checkbox/switch checked state |
| `.openModal()` / `.closeModal()` | `() => this` | Shows/hides modal dialog overlay |
| `.expandAll()` / `.collapseAll()` | `() => this` | Expands/collapses all TreeGrid nodes |
| `.closable()` / `.sortable()` / `.resizable()` | `(enable?: boolean) => this` | Toggles tab/column interactive capabilities |
| `.contextMenu()` | `(items: string[] \| string, onSelect?: EventCallback) => this` | Binds right-click popup menu |
| `.bindState()` | `(key: string) => this` | Automatically binds control value to reactive state store |
| `.onClick()` | `(handler: EventCallback) => this` | Binds click event listener |
| `.onDoubleClick()` / `.onDblClick()` | `(handler: EventCallback) => this` | Binds double-click listener (passes option value on listbox, row ID on table) |
| `.onRightClick()` | `(handler: EventCallback) => this` | Binds right-click / context menu listener |
| `.onChange()` | `(handler: EventCallback) => this` | Binds value change listener |
| `.onEnter()` | `(handler: EventCallback) => this` | Binds Enter/Return key press listener on input fields |
| `.onHover()` | `(handler: EventCallback) => this` | Binds mouse hover listener |
| `.onHoverExit()` | `(handler: EventCallback) => this` | Binds mouse hover exit listener |
| `.onToggle()` | `(handler: EventCallback) => this` | Binds switch/checkbox toggle listener |
| `.onSelectionChange()` | `(handler: EventCallback) => this` | Binds item/row selection listener |
| `.onCommand()` | `(handler: EventCallback) => this` | Binds command palette or toolbar command listener |
| `.onTabClose()` | `(handler: EventCallback) => this` | Binds closable tab close event listener |
| `.onCardMove()` | `(handler: EventCallback) => this` | Binds Kanban card drag-and-drop move listener |

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

### 🌟 VLang SimpleGUI Control Parity (55+ Controls & Nameless Shorthands)

Ported with 100% visual and functional parity from [vlang_simplegui API Reference](https://github.com/codecaine-zz/vlang_simplegui/blob/master/docs/API.md):

#### 1. Text, Search & Specialized Inputs
- `win.addSearchField(id?, placeholder?, initialVal?, opts?)` / `win.add_search_field(...)`
- `win.addPassword(id?, placeholder?, initialVal?, opts?)` / `win.add_password(...)`
- `win.addCommandPalette(id?, placeholder?, opts?)` / `win.add_command_palette(...)`
- `win.addTokenField(id?, tokens?, opts?)` / `win.add_token_field(...)`
- `win.addTagInputField(id?, tags?, opts?)` / `win.add_tag_input_field(...)`
- `win.addMaskedInput(id?, mask?, initialVal?, opts?)` / `win.add_masked_input(...)`
- `win.addInlineEditableLabel(id?, text?, opts?)` / `win.add_inline_editable_label(...)`

#### 2. Typography, Banners & Callouts
- `win.addSectionHeader(title, subtitle?, opts?)` / `win.add_section_header(...)`
- `win.addHotkeyBadge(keys, opts?)` / `win.add_hotkey_badge(...)`
- `win.addLink(text, url?, opts?)` / `win.add_link(...)`
- `win.addBanner(message, style?, opts?)` / `win.add_banner(...)`
- `win.addStatusBanner(message, style?, opts?)` / `win.add_status_banner(...)`
- `win.addInfoCallout(title, body, opts?)` / `win.add_info_callout(...)`
- `win.addHeroBanner(title, subtitle?, badge?, opts?)` / `win.add_hero_banner(...)`

#### 3. Buttons & Toolbars
- `win.addImageButton(src, caption?, onClick?, opts?)` / `win.add_image_button(...)`
- `win.addHelpButton(tooltipText?, onClick?, opts?)` / `win.add_help_button(...)`
- `win.addSplitButton(caption, menuItems?, onClick?, opts?)` / `win.add_split_button(...)`
- `win.addBadgeButton(caption, badgeCount?, onClick?, opts?)` / `win.add_badge_button(...)`
- `win.addQuickActionBar(actions, onSelect?, opts?)` / `win.add_quick_action_bar(...)`
- `win.addFloatingToolbar(tools, onSelect?, opts?)` / `win.add_floating_toolbar(...)`

#### 4. Selection, Toggles & Pickers
- `win.addRadio(label, groupName, checked?, opts?)` / `win.add_radio(...)`
- `win.addRadioGroup(groupName, options, selected?, onChange?, opts?)` / `win.add_radio_group(...)`
- `win.addPullDown(id, options, selected?, onChange?, opts?)` / `win.add_pull_down(...)`
- `win.addComboBox(id, options, initialVal?, opts?)` / `win.add_combo_box(...)`
- `win.addThemeMenu(id?, selected?, onChange?, opts?)` / `win.add_theme_menu(...)`
- `win.addModeControl(id, modes?, selected?, onChange?, opts?)` / `win.add_mode_control(...)`
- `win.addIconSegments(id, items, selectedIdx?, onChange?, opts?)` / `win.add_icon_segments(...)`
- `win.addPillToggle(id, options?, selectedIdx?, onChange?, opts?)` / `win.add_pill_toggle(...)`
- `win.addTagCloud(id, tags, selected?, onSelect?, opts?)` / `win.add_tag_cloud(...)`
- `win.addTransferList(id, leftItems?, rightItems?, opts?)` / `win.add_transfer_list(...)`

#### 5. Sliders, Progress & Telemetry
- `win.addVerticalSlider(id, min?, max?, val?, opts?)` / `win.add_vertical_slider(...)`
- `win.addRangeSlider(id, min?, max?, low?, high?, opts?)` / `win.add_range_slider(...)`
- `win.addKnob(id, min?, max?, val?, opts?)` / `win.add_knob(...)`
- `win.addProgressIndicator(id, value?, max?, opts?)` / `win.add_progress_indicator(...)`
- `win.addLevelIndicator(id, value?, max?, opts?)` / `win.add_level_indicator(...)`
- `win.addSpinner(size?, text?, opts?)` / `win.add_spinner(...)`
- `win.addRating(id, value?, max?, opts?)` / `win.add_rating(...)`
- `win.addStarRating(id, value?, max?, opts?)` / `win.add_star_rating(...)`
- `win.addDonutChart(id, title, percent?, subtitle?, opts?)` / `win.add_donut_chart(...)`
- `win.addActivityRings(id, rings?, opts?)` / `win.add_activity_rings(...)`
- `win.addSegmentDistributionBar(id, segments, opts?)` / `win.add_segment_distribution_bar(...)`
- `win.addFeedbackMood(id, selected?, onChange?, opts?)` / `win.add_feedback_mood(...)`
- `win.addActivityHeatmap(id, weeks?, data?, opts?)` / `win.add_activity_heatmap(...)`

#### 6. Pickers & File / Path
- `win.addDateRangePicker(id, startDate?, endDate?, opts?)` / `win.add_date_range_picker(...)`
- `win.addDateTimePicker(id, initialDate?, opts?)` / `win.add_date_time_picker(...)`
- `win.addColorGrid(id, colors?, selected?, opts?)` / `win.add_color_grid(...)`
- `win.addColorSwatchPanel(id, colors?, selected?, opts?)` / `win.add_color_swatch_panel(...)`
- `win.addFilePickerField(id, placeholder?, filter?, opts?)` / `win.add_file_picker_field(...)`
- `win.addPathControl(id, segments?, opts?)` / `win.add_path_control(...)`
- `win.addDropZone(id, promptText?, opts?)` / `win.add_drop_zone(...)`

#### 7. Media, Code & Views
- `win.addHtmlView(html, width?, height?, opts?)` / `win.add_html_view(...)` — Embedded HTML rendering container; dynamic updates via `win.setHtml(id, html)` or `win.setText(id, html)` render formatted markup in real time.
- `win.addBrowserView(url, width?, height?, opts?)` / `win.add_browser_view(...)`
- `win.addCodeEditor(code, language?, width?, height?, opts?)` / `win.add_code_editor(...)`
- `win.addCodeStudio(title, code, language?, opts?)` / `win.add_code_studio(...)`
- `win.addDiffView(original, modified, width?, height?, opts?)` / `win.add_diff_view(...)`
- `win.addTerminalView(lines?, width?, height?, opts?)` / `win.add_terminal_view(...)`
- `win.addJsonTree(data, width?, height?, opts?)` / `win.add_json_tree(...)`
- `win.addAudioWaveform(id, bars?, opts?)` / `win.add_audio_waveform(...)`
- `win.addImageGallery(images, width?, height?, opts?)` / `win.add_image_gallery(...)`
- `win.addMediaPlayer(src, title?, opts?)` / `win.add_media_player(...)`

#### 8. Cards & Dashboard Components
- `win.addStatGrid(stats, opts?)` / `win.add_stat_grid(...)`
- `win.addScoreCard(title, score, subtitle?, grade?, opts?)` / `win.add_score_card(...)`
- `win.addAvatarCard(name, role, avatarUrl?, status?, opts?)` / `win.add_avatar_card(...)`
- `win.addUserProfileCard(user, opts?)` / `win.add_user_profile_card(...)`
- `win.addProductCard(product, opts?)` / `win.add_product_card(...)`
- `win.addAppLauncherTile(title, icon?, description?, onClick?, opts?)` / `win.add_app_launcher_tile(...)`
- `win.addHttpRequestCard(method?, url?, status?, latency?, opts?)` / `win.add_http_request_card(...)`
- `win.addResourceMonitor(id?, cpu?, ram?, disk?, opts?)` / `win.add_resource_monitor(...)`
- `win.addEnvVars(id?, vars?, opts?)` / `win.add_env_vars(...)`
- `win.addStatusIndicator(label, status?, opts?)` / `win.add_status_indicator(...)`
- `win.addStatusDock(items?, opts?)` / `win.add_status_dock(...)`

#### 9. Navigation & Container Widgets
- `win.addNavRail(items, onSelect?, opts?)` / `win.add_nav_rail(...)`
- `win.addDisclosure(title, content, expanded?, opts?)` / `win.add_disclosure(...)`
- `win.addCollapsibleSection(title, content, expanded?, opts?)` / `win.add_collapsible_section(...)`
- `win.addAccordionGroup(items, opts?)` / `win.add_accordion_group(...)`
- `win.addKanbanBoard(columns, opts?)` / `win.add_kanban_board(...)`
- `win.addActionRow(buttons, opts?)` / `win.add_action_row(...)`
- `win.addFieldsRow(fields, opts?)` / `win.add_fields_row(...)`
- `win.addGroupBox(title, width?, height?, opts?)` / `win.add_group_box(...)`
- `win.addTabs(tabNames, selectedIdx?, opts?)` / `win.add_tabs(...)`
- `win.addScrollView(width?, height?, opts?)` / `win.add_scroll_view(...)`
- `win.addVerticalSpacer(height?)` / `win.add_vertical_spacer(...)`
- `win.addHorizontalSpacer(width?)` / `win.add_horizontal_spacer(...)`
- `win.addSeparator()` / `win.add_separator()`
- `win.addToolbarItem(label, icon?, onClick?, opts?)` / `win.add_toolbar_item(...)`
- `win.addTrayIcon(tooltip, icon?, opts?)` / `win.add_tray_icon(...)`
- `win.addGrid(columns?, gap?, opts?)` / `win.add_grid(...)`
- `win.addTreeNode(label, children?, opts?)` / `win.add_tree_node(...)`

#### 10. Studio Extended Controls (Modern Ergonomic UI)
- `win.addSidebar(title, items, onClick?, opts?)` / `win.add_sidebar(...)`: Off-canvas drawer navigation menu with item links, active selection indicators, and close action.
- `win.addModal(title, message, onConfirm?, opts?)` / `win.add_modal(...)`: Modal dialog box with elevated drop shadow, close (&times;) button, content body, and action buttons.
- `win.addDropdownMenu(label, items, onSelect?, opts?)` / `win.add_dropdown_menu(...)`: Action button with smooth reveal menu and outside-click auto-close.
- `win.addListGroup(items, onSelect?, opts?)` / `win.add_list_group(...)`: List container with item icons, bold titles, subtitle notes, and right-aligned pill badges.
- `win.addContentCard(title, description?, opts?)` / `win.add_content_card(...)` / `win.addCard(...)`: Elevated card container with header banner, media slot, description, and action button.
- `win.addCalloutPanel(title, message?, alertType?, opts?)` / `win.add_callout_panel(...)`: Contextual notification panel with 6px solid accent left bar (supports `info`, `success`, `warning`, `error`).
- `win.addTooltipBox(triggerText, tooltipText, opts?)` / `win.add_tooltip_box(...)`: Interactive trigger button with floating hover tooltip bubble.
- `win.addAnimatedInput(placeholder?, value?, onChange?, opts?)` / `win.add_animated_input(...)`: Search/text input that expands smoothly on focus with glowing focus ring.
- `win.addHeroDisplay(title, opts?)` / `win.add_hero_display(...)`: Hero media container with pinned corner status chips and center title.
- `win.addCodeSnippet(code, opts?)` / `win.add_code_snippet(...)`: Syntax code box with monospace font, accent bar, and 1-click clipboard copy button.
- `win.addCountBadge(count, opts?)` / `win.add_count_badge(...)`: Circular numeric count pill badge with glow.
- `win.addButtonGroup(buttons, onClick?, opts?)` / `win.add_button_group(...)`: Connected segmented button bar with shared borders and active states.
- `win.addSlideshow(slides, onChange?, opts?)` / `win.add_slideshow(...)`: Interactive carousel with prev/next navigation, slide counter, and dot indicators.

#### 11. Nameless Shorthand Helpers
```typescript
win.donut("CPU Load", 74);
win.score_card("System Health", "99.9%", "Optimal", "A+");
win.search_field("Search files...");
win.code_box("console.log('hi')", "typescript");
win.banner("Changes saved", "success");
win.stat_card("Uptime", "99.99%");
win.stat_grid([{ label: "Active", value: "1,250" }]);
win.user_profile("Sarah Connor", "@sarah");
win.product_card({ title: "Pro Studio", price: "$49" });
win.heatmap(12);
win.radial_gauge("Memory Temp", 38);
win.nav_rail([{ icon: "⚡", label: "Dashboard" }]);
win.media_player("audio.mp3", "Theme");
win.activity_rings();
win.knob(50);
win.floating_toolbar(["➕", "➖", "🗑️"]);
win.password("secret123");
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
### Typed Accessors (`getText`, `setText`, `setHtml`, `getBool`, `getInt`, `getFloat`)

```typescript
// String Accessors
const name: string = win.getText("txtName");
win.setText("txtName", "Sarah Connor");

// Rich HTML View Accessors
win.setHtml("previewDiv", "<h1>Formatted Preview</h1><p>Real-time markup</p>");
win.set_html("previewDiv", "<h1>Formatted Preview</h1>"); // vlang parity alias

// Boolean Accessors
const active: boolean = win.getBool("swtActive");
win.setBool("swtActive", true);

// Number Accessors
const count: number = win.getInt("numCount");
win.setInt("numCount", 42);

const score: number = win.getFloat("numScore");
win.setFloat("numScore", 98.6);
```

<a id="realtime-input-sync"></a>
### Real-Time Keystroke & Input Synchronization

All text controls (`addTextInput`, `addInput`, `addTextArea`, `addTextarea`, `addSearch`, `addPasswordInput`) are wired with immediate real-time `oninput` bridge synchronization. Every keystroke instantly synchronizes the control's value with Bun's `formValuesStore` and invokes any bound `onChange` handler without requiring users to unfocus/blur the field:

```typescript
// Live preview updates on every keystroke
win.onChange("txt_md_input", (w, val) => {
    const rendered = markdownToHtml(val);
    w.setHtml("txt_md_preview", rendered);
});
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

#### 2. Event Listeners & Double-Click Dispatching

SimpleGUI provides comprehensive event binding both at the window level and directly on control references via fluent chaining.

##### Complete Event Binding Methods Reference

| Window Method | Control Method | Passed Parameter (`val`) | Description |
| --- | --- | --- | --- |
| `win.onClick(id, cb)`<br>`win.on_click(id, cb)`<br>`win.bindClick(id, cb)` | `ref.onClick(cb)` | `string` (caption, item, or row ID) | Triggers on primary mouse click. |
| `win.onDoubleClick(id, cb)`<br>`win.onDblClick(id, cb)`<br>`win.on_double_click(id, cb)`<br>`win.on_dblclick(id, cb)`<br>`win.bindDblClick(id, cb)` | `ref.onDoubleClick(cb)`<br>`ref.onDblClick(cb)`<br>`ref.on_double_click(cb)`<br>`ref.on_dblclick(cb)` | `string` (selected value or row PID) | Triggers on mouse double-click. On listboxes passes option text/value; on tables passes row primary key (`rowPid` / `cells[0]`). |
| `win.onChange(id, cb)`<br>`win.on_change(id, cb)`<br>`win.bindChange(id, cb)` | `ref.onChange(cb)` | `any` (new input value) | Triggers on value change or keystroke (synchronized real-time). |
| `win.onEnter(id, cb)`<br>`win.on_enter(id, cb)`<br>`win.bindEnter(id, cb)` | `ref.onEnter(cb)`<br>`ref.on_enter(cb)` | `string` (current input text) | Triggers when the user presses <kbd>Enter</kbd> / <kbd>Return</kbd> inside an input field. |
| `win.onRightClick(id, cb)`<br>`win.on_right_click(id, cb)`<br>`win.bindRightClick(id, cb)` | `ref.onRightClick(cb)`<br>`ref.on_right_click(cb)` | `string` (action label) | Triggers on right-click / context menu interaction. |
| `win.onHover(id, cb)`<br>`win.on_hover(id, cb)`<br>`win.bindHover(id, cb)` | `ref.onHover(cb)` | `undefined` | Triggers when mouse cursor enters control bounds. |
| `win.onHoverExit(id, cb)` | `ref.onHoverExit(cb)` | `undefined` | Triggers when mouse cursor exits control bounds. |
| `win.onSelectionChange(id, cb)` | `ref.onSelectionChange(cb)` | `string[]` (selected IDs) | Triggers when multi-selection in a table or list changes. |
| `win.onShortcut(key, cb)`<br>`win.bindShortcut(key, cb)` | — | `undefined` | Binds global window keyboard shortcut (e.g. `"Escape"`, `"Ctrl+S"`). |

##### 🖱️ Double-Click Semantics & Auto-Launch Pattern

Double-clicking is standard desktop UX for instant launching, opening files, or editing records. SimpleGUI wires native `ondblclick` handlers across the Webview IPC bridge:

1. **ListBox (`lst_*`)**:
   - Double-clicking any option item triggers `onDoubleClick` passing the clicked option text or value.
2. **Data Table / DBGrid (`tbl_*`)**:
   - Double-clicking any table row triggers `onDoubleClick` passing that row's primary key (`data-pid` or `cells[0]`).
3. **Launch Mutex & Debounce Best Practice**:
   - Because users may double-click quickly, always guard child process spawns with a debounce or per-app launch lock so only **exactly one instance** opens:

```typescript
import { createWindow } from "bun_rad_studio";

const win = createWindow("Launcher Studio", 880, 580);

// 1. Top ListBox with fluent double-click binding
win.addListBox("lst_apps", [
    "Database: SQLite Studio Pro",
    "Cache: Redis Studio Pro",
    "Network: Packet Inspector"
]).onDoubleClick((w, selectedVal) => {
    w.toast(`🚀 Auto-launching: ${selectedVal}...`);
    launchApp(selectedVal);
});

// 2. Bottom Table with window-level double-click binding
const tableHeaders = ["ID", "Name", "Category", "Status"];
const tableRows = [
    ["sqlite_studio", "SQLite Studio Pro", "Database", "Ready"],
    ["redis_studio", "Redis Studio Pro", "Cache", "Ready"],
    ["packet_studio", "Packet Inspector", "Network", "Active"]
];

win.addTable("tbl_apps", tableHeaders, tableRows, (w, rowPid) => {
    // Single-click selects and previews
    w.setStatus(`Selected tool: ${rowPid}`);
});

win.onDoubleClick("tbl_apps", (w, rowPid) => {
    // Double-click auto-launches the tool
    w.toast(`🚀 Opening application: ${rowPid}...`);
    launchApp(rowPid);
});

// 3. Recommended Per-App Launch Mutex
const activeLaunches = new Set<string>();

async function launchApp(appId: string) {
    if (activeLaunches.has(appId)) return; // Suppress duplicate triggers
    activeLaunches.add(appId);
    try {
        console.log(`Launching process for ${appId}...`);
        await executeSubprocess(appId);
    } finally {
        setTimeout(() => activeLaunches.delete(appId), 1000);
    }
}

// 4. Enter Key and Shortcut Binding
win.addTextInput("Type search filter...").id("txt_search");
win.onEnter("txt_search", (w, query) => {
    w.toast(`Searching for: ${query}`);
});

win.onShortcut("Escape", (w) => w.close());
win.onShortcut("Ctrl+S", (w) => w.saveAppFormState());
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
## 13. 🎨 Built-in Visual Themes (133 Themes)

Dynamically switch active visual themes at runtime using `win.setTheme(themeKey)`:

| Theme Key | Theme Name | Type | Accent | Vibe / Description |
| --- | --- | --- | --- | --- |
| `codefreelance` | CodeFreelance | 🌙 Dark | `#0fb36a` | Official CodeFreelance (#050505 obsidian base, #121212 cards, #0fb36a emerald & #bd00ff purple accents - codefreelance.net) |
| `raycast_dark` | Raycast Dark | 🌙 Dark | `#ff6363` | Silicon Valley developer command palette with ultra-slick charcoal surfaces and laser red |
| `linear_dark` | Linear Studio | 🌙 Dark | `#5e6ad2` | High-craft Linear project workspace with deep obsidian cards and electric indigo accents |
| `vercel_dark` | Vercel Geist | 🌙 Dark | `#ffffff` | Ultra-minimalist Next.js & Vercel design system with pure monochrome contrast and electric blue |
| `unreal_engine` | Unreal Engine 5 | 🌙 Dark | `#0e86d4` | Epic Games Unreal Engine 5 professional workstation with dark graphite & Blueprint blue |
| `arc_velvet` | Arc Velvet | 🌙 Dark | `#f72585` | Arc Browser velvet aesthetic with deep plum indigo and luminous neon magenta accents |
| `abyss` | Abyss Bioluminescence | 🌙 Dark | `#06b6d4` | Deep oceanic trench dark theme with radiant bioluminescent cyan and marine slate |
| `night_city` | Cyberpunk Night City | 🌙 Dark | `#ff003c` | AAA Cyberpunk 2077 Night City HUD with Trauma Team red, Samurai yellow and chrome cards |
| `horizon` | Horizon Sunset | 🌙 Dark | `#e95678` | Warm twilight horizon spectrum with glowing neon coral, peach and dusk plum |
| `tailwind_dark` | Tailwind Slate Emerald | 🌙 Dark | `#10b981` | Modern Tailwind CSS flagship developer theme with deep slate 950 and vibrant emerald |
| `supabase` | Supabase Dark | 🌙 Dark | `#3ecf8e` | Supabase cloud database dashboard with sleek dark obsidian and signature emerald |
| `oled_black` | OLED Laser Black | 🌙 Dark | `#00e676` | Zero-power pure OLED black canvas with ultra-sharp laser green and high-contrast cards |
| `titanium_slate` | Titanium Slate Pro | 🌙 Dark | `#ff6b22` | Apple Pro hardware grade aerospace titanium space black with aviation orange accents |
| `jetbrains_darcula` | JetBrains Darcula | 🌙 Dark | `#cc7832` | Iconic JetBrains IntelliJ IDEA / PyCharm Darcula IDE workspace with warm syntax orange |
| `nordic_paper` | Nordic Paper Light | ☀️ Light | `#2b5c8f` | Nordic editorial paper light canvas with deep fjord blue and crisp typographic elegance |
| `monokai_pro` | Monokai Pro | 🌙 Dark | `#ffd866` | Monokai Pro refined dark spectrum with warm yellow and vivid magenta accents |
| `tokyo_night` | Tokyo Night | 🌙 Dark | `#7aa2f7` | Tokyo Night dark neon indigo city theme with vibrant blue and lavender accents |
| `one_dark_pro` | One Dark Pro | 🌙 Dark | `#61afef` | Iconic Atom & VS Code One Dark Pro deep slate canvas with vibrant syntax hues |
| `gruvbox_dark` | Gruvbox Dark | 🌙 Dark | `#fabd2f` | Retro groove warm earthy dark palette with amber gold and terracotta orange |
| `gruvbox_light` | Gruvbox Light | ☀️ Light | `#b57614` | Retro groove parchment light canvas with earthy amber and walnut tones |
| `rose_pine` | Rosé Pine | 🌙 Dark | `#eb6f92` | All-natural soft dark palette with dusty rose, pine foam, and warm gold |
| `everforest` | Everforest Dark | 🌙 Dark | `#a7c080` | Natural comfort forest dark mode engineered for zero eye strain |
| `kanagawa` | Kanagawa | 🌙 Dark | `#7e9cd8` | Japanese ukiyo-e wave art inspired dark sumi ink palette |
| `cobalt2` | Cobalt2 | 🌙 Dark | `#ffc600` | Wes Bos official Cobalt2 deep navy blue with brilliant canary yellow accents |
| `win11_slate` | Windows 11 Fluent Slate | 🌙 Dark | `#60cdff` | Modern Windows 11 Fluent Dark Acrylic with vibrant sky blue accents |
| `win11_light` | Windows 11 Mica Light | ☀️ Light | `#005fb8` | Modern Windows 11 Mica Light desktop with crisp Fluent typography |
| `ubuntu_dark` | Ubuntu Yaru Dark | 🌙 Dark | `#e95420` | Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange |
| `ubuntu_light` | Ubuntu Yaru Light | ☀️ Light | `#e95420` | Official Ubuntu Yaru modern Linux light desktop with crisp white surfaces and vibrant Ubuntu orange |
| `adwaita_dark` | GNOME Adwaita Dark | 🌙 Dark | `#3584e4` | Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue controls |
| `adwaita_light` | GNOME Adwaita Light | ☀️ Light | `#3584e4` | Clean GNOME Libadwaita light desktop with neutral paper surfaces and signature blue controls |
| `linux_mint` | Linux Mint Dark | 🌙 Dark | `#87a556` | Modern Linux Mint Cinnamon desktop theme with slate graphite surfaces and signature mint green accents |
| `pop_os` | Pop!_OS Dark | 🌙 Dark | `#48b9c7` | System76 Pop!_OS and COSMIC modern Linux desktop with dark charcoal surfaces and signature teal and amber accents |
| `fedora_dark` | Fedora Blue | 🌙 Dark | `#51a2da` | Official Fedora Workstation modern Linux theme with navy graphite cards and crisp Fedora blue |
| `aura` | Aura Dark | 🌙 Dark | `#a277ff` | Lush mystical dark theme with ethereal neon purple and mint green accents |
| `apple_dark` | Apple Dark | 🌙 Dark | `#0a84ff` | Modern macOS Dark Mode canvas (Default) |
| `apple_light` | Apple Light | ☀️ Light | `#0071e3` | Clean, bright macOS Aqua light canvas |
| `midnight` | Midnight Space Gray | 🌙 Dark | `#38bdf8` | Deep space gray & titanium dark mode |
| `sonoma_emerald` | Sonoma Emerald | 🌙 Dark | `#30d158` | macOS Sonoma forest green glass theme |
| `ventura_amber` | Ventura Amber | 🌙 Dark | `#ff9500` | Warm golden sunset dark hues |
| `apple_sunset` | Apple Sunset | 🌙 Dark | `#ff7733` | Cozy Mojave twilight palette |
| `catppuccin` | Catppuccin Mocha | 🌙 Dark | `#cba6f7` | Soothing pastel purple & lavender dark mode |
| `nord` | Nord | 🌙 Dark | `#88c0d0` | Arctic ice blue developer palette |
| `dracula` | Dracula | 🌙 Dark | `#bd93f9` | High-contrast vampire purple palette |
| `cyberpunk` | Cyberpunk | 🌙 Dark | `#ff007f` | Vibrant neon pink and cyan dark theme |
| `github_dark` | GitHub Dark | 🌙 Dark | `#58a6ff` | Official GitHub dark code palette |
| `github_light` | GitHub Light | ☀️ Light | `#0969da` | Official clean GitHub light palette |
| `navy_blue` | Navy Blue | 🌙 Dark | `#38bdf8` | Deep blue ocean dark palette |
| `forest_green` | Forest Green | 🌙 Dark | `#4ade80` | Natural emerald green dark palette |
| `soft_pastel` | Soft Pastel | ☀️ Light | `#e07a5f` | Warm studio light canvas |
| `solarized_dark` | Solarized Dark | 🌙 Dark | `#2aa198` | Solarized dark engineering canvas |
| `solarized_light` | Solarized Light | ☀️ Light | `#268bd2` | Solarized light engineering canvas |
| `win95` | Windows 95 | ☀️ Retro | `#000080` | Classic teal desktop with silver 3D beveled cards and titlebar navy |
| `gameboy` | Game Boy 1989 | 🌙 Retro | `#8bac0f` | Nostalgic 4-shade monochrome dot matrix Game Boy DMG-01 screen |
| `c64` | Commodore 64 | 🌙 Retro | `#7974ff` | Legendary 1982 Commodore 64 READY prompt and VIC-II blue palette |
| `mac_classic` | Macintosh System 7 | ☀️ Retro | `#5555aa` | Vintage 1991 System 7 Platinum desktop with Chicago typography |
| `amber_crt` | Phosphor Amber CRT | 🌙 Retro | `#ffb000` | Warm VT220 / Pip-Boy amber phosphor monochrome terminal cathode glow |
| `matrix` | Matrix Phosphor | 🌙 Retro | `#00ff41` | Iconic 1999 digital rain phosphor green mainframe terminal |
| `synthwave` | Synthwave '84 | 🌙 Retro | `#ff2a85` | 1980s neon synthwave, sunset magenta grid, and retro arcade glow |
| `amiga` | Amiga Workbench | 🌙 Retro | `#ff8800` | Retro Amiga 500 Workbench 1.3 royal blue and orange accents |
| `nextstep` | NeXTSTEP 1989 | 🌙 Retro | `#4a90e2` | Steve Jobs 1989 NeXTSTEP UNIX workstation dark minimalist elegance |
| `mac_os_aqua` | Mac OS X Aqua | ☀️ Retro | `#0076fe` | Early 2001 OS X Cheetah glossy gel buttons and brushed pinstripes |
| `hotdog_stand` | Hot Dog Stand | 🌙 Retro | `#ff0000` | Unforgettable Windows 3.1 1992 Hot Dog Stand yellow & red |
| `playstation` | PlayStation 1994 | 🌙 Retro | `#00d2c4` | 1994 PSX console gray with geometric controller accents |

[⬆️ Back to Top](#table-of-contents)

---

<a id="types-interfaces"></a>
### Effects for futuristic themes

Twelve themes (`cyberpunk_hologram`, `neon_hud`, `quantum_obsidian`, `deep_space`, `liquid_metal`, `titanium_aurora`, `liquid_metal_light`, `neo_tokyo_dark`, `synthetic_solar`, `neo_tokyo_day`, `aurora_glass`, `plasma_violet`) carry an `fx` descriptor: glass, glow, a slow backdrop and a compositor-only motion layer. `simplegui.getThemeFx(name)` returns it (or `undefined`), `isFxTheme(name)` tells you, `fxCssVars(theme)` gives the `--fx-*` variables, and `getSyntaxPalette(name)` gives readable code colors for any theme. `createWindow(title, w, h, { theme, effects: "full" | "reduced" | "off" })` and `win.setEffects(mode)` switch the layer; users who ask their system for reduced motion get no motion automatically. Full reference: [developer/fx-themes.md](developer/fx-themes.md).

### Status colors

`simplegui.getSemanticColors(theme)` returns `{ danger, warning, success, info }`, each with `solid` (fill), `on` (label on the fill), `text` (readable on the canvas and cards), `soft` (translucent tint) and `border`. They are CSS variables on every page (`--danger`, `--danger-on`, `--danger-text`, `--danger-soft`, `--danger-border`, and the same for `--warning`, `--success`, `--info`) and follow a live theme switch. Buttons take `{ variant: "danger" | "warning" | "success" | "info", appearance: "solid" | "soft" | "outline" }`; an explicit `background_color` still wins. See [THEMES.md](THEMES.md#status-colors).

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
    appId?: string;
    app_id?: string;
    autoSave?: boolean;
    auto_save?: boolean;
    autoSaveState?: boolean;
    auto_save_state?: boolean;
    fullscreen?: boolean;
    responsive?: boolean;
}

// Event Callback Signature
export type EventCallback = (win: SimpleWindow, val?: any) => void;

// Layout Section Definition
export interface SimpleguiLayoutSection {
    type: "header_bar" | "card" | "row" | "standalone" | "grid";
    id?: string;
    title?: string;
    subtitle?: string;
    rows?: Array<{ id: string; controls: string[] }>;
    controls?: string[];
    items?: string[];
    cols?: number;
    gap?: number;
    cards?: SimpleguiLayoutSection[];
}

// Theme Object Definition
export interface SimpleGUITheme {
    name: string;
    short_name?: string;
    background_color: string;
    font_color: string;
    accent_color: string;
    secondary_accent?: string;
    card_background?: string;
    card_border?: string;
    description: string;
    is_dark: boolean;
}

// Control Specification Object
export interface ControlSpec {
    id: string;
    control_type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    font_size?: number;
    font_color?: string;
    background_color?: string;
    hover_color?: string;
    hover_text_color?: string;
    cursor?: string;
    border_radius?: number;
    border_width?: number;
    border_color?: string;
    border_style?: "solid" | "dashed" | "dotted" | "double" | "none";
    box_shadow?: "none" | "subtle" | "medium" | "deep" | "glow";
    text_align?: "left" | "center" | "right" | "justify";
    opacity?: number;
    placeholder?: string;
    read_only?: boolean;
    readonly?: boolean;
    required?: boolean;
    max_length?: number;
    min_value?: number;
    max_value?: number;
    step?: number;
    auto_focus?: boolean;
    value?: any;
    checked?: boolean;
    enabled?: boolean;
    visible?: boolean;
    locked?: boolean;
    tab_order?: number;
    tooltip?: string;
    anchors?: {
        top?: boolean;
        left?: boolean;
        right?: boolean;
        bottom?: boolean;
    };
    dock?: "none" | "top" | "bottom" | "left" | "right" | "fill";
    [key: string]: any;
}

// Form Specification Object
export interface FormSpec {
    title: string;
    width: number;
    height: number;
    theme: string;
    background_color: string;
    font_color: string;
    accent_color?: string;
    secondary_accent?: string;
    card_background?: string;
    card_border?: string;
    padding: number;
    spacing: number;
    controls: ControlSpec[];
    non_visual_controls?: ControlSpec[];
    menu_bar?: any;
    global_context_menu_items?: any[];
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

### Q: How do I handle double-clicks on a ListBox or Table?
```typescript
// ListBox: val is the selected item text
win.addListBox("lst_items", ["Item 1", "Item 2", "Item 3"])
   .onDoubleClick((w, item) => {
       console.log("Double clicked list item:", item);
   });

// Table: val is the row PID (first column value)
win.addTable("tbl_records", ["ID", "Name"], [["101", "Ada"], ["102", "Alan"]])
   .onDoubleClick((w, rowId) => {
       console.log("Double clicked row ID:", rowId);
   });
```

### Q: How do I trigger an action when the user presses Enter in an input field?
```typescript
win.addTextInput("Type and press Enter...").id("txtSearch");
win.onEnter("txtSearch", (w, text) => {
    w.toast(`Search triggered: ${text}`);
});
```

[⬆️ Back to Top](#table-of-contents)

---

<a id="troubleshooting"></a>
## 16. ⚠️ 14. Troubleshooting & Common Pitfalls

1. **Forgot `win.run()`**: If your script exits immediately without opening a window, ensure you called `win.run()` at the end of your file.
2. **Unbalanced Container Calls**: Always balance every `beginRow()` with `endRow()`, `beginGrid()` with `endGrid()`, and `beginCard()` with `endCard()`.
3. **Duplicate Control IDs**: Give every input control a unique `.id("...")` key. Duplicate IDs will overwrite state lookups in `getFormValues()`.
4. **Duplicate Launches on Fast Double-Clicks**: When launching external child processes from a double-click event, guard your launch function with a per-app `Set` or debounce lock to prevent duplicate subprocesses:
   ```typescript
   const launching = new Set<string>();
   async function safeLaunch(appId: string) {
       if (launching.has(appId)) return;
       launching.add(appId);
       try { await startProcess(appId); }
       finally { setTimeout(() => launching.delete(appId), 1000); }
   }
   ```
5. **Asynchronous Handlers**: Event callbacks can be `async`. Use `await w.withBusyState(...)` when executing network or file requests.

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

<a id="menus-and-context-menus"></a>
## 15. 📋 Desktop Menu Bar, Toolbars & Context Menus

SimpleGUI provides desktop-grade application menus and context menus with cascade navigation, keyboard shortcuts, and custom right-click actions:

```typescript
// 1. Top Application Menu Bar (cascading dropdowns + shortcuts)
win.addMenuBar("main_menu", [
    {
        label: "File",
        items: [
            "📄 New File  ⌘N",
            "📂 Open File...  ⌘O",
            "---",
            "💾 Save  ⌘S",
            "🚪 Exit App  ⌘Q"
        ]
    },
    {
        label: "Edit",
        items: [
            "↩️ Undo  ⌘Z",
            "↪️ Redo  ⌘⇧Z",
            "---",
            "✂️ Cut  ⌘X",
            "📋 Copy  ⌘C",
            "📄 Paste  ⌘V"
        ]
    },
    {
        label: "Tools",
        items: [
            "🧹 Format Document  ⌥⇧F",
            "🩺 Diagnostics",
            "⚙️ Preferences...  ⌘,"
        ]
    }
]);

// Handle menu item selections
win.onClick("main_menu", (w, item) => {
    console.log(`Menu clicked: ${item}`);
    if (item === "File > 🚪 Exit App  ⌘Q") w.close();
});

// 2. Application Quick Toolbar
win.addToolBar("main_tb", ["📄 New", "📂 Open", "💾 Save", "🧪 Test", "⚙️ Settings"]);
win.onClick("main_tb", (w, action) => {
    console.log(`Toolbar clicked: ${action}`);
});

// 3. Global Canvas Context Menu (triggers on right-click anywhere on canvas)
win.setGlobalContextMenu([
    "🔄 Refresh Workspace",
    "📋 Copy Coordinates",
    "🎨 Switch Theme",
    "---",
    "⚙️ Preferences..."
]);
win.onGlobalContextMenu((w, action) => {
    console.log(`Global context menu action: ${action}`);
});

// 4. Control-Specific Right-Click Context Menus
win.addCodeStudio("editor.ts", "console.log('Hello World');", "typescript")
    .contextMenu([
        "⚡ Format Code",
        "📋 Copy All",
        "---",
        "🚀 Run with Bun"
    ], (w, action) => {
        console.log(`Editor context action: ${action}`);
    });

win.addTextInput("Enter text...", "Quick brown fox")
    .id("txt_input")
    .contextMenu([
        "✂️ Cut  ⌘X",
        "📋 Copy  ⌘C",
        "📄 Paste  ⌘V",
        "---",
        "🔤 UPPERCASE",
        "🔡 lowercase",
        "🧹 Clear"
    ], (w, action) => {
        const val = w.getValue("txt_input") || "";
        if (action.includes("UPPERCASE")) w.setValue("txt_input", val.toUpperCase());
        else if (action.includes("lowercase")) w.setValue("txt_input", val.toLowerCase());
        else if (action.includes("Clear")) w.setValue("txt_input", "");
    });

// 5. In-Canvas Standalone Menus
win.addPopupMenu("pm_actions", ["Build Binary", "Run Tests", "Package App"]);
win.addSplitButton("🚀 Deploy", ["Deploy to Staging", "Deploy to Prod", "Rollback"]);
win.addPullDown("pd_export", ["Export JSON", "Export CSV", "Export PDF"]);
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



## Dialogs (SweetAlert2-style)

Every dialog method takes an optional **trailing callback** and also returns a Promise. Inside window event handlers use the callback form (`await` is not reliable while the webview loop is running).

```ts
win.fire("Saved!", "Your file was saved.", "success");                       // title, text, icon
win.fire({ title: "Delete?", icon: "warning", showCancelButton: true, showDenyButton: true,
           confirmButtonText: "Delete", confirmButtonColor: "#dc2626" },
         (r) => { if (r.isConfirmed) {/* ... */} else if (r.isDenied) {/* ... */} });
win.confirm("Proceed?", "Confirm", (ok) => {});
win.prompt("Name?", "default", "Title", (value /* null when cancelled */) => {});
win.inputDialog("email", "Your email", { validate: "email" }, (v) => {});     // text email password number textarea select radio checkbox range file date color ...
win.selectDialog("Pick one", { a: "Apple", b: "Banana" }, (v) => {});
win.queueDialogs([{ title: "Step 1" }, { title: "Step 2", input: "text" }], (out) => {});
win.toast("Copied", 2000, "success");  win.toast({ title: "Hi", icon: "info", position: "bottom-end", timer: 3000 });
win.showLoading("Working..."); win.closeDialog();
win.dialogs.mixin({ confirmButtonColor: "#0ea5e9" })                          // reusable defaults (like Swal.mixin)
```

**File dialogs** — native OS dialog first; the in-webview picker opens only when the native dialog is *unavailable* (cancel never opens a second dialog). Force it with `native: "never"`.

```ts
win.openFile({ title: "Open", filter: "ts,json" }, (path /* null if cancelled */) => {});
win.openFiles({ native: "never" }, (paths) => {});   win.saveFile({ defaultName: "report.md" }, cb);   win.openFolder({}, cb);
```

## Enterprise components (MUI/Ant-style, only what SimpleGUI did not already have)

Demo: `bun run demos/27_enterprise_components_demo.ts`. All helpers accept `{ id, width, height, onChange, onClick }`.

| Group | Methods |
| --- | --- |
| Feedback / surfaces | `skeleton`, `paper`, `emptyState`, `result`, `backdrop` (+`showBackdrop`/`hideBackdrop`) |
| Navigation | `appBar`, `bottomNav`, `fab`, `speedDial`, `backToTop`, `scrollProgress`, `drawer` (+`openDrawer`/`closeDrawer`/`toggleDrawer`), `popover`, `hoverCard`, `popconfirm`, `tour` (+`startTour`), `anchorLinks` |
| Inputs | `autocomplete` (multi / free-solo / groups), `cascader`, `treeSelect`, `mentions`, `signaturePad`, `richText`, `copyButton`, `loadingButton` (+`setLoading`) |
| Data display | `chips`, `avatarGroup`, `descriptions`, `statistic`, `countdown`, `watermark`, `masonry`, `imageCompare`, `marquee`, `typography`, `virtualList` |

`win.ui("<type>", cfg)` is the generic entry point and `win.uiCall(id, method, ...args)` calls a component method at runtime.
