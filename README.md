# ⚡ Bun RAD Studio (Delphi / Visual Basic Style IDE)

A high-performance Rapid Application Development (RAD) Visual IDE for **Bun** and **Webview-Bun**, inspired by classic Borland Delphi and Visual Basic 6, built with modern web technologies.

![Bun RAD Studio Architecture](https://img.shields.io/badge/Bun-v1.3.14-orange?style=for-the-badge&logo=bun)
![Webview-Bun](https://img.shields.io/badge/Webview--Bun-v2.4.0-blue?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)

![Bun RAD Studio Application Screenshot](screenshot.png)

---

## 🌟 Highlights & Features

### 🚀 Visual RAD Form Designer
* **Interactive Canvas**: Drag, nudge, resize, and align components visually on a high-DPI scaled canvas with pixel rulers and smart grid snapping (8px, 16px, 4px, or off).
* **Delphi Anchors & Docking System**: Full support for component `Anchors` (`Top`, `Left`, `Right`, `Bottom`) and `Dock` modes (`None`, `Top`, `Bottom`, `Left`, `Right`, `Fill`) so forms dynamically reflow when resized.
* **Non-Visual Component Tray**: Visual bottom tray below the form canvas for non-visual RAD controls (`Timer`, `OpenFileDialog`, `SaveFileDialog`, `DBConnection`, `HTTPClient`, `Notification`) just like Borland Delphi and Lazarus.
* **Delphi Placement Mode**: Click any palette component to arm the placement crosshairs, then click anywhere on the canvas to place it at exact coordinates. Hold `Shift` while clicking to place multiple controls sequentially.
* **Marquee Multi-Selection**: Left-click and drag across the canvas background to marquee select groups of components.
* **Component Hierarchy & Tree**: View, filter, and select components in a real-time DOM hierarchy tree.

### 🖼️ Native Window Management & Placement API
* **Native Fullscreen Mode**: Press **<kbd>Cmd</kbd> + <kbd>F</kbd>** / **<kbd>Fn</kbd> + <kbd>F</kbd>** / **<kbd>F11</kbd>** or click `⛶ Fullscreen` to toggle borderless native macOS Cocoa window fullscreen mode (`[NSWindow toggleFullScreen:nil]`).
* **Stay On Top (Window Pinning)**: Click `📌 Pin: ON / OFF` or call `setAlwaysOnTop(true)` to float the application window above all other desktop applications (`NSFloatingWindowLevel`).
* **Window Placement API**: Position application windows anywhere on screen using `setWindowPosition(pos)` or the `📍 Position` toolbar dropdown across 9 screen presets (`"center"`, `"upper_left"`, `"upper_right"`, `"top_center"`, `"bottom_left"`, `"bottom_right"`, `"bottom_center"`, `"center_left"`, `"center_right"`) or exact `{ x, y }` coordinates.
* **Application Quit**: Press **<kbd>Cmd</kbd> + <kbd>Q</kbd>** (macOS) or **<kbd>Alt</kbd> + <kbd>F4</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Q</kbd>** (Windows/Linux) to safely terminate application execution (`process.exit(0)`).

### 🗄️ MS Access & Delphi Data-Aware RAD Controls
* **Data-Aware Controls**: Access & Delphi style DB controls including `DBGrid` with sorting/paging, `DBNavigator` (First/Prev/Next/Last/Add/Delete/Post/Refresh), `DBInput`, and `DBDropdown` with live dataset field bindings.
* **1-Click Database CRUD Form Wizard**: Instant 1-click wizard button that auto-generates a complete, ready-to-run Customer Accounts Database CRUD layout.

### 🎨 45+ Modern UI & RAD Controls
* **Standard Controls**: Buttons, Labels, Single-Line Inputs, Password Inputs, Textareas, Checkboxes, Radio Buttons, Toggles/Switches, Sliders, Number Steppers, Color Wells, Date Pickers, and File Pickers.
* **Advanced Modern Controls**: Segmented Control (`segmented_control`), Directory Tree Explorer (`tree_view`), Stacked User Profile Avatars (`avatar_group`), Executive KPI Stat Card with SVG Sparkline (`stat_chart`), Collapsible Accordion Panel (`accordion`), Step Navigation Breadcrumbs (`breadcrumb`), Step Activity Timeline (`timeline`), Floating Notification Toast Alert (`toast_card`), Precision Clock Time Picker (`time_picker`), and Searchable Combobox (`rich_select`).
* **Data & Non-Visual Controls**: DB Grid, DB Navigator, DB Field, DB Lookup, Timer, File Dialogs, DB Connection, REST HTTP Client, Notification.
* **Containers & Layout**: Group Box Panels, Data Tables, and Horizontal Dividers.
* **Form Presets & Templates**: Includes pre-built templates for Customer Registration, Auth Login, Executive Analytics Dashboard, User Profile, Data CRUD Manager, Help Desk Support Tickets, REST API Tester, Media Player, and E-Commerce Checkout.

### 🛠️ High-Level Backend & Client Helper Utilities
Programmatically interact with and control form state from Bun TypeScript or client scripts:
- `getControlValue(id)` / `setControlText(id, text)` / `setControlValue(id, value)`
- `setControlEnabled(id, enabled)` / `setControlVisible(id, visible)`
- `setSegmentedSelected(id, text)` / `setStatChart(id, opts)` / `setToast(id, title, msg, alertType)`
- `setTimePickerValue(id, timeStr)` / `setAccordionOpen(id, open)` / `setTimelineSteps(id, stepsCSV)`
- `setBreadcrumbs(id, crumbsCSV)` / `setTreeNodes(id, nodesCSV)` / `setAvatarGroup(id, avatarsCSV)` / `setRichSelectText(id, text)`
- `setAlwaysOnTop(onTop)` / `setWindowPosition(pos)` / `quitApp()`

### ⚡ Auto-Generated Code & Multi-Target Exporters
* **Live Bun TypeScript Exporter**: Real-time auto-generated Bun + `webview-bun` TypeScript code (`index.ts`) complete with typed backend method bindings (`wv.bind(...)`).
* **React + Tailwind Exporter**: Export modern React TSX component code styled with Tailwind CSS.
* **Vue 3 SFC Exporter**: Export Vue 3 Single File Components (`.vue`) using `<script setup>`.
* **Python CustomTkinter Exporter**: Export standalone executable Python GUI desktop app code.
* **Standalone HTML5 Export**: Export clean, responsive HTML5 + CSS standalone web templates.
* **1-Click App Exporter**: Export a complete, runnable Bun project folder to disk (`/exported_project`).

---

## 💻 Installation & Quick Start

### Prerequisites
* [Bun Runtime](https://bun.com) (v1.0.0 or higher)
* macOS, Windows, or Linux with WebKit/Webview support

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/codecaine-zz/bun_webview.git
cd bun_rad_studio
bun install
```

### 2. Launch RAD Studio
```bash
bun run index.ts
```

### 3. Run Interactive Feature Demos
Explore pre-built executable demo applications demonstrating controls, events, and dynamic helper functions:

```bash
# Demo 1: Standard UI Controls, Events & Input Helpers
bun run demo:standard

# Demo 2: 10 Advanced Modern Controls & Helper Wrappers (Segmented, Stat Chart, Toast, Timeline, Tree View)
bun run demo:modern

# Demo 3: Data-Aware DB Grid, Non-Visual Timer (1000ms Event Ticks), & Code View
bun run demo:data

# Demo 4: Native Window Placement API (9 Screen Presets), Always On Top Pinning, & Fullscreen
bun run demo:window

# Demo 5: Dynamic Table Control Studio (Add/Remove Rows & Columns, Filtering, Sorting, Payroll Stats & IPC Log)
bun run demo:table
```

---

## ⌨️ Keyboard Shortcuts & Power Actions

| Shortcut | Action |
| --- | --- |
| **F5** | Launch Live App Preview Window |
| **⌘ + F** / **Fn + F** / **F11** | Toggle Native Borderless Fullscreen Mode |
| **⌘ + Q** / **Alt + F4** | Terminate & Quit Application (`process.exit(0)`) |
| **⌘ + C** / **Ctrl + C** | Copy selected control(s) to clipboard buffer |
| **⌘ + V** / **Ctrl + V** | Paste copied control(s) at cursor position |
| **⌘ + D** / **Ctrl + D** | Duplicate selected control(s) |
| **⌘ + A** / **Ctrl + A** | Select all controls on canvas |
| **⌘ + Z** / **Ctrl + Z** | Undo action |
| **⌘ + Shift + Z** | Redo action |
| **Delete** / **Backspace** | Delete selected control(s) |
| **Arrow Keys** | Nudge selected control(s) position by 1px |
| **Shift + Arrow Keys** | Nudge selected control(s) position by 8px (Grid snap) |
| **Space + Mouse Drag** | Pan canvas workspace view |
| **Cmd / Ctrl + Mouse Wheel** | Zoom canvas workspace (50% – 200%) |
| **Escape** | Deselect controls / Cancel placement mode / Close modals |

---

## 📂 Project Structure

```
bun_rad_studio/
├── index.ts          # Main Bun entry point, FFI Window Manager & Webview IPC runner
├── package.json      # Dependencies (webview-bun, @types/bun)
├── tsconfig.json     # TypeScript compiler settings
├── API.md            # Complete API & FormSpec JSON Schema Specification
├── README.md         # Documentation & User Guide
└── src/
    └── ide.html      # Complete RAD Designer Studio HTML5/CSS3/JS Application
```

---

## 📄 License

MIT License © Codecaine
