# ⚡ Bun RAD Studio (Delphi / Visual Basic Style IDE)

A high-performance Rapid Application Development (RAD) Visual IDE for **Bun** and **Webview-Bun**, inspired by classic Borland Delphi and Visual Basic 6, built with modern web technologies.

![Bun RAD Studio Architecture](https://img.shields.value/badge/Bun-v1.3.14-orange?style=for-the-badge&logo=bun)
![Webview-Bun](https://img.shields.value/badge/Webview--Bun-v2.4.0-blue?style=for-the-badge)
![TypeScript](https://img.shields.value/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)

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

### 🗄️ MS Access & Delphi Data-Aware RAD Controls
* **Data-Aware Controls**: Access & Delphi style DB controls including `DBGrid` with sorting/paging, `DBNavigator` (First/Prev/Next/Last/Add/Delete/Post/Refresh), `DBInput`, and `DBDropdown` with live dataset field bindings.
* **1-Click Database CRUD Form Wizard**: Instant 1-click wizard button that auto-generates a complete, ready-to-run Customer Accounts Database CRUD layout.

### 🎨 35+ Modern UI & RAD Controls
* **Standard Controls**: Buttons, Labels, Single-Line Inputs, Password Inputs, Textareas, Checkboxes, Radio Buttons, Toggles/Switches, Sliders, Number Steppers, Color Wells, Date Pickers, and File Pickers.
* **Data & Non-Visual Controls**: DB Grid, DB Navigator, DB Field, DB Lookup, Timer, File Dialogs, DB Connection, REST HTTP Client, Notification.
* **Advanced Visual Controls**: Progress Bars, SVG Circular Gauges, Star Ratings, Badges, Status Indicators, Metric KPI Cards, Alert Banners, Syntax Code Views, File Drop Zones, and Tag Chips.
* **Containers & Layout**: Group Box Panels, Data Tables, and Horizontal Dividers.
* **Form Presets & Templates**: Includes pre-built templates for Customer Registration, Auth Login, Executive Analytics Dashboard, User Profile, Data CRUD Manager, Help Desk Support Tickets, REST API Tester, Media Player, and E-Commerce Checkout.

### 📐 Precision Alignment & Layout Tools
* **Single-Control Alignment**: Instantly snap a control to the Left, Center H, Right, Top, Center V, or Bottom edge of the form canvas.
* **Multi-Control Alignment Toolbar**: Select multiple controls to align their left, right, top, or bottom edges, center horizontally/vertically, or equalize width/height.
* **Size Equalization**: Match selected controls' width or height to the primary control, or equalize to **Widest**, **Narrowest**, **Tallest**, or **Shortest**.

### ✏️ In-Studio Event Handler Code Editor
* **Dual-Tab Object Inspector**: Separate `Properties` and `Events` tabs in the Object Inspector, complete with detailed tooltip hints for every single property and event.
* **Component Tooltips**: Dropping a control from the palette automatically assigns it a descriptive tooltip explaining its purpose and API method.
* **Interactive Code Editor Modal**: Double-click any event (`onClick`, `onChange`, `onDoubleClick`, `onTimer`, `onHover`, `onHoverExit`, `onFocus`, `onBlur`, `onKeyDown`, `onKeyUp`, `onMouseDown`, `onMouseUp`) to open an in-studio script code editor modal with syntax highlighting and pre-built code snippets.

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

---

## ⌨️ Keyboard Shortcuts & Power Actions

| Shortcut | Action |
| --- | --- |
| **F5** | Launch Live App Preview Window |
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
├── index.ts          # Main Bun entry point & Webview IPC runner
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
