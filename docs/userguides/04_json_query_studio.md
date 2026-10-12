# 🔍 JSON Query Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Pure TypeScript/Bun AST Query Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:json]  •  [Terminal CLI: bun run cli:json]
```

---

## 🌟 Executive Overview
**JSON Query Studio Pro** is an enterprise-grade JSON inspection, transformation, projection, and formatting workbench. Powered by a pure TypeScript recursive query evaluation engine, it provides rich, `jq`-compatible selector syntax without requiring Homebrew, C compilers, or external `jq` binaries.

It handles multi-megabyte payloads effortlessly, supports nested path extraction, array slicing, dictionary projections, key sorting, and minification, complete with one-click export to clipboard or disk.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:json

# Shorthand alias
bun run app:jq
```

### 2. Launch Terminal CLI Query Mode
```bash
# Query JSON file directly in terminal
bun run cli:json package.json ".scripts"

# Filter array of objects in terminal
bun run cli:json data.json ".users[] | {name: .name, email: .email}"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![JSON Studio Desktop](../../screenshots/apps/json_studio_desktop.png) | ![JSON Studio Responsive](../../screenshots/apps/json_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Query Configuration & Selector Bar
- **Query Expression Input**: Type your selector (e.g. `.`, `.users[]`, `.data.items[0:5]`, `keys`, `length`).
- **Presets Dropdown**: Pre-built one-click queries:
  - Identity (`.`)
  - Top-Level Keys (`keys`)
  - Array Length (`length`)
  - First 5 Items (`.[0:5]`)
  - Key-Value Projection (`.[] | {id: .id, name: .name}`)
- **⚡ Execute Query Button**: Runs the evaluation in microseconds.

### 2. Dual-Pane JSON Workspace
- **Source JSON Editor (Left Pane)**: Multi-line text area with syntax validation, line numbers, sample payload loader, and file upload button.
- **Transformed Result Output (Right Pane)**: Formatted, color-highlighted output viewer displaying filtered results.
- **Telemetry Pill**: Displays input byte size, result byte size, and query execution time in microseconds.

### 3. Document Tools (File I/O, Formatting, Conversion, Search)
- **📂 Open File... / 🌐 Load URL...**: Load a `.json`, `.geojson`, `.txt` or `.csv` file (CSV is converted to JSON automatically) or fetch JSON from an http(s) URL.
- **💾 Save Output... / 💾 Save Input...**: Save either pane to disk (the output defaults to `.csv` / `.yaml` when you converted it). **📋 Copy Output** copies it to the clipboard.
- **⇄ Output → Input**: Moves the result into the input pane so you can chain queries. **🗑 Clear** empties everything.
- **✨ Format / 🗜 Minify / 🔤 Sort Keys**: Re-indent the input (**Indent**: 2 spaces, 4 spaces or Tab), strip all whitespace, or sort object keys alphabetically at every level.
- **✔ Validate**: Checks the input and reports the **line and column** of the first syntax error. Invalid input is also reported by every other tool.
- **📊 Stats**: Size in bytes, nesting depth and counts of objects, arrays, keys, strings, numbers, booleans and nulls.
- **Convert Output**: **→ CSV** (array of objects becomes a table), **→ YAML**, and **CSV Input → JSON** for pasted CSV.
- **Find**: Search every key and value; matching jq-style paths (e.g. `.modules[2].status`) are listed in the console and the output pane.
- **Compact Output / Live Query**: Print results on a single line, or re-run the query automatically as you type.

### 4. Supported Query Syntax
- **Paths & iteration**: `.a.b`, `.items[0]`, `.items[]`, `.items[].name`, `[ ... ]` array wrapping, and `|` pipelines.
- **Filtering**: `select(.lines > 2000)`, `select(.status == "stable" and .lines < 3000)`, `select(.name | contains("x"))`, with `==  !=  >  <  >=  <=`, `and`, `or`, `not`.
- **Transforms**: `map`, `sort`, `sort_by`, `unique`, `unique_by`, `group_by`, `min_by`, `max_by`, `del(.key)`, `to_entries`, `from_entries`, `keys`, `values`, `add`, `length`, `flatten`, `any`, `all`, and the alternative operator `.a // "default"`.
- **Strings**: `contains`, `startswith`, `endswith`, `test("regex")`, `split`, `join`, `ltrimstr`, `rtrimstr`, `ascii_downcase`, `ascii_upcase`, `tostring`, `tonumber`.
- **JavaScript mode**: start with `$` (e.g. `$.modules.map(m => m.name.toUpperCase())`) for full JavaScript expressions.
- **External jq**: choose **External jq CLI** in the Engine dropdown to use the real `jq` binary if it is installed.
---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Filtering and Re-Projecting an API Response
1. Paste this JSON payload into the left editor:
   ```json
   {
     "status": "success",
     "users": [
       { "id": 1, "name": "Alice", "role": "admin", "secret": "x99" },
       { "id": 2, "name": "Bob", "role": "developer", "secret": "y44" }
     ]
   }
   ```
2. In the query bar, type:
   ```text
   .users[] | {id: .id, name: .name}
   ```
3. Press **Cmd+Enter**. The output instantly displays:
   ```json
   [
     { "id": 1, "name": "Alice" },
     { "id": 2, "name": "Bob" }
   ]
   ```
   Notice the `secret` field is stripped cleanly!

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Query Bar / Editor | Execute active query |
| **Cmd + P** / **Ctrl + P** | Left Editor | Format / Pretty-Print JSON |
| **Cmd + M** / **Ctrl + M** | Left Editor | Minify JSON |
| **Cmd + Shift + C** | Output Pane | Copy result to clipboard |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Validating Broken JSON**: If an API returns malformed JSON, paste it into the left editor and hit **Format**. The diagnostic banner points to the exact line and character where a trailing comma or missing quote occurred.
- **Large Dataset Slicing**: When inspecting large 50MB log dumps, use array slice notation `.[0:10]` to examine sample records without locking up your browser.
