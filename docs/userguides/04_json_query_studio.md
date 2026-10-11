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

### 3. Formatting & Utility Toolbar
- **Format / Pretty-Print**: Re-indents the active JSON with standardized 2-space indentation.
- **Minify / Compact**: Strips all whitespace, tabs, and newlines for optimized network payloads.
- **📋 Copy Result**: Copies transformed JSON to clipboard with tactile feedback.
- **💾 Export File**: Saves output directly to disk.

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
