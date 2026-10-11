# 🔄 Sd Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Regex Stream Substitution  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:sd]  •  [Terminal CLI: bun run cli:sd]
```

---

## 🌟 Executive Overview
**Sd Studio Pro** is an intuitive, visual find-and-replace desktop workstation built natively for Bun. Designed as a modern, safe, and visual replacement for `sed`, it features real-time regular expression substitution with capture groups (`$1`, `$2`), literal string mode, unified side-by-side diff previews, automatic `.bak` backups, and batch file modifications across projects.

No more deciphering cryptic sed escaping like `sed -i '' 's/old/new/g'`. Sd Studio Pro gives you a visual preview of every change before writing a single byte to disk.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:sd
```

### 2. Launch Terminal CLI Find-and-Replace
```bash
# Replace text across files with preview
bun run cli:sd "oldEndpoint" "newEndpoint" ./src/*.ts --preview

# Apply replacement with automatic backup
bun run cli:sd "http://localhost:3000" "https://api.prod.com" config.json --backup
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Sd Studio Desktop](../../screenshots/apps/sd_studio_desktop.png) | ![Sd Studio Responsive](../../screenshots/apps/sd_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Pattern & Replacement Bar
- **Find Pattern**: Regular expression or literal text to search.
- **Replace With**: New replacement text (supports `$1`, `$2` backreferences).
- **Target Files / Glob**: Target files to modify (e.g. `./src/**/*.ts`).
- **Options**:
  - **Literal Mode (-s)**: Disables regex meta-characters for exact string replacements.
  - **Create Backup (-b)**: Writes original copy to `<file>.bak` before replacing.
  - **Case-Insensitive (-i)**: Matches regardless of capitalization.

### 2. Live Unified Diff Preview Pane
- Shows exact diff hunks with colored line additions (green) and deletions (red).
- Match count indicator and file count summary.

### 3. Execution Action Bar
- **🔍 Preview Changes**: Evaluates replacements in memory without touching files.
- **⚡ Apply Replacements**: Writes modified files to disk safely.
