# 🎨 SimpleGUI Module API Reference

The `simplegui` module (`src/simplegui.ts` / exported via `index.ts`) provides a lightweight, fluent declarative GUI API matching `vlang_simplegui` for building native cross-platform desktop applications in TypeScript and Bun.

---

## 📑 Table of Contents

1. [Quick Start Example](#1-quick-start-example)
2. [Window Initialization & Options](#2-window-initialization--options)
3. [Layout Systems & Containers](#3-layout-systems--containers)
4. [Control Builder Reference](#4-control-builder-reference)
5. [Fluent Property Chaining (`SimpleControlRef`)](#5-fluent-property-chaining-simplecontrolref)
6. [Ergonomics & Beginner Shortcuts API (Parity with `ergonomics.v`)](#6-ergonomics--beginner-shortcuts-api-parity-with-ergonomicsv)
   - [6.1 Dialog & Popup Shortcuts](#61-dialog--popup-shortcuts)
   - [6.2 Batch Control Operations](#62-batch-control-operations)
   - [6.3 Value Accessors & Modifiers](#63-value-accessors--modifiers)
   - [6.4 Dynamic List Box & Item Management](#64-dynamic-list-box--item-management)
   - [6.5 Async Busy State & Status Handler (`withBusyState`)](#65-async-busy-state--status-handler-withbusystate)
   - [6.6 JSON Settings Persistence](#66-json-settings-persistence)
7. [Typed Accessor & Form Values API](#7-typed-accessor--form-values-api)
8. [In-Window Glassmorphic Modal Dialogs](#8-in-window-glassmorphic-modal-dialogs)
9. [Window Controls, Themes & Lifecycle](#9-window-controls-themes--lifecycle)
10. [Non-Visual Controls & Timers](#10-non-visual-controls--timers)
11. [System & OS Path Helpers](#11-system--os-path-helpers)
12. [Control Inspection & Debug Helpers](#12-control-inspection--debug-helpers)
13. [Built-In Themes Specification](#13-built-in-themes-specification)
14. [Complete Application Example](#14-complete-application-example)

---

## 1. Quick Start Example

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Create a SimpleGUI window
const win = simplegui.createWindow("Quickstart App", 760, 520, {
    theme: "apple_dark"
});

// 2. Add header label
win.addLabel("⚡ Welcome to SimpleGUI").font(20, "#38bdf8", "700");

// 3. Group controls inside a Card container with a Horizontal Row layout
win.beginCard("User Authentication");
win.beginRow();
win.addLabel("Username:").width(90);
win.addTextInput("e.g. alex_mercer").id("txtUser").width(240);
win.endRow();

win.beginRow();
win.addLabel("Password:").width(90);
win.addPasswordInput("••••••••").id("txtPass").width(240);
win.endRow();
win.endCard();

// 4. Action Button with Event Callback
win.addButton("🚀 Login", (w) => {
    const user = w.getText("txtUser") || "Guest";
    w.info("Login Success", `Welcome back, ${user}!`);
}).bg("#0284c7").color("#ffffff").bold().width(140).height(38);

// 5. Run the native window event loop
win.run();
```

---

## 2. Window Initialization & Options

SimpleGUI provides three equivalent factory functions for creating a `SimpleWindow`:

```typescript
import { createWindow, newWindow, new_simple_window } from "bun_rad_studio";

// Standard creation with options object
const win1 = createWindow("App Title", 800, 600, {
    theme: "apple_dark",
    padding: 20,
    spacing: 12,
    alwaysOnTop: false
});

// Parity factory aliases matching vlang_simplegui
const win2 = newWindow("App Title", 800, 600);
const win3 = new_simple_window("App Title", 800, 600);
```

### `SimpleWindowOptions` Specification

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `"SimpleGUI Application"` | Window title bar text |
| `width` | `number` | `800` | Initial window width in pixels |
| `height` | `number` | `600` | Initial window height in pixels |
| `theme` | `string` | `"apple_dark"` | Active color theme name |
| `background_color` | `string` | Theme default | Custom canvas background CSS color |
| `font_color` | `string` | Theme default | Custom primary text CSS color |
| `padding` | `number` | `20` | Canvas edge padding in pixels |
| `spacing` | `number` | `12` | Default spacing between controls |
| `alwaysOnTop` | `boolean` | `false` | Pins window above all other desktop windows |

---

## 3. Layout Systems & Containers

SimpleGUI features 5 distinct layout paradigms for organizing controls:

### 1. Default Vertical Flow
Controls added sequentially outside container frames automatically stack top-to-bottom with consistent `spacing`.

### 2. Horizontal Row Flex Layout (`beginRow` / `endRow`)
Aligns controls side-by-side horizontally across the container and auto-calculates row height.

```typescript
win.beginRow();
win.addLabel("Search:").width(60);
win.addTextInput("Type keywords...", (w, val) => console.log("Search query:", val)).id("txtSearch").width(240);
win.addDropdown(["All", "Code", "Docs"], "All").id("cmbCategory").width(140);
win.addButton("🔍 Search", (w) => { ... }).width(100);
win.endRow();
```

### 3. Multi-Column Grid Layout (`beginGrid` / `endGrid`)
Calculates column cell widths dynamically and wraps controls automatically into a multi-column grid matrix.

```typescript
// 3-Column Grid with 16px gap between cells
win.beginGrid(3, 16);

win.addTextInput("Item 1").id("g1");
win.addTextInput("Item 2").id("g2");
win.addTextInput("Item 3").id("g3");
win.addDropdown(["Opt A", "Opt B"], "Opt A").id("g4"); // Wraps to row 2
win.addSwitch("Enable Switch", true).id("g5");
win.addButton("⚡ Action").bg("#059669");

win.endGrid();
```

### 4. Group Card Containers (`beginCard` / `endCard`)
Wraps controls inside a visual card with rounded corners, translucent background, and a header title.

```typescript
win.beginCard("👤 Developer Profile");
win.addTextInput("Full Name", "Ada Lovelace").id("txtName");
win.addTextInput("Email Address", "ada@lovelace.org").id("txtEmail");
win.endCard(); // Auto-calculates container height based on contained controls
```

### 5. Absolute Pixel Positioning (`.at(x, y)` / `.pos(x, y)`)
Positions a control at exact pixel coordinates `(x, y)` when custom layout placement is needed.

```typescript
win.addButton("Floating Button").at(680, 20).size(120, 36);
```

---

## 4. Control Builder Reference

SimpleGUI control builders support flexible parameter overloads (allowing callbacks `(win, val) => void` or options objects to be passed flexibly as 2nd or 3rd arguments).

| Method | Return Type | Overload Signatures & Description |
| --- | --- | --- |
| `win.addLabel(text, opts?)` | `SimpleControlRef` | Adds a text label |
| `win.addButton(text, onClick?, opts?)` | `SimpleControlRef` | Adds a clickable button |
| `win.addTextInput(placeholder?, initialValue \| onChange?, opts?)` | `SimpleControlRef` | Adds a text input (accepts initial text or `onChange` callback) |
| `win.addPasswordInput(placeholder?, opts?)` | `SimpleControlRef` | Adds a masked password input field |
| `win.addTextArea(placeholder?, initialValue?, opts?)` | `SimpleControlRef` | Adds a multi-line text area input field |
| `win.addDropdown(items, selected \| onChange?, onChange \| opts?, opts?)` | `SimpleControlRef` | Adds a dropdown selection menu |
| `win.addListBox(items, selected \| onChange?, onChange \| opts?, opts?)` | `SimpleControlRef` | Adds a multi-row scrollable listbox control |
| `win.addCheckbox(text, checked?, onChange?, opts?)` | `SimpleControlRef` | Adds a labeled checkbox toggle |
| `win.addRadioButton(text, checked?, onChange?, opts?)` | `SimpleControlRef` | Adds a radio option button |
| `win.addSwitch(text, checked?, onChange?, opts?)` | `SimpleControlRef` | Adds an iOS/macOS styled toggle switch |
| `win.addSlider(min, max, value, onChange?, opts?)` | `SimpleControlRef` | Adds a numerical range slider meter |
| `win.addStepper(min, max, value, onChange?, opts?)` | `SimpleControlRef` | Adds a numerical stepper input with inc/dec buttons |
| `win.addProgressBar(value, max?, opts?)` | `SimpleControlRef` | Adds a horizontal progress bar indicator |
| `win.addBadge(text, variant?, opts?)` | `SimpleControlRef` | Adds a status pill badge (`success`, `warning`, `info`, `error`) |
| `win.addTable(headers, rows, onSelect?, opts?)` | `SimpleControlRef` | Adds an interactive multi-column data table |
| `win.addTreeView(nodes, onSelect?, opts?)` | `SimpleControlRef` | Adds a collapsible hierarchical file tree view |
| `win.addCodeView(codeText, language?, opts?)` | `SimpleControlRef` | Adds a syntax-highlighted code editor panel |
| `win.addDatePicker(initialDate?, onChange?, opts?)` | `SimpleControlRef` | Adds a date selection picker field |
| `win.addTimePicker(initialTime?, onChange?, opts?)` | `SimpleControlRef` | Adds a time selection picker field |
| `win.addColorWell(initialColor?, onChange?, opts?)` | `SimpleControlRef` | Adds a color picker well with hex code display |
| `win.addSegmentedControl(items, selectedIndex?, onChange?, opts?)` | `SimpleControlRef` | Adds a horizontal segmented option picker |
| `win.addDivider(opts?)` | `SimpleControlRef` | Adds a horizontal section divider line |

---

## 5. Fluent Property Chaining (`SimpleControlRef`)

Every control builder returns a `SimpleControlRef` instance supporting rich method chaining:

```typescript
win.addButton("🚀 Submit Profile", (w) => { ... })
    .id("btnSubmit")
    .width(180)
    .height(40)
    .font(14, "#ffffff", "700")
    .bg("#0284c7")
    .bold()
    .tooltip("Click to save your profile settings")
    .enabled(true);
```

### Reference Chain Methods

| Method | Arguments | Description |
| --- | --- | --- |
| `.id(idStr)` | `string` | Assigns a custom unique ID for direct lookup |
| `.width(w)` | `number` | Sets explicit width in pixels |
| `.height(h)` | `number` | Sets explicit height in pixels |
| `.size(w, h)` | `number, number` | Sets explicit width and height |
| `.at(x, y)` / `.pos(x, y)` | `number, number` | Sets explicit `(x, y)` top-left positioning |
| `.bg(color)` | `string` | Sets custom CSS background color |
| `.color(color)` | `string` | Sets text font color |
| `.font(size, color?, weight?)` | `number, string?, string?` | Configures font size, color, and weight |
| `.bold(flag?)` | `boolean` | Toggles bold font weight (`700`) |
| `.italic(flag?)` | `boolean` | Toggles italic font style |
| `.align(mode)` | `"left" \| "center" \| "right"` | Sets text alignment |
| `.tooltip(hint)` | `string` | Sets hover tooltip text |
| `.placeholder(ph)` | `string` | Sets input placeholder text |
| `.enabled(flag)` / `.enable()` / `.disable()` | `boolean` | Enables or disables control interaction |
| `.disabled(flag?)` | `boolean` | Concise inverse helper for `.enabled(!flag)` |
| `.readOnly(flag?)` | `boolean` | Sets read-only mode for input/textarea controls |
| `.visible(flag)` / `.show()` / `.hide()` | `boolean` | Shows or hides the control |
| `.focus()` | `()` | Moves keyboard focus to this control |
| `.flash()` | `()` | Flashes a temporary blue outline highlight |
| `.highlight(durationMs?)` | `number?` | Highlights control with blue box-shadow ring |
| `.increment(delta?)` | `number?` | Increments numerical control value |
| `.toggleChecked()` | `()` | Flashes boolean state for checkbox or switch |
| `.value(val?)` | `any?` | Getter/Setter overload (`.value()` reads, `.value(x)` sets) |
| `.text(txt?)` | `string?` | Getter/Setter overload (`.text()` reads, `.text(x)` sets) |
| `.options(items)` | `string[]` | Updates options list for dropdowns and listboxes |
| `.min(val)` / `.max(val)` / `.step(val)` | `number` | Updates slider or stepper boundaries |
| `.appendText(text)` | `string` | Appends text to control |
| `.appendLine(line)` | `string` | Appends new line of text to textarea or label |
| `.onClick(handler)` | `(win, val) => void` | Binds click event callback |
| `.onChange(handler)` | `(win, val) => void` | Binds change event callback |
| `.onHover(handler)` / `.onHoverExit(handler)` | `(win, val) => void` | Binds mouse enter/leave event callbacks |
| `.getValue()` / `.setValue(val)` | `(val: any)` | Reads or updates control value dynamically |
| `.getText()` / `.setText(text)` | `(text: string)` | Reads or updates text label dynamically |

---

## 6. Ergonomics & Beginner Shortcuts API (Parity with `ergonomics.v`)

SimpleGUI includes a comprehensive ergonomics layer ported directly from `vlang_simplegui/simplegui/ergonomics.v`.

### 6.1 Dialog & Popup Shortcuts

```typescript
// Info Alert Popup
win.info("Profile Updated", "Your changes have been saved successfully!");
win.info("Operation Complete"); // Uses default "Information" title

// Warning Alert Popup with ⚠️ Icon
win.warn("Low Disk Space", "Available storage is below 5%");

// Error Alert Popup with ❌ Icon
win.errorDialog("Database Connection Failed", "Unable to reach remote host");
win.error("Unexpected error occurred"); // Parity alias

// Confirmation Dialog
if (win.ask("Do you want to overwrite existing settings?", "Confirm Overwrite")) {
    console.log("User confirmed overwrite");
}

// Immediate Quit & Terminate Process
win.quit(); // Closes window and exits app process (alias of win.exit())
```

### 6.2 Batch Control Operations

Operate on multiple controls simultaneously in a single clean method call:

```typescript
// Enable & Disable Control Groups
win.disableControls(["txtName", "txtEmail", "btnSave"]);
win.enableControls(["txtName", "txtEmail", "btnSave"]);

// Enable or Disable All Registered Controls
win.disableAllControls(); // e.g. while processing a long background task
win.enableAllControls();  // Restore when task finishes
win.enableAll();          // Concise alias
win.disableAll();         // Concise alias

// Show & Hide Control Groups
win.hideControls(["lblSecret", "txtSecretKey"]);
win.showControls(["lblSecret", "txtSecretKey"]);

// Toggle States Dynamically
const isVisible = win.toggleVisible("txtPassword"); // Flips visibility & returns new state
const isEnabled = win.toggleEnabled("btnSubmit");   // Flips enabled state & returns new state
win.toggleControlsVisible(["panel1", "panel2"]);
win.toggleControlsEnabled(["btnStep1", "btnStep2"]);

// Flash & Highlight Controls for User Attention
win.flashControl("txtApiKey");                       // 150ms outline flash
win.flashControls(["txtUser", "txtPass"]);
win.highlightControl("txtRequiredField", 2000);       // Glows with focus ring for 2000ms
win.highlightControls(["f1", "f2"], 1500);

// Batch Value Assignment & Retrieval
win.setAll({
    txtName: "Ada Lovelace",
    txtEmail: "ada@algorithm.org",
    cmbRole: "Lead Engineer"
});

const values = win.getAll(["txtName", "txtEmail", "cmbRole"]);
// Returns: { txtName: "Ada Lovelace", txtEmail: "...", cmbRole: "..." }
```

### 6.3 Value Accessors & Modifiers

Convenient helper methods for modifying values directly on controls without boilerplate:

```typescript
// Increment & Decrement Numerical Controls
const nextVal = win.increment("numCount", 1);  // Adds 1 (or custom delta) and returns new value
win.increment("numScore", -5);                 // Decrements score by 5

// Toggle Checkbox & Switch Controls
const isChecked = win.toggleChecked("chkNotify"); // Flips boolean state & returns new state

// Append Text & Append Line (Great for logs)
win.appendText("txtLog", "Processing item #42...");
win.appendLine("txtActivityLog", "[12:45:00] User logged in");

// Typed Batch Value Operations
win.setManyTexts({ lblStatus: "Ready", txtInput: "Hello" });
win.getManyTexts(["lblStatus", "txtInput"]);

win.setManyChecked({ chkOpt1: true, chkOpt2: false });
win.getManyChecked(["chkOpt1", "chkOpt2"]);

win.setManyNumbers({ numVolume: 80, sldBrightness: 100 });
win.getManyNumbers(["numVolume", "sldBrightness"]);

win.setManyVisibility({ panelAdmin: true, panelGuest: false });
win.setManyEnabled({ btnExport: true, btnImport: false });
win.setManyPlaceholders({ txtUser: "Enter Username", txtPass: "Enter Password" });
win.setManyTooltips({ btnSave: "Saves profile to disk" });

// Focus Management
win.setFocus("txtSearchInput");
win.focus("txtSearchInput");
```

### 6.4 Dynamic List Box & Item Management

SimpleGUI provides built-in list box item management methods for dropdowns, listboxes, and segmented controls:

```typescript
win.addDropdown(["Apple", "Banana", "Cherry"], "Apple").id("cmbFruits");

// Read and Update Items
const items = win.getListItems("cmbFruits"); // ["Apple", "Banana", "Cherry"]
const count = win.getListCount("cmbFruits"); // 3

// Add and Remove Items
win.addListItem("cmbFruits", "Dragonfruit");
win.removeListItem("cmbFruits", 0); // Removes "Apple"
win.clearListItems("cmbFruits");   // Clears all options
win.setListItems("cmbFruits", ["Mango", "Peach", "Plum"]); // Replaces all options

// Selection Helpers
const selectedText = win.getListSelectedText("cmbFruits"); // "Mango"
win.removeSelectedListItem("cmbFruits"); // Removes currently selected item

// Multi-Select List Box Operations
win.setListMultiSelect("cmbFruits", true);
win.selectAllListItems("cmbFruits");
win.clearListSelection("cmbFruits");
const selectedTexts = win.getListSelectedTexts("cmbFruits");
const selectedIndexes = win.getListSelectedIndexes("cmbFruits");
win.setListSelectedIndexes("cmbFruits", [0, 2]);
const removedItems = win.removeSelectedListItems("cmbFruits"); // Removes and returns selected items

// Double Click Event Listener
win.onListDoubleClick("cmbFruits", (w, val) => {
    w.info("Double Clicked", `Selected item index: ${val}`);
});
```

### 6.5 Async Busy State & Status Handler (`withBusyState`)

Automatically manage loading states during asynchronous background operations with full `Promise<this>` support:

```typescript
// Sets window status message
win.setStatus("Syncing database records...");

// Run a background task with automatic temporary control disable and status restoration
await win.withBusyState(["btnSync", "txtDbUrl", "cmbCluster"], "Syncing data...", async (w) => {
    // Controls in the array are automatically disabled during execution
    await w.sleep(2000);
    w.info("Sync Complete", "All records updated successfully!");
});
// Controls are automatically re-enabled and status text restored upon promise resolution!
```

### 6.6 JSON Settings Persistence

Easily export and restore application state to/from disk in standard JSON format:

```typescript
// Save all form values to a JSON settings file on disk
win.saveValuesToFile("/Users/developer/.app_settings.json");

// Restore form values from JSON file (missing fields are safely ignored)
win.loadValuesFromFile("/Users/developer/.app_settings.json");
```

---

## 7. Typed Accessor & Form Values API

### Form Batch Operations

```typescript
// Read all form inputs as a key-value object
const formData = win.getFormValues();
// Returns: { txtName: "Alex", cmbPlan: "Pro", swtNotify: true }

// Bulk update form values
win.setFormValues({
    txtName: "Sarah Connor",
    cmbPlan: "Enterprise"
});

// Clear/reset all input controls back to defaults
win.clearForm();
win.resetForm(); // Alias

// Clear specific input fields
win.clearInput("txtName");
win.clearInputs(["txtName", "txtEmail"]);
```

### Typed Getters & Setters

```typescript
// String Accessors
const textVal: string = win.getText("txtName");
win.setText("txtName", "New Value");

// Boolean Accessors
const isChecked: boolean = win.getBool("swtEnable");
win.setBool("swtEnable", true);

// Integer Accessors
const age: number = win.getInt("numAge");
win.setInt("numAge", 30);

// Floating Point Accessors
const price: number = win.getFloat("numPrice");
win.setFloat("numPrice", 99.95);

// Parity Snake Case Aliases (vlang_simplegui)
win.get_text("txtName");
win.set_text("txtName", "New Value");
win.get_value("txtName");
win.set_value("txtName", "New Value");
win.get_bool("swtEnable");
win.set_bool("swtEnable", true);
win.get_int("numAge");
win.set_int("numAge", 30);
win.get_float("numPrice");
win.set_float("numPrice", 99.95);
```

---

## 8. In-Window Glassmorphic Modal Dialogs

SimpleGUI renders non-blocking, glassmorphic modal dialogs inside the webview canvas:

```typescript
// 1. Alert Box
win.showAlert("Your profile has been saved successfully!", "Success");
// Ergonomic shortcuts
win.info("Changes applied.", "Success");
win.warn("Caution: Unsaved changes", "Warning");
win.error("Failed to connect", "Error");

// 2. Confirm Box
win.showConfirm("Are you sure you want to exit?", "Confirm Exit");
// Ergonomic ask shortcut
if (win.ask("Proceed with deletion?", "Confirm Delete")) { ... }

// 3. Prompt Input Box (Async / Await)
const apiKey = await win.showPrompt("Please enter your API Key:", "sk-test-12345", "Configuration Required");
if (apiKey) {
    console.log("Entered API Key:", apiKey);
}
```

---

## 9. Window Controls, Themes & Lifecycle

### Window Lifecycle & Process Exit

| Function / Method | Signature | Description |
| --- | --- | --- |
| `win.close()` | `() => void` | Closes window frame (`webview.destroy()`) without exiting Bun process |
| `win.close_window()` | `() => void` | Alias for `win.close()` |
| `win.exit(code?)` | `(code?: number) => void` | Terminates process immediately (`process.exit(code)`) |
| `win.quit(code?)` | `(code?: number) => void` | Alias for `win.exit()` |
| `win.exitApp(code?)` | `(code?: number) => void` | Alias for `win.exit()` |
| `win.exit_app(code?)` | `(code?: number) => void` | Alias for `win.exit()` |

### Window Customization & Positioning

```typescript
// Toggle window always-on-top pin state
win.setAlwaysOnTop(true);

// Toggle desktop fullscreen mode
win.toggleFullscreen();

// Dynamically change active color theme
win.setTheme("catppuccin");
win.set_theme("midnight");

// Check running state
if (win.isRunning()) {
    console.log("Window event loop active");
}
```

---

## 10. Non-Visual Controls & Timers

Add background timers that fire periodic callbacks to update UI widgets dynamically:

```typescript
// Fired every 1000ms (1 second)
const timerRef = win.addTimer(1000, (w) => {
    const timeStr = new Date().toLocaleTimeString();
    w.setText("lblClock", `⏰ System Time: ${timeStr}`);
}, { id: "clockTimer" });

// Remove timer loop
win.removeTimer("clockTimer");

// Parity interval alias
win.addInterval(500, (w) => { ... });
```

---

## 11. System & OS Path Helpers

Utility functions for accessing cross-platform system directories and desktop clipboard:

```typescript
import { homeDir, tempDir, desktopDir, documentsDir, downloadsDir } from "bun_rad_studio";

console.log("User Home:", homeDir());          // e.g. "/Users/developer"
console.log("Temp Directory:", tempDir());     // e.g. "/tmp"
console.log("Desktop Directory:", desktopDir()); // e.g. "/Users/developer/Desktop"
console.log("Documents Directory:", documentsDir());
console.log("Downloads Directory:", downloadsDir());

// System Clipboard Integration
win.copyToClipboard("Text copied to desktop clipboard!");
```

---

## 12. Control Inspection & Debug Helpers

Inspect and validate controls at runtime:

```typescript
// Check if a control exists by ID
if (win.hasControl("btnSubmit")) {
    console.log("Submit button found");
}

// List all registered control IDs in window
const ids: string[] = win.listControls();

// Get kind/type string of a control
const kind: string = win.getControlKind("txtUser"); // "input"

// Require control (throws error if missing)
win.requireControl("txtUser");

// Enable debug logging mode
win.setDebugMode(true);
```

---

## 13. Built-In Themes Specification

SimpleGUI includes 17 curated desktop theme palettes:

| Theme Key | Display Name | Type | Description |
| --- | --- | --- | --- |
| `apple_dark` | Apple Dark | Dark | macOS Dark Mode surface (Default) |
| `apple_light` | Apple Light | Light | Clean macOS Aqua light canvas |
| `midnight` | Midnight Space Gray | Dark | Pro dark titanium space gray theme |
| `sonoma_emerald` | Sonoma Emerald | Dark | macOS Sonoma dark forest glass palette |
| `ventura_amber` | Ventura Amber | Dark | macOS Ventura golden sunset dark hues |
| `apple_sunset` | Apple Sunset | Dark | Warm macOS Mojave twilight sunset hues |
| `catppuccin` | Catppuccin Mocha | Dark | Soothing lavender catppuccin dark mode |
| `nord` | Nord | Dark | Arctic frost nord developer palette |
| `dracula` | Dracula | Dark | High-contrast vampire purple palette |
| `cyberpunk` | Cyberpunk | Dark | Neon glow dark contrast palette |
| `github_dark` | GitHub Dark | Dark | Official GitHub dark interface palette |
| `github_light` | GitHub Light | Light | Clean GitHub light canvas palette |
| `navy_blue` | Navy Blue | Dark | Deep slate navy dark theme |
| `forest_green` | Forest Green | Dark | Rich emerald green dark theme |
| `soft_pastel` | Soft Pastel | Light | Apple Studio warm soft light theme |
| `solarized_dark` | Solarized Dark | Dark | Precision engineered dark palette |
| `solarized_light` | Solarized Light | Light | Precision engineered light palette |

---

## 14. Complete Application Example

```typescript
import { simplegui } from "bun_rad_studio";

const win = simplegui.createWindow("SimpleGUI Developer Studio", 880, 680, {
    theme: "apple_dark"
});

// Title Section
win.addLabel("⚡ SimpleGUI Production Desktop App")
    .font(20, "#38bdf8", "700");

win.addLabel("Declarative UI application with multi-column grid containers and interactive form validation.")
    .font(12, "#94a3b8");

win.addDivider();

// Multi-Column Grid Layout
win.beginGrid(2, 16);

// Column 1 Card: User Details
win.beginCard("👤 User Account Details");

win.beginRow();
win.addLabel("Full Name:").width(100);
win.addTextInput("e.g. Alex Mercer").id("txtName").width(240);
win.endRow();

win.beginRow();
win.addLabel("Email:").width(100);
win.addTextInput("alex@example.com").id("txtEmail").width(240);
win.endRow();

win.beginRow();
win.addLabel("Role:").width(100);
win.addSegmentedControl(["Developer", "Designer", "Manager"], 0).id("segRole").width(240);
win.endRow();

win.endCard();

// Column 2 Card: Application Settings
win.beginCard("⚙️ System Preferences");

win.beginRow();
win.addLabel("Theme:").width(100);
win.addDropdown(["apple_dark", "apple_light", "midnight", "nord"], "apple_dark").id("cmbTheme").width(220);
win.endRow();

win.beginRow();
win.addLabel("Telemetry:").width(100);
win.addSwitch("Enable Live Reporting", true).id("swtTelemetry");
win.endRow();

win.beginRow();
win.addLabel("Volume:").width(100);
win.addSlider(0, 100, 80).id("sldVol").width(200);
win.endRow();

win.endCard();

win.endGrid();

// Status Bar & Action Controls
win.beginCard("Live Telemetry & Actions");
win.beginRow();
win.addBadge("SYSTEM ONLINE", "success").width(130);
win.addBadge("IPC CONNECTED", "info").width(130);
const lblTime = win.addLabel("System Time: Initializing...").id("lblTime").font(13, "#38bdf8", "600").width(300);
win.endRow();

// Non-visual live clock timer
win.addTimer(1000, (w) => {
    w.setText("lblTime", `⏰ System Time: ${new Date().toLocaleTimeString()}`);
});
win.endCard();

// Footer Buttons with Ergonomic Helper Usage
win.beginRow();
win.addButton("🚀 Submit Form", async (w) => {
    await w.withBusyState(["txtName", "txtEmail"], "Submitting Form...", async (winApp) => {
        const vals = winApp.getFormValues();
        const name = vals.txtName || "Guest";
        winApp.info("Form Submission", `Submitted profile for: ${name}\nTheme: ${vals.cmbTheme}`);
    });
}).bg("#0284c7").color("#ffffff").bold().width(160).height(38);

win.addButton("🎨 Change Theme", (w) => {
    const selectedTheme = w.getValue("cmbTheme") || "apple_light";
    w.setTheme(selectedTheme);
}).bg("#475569").color("#ffffff").width(150).height(38);

win.addButton("❌ Exit App", (w) => {
    w.quit();
}).bg("#dc2626").color("#ffffff").bold().width(120).height(38);
win.endRow();

// Launch Event Loop
win.run();
```
