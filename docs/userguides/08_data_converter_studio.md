# 🔄 Data Converter Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Pure TypeScript Data Transformers  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:convert]  •  [Terminal CLI: bun run cli:convert]
```

---

## 🌟 Executive Overview
**Data Converter Studio Pro** is an enterprise-grade multi-format data interchange workstation designed to seamlessly convert, clean, and inspect structured datasets across **CSV, TSV, JSON, JSON Lines (ndjson), YAML, TOML, XML, SQL INSERT Statements, HTML Tables, PHP Arrays, Python Dicts, Base64, and Markdown Tables**. Engineered with pure TypeScript data transformers, it eliminates external online conversion sites that compromise data privacy.

Whether converting spreadsheet exports into typed JSON, generating SQL migration seeds, transforming API payloads into Markdown documentation tables, or encoding assets to Base64, Data Converter Studio provides instant, real-time bidirectional conversion with full undo/redo history, clipboard integration, file importing, and drag-and-drop support.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:convert

# Shorthand alias
bun run app:dataconvert
```

### 2. Launch Terminal CLI Converter Mode
```bash
# Convert CSV file to JSON in terminal
bun run cli:convert input.csv --to json

# Convert JSON to Markdown table
bun run cli:convert users.json --to markdown
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Data Converter Desktop](../../screenshots/apps/dataconvert_studio_desktop.png) | ![Data Converter Responsive](../../screenshots/apps/dataconvert_studio_responsive.png) |

---

## ⚡ Elite Editing & Workflow Features

### 1. ↩️ Undo & ↪️ Redo History Stack
- **Multi-Level History**: Every edit, paste, format swap, sample load, file import, and text transformation is recorded into an undo stack.
- **1-Click Buttons**: Dedicated `↩️ Undo` (`btn_undo`) and `↪️ Redo` (`btn_redo`) buttons with toast notifications showing what action was undone/redone.
- **Keyboard Shortcuts**: Standard <kbd>Ctrl+Z</kbd> / <kbd>Cmd+Z</kbd> for Undo and <kbd>Ctrl+Y</kbd> / <kbd>Cmd+Shift+Z</kbd> for Redo.

### 2. 📋 Intelligent Clipboard Integration
- **📋 Paste Clipboard (`btn_paste`)**: Instantly pastes text from your operating system clipboard into the input pane.
- **Smart Auto-Detection**: Inspects pasted content and automatically adjusts the Source Format dropdown:
  - `{` or `[` ➔ Auto-selects **JSON**
  - `<` and `>` ➔ Auto-selects **XML**
  - `|` and `\n|` ➔ Auto-selects **Markdown Table**
  - Tabs (`\t`) ➔ Auto-selects **TSV**
  - Commas (`,`) ➔ Auto-selects **CSV**
- **📋 Copy to Clipboard**: Dedicated buttons for copying transformed output (`btn_copy_output`) and source input (`btn_copy_input`) with character count toast confirmation.

### 3. 🔍 Select All Actions
- **Input (`btn_select_all_input`)**: Selects the entire source document with 1 click for rapid replacement or inspection.
- **Output (`btn_select_all_output`)**: Selects the entire converted output text.

### 4. 📂 File Import & Drag-and-Drop
- **📂 Import File (`btn_import`)**: Opens a native OS file dialog filtering for `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, `.yaml`, `.yml`, `.toml`, `.xml`, `.md`, and `.txt`.
- **Automatic Extension Detection**: Selecting a file auto-sets the format and triggers immediate conversion.
- **Drag-and-Drop**: Drag any data file from your desktop or file explorer directly onto Data Converter Studio Pro to load and convert instantly.

### 5. 🎲 Curated Dataset Presets & Helpers
- **Preset Datasets**: Instant 1-click loading of realistic multi-column production datasets:
  - `Employees Directory (CSV)`
  - `E-Commerce Orders (JSON)`
  - `Server Access Logs (TSV)`
  - `Cloud Infrastructure Config (YAML)`
  - `Financial Performance Metrics (Markdown Table)`
  - `Product Catalog (XML)`
- **✨ Beautify Input (`btn_beautify`)**: Formats JSON with 2-space indentation or cleans up table whitespace.
- **⚡ Minify Input (`btn_minify`)**: Strips whitespace for compact API payloads.
- **🧹 Clear Input (`btn_clear_input`)**: Resets workspace with undo safety.

### 6. 📊 Real-Time Document Telemetry & Grid Filtering
- **Input Telemetry (`lbl_input_stats`)**: Live line, word, character, and kilobyte counters.
- **Output Telemetry (`lbl_output_stats`)**: Live output character metrics, conversion latency in ms, and compression/expansion ratio (e.g. `-28%`).
- **Tabular Grid Search (`txt_grid_search`)**: Type keywords to dynamically filter rows displayed in the Structured Record View table in real time.

---

## 🧭 Supported Data Formats Matrix

| Format | Source Support | Target Support | Key Capabilities |
| :--- | :---: | :---: | :--- |
| **JSON** | ✅ | ✅ | Standard 2-space indented array of objects. |
| **JSON (Minified)** | ❌ | ✅ | Single-line compact JSON representation for production network calls. |
| **JSON Lines (ndjson)**| ✅ | ✅ | Streamable 1-JSON-object-per-line format. |
| **CSV** | ✅ | ✅ | RFC 4180 compliant with escaped commas, quotes and newlines. |
| **TSV** | ✅ | ✅ | Tab-separated values, ideal for pasting to/from Google Sheets and Excel. |
| **Markdown Table** | ✅ | ✅ | GitHub Flavored Markdown (GFM) pipe tables with headers and separators. |
| **HTML Table** | ❌ | ✅ | Semantic `<table>`, `<thead>`, `<tbody>` markup with CSS classes. |
| **SQL INSERT** | ❌ | ✅ | Standard ANSI SQL `INSERT INTO \`dataset\` (...) VALUES (...);` scripts. |
| **YAML** | ✅ | ✅ | Clean YAML list of key-value maps. |
| **TOML** | ✅ | ✅ | TOML document format with `[[records]]` arrays. |
| **XML** | ✅ | ✅ | Structured XML `<records><record>...</record></records>` output. |
| **PHP Array** | ❌ | ✅ | Native associative PHP array syntax. |
| **Python Dict** | ❌ | ✅ | Native Python list of dictionaries. |
| **Base64** | ✅ | ✅ | Binary and text Base64 encoding / decoding. |
| **URL Encoded** | ✅ | ✅ | Percent-encoded query parameters and URI components. |

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Global | Force immediate document conversion |
| **Cmd + Z** / **Ctrl + Z** | Input Pane | Undo last edit or transformation |
| **Cmd + Shift + Z** / **Ctrl + Y** | Global | Redo previously undone action |
| **Cmd + Shift + C** | Output Pane | Copy converted data to clipboard |
| **Cmd + Shift + X** | Global | Swap Source and Target formats |
| **F11** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Never Upload Sensitive Data to Web Converters**: Commercial web converters frequently log user data. Data Converter Studio Pro runs 100% offline in local memory—ideal for converting proprietary databases, PII, financial spreadsheets, and credentials safely.
