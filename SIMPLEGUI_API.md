# 🎨 SimpleGUI Beginner-Friendly API Guide & Reference

Welcome to **SimpleGUI**! SimpleGUI is a lightweight, easy-to-learn toolkit for building modern desktop applications in TypeScript and Bun. Whether you are building your very first desktop app or creating a rapid prototype, SimpleGUI is designed so you can get up and running in minutes.

---

## 📑 Table of Contents

1. [🐣 5-Minute Quick Start](#1--5-minute-quick-start)
2. [🧠 How SimpleGUI Works (Core Concepts)](#2--how-simplegui-works-core-concepts)
3. [🪟 1. Creating Windows & Custom Settings](#3-1-creating-windows--custom-settings)
4. [📐 2. Arranging Your UI (Layout Systems)](#4-2-arranging-your-ui-layout-systems)
5. [🎛️ 3. Interactive Controls Reference](#5-3-interactive-controls-reference)
6. [🔗 4. Styling Controls (Method Chaining)](#6-4-styling-controls-method-chaining)
7. [⚡ 5. Ergonomics & Beginner Shortcuts](#7-5-ergonomics--beginner-shortcuts)
   - [5.1 Popups & Message Dialogs](#51-popups--message-dialogs)
   - [5.2 Group Operations (Enable, Disable, Show, Hide)](#52-group-operations-enable-disable-show-hide)
   - [5.3 Quick Value Modifiers (Counters & Checkboxes)](#53-quick-value-modifiers-counters--checkboxes)
   - [5.4 Dynamic Dropdown & List Box Management](#54-dynamic-dropdown--list-box-management)
   - [5.5 Handling Background Tasks & Loading States](#55-handling-background-tasks--loading-states)
   - [5.6 Saving & Loading App Settings to File](#56-saving--loading-app-settings-to-file)
8. [📋 6. Form Handling & Easy Data Reading](#8-6-form-handling--easy-data-reading)
9. [💬 7. In-Window Glass Dialogs & Prompts](#9-7-in-window-glass-dialogs--prompts)
10. [⏱️ 8. Timers & Live Clock Updates](#10-8-timers--live-clock-updates)
11. [📂 9. Computer Folders & Clipboard Helpers](#11-9-computer-folders--clipboard-helpers)
12. [🎨 10. Built-in Visual Themes (17 Themes)](#12-10-built-in-visual-themes-17-themes)
13. [💡 11. Beginner's "How Do I...?" Cheat Sheet](#13-11-beginners-how-do-i-cheat-sheet)
14. [🚀 12. Complete Real-World Example App](#14-12-complete-real-world-example-app)

---

## 1. 🐣 5-Minute Quick Start

Creating your first desktop window takes just a few lines of code!

```typescript
import { simplegui } from "bun_rad_studio";

// Step 1: Create a window (Title, Width, Height)
const win = simplegui.createWindow("My First Desktop App", 760, 520, {
    theme: "apple_dark" // Pick a modern dark theme
});

// Step 2: Add a welcoming header text
win.addLabel("⚡ Welcome to SimpleGUI!").font(22, "#38bdf8", "700");

// Step 3: Put inputs inside a neat Card section
win.beginCard("User Login");
  win.beginRow();
    win.addLabel("Username:").width(90);
    win.addTextInput("Type your username...").id("txtUser").width(240);
  win.endRow();

  win.beginRow();
    win.addLabel("Password:").width(90);
    win.addPasswordInput("••••••••").id("txtPass").width(240);
  win.endRow();
win.endCard();

// Step 4: Add an interactive button with a click handler
win.addButton("🚀 Login", (w) => {
    // Read what the user typed in the text box using its ID!
    const username = w.getText("txtUser") || "Friend";
    w.info("Welcome!", `Hello ${username}, you are logged in!`);
}).bg("#0284c7").color("#ffffff").bold().width(140).height(38);

// Step 5: Display the window and start running your app!
win.run();
```

> [!TIP]
> **How to run this code:** Save this code in a file called `app.ts` and run it in your terminal with: `bun run app.ts`!

---

## 2. 🧠 How SimpleGUI Works (Core Concepts)

Before diving into the detailed API, here is the simple mental model for building apps with SimpleGUI:

```
┌────────────────────────────────────────────────────────┐
│ 🪟 Window (The main window box)                       │
│  ├─ 📐 Layouts (Rows, Grids, Cards organize controls)  │
│  ├─ 🎛️ Controls (Buttons, Inputs, Switches, Labels)   │
│  └─ ⚡ Events (Code that runs when user clicks/types)  │
└────────────────────────────────────────────────────────┘
```

1. **The Window (`win`)**: Your desktop application's canvas. Everything you build is attached to a `SimpleWindow`.
2. **Layouts (`beginRow`, `beginCard`, `beginGrid`)**: Think of layouts like invisible boxes or shelves. They automatically position buttons and text inputs so you don't have to calculate pixel coordinates by hand.
3. **Control IDs (`.id("myInput")`)**: When you create an input box or checkbox, give it a unique `id`. Later, when the user clicks a button, you can ask the window: `"Hey win, what is the text inside 'myInput'?"`
4. **Method Chaining (`.bg("#000").bold()`)**: Every control you create returns a builder object. You can stack settings together like building blocks: `.width(200).bg("blue").bold()`.

---

## 3. 🪟 1. Creating Windows & Custom Settings

You can create a window using `createWindow`, or the shorter aliases `newWindow` / `new_simple_window`.

```typescript
import { createWindow } from "bun_rad_studio";

// Basic creation
const win = createWindow("My App Title", 800, 600);

// Advanced creation with options
const customWin = createWindow("Custom App", 900, 650, {
    theme: "apple_dark",     // Pick from 17 built-in themes!
    padding: 24,             // Space between window edge & controls (in pixels)
    spacing: 14,             // Space between stacked controls (in pixels)
    alwaysOnTop: true        // Keeps this window above all other open desktop windows
});
```

### Window Options Explained

| Option Name | What it is | Default Value | Example |
| --- | --- | --- | --- |
| `title` | The text shown in the top title bar | `"SimpleGUI Application"` | `"My Notepad"` |
| `width` | Window width in pixels | `800` | `1024` |
| `height` | Window height in pixels | `600` | `768` |
| `theme` | Color scheme name | `"apple_dark"` | `"catppuccin"`, `"nord"` |
| `padding` | Inner margin space around window edges | `20` | `25` |
| `spacing` | Gap between vertical controls | `12` | `16` |
| `alwaysOnTop` | Keeps window floating over other apps | `false` | `true` |

---

## 4. 📐 2. Arranging Your UI (Layout Systems)

SimpleGUI provides 5 layout choices so your app always looks clean and aligned:

### 1. Default Vertical Stack (Top to Bottom)
If you add controls one after another without opening a row or grid, SimpleGUI places them neatly from top to bottom.

```typescript
win.addLabel("Line 1");
win.addLabel("Line 2"); // Placed right under Line 1
```

### 2. Side-by-Side Horizontal Row (`beginRow` / `endRow`)
Use `beginRow()` when you want elements to sit next to each other horizontally (like a text input next to its search button).

```typescript
win.beginRow();
  win.addLabel("Search:").width(60);
  win.addTextInput("Type keywords...").id("txtSearch").width(240);
  win.addButton("🔍 Go", (w) => console.log(w.getText("txtSearch")));
win.endRow(); // Don't forget to close the row!
```

### 3. Multi-Column Grid (`beginGrid` / `endGrid`)
Need a dashboard with multiple columns? `beginGrid(columns, spacing)` automatically arranges controls into equal columns.

```typescript
// Create a 3-column layout with 16px gap between cells
win.beginGrid(3, 16);
  win.addTextInput("First Name").id("txtFirst");
  win.addTextInput("Middle Name").id("txtMid");
  win.addTextInput("Last Name").id("txtLast");
  // The next control automatically wraps down to Column 1 in Row 2!
  win.addSwitch("Active Status", true).id("swtActive");
win.endGrid();
```

### 4. Visual Card Boxes (`beginCard` / `endCard`)
Group related settings together inside a styled container card with rounded corners and a title header.

```typescript
win.beginCard("👤 Account Settings");
  win.addTextInput("Email Address").id("txtEmail");
  win.addPasswordInput("New Password").id("txtPass");
win.endCard();
```

### 5. Custom Pixel Placement (`.at(x, y)`)
If you ever want to place a button at an exact pixel location on the screen, use `.at(x, y)`:

```typescript
// Position floating button at X=650px, Y=20px
win.addButton("❓ Help").at(650, 20).size(90, 32);
```

---

## 5. 🎛️ 3. Interactive Controls Reference

SimpleGUI comes with a rich set of built-in controls. Here is a friendly lookup guide:

| Control Type | SimpleGUI Method | How to Use | Common Purpose |
| --- | --- | --- | --- |
| **Text Label** | `win.addLabel(text)` | `win.addLabel("Hello World")` | Displays static text or titles |
| **Button** | `win.addButton(text, onClick)` | `win.addButton("Save", (w) => { ... })` | Triggers actions on click |
| **Text Input** | `win.addTextInput(placeholder)` | `win.addTextInput("Enter email...").id("email")` | Single line text entry |
| **Password Input** | `win.addPasswordInput(placeholder)` | `win.addPasswordInput("••••••").id("pass")` | Masks text input with dots |
| **Text Area** | `win.addTextArea(placeholder)` | `win.addTextArea("Write notes...").id("notes")` | Multi-line text field |
| **Dropdown Menu** | `win.addDropdown(items, default)` | `win.addDropdown(["Dark", "Light"], "Dark")` | Pick one option from popup list |
| **List Box** | `win.addListBox(items, default)` | `win.addListBox(["Item 1", "Item 2"])` | Scrollable selection box |
| **Checkbox** | `win.addCheckbox(text, isChecked)` | `win.addCheckbox("Remember Me", true)` | Toggle on/off options |
| **Radio Button** | `win.addRadioButton(text, isChecked)` | `win.addRadioButton("Option A", true)` | Pick one option from a set |
| **Toggle Switch** | `win.addSwitch(text, isChecked)` | `win.addSwitch("Enable Wifi", true)` | Modern iOS-styled toggle switch |
| **Range Slider** | `win.addSlider(min, max, val)` | `win.addSlider(0, 100, 50)` | Volume or brightness meter slider |
| **Stepper** | `win.addStepper(min, max, val)` | `win.addStepper(1, 10, 1)` | Number box with +/- buttons |
| **Progress Bar** | `win.addProgressBar(val, max)` | `win.addProgressBar(75, 100)` | Progress loading indicator |
| **Badge** | `win.addBadge(text, variant)` | `win.addBadge("ONLINE", "success")` | Status pill (`success`, `warning`, `error`, `info`) |
| **Data Table** | `win.addTable(headers, rows)` | `win.addTable(["ID", "Name"], [["1", "Alice"]])` | Tabular data display |
| **Tree View** | `win.addTreeView(nodes)` | `win.addTreeView([{ label: "Folder", children: [...] }])` | Hierarchical file or folder list |
| **Code View** | `win.addCodeView(code, lang)` | `win.addCodeView("console.log('hi');", "typescript")` | Syntax highlighted code block |
| **Date Picker** | `win.addDatePicker()` | `win.addDatePicker("2026-01-01")` | Select dates from a calendar |
| **Time Picker** | `win.addTimePicker()` | `win.addTimePicker("12:00")` | Select times |
| **Color Picker** | `win.addColorWell()` | `win.addColorWell("#38bdf8")` | Pick color hex codes visually |
| **Segmented Tabs** | `win.addSegmentedControl(items)`| `win.addSegmentedControl(["Day", "Week", "Month"])` | Tab button bar |
| **Divider Line** | `win.addDivider()` | `win.addDivider()` | Horizontal separation line |

---

## 6. 🔗 4. Styling Controls (Method Chaining)

When you create any control, you can immediately chain formatting methods to style it, give it an ID, change its width, adjust its colors, or attach tooltips:

```typescript
win.addButton("🚀 Submit Order", (w) => console.log("Submitted!"))
    .id("btnSubmit")            // Give it a unique lookup name
    .width(180)                 // Set width to 180 pixels
    .height(42)                 // Set height to 42 pixels
    .bg("#0284c7")              // Background color (CSS Hex or named color)
    .color("#ffffff")           // Text color (White)
    .font(15, "#ffffff", "700") // Font size 15px, white text, bold (700 weight)
    .bold()                     // Shortcut to make text bold
    .tooltip("Click here to send your order") // Hover hint text
    .enabled(true);             // Enable or disable interaction
```

### Popular Style & Action Chain Methods

- **Identifier**: `.id("uniqueName")`
- **Sizing**: `.width(200)`, `.height(40)`, `.size(200, 40)`
- **Colors**: `.bg("#2563eb")`, `.color("#ffffff")`
- **Text & Fonts**: `.font(16, "white", "bold")`, `.bold()`, `.italic()`, `.align("center")`
- **User Hints**: `.tooltip("Help text on hover")`, `.placeholder("Type here...")`
- **State Control**: `.enable()`, `.disable()`, `.enabled(boolean)`, `.disabled(boolean)`
- **Visibility**: `.show()`, `.hide()`, `.visible(boolean)`
- **Attention Highlights**: `.flash()`, `.highlight(2000)` (Glows blue for 2 seconds)
- **Event Listeners**: `.onClick((win, val) => { ... })`, `.onChange((win, val) => { ... })`

---

## 7. ⚡ 5. Ergonomics & Beginner Shortcuts

SimpleGUI provides handy shortcut functions that make common programming tasks quick and effortless!

### 5.1 Popups & Message Dialogs

Displaying message alerts or asking users for confirmation takes just one line of code:

```typescript
// ℹ️ Information Popup
win.info("Saved!", "Your profile was saved successfully.");

// ⚠️ Warning Alert
win.warn("Low Disk Space", "Your storage is almost full (under 5%).");

// ❌ Error Alert
win.error("Connection Failed", "Unable to reach database server.");

// ❓ Confirmation Question (Returns true if user clicks OK)
if (win.ask("Are you sure you want to delete this file?", "Confirm Delete")) {
    console.log("User clicked Yes/OK!");
}

// 🚪 Quick App Exit
win.quit(); // Closes the window and exits the application cleanly
```

---

### 5.2 Group Operations (Enable, Disable, Show, Hide)

Instead of updating controls one by one, manage whole groups at once using arrays of control IDs!

```typescript
// Disable multiple text inputs during background processing
win.disableControls(["txtName", "txtEmail", "btnSave"]);

// Re-enable them when finished
win.enableControls(["txtName", "txtEmail", "btnSave"]);

// Toggle visibility of secret panels
win.hideControls(["secretPanel1", "secretPanel2"]);
win.showControls(["secretPanel1", "secretPanel2"]);

// Fill out multiple form fields at once!
win.setAll({
    txtName: "Alex Mercer",
    txtEmail: "alex@example.com",
    cmbRole: "Developer"
});

// Read multiple fields into a single JavaScript object!
const data = win.getAll(["txtName", "txtEmail", "cmbRole"]);
// Returns: { txtName: "Alex Mercer", txtEmail: "...", cmbRole: "..." }
```

---

### 5.3 Quick Value Modifiers (Counters & Checkboxes)

Easily modify values on existing controls without manually reading and re-setting them:

```typescript
// ➕ Increment or Decrement a Number Input or Slider
win.increment("numItems", 1);  // Adds 1 to the current count
win.increment("numItems", -1); // Subtracts 1 from the count

// 🔄 Flip a Checkbox or Switch
win.toggleChecked("chkNotification"); // Swaps checked between true and false

// 📝 Append text to a Log Area
win.appendLine("txtLog", "[12:00:00] User logged in.");
win.appendLine("txtLog", "[12:01:15] Clicked Save button.");
```

---

### 5.4 Dynamic Dropdown & List Box Management

Add, remove, or modify items inside dropdown menus or listboxes while your app is running:

```typescript
// Create a dropdown menu
win.addDropdown(["Option 1", "Option 2"], "Option 1").id("myDropdown");

// Add a new item to the dropdown list
win.addListItem("myDropdown", "Option 3");

// Remove an item by index
win.removeListItem("myDropdown", 0); // Removes "Option 1"

// Get what the user currently selected
const choice = win.getListSelectedText("myDropdown");
console.log("User chose:", choice);

// Replace all items in one shot
win.setListItems("myDropdown", ["Red", "Green", "Blue"]);
```

---

### 5.5 Handling Background Tasks & Loading States

When performing a task that takes time (like loading data from a server), use `withBusyState`. It automatically disables specified controls, sets a status message, runs your async work, and then restores everything when done!

```typescript
win.addButton("☁️ Sync Data", async (w) => {
    // Disable inputs and show status during 2-second download
    await w.withBusyState(["btnSync", "txtUrl"], "⏳ Syncing data with cloud...", async (winContext) => {
        await winContext.sleep(2000); // Simulate background network request
        winContext.info("Success", "All cloud files synced!");
    });
    // Controls are automatically re-enabled here!
});
```

---

### 5.6 Saving & Loading App Settings to File

Save your entire user form to a JSON file on disk and restore it later with a single command!

```typescript
// Save all control values to a local file
win.saveValuesToFile("./user_settings.json");

// Restore all control values from the local file
win.loadValuesFromFile("./user_settings.json");
```

---

## 8. 📋 6. Form Handling & Easy Data Reading

Reading data typed by your user is simple and intuitive in SimpleGUI.

### Read All Inputs as an Object

```typescript
// Get values of every input box, switch, and dropdown in the window as an object
const formData = win.getFormValues();
console.log(formData);
// Output: { txtUser: "alex", txtPass: "secret", swtNotify: true }

// Clear every input field on the screen (great for a "Reset Form" button!)
win.clearForm();
```

### Typed Accessors (Get & Set Specific Types)

SimpleGUI provides direct helper functions to read string, number, or boolean values:

```typescript
// 🔤 Text / String
const name: string = win.getText("txtName");
win.setText("txtName", "Sarah");

// 🔘 Boolean (Checkbox / Switch)
const isSubscribed: boolean = win.getBool("swtSubscribe");
win.setBool("swtSubscribe", true);

// 🔢 Integers & Numbers
const age: number = win.getInt("numAge");
win.setInt("numAge", 25);

const price: number = win.getFloat("numPrice");
win.setFloat("numPrice", 19.99);
```

---

## 9. 💬 7. In-Window Glass Dialogs & Prompts

SimpleGUI can pop up non-blocking modal dialogs directly inside the window canvas:

```typescript
// 1. Alert Message Box
win.showAlert("Your report has been generated!", "Report Ready");

// 2. Confirmation Dialog (Yes / No)
win.showConfirm("Would you like to exit without saving?", "Unsaved Changes");

// 3. Prompt Input Box (Ask user for typed text input asynchronously)
const apiKey = await win.showPrompt("Please enter your API Key:", "sk-default-key", "Enter Key");
if (apiKey) {
    console.log("User entered key:", apiKey);
}
```

---

## 10. ⏱️ 8. Timers & Live Clock Updates

Need to run background tasks periodically (like updating a live clock or monitoring server health)? Use timers!

```typescript
// Add a timer that ticks every 1000 milliseconds (1 second)
const timer = win.addTimer(1000, (w) => {
    const timeNow = new Date().toLocaleTimeString();
    w.setText("lblClock", `⏰ Current Time: ${timeNow}`);
}, { id: "myClockTimer" });

// To stop the timer later:
win.removeTimer("myClockTimer");
```

---

## 11. 📂 9. Computer Folders & Clipboard Helpers

Access cross-platform desktop directories and system clipboard easily:

```typescript
import { homeDir, desktopDir, downloadsDir } from "bun_rad_studio";

console.log("Home folder:", homeDir());          // e.g. "/Users/alex"
console.log("Desktop folder:", desktopDir());    // e.g. "/Users/alex/Desktop"
console.log("Downloads folder:", downloadsDir());// e.g. "/Users/alex/Downloads"

// Copy text to the user's system clipboard (Ctrl+C / Cmd+C)
win.copyToClipboard("Text copied to clipboard!");
```

---

## 12. 🎨 10. Built-in Visual Themes (17 Themes)

SimpleGUI includes 17 professionally crafted dark and light desktop color themes. Change themes instantly using `win.setTheme("theme_name")`!

```typescript
// Change theme dynamically at runtime!
win.setTheme("catppuccin");
```

| Theme ID Key | Theme Name | Type | Description / Vibe |
| --- | --- | --- | --- |
| `apple_dark` | Apple Dark | 🌙 Dark | Modern macOS Dark Mode canvas (Default) |
| `apple_light` | Apple Light | ☀️ Light | Clean, bright macOS Aqua light canvas |
| `midnight` | Midnight | 🌙 Dark | Deep space gray and titanium tones |
| `sonoma_emerald` | Sonoma Emerald | 🌙 Dark | macOS Sonoma forest green glass aesthetic |
| `ventura_amber` | Ventura Amber | 🌙 Dark | Warm golden sunset dark hues |
| `apple_sunset` | Apple Sunset | 🌙 Dark | Cozy Mojave twilight hues |
| `catppuccin` | Catppuccin | 🌙 Dark | Soothing pastel purple & lavender dark mode |
| `nord` | Nord | 🌙 Dark | Arctic ice blue developer palette |
| `dracula` | Dracula | 🌙 Dark | Popular high-contrast vampire purple theme |
| `cyberpunk` | Cyberpunk | 🌙 Dark | Vibrant neon pink and cyan dark theme |
| `github_dark` | GitHub Dark | 🌙 Dark | Official GitHub dark code palette |
| `github_light` | GitHub Light | ☀️ Light | Official clean GitHub light palette |
| `navy_blue` | Navy Blue | 🌙 Dark | Deep blue ocean dark palette |
| `forest_green` | Forest Green | 🌙 Dark | Natural emerald green dark palette |
| `soft_pastel` | Soft Pastel | ☀️ Light | Warm studio light canvas |
| `solarized_dark` | Solarized Dark | 🌙 Dark | Precision engineered solarized dark canvas |
| `solarized_light` | Solarized Light | ☀️ Light | Precision engineered solarized light canvas |

---

## 13. 💡 11. Beginner's "How Do I...?" Cheat Sheet

Here are quick solutions to the most common tasks:

### Q: How do I read text from an input box when a button is clicked?
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

### Q: How do I make a button blue and bold?
```typescript
win.addButton("Click Me")
   .bg("#2563eb")
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

---

## 14. 🚀 12. Complete Real-World Example App

Here is a complete, copy-paste ready application demonstrating form controls, layout cards, theme selection, timers, busy loading states, and ergonomic shortcuts!

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Create Window
const win = simplegui.createWindow("🚀 Developer Studio Desktop App", 860, 640, {
    theme: "apple_dark"
});

// 2. App Title Header
win.addLabel("⚡ SimpleGUI Production App Studio")
   .font(22, "#38bdf8", "700");

win.addLabel("Build powerful cross-platform desktop interfaces effortlessly with TypeScript & Bun.")
   .font(13, "#94a3b8");

win.addDivider();

// 3. Multi-Column Grid Layout (2 Equal Columns)
win.beginGrid(2, 16);

  // --- Column 1: User Registration Card ---
  win.beginCard("👤 User Account Details");
    win.beginRow();
      win.addLabel("Full Name:").width(90);
      win.addTextInput("e.g. Alex Mercer").id("txtName").width(220);
    win.endRow();

    win.beginRow();
      win.addLabel("Email:").width(90);
      win.addTextInput("alex@example.com").id("txtEmail").width(220);
    win.endRow();

    win.beginRow();
      win.addLabel("Role:").width(90);
      win.addSegmentedControl(["Developer", "Designer", "Lead"], 0).id("segRole").width(220);
    win.endRow();
  win.endCard();

  // --- Column 2: App Preferences Card ---
  win.beginCard("⚙️ System Preferences");
    win.beginRow();
      win.addLabel("Color Theme:").width(90);
      win.addDropdown(["apple_dark", "catppuccin", "nord", "cyberpunk"], "apple_dark")
         .id("cmbTheme")
         .width(220);
    win.endRow();

    win.beginRow();
      win.addLabel("Telemetry:").width(90);
      win.addSwitch("Enable Live Reporting", true).id("swtTelemetry");
    win.endRow();

    win.beginRow();
      win.addLabel("Sound Vol:").width(90);
      win.addSlider(0, 100, 75).id("sldVol").width(200);
    win.endRow();
  win.endCard();

win.endGrid();

// 4. Status Bar & Live Clock Card
win.beginCard("📊 Real-Time Telemetry & Status");
  win.beginRow();
    win.addBadge("SYSTEM ONLINE", "success").width(130);
    win.addBadge("IPC CONNECTED", "info").width(130);
    win.addLabel("⏰ System Time: Initializing...")
       .id("lblClock")
       .font(13, "#38bdf8", "600")
       .width(300);
  win.endRow();
win.endCard();

// Live Timer ticking every 1 second
win.addTimer(1000, (w) => {
    w.setText("lblClock", `⏰ System Time: ${new Date().toLocaleTimeString()}`);
});

// 5. Footer Action Buttons
win.beginRow();
  // Submit Form Button with Async Loading State
  win.addButton("🚀 Submit Profile", async (w) => {
      await w.withBusyState(["txtName", "txtEmail"], "⏳ Saving profile...", async (winCtx) => {
          const formData = winCtx.getFormValues();
          const username = formData.txtName || "Guest";
          winCtx.info("Profile Saved", `Successfully updated profile for ${username}!`);
      });
  }).bg("#0284c7").color("#ffffff").bold().width(160).height(40);

  // Apply Theme Button
  win.addButton("🎨 Apply Theme", (w) => {
      const selectedTheme = w.getText("cmbTheme") || "apple_dark";
      w.setTheme(selectedTheme);
      w.info("Theme Changed", `Switched active theme to '${selectedTheme}'`);
  }).bg("#475569").color("#ffffff").width(140).height(40);

  // Save Settings Button
  win.addButton("💾 Save to File", (w) => {
      w.saveValuesToFile("./app_config.json");
      w.info("Saved", "Settings saved to app_config.json");
  }).bg("#059669").color("#ffffff").width(140).height(40);

  // Exit App Button
  win.addButton("❌ Exit App", (w) => {
      if (w.ask("Are you sure you want to quit?", "Confirm Exit")) {
          w.quit();
      }
  }).bg("#dc2626").color("#ffffff").bold().width(120).height(40);
win.endRow();

// 6. Launch Desktop Application Event Loop
win.run();
```

---

🎉 **You are all set to build amazing desktop apps with SimpleGUI!**
