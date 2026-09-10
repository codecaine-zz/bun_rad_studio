# ⚡ Bun RAD Studio (Delphi / Visual Basic Style IDE)

A high-performance Rapid Application Development (RAD) Visual IDE for **Bun** and **Webview-Bun**, inspired by classic Borland Delphi and Visual Basic 6, built with modern web technologies.

[![Bun](https://img.shields.io/badge/Bun-v1.3.14-orange?style=for-the-badge&logo=bun)](https://bun.sh)
[![Webview-Bun](https://img.shields.io/badge/Webview--Bun-v2.4.0-blue?style=for-the-badge)](https://github.com/codecaine-zz/bun_webview)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![RAD Designer](https://img.shields.io/badge/RAD%20Designer-Included-10b981?style=for-the-badge)](API.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

> 📖 **Quick Links:** [Application User Guides](docs/userguides/README.md) • [API Specification](API.md) • [SimpleGUI Manual](SIMPLEGUI_API.md) • [Interactive Demos](#3-run-interactive-feature-demos) • [Enterprise Applications](#-16-enterprise-production-workstations--utilities) • [Ecosystem Projects](#related-rad--gui-ecosystem-projects)

![Bun RAD Studio Application Screenshot](screenshot.png)

### ⚡ Modern Productivity UI Controls Studio (`demo:productivity`)
![Modern Productivity UI Controls Studio Screenshot](screenshot_productivity.png)

### ⚡ SimpleGUI Ergonomics & Shortcuts API Showcase (`demos/18_simplegui_ergonomics_demo.ts`)
![SimpleGUI Ergonomics & Shortcuts Demo Screenshot](screenshot_ergonomics.png)

---

## 📑 Table of Contents

- [🌟 Highlights & Features](#highlights--features)
  - [🚀 Visual RAD Form Designer](#visual-rad-form-designer)
  - [🖼️ Native Window Management & Placement API](#native-window-management--placement-api)
  - [🗄️ MS Access & Delphi Data-Aware RAD Controls](#ms-access--delphi-data-aware-rad-controls)
  - [🎨 70+ Modern UI & RAD Controls](#70-modern-ui--rad-controls)
  - [🎨 macOS & Windows 11 Desktop Form Themes](#macos--windows-11-desktop-form-themes)
  - [🛠️ High-Level Backend & Client Helper Utilities](#high-level-backend--client-helper-utilities)
  - [⚡ Auto-Generated Code & Multi-Target Exporters](#auto-generated-code--multi-target-exporters)
- [💻 Installation & Quick Start](#installation--quick-start)
  - [Prerequisites](#prerequisites)
  - [1. Clone & Install Dependencies](#1-clone--install-dependencies)
  - [2. Launch RAD Studio](#2-launch-rad-studio)
  - [3. Run Interactive Feature Demos](#3-run-interactive-feature-demos)
- [📦 Dist Build Process](#dist-build-process)
  - [Commands](#commands)
  - [`dist/` Output Structure](#dist-output-structure)
  - [Importing from `dist/` in Another Bun Project](#importing-from-dist-in-another-bun-project)
- [📦 Compiling Standalone macOS Binaries (.app) with Custom Icons](#compiling-standalone-macos-binaries-app-with-custom-icons)
  - [Option 1: Native Single-File Executable via `build:binary`](#option-1-native-single-file-executable-via-buildbinary)
  - [Option 2: Full macOS `.app` Bundle with Custom Icons](#option-2-full-macos-app-bundle-with-custom-icons)
- [🎨 Declarative SimpleGUI Module (`simplegui`)](#declarative-simplegui-module-simplegui)
  - [Key Features](#key-features)
- [📚 Documentation Reference: API.md vs. SIMPLEGUI_API.md](#documentation-reference-apimd-vs-simplegui_apimd)
  - [📖 Summary of API Files](#summary-of-api-files)
- [⌨️ Keyboard Shortcuts & Power Actions](#keyboard-shortcuts--power-actions)
- [📂 Project Structure](#project-structure)
- [🌟 Related RAD & GUI Ecosystem Projects](#related-rad--gui-ecosystem-projects)
- [📄 License](#license)

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
* **Native Fullscreen Mode & Startup**: Every studio application launches in native fullscreen by default (`{ fullscreen: true }`) with automatic CoreGraphics/Win32 screen resolution auto-fitting (`(0,0)` origin) and a promise-aware verification loop. Press **<kbd>Cmd</kbd> + <kbd>F</kbd>** / **<kbd>Ctrl</kbd> + <kbd>F</kbd>** / **<kbd>Fn</kbd> + <kbd>F</kbd>** / **<kbd>F11</kbd>**, or click `⛶ Fullscreen` to toggle native borderless fullscreen mode.
* **Smart Minimize & Hide**: Press **<kbd>Cmd</kbd> + <kbd>M</kbd>** / **<kbd>Ctrl</kbd> + <kbd>M</kbd>** to minimize the window. If the application is in a native macOS fullscreen space, it automatically exits fullscreen before miniaturizing to the Dock. Press **<kbd>Cmd</kbd> + <kbd>H</kbd>** / **<kbd>Ctrl</kbd> + <kbd>H</kbd>** to hide the application window (`[NSApp hide:]`).
* **Stay On Top (Window Pinning)**: Click `📌 Pin: ON / OFF`, press **<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>**, or call `setAlwaysOnTop(true)` to float the application window above all other desktop applications (`NSFloatingWindowLevel`).
* **Window Placement & Centering API**: Position application windows anywhere on screen using `setWindowPosition(pos)`, press **<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>** to center, or use the `📍 Position` toolbar dropdown across 9 screen presets (`"center"`, `"upper_left"`, `"upper_right"`, `"top_center"`, `"bottom_left"`, `"bottom_right"`, `"bottom_center"`, `"center_left"`, `"center_right"`).
* **Guaranteed Process Termination**: Press **<kbd>Cmd</kbd> + <kbd>Q</kbd>** / **<kbd>Cmd</kbd> + <kbd>W</kbd>** (macOS) or **<kbd>Alt</kbd> + <kbd>F4</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Q</kbd>** / **<kbd>Ctrl</kbd> + <kbd>W</kbd>** (Windows/Linux), or double-tap **<kbd>Alt</kbd>** to immediately close the window and cleanly exit the terminal process (`process.exit(0)`).

### 🗄️ MS Access & Delphi Data-Aware RAD Controls
* **Data-Aware Controls**: Access & Delphi style DB controls including `DBGrid` with sorting/paging, `DBNavigator` (First/Prev/Next/Last/Add/Delete/Post/Refresh), `DBInput`, and `DBDropdown` with live dataset field bindings.
* **1-Click Database CRUD Form Wizard**: Instant 1-click wizard button that auto-generates a complete, ready-to-run Customer Accounts Database CRUD layout.

### 🎨 70+ Modern UI & RAD Controls
* **Standard Controls**: Buttons, Labels, Single-Line Inputs, Password Inputs, Textareas, Checkboxes, Radio Buttons, Toggles/Switches, Sliders, Number Steppers, Color Wells, Date Pickers, and File Pickers.
* **Integrated Labeled Form Controls**: Form Field (`form_field`), Labeled Password (`form_password`), Labeled Textarea (`form_textarea`), Labeled Checkbox (`form_checkbox`), Labeled Radio (`form_radio`), Labeled Search Bar (`form_search`), Labeled Color Well (`form_color`), Labeled Time Picker (`form_time`), Labeled Stepper (`form_stepper`), Labeled Code Editor (`form_code`), Labeled File Drop Zone (`form_drop_zone`), Labeled Switch (`form_switch`), Labeled Slider (`form_slider`), Labeled Number (`form_number`), Labeled Date (`form_date`), Labeled Dropdown (`form_dropdown`), Labeled Link (`form_link`), and Labeled Progress (`form_progress`).
* **Desktop Application UI Controls**: Tab Container (`tabs`), Action Toolbar (`tool_bar`), Window Status Bar (`status_bar`), Split View Panel (`split_pane`), Pagination Bar (`pagination`), Command Palette Search (`command_palette`), Icon Toggle Button (`toggle_button`), Property Inspector Grid (`property_grid`), Popup Context Menu (`popup_menu`), Month Calendar View (`calendar_view`), Color Palette Swatch (`color_swatch`), File Path Location Bar (`file_path_bar`), Kanban Task Board (`kanban_board`), Keyboard Shortcut Recorder (`shortcut_recorder`), Split Action Button (`split_button`), Sparkline Data Table (`sparkline_table`), KPI Metric Comparison (`metric_comparison`), Activity Feed Stream (`activity_feed`), and Workspace Tab Bar (`file_tree_tabs`).
* **Advanced Modern Controls**: Segmented Control (`segmented_control`), Directory Tree Explorer (`tree_view`), Stacked User Profile Avatars (`avatar_group`), Executive KPI Stat Card with SVG Sparkline (`stat_chart`), Collapsible Accordion Panel (`accordion`), Step Navigation Breadcrumbs (`breadcrumb`), Step Activity Timeline (`timeline`), Floating Notification Toast Alert (`toast_card`), Precision Clock Time Picker (`time_picker`), and Searchable Combobox (`rich_select`).
* **Data & Non-Visual Controls**: DB Grid, DB Navigator, DB Field, DB Lookup, Timer, File Dialogs, DB Connection, REST HTTP Client, Notification.
* **Containers & Layout**: Group Box Panels, Data Tables, and Horizontal Dividers.
* **Form Presets & Templates**: Includes pre-built templates for Customer Registration, Auth Login, Executive Analytics Dashboard, User Profile, Data CRUD Manager, Help Desk Support Tickets, REST API Tester, Media Player, and E-Commerce Checkout.

### 🎨 macOS & Windows 11 Desktop Form Themes
* **macOS & Windows 11 Desktop Themes**: Comprehensive selection of modern desktop UI themes including **macOS Sonoma Dark**, **macOS Ventura Light**, **macOS Liquid Glass**, **Apple Dark (Space Gray)**, **Midnight Space Gray**, **Apple Sunset**, **Sonoma Emerald**, **Windows 11 Mica Light**, **Windows 11 Acrylic Dark**, **Windows 11 Fluent Slate**, **Windows 11 Sun Valley (Cobalt)**, Catppuccin, Dracula, Nord, Cyberpunk, Solarized, and High Contrast. Automatically harmonizes form canvas backgrounds, typography foregrounds, control surfaces, primary action button swatches, and container panels.

### 🛠️ High-Level Backend & Client Helper Utilities
Programmatically interact with and control form state from Bun TypeScript or client scripts:
- `getControlValue(id)` / `setControlText(id, text)` / `setControlValue(id, value)` / `setControlHtml(id, html)`
- `setControlEnabled(id, enabled)` / `setControlVisible(id, visible)`
- `setSegmentedSelected(id, text)` / `setStatChart(id, opts)` / `setToast(id, title, msg, alertType)`
- `setTimePickerValue(id, timeStr)` / `setAccordionOpen(id, open)` / `setTimelineSteps(id, stepsCSV)`
- `setBreadcrumbs(id, crumbsCSV)` / `setTreeNodes(id, nodesCSV)` / `setAvatarGroup(id, avatarsCSV)` / `setRichSelectText(id, text)`
- `setTabsActive(id, tabName)` / `setStatusBarText(id, text)` / `setPaginationPage(id, pageNum)` / `setToggleButtonState(id, active, labelText)`
- `setPropertyGridData(id, properties)` / `setPopupMenuItems(id, itemsCSV)` / `setCalendarDate(id, dateStr)` / `setColorSwatchColor(id, hex)` / `setFilePathBarPath(id, pathStr)`
- `setKanbanColumns(id, colsCSV)` / `setShortcutRecorderValue(id, shortcutStr)` / `setSplitButtonAction(id, text)` / `setSparklineTableData(id, rowsCSV)` / `setMetricComparison(id, title, val, target, change)` / `setActivityFeedItems(id, itemsCSV)` / `setWorkspaceTabs(id, filesCSV)`
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
* [Bun Runtime](https://bun.sh) (v1.0.0 or higher)
* macOS, Windows, or Linux with WebKit/Webview support

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio
bun install
```

### 2. Launch RAD Studio
```bash
bun run index.ts
# or
bun start
```

### 3. Run Interactive Feature Demos
Explore pre-built executable demo applications demonstrating controls, events, dynamic helper functions, and the Declarative SimpleGUI engine:

| Demo Script | NPM Command | Description |
| :--- | :--- | :--- |
| **[demos/01_standard_controls.ts](demos/01_standard_controls.ts)** | `bun run demo:standard` | Standard UI controls, `onClick`/`onChange` events, input validation, and control locking. |
| **[demos/02_advanced_modern_controls.ts](demos/02_advanced_modern_controls.ts)** | `bun run demo:modern` | 10 modern visual controls & helper wrappers (Segmented, Stat Chart, Toast, Timeline, Tree View). |
| **[demos/03_data_and_non_visual.ts](demos/03_data_and_non_visual.ts)** | `bun run demo:data` | Data-Aware `DBGrid`, `DBNavigator`, non-visual `Timer` component (1000ms ticks), and Code View. |
| **[demos/04_window_placement_and_pin.ts](demos/04_window_placement_and_pin.ts)** | `bun run demo:window` | Native Window Placement API (9 screen presets), Always On Top pinning, and Fullscreen. |
| **[demos/05_crud_todo_table.ts](demos/05_crud_todo_table.ts)** | `bun run demo:table` / `bun run demo:crud` | Dynamic Table Control Studio (Add/Remove Rows & Columns, Filtering, Sorting, Payroll Stats). |
| **[demos/06_timer_control_studio.ts](demos/06_timer_control_studio.ts)** | `bun run demo:timer` | Non-Visual Timer Control Studio (onTimer tick loops, Clock, Telemetry Gauges, Countdown). |
| **[demos/07_labeled_form_and_desktop_controls.ts](demos/07_labeled_form_and_desktop_controls.ts)** | `bun run demo:desktop` | Labeled Form Controls (`form_field`, `form_password`) & Desktop Application UI Controls Studio. |
| **[demos/08_analytics_dashboard_template.ts](demos/08_analytics_dashboard_template.ts)** | `bun run demo:dashboard` | Executive Analytics Dashboard Template (Metric KPI Cards, Stat Charts, Alert Banners). |
| **[demos/09_file_explorer_ide_template.ts](demos/09_file_explorer_ide_template.ts)** | `bun run demo:ide` | Developer File Explorer & IDE Studio Template (Tree View, Workspace Tabs, Code View). |
| **[demos/10_db_studio_query_editor_template.ts](demos/10_db_studio_query_editor_template.ts)** | `bun run demo:db` | Database Studio & Query Editor Template (DB Navigator, DB-bound Data Grids, SQL View). |
| **[demos/11_app_settings_preferences_template.ts](demos/11_app_settings_preferences_template.ts)** | `bun run demo:settings` | Desktop Application Settings & Preferences Template (Tabs, Toggles, Sliders, Time Pickers). |
| **[demos/12_advanced_desktop_app_controls.ts](demos/12_advanced_desktop_app_controls.ts)** | `bun run demo:app_controls` | Additional 5 Desktop Application Controls Studio (Property Grid, Popup Menu, Calendar View). |
| **[demos/13_productivity_controls_studio.ts](demos/13_productivity_controls_studio.ts)** | `bun run demo:productivity` | Modern Productivity UI Controls Studio (Kanban Board, Hotkeys, Split Button, Sparklines). |
| **[demos/14_simplegui_fluent_form_demo.ts](demos/14_simplegui_fluent_form_demo.ts)** | `bun run demo:simplegui` | Declarative SimpleGUI Fluent Form Demo with method chaining and interactive events. |
| **[demos/15_simplegui_all_controls_showcase.ts](demos/15_simplegui_all_controls_showcase.ts)** | `bun run demo:simplegui_all` | Comprehensive SimpleGUI All-Controls Showcase across standard, labeled, and dashboard widgets. |
| **[demos/16_simplegui_parity_api_demo.ts](demos/16_simplegui_parity_api_demo.ts)** | `bun run demo:parity` | `vlang_simplegui` 100% API Parity showcase (`new_simple_window`, `add_input`, OS directories). |
| **[demos/17_simplegui_layout_types_showcase.ts](demos/17_simplegui_layout_types_showcase.ts)** | `bun run demo:layouts` | SimpleGUI Layout Showcase (Rows, Grids, Cards, Absolute Positioning, and Resizing). |
| **[demos/18_simplegui_ergonomics_demo.ts](demos/18_simplegui_ergonomics_demo.ts)** | `bun run demo:ergonomics` | SimpleGUI Ergonomics & Shortcuts API Showcase (Batch ops, value modifiers, JSON persistence). |

```bash
# Run any demo directly with Bun:
bun run demo:productivity
bun run demo:ergonomics
bun run demo:simplegui
```

---

## ⚡ 16 Enterprise Production Workstations & Utilities

In addition to RAD form design and UI demos, Bun RAD Studio provides a suite of **16 production-grade developer desktop workstations** engineered with zero Homebrew/external binary reliance. Each application includes detailed documentation in the [User Guides Directory](docs/userguides/README.md).

| # | Application | User Guide | Focus & Capabilities | Launch Command |
| :-: | :--- | :--- | :--- | :--- |
| **01** | **Database Studio Pro** | [User Guide](docs/userguides/01_database_studio.md) | SQLite editor, schema DDL introspection, query plans (`EXPLAIN`), CSV/JSON/SQL export. | `bun run app:database` |
| **02** | **System & Package Workstation** | [User Guide](docs/userguides/02_system_package_studio.md) | Hardware telemetry (RAM/CPUs/Uptime), Bun global cache analysis, npm/bun registry search. | `bun run app:system` |
| **03** | **Task Watcher Studio** | [User Guide](docs/userguides/03_task_watcher_studio.md) | Native `fs.watch` event pipeline, extension filters, ignore rules, continuous build console. | `bun run app:watcher` |
| **04** | **JSON Query Studio Pro** | [User Guide](docs/userguides/04_json_query_studio.md) | High-throughput JSON query engine, nested selectors, key projections, live query telemetry. | `bun run app:json` |
| **05** | **DevTools Studio Pro** | [User Guide](docs/userguides/05_devtools_studio.md) | 6-in-1 suite: Ripgrep code search, Fd file tree finder, Sd regex replace, Watcher, Trash, JQ. | `bun run app:devtools` |
| **06** | **Process Monitor Studio** | [User Guide](docs/userguides/06_process_monitor_studio.md) | macOS Activity Monitor inspection, PID search, CPU/RSS memory consumption, signal dispatch. | `bun run app:process` |
| **07** | **API Studio Pro** | [User Guide](docs/userguides/07_api_studio.md) | HTTP/REST client (GET/POST/PUT/DELETE/PATCH), Bearer/Basic/ApiKey auth, cURL generator. | `bun run app:api` |
| **08** | **Data Converter Studio** | [User Guide](docs/userguides/08_data_converter_studio.md) | Bidirectional transformer across CSV, TSV, JSON, YAML, Base64, and Markdown tables. | `bun run app:convert` |
| **09** | **Crypto Studio Pro** | [User Guide](docs/userguides/09_crypto_studio.md) | SHA-256/512, MD5, HMAC, AES-256-GCM encryption/decryption, JWT decoder, password entropy. | `bun run app:crypto` |
| **10** | **Regex Studio Pro** | [User Guide](docs/userguides/10_regex_studio.md) | Live regular expression tester, capture groups table, substitution preview, TypeScript export. | `bun run app:regex` |
| **11** | **App Bundler Studio** | [User Guide](docs/userguides/11_app_bundler_studio.md) | Standalone binary compiler via `bun build --compile`, cross-platform targets, macOS `.app`. | `bun run app:bundler` |
| **12** | **Network Forensics Studio** | [User Guide](docs/userguides/12_network_forensics_studio.md) | TCP socket port scanner (`node:net`), DNS records lookup (`A/AAAA/MX/TXT/NS`), HTTP TTFB. | `bun run app:network` |
| **13** | **Git Workbench Pro** | [User Guide](docs/userguides/13_git_workbench_studio.md) | Working tree status, visual diff viewer (`git diff / --staged`), commit log, stage, commit. | `bun run app:git` |
| **14** | **Markdown Studio Pro** | [User Guide](docs/userguides/14_markdown_studio.md) | Split-pane Markdown editor, instant live HTML preview, reading stats, standalone HTML export. | `bun run app:markdown` |
| **15** | **Color & Design Token Studio** | [User Guide](docs/userguides/15_color_token_studio.md) | HEX/RGB/HSL converter, WCAG 2.1 AA/AAA contrast auditor, 50–950 tonal scale, token export. | `bun run app:color` |
| **16** | **Environment Vault Studio** | [User Guide](docs/userguides/16_environment_vault_studio.md) | `.env` parser & validator, secret key detection & masking, diff against `.env.example`. | `bun run app:env` |

---

## 📦 Dist Build Process

Bun RAD Studio ships a full distribution build pipeline powered by [scripts/build.ts](scripts/build.ts). Three build targets are available:

### Commands

| Command | Description |
| --- | --- |
| `bun run build` | Bundle the library to `dist/` (ESM + source maps) |
| `bun run build:binary` | Compile a standalone native executable to `dist/bun_rad_studio` |
| `bun run build:all` | Run both library and binary targets |
| `bun run clean` | Remove the `dist/` directory |

### `dist/` Output Structure

```
dist/
├── index.js              # Main library bundle (ESM, minified)
├── index.js.map          # Source map
├── simplegui.js          # SimpleGUI standalone module bundle (ESM, minified)
├── simplegui.js.map      # Source map
├── libwebview-*.dll      # Native webview asset (Windows)
├── libwebview-*.dylib    # Native webview asset (macOS)
├── package.json          # Dist-ready manifest with exports map
├── README.md             # Documentation
├── API.md                # Visual RAD Designer API reference
├── SIMPLEGUI_API.md      # SimpleGUI API reference
├── src/
│   └── ide.html          # Complete RAD Designer Studio HTML5/CSS3/JS application
└── bun_rad_studio        # (build:binary only) standalone self-contained executable
```

### Importing from `dist/` in Another Bun Project

```typescript
// Main library (RAD Studio core + all helpers)
import { simplegui, setControlText, setWindowPosition } from "./dist/index.js";

// SimpleGUI module only
import { simplegui } from "./dist/simplegui.js";
```

The `dist/package.json` includes a full `exports` map so the package can be consumed with standard subpath imports after publishing:

```typescript
import { simplegui }  from "bun_rad_studio";           // → dist/index.js
import { simplegui }  from "bun_rad_studio/simplegui"; // → dist/simplegui.js
```

---

## 📦 Compiling Standalone macOS Binaries (.app) with Custom Icons

To package your applications into standalone, distribution-ready macOS `.app` bundles with custom application icons, display names, and `Info.plist` metadata, leverage the companion project [bun_webview](https://github.com/codecaine-zz/bun_webview).

### Option 1: Native Single-File Executable via `build:binary`

Use the built-in build script to compile a self-contained binary to `dist/`:

```bash
bun run build:binary
# → dist/bun_rad_studio  (native executable, no Bun runtime required)
```

Or using the Bun CLI directly without a macOS `.app` bundle structure:

```bash
bun build --compile index.ts
```

### Option 2: Full macOS `.app` Bundle with Custom Icons
To package your project into a complete macOS `.app` application bundle using [bun_webview](https://github.com/codecaine-zz/bun_webview):

1. **Clone the `bun_webview` builder repository**:
   ```bash
   git clone https://github.com/codecaine-zz/bun_webview.git
   cd bun_webview
   bun install
   ```

2. **Package your RAD application**:
   ```bash
   bun run build-app /path/to/your/index.ts --name "My Application" --icon /path/to/icon.png --identifier "com.example.myapp"
   ```

#### CLI Options:
* `-i, --icon <path>`: Path to a PNG icon (defaults to `resources/icon.png` or pre-built Apple-style glassmorphism icon templates).
* `-n, --name <name>`: Custom display name for the `.app` bundle (e.g. `--name "Customer Studio"`).
* `-d, --identifier <id>`: `CFBundleIdentifier` (e.g. `--identifier "com.company.app"`).
* `-v, --version <version>`: App version string (defaults to `package.json` version or `1.0.0`).
* `-o, --out <dir>`: Output directory for the `.app` bundle (defaults to `dist`).

#### Launching the Compiled App:
Launch your compiled `.app` bundle from macOS Finder in `dist/` or via terminal:
```bash
open "dist/My Application.app"
```

---

## 🎨 Declarative SimpleGUI Module (`simplegui`)

Build native desktop GUIs directly in TypeScript using an intuitive, fluent, event-driven API inspired by [vlang_simplegui](https://github.com/codecaine-zz/vlang_simplegui) — no visual designer required! For complete API docs, see the dedicated [SIMPLEGUI_API.md](SIMPLEGUI_API.md) reference.

![SimpleGUI Ergonomics & Shortcuts Showcase Screenshot](screenshot_ergonomics.png)

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Create a SimpleGUI window
const win = simplegui.createWindow("My SimpleGUI App", 760, 520, {
    theme: "apple_dark"
});

// 2. Add controls with fluent method chaining
win.addLabel("👤 User Account & Profile Setup")
   .font(20, "#38bdf8", "700");

win.beginCard("Personal Details");

win.beginRow();
win.addLabel("Full Name:").width(120);
win.addTextInput("e.g. Alex Mercer").id("txtName").width(260);
win.endRow();

win.beginRow();
win.addLabel("Plan:").width(120);
win.addDropdown(["Developer (Free)", "Pro ($19/mo)", "Enterprise ($99/mo)"], "Pro").id("cmbPlan").width(260);
win.endRow();

win.endCard();

// 3. Add interactive button with event callback & dialog prompt
win.addButton("🚀 Submit Profile", (w) => {
    const vals = w.getFormValues();
    w.showAlert(`✅ Profile created for ${vals.txtName || "User"} (${vals.cmbPlan})!`);
}).bg("#0284c7").color("#ffffff").bold().width(180).height(40);

// 4. Launch window
win.run();
```

### Key Features:
* **`vlang_simplegui` API Parity**: 100% API compatibility with `vlang_simplegui` (`new_simple_window()`, `add_input()`, `add_button()`, `hasControl()`, `listControls()`, `requireControl()`, `listThemes()`, `getTheme()`, `homeDir()`, `tempDir()`, `desktopDir()`, `documentsDir()`, `downloadsDir()`).
* **Multi-Window & Application Lifecycle**: Distinct `win.close()` / `win.close_window()` (closes current window handle without terminating process for multi-window support) and `win.exit()` / `win.quit()` / `win.exitApp()` / `win.quit_application()` (terminates process via `process.exit(code)`).
* **Fluent Method Chaining**: Chain styling & behavior modifiers (`.width()`, `.height()`, `.bg()`, `.color()`, `.bold()`, `.align()`, `.tooltip()`, `.onClick()`, `.onChange()`).
* **Form & Labeled Helpers**: `addFormField()`, `addFormPassword()`, `addFormDropdown()`, `addFormDatePicker()`, `addFormSwitch()`, `addFormSlider()`, `addFormNumber()`, `addHeading()`.
* **Typed Value Accessors**: `getText(id)`, `setText(id, val)`, `setHtml(id, html)`, `getBool(id)`, `setBool(id, val)`, `getInt(id)`, `setInt(id, val)`, `getFloat(id)`, `setFloat(id, val)`.
* **Media, Code & HTML Views**: `addHtmlView(id, initialHtml)` / `add_html_view(...)` for dedicated rich HTML/Markdown renderers, `addCodeView()`, `addImageView()`.
* **Real-Time Keystroke & Input Synchronization**: Immediate `oninput` bridge synchronization for `<input>` and `<textarea>` controls ensures typed values sync instantly to Bun's `formValuesStore` and trigger `onChange` listeners without requiring focus loss / blur.
* **Auto-Reflowing Layout Containers**: `beginRow()` / `endRow()`, `beginGrid(cols)`, `endGrid()`, `beginCard(title)`, `endCard()`, `beginFlex()`, `endFlex()`.
* **Form Value Serialization**: `win.getFormValues()`, `win.setFormValues()`, `win.getValue(id)`, `win.setValue(id, val)`.
* **Native Dialogs & OS APIs**: `showAlert()`, `showConfirm()`, `showPrompt()`, `copyToClipboard()`, `setAlwaysOnTop()`, `toggleFullscreen()`.
* **Non-Visual Timer Loop**: `win.addTimer(intervalMs, onTick)`.
* **Demos**: `bun run demo:simplegui`, `bun run demo:simplegui_all`, or `bun run demo:ergonomics`.

---

## 📚 Documentation Reference: API.md vs. SIMPLEGUI_API.md

**Bun RAD Studio** provides two distinct documentation guides depending on whether you are using the **Visual RAD Designer IDE** or the **Declarative `simplegui` Code-First Module**:

| Feature / Topic | 📖 [API.md](API.md) | 🎨 [SIMPLEGUI_API.md](SIMPLEGUI_API.md) |
| --- | --- | --- |
| **Primary Scope** | **Visual RAD Studio IDE & Core Engine** | **Declarative Code-First `simplegui` Module** |
| **Approach** | Drag-and-drop canvas, Object Inspector, visual layout grid | Pure TypeScript code layout with fluent method chaining |
| **Data Architecture** | `FormSpec` JSON schema, visual control properties, anchors & docking | `SimpleWindow` instance, auto-reflowing containers (`beginRow`, `beginCard`, `beginGrid`) |
| **IPC & Backend** | Low-level Webview IPC bindings (`wv.bind(...)`), runtime helper methods | High-level TypeScript methods (`getFormValues()`, `showAlert()`, `saveFormToFile()`) |
| **Code Exporters** | Multi-target generators (Bun TS, React + Tailwind, Vue 3, Python CustomTkinter, HTML5) | Direct native execution via Bun (`win.run()`) |
| **Target Use Case** | Visual app design, form spec JSON inspection, multi-framework exporting | Rapid code-driven desktop app development without a visual designer |

### 📖 Summary of API Files

* **[API.md](API.md)**: Technical specification for the **Visual RAD Designer Studio**. Documents the `FormSpec` JSON data schema, 70+ visual component definitions, low-level Webview IPC protocol, window placement APIs, and code generator architectures.
* **[SIMPLEGUI_API.md](SIMPLEGUI_API.md)**: Beginner-friendly developer reference for the **Declarative `simplegui` Module**. Documents window creation, reflowing card/grid/row layouts, fluent styling modifiers, popups/dialogs, timers, group operations, state helpers, and JSON settings persistence.

---

## ⌨️ Keyboard Shortcuts & Power Actions

| Shortcut | Action |
| --- | --- |
| **F5** | Launch Live App Preview Window |
| **⌘ + F** / **Ctrl + F** / **Fn + F** / **F11** | Toggle Native Borderless Fullscreen Mode |
| **⌘ + M** / **Ctrl + M** / **Alt + M** | Minimize Application Window (auto-exits fullscreen space) |
| **⌘ + H** / **Ctrl + H** | Hide Application Window (`[NSApp hide:]`) |
| **⌘ + Shift + T** / **Ctrl + Shift + T** / **Alt + T** | Toggle Always on Top (Window Pinning) |
| **⌘ + Shift + C** / **Ctrl + Shift + C** | Center Window on Screen |
| **⌘ + Q** / **⌘ + W** / **Alt + F4** / **Ctrl + Q** | Terminate & Quit Application (`process.exit(0)`) |
| **Alt + Alt** (Double-tap Alt) | Fast Close & Terminate Application |
| **Cmd / Ctrl + (+ / - / 0)** | Zoom in, Zoom out, Reset zoom (100%) |
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
| **Escape** | Exit Fullscreen / Deselect controls / Close modals |

---

## 📂 Project Structure

```
bun_rad_studio/
├── index.ts           # Main Bun entry point, FFI Window Manager & Webview IPC runner
├── package.json       # Dependencies, scripts (build, build:binary, build:all, clean, demos)
├── tsconfig.json      # TypeScript compiler settings
├── API.md             # Visual RAD Designer API & FormSpec JSON Schema Specification
├── SIMPLEGUI_API.md   # Declarative Code-First SimpleGUI API Guide & Reference
├── README.md          # Main Documentation & User Guide
├── scripts/
│   └── build.ts       # Dist build orchestrator (lib + binary targets)
├── src/
│   ├── ide.html       # Complete RAD Designer Studio HTML5/CSS3/JS Application
│   └── simplegui.ts   # Declarative SimpleGUI module
├── demos/             # 18 Executable demo applications (bun run demo:*)
├── tests/             # Comprehensive test suite (bun test)
└── dist/              # Build output (generated by bun run build)
    ├── index.js       # Bundled ESM library
    ├── simplegui.js   # Bundled SimpleGUI module
    ├── src/ide.html   # Copied RAD Studio asset
    └── bun_rad_studio # Standalone binary (bun run build:binary)
```

---

## 🌟 Related RAD & GUI Ecosystem Projects

| Project | Description | Primary Use Case |
| :--- | :--- | :--- |
| **[bun_rad_studio](https://github.com/codecaine-zz/bun_rad_studio)** | Full-stack Rapid Application Development (RAD) visual designer and code studio powered by Bun, TypeScript, and modern web UI technologies. | Full-stack desktop & client web applications, rapid UI prototyping, and visual form design. |
| **[bun_simplcli](https://github.com/codecaine-zz/bun_simplcli)** | Zero-dependency, high-performance console utility framework & RAD toolkit built natively for the Bun runtime (cross-platform OS system telemetry, hardware resource monitoring, ANSI styling, interactive prompts, spinners, progress meters, data tables, and logging). | Headless CLI tools, system administration utilities, terminal dashboards, and DevOps automation scripts in Bun (headless companion to Bun RAD Studio). |
| **[vlang_simplegui](https://github.com/codecaine-zz/vlang_simplegui)** | Lightweight, high-productivity cross-platform desktop GUI toolkit and visual designer for the V programming language with 100% API parity. | Native desktop GUI applications, rapid UI prototyping, and cross-platform desktop utilities in V. |
| **[vlang_simplecli](https://github.com/codecaine-zz/vlang_simplecli)** | Zero-dependency, high-productivity console & terminal RAD toolkit for V (ANSI colors, banners, spinners, progress meters, data tables, safe execution). | Headless CLI tools, DevOps automation scripts, and terminal dashboards (headless companion to SimpleGUI in V). |
| **[simple_gg](https://github.com/codecaine-zz/simple_gg)** | Lightweight, hardware-accelerated 2D game & graphics engine with an immediate-mode GUI toolkit written in V. | 2D games, custom canvas widgets, interactive data visualizers, and creative coding. |
| **[bun_webview](https://github.com/codecaine-zz/bun_webview)** | Standalone macOS `.app` packager and native webview window runtime for Bun applications with custom icons, Cocoa menus, and distribution bundling. | Packaging Bun TypeScript/JavaScript apps into native standalone macOS application bundles. |

---

## 📄 License

MIT License © Codecaine
