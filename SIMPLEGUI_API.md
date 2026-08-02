# 🎨 SimpleGUI Beginner-Friendly API Guide & Reference

Welcome to **SimpleGUI**! SimpleGUI is a lightweight, fluent, and beginner-friendly toolkit for building modern desktop applications in TypeScript and Bun. Designed with zero-boilerplate ergonomics, SimpleGUI lets you build responsive, beautifully styled cross-platform desktop interfaces in minutes.

---

## 📑 Table of Contents

1. [🐣 5-Minute Quick Start](#1--5-minute-quick-start)
2. [🧠 SimpleGUI Architecture & Mental Model](#2--simplegui-architecture--mental-model)
3. [🪟 1. Window Creation & Configuration](#3-1-window-creation--configuration)
4. [📐 2. Layout & Container Systems](#4-2-layout--container-systems)
5. [🔗 3. Fluent Method Chaining & Styling (`SimpleControlRef`)](#5-3-fluent-method-chaining--styling-simplecontrolref)
6. [🎛️ 4. Standard Controls Reference](#6-4-standard-controls-reference)
7. [📝 5. Compound Labeled Form Field Builders](#7-5-compound-labeled-form-field-builders)
8. [📊 6. Modern Desktop & Analytics Dashboard Controls](#8-6-modern-desktop--analytics-dashboard-controls)
9. [📋 7. Form State, Bulk Reading & File Serialization](#9-7-form-state-bulk-reading--file-serialization)
10. [💬 8. Dialogs, Alerts & In-Window Glass Popups](#10-8-dialogs-alerts--in-window-glass-popups)
11. [⏱️ 9. Async Workflows, Busy States & Timers](#11-9-async-workflows-busy-states--timers)
12. [📂 10. System Directories & Clipboard Utilities](#12-10-system-directories--clipboard-utilities)
13. [🎨 11. Built-in Visual Themes (17 Themes)](#13-11-built-in-visual-themes-17-themes)
14. [💡 12. Beginner's "How Do I...?" Cheat Sheet](#14-12-beginners-how-do-i-cheat-sheet)
15. [🚀 13. Complete Production Studio Application](#15-13-complete-production-studio-application)

---

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

---

## 2. 🧠 SimpleGUI Architecture & Mental Model

SimpleGUI uses a simple, intuitive mental model to construct desktop application interfaces:

```
┌────────────────────────────────────────────────────────┐
│ 🪟 SimpleWindow (Desktop Canvas Window)                │
│  ├─ 📐 Layout Systems (Rows, Grids, Cards, Containers) │
│  ├─ 🎛️ Controls (Buttons, Inputs, Tables, Charts)      │
│  ├─ 🔗 Fluent Chaining (.width(), .bg(), .id(), etc.)   │
│  └─ ⚡ Event Handlers & Data Accessors                 │
└────────────────────────────────────────────────────────┘
```

1. **The Window (`SimpleWindow`)**: The container representing your native desktop webview window.
2. **Layouts (`beginRow`, `beginCard`, `beginGrid`)**: Automatic coordinate generators that group and position controls without requiring manual X/Y calculations.
3. **Control Identifiers (`.id("myInput")`)**: Assign unique names to controls so you can query or update their values anywhere in your code.
4. **Method Chaining (`SimpleControlRef`)**: Every control returns a fluent builder object allowing inline configuration of layout, styles, tooltips, and event handlers.

---

## 3. 🪟 1. Window Creation & Configuration

You can instantiate a window using `createWindow`, `newWindow`, or `simplegui.createWindow`.

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

### `SimpleWindowOptions` Specification

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `"SimpleGUI Application"` | Caption shown in window title bar |
| `width` | `number` | `800` | Window canvas width in pixels |
| `height` | `number` | `600` | Window canvas height in pixels |
| `theme` | `string` | `"apple_dark"` | Active visual theme ID |
| `padding` | `number` | `20` | Canvas edge padding margin |
| `spacing` | `number` | `12` | Default vertical spacing between components |
| `alwaysOnTop` | `boolean` | `false` | Floating window pin mode |
| `background_color` | `string` | *(Theme default)* | Custom background HEX color |
| `font_color` | `string` | *(Theme default)* | Custom font HEX color |

### Window State Methods

- `win.setTheme(themeName: string)`: Dynamically updates the application theme at runtime.
- `win.setAlwaysOnTop(onTop: boolean)`: Toggles native window always-on-top level.
- `win.toggleFullscreen()`: Toggles window full-screen mode.
- `win.quit()`: Closes the webview and terminates process execution.

---

## 4. 📐 2. Layout & Container Systems

SimpleGUI offers 5 automatic layout systems:

### 1. Default Vertical Stack
Controls added sequentially outside layout blocks stack vertically top-to-bottom.

```typescript
win.addLabel("Section Header");
win.addTextInput("Standard input field");
```

### 2. Side-by-Side Horizontal Row (`beginRow` / `endRow`)
Positions controls next to each other on a single horizontal line.

```typescript
win.beginRow();
  win.addLabel("Filter:").width(60);
  win.addSearchInput("Type keywords...").id("txtSearch").width(260);
  win.addButton("Search", (w) => console.log(w.getText("txtSearch")));
win.endRow();
```

### 3. Multi-Column Grid (`beginGrid` / `endGrid`)
Automatically arranges controls into fixed equal-width columns.

```typescript
// 3 columns with 16px horizontal spacing gap
win.beginGrid(3, 16);
  win.addTextInput("First Name").id("txtFirst");
  win.addTextInput("Middle Name").id("txtMid");
  win.addTextInput("Last Name").id("txtLast");
  // Wrapping control automatically starts Row 2, Column 1:
  win.addSwitch("Active Account", true).id("swtActive");
win.endGrid();
```

### 4. Styled Container Cards (`beginCard` / `endCard`)
Groups related controls inside a styled visual card box with rounded borders and a header title.

```typescript
win.beginCard("🔒 Security & Access");
  win.addPasswordInput("Current Password").id("txtCurrPass");
  win.addPasswordInput("New Password").id("txtNewPass");
win.endCard();
```

### 5. Absolute Pixel Placement (`.at(x, y)` / `.pos(x, y)`)
Override layout flow for absolute X/Y positioning.

```typescript
win.addButton("❓ Floating Help").at(680, 18).size(90, 32);
```

---

## 5. 🔗 3. Fluent Method Chaining & Styling (`SimpleControlRef`)

Every `add*` control method returns a `SimpleControlRef` instance. Method calls can be chained fluently:

```typescript
win.addButton("🚀 Deploy Application", (w) => console.log("Deploying..."))
    .id("btnDeploy")
    .size(180, 42)
    .bg("#0284c7")
    .color("#ffffff")
    .font(14, "#ffffff", "700")
    .bold()
    .tooltip("Click to publish project to cloud environment")
    .enabled(true);
```

### Method Chaining API Quick Reference

| Method | Parameters | Description |
| --- | --- | --- |
| `.id(idStr)` | `idStr: string` | Sets unique control ID for state lookups |
| `.at(x, y)` / `.pos(x, y)` | `x: number, y: number` | Sets absolute pixel coordinate |
| `.size(w, h)` | `width: number, height: number` | Sets width and height dimensions |
| `.width(w)` | `w: number` | Sets width in pixels |
| `.height(h)` | `h: number` | Sets height in pixels |
| `.bg(color)` | `color: string` | Sets background HEX or CSS color |
| `.color(color)` | `color: string` | Sets foreground text color |
| `.font(size, color?, weight?)` | `size: number, color?: string, weight?: string` | Sets font typography properties |
| `.bold(flag?)` | `isBold?: boolean` | Shortcuts font-weight to 700 |
| `.italic(flag?)` | `isItalic?: boolean` | Shortcuts font-style to italic |
| `.align(alignment)` | `"left" \| "center" \| "right"` | Sets inline text alignment |
| `.tooltip(hint)` | `hint: string` | Sets hover tooltip text |
| `.placeholder(ph)` | `ph: string` | Sets input placeholder text |
| `.enabled(flag?)` | `flag?: boolean` | Toggles component enabled interaction |
| `.visible(flag?)` | `flag?: boolean` | Toggles component visibility |
| `.show()` / `.hide()` | — | Convenience methods for visibility |
| `.enable()` / `.disable()` | — | Convenience methods for interaction |
| `.readOnly(flag?)` | `flag?: boolean` | Sets text field read-only mode |
| `.focus()` | — | Directs browser focus to component |
| `.flash()` | — | Flashes component background accent |
| `.highlight(ms?)` | `durationMs?: number` | Highlights control for specified duration |
| `.onClick(handler)` | `handler: EventCallback` | Registers click event callback |
| `.onChange(handler)` | `handler: EventCallback` | Registers value change callback |
| `.onHover(handler)` | `handler: EventCallback` | Registers mouse hover callback |
| `.onHoverExit(handler)` | `handler: EventCallback` | Registers mouse exit callback |

---

## 6. 🎛️ 4. Standard Controls Reference

### Control Creation Methods

```typescript
// Labels & Text
win.addLabel(text: string, opts?: any): SimpleControlRef;

// Buttons
win.addButton(text: string, onClick?: EventCallback, opts?: any): SimpleControlRef;

// Text Inputs
win.addTextInput(placeholder?: string, initialVal?: string, opts?: any): SimpleControlRef;
win.addPasswordInput(placeholder?: string, opts?: any): SimpleControlRef;
win.addTextArea(placeholder?: string, initialValue?: string, opts?: any): SimpleControlRef;
win.addSearchInput(placeholder?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;

// Toggles & Selection
win.addCheckbox(label: string, checked?: boolean, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addSwitch(label: string, checked?: boolean, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addSegmentedControl(items: string[], selectedIndex?: number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addDropdown(items: string[], selected?: string | number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addListBox(items: string[], selected?: string | number, onChange?: EventCallback, opts?: any): SimpleControlRef;

// Numbers & Sliders
win.addSlider(min?: number, max?: number, value?: number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addStepper(min?: number, max?: number, value?: number, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addProgressBar(value?: number, max?: number, opts?: any): SimpleControlRef;

// Pickers & Status
win.addColorWell(initialColor?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addDatePicker(initialDate?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addTimePicker(initialTime?: string, onChange?: EventCallback, opts?: any): SimpleControlRef;
win.addBadge(text: string, type?: "info" | "success" | "warning" | "error", opts?: any): SimpleControlRef;

// Data & Display
win.addTable(headers: string[], rows: any[][], onSelect?: EventCallback, opts?: any): SimpleControlRef;
win.addTreeView(nodes: any[], onSelect?: EventCallback, opts?: any): SimpleControlRef;
win.addCodeView(code: string, language?: string, opts?: any): SimpleControlRef;
win.addImage(src: string, width?: number, height?: number, opts?: any): SimpleControlRef;
win.addDivider(opts?: any): SimpleControlRef;
```

---

## 7. 📝 5. Compound Labeled Form Field Builders

For high-speed form construction without repetitive row wrapping, SimpleGUI includes built-in compound form field methods (`addForm*`):

```typescript
// Single-line text input with left label
win.addFormField("Full Name:", "txtName", "Jane Doe");

// Multi-line text area with left label
win.addFormTextarea("User Bio:", "txtBio", "TypeScript developer...");

// Masked password field with left label
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

// Labeled hyperlink
win.addFormLink("Documentation:", "lnkDocs", "Visit API Docs", "https://bun.sh");
```

---

## 8. 📊 6. Modern Desktop & Analytics Dashboard Controls

SimpleGUI includes specialized visual components tailored for developer tools, dashboards, and enterprise applications:

```typescript
// Section title with optional subtitle
win.addHeading("System Metrics", "Real-time performance indicators");

// Breadcrumb navigation bar
win.addBreadcrumbs("navBread", ["Home", "Settings", "Security"]);

// Keyboard shortcut recorder control
win.addShortcutRecorder("recHotkey");

// Dynamic SVG Chart (line/bar)
win.addChart("crtAnalytics", "line", 140);

// Circular SVG ring progress
win.addCircularProgress("cprCpu", 78);

// Key-Value Property Inspector Grid
win.addPropertyGrid("gridProps", {
    "OS Platform": "macOS Sonoma",
    "Runtime": "Bun v1.3",
    "Memory Usage": "142 MB"
});

// Interactive Data Grid Table with dynamic row insertion
win.addGridTable("tblLogs", ["Timestamp", "Level", "Message"], [
    ["12:00:01", "INFO", "Server started on port 3000"],
    ["12:00:05", "WARN", "High memory load detected"]
]);

// Terminal / Log Console Output Box
win.addConsole("conOutput", 140);

// Dial Gauge Indicator
win.addGauge("ggeDisk", "Disk Usage", 64);

// Page Navigation Bar
win.addPagination("pagItems", 10, 1);

// Activity Timeline Feed
win.addActivityFeed("feedEvents", 160);
win.addActivityFeedItem("feedEvents", "10:30 AM", "User updated profile photo");

// Markdown Rendering Box
win.addMarkdownView("mdRelease", "# Release v2.0\n- Added fast SQLite engine\n- Fixed webview level");

// Inline Sparkline Graph
win.addSparkline("spkMemory", [10, 25, 40, 35, 60, 55, 80], 30);

// PIN / OTP Code Input
win.addPinCode("pinAuth", 4);

// Swatch Color Palette Picker
win.addColorPalette("palAccent", ["#0284c7", "#10b981", "#f59e0b", "#ef4444"], "#0284c7");
```

---

## 9. 📋 7. Form State, Bulk Reading & File Serialization

SimpleGUI makes state management seamless through automated key-value form maps and disk serialization helpers.

### Reading & Clearing Entire Forms

```typescript
// Returns key-value object map of all form controls in the window
const formData = win.getFormValues();
console.log(formData);
// Output: { txtUser: "alex", txtPass: "secret", swtNotify: true }

// Resets all input boxes, checkboxes, and dropdowns on the screen
win.clearForm();
```

### Strongly Typed Accessors

```typescript
// String Accessors
const username: string = win.getText("txtUser");
win.setText("txtUser", "Alex Mercer");

// Boolean Accessors
const isSubscribed: boolean = win.getBool("swtSubscribe");
win.setBool("swtSubscribe", true);

// Numeric Accessors
const age: number = win.getInt("numAge");
win.setInt("numAge", 28);

const rate: number = win.getFloat("numRate");
win.setFloat("numRate", 99.95);
```

### Batch Operations (`enableControls`, `disableControls`, `setAll`, `getAll`)

```typescript
// Disable multiple controls during async operations
win.disableControls(["txtUser", "txtPass", "btnLogin"]);

// Re-enable controls
win.enableControls(["txtUser", "txtPass", "btnLogin"]);

// Hide or show group of controls
win.hideControls(["panelSecret1", "panelSecret2"]);
win.showControls(["panelSecret1", "panelSecret2"]);

// Batch set multiple values from object map
win.setAll({
    txtUser: "Sarah Connor",
    txtEmail: "sarah@cyberdyne.com",
    cmbRole: "Admin"
});

// Batch retrieve subset of form fields into object map
const data = win.getAll(["txtUser", "txtEmail"]);
```

### File Persistence (`saveValuesToFile` / `loadValuesFromFile`)

Save application settings directly to JSON files on disk with a single command:

```typescript
// Save current form values to local file
win.saveValuesToFile("./user_preferences.json");

// Restore form state from local file
win.loadValuesFromFile("./user_preferences.json");
```

---

## 10. 💬 8. Dialogs, Alerts & In-Window Glass Popups

SimpleGUI provides non-blocking, clean visual dialogs rendered directly over your window canvas.

### Alert Popups

```typescript
// Informational Banner
win.info("Operation Complete", "Your report was generated successfully.");

// Warning Banner
win.warn("Low Disk Space", "Storage remaining is under 5%.");

// Error Alert
win.error("Connection Failed", "Unable to establish socket connection.");
```

### Async Confirmation & Prompt Modals

```typescript
// Synchronous Confirmation Question (Returns boolean)
if (win.ask("Are you sure you want to delete this record?", "Confirm Action")) {
    console.log("User confirmed deletion.");
}

// In-window prompt dialog asking for string input
const apiKey = await win.showPrompt("Enter your cloud API key:", "sk-default-key", "Authentication Required");
if (apiKey) {
    console.log("API Key provided:", apiKey);
}
```

---

## 11. ⏱️ 9. Async Workflows, Busy States & Timers

### Non-blocking Busy State Wrapper (`withBusyState`)

Automatically disables interactive controls, updates status state, executes async work, and restores controls upon completion:

```typescript
win.addButton("☁️ Sync Cloud Data", async (w) => {
    await w.withBusyState(["btnSync", "txtUrl"], "⏳ Syncing database records...", async (winContext) => {
        await winContext.sleep(2000); // Simulate network request
        winContext.info("Success", "All records successfully synced!");
    });
});
```

### Timers (`addTimer` / `removeTimer`)

Create periodic timers for real-time clocks, health monitoring, or telemetry updates:

```typescript
// Execute callback every 1000 milliseconds
win.addTimer(1000, (w) => {
    const timeNow = new Date().toLocaleTimeString();
    w.setText("lblClock", `⏰ System Time: ${timeNow}`);
}, { id: "mainClockTimer" });

// Stop timer by ID
win.removeTimer("mainClockTimer");
```

---

## 12. 📂 10. System Directories & Clipboard Utilities

SimpleGUI includes cross-platform helpers to query user directories and interact with the system clipboard:

```typescript
import { homeDir, desktopDir, downloadsDir, documentsDir, tempDir } from "bun_rad_studio";

console.log("Home:", homeDir());          // e.g. "/Users/alex"
console.log("Desktop:", desktopDir());    // e.g. "/Users/alex/Desktop"
console.log("Downloads:", downloadsDir());// e.g. "/Users/alex/Downloads"
console.log("Documents:", documentsDir());// e.g. "/Users/alex/Documents"
console.log("Temp:", tempDir());          // e.g. "/tmp"

// Copy string to system clipboard
win.copyToClipboard("Copied from SimpleGUI app!");
```

---

## 13. 🎨 11. Built-in Visual Themes (17 Themes)

Switch themes seamlessly at runtime using `win.setTheme("theme_key")`.

| Theme Key | Theme Name | Type | Aesthetics & Tone |
| --- | --- | --- | --- |
| `apple_dark` | Apple Dark | 🌙 Dark | macOS Dark Mode canvas (Default) |
| `apple_light` | Apple Light | ☀️ Light | Clean macOS Aqua light theme |
| `midnight` | Midnight | 🌙 Dark | Titanium and space gray dark mode |
| `sonoma_emerald` | Sonoma Emerald | 🌙 Dark | macOS Sonoma forest green glass aesthetic |
| `ventura_amber` | Ventura Amber | 🌙 Dark | Warm golden sunset dark tones |
| `apple_sunset` | Apple Sunset | 🌙 Dark | Cozy Mojave twilight palette |
| `catppuccin` | Catppuccin | 🌙 Dark | Soothing pastel lavender dark mode |
| `nord` | Nord | 🌙 Dark | Arctic ice-blue developer theme |
| `dracula` | Dracula | 🌙 Dark | High-contrast vampire purple theme |
| `cyberpunk` | Cyberpunk | 🌙 Dark | Vibrant neon pink and cyan dark mode |
| `github_dark` | GitHub Dark | 🌙 Dark | Official GitHub dark code palette |
| `github_light` | GitHub Light | ☀️ Light | Official clean GitHub light palette |
| `navy_blue` | Navy Blue | 🌙 Dark | Deep blue ocean dark canvas |
| `forest_green` | Forest Green | 🌙 Dark | Emerald green dark canvas |
| `soft_pastel` | Soft Pastel | ☀️ Light | Warm studio light canvas |
| `solarized_dark` | Solarized Dark | 🌙 Dark | Precision solarized dark canvas |
| `solarized_light` | Solarized Light | ☀️ Light | Precision solarized light canvas |

---

## 14. 💡 12. Beginner's "How Do I...?" Cheat Sheet

### Q: How do I read text from an input field on button click?
```typescript
win.addTextInput("Type name...").id("txtName");
win.addButton("Submit", (w) => {
    const name = w.getText("txtName");
    console.log("Name:", name);
});
```

### Q: How do I update a label's text dynamically?
```typescript
win.addLabel("Status: Ready").id("lblStatus");
win.addButton("Process", (w) => {
    w.setText("lblStatus", "Status: ✅ Processing Complete");
});
```

### Q: How do I style a custom primary action button?
```typescript
win.addButton("🚀 Launch")
   .bg("#2563eb")
   .color("#ffffff")
   .font(14, "#ffffff", "700")
   .bold();
```

### Q: How do I disable inputs while processing?
```typescript
win.disableControls(["txtEmail", "btnSave"]);
// Re-enable when done:
win.enableControls(["txtEmail", "btnSave"]);
```

### Q: How do I save user settings to a JSON file?
```typescript
win.saveValuesToFile("./settings.json");
```

---

## 15. 🚀 13. Complete Production Studio Application

Below is a complete, copy-paste ready desktop studio application incorporating grid cards, form controls, analytics charts, activity feed, theme switching, timers, and async operations:

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Initialize Desktop Window
const win = simplegui.createWindow("🚀 SimpleGUI Production Studio", 920, 700, {
    theme: "apple_dark"
});

// 2. Application Header
win.addHeading("⚡ Developer Control Center", "Real-time system diagnostics & application configuration");
win.addDivider();

// 3. Multi-Column Grid Layout (2 Equal Columns)
win.beginGrid(2, 16);

  // --- Column 1: System Settings Card ---
  win.beginCard("⚙️ System Preferences");
    win.addFormField("Application Title:", "txtAppTitle", "My Desktop Studio");
    win.addFormDropdown("Visual Theme:", "cmbTheme", ["apple_dark", "catppuccin", "nord", "cyberpunk"], "apple_dark");
    win.addFormSwitch("Telemetry Mode:", "swtTelemetry", "Enable live analytics reporting", true);
    win.addFormSlider("System Volume:", "sldVol", 75);
  win.endCard();

  // --- Column 2: Live Performance Card ---
  win.beginCard("📊 Live Resource Usage");
    win.addCircularProgress("cprCpu", 68);
    win.addGauge("ggeMemory", "RAM Usage", 54);
    win.addSparkline("spkReq", [15, 30, 45, 60, 50, 75, 90], 35);
  win.endCard();

win.endGrid();

// 4. Activity Feed & Console Section
win.beginCard("📋 System Activity Feed");
  win.addActivityFeed("feedEvents", 120);
  win.addActivityFeedItem("feedEvents", "10:00:00", "Application engine initialized.");
  win.addActivityFeedItem("feedEvents", "10:00:05", "Connected to local Bun IPC bus.");
win.endCard();

// Live 1-Second Clock Timer
win.addTimer(1000, (w) => {
    const now = new Date().toLocaleTimeString();
    w.addActivityFeedItem("feedEvents", now, "Heartbeat tick received.");
});

// 5. Action Control Row
win.beginRow();
  // Async Sync Action
  win.addButton("☁️ Sync Cloud State", async (w) => {
      await w.withBusyState(["txtAppTitle", "cmbTheme"], "⏳ Synchronizing data...", async (winCtx) => {
          await winCtx.sleep(1500);
          winCtx.info("Sync Complete", "Cloud workspace synchronized!");
      });
  }).bg("#0284c7").color("#ffffff").bold().width(180).height(40);

  // Apply Theme Action
  win.addButton("🎨 Apply Theme", (w) => {
      const theme = w.getText("cmbTheme") || "apple_dark";
      w.setTheme(theme);
      w.info("Theme Updated", `Switched theme to '${theme}'`);
  }).bg("#475569").color("#ffffff").width(140).height(40);

  // Save Settings File Action
  win.addButton("💾 Save Settings", (w) => {
      w.saveValuesToFile("./studio_settings.json");
      w.info("Settings Saved", "Saved to studio_settings.json");
  }).bg("#059669").color("#ffffff").width(140).height(40);

  // Exit App Action
  win.addButton("❌ Exit App", (w) => {
      if (w.ask("Are you sure you want to exit?", "Confirm Exit")) {
          w.quit();
      }
  }).bg("#dc2626").color("#ffffff").bold().width(120).height(40);
win.endRow();

// 6. Launch Application
win.run();
```

---

🎉 **You are ready to build state-of-the-art desktop applications with SimpleGUI!**
