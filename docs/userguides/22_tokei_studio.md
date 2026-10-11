# 📊 Tokei Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Multi-Language Code Classifier  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:tokei]  •  [Terminal CLI: bun run cli:tokei]
```

---

## 🌟 Executive Overview
**Tokei Studio Pro** is a fast code statistics, lines of code (LOC), and codebase composition analyzer built natively for Bun RAD Studio. Replacing external `tokei` and `cloc` binaries, it rapidly classifies source files across **50+ programming languages**, counting total files, code lines, comment lines, and blank lines.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:tokei

# Terminal CLI code counter
bun run cli:tokei ./src
bun run cli:tokei ./ --json
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Tokei Studio Desktop](../../screenshots/apps/tokei_studio_desktop.png) | ![Tokei Studio Responsive](../../screenshots/apps/tokei_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide
- **Language Composition Chart**: Visual proportion breakdown showing percentage of TypeScript, V, C++, CSS, HTML, and Markdown.
- **Metrics Table**: Displays Language, Total Files, Blank Lines, Comment Lines, Code Lines, and Comment-to-Code ratio.
- **Export Options**: One-click export to Markdown summary tables or structured JSON reports.
