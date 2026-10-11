# 📝 Markdown Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native GFM Parser & HTML Renderer  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:markdown]  •  [Terminal CLI: bun run cli:markdown]
```

---

## 🌟 Executive Overview
**Markdown Studio Pro** is an Apple-grade split-pane Markdown editor, document generator, and technical documentation studio built natively for Bun RAD Studio. It combines a distraction-free monospace Markdown editor with a synchronized, pixel-perfect GitHub Flavored Markdown (GFM) preview pane.

It features live word and character counters, estimated reading times, interactive task lists, syntax-highlighted code blocks, and one-click export to standalone, beautifully styled HTML documents.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:markdown
```

### 2. Launch Terminal CLI Markdown Exporter
```bash
# Render markdown file to styled standalone HTML
bun run cli:markdown README.md -o ./dist/README.html
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Markdown Studio Desktop](../../screenshots/apps/markdown_studio_desktop.png) | ![Markdown Studio Responsive](../../screenshots/apps/markdown_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Editor Toolbar & Document Statistics
- **Document Telemetry Pill**: Live count of Words, Characters, Paragraphs, and Estimated Reading Time (e.g. `1,240 words • 5 min read`).
- **Formatting Chips**: One-click insertion chips for Bold (`**`), Italic (`*`), Headers (`#`), Tables, Code Blocks (````), and Checkboxes (`- [ ]`).
- **💾 Export HTML**: Generates a self-contained, offline HTML file with embedded typography and dark-mode styles.

### 2. Synchronized Dual-Pane Workspace
- **Editor (Left Pane)**: Fast textarea with line wrapping, tab indentation, and undo/redo support.
- **Live Preview (Right Pane)**: Rendered GFM preview with custom typography, clean tables, blockquotes, and alerts.
